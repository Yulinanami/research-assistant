import { reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { initialData, qaSamples, researchText, imageCleaningSamples, addIndustryDatasets, addGovernanceDemoDatasets, addContentGovernance, seedGovernanceExamples } from './data'
import { ensureGovernance, ensureLifecycleGovernance, reviseStandard, confirmManualStandard, executionStandards, validateGovernance, publicationEvidence, serviceAccess, isDatasetOwner, runQualityReport, qualityGateIssues, uid, now, createVersion, canDownload, submitVersionReview, reviewVersion, publishVersion, cleanText, cleanImages, isDatasetVersion, augmentRecords, exportRecords } from './domain'
import { cleanBatch, resultContent, parserType, preparationInputs, chunkRecords } from './workflow'
import { migrateWorkspace, generationInputs } from './workspace'
import { questionEntries } from './annotation'
import { auth } from './auth'
import { parseEntries } from './imports'
import { finishTaskTracking } from './tasks'
import { extractKnowledgeGraph } from './knowledgeGraph'
import { projectVisibleTo, validateProjectConfig } from './projectConfig'
import { knowledgeInputs, knowledgeSnapshot, compileKnowledgePage, compileKnowledgeGraph } from './knowledgeBase'
import { taskPrompt } from './promptConfig'
import { isAnnotationResult, annotationSignature, annotationReviewStatus, validateAnnotationSubmission } from './annotationReview'
import { ensureClassifications, saveClassification as reviseClassification, removeClassification as deleteClassification, assignDatasetClassification, clearLegacyFieldGovernance, clearLifecycleStandards } from './domain'

function prepareGovernance(data) {
  addIndustryDatasets(data)
  addGovernanceDemoDatasets(data)
  addContentGovernance(data)
  ensureGovernance(data)
  migrateWorkspace(data)
  for (const dataset of data.datasets) {
    dataset.ownerId = dataset.owner || dataset.ownerId || '管理员'
    dataset.owner ||= dataset.ownerId
  }
  ensureClassifications(data)
  ensureLifecycleGovernance(data)
  seedGovernanceExamples(data)
  return clearLifecycleStandards(clearLegacyFieldGovernance(migrateWorkspace(data)))
}
export const state = reactive(prepareGovernance(initialData()))
export const storage = reactive({ ready: false, error: '', saving: false })
let db
let pendingSaves = 0
let generation = 0
const activeTimers = new Set()

function transact(mode, callback) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('浏览器本地存储不可用'))
    const transaction = db.transaction('records', mode)
    const request = callback(transaction.objectStore('records'))
    transaction.oncomplete = () => resolve(request?.result)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function initialize() {
  try {
    db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('research-platform-demo', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('records')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const saved = await transact('readonly', store => store.get('state'))
    const needsGovernanceCleanup = saved && (!saved.legacyFieldRulesRemoved || !saved.lifecycleStandardsRemoved || ['terms','fieldTemplates','qualityReports','standards','governanceChecks','manualConfirmations','storagePolicies'].some(key=>saved[key]?.length))
    if (saved) Object.assign(state, prepareGovernance(saved))
    for (const flow of state.flows) if (flow.status === '执行中') flow.status = '已中断'
    for (const task of state.tasks) {
      if (task.status === '执行中') {
        task.status = '失败'; task.logs.push('页面刷新中断了模拟任务，请重试。')
        task.completedAt = Date.now()
        const source = state.sources.find(item => item.id === task.sourceId && item.datasetId === task.datasetId)
        if (task.type.includes('解析') && source) source.status = '解析失败'
      }
    }
    if (needsGovernanceCleanup) await transact('readwrite', store => store.put(JSON.parse(JSON.stringify(state)), 'state'))
  } catch (error) { storage.error = `本地保存失败：${error.message}。当前仍可演示，刷新可能丢失记录。` }
  if (auth.session) state.role = auth.session.role
  storage.ready = true
  watch(state, async () => {
    pendingSaves++
    storage.saving = true
    try { await transact('readwrite', store => store.put(JSON.parse(JSON.stringify(state)), 'state')) }
    catch (error) { storage.error = `本地保存失败：${error.message}` }
    finally { pendingSaves--; storage.saving = pendingSaves > 0 }
  }, { deep: true, flush: 'sync' })
  // Also pick up documents imported before automatic parsing was introduced.
  // Existing failures wait for an explicit retry rather than looping on login.
  watch(() => [auth.session, state.role], () => {
    for (const source of state.sources) ensureDocumentParsing(source.id)
  }, { immediate: true })
  watch(() => {
    if (!auth.session) return ''
    return JSON.stringify(state.datasets.filter(dataset => allowed('edit', dataset.id)).map(dataset => {
      const snapshot = knowledgeSnapshot(state.sources, state.versions, dataset.id)
      return [dataset.id, snapshot.signature, snapshot.graph?.id || '', state.tasks.filter(task => task.datasetId === dataset.id && task.config?.knowledgeBuild)
        .map(task => [task.id, task.status])]
    }))
  }, () => {
    if (!auth.session) return
    for (const dataset of state.datasets) ensureKnowledgeConstruction(dataset.id)
  }, { immediate: true })
}

export const datasetName = id => state.datasets.find(d => d.id === id)?.name || '未关联数据集'
export const projectDatasets = () => state.datasets.filter(d => d.projectId === state.activeProjectId && allowed('view', d.id))
export const selectedSources = () => state.sources.filter(s => s.datasetId === state.activeDataset && projectDatasets().some(d => d.id === s.datasetId))
export const selectedVersions = () => state.versions.filter(v => v.datasetId === state.activeDataset && projectDatasets().some(d => d.id === v.datasetId)).sort((a, b) => b.number - a.number)
export function visibleProjects() {
  const rule = state.permissions.find(p => p.role === state.role)
  return state.projects.filter(p => rule?.view && projectVisibleTo(p,state.role,state.researchGroups)
    && (rule.project === '全部项目' || rule.project === p.name) && (!state.datasets.some(d => d.projectId === p.id) || state.datasets.some(d => d.projectId === p.id && allowed('view', d.id))))
}
export function canCreateProject() {
  const rule = state.permissions.find(item => item.role === state.role)
  return Boolean(auth.session && rule?.edit && rule.project === '全部项目')
}
export function canManageProject(project) {
  const rule = state.permissions.find(item => item.role === state.role)
  return Boolean(auth.session && project && projectVisibleTo(project,state.role,state.researchGroups)
    && rule?.edit && (rule.project === '全部项目' || rule.project === project.name)
    && (project.ownerId === state.role || state.role === '管理员'))
}
export function createProject(data) {
  if (!canCreateProject()) throw new Error('当前身份没有创建项目的权限')
  const config = validateProjectConfig(data,state.role,state.researchGroups)
  const project = {...config,id:uid('project'),ownerId:state.role,created:now(),flowSteps:['文本清洗','知识片段','问答生成']}
  state.projects.unshift(project)
  return state.projects[0]
}
export function updateProject(id,data) {
  const project = state.projects.find(item => item.id === id)
  if (!canManageProject(project)) throw new Error('当前身份没有修改此项目的权限')
  const config = validateProjectConfig(data,state.role,state.researchGroups)
  const previousName = project.name
  Object.assign(project,config)
  for (const dataset of state.datasets.filter(item => item.projectId === id)) dataset.project = project.name
  for (const rule of state.permissions) if (rule.project === previousName) rule.project = project.name
  return project
}
export function projectDictionary(projectId = state.activeProjectId) {
  const project = visibleProjects().find(item => item.id === projectId)
  if (!project) return []
  return project.dictionary ?? state.terms.filter(term => term.scope === 'dataset')
}
export function openProject(id, datasetId) {
  if (!visibleProjects().some(project => project.id === id)) return false
  state.activeProjectId = id
  state.activeDataset = projectDatasets().find(dataset => dataset.id === datasetId)?.id || projectDatasets()[0]?.id || ''
  return true
}
export function createDataset(data) {
  const project = visibleProjects().find(p => p.id === state.activeProjectId)
  if (!project || !requireAction('edit')) return null
  const dataset = { ...data, id: uid('dataset'), projectId: project.id, project: project.name, ownerId: state.role, code: `DS-${uid().slice(-8).toUpperCase()}`, tags: data.tags || [data.type], metadata: data.metadata || {}, created: now() }
  state.datasets.unshift(dataset); state.activeDataset = dataset.id
  return dataset
}
export function taskName(type, datasetId = state.activeDataset) {
  const dataset = state.datasets.find(d => d.id === datasetId)
  return `${dataset?.project || '项目'} · ${type} · ${now()} · ${uid().slice(-4)}`
}
export function allowed(action, datasetId = state.activeDataset) {
  if (!auth.session) return false
  const rule = state.permissions.find(p => p.role === state.role)
  const dataset = state.datasets.find(d => d.id === datasetId)
  const projectRecord = state.projects.find(item => item.id === (dataset?.projectId || state.activeProjectId))
  if (projectRecord && !projectVisibleTo(projectRecord,state.role,state.researchGroups)) return false
  const project = dataset ? dataset.project : state.projects.find(p => p.id === state.activeProjectId)?.name
  return Boolean(rule?.[action] && (!project || rule.project === '全部项目' || rule.project === project) && (!dataset || rule.level === '内部' || dataset.level === '公开'))
}
export function requireAction(action, datasetId) {
  if (!auth.session) return false
  if (allowed(action, datasetId)) return true
  ElMessage.warning('当前演示身份没有此操作权限，请在右上角切换身份或检查权限设置。')
  return false
}
export function notify(text) { state.notices.unshift(text); state.notices.splice(30); if (auth.session) ElMessage.success(text) }
export function addVersion(datasetId, records, type, sourceId, kind) {
  const version = createVersion(state.versions, datasetId, records, type, sourceId, kind)
  version.projectId = state.datasets.find(d => d.id === datasetId)?.projectId || ''
  state.versions.unshift(version)
  return version
}

export function runTask(config) {
  if (!requireAction('edit', config.datasetId || state.activeDataset)) return
  const prompt = taskPrompt(state.settings, config.type, { ...config.config,
    audience_prompt: state.settings.audiences.find(item => item.name === config.config?.audience)?.prompt || '' })
  if (prompt && config.config?.prompt == null) config = { ...config, config: { ...config.config, prompt } }
  if (config.type === '知识图谱') config = { ...config, config: { ...config.config,
    entityPrompt: config.config?.entityPrompt ?? state.settings.prompts.graphEntities,
    relationPrompt: config.config?.relationPrompt ?? state.settings.prompts.graphRelations,
    mergePrompt: config.config?.mergePrompt ?? state.settings.prompts.graphMerge } }
  const datasetId = config.datasetId || state.activeDataset
  const parsingSource = config.type?.includes('解析') && state.sources.find(source => source.id === config.sourceId && source.datasetId === datasetId)
  if (parsingSource) {
    const running = state.tasks.find(task => task.datasetId === datasetId && task.sourceId === parsingSource.id
      && task.type === config.type && task.status === '执行中'
      && (task.inputSnapshot?.revision || 0) === (parsingSource.revision || 0))
    if (running) return running
  }
  let task = { ...JSON.parse(JSON.stringify(config)), id: uid('task'), datasetId: config.datasetId || state.activeDataset, created: now(), status: '执行中', progress: 10, logs: ['任务已创建（模拟）', '已读取输入和配置'] }
  delete task.versionId
  task.projectId = state.datasets.find(d => d.id === task.datasetId)?.projectId || ''
  task.name ||= taskName(task.type, task.datasetId)
  state.tasks.unshift(task)
  task = state.tasks[0]
  const inputSource = state.sources.find(source => source.id === task.sourceId && source.datasetId === task.datasetId)
  const inputVersion = state.versions.find(version => version.id === task.sourceId && version.datasetId === task.datasetId)
  task.startedAt = Date.now()
  delete task.completedAt
  task.totalItems = task.config?.pipeline ? task.config.inputs?.length || 0
    : inputVersion ? inputVersion.records.filter(record => record.status !== '过滤').length : inputSource ? 1 : 0
  if (task.config?.knowledgeBuild) task.totalItems = task.config.knowledgePages?.length || 1
  task.processedItems = 0; task.succeededItems = 0; task.failedItems = 0
  task.modelName = state.models.find(model => model.id === task.config?.model)?.name || ''
  const snapshot = value => value ? JSON.parse(JSON.stringify(value)) : null
  const sourceSnapshot = snapshot(inputSource)
  const versionSnapshot = snapshot(inputVersion)
  task.inputSnapshot = sourceSnapshot || versionSnapshot
  const generationTypes = ['知识片段', '知识图谱', '问答生成', '问答增强', '图片描述', '图片问答']
  const compatibleInput = !generationTypes.includes(task.type) || generationInputs(task.type, state.sources, state.versions, task.datasetId).some(input => input.id === task.sourceId)
  if (task.type.includes('解析') && inputSource) inputSource.status = '解析中'
  const current = generation
  for (const [delay, progress, message] of [[500, 40, '正在处理输入内容'], [1000, 75, '正在整理输出'], [1500, 100, '处理完成（模拟）']]) {
    const timer = setTimeout(() => {
      activeTimers.delete(timer)
      if (current !== generation) return
      task.progress = progress
      task.logs.push(message)
      if (progress === 100) {
        if (task.fail) { task.status = '失败'; if (task.type.includes('解析') && inputSource && (inputSource.revision || 0) === (sourceSnapshot.revision || 0)) inputSource.status = '解析失败'; task.logs.push('模拟失败：输入文档不可读取。取消模拟失败后可重试。'); finishFlowTask(task); return }
        const previousVersion = versionSnapshot
        const source = sourceSnapshot || (previousVersion ? { name: isDatasetVersion(previousVersion) ? `V${previousVersion.number} · ${previousVersion.type}` : previousVersion.type, content: resultContent(previousVersion.records) } : null)
        if (!task.config?.pipeline && !source && task.type !== '图片清洗') {
          task.status = '失败'; task.logs.push('输入资料不存在或不属于本数据集，请重新选择输入'); finishFlowTask(task); return
        }
        if (!compatibleInput) { task.status = '失败'; task.logs.push('输入内容为空、已过滤或不符合本次任务的数据类型'); finishFlowTask(task); return }
        if (['问答生成', '问答增强', '图片描述', '图片问答', '自动标注'].includes(task.type)
          && !state.models.some(model => model.id === task.config?.model && model.status === '已上架')) {
          task.status = '失败'; task.logs.push('请选择已上架的模型'); finishFlowTask(task); return
        }
        let records
        if (task.type === '知识编译' && task.config?.knowledgeBuild) {
          try {
            const currentInput = knowledgeInputs(state.sources, state.versions, task.datasetId)
              .find(input => input.key === task.config.knowledgeInput.key && input.signature === task.config.knowledgeInput.signature)
            if (!currentInput) throw new Error('原始资料已更新或移除，当前编译任务已过期')
            records = [compileKnowledgePage(task.config.knowledgeInput)]
            task.logs.push('已自动编译知识页面并保留来源。当前为本地摘录演示，未调用大模型。')
          } catch (error) { task.status='失败';task.logs.push(error.message);finishFlowTask(task);return }
        } else if (task.type === '知识图谱') {
          try {
            if (task.config?.knowledgeBuild && knowledgeSnapshot(state.sources, state.versions, task.datasetId).signature !== task.config.knowledgeBuildSignature) throw new Error('知识页面已更新，当前图谱任务已过期')
            const graph = task.config?.knowledgeBuild
              ? compileKnowledgeGraph(task.config.knowledgePages, task.config.knowledgeBuildSignature)
              : extractKnowledgeGraph(previousVersion || {...source,id:task.sourceId},task.config || {})
            records = [{title:task.config?.knowledgeBuild ? '知识库全局图谱' : source.name || '知识图谱', sourceId:task.sourceId, knowledge_graph:graph}]
            task.logs.push(`本地演示抽取 ${graph.entities.length} 个实体、${graph.relationships.length} 条候选关系，等待人工校订；未调用 LightRAG 服务。`)
          } catch (error) {task.status='失败';task.logs.push(error.message);finishFlowTask(task);return}
        } else if (task.config?.pipeline) {
          try {
            records = cleanBatch(task.config.inputs, task.config)
            task.logs.push(`按顺序执行：${task.config.rules.join(' → ') || '保留全部内容'}`)
            task.logs.push(`输入${records.length}份，保留${records.filter(record => record.status === '保留').length}份；原始资料保留。`)
          } catch (error) { task.status = '失败'; task.logs.push(error.message); finishFlowTask(task); return }
        } else if (task.type === '知识片段') {
          if (!source?.content?.trim() || source.content.startsWith('data:')) { task.status = '失败'; task.logs.push('输入没有可用文本，请检查上一步成果。'); finishFlowTask(task); return }
          records = chunkRecords(previousVersion || { ...source, id: task.sourceId }, task.config || {})
          if (!records.length) { task.status = '失败'; task.logs.push('输入没有可用于切片的正文条目'); finishFlowTask(task); return }
        } else if (['问答生成', '问答增强', '图片问答'].includes(task.type)) {
          records = structuredClone(qaSamples)
          if (task.type === '问答生成' && task.config?.preprocessing) {
            const title = sourceSnapshot?.name || previousVersion?.records.find(record => record.title)?.title || source.name
            records = records.map(record => ({ ...record, title, source: title,
              sourceId: task.sourceId, inputId: task.sourceId, simulated: true }))
            task.logs.push('当前为固定问答示例，未调用模型或依据文档执行真实提取；请核对原文后提交。')
          }
          if (task.type === '图片问答') {
            const images = sourceSnapshot?.content?.startsWith('data:image/')
              ? [{ image: sourceSnapshot.content, title: sourceSnapshot.name, sourceId: sourceSnapshot.id }]
              : previousVersion.records.filter(record => record.status !== '过滤' && record.image?.startsWith('data:image/'))
            records = images.flatMap((image, index) => structuredClone(qaSamples).map(record => ({ ...record,
              image: image.image, title: image.title || source.name, sourceId: image.sourceId || task.sourceId,
              inputId: task.sourceId, sourceRecordIndex: index })))
          }
          if (task.type === '问答增强') {
            if (!previousVersion?.records.some(record => record.question)) { task.status = '失败'; task.logs.push('问答增强需要本数据集的问答成果'); finishFlowTask(task); return }
            records = augmentRecords(task.config?.preprocessing ? questionEntries(previousVersion).records : previousVersion.records, task.config?.audience)
            if (task.config?.preprocessing) task.logs.push('当前演示保留原问答，按受众改写问题；模型与提示词仅保存为配置，未调用真实模型。')
          }
        } else if (task.type === '图片描述') {
          const images = sourceSnapshot?.content?.startsWith('data:image/')
            ? [{ image: sourceSnapshot.content, title: sourceSnapshot.name, sourceId: sourceSnapshot.id }]
            : previousVersion.records.filter(record => record.status !== '过滤' && record.image?.startsWith('data:image/'))
          records = images.map((image, index) => ({ image: image.image, title: image.title || source.name,
            content: '图中比较A组与B组的土壤含水量，分别为20%和25%，B组高5个百分点。', source: image.title || source.name,
            sourceId: image.sourceId || task.sourceId, inputId: task.sourceId, sourceRecordIndex: index }))
        } else if (task.type === '文本清洗') {
          if (!source?.content?.trim() || source.content.startsWith('data:')) { task.status = '失败'; task.logs.push('输入没有可清洗正文'); finishFlowTask(task); return }
          let text = source.content
          const rules = task.config?.rules || []
          text = cleanText(text, rules)
          records = [{ title: source?.name, content: text, source: source?.name, before: source?.content, retained: text.split('\n').filter(Boolean).length }]
        } else if (task.type === '图片清洗') {
          const inputIds = task.config?.sourceId || []
          const images = inputIds.includes('demo-images') ? imageCleaningSamples() : []
          for (const id of inputIds.filter(id => id !== 'demo-images')) {
            const image = state.sources.find(s => s.id === id && s.datasetId === task.datasetId)
            if (image?.content?.startsWith('data:image/')) images.push({ id, name: image.name, content: image.content, width: 900, height: 500, clarity: 90, format: image.type })
          }
          records = cleanImages(images, task.config || {})
          const kept = records.filter(r => r.status === '保留').length
          task.logs.push(`输入${records.length}张，保留${kept}张，过滤${records.length - kept}张；原始图片未修改。`)
          task.logs.push('质量与尺寸为演示信息；格式与尺寸标准化仅展示配置结果，未转换图片文件。')
        } else if (task.type === '自动标注') {
          if (!questionEntries(previousVersion).records.length) { task.status = '失败'; task.logs.push('自动标注需要本数据集的问答成果'); finishFlowTask(task); return }
          records = JSON.parse(JSON.stringify(previousVersion.records)).map((r, i) => r.status === '过滤' || !r.question ? r : ({ ...r, suggestion: i === 2 ? '需修改' : '可用', suggestionModelId: task.config.model }))
        } else {
          if (!inputSource || !state.sources.includes(inputSource) || parserType(inputSource) !== task.type) { task.status = '失败'; task.logs.push('解析资料已移除或文档类型不匹配'); finishFlowTask(task); return }
          records = [{ title: source?.name, content: researchText, source: source?.name, format: task.config?.format || 'Markdown', table: 'A组 | 20%\nB组 | 25%', formula: 'w = m_water / m_dry × 100%', image: '土壤含水量对比图' }]
        }
        const pendingQuestions = task.config?.preprocessing && ['问答生成', '问答增强'].includes(task.type)
        const version = addVersion(task.datasetId, records, task.type, task.sourceId, pendingQuestions || task.config?.knowledgeBuild ? 'processing' : undefined)
        if (task.config?.knowledgeBuild) {
          version.knowledgeKey = task.config.knowledgeInput?.key
          version.knowledgeSignature = task.config.knowledgeInput?.signature
          version.knowledgeBuildSignature = task.config.knowledgeBuildSignature
        }
        if (sourceSnapshot) version.sourceRevision = sourceSnapshot.revision || 0
        if (task.sourceIds) version.sourceIds = [...task.sourceIds]
        if (task.type.includes('解析') && inputSource && (inputSource.revision || 0) === (sourceSnapshot.revision || 0)) inputSource.parsedVersionId = version.id
        task.versionId = version.id
        task.logs.push(isDatasetVersion(version) ? `已保存数据集V${version.number}，共${records.length}条，原版本保持不变。` : '已保存加工成果，不新增数据集版本。')
        task.status = '已完成'
        if (inputSource && !task.config?.pipeline && !task.config?.knowledgeBuild && (inputSource.revision || 0) === (sourceSnapshot.revision || 0)) inputSource.status = task.type.includes('解析') ? '已解析' : '已处理'
        if (!task.config?.knowledgeBuild) notify(`${task.type}已完成，结果已保存到项目成果`)
        finishFlowTask(task)
      }
    }, delay)
    activeTimers.add(timer)
  }
  return task
}

export function ensureDocumentParsing(sourceId, { retry = false } = {}) {
  const source = state.sources.find(item => item.id === sourceId)
  const type = source && parserType(source)
  if (!type || !allowed('edit', source.datasetId)) return
  const input = preparationInputs([source], state.versions, source.datasetId)[0]
  if (input?.ready) return
  const latest = state.tasks.find(task => task.sourceId === source.id && task.datasetId === source.datasetId
    && task.type === type && (task.inputSnapshot?.revision || 0) === (source.revision || 0))
  if (latest?.status === '执行中' || (latest?.status === '失败' && !retry)) return latest
  return runTask({ type, datasetId: source.datasetId, sourceId: source.id, automatic: true,
    config: JSON.parse(JSON.stringify(state.settings.parsing)) })
}

export function ensureKnowledgeConstruction(datasetId) {
  if (!allowed('edit', datasetId)) return
  const snapshot = knowledgeSnapshot(state.sources, state.versions, datasetId)
  const jobs = state.tasks.filter(task => task.datasetId === datasetId && task.config?.knowledgeBuild)
  for (const input of snapshot.inputs) {
    if (snapshot.pages.some(page => page.knowledgeKey === input.key && page.knowledgeSignature === input.signature)) continue
    const prior = jobs.find(task => task.type === '知识编译' && task.config.knowledgeInput?.key === input.key
      && task.config.knowledgeInput?.signature === input.signature)
    if (prior && ['执行中', '失败'].includes(prior.status)) continue
    startKnowledgeCompilation(datasetId, input)
  }
  if (jobs.some(task => task.type === '知识编译' && task.status === '执行中'
    && snapshot.inputs.some(input => input.key === task.config.knowledgeInput?.key && input.signature === task.config.knowledgeInput?.signature))) return
  if (!snapshot.inputs.length || snapshot.pages.length !== snapshot.inputs.length || snapshot.graph) return
  const prior = jobs.find(task => task.type === '知识图谱' && task.config.knowledgeBuildSignature === snapshot.signature)
  if (prior && ['执行中', '失败'].includes(prior.status)) return
  runTask({ type: '知识图谱', datasetId, sourceId: snapshot.pages[0].id, sourceIds: snapshot.pages.map(page => page.id), automatic: true,
    config: { knowledgeBuild: true, knowledgeBuildSignature: snapshot.signature,
      knowledgePages: snapshot.pages.map(page => ({ id: page.id, records: page.records })),
      model: state.models.find(model => model.status === '已上架')?.id || '',
      prompt: taskPrompt(state.settings, '知识图谱') } })
}

function startKnowledgeCompilation(datasetId, input) {
  return runTask({ type:'知识编译',datasetId,sourceId:input.inputId,automatic:true,
    config:{knowledgeBuild:true,knowledgeInput:input,model:state.models.find(model => model.status === '已上架')?.id || '',
      prompt:taskPrompt(state.settings,'知识编译')} })
}
export function rebuildKnowledgeAnnotations(datasetId = state.activeDataset) {
  if (!requireAction('edit', datasetId)) return
  const inputs = knowledgeInputs(state.sources, state.versions, datasetId)
  for (const input of inputs) {
    if (state.tasks.some(task => task.datasetId === datasetId && task.type === '知识编译' && task.status === '执行中'
      && task.config?.knowledgeInput?.key === input.key && task.config.knowledgeInput.signature === input.signature)) continue
    startKnowledgeCompilation(datasetId, input)
  }
  if (inputs.length) notify('已按当前后台配置重新编译，完成后自动重建图谱')
}

export function startProjectFlow(sourceId) {
  if (!requireAction('edit')) return
  const source = selectedSources().find(item => item.id === sourceId)
  if (!source || source.content?.startsWith('data:image/')) throw new Error('请选择当前项目中可处理的文本或文档')
  const project = state.projects.find(item => item.id === state.activeProjectId)
  const types = ['文本清洗','知识片段','问答生成'].filter(type => (project.flowSteps || ['文本清洗','知识片段','问答生成']).includes(type))
  if (!types.length) throw new Error('请至少选择一个自动执行步骤')
  const prepared = preparationInputs([source], state.versions, source.datasetId)[0]
  if (parserType(source)) {
    if (!prepared?.ready) types.unshift(parserType(source))
  }
  else if (!source.content?.trim()) throw new Error('输入内容不可用')
  const snapshot = JSON.parse(JSON.stringify(state.settings))
  const flow = { id:uid('flow'),name:taskName('预设流程'),projectId:project.id,datasetId:source.datasetId,sourceId,
    steps:types.map(type => ({type,config:type.includes('解析') ? {...snapshot.parsing,prompt:taskPrompt(snapshot,type)}
      : type === '文本清洗' ? {...snapshot.cleaningPresets[0],type,pipeline:true}
      : {...snapshot.generation,preprocessing:type === '问答生成',audience:snapshot.audiences[0]?.name,
        prompt:taskPrompt(snapshot,type,{audience:snapshot.audiences[0]?.name,audience_prompt:snapshot.audiences[0]?.prompt,template:'忠实原文'}),
        model:state.models.find(model=>model.status==='已上架')?.id} })),
    index:0,status:'执行中',taskIds:[],lastOutput:prepared?.ready && parserType(source) ? prepared.id : sourceId,created:now() }
  state.flows.unshift(flow); launchFlowStep(state.flows[0]); return state.flows[0]
}
function launchFlowStep(flow) {
  if (!auth.session) { flow.status='已中断';flow.error='登录已结束，重新登录后可重试当前步骤';return }
  const step = flow.steps[flow.index]
  const sourceId = flow.lastOutput
  const config = JSON.parse(JSON.stringify(step.config))
  if (step.type === '文本清洗') {
    const source = state.sources.find(item=>item.id===sourceId && item.datasetId===flow.datasetId)
    const output = state.versions.find(item=>item.id===sourceId && item.datasetId===flow.datasetId)
    config.inputs = [{id:sourceId,name:source?.name || output?.type,kind:'text',content:source?.content || (output ? resultContent(output.records) : '')}]
  }
  const task = runTask({type:step.type,name:taskName(step.type,flow.datasetId),datasetId:flow.datasetId,sourceId,flowRunId:flow.id,config})
  if (!task) { flow.status='失败'; flow.error='当前身份没有执行下一步的权限'; return }
  step.taskId=task.id;flow.taskIds.push(task.id)
}
function finishFlowTask(task) {
  finishTaskTracking(task)
  // A preset flow can wait on the parsing task already started by import.
  for (const flow of state.flows.filter(item => item.status === '执行中' && item.steps[item.index]?.taskId === task.id)) {
    if (task.status === '失败') { flow.status='失败';flow.error=task.logs.at(-1);continue }
    const output = state.versions.find(item=>item.id===task.versionId)
    if (!output?.records.some(record=>record.status !== '过滤')) {flow.status='失败';flow.error='当前步骤没有可供下一步使用的数据';continue}
    flow.lastOutput=task.versionId;flow.index++
    if (flow.index === flow.steps.length) {flow.status=isDatasetVersion(output) || output.records.some(record => record.question) ? '等待复核' : '已完成';continue}
    launchFlowStep(flow)
  }
}
export function retryProjectFlow(id) {
  const flow = state.flows.find(item=>item.id===id)
  if (!flow || !['失败','已中断'].includes(flow.status) || !requireAction('edit',flow.datasetId)) return
  flow.status='执行中';flow.error='';launchFlowStep(flow)
}

export function removeTaskRecord(id) {
  const task = state.tasks.find(item => item.id === id)
  if (!task || !requireAction('edit', task.datasetId)) return false
  if (task.status === '执行中' || state.flows.some(flow => flow.id === task.flowRunId && flow.status === '执行中')) throw new Error('执行中的任务或流程记录不能删除')
  state.tasks.splice(state.tasks.indexOf(task), 1)
  return true
}

export async function importFile(file, datasetId = state.activeDataset) {
  const type = file.name.split('.').pop().toUpperCase()
  let content = ''
  if (/^(TXT|CSV|JSON|JSONL|MD|HTML|XML|YAML)$/.test(type)) content = await file.text()
  const imageMime = { PNG: 'image/png', JPG: 'image/jpeg', JPEG: 'image/jpeg', SVG: 'image/svg+xml', GIF: 'image/gif', WEBP: 'image/webp', BMP: 'image/bmp', AVIF: 'image/avif' }
  if (file.type.startsWith('image/') || imageMime[type]) content = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file.type.startsWith('image/') ? file : new Blob([file], { type: imageMime[type] })) })
  if (!requireAction('edit', datasetId)) throw new Error('没有导入权限')
  const records = ['JSON', 'JSONL'].includes(type) ? parseEntries(content, type.toLowerCase()) : null
  let source = { id: uid('src'), datasetId, projectId: state.datasets.find(d => d.id === datasetId)?.projectId || '', name: file.name, type, content, size: file.size, status: '已接入', created: now(), hasFile: true }
  try { await transact('readwrite', store => store.put(file, source.id)) }
  catch (error) { source.hasFile = false; storage.error = `文件保存失败：${error.message}` }
  state.sources.unshift(source)
  source = state.sources[0]
  if (records) {
    const version = addVersion(datasetId, records, '条目导入', source.id)
    source.importedVersionId = version.id
    source.status = '已接入'
  }
  ensureDocumentParsing(source.id)
  return source
}

