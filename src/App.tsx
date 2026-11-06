import React, { useState, useEffect, useRef } from 'react';
import {
  Gamepad2,
  Radio,
  Play,
  RotateCcw,
  PlusCircle,
  Users,
  CheckCircle2,
  Clock,
  Send,
  Download,
  Trash2,
  RefreshCw,
  Power,
  Shield,
  Layers,
  MapPin,
  Settings,
  Terminal,
  FileText,
  AlertTriangle,
  Zap,
  Activity,
  ChevronRight,
  Flame,
  Globe,
  Sliders,
  XCircle,
  Vote,
  Hash,
  Key,
  ExternalLink,
  MessageSquare,
  Sparkles,
} from 'lucide-react';

export interface GameDefinition {
  code: 'RA';
  name: string;
  packageRepo: string;
  lobbyChannel: string;
  announcementChannel: string;
  announcementChannelKey: string;
  defaultMaps: string[];
  defaultTitle: string;
  defaultMaxPlayers: number;
}

export interface TunnelNode {
  name: string;
  region: string;
  host: string;
  port: number;
}

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
  currentMap: string;
  mapPool: string[];
  gameSpeed: number;
  startingCredits: number;
  bases: boolean;
  oreRegenerates: boolean;
  crates: boolean;
  fogOfWar: boolean;
  shroud: boolean;
  tunnel: TunnelNode;
  status: 'WAITING';
  players: RoomPlayer[];
  mapVotes: Record<string, number>;
  createdAt: string;
  lastActivityAt: string;
}

export interface HostingLogEntry {
  id: string;
  timestamp: string;
  type: string;
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

export default function App() {
  const [activeTab, setActiveTab] = useState<'rooms' | 'chat' | 'create' | 'logs' | 'simulator' | 'settings'>('rooms');
  const [status, setStatus] = useState<any>(null);
  const [rooms, setRooms] = useState<HostedRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [gameDef, setGameDef] = useState<GameDefinition | null>(null);
  const [tunnels, setTunnels] = useState<TunnelNode[]>([]);
  const [hostingLogs, setHostingLogs] = useState<HostingLogEntry[]>([]);
  const [chatLogs, setChatLogs] = useState<ChatMessageEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Chat message
  const [chatInput, setChatInput] = useState('');

  // Create Room Form state (RA1 dedicated)
  const [newRoomTitle, setNewRoomTitle] = useState('[RA1] CnCNet AutoHost - Fast 1v1/2v2 [All Welcome]');
  const [newRoomMaxPlayers, setNewRoomMaxPlayers] = useState(4);
  const [newRoomMap, setNewRoomMap] = useState('Path Beyond (2-4)');
  const [newRoomSpeed, setNewRoomSpeed] = useState(5);
  const [newRoomCredits, setNewRoomCredits] = useState(10000);
  const [newRoomBases, setNewRoomBases] = useState(true);
  const [newRoomOre, setNewRoomOre] = useState(true);
  const [newRoomCrates, setNewRoomCrates] = useState(false);
  const [newRoomFog, setNewRoomFog] = useState(true);
  const [newRoomPassword, setNewRoomPassword] = useState('');
  const [newRoomTunnelIndex, setNewRoomTunnelIndex] = useState(0);

  // Bot Config Form state
  const [configNick, setConfigNick] = useState('RA1_AutoHost');
  const [configServer, setConfigServer] = useState('irc.cncnet.org');
  const [configPort, setConfigPort] = useState(6667);
  const [configUseSsl, setConfigUseSsl] = useState(false);
  const [configInterval, setConfigInterval] = useState(15);

  // Simulator
  const [simNick, setSimNick] = useState('Soviet_General_77');
  const [simChatMessage, setSimChatMessage] = useState('!ready');
  const [simBanner, setSimBanner] = useState<string | null>(null);

  // Disk file viewer
  const [fileType, setFileType] = useState<'hosting' | 'activity'>('hosting');
  const [fileContent, setFileContent] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);

  // Auto-scroll chat
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [autoScrollChat, setAutoScrollChat] = useState(true);

