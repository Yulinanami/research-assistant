<script setup>
import { computed, ref } from 'vue'
import { state, notify } from '../store'
import { promptDefinitions } from '../promptConfig'
const props = defineProps({ editable: Boolean })
const group = ref('全部')
const groups = ['全部', ...new Set(promptDefinitions.map(item => item.group))]
const prompts = computed(() => promptDefinitions.filter(item => group.value === '全部' || item.group === group.value))
function reset(item) { if (props.editable) { state.settings.prompts[item.key] = item.text; notify('已恢复默认提示词') } }
</script>

<template>
  <div class="toolbar"><el-select v-model="group" aria-label="提示词分类"><el-option v-for="item in groups" :key="item" :value="item" /></el-select></div>
  <div class="prompt-config-grid"><section v-for="item in prompts" :key="item.key" class="prompt-config-card"><div class="section-title"><h4>{{ item.name }}</h4><el-button text :disabled="!editable" @click="reset(item)">恢复默认</el-button></div><el-input v-model="state.settings.prompts[item.key]" type="textarea" :rows="6" :disabled="!editable" :aria-label="item.name + '提示词'" /></section></div>
</template>
