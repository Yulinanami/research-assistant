<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { state, selectedVersions, selectedSources, addVersion, requireAction, notify, runTask, allowed, taskName, submitAnnotationResult } from '../store'
import { uid, isDatasetVersion } from '../domain'
import { reviewInput, isQuestionReviewInput, questionReviewOrigin, recordAnnotationTask, effectiveAnswer, qualityLabels, questionEntries, mergeQuestionEntries, validateQuestions, validateBoxes } from '../annotation'
import { classificationInputs } from '../workspace'
import AnnotationImport from './AnnotationImport.vue'
import { taskPrompt } from '../promptConfig'
const emit = defineEmits(['navigate', 'mode', 'completed', 'review'])
const props = defineProps({ initialTab: { type: String, default: '问答标注' }, localReview: Boolean })
const clone = value => JSON.parse(JSON.stringify(value))
const tab = ref(props.initialTab)
const versionId = ref('')
const index = ref(0)
const records = ref([])
const questionIndices = ref([])
const baseline = ref('')
const inputStamp = ref('')
const draftId = ref('')
const baseVersionId = ref('')
const labels = ref([...qualityLabels])
const prompt = ref(taskPrompt(state.settings, '自动标注'))
const model = ref(state.models.find(item => item.status === '已上架')?.id || '')
const imageId = ref('')
const boxLabel = ref('图')
const boxLabels = ref(['图', '表', '公式'])
const boxes = ref([])
const drawing = ref(null)
const imageElement = ref(null)
const uploader = ref(null)
const imageError = ref(false)
const task = ref(null)
const autoTaskId = ref('')
const autoTask = computed(() => state.tasks.find(item => item.id === autoTaskId.value && item.datasetId === state.activeDataset))
const autoRunning = computed(() => autoTask.value?.status === '执行中')
const versions = computed(() => selectedVersions().filter(isQuestionReviewInput))
const current = computed(() => records.value[index.value])
const images = computed(() => {
  const inputs = classificationInputs('image', selectedSources(), selectedVersions(), state.activeDataset, state.ui.pipeline)
  // Every saved version has its own image option so a live source cannot replace its snapshot.
  const saved = selectedVersions().filter(version => version.type === '图像标注').flatMap(version => version.records.flatMap((record, recordIndex) =>
    record.image?.startsWith('data:image/') ? [{ ...record, id: 'box-image:' + version.id + ':' + recordIndex,
      versionId: version.id, sourceInputId: record.inputId || version.sourceId,
      name: 'V' + version.number + ' · ' + (record.title || '图片框选') }] : []))
  return [...inputs.map(record => ({ ...record, sourceInputId: record.id, name: record.title })), ...saved]
})
const currentImage = computed(() => images.value.find(item => item.id === imageId.value))
const image = computed(() => currentImage.value?.image || '')
const target = state.ui.annotationTarget?.datasetId === state.activeDataset ? { ...state.ui.annotationTarget } : null
const bufferKey = state.role + ':' + state.activeDataset + ':' + props.initialTab
const inputScope = ref(JSON.stringify(state.ui.pipeline?.datasetId === state.activeDataset ? state.ui.pipeline.inputIds || [] : []))
delete state.ui.annotationTarget
function loadQuestions() {
  if (tab.value !== '问答标注') return
  const version = versions.value.find(item => item.id === versionId.value)
  const entries = questionEntries(version)
  records.value = entries.records
  questionIndices.value = entries.indices
  labels.value = [...(version?.annotationTemplate?.labels || qualityLabels)]
  index.value = target && version?.id === target.versionId ? Math.min(target.index || 0, Math.max(0, records.value.length - 1)) : 0
  draftId.value = version?.status === '草稿' && isDatasetVersion(version) && version.type !== '条目导入' ? version.id : ''
  baseVersionId.value = version?.id || ''
  task.value = null
  baseline.value = JSON.stringify(records.value)
  inputStamp.value = JSON.stringify(version?.records)
}
function loadBoxes() {
  if (tab.value !== '图像标注') return
  const selected = currentImage.value
  const candidates = selectedVersions().filter(version => version.type === '图像标注'
    && (version.sourceId === selected?.sourceInputId || version.records[0]?.inputId === selected?.sourceInputId)
    && version.records[0]?.image === selected?.image)
  const version = selected?.versionId ? selectedVersions().find(item => item.id === selected.versionId)
    : candidates.find(item => item.status === '草稿') || candidates[0]
  boxes.value = clone(version?.records[0]?.boxes || selected?.boxes || [])
  boxLabels.value = [...(version?.annotationTemplate?.labels || ['图', '表', '公式'])]
  boxLabel.value = boxLabels.value[0]
  draftId.value = version?.status === '草稿' && isDatasetVersion(version) ? version.id : ''
  baseVersionId.value = version?.id || ''
  drawing.value = null; task.value = null; imageError.value = false
  baseline.value = JSON.stringify(boxes.value)
  inputStamp.value = version ? JSON.stringify(version.records) : ''
}
function focusedImage() {
  const id = target?.versionId || state.focusVersion
  return images.value.find(item => item.versionId === id)
    || images.value.find(item => item.inputVersionId === id && item.sourceRecordIndex === (target?.index || 0))
}
watch([versionId, tab], loadQuestions, { immediate: true, flush: 'sync' })
watch([imageId, tab], loadBoxes, { immediate: true, flush: 'sync' })
watch(() => state.activeDataset, () => {
  const context = state.ui.pipeline?.datasetId === state.activeDataset ? state.ui.pipeline : null
  versionId.value = reviewInput(versions.value, state.activeDataset, target?.versionId || state.focusVersion, context?.inputIds)?.id || ''
  imageId.value = focusedImage()?.id || images.value[0]?.id || ''
}, { immediate: true })
const buffer = state.ui.annotationBuffers?.[bufferKey]
const bufferUsable = tab.value === '问答标注'
  ? buffer?.records?.length && versions.value.some(item => item.id === buffer.versionId)
  : images.value.some(item => item.id === buffer?.imageId)
