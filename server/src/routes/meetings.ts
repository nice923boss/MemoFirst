import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { queryAll, queryOne, execute } from '../db/helpers';
import { saveDb } from '../db/connection';
import {
  IdentityRequest,
  requireAdmin,
  hasMeetingAccess,
} from '../middleware/identity';
import { validateJoinPassword } from '../config';
import { getDocContent } from '../yjs/export';

const PARTICIPANT_COLORS = [
  '#F59E0B', '#EF4444', '#3B82F6', '#10B981', '#8B5CF6',
  '#EC4899', '#F97316', '#06B6D4', '#84CC16', '#6366F1',
];

const router = Router();

// Rate limiter for join-password attempts (max 10 per 15 min)
const unlockLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: '嘗試次數過多，請 15 分鐘後再試' },
  standardHeaders: true,
  legacyHeaders: false,
});

function isCreatorOf(meeting: { created_by: string | null }, email: string): boolean {
  return !!meeting.created_by && meeting.created_by.toLowerCase() === email.toLowerCase();
}

// GET /api/meetings — list all meetings with the caller's access state
router.get('/', (req: IdentityRequest, res: Response) => {
  const identity = req.identity!;
  const meetings = queryAll<any>(
    'SELECT m.*, t.name as template_name FROM meetings m LEFT JOIN templates t ON m.template_id = t.id ORDER BY m.created_at DESC',
  );

  const shaped = meetings.map((m) => {
    const access = { id: m.id, created_by: m.created_by, join_password_hash: m.join_password_hash };
    const isCreator = isCreatorOf(m, identity.email);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { join_password_hash, ...rest } = m;
    return {
      ...rest,
      has_password: !!join_password_hash,
      locked: !hasMeetingAccess(access, identity),
      is_creator: isCreator,
      can_manage: identity.isAdmin || isCreator,
    };
  });

  res.json(shaped);
});

// POST /api/meetings — any identity may create; optional join password
router.post('/', async (req: IdentityRequest, res: Response) => {
  const { title, template_id, join_password } = req.body;

  if (!title || !String(title).trim()) {
    res.status(400).json({ error: '會議標題為必填' });
    return;
  }

  let joinHash: string | null = null;
  if (join_password !== undefined && join_password !== null && String(join_password) !== '') {
    const validation = validateJoinPassword(join_password);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }
    joinHash = await bcrypt.hash(String(join_password), 10);
  }

  const yjsDocId = `meeting-${uuidv4()}`;

  const result = execute(
    'INSERT INTO meetings (title, template_id, yjs_doc_id, created_by, join_password_hash) VALUES (?, ?, ?, ?, ?)',
    [String(title).trim(), template_id ?? null, yjsDocId, req.identity!.email, joinHash],
  );

  saveDb();

  res.json({
    id: result.lastInsertRowid,
    yjs_doc_id: yjsDocId,
    message: '會議建立成功',
  });
});

// GET /api/meetings/:id — metadata + caller access state (no doc content here)
router.get('/:id', (req: IdentityRequest, res: Response) => {
  const meeting = queryOne<{
    id: number;
    title: string;
    template_id: number | null;
    yjs_doc_id: string;
    status: string;
    created_by: string | null;
    join_password_hash: string | null;
    created_at: string;
    closed_at: string | null;
    template_name: string | null;
    fields_schema: string | null;
  }>(
    'SELECT m.*, t.name as template_name, t.fields_schema FROM meetings m LEFT JOIN templates t ON m.template_id = t.id WHERE m.id = ?',
    [req.params.id],
  );

  if (!meeting) {
    res.status(404).json({ error: '會議不存在' });
    return;
  }

  const identity = req.identity!;
  const locked = !hasMeetingAccess(meeting, identity);
  const isCreator = isCreatorOf(meeting, identity.email);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { join_password_hash, fields_schema, ...rest } = meeting;

  res.json({
    ...rest,
    fields_schema: locked ? null : fields_schema ? JSON.parse(fields_schema) : null,
    has_password: !!join_password_hash,
    locked,
    is_creator: isCreator,
    can_manage: identity.isAdmin || isCreator,
  });
});

