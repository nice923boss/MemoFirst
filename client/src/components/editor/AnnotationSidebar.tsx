import { useState } from 'react';
import type { Annotation } from './useAnnotations';

interface AnnotationSidebarProps {
  annotations: Annotation[];
  activeAnnotationId: string | null;
  currentUser: string;
  canManage: boolean;
  onReply: (annotationId: string, content: string) => void;
  onEditAnnotation: (annotationId: string, newContent: string) => void;
  onEditReply: (annotationId: string, replyId: string, newContent: string) => void;
  onToggleResolved: (annotationId: string) => void;
  onDeleteAnnotation: (annotationId: string) => void;
  onClickAnnotation: (annotationId: string) => void;
}

export default function AnnotationSidebar({
  annotations,
  activeAnnotationId,
  currentUser,
  canManage,
  onReply,
  onEditAnnotation,
  onEditReply,
  onToggleResolved,
  onDeleteAnnotation,
  onClickAnnotation,
}: AnnotationSidebarProps) {
  const unresolvedCount = annotations.filter((a) => !a.resolved).length;
  const [showResolved, setShowResolved] = useState(false);

  const visible = showResolved ? annotations : annotations.filter((a) => !a.resolved);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-700">
          批註 ({unresolvedCount})
        </h3>
        <button
          onClick={() => setShowResolved(!showResolved)}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          {showResolved ? '隱藏已解決' : '顯示已解決'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            選取文字後可以添加批註
          </div>
        )}

        {visible.map((annotation) => (
          <AnnotationCard
            key={annotation.id}
            annotation={annotation}
            isActive={annotation.id === activeAnnotationId}
            currentUser={currentUser}
            canManage={canManage}
            onReply={onReply}
            onEditAnnotation={onEditAnnotation}
            onEditReply={onEditReply}
            onToggleResolved={onToggleResolved}
            onDelete={onDeleteAnnotation}
            onClick={() => onClickAnnotation(annotation.id)}
          />
        ))}
      </div>
    </div>
  );
}

interface AnnotationCardProps {
  annotation: Annotation;
  isActive: boolean;
  currentUser: string;
  canManage: boolean;
  onReply: (annotationId: string, content: string) => void;
  onEditAnnotation: (annotationId: string, newContent: string) => void;
  onEditReply: (annotationId: string, replyId: string, newContent: string) => void;
  onToggleResolved: (annotationId: string) => void;
  onDelete: (annotationId: string) => void;
  onClick: () => void;
}

