<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { state, allowed, openProject, downloadVersion, notify, projectDictionary } from '../store'
import { libraryDatasets } from '../workspace'
import { uid, now } from '../domain'
import FormDialog from './FormDialog.vue'
const props = defineProps({ mode: String })
const emit = defineEmits(['navigate'])
const search = ref('')
const selectedId = ref('')
const detail = ref(false)
const versionId = ref('')
const requestDialog = ref(false)
const requestTarget = ref(null)
const items = computed(() => libraryDatasets(state, props.mode, state.role, id => allowed('view', id)).filter(item => `${item.dataset.name}${item.dataset.code}${item.dataset.tags.join(' ')}`.includes(search.value)))
const selected = computed(() => items.value.find(item => item.dataset.id === selectedId.value))
function metadataName(key) {
  return projectDictionary(selected.value?.dataset.projectId).find(term => term.field === key)?.name
    || state.terms.find(term => term.field === key)?.name || key
}
const version = computed(() => selected.value?.versions.find(item => item.id === versionId.value))
const requestFields = [{ key: 'applicant', label: '申请人', required: true }, { key: 'department', label: '部门', required: true }, { key: 'reason', label: '使用理由', required: true, type: 'textarea' }]
function show(item) { selectedId.value = item.dataset.id; versionId.value = item.latest?.id || ''; detail.value = true }
watch(() => props.mode, () => { detail.value = false; search.value = '' })
watch(() => state.role, () => { detail.value = false; requestDialog.value = false })
watch(items, rows => { if (state.ui.libraryFocus) { const row = rows.find(item => item.dataset.id === state.ui.libraryFocus); if (row) show(row); delete state.ui.libraryFocus } }, { immediate: true })
function enter(item, page = 'planning') {
  if (openProject(item.dataset.projectId, item.dataset.id)) { if (page === 'review') state.focusVersion = item.pending[0]?.id; emit('navigate', page) }
}
function apply() {
  if (!version.value || version.value.status !== '已发布') return
  if (state.requests.some(r => r.versionId === version.value.id && r.user === state.role && r.status === '待审批')) return ElMessage.warning('此版本已有待审批申请')
  requestTarget.value = { versionId: version.value.id, datasetId: selected.value.dataset.id, projectId: selected.value.dataset.projectId }
  requestDialog.value = true
}
function sendRequest(data) {
  if (!requestTarget.value) return
  state.requests.unshift({ ...data, ...requestTarget.value, id: uid('request'), user: state.role, status: '待审批', created: now() })
  requestDialog.value = false; notify('使用申请已提交，审批通过后将出现在数据目录')
}
const authorized = computed(() => version.value && state.requests.some(r => r.versionId === version.value.id && r.user === state.role && r.status === '已通过'))
async function approve(request, pass) {
  if (!allowed('review', request.datasetId)) return
  try { const { value } = await ElMessageBox.prompt('请填写审批意见', pass ? '通过申请' : '驳回申请', { inputValidator: v => Boolean(v?.trim()) || '请填写审批意见' }); request.status = pass ? '已通过' : '已驳回'; request.note = value; request.approvedBy = state.role; request.approved = now(); notify('审批结果已保存') } catch {}
}
const requests = computed(() => state.requests.filter(r => allowed('view', r.datasetId) && (r.user === state.role || allowed('review', r.datasetId))))
</script>

