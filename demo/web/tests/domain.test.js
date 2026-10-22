import { initialData, seedGovernanceExamples, addIndustryDatasets, addGovernanceDemoDatasets, addContentGovernance } from '../src/data.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { ensureLifecycleGovernance, reviseStandard, confirmManualStandard, storageInfoFor, buildDatasetTrace, publicationEvidence, governanceMetrics, serviceAccess, qualityFingerprint, contentFieldsFor, mapContentRecords, parseCsvRecords, runQualityReport, qualityGateIssues, updateQualityIssue, ensureGovernance, validateGovernance, nextDatasetCode, canDownload, createVersion, reviewVersion, publishVersion, splitText, cleanText, cleanImages, isDatasetVersion, augmentRecords, exportRecords, ensureProjects, isVersionAuthorized, ensureChatSessions, createChatSession, selectChatSession } from '../src/domain.js'

test('下载授权必须属于当前用户和当前发布版本', () => {
  const version = { id: 'v1', status: '已发布' }
  const requests = [{ user: '数据使用者', versionId: 'v1', status: '已通过' }]
  assert.equal(canDownload(version, requests, '数据使用者'), true)
  assert.equal(canDownload({ ...version, id: 'v2' }, requests, '数据使用者'), false)
  assert.equal(canDownload(version, requests, '加工人员'), false)
  assert.equal(canDownload({ ...version, status: '待审核' }, requests, '数据使用者'), false)
})

test('新版本保留来源而不修改已发布内容', () => {
  const previous = { id: 'v1', datasetId: 'd1', number: 1, status: '已发布', records: [{ answer: '原答案' }] }
  const next = createVersion([previous], 'd1', [{ answer: '修订答案' }], '问答增强', 'v1')
  assert.equal(next.number, 2)
  assert.equal(next.status, '草稿')
  assert.equal(next.sourceId, 'v1')
  assert.equal(previous.records[0].answer, '原答案')
})

test('未通过审核不能发布，退回记录保留意见', () => {
  const version = { status: '待审核' }
  assert.throws(() => publishVersion(version), /审核/)
  reviewVersion(version, false, '补全来源')
  assert.equal(version.status, '已退回')
  assert.equal(version.reviewNote, '补全来源')
  version.status = '待审核'
  reviewVersion(version, true, '通过')
  publishVersion(version, { tag: 'v1.0.0', title: '首个发布', notes: '已核对参考材料' })
  assert.equal(version.status, '已发布')
})

test('分隔符切片和清洗配置影响输出', () => {
  assert.equal(splitText('第一段\n\n第二段', { chunkType: '分隔符', separator: '\\n\\n', size: 100 }).length, 2)
  assert.equal(JSON.parse(cleanText('[{"id":1},{"id":1},{"id":2}]', ['文档去重'])).length, 2)
  assert.equal(cleanText('<think>分析\n过程</think>最终答案', ['移除think标签']), '最终答案')
})

test('导出采用修订答案并保留原始答案', () => {
  const record = { question: '问题', answer: '原回答', correctedAnswer: '修订回答' }
  assert.equal(exportRecords([record])[0].answer, '修订回答')
  assert.equal(exportRecords([record])[0].originalAnswer, '原回答')
  assert.equal(record.answer, '原回答')
})


test('图片清洗按规则区分重复、低分辨率和模糊，且保留原始信息', () => {
  const images = [
    { name: '正常', content: 'image-a', width: 900, height: 500, clarity: 90, format: 'SVG' },
    { name: '重复', content: 'image-a', width: 900, height: 500, clarity: 90, format: 'SVG' },
    { name: '低分辨率', content: 'image-b', width: 180, height: 100, clarity: 90, format: 'SVG' },
    { name: '模糊', content: 'image-c', width: 900, height: 500, clarity: 25, format: 'SVG' },
  ]
  const config = { rules: ['重复图片去重', '质量筛选', '格式标准化'], minWidth: 300, minHeight: 200, minClarity: 60, maxWidth: 600, maxHeight: 600, imageFormat: 'PNG' }
  const results = cleanImages(images, config)
  assert.deepEqual(results.map(r => r.status), ['保留', '过滤', '过滤', '过滤'])
  assert.deepEqual(results.slice(1).map(r => r.reason), ['重复图片', '分辨率低于阈值', '清晰度低于阈值'])
  assert.deepEqual(results[0].after, { width: 600, height: 333, format: 'PNG' })
  assert.equal(images[0].width, 900)
  assert.equal(images[0].format, 'SVG')
  assert.equal(cleanImages(images, { rules: [] }).filter(r => r.status === '保留').length, 4)
  assert.equal(cleanImages([images[2]], { rules: ['格式标准化'], maxWidth: 600, maxHeight: 600, imageFormat: 'JPEG' })[0].after.width, 180)
  assert.ok(cleanImages(images, { ...config, minClarity: 100 }).every(r => r.status === '过滤'))
})


