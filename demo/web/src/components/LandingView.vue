<script setup>
import { computed } from 'vue'
import { state, visibleProjects, openProject, allowed, datasetName } from '../store'
defineProps({ page: String })
const emit = defineEmits(['navigate'])
const projects = computed(visibleProjects)
const tasks = computed(() => state.tasks.filter(task => allowed('view', task.datasetId)))
const datasets = computed(() => state.datasets.filter(dataset => allowed('view', dataset.id)))
const sources = computed(() => state.sources.filter(source => allowed('view', source.datasetId)))
function enter(project, datasetId, page = 'planning') { if (openProject(project.id, datasetId)) emit('navigate', page) }
function openTask(task) {
  const project = projects.value.find(p => p.id === task.projectId)
  if (project) { state.focusVersion = task.versionId || ''; enter(project, task.datasetId, task.versionId ? 'versions' : 'project-tasks') }
}
</script>

<template>

    <div class="metric-grid"><div v-for="metric in [{label:'可访问项目',value:projects.length},{label:'数据集',value:datasets.length},{label:'数据文件',value:sources.length},{label:'执行中任务',value:tasks.filter(t => t.status === '执行中').length}]" :key="metric.label" class="metric-card"><div class="metric-top">{{ metric.label }}</div><div class="metric-value">{{ metric.value }}</div></div></div>
    <section class="panel"><div class="section-title"><div><h3>最近项目</h3><p>打开项目继续建设，资料和任务保持在所属项目中</p></div><el-button type="primary" @click="$emit('navigate', 'projects')">管理项目<el-icon><ArrowRight /></el-icon></el-button></div><div class="project-grid compact-projects"><article v-for="project in projects.slice(0, 4)" :key="project.id" class="project-card"><span class="icon-tile blue"><el-icon><FolderOpened /></el-icon></span><h3>{{ project.name }}</h3><p>{{ project.description }}</p><el-button type="primary" plain @click="enter(project)">打开项目</el-button></article></div><el-empty v-if="!projects.length" description="暂无项目，请进入数据加工创建项目" /></section>
    <section class="panel"><div class="section-title"><h3>任务与待办</h3><span class="muted">跨项目汇总，点击任务回到所属项目</span></div><el-table :data="tasks.slice(0, 12)" @row-click="openTask" class="clickable-table"><el-table-column label="任务名称" prop="name" min-width="260" /><el-table-column label="所属数据集" min-width="200"><template #default="{row}">{{ datasetName(row.datasetId) }}</template></el-table-column><el-table-column label="状态" prop="status" width="100" /><el-table-column label="进度" width="160"><template #default="{row}"><el-progress :percentage="row.progress" /></template></el-table-column></el-table></section>
    <div class="metric-grid compact"><div class="panel"><h4>待解析资料</h4><strong>{{ sources.filter(s => ['待解析', '解析失败'].includes(s.status)).length }}</strong></div><div class="panel"><h4>标注任务</h4><strong>{{ tasks.filter(t => /标注|分类/.test(t.type)).length }}</strong></div><div class="panel"><h4>生成任务</h4><strong>{{ tasks.filter(t => /生成|增强|片段/.test(t.type)).length }}</strong></div><div class="panel"><h4>待审核版本</h4><strong>{{ state.versions.filter(v => v.status === '待审核' && allowed('view', v.datasetId)).length }}</strong></div></div>

</template>
