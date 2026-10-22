import { chunkRecords } from './workflow.js'

export const graphEntityTypes = ['概念', '对象', '指标', '方法', '组织', '地点']
const keyOf = value => value.normalize('NFKC').trim().toLocaleLowerCase()
const clone = value => JSON.parse(JSON.stringify(value))
const scientificTerms = ['土壤含水量','质量含水率','作物','烘干法','采样深度','试验田','A组','B组','水分质量','干土质量','产量']
function hash(text) {
  let value = 2166136261
  for (const char of text) value = Math.imul(value ^ char.codePointAt(0), 16777619)
  return (value >>> 0).toString(16)
}

// A source-grounded local demonstration, not a call to a LightRAG/LLM service.
export function extractKnowledgeGraph(input, config = {}) {
  const limit = Number(config.maxEntities ?? 40)
  if (!Number.isInteger(limit) || limit < 2 || limit > 100) throw new Error('实体上限须为 2—100 的整数')
  const types = config.entityTypes || graphEntityTypes
  if (!types.length || types.some(type => typeof type !== 'string' || !type.trim())) throw new Error('请选择实体类型')
  const records = chunkRecords(input, {size:config.size || 1000})
  const chunks = records.map((record, index) => ({
    source_id: 'chunk-' + hash(input.id + ':' + record.sourceRecordIndex + ':' + index + ':' + record.content),
    content:record.content, file_path:record.source || input.name || input.type || '文本资料',
    input_id:input.id, origin_id:record.originId, source_record_index:record.sourceRecordIndex, chunk_index:record.chunkIndex,
  }))
  if (!chunks.length) throw new Error('没有可用于图谱抽取的正文条目')
  const entities = [], relationships = [], names = new Map(), pairs = new Map()
  let truncated = false
  const hints = String(config.entityTerms || '').split(/[,，、;；\n]/u).map(term => term.trim()).filter(Boolean)
  for (const chunk of chunks) {
    const quoted = [...chunk.content.matchAll(/[“「《"]([^”」》"\n]{2,40})[”」》"]/gu)].map(match => match[1])
    const english = [...chunk.content.matchAll(/\b[A-Z][A-Za-z0-9_-]{1,39}\b/g)].map(match => match[0])
    const terms = hints.length ? hints : [...scientificTerms, ...quoted, ...english]
    const inChunk = []
    for (const name of terms) {
      if (!chunk.content.includes(name)) continue
      const key = keyOf(name)
      let entity = names.get(key)
      if (!entity) {
        if (entities.length >= limit) {truncated = true;continue}
        const suggestedType = /法$/.test(name) ? '方法' : /率|量|深度/.test(name) ? '指标' : /组$|作物/.test(name) ? '对象' : '概念'
        entity = {entity_name:name, entity_type:types.includes(suggestedType) ? suggestedType : types[0],
          description:chunk.content.split(/[。！？\n]/u).find(sentence => sentence.includes(name))?.trim() || name,
          source_id:chunk.source_id, source_ids:[], file_path:chunk.file_path}
        names.set(key, entity); entities.push(entity)
      }
      if (!entity.source_ids.includes(chunk.source_id)) entity.source_ids.push(chunk.source_id)
      if (!inChunk.includes(entity)) inChunk.push(entity)
    }
    for (const sentence of chunk.content.split(/[。！？\n]/u).filter(text => text.trim())) {
      const members = inChunk.filter(entity => sentence.includes(entity.entity_name))
      for (let index = 0; index < members.length - 1; index++) {
        const [left, right] = [members[index], members[index + 1]].sort((a,b) => keyOf(a.entity_name).localeCompare(keyOf(b.entity_name)))
        const key = JSON.stringify([keyOf(left.entity_name), keyOf(right.entity_name)])
        let relation = pairs.get(key)
        if (!relation) {
          relation = {src_id:left.entity_name, tgt_id:right.entity_name, keywords:'同句共现',
            description:sentence.trim(), weight:1, source_id:chunk.source_id, source_ids:[], file_path:chunk.file_path}
          pairs.set(key, relation); relationships.push(relation)
        }
        if (!relation.source_ids.includes(chunk.source_id)) relation.source_ids.push(chunk.source_id)
        relation.weight = relation.source_ids.length
      }
    }
  }
  if (!entities.length) throw new Error('未识别到实体，请填写正文中实际出现的候选实体名称后重试')
  const graph = {format:'research-knowledge-graph/v1', engine:'local-demo', reviewed:false, is_truncated:truncated, chunks, entities, relationships}
  validateKnowledgeGraph(graph)
  return graph
}

export function validateKnowledgeGraph(graph) {
  if (!graph?.entities?.length || !Array.isArray(graph.relationships) || !graph.chunks?.length) throw new Error('图谱须包含实体、关系列表和来源片段')
  const chunkIds = new Set(graph.chunks.map(chunk => chunk.source_id))
  if (chunkIds.size !== graph.chunks.length || graph.chunks.some(chunk => !chunk.source_id || !chunk.content?.trim())) throw new Error('来源片段编号重复或正文为空')
  const names = new Set()
  function evidence(item) {
    if (!item.source_ids?.length || item.source_ids.some(id => !chunkIds.has(id))) throw new Error('实体或关系必须关联有效的来源片段')
  }
  for (const entity of graph.entities) {
    if (!entity.entity_name?.trim() || !entity.entity_type?.trim() || !entity.description?.trim()) throw new Error('实体名称、类型和说明不能为空')
    const key = keyOf(entity.entity_name)
    if (names.has(key)) throw new Error('实体名称重复，请保留一个名称')
    names.add(key); evidence(entity)
  }
  const pairs = new Set(), exactNames = new Set(graph.entities.map(entity => entity.entity_name))
  for (const relation of graph.relationships) {
    if (!exactNames.has(relation.src_id) || !exactNames.has(relation.tgt_id) || relation.src_id === relation.tgt_id) throw new Error('关系两端必须是两个不同的已有实体')
    const key = JSON.stringify([relation.src_id, relation.tgt_id].sort())
    if (pairs.has(key)) throw new Error('同一对实体的关系重复，请合并说明和关键词')
    pairs.add(key)
    if (!relation.keywords?.trim() || !relation.description?.trim() || !Number.isFinite(relation.weight) || relation.weight <= 0) throw new Error('关系关键词、说明和正数权重不能为空')
    evidence(relation)
  }
  return graph
}

export function updateGraphEntity(graph, previousName, changes) {
  const next = clone(graph)
  const entity = next.entities.find(item => item.entity_name === previousName)
  if (!entity) throw new Error('实体已不存在')
  Object.assign(entity, changes, {entity_name:changes.entity_name?.trim() || entity.entity_name})
  for (const relation of next.relationships) {
    if (relation.src_id === previousName) relation.src_id = entity.entity_name
    if (relation.tgt_id === previousName) relation.tgt_id = entity.entity_name
  }
  next.reviewed = false
  return validateKnowledgeGraph(next)
}

export function removeGraphEntity(graph, name) {
  const next = clone(graph)
  next.entities = next.entities.filter(entity => entity.entity_name !== name)
  next.relationships = next.relationships.filter(relation => relation.src_id !== name && relation.tgt_id !== name)
  next.reviewed = false
  return validateKnowledgeGraph(next)
}

export function exportKnowledgeGraph(graph) {
  return clone(validateKnowledgeGraph(graph))
}
