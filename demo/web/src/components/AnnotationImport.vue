<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { state, allowed, importFile } from '../store'
const props = defineProps({ kind: { type: String, default: 'image' } })
const emit = defineEmits(['imported'])
const picker = ref(null)
const busy = ref(false)
const datasetId = state.activeDataset
function open() {
  if (!busy.value && state.activeDataset === datasetId && allowed('edit', datasetId)) picker.value?.click()
}
async function upload(event) {
  const imported = []
  busy.value = true
  try {
    if (state.activeDataset !== datasetId || !allowed('edit', datasetId)) throw new Error('请在当前数据集中选择文件')
    for (const file of Array.from(event.target.files || [])) {
      if (props.kind === 'image' && !file.type?.startsWith('image/') && !/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(file.name)) throw new Error(`${file.name} 不是图片文件`)
      imported.push(await importFile(file, datasetId))
    }
    if (imported.length) ElMessage.success(`已接入 ${imported.length} 份资料，可直接继续标注`)
  } catch (error) { ElMessage.warning(error.message) }
  finally {
    if (imported.length) emit('imported', imported)
    busy.value = false
    event.target.value = ''
  }
}
defineExpose({ open })
</script>

<template>
  <el-button :loading="busy" :disabled="!allowed('edit')" @click="open">接入{{ kind === 'image' ? '图片' : '文本' }}资料</el-button>
  <input ref="picker" type="file" multiple hidden :accept="kind === 'image' ? 'image/*' : '.txt,.md,.json,.jsonl,.csv'" @change="upload" />
</template>
