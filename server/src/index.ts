import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import path from 'path';
import os from 'os';
import { initDb, onBeforeShutdown } from './db/connection';
import { initializeDatabase, migrateDatabase } from './db/schema';
import { seedTemplates } from './db/seed';
import { PORT, HOST, getPublicUrl } from './config';
import { ensureIdentity, IdentityRequest } from './middleware/identity';
import { setupYjsWebSocket, persistAllDocs } from './yjs/server';
import usersRoutes from './routes/users';
import meetingsRoutes from './routes/meetings';
import templatesRoutes from './routes/templates';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Server info — public (no identity). Used by home + guide page to show the URL.
app.get('/api/server-info', (_req, res) => {
  res.json({
    publicUrl: getPublicUrl(),
    lanUrl: `http://${getLanIp()}:${PORT}`,
    localUrl: `http://localhost:${PORT}`,
    port: PORT,
  });
});

// Identity guard — everything below requires a resolved Tailscale identity
app.use('/api', ensureIdentity);

// Current identity — frontend calls this on startup; 401 → guide page
app.get('/api/auth/me', (req: IdentityRequest, res) => {
  const id = req.identity!;
  res.json({
    email: id.email,
    displayName: id.displayName,
    role: id.role,
    isAdmin: id.isAdmin,
    isHost: id.isHost,
  });
});

// Routes
app.use('/api/users', usersRoutes);
app.use('/api/meetings', meetingsRoutes);
app.use('/api/templates', templatesRoutes);

// Serve the built client
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Get LAN IP for display (fallback when no Tailscale URL is available)
function getLanIp(): string {
  const interfaces = os.networkInterfaces();
  for (const addrs of Object.values(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }
  return 'localhost';
}

async function start() {
  // Initialize sql.js + create tables + migrate
  await initDb();
  initializeDatabase();
  migrateDatabase();
  seedTemplates();

  // Register Yjs persistence on shutdown so docs are saved before DB flush
  onBeforeShutdown(persistAllDocs);

  // Create HTTP server (shared between Express and WebSocket)
  const server = http.createServer(app);

  // Attach Yjs WebSocket to the same HTTP server
  setupYjsWebSocket(server);

  // Bind 127.0.0.1 only — tailscale serve reverse-proxies the tailnet.
  server.listen(PORT, HOST, () => {
    const publicUrl = getPublicUrl();
    console.log('');
    console.log('  ╔══════════════════════════════════════════════╗');
    console.log('  ║            MemoFirst 伺服器已啟動             ║');
    console.log('  ╚══════════════════════════════════════════════╝');
    console.log(`  本機維運：http://localhost:${PORT}  （綁定 ${HOST}）`);
    if (publicUrl) {
      console.log(`  同事連線：${publicUrl}`);
    } else {
      console.log('  同事連線：尚未設定 Tailscale serve，請執行 serve-setup.bat');
    }
    console.log('  身分由 Tailscale 提供，全程免帳號密碼。');
    console.log('');
  });
}

start().catch(console.error);
