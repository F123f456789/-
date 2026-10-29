const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {Store}=require('../src/store.cjs');const {Workbench}=require('../src/service.cjs');const {planPrompt,historyContext,validatePlan}=require('../src/content.cjs');
const root=path.resolve(__dirname,'..');const {temp}=require('./support.cjs');
test('旧视频的新评论优先入选，超出20份计划的旧反馈仍参与分析，演示与本人资料分开',()=>{
 const state=new Store(temp()).state;state.works=Array.from({length:45},(_,i)=>({id:'w'+i,title:'隔离测试作品'+i,demo:false,createdAt:new Date(Date.UTC(2026,9,28)-i*86400000).toISOString(),publications:[]}));
 state.works.push({id:'demo',title:'演示作品不属于我',demo:true,createdAt:'2026-10-28T08:00:00Z',publications:[]});
 state.comments=[{id:'old-new',workId:'w44',text:'旧作品收到的新问题',collectedAt:'2026-10-28T08:00:00Z',source:{platform:'bilibili'}},{id:'demo-comment',workId:'demo',text:'演示评论',collectedAt:'2026-10-28T08:00:01Z',source:{platform:'bilibili'}}];
 state.plans=Array.from({length:25},(_,i)=>({id:'p'+i,day:'2026-10-01',demo:false,feedback:i===24?'不感兴趣':'未处理',candidateFeedback:{},result:{recommendedIndex:0,script:{title:'隔离历史题'+i},candidates:[{title:'隔离历史题'+i}]}}));
 const context=planPrompt(state);assert.ok(context.evidence.some(e=>e.id==='old-new'));assert.ok(context.evidence.some(e=>e.id==='w44'));assert.equal(context.selection.selectedWorks,30);assert.equal(context.selection.totalWorks,45);assert.ok(context.excludedTopics.includes('隔离历史题24'));assert.ok(context.prompt.includes('隔离历史题24'));assert.equal(context.evidence.some(e=>e.id.startsWith('demo')),false);
 const demo=planPrompt(state,{includeDemo:true});assert.equal(demo.selection.totalWorks,1);assert.ok(demo.evidence.every(e=>['demo','demo-comment'].includes(e.id)));
});
test('拒绝完全相同的已拍标题和同批重复题，格式变化不能绕过重复检查',()=>{
 const r={candidates:[{title:'已经拍过的题！',evidenceIds:[]},{title:'新方向二',evidenceIds:[]},{title:'新方向三',evidenceIds:[]}],recommendedIndex:0,script:{title:'当前新标题',spoken:'口播',drafts:{douyin:'a',bilibili:'b',xiaohongshu:'c',x:'d'}}};
 assert.throws(()=>validatePlan(r,[],{excludedTopics:['已经拍过的题']}),/重复/);r.candidates[0].title='新方向二';assert.throws(()=>validatePlan(r,[]),/重复/);r.candidates[0].title='新的不同方向';assert.equal(validatePlan(r,[],{excludedTopics:['已经拍过的题']}),true);
});
test('重复旧反馈的生成失败后不自动重试；改为暂存后以最新决定为准',async()=>{
 const actual=require('./fixtures.cjs').legacyResult();const output=structuredClone(actual);output.candidates.forEach((c,i)=>{c.title=['很早已放弃的隔离测试题','隔离新方向二','隔离新方向三'][i];c.evidenceIds=[];});
 let calls=0;const app=new Workbench(root,{dataRoot:temp(),trendsFetcher:async()=>({items:[],issues:['隔离测试未读取热榜'],fetchedAt:new Date().toISOString()}),ai:{async generate(){calls++;return {data:structuredClone(output),receipt:{status:'test-only'}};},close(){}}});
 const old={id:'old',day:'2025-01-01',createdAt:'2025-01-01T00:00:00Z',demo:false,feedback:'不感兴趣',candidateFeedback:{},result:{script:{title:'很早已放弃的隔离测试题'},recommendedIndex:0,candidates:[{title:'很早已放弃的隔离测试题'}]}};
 app.store.update(s=>s.plans.push(...Array.from({length:24},(_,i)=>({id:'newer'+i,day:'2025-02-01',demo:false,feedback:'未处理',candidateFeedback:{},result:{script:{title:'隔离历史'+i},candidates:[]}})),old));
 app.generatePlan();await app.chain;assert.equal(calls,1);assert.equal(app.store.state.jobs[0].status,'failed');assert.match(app.store.state.jobs[0].message,/重复/);assert.equal(app.store.state.plans.length,25);
 app.feedback('old','暂存');assert.equal(historyContext(app.store.state).excludedTopics.includes(old.result.script.title),false);app.generatePlan({force:true});await app.chain;assert.equal(calls,2);assert.equal(app.store.state.jobs[0].status,'completed');assert.equal(app.store.state.plans.length,26);assert.equal(new Store(app.dataRoot).state.plans.find(p=>p.id==='old').feedback,'暂存');
});
