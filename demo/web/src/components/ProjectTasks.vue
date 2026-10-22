<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { state, allowed, runTask, startProjectFlow, retryProjectFlow, notify, visibleProjects, openProject, datasetName } from '../store'

const emit = defineEmits(['navigate'])
const search = ref('')
const projectId = ref('')
const status = ref('')
const detail = ref(null)
const sourceId = ref('')
const projects = computed(visibleProjects)
const taskStatuses = computed(() => [...new Set(['执行中', '标注中', '已提交', '已完成', '失败',
  ...state.tasks.filter(task => allowed('view', task.datasetId)).map(task => task.status)])])
const project = computed(() => projects.value.find(item => item.id === projectId.value))
const datasets = computed(() => state.datasets.filter(item => item.projectId === project.value?.id && allowed('view', item.id)))
const tasks = computed(() => state.tasks.filter(task => allowed('view', task.datasetId)
  && projects.value.some(item => item.id === task.projectId)
  && (!projectId.value || task.projectId === projectId.value)
  && (!status.value || task.status === status.value)
  && task.name.toLowerCase().includes(search.value.trim().toLowerCase())))
const flows = computed(() => state.flows.filter(flow => allowed('view', flow.datasetId)
  && projects.value.some(item => item.id === flow.projectId)
  && (!projectId.value || flow.projectId === projectId.value)))
const sources = computed(() => project.value && state.activeProjectId === project.value.id
  ? state.sources.filter(source => source.datasetId === state.activeDataset && allowed('view', source.datasetId) && !source.content?.startsWith('data:image/')) : [])
const projectName = id => projects.value.find(item => item.id === id)?.name || '未关联项目'

function selectProject(id) {
  sourceId.value = ''
  if (id && !openProject(id)) projectId.value = ''
}
watch(() => projects.value.map(item => item.id), ids => {
  if (projectId.value && !ids.includes(projectId.value)) projectId.value = ''
})
watch(() => [state.role, state.activeDataset], () => { sourceId.value = ''; detail.value = null })

async function rename(task) {
  if (!allowed('edit', task.datasetId)) return
  try {
    const { value } = await ElMessageBox.prompt('为任务设置便于辨认的名称', '重命名任务', {
      inputValue: task.name, inputValidator: value => Boolean(value?.trim()) || '名称不能为空',
    })
    task.name = value.trim()
    notify('任务名称已更新')
  } catch {}
}
function openResult(item, versionId, page = 'versions') {
  if (!openProject(item.projectId, item.datasetId)) return
  state.focusVersion = versionId || ''
  if (page === 'generation') state.ui.annotationMode = '问答人工复核'
  emit('navigate', page)
}
function executeFlow() {
  try {
    if (!project.value || !sourceId.value) return ElMessage.warning('请选择项目和输入资料')
    if (!openProject(project.value.id, state.activeDataset)) return
    startProjectFlow(sourceId.value)
  } catch (error) { ElMessage.warning(error.message) }
}
</script>

