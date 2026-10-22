<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { state, selectedSources, selectedVersions, runTask, allowed, taskName } from '../store'
import { classificationInputs } from '../workspace'
import { preparationInputs } from '../workflow'
import AnnotationPanel from './AnnotationPanel.vue'
import ClassificationPanel from './ClassificationPanel.vue'
import AnnotationImport from './AnnotationImport.vue'
import { preprocessingModules } from '../preprocessing'
import KnowledgeGraphFlow from './KnowledgeGraphFlow.vue'
import AnnotationResultReview from './AnnotationResultReview.vue'
import { classificationKind } from '../annotation'
import { taskPrompt } from '../promptConfig'
const emit = defineEmits(['navigate'])
const options = [
  { name:'文本分类', icon:'Document', description:'为文本选择内容类别' },
  { name:'图片分类', icon:'Picture', description:'给整张图片选择一个或多个标签' },
  { name:'图片框选', icon:'Grid', description:'标记区域位置与对应类别' },
  { name:'图片描述', icon:'EditPen', description:'为图片生成描述文本' },
  { name:'图片问答', icon:'Collection', description:'围绕图片生成问题与答案' },
  { name:'问答人工复核', icon:'CircleCheck', description:'核对来源、评分并修订答案' },
  { name:'知识图谱', icon:'Connection', description:'自动编译、实体关系抽取、同名合并与来源校订' },
]
const categories = [
  { id:'text', name:'文本', icon:'Document', modes:['文本分类','知识图谱'] },
  { id:'image', name:'图像', icon:'Picture', modes:['图片分类','图片框选','图片描述'] },
  { id:'qa', name:'问答', icon:'CircleCheck', modes:['问答人工复核'] },
  { id:'multimodal', name:'图文', icon:'Collection', modes:['图片问答'] },
]
const clone = value => JSON.parse(JSON.stringify(value))
const key = state.role + ':' + state.activeDataset
state.ui.annotationWorkbenches ||= {}
const saved = state.ui.annotationWorkbenches[key] || { modes: {} }
saved.modes ||= {}
const handoff = computed(() => state.ui.pipeline?.datasetId === state.activeDataset ? state.ui.pipeline : null)
const phase = ref(state.ui.annotationPhase === 'review' ? 'review' : 'annotation')
const reviewFocus = ref(state.ui.annotationReviewFocus || '')
const editorSession = ref(0)
delete state.ui.annotationPhase
delete state.ui.annotationReviewFocus
const mode = ref(state.ui.annotationMode || handoff.value?.generationType || saved.mode || '文本分类')
if (!options.some(option => option.name === mode.value)) mode.value = '文本分类'
const category = computed(() => categories.find(item => item.modes.includes(mode.value)) || categories[0])
const visibleOptions = computed(() => options.filter(option => category.value.modes.includes(option.name)))
function selectCategory(id) {
  const item = categories.find(item => item.id === id)
  if (item) mode.value = item.modes.includes(saved.categoryModes?.[id]) ? saved.categoryModes[id] : item.modes[0]
}
delete state.ui.annotationMode
function availableInputs(type) {
  const kind = ['图片描述','图片问答'].includes(type) ? 'image' : 'text'
  return preparationInputs(selectedSources(),selectedVersions(),state.activeDataset).filter(input => input.ready && input.kind === kind)
}
const candidates = computed(() => availableInputs(mode.value))
function originalInputIds(ids = []) {
  const requested = new Set(ids)
  const versions = new Map(selectedVersions().map(version => [version.id,version]))
  for (const id of requested) {
    const version = versions.get(id)
    if (!version) continue
    for (const parent of [version.sourceId,...(version.sourceIds || []),
      ...(version.records || []).flatMap(record => [record.originId,record.sourceId,record.inputId])]) {
      if (parent) requested.add(parent)
    }
  }
  return requested
}
const inputIds = ref([])
const audience = ref('')
const template = ref('忠实原文')
const model = ref('')
const prompt = ref('')
const pendingPrompt = ref(false)
const tasks = computed(() => state.tasks.filter(task => task.datasetId === state.activeDataset && task.type === mode.value))
const running = computed(() => tasks.value.some(task => task.status === '执行中'))
const currentTask = computed(() => tasks.value[0])
const outputs = computed(() => selectedVersions().filter(version => currentTask.value?.versionId === version.id))
const audienceItem = computed(() => state.settings.audiences.find(item => item.id === audience.value))
const suggestedPrompt = computed(() => taskPrompt(state.settings, mode.value, {
  audience:audienceItem.value?.name, audience_prompt:audienceItem.value?.prompt || '', template:template.value,
}))
let loadedMode = ''
let restoring = false
let lastSuggested = ''
function remember(name = loadedMode) {
  if (!name || !state.ui.annotationWorkbenches) return
  saved.mode = name
  const group = categories.find(item => item.modes.includes(name))
  saved.categoryModes ||= {}
  if (group) saved.categoryModes[group.id] = name
  saved.modes[name] = clone({ inputIds: inputIds.value, audience: audience.value, template: template.value,
    model: model.value, prompt: prompt.value, promptTemplate: suggestedPrompt.value,
    context: handoff.value })
  state.ui.annotationWorkbenches[key] = clone(saved)
}
watch(mode, name => {
  if (!options.some(option => option.name === name)) {
    mode.value = '文本分类'
    return
  }
  const previous = loadedMode
  remember()
  restoring = true
  const previousState = saved.modes[name]
  if (previousState) {
    if (previousState.context) state.ui.pipeline = clone(previousState.context)
    else delete state.ui.pipeline
  }
  // A deliberate change of task type releases an incompatible upstream scope.
  if (!previousState && previous && handoff.value?.inputIds?.length) {
    const scoped = handoff.value
    const requested = originalInputIds(scoped.inputIds)
    const kind = ['图片分类','图片框选'].includes(name) ? 'image' : name === '文本分类' ? 'text' : ''
    const compatible = kind
      ? classificationInputs(kind, selectedSources(), selectedVersions(), state.activeDataset, scoped).length > 0
      : availableInputs(name).some(input => requested.has(input.id) || requested.has(input.originId))
    if (!compatible) state.ui.pipeline = { datasetId: state.activeDataset, inputIds: [], generationType: name }
  }
  if (handoff.value) state.ui.pipeline = { ...handoff.value, generationType: name }
  const availableIds = candidates.value.map(input => input.id)
  const requested = originalInputIds(previousState?.inputIds || handoff.value?.inputIds || [])
  inputIds.value = candidates.value.filter(input => requested.has(input.id) || requested.has(input.originId)).map(input => input.id)
  if (!previousState && !inputIds.value.length && availableIds.length) inputIds.value = [availableIds[0]]
  audience.value = previousState?.audience || state.settings.audiences[0]?.id || ''
  template.value = previousState?.template || '忠实原文'
  model.value = previousState?.model || state.models.find(item => item.status === '已上架')?.id || ''
  prompt.value = previousState?.prompt && previousState.prompt !== previousState.promptTemplate ? previousState.prompt : suggestedPrompt.value
  pendingPrompt.value = prompt.value !== suggestedPrompt.value
  lastSuggested = suggestedPrompt.value
  loadedMode = name
  restoring = false
}, { immediate: true, flush: 'sync' })
watch(suggestedPrompt, () => {
  if (restoring) return
  if (!prompt.value || prompt.value === lastSuggested) { prompt.value = suggestedPrompt.value; pendingPrompt.value = false }
  else pendingPrompt.value = true
  lastSuggested = suggestedPrompt.value
}, { flush: 'sync' })
onBeforeUnmount(() => remember())
watch(() => state.ui.annotationMode, value => {
  if (options.some(option => option.name === value)) { mode.value = value; phase.value = 'annotation'; delete state.ui.annotationMode }
})
function execute() {
  if (running.value) return
  const selected = inputIds.value.filter(id => candidates.value.some(input => input.id === id))
  if (!allowed('edit') || !selected.length) return ElMessage.warning('请选择可用输入资料')
  if (!state.models.some(item => item.id === model.value && item.status === '已上架') || !prompt.value.trim()) return ElMessage.warning('请选择已上架模型并填写提示词')
  const config = { audience:audienceItem.value?.name, audienceTemplateId:audience.value, template:template.value,
    prompt:prompt.value, model:model.value }
  for (const sourceId of selected) runTask({name:taskName(mode.value),type:mode.value,sourceId,config})
  remember()
}
function show(version) { state.focusVersion = version.id; emit('navigate','versions') }
function openTaskCenter() {
  state.ui.taskCenterScope = {datasetId:state.activeDataset,type:mode.value}
  emit('navigate','task-center')
}
function reviewAnswers(version) { state.focusVersion = version.id; mode.value = '问答人工复核' }
function openResultReview(id) { reviewFocus.value = id || ''; phase.value = 'review' }
function editResult(version) {
  if (['知识图谱','图片描述'].includes(version.type)) { state.focusVersion = version.id; emit('navigate', 'versions'); return }
  const kind = classificationKind(version)
  const next = version.type === '知识图谱' ? '知识图谱' : kind ? kind === 'image' ? '图片分类' : '文本分类'
    : version.type === '图像标注' ? '图片框选' : version.records.some(record => record.question) ? '问答人工复核' : version.type
  mode.value = next
  state.focusVersion = version.id
  state.ui.annotationTarget = { datasetId:state.activeDataset, versionId:version.id, index:0 }
  editorSession.value++
  phase.value = 'annotation'
}
function selectMode(name) {
  if (preprocessingModules.some(item => item.id === name)) {
    state.ui.preprocessingMode = name
    emit('navigate', 'processing')
  } else mode.value = name
}
function continueOutput(version) {
  const next = version.records.some(record => record.image) ? '图片问答' : '问答生成'
  state.ui.pipeline = { datasetId: state.activeDataset, inputIds: [version.id], generationType: next }
  if (next === '问答生成') { selectMode(next); return }
  mode.value = next
  const requested = originalInputIds([version.id])
  inputIds.value = candidates.value.filter(input => requested.has(input.id) || requested.has(input.originId)).map(input => input.id)
}
function imported(sources) {
  const ids = sources.map(source => source.importedVersionId || source.id)
  inputIds.value = candidates.value.filter(input => ids.includes(input.id)).map(input => input.id)
  remember()
}
</script>

