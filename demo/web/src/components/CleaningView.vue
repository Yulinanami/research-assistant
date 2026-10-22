<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { state, selectedSources, selectedVersions, allowed, runTask, taskName } from '../store'
import { cleaningInputs, cleanBatch } from '../workflow'
import { imageCleaningSamples } from '../data'
const emit = defineEmits(['navigate'])
const type = ref('文本清洗')
const selectedIds = ref([])
const requestedIds = ref([])
const selectionEdited = ref(false)
const trial = ref(null)
const taskId = ref('')
const previewIndex = ref(0)
const rules = ref([])
const minChars = ref(10)
const imageConfig = ref({ minWidth: 300, minHeight: 200, minClarity: 60, maxWidth: 600, maxHeight: 600, imageFormat: 'PNG' })
const useDemo = ref(false)
const presetId = ref(state.settings.cleaningPresets[0]?.id || '')
function applyPreset() {
  const preset = state.settings.cleaningPresets.find(item=>item.id===presetId.value)
  if (!preset || type.value !== '文本清洗') return
  rules.value = [...preset.rules.map(name=>({name,enabled:true})),...['格式标准化','隐私脱敏','文档去重','质量过滤','移除think标签'].filter(name=>!preset.rules.includes(name)).map(name=>({name,enabled:false}))]
  minChars.value = preset.minChars || 10
}
const allInputs = computed(() => cleaningInputs(selectedSources(), selectedVersions(), state.activeDataset, state.ui.pipeline))
const available = computed(() => allInputs.value.filter(input => input.ready && input.kind === (type.value === '文本清洗' ? 'text' : 'image')))
const selected = computed(() => available.value.filter(input => selectedIds.value.includes(input.id)))
const inputs = computed(() => [...selected.value, ...(type.value === '图片清洗' && useDemo.value ? imageCleaningSamples().map((image, i) => ({ ...image, id: `demo-image-${i}`, kind: 'image' })) : [])])
const config = computed(() => ({ type: type.value, rules: rules.value.filter(rule => rule.enabled).map(rule => rule.name), minChars: minChars.value, ...imageConfig.value }))
const signature = computed(() => JSON.stringify({ inputs: inputs.value, config: config.value }))
const task = computed(() => state.tasks.find(item => item.id === taskId.value && item.datasetId === state.activeDataset))
const running = computed(() => task.value?.status === '执行中')
const output = computed(() => selectedVersions().find(version => version.id === task.value?.versionId))
const kept = computed(() => output.value?.records.filter(record => record.status !== '过滤') || [])
const previewRecord = computed(() => output.value?.records[previewIndex.value])
function openHistory() {state.ui.taskCenterScope = {datasetId:state.activeDataset,type:'数据清洗'};emit('navigate','task-center')}
const blockingReason = computed(() => {
  if (!allowed('edit')) return '当前身份没有清洗权限，请切换有加工权限的身份。'
  if (running.value) return '当前清洗任务正在执行，完成后可以再次试运行或批量清洗。'
  if (inputs.value.length) return ''
  if (available.value.length) return requestedIds.value.length && !selectionEdited.value
    ? '上一步选择的资料与当前清洗类型不匹配或已更新，请重新勾选可用资料。'
    : '请先在上方资料列表中勾选需要清洗的资料。'
  if (allInputs.value.some(input => input.kind === 'structured')) return '当前没有可清洗的文本或图片条目；问答等结构化数据可以直接进入数据标注。'
  return `暂无可用的${type.value === '文本清洗' ? '文本' : '图片'}资料，请切换清洗类型，或先接入并解析资料。`
})
const canExecute = computed(() => !blockingReason.value)
const ruleDescriptions = {
  '文档去重': '清理文档内重复内容，并在本批资料中去除完全相同的文档。',
  '格式标准化': '规范文本空白，或展示图片的目标尺寸与格式。',
  '隐私脱敏': '替换文本中的手机号和邮箱。',
  '质量过滤': '按清洗到当前步骤时的内容长度筛选资料。',
  '移除think标签': '移除 think 标签及其中的内容。',
  '重复图片去重': '按图片内容筛除本批次中的重复图片。',
  '质量筛选': '按演示尺寸与清晰度筛选图片。',
}
function matchesRequested(input) {
  return requestedIds.value.some(id => [input.id, input.originId, input.inputId].includes(id))
}
function selectAllInputs() {
  if (running.value || !allowed('edit')) return
  selectionEdited.value = true
  selectedIds.value = available.value.map(input => input.id)
}
function resetMode(useHandoff = true) {
  const previous = state.ui.pipeline
  requestedIds.value = useHandoff && previous?.datasetId === state.activeDataset && Array.isArray(previous.inputIds) ? [...previous.inputIds] : []
  selectionEdited.value = false
  selectedIds.value = available.value.filter(input => !requestedIds.value.length || matchesRequested(input)).map(input => input.id)
  rules.value = (type.value === '文本清洗' ? ['格式标准化', '隐私脱敏', '文档去重', '质量过滤', '移除think标签'] : ['重复图片去重', '质量筛选', '格式标准化']).map(name => ({ name, enabled: name !== '质量过滤' && name !== '移除think标签' }))
  useDemo.value = false
  trial.value = null
  previewIndex.value = 0
  taskId.value = ''
  if (type.value === '文本清洗') applyPreset()
}
let resettingDataset = false
watch(type, () => { if (!resettingDataset) resetMode(false) }, { flush: 'sync' })
watch(() => state.activeDataset, () => {
  const previous = state.ui.pipeline
  const ids = previous?.datasetId === state.activeDataset && Array.isArray(previous.inputIds) ? previous.inputIds : []
  const handed = allInputs.value.filter(input => input.ready && ['text','image'].includes(input.kind) && ids.some(id => [input.id, input.originId, input.inputId].includes(id)))
  resettingDataset = true
  type.value = handed.length && handed.every(input => input.kind === 'image') ? '图片清洗' : '文本清洗'
  resetMode()
  resettingDataset = false
}, { immediate: true })
watch(available, (next, previous = []) => {
  if (!selectionEdited.value) {
    selectedIds.value = next.filter(input => !requestedIds.value.length || matchesRequested(input)).map(input => input.id)
    return
  }
  const selectedOrigins = new Set(previous.filter(input => selectedIds.value.includes(input.id) && !next.some(item => item.id === input.id)).map(input => input.originId).filter(Boolean))
  selectedIds.value = next.filter(input => selectedIds.value.includes(input.id) || selectedOrigins.has(input.originId)).map(input => input.id)
})
watch(signature, () => { trial.value = null })
function moveRule(index, offset) {
  const target = index + offset
  if (target < 0 || target >= rules.value.length) return
  const next = [...rules.value]; [next[index], next[target]] = [next[target], next[index]]; rules.value = next
}
function trySample() {
  if (!canExecute.value) return ElMessage.warning(blockingReason.value)
  try { trial.value = cleanBatch(inputs.value.slice(0, 5), config.value) }
  catch (error) { ElMessage.warning(error.message) }
}
function execute() {
  if (!canExecute.value) return ElMessage.warning(blockingReason.value)
  const snapshot = JSON.parse(signature.value)
  const created = runTask({ name: taskName(type.value), datasetId: state.activeDataset, type: type.value,
    sourceId: inputs.value[0].id, sourceIds: inputs.value.map(input => input.id),
    config: { ...snapshot.config, inputs: snapshot.inputs, pipeline: true } })
  if (created) { taskId.value = created.id; previewIndex.value = 0 }
}
function continueGeneration() {
  if (!output.value || !kept.value.length) return ElMessage.warning('本次没有保留的数据，请调整规则后重试')
  state.ui.pipeline = { datasetId: state.activeDataset, inputIds: [output.value.id], generationType: output.value.type === '图片清洗' ? '图片分类' : '知识片段' }
  state.focusVersion = output.value.id
  emit('navigate', 'generation')
}
function showOutput(versionId) { state.focusVersion = versionId; emit('navigate', 'versions') }
</script>

