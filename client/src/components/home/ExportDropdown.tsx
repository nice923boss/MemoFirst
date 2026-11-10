import { useState, useRef, useEffect } from 'react';
import { get } from '../../api/client';
import { exportAsMarkdown, exportAsWord, exportAsPdf } from '../../utils/exportUtils';

interface MeetingContent {
  title: string;
  html: string;
  annotations: Array<{
    author: string;
    content: string;
    anchorText: string;
    resolved: boolean;
    createdAt: number;
    replies: Array<{ author: string; content: string; createdAt: number }>;
  }>;
}

interface Props {
  meetingId: number;
}

export function ExportDropdown({ meetingId }: Props) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExport = async (format: 'md' | 'word' | 'pdf') => {
    setExporting(true);
    setOpen(false);

    const result = await get<MeetingContent>(`/meetings/${meetingId}/content`);
    if (result.success && result.data) {
      const { title, html, annotations } = result.data;
      switch (format) {
        case 'md':
          exportAsMarkdown(html, title, annotations);
          break;
        case 'word':
          exportAsWord(html, title, annotations);
          break;
        case 'pdf':
          exportAsPdf(html, title, annotations);
          break;
      }
    }

    setExporting(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => {
          e.preventDefault();
          setOpen(!open);
        }}
        disabled={exporting}
        className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-50"
        title="匯出會議記錄"
      >
        {exporting ? '匯出中...' : '匯出'}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-lg border bg-white py-1 shadow-lg">
          <button
            onClick={() => handleExport('word')}
            className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            Word (.doc)
          </button>
          <button
            onClick={() => handleExport('md')}
            className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            Markdown (.md)
          </button>
          <button
            onClick={() => handleExport('pdf')}
            className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            PDF（列印）
          </button>
        </div>
      )}
    </div>
  );
}
