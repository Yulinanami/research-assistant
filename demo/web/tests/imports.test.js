import test from 'node:test'
import assert from 'node:assert/strict'
import { parseEntries } from '../src/imports.js'
import { classificationInputs, exportDatasetRecords, generationInputs } from '../src/workspace.js'
import { preparationInputs, chunkRecords } from '../src/workflow.js'

test('文件与粘贴导入统一识别 Alpaca、JSONL、BOM，并定位坏行与无效条目', () => {
  const records = parseEntries('\uFEFF{"instruction":"采样深度？","input":"原文","output":"20厘米"}\n{"content":"正文"}', 'jsonl')
  assert.equal(records[0].question, '采样深度？')
  assert.equal(records[0].reference, '原文')
  assert.equal(parseEntries(JSON.stringify({ records })).length, 2)
  assert.throws(() => parseEntries('{"content":"正文"}\n错误', 'jsonl'), /第 2 行/)
  for (const invalid of ['[]', '[null]', '[1]', '[[]]', 'null', '[{"question":3}]', '[{"labels":"病害"}]']) {
    assert.throws(() => parseEntries(invalid))
  }
  assert.throws(() => parseEntries('[{"content":"正文"}', 'json'), /JSON 语法/)
})

test('Label Studio 保留人工标注与模型预测的独立结构，只映射已知文本和图片字段', () => {
  const input = [{ id: 7, data: { text: '试验方法', image: 'https://example.invalid/image.png', soil_moisture: 20 },
    annotations: [{ result: [{ type: 'choices', value: { choices: ['方法'] } }] }],
    predictions: [{ score: 0.8, result: [{ type: 'choices', value: { choices: ['背景'] } }] }] }]
  const records = parseEntries(JSON.stringify(input))
  assert.equal(records[0].content, '试验方法')
  assert.equal(records[0].image, input[0].data.image)
  assert.deepEqual(records[0].annotations, input[0].annotations)
  assert.deepEqual(records[0].predictions, input[0].predictions)
  assert.equal(records[0].labels, undefined)
  assert.deepEqual(exportDatasetRecords(records, '原始结构')[0].data, input[0].data)
  assert.throws(() => parseEntries('[{"data":null}]'), /data/)
})

test('ShareGPT 多轮导入再导出保留全部轮次，不静默转换为单轮', () => {
  const conversations = [{ from: 'system', value: '依据原文回答' }, { from: 'human', value: '深度？' },
    { from: 'gpt', value: '20厘米' }, { from: 'human', value: '单位？' }, { from: 'gpt', value: '厘米' }]
  const records = parseEntries(JSON.stringify([{ conversations }]))
  assert.deepEqual(exportDatasetRecords(records, 'ShareGPT'), [{ conversations }])
  assert.throws(() => exportDatasetRecords(records, 'Alpaca'), /多轮对话/)
  assert.throws(() => parseEntries('[{"conversations":[{"from":"unknown","value":"内容"}]}]'), /角色/)
  assert.throws(() => exportDatasetRecords([{ question: 3, answer: '内容' }], 'Alpaca'), /需要每条记录/)
  assert.throws(() => exportDatasetRecords(records, '未知结构'), /不支持/)
})

test('V7 类图片分类成果重新导入后逐条恢复人工标签及来源，不变成整份 JSON 文本', () => {
  const records = parseEntries(JSON.stringify([{ id: 'old-image', sourceId: 'old-image', title: '科研图表',
    image: 'data:image/svg+xml,%3Csvg%3E', labels: ['科研图表'] }]))
  const sources = [{ id: 'import', datasetId: 'a', name: 'V7.json', type: 'JSON', content: JSON.stringify(records), importedVersionId: 'v7' }]
  const versions = [{ id: 'v7', sourceId: 'import', datasetId: 'a', type: '条目导入', records }]
  assert.equal(preparationInputs(sources, versions, 'a')[0].kind, 'structured')
  assert.deepEqual(generationInputs('知识片段', sources, versions, 'a'), [])
  const restored = classificationInputs('image', sources, versions, 'a')
  assert.deepEqual(restored[0].labels, ['科研图表'])
  assert.equal(restored[0].sourceRecordId, 'old-image')
  assert.equal(restored[0].inputVersionId, 'v7')
  restored[0].labels.push('新标签')
  assert.deepEqual(records[0].labels, ['科研图表'])
  assert.deepEqual(classificationInputs('image', sources, versions, 'b'), [])
})

test('知识切片逐条保留输入成果、来源资料和原记录位置，并排除过滤项', () => {
  const input = { id: 'clean', sourceId: 'raw-batch', type: '文本清洗', records: [
    { content: '甲乙丙丁', sourceId: 'raw-a', source: '甲论文' },
    { content: '不得切片', sourceId: 'raw-b', status: '过滤' },
    { content: '戊己', sourceId: 'raw-c', originId: 'origin-c', source: '丙论文' },
  ] }
  const before = JSON.stringify(input)
  const chunks = chunkRecords(input, { size: 2 })
  assert.deepEqual(chunks.map(record => record.content), ['甲乙', '丙丁', '戊己'])
  assert.deepEqual(chunks.map(record => record.sourceId), ['raw-a', 'raw-a', 'raw-c'])
  assert.equal(chunks[2].originId, 'origin-c')
  assert.equal(chunks[2].sourceRecordIndex, 2)
  assert.equal(chunks[0].inputId, 'clean')
  assert.equal(JSON.stringify(input), before)
})