export function updateSource(source, changes) {
  if (!requireAction('edit', source.datasetId)) return false
  const changed = changes.content !== undefined && changes.content !== source.content
  const records = changed && ['JSON', 'JSONL'].includes(source.type) ? parseEntries(changes.content, source.type.toLowerCase()) : null
  Object.assign(source, changes)
  if (changed) {
    source.revision = (source.revision || 0) + 1
    delete source.parsedVersionId
    source.status = parserType(source) ? '待自动解析' : '已接入'
    if (records) {
      const version = addVersion(source.datasetId, records, '条目导入', source.id)
      version.sourceRevision = source.revision
      source.importedVersionId = version.id
      source.status = '已接入'
    }
    ensureDocumentParsing(source.id)
  }
  return true
}
export function saveDownload(content, name, type = 'application/json;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
export async function downloadSource(source) {
  const file = source.hasFile ? await transact('readonly', store => store.get(source.id)) : null
  saveDownload(file || source.content, source.name, 'text/plain;charset=utf-8')
}
export async function deleteSource(source) {
  if (!requireAction('edit', source.datasetId)) return
  if (source.hasFile && db) await transact('readwrite', store => store.delete(source.id))
  state.sources.splice(state.sources.indexOf(source), 1)
}
export function downloadVersion(version, format = 'json') {
  if (!requireAction('download', version.datasetId) || !canDownload(version, state.requests, state.role, state.datasets.find(d => d.id === version.datasetId))) return ElMessage.warning('请先申请当前版本并等待审批通过。')
  const records = exportRecords(version.records)
  const content = format === 'md' ? records.map(r => r.question ? `## ${r.question}\n\n${r.answer}\n\n> 来源：${r.reference || '未提供'}` : `## ${r.title || '内容'}\n\n${r.content || JSON.stringify(r)}`).join('\n\n') : JSON.stringify(records, null, 2)
  saveDownload(content, `${datasetName(version.datasetId)}-v${version.number}.${format}`, format === 'md' ? 'text/markdown;charset=utf-8' : 'application/json;charset=utf-8')
  const dataset = state.datasets.find(dataset => dataset.id === version.datasetId)
  if (dataset) dataset.downloads = (dataset.downloads || 0) + 1
  recordUse('下载',version.id,`格式：${format.toUpperCase()}`,'已发起')
}

export function submitForReview(version) {
  if (!requireAction('edit', version.datasetId)) return false
  if (isDatasetVersion(version) && isAnnotationResult(version) && annotationReviewStatus(version) !== '已通过') { ElMessage.warning('请先在数据标注中完成成果审核'); return false }
  try { submitVersionReview(version, state.role); notify('成果已提交至数据治理与共享的质量审核'); return true }
  catch (error) { ElMessage.warning(error.message); return false }
}

export function submitAnnotationResult(version) {
  if (!state.versions.includes(version) || !requireAction('edit', version.datasetId)) return false
  try {
    if (annotationReviewStatus(version) === '待审核') throw new Error('该标注成果已提交审核')
    if (annotationReviewStatus(version) === '已通过') throw new Error('该标注成果已通过审核')
    validateAnnotationSubmission(version)
    const submittedAt = now()
    version.annotationReview = { status: '待审核', signature: annotationSignature(version), submittedAt, submittedBy: state.role,
      criteria: taskPrompt(state.settings, '标注成果审核'), records: JSON.parse(JSON.stringify(version.records)),
      history: [...(version.annotationReview?.history || []), { action:'提交审核', actor:state.role, at:submittedAt }] }
    notify('标注成果已提交审核')
    return true
  } catch (error) { ElMessage.warning(error.message); return false }
}

export function reviewAnnotationResult(version, approved, note) {
  if (!state.versions.includes(version) || !requireAction('review', version.datasetId)) return false
  try {
    if (annotationReviewStatus(version) !== '待审核') throw new Error('成果未提交或内容已变更，请重新提交审核')
    if (!approved && !note?.trim()) throw new Error('退回时请填写修改意见')
    const reviewedAt = now()
    const status = approved ? '已通过' : '已退回'
    Object.assign(version.annotationReview, { status, reviewer:state.role, reviewedAt, note:note?.trim() || '' })
    version.annotationReview.history.push({ action:status, actor:state.role, at:reviewedAt, note:note?.trim() || '' })
    state.tasks.unshift({ id:uid('task'), name:taskName('标注成果审核',version.datasetId), type:'标注成果审核',
      projectId:version.projectId,datasetId:version.datasetId,sourceId:version.id,versionId:version.id,
      status,progress:100,created:reviewedAt,startedAt:Date.now(),completedAt:Date.now(),
      totalItems:version.records.length,processedItems:version.records.length,
      logs:[`${state.role}审核${approved ? '通过' : '退回'}${note?.trim() ? '：' + note.trim() : ''}`] })
    notify(approved ? '标注成果审核通过' : '标注成果已退回修改')
    return true
  } catch (error) { ElMessage.warning(error.message); return false }
}
export function review(version, approved, note) {
  if (!requireAction('review', version.datasetId)) return
  reviewVersion(version, approved, note);version.reviewedBy=state.role; notify(approved ? '审核已通过，可发布成果' : '已退回修改')
}

export function publish(version,details) {
  if (!requireAction('review',version.datasetId)) return false
  try {
    publishVersion(version,details,state.versions,state.role)
    version.release.evidence ||= publicationEvidence(state,version,state.role)
    recordUse('发布',version.id,version.release.tag,'通过')
    notify(`${version.release.tag}已发布，可在数据目录查看`);return true
  } catch (error) {recordUse('发布',version.id,error.message,'未通过');throw error}
}

export async function resetDemo() {
  generation++
  activeTimers.forEach(clearTimeout); activeTimers.clear()
  if (db) await transact('readwrite', store => store.clear())
  Object.assign(state, prepareGovernance(initialData())); notify('已恢复初始演示数据')
}

export function saveClassification(row, definition) {
  if (!requireAction('edit') || state.role!=='管理员') return false
  try {reviseClassification(state,row?.id,definition,state.role);notify('分类已保存');return true}
  catch (error) {ElMessage.warning(error.message);return false}
}
export function removeClassification(row) {
  if (!requireAction('edit') || state.role!=='管理员') return false
  try {deleteClassification(state,row.id);notify('分类已删除');return true}
  catch (error) {ElMessage.warning(error.message);return false}
}
export function classifyDataset(datasetId, selection) {
  if (!requireAction('edit',datasetId)) return false
  try {assignDatasetClassification(state,datasetId,selection);notify('数据集分类已更新');return true}
  catch (error) {ElMessage.warning(error.message);return false}
}
export function recordUse(action,versionId,detail='',status='通过') {
  const version=state.versions.find(item=>item.id===versionId)
  state.usageEvents.unshift({id:uid('usage'),datasetId:version?.datasetId,versionId,user:state.role,action,detail,status,created:now()})
}
export function setArchiveState(dataset,note,restore=false) {
  if (!allowed('edit',dataset.id) || !isDatasetOwner(dataset,state.role)) return ElMessage.warning('仅数据集所有者可管理归档')
  if (!note?.trim()) return ElMessage.warning('请填写操作说明')
  dataset.storageState=restore?'使用中':'已归档'
  state.storageEvents.unshift({id:uid('archive'),datasetId:dataset.id,action:restore?'恢复使用':'归档',note:note.trim(),operator:state.role,created:now()})
  notify(restore?'数据集已恢复使用':'数据集已归档，所有版本保留')
}
export function submitUsageRequest(version,details) {
  const dataset=state.datasets.find(item=>item.id===version?.datasetId)
  if (!version || version.status!=='已发布' || isDatasetOwner(dataset,state.role)) return false
  if (state.requests.some(item=>item.versionId===version.id && item.user===state.role && item.status==='待审批')) {ElMessage.warning('该版本已有待审批申请');return false}
  state.requests.unshift({id:uid('request'),datasetId:dataset.id,versionId:version.id,user:state.role,...details,status:'待审批',created:now()})
  notify('使用申请已提交');return true
}
export function approveUsageRequest(request,pass,note) {
  if (!requireAction('review',request.datasetId)) return false
  request.status=pass?'已通过':'已驳回';request.note=note;request.approvedBy=state.role;request.approved=now()
  notify(pass?'已授权此申请版本':'申请已驳回');return true
}
export function previewService(service) {
  const response=serviceAccess(state,service,state.role)
  recordUse('API响应预览',service.versionId,response.message || '已核对版本授权并生成响应',response.status===200?'通过':'拒绝')
  return response
}
