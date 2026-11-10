import net from 'net';
import tls from 'tls';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

/**
 * Strips mIRC and CnCNet formatting codes, color codes (\x03, \x04), and control characters
 * (\x02 bold, \x0F reset, \x1D italics, \x1F underline, etc.) from incoming IRC text.
 */
export function stripIrcFormatting(str: string): string {
  if (!str) return '';
  return str
    // Strip IRC palette color codes: \x03 followed by optional 1-2 digits, optional comma and optional 1-2 digits
    .replace(/\x03(?:\d{1,2}(?:,\d{1,2})?|,\d{1,2})?/g, '')
    // Strip RGB hex color codes: \x04 followed by 6 hex chars, optional comma and 6 hex chars
    .replace(/\x04(?:[0-9a-fA-F]{6}(?:,[0-9a-fA-F]{6})?|,[0-9a-fA-F]{6})?/g, '')
    // Strip all ASCII control characters (\x00 to \x1F: bold \x02, reset \x0F, italics \x1D, underline \x1F, etc.)
    .replace(/[\x00-\x1F]/g, '')
    // Strip zero-width and invisible unicode characters
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

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

export const KNOWN_MAP_SHA1S: Record<string, string> = {
  '[4] 4c Niklas FE v1.0 Fair': '5b3c770f2f3e7c960a7ee0f3ad51cc0380d353e2',
  '[4] T-Dawg': '8bcf97bee9a8ae5423b6fb839abedf988af6a432',
  '[4] Big Open Ore by NN': '360eee55ae49aeb0ac2ea7bbfb4383d9a87be99f',
  '[4] Crumpet 8K .': 'e6463fa6f16299d471a76d054a35d3966d10a0dc',
  "[4] Crush's Basement": '0b47d0a4a41eb4dc3b1ee5d1b95d5933ad92ef85',
  '[4] Keep off the grass 2vs2 (AutoAlly)': '74da0904008334c5ea533947d33a339cdf3b1ec0',
  '[4] Ornithology by NN': '9af4f8d9d2fe4c81670cf9a3d1ea3bd09a38642c',
  '[4] P4 *Mini* Tourney Edition.': '01fcad06d84c87c4d8e78ea22ed84fa33769ac69',
  '[4] Spacecraft by CB (ND edit)': '184587b71ed36e42701c95019588996e32ad2776',
  '[4] Z-Canuta (Ore)': 'dd0e89e4b0bab6893845dff97669a5d075e8e94d',
};

export const RA1_DEFINITION: GameDefinition = {
  code: 'RA',
  name: 'Command & Conquer: Red Alert 1',
  packageRepo: 'https://github.com/CnCNet/cncnet-ra-client-package',
  lobbyChannel: '#cncnet-ra',
  announcementChannel: '#cncnet-ra-games',
  lobbyChannelKey: 'ra1-derp',
  defaultMaps: [
    '[4] 4c Niklas FE v1.0 Fair',
    '[4] T-Dawg',
    '[4] Big Open Ore by NN',
    '[4] Crumpet 8K .',
    "[4] Crush's Basement",
    '[4] Keep off the grass 2vs2 (AutoAlly)',
    '[4] Ornithology by NN',
    '[4] P4 *Mini* Tourney Edition.',
    '[4] Spacecraft by CB (ND edit)',
    '[4] Z-Canuta (Ore)',
  ],
  defaultTitle: '[AUTO] 2v2',
  defaultMaxPlayers: 4,
};

import {
  Ra1GameOptions,
  DEFAULT_RA1_OPTIONS,
  packRa1GameOptions,
  unpackRa1GameOptions,
  RA1_CHECKBOX_DEFINITIONS,
  RA1_DROPDOWNS,
} from './ra1GameOptions.js';

export interface RoomPlayer {
  nick: string;
  slot: number;
  isReady: boolean;
  isHost: boolean;
  isInGame?: boolean;
  fileHash?: string;
  joinedAt: string;
  hostmask?: string;
  mustSpectateBy?: number;
  votedMap?: string;
  wantsNextMap?: boolean;
  sideId?: number;
  colorId?: number;
  startingLocation?: number;
  teamId?: number;
  tunnelNegotiationSuccesses?: number;
  tunnelNegotiationInProgress?: number;
  tunnelNegotiationFailures?: number;
  tunnelNegotiationReportedPeers?: number;
  tunnelNegotiationReportReceived?: boolean;
  unreadySince?: number;
  readyWarnedAt?: number;
  cancelledStarts?: number;
}

export interface HostedRoom {
  id: string;
  hostNick: string;
  gameType: 'RA';
  gameTitle: string;
  channel: string;
  announcementChannel: string;
  lobbyChannel: string;
  password?: string;
  maxPlayers: number;
  configuredMaxPlayers?: number;
  autoThreeVsThreeActive?: boolean;
  maxSpectators?: number;
  humanPlayerCount?: number;
  spectatorCount?: number;
  capacity?: number;
  skillLevel?: number;
  forceRandomSides?: boolean;
  forceRandomStarts?: boolean;
  currentMap: string;
  mapPool: string[];
  recentMaps?: string[];
  options: Ra1GameOptions;
  // Legacy convenience fields kept in sync with options:
  gameSpeed?: number | string;
  startingCredits?: number;
  bases?: boolean;
  oreRegenerates?: boolean;
  crates?: boolean;
  fogOfWar?: boolean;
  shroud?: boolean;
  status: 'WAITING' | 'PLAYING';
  isLocked: boolean;
  aiLevel?: number;
  tunnelLaunchBlocked?: boolean;
  fileHashLaunchBlocked?: boolean;
  fileHashMismatchReported?: string;
  fullCountdownShown?: boolean;
  lastPlayerOptionNoticeAt?: number;
  lastTeamNoticeAt?: number;
  players: RoomPlayer[];
  mapVotes: Record<string, number>;
  kickVotes?: Record<string, string[]>;
  optionVotes?: Record<string, string[]>;
  createdAt: string;
  lastActivityAt: string;
  launchedAt?: string;
  currentMatchId?: string;
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

export interface MatchHistoryEntry {
  id: string;
  roomId: string;
  channel: string;
  gameTitle: string;
  map: string;
  players: string[];
  spectators?: string[];
  endPlayers?: string[];
  gameId: number;
  startedAt: string;
  endedAt?: string;
  endReason?: string;
}

export interface HostingLogEntry {
  id: string;
  timestamp: string;
  type: 'ROOM_CREATED' | 'ROOM_CLOSED' | 'PLAYER_JOIN' | 'PLAYER_PART' | 'PLAYER_READY' | 'MAP_CHANGED' | 'SYSTEM' | 'ERROR' | 'GAME_LAUNCHED' | 'ROOM_RESET';
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

  // Rate-limiting outgoing queue (GameSurge flood protection)
  private sendQueue: Array<{ command: string; key?: string; priority: number }> = [];
  private sendTimer: NodeJS.Timeout | null = null;
  private readonly sendIntervalMs = 200;
  private readonly sendFloodBurstMs = 8000;
  private sendFloodBudgetUntil = 0;

  // Active Hosted Rooms for RA1
  private rooms: Map<string, HostedRoom> = new Map();
  private readonly postLaunchRoomRotationMs = 30000;
  private readonly spectatorSideId = Number.isFinite(Number(process.env.CNCNET_RA1_SPECTATOR_SIDE_ID))
    ? Math.max(0, Math.floor(Number(process.env.CNCNET_RA1_SPECTATOR_SIDE_ID)))
    : 11;
  private readonly defaultMaxSpectators = Number.isFinite(Number(process.env.CNCNET_RA1_MAX_SPECTATORS))
    ? Math.max(0, Math.min(4, Math.floor(Number(process.env.CNCNET_RA1_MAX_SPECTATORS))))
    : 2;
  private readonly idleMapRotateMs = Number.isFinite(Number(process.env.CNCNET_RA1_IDLE_MAP_ROTATE_MINUTES))
    ? Math.max(0, Number(process.env.CNCNET_RA1_IDLE_MAP_ROTATE_MINUTES)) * 60000
    : 1200000;
  private roomRotationTimers: Map<string, NodeJS.Timeout> = new Map();
  private roomReadyCountdownTimers: Map<string, NodeJS.Timeout> = new Map();
  private roomFullLockTimers: Map<string, NodeJS.Timeout> = new Map();
  private roomTunnelRenegotiationTimers: Map<string, NodeJS.Timeout> = new Map();
  private roomSoloAiTimers: Map<string, NodeJS.Timeout> = new Map();
  private joinAttemptsByHost: Map<string, number[]> = new Map();
  private messageAttemptsByHost: Map<string, number[]> = new Map();
  private ctcpAttemptsByIdentity: Map<string, number[]> = new Map();
  private temporaryBanTimers: Map<string, NodeJS.Timeout> = new Map();
  private roomNamesSnapshots: Map<string, Map<string, string>> = new Map();
  private roomNamesDepartures: Map<string, Set<string>> = new Map();
  private readonly roomTunnelRenegotiationDelayMs = 45000;
  private readonly roomFullLockDelayMs = 10000;
  private readonly readyLaunchCountdownMs = 15000;
  private readonly quickStartCountdownMs = 3000;
  private readonly soloAiFallbackDelayMs = 180000;
  private readonly readyGraceMs = Number.isFinite(Number(process.env.CNCNET_RA1_READY_GRACE_SECONDS))
    ? Math.max(0, Number(process.env.CNCNET_RA1_READY_GRACE_SECONDS)) * 1000
    : 20000;
  private readonly kickUnreadyMs = Number.isFinite(Number(process.env.CNCNET_RA1_KICK_UNREADY_SECONDS))
    ? Math.max(0, Number(process.env.CNCNET_RA1_KICK_UNREADY_SECONDS)) * 1000
    : 12000;
  private readonly kickAfterCancelledStarts = Number.isFinite(Number(process.env.CNCNET_RA1_KICK_AFTER_CANCELLED_STARTS))
    ? Math.max(0, Math.floor(Number(process.env.CNCNET_RA1_KICK_AFTER_CANCELLED_STARTS)))
    : 3;
  private readonly spamBanDurationMs = 600000;
  private readonly voteKickBanMs = Number.isFinite(Number(process.env.CNCNET_RA1_VOTEKICK_BAN_HOURS))
    ? Math.max(0, Number(process.env.CNCNET_RA1_VOTEKICK_BAN_HOURS)) * 3600000
    : 86400000;
  private readonly votesNeeded = Number.isFinite(Number(process.env.CNCNET_RA1_VOTES_NEEDED))
    ? Math.max(0, Math.floor(Number(process.env.CNCNET_RA1_VOTES_NEEDED)))
    : 2;
  private readonly requireBalancedTeams = process.env.CNCNET_RA1_REQUIRE_BALANCED_TEAMS?.toLowerCase() === 'true';
  private readonly autoThreeVsThreeEnabled = process.env.CNCNET_RA1_AUTO_3V3?.toLowerCase() === 'true';
  private readonly autoThreeVsThreeLobbyUsers = Number.isFinite(Number(process.env.CNCNET_RA1_AUTO_3V3_LOBBY_USERS))
    ? Math.max(1, Math.floor(Number(process.env.CNCNET_RA1_AUTO_3V3_LOBBY_USERS)))
    : 550;
  private lobbyUsers = new Map<string, string>();
  private lobbyNamesSnapshot: Map<string, string> | null = null;
  private lobbyNamesDepartures = new Set<string>();
  private lobbyNamesJoined = new Map<string, string>();
  private lastAutoSizeCheckAt = 0;

  // Logs and Chat History
  private hostingLogs: HostingLogEntry[] = [];
  private chatLogs: ChatMessageEntry[] = [];
  private readonly maxMemoryLogs = 1000;

  private logsDir: string;
  private hostingLogFile: string;
  private activityLogFile: string;
  private eventHistoryFile: string;
  private chatHistoryFile: string;
  private matchHistoryFile: string;
  private matchHistory: MatchHistoryEntry[] = [];

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
      realName: 'CnCNet Red Alert 1 AutoHost Bot',
      announcementChannel: '#cncnet-ra-games',
      autoReconnect: true,
      reconnectIntervalSec: 5,
      maxReconnectIntervalSec: 60,
      announcementIntervalSec: 15,
      welcomeMessage: 'Welcome to this RA1 IRC room! Type !maps to view maps and !vote to vote for the next map.',
      ...customConfig,
      nick: customConfig?.nick || 'BOTHOST',
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
    this.eventHistoryFile = path.join(this.logsDir, 'events.jsonl');
    this.chatHistoryFile = path.join(this.logsDir, 'chat.jsonl');
    this.matchHistoryFile = path.join(this.logsDir, 'matches.jsonl');
    this.loadHostingLogs();
    this.loadChatLogs();
    this.loadMatchHistory();

    // Uptime counter
    setInterval(() => {
      if (this.state === 'CONNECTED' || this.state === 'REGISTERED') {
        if (this.connectedSince) {
          this.stats.uptimeSeconds = Math.floor((Date.now() - this.connectedSince.getTime()) / 1000);
        }
      }
      this.checkUnreadyPlayers();
      this.updateDynamicRoomSizes();
    }, 1000);

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
      stats: { ...this.stats, totalMatches: this.matchHistory.length },
      lobbyUserCount: this.lobbyUsers.size,
      rooms: this.getRoomSnapshots(),
      gameDefinition: RA1_DEFINITION,
    };
  }

  private getRoomSnapshots(): HostedRoom[] {
    return Array.from(this.rooms.values()).map((room) => {
      const humanPlayerCount = this.getHumanPlayerCount(room);
      return {
        ...room,
        autoThreeVsThreeActive: (room.configuredMaxPlayers ?? room.maxPlayers) === 4 && room.maxPlayers === 6,
        humanPlayerCount,
        spectatorCount: room.players.length - humanPlayerCount,
        capacity: this.getRoomCapacity(room),
        players: room.players.map((player) => ({ ...player })),
      };
    });
  }

  public getRooms(): HostedRoom[] {
    return this.getRoomSnapshots();
  }

  public getRoom(id: string): HostedRoom | undefined {
    return this.rooms.get(id);
  }

  public getMatchHistory(limit = 100): MatchHistoryEntry[] {
    return this.matchHistory.slice(-Math.max(1, limit)).reverse().map((entry) => ({
      ...entry,
      players: [...entry.players],
      spectators: entry.spectators ? [...entry.spectators] : undefined,
      endPlayers: entry.endPlayers ? [...entry.endPlayers] : undefined,
    }));
  }

  private loadHostingLogs() {
    if (!fs.existsSync(this.eventHistoryFile)) return;
    try {
      const entries = fs.readFileSync(this.eventHistoryFile, 'utf8').split(/\r?\n/);
      for (const line of entries) {
        if (!line.trim()) continue;
        try {
          this.hostingLogs.push(JSON.parse(line) as HostingLogEntry);
        } catch {
          continue;
        }
      }
      this.hostingLogs = this.hostingLogs.slice(-this.maxMemoryLogs);
    } catch {
      this.hostingLogs = [];
    }
  }

  private loadChatLogs() {
    if (!fs.existsSync(this.chatHistoryFile)) return;
    try {
      const entries = fs.readFileSync(this.chatHistoryFile, 'utf8').split(/\r?\n/);
      for (const line of entries) {
        if (!line.trim()) continue;
        try {
          this.chatLogs.push(JSON.parse(line) as ChatMessageEntry);
        } catch {
          continue;
        }
      }
      this.chatLogs = this.chatLogs.slice(-5000);
    } catch {
      this.chatLogs = [];
    }
  }

  private loadMatchHistory() {
    if (!fs.existsSync(this.matchHistoryFile)) return;
    try {
      const lines = fs.readFileSync(this.matchHistoryFile, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === 'started' && event.match) {
            this.matchHistory.push(event.match as MatchHistoryEntry);
          } else if (event.type === 'ended') {
            const match = this.matchHistory.find((entry) => entry.id === event.matchId);
            if (match) {
              match.endedAt = event.endedAt;
              match.endReason = event.endReason;
              match.endPlayers = Array.isArray(event.endPlayers) ? event.endPlayers : [];
            }
          }
        } catch {
          continue;
        }
      }
      this.matchHistory = this.matchHistory.slice(-1000);
      const restartTime = new Date().toISOString();
      for (const match of this.matchHistory) {
        if (match.endedAt) continue;
        match.endedAt = restartTime;
        match.endReason = 'host process restarted before match return was observed';
        this.appendMatchEvent({
          type: 'ended',
          matchId: match.id,
          endedAt: restartTime,
          endReason: match.endReason,
          endPlayers: [],
        });
      }
    } catch (error: any) {
      this.logHosting('ERROR', `Could not load match history: ${error.message}`);
    }
  }

  private appendMatchEvent(event: Record<string, unknown>) {
    try {
      fs.appendFileSync(this.matchHistoryFile, JSON.stringify(event) + '\n', 'utf8');
    } catch (error: any) {
      this.logHosting('ERROR', `Could not persist match history: ${error.message}`);
    }
  }

  private recordMatchStart(room: HostedRoom, gameId: number) {
    const entry: MatchHistoryEntry = {
      id: `${room.id}-${gameId}-${Date.now()}`,
      roomId: room.id,
      channel: room.channel,
      gameTitle: room.gameTitle,
      map: room.currentMap,
      players: room.players.map((player) => player.nick),
      spectators: room.players.filter((player) => this.isSpectator(player)).map((player) => player.nick),
      gameId,
      startedAt: new Date().toISOString(),
    };
    room.currentMatchId = entry.id;
    this.matchHistory.push(entry);
    if (this.matchHistory.length > 1000) this.matchHistory.shift();
    this.appendMatchEvent({ type: 'started', match: entry });
  }

  private recordMatchEnd(room: HostedRoom, endReason: string) {
    if (!room.currentMatchId) return;
    const match = this.matchHistory.find((entry) => entry.id === room.currentMatchId);
    if (!match) {
      room.currentMatchId = undefined;
      return;
    }
    match.endedAt = new Date().toISOString();
    match.endReason = endReason;
    match.endPlayers = room.players.filter((player) => player.isInGame).map((player) => player.nick);
    this.appendMatchEvent({
      type: 'ended',
      matchId: match.id,
      endedAt: match.endedAt,
      endReason,
      endPlayers: match.endPlayers,
    });
    room.currentMatchId = undefined;
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
      fs.writeFileSync(this.eventHistoryFile, '', 'utf8');
      fs.writeFileSync(this.chatHistoryFile, '', 'utf8');
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
    if (this.sendTimer) {
      clearTimeout(this.sendTimer);
      this.sendTimer = null;
    }
    this.sendQueue = [];

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
    setTimeout(() => {      this.connect();
    }, 1500);
  }

  private sendQueued(command: string, key?: string, priority = 10) {
    if (key) {
      const existingIndex = this.sendQueue.findIndex((item) => item.key === key);
      if (existingIndex >= 0) this.sendQueue.splice(existingIndex, 1);
    }

    const item = key ? { command, key, priority } : { command, priority };
    const insertIndex = this.sendQueue.findIndex((queued) => queued.priority > priority);
    if (insertIndex < 0) this.sendQueue.push(item);
    else this.sendQueue.splice(insertIndex, 0, item);

    if (!this.sendTimer) {
      this.sendTimer = setTimeout(() => this.processSendQueue(), this.sendIntervalMs);
    }
  }

  private processSendQueue() {
    this.sendTimer = null;
    if (!this.socket || this.socket.destroyed || !this.socket.writable) {
      this.sendQueue = [];
      return;
    }

    const next = this.sendQueue[0];
    if (next) {
      const now = Date.now();
      const cost = (2 + Buffer.byteLength(next.command + '\r\n', 'utf8') / 120) * 1000;
      const waitMs = Math.max(this.sendFloodBudgetUntil, now) + cost - now - this.sendFloodBurstMs;
      if (waitMs > 0) {
        this.sendTimer = setTimeout(() => this.processSendQueue(), Math.max(20, Math.ceil(waitMs)));
        return;
      }
      this.sendQueue.shift();
      this.writeRaw(next.command);
    }

    if (this.sendQueue.length > 0) {
      this.sendTimer = setTimeout(() => this.processSendQueue(), this.sendIntervalMs);
    }
  }

  private flushSendQueue() {
    if (this.sendTimer) {
      clearTimeout(this.sendTimer);
      this.sendTimer = null;
    }

    const pending = this.sendQueue.splice(0);
    for (const item of pending) this.writeRaw(item.command);
  }

  public sendRaw(command: string) {
    if (/^(PRIVMSG|NOTICE)\s/i.test(command) && !/\x01STARTV3\b|\x01STRTD\x01/.test(command)) {
      this.sendQueued(command, undefined, /^PRIVMSG\s/i.test(command) ? 30 : 15);
      return;
    }
    this.writeRaw(command);
  }

  private writeRaw(command: string) {
    if (this.socket && !this.socket.destroyed && this.socket.writable) {
      const now = Date.now();
      const cost = (2 + Buffer.byteLength(command + '\r\n', 'utf8') / 120) * 1000;
      this.sendFloodBudgetUntil = Math.max(this.sendFloodBudgetUntil, now) + cost;
      this.socket.write(command + '\r\n');
      this.logActivity('OUTGOING', command);
    } else {
      this.logActivity('ERROR', `Cannot send, socket not writable: ${command}`);
    }
  }
  private onConnected() {
    this.state = 'CONNECTED';
    this.connectedSince = new Date();
    this.sendFloodBudgetUntil = Date.now();
    this.reconnectAttempts = 0;
    this.logHosting('SYSTEM', `Connected to CnCNet server! Registering nick '${this.currentNick}' for RA1...`);

    this.sendRaw(`NICK ${this.currentNick}`);
    this.sendRaw(`USER RA. 0 * :${this.config.realName}`);
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

    if (command === 'MODE') {
      const channel = (params[0] || '').toLowerCase();
      const room = Array.from(this.rooms.values()).find((item) => item.channel.toLowerCase() === channel);
      const modeString = params[1] || '';

      if (room && modeString) {
        let adding = true;
        let changed = false;

        for (const mode of modeString) {
          if (mode === '+') adding = true;
          else if (mode === '-') adding = false;
          else if (mode === 'i' && room.isLocked !== adding) {
            room.isLocked = adding;
            changed = true;
          }
        }

        if (changed) this.broadcastGameAnnouncement(room);
      }
      return;
    }

    // JOIN - User joined a channel
    if (command === 'JOIN') {
      const joinedChannel = (trailing || params[0] || '').toLowerCase();

      // Check if joined channel is the announcement channel
      if (joinedChannel === this.config.announcementChannel.toLowerCase()) {
        if (senderNick.toLowerCase() === this.currentNick.toLowerCase()) {
          this.logHosting('SYSTEM', `Bot successfully joined ${this.config.announcementChannel} without a key!`);
          for (const room of this.rooms.values()) {
            this.broadcastGameAnnouncement(room);
          }
        }
        return;
      }

      if (joinedChannel === RA1_DEFINITION.lobbyChannel.toLowerCase()) {
        const nickKey = senderNick.toLowerCase();
        if (nickKey === this.currentNick.toLowerCase()) {
          this.lobbyNamesSnapshot = new Map();
          this.lobbyNamesDepartures = new Set();
          this.lobbyNamesJoined = new Map();
        } else if (!nickKey.startsWith('ra1_autohost')) {
          this.lobbyUsers.set(nickKey, senderNick);
          this.lobbyNamesDepartures.delete(nickKey);
          if (this.lobbyNamesSnapshot) this.lobbyNamesJoined.set(nickKey, senderNick);
        }
        return;
      }

      // Check if joined channel matches one of our active RA1 game rooms
      for (const room of this.rooms.values()) {
        if (room.channel.toLowerCase() === joinedChannel) {
          if (senderNick.toLowerCase() === this.currentNick.toLowerCase()) {
            this.roomNamesSnapshots.set(room.id, new Map());
            this.roomNamesDepartures.set(room.id, new Set());
            this.logHosting('SYSTEM', `Bot entered RA1 room channel ${room.channel}`, {
              roomId: room.id,
              channel: room.channel,
            });
            this.sendRaw(`MODE ${room.channel} +klnNs ${this.getRoomChannelKey(room)} ${this.getRoomCapacity(room) + 1}`);
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
      if (command === 'PART' && !channelTarget) {
        channelTarget = (trailing.split(/\s+/)[0] || '').toLowerCase();
      }
      if (command === 'KICK' && params.length >= 2) {
        channelTarget = params[0].toLowerCase();
        targetNick = params[1];
      }

      const targetKey = targetNick.toLowerCase();
      if (command === 'QUIT' || channelTarget === RA1_DEFINITION.lobbyChannel.toLowerCase()) {
        this.lobbyUsers.delete(targetKey);
        if (this.lobbyNamesSnapshot) {
          this.lobbyNamesDepartures.add(targetKey);
          this.lobbyNamesJoined.delete(targetKey);
        }
      }

      for (const room of this.rooms.values()) {
        const matchesRoom = room.channel.toLowerCase() === channelTarget || command === 'QUIT';
        if (matchesRoom) {
          this.roomNamesDepartures.get(room.id)?.add(targetKey);
          this.handlePlayerLeave(room, targetNick, trailing || 'Left RA1 match room');
        }
      }
      return;
    }

    if (command === '353') {
      const channel = (params[2] || '').toLowerCase();
      if (channel === RA1_DEFINITION.lobbyChannel.toLowerCase() && trailing) {
        if (!this.lobbyNamesSnapshot) {
          this.lobbyNamesSnapshot = new Map();
          this.lobbyNamesDepartures = new Set();
          this.lobbyNamesJoined = new Map();
        }
        for (const entry of trailing.split(/\s+/)) {
          const nick = entry.replace(/^[@+%&~]+/, '');
          const key = nick.toLowerCase();
          if (nick && key !== this.currentNick.toLowerCase() && !key.startsWith('ra1_autohost')) {
            this.lobbyNamesSnapshot.set(key, nick);
          }
        }
        return;
      }
      const room = Array.from(this.rooms.values()).find((item) => item.channel.toLowerCase() === channel);
      if (room && trailing) {
        let snapshot = this.roomNamesSnapshots.get(room.id);
        if (!snapshot) {
          snapshot = new Map();
          this.roomNamesSnapshots.set(room.id, snapshot);
          this.roomNamesDepartures.set(room.id, new Set());
        }
        for (const entry of trailing.split(/\s+/)) {
          const nick = entry.replace(/^[@+%&~]+/, '');
          if (nick && nick.toLowerCase() !== this.currentNick.toLowerCase() && !nick.toLowerCase().startsWith('ra1_autohost')) {
            snapshot.set(nick.toLowerCase(), nick);
          }
        }
      }
      return;
    }

    if (command === '366') {
      const channel = (params[1] || '').toLowerCase();
      if (channel === RA1_DEFINITION.lobbyChannel.toLowerCase()) {
        const snapshot = this.lobbyNamesSnapshot || new Map<string, string>();
        for (const nick of this.lobbyNamesDepartures) snapshot.delete(nick);
        for (const [key, nick] of this.lobbyNamesJoined) snapshot.set(key, nick);
        this.lobbyUsers = snapshot;
        this.lobbyNamesSnapshot = null;
        this.lobbyNamesDepartures.clear();
        this.lobbyNamesJoined.clear();
        this.updateDynamicRoomSizes();
        return;
      }
      const room = Array.from(this.rooms.values()).find((item) => item.channel.toLowerCase() === channel);
      if (room) {
        const snapshot = this.roomNamesSnapshots.get(room.id);
        const departed = this.roomNamesDepartures.get(room.id) || new Set<string>();
        if (snapshot) {
          for (const [nickKey, nick] of snapshot) {
            if (!departed.has(nickKey)) this.handlePlayerJoin(room, nick, '');
          }
        }
        this.evaluateRoomAutomation(room);
        this.roomNamesSnapshots.delete(room.id);
        this.roomNamesDepartures.delete(room.id);
      }
      return;
    }

    if (command === 'NOTICE') {
      const target = params[0] || '';
      const text = trailing.trim();

      // Direct CTCP query to bot nick
      if (target.toLowerCase() === this.currentNick.toLowerCase() && text.startsWith('\x01') && text.endsWith('\x01')) {
        this.handleCtcpQuery(senderNick, text.slice(1, -1), senderHostmask || senderNick);
        return;
      }

      // In-room CTCP NOTICES from CnCNet Client (e.g. \x01R 1\x01, \x01R 2\x01, \x01FHSH <hash>\x01)
      if (text.startsWith('\x01') && text.endsWith('\x01')) {
        const ctcpMsg = text.slice(1, -1).trim();
        for (const room of this.rooms.values()) {
          if (room.channel.toLowerCase() === target.toLowerCase()) {
            this.handleInRoomCtcpNotice(room, senderNick, ctcpMsg);
            return;
          }
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
        this.handleCtcpQuery(senderNick, text.slice(1, -1), senderHostmask || senderNick);
        return;
      }

      // In-room or direct chat message
      const cleanText = stripIrcFormatting(text);

      for (const room of this.rooms.values()) {
        const isTargetRoom = room.channel.toLowerCase() === target.toLowerCase();
        const isDirectToBot = target.toLowerCase() === this.currentNick.toLowerCase();

        if (isTargetRoom || isDirectToBot) {
          if (isTargetRoom && senderNick.toLowerCase() !== this.currentNick.toLowerCase()) {
            const identity = (senderHostmask || senderNick).toLowerCase();
            if (this.recordRateAttempt(this.messageAttemptsByHost, identity, 10000) > 8) {
              this.applyTemporaryRoomBan(room, senderNick, senderHostmask, 'Message flooding');
              this.logHosting('ERROR', `Blocked message flood from '${senderNick}' in ${room.channel}.`, {
                roomId: room.id,
                channel: room.channel,
                nick: senderNick,
                details: senderHostmask,
              });
              return;
            }
          }
          this.recordChat({
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toISOString(),
            roomId: room.id,
            channel: isTargetRoom ? room.channel : `PM:${senderNick}`,
            sender: senderNick,
            message: cleanText || text,
            isBot: senderNick.toLowerCase() === this.currentNick.toLowerCase(),
          });

          // Check command keywords or prefixes
          const firstWord = (cleanText.split(/\s+/)[0] || '').toLowerCase();
          const isCommand =
            cleanText.startsWith('!') ||
            cleanText.startsWith('.') ||
            /^(ready|unready|notready|r|ur|help|commands|maps|map|vote|status|info|roll|dice|ping)$/i.test(firstWord);

          if (isCommand) {
            this.handlePlayerCommand(room, senderNick, cleanText);
          }
          break;
        }
      }
      return;
    }
  }

  // ======================== RA1 ROOM MANAGEMENT ========================

  private isSpectator(player: RoomPlayer): boolean {
    return player.sideId === this.spectatorSideId;
  }

  private getHumanPlayerCount(room: HostedRoom): number {
    return room.players.filter((player) => !this.isSpectator(player)).length;
  }

  private getRoomCapacity(room: HostedRoom): number {
    return room.maxPlayers + (room.maxSpectators ?? this.defaultMaxSpectators);
  }

  private isRoomFull(room: HostedRoom): boolean {
    return this.getHumanPlayerCount(room) >= room.maxPlayers || room.players.length >= this.getRoomCapacity(room);
  }

  public createRoom(options: Partial<HostedRoom>): HostedRoom {
    if (this.rooms.size > 0) throw new Error(`${this.currentNick} already has an active room. Close it before creating another.`);
    let channelName = options.channel;
    const activeChannels = new Set(Array.from(this.rooms.values()).map((room) => room.channel.toLowerCase()));
    if (!channelName || activeChannels.has(channelName.toLowerCase())) {
      do {
        const randomSuffix = Math.floor(Math.random() * 9000000 + 1000000);
        channelName = `#cncnet-ra-game${randomSuffix}`;
      } while (activeChannels.has(channelName.toLowerCase()));
    }

    const roomOptions: Ra1GameOptions = {
      ...DEFAULT_RA1_OPTIONS,
      ...(options.options || {}),
      gameSpeed: 'Maximum',
      noTeslaZapEffectDelay: true,
    };

    // If caller provided legacy flat fields, map them into roomOptions
    if (options.bases !== undefined) roomOptions.bases = Boolean(options.bases);
    if (options.oreRegenerates !== undefined) roomOptions.oreRegenerates = Boolean(options.oreRegenerates);
    if (options.crates !== undefined) roomOptions.crates = Boolean(options.crates);
    if (typeof options.startingCredits === 'number' && RA1_DROPDOWNS.credits.options.includes(options.startingCredits as any)) {
      roomOptions.credits = options.startingCredits;
    }

    const newRoom: HostedRoom = {
      id: `${this.config.nick}-${Math.random().toString(36).substring(2, 9)}`,
      hostNick: this.config.nick,
      gameType: 'RA',
      gameTitle: options.gameTitle || RA1_DEFINITION.defaultTitle,
      channel: channelName,
      announcementChannel: this.config.announcementChannel,
      lobbyChannel: RA1_DEFINITION.lobbyChannel,
      password: options.password || undefined,
      maxPlayers: options.maxPlayers || RA1_DEFINITION.defaultMaxPlayers,
      configuredMaxPlayers: options.maxPlayers || RA1_DEFINITION.defaultMaxPlayers,
      maxSpectators: options.maxSpectators === undefined
        ? this.defaultMaxSpectators
        : Math.max(0, Math.min(4, Math.floor(Number(options.maxSpectators) || 0))),
      skillLevel: Math.max(0, Math.min(3, Number(options.skillLevel) || 0)),
      currentMap: options.currentMap || RA1_DEFINITION.defaultMaps[0],
      mapPool: options.mapPool && options.mapPool.length > 0 ? options.mapPool : [...RA1_DEFINITION.defaultMaps],
      recentMaps: [],
      options: roomOptions,
      gameSpeed: roomOptions.gameSpeed,
      startingCredits: roomOptions.credits,
      bases: roomOptions.bases,
      oreRegenerates: roomOptions.oreRegenerates,
      crates: roomOptions.crates,
      status: 'WAITING',
      isLocked: false,
      players: [],
      mapVotes: {},
      kickVotes: {},
      optionVotes: {},
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    };

    this.rooms.set(newRoom.id, newRoom);
    this.stats.totalRoomsCreated++;

    this.logHosting('ROOM_CREATED', `Created RA1 IRC room '${newRoom.gameTitle}' on ${newRoom.channel}`, {
      roomId: newRoom.id,
      channel: newRoom.channel,
      details: `Map: ${newRoom.currentMap}, Max: ${newRoom.maxPlayers}, Credits: $${newRoom.options.credits}`,
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

    const rotationTimer = this.roomRotationTimers.get(roomId);
    if (rotationTimer) {
      clearTimeout(rotationTimer);
      this.roomRotationTimers.delete(roomId);
    }
    const readyTimer = this.roomReadyCountdownTimers.get(roomId);
    if (readyTimer) {
      clearTimeout(readyTimer);
      this.roomReadyCountdownTimers.delete(roomId);
    }
    const fullLockTimer = this.roomFullLockTimers.get(roomId);
    if (fullLockTimer) {
      clearTimeout(fullLockTimer);
      this.roomFullLockTimers.delete(roomId);
    }
    const renegotiationTimer = this.roomTunnelRenegotiationTimers.get(roomId);
    if (renegotiationTimer) {
      clearTimeout(renegotiationTimer);
      this.roomTunnelRenegotiationTimers.delete(roomId);
    }
    const soloAiTimer = this.roomSoloAiTimers.get(roomId);
    if (soloAiTimer) {
      clearTimeout(soloAiTimer);
      this.roomSoloAiTimers.delete(roomId);
    }

    this.recordMatchEnd(room, reason);
    this.sendRoomMessage(room, `[HOST] Red Alert 1 room is being closed: ${reason}`);

    if (this.state === 'REGISTERED') {
      this.broadcastGameAnnouncement(room, true);
      this.sendRaw(`PART ${room.channel} :${reason}`);
    }

    this.roomNamesSnapshots.delete(roomId);
    this.roomNamesDepartures.delete(roomId);
    this.rooms.delete(roomId);
    this.logHosting('ROOM_CLOSED', `RA1 room ${room.channel} closed.`, { roomId: room.id, details: reason });
  }

  public updateRoomSettings(roomId: string, updates: Partial<HostedRoom> & { options?: Partial<Ra1GameOptions> }) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');

    if (updates.gameTitle) room.gameTitle = updates.gameTitle;
    if (updates.currentMap && updates.currentMap !== room.currentMap) {
      room.recentMaps ||= [];
      room.recentMaps.push(room.currentMap);
      room.recentMaps = room.recentMaps.slice(-5);
      room.currentMap = updates.currentMap;
      room.mapVotes = {};
      room.forceRandomStarts = false;
      room.fullCountdownShown = false;
      for (const player of room.players) player.isReady = false;
      this.sendRoomPlayerExtraOptions(room);
      const readyTimer = this.roomReadyCountdownTimers.get(room.id);
      if (readyTimer) {
        clearTimeout(readyTimer);
        this.roomReadyCountdownTimers.delete(room.id);
      }
      this.sendRoomMessage(room, `[MAP] Map changed to: ${room.currentMap}. Ready up again.`);
    }
    if (updates.maxPlayers) {
      room.maxPlayers = updates.maxPlayers;
      room.configuredMaxPlayers = updates.maxPlayers;
    }
    if (updates.maxSpectators !== undefined) room.maxSpectators = Math.max(0, Math.min(4, Math.floor(Number(updates.maxSpectators) || 0)));
    if (updates.maxPlayers !== undefined || updates.maxSpectators !== undefined) {
      this.sendRaw(`MODE ${room.channel} +l ${this.getRoomCapacity(room) + 1}`);
      this.evaluateRoomAutomation(room);
    }
    if (updates.skillLevel !== undefined) room.skillLevel = Math.max(0, Math.min(3, Number(updates.skillLevel) || 0));
    if (updates.password !== undefined) room.password = updates.password || undefined;

    if (updates.options) {
      room.options = { ...room.options, ...updates.options, gameSpeed: 'Maximum', noTeslaZapEffectDelay: true };
      room.bases = room.options.bases;
      room.oreRegenerates = room.options.oreRegenerates;
      room.crates = room.options.crates;
      room.startingCredits = room.options.credits;
      room.gameSpeed = room.options.gameSpeed;
    }
    if (updates.bases !== undefined) room.options.bases = room.bases = updates.bases;
    if (updates.oreRegenerates !== undefined) room.options.oreRegenerates = room.oreRegenerates = updates.oreRegenerates;
    if (updates.crates !== undefined) room.options.crates = room.crates = updates.crates;
    if (updates.startingCredits !== undefined) room.options.credits = room.startingCredits = updates.startingCredits;

    room.lastActivityAt = new Date().toISOString();
    this.sendRoomTopic(room);
    this.sendRoomLobbySettings(room);
    this.sendRoomGameOptions(room);
    this.broadcastGameAnnouncement(room);
  }

  public setRoomLocked(roomId: string, locked: boolean): HostedRoom {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    if (this.state !== 'REGISTERED') throw new Error('Bot must be connected to CnCNet IRC before changing room modes.');
    if (room.status === 'PLAYING') throw new Error('A launched room cannot be unlocked or relocked.');
    if (room.isLocked === locked) return room;
    if (room.isLocked && !locked && this.isRoomFull(room)) {
      throw new Error(`Cannot unlock room because the player or spectator capacity has been reached.`);
    }

    const mode = locked ? '+i' : '-i';
    this.sendRaw(`MODE ${room.channel} ${mode}`);
    room.isLocked = locked;
    room.lastActivityAt = new Date().toISOString();
    this.broadcastGameAnnouncement(room);

    this.logHosting('SYSTEM', `Room ${locked ? 'locked' : 'unlocked'} using XNA-compatible IRC mode ${mode}.`, {
      roomId: room.id,
      channel: room.channel,
    });
    return room;
  }

  private validateRoomFileHashes(room: HostedRoom, announce = true): boolean {
    const missing = room.players.filter((player) => !player.fileHash);
    if (missing.length > 0) {
      if (announce && !room.fileHashLaunchBlocked) {
        room.fileHashLaunchBlocked = true;
        this.sendRoomMessage(room, `[AUTO-HOST] Waiting for RA1 file verification from: ${missing.map((player) => player.nick).join(', ')}.`);
        for (const player of missing) {
          const playerIndex = room.players.indexOf(player);
          if (playerIndex >= 0) this.sendRaw(`NOTICE ${room.channel} :\x01NVRFY ${playerIndex}\x01`);
        }
      }
      return false;
    }

    const counts = new Map<string, number>();
    for (const player of room.players) {
      const hash = player.fileHash!.toLowerCase();
      counts.set(hash, (counts.get(hash) || 0) + 1);
    }
    if (counts.size > 1) {
      const mismatchKey = Array.from(counts.keys()).sort().join('|');
      if (announce && room.fileHashMismatchReported !== mismatchKey) {
        room.fileHashLaunchBlocked = true;
        room.fileHashMismatchReported = mismatchKey;
        const majority = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
        this.sendRoomMessage(room, '[AUTO-HOST] Players have different RA1 game files. Launch is blocked until everyone uses matching files.');
        if (majority && majority[1] > room.players.length / 2) {
          for (const player of room.players) {
            if (player.fileHash!.toLowerCase() !== majority[0]) {
              this.sendRaw(`NOTICE ${room.channel} :\x01MM ${player.nick}\x01`);
            }
          }
        }
      }
      return false;
    }

    room.fileHashLaunchBlocked = false;
    room.fileHashMismatchReported = undefined;
    return true;
  }

  private validateRoomPlayerOptions(room: HostedRoom, announce = true): boolean {
    const duplicateColors = room.players.some((player, index) =>
      (player.colorId || 0) > 0 &&
      room.players.some((other, otherIndex) => otherIndex !== index && other.colorId === player.colorId)
    );
    if (!duplicateColors) {
      room.lastPlayerOptionNoticeAt = undefined;
      return true;
    }
    const now = Date.now();
    if (announce && (!room.lastPlayerOptionNoticeAt || now - room.lastPlayerOptionNoticeAt >= 20000)) {
      room.lastPlayerOptionNoticeAt = now;
      this.sendRaw(`NOTICE ${room.channel} :\x01CLRS\x01`);
      this.sendRoomMessage(room, '[AUTO-HOST] Two or more players selected the same color. Choose different colors before launch.');
    }
    return false;
  }

  private validateRoomTeams(room: HostedRoom, announce = true): boolean {
    const humans = room.players.filter((player) => !this.isSpectator(player));
    if (!this.requireBalancedTeams || humans.length < 4 || humans.length % 2 !== 0) return true;
    const teamCounts = new Map<number, number>();
    for (const player of humans) {
      const team = player.teamId || 0;
      teamCounts.set(team, (teamCounts.get(team) || 0) + 1);
    }
    const balanced = teamCounts.size === 2 && Array.from(teamCounts.entries()).every(([team, count]) =>
      team > 0 && count === humans.length / 2
    );
    if (!balanced && announce && (!room.lastTeamNoticeAt || Date.now() - room.lastTeamNoticeAt >= 30000)) {
      room.lastTeamNoticeAt = Date.now();
      this.sendRoomMessage(room, `[AUTO-HOST] Teams must be balanced ${humans.length / 2} vs ${humans.length / 2}. Select teams before launching.`);
    }
    return balanced;
  }

  public launchRoom(roomId: string): HostedRoom {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    if (this.state !== 'REGISTERED') throw new Error('Bot must be connected to CnCNet IRC before launching a room.');
    if (!room.isLocked) throw new Error('Lock the room before launching it.');
    if (room.status === 'PLAYING' || room.players.some((player) => player.isInGame)) throw new Error('This room has already been launched.');
    const aiFallback = room.aiLevel !== undefined && room.skillLevel === 1 && room.maxPlayers === 2 && room.players.length === 1;
    if (!aiFallback && this.getHumanPlayerCount(room) !== room.maxPlayers) {
      throw new Error(`Room needs ${room.maxPlayers} human players before launch.`);
    }
    if (!room.players.length || !room.players.every((player) => player.isReady)) {
      throw new Error('Every human player must be ready before launch.');
    }
    if (!this.validateRoomFileHashes(room)) {
      throw new Error('Every player must complete file verification and use matching RA1 game files before launch.');
    }
    if (!this.validateRoomPlayerOptions(room)) {
      throw new Error('Players must choose different colors before launch.');
    }
    if (!this.validateRoomTeams(room)) {
      throw new Error('Players must choose balanced teams before launch.');
    }
    if (room.players.length > 1 && !room.players.every((player) =>
      player.tunnelNegotiationReportReceived &&
      player.tunnelNegotiationReportedPeers === room.players.length - 1 &&
      player.tunnelNegotiationSuccesses === room.players.length - 1
    )) {
      throw new Error('All player tunnel connections must succeed before launch.');
    }

    const players = room.players.map((player) => player.nick);
    const now = new Date();
    const gameIdBase = `${now.getDate()}${now.getMonth() + 1}${now.getHours()}${now.getMinutes()}`;
    const gameId = Number(`0${gameIdBase}`);
    const startEntries = players.map((nick, index) => {
      const playerId = createHash('sha1').update(`${nick}:${room.channel}`, 'utf8').digest().readUInt32LE(0);
      return `${playerId};${nick};0.0.0.0:0`;
    });
    const startPayload = `${gameId};${startEntries.join(';')}`;

    this.flushSendQueue();
    this.sendRaw(`NOTICE ${room.channel} :\x01STARTV3 ${startPayload}\x01`);
    this.sendRaw(`NOTICE ${room.channel} :\x01STRTD\x01`);

    room.status = 'PLAYING';
    room.launchedAt = new Date().toISOString();
    room.lastActivityAt = room.launchedAt;
    for (const player of room.players) player.isInGame = true;
    this.recordMatchStart(room, gameId);
    this.broadcastGameAnnouncement(room);
    this.scheduleRoomRotation(room);

    this.logHosting('SYSTEM', `Bot sent the XNA-compatible STARTV3 launch packet for ${players.length} lobby entries.`, {
      roomId: room.id,
      channel: room.channel,
      details: `Game ID: ${gameId}; players: ${players.join(', ')}`,
    });

    return room;
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

  private sendRoomLobbySettings(room: HostedRoom) {
    const skillLevel = Math.max(0, Math.min(3, room.skillLevel ?? 0));
    const passwordFlag = room.password ? 1 : 0;
    this.sendQueued(`NOTICE ${room.channel} :\x01GSETTINGS ${room.gameTitle};${this.getRoomCapacity(room)};${skillLevel};${passwordFlag}\x01`, `GSETTINGS:${room.channel.toLowerCase()}`, 11);
  }

  private sendRoomPlayerExtraOptions(room: HostedRoom) {
    const randomSides = room.forceRandomSides ? '1' : '0';
    const randomStarts = room.forceRandomStarts ? '1' : '0';
    this.sendQueued(`NOTICE ${room.channel} :\x01PEO ${randomSides}00${randomStarts}0;\x01`, `PEO:${room.channel.toLowerCase()}`, 11);
  }

  private sendRoomPlayerOptions(room: HostedRoom) {
    const entries = room.players.map((player) => {
      const packedOptions = (
        (player.teamId || 0) |
        ((player.startingLocation || 0) << 8) |
        ((player.colorId || 0) << 16) |
        ((player.sideId || 0) << 24)
      ) | 0;
      return `${player.nick};${packedOptions};${player.isReady ? 1 : 0};`;
    });
    if (room.aiLevel !== undefined) entries.push(`${room.aiLevel};0;`);
    this.sendQueued(`NOTICE ${room.channel} :\x01PO ${entries.join('')}\x01`, `PO:${room.channel.toLowerCase()}`, 10);
  }
  private sendRoomGameOptions(room: HostedRoom) {
    const packedOptions = packRa1GameOptions(room.options);
    const configuredMapName = process.env.CNCNET_RA1_MAP_NAME?.trim();
    const isSampleMap = room.currentMap === '[2] Equal Opportunity' && (!configuredMapName || configuredMapName === '[2] Equal Opportunity');
    const mapSha1 = process.env.CNCNET_RA1_MAP_SHA1?.trim() || KNOWN_MAP_SHA1S[room.currentMap] || (isSampleMap ? 'cd454a0a7849d65bbc4a78e49ad7fbae5323623d' : '');
    const gameMode = KNOWN_MAP_SHA1S[room.currentMap] ? 'Popular' : (process.env.CNCNET_RA1_GAME_MODE?.trim() || 'Standard');
    const frameSendRate = '7';
    const maxAhead = process.env.CNCNET_RA1_MAX_AHEAD?.trim() || '0';
    const protocolVersion = '2';
    const randomSeed = process.env.CNCNET_RA1_RANDOM_SEED?.trim() || '0';
    const removeStartingLocations = '0';
    const tunnelMode = '1';
    const difficulty = '-1';
    const payload = [
      ...packedOptions.split(','),
      KNOWN_MAP_SHA1S[room.currentMap] ? '1' : '0',
      mapSha1,
      gameMode,
      frameSendRate,
      maxAhead,
      protocolVersion,
      randomSeed,
      removeStartingLocations,
      room.currentMap,
      tunnelMode,
      difficulty,
    ].join(';');

    this.sendQueued(`NOTICE ${room.channel} :\x01GO ${payload}\x01`, `GO:${room.channel.toLowerCase()}`, 11);
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

    const gameVersion = process.env.CNCNET_RA1_GAME_VERSION?.trim() || '0.1.2';
    const configuredMapName = process.env.CNCNET_RA1_MAP_NAME?.trim();
    const mapSha1 =
      process.env.CNCNET_RA1_MAP_SHA1?.trim() ||
      KNOWN_MAP_SHA1S[room.currentMap] ||
      'cd454a0a7849d65bbc4a78e49ad7fbae5323623d';
    if (!mapSha1) {
      this.logHosting('ERROR', `Game-list advertisement skipped: no SHA-1 configured for map '${room.currentMap}'. Set CNCNET_RA1_MAP_SHA1 to that map's exact hash.`);
      return;
    }

    const flags = `${room.isLocked ? '1' : '0'}${room.password ? '1' : '0'}${closed ? '1' : '0'}00`;
    const players = room.players.map((player) => player.nick).join(',');
    const tunnel = '[DYN]';
    const mapName = configuredMapName || room.currentMap;
    const gameMode = KNOWN_MAP_SHA1S[room.currentMap] ? 'Popular' : (process.env.CNCNET_RA1_GAME_MODE?.trim() || 'Standard');
    const skill = String(Math.max(0, Math.min(3, room.skillLevel ?? 0)));
    const gameOptions = packRa1GameOptions(room.options);
    const difficulty = process.env.CNCNET_RA1_DIFFICULTY || '-1';
    const protocolRevision = process.env.CNCNET_PROTOCOL_REVISION?.trim() || 'A';

    // Revision A (used by client 0.1.2) expects exactly 14 parameters (indices 0-13)
    // Revision B expects 15 parameters including difficulty (index 14)
    const fields = [
      protocolRevision,
      gameVersion,
      String(this.getRoomCapacity(room)),
      room.channel,
      room.gameTitle,
      flags,
      players,
      mapName,
      gameMode,
      tunnel,
      '0',
      skill,
      mapSha1,
      gameOptions,
    ];

    if (protocolRevision === 'B') {
      fields.push(difficulty);
    }

    this.sendQueued(`NOTICE ${this.config.announcementChannel} :\x01GAME ${fields.join(';')}\x01`, `GAME:${this.config.announcementChannel.toLowerCase()}:${room.channel.toLowerCase()}`, 20);
  }

  private handlePlayerJoin(room: HostedRoom, nick: string, hostmask: string) {
    if (
      !nick ||
      nick.toLowerCase() === this.currentNick.toLowerCase() ||
      nick.toLowerCase().startsWith('ra1_autohost')
    ) {
      return;
    }

    if (room.players.some((p) => p.nick.toLowerCase() === nick.toLowerCase())) {
      return;
    }

    if (hostmask && this.recordRateAttempt(this.joinAttemptsByHost, hostmask.toLowerCase(), 60000) >= 5) {
      this.applyTemporaryRoomBan(room, nick, hostmask, 'Join flooding');
      this.logHosting('ERROR', `Blocked join flood from '${nick}' in ${room.channel}.`, {
        roomId: room.id,
        channel: room.channel,
        nick,
        details: hostmask,
      });
      return;
    }

    if (room.players.length >= this.getRoomCapacity(room)) {
      this.sendRoomMessage(room, `[RA1 HOST] Room is full (${room.players.length}/${this.getRoomCapacity(room)} including spectators).`);
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
    room.fullCountdownShown = false;
    room.fileHashLaunchBlocked = false;
    room.fileHashMismatchReported = undefined;
    room.lastActivityAt = new Date().toISOString();
    if (this.getHumanPlayerCount(room) > room.maxPlayers) {
      player.mustSpectateBy = Date.now() + 30000;
      this.sendRoomMessage(room, `[AUTO-HOST] Player slots are full. ${nick}, choose Spectator in the side list within 30 seconds or you will be removed.`);
    }
    room.tunnelLaunchBlocked = false;
    for (const roomPlayer of room.players) {
      roomPlayer.tunnelNegotiationSuccesses = 0;
      roomPlayer.tunnelNegotiationInProgress = 0;
      roomPlayer.tunnelNegotiationFailures = 0;
      roomPlayer.tunnelNegotiationReportedPeers = 0;
      roomPlayer.tunnelNegotiationReportReceived = false;
    }
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
    this.sendRoomMessage(room, `Welcome ${nick}! This room is hosted automatically. I'm a bot and can't respond to messages.`);

    this.sendRoomTopic(room);
    this.sendRoomPlayerOptions(room);
    this.sendRoomLobbySettings(room);
    this.sendRoomGameOptions(room);
    this.sendRoomPlayerExtraOptions(room);
    this.broadcastGameAnnouncement(room);
    this.evaluateRoomAutomation(room);
    this.scheduleRoomTunnelRenegotiation(room);
  }

  private recordRateAttempt(store: Map<string, number[]>, identity: string, windowMs: number): number {
    const now = Date.now();
    const attempts = (store.get(identity) || []).filter((timestamp) => now - timestamp < windowMs);
    attempts.push(now);
    store.set(identity, attempts);
    if (store.size > 2000) {
      for (const [key, values] of store) {
        if (now - values[values.length - 1] > windowMs) store.delete(key);
      }
      while (store.size > 5000) {
        const oldestKey = store.keys().next().value;
        if (oldestKey === undefined) break;
        store.delete(oldestKey);
      }
    }
    return attempts.length;
  }

  private applyTemporaryRoomBan(room: HostedRoom, nick: string, hostmask: string, reason: string, durationMs = this.spamBanDurationMs) {
    const validHostmask = /^[^!@\s]+@[^!@\s]+$/.test(hostmask);
    const mask = validHostmask ? `*!${hostmask}` : `${nick}!*@*`;
    const timerKey = `${room.channel.toLowerCase()}:${mask.toLowerCase()}`;
    const existingTimer = this.temporaryBanTimers.get(timerKey);
    if (existingTimer) clearTimeout(existingTimer);

    if (this.state === 'REGISTERED') {
      this.sendRaw(`MODE ${room.channel} +b ${mask}`);
      this.sendRaw(`KICK ${room.channel} ${nick} :${reason}`);
    }

    this.temporaryBanTimers.set(timerKey, setTimeout(() => {
      this.temporaryBanTimers.delete(timerKey);
      if (this.state === 'REGISTERED' && this.rooms.has(room.id)) {
        this.sendRaw(`MODE ${room.channel} -b ${mask}`);
      }
    }, durationMs));

    if (room.players.some((player) => player.nick.toLowerCase() === nick.toLowerCase())) {
      this.handlePlayerLeave(room, nick, reason);
    }
  }

  private handlePlayerLeave(room: HostedRoom, nick: string, reason: string) {
    const initialLen = room.players.length;
    room.players = room.players.filter((p) => p.nick.toLowerCase() !== nick.toLowerCase());
    room.players.forEach((player, index) => {
      player.slot = index + 1;
      player.isReady = player.isReady && player.isHost;
    });

    if (room.players.length !== initialLen) {
      room.fullCountdownShown = false;
      room.lastActivityAt = new Date().toISOString();
      room.tunnelLaunchBlocked = false;
      const renegotiationTimer = this.roomTunnelRenegotiationTimers.get(room.id);
      if (renegotiationTimer) {
        clearTimeout(renegotiationTimer);
        this.roomTunnelRenegotiationTimers.delete(room.id);
      }
      for (const roomPlayer of room.players) {
        roomPlayer.tunnelNegotiationSuccesses = 0;
        roomPlayer.tunnelNegotiationInProgress = 0;
        roomPlayer.tunnelNegotiationFailures = 0;
        roomPlayer.tunnelNegotiationReportedPeers = 0;
        roomPlayer.tunnelNegotiationReportReceived = false;
      }
      this.logHosting('PLAYER_PART', `Player '${nick}' left ${room.channel}`, {
        roomId: room.id,
        channel: room.channel,
        nick,
        details: reason,
      });

      this.sendRoomMessage(room, `[LOBBY] ${nick} departed (${this.getHumanPlayerCount(room)}/${room.maxPlayers} players, ${room.players.length - this.getHumanPlayerCount(room)} spectators remaining).`);

      this.sendRoomTopic(room);
      this.broadcastGameAnnouncement(room);
      this.sendRoomPlayerOptions(room);
      this.evaluateRoomAutomation(room);
    }
  }

  private handleInRoomCtcpNotice(room: HostedRoom, senderNick: string, ctcpMsg: string) {
    if (
      !senderNick ||
      senderNick.toLowerCase() === this.currentNick.toLowerCase() ||
      senderNick.toLowerCase().startsWith('ra1_autohost')
    ) {
      return;
    }

    const cleanMsg = ctcpMsg.trim();
    const player = room.players.find((p) => p.nick.toLowerCase() === senderNick.toLowerCase());
    if (!player) return;

    if (cleanMsg.startsWith('NEGRPT ')) {
      const report = cleanMsg.substring(7).trim();
      const playerIds = new Map<string, RoomPlayer>();
      for (const roomPlayer of room.players) {
        const id = createHash('sha1').update(`${roomPlayer.nick}:${room.channel}`, 'utf8').digest().readUInt32LE(0).toString(16).padStart(8, '0');
        playerIds.set(id, roomPlayer);
      }

      let successes = 0;
      let inProgress = 0;
      let failures = 0;
      let reportedPeers = 0;

      for (const entry of report.split('|')) {
        const parts = entry.split(':');
        if (parts.length < 2) continue;
        const target = playerIds.get(parts[0].toLowerCase());
        if (!target || target.nick.toLowerCase() === senderNick.toLowerCase()) continue;
        const status = Number.parseInt(parts[1], 10);
        if (![0, 1, 2, 3].includes(status)) continue;
        reportedPeers++;
        if (status === 1) inProgress++;
        else if (status === 2) successes++;
        else if (status === 3) failures++;
      }

      player.tunnelNegotiationSuccesses = successes;
      player.tunnelNegotiationInProgress = inProgress;
      player.tunnelNegotiationFailures = failures;
      player.tunnelNegotiationReportedPeers = reportedPeers;
      player.tunnelNegotiationReportReceived = true;

      const requiredPeers = room.players.length - 1;
      if (requiredPeers > 0 && room.players.every((roomPlayer) =>
        roomPlayer.tunnelNegotiationReportReceived &&
        roomPlayer.tunnelNegotiationReportedPeers === requiredPeers &&
        roomPlayer.tunnelNegotiationSuccesses === requiredPeers
      )) {
        const timer = this.roomTunnelRenegotiationTimers.get(room.id);
        if (timer) {
          clearTimeout(timer);
          this.roomTunnelRenegotiationTimers.delete(room.id);
        }
        this.logHosting('SYSTEM', `Skipped XNA tunnel renegotiation because all ${room.players.length} players reported successful negotiations in ${room.channel}.`, {
          roomId: room.id,
          channel: room.channel,
        });
      }
      this.evaluateRoomAutomation(room);
      return;
    }

    if (cleanMsg.startsWith('OR ')) {
      const match = cleanMsg.match(/^OR\s+(-?\d+)$/i);
      if (!match) return;
      const packed = Number.parseInt(match[1], 10);
      if (!Number.isSafeInteger(packed)) return;
      const requestedSideId = packed & 0xff;
      const nextSideId = room.forceRandomSides && requestedSideId !== this.spectatorSideId ? 0 : requestedSideId;
      const nextColorId = (packed >>> 8) & 0xff;
      const nextStartingLocation = room.forceRandomStarts ? 0 : (packed >>> 16) & 0xff;
      const nextTeamId = (packed >>> 24) & 0xff;
      const previousSideId = player.sideId || 0;
      const previousStartingLocation = player.startingLocation || 0;
      const previousTeamId = player.teamId || 0;
      if (nextSideId === this.spectatorSideId) {
        const currentSpectators = room.players.filter((roomPlayer) => roomPlayer !== player && this.isSpectator(roomPlayer)).length;
        if (currentSpectators >= (room.maxSpectators ?? this.defaultMaxSpectators)) {
          this.sendRoomMessage(room, `[AUTO-HOST] No spectator slots are available for ${senderNick}.`);
          return;
        }
        player.mustSpectateBy = undefined;
      } else if (player.mustSpectateBy !== undefined || this.getHumanPlayerCount(room) >= room.maxPlayers) {
        player.mustSpectateBy = this.getHumanPlayerCount(room) >= room.maxPlayers ? Date.now() + 30000 : undefined;
      }
      player.sideId = nextSideId;
      player.colorId = nextColorId;
      player.startingLocation = nextStartingLocation;
      player.teamId = nextTeamId;
      if (previousSideId !== nextSideId || previousStartingLocation !== nextStartingLocation || previousTeamId !== nextTeamId) {
        for (const roomPlayer of room.players) {
          roomPlayer.isReady = false;
          roomPlayer.unreadySince = Date.now();
          roomPlayer.readyWarnedAt = undefined;
        }
      }
      this.sendRoomPlayerOptions(room);
      this.broadcastGameAnnouncement(room);
      this.evaluateRoomAutomation(room);
      return;
    }

    if (cleanMsg.startsWith('R ')) {
      const readyStatus = Number.parseInt(cleanMsg.substring(2).trim(), 10);
      if (!Number.isInteger(readyStatus) || readyStatus < 0 || readyStatus > 2) return;
      if (readyStatus === 0 && this.noteCancelledStart(room, player)) return;
      player.isReady = readyStatus > 0;
      if (player.isReady) {
        player.unreadySince = undefined;
        player.readyWarnedAt = undefined;
      } else {
        player.unreadySince = Date.now();
        player.readyWarnedAt = undefined;
      }
      this.logHosting('PLAYER_READY', `Player '${senderNick}' reported XNA ready state ${readyStatus}.`, {
        roomId: room.id,
        channel: room.channel,
        nick: senderNick,
        details: readyStatus === 2 ? 'Auto-ready' : readyStatus === 1 ? 'Ready' : 'Not ready',
      });
      this.broadcastGameAnnouncement(room);
      this.sendRoomPlayerOptions(room);
      this.evaluateRoomAutomation(room);
    } else if (cleanMsg === 'GO' || cleanMsg.startsWith('GO ')) {
      for (const roomPlayer of room.players) {
        roomPlayer.isHost = roomPlayer.nick.toLowerCase() === senderNick.toLowerCase();
      }
      if (cleanMsg.length > 3) {
        try {
          const payload = cleanMsg.substring(3).trim();
          const parsed = unpackRa1GameOptions(payload);
          room.options = { ...room.options, ...parsed, noTeslaZapEffectDelay: true };
          room.bases = room.options.bases;
          room.oreRegenerates = room.options.oreRegenerates;
          room.crates = room.options.crates;
          room.startingCredits = room.options.credits;
          room.gameSpeed = room.options.gameSpeed;
          this.broadcastGameAnnouncement(room);
        } catch (e) {
          // ignore
        }
      }
      this.logHosting('SYSTEM', `Received XNA GO settings from host ${senderNick}.`, {
        roomId: room.id,
        channel: room.channel,
        nick: senderNick,
      });
    } else if (cleanMsg === 'STRTD') {
      player.isInGame = true;
      if (room.status !== 'PLAYING') {
        room.status = 'PLAYING';
        room.launchedAt = new Date().toISOString();
        this.broadcastGameAnnouncement(room);
      }
      this.logHosting('SYSTEM', `Detected XNA game start from ${senderNick}.`, {
        roomId: room.id,
        channel: room.channel,
        nick: senderNick,
      });
      this.scheduleRoomRotation(room);
    } else if (cleanMsg === 'RETURN') {
      player.isInGame = false;
      player.isReady = false;
      if (room.players.every((roomPlayer) => !roomPlayer.isInGame)) {
        this.recordMatchEnd(room, 'all players returned to the lobby');
      }
      this.logHosting('SYSTEM', `Detected ${senderNick} returning from the game.`, {
        roomId: room.id,
        channel: room.channel,
        nick: senderNick,
      });
    } else if (cleanMsg.startsWith('FHSH ')) {
      const hash = cleanMsg.substring(5).trim();
      if (!hash || hash.length > 128) return;
      player.fileHash = hash;
      this.validateRoomFileHashes(room);
      this.logHosting('SYSTEM', `Player '${senderNick}' completed RA1 file verification with hash ${hash} in ${room.channel}`, {
        roomId: room.id,
        channel: room.channel,
        nick: senderNick,
      });
      this.evaluateRoomAutomation(room);
    }
  }
  private scheduleRoomRotation(room: HostedRoom) {
    if (this.roomRotationTimers.has(room.id)) return;

    const timer = setTimeout(() => {
      this.roomRotationTimers.delete(room.id);
      const activeRoom = this.rooms.get(room.id);
      if (!activeRoom) return;

      const suffix = Math.floor(Math.random() * 9000000 + 1000000);
      const nextRoomOptions: Partial<HostedRoom> = {
        channel: `#cncnet-ra-game${suffix}`,
        gameTitle: activeRoom.gameTitle,
        maxPlayers: activeRoom.maxPlayers,
        configuredMaxPlayers: activeRoom.configuredMaxPlayers,
        maxSpectators: activeRoom.maxSpectators,
        skillLevel: activeRoom.skillLevel,
        currentMap: activeRoom.currentMap,
        mapPool: [...activeRoom.mapPool],
        recentMaps: [...(activeRoom.recentMaps || [])],
        options: { ...activeRoom.options },
        password: activeRoom.password,
      };

      this.closeRoom(activeRoom.id, 'Game started; room rotated after 30 seconds');
      this.createRoom(nextRoomOptions);
    }, this.postLaunchRoomRotationMs);

    this.roomRotationTimers.set(room.id, timer);
  }

  private scheduleRoomTunnelRenegotiation(room: HostedRoom) {
    if (room.status === 'PLAYING' || !this.isRoomFull(room) || this.roomTunnelRenegotiationTimers.has(room.id)) return;

    const timer = setTimeout(() => {
      this.roomTunnelRenegotiationTimers.delete(room.id);
      const activeRoom = this.rooms.get(room.id);
      if (!activeRoom || activeRoom.status === 'PLAYING' || !this.isRoomFull(activeRoom)) return;

      const participants = activeRoom.players.map((player) => player.nick);
      if (participants.length < 2) return;
      const requiredPeers = activeRoom.players.length - 1;
      const allReported = activeRoom.players.every((player) => player.tunnelNegotiationReportReceived);
      const allSucceeded = allReported && activeRoom.players.every((player) =>
        player.tunnelNegotiationSuccesses === requiredPeers
      );
      if (allSucceeded) {
        this.logHosting('SYSTEM', `Skipped XNA tunnel renegotiation because all ${activeRoom.players.length} players already negotiated successfully in ${activeRoom.channel}.`, {
          roomId: activeRoom.id,
          channel: activeRoom.channel,
        });
        return;
      }

      const negotiationInProgress = activeRoom.players.some((player) => (player.tunnelNegotiationInProgress || 0) > 0);
      const negotiationFailed = activeRoom.players.some((player) => (player.tunnelNegotiationFailures || 0) > 0);
      if (!allReported || negotiationInProgress || !negotiationFailed) {
        this.logHosting('SYSTEM', `Skipped automatic XNA tunnel renegotiation in ${activeRoom.channel}: negotiation reports are incomplete or negotiations are still running; no failed pair is confirmed.`, {
          roomId: activeRoom.id,
          channel: activeRoom.channel,
        });
        return;
      }

      for (const player of activeRoom.players) {
        player.tunnelNegotiationSuccesses = 0;
        player.tunnelNegotiationInProgress = 0;
        player.tunnelNegotiationFailures = 0;
        player.tunnelNegotiationReportedPeers = 0;
        player.tunnelNegotiationReportReceived = false;
      }

      this.sendRaw(`NOTICE ${activeRoom.channel} :\x01RENEGALL ${participants.join(',')}\x01`);
      this.logHosting('SYSTEM', `Requested XNA V3 tunnel renegotiation for ${participants.join(', ')} in ${activeRoom.channel}.`, {
        roomId: activeRoom.id,
        channel: activeRoom.channel,
        details: participants.join(','),
      });
    }, this.roomTunnelRenegotiationDelayMs);

    this.roomTunnelRenegotiationTimers.set(room.id, timer);
  }

  private getMapMaxPlayers(mapName: string): number | undefined {
    const match = mapName.match(/^\[(\d+)\]/);
    return match ? Number(match[1]) : undefined;
  }

  private updateDynamicRoomSizes() {
    if (!this.autoThreeVsThreeEnabled) return;
    const now = Date.now();
    if (now - this.lastAutoSizeCheckAt < 30000) return;
    this.lastAutoSizeCheckAt = now;
    const expand = this.lobbyUsers.size >= this.autoThreeVsThreeLobbyUsers;

    for (const room of this.rooms.values()) {
      const configuredMaxPlayers = room.configuredMaxPlayers ?? room.maxPlayers;
      if (configuredMaxPlayers !== 4 || room.players.length > 0 || room.status === 'PLAYING') continue;
      const desiredMaxPlayers = expand ? 6 : 4;
      if (room.maxPlayers === desiredMaxPlayers) continue;

      const exactMaps = room.mapPool.filter((map) => this.getMapMaxPlayers(map) === desiredMaxPlayers);
      const compatibleMaps = exactMaps.length
        ? exactMaps
        : room.mapPool.filter((map) => (this.getMapMaxPlayers(map) || 0) >= desiredMaxPlayers);
      if (desiredMaxPlayers === 6 && compatibleMaps.length === 0) continue;
      let selectedMap = room.currentMap;
      if (this.getMapMaxPlayers(selectedMap) !== desiredMaxPlayers && compatibleMaps.length > 0) {
        const recent = new Set(room.recentMaps || []);
        const preferred = compatibleMaps.filter((map) => !recent.has(map));
        const choices = preferred.length ? preferred : compatibleMaps;
        selectedMap = choices[Math.floor(Math.random() * choices.length)] || selectedMap;
      }

      if (room.currentMap !== selectedMap) {
        room.recentMaps ||= [];
        room.recentMaps.push(room.currentMap);
        room.recentMaps = room.recentMaps.slice(-5);
        room.currentMap = selectedMap;
      }
      room.maxPlayers = desiredMaxPlayers;
      room.forceRandomStarts = false;
      room.mapVotes = {};
      room.fullCountdownShown = false;
      room.gameTitle = desiredMaxPlayers === 6
        ? room.gameTitle.replace(/2v2/ig, '3v3')
        : room.gameTitle.replace(/3v3/ig, '2v2');
      room.lastActivityAt = new Date(now).toISOString();
      this.sendRaw(`MODE ${room.channel} +l ${this.getRoomCapacity(room) + 1}`);
      this.sendRoomLobbySettings(room);
      this.sendRoomPlayerExtraOptions(room);
      this.sendRoomGameOptions(room);
      this.sendRoomTopic(room);
      this.broadcastGameAnnouncement(room);
      this.logHosting('SYSTEM', `Automatically resized ${room.channel} to ${desiredMaxPlayers === 6 ? '3v3' : '2v2'} based on ${this.lobbyUsers.size} RA1 lobby users.`, {
        roomId: room.id,
        channel: room.channel,
      });
    }
  }

  private checkUnreadyPlayers() {
    if (this.state !== 'REGISTERED') return;
    const now = Date.now();
    for (const room of this.rooms.values()) {
      if (room.status === 'PLAYING') continue;
      if (
        this.idleMapRotateMs > 0 &&
        room.players.length === 0 &&
        now - Date.parse(room.lastActivityAt) >= this.idleMapRotateMs &&
        room.mapPool.length > 1
      ) {
        const nextMap = this.selectNextRoomMap(room);
        if (nextMap) {
          if (room.currentMap && room.currentMap !== nextMap) {
            room.recentMaps ||= [];
            room.recentMaps.push(room.currentMap);
            room.recentMaps = room.recentMaps.slice(-5);
          }
          room.currentMap = nextMap;
          room.mapVotes = {};
          room.lastActivityAt = new Date(now).toISOString();
          this.sendRoomTopic(room);
          this.sendRoomGameOptions(room);
          this.broadcastGameAnnouncement(room);
          this.logHosting('MAP_CHANGED', `Rotated idle RA1 room to map '${nextMap}'.`, {
            roomId: room.id,
            channel: room.channel,
          });
        }
      }
      for (const player of [...room.players]) {
        if (player.mustSpectateBy === undefined || this.isSpectator(player) || now < player.mustSpectateBy) continue;
        if (this.getHumanPlayerCount(room) <= room.maxPlayers) {
          player.mustSpectateBy = undefined;
          continue;
        }
        this.sendRoomMessage(room, `[AUTO-HOST] ${player.nick} was removed for not selecting Spectator while player slots were full.`);
        this.sendRaw(`KICK ${room.channel} ${player.nick} :Player slots full; choose Spectator`);
        this.handlePlayerLeave(room, player.nick, 'kicked (no spectator choice)');
      }

      const aiFallback = room.aiLevel !== undefined && room.skillLevel === 1 && room.maxPlayers === 2 && room.players.length === 1;
      const roomIsFull = this.isRoomFull(room) || aiFallback;
      const tunnelsReady = room.players.length <= 1 || room.players.every((player) =>
        player.tunnelNegotiationReportReceived &&
        player.tunnelNegotiationReportedPeers === room.players.length - 1 &&
        player.tunnelNegotiationSuccesses === room.players.length - 1
      );
      if (!roomIsFull || !tunnelsReady || this.kickUnreadyMs <= 0) {
        for (const player of room.players) {
          player.unreadySince = undefined;
          player.readyWarnedAt = undefined;
        }
        continue;
      }

      for (const player of [...room.players]) {
        if (player.isReady) {
          player.unreadySince = undefined;
          player.readyWarnedAt = undefined;
          continue;
        }
        player.unreadySince ??= now;
        if (player.readyWarnedAt === undefined && now - player.unreadySince >= this.readyGraceMs) {
          player.readyWarnedAt = now;
          this.sendRoomMessage(room, `[AUTO-HOST] ${player.nick}, please ready up. You will be kicked in ${Math.ceil(this.kickUnreadyMs / 1000)} seconds if you remain unready.`);
        } else if (player.readyWarnedAt !== undefined && now - player.readyWarnedAt >= this.kickUnreadyMs) {
          this.sendRoomMessage(room, `[AUTO-HOST] ${player.nick} was removed for remaining unready.`);
          this.sendRaw(`KICK ${room.channel} ${player.nick} :Not ready`);
          this.handlePlayerLeave(room, player.nick, 'kicked (not ready)');
        }
      }
    }
  }

  private noteCancelledStart(room: HostedRoom, player: RoomPlayer): boolean {
    if (!player.isReady || !this.roomReadyCountdownTimers.has(room.id)) return false;
    player.cancelledStarts = (player.cancelledStarts || 0) + 1;
    const count = player.cancelledStarts;
    const limit = this.kickAfterCancelledStarts;
    if (limit > 0 && count >= limit) {
      this.sendRoomMessage(room, `[AUTO-HOST] ${player.nick} was removed for repeatedly cancelling the start countdown.`);
      this.sendRaw(`KICK ${room.channel} ${player.nick} :Repeatedly cancelled start countdown`);
      this.handlePlayerLeave(room, player.nick, 'kicked (cancelled starts)');
      return true;
    }
    if (limit > 1 && count === limit - 1) {
      this.sendRoomMessage(room, `[AUTO-HOST] ${player.nick}, one more countdown cancellation will result in removal.`);
    }
    return false;
  }

  private evaluateRoomAutomation(room: HostedRoom) {
    if (room.status === 'PLAYING' || room.players.some((player) => player.isInGame)) return;

    const soloAiTimer = this.roomSoloAiTimers.get(room.id);
    if (room.skillLevel !== 1 || room.maxPlayers !== 2 || room.players.length !== 1 || room.aiLevel !== undefined) {
      if (soloAiTimer) {
        clearTimeout(soloAiTimer);
        this.roomSoloAiTimers.delete(room.id);
      }
    } else if (!soloAiTimer) {
      this.sendRoomMessage(room, '[AUTO-HOST] One player is waiting. A Medium AI will join in 3 minutes if nobody else arrives.');
      const timer = setTimeout(() => {
        this.roomSoloAiTimers.delete(room.id);
        const activeRoom = this.rooms.get(room.id);
        if (
          !activeRoom ||
          activeRoom.status === 'PLAYING' ||
          activeRoom.skillLevel !== 1 ||
          activeRoom.maxPlayers !== 2 ||
          activeRoom.players.length !== 1 ||
          activeRoom.aiLevel !== undefined ||
          this.state !== 'REGISTERED'
        ) return;

        activeRoom.aiLevel = 1;
        activeRoom.options.gameSpeed = '60 FPS';
        activeRoom.gameSpeed = '60 FPS';
        this.sendRoomGameOptions(activeRoom);
        this.broadcastGameAnnouncement(activeRoom);
        this.sendRoomMessage(activeRoom, '[AUTO-HOST] No second player joined. A Medium AI has joined. Ready up when you are ready.');

        try {
          if (!activeRoom.isLocked) this.setRoomLocked(activeRoom.id, true);
          this.evaluateRoomAutomation(activeRoom);
        } catch (error: any) {
          activeRoom.aiLevel = undefined;
          this.sendRoomPlayerOptions(activeRoom);
          this.logHosting('ERROR', `Medium AI fallback setup failed: ${error.message}`, {
            roomId: activeRoom.id,
            channel: activeRoom.channel,
          });
        }
      }, this.soloAiFallbackDelayMs);
      this.roomSoloAiTimers.set(room.id, timer);
    }

    const readyTimer = this.roomReadyCountdownTimers.get(room.id);
    const fullLockTimer = this.roomFullLockTimers.get(room.id);
    if (room.aiLevel !== undefined) {
      if (room.maxPlayers !== 2 || room.players.length !== 1 || !room.isLocked) {
        if (readyTimer) {
          clearTimeout(readyTimer);
          this.roomReadyCountdownTimers.delete(room.id);
        }
        return;
      }
    } else if (this.getHumanPlayerCount(room) < room.maxPlayers && room.players.length < this.getRoomCapacity(room)) {
      if (readyTimer) {
        clearTimeout(readyTimer);
        this.roomReadyCountdownTimers.delete(room.id);
      }
      if (fullLockTimer) {
        clearTimeout(fullLockTimer);
        this.roomFullLockTimers.delete(room.id);
      }
      if (room.isLocked && this.state === 'REGISTERED') {
        this.setRoomLocked(room.id, false);
        this.sendRoomMessage(room, '[AUTO-HOST] A player left. The room is unlocked while waiting for a replacement.');
      }
      return;
    }

    if (!room.isLocked && this.state === 'REGISTERED') {
      if (!fullLockTimer) {
        this.sendRoomMessage(room, `[AUTO-HOST] Player slots or room capacity reached. Waiting 10 seconds for players to synchronize before locking.`);
        const timer = setTimeout(() => {
          this.roomFullLockTimers.delete(room.id);
          const activeRoom = this.rooms.get(room.id);
          if (!activeRoom || activeRoom.status === 'PLAYING' || activeRoom.isLocked || !this.isRoomFull(activeRoom)) return;
          this.setRoomLocked(activeRoom.id, true);
          this.sendRoomMessage(activeRoom, '[AUTO-HOST] Room locked. Waiting for players to ready up in-game.');
          this.evaluateRoomAutomation(activeRoom);
        }, this.roomFullLockDelayMs);
        this.roomFullLockTimers.set(room.id, timer);
      }
      return;
    }

    const allReady = room.aiLevel !== undefined
      ? room.skillLevel === 1 && room.maxPlayers === 2 && room.players.length === 1 && room.players.every((player) => player.isReady)
      : this.getHumanPlayerCount(room) === room.maxPlayers && room.players.every((player) => player.isReady);
    if (!allReady) {
      if (readyTimer) {
        clearTimeout(readyTimer);
        this.roomReadyCountdownTimers.delete(room.id);
        this.sendRoomMessage(room, '[AUTO-HOST] Launch countdown cancelled because not everyone is ready.');
      }
      return;
    }

    if (!this.validateRoomFileHashes(room) || !this.validateRoomPlayerOptions(room) || !this.validateRoomTeams(room)) {
      if (readyTimer) {
        clearTimeout(readyTimer);
        this.roomReadyCountdownTimers.delete(room.id);
      }
      return;
    }

    if (room.players.length > 1 && !room.players.every((player) =>
      player.tunnelNegotiationReportReceived &&
      player.tunnelNegotiationReportedPeers === room.players.length - 1 &&
      player.tunnelNegotiationSuccesses === room.players.length - 1
    )) {
      if (readyTimer) {
        clearTimeout(readyTimer);
        this.roomReadyCountdownTimers.delete(room.id);
      }
      if (!room.tunnelLaunchBlocked) {
        room.tunnelLaunchBlocked = true;
        this.sendRoomMessage(room, '[AUTO-HOST] Everyone is ready. Waiting for all player tunnel connections before launching.');
      }
      return;
    }
    room.tunnelLaunchBlocked = false;

    if (readyTimer) return;

    const countdownMs = room.fullCountdownShown ? this.quickStartCountdownMs : this.readyLaunchCountdownMs;
    room.fullCountdownShown = true;
    this.sendRoomMessage(room, countdownMs === this.readyLaunchCountdownMs
      ? '[AUTO-HOST] All players are ready, verified, and connected! Launching in 15 seconds.'
      : '[AUTO-HOST] Everyone is ready again. Launching in 3 seconds.');
    const timer = setTimeout(() => {
      this.roomReadyCountdownTimers.delete(room.id);
      const activeRoom = this.rooms.get(room.id);
      if (!activeRoom || activeRoom.status === 'PLAYING' || activeRoom.players.some((player) => player.isInGame)) return;
      if (
        (activeRoom.aiLevel !== undefined
          ? activeRoom.skillLevel !== 1 || activeRoom.maxPlayers !== 2 || activeRoom.players.length !== 1 || !activeRoom.players.every((player) => player.isReady)
          : this.getHumanPlayerCount(activeRoom) !== activeRoom.maxPlayers || !activeRoom.players.every((player) => player.isReady)) ||
        !this.validateRoomFileHashes(activeRoom, false) ||
        !this.validateRoomPlayerOptions(activeRoom, false) ||
        !this.validateRoomTeams(activeRoom, false) ||
        (activeRoom.players.length > 1 && !activeRoom.players.every((player) =>
          player.tunnelNegotiationReportReceived &&
          player.tunnelNegotiationReportedPeers === activeRoom.players.length - 1 &&
          player.tunnelNegotiationSuccesses === activeRoom.players.length - 1
        )) ||
        !activeRoom.isLocked
      ) {
        this.sendRoomMessage(activeRoom, '[AUTO-HOST] Launch cancelled: player readiness or room lock changed.');
        return;
      }

      try {
        this.launchRoom(activeRoom.id);
      } catch (error: any) {
        this.sendRoomMessage(activeRoom, `[AUTO-HOST] Launch failed: ${error.message}`);
        this.logHosting('ERROR', `Automatic launch failed: ${error.message}`, {
          roomId: activeRoom.id,
          channel: activeRoom.channel,
        });
      }
    }, countdownMs);

    this.roomReadyCountdownTimers.set(room.id, timer);
  }

  private selectNextRoomMap(room: HostedRoom): string | undefined {
    const recent = new Set(room.recentMaps || []);
    let choices = room.mapPool.filter((map) => map !== room.currentMap && !recent.has(map));
    if (choices.length === 0) choices = room.mapPool.filter((map) => map !== room.currentMap);
    return choices.length ? choices[Math.floor(Math.random() * choices.length)] : room.currentMap;
  }

  private applyRoomMapChange(room: HostedRoom, map: string, reason: string) {
    if (room.currentMap && room.currentMap !== map) {
      room.recentMaps ||= [];
      room.recentMaps.push(room.currentMap);
      room.recentMaps = room.recentMaps.slice(-5);
    }
    room.currentMap = map;
    room.mapVotes = {};
    room.forceRandomStarts = false;
    room.fullCountdownShown = false;
    for (const player of room.players) {
      player.votedMap = undefined;
      player.wantsNextMap = false;
      player.isReady = false;
    }
    const readyTimer = this.roomReadyCountdownTimers.get(room.id);
    if (readyTimer) {
      clearTimeout(readyTimer);
      this.roomReadyCountdownTimers.delete(room.id);
    }
    this.sendRoomMessage(room, reason);
    this.sendRoomTopic(room);
    this.sendRoomPlayerExtraOptions(room);
    this.sendRoomPlayerOptions(room);
    this.sendRoomGameOptions(room);
    this.broadcastGameAnnouncement(room);
    this.evaluateRoomAutomation(room);
  }

  private applyRoomOptionChange(room: HostedRoom, options: Partial<Ra1GameOptions>, message: string) {
    room.options = { ...room.options, ...options, noTeslaZapEffectDelay: true };
    room.bases = room.options.bases;
    room.oreRegenerates = room.options.oreRegenerates;
    room.crates = room.options.crates;
    room.startingCredits = room.options.credits;
    room.gameSpeed = room.options.gameSpeed;
    for (const player of room.players) {
      player.isReady = false;
      player.unreadySince = Date.now();
      player.readyWarnedAt = undefined;
    }
    const readyTimer = this.roomReadyCountdownTimers.get(room.id);
    if (readyTimer) {
      clearTimeout(readyTimer);
      this.roomReadyCountdownTimers.delete(room.id);
    }
    room.optionVotes = {};
    room.fullCountdownShown = false;
    this.sendRoomMessage(room, message);
    this.sendRoomGameOptions(room);
    this.sendRoomPlayerOptions(room);
    this.broadcastGameAnnouncement(room);
    this.evaluateRoomAutomation(room);
  }

  private applyRoomPlayerExtraOptionChange(
    room: HostedRoom,
    option: 'randomSides' | 'randomStarts',
    enabled: boolean,
    message: string,
  ) {
    if (option === 'randomSides') {
      room.forceRandomSides = enabled;
      if (enabled) for (const player of room.players) player.sideId = 0;
    } else {
      room.forceRandomStarts = enabled;
      if (enabled) for (const player of room.players) player.startingLocation = 0;
    }
    for (const player of room.players) {
      player.isReady = false;
      player.unreadySince = Date.now();
      player.readyWarnedAt = undefined;
    }
    const readyTimer = this.roomReadyCountdownTimers.get(room.id);
    if (readyTimer) {
      clearTimeout(readyTimer);
      this.roomReadyCountdownTimers.delete(room.id);
    }
    room.optionVotes = {};
    room.fullCountdownShown = false;
    this.sendRoomMessage(room, message);
    this.sendRoomPlayerExtraOptions(room);
    this.sendRoomPlayerOptions(room);
    this.broadcastGameAnnouncement(room);
    this.evaluateRoomAutomation(room);
  }

  private handleOptionVote(room: HostedRoom, player: RoomPlayer, argument: string) {
    if (this.votesNeeded <= 0) {
      this.sendRoomMessage(room, '[VOTE] Lobby option voting is disabled in this room.');
      return;
    }
    if (room.status === 'PLAYING') {
      this.sendRoomMessage(room, '[VOTE] Lobby option voting is only available before launch.');
      return;
    }
    const parts = argument.trim().split(/\s+/);
    const query = (parts[0] || '').toLowerCase();
    if (!query) {
      this.sendRoomMessage(room, '[VOTE] Usage: !voteoption <checkbox> or !voteoption <dropdown> <value>.');
      return;
    }

    const checkbox = RA1_CHECKBOX_DEFINITIONS.find((definition) =>
      definition.key.toLowerCase() === query ||
      definition.label.toLowerCase() === argument.trim().toLowerCase() ||
      definition.iniSection.toLowerCase() === query
    );
    let scope: string;
    let voteKey: string;
    let change: Partial<Ra1GameOptions> = {};
    let description: string;
    let extraOption: 'randomSides' | 'randomStarts' | undefined;

    if (query === 'sides' || query === 'randomsides') {
      extraOption = 'randomSides';
      const targetValue = !room.forceRandomSides;
      scope = 'peo:randomSides';
      voteKey = `${scope}:${targetValue}`;
      description = `Random sides ${targetValue ? 'on' : 'off'}`;
    } else if (query === 'spots' || query === 'starts' || query === 'randomstarts') {
      extraOption = 'randomStarts';
      const targetValue = !room.forceRandomStarts;
      scope = 'peo:randomStarts';
      voteKey = `${scope}:${targetValue}`;
      description = `Random starting spots ${targetValue ? 'on' : 'off'}`;
    } else if (checkbox) {
      if (checkbox.locked) {
        this.sendRoomMessage(room, `[VOTE] ${checkbox.label} is locked by the RA1 client.`);
        return;
      }
      const targetValue = !room.options[checkbox.key];
      scope = `checkbox:${checkbox.key}`;
      voteKey = `${scope}:${targetValue}`;
      change = { [checkbox.key]: targetValue } as Partial<Ra1GameOptions>;
      description = `${checkbox.label} ${targetValue ? 'on' : 'off'}`;
    } else {
      const aliases: Record<string, string> = {
        game: 'gameType',
        tech: 'techLevel',
        credit: 'credits',
        units: 'unitCount',
        speed: 'gameSpeed',
      };
      const dropdownKey = aliases[query] || query;
      const dropdowns = RA1_DROPDOWNS as unknown as Record<string, { label: string; options: readonly (string | number)[] }>;
      const dropdown = dropdowns[dropdownKey];
      const requestedValue = parts.slice(1).join(' ').trim();
      const targetValue = dropdown?.options.find((value) => String(value).toLowerCase() === requestedValue.toLowerCase());
      if (!dropdown || !requestedValue || targetValue === undefined) {
        this.sendRoomMessage(room, '[VOTE] Use a checkbox name, sides, spots, or game/tech/credits/units/speed followed by a valid value.');
        return;
      }
      scope = `dropdown:${dropdownKey}`;
      voteKey = `${scope}:${targetValue}`;
      change = { [dropdownKey]: targetValue } as Partial<Ra1GameOptions>;
      description = `${dropdown.label}: ${targetValue}`;
    }

    room.optionVotes ||= {};
    for (const [key, voters] of Object.entries(room.optionVotes)) {
      if (!key.startsWith(`${scope}:`)) continue;
      room.optionVotes[key] = voters.filter((nick) => nick.toLowerCase() !== player.nick.toLowerCase());
      if (room.optionVotes[key].length === 0) delete room.optionVotes[key];
    }
    room.optionVotes[voteKey] ||= [];
    room.optionVotes[voteKey].push(player.nick);
    const votes = room.optionVotes[voteKey].filter((nick) =>
      room.players.some((candidate) => candidate.nick.toLowerCase() === nick.toLowerCase())
    ).length;
    const needed = Math.min(this.votesNeeded, room.players.length);
    if (votes < needed) {
      this.sendRoomMessage(room, `[VOTE] ${player.nick} votes for ${description} (${votes}/${needed}). Type !voteoption again to agree.`);
      return;
    }
    const message = `[VOTE] Passed! ${description}. Players must ready up again.`;
    if (extraOption) {
      const enabled = voteKey.endsWith(':true');
      this.applyRoomPlayerExtraOptionChange(room, extraOption, enabled, message);
    } else {
      this.applyRoomOptionChange(room, change, message);
    }
  }

  private handlePlayerCommand(room: HostedRoom, senderNick: string, rawText: string) {
    const text = stripIrcFormatting(rawText);
    const parts = text.split(/\s+/);
    let cmd = parts[0]?.toLowerCase() || '';
    if (cmd.startsWith('.')) {
      cmd = '!' + cmd.slice(1);
    } else if (!cmd.startsWith('!')) {
      if (cmd === 'ready' || cmd === 'r') cmd = '!ready';
      else if (cmd === 'unready' || cmd === 'ur' || cmd === 'notready') cmd = '!unready';
      else if (cmd === 'help' || cmd === 'commands' || cmd === 'h') cmd = '!help';
      else if (cmd === 'maps' || cmd === 'map') cmd = '!maps';
      else if (cmd === 'vote') cmd = '!vote';
      else if (cmd === 'status' || cmd === 'info') cmd = '!status';
      else if (cmd === 'roll' || cmd === 'dice') cmd = '!roll';
      else if (cmd === 'ping') cmd = '!ping';
    }
    const arg = stripIrcFormatting(parts.slice(1).join(' ')).trim();

    const player = room.players.find((p) => p.nick.toLowerCase() === senderNick.toLowerCase());
    if (!player) return;

    switch (cmd) {
      case '!ready':
      case '!r': {
        player.isReady = true;
        player.unreadySince = undefined;
        player.readyWarnedAt = undefined;
        const readyCount = room.players.filter((p) => p.isReady).length;
        this.sendRoomMessage(room, `[READY] ${senderNick} is READY! (${readyCount}/${room.players.length} ready)`);

        this.logHosting('PLAYER_READY', `Player '${senderNick}' marked ready in ${room.channel}`, {
          roomId: room.id,
          channel: room.channel,
          nick: senderNick,
        });

        this.broadcastGameAnnouncement(room);
        this.sendRoomPlayerOptions(room);
        this.evaluateRoomAutomation(room);
        break;
      }

      case '!unready':
      case '!ur':
      case '!notready': {
        if (this.noteCancelledStart(room, player)) break;
        player.isReady = false;
        player.unreadySince = Date.now();
        player.readyWarnedAt = undefined;
        this.sendRoomMessage(room, `[UNREADY] ${senderNick} is no longer ready.`);
        this.broadcastGameAnnouncement(room);
        this.sendRoomPlayerOptions(room);
        this.evaluateRoomAutomation(room);
        break;
      }

      case '!maps':
      case '!map': {
        const poolList = room.mapPool.map((m, i) => `${i + 1}. ${m}`).join(' | ');
        this.sendRoomMessage(room, `[RA1 MAPS] Current: ${room.currentMap} | Pool: ${poolList}`);
        break;
      }

      case '!vote':
      case '!mappick': {
        if (!arg) {
          this.sendRoomMessage(room, `[VOTE] Usage: !mappick <map name> or !vote <map name or #>.`);
          return;
        }

        let matchedMap: string | undefined;
        const num = parseInt(arg, 10);
        if (!isNaN(num) && num >= 1 && num <= room.mapPool.length) {
          matchedMap = room.mapPool[num - 1];
        } else {
          const query = arg.replace(/^\[\d+\]\s*/i, '').toLowerCase();
          matchedMap = room.mapPool.find((m) => m.toLowerCase() === arg.toLowerCase())
            || room.mapPool.find((m) => m.replace(/^\[\d+\]\s*/i, '').toLowerCase().includes(query));
        }

        if (!matchedMap) {
          this.sendRoomMessage(room, `[VOTE] Map '${arg}' not found. Type !maps to view the list.`);
          return;
        }

        player.votedMap = matchedMap;
        room.mapVotes = {};
        for (const p of room.players) {
          if (p.votedMap) room.mapVotes[p.votedMap] = (room.mapVotes[p.votedMap] || 0) + 1;
        }

        const votesForThis = room.mapVotes[matchedMap] || 0;
        const needed = this.votesNeeded > 0 ? Math.min(this.votesNeeded, room.players.length) : Math.floor(room.players.length / 2) + 1;
        this.sendRoomMessage(room, `[VOTE] ${senderNick} voted for '${matchedMap}' (${votesForThis}/${needed}).`);

        if (votesForThis >= needed) {
          this.applyRoomMapChange(room, matchedMap, `[MAP SWITCH] Majority voted! Map changed to: ${matchedMap}. Ready up again.`);
        }
        break;
      }

      case '!next': {
        player.wantsNextMap = true;
        const votes = room.players.filter((p) => p.wantsNextMap).length;
        const needed = this.votesNeeded > 0 ? Math.min(this.votesNeeded, room.players.length) : Math.floor(room.players.length / 2) + 1;
        if (votes < needed) {
          this.sendRoomMessage(room, `[VOTE] ${senderNick} wants a different map (${votes}/${needed}). Type !next to agree.`);
          break;
        }
        const nextMap = this.selectNextRoomMap(room);
        if (nextMap) this.applyRoomMapChange(room, nextMap, `[MAP SWITCH] Vote passed! Next map: ${nextMap}. Ready up again.`);
        break;
      }

      case '!voteoption':
      case '!option': {
        this.handleOptionVote(room, player, arg);
        break;
      }

      case '!invite': {
        const targetNick = arg.trim().replace(/^[@+]/, '');
        if (!targetNick || targetNick.toLowerCase() === this.currentNick.toLowerCase()) {
          this.sendRoomMessage(room, '[INVITE] Usage: !invite <nick>.');
          return;
        }
        if (room.players.some((candidate) => candidate.nick.toLowerCase() === targetNick.toLowerCase())) {
          this.sendRoomMessage(room, `[INVITE] ${targetNick} is already in this room.`);
          return;
        }
        const invitePayload = `INVITE ${room.channel};${room.gameTitle}${room.password ? `;${room.password}` : ''}`;
        this.sendRaw(`PRIVMSG ${targetNick} :\x01${invitePayload}\x01`);
        this.sendRoomMessage(room, `[INVITE] Sent a CnCNet game invitation to ${targetNick}.`);
        break;
      }

      case '!votekick': {
        const targetNick = arg.replace(/^[@+]/, '');
        const target = room.players.find((candidate) => candidate.nick.toLowerCase() === targetNick.toLowerCase());
        if (!targetNick || !target) {
          this.sendRoomMessage(room, '[VOTEKICK] Usage: !votekick <nick>. The target must be in this room.');
          return;
        }
        if (target === player) {
          this.sendRoomMessage(room, '[VOTEKICK] You cannot vote to remove yourself.');
          return;
        }
        const otherPlayers = room.players.filter((candidate) => candidate !== target);
        if (otherPlayers.length < 2 || this.voteKickBanMs <= 0) {
          this.sendRoomMessage(room, '[VOTEKICK] Voting is unavailable in this room.');
          return;
        }
        room.kickVotes ||= {};
        for (const [name, voters] of Object.entries(room.kickVotes)) {
          room.kickVotes[name] = voters.filter((voter) => voter.toLowerCase() !== player.nick.toLowerCase());
          if (room.kickVotes[name].length === 0) delete room.kickVotes[name];
        }
        const key = target.nick.toLowerCase();
        room.kickVotes[key] ||= [];
        room.kickVotes[key].push(player.nick);
        const votes = room.kickVotes[key].filter((voter) =>
          room.players.some((candidate) => candidate.nick.toLowerCase() === voter.toLowerCase()) &&
          voter.toLowerCase() !== target.nick.toLowerCase()
        ).length;
        const needed = Math.max(2, Math.ceil(otherPlayers.length / 2));
        if (votes < needed) {
          this.sendRoomMessage(room, `[VOTEKICK] ${player.nick} votes to remove ${target.nick} (${votes}/${needed}). Type !votekick ${target.nick} to agree.`);
          break;
        }
        delete room.kickVotes[key];
        const hours = Math.round(this.voteKickBanMs / 3600000);
        this.sendRoomMessage(room, `[VOTEKICK] ${target.nick} was removed by vote and banned from this room for ${hours} hour(s).`);
        this.applyTemporaryRoomBan(room, target.nick, target.hostmask || '', 'Removed by vote', this.voteKickBanMs);
        break;
      }

      case '!status':
      case '!info': {
        const readyList = room.players.map((p) => `${p.nick} ${p.isReady ? '[✓ Ready]' : '[...Waiting]'}`).join(', ');
        this.sendRoomMessage(room, `[STATUS] Map: ${room.currentMap} | Players (${this.getHumanPlayerCount(room)}/${room.maxPlayers}) + ${room.players.length - this.getHumanPlayerCount(room)} spectators: ${readyList || 'None'}`);
        this.sendRoomMessage(room, `Settings: Speed ${room.gameSpeed} | Credits ${room.startingCredits}`);
        break;
      }

      case '!roll':
      case '!dice': {
        const val = Math.floor(Math.random() * 100) + 1;
        this.sendRoomMessage(room, `[DICE] ${senderNick} rolled ${val} (1-100)`);
        break;
      }

      case '!ping': {
        this.sendRoomMessage(room, `[PONG] AutoHost bot is online and responding.`);
        break;
      }

      case '!help':
      case '!commands':
      case '!h': {
        this.sendRoomMessage(room, `[RA1 COMMANDS] !maps, !vote <map>, !mappick <map>, !next, !voteoption <option>, !invite <nick>, !votekick <nick>, !status, !roll, !help`);
        break;
      }
    }
  }

  // ======================== CTCP ========================
  private handleCtcpQuery(senderNick: string, ctcpCommand: string, identity: string) {
    if (this.recordRateAttempt(this.ctcpAttemptsByIdentity, identity.toLowerCase(), 10000) > 5) return;
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

    if (this.sendTimer) {
      clearTimeout(this.sendTimer);
      this.sendTimer = null;
    }
    this.sendQueue = [];
    this.sendFloodBudgetUntil = Date.now();

    this.state = 'DISCONNECTED';
    this.connectedSince = null;
    this.lobbyUsers.clear();
    this.lobbyNamesSnapshot = null;
    this.lobbyNamesDepartures.clear();
    this.lobbyNamesJoined.clear();

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
      fs.appendFileSync(this.eventHistoryFile, JSON.stringify(entry) + '\n', 'utf8');
    } catch {
      // ignore
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
    if (this.chatLogs.length > 5000) {
      this.chatLogs.shift();
    }
    try {
      fs.appendFileSync(this.chatHistoryFile, JSON.stringify(chat) + '\n', 'utf8');
    } catch {
      // ignore
    }
  }

  public simulateEvent(
    type: 'SIM_PLAYER_JOIN' | 'SIM_PLAYER_READY' | 'SIM_PLAYER_LEAVE' | 'SIM_PLAYER_CHAT',
    payload: any = {}
  ) {
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
        const rawMsg = payload.message || 'gl hf commanders! ready';
        const sender = payload.nick || (room.players[0] ? room.players[0].nick : 'Soviet_General');
        const cleanMsg = stripIrcFormatting(rawMsg);
        this.recordChat({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toISOString(),
          roomId: room.id,
          channel: room.channel,
          sender,
          message: cleanMsg || rawMsg,
          isBot: false,
        });
        const firstWord = (cleanMsg.split(/\s+/)[0] || '').toLowerCase();
        const isCommand =
          cleanMsg.startsWith('!') ||
          cleanMsg.startsWith('.') ||
          /^(ready|unready|notready|r|ur|help|commands|maps|map|vote|status|info|roll|dice|ping)$/i.test(firstWord);

        if (isCommand) {
          this.handlePlayerCommand(room, sender, cleanMsg);
        }
        break;
      }
    }
  }
}