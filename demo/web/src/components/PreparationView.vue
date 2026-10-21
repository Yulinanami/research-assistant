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
const preview = computed(() => selected.value.find(input => input.ready))
function proceed() {
  if (!ready.value) return ElMessage.warning('请选择可用资料；待解析文档请先返回语料管理完成解析')
  state.ui.pipeline = { datasetId: state.activeDataset, inputIds: selected.value.map(input => input.id) }
  emit('navigate', 'cleaning')
}
</script>

<template>
  <div class="pipeline-stack">
    <section class="panel pipeline-card">
      <div class="pipeline-card-heading"><span class="pipeline-marker">01</span><div><h3>确认上游资料</h3><p>接续语料管理中的文件与解析结果，选择本次需要加工的资料。</p></div><el-button @click="$emit('navigate', 'sources')">返回语料管理</el-button></div>
      <div class="pipeline-metrics"><div><small>已接入资料</small><b>{{ inputs.length }} <em>份</em></b></div><div><small>可进入清洗</small><b>{{ inputs.filter(input => input.ready).length }} <em>份</em></b></div><div><small>待解析或检查</small><b>{{ inputs.filter(input => !input.ready).length }} <em>份</em></b></div></div>
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
      <div class="pipeline-card-heading"><span class="pipeline-marker">03</span><div><h3>交付清洗阶段</h3><p>已选择 {{ selected.length }} 份资料，下一步按文本或图片配置清洗流程。</p></div><el-button type="primary" :disabled="!ready || !allowed('edit')" @click="proceed">进入第 4 步：清洗<el-icon><ArrowRight /></el-icon></el-button></div>
    </section>
  </div>
</template>
