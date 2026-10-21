<script setup>
import { computed, ref, onMounted, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { navigation } from './data'
import { state, storage, initialize, resetDemo, datasetName, allowed } from './store'
import HomeView from './components/HomeView.vue'
import ProcessView from './components/ProcessView.vue'
import GovernanceView from './components/GovernanceView.vue'
import ResultsView from './components/ResultsView.vue'
const pages = navigation.flatMap(g => g.items)
const page = ref(location.hash.slice(1) || 'home')
const collapsed = ref(false)
const globalSearch = ref('')
const current = computed(() => pages.find(p => p.id === page.value) || pages[0])
const searchResults = computed(() => state.datasets.filter(d => allowed('view', d.id) && d.name.includes(globalSearch.value)))
const processPages = ['planning', 'sources', 'processing', 'generation', 'annotation', 'models']
const resultPages = ['versions', 'review', 'catalog', 'requests', 'services']
watch(() => [state.role, JSON.stringify(state.permissions)], () => { if (!allowed('view', state.activeDataset)) state.activeDataset = state.datasets.find(d => allowed('view', d.id))?.id || '' })
function navigate(id) { page.value = pages.some(p => p.id === id) ? id : 'home'; location.hash = page.value; globalSearch.value = '' }
async function reset() {
  try { await ElMessageBox.confirm('将清除本演示内的数据、文件与操作记录，并恢复初始样例。', '重置演示', { confirmButtonText: '确认重置', cancelButtonText: '取消', type: 'warning' }); await resetDemo(); navigate('home') } catch (e) { if (e instanceof Error) storage.error = e.message }
}
onMounted(() => { initialize(); window.addEventListener('hashchange', () => { page.value = location.hash.slice(1) || 'home' }) })
</script>
<template>
  <div class="app-shell" :class="{ collapsed }">
    <aside class="sidebar">
      <a class="brand" href="#home" @click.prevent="navigate('home')"><span class="brand-mark"><el-icon><DataLine /></el-icon></span><span v-if="!collapsed"><b>研数</b><small>科研数据加工平台</small></span></a>
      <div class="space-label" v-if="!collapsed">RESEARCH WORKSPACE</div>
      <nav><section v-for="group in navigation" :key="group.title" class="nav-group"><div v-if="!collapsed" class="nav-group-title">{{ group.title }}</div><button v-for="item in group.items" :key="item.id" :class="['nav-item', { active: page === item.id }]" :title="item.title" @click="navigate(item.id)"><el-icon><component :is="item.icon" /></el-icon><span v-if="!collapsed">{{ item.title }}</span><span v-if="item.id === 'review' && !collapsed" class="nav-badge">{{ state.versions.filter(v => v.status === '待审核').length }}</span></button></section></nav>
      <div class="sidebar-footer"><span class="online-dot"></span><span v-if="!collapsed">本地演示空间</span><el-button text :title="collapsed ? '展开导航' : '收起导航'" @click="collapsed = !collapsed"><el-icon><component :is="collapsed ? 'Expand' : 'Fold'" /></el-icon></el-button></div>
    </aside>
    <div class="main-shell">
      <header class="topbar">
        <el-breadcrumb separator="/"><el-breadcrumb-item>工作空间</el-breadcrumb-item><el-breadcrumb-item>{{ current.title }}</el-breadcrumb-item></el-breadcrumb>
        <div class="topbar-actions"><el-popover :visible="Boolean(globalSearch)" placement="bottom" :width="360"><template #reference><el-input v-model="globalSearch" placeholder="搜索数据集…" clearable class="global-search"><template #prefix><el-icon><Search /></el-icon></template></el-input></template><div class="search-result" v-for="item in searchResults" :key="item.id" @click="state.activeDataset = item.id; navigate('versions')"><el-icon><FolderOpened /></el-icon>{{ item.name }}</div><el-empty v-if="!searchResults.length" description="没有匹配的数据集" :image-size="50" /></el-popover>
          <span class="demo-chip"><i></i>演示模式</span><el-popover placement="bottom-end" :width="340" trigger="click"><template #reference><el-button class="notification" text aria-label="消息"><el-badge :value="state.notices.length" :max="9"><el-icon><Bell /></el-icon></el-badge></el-button></template><h4>工作空间消息</h4><div class="notice" v-for="(text, i) in state.notices.slice(0, 8)" :key="i">{{ text }}</div></el-popover>
          <span class="top-divider"></span><div class="avatar">{{ state.role.slice(0, 1) }}</div><el-dropdown @command="command => command === 'reset' ? reset() : state.role = command"><button class="user-menu"><b>{{ state.role }}</b><small>切换演示身份 <el-icon><ArrowDown /></el-icon></small></button><template #dropdown><el-dropdown-menu><el-dropdown-item v-for="role in ['管理员', '加工人员', '审核人员', '数据使用者']" :key="role" :command="role">{{ role }} {{ state.role === role ? '✓' : '' }}</el-dropdown-item><el-dropdown-item divided command="reset">重置演示数据</el-dropdown-item></el-dropdown-menu></template></el-dropdown>
        </div>
      </header>
      <main v-if="storage.ready" class="page-content"><el-alert v-if="storage.error" :title="storage.error" type="warning" show-icon :closable="false" /><div class="page-heading"><div><div class="eyebrow">{{ processPages.includes(page) ? 'DATA PROCESSING' : page === 'home' ? 'WORKSPACE OVERVIEW' : 'DATA GOVERNANCE' }}</div><h1>{{ current.title }}</h1><p>{{ current.subtitle }}</p></div><div class="heading-side"><span :class="['save-state', { warning: storage.error }]"><i></i>{{ storage.error ? '保存异常' : storage.saving ? '正在保存…' : '已保存到本地' }}</span><el-select v-if="!['home', 'catalog', 'statistics'].includes(page)" v-model="state.activeDataset" class="dataset-select"><el-option v-for="dataset in state.datasets.filter(d => allowed('view', d.id))" :key="dataset.id" :label="dataset.name" :value="dataset.id" /></el-select></div></div>
        <HomeView v-if="page === 'home' || page === 'statistics'" :statistics="page === 'statistics'" @navigate="navigate" /><ProcessView v-else-if="processPages.includes(page)" :key="page" :page="page" @navigate="navigate" /><ResultsView v-else-if="resultPages.includes(page)" :key="page" :page="page" @navigate="navigate" /><GovernanceView v-else :key="page" :page="page" />
        <footer class="page-footer"><span>研数 · 科研数据加工平台</span><span>模拟处理 · 浏览器本地保存 · {{ datasetName(state.activeDataset) }}</span></footer>
      </main><div v-else class="loading-screen"><el-icon class="is-loading"><Loading /></el-icon>正在加载工作空间…</div>
    </div>
  </div>
</template>
