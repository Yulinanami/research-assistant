import { reactive } from 'vue'
import { isDatasetVersion } from './domain.js'

export const demoRoles = ['管理员', '加工人员', '审核人员', '数据使用者']
const sessionKey = 'research-platform-demo-session'
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
  if (!authenticated) return 'home'
  const aliases = { annotation: 'generation', models: 'settings', statistics: 'workbench', review: 'audit' }
  const page = aliases[requested] || requested
  return pageIds.includes(page) ? page : 'workbench'
}

export function publicRecommendations(data) {
  return data.datasets.filter(dataset => dataset.level === '公开').map(dataset => {
    const latest = data.versions.filter(version => version.datasetId === dataset.id && version.status === '已发布' && isDatasetVersion(version)).sort((a,b) => b.number - a.number)[0]
    return latest ? { id: dataset.id, name: dataset.name, type: dataset.type, tags: dataset.tags || [], summary: latest.release?.title || dataset.demand || '', count: latest.records.length } : null
  }).filter(Boolean)
}
