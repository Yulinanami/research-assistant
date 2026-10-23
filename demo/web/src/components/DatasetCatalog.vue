<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { state, submitUsageRequest, allowed, notify, downloadVersion } from '../store'
import { buildDatasetTrace, isDatasetVersion, canDownload, uid, now, isDatasetOwner, isVersionAuthorized } from '../domain'
import FormDialog from './GovernanceFormDialog.vue'
import { publicCatalog } from '../auth'
const props = defineProps({ page: String, guest: Boolean, focus: Object })
const emit = defineEmits(['navigate','login-required'])
const catalogData = computed(() => props.guest ? publicCatalog(state) : state)
const mayView = dataset => props.guest || allowed('view',dataset.id)
const classificationName = (id,fallback) => catalogData.value.classifications?.find(item=>item.id===id)?.name || fallback || ''
const industryFor = dataset => classificationName(dataset.domainId,dataset.industry || dataset.project)
const subindustryFor = dataset => classificationName(dataset.subdomainId,dataset.subindustry)
const typeFor = dataset => classificationName(dataset.typeId,dataset.type)
const search = ref('')
const descriptionOverflow = ref({})
const descriptionObservers = new WeakMap()
function measureDescription(element, id) {
  const overflow = element.scrollHeight > element.clientHeight + 1
  if (descriptionOverflow.value[id] !== overflow) descriptionOverflow.value[id] = overflow
}
const vDescriptionOverflow = {
  mounted(element, binding) {
    const observer = new ResizeObserver(() => measureDescription(element, binding.value))
    descriptionObservers.set(element, observer)
    observer.observe(element)
    measureDescription(element, binding.value)
  },
  updated(element, binding) { measureDescription(element, binding.value) },
  unmounted(element) { descriptionObservers.get(element)?.disconnect(); descriptionObservers.delete(element) },
}
const selectedType = ref('')
const selectedIndustry = ref('')
const selectedSubindustry = ref('')
const sortBy = ref('updated')
const plazaPage = ref(1)
const scope = ref('全部')
watch([search, selectedType, selectedIndustry, selectedSubindustry, sortBy, () => scope.value, () => state.role], () => { plazaPage.value = 1 })
watch(selectedIndustry, () => { selectedSubindustry.value='' })
const descriptionFor = dataset => dataset.introduction || dataset.demand || dataset.scene || ''
const selected = ref(null)
const versionId = ref('')
const dialog = ref(false)
const requestVersion = ref(null)
const formOpen = ref(false)
const requestFields = [{ key: 'applicant', label: '申请人', required: true }, { key: 'department', label: '部门', required: true }, { key: 'reason', label: '使用理由', required: true, type: 'textarea' }]
const owned = d => !props.guest && isDatasetOwner(d, state.role)
const versionApproved = version => !props.guest && isVersionAuthorized(version, state.requests, state.role, state.datasets.find(d => d.id === version.datasetId))
const authorizedVersions = id => state.versions.filter(v => v.datasetId === id && isDatasetVersion(v) && v.status === '已发布' && versionApproved(v))
const approved = id => authorizedVersions(id).length > 0
const versionsFor = id => catalogData.value.versions.filter(v => v.datasetId === id && isDatasetVersion(v) && (props.page === 'plaza' || !owned(state.datasets.find(d=>d.id===id)) ? v.status === '已发布' : true)).sort((a,b)=>b.number-a.number)
const latestReleaseFor = dataset => versionsFor(dataset.id).find(version => version.status === '已发布')
const cardVersionFor = dataset => latestReleaseFor(dataset) || versionsFor(dataset.id)[0]
const downloadsFor = dataset => latestReleaseFor(dataset) ? (dataset.downloads || 0) : 0
const publisherFor = dataset => dataset.publisherId || versionsFor(dataset.id).find(version => version.status === '已发布')?.release?.publisher || dataset.owner || '管理员'
const plazaDatasets = computed(() => catalogData.value.datasets.filter(dataset => mayView(dataset) && dataset.storageState!=='已归档' && versionsFor(dataset.id).length))
const datasetTypes = computed(() => [...new Set(plazaDatasets.value.map(typeFor))])
const datasetIndustries = computed(() => [...new Set(plazaDatasets.value.map(industryFor).filter(Boolean))])
const datasetSubindustries = computed(() => [...new Map(plazaDatasets.value.filter(dataset=>industryFor(dataset)===selectedIndustry.value && dataset.subdomainId).map(dataset=>[dataset.subdomainId,{id:dataset.subdomainId,name:subindustryFor(dataset)}])).values()])
const publishedTimeFor = dataset => { const version = latestReleaseFor(dataset); return version?.release?.publishedAt || version?.published || version?.created || '' }
const updatedTime = dataset => Date.parse(publishedTimeFor(dataset).replaceAll('/','-').replace(' ','T')) || 0
const publishedLabelFor = dataset => { const date = publishedTimeFor(dataset).match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/); return date ? `发布于：${date[1]}年${Number(date[2])}月${Number(date[3])}日` : '—' }
const datasets = computed(() => {
  const rows = catalogData.value.datasets.filter(dataset => mayView(dataset) && `${dataset.name} ${dataset.code || ''}`.toLowerCase().includes(search.value.trim().toLowerCase()) && (props.page === 'plaza' ? dataset.storageState!=='已归档' && versionsFor(dataset.id).length : owned(dataset) || approved(dataset.id)) && (props.page === 'plaza' || scope.value === '全部' || (scope.value === '我的数据集' ? owned(dataset) : approved(dataset.id))))
  if (props.page !== 'plaza') return rows
  return rows.filter(dataset => (!selectedType.value || typeFor(dataset) === selectedType.value) && (!selectedIndustry.value || industryFor(dataset) === selectedIndustry.value) && (!selectedSubindustry.value || dataset.subdomainId===selectedSubindustry.value)).sort((a,b) => sortBy.value === 'downloads' ? (b.downloads || 0) - (a.downloads || 0) || updatedTime(b) - updatedTime(a) : updatedTime(b) - updatedTime(a) || (b.downloads || 0) - (a.downloads || 0))
})
const plazaStatistics = computed(() => {
  const totals = { datasets: datasets.value.length, downloads: 0, records: {} }
  for (const dataset of datasets.value) {
    const latest = latestReleaseFor(dataset)
    const unit = dataset.type === '图片' ? '张' : '条'
    totals.records[unit] = (totals.records[unit] || 0) + (latest?.totalRecords ?? latest?.records.length ?? 0)
    totals.downloads += downloadsFor(dataset)
  }
  totals.records = Object.fromEntries(Object.entries(totals.records).sort(([a], [b]) => a.localeCompare(b)))
  return totals
})
watch(() => datasets.value.length, total => { plazaPage.value = Math.min(plazaPage.value, Math.max(1, Math.ceil(total / 10))) })
const versions = computed(() => selected.value ? versionsFor(selected.value.id) : [])
const version = computed(() => versions.value.find(v=>v.id===versionId.value))
const trace=computed(()=>selected.value && version.value?buildDatasetTrace(state,selected.value.id,version.value.id):[])
const usageEvents=computed(()=>state.usageEvents.filter(item=>item.versionId===version.value?.id))
const downloadable = computed(() => version.value && allowed('download',version.value.datasetId) && canDownload(version.value,state.requests,state.role,selected.value))
function open(dataset) { selected.value=dataset; versionId.value=versionsFor(dataset.id)[0]?.id || ''; dialog.value=true }
watch(() => props.focus, target => {
  const dataset = target && datasets.value.find(item => item.id === target.datasetId)
  if (!dataset) return
  open(dataset)
  if (versionsFor(dataset.id).some(item => item.id === target.versionId)) versionId.value = target.versionId
}, {immediate:true})
function loginForVersion() { emit('login-required',{datasetId:selected.value.id,versionId:versionId.value}) }
function editDataset() { state.activeProjectId=selected.value.projectId; state.activeDataset=selected.value.id; state.focusVersion=versionId.value; dialog.value=false; emit('navigate','versions') }
function apply() {
  if (owned(selected.value)) return
  if (state.requests.some(r=>r.versionId===version.value.id && r.user===state.role && r.status==='待审批')) return ElMessage.warning('此版本已有待审批申请')
  requestVersion.value=version.value; formOpen.value=true
}
function submit(data) { if (submitUsageRequest(requestVersion.value,data)) formOpen.value=false }

