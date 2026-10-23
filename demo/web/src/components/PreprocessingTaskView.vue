<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { state, selectedSources, selectedVersions, allowed, runTask, taskName, addVersion, notify } from '../store'
import { preprocessingInputs, preprocessingName } from '../preprocessing'
import { isDatasetVersion } from '../domain'
import AnnotationPanel from './AnnotationPanel.vue'
import { taskPrompt } from '../promptConfig'

const props = defineProps({ type: { type: String, required: true } })
const emit = defineEmits(['navigate'])
const clone = value => JSON.parse(JSON.stringify(value))
const key = state.role + ':' + state.activeDataset + ':' + props.type
state.ui.preprocessingTasks ||= {}
const saved = state.ui.preprocessingTasks[key] || {}
const name = computed(() => preprocessingName(props.type))
const context = computed(() => state.ui.pipeline?.datasetId === state.activeDataset ? state.ui.pipeline.inputIds || [] : [])
const candidates = computed(() => preprocessingInputs(props.type, selectedSources(), selectedVersions(), state.activeDataset))
const groups = computed(() => [...new Set(candidates.value.map(input => input.group))])
const inputIds = ref([])
const selectionEdited = ref(Boolean(saved.selectionEdited && JSON.stringify(context.value) === saved.context))
const audience = ref(saved.audience || state.settings.audiences[0]?.id || '')
const template = ref(saved.template || '忠实原文')
const model = ref(saved.model || state.models.find(item => item.status === '已上架')?.id || '')
const prompt = ref(saved.prompt || '')
const size = ref(saved.size ?? state.settings.generation.size)
const chunkType = ref(saved.chunkType || state.settings.generation.chunkType)
const separator = ref(saved.separator ?? state.settings.generation.separator)
const paragraphsPerChunk = ref(saved.paragraphsPerChunk ?? state.settings.generation.paragraphsPerChunk ?? 1)
const chunkConfig = computed(() => {
  if (chunkType.value === '分隔符') return { chunkType: chunkType.value, separator: separator.value }
  if (chunkType.value === '按段落') return { chunkType: chunkType.value, paragraphsPerChunk: paragraphsPerChunk.value }
  return { chunkType: chunkType.value, size: size.value }
})
const requestedReview = state.ui.preprocessingReview
const reviewVersion = ref(requestedReview?.datasetId === state.activeDataset && selectedVersions().some(version => version.id === requestedReview.versionId && ['问答生成', '问答增强'].includes(version.type)) ? requestedReview.versionId : '')
if (reviewVersion.value) {
  const candidate = selectedVersions().find(version => version.id === reviewVersion.value)
  state.focusVersion = selectedVersions().find(version => version.id === candidate.reviewedVersionId)?.id || candidate.id
  delete state.ui.preprocessingReview
}
const audienceItem = computed(() => state.settings.audiences.find(item => item.id === audience.value))
const suggestedPrompt = computed(() => taskPrompt(state.settings, props.type, {
  audience: audienceItem.value?.name, audience_prompt: audienceItem.value?.prompt || '', template: template.value,
}))
let lastSuggested = suggestedPrompt.value
if (!prompt.value || saved.prompt === saved.promptTemplate) prompt.value = lastSuggested
const pendingPrompt = computed(() => prompt.value !== suggestedPrompt.value)
watch(suggestedPrompt, () => {
  if (!prompt.value || prompt.value === lastSuggested) prompt.value = suggestedPrompt.value
  lastSuggested = suggestedPrompt.value
}, { flush: 'sync' })

