import net from 'net';
import tls from 'tls';
import fs from 'fs';
import path from 'path';

export interface GameDefinition {
  code: 'RA';
  name: 'Command & Conquer: Red Alert 1';
  packageRepo: 'https://github.com/CnCNet/cncnet-ra-client-package';
  lobbyChannel: string;
  announcementChannel: string;
  announcementChannelKey: string;
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
  announcementChannelKey: 'ra1-derp',
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

export interface TunnelNode {
  name: string;
  region: string;
  host: string;
  port: number;
}

export const CNCNET_TUNNELS: TunnelNode[] = [
  { name: 'Frankfurt (EU)', region: 'Europe', host: 'tunnel.cncnet.org', port: 50000 },
  { name: 'New York (US-East)', region: 'North America', host: 'ny.cncnet.org', port: 50000 },
  { name: 'San Jose (US-West)', region: 'North America', host: 'sj.cncnet.org', port: 50000 },
  { name: 'London (UK)', region: 'Europe', host: 'uk.cncnet.org', port: 50000 },
  { name: 'Amsterdam (EU)', region: 'Europe', host: 'nl.cncnet.org', port: 50000 },
  { name: 'Singapore (Asia)', region: 'Asia-Pacific', host: 'sg.cncnet.org', port: 50000 },
  { name: 'Direct P2P', region: 'Local / Peer-to-Peer', host: '0.0.0.0', port: 0 },
];

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
  announcementChannelKey: string;
  lobbyChannel: string;
  password?: string;
  maxPlayers: number;
  minPlayersToLaunch: number;
  currentMap: string;
  mapPool: string[];
  gameSpeed: number; // 1 to 6 (default 5 for RA1)
  startingCredits: number; // $10,000 standard
  bases: boolean;
  oreRegenerates: boolean;
  crates: boolean;
  fogOfWar: boolean;
  shroud: boolean;
  tunnel: TunnelNode;
  status: 'WAITING' | 'COUNTDOWN' | 'PLAYING' | 'FINISHED';
  countdownSeconds: number | null;
  countdownTimerId?: any;
  players: RoomPlayer[];
  mapVotes: Record<string, number>;
  createdAt: string;
  lastActivityAt: string;
  matchStartedAt?: string;
  autoRehostOnFinish: boolean;
  autoLaunchWhenReady: boolean;
}

export interface CnCNetBotConfig {
  server: string;
  servers: string[];
  port: number;
  useSsl: boolean;
  nick: string;
  realName: string;
  announcementChannel: string;
  announcementChannelKey: string;
  autoReconnect: boolean;
  reconnectIntervalSec: number;
  maxReconnectIntervalSec: number;
  announcementIntervalSec: number;
  welcomeMessage: string;
}

