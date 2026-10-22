<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document, Edit, Grid, Brush, Picture, Files, ChatDotRound, MagicStick, View, ChatLineSquare } from '@element-plus/icons-vue'
import { state, checkGovernance, selectedSources, selectedVersions, requireAction, notify, importFile, runTask, addVersion, allowed, downloadSource, deleteSource } from '../store'
import { uid, now, isDatasetVersion, nextDatasetCode, contentFieldsFor } from '../domain'
import { researchText, tableSamples, qaSamples } from '../data'
import FormDialog from './FormDialog.vue'
import AnnotationPanel from './AnnotationPanel.vue'

const featureIcons = {
  'PDF解析': Document, 'Word解析': Edit, 'Excel解析': Grid, '文本清洗': Brush, '图片清洗': Picture,
  '知识片段': Files, '问答生成': ChatDotRound, '问答增强': MagicStick, '图片描述': View, '图片问答': ChatLineSquare,
}

const props = defineProps({ page: String, modelSection: String })
const emit = defineEmits(['navigate'])
const search = ref(state.ui[props.page]?.search || '')
const statusFilter = ref(state.ui[props.page]?.status || '全部状态')
const pageNo = ref(state.ui[props.page]?.pageNo || 1)
const tab = ref({ processing: state.processingStep === '清洗' ? '文本清洗' : 'PDF解析', generation: '知识片段', annotation: '知识片段', models: props.modelSection || '模型配置' }[props.page] || '')
const sourceRows = computed(() => selectedSources().filter(s => s.name.includes(search.value) && (statusFilter.value === '全部状态' || s.status === statusFilter.value)))
const datasets = computed(() => state.datasets.filter(d => d.projectId === state.activeProject && allowed('view', d.id) && d.name.includes(search.value)))
const tasks = computed(() => state.tasks.filter(t => t.datasetId === state.activeDataset && t.name.includes(search.value) && (statusFilter.value === '全部状态' || t.status === statusFilter.value) && (props.page === 'processing' ? /解析|清洗/.test(t.type) : /问答|片段|图片描述/.test(t.type))))
const versions = computed(selectedVersions)
const dialog = ref(false)
const dialogTitle = ref('')
const fields = ref([])
const initial = ref({})
let saveHandler
const detail = ref(null)
const chosen = ref([])
const fileInput = ref(null)
const importDialog = ref(false)
const importTab = ref('文件上传')
const databaseConnected = ref(false)
const dbConfig = ref({ host: 'demo-mysql:3306', database: 'soil_research', table: 'soil_samples', username: 'demo_reader', condition: '', fields: ['sample_id', 'sampling_depth', 'soil_moisture'] })
const manualText = ref('')
const currentDataset=computed(()=>state.datasets.find(dataset=>dataset.id===state.activeDataset))
const importFields=computed(()=>contentFieldsFor(state,currentDataset.value))
const sdkCode = `POST /api/datasets/{datasetId}/sources\nContent-Type: application/json\n{ "name": "采样记录", "records": [...] }`
const chatText = ref('')
const chatMessages = computed(() => state.conversations)
const modelChoice = ref(state.models[0]?.id || '')
const evaluation = ref(false)
const evaluationResults = computed(() => state.evaluations)
const evaluationFile = ref('')
const evaluationInput = ref(null)
const evaluationRecords = ref([])
const availableEvaluationModels = computed(() => state.models.filter(model => model.status === '已上架'))
const canEvaluate = computed(() => evaluationRecords.value.length && compareModels.value.some(id => availableEvaluationModels.value.some(model => model.id === id)))
const compareModels = ref(state.models.filter(m => m.status === '已上架').map(m => m.id))
const uploadBusy = ref(false)
const previewTab = ref('内容')
const annotationMode = ref(props.page === 'annotation' ? '人工与辅助标注' : '生成数据')
const steps = [
  { title: '解析', stage: '解析', icon: 'DocumentCopy' },
  { title: '清洗', stage: '清洗', icon: 'Brush' },
]
watch(() => props.modelSection, value => { if (value) tab.value = value })
const stepIndex = computed(() => tab.value.includes('清洗') ? 1 : 0)
const processingTabs = computed(() => tab.value.includes('清洗') ? ['文本清洗','图片清洗'] : ['PDF解析','Word解析','Excel解析'])
function goStep(step) { state.processingStep = step.stage; tab.value = step.stage === '清洗' ? '文本清洗' : 'PDF解析' }
function continueTask(task) { state.focusVersion = task.versionId; detail.value = null; if (task.type.includes('解析')) { state.processingStep='清洗'; if (props.page==='processing') tab.value='文本清洗'; else emit('navigate','processing') } else emit('navigate',task.type.includes('清洗') ? 'generation' : 'versions') }
watch([search, statusFilter, () => state.activeDataset], () => { pageNo.value = 1 })
watch([search, statusFilter, pageNo], () => { state.ui[props.page] = { search: search.value, status: statusFilter.value, pageNo: pageNo.value } })

