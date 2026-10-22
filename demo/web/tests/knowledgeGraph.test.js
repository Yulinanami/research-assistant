import test from 'node:test'
import assert from 'node:assert/strict'
import {extractKnowledgeGraph,validateKnowledgeGraph,updateGraphEntity,removeGraphEntity,exportKnowledgeGraph} from '../src/knowledgeGraph.js'

const input = {id:'text',name:'研究记录',content:'Alice 与 Bob 合作研究。Alice 与 Carol 分享记录。'}
const config = {entityTerms:'Alice,Bob,Carol',size:1000}

test('图谱仅从实际正文抽取实体，同名去重且关系只来自同一句证据',()=>{
  const graph=extractKnowledgeGraph(input,config)
  assert.deepEqual(graph.entities.map(entity=>entity.entity_name),['Alice','Bob','Carol'])
  assert.equal(graph.relationships.length,2)
  assert.ok(graph.relationships.every(relation=>relation.keywords==='同句共现'))
  assert.ok(!graph.relationships.some(relation=>[relation.src_id,relation.tgt_id].includes('Bob')&&[relation.src_id,relation.tgt_id].includes('Carol')))
  assert.ok(graph.relationships.every(relation=>graph.chunks.some(chunk=>chunk.source_id===relation.source_id&&chunk.content.includes(relation.description))))
  assert.ok(graph.entities.every(entity=>graph.chunks[0].content.includes(entity.entity_name)))
  assert.equal(graph.reviewed,false)
  assert.equal(graph.engine,'local-demo')
  assert.ok(graph.entities.every(entity=>!entity.entity_name.includes('土壤')))
})

test('批次图谱保留每条来源和片段，过滤记录不进入图谱且同名实体汇集证据',()=>{
  const source={id:'cleaned',type:'文本清洗',records:[
    {content:'Alice 和 Bob 开展研究。',originId:'raw-a',source:'资料甲'},
    {content:'Alice 和 Bob 讨论结果。',originId:'raw-b',source:'资料乙'},
    {content:'Alice 与 Carol。',originId:'filtered',status:'过滤'},
  ]}
  const graph=extractKnowledgeGraph(source,config)
  assert.equal(graph.chunks.length,2)
  assert.deepEqual(graph.chunks.map(chunk=>chunk.origin_id),['raw-a','raw-b'])
  assert.ok(graph.chunks.every(chunk=>chunk.input_id==='cleaned'))
  assert.equal(graph.entities.length,2)
  assert.equal(graph.entities[0].source_ids.length,2)
  assert.equal(graph.relationships[0].weight,2)
  assert.equal(graph.relationships[0].source_ids.length,2)
  assert.deepEqual(extractKnowledgeGraph(source,config).chunks.map(chunk=>chunk.source_id),graph.chunks.map(chunk=>chunk.source_id))
})

test('抽取无命中时不补造内容，实体上限和类型配置真实生效',()=>{
  assert.throws(()=>extractKnowledgeGraph({id:'empty',content:'甲乙丙丁'}),/候选实体/)
  assert.throws(()=>extractKnowledgeGraph({id:'empty',records:[{content:'Alice',status:'过滤'}]}),/正文/)
  assert.throws(()=>extractKnowledgeGraph(input,{...config,entityTypes:[]}),/实体类型/)
  assert.throws(()=>extractKnowledgeGraph(input,{...config,maxEntities:101}),/实体上限/)
  const graph=extractKnowledgeGraph(input,{...config,entityTypes:['组织'],maxEntities:2})
  assert.equal(graph.entities.length,2)
  assert.equal(graph.is_truncated,true)
  assert.ok(graph.entities.every(entity=>entity.entity_type==='组织'))
})

test('实体改名同步关系端点，删除实体同时移除关系，原图谱快照不变',()=>{
  const graph=extractKnowledgeGraph(input,config)
  const changed=updateGraphEntity(graph,'Alice',{entity_name:'艾丽丝',description:'核对后的说明'})
  assert.ok(changed.relationships.every(relation=>relation.src_id==='艾丽丝'||relation.tgt_id==='艾丽丝'))
  assert.ok(graph.entities.some(entity=>entity.entity_name==='Alice'))
  const removed=removeGraphEntity(changed,'艾丽丝')
  assert.equal(removed.entities.length,2)
  assert.equal(removed.relationships.length,0)
  assert.throws(()=>updateGraphEntity(graph,'Alice',{entity_name:'bob'}),/名称重复/)
})

test('图谱校验拒绝悬空关系、错误证据、自关联和重复关系，导出保持完整结构',()=>{
  const graph=extractKnowledgeGraph(input,config)
  const invalid=()=>structuredClone(graph)
  let next=invalid();next.relationships[0].tgt_id='Unknown'
  assert.throws(()=>validateKnowledgeGraph(next),/已有实体/)
  next=invalid();next.entities[0].source_ids=['missing']
  assert.throws(()=>validateKnowledgeGraph(next),/来源片段/)
  next=invalid();next.relationships[0].tgt_id=next.relationships[0].src_id
  assert.throws(()=>validateKnowledgeGraph(next),/不同/)
  next=invalid();next.relationships.push({...next.relationships[0]})
  assert.throws(()=>validateKnowledgeGraph(next),/关系重复/)
  next=invalid();next.relationships[0].weight=0
  assert.throws(()=>validateKnowledgeGraph(next),/正数权重/)
  const exported=JSON.parse(JSON.stringify(exportKnowledgeGraph(graph)))
  assert.deepEqual(exported,graph)
  exported.entities[0].entity_name='changed'
  assert.equal(graph.entities[0].entity_name,'Alice')
})
