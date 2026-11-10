import { Router, Response } from 'express';
import { queryAll, queryOne, execute } from '../db/helpers';
import { saveDb } from '../db/connection';
import { requireAdmin, IdentityRequest } from '../middleware/identity';

// ---------------------------------------------------------------------------
// Admin account & permission management. Users are auto-created on first
// Tailscale login; here an admin assigns roles and locks/unlocks accounts.
// ---------------------------------------------------------------------------

const router = Router();

// GET /api/users — list all users (admin)
router.get('/', requireAdmin, (_req: IdentityRequest, res: Response) => {
  const users = queryAll(
    'SELECT id, email, display_name, role, locked, created_at, first_login_at FROM users ORDER BY created_at',
  );
  res.json(users);
});

// PATCH /api/users/:id — set role and/or locked (admin)
router.patch('/:id', requireAdmin, (req: IdentityRequest, res: Response) => {
  const { role, locked } = req.body;
  const id = Number(req.params.id);

  const user = queryOne<{ id: number; email: string; role: string }>(
    'SELECT id, email, role FROM users WHERE id = ?',
    [id],
  );
  if (!user) {
    res.status(404).json({ error: '找不到使用者' });
    return;
  }

  // Prevent locking yourself out or demoting yourself by accident.
  if (user.email.toLowerCase() === req.identity!.email.toLowerCase()) {
    res.status(400).json({ error: '不能變更自己的角色或鎖定狀態' });
    return;
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  if (role === 'admin' || role === 'member') {
    sets.push('role = ?');
    params.push(role);
  }
  if (typeof locked === 'boolean') {
    sets.push('locked = ?');
    params.push(locked ? 1 : 0);
  }
  if (sets.length === 0) {
    res.status(400).json({ error: '沒有可更新的欄位' });
    return;
  }

  params.push(id);
  execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
  saveDb();
  res.json({ message: '已更新' });
});

export default router;