function chooseInputs() {
  const handoff = context.value
  const ids = JSON.stringify(handoff) === saved.context ? saved.inputIds || handoff : handoff
  const exact = candidates.value.filter(input => ids.includes(input.id))
  const requested = new Set(ids)
  const versions = new Map(selectedVersions().map(version => [version.id, version]))
  for (const id of requested) {
    const version = versions.get(id)
    if (!version) continue
    for (const parent of [version.sourceId, ...(version.sourceIds || []),
      ...(version.records || []).flatMap(record => [record.originId, record.sourceId, record.inputId])]) {
      if (parent) requested.add(parent)
    }
  }
  const matched = exact.length ? exact : candidates.value.filter(input => requested.has(input.id) || requested.has(input.originId))
  inputIds.value = (matched.length ? matched : !ids.length && !selectionEdited.value ? candidates.value.slice(0, 1) : []).map(input => input.id)
}
chooseInputs()
watch(() => JSON.stringify(context.value), () => { selectionEdited.value = false; chooseInputs() })
watch(candidates, (next, previous = []) => {
  inputIds.value = inputIds.value.flatMap(id => {
    if (next.some(input => input.id === id)) return [id]
    const old = previous.find(input => input.id === id)
    const replacement = old?.originId && next.find(input => input.originId === old.originId && input.group === old.group)
    return replacement ? [replacement.id] : []
  })
  if (!selectionEdited.value && !inputIds.value.length) chooseInputs()
})
function remember() {
  state.ui.preprocessingTasks[key] = clone({ inputIds: inputIds.value, selectionEdited: selectionEdited.value, context: JSON.stringify(context.value),
    audience: audience.value, template: template.value, model: model.value, prompt: prompt.value, promptTemplate: suggestedPrompt.value,
    size: size.value, chunkType: chunkType.value, separator: separator.value, paragraphsPerChunk: paragraphsPerChunk.value })
}
onBeforeUnmount(remember)
const tasks = computed(() => state.tasks.filter(task => task.datasetId === state.activeDataset && task.type === props.type))
const currentTask = computed(() => tasks.value[0])
const running = computed(() => tasks.value.some(task => task.status === '执行中'))
const output = computed(() => selectedVersions().find(version => version.id === currentTask.value?.versionId))
const reviewedOutput = computed(() => selectedVersions().find(version => version.id === output.value?.reviewedVersionId))
const blockingReason = computed(() => {
  if (!allowed('edit')) return '当前身份没有执行此任务的权限。'
  if (running.value) return '当前任务正在执行，请等待完成。'
  if (!inputIds.value.some(id => candidates.value.some(input => input.id === id))) return props.type === '问答增强' ? '请选择已有问答语料；也可先提取 QA 并完成人工复核。' : '请选择可用文本资料；文档需等待自动解析完成。'
  if (props.type === '知识片段') {
    if (chunkType.value === '固定大小' && (!Number.isInteger(size.value) || size.value < 1 || size.value > 100000)) return '切块大小需为 1—100000 的整数。'
    if (chunkType.value === '分隔符' && !separator.value) return '请填写分隔符。'
    if (chunkType.value === '按段落' && (!Number.isInteger(paragraphsPerChunk.value) || paragraphsPerChunk.value < 1 || paragraphsPerChunk.value > 1000)) return '每块段落数需为 1—1000 的整数。'
  } else {
    if (!state.models.some(item => item.id === model.value && item.status === '已上架')) return '请选择已上架的模型。'
    if (!prompt.value.trim()) return '请填写本次任务提示词。'
  }
  return ''
})
function execute() {
  if (blockingReason.value) return ElMessage.warning(blockingReason.value)
  const config = { preprocessing: true, audience: audienceItem.value?.name, audienceTemplateId: audience.value,
    template: template.value, model: model.value, prompt: prompt.value,
    ...(props.type === '知识片段' ? chunkConfig.value : {}) }
  for (const sourceId of inputIds.value.filter(id => candidates.value.some(input => input.id === id))) {
    runTask({ type: props.type, name: taskName(name.value), datasetId: state.activeDataset, sourceId, config })
  }
  remember()
}
function openHistory() {
  state.ui.taskCenterScope = { datasetId: state.activeDataset, type: props.type }
  emit('navigate', 'task-center')
}
function showOutput() { state.focusVersion = output.value.id; emit('navigate', 'versions') }
function review() { state.focusVersion = reviewedOutput.value?.id || output.value.id; reviewVersion.value = output.value.id }
function saveFragments() {
  if (!allowed('edit') || !output.value?.records.length) return
  const existing = selectedVersions().find(version => isDatasetVersion(version) && version.sourceId === output.value.id
    && version.type === '知识片段' && JSON.stringify(version.records) === JSON.stringify(output.value.records))
  const version = existing || addVersion(state.activeDataset, output.value.records, '知识片段', output.value.id, 'dataset')
  state.focusVersion = version.id
  notify(existing ? '该知识片段数据集成果已保存' : '知识片段数据集成果已保存到项目内')
}
function continueWith(type) {
  state.ui.pipeline = { datasetId: state.activeDataset, inputIds: [output.value.id], generationType: type }
  state.ui.preprocessingMode = type
  emit('navigate', 'processing')
}
</script>

