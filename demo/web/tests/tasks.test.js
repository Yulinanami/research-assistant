import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { exportDatasetRecords } from '../src/workspace.js'


// Load the application's real store and its shared session without browser storage.
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
let store, session
try {
  store = await server.ssrLoadModule('/src/store.js')
  session = await server.ssrLoadModule('/src/auth.js')
} finally { await server.close() }

test('图片描述和图片问答逐图保留原图与来源，原始结构导出可以还原对应关系', context => {
  context.mock.timers.enable({apis:['setTimeout']})
  session.loginDemo('管理员')
  const input = store.addVersion('soil', [
    {image:'data:image/png;base64,AAA', title:'第一张图',sourceId:'source-a'},
    {image:'data:image/png;base64,BBB', title:'第二张图',sourceId:'source-b'},
    {image:'data:image/png;base64,FILTERED',status:'过滤'},
  ], '图片清洗', '')
  const tasks = ['图片描述','图片问答'].map(type=>store.runTask({
    datasetId:'soil',type,sourceId:input.id,config:{model:'model-1'} }))
  session.logoutDemo()
  context.mock.timers.tick(1600)
  for (const task of tasks) {
    assert.equal(task.status, '已完成')
    const output = store.state.versions.find(v=>v.id===task.versionId)
    const exported = exportDatasetRecords(output.records, '原始结构', {quality:'all'})
    assert.ok(exported.some(r=>r.image==='data:image/png;base64,AAA' && r.sourceId==='source-a'))
    assert.ok(exported.some(r=>r.image==='data:image/png;base64,BBB' && r.sourceId==='source-b'))
    assert.ok(exported.every(r=>r.image!=='data:image/png;base64,FILTERED'))
    assert.ok(exported.every(r=>r.inputId===input.id))
    if (task.type==='图片描述') assert.equal(exported.length, 2)
  }
})

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

test('模型预标注保留人工质量标签、评分与修订答案，过滤记录不增加建议', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  session.loginDemo('管理员')
  const input = store.addVersion('soil', [
    { question: '问题', answer: '原答案', correctedAnswer: '人工答案', label: '不可用', rating: 2 },
    { question: '过滤', answer: '内容', status: '过滤' },
  ], '问答生成', '')
  const task = store.runTask({ datasetId: 'soil', type: '自动标注', sourceId: input.id, config: { model: 'model-1' } })
  session.logoutDemo()
  context.mock.timers.tick(1600)
  assert.equal(task.status, '已完成')
  const result = store.state.versions.find(version => version.id === task.versionId)
  assert.equal(result.records[0].label, '不可用')
  assert.equal(result.records[0].rating, 2)
  assert.equal(result.records[0].correctedAnswer, '人工答案')
  assert.equal(result.records[0].suggestion, '可用')
  assert.equal(result.records[1].suggestion, undefined)
})

test('任务输入在启动时冻结，随后编辑输入不会改变当前任务输出', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  session.loginDemo('管理员')
  const input = store.addVersion('soil', [{ content: '原始内容' }], '文本清洗', '')
  const task = store.runTask({ datasetId: 'soil', type: '知识片段', sourceId: input.id, config: { size: 100 } })
  input.records[0].content = '运行中修改的内容'
  session.logoutDemo()
  context.mock.timers.tick(1600)
  assert.equal(task.status, '已完成')
  const result = store.state.versions.find(version => version.id === task.versionId)
  assert.equal(result.records[0].content, '原始内容')
  assert.equal(task.inputSnapshot.records[0].content, '原始内容')
})

test('图片任务拒绝文本，生成拒绝空内容与已过滤问答，未上架模型不能执行', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  session.loginDemo('管理员')
  const input = store.addVersion('soil', [{ content: '正文' }], '文本清洗', '')
  const empty = store.addVersion('soil', [{ content: '', status: '过滤' }], '文本清洗', '')
  const filtered = store.addVersion('soil', [{ question: '过滤', answer: '答案', status: '过滤' }], '问答生成', '')
  const tasks = [
    store.runTask({ datasetId: 'soil', type: '图片问答', sourceId: input.id, config: { model: 'model-1' } }),
    store.runTask({ datasetId: 'soil', type: '问答生成', sourceId: empty.id, config: { model: 'model-1' } }),
    store.runTask({ datasetId: 'soil', type: '问答增强', sourceId: filtered.id, config: { model: 'model-1' } }),
    store.runTask({ datasetId: 'soil', type: '问答生成', sourceId: input.id, config: { model: 'missing' } }),
  ]
  const before = store.state.versions.length
  session.logoutDemo()
  context.mock.timers.tick(1600)
  assert.ok(tasks.every(task => task.status === '失败'))
  assert.equal(store.state.versions.length, before)
})

test('结构化原资料编辑先校验，再形成新修订；错误输入不改写原资料', () => {
  session.loginDemo('管理员')
  const source = { id: 'edit-json', datasetId: 'soil', type: 'JSON', content: '[{"content":"旧正文"}]', revision: 0 }
  store.state.sources.push(source)
  assert.throws(() => store.updateSource(source, { content: '错误JSON' }))
  assert.equal(source.revision, 0)
  assert.equal(source.content, '[{"content":"旧正文"}]')
  assert.equal(store.updateSource(source, { content: '[{"content":"新正文"}]' }), true)
  assert.equal(source.revision, 1)
  const version = store.state.versions.find(item => item.id === source.importedVersionId)
  assert.equal(version.sourceRevision, 1)
  assert.equal(version.records[0].content, '新正文')
})
