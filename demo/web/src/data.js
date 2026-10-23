import { ensureLifecycleGovernance, qualityFingerprint, reviseStandard, contentFieldsFor, runQualityReport, executionStandards, validateGovernance, publicationEvidence } from './domain.js'
export const navigation = [
  { title: '工作空间', items: [
    { id:'workbench', title:'工作台', icon:'DataAnalysis', subtitle:'从项目出发，查看任务、待办与数据统计' },
    { id:'projects', title:'数据加工', icon:'SetUp', subtitle:'以项目为单位组织资料、加工任务与数据成果' },
    { id:'mydatasets', title:'我的数据集', icon:'Files', subtitle:'查看本人拥有的数据集，打开项目继续建设' },
  ] },
  { title:'数据治理与共享', items:[
    {id:'catalog',title:'数据目录',icon:'Collection'},
    {id:'square',title:'数据广场',icon:'Grid'},
    {id:'standards',title:'分类字典',icon:'Notebook'},
    {id:'audit',title:'数据质量审核',icon:'CircleCheck'},
    {id:'requests',title:'使用申请与审批',icon:'DocumentChecked'},
    {id:'services',title:'数据服务',icon:'Connection'},
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

function industryImage(kind, color, label) {
  const drawing = kind === 'vehicle'
    ? `<rect x="105" y="105" width="275" height="110" rx="28" fill="${color}"/><path d="M158 105L190 62H292L330 105" fill="${color}"/><path d="M193 72H283L307 105H170Z" fill="#e9f4ff"/><circle cx="167" cy="218" r="25" fill="#40536d"/><circle cx="322" cy="218" r="25" fill="#40536d"/><path d="M60 250H440" stroke="#d1dce9" stroke-width="3"/>`
    : `<path d="M250 238C100 160 145 60 337 40C368 172 323 210 250 238Z" fill="${color}"/><path d="M221 272L302 89" stroke="#477355" stroke-width="7" stroke-linecap="round"/><path d="M251 205L201 162M271 161L322 140" stroke="#ffffff80" stroke-width="4"/>${label.includes('斑点') ? '<circle cx="246" cy="120" r="13" fill="#b17b46"/><circle cx="298" cy="172" r="10" fill="#b17b46"/>' : ''}`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="320" viewBox="0 0 500 320"><rect width="500" height="320" fill="#f4f7fb"/>${drawing}<text x="250" y="303" text-anchor="middle" font-size="16" fill="#5e718c">${label}</text></svg>`)}`
}

export function addIndustryDatasets(data) {
  if (data.industrySeedsVersion >= 1) return seedDatasetDownloads(data)
  const created = '2026/10/21 09:00:00'
  const specs = [
    { key:'health', name:'医疗服务文本分类数据集', industry:'医疗健康', type:'文本分类', team:'健康信息研究组', icon:'DocumentChecked', tone:'rose', rank:1, tags:['服务分类','医疗文本'], scene:'对服务记录进行意图分类', records:[
      { title:'预约咨询', content:'来访者询问下周可预约的服务时段。', label:'预约服务' },
      { title:'设备报修', content:'工作人员提交影像采集设备的定期维护申请。', label:'设备管理' },
      { title:'信息修改', content:'用户需要更新预留联系方式。', label:'信息更新' },
    ] },
    { key:'finance', name:'企业财务指标问答数据集', industry:'金融财会', type:'问答对', team:'财务数据研究组', icon:'DataAnalysis', tone:'amber', rank:2, tags:['财务指标','数值问答'], scene:'财务术语解释与基础指标计算', records:[
      { question:'收入120万元、成本90万元，毛利是多少？', answer:'毛利为120－90＝30万元。', reference:'样例报表：收入120万元，营业成本90万元。' },
      { question:'应收账款期初20万元、期末30万元，平均余额是多少？', answer:'平均余额为（20＋30）÷2＝25万元。', reference:'样例报表：应收账款期初20万元，期末30万元。' },
      { question:'上期收入100万元，本期110万元，增加了多少？', answer:'增加10万元，增幅为10%。', reference:'样例报表：上期收入100万元，本期110万元。' },
    ] },
    { key:'industry', name:'工业设备巡检记录数据集', industry:'工业制造', type:'结构化数据', team:'设备运维研究组', icon:'Cpu', tone:'blue', rank:3, tags:['设备巡检','状态监测'], scene:'设备状态分类和巡检记录分析', records:[
      { title:'泵站P-001', content:'温度38℃，振动1.2mm/s，巡检状态正常。', equipment_id:'P-001', temperature:38, vibration:1.2, label:'正常' },
      { title:'电机M-002', content:'温度72℃，振动2.8mm/s，需复核温升。', equipment_id:'M-002', temperature:72, vibration:2.8, label:'待复核' },
      { title:'输送机C-003', content:'温度41℃，振动1.6mm/s，已完成例行维护。', equipment_id:'C-003', temperature:41, vibration:1.6, label:'已维护' },
    ] },
    { key:'traffic', name:'城市道路车辆图片分类数据集', industry:'交通运输', type:'图片', team:'交通视觉研究组', icon:'PictureFilled', tone:'cyan', rank:4, tags:['车辆分类','整图标注'], scene:'道路车辆整体类别识别', records:['小客车','公共汽车','货运车辆'].map((label,index)=>({title:label,image:industryImage('vehicle',['#6b96e8','#45a79a','#e7a35d'][index],label),label,content:`整图类别：${label}`})) },
    { key:'energy', name:'光伏电站发电时序数据集', industry:'能源电力', type:'时序数据', team:'新能源数据研究组', icon:'DataLine', tone:'amber', tags:['光伏发电','时间序列'], scene:'发电功率趋势与气象因素分析', records:[
      { title:'08:00发电记录', timestamp:'2026-10-20 08:00', power_kw:120, irradiance:320, content:'08:00，发电功率120kW，辐照度320W/㎡。' },
      { title:'12:00发电记录', timestamp:'2026-10-20 12:00', power_kw:460, irradiance:850, content:'12:00，发电功率460kW，辐照度850W/㎡。' },
      { title:'16:00发电记录', timestamp:'2026-10-20 16:00', power_kw:180, irradiance:400, content:'16:00，发电功率180kW，辐照度400W/㎡。' },
    ] },
    { key:'retail', name:'零售客服多轮对话数据集', industry:'零售电商', type:'多轮对话', team:'零售服务研究组', icon:'ChatDotRound', tone:'purple', tags:['客服对话','多轮交互'], scene:'订单查询、商品咨询与售后意图识别', records:[
      { title:'订单查询', content:'用户：如何查询订单？\n客服：请打开订单页面。\n用户：我已找到订单。\n客服：点击物流详情可查看运输状态。', messages:[{role:'user',content:'如何查询订单？'},{role:'assistant',content:'请打开订单页面。'},{role:'user',content:'我已找到订单。'},{role:'assistant',content:'点击物流详情可查看运输状态。'}] },
      { title:'规格咨询', content:'用户：这款商品有大号吗？\n客服：请查看规格选项。\n用户：选择后显示缺货。\n客服：您可以登记到货提醒。', messages:[{role:'user',content:'这款商品有大号吗？'},{role:'assistant',content:'请查看规格选项。'},{role:'user',content:'选择后显示缺货。'},{role:'assistant',content:'您可以登记到货提醒。'}] },
      { title:'售后咨询', content:'用户：收到的配件不齐。\n客服：请核对包装清单。\n用户：缺少一根连接线。\n客服：请提交订单编号与缺件照片，由售后核实。', messages:[{role:'user',content:'收到的配件不齐。'},{role:'assistant',content:'请核对包装清单。'},{role:'user',content:'缺少一根连接线。'},{role:'assistant',content:'请提交订单编号与缺件照片，由售后核实。'}] },
    ] },
    { key:'education', name:'科学课程知识问答数据集', industry:'教育培训', type:'问答对', team:'课程资源研究组', icon:'Reading', tone:'purple', rank:5, tags:['科学课程','教学问答'], scene:'基础科学概念讲解与教学问答', records:[
      { question:'实验中为什么要设置对照组？', answer:'对照组提供比较基准，有助于判断处理条件是否与观察到的变化有关。', reference:'课程材料：实验设计包含处理组与对照组，其他条件尽量一致。' },
      { question:'多次测量后为什么要计算平均值？', answer:'平均值用于汇总多次测量结果，并减小随机波动对单次结果的影响。', reference:'课程材料：每个样品测量三次并计算平均值。' },
      { question:'为什么记录数值时要写单位？', answer:'单位说明数值对应的量，便于理解、比较与换算。', reference:'课程材料：长度用厘米记录，质量用克记录。' },
    ] },
    { key:'agriculture', name:'作物叶片外观分类数据集', industry:'农业生产', type:'图片', team:'农业视觉研究组', icon:'Picture', tone:'teal', tags:['叶片图像','外观分类'], scene:'叶片外观的整图类别标注', records:['叶面完整','叶面有斑点','叶片枯黄'].map((label,index)=>({title:label,image:industryImage('leaf',['#63ae7d','#84b36c','#d4b458'][index],label),label,content:`外观类别：${label}`})) },
    { key:'environment', name:'流域水质监测数据集', industry:'生态环境', type:'结构化数据', team:'流域环境研究组', icon:'DataLine', tone:'teal', rank:6, tags:['水质监测','环境观测'], scene:'监测站点指标对比与变化分析', records:[
      { title:'上游站点W-001', station_id:'W-001', ph:7.2, dissolved_oxygen:8.1, content:'上游站点：pH 7.2，溶解氧8.1mg/L。' },
      { title:'中游站点W-002', station_id:'W-002', ph:7.4, dissolved_oxygen:7.6, content:'中游站点：pH 7.4，溶解氧7.6mg/L。' },
      { title:'下游站点W-003', station_id:'W-003', ph:7.1, dissolved_oxygen:7.9, content:'下游站点：pH 7.1，溶解氧7.9mg/L。' },
    ] },
    { key:'government', name:'政务服务事项分类数据集', industry:'政务服务', type:'文本分类', team:'公共服务研究组', icon:'Notebook', tone:'blue', tags:['事项分类','咨询文本'], scene:'服务事项分流与咨询意图识别', records:[
      { title:'材料清单查询', content:'申请人询问某事项需要准备哪些材料。', label:'材料咨询' },
      { title:'办理进度查询', content:'申请人提供受理编号并询问当前办理进度。', label:'进度查询' },
      { title:'服务时间查询', content:'来访者询问服务窗口的开放时段。', label:'服务咨询' },
    ] },
  ]
  data.projects ||= []
  for (const spec of specs) {
    const id = `industry-${spec.key}`
    if (data.datasets.some(d=>d.id===id)) continue
    const projectId = `industry-project-${spec.key}`
    const sourceId = `${id}-source`
    const versionId = `${id}-v1`
    data.projects.push({ id:projectId, name:spec.industry, owner:spec.team, scope:'shared', description:spec.scene, created })
    data.datasets.push({ id, projectId, project:spec.industry, name:spec.name, industry:spec.industry, owner:spec.team, type:spec.type, scene:spec.scene, demand:spec.scene, quality:'字段完整、类别一致、来源可查阅', format:spec.type==='多轮对话'?'ShareGPT / JSON':'JSON', scale:spec.records.length, source:'配套样例资料', status:'已发布', level:'公开', tags:spec.tags, coverIcon:spec.icon, coverTone:spec.tone, recommendationRank:spec.rank || 0, created })
    data.sources.push({ id:sourceId, datasetId:id, name:`${spec.name}.json`, type:'JSON', status:'已接入', content:JSON.stringify(spec.records,null,2), size:JSON.stringify(spec.records).length, created })
    data.versions.push({ id:versionId, datasetId:id, number:1, kind:'dataset', type:spec.type, status:'已发布', records:spec.records, sourceId, created, published:created, reviewNote:'已核对样例字段与类别', release:{ tag:'v1.0.0', title:`${spec.name}首个版本`, notes:`覆盖${spec.scene}。\n包含${spec.records.length}条样例，保留字段、类别与配套资料。`, publisher:spec.team, publishedAt:created, versionId } })
  }
  data.industrySeedsVersion = 1
  return seedDatasetDownloads(data)
}

const sampleDownloadCounts = {
  soil:1368, paper:0,
  'industry-health':8640, 'industry-finance':6230, 'industry-industry':5128,
  'industry-traffic':9842, 'industry-energy':3876, 'industry-retail':7235,
  'industry-education':4589, 'industry-agriculture':5692,
  'industry-environment':3320, 'industry-government':2864,
}
const sampleDatasetProfiles = {
  soil: { publisherId:'lin_chen_073', introduction:'这份数据集围绕土壤含水量试验整理，包含组间含水率比较、烘干法测量步骤和实验记录解读等问答。每条内容保留问题、答案与参考原文，方便逐条核对数值和结论。可用于科研问答、答案审核和数据增强流程体验。材料未记录作物产量，因此不能用来判断含水量变化是否带来增产。' },
  paper: { publisherId:'zhou_ming_126', introduction:'用于体验科研论文从原始文档到可读文本的整理过程，配套提供文献导入与解析资料。重点关注正文阅读顺序、标题层级、表格和图片等内容如何保留，方便比较解析前后的结构。适合测试文献预处理、内容分块和后续问答生成；当前数据集仍在建设，可在项目中接入资料并检查解析成果。' },
  'industry-health': { publisherId:'nina_wang_218', introduction:'整理医疗服务中的预约咨询、设备报修和个人信息修改等文本，按服务意图分配类别。每条记录包含事项标题、原始描述和分类标签，可用于体验文本分类标注、标签调整及模型分类结果检查。内容为合成的服务场景样例，不包含真实患者身份、病历或诊疗记录，分类对象是服务请求而非疾病。' },
  'industry-finance': { publisherId:'liang_zhou_052', introduction:'把基础财务指标计算写成可核对的问答，覆盖毛利、平均应收账款余额和收入增长率等问题。每条数据包含问题、计算过程、答案以及对应的报表数值，便于检查模型有没有算错或遗漏单位。适合演示数值问答生成、答案修订与格式导出；金额来自构造的简化报表，不对应真实企业经营情况。' },
  'industry-industry': { publisherId:'chen_yu_309', introduction:'以泵站、电机和输送机的例行巡检为场景，记录设备编号、温度、振动数值和巡检状态，并保留可直接阅读的检查描述。包含正常、待复核和已维护等状态，适合展示结构化字段检查、状态分类与巡检问答建设。样例便于快速预览字段和处理流程，不能据此设定真实设备的故障阈值。' },
  'industry-traffic': { publisherId:'alex_hu_184', introduction:'提供小客车、公共汽车和货运车辆三个类别的图片与整图标签，每条内容保留图片、类别名称和简短描述。适合演示机器学习图片分类、标签模板设置、整图人工标注与标注结果导出。图片为便于查看标注效果而绘制的示意图，不是道路监控实拍，也没有提供车辆位置框或轨迹标注。' },
  'industry-energy': { publisherId:'sun_wei_067', introduction:'围绕光伏电站一天内不同时段的发电情况，整理时间、发电功率和太阳辐照度，并附带文字记录。可用于查看时序字段、比较早中晚功率变化，以及演示时间格式标准化和指标问答生成。当前样例只展示几个时点，不包含连续历史观测，不能用于验证真实电站的发电预测精度。' },
  'industry-retail': { publisherId:'mia_liu_235', introduction:'收录订单物流查询、商品规格咨询和售后缺件反馈三类客服对话，每段包含用户与客服的连续交互，并以messages字段保存角色和消息内容。适合体验多轮对话数据预览、角色结构检查、客服意图标注及训练格式转换。对话均为构造案例，不包含真实订单编号、客户联系方式或商家内部信息。' },
  'industry-education': { publisherId:'xu_jia_091', introduction:'围绕基础科学实验中的常见疑问整理教学问答，包括对照组为什么必要、重复测量为什么取平均值，以及为什么要记录单位。每条问答配有参考课程材料，可用于讲解型问答生成、面向不同受众改写和答案完整性检查。内容侧重实验方法入门，适合体验课程知识数据的整理与审核。' },
  'industry-agriculture': { publisherId:'he_yiran_146', introduction:'围绕叶面完整、叶面有斑点和叶片枯黄三种外观提供图片与整图类别标签，同时保留标题和文字描述。适合演示叶片图片导入、分类标签配置、人工核对与结果导出，也可以用来区分整图分类和区域框选的交互。当前图片是外观示意图，标签描述可见现象，不代表具体病害诊断。' },
  'industry-environment': { publisherId:'tang_ke_280', introduction:'按流域上游、中游和下游三个监测站点整理水质观测样例，字段包括站点编号、pH、溶解氧及对应文字记录。适合比较不同站点的指标、核对数值单位、设置字段质量检查，并生成有原始数值依据的问答。内容是结构展示样例，没有连续采样日期，不能据此判断实际流域的长期水质趋势。' },
  'industry-government': { publisherId:'wu_qing_113', introduction:'以办事材料清单、办理进度和服务窗口开放时段等咨询为内容，保存事项标题、咨询文本与分类标签。可用于体验政务服务意图识别、事项分流标签设计、人工分类审核和文本数据导出。样例不绑定真实地区或具体办事政策，适合展示数据分类流程，不能作为实际办理事项的材料要求。' },
}
function seedDatasetDownloads(data) {
  const reverted = data.versions.findIndex(version => version.id === 'paper-v1' && version.release?.title === '科研文献结构化文本首版' && version.reviewNote === '已检查标题层级、正文顺序及表格内容。')
  if (reverted >= 0) {
    data.versions.splice(reverted, 1)
    const paper = data.datasets.find(dataset => dataset.id === 'paper')
    if (paper && !data.versions.some(version => version.datasetId === 'paper' && version.status === '已发布')) { paper.status = '草稿'; paper.introduction = sampleDatasetProfiles.paper.introduction }
  }
  for (const dataset of data.datasets) {
    const profile = sampleDatasetProfiles[dataset.id]
    if (profile && !dataset.sampleProfileVersion) {
      dataset.publisherId = profile.publisherId
      dataset.introduction ||= profile.introduction
      const release = data.versions?.find(version => version.id === `${dataset.id}-v1`)?.release
      if (release && (release.publisher === '管理员' || release.publisher?.endsWith('研究组'))) release.publisher = profile.publisherId
      dataset.sampleProfileVersion = 1
    }
    seedSampleVersions(data, dataset)
    seedSampleReleaseTimes(data, dataset)
    seedSampleRecordCounts(data, dataset)
    if (['industry-health', 'industry-environment'].includes(dataset.id) && !dataset.sampleApprovalSeeded) {
      const version = data.versions.filter(v => v.datasetId === dataset.id && v.status === '已发布').sort((a,b) => b.number - a.number)[0]
      if (version) {
        const user = data.role || '管理员'
        const request = data.requests.find(r => r.versionId === version.id && r.user === user)
        const approval = { status:'已通过', note:'同意用于科研分析与数据建设。', approvedBy:dataset.publisherId || dataset.owner, approved:'2026/10/22 10:20:00' }
        if (request) Object.assign(request, approval)
        else data.requests.push({ id:`sample-approved-${dataset.id}`, datasetId:dataset.id, versionId:version.id, user, applicant:user, department:'科研数据组', reason:dataset.id === 'industry-health' ? '用于医疗服务文本分类研究。' : '用于流域水质指标分析。', created:'2026/10/21 16:35:00', ...approval })
        dataset.sampleApprovalSeeded = true
      }
    }
    const hasRelease = data.versions.some(version => version.datasetId === dataset.id && version.status === '已发布')
    if (!hasRelease && Object.hasOwn(sampleDownloadCounts, dataset.id)) dataset.downloads = 0
    if (hasRelease && sampleDownloadCounts[dataset.id] && !dataset.downloadsSeeded) {
      dataset.downloads = (dataset.downloads || 0) + sampleDownloadCounts[dataset.id]
      dataset.downloadsSeeded = true
    }
  }
  return data
}

const sampleReleaseTags = {
  soil:['v1.1.0','v1.2.0','v1.2.1'],
  'industry-health':['v1.1.0','v1.2.0','v2.0.0','v2.1.0'],
  'industry-finance':['v1.0.1','v1.1.0','v1.2.0'],
  'industry-industry':['v1.0.2','v1.1.0'],
  'industry-traffic':['v1.1.0','v1.2.0','v2.0.0','v2.2.0','v2.3.1'],
  'industry-energy':['v1.0.1'],
  'industry-retail':['v1.1.0','v2.0.0','v2.0.2'],
  'industry-education':['v1.1.0','v1.3.0'],
  'industry-agriculture':['v1.0.1','v1.1.0','v1.2.0','v1.4.0'],
  'industry-environment':['v1.1.0','v1.2.0','v1.2.3'],
  'industry-government':['v1.0.3'],
}
function seedSampleVersions(data, dataset) {
  const tags = sampleReleaseTags[dataset.id]
  if (!tags || dataset.sampleVersionsSeeded) return
  const base = data.versions?.find(version => version.id === `${dataset.id}-v1` && version.status === '已发布' && Array.isArray(version.records))
  if (!base) return
  // Keep user-authored history as the latest history rather than append older sample releases.
  if (data.versions.some(version => version.datasetId === dataset.id && version.number && version.id !== base.id && version.id !== (dataset.id === 'soil' ? 'soil-v2' : '') && !version.id.startsWith('sample-'))) { dataset.sampleVersionsSeeded = true; return }
  let number = Math.max(...data.versions.filter(version => version.datasetId === dataset.id).map(version => version.number || 0))
  let previousId = base.id
  tags.forEach((tag, index) => {
    if (data.versions.some(version => version.datasetId === dataset.id && version.release?.tag === tag)) return
    const id = `sample-${dataset.id}-${tag}`
    const published = `2026/10/21 ${String(10 + index).padStart(2,'0')}:00:00`
    const records = JSON.parse(JSON.stringify(base.records.slice(0, Math.min(base.records.length, index + 2))))
    data.versions.push({ ...base, id, number:++number, parentVersionId:previousId, records, created:published, published,
      release:{ tag, title:`${dataset.name} ${tag}`, notes:`本次发布包含${records.length}条${dataset.type}内容。\n数据范围：${dataset.scene}。\n保留此版本的独立快照，可切换历史版本查看对应内容。`, publisher:dataset.publisherId, publishedAt:published, versionId:id } })
    previousId = id
  })
  dataset.sampleVersionsSeeded = true
}

const sampleLatestPublished = {
  soil:'2026/09/08 13:44:00',
  'industry-health':'2026/10/21 18:42:00',
  'industry-finance':'2026/08/27 10:17:00',
  'industry-industry':'2026/06/12 09:36:00',
  'industry-traffic':'2026/10/04 15:38:00',
  'industry-energy':'2026/04/19 16:08:00',
  'industry-retail':'2026/09/29 09:12:00',
  'industry-education':'2026/07/06 14:53:00',
  'industry-agriculture':'2026/08/09 20:06:00',
  'industry-environment':'2026/10/16 16:23:00',
  'industry-government':'2026/05/23 11:45:00',
}
function seedSampleReleaseTimes(data, dataset) {
  const latest = sampleLatestPublished[dataset.id]
  if (!latest || dataset.sampleReleaseTimesSeeded >= 2) return
  const versions = (data.versions || []).filter(version => version.datasetId === dataset.id && version.status === '已发布' && (version.id === `${dataset.id}-v1` || version.id.startsWith(`sample-${dataset.id}-`))).sort((a,b) => a.number - b.number)
  if (!versions.length) return
  const end = new Date(latest.replaceAll('/','-').replace(' ','T'))
  versions.forEach((version, index) => {
    const distance = versions.length - 1 - index
    const date = new Date(end)
    date.setDate(date.getDate() - distance * 9 - distance * (distance + 1))
    if (distance) date.setMinutes(date.getMinutes() - distance * 37)
    const pad = value => String(value).padStart(2,'0')
    const published = `${date.getFullYear()}/${pad(date.getMonth()+1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`
    version.created = published; version.published = published
    if (version.release) version.release.publishedAt = published
  })
  dataset.sampleReleaseTimesSeeded = 2
}

const sampleRecordCounts = {
  soil:3048, 'industry-health':18462, 'industry-finance':9250,
  'industry-industry':48320, 'industry-traffic':32684, 'industry-energy':105120,
  'industry-retail':12780, 'industry-education':6830, 'industry-agriculture':21436,
  'industry-environment':57600, 'industry-government':8420,
}
function seedSampleRecordCounts(data, dataset) {
  const total = sampleRecordCounts[dataset.id]
  if (!total) return
  const versions = (data.versions || []).filter(version => version.datasetId === dataset.id && version.status === '已发布' && (version.id === `${dataset.id}-v1` || version.id.startsWith(`sample-${dataset.id}-`))).sort((a,b) => a.number-b.number)
  versions.forEach((version, index) => {
    if (version.totalRecords !== undefined) return
    version.totalRecords = versions.length === 1 ? total : Math.round(total * (0.45 + 0.55 * index / (versions.length - 1)))
    if (version.release?.notes) version.release.notes = version.release.notes.replace(/包含\d+条(?:样例)?/, match => `包含${version.totalRecords}条${match.endsWith('样例') ? '数据' : ''}`)
  })
}


export function addGovernanceDemoDatasets(data) {
  for (const [id, obsolete, introduction] of [
    ['governance-demo-metadata','会提示等级不在允许值内','整理科研文献的摘要、主题与来源，可用于主题分类和检索。'],
    ['governance-demo-collection','会被“资料接入检查”阻止','包含上游和下游站点的水质观测记录，涵盖pH、溶解氧、采样日期和站点编号。'],
  ]) {
    const dataset=data.datasets.find(item=>item.id===id)
    if (dataset?.introduction?.includes(obsolete)) dataset.introduction=introduction
  }
  if (data.governanceDemoSeeded) return data
  const created = '2026/10/22 09:20:00'
  const samples = [
    { id:'governance-demo-metadata', name:'科研文献主题分类（元数据规范演示）', industry:'科研教育', level:'待定', source:'研究组文献整理清单',
      scene:'科研文献主题分类', demand:'整理文献摘要与主题，供科研检索使用。', tags:['科研文献','元数据规范'],
      introduction:'整理科研文献的摘要、主题与来源，可用于主题分类和检索。',
      records:[{title:'土壤含水量测定方法',content:'采用烘干法比较不同处理组土壤质量含水率。',reference:'研究组文献清单 · 001'},{title:'流域水质监测指标',content:'结合pH、溶解氧和氨氮指标描述监测站点的观测结果。',reference:'研究组文献清单 · 002'}] },
    { id:'governance-demo-collection', name:'流域水质观测资料（采集规范演示）', industry:'生态环境', level:'内部', source:'',
      scene:'流域监测资料接入', demand:'接入监测站观测记录，整理水质分析资料。', tags:['水质监测','采集规范'],
      introduction:'包含上游和下游站点的水质观测记录，涵盖pH、溶解氧、采样日期和站点编号。',
      records:[{title:'上游站观测记录',content:'站点UP-01：pH为7.2，溶解氧8.1毫克/升，采样日期2026年9月12日。',reference:'待补充来源'},{title:'下游站观测记录',content:'站点DOWN-02：pH为7.0，溶解氧7.4毫克/升，采样日期2026年9月12日。',reference:'待补充来源'}] },
  ]
  for (const sample of samples) {
    if (data.datasets.some(dataset=>dataset.id===sample.id)) continue
    const {records,...dataset} = sample
    const sourceId = `${sample.id}-source`
    data.datasets.push({...dataset,owner:data.role || '管理员',type:'文本',project:'规范约束演示',quality:'来源可追溯，内容准确完整',format:'JSON、Markdown',scale:100,status:'草稿',downloads:0,created})
    data.sources.push({id:sourceId,datasetId:sample.id,name:`${sample.scene}.json`,type:'JSON',content:JSON.stringify(records,null,2),status:'已接入',size:new TextEncoder().encode(JSON.stringify(records)).length,created})
    data.versions.push({id:`${sample.id}-v1`,datasetId:sample.id,kind:'dataset',number:1,type:'条目导入',status:'已通过',records,sourceId,created,reviewNote:'内容审核通过。'})
  }
  data.governanceDemoSeeded = true
  return data
}


export function addContentGovernance(data) {
  data.fieldTemplates ||= []
  data.qualityReports ||= []
  if (!data.contentGovernanceSeeded) {
    const definitions = [
      {id:'term1',name:'采样深度',field:'sampling_depth',type:'数值',unit:'厘米',required:true,checkRange:true,min:0,max:200,description:'本项目采样位置距地表深度，允许0—200厘米。'},
      {id:'term2',name:'土壤含水量',field:'soil_moisture',type:'数值',unit:'%',required:true,checkRange:true,min:0,max:60,description:'质量含水率；本项目检查范围0—60%，不作为所有土壤的通用物理限值。'},
      {id:'term3',name:'采样时间',field:'sampling_time',type:'日期',required:true,description:'样品实际采集日期。'},
      {id:'field-sample-id',name:'采样编号',field:'sample_id',type:'文本',required:true,unique:true,description:'同一数据集版本内唯一的采样记录编号。'},
      {id:'field-question',name:'问题',field:'question',type:'文本',required:true,unique:true,description:'需要回答的问题。'},
      {id:'field-answer',name:'回答',field:'answer',type:'文本',required:true,description:'基于来源材料给出的回答。'},
      {id:'field-reference',name:'参考来源',field:'reference',type:'文本',required:true,description:'支撑记录内容的参考材料或出处。'},
      {id:'field-title',name:'标题',field:'title',type:'文本',required:true,description:'文档或片段标题。'},
      {id:'field-content',name:'正文',field:'content',type:'文本',required:true,description:'整理后的正文内容。'},
      {id:'field-image',name:'图片',field:'image',type:'文本',required:true,description:'图片引用或图片内容。'},
    ]
    for (const definition of definitions) {
      const current=data.terms.find(term=>term.id===definition.id)
      if (current) { for (const [key,value] of Object.entries(definition)) if (current[key]===undefined) current[key]=value; current.severity ||= '阻断'; current.enabled ??= true }
      else data.terms.push({...definition,severity:'阻断',enabled:true})
    }
    const templates = [
      {id:'content-soil',name:'土壤观测记录标准',termIds:['field-sample-id','term3','term1','term2']},
      {id:'content-qa',name:'科研问答标准',termIds:['field-question','field-answer','field-reference']},
      {id:'content-document',name:'文档内容标准',termIds:['field-title','field-content','field-reference']},
      {id:'content-image',name:'图片内容标准',termIds:['field-image']},
    ]
    for (const template of templates) if (!data.fieldTemplates.some(item=>item.id===template.id)) data.fieldTemplates.push(template)
    const created='2026/10/22 10:40:00'
    for (const sample of [
      {id:'quality-demo-soil',name:'土壤观测记录（质量治理演示）',type:'结构化数据',industry:'农业科研',source:'土壤试验田采样记录',fieldTemplateId:'content-soil',records:JSON.parse(JSON.stringify(tableSamples))},
      {id:'quality-demo-qa',name:'科研问答（质量治理演示）',type:'问答对',industry:'科研教育',source:'土壤含水量试验报告',fieldTemplateId:'content-qa',manualReviewInstructions:'核对回答是否有来源依据；材料未提供的数据不能推断为事实。',records:[{...qaSamples[0]},{...qaSamples[1],answer:''},{...qaSamples[2],reference:''}]},
    ]) {
      if (data.datasets.some(dataset=>dataset.id===sample.id)) continue
      const {records,...dataset}=sample
      data.datasets.push({...dataset,owner:data.role || '管理员',steward:data.role || '管理员',project:'数据质量治理演示',scene:sample.type==='问答对'?'科研问答检查':'采样记录检查',demand:'按字段标准定位问题，修正后复检并发布。',quality:'字段完整、类型正确、编号不重复、内容有依据',format:'JSON、CSV',scale:records.length,level:'内部',status:'建设中',downloads:0,tags:['数据质量'],introduction:sample.type==='问答对'?'包含缺失回答和缺失引用的问答记录，可检查、指派问题、回项目修正并复检；回答与来源是否一致需要人工核对。':'包含重复采样编号、负采样深度和缺失含水量的观测记录，用于演示字段字典约束、问题定位、修正和复检。',created})
      const sourceId=`${sample.id}-source`
      data.sources.push({id:sourceId,datasetId:sample.id,name:`${sample.name}.json`,type:'JSON',content:JSON.stringify(records,null,2),size:new TextEncoder().encode(JSON.stringify(records)).length,status:'已接入',created})
      data.versions.push({id:`${sample.id}-v1`,datasetId:sample.id,kind:'dataset',number:1,type:'条目导入',records,sourceId,created,status:'待审核',reviewNote:''})
    }
    for (const dataset of data.datasets) {
      if (dataset.id==='soil' && dataset.fieldTemplateId===undefined) dataset.fieldTemplateId='content-qa'
      if (dataset.id==='paper' && dataset.fieldTemplateId===undefined) dataset.fieldTemplateId='content-document'
    }
    data.contentGovernanceSeeded=true
  }
  for (const dataset of data.datasets) { if (dataset.id==='quality-demo-qa' && dataset.manualReviewInstructions===undefined) dataset.manualReviewInstructions='核对回答是否有来源依据；材料未提供的数据不能推断为事实。'; dataset.steward ||= dataset.owner || '管理员'; dataset.fieldMappings ||= {}; dataset.requiresQuality ||= Boolean(dataset.fieldTemplateId) }
  return data
}


const sharedContentFields={question:'field-question',answer:'field-answer',reference:'field-reference',title:'field-title',content:'field-content',image:'field-image'}
function sameFieldConstraints(a,b) {
  return a.field===b.field && a.type===b.type && (a.unit || '')===(b.unit || '') && ['required','unique','checkRange'].every(key=>Boolean(a[key])===Boolean(b[key])) && (a.enabled!==false)===(b.enabled!==false) && (a.severity || '阻断')===(b.severity || '阻断') && (!a.checkRange || a.min===b.min && a.max===b.max) && (a.allowedValues || '')===(b.allowedValues || '')
}
function mergeSampleDictionary(data) {
  const affected=new Set()
  const currentReports=new Map(data.versions.map(version=>[version.id,data.qualityReports.find(report=>report.versionId===version.id)?.fingerprint===qualityFingerprint(data,version)]))
  for (const term of [...data.terms]) {
    const dataset=data.datasets.find(item=>term.id===`${item.id}-field-${term.field}` && item.id.startsWith('industry-'))
    if (!dataset || (term.revision || 1)!==1 || term.description!==`${dataset.name}中的${term.name}。`) continue
    const canonical=data.terms.find(item=>item.id===sharedContentFields[term.field])
    if (canonical && sameFieldConstraints(term,canonical)) {
      for (const template of data.fieldTemplates.filter(item=>item.termIds.includes(term.id))) {
        reviseStandard(data,'fieldTemplates',template.id,{...template,termIds:[...new Set(template.termIds.map(id=>id===term.id?canonical.id:id))]},'内置字典合并')
        data.datasets.filter(item=>item.fieldTemplateId===template.id).forEach(item=>affected.add(item.id))
      }
      data.terms.splice(data.terms.indexOf(term),1)
    } else if (term.field==='label' && term.name==='分类标签') {
      reviseStandard(data,'terms',term.id,{...term,name:`${dataset.industry}分类标签`,description:`${dataset.scene}使用的分类标签。`},'内置字典合并')
      data.datasets.filter(item=>data.fieldTemplates.find(template=>template.id===item.fieldTemplateId)?.termIds.includes(term.id)).forEach(item=>affected.add(item.id))
    }
  }
  // Preserve old report and publication snapshots; only recheck unchanged sample content.
  for (const version of data.versions.filter(item=>affected.has(item.datasetId) && currentReports.get(item.id))) {
    const report=runQualityReport(data,version)
    report.operator='内置字典合并复检';report.sampleRecord=true
  }
}

export function seedGovernanceExamples(data) {
  const labels={title:['事项标题','文本',''],content:['原始文本','文本',''],label:['分类标签','文本',''],question:['问题','文本',''],answer:['回答','文本',''],reference:['参考来源','文本',''],image:['图片引用','文本',''],equipment_id:['设备编号','文本',''],temperature:['设备温度','数值','℃'],vibration:['振动速度','数值','mm/s'],timestamp:['观测时间','日期',''],power_kw:['发电功率','数值','kW'],irradiance:['太阳辐照度','数值','W/㎡'],station_id:['监测站编号','文本',''],ph:['酸碱度','数值',''],dissolved_oxygen:['溶解氧','数值','mg/L']}
  const users=['lin_xiao_047','zhou_yan_126','chen_mo_083']
  for (const [index,dataset] of data.datasets.filter(item=>/^industry-(health|finance|industry|traffic|energy|retail|education|agriculture|environment|government)$/.test(item.id)).entries()) {
    if (dataset.governanceExamplesSeeded) continue
    const versions=data.versions.filter(item=>item.datasetId===dataset.id && item.status==='已发布' && (item.id===`${dataset.id}-v1` || item.id.startsWith(`sample-${dataset.id}-`)))
    if (!versions.length) continue
    const actor=dataset.publisherId || dataset.owner
    const first=versions[0]
    if (!dataset.fieldTemplateId) {
      const termIds=[]
      for (const field of Object.keys(first.records[0] || {}).filter(key=>labels[key])) {
        const [name,type,unit]=labels[field],id=`${dataset.id}-field-${field}`
        const values=[...new Set(versions.flatMap(version=>version.records.map(record=>record[field])).filter(value=>value!==undefined))]
        const definition={id,field,name,type,unit,required:true,enabled:true,severity:'阻断',revision:1,unique:['question','station_id','equipment_id'].includes(field),description:`${dataset.name}中的${name}。`}
        if (field==='label') {definition.allowedValues=values.join('，');definition.name=`${dataset.industry}分类标签`;definition.description=`${dataset.scene}使用的分类标签。`}
        if (field==='ph') Object.assign(definition,{checkRange:true,min:0,max:14})
        if (['dissolved_oxygen','power_kw','irradiance','vibration'].includes(field)) Object.assign(definition,{checkRange:true,min:0,max:field==='dissolved_oxygen'?30:100000})
        const canonical=data.terms.find(item=>item.id===sharedContentFields[field])
        if (canonical && sameFieldConstraints(definition,canonical)) termIds.push(canonical.id)
        else {if (!data.terms.some(item=>item.id===id)) data.terms.push(definition);termIds.push(id)}
      }
      const id=`${dataset.id}-content-standard`
      if (!data.fieldTemplates.some(item=>item.id===id)) data.fieldTemplates.push({id,name:`${dataset.industry}${dataset.type}字段标准`,termIds,revision:1})
      dataset.fieldTemplateId=id
      dataset.requiresQuality=true
    }
    ensureLifecycleGovernance({...data,datasets:[dataset]})
    for (const version of versions) {
      const published=version.release.publishedAt
      const base=Date.parse(published.replaceAll('/','-').replace(' ','T'))
      const at=minutes=>{const date=new Date(base+minutes*60000);return `${date.getFullYear()}/${String(date.getMonth()+1).padStart(2,'0')}/${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}:00`}
      const sourceId=`sample-governance-source-${version.id}`
      if (version.sourceId===`${dataset.id}-source`) {
        if (!data.sources.some(item=>item.id===sourceId)) data.sources.push({id:sourceId,datasetId:dataset.id,name:`${dataset.name}-${version.release.tag}-原始资料.json`,type:'JSON',status:'已接入',content:JSON.stringify(version.records,null,2),size:new TextEncoder().encode(JSON.stringify(version.records)).length,created:at(-180),createdBy:actor})
        version.sourceId=sourceId
      }
      const taskId=`sample-governance-task-${version.id}`
      if (!data.tasks.some(item=>item.id===taskId)) data.tasks.push({id:taskId,datasetId:dataset.id,sourceId:version.sourceId,versionId:version.id,name:`${dataset.industry} · ${version.release.tag} · 字段整理与校验`,type:dataset.type==='图片'?'图片分类标注':dataset.type==='问答对'?'问答整理':'字段标准化',status:'已完成',progress:100,created:at(-120),operator:actor,logs:['读取该版本来源资料','按绑定字段标准整理记录','输出独立数据集版本']})
      if (!data.qualityReports.some(item=>item.versionId===version.id) && contentFieldsFor(data,dataset).length) {
        const report=runQualityReport(data,version)
        report.created=at(-60);report.operator=actor;report.sampleRecord=true
      }
      version.reviewed ||= at(-30)
      version.reviewedBy ||= actor
      for (const [operation,stage,offset] of [['import','采集',-170],['save','存储',-90],['publish','发布',-15]]) {
        const id=`sample-governance-${operation}-${version.id}`
        if (data.governanceChecks.some(item=>item.versionId===version.id && item.operation===operation)) continue
        const issues=validateGovernance(data,operation,{dataset,versionId:version.id,file:{name:'资料.json',size:512,type:'application/json'}})
        const standards=executionStandards(data,dataset,operation).map(standard=>({...standard,result:standard.executionMode==='后端保障'?'待后端落实':issues.some(issue=>issue.ruleId===standard.id || standard.field && issue.field===standard.field)?'未通过':standard.executionMode==='人工确认'?'待确认':'通过'}))
        data.governanceChecks.push({id,datasetId:dataset.id,code:dataset.code,name:dataset.name,versionId:version.id,sourceId:version.sourceId,operation,stage,operator:actor,created:at(offset),status:issues.some(issue=>issue.action==='阻止操作')?'未通过':standards.some(item=>item.executionMode==='后端保障')?'待后端保障':'通过',issues,standards,sampleRecord:true})
      }
      if (!version.release.evidence) version.release.evidence={...publicationEvidence(data,version,actor),created:at(-15),basis:'内置样例发布记录'}
      if (!data.requests.some(item=>item.versionId===version.id && item.applicant===users[index%users.length])) data.requests.push({id:`sample-governance-request-${version.id}`,datasetId:dataset.id,versionId:version.id,user:users[index%users.length],applicant:users[index%users.length],department:`${dataset.industry}应用研究组`,reason:`用于${dataset.scene}，仅在课题组内分析，不转发原始记录。`,status:'已通过',created:at(90),approved:at(180),approvedBy:actor,note:`同意用于${dataset.scene}；授权限定${version.release.tag}。`,sampleRecord:true})
      if (!data.usageEvents.some(item=>item.id===`sample-governance-use-${version.id}`)) data.usageEvents.push({id:`sample-governance-use-${version.id}`,datasetId:dataset.id,versionId:version.id,user:users[index%users.length],action:'下载',status:'已发起',detail:`下载${version.release.tag} JSON文件，用于${dataset.scene}`,created:at(240),sampleRecord:true})
    }
    if (!data.storageEvents.some(item=>item.datasetId===dataset.id)) data.storageEvents.push({id:`sample-governance-storage-${dataset.id}`,datasetId:dataset.id,action:'存储登记',operator:actor,note:`按${data.storagePolicies.find(item=>item.id===dataset.storagePolicyId)?.name}保留JSON版本与来源资料，全部历史版本可追溯。`,created:versions[0].created,sampleRecord:true})
    dataset.governanceExamplesSeeded=true
  }
  for (const version of data.versions.filter(item=>item.status==='已发布' && /^industry-/.test(item.datasetId) && (item.id===`${item.datasetId}-v1` || item.id.startsWith(`sample-${item.datasetId}-`)))) {
    const id=`sample-manual-review-${version.id}`
    if (data.manualConfirmations.some(item=>item.id===id)) continue
    const dataset=data.datasets.find(item=>item.id===version.datasetId)
    const definition={id:'sample-publication-review',name:'发布内容人工核对',revision:1,category:'全流程标准',executionMode:'人工确认',stages:['共享']}
    data.manualConfirmations.push({id,standardId:definition.id,revision:1,datasetId:dataset.id,versionId:version.id,operator:version.reviewedBy || version.release.publisher,created:version.reviewed || version.release.publishedAt,note:`已核对${version.release.tag}的${dataset.type}内容、来源及字段，${version.reviewNote || '内容审核通过'}。`,definition,sampleRecord:true})
  }
  mergeSampleDictionary(data)
  return data
}
