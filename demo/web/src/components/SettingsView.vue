<script setup>
import { computed, ref } from 'vue'
import { state, notify } from '../store'
import ProcessView from './ProcessView.vue'
const props = defineProps({ section: { type: String, default: '模型配置' } })
const tab = computed(() => props.section)
const defaults = () => ({ format: 'Markdown', options: ['表格','图片'], pdfType: '自动识别', sheets: '全部工作表', rules: ['文档去重','格式标准化'], labels: ['可用','需修改','不可用','无法判断'], boxLabels: ['图','表','公式'], prompt: '根据参考材料生成准确的结果，保留来源，不编造事实。', audience: '科研人员', style: '专业论述' })
const form = ref({ ...defaults(), ...JSON.parse(JSON.stringify(state.preferences[state.role] || {})) })
const selectedAudience = ref('科研人员')
const audiencePrompts = computed(() => state.preferences[state.role]?.audiencePrompts || { 科研人员: '面向科研人员，准确使用专业术语，说明方法、依据和局限。', 初学者: '面向初学者，解释术语，以简明步骤和例子说明。', 专业技术人员: '面向专业技术人员，突出操作方法、适用条件和注意事项。' })
const audiencePrompt = ref(audiencePrompts.value[selectedAudience.value])
const labelsText = ref(form.value.labels.join('、'))
const boxesText = ref(form.value.boxLabels.join('、'))
function save() {
  form.value.labels = labelsText.value.split(/[、,，\n]/).map(s=>s.trim()).filter(Boolean)
  form.value.boxLabels = boxesText.value.split(/[、,，\n]/).map(s=>s.trim()).filter(Boolean)
  if (!form.value.labels.length || !form.value.boxLabels.length) return notify('请至少保留一个标签')
  const prompts = { ...audiencePrompts.value, [selectedAudience.value]: audiencePrompt.value }
  state.preferences[state.role] = { ...JSON.parse(JSON.stringify(form.value)), audiencePrompts: prompts }
  notify('已保存，新建任务将使用这些默认配置')
}
function changeAudience(name) { audiencePrompt.value = audiencePrompts.value[name] || '' }
</script>
<template>
  <section class="settings-content">
      <ProcessView v-if="['模型配置','模型评测'].includes(tab)" page="models" :model-section="tab" />
      <section v-else class="panel"><el-alert title="默认配置用于新建任务；历史任务保留当时的参数，不受这里的修改影响。" type="info" show-icon :closable="false" /><el-form label-position="top" class="settings-form">
        <template v-if="tab==='解析配置'"><el-form-item label="输出格式"><el-radio-group v-model="form.format"><el-radio-button value="Markdown">Markdown</el-radio-button><el-radio-button value="JSON">JSON</el-radio-button></el-radio-group></el-form-item><el-form-item label="提取内容"><el-checkbox-group v-model="form.options"><el-checkbox v-for="item in ['标题与正文','表格','公式','图片','还原阅读顺序','OCR']" :key="item" :value="item">{{ item }}</el-checkbox></el-checkbox-group></el-form-item><el-form-item label="PDF类型"><el-select v-model="form.pdfType"><el-option v-for="item in ['自动识别','文本型','扫描型','图层型']" :key="item" :value="item" /></el-select></el-form-item><el-form-item label="Excel工作表"><el-input v-model="form.sheets" /></el-form-item></template>
        <template v-if="tab==='清洗模板'"><div class="preset-buttons"><el-button @click="form.rules=['文档去重','格式标准化']"><el-icon><DocumentCopy /></el-icon>去重与标准化</el-button><el-button @click="form.rules=['隐私脱敏']"><el-icon><Lock /></el-icon>隐私脱敏</el-button><el-button @click="form.rules=['移除think标签']"><el-icon><Brush /></el-icon>移除think标签</el-button></div><el-form-item label="默认清洗步骤"><el-checkbox-group v-model="form.rules"><el-checkbox v-for="item in ['文档去重','质量过滤','隐私脱敏','格式标准化','移除think标签']" :key="item" :value="item">{{ item }}</el-checkbox></el-checkbox-group></el-form-item><p class="muted">本轮配置用于现有前端清洗演示。完整Data-Juicer YAML与低代码算子编排在后续迭代中补充。</p></template>
        <template v-if="tab==='标注与标签'"><el-form-item label="问答评价标签"><el-input v-model="labelsText" placeholder="用顿号或逗号分隔" /><small class="field-help">逐条问答评价时选用；不是数据集主题标签。</small></el-form-item><el-form-item label="图片区域标签"><el-input v-model="boxesText" placeholder="图、表、公式" /><small class="field-help">用于图片框选区域的类别。</small></el-form-item></template>
        <template v-if="tab==='受众与提示词'"><el-form-item label="目标受众"><el-select v-model="selectedAudience" @change="changeAudience"><el-option v-for="name in ['科研人员','初学者','专业技术人员']" :key="name" :value="name" /></el-select></el-form-item><el-form-item label="受众提示词模板"><el-input v-model="audiencePrompt" type="textarea" :rows="5" /></el-form-item><el-form-item label="通用任务要求"><el-input v-model="form.prompt" type="textarea" :rows="4" /></el-form-item></template>
        <div class="settings-save"><el-button type="primary" @click="save"><el-icon><Check /></el-icon>保存配置</el-button><span class="muted">按当前演示用户保存到本地</span></div>
      </el-form></section>
  </section>
</template>
