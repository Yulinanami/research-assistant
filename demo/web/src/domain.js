export const uid = (prefix = 'id') => `${prefix}-${crypto.randomUUID()}`
export const now = () => new Date().toLocaleString('zh-CN', { hour12: false })

export function canDownload(version, requests, user) {
  return version?.status === '已发布' && isDatasetVersion(version) && requests.some(r => r.versionId === version.id && r.user === user && r.status === '已通过')
}

export function isDatasetVersion(result) {
  return result?.kind ? result.kind === 'dataset' : !['PDF解析', 'Word解析', 'Excel解析', '文本清洗', '图片清洗', '知识片段', '图片描述', '图像标注', '自动标注'].includes(result?.type)
}

export function createVersion(versions, datasetId, records, type, sourceId = '', kind = isDatasetVersion({ type }) ? 'dataset' : 'processing') {
  const previous = versions.filter(v => v.datasetId === datasetId && isDatasetVersion(v)).sort((a, b) => b.number - a.number)
  const parent = previous.find(v => v.id === sourceId) || previous[0]
  return { id: uid('version'), datasetId, kind,
    number: kind === 'dataset' ? (previous[0]?.number || 0) + 1 : null,
    parentVersionId: kind === 'dataset' ? parent?.id || '' : '',
    status: '草稿', type, sourceId, records: JSON.parse(JSON.stringify(records)), created: now(), reviewNote: '' }
}

export function augmentRecords(records, audience) {
  const originals = JSON.parse(JSON.stringify(records))
  const enhanced = originals.filter(r => r.question).map(r => {
    const { correctedAnswer, suggestion, ...record } = r
    return { ...record, question: `请向${audience || '科研人员'}说明：${r.question}`, answer: correctedAnswer?.trim() || r.answer, label: '', rating: 0 }
  })
  return [...originals, ...enhanced]
}

export function reviewVersion(version, approved, note) {
  if (version.status !== '待审核') throw new Error('请先提交审核')
  version.status = approved ? '已通过' : '已退回'
  version.reviewNote = note
  version.reviewed = now()
}

export function publishVersion(version, details = {}, versions = [], publisher = '') {
  if (!isDatasetVersion(version)) throw new Error('仅数据集版本可以发布')
  if (version.status === '已发布' && version.release) throw new Error('此版本已发布，请创建新版本后发布')
  if (version.status !== '已通过' && version.status !== '已发布') throw new Error('请先通过审核再发布')
  const tag = details.tag?.trim() || ''
  const title = details.title?.trim() || ''
  const notes = details.notes?.trim() || ''
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(tag)) throw new Error('请填写有效版本Tag，仅支持英文、数字、点、下划线和短横线')
  if (!title) throw new Error('请填写发布标题')
  if (!notes) throw new Error('请填写发布说明')
  if (versions.some(v => v.id !== version.id && v.datasetId === version.datasetId && v.release?.tag === tag)) throw new Error('当前数据集的版本Tag已存在，请使用其他Tag')
  const publishedAt = version.published || now()
  version.release = { tag, title, notes, publisher, publishedAt, versionId: version.id }
  version.status = '已发布'
  version.published = publishedAt
}

export function splitText(text, config) {
  const size = Math.max(1, Number(config.size) || 180)
  const separator = (config.separator || '\\n\\n').replace(/\\n/g, '\n').replace(/\\t/g, '\t')
  const parts = config.chunkType === '分隔符' && separator ? text.split(separator) : [text]
  return parts.flatMap(part => Array.from({ length: Math.ceil(part.length / size) }, (_, i) => part.slice(i * size, (i + 1) * size))).filter(s => s.trim())
}

export function cleanText(text, rules) {
  if (rules.includes('文档去重')) {
    try { const parsed = JSON.parse(text); if (Array.isArray(parsed)) text = JSON.stringify([...new Map(parsed.map(r => [JSON.stringify(r), r])).values()], null, 2) }
    catch { text = [...new Set(text.split('\n'))].join('\n') }
  }
  if (rules.includes('隐私脱敏')) text = text.replace(/1[3-9]\d{9}/g, '***********').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]+/g, '[邮箱已脱敏]')
  if (rules.includes('格式标准化')) text = text.replace(/[ \t]+/g, ' ').trim()
  if (rules.includes('移除think标签')) text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  return text
}

export function exportRecords(records) {
  return JSON.parse(JSON.stringify(records)).map(r => r.correctedAnswer?.trim() ? { ...r, originalAnswer: r.answer, answer: r.correctedAnswer } : r)
}


export function cleanImages(images, config) {
  const rules = config.rules || []
  const seen = new Set()
  return images.map(image => {
    let reason = ''
    if (rules.includes('重复图片去重') && seen.has(image.content)) reason = '重复图片'
    else if (rules.includes('质量筛选')) {
      if (image.width < config.minWidth || image.height < config.minHeight) reason = '分辨率低于阈值'
      else if (image.clarity < config.minClarity) reason = '清晰度低于阈值'
    }
    if (!reason) seen.add(image.content)
    const standardize = rules.includes('格式标准化')
    const scale = standardize ? Math.min(1, (config.maxWidth || 1024) / image.width, (config.maxHeight || 1024) / image.height) : 1
    return { title: image.name, image: image.content, source: image.name, sourceId: image.id || '', status: reason ? '过滤' : '保留', reason: reason || '符合所选规则', clarity: image.clarity,
      before: { width: image.width, height: image.height, format: image.format },
      after: reason ? null : { width: Math.max(1, Math.round(image.width * scale)), height: Math.max(1, Math.round(image.height * scale)), format: standardize ? config.imageFormat || 'PNG' : image.format },
      simulated: true }
  })
}


// 将旧数据中的项目名称关联到项目实体，保留所有原始ID和版本关联。
export function ensureProjects(data) {
  data.projects ||= []
  for (const dataset of data.datasets) {
    let project = data.projects.find(p => p.id === dataset.projectId)
    if (!project) project = data.projects.find(p => p.name === (dataset.project || '默认项目'))
    if (!project) { project = { id: uid('project'), name: dataset.project || '默认项目', description: '科研资料与数据集建设', created: now() }; data.projects.push(project) }
    dataset.projectId = project.id
    dataset.project = project.name
  }
  if (!data.projects.some(p => p.id === data.activeProject)) data.activeProject = data.datasets.find(d => d.id === data.activeDataset)?.projectId || data.projects[0]?.id || ''
  return data
}
