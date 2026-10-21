<script setup>
import { computed, ref, watch } from 'vue'
import { state, allowed, notify } from '../store'
import { uid, now, isDatasetVersion } from '../domain'
import HomeView from './HomeView.vue'
import FormDialog from './FormDialog.vue'
const props = defineProps({ page: String })
const emit = defineEmits(['navigate', 'open-project', 'open-dataset'])
const search = ref('')
const projectPage = ref(1)
const recommendationSearch = ref('')
const dialog = ref(false)
const projectFields = [{ key: 'name', label: '项目名称', required: true }, { key: 'description', label: '项目介绍', type: 'textarea', required: true }]
const visible = computed(() => state.datasets.filter(d => allowed('view', d.id)))
const projects = computed(() => state.projects.filter(p => p.scope !== 'shared' && p.name.includes(search.value) && (state.role === '管理员' || visible.value.some(d => d.projectId === p.id) || p.owner === state.role)))
watch(() => [search.value, state.role, projects.value.length], () => { projectPage.value = 1 })
const project = computed(() => state.projects.find(p => p.id === state.activeProject))
const datasets = computed(() => visible.value.filter(d => d.projectId === state.activeProject))
const projectTasks = computed(() => state.tasks.filter(t => datasets.value.some(d => d.id === t.datasetId)))
const recommendations = computed(() => visible.value.filter(d => state.versions.some(v => v.datasetId === d.id && v.status === '已发布' && isDatasetVersion(v))).sort((a,b)=>(b.downloads || 0)-(a.downloads || 0)).slice(0, 6))
const recommendationRows = computed(() => recommendations.value.filter(dataset => dataset.name.toLowerCase().includes(recommendationSearch.value.trim().toLowerCase())).map(dataset => {
  const version = state.versions.filter(version => version.datasetId === dataset.id && version.status === '已发布' && isDatasetVersion(version)).sort((a,b) => b.number - a.number)[0]
  return { ...dataset, recordCount: version?.totalRecords ?? version?.records.length ?? 0, updated: (version?.release?.publishedAt || version?.published || version?.created || dataset.created || '').split(/[ T]/)[0].replaceAll('/', '-') || '—' }
}))
const projectCount = (id, list) => list.filter(item => visible.value.some(d => d.projectId === id && d.id === (item.datasetId || item.id))).length
const methods = [
  { icon: 'FolderOpened', name: '资料接入', text: '上传文档、图片与条目', page: 'sources', tone: 'blue' },
  { icon: 'Brush', name: '解析与清洗', text: '按步骤准备标注资料', page: 'processing', tone: 'teal' },
  { icon: 'EditPen', name: '数据标注', text: '生成问答、评分与框选', page: 'generation', tone: 'purple' },
  { icon: 'Files', name: '项目数据集', text: '管理数据集与独立版本', page: 'planning', tone: 'amber' },
]
function createProject(data) {
  if (state.projects.some(p => p.name === data.name.trim())) return notify('已有同名项目，请使用其他名称')
  const project = { id: uid('project'), name: data.name.trim(), description: data.description, owner: state.role, created: now() }
  state.projects.unshift(project); dialog.value = false; notify('项目已创建'); emit('open-project', project.id)
}
</script>
<template>
  <template v-if="page === 'home'">
    <section class="portal-hero"><div><h2>让每一份资料，成为可用的数据</h2><p>发现优质科研数据，或进入项目开始您的数据建设。</p><div class="hero-actions"><el-button type="primary" size="large" @click="$emit('navigate','workbench')"><el-icon><Monitor /></el-icon>进入工作台<el-icon><ArrowRight /></el-icon></el-button><el-button size="large" @click="$emit('navigate','catalog')"><el-icon><Files /></el-icon>我的数据集</el-button></div></div><div class="portal-art" aria-hidden="true"><span class="art-main"><el-icon><DataAnalysis /></el-icon></span><span class="art-small one"><el-icon><Document /></el-icon>资料</span><span class="art-small two"><el-icon><EditPen /></el-icon>标注</span><span class="art-small three"><el-icon><Files /></el-icon>数据集</span><span class="art-dots"></span></div></section>
    <div class="portal-quick-links"><button @click="$emit('navigate','plaza')"><span class="icon-tile blue"><el-icon><Grid /></el-icon></span><div><b>数据广场</b><p>发现可申请的科研数据</p></div><el-icon><ArrowRight /></el-icon></button><button @click="$emit('navigate','catalog')"><span class="icon-tile teal"><el-icon><Collection /></el-icon></span><div><b>我的数据集</b><p>查阅自己和已获授权的数据</p></div><el-icon><ArrowRight /></el-icon></button><button @click="$emit('navigate','workbench')"><span class="icon-tile purple"><el-icon><FolderOpened /></el-icon></span><div><b>我的项目</b><p>继续处理资料与建设数据集</p></div><el-icon><ArrowRight /></el-icon></button></div>
    <section class="home-recommendations">
      <div class="section-heading"><h2><el-icon><Grid /></el-icon>推荐数据集</h2><el-button link type="primary" @click="$emit('navigate','plaza')">查看数据广场<el-icon><ArrowRight /></el-icon></el-button></div>
      <el-input v-model="recommendationSearch" class="recommendation-search" placeholder="搜索推荐数据集" aria-label="搜索推荐数据集" clearable><template #prefix><el-icon><Search /></el-icon></template></el-input>
      <div class="recommendation-table-wrap"><table class="recommendation-table"><thead><tr><th scope="col">数据集名称</th><th scope="col">类型</th><th scope="col">领域</th><th scope="col" class="numeric">数据量</th><th scope="col" class="numeric">下载量</th><th scope="col" class="updated">更新时间</th></tr></thead><tbody><tr v-for="dataset in recommendationRows" :key="dataset.id"><td><button class="recommendation-name" @click="$emit('navigate','plaza')"><el-icon :class="dataset.coverTone || 'blue'"><component :is="dataset.coverIcon || 'Reading'" /></el-icon><span>{{ dataset.name }}</span></button></td><td>{{ dataset.type }}</td><td>{{ dataset.industry || dataset.project }}</td><td class="numeric">{{ dataset.recordCount.toLocaleString() }} 条</td><td class="numeric">{{ (dataset.downloads || 0).toLocaleString() }}</td><td class="updated">{{ dataset.updated }}</td></tr><tr v-if="!recommendationRows.length"><td colspan="6" class="recommendation-empty">{{ recommendationSearch ? '没有匹配的数据集' : '暂无推荐数据集' }}</td></tr></tbody></table></div>
    </section>
  </template>
  <template v-else-if="page === 'workbench'">
    <section class="workbench-welcome"><div><h2>从项目开始，继续数据建设</h2><p>每个项目独立组织资料、任务和数据集。</p></div><div class="hero-actions" style="margin-top:0"><el-button type="primary" size="large" :disabled="!allowed('edit')" @click="dialog = true"><el-icon><Plus /></el-icon>新建项目</el-button></div></section>
    <section class="section-heading"><h2><el-icon><FolderOpened /></el-icon>我的项目 <span class="count">{{ projects.length }}</span></h2><el-input v-model="search" placeholder="搜索项目" clearable style="width:240px"><template #prefix><el-icon><Search /></el-icon></template></el-input></section>
    <div class="project-grid"><article v-for="(item, index) in projects.slice((projectPage - 1) * 6, projectPage * 6)" :key="item.id" class="project-card"><div class="project-card-top"><span :class="['icon-tile', ['blue','teal','purple'][index % 3]]"><el-icon><FolderOpened /></el-icon></span><el-tag type="info">项目</el-tag></div><h3>{{ item.name }}</h3><p>{{ item.description }}</p><div class="project-counts"><span><el-icon><Files /></el-icon>{{ visible.filter(d => d.projectId === item.id).length }} 数据集</span><span><el-icon><Document /></el-icon>{{ projectCount(item.id, state.sources) }} 资料</span><span><el-icon><Timer /></el-icon>{{ projectCount(item.id, state.tasks) }} 任务</span></div><button class="open-project" @click="$emit('open-project', item.id)">打开项目<el-icon><ArrowRight /></el-icon></button></article></div><el-empty v-if="!projects.length" description="还没有项目，点击新建项目开始" />
    <el-pagination v-model:current-page="projectPage" :page-size="6" :pager-count="5" :total="projects.length" hide-on-single-page layout="total, prev, pager, next" aria-label="我的项目分页" />
    <div class="section-heading"><h2><el-icon><DataAnalysis /></el-icon>数据与任务统计</h2><span class="muted">当前可见数据汇总</span></div><HomeView statistics @navigate="$emit('navigate', $event)" />
  </template>
  <template v-else>
    <section class="project-overview-banner"><span class="icon-tile blue"><el-icon><FolderOpened /></el-icon></span><div><h2>{{ project?.name }}</h2><p>{{ project?.description }}</p></div><el-button type="primary" @click="$emit('navigate','planning')"><el-icon><Plus /></el-icon>新建数据集</el-button></section>
    <div class="project-summary"><div><el-icon><Files /></el-icon><b>{{ datasets.length }}</b><span>项目数据集</span></div><div><el-icon><Document /></el-icon><b>{{ projectCount(state.activeProject,state.sources) }}</b><span>原始资料</span></div><div><el-icon><Timer /></el-icon><b>{{ projectTasks.filter(t=>t.status==='执行中').length }}</b><span>执行中任务</span></div><div><el-icon><CircleCheck /></el-icon><b>{{ projectTasks.filter(t=>t.status==='已完成').length }}</b><span>已完成任务</span></div></div>
    <section class="panel"><div class="section-title"><div><h3>开始加工</h3><p>选择数据集，按步骤完成资料接入与数据建设</p></div></div><div class="shortcut-grid"><button v-for="item in methods" :key="item.page" class="shortcut" @click="$emit('navigate',item.page)"><span :class="['icon-tile',item.tone]"><el-icon><component :is="item.icon" /></el-icon></span><b>{{ item.name }}</b><p>{{ item.text }}</p><span class="shortcut-link">进入<el-icon><ArrowRight /></el-icon></span></button></div></section>
    <section class="panel"><div class="section-title"><h3><el-icon><Files /></el-icon>项目数据集</h3><el-button link type="primary" @click="$emit('navigate','planning')">管理数据集<el-icon><ArrowRight /></el-icon></el-button></div><el-table :data="datasets" empty-text="先创建项目数据集，再接入资料"><el-table-column label="名称" min-width="230"><template #default="{row}"><div class="name-cell"><span class="file-icon"><el-icon><Files /></el-icon></span><b>{{ row.name }}</b></div></template></el-table-column><el-table-column label="类型" prop="type" /><el-table-column label="版本数"><template #default="{row}">{{ state.versions.filter(v=>v.datasetId===row.id && isDatasetVersion(v)).length }}</template></el-table-column><el-table-column label="操作" width="210"><template #default="{row}"><el-button link type="primary" @click="state.activeDataset=row.id; $emit('navigate','sources')">接入资料</el-button><el-button link type="primary" @click="$emit('open-dataset',row)">查看数据</el-button></template></el-table-column></el-table></section>
  </template>
  <FormDialog v-model="dialog" title="新建项目" :fields="projectFields" @save="createProject" />
</template>