test('加工成果不占数据集版本编号，历史记录不删除不重排', () => {
  const old = [
    { id: 'raw', datasetId: 'd', number: 1, type: '条目导入', records: [] },
    { id: 'parsed', datasetId: 'd', number: 8, type: 'PDF解析', records: [] },
  ]
  assert.equal(isDatasetVersion(old[1]), false)
  const chunk = createVersion(old, 'd', [{ content: '片段' }], '知识片段', 'parsed')
  assert.equal(chunk.number, null)
  assert.equal(chunk.kind, 'processing')
  const qa = createVersion([...old, chunk], 'd', [{ question: '问题', answer: '回答' }], '问答生成', chunk.id)
  assert.equal(qa.number, 2)
  assert.equal(qa.kind, 'dataset')
  assert.equal(qa.parentVersionId, 'raw')
  assert.equal(old[1].number, 8)
  const second = createVersion([...old, chunk, qa], 'd', qa.records, '问答增强', qa.id)
  assert.equal(second.number, 3)
  assert.equal(second.parentVersionId, qa.id)
})

test('增强版本保存原问答和增强问答的完整快照，原版本及修订答案保持不变', () => {
  const original = [{ question: '采样深度？', answer: '错误', correctedAnswer: '0—20厘米', label: '可用', rating: 5 }]
  const enhanced = augmentRecords(original, '初学者')
  assert.equal(enhanced.length, 2)
  assert.deepEqual(enhanced[0], original[0])
  assert.equal(enhanced[1].answer, '0—20厘米')
  assert.equal(enhanced[1].label, '')
  assert.equal(enhanced[1].correctedAnswer, undefined)
  enhanced[0].answer = '新内容'
  assert.equal(original[0].answer, '错误')
})

test('加工成果不能被标记为数据集发布版本', () => {
  const processing = { type: 'PDF解析', kind: 'processing', status: '已通过' }
  assert.throws(() => publishVersion(processing), /数据集版本/)
  const version = { type: '问答增强', kind: 'dataset', status: '已通过' }
  publishVersion(version, { tag: 'v1.0.0', title: '首个发布', notes: '已核对参考材料' })
  assert.equal(version.status, '已发布')
  assert.ok(version.published)
})


test('发布必须填写信息且Tag在同数据集中唯一，失败不改变数据与状态', () => {
  const existing = { id: 'one', datasetId: 'd', release: { tag: 'v1.0.0' } }
  const version = { id: 'two', datasetId: 'd', status: '已通过', records: [{ question: '问题', answer: '答案' }] }
  const details = { tag: 'v2.0.0', title: '第二版', notes: '新增问答，修正数值' }
  assert.throws(() => publishVersion(version, {}), /Tag/)
  assert.throws(() => publishVersion(version, { ...details, title: ' ' }), /标题/)
  assert.throws(() => publishVersion(version, { ...details, notes: '' }), /说明/)
  assert.throws(() => publishVersion(version, { ...details, tag: '带空格 tag' }), /Tag/)
  assert.throws(() => publishVersion(version, { ...details, tag: 'v1.0.0' }, [existing]), /已存在/)
  assert.equal(version.status, '已通过')
  const before = JSON.stringify(version.records)
  publishVersion(version, { ...details, tag: ' v2.0.0 ' }, [existing], '审核人员')
  assert.equal(version.release.tag, 'v2.0.0')
  assert.equal(version.release.title, '第二版')
  assert.equal(version.release.notes, details.notes)
  assert.equal(version.release.publisher, '审核人员')
  assert.equal(version.release.versionId, version.id)
  assert.equal(version.release.publishedAt, version.published)
  assert.equal(JSON.stringify(version.records), before)
  assert.throws(() => publishVersion(version, details, []), /已发布/)
  const other = { id: 'other', datasetId: 'different', status: '已通过', records: [] }
  publishVersion(other, { ...details, tag: 'v1.0.0' }, [existing], '管理员')
  assert.equal(other.status, '已发布')
})

test('历史发布信息补录保留原发布时间、版本关联和内容', () => {
  const legacy = { id: 'legacy', datasetId: 'd', status: '已发布', published: '2026/10/20 09:30:00', records: [{ answer: '原内容' }] }
  publishVersion(legacy, { tag: 'v1.0.0', title: '首版资料', notes: '补充既有发布介绍' }, [], '管理员')
  assert.equal(legacy.published, '2026/10/20 09:30:00')
  assert.equal(legacy.release.publishedAt, legacy.published)
  assert.equal(legacy.release.versionId, 'legacy')
  assert.equal(legacy.records[0].answer, '原内容')
})


test('旧项目迁移保留ID及授权，多数据集归属同一项目且重复迁移不变', () => {
  const data = { datasets: [{ id: 'a', project: '科研' }, { id: 'b', project: '科研' }, { id: 'c' }], activeDataset: 'b', versions: [{ id: 'v', datasetId: 'a' }], requests: [{ versionId: 'v' }] }
  ensureProjects(data)
  assert.equal(data.projects.length, 2)
  assert.equal(data.datasets[0].projectId, data.datasets[1].projectId)
  assert.equal(data.activeProject, data.datasets[1].projectId)
  assert.equal(data.datasets[2].project, '默认项目')
  assert.equal(data.versions[0].id, 'v')
  assert.equal(data.requests[0].versionId, 'v')
  const ids = data.projects.map(p => p.id)
  ensureProjects(data)
  assert.deepEqual(data.projects.map(p => p.id), ids)
})


