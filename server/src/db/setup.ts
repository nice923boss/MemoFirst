import 'dotenv/config';
import { initDb, saveDb } from './connection';
import { initializeDatabase, migrateDatabase } from './schema';
import { seedTemplates } from './seed';

async function setup() {
  console.log('MemoFirst Setup');
  console.log('====================');

  // 0. Initialize sql.js
  await initDb();

  // 1. Initialize database tables
  console.log('\n[1/2] Creating database tables...');
  initializeDatabase();
  migrateDatabase();
  console.log('  Done');

  // 2. Seed default templates
  console.log('\n[2/2] Seeding default templates...');
  seedTemplates();

  // Save to disk
  saveDb();

  console.log('\n====================');
  console.log('Setup complete! Run "npm run dev" to start the server.');
  console.log('身分由 Tailscale 提供，無需建立管理員帳號密碼。');
}

setup().catch(console.error);
