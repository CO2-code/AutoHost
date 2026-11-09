import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { CnCNetAutoHostBot, RA1_DEFINITION } from './server/cncnetBot.ts';
import {
  RA1_DROPDOWNS,
  RA1_CHECKBOX_DEFINITIONS,
  DEFAULT_RA1_OPTIONS,
} from './server/ra1GameOptions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Dev server must always listen on port 3000 in AI Studio
const PORT = 3000;

app.use(express.json());

const isProduction = process.env.NODE_ENV === 'production';
const autoConnect = process.env.CNCNET_AUTO_CONNECT === 'true' || isProduction;

const botIdentities = ['BOTPRO', 'BOTBegginer', 'BOT2v2'] as const;
const cncnetBots = new Map<string, CnCNetAutoHostBot>(
  botIdentities.map((nick) => [
    nick,
    new CnCNetAutoHostBot({
      server: 'irc.cncnet.org',
      port: 6667,
      useSsl: false,
      nick,
      realName: 'CnCNet Red Alert 1 AutoHost Bot',
      announcementChannel: '#cncnet-ra-games',
      autoReconnect: isProduction,
      reconnectIntervalSec: 5,
      maxReconnectIntervalSec: 60,
      announcementIntervalSec: 30,
    }),
  ])
);

const allBots = () => Array.from(cncnetBots.values());
const getBotForRoom = (roomId: string) => {
  const bot = allBots().find((instance) => instance.getRoom(roomId));
  if (!bot) throw new Error('Room not found');
  return bot;
};

if (autoConnect) {
  for (const bot of allBots()) {
    try {
      bot.connect();
    } catch (err) {
      console.error('Initial CnCNet RA1 IRC connection failed:', err);
    }
  }
} else {
  console.log('[CnCNet Bot] Dev preview mode: all three IRC connections are DISABLED.');
}

// ======================== API ROUTES ========================

// 1. Status & Overview
app.get('/api/status', (req, res) => {
  const statuses = allBots().map((bot) => bot.getStatus());
  const configs = allBots().map((bot) => bot.getConfig());
  res.json({
    status: 'ok',
    data: {
      state: statuses.every((status) => status.state === 'REGISTERED') ? 'REGISTERED' : statuses.some((status) => status.state !== 'DISCONNECTED') ? 'CONNECTING' : 'DISCONNECTED',
      server: configs[0].server,
      port: configs[0].port,
      nick: configs[0].nick,
      bots: statuses,
      rooms: statuses.flatMap((status) => status.rooms),
      stats: {
        totalRoomsCreated: statuses.reduce((sum, status) => sum + status.stats.totalRoomsCreated, 0),
        totalPlayersServed: statuses.reduce((sum, status) => sum + status.stats.totalPlayersServed, 0),
        totalReconnects: statuses.reduce((sum, status) => sum + status.stats.totalReconnects, 0),
        uptimeSeconds: Math.min(...statuses.map((status) => status.stats.uptimeSeconds)),
      },
    },
    config: configs[0],
    botIdentities: botIdentities.map((nick) => ({ nick, status: cncnetBots.get(nick)!.getStatus().state })),
    gameDefinition: RA1_DEFINITION,
  });
});

