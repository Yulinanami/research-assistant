export const uid = (prefix = 'id') => `${prefix}-${crypto.randomUUID()}`
export const now = () => new Date().toLocaleString('zh-CN', { hour12: false })

export function isDatasetOwner(dataset, user) {
  return Boolean(dataset && (dataset.owner || dataset.ownerId || '管理员') === user)
}

export function isVersionAuthorized(version, requests, user, dataset) {
  return version?.status === '已发布' && isDatasetVersion(version) && !isDatasetOwner(dataset, user) && requests.some(r => r.versionId === version.id && r.user === user && r.status === '已通过')
}

export function canDownload(version, requests, user, dataset) {
  return version?.status === '已发布' && isDatasetVersion(version) && (isDatasetOwner(dataset, user) || isVersionAuthorized(version, requests, user, dataset))
}

export function isDatasetVersion(result) {
  return result?.kind ? result.kind === 'dataset' : !['PDF解析', 'Word解析', 'Excel解析', '文本清洗', '图片清洗', '知识片段', '知识编译', '图片描述', '图像标注', '自动标注'].includes(result?.type)
}

export function createVersion(versions, datasetId, records, type, sourceId = '', kind = isDatasetVersion({ type }) ? 'dataset' : 'processing') {
  const previous = versions.filter(v => v.datasetId === datasetId && isDatasetVersion(v)).sort((a, b) => b.number - a.number)
  const parent = previous.find(v => v.id === sourceId) || previous[0]
  return { id: uid('version'), datasetId, kind,
    number: kind === 'dataset' ? (previous[0]?.number || 0) + 1 : null,
    parentVersionId: kind === 'dataset' ? parent?.id || '' : '',
    status: '草稿', type, sourceId, records: JSON.parse(JSON.stringify(records)), created: now(), reviewNote: '' }
}

export function augmentRecords(records, audience) {
  const originals = JSON.parse(JSON.stringify(records))
  const enhanced = originals.filter(r => r.question && r.status !== '过滤').map(r => {
    const { correctedAnswer, suggestion, ...record } = r
    const baseQuestion = r.augmentation?.baseQuestion || r.question.replace(/^(?:请向[^：\n]{1,80}说明：)+/u, '')
    return { ...record, question: `请向${audience || '科研人员'}说明：${baseQuestion}`, answer: correctedAnswer?.trim() || r.answer,
      augmentation: { baseQuestion, audience: audience || '科研人员' }, label: '', rating: 0 }
  })
  const keyOf = record => JSON.stringify([record.question, record.correctedAnswer?.trim() || record.answer, record.content, record.image, record.status])
  const seen = new Set(originals.map(keyOf))
  const additions = enhanced.filter(record => {
    const key = keyOf(record)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return [...originals, ...additions]
}

export function submitVersionReview(version, submitter = '') {
  if (!isDatasetVersion(version)) throw new Error('中间加工成果保留在项目内，请先建设数据集版本')
  if (!['草稿', '已退回'].includes(version.status)) throw new Error('只有草稿或已退回版本可以提交审核')
  if (!version.records?.length || !version.records.some(record => record.status !== '过滤')) throw new Error('没有可提交的数据')
  version.status = '待审核'
  version.submitted = now()
  version.submittedBy = submitter
}

export function reviewVersion(version, approved, note) {
  if (!isDatasetVersion(version)) throw new Error('中间加工成果不进入正式审核')
  if (version.status !== '待审核') throw new Error('请先提交审核')
  version.status = approved ? '已通过' : '已退回'
  version.reviewNote = note
  version.reviewed = now()
}

export function publishVersion(version, details = {}, versions = [], publisher = '') {
  if (!isDatasetVersion(version)) throw new Error('仅数据集版本可以发布')
  if (version.status === '已发布' && version.release) throw new Error('此版本已发布，请创建新版本后发布')
  if (version.status !== '已通过' && version.status !== '已发布') throw new Error('请先通过审核再发布')
  const tag = details.tag?.trim() || ''
  const title = details.title?.trim() || ''
  const notes = details.notes?.trim() || ''
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(tag)) throw new Error('请填写有效版本Tag，仅支持英文、数字、点、下划线和短横线')
  if (!title) throw new Error('请填写发布标题')
  if (!notes) throw new Error('请填写发布说明')
  if (versions.some(v => v.id !== version.id && v.datasetId === version.datasetId && v.release?.tag === tag)) throw new Error('当前数据集的版本Tag已存在，请使用其他Tag')
  const publishedAt = version.published || now()
  version.release = { tag, title, notes, publisher, publishedAt, versionId: version.id }
  version.status = '已发布'
  version.published = publishedAt
}

export function splitText(text, config) {
  if (config.chunkType === '按段落' && config.paragraphsPerChunk != null) {
    const count = Math.max(1, Math.floor(Number(config.paragraphsPerChunk) || 1))
    const paragraphs = text.split(/\r?\n(?:[\t ]*\r?\n)+/).filter(part => part.trim())
    return Array.from({ length: Math.ceil(paragraphs.length / count) }, (_, index) =>
      paragraphs.slice(index * count, (index + 1) * count).join('\n\n'))
  }
  const size = Math.max(1, Math.floor(Number(config.size) || 180))
  const separator = (config.separator || '\\n\\n').replace(/\\n/g, '\n').replace(/\\t/g, '\t')
  const parts = config.chunkType === '按段落' ? text.split(/\r?\n[\t ]*\r?\n+/)
    : config.chunkType === '分隔符' && separator ? text.split(separator) : [text]
  // New delimiter tasks use the delimiter alone; old task snapshots retain their size limit.
  if (config.chunkType === '分隔符' && config.size == null) return parts.filter(part => part.trim())
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null
  return parts.flatMap(part => {
    const characters = segmenter ? Array.from(segmenter.segment(part), entry => entry.segment) : Array.from(part)
    return Array.from({ length: Math.ceil(characters.length / size) }, (_, i) => characters.slice(i * size, (i + 1) * size).join(''))
  }).filter(s => s.trim())
}

export function cleanText(text, rules) {
  if (rules.includes('文档去重')) {
    try { const parsed = JSON.parse(text); if (Array.isArray(parsed)) text = JSON.stringify([...new Map(parsed.map(r => [JSON.stringify(r), r])).values()], null, 2) }
    catch { text = [...new Set(text.split('\n'))].join('\n') }
  }
  if (rules.includes('隐私脱敏')) text = text.replace(/1[3-9]\d{9}/g, '***********').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]+/g, '[邮箱已脱敏]')
  if (rules.includes('格式标准化')) text = text.replace(/[ \t]+/g, ' ').trim()
  return text
}

