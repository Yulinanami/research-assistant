<script setup>
import { computed, ref, watch } from 'vue'
import { governanceMetrics } from '../domain'
import { state, allowed, datasetName } from '../store'
const props = defineProps({ statistics: Boolean })
const emit = defineEmits(['navigate'])
const datasetPage = ref(1)
const taskPage = ref(1)
const datasets = computed(() => state.datasets.filter(d => allowed('view', d.id)))
const tasks = computed(() => state.tasks.filter(t => allowed('view', t.datasetId)))
const governance=computed(()=>governanceMetrics(state,datasets.value.map(dataset=>dataset.id)))
const governanceKey=ref('')
const governanceOpen=ref(false)
const governancePage=ref(1)
const selectedGovernance=computed(()=>governance.value.find(metric=>metric.key===governanceKey.value))
const governanceRows=computed(()=>[...(selectedGovernance.value?.rows || [])].sort((a,b)=>Number(a.passed)-Number(b.passed)))
const governanceIcons={metadata:'Collection',coverage:'CircleCheck',issues:'Tools',publish:'PriceTag'}
const governanceBasis={metadata:'全部可见数据集中，必填元数据全部合格的数据集数 / 可见数据集数',coverage:'非归档且绑定内容标准的数据集中，最新版本报告有效的数据集数 / 有数据版本的数据集数',issues:'各版本最新报告中已确认或已复检修复的问题数 / 这些报告的问题总数',publish:'发布检查通过次数 / 发布检查尝试总次数'}
function openGovernance(metric) {governanceKey.value=metric.key;governancePage.value=1;governanceOpen.value=true}
function openGovernanceRow(row) {
  const dataset=state.datasets.find(item=>item.id===row.datasetId)
  if (!dataset) return
  state.activeProject=dataset.projectId;state.activeDataset=dataset.id;state.focusVersion=row.versionId || ''
  governanceOpen.value=false
  if (row.kind==='metadata') emit('navigate','planning')
  else {state.focusGovernance={versionId:row.versionId};emit('navigate','review')}
}