// 2. Bot Connection Controls
app.post('/api/bot/connect', (req, res) => {
  try {
    for (const bot of allBots()) bot.connect();
    res.json({ success: true, message: 'All three CnCNet connections initiated.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/bot/disconnect', (req, res) => {
  const { reason } = req.body || {};
  try {
    for (const bot of allBots()) bot.disconnect(reason || 'Operator requested disconnect');
    res.json({ success: true, message: 'All three CnCNet bots disconnected.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/bot/reconnect', (req, res) => {
  try {
    for (const bot of allBots()) bot.forceReconnect();
    res.json({ success: true, message: 'All three CnCNet bots reconnecting...' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/bot/config', (req, res) => {
  try {
    const { server, port, useSsl, autoReconnect, announcementIntervalSec } = req.body || {};
    const updates: any = {};
    if (server !== undefined) updates.server = server;
    if (port !== undefined) updates.port = Number(port);
    if (useSsl !== undefined) updates.useSsl = Boolean(useSsl);
     if (autoReconnect !== undefined) updates.autoReconnect = Boolean(autoReconnect);
    if (announcementIntervalSec !== undefined) updates.announcementIntervalSec = Number(announcementIntervalSec);

    for (const bot of allBots()) bot.updateConfig(updates);
    res.json({ success: true, message: 'Shared IRC configuration saved.', config: allBots()[0].getConfig() });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 3. Hosted Rooms Management
app.get('/api/rooms', (req, res) => {
  res.json({ success: true, rooms: allBots().flatMap((bot) => bot.getRooms()) });
});

app.post('/api/rooms/create', (req, res) => {
  try {
    const hostNick = req.body?.hostNick || botIdentities[0];
    const bot = cncnetBots.get(hostNick);
    if (!bot) throw new Error('Invalid hosting identity');
    const room = bot.createRoom(req.body);
    res.json({ success: true, room });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/game-options/meta', (req, res) => {
  res.json({
    success: true,
    dropdowns: RA1_DROPDOWNS,
    checkboxes: RA1_CHECKBOX_DEFINITIONS,
    defaultOptions: DEFAULT_RA1_OPTIONS,
  });
});

app.post('/api/rooms/update', (req, res) => {
  const { roomId, updates } = req.body || {};
  try {
    if (!roomId) throw new Error('roomId is required');
    const bot = getBotForRoom(roomId);
    bot.updateRoomSettings(roomId, updates || {});
    const room = bot.getRoom(roomId);
    res.json({ success: true, message: 'Room updated.', room });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/rooms/lock', (req, res) => {
  const { roomId, locked } = req.body || {};
  try {
    if (!roomId) throw new Error('roomId is required');
    if (typeof locked !== 'boolean') throw new Error('locked must be a boolean');
    const room = getBotForRoom(roomId).setRoomLocked(roomId, locked);
    res.json({ success: true, room, message: locked ? 'Room locked.' : 'Room unlocked.' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/rooms/launch', (req, res) => {
  const { roomId } = req.body || {};
  try {
    if (!roomId) throw new Error('roomId is required');
    const room = getBotForRoom(roomId).launchRoom(roomId);
    res.json({ success: true, room, message: 'Room launch handoff started. Its hosting identity will create the replacement room in 30 seconds.' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/rooms/close', (req, res) => {
  const { roomId, reason } = req.body || {};
  try {
    if (!roomId) throw new Error('roomId is required');
    getBotForRoom(roomId).closeRoom(roomId, reason);
    res.json({ success: true, message: 'Room closed.' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});


app.post('/api/rooms/chat', (req, res) => {
  const { roomId, message } = req.body || {};
  try {
    const bot = getBotForRoom(roomId);
    const room = bot.getRoom(roomId);
    if (!room) throw new Error('Room not found');
    if (!message || !message.trim()) throw new Error('Message is empty');
    bot.sendRaw(`PRIVMSG ${room.channel} :[OPERATOR] ${message.trim()}`);
    res.json({ success: true, message: 'Message sent to room channel.' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/rooms/kick', (req, res) => {
  const { roomId, nick, reason } = req.body || {};
  try {
    const bot = getBotForRoom(roomId);
    const room = bot.getRoom(roomId);
    if (!room) throw new Error('Room not found');
    if (!nick) throw new Error('Nick is required');
    bot.sendRaw(`KICK ${room.channel} ${nick} :${reason || 'Removed by host'}`);
    res.json({ success: true, message: `Player ${nick} kicked.` });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 4. Logs and Chat History
app.get('/api/logs/hosting', (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 200;
  const logs = allBots().flatMap((bot) => bot.getHostingLogs(limit)).sort((a, b) => a.timestamp.localeCompare(b.timestamp)).slice(-limit);
  res.json({ success: true, logs });
});

app.get('/api/logs/chat', (req, res) => {
  const channel = req.query.channel as string | undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 200;
  const logs = allBots().flatMap((bot) => bot.getChatLogs(channel, limit)).sort((a, b) => a.timestamp.localeCompare(b.timestamp)).slice(-limit);
  res.json({ success: true, logs });
});

app.get('/api/logs/file/:type', (req, res) => {
  const type = req.params.type as 'hosting' | 'activity';
  if (type !== 'hosting' && type !== 'activity') {
    return res.status(400).json({ error: 'Invalid log type' });
  }
  const filePath = allBots()[0].getLogFilePath(type);
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      res.json({ success: true, filePath, content });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  } else {
    res.json({ success: true, filePath, content: '(Log file is empty)' });
  }
});

app.get('/api/logs/download/:type', (req, res) => {
  const type = req.params.type as 'hosting' | 'activity';
  if (type !== 'hosting' && type !== 'activity') {
    return res.status(400).send('Invalid log type');
  }
  const filePath = allBots()[0].getLogFilePath(type);
  if (fs.existsSync(filePath)) {
    res.download(filePath, `cncnet_${type}_${new Date().toISOString().slice(0, 10)}.log`);
  } else {
    res.status(404).send('Log file not found');
  }
});

app.post('/api/logs/clear', (req, res) => {
  for (const bot of allBots()) bot.clearLogs();
  res.json({ success: true, message: 'Logs cleared successfully.' });
});

// 5. Sandbox Simulation
app.post('/api/simulate', (req, res) => {
  const { eventType, payload } = req.body || {};
  try {
    const bot = payload?.roomId ? getBotForRoom(payload.roomId) : allBots()[0];
    bot.simulateEvent(eventType, payload);
    res.json({ success: true, message: `Simulated event: ${eventType}` });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ======================== VITE / STATIC INTEGRATION ========================
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(` [CnCNet AutoHost Bot] Running on http://0.0.0.0:${PORT}`);
    console.log(` Compatible with CnCNet XNA Client (xna-cncnet-client)`);
    console.log(` Target Network: irc.cncnet.org:6667`);
    console.log(` IRC identities: ${botIdentities.join(', ')}`);
    console.log(` Active Hosted Rooms: ${allBots().reduce((count, bot) => count + bot.getRooms().length, 0)}`);
    console.log(` Logging directory: ${path.resolve(process.cwd(), 'logs')}`);
    console.log(`======================================================\n`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
