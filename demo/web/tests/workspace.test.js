import test from 'node:test'
import assert from 'node:assert/strict'
import { initialData } from '../src/data.js'
import { migrateWorkspace, libraryDatasets, exportDatasetRecords, generationInputs, classificationInputs } from '../src/workspace.js'

test('迁移旧工作空间保留文件、成果及授权，项目关系稳定且可重复执行', () => {
  const data=initialData()
  data.sources[0].hasFile=true
  data.requests.push({id:'grant',datasetId:'soil',versionId:'soil-v1',user:'数据使用者',status:'已通过'})
  const records=JSON.stringify(data.versions)
  migrateWorkspace(data)
  assert.equal(data.projects.length,2)
  assert.equal(data.datasets.find(d=>d.id==='soil').projectId,'project-soil')
  assert.equal(data.sources[0].hasFile,true)
  assert.equal(data.sources[0].id,'src-report')
  assert.equal(data.requests[0].versionId,'soil-v1')
  assert.equal(data.activeProjectId,'project-soil')
  assert.equal(data.versions[0].records[0].answer,JSON.parse(records)[0].records[0].answer)
  const after=JSON.stringify(data)
  migrateWorkspace(data)
  assert.equal(JSON.stringify(data),after)
})

test('目录按数据集聚合并限制到获批的发布版本，广场展示发布版本', () => {
  const data=migrateWorkspace(initialData())
  data.versions.push({...data.versions[0],id:'soil-v3',number:3,records:[{answer:'新版'}]})
  data.requests.push({user:'数据使用者',datasetId:'soil',versionId:'soil-v1',status:'已通过'})
  const directory=libraryDatasets(data,'catalog','数据使用者',()=>true)
  assert.equal(directory.length,1)
  assert.deepEqual(directory[0].versions.map(v=>v.id),['soil-v1'])
  assert.equal(libraryDatasets(data,'square','数据使用者',()=>true)[0].versions.length,2)
  assert.equal(libraryDatasets(data,'mydatasets','数据使用者',()=>true).length,0)
  assert.equal(libraryDatasets(data,'mydatasets','管理员',()=>true).length,2)
  assert.equal(libraryDatasets(data,'square','管理员',()=>false).length,0)
})

test('导出将记录结构与文件格式分开，使用修订答案，保留原始记录', () => {
  const records=[{question:'采样深度？',answer:'错误',correctedAnswer:'20厘米',reference:'原文'},{question:'忽略',answer:'忽略',status:'过滤'}]
  const before=JSON.stringify(records)
  assert.deepEqual(exportDatasetRecords(records,'Alpaca'),[{instruction:'采样深度？',input:'原文',output:'20厘米'}])
  assert.deepEqual(exportDatasetRecords(records,'ShareGPT'),[{conversations:[{from:'human',value:'采样深度？'},{from:'gpt',value:'20厘米'}]}])
  assert.equal(JSON.stringify(records),before)
  assert.throws(()=>exportDatasetRecords([{image:'data:image/png'}],'Alpaca'),/需要每条记录/)
})

test('标注任务输入不会串用其它数据集，不提供已过滤内容或重复解析选项', () => {
  const sources=[{id:'pdf',datasetId:'a',type:'PDF',name:'论文',content:''},{id:'txt',datasetId:'b',type:'TXT',content:'其它项目'}]
  const versions=[{id:'parsed',datasetId:'a',sourceId:'pdf',type:'PDF解析',records:[{content:'正文'}]},{id:'empty',datasetId:'a',type:'文本清洗',records:[{content:'已过滤',status:'过滤'}]}]
  assert.deepEqual(generationInputs('知识片段',sources,versions,'a').map(input=>input.id),['parsed'])
  assert.deepEqual(generationInputs('图片问答',sources,versions,'a'),[])
  assert.deepEqual(generationInputs('问答增强',sources,versions,'a'),[])
})

test('分类可从空上下文或其它项目进入；明确选择的清洗结果不会回退到已过滤原文', () => {
  const sources=[{id:'text',datasetId:'a',type:'TXT',name:'资料',content:'原始内容'}]
  const versions=[{id:'filtered',datasetId:'a',type:'文本清洗',records:[{content:'已过滤原文',status:'过滤'}]}]
  assert.equal(classificationInputs('text',sources,versions,'a',undefined).length,1)
  assert.equal(classificationInputs('text',sources,versions,'a',{datasetId:'b',inputIds:['filtered']}).length,1)
  assert.deepEqual(classificationInputs('text',sources,versions,'a',{datasetId:'a',inputIds:['filtered']}),[])
  assert.deepEqual(classificationInputs('image',sources,versions,'a',undefined),[])
  const images=[...sources,{id:'image',datasetId:'a',type:'PNG',name:'图片',content:'data:image/png;base64,AA'}]
  assert.deepEqual(classificationInputs('image',images,versions,'a',{datasetId:'a',inputIds:['filtered']}),[])
})

test('明确选择原资料时不会混入无关导入条目，多个交接输入只汇集所选记录', () => {
  const sources = [{ id: 'raw', datasetId: 'a', type: 'TXT', content: '选中正文', name: '原资料' }]
  const versions = [
    { id: 'unrelated', datasetId: 'a', type: '条目导入', records: [{ content: '无关内容' }] },
    { id: 'clean-a', datasetId: 'a', type: '文本清洗', records: [{ content: '内容甲' }] },
    { id: 'clean-b', datasetId: 'a', type: '文本清洗', records: [{ content: '内容乙' }] },
  ]
  assert.deepEqual(classificationInputs('text', sources, versions, 'a', { datasetId: 'a', inputIds: ['raw'] }).map(record => record.content), ['选中正文'])
  assert.deepEqual(classificationInputs('text', sources, versions, 'a', { datasetId: 'a', inputIds: ['clean-a', 'clean-b'] }).map(record => record.content), ['内容甲', '内容乙'])
  assert.deepEqual(classificationInputs('text', sources, versions, 'a', { datasetId: 'a', inputIds: ['missing'] }), [])
})
