<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { state, canCreateProject, canManageProject, createProject, updateProject, projectDictionary, notify } from '../store'
import { projectVisibilities } from '../projectConfig'
import ProjectDictionaryEditor from './ProjectDictionaryEditor.vue'

const props = defineProps({modelValue:Boolean,project:Object})
const emit = defineEmits(['update:modelValue','saved'])
const tab = ref('basic')
const dictionaryEditor = ref(null)
const editorSession = ref(0)
const form = ref({name:'',description:'',visibility:'group',groupId:'',dictionary:[]})
const groups = computed(() => (state.researchGroups || []).filter(group => group.memberIds?.includes(state.role)))
const canSave = computed(() => props.project ? canManageProject(props.project) : canCreateProject())
watch(() => state.role, () => emit('update:modelValue',false))
watch(() => props.modelValue, open => {
  if (!open) return
  editorSession.value++
  tab.value = 'basic'
  const project = props.project
  form.value = project ? JSON.parse(JSON.stringify({name:project.name,description:project.description,
    visibility:project.visibility || 'all',groupId:project.groupId || groups.value[0]?.id || '',
    dictionary:projectDictionary(project.id).filter(term => !['dataset_code','crop_type'].includes(term.field) && term.name !== '作物类型')}))
    : {name:'',description:'',visibility:groups.value.length ? 'group' : 'personal',groupId:groups.value[0]?.id || '',dictionary:[]}
})
function save() {
  if (!canSave.value) return
  if (dictionaryEditor.value?.applyPendingCode() === false) {tab.value = 'dictionary';return}
  try {
    const project = props.project ? updateProject(props.project.id,form.value) : createProject(form.value)
    notify(props.project ? '项目设置已保存' : '项目已创建，接下来规划第一个数据集')
    emit('update:modelValue',false)
    emit('saved',project,!props.project)
  } catch (error) {
    tab.value = /字段|字典|枚举/.test(error.message) ? 'dictionary' : 'basic'
    ElMessage.warning(error.message)
  }
}
</script>

<template>
  <el-dialog :model-value="modelValue" :title="project ? '项目设置' : '新建项目'" width="min(1120px, 94vw)" class="project-config-dialog" @update:model-value="emit('update:modelValue',$event)">
    <el-tabs v-model="tab"><el-tab-pane label="基本信息与可见范围" name="basic" /><el-tab-pane :label="'数据字典' + (form.dictionary.length ? ' · '+form.dictionary.length : '')" name="dictionary" /></el-tabs>
    <el-form v-show="tab === 'basic'" label-position="top" class="project-basics-form" @submit.prevent="save">
      <el-form-item label="项目名称" required><el-input v-model="form.name" placeholder="输入课题或数据建设项目名称" maxlength="100" show-word-limit /></el-form-item>
      <el-form-item label="建设目标"><el-input v-model="form.description" type="textarea" :rows="3" placeholder="说明本项目的数据用途与建设目标" /></el-form-item>
      <el-form-item label="可见范围" required>
        <el-radio-group v-model="form.visibility" class="project-visibility-options">
          <el-radio v-for="scope in projectVisibilities" :key="scope.value" :value="scope.value" :disabled="scope.value === 'group' && !groups.length" border><div><b>{{ scope.label }}</b><small>{{ scope.description }}</small></div></el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item v-if="form.visibility === 'group'" label="所属课题组" required><el-select v-model="form.groupId" placeholder="选择所属课题组" aria-label="项目所属课题组"><el-option v-for="group in groups" :key="group.id" :value="group.id" :label="group.name" /></el-select></el-form-item>
      <p class="project-config-note">可见范围用于控制工作空间中的项目、资料和任务访问；可执行的操作仍由角色权限决定。“全员可见”指平台内用户，成果对外共享仍需审核与发布。</p>
    </el-form>
    <ProjectDictionaryEditor :key="editorSession" ref="dictionaryEditor" v-show="tab === 'dictionary'" v-model="form.dictionary" :library="state.terms" />
    <template #footer><el-button @click="emit('update:modelValue',false)">取消</el-button><el-button v-if="tab === 'basic'" @click="tab = 'dictionary'">配置数据字典</el-button><el-button v-else @click="tab = 'basic'">返回基本信息</el-button><el-button type="primary" :disabled="!canSave" @click="save">{{ project ? '保存设置' : '创建项目' }}</el-button></template>
  </el-dialog>
</template>
