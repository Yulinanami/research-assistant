<script setup>
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { state, checkGovernance, requireAction, notify, allowed } from '../store'
import { uid } from '../domain'
import FormDialog from './FormDialog.vue'
defineProps({ page: String })
const tab = ref('数据字典')
const search = ref('')
const dialog = ref(false)
const fields = ref([])
const initial = ref({})
const dialogTitle = ref('')
let handler
const isAdmin = computed(() => state.role === '管理员')
const terms = computed(() => state.terms.filter(t => `${t.name}${t.field}${t.description}`.includes(search.value)))
const standards = computed(() => state.standards.filter(s => s.category === tab.value && `${s.name}${s.description || ''}${s.field || ''}`.includes(search.value)))
const targetDataset = ref(state.activeDataset)
const checkOperation = ref('save')
const metadataOptions = computed(()=>state.standards.filter(row=>row.category==='元数据规范' && row.field).map(row=>({label:`${row.name} (${row.field})`,value:row.field})))
const relatedStages = row => row.field ? [...new Set(state.standards.filter(policy=>policy.category==='全流程标准' && policy.metadataFields?.includes(row.field) && policy.enabled!==false).flatMap(policy=>policy.stages || []))] : row.stages || []
const fieldOptions = [ ['code','数据集编号'],['name','数据集名称'],['industry','所属领域'],['type','数据类型'],['source','数据来源'],['level','数据等级'],['scene','使用场景'],['demand','业务需求'],['quality','内容质量要求'],['format','格式质量要求'],['scale','规划数据量'] ].map(([value,label])=>({value,label}))
function inspectDataset() { checkGovernance(checkOperation.value,{datasetId:targetDataset.value}) }
function edit(row) {
  if (!requireAction('edit')) return
  const dictionary = tab.value === '数据字典'
  fields.value = dictionary ? [
    { key:'name',label:'术语名称',required:true },{ key:'field',label:'关联字段',required:true },{ key:'type',label:'字段类型',type:'select',options:['数值','文本','日期','布尔'],default:'数值' },{ key:'unit',label:'单位' },{ key:'description',label:'定义与说明',type:'textarea',required:true },
  ] : tab.value === '元数据规范' ? [
    {key:'name',label:'规则名称',required:true}, {key:'field',label:'数据集字段',type:'select',options:fieldOptions,required:true},
    {key:'dataType',label:'字段类型',type:'select',options:['文本','数值','日期','布尔'],default:'文本'},
    {key:'required',label:'必填',type:'switch',default:true}, {key:'allowedValues',label:'允许值（逗号分隔）'},
    {key:'min',label:'最小长度 / 最小数值',type:'number',min:0,default:0}, {key:'max',label:'最大长度 / 最大数值',type:'number',min:0,default:500},
  ] : tab.value === '全流程标准' ? [
    {key:'name',label:'标准名称',required:true}, {key:'stages',label:'执行环节',type:'checks',options:['采集','存储','共享','安全'],required:true},
    {key:'metadataFields',label:'关联元数据规则',type:'select',multiple:true,options:metadataOptions.value,default:[]},
    {key:'fileTypes',label:'采集允许格式（逗号分隔，留空不限）'}, {key:'maxMB',label:'采集单文件上限（MB，0不限）',type:'number',min:0,default:50},
    {key:'internalSharing',label:'内部数据共享策略',type:'select',options:['申请授权','禁止共享'],default:'申请授权'},
    {key:'action',label:'不符合规则时',type:'select',options:['阻止操作','仅提示'],default:'阻止操作'},
  ] : [{key:'name',label:'名称',required:true},{key:'description',label:'场景与处理步骤',type:'textarea',rows:7,required:true},{key:'rules',label:'清洗步骤',type:'checks',options:['文档去重','质量过滤','隐私脱敏','格式标准化','移除think标签'],default:['文档去重','格式标准化']}]
  if (['元数据规范','全流程标准'].includes(tab.value)) fields.value.push({key:'scope',label:'适用数据类型',type:'select',options:['全部类型',...new Set(state.datasets.map(d=>d.type))],default:'全部类型'},{key:'enabled',label:'启用',type:'switch',default:true},{key:'description',label:'补充说明',type:'textarea'})
  initial.value = row || {}; dialogTitle.value = `${row ? '编辑' : '新增'}${tab.value}`
  handler = data => {
    if (tab.value === '元数据规范') {
      if (row?.field && data.field !== row.field) { ElMessage.warning('已关联字段不能改名，请新增其他字段规则'); return false }
      if (data.max < data.min) { ElMessage.warning('最大值不能小于最小值'); return false }
      if (state.standards.some(rule=>rule.category==='元数据规范' && rule.id!==row?.id && rule.field===data.field && rule.scope===data.scope)) { ElMessage.warning('相同适用范围已有该字段规则，请编辑已有规则'); return false }
    }
    if (row) Object.assign(row,data)
    else (dictionary?state.terms:state.standards).unshift({...data,category:tab.value,id:uid('standard')})
    notify('已保存'); return true
  }
  dialog.value = true
}
function save(data) { if (handler(data)!==false) dialog.value=false }