test('自己的数据无需授权，他人数据只授权审批通过的版本', () => {
  const dataset = { id: 'd', owner: '创建者' }
  const version = { id: 'v1', datasetId: 'd', status: '已发布', kind: 'dataset' }
  const selfRequest = [{ versionId: 'v1', user: '创建者', status: '已通过' }]
  assert.equal(isVersionAuthorized(version, selfRequest, '创建者', dataset), false)
  assert.equal(canDownload(version, [], '创建者', dataset), true)
  assert.equal(canDownload(version, [], '申请者', dataset), false)
  const requests = [{ versionId: 'v1', user: '申请者', status: '已通过' }]
  assert.equal(isVersionAuthorized(version, requests, '申请者', dataset), true)
  assert.equal(canDownload(version, requests, '申请者', dataset), true)
  assert.equal(canDownload({ ...version, id: 'v2' }, requests, '申请者', dataset), false)
  assert.equal(canDownload({ ...version, status: '草稿' }, [], '创建者', dataset), false)
})


test('行业样例补充10个且不覆盖旧内容，推荐6个，重复加载不追加', () => {
  const data = { datasets: [{ id: 'my-data', name: '用户数据', owner: '管理员' }], versions: [{ id: 'my-version', datasetId: 'my-data', records: [{ content: '原内容' }] }], sources: [], requests: [{ id: 'my-request' }] }
  const original = JSON.stringify(data)
  addIndustryDatasets(data)
  assert.equal(data.datasets.length, 11)
  assert.equal(new Set(data.datasets.slice(1).map(d=>d.industry)).size, 10)
  assert.ok(new Set(data.datasets.slice(1).map(d=>d.type)).size >= 5)
  assert.equal(data.datasets.filter(d=>d.recommendationRank).length, 6)
  assert.equal(data.datasets.filter(d=>d.owner==='管理员').length, 1)
  for (const dataset of data.datasets.slice(1)) {
    const version = data.versions.find(v=>v.datasetId===dataset.id)
    assert.equal(version.status, '已发布')
    assert.equal(version.release.versionId, version.id)
    assert.ok(version.records.length > 0)
    assert.ok(data.sources.some(source=>source.id===version.sourceId))
  }
  assert.equal(JSON.stringify({ datasets: data.datasets.slice(0,1), versions: data.versions.slice(0,1), sources: [], requests: data.requests.filter(request=>!request.id?.startsWith('sample-approved-')) }),original)
  const count = data.datasets.length
  addIndustryDatasets(data)
  assert.equal(data.datasets.length,count)
  data.datasets.pop()
  addIndustryDatasets(data)
  assert.equal(data.datasets.length,count-1)
  assert.equal(initialData().datasets.length,12)
})


test('旧聊天迁入历史且重复初始化不复制、不丢失消息', () => {
  const oldMessages = [{role:'您',text:'原问题'},{role:'模型',text:'原回答'}]
  const data = { role:'管理员', conversations:oldMessages }
  ensureChatSessions(data)
  assert.equal(data.chatSessions.length,1)
  assert.deepEqual(data.chatSessions[0].messages,oldMessages)
  assert.equal(data.chatSessions[0].title,'原问题')
  ensureChatSessions(data)
  assert.equal(data.chatSessions.length,1)
})

test('新建和切换会话保留各自草稿模型消息，空白聊天不重复创建', () => {
  const data = {role:'管理员',conversations:[]}
  const first = createChatSession(data,'model-a')
  assert.equal(createChatSession(data,'model-a').id,first.id)
  first.draft='未发送内容'
  const second=createChatSession(data,'model-b')
  assert.notEqual(second.id,first.id)
  second.messages.push({role:'您',text:'第二段内容'})
  assert.equal(selectChatSession(data,first.id),true)
  assert.equal(data.chatSessions.find(s=>s.id===data.activeChatId).draft,'未发送内容')
  assert.equal(data.chatSessions.find(s=>s.id===data.activeChatId).modelId,'model-a')
  assert.equal(data.conversations.length,0)
  selectChatSession(data,second.id)
  assert.equal(data.conversations[0].text,'第二段内容')
  data.role='其他用户'
  assert.equal(selectChatSession(data,first.id),false)
  ensureChatSessions(data)
  assert.equal(data.activeChatId,'')
  assert.equal(data.chatSessions.length,2)
})


