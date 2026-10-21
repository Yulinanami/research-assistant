import { reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { initialData, qaSamples, researchText, imageCleaningSamples, addIndustryDatasets } from './data'
import { uid, now, createVersion, canDownload, reviewVersion, publishVersion, splitText, cleanText, cleanImages, isDatasetVersion, augmentRecords, exportRecords, ensureProjects, ensureChatSessions } from './domain'

export const state = reactive(ensureProjects(ensureChatSessions(initialData())))
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
    if (saved) { Object.assign(state, saved); state.industrySeedsVersion = saved.industrySeedsVersion || 0; if (!Array.isArray(saved.chatSessions)) { state.chatSessions=undefined; state.activeChatId='' } }
    addIndustryDatasets(state)
    ensureProjects(state)
    ensureChatSessions(state)
    for (const task of state.tasks) {
      if (task.status === '执行中') { task.status = '失败'; task.logs.push('页面刷新中断了模拟任务，请重试。') }
    }
  } catch (error) { storage.error = `本地保存失败：${error.message}。当前仍可演示，刷新可能丢失记录。` }
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
export const selectedSources = () => state.sources.filter(s => s.datasetId === state.activeDataset && allowed('view', s.datasetId))
export const selectedVersions = () => state.versions.filter(v => v.datasetId === state.activeDataset && allowed('view', v.datasetId)).sort((a, b) => b.number - a.number)
export function allowed(action, datasetId = state.activeDataset) {
  const rule = state.permissions.find(p => p.role === state.role)
  const dataset = state.datasets.find(d => d.id === datasetId)
  return Boolean(rule?.[action] && (!dataset || rule.project === '全部项目' || rule.project === dataset.project) && (!dataset || rule.level === '内部' || dataset.level === '公开'))
}
export function requireAction(action, datasetId) {
  if (allowed(action, datasetId)) return true
  ElMessage.warning('当前演示身份没有此操作权限，请在右上角切换身份或检查权限设置。')
  return false
}
export function notify(text) { state.notices.unshift(text); state.notices.splice(30); ElMessage.success(text) }
export function addVersion(datasetId, records, type, sourceId, kind) {
  const version = createVersion(state.versions, datasetId, records, type, sourceId, kind)
  state.versions.unshift(version)
  return version
}

export function runTask(config) {
  if (!requireAction('edit', config.datasetId || state.activeDataset)) return
  const input = state.sources.find(s => s.id === config.sourceId)
  const name = config.name || `${input?.name || datasetName(state.activeDataset)} · ${config.type} · ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`
  let task = { id: uid('task'), datasetId: state.activeDataset, ...config, name, created: now(), status: '执行中', progress: 10, logs: ['任务已创建（模拟）', '已读取输入和配置'] }
  state.tasks.unshift(task)
  task = state.tasks[0]
  const current = generation
  for (const [delay, progress, message] of [[500, 40, '正在处理输入内容'], [1000, 75, '正在整理输出'], [1500, 100, '处理完成（模拟）']]) {
    const timer = setTimeout(() => {
      activeTimers.delete(timer)
      if (current !== generation) return
      task.progress = progress
      task.logs.push(message)
      if (progress === 100) {
        if (task.fail) { task.status = '失败'; task.logs.push('模拟失败：输入文档不可读取。取消模拟失败后可重试。'); return }
        const previousVersion = state.versions.find(v => v.id === task.sourceId)
        const source = state.sources.find(s => s.id === task.sourceId) || (previousVersion ? { name: isDatasetVersion(previousVersion) ? `V${previousVersion.number} · ${previousVersion.type}` : previousVersion.type, content: previousVersion.records.map(r => r.content || r.answer || '').join('\n\n') } : null)
        let records
        if (task.type === '知识片段') {
          const text = source?.content && !source.content.startsWith('data:') ? source.content : researchText
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
        task.versionId = version.id
        task.logs.push(isDatasetVersion(version) ? `已保存数据集V${version.number}，共${records.length}条，原版本保持不变。` : '已保存加工成果，不新增数据集版本。')
        task.status = '已完成'
        if (source) source.status = '已处理'
        notify(`${task.name}已完成`)
      }
    }, delay)
    activeTimers.add(timer)
  }
  return task
}

export async function importFile(file, datasetId = state.activeDataset) {
  const type = file.name.split('.').pop().toUpperCase()
  let content = ''
  if (/^(TXT|CSV|JSON|JSONL|MD|HTML|XML|YAML)$/.test(type)) content = await file.text()
  if (file.type.startsWith('image/')) content = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file) })
  const source = { id: uid('src'), datasetId, name: file.name, type, content, size: file.size, status: '待处理', created: now(), hasFile: true }
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
  if (!requireAction('download', version.datasetId) || !canDownload(version, state.requests, state.role, state.datasets.find(d => d.id === version.datasetId))) return ElMessage.warning('请先申请当前版本并等待审批通过。')
  const records = exportRecords(version.records)
  const content = format === 'md' ? records.map(r => r.question ? `## ${r.question}\n\n${r.answer}\n\n> 来源：${r.reference || '未提供'}` : `## ${r.title || '内容'}\n\n${r.content || JSON.stringify(r)}`).join('\n\n') : JSON.stringify(records, null, 2)
  saveDownload(content, `${datasetName(version.datasetId)}-v${version.number}.${format}`, format === 'md' ? 'text/markdown;charset=utf-8' : 'application/json;charset=utf-8')
  const dataset = state.datasets.find(dataset => dataset.id === version.datasetId)
  if (dataset) dataset.downloads = (dataset.downloads || 0) + 1
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
  Object.assign(state, ensureProjects(ensureChatSessions(initialData()))); notify('已恢复初始演示数据')
}
