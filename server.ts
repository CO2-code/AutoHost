import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { CnCNetAutoHostBot, RA1_DEFINITION } from './server/cncnetBot.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Dev server must always listen on port 3000 in AI Studio
const PORT = 3000;

app.use(express.json());

// Initialize CnCNet Red Alert 1 AutoHost Bot
const cncnetBot = new CnCNetAutoHostBot({
  server: 'irc.cncnet.org',
  port: 6667,
  useSsl: false,
  nick: 'RA1_AutoHost',
  realName: 'CnCNet Red Alert 1 AutoHost Bot',
  announcementChannel: '#cncnet-ra-games',
  autoReconnect: true,
  reconnectIntervalSec: 5,
  maxReconnectIntervalSec: 60,
  announcementIntervalSec: 30,
});

// Auto-connect on server launch
try {
  cncnetBot.connect();
} catch (err) {
  console.error('Initial CnCNet RA1 IRC connection failed:', err);
}

// ======================== API ROUTES ========================

// 1. Status & Overview
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    data: cncnetBot.getStatus(),
    config: cncnetBot.getConfig(),
    gameDefinition: RA1_DEFINITION,
  });
});

// 2. Bot Connection Controls
app.post('/api/bot/connect', (req, res) => {
  try {
    cncnetBot.connect();
    res.json({ success: true, message: 'CnCNet connection initiated.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/bot/disconnect', (req, res) => {
  const { reason } = req.body || {};
  try {
    cncnetBot.disconnect(reason || 'Operator requested disconnect');
    res.json({ success: true, message: 'CnCNet bot disconnected.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/bot/reconnect', (req, res) => {
  try {
    cncnetBot.forceReconnect();
    res.json({ success: true, message: 'CnCNet bot reconnecting...' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/bot/config', (req, res) => {
  try {
    const { server, port, useSsl, nick, autoReconnect, announcementIntervalSec } = req.body || {};
    const updates: any = {};
    if (server !== undefined) updates.server = server;
    if (port !== undefined) updates.port = Number(port);
    if (useSsl !== undefined) updates.useSsl = Boolean(useSsl);
    if (nick !== undefined) updates.nick = nick.trim();
    if (autoReconnect !== undefined) updates.autoReconnect = Boolean(autoReconnect);
    if (announcementIntervalSec !== undefined) updates.announcementIntervalSec = Number(announcementIntervalSec);

    cncnetBot.updateConfig(updates);
    res.json({ success: true, message: 'Configuration saved.', config: cncnetBot.getConfig() });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 3. Hosted Rooms Management
app.get('/api/rooms', (req, res) => {
  res.json({ success: true, rooms: cncnetBot.getRooms() });
});

app.post('/api/rooms/create', (req, res) => {
  try {
    const room = cncnetBot.createRoom(req.body);
    res.json({ success: true, room });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/rooms/update', (req, res) => {
  const { roomId, updates } = req.body || {};
  try {
    if (!roomId) throw new Error('roomId is required');
    cncnetBot.updateRoomSettings(roomId, updates || {});
    res.json({ success: true, message: 'Room updated.' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/rooms/lock', (req, res) => {
  const { roomId, locked } = req.body || {};
  try {
    if (!roomId) throw new Error('roomId is required');
    if (typeof locked !== 'boolean') throw new Error('locked must be a boolean');
    const room = cncnetBot.setRoomLocked(roomId, locked);
    res.json({ success: true, room, message: locked ? 'Room locked.' : 'Room unlocked.' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/rooms/launch', (req, res) => {
  const { roomId } = req.body || {};
  try {
    if (!roomId) throw new Error('roomId is required');
    const room = cncnetBot.launchRoom(roomId);
    res.json({ success: true, room, message: 'Room launch handoff started. A replacement room will be created in 30 seconds.' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/rooms/close', (req, res) => {
  const { roomId, reason } = req.body || {};
  try {
    if (!roomId) throw new Error('roomId is required');
    cncnetBot.closeRoom(roomId, reason);
    res.json({ success: true, message: 'Room closed.' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});


app.post('/api/rooms/chat', (req, res) => {
  const { roomId, message } = req.body || {};
  try {
    const room = cncnetBot.getRoom(roomId);
    if (!room) throw new Error('Room not found');
    if (!message || !message.trim()) throw new Error('Message is empty');
    cncnetBot.sendRaw(`PRIVMSG ${room.channel} :[OPERATOR] ${message.trim()}`);
    res.json({ success: true, message: 'Message sent to room channel.' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/rooms/kick', (req, res) => {
  const { roomId, nick, reason } = req.body || {};
  try {
    const room = cncnetBot.getRoom(roomId);
    if (!room) throw new Error('Room not found');
    if (!nick) throw new Error('Nick is required');
    cncnetBot.sendRaw(`KICK ${room.channel} ${nick} :${reason || 'Removed by host'}`);
    res.json({ success: true, message: `Player ${nick} kicked.` });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 4. Logs and Chat History
app.get('/api/logs/hosting', (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 200;
  res.json({ success: true, logs: cncnetBot.getHostingLogs(limit) });
});

app.get('/api/logs/chat', (req, res) => {
  const channel = req.query.channel as string | undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 200;
  res.json({ success: true, logs: cncnetBot.getChatLogs(channel, limit) });
});

app.get('/api/logs/file/:type', (req, res) => {
  const type = req.params.type as 'hosting' | 'activity';
  if (type !== 'hosting' && type !== 'activity') {
    return res.status(400).json({ error: 'Invalid log type' });
  }
  const filePath = cncnetBot.getLogFilePath(type);
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
  const filePath = cncnetBot.getLogFilePath(type);
  if (fs.existsSync(filePath)) {
    res.download(filePath, `cncnet_${type}_${new Date().toISOString().slice(0, 10)}.log`);
  } else {
    res.status(404).send('Log file not found');
  }
});

app.post('/api/logs/clear', (req, res) => {
  cncnetBot.clearLogs();
  res.json({ success: true, message: 'Logs cleared successfully.' });
});

// 5. Sandbox Simulation
app.post('/api/simulate', (req, res) => {
  const { eventType, payload } = req.body || {};
  try {
    cncnetBot.simulateEvent(eventType, payload);
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
    console.log(` Active Hosted Rooms: ${cncnetBot.getRooms().length}`);
    console.log(` Logging directory: ${path.resolve(process.cwd(), 'logs')}`);
    console.log(`======================================================\n`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
