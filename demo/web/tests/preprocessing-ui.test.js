import test from 'node:test'
import assert from 'node:assert/strict'
import {createRenderer,createSSRApp,nextTick,ssrContextKey} from 'vue'
import {renderToString} from 'vue/server-renderer'
import ElementPlus,{ElMessage,ElMessageBox,ID_INJECTION_KEY,ZINDEX_INJECTION_KEY} from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import {createServer} from 'vite'
import {initialData} from '../src/data.js'
import {migrateWorkspace} from '../src/workspace.js'
import {workflowSteps} from '../src/workflow.js'
import {resolveSessionPage} from '../src/auth.js'
import {taskCategory,taskDuration,taskModel,taskSummary} from '../src/tasks.js'

const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'})
let store,session,Preparation,Cleaning,Tasks,Process,FlowConfig,Landing
try {
  store=await server.ssrLoadModule('/src/store.js')
  session=await server.ssrLoadModule('/src/auth.js')
  Preparation=(await server.ssrLoadModule('/src/components/PreparationView.vue')).default
  Cleaning=(await server.ssrLoadModule('/src/components/CleaningView.vue')).default
  Tasks=(await server.ssrLoadModule('/src/components/TaskCenter.vue')).default
  FlowConfig=(await server.ssrLoadModule('/src/components/ProjectFlowConfig.vue')).default
  Landing=(await server.ssrLoadModule('/src/components/LandingView.vue')).default
  Process=(await server.ssrLoadModule('/src/components/ProcessView.vue')).default
} finally {await server.close()}
const renderer=createRenderer({createComment:()=>({}),insert(){},remove(){},parentNode(){},nextSibling(){}})
function mount(component,props) {
  const app=renderer.createApp({...component,render:()=>null},props)
  app.provide(ssrContextKey,{modules:new Set()})
  const vm=app.mount({})
  return {form:vm.$.setupState,unmount:()=>app.unmount()}
}
ElMessage.success=()=>{}
ElMessage.warning=()=>{}
test.beforeEach(()=>{
  session.loginDemo('管理员')
  Object.assign(store.state,migrateWorkspace(initialData()),{role:'管理员',activeProjectId:'project-soil',activeDataset:'soil',
    tasks:[],versions:[],flows:[],ui:{},focusVersion:'',
    sources:[{id:'pdf',datasetId:'soil',projectId:'project-soil',name:'论文.pdf',type:'PDF',content:''},
      {id:'txt',datasetId:'soil',projectId:'project-soil',name:'正文.txt',type:'TXT',content:'正文  13812345678'}]})
})

test('预处理内解析后自动衔接清洗，配置冻结且重复点击不会创建重复解析',async context=>{
  context.mock.timers.enable({apis:['setTimeout']})
  const prepare=mount(Preparation)
  let cleaning
  try {
    assert.equal(prepare.form.stage,'parsing')
    assert.ok(prepare.form.selectedIds.includes('pdf'))
    prepare.form.selectedIds=['pdf']
    prepare.form.selectionEdited=true
    prepare.form.parsingConfig.format='JSON'
    prepare.form.parseDocuments()
    prepare.form.parseDocuments()
    assert.equal(store.state.tasks.length,1)
    assert.equal(prepare.form.parsingRunning,true)
    assert.match(prepare.form.parsingBlockedReason,/正在解析/)
    prepare.form.parsingConfig.format='Markdown'
    const task=store.state.tasks[0]
    assert.equal(task.config.format,'JSON')
    assert.equal(task.totalItems,1)
    context.mock.timers.tick(1600)
    await nextTick()
    assert.equal(task.status,'已完成')
    assert.ok(task.completedAt>=task.startedAt)
    assert.equal(task.processedItems,1)
    assert.equal(prepare.form.preview.ready,true)
    assert.equal(prepare.form.parsingBlockedReason,'')
    assert.deepEqual([...prepare.form.selectedIds],[task.versionId])
    prepare.form.stage='cleaning'
    assert.equal(prepare.form.stage,'cleaning')
    assert.deepEqual([...store.state.ui.pipeline.inputIds],[task.versionId])
    cleaning=mount(Cleaning)
    assert.equal(cleaning.form.canExecute,true)
    assert.equal(cleaning.form.inputs[0].id,task.versionId)
    cleaning.form.execute()
    const cleanTask=store.state.tasks[0]
    context.mock.timers.tick(1600)
    await nextTick()
    assert.equal(cleanTask.status,'已完成')
    assert.equal(taskCategory(cleanTask),'数据清洗')
    assert.equal(cleanTask.processedItems,1)
    assert.match(taskSummary(cleanTask,store.state.versions),/清洗后/)
  } finally {cleaning?.unmount();prepare.unmount()}
})