if (!target && bufferUsable && buffer?.inputScope === inputScope.value
  && (!state.focusVersion || state.focusVersion === buffer.versionId || state.focusVersion === buffer.draftId || tab.value === '图像标注' && !focusedImage())) {
  versionId.value = buffer.versionId
  imageId.value = buffer.imageId
  records.value = clone(buffer.records)
  questionIndices.value = [...buffer.questionIndices]
  boxes.value = clone(buffer.boxes)
  draftId.value = buffer.draftId
  baseVersionId.value = buffer.baseVersionId || buffer.draftId || ''
  labels.value = [...buffer.labels]
  boxLabels.value = [...buffer.boxLabels]
  baseline.value = buffer.baseline
  inputStamp.value = buffer.inputStamp || ''
  index.value = Math.min(buffer.index, Math.max(0, records.value.length - 1))
}
watch(images, next => {
  if (tab.value === '图像标注' && !next.some(item => item.id === imageId.value)) imageId.value = focusedImage()?.id || next[0]?.id || ''
})
watch(versions, next => {
  if (tab.value === '问答标注' && !records.value.length && !next.some(item => item.id === versionId.value)) {
    versionId.value = reviewInput(next, state.activeDataset, state.focusVersion)?.id || ''
  }
})
watch(() => autoTask.value?.versionId, id => { if (id) versionId.value = id })
onBeforeUnmount(() => {
  state.ui.annotationBuffers ||= {}
  state.ui.annotationBuffers[bufferKey] = clone({ inputScope: inputScope.value, versionId: versionId.value,
    imageId: imageId.value, records: records.value, questionIndices: questionIndices.value,
    boxes: boxes.value, draftId: draftId.value, baseVersionId: baseVersionId.value,
    labels: labels.value, boxLabels: boxLabels.value, index: index.value, baseline: baseline.value, inputStamp: inputStamp.value })
})
async function changeInput(id) {
  const content = tab.value === '问答标注' ? records.value : boxes.value
  if (JSON.stringify(content) !== baseline.value) {
    try { await ElMessageBox.confirm('当前标注尚未保存，切换将放弃当前修改。可以取消并先保存草稿。', '切换标注输入', { type: 'warning' }) }
    catch { return }
  }
  if (tab.value === '问答标注') { versionId.value = id; loadQuestions() }
  else { imageId.value = id; loadBoxes() }
}
function imported(sources) {
  const ids = sources.map(source => source.importedVersionId || source.id)
  state.ui.pipeline = { datasetId: state.activeDataset, inputIds: ids, generationType: '图片框选' }
  inputScope.value = JSON.stringify(ids)
  imageId.value = images.value.find(item => ids.includes(item.sourceInputId) || ids.includes(item.inputVersionId))?.id || ''
}
function save(submit = false, quiet = false) {
  if (!requireAction('edit')) return
  if (tab.value === '问答标注' && !records.value.length) return ElMessage.warning('请选择问答成果')
  if (tab.value === '图像标注' && !currentImage.value) return ElMessage.warning('请先选择或接入图片资料')
  if (tab.value === '图像标注' && !boxes.value.length) return ElMessage.warning('请先框选图片区域')
  const input = selectedVersions().find(v => v.id === versionId.value)
  let output
  try {
    if (tab.value === '问答标注') {
      if (!input || JSON.stringify(input.records) !== inputStamp.value) throw new Error('复核输入已被其它操作修改，请重新打开成果后再标注')
      validateQuestions(records.value, labels.value, submit)
      output = mergeQuestionEntries(input, records.value, questionIndices.value)
    } else {
      validateBoxes(boxes.value, boxLabels.value)
      const selected = currentImage.value
      output = [{ image: selected.image, title: selected.title || selected.name, sourceId: selected.sourceId,
        inputId: selected.sourceInputId, width: imageElement.value?.naturalWidth || selected.width || null,
        height: imageElement.value?.naturalHeight || selected.height || null, coordinateUnit: 'percent', boxes: boxes.value }]
    }
  } catch (error) { ElMessage.warning(error.message); return }
  const base = ['自动标注', '条目导入'].includes(input?.type) ? null : input
  let version = selectedVersions().find(v => v.id === draftId.value)
    || (tab.value === '问答标注' && base?.status === '草稿' && isDatasetVersion(base) ? base : null)
  if (tab.value === '图像标注' && version?.status === '草稿' && inputStamp.value && JSON.stringify(version.records) !== inputStamp.value) return ElMessage.warning('当前草稿已被其它操作修改，请重新打开成果后再标注')
  if (!version || version.status !== '草稿') {
    version = addVersion(state.activeDataset, output, tab.value, tab.value === '问答标注' ? base?.id || versionId.value : currentImage.value.sourceInputId, 'dataset')
    if (tab.value === '图像标注') version.parentVersionId = baseVersionId.value || ''
  } else version.records = clone(output)
  version.annotationTemplate = { kind: tab.value === '问答标注' ? 'qa' : 'boxes', labels: [...(tab.value === '问答标注' ? labels.value : boxLabels.value)] }
  draftId.value = version.id; baseVersionId.value = version.id; state.focusVersion = version.id
  const progress = tab.value === '图像标注' ? 100 : Math.round(records.value.filter(r => r.label).length / records.value.length * 100)
  const annotationTask = recordAnnotationTask(state.tasks, version, tab.value, progress, taskName(tab.value))
  if (tab.value === '问答标注') versionId.value = version.id
  task.value = annotationTask
  inputStamp.value = JSON.stringify(version.records)
  baseline.value = JSON.stringify(tab.value === '问答标注' ? records.value : boxes.value)
  if (submit && props.localReview) {
    const origin = questionReviewOrigin(input, selectedVersions())
    if (origin) { origin.reviewedVersionId = version.id; version.reviewSourceId = origin.id }
    task.value.status = '已完成'; task.value.completedAt = Date.now()
    task.value.logs.push('人工复核已完成，已保存为项目内数据集成果。')
    notify('人工复核已完成，数据集成果已保存到项目内')
    emit('completed', version.id)
  }
  else if (submit) { if (submitAnnotationResult(version)) { task.value.status = '已提交'; emit('review', version.id) } }
  else if (!quiet) notify('标注草稿已保存')
  return version
}
function automatic() {
  if (!allowed('edit') || autoRunning.value) return
  if (!versionId.value || !model.value) return ElMessage.warning('请选择成果版本与模型')
  if (!prompt.value.trim()) return ElMessage.warning('请填写辅助标注提示词')
  if (JSON.stringify(records.value) !== baseline.value && !save(false, true)) return
  const created = runTask({ name: taskName('问答自动标注'), type: '自动标注', sourceId: versionId.value, config: { model: model.value, prompt: prompt.value } })
  if (created) autoTaskId.value = created.id
}
function pointerDown(event) {
  if (!allowed('edit') || !currentImage.value || imageError.value || event.button != null && event.button !== 0) return
  const rect = imageElement.value?.getBoundingClientRect()
  if (!rect?.width || !rect.height) return
  event.preventDefault?.()
  const startX = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100))
  const startY = Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100))
  drawing.value = { startX, startY, x: startX, y: startY, width: 0, height: 0 }
  event.currentTarget.setPointerCapture?.(event.pointerId)
}
function pointerMove(event) {
  if (!drawing.value) return
  const rect = imageElement.value?.getBoundingClientRect()
  if (!rect?.width || !rect.height) return
  const x = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100))
  const y = Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100))
  Object.assign(drawing.value, { x: Math.min(x, drawing.value.startX), y: Math.min(y, drawing.value.startY), width: Math.abs(x - drawing.value.startX), height: Math.abs(y - drawing.value.startY) })
}
function pointerUp(event) {
  if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) pointerMove(event)
  const rect = imageElement.value?.getBoundingClientRect()
  const valid = drawing.value && drawing.value.width > 0 && drawing.value.height > 0
    && (!rect?.width || drawing.value.width / 100 * rect.width >= 2 && drawing.value.height / 100 * rect.height >= 2)
  if (valid) {
    const { x, y, width, height } = drawing.value
    boxes.value.push({ x, y, width, height, label: boxLabel.value, id: uid('box') })
  }
  drawing.value = null
}
</script>

