import { knowledgeFingerprint } from './knowledgeBase.js'
import { validateKnowledgeGraph } from './knowledgeGraph.js'
import { validateClassification, validateBoxes, validateQuestions } from './annotation.js'

const resultTypes = ['文本分类','图片整体分类','图像标注','问答标注','图片描述','图片问答','知识图谱']
export const isAnnotationResult = version => resultTypes.includes(version.type) && version.records?.length > 0
export const annotationSignature = version => knowledgeFingerprint([version.records, version.labelTemplate, version.annotationTemplate])
export function annotationReviewStatus(version) {
  const review = version.annotationReview
  return review && review.signature === annotationSignature(version) ? review.status : '待提交'
}
export function validateAnnotationSubmission(version) {
  if (!isAnnotationResult(version) || !version.records.some(record => record.status !== '过滤')) throw new Error('没有可提交的标注成果')
  if (['文本分类', '图片整体分类'].includes(version.type)) validateClassification(version.records, version.labelTemplate, true)
  if (version.type === '问答标注') {
    const questions = version.records.filter(record => record.status !== '过滤' && record.question)
    if (!questions.length) throw new Error('没有可审核的问答标注')
    validateQuestions(questions, undefined, true)
  }
  if (version.type === '图片描述' && version.records.some(record => record.status !== '过滤' && (!record.image || !record.content?.trim()))) throw new Error('图片描述须保留原图并填写描述')
  if (version.type === '图片问答' && version.records.some(record => record.status !== '过滤' && (!record.image || !record.question?.trim() || !(record.correctedAnswer || record.answer)?.trim()))) throw new Error('图片问答须包含原图、问题和答案')
  if (version.type === '图像标注') {
    for (const record of version.records.filter(record => record.status !== '过滤')) {
      if (!record.image || !record.boxes?.length) throw new Error('请完成图片区域框选后提交')
      validateBoxes(record.boxes, version.annotationTemplate?.labels || [])
    }
  }
  if (version.type === '知识图谱') {
    const graph = version.records.find(record => record.knowledge_graph)?.knowledge_graph
    validateKnowledgeGraph(graph)
    if (!graph.reviewed) throw new Error('请先核对图谱来源并保存校订成果，再提交审核')
  }
}
