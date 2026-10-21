<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { state, selectedSources, selectedVersions, runTask, allowed, taskName } from '../store'
import { generationInputs } from '../workspace'
import AnnotationPanel from './AnnotationPanel.vue'
import ClassificationPanel from './ClassificationPanel.vue'
const emit = defineEmits(['navigate'])
const options = [
  { name:'知识片段', icon:'Files', description:'按规则组织正文，保留来源' },
  { name:'问答生成', icon:'MagicStick', description:'从参考资料生成问题与答案' },
  { name:'问答增强', icon:'DataLine', description:'按目标受众改写与扩充问答' },
  { name:'文本分类', icon:'Document', description:'为文本选择内容类别' },
  { name:'图片分类', icon:'Picture', description:'给整张图片选择一个或多个标签' },
  { name:'图片框选', icon:'Grid', description:'标记区域位置与对应类别' },
  { name:'图片描述', icon:'EditPen', description:'为图片生成描述文本' },
  { name:'图片问答', icon:'Collection', description:'围绕图片生成问题与答案' },
  { name:'问答人工复核', icon:'CircleCheck', description:'核对来源、评分并修订答案' },
]
const handoff = state.ui.pipeline?.datasetId === state.activeDataset ? state.ui.pipeline : null
const mode = ref(state.ui.annotationMode || handoff?.generationType || '知识片段')
if (!options.some(option => option.name === mode.value)) mode.value = '知识片段'
delete state.ui.annotationMode
const candidates = computed(() => generationInputs(mode.value, selectedSources(), selectedVersions(), state.activeDataset))
const inputIds = ref([])
const audience = ref(state.settings.audiences[0]?.id || '')
const template = ref('忠实原文')
const model = ref(state.models.find(item => item.status === '已上架')?.id || '')
const prompt = ref('')
const pendingPrompt = ref(false)
const defaults = state.settings.generation
const size = ref(defaults.size)
const chunkType = ref(defaults.chunkType)
const separator = ref(defaults.separator)
const taskIds = ref([])
const tasks = computed(() => state.tasks.filter(task => taskIds.value.includes(task.id) && task.datasetId === state.activeDataset))
const running = computed(() => tasks.value.some(task => task.status === '执行中'))
const outputs = computed(() => selectedVersions().filter(version => tasks.value.some(task => task.versionId === version.id)))
const audienceItem = computed(() => state.settings.audiences.find(item => item.id === audience.value))
const suggestedPrompt = computed(() => `${audienceItem.value?.prompt || '依据参考资料，准确说明。'}\n任务：${mode.value}。表达模板：${template.value}。保留来源，输出结构完整。`)
watch(suggestedPrompt, (value, previous) => { if (!prompt.value || prompt.value === previous) { prompt.value = value; pendingPrompt.value = false } else pendingPrompt.value = true }, { immediate:true })
watch(mode, () => {
  inputIds.value = candidates.value.filter(input => handoff?.inputIds.includes(input.id)).map(input => input.id)
  if (!inputIds.value.length && candidates.value.length) inputIds.value = [candidates.value[0].id]
  taskIds.value = []
}, { immediate:true })
function execute() {
  if (!allowed('edit') || !inputIds.value.length) return ElMessage.warning('请选择可用输入资料')
  if (mode.value !== '知识片段' && (!model.value || !prompt.value.trim())) return ElMessage.warning('请选择模型并填写提示词')
  const config = { audience:audienceItem.value?.name, audienceTemplateId:audience.value, template:template.value, prompt:prompt.value, model:model.value, size:size.value, chunkType:chunkType.value, separator:separator.value }
  taskIds.value = inputIds.value.map(sourceId => runTask({name:taskName(mode.value),type:mode.value,sourceId,config})?.id).filter(Boolean)
}
function show(version) { state.focusVersion = version.id; emit('navigate','versions') }
function reviewAnswers() { mode.value = '问答人工复核' }
</script>

