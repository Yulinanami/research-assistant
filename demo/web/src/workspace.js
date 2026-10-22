import { isDatasetVersion } from './domain.js'
import { preparationInputs } from './workflow.js'
import { validateConversations } from './imports.js'

export function defaultSettings() {
  return {
    parsing: { format: 'Markdown', pdfType: '自动识别', options: ['表格', '图片'], sheets: '全部工作表' },
    generation: { size: 180, chunkType: '固定大小', separator: '\\n\\n', style: '简明说明' },
    audiences: [
      { id: 'researcher', name: '科研人员', prompt: '面向农业科研人员，依据参考资料准确回答，保留专业术语、实验条件与来源，不编造结论。' },
      { id: 'technician', name: '基层农技人员', prompt: '面向基层农技人员，用简明、可操作的语言解释参考资料，说明适用条件，不添加资料没有的结论。' },
      { id: 'student', name: '学生与初学者', prompt: '面向初学者，解释必要术语，分步骤说明参考资料，保留数值与来源，不编造事实。' },
    ],
    labelTemplates: [
      { id: 'image-class', name: '科研图片类型', kind: 'image', labels: ['科研图表', '田间照片', '样本照片', '其它'], multiple: false, description: '对整张图片选择类别，不需要框选区域。' },
      { id: 'plant-class', name: '农业图片健康状态', kind: 'image', labels: ['健康', '病害', '无法判断'], multiple: false, description: '用于作物照片，判断整张图片的健康状态。' },
      { id: 'text-class', name: '科研文本分类', kind: 'text', labels: ['研究背景', '试验方法', '研究结果', '无效内容'], multiple: false, description: '按主要内容为文本选择类别。' },
    ],
    cleaningPresets: [
      { id: 'general', name: '通用文本规范化', rules: ['格式标准化', '文档去重'], minChars: 10 },
      { id: 'privacy', name: '脱敏与质量筛选', rules: ['格式标准化', '隐私脱敏', '质量过滤'], minChars: 20 },
      { id: 'research', name: '科研正文去重', rules: ['移除think标签', '格式标准化', '文档去重'], minChars: 10 },
    ],
    export: { format: 'json', schema: '原始结构' },
  }
}

// Extend existing local records in place; keep their IDs, versions and attachments.
export function migrateWorkspace(data) {
  data.projects ||= []
  const defaults = defaultSettings()
  data.settings = { ...defaults, ...data.settings,
    parsing: { ...defaults.parsing, ...data.settings?.parsing },
    generation: { ...defaults.generation, ...data.settings?.generation },
    export: { ...defaults.export, ...data.settings?.export } }
  data.flows ||= []
  for (const project of data.projects) project.flowSteps ||= ['文本清洗','知识片段','问答生成']
  for (const [i, dataset] of data.datasets.entries()) {
    let project = data.projects.find(p => p.id === dataset.projectId) || data.projects.find(p => p.name === (dataset.project || '未分组项目'))
    if (!project) {
      project = { id: `project-${dataset.id}`, name: dataset.project || '未分组项目', description: dataset.scene || '', ownerId: dataset.ownerId || '管理员', created: dataset.created, flowSteps: ['文本清洗', '知识片段', '问答生成'] }
      data.projects.push(project)
    }
    dataset.projectId = project.id
    dataset.project = project.name
    dataset.ownerId ||= '管理员'
    dataset.code ||= `DS-${String(i + 1).padStart(4, '0')}`
    dataset.metadata ||= {}
  }
  for (const collection of ['sources', 'versions', 'tasks', 'requests', 'services']) {
    for (const record of data[collection] || []) record.projectId ||= data.datasets.find(d => d.id === record.datasetId)?.projectId || ''
  }
  data.activeProjectId ||= data.datasets.find(d => d.id === data.activeDataset)?.projectId || ''
  for (const term of data.terms) term.scope ||= 'sample'
  if (!data.terms.some(term => term.field === 'crop_type')) data.terms.push({ id: 'field-crop', field: 'crop_type', name: '作物类型', type: '文本', scope: 'dataset', description: '该数据集研究的主要作物，用于填写与检索。', required: false, unit: '' })
  return data
}

export function generationInputs(type, sources, versions, datasetId) {
  const local = versions.filter(v => v.datasetId === datasetId)
  if (type === '问答增强') return local.filter(v => isDatasetVersion(v) && v.records.some(r => r.question))
  const image = ['图片描述', '图片问答'].includes(type)
  const raw = preparationInputs(sources, local, datasetId).filter(input => input.ready && input.kind === (image ? 'image' : 'text'))
  const outputs = local.filter(v => v.records.some(r => r.status !== '过滤' && (image ? r.image?.startsWith('data:image/') : r.content)))
  return [...new Map([...raw, ...outputs].map(input => [input.id, input])).values()]
}

