<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { state, selectedSources, selectedVersions, allowed, addVersion, taskName, notify, submitAnnotationResult } from '../store'
import { classificationInputs, generationInputs } from '../workspace'
import { isDatasetVersion } from '../domain'
import AnnotationImport from './AnnotationImport.vue'
import { classificationKind, classificationDraft, recordAnnotationTask, validateClassification } from '../annotation'
const props = defineProps({ kind: String })
const emit = defineEmits(['navigate', 'review'])
const templateId = ref(state.settings.labelTemplates.find(t => t.kind === props.kind)?.id || '')
const templateSnapshot = ref(null)
const templates = computed(() => state.settings.labelTemplates.filter(t => t.kind === props.kind))
const template = computed(() => templateSnapshot.value || templates.value.find(t => t.id === templateId.value))
const index = ref(0)
const records = ref([])
const draftId = ref('')
const resumeId = ref('')
const baseline = ref('')
const inputStamp = ref('')
const baseVersionId = ref('')
const uploader = ref(null)
const inputIds = ref(state.ui.pipeline?.datasetId === state.activeDataset ? [...(state.ui.pipeline.inputIds || [])] : [])
const manualInputs = ref(inputIds.value.length > 0)
const inputOptions = computed(() => generationInputs(props.kind === 'image' ? '图片问答' : '知识片段', selectedSources(), selectedVersions(), state.activeDataset))
const current = computed(() => records.value[index.value])
const type = computed(() => props.kind === 'image' ? '图片整体分类' : '文本分类')
const savedVersions = computed(() => selectedVersions().filter(version => classificationKind(version) === props.kind))
const target = state.ui.annotationTarget?.datasetId === state.activeDataset ? { ...state.ui.annotationTarget } : null
const bufferKey = `${state.role}:${state.activeDataset}:class:${props.kind}`
const inputScope = JSON.stringify(state.ui.pipeline?.datasetId === state.activeDataset ? state.ui.pipeline.inputIds || [] : [])
delete state.ui.annotationTarget
let restoring = false
const freshRecords = () => manualInputs.value && !inputIds.value.length ? []
  : classificationInputs(props.kind, selectedSources(), selectedVersions(), state.activeDataset,
    manualInputs.value ? { datasetId: state.activeDataset, inputIds: inputIds.value } : state.ui.pipeline)
