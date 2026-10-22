<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { state, selectedSources, selectedVersions, allowed } from '../store'
import { preparationInputs } from '../workflow'
const emit = defineEmits(['navigate'])
const inputs = computed(() => preparationInputs(selectedSources(), selectedVersions(), state.activeDataset))
const selectedIds = ref([])
watch(() => state.activeDataset, () => {
  const previous = state.ui.pipeline
  selectedIds.value = previous?.datasetId === state.activeDataset
    ? inputs.value.filter(input => previous.inputIds.includes(input.id) || previous.inputIds.includes(input.originId)).map(input => input.id)
    : inputs.value.filter(input => input.ready).map(input => input.id)
}, { immediate: true })
const selected = computed(() => inputs.value.filter(input => selectedIds.value.includes(input.id)))
const ready = computed(() => selected.value.length && selected.value.every(input => input.ready))
const cleanable = computed(() => ready.value && selected.value.every(input => ['text','image'].includes(input.kind)))
const preview = computed(() => selected.value.find(input => input.ready))
function proceed() {
  if (!allowed('edit') || !cleanable.value) return ElMessage.warning('请选择可清洗资料；结构化条目可直接进入数据标注')
  state.ui.pipeline = { datasetId: state.activeDataset, inputIds: selected.value.map(input => input.id) }
  emit('navigate', 'cleaning')
}
function annotate() {
  if (!allowed('edit') || !ready.value) return
  const chosen = selected.value
  const versions = selectedVersions().filter(version => chosen.some(input => input.id === version.id))
  if (chosen.some(input => input.kind === 'structured' && !versions.find(version => version.id === input.id)?.records.some(record => record.question || record.content?.trim() || record.image?.startsWith('data:image/')))) {
    state.focusVersion = chosen.find(input => input.kind === 'structured').id
    ElMessage.info('此条目结构需配置字段映射，先在项目成果中查看原始字段')
    emit('navigate', 'versions')
    return
  }
  const qa = versions.length && versions.every(version => version.records.some(record => record.question))
  const image = chosen.every(input => input.kind === 'image' || versions.find(version => version.id === input.id)?.records.every(record => record.image?.startsWith('data:image/')))
  state.ui.pipeline = { datasetId: state.activeDataset, inputIds: chosen.map(input => input.id),
    generationType: qa ? '问答人工复核' : image ? '图片分类' : '文本分类', skippedCleaning: true }
  state.focusVersion = versions[0]?.id || ''
  emit('navigate', 'generation')
}
</script>

<template>
  <div class="pipeline-stack">
    <section class="panel pipeline-card">
      <div class="pipeline-card-heading"><span class="pipeline-marker">01</span><div><h3>确认上游资料</h3><p>接续语料管理中的文件与解析结果，选择本次需要加工的资料。</p></div><el-button @click="$emit('navigate', 'sources')">返回语料管理</el-button></div>
      <div class="pipeline-metrics"><div><small>已接入资料</small><b>{{ inputs.length }} <em>份</em></b></div><div><small>可继续加工</small><b>{{ inputs.filter(input => input.ready).length }} <em>份</em></b></div><div><small>待解析或检查</small><b>{{ inputs.filter(input => !input.ready).length }} <em>份</em></b></div></div>
      <el-checkbox-group v-model="selectedIds" class="pipeline-input-list">
        <label v-for="input in inputs" :key="input.id" class="pipeline-input-row">
          <el-checkbox :value="input.id">{{ input.name }}</el-checkbox><el-tag :type="input.ready ? 'success' : 'warning'">{{ input.stage }}</el-tag><small>{{ input.reason || (input.kind === 'image' ? '图片资料' : '文本内容可用') }}</small>
        </label>
      </el-checkbox-group>
      <el-empty v-if="!inputs.length" description="尚未接入资料，请先返回语料管理上传文件" />
    </section>
    <section class="panel pipeline-card">
      <div class="pipeline-card-heading"><span class="pipeline-marker">02</span><div><h3>检查输入内容</h3><p>文档使用已解析的正文；文本与图片可以直接进入后续清洗。</p></div></div>
      <template v-if="preview"><p class="pipeline-preview-name">{{ preview.name }}</p><el-image v-if="preview.kind === 'image'" :src="preview.content" fit="contain" class="cleaning-image" /><pre v-else class="pipeline-preview">{{ preview.content.slice(0, 1200) }}</pre></template>
      <el-empty v-else description="选择一份可用资料查看预览" :image-size="60" />
    </section>
    <section class="panel pipeline-card pipeline-next">
      <div class="pipeline-card-heading"><span class="pipeline-marker">03</span><div><h3>选择下一步</h3><p>已选择 {{ selected.length }} 份资料。文本与图片可进入清洗；结构化条目保留字段，可直接标注。</p></div></div>
      <div class="pipeline-actions"><el-button :disabled="!ready || !allowed('edit')" @click="annotate">跳过清洗，进入数据标注</el-button><el-button type="primary" :disabled="!cleanable || !allowed('edit')" @click="proceed">进入第 4 步：清洗<el-icon><ArrowRight /></el-icon></el-button></div>
    </section>
  </div>
</template>
