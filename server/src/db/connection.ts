import type { Database } from 'sql.js';
import initSqlJs from 'sql.js/dist/sql-asm.js';
import path from 'path';
import fs from 'fs';

// pkg packages the exe into a virtual snapshot filesystem — __dirname points
// inside that snapshot and is NOT writable. For the data directory we need the
// real filesystem path next to the executable.
const isPkg = typeof (process as any).pkg !== 'undefined';
const APP_ROOT = isPkg
  ? path.dirname(process.execPath)
  : path.join(__dirname, '..', '..');

// DATA_DIR env override lets the portable package keep its database outside the
// swappable app/ folder (so upgrades never touch data). Falls back to the dev layout.
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(APP_ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'memofirst.db');

let db: Database | null = null;

export async function initDb(): Promise<Database> {
  if (db) return db;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');
  return db;
}

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

export function saveDb(): void {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Auto-save every 30 seconds
setInterval(() => saveDb(), 30_000);

// Shutdown handler — persist Yjs docs before saving DB
let _shutdownHook: (() => void) | null = null;

/** Register a callback to run before DB save on process exit (e.g. persistAllDocs). */
export function onBeforeShutdown(hook: () => void): void {
  _shutdownHook = hook;
}

function gracefulShutdown(): void {
  if (_shutdownHook) _shutdownHook();
  saveDb();
}

process.on('exit', () => gracefulShutdown());
process.on('SIGINT', () => { gracefulShutdown(); process.exit(0); });
process.on('SIGTERM', () => { gracefulShutdown(); process.exit(0); });
