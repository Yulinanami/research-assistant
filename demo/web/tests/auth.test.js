import test from 'node:test'
import assert from 'node:assert/strict'
import { readDemoSession, resolveSessionPage, publicRecommendations, publicCatalog, saveLoginReturn, takeLoginReturn } from '../src/auth.js'

test('未登录允许首页、公开广场与登录页，其他业务链接受保护', () => {
  const pages=['workbench','projects','generation','settings','audit','task-center']
  for (const requested of ['', 'home', 'projects', 'settings', 'unknown', 'project-tasks', 'task-center']) assert.equal(resolveSessionPage(requested,false,pages),'home')
  assert.equal(resolveSessionPage('square',false,pages),'square')
  assert.equal(resolveSessionPage('login',false,pages),'login')
  for (const requested of ['', 'home', 'unknown']) assert.equal(resolveSessionPage(requested,true,pages),'workbench')
  assert.equal(resolveSessionPage('projects',true,pages),'projects')
  assert.equal(resolveSessionPage('annotation',true,pages),'generation')
  assert.equal(resolveSessionPage('models',true,pages),'settings')
  assert.equal(resolveSessionPage('review',true,pages),'audit')
  assert.equal(resolveSessionPage('project-tasks',true,pages),'task-center')
})

test('公开广场只提供已发布资源的基本信息，不携带正文与内部治理记录', () => {
  const data={datasets:[
    {id:'public',name:'公开数据',level:'公开',downloads:12,source:'内部来源',introduction:'公开简介',owner:'发布者',fieldTemplateId:'private-template'},
    {id:'internal',level:'内部'}, {id:'draft',level:'公开'}, {id:'archived',level:'公开',storageState:'已归档'},
  ],versions:[
    {id:'v1',datasetId:'public',number:1,status:'已发布',totalRecords:240,records:[{content:'正文'}],release:{tag:'v1.2.0',publisher:'发布者',publishedAt:'2026/10/01',evidence:{secret:'内部审核'}}},
    {id:'v2',datasetId:'public',number:2,status:'待审核',records:[]},
    {id:'processing',datasetId:'public',number:3,status:'已发布',kind:'processing',records:[]},
    {id:'internal-v1',datasetId:'internal',number:1,status:'已发布',records:[]},
    {id:'draft-v1',datasetId:'draft',number:1,status:'草稿',records:[]},
    {id:'archived-v1',datasetId:'archived',number:1,status:'已发布',records:[]},
  ]}
  const result=publicCatalog(data)
  assert.deepEqual(result.datasets.map(row=>row.id),['public'])
  assert.deepEqual(result.versions.map(row=>row.id),['v1'])
  assert.equal(result.versions[0].totalRecords,240)
  for(const field of ['source','fieldTemplateId']) assert.equal(Object.hasOwn(result.datasets[0],field),false)
  assert.deepEqual(result.versions[0].records,[])
  assert.equal(Object.hasOwn(result.versions[0].release,'evidence'),false)
  assert.equal(publicRecommendations(data)[0].count,240)
})

test('登录返回目标保存在会话中，读取后清除，损坏记录不影响登录', () => {
  const entries=new Map(),storage={getItem:key=>entries.get(key),setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)}
  saveLoginReturn({datasetId:'public',versionId:'v1'},storage)
  assert.deepEqual(takeLoginReturn(storage),{datasetId:'public',versionId:'v1'})
  assert.equal(takeLoginReturn(storage),null)
  saveLoginReturn({datasetId:'public',versionId:'v1'},storage)
  saveLoginReturn(null,storage)
  assert.equal(takeLoginReturn(storage),null)
  assert.equal(takeLoginReturn({getItem:()=>'{broken',removeItem:()=>{}}),null)
})

test('公开分类只返回公开数据使用的领域、二级领域和类型，不包含内部专有分类', () => {
  const result=publicCatalog({datasets:[{id:'pub',level:'公开',domainId:'d',subdomainId:'c',typeId:'t'},{id:'private',level:'内部',domainId:'secret'}],versions:[{id:'v',datasetId:'pub',number:1,status:'已发布',records:[]}],classifications:[{id:'d',name:'公开领域',kind:'domain',parentId:'',description:'内部管理说明'},{id:'c',name:'公开主题',kind:'domain',parentId:'d'},{id:'t',name:'文本',kind:'type',parentId:''},{id:'secret',name:'内部专有',kind:'domain',parentId:''}]})
  assert.deepEqual(result.classifications.map(item=>item.id),['d','c','t'])
  assert.equal(Object.hasOwn(result.classifications[0],'description'),false)
})

test('登录状态缺失、损坏、存储不可用或身份无效时回到未登录状态', () => {
  assert.equal(readDemoSession(null),null)
  assert.equal(readDemoSession({getItem:()=>'{invalid'}),null)
  assert.equal(readDemoSession({getItem:()=>'{"role":"未知身份"}'}),null)
  assert.equal(readDemoSession({getItem:()=>{throw Error('unavailable')}}),null)
  assert.deepEqual(readDemoSession({getItem:()=>'{"role":"加工人员"}'}),{role:'加工人员'})
})

test('外部首页只推荐公开且已发布的数据集，不包含内部、草稿或加工成果', () => {
  const data={datasets:[{id:'internal',level:'内部',name:'内部数据'},{id:'public',level:'公开',name:'公开成果'},{id:'draft',level:'公开',name:'草稿'}],versions:[
    {id:'internal-v1',datasetId:'internal',status:'已发布',number:1,records:[{content:'内部资料'}]},
    {id:'public-v1',datasetId:'public',status:'已发布',number:1,records:[{answer:'公开'}]},
    {id:'public-v2',datasetId:'public',status:'待审核',number:2,records:[{answer:'尚未发布'}]},
    {id:'public-parse',datasetId:'public',type:'PDF解析',status:'已发布',number:3,records:[{content:'中间成果'}]},
    {id:'draft-v1',datasetId:'draft',status:'草稿',number:1,records:[]},
  ]}
  const recommendations=publicRecommendations(data)
  assert.deepEqual(recommendations.map(item=>item.name),['公开成果'])
  assert.equal(recommendations[0].count,1)
  assert.equal(Object.hasOwn(recommendations[0],'records'),false)
})
