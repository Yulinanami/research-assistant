<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Delete } from '@element-plus/icons-vue'
import { state, allowed, runTask, retryProjectFlow, notify, visibleProjects, openProject, datasetName, removeTaskRecord } from '../store'
import { taskCategory, taskDuration, taskModel, taskSummary } from '../tasks'
import { isDatasetVersion } from '../domain'

const emit = defineEmits(['navigate'])
const scope = state.ui.taskCenterScope
delete state.ui.taskCenterScope
const search = ref('')
const projectId = ref(scope?.projectId || '')
const status = ref('')
const type = ref(scope?.type || '')
const datasetId = ref(scope?.datasetId || '')
const pageNo = ref(1)
const pageSize = ref(10)
const currentTime = ref(Date.now())
let timer
onMounted(() => {timer = setInterval(() => {currentTime.value = Date.now()}, 1000)})
onBeforeUnmount(() => clearInterval(timer))
const detail = ref(null)
const flowStatus = ref('')
const projects = computed(visibleProjects)
const taskStatuses = computed(() => [...new Set(['执行中', '标注中', '已提交', '已完成', '失败',
  ...state.tasks.filter(task => allowed('view', task.datasetId)).map(task => task.status)])])
const visibleTasks = computed(() => state.tasks.filter(task => allowed('view',task.datasetId) && projects.value.some(item => item.id === task.projectId)))
const taskTypes = computed(() => [...new Set(['数据解析','数据清洗','知识片段','知识编译','知识图谱','问答生成','问答增强','图片描述','图片问答','数据标注',...visibleTasks.value.map(taskCategory)])])
const filterDatasets = computed(() => state.datasets.filter(item => allowed('view',item.id) && (!projectId.value || item.projectId === projectId.value)))
const tasks = computed(() => visibleTasks.value.filter(task =>
  (!datasetId.value || task.datasetId === datasetId.value)
  && (!type.value || taskCategory(task) === type.value)
  && (!projectId.value || task.projectId === projectId.value)
  && (!status.value || task.status === status.value)
  && [task.name,task.type,datasetName(task.datasetId)].join(' ').toLowerCase().includes(search.value.trim().toLowerCase())))
const pagedTasks = computed(() => tasks.value.slice((pageNo.value - 1) * pageSize.value, pageNo.value * pageSize.value))
watch([search,projectId,status,type,datasetId,pageSize], () => {pageNo.value = 1})
watch(() => tasks.value.length, length => {pageNo.value = Math.min(pageNo.value, Math.max(1,Math.ceil(length/pageSize.value)))})
const flows = computed(() => state.flows.filter(flow => allowed('view', flow.datasetId)
  && projects.value.some(item => item.id === flow.projectId)
  && (!projectId.value || flow.projectId === projectId.value)
  && (!datasetId.value || flow.datasetId === datasetId.value)
  && (!flowStatus.value || flow.status === flowStatus.value)
  && [flow.name,datasetName(flow.datasetId)].join(' ').toLowerCase().includes(search.value.trim().toLowerCase())))
const projectName = id => projects.value.find(item => item.id === id)?.name || '未关联项目'

function selectProject() {
  if (datasetId.value && !filterDatasets.value.some(item => item.id === datasetId.value)) datasetId.value = ''
}
watch(() => projects.value.map(item => item.id), ids => {
  if (projectId.value && !ids.includes(projectId.value)) projectId.value = ''
})
watch(() => [state.role, state.activeDataset], () => { detail.value = null })

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
function refresh() {currentTime.value = Date.now(); notify('已刷新本地任务记录')}
async function remove(task) {
  if (!allowed('edit',task.datasetId)) return
  try {
    await ElMessageBox.confirm('删除这条任务记录？已生成的成果与原始资料会保留。','删除任务记录',{type:'warning'})
    if (removeTaskRecord(task.id)) {if(detail.value?.id===task.id) detail.value=null;notify('任务记录已删除')}
  } catch (error) {if(error instanceof Error) ElMessage.warning(error.message)}
}
function retry(task) {
  const created = runTask({...JSON.parse(JSON.stringify(task)),fail:false})
  if (created) detail.value=created
}
function openResult(item, versionId, page = 'versions') {
  if (!openProject(item.projectId, item.datasetId)) return
  state.focusVersion = versionId || ''
  if (page === 'generation') {
    const version = state.versions.find(record => record.id === state.focusVersion && record.datasetId === item.datasetId)
    if (version && !isDatasetVersion(version) && ['问答生成', '问答增强'].includes(version.type)) {
      state.ui.preprocessingMode = version.type
      state.ui.preprocessingReview = { datasetId: item.datasetId, versionId: version.id }
      emit('navigate', 'processing')
      return
    }
    state.ui.annotationMode = '问答人工复核'
  }
  emit('navigate', page)
}
</script>

