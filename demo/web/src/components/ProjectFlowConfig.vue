<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { state, visibleProjects, projectDatasets, allowed, openProject, startProjectFlow, notify } from '../store'
import { parserType } from '../workflow'

const emit = defineEmits(['started'])
const datasetId = ref(state.activeDataset)
const sourceId = ref('')
const starting = ref(false)
const project = computed(() => visibleProjects().find(item => item.id === state.activeProjectId))
const datasets = computed(projectDatasets)
const steps = ['文本清洗', '知识片段', '问答生成']
const flowSteps = computed({
  get: () => project.value?.flowSteps || steps,
  set: value => { if (project.value && allowed('edit', datasetId.value)) project.value.flowSteps = value },
})
const sources = computed(() => datasets.value.some(item => item.id === datasetId.value)
  ? state.sources.filter(source => source.datasetId === datasetId.value
    && (parserType(source) || (source.content?.trim() && !source.content.startsWith('data:') && !source.importedVersionId))) : [])
const blockingReason = computed(() => {
  if (!project.value || !datasets.value.some(item => item.id === datasetId.value)) return '请先为当前项目规划一个数据集。'
  if (!allowed('edit', datasetId.value)) return '当前角色没有编辑此数据集的权限。'
  if (!flowSteps.value.length) return '请至少选择一个自动执行步骤。'
  if (!sources.value.length) return '当前数据集暂无可用的文本或文档，请先接入资料。'
  if (!sources.value.some(source => source.id === sourceId.value)) return '请选择本次流程的输入资料。'
  return ''
})
watch(datasetId, () => { sourceId.value = '' }, { flush: 'sync' })
watch(() => [state.activeProjectId, state.activeDataset], () => {
  datasetId.value = state.activeDataset
  sourceId.value = ''
})
function executeFlow() {
  if (starting.value) return
  if (blockingReason.value) return ElMessage.warning(blockingReason.value)
  const input = sourceId.value
  starting.value = true
  try {
    if (!openProject(project.value.id, datasetId.value)) return
    const flow = startProjectFlow(input)
    if (flow) {
      notify('预设流程已启动，可在任务管理中心查看进度')
      emit('started', flow)
    }
  } catch (error) { ElMessage.warning(error.message) }
  finally { starting.value = false }
}
</script>

<template>
  <div class="project-flow-config">
    <p class="muted">为当前项目配置自动执行步骤；启动时保存配置快照，后续修改不影响已启动的流程。</p>
    <el-form label-position="top">
      <el-form-item label="所属项目"><b>{{ project?.name || '未选择项目' }}</b></el-form-item>
      <el-form-item label="目标数据集"><el-select v-model="datasetId" placeholder="选择目标数据集" aria-label="流程目标数据集"><el-option v-for="dataset in datasets" :key="dataset.id" :value="dataset.id" :label="dataset.name" /></el-select></el-form-item>
      <el-form-item label="自动执行步骤"><el-checkbox-group v-model="flowSteps" :disabled="!allowed('edit', datasetId)"><el-checkbox v-for="step in steps" :key="step" :value="step">{{ step }}</el-checkbox></el-checkbox-group></el-form-item>
      <p class="pipeline-note">按“文档解析（按需）→ 文本清洗 → 知识片段 → 问答生成”的顺序执行所选步骤。生成问答后等待人工复核，其它流程完成后可查看成果。</p>
      <el-form-item label="输入资料"><el-select v-model="sourceId" placeholder="选择文本、PDF、Word 或 Excel" aria-label="流程输入资料" :disabled="!allowed('edit', datasetId)"><el-option v-for="source in sources" :key="source.id" :value="source.id" :label="source.name" /></el-select></el-form-item>
    </el-form>
    <p v-if="blockingReason" class="pipeline-note" role="status">{{ blockingReason }}</p>
    <p class="muted">当前流程在浏览器本地执行，刷新会中断任务；可在任务管理中心重试。</p>
    <div class="pipeline-actions"><el-button type="primary" :disabled="!!blockingReason" :loading="starting" @click="executeFlow">启动预设流程</el-button></div>
  </div>
</template>