function openForm(title, schema, data, handler) { dialogTitle.value = title; fields.value = schema; initial.value = data || {}; saveHandler = handler; dialog.value = true }
function saveForm(data) { if (saveHandler(data) !== false) dialog.value = false }
const datasetFields = [
  { key: 'name', label: '数据集名称', required: true }, { key: 'type', label: '数据类型', type: 'select', options: ['文本', '图片', '问答对', '文本分类', '结构化数据'], default: '问答对', required: true },
  { key: 'scene', label: '使用场景', required: true }, { key: 'demand', label: '业务需求', type: 'textarea', required: true }, { key: 'quality', label: '内容质量要求', type: 'textarea', default: '来源可追溯，内容准确完整' },
  { key: 'format', label: '格式质量要求', default: 'JSON、Markdown' }, { key: 'scale', label: '规划数据量（条）', type: 'number', default: 100 },
  { key:'industry', label:'所属领域', required:true },
  { key: 'source', label: '数据来源' }, { key: 'level', label: '数据等级', type: 'select', options: ['公开', '内部'], default: '内部' },
  { key: 'status', label: '保存方式', type: 'select', options: ['草稿', '建设中'], default: '草稿', help: '选择“建设中”将提交规划并进入语料接入。' },
]
function editDataset(row) {
  if (!requireAction('edit', row?.id)) return
  const metadataFields = state.standards.filter(rule=>rule.category==='元数据规范' && rule.field && rule.enabled!==false && !['code',...datasetFields.map(field=>field.key)].includes(rule.field))
  const schema = [...datasetFields, {key:'steward',label:'数据责任人',required:true,default:state.role},{key:'fieldTemplateId',label:'内容标准模板',type:'select',required:true,options:state.fieldTemplates.map(item=>({label:item.name,value:item.id})),default:row?.fieldTemplateId || ((row?.type || '问答对')==='问答对'?'content-qa':row?.type==='图片'?'content-image':'content-document')},{key:'policyIds',label:'元数据执行标准（留空沿用默认）',type:'select',multiple:true,default:[],options:state.standards.filter(item=>item.category==='全流程标准' && item.stages && !item.stages.includes('安全')).map(item=>({label:item.name,value:item.id}))}, ...metadataFields.map(rule=>({key:rule.field,label:rule.name,type:rule.dataType==='数值'?'number':rule.dataType==='布尔'?'switch':'text',required:rule.required, min:rule.min,max:rule.max}))]
  openForm(row ? '编辑数据集规划' : '新建数据集', schema, row, data => {
    const project = state.projects.find(p=>p.id===state.activeProject)
    Object.assign(data, { projectId: project.id, project: project.name })
    const candidate = {...row,...data,requiresQuality:true,id:row?.id || uid('dataset'),code:row?.code || nextDatasetCode(state.datasets)}
    if (!checkGovernance('save',{dataset:candidate})) return false
    if (row) Object.assign(row, candidate)
    else { row = {owner:state.role,...candidate,fieldMappings:{},tags:[data.type],created:now()}; state.datasets.unshift(row) }
    state.activeDataset = row.id; notify('数据集规划已保存')
    if (data.status === '建设中') emit('navigate', 'sources')
  })
}
async function removeSource(row) {
  if (!requireAction('edit')) return
  try { await ElMessageBox.confirm(`删除语料“${row.name}”？已有成果记录将保留。`, '删除语料', { type: 'warning' }); await deleteSource(row); notify('语料已删除') } catch (e) { if (e instanceof Error) ElMessage.error(e.message) }
}
function editSource(row) {
  if (!requireAction('edit')) return
  openForm('编辑语料', [{ key: 'name', label: '名称', required: true }, { key: 'content', label: '文本内容', type: 'textarea', rows: 8 }], row, data => { if (!checkGovernance('save')) return false; Object.assign(row, data); notify('语料已更新') })
}
async function upload(event) {
  uploadBusy.value = true
  try { let count = 0; for (const file of event.target.files) { if (await importFile(file)) count++ }; if (count) { notify(`已接入${count}份资料`); importDialog.value = false } }
  catch (e) { ElMessage.error(`导入失败：${e.message}`) }
  finally { uploadBusy.value = false; event.target.value = '' }
}
function importEntries() {
  try {
    const data = JSON.parse(manualText.value)
    const records = Array.isArray(data) ? data : data.records
    if (!Array.isArray(records) || !records.length) throw new Error('请提供非空JSON数组')
    if (!checkGovernance('import',{file:{name:'本地条目数据.json',size:new Blob([manualText.value]).size}}) || !checkGovernance('save')) return
    addVersion(state.activeDataset, records.map(r => ({ ...r, question: r.instruction || r.question || '', answer: r.output || r.answer || '', reference: r.input || r.reference || '' })), '条目导入', '')
    state.sources.unshift({ createdBy:state.role,id: uid('src'), datasetId: state.activeDataset, name: '本地条目数据.json', type: 'JSON', status: '已接入', content: manualText.value, size: manualText.value.length, created: now() })
    importDialog.value = false; notify(`已导入${records.length}条数据`)
  } catch (e) { ElMessage.warning(e.message) }
}
function importDatabase() {
  if (!dbConfig.value.fields.length) return ElMessage.warning('请至少选择一个字段')
  const rows = tableSamples.map(row => Object.fromEntries(dbConfig.value.fields.map(key => [key, row[key]])))
  if (!checkGovernance('import',{file:{name:`${dbConfig.value.table}.json`,size:new Blob([JSON.stringify(rows)]).size}}) || !checkGovernance('save')) return
  state.sources.unshift({ createdBy:state.role,id: uid('src'), datasetId: state.activeDataset, name: `${dbConfig.value.table}.json`, type: 'JSON', status: '已接入', content: JSON.stringify(rows, null, 2), created: now(), size: 450 })
  if (importFields.value.length) addVersion(state.activeDataset,rows,'条目导入','')
  notify('已导入4条记录'); importDialog.value = false
}
function maskSelected() {
  if (!requireAction('edit')) return
  if (!chosen.value.length) return ElMessage.warning('请先勾选语料')
  for (const source of chosen.value) source.content = source.content.replace(/1[3-9]\d{9}/g, '***********').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]+/g, '[邮箱已脱敏]')
  notify(`已对${chosen.value.length}份语料执行脱敏`)
}
function configureTask() {
  if (!requireAction('edit')) return
  const type = tab.value
  if (!selectedSources().length && type !== '图片清洗') return ElMessage.warning('请先导入语料')
  const isVersion = ['问答增强', '自动标注'].includes(type)
  const inputs = type === '图片清洗' ? [{ id: 'demo-images', name: '图片样例（4张）' }, ...selectedSources().filter(s => s.content?.startsWith('data:image/'))] : isVersion ? versions.value.filter(isDatasetVersion) : [...selectedSources(), ...versions.value.filter(v => v.records.some(r => r.content))]
  if (!inputs.length) return ElMessage.warning('请先生成问答成果')
  const schema = [
    { key: 'name', label: '任务名称', required: true, default: `${inputs[0]?.name || '数据集'} · ${type} · ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}` },
    { key: 'sourceId', label: type === '图片清洗' ? '输入图片（可多选）' : isVersion ? '输入成果版本' : '输入语料或上一步成果（可多选）', required: true, type: 'select', multiple: !isVersion, options: inputs.map(s => ({ label: s.records ? `${isDatasetVersion(s) ? `V${s.number} · ` : ''}${s.type} · ${s.created}` : s.name, value: s.id })), default: isVersion ? inputs[0]?.id : [inputs.find(s => s.id === state.focusVersion)?.id || inputs.find(s => s.number)?.id || inputs[0]?.id] },
  ]
  if (type === '图片清洗') schema.push(
    { key: 'rules', label: '清洗步骤', type: 'checks', options: ['重复图片去重', '质量筛选', '格式标准化'], default: ['重复图片去重', '质量筛选', '格式标准化'] },
    { key: 'minWidth', label: '最低宽度（像素）', type: 'number', default: 300 },
    { key: 'minHeight', label: '最低高度（像素）', type: 'number', default: 200 },
    { key: 'minClarity', label: '最低清晰度（0—100）', type: 'number', default: 60, min: 0, max: 100 },
    { key: 'imageFormat', label: '目标格式', type: 'select', options: ['PNG', 'JPEG', 'WEBP'], default: 'PNG' },
    { key: 'maxWidth', label: '输出最大宽度（像素）', type: 'number', default: 600 },
    { key: 'maxHeight', label: '输出最大高度（像素）', type: 'number', default: 600, help: '按比例缩小，不放大。' })
  if (type === '文本清洗') schema.push(
    { key: 'rules', label: '清洗步骤', type: 'checks', options: ['文档去重', '质量过滤', '隐私脱敏', '格式标准化', '移除think标签'], default: ['文档去重', '格式标准化'] },
    { key: 'custom', label: '自定义清洗规则', type: 'textarea' })
  if (type.includes('解析')) schema.push({ key: 'format', label: '输出格式', type: 'select', options: ['Markdown', 'JSON'], default: 'Markdown' },
    { key: 'options', label: '提取选项', type: 'checks', options: type === 'Excel解析' ? ['处理合并单元格', '识别表头', '推断数据类型'] : ['标题与正文', '表格', '公式', '图片', '还原阅读顺序', 'OCR'], default: ['表格', '图片'] })
  if (type === 'Excel解析') schema.push({ key: 'sheets', label: '工作表', default: '全部工作表' })
  if (type === 'PDF解析') schema.push({ key: 'pdfType', label: 'PDF类型', type: 'select', options: ['自动识别', '文本型', '扫描型', '图层型'], default: '自动识别' })
  if (type === '知识片段') schema.push({ key: 'chunkType', label: '切片方式', type: 'select', options: ['固定大小', '分隔符'], default: '固定大小' }, { key: 'size', label: '片段大小（字符）', type: 'number', default: 180, min: 50, max: 5000 }, { key: 'separator', label: '分隔符', default: '\\n\\n' })
  const preference = state.preferences[state.role] || {}
  if (['问答生成','问答增强'].includes(type)) {
    const prompts = preference.audiencePrompts || { 科研人员: '面向科研人员，准确使用专业术语，说明依据与局限。', 初学者: '面向初学者，解释术语，用简明步骤和例子说明。', 专业技术人员: '面向专业技术人员，突出操作方法和适用条件。' }
    const fillPrompt = async (value, form) => {
      const prompt = `${prompts[form.audience] || ''}\n${preference.prompt || '根据参考材料生成准确的结果，保留来源，不编造事实。'}${form.audienceTemplate === '简明表达' ? '\n回答简明，直接给出结论。' : ''}`
      if (form.prompt && form.prompt !== prompt) { try { await ElMessageBox.confirm('使用当前受众与模板重新填充提示词？现有编辑将被替换。', '更新提示词', { type: 'warning' }) } catch { return } }
      form.prompt = prompt
    }
    schema.push({ key:'audience', label:'目标受众', type:'select', options:Object.keys(prompts), default:'科研人员', onChange:fillPrompt }, { key:'audienceTemplate', label:'提示词模板', type:'select', options:['受众默认模板','简明表达'], default:'受众默认模板', onChange:fillPrompt })
  }
  if (/问答|图片描述|自动标注/.test(type)) schema.push({ key: 'model', label: '使用模型', required: true, type: 'select', options: state.models.filter(m => m.status === '已上架').map(m => ({ label: m.name, value: m.id })), default: state.models.find(m => m.status === '已上架')?.id }, { key: 'prompt', label: '任务提示词', type: 'textarea', default: '根据参考材料生成准确的结果，保留来源，不编造事实。' })
  if (type === '问答增强') schema.push( { key: 'style', label: '表达方式', type: 'select', options: ['简明说明', '教学讲解', '专业论述'], default: '简明说明' })
  for (const field of schema) if (Object.hasOwn(preference,field.key)) field.default = JSON.parse(JSON.stringify(preference[field.key]))
  if (['问答生成','问答增强'].includes(type)) {
    const audience = schema.find(f=>f.key==='audience').default
    const audiencePrompt = preference.audiencePrompts?.[audience] || '面向科研人员，准确使用专业术语，说明依据与局限。'
    const prompt = schema.find(f=>f.key==='prompt')
    prompt.default = `${audiencePrompt}\n${prompt.default}`
  }
  openForm(`新建${type}任务`, schema, null, data => {
    let task
    if (type === '图片清洗') {
      if (!data.sourceId?.length) return ElMessage.warning('请选择输入图片')
      task = runTask({ name: data.name, type, sourceId: data.sourceId.find(id => id !== 'demo-images') || 'demo-images', fail: data.fail, config: data })
    } else {
      for (const sourceId of Array.isArray(data.sourceId) ? data.sourceId : [data.sourceId]) task = runTask({ name: data.name, type, sourceId, fail: data.fail, config: data })
    }
    if (task) { detail.value = task; notify('任务已创建') }
  })
}
function addModel(row) {
  if (!requireAction('edit')) return
  openForm(row ? '编辑模型' : '新增模型', [{ key: 'name', label: '模型名称', required: true }, { key: 'address', label: 'API地址', required: true }, { key: 'type', label: '模型类型', type: 'select', options: ['对话模型', '多模态模型'], default: '对话模型' }, { key: 'status', label: '上架状态', type: 'select', options: ['已上架', '已下架'], default: '已上架' }], row ? {...row,address:row.address?.includes('.invalid')?'':row.address} : row, data => { if (row) Object.assign(row, data); else state.models.push({ ...data, id: uid('model') }); notify('模型配置已保存') })
}
function sendChat() {
  if (!chatText.value.trim() || !modelChoice.value) return ElMessage.warning('请选择模型并输入问题')
  chatMessages.value.push({ role: '您', text: chatText.value }, { role: '科研助手', text: '根据参考材料，A组含水率为20%，B组为25%，两组相差5个百分点。尚无作物产量记录，不能推断增产效果。' }); chatText.value = ''
}
async function copy(text) { try { await navigator.clipboard.writeText(text); ElMessage.success('已复制') } catch { ElMessage.warning('浏览器未允许复制，请手动选中文本复制') } }
function clearEvaluationFile() { evaluationFile.value = ''; evaluationRecords.value = []; if (evaluationInput.value) evaluationInput.value.value = '' }
function useEvaluationSample() { evaluationFile.value = '土壤科研问答样例.json'; evaluationRecords.value = qaSamples.map((row, index) => ({ question: row.question, answer: index === 2 ? '本试验没有记录作物产量，无法判断增产效果。' : row.answer })) }
function parseEvaluationCsv(text) {
  const rows = []; let row = [], value = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++ } else quoted = !quoted }
    else if (!quoted && (char === ',' || char === '\n')) { row.push(value); value = ''; if (char === '\n') { rows.push(row); row = [] } }
    else if (char !== '\r') value += char
  }
  if (quoted) throw new Error('CSV引号未闭合')
  row.push(value); if (row.some(cell => cell.trim())) rows.push(row)
  const headers = (rows.shift() || []).map(cell => cell.trim())
  return rows.filter(row => row.some(cell => cell.trim())).map(row => Object.fromEntries(headers.map((key, i) => [key, row[i] || ''])))
}
async function uploadEvaluation(event) {
  const file = event.target.files[0]
  if (!file) return
  try {
    const text = (await file.text()).replace(/^\uFEFF/, '').trim()
    if (!text) throw new Error('文件内容为空')
    const type = file.name.split('.').pop().toLowerCase()
    let rows
    if (type === 'json') { const parsed = JSON.parse(text); rows = Array.isArray(parsed) ? parsed : parsed.records }
    else if (type === 'jsonl') rows = text.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line))
    else if (type === 'csv') rows = parseEvaluationCsv(text)
    else if (type === 'txt') rows = text.split(/\r?\n/).filter(line => line.trim()).map(question => ({ question }))
    else throw new Error('请选择JSON、JSONL、CSV或TXT文件')
    if (!Array.isArray(rows) || !rows.length) throw new Error('文件中没有评测条目')
    const records = rows.map(row => ({ question: row?.question || row?.instruction || row?.prompt || '', answer: row?.answer || row?.output || row?.expected_answer || '' }))
    if (records.some(row => typeof row.question !== 'string' || !row.question.trim() || typeof row.answer !== 'string')) throw new Error('每条数据需要文本类型的question或instruction字段；TXT文件每行一个问题')
    evaluationFile.value = file.name; evaluationRecords.value = records
  } catch (error) { ElMessage.warning(error instanceof SyntaxError ? 'JSON内容格式不正确，请检查文件' : `无法读取评测文件：${error.message}`) }
  finally { event.target.value = '' }
}
async function evaluate() {
  if (!canEvaluate.value || evaluation.value) return
  evaluation.value = true
  const models = availableEvaluationModels.value.filter(model => compareModels.value.includes(model.id))
  const file = evaluationFile.value, samples = evaluationRecords.value.length
  try {
    await new Promise(resolve => setTimeout(resolve, 600))
    state.evaluations = models.map((model, i) => ({ name: model.name, accuracy: 88 - i * 5, completeness: 92 - i * 4, time: `${(1.2 + i * 0.3).toFixed(1)}s`, samples, file }))
  } finally { evaluation.value = false }
}
</script>

