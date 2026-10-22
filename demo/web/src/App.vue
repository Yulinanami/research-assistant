<script setup>
import { computed, ref, onMounted, watch } from 'vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import { navigation } from './data'
import { state, storage, initialize, resetDemo, allowed, projectDatasets, visibleProjects, openProject } from './store'
import LandingView from './components/LandingView.vue'
import ProjectsView from './components/ProjectsView.vue'
import DatasetLibrary from './components/DatasetLibrary.vue'
import ProcessView from './components/ProcessView.vue'
import GovernanceView from './components/GovernanceView.vue'
import ResultsView from './components/ResultsView.vue'
import WorkflowSteps from './components/WorkflowSteps.vue'
import PreparationView from './components/PreparationView.vue'
import CleaningView from './components/CleaningView.vue'
import AnnotationWorkbench from './components/AnnotationWorkbench.vue'
import ProjectTasks from './components/ProjectTasks.vue'
import SettingsView from './components/SettingsView.vue'
import PublicHome from './components/PublicHome.vue'
import { auth, loginDemo, logoutDemo, resolveSessionPage } from './auth'
const internalPages = [
  { id:'planning', title:'需求与数据规划', subtitle:'明确当前项目的数据用途、结构与质量要求' },
  { id:'sources', title:'数据采集与语料管理', subtitle:'在当前项目接入资料、解析文档并保留来源' },
  { id:'processing', title:'数据预处理', subtitle:'确认上游资料及解析结果，准备后续清洗输入' },
  { id:'cleaning', title:'数据清洗', subtitle:'选择常用清洗配置，试运行后批量处理资料' },
  { id:'generation', title:'数据标注', subtitle:'按任务模板生成、分类或人工标注数据' },
  { id:'versions', title:'项目成果', subtitle:'预览、自检与导出项目成果，完成后提交治理审核' },
  { id:'settings', title:'设置', subtitle:'统一维护解析、模型、清洗与标注模板' },
]
const pages = [...navigation.flatMap(group => group.items), ...internalPages]
const resolve = id => resolveSessionPage(id, Boolean(auth.session), pages.map(item => item.id))
const page = ref(resolve(location.hash.slice(1) || 'home'))
const collapsed = ref(false)
const projectPages = ['planning','sources','processing','cleaning','generation','versions']
const inProject = computed(() => projectPages.includes(page.value))
const inGovernance = computed(() => navigation.find(group => group.title === '数据治理与共享').items.some(item => item.id === page.value))
const project = computed(() => visibleProjects().find(item => item.id === state.activeProjectId))
const datasets = computed(projectDatasets)
const current = computed(() => pages.find(item => item.id === page.value) || pages[0])
function navigate(id) { page.value = resolve(id); location.hash = page.value; window.scrollTo({top:0,behavior:'instant'}) }
function enterSelectedProject(id) { if (openProject(id)) navigate('planning') }
function ensureContext() {
  if (!auth.session) return
  if (!visibleProjects().some(item => item.id === state.activeProjectId)) { state.activeProjectId = ''; state.activeDataset = ''; return }
  if (!datasets.value.some(item => item.id === state.activeDataset)) state.activeDataset = datasets.value[0]?.id || ''
}
watch(() => [state.role, JSON.stringify(state.permissions)], ensureContext)
watch(() => state.role, role => { if (auth.session && role !== auth.session.role) loginDemo(role) })
watch(() => state.activeDataset, id => {
  if (!id) return
  const dataset = state.datasets.find(item => item.id === id && allowed('view', item.id))
  if (dataset && dataset.projectId !== state.activeProjectId) state.activeProjectId = dataset.projectId
})
async function reset() {
  try { await ElMessageBox.confirm('清除本演示数据、文件与操作记录，并恢复初始样例？','重置演示',{type:'warning'}); await resetDemo(); navigate('workbench') } catch {}
}
function login(role) { loginDemo(role); state.role = role; ensureContext(); navigate('workbench') }
function logout() { logoutDemo(); ElMessage.closeAll(); navigate('home') }
function userCommand(command) { if (command === 'logout') logout(); else if (command === 'reset') reset(); else state.role = command }
function syncRoute() {
  page.value = resolve(location.hash.slice(1))
  if (location.hash !== '#' + page.value) history.replaceState(null,'','#' + page.value)
}
onMounted(async () => { await initialize(); ensureContext(); syncRoute(); window.addEventListener('hashchange', syncRoute) })
</script>
<template>
  <PublicHome v-if="!auth.session" @login="login" />
  <div v-else class="app-shell" :class="{collapsed}">
    <aside class="sidebar">
      <a class="brand" href="#workbench" @click.prevent="navigate('workbench')"><span class="brand-mark"><el-icon><DataLine /></el-icon></span><span v-if="!collapsed"><b>研数</b><small>科研数据建设与共享</small></span></a>
      <div class="space-label" v-if="!collapsed">RESEARCH WORKSPACE</div>
      <nav><section v-for="group in navigation" :key="group.title" class="nav-group"><div v-if="!collapsed" class="nav-group-title">{{ group.title }}</div><button v-for="item in group.items" :key="item.id" :class="['nav-item',{active:page === item.id || (item.id === 'projects' && inProject)}]" :title="item.title" @click="navigate(item.id)"><el-icon><component :is="item.icon" /></el-icon><span v-if="!collapsed">{{ item.title }}</span></button></section></nav>
      <div class="sidebar-footer"><span class="online-dot"></span><span v-if="!collapsed">本地演示空间</span><el-button text @click="collapsed = !collapsed"><el-icon><component :is="collapsed ? 'Expand' : 'Fold'" /></el-icon></el-button></div>
    </aside>
    <div class="main-shell">
      <header class="topbar"><el-breadcrumb separator="/"><el-breadcrumb-item>{{ inProject ? '数据加工' : inGovernance ? '数据治理与共享' : '工作空间' }}</el-breadcrumb-item><el-breadcrumb-item v-if="inProject && project">{{ project.name }}</el-breadcrumb-item><el-breadcrumb-item>{{ current.title }}</el-breadcrumb-item></el-breadcrumb>
        <div class="topbar-actions"><span class="demo-chip"><i></i>演示模式</span><el-button text :type="page === 'settings' ? 'primary' : ''" @click="navigate('settings')"><el-icon><SetUp /></el-icon><span>设置</span></el-button><el-popover placement="bottom-end" :width="340" trigger="click"><template #reference><el-button text aria-label="消息"><el-badge :value="state.notices.length" :max="9"><el-icon><Bell /></el-icon></el-badge></el-button></template><div class="notice" v-for="(notice,i) in state.notices.slice(0,8)" :key="i">{{ notice }}</div></el-popover><span class="top-divider"></span><div class="avatar">{{ state.role.slice(0,1) }}</div><el-dropdown @command="userCommand"><button class="user-menu"><b>{{ state.role }}</b><small>切换演示身份<el-icon><ArrowDown /></el-icon></small></button><template #dropdown><el-dropdown-menu><el-dropdown-item v-for="role in ['管理员','加工人员','审核人员','数据使用者']" :key="role" :command="role">{{ role }}</el-dropdown-item><el-dropdown-item divided command="reset">重置演示数据</el-dropdown-item><el-dropdown-item divided command="logout">退出登录</el-dropdown-item></el-dropdown-menu></template></el-dropdown></div>
      </header>
      <main v-if="storage.ready" class="page-content">
        <el-alert v-if="storage.error" :title="storage.error" type="warning" :closable="false" />
        <div class="page-heading"><div><div class="eyebrow">{{ inProject || page === 'projects' ? 'DATA PROCESSING' : page === 'settings' ? 'WORKSPACE SETTINGS' : inGovernance ? 'DATA GOVERNANCE' : 'RESEARCH WORKSPACE' }}</div><h1>{{ current.title }}</h1><p>{{ current.subtitle }}</p></div><span class="save-state"><i></i>{{ storage.saving ? '正在保存…' : '已保存到本地' }}</span></div>
        <template v-if="inProject && project">
          <section class="project-context"><div><span class="icon-tile blue"><el-icon><FolderOpened /></el-icon></span><div><small>当前项目</small><b>{{ project.name }}</b></div></div><div class="project-context-actions"><el-select :model-value="state.activeProjectId" aria-label="切换项目" @change="enterSelectedProject"><el-option v-for="item in visibleProjects()" :key="item.id" :value="item.id" :label="item.name" /></el-select><el-select v-if="datasets.length" v-model="state.activeDataset" aria-label="当前目标数据集"><el-option v-for="dataset in datasets" :key="dataset.id" :value="dataset.id" :label="dataset.name" /></el-select><el-button text @click="navigate('projects')">全部项目</el-button></div></section>
          <WorkflowSteps :page="page" @navigate="navigate" />
          <el-empty v-if="!datasets.length && page !== 'planning'" description="当前项目尚无数据集，请先定义建设目标"><el-button type="primary" @click="navigate('planning')">规划第一个数据集</el-button></el-empty>
          <PreparationView v-else-if="page === 'processing'" :key="state.activeDataset" @navigate="navigate" />
          <CleaningView v-else-if="page === 'cleaning'" :key="state.activeDataset" @navigate="navigate" />
          <AnnotationWorkbench v-else-if="page === 'generation'" :key="state.activeDataset" @navigate="navigate" />
          <ResultsView v-else-if="page === 'versions'" :key="page + state.activeDataset" :page="page" @navigate="navigate" />
          <ProcessView v-else :key="page + state.activeDataset" :page="page" @navigate="navigate" />
        </template>
        <ProjectsView v-else-if="page === 'projects' || inProject" @navigate="navigate" />
        <ProjectTasks v-else-if="page === 'project-tasks'" @navigate="navigate" />
        <LandingView v-else-if="page === 'workbench'" :page="page" @navigate="navigate" />
        <DatasetLibrary v-else-if="['mydatasets','catalog','square','requests'].includes(page)" :mode="page" @navigate="navigate" />
        <ResultsView v-else-if="['audit','release'].includes(page)" :key="page" :page="page" @navigate="navigate" />
        <SettingsView v-else-if="page === 'settings'" @navigate="navigate" />
        <ResultsView v-else-if="page === 'services'" page="services" @navigate="navigate" />
        <GovernanceView v-else :key="page" :page="page" />
        <footer class="page-footer"><span>研数 · 科研数据建设与共享</span><span>{{ inProject && project ? project.name : '全局工作空间' }} · 浏览器本地保存</span></footer>
      </main><div v-else class="loading-screen"><el-icon class="is-loading"><Loading /></el-icon>正在加载工作空间…</div>
    </div>
  </div>
</template>