export function exportRecords(records) {
  return JSON.parse(JSON.stringify(records)).map(r => r.correctedAnswer?.trim() ? { ...r, originalAnswer: r.answer, answer: r.correctedAnswer } : r)
}


export function cleanImages(images, config) {
  const rules = config.rules || []
  const seenByStep = new Map()
  return images.map(image => {
    let reason = ''
    let width = image.width, height = image.height, format = image.format
    for (const [index, rule] of rules.entries()) {
      if (rule === '重复图片去重') {
        if (!seenByStep.has(index)) seenByStep.set(index, new Set())
        const seen = seenByStep.get(index)
        if (seen.has(image.content)) reason = '重复图片'
        else seen.add(image.content)
      } else if (rule === '质量筛选') {
        if (width < config.minWidth || height < config.minHeight) reason = '分辨率低于阈值'
        else if (image.clarity < config.minClarity) reason = '清晰度低于阈值'
      } else if (rule === '格式标准化') {
        const scale = Math.min(1, (config.maxWidth || 1024) / width, (config.maxHeight || 1024) / height)
        width = Math.max(1, Math.round(width * scale))
        height = Math.max(1, Math.round(height * scale))
        format = config.imageFormat || 'PNG'
      }
      if (reason) break
    }
    return { title: image.name, image: image.content, source: image.name, sourceId: image.id || '', originId: image.originId, status: reason ? '过滤' : '保留', reason: reason || '符合所选规则', clarity: image.clarity,
      before: { width: image.width, height: image.height, format: image.format },
      after: reason ? null : { width, height, format },
      simulated: true }
  })
}

export function nextDatasetCode(datasets) {
  const year = new Date().getFullYear()
  const prefix = `DS-${year}-`
  const largest = Math.max(0, ...datasets.filter(d => d.code?.startsWith(prefix)).map(d => Number(d.code.slice(prefix.length)) || 0))
  return `${prefix}${String(largest + 1).padStart(6, '0')}`
}

export function ensureGovernance(data) {
  data.governanceChecks ||= []
  for (const dataset of data.datasets) {
    dataset.code ||= nextDatasetCode(data.datasets)
    dataset.industry ||= dataset.project || ''
  }
  const fields = [
    ['code','数据集编号','文本',true,''], ['name','数据集名称','文本',true,''],
    ['industry','所属领域','文本',true,''], ['type','数据类型','文本',true,'文本,图片,问答对,文本分类,结构化数据'],
    ['source','数据来源','文本',true,''], ['level','数据等级','文本',true,'公开,内部'],
  ]
  if (!data.governanceRulesSeeded) {
    for (const [field,name,dataType,required,allowedValues] of fields) data.standards.push({id:`metadata-${field}`,category:'元数据规范',field,name,dataType,required,allowedValues,min:0,max:field==='name'?100:500,enabled:true,scope:'全部类型'})
    const keys = fields.map(row=>row[0])
    data.standards.push(
      {id:'policy-collection',category:'全流程标准',name:'资料接入检查',stages:['采集'],metadataFields:['source'],fileTypes:'PDF,DOC,DOCX,XLS,XLSX,TXT,CSV,JSON,JSONL,MD,HTML,XML,YAML,YML,PNG,JPG,JPEG,WEBP,SVG',maxMB:50,enabled:true,scope:'全部类型',action:'阻止操作'},
      {id:'policy-storage',category:'全流程标准',name:'数据集保存检查',stages:['存储'],metadataFields:keys,enabled:true,scope:'全部类型',action:'阻止操作'},
      {id:'policy-publish',category:'全流程标准',name:'数据集发布检查',stages:['共享'],metadataFields:keys,enabled:true,scope:'全部类型',action:'阻止操作'},
      {id:'policy-security',category:'全流程标准',name:'共享安全检查',stages:['安全'],metadataFields:['level'],internalSharing:'申请授权',enabled:true,scope:'全部类型',action:'阻止操作'},
    )
    data.governanceRulesSeeded = true
  }
  return data
}