export interface HostingLogEntry {
  id: string;
  timestamp: string;
  type: 'ROOM_CREATED' | 'ROOM_CLOSED' | 'PLAYER_JOIN' | 'PLAYER_PART' | 'PLAYER_READY' | 'COUNTDOWN_STARTED' | 'COUNTDOWN_CANCELLED' | 'MATCH_LAUNCHED' | 'MAP_CHANGED' | 'SYSTEM' | 'ERROR';
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
    totalMatchesLaunched: 0,
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
      announcementChannelKey: 'ra1-derp',
      autoReconnect: true,
      reconnectIntervalSec: 5,
      maxReconnectIntervalSec: 60,
      announcementIntervalSec: 15,
      welcomeMessage: 'Welcome to this RA1 auto-hosted room! Type !ready when prepared. Type !maps to vote for next map.',
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
      minPlayersToLaunch: 2,
      currentMap: 'Path Beyond (2-4)',
      gameSpeed: 5,
      startingCredits: 10000,
      bases: true,
      oreRegenerates: true,
      crates: false,
      fogOfWar: true,
      shroud: true,
      tunnel: CNCNET_TUNNELS[0],
      autoLaunchWhenReady: true,
      autoRehostOnFinish: true,
    });

    this.logSystem(`CnCNet RA1 AutoHost Bot initialized. Target: ${this.config.announcementChannel} (key: ${this.config.announcementChannelKey})`);
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
      announcementChannelKey: this.config.announcementChannelKey,
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
      this.logHosting('SYSTEM', `Registered on CnCNet IRC as '${this.currentNick}'. Joining ${this.config.announcementChannel} with key '${this.config.announcementChannelKey}'...`);

      // 1. Join main games announcement channel with password 'ra1-derp'
      this.sendRaw(`JOIN ${this.config.announcementChannel} ${this.config.announcementChannelKey}`);

      // 2. Also join RA1 general lobby
      this.sendRaw(`JOIN ${RA1_DEFINITION.lobbyChannel}`);

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
      this.logHosting('ERROR', `Cannot join ${targetChan}: Incorrect channel key (+k). Re-trying with key '${this.config.announcementChannelKey}'...`);
      this.sendRaw(`JOIN ${this.config.announcementChannel} ${this.config.announcementChannelKey}`);
      return;
    }

    // JOIN - User joined a channel
    if (command === 'JOIN') {
      const joinedChannel = (trailing || params[0] || '').toLowerCase();

      // Check if joined channel is the announcement channel
      if (joinedChannel === this.config.announcementChannel.toLowerCase()) {
        if (senderNick.toLowerCase() === this.currentNick.toLowerCase()) {
          this.logHosting('SYSTEM', `Bot successfully joined ${this.config.announcementChannel} with key '${this.config.announcementChannelKey}'!`);
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
            this.sendRoomTopic(room);
            this.sendRaw(`MODE ${room.channel} +tn`);
            if (room.password) {
              this.sendRaw(`MODE ${room.channel} +k ${room.password}`);
            }
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
    const randomSuffix = Math.floor(Math.random() * 9000 + 1000);
    const channelName = options.channel || `#cncnet-ra-game-${randomSuffix}`;

    const newRoom: HostedRoom = {
      id: Math.random().toString(36).substring(2, 9),
      gameType: 'RA',
      gameTitle: options.gameTitle || RA1_DEFINITION.defaultTitle,
      channel: channelName,
      announcementChannel: this.config.announcementChannel,
      announcementChannelKey: this.config.announcementChannelKey,
      lobbyChannel: RA1_DEFINITION.lobbyChannel,
      password: options.password || undefined,
      maxPlayers: options.maxPlayers || RA1_DEFINITION.defaultMaxPlayers,
      minPlayersToLaunch: options.minPlayersToLaunch || 2,
      currentMap: options.currentMap || RA1_DEFINITION.defaultMaps[0],
      mapPool: options.mapPool && options.mapPool.length > 0 ? options.mapPool : [...RA1_DEFINITION.defaultMaps],
      gameSpeed: options.gameSpeed || 5,
      startingCredits: options.startingCredits || 10000,
      bases: options.bases !== undefined ? options.bases : true,
      oreRegenerates: options.oreRegenerates !== undefined ? options.oreRegenerates : true,
      crates: options.crates !== undefined ? options.crates : false,
      fogOfWar: options.fogOfWar !== undefined ? options.fogOfWar : true,
      shroud: options.shroud !== undefined ? options.shroud : true,
      tunnel: options.tunnel || CNCNET_TUNNELS[0],
      status: 'WAITING',
      countdownSeconds: null,
      players: [],
      mapVotes: {},
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      autoRehostOnFinish: options.autoRehostOnFinish !== undefined ? options.autoRehostOnFinish : true,
      autoLaunchWhenReady: options.autoLaunchWhenReady !== undefined ? options.autoLaunchWhenReady : true,
    };

    this.rooms.set(newRoom.id, newRoom);
    this.stats.totalRoomsCreated++;

    this.logHosting('ROOM_CREATED', `Spawned RA1 room '${newRoom.gameTitle}' on ${newRoom.channel}`, {
      roomId: newRoom.id,
      channel: newRoom.channel,
      details: `Map: ${newRoom.currentMap}, Max: ${newRoom.maxPlayers}, Tunnel: ${newRoom.tunnel.name}`,
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

    if (room.countdownTimerId) {
      clearInterval(room.countdownTimerId);
      room.countdownTimerId = undefined;
    }

    this.sendRoomMessage(room, `[HOST] Red Alert 1 room is being closed: ${reason}`);

    if (this.state === 'REGISTERED') {
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
    if (updates.minPlayersToLaunch) room.minPlayersToLaunch = updates.minPlayersToLaunch;
    if (updates.gameSpeed) room.gameSpeed = updates.gameSpeed;
    if (updates.startingCredits) room.startingCredits = updates.startingCredits;
    if (updates.bases !== undefined) room.bases = updates.bases;
    if (updates.oreRegenerates !== undefined) room.oreRegenerates = updates.oreRegenerates;
    if (updates.crates !== undefined) room.crates = updates.crates;
    if (updates.fogOfWar !== undefined) room.fogOfWar = updates.fogOfWar;
    if (updates.shroud !== undefined) room.shroud = updates.shroud;
    if (updates.tunnel) room.tunnel = updates.tunnel;
    if (updates.password !== undefined) room.password = updates.password || undefined;
    if (updates.autoLaunchWhenReady !== undefined) room.autoLaunchWhenReady = updates.autoLaunchWhenReady;
    if (updates.autoRehostOnFinish !== undefined) room.autoRehostOnFinish = updates.autoRehostOnFinish;

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
    // Ensure joined to #cncnet-ra-games with key ra1-derp
    this.sendRaw(`JOIN ${this.config.announcementChannel} ${this.config.announcementChannelKey}`);

    if (room.password) {
      this.sendRaw(`JOIN ${room.channel} ${room.password}`);
    } else {
      this.sendRaw(`JOIN ${room.channel}`);
    }
  }

  private sendRoomTopic(room: HostedRoom) {
    const statusLabel = room.status === 'PLAYING' ? 'IN MATCH' : room.status === 'COUNTDOWN' ? 'STARTING' : 'OPEN';
    const topic = `[CnCNet RA1] ${room.gameTitle} | Map: ${room.currentMap} | Players: ${room.players.length}/${room.maxPlayers} | Speed: ${room.gameSpeed} | Credits: $${room.startingCredits} | Tunnel: ${room.tunnel.name} | Status: ${statusLabel}`;
    this.sendRaw(`TOPIC ${room.channel} :${topic}`);
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

  /**
   * Broadcast RA1 match announcement to #cncnet-ra-games (with key ra1-derp)
   * Compatible with CnCNet/cncnet-ra-client-package!
   */
  public broadcastGameAnnouncement(room: HostedRoom) {
    if (this.state !== 'REGISTERED') return;

    const hasPw = room.password ? '1' : '0';
    const isPlaying = room.status === 'PLAYING' ? '1' : '0';

    // CnCNet Red Alert 1 Client Standard Notice Announcement Format:
    // GAME RA;<roomChannel>;<title>;<map>;<players>;<max>;<hasPassword>;<hostNick>;<tunnelHost>;<tunnelPort>;<isPlaying>
    const announcementPayload = `GAME RA;${room.channel};${room.gameTitle};${room.currentMap};${room.players.length};${room.maxPlayers};${hasPw};${this.currentNick};${room.tunnel.host};${room.tunnel.port};${isPlaying}`;

    this.sendRaw(`NOTICE ${this.config.announcementChannel} :${announcementPayload}`);
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
    this.sendRoomMessage(room, `Type !ready when you are prepared to launch. (Commands: !maps, !vote <map>, !status, !help)`);

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

      if (room.status === 'COUNTDOWN') {
        this.cancelLaunchCountdown(room, `Player ${nick} left during countdown.`);
      }

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

        this.checkAutoLaunchCondition(room);
        break;
      }

      case '!unready':
      case '!ur': {
        if (!player) return;
        player.isReady = false;
        this.sendRoomMessage(room, `[UNREADY] ${senderNick} is no longer ready.`);
        if (room.status === 'COUNTDOWN') {
          this.cancelLaunchCountdown(room, `${senderNick} unreadied.`);
        }
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
        this.sendRoomMessage(room, `Settings: Speed ${room.gameSpeed} | Credits $${room.startingCredits} | Tunnel: ${room.tunnel.name}`);
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

      case '!start':
      case '!launch': {
        this.startLaunchCountdown(room, `Manual launch triggered by ${senderNick}`);
        break;
      }

      case '!abort':
      case '!stop': {
        this.cancelLaunchCountdown(room, `Countdown aborted by ${senderNick}`);
        break;
      }
    }
  }

  // ======================== AUTO LAUNCH COUNTDOWN ========================

  public checkAutoLaunchCondition(room: HostedRoom) {
    if (!room.autoLaunchWhenReady) return;
    if (room.status !== 'WAITING') return;

    const allReady = room.players.length >= room.minPlayersToLaunch && room.players.every((p) => p.isReady);
    if (allReady) {
      this.startLaunchCountdown(room, `All ${room.players.length} players are READY!`);
    }
  }

  public startLaunchCountdown(room: HostedRoom, triggerReason: string) {
    if (room.status === 'COUNTDOWN' || room.status === 'PLAYING') return;

    room.status = 'COUNTDOWN';
    room.countdownSeconds = 5;

    this.logHosting('COUNTDOWN_STARTED', `RA1 launch countdown initiated in ${room.channel} (${triggerReason})`, {
      roomId: room.id,
      channel: room.channel,
    });

    this.sendRoomMessage(room, `════════════════════════════════════════════════════`);
    this.sendRoomMessage(room, `⚡ ALL COMMANDERS READY! Launching Red Alert 1 in 5 seconds...`);
    this.sendRoomMessage(room, `(Type !unready to abort countdown)`);
    this.sendRoomMessage(room, `════════════════════════════════════════════════════`);

    this.sendRoomTopic(room);
    this.broadcastGameAnnouncement(room);

    room.countdownTimerId = setInterval(() => {
      if (room.countdownSeconds === null) {
        clearInterval(room.countdownTimerId);
        room.countdownTimerId = undefined;
        return;
      }

      room.countdownSeconds--;

      if (room.countdownSeconds > 0) {
        this.sendRoomMessage(room, `Launching in ${room.countdownSeconds}...`);
      } else {
        clearInterval(room.countdownTimerId);
        room.countdownTimerId = undefined;
        this.executeMatchLaunch(room);
      }
    }, 1000);
  }

  public cancelLaunchCountdown(room: HostedRoom, reason: string) {
    if (room.status !== 'COUNTDOWN') return;

    if (room.countdownTimerId) {
      clearInterval(room.countdownTimerId);
      room.countdownTimerId = undefined;
    }

    room.status = 'WAITING';
    room.countdownSeconds = null;

    this.logHosting('COUNTDOWN_CANCELLED', `RA1 launch countdown aborted in ${room.channel}: ${reason}`, {
      roomId: room.id,
      channel: room.channel,
    });

    this.sendRoomMessage(room, `⚠️ LAUNCH ABORTED: ${reason}`);
    this.sendRoomTopic(room);
    this.broadcastGameAnnouncement(room);
  }

  private executeMatchLaunch(room: HostedRoom) {
    room.status = 'PLAYING';
    room.countdownSeconds = null;
    room.matchStartedAt = new Date().toISOString();
    this.stats.totalMatchesLaunched++;

    this.logHosting('MATCH_LAUNCHED', `RED ALERT 1 MATCH LAUNCHED in ${room.channel} with ${room.players.length} players!`, {
      roomId: room.id,
      channel: room.channel,
      details: `Map: ${room.currentMap}, Tunnel: ${room.tunnel.name}`,
    });

    this.sendRoomMessage(room, `🚀 MATCH LAUNCHED! Good luck commanders!`);
    this.sendRoomMessage(room, `CnCNet Tunnel: ${room.tunnel.host}:${room.tunnel.port} (${room.tunnel.name})`);

    // Standard CnCNet client launch CTCP
    this.sendRaw(`PRIVMSG ${room.channel} :\x01LAUNCH ${room.tunnel.host}:${room.tunnel.port}\x01`);

    this.sendRoomTopic(room);
    this.broadcastGameAnnouncement(room);

    // Auto-rotate to next map in pool for the next game
    if (room.autoRehostOnFinish) {
      const currentIndex = room.mapPool.indexOf(room.currentMap);
      const nextIndex = (currentIndex + 1) % room.mapPool.length;
      room.currentMap = room.mapPool[nextIndex];
    }
  }

  public resetRoomAfterMatch(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.status = 'WAITING';
    room.countdownSeconds = null;
    room.matchStartedAt = undefined;
    for (const p of room.players) {
      p.isReady = false;
    }

    this.sendRoomMessage(room, `[RA1 HOST] Room reset for the next match! Next Map: ${room.currentMap}`);
    this.sendRoomTopic(room);
    this.broadcastGameAnnouncement(room);
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
    }, this.config.announcementIntervalSec * 1000);
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

  public simulateEvent(type: 'SIM_PLAYER_JOIN' | 'SIM_PLAYER_READY' | 'SIM_PLAYER_LEAVE' | 'SIM_PLAYER_CHAT' | 'SIM_FORCE_LAUNCH', payload: any = {}) {
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
      case 'SIM_FORCE_LAUNCH': {
        this.startLaunchCountdown(room, 'Simulated RA1 launch');
        break;
      }
    }
  }
}
