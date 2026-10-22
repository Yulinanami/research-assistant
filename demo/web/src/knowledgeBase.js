import { preparationInputs } from './workflow.js'
import { isDatasetVersion } from './domain.js'
import { effectiveAnswer } from './annotation.js'
import { extractKnowledgeGraph, graphEntityTypes, graphScientificTerms } from './knowledgeGraph.js'

export function knowledgeFingerprint(value) {
  const text = JSON.stringify(value)
  let left = 2166136261, right = 5381
  for (const char of text) {
    const code = char.codePointAt(0)
    left = Math.imul(left ^ code, 16777619)
    right = Math.imul(right, 33) ^ code
  }
  return `${text.length}:${(left >>> 0).toString(16)}:${(right >>> 0).toString(16)}`
}

export function knowledgeInputs(sources, versions, datasetId) {
  const localSources = sources.filter(source => source.datasetId === datasetId)
  const localVersions = versions.filter(version => version.datasetId === datasetId)
  const documents = preparationInputs(localSources, localVersions, datasetId)
    .filter(input => input.ready && input.kind === 'text')
    .map(input => {
      const source = localSources.find(item => item.id === input.originId)
      return { key: `source:${source.id}`, inputId: input.id, originId: source.id, name: source.name,
        collection: ['MD', 'TXT'].includes(source.type) && !/论文|报告|试验|研究/.test(source.name) ? '个人笔记' : '论文与文档',
        content: input.content, revision: source.revision || 0 }
    })
  const questions = localVersions.filter(isDatasetVersion).flatMap(version => {
    const approved = ['已通过', '已发布'].includes(version.status)
    const review = version.annotationReview
    const annotationApproved = review?.status === '已通过'
      && review.signature === knowledgeFingerprint([version.records, version.labelTemplate, version.annotationTemplate])
    if (version.type === '问答标注' && !approved && !annotationApproved) return []
    const records = version.records.filter(record => record.status !== '过滤' && record.question?.trim() && effectiveAnswer(record).trim()
      && !['不可用', '需修改', '无法判断'].includes(record.label) && (record.label === '可用' || approved))
    if (!records.length) return []
    return [{ key: `qa:${version.id}`, inputId: version.id, originId: version.id,
      name: `优质问答 · V${version.number}`, collection: '优质问答', revision: 0,
      content: records.map(record => `问题：${record.question}\n回答：${effectiveAnswer(record)}${record.reference ? '\n参考：' + record.reference : ''}`).join('\n\n') }]
  })
  return [...documents, ...questions].map(input => ({ ...input,
    signature: knowledgeFingerprint([input.key, input.inputId, input.name, input.content, input.revision]) }))
    .sort((left, right) => left.key.localeCompare(right.key))
}

export function compileKnowledgePage(input) {
  if (!input?.content?.trim()) throw new Error('资料没有可编译的正文')
  const title = input.name.replace(/\.[A-Za-z0-9]+$/, '') || input.name
  const paragraphs = input.content.split(/\r?\n(?:[\t ]*\r?\n)+/).filter(part => part.trim())
  const summary = (paragraphs.find(part => part.length > 40) || paragraphs[0]).slice(0, 260)
  const sections = paragraphs.map((content, index) => {
    const lines = content.split(/\r?\n/)
    const heading = lines[0].replace(/^#{1,6}\s*/, '').trim()
    return lines.length > 1 && heading.length >= 2 && heading.length <= 24 && !/[。！？]/.test(heading)
      ? { title: heading, content: lines.slice(1).join('\n') }
      : { title: `知识摘录 ${index + 1}`, content }
  })
  const quoted = [...input.content.matchAll(/[“「《"]([^”」》"\n]{2,32})[”」》"]/gu)].map(match => match[1])
  const headings = [...input.content.matchAll(/(?:^|\n)(?:#{1,4}\s*)?([^\n：:]{2,20})[：:]/gu)].map(match => match[1].trim())
  const keywords = [...new Set([...quoted, ...headings, ...sections.map(section => section.title).filter(name => !name.startsWith('知识摘录 ')), title])].slice(0, 40)
  return { title, summary, keywords, source: input.name, sourceId: input.inputId, originId: input.originId,
    knowledgeKey: input.key, sourceSignature: input.signature, collection: input.collection,
    content: `# ${title}\n\n${input.content}`,
    sections,
    citations: [{ name: input.name, inputId: input.inputId, originId: input.originId, revision: input.revision }],
    compilation_engine: 'local-extractive-demo' }
}

export function knowledgeSnapshot(sources, versions, datasetId) {
  const inputs = knowledgeInputs(sources, versions, datasetId)
  const local = versions.filter(version => version.datasetId === datasetId)
  const pages = inputs.flatMap(input => {
    const version = local.find(item => item.type === '知识编译' && item.knowledgeKey === input.key && item.knowledgeSignature === input.signature)
    return version ? [version] : []
  })
  const signature = knowledgeFingerprint([inputs.map(input => [input.key, input.signature]), pages.map(page => [page.id, page.records])])
  const graph = inputs.length && pages.length === inputs.length
    ? local.find(version => version.type === '知识图谱' && version.knowledgeBuildSignature === signature) : null
  return { inputs, pages, signature, graph: graph || null }
}

export function compileKnowledgeGraph(pages, signature) {
  const records = pages.flatMap(page => page.records.map(record => ({ ...record, compiledPageId: page.id })))
  const keywords = [...new Set(records.flatMap(record => record.keywords || []))]
  const graph = extractKnowledgeGraph({ id: `knowledge:${signature}`, records }, {
    maxEntities: 100, entityTypes: graphEntityTypes, size: 2000,
    entityTerms: [...new Set([...graphScientificTerms, ...keywords])].join('、'),
  })
  for (const chunk of graph.chunks) chunk.compiled_page_id = records[chunk.source_record_index]?.compiledPageId
  return { ...graph, compilation_ids: pages.map(page => page.id), knowledge_signature: signature }
}
