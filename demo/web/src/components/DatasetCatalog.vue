<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { state, allowed, notify, downloadVersion } from '../store'
import { isDatasetVersion, canDownload, uid, now } from '../domain'
import FormDialog from './FormDialog.vue'
const props = defineProps({ page: String })
const emit = defineEmits(['navigate'])
const search = ref('')
const scope = ref('全部')
const selected = ref(null)
const versionId = ref('')
const dialog = ref(false)
const requestVersion = ref(null)
const formOpen = ref(false)
const requestFields = [{ key: 'applicant', label: '申请人', required: true }, { key: 'department', label: '部门', required: true }, { key: 'reason', label: '使用理由', required: true, type: 'textarea' }]
const owned = d => (d.owner || '管理员') === state.role
const approved = id => state.requests.some(r => r.datasetId === id && r.user === state.role && r.status === '已通过')
const versionsFor = id => state.versions.filter(v => v.datasetId === id && isDatasetVersion(v) && (props.page === 'plaza' || !owned(state.datasets.find(d=>d.id===id)) ? v.status === '已发布' : true)).sort((a,b)=>b.number-a.number)
const datasets = computed(() => state.datasets.filter(d => allowed('view',d.id) && d.name.includes(search.value) && (props.page === 'plaza' ? versionsFor(d.id).length : owned(d) || approved(d.id)) && (scope.value === '全部' || (scope.value === '我的数据集' ? owned(d) : approved(d.id)))))
const versions = computed(() => selected.value ? versionsFor(selected.value.id) : [])
const version = computed(() => versions.value.find(v=>v.id===versionId.value))
const downloadable = computed(() => version.value && allowed('download',version.value.datasetId) && canDownload(version.value,state.requests,state.role))
function open(dataset) { selected.value=dataset; versionId.value=versionsFor(dataset.id)[0]?.id || ''; dialog.value=true }
function editDataset() { state.activeProject=selected.value.projectId; state.activeDataset=selected.value.id; state.focusVersion=versionId.value; dialog.value=false; emit('navigate','versions') }
function apply() {
  if (state.requests.some(r=>r.versionId===version.value.id && r.user===state.role && r.status==='待审批')) return ElMessage.warning('此版本已有待审批申请')
  requestVersion.value=version.value; formOpen.value=true
}
function submit(data) { state.requests.unshift({id:uid('request'),datasetId:requestVersion.value.datasetId,versionId:requestVersion.value.id,user:state.role,...data,status:'待审批',created:now()}); formOpen.value=false; notify('使用申请已提交') }
</script>
<template>
  <section class="panel directory-toolbar"><div class="toolbar"><el-input v-model="search" placeholder="搜索数据集名称" clearable><template #prefix><el-icon><Search /></el-icon></template></el-input><el-radio-group v-if="page==='catalog'" v-model="scope"><el-radio-button v-for="name in ['全部','我的数据集','已获授权']" :key="name" :value="name">{{ name }}</el-radio-button></el-radio-group><span class="toolbar-spacer"></span><span class="muted">{{ datasets.length }} 个数据集 · 版本在详情中查看</span></div></section>
  <div class="catalog-grid"><article v-for="dataset in datasets" :key="dataset.id" class="catalog-card" @click="open(dataset)"><div class="dataset-cover" :class="{teal:dataset.type==='图片'}"><el-icon><component :is="dataset.type==='图片'?'PictureFilled':dataset.type==='问答对'?'ChatDotRound':'Reading'" /></el-icon><span>{{ dataset.type }}数据集</span><span class="cover-lines"></span></div><div class="catalog-card-top"><el-tag :type="owned(dataset)?'primary':'success'"><el-icon><component :is="owned(dataset)?'FolderOpened':'CircleCheck'" /></el-icon>{{ owned(dataset)?'我的数据集':approved(dataset.id)?'已获授权':'可申请使用' }}</el-tag><span class="muted">{{ dataset.project }}</span></div><h3>{{ dataset.name }}</h3><p>{{ dataset.scene }}</p><div class="tags"><el-tag v-for="tag in dataset.tags" :key="tag" type="info">{{ tag }}</el-tag></div><div class="catalog-card-footer"><span><el-icon><DocumentCopy /></el-icon>{{ versionsFor(dataset.id).length }} 个版本</span><el-button link type="primary">查看数据集<el-icon><ArrowRight /></el-icon></el-button></div></article></div>
  <section v-if="!datasets.length" class="panel"><el-empty :description="page==='catalog'?'暂无自己的或已获准使用的数据集':'暂无已发布的共享数据集'"><el-button v-if="page==='catalog'" type="primary" @click="$emit('navigate','plaza')"><el-icon><Grid /></el-icon>去数据广场</el-button></el-empty></section>
  <el-drawer v-model="dialog" :title="selected?.name" size="min(880px, 96vw)"><template v-if="selected"><div class="detail-badges"><el-tag>{{ selected.type }}</el-tag><el-tag type="info">{{ selected.project }}</el-tag></div><p>{{ selected.demand }}</p><div class="tags"><el-tag v-for="tag in selected.tags" :key="tag">{{ tag }}</el-tag></div><el-divider /><el-collapse class="dataset-history"><el-collapse-item name="history"><template #title><span class="history-title"><el-icon><DocumentCopy /></el-icon>版本历史 <el-tag type="info">{{ versions.length }}</el-tag></span></template><button v-for="item in versions" :key="item.id" class="history-row" :class="{active:item.id===versionId}" @click="versionId=item.id"><span><el-icon><PriceTag /></el-icon>{{ item.release?.tag || `V${item.number}` }}</span><span>{{ item.release?.title || item.type }}</span><el-tag :type="item.status==='已发布'?'success':'info'">{{ item.status }}</el-tag></button></el-collapse-item></el-collapse>
  <div v-if="version" class="catalog-detail-content"><div class="section-title"><h3><el-icon><Files /></el-icon>当前内容</h3><el-select v-model="versionId" style="width:230px"><el-option v-for="item in versions" :key="item.id" :value="item.id" :label="`${item.release?.tag || `V${item.number}`} · ${item.records.length}条`" /></el-select></div><section v-if="version.release" class="release-info"><h3>{{ version.release.title }}</h3><p class="release-meta">{{ version.release.publisher }} · {{ version.release.publishedAt }}</p><div class="release-notes">{{ version.release.notes }}</div></section><el-scrollbar max-height="340px"><article v-for="(record,index) in version.records" :key="index" class="record-preview"><small class="muted">第 {{ index+1 }} 条</small><h4>{{ record.question || record.title || '数据内容' }}</h4><p>{{ record.correctedAnswer || record.answer || record.content || JSON.stringify(record) }}</p></article></el-scrollbar><div class="dialog-actions"><el-button v-if="owned(selected) && allowed('edit',selected.id)" @click="editDataset"><el-icon><EditPen /></el-icon>在项目中管理</el-button><template v-if="version.status==='已发布'"><el-button v-if="!downloadable" type="primary" @click="apply"><el-icon><DocumentChecked /></el-icon>申请使用此版本</el-button><el-button v-else type="primary" @click="downloadVersion(version)"><el-icon><Download /></el-icon>下载此版本</el-button></template></div><p v-if="!downloadable && version.status==='已发布'" class="muted">使用授权对应具体版本，其他版本需要单独申请。</p></div><el-empty v-else description="暂无数据集版本，先在项目中建设数据" /></template></el-drawer>
  <FormDialog v-model="formOpen" title="申请使用数据" :fields="requestFields" :initial="{applicant:state.role}" confirm-text="提交申请" @save="submit" />
</template>
