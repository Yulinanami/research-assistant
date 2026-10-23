<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { state, previewService, recordUse, submitUsageRequest, approveUsageRequest, allowed, requireAction, datasetName, selectedVersions, addVersion, notify, review, publish, downloadVersion } from '../store'
import { uid, now, canDownload, isDatasetVersion, isDatasetOwner } from '../domain'
import FormDialog from './GovernanceFormDialog.vue'
const props = defineProps({ page: String })
const emit=defineEmits(['navigate'])
const search = ref(state.ui[props.page]?.search || '')
const filter = ref(state.ui[props.page]?.filter || '全部状态')
if (props.page==='review' && state.focusGovernance) {const focus=state.versions.find(item=>item.id===state.focusGovernance.versionId);state.focusVersion=focus?.id || '';filter.value=focus?.status==='已发布'?'已发布':'全部状态';search.value='';state.focusGovernance=null}
const catalogType = ref(state.ui[props.page]?.catalogType || '全部类型')
const viewMode = ref(state.ui[props.page]?.viewMode || '卡片')
const resultTab = ref('数据集版本')
const selectedId = ref('')
const detailOpen = ref(false)
const preview = ref('逐条预览')
const recordIndex = ref(0)
const reviewNote = ref('')
const projectFilter=ref('')
const requestTab = ref('我的申请')
const requestDialog = ref(false)
const requestVersion = ref(null)
const requestFields = [{ key: 'applicant', label: '申请人', required: true }, { key: 'department', label: '所属部门', required: true }, { key: 'reason', label: '使用理由', type: 'textarea', required: true }]
const editDialog = ref(false)
const editing = ref(null)
const fields = ref([])
const serviceDetail = ref(null)
const serviceResponse=ref(null)
watch(serviceDetail,()=>{serviceResponse.value=null})
const releaseDialog = ref(false)
const releaseVersion = ref(null)
const releaseFields = [
  { key: 'tag', label: '版本 Tag', required: true, placeholder: '例如 v1.0.0 或 research-2026-10', help: '同一数据集内唯一；支持英文、数字、点、下划线和短横线。' },
  { key: 'title', label: '发布标题', required: true, placeholder: '例如 土壤科研问答首次发布' },
  { key: 'notes', label: '发布说明', required: true, type: 'textarea', rows: 8, placeholder: '介绍本次数据范围、主要变更和使用注意事项。' },
]
function openRelease(version) {
  if (!requireAction('review', version.datasetId)) return
  releaseVersion.value = version
  releaseDialog.value = true
}
function saveRelease(data) {
  try { if (publish(releaseVersion.value, data)) releaseDialog.value = false }
  catch (error) { ElMessage.warning(error.message) }
}
const visibleVersions = computed(() => state.versions.filter(v => allowed('view', v.datasetId)))
const datasetVersions = computed(() => selectedVersions().filter(isDatasetVersion))
const processingResults = computed(() => selectedVersions().filter(v => !isDatasetVersion(v)))
const rows = computed(() => {
  if (props.page === 'versions') return resultTab.value === '数据集版本' ? datasetVersions.value : processingResults.value
  return (props.page === 'catalog' ? visibleVersions.value.filter(v => isDatasetVersion(v) && v.status === '已发布') : props.page === 'review' ? visibleVersions.value.filter(isDatasetVersion) : selectedVersions()).filter(v => datasetName(v.datasetId).includes(search.value) && (filter.value === '全部状态' || v.status === filter.value) && (catalogType.value === '全部类型' || state.datasets.find(d => d.id === v.datasetId)?.type === catalogType.value) && (props.page !== 'review' || ['草稿','待审核', '已通过', '已退回',...(filter.value==='已发布'?['已发布']:[])].includes(v.status)) && (!projectFilter.value || state.datasets.find(dataset=>dataset.id===v.datasetId)?.projectId===projectFilter.value))
})
const resultLabel = version => isDatasetVersion(version) ? version.release?.tag || `v${version.number}.0.0` : version.type
const publishedVersions = computed(() => datasetVersions.value.filter(v => v.status === '已发布'))
const selected = computed(() => visibleVersions.value.find(v => v.id === selectedId.value))
const requests = computed(() => state.requests.filter(r => allowed('view', r.datasetId) && (requestTab.value === '待我审批' ? r.status === '待审批' : r.user === state.role) && (r.applicant + datasetName(r.datasetId)).includes(search.value)))
const selectedDataset = computed(() => state.datasets.find(d => d.id === selected.value?.datasetId))
const recordFields=computed(()=> {
  const records=selected.value?.records || []
  if (records.some(record=>record.question || record.content)) return []
  return [...new Set(records.flatMap(record=>Object.keys(record)))].map(field=> {
    const value=records.find(record=>record[field]!==null && record[field]!==undefined)?.[field]
    return {id:field,field,name:field,type:typeof value==='number'?'数值':typeof value==='boolean'?'布尔':'文本'}
  })
})
const downloadAllowed = version => allowed('download', version.datasetId) && canDownload(version, state.requests, state.role, state.datasets.find(d=>d.id===version.datasetId))
watch(() => state.activeDataset, () => {
  const focus = selectedVersions().find(v => v.id === state.focusVersion)
  resultTab.value = focus && !isDatasetVersion(focus) ? '加工成果' : '数据集版本'
  selectedId.value = rows.value.find(v => v.id === state.focusVersion)?.id || rows.value[0]?.id || ''
  recordIndex.value = 0
}, { immediate: true })
watch(resultTab, () => { if (!rows.value.some(v => v.id === selectedId.value)) selectedId.value = rows.value[0]?.id || '' })
watch(selectedId, () => { recordIndex.value = 0; reviewNote.value = ''; preview.value = '逐条预览' })
watch([search, filter, catalogType, viewMode], () => { state.ui[props.page] = { search: search.value, filter: filter.value, catalogType: catalogType.value, viewMode: viewMode.value } })
watch(() => state.role, () => { requestTab.value = '我的申请'; serviceResponse.value=null })
watch([search,filter,projectFilter],()=>{if (props.page==='review' && !rows.value.some(row=>row.id===selectedId.value)) selectedId.value=rows.value[0]?.id || ''})
function show(version) { selectedId.value = version.id; state.focusVersion = version.id; detailOpen.value = true }
function submitReview(version) {
  if (!requireAction('edit', version.datasetId)) return
  version.status = '待审核'; notify('成果已提交审核')
}
function editRecord(record, index) {
  if (!requireAction('edit', selected.value.datasetId)) return
  editing.value = { record, index }
  fields.value = recordFields.value.length ? recordFields.value.map(field=>({key:field.field,label:field.name,type:field.type==='数值'?'number':field.type==='布尔'?'switch':'textarea',min:Number.MIN_SAFE_INTEGER,max:Number.MAX_SAFE_INTEGER,rows:2})) : record.question ? [{ key: 'question', label: '问题', required: true, type: 'textarea' }, { key: 'answer', label: '回答', required: true, type: 'textarea', rows: 6 }, { key: 'reference', label: '参考材料', type: 'textarea' }] : [{ key: 'title', label: '标题' }, { key: 'content', label: '内容', required: true, type: 'textarea', rows: 10 }]
  editDialog.value = true
}
function saveRecord(data) {
  if (!requireAction('edit',selected.value.datasetId)) return
  const version = selected.value
  if (['已发布', '已通过', '待审核'].includes(version.status)) {
    const records = JSON.parse(JSON.stringify(version.records)); records[editing.value.index] = { ...records[editing.value.index], ...data }
    const next = addVersion(version.datasetId, records, '人工修订', version.id, isDatasetVersion(version) ? 'dataset' : 'processing'); selectedId.value = next.id; notify(`已创建${resultLabel(next)}草稿，原内容保留`)
  } else { Object.assign(version.records[editing.value.index], data); notify('修订内容已保存') }
  editDialog.value = false
}
function apply(version) {
  if (isDatasetOwner(state.datasets.find(d=>d.id===version.datasetId),state.role)) return
  if (state.requests.some(r => r.versionId === version.id && r.user === state.role && r.status === '待审批')) return ElMessage.warning('此版本已有待审批申请，请到“使用申请与审批”查看')
  requestVersion.value = version; requestDialog.value = true
}
function sendRequest(data) {if (submitUsageRequest(requestVersion.value,data)) requestDialog.value=false}
async function approve(request,pass) {
  if (!requireAction('review',request.datasetId)) return
  try {const {value}=await ElMessageBox.prompt(pass?'填写审批意见':'填写驳回原因',pass?'通过申请':'驳回申请',{inputPlaceholder:'审批意见',inputValidator:value=>Boolean(value?.trim()) || '请填写审批意见',confirmButtonText:'确认',cancelButtonText:'取消'});approveUsageRequest(request,pass,value)} catch {}
}

