<script setup>
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { state, saveStandard, confirmStandard, checkGovernance, requireAction, notify, allowed } from '../store'
import { uid, isDatasetVersion } from '../domain'
import FormDialog from './GovernanceFormDialog.vue'
const executionText = value => ['待后端落实','待后端保障'].includes(value) ? '—' : value==='后端保障'?'系统策略':value
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
const targetVersion=ref('')
const historyOpen=ref(false)
const historyRows=ref([])
const historyTitle=ref('')
const collectionForTab=()=>({'数据字典':'terms','内容标准模板':'fieldTemplates'}[tab.value] || 'standards')
const versionsFor=id=>state.versions.filter(item=>item.datasetId===id && isDatasetVersion(item)).sort((a,b)=>b.number-a.number)
function history(row) {historyRows.value=state.standardVersions.filter(item=>item.collection===collectionForTab() && item.standardId===row.id).sort((a,b)=>b.revision-a.revision);historyTitle.value=row.name;historyOpen.value=true}
function confirmFlow(row) {
  const options=id=>[{label:'数据集级（采集 / 保存）',value:''},...versionsFor(id).map(version=>({label:`V${version.number} · ${version.status}`,value:version.id}))]
  fields.value=[{key:'datasetId',label:'确认的数据集',type:'select',required:true,options:state.datasets.filter(dataset=>allowed('review',dataset.id)).map(dataset=>({label:dataset.name,value:dataset.id})),onChange:(id,form)=>{form.versionId='';fields.value[1].options=options(id)}},{key:'versionId',label:'确认范围',type:'select',options:options(targetDataset.value)},{key:'note',label:'确认意见',type:'textarea',required:true}]
  initial.value={datasetId:targetDataset.value,versionId:targetVersion.value,note:''};dialogTitle.value=`人工确认 · ${row.name} r${row.revision}`
  handler=data=>confirmStandard(row.id,data.datasetId,data.versionId,data.note);dialog.value=true
}
const metadataOptions = computed(()=>state.standards.filter(row=>row.category==='元数据规范' && row.field).map(row=>({label:`${row.name} (${row.field})`,value:row.field})))
const relatedStages = row => row.field ? [...new Set(state.standards.filter(policy=>policy.category==='全流程标准' && policy.metadataFields?.includes(row.field) && policy.enabled!==false).flatMap(policy=>policy.stages || []))] : row.stages || []
const fieldOptions = [ ['code','数据集编号'],['name','数据集名称'],['industry','所属领域'],['type','数据类型'],['source','数据来源'],['level','数据等级'],['scene','使用场景'],['demand','业务需求'],['quality','内容质量要求'],['format','格式质量要求'],['scale','规划数据量'] ].map(([value,label])=>({value,label}))
const contentTemplates=computed(()=>state.fieldTemplates.filter(item=>item.name.includes(search.value)))
const usingTemplate = id => state.datasets.filter(dataset=>dataset.fieldTemplateId===id)
const usingTerm = id => state.datasets.filter(dataset=>state.fieldTemplates.find(template=>template.id===dataset.fieldTemplateId)?.termIds.includes(id))
function bindTemplate(row) {
  if (!requireAction('edit')) return
  fields.value=[{key:'datasetIds',label:'应用到数据集',type:'select',multiple:true,required:true,options:state.datasets.filter(dataset=>allowed('edit',dataset.id)).map(dataset=>({label:dataset.name,value:dataset.id})),default:usingTemplate(row.id).map(dataset=>dataset.id)}]
  initial.value={};dialogTitle.value=`绑定数据集 · ${row.name}`
  handler=data=>{for (const dataset of state.datasets.filter(item=>data.datasetIds.includes(item.id))) {dataset.fieldTemplateId=row.id;dataset.requiresQuality=true};notify('已应用字段标准');return true}
  dialog.value=true
}
function inspectDataset() {checkGovernance(checkOperation.value,{datasetId:targetDataset.value,versionId:targetVersion.value})}
function edit(row) {
  if (!requireAction('edit')) return
  const dictionary = tab.value === '数据字典'
  fields.value = dictionary ? [
    { key: 'name', label: '字段名称', required: true }, { key: 'field', label: '字段编码', required: true }, {key:'scope',label:'作用范围',type:'select',options:[{value:'dataset',label:'数据集元数据'},{value:'sample',label:'样本业务字段'}],default:'dataset'}, { key: 'type', label: '字段类型', type: 'select', options: ['数值', '文本', '枚举', '日期', '布尔'], default: '文本' }, {key:'enumValues',label:'枚举值（逗号分隔）'}, {key:'required',label:'必填字段',type:'switch',default:false}, { key: 'unit', label: '单位' }, { key: 'description', label: '定义与说明', type: 'textarea', required: true },
  ] : [{ key: 'name', label: '名称', required: true }, { key: 'description', label: tab.value === '场景清洗流程' ? '场景与处理步骤' : '规范内容', type: 'textarea', rows: 7, required: true }]
  if (tab.value === '场景清洗流程') fields.value.push({ key: 'rules', label: '清洗步骤', type: 'checks', options: ['文档去重', '质量过滤', '隐私脱敏', '格式标准化'], default: ['文档去重', '格式标准化'] })
  initial.value = row || {}; dialogTitle.value = `${row ? '编辑' : '新增'}${tab.value}`
  handler = data => {
    if (dictionary) {
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(data.field) || ['constructor','prototype'].includes(data.field)) {ElMessage.warning('字段键请使用英文字母、数字和下划线');return false}
      if (row && usingTerm(row.id).length && data.field!==row.field) {ElMessage.warning('已应用字段不能改键，请新增字段定义');return false}
      if (data.checkRange && data.max<data.min) {ElMessage.warning('最大值不能小于最小值');return false}
    }
    if (tab.value==='内容标准模板') {
      const keys=data.termIds.map(id=>state.terms.find(term=>term.id===id)?.field)
      if (new Set(keys).size!==keys.length) {ElMessage.warning('同一模板不能引用同名字段');return false}
    }
    if (tab.value === '元数据规范') {
      if (row?.field && data.field !== row.field) { ElMessage.warning('已关联字段不能改名，请新增其他字段规则'); return false }
      if (data.max < data.min) { ElMessage.warning('最大值不能小于最小值'); return false }
      if (state.standards.some(rule=>rule.category==='元数据规范' && rule.id!==row?.id && rule.field===data.field && rule.scope===data.scope)) { ElMessage.warning('相同适用范围已有该字段规则，请编辑已有规则'); return false }
    }
    return saveStandard(collectionForTab(),row,{...data,category:tab.value})
  }
  dialog.value = true
}
function save(data) { if (handler(data)!==false) dialog.value=false }