test('内置样例预设下载基数，旧下载累计保留，重复加载不加倍且不修改自建数据', () => {
  const fresh = initialData()
  assert.equal(fresh.datasets.length, 12)
  assert.ok(fresh.datasets.filter(dataset=>dataset.id!=='paper').every(dataset => dataset.downloads > 0))
  assert.equal(fresh.datasets.find(dataset=>dataset.id==='paper').downloads,0)
  const sorted = fresh.datasets.filter(dataset => fresh.versions.some(version => version.datasetId === dataset.id && version.status === '已发布' && isDatasetVersion(version))).sort((a,b) => b.downloads - a.downloads).slice(0,6)
  assert.deepEqual(sorted.map(dataset => dataset.id), ['industry-traffic','industry-health','industry-retail','industry-finance','industry-agriculture','industry-industry'])
  const saved = { ...fresh, datasets: [{ id:'soil', downloads:5 }, { id:'my-dataset', downloads:9 }] }
  addIndustryDatasets(saved)
  assert.equal(saved.datasets[0].downloads, 1373)
  assert.deepEqual(saved.datasets[1], { id:'my-dataset', downloads:9 })
  saved.datasets[0].downloads++
  addIndustryDatasets(saved)
  assert.equal(saved.datasets[0].downloads, 1374)
})


test('内置样例补充个人用户ID和完整简介，旧记录与自建数据保持', () => {
  const data = initialData()
  assert.ok(data.datasets.every(dataset => /^[a-z0-9_]+$/.test(dataset.publisherId)))
  assert.equal(data.versions.find(version => version.id === 'soil-v1').release.publisher, 'lin_chen_073')
  assert.ok(data.datasets.every(dataset => dataset.introduction.length > 100))
  const own = { id:'own-profile', owner:'管理员', demand:'自己的介绍' }
  const saved = { ...data, datasets:[{ id:'industry-health', downloads:7, downloadsSeeded:true }, own] }
  addIndustryDatasets(saved)
  assert.equal(saved.datasets[0].publisherId, 'nina_wang_218')
  assert.equal(saved.datasets[0].downloads, 7)
  saved.datasets[0].introduction = '用户修改后的介绍'
  addIndustryDatasets(saved)
  assert.equal(saved.datasets[0].introduction, '用户修改后的介绍')
  assert.deepEqual(saved.datasets[1], own)
})


test('样例发布历史数量和Tag各不相同，已有版本保持且重复加载不追加', () => {
  const data = initialData()
  const published = data.datasets.map(dataset => data.versions.filter(version => version.datasetId === dataset.id && version.status === '已发布')).filter(versions => versions.length)
  assert.equal(published.length, 11)
  assert.ok(new Set(published.map(versions => versions.length)).size >= 4)
  assert.ok(published.every(versions => versions.length >= 2))
  const traffic = data.versions.filter(version => version.datasetId === 'industry-traffic').sort((a,b) => b.number - a.number)
  assert.equal(traffic.length, 6)
  assert.equal(traffic[0].release.tag, 'v2.3.1')
  assert.notEqual(traffic[0].records, traffic[1].records)
  const before = JSON.stringify(data.versions)
  addIndustryDatasets(data)
  assert.equal(JSON.stringify(data.versions), before)
  const saved = initialData()
  saved.versions = saved.versions.filter(version => !version.id.startsWith('sample-'))
  delete saved.datasets.find(dataset => dataset.id === 'industry-health').sampleVersionsSeeded
  const ownVersion = { id:'user-health-version', datasetId:'industry-health', number:42, records:[{ content:'用户原内容' }], status:'草稿' }
  saved.versions.push(ownVersion)
  addIndustryDatasets(saved)
  assert.deepEqual(ownVersion, { id:'user-health-version', datasetId:'industry-health', number:42, records:[{ content:'用户原内容' }], status:'草稿' })
  assert.equal(Math.max(...saved.versions.filter(version => version.datasetId === 'industry-health').map(version => version.number)), 42)
})


test('样例发布时间错开且历史递增，迁移保留用户时间与重复加载结果', () => {
  const data = initialData()
  const times = []
  for (const dataset of data.datasets) {
    const versions = data.versions.filter(version => version.datasetId === dataset.id && version.status === '已发布').sort((a,b) => a.number - b.number)
    if (!versions.length) continue
    const stamps = versions.map(version => Date.parse(version.release.publishedAt))
    assert.ok(stamps.every((stamp, index) => !index || stamp > stamps[index-1]))
    times.push(versions.at(-1).release.publishedAt)
  }
  assert.equal(new Set(times).size, 11)
  assert.ok(new Set(times.map(time => time.slice(0,7))).size >= 6)
  assert.ok(Math.max(...times.map(Date.parse)) - Math.min(...times.map(Date.parse)) > 150 * 86400000)
  const health = data.datasets.find(dataset => dataset.id === 'industry-health')
  delete health.sampleReleaseTimesSeeded
  const userVersion = { id:'user-time', datasetId:health.id, number:99, status:'已发布', published:'2026/10/22 08:31:00', release:{publishedAt:'2026/10/22 08:31:00'} }
  data.versions.push(userVersion)
  addIndustryDatasets(data)
  assert.equal(userVersion.release.publishedAt, '2026/10/22 08:31:00')
  const before = JSON.stringify(data.versions)
  addIndustryDatasets(data)
  assert.equal(JSON.stringify(data.versions), before)
})