test('空交接或过期成果编号不会让已有文档失去默认选择',()=>{
  for (const inputIds of [[],['deleted-version']]) {
    store.state.ui.pipeline={datasetId:'soil',inputIds}
    const prepare=mount(Preparation)
    try {
      assert.ok(prepare.form.selectedIds.includes('pdf'))
      assert.equal(prepare.form.parsingCandidates.length,1)
      assert.equal(prepare.form.parsingBlockedReason,'')
    } finally {prepare.unmount()}
  }
})

test('从旧解析版本或后续成果返回，按原始资料恢复最新版本且不扩大选择',()=>{
  const old=store.addVersion('soil',[{content:'旧正文'}],'PDF解析','pdf')
  const latest=store.addVersion('soil',[{content:'新正文'}],'PDF解析','pdf')
  store.state.sources[0].parsedVersionId=latest.id
  const cleaned=store.addVersion('soil',[{content:'清洗正文',originId:'pdf',inputId:old.id}],'文本清洗',old.id)
  const annotated=store.addVersion('soil',[{content:'片段'}],'知识片段',cleaned.id)
  for (const id of [old.id,cleaned.id,annotated.id]) {
    store.state.ui.pipeline={datasetId:'soil',inputIds:[id]}
    const prepare=mount(Preparation)
    try {
      assert.deepEqual([...prepare.form.selectedIds],[latest.id])
      assert.equal(prepare.form.parsingBlockedReason,'')
    } finally {prepare.unmount()}
  }
})

test('新增文档可解析，手动取消选择后刷新不强制选回，可主动恢复选择',async()=>{
  store.state.sources=[]
  store.state.ui.pipeline={datasetId:'soil',inputIds:['obsolete']}
  const prepare=mount(Preparation)
  try {
    assert.match(prepare.form.parsingBlockedReason,/暂无可解析/)
    store.state.sources.push({id:'new-pdf',datasetId:'soil',name:'新增.pdf',type:'PDF',content:''})
    await nextTick()
    assert.deepEqual([...prepare.form.selectedIds],['new-pdf'])
    assert.equal(prepare.form.parsingBlockedReason,'')
    prepare.form.selectionEdited=true
    prepare.form.selectedIds=[]
    store.state.sources.push({id:'new-word',datasetId:'soil',name:'新增.docx',type:'DOCX',content:''})
    await nextTick()
    assert.deepEqual([...prepare.form.selectedIds],[])
    assert.match(prepare.form.parsingBlockedReason,/勾选/)
    prepare.form.parseDocuments()
    assert.equal(store.state.tasks.length,0)
    prepare.form.selectDocuments()
    assert.deepEqual([...prepare.form.selectedIds],['new-pdf','new-word'])
    assert.equal(prepare.form.parsingBlockedReason,'')
  } finally {prepare.unmount()}
})

test('只选正文不会隐式解析其它文件，无权限时显示原因且不能创建任务',()=>{
  store.state.ui.pipeline={datasetId:'soil',inputIds:['txt']}
  const prepare=mount(Preparation)
  try {
    assert.deepEqual([...prepare.form.selectedIds],['txt'])
    assert.match(prepare.form.parsingBlockedReason,/勾选/)
    prepare.form.parseDocuments()
    assert.equal(store.state.tasks.length,0)
    prepare.form.selectDocuments()
    assert.equal(prepare.form.parsingCandidates.length,1)
    store.state.permissions.find(rule=>rule.role==='管理员').edit=false
    assert.match(prepare.form.parsingBlockedReason,/权限/)
    prepare.form.parseDocuments()
    assert.equal(store.state.tasks.length,0)
  } finally {prepare.unmount()}
})