<template>
  <section class="panel task-list-panel">
    <div class="section-title"><div><h3>加工任务记录</h3><p>汇总各项目的任务，查看成果时回到任务所属项目。</p></div><el-tag type="info">{{ tasks.length }} 项任务</el-tag></div>
    <div class="task-filters">
      <el-select v-model="projectId" clearable placeholder="全部项目" aria-label="筛选项目" @change="selectProject">
        <el-option v-for="item in projects" :key="item.id" :value="item.id" :label="item.name" />
      </el-select>
      <el-select v-model="status" clearable placeholder="全部状态" aria-label="筛选任务状态">
        <el-option v-for="item in taskStatuses" :key="item" :value="item" :label="item" />
      </el-select>
      <el-input v-model="search" clearable placeholder="搜索任务名称" aria-label="搜索任务名称" class="task-search" />
    </div>
    <el-table :data="tasks" empty-text="暂无符合条件的加工任务">
      <el-table-column label="任务名称" prop="name" min-width="250" />
      <el-table-column label="所属项目" min-width="130"><template #default="{ row }">{{ projectName(row.projectId) }}</template></el-table-column>
      <el-table-column label="目标数据集" min-width="180"><template #default="{ row }">{{ datasetName(row.datasetId) }}</template></el-table-column>
      <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="row.status === '失败' ? 'danger' : row.status === '已完成' ? 'success' : 'primary'">{{ row.status }}</el-tag></template></el-table-column>
      <el-table-column label="进度" width="140"><template #default="{ row }"><el-progress :percentage="row.progress" /></template></el-table-column>
      <el-table-column label="操作" width="220"><template #default="{ row }">
        <el-button link type="primary" @click="detail = row">详情</el-button>
        <el-button v-if="row.versionId" link type="primary" @click="openResult(row, row.versionId)">查看成果</el-button>
        <el-button link type="primary" :disabled="!allowed('edit', row.datasetId)" @click="rename(row)">改名</el-button>
        <el-button v-if="row.status === '失败' && !row.flowRunId" link type="primary" :disabled="!allowed('edit', row.datasetId)" @click="runTask({ ...JSON.parse(JSON.stringify(row)), id: undefined, fail: false })">重试</el-button>
      </template></el-table-column>
    </el-table>
  </section>

  <section class="panel">
    <div class="section-title"><div><h3>预设流程</h3><p>按顺序自动执行耗时步骤，完成后等待人工复核。选择项目后可配置流程。</p></div><el-tag type="info">自动衔接</el-tag></div>
    <el-collapse v-if="project" :key="project.id" class="task-flow-config">
      <el-collapse-item :title="project.name + ' · 配置并运行流程'" name="config">
        <p class="muted">当前为浏览器本地演示，刷新会中断流程。</p>
        <div class="flow-preset"><span>按需解析</span><el-icon><ArrowRight /></el-icon><el-checkbox-group v-model="project.flowSteps" :disabled="!allowed('edit')"><el-checkbox v-for="step in ['文本清洗', '知识片段', '问答生成']" :key="step" :value="step">{{ step }}</el-checkbox></el-checkbox-group><el-icon><ArrowRight /></el-icon><b>等待人工复核</b></div>
        <div class="task-filters">
          <el-select v-model="state.activeDataset" aria-label="流程目标数据集" placeholder="选择目标数据集"><el-option v-for="dataset in datasets" :key="dataset.id" :value="dataset.id" :label="dataset.name" /></el-select>
          <el-select v-model="sourceId" placeholder="选择输入资料" aria-label="流程输入资料"><el-option v-for="source in sources" :key="source.id" :value="source.id" :label="source.name" /></el-select>
          <el-button type="primary" :disabled="!allowed('edit') || !sourceId" @click="executeFlow">按预设流程运行</el-button>
        </div>
      </el-collapse-item>
    </el-collapse>
    <el-table :data="flows" empty-text="暂无预设流程记录">
      <el-table-column label="流程" prop="name" min-width="230" />
      <el-table-column label="所属项目" min-width="130"><template #default="{ row }">{{ projectName(row.projectId) }}</template></el-table-column>
      <el-table-column label="目标数据集" min-width="180"><template #default="{ row }">{{ datasetName(row.datasetId) }}</template></el-table-column>
      <el-table-column label="当前步骤" min-width="130"><template #default="{ row }">{{ row.steps[row.index]?.type || '人工复核' }}</template></el-table-column>
      <el-table-column label="状态" prop="status" width="130" />
      <el-table-column label="操作" width="210"><template #default="{ row }">
        <el-button v-if="['失败', '已中断'].includes(row.status)" link type="primary" :disabled="!allowed('edit', row.datasetId)" @click="retryProjectFlow(row.id)">重试当前步骤</el-button>
        <el-button v-if="row.status === '已完成'" link type="primary" @click="openResult(row, row.lastOutput)">查看成果</el-button>
        <el-button v-if="row.status === '等待复核'" link type="primary" @click="openResult(row, row.lastOutput, 'generation')">人工复核</el-button>
      </template></el-table-column>
    </el-table>
  </section>
  <el-drawer :model-value="Boolean(detail)" title="加工任务详情" size="620" @close="detail = null"><template v-if="detail"><h3>{{ detail.name }}</h3><p class="muted spaced">{{ projectName(detail.projectId) }} · {{ detail.created }} · {{ detail.status }}</p><pre>{{ detail.logs.join('\n') }}</pre><details><summary>本次配置快照</summary><pre>{{ JSON.stringify(detail.config || {}, null, 2) }}</pre></details><el-button v-if="detail.versionId" type="primary" class="spaced" @click="openResult(detail, detail.versionId)">查看项目内成果</el-button></template></el-drawer>
</template>
