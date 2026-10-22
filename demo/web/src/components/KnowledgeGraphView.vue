<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { state, allowed, addVersion, saveDownload, taskName, notify } from '../store'
import { recordAnnotationTask } from '../annotation'
import { graphEntityTypes, validateKnowledgeGraph, updateGraphEntity, removeGraphEntity, exportKnowledgeGraph } from '../knowledgeGraph'
import FormDialog from './FormDialog.vue'

const props = defineProps({version:Object, editable:Boolean, exportable:Boolean})
const emit = defineEmits(['saved'])
const clone = value => JSON.parse(JSON.stringify(value))
const graph = ref(null), dirty = ref(false), search = ref(''), zoom = ref(1), evidenceIds = ref([])
const dialog = ref(false), editing = ref(null), kind = ref('entity'), initial = ref({})
let draftKey = ''
const canEdit = computed(() => props.editable && allowed('edit', props.version?.datasetId))
function remember() {
  if (dirty.value && draftKey && graph.value) {
    state.ui.graphDrafts ||= {}
    state.ui.graphDrafts[draftKey] = clone(graph.value)
  }
}
watch(() => props.version?.id, () => {
  remember()
  const record = props.version?.records.find(record => record.knowledge_graph)
  draftKey = state.role + ':' + props.version?.datasetId + ':' + props.version?.id
  const saved = props.editable && state.ui.graphDrafts?.[draftKey]
  graph.value = record ? clone(saved || record.knowledge_graph) : null
  dirty.value = Boolean(saved)
  evidenceIds.value = []
  search.value = ''
}, {immediate:true})
onBeforeUnmount(remember)
const entities = computed(() => (graph.value?.entities || []).filter(entity =>
  (entity.entity_name + entity.entity_type).toLowerCase().includes(search.value.trim().toLowerCase())))
const nodes = computed(() => entities.value.slice(0,40).map((entity,index,list) => ({...entity,
  x:450 + (list.length === 1 ? 0 : 340 * Math.cos(index / list.length * Math.PI * 2 - Math.PI / 2)),
  y:215 + (list.length === 1 ? 0 : 150 * Math.sin(index / list.length * Math.PI * 2 - Math.PI / 2)),
})))
const positions = computed(() => new Map(nodes.value.map(entity => [entity.entity_name, entity])))
const edges = computed(() => (graph.value?.relationships || []).filter(relation => positions.value.has(relation.src_id) && positions.value.has(relation.tgt_id)))
const evidence = computed(() => (graph.value?.chunks || []).filter(chunk => evidenceIds.value.includes(chunk.source_id)))
const fields = computed(() => {
  const sources = {key:'source_ids', label:'来源片段', type:'select', multiple:true, required:true,
    options:(graph.value?.chunks || []).map((chunk,index) => ({value:chunk.source_id,label:`片段 ${index+1} · ${chunk.file_path} · ${chunk.content.slice(0,35)}`}))}
  return kind.value === 'entity' ? [
    {key:'entity_name',label:'实体名称',required:true},
    {key:'entity_type',label:'实体类型',type:'select',options:[...new Set([...graphEntityTypes,...(graph.value?.entities || []).map(entity => entity.entity_type)])],required:true},
    {key:'description',label:'实体说明',type:'textarea',required:true},sources,
  ] : [
    ...['src_id','tgt_id'].map((key,index) => ({key,label:index ? '目标实体' : '起始实体',type:'select',options:graph.value?.entities.map(entity => entity.entity_name) || [],required:true})),
    {key:'keywords',label:'关系关键词',required:true}, {key:'description',label:'关系说明',type:'textarea',required:true},
    {key:'weight',label:'权重',type:'number',min:1,max:10000,default:1,required:true},sources,
  ]
})
function edit(type, item = null) {
  if (!canEdit.value) return
  kind.value = type
  editing.value = item ? type === 'entity' ? item.entity_name : graph.value.relationships.indexOf(item) : null
  initial.value = item ? clone(item) : {source_ids:[], weight:1, entity_type:'概念'}
  dialog.value = true
}
function apply(data) {
  if (!canEdit.value) return
  try {
    const next = clone(graph.value)
    const item = {...data, source_id:data.source_ids?.[0], file_path:next.chunks.find(chunk => chunk.source_id === data.source_ids?.[0])?.file_path}
    if (kind.value === 'entity' && editing.value !== null) graph.value = updateGraphEntity(next, editing.value, item)
    else {
      if (kind.value === 'entity') next.entities.push(item)
      else if (editing.value === null) next.relationships.push(item)
      else next.relationships[editing.value] = item
      next.reviewed = false
      graph.value = validateKnowledgeGraph(next)
    }
    dirty.value = true
    remember()
    dialog.value = false
  } catch (error) {ElMessage.warning(error.message)}
}
function remove(type, item) {
  if (!canEdit.value) return
  try {
    if (type === 'entity') graph.value = removeGraphEntity(graph.value,item.entity_name)
    else {
      const next = clone(graph.value)
      next.relationships.splice(graph.value.relationships.indexOf(item),1)
      next.reviewed = false
      graph.value = validateKnowledgeGraph(next)
    }
    dirty.value = true; remember()
  } catch (error) {ElMessage.warning(error.message)}
}
function save() {
  if (!canEdit.value || (!dirty.value && graph.value?.reviewed)) return
  try {
    const reviewed = {...exportKnowledgeGraph(graph.value), reviewed:true}
    const record = {...clone(props.version.records.find(record => record.knowledge_graph)),knowledge_graph:reviewed}
    const version = addVersion(props.version.datasetId,[record],'知识图谱',props.version.id)
    const task = recordAnnotationTask(state.tasks,version,'知识图谱标注',100,taskName('知识图谱标注',version.datasetId))
    task.status = '已完成'; task.logs.push('实体、关系与来源已人工校订，另存图谱成果')
    graph.value = reviewed
    dirty.value = false
    if (state.ui.graphDrafts) delete state.ui.graphDrafts[draftKey]
    notify('图谱校订已另存为项目成果')
    emit('saved',version)
  } catch (error) {ElMessage.warning(error.message)}
}
function download() {
  if (!props.exportable || !allowed('edit',props.version.datasetId)) return
  try {saveDownload(JSON.stringify(exportKnowledgeGraph(graph.value),null,2),'知识图谱-' + props.version.id + '.json')}
  catch (error) {ElMessage.warning(error.message)}
}
</script>