<template>
  <section class="panel">
    <div class="section-title"><h3>{{ tab === '问答标注' ? '问答人工复核' : '图片区域标注' }}</h3><AnnotationImport v-if="tab === '图像标注'" ref="uploader" kind="image" @imported="imported" /></div>
    <div class="toolbar">
      <el-select v-if="tab === '问答标注'" :model-value="versionId" @change="changeInput" placeholder="选择问答成果版本" aria-label="选择问答成果版本" class="wide-select"><el-option v-for="version in versions" :key="version.id" :label="(isDatasetVersion(version) ? 'V' + version.number : version.type === '自动标注' ? '模型标注建议' : '待复核问答') + ' · ' + version.type + ' · ' + version.records.length + '条'" :value="version.id" /></el-select>
      <el-select v-else :model-value="imageId" @change="changeInput" placeholder="选择图片" aria-label="选择框选图片"><el-option v-for="item in images" :key="item.id" :label="item.name" :value="item.id" /></el-select>
      <span class="toolbar-spacer"></span><el-button :disabled="!allowed('edit') || (tab === '问答标注' ? !records.length : !currentImage)" @click="save(false)">保存草稿</el-button><el-button type="primary" :disabled="!allowed('edit') || (tab === '问答标注' ? !records.length : !currentImage)" @click="save(true)">{{ localReview ? '提交为数据集成果' : '提交审核' }}<el-icon><ArrowRight /></el-icon></el-button>
    </div>
  </section>
  <template v-if="tab === '问答标注'">
    <div class="annotation-layout" v-if="current">
      <section class="panel annotation-content"><div class="section-title"><h3>问答内容</h3><span>{{ index + 1 }} / {{ records.length }}</span></div><el-image v-if="current.image" :src="current.image" fit="contain" class="classification-image" /><div class="record-block"><small>问题</small><h3>{{ current.question }}</h3></div><div class="record-block"><small>参考材料</small><p>{{ current.reference || '此条数据未提供参考材料。' }}</p></div><div class="record-block"><small>待评价答案</small><p>{{ effectiveAnswer(current) }}</p></div><el-alert v-if="current.suggestion" :title="'模型建议：' + current.suggestion + '（需人工复核）'" type="info" :closable="false" /><div class="annotation-pagination"><el-button :disabled="index === 0" @click="index--">上一条</el-button><span>{{ records.filter(r => r.label).length }} / {{ records.length }} 已标注</span><el-button :disabled="index === records.length - 1" @click="index++">下一条</el-button></div></section>
      <section class="panel annotation-form"><h3>人工标注</h3><el-form label-position="top"><el-form-item label="答案质量（1分最低，5分最高）"><el-rate v-model="current.rating" :disabled="!allowed('edit')" show-score /></el-form-item><el-form-item label="是否可用" required><el-radio-group v-model="current.label" :disabled="!allowed('edit')"><el-radio-button v-for="label in labels" :key="label" :value="label">{{ label }}</el-radio-button></el-radio-group></el-form-item><el-form-item label="修改后的答案"><el-input v-model="current.correctedAnswer" :disabled="!allowed('edit')" type="textarea" :rows="5" placeholder="如需修改，在此填写修订答案" /></el-form-item><p class="muted">质量标签表示可用性，与样本分类标签分别保存。</p></el-form><el-divider /><h4>模型辅助</h4><el-select v-model="model" placeholder="选择模型"><el-option v-for="item in state.models.filter(model => model.status === '已上架')" :key="item.id" :label="item.name" :value="item.id" /></el-select><el-input v-model="prompt" type="textarea" :rows="3" /><el-button :disabled="!allowed('edit') || autoRunning" :loading="autoRunning" @click="automatic">自动标注（模拟）</el-button><p v-if="autoTask" class="muted">{{ autoTask.status }}{{ autoTask.status === '失败' ? '：' + autoTask.logs.at(-1) : '' }}</p></section>
    </div>
    <section class="panel" v-else><el-empty description="当前数据集还没有问答成果"><el-button type="primary" @click="$emit('mode', '问答生成')">生成问答</el-button></el-empty></section>
  </template>
  <div v-else-if="currentImage" class="annotation-layout">
    <section class="panel"><div class="section-title"><h3>{{ currentImage.name || '图片框选' }}</h3><span>按住鼠标拖动，标记图片区域</span></div><el-alert v-if="imageError" title="图片加载失败，请重新选择或接入图片" type="error" :closable="false" /><div class="image-canvas" @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="drawing = null"><img ref="imageElement" :src="image" alt="待标注图片" draggable="false" @load="imageError = false" @error="imageError = true" /><div v-for="box in [...boxes, ...(drawing ? [{ ...drawing, label: boxLabel, id: 'drawing' }] : [])]" :key="box.id" class="annotation-box" :style="{ left: box.x + '%', top: box.y + '%', width: box.width + '%', height: box.height + '%' }"><span>{{ box.label }}</span></div></div></section>
    <section class="panel"><h3>区域标签</h3><el-radio-group v-model="boxLabel"><el-radio-button v-for="label in boxLabels" :key="label" :value="label">{{ label }}</el-radio-button></el-radio-group><el-divider /><h4>已标注区域 · {{ boxes.length }}</h4><div v-for="(box, i) in boxes" :key="box.id" class="box-row"><span>{{ i + 1 }}. {{ box.label }} <small>{{ box.width.toFixed(1) }}% × {{ box.height.toFixed(1) }}%</small></span><el-button link type="danger" :disabled="!allowed('edit')" @click="boxes.splice(i, 1)">删除</el-button></div><el-empty v-if="!boxes.length" :image-size="70" description="还没有框选区域" /><p class="muted">保存后包含原图、类别和区域百分比坐标。</p></section>
  </div>
  <section v-else class="panel"><el-empty description="尚未选择可标注图片，请选择已有图片或直接接入"><el-button type="primary" :disabled="!allowed('edit')" @click="uploader?.open()">接入图片资料</el-button></el-empty></section>
</template>
