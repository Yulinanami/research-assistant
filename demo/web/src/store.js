import { reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { initialData, qaSamples, researchText, imageCleaningSamples } from './data'
import { uid, now, createVersion, canDownload, reviewVersion, publishVersion, splitText, cleanText, cleanImages, isDatasetVersion, augmentRecords, exportRecords } from './domain'
import { cleanBatch, resultContent, parserType } from './workflow'
import { migrateWorkspace } from './workspace'
import { auth } from './auth'

export const state = reactive(migrateWorkspace(initialData()))
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
    if (saved) Object.assign(state, migrateWorkspace(saved))
    for (const flow of state.flows) if (flow.status === '执行中') flow.status = '已中断'
    for (const task of state.tasks) {
      if (task.status === '执行中') {
        task.status = '失败'; task.logs.push('页面刷新中断了模拟任务，请重试。')
        const source = state.sources.find(item => item.id === task.sourceId && item.datasetId === task.datasetId)
        if (task.type.includes('解析') && source) source.status = '解析失败'
      }
    }
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
}

export const datasetName = id => state.datasets.find(d => d.id === id)?.name || '未关联数据集'
export const projectDatasets = () => state.datasets.filter(d => d.projectId === state.activeProjectId && allowed('view', d.id))
export const selectedSources = () => state.sources.filter(s => s.datasetId === state.activeDataset && projectDatasets().some(d => d.id === s.datasetId))
export const selectedVersions = () => state.versions.filter(v => v.datasetId === state.activeDataset && projectDatasets().some(d => d.id === v.datasetId)).sort((a, b) => b.number - a.number)
export function visibleProjects() {
  const rule = state.permissions.find(p => p.role === state.role)
  return state.projects.filter(p => rule?.view && (rule.project === '全部项目' || rule.project === p.name) && (!state.datasets.some(d => d.projectId === p.id) || state.datasets.some(d => d.projectId === p.id && allowed('view', d.id))))
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
  let task = { id: uid('task'), datasetId: state.activeDataset, ...JSON.parse(JSON.stringify(config)), created: now(), status: '执行中', progress: 10, logs: ['任务已创建（模拟）', '已读取输入和配置'] }
  task.projectId = state.datasets.find(d => d.id === task.datasetId)?.projectId || ''
  task.name ||= taskName(task.type, task.datasetId)
  state.tasks.unshift(task)
  task = state.tasks[0]
  const inputSource = state.sources.find(source => source.id === task.sourceId && source.datasetId === task.datasetId)
  if (task.type.includes('解析') && inputSource) inputSource.status = '解析中'
  const current = generation
  for (const [delay, progress, message] of [[500, 40, '正在处理输入内容'], [1000, 75, '正在整理输出'], [1500, 100, '处理完成（模拟）']]) {
    const timer = setTimeout(() => {
      activeTimers.delete(timer)
      if (current !== generation) return
      task.progress = progress
      task.logs.push(message)
      if (progress === 100) {
        if (task.fail) { task.status = '失败'; if (task.type.includes('解析') && inputSource) inputSource.status = '解析失败'; task.logs.push('模拟失败：输入文档不可读取。取消模拟失败后可重试。'); finishFlowTask(task); return }
        const previousVersion = state.versions.find(v => v.id === task.sourceId && v.datasetId === task.datasetId)
        const source = state.sources.find(s => s.id === task.sourceId && s.datasetId === task.datasetId) || (previousVersion ? { name: isDatasetVersion(previousVersion) ? `V${previousVersion.number} · ${previousVersion.type}` : previousVersion.type, content: resultContent(previousVersion.records) } : null)
        let records
        if (task.config?.pipeline) {
          try {
            records = cleanBatch(task.config.inputs, task.config)
            task.logs.push(`按顺序执行：${task.config.rules.join(' → ') || '保留全部内容'}`)
            task.logs.push(`输入${records.length}份，保留${records.filter(record => record.status === '保留').length}份；原始资料保留。`)
          } catch (error) { task.status = '失败'; task.logs.push(error.message); finishFlowTask(task); return }
        } else if (task.type === '知识片段') {
          if (!source?.content?.trim() || source.content.startsWith('data:')) { task.status = '失败'; task.logs.push('输入没有可用文本，请检查上一步成果。'); finishFlowTask(task); return }
          const text = source.content
          records = splitText(text, task.config || {}).map(content => ({ title: source?.name || '演示文档', content, source: source?.name }))
        } else if (['问答生成', '问答增强', '图片问答'].includes(task.type)) {
          records = structuredClone(qaSamples)
          if (task.type === '问答增强') {
            const previous = state.versions.find(v => v.id === task.sourceId)
            records = augmentRecords(previous?.records || records, task.config?.audience)
          }
        } else if (task.type === '图片描述') {
          records = [{ content: '图中比较A组与B组的土壤含水量，分别为20%和25%，B组高5个百分点。', source: source?.name }]
        } else if (task.type === '文本清洗') {
          let text = source?.content || researchText
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
          const original = state.versions.find(v => v.id === task.sourceId)
          records = JSON.parse(JSON.stringify(original?.records || qaSamples)).map((r, i) => ({ ...r, suggestion: i === 2 ? '需修改' : '可用', label: '', rating: 0 }))
        } else {
          records = [{ title: source?.name, content: researchText, source: source?.name, format: task.config?.format || 'Markdown', table: 'A组 | 20%\nB组 | 25%', formula: 'w = m_water / m_dry × 100%', image: '土壤含水量对比图' }]
        }
        const version = addVersion(task.datasetId, records, task.type, task.sourceId)
        if (task.sourceIds) version.sourceIds = [...task.sourceIds]
        if (task.type.includes('解析') && inputSource) inputSource.parsedVersionId = version.id
        task.versionId = version.id
        task.logs.push(isDatasetVersion(version) ? `已保存数据集V${version.number}，共${records.length}条，原版本保持不变。` : '已保存加工成果，不新增数据集版本。')
        task.status = '已完成'
        if (source && !task.config?.pipeline) source.status = task.type.includes('解析') ? '已解析' : '已处理'
        notify(`${task.type}已完成，结果已保存到项目成果`)
        finishFlowTask(task)
      }
    }, delay)
    activeTimers.add(timer)
  }
  return task
}

