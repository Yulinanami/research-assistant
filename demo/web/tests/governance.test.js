import test from 'node:test'
import assert from 'node:assert/strict'
import { createVersion, submitVersionReview, reviewVersion, publishVersion } from '../src/domain.js'
import { governanceVersions } from '../src/workspace.js'

test('只有有内容的数据集草稿和退回版本能提交，中间成果及已提交版本不改变状态', () => {
  const draft = createVersion([], 'soil', [{ question: '问题', answer: '答案' }], '问答生成')
  const snapshot = JSON.stringify(draft.records)
  submitVersionReview(draft, '加工人员')
  assert.equal(draft.status, '待审核')
  assert.equal(draft.submittedBy, '加工人员')
  assert.ok(draft.submitted)
  assert.equal(JSON.stringify(draft.records), snapshot)
  assert.throws(() => submitVersionReview(draft), /草稿或已退回/)
  const processing = createVersion([], 'soil', [{ content: '解析正文' }], 'PDF解析')
  assert.throws(() => submitVersionReview(processing), /中间加工成果/)
  assert.equal(processing.status, '草稿')
  assert.throws(() => submitVersionReview({ ...draft, status: '草稿', records: [] }), /没有可提交/)
  assert.throws(() => submitVersionReview({ ...draft, status: '草稿', records: [{ status: '过滤' }] }), /没有可提交/)
})

test('治理跨项目汇总已提交数据集版本，排除草稿、中间成果与无权限版本；发布列表限已通过和已发布', () => {
  const versions = [
    { id: 'soil-pending', datasetId: 'soil', status: '待审核', kind: 'dataset' },
    { id: 'paper-pending', datasetId: 'paper', status: '待审核', kind: 'dataset' },
    { id: 'draft', datasetId: 'soil', status: '草稿', kind: 'dataset' },
    { id: 'processing', datasetId: 'soil', status: '待审核', type: '知识片段' },
    { id: 'private', datasetId: 'hidden', status: '已通过', kind: 'dataset' },
    { id: 'rejected', datasetId: 'paper', status: '已退回', kind: 'dataset' },
    { id: 'approved', datasetId: 'paper', status: '已通过', kind: 'dataset' },
    { id: 'published', datasetId: 'soil', status: '已发布', kind: 'dataset' },
  ]
  const canView = id => id !== 'hidden'
  assert.deepEqual(governanceVersions(versions, 'audit', canView).map(v => v.id), ['soil-pending', 'paper-pending', 'rejected', 'approved', 'published'])
  assert.deepEqual(governanceVersions(versions, 'release', canView).map(v => v.id), ['approved', 'published'])
})

test('退回后重新提交，审核通过后才可发布；修改已提交内容创建新草稿', () => {
  const version = createVersion([], 'paper', [{ content: '原内容' }], '文本分类')
  const release = { tag: 'v1.0', title: '文献分类', notes: '经审核的分类数据' }
  submitVersionReview(version)
  assert.throws(() => publishVersion(version, release), /通过审核/)
  reviewVersion(version, false, '补充来源')
  assert.equal(version.status, '已退回')
  assert.equal(version.reviewNote, '补充来源')
  submitVersionReview(version)
  const revised = createVersion([version], 'paper', [{ content: '修改内容' }], '人工修订', version.id)
  assert.equal(revised.status, '草稿')
  assert.equal(version.records[0].content, '原内容')
  reviewVersion(version, true, '已核对')
  publishVersion(version, release, [version], '审核人员')
  assert.equal(version.status, '已发布')
  const processing = { status: '待审核', kind: 'processing' }
  assert.throws(() => reviewVersion(processing, true, ''), /中间加工成果/)
  assert.equal(processing.status, '待审核')
})