function editPermission(row) {
  if (!isAdmin.value) return
  fields.value = [{ key: 'project', label: '项目范围', type: 'select', options: ['全部项目', ...new Set(state.datasets.map(d => d.project))], required: true }, { key: 'level', label: '可见数据等级', type: 'select', options: ['公开', '内部'], required: true, help: '“内部”包含公开与内部数据；“公开”仅显示公开数据。' }, ...['view','edit','review','download'].map((key, i) => ({ key, label: ['查看','编辑与加工','审核与审批','审批后下载'][i], type: 'switch' }))]
  initial.value = row; dialogTitle.value = `设置权限 · ${row.role}`; handler = data => { Object.assign(row, data); notify('角色权限已更新，切换身份可体验变化') }; dialog.value = true
}
async function remove(row) { if (!requireAction('edit')) return; if (row.stages && state.datasets.some(dataset=>(!dataset.policyIds?.length || dataset.policyIds.includes(row.id) || row.stages.includes('安全')) && (!row.scope || row.scope==='全部类型' || row.scope===dataset.type))) return ElMessage.warning('标准正在执行，请停用并保留修订记录'); if (tab.value==='数据字典' && state.fieldTemplates.some(template=>template.termIds.includes(row.id))) return ElMessage.warning('该字段已被内容标准模板引用，请先解除引用或停用规则'); if (tab.value==='内容标准模板' && usingTemplate(row.id).length) return ElMessage.warning('模板已绑定数据集，请先在项目中切换标准模板'); if (row.field && row.category==='元数据规范' && state.standards.some(policy=>policy.metadataFields?.includes(row.field))) return ElMessage.warning('该字段已被全流程标准引用，请先解除关联；可停用规则'); try { await ElMessageBox.confirm(`确定删除“${row.name}”？`, '删除', { type: 'warning' }); const list = tab.value === '数据字典' ? state.terms : tab.value==='内容标准模板'?state.fieldTemplates:state.standards; list.splice(list.indexOf(row), 1); notify('已删除') } catch {} }
</script>
<template>
  <section v-if="page === 'standards'" class="panel">
    <el-tabs v-model="tab"><el-tab-pane v-for="name in ['数据字典','内容标准模板','全流程标准','元数据规范']" :key="name" :label="name" :name="name" /></el-tabs>
    <div class="toolbar"><el-input v-model="search" placeholder="搜索名称、字段或说明" clearable><template #prefix><el-icon><Search /></el-icon></template></el-input><span class="toolbar-spacer"></span><el-button type="primary" :disabled="!allowed('edit')" @click="edit()"><el-icon><Plus /></el-icon>新增{{ tab==='数据字典'?'术语':'规范' }}</el-button></div>
    <el-table v-if="tab==='数据字典'" :data="terms"><el-table-column label="术语名称" prop="name" min-width="130" /><el-table-column label="关联字段" prop="field" min-width="160" /><el-table-column label="类型" prop="type" width="90" /><el-table-column label="单位" prop="unit" width="100" /><el-table-column label="定义与说明" prop="description" min-width="250" /><el-table-column label="内容约束" min-width="200"><template #default="{row}"><div class="tags"><el-tag v-if="row.required">必填</el-tag><el-tag v-if="row.unique">唯一</el-tag><el-tag v-if="row.checkRange">{{ row.min }}—{{ row.max }}{{ row.unit }}</el-tag><el-tag v-if="row.enabled===false" type="info">已停用</el-tag><el-tag v-if="row.severity==='提醒'" type="warning">提醒</el-tag></div></template></el-table-column><el-table-column label="应用数据集" width="100"><template #default="{row}"><el-tooltip :content="usingTerm(row.id).map(dataset=>dataset.name).join('、') || '尚未绑定'"><span>{{ usingTerm(row.id).length }}个</span></el-tooltip></template></el-table-column><el-table-column label="操作" width="210"><template #default="{row}"><el-button link type="primary" :disabled="!allowed('edit')" @click="edit(row)">编辑</el-button><el-button link type="primary" @click="history(row)">历史</el-button><el-button link type="danger" :disabled="!allowed('edit')" @click="remove(row)">删除</el-button></template></el-table-column></el-table>
    <el-table v-else-if="tab==='内容标准模板'" :data="contentTemplates"><el-table-column label="模板名称" prop="name" min-width="180" /><el-table-column label="引用字段" min-width="300"><template #default="{row}"><div class="tags"><el-tag v-for="id in row.termIds" :key="id">{{ state.terms.find(term=>term.id===id)?.name }}</el-tag></div></template></el-table-column><el-table-column label="应用数据集" min-width="200"><template #default="{row}">{{ usingTemplate(row.id).map(dataset=>dataset.name).join('、') || '尚未绑定' }}</template></el-table-column><el-table-column label="操作" width="290"><template #default="{row}"><el-button link type="primary" :disabled="!allowed('edit')" @click="bindTemplate(row)">绑定数据集</el-button><el-button link type="primary" :disabled="!allowed('edit')" @click="edit(row)">编辑</el-button><el-button link type="primary" @click="history(row)">历史</el-button><el-button link type="danger" :disabled="!allowed('edit')" @click="remove(row)">删除</el-button></template></el-table-column></el-table>
    <el-table v-else-if="['全流程标准','元数据规范'].includes(tab)" :data="standards" row-key="id">
      <el-table-column type="expand"><template #default="{row}"><el-descriptions :column="2" border>
        <el-descriptions-item label="适用类型">{{ row.scope || '—' }}</el-descriptions-item><el-descriptions-item label="补充说明">{{ row.description || '—' }}</el-descriptions-item>
        <template v-if="row.field"><el-descriptions-item label="允许值">{{ row.allowedValues || '不限' }}</el-descriptions-item><el-descriptions-item label="长度 / 数值范围">{{ row.min ?? '不限' }} — {{ row.max ?? '不限' }}</el-descriptions-item><el-descriptions-item v-if="row.field==='code'" label="编号规则">DS-年份-六位序号，唯一且不可修改</el-descriptions-item></template>
        <template v-if="row.stages"><el-descriptions-item label="关联字段">{{ row.metadataFields?.join('、') || '无' }}</el-descriptions-item><el-descriptions-item label="失败处理">{{ row.action }}</el-descriptions-item><template v-if="row.stages.includes('采集')"><el-descriptions-item label="允许格式">{{ row.fileTypes || '不限' }}</el-descriptions-item><el-descriptions-item label="单文件上限">{{ row.maxMB ? `${row.maxMB} MB` : '不限' }}</el-descriptions-item></template><el-descriptions-item v-if="row.stages.includes('安全')" label="内部共享">{{ row.internalSharing }}</el-descriptions-item></template>
      </el-descriptions></template></el-table-column>
      <el-table-column label="名称" prop="name" min-width="180" />
      <el-table-column v-if="tab==='元数据规范'" label="字段" prop="field" min-width="140" /><el-table-column v-if="tab==='元数据规范'" label="类型 / 必填" min-width="130"><template #default="{row}">{{ row.dataType || '—' }} / <el-tag size="small">{{ row.required?'必填':'选填' }}</el-tag></template></el-table-column>
      <el-table-column label="执行环节" min-width="180"><template #default="{row}"><div class="tags"><el-tag v-for="stage in relatedStages(row)" :key="stage" type="info">{{ stage }}</el-tag><el-tag v-if="!row.field && !row.stages" type="info">说明文档</el-tag><el-tag v-else-if="!relatedStages(row).length" type="warning">未关联</el-tag></div></template></el-table-column>
      <el-table-column label="执行 / 修订" min-width="130"><template #default="{row}">{{ executionText(row.executionMode) || (row.stages?'自动校验':'—') }} / <el-tag v-if="row.revision" type="info">r{{ row.revision }}</el-tag><el-button v-if="row.executionMode==='人工确认'" link type="primary" :disabled="!allowed('review')" @click="confirmFlow(row)">人工确认</el-button></template></el-table-column><el-table-column label="状态" width="100"><template #default="{row}"><el-switch v-if="row.field || row.stages" :model-value="row.enabled" @change="value=>saveStandard('standards',row,{...row,enabled:value})" :disabled="!allowed('edit')" :aria-label="`${row.name}启用`" /><span v-else>—</span></template></el-table-column>
      <el-table-column label="操作" width="210"><template #default="{row}"><el-button link type="primary" :disabled="!allowed('edit')" @click="edit(row)">编辑</el-button><el-button link type="primary" @click="history(row)">历史</el-button><el-button link type="danger" :disabled="!allowed('edit')" @click="remove(row)">删除</el-button></template></el-table-column>
    </el-table>
    <template v-if="['全流程标准','元数据规范'].includes(tab)">
      <el-divider />
      <div class="toolbar"><el-select v-model="targetDataset" @change="targetVersion=''" aria-label="检查的数据集"><el-option v-for="dataset in state.datasets.filter(d=>allowed('view',d.id))" :key="dataset.id" :label="dataset.name" :value="dataset.id" /></el-select><el-select v-model="targetVersion" aria-label="检查版本"><el-option label="数据集级" value="" /><el-option v-for="version in versionsFor(targetDataset)" :key="version.id" :label="`V${version.number} · ${version.status}`" :value="version.id" /></el-select><el-select v-model="checkOperation" aria-label="检查环节"><el-option label="保存检查" value="save" /><el-option label="发布检查" value="publish" /></el-select><el-button @click="inspectDataset"><el-icon><CircleCheck /></el-icon>检查数据集</el-button></div>
      <el-collapse><el-collapse-item name="checks" title="执行记录"><el-table :data="state.governanceChecks.filter(item=>allowed('view',item.datasetId))" max-height="420"><el-table-column type="expand"><template #default="{row}"><p>操作人：{{ row.operator || '未记录' }} · 对象：{{ row.versionId ? 'V'+state.versions.find(version=>version.id===row.versionId)?.number : row.sourceName || '数据集级' }}</p><el-table :data="row.standards || []"><el-table-column label="执行标准" prop="name" /><el-table-column label="修订" width="90"><template #default="{row}">r{{ row.revision }}</template></el-table-column><el-table-column label="方式"><template #default="{row}">{{ executionText(row.executionMode) }}</template></el-table-column><el-table-column label="结果" ><template #default="{row}">{{ executionText(row.result) }}</template></el-table-column><el-table-column label="人工依据" min-width="200"><template #default="{row}">{{ row.confirmation?row.confirmation.operator+' · '+row.confirmation.note:'—' }}</template></el-table-column></el-table></template></el-table-column><el-table-column label="数据集" prop="name" min-width="180" /><el-table-column label="环节" prop="stage" width="90" /><el-table-column label="结果" width="100"><template #default="{row}"><el-tag :type="row.status==='通过'?'success':row.status==='未通过'?'danger':'warning'">{{ executionText(row.status) }}</el-tag></template></el-table-column><el-table-column label="原因" min-width="260"><template #default="{row}"><div v-for="(issue,index) in row.issues" :key="index">{{ issue.rule }} · {{ issue.field }}：{{ issue.reason }}</div><span v-if="!row.issues.length">—</span></template></el-table-column><el-table-column label="时间" prop="created" width="180" /></el-table></el-collapse-item></el-collapse>
      <el-collapse><el-collapse-item title="人工确认记录" name="confirmations"><el-table :data="state.manualConfirmations.filter(item=>allowed('view',item.datasetId))" max-height="420"><el-table-column label="标准 / 修订" min-width="190"><template #default="{row}">{{ row.definition.name }} / r{{ row.revision }}</template></el-table-column><el-table-column label="数据集" min-width="200"><template #default="{row}">{{ state.datasets.find(dataset=>dataset.id===row.datasetId)?.name }}</template></el-table-column><el-table-column label="范围" width="100"><template #default="{row}">{{ row.versionId?'V'+state.versions.find(version=>version.id===row.versionId)?.number:'数据集级' }}</template></el-table-column><el-table-column label="确认人" prop="operator" width="110" /><el-table-column label="意见" prop="note" min-width="220" /><el-table-column label="时间" prop="created" width="180" /></el-table></el-collapse-item></el-collapse>
    </template>
  </section>
  <template v-if="page === 'permissions'"><section class="panel permission-intro"><span class="icon-tile blue"><el-icon><Lock /></el-icon></span><div><h3>角色、项目与数据等级</h3><p>配置角色可操作的范围，切换右上角身份查看不同体验。数据下载仍须完成对应版本审批。</p></div></section><section class="panel"><div class="section-title"><h3>角色权限</h3><span>{{ isAdmin ? '当前身份可修改权限' : '仅管理员可修改权限' }}</span></div><el-table :data="state.permissions"><el-table-column label="角色" prop="role" min-width="130" /><el-table-column label="项目范围" prop="project" min-width="130" /><el-table-column label="数据等级" prop="level" width="100" /><el-table-column v-for="(label, key) in { view: '查看', edit: '编辑与加工', review: '审核与审批', download: '审批后下载' }" :key="key" :label="label" align="center" min-width="110"><template #default="{ row }"><el-icon :class="row[key] ? 'permission-yes' : 'permission-no'"><Check v-if="row[key]" /><Close v-else /></el-icon></template></el-table-column><el-table-column label="操作" width="110"><template #default="{ row }"><el-button link type="primary" :disabled="!isAdmin" @click="editPermission(row)">配置权限</el-button></template></el-table-column></el-table></section></template>
  <el-dialog v-model="historyOpen" :title="historyTitle+' · 修订历史'" width="850"><el-table :data="historyRows"><el-table-column type="expand"><template #default="{row}"><el-descriptions :column="1" border><el-descriptions-item v-for="key in ['name','field','type','dataType','unit','required','unique','min','max','allowedValues','stages','executionMode','metadataFields','fileTypes','maxMB','internalSharing','scope','enabled','description','termIds','formats','retentionDays','versionRetention','backupRequirement','encryptionRequirement'].filter(key=>row.definition[key]!==undefined)" :key="key" :label="({name:'名称',field:'字段键',type:'类型',dataType:'类型',unit:'单位',required:'必填',unique:'唯一',min:'最小值',max:'最大值',allowedValues:'允许值',stages:'执行环节',executionMode:'执行方式',metadataFields:'元数据字段',fileTypes:'采集格式',maxMB:'文件上限MB',internalSharing:'内部共享',scope:'适用类型',enabled:'启用',description:'说明',termIds:'字段引用',formats:'成果格式',retentionDays:'保留天数',versionRetention:'版本保留',backupRequirement:'备份要求',encryptionRequirement:'加密要求'})[key]">{{ Array.isArray(row.definition[key])?row.definition[key].join('、'):typeof row.definition[key]==='boolean'?(row.definition[key]?'是':'否'):executionText(row.definition[key]) }}</el-descriptions-item></el-descriptions></template></el-table-column><el-table-column label="修订" width="90"><template #default="{row}">r{{ row.revision }}</template></el-table-column><el-table-column label="名称"><template #default="{row}">{{ row.definition.name }}</template></el-table-column><el-table-column label="保存人" prop="operator" /><el-table-column label="时间" prop="created" width="190" /></el-table></el-dialog>
  <FormDialog v-model="dialog" :title="dialogTitle" :fields="fields" :initial="initial" @save="save" />
</template>