test('样例总量各异且历史版本递增，总量与预览分开，用户记录保持', () => {
  const data = initialData(), totals = []
  for (const dataset of data.datasets) {
    const versions = data.versions.filter(version => version.datasetId === dataset.id && version.status === '已发布').sort((a,b)=>a.number-b.number)
    if (!versions.length) continue
    assert.ok(versions.every(version => version.totalRecords > version.records.length))
    assert.ok(versions.every((version,index) => !index || version.totalRecords > versions[index-1].totalRecords))
    totals.push(versions.at(-1).totalRecords)
  }
  assert.equal(new Set(totals).size, 11)
  const userVersion = { id:'user-scale',datasetId:'industry-health',number:99,status:'已发布',records:[{question:'用户数据'}] }
  data.versions.push(userVersion)
  const before = JSON.stringify(data.versions)
  addIndustryDatasets(data)
  assert.equal(JSON.stringify(data.versions),before)
  assert.equal(userVersion.totalRecords,undefined)
})


test('治理规则：编号补齐稳定且新编号唯一，旧文字规范保留', () => {
  const data = initialData()
  ensureGovernance(data)
  const before = data.datasets.map(d => d.code)
  assert.equal(new Set(before).size, data.datasets.length)
  assert.ok(before.every(code => /^DS-\d{4}-\d{6}$/.test(code)))
  ensureGovernance(data)
  assert.deepEqual(data.datasets.map(d => d.code), before)
  assert.ok(!before.includes(nextDatasetCode(data.datasets)))
  assert.ok(data.standards.some(s => s.id === 'std1'))
})

test('治理规则：元数据缺失阻止保存和发布，补齐可继续，停用不约束', () => {
  const data = ensureGovernance(initialData())
  const dataset = data.datasets.find(d => d.id === 'soil')
  const rule = data.standards.find(r => r.field === 'source')
  const draft = {...dataset, source:''}
  assert.ok(validateGovernance(data, 'save', {dataset:draft}).some(i => i.field === 'source' && i.action === '阻止操作'))
  assert.ok(validateGovernance(data, 'publish', {dataset:draft}).some(i => i.field === 'source'))
  assert.equal(validateGovernance(data, 'publish', {dataset}).length,0)
  rule.enabled = false
  assert.equal(validateGovernance(data, 'publish', {dataset:draft}).length,0)
})

test('治理规则：采集限制格式和大小，规则可仅提示，禁用后不约束', () => {
  const data = ensureGovernance(initialData())
  const dataset = data.datasets[0]
  const rule = data.standards.find(r => r.id === 'policy-collection')
  rule.fileTypes = 'PDF,TXT'; rule.maxMB = 1
  assert.equal(validateGovernance(data,'import',{dataset,file:{name:'sample.txt',size:10}}).length,0)
  assert.ok(validateGovernance(data,'import',{dataset,file:{name:'sample.exe',size:10}}).length)
  assert.ok(validateGovernance(data,'import',{dataset,file:{name:'sample.txt',size:1048577}}).length)
  rule.action = '仅提示'
  assert.ok(validateGovernance(data,'import',{dataset,file:{name:'sample.exe',size:10}}).every(i => i.action === '仅提示'))
  rule.enabled = false
  assert.equal(validateGovernance(data,'import',{dataset,file:{name:'sample.exe',size:10}}).length,0)
})

test('治理规则：重复编号、枚举及数值范围校验；内部共享不绕过指定版本授权', () => {
  const data = ensureGovernance(initialData())
  const dataset = data.datasets[0]
  const copy = {...dataset,id:'new',code:dataset.code}
  assert.ok(validateGovernance(data,'save',{dataset:copy}).some(i=>i.field==='code'))
  assert.ok(validateGovernance(data,'save',{dataset:{...dataset,level:'无效'}}).some(i=>i.field==='level'))
  data.standards.push({id:'scale-rule',category:'元数据规范',field:'scale',name:'规划量',dataType:'数值',required:true,min:10,max:1000,enabled:true})
  data.standards.find(r=>r.id==='policy-storage').metadataFields.push('scale')
  assert.ok(validateGovernance(data,'save',{dataset:{...dataset,scale:1}}).some(i=>i.field==='scale'))
  data.standards.find(r=>r.id==='policy-security').internalSharing='禁止共享'
  dataset.policyIds=['policy-storage']
  assert.ok(validateGovernance(data,'request',{dataset}).length)
  const version=data.versions.find(v=>v.datasetId==='industry-health'&&v.status==='已发布')
  assert.equal(canDownload(version,[],'管理员',data.datasets.find(d=>d.id===version.datasetId)),false)
})


