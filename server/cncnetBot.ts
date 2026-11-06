import net from 'net';
import tls from 'tls';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

export interface GameDefinition {
  code: 'RA';
  name: 'Command & Conquer: Red Alert 1';
  packageRepo: 'https://github.com/CnCNet/cncnet-ra-client-package';
  lobbyChannel: string;
  announcementChannel: string;
  lobbyChannelKey: string;
  defaultMaps: string[];
  defaultTitle: string;
  defaultMaxPlayers: number;
}

export const RA1_DEFINITION: GameDefinition = {
  code: 'RA',
  name: 'Command & Conquer: Red Alert 1',
  packageRepo: 'https://github.com/CnCNet/cncnet-ra-client-package',
  lobbyChannel: '#cncnet-ra',
  announcementChannel: '#cncnet-ra-games',
  lobbyChannelKey: 'ra1-derp',
  defaultMaps: [
    'Path Beyond (2-4)',
    'North by Northwest (2-4)',
    'Keep off the Grass (2-4)',
    'Behind the Veil (2-4)',
    'Casserole (2-6)',
    'Bullseye (2-4)',
    'Marooned (2-4)',
    'River Raid (2-4)',
    'Gold Rush (2-4)',
    'Middle Ground (2-4)',
    'Island Hop (2-4)',
    'Coastal Influence (2-4)',
  ],
  defaultTitle: '[RA1] CnCNet AutoHost - Fast 1v1/2v2 [All Welcome]',
  defaultMaxPlayers: 4,
};

export interface RoomPlayer {
  nick: string;
  slot: number;
  isReady: boolean;
  isHost: boolean;
  joinedAt: string;
  hostmask?: string;
  votedMap?: string;
}

export interface HostedRoom {
  id: string;
  gameType: 'RA';
  gameTitle: string;
  channel: string;
  announcementChannel: string;
  lobbyChannel: string;
  password?: string;
  maxPlayers: number;
  currentMap: string;
  mapPool: string[];
  gameSpeed: number; // 1 to 6 (default 5 for RA1)
  startingCredits: number; // $10,000 standard
  bases: boolean;
  oreRegenerates: boolean;
  crates: boolean;
  fogOfWar: boolean;
  shroud: boolean;
  status: 'WAITING';
  players: RoomPlayer[];
  mapVotes: Record<string, number>;
  createdAt: string;
  lastActivityAt: string;
}

export interface CnCNetBotConfig {
  server: string;
  servers: string[];
  port: number;
  useSsl: boolean;
  nick: string;
  realName: string;
  announcementChannel: string;
  autoReconnect: boolean;
  reconnectIntervalSec: number;
  maxReconnectIntervalSec: number;
  announcementIntervalSec: number;
  welcomeMessage: string;
}

export interface HostingLogEntry {
  id: string;
  timestamp: string;
  type: 'ROOM_CREATED' | 'ROOM_CLOSED' | 'PLAYER_JOIN' | 'PLAYER_PART' | 'PLAYER_READY' | 'MAP_CHANGED' | 'SYSTEM' | 'ERROR';
  roomId?: string;
  channel?: string;
  nick?: string;
  message: string;
  details?: string;
}

export interface ChatMessageEntry {
  id: string;
  timestamp: string;
  roomId?: string;
  channel: string;
  sender: string;
  message: string;
  isBot: boolean;
}

export class CnCNetAutoHostBot {
  private config: CnCNetBotConfig;
  private socket: net.Socket | tls.TLSSocket | null = null;
  private state: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'REGISTERED' | 'RECONNECTING' = 'DISCONNECTED';
  private currentNick: string;
  private connectedSince: Date | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingWatchdogTimer: NodeJS.Timeout | null = null;
  private announcementTimer: NodeJS.Timeout | null = null;
  private lastActivityAt = Date.now();
  private nextReconnectAt: Date | null = null;
  private currentServerIndex = 0;

  // Active Hosted Rooms for RA1
  private rooms: Map<string, HostedRoom> = new Map();

  // Logs and Chat History
  private hostingLogs: HostingLogEntry[] = [];
  private chatLogs: ChatMessageEntry[] = [];
  private readonly maxMemoryLogs = 1000;

  private logsDir: string;
  private hostingLogFile: string;
  private activityLogFile: string;

  private stats = {
    totalRoomsCreated: 0,
    totalPlayersServed: 0,
    totalReconnects: 0,
    uptimeSeconds: 0,
  };