watch(() => [state.role, datasets.value.length], () => { datasetPage.value = 1 })
watch(() => [state.role, tasks.value.length], () => { taskPage.value = 1 })
const sources = computed(() => state.sources.filter(t => allowed('view', t.datasetId)))
const versions = computed(() => state.versions.filter(t => allowed('view', t.datasetId)))
const metrics = computed(() => [
  { label: '数据集总数', value: datasets.value.length, unit: '个', icon: 'FolderOpened', color: 'blue', page: 'planning', hint: '统一管理科研数据资产' },
  { label: '数据文件', value: sources.value.length, unit: '份', icon: 'Document', color: 'teal', page: 'sources', hint: `${sources.value.filter(s => s.status === '待解析').length} 份文档待解析` },
  { label: '加工任务', value: tasks.value.length, unit: '项', icon: 'SetUp', color: 'purple', page: 'processing', hint: `${tasks.value.filter(t => t.status === '已完成').length} 项任务已完成` },
  { label: '已发布成果', value: versions.value.filter(v => v.status === '已发布').length, unit: '个', icon: 'CircleCheck', color: 'amber', page: 'catalog', hint: `${versions.value.filter(v => v.status === '待审核').length} 个版本待审核` },
])
const shortcuts = [
  { title: '接入科研资料', description: '上传文档、表格或导入数据', icon: 'UploadFilled', page: 'sources', color: 'blue' },
  { title: '解析与清洗', description: '提取文档内容，规范数据格式', icon: 'SetUp', page: 'processing', color: 'teal' },
  { title: '生成问答数据', description: '从资料构建可用的问答对', icon: 'MagicStick', page: 'generation', color: 'purple' },
  { title: '发现数据成果', description: '浏览已发布数据并申请使用', icon: 'Grid', page: 'catalog', color: 'amber' },
]
function openMetric(metric) {
  if (props.statistics && ['sources','processing'].includes(metric.page)) document.getElementById('workbench-tasks')?.scrollIntoView({ behavior: 'smooth' })
  else emit('navigate', props.statistics && metric.page === 'planning' ? 'catalog' : metric.page)
}
function openTask(task) {
  const dataset = state.datasets.find(d=>d.id===task.datasetId)
  if (!dataset) return
  state.activeProject=dataset.projectId; state.activeDataset=dataset.id; state.focusVersion=task.versionId || ''
  emit('navigate',task.versionId ? 'versions' : /解析|清洗/.test(task.type) ? 'processing' : 'generation')
}
const formats = computed(() => [...new Set(sources.value.map(s => s.type))].map(type => ({ type, count: sources.value.filter(s => s.type === type).length })))
const tokenEstimate = computed(() => Math.round(sources.value.reduce((n, s) => n + (s.content?.startsWith('data:') ? 0 : s.content?.length || 0), 0) / 1.5))
</script>
<template>
  <section v-if="!statistics" class="welcome-banner"><div><span class="banner-kicker">让科研资料，成为可用的数据</span><h2>从一份资料，开始数据建设</h2><p>接入、加工、审核与共享，在同一工作空间有序完成。</p><el-button type="primary" @click="$emit('navigate', 'planning')"><el-icon><Plus /></el-icon>新建数据集</el-button><el-button plain @click="$emit('navigate', 'catalog')">浏览数据目录<el-icon><ArrowRight /></el-icon></el-button></div><div class="banner-art"><div class="art-orbit orbit-one"></div><div class="art-orbit orbit-two"></div><div class="art-sheet sheet-back"><i></i><i></i><i></i></div><div class="art-sheet sheet-front"><el-icon><DataAnalysis /></el-icon><div class="art-bars"><b></b><b></b><b></b><b></b></div></div><span class="art-check"><el-icon><Check /></el-icon></span></div></section>
  <div class="metric-grid"><button v-for="metric in metrics" :key="metric.label" class="metric-card" @click="openMetric(metric)"><div class="metric-top"><span>{{ metric.label }}</span><span :class="['icon-tile', metric.color]"><el-icon><component :is="metric.icon" /></el-icon></span></div><div class="metric-value">{{ metric.value }}<small>{{ metric.unit }}</small></div><div class="metric-hint">{{ metric.hint }}<el-icon><ArrowRight /></el-icon></div></button></div>
  <section v-if="!statistics" class="panel"><div class="section-title"><h3>开始加工</h3><span>选择一个操作，继续建设您的数据集</span></div><div class="shortcut-grid"><button v-for="item in shortcuts" :key="item.page" class="shortcut" @click="$emit('navigate', item.page)"><span :class="['icon-tile', item.color]"><el-icon><component :is="item.icon" /></el-icon></span><b>{{ item.title }}</b><p>{{ item.description }}</p><span class="shortcut-link">进入<el-icon><ArrowRight /></el-icon></span></button></div></section>
  <section class="panel governance-overview"><div class="section-title"><h3><el-icon><CircleCheck /></el-icon>治理概况</h3></div><div class="metric-grid compact"><button v-for="metric in governance" :key="metric.key" class="metric-card" @click="openGovernance(metric)"><div class="metric-top"><span>{{ metric.label }}</span><span class="icon-tile teal"><el-icon><component :is="governanceIcons[metric.key]" /></el-icon></span></div><div class="metric-value">{{ metric.denominator?Math.round(metric.numerator/metric.denominator*100)+'%':'—' }}</div><el-tooltip :content="governanceBasis[metric.key]"><div class="metric-hint">{{ metric.numerator }} / {{ metric.denominator }}<el-icon><ArrowRight /></el-icon></div></el-tooltip></button></div></section>
  <el-drawer v-model="governanceOpen" :title="selectedGovernance?.label" size="850"><template v-if="selectedGovernance"><p>{{ governanceBasis[selectedGovernance.key] }}</p><div class="detail-badges"><el-tag>{{ selectedGovernance.numerator }} / {{ selectedGovernance.denominator }}</el-tag></div><el-table :data="governanceRows.slice((governancePage-1)*5,governancePage*5)"><el-table-column label="数据集" prop="name" min-width="200" /><el-table-column label="状态" prop="status" width="110" /><el-table-column label="对应内容" prop="detail" min-width="240" /><el-table-column label="操作" width="110"><template #default="{row}"><el-button link type="primary" @click="openGovernanceRow(row)">{{ row.kind==='metadata'?'完善元数据':'查看版本' }}</el-button></template></el-table-column></el-table><el-pagination v-model:current-page="governancePage" :page-size="5" :total="governanceRows.length" layout="total, prev, pager, next" hide-on-single-page /></template></el-drawer>
  <div class="home-columns"><section class="panel"><div class="section-title"><h3>{{ statistics ? '数据集统计' : '最近的数据集' }}</h3><el-button link type="primary" @click="$emit('navigate', statistics ? 'catalog' : 'planning')">查看全部<el-icon><ArrowRight /></el-icon></el-button></div><el-table :data="datasets.slice((datasetPage - 1) * 5, datasetPage * 5)" @row-click="row => { state.activeDataset = row.id; state.activeProject = row.projectId; $emit('navigate', 'versions') }" class="clickable-table"><el-table-column label="数据集名称" min-width="235"><template #default="{ row }"><div class="name-cell"><span class="file-icon"><el-icon><FolderOpened /></el-icon></span><div><b>{{ row.name }}</b><small>{{ row.project }} · {{ row.type }}</small></div></div></template></el-table-column><el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="row.status === '草稿' ? 'info' : 'primary'">{{ row.status }}</el-tag></template></el-table-column><el-table-column label="文件" width="65"><template #default="{ row }">{{ sources.filter(s => s.datasetId === row.id).length }}</template></el-table-column></el-table><el-pagination v-model:current-page="datasetPage" :page-size="5" :pager-count="5" :total="datasets.length" hide-on-single-page layout="total, prev, pager, next" aria-label="数据集统计分页" /></section><section class="panel composition"><div class="section-title"><h3>语料构成</h3><span>{{ formats.length }} 种格式</span></div><div class="format-row" v-for="format in formats" :key="format.type"><span>{{ format.type }}</span><el-progress :percentage="Math.round(format.count / Math.max(1, sources.length) * 100)" :show-text="false" :stroke-width="7" /><b>{{ format.count }}</b></div><div class="composition-footer"><span>Token 总数 <small>估算</small></span><b>{{ tokenEstimate.toLocaleString() }}</b></div></section></div>
  <section id="workbench-tasks" class="panel"><div class="section-title"><h3>任务动态</h3><span>{{ tasks.filter(t => t.status === '执行中').length }} 项任务正在运行</span></div><el-table class="clickable-table" @row-click="openTask" :data="tasks.slice((taskPage - 1) * 5, taskPage * 5)" empty-text="还没有加工任务，先上传一份材料吧"><el-table-column label="任务名称" prop="name" min-width="210" /><el-table-column label="所属数据集" min-width="230"><template #default="{ row }">{{ datasetName(row.datasetId) }}</template></el-table-column><el-table-column label="处理类型" prop="type" width="110" /><el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="row.status === '失败' ? 'danger' : row.status === '已完成' ? 'success' : 'primary'">{{ row.status }}</el-tag></template></el-table-column><el-table-column label="进度" width="155"><template #default="{ row }"><el-progress :percentage="row.progress" :stroke-width="5" /></template></el-table-column></el-table><el-pagination v-model:current-page="taskPage" :page-size="5" :pager-count="5" :total="tasks.length" hide-on-single-page layout="total, prev, pager, next" aria-label="任务动态分页" /></section>
  <div v-if="statistics" class="metric-grid compact"><div class="panel"><h4>待解析文件</h4><strong>{{ sources.filter(s => s.status === '待解析').length }}</strong></div><div class="panel"><h4>标注任务</h4><strong>{{ tasks.filter(t => t.type.includes('标注')).length }}</strong></div><div class="panel"><h4>生成任务</h4><strong>{{ tasks.filter(t => /生成|增强/.test(t.type)).length }}</strong></div><div class="panel"><h4>语料条目</h4><strong>{{ versions.reduce((n, v) => n + (v.totalRecords ?? v.records.length), 0) }}</strong></div></div>
</template>
