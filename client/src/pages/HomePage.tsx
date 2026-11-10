import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { get, post, patch, del } from '../api/client';
import { LanUrlBar } from '../components/home/LanUrlBar';
import { ExportDropdown } from '../components/home/ExportDropdown';
import { CreateMeetingDialog } from '../components/home/CreateMeetingDialog';

interface Meeting {
  id: number;
  title: string;
  status: string;
  template_name: string | null;
  created_at: string;
  created_by: string;
  has_password: boolean;
  locked: boolean;
  is_creator: boolean;
  can_manage: boolean;
}

interface Template {
  id: number;
  name: string;
}

interface ServerInfo {
  publicUrl: string | null;
  lanUrl: string;
  localUrl: string;
  port: number;
}

export default function HomePage() {
  const navigate = useNavigate();
  const { isAdmin, displayName } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);

  useEffect(() => {
    loadMeetings();
    loadServerInfo();
  }, []);

  const loadMeetings = async () => {
    const result = await get<Meeting[]>('/meetings');
    if (result.success && result.data) {
      setMeetings(result.data);
    }
  };

  const loadTemplates = async () => {
    const result = await get<Template[]>('/templates');
    if (result.success && result.data) {
      setTemplates(result.data);
    }
  };

  const loadServerInfo = async () => {
    const result = await get<ServerInfo>('/server-info');
    if (result.success && result.data) {
      setServerInfo(result.data);
    }
  };

  const openCreateDialog = () => {
    loadTemplates();
    setShowCreate(true);
  };

  const handleCreate = async (title: string, templateId: number | null, joinPassword: string) => {
    const result = await post<{ id: number }>('/meetings', {
      title,
      template_id: templateId,
      join_password: joinPassword || undefined,
    });

    if (result.success && result.data) {
      setShowCreate(false);
      navigate(`/meeting/${result.data.id}`);
    }
  };

  const handleRename = useCallback(async (meetingId: number, newTitle: string) => {
    const result = await patch<{ message: string }>(`/meetings/${meetingId}`, { title: newTitle });
    if (result.success) {
      setMeetings((prev) =>
        prev.map((m) => (m.id === meetingId ? { ...m, title: newTitle } : m)),
      );
    }
  }, []);

  const handleDelete = useCallback(async (meetingId: number) => {
    const result = await del<{ message: string }>(`/meetings/${meetingId}`);
    if (result.success) {
      setMeetings((prev) => prev.filter((m) => m.id !== meetingId));
    }
  }, []);

  const handleReopen = useCallback(async (meetingId: number) => {
    const result = await patch<{ message: string }>(`/meetings/${meetingId}`, { status: 'active' });
    if (result.success) {
      setMeetings((prev) =>
        prev.map((m) => (m.id === meetingId ? { ...m, status: 'active' } : m)),
      );
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="MemoFirst" className="h-8 w-8 rounded-lg" />
            <h1 className="text-xl font-bold text-gray-900">MemoFirst</h1>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <>
                <Link
                  to="/admin/users"
                  className="rounded-lg px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50"
                >
                  帳號管理
                </Link>
                <Link
                  to="/admin/templates"
                  className="rounded-lg px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50"
                >
                  模板管理
                </Link>
              </>
            )}
            <span className="flex items-center gap-1.5 text-sm text-gray-600">
              {displayName}
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  isAdmin ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {isAdmin ? '管理者' : '成員'}
              </span>
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        {/* Connection URL info bar */}
        {serverInfo && (
          <LanUrlBar publicUrl={serverInfo.publicUrl} lanUrl={serverInfo.lanUrl} />
        )}

        {/* Hero section — only show when no meetings exist */}
        {meetings.length === 0 && <HeroSection />}

        {/* Meeting list */}
        {meetings.length > 0 && (
          <MeetingList
            meetings={meetings}
            isAdmin={isAdmin}
            onCreateClick={openCreateDialog}
            onRename={handleRename}
            onDelete={handleDelete}
            onReopen={handleReopen}
          />
        )}

        {/* Create button for empty state — available to everyone */}
        {meetings.length === 0 && (
          <div className="mt-12 text-center">
            <button
              onClick={openCreateDialog}
              className="rounded-xl bg-blue-600 px-8 py-3 text-white hover:bg-blue-700"
            >
              建立第一場會議
            </button>
          </div>
        )}

        <div className="mt-16 text-center text-xs text-gray-400">
          MemoFirst v1.0.0 | 製作人：黃政文
        </div>
      </main>

      {/* Create meeting dialog */}
      {showCreate && (
        <CreateMeetingDialog
          templates={templates}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components (co-located since they are only used by HomePage)
// ---------------------------------------------------------------------------

function HeroSection() {
  return (
    <>
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900">高效會議協作工具</h2>
        <p className="mt-3 text-gray-500">
          先讀後議，讓每場會議都有準備、有焦點、有結論
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {[
          { step: 1, title: '會前準備', desc: '協作文檔，共同登記資訊內容，每位參與者提前撰寫' },
          { step: 2, title: '閱讀批註', desc: '所有人閱讀文檔，有疑點直接批註，互相在線回覆' },
          { step: 3, title: '聚焦討論', desc: '只討論批註的問題，不複述內容，會後數據可視化呈現' },
        ].map(({ step, title, desc }) => (
          <div key={step} className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="mb-3 text-2xl font-bold text-blue-600">{step}</div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <p className="mt-2 text-sm text-gray-500">{desc}</p>
          </div>
        ))}
      </div>
    </>
  );
}

interface MeetingListProps {
  meetings: Meeting[];
  isAdmin: boolean;
  onCreateClick: () => void;
  onRename: (meetingId: number, newTitle: string) => void;
  onDelete: (meetingId: number) => void;
  onReopen: (meetingId: number) => void;
}

function MeetingList({ meetings, isAdmin, onCreateClick, onRename, onDelete, onReopen }: MeetingListProps) {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">會議列表</h2>
        <button
          onClick={onCreateClick}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + 建立新會議
        </button>
      </div>

      <div className="space-y-3">
        {meetings.map((meeting) => (
          <MeetingCard
            key={meeting.id}
            meeting={meeting}
            isAdmin={isAdmin}
            onRename={onRename}
            onDelete={onDelete}
            onReopen={onReopen}
          />
        ))}
      </div>
    </div>
  );
}

interface MeetingCardProps {
  meeting: Meeting;
  isAdmin: boolean;
  onRename: (meetingId: number, newTitle: string) => void;
  onDelete: (meetingId: number) => void;
  onReopen: (meetingId: number) => void;
}

function MeetingCard({ meeting, isAdmin, onRename, onDelete, onReopen }: MeetingCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(meeting.title);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const statusConfig = {
    active: { label: '進行中', className: 'bg-green-100 text-green-700' },
    closed: { label: '已結束', className: 'bg-gray-100 text-gray-500' },
    draft: { label: '草稿', className: 'bg-yellow-100 text-yellow-700' },
  } as const;

  const status = statusConfig[meeting.status as keyof typeof statusConfig]
    ?? statusConfig.draft;

  const handleSaveRename = () => {
    const trimmed = editTitle.trim();
    if (!trimmed || trimmed === meeting.title) {
      setEditTitle(meeting.title);
      setIsEditing(false);
      return;
    }
    onRename(meeting.id, trimmed);
    setIsEditing(false);
  };

  return (
    <>
      <div className="flex items-center justify-between rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
        {isEditing ? (
          <div className="flex flex-1 items-center gap-2 pr-4" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveRename();
                if (e.key === 'Escape') { setEditTitle(meeting.title); setIsEditing(false); }
              }}
              className="flex-1 rounded-lg border border-blue-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-200"
              autoFocus
            />
            <button
              onClick={handleSaveRename}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              儲存
            </button>
            <button
              onClick={() => { setEditTitle(meeting.title); setIsEditing(false); }}
              className="rounded-lg px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100"
            >
              取消
            </button>
          </div>
        ) : (
          <Link to={`/meeting/${meeting.id}`} className="flex-1">
            <h3 className="flex items-center gap-2 font-semibold text-gray-900">
              {meeting.title}
              {meeting.has_password && (
                <span
                  className="text-sm"
                  title={meeting.locked ? '需要加入密碼' : '有加入密碼（你已可存取）'}
                >
                  🔒
                </span>
              )}
            </h3>
            <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
              {meeting.template_name && (
                <span>模板：{meeting.template_name}</span>
              )}
              <span>建立者：{meeting.created_by}</span>
              <span>{new Date(meeting.created_at).toLocaleString('zh-TW')}</span>
            </div>
          </Link>
        )}

        <div className="flex items-center gap-2">
          {meeting.can_manage && !isEditing && (
            <button
              onClick={() => { setEditTitle(meeting.title); setIsEditing(true); }}
              className="rounded-lg px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="重新命名"
            >
              重新命名
            </button>
          )}
          {meeting.can_manage && meeting.status === 'closed' && !isEditing && (
            <button
              onClick={() => onReopen(meeting.id)}
              className="rounded-lg px-2 py-1 text-xs text-orange-500 hover:bg-orange-50 hover:text-orange-700"
              title="重新開啟會議"
            >
              重新開啟
            </button>
          )}
          {isAdmin && meeting.status === 'closed' && !isEditing && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="rounded-lg px-2 py-1 text-xs text-red-400 hover:bg-red-50 hover:text-red-600"
              title="刪除會議"
            >
              刪除
            </button>
          )}
          <ExportDropdown meetingId={meeting.id} />
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${status.className}`}>
            {status.label}
          </span>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <DeleteConfirmDialog
          meetingTitle={meeting.title}
          onConfirm={() => {
            setShowDeleteConfirm(false);
            onDelete(meeting.id);
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Delete confirmation dialog — must type meeting name to confirm
// ---------------------------------------------------------------------------

interface DeleteConfirmDialogProps {
  meetingTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmDialog({ meetingTitle, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  const [confirmText, setConfirmText] = useState('');
  const isMatch = confirmText.trim() === meetingTitle.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-red-600">確認刪除會議</h3>
        <p className="mt-2 text-sm text-gray-600">
          此操作無法復原，會議的所有資料（文檔、批註、參與者紀錄）都將永久刪除。
        </p>
        <p className="mt-3 text-sm text-gray-700">
          請輸入會議名稱 <strong className="text-red-600">{meetingTitle}</strong> 來確認刪除：
        </p>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && isMatch) onConfirm();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder="輸入會議名稱"
          className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
          autoFocus
        />
        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={!isMatch}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            確認刪除
          </button>
        </div>
      </div>
    </div>
  );
}
