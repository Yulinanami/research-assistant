import test from 'node:test'
import assert from 'node:assert/strict'
import { createRenderer, nextTick, ssrContextKey, h, getCurrentInstance } from 'vue'
import { initialData } from '../src/data.js'
import { migrateWorkspace } from '../src/workspace.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
let store, session, Classification, Annotation, Workbench, GraphView
try {
  store = await server.ssrLoadModule('/src/store.js')
  session = await server.ssrLoadModule('/src/auth.js')
  Classification = (await server.ssrLoadModule('/src/components/ClassificationPanel.vue')).default
  Annotation = (await server.ssrLoadModule('/src/components/AnnotationPanel.vue')).default
  Workbench = (await server.ssrLoadModule('/src/components/AnnotationWorkbench.vue')).default
  GraphView = (await server.ssrLoadModule('/src/components/KnowledgeGraphView.vue')).default
} finally { await server.close() }

// Run real SFC setup/watch/save logic with Vue's renderer. Layout and browser events
// are deliberately outside these tests; no fake browser or network is involved.
const renderer = createRenderer({ createComment: () => ({}), insert() {}, remove() {}, parentNode() {}, nextSibling() {} })
const mount = (component, props) => {
  const app = renderer.createApp({ ...component, render: () => null }, props)
  app.provide(ssrContextKey, { modules: new Set() })
  const vm = app.mount({})
  return { form: vm.$.setupState, unmount: () => app.unmount() }
}
function fresh() {
  Object.assign(store.state, migrateWorkspace(initialData()), { ui: {}, focusVersion: '', role: '管理员',
    activeProjectId: 'project-soil', activeDataset: 'soil', sources: [], versions: [], tasks: [] })
  store.state.sources.push(
    { id:'text-a', datasetId:'soil', name:'正文A', type:'TXT', content:'甲乙丙丁' },
    { id:'text-b', datasetId:'soil', name:'正文B', type:'TXT', content:'另一篇正文' },
    { id:'image-a', datasetId:'soil', name:'图片A', type:'PNG', content:'data:image/png;base64,AA' })
}
function mountWorkbench() {
  const app = renderer.createApp({ ...Workbench, render() {
    const form = getCurrentInstance().setupState
    if (['文本分类','图片分类'].includes(form.mode)) return h({ ...Classification, render: () => null },
      { key:form.mode, kind:form.mode === '图片分类' ? 'image' : 'text' })
    if (['图片框选','问答人工复核'].includes(form.mode)) return h({ ...Annotation, render: () => null },
      { key:form.mode, initialTab:form.mode === '图片框选' ? '图像标注' : '问答标注',
        onMode: name => { form.mode = name } })
    return null
  } })
  app.provide(ssrContextKey, {modules:new Set()})
  const vm = app.mount({})
  return { form:vm.$.setupState, child:() => vm.$.subTree.component?.setupState, unmount:() => app.unmount() }
}
let warnings = []
ElMessage.success = () => {}
ElMessage.warning = message => warnings.push(message)
test.beforeEach(() => {
  session.loginDemo('管理员')
  store.state.activeProjectId = 'project-soil'
  store.state.activeDataset = 'soil'
  store.state.ui = {}
  store.state.focusVersion = ''
  warnings = []
})

test('分类表单阻止模板外标签和单选多标签；模板切换取消后保留标签，设置变更不篡改任务快照', async () => {
  const { form, unmount } = mount(Classification, { kind: 'image' })
  try {
    assert.ok(form.records.length)
    form.records[0].labels = ['模板外标签']
    const before = store.state.versions.length
    form.save(true)
    assert.equal(store.state.versions.length, before)
    assert.match(warnings.at(-1), /模板外/)
    form.records[0].labels = form.template.labels.slice(0, 2)
    form.save(true)
    assert.match(warnings.at(-1), /单选/)
    const label = form.template.labels[0]
    form.records[0].labels = [label]
    ElMessageBox.confirm = async () => { throw new Error('cancel') }
    const id = form.templateId
    await form.changeTemplate('plant-class')
    assert.equal(form.templateId, id)
    assert.deepEqual([...form.records[0].labels], [label])
    const template = store.state.settings.labelTemplates.find(item => item.id === id)
    const previous = [...template.labels]
    template.labels = ['设置中修改的新标签']
    assert.ok(form.template.labels.includes(label))
    template.labels = previous
  } finally { unmount() }
})

