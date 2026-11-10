// ---------------------------------------------------------------------------
// File download helper
// ---------------------------------------------------------------------------
function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// HTML → Markdown converter (supports TipTap node types)
// ---------------------------------------------------------------------------
function nodeToMarkdown(node: Node, listIndex?: number): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? '';
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const children = Array.from(el.childNodes)
    .map((n) => nodeToMarkdown(n))
    .join('');

  switch (tag) {
    case 'h1':
      return `# ${children}\n\n`;
    case 'h2':
      return `## ${children}\n\n`;
    case 'h3':
      return `### ${children}\n\n`;
    case 'h4':
      return `#### ${children}\n\n`;
    case 'p':
      return `${children}\n\n`;
    case 'strong':
    case 'b':
      return `**${children}**`;
    case 'em':
    case 'i':
      return `*${children}*`;
    case 's':
    case 'del':
      return `~~${children}~~`;
    case 'code':
      return `\`${children}\``;
    case 'pre':
      return `\`\`\`\n${el.textContent ?? ''}\n\`\`\`\n\n`;
    case 'ul': {
      const items = Array.from(el.children)
        .map((li) => nodeToMarkdown(li))
        .join('');
      return `${items}\n`;
    }
    case 'ol': {
      const items = Array.from(el.children)
        .map((li, i) => nodeToMarkdown(li, i + 1))
        .join('');
      return `${items}\n`;
    }
    case 'li': {
      const prefix = listIndex != null ? `${listIndex}. ` : '- ';
      return `${prefix}${children.trim()}\n`;
    }
    case 'blockquote':
      return (
        children
          .split('\n')
          .filter((l) => l.trim())
          .map((l) => `> ${l}`)
          .join('\n') + '\n\n'
      );
    case 'hr':
      return '---\n\n';
    case 'br':
      return '\n';
    case 'mark':
      return children;
    default:
      return children;
  }
}

function htmlToMarkdown(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return nodeToMarkdown(div).trim();
}

// ---------------------------------------------------------------------------
// Annotation section for export
// ---------------------------------------------------------------------------
interface ExportAnnotation {
  author: string;
  content: string;
  anchorText: string;
  resolved: boolean;
  createdAt: number;
  replies: Array<{
    author: string;
    content: string;
    createdAt: number;
  }>;
}

function annotationsToHtml(annotations: ExportAnnotation[]): string {
  if (annotations.length === 0) return '';

  const unresolved = annotations.filter((a) => !a.resolved);
  const resolved = annotations.filter((a) => a.resolved);

  let html = '<h2>批註紀錄</h2>\n';

  const renderList = (list: ExportAnnotation[], label: string) => {
    if (list.length === 0) return '';
    let s = `<h3>${label}（${list.length}）</h3>\n`;
    for (const ann of list) {
      const time = new Date(ann.createdAt).toLocaleString('zh-TW');
      s += `<div style="margin:8px 0;padding:8px;border-left:3px solid #f59e0b;background:#fffbeb;">`;
      s += `<div><strong>${escapeHtml(ann.author)}</strong> — <em>「${escapeHtml(ann.anchorText)}」</em></div>`;
      s += `<div>${escapeHtml(ann.content)}</div>`;
      s += `<div style="font-size:0.8em;color:#888;">${time}</div>`;
      for (const r of ann.replies) {
        const rTime = new Date(r.createdAt).toLocaleString('zh-TW');
        s += `<div style="margin-left:16px;margin-top:4px;padding:4px 8px;border-left:2px solid #ddd;">`;
        s += `<strong>${escapeHtml(r.author)}</strong>：${escapeHtml(r.content)} <span style="font-size:0.8em;color:#888;">${rTime}</span>`;
        s += `</div>`;
      }
      s += `</div>\n`;
    }
    return s;
  };

  html += renderList(unresolved, '未解決');
  html += renderList(resolved, '已解決');
  return html;
}

function annotationsToMarkdown(annotations: ExportAnnotation[]): string {
  if (annotations.length === 0) return '';

  const unresolved = annotations.filter((a) => !a.resolved);
  const resolved = annotations.filter((a) => a.resolved);

  let md = '\n---\n\n## 批註紀錄\n\n';

  const renderList = (list: ExportAnnotation[], label: string) => {
    if (list.length === 0) return '';
    let s = `### ${label}（${list.length}）\n\n`;
    for (const ann of list) {
      const time = new Date(ann.createdAt).toLocaleString('zh-TW');
      s += `- **${ann.author}** — *「${ann.anchorText}」*\n`;
      s += `  ${ann.content} *(${time})*\n`;
      for (const r of ann.replies) {
        const rTime = new Date(r.createdAt).toLocaleString('zh-TW');
        s += `  - **${r.author}**：${r.content} *(${rTime})*\n`;
      }
      s += '\n';
    }
    return s;
  };

  md += renderList(unresolved, '未解決');
  md += renderList(resolved, '已解決');
  return md;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Shared HTML wrapper for Word and PDF
// ---------------------------------------------------------------------------
function wrapHtml(title: string, html: string, annotationsHtml: string, forWord: boolean): string {
  const wordNs = forWord
    ? ' xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"'
    : '';

  return `<html${wordNs}>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      font-family: '微軟正黑體', 'Microsoft JhengHei', 'PingFang TC', sans-serif;
      line-height: 1.8;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
      color: #1a1a1a;
    }
    h1 { font-size: 24px; border-bottom: 2px solid #333; padding-bottom: 8px; }
    h2 { font-size: 20px; margin-top: 24px; }
    h3 { font-size: 16px; margin-top: 20px; }
    p { margin: 8px 0; }
    blockquote { border-left: 3px solid #ccc; padding-left: 12px; color: #555; margin: 12px 0; }
    mark { background-color: #fef08a; padding: 1px 2px; }
    hr { border: none; border-top: 1px solid #ddd; margin: 20px 0; }
    code { background: #f3f4f6; padding: 2px 4px; border-radius: 3px; font-size: 0.9em; }
    pre { background: #f3f4f6; padding: 12px; border-radius: 6px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    ul, ol { padding-left: 24px; }
    li { margin: 4px 0; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${html}
  ${annotationsHtml}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Public export functions
// ---------------------------------------------------------------------------
export function exportAsMarkdown(
  html: string,
  title: string,
  annotations: ExportAnnotation[] = [],
): void {
  const md = `# ${title}\n\n${htmlToMarkdown(html)}${annotationsToMarkdown(annotations)}`;
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  downloadFile(blob, `${title}.md`);
}

export function exportAsWord(
  html: string,
  title: string,
  annotations: ExportAnnotation[] = [],
): void {
  const annotationsHtml = annotationsToHtml(annotations);
  const wordHtml = wrapHtml(title, html, annotationsHtml, true);
  const blob = new Blob(['\ufeff' + wordHtml], { type: 'application/msword' });
  downloadFile(blob, `${title}.doc`);
}

export function exportAsPdf(
  html: string,
  title: string,
  annotations: ExportAnnotation[] = [],
): void {
  const annotationsHtml = annotationsToHtml(annotations);
  const fullHtml = wrapHtml(title, html, annotationsHtml, false);

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('無法開啟列印視窗，請允許彈出式視窗');
    return;
  }

  printWindow.document.write('<!DOCTYPE html>' + fullHtml);
  printWindow.document.close();

  // Wait for content to fully render, then trigger print dialog
  printWindow.onload = () => {
    printWindow.print();
  };
}