<template>
  <section v-if="page === 'processing'" class="panel project-steps"><div class="pipeline-label"><el-icon><Connection /></el-icon>资料加工</div><div class="pipeline-steps"><button v-for="(step,index) in steps" :key="step.title" :class="['pipeline-step',{active:index===stepIndex}]" @click="goStep(step)"><span class="pipeline-icon"><el-icon><component :is="step.icon" /></el-icon></span><span><small>0{{ index+1 }}</small><b>{{ step.title }}</b></span><el-icon v-if="index<steps.length-1" class="step-arrow"><ArrowRight /></el-icon></button></div></section>
  <section v-if="['generation','annotation'].includes(page)" class="annotation-mode-switch"><button :class="{active:annotationMode==='生成数据'}" @click="annotationMode='生成数据'"><el-icon><MagicStick /></el-icon><span><b>生成数据</b><small>文档分块 · 问答 · 图文</small></span></button><button :class="{active:annotationMode==='人工与辅助标注'}" @click="annotationMode='人工与辅助标注'"><el-icon><EditPen /></el-icon><span><b>人工与辅助标注</b><small>问答评价 · 图片区域</small></span></button></section>

  <section v-if="page === 'planning'" class="panel">
    <div class="section-title"><div><h3>数据集建设计划 <span class="count">{{ datasets.length }}</span></h3></div><el-button type="primary" :disabled="!allowed('edit')" @click="editDataset()"><el-icon><Plus /></el-icon>新建数据集</el-button></div>
    <div class="toolbar"><el-input v-model="search" placeholder="搜索数据集名称" clearable><template #prefix><el-icon><Search /></el-icon></template></el-input><span class="muted">共 {{ datasets.length }} 个数据集</span></div>
    <el-table :data="datasets.slice((pageNo - 1) * 8, pageNo * 8)"><el-table-column label="数据集名称" min-width="240"><template #default="{ row }"><div class="name-cell"><span class="file-icon"><el-icon><FolderOpened /></el-icon></span><div><b>{{ row.name }}</b><small>{{ row.scene }}</small></div></div></template></el-table-column><el-table-column label="类型" prop="type" width="100" /><el-table-column label="项目" prop="project" width="110" /><el-table-column label="规划量" width="95"><template #default="{ row }">{{ row.scale }} 条</template></el-table-column><el-table-column label="状态" width="100"><template #default="{ row }"><el-tag>{{ row.status }}</el-tag></template></el-table-column><el-table-column label="操作" width="215"><template #default="{ row }"><el-button link type="primary" @click="detail = row">详情</el-button><el-button link type="primary" :disabled="!allowed('edit', row.id)" @click="editDataset(row)">编辑</el-button><el-button link type="primary" @click="state.activeDataset = row.id; $emit('navigate', 'sources')">接入语料</el-button></template></el-table-column></el-table>
    <el-pagination v-model:current-page="pageNo" :page-size="8" :total="datasets.length" layout="total, prev, pager, next" />
  </section>

  <section v-if="page === 'sources'" class="panel">
    <div class="section-title"><div><h3>项目资料 <span class="count">{{ selectedSources().length }}</span></h3></div><el-button type="primary" :disabled="!allowed('edit')" @click="importDialog = true"><el-icon><Upload /></el-icon>接入数据</el-button></div>
    <div class="toolbar"><el-input v-model="search" placeholder="搜索文件名称" clearable><template #prefix><el-icon><Search /></el-icon></template></el-input><el-select v-model="statusFilter"><el-option v-for="s in ['全部状态', '待处理', '待解析', '已解析', '已处理', '待标注', '已接入']" :key="s" :value="s" /></el-select><el-button :disabled="!chosen.length || !allowed('edit')" @click="maskSelected">批量脱敏</el-button><span class="toolbar-spacer"></span><span class="muted">已选 {{ chosen.length }} 项</span></div>
    <el-table :data="sourceRows.slice((pageNo - 1) * 8, pageNo * 8)" @selection-change="chosen = $event" row-key="id"><el-table-column type="selection" width="45" /><el-table-column label="文件名称" min-width="250"><template #default="{ row }"><div class="name-cell"><span class="file-icon"><el-icon><Document /></el-icon></span><div><b>{{ row.name }}</b><small>{{ row.created }}</small></div></div></template></el-table-column><el-table-column label="格式" width="80"><template #default="{ row }"><span class="format-tag">{{ row.type }}</span></template></el-table-column><el-table-column label="大小" width="100"><template #default="{ row }">{{ ((row.size || 0) / 1024).toFixed(1) }} KB</template></el-table-column><el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="row.status.startsWith('待') ? 'warning' : 'success'">{{ row.status }}</el-tag></template></el-table-column><el-table-column label="操作" width="230"><template #default="{ row }"><el-button link type="primary" @click="detail = row; previewTab = '内容'">预览</el-button><el-button link type="primary" :disabled="!allowed('edit')" @click="editSource(row)">编辑</el-button><el-button link type="primary" :disabled="!allowed('edit')" @click="$emit('navigate', 'processing')">解析 / 清洗</el-button><el-button link type="danger" :disabled="!allowed('edit')" @click="removeSource(row)">删除</el-button></template></el-table-column></el-table><el-pagination v-model:current-page="pageNo" :page-size="8" :total="sourceRows.length" layout="total, prev, pager, next" />
  </section>

  <template v-if="page === 'processing' || (['generation','annotation'].includes(page) && annotationMode === '生成数据')">
    <section class="panel"><el-tabs v-model="tab"><el-tab-pane v-for="name in page === 'processing' ? processingTabs : ['知识片段', '问答生成', '问答增强', '图片描述', '图片问答']" :key="name" :name="name"><template #label><span class="icon-tab"><el-icon><component :is="featureIcons[name]" /></el-icon>{{ name }}</span></template></el-tab-pane></el-tabs>
      <div class="feature-intro"><span class="feature-icon"><el-icon><component :is="featureIcons[tab]" /></el-icon></span><div><h3>{{ tab }}</h3></div><el-button type="primary" :disabled="!allowed('edit')" @click="configureTask"><el-icon><Plus /></el-icon>新建{{ tab }}任务</el-button></div>
    </section>
    <section class="panel"><div class="section-title"><h3>任务记录 <span class="count">{{ tasks.length }}</span></h3><el-button link type="primary" @click="$emit('navigate', 'versions')">查看加工成果<el-icon><ArrowRight /></el-icon></el-button></div><div class="toolbar"><el-input v-model="search" placeholder="搜索任务名称" clearable /><el-select v-model="statusFilter"><el-option v-for="s in ['全部状态', '执行中', '已完成', '失败']" :key="s" :value="s" /></el-select></div><el-table :data="tasks.slice((pageNo - 1) * 8, pageNo * 8)" empty-text="尚无任务，点击上方按钮创建"><el-table-column label="任务名称" prop="name" min-width="210" /><el-table-column label="类型" prop="type" width="115" /><el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="row.status === '已完成' ? 'success' : row.status === '失败' ? 'danger' : 'primary'">{{ row.status }}</el-tag></template></el-table-column><el-table-column label="处理进度" width="180"><template #default="{ row }"><el-progress :percentage="row.progress" :status="row.status === '失败' ? 'exception' : undefined" /></template></el-table-column><el-table-column label="创建时间" prop="created" min-width="170" /><el-table-column label="操作" width="180"><template #default="{ row }"><el-button link type="primary" @click="detail = row">详情</el-button><el-button v-if="row.versionId" link type="primary" @click="state.focusVersion = row.versionId; $emit('navigate', 'versions')">成果</el-button><el-button v-if="row.status === '失败'" link type="primary" @click="detail = runTask({ ...JSON.parse(JSON.stringify(row)), id: uid('task'), fail: false })">重试</el-button></template></el-table-column></el-table><el-pagination v-model:current-page="pageNo" :page-size="8" :total="tasks.length" layout="total, prev, pager, next" /></section>
  </template>

  <AnnotationPanel v-if="['generation','annotation'].includes(page)" v-show="annotationMode === '人工与辅助标注'" @navigate="$emit('navigate', $event)" />

  <section v-if="page === 'models'" class="panel"><el-tabs v-if="!modelSection" v-model="tab"><el-tab-pane v-for="name in ['模型配置', '模型试用', '模型评测']" :key="name" :label="name" :name="name" /></el-tabs>
    <template v-if="tab === '模型配置'"><div class="section-title"><div v-if="!modelSection"><h3>可用模型</h3></div><span v-else class="muted">{{ state.models.length }} 个模型</span><el-button type="primary" :disabled="!allowed('edit')" @click="addModel()"><el-icon><Plus /></el-icon>新增模型</el-button></div><el-table :data="state.models"><el-table-column label="模型名称" prop="name" /><el-table-column label="服务地址" min-width="230"><template #default="{row}">{{ row.address?.includes('.invalid')?'—':row.address || '—' }}</template></el-table-column><el-table-column label="类型" prop="type" /><el-table-column label="状态" prop="status" /><el-table-column label="操作"><template #default="{ row }"><el-button link type="primary" :disabled="!allowed('edit')" @click="addModel(row)">编辑</el-button></template></el-table-column></el-table></template>
    <template v-if="tab === '模型试用'"><div class="toolbar"><el-select v-model="modelChoice" placeholder="选择模型"><el-option v-for="model in state.models.filter(m => m.status === '已上架')" :key="model.id" :label="model.name" :value="model.id" /></el-select></div><div class="chat-window"><el-empty v-if="!chatMessages.length" description="输入问题，体验模型问答界面" /><div v-for="(message, i) in chatMessages" :key="i" class="chat-message" :class="{ user: message.role === '您' }"><b>{{ message.role }}</b><p>{{ message.text }}</p><el-button link size="small" @click="copy(message.text)">复制内容</el-button></div></div><div class="chat-input"><el-input v-model="chatText" placeholder="输入您的问题" @keyup.enter="sendChat" /><el-button type="primary" @click="sendChat">发送</el-button></div></template>
    <template v-if="tab === '模型评测'">
      <div class="evaluation-setup">
        <section class="evaluation-data"><div class="section-title"><h3><el-icon><Document /></el-icon>评测内容</h3><el-button link type="primary" :disabled="evaluation" @click="useEvaluationSample">使用问答样例</el-button></div>
          <input ref="evaluationInput" type="file" accept=".json,.jsonl,.csv,.txt" hidden :disabled="evaluation" @change="uploadEvaluation" />
          <button class="evaluation-upload" :disabled="evaluation" @click="evaluationInput?.click()"><el-icon><UploadFilled /></el-icon><b>{{ evaluationFile ? '重新选择文件' : '选择评测文件' }}</b><span>JSON / JSONL / CSV / TXT</span></button>
          <div v-if="evaluationFile" class="evaluation-file"><el-icon><Document /></el-icon><span><b>{{ evaluationFile }}</b><small>{{ evaluationRecords.length }} 条评测内容</small></span><el-button text :disabled="evaluation" aria-label="移除评测文件" @click="clearEvaluationFile"><el-icon><Close /></el-icon></el-button></div>
        </section>
        <section class="evaluation-models"><div class="section-title"><h3><el-icon><Cpu /></el-icon>评测模型</h3><span>{{ compareModels.filter(id => availableEvaluationModels.some(model => model.id === id)).length }} 个已选</span></div>
          <el-checkbox-group v-model="compareModels" :disabled="evaluation" class="evaluation-model-list"><el-checkbox v-for="model in availableEvaluationModels" :key="model.id" :value="model.id" border><span class="evaluation-model-icon"><el-icon><Cpu /></el-icon></span><span><b>{{ model.name }}</b><small>{{ model.type }}</small></span></el-checkbox></el-checkbox-group><el-empty v-if="!availableEvaluationModels.length" :image-size="50" description="请先在模型配置中添加并上架模型" />
        </section>
      </div>
      <section v-if="evaluationRecords.length" class="evaluation-preview"><div class="section-title"><h3><el-icon><View /></el-icon>内容预览</h3><span>前 {{ Math.min(3, evaluationRecords.length) }} 条</span></div><el-table :data="evaluationRecords.slice(0,3)"><el-table-column type="index" label="序号" width="65" /><el-table-column prop="question" label="问题" min-width="230" show-overflow-tooltip /><el-table-column prop="answer" label="参考答案" min-width="280" show-overflow-tooltip><template #default="{row}">{{ row.answer || '未提供' }}</template></el-table-column></el-table></section>
      <div class="evaluation-actions"><el-button type="primary" :disabled="!canEvaluate" :loading="evaluation" @click="evaluate"><el-icon v-if="!evaluation"><DataAnalysis /></el-icon>{{ evaluation ? '正在评测' : '开始评测' }}</el-button></div>
      <section class="evaluation-results"><div class="section-title"><h3><el-icon><DataAnalysis /></el-icon>模型对比</h3></div><el-table v-if="evaluationResults.length" :data="evaluationResults"><el-table-column label="模型" prop="name" min-width="180" /><el-table-column label="准确性" min-width="170"><template #default="{row}"><el-progress :percentage="row.accuracy" :stroke-width="7" /></template></el-table-column><el-table-column label="完整性" min-width="170"><template #default="{row}"><el-progress :percentage="row.completeness" :stroke-width="7" color="#38a78c" /></template></el-table-column><el-table-column label="平均响应耗时" prop="time" min-width="140" /><el-table-column label="评测条数" prop="samples" width="100" /></el-table><el-empty v-else :image-size="65" description="选择评测内容和模型后，开始评测" /></section>
    </template>
  </section>

  <FormDialog v-model="dialog" :assist="dialogTitle === '新建数据集' ? { name: '土壤科研问答数据集', scene: '土壤环境科研问答', demand: '将试验报告与采样记录加工为可追溯的问答数据。', quality: '数值准确；保留参考材料；不编造产量结论', source: '试验报告与采样记录' } : undefined" :title="dialogTitle" :fields="fields" :initial="initial" @save="saveForm" />
  <input ref="fileInput" type="file" multiple hidden @change="upload" />
  <el-dialog v-model="importDialog" title="接入数据" width="760"><el-collapse v-if="importFields.length" class="import-field-mapping"><el-collapse-item name="mapping"><template #title><el-icon><Connection /></el-icon>字段映射 · {{ state.fieldTemplates.find(item=>item.id===currentDataset.fieldTemplateId)?.name }}</template><el-form label-position="top" class="two-cols"><el-form-item v-for="field in importFields" :key="field.id" :label="`${field.name} (${field.field})${field.unit ? ' · '+field.unit : ''}`"><el-input v-model="currentDataset.fieldMappings[field.field]" :disabled="currentDataset.storageState==='已归档'" :placeholder="field.field" /></el-form-item></el-form></el-collapse-item></el-collapse><el-tabs v-model="importTab"><el-tab-pane v-for="name in ['文件上传', '条目导入', 'SDK导入', 'MySQL接入']" :key="name" :label="name" :name="name" /></el-tabs><template v-if="importTab === '文件上传'"><button class="upload-zone" :disabled="uploadBusy" @click="fileInput.click()"><el-icon><UploadFilled /></el-icon><h3>{{ uploadBusy ? '正在导入…' : '点击选择本地资料' }}</h3><p>支持文档、表格、图片和JSON条目数据</p></button></template><template v-if="importTab === '条目导入'"><el-input v-model="manualText" type="textarea" :rows="9" placeholder='[{"question":"采样深度是多少？","answer":"0—20厘米"}]' /><div class="dialog-actions"><el-button type="primary" @click="importEntries">导入条目</el-button></div></template><template v-if="importTab === 'SDK导入'"><pre>{{ sdkCode }}</pre><el-button @click="copy(sdkCode)">复制示例</el-button><el-button type="primary" @click="manualText = JSON.stringify([{ question: '采样深度是多少？', answer: '0—20厘米' }]); importEntries()">导入样例</el-button></template><template v-if="importTab === 'MySQL接入'"><el-form label-position="top" class="dialog-form"><div class="two-cols"><el-form-item label="Host与Port"><el-input v-model="dbConfig.host" /></el-form-item><el-form-item label="用户名"><el-input v-model="dbConfig.username" /></el-form-item></div><el-button @click="databaseConnected = Boolean(dbConfig.host && dbConfig.username)">查看数据表</el-button><el-tag v-if="databaseConnected" type="success">已载入数据表</el-tag><template v-if="databaseConnected"><div class="two-cols"><el-form-item label="数据库"><el-input v-model="dbConfig.database" /></el-form-item><el-form-item label="数据表"><el-input v-model="dbConfig.table" /></el-form-item></div><el-form-item label="选择字段"><el-checkbox-group v-model="dbConfig.fields"><el-checkbox v-for="key in Object.keys(tableSamples[0])" :key="key" :value="key">{{ key }}</el-checkbox></el-checkbox-group></el-form-item><el-form-item label="筛选条件"><el-input v-model="dbConfig.condition" placeholder="例如 sampling_depth > 0" /></el-form-item><el-table :data="tableSamples"><el-table-column v-for="key in dbConfig.fields" :key="key" :label="key" :prop="key" /></el-table><el-button type="primary" @click="importDatabase">导入记录</el-button></template></el-form></template></el-dialog>
  <el-drawer :model-value="Boolean(detail)" :title="detail?.name || '详情'" size="620" @close="detail = null"><template v-if="detail"><el-descriptions :column="1" border><el-descriptions-item v-for="key in ['code','name','type','status','created','createdBy','operator','size','industry','scene','quality','source','format','scale','project','level','demand','progress'].filter(k => detail[k]!==undefined && typeof detail[k] !== 'object')" :key="key" :label="({code:'数据集编号',industry:'所属领域',name:'名称',type:'类型',status:'状态',created:'创建时间',size:'大小',scene:'场景',quality:'质量要求',source:'来源',format:'格式',scale:'量级',project:'项目',level:'等级',demand:'需求',sourceId:'来源编号',versionId:'成果编号',progress:'进度',createdBy:'操作人',operator:'操作人'})[key] || key">{{ detail[key] }}</el-descriptions-item></el-descriptions><template v-if="detail.logs"><h3>执行日志</h3><pre>{{ detail.logs.filter(line=>!line.includes('质量与尺寸为演示信息')).map(line=>line.replaceAll('（模拟）','').replace('已载入演示材料','已载入材料').replace('模拟失败：','').replace('取消模拟失败后可重试。','请检查资料后重试。')).join('\n') }}</pre><el-button v-if="detail.versionId" type="primary" @click="state.focusVersion = detail.versionId; detail = null; $emit('navigate', 'versions')">查看输出成果</el-button><el-button v-if="detail.status === '已完成'" type="primary" @click="continueTask(detail)"><el-icon><ArrowRight /></el-icon>{{ detail.type.includes('解析') ? '使用结果继续清洗' : detail.type.includes('清洗') ? '开始标注' : '检查与导出' }}</el-button></template><template v-else-if="detail.content"><h3>原始内容</h3><img v-if="detail.content.startsWith('data:image')" :src="detail.content" class="preview-image" /><pre v-else>{{ detail.content }}</pre></template><el-empty v-else-if="detail.hasFile" description="暂无内容预览" /><el-button v-if="detail.hasFile && allowed('edit')" @click="downloadSource(detail)">查看原始文件</el-button></template></el-drawer>
</template>