test('混合成果复核只显示未过滤问答，保存保留其它条目，模型建议不覆盖原草稿', async () => {
  const base = store.addVersion('soil', [
    { question: '有效问题', answer: '原答案', correctedAnswer: '当前修订', label: '可用', rating: 4 },
    { question: '过滤问题', answer: '过滤答案', status: '过滤' }, { content: '保留其它条目' },
  ], '问答生成', '')
  const suggestion = store.addVersion('soil', base.records, '自动标注', base.id)
  store.state.focusVersion = suggestion.id
  const { form, unmount } = mount(Annotation, { initialTab: '问答标注' })
  try {
    await nextTick()
    assert.equal(form.records.length, 1)
    assert.equal(form.current.correctedAnswer, '当前修订')
    form.current.correctedAnswer = '人工再次修订'
    form.save(false)
    const result = store.state.versions.find(version => version.id === form.draftId)
    assert.notEqual(result.id, base.id)
    assert.notEqual(result.id, suggestion.id)
    assert.equal(result.sourceId, suggestion.id)
    assert.equal(result.records.length, 3)
    assert.equal(result.records[0].correctedAnswer, '人工再次修订')
    assert.equal(result.records[1].status, '过滤')
    assert.equal(result.records[2].content, '保留其它条目')
    assert.equal(base.records[0].correctedAnswer, '当前修订')
  } finally { unmount() }
})

test('图片框选保存图片内容与百分比坐标，旧版仍保持不变，越界框不能保存', async () => {
  const { form, unmount } = mount(Annotation, { initialTab: '图像标注' })
  try {
    await nextTick()
    assert.ok(form.images.length)
    form.boxes = [{ id: 'box', x: 10, y: 10, width: 20, height: 30, label: '图' }]
    form.save(false)
    const result = store.state.versions.find(version => version.id === form.draftId)
    assert.ok(result.records[0].image.startsWith('data:image/'))
    assert.equal(result.records[0].coordinateUnit, 'percent')
    result.status = '待审核'
    form.boxes[0].x = 15
    form.save(false)
    assert.notEqual(form.draftId, result.id)
    assert.equal(result.records[0].boxes[0].x, 10)
    const count = store.state.versions.length
    form.boxes[0].width = 100
    form.save(false)
    assert.equal(store.state.versions.length, count)
    assert.match(warnings.at(-1), /坐标无效/)
  } finally { unmount() }
})

test('未保存分类离开后可恢复；切换版本取消后保留输入；明确空交接不会恢复其它草稿', async () => {
  const first = mount(Classification, { kind: 'image' })
  const label = first.form.template.labels[0]
  first.form.records[0].labels = [label]
  first.unmount()
  const second = mount(Classification, { kind: 'image' })
  try {
    assert.deepEqual([...second.form.records[0].labels], [label])
    ElMessageBox.confirm = async () => { throw new Error('cancel') }
    await second.form.resume('')
    assert.deepEqual([...second.form.records[0].labels], [label])
  } finally { second.unmount() }
  store.state.ui.pipeline = { datasetId: 'soil', inputIds: ['missing-result'] }
  const empty = mount(Classification, { kind: 'image' })
  try { assert.equal(empty.form.records.length, 0) } finally { empty.unmount() }
})

test('问答未保存修订切换输入可取消，离开恢复工作副本，不因另一个身份继承', async () => {
  const base = store.addVersion('soil', [{ question: '待复核', answer: '原文', label: '' }], '问答生成', '')
  store.state.focusVersion = base.id
  const first = mount(Annotation, { initialTab: '问答标注' })
  first.form.records[0].correctedAnswer = '工作副本中的修订'
  ElMessageBox.confirm = async () => { throw new Error('cancel') }
  await first.form.changeInput('soil-v1')
  assert.equal(first.form.versionId, base.id)
  first.unmount()
  const second = mount(Annotation, { initialTab: '问答标注' })
  try { assert.equal(second.form.records[0].correctedAnswer, '工作副本中的修订') } finally { second.unmount() }
  store.state.role = '加工人员'
  session.loginDemo('加工人员')
  const other = mount(Annotation, { initialTab: '问答标注' })
  try { assert.equal(other.form.records[0].correctedAnswer, undefined) } finally { other.unmount() }
  store.state.role = '管理员'
})

test('导入分类成果的编辑创建独立标注草稿，不覆盖导入源版本', () => {
  const imported = store.addVersion('soil', [{ id: 'original', image: 'data:image/png;base64,AA', labels: ['科研图表'] }], '条目导入', 'import-file')
  store.state.ui.annotationTarget = { datasetId: 'soil', versionId: imported.id, index: 0 }
  const { form, unmount } = mount(Classification, { kind: 'image' })
  try {
    form.records[0].labels = ['田间照片']
    form.save(false)
    assert.notEqual(form.draftId, imported.id)
    assert.deepEqual([...imported.records[0].labels], ['科研图表'])
  } finally { unmount() }
})