export function validateGovernance(data, operation, {dataset, file, versionId = ''} = {}) {
  if (!dataset) return [{rule:'数据集关联',field:'datasetId',reason:'找不到关联数据集',action:'阻止操作'}]
  const stages = {import:['采集'],save:['存储'],publish:['共享','安全'],request:['安全'],download:['安全']}[operation] || []
  const applicable = rule => rule.enabled !== false && (!rule.scope || rule.scope === '全部类型' || rule.scope === dataset.type)
  const metadata = data.standards.filter(rule => rule.category === '元数据规范' && rule.field && applicable(rule))
  const policies = data.standards.filter(rule => rule.category === '全流程标准' && applicable(rule) && rule.stages?.some(stage=>stages.includes(stage)) && (!dataset.policyIds?.length || dataset.policyIds.includes(rule.id) || rule.stages.includes('安全')))
  const issues = []
  if (dataset.storageState==='已归档' && ['import','save','publish','request'].includes(operation)) issues.push({rule:'归档保护',field:'storageState',reason:'数据集已归档，请先恢复后再操作',action:'阻止操作'})
  const choices = text => String(text || '').split(/[,，\n]/).map(value=>value.trim()).filter(Boolean)
  for (const policy of policies) {
    const issue = (field,reason) => issues.push({rule:policy.name,ruleId:policy.id,revision:policy.revision || 1,field,reason,action:policy.action || '阻止操作'})
    if (policy.executionMode==='后端保障') continue
    if (policy.executionMode==='人工确认') {
      if (!data.manualConfirmations?.some(item=>item.standardId===policy.id && item.revision===(policy.revision || 1) && item.datasetId===dataset.id && item.versionId===versionId)) issue('confirmation','此对象尚未完成人工确认，或标准修订已变更')
      continue
    }
    for (const rule of metadata.filter(rule=>policy.metadataFields?.includes(rule.field))) {
      const value = dataset[rule.field]
      const empty = value === undefined || value === null || (typeof value === 'string' && !value.trim())
      if (empty) { if (rule.required) issue(rule.field,`${rule.name}为必填项`); continue }
      const validType = rule.dataType === '数值' ? typeof value === 'number' && Number.isFinite(value) : rule.dataType === '布尔' ? typeof value === 'boolean' : rule.dataType === '日期' ? typeof value === 'string' && !Number.isNaN(Date.parse(value)) : typeof value === 'string'
      if (!validType) { issue(rule.field,`${rule.name}必须是${rule.dataType}`); continue }
      const allowed = choices(rule.allowedValues)
      if (allowed.length && !allowed.includes(String(value))) issue(rule.field,`${rule.name}须为：${allowed.join('、')}`)
      if (rule.dataType === '数值' || rule.dataType === '文本') {
        const measure = rule.dataType === '数值' ? value : value.length
        if (rule.min !== undefined && measure < rule.min || rule.max !== undefined && measure > rule.max) issue(rule.field,`${rule.name}${rule.dataType === '文本' ? '长度' : '数值'}须在${rule.min ?? 0}至${rule.max ?? '不限'}之间`)
      }
      if (rule.field === 'code') {
        if (!/^DS-(?:\d{4}-\d{6}|[A-Z0-9]{4,})$/.test(value)) issue('code','数据集编号须采用系统生成的DS编号')
        if (data.datasets.some(other=>other.id!==dataset.id && other.code === value)) issue('code','数据集编号重复')
        const original = data.datasets.find(other=>other.id===dataset.id)
        if (original?.code && original.code !== value) issue('code','数据集编号创建后不能修改')
      }
    }
    if (operation === 'import' && policy.stages.includes('采集') && file) {
      const types = choices(policy.fileTypes).map(value=>value.toUpperCase().replace(/^\./,''))
      const type = file.name.split('.').pop().toUpperCase()
      if (types.length && !types.includes(type)) issue('fileType',`不允许导入${type}格式，允许：${types.join('、')}`)
      if (policy.maxMB > 0 && file.size > policy.maxMB * 1024 * 1024) issue('fileSize',`单文件大小不能超过${policy.maxMB} MB`)
    }
    if (policy.stages.includes('安全') && dataset.level === '内部' && policy.internalSharing === '禁止共享' && (operation !== 'download' || !isDatasetOwner(dataset,data.role))) issue('level','内部数据禁止共享')
  }
  if (['save','publish'].includes(operation) && dataset.storagePolicyId) {
    const policy=data.storagePolicies?.find(item=>item.id===dataset.storagePolicyId)
    if (!policy) issues.push({rule:'存储策略',field:'storagePolicyId',reason:'所选存储策略不存在',action:'阻止操作'})
    else {
      const formats=String(dataset.format || '').split(/[,，、]/).map(value=>value.trim().toLowerCase()).filter(Boolean)
      const allowed=(policy.formats || []).map(value=>value.toLowerCase())
      if (allowed.length && formats.some(value=>!allowed.includes(value))) issues.push({rule:policy.name,ruleId:policy.id,revision:policy.revision,field:'format',reason:`成果格式须为：${policy.formats.join('、')}`,action:'阻止操作'})
    }
  }
  return issues
}


export function contentFieldsFor(data, dataset) {
  const template=data.fieldTemplates?.find(item=>item.id===dataset?.fieldTemplateId)
  return (template?.termIds || []).map(id=>data.terms.find(term=>term.id===id)).filter(term=>term && term.enabled!==false)
}

export function mapContentRecords(data,dataset,records) {
  const fields=contentFieldsFor(data,dataset)
  return records.map(record=>{
    const next={...record}
    for (const field of fields) {
      const key=dataset.fieldMappings?.[field.field] || field.field
      let value=record[key]
      if (value===undefined && key===field.field) value=field.field==='question'?record.instruction:field.field==='answer'?record.output:field.field==='reference'?record.input:undefined
      if (value===undefined) continue
      if (field.type==='数值' && typeof value==='string' && value.trim() && Number.isFinite(Number(value))) value=Number(value)
      if (field.type==='布尔' && ['true','false'].includes(value)) value=value==='true'
      next[field.field]=value
    }
    return next
  })
}

export function parseCsvRecords(text) {
  const rows=[];let row=[],value='',quoted=false
  text=text.replace(/^\uFEFF/,'')
  for (let index=0;index<text.length;index++) {
    const char=text[index]
    if (char==='"') { if (quoted && text[index+1]==='"') {value+='"';index++} else quoted=!quoted }
    else if (!quoted && (char===',' || char==='\n')) {row.push(value);value='';if (char==='\n') {rows.push(row);row=[]}}
    else if (char!=='\r') value+=char
  }
  if (quoted) throw new Error('CSV引号未闭合')
  row.push(value);if (row.some(cell=>cell.trim())) rows.push(row)
  const headers=(rows.shift() || []).map(cell=>cell.trim())
  if (!headers.length || headers.some(header=>!header) || new Set(headers).size!==headers.length) throw new Error('CSV表头为空或重复')
  return rows.filter(row=>row.some(cell=>cell.trim())).map(row=>Object.fromEntries(headers.map((header,index)=>[header,row[index] ?? ''])))
}

