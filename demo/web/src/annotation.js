import { isDatasetVersion, now, uid } from './domain.js'

export const effectiveAnswer = record => record.correctedAnswer?.trim() || record.answer || ''
export const qualityLabels = ['可用', '需修改', '不可用', '无法判断']

export function validateClassification(records, template, complete = false) {
  if (!template || !Array.isArray(template.labels) || !template.labels.length) throw new Error('请选择有效的标签模板')
  for (const [index, record] of records.entries()) {
    if (record.status === '过滤') continue
    if (!Array.isArray(record.labels) || record.labels.some(label => !template.labels.includes(label))) throw new Error(`第 ${index + 1} 条含模板外标签，请重新选择类别`)
    if (new Set(record.labels).size !== record.labels.length || (!template.multiple && record.labels.length > 1)) throw new Error(`第 ${index + 1} 条不符合模板的单选或多选规则`)
    if (complete && !record.labels.length) throw new Error(`请完成第 ${index + 1} 条资料的分类后提交审核`)
  }
}

export function questionEntries(version) {
  const indices = []
  const records = (version?.records || []).flatMap((record, index) => {
    if (record.status === '过滤' || typeof record.question !== 'string' || !record.question.trim()) return []
    indices.push(index)
    return [JSON.parse(JSON.stringify(record))]
  })
  return { records, indices }
}

export function isQuestionReviewInput(version) {
  return Boolean(version && (isDatasetVersion(version) || ['自动标注', '问答生成', '问答增强'].includes(version.type))
    && questionEntries(version).records.length)
}

export function questionReviewOrigin(version, versions) {
  const seen = new Set()
  let current = version
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    if (!isDatasetVersion(current) && ['问答生成', '问答增强'].includes(current.type)) return current
    current = versions.find(item => item.datasetId === version.datasetId
      && item.id === (current.reviewSourceId || current.sourceId || current.parentVersionId))
  }
}

export function mergeQuestionEntries(version, records, indices) {
  const output = JSON.parse(JSON.stringify(version.records))
  if (records.length !== indices.length || indices.some(index => !output[index]?.question)) throw new Error('复核输入已变化，请重新打开成果')
  records.forEach((record, index) => { output[indices[index]] = JSON.parse(JSON.stringify(record)) })
  return output
}

export function validateQuestions(records, labels = qualityLabels, complete = false) {
  for (const [index, record] of records.entries()) {
    if (record.label && !labels.includes(record.label)) throw new Error(`第 ${index + 1} 条含未定义的质量标签`)
    if (record.rating != null && (!Number.isFinite(record.rating) || record.rating < 0 || record.rating > 5)) throw new Error(`第 ${index + 1} 条评分必须在 0—5 之间`)
    if (complete && !record.label) throw new Error(`请完成第 ${index + 1} 条数据的可用性标注`)
    if (complete && !effectiveAnswer(record).trim()) throw new Error(`第 ${index + 1} 条回答为空，请补齐后提交`)
  }
}

export function validateBoxes(boxes, labels) {
  for (const [index, box] of boxes.entries()) {
    const values = [box.x, box.y, box.width, box.height]
    if (values.some(value => !Number.isFinite(value)) || box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0
      || box.x + box.width > 100.000001 || box.y + box.height > 100.000001) throw new Error(`第 ${index + 1} 个区域的百分比坐标无效`)
    if (!labels.includes(box.label)) throw new Error(`第 ${index + 1} 个区域含未定义类别`)
  }
}

export function editAnswerRecord(record, changes) {
  const next = { ...record, ...changes }
  if (record.question && record.correctedAnswer?.trim() && Object.hasOwn(changes, 'answer')) {
    next.answer = record.answer
    next.correctedAnswer = changes.answer
  }
  return next
}

export function reviewInput(versions, datasetId, preferredId, inputIds = []) {
  const candidates = versions.filter(version => version.datasetId === datasetId && isQuestionReviewInput(version))
  return candidates.find(version => version.id === preferredId)
    || inputIds.map(id => candidates.find(version => version.id === id)).find(Boolean)
    || candidates[0]
}

export function classificationKind(version) {
  const kind = version.labelTemplate?.kind || ({ 图片整体分类: 'image', 文本分类: 'text' })[version.type]
  if (kind) return kind
  const records = version.records?.filter(record => record.status !== '过滤') || []
  if (version.type === '条目导入' && records.length && records.every(record => !record.question && !record.boxes && Array.isArray(record.labels))) {
    if (records.every(record => record.image?.startsWith('data:image/'))) return 'image'
    if (records.every(record => record.content?.trim())) return 'text'
  }
}

export function classificationDraft(versions, datasetId, kind, recordIds) {
  return versions.find(version => version.datasetId === datasetId && version.status === '草稿'
    && version.type !== '条目导入'
    && classificationKind(version) === kind
    && (!recordIds || (version.records.length === recordIds.length
      && version.records.every(record => recordIds.includes(record.id)))))
}

export function recordAnnotationTask(tasks, version, type, progress, name) {
  let task = tasks.find(item => item.datasetId === version.datasetId && item.versionId === version.id
    && item.type === type && item.status === '标注中')
  if (!task) {
    tasks.unshift({ id: uid('task'), projectId: version.projectId, datasetId: version.datasetId,
      versionId: version.id, name, type, status: '标注中', progress: 0, created: now(), logs: ['人工标注，关联当前成果版本'] })
    task = tasks[0]
  }
  task.progress = progress
  return task
}
