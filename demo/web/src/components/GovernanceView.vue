<script setup>
import { ref, computed } from 'vue'
import { ElMessageBox } from 'element-plus'
import { state, requireAction, notify, allowed } from '../store'
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
const standards = computed(() => state.standards.filter(s => s.category === tab.value && `${s.name}${s.description}`.includes(search.value)))
function edit(row) {
  if (!requireAction('edit')) return
  const dictionary = tab.value === '数据字典'
  fields.value = dictionary ? [
    { key: 'name', label: '术语名称', required: true }, { key: 'field', label: '关联字段', required: true }, { key: 'type', label: '字段类型', type: 'select', options: ['数值', '文本', '日期', '布尔'], default: '数值' }, { key: 'unit', label: '单位' }, { key: 'description', label: '定义与说明', type: 'textarea', required: true },
  ] : [{ key: 'name', label: '名称', required: true }, { key: 'description', label: tab.value === '场景清洗流程' ? '场景与处理步骤' : '规范内容', type: 'textarea', rows: 7, required: true }]
  if (tab.value === '场景清洗流程') fields.value.push({ key: 'rules', label: '清洗步骤', type: 'checks', options: ['文档去重', '质量过滤', '隐私脱敏', '格式标准化', '移除think标签'], default: ['文档去重', '格式标准化'] })
  initial.value = row || {}; dialogTitle.value = `${row ? '编辑' : '新增'}${tab.value}`
  handler = data => { if (row) Object.assign(row, data); else (dictionary ? state.terms : state.standards).unshift({ ...data, category: tab.value, id: uid('standard') }); notify('已保存') }
  dialog.value = true
}
function editPermission(row) {
  if (!isAdmin.value) return
  fields.value = [{ key: 'project', label: '项目范围', type: 'select', options: ['全部项目', ...new Set(state.datasets.map(d => d.project))], required: true }, { key: 'level', label: '可见数据等级', type: 'select', options: ['公开', '内部'], required: true, help: '“内部”包含公开与内部数据；“公开”仅显示公开数据。' }, ...['view','edit','review','download'].map((key, i) => ({ key, label: ['查看','编辑与加工','审核与审批','审批后下载'][i], type: 'switch' }))]
  initial.value = row; dialogTitle.value = `设置权限 · ${row.role}`; handler = data => { Object.assign(row, data); notify('角色权限已更新，切换身份可体验变化') }; dialog.value = true
}
async function remove(row) { if (!requireAction('edit')) return; try { await ElMessageBox.confirm(`确定删除“${row.name}”？`, '删除', { type: 'warning' }); const list = tab.value === '数据字典' ? state.terms : state.standards; list.splice(list.indexOf(row), 1); notify('已删除') } catch {} }
</script>
<template>
  <section v-if="page === 'standards'" class="panel"><el-tabs v-model="tab"><el-tab-pane v-for="name in ['数据字典', '全流程标准', '元数据规范', '场景清洗流程']" :key="name" :label="name" :name="name" /></el-tabs><div class="section-title"><div><h3>{{ tab }}</h3><p>{{ tab === '数据字典' ? '维护科研术语、字段、类型和计量单位，让数据有一致的含义。' : tab === '场景清洗流程' ? '配置可复用的场景流程，可在文本清洗任务中选择。' : '记录数据采集、存储、共享和安全方面的统一要求。' }}</p></div><el-button type="primary" :disabled="!allowed('edit')" @click="edit()"><el-icon><Plus /></el-icon>新增{{ tab === '数据字典' ? '术语' : '规范' }}</el-button></div><div class="toolbar"><el-input v-model="search" placeholder="搜索名称、字段或说明" clearable><template #prefix><el-icon><Search /></el-icon></template></el-input></div><el-table v-if="tab === '数据字典'" :data="terms"><el-table-column label="术语名称" prop="name" min-width="130" /><el-table-column label="关联字段" prop="field" min-width="160" /><el-table-column label="类型" prop="type" width="90" /><el-table-column label="单位" prop="unit" width="100" /><el-table-column label="定义与说明" prop="description" min-width="250" /><el-table-column label="操作" width="130"><template #default="{ row }"><el-button link type="primary" :disabled="!allowed('edit')" @click="edit(row)">编辑</el-button><el-button link type="danger" :disabled="!allowed('edit')" @click="remove(row)">删除</el-button></template></el-table-column></el-table><div v-else class="standard-list"><article v-for="row in standards" :key="row.id" class="standard-card"><span class="icon-tile teal"><el-icon><Collection /></el-icon></span><div><h3>{{ row.name }}</h3><p>{{ row.description }}</p><div class="tags"><el-tag v-for="rule in row.rules" :key="rule" type="info">{{ rule }}</el-tag></div></div><div><el-button link type="primary" :disabled="!allowed('edit')" @click="edit(row)">编辑</el-button><el-button link type="danger" :disabled="!allowed('edit')" @click="remove(row)">删除</el-button></div></article><el-empty v-if="!standards.length" description="尚无规范，点击新增开始维护" /></div></section>
  <template v-if="page === 'permissions'"><section class="panel permission-intro"><span class="icon-tile blue"><el-icon><Lock /></el-icon></span><div><h3>角色、项目与数据等级</h3><p>配置角色可操作的范围，切换右上角身份查看不同体验。数据下载仍须完成对应版本审批。</p></div><el-tag type="info">前端演示权限</el-tag></section><section class="panel"><div class="section-title"><h3>角色权限</h3><span>{{ isAdmin ? '当前身份可修改权限' : '仅管理员可修改权限' }}</span></div><el-table :data="state.permissions"><el-table-column label="角色" prop="role" min-width="130" /><el-table-column label="项目范围" prop="project" min-width="130" /><el-table-column label="数据等级" prop="level" width="100" /><el-table-column v-for="(label, key) in { view: '查看', edit: '编辑与加工', review: '审核与审批', download: '审批后下载' }" :key="key" :label="label" align="center" min-width="110"><template #default="{ row }"><el-icon :class="row[key] ? 'permission-yes' : 'permission-no'"><Check v-if="row[key]" /><Close v-else /></el-icon></template></el-table-column><el-table-column label="操作" width="110"><template #default="{ row }"><el-button link type="primary" :disabled="!isAdmin" @click="editPermission(row)">配置权限</el-button></template></el-table-column></el-table></section></template>
  <FormDialog v-model="dialog" :title="dialogTitle" :fields="fields" :initial="initial" @save="handler($event); dialog = false" />
</template>
