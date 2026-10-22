<script setup>
import { computed, ref, watch } from 'vue'
import { state, selectedSources, selectedVersions, allowed, runTask, taskName } from '../store'
import { preparationInputs } from '../workflow'
import CleaningView from './CleaningView.vue'
const emit = defineEmits(['navigate'])
const workspaceKey = state.role + ':' + state.activeDataset
const stage = ref(state.ui.preprocessingStage || state.ui.preprocessing?.[workspaceKey]?.stage || 'parsing')
delete state.ui.preprocessingStage
watch(() => state.ui.preprocessingStage, value => {
  if (!['parsing','cleaning'].includes(value)) return
  stage.value = value
  delete state.ui.preprocessingStage
})
const cleaningVisited = ref(stage.value === 'cleaning')
const parsingConfig = ref(JSON.parse(JSON.stringify(state.settings.parsing)))
const inputs = computed(() => preparationInputs(selectedSources(), selectedVersions(), state.activeDataset))
const selectedIds = ref([])
const selectionEdited = ref(false)
function initialSelection(available) {
  const context = state.ui.pipeline
  const requested = new Set(context?.datasetId === state.activeDataset ? context.inputIds || [] : [])
  const versions = new Map(selectedVersions().filter(version => version.datasetId === state.activeDataset).map(version => [version.id, version]))
  // Follow old parsing versions and downstream results back to their original files.
  for (const id of requested) {
    const version = versions.get(id)
    if (!version) continue
    for (const parent of [version.sourceId, ...(version.sourceIds || []),
      ...(version.records || []).flatMap(record => [record.originId, record.sourceId, record.inputId])]) {
      if (parent) requested.add(parent)
    }
  }
  const matched = available.filter(input => requested.has(input.id) || requested.has(input.originId))
  return matched.length ? matched : available.filter(input => input.ready || input.parser)
}
watch(() => state.activeDataset, () => {
  selectionEdited.value = false
  selectedIds.value = initialSelection(inputs.value).map(input => input.id)
}, { immediate: true })
watch(inputs, (next, previous = []) => {
  const defaults = new Set(selectionEdited.value ? [] : initialSelection(next).map(input => input.id))
  const selectedOrigins = new Set(previous.filter(input => selectedIds.value.includes(input.id)).map(input => input.originId))
  selectedIds.value = next.filter(input => selectedIds.value.includes(input.id) || selectedOrigins.has(input.originId)
    || defaults.has(input.id)).map(input => input.id)
})
const selected = computed(() => inputs.value.filter(input => selectedIds.value.includes(input.id)))
const preview = computed(() => selected.value.find(input => input.ready))
const parsingTasks = computed(() => state.tasks.filter(task => task.datasetId === state.activeDataset && task.type.includes('解析')))
const selectedDocuments = computed(() => selected.value.filter(input => input.parser))
const parsingCandidates = computed(() => selectedDocuments.value.filter(input => !parsingTasks.value.some(task =>
  task.sourceId === input.originId && task.status === '执行中')))
const parsingRunning = computed(() => selectedDocuments.value.some(input => parsingTasks.value.some(task =>
  task.sourceId === input.originId && task.status === '执行中')))
const availableDocuments = computed(() => inputs.value.filter(input => input.parser))
const parsingBlockedReason = computed(() => {
  if (!allowed('edit')) return '当前角色没有编辑权限，无法启动解析。'
  if (!availableDocuments.value.length) return '暂无可解析的 PDF、Word 或 Excel 文档。文本与图片可在“数据清洗”页签直接处理，结构化条目可在“数据标注”中处理。'
  if (!selectedDocuments.value.length) return '请在上方勾选需要解析的 PDF、Word 或 Excel 文档。'
  if (!parsingCandidates.value.length) return '所选文档正在解析，请等待任务完成，或查看解析记录。'
  return ''
})
function selectDocuments() {
  selectedIds.value = availableDocuments.value.map(input => input.id)
  selectionEdited.value = true
}
const currentParsingTasks = computed(() => parsingTasks.value.filter(task => selected.value.some(input => input.originId === task.sourceId)).slice(0, 5))
watch(stage, (value, previous) => {
  if (value === 'cleaning') {
    if (previous === 'parsing') state.ui.pipeline = {datasetId:state.activeDataset,inputIds:selected.value.map(input=>input.id)}
    cleaningVisited.value = true
  }
  state.ui.preprocessing ||= {}
  state.ui.preprocessing[workspaceKey] = {stage:value}
}, {flush:'sync', immediate:true})
function parseDocuments() {
  if (!allowed('edit') || !parsingCandidates.value.length) return
  for (const input of parsingCandidates.value) {
    runTask({name:taskName(input.parser), type:input.parser, sourceId:input.originId,
      config:JSON.parse(JSON.stringify(parsingConfig.value))})
  }
}
function openTaskCenter(type) {
  state.ui.taskCenterScope = {datasetId:state.activeDataset,type}
  emit('navigate','task-center')
}
function navigateCleaning(page) {
  if (page === 'processing') stage.value = 'parsing'
  else emit('navigate',page)
}
</script>