<template>
  <template v-if="reviewVersion">
    <section class="panel"><div class="section-title"><div><h3>{{ name }} · 人工审核修改</h3></div><el-button @click="reviewVersion = ''">返回任务配置</el-button></div></section>
    <AnnotationPanel :key="reviewVersion" initial-tab="问答标注" local-review @navigate="emit('navigate', $event)" @completed="reviewVersion = ''" />
  </template>
  <div v-else class="pipeline-stack preprocessing-task">
    <section class="panel pipeline-card">
      <div class="pipeline-card-heading"><span class="pipeline-marker">01</span><div><h3>{{ type === '问答增强' ? '选择问答语料' : '选择输入资料' }}</h3></div></div>
      <el-select v-model="inputIds" multiple class="full-width" :disabled="running" :placeholder="type === '问答增强' ? '选择已有问答语料' : '选择输入资料'" @change="selectionEdited = true">
        <el-option-group v-for="group in groups" :key="group" :label="group"><el-option v-for="input in candidates.filter(item => item.group === group)" :key="input.id" :value="input.id" :label="input.name + (type === '问答增强' ? ' · ' + input.stage : '')"><span>{{ input.name }}</span></el-option></el-option-group>
      </el-select>
      <el-empty v-if="!candidates.length" :description="type === '问答增强' ? '暂无可增强的问答语料' : '暂无可用文本资料'"><el-button v-if="type === '问答增强'" @click="state.ui.preprocessingMode = '问答生成'; emit('navigate', 'processing')">先提取文本问答对</el-button><el-button @click="emit('navigate', 'sources')">接入资料</el-button></el-empty>
    </section>
    <section class="panel pipeline-card">
      <div class="pipeline-card-heading"><span class="pipeline-marker">02</span><div><h3>{{ name }}任务配置</h3></div><el-tag type="info">{{ type === '知识片段' ? '本地切片' : '模型结果为模拟' }}</el-tag></div>
      <el-form label-position="top" class="annotation-task-form" :disabled="running || !allowed('edit')">
        <template v-if="type === '知识片段'">
          <el-form-item label="切片类型"><el-select v-model="chunkType"><el-option value="固定大小" /><el-option value="分隔符" /><el-option value="按段落" /></el-select></el-form-item>
          <el-form-item v-if="chunkType === '固定大小'" label="切块大小（字符）"><el-input-number v-model="size" :min="1" :max="100000" :precision="0" /></el-form-item>
          <el-form-item v-else-if="chunkType === '分隔符'" label="分隔符"><el-input v-model="separator" placeholder="例如 \n\n 或 ---" /></el-form-item>
          <el-form-item v-else-if="chunkType === '按段落'" label="每块段落数"><el-input-number v-model="paragraphsPerChunk" :min="1" :max="1000" :precision="0" /></el-form-item>
        </template>
        <template v-else>
          <el-form-item label="1. 目标受众"><el-select v-model="audience"><el-option v-for="item in state.settings.audiences" :key="item.id" :value="item.id" :label="item.name" /></el-select></el-form-item>
          <el-form-item label="2. 表达模板"><el-select v-model="template"><el-option v-for="item in ['忠实原文', '简明解释', '教学讲解']" :key="item" :value="item" /></el-select></el-form-item>
          <el-form-item label="3. 使用模型"><el-select v-model="model"><el-option v-for="item in state.models.filter(item => item.status === '已上架')" :key="item.id" :value="item.id" :label="item.name" /></el-select></el-form-item>
          <el-form-item label="4. 本次提示词" class="wide-field"><el-input v-model="prompt" type="textarea" :rows="5" /><div v-if="pendingPrompt" class="prompt-update"><el-button text type="primary" @click="prompt = suggestedPrompt">应用当前受众与模板</el-button></div></el-form-item>
        </template>
      </el-form>
      <p v-if="blockingReason" class="pipeline-note" role="status">{{ blockingReason }}</p>
      <div class="pipeline-actions"><el-button type="primary" :loading="running" :disabled="!!blockingReason" @click="execute">开始{{ name }}</el-button></div>
    </section>
    <section class="panel pipeline-card">
      <div class="pipeline-card-heading"><span class="pipeline-marker">03</span><div><h3>查看结果并继续加工</h3></div><el-button @click="openHistory">历史任务记录</el-button></div>
      <el-table v-if="currentTask" :data="[currentTask]"><el-table-column label="任务" prop="name" /><el-table-column label="状态" prop="status" width="95" /><el-table-column label="进度" width="150"><template #default="{ row }"><el-progress :percentage="row.progress" :status="row.status === '失败' ? 'exception' : undefined" /></template></el-table-column><el-table-column label="说明"><template #default="{ row }">{{ row.status === '失败' ? row.logs.at(-1) : '' }}</template></el-table-column></el-table>
      <article v-if="output" class="local-output">
        <div><b>{{ name }} · {{ output.records.length }} 条</b><el-tag type="info">{{ type === '知识片段' ? '知识片段候选' : reviewedOutput ? '已保存数据集 V' + reviewedOutput.number : '待人工复核' }}</el-tag></div>
        <div v-for="(record, index) in output.records.slice(0, 2)" :key="index"><small>{{ record.title || record.source }}</small><h4 v-if="record.question">{{ record.question }}</h4><p v-if="record.question">{{ record.correctedAnswer || record.answer }}</p><pre v-else>{{ record.content }}</pre></div>
        <div class="pipeline-actions"><el-button @click="showOutput">查看完整结果</el-button><template v-if="type === '知识片段'"><el-button :disabled="!allowed('edit')" @click="saveFragments">保存为知识片段数据集</el-button><el-button type="primary" @click="continueWith('问答生成')">下一步：文本问答对提取</el-button></template><el-button v-else type="primary" @click="review">{{ reviewedOutput ? '继续编辑复核成果' : '人工审核修改并提交' }}</el-button></div>
      </article>
      <el-empty v-else-if="!running" :description="currentTask?.status === '失败' ? '任务失败，请调整输入或配置后重试' : '执行任务后在此查看结果'" :image-size="65" />
    </section>
  </div>
</template>
