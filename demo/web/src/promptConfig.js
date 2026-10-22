export const promptDefinitions = [
  { key:'parsing', name:'文档解析', group:'解析', text:'解析原始文档，保留标题层级、正文、表格、公式和图片位置，按原始阅读顺序输出，不补充原文未提供的信息。输出格式：{format}。' },
  { key:'qaGeneration', name:'QA 生成', group:'问答', text:'{audience_prompt}\n基于参考资料提取问题和答案，保留可核对的来源与引用，不编造数值、结论或参考资料。目标受众：{audience}。表达模板：{template}。' },
  { key:'qaAugmentation', name:'SFT 问答增强', group:'问答', text:'{audience_prompt}\n基于已有问答改写问题和回答，保留原问答、事实、证据与来源，不增加未经支持的结论。目标受众：{audience}。表达模板：{template}。' },
  { key:'knowledgeCompilation', name:'知识编译', group:'知识图谱', text:'依据原始资料组织知识页面，保留标题、主题、正文、结论的适用条件和来源；区分原文事实与尚待核对的内容，不添加未经证实的信息。' },
  { key:'graphEntities', name:'实体抽取', group:'知识图谱', text:'仅从当前正文片段识别有明确含义的实体，输出实体名称、类型、说明及来源片段。统一实体命名，保留专有名称，不将推断作为事实。' },
  { key:'graphRelations', name:'关系抽取', group:'知识图谱', text:'仅关联正文明确支持的实体对，输出起点、终点、关系关键词、说明与来源。多元关系拆为可核对的实体对；同句共现只作为候选关系，不推断因果。' },
  { key:'graphMerge', name:'实体与关系合并', group:'知识图谱', text:'合并同名或已核实等价的实体与重复关系，汇总说明并保留所有来源。存在冲突时保留差异和适用条件，不覆盖原始证据。' },
  { key:'imageCaption', name:'图片描述', group:'图文', text:'{audience_prompt}\n描述图片中实际可见的对象、文字、图表与数值，保留图片来源，标明无法辨认的信息。表达模板：{template}。' },
  { key:'imageQa', name:'图片问答', group:'图文', text:'{audience_prompt}\n围绕图片中可核对的信息生成问答，回答关联图片与证据，不推断图外事实。目标受众：{audience}。表达模板：{template}。' },
  { key:'annotationAssist', name:'问答辅助标注', group:'审核', text:'根据参考材料检查问题、答案和来源，建议可用、需修改、不可用或无法判断，并说明依据；建议不能替代人工审核。' },
  { key:'annotationReview', name:'标注成果审核标准', group:'审核', text:'检查标注完整性、标签与任务定义的一致性、来源可追溯性和事实准确性。图谱需核对实体、关系与来源；图片框选需核对区域和类别；问答需核对答案与证据。退回时填写可执行的修改意见。' },
]

export const defaultPrompts = () => Object.fromEntries(promptDefinitions.map(item => [item.key, item.text]))
const promptKeys = { '文档解析':'parsing', '问答生成':'qaGeneration', '问答增强':'qaAugmentation', '知识编译':'knowledgeCompilation',
  '知识图谱':'graphEntities', '图片描述':'imageCaption', '图片问答':'imageQa', '自动标注':'annotationAssist', '标注成果审核':'annotationReview' }
export function taskPrompt(settings, type, context = {}) {
  const key = type.includes('解析') ? 'parsing' : promptKeys[type]
  if (!key) return ''
  const text = settings.prompts?.[key] ?? defaultPrompts()[key]
  const values = { format: settings.parsing?.format || 'Markdown', audience: '科研人员', template: '忠实原文', audience_prompt: '', ...context }
  return text.replace(/\{([a-z_]+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name] ?? '') : match)
}