test('规范演示样例：两个未发布数据集分别触发等级和采集来源规则，修正后通过', () => {
  const data = ensureGovernance(ensureProjects(addGovernanceDemoDatasets(initialData())))
  const meta = data.datasets.find(d=>d.id==='governance-demo-metadata')
  const collection = data.datasets.find(d=>d.id==='governance-demo-collection')
  for (const dataset of [meta,collection]) {
    assert.equal(dataset.owner,data.role)
    assert.equal(dataset.downloads,0)
    assert.equal(dataset.project,'规范约束演示')
    assert.ok(data.versions.some(v=>v.datasetId===dataset.id && v.records.length))
    assert.ok(!data.versions.some(v=>v.datasetId===dataset.id && v.status==='已发布'))
  }
  assert.ok(validateGovernance(data,'publish',{dataset:meta}).some(i=>i.field==='level'))
  meta.level='内部'
  assert.equal(validateGovernance(data,'publish',{dataset:meta}).length,0)
  assert.ok(validateGovernance(data,'import',{dataset:collection,file:{name:'data.txt',size:20}}).some(i=>i.field==='source'))
  collection.source='流域监测站观测记录'
  assert.equal(validateGovernance(data,'import',{dataset:collection,file:{name:'data.txt',size:20}}).length,0)
  addGovernanceDemoDatasets(data)
  assert.equal(data.datasets.filter(d=>d.id.startsWith('governance-demo-')).length,2)
  assert.equal(collection.source,'流域监测站观测记录')
  data.datasets=data.datasets.filter(d=>d.id!==meta.id)
  addGovernanceDemoDatasets(data)
  assert.ok(!data.datasets.some(d=>d.id===meta.id))
})


test('内容标准引用：只检查绑定字段，CSV映射统一类型且不改原记录', () => {
  const data=ensureGovernance(ensureProjects(addContentGovernance(initialData())))
  const dataset=data.datasets.find(d=>d.id==='quality-demo-soil')
  dataset.fieldMappings={sample_id:'编号',sampling_time:'日期',sampling_depth:'深度',soil_moisture:'含水量'}
  const raw=parseCsvRecords('编号,日期,深度,含水量\nS9,2026-10-01,10,25')
  const mapped=mapContentRecords(data,dataset,raw)
  assert.equal(mapped[0].sampling_depth,10)
  assert.equal(mapped[0].soil_moisture,25)
  assert.equal(raw[0]['深度'],'10')
  assert.ok(contentFieldsFor(data,dataset).some(field=>field.field==='sample_id'))
  assert.equal(contentFieldsFor(data,data.datasets.find(d=>d.id==='industry-health')).length,0)
})

test('质量检查：定位重复、负深度和缺失值；未检查、修改内容或规则后拒绝发布', () => {
  const data=ensureGovernance(ensureProjects(addContentGovernance(initialData())))
  const version=data.versions.find(v=>v.datasetId==='quality-demo-soil')
  assert.ok(qualityGateIssues(data,version).length)
  const report=runQualityReport(data,version,'')
  assert.equal(report.total,4)
  assert.ok(report.issues.some(i=>i.recordIndex===2 && i.field==='sample_id' && i.rule==='唯一'))
  assert.ok(report.issues.some(i=>i.recordIndex===3 && i.field==='sampling_depth'))
  assert.ok(report.issues.some(i=>i.recordIndex===3 && i.field==='soil_moisture'))
  const original=JSON.stringify(version.records)
  const next=createVersion(data.versions,version.datasetId,version.records,'人工修订',version.id)
  next.records[2].sample_id='S004';next.records[3].sampling_depth=15;next.records[3].soil_moisture=22
  data.versions.push(next)
  const passed=runQualityReport(data,next,'')
  assert.equal(passed.issues.length,0)
  assert.equal(qualityGateIssues(data,next).length,0)
  assert.equal(JSON.stringify(version.records),original)
  assert.ok(report.issues.every(i=>i.resolvedInVersionId===next.id))
  assert.ok(qualityGateIssues(data,version).length)
  next.records[0].sampling_depth=-1
  assert.ok(qualityGateIssues(data,next).length)
  next.records[0].sampling_depth=10
  data.terms.find(t=>t.id==='term1').max=5
  assert.ok(qualityGateIssues(data,next).length)
  assert.equal(passed.rules.find(t=>t.id==='term1').max,200)
})

test('人工复核有负责人和意见，不能手工消除自动错误，历史报告不删除', () => {
  const data=ensureGovernance(ensureProjects(addContentGovernance(initialData())))
  const version=data.versions.find(v=>v.datasetId==='quality-demo-qa')
  const report=runQualityReport(data,version,'核对回答依据')
  const automatic=report.issues.find(i=>i.kind==='automatic')
  assert.throws(()=>updateQualityIssue(report,automatic.id,{resolution:'确认无误',note:'已检查'},'审核人员'))
  const manual=report.issues.find(i=>i.kind==='manual')
  assert.throws(()=>updateQualityIssue(report,manual.id,{resolution:'确认无误',note:''},'审核人员'))
  updateQualityIssue(report,manual.id,{owner:'陈老师',resolution:'确认无误',note:'已核对来源'},'审核人员')
  assert.equal(manual.status,'已确认')
  assert.equal(manual.owner,'陈老师')
  assert.equal(manual.history[0].operator,'审核人员')
  const repeated=runQualityReport(data,version,'')
  assert.ok(repeated.issues.some(issue=>issue.kind==='manual'))
  assert.equal(data.qualityReports.filter(r=>r.versionId===version.id).length,2)
})