function restore(version) {
  restoring = true
  templateSnapshot.value = version?.labelTemplate ? JSON.parse(JSON.stringify(version.labelTemplate)) : null
  templateId.value = templateSnapshot.value?.id || templates.value[0]?.id || ''
  templateSnapshot.value ||= templates.value.find(item => item.id === templateId.value) ? JSON.parse(JSON.stringify(templates.value.find(item => item.id === templateId.value))) : null
  records.value = version ? JSON.parse(JSON.stringify(version.records)) : freshRecords()
  records.value.forEach(record => { record.labels ||= [] })
  resumeId.value = version?.id || ''
  baseVersionId.value = version?.id || ''
  draftId.value = version?.status === '草稿' && version.type !== '条目导入' ? version.id : ''
  index.value = target && version?.id === target.versionId ? Math.min(target.index || 0, Math.max(0, records.value.length - 1)) : 0
  restoring = false
  baseline.value = JSON.stringify(records.value)
  inputStamp.value = version ? JSON.stringify(version.records) : ''
}
async function resume(id) {
  if (JSON.stringify(records.value) !== baseline.value) {
    try { await ElMessageBox.confirm('当前分类尚未保存，切换将放弃当前修改。可以取消并先保存草稿。', '切换标注成果', { type: 'warning' }) }
    catch { return }
  }
  restore(savedVersions.value.find(version => version.id === id))
}
async function changeTemplate(id) {
  if (id === templateId.value) return
  if (records.value.some(record => record.labels.length)) {
    try { await ElMessageBox.confirm('切换标签模板将清空当前分类标签。需要保留时，请取消并先保存草稿。', '切换标签模板', { type: 'warning' }) }
    catch { return }
  }
  templateId.value = id
}
function load() {
  const fresh = freshRecords()
  const context = state.ui.pipeline?.datasetId === state.activeDataset ? state.ui.pipeline : null
  const explicitInputs = context?.inputIds?.length > 0
  const version = savedVersions.value.find(item => item.id === target?.versionId)
    || classificationDraft(selectedVersions(), state.activeDataset, props.kind, explicitInputs ? fresh.map(record => record.id) : undefined)
  restore(version)
  if (!manualInputs.value) inputIds.value = [...new Set(fresh.map(record => record.inputVersionId || record.id))]
}
async function changeInputs(ids) {
  if (JSON.stringify(records.value) !== baseline.value) {
    try { await ElMessageBox.confirm('切换输入前请保存当前分类，继续切换将放弃未保存修改。', '切换标注输入', { type: 'warning' }) }
    catch { return }
  }
  manualInputs.value = true
  inputIds.value = [...ids]
  restore(null)
}
function imported(sources) {
  const ids = sources.map(source => source.importedVersionId || source.id)
  const added = classificationInputs(props.kind, selectedSources(), selectedVersions(), state.activeDataset, { datasetId: state.activeDataset, inputIds: ids })
  inputIds.value = [...new Set([...inputIds.value, ...ids])]
  manualInputs.value = true
  records.value = [...new Map([...records.value, ...added].map(record => [record.id, record])).values()]
  draftId.value = ''; resumeId.value = ''; inputStamp.value = ''
  if (added.length) index.value = Math.max(0, records.value.length - added.length)
}
watch(templateId, () => {
  if (restoring) return
  templateSnapshot.value = templates.value.find(item => item.id === templateId.value) ? JSON.parse(JSON.stringify(templates.value.find(item => item.id === templateId.value))) : null
  records.value.forEach(record => { record.labels = [] })
  draftId.value = ''; resumeId.value = ''
}, { flush: 'sync' })
watch(() => state.activeDataset, load, { immediate: true })
const buffer = state.ui.annotationBuffers?.[bufferKey]
if (!target && buffer?.inputScope === inputScope && buffer.records?.length) {
  templateSnapshot.value = buffer.template
  restoring = true
  templateId.value = buffer.template?.id || ''
  records.value = JSON.parse(JSON.stringify(buffer.records))
  inputIds.value = buffer.inputIds || inputIds.value
  manualInputs.value = buffer.manualInputs ?? manualInputs.value
  baseVersionId.value = buffer.baseVersionId || buffer.resumeId || ''
  draftId.value = buffer.draftId
  resumeId.value = buffer.resumeId
  baseline.value = buffer.baseline
  inputStamp.value = buffer.inputStamp || ''
  index.value = Math.min(buffer.index, Math.max(0, records.value.length - 1))
  restoring = false
}
onBeforeUnmount(() => {
  state.ui.annotationBuffers ||= {}
  state.ui.annotationBuffers[bufferKey] = JSON.parse(JSON.stringify({ inputScope, template: template.value,
    records: records.value, draftId: draftId.value, resumeId: resumeId.value, index: index.value, baseline: baseline.value, inputStamp: inputStamp.value,
    inputIds: inputIds.value, manualInputs: manualInputs.value, baseVersionId: baseVersionId.value }))
})
watch(inputOptions, () => { if (!records.value.length && !manualInputs.value) load() })
function toggle(label) {
  if (!allowed('edit') || !current.value || !template.value) return
  current.value.labels = template.value.multiple
    ? current.value.labels.includes(label) ? current.value.labels.filter(item => item !== label) : [...current.value.labels, label]
    : [label]
}
function save(submit = false) {
  if (!allowed('edit') || !template.value || !records.value.length) return ElMessage.warning('请选择标签模板并接入可用资料')
  try { validateClassification(records.value, template.value, submit) }
  catch (error) { return ElMessage.warning(error.message) }
  const snapshot = JSON.parse(JSON.stringify(template.value))
  let version = selectedVersions().find(item => item.id === draftId.value && item.status === '草稿')
  if (version && inputStamp.value && JSON.stringify(version.records) !== inputStamp.value) return ElMessage.warning('当前草稿已被其它操作修改，请重新打开成果后再标注')
  if (!version) {
    const parent = selectedVersions().find(item => item.id === baseVersionId.value && isDatasetVersion(item))
    version = addVersion(state.activeDataset, records.value, type.value, parent?.id || records.value[0].inputVersionId || records.value[0].sourceId, 'dataset')
    version.parentVersionId = parent?.id || ''
  }
  else version.records = JSON.parse(JSON.stringify(records.value))
  version.labelTemplate = snapshot
  templateSnapshot.value = snapshot
  draftId.value = version.id; resumeId.value = version.id; state.focusVersion = version.id
  baseVersionId.value = version.id
  baseline.value = JSON.stringify(records.value)
  inputStamp.value = JSON.stringify(version.records)
  const progress = Math.round(records.value.filter(record => record.labels.length).length / records.value.length * 100)
  const task = recordAnnotationTask(state.tasks, version, type.value, progress, taskName(type.value))
  if (submit) {
    if (submitAnnotationResult(version)) { task.status = '已提交'; emit('review', version.id) }
  } else notify('分类草稿已保存到项目成果')
}
</script>

<template>
  <section class="panel">
    <div class="section-title"><div><h3>{{ kind === 'image' ? '图片分类' : '文本分类' }}输入</h3><p>选择已有资料或直接接入新文件，在当前页面继续标注。</p></div><AnnotationImport ref="uploader" :kind="kind" @imported="imported" /></div>
    <el-select :model-value="inputIds" multiple class="full-width" aria-label="选择分类输入" placeholder="选择资料或加工成果" @change="changeInputs"><el-option v-for="input in inputOptions" :key="input.id" :value="input.id" :label="input.name || (input.type + ' · ' + input.created)" /></el-select>
    <div class="task-filters">
      <el-select :model-value="resumeId" aria-label="选择已保存标注" placeholder="新建标注" @change="resume">
        <el-option value="" label="新建标注" />
        <el-option v-for="version in savedVersions" :key="version.id" :value="version.id" :label="'V' + version.number + ' · ' + version.status + ' · ' + version.records.length + '条'" />
      </el-select>
      <el-select :model-value="templateId" aria-label="选择标签模板" placeholder="选择标签模板" @change="changeTemplate">
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
  <section v-else class="panel"><el-empty description="暂无可用于分类的资料，请选择已有输入或直接接入文件"><el-button type="primary" :disabled="!allowed('edit')" @click="uploader?.open()">接入{{ kind === 'image' ? '图片' : '文本' }}资料</el-button></el-empty></section>
</template>