test('原清洗地址进入预处理，主流程只有一个预处理步骤，记住当前页签',async()=>{
  assert.equal(resolveSessionPage('cleaning',true,['processing','task-center']),'processing')
  assert.deepEqual(workflowSteps.map(step=>step.page),['planning','sources','processing','generation','versions'])
  store.state.ui.preprocessingStage='cleaning'
  const prepare=mount(Preparation)
  assert.equal(prepare.form.stage,'cleaning')
  prepare.form.stage='parsing'
  prepare.form.stage='cleaning'
  prepare.unmount()
  const restored=mount(Preparation)
  try {
    assert.equal(restored.form.stage,'cleaning')
    restored.form.stage='parsing'
    store.state.ui.preprocessingStage='cleaning'
    await nextTick()
    assert.equal(restored.form.stage,'cleaning')
  } finally {restored.unmount()}
})

test('语料接入不能启动解析或清洗任务，交接到预处理保留指定资料',()=>{
  const sources=mount(Process,{page:'sources'})
  try {
    sources.form.configureTask('PDF解析',['pdf'])
    assert.equal(store.state.tasks.length,0)
    assert.equal(sources.form.dialog,false)
    sources.form.handoffSources([store.state.sources[0]])
    assert.deepEqual([...store.state.ui.pipeline.inputIds],['pdf'])
    assert.equal(store.state.ui.preprocessingStage,'parsing')
  } finally {sources.unmount()}
})

test('清洗页签切回文档解析后，保留清洗组件但实际隐藏整个清洗区',async()=>{
  const warnings=[]
  const page={...Preparation,setup(props,context){
    const fields=Preparation.setup(props,context)
    fields.stage.value='cleaning'
    fields.stage.value='parsing'
    return fields
  }}
  const app=createSSRApp(page)
  app.use(ElementPlus)
  app.provide(ID_INJECTION_KEY,{prefix:1,current:0})
  app.provide(ZINDEX_INJECTION_KEY,{current:0})
  for(const [name,component] of Object.entries(icons))app.component(name,component)
  app.config.warnHandler=message=>warnings.push(message)
  const html=await renderToString(app)
  assert.match(html,/class="preprocessing-cleaning" style="display:none;?"/)
  assert.ok(html.includes('cleaning-workspace'))
  assert.deepEqual(warnings,[])
})

test('任务中心汇总类型并按状态、项目、数据集筛选与分页，筛选不切换当前项目',async()=>{
  store.state.tasks=Array.from({length:13},(_,index)=>({id:'t'+index,name:'任务'+index,datasetId:'soil',projectId:'project-soil',
    type:index%2?'文本清洗':'PDF解析',status:'已完成',progress:100,logs:[]}))
  const paper=store.state.datasets.find(dataset=>dataset.id==='paper')
  store.state.tasks.push({id:'paper-task',name:'其它项目解析',datasetId:'paper',projectId:paper.projectId,type:'PDF解析',status:'失败',logs:[]})
  const center=mount(Tasks)
  try {
    assert.equal(center.form.tasks.length,14)
    assert.equal(center.form.pagedTasks.length,10)
    center.form.pageNo=2
    assert.equal(center.form.pagedTasks.length,4)
    center.form.type='数据清洗'
    await nextTick()
    assert.equal(center.form.pageNo,1)
    assert.equal(center.form.tasks.length,6)
    center.form.type='数据解析'
    center.form.status='失败'
    assert.equal(center.form.tasks[0].id,'paper-task')
    center.form.projectId=paper.projectId
    center.form.selectProject(paper.projectId)
    assert.equal(store.state.activeProjectId,'project-soil')
    center.form.status=''
    center.form.projectId=''
    center.form.datasetId='soil'
    assert.equal(center.form.tasks.length,7)
    store.state.permissions.find(rule=>rule.role==='管理员').project='土壤科研'
    center.form.datasetId=''
    assert.ok(center.form.tasks.every(task=>task.datasetId==='soil'))
  } finally {center.unmount()}
})

