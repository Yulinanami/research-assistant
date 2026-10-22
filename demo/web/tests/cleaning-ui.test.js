import test from 'node:test'
import assert from 'node:assert/strict'
import { createRenderer, nextTick, ssrContextKey } from 'vue'
import { ElMessage } from 'element-plus'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
let store, session, Cleaning, Preparation
try {
  store = await server.ssrLoadModule('/src/store.js')
  session = await server.ssrLoadModule('/src/auth.js')
  Cleaning = (await server.ssrLoadModule('/src/components/CleaningView.vue')).default
  Preparation = (await server.ssrLoadModule('/src/components/PreparationView.vue')).default
} finally { await server.close() }

const renderer = createRenderer({ createComment: () => ({}), insert() {}, remove() {}, parentNode() {}, nextSibling() {} })
function mount(component) {
  const app = renderer.createApp({ ...component, render: () => null })
  app.provide(ssrContextKey, { modules: new Set() })
  const vm = app.mount({})
  return { form: vm.$.setupState, unmount: () => app.unmount() }
}
const text = () => ({ id: 'text', datasetId: 'soil', name: '原文.txt', type: 'TXT', content: '需要清洗的正文  13812345678' })
const image = () => ({ id: 'image', datasetId: 'soil', name: '原图.png', type: 'PNG', content: 'data:image/png;base64,AA' })
ElMessage.success = () => {}
ElMessage.warning = () => {}
test.beforeEach(() => {
  session.loginDemo('管理员')
  Object.assign(store.state, { role: '管理员', activeProjectId: 'project-soil', activeDataset: 'soil',
    sources: [text(), image()], versions: [], tasks: [], ui: {} })
})

test('有文本交接时切换图片清洗不沿用文本编号，切回文本仍可执行', async () => {
  store.state.ui.pipeline = { datasetId: 'soil', inputIds: ['text'] }
  const { form, unmount } = mount(Cleaning)
  try {
    assert.equal(form.canExecute, true)
    form.type = '图片清洗'
    await nextTick()
    assert.deepEqual([...form.selectedIds], ['image'])
    assert.equal(form.canExecute, true)
    form.trySample()
    assert.equal(form.trial.length, 1)
    form.type = '文本清洗'
    await nextTick()
    assert.deepEqual([...form.selectedIds], ['text'])
    assert.equal(form.canExecute, true)
  } finally { unmount() }
})

test('文档解析完成后清洗与预处理同步更新选中编号，无需重新进入页面', async () => {
  store.state.sources = [{ id: 'pdf', datasetId: 'soil', name: '文档.pdf', type: 'PDF', content: '' }]
  store.state.ui.pipeline = { datasetId: 'soil', inputIds: ['pdf'] }
  const cleaning = mount(Cleaning)
  const preparation = mount(Preparation)
  try {
    assert.equal(cleaning.form.canExecute, false)
    const result = store.addVersion('soil', [{ content: '解析完成后的正文' }], 'PDF解析', 'pdf')
    store.state.sources[0].parsedVersionId = result.id
    await nextTick()
    assert.deepEqual([...cleaning.form.selectedIds], [result.id])
    assert.deepEqual([...preparation.form.selectedIds], [result.id])
    assert.equal(cleaning.form.canExecute, true)
    assert.equal(preparation.form.preview.ready, true)
  } finally { cleaning.unmount(); preparation.unmount() }
})

test('新增资料自动就绪，但手动清空选择后不会被资料刷新强行选回', async () => {
  store.state.sources = []
  const { form, unmount } = mount(Cleaning)
  try {
    assert.equal(form.canExecute, false)
    store.state.sources.push(text())
    await nextTick()
    assert.equal(form.canExecute, true)
    form.selectionEdited = true
    form.selectedIds = []
    store.state.sources.push({ ...text(), id: 'second' })
    await nextTick()
    assert.equal(form.canExecute, false)
    assert.match(form.blockingReason, /勾选/)
    form.selectAllInputs()
    assert.equal(form.inputs.length, 2)
    assert.equal(form.canExecute, true)
  } finally { unmount() }
})

test('明确选择的加工成果按保留记录继续清洗，过滤项和其它数据集不进入输入', () => {
  const result = store.addVersion('soil', [{ content: '保留正文', sourceId: 'text' }, { content: '过滤内容', status: '过滤' }], '文本清洗', 'text')
  store.addVersion('other', [{ content: '其它数据集' }], '文本清洗', '')
  store.state.ui.pipeline = { datasetId: 'soil', inputIds: [result.id] }
  const { form, unmount } = mount(Cleaning)
  try {
    assert.equal(form.inputs.length, 1)
    assert.equal(form.inputs[0].content, '保留正文')
    assert.equal(form.canExecute, true)
  } finally { unmount() }
})

test('导入图片条目交接自动进入图片清洗，初次切换类型不扩大到其它原图', async () => {
  const imported = store.addVersion('soil', [{ title: '导入图片', image: 'data:image/png;base64,BB', labels: ['科研图表'] }], '条目导入', 'json-file')
  store.state.sources.push({ id: 'json-file', datasetId: 'soil', type: 'JSON', content: '[]', importedVersionId: imported.id })
  store.state.ui.pipeline = { datasetId: 'soil', inputIds: [imported.id] }
  const { form, unmount } = mount(Cleaning)
  try {
    await nextTick()
    assert.equal(form.type, '图片清洗')
    assert.equal(form.inputs.length, 1)
    assert.equal(form.inputs[0].name, '导入图片')
    assert.equal(form.canExecute, true)
    form.trySample()
    assert.equal(form.trial.length, 1)
  } finally { unmount() }
})

test('过期交接不自动扩大输入，用户可明确重新选择，执行期间阻止重复任务', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  store.state.ui.pipeline = { datasetId: 'soil', inputIds: ['missing-result'] }
  const { form, unmount } = mount(Cleaning)
  try {
    assert.equal(form.canExecute, false)
    assert.match(form.blockingReason, /不匹配或已更新/)
    form.selectAllInputs()
    form.trySample()
    assert.equal(form.trial.length, 1)
    form.execute()
    assert.equal(store.state.tasks.length, 1)
    assert.equal(form.canExecute, false)
    form.execute()
    assert.equal(store.state.tasks.length, 1)
    context.mock.timers.tick(1600)
    await nextTick()
    assert.equal(form.task.status, '已完成')
    assert.equal(form.canExecute, true)
  } finally { unmount() }
})

test('只读身份仍禁止试运行和批量执行，界面给出权限原因', () => {
  store.state.role = '数据使用者'
  session.loginDemo('数据使用者')
  const { form, unmount } = mount(Cleaning)
  try {
    assert.equal(form.canExecute, false)
    assert.match(form.blockingReason, /权限/)
    form.trySample()
    form.execute()
    assert.equal(store.state.tasks.length, 0)
    assert.equal(form.trial, null)
  } finally { unmount() }
})
