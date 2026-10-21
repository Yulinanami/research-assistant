<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
const props = defineProps({ modelValue: Boolean, title: String, fields: Array, initial: Object, assist: Object, confirmText: { type: String, default: '保存' } })
const emit = defineEmits(['update:modelValue', 'save'])
const form = ref({})
watch(() => props.modelValue, open => { if (open) form.value = { ...Object.fromEntries(props.fields.map(f => [f.key, f.default ?? (f.type === 'number' ? 100 : f.type === 'checks' ? [] : '')])), ...JSON.parse(JSON.stringify(props.initial || {})) } })
function submit() {
  const missing = props.fields.find(f => f.required && !String(form.value[f.key] ?? '').trim())
  if (missing) return ElMessage.warning(`请填写${missing.label}`)
  emit('save', { ...form.value })
}
</script>
<template><el-dialog :model-value="modelValue" :title="title" width="620" @update:model-value="emit('update:modelValue', $event)"><div v-if="assist" class="assist-strip"><el-button link type="primary" @click="Object.assign(form, assist); ElMessage.success('已填入模拟建议，请核对后保存')"><el-icon><MagicStick /></el-icon>智能填写（模拟）</el-button></div><el-form :model="form" label-position="top" class="dialog-form" @submit.prevent="submit"><el-form-item v-for="field in fields" :key="field.key" :label="field.label" :required="field.required"><el-select v-if="field.type === 'select'" v-model="form[field.key]" :multiple="field.multiple" @change="value => field.onChange?.(value, form)" :placeholder="`请选择${field.label}`"><el-option v-for="option in field.options" :key="typeof option === 'object' ? option.value : option" :label="typeof option === 'object' ? option.label : option" :value="typeof option === 'object' ? option.value : option" /></el-select><el-input-number v-else-if="field.type === 'number'" v-model="form[field.key]" :min="field.min ?? 1" :max="field.max ?? 100000" /><el-checkbox-group v-else-if="field.type === 'checks'" v-model="form[field.key]"><el-checkbox v-for="option in field.options" :key="option" :value="option">{{ option }}</el-checkbox></el-checkbox-group><el-switch v-else-if="field.type === 'switch'" v-model="form[field.key]" /><el-input v-else v-model="form[field.key]" :type="field.type === 'textarea' ? 'textarea' : 'text'" :rows="field.rows || 3" :placeholder="field.placeholder || `请输入${field.label}`" /><small v-if="field.help" class="field-help">{{ field.help }}</small></el-form-item></el-form><template #footer><el-button @click="emit('update:modelValue', false)">取消</el-button><el-button type="primary" @click="submit">{{ confirmText }}</el-button></template></el-dialog></template>
