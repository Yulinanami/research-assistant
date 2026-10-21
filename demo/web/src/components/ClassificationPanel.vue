<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { state, selectedSources, selectedVersions, allowed, addVersion, taskName, notify } from '../store'
import { classificationInputs } from '../workspace'
import { uid, now } from '../domain'
const props = defineProps({kind:String})
const emit = defineEmits(['navigate'])
const templateId = ref(state.settings.labelTemplates.find(t => t.kind === props.kind)?.id || '')
const templates = computed(() => state.settings.labelTemplates.filter(t => t.kind === props.kind))
const template = computed(() => templates.value.find(t => t.id === templateId.value))
const index = ref(0)
const records = ref([])
const draftId = ref('')
const taskId = ref('')
const current = computed(() => records.value[index.value])
const type = computed(() => props.kind === 'image' ? '图片整体分类' : '文本分类')
function load() {
  records.value = classificationInputs(props.kind,selectedSources(),selectedVersions(),state.activeDataset,state.ui.pipeline)
  index.value = 0; draftId.value = ''; taskId.value = ''
}
watch(() => state.activeDataset,load,{immediate:true})
watch(templateId, () => { records.value.forEach(record => {record.labels=[]}); draftId.value = ''; taskId.value = '' })
function toggle(label) {
  if (!allowed('edit') || !current.value) return
  current.value.labels = template.value.multiple ? current.value.labels.includes(label) ? current.value.labels.filter(item => item !== label) : [...current.value.labels,label] : [label]
}
function save(submit = false) {
  if (!allowed('edit') || !template.value || !records.value.length) return ElMessage.warning('请选择标签模板并接入可用资料')
  if (submit && records.value.some(record => !record.labels.length)) return ElMessage.warning('请完成每条资料的分类后提交审核')
  const snapshot = JSON.parse(JSON.stringify(template.value))
  let version = selectedVersions().find(v => v.id === draftId.value && v.status === '草稿')
  if (!version) version = addVersion(state.activeDataset,records.value,type.value,records.value[0].sourceId,'dataset')
  else version.records = JSON.parse(JSON.stringify(records.value))
  version.labelTemplate = snapshot
  draftId.value = version.id
  let task = state.tasks.find(t => t.id === taskId.value)
  if (!task) { task = {id:uid('task'),name:taskName(type.value),projectId:state.activeProjectId,datasetId:state.activeDataset,type:type.value,created:now(),logs:['人工分类，保留输入与标签模板快照']}; state.tasks.unshift(task); task=state.tasks[0]; taskId.value = task.id }
  task.versionId = version.id; task.progress = Math.round(records.value.filter(record => record.labels.length).length / records.value.length * 100); task.status = submit ? '已提交' : '标注中'
  if (submit) {version.status='待审核';state.focusVersion=version.id;notify('分类结果已提交审核');emit('navigate','review')} else notify('分类草稿已保存到项目成果')
}
</script>

<template>
  <section class="panel"><div class="toolbar"><el-select v-model="templateId" placeholder="选择标签模板"><el-option v-for="item in templates" :key="item.id" :value="item.id" :label="item.name" /></el-select><span class="muted">{{ template?.description }} · {{ template?.multiple ? '多标签' : '单标签' }}</span><span class="toolbar-spacer"></span><el-button :disabled="!allowed('edit') || !records.length" @click="save(false)">保存草稿</el-button><el-button type="primary" :disabled="!allowed('edit') || !records.length" @click="save(true)">下一步：提交审核</el-button></div></section>
  <div v-if="current" class="annotation-layout"><section class="panel"><div class="section-title"><h3>{{ current.title }}</h3><span class="muted">{{ index+1 }} / {{ records.length }}</span></div><el-image v-if="kind === 'image'" :src="current.image" fit="contain" class="classification-image" /><pre v-else class="classification-text">{{ current.content }}</pre><div class="annotation-pagination"><el-button :disabled="index === 0" @click="index--">上一条</el-button><span>{{ records.filter(r => r.labels.length).length }} / {{ records.length }} 已标注</span><el-button :disabled="index === records.length-1" @click="index++">下一条</el-button></div></section><section class="panel"><div class="section-title"><div><h3>{{ kind === 'image' ? '图片整体标签' : '文本类别' }}</h3><p>{{ kind === 'image' ? '标签描述整张图片的类别，无需框选。' : '根据文本的主要含义选择类别。' }}</p></div></div><div class="classification-labels"><button v-for="label in template?.labels || []" :key="label" :class="{selected:current.labels.includes(label)}" :disabled="!allowed('edit')" @click="toggle(label)"><span>{{ label }}</span><el-icon v-if="current.labels.includes(label)"><Check /></el-icon></button></div><el-alert class="spaced" title="人工标签与数据集检索标签分别保存，保存后可在项目成果中查看。" type="info" :closable="false" /></section></div>
  <section v-else class="panel"><el-empty description="暂无可用于分类的资料"><el-button type="primary" @click="$emit('navigate','sources')">接入{{ kind === 'image' ? '图片' : '文本' }}资料</el-button></el-empty></section>
</template>
