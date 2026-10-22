import { isDatasetVersion, now, uid } from './domain.js'

export const effectiveAnswer = record => record.correctedAnswer?.trim() || record.answer || ''

export function editAnswerRecord(record, changes) {
  const next = { ...record, ...changes }
  if (record.question && record.correctedAnswer?.trim() && Object.hasOwn(changes, 'answer')) {
    next.answer = record.answer
    next.correctedAnswer = changes.answer
  }
  return next
}

export function reviewInput(versions, datasetId, preferredId, inputIds = []) {
  const candidates = versions.filter(version => version.datasetId === datasetId
    && (isDatasetVersion(version) || version.type === '自动标注') && version.records.some(record => record.question))
  return candidates.find(version => version.id === preferredId)
    || inputIds.map(id => candidates.find(version => version.id === id)).find(Boolean)
    || candidates[0]
}

export function classificationKind(version) {
  return version.labelTemplate?.kind || ({ 图片整体分类: 'image', 文本分类: 'text' })[version.type]
}

export function classificationDraft(versions, datasetId, kind, recordIds) {
  return versions.find(version => version.datasetId === datasetId && version.status === '草稿'
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