function qualityHash(value) {
  const text=JSON.stringify(value);let hash=2166136261
  for (let index=0;index<text.length;index++) {hash^=text.charCodeAt(index);hash=Math.imul(hash,16777619)}
  return `${text.length}-${hash>>>0}`
}
export function qualityFingerprint(data,version) {
  const dataset=data.datasets.find(item=>item.id===version.datasetId)
  return qualityHash({records:version.records,template:dataset?.fieldTemplateId,templateRevision:data.fieldTemplates?.find(item=>item.id===dataset?.fieldTemplateId)?.revision,fields:contentFieldsFor(data,dataset),mappings:dataset?.fieldMappings,manualReview:dataset?.manualReviewInstructions})
}
export function qualityGateIssues(data,version) {
  const dataset=data.datasets.find(item=>item.id===version.datasetId)
  if (!dataset?.fieldTemplateId) return dataset?.requiresQuality ? ['请为数据集选择内容标准模板并执行质量检查'] : []
  const report=data.qualityReports?.find(item=>item.versionId===version.id)
  if (!report) return ['请先对当前版本执行质量检查']
  if (report.fingerprint!==qualityFingerprint(data,version)) return ['内容或字段规则已变更，请重新检查当前版本']
  const count=report.issues.filter(issue=>issue.severity==='阻断' && !(issue.kind==='manual' && issue.status==='已确认')).length
  return count ? [`当前版本仍有${count}个阻断问题，修正或完成人工复核后再继续`] : []
}

export function runQualityReport(data,version,instructions='') {
  if (!isDatasetVersion(version)) throw new Error('质量检查针对数据集版本，请在项目内处理加工成果')
  const dataset=data.datasets.find(item=>item.id===version.datasetId)
  const fields=contentFieldsFor(data,dataset)
  if (!fields.length) throw new Error('请先在项目数据集设置中选择包含启用字段的内容标准模板')
  const rules=JSON.parse(JSON.stringify(fields))
  const prior=data.qualityReports?.find(report=>report.versionId===version.id || report.versionId===version.parentVersionId)
  const required=dataset.manualReviewInstructions?.trim() || ''
  const requested=instructions.trim() || prior?.instructions || ''
  instructions=[...new Set([required,requested].flatMap(text=>text.split('\n')).map(text=>text.trim()).filter(Boolean))].join('\n')
  const issues=[]
  const issue=(recordIndex,field,rule,reason,value,kind='automatic')=>issues.push({id:uid('issue'),recordIndex,field:field.field,fieldName:field.name,rule,reason,value:typeof value==='object'?JSON.stringify(value):String(value ?? ''),kind,severity:field.severity || '阻断',status:kind==='manual'?'待复核':'待处理',owner:dataset.steward || dataset.owner || data.role,note:'',history:[]})
  for (const field of rules) {
    const seen=new Map()
    version.records.forEach((record,index)=>{
      const value=field.field==='answer' ? record.correctedAnswer || record.answer : record[field.field]
      const empty=value===null || value===undefined || typeof value==='string' && !value.trim()
      if (empty) {if (field.required) issue(index,field,'必填',`${field.name}不能为空`,value);return}
      const valid=field.type==='数值'?typeof value==='number' && Number.isFinite(value):field.type==='布尔'?typeof value==='boolean':field.type==='日期'?typeof value==='string' && !Number.isNaN(Date.parse(value)):typeof value==='string'
      if (!valid) issue(index,field,'类型',`${field.name}应为${field.type}`,value)
      const choices=String(field.allowedValues || '').split(/[,，\n]/).map(item=>item.trim()).filter(Boolean)
      if (choices.length && !choices.includes(String(value))) issue(index,field,'允许值',`允许值：${choices.join('、')}`,value)
      if (valid && field.checkRange && ['数值','文本'].includes(field.type)) {
        const measure=field.type==='数值'?value:value.length
        if (measure<field.min || measure>field.max) issue(index,field,'范围',`${field.name}${field.type==='文本'?'长度':''}须在${field.min}—${field.max}${field.unit || ''}范围内`,value)
      }
      if (field.unique) {const key=JSON.stringify(value);if (seen.has(key)) issue(index,field,'唯一',`与第${seen.get(key)+1}条记录重复`,value);else seen.set(key,index)}
    })
  }
  if (instructions.trim()) version.records.forEach((record,index)=>issue(index,{field:'manual',name:'人工复核',severity:'阻断'},'人工复核',instructions,record.question || record.title || record.sample_id || `记录${index+1}`,'manual'))
  const blockedRecords=new Set(issues.map(item=>item.recordIndex))
  const report={id:uid('report'),datasetId:dataset.id,versionId:version.id,versionNumber:version.number,templateName:data.fieldTemplates.find(item=>item.id===dataset.fieldTemplateId)?.name,templateRevision:data.fieldTemplates.find(item=>item.id===dataset.fieldTemplateId)?.revision || 1,rules,instructions,total:version.records.length,passed:version.records.length-blockedRecords.size,issues,created:now(),operator:data.role,fingerprint:qualityFingerprint(data,version),rulesFingerprint:qualityHash(rules)}
  if (!version.records.length) issue(-1,{field:'records',name:'数据内容',severity:'阻断'},'必填','数据集版本不能为空','')
  data.qualityReports ||= []
  const ancestors=new Set([version.id]);let current=version
  while (current?.parentVersionId && !ancestors.has(current.parentVersionId)) {ancestors.add(current.parentVersionId);current=data.versions.find(item=>item.id===current.parentVersionId)}
  for (const previous of data.qualityReports.filter(item=>ancestors.has(item.versionId) && item.rulesFingerprint===report.rulesFingerprint)) {
    for (const old of previous.issues.filter(item=>item.kind==='automatic' && !item.resolvedInVersionId)) {
      if (!issues.some(item=>item.recordIndex===old.recordIndex && item.field===old.field && item.rule===old.rule) && old.recordIndex<version.records.length) {old.status='已复检修复';old.resolvedInVersionId=version.id;old.resolvedByReportId=report.id;old.history.push({operator:data.role,created:now(),resolution:'复检修复',versionId:version.id})}
    }
  }
  data.qualityReports.unshift(report)
  return report
}

