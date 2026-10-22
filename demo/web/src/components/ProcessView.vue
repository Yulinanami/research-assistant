<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Files, ChatDotRound, MagicStick, View, ChatLineSquare } from '@element-plus/icons-vue'
import { state, selectedSources, selectedVersions, requireAction, notify, importFile, runTask, addVersion, allowed, downloadSource, deleteSource, projectDatasets, createDataset, taskName, updateSource } from '../store'
import { uid, now, isDatasetVersion } from '../domain'
import { tableSamples } from '../data'
import { parserType, preparationInputs } from '../workflow'
import { parseEntries } from '../imports'
import FormDialog from './FormDialog.vue'
import AnnotationPanel from './AnnotationPanel.vue'

const featureIcons = {
  '知识片段': Files, '问答生成': ChatDotRound, '图片描述': View, '图片问答': ChatLineSquare,
}

const props = defineProps({ page: String })
const emit = defineEmits(['navigate'])
const search = ref(state.ui[props.page]?.search || '')
const statusFilter = ref(state.ui[props.page]?.status || '全部状态')
const pageNo = ref(state.ui[props.page]?.pageNo || 1)
const tab = ref({ generation: state.ui.pipeline?.datasetId === state.activeDataset ? state.ui.pipeline.generationType || '知识片段' : '知识片段', annotation: '问答标注', models: '模型配置' }[props.page] || '')
if (props.page === 'generation' && tab.value === '问答增强') tab.value = '问答生成'
const sourceRows = computed(() => selectedSources().filter(s => s.name.includes(search.value) && (statusFilter.value === '全部状态' || s.status === statusFilter.value)))
const datasets = computed(() => projectDatasets().filter(d => d.name.includes(search.value)))
const tasks = computed(() => state.tasks.filter(t => t.datasetId === state.activeDataset && t.name.includes(search.value) && (statusFilter.value === '全部状态' || t.status === statusFilter.value) && (props.page === 'sources' ? /解析/.test(t.type) : /问答|片段|图片描述/.test(t.type))))
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
const sdkCode = `# 接口演示，未连接后端\nPOST /api/datasets/{datasetId}/sources\nContent-Type: application/json\n{ "name": "采样记录", "records": [...] }`
const chatText = ref('')
const chatMessages = computed(() => state.conversations)
const modelChoice = ref(state.models[0]?.id || '')
const evaluation = ref(false)
const evaluationResults = computed(() => state.evaluations)
const evaluationFile = ref('')
const compareModels = ref(state.models.map(m => m.id))
const uploadBusy = ref(false)
const previewTab = ref('内容')
watch([search, statusFilter, () => state.activeDataset], () => { pageNo.value = 1 })
watch([search, statusFilter, pageNo], () => { state.ui[props.page] = { search: search.value, status: statusFilter.value, pageNo: pageNo.value } })
watch(() => state.activeDataset, () => {
  dialog.value = false; detail.value = null; chosen.value = []
  if (props.page === 'generation') tab.value = state.ui.pipeline?.datasetId === state.activeDataset ? state.ui.pipeline.generationType || '知识片段' : '知识片段'
})