</script>
<template>
  <div v-if="page==='plaza'" class="plaza-search"><el-input v-model="search" placeholder="搜索数据集名称或编号" aria-label="搜索数据集名称或编号" clearable><template #prefix><el-icon><Search /></el-icon></template></el-input></div>
  <section v-if="page==='plaza'" class="plaza-statistics" aria-label="数据广场统计">
    <div class="plaza-statistic"><span class="plaza-statistic-icon"><el-icon><Collection /></el-icon></span><div><span class="plaza-statistic-label">数据集总量</span><strong>{{ plazaStatistics.datasets.toLocaleString() }}<span>个</span></strong></div></div>
    <div class="plaza-statistic"><span class="plaza-statistic-icon teal"><el-icon><Files /></el-icon></span><div><span class="plaza-statistic-label">数据量</span><div class="plaza-statistic-values"><strong v-for="(total,unit) in plazaStatistics.records" :key="unit">{{ total.toLocaleString() }}<span>{{ unit }}</span></strong><strong v-if="!plazaStatistics.datasets">0</strong></div></div></div>
    <div class="plaza-statistic"><span class="plaza-statistic-icon purple"><el-icon><Download /></el-icon></span><div><span class="plaza-statistic-label">累计下载量</span><strong>{{ plazaStatistics.downloads.toLocaleString() }}<span>次</span></strong></div></div>
  </section>
  <section v-if="page==='plaza'" class="plaza-discovery">
    <div class="plaza-controls"><div class="plaza-filters"><el-select v-model="selectedType" placeholder="全部类型" aria-label="数据集类型" clearable><template #prefix><el-icon><Files /></el-icon></template><el-option v-for="type in datasetTypes" :key="type" :label="type" :value="type" /></el-select><el-select v-model="selectedIndustry" placeholder="一级领域" aria-label="一级领域" clearable><template #prefix><el-icon><Grid /></el-icon></template><el-option v-for="industry in datasetIndustries" :key="industry" :label="industry" :value="industry" /></el-select><el-select v-model="selectedSubindustry" placeholder="二级领域" aria-label="二级领域" clearable :disabled="!selectedIndustry"><template #prefix><el-icon><PriceTag /></el-icon></template><el-option v-for="industry in datasetSubindustries" :key="industry.id" :label="industry.name" :value="industry.id" /></el-select></div>
    <div class="plaza-sorting" role="group" aria-label="数据集排序"><button :class="{active:sortBy==='updated'}" :aria-pressed="sortBy==='updated'" @click="sortBy='updated'"><el-icon><Clock /></el-icon>最新更新</button><button :class="{active:sortBy==='downloads'}" :aria-pressed="sortBy==='downloads'" @click="sortBy='downloads'"><el-icon><Download /></el-icon>最多下载</button></div></div>
  </section>
  <section v-else class="directory-toolbar"><div class="toolbar"><el-input v-model="search" placeholder="搜索数据集名称或编号" clearable><template #prefix><el-icon><Search /></el-icon></template></el-input><el-radio-group v-if="page==='catalog'" v-model="scope"><el-radio-button v-for="name in ['全部','我的数据集','已获授权']" :key="name" :value="name">{{ name }}</el-radio-button></el-radio-group><span class="toolbar-spacer"></span><span class="muted">{{ datasets.length }} 个数据集</span></div></section>
  <section v-if="datasets.length" class="plaza-card-grid" :aria-label="page==='catalog'?'数据目录数据集':'数据广场数据集'">
    <article v-for="dataset in datasets.slice((plazaPage - 1) * 10, plazaPage * 10)" :key="dataset.id" class="plaza-dataset-card">
      <div class="plaza-card-heading">
        <span :class="['plaza-card-icon', dataset.coverTone || 'blue']" aria-hidden="true"><el-icon><component :is="dataset.coverIcon || (dataset.type==='图片'?'PictureFilled':dataset.type==='问答对'?'ChatDotRound':'Reading')" /></el-icon></span>
        <h3><button class="plaza-card-name" @click="open(dataset)">{{ dataset.name }}</button><el-tag v-if="latestReleaseFor(dataset)" size="small" type="info">{{ latestReleaseFor(dataset).release?.tag || `V${latestReleaseFor(dataset).number}` }}</el-tag><el-tag v-else-if="owned(dataset) && dataset.storageState!=='已归档'" size="small" type="warning">待发布</el-tag><el-tag v-if="dataset.storageState==='已归档'" type="info" size="small">已归档</el-tag></h3>
      </div>
      <div class="plaza-card-summary">
        <p v-description-overflow="dataset.id" class="plaza-description">{{ descriptionFor(dataset) }}</p>
        <button v-if="descriptionOverflow[dataset.id]" class="plaza-description-toggle" @click="open(dataset)">详情<el-icon><ArrowRight /></el-icon></button>
      </div>
      <div v-if="page==='catalog'" class="catalog-access-tags tags"><el-tag v-if="owned(dataset)" type="primary"><el-icon><FolderOpened /></el-icon>我的数据集</el-tag><el-tag v-else-if="approved(dataset.id)" type="success"><el-icon><CircleCheck /></el-icon>已获授权 · {{ authorizedVersions(dataset.id).length }} 个版本</el-tag></div>
      <div class="plaza-card-tags"><el-tag effect="plain">{{ typeFor(dataset) }}</el-tag><el-tag v-if="industryFor(dataset)" type="info" effect="plain">{{ industryFor(dataset) }}</el-tag><el-tag v-if="subindustryFor(dataset)" type="info" effect="plain">{{ subindustryFor(dataset) }}</el-tag></div>
      <div class="plaza-card-publisher"><span class="plaza-card-publisher-label">{{ latestReleaseFor(dataset)?'发布者':'创建者' }}</span><span>{{ publisherFor(dataset) }}</span></div>
      <div class="plaza-card-footer">
        <div class="plaza-card-counts">
          <span><el-icon aria-hidden="true"><Files /></el-icon>{{ (cardVersionFor(dataset)?.totalRecords ?? cardVersionFor(dataset)?.records.length ?? 0).toLocaleString() }} {{ dataset.type==='图片'?'张':'条' }}</span>
          <span><el-icon aria-hidden="true"><DocumentCopy /></el-icon>{{ versionsFor(dataset.id).length }} 个版本</span>
          <span><el-icon aria-hidden="true"><Download /></el-icon>{{ downloadsFor(dataset).toLocaleString() }} 次下载</span>
        </div>
        <time v-if="publishedTimeFor(dataset)" :datetime="publishedTimeFor(dataset).replaceAll('/','-').replace(' ','T')">{{ publishedLabelFor(dataset) }}</time>
      </div>
    </article>
  </section>

  <el-pagination v-if="datasets.length" v-model:current-page="plazaPage" :page-size="10" :pager-count="5" :total="datasets.length" layout="total, prev, pager, next" :aria-label="page==='catalog'?'数据目录分页':'数据广场分页'" class="plaza-pagination" />
  <section v-if="!datasets.length" class="panel"><el-empty :description="page==='catalog'?'暂无自己的或已获准使用的数据集':(search || selectedType || selectedIndustry ? '没有匹配的数据集' : '暂无已发布的共享数据集')"><el-button v-if="page==='catalog'" type="primary" @click="$emit('navigate','plaza')"><el-icon><Grid /></el-icon>去数据广场</el-button></el-empty></section>
  <el-drawer v-if="guest" v-model="dialog" :title="selected?.name" size="min(880px, 96vw)" class="public-dataset-detail">
    <template v-if="selected && version">
      <div class="detail-badges"><el-tag>{{ typeFor(selected) }}</el-tag><el-tag v-if="industryFor(selected)" type="info">{{ industryFor(selected) }}</el-tag><el-tag v-if="subindustryFor(selected)" type="info">{{ subindustryFor(selected) }}</el-tag></div>
      <p class="dataset-introduction">{{ descriptionFor(selected) }}</p>
      <div class="tags"><el-tag v-for="tag in selected.tags" :key="tag">{{ tag }}</el-tag></div>
      <el-descriptions :column="1" border>
        <el-descriptions-item label="数据集编号">{{ selected.code || selected.id }}</el-descriptions-item>
        <el-descriptions-item label="发布者">{{ publisherFor(selected) }}</el-descriptions-item>
        <el-descriptions-item label="版本"><el-select v-model="versionId" aria-label="查看发布版本"><el-option v-for="item in versions" :key="item.id" :value="item.id" :label="item.release?.tag || `V${item.number}`" /></el-select></el-descriptions-item>
        <el-descriptions-item label="数据量">{{ version.totalRecords.toLocaleString() }} {{ selected.type==='图片'?'张':'条' }}</el-descriptions-item>
        <el-descriptions-item label="下载量">{{ downloadsFor(selected).toLocaleString() }}</el-descriptions-item>
        <el-descriptions-item label="发布日期">{{ version.release?.publishedAt || version.published || version.created || '—' }}</el-descriptions-item>
      </el-descriptions>
      <div class="dialog-actions"><el-button @click="loginForVersion"><el-icon><DocumentChecked /></el-icon>登录后申请使用</el-button><el-button type="primary" @click="loginForVersion"><el-icon><Download /></el-icon>登录后下载</el-button></div>
    </template>
  </el-drawer>
  <el-drawer v-else v-model="dialog" :title="selected?.name" size="min(880px, 96vw)"><template v-if="selected"><div class="detail-badges"><el-tag>{{ typeFor(selected) }}</el-tag><el-tag type="info">{{ selected.project }}</el-tag><el-tag v-if="approved(selected.id)" type="success"><el-icon><CircleCheck /></el-icon>已获授权 · {{ authorizedVersions(selected.id).length }} 个版本</el-tag></div><el-descriptions :column="1" border><el-descriptions-item label="数据集编号">{{ selected.code }}</el-descriptions-item><el-descriptions-item label="数据来源">{{ selected.source || '—' }}</el-descriptions-item><el-descriptions-item label="一级领域">{{ industryFor(selected) }}</el-descriptions-item><el-descriptions-item v-if="subindustryFor(selected)" label="二级领域">{{ subindustryFor(selected) }}</el-descriptions-item><el-descriptions-item label="数据等级">{{ selected.level }}</el-descriptions-item><el-descriptions-item label="数据责任人">{{ selected.steward }}</el-descriptions-item></el-descriptions><div class="dataset-downloads dataset-detail-downloads"><el-icon><Download /></el-icon>下载量 {{ downloadsFor(selected).toLocaleString() }}</div><p class="dataset-introduction">{{ descriptionFor(selected) }}</p><div class="tags"><el-tag v-for="tag in selected.tags" :key="tag">{{ tag }}</el-tag></div><el-divider /><el-collapse class="dataset-history">
    <el-collapse-item name="trace" title="来源与流转"><el-timeline v-if="trace.length"><el-timeline-item v-for="item in trace" :key="item.id" :timestamp="item.time" placement="top"><h4><el-icon><component :is="item.icon" /></el-icon>{{ item.name.replace(/ · 待后端保障$/, '') }}</h4><p>{{ item.detail }}</p><span v-if="item.actor">{{ item.actor }}</span></el-timeline-item></el-timeline><el-empty v-else description="此版本尚无可追溯记录" /></el-collapse-item>
    <el-collapse-item name="evidence" title="发布依据"><template v-if="version?.release?.evidence"><div class="detail-badges"><span>{{ version.release.evidence.operator }} · {{ version.release.evidence.created }}</span></div><el-descriptions :column="2" border><el-descriptions-item label="数据集编号">{{ version.release.evidence.metadata.code }}</el-descriptions-item><el-descriptions-item label="数据等级">{{ version.release.evidence.metadata.level }}</el-descriptions-item><el-descriptions-item label="来源">{{ version.release.evidence.metadata.source }}</el-descriptions-item><el-descriptions-item label="责任人">{{ version.release.evidence.metadata.steward }}</el-descriptions-item></el-descriptions></template><el-empty v-else :description="version?.release?'此历史版本未记录发布信息':'此版本尚未发布'" /></el-collapse-item>
    <el-collapse-item name="usage" title="申请与使用"><el-table :data="state.requests.filter(item=>item.versionId===version?.id)" max-height="240"><el-table-column label="申请人" prop="applicant" /><el-table-column label="使用理由" prop="reason" min-width="200" /><el-table-column label="状态" prop="status" /><el-table-column label="审批意见" prop="note" min-width="180" /><el-table-column label="申请时间" prop="created" width="180" /><el-table-column label="审批时间" prop="approved" width="180" /></el-table><el-table :data="usageEvents" max-height="280"><el-table-column label="操作" prop="action" /><el-table-column label="用户" prop="user" /><el-table-column label="状态" prop="status" /><el-table-column label="说明" prop="detail" min-width="200" /><el-table-column label="时间" prop="created" width="180" /></el-table></el-collapse-item><el-collapse-item name="history"><template #title><span class="history-title"><el-icon><DocumentCopy /></el-icon>版本历史 <el-tag type="info">{{ versions.length }}</el-tag></span></template><button v-for="item in versions" :key="item.id" class="history-row" :class="{active:item.id===versionId}" @click="versionId=item.id"><span><el-icon><PriceTag /></el-icon>{{ item.release?.tag || `V${item.number}` }}</span><span>{{ item.release?.title || item.type }}</span><el-tag :type="item.status==='已发布'?'success':'info'">{{ item.status }}</el-tag><el-tag v-if="versionApproved(item)" type="success">已获授权</el-tag></button></el-collapse-item></el-collapse>
  <div v-if="version" class="catalog-detail-content"><div class="section-title"><h3><el-icon><Files /></el-icon>内容预览</h3><el-select v-model="versionId" style="width:230px"><el-option v-for="item in versions" :key="item.id" :value="item.id" :label="`${item.release?.tag || `V${item.number}`} · ${(item.totalRecords ?? item.records.length).toLocaleString()}条`" /></el-select></div><section v-if="version.release" class="release-info"><h3>{{ version.release.title }}</h3><p class="release-meta">{{ version.release.publisher }} · {{ version.release.publishedAt }}</p><div class="release-notes">{{ version.release.notes }}</div></section><el-scrollbar max-height="340px"><article v-for="(record,index) in version.records" :key="index" class="record-preview"><small class="muted">第 {{ index+1 }} 条</small><h4>{{ record.question || record.title || '数据内容' }}</h4><img v-if="record.image" :src="record.image" :alt="record.title || record.label || '数据图片'" class="catalog-sample-image" /><p>{{ record.correctedAnswer || record.answer || record.content || JSON.stringify(record) }}</p></article></el-scrollbar><div class="dialog-actions"><el-button v-if="owned(selected) && allowed('edit',selected.id)" @click="editDataset"><el-icon><EditPen /></el-icon>在项目中管理</el-button><template v-if="version.status==='已发布'"><el-button v-if="!owned(selected) && !downloadable" type="primary" @click="apply"><el-icon><DocumentChecked /></el-icon>申请使用此版本</el-button><el-button v-else-if="downloadable" type="primary" @click="downloadVersion(version)"><el-icon><Download /></el-icon>下载此版本</el-button></template></div><p v-if="!owned(selected) && !downloadable && version.status==='已发布'" class="muted">使用授权对应具体版本，其他版本需要单独申请。</p></div><el-empty v-else description="暂无数据集版本，先在项目中建设数据" /></template></el-drawer>
  <FormDialog v-model="formOpen" title="申请使用数据" :fields="requestFields" :initial="{applicant:state.role}" confirm-text="提交申请" @save="submit" />
</template>
