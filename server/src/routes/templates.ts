import { Router, Request, Response } from 'express';
import { queryAll, execute } from '../db/helpers';
import { saveDb } from '../db/connection';
import { requireAdmin } from '../middleware/identity';

const router = Router();

// GET /api/templates — active only (for meeting creation dropdown)
router.get('/', (_req: Request, res: Response) => {
  const templates = queryAll(
    'SELECT id, name, description, fields_schema, is_active, created_at, updated_at FROM templates WHERE is_active = 1 ORDER BY id',
  );

  const parsed = templates.map((t: any) => ({
    ...t,
    fields_schema: JSON.parse(t.fields_schema),
  }));

  res.json(parsed);
});

// GET /api/templates/all — include inactive (admin management)
router.get('/all', requireAdmin, (_req: Request, res: Response) => {
  const templates = queryAll(
    'SELECT id, name, description, fields_schema, is_active, created_at, updated_at FROM templates ORDER BY id',
  );

  const parsed = templates.map((t: any) => ({
    ...t,
    fields_schema: JSON.parse(t.fields_schema),
  }));

  res.json(parsed);
});

// POST /api/templates (Admin)
router.post('/', requireAdmin, (req: Request, res: Response) => {
  const { name, description, fields_schema } = req.body;

  if (!name || !fields_schema || !Array.isArray(fields_schema)) {
    res.status(400).json({ error: '模板名稱和欄位定義為必填' });
    return;
  }

  const result = execute(
    'INSERT INTO templates (name, description, fields_schema) VALUES (?, ?, ?)',
    [name, description ?? '', JSON.stringify(fields_schema)],
  );

  saveDb();
  res.json({ id: result.lastInsertRowid, message: '模板建立成功' });
});

// PUT /api/templates/:id (Admin)
router.put('/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description, fields_schema } = req.body;

  if (!name || !fields_schema || !Array.isArray(fields_schema)) {
    res.status(400).json({ error: '模板名稱和欄位定義為必填' });
    return;
  }

  const result = execute(
    "UPDATE templates SET name = ?, description = ?, fields_schema = ?, updated_at = datetime('now') WHERE id = ?",
    [name, description ?? '', JSON.stringify(fields_schema), id],
  );

  if (result.changes === 0) {
    res.status(404).json({ error: '模板不存在' });
    return;
  }

  saveDb();
  res.json({ message: '模板更新成功' });
});

// PATCH /api/templates/:id (Admin)
router.patch('/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const { is_active } = req.body;

  const result = execute(
    "UPDATE templates SET is_active = ?, updated_at = datetime('now') WHERE id = ?",
    [is_active ? 1 : 0, id],
  );

  if (result.changes === 0) {
    res.status(404).json({ error: '模板不存在' });
    return;
  }

  saveDb();
  res.json({ message: is_active ? '模板已啟用' : '模板已停用' });
});

export default router;
