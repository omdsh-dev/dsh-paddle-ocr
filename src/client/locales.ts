/**
 * Locale dictionaries for the PaddleOCR settings card and task panel. Keys
 * are merged into the slots locale map so `PropsLocale<'paddleOcr'>` types
 * the card's `t` seat.
 * @module
 */

/** Locale keys these surfaces render. */
export type PaddleLocaleKey =
  | 'overridden' | 'reset' | 'readOnly' | 'expand' | 'collapse'
  | 'save' | 'saving' | 'discard' | 'unsaved' | 'saveFailed'
  | 'paddleTitle' | 'paddleDescription'
  | 'apiKey' | 'apiKeyHint' | 'apiKeySet' | 'apiKeyUnset' | 'apiKeyGuide'
  | 'testConnection' | 'testingConnection' | 'openPanel'
  | 'defaultsTitle' | 'modeHint' | 'modeAsync' | 'modeSync' | 'orientation' | 'orientationHint'
  | 'unwarping' | 'unwarpingHint' | 'chart' | 'chartHint' | 'visualize' | 'visualizeHint'
  | 'panelTitle' | 'panelClose' | 'panelEmpty' | 'panelDropHint' | 'panelPick' | 'panelStart'
  | 'panelSizeHint' | 'panelQueued' | 'panelChecking' | 'panelSplitting' | 'panelSubmitting'
  | 'panelRunning' | 'panelDownloading' | 'panelDone' | 'panelFailed' | 'panelQueueFull'
  | 'panelRetryLater' | 'panelRetry' | 'panelCancel' | 'panelCommit' | 'panelCommitted'
  | 'panelResults' | 'panelImages' | 'panelNoImages' | 'panelOutputDir' | 'panelPart'
  | 'panelAttempts' | 'panelModeLabel' | 'panelEmptyDone' | 'panelErrorDetail'

/** English copy. */
export const en: Record<PaddleLocaleKey, string> = {
  overridden: 'Overridden',
  reset: 'Reset',
  readOnly: 'This deployment stores settings read-only.',
  expand: 'Show settings',
  collapse: 'Hide settings',
  save: 'Save',
  saving: 'Saving…',
  discard: 'Discard',
  unsaved: 'Unsaved',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
  paddleTitle: 'PaddleOCR',
  paddleDescription: 'Baidu PaddleOCR-VL document layout parsing: PDF/image → per-page Markdown.',
  apiKey: 'API token',
  apiKeyHint: 'Stored in the DSH credential vault, never in settings. Leave blank to keep the current token.',
  apiKeySet: 'A token is configured.',
  apiKeyUnset: 'No token configured — OCR is unavailable until one is.',
  apiKeyGuide: 'Get one at aistudio.baidu.com (星河社区) → 个人中心 → 访问令牌 (token), then paste it here.',
  testConnection: 'Test connection',
  testingConnection: 'Testing…',
  openPanel: 'Open task panel',
  defaultsTitle: 'Processing defaults',
  modeHint: 'Async handles up to 1000 pages and auto-splits; sync is immediate but limited to 100 pages.',
  modeAsync: 'Async (recommended)',
  modeSync: 'Sync (≤100 pages)',
  orientation: 'Orientation correction',
  orientationHint: 'Auto-correct document rotation (0/90/180/270°).',
  unwarping: 'Document unwarping',
  unwarpingHint: 'Correct warped/wrinkled page images.',
  chart: 'Chart recognition',
  chartHint: 'Parse charts into tables.',
  visualize: 'Visualization images',
  visualizeHint: 'Save annotated layout images alongside results.',
  panelTitle: 'PaddleOCR 任务面板',
  panelClose: 'Close panel',
  panelEmpty: '拖入或选择一个 PDF/图片，解析结果会在这里展示。',
  panelDropHint: '拖拽文件到此处，或',
  panelPick: '选择文件',
  panelStart: '开始解析',
  panelSizeHint: '面板上传上限 30MB；更大的文件请让 agent 用 paddle_ocr_layout 工具处理。',
  panelQueued: '排队中…',
  panelChecking: '检查文件…',
  panelSplitting: '文件超过接口限制，拆分中…',
  panelSubmitting: '提交解析任务…',
  panelRunning: '解析第 {page}/{total} 页…',
  panelDownloading: '下载页面图片…',
  panelDone: '解析完成',
  panelFailed: '解析失败',
  panelQueueFull: '当前排队中',
  panelRetryLater: '当前排队中（稍后重试）',
  panelRetry: '稍后重试',
  panelCancel: '取消',
  panelCommit: '落到工作区',
  panelCommitted: '已落到工作区',
  panelResults: '结果',
  panelImages: '图片',
  panelNoImages: '本页没有图片',
  panelOutputDir: '输出目录',
  panelPart: '第 {part}/{totalParts} 份',
  panelAttempts: '已重试 {attempts} 次',
  panelModeLabel: '模式',
  panelEmptyDone: '（无文字内容）',
  panelErrorDetail: '错误详情',
}

