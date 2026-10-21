<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { state, notify } from '../store'
import { uid } from '../domain'
import ProcessView from './ProcessView.vue'
const emit = defineEmits(['navigate'])
const tab = ref('parsing')
const editable = computed(() => ['管理员','加工人员'].includes(state.role))
const audienceId = ref(state.settings.audiences[0]?.id)
const audience = computed(() => state.settings.audiences.find(item => item.id === audienceId.value))
const labelId = ref(state.settings.labelTemplates[0]?.id)
const label = computed(() => state.settings.labelTemplates.find(item => item.id === labelId.value))
const labelText = ref('')
watch(label, item => { labelText.value = item?.labels.join('\n') || '' }, {immediate:true})
function saveLabels() {
  const values = [...new Set(labelText.value.split(/[\n,，]/).map(item => item.trim()).filter(Boolean))]
  if (!values.length) return ElMessage.warning('请至少填写一个标签')
  label.value.labels = values; notify('标签模板已保存，新建任务将使用最新配置')
}
function addAudience() { const item={id:uid('audience'),name:'新受众模板',prompt:'根据参考资料准确说明，保留来源。'};state.settings.audiences.push(item);audienceId.value=item.id }
function addLabel() { const item={id:uid('labels'),name:'新标签模板',kind:'image',labels:['类别一','类别二'],multiple:false,description:'为整条资料选择类别。'};state.settings.labelTemplates.push(item);labelId.value=item.id }
</script>

<template>
  <section class="panel"><div class="section-title"><div><h3>工作空间设置</h3><p>这里维护可复用配置。任务创建时会显示实际参数，并保存配置快照。</p></div><el-button text @click="$emit('navigate','projects')">返回数据加工</el-button></div><el-tabs v-model="tab"><el-tab-pane label="解析默认配置" name="parsing" /><el-tab-pane label="模型使用与评测" name="models" /><el-tab-pane label="受众与提示词" name="audiences" /><el-tab-pane label="标签模板" name="labels" /><el-tab-pane label="清洗与任务默认值" name="tasks" /><el-tab-pane label="导出格式" name="export" /></el-tabs>
    <el-form v-if="tab === 'parsing'" label-position="top" class="settings-form" :disabled="!editable"><el-form-item label="默认解析输出格式"><el-select v-model="state.settings.parsing.format"><el-option value="Markdown" /><el-option value="JSON" /></el-select></el-form-item><el-form-item label="PDF类型"><el-select v-model="state.settings.parsing.pdfType"><el-option v-for="name in ['自动识别','文本型','扫描型','图层型']" :key="name" :value="name" /></el-select></el-form-item><el-form-item label="提取内容"><el-checkbox-group v-model="state.settings.parsing.options"><el-checkbox v-for="name in ['标题与正文','表格','公式','图片','还原阅读顺序','OCR']" :key="name" :value="name">{{ name }}</el-checkbox></el-checkbox-group></el-form-item><el-form-item label="默认Excel工作表"><el-input v-model="state.settings.parsing.sheets" /></el-form-item><p class="muted">当前解析为模拟；这些默认值将带入新建解析任务。</p></el-form>
    <div v-else-if="tab === 'audiences'" class="settings-form"><div class="toolbar"><el-select v-model="audienceId"><el-option v-for="item in state.settings.audiences" :key="item.id" :value="item.id" :label="item.name" /></el-select><el-button :disabled="!editable" @click="addAudience">新增受众</el-button></div><el-form v-if="audience" label-position="top" :disabled="!editable"><el-form-item label="受众名称"><el-input v-model="audience.name" /></el-form-item><el-form-item label="默认提示词"><el-input v-model="audience.prompt" type="textarea" :rows="7" /></el-form-item></el-form><p class="muted">问答任务先选受众，再选表达模板。已创建的任务保留执行时的提示词。</p></div>
    <div v-else-if="tab === 'labels'" class="settings-form"><div class="toolbar"><el-select v-model="labelId"><el-option v-for="item in state.settings.labelTemplates" :key="item.id" :value="item.id" :label="item.name" /></el-select><el-button :disabled="!editable" @click="addLabel">新增模板</el-button></div><el-form v-if="label" label-position="top" :disabled="!editable"><el-form-item label="模板名称"><el-input v-model="label.name" /></el-form-item><el-form-item label="适用资料"><el-select v-model="label.kind"><el-option value="image" label="图片整体分类" /><el-option value="text" label="文本分类" /></el-select></el-form-item><el-form-item label="含义说明"><el-input v-model="label.description" /></el-form-item><el-form-item label="允许多标签"><el-switch v-model="label.multiple" /></el-form-item><el-form-item label="标签名称，每行一个"><el-input v-model="labelText" type="textarea" :rows="5" /></el-form-item><el-button type="primary" @click="saveLabels">保存标签列表</el-button></el-form></div>
    <div v-else-if="tab === 'tasks'" class="settings-form"><el-form label-position="top" :disabled="!editable"><el-form-item label="默认片段大小（字符）"><el-input-number v-model="state.settings.generation.size" :min="1" :max="100000" /></el-form-item><el-form-item label="默认切片方式"><el-select v-model="state.settings.generation.chunkType"><el-option value="固定大小" /><el-option value="分隔符" /></el-select></el-form-item></el-form><h3 class="spaced">常用文本清洗配置</h3><div v-for="preset in state.settings.cleaningPresets" :key="preset.id" class="settings-preset"><el-input v-model="preset.name" :disabled="!editable" /><el-checkbox-group v-model="preset.rules" :disabled="!editable"><el-checkbox v-for="rule in ['格式标准化','隐私脱敏','文档去重','质量过滤','移除think标签']" :key="rule" :value="rule">{{ rule }}</el-checkbox></el-checkbox-group><small class="muted">规则执行顺序：{{ preset.rules.join(' → ') || '无' }}</small></div><p class="muted">清洗阶段可以直接选择这些预设，再调整本次执行顺序。</p></div>
    <el-form v-else-if="tab === 'export'" label-position="top" class="settings-form" :disabled="!editable"><el-form-item label="默认文件格式"><el-select v-model="state.settings.export.format"><el-option value="json" label="JSON" /><el-option value="jsonl" label="JSONL" /></el-select></el-form-item><el-form-item label="默认记录结构"><el-select v-model="state.settings.export.schema"><el-option value="原始结构" /><el-option value="Alpaca" /><el-option value="ShareGPT" /></el-select></el-form-item><p class="muted">Alpaca 与 ShareGPT 用于问答数据；图片标注保留原始结构。</p></el-form>
  </section>
  <ProcessView v-if="tab === 'models'" page="models" @navigate="emit('navigate',$event)" />
</template>