// POST /api/meetings/:id/unlock — verify join password, grant access
router.post('/:id/unlock', unlockLimiter, async (req: IdentityRequest, res: Response) => {
  const { password } = req.body;

  const meeting = queryOne<{ id: number; join_password_hash: string | null }>(
    'SELECT id, join_password_hash FROM meetings WHERE id = ?',
    [req.params.id],
  );
  if (!meeting) {
    res.status(404).json({ error: '會議不存在' });
    return;
  }

  // Open meeting — nothing to unlock
  if (!meeting.join_password_hash) {
    res.json({ success: true });
    return;
  }

  const ok = typeof password === 'string' && (await bcrypt.compare(password, meeting.join_password_hash));
  if (!ok) {
    res.status(403).json({ error: '密碼錯誤' });
    return;
  }

  execute('INSERT OR IGNORE INTO meeting_access (meeting_id, user_email) VALUES (?, ?)', [
    meeting.id,
    req.identity!.email,
  ]);
  saveDb();

  res.json({ success: true });
});

// PATCH /api/meetings/:id — status / rename (admin or creator)
router.patch('/:id', (req: IdentityRequest, res: Response) => {
  const meeting = queryOne<{ id: number; created_by: string | null }>(
    'SELECT id, created_by FROM meetings WHERE id = ?',
    [req.params.id],
  );
  if (!meeting) {
    res.status(404).json({ error: '會議不存在' });
    return;
  }

  const identity = req.identity!;
  if (!identity.isAdmin && !isCreatorOf(meeting, identity.email)) {
    res.status(403).json({ error: '只有管理者或建立者可以變更此會議' });
    return;
  }

  const { status, title } = req.body;

  // Rename only
  if (title !== undefined && status === undefined) {
    if (!title.trim()) {
      res.status(400).json({ error: '會議標題不可為空' });
      return;
    }
    execute('UPDATE meetings SET title = ? WHERE id = ?', [title.trim(), req.params.id]);
    saveDb();
    res.json({ message: '會議名稱已更新' });
    return;
  }

  // Status change
  const validStatuses = ['draft', 'active', 'closed'];
  if (!status || !validStatuses.includes(status)) {
    res.status(400).json({ error: '無效的狀態值' });
    return;
  }

  let updates: string;
  if (status === 'closed') {
    updates = "status = ?, closed_at = datetime('now')";
  } else if (status === 'active') {
    updates = 'status = ?, closed_at = NULL';
  } else {
    updates = 'status = ?';
  }

  execute(`UPDATE meetings SET ${updates} WHERE id = ?`, [status, req.params.id]);
  saveDb();
  res.json({ message: '會議狀態已更新' });
});

// DELETE /api/meetings/:id — admin only, closed meetings only
router.delete('/:id', requireAdmin, (req: IdentityRequest, res: Response) => {
  const meeting = queryOne<{ id: number; title: string; status: string; yjs_doc_id: string }>(
    'SELECT id, title, status, yjs_doc_id FROM meetings WHERE id = ?',
    [req.params.id],
  );

  if (!meeting) {
    res.status(404).json({ error: '會議不存在' });
    return;
  }

  if (meeting.status !== 'closed') {
    res.status(400).json({ error: '只能刪除已結束的會議' });
    return;
  }

  execute('DELETE FROM extracted_data WHERE meeting_id = ?', [meeting.id]);
  execute('DELETE FROM annotations WHERE meeting_id = ?', [meeting.id]);
  execute('DELETE FROM participants WHERE meeting_id = ?', [meeting.id]);
  execute('DELETE FROM meeting_access WHERE meeting_id = ?', [meeting.id]);
  execute('DELETE FROM yjs_documents WHERE doc_id = ?', [meeting.yjs_doc_id]);
  execute('DELETE FROM meetings WHERE id = ?', [meeting.id]);

  saveDb();
  res.json({ message: '會議已刪除' });
});