/** Simplified Chinese copy. */
export const zh: Record<PaddleLocaleKey, string> = {
  overridden: '已覆盖',
  reset: '恢复默认',
  readOnly: '本部署的设置为只读。',
  expand: '展开设置',
  collapse: '收起设置',
  save: '保存',
  saving: '保存中…',
  discard: '放弃修改',
  unsaved: '未保存',
  saveFailed: '本部署没有接受这些值，已保留供你修改。',
  paddleTitle: 'PaddleOCR',
  paddleDescription: '百度 PaddleOCR-VL 文档布局解析：PDF/图片 → 逐页 Markdown。',
  apiKey: 'API token',
  apiKeyHint: '只写入 DSH 凭据保险箱，不进设置文档。留空表示保留现有 token。',
  apiKeySet: '已配置 token。',
  apiKeyUnset: '未配置 token —— 配置前 OCR 不可用。',
  apiKeyGuide: '获取方式：星河社区 aistudio.baidu.com → 个人中心 → 访问令牌（token），复制后粘贴到上方。',
  testConnection: '测试连接',
  testingConnection: '测试中…',
  openPanel: '打开任务面板',
  defaultsTitle: '处理默认值',
  modeHint: '异步最多 1000 页且自动拆分；同步即时返回但限 100 页。',
  modeAsync: '异步（推荐）',
  modeSync: '同步（≤100 页）',
  orientation: '方向矫正',
  orientationHint: '自动矫正文档旋转（0/90/180/270 度）。',
  unwarping: '文档展平',
  unwarpingHint: '矫正褶皱/弯曲的页面图像。',
  chart: '图表识别',
  chartHint: '把图表解析为表格。',
  visualize: '可视化标注图',
  visualizeHint: '同时保存标注了布局区域的图。',
  panelTitle: 'PaddleOCR 任务面板',
  panelClose: '收起面板',
  panelEmpty: '拖入或选择一个 PDF/图片，解析结果会在这里展示。',
  panelDropHint: '把文件拖到这里，或',
  panelPick: '选择文件',
  panelStart: '开始解析',
  panelSizeHint: '面板上传上限 30MB；更大的文件请让 agent 用 paddle_ocr_layout 工具处理。',
  panelQueued: '排队中…',
  panelChecking: '检查文件…',
  panelSplitting: '文件超过接口限制，拆分中…',
  panelSubmitting: '提交解析任务…',
  panelRunning: '解析第 {page}/{total} 页…',
  panelDownloading: '下载页面图片…',
  panelDone: '解析完成',
  panelFailed: '解析失败',
  panelQueueFull: '当前排队中',
  panelRetryLater: '当前排队中（稍后重试）',
  panelRetry: '稍后重试',
  panelCancel: '取消',
  panelCommit: '落到工作区',
  panelCommitted: '已落到工作区',
  panelResults: '结果',
  panelImages: '图片',
  panelNoImages: '本页没有图片',
  panelOutputDir: '输出目录',
  panelPart: '第 {part}/{totalParts} 份',
  panelAttempts: '已重试 {attempts} 次',
  panelModeLabel: '模式',
  panelEmptyDone: '（无文字内容）',
  panelErrorDetail: '错误详情',
}

/** Slot-side merge so PropsLocale<'paddleOcr'> resolves. */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    paddleOcr: PaddleLocaleKey
  }
}
