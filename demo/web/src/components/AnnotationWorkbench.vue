<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { Share } from '@element-plus/icons-vue'
import { state, selectedSources, selectedVersions, runTask, allowed, taskName } from '../store'
import { classificationInputs } from '../workspace'
import { preparationInputs } from '../workflow'
import AnnotationPanel from './AnnotationPanel.vue'
import ClassificationPanel from './ClassificationPanel.vue'
import AnnotationImport from './AnnotationImport.vue'
import KnowledgeGraphView from './KnowledgeGraphView.vue'
import { graphEntityTypes } from '../knowledgeGraph'
const emit = defineEmits(['navigate'])
const options = [
  { name:'知识片段', icon:'Files', description:'按规则组织正文，保留来源' },
  { name:'知识图谱', icon:Share, description:'抽取实体与关系，核对来源并校订图谱' },
  { name:'问答生成', icon:'MagicStick', description:'从参考资料生成问题与答案' },
  { name:'文本分类', icon:'Document', description:'为文本选择内容类别' },
  { name:'图片分类', icon:'Picture', description:'给整张图片选择一个或多个标签' },
  { name:'图片框选', icon:'Grid', description:'标记区域位置与对应类别' },
  { name:'图片描述', icon:'EditPen', description:'为图片生成描述文本' },
  { name:'图片问答', icon:'Collection', description:'围绕图片生成问题与答案' },
  { name:'问答人工复核', icon:'CircleCheck', description:'核对来源、评分并修订答案' },
]
const clone = value => JSON.parse(JSON.stringify(value))
const key = state.role + ':' + state.activeDataset
state.ui.annotationWorkbenches ||= {}
const saved = state.ui.annotationWorkbenches[key] || { modes: {} }
const handoff = computed(() => state.ui.pipeline?.datasetId === state.activeDataset ? state.ui.pipeline : null)
const mode = ref(state.ui.annotationMode || handoff.value?.generationType || saved.mode || '知识片段')
if (mode.value === '问答增强') mode.value = '问答生成'
if (!options.some(option => option.name === mode.value)) mode.value = '知识片段'
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
const size = ref(state.settings.generation.size)
const chunkType = ref(state.settings.generation.chunkType)
const separator = ref(state.settings.generation.separator)
const entityTypes = ref([...graphEntityTypes])
const entityTerms = ref('')
const maxEntities = ref(40)
const tasks = computed(() => state.tasks.filter(task => task.datasetId === state.activeDataset
  && (task.type === mode.value || (mode.value === '知识图谱' && task.type === '知识图谱标注'))))
const running = computed(() => tasks.value.some(task => task.status === '执行中'))
const currentTask = computed(() => tasks.value[0])
const outputs = computed(() => selectedVersions().filter(version => currentTask.value?.versionId === version.id))
const audienceItem = computed(() => state.settings.audiences.find(item => item.id === audience.value))
const suggestedPrompt = computed(() => mode.value === '知识图谱'
  ? '仅依据所选正文识别实体和关系。实体包含名称、类型、说明；关系包含两端实体、关键词、说明和权重。合并同名实体，为每个实体和关系保留来源片段，不推断原文没有提供的事实。'
  : (audienceItem.value?.prompt || '依据参考资料，准确说明。') + '\n任务：' + mode.value + '。表达模板：' + template.value + '。保留来源，输出结构完整。')
