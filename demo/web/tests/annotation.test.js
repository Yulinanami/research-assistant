import test from 'node:test'
import assert from 'node:assert/strict'
import { effectiveAnswer, editAnswerRecord, reviewInput, classificationDraft, recordAnnotationTask, validateQuestions, validateBoxes } from '../src/annotation.js'
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

test('问答提交检查回答、质量枚举和评分范围；草稿允许尚未确认的记录', () => {
  assert.doesNotThrow(() => validateQuestions([{ question: '问题', answer: '', rating: 0 }]))
  assert.throws(() => validateQuestions([{ question: '问题', answer: '答案', label: '任意标签' }]), /未定义/)
  assert.throws(() => validateQuestions([{ question: '问题', answer: '答案', rating: NaN }]), /评分/)
  assert.throws(() => validateQuestions([{ question: '问题', answer: '', label: '可用' }], undefined, true), /回答为空/)
  assert.doesNotThrow(() => validateQuestions([{ question: '问题', answer: '原文', correctedAnswer: '修订', label: '可用', rating: 5 }], undefined, true))
})

test('图片区域拒绝负数、非有限值、空区域、越界和模板外类别', () => {
  const valid = { x: 10, y: 10, width: 20, height: 20, label: '图' }
  for (const changes of [{ x: -1 }, { y: Infinity }, { width: 0 }, { height: -1 }, { width: 91 }, { label: '未知' }]) {
    assert.throws(() => validateBoxes([{ ...valid, ...changes }], ['图']))
  }
  assert.doesNotThrow(() => validateBoxes([valid], ['图']))
})

test('仅人工可用范围不混入未复核、需修改、不可用或已过滤条目，默认保留原始导出行为', () => {
  const records = ['可用', '需修改', '不可用', '无法判断', ''].map(label => ({ question: label || '未复核', answer: '原答案', correctedAnswer: '人工答案', label }))
  records.push({ question: '已过滤', answer: '答案', label: '可用', status: '过滤' })
  assert.equal(exportDatasetRecords(records, '原始结构').length, 5)
  assert.deepEqual(exportDatasetRecords(records, 'Alpaca', { quality: 'usable' }), [{ instruction: '可用', input: '', output: '人工答案' }])
  assert.equal(records.length, 6)
})