test('字段规则变更只影响引用它的数据集，手工复核要求不会随切页丢失', () => {
  const data=ensureGovernance(ensureProjects(addContentGovernance(initialData())))
  const soil=data.versions.find(v=>v.datasetId==='quality-demo-soil')
  const qa=data.versions.find(v=>v.datasetId==='quality-demo-qa')
  const before=qualityFingerprint(data,qa)
  data.terms.find(term=>term.id==='term1').max=10
  assert.equal(qualityFingerprint(data,qa),before)
  assert.ok(runQualityReport(data,soil,'').issues.some(issue=>issue.rule==='范围'))
  const report=runQualityReport(data,qa,'')
  assert.equal(report.issues.filter(issue=>issue.kind==='manual').length,3)
  const next=createVersion(data.versions,qa.datasetId,qa.records,'人工修订',qa.id)
  data.versions.push(next)
  assert.ok(runQualityReport(data,next,'').issues.some(issue=>issue.kind==='manual'))
})


test('标准修订快照不随编辑变化，人工确认限定版本与修订', () => {
  const data=ensureLifecycleGovernance(ensureGovernance(ensureProjects(addContentGovernance(initialData()))))
  const original=data.standards.find(rule=>rule.id==='policy-publish')
  reviseStandard(data,'standards',original.id,{...original,executionMode:'人工确认'},'管理员')
  const dataset=data.datasets[0]
  assert.ok(validateGovernance(data,'publish',{dataset,versionId:'test-v1'}).some(issue=>issue.ruleId===original.id))
  confirmManualStandard(data,original.id,dataset.id,'test-v1','已核对授权范围','审核人员')
  assert.ok(!validateGovernance(data,'publish',{dataset,versionId:'test-v1'}).some(issue=>issue.ruleId===original.id))
  assert.ok(validateGovernance(data,'publish',{dataset,versionId:'test-v2'}).some(issue=>issue.ruleId===original.id))
  const prior=data.standardVersions.find(item=>item.standardId===original.id && item.revision===2)
  reviseStandard(data,'standards',original.id,{...original,name:'新发布标准'},'管理员')
  assert.notEqual(prior.definition.name,original.name)
  assert.ok(validateGovernance(data,'publish',{dataset,versionId:'test-v1'}).some(issue=>issue.ruleId===original.id))
})

test('归档保留数据和既有下载，阻止写入发布申请；存储策略可追溯', () => {
  const data=ensureLifecycleGovernance(ensureGovernance(ensureProjects(addContentGovernance(initialData()))))
  const dataset=data.datasets[0]
  const before=JSON.stringify(data.versions)
  dataset.storageState='已归档'
  for (const operation of ['save','import','publish','request']) assert.ok(validateGovernance(data,operation,{dataset}).some(issue=>issue.field==='storageState'))
  assert.equal(validateGovernance(data,'download',{dataset}).length,0)
  const info=storageInfoFor(data,dataset)
  assert.ok(info.location.includes(dataset.code))
  assert.ok(info.retentionDays>0)
  assert.equal(JSON.stringify(data.versions),before)
})

test('发布依据固定质量报告和标准，时间线只追溯关联来源与版本', () => {
  const data=ensureLifecycleGovernance(ensureGovernance(ensureProjects(addContentGovernance(initialData()))))
  const version=data.versions.find(v=>v.id==='soil-v2')
  const report=runQualityReport(data,version,'')
  const evidence=publicationEvidence(data,version,'管理员')
  assert.equal(evidence.qualityReportId,report.id)
  const before=JSON.stringify(evidence)
  const term=data.terms.find(t=>t.field==='answer')
  reviseStandard(data,'terms',term.id,{...term,description:'修改后的字段定义'},'管理员')
  assert.equal(JSON.stringify(evidence),before)
  const trace=buildDatasetTrace(data,'soil',version.id)
  assert.ok(trace.some(item=>item.kind==='source' && item.sourceId==='src-report'))
  assert.ok(trace.some(item=>item.kind==='version' && item.versionId==='soil-v1'))
  assert.ok(!trace.some(item=>item.sourceId==='src-pdf'))
})

