import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import * as Y from 'yjs';
import { queryOne, execute } from '../db/helpers';
import { saveDb } from '../db/connection';
import { resolveIdentity, hasMeetingAccess } from '../middleware/identity';

// In-memory Yjs document store
const docs = new Map<string, Y.Doc>();

// Timestamp of last client disconnect per doc (for TTL eviction)
const docLastDisconnect = new Map<string, number>();

// TTL: evict idle docs after 5 minutes of no connections
const DOC_TTL_MS = 5 * 60 * 1000;

// Awareness connections per doc
const connections = new Map<string, Set<{ ws: WebSocket; clientId: number }>>();

function getYDoc(docName: string): Y.Doc {
  // Clear eviction timestamp — doc is in use
  docLastDisconnect.delete(docName);

  let doc = docs.get(docName);
  if (doc) return doc;

  doc = new Y.Doc();

  // Try to load persisted state
  const saved = queryOne<{ doc_state: Buffer }>(
    'SELECT doc_state FROM yjs_documents WHERE doc_id = ?',
    [docName],
  );

  if (saved?.doc_state) {
    Y.applyUpdate(doc, new Uint8Array(saved.doc_state));
  }

  docs.set(docName, doc);
  return doc;
}

function persistDoc(docName: string, doc: Y.Doc): void {
  const state = Y.encodeStateAsUpdate(doc);
  const stateVector = Y.encodeStateVector(doc);

  const existing = queryOne('SELECT doc_id FROM yjs_documents WHERE doc_id = ?', [docName]);

  if (existing) {
    execute(
      "UPDATE yjs_documents SET doc_state = ?, state_vector = ?, updated_at = datetime('now') WHERE doc_id = ?",
      [Buffer.from(state), Buffer.from(stateVector), docName],
    );
  } else {
    execute(
      'INSERT INTO yjs_documents (doc_id, doc_state, state_vector) VALUES (?, ?, ?)',
      [docName, Buffer.from(state), Buffer.from(stateVector)],
    );
  }

  saveDb();
}

/**
 * Persist ALL in-memory docs and save DB.
 * Called on process shutdown to avoid data loss.
 */
export function persistAllDocs(): void {
  for (const [docName, doc] of docs) {
    persistDoc(docName, doc);
  }
}

/**
 * Evict idle docs that have had no connections for longer than DOC_TTL_MS.
 */
function evictIdleDocs(): void {
  const now = Date.now();
  for (const [docName, lastDisconnect] of docLastDisconnect) {
    if (now - lastDisconnect > DOC_TTL_MS) {
      const doc = docs.get(docName);
      if (doc) {
        persistDoc(docName, doc);
        doc.destroy();
        docs.delete(docName);
      }
      docLastDisconnect.delete(docName);
      connections.delete(docName);
    }
  }
}

// Message types (matching y-websocket protocol)
const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

const MSG_SYNC_STEP1 = 0;
const MSG_SYNC_STEP2 = 1;
const MSG_SYNC_UPDATE = 2;

function writeVarUint(encoder: number[], num: number): void {
  while (num > 0x7f) {
    encoder.push(0x80 | (num & 0x7f));
    num >>>= 7;
  }
  encoder.push(num & 0x7f);
}

function readVarUint(data: Uint8Array, offset: { value: number }): number {
  let num = 0;
  let shift = 0;
  while (true) {
    const byte = data[offset.value++]!;
    num |= (byte & 0x7f) << shift;
    if (byte < 0x80) break;
    shift += 7;
  }
  return num;
}

function readVarUint8Array(data: Uint8Array, offset: { value: number }): Uint8Array {
  const length = readVarUint(data, offset);
  const result = data.slice(offset.value, offset.value + length);
  offset.value += length;
  return result;
}

function createSyncStep1(doc: Y.Doc): Uint8Array {
  const sv = Y.encodeStateVector(doc);
  const encoder: number[] = [];
  writeVarUint(encoder, MSG_SYNC);
  writeVarUint(encoder, MSG_SYNC_STEP1);
  writeVarUint(encoder, sv.length);
  return new Uint8Array([...encoder, ...sv]);
}

