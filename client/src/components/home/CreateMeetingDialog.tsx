import { useState } from 'react';

interface Template {
  id: number;
  name: string;
}

interface Props {
  templates: Template[];
  onClose: () => void;
  onCreate: (title: string, templateId: number | null, joinPassword: string) => void;
}

export function CreateMeetingDialog({ templates, onClose, onCreate }: Props) {
  const [title, setTitle] = useState('');
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [joinPassword, setJoinPassword] = useState('');

  const handleSubmit = () => {
    if (!title.trim()) return;
    onCreate(title.trim(), templateId, joinPassword.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">建立新會議</h3>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              會議標題
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="例如：第 12 週週會"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              選擇模板（可選）
            </label>
            <select
              value={templateId ?? ''}
              onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="">不使用模板（自由書寫）</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              加入密碼（可選）
            </label>
            <input
              type="password"
              value={joinPassword}
              onChange={(e) => setJoinPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="留空＝tailnet 內公開"
              autoComplete="new-password"
            />
            <p className="mt-1 text-xs text-gray-400">
              設定密碼後，其他人需輸入正確密碼才能開啟此會議內容。
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            建立
          </button>
        </div>
      </div>
    </div>
  );
}
