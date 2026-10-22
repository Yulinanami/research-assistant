export function taskCategory(task) {
  if (task.type?.includes('解析')) return '数据解析'
  if (task.type?.includes('清洗')) return '数据清洗'
  if (task.type?.startsWith('知识图谱')) return '知识图谱'
  if (/标注|分类/.test(task.type || '')) return '数据标注'
  return task.type || '其它'
}

export function taskDuration(task, currentTime = Date.now()) {
  if (!Number.isFinite(task.startedAt)) return /标注中|已提交/.test(task.status) ? '人工标注' : '未记录'
  const end = Number.isFinite(task.completedAt) ? task.completedAt : task.status === '执行中' ? currentTime : null
  if (end == null) return '未记录'
  const seconds = Math.max(0, Math.floor((end - task.startedAt) / 1000))
  if (seconds < 60) return seconds + '秒'
  return Math.floor(seconds / 60) + '分' + seconds % 60 + '秒'
}

export function taskModel(task, models) {
  if (task.type === '标注成果审核') return '人工审核'
  if (task.type === '知识编译') return '本地编译（演示）'
  if (task.type === '知识图谱') return '本地抽取（演示）'
  if (task.type === '知识图谱标注') return '人工标注'
  if (task.modelName) return task.modelName
  if (task.config?.model) return models.find(model => model.id === task.config.model)?.name || task.config.model
  const category = taskCategory(task)
  if (category === '数据解析') return '本地解析（模拟）'
  if (category === '数据清洗') return '本地规则'
  if (category === '知识片段') return '本地切片'
  if (category === '数据标注' && task.type !== '自动标注') return '人工标注'
  return '未记录'
}

export function taskSummary(task, versions) {
  if (task.type === '标注成果审核') return task.logs?.at(-1) || task.status
  if (task.status === '失败') return task.logs?.at(-1) || '任务执行失败'
  if (task.status === '已中断') return task.logs?.at(-1) || '任务执行已中断'
  if (task.status === '执行中') return task.logs?.at(-1) || '正在处理'
  const result = versions.find(version => version.id === task.versionId && version.datasetId === task.datasetId)
  if (!result) return task.logs?.at(-1) || '暂无成果'
  const records = result.records || []
  if (task.type === '知识编译') return '已编译知识页面，保留摘要、正文摘录与来源，等待汇入全局图谱'
  if (taskCategory(task) === '知识图谱') {
    const graph = records.find(record => record.knowledge_graph)?.knowledge_graph
    if (graph) return `${graph.entities.length} 个实体、${graph.relationships.length} 条关系 · ${graph.reviewed ? '已人工校订' : '待人工校订'}`
  }
  if (taskCategory(task) === '数据清洗') {
    const kept = records.filter(record => record.status !== '过滤').length
    let text = '处理 ' + records.length + ' 份，保留 ' + kept + '，过滤 ' + (records.length - kept)
    if (task.type === '文本清洗') text += '；原文 ' + records.reduce((total, record) => total + (record.before?.length || 0), 0)
      + ' 字符，清洗后 ' + records.reduce((total, record) => total + (record.status === '过滤' ? 0 : record.content?.length || 0), 0) + ' 字符'
    return text
  }
  if (taskCategory(task) === '数据解析') return '解析完成，生成 ' + records.length + ' 条内容；输出 ' + (task.config?.format || 'Markdown') + '（模拟）'
  return '已保存 ' + records.length + ' 条' + (task.status === '标注中' ? '，可继续标注' : '成果')
}

export function finishTaskTracking(task, currentTime = Date.now()) {
  task.completedAt = currentTime
  task.processedItems = task.totalItems
  task.succeededItems = task.status === '已完成' ? task.totalItems : 0
  task.failedItems = task.status === '失败' ? task.totalItems : 0
}