test('工作副本保存前检查草稿是否已被其它操作改写，避免旧复核覆盖新内容', () => {
  const base = store.addVersion('soil', [{ question: '问题', answer: '旧答案' }], '问答生成', '')
  store.state.focusVersion = base.id
  const { form, unmount } = mount(Annotation, { initialTab: '问答标注' })
  try {
    form.records[0].correctedAnswer = '工作副本中的答案'
    base.records[0].answer = '另一操作更新的答案'
    form.save(false)
    assert.equal(base.records[0].answer, '另一操作更新的答案')
    assert.equal(base.records[0].correctedAnswer, undefined)
    assert.match(warnings.at(-1), /已被其它操作修改/)
  } finally { unmount() }
})

test('九种方式切换保留输入、提示词和已生成成果，跨类型切换释放不兼容的上游范围', async context => {
  fresh()
  context.mock.timers.enable({apis:['setTimeout']})
  store.state.ui.pipeline = { datasetId:'soil', inputIds:['text-a'], generationType:'知识片段' }
  const work = mountWorkbench()
  try {
    work.form.inputIds = ['text-b']
    work.form.size = 2
    work.form.execute()
    context.mock.timers.tick(1600)
    await nextTick()
    const taskId = work.form.tasks[0].id
    const outputId = work.form.outputs[0].id
    work.form.mode = '问答生成'
    work.form.prompt = '手工定制的提示词'
    for (const mode of ['文本分类','图片分类','图片框选','图片描述','图片问答','问答人工复核','问答增强']) {
      work.form.mode = mode
      await nextTick()
      if (['文本分类','图片分类'].includes(mode)) assert.ok(work.child().records.length, mode)
      if (mode === '图片框选') assert.ok(work.child().currentImage)
    }
    work.form.mode = '知识片段'
    await nextTick()
    assert.deepEqual([...work.form.inputIds], ['text-b'])
    assert.equal(work.form.size, 2)
    assert.equal(work.form.tasks[0].id, taskId)
    assert.equal(work.form.outputs[0].id, outputId)
    work.form.mode = '问答生成'
    assert.equal(work.form.prompt, '手工定制的提示词')
  } finally {work.unmount()}
})

test('结果区只提供最新任务的一个成果，完整历史仍保留，失败时不冒充旧成果',async context=>{
  fresh()
  context.mock.timers.enable({apis:['setTimeout']})
  const work=mountWorkbench()
  try {
    work.form.inputIds=['text-a']
    work.form.execute()
    context.mock.timers.tick(1600)
    await nextTick()
    const original=work.form.outputs[0].id
    work.form.inputIds=['text-b']
    work.form.execute()
    assert.equal(work.form.outputs.length,0)
    assert.equal(work.form.running,true)
    context.mock.timers.tick(1600)
    await nextTick()
    assert.equal(work.form.tasks.length,2)
    assert.equal(work.form.outputs.length,1)
    assert.notEqual(work.form.outputs[0].id,original)
    assert.ok(store.state.versions.some(version=>version.id===original))
    store.runTask({type:'知识片段',sourceId:'text-a',fail:true,config:{size:2}})
    assert.equal(work.form.currentTask,store.state.tasks[0])
    context.mock.timers.tick(1600)
    await nextTick()
    assert.equal(work.form.currentTask.status,'失败')
    assert.equal(work.form.outputs.length,0)
    assert.equal(store.state.versions.length,2)
  } finally {work.unmount()}
})

test('重置工作区后离开旧标注页不报错，也不恢复已清除的工作副本',()=>{
  fresh()
  const work=mountWorkbench()
  work.form.prompt='重置前的内容'
  store.state.ui={}
  assert.doesNotThrow(()=>work.unmount())
  assert.equal(store.state.ui.annotationWorkbenches,undefined)
})