  constructor(customConfig?: Partial<CnCNetBotConfig>) {
    this.config = {
      server: 'irc.cncnet.org',
      servers: [
        'irc.cncnet.org',
        'irc.gamesurge.net',
        'prothid.ny.us.gamesurge.net',
        'chicago.il.us.gamesurge.net',
      ],
      port: 6667,
      useSsl: false,
      nick: 'RA1_AutoHost',
      realName: 'CnCNet Red Alert 1 AutoHost Bot',
      announcementChannel: '#cncnet-ra-games',
      autoReconnect: true,
      reconnectIntervalSec: 5,
      maxReconnectIntervalSec: 60,
      announcementIntervalSec: 15,
      welcomeMessage: 'Welcome to this RA1 IRC room! Type !maps to view maps and !vote to vote for the next map.',
      ...customConfig,
    };

    this.currentNick = this.config.nick;

    // Logs directory
    this.logsDir = path.resolve(process.cwd(), 'logs');
    if (!fs.existsSync(this.logsDir)) {
      try {
        fs.mkdirSync(this.logsDir, { recursive: true });
      } catch (err) {
        console.error('Failed to create logs directory:', err);
      }
    }

    this.hostingLogFile = path.join(this.logsDir, 'cncnet_hosting.log');
    this.activityLogFile = path.join(this.logsDir, 'cncnet_activity.log');

    // Uptime counter
    setInterval(() => {
      if (this.state === 'CONNECTED' || this.state === 'REGISTERED') {
        if (this.connectedSince) {
          this.stats.uptimeSeconds = Math.floor((Date.now() - this.connectedSince.getTime()) / 1000);
        }
      }
    }, 1000);

    // Initial default RA1 room
    this.createRoom({
      gameTitle: '[RA1] CnCNet AutoHost - Fast 1v1/2v2 [All Welcome]',
      maxPlayers: 4,
      currentMap: 'Path Beyond (2-4)',
      gameSpeed: 5,
      startingCredits: 10000,
      bases: true,
      oreRegenerates: true,
      crates: false,
      fogOfWar: true,
      shroud: true,
    });

    this.logSystem(`CnCNet RA1 IRC room bot initialized. Game-list channel: ${this.config.announcementChannel}`);
  }

  // ======================== CONFIG & STATUS ========================

