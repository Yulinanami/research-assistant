import test from 'node:test'
import assert from 'node:assert/strict'
import { canDownload, createVersion, reviewVersion, publishVersion, splitText, cleanText, cleanImages, isDatasetVersion, augmentRecords, exportRecords, ensureProjects } from '../src/domain.js'

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
