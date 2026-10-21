<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { state, allowed, notify, downloadVersion } from '../store'
import { isDatasetVersion, canDownload, uid, now, isDatasetOwner, isVersionAuthorized } from '../domain'
import FormDialog from './FormDialog.vue'
const props = defineProps({ page: String })
const emit = defineEmits(['navigate'])
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
const sortBy = ref('updated')
const plazaPage = ref(1)
watch([search, selectedType, selectedIndustry, sortBy, () => state.role], () => { plazaPage.value = 1 })
const descriptionFor = dataset => dataset.introduction || dataset.demand || dataset.scene || ''
const scope = ref('全部')
const selected = ref(null)
const versionId = ref('')
const dialog = ref(false)
const requestVersion = ref(null)
const formOpen = ref(false)
const requestFields = [{ key: 'applicant', label: '申请人', required: true }, { key: 'department', label: '部门', required: true }, { key: 'reason', label: '使用理由', required: true, type: 'textarea' }]
const owned = d => isDatasetOwner(d, state.role)
const versionApproved = version => isVersionAuthorized(version, state.requests, state.role, state.datasets.find(d => d.id === version.datasetId))
const authorizedVersions = id => state.versions.filter(v => v.datasetId === id && isDatasetVersion(v) && v.status === '已发布' && versionApproved(v))
const approved = id => authorizedVersions(id).length > 0
const versionsFor = id => state.versions.filter(v => v.datasetId === id && isDatasetVersion(v) && (props.page === 'plaza' || !owned(state.datasets.find(d=>d.id===id)) ? v.status === '已发布' : true)).sort((a,b)=>b.number-a.number)
const latestReleaseFor = dataset => versionsFor(dataset.id).find(version => version.status === '已发布')
const publisherFor = dataset => dataset.publisherId || versionsFor(dataset.id).find(version => version.status === '已发布')?.release?.publisher || dataset.owner || '管理员'
const plazaDatasets = computed(() => state.datasets.filter(dataset => allowed('view',dataset.id) && versionsFor(dataset.id).length))
const datasetTypes = computed(() => [...new Set(plazaDatasets.value.map(dataset => dataset.type))])
const datasetIndustries = computed(() => [...new Set(plazaDatasets.value.map(dataset => dataset.industry || dataset.project).filter(Boolean))])
const publishedTimeFor = dataset => { const version = latestReleaseFor(dataset); return version?.release?.publishedAt || version?.published || version?.created || '' }
const updatedTime = dataset => Date.parse(publishedTimeFor(dataset).replaceAll('/','-').replace(' ','T')) || 0
const publishedLabelFor = dataset => { const date = publishedTimeFor(dataset).match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/); return date ? `发布于：${date[1]}年${Number(date[2])}月${Number(date[3])}日` : '—' }
const datasets = computed(() => {
  const rows = state.datasets.filter(dataset => allowed('view',dataset.id) && dataset.name.toLowerCase().includes(search.value.trim().toLowerCase()) && (props.page === 'plaza' ? versionsFor(dataset.id).length : owned(dataset) || approved(dataset.id)) && (props.page === 'plaza' || scope.value === '全部' || (scope.value === '我的数据集' ? owned(dataset) : approved(dataset.id))))
  if (props.page !== 'plaza') return rows
  return rows.filter(dataset => (!selectedType.value || dataset.type === selectedType.value) && (!selectedIndustry.value || (dataset.industry || dataset.project) === selectedIndustry.value)).sort((a,b) => sortBy.value === 'downloads' ? (b.downloads || 0) - (a.downloads || 0) || updatedTime(b) - updatedTime(a) : updatedTime(b) - updatedTime(a) || (b.downloads || 0) - (a.downloads || 0))
})
watch(() => datasets.value.length, total => { plazaPage.value = Math.min(plazaPage.value, Math.max(1, Math.ceil(total / 10))) })
const versions = computed(() => selected.value ? versionsFor(selected.value.id) : [])
const version = computed(() => versions.value.find(v=>v.id===versionId.value))
const downloadable = computed(() => version.value && allowed('download',version.value.datasetId) && canDownload(version.value,state.requests,state.role,selected.value))
function open(dataset) { selected.value=dataset; versionId.value=versionsFor(dataset.id)[0]?.id || ''; dialog.value=true }
function editDataset() { state.activeProject=selected.value.projectId; state.activeDataset=selected.value.id; state.focusVersion=versionId.value; dialog.value=false; emit('navigate','versions') }
function apply() {
  if (owned(selected.value)) return
  if (state.requests.some(r=>r.versionId===version.value.id && r.user===state.role && r.status==='待审批')) return ElMessage.warning('此版本已有待审批申请')
  requestVersion.value=version.value; formOpen.value=true
}
function submit(data) { state.requests.unshift({id:uid('request'),datasetId:requestVersion.value.datasetId,versionId:requestVersion.value.id,user:state.role,...data,status:'待审批',created:now()}); formOpen.value=false; notify('使用申请已提交') }
</script>
<template>
  <section v-if="page==='plaza'" class="plaza-discovery">
    <div class="plaza-search"><el-input v-model="search" placeholder="搜索数据集名称" aria-label="搜索数据集名称" clearable><template #prefix><el-icon><Search /></el-icon></template></el-input></div>
    <div class="plaza-controls"><div class="plaza-filters"><el-select v-model="selectedType" placeholder="全部类型" aria-label="数据集类型" clearable><template #prefix><el-icon><Files /></el-icon></template><el-option v-for="type in datasetTypes" :key="type" :label="type" :value="type" /></el-select><el-select v-model="selectedIndustry" placeholder="全部领域" aria-label="数据集领域" clearable><template #prefix><el-icon><Grid /></el-icon></template><el-option v-for="industry in datasetIndustries" :key="industry" :label="industry" :value="industry" /></el-select></div>
    <div class="plaza-sorting" role="group" aria-label="数据集排序"><button :class="{active:sortBy==='updated'}" :aria-pressed="sortBy==='updated'" @click="sortBy='updated'"><el-icon><Clock /></el-icon>最新更新</button><button :class="{active:sortBy==='downloads'}" :aria-pressed="sortBy==='downloads'" @click="sortBy='downloads'"><el-icon><Download /></el-icon>最多下载</button></div></div>
  </section>
  <section v-else class="directory-toolbar"><div class="toolbar"><el-input v-model="search" placeholder="搜索数据集名称" clearable><template #prefix><el-icon><Search /></el-icon></template></el-input><el-radio-group v-if="page==='catalog'" v-model="scope"><el-radio-button v-for="name in ['全部','我的数据集','已获授权']" :key="name" :value="name">{{ name }}</el-radio-button></el-radio-group><span class="toolbar-spacer"></span><span class="muted">{{ datasets.length }} 个数据集</span></div></section>
  <div v-if="page==='plaza' && datasets.length" class="recommendation-table-wrap plaza-list"><table class="recommendation-table plaza-table"><thead><tr><th scope="col">数据集名称</th><th scope="col">类型</th><th scope="col">领域</th><th scope="col">发布者</th><th scope="col" class="numeric">版本数</th><th scope="col" class="numeric">下载量</th></tr></thead><tbody><tr v-for="dataset in datasets.slice((plazaPage - 1) * 10, plazaPage * 10)" :key="dataset.id"><td><button class="recommendation-name" @click="open(dataset)"><el-icon :class="dataset.coverTone || 'blue'"><component :is="dataset.coverIcon || (dataset.type==='图片'?'PictureFilled':dataset.type==='问答对'?'ChatDotRound':'Reading')" /></el-icon><span>{{ dataset.name }}</span><el-tag v-if="latestReleaseFor(dataset)" size="small" type="info" class="plaza-version-tag">{{ latestReleaseFor(dataset).release?.tag || `V${latestReleaseFor(dataset).number}` }}</el-tag></button><div class="plaza-introduction" :class="{'is-complete':descriptionOverflow[dataset.id] === false}"><p v-description-overflow="dataset.id" class="plaza-description">{{ descriptionFor(dataset) }}</p><div class="plaza-description-footer"><button v-if="descriptionOverflow[dataset.id]" class="plaza-description-toggle" @click="open(dataset)">详情<el-icon><ArrowRight /></el-icon></button><time class="plaza-release-time" :datetime="publishedTimeFor(dataset).replaceAll('/','-').replace(' ','T')"><el-icon><Clock /></el-icon>{{ publishedLabelFor(dataset) }}</time></div></div></td><td>{{ dataset.type }}</td><td>{{ dataset.industry || dataset.project }}</td><td>{{ publisherFor(dataset) }}</td><td class="numeric">{{ versionsFor(dataset.id).length }}</td><td class="numeric"><span class="dataset-downloads" aria-label="下载量"><el-icon><Download /></el-icon>{{ (dataset.downloads || 0).toLocaleString() }}</span></td></tr></tbody></table></div>
  <div v-else-if="page==='catalog'" class="catalog-grid"><article v-for="dataset in datasets" :key="dataset.id" class="catalog-card" @click="open(dataset)"><div class="dataset-cover" :class="dataset.coverTone || (dataset.type==='图片'?'teal':'blue')"><el-icon><component :is="dataset.coverIcon || (dataset.type==='图片'?'PictureFilled':dataset.type==='问答对'?'ChatDotRound':'Reading')" /></el-icon><span>{{ dataset.type }}数据集</span><span class="cover-lines"></span></div><div class="catalog-card-top"><div class="catalog-access-tags"><el-tag v-if="owned(dataset)" type="primary"><el-icon><FolderOpened /></el-icon>我的数据集</el-tag><el-tag v-if="approved(dataset.id)" type="success"><el-icon><CircleCheck /></el-icon>已获授权 · {{ authorizedVersions(dataset.id).length }} 个版本</el-tag><el-tag v-if="!owned(dataset) && !approved(dataset.id)" type="info">可申请使用</el-tag></div><span class="muted">{{ dataset.project }}</span></div><h3>{{ dataset.name }}</h3><p>{{ dataset.scene }}</p><div class="tags"><el-tag v-for="tag in dataset.tags" :key="tag" type="info">{{ tag }}</el-tag></div><div class="catalog-card-footer"><span><el-icon><DocumentCopy /></el-icon>{{ versionsFor(dataset.id).length }} 个版本</span><span class="dataset-downloads" aria-label="下载量"><el-icon><Download /></el-icon>{{ (dataset.downloads || 0).toLocaleString() }} 次下载</span><el-button link type="primary">查看数据集<el-icon><ArrowRight /></el-icon></el-button></div></article></div>
  <el-pagination v-if="page==='plaza' && datasets.length" v-model:current-page="plazaPage" :page-size="10" :pager-count="5" :total="datasets.length" layout="total, prev, pager, next" aria-label="数据广场分页" class="plaza-pagination" />
  <section v-if="!datasets.length" class="panel"><el-empty :description="page==='catalog'?'暂无自己的或已获准使用的数据集':(search || selectedType || selectedIndustry ? '没有匹配的数据集' : '暂无已发布的共享数据集')"><el-button v-if="page==='catalog'" type="primary" @click="$emit('navigate','plaza')"><el-icon><Grid /></el-icon>去数据广场</el-button></el-empty></section>
  <el-drawer v-model="dialog" :title="selected?.name" size="min(880px, 96vw)"><template v-if="selected"><div class="detail-badges"><el-tag>{{ selected.type }}</el-tag><el-tag type="info">{{ selected.project }}</el-tag><el-tag v-if="approved(selected.id)" type="success"><el-icon><CircleCheck /></el-icon>已获授权 · {{ authorizedVersions(selected.id).length }} 个版本</el-tag></div><div class="dataset-downloads dataset-detail-downloads"><el-icon><Download /></el-icon>下载量 {{ (selected.downloads || 0).toLocaleString() }}</div><p class="dataset-introduction">{{ descriptionFor(selected) }}</p><div class="tags"><el-tag v-for="tag in selected.tags" :key="tag">{{ tag }}</el-tag></div><el-divider /><el-collapse class="dataset-history"><el-collapse-item name="history"><template #title><span class="history-title"><el-icon><DocumentCopy /></el-icon>版本历史 <el-tag type="info">{{ versions.length }}</el-tag></span></template><button v-for="item in versions" :key="item.id" class="history-row" :class="{active:item.id===versionId}" @click="versionId=item.id"><span><el-icon><PriceTag /></el-icon>{{ item.release?.tag || `V${item.number}` }}</span><span>{{ item.release?.title || item.type }}</span><el-tag :type="item.status==='已发布'?'success':'info'">{{ item.status }}</el-tag><el-tag v-if="versionApproved(item)" type="success">已获授权</el-tag></button></el-collapse-item></el-collapse>
  <div v-if="version" class="catalog-detail-content"><div class="section-title"><h3><el-icon><Files /></el-icon>内容预览</h3><el-select v-model="versionId" style="width:230px"><el-option v-for="item in versions" :key="item.id" :value="item.id" :label="`${item.release?.tag || `V${item.number}`} · ${(item.totalRecords ?? item.records.length).toLocaleString()}条`" /></el-select></div><section v-if="version.release" class="release-info"><h3>{{ version.release.title }}</h3><p class="release-meta">{{ version.release.publisher }} · {{ version.release.publishedAt }}</p><div class="release-notes">{{ version.release.notes }}</div></section><el-scrollbar max-height="340px"><article v-for="(record,index) in version.records" :key="index" class="record-preview"><small class="muted">第 {{ index+1 }} 条</small><h4>{{ record.question || record.title || '数据内容' }}</h4><img v-if="record.image" :src="record.image" :alt="record.title || record.label || '数据图片'" class="catalog-sample-image" /><p>{{ record.correctedAnswer || record.answer || record.content || JSON.stringify(record) }}</p></article></el-scrollbar><div class="dialog-actions"><el-button v-if="owned(selected) && allowed('edit',selected.id)" @click="editDataset"><el-icon><EditPen /></el-icon>在项目中管理</el-button><template v-if="version.status==='已发布'"><el-button v-if="!owned(selected) && !downloadable" type="primary" @click="apply"><el-icon><DocumentChecked /></el-icon>申请使用此版本</el-button><el-button v-else-if="downloadable" type="primary" @click="downloadVersion(version)"><el-icon><Download /></el-icon>下载此版本</el-button></template></div><p v-if="!owned(selected) && !downloadable && version.status==='已发布'" class="muted">使用授权对应具体版本，其他版本需要单独申请。</p></div><el-empty v-else description="暂无数据集版本，先在项目中建设数据" /></template></el-drawer>
  <FormDialog v-model="formOpen" title="申请使用数据" :fields="requestFields" :initial="{applicant:state.role}" confirm-text="提交申请" @save="submit" />
</template>
