<script setup>
import { computed } from 'vue'
import { workflowSteps } from '../workflow'
const props = defineProps({ page: String })
defineEmits(['navigate'])
const activePage = computed(() => ({ annotation:'generation', cleaning:'processing' })[props.page] || props.page)
const index = computed(() => workflowSteps.findIndex(step => step.page === activePage.value))
</script>

<template>
  <nav v-if="index >= 0" class="panel step-panel" aria-label="数据加工流程">
    <button v-for="(step, i) in workflowSteps" :key="step.page"
      :class="['step-button', { active: step.page === activePage, passed: i < index }]"
      :aria-current="step.page === activePage ? 'step' : undefined" @click="$emit('navigate', step.page)">
      <span>{{ i + 1 }}</span>{{ step.title }}<el-icon v-if="i < workflowSteps.length - 1"><ArrowRight /></el-icon>
    </button>
  </nav>
</template>
