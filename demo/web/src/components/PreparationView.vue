<script setup>
import { ref, watch } from 'vue'
import { state } from '../store'
import { preprocessingModules } from '../preprocessing'
import CleaningView from './CleaningView.vue'
import PreprocessingTaskView from './PreprocessingTaskView.vue'

const emit = defineEmits(['navigate'])
const key = state.role + ':' + state.activeDataset
state.ui.preprocessingWorkbenches ||= {}
const saved = state.ui.preprocessingWorkbenches[key]
const requested = state.ui.preprocessingMode
delete state.ui.preprocessingMode
const active = ref([requested, saved?.active, ...(saved?.selected || [])]
  .find(id => preprocessingModules.some(item => item.id === id)) || 'cleaning')
const cleaningVisited = ref(active.value === 'cleaning')
watch(active, id => { if (id === 'cleaning') cleaningVisited.value = true })
watch(active, id => {
  state.ui.preprocessingWorkbenches[key] = { active: id }
}, { immediate: true })
function configure(id) {
  if (preprocessingModules.some(item => item.id === id)) active.value = id
}
function navigate(page) {
  if (page === 'processing' && state.ui.preprocessingMode) {
    configure(state.ui.preprocessingMode)
    delete state.ui.preprocessingMode
  } else emit('navigate', page)
}

function openTaskCenter() {
  state.ui.taskCenterScope = { datasetId: state.activeDataset }
  emit('navigate', 'task-center')
}
</script>

<template>
  <section class="panel preprocessing-tabs">
    <div class="section-title">
      <div><h3>数据预处理</h3></div>
      <el-button @click="openTaskCenter">任务记录<el-icon><List /></el-icon></el-button>
    </div>
    <div class="preprocessing-module-grid" role="group" aria-label="选择预处理版块">
      <button v-for="item in preprocessingModules" :key="item.id" type="button" :class="['preprocessing-module', { active: active === item.id }]" :aria-pressed="active === item.id" @click="configure(item.id)">
        <span class="preprocessing-module-indicator" aria-hidden="true"><el-icon v-if="active === item.id"><Check /></el-icon></span>
        <span class="preprocessing-module-title">{{ item.name }}</span>
      </button>
    </div>
  </section>
  <div v-if="cleaningVisited" v-show="active === 'cleaning'" class="preprocessing-cleaning">
    <CleaningView @navigate="navigate" />
  </div>
  <PreprocessingTaskView v-if="active && active !== 'cleaning'" :key="active" :type="active" @navigate="navigate" />
</template>
