import { isDatasetVersion } from './domain.js'
import { preparationInputs } from './workflow.js'
import { questionEntries } from './annotation.js'

export const preprocessingModules = [
  { id: 'cleaning', name: '数据清洗', icon: 'DocumentChecked', description: '分版块勾选规范化、去重、脱敏与质量过滤，支持试运行。' },
  { id: '知识片段', name: '知识片段生成', icon: 'Files', description: '从纯文本或已解析文档切片，保留标题与来源，形成知识片段数据集。' },
  { id: '问答生成', name: '文本问答对提取', icon: 'MagicStick', description: '从解析后的语料生成 QA，人工审核修改后保存为数据集成果。' },
  { id: '问答增强', name: 'SFT 问答对增强', icon: 'ChatDotRound', description: '选择已有问答对语料，按受众和提示词要求生成增强数据。' },
]

export const preprocessingName = type => preprocessingModules.find(item => item.id === type)?.name || type

export function preprocessingInputs(type, sources, versions, datasetId) {
  const local = versions.filter(version => version.datasetId === datasetId)
  const sourceNames = new Map(sources.filter(source => source.datasetId === datasetId).map(source => [source.id, source.name]))
  const namesFor = (input, seen = new Set()) => {
    if (seen.has(input.id)) return []
    seen.add(input.id)
    return [...new Set([input.sourceId, ...(input.sourceIds || []),
      ...(input.records || []).flatMap(record => [record.originId, record.sourceId])].flatMap(id => {
      if (sourceNames.has(id)) return [sourceNames.get(id)]
      const parent = local.find(version => version.id === id)
      return parent ? namesFor(parent, seen) : []
    }))]
  }
  if (type === '问答增强') return local.filter(version => isDatasetVersion(version) && questionEntries(version).records.length)
    .map(version => ({ id: version.id, name: namesFor(version).join('、') || '问答语料',
      stage: `V${version.number} · ${questionEntries(version).records.length} 条问答`, group: '问答语料' }))
  return preparationInputs(sources, local, datasetId).filter(input => input.ready && input.kind === 'text')
    .map(input => ({ ...input, group: '接入资料' }))
}