test('服务预览按精确发布版本授权；统计按真实检查对象计算', () => {
  const data=ensureLifecycleGovernance(ensureGovernance(ensureProjects(addContentGovernance(initialData()))))
  const dataset=data.datasets.find(d=>d.id==='industry-health')
  const version=data.versions.find(v=>v.datasetId===dataset.id && v.status==='已发布')
  const service={datasetId:dataset.id,versionId:version.id}
  data.requests=[]
  assert.equal(serviceAccess(data,service,'管理员').status,403)
  data.requests.push({versionId:version.id,user:'管理员',status:'已通过'})
  assert.equal(serviceAccess(data,service,'管理员').status,200)
  assert.equal(serviceAccess(data,{...service,versionId:'missing'},'管理员').status,404)
  const versions=data.versions.filter(v=>v.datasetId==='quality-demo-soil')
  runQualityReport(data,versions[0],'')
  const metrics=governanceMetrics(data,data.datasets.map(d=>d.id))
  assert.ok(metrics.find(metric=>metric.key==='coverage').numerator===1)
  assert.ok(metrics.every(metric=>metric.numerator<=metric.denominator))
})


test('行业内置样例的治理记录完整关联，重复加载不追加且不覆盖用户记录', () => {
  const data=ensureLifecycleGovernance(ensureGovernance(ensureProjects(addContentGovernance(initialData()))))
  const custom={id:'user-dataset',name:'用户自建',owner:'管理员'}
  data.datasets.push(custom)
  const health=data.datasets.find(item=>item.id==='industry-health')
  const latest=data.versions.filter(item=>item.datasetId===health.id).sort((a,b)=>b.number-a.number)[0]
  const releaseBefore=JSON.stringify({...latest.release})
  seedGovernanceExamples(data)
  for (const dataset of data.datasets.filter(item=>item.id.startsWith('industry-'))) {
    assert.ok(contentFieldsFor(data,dataset).length)
    assert.ok(data.storageEvents.some(item=>item.datasetId===dataset.id))
    for (const version of data.versions.filter(item=>item.datasetId===dataset.id && item.status==='已发布')) {
      const report=data.qualityReports.find(item=>item.versionId===version.id)
      assert.ok(report)
      assert.equal(report.total,version.records.length)
      assert.equal(report.fingerprint,qualityFingerprint(data,version))
      assert.ok(version.release.evidence)
      assert.equal(version.release.evidence.qualityReportId,report.id)
      assert.ok(data.governanceChecks.some(item=>item.versionId===version.id))
      assert.ok(data.requests.some(item=>item.versionId===version.id && item.status==='已通过'))
      assert.ok(data.usageEvents.some(item=>item.versionId===version.id))
      assert.ok(data.manualConfirmations.some(item=>item.versionId===version.id && item.operator && item.note && item.created))
      assert.ok(buildDatasetTrace(data,dataset.id,version.id).some(item=>item.kind==='task'))
    }
  }
  const {evidence,...release}=latest.release
  assert.equal(JSON.stringify(release),releaseBefore)
  const snapshot=JSON.stringify(data)
  seedGovernanceExamples(data)
  assert.equal(JSON.stringify(data),snapshot)
  assert.deepEqual(custom,{id:'user-dataset',name:'用户自建',owner:'管理员'})
})


test('行业字典复用通用定义，迁移旧重复项但保留用户修订及历史快照', () => {
  const data=ensureLifecycleGovernance(ensureGovernance(ensureProjects(addContentGovernance(initialData()))))
  seedGovernanceExamples(data)
  for (const field of ['question','answer','reference','title','content','image']) assert.equal(data.terms.filter(term=>term.field===field).length,1,field)
  const health=data.terms.find(term=>term.field==='label' && term.id.includes('health'))
  const government=data.terms.find(term=>term.field==='label' && term.id.includes('government'))
  assert.notEqual(health.name,government.name)
  assert.notEqual(health.allowedValues,government.allowedValues)
  const template=data.fieldTemplates.find(item=>item.id==='industry-finance-content-standard')
  const canonical=data.terms.find(item=>item.id==='field-question')
  const id='industry-finance-field-question'
  data.terms.push({...canonical,id,revision:1,description:'企业财务指标问答数据集中的问题。'})
  template.termIds=template.termIds.map(value=>value===canonical.id?id:value)
  const finance=data.versions.find(version=>version.datasetId==='industry-finance')
  const previousReport=runQualityReport(data,finance)
  const previousSnapshot=JSON.stringify(previousReport)
  const before=JSON.stringify(data.versions.map(version=>version.release?.evidence))
  seedGovernanceExamples(data)
  assert.equal(JSON.stringify(previousReport),previousSnapshot)
  assert.equal(data.qualityReports.find(report=>report.versionId===finance.id).fingerprint,qualityFingerprint(data,finance))
  assert.ok(!data.terms.some(term=>term.id===id))
  assert.ok(template.termIds.includes(canonical.id))
  assert.equal(JSON.stringify(data.versions.map(version=>version.release?.evidence)),before)
  for (const item of data.fieldTemplates) assert.ok(item.termIds.every(id=>data.terms.some(term=>term.id===id)))
  const snapshot=JSON.stringify(data);seedGovernanceExamples(data);assert.equal(JSON.stringify(data),snapshot)
  data.terms.push({...canonical,id,revision:2,name:'用户自定义问题'})
  seedGovernanceExamples(data)
  assert.ok(data.terms.some(term=>term.id===id && term.name==='用户自定义问题'))
})
