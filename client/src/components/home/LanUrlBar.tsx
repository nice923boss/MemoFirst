import { useState } from 'react';

interface Props {
  publicUrl: string | null;
  lanUrl: string;
}

export function LanUrlBar({ publicUrl, lanUrl }: Props) {
  const [copied, setCopied] = useState(false);
  const url = publicUrl ?? lanUrl;
  const isTailscale = !!publicUrl;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mb-8 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-sm font-medium text-blue-800">
            {isTailscale ? '同事連線網址（Tailscale）' : '本機網址（尚未設定 Tailscale serve）'}
          </div>
          <div className="mt-1 break-all font-mono text-lg font-bold text-blue-900">
            {url}
          </div>
          <div className="mt-1 text-xs text-blue-600">
            {isTailscale
              ? '請將此網址分享給同事，裝置需登入同一個 tailnet 即可開啟，無需帳號密碼'
              : '請在主機執行 serve-setup.bat 產生 Tailscale 網址後再分享'}
          </div>
        </div>
        <button
          onClick={handleCopy}
          className="ml-4 shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {copied ? '已複製' : '複製連結'}
        </button>
      </div>
    </div>
  );
}
