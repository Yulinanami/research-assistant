<script setup>
import { ref, computed } from 'vue'
import { ElMessageBox } from 'element-plus'
import { state, requireAction, notify, allowed, saveClassification, removeClassification, classifyDataset } from '../store'
import { classificationUses } from '../domain'
import FormDialog from './GovernanceFormDialog.vue'
defineProps({ page: String })
const classificationKind = ref('domain')
const classificationRoots = computed(()=>state.classifications.filter(item=>item.kind==='domain' && !item.parentId))
const classificationRows = computed(()=> {
  const matches = row => `${row.name} ${row.code} ${row.description || ''}`.includes(search.value.trim())
  if (classificationKind.value==='type') return state.classifications.filter(item=>item.kind==='type' && matches(item))
  return classificationRoots.value.map(root=>({...root,children:state.classifications.filter(item=>item.parentId===root.id && (matches(root) || matches(item)))})).filter(root=>matches(root) || root.children.length)
})
const categoryUses = id => classificationUses(state,id).filter(dataset=>allowed('view',dataset.id))
const search = ref('')
const dialog = ref(false)
const fields = ref([])
const initial = ref({})
const dialogTitle = ref('')
let handler
const isAdmin = computed(() => state.role === '管理员')
const targetDataset = ref(state.activeDataset)
const historyOpen=ref(false)
const historyRows=ref([])
const historyTitle=ref('')
function history(row) {historyRows.value=state.standardVersions.filter(item=>item.collection==='classifications' && item.standardId===row.id).sort((a,b)=>b.revision-a.revision);historyTitle.value=row.name;historyOpen.value=true}
function editClassification(row, parent) {
  if (!isAdmin.value || !requireAction('edit')) return
  const kind=row?.kind || classificationKind.value
  fields.value=[{key:'name',label:'分类名称',required:true},{key:'code',label:'分类代码',required:true}]
  if (kind==='domain') fields.value.push({key:'parentId',label:'上级领域',type:'select',options:[{label:'无（一级领域）',value:''},...classificationRoots.value.filter(item=>item.id!==row?.id && item.enabled!==false).map(item=>({label:item.name,value:item.id}))],default:parent?.id || ''})
  fields.value.push({key:'description',label:'分类说明',type:'textarea'},{key:'enabled',label:'启用',type:'switch',default:true})
  initial.value=row || {};dialogTitle.value=`${row?'编辑':'新增'}${kind==='domain'?'领域':'数据类型'}`
  handler=data=>saveClassification(row,{...data,kind,parentId:kind==='type'?'':data.parentId})
  dialog.value=true
}
async function deleteCategory(row) {
  if (!isAdmin.value) return
  try {await ElMessageBox.confirm(`确定删除分类“${row.name}”？`,'删除分类',{type:'warning'});removeClassification(row)} catch {}
}
function chooseDatasetClassification() {
  if (!requireAction('edit')) return
  const available=state.datasets.filter(dataset=>allowed('edit',dataset.id))
  const dataset=available.find(item=>item.id===targetDataset.value) || available[0]
  if (!dataset) return
  const rootOptions=()=>classificationRoots.value.filter(item=>item.enabled!==false).map(item=>({label:item.name,value:item.id}))
  const childOptions=id=>state.classifications.filter(item=>item.parentId===id && item.enabled!==false).map(item=>({label:item.name,value:item.id}))
  fields.value=[{key:'datasetId',label:'数据集',type:'select',required:true,options:available.map(item=>({label:item.name,value:item.id})),onChange:(id,form)=>{const item=available.find(row=>row.id===id);form.domainId=item.domainId;form.subdomainId=item.subdomainId;form.typeId=item.typeId;fields.value[2].options=childOptions(item.domainId)}},
    {key:'domainId',label:'一级领域',type:'select',required:true,options:rootOptions(),onChange:(id,form)=>{form.subdomainId='';fields.value[2].options=childOptions(id)}},
    {key:'subdomainId',label:'二级领域',type:'select',required:true,options:childOptions(dataset.domainId)},
    {key:'typeId',label:'数据类型',type:'select',required:true,options:state.classifications.filter(item=>item.kind==='type' && item.enabled!==false).map(item=>({label:item.name,value:item.id}))}]
  initial.value={datasetId:dataset.id,domainId:dataset.domainId,subdomainId:dataset.subdomainId,typeId:dataset.typeId};dialogTitle.value='数据集分类'
  handler=data=>classifyDataset(data.datasetId,data);dialog.value=true
}
function save(data) { if (handler(data)!==false) dialog.value=false }

