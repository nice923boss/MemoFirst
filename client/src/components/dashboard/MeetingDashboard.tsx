import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';
import type { Editor } from '@tiptap/core';
import type { Annotation } from '../editor/useAnnotations';

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

interface MeetingDashboardProps {
  editor: Editor;
  annotations: Annotation[];
  participants: Participant[];
  templateFields?: FieldDef[];
  meetingTitle: string;
}

export default function MeetingDashboard({
  editor,
  annotations,
  participants,
  templateFields,
  meetingTitle,
}: MeetingDashboardProps) {
  // Extract structured data from editor by heading sections
  const extractedData = useMemo(() => {
    if (!templateFields || templateFields.length === 0) return null;
    return extractSections(editor, templateFields);
  }, [editor, templateFields, editor.state.doc.content.size]);

  // Annotation statistics
  const annotationStats = useMemo(() => {
    const total = annotations.length;
    const resolved = annotations.filter((a) => a.resolved).length;
    const unresolved = total - resolved;

    const byAuthor: Record<string, { total: number; resolved: number; color: string }> = {};
    for (const ann of annotations) {
      if (!byAuthor[ann.author]) {
        byAuthor[ann.author] = { total: 0, resolved: 0, color: ann.color };
      }
      byAuthor[ann.author]!.total++;
      if (ann.resolved) byAuthor[ann.author]!.resolved++;
    }

    const replyCount = annotations.reduce((sum, a) => sum + a.replies.length, 0);

    return { total, resolved, unresolved, byAuthor, replyCount };
  }, [annotations]);

  const authorChartData = useMemo(() => {
    return Object.entries(annotationStats.byAuthor).map(([name, stats]) => ({
      name,
      total: stats.total,
      resolved: stats.resolved,
      unresolved: stats.total - stats.resolved,
      color: stats.color,
    }));
  }, [annotationStats]);

  const statusPieData = useMemo(() => [
    { name: '未解決', value: annotationStats.unresolved, color: '#F59E0B' },
    { name: '已解決', value: annotationStats.resolved, color: '#10B981' },
  ].filter((d) => d.value > 0), [annotationStats]);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <h2 className="text-xl font-bold text-gray-900">{meetingTitle} — 數據面板</h2>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="參與人數" value={participants.length} color="blue" />
          <StatCard label="批註總數" value={annotationStats.total} color="amber" />
          <StatCard label="已解決" value={annotationStats.resolved} color="green" />
          <StatCard label="回覆總數" value={annotationStats.replyCount} color="purple" />
        </div>

        {/* Charts row */}
        {annotationStats.total > 0 && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Annotation by author */}
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold text-gray-700">批註者分布</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={authorChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis allowDecimals={false} fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="unresolved" name="未解決" fill="#F59E0B" stackId="a" />
                  <Bar dataKey="resolved" name="已解決" fill="#10B981" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Resolved vs unresolved pie */}
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold text-gray-700">批註解決率</h3>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={statusPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {statusPieData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Structured data table */}
        {extractedData && extractedData.length > 0 && (
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-700">結構化資料</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    {templateFields!.map((field) => (
                      <th
                        key={field.key}
                        className="whitespace-nowrap px-4 py-3 font-medium text-gray-700"
                      >
                        {field.label}
                        {field.required && <span className="ml-0.5 text-red-400">*</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {extractedData.map((row, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      {templateFields!.map((field) => (
                        <td key={field.key} className="px-4 py-3 text-gray-700">
                          {row[field.label] || (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Participant list */}
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">參與者列表</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {participants.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-lg border p-3">
                <span
                  className="inline-block h-4 w-4 shrink-0 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-800">{p.nickname}</div>
                  <div className="text-xs text-gray-400">
                    {new Date(p.joined_at).toLocaleString('zh-TW', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Extract sections from editor content ---

function extractSections(
  editor: Editor,
  fields: FieldDef[],
): Array<Record<string, string>> {
  const doc = editor.state.doc;
  const sections: Array<{ heading: string; content: string }> = [];

  let currentHeading = '';
  let currentContent: string[] = [];

  doc.descendants((node) => {
    if (node.type.name === 'heading') {
      // Save previous section
      if (currentHeading) {
        sections.push({
          heading: currentHeading,
          content: currentContent.join('\n').trim(),
        });
      }
      currentHeading = node.textContent;
      currentContent = [];
      return false; // don't descend into heading
    }

    if (node.isTextblock && currentHeading) {
      const text = node.textContent.trim();
      // Skip hint text (starts with 可選：, 格式：, 請輸入)
      if (text && !text.startsWith('可選：') && !text.startsWith('格式：') && !text.startsWith('請輸入')) {
        currentContent.push(text);
      }
    }
    return true;
  });

  // Save last section
  if (currentHeading) {
    sections.push({
      heading: currentHeading,
      content: currentContent.join('\n').trim(),
    });
  }

  // Map sections to field labels
  const fieldLabels = new Set(fields.map((f) => f.label));
  const row: Record<string, string> = {};

  for (const section of sections) {
    if (fieldLabels.has(section.heading)) {
      row[section.heading] = section.content;
    }
  }

  // Return as single row if any data found
  const hasData = Object.values(row).some((v) => v.length > 0);
  return hasData ? [row] : [];
}

// --- Stat Card ---

const COLOR_MAP: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-700',
  amber: 'bg-amber-50 text-amber-700',
  green: 'bg-green-50 text-green-700',
  purple: 'bg-purple-50 text-purple-700',
};

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${COLOR_MAP[color] ?? 'bg-gray-50 text-gray-700'}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="mt-1 text-xs font-medium opacity-80">{label}</div>
    </div>
  );
}