  public getConfig(): CnCNetBotConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<CnCNetBotConfig>) {
    this.config = { ...this.config, ...newConfig };
    this.logSystem(`Config updated: Server=${this.config.server}, Nick=${this.config.nick}, Channel=${this.config.announcementChannel}`);
  }

  public getStatus() {
    return {
      state: this.state,
      server: this.config.server,
      port: this.config.port,
      nick: this.currentNick,
      announcementChannel: this.config.announcementChannel,
      connectedSince: this.connectedSince ? this.connectedSince.toISOString() : null,
      reconnectAttempts: this.reconnectAttempts,
      nextReconnectAt: this.nextReconnectAt ? this.nextReconnectAt.toISOString() : null,
      stats: { ...this.stats },
      rooms: Array.from(this.rooms.values()),
      gameDefinition: RA1_DEFINITION,
    };
  }

  public getRooms(): HostedRoom[] {
    return Array.from(this.rooms.values());
  }

  public getRoom(id: string): HostedRoom | undefined {
    return this.rooms.get(id);
  }

  public getHostingLogs(limit = 200): HostingLogEntry[] {
    return this.hostingLogs.slice(-limit);
  }

  public getChatLogs(channel?: string, limit = 200): ChatMessageEntry[] {
    if (channel) {
      return this.chatLogs.filter((m) => m.channel.toLowerCase() === channel.toLowerCase()).slice(-limit);
    }
    return this.chatLogs.slice(-limit);
  }

  public getLogFilePath(type: 'hosting' | 'activity'): string {
    return type === 'hosting' ? this.hostingLogFile : this.activityLogFile;
  }

  public clearLogs() {
    this.hostingLogs = [];
    this.chatLogs = [];
    try {
      fs.writeFileSync(this.hostingLogFile, `--- RA1 LOG RESET: ${new Date().toISOString()} ---\n`, 'utf8');
      fs.writeFileSync(this.activityLogFile, `--- RA1 LOG RESET: ${new Date().toISOString()} ---\n`, 'utf8');
    } catch (err) {
      console.error('Error resetting logs:', err);
    }
  }

  // ======================== IRC CONNECTION ========================

  public connect() {
    if (this.socket && !this.socket.destroyed) {
      this.socket.destroy();
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.nextReconnectAt = null;

    const targetServer =
      this.config.servers && this.config.servers.length > 0
        ? this.config.servers[this.currentServerIndex % this.config.servers.length]
        : this.config.server;

    this.state = 'CONNECTING';
    this.currentNick = this.config.nick;
    this.lastActivityAt = Date.now();

    this.logHosting('SYSTEM', `Connecting to CnCNet IRC server: ${targetServer}:${this.config.port} (SSL=${this.config.useSsl})...`);

    try {
      const connectOptions = {
        host: targetServer,
        port: this.config.port,
      };

      if (this.config.useSsl) {
        this.socket = tls.connect(connectOptions, () => this.onConnected());
      } else {
        this.socket = net.connect(connectOptions, () => this.onConnected());
      }

      this.socket.setEncoding('utf8');
      this.socket.setTimeout(60000);

      let buffer = '';
      this.socket.on('data', (chunk: string) => {
        this.lastActivityAt = Date.now();
        buffer += chunk;
        const lines = buffer.split('\r\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim().length > 0) {
            this.handleIrcLine(line);
          }
        }
      });

      this.socket.on('timeout', () => {
        this.sendRaw(`PING :KeepAlive_${Date.now()}`);
      });

      this.socket.on('error', (err: Error) => {
        this.logHosting('ERROR', `Socket error: ${err.message}`);
        this.handleDisconnect('Socket error: ' + err.message);
      });

      this.socket.on('close', (hadError: boolean) => {
        this.logHosting('SYSTEM', `Socket closed ${hadError ? 'with error' : 'cleanly'}`);
        this.handleDisconnect(hadError ? 'Closed with error' : 'Closed cleanly');
      });

      this.startPingWatchdog();
      this.startAnnouncementLoop();
    } catch (err: any) {
      this.logHosting('ERROR', `Connection instantiation error: ${err.message}`);
      this.handleDisconnect(err.message);
    }
  }

  public disconnect(reason = 'Operator requested shutdown', keepAutoReconnect = false) {
    if (!keepAutoReconnect) {
      this.config.autoReconnect = false;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.nextReconnectAt = null;

    if (this.pingWatchdogTimer) {
      clearInterval(this.pingWatchdogTimer);
      this.pingWatchdogTimer = null;
    }
    if (this.announcementTimer) {
      clearInterval(this.announcementTimer);
      this.announcementTimer = null;
    }

    if (this.socket && !this.socket.destroyed) {
      this.sendRaw(`QUIT :${reason}`);
      setTimeout(() => {
        if (this.socket && !this.socket.destroyed) {
          this.socket.destroy();
        }
      }, 1000);
    }

    this.state = 'DISCONNECTED';
    this.connectedSince = null;
    this.logHosting('SYSTEM', `Bot disconnected: ${reason}`);
  }

  public forceReconnect() {
    this.config.autoReconnect = true;
    this.reconnectAttempts = 0;
    this.disconnect('Manual reconnect requested', true);
    setTimeout(() => {
      this.connect();
    }, 1500);
  }

  public sendRaw(command: string) {
    if (this.socket && !this.socket.destroyed && this.socket.writable) {
      this.socket.write(command + '\r\n');
      this.logActivity('OUTGOING', command);
    } else {
      this.logActivity('ERROR', `Cannot send, socket not writable: ${command}`);
    }
  }

  private onConnected() {
    this.state = 'CONNECTED';
    this.connectedSince = new Date();
    this.reconnectAttempts = 0;
    this.logHosting('SYSTEM', `Connected to CnCNet server! Registering nick '${this.currentNick}' for RA1...`);

    this.sendRaw(`NICK ${this.currentNick}`);
    this.sendRaw(`USER ${this.currentNick} 0 * :${this.config.realName}`);
  }

  // ======================== IRC LINE PARSER ========================

  private getRoomChannelKey(room: HostedRoom): string {
    return room.password || createHash('sha1').update(room.channel).digest('hex').substring(0, 10);
  }

  private handleIrcLine(line: string) {
    this.logActivity('INCOMING', line);

    if (line.startsWith('PING ')) {
      const payload = line.substring(5);
      this.sendRaw(`PONG ${payload}`);
      return;
    }

    let prefix = '';
    let trailing = '';
    let rest = line;

    if (rest.startsWith(':')) {
      const firstSpace = rest.indexOf(' ');
      if (firstSpace !== -1) {
        prefix = rest.substring(1, firstSpace);
        rest = rest.substring(firstSpace + 1);
      }
    }

    const trailingIndex = rest.indexOf(' :');
    if (trailingIndex !== -1) {
      trailing = rest.substring(trailingIndex + 2);
      rest = rest.substring(0, trailingIndex);
    }

    const parts = rest.trim().split(/\s+/);
    const command = parts[0]?.toUpperCase();
    const params = parts.slice(1);

    let senderNick = '';
    let senderHostmask = '';
    if (prefix) {
      const bangIndex = prefix.indexOf('!');
      if (bangIndex !== -1) {
        senderNick = prefix.substring(0, bangIndex);
        senderHostmask = prefix.substring(bangIndex + 1);
      } else {
        senderNick = prefix;
      }
    }

    // 001 RPL_WELCOME - Registered
    if (command === '001') {
      this.state = 'REGISTERED';
      this.logHosting('SYSTEM', `Registered on CnCNet IRC as '${this.currentNick}'. Joining RA1 lobby and game-list channels...`);

      this.sendRaw(`JOIN ${RA1_DEFINITION.lobbyChannel} ${RA1_DEFINITION.lobbyChannelKey}`);
      this.sendRaw(`JOIN ${this.config.announcementChannel}`);

      // 3. Join all active room channels
      this.joinAllActiveRooms();
      return;
    }

    // 433 ERR_NICKNAMEINUSE
    if (command === '433') {
      const alternateNick = `${this.config.nick}_${Math.floor(Math.random() * 900 + 100)}`;
      this.logHosting('SYSTEM', `Nick '${this.currentNick}' in use. Trying alternate '${alternateNick}'...`);
      this.currentNick = alternateNick;
      this.sendRaw(`NICK ${this.currentNick}`);
      return;
    }

    // 475 ERR_BADCHANNELKEY - If key failed
    if (command === '475') {
      const targetChan = params[1] || '';
      this.logHosting('ERROR', `Cannot join ${targetChan}: IRC rejected the channel key. Check the channel/key configuration.`);
      return;
    }

    // JOIN - User joined a channel
    if (command === 'JOIN') {
      const joinedChannel = (trailing || params[0] || '').toLowerCase();

      // Check if joined channel is the announcement channel
      if (joinedChannel === this.config.announcementChannel.toLowerCase()) {
        if (senderNick.toLowerCase() === this.currentNick.toLowerCase()) {
          this.logHosting('SYSTEM', `Bot successfully joined ${this.config.announcementChannel} without a key!`);
          // Broadcast rooms to #cncnet-ra-games
          for (const room of this.rooms.values()) {
            this.broadcastGameAnnouncement(room);
          }
        }
        return;
      }

      // Check if joined channel matches one of our active RA1 game rooms
      for (const room of this.rooms.values()) {
        if (room.channel.toLowerCase() === joinedChannel) {
          if (senderNick.toLowerCase() === this.currentNick.toLowerCase()) {
            this.logHosting('SYSTEM', `Bot entered RA1 room channel ${room.channel}`, {
              roomId: room.id,
              channel: room.channel,
            });
            this.sendRaw(`MODE ${room.channel} +klnNs ${this.getRoomChannelKey(room)} ${room.maxPlayers}`);
            this.sendRoomTopic(room);
            this.broadcastGameAnnouncement(room);
          } else {
            this.handlePlayerJoin(room, senderNick, senderHostmask);
          }
          break;
        }
      }
      return;
    }

    // PART / QUIT / KICK - User left
    if (command === 'PART' || command === 'QUIT' || command === 'KICK') {
      let targetNick = senderNick;
      let channelTarget = (params[0] || '').toLowerCase();
      if (command === 'KICK' && params.length >= 2) {
        channelTarget = params[0].toLowerCase();
        targetNick = params[1];
      }

      for (const room of this.rooms.values()) {
        const matchesRoom = room.channel.toLowerCase() === channelTarget || command === 'QUIT';
        if (matchesRoom) {
          this.handlePlayerLeave(room, targetNick, trailing || 'Left RA1 match room');
        }
      }
      return;
    }

    if (command === '353') {
      const channel = (params[2] || '').toLowerCase();
      const room = Array.from(this.rooms.values()).find((item) => item.channel.toLowerCase() === channel);
      if (room && trailing) {
        for (const entry of trailing.split(/\s+/)) {
          const nick = entry.replace(/^[@+%&~]+/, '');
          if (nick && nick.toLowerCase() !== this.currentNick.toLowerCase()) {
            this.handlePlayerJoin(room, nick, '');
          }
        }
      }
      return;
    }

    if (command === 'NOTICE') {
      const target = params[0] || '';
      const text = trailing.trim();
      if (target.toLowerCase() === this.currentNick.toLowerCase() && text.startsWith('\x01') && text.endsWith('\x01')) {
        this.handleCtcpQuery(senderNick, text.slice(1, -1));
      }
      return;
    }

    // PRIVMSG - In-room chat or CTCP
    if (command === 'PRIVMSG') {
      const target = params[0] || '';
      const text = trailing.trim();

      // CTCP query (\x01PING, \x01VERSION, \x01TIME)
      if (text.startsWith('\x01') && text.endsWith('\x01')) {
        this.handleCtcpQuery(senderNick, text.slice(1, -1));
        return;
      }

      // In-room chat message
      for (const room of this.rooms.values()) {
        if (room.channel.toLowerCase() === target.toLowerCase()) {
          this.recordChat({
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toISOString(),
            roomId: room.id,
            channel: room.channel,
            sender: senderNick,
            message: text,
            isBot: senderNick.toLowerCase() === this.currentNick.toLowerCase(),
          });

          if (text.startsWith('!')) {
            this.handlePlayerCommand(room, senderNick, text);
          }
          break;
        }
      }
      return;
    }
  }

  // ======================== RA1 ROOM MANAGEMENT ========================

  public createRoom(options: Partial<HostedRoom>): HostedRoom {
    const randomSuffix = Math.floor(Math.random() * 9000000 + 1000000);
    const channelName = options.channel || `#cncnet-ra-game${randomSuffix}`;

    const newRoom: HostedRoom = {
      id: Math.random().toString(36).substring(2, 9),
      gameType: 'RA',
      gameTitle: options.gameTitle || RA1_DEFINITION.defaultTitle,
      channel: channelName,
      announcementChannel: this.config.announcementChannel,
      lobbyChannel: RA1_DEFINITION.lobbyChannel,
      password: options.password || undefined,
      maxPlayers: options.maxPlayers || RA1_DEFINITION.defaultMaxPlayers,
      currentMap: options.currentMap || RA1_DEFINITION.defaultMaps[0],
      mapPool: options.mapPool && options.mapPool.length > 0 ? options.mapPool : [...RA1_DEFINITION.defaultMaps],
      gameSpeed: options.gameSpeed || 5,
      startingCredits: options.startingCredits || 10000,
      bases: options.bases !== undefined ? options.bases : true,
      oreRegenerates: options.oreRegenerates !== undefined ? options.oreRegenerates : true,
      crates: options.crates !== undefined ? options.crates : false,
      fogOfWar: options.fogOfWar !== undefined ? options.fogOfWar : true,
      shroud: options.shroud !== undefined ? options.shroud : true,
      status: 'WAITING',
      players: [],
      mapVotes: {},
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    };

    this.rooms.set(newRoom.id, newRoom);
    this.stats.totalRoomsCreated++;

    this.logHosting('ROOM_CREATED', `Created RA1 IRC room '${newRoom.gameTitle}' on ${newRoom.channel}`, {
      roomId: newRoom.id,
      channel: newRoom.channel,
      details: `Map: ${newRoom.currentMap}, Max: ${newRoom.maxPlayers}`,
    });

    if (this.state === 'REGISTERED') {
      this.joinRoomChannel(newRoom);
      this.broadcastGameAnnouncement(newRoom);
    }

    return newRoom;
  }

  public closeRoom(roomId: string, reason = 'Host closed room') {
    const room = this.rooms.get(roomId);
    if (!room) return;

    this.sendRoomMessage(room, `[HOST] Red Alert 1 room is being closed: ${reason}`);

    if (this.state === 'REGISTERED') {
      this.broadcastGameAnnouncement(room, true);
      this.sendRaw(`PART ${room.channel} :${reason}`);
    }

    this.rooms.delete(roomId);
    this.logHosting('ROOM_CLOSED', `RA1 room ${room.channel} closed.`, { roomId: room.id, details: reason });
  }

  public updateRoomSettings(roomId: string, updates: Partial<HostedRoom>) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');

    if (updates.gameTitle) room.gameTitle = updates.gameTitle;
    if (updates.currentMap) {
      room.currentMap = updates.currentMap;
      this.sendRoomMessage(room, `[MAP] Map changed to: ${room.currentMap}`);
    }
    if (updates.maxPlayers) room.maxPlayers = updates.maxPlayers;
    if (updates.gameSpeed) room.gameSpeed = updates.gameSpeed;
    if (updates.startingCredits) room.startingCredits = updates.startingCredits;
    if (updates.bases !== undefined) room.bases = updates.bases;
    if (updates.oreRegenerates !== undefined) room.oreRegenerates = updates.oreRegenerates;
    if (updates.crates !== undefined) room.crates = updates.crates;
    if (updates.fogOfWar !== undefined) room.fogOfWar = updates.fogOfWar;
    if (updates.shroud !== undefined) room.shroud = updates.shroud;
    if (updates.password !== undefined) room.password = updates.password || undefined;

    this.sendRoomTopic(room);
    this.broadcastGameAnnouncement(room);
  }

  private joinAllActiveRooms() {
    for (const room of this.rooms.values()) {
      this.joinRoomChannel(room);
    }
  }

  private joinRoomChannel(room: HostedRoom) {
    this.logHosting('SYSTEM', `Joining RA1 room ${room.channel}...`);
    this.sendRaw(`JOIN ${room.channel} ${this.getRoomChannelKey(room)}`);
  }

  private sendRoomTopic(room: HostedRoom) {
    this.sendRaw(`TOPIC ${room.channel} :B;ra`);
  }

  private sendRoomMessage(room: HostedRoom, text: string) {
    this.sendRaw(`PRIVMSG ${room.channel} :${text}`);
    this.recordChat({
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      roomId: room.id,
      channel: room.channel,
      sender: this.currentNick,
      message: text,
      isBot: true,
    });
  }

  public broadcastGameAnnouncement(room: HostedRoom, closed = false) {
    if (this.state !== 'REGISTERED') return;

    const gameVersion = process.env.CNCNET_RA1_GAME_VERSION?.trim();
    const mapSha1 = process.env.CNCNET_RA1_MAP_SHA1?.trim();
    if (!gameVersion || !mapSha1) {
      this.logHosting('ERROR', 'Game-list advertisement skipped: set CNCNET_RA1_GAME_VERSION and CNCNET_RA1_MAP_SHA1 to the exact values from the installed RA1 client/map.');
      return;
    }

    const flags = `0${room.password ? '1' : '0'}${closed ? '1' : '0'}00`;
    const players = room.players.map((player) => player.nick).join(',');
    const tunnel = '[DYN]';
    const mapName = process.env.CNCNET_RA1_MAP_NAME?.trim() || room.currentMap;
    const gameMode = process.env.CNCNET_RA1_GAME_MODE || 'Standard';
    const skill = process.env.CNCNET_RA1_SKILL || '1';
    const gameOptions = process.env.CNCNET_RA1_GAME_OPTIONS || '';
    const difficulty = process.env.CNCNET_RA1_DIFFICULTY || '-1';
    const fields = [
      'B', gameVersion, String(room.maxPlayers), room.channel, room.gameTitle,
      flags, players, mapName, gameMode, tunnel, '0', skill,
      mapSha1, gameOptions, difficulty,
    ];

    this.sendRaw(`PRIVMSG ${this.config.announcementChannel} :\x01GAME ${fields.join(';')}\x01`);
  }

  private handlePlayerJoin(room: HostedRoom, nick: string, hostmask: string) {
    if (room.players.some((p) => p.nick.toLowerCase() === nick.toLowerCase())) {
      return;
    }

    if (room.players.length >= room.maxPlayers) {
      this.sendRoomMessage(room, `[RA1 HOST] Room is full (${room.players.length}/${room.maxPlayers}).`);
      this.sendRaw(`KICK ${room.channel} ${nick} :Room is full`);
      return;
    }

    const newSlot = room.players.length + 1;
    const player: RoomPlayer = {
      nick,
      slot: newSlot,
      isReady: false,
      isHost: false,
      joinedAt: new Date().toISOString(),
      hostmask,
    };

    room.players.push(player);
    this.stats.totalPlayersServed++;

    this.logHosting('PLAYER_JOIN', `Player '${nick}' joined RA1 room ${room.channel} (Slot ${newSlot}/${room.maxPlayers})`, {
      roomId: room.id,
      channel: room.channel,
      nick,
      details: hostmask,
    });

    // Voice (+v) so the player can talk in channel
    this.sendRaw(`MODE ${room.channel} +v ${nick}`);

    // Welcome message and rules
    this.sendRoomMessage(room, `Welcome ${nick}! [Slot ${newSlot}/${room.maxPlayers}] | Map: ${room.currentMap} | Speed: ${room.gameSpeed} | Credits: $${room.startingCredits}`);
    this.sendRoomMessage(room, `Commands: !ready, !unready, !maps, !vote <map>, !status, !help`);

    this.sendRoomTopic(room);
    this.broadcastGameAnnouncement(room);
  }

  private handlePlayerLeave(room: HostedRoom, nick: string, reason: string) {
    const initialLen = room.players.length;
    room.players = room.players.filter((p) => p.nick.toLowerCase() !== nick.toLowerCase());

    if (room.players.length !== initialLen) {
      this.logHosting('PLAYER_PART', `Player '${nick}' left ${room.channel}`, {
        roomId: room.id,
        channel: room.channel,
        nick,
        details: reason,
      });

      this.sendRoomMessage(room, `[LOBBY] ${nick} departed (${room.players.length}/${room.maxPlayers} remaining).`);

      this.sendRoomTopic(room);
      this.broadcastGameAnnouncement(room);
    }
  }

  private handlePlayerCommand(room: HostedRoom, senderNick: string, text: string) {
    const parts = text.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    const arg = parts.slice(1).join(' ').trim();

    const player = room.players.find((p) => p.nick.toLowerCase() === senderNick.toLowerCase());

    switch (cmd) {
      case '!ready':
      case '!r': {
        if (!player) return;
        player.isReady = true;
        const readyCount = room.players.filter((p) => p.isReady).length;
        this.sendRoomMessage(room, `[READY] ${senderNick} is READY! (${readyCount}/${room.players.length} ready)`);

        this.logHosting('PLAYER_READY', `Player '${senderNick}' marked ready in ${room.channel}`, {
          roomId: room.id,
          channel: room.channel,
          nick: senderNick,
        });

        break;
      }

      case '!unready':
      case '!ur': {
        if (!player) return;
        player.isReady = false;
        this.sendRoomMessage(room, `[UNREADY] ${senderNick} is no longer ready.`);
        break;
      }

      case '!maps': {
        const poolList = room.mapPool.map((m, i) => `${i + 1}. ${m}`).join(' | ');
        this.sendRoomMessage(room, `[RA1 MAPS] Current: ${room.currentMap} | Pool: ${poolList}`);
        break;
      }

      case '!vote': {
        if (!arg) {
          this.sendRoomMessage(room, `[VOTE] Usage: !vote <Map Name or #> (e.g. !vote North by Northwest or !vote 2)`);
          return;
        }

        let matchedMap: string | undefined;
        const num = parseInt(arg, 10);
        if (!isNaN(num) && num >= 1 && num <= room.mapPool.length) {
          matchedMap = room.mapPool[num - 1];
        } else {
          matchedMap = room.mapPool.find((m) => m.toLowerCase().includes(arg.toLowerCase()));
        }

        if (!matchedMap) {
          this.sendRoomMessage(room, `[VOTE] Map '${arg}' not found. Type !maps to view the list.`);
          return;
        }

        if (player) {
          player.votedMap = matchedMap;
        }

        room.mapVotes = {};
        for (const p of room.players) {
          if (p.votedMap) {
            room.mapVotes[p.votedMap] = (room.mapVotes[p.votedMap] || 0) + 1;
          }
        }

        const votesForThis = room.mapVotes[matchedMap] || 1;
        this.sendRoomMessage(room, `[VOTE] ${senderNick} voted for '${matchedMap}' (${votesForThis} vote(s)).`);

        if (votesForThis > room.players.length / 2) {
          room.currentMap = matchedMap;
          this.sendRoomMessage(room, `[MAP SWITCH] Majority voted! Map changed to: ${room.currentMap}`);
          this.sendRoomTopic(room);
          this.broadcastGameAnnouncement(room);
        }
        break;
      }

      case '!status':
      case '!info': {
        const readyList = room.players.map((p) => `${p.nick} ${p.isReady ? '[✓ Ready]' : '[...Waiting]'}`).join(', ');
        this.sendRoomMessage(room, `[STATUS] Map: ${room.currentMap} | Players (${room.players.length}/${room.maxPlayers}): ${readyList || 'None'}`);
        this.sendRoomMessage(room, `Settings: Speed ${room.gameSpeed} | Credits ${room.startingCredits}`);
        break;
      }

      case '!roll': {
        const val = Math.floor(Math.random() * 100) + 1;
        this.sendRoomMessage(room, `[DICE] ${senderNick} rolled ${val} (1-100)`);
        break;
      }

      case '!help': {
        this.sendRoomMessage(room, `[RA1 COMMANDS] !ready, !unready, !maps, !vote <map>, !status, !roll, !help`);
        break;
      }

    }
  }

  // ======================== CTCP ========================

  private handleCtcpQuery(senderNick: string, ctcpCommand: string) {
    const upper = ctcpCommand.toUpperCase().trim();
    if (upper === 'VERSION') {
      this.sendRaw(`NOTICE ${senderNick} :\x01VERSION CnCNet Red Alert 1 Client AutoHost Bot v2.4 (cncnet-ra-client-package)\x01`);
    } else if (upper.startsWith('PING')) {
      const pingPayload = ctcpCommand.substring(4).trim();
      this.sendRaw(`NOTICE ${senderNick} :\x01PING ${pingPayload}\x01`);
    } else if (upper === 'TIME') {
      this.sendRaw(`NOTICE ${senderNick} :\x01TIME ${new Date().toISOString()}\x01`);
    }
  }

  // ======================== TIMERS & WATCHDOG ========================

  private startAnnouncementLoop() {
    if (this.announcementTimer) {
      clearInterval(this.announcementTimer);
    }

    this.announcementTimer = setInterval(() => {
      if (this.state === 'REGISTERED') {
        for (const room of this.rooms.values()) {
          this.broadcastGameAnnouncement(room);
        }
      }
    }, Math.max(30, this.config.announcementIntervalSec) * 1000);
  }

  private startPingWatchdog() {
    if (this.pingWatchdogTimer) {
      clearInterval(this.pingWatchdogTimer);
    }

    this.pingWatchdogTimer = setInterval(() => {
      if (this.state === 'CONNECTED' || this.state === 'REGISTERED') {
        const timeSinceLastActivity = Date.now() - this.lastActivityAt;

        if (timeSinceLastActivity > 45000) {
          this.sendRaw(`PING :KeepAlive_${Date.now()}`);
        }

        if (timeSinceLastActivity > 105000) {
          this.logHosting('ERROR', 'Watchdog: No response from IRC for > 105s. Force reconnecting...');
          if (this.socket) {
            this.socket.destroy();
          }
          this.handleDisconnect('Keepalive timeout');
        }
      }
    }, 15000);
  }

  private handleDisconnect(reason: string) {
    if (this.state === 'DISCONNECTED' || this.state === 'RECONNECTING') {
      return;
    }

    this.state = 'DISCONNECTED';
    this.connectedSince = null;

    if (this.pingWatchdogTimer) {
      clearInterval(this.pingWatchdogTimer);
      this.pingWatchdogTimer = null;
    }
    if (this.announcementTimer) {
      clearInterval(this.announcementTimer);
      this.announcementTimer = null;
    }

    if (this.config.autoReconnect) {
      this.reconnectAttempts++;
      this.stats.totalReconnects++;

      const delaySec = Math.min(
        this.config.reconnectIntervalSec * Math.pow(1.5, Math.min(this.reconnectAttempts - 1, 6)),
        this.config.maxReconnectIntervalSec
      );

      this.state = 'RECONNECTING';
      this.nextReconnectAt = new Date(Date.now() + delaySec * 1000);

      this.logHosting('SYSTEM', `Connection lost: ${reason}. Auto-reconnecting in ${Math.round(delaySec)}s (Attempt #${this.reconnectAttempts})...`);

      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.nextReconnectAt = null;
        this.currentServerIndex++;
        this.connect();
      }, delaySec * 1000);
    }
  }

  private logHosting(type: HostingLogEntry['type'], message: string, extra?: Partial<HostingLogEntry>) {
    const entry: HostingLogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      type,
      message,
      ...extra,
    };

    this.hostingLogs.push(entry);
    if (this.hostingLogs.length > this.maxMemoryLogs) {
      this.hostingLogs.shift();
    }

    try {
      const line = `[${entry.timestamp}] [${entry.type}] ${entry.channel ? `[${entry.channel}] ` : ''}${entry.message} ${entry.details ? `(${entry.details})` : ''}\n`;
      fs.appendFileSync(this.hostingLogFile, line, 'utf8');
    } catch (err) {
      // ignore
    }
  }

  private logActivity(type: 'INCOMING' | 'OUTGOING' | 'SYSTEM' | 'ERROR', message: string) {
    try {
      const line = `[${new Date().toISOString()}] [${type}] ${message}\n`;
      fs.appendFileSync(this.activityLogFile, line, 'utf8');
    } catch (err) {
      // ignore
    }
  }

  private logSystem(message: string) {
    this.logHosting('SYSTEM', message);
  }

  private recordChat(chat: ChatMessageEntry) {
    this.chatLogs.push(chat);
    if (this.chatLogs.length > this.maxMemoryLogs) {
      this.chatLogs.shift();
    }
  }

  public simulateEvent(type: 'SIM_PLAYER_JOIN' | 'SIM_PLAYER_READY' | 'SIM_PLAYER_LEAVE' | 'SIM_PLAYER_CHAT', payload: any = {}) {
    const roomId = payload.roomId || Array.from(this.rooms.keys())[0];
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('No active RA1 room found');

    switch (type) {
      case 'SIM_PLAYER_JOIN': {
        const nick = payload.nick || `Soviet_Commander_${Math.floor(Math.random() * 89 + 10)}`;
        this.handlePlayerJoin(room, nick, `${nick.toLowerCase()}!client@ra.cncnet.org`);
        break;
      }
      case 'SIM_PLAYER_READY': {
        const player = room.players[0] || { nick: 'Allied_General', isReady: false, slot: 1, joinedAt: new Date().toISOString() };
        this.handlePlayerCommand(room, player.nick, '!ready');
        break;
      }
      case 'SIM_PLAYER_LEAVE': {
        const leaving = room.players[room.players.length - 1];
        if (leaving) {
          this.handlePlayerLeave(room, leaving.nick, 'User closed client');
        }
        break;
      }
      case 'SIM_PLAYER_CHAT': {
        const msg = payload.message || 'gl hf commanders! ready';
        const sender = payload.nick || (room.players[0] ? room.players[0].nick : 'Soviet_General');
        this.recordChat({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toISOString(),
          roomId: room.id,
          channel: room.channel,
          sender,
          message: msg,
          isBot: false,
        });
        if (msg.startsWith('!')) {
          this.handlePlayerCommand(room, sender, msg);
        }
        break;
      }
    }
  }
}