  // Fetch status
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const json = await res.json();
        setStatus(json.data);
        if (json.data.rooms) {
          setRooms(json.data.rooms);
          if (!selectedRoomId && json.data.rooms.length > 0) {
            setSelectedRoomId(json.data.rooms[0].id);
          }
        }
        if (json.gameDefinition) setGameDef(json.gameDefinition);
        if (json.tunnels) setTunnels(json.tunnels);
        if (json.config) {
          setConfigNick(json.config.nick);
          setConfigServer(json.config.server);
          setConfigPort(json.config.port);
          setConfigUseSsl(json.config.useSsl);
          setConfigInterval(json.config.announcementIntervalSec);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/logs/hosting?limit=150');
      if (res.ok) {
        const data = await res.json();
        setHostingLogs(data.logs);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchChat = async () => {
    try {
      const selectedRoom = rooms.find((r) => r.id === selectedRoomId);
      const url = selectedRoom ? `/api/logs/chat?channel=${encodeURIComponent(selectedRoom.channel)}&limit=150` : '/api/logs/chat?limit=150';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setChatLogs(data.logs);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchFile = async (type: 'hosting' | 'activity') => {
    setLoadingFile(true);
    try {
      const res = await fetch(`/api/logs/file/${type}`);
      if (res.ok) {
        const data = await res.json();
        setFileContent(data.content);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingFile(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchLogs();
    fetchChat();

    const interval = setInterval(() => {
      fetchStatus();
      if (activeTab === 'chat') fetchChat();
      if (activeTab === 'logs') fetchLogs();
    }, 2500);

    return () => clearInterval(interval);
  }, [activeTab, selectedRoomId]);

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchFile(fileType);
    }
  }, [activeTab, fileType]);

  useEffect(() => {
    if (autoScrollChat && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatLogs, autoScrollChat]);

  // Actions
  const handleConnect = async () => {
    setIsLoading(true);
    try {
      await fetch('/api/bot/connect', { method: 'POST' });
      await fetchStatus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect bot from CnCNet IRC?')) return;
    setIsLoading(true);
    try {
      await fetch('/api/bot/disconnect', { method: 'POST' });
      await fetchStatus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleReconnect = async () => {
    setIsLoading(true);
    try {
      await fetch('/api/bot/reconnect', { method: 'POST' });
      await fetchStatus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const payload = {
        gameType: 'RA',
        gameTitle: newRoomTitle,
        maxPlayers: newRoomMaxPlayers,
        currentMap: newRoomMap,
        mapPool: gameDef ? gameDef.defaultMaps : [newRoomMap],
        gameSpeed: newRoomSpeed,
        startingCredits: newRoomCredits,
        bases: newRoomBases,
        oreRegenerates: newRoomOre,
        crates: newRoomCrates,
        fogOfWar: newRoomFog,
        shroud: true,
        password: newRoomPassword || undefined,
        tunnel: tunnels[newRoomTunnelIndex] || { name: 'Frankfurt (EU)', host: 'tunnel.cncnet.org', port: 50000 },
      };

      const res = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const json = await res.json();
        await fetchStatus();
        if (json.room) setSelectedRoomId(json.room.id);
        setActiveTab('rooms');
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to create room');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseRoom = async (roomId: string) => {
    if (!confirm('Are you sure you want to close this RA1 room?')) return;
    try {
      const res = await fetch('/api/rooms/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
      });
      if (res.ok) {
        await fetchStatus();
        const remaining = rooms.filter((r) => r.id !== roomId);
        if (remaining.length > 0) setSelectedRoomId(remaining[0].id);
        else setSelectedRoomId(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleKickPlayer = async (roomId: string, nick: string) => {
    try {
      const res = await fetch('/api/rooms/kick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, nick }),
      });
      if (res.ok) await fetchStatus();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !selectedRoomId) return;
    try {
      await fetch('/api/rooms/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: selectedRoomId, message: chatInput.trim() }),
      });
      setChatInput('');
      await fetchChat();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/bot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nick: configNick,
          server: configServer,
          port: configPort,
          useSsl: configUseSsl,
          announcementIntervalSec: configInterval,
        }),
      });
      if (res.ok) {
        alert('Bot configuration saved successfully.');
        await fetchStatus();
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSimulate = async (eventType: string, payload: any = {}) => {
    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType, payload: { roomId: selectedRoomId, ...payload } }),
      });
      if (res.ok) {
        setSimBanner(`Simulated: ${eventType}`);
        setTimeout(() => setSimBanner(null), 3000);
        await fetchStatus();
        await fetchLogs();
        await fetchChat();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const formatSeconds = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) || rooms[0];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-red-600 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-red-950/80 bg-slate-900/95 backdrop-blur sticky top-0 z-30 px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-600/15 border border-red-600/40 text-red-500 flex items-center justify-center shadow-lg shadow-red-950/50">
              <Gamepad2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-white tracking-wide uppercase">
                  CnCNet Red Alert 1 AutoHost Bot
                </h1>
                <a
                  href="https://github.com/CnCNet/cncnet-ra-client-package"
                  target="_blank"
                  rel="noreferrer"
                  className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-red-950 text-red-300 border border-red-800 hover:text-white hover:border-red-600 flex items-center gap-1 transition-colors"
                >
                  cncnet-ra-client-package <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
              <p className="text-xs text-slate-400 flex flex-wrap items-center gap-2 font-mono">
                <span>Announce Channel: <strong className="text-red-400">#cncnet-ra-games</strong></span>
                <span>•</span>
                <span>Bot: <strong className="text-slate-200">{status?.nick || configNick}</strong></span>
              </p>
            </div>
          </div>

          {/* Status Badge & Global Action Buttons */}
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-slate-800/80 text-xs">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  status?.state === 'REGISTERED' || status?.state === 'CONNECTED'
                    ? 'bg-red-500 animate-pulse'
                    : status?.state === 'RECONNECTING'
                    ? 'bg-amber-400 animate-ping'
                    : 'bg-slate-600'
                }`}
              />
              <span className="font-semibold uppercase tracking-wider text-slate-200">
                {status?.state || 'STANDBY'}
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                ({rooms.length} RA1 room{rooms.length === 1 ? '' : 's'})
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {status?.state === 'DISCONNECTED' ? (
                <button
                  onClick={handleConnect}
                  disabled={isLoading}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white flex items-center gap-1.5 shadow transition-colors cursor-pointer"
                >
                  <Power className="w-3.5 h-3.5" />
                  Connect
                </button>
              ) : (
                <button
                  onClick={handleDisconnect}
                  disabled={isLoading}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Power className="w-3.5 h-3.5" />
                  Disconnect
                </button>
              )}

              <button
                onClick={handleReconnect}
                disabled={isLoading}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Force Reconnect"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                Reconnect
              </button>

              <button
                onClick={() => setActiveTab('create')}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold flex items-center gap-1.5 shadow transition-colors cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Spawn RA1 Room
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto w-full px-4 py-5 flex-1 flex flex-col gap-5">
        {/* Banner Alert confirming Red Alert 1 Channel & Password */}
        <div className="bg-red-950/40 border border-red-600/30 rounded-xl p-3.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-red-600/20 text-red-400">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-white block">
                Dedicated Command & Conquer: Red Alert 1 Match Hosting
              </span>
              <span className="text-slate-300">
Announces IRC room listings in #cncnet-ra-games. The game-list channel is public; the lobby channel key is separate.
              </span>
            </div>
          </div>
          <span className="text-[10px] uppercase font-bold font-mono px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800 hidden sm:inline-block">
            RA1 ONLY
          </span>
        </div>

        {/* Metric Cards Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>Hosted RA1 Rooms</span>
              <Layers className="w-4 h-4 text-red-400" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-black text-white">{rooms.length}</div>
              <p className="text-xs text-slate-400 mt-0.5">
                Announced in <code className="text-slate-300 font-mono">#cncnet-ra-games</code>
              </p>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>Commanders Served</span>
              <Users className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-black text-cyan-300">{status?.stats.totalPlayersServed || 0}</div>
              <p className="text-xs text-slate-400 mt-0.5">Red Alert 1 client joins</p>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>24/7 Resilience</span>
              <Clock className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-2">
              <div className="text-xl font-bold text-emerald-300 font-mono">
                {status?.stats.uptimeSeconds ? formatSeconds(status.stats.uptimeSeconds) : '0s'}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Auto-reconnects: <strong className="text-slate-200">{status?.stats.totalReconnects || 0}</strong>
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab('rooms')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-lg flex items-center gap-2 border-b-2 cursor-pointer transition-all whitespace-nowrap ${
              activeTab === 'rooms'
                ? 'border-red-600 text-red-400 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Gamepad2 className="w-4 h-4" />
            Active RA1 Rooms ({rooms.length})
          </button>

          <button
            onClick={() => setActiveTab('chat')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-lg flex items-center gap-2 border-b-2 cursor-pointer transition-all whitespace-nowrap ${
              activeTab === 'chat'
                ? 'border-red-600 text-red-400 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            In-Room Chat & Commands
          </button>

          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-lg flex items-center gap-2 border-b-2 cursor-pointer transition-all whitespace-nowrap ${
              activeTab === 'create'
                ? 'border-red-600 text-red-400 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <PlusCircle className="w-4 h-4 text-red-400" />
            Host New RA1 Room
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-lg flex items-center gap-2 border-b-2 cursor-pointer transition-all whitespace-nowrap ${
              activeTab === 'logs'
                ? 'border-red-600 text-red-400 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <FileText className="w-4 h-4" />
            Broadcasts & Hosting Logs ({hostingLogs.length})
          </button>

          <button
            onClick={() => setActiveTab('simulator')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-lg flex items-center gap-2 border-b-2 cursor-pointer transition-all whitespace-nowrap ${
              activeTab === 'simulator'
                ? 'border-red-600 text-red-400 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Zap className="w-4 h-4 text-amber-400" />
            RA Client Sandbox Test
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-lg flex items-center gap-2 border-b-2 cursor-pointer transition-all whitespace-nowrap ${
              activeTab === 'settings'
                ? 'border-red-600 text-red-400 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Settings className="w-4 h-4" />
            IRC & Channels Config
          </button>
        </div>

        {/* Tab 1: Active Hosted Rooms */}
        {activeTab === 'rooms' && (
          <div className="flex flex-col gap-4">
            {rooms.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center flex flex-col items-center justify-center">
                <Gamepad2 className="w-12 h-12 text-slate-600 mb-3" />
                <h3 className="text-base font-bold text-white">No Active RA1 Rooms</h3>
                <p className="text-xs text-slate-400 max-w-md mt-1 mb-4">
Create your first IRC room. It will be advertised in #cncnet-ra-games.
                </p>
                <button
                  onClick={() => setActiveTab('create')}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-2 cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  Create IRC Room
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Rooms Selector Column */}
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
                    <span>Hosted RA1 Rooms</span>
                    <span>{rooms.length} Total</span>
                  </div>

                  {rooms.map((room) => {
                    const isSelected = room.id === selectedRoomId;
                    const readyCount = room.players.filter((p) => p.isReady).length;

                    return (
                      <div
                        key={room.id}
                        onClick={() => setSelectedRoomId(room.id)}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-slate-900 border-red-600 shadow-lg shadow-red-950/40 ring-1 ring-red-500/50'
                            : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-red-950 text-red-400 border border-red-800">
                                RA1
                              </span>
                              <h4 className="text-xs font-bold text-white truncate max-w-[180px]">
                                {room.gameTitle}
                              </h4>
                            </div>
                            <p className="text-[11px] text-slate-400 font-mono mt-1">
                              Channel: <span className="text-slate-200">{room.channel}</span>
                            </p>
                          </div>

                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                              'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            }`}
                          >
                            OPEN
                          </span>
                        </div>

                        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-500" />
                            <span className="text-slate-300 truncate max-w-[120px]">{room.currentMap}</span>
                          </span>
                          <span className="flex items-center gap-1 font-mono">
                            <Users className="w-3.5 h-3.5 text-slate-500" />
                            <strong className="text-slate-200">
                              {room.players.length}/{room.maxPlayers}
                            </strong>
                            <span className="text-red-400">({readyCount} ready)</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Selected Room Detailed View */}
                {selectedRoom && (
                  <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-4 shadow-xl">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 text-xs font-mono font-bold rounded bg-red-600 text-white">
                            RED ALERT 1
                          </span>
                          <h3 className="text-base font-bold text-white">{selectedRoom.gameTitle}</h3>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-2 font-mono">
                          <span>IRC: <strong className="text-slate-200">{selectedRoom.channel}</strong></span>
                          <span>•</span>
                          <span>Game list: <strong className="text-red-400">{selectedRoom.announcementChannel}</strong></span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleCloseRoom(selectedRoom.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-red-950/60 text-slate-400 hover:text-red-400 border border-slate-700 text-xs font-semibold cursor-pointer"
                          title="Close Room"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Attributes Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase font-semibold block">Current Map</span>
                        <span className="text-xs font-bold text-slate-200 truncate block mt-0.5">
                          {selectedRoom.currentMap}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase font-semibold block">Game Speed</span>
                        <span className="text-xs font-bold text-slate-200 block mt-0.5">
                          Speed {selectedRoom.gameSpeed} (Fast)
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase font-semibold block">Starting Credits</span>
                        <span className="text-xs font-bold text-slate-200 block mt-0.5">
                          ${selectedRoom.startingCredits.toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase font-semibold block">Ore / Crates</span>
                        <span className="text-xs font-bold text-slate-200 block mt-0.5">
                          Ore: {selectedRoom.oreRegenerates ? 'Yes' : 'No'} • Crates: {selectedRoom.crates ? 'Yes' : 'No'}
                        </span>
                      </div>
                    </div>

                    {/* Players in Room */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                          <Users className="w-3.5 h-3.5 text-red-400" />
                          Connected Commanders ({selectedRoom.players.length}/{selectedRoom.maxPlayers})
                        </h4>
                        <span className="text-[11px] text-slate-400">
                          Room is open to players
                        </span>
                      </div>

                      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-800 bg-slate-950/80 text-[10px] uppercase text-slate-400 tracking-wider">
                              <th className="py-2 px-3">Slot</th>
                              <th className="py-2 px-3">Commander Nick</th>
                              <th className="py-2 px-3">Ready Status</th>
                              <th className="py-2 px-3">Voted Map</th>
                              <th className="py-2 px-3">Hostmask</th>
                              <th className="py-2 px-3 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {selectedRoom.players.length > 0 ? (
                              selectedRoom.players.map((player) => (
                                <tr key={player.nick} className="hover:bg-slate-800/30">
                                  <td className="py-2 px-3 font-mono text-slate-400">#{player.slot}</td>
                                  <td className="py-2 px-3 font-bold text-white">{player.nick}</td>
                                  <td className="py-2 px-3">
                                    {player.isReady ? (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1 w-fit">
                                        <CheckCircle2 className="w-3 h-3 text-emerald-400" /> READY
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1 w-fit">
                                        Waiting...
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-slate-400 text-[11px]">
                                    {player.votedMap || '—'}
                                  </td>
                                  <td className="py-2 px-3 font-mono text-[10px] text-slate-500 max-w-[140px] truncate">
                                    {player.hostmask || '—'}
                                  </td>
                                  <td className="py-2 px-3 text-right">
                                    <button
                                      onClick={() => handleKickPlayer(selectedRoom.id, player.nick)}
                                      className="p-1 rounded hover:bg-red-950/60 text-slate-400 hover:text-red-400 text-[10px] cursor-pointer"
                                      title="Kick player"
                                    >
                                      Kick
                                    </button>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={6} className="text-center py-6 text-slate-500 text-xs italic">
                                  No players currently in this room. Room is announced in #cncnet-ra-games!
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Chat Quick Input */}
                    <div className="pt-2">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
                          In-Room Chat ({selectedRoom.channel})
                        </span>
                        <button
                          onClick={() => setActiveTab('chat')}
                          className="text-[11px] text-red-400 hover:underline cursor-pointer flex items-center gap-1"
                        >
                          Full Chat Terminal <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>

                      <form onSubmit={handleSendChat} className="flex gap-2">
                        <input
                          type="text"
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          placeholder={`Send broadcast or command to ${selectedRoom.channel}...`}
                          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-red-500 font-mono"
                        />
                        <button
                          type="submit"
                          className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 cursor-pointer shadow"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Send
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Full In-Room Chat & Terminal */}
        {activeTab === 'chat' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col h-[600px]">
            <div className="bg-slate-950 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-red-500" />
                <span className="font-bold text-white">
                  Red Alert 1 Room Chat: {selectedRoom ? selectedRoom.channel : 'All Channels'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer select-none text-[11px]">
                  <input
                    type="checkbox"
                    checked={autoScrollChat}
                    onChange={(e) => setAutoScrollChat(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-red-500"
                  />
                  Auto-scroll
                </label>
                <button
                  onClick={fetchChat}
                  className="text-slate-400 hover:text-slate-200 text-[11px] cursor-pointer flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>
            </div>

            <div className="flex-1 p-3 font-mono text-xs overflow-y-auto space-y-1 bg-black/60">
              {chatLogs.length === 0 ? (
                <div className="text-slate-500 italic py-12 text-center">
                  No chat messages yet in this game channel. Messages typed by players in CnCNet Red Alert 1 client appear here.
                </div>
              ) : (
                chatLogs.map((msg) => {
                  const isCmd = msg.message.startsWith('!');

                  return (
                    <div
                      key={msg.id}
                      className={`flex items-start gap-2 hover:bg-slate-800/40 p-1 rounded leading-relaxed ${
                        msg.isBot ? 'text-red-400 font-semibold' : isCmd ? 'text-cyan-300' : 'text-slate-200'
                      }`}
                    >
                      <span className="text-slate-500 text-[10px] select-none shrink-0">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                      <span className={`text-[10px] font-bold px-1 rounded shrink-0 ${
                        msg.isBot ? 'bg-red-950 text-red-300 border border-red-800' : 'bg-slate-800 text-slate-300'
                      }`}>
                        {msg.sender}
                      </span>
                      <span className="break-all">{msg.message}</span>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="bg-slate-950 border-t border-slate-800 p-2.5 flex flex-col gap-2">
              <div className="flex items-center gap-1.5 overflow-x-auto text-[11px]">
                <span className="text-slate-500 text-[10px] shrink-0 font-mono">RA1 Commands:</span>
                <button
                  onClick={() => {
                    if (selectedRoomId) {
                      fetch('/api/rooms/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ roomId: selectedRoomId, message: '!maps' }),
                      }).then(() => fetchChat());
                    }
                  }}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer shrink-0 font-mono"
                >
                  !maps
                </button>
                <button
                  onClick={() => {
                    if (selectedRoomId) {
                      fetch('/api/rooms/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ roomId: selectedRoomId, message: '!status' }),
                      }).then(() => fetchChat());
                    }
                  }}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer shrink-0 font-mono"
                >
                  !status
                </button>
                <button
                  onClick={() => {
                    if (selectedRoomId) {
                      fetch('/api/rooms/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ roomId: selectedRoomId, message: 'Commanders, type !ready when you are prepared!' }),
                      }).then(() => fetchChat());
                    }
                  }}
                  className="px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800 hover:bg-red-900 cursor-pointer shrink-0"
                >
                  Prompt Commanders: !ready
                </button>
              </div>

              <form onSubmit={handleSendChat} className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type a message or command to room channel..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-red-500 font-mono"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 cursor-pointer shadow"
                >
                  <Send className="w-3.5 h-3.5" />
                  Send
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Tab 3: Create RA1 Room */}
        {activeTab === 'create' && (
          <div className="max-w-3xl mx-auto w-full bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-800 mb-5">
              <div className="p-2 rounded-lg bg-red-600/10 border border-red-600/30 text-red-500">
                <PlusCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">Create Red Alert 1 IRC Room</h3>
                <p className="text-xs text-slate-400">
                  Advertises the room in the public #cncnet-ra-games channel.
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateRoom} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Room Title</label>
                  <input
                    type="text"
                    value={newRoomTitle}
                    onChange={(e) => setNewRoomTitle(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">Starting RA1 Classic Map</label>
                  <select
                    value={newRoomMap}
                    onChange={(e) => setNewRoomMap(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500 font-mono"
                  >
                    {gameDef?.defaultMaps.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Max Players</label>
                  <select
                    value={newRoomMaxPlayers}
                    onChange={(e) => setNewRoomMaxPlayers(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500 font-mono"
                  >
                    <option value={2}>2 Players (1v1)</option>
                    <option value={4}>4 Players (2v2)</option>
                    <option value={6}>6 Players (3v3)</option>
                    <option value={8}>8 Players (FFA)</option>
                  </select>
                </div>

                <div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Game Speed</label>
                  <select
                    value={newRoomSpeed}
                    onChange={(e) => setNewRoomSpeed(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500 font-mono"
                  >
                    <option value={6}>Speed 6 (Fastest)</option>
                    <option value={5}>Speed 5 (Standard RA1)</option>
                    <option value={4}>Speed 4 (Medium)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">Starting Credits</label>
                  <select
                    value={newRoomCredits}
                    onChange={(e) => setNewRoomCredits(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500 font-mono"
                  >
                    <option value={5000}>$5,000</option>
                    <option value={10000}>$10,000 (Standard)</option>
                    <option value={15000}>$15,000</option>
                    <option value={20000}>$20,000</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Private Room Password</label>
                  <input
                    type="text"
                    value={newRoomPassword}
                    onChange={(e) => setNewRoomPassword(e.target.value)}
                    placeholder="Leave empty for public match"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500 font-mono"
                  />
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex flex-wrap gap-4 select-none">
                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={newRoomBases}
                    onChange={(e) => setNewRoomBases(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-red-500"
                  />
                  Bases Enabled
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={newRoomOre}
                    onChange={(e) => setNewRoomOre(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-red-500"
                  />
                  Ore Regenerates
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={newRoomFog}
                    onChange={(e) => setNewRoomFog(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-red-500"
                  />
                  Fog of War
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={newRoomCrates}
                    onChange={(e) => setNewRoomCrates(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-red-500"
                  />
                  Random Crates
                </label>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveTab('rooms')}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold flex items-center gap-2 cursor-pointer shadow"
                >
                  <PlusCircle className="w-4 h-4" />
                  Spawn RA1 Room
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tab 4: Logs */}
        {activeTab === 'logs' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-red-500" />
                <div>
                  <h3 className="font-bold text-sm text-white">Red Alert 1 Announcement & Hosting Logs</h3>
                  <p className="text-xs text-slate-400">
                    Disk file: <code className="text-slate-300 font-mono">logs/cncnet_hosting.log</code>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 p-0.5 rounded-lg text-xs">
                  <button
                    onClick={() => setFileType('hosting')}
                    className={`px-3 py-1 rounded cursor-pointer font-medium ${
                      fileType === 'hosting' ? 'bg-red-600 text-white font-bold' : 'text-slate-400'
                    }`}
                  >
                    cncnet_hosting.log
                  </button>
                  <button
                    onClick={() => setFileType('activity')}
                    className={`px-3 py-1 rounded cursor-pointer font-medium ${
                      fileType === 'activity' ? 'bg-red-600 text-white font-bold' : 'text-slate-400'
                    }`}
                  >
                    cncnet_activity.log
                  </button>
                </div>

                <a
                  href={`/api/logs/download/${fileType}`}
                  download
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </a>

                <button
                  onClick={async () => {
                    if (confirm('Clear logs?')) {
                      await fetch('/api/logs/clear', { method: 'POST' });
                      await fetchLogs();
                      fetchFile(fileType);
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-red-950/60 text-slate-300 hover:text-red-300 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear
                </button>
              </div>
            </div>

            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60 max-h-[460px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/80 text-[10px] uppercase text-slate-400 tracking-wider">
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Channel</th>
                    <th className="py-2.5 px-3">Message</th>
                    <th className="py-2.5 px-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {hostingLogs.length > 0 ? (
                    hostingLogs.map((log) => {
                      let badge = 'bg-slate-800 text-slate-300';
                      if (log.type === 'PLAYER_READY') badge = 'bg-emerald-950 text-emerald-300 border border-emerald-800';
                      else if (log.type === 'PLAYER_JOIN') badge = 'bg-cyan-950 text-cyan-300 border border-cyan-800';

                      return (
                        <tr key={log.id} className="hover:bg-slate-800/30 text-[11px]">
                          <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badge}`}>
                              {log.type}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-300 whitespace-nowrap">
                            {log.channel || log.roomId || '—'}
                          </td>
                          <td className="py-2 px-3 text-slate-200">{log.message}</td>
                          <td className="py-2 px-3 text-slate-400 text-[10px]">{log.details || '—'}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-slate-500 italic">
                        No hosting logs recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 5: Simulator */}
        {activeTab === 'simulator' && (
          <div className="max-w-3xl mx-auto w-full bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">cncnet-ra-client-package Test Harness</h3>
                <p className="text-xs text-slate-400">
                  Simulate IRC room joins, readiness marks, chat, and map votes.
                </p>
              </div>
            </div>

            {simBanner && (
              <div className="bg-red-950/60 border border-red-500/50 p-2.5 rounded-lg text-red-300 text-xs font-mono">
                {simBanner}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-white flex items-center gap-2 mb-1">
                    <Users className="w-4 h-4 text-red-400" />
                    Simulate RA1 Player Join
                  </h4>
                  <p className="text-[11px] text-slate-400 mb-3">
                    Simulates a commander joining the room from #cncnet-ra-games.
                  </p>
                  <input
                    type="text"
                    value={simNick}
                    onChange={(e) => setSimNick(e.target.value)}
                    placeholder="Commander Nick"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white font-mono mb-2"
                  />
                </div>
                <button
                  onClick={() => handleSimulate('SIM_PLAYER_JOIN', { nick: simNick })}
                  className="w-full py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded cursor-pointer"
                >
                  Join Room as {simNick}
                </button>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-white flex items-center gap-2 mb-1">
                    <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                    Toggle Player Ready
                  </h4>
                  <p className="text-[11px] text-slate-400 mb-3">
                    Marks the simulated commander as ready; no game is launched.
                  </p>
                  <div className="text-[11px] text-slate-500 mb-3">
                    Room: {selectedRoom ? selectedRoom.channel : 'active room'}
                  </div>
                </div>
                <button
                  onClick={() => handleSimulate('SIM_PLAYER_READY')}
                  className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded cursor-pointer"
                >
                  Mark Commander as READY (!ready)
                </button>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-white flex items-center gap-2 mb-1">
                    <MessageSquare className="w-4 h-4 text-purple-400" />
                    Simulate In-Room Command
                  </h4>
                  <p className="text-[11px] text-slate-400 mb-3">
                    Send <code className="text-red-400">!ready</code>, <code className="text-red-400">!maps</code>, <code className="text-red-400">!vote 2</code>, or <code className="text-red-400">!roll</code>.
                  </p>
                  <input
                    type="text"
                    value={simChatMessage}
                    onChange={(e) => setSimChatMessage(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white font-mono mb-2"
                  />
                </div>
                <button
                  onClick={() => handleSimulate('SIM_PLAYER_CHAT', { message: simChatMessage, nick: simNick })}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded cursor-pointer"
                >
                  Send Command from {simNick}
                </button>
              </div>

            </div>
          </div>
        )}

        {/* Tab 6: Settings */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto w-full bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-800 mb-5">
              <div className="p-2 rounded-lg bg-red-600/10 border border-red-600/30 text-red-500">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">CnCNet Red Alert 1 IRC Settings</h3>
                <p className="text-xs text-slate-400">
                  Game-list channel: <code className="text-red-400 font-mono">#cncnet-ra-games</code> (public, no key). Lobby channel: <code className="text-red-400 font-mono">#cncnet-ra</code> (keyed).
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Bot Nickname on CnCNet IRC</label>
                <input
                  type="text"
                  value={configNick}
                  onChange={(e) => setConfigNick(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">IRC Server Endpoint</label>
                  <input
                    type="text"
                    value={configServer}
                    onChange={(e) => setConfigServer(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">Port</label>
                  <input
                    type="number"
                    value={configPort}
                    onChange={(e) => setConfigPort(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">
                  Announcement Broadcast Interval (Seconds)
                </label>
                <input
                  type="number"
                  min={5}
                  max={60}
                  value={configInterval}
                  onChange={(e) => setConfigInterval(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-red-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Interval for refreshing match availability on #cncnet-ra-games.
                </p>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold cursor-pointer"
                >
                  Save Settings
                </button>
              </div>
            </form>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950 py-3 px-4 text-center text-xs text-slate-500">
        CnCNet Red Alert 1 AutoHost Bot • Dedicated to{' '}
        <a
          href="https://github.com/CnCNet/cncnet-ra-client-package"
          target="_blank"
          rel="noreferrer"
          className="text-red-400 hover:underline font-mono"
        >
          CnCNet/cncnet-ra-client-package
        </a>{' '}
        • Game-list channel: <strong className="text-slate-300">#cncnet-ra-games</strong> (public)
      </footer>
    </div>
  );
}
