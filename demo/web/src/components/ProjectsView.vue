<script setup>
import { computed, ref } from 'vue'
import { state, visibleProjects, openProject, notify, allowed } from '../store'
import { uid, now } from '../domain'
import FormDialog from './FormDialog.vue'
const emit = defineEmits(['navigate'])
const search = ref('')
const dialog = ref(false)
const projects = computed(() => visibleProjects().filter(p => `${p.name}${p.description}`.includes(search.value)))
const canCreate = computed(() => { const rule = state.permissions.find(r => r.role === state.role); return rule?.edit && rule.project === '全部项目' })
const fields = [{ key: 'name', label: '项目名称', required: true }, { key: 'description', label: '建设目标', type: 'textarea', required: true }]
function enter(project) { if (openProject(project.id)) emit('navigate', 'planning') }
function create(data) {
  if (!canCreate.value) return
  const project = { ...data, id: uid('project'), ownerId: state.role, created: now(), flowSteps: ['文本清洗', '知识片段', '问答生成'] }
  state.projects.unshift(project); dialog.value = false; notify('项目已创建，接下来规划第一个数据集'); enter(project)
}
const datasetsFor = id => state.datasets.filter(d => d.projectId === id && allowed('view', d.id))
const tasksFor = id => state.tasks.filter(t => t.projectId === id && allowed('view', t.datasetId))
</script>

<template>
  <section class="workspace-intro"><div><span class="eyebrow">PROJECT WORKSPACE</span><h2>围绕项目，建设可用的数据</h2><p>选择项目后，按流程接入资料、清洗、标注并管理成果。每个项目拥有独立的资料与任务。</p></div><el-button type="primary" :disabled="!canCreate" @click="dialog = true"><el-icon><Plus /></el-icon>新建项目</el-button></section>
  <div class="toolbar"><el-input v-model="search" placeholder="搜索项目名称或建设目标" clearable><template #prefix><el-icon><Search /></el-icon></template></el-input><span class="muted">{{ projects.length }} 个可访问项目</span></div>
  <div class="project-grid"><article v-for="project in projects" :key="project.id" class="project-card"><div class="project-card-top"><span class="icon-tile blue"><el-icon><FolderOpened /></el-icon></span><el-tag type="info">{{ project.ownerId === state.role ? '我的项目' : '可访问' }}</el-tag></div><h3>{{ project.name }}</h3><p>{{ project.description || '为科研工作整理和建设数据集' }}</p><div class="project-card-stats"><span><b>{{ datasetsFor(project.id).length }}</b> 数据集</span><span><b>{{ tasksFor(project.id).length }}</b> 加工任务</span><span><b>{{ tasksFor(project.id).filter(t => t.status === '执行中').length }}</b> 执行中</span></div><div class="project-card-footer"><small>{{ project.created }}</small><el-button type="primary" @click="enter(project)">打开项目<el-icon><ArrowRight /></el-icon></el-button></div></article></div>
  <el-empty v-if="!projects.length" description="暂无匹配项目，创建项目开始数据建设" />
  <FormDialog v-model="dialog" title="新建数据加工项目" :fields="fields" @save="create" />
</template>