function AnnotationCard({
  annotation,
  isActive,
  currentUser,
  canManage,
  onReply,
  onEditAnnotation,
  onEditReply,
  onToggleResolved,
  onDelete,
  onClick,
}: AnnotationCardProps) {
  const [replyText, setReplyText] = useState('');
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [editingContent, setEditingContent] = useState<string | null>(null);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editingReplyContent, setEditingReplyContent] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isOwnAnnotation = annotation.author === currentUser;
  const canDelete = isOwnAnnotation || canManage;

  const handleSubmitReply = () => {
    if (!replyText.trim()) return;
    onReply(annotation.id, replyText.trim());
    setReplyText('');
    setShowReplyInput(false);
  };

  const handleSaveEdit = () => {
    if (editingContent === null || !editingContent.trim()) return;
    onEditAnnotation(annotation.id, editingContent.trim());
    setEditingContent(null);
  };

  const handleSaveReplyEdit = () => {
    if (!editingReplyId || !editingReplyContent.trim()) return;
    onEditReply(annotation.id, editingReplyId, editingReplyContent.trim());
    setEditingReplyId(null);
    setEditingReplyContent('');
  };

  return (
    <div
      id={`annotation-card-${annotation.id}`}
      onClick={onClick}
      className={`cursor-pointer border-b px-4 py-3 transition-colors ${
        isActive ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-gray-50'
      } ${annotation.resolved ? 'opacity-60' : ''}`}
    >
      {/* Anchor text preview */}
      <div
        className="mb-2 rounded px-2 py-1 text-xs"
        style={{ backgroundColor: `${annotation.color}22`, borderLeft: `3px solid ${annotation.color}` }}
      >
        <span className="text-gray-500">「</span>
        <span className="text-gray-700">{annotation.anchorText}</span>
        <span className="text-gray-500">」</span>
      </div>

      {/* Author and content */}
      <div className="flex items-start gap-2">
        <span
          className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: annotation.color }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-700">{annotation.author}</span>
            <span className="text-xs text-gray-400">
              {formatTime(annotation.createdAt)}
            </span>
          </div>

          {/* Annotation content: editable or read-only */}
          {editingContent !== null ? (
            <div className="mt-1" onClick={(e) => e.stopPropagation()}>
              <textarea
                value={editingContent}
                onChange={(e) => setEditingContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSaveEdit();
                  }
                  if (e.key === 'Escape') {
                    setEditingContent(null);
                  }
                }}
                className="w-full rounded border border-orange-300 px-2 py-1 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-200"
                rows={2}
                autoFocus
              />
              <div className="mt-1 flex justify-end gap-2">
                <button
                  onClick={() => setEditingContent(null)}
                  className="rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={!editingContent.trim()}
                  className="rounded bg-orange-500 px-2 py-0.5 text-xs text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  儲存
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-0.5 text-sm text-gray-800">{annotation.content}</p>
          )}
        </div>
      </div>

      {/* Replies */}
      {annotation.replies.length > 0 && (
        <div className="ml-5 mt-2 space-y-2 border-l-2 border-gray-200 pl-3">
          {annotation.replies.map((reply) => {
            const isOwnReply = reply.author === currentUser;
            const isEditingThis = editingReplyId === reply.id;

            return (
              <div key={reply.id} className="flex items-start gap-2">
                <span
                  className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: reply.color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600">{reply.author}</span>
                    <span className="text-xs text-gray-400">{formatTime(reply.createdAt)}</span>
                  </div>

                  {isEditingThis ? (
                    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                      <textarea
                        value={editingReplyContent}
                        onChange={(e) => setEditingReplyContent(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSaveReplyEdit();
                          }
                          if (e.key === 'Escape') {
                            setEditingReplyId(null);
                            setEditingReplyContent('');
                          }
                        }}
                        className="w-full rounded border border-blue-300 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
                        rows={2}
                        autoFocus
                      />
                      <div className="mt-1 flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditingReplyId(null);
                            setEditingReplyContent('');
                          }}
                          className="rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100"
                        >
                          取消
                        </button>
                        <button
                          onClick={handleSaveReplyEdit}
                          disabled={!editingReplyContent.trim()}
                          className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          儲存
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="group flex items-start gap-1">
                      <p className="text-sm text-gray-700">{reply.content}</p>
                      {isOwnReply && !annotation.resolved && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingReplyId(reply.id);
                            setEditingReplyContent(reply.content);
                          }}
                          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-gray-400 hover:text-blue-600"
                          title="編輯"
                        >
                          ✎
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Actions */}
      <div className="mt-2 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
        {!annotation.resolved && (
          <button
            onClick={() => setShowReplyInput(!showReplyInput)}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            回覆
          </button>
        )}
        {isOwnAnnotation && !annotation.resolved && editingContent === null && (
          <button
            onClick={() => setEditingContent(annotation.content)}
            className="text-xs text-orange-600 hover:text-orange-700"
          >
            編輯
          </button>
        )}
        <button
          onClick={() => onToggleResolved(annotation.id)}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          {annotation.resolved ? '重新開啟' : '標記解決'}
        </button>
        {canDelete && !confirmingDelete && (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="text-xs text-red-500 hover:text-red-600"
          >
            刪除
          </button>
        )}
      </div>

      {/* Delete confirmation */}
      {confirmingDelete && (
        <div
          className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-xs text-red-700">
            確定刪除這則批註？刪除後無法復原，底下的回覆也會一併移除。
          </p>
          <div className="mt-1.5 flex justify-end gap-2">
            <button
              onClick={() => setConfirmingDelete(false)}
              className="rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100"
            >
              取消
            </button>
            <button
              onClick={() => {
                onDelete(annotation.id);
                setConfirmingDelete(false);
              }}
              className="rounded bg-red-500 px-2 py-0.5 text-xs text-white hover:bg-red-600"
            >
              確定刪除
            </button>
          </div>
        </div>
      )}

      {/* Reply input */}
      {showReplyInput && (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmitReply();
              }
            }}
            placeholder="回覆此批註..."
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
            rows={2}
            autoFocus
          />
          <div className="mt-1 flex justify-end gap-2">
            <button
              onClick={() => setShowReplyInput(false)}
              className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
            >
              取消
            </button>
            <button
              onClick={handleSubmitReply}
              disabled={!replyText.trim()}
              className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
            >
              送出
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60_000) return '剛才';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分鐘前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小時前`;

  return date.toLocaleString('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
