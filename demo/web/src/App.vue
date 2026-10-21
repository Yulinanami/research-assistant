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
import ModelTrialPanel from './components/ModelTrialPanel.vue'
import PublicEntry from './components/PublicEntry.vue'
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
  { id: 'settings', title: '用户设置', subtitle: '集中管理模型、任务参数和可复用模板' },
]
const pages = [...navigation.flatMap(g => g.items), ...projectItems, ...extraPages]
const sessionKey = 'research-platform-session'
const authenticated = ref(sessionStorage.getItem(sessionKey) === 'active')
const initialPage = location.hash.slice(1)
const page = ref(authenticated.value ? initialPage || 'home' : !initialPage || initialPage === 'welcome' ? 'welcome' : 'login')
const trialOpen = ref(false)
const trialExpanded = ref(false)
const settingSection = ref('模型配置')
const collapsed = ref(false)
const projectPages = ['overview', 'sources', 'processing', 'generation', 'annotation', 'planning', 'versions']
const inProject = computed(() => projectPages.includes(page.value))
const project = computed(() => state.projects.find(p => p.id === state.activeProject))
const projectDatasets = computed(() => state.datasets.filter(d => d.projectId === state.activeProject && allowed('view', d.id)))
const groups = computed(() => page.value === 'settings' ? [{ title: '用户设置', items: settingNavigation }] : inProject.value ? [{ title: '项目加工空间', items: projectItems }] : navigation)
function ensureProjectDataset() {
  if (!projectDatasets.value.some(d => d.id === state.activeDataset)) state.activeDataset = projectDatasets.value[0]?.id || ''
}
function navigate(id) {
  if (!authenticated.value) {
    page.value = ['welcome','login'].includes(id) ? id : 'login'
    location.hash = page.value; window.scrollTo({ top:0 }); return
  }
  const aliases = { models: 'model-playground', statistics: 'workbench', permissions: 'settings' }
  const target = aliases[id] || id
  if (target === 'model-playground') { trialOpen.value = true; id = pages.some(p => p.id === page.value) ? page.value : 'workbench' }
  page.value = pages.some(p => p.id === (aliases[id] || id)) ? (aliases[id] || id) : 'home'
  if (inProject.value) ensureProjectDataset()
  location.hash = page.value; window.scrollTo({ top: 0 })
}
function login() { sessionStorage.setItem(sessionKey, 'active'); authenticated.value=true; navigate('home') }
function logout() { sessionStorage.removeItem(sessionKey); trialOpen.value=false; trialExpanded.value=false; authenticated.value=false; navigate('welcome') }
function handleUserCommand(command) {
  if (command === 'logout') logout()
  else if (command === 'reset') reset()
  else if (command === 'settings') navigate('settings')
  else state.role=command
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
  <PublicEntry v-if="!authenticated" :key="page" :login="page==='login'" @navigate="navigate" @login="login" />
  <div v-else class="app-shell" :class="{ collapsed, 'trial-open': trialOpen, 'trial-expanded': trialOpen && trialExpanded }">
    <aside class="sidebar">
      <div class="sidebar-brand-row"><el-button text class="sidebar-collapse" :aria-label="collapsed ? '展开导航' : '折叠导航'" :title="collapsed ? '展开导航' : '折叠导航'" :aria-expanded="!collapsed" @click="collapsed = !collapsed"><el-icon><component :is="collapsed ? 'Expand' : 'Fold'" /></el-icon></el-button><a v-if="!collapsed" class="brand" href="#home" @click.prevent="navigate('home')"><span class="brand-mark"><el-icon><DataLine /></el-icon></span><span v-if="!collapsed"><b>研数</b><small>科研数据加工平台</small></span></a></div>
      <template v-if="inProject"><button class="back-workbench" @click="navigate('workbench')"><el-icon><ArrowLeft /></el-icon><span v-if="!collapsed">返回工作台</span></button><div v-if="!collapsed" class="sidebar-project"><span class="icon-tile blue"><el-icon><FolderOpened /></el-icon></span><div><b>{{ project?.name }}</b><small>{{ projectDatasets.length }} 个数据集 · 项目空间</small></div></div></template>
      <button v-else-if="page === 'settings'" class="back-workbench" @click="navigate('workbench')"><el-icon><ArrowLeft /></el-icon><span v-if="!collapsed">返回工作台</span></button>
      <nav><section v-for="group in groups" :key="group.title" class="nav-group"><div v-if="!collapsed" class="nav-group-title">{{ group.title }}</div><button v-for="item in group.items" :key="item.id" :class="['nav-item', { active: (page === 'settings' && settingSection === item.title) || page === item.id || (item.id === 'sources' && page === 'processing') || (item.id === 'generation' && page === 'annotation') || (item.id === 'planning' && page === 'versions') }]" :title="item.title" @click="page === 'settings' ? settingSection = item.title : navigate(item.id)"><el-icon><component :is="item.icon" /></el-icon><span v-if="!collapsed">{{ item.title }}</span><span v-if="item.id === 'review' && !collapsed" class="nav-badge">{{ state.versions.filter(v => v.status === '待审核').length }}</span></button></section></nav>
    </aside>
    <div class="main-shell">
      <header class="topbar">
        <div class="topbar-actions">
          <el-popover placement="bottom-end" :width="340" trigger="click"><template #reference><el-button class="notification" text aria-label="消息"><el-badge :value="state.notices.length" :max="9"><el-icon><Bell /></el-icon></el-badge></el-button></template><h4>工作空间消息</h4><div class="notice" v-for="(text, i) in state.notices.slice(0, 8)" :key="i">{{ text }}</div></el-popover>
          <span class="top-divider"></span><div class="avatar">{{ state.role.slice(0, 1) }}</div><el-dropdown @command="handleUserCommand"><button class="user-menu"><b>{{ state.role }}</b><el-icon><ArrowDown /></el-icon></button><template #dropdown><el-dropdown-menu><el-dropdown-item command="settings"><el-icon><Setting /></el-icon>用户设置</el-dropdown-item><el-dropdown-item v-for="role in ['管理员', '加工人员', '审核人员', '数据使用者']" :key="role" :command="role">{{ role }} {{ state.role === role ? '✓' : '' }}</el-dropdown-item><el-dropdown-item divided command="reset">重置演示数据</el-dropdown-item><el-dropdown-item divided command="logout"><el-icon><Back /></el-icon>登出</el-dropdown-item></el-dropdown-menu></template></el-dropdown>
        </div>
      </header>
      <main v-if="storage.ready" class="page-content"><el-alert v-if="storage.error" :title="storage.error" type="warning" show-icon :closable="false" /><div v-if="inProject && !['overview','planning'].includes(page)" class="dataset-context"><el-select v-model="state.activeDataset" placeholder="先创建项目数据集" class="dataset-select"><template #prefix><el-icon><Files /></el-icon></template><el-option v-for="dataset in projectDatasets" :key="dataset.id" :label="dataset.name" :value="dataset.id" /></el-select></div>
        <PortalView v-if="['home','workbench','overview'].includes(page)" :key="page" :page="page" @navigate="navigate" @open-project="openProject" @open-dataset="openDataset" />
        <SettingsView v-else-if="page === 'settings'" :section="settingSection" />
        <DatasetCatalog v-else-if="['catalog','plaza'].includes(page)" :key="page" :page="page" @navigate="navigate" />
        <ProcessView v-else-if="['planning','sources','processing','generation','annotation'].includes(page) && (projectDatasets.length || page === 'planning')" :key="page" :page="page" @navigate="navigate" />
        <ResultsView v-else-if="['versions','review','requests','services'].includes(page) && (!inProject || projectDatasets.length)" :key="page" :page="page" @navigate="navigate" />
        <GovernanceView v-else-if="page === 'standards'" page="standards" />
        <section v-else class="panel"><el-empty description="这个项目还没有数据集"><el-button type="primary" @click="navigate('planning')"><el-icon><Plus /></el-icon>新建项目数据集</el-button></el-empty></section>
      </main><div v-else class="loading-screen"><el-icon class="is-loading"><Loading /></el-icon>正在加载工作空间…</div>
    </div>
    <aside v-if="storage.ready" class="model-trial-rail" aria-label="模型试用侧栏"><button class="model-trial-toggle" :class="{active:trialOpen}" aria-controls="model-trial-panel" :aria-expanded="trialOpen" :aria-label="trialOpen?'收起模型试用面板':'展开模型试用面板'" @click="trialOpen = !trialOpen"><el-icon><MagicStick /></el-icon><span>模型试用</span></button></aside>
    <ModelTrialPanel v-if="storage.ready" :open="trialOpen" :expanded="trialExpanded" @toggle-expanded="trialExpanded = !trialExpanded" @close="trialOpen=false; trialExpanded=false" />
  </div>
</template>