function editPermission(row) {
  if (!isAdmin.value) return
  fields.value = [{ key: 'project', label: '项目范围', type: 'select', options: ['全部项目', ...new Set(state.datasets.map(d => d.project))], required: true }, { key: 'level', label: '可见数据等级', type: 'select', options: ['公开', '内部'], required: true, help: '“内部”包含公开与内部数据；“公开”仅显示公开数据。' }, ...['view','edit','review','download'].map((key, i) => ({ key, label: ['查看','编辑与加工','审核与审批','审批后下载'][i], type: 'switch' }))]
  initial.value = row; dialogTitle.value = `设置权限 · ${row.role}`; handler = data => { Object.assign(row, data); notify('角色权限已更新，切换身份可体验变化') }; dialog.value = true
}
</script>
<template>
  <section v-if="page === 'standards'" class="panel">
    <div class="toolbar"><el-input v-model="search" placeholder="搜索分类名称、代码或说明" clearable><template #prefix><el-icon><Search /></el-icon></template></el-input><el-radio-group v-model="classificationKind"><el-radio-button value="domain">领域分类</el-radio-button><el-radio-button value="type">数据类型</el-radio-button></el-radio-group><span class="toolbar-spacer"></span><el-button :disabled="!allowed('edit')" @click="chooseDatasetClassification"><el-icon><PriceTag /></el-icon>数据集分类</el-button><el-button type="primary" :disabled="!isAdmin || !allowed('edit')" @click="editClassification()"><el-icon><Plus /></el-icon>新增{{ classificationKind==='domain'?'领域':'类型' }}</el-button></div>
    <el-table :key="classificationKind + search" :data="classificationRows" row-key="id" default-expand-all max-height="560">
      <el-table-column label="分类名称" min-width="200"><template #default="{row}"><el-icon class="classification-icon"><component :is="row.kind==='type'?'Files':row.parentId?'PriceTag':'FolderOpened'" /></el-icon>{{ row.name }}</template></el-table-column>
      <el-table-column label="代码" prop="code" min-width="130" />
      <el-table-column v-if="classificationKind==='domain'" label="层级" width="100"><template #default="{row}">{{ row.parentId?'二级领域':'一级领域' }}</template></el-table-column>
      <el-table-column label="分类说明" prop="description" min-width="180" />
      <el-table-column label="数据集" width="90"><template #default="{row}"><el-tooltip :content="categoryUses(row.id).map(item=>item.name).join('、') || '暂无引用'"><span>{{ categoryUses(row.id).length }} 个</span></el-tooltip></template></el-table-column>
      <el-table-column label="状态" width="90"><template #default="{row}"><el-tag :type="row.enabled===false?'info':'success'">{{ row.enabled===false?'已停用':'启用' }}</el-tag></template></el-table-column>
      <el-table-column label="操作" width="280"><template #default="{row}"><el-button v-if="row.kind==='domain' && !row.parentId" link type="primary" :disabled="!isAdmin || row.enabled===false" @click="editClassification(null,row)">新增二级</el-button><el-button link type="primary" :disabled="!isAdmin" @click="editClassification(row)">编辑</el-button><el-button link type="primary" @click="history(row)">历史</el-button><el-button link type="danger" :disabled="!isAdmin" @click="deleteCategory(row)">删除</el-button></template></el-table-column>
    </el-table>
  </section>
  <template v-if="page === 'permissions'"><section class="panel permission-intro"><span class="icon-tile blue"><el-icon><Lock /></el-icon></span><div><h3>角色、项目与数据等级</h3><p>配置角色可操作的范围，切换右上角身份查看不同体验。数据下载仍须完成对应版本审批。</p></div></section><section class="panel"><div class="section-title"><h3>角色权限</h3><span>{{ isAdmin ? '当前身份可修改权限' : '仅管理员可修改权限' }}</span></div><el-table :data="state.permissions"><el-table-column label="角色" prop="role" min-width="130" /><el-table-column label="项目范围" prop="project" min-width="130" /><el-table-column label="数据等级" prop="level" width="100" /><el-table-column v-for="(label, key) in { view: '查看', edit: '编辑与加工', review: '审核与审批', download: '审批后下载' }" :key="key" :label="label" align="center" min-width="110"><template #default="{ row }"><el-icon :class="row[key] ? 'permission-yes' : 'permission-no'"><Check v-if="row[key]" /><Close v-else /></el-icon></template></el-table-column><el-table-column label="操作" width="110"><template #default="{ row }"><el-button link type="primary" :disabled="!isAdmin" @click="editPermission(row)">配置权限</el-button></template></el-table-column></el-table></section></template>
  <el-dialog v-model="historyOpen" :title="historyTitle+' · 修订历史'" width="850"><el-table :data="historyRows"><el-table-column type="expand"><template #default="{row}"><el-descriptions :column="1" border><el-descriptions-item v-for="key in ['name','code','parentId','enabled','description'].filter(key=>row.definition[key]!==undefined)" :key="key" :label="({name:'名称',code:'分类代码',parentId:'上级领域',enabled:'启用',description:'说明'})[key]">{{ Array.isArray(row.definition[key])?row.definition[key].join('、'):typeof row.definition[key]==='boolean'?(row.definition[key]?'是':'否'):key==='parentId'?(state.classifications.find(item=>item.id===row.definition[key])?.name || '无'):row.definition[key] }}</el-descriptions-item></el-descriptions></template></el-table-column><el-table-column label="修订" width="90"><template #default="{row}">r{{ row.revision }}</template></el-table-column><el-table-column label="名称"><template #default="{row}">{{ row.definition.name }}</template></el-table-column><el-table-column label="保存人" prop="operator" /><el-table-column label="时间" prop="created" width="190" /></el-table></el-dialog>
  <FormDialog v-model="dialog" :title="dialogTitle" :fields="fields" :initial="initial" @save="save" />
</template>