export function updateQualityIssue(report,id,details,operator) {
  const issue=report.issues.find(item=>item.id===id)
  if (!issue) throw new Error('找不到该问题')
  if (details.resolution) {
    if (issue.kind!=='manual') throw new Error('自动检查问题必须修正数据后复检，不能手工消除')
    if (!details.note?.trim()) throw new Error('请填写复核意见')
    issue.status=details.resolution==='确认无误'?'已确认':'需修正'
  }
  if (details.owner?.trim()) issue.owner=details.owner.trim()
  issue.note=details.note || issue.note
  issue.history.push({operator,created:now(),owner:issue.owner,note:details.note || '',resolution:details.resolution || '指派'})
  return issue
}


const standardCollections=['terms','fieldTemplates','standards','storagePolicies','classifications']
const governanceCopy=value=>JSON.parse(JSON.stringify(value))

export function ensureClassifications(data) {
  data.classifications ||= []
  const groups = [
    ['农业科研',['土壤与水肥','作物与植保']], ['医疗健康',['医疗服务']], ['生态环境',['流域水质']],
    ['金融财会',['企业财务']], ['工业制造',['设备运维']], ['交通运输',['道路交通']],
    ['能源电力',['光伏发电']], ['零售电商',['客户服务']], ['教育培训',['科学教育']],
    ['政务服务',['政务咨询']], ['科研教育',['文献资料']],
  ]
  const descriptions = {
    农业科研:'作物、土壤、水肥和农业试验数据。',土壤与水肥:'土壤性质、墒情及灌溉施肥观测。',作物与植保:'作物生长、叶片外观及植保观察。',
    医疗健康:'医疗服务与健康领域的数据资源。',医疗服务:'预约咨询、设备报修和服务事项分类。',生态环境:'水体、环境与生态监测数据。',流域水质:'河流站点、水质指标与时序观测。',
    金融财会:'财务报表、经营指标与财会知识。',企业财务:'企业财务指标、计算口径与问答。',工业制造:'生产设备、运维与制造过程记录。',设备运维:'设备编号、巡检、状态及故障记录。',
    交通运输:'道路、车辆与交通运行数据。',道路交通:'道路车辆图片、类别与交通观察。',能源电力:'发电、用电及能源运行数据。',光伏发电:'光伏功率、气象因素与时序指标。',
    零售电商:'商品、订单、售后与零售服务数据。',客户服务:'订单咨询、售后意图及客服对话。',教育培训:'教学内容、课程资源与学习数据。',科学教育:'科学概念、课程知识与教学问答。',
    政务服务:'公共服务事项与咨询数据。',政务咨询:'办事材料、办理进度与服务咨询。',科研教育:'科研文献与知识整理资源。',文献资料:'论文、摘要、主题与文献来源信息。',
    文本:'以正文、片段等文字内容为主。',图片:'以图片为主体，可附类别与区域标注。',问答对:'以问题与答案配对组织。',文本分类:'包含文本内容及分类标签。',结构化数据:'以字段组织业务记录。',时序数据:'按时间组织的观测或指标记录。',多轮对话:'按角色和顺序组织多轮消息。',
  }
  if (!data.classificationsSeeded) {
    groups.forEach(([name,children],index) => {
      const code = `D${String(index+1).padStart(2,'0')}`, id = `domain-${index+1}`
      if (!data.classifications.some(item=>item.id===id)) data.classifications.push({id,kind:'domain',code,name,parentId:'',enabled:true,description:descriptions[name]})
      children.forEach((name,child) => {
        const childId = `${id}-${child+1}`
        if (!data.classifications.some(item=>item.id===childId)) data.classifications.push({id:childId,kind:'domain',code:`${code}-${child+1}`,name,parentId:id,enabled:true,description:descriptions[name]})
      })
    })
    const types = ['文本','图片','问答对','文本分类','结构化数据','时序数据','多轮对话']
    types.forEach((name,index) => data.classifications.push({id:`data-type-${index+1}`,kind:'type',code:`T${String(index+1).padStart(2,'0')}`,name,parentId:'',enabled:true,description:descriptions[name]}))
    data.classificationsSeeded = true
  }
  const aliases = {'土壤科研':'农业科研','农业生产':'农业科研','文献调研':'科研教育'}
  const children = {soil:'土壤与水肥',paper:'文献资料',health:'医疗服务',finance:'企业财务',industry:'设备运维',traffic:'道路交通',energy:'光伏发电',retail:'客户服务',education:'科学教育',agriculture:'作物与植保',water:'流域水质',government:'政务咨询','governance-demo-metadata':'文献资料','governance-demo-collection':'流域水质','quality-demo-soil':'土壤与水肥','quality-demo-qa':'土壤与水肥'}
  for (const dataset of data.datasets) {
    if (dataset.domainId) continue
    const name = aliases[dataset.industry] || dataset.industry || dataset.project || '未分类'
    let domain = data.classifications.find(item=>item.kind==='domain' && !item.parentId && item.name===name)
    if (!domain) { domain={id:uid('domain'),kind:'domain',code:`LOCAL-${uid().slice(-8).toUpperCase()}`,name,parentId:'',enabled:true,description:''};data.classifications.push(domain) }
    let type = data.classifications.find(item=>item.kind==='type' && item.name===dataset.type)
    if (!type) {type={id:uid('data-type'),kind:'type',code:`TYPE-${uid().slice(-8).toUpperCase()}`,name:dataset.type,parentId:'',enabled:true,description:''};data.classifications.push(type)}
    const child = data.classifications.find(item=>item.parentId===domain.id && item.name===children[dataset.id.replace(/^industry-/, '')])
    dataset.domainId=domain.id;dataset.subdomainId=child?.id || '';dataset.typeId=type.id
    dataset.industry=domain.name;dataset.subindustry=child?.name || ''
    dataset.classificationSnapshot={domain:governanceCopy(domain),subdomain:child?governanceCopy(child):null,type:governanceCopy(type)}
  }
  return data
}

export function classificationUses(data, id) {
  return data.datasets.filter(dataset=>[dataset.domainId,dataset.subdomainId,dataset.typeId].includes(id))
}

