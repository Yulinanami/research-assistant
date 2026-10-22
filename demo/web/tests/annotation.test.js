import test from 'node:test'
import assert from 'node:assert/strict'
import { effectiveAnswer, editAnswerRecord, reviewInput, classificationDraft, recordAnnotationTask } from '../src/annotation.js'
import { exportDatasetRecords } from '../src/workspace.js'

test('编辑当前生效答案后预览与导出一致，同时保留原回答和原始记录', () => {
  const original = { question: '问题', answer: '原回答', correctedAnswer: '旧修订', reference: '来源' }
  const revised = editAnswerRecord(original, { answer: '新修订', reference: '新来源' })
  assert.equal(revised.answer, '原回答')
  assert.equal(effectiveAnswer(revised), '新修订')
  assert.equal(exportDatasetRecords([revised], 'Alpaca')[0].output, '新修订')
  assert.equal(original.correctedAnswer, '旧修订')
  assert.equal(effectiveAnswer(editAnswerRecord({ question: '问题', answer: '旧值' }, { answer: '新值' })), '新值')
})

test('人工复核优先使用指定版本，隔离其它数据集及非问答成果，再使用交接输入或最新问答', () => {
  const versions = [
    { id: 'other', datasetId: 'b', type: '问答生成', records: [{ question: '其它项目' }] },
    { id: 'new', datasetId: 'a', type: '问答生成', records: [{ question: '新版本' }] },
    { id: 'clean', datasetId: 'a', type: '文本清洗', records: [{ content: '正文' }] },
    { id: 'old', datasetId: 'a', type: '问答生成', records: [{ question: '旧版本' }] },
  ]
  assert.equal(reviewInput(versions, 'a', 'old', ['new']).id, 'old')
  assert.equal(reviewInput(versions, 'a', 'other', ['old']).id, 'old')
  assert.equal(reviewInput(versions, 'a', 'clean', []).id, 'new')
  assert.equal(reviewInput(versions, 'missing', 'old'), undefined)
})

test('同一版本续标复用任务，切换版本或数据集创建独立关联，已提交任务不被覆盖', () => {
  const tasks = []
  const version = { id: 'v1', datasetId: 'a', projectId: 'project-a' }
  const first = recordAnnotationTask(tasks, version, '问答标注', 50, '第一份标注')
  assert.equal(recordAnnotationTask(tasks, version, '问答标注', 100, '重复保存').id, first.id)
  const second = recordAnnotationTask(tasks, { ...version, id: 'v2' }, '问答标注', 25, '第二份标注')
  assert.notEqual(second.id, first.id)
  assert.equal(first.versionId, 'v1')
  assert.equal(second.versionId, 'v2')
  first.status = '已提交'
  assert.notEqual(recordAnnotationTask(tasks, version, '问答标注', 100, '再次标注').id, first.id)
  const other = recordAnnotationTask(tasks, { ...version, datasetId: 'b' }, '问答标注', 50, '其它数据集')
  assert.equal(other.datasetId, 'b')
  assert.equal(tasks.length, 4)
})

test('恢复分类草稿按数据集和类型隔离，明确交接的清洗输入不能被其它草稿覆盖', () => {
  const versions = [
    { id: 'other', datasetId: 'b', status: '草稿', type: '图片整体分类', records: [{ id: 'raw' }] },
    { id: 'submitted', datasetId: 'a', status: '待审核', type: '图片整体分类', records: [{ id: 'raw' }] },
    { id: 'image', datasetId: 'a', status: '草稿', type: '图片整体分类', records: [{ id: 'raw', labels: ['类别一'] }] },
    { id: 'clean-image', datasetId: 'a', status: '草稿', type: '图片整体分类', records: [{ id: 'clean-0', labels: ['类别二'] }] },
    { id: 'text', datasetId: 'a', status: '草稿', type: '文本分类', records: [{ id: 'text' }] },
  ]
  assert.equal(classificationDraft(versions, 'a', 'image').id, 'image')
  assert.equal(classificationDraft(versions, 'a', 'image', ['clean-0']).id, 'clean-image')
  assert.equal(classificationDraft(versions, 'a', 'image', ['new-clean-0']), undefined)
  assert.equal(classificationDraft(versions, 'a', 'text').id, 'text')
})