function addService(version) {
  if (!requireAction('edit', version.datasetId)) return
  const existing = state.services.find(s => s.versionId === version.id)
  if (existing) { serviceDetail.value = existing; return }
  const service = { createdBy:state.role,id: uid('service'), datasetId: version.datasetId, versionId: version.id, version: version.number, name: datasetName(version.datasetId), path: `/api/demo/datasets/${version.datasetId}/versions/${version.number}/records`, method: 'GET', status: '已生成', created: now() }
  state.services.push(service);recordUse('API服务创建',version.id,service.path,'已配置'); serviceDetail.value = service; notify('接口示例已生成')
}
async function copy(text) { try { await navigator.clipboard.writeText(text); ElMessage.success('已复制') } catch { ElMessage.warning('请手动复制') } }

</script>

<template>
  <section v-if="page === 'versions'" class="panel dataset-version-panel">
    <div class="section-title"><div><h3>{{ datasetName(state.activeDataset) }}</h3></div><el-button type="primary" :disabled="!allowed('edit')" @click="$emit('navigate', 'generation')"><el-icon><Plus /></el-icon>提取或增强问答</el-button></div>
    <el-tabs v-model="resultTab"><el-tab-pane :label="`数据集版本（${datasetVersions.length}）`" name="数据集版本" /><el-tab-pane :label="`加工成果（${processingResults.length}）`" name="加工成果" /></el-tabs>
    <template v-if="resultTab === '数据集版本'">
      <div class="version-switch-toolbar"><div><span class="muted">当前查阅版本</span><el-select v-model="selectedId" placeholder="选择数据集版本" class="version-select"><el-option v-for="version in datasetVersions" :key="version.id" :value="version.id" :label="`${resultLabel(version)} · ${(version.totalRecords ?? version.records.length).toLocaleString()}条 · ${version.status === '已发布' ? '发布版本' : version.status}`" /></el-select></div><div class="version-release-actions" v-if="selected"><el-button v-if="['草稿', '已退回'].includes(selected.status)" :disabled="!allowed('edit')" @click="submitReview(selected)">提交审核</el-button><el-button v-if="selected.status === '待审核'" @click="state.focusVersion = selected.id; $emit('navigate', 'review')">前往审核</el-button><el-tag v-if="selected.status === '已发布'" type="success" size="large">发布版本 · {{ resultLabel(selected) }}</el-tag><el-button v-if="selected.status === '已发布' && !selected.release" :disabled="!allowed('review')" @click="openRelease(selected)">补充发布信息</el-button><el-tooltip v-if="selected.status !== '已发布'" :content="selected.status === '已通过' ? '将当前版本发布数据集，在数据目录展示' : '请先提交质量审核，审核通过后可填写发布信息'" placement="top"><span><el-button type="primary" :disabled="selected.status !== '已通过' || !allowed('review')" @click="openRelease(selected)">发布数据集</el-button></span></el-tooltip></div></div>
      <el-collapse class="dataset-history"><el-collapse-item name="versions"><template #title><span class="history-title"><el-icon><DocumentCopy /></el-icon>版本历史 <el-tag type="info">{{ datasetVersions.length }}</el-tag></span></template><div class="version-cards"><button v-for="version in datasetVersions" :key="version.id" :class="['version-card', { active: selectedId === version.id }]" @click="selectedId = version.id"><div><b>{{ resultLabel(version) }}</b><el-tag :type="version.status === '已发布' ? 'success' : 'info'" size="small">{{ version.status === '已发布' ? '发布版本' : version.status }}</el-tag></div><strong>{{ (version.totalRecords ?? version.records.length).toLocaleString() }} <small>条数据</small></strong><span v-if="version.release" class="release-tag">{{ version.release.tag }}</span><span>{{ version.release?.title || version.type }}</span><small>{{ version.created }}</small></button></div></el-collapse-item></el-collapse>

      <el-empty v-if="!datasetVersions.length" description="还没有数据集版本，请导入数据或执行问答提取" />
    </template>
    <template v-else><el-table :data="processingResults" @row-click="row => selectedId = row.id" highlight-current-row class="clickable-table"><el-table-column label="成果类型" prop="type" /><el-table-column label="条数" width="100"><template #default="{ row }">{{ (row.totalRecords ?? row.records.length).toLocaleString() }} 条</template></el-table-column><el-table-column label="创建时间" prop="created" min-width="170" /><el-table-column label="操作" width="120"><template #default="{ row }"><el-button link type="primary" @click.stop="selectedId = row.id">查看成果</el-button></template></el-table-column></el-table></template>
  </section>
  <section v-if="page === 'review'" class="panel"><div class="section-title"><div><h3>{{ page === 'review' ? '成果质量审核' : '成果版本' }} <span class="count">{{ rows.length }}</span></h3></div><el-button v-if="page === 'versions'" type="primary" :disabled="!allowed('edit')" @click="$emit('navigate', 'generation')"><el-icon><Plus /></el-icon>生成新成果</el-button></div><div class="toolbar"><el-select v-model="filter"><el-option v-for="s in ['全部状态', '草稿', '待审核', '已通过', '已退回', '已发布']" :key="s" :value="s" /></el-select><el-select v-model="projectFilter" placeholder="全部项目" clearable aria-label="审核项目"><el-option v-for="project in state.projects" :key="project.id" :label="project.name" :value="project.id" /></el-select><el-input v-model="search" placeholder="搜索审核数据集" clearable /></div><el-table :data="rows" highlight-current-row @row-click="row => selectedId = row.id" class="clickable-table"><el-table-column label="数据集名称" min-width="240" show-overflow-tooltip><template #default="{ row }">{{ datasetName(row.datasetId) }}</template></el-table-column><el-table-column label="所属项目" min-width="150" show-overflow-tooltip><template #default="{ row }">{{ state.datasets.find(dataset => dataset.id === row.datasetId)?.project || '—' }}</template></el-table-column><el-table-column label="版本" min-width="120"><template #default="{ row }"><span class="version-label">{{ resultLabel(row) }}</span></template></el-table-column><el-table-column label="成果类型" prop="type" min-width="145" /><el-table-column label="数据量" width="90"><template #default="{ row }">{{ (row.totalRecords ?? row.records.length).toLocaleString() }} 条</template></el-table-column><el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="row.status === '已发布' || row.status === '已通过' ? 'success' : row.status === '已退回' ? 'danger' : 'info'">{{ row.status }}</el-tag></template></el-table-column><el-table-column label="创建时间" prop="created" min-width="175" /><el-table-column label="操作" width="220"><template #default="{ row }"><el-button link type="primary" @click.stop="show(row)">查看</el-button><el-button v-if="['草稿','已退回'].includes(row.status)" link type="primary" :disabled="!allowed('edit')" @click.stop="submitReview(row)">提交审核</el-button><el-button v-if="row.status === '已通过' && isDatasetVersion(row)" link type="primary" :disabled="!allowed('review')" @click.stop="openRelease(row)">发布此版本</el-button><el-button v-if="row.status === '待审核'" link type="primary" @click.stop="selectedId = row.id; state.focusVersion = row.id; $emit('navigate', 'review')">审核</el-button></template></el-table-column></el-table></section>

  <template v-if="page === 'catalog'"><section class="panel catalog-toolbar"><div class="toolbar"><el-input v-model="search" placeholder="搜索数据集名称" clearable><template #prefix><el-icon><Search /></el-icon></template></el-input><el-select v-model="catalogType"><el-option v-for="s in ['全部类型','文本','图片','问答对']" :key="s" :value="s" /></el-select><span class="toolbar-spacer"></span><span class="muted">{{ rows.length }} 个发布版本</span><el-radio-group v-model="viewMode"><el-radio-button value="卡片"><el-icon><Grid /></el-icon></el-radio-button><el-radio-button value="列表"><el-icon><Files /></el-icon></el-radio-button></el-radio-group></div></section><div v-if="viewMode === '卡片'" class="catalog-grid"><article v-for="version in rows" :key="version.id" class="catalog-card" @click="show(version)"><div class="catalog-card-top"><span class="icon-tile blue"><el-icon><FolderOpened /></el-icon></span><el-tag type="success" size="small">{{ version.release?.tag || `V${version.number}` }}</el-tag></div><h3>{{ datasetName(version.datasetId) }}</h3><h4 v-if="version.release" class="catalog-release-title">{{ version.release.title }}</h4><p class="catalog-release-summary">{{ version.release?.notes || state.datasets.find(d => d.id === version.datasetId)?.demand }}</p><div class="tags"><el-tag v-for="tag in state.datasets.find(d => d.id === version.datasetId)?.tags" :key="tag" type="info">{{ tag }}</el-tag><el-tag type="info">质量已审核</el-tag></div><div class="catalog-card-footer"><span>{{ (version.totalRecords ?? version.records.length).toLocaleString() }} 条数据 · {{ version.type }}</span><el-button link type="primary">查看详情<el-icon><ArrowRight /></el-icon></el-button></div></article></div><section v-else class="panel"><el-table :data="rows" @row-click="show"><el-table-column label="数据集名称" min-width="240"><template #default="{ row }">{{ datasetName(row.datasetId) }}</template></el-table-column><el-table-column label="版本 / Tag"><template #default="{ row }">V{{ row.number }}<small v-if="row.release" class="release-tag"> · {{ row.release.tag }}</small></template></el-table-column><el-table-column label="类型" prop="type" /><el-table-column label="条数"><template #default="{ row }">{{ (row.totalRecords ?? row.records.length).toLocaleString() }}</template></el-table-column><el-table-column label="操作"><template #default="{ row }"><el-button link type="primary" @click.stop="show(row)">查看详情</el-button></template></el-table-column></el-table></section><el-empty v-if="!rows.length" description="暂无符合条件的已发布成果" /></template>

  <section v-if="page === 'requests'" class="panel"><el-tabs v-model="requestTab"><el-tab-pane label="我的申请" name="我的申请" /><el-tab-pane v-if="allowed('review')" label="待我审批" name="待我审批" /></el-tabs><div class="toolbar"><el-input v-model="search" placeholder="搜索申请人或数据集" clearable /><span class="muted">授权仅针对申请的成果版本</span></div><el-table :data="requests" empty-text="暂无申请记录，可在数据目录中申请使用"><el-table-column label="数据集 / 版本" min-width="240"><template #default="{ row }">{{ datasetName(row.datasetId) }}<el-tag class="version-tag" type="info">V{{ state.versions.find(v => v.id === row.versionId)?.number }}</el-tag></template></el-table-column><el-table-column label="申请人" prop="applicant" width="100" /><el-table-column label="部门" prop="department" width="110" /><el-table-column label="理由" prop="reason" min-width="150" /><el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="row.status === '已通过' ? 'success' : row.status === '已驳回' ? 'danger' : 'warning'">{{ row.status }}</el-tag></template></el-table-column><el-table-column label="审批意见" prop="note" min-width="130" /><el-table-column label="操作" width="165"><template #default="{ row }"><template v-if="requestTab === '待我审批' && allowed('review', row.datasetId)"><el-button link type="primary" @click="approve(row, true)">通过</el-button><el-button link type="danger" @click="approve(row, false)">驳回</el-button></template><el-button v-else-if="row.status === '已通过'" link type="primary" @click="downloadVersion(state.versions.find(v => v.id === row.versionId))">下载数据</el-button><span v-else class="muted">等待审批结果</span></template></el-table-column></el-table></section>

  <section v-if="page === 'services'" class="panel"><div class="section-title"><div><h3>数据服务接口</h3></div><el-dropdown @command="id => addService(state.versions.find(v => v.id === id))"><el-button type="primary" :disabled="!allowed('edit')">生成接口<el-icon><ArrowDown /></el-icon></el-button><template #dropdown><el-dropdown-menu><el-dropdown-item v-for="version in visibleVersions.filter(v => isDatasetVersion(v) && v.status === '已发布')" :key="version.id" :command="version.id">{{ datasetName(version.datasetId) }} · {{ version.release?.tag || `V${version.number}` }}</el-dropdown-item><el-dropdown-item v-if="!visibleVersions.some(v => isDatasetVersion(v) && v.status === '已发布')" disabled>请先发布成果</el-dropdown-item></el-dropdown-menu></template></el-dropdown></div><el-table :data="state.services.filter(s => allowed('view',s.datasetId))"><el-table-column label="数据集" prop="name" min-width="210" /><el-table-column label="版本" width="80"><template #default="{ row }">V{{ row.version }}</template></el-table-column><el-table-column label="接口地址" prop="path" min-width="300" /><el-table-column label="方式" prop="method" width="80" /><el-table-column label="操作"><template #default="{ row }"><el-button link type="primary" @click="serviceDetail = row">接口详情</el-button></template></el-table-column></el-table></section>

  <section v-if="selected && ['versions','review'].includes(page)" class="panel version-preview"><div class="section-title"><div><h3>{{ resultLabel(selected) }} · {{ isDatasetVersion(selected) ? '数据内容' : '成果内容' }}</h3><p>来源：{{ state.sources.find(s => s.id === selected.sourceId)?.name || (state.versions.find(v => v.id === selected.sourceId) ? resultLabel(state.versions.find(v => v.id === selected.sourceId)) : '来源未记录') }}</p></div><el-tag :type="selected.status === '已发布' ? 'success' : 'info'">{{ selected.status === '已发布' ? '发布版本' : selected.status }}</el-tag></div><div v-if="selected.parentVersionId" class="version-parent-note">基于 {{ resultLabel(state.versions.find(v => v.id === selected.parentVersionId) || {}) }} 创建 · 当前版本 {{ (selected.totalRecords ?? selected.records.length).toLocaleString() }} 条，切换版本可查看各自内容。</div><section v-if="selected.release" class="release-info"><div class="release-info-heading"><el-tag type="success">{{ selected.release.tag }}</el-tag><span>数据快照 V{{ selected.number }}</span></div><h3>{{ selected.release.title }}</h3><p class="release-meta">{{ selected.release.publisher }} 发布于 {{ selected.release.publishedAt }}</p><div class="release-notes">{{ selected.release.notes }}</div></section><div v-else-if="selected.status === '已发布'" class="release-legacy"><span>此历史发布尚未填写Tag、标题和说明。</span><el-button v-if="allowed('review', selected.datasetId)" link type="primary" @click="openRelease(selected)">补充发布信息</el-button></div><div v-if="selected.reviewNote" class="review-note">审核意见：{{ selected.reviewNote }}</div><el-tabs v-model="preview"><el-tab-pane label="逐条预览" name="逐条预览" /><el-tab-pane label="JSON" name="JSON" /><el-tab-pane label="Markdown" name="Markdown" /><el-tab-pane v-if="['文本清洗', '图片清洗'].includes(selected.type)" label="处理前后对比" name="处理前后对比" /></el-tabs>
    <section v-if="selected.type === '图片清洗' && !['JSON', 'Markdown'].includes(preview)" class="image-cleaning-results">

      <div class="image-cleaning-summary"><div><small>输入图片</small><b>{{ (selected.totalRecords ?? selected.records.length).toLocaleString() }} 张</b></div><div><small>保留图片</small><b class="kept">{{ selected.records.filter(r => r.status === '保留').length }} 张</b></div><div><small>过滤图片</small><b class="filtered">{{ selected.records.filter(r => r.status === '过滤').length }} 张</b></div></div>
      <article v-for="(record, i) in selected.records" :key="i" class="image-cleaning-item">
        <div class="record-header"><h4>{{ record.title }}</h4><el-tag :type="record.status === '保留' ? 'success' : 'warning'">{{ record.status }} · {{ record.reason }}</el-tag></div>
        <div class="two-cols"><div><small>处理前</small><el-image :src="record.image" :preview-src-list="[record.image]" preview-teleported fit="contain" class="cleaning-image" /><p>{{ record.before.width }} × {{ record.before.height }} · {{ record.before.format }} · 清晰度 {{ record.clarity }}</p></div>
        <div><small>处理后</small><template v-if="record.after"><el-image :src="record.image" :preview-src-list="[record.image]" preview-teleported fit="contain" class="cleaning-image" /><p>目标：{{ record.after.width }} × {{ record.after.height }} · {{ record.after.format }}</p></template><div v-else class="cleaning-filtered"><el-icon><Picture /></el-icon><b>已过滤</b><span>{{ record.reason }}</span></div></div></div>
      </article><el-empty v-if="!selected.records.length" description="本次没有可处理的图片" />
    </section>
    <pre v-else-if="preview === 'JSON'">{{ JSON.stringify(selected.records, null, 2) }}</pre><pre v-else-if="preview === 'Markdown'">{{ selected.records.map(r => r.question ? `## ${r.question}\n\n${r.correctedAnswer || r.answer}` : `## ${r.title || '内容'}\n\n${r.content || JSON.stringify(r)}`).join('\n\n') }}</pre><div v-else-if="preview === '处理前后对比'" class="two-cols"><div><h4>处理前</h4><pre>{{ selected.records[0]?.before }}</pre></div><div><h4>处理后</h4><pre>{{ selected.records[0]?.content }}</pre></div></div><el-table v-else-if="recordFields.length && !selected.records.some(record=>record.question || record.content)" :data="selected.records" class="structured-records"><el-table-column type="index" label="记录" width="70" /><el-table-column v-for="field in recordFields" :key="field.id" :label="field.name+(field.unit?'（'+field.unit+'）':'')" min-width="140"><template #default="{row}">{{ row[field.field] ?? '—' }}</template></el-table-column><el-table-column label="操作" width="100"><template #default="{row,$index}"><el-button link type="primary" :disabled="!allowed('edit',selected.datasetId)" @click="editRecord(row,$index)">编辑内容</el-button></template></el-table-column></el-table><template v-else><div class="record-list"><article v-for="(record, i) in selected.records" :key="i" class="record-preview"><div class="record-header"><span>记录 {{ i + 1 }}</span><el-button link type="primary" :disabled="!allowed('edit', selected.datasetId)" @click="editRecord(record, i)">编辑内容</el-button></div><template v-if="record.question"><h4>{{ record.question }}</h4><p>{{ record.correctedAnswer || record.answer }}</p><div class="record-reference">参考材料：{{ record.reference || '未提供' }}</div><el-tag v-if="record.label">{{ record.label }}</el-tag><span v-if="record.rating" class="muted"> · 评分 {{ record.rating }}/5</span><el-tag v-if="record.suggestion" type="warning">模型建议：{{ record.suggestion }}</el-tag></template><template v-else><h4>{{ record.title || '内容' }}</h4><pre>{{ record.content || JSON.stringify(record, null, 2) }}</pre><div v-if="record.table" class="two-cols"><div><h4>表格</h4><table class="sample-table"><tbody><tr><th>实验组</th><th>土壤含水量</th></tr><tr><td>A组</td><td>20%</td></tr><tr><td>B组</td><td>25%</td></tr></tbody></table></div><div><h4>公式与图片引用</h4><p>{{ record.formula }}</p><p>{{ record.image }}</p></div></div></template></article></div></template>
    <div v-if="page==='review'" class="review-controls"><h3>人工审核</h3><el-input v-model="reviewNote" type="textarea" :rows="2" placeholder="填写审核意见或退回原因" /><div class="dialog-actions"><el-button type="danger" plain :disabled="selected.status!=='待审核' || !allowed('review')" @click="reviewNote.trim()?review(selected,false,reviewNote):ElMessage.warning('请填写退回原因')">退回修改</el-button><el-button type="primary" :disabled="selected.status!=='待审核' || !allowed('review')" @click="review(selected,true,reviewNote || '已核对内容与来源')">审核通过</el-button><el-button v-if="selected.status==='已通过'" type="success" :disabled="!allowed('review')" @click="openRelease(selected)">发布此版本</el-button></div></div>
  </section>

  <el-drawer v-model="detailOpen" :title="selected ? datasetName(selected.datasetId) : '成果详情'" size="700"><template v-if="selected"><div class="detail-badges"><el-tag type="success">{{ selected.status }}</el-tag><el-tag type="info">{{ resultLabel(selected) }}</el-tag><el-tag>{{ (selected.totalRecords ?? selected.records.length).toLocaleString() }} 条</el-tag></div><section v-if="selected.release" class="release-info"><div class="release-info-heading"><el-tag type="success">{{ selected.release.tag }}</el-tag><span>数据快照 V{{ selected.number }}</span></div><h3>{{ selected.release.title }}</h3><p class="release-meta">{{ selected.release.publisher }} 发布于 {{ selected.release.publishedAt }}</p><div class="release-notes">{{ selected.release.notes }}</div></section><div v-else-if="selected.status === '已发布'" class="release-legacy"><span>此历史发布尚未填写Tag、标题和说明。</span><el-button v-if="allowed('review', selected.datasetId)" link type="primary" @click="openRelease(selected)">补充发布信息</el-button></div><h3>数据集介绍</h3><p>{{ selectedDataset?.demand }}</p><el-descriptions :column="1" border><el-descriptions-item label="数据集编号">{{ selectedDataset?.code }}</el-descriptions-item><el-descriptions-item label="使用场景">{{ selectedDataset?.scene }}</el-descriptions-item><el-descriptions-item label="所属项目">{{ selectedDataset?.project }}</el-descriptions-item><el-descriptions-item label="数据等级">{{ selectedDataset?.level }}</el-descriptions-item><el-descriptions-item label="质量要求">{{ selectedDataset?.quality }}</el-descriptions-item><el-descriptions-item label="来源">{{ selectedDataset?.source }}</el-descriptions-item><el-descriptions-item label="审核意见">{{ selected.reviewNote || '尚无审核意见' }}</el-descriptions-item></el-descriptions><h3>逐条数据预览</h3><el-pagination :current-page="Math.max(1, recordIndex)" :page-count="selected.records.length" :default-current-page="1" layout="prev, pager, next" @current-change="recordIndex = $event" /><pre>{{ JSON.stringify(selected.records[Math.max(0, recordIndex - 1)], null, 2) }}</pre><h3>文件列表</h3><div class="file-list" v-for="file in state.sources.filter(s => s.datasetId === selected.datasetId)" :key="file.id"><el-icon><Document /></el-icon>{{ file.name }}<el-tag type="info">{{ file.type }}</el-tag></div><div class="dialog-actions" v-if="selected.status === '已发布'"><el-button v-if="!isDatasetOwner(selectedDataset,state.role) && !downloadAllowed(selected)" type="primary" @click="apply(selected)">申请使用此版本</el-button><el-button :disabled="!downloadAllowed(selected)" type="primary" @click="downloadVersion(selected)"><el-icon><Download /></el-icon>下载成果JSON</el-button><el-button :disabled="!downloadAllowed(selected)" @click="downloadVersion(selected, 'md')">下载Markdown</el-button></div><p class="muted" v-if="selected.status === '已发布' && !isDatasetOwner(selectedDataset,state.role) && !downloadAllowed(selected)">下载需先完成当前版本的使用审批。</p></template></el-drawer>
  <FormDialog v-model="releaseDialog" :title="releaseVersion?.status === '已发布' ? '补充发布信息' : '发布数据集'" :fields="releaseFields" :initial="releaseVersion ? { tag: `v${releaseVersion.number}.0.0`, title: `${datasetName(releaseVersion.datasetId)} · 第${releaseVersion.number}版`, notes: '' } : {}" :confirm-text="releaseVersion?.status === '已发布' ? '保存发布信息' : '确认发布'" @save="saveRelease" />
  <FormDialog v-model="requestDialog" title="申请使用数据" :fields="requestFields" :initial="{ applicant: state.role }" confirm-text="提交申请" @save="sendRequest" />
  <FormDialog v-model="editDialog" title="修改成果内容" :fields="fields" :initial="editing?.record" @save="saveRecord" />
  <el-dialog :model-value="Boolean(serviceDetail)" title="接口详情" width="750" @close="serviceDetail = null"><template v-if="serviceDetail"><h4>{{ serviceDetail.method }} {{ serviceDetail.path }}</h4><p>参数：page（页码）、pageSize（每页条数）；返回示例对应已发布版本。</p><el-button @click="copy(`${serviceDetail.method} ${serviceDetail.path}?page=1&pageSize=20`)">复制接口说明</el-button><div class="dialog-actions"><el-button type="primary" @click="serviceResponse=previewService(serviceDetail)"><el-icon><Connection /></el-icon>检查授权并预览响应</el-button></div><template v-if="serviceResponse"><h4>响应预览 · HTTP {{ serviceResponse.status }}</h4><pre>{{ JSON.stringify(serviceResponse,null,2) }}</pre></template></template></el-dialog>
</template>