test('任务中心可带入解析记录筛选；删除记录保留成果，执行中的记录不能删除',async()=>{
  const output=store.addVersion('soil',[{content:'解析内容'}],'PDF解析','pdf')
  store.state.tasks=[{id:'done',datasetId:'soil',projectId:'project-soil',type:'PDF解析',status:'已完成',versionId:output.id,logs:[]},
    {id:'running',datasetId:'soil',projectId:'project-soil',type:'文本清洗',status:'执行中',logs:[]}]
  store.state.ui.taskCenterScope={datasetId:'soil',type:'数据解析'}
  const center=mount(Tasks)
  try {
    assert.equal(center.form.tasks.length,1)
    assert.equal(center.form.tasks[0].id,'done')
    assert.throws(()=>store.removeTaskRecord('running'),/执行中/)
    ElMessageBox.confirm=async()=>true
    await center.form.remove(store.state.tasks[0])
    assert.equal(store.state.tasks.length,1)
    assert.ok(store.state.versions.some(version=>version.id===output.id))
    assert.ok(store.state.sources.some(source=>source.id==='pdf'))
  } finally {center.unmount()}
})

test('项目内配置流程校验输入、步骤与编辑权限，切换目标不会串用原资料',()=>{
  const config=mount(FlowConfig)
  try {
    assert.match(config.form.blockingReason,/选择本次流程的输入资料/)
    config.form.executeFlow()
    assert.equal(store.state.flows.length,0)
    config.form.sourceId='pdf'
    config.form.flowSteps=[]
    assert.match(config.form.blockingReason,/至少选择/)
    config.form.executeFlow()
    assert.equal(store.state.tasks.length,0)
    config.form.flowSteps=['知识片段']
    config.form.datasetId='not-in-this-project'
    assert.equal(config.form.sourceId,'')
    config.form.sourceId='pdf'
    config.form.executeFlow()
    assert.equal(store.state.flows.length,0)
    config.form.datasetId='soil'
    config.form.sourceId='pdf'
    store.state.permissions.find(rule=>rule.role==='管理员').edit=false
    assert.match(config.form.blockingReason,/权限/)
    config.form.flowSteps=['问答生成']
    assert.deepEqual([...config.form.flowSteps],['知识片段'])
    config.form.executeFlow()
    assert.equal(store.state.flows.length,0)
  } finally {config.unmount()}
})

test('项目内启动流程保留配置快照，任务中心可跟踪失败、重试和查看成果',context=>{
  context.mock.timers.enable({apis:['setTimeout']})
  const started=[],navigated=[]
  const config=mount(FlowConfig,{onStarted:flow=>started.push(flow)})
  let center
  try {
    config.form.sourceId='pdf'
    config.form.flowSteps=['知识片段']
    config.form.executeFlow()
    assert.equal(started.length,1)
    const flow=started[0]
    assert.equal(flow.projectId,'project-soil')
    assert.equal(flow.datasetId,'soil')
    assert.deepEqual(flow.steps.map(step=>step.type),['PDF解析','知识片段'])
    const savedFormat=flow.steps[0].config.format
    store.state.settings.parsing.format='改动后的默认值'
    config.form.flowSteps=['问答生成']
    assert.equal(flow.steps[0].config.format,savedFormat)
    assert.deepEqual(flow.steps.map(step=>step.type),['PDF解析','知识片段'])
    store.state.tasks[0].fail=true
    context.mock.timers.tick(1600)
    assert.equal(flow.status,'失败')
    stateScope(flow)
    center=mount(Tasks,{onNavigate:page=>navigated.push(page)})
    assert.equal(center.form.flows.length,1)
    assert.equal(center.form.projectId,'project-soil')
    assert.equal(center.form.datasetId,'soil')
    store.retryProjectFlow(flow.id)
    assert.equal(flow.status,'执行中')
    context.mock.timers.tick(1600)
    context.mock.timers.tick(1600)
    assert.equal(flow.status,'已完成')
    assert.equal(flow.index,2)
    assert.ok(store.state.versions.some(version=>version.id===flow.lastOutput))
    center.form.openResult(flow,flow.lastOutput)
    assert.deepEqual(navigated,['versions'])
    assert.equal(store.state.focusVersion,flow.lastOutput)
  } finally {center?.unmount();config.unmount()}
})

