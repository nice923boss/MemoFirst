import { useEffect, useState } from 'react';
import { get } from '../api/client';

interface ServerInfo {
  publicUrl: string | null;
  lanUrl: string;
  localUrl: string;
  port: number;
}

export default function AccessGuidePage() {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    get<ServerInfo>('/server-info').then((r) => {
      if (r.success && r.data) setInfo(r.data);
    });
  }, []);

  const url = info?.publicUrl ?? null;

  const handleCopy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-100 p-6">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <img src="/logo.png" alt="MemoFirst" className="mx-auto mb-3 h-12 w-12 rounded-xl" />
          <h1 className="text-2xl font-bold text-gray-900">請透過 Tailscale 存取</h1>
          <p className="mt-2 text-sm text-gray-500">
            本站免帳號密碼，改用 Tailscale 私有網路辨識身分。請用下列網址開啟。
          </p>
        </div>

        {url ? (
          <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <div className="text-xs font-medium text-blue-700">連線網址</div>
            <div className="mt-1 break-all font-mono text-base font-bold text-blue-900">
              {url}
            </div>
            <button
              onClick={handleCopy}
              className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {copied ? '已複製' : '複製網址'}
            </button>
          </div>
        ) : (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            尚未取得 Tailscale 網址。請架站者在主機執行 <code className="font-mono">serve-setup.bat</code>，
            或向管理者索取連線網址。
          </div>
        )}

        <ol className="space-y-3 text-sm text-gray-700">
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">1</span>
            <span>在你的裝置安裝 Tailscale，並登入公司/團隊的同一個 tailnet。</span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">2</span>
            <span>確認 Tailscale 已連線（狀態顯示 Connected）。</span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">3</span>
            <span>用上方的 <span className="font-mono">https://</span> 網址開啟本站，系統會自動以你的 Tailscale 身分登入。</span>
          </li>
        </ol>

        <p className="mt-6 text-center text-xs text-gray-400">
          若你就是架站主機，請改用 <span className="font-mono">http://localhost:{info?.port ?? ''}</span> 進入（本機視為管理者）。
        </p>
      </div>
    </div>
  );
}
