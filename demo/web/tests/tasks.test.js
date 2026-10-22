import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

// Load the application's real store and its shared session without browser storage.
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
let store, session
try {
  store = await server.ssrLoadModule('/src/store.js')
  session = await server.ssrLoadModule('/src/auth.js')
} finally { await server.close() }

test('失败任务重试分配新编号，不继承旧输出；缺失或跨数据集输入不能生成成功成果', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  session.loginDemo('管理员')
  const retried = store.runTask({ id: 'old-task', versionId: 'old-output', datasetId: 'soil',
    name: '重试', type: '问答增强', sourceId: 'missing', fail: false })
  assert.ok(retried.id)
  assert.notEqual(retried.id, 'old-task')
  assert.equal(retried.versionId, undefined)
  const foreign = store.addVersion('other-dataset', [{ question: '其它数据集', answer: '答案' }], '问答生成', '')
  const task = store.runTask({ datasetId: 'soil', name: '错误输入', type: '问答增强', sourceId: foreign.id })
  const before = store.state.versions.length
  session.logoutDemo()
  context.mock.timers.tick(1600)
  assert.equal(retried.status, '失败')
  assert.equal(task.status, '失败')
  assert.equal(store.state.versions.length, before)
})

test('真实任务调度的知识切片保持批次中各篇资料的来源', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  session.loginDemo('管理员')
  const input = store.addVersion('soil', [{ content: '甲乙丙丁', sourceId: 'raw-a' },
    { content: '戊己', sourceId: 'raw-b' }], '文本清洗', 'batch')
  const task = store.runTask({ datasetId: 'soil', type: '知识片段', sourceId: input.id, config: { size: 2 } })
  session.logoutDemo()
  context.mock.timers.tick(1600)
  assert.equal(task.status, '已完成')
  const output = store.state.versions.find(version => version.id === task.versionId)
  assert.deepEqual(output.records.map(record => record.sourceId), ['raw-a', 'raw-a', 'raw-b'])
})