function openForm(title, schema, data, handler) { dialogTitle.value = title; fields.value = schema; initial.value = data || {}; saveHandler = handler; dialog.value = true }
function saveForm(data) { if (saveHandler(data) !== false) dialog.value = false }
const datasetFields = [
  { key: 'name', label: '数据集名称', required: true }, { key: 'type', label: '数据类型', type: 'select', options: ['文本', '图片', '问答对'], default: '问答对', required: true },
  { key: 'scene', label: '使用场景', required: true }, { key: 'demand', label: '业务需求', type: 'textarea', required: true }, { key: 'quality', label: '内容质量要求', type: 'textarea', default: '来源可追溯，内容准确完整' },
  { key: 'exportFormat', label: '导出文件格式', type:'select', options:['JSON','JSONL','Markdown'], default:'JSON' }, {key:'recordSchema',label:'记录结构要求',type:'select',options:['原始结构','Alpaca','ShareGPT'],default:'原始结构'}, { key: 'scale', label: '规划数据量（条）', type: 'number', default: 100 },
  { key: 'source', label: '数据来源' }, {key:'tagsText',label:'数据集检索标签（逗号分隔）',help:'用于目录和广场检索，与逐条数据的标注标签分别保存。'}, { key: 'level', label: '数据等级', type: 'select', options: ['公开', '内部'], default: '内部' },
  { key: 'status', label: '保存方式', type: 'select', options: ['草稿', '建设中'], default: '草稿', help: '选择“建设中”将提交规划并进入语料接入。' },
]
function editDataset(row) {
  if (!requireAction('edit', row?.id)) return
  const metadataFields = state.terms.filter(term => term.scope === 'dataset' && term.field !== 'dataset_code')
  const schema = [...datasetFields, ...metadataFields.map(term => ({key:`meta_${term.field}`,label:term.name,help:term.description,required:term.required,type:term.type === '数值' ? 'number' : term.type === '枚举' ? 'select' : 'text',options:(term.enumValues || '').split(/[,，]/).map(value=>value.trim()).filter(Boolean)}))]
  const initial = row ? {...row,tagsText:row.tags.join('，'),...Object.fromEntries(metadataFields.map(term=>[`meta_${term.field}`,row.metadata?.[term.field] ?? '']))} : {}
  openForm(row ? '编辑数据集规划' : '新建数据集', schema, initial, data => {
    data.metadata = { ...row?.metadata, ...Object.fromEntries(metadataFields.map(term=>[term.field,data[`meta_${term.field}`]])) }
    for (const term of metadataFields) delete data[`meta_${term.field}`]
    data.tags = (data.tagsText || data.type).split(/[,，]/).map(tag=>tag.trim()).filter(Boolean); delete data.tagsText
    data.format = `${data.exportFormat} · ${data.recordSchema}`
    if (row) Object.assign(row, data)
    else row = createDataset(data)
    if (!row) return false
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
  const schema = [{ key: 'name', label: '名称', required: true }]
  if (!parserType(row) && !row.content?.startsWith('data:image/')) schema.push({ key: 'content', label: '文本内容', type: 'textarea', rows: 8 })
  openForm('编辑语料', schema, row, data => {
    try { if (!updateSource(row, data)) return false; notify('语料已更新') }
    catch (error) { ElMessage.warning(error.message); return false }
  })
}
async function upload(event) {
  uploadBusy.value = true
  const datasetId = state.activeDataset
  let imported = 0
  try { for (const file of event.target.files) { await importFile(file, datasetId); imported++ } notify(`已接入 ${imported} 个文件`); importDialog.value = false }
  catch (e) { ElMessage.error(`已接入 ${imported} 个文件；当前文件导入失败：${e.message}`) }
  finally { uploadBusy.value = false; event.target.value = '' }
}
function importEntries() {
  if (!requireAction('edit')) return
  try {
    const records = parseEntries(manualText.value)
    const source = { id: uid('src'), projectId:state.activeProjectId, datasetId: state.activeDataset, name: '本地条目数据.json', type: 'JSON', status: '已接入', content: JSON.stringify(records), size: new Blob([manualText.value]).size, created: now() }
    const version = addVersion(state.activeDataset, records, '条目导入', source.id)
    source.importedVersionId = version.id
    state.sources.unshift(source)
    importDialog.value = false; notify(`已导入${records.length}条数据`)
  } catch (e) { ElMessage.warning(e.message) }
}
function importDatabase() {
  if (!requireAction('edit')) return
  if (!dbConfig.value.fields.length) return ElMessage.warning('请至少选择一个字段')
  const rows = tableSamples.map(row => Object.fromEntries(dbConfig.value.fields.map(key => [key, row[key]])))
  state.sources.unshift({ id: uid('src'), projectId:state.activeProjectId, datasetId: state.activeDataset, name: `${dbConfig.value.table}.json`, type: 'JSON', status: '已接入', content: JSON.stringify(rows, null, 2), created: now(), size: 450 })
  notify('已导入4条模拟数据库记录'); importDialog.value = false
}
function handoffSources(rows) {
  const prepared = preparationInputs(selectedSources(), selectedVersions(), state.activeDataset)
  state.ui.pipeline = { datasetId: state.activeDataset, inputIds: rows.map(row => prepared.find(input => input.originId === row.id)?.id || row.id) }
  state.ui.preprocessingStage = 'parsing'
  emit('navigate', 'processing')
}
function configureTask(typeOverride, inputIds) {
  if (props.page !== 'generation' || !requireAction('edit')) return
  const type = typeof typeOverride === 'string' ? typeOverride : tab.value
  const isVersion = type === '问答增强'
  const imageTask = ['图片描述', '图片问答'].includes(type)
  const prepared = preparationInputs(selectedSources(), selectedVersions(), state.activeDataset)
  const candidates = type.includes('解析') ? selectedSources().filter(source => parserType(source) === type)
    : isVersion ? versions.value.filter(isDatasetVersion)
    : [...prepared.filter(input => input.ready && input.kind === (imageTask ? 'image' : 'text')),
      ...versions.value.filter(version => version.records.some(record => record.status !== '过滤' && (imageTask ? record.image?.startsWith('data:image/') : record.content)))]
  const inputs = [...new Map(candidates.map(input => [input.id, input])).values()]
  if (!inputs.length) return ElMessage.warning(type.includes('解析') ? '没有此类型的文档' : '请先接入或处理对应类型的资料')
  const handoff = state.ui.pipeline
  const preferred = inputIds || (handoff?.datasetId === state.activeDataset ? handoff.inputIds : [])
  const selected = inputs.filter(input => preferred.includes(input.id)).map(input => input.id)
  const schema = [
    { key: 'name', label: '任务名称', required: true, default: taskName(type) },
    { key: 'sourceId', label: isVersion ? '输入成果版本' : '输入资料或上一步成果', required: true, type: 'select', multiple: !isVersion,
      options: inputs.map(input => ({ label: input.records ? `${isDatasetVersion(input) ? `V${input.number} · ` : ''}${input.type} · ${input.created}` : input.name, value: input.id })),
      default: isVersion ? selected[0] || inputs[0].id : selected.length ? selected : [inputs[0].id] },
  ]
  if (type.includes('解析')) schema[1].help = `使用设置中的解析配置：${state.settings.parsing.format}；${state.settings.parsing.options.join('、')}。可在右上角设置中调整。`
  if (type === '知识片段') schema.push({ key: 'chunkType', label: '切片方式', type: 'select', options: ['固定大小', '分隔符'], default: '固定大小' }, { key: 'size', label: '片段大小（字符）', type: 'number', default: 180, min: 50, max: 5000 }, { key: 'separator', label: '分隔符', default: '\\n\\n' })
  if (/问答|图片描述/.test(type)) schema.push({ key: 'model', label: '使用模型', required: true, type: 'select', options: state.models.filter(model => model.status === '已上架').map(model => ({ label: model.name, value: model.id })), default: state.models.find(model => model.status === '已上架')?.id }, { key: 'prompt', label: '任务提示词', type: 'textarea', default: '根据参考材料生成准确的结果，保留来源，不编造事实。' })
  if (type === '问答增强') schema.push({ key: 'audience', label: '目标受众', type: 'select', options: ['科研人员', '初学者', '专业技术人员'], default: '科研人员' }, { key: 'style', label: '表达方式', type: 'select', options: ['简明说明', '教学讲解', '专业论述'], default: '简明说明' })
  schema.push({ key: 'fail', label: '演示失败状态', type: 'switch', default: false })
  openForm(`新建${type}任务`, schema, null, data => {
    const ids = Array.isArray(data.sourceId) ? data.sourceId : [data.sourceId]
    if (!ids.length) { ElMessage.warning('请选择输入资料'); return false }
    let task
    for (const sourceId of ids) task = runTask({ name: data.name, type, sourceId, fail: data.fail, config: type.includes('解析') ? {...state.settings.parsing,...data} : data })
    if (task) { detail.value = task; notify('任务已创建，正在模拟处理') }
  })
}
function addModel(row) {
  if (!requireAction('edit')) return
  openForm(row ? '编辑模型' : '新增模型', [{ key: 'name', label: '模型名称', required: true }, { key: 'address', label: 'API地址（演示）', required: true, default: 'https://example.invalid/v1' }, { key: 'type', label: '模型类型', type: 'select', options: ['对话模型', '多模态模型'], default: '对话模型' }, { key: 'status', label: '上架状态', type: 'select', options: ['已上架', '已下架'], default: '已上架' }], row, data => { if (row) Object.assign(row, data); else state.models.push({ ...data, id: uid('model') }); notify('模型配置已保存') })
}
function sendChat() {
  if (!chatText.value.trim() || !modelChoice.value) return ElMessage.warning('请选择模型并输入问题')
  chatMessages.value.push({ role: '您', text: chatText.value }, { role: '科研助手 · 模拟回答', text: '根据演示材料，A组含水率为20%，B组为25%，两组相差5个百分点。尚无作物产量记录，不能推断增产效果。' }); chatText.value = ''
}
async function copy(text) { try { await navigator.clipboard.writeText(text); ElMessage.success('已复制') } catch { ElMessage.warning('浏览器未允许复制，请手动选中文本复制') } }
function evaluate() { if (!compareModels.value.length || !evaluationFile.value) return ElMessage.warning('请先上传评测内容并选择模型'); evaluation.value = true; state.evaluations = compareModels.value.map((id, i) => ({ name: state.models.find(m => m.id === id)?.name, accuracy: 88 - i * 5, completeness: 92 - i * 4, time: `${1.2 + i * 0.3}s`, samples: 3 })); evaluation.value = false }
</script>

<template>

  <section v-if="page === 'planning'" class="panel">
    <div class="section-title"><div><h3>数据集建设计划 <span class="count">{{ datasets.length }}</span></h3><p>定义数据需求与质量要求，按步骤推进建设</p></div><el-button type="primary" :disabled="!allowed('edit')" @click="editDataset()"><el-icon><Plus /></el-icon>新建数据集</el-button></div>
    <div class="toolbar"><el-input v-model="search" placeholder="搜索数据集名称" clearable><template #prefix><el-icon><Search /></el-icon></template></el-input><span class="muted">共 {{ datasets.length }} 个数据集</span></div>
    <el-table :data="datasets.slice((pageNo - 1) * 8, pageNo * 8)"><el-table-column label="数据集名称" min-width="240"><template #default="{ row }"><div class="name-cell"><span class="file-icon"><el-icon><FolderOpened /></el-icon></span><div><b>{{ row.name }}</b><small>{{ row.scene }}</small></div></div></template></el-table-column><el-table-column label="类型" prop="type" width="100" /><el-table-column label="项目" prop="project" width="110" /><el-table-column label="规划量" width="95"><template #default="{ row }">{{ row.scale }} 条</template></el-table-column><el-table-column label="状态" width="100"><template #default="{ row }"><el-tag>{{ row.status }}</el-tag></template></el-table-column><el-table-column label="操作" width="215"><template #default="{ row }"><el-button link type="primary" @click="detail = row">详情</el-button><el-button link type="primary" :disabled="!allowed('edit', row.id)" @click="editDataset(row)">编辑</el-button><el-button link type="primary" @click="state.activeDataset = row.id; $emit('navigate', 'sources')">接入语料</el-button></template></el-table-column></el-table>
    <el-pagination v-model:current-page="pageNo" :page-size="8" :total="datasets.length" layout="total, prev, pager, next" />
  </section>

  <section v-if="page === 'sources'" class="panel">
    <div class="section-title"><div><h3>语料库 <span class="count">{{ selectedSources().length }}</span></h3><p>统一导入、预览与管理资料；解析和清洗在数据预处理中完成</p></div><el-button type="primary" :disabled="!allowed('edit')" @click="importDialog = true"><el-icon><Upload /></el-icon>接入数据</el-button></div>
    <div class="toolbar"><el-input v-model="search" placeholder="搜索文件名称" clearable><template #prefix><el-icon><Search /></el-icon></template></el-input><el-select v-model="statusFilter"><el-option v-for="s in ['全部状态', '待处理', '待解析', '解析中', '解析失败', '已解析', '已处理', '待标注', '已接入']" :key="s" :value="s" /></el-select><el-button :disabled="!chosen.length || !allowed('edit')" @click="handoffSources(chosen)">进入预处理</el-button><span class="toolbar-spacer"></span><span class="muted">已选 {{ chosen.length }} 项</span></div>
    <el-table :data="sourceRows.slice((pageNo - 1) * 8, pageNo * 8)" @selection-change="chosen = $event" row-key="id"><el-table-column type="selection" width="45" /><el-table-column label="文件名称" min-width="250"><template #default="{ row }"><div class="name-cell"><span class="file-icon"><el-icon><Document /></el-icon></span><div><b>{{ row.name }}</b><small>{{ row.created }}</small></div></div></template></el-table-column><el-table-column label="格式" width="80"><template #default="{ row }"><span class="format-tag">{{ row.type }}</span></template></el-table-column><el-table-column label="大小" width="100"><template #default="{ row }">{{ ((row.size || 0) / 1024).toFixed(1) }} KB</template></el-table-column><el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="row.status.startsWith('待') ? 'warning' : 'success'">{{ row.status }}</el-tag></template></el-table-column><el-table-column label="操作" width="310"><template #default="{ row }"><el-button link type="primary" @click="detail = row; previewTab = '内容'">预览</el-button><el-button link type="primary" :disabled="!allowed('edit')" @click="editSource(row)">编辑</el-button><el-button link type="primary" :disabled="!allowed('edit')" @click="handoffSources([row])">预处理</el-button><el-button link type="danger" :disabled="!allowed('edit')" @click="removeSource(row)">删除</el-button></template></el-table-column></el-table><el-pagination v-model:current-page="pageNo" :page-size="8" :total="sourceRows.length" layout="total, prev, pager, next" />
  </section>

  <template v-if="page === 'generation'">
    <section v-if="page === 'generation'" class="panel"><el-tabs v-model="tab"><el-tab-pane v-for="name in ['知识片段', '问答生成', '图片描述', '图片问答']" :key="name" :name="name" :label="name" /></el-tabs>
      <div class="feature-intro"><span class="feature-icon"><el-icon><component :is="featureIcons[tab]" /></el-icon></span><div><h3>{{ tab }}</h3><p>{{ tab === '知识片段' ? '按片段大小或分隔符组织文档内容，保留文档名称和来源。' : tab === '图片清洗' ? '筛选重复、低分辨率和模糊图片，配置统一格式与尺寸，查看保留结果和过滤原因。' : tab === '文本清洗' ? '配置去重、脱敏、标准化等规则，查看处理前后的变化。' : tab.includes('解析') ? '提取标题、正文、表格、图片等内容，统一输出Markdown或JSON。' : '选择资料与模型，设置提示词，生成并修改数据成果。' }}</p><span class="inline-hint">模拟处理 · 结果可在成果与版本管理中查看</span></div><el-button type="primary" :disabled="!allowed('edit')" @click="configureTask"><el-icon><Plus /></el-icon>新建{{ tab }}任务</el-button></div>
    </section>
    <section class="panel"><div class="section-title"><h3>任务记录 <span class="count">{{ tasks.length }}</span></h3><el-button link type="primary" @click="$emit('navigate', 'versions')">查看加工成果<el-icon><ArrowRight /></el-icon></el-button></div><div class="toolbar"><el-input v-model="search" placeholder="搜索任务名称" clearable /><el-select v-model="statusFilter"><el-option v-for="s in ['全部状态', '执行中', '已完成', '失败']" :key="s" :value="s" /></el-select></div><el-table :data="tasks.slice((pageNo - 1) * 8, pageNo * 8)" :empty-text="page === 'sources' ? '暂无解析任务，可在语料列表中选择文档解析' : '尚无任务，点击上方按钮创建'"><el-table-column label="任务名称" prop="name" min-width="210" /><el-table-column label="类型" prop="type" width="115" /><el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="row.status === '已完成' ? 'success' : row.status === '失败' ? 'danger' : 'primary'">{{ row.status }}</el-tag></template></el-table-column><el-table-column label="处理进度" width="180"><template #default="{ row }"><el-progress :percentage="row.progress" :status="row.status === '失败' ? 'exception' : undefined" /></template></el-table-column><el-table-column label="创建时间" prop="created" min-width="170" /><el-table-column label="操作" width="180"><template #default="{ row }"><el-button link type="primary" @click="detail = row">详情</el-button><el-button v-if="row.versionId" link type="primary" @click="state.focusVersion = row.versionId; $emit('navigate', 'versions')">成果</el-button><el-button v-if="row.status === '失败'" link type="primary" @click="detail = runTask({ ...JSON.parse(JSON.stringify(row)), id: uid('task'), fail: false })">重试</el-button></template></el-table-column></el-table><el-pagination v-model:current-page="pageNo" :page-size="8" :total="tasks.length" layout="total, prev, pager, next" /></section>
  </template>

  <AnnotationPanel v-if="page === 'annotation'" @navigate="$emit('navigate', $event)" />

  <section v-if="page === 'models'" class="panel"><el-tabs v-model="tab"><el-tab-pane v-for="name in ['模型配置', '模型试用', '模型评测']" :key="name" :label="name" :name="name" /></el-tabs>
    <template v-if="tab === '模型配置'"><div class="section-title"><div><h3>可用模型</h3><p>配置模型服务信息，本演示不发送外部请求或保存真实密钥</p></div><el-button type="primary" :disabled="!allowed('edit')" @click="addModel()">新增模型</el-button></div><el-table :data="state.models"><el-table-column label="模型名称" prop="name" /><el-table-column label="服务地址" prop="address" min-width="230" /><el-table-column label="类型" prop="type" /><el-table-column label="状态" prop="status" /><el-table-column label="操作"><template #default="{ row }"><el-button link type="primary" :disabled="!allowed('edit')" @click="addModel(row)">编辑</el-button></template></el-table-column></el-table></template>
    <template v-if="tab === '模型试用'"><div class="toolbar"><el-select v-model="modelChoice" placeholder="选择模型"><el-option v-for="model in state.models.filter(m => m.status === '已上架')" :key="model.id" :label="model.name" :value="model.id" /></el-select><el-tag type="info">模拟对话</el-tag></div><div class="chat-window"><el-empty v-if="!chatMessages.length" description="输入问题，体验模型问答界面" /><div v-for="(message, i) in chatMessages" :key="i" class="chat-message" :class="{ user: message.role === '您' }"><b>{{ message.role }}</b><p>{{ message.text }}</p><el-button link size="small" @click="copy(message.text)">复制内容</el-button></div></div><div class="chat-input"><el-input v-model="chatText" placeholder="输入您的问题" @keyup.enter="sendChat" /><el-button type="primary" @click="sendChat">发送</el-button></div></template>
    <template v-if="tab === '模型评测'"><div class="evaluation-form"><h3>创建模型评测</h3><p class="muted">上传评测文件，选择模型并比较模拟结果。</p><input type="file" accept=".json,.jsonl,.csv,.txt" @change="evaluationFile = $event.target.files[0]?.name || ''" /><el-select v-model="compareModels" multiple placeholder="选择评测模型"><el-option v-for="model in state.models" :key="model.id" :label="model.name" :value="model.id" /></el-select><el-button type="primary" :loading="evaluation" @click="evaluate">开始评测（模拟）</el-button></div><el-table v-if="evaluationResults.length" :data="evaluationResults"><el-table-column label="模型" prop="name" /><el-table-column label="准确性（模拟）" prop="accuracy" /><el-table-column label="完整性（模拟）" prop="completeness" /><el-table-column label="耗时（模拟）" prop="time" /><el-table-column label="示例条数" prop="samples" /></el-table></template>
  </section>

  <FormDialog v-model="dialog" :assist="dialogTitle === '新建数据集' ? { name: '土壤科研问答数据集', scene: '土壤环境科研问答', demand: '将试验报告与采样记录加工为可追溯的问答数据。', quality: '数值准确；保留参考材料；不编造产量结论', source: '试验报告与采样记录' } : undefined" :title="dialogTitle" :fields="fields" :initial="initial" @save="saveForm" />
  <input ref="fileInput" type="file" multiple hidden @change="upload" />
  <el-dialog v-model="importDialog" title="接入数据" width="760"><el-tabs v-model="importTab"><el-tab-pane v-for="name in ['文件上传', '条目导入', 'SDK导入', 'MySQL接入']" :key="name" :label="name" :name="name" /></el-tabs><template v-if="importTab === '文件上传'"><button class="upload-zone" :disabled="uploadBusy" @click="fileInput.click()"><el-icon><UploadFilled /></el-icon><h3>{{ uploadBusy ? '正在导入…' : '点击选择本地资料' }}</h3><p>支持文档、表格、图片和JSON条目数据</p><small>文件保存在当前浏览器内；上传后进入数据预处理进行解析和清洗。</small></button></template><template v-if="importTab === '条目导入'"><p>粘贴 JSON 数组或 JSONL，支持原始条目、Alpaca、ShareGPT 和 Label Studio data 结构；人工标注与模型预测分别保留。</p><el-input v-model="manualText" type="textarea" :rows="9" placeholder='[{"question":"采样深度是多少？","answer":"0—20厘米"}]' /><div class="dialog-actions"><el-button type="primary" @click="importEntries">导入条目</el-button></div></template><template v-if="importTab === 'SDK导入'"><el-alert title="SDK调用示例，仅展示接入方式，不连接后端。" type="info" :closable="false" /><pre>{{ sdkCode }}</pre><el-button @click="copy(sdkCode)">复制示例</el-button><el-button type="primary" @click="manualText = JSON.stringify([{ question: '采样深度是多少？', answer: '0—20厘米' }]); importEntries()">导入模拟SDK数据</el-button></template><template v-if="importTab === 'MySQL接入'"><el-alert title="模拟数据库连接，不会访问真实数据库。" type="info" :closable="false" /><el-form label-position="top" class="dialog-form"><div class="two-cols"><el-form-item label="Host与Port"><el-input v-model="dbConfig.host" /></el-form-item><el-form-item label="用户名"><el-input v-model="dbConfig.username" /></el-form-item></div><el-button @click="databaseConnected = Boolean(dbConfig.host && dbConfig.username)">测试连接（模拟）</el-button><el-tag v-if="databaseConnected" type="success">连接成功（模拟）</el-tag><template v-if="databaseConnected"><div class="two-cols"><el-form-item label="数据库"><el-input v-model="dbConfig.database" /></el-form-item><el-form-item label="数据表"><el-input v-model="dbConfig.table" /></el-form-item></div><el-form-item label="选择字段"><el-checkbox-group v-model="dbConfig.fields"><el-checkbox v-for="key in Object.keys(tableSamples[0])" :key="key" :value="key">{{ key }}</el-checkbox></el-checkbox-group></el-form-item><el-form-item label="筛选条件（演示配置）"><el-input v-model="dbConfig.condition" placeholder="例如 sampling_depth > 0" /></el-form-item><el-table :data="tableSamples"><el-table-column v-for="key in dbConfig.fields" :key="key" :label="key" :prop="key" /></el-table><el-button type="primary" @click="importDatabase">导入模拟记录</el-button></template></el-form></template></el-dialog>
  <el-drawer :model-value="Boolean(detail)" :title="detail?.name || '详情'" size="620" @close="detail = null"><template v-if="detail"><el-descriptions :column="1" border><el-descriptions-item v-for="key in Object.keys(detail).filter(k => !['content','logs','config','id','datasetId','fail','hasFile','sourceId','versionId'].includes(k) && typeof detail[k] !== 'object')" :key="key" :label="({name:'名称',type:'类型',status:'状态',created:'创建时间',size:'大小',scene:'场景',quality:'质量要求',source:'来源',format:'格式',scale:'量级',project:'项目',level:'等级',demand:'需求',sourceId:'来源编号',versionId:'成果编号',progress:'进度'})[key] || key">{{ detail[key] }}</el-descriptions-item></el-descriptions><template v-if="detail.logs"><h3>执行日志</h3><pre>{{ detail.logs.join('\n') }}</pre><h3>任务配置</h3><pre>{{ JSON.stringify(detail.config || {}, null, 2) }}</pre><el-button v-if="detail.versionId" type="primary" @click="state.focusVersion = detail.versionId; detail = null; $emit('navigate', 'versions')">查看输出成果</el-button></template><template v-else-if="detail.content"><h3>原始内容</h3><img v-if="detail.content.startsWith('data:image')" :src="detail.content" class="preview-image" /><pre v-else>{{ detail.content }}</pre></template><el-empty v-else-if="detail.hasFile" description="请进入数据预处理解析，或下载原文件查看" /><el-button v-if="detail.hasFile && allowed('edit')" @click="downloadSource(detail)">查看原始文件</el-button></template></el-drawer>
</template>