<template>
  <section class="panel"><div class="section-title"><h3>数据标注</h3><el-button @click="$emit('navigate','settings')">后台配置</el-button></div><el-tabs v-model="phase"><el-tab-pane label="标注流程" name="annotation" /><el-tab-pane label="成果审核" name="review" /></el-tabs></section>
  <AnnotationResultReview v-if="phase === 'review'" :focus-id="reviewFocus" @edit="editResult" />
  <div v-show="phase === 'annotation'">
  <section class="panel">
    <div class="section-title"><h3>按数据类型标注</h3></div>
    <div class="annotation-type-layout">
      <nav class="annotation-type-list" aria-label="标注数据类型"><button v-for="item in categories" :key="item.id" type="button" :class="{ selected: category.id === item.id }" :aria-pressed="category.id === item.id" @click="selectCategory(item.id)"><el-icon><component :is="item.icon" /></el-icon>{{ item.name }}</button></nav>
      <div class="annotation-type-content"><h4>{{ category.name }}标注模板</h4><div class="annotation-options"><button v-for="option in visibleOptions" :key="option.name" type="button" :class="['annotation-option',{selected:mode === option.name}]" @click="mode = option.name"><span class="icon-tile" :class="mode === option.name ? 'blue' : 'teal'"><el-icon><component :is="option.icon" /></el-icon></span><b>{{ option.name }}</b><small>{{ option.description }}</small></button></div></div>
    </div>
  </section>
  <KnowledgeGraphFlow v-if="mode === '知识图谱'" @review="openResultReview" @navigate="$emit('navigate',$event)" />
  <ClassificationPanel v-else-if="['文本分类','图片分类'].includes(mode)" :key="mode + editorSession" :kind="mode === '图片分类' ? 'image' : 'text'" @review="openResultReview" @navigate="$emit('navigate',$event)" />
  <AnnotationPanel v-else-if="['图片框选','问答人工复核'].includes(mode)" :key="mode + editorSession" :initial-tab="mode === '图片框选' ? '图像标注' : '问答标注'" @review="openResultReview" @mode="selectMode" @navigate="$emit('navigate',$event)" />
  <div v-else class="pipeline-stack">
    <section class="panel pipeline-card">
      <div class="pipeline-card-heading"><span class="pipeline-marker">01</span><div><h3>选择输入资料</h3><p>选择当前数据集中的资料，不修改原始内容。</p></div><AnnotationImport v-if="['图片描述','图片问答'].includes(mode)" kind="image" @imported="imported" /></div>
      <el-select v-model="inputIds" multiple class="full-width" :disabled="running" placeholder="选择输入资料"><el-option v-for="input in candidates" :key="input.id" :value="input.id" :label="input.name" /></el-select>
      <el-empty v-if="!candidates.length" description="当前没有适合此任务的输入资料"><el-button v-if="!['图片描述','图片问答'].includes(mode)" @click="$emit('navigate','sources')">接入资料</el-button></el-empty>
    </section>
    <section class="panel pipeline-card">
      <div class="pipeline-card-heading"><span class="pipeline-marker">02</span><div><h3>{{ mode }}配置</h3><p>本次配置随任务保存。</p></div><el-tag type="info">模型结果为模拟</el-tag></div>
      <el-form label-position="top" class="annotation-task-form" :disabled="running">
        <template><el-form-item label="1. 目标受众"><el-select v-model="audience"><el-option v-for="item in state.settings.audiences" :key="item.id" :value="item.id" :label="item.name" /></el-select></el-form-item><el-form-item label="2. 表达模板"><el-select v-model="template"><el-option v-for="name in ['忠实原文','简明解释','教学讲解']" :key="name" :value="name" /></el-select></el-form-item><el-form-item label="3. 使用模型"><el-select v-model="model"><el-option v-for="item in state.models.filter(m => m.status === '已上架')" :key="item.id" :value="item.id" :label="item.name" /></el-select></el-form-item><el-form-item label="4. 本次提示词" class="wide-field"><el-input v-model="prompt" type="textarea" :rows="5" /><div v-if="pendingPrompt" class="prompt-update"><span>您已修改提示词，当前保留修改后的内容。</span><el-button text type="primary" @click="prompt = suggestedPrompt; pendingPrompt = false">应用当前受众与模板的提示词</el-button></div></el-form-item></template>
      </el-form>
      <div class="pipeline-actions"><span class="muted">任务名称会自动包含项目、处理类型、时间与编号</span><el-button type="primary" :loading="running" :disabled="!allowed('edit') || !inputIds.length || running" @click="execute">开始{{ mode }}</el-button></div>
    </section>
    <section class="panel pipeline-card">
      <div class="pipeline-card-heading"><span class="pipeline-marker">03</span><div><h3>查看结果并继续建设</h3><p>仅展示当前方式的最新一条任务与成果。</p></div><el-button @click="openTaskCenter">历史任务记录</el-button></div>
      <el-table v-if="currentTask" :data="[currentTask]"><el-table-column label="任务" prop="name" /><el-table-column label="状态" prop="status" width="100" /><el-table-column label="进度" width="150"><template #default="{row}"><el-progress :percentage="row.progress" /></template></el-table-column><el-table-column label="说明"><template #default="{row}">{{ row.status === '失败' ? row.logs.at(-1) : '' }}</template></el-table-column></el-table>
      <article v-for="output in outputs" :key="output.id" class="local-output">
        <div><b>{{ output.type }} · {{ output.records.length }} 条</b><el-tag type="info">{{ output.number ? '数据集 V' + output.number : '中间成果' }}</el-tag></div>
        
        <template><div v-for="(record, index) in output.records.slice(0,2)" :key="index"><el-image v-if="record.image" :src="record.image" fit="contain" class="cleaning-image" /><h4 v-if="record.question">{{ record.question }}</h4><p v-if="record.question">{{ record.correctedAnswer || record.answer }}</p><pre v-else>{{ record.content }}</pre></div></template>
        <div class="pipeline-actions"><el-button @click="show(output)">查看项目内完整成果</el-button><el-button @click="openResultReview(output.id)">成果审核</el-button><template><el-button v-if="output.records.some(r => r.question)" type="primary" @click="reviewAnswers(output)">下一步：人工复核</el-button><el-button v-else type="primary" @click="continueOutput(output)">下一步：{{ output.records.some(r => r.image) ? '图片问答' : '生成问答' }}</el-button></template></div>
      </article>
      <el-empty v-if="!tasks.length" description="选择输入并执行后，结果会展示在这里" :image-size="65" />
    </section>
  </div>
  </div>
</template>