<template>
  <div v-if="graph" class="knowledge-graph">
    <div class="graph-toolbar"><div class="tags"><el-tag>{{ graph.entities.length }} 个实体</el-tag><el-tag type="success">{{ graph.relationships.length }} 条关系</el-tag><el-tag type="info">{{ graph.chunks.length }} 个来源片段</el-tag><el-tag :type="graph.reviewed && !dirty ? 'success' : 'warning'">{{ graph.reviewed && !dirty ? '已人工校订' : '待人工校订' }}</el-tag></div><el-button v-if="exportable && allowed('edit',version.datasetId)" @click="download">导出图谱 JSON</el-button></div>
    <p class="pipeline-note">参考 LightRAG 的实体、关系与来源结构。本地演示将同句出现的实体连接为候选关系，请核对含义后保存。</p>
    <p v-if="graph.is_truncated" class="pipeline-note">已达到本次实体上限，部分候选实体未纳入图谱；可提高上限重新抽取。</p>
    <div class="graph-toolbar"><el-input v-model="search" clearable placeholder="搜索实体名称或类型" aria-label="搜索图谱实体" /><div><el-button :disabled="zoom <= 0.6" aria-label="缩小图谱" @click="zoom = Math.max(0.6,zoom-0.2)">−</el-button><el-button @click="zoom = 1">重置视图</el-button><el-button :disabled="zoom >= 1.8" aria-label="放大图谱" @click="zoom = Math.min(1.8,zoom+0.2)">＋</el-button></div></div>
    <svg v-if="nodes.length" class="graph-canvas" viewBox="0 0 900 460" role="img" aria-label="实体关系图，点击实体或连线查看来源">
      <g :transform="`translate(450 230) scale(${zoom}) translate(-450 -230)`">
        <g v-for="(edge,index) in edges" :key="index" class="graph-edge" role="button" tabindex="0" :aria-label="edge.src_id+'与'+edge.tgt_id+'：'+edge.keywords" @click="evidenceIds = edge.source_ids" @keydown.enter="evidenceIds = edge.source_ids"><line :x1="positions.get(edge.src_id).x" :y1="positions.get(edge.src_id).y" :x2="positions.get(edge.tgt_id).x" :y2="positions.get(edge.tgt_id).y" /><title>{{ edge.src_id }} — {{ edge.keywords }} — {{ edge.tgt_id }}：{{ edge.description }}</title><text :x="(positions.get(edge.src_id).x+positions.get(edge.tgt_id).x)/2" :y="(positions.get(edge.src_id).y+positions.get(edge.tgt_id).y)/2-6">{{ edge.keywords.slice(0,10) }}</text></g>
        <g v-for="node in nodes" :key="node.entity_name" class="graph-node" role="button" tabindex="0" :aria-label="node.entity_name+'，'+node.entity_type" @click="evidenceIds = node.source_ids" @keydown.enter="evidenceIds = node.source_ids"><circle :cx="node.x" :cy="node.y" r="20" /><title>{{ node.entity_name }} · {{ node.entity_type }}：{{ node.description }}</title><text :x="node.x" :y="node.y+38">{{ node.entity_name.length > 16 ? node.entity_name.slice(0,16)+'…' : node.entity_name }}</text></g>
      </g>
    </svg>
    <el-empty v-else description="没有符合搜索条件的实体" :image-size="60" />
    <p v-if="entities.length > nodes.length" class="muted">画布显示前 {{ nodes.length }} 个匹配实体，可搜索定位其余实体；下表保留全部匹配结果。</p>
    <section v-if="evidence.length" class="graph-evidence"><h4>来源证据</h4><div v-for="chunk in evidence" :key="chunk.source_id"><small>{{ chunk.file_path }} · 原资料 {{ chunk.origin_id }} · {{ chunk.source_id }}</small><pre>{{ chunk.content }}</pre></div></section>
    <div class="section-title spaced"><h4>实体标注</h4><el-button v-if="canEdit" @click="edit('entity')">新增实体</el-button></div>
    <el-table :data="entities" empty-text="暂无匹配实体"><el-table-column prop="entity_name" label="实体" min-width="120" /><el-table-column prop="entity_type" label="类型" width="90" /><el-table-column prop="description" label="说明" min-width="190" /><el-table-column label="操作" :width="canEdit ? 160 : 70"><template #default="{row}"><el-button link type="primary" @click="evidenceIds = row.source_ids">来源</el-button><el-button v-if="canEdit" link type="primary" @click="edit('entity',row)">编辑</el-button><el-button v-if="canEdit" link type="danger" @click="remove('entity',row)">删除</el-button></template></el-table-column></el-table>
    <div class="section-title spaced"><h4>关系标注</h4><el-button v-if="canEdit" :disabled="graph.entities.length < 2" @click="edit('relation')">新增关系</el-button></div>
    <el-table :data="graph.relationships" empty-text="暂无关系，可核对原文后新增"><el-table-column prop="src_id" label="起始实体" min-width="110" /><el-table-column prop="keywords" label="关系" min-width="110" /><el-table-column prop="tgt_id" label="目标实体" min-width="110" /><el-table-column prop="description" label="说明" min-width="200" /><el-table-column prop="weight" label="权重" width="65" /><el-table-column label="操作" :width="canEdit ? 160 : 70"><template #default="{row}"><el-button link type="primary" @click="evidenceIds = row.source_ids">来源</el-button><el-button v-if="canEdit" link type="primary" @click="edit('relation',row)">编辑</el-button><el-button v-if="canEdit" link type="danger" @click="remove('relation',row)">删除</el-button></template></el-table-column></el-table>
    <div v-if="canEdit" class="pipeline-actions"><span class="muted">{{ dirty ? '校订暂存中，保存后形成独立成果；删除实体会同时移除关联关系。' : '核对实体、关系与来源后另存成果。' }}</span><el-button type="primary" :disabled="!dirty && graph.reviewed" @click="save">保存图谱校订</el-button></div>
    <FormDialog v-model="dialog" :title="(editing === null ? '新增' : '编辑') + (kind === 'entity' ? '实体' : '关系')" :fields="fields" :initial="initial" @save="apply" />
  </div>
</template>