export function classificationInputs(kind, sources, versions, datasetId, context) {
  const local = versions.filter(version => version.datasetId === datasetId)
  const matches = record => kind === 'image' ? record.image?.startsWith('data:image/') : typeof record.content === 'string' && record.content.trim()
  const compatible = output => output.type === (kind === 'image' ? '图片清洗' : '文本清洗') || output.records.some(matches)
  const explicit = context?.datasetId === datasetId
    ? local.filter(version => context.inputIds?.includes(version.id) && compatible(version)) : []
  const outputs = explicit.length ? explicit : local.filter(version => version.type === '条目导入' && compatible(version))
  const records = outputs.flatMap(output => output.records.flatMap((record, index) => {
    if (record.status === '过滤' || !matches(record)) return []
    return [{ ...JSON.parse(JSON.stringify(record)), id: `${output.id}-${index}`, inputVersionId: output.id,
      sourceRecordId: record.id || '', sourceRecordIndex: index,
      sourceId: record.sourceId || output.sourceId || output.id,
      title: record.title || output.type, content: record.content || '', image: record.image || '', labels: [...(record.labels || [])] }]
  }))
  if (explicit.length) return records
  const raw = preparationInputs(sources,versions,datasetId).filter(input => input.ready && input.kind === kind
    && (context?.datasetId !== datasetId || !context.inputIds?.length || context.inputIds.includes(input.id) || context.inputIds.includes(input.originId)))
    .map(input => ({id:input.id,sourceId:input.id,title:input.name,content:kind === 'text' ? input.content : '',image:kind === 'image' ? input.content : '',labels:[]}))
  // An incompatible handoff may still be used to start another kind of task.
  if (!records.length && !raw.length && context?.datasetId === datasetId && !explicit.length) {
    return classificationInputs(kind, sources, versions, datasetId)
  }
  return [...records, ...raw]
}

export function libraryDatasets(data, mode, user, canView) {
  return data.datasets.filter(dataset => canView(dataset.id)).map(dataset => {
    const versions = data.versions.filter(v => v.datasetId === dataset.id && isDatasetVersion(v))
    const owned = dataset.ownerId === user
    const published = versions.filter(v => v.status === '已发布').sort((a, b) => b.number - a.number)
    const accessible = versions.filter(v => owned || data.requests.some(r => r.user === user && r.versionId === v.id && r.status === '已通过' && v.status === '已发布'))
    const visible = mode === 'square' ? published : accessible.sort((a, b) => b.number - a.number)
    return { dataset, owned, versions: visible, latest: visible[0], pending: versions.filter(v => v.status === '待审核') }
  }).filter(item => mode === 'square' ? item.versions.length : mode === 'mydatasets' ? item.owned : mode === 'audit' ? item.pending.length : item.owned || item.versions.length)
}

export function governanceVersions(versions, mode, canView) {
  const statuses = mode === 'release' ? ['已通过', '已发布'] : ['待审核', '已通过', '已退回', '已发布']
  return versions.filter(version => isDatasetVersion(version) && statuses.includes(version.status) && canView(version.datasetId))
}

export function exportDatasetRecords(records, schema) {
  if (!['原始结构', 'Alpaca', 'ShareGPT'].includes(schema)) throw new Error('不支持的导出记录结构')
  const ready = records.filter(r => r.status !== '过滤').map(r => ({ ...r, answer: r.correctedAnswer?.trim() || r.answer }))
  if (schema === 'Alpaca') {
    if (ready.some(r => r.conversations)) throw new Error('多轮对话请导出 ShareGPT，转换为单轮 Alpaca 需要明确映射')
    if (ready.some(r => typeof r.question !== 'string' || !r.question.trim() || typeof r.answer !== 'string' || !r.answer.trim())) throw new Error('Alpaca 导出需要每条记录都有问题和答案')
    return ready.map(r => ({ instruction: r.question, input: r.reference || '', output: r.answer }))
  }
  if (schema === 'ShareGPT') {
    return ready.map(r => {
      if (r.conversations) { validateConversations(r.conversations); return { conversations: JSON.parse(JSON.stringify(r.conversations)) } }
      if (typeof r.question !== 'string' || !r.question.trim() || typeof r.answer !== 'string' || !r.answer.trim()) throw new Error('ShareGPT 导出需要每条记录都有问题和答案')
      return { conversations: [{ from: 'human', value: r.question }, { from: 'gpt', value: r.answer }] }
    })
  }
  return ready
}