<template>
  <section v-if="mode === 'requests'" class="panel"><div class="section-title"><div><h3>使用申请与审批</h3><p>全局汇总申请，授权绑定申请中的固定版本。</p></div></div><el-table :data="requests"><el-table-column label="数据集" min-width="220"><template #default="{row}">{{ state.datasets.find(d => d.id === row.datasetId)?.name }}</template></el-table-column><el-table-column label="申请人" prop="applicant" /><el-table-column label="状态" prop="status" /><el-table-column label="申请理由" prop="reason" /><el-table-column label="操作" width="180"><template #default="{row}"><template v-if="row.status === '待审批' && allowed('review', row.datasetId)"><el-button link type="primary" @click="approve(row,true)">通过</el-button><el-button link type="danger" @click="approve(row,false)">驳回</el-button></template><el-button v-else-if="row.status === '已通过' && row.user === state.role" link type="primary" @click="downloadVersion(state.versions.find(v => v.id === row.versionId))">下载获批版本</el-button><span v-else>{{ row.note || '等待处理' }}</span></template></el-table-column></el-table></section>
  <template v-else>
    <section class="panel"><div class="toolbar"><el-input v-model="search" placeholder="搜索数据集、编号或标签" clearable /><span class="muted">共 {{ items.length }} 个数据集 · 每个数据集聚合展示</span></div><p class="muted">{{ mode === 'catalog' ? '这里是您拥有或申请获批的数据集。发现更多成果请进入数据广场。' : mode === 'square' ? '探索已发布成果，预览后申请使用指定版本。' : mode === 'audit' ? '跨项目查看待审核成果，打开后进入对应项目完成审核。' : '查看自己拥有的数据集，打开所属项目继续建设。' }}</p></section>
    <div class="catalog-grid"><article v-for="item in items" :key="item.dataset.id" class="catalog-card" @click="show(item)"><div class="catalog-card-top"><span class="icon-tile blue"><el-icon><FolderOpened /></el-icon></span><el-tag :type="item.owned ? 'info' : 'success'">{{ item.owned ? '我拥有的' : mode === 'catalog' ? '已获授权' : '已发布' }}</el-tag></div><small class="muted">{{ item.dataset.code }} · {{ item.dataset.project }}</small><h3>{{ item.dataset.name }}</h3><p>{{ item.dataset.demand }}</p><div class="tags"><el-tag v-for="tag in item.dataset.tags" :key="tag" type="info">{{ tag }}</el-tag></div><div class="catalog-card-footer"><span>{{ mode === 'audit' ? `${item.pending.length}个待审核版本` : item.latest ? `${item.latest.records.length}条 · ${item.latest.release?.tag || `V${item.latest.number}`}` : '建设中' }}</span><el-button v-if="mode === 'audit'" link type="primary" @click.stop="enter(item, 'review')">打开审核</el-button><el-button v-else link type="primary">查看详情<el-icon><ArrowRight /></el-icon></el-button></div></article></div><el-empty v-if="!items.length" description="暂无符合当前范围的数据集" />
  </template>
  <el-drawer v-model="detail" :title="selected?.dataset.name || '数据集详情'" size="680"><template v-if="selected"><p class="muted">{{ selected.dataset.code }} · {{ selected.dataset.project }}</p><h3 class="spaced">数据集介绍</h3><p>{{ selected.dataset.demand }}</p><div class="tags"><el-tag v-for="tag in selected.dataset.tags" :key="tag">{{ tag }}</el-tag></div><el-descriptions class="spaced" :column="1" border><el-descriptions-item label="用途">{{ selected.dataset.scene }}</el-descriptions-item><el-descriptions-item label="所有者">{{ selected.dataset.ownerId }}</el-descriptions-item><el-descriptions-item v-for="(value,key) in selected.dataset.metadata" :key="key" :label="metadataName(key)">{{ value }}</el-descriptions-item></el-descriptions>
    <details class="version-history"><summary>版本历史 · {{ selected.versions.length }} 个可见版本</summary><div v-for="v in selected.versions" :key="v.id" class="version-history-row"><span>V{{ v.number }} · {{ v.release?.tag || v.status }}</span><el-button link type="primary" @click="versionId = v.id">查看此版本</el-button></div></details>
    <template v-if="version"><h3 class="spaced">{{ version.release?.title || `V${version.number} · ${version.type}` }}</h3><p>{{ version.release?.notes }}</p><pre>{{ JSON.stringify(version.records.slice(0,3),null,2) }}</pre><div class="dialog-actions" v-if="version.status === '已发布'"><el-button v-if="!authorized" type="primary" @click="apply">申请使用此版本</el-button><el-button :disabled="!authorized || !allowed('download', selected.dataset.id)" @click="downloadVersion(version)">下载获批版本</el-button></div></template>
    <el-button v-if="selected.owned" class="spaced" type="primary" plain @click="enter(selected)">打开项目继续建设<el-icon><ArrowRight /></el-icon></el-button>
  </template></el-drawer>
  <FormDialog v-model="requestDialog" title="申请使用数据集版本" :fields="requestFields" :initial="{applicant:state.role}" @save="sendRequest" />
</template>
