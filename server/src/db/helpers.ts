import { getDb } from './connection';

/**
 * Execute a query that returns rows (SELECT).
 * Returns an array of plain objects.
 */
export function queryAll<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): T[] {
  const db = getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params as any[]);

  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

/**
 * Execute a query that returns a single row.
 */
export function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): T | undefined {
  const results = queryAll<T>(sql, params);
  return results[0];
}

/**
 * Execute a statement that modifies data (INSERT, UPDATE, DELETE).
 * Returns { changes, lastInsertRowid }.
 */
export function execute(
  sql: string,
  params: unknown[] = [],
): { changes: number; lastInsertRowid: number } {
  const db = getDb();
  db.run(sql, params as any[]);

  const changesRow = queryOne<{ changes: number }>('SELECT changes() as changes');
  const lastIdRow = queryOne<{ id: number }>('SELECT last_insert_rowid() as id');

  return {
    changes: changesRow?.changes ?? 0,
    lastInsertRowid: lastIdRow?.id ?? 0,
  };
}

/**
 * Execute raw SQL (e.g., CREATE TABLE statements).
 */
export function execRaw(sql: string): void {
  const db = getDb();
  db.exec(sql);
}