let loadedMode = ''
let restoring = false
let lastSuggested = ''
function remember(name = loadedMode) {
  if (!name || !state.ui.annotationWorkbenches) return
  saved.mode = name
  saved.modes[name] = clone({ inputIds: inputIds.value, audience: audience.value, template: template.value,
    model: model.value, prompt: prompt.value, size: size.value, chunkType: chunkType.value,
    separator: separator.value, entityTypes:entityTypes.value, entityTerms:entityTerms.value, maxEntities:maxEntities.value,
    context: handoff.value })
  state.ui.annotationWorkbenches[key] = clone(saved)
}
watch(mode, name => {
  if (!options.some(option => option.name === name)) {
    mode.value = name === '问答增强' ? '问答生成' : '知识片段'
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
  size.value = previousState?.size ?? state.settings.generation.size
  chunkType.value = previousState?.chunkType || state.settings.generation.chunkType
  separator.value = previousState?.separator ?? state.settings.generation.separator
  entityTypes.value = previousState?.entityTypes || [...graphEntityTypes]
  entityTerms.value = previousState?.entityTerms || ''
  maxEntities.value = previousState?.maxEntities ?? 40
  prompt.value = previousState?.prompt || suggestedPrompt.value
  pendingPrompt.value = prompt.value !== suggestedPrompt.value
  lastSuggested = suggestedPrompt.value
  loadedMode = name
  restoring = false
}, { immediate: true, flush: 'sync' })
watch([audience, template], () => {
  if (restoring) return
  if (!prompt.value || prompt.value === lastSuggested) { prompt.value = suggestedPrompt.value; pendingPrompt.value = false }
  else pendingPrompt.value = true
  lastSuggested = suggestedPrompt.value
}, { flush: 'sync' })
onBeforeUnmount(() => remember())
function execute() {
  if (running.value) return
  const selected = inputIds.value.filter(id => candidates.value.some(input => input.id === id))
  if (!allowed('edit') || !selected.length) return ElMessage.warning('请选择可用输入资料')
  if (mode.value !== '知识片段' && (!model.value || !prompt.value.trim())) return ElMessage.warning('请选择模型并填写提示词')
  if (mode.value === '知识图谱' && !entityTypes.value.length) return ElMessage.warning('请至少选择一种实体类型')
  const config = { audience:audienceItem.value?.name, audienceTemplateId:audience.value, template:template.value,
    prompt:prompt.value, model:model.value, size:size.value, chunkType:chunkType.value, separator:separator.value,
    entityTypes:entityTypes.value, entityTerms:entityTerms.value, maxEntities:maxEntities.value }
  for (const sourceId of selected) runTask({name:taskName(mode.value),type:mode.value,sourceId,config})
  remember()
}
function show(version) { state.focusVersion = version.id; emit('navigate','versions') }
function openTaskCenter() {
  state.ui.taskCenterScope = {datasetId:state.activeDataset,type:mode.value}
  emit('navigate','task-center')
}
function reviewAnswers(version) { state.focusVersion = version.id; mode.value = '问答人工复核' }
function continueOutput(version) {
  const next = version.records.some(record => record.image) ? '图片问答' : '问答生成'
  state.ui.pipeline = { datasetId: state.activeDataset, inputIds: [version.id], generationType: next }
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
  <section class="panel">
    <div class="section-title"><div><h3>选择数据建设方式</h3><p>生成、分类与人工标注使用不同任务模板，结果始终保留在当前项目。</p></div><el-button text @click="$emit('navigate','settings')">管理模板<el-icon><ArrowRight /></el-icon></el-button></div>
    <div class="annotation-options"><button v-for="option in options" :key="option.name" :class="['annotation-option',{selected:mode === option.name}]" :disabled="running" @click="mode = option.name"><span class="icon-tile" :class="mode === option.name ? 'blue' : 'teal'"><el-icon><component :is="option.icon" /></el-icon></span><b>{{ option.name }}</b><small>{{ option.description }}</small></button></div>
  </section>
  <ClassificationPanel v-if="['文本分类','图片分类'].includes(mode)" :key="mode" :kind="mode === '图片分类' ? 'image' : 'text'" @navigate="$emit('navigate',$event)" />
  <AnnotationPanel v-else-if="['图片框选','问答人工复核'].includes(mode)" :key="mode" :initial-tab="mode === '图片框选' ? '图像标注' : '问答标注'" @mode="mode = $event" @navigate="$emit('navigate',$event)" />
  <div v-else class="pipeline-stack">
    <section class="panel pipeline-card">
      <div class="pipeline-card-heading"><span class="pipeline-marker">01</span><div><h3>选择输入资料</h3><p>选择当前数据集中的资料，不修改原始内容。</p></div><AnnotationImport v-if="['图片描述','图片问答'].includes(mode)" kind="image" @imported="imported" /></div>
      <el-select v-model="inputIds" multiple class="full-width" :disabled="running" placeholder="选择输入资料"><el-option v-for="input in candidates" :key="input.id" :value="input.id" :label="input.name" /></el-select>
      <el-empty v-if="!candidates.length" description="当前没有适合此任务的输入资料"><el-button v-if="!['图片描述','图片问答'].includes(mode)" @click="$emit('navigate','sources')">接入资料</el-button></el-empty>
    </section>
    <section class="panel pipeline-card">
      <div class="pipeline-card-heading"><span class="pipeline-marker">02</span><div><h3>{{ mode }}配置</h3><p>{{ mode === '知识图谱' ? '正文切片 → 实体与关系抽取 → 去重合并 → 人工校订。当前为本地抽取演示，尚未连接 LightRAG 服务。' : '通用默认值在设置中维护，本次使用的配置随任务保存。' }}</p></div><el-tag type="info">{{ mode === '知识片段' ? '本地切片' : mode === '知识图谱' ? '本地抽取演示' : '模型结果为模拟' }}</el-tag></div>
      <el-form label-position="top" class="annotation-task-form" :disabled="running">
        <template v-if="mode === '知识片段'"><el-form-item label="切片方式"><el-select v-model="chunkType"><el-option value="固定大小" /><el-option value="分隔符" /></el-select></el-form-item><el-form-item label="片段大小（字符）"><el-input-number v-model="size" :min="1" :max="100000" /></el-form-item><el-form-item v-if="chunkType === '分隔符'" label="分隔符"><el-input v-model="separator" /></el-form-item></template>
        <template v-else-if="mode === '知识图谱'">
          <el-form-item label="实体类型" class="wide-field"><el-checkbox-group v-model="entityTypes"><el-checkbox v-for="type in graphEntityTypes" :key="type" :value="type">{{ type }}</el-checkbox></el-checkbox-group></el-form-item>
          <el-form-item label="候选实体名称（可选）" class="wide-field"><el-input v-model="entityTerms" placeholder="例如：土壤含水量、作物、烘干法；填写后仅识别这些名称" /><small class="field-help">用逗号分隔正文中实际出现的名称；留空时演示识别科研术语、引号内名称和英文名称。</small></el-form-item>
          <el-form-item label="实体数量上限"><el-input-number v-model="maxEntities" :min="2" :max="100" /></el-form-item><el-form-item label="来源片段大小（字符）"><el-input-number v-model="size" :min="50" :max="10000" /></el-form-item>
          <el-form-item label="抽取模型"><el-select v-model="model"><el-option v-for="item in state.models.filter(item => item.status === '已上架')" :key="item.id" :value="item.id" :label="item.name" /></el-select><small class="field-help">模型与提示词随配置保存，当前演示使用本地规则。</small></el-form-item>
          <el-form-item label="实体与关系抽取提示词" class="wide-field"><el-input v-model="prompt" type="textarea" :rows="4" /></el-form-item>
        </template>
        <template v-else><el-form-item label="1. 目标受众"><el-select v-model="audience"><el-option v-for="item in state.settings.audiences" :key="item.id" :value="item.id" :label="item.name" /></el-select></el-form-item><el-form-item label="2. 表达模板"><el-select v-model="template"><el-option v-for="name in ['忠实原文','简明解释','教学讲解']" :key="name" :value="name" /></el-select></el-form-item><el-form-item label="3. 使用模型"><el-select v-model="model"><el-option v-for="item in state.models.filter(m => m.status === '已上架')" :key="item.id" :value="item.id" :label="item.name" /></el-select></el-form-item><el-form-item label="4. 本次提示词" class="wide-field"><el-input v-model="prompt" type="textarea" :rows="5" /><div v-if="pendingPrompt" class="prompt-update"><span>您已修改提示词，当前保留修改后的内容。</span><el-button text type="primary" @click="prompt = suggestedPrompt; pendingPrompt = false">应用当前受众与模板的提示词</el-button></div></el-form-item></template>
      </el-form>
      <div class="pipeline-actions"><span class="muted">任务名称会自动包含项目、处理类型、时间与编号</span><el-button type="primary" :loading="running" :disabled="!allowed('edit') || !inputIds.length || running" @click="execute">开始{{ mode }}</el-button></div>
    </section>
    <section class="panel pipeline-card">
      <div class="pipeline-card-heading"><span class="pipeline-marker">03</span><div><h3>查看结果并继续建设</h3><p>仅展示当前方式的最新一条任务与成果。</p></div><el-button @click="openTaskCenter">历史任务记录</el-button></div>
      <el-table v-if="currentTask" :data="[currentTask]"><el-table-column label="任务" prop="name" /><el-table-column label="状态" prop="status" width="100" /><el-table-column label="进度" width="150"><template #default="{row}"><el-progress :percentage="row.progress" /></template></el-table-column><el-table-column label="说明"><template #default="{row}">{{ row.status === '失败' ? row.logs.at(-1) : '' }}</template></el-table-column></el-table>
      <article v-for="output in outputs" :key="output.id" class="local-output">
        <div><b>{{ output.type }} · {{ output.records.length }} 条</b><el-tag type="info">{{ output.number ? '数据集 V' + output.number : '中间成果' }}</el-tag></div>
        <KnowledgeGraphView v-if="mode === '知识图谱'" :version="output" editable exportable />
        <template v-else><div v-for="(record, index) in output.records.slice(0,2)" :key="index"><el-image v-if="record.image" :src="record.image" fit="contain" class="cleaning-image" /><h4 v-if="record.question">{{ record.question }}</h4><p v-if="record.question">{{ record.correctedAnswer || record.answer }}</p><pre v-else>{{ record.content }}</pre></div></template>
        <div class="pipeline-actions"><el-button @click="show(output)">查看项目内完整成果</el-button><template v-if="mode !== '知识图谱'"><el-button v-if="output.records.some(r => r.question)" type="primary" @click="reviewAnswers(output)">下一步：人工复核</el-button><el-button v-else type="primary" @click="continueOutput(output)">下一步：{{ output.records.some(r => r.image) ? '图片问答' : '生成问答' }}</el-button></template></div>
      </article>
      <el-empty v-if="!tasks.length" description="选择输入并执行后，结果会展示在这里" :image-size="65" />
    </section>
  </div>
</template>