test('知识图谱从正文构建，冻结输入与配置，人工校订另存并保留原图谱和草稿',async context=>{
  fresh()
  context.mock.timers.enable({apis:['setTimeout']})
  store.state.sources[0].content='Alice 与 Bob 开展研究。'
  const work=mountWorkbench()
  let editor,restored
  try {
    work.form.mode='知识图谱'
    work.form.inputIds=['text-a']
    work.form.entityTerms='Alice,Bob'
    work.form.entityTypes=['组织']
    work.form.execute()
    work.form.entityTerms='Unknown'
    store.state.sources[0].content='任务启动后修改的正文'
    context.mock.timers.tick(1600)
    await nextTick()
    assert.equal(work.form.currentTask.status,'已完成')
    const version=work.form.outputs[0]
    const graph=version.records[0].knowledge_graph
    assert.equal(graph.entities.length,2)
    assert.equal(graph.entities[0].entity_type,'组织')
    assert.equal(graph.chunks[0].content,'Alice 与 Bob 开展研究。')
    assert.ok(!graph.entities.some(entity=>entity.entity_name==='Unknown'))
    editor=mount(GraphView,{version,editable:true,exportable:true})
    editor.form.edit('entity',editor.form.graph.entities[0])
    editor.form.apply({...editor.form.initial,entity_name:'艾丽丝'})
    assert.ok(editor.form.graph.relationships.some(relation=>relation.src_id==='艾丽丝'||relation.tgt_id==='艾丽丝'))
    editor.unmount();editor=null
    let saved
    restored=mount(GraphView,{version,editable:true,onSaved:value=>saved=value})
    assert.equal(restored.form.dirty,true)
    assert.ok(restored.form.graph.entities.some(entity=>entity.entity_name==='艾丽丝'))
    restored.form.save()
    assert.ok(saved)
    assert.notEqual(saved.id,version.id)
    assert.equal(saved.parentVersionId,version.id)
    assert.equal(saved.records[0].knowledge_graph.reviewed,true)
    assert.equal(version.records[0].knowledge_graph.reviewed,false)
    assert.equal(version.records[0].knowledge_graph.entities[0].entity_name,'Alice')
    assert.ok(store.state.tasks.some(task=>task.type==='知识图谱标注'&&task.versionId===saved.id))
    restored.form.save()
    assert.equal(store.state.versions.filter(version=>version.type==='知识图谱').length,2)
    assert.equal(work.form.outputs.length,1)
    assert.equal(work.form.outputs[0].id,saved.id)
  } finally {editor?.unmount();restored?.unmount();work.unmount()}
})

test('图谱拒绝错误、过滤和跨数据集输入，无权限不能保存校订',context=>{
  fresh()
  context.mock.timers.enable({apis:['setTimeout']})
  const foreign=store.addVersion('other',[{content:'Alice 与 Bob'}],'知识片段','')
  const filtered=store.addVersion('soil',[{content:'Alice 与 Bob',status:'过滤'}],'知识片段','')
  const tasks=[foreign.id,filtered.id,'image-a','missing'].map(sourceId=>store.runTask({type:'知识图谱',sourceId,config:{entityTerms:'Alice,Bob'}}))
  context.mock.timers.tick(1600)
  assert.ok(tasks.every(task=>task.status==='失败'))
  store.state.sources[0].content='Alice 与 Bob'
  const task=store.runTask({type:'知识图谱',sourceId:'text-a',config:{entityTerms:'Alice,Bob'}})
  context.mock.timers.tick(1600)
  const version=store.state.versions.find(version=>version.id===task.versionId)
  const editor=mount(GraphView,{version,editable:true})
  try {
    store.state.permissions.find(rule=>rule.role==='管理员').edit=false
    const count=store.state.versions.length
    editor.form.save()
    editor.form.remove('entity',editor.form.graph.entities[0])
    assert.equal(store.state.versions.length,count)
    assert.equal(editor.form.graph.entities.length,2)
  } finally {editor.unmount()}
})

test('空分类和空问答工作副本不会遮住后来接入的新资料', async () => {
  fresh()
  store.state.sources = []
  const emptyClass = mount(Classification, {kind:'image'})
  assert.equal(emptyClass.form.records.length, 0)
  emptyClass.unmount()
  store.state.sources.push({id:'new-image', datasetId:'soil', name:'新图片', content:'data:image/png;base64,BB'})
  const loaded = mount(Classification, {kind:'image'})
  try {assert.equal(loaded.form.records[0].id, 'new-image')} finally {loaded.unmount()}
  const emptyReview = mount(Annotation, {initialTab:'问答标注'})
  assert.equal(emptyReview.form.records.length, 0)
  emptyReview.unmount()
  const version = store.addVersion('soil', [{question:'新问答',answer:'新答案'}], '问答生成', '')
  store.state.focusVersion = version.id
  const review = mount(Annotation, {initialTab:'问答标注'})
  try {assert.equal(review.form.current.question, '新问答')} finally {review.unmount()}
})