<template>
  <section class="panel task-list-panel task-center-panel">
    <div class="section-title"><div><h3><el-icon><List /></el-icon>任务管理中心</h3><p>集中查看解析、清洗、生成与标注任务；任务状态自动更新。</p></div><el-tag type="info">{{ tasks.length }} 项任务</el-tag></div>
    <div class="task-filters">
      <el-select v-model="status" clearable placeholder="全部状态" aria-label="筛选任务状态"><el-option v-for="item in taskStatuses" :key="item" :value="item" :label="item" /></el-select>
      <el-select v-model="type" clearable placeholder="全部任务类型" aria-label="筛选任务类型"><el-option v-for="item in taskTypes" :key="item" :value="item" :label="item" /></el-select>
      <el-select v-model="projectId" clearable placeholder="全部项目" aria-label="筛选项目" @change="selectProject"><el-option v-for="item in projects" :key="item.id" :value="item.id" :label="item.name" /></el-select>
      <el-select v-model="datasetId" clearable placeholder="全部数据集" aria-label="筛选任务数据集"><el-option v-for="item in filterDatasets" :key="item.id" :value="item.id" :label="item.name" /></el-select>
      <el-input v-model="search" clearable placeholder="搜索任务、类型或数据集" aria-label="搜索任务名称" class="task-search" />
      <el-button circle aria-label="刷新任务记录" title="刷新任务记录" @click="refresh"><el-icon><Refresh /></el-icon></el-button>
    </div>
    <el-table :data="pagedTasks" empty-text="暂无符合条件的任务记录">
      <el-table-column label="任务类型" min-width="125"><template #default="{row}"><b>{{ row.type }}</b><small class="task-project-name">{{ state.projects.find(p => p.id === row.projectId)?.name }} · {{ datasetName(row.datasetId) }}</small></template></el-table-column>
      <el-table-column label="状态" width="95"><template #default="{row}"><el-tag :type="row.status === '失败' ? 'danger' : row.status === '已完成' ? 'success' : 'primary'">{{ row.status }}</el-tag></template></el-table-column>
      <el-table-column label="进度" min-width="160"><template #default="{row}"><el-progress :percentage="Math.max(0,Math.min(100,row.progress || 0))" :show-text="false" :status="row.status === '失败' ? 'exception' : undefined" /><small class="task-progress-caption">{{ Number.isFinite(row.totalItems) ? (row.processedItems || 0) + ' / ' + row.totalItems + ' · ' : '' }}{{ row.progress || 0 }}%</small></template></el-table-column>
      <el-table-column label="创建时间" prop="created" min-width="165" />
      <el-table-column label="运行时间" width="105"><template #default="{row}">{{ taskDuration(row,currentTime) }}</template></el-table-column>
      <el-table-column label="使用模型" min-width="145"><template #default="{row}">{{ taskModel(row,state.models) }}</template></el-table-column>
      <el-table-column label="备注" min-width="250"><template #default="{row}"><p class="task-summary">{{ taskSummary(row,state.versions) }}</p><small class="muted">{{ row.name }}</small></template></el-table-column>
      <el-table-column label="操作" width="225" fixed="right"><template #default="{row}">
        <el-button link type="primary" @click="detail = row">详情</el-button>
        <el-button v-if="row.versionId" link type="primary" @click="openResult(row,row.versionId)">成果</el-button>
        <el-button v-if="row.status === '失败' && !row.flowRunId" link type="primary" :disabled="!allowed('edit',row.datasetId)" @click="retry(row)">重试</el-button>
        <el-button link type="primary" :disabled="!allowed('edit',row.datasetId)" @click="rename(row)">改名</el-button>
        <el-button link type="danger" :disabled="!allowed('edit',row.datasetId) || row.status === '执行中' || state.flows.some(flow => flow.id === row.flowRunId && flow.status === '执行中')" :aria-label="'删除任务记录 ' + row.name" @click="remove(row)"><el-icon><Delete /></el-icon></el-button>
      </template></el-table-column>
    </el-table>
    <el-pagination v-model:current-page="pageNo" v-model:page-size="pageSize" :page-sizes="[10,20,50]" :total="tasks.length" layout="total, sizes, prev, pager, next" />
  </section>

  <section class="panel task-center-panel">
    <div class="section-title"><div><h3>预设流程执行记录</h3><p>在数据加工项目内通过“流程配置”发起；在此跟踪执行、重试或进入人工复核。按上方项目、数据集和搜索条件筛选。</p></div><el-tag type="info">{{ flows.length }} 条流程</el-tag></div>
    <div class="task-filters"><el-select v-model="flowStatus" clearable placeholder="全部流程状态" aria-label="筛选流程状态"><el-option v-for="item in ['执行中','等待复核','已完成','失败','已中断']" :key="item" :value="item" /></el-select></div>
    <el-table :data="flows" empty-text="暂无预设流程记录">
      <el-table-column label="流程" prop="name" min-width="230" />
      <el-table-column label="所属项目" min-width="130"><template #default="{ row }">{{ projectName(row.projectId) }}</template></el-table-column>
      <el-table-column label="目标数据集" min-width="180"><template #default="{ row }">{{ datasetName(row.datasetId) }}</template></el-table-column>
      <el-table-column label="当前步骤" min-width="130"><template #default="{ row }">{{ row.steps[row.index]?.type || (row.status === '等待复核' ? '人工复核' : '流程结束') }}</template></el-table-column>
      <el-table-column label="状态" width="130"><template #default="{ row }"><el-tag :type="row.status === '失败' ? 'danger' : row.status === '已完成' ? 'success' : 'primary'">{{ row.status }}</el-tag></template></el-table-column>
      <el-table-column label="说明" min-width="190"><template #default="{ row }">{{ row.error || '已完成 ' + row.index + ' / ' + row.steps.length + ' 步' }}</template></el-table-column>
      <el-table-column label="操作" width="210"><template #default="{ row }">
        <el-button v-if="['失败', '已中断'].includes(row.status)" link type="primary" :disabled="!allowed('edit', row.datasetId)" @click="retryProjectFlow(row.id)">重试当前步骤</el-button>
        <el-button v-if="row.status === '已完成'" link type="primary" @click="openResult(row, row.lastOutput)">查看成果</el-button>
        <el-button v-if="row.status === '等待复核'" link type="primary" @click="openResult(row, row.lastOutput, 'generation')">人工复核</el-button>
      </template></el-table-column>
    </el-table>
  </section>
  <el-drawer :model-value="Boolean(detail)" title="任务详情" size="620" @close="detail = null"><template v-if="detail"><h3>{{ detail.name }}</h3><p class="muted spaced">{{ detail.type }} · {{ taskModel(detail,state.models) }} · {{ taskDuration(detail,currentTime) }}</p><p>{{ taskSummary(detail,state.versions) }}</p><p class="muted spaced">{{ projectName(detail.projectId) }} · {{ detail.created }} · {{ detail.status }}</p><pre>{{ detail.logs.join('\n') }}</pre><details><summary>本次配置快照</summary><pre>{{ JSON.stringify(detail.config || {}, null, 2) }}</pre></details><el-button v-if="detail.versionId" type="primary" class="spaced" @click="openResult(detail, detail.versionId)">查看项目内成果</el-button></template></el-drawer>
</template>
