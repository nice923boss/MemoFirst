import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { get, patch } from '../api/client';

interface UserRow {
  id: number;
  email: string;
  display_name: string;
  role: 'admin' | 'member';
  locked: number;
  created_at: string;
  first_login_at: string;
}

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const { isAdmin, identity } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState('');

  const loadUsers = useCallback(async () => {
    const result = await get<UserRow[]>('/users');
    if (result.success && result.data) {
      setUsers(result.data);
    } else {
      setError(result.error ?? '載入失敗');
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin, loadUsers]);

  const updateUser = async (id: number, body: { role?: string; locked?: boolean }) => {
    const result = await patch<{ message: string }>(`/users/${id}`, body);
    if (result.success) {
      loadUsers();
    } else {
      setError(result.error ?? '更新失敗');
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-gray-500">需要管理者權限</p>
          <button onClick={() => navigate('/')} className="mt-4 text-blue-600 hover:underline">
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
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="text-sm text-gray-500 hover:text-gray-700">
              ← 返回
            </button>
            <h1 className="text-xl font-bold text-gray-900">帳號權限管理</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <p className="mb-4 text-sm text-gray-500">
          使用者首次以 Tailscale 身分開啟本站時自動建立。你可以指派管理者、或停用帳號。
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
        )}

        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">顯示名稱</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">角色</th>
                <th className="px-4 py-3 font-medium">狀態</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => {
                const isSelf = identity?.email.toLowerCase() === u.email.toLowerCase();
                return (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">{u.display_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          u.role === 'admin'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {u.role === 'admin' ? '管理者' : '成員'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.locked ? (
                        <span className="text-xs font-medium text-red-500">已停用</span>
                      ) : (
                        <span className="text-xs text-green-600">正常</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isSelf ? (
                        <span className="block text-right text-xs text-gray-400">（你自己）</span>
                      ) : (
                        <div className="flex justify-end gap-2">
                          {u.role === 'admin' ? (
                            <button
                              onClick={() => updateUser(u.id, { role: 'member' })}
                              className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
                            >
                              降為成員
                            </button>
                          ) : (
                            <button
                              onClick={() => updateUser(u.id, { role: 'admin' })}
                              className="rounded-lg px-2 py-1 text-xs text-purple-600 hover:bg-purple-50"
                            >
                              設為管理者
                            </button>
                          )}
                          {u.locked ? (
                            <button
                              onClick={() => updateUser(u.id, { locked: false })}
                              className="rounded-lg px-2 py-1 text-xs text-green-600 hover:bg-green-50"
                            >
                              解除停用
                            </button>
                          ) : (
                            <button
                              onClick={() => updateUser(u.id, { locked: true })}
                              className="rounded-lg px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                            >
                              停用
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    尚無使用者紀錄
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