export function startProjectFlow(sourceId) {
  if (!requireAction('edit')) return
  const source = selectedSources().find(item => item.id === sourceId)
  if (!source || source.content?.startsWith('data:image/')) throw new Error('请选择当前项目中可处理的文本或文档')
  const project = state.projects.find(item => item.id === state.activeProjectId)
  const types = ['文本清洗','知识片段','问答生成'].filter(type => (project.flowSteps || ['文本清洗','知识片段','问答生成']).includes(type))
  if (!types.length) throw new Error('请至少选择一个自动执行步骤')
  if (parserType(source)) types.unshift(parserType(source))
  else if (!source.content?.trim()) throw new Error('输入内容不可用')
  const snapshot = JSON.parse(JSON.stringify(state.settings))
  const flow = { id:uid('flow'),name:taskName('预设流程'),projectId:project.id,datasetId:source.datasetId,sourceId,
    steps:types.map(type => ({type,config:type.includes('解析') ? snapshot.parsing : type === '文本清洗' ? {...snapshot.cleaningPresets[0],type,pipeline:true} : {...snapshot.generation,audience:snapshot.audiences[0]?.name,prompt:snapshot.audiences[0]?.prompt,model:state.models.find(model=>model.status==='已上架')?.id} })),
    index:0,status:'执行中',taskIds:[],lastOutput:sourceId,created:now() }
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
  if (!task.flowRunId) return
  const flow = state.flows.find(item=>item.id===task.flowRunId)
  if (!flow || flow.status !== '执行中' || flow.steps[flow.index]?.taskId !== task.id) return
  if (task.status === '失败') { flow.status='失败';flow.error=task.logs.at(-1);return }
  const output = state.versions.find(item=>item.id===task.versionId)
  if (!output?.records.some(record=>record.status !== '过滤')) {flow.status='失败';flow.error='当前步骤没有可供下一步使用的数据';return}
  flow.lastOutput=task.versionId;flow.index++
  if (flow.index === flow.steps.length) {flow.status=isDatasetVersion(output) ? '等待复核' : '已完成';return}
  launchFlowStep(flow)
}
export function retryProjectFlow(id) {
  const flow = state.flows.find(item=>item.id===id)
  if (!flow || !['失败','已中断'].includes(flow.status) || !requireAction('edit',flow.datasetId)) return
  flow.status='执行中';flow.error='';launchFlowStep(flow)
}

export async function importFile(file, datasetId = state.activeDataset) {
  const type = file.name.split('.').pop().toUpperCase()
  let content = ''
  if (/^(TXT|CSV|JSON|JSONL|MD|HTML|XML|YAML)$/.test(type)) content = await file.text()
  if (file.type.startsWith('image/')) content = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file) })
  if (!requireAction('edit', datasetId)) throw new Error('没有导入权限')
  const source = { id: uid('src'), datasetId, projectId: state.datasets.find(d => d.id === datasetId)?.projectId || '', name: file.name, type, content, size: file.size, status: '待处理', created: now(), hasFile: true }
  try { await transact('readwrite', store => store.put(file, source.id)) }
  catch (error) { source.hasFile = false; storage.error = `文件保存失败：${error.message}` }
  state.sources.unshift(source)
  if (type === 'JSON' || type === 'JSONL') {
    try {
      const parsed = type === 'JSONL' ? content.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) : JSON.parse(content)
      const list = Array.isArray(parsed) ? parsed : parsed.records
      if (Array.isArray(list) && list.length) addVersion(datasetId, list.map(r => ({ question: r.instruction || r.question || '', answer: r.output || r.answer || '', reference: r.input || r.reference || '', ...r })), '条目导入', source.id)
    } catch { ElMessage.warning('文件已保存，但内容不是有效JSON条目；可在语料详情查看。') }
  }
  return source
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
  if (!requireAction('download', version.datasetId) || !canDownload(version, state.requests, state.role)) return ElMessage.warning('请先申请当前版本并等待审批通过。')
  const records = exportRecords(version.records)
  const content = format === 'md' ? records.map(r => r.question ? `## ${r.question}\n\n${r.answer}\n\n> 来源：${r.reference || '未提供'}` : `## ${r.title || '内容'}\n\n${r.content || JSON.stringify(r)}`).join('\n\n') : JSON.stringify(records, null, 2)
  saveDownload(content, `${datasetName(version.datasetId)}-v${version.number}.${format}`, format === 'md' ? 'text/markdown;charset=utf-8' : 'application/json;charset=utf-8')
}
export function review(version, approved, note) {
  if (!requireAction('review', version.datasetId)) return
  reviewVersion(version, approved, note); notify(approved ? '审核已通过，可发布成果' : '已退回修改')
}
export function publish(version, details) {
  if (!requireAction('review', version.datasetId)) return false
  publishVersion(version, details, state.versions, state.role)
  notify(`${version.release.tag}已发布，可在数据目录查看`)
  return true
}
export async function resetDemo() {
  generation++
  activeTimers.forEach(clearTimeout); activeTimers.clear()
  if (db) await transact('readwrite', store => store.clear())
  Object.assign(state, migrateWorkspace(initialData())); notify('已恢复初始演示数据')
}