function editPermission(row) {
  if (!isAdmin.value) return
  fields.value = [{ key: 'project', label: '项目范围', type: 'select', options: ['全部项目', ...new Set(state.datasets.map(d => d.project))], required: true }, { key: 'level', label: '可见数据等级', type: 'select', options: ['公开', '内部'], required: true, help: '“内部”包含公开与内部数据；“公开”仅显示公开数据。' }, ...['view','edit','review','download'].map((key, i) => ({ key, label: ['查看','编辑与加工','审核与审批','审批后下载'][i], type: 'switch' }))]
  initial.value = row; dialogTitle.value = `设置权限 · ${row.role}`; handler = data => { Object.assign(row, data); notify('角色权限已更新，切换身份可体验变化') }; dialog.value = true
}
async function remove(row) { if (!requireAction('edit')) return; if (row.field && row.category==='元数据规范' && state.standards.some(policy=>policy.metadataFields?.includes(row.field))) return ElMessage.warning('该字段已被全流程标准引用，请先解除关联；可停用规则'); try { await ElMessageBox.confirm(`确定删除“${row.name}”？`, '删除', { type: 'warning' }); const list = tab.value === '数据字典' ? state.terms : state.standards; list.splice(list.indexOf(row), 1); notify('已删除') } catch {} }
</script>
<template>
  <section v-if="page === 'standards'" class="panel">
    <el-tabs v-model="tab"><el-tab-pane v-for="name in ['数据字典','全流程标准','元数据规范','场景清洗流程']" :key="name" :label="name" :name="name" /></el-tabs>
    <div class="toolbar"><el-input v-model="search" placeholder="搜索名称、字段或说明" clearable><template #prefix><el-icon><Search /></el-icon></template></el-input><span class="toolbar-spacer"></span><el-button type="primary" :disabled="!allowed('edit')" @click="edit()"><el-icon><Plus /></el-icon>新增{{ tab==='数据字典'?'术语':'规范' }}</el-button></div>
    <el-table v-if="tab==='数据字典'" :data="terms"><el-table-column label="术语名称" prop="name" min-width="130" /><el-table-column label="关联字段" prop="field" min-width="160" /><el-table-column label="类型" prop="type" width="90" /><el-table-column label="单位" prop="unit" width="100" /><el-table-column label="定义与说明" prop="description" min-width="250" /><el-table-column label="操作" width="130"><template #default="{row}"><el-button link type="primary" :disabled="!allowed('edit')" @click="edit(row)">编辑</el-button><el-button link type="danger" :disabled="!allowed('edit')" @click="remove(row)">删除</el-button></template></el-table-column></el-table>
    <el-table v-else-if="['全流程标准','元数据规范'].includes(tab)" :data="standards" row-key="id">
      <el-table-column type="expand"><template #default="{row}"><el-descriptions :column="2" border>
        <el-descriptions-item label="适用类型">{{ row.scope || '—' }}</el-descriptions-item><el-descriptions-item label="补充说明">{{ row.description || '—' }}</el-descriptions-item>
        <template v-if="row.field"><el-descriptions-item label="允许值">{{ row.allowedValues || '不限' }}</el-descriptions-item><el-descriptions-item label="长度 / 数值范围">{{ row.min ?? '不限' }} — {{ row.max ?? '不限' }}</el-descriptions-item><el-descriptions-item v-if="row.field==='code'" label="编号规则">DS-年份-六位序号，唯一且不可修改</el-descriptions-item></template>
        <template v-if="row.stages"><el-descriptions-item label="关联字段">{{ row.metadataFields?.join('、') || '无' }}</el-descriptions-item><el-descriptions-item label="失败处理">{{ row.action }}</el-descriptions-item><template v-if="row.stages.includes('采集')"><el-descriptions-item label="允许格式">{{ row.fileTypes || '不限' }}</el-descriptions-item><el-descriptions-item label="单文件上限">{{ row.maxMB ? `${row.maxMB} MB` : '不限' }}</el-descriptions-item></template><el-descriptions-item v-if="row.stages.includes('安全')" label="内部共享">{{ row.internalSharing }}</el-descriptions-item></template>
      </el-descriptions></template></el-table-column>
      <el-table-column label="名称" prop="name" min-width="180" />
      <el-table-column v-if="tab==='元数据规范'" label="字段" prop="field" min-width="140" /><el-table-column v-if="tab==='元数据规范'" label="类型 / 必填" min-width="130"><template #default="{row}">{{ row.dataType || '—' }}<el-tag v-if="row.required" size="small">必填</el-tag></template></el-table-column>
      <el-table-column label="执行环节" min-width="180"><template #default="{row}"><div class="tags"><el-tag v-for="stage in relatedStages(row)" :key="stage" type="info">{{ stage }}</el-tag><el-tag v-if="!row.field && !row.stages" type="info">说明文档</el-tag><el-tag v-else-if="!relatedStages(row).length" type="warning">未关联</el-tag></div></template></el-table-column>
      <el-table-column label="状态" width="100"><template #default="{row}"><el-switch v-if="row.field || row.stages" v-model="row.enabled" :disabled="!allowed('edit')" :aria-label="`${row.name}启用`" /><span v-else>—</span></template></el-table-column>
      <el-table-column label="操作" width="130"><template #default="{row}"><el-button link type="primary" :disabled="!allowed('edit')" @click="edit(row)">编辑</el-button><el-button link type="danger" :disabled="!allowed('edit')" @click="remove(row)">删除</el-button></template></el-table-column>
    </el-table>
    <div v-else class="standard-list"><article v-for="row in standards" :key="row.id" class="standard-card"><span class="icon-tile teal"><el-icon><Collection /></el-icon></span><div><h3>{{ row.name }}</h3><p>{{ row.description }}</p><div class="tags"><el-tag v-for="rule in row.rules" :key="rule" type="info">{{ rule }}</el-tag></div></div><div><el-button link type="primary" :disabled="!allowed('edit')" @click="edit(row)">编辑</el-button><el-button link type="danger" :disabled="!allowed('edit')" @click="remove(row)">删除</el-button></div></article></div>
    <template v-if="['全流程标准','元数据规范'].includes(tab)">
      <el-divider />
      <div class="toolbar"><el-select v-model="targetDataset" aria-label="检查的数据集"><el-option v-for="dataset in state.datasets.filter(d=>allowed('view',d.id))" :key="dataset.id" :label="dataset.name" :value="dataset.id" /></el-select><el-select v-model="checkOperation" aria-label="检查环节"><el-option label="保存检查" value="save" /><el-option label="发布检查" value="publish" /></el-select><el-button @click="inspectDataset"><el-icon><CircleCheck /></el-icon>检查数据集</el-button></div>
      <el-collapse><el-collapse-item name="checks" title="执行记录"><el-table :data="state.governanceChecks"><el-table-column label="数据集" prop="name" min-width="180" /><el-table-column label="环节" prop="stage" width="90" /><el-table-column label="结果" width="100"><template #default="{row}"><el-tag :type="row.status==='通过'?'success':row.status==='未通过'?'danger':'warning'">{{ row.status }}</el-tag></template></el-table-column><el-table-column label="原因" min-width="260"><template #default="{row}"><div v-for="(issue,index) in row.issues" :key="index">{{ issue.rule }} · {{ issue.field }}：{{ issue.reason }}</div><span v-if="!row.issues.length">—</span></template></el-table-column><el-table-column label="时间" prop="created" width="180" /></el-table></el-collapse-item></el-collapse>
    </template>
  </section>
  <template v-if="page === 'permissions'"><section class="panel permission-intro"><span class="icon-tile blue"><el-icon><Lock /></el-icon></span><div><h3>角色、项目与数据等级</h3><p>配置角色可操作的范围，切换右上角身份查看不同体验。数据下载仍须完成对应版本审批。</p></div><el-tag type="info">前端演示权限</el-tag></section><section class="panel"><div class="section-title"><h3>角色权限</h3><span>{{ isAdmin ? '当前身份可修改权限' : '仅管理员可修改权限' }}</span></div><el-table :data="state.permissions"><el-table-column label="角色" prop="role" min-width="130" /><el-table-column label="项目范围" prop="project" min-width="130" /><el-table-column label="数据等级" prop="level" width="100" /><el-table-column v-for="(label, key) in { view: '查看', edit: '编辑与加工', review: '审核与审批', download: '审批后下载' }" :key="key" :label="label" align="center" min-width="110"><template #default="{ row }"><el-icon :class="row[key] ? 'permission-yes' : 'permission-no'"><Check v-if="row[key]" /><Close v-else /></el-icon></template></el-table-column><el-table-column label="操作" width="110"><template #default="{ row }"><el-button link type="primary" :disabled="!isAdmin" @click="editPermission(row)">配置权限</el-button></template></el-table-column></el-table></section></template>
  <FormDialog v-model="dialog" :title="dialogTitle" :fields="fields" :initial="initial" @save="save" />
</template>