function createSyncStep2(doc: Y.Doc, sv: Uint8Array): Uint8Array {
  const update = Y.encodeStateAsUpdate(doc, sv);
  const encoder: number[] = [];
  writeVarUint(encoder, MSG_SYNC);
  writeVarUint(encoder, MSG_SYNC_STEP2);
  writeVarUint(encoder, update.length);
  return new Uint8Array([...encoder, ...update]);
}

export function setupYjsWebSocket(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    const url = new URL(request.url ?? '', `http://${request.headers.host}`);

    // Only handle /ws/* paths
    if (!url.pathname.startsWith('/ws/')) {
      socket.destroy();
      return;
    }

    const docName = url.pathname.slice(4); // strip "/ws/"

    // Identity + per-meeting access gate. serve injects the Tailscale header on
    // the WS upgrade too; a headerless request can only be the local host.
    const identity = resolveIdentity(request);
    if (!identity || identity.locked) {
      socket.destroy();
      return;
    }

    const meeting = queryOne<{ id: number; created_by: string | null; join_password_hash: string | null }>(
      'SELECT id, created_by, join_password_hash FROM meetings WHERE yjs_doc_id = ?',
      [docName],
    );
    if (!meeting || !hasMeetingAccess(meeting, identity)) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      handleConnection(ws, docName);
    });
  });

  // Persist all docs every 60 seconds
  setInterval(() => persistAllDocs(), 60_000);

  // Evict idle docs every 2 minutes
  setInterval(() => evictIdleDocs(), 2 * 60_000);

  console.log('  Yjs WebSocket 服務已啟動 (路徑: /ws/<docId>)');
}

function handleConnection(ws: WebSocket, docName: string): void {
  const doc = getYDoc(docName);
  const clientId = Math.floor(Math.random() * 0xffffffff);

  // Track connection
  if (!connections.has(docName)) {
    connections.set(docName, new Set());
  }
  const conns = connections.get(docName)!;
  const conn = { ws, clientId };
  conns.add(conn);

  // Send initial sync step 1
  const syncStep1 = createSyncStep1(doc);
  ws.send(syncStep1);

  ws.on('message', (rawData: Buffer) => {
    const data = new Uint8Array(rawData);
    const offset = { value: 0 };
    const msgType = readVarUint(data, offset);

    if (msgType === MSG_SYNC) {
      const syncType = readVarUint(data, offset);

      if (syncType === MSG_SYNC_STEP1) {
        // Client sends state vector, we respond with missing updates
        const sv = readVarUint8Array(data, offset);
        const reply = createSyncStep2(doc, sv);
        ws.send(reply);
      } else if (syncType === MSG_SYNC_STEP2 || syncType === MSG_SYNC_UPDATE) {
        // Client sends update
        const update = readVarUint8Array(data, offset);
        Y.applyUpdate(doc, update);

        // Repackage as sync update and broadcast to all other clients
        const encoder: number[] = [];
        writeVarUint(encoder, MSG_SYNC);
        writeVarUint(encoder, MSG_SYNC_UPDATE);
        writeVarUint(encoder, update.length);
        const broadcast = new Uint8Array([...encoder, ...update]);

        for (const c of conns) {
          if (c.ws !== ws && c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(broadcast);
          }
        }
      }
    } else if (msgType === MSG_AWARENESS) {
      // Broadcast awareness to all other clients
      for (const c of conns) {
        if (c.ws !== ws && c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(data);
        }
      }
    }
  });

  ws.on('close', () => {
    conns.delete(conn);

    if (conns.size === 0) {
      // Persist when last client disconnects
      persistDoc(docName, doc);
      connections.delete(docName);
      // Mark for TTL eviction instead of keeping forever
      docLastDisconnect.set(docName, Date.now());
    }
  });
}
