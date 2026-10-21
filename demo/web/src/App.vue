<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { navigation, settingNavigation } from './data'
import { state, storage, initialize, resetDemo, allowed } from './store'
import PortalView from './components/PortalView.vue'
import SettingsView from './components/SettingsView.vue'
import DatasetCatalog from './components/DatasetCatalog.vue'
import ProcessView from './components/ProcessView.vue'
import GovernanceView from './components/GovernanceView.vue'
import ResultsView from './components/ResultsView.vue'
const projectItems = [
  { id: 'overview', title: '项目概览', icon: 'DataAnalysis', subtitle: '管理项目资料、任务与数据集' },
  { id: 'sources', title: '资料管理', icon: 'FolderOpened', subtitle: '接入原始资料，完成解析与清洗准备' },
  { id: 'generation', title: '数据标注', icon: 'EditPen', subtitle: '选择数据建设方式，生成或人工标注数据' },
  { id: 'planning', title: '项目数据集', icon: 'Files', subtitle: '规划和管理本项目的数据集' },
]
const extraPages = [
  { id: 'processing', title: '资料加工', subtitle: '解析和清洗，使用上一步的处理结果' },
  { id: 'annotation', title: '人工标注', subtitle: '逐条确认问答或标注图片区域' },
  { id: 'versions', title: '数据集版本', subtitle: '查看数据内容，管理版本与发布信息' },
  { id: 'model-playground', title: '模型试用', subtitle: '选择模型，体验模拟对话并查看回答' },
  { id: 'settings', title: '用户设置', subtitle: '集中管理模型、任务参数和可复用模板' },
]
const pages = [...navigation.flatMap(g => g.items), ...projectItems, ...extraPages]
const page = ref(location.hash.slice(1) || 'home')
const settingSection = ref('模型配置')
const collapsed = ref(false)
const globalSearch = ref('')
const projectPages = ['overview', 'sources', 'processing', 'generation', 'annotation', 'planning', 'versions']
const inProject = computed(() => projectPages.includes(page.value))
const project = computed(() => state.projects.find(p => p.id === state.activeProject))
const projectDatasets = computed(() => state.datasets.filter(d => d.projectId === state.activeProject && allowed('view', d.id)))
const current = computed(() => page.value === 'settings' ? settingNavigation.find(item=>item.title===settingSection.value) : pages.find(p => p.id === page.value) || pages[0])
const groups = computed(() => page.value === 'settings' ? [{ title: '用户设置', items: settingNavigation }] : inProject.value ? [{ title: '项目加工空间', items: projectItems }] : navigation)
const searchResults = computed(() => state.datasets.filter(d => allowed('view', d.id) && d.name.includes(globalSearch.value)))
function ensureProjectDataset() {
  if (!projectDatasets.value.some(d => d.id === state.activeDataset)) state.activeDataset = projectDatasets.value[0]?.id || ''
}
function navigate(id) {
  const aliases = { models: 'model-playground', statistics: 'workbench', permissions: 'settings' }
  page.value = pages.some(p => p.id === (aliases[id] || id)) ? (aliases[id] || id) : 'home'
  if (inProject.value) ensureProjectDataset()
  location.hash = page.value; globalSearch.value = ''; window.scrollTo({ top: 0 })
}
function openProject(id) { state.activeProject = id; ensureProjectDataset(); navigate('overview') }
function openDataset(item) { state.activeProject = item.projectId; state.activeDataset = item.id; state.focusVersion = ''; navigate('versions') }
watch(() => [state.role, state.activeProject], () => { if (inProject.value) ensureProjectDataset() })
async function reset() {
  try { await ElMessageBox.confirm('将清除本演示的数据、文件与操作记录，并恢复初始样例。', '重置演示', { type: 'warning' }); await resetDemo(); navigate('home') } catch (e) { if (e instanceof Error) storage.error = e.message }
}
let disposed = false
function handleHashChange() { if (location.hash.slice(1) !== page.value) navigate(location.hash.slice(1)) }
onMounted(async () => {
  window.addEventListener('hashchange', handleHashChange)
  await initialize()
  if (!disposed) navigate(page.value)
})
onUnmounted(() => { disposed = true; window.removeEventListener('hashchange', handleHashChange) })
</script>
<template>
  <div class="app-shell" :class="{ collapsed }">
    <aside class="sidebar">
      <a class="brand" href="#home" @click.prevent="navigate('home')"><span class="brand-mark"><el-icon><DataLine /></el-icon></span><span v-if="!collapsed"><b>研数</b><small>科研数据加工平台</small></span></a>
      <template v-if="inProject"><button class="back-workbench" @click="navigate('workbench')"><el-icon><ArrowLeft /></el-icon><span v-if="!collapsed">返回工作台</span></button><div v-if="!collapsed" class="sidebar-project"><span class="icon-tile blue"><el-icon><FolderOpened /></el-icon></span><div><b>{{ project?.name }}</b><small>{{ projectDatasets.length }} 个数据集 · 项目空间</small></div></div></template>
      <button v-else-if="page === 'settings'" class="back-workbench" @click="navigate('workbench')"><el-icon><ArrowLeft /></el-icon><span v-if="!collapsed">返回工作台</span></button>
      <div v-else-if="!collapsed" class="space-label">RESEARCH WORKSPACE</div>
      <nav><section v-for="group in groups" :key="group.title" class="nav-group"><div v-if="!collapsed" class="nav-group-title">{{ group.title }}</div><button v-for="item in group.items" :key="item.id" :class="['nav-item', { active: (page === 'settings' && settingSection === item.title) || page === item.id || (item.id === 'sources' && page === 'processing') || (item.id === 'generation' && page === 'annotation') || (item.id === 'planning' && page === 'versions') }]" :title="item.title" @click="page === 'settings' ? settingSection = item.title : navigate(item.id)"><el-icon><component :is="item.icon" /></el-icon><span v-if="!collapsed">{{ item.title }}</span><span v-if="item.id === 'review' && !collapsed" class="nav-badge">{{ state.versions.filter(v => v.status === '待审核').length }}</span></button></section></nav>
      <div class="sidebar-footer"><span class="online-dot"></span><span v-if="!collapsed">{{ page === 'settings' ? '用户设置' : inProject ? '项目加工空间' : '本地演示空间' }}</span><el-button text aria-label="折叠导航" @click="collapsed = !collapsed"><el-icon><component :is="collapsed ? 'Expand' : 'Fold'" /></el-icon></el-button></div>
    </aside>
    <div class="main-shell">
      <header class="topbar"><el-breadcrumb separator="/"><el-breadcrumb-item><a @click="navigate(inProject ? 'workbench' : 'home')">{{ inProject ? '工作台' : '工作空间' }}</a></el-breadcrumb-item><el-breadcrumb-item v-if="inProject">{{ project?.name }}</el-breadcrumb-item><el-breadcrumb-item v-if="page === 'settings'">用户设置</el-breadcrumb-item><el-breadcrumb-item>{{ current.title }}</el-breadcrumb-item></el-breadcrumb>
        <div class="topbar-actions"><el-popover :visible="Boolean(globalSearch)" placement="bottom" :width="360"><template #reference><el-input v-model="globalSearch" placeholder="搜索数据集…" clearable class="global-search"><template #prefix><el-icon><Search /></el-icon></template></el-input></template><div class="search-result" v-for="item in searchResults" :key="item.id" @click="openDataset(item)"><el-icon><Files /></el-icon>{{ item.name }}</div><el-empty v-if="!searchResults.length" description="没有匹配的数据集" :image-size="50" /></el-popover><span class="demo-chip"><i></i>演示模式</span>
          <el-button text class="top-settings" aria-label="用户设置" :class="{ selected: page === 'settings' }" @click="navigate('settings')"><el-icon><Setting /></el-icon></el-button>
          <el-popover placement="bottom-end" :width="340" trigger="click"><template #reference><el-button class="notification" text aria-label="消息"><el-badge :value="state.notices.length" :max="9"><el-icon><Bell /></el-icon></el-badge></el-button></template><h4>工作空间消息</h4><div class="notice" v-for="(text, i) in state.notices.slice(0, 8)" :key="i">{{ text }}</div></el-popover>
          <span class="top-divider"></span><div class="avatar">{{ state.role.slice(0, 1) }}</div><el-dropdown @command="command => command === 'reset' ? reset() : command === 'settings' ? navigate('settings') : state.role = command"><button class="user-menu"><b>{{ state.role }}</b><small>演示身份 <el-icon><ArrowDown /></el-icon></small></button><template #dropdown><el-dropdown-menu><el-dropdown-item command="settings"><el-icon><Setting /></el-icon>用户设置</el-dropdown-item><el-dropdown-item v-for="role in ['管理员', '加工人员', '审核人员', '数据使用者']" :key="role" :command="role">{{ role }} {{ state.role === role ? '✓' : '' }}</el-dropdown-item><el-dropdown-item divided command="reset">重置演示数据</el-dropdown-item></el-dropdown-menu></template></el-dropdown>
        </div>
      </header>
      <main v-if="storage.ready" class="page-content"><el-alert v-if="storage.error" :title="storage.error" type="warning" show-icon :closable="false" /><div class="page-heading"><div><div class="eyebrow">{{ inProject ? 'PROJECT WORKSPACE' : page === 'home' ? 'RESEARCH DATA' : page === 'settings' ? 'PREFERENCES' : 'RESEARCH WORKSPACE' }}</div><h1>{{ current.title }}</h1><p>{{ current.subtitle }}</p></div><div class="heading-side"><span :class="['save-state', { warning: storage.error }]"><i></i>{{ storage.error ? '保存异常' : storage.saving ? '正在保存…' : '已保存到本地' }}</span><el-select v-if="inProject && !['overview','planning'].includes(page)" v-model="state.activeDataset" placeholder="先创建项目数据集" class="dataset-select"><template #prefix><el-icon><Files /></el-icon></template><el-option v-for="dataset in projectDatasets" :key="dataset.id" :label="dataset.name" :value="dataset.id" /></el-select></div></div>
        <PortalView v-if="['home','workbench','overview'].includes(page)" :key="page" :page="page" @navigate="navigate" @open-project="openProject" @open-dataset="openDataset" />
        <SettingsView v-else-if="page === 'settings'" :section="settingSection" />
        <ProcessView v-else-if="page === 'model-playground'" page="models" model-section="模型试用" />
        <DatasetCatalog v-else-if="['catalog','plaza'].includes(page)" :key="page" :page="page" @navigate="navigate" />
        <ProcessView v-else-if="['planning','sources','processing','generation','annotation'].includes(page) && (projectDatasets.length || page === 'planning')" :key="page" :page="page" @navigate="navigate" />
        <ResultsView v-else-if="['versions','review','requests','services'].includes(page) && (!inProject || projectDatasets.length)" :key="page" :page="page" @navigate="navigate" />
        <GovernanceView v-else-if="page === 'standards'" page="standards" />
        <section v-else class="panel"><el-empty description="这个项目还没有数据集"><el-button type="primary" @click="navigate('planning')"><el-icon><Plus /></el-icon>新建项目数据集</el-button></el-empty></section>
        <footer class="page-footer"><span>研数 · 科研数据加工平台</span><span>模拟处理 · 浏览器本地保存<span v-if="inProject"> · {{ project?.name }}</span></span></footer>
      </main><div v-else class="loading-screen"><el-icon class="is-loading"><Loading /></el-icon>正在加载工作空间…</div>
    </div>
  </div>
</template>