<template>
  <section class="panel preprocessing-tabs"><div class="section-title"><div><h3>数据预处理</h3><p>先解析文档，再清洗内容；文本与图片可直接清洗，结构化数据可进入标注。</p></div><el-button @click="openTaskCenter()">任务记录<el-icon><List /></el-icon></el-button></div><el-tabs v-model="stage"><el-tab-pane label="文档解析" name="parsing" /><el-tab-pane label="数据清洗" name="cleaning" /></el-tabs></section>
  <div v-show="stage === 'parsing'" class="pipeline-stack">
    <section class="panel pipeline-card">
      <div class="pipeline-card-heading"><span class="pipeline-marker">01</span><div><h3>选择预处理资料</h3><p>勾选待解析的 PDF、Word、Excel 文件，或选择可直接清洗的文本与图片。</p></div><el-button @click="$emit('navigate', 'sources')">返回语料接入</el-button></div>
      <div class="pipeline-metrics"><div><small>已接入资料</small><b>{{ inputs.length }} <em>份</em></b></div><div><small>可继续加工</small><b>{{ inputs.filter(input => input.ready).length }} <em>份</em></b></div><div><small>待解析或检查</small><b>{{ inputs.filter(input => !input.ready).length }} <em>份</em></b></div></div>
      <el-checkbox-group v-model="selectedIds" class="pipeline-input-list" @change="selectionEdited = true">
        <label v-for="input in inputs" :key="input.id" class="pipeline-input-row">
          <el-checkbox :value="input.id">{{ input.name }}</el-checkbox><el-tag :type="input.ready ? 'success' : 'warning'">{{ input.stage }}</el-tag><small>{{ input.reason || (input.kind === 'image' ? '图片资料' : '文本内容可用') }}</small>
        </label>
      </el-checkbox-group>
      <el-empty v-if="!inputs.length" description="尚未接入资料，请先返回语料管理上传文件" />
      <p class="muted">已选择 {{ selected.length }} 份资料</p>
    </section>
    <section class="panel pipeline-card parsing-config">
      <div class="pipeline-card-heading"><span class="pipeline-marker">02</span><div><h3>配置并解析文档</h3><p>提取正文、表格与图片信息，解析成果保留来源；当前解析使用模拟结果。</p></div><el-tag type="info">模拟解析</el-tag></div>
      <el-form label-position="top" class="pipeline-parameters" :disabled="parsingRunning || !allowed('edit')">
        <el-form-item label="输出格式"><el-select v-model="parsingConfig.format"><el-option value="Markdown" /><el-option value="JSON" /></el-select></el-form-item>
        <el-form-item label="PDF 类型"><el-select v-model="parsingConfig.pdfType"><el-option value="自动识别" /><el-option value="文本型" /><el-option value="扫描型" /></el-select></el-form-item>
        <el-form-item label="提取内容"><el-checkbox-group v-model="parsingConfig.options"><el-checkbox value="表格">表格</el-checkbox><el-checkbox value="图片">图片</el-checkbox><el-checkbox value="公式">公式</el-checkbox></el-checkbox-group></el-form-item>
        <el-form-item label="Excel 工作表"><el-input v-model="parsingConfig.sheets" placeholder="全部工作表，或指定工作表名称" /></el-form-item>
      </el-form>
      <p v-if="parsingBlockedReason" class="pipeline-note" role="status">{{ parsingBlockedReason }}</p>
      <div class="pipeline-actions"><span class="muted">已选 {{ selectedDocuments.length }} 份文档{{ parsingRunning ? ' · 正在解析，完成后可继续清洗' : '' }}</span><el-button v-if="allowed('edit') && availableDocuments.length && !selectedDocuments.length" @click="selectDocuments">选择可解析文档</el-button><el-button @click="openTaskCenter('数据解析')">查看解析记录</el-button><el-button type="primary" :disabled="!!parsingBlockedReason" @click="parseDocuments">{{ parsingRunning && !parsingCandidates.length ? '解析中' : '开始解析' }}</el-button></div>
      <el-table v-if="currentParsingTasks.length" :data="currentParsingTasks"><el-table-column label="当前解析任务" prop="name" /><el-table-column label="状态" prop="status" width="100" /><el-table-column label="进度" width="160"><template #default="{row}"><el-progress :percentage="row.progress" :status="row.status === '失败' ? 'exception' : undefined" /></template></el-table-column><el-table-column label="说明"><template #default="{row}">{{ row.status === '失败' ? row.logs.at(-1) : row.status === '已完成' ? '解析结果已就绪，可继续清洗或标注' : '正在处理文档' }}</template></el-table-column></el-table>
    </section>
    <section class="panel pipeline-card">
      <div class="pipeline-card-heading"><span class="pipeline-marker">03</span><div><h3>预览解析结果与输入内容</h3><p>解析完成后自动更新正文；文本与图片保留原始内容。</p></div></div>
      <template v-if="preview"><p class="pipeline-preview-name">{{ preview.name }}</p><el-image v-if="preview.kind === 'image'" :src="preview.content" fit="contain" class="cleaning-image" /><pre v-else class="pipeline-preview">{{ preview.content.slice(0, 1200) }}</pre></template>
      <el-empty v-else description="选择一份可用资料查看预览" :image-size="60" />
    </section>
  </div>
  <div v-if="cleaningVisited" v-show="stage === 'cleaning'" class="preprocessing-cleaning"><CleaningView :key="JSON.stringify(state.ui.pipeline?.inputIds || [])" @navigate="navigateCleaning" /></div>
</template>
