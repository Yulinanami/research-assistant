<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { state, selectedSources, selectedVersions, allowed, runTask, taskName } from '../store'
import { preparationInputs, cleanBatch } from '../workflow'
import { imageCleaningSamples } from '../data'
const emit = defineEmits(['navigate'])
const type = ref('文本清洗')
const selectedIds = ref([])
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
const allInputs = computed(() => preparationInputs(selectedSources(), selectedVersions(), state.activeDataset))
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
const history = computed(() => state.tasks.filter(item => item.datasetId === state.activeDataset && item.type === type.value))
const ruleDescriptions = {
  '文档去重': '清理文档内重复内容，并在本批资料中去除完全相同的文档。',
  '格式标准化': '规范文本空白，或展示图片的目标尺寸与格式。',
  '隐私脱敏': '替换文本中的手机号和邮箱。',
  '质量过滤': '按清洗到当前步骤时的内容长度筛选资料。',
  '移除think标签': '移除 think 标签及其中的内容。',
  '重复图片去重': '按图片内容筛除本批次中的重复图片。',
  '质量筛选': '按演示尺寸与清晰度筛选图片。',
}
function resetMode() {
  const previous = state.ui.pipeline
  selectedIds.value = previous?.datasetId === state.activeDataset
    ? available.value.filter(input => previous.inputIds.includes(input.id) || previous.inputIds.includes(input.originId)).map(input => input.id)
    : available.value.map(input => input.id)
  rules.value = (type.value === '文本清洗' ? ['格式标准化', '隐私脱敏', '文档去重', '质量过滤', '移除think标签'] : ['重复图片去重', '质量筛选', '格式标准化']).map(name => ({ name, enabled: name !== '质量过滤' && name !== '移除think标签' }))
  useDemo.value = false
  trial.value = null
  previewIndex.value = 0
  taskId.value = ''
  if (type.value === '文本清洗') applyPreset()
}
watch(type, resetMode)
watch(() => state.activeDataset, () => {
  const previous = state.ui.pipeline
  const handed = previous?.datasetId === state.activeDataset ? allInputs.value.filter(input => previous.inputIds.includes(input.id) || previous.inputIds.includes(input.originId)) : []
  type.value = handed.length && handed.every(input => input.kind === 'image') ? '图片清洗' : '文本清洗'
  resetMode()
}, { immediate: true })
watch(signature, () => { trial.value = null })
function moveRule(index, offset) {
  const target = index + offset
  if (target < 0 || target >= rules.value.length) return
  const next = [...rules.value]; [next[index], next[target]] = [next[target], next[index]]; rules.value = next
}
function trySample() {
  if (!allowed('edit')) return
  try { trial.value = cleanBatch(inputs.value.slice(0, 5), config.value) }
  catch (error) { ElMessage.warning(error.message) }
}
function execute() {
  if (!inputs.value.length) return ElMessage.warning('请先选择输入资料')
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
      <div class="pipeline-card-heading"><span class="pipeline-marker">01</span><div><h3>接续预处理资料</h3><p>选择本次清洗的数据类型与输入资料，原始文件保留。</p></div><el-button @click="$emit('navigate', 'processing')">返回预处理</el-button></div>
      <div class="cleaning-type-options" role="group" aria-label="清洗类型">
        <button v-for="option in ['文本清洗', '图片清洗']" :key="option" :class="['cleaning-type-card', { selected: type === option }]" :aria-pressed="type === option" :disabled="running" @click="type = option">
          <span class="icon-tile" :class="option === '文本清洗' ? 'blue' : 'teal'"><el-icon><component :is="option === '文本清洗' ? 'Document' : 'Picture'" /></el-icon></span>
          <span><b>{{ option }}</b><small>{{ option === '文本清洗' ? '规范、脱敏、过滤与去重' : '去重、质量筛选与格式规范' }}</small></span><span class="cleaning-choice-dot"></span>
        </button>
      </div>
      <el-checkbox-group v-model="selectedIds" class="pipeline-input-list" :disabled="running">
        <label v-for="input in available" :key="input.id" class="pipeline-input-row"><el-checkbox :value="input.id">{{ input.name }}</el-checkbox><el-tag type="info">{{ input.stage }}</el-tag><small>{{ input.parser ? '使用文档解析结果' : '使用接入内容' }}</small></label>
      </el-checkbox-group>
      <el-empty v-if="!available.length" description="暂无此类型的可用资料，请返回语料管理接入或解析文件" :image-size="60" />
      <el-checkbox v-if="type === '图片清洗'" v-model="useDemo" :disabled="running">加入内置演示图片组（重复、低分辨率、模糊样例）</el-checkbox>
      <p class="pipeline-note">本次选择 {{ inputs.length }} 份资料{{ allInputs.some(input => !input.ready) ? '；未解析或内容不可用的资料需在语料管理中处理。' : '，处理结果将保留各自来源。' }}</p>
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
      <div class="pipeline-actions"><span class="muted">已启用 {{ config.rules.length }} 个步骤 · 试运行最多取前 5 份资料</span><el-button :disabled="!inputs.length || running || !allowed('edit')" @click="trySample">小样本试运行</el-button><el-button type="primary" :loading="running" :disabled="!inputs.length || running || !allowed('edit')" @click="execute">{{ running ? '正在清洗' : '执行批量清洗' }}</el-button></div>
      <div v-if="trial" class="cleaning-trial"><h4>试运行结果 <small>仅处理前 {{ trial.length }} 份，不代表全部资料的筛选统计</small></h4><el-table :data="trial"><el-table-column prop="title" label="输入资料" /><el-table-column prop="status" label="结果" width="90" /><el-table-column prop="reason" label="说明" /></el-table><details v-for="(record, index) in trial" :key="index"><summary>{{ record.title }} · 查看处理前后</summary><div class="two-cols"><template v-if="type === '文本清洗'"><pre>{{ record.before }}</pre><pre>{{ record.content }}</pre></template><template v-else><el-image :src="record.image" fit="contain" class="cleaning-image" /><pre>{{ JSON.stringify({ before: record.before, after: record.after }, null, 2) }}</pre></template></div></details></div>
    </section>

    <section class="panel pipeline-card">
      <div class="pipeline-card-heading"><span class="pipeline-marker">03</span><div><h3>查看结果并继续加工</h3><p>{{ task ? task.name : '执行完成后在此查看保留数据、过滤原因与处理前后变化。' }}</p></div><el-tag v-if="task" :type="task.status === '失败' ? 'danger' : task.status === '已完成' ? 'success' : 'info'">{{ task.status }}</el-tag></div>
      <el-progress v-if="task" :percentage="task.progress" :status="task.status === '失败' ? 'exception' : undefined" />
      <template v-if="output">
        <div class="pipeline-metrics"><div><small>输入资料</small><b>{{ output.records.length }}</b></div><div><small>保留</small><b>{{ kept.length }}</b></div><div><small>过滤</small><b>{{ output.records.length - kept.length }}</b></div></div>
        <el-table :data="output.records" highlight-current-row @row-click="row => previewIndex = output.records.indexOf(row)"><el-table-column prop="title" label="输入资料" /><el-table-column prop="status" label="结果" width="90" /><el-table-column prop="reason" label="说明" /></el-table>
        <div v-if="previewRecord" class="cleaning-result-preview"><p class="pipeline-preview-name">{{ previewRecord.title }} · 处理前后</p><div class="two-cols"><template v-if="output.type === '文本清洗'"><div><small>处理前</small><pre>{{ previewRecord.before }}</pre></div><div><small>处理后 · {{ previewRecord.status }}</small><pre>{{ previewRecord.content }}</pre></div></template><template v-else><div><small>处理前</small><el-image :src="previewRecord.image" fit="contain" class="cleaning-image" /></div><div><small>处理后 · {{ previewRecord.status }}</small><el-image v-if="previewRecord.after" :src="previewRecord.image" fit="contain" class="cleaning-image" /><pre>{{ previewRecord.after ? JSON.stringify(previewRecord.after, null, 2) : previewRecord.reason }}</pre><small v-if="previewRecord.after">目标信息为模拟，预览沿用原图。</small></div></template></div></div>
        <div class="pipeline-actions"><el-button @click="showOutput(output.id)">查看完整成果</el-button><el-button type="primary" :disabled="!kept.length || !allowed('edit')" @click="continueGeneration">进入第 5 步：数据标注<el-icon><ArrowRight /></el-icon></el-button></div>
      </template>
      <el-empty v-else-if="!running" :description="task?.status === '失败' ? '清洗失败，请检查输入并重新执行' : '尚无本次清洗结果'" :image-size="65" />
      <details v-if="task" class="cleaning-logs"><summary>执行日志</summary><pre>{{ task.logs.join('\n') }}</pre></details>
    </section>
  </div>
  <section class="panel"><div class="section-title"><div><h3>清洗任务记录</h3><p>{{ type }} · 当前数据集</p></div></div><el-table :data="history"><el-table-column prop="name" label="任务名称" /><el-table-column prop="status" label="状态" width="100" /><el-table-column prop="created" label="创建时间" min-width="170" /><el-table-column label="操作" width="170"><template #default="{ row }"><el-button link type="primary" @click="taskId = row.id; previewIndex = 0">查看结果</el-button><el-button v-if="row.versionId" link type="primary" @click="showOutput(row.versionId)">完整成果</el-button></template></el-table-column></el-table></section>
</template>
