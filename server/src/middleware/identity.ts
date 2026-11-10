import { Request, Response, NextFunction } from 'express';
import { queryOne, execute } from '../db/helpers';
import { saveDb } from '../db/connection';
import { ADMIN_LOGINS, DEV_BYPASS_LOGIN } from '../config';

// ---------------------------------------------------------------------------
// Tailscale identity middleware.
//
// `tailscale serve` injects `Tailscale-User-Login` (email) and
// `Tailscale-User-Name` (RFC 2047 display name) for the authenticated tailnet
// user. The app trusts these headers ONLY because it binds 127.0.0.1 — a
// headerless request can therefore only come from the host machine, which we
// treat as a bootstrap admin (免鎖死後門). See ts-passwordless-hosting.
// ---------------------------------------------------------------------------

export interface Identity {
  email: string;
  displayName: string;
  role: 'admin' | 'member';
  isAdmin: boolean;
  isHost: boolean; // headerless localhost bootstrap admin
  locked: boolean;
}

export interface IdentityRequest extends Request {
  identity?: Identity;
}

/** Minimal shape shared by Express `Request` and Node `IncomingMessage` (WS upgrade). */
interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  socket: { remoteAddress?: string };
}

const HOST_EMAIL = 'host@localhost';

function isLoopback(addr: string | undefined): boolean {
  if (!addr) return false;
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

/** Decode an RFC 2047 encoded-word (=?utf-8?q?...?= or ?b?). Best-effort. */
export function decodeRfc2047(input: string | undefined): string {
  if (!input) return '';
  return input
    .replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_m, _charset, enc, text) => {
      try {
        if (String(enc).toLowerCase() === 'b') {
          return Buffer.from(text, 'base64').toString('utf8');
        }
        // Q-encoding: '_' => space, '=XX' => byte
        const bytes: number[] = [];
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          if (ch === '_') {
            bytes.push(0x20);
          } else if (ch === '=') {
            bytes.push(parseInt(text.substr(i + 1, 2), 16));
            i += 2;
          } else {
            bytes.push(ch.charCodeAt(0));
          }
        }
        return Buffer.from(bytes).toString('utf8');
      } catch {
        return text;
      }
    })
    .trim();
}

interface UserRow {
  id: number;
  email: string;
  display_name: string;
  role: string;
  locked: number;
}

/** Look up (or auto-create) a user by email, applying ADMIN_LOGINS promotion. */
function resolveUser(email: string, displayNameRaw: string): Identity {
  const normalized = email.trim().toLowerCase();
  const shouldBeAdmin = ADMIN_LOGINS.has(normalized);

  let row = queryOne<UserRow>(
    'SELECT id, email, display_name, role, locked FROM users WHERE email = ?',
    [normalized],
  );

  if (!row) {
    const displayName = decodeRfc2047(displayNameRaw) || normalized;
    execute('INSERT INTO users (email, display_name, role) VALUES (?, ?, ?)', [
      normalized,
      displayName,
      shouldBeAdmin ? 'admin' : 'member',
    ]);
    saveDb();
    row = queryOne<UserRow>(
      'SELECT id, email, display_name, role, locked FROM users WHERE email = ?',
      [normalized],
    )!;
  } else if (shouldBeAdmin && row.role !== 'admin') {
    // Idempotent promotion from ADMIN_LOGINS
    execute('UPDATE users SET role = ? WHERE id = ?', ['admin', row.id]);
    saveDb();
    row.role = 'admin';
  }

  const isAdmin = row.role === 'admin';
  return {
    email: row.email,
    displayName: row.display_name,
    role: isAdmin ? 'admin' : 'member',
    isAdmin,
    isHost: false,
    locked: row.locked === 1,
  };
}

/** Resolve the identity of a request from its headers / source address. */
export function resolveIdentity(req: RequestLike): Identity | null {
  const loginHeader = (req.headers['tailscale-user-login'] as string | undefined)
    ?.trim()
    .toLowerCase();

  if (loginHeader) {
    return resolveUser(
      loginHeader,
      (req.headers['tailscale-user-name'] as string | undefined) ?? '',
    );
  }

  // No header. Because the app binds 127.0.0.1 only, a headerless request can
  // only originate from the host machine → treat as bootstrap admin.
  if (isLoopback(req.socket.remoteAddress)) {
    return {
      email: HOST_EMAIL,
      displayName: '本機管理者',
      role: 'admin',
      isAdmin: true,
      isHost: true,
      locked: false,
    };
  }

  // Dev override when running without serve on a non-loopback bind.
  if (DEV_BYPASS_LOGIN) {
    return resolveUser(DEV_BYPASS_LOGIN, 'Dev User');
  }

  return null;
}

export function ensureIdentity(
  req: IdentityRequest,
  res: Response,
  next: NextFunction,
): void {
  const identity = resolveIdentity(req);
  if (!identity) {
    res.status(401).json({
      needTailscale: true,
      error: '請透過 Tailscale 網址存取（裝置需登入同一個 tailnet）',
    });
    return;
  }
  if (identity.locked) {
    res.status(403).json({ error: '帳號已被停用，請洽管理者' });
    return;
  }
  req.identity = identity;
  next();
}

export function requireAdmin(
  req: IdentityRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!req.identity?.isAdmin) {
    res.status(403).json({ error: '需要管理者權限' });
    return;
  }
  next();
}

/** Whether an identity may view a meeting's content (REST + Yjs). */
export function hasMeetingAccess(
  meeting: { id: number; created_by: string | null; join_password_hash: string | null },
  identity: Identity,
): boolean {
  if (!meeting.join_password_hash) return true; // open meeting
  if (identity.isAdmin) return true; // admin sees all
  if (
    meeting.created_by &&
    meeting.created_by.toLowerCase() === identity.email.toLowerCase()
  ) {
    return true; // creator
  }
  const grant = queryOne<{ ok: number }>(
    'SELECT 1 AS ok FROM meeting_access WHERE meeting_id = ? AND user_email = ?',
    [meeting.id, identity.email],
  );
  return !!grant;
}
