const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {Workbench}=require('../src/service.cjs');const {Store}=require('../src/store.cjs');
const root=path.resolve(__dirname,'..');const {temp:dir}=require('./support.cjs');
const analysis={overview:'仅为隔离测试',questions:[],agreements:[],objections:[],needs:[],limitations:[]};
const topics=()=>({analysis,candidates:[0,1,2].map(i=>({title:'不同选题'+i,strategy:'探索',testHypothesis:'独立测试假设',reason:'理由',difference:'角度',uncertainty:'尚需实践',evidenceIds:[]})),recommendedIndex:0});
const script=title=>({title,hook:'开头',spoken:'可拍的完整口播',shots:['镜头'],materials:['材料'],durationSeconds:60,drafts:{douyin:'抖音正文',bilibili:'B站正文',xiaohongshu:'小红书正文',x:'X正文'}});
const emptyTrends=async()=>({items:[],fetchedAt:new Date().toISOString(),issues:['本次测试不读取平台']});

test('只生成选题，指定候选后才生成方案；重试去重、编辑与历史独立保留',async()=>{
 const requests=[];let fail=false;
 const app=new Workbench(root,{dataRoot:dir(),trendsFetcher:emptyTrends,ai:{async generate(prompt,options){requests.push({prompt,schema:options.schema});if(fail)throw Error('临时失败');return {data:options.schema.properties.script?{script:script('选中的第二题方案')}:topics(),receipt:{status:'test'}};},close(){}}});
 app.generatePlan();await app.chain;assert.equal(requests.length,1);assert.equal(requests[0].schema.properties.script,undefined);const p=app.store.state.plans[0];assert.equal(p.result.script,undefined);assert.deepEqual(p.shootingPlans,{});assert.equal(p.contentMethod.name,'cheat-on-content');assert.match(app.exportPlan(p.id),/想验证：独立测试假设/);assert.ok(p.collectionIssues.length);assert.doesNotMatch(app.exportPlan(p.id),/完整口播/);
 assert.throws(()=>app.generateShootingPlan({planId:p.id,index:4}),/请选择/);app.generateShootingPlan({planId:p.id,index:1});assert.throws(()=>app.generateShootingPlan({planId:p.id,index:1}),/正在生成/);await app.chain;
 assert.equal(requests.length,2);assert.match(requests[1].prompt,/不同选题1/);assert.equal(p.shootingPlans[0],undefined);assert.ok(p.shootingPlans[1]);assert.equal(app.generateShootingPlan({planId:p.id,index:1}).existing,true);assert.equal(requests.length,2);
 app.store.editPlan(p.id,script('用户编辑的第二题'),1);assert.equal(p.shootingPlans[1].edits.length,1);assert.equal(p.result.script,undefined);assert.match(app.exportPlan(p.id,1),/用户编辑的第二题/);assert.doesNotMatch(app.exportPlan(p.id),/用户编辑的第二题/);
 fail=true;app.generateShootingPlan({planId:p.id,index:1,force:true});await app.chain;assert.equal(app.store.state.jobs[0].status,'failed');assert.equal(p.shootingPlans[1].script.title,'用户编辑的第二题');
 fail=false;app.generateShootingPlan({planId:p.id,index:1,force:true});await app.chain;assert.equal(p.shootingPlans[1].history[0].script.title,'用户编辑的第二题');assert.equal(p.shootingPlans[1].history[0].edits.length,1);assert.equal(p.shootingPlans[1].history[0].contentMethod.name,'cheat-on-content');assert.equal(new Store(app.dataRoot).state.plans[0].shootingPlans[1].history.length,1);
});

test('热点失败仍明确标注后生成选题；不保存模型擅自返回的脚本',async()=>{
 let prompt;const app=new Workbench(root,{dataRoot:dir(),trendsFetcher:async()=>{throw Error('network');},ai:{async generate(text){prompt=text;return {data:{...topics(),script:script('不应提前生成')},receipt:{}};},close(){}}});app.generatePlan();await app.chain;const p=app.store.state.plans[0];assert.equal(p.result.script,undefined);assert.equal(p.trends.items.length,0);assert.match(p.collectionIssues.join(''),/未取得当前热点/);assert.match(prompt,/未取得当前热点/);
});

test('旧版方案可直接查看和编辑，默认导出仅选题，无自动AI调用',()=>{
 const app=new Workbench(root,{dataRoot:dir(),trendsFetcher:emptyTrends,ai:{generate(){throw Error('不应调用AI');},close(){}}});const p={id:'legacy',day:'2026-10-01',createdAt:'2026-10-01',result:{...topics(),script:script('旧方案')},evidence:[],feedback:'未处理'};app.store.update(s=>s.plans.push(p));assert.equal(app.generateShootingPlan({planId:p.id,index:0}).existing,true);assert.doesNotMatch(app.exportPlan(p.id),/完整口播/);assert.match(app.exportPlan(p.id,0),/完整口播/);app.store.editPlan(p.id,script('校对旧方案'),0);assert.equal(p.result.script.title,'校对旧方案');assert.equal(p.edits[0].script.title,'旧方案');
});
