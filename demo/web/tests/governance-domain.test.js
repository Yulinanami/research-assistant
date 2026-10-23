import { migrateWorkspace as mainMigrateWorkspace } from '../src/workspace.js'
import { initialData as mainInitialData, seedGovernanceExamples, addIndustryDatasets, addGovernanceDemoDatasets, addContentGovernance } from '../src/data.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { ensureClassifications, saveClassification, removeClassification, assignDatasetClassification } from '../src/domain.js'
import { clearLegacyFieldGovernance, clearLifecycleStandards } from '../src/domain.js'
import { ensureLifecycleGovernance, reviseStandard, confirmManualStandard, storageInfoFor, buildDatasetTrace, publicationEvidence, governanceMetrics, serviceAccess, qualityFingerprint, contentFieldsFor, mapContentRecords, parseCsvRecords, runQualityReport, qualityGateIssues, updateQualityIssue, ensureGovernance, validateGovernance, nextDatasetCode, canDownload, createVersion, reviewVersion, publishVersion, splitText, cleanText, cleanImages, isDatasetVersion, augmentRecords, exportRecords,  isVersionAuthorized, submitVersionReview } from '../src/domain.js'

function initialData() { return addIndustryDatasets(mainInitialData()) }
function migrateWorkspace(data) { ensureGovernance(data); return mainMigrateWorkspace(data) }

test('移除流程和元数据规范：清理规则、绑定与检查记录，保留原始内容及审核授权', () => {
  const data=ensureClassifications(ensureGovernance(initialData()))
  addContentGovernance(data);ensureLifecycleGovernance(data);seedGovernanceExamples(data)
  saveClassification(data,null,{kind:'type',code:'CUSTOM',name:'自定义记录'},'管理员')
  const original=JSON.stringify({records:data.versions.map(item=>item.records),statuses:data.versions.map(item=>[item.status,item.reviewNote]),requests:data.requests,classifications:data.classifications,history:data.standardVersions.filter(item=>item.collection==='classifications')})
  const version=data.versions.find(item=>item.release?.evidence)
  const publisher=version.release.evidence.operator
  clearLifecycleStandards(clearLegacyFieldGovernance(data))
  for (const key of ['standards','governanceChecks','manualConfirmations','storagePolicies']) assert.deepEqual(data[key],[])
  assert(data.standardVersions.every(item=>item.collection==='classifications'))
  assert(data.datasets.every(item=>!Object.hasOwn(item,'policyIds')&&!Object.hasOwn(item,'storagePolicyId')))
  assert(!data.usageEvents.some(item=>item.action==='发布检查'))
  for (const key of ['execution','standards','storagePolicy','checkId']) assert.equal(Object.hasOwn(version.release.evidence,key),false)
  assert.equal(version.release.evidence.operator,publisher)
  const evidence=publicationEvidence(data,version,'管理员')
  assert.deepEqual(Object.keys(evidence).sort(),['created','operator','datasetId','versionId','metadata'].sort())
  const cleaned=JSON.stringify(data)
  clearLifecycleStandards(data)
  assert.equal(JSON.stringify(data),cleaned)
  assert.equal(JSON.stringify({records:data.versions.map(item=>item.records),statuses:data.versions.map(item=>[item.status,item.reviewNote]),requests:data.requests,classifications:data.classifications,history:data.standardVersions.filter(item=>item.collection==='classifications')}),original)
  const dataset=data.datasets.find(item=>item.id===version.datasetId)
  Object.assign(dataset,{source:'',format:'自定义格式',type:'自由结构',customDescription:{用途:'自由实验'}})
  version.records.push({自定义字段:{值:[1,'任意内容']}})
  assert.deepEqual(validateGovernance(data,'save',{dataset,versionId:version.id}),[])
  data.requests.push({datasetId:dataset.id,versionId:version.id,user:'管理员',status:'已通过'})
  const response=serviceAccess(data,{datasetId:dataset.id,versionId:version.id},'管理员')
  assert.equal(response.status,200)
  assert.deepEqual(response.records.at(-1),{自定义字段:{值:[1,'任意内容']}})
  assert.equal(serviceAccess(data,{datasetId:dataset.id,versionId:version.id},'未授权用户').status,403)
})

test('清理旧字段规则与报告：移除全部绑定和旧快照，保留数据、分类、授权及其他发布依据', () => {
  const data=ensureClassifications(ensureGovernance(initialData()))
  addContentGovernance(data);ensureLifecycleGovernance(data);seedGovernanceExamples(data)
  const original=JSON.stringify({records:data.versions.map(item=>item.records),classifications:data.classifications,requests:data.requests,status:data.versions.map(item=>item.status)})
  const version=data.versions.find(item=>item.release?.evidence)
  const tag=version.release.tag
  clearLegacyFieldGovernance(data)
  assert.deepEqual(data.terms,[])
  assert.deepEqual(data.fieldTemplates,[])
  assert.deepEqual(data.qualityReports,[])
  assert(!data.standardVersions.some(item=>['terms','fieldTemplates'].includes(item.collection)))
  assert(data.datasets.every(item=>!Object.hasOwn(item,'fieldTemplateId')&&!Object.hasOwn(item,'requiresQuality')))
  assert.equal(Object.hasOwn(version.release.evidence,'fields'),false)
  assert.equal(Object.hasOwn(version.release.evidence,'contentTemplate'),false)
  assert.equal(Object.hasOwn(version.release.evidence,'qualityReportId'),false)
  assert.equal(version.release.tag,tag)
  assert(version.release.evidence.metadata.code)
  const nextEvidence=publicationEvidence(data,version,'管理员')
  for (const key of ['fields','contentTemplate','qualityReportId']) assert.equal(Object.hasOwn(nextEvidence,key),false)
  const cleaned=JSON.stringify(data)
  clearLegacyFieldGovernance(data)
  assert.equal(JSON.stringify(data),cleaned)
  assert.equal(JSON.stringify({records:data.versions.map(item=>item.records),classifications:data.classifications,requests:data.requests,status:data.versions.map(item=>item.status)}),original)
})

