<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { state, selectedSources, selectedVersions, allowed, addVersion, taskName, notify, submitForReview } from '../store'
import { classificationInputs } from '../workspace'
import { classificationKind, classificationDraft, recordAnnotationTask } from '../annotation'
const props = defineProps({ kind: String })
const emit = defineEmits(['navigate'])
const templateId = ref(state.settings.labelTemplates.find(t => t.kind === props.kind)?.id || '')
const templateSnapshot = ref(null)
const templates = computed(() => state.settings.labelTemplates.filter(t => t.kind === props.kind))
const template = computed(() => templateSnapshot.value || templates.value.find(t => t.id === templateId.value))
const index = ref(0)
const records = ref([])
const draftId = ref('')
const resumeId = ref('')
const current = computed(() => records.value[index.value])
const type = computed(() => props.kind === 'image' ? '图片整体分类' : '文本分类')
const savedVersions = computed(() => selectedVersions().filter(version => classificationKind(version) === props.kind))
const target = state.ui.annotationTarget?.datasetId === state.activeDataset ? { ...state.ui.annotationTarget } : null
delete state.ui.annotationTarget
let restoring = false
const freshRecords = () => classificationInputs(props.kind, selectedSources(), selectedVersions(), state.activeDataset, state.ui.pipeline)
function restore(version) {
  restoring = true
  templateSnapshot.value = version?.labelTemplate ? JSON.parse(JSON.stringify(version.labelTemplate)) : null
  templateId.value = templateSnapshot.value?.id || templates.value[0]?.id || ''
  records.value = version ? JSON.parse(JSON.stringify(version.records)) : freshRecords()
  records.value.forEach(record => { record.labels ||= [] })
  resumeId.value = version?.id || ''
  draftId.value = version?.status === '草稿' ? version.id : ''
  index.value = target && version?.id === target.versionId ? Math.min(target.index || 0, Math.max(0, records.value.length - 1)) : 0
  restoring = false
}
function resume(id) { restore(savedVersions.value.find(version => version.id === id)) }
function load() {
  const fresh = freshRecords()
  const context = state.ui.pipeline?.datasetId === state.activeDataset ? state.ui.pipeline : null
  const explicitInputs = context?.inputIds?.some(id => fresh.some(record => record.id === id || record.id.startsWith(id + '-')))
  const version = savedVersions.value.find(item => item.id === target?.versionId)
    || classificationDraft(selectedVersions(), state.activeDataset, props.kind, explicitInputs ? fresh.map(record => record.id) : undefined)
  restore(version)
}
watch(templateId, () => {
  if (restoring) return
  templateSnapshot.value = null
  records.value.forEach(record => { record.labels = [] })
  draftId.value = ''; resumeId.value = ''
}, { flush: 'sync' })
watch(() => state.activeDataset, load, { immediate: true })
function toggle(label) {
  if (!allowed('edit') || !current.value || !template.value) return
  current.value.labels = template.value.multiple
    ? current.value.labels.includes(label) ? current.value.labels.filter(item => item !== label) : [...current.value.labels, label]
    : [label]
}
function save(submit = false) {
  if (!allowed('edit') || !template.value || !records.value.length) return ElMessage.warning('请选择标签模板并接入可用资料')
  if (submit && records.value.some(record => !record.labels.length)) return ElMessage.warning('请完成每条资料的分类后提交审核')
  const snapshot = JSON.parse(JSON.stringify(template.value))
  let version = selectedVersions().find(item => item.id === draftId.value && item.status === '草稿')
  if (!version) version = addVersion(state.activeDataset, records.value, type.value, records.value[0].sourceId, 'dataset')
  else version.records = JSON.parse(JSON.stringify(records.value))
  version.labelTemplate = snapshot
  templateSnapshot.value = snapshot
  draftId.value = version.id; resumeId.value = version.id; state.focusVersion = version.id
  const progress = Math.round(records.value.filter(record => record.labels.length).length / records.value.length * 100)
  const task = recordAnnotationTask(state.tasks, version, type.value, progress, taskName(type.value))
  if (submit) {
    if (submitForReview(version)) { task.status = '已提交'; emit('navigate', 'audit') }
  } else notify('分类草稿已保存到项目成果')
}
</script>

<template>
  <section class="panel">
    <div class="task-filters">
      <el-select v-model="resumeId" aria-label="选择已保存标注" placeholder="新建标注" @change="resume">
        <el-option value="" label="新建标注" />
        <el-option v-for="version in savedVersions" :key="version.id" :value="version.id" :label="'V' + version.number + ' · ' + version.status + ' · ' + version.records.length + '条'" />
      </el-select>
      <el-select v-model="templateId" aria-label="选择标签模板" placeholder="选择标签模板">
        <el-option v-if="templateSnapshot && !templates.some(item => item.id === templateSnapshot.id)" :value="templateSnapshot.id" :label="templateSnapshot.name" />
        <el-option v-for="item in templates" :key="item.id" :value="item.id" :label="item.name" />
      </el-select>
      <span class="muted">{{ template?.description }} · {{ template?.multiple ? '多标签' : '单标签' }}</span>
      <el-button :disabled="!allowed('edit') || !records.length" @click="save(false)">保存草稿</el-button>
      <el-button type="primary" :disabled="!allowed('edit') || !records.length" @click="save(true)">下一步：提交审核</el-button>
    </div>
    <p class="muted">草稿可继续编辑；修改已提交或已发布的标注，保存时会创建新草稿。</p>
  </section>
  <div v-if="current" class="annotation-layout"><section class="panel"><div class="section-title"><h3>{{ current.title }}</h3><span class="muted">{{ index+1 }} / {{ records.length }}</span></div><el-image v-if="kind === 'image'" :src="current.image" fit="contain" class="classification-image" /><pre v-else class="classification-text">{{ current.content }}</pre><div class="annotation-pagination"><el-button :disabled="index === 0" @click="index--">上一条</el-button><span>{{ records.filter(r => r.labels.length).length }} / {{ records.length }} 已标注</span><el-button :disabled="index === records.length-1" @click="index++">下一条</el-button></div></section><section class="panel"><div class="section-title"><div><h3>{{ kind === 'image' ? '图片整体标签' : '文本类别' }}</h3><p>{{ kind === 'image' ? '标签描述整张图片的类别，无需框选。' : '根据文本的主要含义选择类别。' }}</p></div></div><div class="classification-labels"><button v-for="label in template?.labels || []" :key="label" :class="{selected:current.labels.includes(label)}" :disabled="!allowed('edit')" @click="toggle(label)"><span>{{ label }}</span><el-icon v-if="current.labels.includes(label)"><Check /></el-icon></button></div><el-alert class="spaced" title="人工标签与数据集检索标签分别保存，保存后可在项目成果中查看。" type="info" :closable="false" /></section></div>
  <section v-else class="panel"><el-empty description="暂无可用于分类的资料"><el-button type="primary" @click="$emit('navigate','sources')">接入{{ kind === 'image' ? '图片' : '文本' }}资料</el-button></el-empty></section>
</template>
