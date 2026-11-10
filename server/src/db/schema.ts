import { execRaw, queryAll } from './helpers';

export function initializeDatabase(): void {
  execRaw(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL COLLATE NOCASE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      locked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      first_login_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      fields_schema TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      template_id INTEGER REFERENCES templates(id),
      yjs_doc_id TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'draft',
      created_by TEXT,
      join_password_hash TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      closed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS meeting_access (
      meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      user_email TEXT NOT NULL COLLATE NOCASE,
      granted_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (meeting_id, user_email)
    );

    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER REFERENCES meetings(id) ON DELETE CASCADE,
      nickname TEXT NOT NULL,
      color TEXT NOT NULL,
      joined_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS annotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER REFERENCES meetings(id) ON DELETE CASCADE,
      annotation_id TEXT NOT NULL,
      author_nickname TEXT NOT NULL,
      content TEXT NOT NULL,
      anchor_text TEXT,
      anchor_from INTEGER,
      anchor_to INTEGER,
      parent_id TEXT,
      resolved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS extracted_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER REFERENCES meetings(id) ON DELETE CASCADE,
      template_id INTEGER REFERENCES templates(id),
      row_index INTEGER NOT NULL,
      field_key TEXT NOT NULL,
      field_value TEXT,
      filled_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS yjs_documents (
      doc_id TEXT PRIMARY KEY,
      state_vector BLOB,
      doc_state BLOB,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

/** Add columns that may be missing in databases created before this version. */
export function migrateDatabase(): void {
  const columns = queryAll<{ name: string }>('PRAGMA table_info(meetings)');
  if (!columns.some((c) => c.name === 'join_password_hash')) {
    execRaw('ALTER TABLE meetings ADD COLUMN join_password_hash TEXT');
  }
}
