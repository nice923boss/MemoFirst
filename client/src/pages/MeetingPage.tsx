import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { get, post, patch } from '../api/client';
import { useYjsProvider } from '../hooks/useYjsProvider';
import CollabEditor from '../components/editor/CollabEditor';

interface FieldDef {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
}

interface MeetingData {
  id: number;
  title: string;
  status: string;
  yjs_doc_id: string;
  template_name: string | null;
  fields_schema: FieldDef[] | null;
  created_by: string;
  has_password: boolean;
  locked: boolean;
  is_creator: boolean;
  can_manage: boolean;
}

interface Participant {
  id: number;
  nickname: string;
  color: string;
  joined_at: string;
}

const STATUS_FLOW: Record<string, { next: string; label: string; buttonClass: string }> = {
  draft: {
    next: 'active',
    label: '開始會議',
    buttonClass: 'bg-green-600 hover:bg-green-700 text-white',
  },
  active: {
    next: 'closed',
    label: '結束會議',
    buttonClass: 'bg-red-600 hover:bg-red-700 text-white',
  },
  closed: {
    next: 'active',
    label: '重新開啟',
    buttonClass: 'bg-orange-500 hover:bg-orange-600 text-white',
  },
};

export default function MeetingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState<MeetingData | null>(null);
  const [nickname, setNickname] = useState('');
  const [color, setColor] = useState('');
  const [joined, setJoined] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [error, setError] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [showParticipants, setShowParticipants] = useState(false);

  // Join-password flow
  const [passwordInput, setPasswordInput] = useState('');
  const [unlockError, setUnlockError] = useState('');

  // Load meeting info
  const loadMeeting = useCallback(async () => {
    if (!id) return;
    const result = await get<MeetingData>(`/meetings/${id}`);
    if (result.success && result.data) {
      setMeeting(result.data);
    } else {
      setError('會議不存在');
    }
  }, [id]);

  useEffect(() => {
    loadMeeting();
  }, [loadMeeting]);

  // Try to restore nickname session
  useEffect(() => {
    if (!id) return;
    const saved = sessionStorage.getItem(`meeting-${id}-participant`);
    if (saved) {
      const { nickname: n, color: c } = JSON.parse(saved);
      setNickname(n);
      setColor(c);
      setJoined(true);
    }
  }, [id]);

  // Load participants periodically
  const loadParticipants = useCallback(async () => {
    if (!id) return;
    const result = await get<Participant[]>(`/meetings/${id}/participants`);
    if (result.success && result.data) {
      setParticipants(result.data);
    }
  }, [id]);

  const locked = meeting?.locked ?? false;

  useEffect(() => {
    if (!joined || locked) return;
    loadParticipants();
    const interval = setInterval(loadParticipants, 10_000);
    return () => clearInterval(interval);
  }, [joined, locked, loadParticipants]);

  const handleUnlock = async () => {
    if (!passwordInput.trim()) return;
    setUnlockError('');
    const result = await post<{ success: boolean }>(`/meetings/${id}/unlock`, {
      password: passwordInput,
    });
    if (result.success) {
      setPasswordInput('');
      await loadMeeting(); // re-fetch — now unlocked, fields_schema included
    } else {
      setUnlockError(result.error ?? '密碼錯誤');
    }
  };

  const handleJoin = async () => {
    if (!nicknameInput.trim()) return;
    setError('');

    const result = await post<{ participantId: number; color: string }>(
      `/meetings/${id}/join`,
      { nickname: nicknameInput.trim() },
    );

    if (result.success && result.data) {
      const n = nicknameInput.trim();
      const c = result.data.color;
      setNickname(n);
      setColor(c);
      setJoined(true);
      sessionStorage.setItem(
        `meeting-${id}-participant`,
        JSON.stringify({ nickname: n, color: c }),
      );
    } else {
      setError(result.error ?? '加入失敗');
    }
  };

  const handleStatusChange = async () => {
    if (!meeting) return;
    const flow = STATUS_FLOW[meeting.status];
    if (!flow) return;

    const result = await patch<{ message: string }>(
      `/meetings/${meeting.id}`,
      { status: flow.next },
    );

    if (result.success) {
      setMeeting({ ...meeting, status: flow.next });
    }
  };

  // Yjs provider — only activate after joining an unlocked meeting
  const { doc, provider, connected } = useYjsProvider({
    docId: joined && meeting && !locked ? meeting.yjs_doc_id : '',
    nickname,
    color,
  });

  if (error && !meeting) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-red-500">{error}</p>
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

  if (!meeting) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg text-gray-400">載入會議資訊...</div>
      </div>
    );
  }

  // Password gate — meeting has a join password and caller has no access yet
  if (locked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-100">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
          <div className="mb-6 text-center">
            <div className="mb-2 text-3xl">🔒</div>
            <h1 className="text-2xl font-bold text-gray-900">{meeting.title}</h1>
            <p className="mt-1 text-sm text-gray-500">此會議設有加入密碼，請輸入後進入</p>
          </div>

          <div className="space-y-4">
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="輸入加入密碼"
              autoFocus
            />

            {unlockError && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{unlockError}</div>
            )}

            <button
              onClick={handleUnlock}
              disabled={!passwordInput.trim()}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              進入會議
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full text-center text-sm text-gray-400 hover:text-gray-600"
            >
              返回首頁
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Join dialog (nickname)
  if (!joined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-gray-900">{meeting.title}</h1>
            {meeting.template_name && (
              <p className="mt-1 text-sm text-gray-500">模板：{meeting.template_name}</p>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                你的暱稱
              </label>
              <input
                type="text"
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="輸入你的名字"
                autoFocus
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
            )}

            <button
              onClick={handleJoin}
              disabled={!nicknameInput.trim()}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              加入會議
            </button>
          </div>
        </div>
      </div>
    );
  }

  const statusFlow = STATUS_FLOW[meeting.status];

  // Meeting room
  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="flex items-center justify-between border-b bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← 返回
          </button>
          <h1 className="text-lg font-semibold text-gray-900">{meeting.title}</h1>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            meeting.status === 'active' ? 'bg-green-100 text-green-700' :
            meeting.status === 'closed' ? 'bg-gray-100 text-gray-500' :
            'bg-yellow-100 text-yellow-700'
          }`}>
            {meeting.status === 'active' ? '進行中' :
             meeting.status === 'closed' ? '已結束' : '草稿'}
          </span>

          {/* Status control — admin or creator */}
          {meeting.can_manage && statusFlow && (
            <button
              onClick={handleStatusChange}
              className={`rounded-lg px-3 py-1 text-xs font-medium ${statusFlow.buttonClass}`}
            >
              {statusFlow.label}
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Participant toggle */}
          <button
            onClick={() => setShowParticipants(!showParticipants)}
            className={`rounded-lg px-3 py-1 text-xs font-medium ${
              showParticipants ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {participants.length} 位參與者
          </button>
          <span
            className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
          />
          <span className="text-sm text-gray-600">{nickname}</span>
          <span
            className="inline-block h-4 w-4 rounded-full border"
            style={{ backgroundColor: color }}
            title="你的標記色"
          />
        </div>
      </header>

      {/* Content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor */}
        <main className="flex flex-1 overflow-hidden">
          {doc && provider ? (
            <CollabEditor
              doc={doc}
              provider={provider}
              nickname={nickname}
              color={color}
              canManage={meeting.can_manage}
              templateFields={meeting.fields_schema ?? undefined}
              participants={participants}
              meetingTitle={meeting.title}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-gray-400">
              正在連線到協作文檔...
            </div>
          )}
        </main>

        {/* Participant sidebar */}
        {showParticipants && (
          <aside className="w-56 shrink-0 border-l bg-white p-4 overflow-y-auto">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">參與者</h3>
            <div className="space-y-2">
              {participants.map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="truncate text-sm text-gray-700">
                    {p.nickname}
                    {p.nickname === nickname && (
                      <span className="ml-1 text-xs text-gray-400">（你）</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
