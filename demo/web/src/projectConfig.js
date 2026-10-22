export const projectVisibilities = [
  {value:'group',label:'课题组内部可见',description:'项目创建者与所选课题组成员可查看。'},
  {value:'all',label:'全员可见',description:'平台内有查看权限的用户可查看。'},
  {value:'personal',label:'个人可见',description:'仅项目创建者可查看。'},
]
export const dictionaryTypes = ['文本','数值','枚举','日期','布尔']
export const dictionaryTemplates = [
  {id:'research',name:'科研采样信息',description:'定义采样时间、深度与测量指标等科研业务字段。',fields:[
    {field:'sampling_time',name:'采样时间',type:'日期',required:true,description:'该数据集对应的采样日期。'},
    {field:'sampling_depth',name:'采样深度',type:'数值',unit:'cm',description:'该数据集对应的采样深度。'},
    {field:'soil_moisture',name:'土壤含水量',type:'数值',unit:'%',description:'说明本数据集采用的含水量指标。'},
  ]},
  {id:'literature',name:'文献资料信息',description:'定义文献标题、发表日期、语种与来源。',fields:[
    {field:'document_title',name:'文献标题',type:'文本',required:true},
    {field:'publication_date',name:'发表日期',type:'日期'},
    {field:'document_language',name:'文献语种',type:'枚举',enumValues:'中文，英文，其他'},
    {field:'source_reference',name:'来源引用',type:'文本'},
  ]},
  {id:'general',name:'通用业务信息',description:'记录数据来源、采集日期和来源保留情况。',fields:[
    {field:'data_source',name:'数据来源说明',type:'文本',required:true},
    {field:'collection_date',name:'采集日期',type:'日期'},
    {field:'has_reference',name:'是否保留来源',type:'布尔'},
  ]},
]
export const visibilityLabel = project => projectVisibilities.find(item => item.value === (project?.visibility || 'all'))?.label || '未设置'
export const enumOptions = term => [...new Set(String(term.enumValues || '').split(/[,，\n]/u).map(value => value.trim()).filter(Boolean))]

export function projectVisibleTo(project, identity, groups = []) {
  if (!identity || !project) return false
  if (project.ownerId === identity) return true
  const scope = project.visibility || 'all'
  if (scope === 'all') return true
  if (scope !== 'group') return false
  return groups.some(group => group.id === project.groupId && group.memberIds?.includes(identity))
}

export function validateProjectDictionary(dictionary = []) {
  if (!Array.isArray(dictionary)) throw new Error('项目数据字典格式无效')
  const codes = new Set(['dataset_code'])
  return dictionary.map(term => {
    const field = String(term.field || '').trim()
    const name = String(term.name || '').trim()
    if (!name) throw new Error('请填写数据字典的字段名称')
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(field)) throw new Error('字段编码须以字母开头，仅含字母、数字和下划线，最多 64 位')
    if (codes.has(field.toLowerCase())) throw new Error(`字段编码“${field}”重复或占用了系统数据集编号字段`)
    if (!dictionaryTypes.includes(term.type)) throw new Error(`请选择“${name}”的字段类型`)
    if (term.type === '枚举' && !enumOptions(term).length) throw new Error(`请为“${name}”填写枚举选项`)
    codes.add(field.toLowerCase())
    return {...term,field,name,scope:'dataset',required:Boolean(term.required),enumValues:enumOptions(term).join('，')}
  })
}

export function validateProjectConfig(data, identity, groups = []) {
  const name = String(data.name || '').trim()
  if (!name) throw new Error('请填写项目名称')
  const visibility = data.visibility || 'group'
  if (!projectVisibilities.some(item => item.value === visibility)) throw new Error('请选择有效的项目可见范围')
  if (visibility === 'group' && !groups.some(group => group.id === data.groupId && group.memberIds?.includes(identity))) {
    throw new Error('请选择您所在的课题组')
  }
  return {name,description:String(data.description || '').trim(),visibility,
    groupId:visibility === 'group' ? data.groupId : '',dictionary:validateProjectDictionary(data.dictionary || [])}
}

export function validateDatasetMetadata(metadata, terms) {
  for (const term of terms) {
    const value = metadata[term.field]
    const empty = value === undefined || value === null || value === '' || (typeof value === 'string' && !value.trim())
    if (empty) {
      if (term.required) throw new Error(`请填写${term.name}`)
      continue
    }
    if (term.type === '数值' && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error(`${term.name}须填写数值`)
    if (term.type === '枚举' && !enumOptions(term).includes(value)) throw new Error(`${term.name}须选择字典中定义的选项`)
    if (term.type === '布尔' && typeof value !== 'boolean') throw new Error(`${term.name}须为是或否`)
    if (term.type === '日期') {
      const date = new Date(value)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value) throw new Error(`${term.name}须填写有效日期`)
    }
  }
  return metadata
}