export function clearLegacyFieldGovernance(data) {
  data.terms=[];data.fieldTemplates=[];data.qualityReports=[]
  data.standardVersions=(data.standardVersions || []).filter(item=>!['terms','fieldTemplates'].includes(item.collection))
  const clearBinding = dataset => {
    if (!dataset) return
    for (const key of ['fieldTemplateId','requiresQuality','fieldMappings','manualReviewInstructions']) delete dataset[key]
  }
  data.datasets.forEach(clearBinding)
  for (const version of data.versions) {
    const evidence=version.release?.evidence
    if (!evidence) continue
    for (const key of ['contentTemplate','fields','qualityReportId']) delete evidence[key]
    clearBinding(evidence.metadata)
  }
  delete data.focusQualityIssue
  data.legacyFieldRulesRemoved=true
  return data
}

export function clearLifecycleStandards(data) {
  for (const key of ['standards','governanceChecks','manualConfirmations','storagePolicies']) data[key]=[]
  data.standardVersions=(data.standardVersions || []).filter(item=>!['standards','storagePolicies'].includes(item.collection))
  const clearBinding = dataset => {
    if (!dataset) return
    delete dataset.policyIds
    delete dataset.storagePolicyId
  }
  data.datasets.forEach(clearBinding)
  for (const version of data.versions) {
    const evidence=version.release?.evidence
    if (!evidence) continue
    for (const key of ['execution','standards','storagePolicy','checkId']) delete evidence[key]
    clearBinding(evidence.metadata)
  }
  data.usageEvents=(data.usageEvents || []).filter(item=>item.action!=='发布检查')
  data.lifecycleStandardsRemoved=true
  return data
}

export function saveClassification(data, id, definition, operator) {
  const current = data.classifications.find(item=>item.id===id)
  const next = {kind:definition.kind,name:definition.name?.trim(),code:definition.code?.trim(),parentId:definition.parentId || '',enabled:definition.enabled!==false,description:definition.description || ''}
  if (!next.name || !next.code || !['domain','type'].includes(next.kind)) throw new Error('请填写分类名称、代码和类别')
  if (current && (next.code!==current.code || next.kind!==current.kind)) throw new Error('已有分类代码和类别不可修改')
  if (next.parentId) {
    const parent = data.classifications.find(item=>item.id===next.parentId)
    if (next.kind!=='domain' || !parent || parent.kind!=='domain' || parent.parentId || parent.id===id) throw new Error('领域分类最多两级，请选择一级领域')
    if (parent.enabled===false && (!current || current.parentId!==parent.id)) throw new Error('上级领域已停用')
  }
  if (current && next.parentId!==current.parentId && (classificationUses(data,id).length || data.classifications.some(item=>item.parentId===id))) throw new Error('分类已被引用或有子类，不能移动层级')
  if (data.classifications.some(item=>item.id!==id && item.code===next.code)) throw new Error('分类代码已存在')
  if (data.classifications.some(item=>item.id!==id && item.kind===next.kind && item.parentId===next.parentId && item.name===next.name)) throw new Error('同一层级已有同名分类')
  data.standardVersions ||= []
  return reviseStandard(data,'classifications',id || uid('classification'),next,operator)
}

export function removeClassification(data, id) {
  if (classificationUses(data,id).length) throw new Error('分类正在被数据集引用，请停用并保留历史')
  if (data.classifications.some(item=>item.parentId===id)) throw new Error('请先处理该领域的子类')
  const index=data.classifications.findIndex(item=>item.id===id)
  if (index>=0) data.classifications.splice(index,1)
}

export function assignDatasetClassification(data, datasetId, selection) {
  const dataset=data.datasets.find(item=>item.id===datasetId)
  if (!dataset) throw new Error('找不到数据集')
  const domain=data.classifications.find(item=>item.id===selection.domainId && item.kind==='domain' && !item.parentId)
  const child=data.classifications.find(item=>item.id===selection.subdomainId && item.kind==='domain' && item.parentId===domain?.id)
  const type=data.classifications.find(item=>item.id===selection.typeId && item.kind==='type')
  if (!domain || !child || !type) throw new Error('请选择有效的一级领域、所属二级领域和数据类型')
  if ([domain,child,type].some(item=>item.enabled===false)) throw new Error('不能选择已停用的分类')
  Object.assign(dataset,{domainId:domain.id,subdomainId:child.id,typeId:type.id,industry:domain.name,subindustry:child.name,type:type.name,classificationSnapshot:{domain:governanceCopy(domain),subdomain:governanceCopy(child),type:governanceCopy(type)}})
  return dataset
}

export function ensureLifecycleGovernance(data) {
  data.standardVersions ||= []
  data.storagePolicies ||= [{id:'storage-default',name:'科研数据保留策略',location:'project://{projectId}/datasets/{code}',formats:['JSON','JSONL','CSV','Markdown'],retentionDays:365,versionRetention:'保留全部版本',backupRequirement:'按项目备份并验证恢复',encryptionRequirement:'内部数据存储加密',revision:1}]
  data.manualConfirmations ||= []
  data.usageEvents ||= []
  data.storageEvents ||= []
  for (const collection of standardCollections) {
    for (const standard of data[collection] || []) {
      standard.revision ||= 1
      if (!data.standardVersions.some(item=>item.collection===collection && item.standardId===standard.id && item.revision===standard.revision)) data.standardVersions.push({id:uid('revision'),collection,standardId:standard.id,revision:standard.revision,definition:governanceCopy(standard),operator:'既有配置登记',created:now()})
    }
  }
  for (const dataset of data.datasets) {
    dataset.storagePolicyId ||= 'storage-default'
    dataset.storageState ||= '使用中'
    dataset.storageRegisteredAt ||= dataset.created || now()
  }
  return data
}

export function reviseStandard(data,collection,id,definition,operator) {
  if (!standardCollections.includes(collection)) throw new Error('不支持的标准类型')
  const current=data[collection].find(item=>item.id===id)
  const revision=current?(current.revision || 1)+1:1
  const next={...governanceCopy(definition),id,revision}
  if (current) Object.assign(current,next)
  else data[collection].push(next)
  data.standardVersions.unshift({id:uid('revision'),collection,standardId:id,revision,definition:governanceCopy(next),operator,created:now()})
  return current || next
}

