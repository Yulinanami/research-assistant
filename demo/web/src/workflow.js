import { cleanText, cleanImages, splitText } from './domain.js'

export const workflowSteps = [
  { page: 'planning', title: '需求规划' },
  { page: 'sources', title: '语料接入' },
  { page: 'processing', title: '预处理' },
  { page: 'generation', title: '数据标注' },
  { page: 'versions', title: '项目成果' },
]

export function parserType(source) {
  if (source.type === 'PDF') return 'PDF解析'
  if (['DOC', 'DOCX'].includes(source.type)) return 'Word解析'
  if (['XLS', 'XLSX'].includes(source.type)) return 'Excel解析'
  return ''
}

// Resolve the actual upstream output rather than relying on a file's status label.
export function preparationInputs(sources, versions, datasetId) {
  return sources.filter(s => s.datasetId === datasetId).map(source => {
    const imported = versions.find(version => version.datasetId === datasetId && version.type === '条目导入'
      && (version.sourceRevision || 0) === (source.revision || 0)
      && (version.id === source.importedVersionId || version.sourceId === source.id))
    if (imported) return { id: imported.id, originId: source.id, name: source.name, kind: 'structured',
      content: JSON.stringify(imported.records, null, 2), ready: imported.records.some(record => record.status !== '过滤'), parser: '',
      stage: '结构化条目', reason: '已保留逐条结构，可直接进入标注或项目成果' }
    const parser = parserType(source)
    const parsedResults = versions.filter(v => v.datasetId === datasetId && v.sourceId === source.id && v.type === parser
      && (v.sourceRevision || 0) === (source.revision || 0) && v.records.some(r => r.status !== '过滤' && r.content?.trim()))
    const parsed = parser && (parsedResults.find(v => v.id === source.parsedVersionId) || parsedResults[0])
    const image = source.content?.startsWith('data:image/')
    const content = parser ? parsed?.records.filter(r => r.status !== '过滤').map(r => r.content || '').join('\n\n') || '' : source.content || ''
    const ready = Boolean(content.trim()) && (image || !content.startsWith('data:'))
    return { id: parsed?.id || source.id, originId: source.id, name: source.name,
      kind: image ? 'image' : 'text', content, ready, parser,
      stage: parser ? parsed ? '已解析' : '待解析' : ready ? '可直接处理' : '内容不可用',
      reason: ready ? '' : parser ? '请先在数据预处理中完成解析' : '请检查文件格式和内容',
    }
  })
}

export function chunkRecords(input, config = {}) {
  const records = input.records || [{ content: input.content, source: input.name, originId: input.id }]
  return records.flatMap((record, index) => {
    if (record.status === '过滤' || typeof record.content !== 'string' || !record.content.trim()) return []
    return splitText(record.content, config).map((content, chunkIndex) => ({
      title: record.title || input.name || input.type, content,
      source: record.source || record.title || input.name || input.type,
      sourceId: record.sourceId || input.sourceId || input.id,
      originId: record.originId || record.sourceId || input.sourceId || input.id,
      inputId: input.id, sourceRecordIndex: index, chunkIndex,
    }))
  })
}

export function cleaningInputs(sources, versions, datasetId, context) {
  const prepared = preparationInputs(sources, versions, datasetId)
  const requested = context?.datasetId === datasetId && Array.isArray(context.inputIds) ? context.inputIds : []
  const preparedIds = new Set(prepared.filter(input => input.kind !== 'structured').map(input => input.id))
  const structuredIds = new Set(prepared.filter(input => input.kind === 'structured').map(input => input.id))
  const results = versions.filter(version => version.datasetId === datasetId && !preparedIds.has(version.id)
    && (requested.includes(version.id) || structuredIds.has(version.id)))
  const records = results.flatMap(version => version.records.flatMap((record, index) => {
    if (record.status === '过滤') return []
    const image = record.image?.startsWith('data:image/')
    const text = typeof record.content === 'string' && record.content.trim() && !record.content.startsWith('data:')
    if (!image && !text) return []
    return [{ id: `${version.id}:record:${index}`, inputId: version.id,
      originId: record.originId || record.sourceId || version.sourceId,
      name: record.title || `${version.type} · 条目 ${index + 1}`, kind: image ? 'image' : 'text',
      content: image ? record.image : record.content, ready: true, parser: '', stage: '成果条目',
      reason: '', width: record.width, height: record.height, clarity: record.clarity,
    }]
  }))
  return [...prepared, ...records]
}

export function cleanBatch(inputs, config) {
  if (!inputs.length || inputs.some(input => !input.content?.trim())) throw new Error('请选择内容可用的输入资料')
  if (config.type === '图片清洗') {
    if (inputs.some(input => input.kind !== 'image')) throw new Error('图片清洗只能选择图片资料')
    return cleanImages(inputs.map(input => ({ id: input.id, name: input.name, content: input.content,
      originId: input.originId,
      width: input.width || 900, height: input.height || 500, clarity: input.clarity ?? 90, format: input.format || '原图' })), config)
  }
  if (inputs.some(input => input.kind !== 'text')) throw new Error('文本清洗只能选择文本资料')
  const seenByStep = new Map()
  return inputs.map(input => {
    let content = input.content
    let reason = ''
    for (const [index, rule] of (config.rules || []).entries()) {
      if (rule === '质量过滤' && content.trim().length < (config.minChars || 1)) { reason = '内容长度低于阈值'; break }
      content = cleanText(content, [rule])
      if (!content.trim()) { reason = '清洗后内容为空'; break }
      if (rule === '文档去重') {
        if (!seenByStep.has(index)) seenByStep.set(index, new Set())
        const seen = seenByStep.get(index)
        if (seen.has(content)) { reason = '重复文档'; break }
        seen.add(content)
      }
    }
    return { title: input.name, content, before: input.content, source: input.name,
      sourceId: input.id, originId: input.originId, status: reason ? '过滤' : '保留',
      reason: reason || '符合所选规则', retained: reason ? 0 : content.split('\n').filter(Boolean).length }
  })
}

export function resultContent(records) {
  return records.filter(r => r.status !== '过滤').map(r => r.content || r.correctedAnswer || r.answer || '').filter(Boolean).join('\n\n')
}