function stateScope(flow) {
  store.state.ui.taskCenterScope={projectId:flow.projectId,datasetId:flow.datasetId}
}

test('流程生成问答后可在任务中心复核；筛选项目、数据集和流程状态不改变当前项目',context=>{
  context.mock.timers.enable({apis:['setTimeout']})
  const navigated=[]
  const config=mount(FlowConfig)
  let center
  try {
    config.form.flowSteps=['问答生成']
    config.form.sourceId='txt'
    config.form.executeFlow()
    context.mock.timers.tick(1600)
    const flow=store.state.flows[0]
    assert.equal(flow.status,'等待复核')
    const paper=store.state.datasets.find(dataset=>dataset.id==='paper')
    store.state.flows.push({id:'other-flow',name:'其它流程',projectId:paper.projectId,datasetId:'paper',status:'已中断',steps:[],index:0})
    center=mount(Tasks,{onNavigate:page=>navigated.push(page)})
    assert.equal(center.form.flows.length,2)
    center.form.datasetId='soil'
    assert.deepEqual(center.form.flows.map(item=>item.id),[flow.id])
    center.form.flowStatus='已中断'
    assert.equal(center.form.flows.length,0)
    center.form.datasetId=''
    center.form.projectId=paper.projectId
    center.form.selectProject()
    assert.equal(center.form.flows[0].id,'other-flow')
    assert.equal(store.state.activeProjectId,'project-soil')
    center.form.projectId=''
    center.form.flowStatus='等待复核'
    center.form.openResult(center.form.flows[0],flow.lastOutput,'generation')
    assert.deepEqual(navigated,['generation'])
    assert.equal(store.state.focusVersion,flow.lastOutput)
    assert.equal(store.state.ui.annotationMode,'问答人工复核')
  } finally {center?.unmount();config.unmount()}
})

test('工作台的未完成任务打开带范围的任务中心，已有成果打开所属项目',()=>{
  const navigated=[]
  const landing=mount(Landing,{onNavigate:page=>navigated.push(page)})
  try {
    const task={projectId:'project-soil',datasetId:'soil'}
    landing.form.openTask(task)
    assert.deepEqual(navigated,['task-center'])
    assert.deepEqual({...store.state.ui.taskCenterScope},{projectId:'project-soil',datasetId:'soil'})
    landing.form.openTask({...task,versionId:'output'})
    assert.deepEqual(navigated,['task-center','versions'])
    assert.equal(store.state.focusVersion,'output')
  } finally {landing.unmount()}
})

test('任务耗时不为旧记录编造数值，模型名称在启动时固定，重试清空旧完成信息',context=>{
  context.mock.timers.enable({apis:['setTimeout']})
  assert.equal(taskDuration({status:'已完成'}),'未记录')
  assert.equal(taskDuration({status:'执行中',startedAt:1000},62000),'1分1秒')
  assert.equal(taskDuration({status:'已完成',startedAt:1000,completedAt:5000},62000),'4秒')
  const task=store.runTask({type:'问答生成',sourceId:'txt',config:{model:'model-1'}})
  const name=task.modelName
  store.state.models[0].name='以后修改的模型名'
  assert.equal(taskModel(task,store.state.models),name)
  context.mock.timers.tick(1600)
  assert.equal(task.status,'已完成')
  const retried=store.runTask({...JSON.parse(JSON.stringify(task)),fail:false})
  assert.notEqual(retried.id,task.id)
  assert.equal(retried.completedAt,undefined)
  assert.equal(retried.processedItems,0)
  assert.equal(retried.versionId,undefined)
  context.mock.timers.tick(1600)
})