// POST /api/meetings/:id/join — register a participant nickname (needs access)
router.post('/:id/join', (req: IdentityRequest, res: Response) => {
  const { nickname } = req.body;
  const meetingId = req.params.id;

  if (!nickname) {
    res.status(400).json({ error: '暱稱為必填' });
    return;
  }

  const meeting = queryOne<{ id: number; status: string; created_by: string | null; join_password_hash: string | null }>(
    'SELECT id, status, created_by, join_password_hash FROM meetings WHERE id = ?',
    [meetingId],
  );
  if (!meeting) {
    res.status(404).json({ error: '會議不存在' });
    return;
  }

  if (!hasMeetingAccess(meeting, req.identity!)) {
    res.status(403).json({ error: '需要先輸入加入密碼', locked: true });
    return;
  }

  const existing = queryOne<{ id: number; color: string }>(
    'SELECT id, color FROM participants WHERE meeting_id = ? AND nickname = ?',
    [meetingId, nickname],
  );

  if (existing) {
    res.json({ participantId: existing.id, color: existing.color, message: '歡迎回來' });
    return;
  }

  const countRow = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM participants WHERE meeting_id = ?',
    [meetingId],
  );

  const color = PARTICIPANT_COLORS[(countRow?.count ?? 0) % PARTICIPANT_COLORS.length]!;

  const result = execute(
    'INSERT INTO participants (meeting_id, nickname, color) VALUES (?, ?, ?)',
    [meetingId, nickname, color],
  );

  saveDb();
  res.json({ participantId: result.lastInsertRowid, color, message: '加入成功' });
});

// GET /api/meetings/:id/content — export document content (needs access)
router.get('/:id/content', (req: IdentityRequest, res: Response) => {
  const meeting = queryOne<{ id: number; title: string; yjs_doc_id: string; created_by: string | null; join_password_hash: string | null }>(
    'SELECT id, title, yjs_doc_id, created_by, join_password_hash FROM meetings WHERE id = ?',
    [req.params.id],
  );

  if (!meeting) {
    res.status(404).json({ error: '會議不存在' });
    return;
  }

  if (!hasMeetingAccess(meeting, req.identity!)) {
    res.status(403).json({ error: '沒有存取權，請先輸入加入密碼', locked: true });
    return;
  }

  const { html, annotations } = getDocContent(meeting.yjs_doc_id);

  res.json({
    title: meeting.title,
    html,
    annotations,
  });
});

// GET /api/meetings/:id/participants — needs access
router.get('/:id/participants', (req: IdentityRequest, res: Response) => {
  const meeting = queryOne<{ id: number; created_by: string | null; join_password_hash: string | null }>(
    'SELECT id, created_by, join_password_hash FROM meetings WHERE id = ?',
    [req.params.id],
  );
  if (!meeting) {
    res.status(404).json({ error: '會議不存在' });
    return;
  }

  if (!hasMeetingAccess(meeting, req.identity!)) {
    res.status(403).json({ error: '沒有存取權', locked: true });
    return;
  }

  const participants = queryAll(
    'SELECT id, nickname, color, joined_at FROM participants WHERE meeting_id = ? ORDER BY joined_at',
    [req.params.id],
  );
  res.json(participants);
});

// DELETE /api/meetings/:id/participants/:participantId — admin or creator
router.delete('/:id/participants/:participantId', (req: IdentityRequest, res: Response) => {
  const { id, participantId } = req.params;

  const meeting = queryOne<{ id: number; created_by: string | null }>(
    'SELECT id, created_by FROM meetings WHERE id = ?',
    [id],
  );
  if (!meeting) {
    res.status(404).json({ error: '會議不存在' });
    return;
  }

  const identity = req.identity!;
  if (!identity.isAdmin && !isCreatorOf(meeting, identity.email)) {
    res.status(403).json({ error: '只有管理者或建立者可以移除參與者' });
    return;
  }

  const participant = queryOne(
    'SELECT id FROM participants WHERE id = ? AND meeting_id = ?',
    [participantId, id],
  );
  if (!participant) {
    res.status(404).json({ error: '找不到該參與者' });
    return;
  }

  execute('DELETE FROM participants WHERE id = ? AND meeting_id = ?', [participantId, id]);
  saveDb();
  res.json({ message: '已刪除參與者' });
});

export default router;
