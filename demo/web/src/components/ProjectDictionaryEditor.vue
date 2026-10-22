<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { uid } from '../domain'
import { saveDownload } from '../store'
import { dictionaryTypes, dictionaryTemplates, enumOptions, validateProjectDictionary, validateDatasetMetadata } from '../projectConfig'

const props = defineProps({modelValue:{type:Array,default:()=>[]},library:{type:Array,default:()=>[]}})
const emit = defineEmits(['update:modelValue'])
const mode = ref('visual'), selectedId = ref(''), templateOpen = ref(false), templateTab = ref('templates')
const publicIds = ref([]), batchNames = ref(''), jsonText = ref(''), codeDirty = ref(false), codeError = ref('')
const previewValues = ref({})
let previousTypes = new Map()
const current = computed(() => props.modelValue.find(field => field.id === selectedId.value))
const publicFields = computed(() => props.library.filter(term => term.scope === 'dataset'
  && !['dataset_code','crop_type'].includes(term.field) && term.name !== '作物类型'
  && !props.modelValue.some(row => String(row.field).toLowerCase() === String(term.field).toLowerCase())))
const configuration = fields => ({fields:fields.map(({field,name,type,required,enumValues,unit,description}) =>
  ({field,name,type,required:Boolean(required),...(type === '枚举' ? {enumValues:enumOptions({enumValues}).join('\n')} : {}),...(unit ? {unit} : {}),...(description ? {description} : {})}))})
watch(() => props.modelValue, fields => {
  if (!fields.some(field => field.id === selectedId.value)) selectedId.value = fields[0]?.id || ''
  const values = {}
  for (const field of fields) {
    const oldValue = previewValues.value[field.id]
    values[field.id] = previousTypes.get(field.id) === field.type && oldValue !== undefined
      ? oldValue : field.type === '数值' ? null : field.type === '布尔' ? false : ''
    if (field.type === '枚举' && values[field.id] && !enumOptions(field).includes(values[field.id])) values[field.id] = ''
  }
  previewValues.value = values
  previousTypes = new Map(fields.map(field => [field.id,field.type]))
  if (!codeDirty.value) jsonText.value = JSON.stringify(configuration(fields),null,2)
}, {immediate:true})
const previewData = computed(() => ({code:'DS-EXAMPLE',metadata:Object.fromEntries(props.modelValue
  .filter(field => field.field?.trim()).map(field => [field.field,previewValues.value[field.id]]))}))
function change(key,value) {
  if (!current.value) return
  emit('update:modelValue',props.modelValue.map(field => field.id === selectedId.value ? {...field,[key]:value,
    ...(key === 'type' && value !== '数值' ? {unit:''} : {}),...(key === 'type' && value !== '枚举' ? {enumValues:''} : {})} : field))
}
function newField(name = '', field = '') {
  return {id:uid('field'),name,field,type:'文本',required:false,enumValues:'',unit:'',description:'',scope:'dataset'}
}
function add() {
  const field = newField()
  emit('update:modelValue',[...props.modelValue,field]); selectedId.value = field.id
}
function addBatch() {
  const names = [...new Set(batchNames.value.split(/\r?\n/).map(name => name.trim()).filter(Boolean))]
  if (!names.length) return ElMessage.warning('请填写字段名称，每行一个')
  const used = new Set(props.modelValue.map(field => field.field.toLowerCase()))
  let index = 1
  const fields = names.map(name => {
    while (used.has('field_'+index)) index++
    const field = newField(name,'field_'+index++)
    used.add(field.field); return field
  })
  emit('update:modelValue',[...props.modelValue,...fields]); selectedId.value = fields[0].id; batchNames.value = ''
}
function remove() {
  emit('update:modelValue',props.modelValue.filter(field => field.id !== selectedId.value))
}
async function append(fields,templateId) {
  if (!applyPendingCode()) return
  await nextTick()
  const used = new Set(props.modelValue.map(field => field.field.toLowerCase()))
  const added = fields.filter(field => !used.has(field.field.toLowerCase())).map(field => ({...newField(),...JSON.parse(JSON.stringify(field)),id:uid('field'),templateId,scope:'dataset'}))
  if (!added.length) return ElMessage.info('这些字段已经在项目字典中')
  emit('update:modelValue',[...props.modelValue,...added]); selectedId.value = added[0].id
  templateOpen.value = false; publicIds.value = []
}
function applyPendingCode() {
  if (!codeDirty.value) return true
  try {
    const data = JSON.parse(jsonText.value)
    if (!Array.isArray(data) && (!data || !Array.isArray(data.fields))) throw new Error('JSON 须为字段数组或包含 fields 数组的对象')
    const fields = validateProjectDictionary(Array.isArray(data) ? data : data.fields)
    const next = fields.map(field => ({...field,id:props.modelValue.find(existing => existing.field === field.field)?.id || uid('field')}))
    codeDirty.value = false; codeError.value = ''
    jsonText.value = JSON.stringify(configuration(next),null,2)
    emit('update:modelValue',next)
    return true
  } catch (error) {codeError.value = error.message;ElMessage.warning('字段配置未应用：'+error.message);return false}
}
function changeMode(value) {
  if (mode.value === 'code' && !applyPendingCode()) return
  mode.value = value
  if (value === 'code') jsonText.value = JSON.stringify(configuration(props.modelValue),null,2)
}
function resetCode() {
  codeDirty.value = false; codeError.value = ''; jsonText.value = JSON.stringify(configuration(props.modelValue),null,2)
}
async function download() {
  if (!applyPendingCode()) return
  await nextTick()
  try {
    validateProjectDictionary(props.modelValue)
    saveDownload(JSON.stringify(configuration(props.modelValue),null,2),'项目业务数据字典.json')
  } catch (error) {ElMessage.warning(error.message)}
}
function validatePreview() {
  try {validateProjectDictionary(props.modelValue);validateDatasetMetadata(previewData.value.metadata,props.modelValue);ElMessage.success('示例填写符合当前字段规则')}
  catch (error) {ElMessage.warning(error.message)}
}
defineExpose({applyPendingCode})
</script>