test('分类页接入新图保持当前标签并选择新图，编辑旧版本保留正确父版本', () => {
  fresh()
  const first = mount(Classification, {kind:'image'})
  try {
    first.form.toggle(first.form.template.labels[0])
    const source = {id:'image-b', datasetId:'soil', name:'新图', content:'data:image/png;base64,BB'}
    store.state.sources.push(source)
    first.form.imported([source])
    assert.equal(first.form.current.id, source.id)
    assert.equal(first.form.records[0].labels.length, 1)
    assert.equal(first.form.records.length, 2)
  } finally {first.unmount()}
  store.state.ui = {}
  const old = store.addVersion('soil', [{image:'data:image/png;base64,AA',labels:['科研图表']}], '图片整体分类', '')
  old.status = '已发布'
  store.addVersion('soil', [{question:'无关的较新成果',answer:'内容'}], '问答生成', '')
  store.state.ui.annotationTarget = {datasetId:'soil',versionId:old.id,index:0}
  const editing = mount(Classification, {kind:'image'})
  try {
    editing.form.save(false)
    const result = store.state.versions.find(v=>v.id === editing.form.draftId)
    assert.equal(result.parentVersionId, old.id)
  } finally {editing.unmount()}
})

test('框选使用实际图片坐标，支持反向拖动和小于1%的细框，保存后保留原图快照', async () => {
  fresh()
  const frame = mount(Annotation, {initialTab:'图像标注'})
  try {
    await nextTick()
    frame.form.imageElement = {naturalWidth:1200, naturalHeight:800,
      getBoundingClientRect:() => ({left:100,top:50,width:1000,height:800})}
    const event = (x,y) => ({clientX:x,clientY:y,button:0,pointerId:1,currentTarget:{setPointerCapture(){}},preventDefault(){}})
    frame.form.pointerDown(event(500,400))
    frame.form.pointerMove(event(300,200))
    frame.form.pointerUp(event(300,200))
    assert.equal(frame.form.boxes.length, 1)
    assert.equal(frame.form.boxes[0].x, 20)
    assert.equal(frame.form.boxes[0].height, 25)
    frame.form.pointerDown(event(120,70))
    frame.form.pointerUp(event(125,75))
    assert.equal(frame.form.boxes.length, 2)
    assert.equal(frame.form.boxes[1].width, .5)
    const version = frame.form.save(false)
    assert.equal(version.records[0].width, 1200)
    assert.equal(version.records[0].boxes.length, 2)
    store.state.sources.find(s=>s.id==='image-a').content = 'data:image/png;base64,CHANGED'
    store.state.ui.annotationTarget = {datasetId:'soil',versionId:version.id,index:0}
    frame.unmount()
    const reopened = mount(Annotation, {initialTab:'图像标注'})
    try {
      assert.equal(reopened.form.image, 'data:image/png;base64,AA')
      assert.equal(reopened.form.boxes.length, 2)
    } finally {reopened.unmount()}
  } finally {frame.unmount()}
})

test('问答自动标注使用尚未保存的修订并在完成后展示模型建议', async context => {
  fresh()
  context.mock.timers.enable({apis:['setTimeout']})
  const version = store.addVersion('soil', [{question:'待复核',answer:'原答案'}], '问答生成', '')
  store.state.focusVersion = version.id
  const review = mount(Annotation, {initialTab:'问答标注'})
  try {
    review.form.current.correctedAnswer = '未保存的人工修订'
    review.form.automatic()
    const task = store.state.tasks.find(t=>t.id===review.form.autoTaskId)
    assert.equal(task.inputSnapshot.records[0].correctedAnswer, '未保存的人工修订')
    context.mock.timers.tick(1600)
    await nextTick()
    assert.equal(task.status, '已完成')
    assert.equal(review.form.versionId, task.versionId)
    assert.equal(review.form.current.correctedAnswer, '未保存的人工修订')
    assert.equal(review.form.current.suggestion, '可用')
  } finally {review.unmount()}
})

test('无问答时从复核面板点击生成会切换到问答生成方式', async () => {
  fresh()
  store.state.ui.annotationMode = '问答人工复核'
  const work = mountWorkbench()
  try {
    assert.equal(work.form.mode, '问答人工复核')
    work.child().emit('mode', '问答生成')
    await nextTick()
    assert.equal(work.form.mode, '问答生成')
    assert.ok(work.form.inputIds.length)
  } finally {work.unmount()}
})

test('离开标注页面再返回时，旧交接类型不会覆盖当前建设方式和工作内容', async () => {
  fresh()
  store.state.ui.pipeline = {datasetId:'soil',inputIds:['text-a'],generationType:'知识片段'}
  const first = mountWorkbench()
  first.form.mode = '图片分类'
  await nextTick()
  first.child().toggle(first.child().template.labels[0])
  first.unmount()
  const second = mountWorkbench()
  try {
    assert.equal(second.form.mode, '图片分类')
    assert.equal(second.child().records[0].labels.length, 1)
  } finally {second.unmount()}
})
