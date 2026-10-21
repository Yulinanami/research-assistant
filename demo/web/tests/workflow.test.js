import test from 'node:test'
import assert from 'node:assert/strict'
import { preparationInputs, cleanBatch, resultContent } from '../src/workflow.js'
import { imageCleaningSamples } from '../src/data.js'

test('文档只有取得对应解析结果后才可进入清洗，并保留来源且隔离数据集', () => {
  const source = { id: 'paper', datasetId: 'a', type: 'PDF', name: '论文.pdf', content: '', status: '已解析' }
  const wrong = { id: 'wrong', datasetId: 'b', type: 'PDF解析', sourceId: 'paper', records: [{ content: '其它项目内容' }] }
  assert.equal(preparationInputs([source], [wrong], 'a')[0].ready, false)
  const parsed = { ...wrong, id: 'parsed', datasetId: 'a', records: [{ content: '真实解析结果' }] }
  const input = preparationInputs([source], [parsed, wrong], 'a')[0]
  assert.equal(input.id, 'parsed')
  assert.equal(input.originId, 'paper')
  assert.equal(input.content, '真实解析结果')
  assert.equal(input.ready, true)
  assert.deepEqual(preparationInputs([source], [parsed], 'b'), [])
  const newer = { ...parsed, id: 'newer', records: [{ content: '重新解析的内容' }] }
  assert.equal(preparationInputs([{ ...source, parsedVersionId: 'newer' }], [parsed, newer], 'a')[0].content, '重新解析的内容')
})

test('清洗批次按配置顺序去重、脱敏和过滤，并保留原文及逐条来源', () => {
  const inputs = [
    { id: 'a', originId: 'raw-a', name: 'A.txt', kind: 'text', content: '联系电话 13812345678' },
    { id: 'b', name: 'B.txt', kind: 'text', content: '联系电话   13812345678' },
    { id: 'c', name: 'C.txt', kind: 'text', content: '短' },
  ]
  const config = { type: '文本清洗', rules: ['格式标准化', '隐私脱敏', '文档去重', '质量过滤'], minChars: 5 }
  const results = cleanBatch(inputs, config)
  assert.deepEqual(results.map(r => r.status), ['保留', '过滤', '过滤'])
  assert.equal(results[0].content, '联系电话 ***********')
  assert.equal(results[0].before, inputs[0].content)
  assert.equal(results[0].sourceId, 'a')
  assert.equal(results[0].originId, 'raw-a')
  assert.equal(results[1].reason, '重复文档')
  assert.equal(results[2].reason, '内容长度低于阈值')
  assert.equal(inputs[0].content, '联系电话 13812345678')
  assert.equal(resultContent(results), '联系电话 ***********')
  // Moving deduplication before normalization deliberately changes the output.
  assert.equal(cleanBatch(inputs.slice(0, 2), { ...config, rules: ['文档去重', '格式标准化'] }).filter(r => r.status === '保留').length, 2)
})

test('缺失或类型错误的输入必须阻止执行，不使用内置科研材料填充', () => {
  assert.throws(() => cleanBatch([], { type: '文本清洗' }), /输入资料/)
  assert.throws(() => cleanBatch([{ kind: 'text', content: '' }], { type: '文本清洗' }), /输入资料/)
  assert.throws(() => cleanBatch([{ kind: 'image', content: 'data:image/png;base64,AA' }], { type: '文本清洗' }), /只能选择文本/)
  assert.throws(() => cleanBatch([{ kind: 'text', content: '正文' }], { type: '图片清洗' }), /只能选择图片/)
  assert.equal(resultContent([{ content: '不应进入下游', status: '过滤' }]), '')
})

test('图片流水线在同一批中保留正常样本，过滤重复、低分辨率和模糊样本', () => {
  const inputs = imageCleaningSamples().map((image, i) => ({ ...image, id: `image-${i}`, kind: 'image' }))
  const results = cleanBatch(inputs, { type: '图片清洗', rules: ['重复图片去重', '质量筛选', '格式标准化'], minWidth: 300, minHeight: 200, minClarity: 60, maxWidth: 600, maxHeight: 600, imageFormat: 'PNG' })
  assert.deepEqual(results.map(r => r.status), ['保留', '过滤', '过滤', '过滤'])
  assert.equal(results[0].sourceId, 'image-0')
  assert.deepEqual(results[0].after, { width: 600, height: 333, format: 'PNG' })
  assert.equal(inputs[0].width, 900)
})
