import test from 'node:test'
import assert from 'node:assert/strict'
import { readDemoSession, resolveSessionPage, publicRecommendations } from '../src/auth.js'

test('未登录只能进入外部首页，登录后默认工作台并保留可访问的业务链接', () => {
  const pages=['workbench','projects','generation','settings']
  for (const requested of ['', 'home', 'projects', 'settings', 'unknown']) assert.equal(resolveSessionPage(requested,false,pages),'home')
  for (const requested of ['', 'home', 'unknown']) assert.equal(resolveSessionPage(requested,true,pages),'workbench')
  assert.equal(resolveSessionPage('projects',true,pages),'projects')
  assert.equal(resolveSessionPage('annotation',true,pages),'generation')
  assert.equal(resolveSessionPage('models',true,pages),'settings')
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
