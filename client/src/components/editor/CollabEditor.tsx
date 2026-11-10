import { useEffect, useState, useCallback, useRef } from 'react';
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { AnnotationMark } from './AnnotationMark';
import { useAnnotations } from './useAnnotations';
import AnnotationSidebar from './AnnotationSidebar';
import MeetingDashboard from '../dashboard/MeetingDashboard';
import { exportAsMarkdown, exportAsWord, exportAsPdf } from '../../utils/exportUtils';

interface FieldDef {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
}

interface Participant {
  id: number;
  nickname: string;
  color: string;
  joined_at: string;
}

interface CollabEditorProps {
  doc: Y.Doc;
  provider: WebsocketProvider;
  nickname: string;
  color: string;
  canManage?: boolean;
  templateFields?: FieldDef[];
  participants?: Participant[];
  meetingTitle?: string;
}

interface PendingAnnotation {
  from: number;
  to: number;
  text: string;
}

export default function CollabEditor({
  doc,
  provider,
  nickname,
  color,
  canManage = false,
  templateFields,
  participants = [],
  meetingTitle = '',
}: CollabEditorProps) {
  const [participantCount, setParticipantCount] = useState(1);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<PendingAnnotation | null>(null);
  const [annotationInput, setAnnotationInput] = useState('');
  const annotationFormRef = useRef<HTMLTextAreaElement>(null);
  const annotationBtnRef = useRef<HTMLButtonElement>(null);

  const {
    annotations,
    addAnnotation,
    addReply,
    editAnnotation,
    editReply,
    toggleResolved,
    deleteAnnotation,
  } = useAnnotations(doc);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: false,
      }),
      Collaboration.configure({
        document: doc,
      }),
      CollaborationCursor.configure({
        provider: provider,
        user: {
          name: nickname,
          color: color,
        },
      }),
      Highlight.configure({
        multicolor: true,
      }),
      Placeholder.configure({
        placeholder: '開始撰寫會議內容...',
      }),
      AnnotationMark,
    ],
  }, [doc, provider]);

  // Pre-fill document with template headings if document is empty
  const templateAppliedRef = useRef(false);
  useEffect(() => {
    if (!editor || !templateFields || templateFields.length === 0) return;
    if (templateAppliedRef.current) return;

    // Wait a tick for Yjs sync to complete
    const timer = setTimeout(() => {
      if (!editor) return;
      const content = editor.getText().trim();
      if (content.length > 0) {
        templateAppliedRef.current = true;
        return;
      }

      // Build template content as TipTap JSON
      const nodes: Array<Record<string, unknown>> = [];
      for (const field of templateFields) {
        nodes.push({
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: field.label }],
        });

        // Add hint paragraph based on field type
        let hint = '';
        if (field.type === 'select' && field.options) {
          hint = `可選：${field.options.join(' / ')}`;
        } else if (field.type === 'date') {
          hint = '格式：YYYY-MM-DD';
        } else if (field.type === 'number') {
          hint = '請輸入數字';
        }

        if (hint) {
          nodes.push({
            type: 'paragraph',
            content: [{ type: 'text', text: hint }],
          });
        } else {
          nodes.push({ type: 'paragraph' });
        }
      }

      editor.commands.setContent({ type: 'doc', content: nodes });
      templateAppliedRef.current = true;
    }, 500);

    return () => clearTimeout(timer);
  }, [editor, templateFields]);

  // Track participant count
  useEffect(() => {
    const awareness = provider.awareness;
    const updateParticipants = () => {
      setParticipantCount(awareness.getStates().size);
    };
    awareness.on('change', updateParticipants);
    updateParticipants();
    return () => { awareness.off('change', updateParticipants); };
  }, [provider]);

  // Click on annotation highlight → activate in sidebar
  useEffect(() => {
    if (!editor) return;

    const handleClick = () => {
      if (pendingAnnotation) return; // Don't interfere with pending annotation
      const { $from } = editor.state.selection;
      const marks = $from.marks();
      const annotationMark = marks.find((m) => m.type.name === 'annotation');
      if (annotationMark) {
        const id = annotationMark.attrs.annotationId;
        setActiveAnnotationId(id);
        setShowAnnotations(true);
        setTimeout(() => {
          const card = document.getElementById(`annotation-card-${id}`);
          card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
      }
    };

    editor.on('selectionUpdate', handleClick);
    return () => { editor.off('selectionUpdate', handleClick); };
  }, [editor, pendingAnnotation]);

  // Focus the annotation form when pending
  useEffect(() => {
    if (pendingAnnotation) {
      setTimeout(() => annotationFormRef.current?.focus(), 100);
    }
  }, [pendingAnnotation]);

  // Close export menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExport = useCallback(
    (format: 'md' | 'word' | 'pdf') => {
      if (!editor) return;
      setShowExportMenu(false);

      const html = editor.getHTML();
      const exportAnnotations = annotations.map((a) => ({
        author: a.author,
        content: a.content,
        anchorText: a.anchorText,
        resolved: a.resolved,
        createdAt: a.createdAt,
        replies: a.replies.map((r) => ({
          author: r.author,
          content: r.content,
          createdAt: r.createdAt,
        })),
      }));

      switch (format) {
        case 'md':
          exportAsMarkdown(html, meetingTitle, exportAnnotations);
          break;
        case 'word':
          exportAsWord(html, meetingTitle, exportAnnotations);
          break;
        case 'pdf':
          exportAsPdf(html, meetingTitle, exportAnnotations);
          break;
      }
    },
    [editor, annotations, meetingTitle],
  );

  const handleStartAnnotation = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;

    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    setPendingAnnotation({ from, to, text: selectedText.slice(0, 100) });
    setShowAnnotations(true);
    setAnnotationInput('');
  }, [editor]);

  // Attach native mousedown listener to BubbleMenu button
  // (React event delegation breaks because Tippy.js moves the element outside #root)
  useEffect(() => {
    const btn = annotationBtnRef.current;
    if (!btn) return;

    const handler = (e: MouseEvent) => {
      e.preventDefault();
      handleStartAnnotation();
    };

    btn.addEventListener('mousedown', handler);
    return () => btn.removeEventListener('mousedown', handler);
  }, [handleStartAnnotation]);

  const handleSubmitAnnotation = useCallback(() => {
    if (!editor || !pendingAnnotation || !annotationInput.trim()) return;

    const annotationId = `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Re-select the stored range and apply the mark
    editor
      .chain()
      .focus()
      .setTextSelection({ from: pendingAnnotation.from, to: pendingAnnotation.to })
      .setAnnotation(annotationId, color)
      .run();

    addAnnotation({
      id: annotationId,
      author: nickname,
      color,
      content: annotationInput.trim(),
      anchorText: pendingAnnotation.text,
    });

    setPendingAnnotation(null);
    setAnnotationInput('');
    setActiveAnnotationId(annotationId);
  }, [editor, pendingAnnotation, annotationInput, color, nickname, addAnnotation]);

  const handleCancelAnnotation = useCallback(() => {
    setPendingAnnotation(null);
    setAnnotationInput('');
  }, []);

  const handleReply = useCallback(
    (annotationId: string, content: string) => {
      addReply(annotationId, {
        id: `reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        author: nickname,
        color,
        content,
      });
    },
    [nickname, color, addReply],
  );

  const handleEditAnnotation = useCallback(
    (annotationId: string, newContent: string) => {
      editAnnotation(annotationId, newContent);
    },
    [editAnnotation],
  );

  const handleEditReply = useCallback(
    (annotationId: string, replyId: string, newContent: string) => {
      editReply(annotationId, replyId, newContent);
    },
    [editReply],
  );

  const handleClickAnnotation = useCallback(
    (annotationId: string) => {
      setActiveAnnotationId(annotationId);

      if (!editor) return;
      const { doc: editorDoc } = editor.state;
      let found = false;

      editorDoc.descendants((node, pos) => {
        if (found) return false;
        for (const mark of node.marks) {
          if (mark.type.name === 'annotation' && mark.attrs.annotationId === annotationId) {
            editor.chain().setTextSelection(pos).run();
            found = true;
            return false;
          }
        }
        return true;
      });

      // Scroll the editor so the annotated text is centered in view
      const el = editor.view.dom.querySelector(`[data-annotation-id="${annotationId}"]`);
      el?.scrollIntoView({ block: 'center' });
    },
    [editor],
  );

  const handleDeleteAnnotation = useCallback(
    (annotationId: string) => {
      // Strip the highlight mark(s) for this annotation so no orphan highlight remains
      if (editor) {
        const { doc: editorDoc } = editor.state;
        const ranges: Array<{ from: number; to: number }> = [];
        editorDoc.descendants((node, pos) => {
          if (!node.isText) return;
          const hasMark = node.marks.some(
            (m) => m.type.name === 'annotation' && m.attrs.annotationId === annotationId,
          );
          if (hasMark) ranges.push({ from: pos, to: pos + node.nodeSize });
        });
        if (ranges.length > 0) {
          let chain = editor.chain();
          for (const range of ranges) {
            chain = chain.setTextSelection(range).unsetMark('annotation');
          }
          chain.run();
        }
      }

      deleteAnnotation(annotationId);
      setActiveAnnotationId((current) => (current === annotationId ? null : current));
    },
    [editor, deleteAnnotation],
  );

  if (!editor) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-400">
        編輯器載入中...
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b bg-white px-4 py-2">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          label="B"
          title="粗體"
          bold
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          label="I"
          title="斜體"
          italic
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive('strike')}
          label="S"
          title="刪除線"
          strike
        />
        <div className="mx-2 h-5 w-px bg-gray-300" />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive('heading', { level: 1 })}
          label="H1"
          title="標題 1"
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          label="H2"
          title="標題 2"
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive('heading', { level: 3 })}
          label="H3"
          title="標題 3"
        />
        <div className="mx-2 h-5 w-px bg-gray-300" />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          label="&bull;"
          title="無序列表"
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          label="1."
          title="有序列表"
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive('blockquote')}
          label="&ldquo;"
          title="引用"
        />
        <div className="mx-2 h-5 w-px bg-gray-300" />
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          active={false}
          label="—"
          title="分隔線"
        />

        {/* Export, annotation toggle, dashboard toggle & participant count */}
        <div className="ml-auto flex items-center gap-3">
          {/* Export dropdown */}
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                showExportMenu ? 'bg-green-100 text-green-700' : 'text-gray-500 hover:bg-gray-100'
              }`}
              title="匯出會議記錄"
            >
              匯出
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border bg-white py-1 shadow-lg">
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

          <button
            onClick={() => { setShowDashboard(!showDashboard); }}
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
              showDashboard ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'
            }`}
            title="數據面板"
          >
            數據面板
          </button>
          <button
            onClick={() => setShowAnnotations(!showAnnotations)}
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
              showAnnotations && !showDashboard ? 'bg-orange-100 text-orange-700' : 'text-gray-500 hover:bg-gray-100'
            }`}
            title="批註面板"
          >
            批註 ({annotations.filter((a) => !a.resolved).length})
          </button>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" title="連線中" />
            {participantCount} 人在線
          </div>
        </div>
      </div>

      {/* Content area: editor/dashboard + sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {showDashboard ? (
          /* Dashboard view */
          <MeetingDashboard
            editor={editor}
            annotations={annotations}
            participants={participants}
            templateFields={templateFields}
            meetingTitle={meetingTitle}
          />
        ) : (
          <>
            {/* Editor */}
            <div className="flex-1 overflow-y-auto bg-white">
              {/* Bubble menu: shows "+ 批註" when text selected */}
              <BubbleMenu
                editor={editor}
                tippyOptions={{
                  placement: 'top',
                  appendTo: () => document.getElementById('root') || document.body,
                }}
              >
                <div className="flex items-center gap-1 rounded-lg border bg-white px-2 py-1 shadow-lg">
                  <button
                    ref={annotationBtnRef}
                    className="rounded px-2 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50"
                  >
                    + 批註
                  </button>
                </div>
              </BubbleMenu>

              <EditorContent
                editor={editor}
                className="prose prose-sm mx-auto max-w-4xl px-8 py-6 focus:outline-none [&_.ProseMirror]:min-h-[500px] [&_.ProseMirror]:outline-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-gray-400 [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0 [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none"
              />
            </div>

            {/* Annotation sidebar */}
            {showAnnotations && (
              <aside className="w-80 shrink-0 border-l bg-white overflow-hidden flex flex-col">
                {/* Annotation form at top of sidebar when pending */}
                {pendingAnnotation && (
                  <div className="border-b bg-orange-50 p-4">
                    <div
                      className="mb-2 rounded px-2 py-1 text-xs"
                      style={{ backgroundColor: `${color}22`, borderLeft: `3px solid ${color}` }}
                    >
                      <span className="text-gray-500">「</span>
                      <span className="text-gray-700">{pendingAnnotation.text}</span>
                      <span className="text-gray-500">」</span>
                    </div>
                    <textarea
                      ref={annotationFormRef}
                      value={annotationInput}
                      onChange={(e) => setAnnotationInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSubmitAnnotation();
                        }
                        if (e.key === 'Escape') {
                          handleCancelAnnotation();
                        }
                      }}
                      placeholder="寫下你的批註..."
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-200"
                      rows={2}
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        onClick={handleCancelAnnotation}
                        className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleSubmitAnnotation}
                        disabled={!annotationInput.trim()}
                        className="rounded bg-orange-500 px-3 py-1 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                      >
                        送出批註
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex-1 overflow-hidden">
                  <AnnotationSidebar
                    annotations={annotations}
                    activeAnnotationId={activeAnnotationId}
                    currentUser={nickname}
                    canManage={canManage}
                    onReply={handleReply}
                    onEditAnnotation={handleEditAnnotation}
                    onEditReply={handleEditReply}
                    onToggleResolved={toggleResolved}
                    onDeleteAnnotation={handleDeleteAnnotation}
                    onClickAnnotation={handleClickAnnotation}
                  />
                </div>
              </aside>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface ToolbarButtonProps {
  onClick: () => void;
  active: boolean;
  label: string;
  title: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
}

function ToolbarButton({ onClick, active, label, title, bold, italic, strike }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded px-2 py-1 text-sm transition-colors ${
        active
          ? 'bg-blue-100 text-blue-700'
          : 'text-gray-600 hover:bg-gray-100'
      } ${bold ? 'font-bold' : ''} ${italic ? 'italic' : ''} ${strike ? 'line-through' : ''}`}
      dangerouslySetInnerHTML={{ __html: label }}
    />
  );
}
