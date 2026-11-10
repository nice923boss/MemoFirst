import * as Y from 'yjs';
import { queryOne } from '../db/helpers';

// ---------------------------------------------------------------------------
// Annotation types for export
// ---------------------------------------------------------------------------
export interface ExportReply {
  author: string;
  content: string;
  createdAt: number;
}

export interface ExportAnnotation {
  id: string;
  author: string;
  content: string;
  anchorText: string;
  resolved: boolean;
  createdAt: number;
  replies: ExportReply[];
}

// ---------------------------------------------------------------------------
// Load Yjs document from database and return HTML + annotations
// ---------------------------------------------------------------------------
export function getDocContent(yjsDocId: string): {
  html: string;
  annotations: ExportAnnotation[];
} {
  const saved = queryOne<{ doc_state: Buffer }>(
    'SELECT doc_state FROM yjs_documents WHERE doc_id = ?',
    [yjsDocId],
  );

  if (!saved?.doc_state) {
    return { html: '', annotations: [] };
  }

  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(saved.doc_state));

  const html = yjsDocToHtml(doc);
  const annotations = readAnnotations(doc);

  doc.destroy();

  return { html, annotations };
}

// ---------------------------------------------------------------------------
// Convert Y.XmlFragment (TipTap document) to HTML
// ---------------------------------------------------------------------------
function yjsDocToHtml(doc: Y.Doc): string {
  const fragment = doc.getXmlFragment('default');
  return childrenToHtml(fragment);
}

function childrenToHtml(parent: Y.XmlFragment | Y.XmlElement): string {
  let html = '';
  for (const child of parent.toArray()) {
    if (child instanceof Y.XmlElement) {
      html += elementToHtml(child);
    } else if (child instanceof Y.XmlText) {
      html += textToHtml(child);
    }
  }
  return html;
}

function elementToHtml(el: Y.XmlElement): string {
  const name = el.nodeName;
  const attrs = el.getAttributes();
  const inner = childrenToHtml(el);

  switch (name) {
    case 'paragraph':
      return `<p>${inner || ''}</p>\n`;
    case 'heading': {
      const level = attrs.level ?? 1;
      return `<h${level}>${inner}</h${level}>\n`;
    }
    case 'bulletList':
      return `<ul>\n${inner}</ul>\n`;
    case 'orderedList':
      return `<ol>\n${inner}</ol>\n`;
    case 'listItem':
      return `<li>${inner}</li>\n`;
    case 'blockquote':
      return `<blockquote>\n${inner}</blockquote>\n`;
    case 'horizontalRule':
      return '<hr />\n';
    case 'hardBreak':
      return '<br />';
    case 'codeBlock':
      return `<pre><code>${inner}</code></pre>\n`;
    default:
      return inner;
  }
}

function textToHtml(text: Y.XmlText): string {
  const delta = text.toDelta();
  let html = '';

  for (const op of delta) {
    if (typeof op.insert !== 'string') continue;

    let content = escapeHtml(op.insert);
    const a = op.attributes;

    if (a) {
      if (a.bold) content = `<strong>${content}</strong>`;
      if (a.italic) content = `<em>${content}</em>`;
      if (a.strike) content = `<s>${content}</s>`;
      if (a.code) content = `<code>${content}</code>`;
      if (a.highlight) content = `<mark>${content}</mark>`;
    }

    html += content;
  }

  return html;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Read annotations from the Yjs document's 'annotations' Y.Map
// ---------------------------------------------------------------------------
function readAnnotations(doc: Y.Doc): ExportAnnotation[] {
  const annotationsMap = doc.getMap<Y.Map<unknown>>('annotations');
  const result: ExportAnnotation[] = [];

  annotationsMap.forEach((yAnnotation, key) => {
    const repliesArray = yAnnotation.get('replies') as Y.Array<Y.Map<unknown>> | undefined;
    const replies: ExportReply[] = [];

    if (repliesArray) {
      repliesArray.forEach((yReply) => {
        replies.push({
          author: yReply.get('author') as string,
          content: yReply.get('content') as string,
          createdAt: yReply.get('createdAt') as number,
        });
      });
    }

    result.push({
      id: key,
      author: yAnnotation.get('author') as string,
      content: yAnnotation.get('content') as string,
      anchorText: yAnnotation.get('anchorText') as string,
      resolved: (yAnnotation.get('resolved') as boolean) ?? false,
      createdAt: yAnnotation.get('createdAt') as number,
      replies,
    });
  });

  result.sort((a, b) => a.createdAt - b.createdAt);
  return result;
}
