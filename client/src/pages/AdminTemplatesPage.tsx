import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { get, post, put, patch } from '../api/client';

interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'date';
  required?: boolean;
  options?: string[];
}

interface Template {
  id: number;
  name: string;
  description: string;
  fields_schema: FieldDef[];
  is_active: number;
  created_at: string;
  updated_at: string;
}

const EMPTY_FIELD: FieldDef = { key: '', label: '', type: 'text', required: false };

export default function AdminTemplatesPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formFields, setFormFields] = useState<FieldDef[]>([{ ...EMPTY_FIELD }]);

  const loadTemplates = useCallback(async () => {
    const result = await get<Template[]>('/templates/all');
    if (result.success && result.data) {
      setTemplates(result.data);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const resetForm = () => {
    setFormName('');
    setFormDesc('');
    setFormFields([{ ...EMPTY_FIELD }]);
    setEditing(null);
    setCreating(false);
  };

  const openCreate = () => {
    resetForm();
    setCreating(true);
  };

  const openEdit = (template: Template) => {
    setFormName(template.name);
    setFormDesc(template.description);
    setFormFields(
      template.fields_schema.length > 0
        ? template.fields_schema.map((f) => ({ ...f }))
        : [{ ...EMPTY_FIELD }],
    );
    setEditing(template);
    setCreating(false);
  };

  const handleToggleActive = async (template: Template) => {
    const result = await patch<{ message: string }>(`/templates/${template.id}`, {
      is_active: !template.is_active,
    });
    if (result.success) {
      loadTemplates();
    }
  };

  const updateField = (index: number, updates: Partial<FieldDef>) => {
    setFormFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...updates } : f)),
    );
  };

  const addField = () => {
    setFormFields((prev) => [...prev, { ...EMPTY_FIELD }]);
  };

  const removeField = (index: number) => {
    setFormFields((prev) => prev.filter((_, i) => i !== index));
  };

  const moveField = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= formFields.length) return;
    setFormFields((prev) => {
      const next = [...prev];
      [next[index]!, next[target]!] = [next[target]!, next[index]!];
      return next;
    });
  };

  const handleSave = async () => {
    if (!formName.trim()) return;

    // Auto-generate keys from labels if empty
    const cleanFields = formFields
      .filter((f) => f.label.trim())
      .map((f) => ({
        ...f,
        key: f.key.trim() || f.label.trim().toLowerCase().replace(/[^a-z0-9]/g, '_'),
        label: f.label.trim(),
        options: f.type === 'select' ? (f.options ?? []).filter((o) => o.trim()) : undefined,
        required: f.required ?? false,
      }));

    if (cleanFields.length === 0) return;

    const payload = {
      name: formName.trim(),
      description: formDesc.trim(),
      fields_schema: cleanFields,
    };

    if (editing) {
      const result = await put<{ message: string }>(`/templates/${editing.id}`, payload);
      if (result.success) {
        resetForm();
        loadTemplates();
      }
    } else {
      const result = await post<{ id: number }>('/templates', payload);
      if (result.success) {
        resetForm();
        loadTemplates();
      }
    }
  };

  const showForm = creating || editing !== null;

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-gray-500">需要管理者權限</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 text-blue-600 hover:underline"
          >
            返回首頁
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              &larr; 返回首頁
            </button>
            <h1 className="text-xl font-bold text-gray-900">模板管理</h1>
          </div>
          {!showForm && (
            <button
              onClick={openCreate}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              + 新增模板
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Template form */}
        {showForm && (
          <div className="mb-8 rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              {editing ? '編輯模板' : '新增模板'}
            </h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    模板名稱 *
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder="例如：週會選題提報"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    模板描述
                  </label>
                  <input
                    type="text"
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder="簡述此模板的用途"
                  />
                </div>
              </div>

              {/* Field schema editor */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  欄位定義
                </label>
                <div className="space-y-2">
                  {formFields.map((field, idx) => (
                    <FieldRow
                      key={idx}
                      field={field}
                      index={idx}
                      total={formFields.length}
                      onChange={(updates) => updateField(idx, updates)}
                      onRemove={() => removeField(idx)}
                      onMoveUp={() => moveField(idx, -1)}
                      onMoveDown={() => moveField(idx, 1)}
                    />
                  ))}
                </div>
                <button
                  onClick={addField}
                  className="mt-2 rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600"
                >
                  + 新增欄位
                </button>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={resetForm}
                className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={!formName.trim() || formFields.filter((f) => f.label.trim()).length === 0}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {editing ? '更新模板' : '建立模板'}
              </button>
            </div>
          </div>
        )}

        {/* Template list */}
        <div className="space-y-3">
          {templates.length === 0 && !showForm && (
            <div className="rounded-xl border bg-white p-12 text-center text-gray-400">
              尚無模板，點擊上方按鈕新增
            </div>
          )}

          {templates.map((template) => (
            <div
              key={template.id}
              className={`rounded-xl border bg-white p-5 shadow-sm transition-opacity ${
                template.is_active ? '' : 'opacity-60'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-gray-900">{template.name}</h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        template.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {template.is_active ? '啟用中' : '已停用'}
                    </span>
                  </div>
                  {template.description && (
                    <p className="mt-1 text-sm text-gray-500">{template.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {template.fields_schema.map((field) => (
                      <span
                        key={field.key}
                        className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600"
                      >
                        {field.label}
                        {field.required && <span className="ml-0.5 text-red-400">*</span>}
                        <span className="ml-1 text-gray-400">
                          {field.type === 'text' ? '文字' :
                           field.type === 'number' ? '數字' :
                           field.type === 'select' ? '選擇' : '日期'}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="ml-4 flex items-center gap-2">
                  <button
                    onClick={() => openEdit(template)}
                    className="rounded-lg px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50"
                  >
                    編輯
                  </button>
                  <button
                    onClick={() => handleToggleActive(template)}
                    className={`rounded-lg px-3 py-1.5 text-sm ${
                      template.is_active
                        ? 'text-red-500 hover:bg-red-50'
                        : 'text-green-600 hover:bg-green-50'
                    }`}
                  >
                    {template.is_active ? '停用' : '啟用'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

// --- Field Row Component ---

interface FieldRowProps {
  field: FieldDef;
  index: number;
  total: number;
  onChange: (updates: Partial<FieldDef>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function FieldRow({ field, index, total, onChange, onRemove, onMoveUp, onMoveDown }: FieldRowProps) {
  const [optionsText, setOptionsText] = useState(field.options?.join(', ') ?? '');

  const handleOptionsChange = (text: string) => {
    setOptionsText(text);
    const opts = text.split(',').map((s) => s.trim()).filter(Boolean);
    onChange({ options: opts });
  };

  return (
    <div className="flex items-start gap-2 rounded-lg border bg-gray-50 p-3">
      {/* Move buttons */}
      <div className="flex flex-col gap-0.5 pt-1">
        <button
          onClick={onMoveUp}
          disabled={index === 0}
          className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30"
        >
          &uarr;
        </button>
        <button
          onClick={onMoveDown}
          disabled={index === total - 1}
          className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30"
        >
          &darr;
        </button>
      </div>

      <div className="grid flex-1 grid-cols-12 gap-2">
        {/* Label */}
        <input
          type="text"
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="欄位名稱"
          className="col-span-3 rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />

        {/* Key */}
        <input
          type="text"
          value={field.key}
          onChange={(e) => onChange({ key: e.target.value })}
          placeholder="key (自動)"
          className="col-span-2 rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-500 focus:border-blue-500 focus:outline-none"
        />

        {/* Type */}
        <select
          value={field.type}
          onChange={(e) => onChange({ type: e.target.value as FieldDef['type'] })}
          className="col-span-2 rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="text">文字</option>
          <option value="number">數字</option>
          <option value="select">選擇</option>
          <option value="date">日期</option>
        </select>

        {/* Required */}
        <label className="col-span-1 flex items-center gap-1">
          <input
            type="checkbox"
            checked={field.required ?? false}
            onChange={(e) => onChange({ required: e.target.checked })}
            className="rounded"
          />
          <span className="text-xs text-gray-500">必填</span>
        </label>

        {/* Options (only for select type) */}
        {field.type === 'select' ? (
          <input
            type="text"
            value={optionsText}
            onChange={(e) => handleOptionsChange(e.target.value)}
            placeholder="選項（逗號分隔）"
            className="col-span-4 rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          />
        ) : (
          <div className="col-span-4" />
        )}
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="mt-1 text-sm text-red-400 hover:text-red-600"
        title="刪除欄位"
      >
        &times;
      </button>
    </div>
  );
}
