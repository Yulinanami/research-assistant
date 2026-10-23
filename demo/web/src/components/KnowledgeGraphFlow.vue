<script setup>
import { computed, ref, watch } from 'vue'
import { state, selectedSources, selectedVersions, allowed, downloadSource, rebuildKnowledgeAnnotations } from '../store'
import { knowledgeSnapshot } from '../knowledgeBase'
import { preparationInputs } from '../workflow'
import KnowledgeGraphView from './KnowledgeGraphView.vue'

const emit = defineEmits(['navigate', 'review'])
const layer = ref(['raw', 'compiled', 'graph'].includes(state.ui.knowledgeLayer) ? state.ui.knowledgeLayer : 'graph')
delete state.ui.knowledgeLayer
const directory = ref('raw')
const selectedKey = ref('')
const search = ref('')
const showDetails = ref(false)
const tree = ref(null)
const snapshot = computed(() => knowledgeSnapshot(selectedSources(), selectedVersions(), state.activeDataset))
const prepared = computed(() => preparationInputs(selectedSources(), selectedVersions(), state.activeDataset))
const rawItems = computed(() => [
  ...prepared.value.map(input => ({ ...input, key: `source:${input.originId}`, collection: input.kind === 'image' ? '图片资料'
    : snapshot.value.inputs.find(item => item.key === `source:${input.originId}`)?.collection
      || (/\.(md|txt)$/i.test(input.name) && !/论文|报告|试验|研究/.test(input.name) ? '个人笔记' : '论文与文档') })),
  ...snapshot.value.inputs.filter(input => input.collection === '优质问答').map(input => ({ ...input, kind: 'text', ready: true })),
])
const currentJobs = computed(() => state.tasks.filter(task => task.datasetId === state.activeDataset && task.config?.knowledgeBuild
  && (task.type === '知识编译' ? snapshot.value.inputs.some(input => input.key === task.config.knowledgeInput?.key
    && input.signature === task.config.knowledgeInput?.signature) : task.config.knowledgeBuildSignature === snapshot.value.signature)))
const running = computed(() => currentJobs.value.some(task => task.status === '执行中'))
const failed = computed(() => currentJobs.value.filter(task => task.status === '失败'
  && !currentJobs.value.some(newer => newer.type === task.type && newer.startedAt > task.startedAt
    && (task.type !== '知识编译' || newer.config.knowledgeInput?.key === task.config.knowledgeInput?.key))))
const graph = computed(() => snapshot.value.graph?.records.find(record => record.knowledge_graph)?.knowledge_graph)
const rawSelection = computed(() => rawItems.value.find(input => `raw:${input.key}` === selectedKey.value))
const pageSelection = computed(() => snapshot.value.pages.find(page => `page:${page.id}` === selectedKey.value))
const pageRecord = computed(() => pageSelection.value?.records[0])
const stages = computed(() => [
  { id: 'raw', name: '原始资料层', count: rawItems.value.length, unit: '份资料', icon: 'FolderOpened' },
  { id: 'compiled', name: '知识编译层', count: snapshot.value.pages.length, unit: '个知识页面', icon: 'DocumentChecked' },
  { id: 'graph', name: '知识图谱层', count: graph.value?.entities.length || 0, unit: '个知识点', icon: 'Connection' },
])
const treeData = computed(() => {
  const items = directory.value === 'raw'
    ? rawItems.value.map(input => ({ id: `raw:${input.key}`, label: input.name, collection: input.collection, layer: 'raw' }))
    : snapshot.value.pages.map(page => ({ id: `page:${page.id}`, label: page.records[0].title,
      collection: page.records[0].collection || '知识页面', layer: 'compiled' }))
  return [...new Set(items.map(item => item.collection))].map(collection => ({ id: `folder:${collection}`, label: collection,
    children: items.filter(item => item.collection === collection) }))
})
watch(search, value => tree.value?.filter(value))
watch(treeData, () => tree.value?.filter(search.value), { flush: 'post' })
function filterTree(value, node) { return !value || node.label.toLowerCase().includes(value.trim().toLowerCase()) }
function selectNode(node) { if (node.layer) { selectedKey.value = node.id; layer.value = node.layer } }
function selectLayer(id) {
  layer.value = id
  if (id === 'raw') { directory.value = 'raw'; selectedKey.value = rawItems.value[0] ? `raw:${rawItems.value[0].key}` : '' }
  if (id === 'compiled') { directory.value = 'compiled'; selectedKey.value = snapshot.value.pages[0] ? `page:${snapshot.value.pages[0].id}` : '' }
}
watch(() => [rawItems.value.map(item => item.key).join('|'), snapshot.value.pages.map(page => page.id).join('|')], () => {
  if (layer.value === 'raw' && !rawSelection.value) selectedKey.value = rawItems.value[0] ? `raw:${rawItems.value[0].key}` : ''
  if (layer.value === 'compiled' && !pageSelection.value) selectedKey.value = snapshot.value.pages[0] ? `page:${snapshot.value.pages[0].id}` : ''
}, { immediate: true })
function openRecords() { state.ui.taskCenterScope = { datasetId: state.activeDataset }; emit('navigate', 'task-center') }
function openOriginal() {
  const original = rawItems.value.find(item => item.key === pageSelection.value.knowledgeKey)
  if (original) { directory.value = 'raw'; selectedKey.value = `raw:${original.key}`; layer.value = 'raw' }
}
function openSourceFile() {
  const source = selectedSources().find(item => item.id === rawSelection.value?.originId)
  if (source) downloadSource(source)
  else { state.focusVersion = rawSelection.value?.inputId || ''; emit('navigate', 'versions') }
}
</script>