<template>
  <div class="project-dictionary-editor">
    <div class="dictionary-editor-toolbar"><div><el-button @click="templateOpen = true">浏览字段模板</el-button><el-button :disabled="!modelValue.length" @click="download">导出配置</el-button></div><el-radio-group :model-value="mode" aria-label="字典编辑方式" @update:model-value="changeMode"><el-radio-button value="visual">可视化</el-radio-button><el-radio-button value="code">JSON</el-radio-button></el-radio-group></div>
    <div class="dictionary-workspace">
      <section class="dictionary-configuration">
        <template v-if="mode === 'visual'">
          <div class="dictionary-section-heading"><h4>配置字段 <small>{{ modelValue.length }}</small></h4><el-button link type="primary" @click="add">新增字段</el-button></div>
          <el-select v-if="modelValue.length" v-model="selectedId" class="full-width" placeholder="选择要配置的字段" aria-label="选择配置字段"><el-option v-for="field in modelValue" :key="field.id" :value="field.id" :label="(field.name || '未命名字段')+' · '+(field.field || '未填写编码')" /></el-select>
          <el-empty v-else description="从模板开始，或添加业务字段" :image-size="55"><el-button type="primary" plain @click="add">新增字段</el-button></el-empty>
          <el-form v-if="current" label-position="top" class="dictionary-field-form">
            <el-form-item label="字段名称" required><el-input :model-value="current.name" placeholder="例如：采样深度" @update:model-value="value => change('name',value)" /></el-form-item>
            <el-form-item label="字段编码" required><el-input :model-value="current.field" placeholder="例如：sampling_depth" @update:model-value="value => change('field',value)" /><small class="field-help">用作数据集业务字段的唯一标识，以字母开头，可含数字与下划线。</small></el-form-item>
            <el-form-item label="字段类型"><el-select :model-value="current.type" @update:model-value="value => change('type',value)"><el-option v-for="type in dictionaryTypes" :key="type" :value="type" /></el-select></el-form-item>
            <el-form-item v-if="current.type === '枚举'" label="枚举选项"><el-input :model-value="current.enumValues" type="textarea" :rows="4" placeholder="每行一个选项，也可用逗号分隔" @update:model-value="value => change('enumValues',value)" /><div class="dictionary-enum-options"><el-tag v-for="option in enumOptions(current)" :key="option" size="small">{{ option }}</el-tag></div></el-form-item>
            <el-form-item v-if="current.type === '数值'" label="计量单位"><el-input :model-value="current.unit" placeholder="例如：cm、%" @update:model-value="value => change('unit',value)" /></el-form-item>
            <el-form-item label="必填字段"><el-switch :model-value="current.required" @update:model-value="value => change('required',value)" /></el-form-item>
            <el-form-item label="定义与说明"><el-input :model-value="current.description" type="textarea" :rows="2" placeholder="说明这个字段记录什么" @update:model-value="value => change('description',value)" /></el-form-item>
            <el-button link type="danger" @click="remove">删除当前字段</el-button>
          </el-form>
          <details class="dictionary-batch-add"><summary>批量添加字段</summary><el-input v-model="batchNames" type="textarea" :rows="3" placeholder="每行一个字段名称，添加后可修改编码与类型" /><el-button class="spaced" @click="addBatch">添加字段</el-button></details>
        </template>
        <template v-else><div class="dictionary-section-heading"><h4>字段配置 JSON</h4></div><p class="project-config-note">可编辑字段数组，或包含 fields 数组的对象；应用后在右侧预览。项目保存时也会应用当前编辑。</p><el-input v-model="jsonText" type="textarea" :rows="25" class="dictionary-code-editor" aria-label="字段配置 JSON" spellcheck="false" @input="codeDirty = true; codeError = ''" /><p v-if="codeError" class="dictionary-code-error">{{ codeError }}</p><div class="dictionary-code-actions"><el-button type="primary" @click="applyPendingCode">应用配置</el-button><el-button @click="resetCode">还原当前配置</el-button></div></template>
      </section>
      <section class="dictionary-preview">
        <div class="dictionary-section-heading"><h4>表单预览</h4><el-tag type="info">新建数据集中的业务字段</el-tag></div>
        <p class="project-config-note">左侧配置，右侧即时预览。这里的示例填写不会保存为正式数据。</p>
        <el-form label-position="top" class="dictionary-preview-form">
          <el-form-item label="数据集编号"><el-input model-value="创建数据集后自动生成" disabled /><small class="field-help">系统字段，不可删除或占用其编码。</small></el-form-item>
          <el-form-item v-for="field in modelValue" :key="field.id" :label="(field.name || '未命名字段') + (field.unit ? '（'+field.unit+'）' : '')" :required="field.required" :class="{'dictionary-preview-selected':field.id === selectedId}" @click="selectedId = field.id">
            <el-select v-if="field.type === '枚举'" v-model="previewValues[field.id]" clearable placeholder="请选择"><el-option v-for="option in enumOptions(field)" :key="option" :value="option" /></el-select>
            <el-input-number v-else-if="field.type === '数值'" v-model="previewValues[field.id]" :min="-9007199254740991" :max="9007199254740991" />
            <el-date-picker v-else-if="field.type === '日期'" v-model="previewValues[field.id]" type="date" value-format="YYYY-MM-DD" placeholder="请选择日期" />
            <el-switch v-else-if="field.type === '布尔'" v-model="previewValues[field.id]" />
            <el-input v-else v-model="previewValues[field.id]" placeholder="请输入" />
            <small v-if="field.description" class="field-help">{{ field.description }}</small>
          </el-form-item>
        </el-form>
        <el-button v-if="modelValue.length" @click="validatePreview">验证示例填写</el-button>
        <details class="dictionary-data-preview"><summary>数据结构预览</summary><pre>{{ JSON.stringify(previewData,null,2) }}</pre></details>
      </section>
    </div>
    <p class="project-config-note">数据字典只定义本项目的业务字段。保存项目后用于新建数据集，不会修改其他项目与公共字典。</p>
    <el-dialog v-model="templateOpen" title="选择字段模板" width="min(820px, 90vw)" append-to-body>
      <el-tabs v-model="templateTab"><el-tab-pane label="业务模板" name="templates" /><el-tab-pane label="公共字段" name="public" /></el-tabs>
      <div v-if="templateTab === 'templates'" class="dictionary-template-list"><article v-for="template in dictionaryTemplates" :key="template.id"><h4>{{ template.name }}</h4><p>{{ template.description }}</p><div class="dictionary-enum-options"><el-tag v-for="field in template.fields" :key="field.field" size="small" type="info">{{ field.name }}</el-tag></div><el-button type="primary" plain @click="append(template.fields,template.id)">使用此模板</el-button></article></div>
      <template v-else><p class="project-config-note">将公共字段复制到当前项目，后续可独立修改。</p><el-select v-model="publicIds" multiple filterable class="full-width" placeholder="选择公共字典中的字段"><el-option v-for="field in publicFields" :key="field.id" :value="field.id" :label="field.name+' · '+field.field" /></el-select><el-empty v-if="!publicFields.length" description="暂无尚未加入的公共元数据字段，可直接新增字段" :image-size="50" /><el-button class="spaced" type="primary" :disabled="!publicIds.length" @click="append(publicFields.filter(field => publicIds.includes(field.id)),'public')">加入项目字典</el-button></template>
    </el-dialog>
  </div>
</template>
