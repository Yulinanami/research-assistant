import { reactive } from 'vue'
import { isDatasetVersion } from './domain.js'

export const demoRoles = ['管理员', '加工人员', '审核人员', '数据使用者']
const sessionKey = 'research-platform-demo-session'
const returnKey = 'research-platform-login-return'
function browserStorage() { try { return globalThis.sessionStorage } catch { return null } }

export function readDemoSession(storage) {
  try {
    const saved = JSON.parse(storage?.getItem(sessionKey) || 'null')
    return demoRoles.includes(saved?.role) ? { role: saved.role } : null
  } catch { return null }
}

export const auth = reactive({ session: readDemoSession(browserStorage()) })
export function loginDemo(role) {
  if (!demoRoles.includes(role)) throw new Error('请选择有效的演示身份')
  auth.session = { role }
  try { browserStorage()?.setItem(sessionKey, JSON.stringify(auth.session)) } catch {}
}
export function logoutDemo() {
  auth.session = null
  try { browserStorage()?.removeItem(sessionKey) } catch {}
}

export function resolveSessionPage(requested, authenticated, pageIds) {
  if (!authenticated) return ['square','login'].includes(requested) ? requested : 'home'
  const aliases = { annotation: 'generation', cleaning: 'processing', 'project-tasks': 'task-center', models: 'settings', statistics: 'workbench', review: 'audit' }
  const page = aliases[requested] || requested
  return pageIds.includes(page) ? page : 'workbench'
}

export function publicCatalog(data) {
  const datasets = [], versions = []
  for (const dataset of data.datasets) {
    if (dataset.level !== '公开' || dataset.storageState === '已归档') continue
    const published = data.versions.filter(version => version.datasetId === dataset.id && version.status === '已发布' && isDatasetVersion(version)).sort((a,b) => b.number - a.number)
    if (!published.length) continue
    datasets.push({ id:dataset.id, code:dataset.code, name:dataset.name, type:dataset.type, industry:dataset.industry, subindustry:dataset.subindustry, domainId:dataset.domainId, subdomainId:dataset.subdomainId, typeId:dataset.typeId, introduction:dataset.introduction || dataset.demand || dataset.scene || '', tags:[...(dataset.tags || [])], coverIcon:dataset.coverIcon, coverTone:dataset.coverTone, publisherId:dataset.publisherId || published[0].release?.publisher || dataset.owner, downloads:dataset.downloads || 0 })
    for (const version of published) versions.push({ id:version.id, datasetId:dataset.id, number:version.number, kind:'dataset', status:'已发布', totalRecords:version.totalRecords ?? version.records?.length ?? 0, records:[], published:version.published, created:version.created, release:version.release ? {tag:version.release.tag,publishedAt:version.release.publishedAt,publisher:version.release.publisher} : undefined })
  }
  const used = new Set(datasets.flatMap(dataset=>[dataset.domainId,dataset.subdomainId,dataset.typeId]).filter(Boolean))
  const classifications = (data.classifications || []).filter(item=>used.has(item.id)).map(item=>({id:item.id,kind:item.kind,name:item.name,parentId:item.parentId}))
  return {datasets,versions,classifications}
}

export function publicRecommendations(data) {
  const catalog = publicCatalog(data)
  return catalog.datasets.sort((a,b) => b.downloads - a.downloads).map(dataset => {
    const latest = catalog.versions.find(version => version.datasetId === dataset.id)
    return { id:dataset.id, name:dataset.name, type:dataset.type, tags:dataset.tags, summary:dataset.introduction, count:latest.totalRecords }
  })
}

export function saveLoginReturn(target, storage = browserStorage()) {
  try {
    if (target?.datasetId && target?.versionId) storage?.setItem(returnKey, JSON.stringify({datasetId:target.datasetId,versionId:target.versionId}))
    else storage?.removeItem(returnKey)
  } catch {}
}

export function takeLoginReturn(storage = browserStorage()) {
  try {
    const target = JSON.parse(storage?.getItem(returnKey) || 'null')
    storage?.removeItem(returnKey)
    return typeof target?.datasetId === 'string' && typeof target?.versionId === 'string' ? target : null
  } catch { return null }
}
