export const navigation = [
  { title: '工作空间', items: [
    { id:'workbench', title:'工作台', icon:'DataAnalysis', subtitle:'从项目出发，查看任务、待办与数据统计' },
    { id:'projects', title:'数据加工', icon:'SetUp', subtitle:'以项目为单位组织资料、加工任务与数据成果' },
    { id:'project-tasks', title:'加工任务', icon:'List', subtitle:'统一跟踪各项目的加工任务、运行进度与预设流程' },
    { id:'mydatasets', title:'我的数据集', icon:'Files', subtitle:'查看本人拥有的数据集，打开项目继续建设' },
  ] },
  { title:'数据治理与共享', items:[
    { id:'catalog', title:'数据目录', icon:'Collection', subtitle:'管理本人拥有及申请获批的数据集' },
    { id:'square', title:'数据广场', icon:'Grid', subtitle:'发现已发布成果，预览并申请使用' },
    { id:'standards', title:'数据标准与字典', icon:'Document', subtitle:'统一业务字段、标签与数据规范' },
    { id:'audit', title:'成果审核', icon:'CircleCheck', subtitle:'汇总各项目待审核的数据成果' },
    { id:'requests', title:'使用申请与审批', icon:'DocumentChecked', subtitle:'按发布版本申请和授予数据使用权限' },
    { id:'permissions', title:'权限管理', icon:'Lock', subtitle:'按角色、项目和数据等级设置访问权限' },
    { id:'services', title:'数据服务', icon:'Connection', subtitle:'为已发布版本配置数据接口示例' },
  ] },
]

export const researchText = '土壤含水量对作物生长的影响\n\n本试验于2026年10月在试验田开展，采样深度为0—20厘米。A组土壤质量含水率为20%，B组为25%。质量含水率为水分质量与干土质量之比。\n\n实验方法\n每组设置三个重复，在同一时间采样，使用烘干法测定土壤含水量。\n\n研究结果\nB组比A组高5个百分点。本试验没有记录作物产量，不能据此推断增产效果。'
export const qaSamples = [
  { question: 'B组比A组的土壤含水量高多少个百分点？', answer: 'B组为25%，A组为20%，因此B组比A组高5个百分点。', reference: 'A组土壤质量含水率为20%，B组为25%。', label: '', rating: 0 },
  { question: '实验采用什么方法测定土壤含水量？', answer: '采用烘干法测定土壤含水量，每组设置三个重复。', reference: '每组设置三个重复，在同一时间采样，使用烘干法测定土壤含水量。', label: '', rating: 0 },
  { question: 'B组的作物产量提高了多少？', answer: '作物产量提高了30%。', reference: '本试验没有记录作物产量。', label: '', rating: 0 },
]
export const tableSamples = [
  { sample_id: 'S001', sampling_time: '2026-10-01', sampling_depth: 10, soil_moisture: 20 },
  { sample_id: 'S002', sampling_time: '2026-10-01', sampling_depth: 20, soil_moisture: 25 },
  { sample_id: 'S002', sampling_time: '2026-10-01', sampling_depth: 20, soil_moisture: 25 },
  { sample_id: 'S003', sampling_time: '2026-10-02', sampling_depth: -5, soil_moisture: null },
]
export const sampleImage = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="500" viewBox="0 0 900 500"><rect width="900" height="500" fill="#f5f9f5"/><text x="45" y="52" font-size="24" fill="#203b35">土壤含水量对比 · 演示样例</text><path d="M110 100V400H800" stroke="#93ada6" fill="none" stroke-width="2"/><path d="M110 280H800M110 160H800" stroke="#e0e9e5"/><rect x="230" y="240" width="155" height="160" rx="8" fill="#45a38e"/><rect x="510" y="200" width="155" height="200" rx="8" fill="#6b8ee8"/><text x="280" y="220" font-size="25" fill="#203b35">20%</text><text x="555" y="180" font-size="25" fill="#203b35">25%</text><text x="280" y="440" font-size="22">A组</text><text x="560" y="440" font-size="22">B组</text><text x="110" y="480" font-size="16" fill="#687e78">质量含水率（%） · 每组三个重复</text></svg>')}`