<template>
  <section class="panel knowledge-base-header">
    <div class="section-title"><h3>知识图谱标注流程</h3><div><el-tag type="info">自动编译 · 演示</el-tag><el-button :disabled="!allowed('edit') || !snapshot.inputs.length || running" @click="rebuildKnowledgeAnnotations()">重新生成</el-button><el-button @click="openRecords">任务记录</el-button><el-button v-if="snapshot.graph" type="primary" @click="emit('review', snapshot.graph.id)">成果审核</el-button></div></div>
    <div class="knowledge-stages" role="group" aria-label="知识库建设阶段">
      <button v-for="(stage, index) in stages" :key="stage.id" type="button" :class="['knowledge-stage', { active: layer === stage.id }]" :aria-pressed="layer === stage.id" @click="selectLayer(stage.id)">
        <span class="icon-tile" :class="layer === stage.id ? 'blue' : 'teal'"><el-icon><component :is="stage.icon" /></el-icon></span>
        <span><b>{{ stage.name }}</b><small>{{ stage.count }} {{ stage.unit }}</small></span><el-icon v-if="index < 2" class="knowledge-stage-arrow"><ArrowRight /></el-icon>
      </button>
    </div>
  </section>
  <div class="knowledge-base-layout">
    <aside class="panel knowledge-directory">
      <div class="section-title"><h3>知识目录</h3></div>
      <el-radio-group v-model="directory" size="small"><el-radio-button value="raw">原始资料</el-radio-button><el-radio-button value="compiled">知识页面</el-radio-button></el-radio-group>
      <el-input v-model="search" clearable placeholder="搜索目录" aria-label="搜索知识目录" />
      <el-tree ref="tree" :data="treeData" node-key="id" :current-node-key="selectedKey" :filter-node-method="filterTree" default-expand-all highlight-current :expand-on-click-node="false" @node-click="selectNode" />
      <el-empty v-if="!treeData.length" :description="directory === 'raw' ? '尚未接入资料' : '暂无已编译页面'" :image-size="45" />
      <el-button v-if="allowed('edit')" @click="emit('navigate', 'sources')">接入资料</el-button>
    </aside>
    <section class="panel knowledge-content">
      <template v-if="layer === 'graph'">
        <div class="section-title"><div><h3>知识图谱</h3></div><el-tag v-if="running">自动建设中</el-tag><el-tag v-else-if="failed.length" type="danger">建设失败</el-tag></div>
        <div v-if="graph" class="knowledge-richness"><span><b>{{ snapshot.pages.length }}</b> 知识页面</span><span><b>{{ graph.entities.length }}</b> 知识点</span><span><b>{{ graph.relationships.length }}</b> 关联</span></div>
        <el-switch v-if="snapshot.graph" v-model="showDetails" active-text="实体与关系明细" />
        <KnowledgeGraphView v-if="snapshot.graph" :version="snapshot.graph" :editable="allowed('edit')" exportable :show-details="showDetails" />
        <el-empty v-else :description="running ? '正在自动编译知识并构建图谱' : failed.length ? '自动建设失败，请在任务管理中心重试' : snapshot.inputs.length ? '等待自动建设任务' : '接入文档或通过问答成果审核后自动进行知识编译与图谱标注'" :image-size="85"><el-button v-if="failed.length" @click="openRecords">查看失败记录</el-button><el-button v-else-if="!rawItems.length" @click="emit('navigate', 'sources')">接入资料</el-button></el-empty>
      </template>
      <template v-else-if="layer === 'raw' && rawSelection">
        <div class="section-title"><h3>{{ rawSelection.name }}</h3><el-button @click="openSourceFile">{{ rawSelection.collection === '优质问答' ? '查看问答成果' : '原始文件' }}</el-button></div>
        <el-image v-if="rawSelection.kind === 'image'" :src="rawSelection.content" fit="contain" class="knowledge-source-image" />
        <pre v-else-if="rawSelection.content" class="knowledge-source-text">{{ rawSelection.content }}</pre>
        <el-empty v-else :description="rawSelection.stage === '解析失败' ? '文档解析失败，请前往任务管理中心重试' : '资料已接入，等待自动解析'" :image-size="60"><el-button v-if="rawSelection.stage === '解析失败'" @click="openRecords">查看解析记录</el-button></el-empty>
      </template>
      <template v-else-if="layer === 'compiled' && pageRecord">
        <div class="section-title"><h3>{{ pageRecord.title }}</h3><el-button @click="openOriginal">查看原始资料</el-button></div>
        <div class="knowledge-keywords"><el-tag v-for="keyword in pageRecord.keywords" :key="keyword" type="info">{{ keyword }}</el-tag></div>
        <article class="knowledge-page"><h4>内容摘要</h4><p>{{ pageRecord.summary }}</p><section v-for="(section, index) in pageRecord.sections" :key="index"><h4>{{ section.title }}</h4><p>{{ section.content }}</p></section></article>
      </template>
      <el-empty v-else :description="layer === 'compiled' ? running ? '正在自动编译知识页面' : '暂无已编译的知识页面' : '从目录选择一份资料'" :image-size="75" />
    </section>
  </div>
</template>