<template>
  <div class="pipeline-stack cleaning-workspace">
    <section class="panel pipeline-card">
      <div class="pipeline-card-heading"><span class="pipeline-marker">01</span><div><h3>选择清洗资料</h3><p>接续文档解析结果，或选择文本与图片，原始文件保留。</p></div><el-button @click="$emit('navigate', 'processing')">返回文档解析</el-button></div>
      <div class="cleaning-type-options" role="group" aria-label="清洗类型">
        <button v-for="option in ['文本清洗', '图片清洗']" :key="option" :class="['cleaning-type-card', { selected: type === option }]" :aria-pressed="type === option" :disabled="running" @click="type = option">
          <span class="icon-tile" :class="option === '文本清洗' ? 'blue' : 'teal'"><el-icon><component :is="option === '文本清洗' ? 'Document' : 'Picture'" /></el-icon></span>
          <span><b>{{ option }}</b><small>{{ option === '文本清洗' ? '规范、脱敏、过滤与去重' : '去重、质量筛选与格式规范' }}</small></span><span class="cleaning-choice-dot"></span>
        </button>
      </div>
      <el-checkbox-group v-model="selectedIds" class="pipeline-input-list" :disabled="running" @change="selectionEdited = true">
        <label v-for="input in available" :key="input.id" class="pipeline-input-row"><el-checkbox :value="input.id">{{ input.name }}</el-checkbox><el-tag type="info">{{ input.stage }}</el-tag><small>{{ input.parser ? '使用文档解析结果' : '使用接入内容' }}</small></label>
      </el-checkbox-group>
      <el-empty v-if="!available.length" description="暂无此类型的可用资料，请先在文档解析页签完成解析，或到语料接入上传文件" :image-size="60" />
      <el-checkbox v-if="type === '图片清洗'" v-model="useDemo" :disabled="running">加入内置演示图片组（重复、低分辨率、模糊样例）</el-checkbox>
      <p class="pipeline-note">本次选择 {{ inputs.length }} 份资料{{ allInputs.some(input => !input.ready) ? '；未解析的文档需先在文档解析页签处理。' : '，处理结果将保留各自来源。' }}</p>
    </section>

    <section class="panel pipeline-card">
      <div class="pipeline-card-heading"><span class="pipeline-marker">02</span><div><h3>配置清洗流水线</h3><p>从上到下执行；可以启用步骤、调整顺序，并先试运行查看样本变化。</p></div><el-tag type="info">模拟执行</el-tag></div>
      <div v-if="type === '文本清洗'" class="toolbar"><el-select v-model="presetId" :disabled="running" placeholder="选择常用配置"><el-option v-for="preset in state.settings.cleaningPresets" :key="preset.id" :value="preset.id" :label="preset.name" /></el-select><el-button :disabled="running || !allowed('edit')" @click="applyPreset">应用预设</el-button><el-button text @click="$emit('navigate','settings')">管理常用配置</el-button></div>
      <div class="cleaning-rule-list">
        <div v-for="(rule, index) in rules" :key="rule.name" :class="['cleaning-rule', { disabled: !rule.enabled }]">
          <span class="cleaning-rule-order">{{ String(index + 1).padStart(2, '0') }}</span><div class="cleaning-rule-body"><el-checkbox v-model="rule.enabled" :disabled="running">{{ rule.name }}</el-checkbox><p>{{ ruleDescriptions[rule.name] }}</p></div>
          <div class="cleaning-rule-move"><el-button text :disabled="running || index === 0" :aria-label="`上移${rule.name}`" @click="moveRule(index, -1)">↑</el-button><el-button text :disabled="running || index === rules.length - 1" :aria-label="`下移${rule.name}`" @click="moveRule(index, 1)">↓</el-button></div>
        </div>
      </div>
      <el-form v-if="type === '文本清洗' && config.rules.includes('质量过滤')" label-position="top" class="pipeline-parameters"><el-form-item label="最低内容长度（字符）"><el-input-number v-model="minChars" :disabled="running" :min="1" :max="100000" /></el-form-item></el-form>
      <template v-if="type === '图片清洗'">
        <el-form label-position="top" class="pipeline-parameters">
          <el-form-item label="最低宽度（像素）"><el-input-number v-model="imageConfig.minWidth" :disabled="running" :min="1" /></el-form-item><el-form-item label="最低高度（像素）"><el-input-number v-model="imageConfig.minHeight" :disabled="running" :min="1" /></el-form-item><el-form-item label="最低清晰度（模拟）"><el-input-number v-model="imageConfig.minClarity" :disabled="running" :min="0" :max="100" /></el-form-item>
          <el-form-item label="目标最大宽度"><el-input-number v-model="imageConfig.maxWidth" :disabled="running" :min="1" /></el-form-item><el-form-item label="目标最大高度"><el-input-number v-model="imageConfig.maxHeight" :disabled="running" :min="1" /></el-form-item><el-form-item label="目标格式"><el-select v-model="imageConfig.imageFormat" :disabled="running"><el-option v-for="format in ['PNG', 'JPEG', 'WEBP']" :key="format" :value="format" /></el-select></el-form-item>
        </el-form>
        <p class="pipeline-note">上传图片使用演示尺寸 900×500、清晰度 90；格式与尺寸仅展示目标信息，未转换图片文件。</p>
      </template>
      <p v-if="blockingReason" class="pipeline-note" role="status">{{ blockingReason }}</p>
      <div class="pipeline-actions"><span class="muted">已启用 {{ config.rules.length }} 个步骤 · 试运行最多取前 5 份资料</span><el-button v-if="!inputs.length && available.length && !running && allowed('edit')" @click="selectAllInputs">选择可用资料</el-button><el-button :disabled="!canExecute" @click="trySample">小样本试运行</el-button><el-button type="primary" :loading="running" :disabled="!canExecute" @click="execute">{{ running ? '正在清洗' : '执行批量清洗' }}</el-button></div>
      <div v-if="trial" class="cleaning-trial"><h4>试运行结果 <small>仅处理前 {{ trial.length }} 份，不代表全部资料的筛选统计</small></h4><el-table :data="trial"><el-table-column prop="title" label="输入资料" /><el-table-column prop="status" label="结果" width="90" /><el-table-column prop="reason" label="说明" /></el-table><details v-for="(record, index) in trial" :key="index"><summary>{{ record.title }} · 查看处理前后</summary><div class="two-cols"><template v-if="type === '文本清洗'"><pre>{{ record.before }}</pre><pre>{{ record.content }}</pre></template><template v-else><el-image :src="record.image" fit="contain" class="cleaning-image" /><pre>{{ JSON.stringify({ before: record.before, after: record.after }, null, 2) }}</pre></template></div></details></div>
    </section>

    <section class="panel pipeline-card">
      <div class="pipeline-card-heading"><span class="pipeline-marker">03</span><div><h3>查看结果并继续加工</h3><p>{{ task ? task.name : '执行完成后在此查看保留数据、过滤原因与处理前后变化。' }}</p></div><el-tag v-if="task" :type="task.status === '失败' ? 'danger' : task.status === '已完成' ? 'success' : 'info'">{{ task.status }}</el-tag></div>
      <el-progress v-if="task" :percentage="task.progress" :status="task.status === '失败' ? 'exception' : undefined" />
      <template v-if="output">
        <div class="pipeline-metrics"><div><small>输入资料</small><b>{{ output.records.length }}</b></div><div><small>保留</small><b>{{ kept.length }}</b></div><div><small>过滤</small><b>{{ output.records.length - kept.length }}</b></div></div>
        <el-table :data="output.records" highlight-current-row @row-click="row => previewIndex = output.records.indexOf(row)"><el-table-column prop="title" label="输入资料" /><el-table-column prop="status" label="结果" width="90" /><el-table-column prop="reason" label="说明" /></el-table>
        <div v-if="previewRecord" class="cleaning-result-preview"><p class="pipeline-preview-name">{{ previewRecord.title }} · 处理前后</p><div class="two-cols"><template v-if="output.type === '文本清洗'"><div><small>处理前</small><pre>{{ previewRecord.before }}</pre></div><div><small>处理后 · {{ previewRecord.status }}</small><pre>{{ previewRecord.content }}</pre></div></template><template v-else><div><small>处理前</small><el-image :src="previewRecord.image" fit="contain" class="cleaning-image" /></div><div><small>处理后 · {{ previewRecord.status }}</small><el-image v-if="previewRecord.after" :src="previewRecord.image" fit="contain" class="cleaning-image" /><pre>{{ previewRecord.after ? JSON.stringify(previewRecord.after, null, 2) : previewRecord.reason }}</pre><small v-if="previewRecord.after">目标信息为模拟，预览沿用原图。</small></div></template></div></div>
        <div class="pipeline-actions"><el-button @click="showOutput(output.id)">查看完整成果</el-button><el-button type="primary" :disabled="!kept.length || !allowed('edit')" @click="continueGeneration">下一步：数据标注<el-icon><ArrowRight /></el-icon></el-button></div>
      </template>
      <el-empty v-else-if="!running" :description="task?.status === '失败' ? '清洗失败，请检查输入并重新执行' : '尚无本次清洗结果'" :image-size="65" />
      <details v-if="task" class="cleaning-logs"><summary>执行日志</summary><pre>{{ task.logs.join('\n') }}</pre></details>
    </section>
  </div>
  <section class="panel cleaning-history-entry"><span class="muted">清洗任务记录集中保存在任务管理中心。</span><el-button @click="openHistory">查看清洗记录<el-icon><ArrowRight /></el-icon></el-button></section>
</template>