<template>
  <section class="panel"><div class="section-title"><div><h3>选择数据建设方式</h3><p>生成、分类与人工标注使用不同任务模板，结果始终保留在当前项目。</p></div><el-button text @click="$emit('navigate','settings')">管理模板<el-icon><ArrowRight /></el-icon></el-button></div><div class="annotation-options"><button v-for="option in options" :key="option.name" :class="['annotation-option',{selected:mode === option.name}]" :disabled="running" @click="mode = option.name"><span class="icon-tile" :class="mode === option.name ? 'blue' : 'teal'"><el-icon><component :is="option.icon" /></el-icon></span><b>{{ option.name }}</b><small>{{ option.description }}</small></button></div></section>
  <ClassificationPanel v-if="['文本分类','图片分类'].includes(mode)" :key="mode" :kind="mode === '图片分类' ? 'image' : 'text'" @navigate="$emit('navigate',$event)" />
  <AnnotationPanel v-else-if="['图片框选','问答人工复核'].includes(mode)" :key="mode" :initial-tab="mode === '图片框选' ? '图像标注' : '问答标注'" @navigate="$emit('navigate',$event)" />
  <div v-else class="pipeline-stack">
    <section class="panel pipeline-card"><div class="pipeline-card-heading"><span class="pipeline-marker">01</span><div><h3>选择输入资料与成果</h3><p>接续清洗结果或选择已有资料，不修改原始输入。</p></div></div><el-select v-model="inputIds" multiple class="full-width" :disabled="running" placeholder="选择当前数据集中的资料或成果"><el-option v-for="input in candidates" :key="input.id" :value="input.id" :label="input.name || `${input.number ? `V${input.number} · ` : ''}${input.type} · ${input.created}`" /></el-select><el-empty v-if="!candidates.length" description="当前没有适合此任务的输入"><el-button @click="$emit('navigate','sources')">接入资料</el-button><el-button v-if="mode === '问答增强'" @click="mode = '问答生成'">先生成问答</el-button></el-empty></section>
    <section class="panel pipeline-card"><div class="pipeline-card-heading"><span class="pipeline-marker">02</span><div><h3>{{ mode }}配置</h3><p>通用默认值在设置中维护，本次使用的配置随任务保存。</p></div><el-tag type="info">{{ mode === '知识片段' ? '本地切片' : '模型结果为模拟' }}</el-tag></div>
      <el-form label-position="top" class="annotation-task-form" :disabled="running">
        <template v-if="mode === '知识片段'"><el-form-item label="切片方式"><el-select v-model="chunkType"><el-option value="固定大小" /><el-option value="分隔符" /></el-select></el-form-item><el-form-item label="片段大小（字符）"><el-input-number v-model="size" :min="1" :max="100000" /></el-form-item><el-form-item v-if="chunkType === '分隔符'" label="分隔符"><el-input v-model="separator" /></el-form-item></template>
        <template v-else><el-form-item label="1. 目标受众"><el-select v-model="audience"><el-option v-for="item in state.settings.audiences" :key="item.id" :value="item.id" :label="item.name" /></el-select></el-form-item><el-form-item label="2. 表达模板"><el-select v-model="template"><el-option v-for="name in ['忠实原文','简明解释','教学讲解']" :key="name" :value="name" /></el-select></el-form-item><el-form-item label="3. 使用模型"><el-select v-model="model"><el-option v-for="item in state.models.filter(m => m.status === '已上架')" :key="item.id" :value="item.id" :label="item.name" /></el-select></el-form-item><el-form-item label="4. 本次提示词" class="wide-field"><el-input v-model="prompt" type="textarea" :rows="5" /><div v-if="pendingPrompt" class="prompt-update"><span>您已修改提示词，当前保留修改后的内容。</span><el-button text type="primary" @click="prompt = suggestedPrompt; pendingPrompt = false">应用当前受众与模板的提示词</el-button></div></el-form-item></template>
      </el-form><div class="pipeline-actions"><span class="muted">任务名称会自动包含项目、处理类型、时间与编号</span><el-button type="primary" :loading="running" :disabled="!allowed('edit') || !inputIds.length || running" @click="execute">开始{{ mode }}</el-button></div>
    </section>
    <section class="panel pipeline-card"><div class="pipeline-card-heading"><span class="pipeline-marker">03</span><div><h3>查看结果并继续建设</h3><p>结果保存在当前项目，可继续增强、人工复核或提交审核。</p></div></div><el-table v-if="tasks.length" :data="tasks"><el-table-column label="任务" prop="name" /><el-table-column label="状态" prop="status" width="100" /><el-table-column label="进度" width="150"><template #default="{row}"><el-progress :percentage="row.progress" /></template></el-table-column></el-table><article v-for="output in outputs" :key="output.id" class="local-output"><div><b>{{ output.type }} · {{ output.records.length }} 条</b><el-tag type="info">{{ output.number ? `数据集 V${output.number}` : '中间成果' }}</el-tag></div><pre>{{ JSON.stringify(output.records.slice(0,2),null,2) }}</pre><div class="pipeline-actions"><el-button @click="show(output)">查看项目内完整成果</el-button><el-button v-if="output.records.some(r => r.question)" type="primary" @click="reviewAnswers">下一步：人工复核</el-button><el-button v-else type="primary" @click="state.ui.pipeline = {datasetId:state.activeDataset,inputIds:[output.id]}; mode = '问答生成'; inputIds = [output.id]">下一步：生成问答</el-button></div></article><el-empty v-if="!tasks.length" description="选择输入并执行后，结果会展示在这里" :image-size="65" /></section>
  </div>
</template>