export function confirmManualStandard(data,standardId,datasetId,versionId,note,operator) {
  const standard=data.standards.find(item=>item.id===standardId)
  if (!standard || standard.executionMode!=='人工确认') throw new Error('请选择人工确认标准')
  if (!note?.trim()) throw new Error('请填写确认意见')
  const confirmation={id:uid('confirmation'),standardId,revision:standard.revision || 1,datasetId,versionId:versionId || '',note:note.trim(),operator,created:now(),definition:governanceCopy(standard)}
  data.manualConfirmations.unshift(confirmation)
  return confirmation
}

export function storageInfoFor(data,dataset) {
  const policy=data.storagePolicies?.find(item=>item.id===dataset?.storagePolicyId)
  const location=(policy?.location || '').replaceAll('{projectId}',dataset?.projectId || '').replaceAll('{code}',dataset?.code || '')
  const start=Date.parse(String(dataset?.storageRegisteredAt || '').replaceAll('/','-').replace(' ','T'))
  const expires=Number.isFinite(start) && policy?.retentionDays>0 ? new Date(start+policy.retentionDays*86400000):null
  return {policy,location,retentionDays:policy?.retentionDays || 0,expires:expires?`${expires.getFullYear()}年${expires.getMonth()+1}月${expires.getDate()}日`:'长期保留',overdue:Boolean(expires && expires.getTime()<Date.now()),state:dataset?.storageState || '使用中'}
}

export function executionStandards(data,dataset,operation) {
  const stages={import:['采集'],save:['存储'],publish:['共享','安全'],request:['安全'],download:['安全']}[operation] || []
  const policies=data.standards.filter(rule=>rule.category==='全流程标准' && rule.enabled!==false && (!rule.scope || rule.scope==='全部类型' || rule.scope===dataset.type) && rule.stages?.some(stage=>stages.includes(stage)) && (!dataset.policyIds?.length || dataset.policyIds.includes(rule.id) || rule.stages.includes('安全')))
  const metadata=data.standards.filter(rule=>rule.category==='元数据规范' && rule.enabled!==false && (!rule.scope || rule.scope==='全部类型' || rule.scope===dataset.type) && policies.some(policy=>(!policy.executionMode || policy.executionMode==='自动校验') && policy.metadataFields?.includes(rule.field)))
  const storage=data.storagePolicies?.find(item=>item.id===dataset.storagePolicyId)
  return governanceCopy([...policies.map(item=>({...item,collection:'standards',executionMode:item.executionMode || '自动校验'})),...metadata.map(item=>({...item,collection:'standards',executionMode:'自动校验'})),...(['save','publish'].includes(operation) && storage?[{...storage,name:storage.name+' · 成果格式',collection:'storagePolicies',executionMode:'自动校验'},{id:storage.id,revision:storage.revision,name:storage.name+' · 备份与加密',backupRequirement:storage.backupRequirement,encryptionRequirement:storage.encryptionRequirement,collection:'storagePolicies',executionMode:'后端保障'}]:[])])
}

export function publicationEvidence(data,version,operator) {
  const dataset=data.datasets.find(item=>item.id===version.datasetId)
  if (data.lifecycleStandardsRemoved) return governanceCopy({created:now(),operator,datasetId:dataset.id,versionId:version.id,metadata:dataset})
  const report=data.qualityReports?.find(item=>item.versionId===version.id)
  const execution=data.governanceChecks?.find(item=>item.versionId===version.id && item.operation==='publish')
  return governanceCopy({created:now(),operator,datasetId:dataset.id,versionId:version.id,metadata:dataset,execution,standards:execution?.standards || executionStandards(data,dataset,'publish'),storagePolicy:data.storagePolicies.find(item=>item.id===dataset.storagePolicyId),...(!data.legacyFieldRulesRemoved?{contentTemplate:data.fieldTemplates.find(item=>item.id===dataset.fieldTemplateId),fields:contentFieldsFor(data,dataset),qualityReportId:report?.id || ''}:{}),checkId:data.governanceChecks?.find(item=>item.versionId===version.id && item.operation==='publish')?.id || ''})
}

