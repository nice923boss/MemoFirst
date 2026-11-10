import { queryOne, execute } from './helpers';

const DEFAULT_TEMPLATES = [
  {
    name: '週會進度同步',
    description: '每週定期同步各部門工作進度、待辦事項與跨部門協作需求',
    fields_schema: JSON.stringify([
      { key: 'department', label: '部門/組別', type: 'text', required: true },
      { key: 'owner', label: '報告人', type: 'text', required: true },
      { key: 'last_week', label: '上週完成事項', type: 'text', required: true },
      { key: 'this_week', label: '本週重點任務', type: 'text', required: true },
      { key: 'blocker', label: '需協助事項', type: 'text', required: false },
      { key: 'status', label: '進度狀態', type: 'select', options: ['正常', '延遲', '風險', '已完成'] },
    ]),
  },
  {
    name: '內容選題企劃',
    description: '媒體團隊的內容選題提報，評估題材方向、受眾定位與製作可行性',
    fields_schema: JSON.stringify([
      { key: 'topic', label: '選題名稱', type: 'text', required: true },
      { key: 'proposer', label: '提案人', type: 'text', required: true },
      { key: 'content_type', label: '內容形式', type: 'select', options: ['短影片', '長影片', '圖文', 'Podcast', '直播', '懶人包', '其他'] },
      { key: 'target_audience', label: '目標受眾', type: 'text', required: false },
      { key: 'publish_date', label: '預計發布日', type: 'date', required: false },
      { key: 'priority', label: '優先度', type: 'select', options: ['高', '中', '低'] },
      { key: 'status', label: '審核狀態', type: 'select', options: ['提案中', '已通過', '需修改', '已排入製作', '已取消'] },
    ]),
  },
  {
    name: '客戶需求評審',
    description: '評審客戶提出的需求或案件，確認範圍、時程與資源分配',
    fields_schema: JSON.stringify([
      { key: 'client_name', label: '客戶名稱', type: 'text', required: true },
      { key: 'requirement', label: '需求描述', type: 'text', required: true },
      { key: 'contact', label: '對口窗口', type: 'text', required: false },
      { key: 'budget', label: '預算範圍', type: 'text', required: false },
      { key: 'deadline', label: '客戶期望交付日', type: 'date', required: false },
      { key: 'owner', label: '內部負責人', type: 'text', required: true },
      { key: 'feasibility', label: '可行性', type: 'select', options: ['可執行', '需評估', '資源不足', '不可行'] },
    ]),
  },
  {
    name: '季度業績檢討',
    description: '每季檢討業績達成率、營收數據與下季目標設定',
    fields_schema: JSON.stringify([
      { key: 'metric', label: '指標項目', type: 'text', required: true },
      { key: 'target', label: '目標值', type: 'text', required: true },
      { key: 'actual', label: '實際達成', type: 'text', required: true },
      { key: 'achievement_rate', label: '達成率(%)', type: 'number', required: false },
      { key: 'analysis', label: '差異分析', type: 'text', required: false },
      { key: 'next_quarter_plan', label: '下季改善計畫', type: 'text', required: false },
      { key: 'owner', label: '負責人', type: 'text', required: false },
    ]),
  },
  {
    name: '產品功能規劃',
    description: '討論產品新功能需求、優先排序與開發時程安排',
    fields_schema: JSON.stringify([
      { key: 'feature', label: '功能名稱', type: 'text', required: true },
      { key: 'proposer', label: '提出人', type: 'text', required: true },
      { key: 'user_story', label: '使用情境', type: 'text', required: false },
      { key: 'effort', label: '預估工時', type: 'select', options: ['小(1~2天)', '中(3~5天)', '大(1~2週)', '超大(2週以上)'] },
      { key: 'priority', label: '優先度', type: 'select', options: ['P0-緊急', 'P1-重要', 'P2-一般', 'P3-低'] },
      { key: 'owner', label: '負責人', type: 'text', required: false },
      { key: 'status', label: '狀態', type: 'select', options: ['待評估', '已排入', '開發中', '已上線', '暫緩'] },
    ]),
  },
  {
    name: '行銷活動策劃',
    description: '規劃行銷活動的目標、管道、預算分配與成效追蹤',
    fields_schema: JSON.stringify([
      { key: 'campaign', label: '活動名稱', type: 'text', required: true },
      { key: 'goal', label: '活動目標', type: 'text', required: true },
      { key: 'channel', label: '推廣管道', type: 'select', options: ['FB/IG 廣告', 'Google Ads', 'KOL 合作', 'EDM', 'LINE 推播', '實體活動', '其他'] },
      { key: 'budget', label: '預算(元)', type: 'number', required: false },
      { key: 'start_date', label: '開始日期', type: 'date', required: false },
      { key: 'end_date', label: '結束日期', type: 'date', required: false },
      { key: 'owner', label: '負責人', type: 'text', required: true },
      { key: 'kpi', label: '成效 KPI', type: 'text', required: false },
    ]),
  },
  {
    name: '影片製作排程',
    description: '追蹤影片從腳本到上架的各階段進度，適合影音內容團隊',
    fields_schema: JSON.stringify([
      { key: 'video_title', label: '影片標題', type: 'text', required: true },
      { key: 'director', label: '負責編導', type: 'text', required: true },
      { key: 'stage', label: '製作階段', type: 'select', options: ['腳本撰寫', '拍攝準備', '拍攝中', '剪輯中', '審核修改', '字幕上架', '已發布'] },
      { key: 'shoot_date', label: '拍攝日期', type: 'date', required: false },
      { key: 'publish_date', label: '預計上架日', type: 'date', required: false },
      { key: 'platform', label: '發布平台', type: 'select', options: ['YouTube', 'Facebook', 'Instagram', 'TikTok', '官網', '多平台'] },
      { key: 'notes', label: '備註', type: 'text', required: false },
    ]),
  },
  {
    name: '問題排查與決議',
    description: '針對緊急問題或異常狀況，記錄排查過程與最終決議',
    fields_schema: JSON.stringify([
      { key: 'issue', label: '問題描述', type: 'text', required: true },
      { key: 'raised_by', label: '提出人', type: 'text', required: true },
      { key: 'severity', label: '嚴重程度', type: 'select', options: ['緊急', '高', '中', '低'] },
      { key: 'root_cause', label: '根因分析', type: 'text', required: false },
      { key: 'resolution', label: '決議方案', type: 'text', required: false },
      { key: 'action_item', label: '後續行動', type: 'text', required: false },
      { key: 'owner', label: '負責人', type: 'text', required: false },
      { key: 'deadline', label: '完成期限', type: 'date', required: false },
    ]),
  },
  {
    name: '專案啟動會議',
    description: '新專案開案時對齊目標、角色分工、里程碑與風險評估',
    fields_schema: JSON.stringify([
      { key: 'project_name', label: '專案名稱', type: 'text', required: true },
      { key: 'objective', label: '專案目標', type: 'text', required: true },
      { key: 'role', label: '角色', type: 'text', required: true },
      { key: 'member', label: '成員', type: 'text', required: true },
      { key: 'milestone', label: '關鍵里程碑', type: 'text', required: false },
      { key: 'target_date', label: '預計完成日', type: 'date', required: false },
      { key: 'risk', label: '風險項目', type: 'text', required: false },
      { key: 'mitigation', label: '因應措施', type: 'text', required: false },
    ]),
  },
  {
    name: '覆盤總結',
    description: '專案或活動結束後的回顧，檢討成效、汲取經驗與規劃改善',
    fields_schema: JSON.stringify([
      { key: 'topic', label: '覆盤主題', type: 'text', required: true },
      { key: 'went_well', label: '做得好的', type: 'text', required: true },
      { key: 'to_improve', label: '待改善的', type: 'text', required: true },
      { key: 'lesson_learned', label: '經驗教訓', type: 'text', required: false },
      { key: 'action_item', label: '改善行動', type: 'text', required: false },
      { key: 'owner', label: '負責人', type: 'text', required: false },
      { key: 'deadline', label: '完成期限', type: 'date', required: false },
    ]),
  },
];

export function seedTemplates(): void {
  const row = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM templates');

  if (row && row.count > 0) {
    console.log('模板已存在，跳過 seed');
    return;
  }

  for (const template of DEFAULT_TEMPLATES) {
    execute(
      'INSERT INTO templates (name, description, fields_schema) VALUES (?, ?, ?)',
      [template.name, template.description, template.fields_schema],
    );
  }

  console.log(`已建立 ${DEFAULT_TEMPLATES.length} 個預設模板`);
}