export function initialData() {
  const created = '2026/10/20 09:30:00'
  return {
    role: '管理员', activeDataset: 'soil', ui: {}, conversations: [], evaluations: [],
    datasets: [
      { id: 'soil', name: '土壤含水量科研数据集', type: '问答对', scene: '土壤环境科研与问答', demand: '加工实验资料，为科研检索和模型训练提供数据。', quality: '保留来源；数值准确；问答完整', format: 'JSON、Markdown', scale: 100, source: '试验报告与采样记录', status: '建设中', project: '土壤科研', level: '内部', tags: ['土壤环境', '科研问答'], created },
      { id: 'paper', name: '科研文献解析样例', type: '文本', scene: '科研文献检索', demand: '提取标题、正文与表格', quality: '阅读顺序正确', format: 'Markdown', scale: 20, source: '论文', status: '草稿', project: '文献调研', level: '公开', tags: ['文献'], created },
    ],
    sources: [
      { id: 'src-report', datasetId: 'soil', name: '土壤含水量试验报告.txt', type: 'TXT', status: '已解析', content: researchText, created, size: 780 },
      { id: 'src-table', datasetId: 'soil', name: '土壤采样记录.csv', type: 'CSV', status: '待处理', content: JSON.stringify(tableSamples, null, 2), created, size: 430 },
      { id: 'src-image', datasetId: 'soil', name: '土壤含水量对比图.svg', type: 'SVG', status: '待标注', content: sampleImage, created, size: 1200 },
      { id: 'src-pdf', datasetId: 'paper', name: '文献解析演示.pdf', type: 'PDF', status: '待解析', content: '', created, size: 102400 },
    ],
    versions: [
      { id: 'soil-v1', datasetId: 'soil', number: 1, type: '问答生成', status: '已发布', records: qaSamples.slice(0, 2), sourceId: 'src-report', created, reviewNote: '已核对来源与数值', published: created, release: { tag: 'v1.0.0', title: '土壤科研问答首个发布版', notes: '包含2条经核对的土壤试验问答。\n数据范围：含水量对比、测定方法。\n使用时请保留参考材料，不得据此推断作物增产。', publisher: '管理员', publishedAt: created, versionId: 'soil-v1' } },
      { id: 'soil-v2', datasetId: 'soil', number: 2, type: '问答增强', status: '待审核', records: qaSamples, sourceId: 'soil-v1', created, reviewNote: '' },
    ],
    tasks: [{ id: 'task-seed', datasetId: 'soil', name: '试验报告问答生成', type: '问答生成', status: '已完成', progress: 100, sourceId: 'src-report', versionId: 'soil-v1', created, logs: ['已载入演示材料', '生成2条问答', '处理完成（模拟）'] }],
    requests: [], models: [{ id: 'model-1', name: '科研助手模型', address: 'https://example.invalid/v1', status: '已上架', type: '对话模型' }],
    terms: [
      { id: 'term1', name: '采样深度', field: 'sampling_depth', unit: '厘米', type: '数值', description: '样品采集位置距地表的深度。' },
      { id: 'term2', name: '土壤含水量', field: 'soil_moisture', unit: '%', type: '数值', description: '质量含水率：水分质量与干土质量之比。20表示20%。' },
      { id: 'term3', name: '采样时间', field: 'sampling_time', unit: '北京时间', type: '日期', description: '样品实际采集的日期与时间。' },
    ],
    standards: [
      { id: 'std1', name: '科研资料采集规范', category: '全流程标准', description: '采集时记录标题、来源、日期和所属项目；内部数据按申请授权共享。' },
      { id: 'std2', name: '通用文档元数据', category: '元数据规范', description: '标题、作者、来源、文件类型、采集时间、数据等级。' },
      { id: 'std3', name: '土壤环境清洗流程', category: '场景清洗流程', description: '去重 → 缺失值检查 → 采样深度范围检查 → 单位标准化。', rules: ['文档去重', '质量过滤', '格式标准化'] },
    ],
    permissions: ['管理员', '加工人员', '审核人员', '数据使用者'].map(role => ({ id: role, role, project: '全部项目', level: '内部', view: true, edit: ['管理员', '加工人员'].includes(role), review: ['管理员', '审核人员'].includes(role), download: true })),
    services: [], notices: ['欢迎使用数据知识加工平台演示。所有模型和处理任务均使用模拟结果。'],
  }
}


export function imageCleaningSamples() {
  const svg = decodeURIComponent(sampleImage.split(',')[1])
  const variants = [
    ['正常图片.svg', svg, 900, 500, 90],
    ['重复图片.svg', svg, 900, 500, 90],
    ['低分辨率图片.svg', svg.replace('width="900" height="500"', 'width="180" height="100"'), 180, 100, 90],
    ['模糊图片.svg', svg.replace('<rect ', '<defs><filter id="blur"><feGaussianBlur stdDeviation="7"/></filter></defs><g filter="url(#blur)"><rect ').replace('</svg>', '</g></svg>'), 900, 500, 25],
  ]
  return variants.map(([name, svg, width, height, clarity]) => ({ name, content: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, width, height, clarity, format: 'SVG' }))
}