export function buildDatasetTrace(data,datasetId,versionId) {
  const selected=data.versions.find(item=>item.id===versionId && item.datasetId===datasetId)
  if (!selected) return []
  const nodes=[],visited=new Set(),sources=new Set()
  const visit=version=>{
    if (!version || visited.has(version.id)) return
    visited.add(version.id)
    visit(data.versions.find(item=>item.id===version.parentVersionId))
    visit(data.versions.find(item=>item.id===version.sourceId))
    const source=data.sources.find(item=>item.id===version.sourceId)
    if (source && !sources.has(source.id)) {sources.add(source.id);nodes.push({id:`source-${source.id}`,kind:'source',name:source.name,time:source.created,sourceId:source.id,actor:source.createdBy || '',detail:`原始资料 · ${source.type}`,icon:'Document'})}
    for (const task of data.tasks.filter(item=>item.versionId===version.id)) nodes.push({id:`task-${task.id}`,kind:'task',name:task.name,time:task.created,actor:task.operator || '',versionId:version.id,detail:`${task.type} · ${task.status}`,icon:'SetUp'})
    nodes.push({id:`version-${version.id}`,kind:'version',name:`${isDatasetVersion(version)?'V'+version.number:version.type} · ${version.type}`,time:version.created,actor:version.createdBy || '',versionId:version.id,detail:version.status,icon:'Collection'})
    for (const report of data.qualityReports.filter(item=>item.versionId===version.id)) nodes.push({id:report.id,kind:'quality',name:`质量检查 · ${report.issues.length}个问题`,time:report.created,actor:report.operator,versionId:version.id,detail:`检查${report.total}条 · ${report.templateName}`,icon:'CircleCheck'})
    if (version.reviewed) nodes.push({id:`review-${version.id}`,kind:'review',name:'质量审核',time:version.reviewed,actor:version.reviewedBy || '',versionId:version.id,detail:version.reviewNote,icon:'DocumentChecked'})
    if (version.release) nodes.push({id:`release-${version.id}`,kind:'release',name:`发布 ${version.release.tag}`,time:version.release.publishedAt,actor:version.release.publisher,versionId:version.id,detail:version.release.title,icon:'PriceTag'})
  }
  visit(selected)
  for (const check of (data.governanceChecks || []).filter(item=>visited.has(item.versionId) || sources.has(item.sourceId))) nodes.push({id:check.id,kind:'execution',name:`${check.stage}规范检查 · ${check.status}`,time:check.created,actor:check.operator,versionId:check.versionId,detail:(check.standards || []).map(item=>`${item.name} r${item.revision}`).join('、'),icon:'CircleCheck'})
  for (const confirmation of (data.manualConfirmations || []).filter(item=>visited.has(item.versionId))) nodes.push({id:confirmation.id,kind:'confirmation',name:`人工确认 · ${confirmation.definition.name} r${confirmation.revision}`,time:confirmation.created,actor:confirmation.operator,versionId:confirmation.versionId,detail:confirmation.note,icon:'DocumentChecked'})
  for (const request of data.requests.filter(item=>visited.has(item.versionId))) {
    nodes.push({id:request.id,kind:'request',name:`使用申请 · ${request.applicant}`,time:request.created,actor:request.applicant,versionId:request.versionId,detail:request.reason,icon:'DocumentChecked'})
    if (request.approved) nodes.push({id:`approved-${request.id}`,kind:'approval',name:request.status,time:request.approved,actor:request.approvedBy,versionId:request.versionId,detail:request.note,icon:'CircleCheck'})
  }
  for (const event of data.usageEvents.filter(item=>visited.has(item.versionId) && item.action!=='发布检查')) nodes.push({...event,kind:'usage',name:`${event.action} · ${event.status}`,time:event.created,actor:event.user,icon:event.action.includes('API')?'Connection':'Download'})
  const time=item=>Date.parse(String(item.time || '').replaceAll('/','-').replace(' ','T')) || 0
  return nodes.sort((a,b)=>time(a)-time(b))
}

export function serviceAccess(data,service,user) {
  const dataset=data.datasets.find(item=>item.id===service.datasetId)
  const version=data.versions.find(item=>item.id===service.versionId && item.datasetId===service.datasetId && item.status==='已发布')
  if (!dataset || !version) return {status:404,message:'发布版本不存在'}
  const permission=data.permissions.find(item=>item.role===user)
  if (!permission?.download || permission.project!=='全部项目' && permission.project!==dataset.project || permission.level!=='内部' && dataset.level!=='公开' || !canDownload(version,data.requests,user,dataset)) return {status:403,message:'尚未获得此发布版本的使用授权'}
  return {status:200,datasetCode:dataset.code,tag:version.release?.tag || `V${version.number}`,version:version.number,total:version.records.length,records:governanceCopy(exportRecords(version.records))}
}

export function governanceMetrics(data,visibleIds) {
  const visible=new Set(visibleIds),datasets=data.datasets.filter(item=>visible.has(item.id))
  const metadataRows=datasets.map(dataset=>{
    const fields=data.standards.filter(item=>item.category==='元数据规范' && item.required && item.enabled!==false && (!item.scope || item.scope==='全部类型' || item.scope===dataset.type))
    const checks=validateGovernance({...data,standards:[...fields,{id:'metric',name:'元数据检查',category:'全流程标准',stages:['存储'],metadataFields:fields.map(item=>item.field)}]},'save',{dataset:{...dataset,storageState:'使用中',policyIds:[]}}).filter(item=>fields.some(field=>field.field===item.field))
    return {datasetId:dataset.id,name:dataset.name,kind:'metadata',status:checks.length?'需完善':'合格',detail:checks.map(item=>item.reason).join('；'),passed:!checks.length}
  })
  const coverageRows=datasets.filter(item=>item.fieldTemplateId && item.storageState!=='已归档').flatMap(dataset=>{
    const version=data.versions.filter(item=>item.datasetId===dataset.id && isDatasetVersion(item)).sort((a,b)=>b.number-a.number)[0]
    if (!version) return []
    const report=data.qualityReports?.find(item=>item.versionId===version.id)
    const fresh=report?.fingerprint===qualityFingerprint(data,version)
    return [{datasetId:dataset.id,versionId:version.id,name:dataset.name,kind:'quality',status:fresh?'已检查':report?'需复检':'未检查',detail:`V${version.number}`,passed:fresh}]
  })
  const latest=new Map()
  for (const report of data.qualityReports || []) if (visible.has(report.datasetId) && !latest.has(report.versionId)) latest.set(report.versionId,report)
  const issueRows=[...latest.values()].flatMap(report=>report.issues.map(issue=>({datasetId:report.datasetId,versionId:report.versionId,name:data.datasets.find(item=>item.id===report.datasetId)?.name,kind:'issue',status:issue.status,detail:`第${issue.recordIndex+1}条 · ${issue.fieldName} · ${issue.reason}`,passed:['已确认','已复检修复'].includes(issue.status)})))
  const publishRows=(data.usageEvents || []).filter(item=>visible.has(item.datasetId) && item.action==='发布检查').map(item=>({datasetId:item.datasetId,versionId:item.versionId,name:data.datasets.find(dataset=>dataset.id===item.datasetId)?.name,kind:'publish',status:item.status,detail:item.detail,passed:item.status==='通过'}))
  return [{key:'metadata',label:'元数据合格率',rows:metadataRows},{key:'coverage',label:'质量检查覆盖率',rows:coverageRows},{key:'issues',label:'问题解决率',rows:issueRows},{key:'publish',label:'发布检查通过率',rows:publishRows}].map(metric=>({...metric,numerator:metric.rows.filter(row=>row.passed).length,denominator:metric.rows.length}))
}