test('分类初始化幂等，补齐样例两级领域且不改写历史字段和发布证据', () => {
  const data=initialData()
  ensureGovernance(data)
  const preserved=JSON.stringify({terms:data.terms,versions:data.versions})
  ensureClassifications(data)
  const health=data.datasets.find(item=>item.id==='industry-health')
  assert.equal(data.classifications.find(item=>item.id===health.domainId).name,'医疗健康')
  assert.equal(data.classifications.find(item=>item.id===health.subdomainId).name,'医疗服务')
  const snapshot=JSON.stringify(data.classifications)
  ensureClassifications(data)
  assert.equal(JSON.stringify(data.classifications),snapshot)
  assert.equal(JSON.stringify({terms:data.terms,versions:data.versions}),preserved)
})

test('分类维护限制两级、名称与代码冲突，保护引用和停用状态', () => {
  const data=ensureClassifications(ensureGovernance(initialData()))
  ensureLifecycleGovernance(data)
  const root=saveClassification(data,null,{kind:'domain',code:'LOCAL',name:'自定义领域',parentId:'',enabled:true},'管理员')
  const child=saveClassification(data,null,{kind:'domain',code:'LOCAL-01',name:'试验主题',parentId:root.id,enabled:true},'管理员')
  assert.throws(()=>saveClassification(data,null,{kind:'domain',code:'OTHER',name:'三级',parentId:child.id,enabled:true},'管理员'),/两级/)
  assert.throws(()=>saveClassification(data,null,{kind:'domain',code:'LOCAL-02',name:'试验主题',parentId:root.id},'管理员'),/同名/)
  assert.throws(()=>saveClassification(data,null,{kind:'type',code:'LOCAL',name:'其他类型'},'管理员'),/代码/)
  const type=data.classifications.find(item=>item.kind==='type'&&item.name==='问答对')
  const health=data.datasets.find(item=>item.id==='industry-health')
  assignDatasetClassification(data,health.id,{domainId:root.id,subdomainId:child.id,typeId:type.id})
  assert.equal(health.industry,'自定义领域')
  assert.equal(health.subindustry,'试验主题')
  assert.equal(health.type,'问答对')
  assert.equal(health.classificationSnapshot.subdomain.name,'试验主题')
  assert.throws(()=>removeClassification(data,child.id),/引用/)
  assert.throws(()=>removeClassification(data,root.id),/子类|引用/)
  const otherRoot=data.classifications.find(item=>item.kind==='domain'&&!item.parentId&&item.id!==root.id)
  assert.throws(()=>assignDatasetClassification(data,health.id,{domainId:otherRoot.id,subdomainId:child.id,typeId:type.id}),/二级/)
  saveClassification(data,child.id,{...child,enabled:false},'管理员')
  assert.throws(()=>assignDatasetClassification(data,health.id,{domainId:root.id,subdomainId:child.id,typeId:type.id}),/停用/)
  ensureClassifications(data)
  assert.equal(data.classifications.find(item=>item.id===child.id).enabled,false)
  assert.equal(health.subdomainId,child.id)
  assert(data.standardVersions.some(item=>item.collection==='classifications'&&item.standardId===child.id&&item.revision===2))
  const unused=saveClassification(data,null,{kind:'type',code:'TEMP',name:'临时类别'},'管理员')
  removeClassification(data,unused.id)
  ensureClassifications(data)
  assert.equal(data.classifications.some(item=>item.id===unused.id),false)
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
  const data = ensureGovernance(migrateWorkspace(addGovernanceDemoDatasets(initialData())))
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
  const data=ensureGovernance(migrateWorkspace(addContentGovernance(initialData())))
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
  const data=ensureGovernance(migrateWorkspace(addContentGovernance(initialData())))
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
  const data=ensureGovernance(migrateWorkspace(addContentGovernance(initialData())))
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
  const data=ensureGovernance(migrateWorkspace(addContentGovernance(initialData())))
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
  const data=ensureLifecycleGovernance(ensureGovernance(migrateWorkspace(addContentGovernance(initialData()))))
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
  const data=ensureLifecycleGovernance(ensureGovernance(migrateWorkspace(addContentGovernance(initialData()))))
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
  const data=ensureLifecycleGovernance(ensureGovernance(migrateWorkspace(addContentGovernance(initialData()))))
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
  const data=ensureLifecycleGovernance(ensureGovernance(migrateWorkspace(addContentGovernance(initialData()))))
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
  const data=ensureLifecycleGovernance(ensureGovernance(migrateWorkspace(addContentGovernance(initialData()))))
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
  const data=ensureLifecycleGovernance(ensureGovernance(migrateWorkspace(addContentGovernance(initialData()))))
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


test('合并兼容：保留加工模块已有及新建编号，治理仍检查编号唯一与不可变', () => {
  const data=ensureGovernance(initialData())
  const dataset=data.datasets[0]
  for (const code of ['DS-0001','DS-7F34AB21']) {
    dataset.code=code
    assert.ok(!validateGovernance(data,'publish',{dataset}).some(issue=>issue.field==='code'))
    assert.ok(validateGovernance(data,'publish',{dataset:{...dataset,code:'DS-0002'}}).some(issue=>issue.field==='code'))
  }
  data.datasets[1].code=dataset.code
  assert.ok(validateGovernance(data,'publish',{dataset}).some(issue=>issue.field==='code'))
})
