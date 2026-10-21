<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { state, selectedVersions, selectedSources, addVersion, requireAction, notify, runTask, allowed, taskName } from '../store'
import { sampleImage, qaSamples } from '../data'
import { uid, now, isDatasetVersion } from '../domain'
const emit = defineEmits(['navigate'])
const props = defineProps({initialTab:{type:String,default:'问答标注'}})
const tab = ref(props.initialTab)
const versionId = ref('')
const index = ref(0)
const records = ref([])
const draftId = ref('')
const labels = ref(['可用', '需修改', '不可用', '无法判断'])
const prompt = ref('根据参考材料判断答案质量，建议标签并说明需要修改的内容。')
const model = ref(state.models[0]?.id)
const imageId = ref('')
const boxLabel = ref('图')
const boxLabels = ref(['图', '表', '公式'])
const boxes = ref([])
const drawing = ref(null)
const versions = computed(() => selectedVersions().filter(v => v.records.some(r => r.question) && (isDatasetVersion(v) || v.type === '自动标注')))
const current = computed(() => records.value[index.value])
const images = computed(() => selectedSources().filter(s => /^(PNG|JPG|JPEG|WEBP|SVG)$/.test(s.type)))
const image = computed(() => images.value.find(s => s.id === imageId.value)?.content || sampleImage)
const task = ref(null)
watch(versionId, id => { const v = state.versions.find(v => v.id === id); records.value = JSON.parse(JSON.stringify(v?.records || [])); index.value = 0; draftId.value = '' })
watch(() => state.activeDataset, () => { versionId.value = versions.value[0]?.id || ''; imageId.value = images.value[0]?.id || ''; boxes.value = []; task.value = null }, { immediate: true })
watch(imageId, () => { boxes.value = []; draftId.value = ''; const v = selectedVersions().find(v => v.type === '图像标注' && v.sourceId === imageId.value); if (v) boxes.value = JSON.parse(JSON.stringify(v.records[0]?.boxes || [])) })
watch(tab, () => { draftId.value = ''; task.value = null })
function save(submit = false) {
  if (!requireAction('edit')) return
  if (tab.value === '问答标注' && !records.value.length) return ElMessage.warning('请选择问答成果')
  if (submit && tab.value === '问答标注' && records.value.some(r => !r.label)) return ElMessage.warning('请完成每条数据的可用性标注，再提交审核')
  if (tab.value === '图像标注' && !boxes.value.length) return ElMessage.warning('请先框选图片区域')
  if (tab.value === '图像标注' && !images.value.some(item=>item.id===imageId.value)) return ElMessage.warning('请先接入真实的图片资料')
  const output = tab.value === '问答标注' ? records.value : [{ image: imageId.value || '演示图片', boxes: boxes.value }]
  const input = state.versions.find(v => v.id === versionId.value)
  const base = input?.type === '自动标注' ? state.versions.find(v => v.id === input.sourceId) : input
  let version = state.versions.find(v => v.id === draftId.value) || (tab.value === '问答标注' && base?.status === '草稿' ? base : null)
  if (!version || version.status !== '草稿') version = addVersion(state.activeDataset, output, tab.value, tab.value === '问答标注' ? base?.id || versionId.value : imageId.value)
  else version.records = JSON.parse(JSON.stringify(output))
  draftId.value = version.id
  if (!task.value) { task.value = { id: uid('task'), projectId:state.activeProjectId, datasetId: state.activeDataset, name: taskName(tab.value), type: tab.value, status: '标注中', progress: 0, created: now(), versionId: version.id, logs: ['人工标注'] }; state.tasks.unshift(task.value); task.value = state.tasks[0] }
  task.value.progress = tab.value === '图像标注' ? 100 : Math.round(records.value.filter(r => r.label).length / records.value.length * 100)
  if (submit) { version.status = '待审核'; state.focusVersion = version.id; task.value.status = '已提交'; notify('标注已提交审核'); emit('navigate', 'review') } else notify('标注草稿已保存')
}
function automatic() {
  if (!versionId.value || !model.value) return ElMessage.warning('请选择成果版本与模型')
  runTask({ name: taskName('问答自动标注'), type: '自动标注', sourceId: versionId.value, config: { model: model.value, prompt: prompt.value } }); notify('自动标注任务已创建，请在项目成果查看建议并人工复核')
}
function pointerDown(event) {
  if (!allowed('edit')) return
  const rect = event.currentTarget.getBoundingClientRect()
  drawing.value = { startX: (event.clientX - rect.left) / rect.width * 100, startY: (event.clientY - rect.top) / rect.height * 100, x: 0, y: 0, width: 0, height: 0 }
  event.currentTarget.setPointerCapture(event.pointerId)
}
function pointerMove(event) {
  if (!drawing.value) return
  const rect = event.currentTarget.getBoundingClientRect()
  const x = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100))
  const y = Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100))
  Object.assign(drawing.value, { x: Math.min(x, drawing.value.startX), y: Math.min(y, drawing.value.startY), width: Math.abs(x - drawing.value.startX), height: Math.abs(y - drawing.value.startY) })
}
function pointerUp() { if (drawing.value?.width > 1 && drawing.value?.height > 1) boxes.value.push({ ...drawing.value, label: boxLabel.value, id: uid('box') }); drawing.value = null }
</script>
<template>
  <section class="panel"><el-tabs v-model="tab"><el-tab-pane label="问答标注" name="问答标注" /><el-tab-pane label="图像标注" name="图像标注" /></el-tabs><div class="toolbar"><el-select v-if="tab === '问答标注'" v-model="versionId" placeholder="选择问答成果版本" class="wide-select"><el-option v-for="version in versions" :key="version.id" :label="`${isDatasetVersion(version) ? `V${version.number}` : '模型标注建议'} · ${version.type} · ${version.records.length}条`" :value="version.id" /></el-select><el-select v-else v-model="imageId" placeholder="选择图片"><el-option v-for="item in images" :key="item.id" :label="item.name" :value="item.id" /></el-select><span class="toolbar-spacer"></span><el-button :disabled="!allowed('edit')" @click="save(false)">保存草稿</el-button><el-button type="primary" :disabled="!allowed('edit')" @click="save(true)">提交审核<el-icon><ArrowRight /></el-icon></el-button></div></section>
  <template v-if="tab === '问答标注'">
    <div class="annotation-layout" v-if="current"><section class="panel annotation-content"><div class="section-title"><h3>问答内容</h3><span>{{ index + 1 }} / {{ records.length }}</span></div><div class="record-block"><small>问题</small><h3>{{ current.question }}</h3></div><div class="record-block"><small>参考材料</small><p>{{ current.reference || '此条数据未提供参考材料。' }}</p></div><div class="record-block"><small>待评价答案</small><p>{{ current.answer }}</p></div><el-alert v-if="current.suggestion" :title="`模型建议：${current.suggestion}（需人工复核）`" type="info" :closable="false" /><div class="annotation-pagination"><el-button :disabled="index === 0" @click="index--">上一条</el-button><span>{{ records.filter(r => r.label).length }} / {{ records.length }} 已标注</span><el-button :disabled="index === records.length - 1" @click="index++">下一条</el-button></div></section><section class="panel annotation-form"><h3>人工标注</h3><el-form label-position="top"><el-form-item label="答案质量（1分最低，5分最高）"><el-rate v-model="current.rating" :disabled="!allowed('edit')" show-score /></el-form-item><el-form-item label="是否可用" required><el-radio-group v-model="current.label" :disabled="!allowed('edit')"><el-radio-button v-for="label in labels" :key="label" :value="label">{{ label }}</el-radio-button></el-radio-group></el-form-item><el-form-item label="修改后的答案"><el-input v-model="current.correctedAnswer" :disabled="!allowed('edit')" type="textarea" :rows="5" placeholder="如需修改，在此填写修订答案" /></el-form-item><el-form-item label="标注标签（逗号分隔）"><el-input :model-value="labels.join('，')" @change="labels = $event.split(/[,，]/).filter(Boolean)" /></el-form-item></el-form><el-divider /><h4>模型辅助</h4><el-select v-model="model" placeholder="选择模型"><el-option v-for="item in state.models" :key="item.id" :label="item.name" :value="item.id" /></el-select><el-input v-model="prompt" type="textarea" :rows="3" /><el-button :disabled="!allowed('edit')" @click="automatic"><el-icon><MagicStick /></el-icon>自动标注（模拟）</el-button></section></div><section class="panel" v-else><el-empty description="当前数据集还没有问答成果"><el-button type="primary" @click="$emit('navigate', 'generation')">生成问答</el-button></el-empty></section>
  </template>
  <div v-else class="annotation-layout"><section class="panel"><div class="section-title"><h3>图片框选</h3><span>按住鼠标拖动，标记图片区域</span></div><div class="image-canvas" @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="drawing = null"><img :src="image" alt="待标注图片" draggable="false" /><div v-for="box in [...boxes, ...(drawing ? [{ ...drawing, label: boxLabel, id: 'drawing' }] : [])]" :key="box.id" class="annotation-box" :style="{ left: box.x + '%', top: box.y + '%', width: box.width + '%', height: box.height + '%' }"><span>{{ box.label }}</span></div></div></section><section class="panel"><h3>区域标签</h3><el-radio-group v-model="boxLabel"><el-radio-button v-for="label in boxLabels" :key="label" :value="label">{{ label }}</el-radio-button></el-radio-group><el-divider /><h4>已标注区域 · {{ boxes.length }}</h4><div v-for="(box, i) in boxes" :key="box.id" class="box-row"><span>{{ i + 1 }}. {{ box.label }} <small>{{ box.width.toFixed(1) }}% × {{ box.height.toFixed(1) }}%</small></span><el-button link type="danger" :disabled="!allowed('edit')" @click="boxes.splice(i, 1)">删除</el-button></div><el-empty v-if="!boxes.length" :image-size="70" description="还没有框选区域" /><p class="muted">保存后，成果中包含图片来源、类别和区域百分比坐标。</p></section></div>
</template>
