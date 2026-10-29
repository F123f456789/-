const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),at='2026-10-28T06:00:00.000Z';
function script(index){return {title:'拍摄方案'+index,hook:'开头'+index,spoken:'口播'+index,shots:['镜头'+index],materials:['材料'+index],durationSeconds:60,drafts:{douyin:'抖音'+index,bilibili:'B站'+index,xiaohongshu:'小红书'+index,x:'X'+index}};}
function plan(id='p'){return {id,day:'2026-10-28',createdAt:at,demo:false,feedback:'未处理',candidateFeedback:{},evidence:[{id:'h1',kind:'热点',title:'真实热点样本',url:'https://www.douyin.com/hot/fixture',source:'隔离热榜',fetchedAt:at}],trends:{fetchedAt:at,issues:['热点只代表关注度']},result:{analysis:{overview:'选题分析',questions:[],agreements:[],objections:[],needs:[],limitations:[]},candidates:[0,1,2].map(i=>({title:'选题'+i,reason:'理由'+i,difference:'角度'+i,uncertainty:'未核实',evidenceIds:['h1']})),recommendedIndex:0}};}
async function fixture(plans=[]){
 const state={settings:{direction:'',duration:60,scheduleEnabled:false},works:[],comments:[],plans:structuredClone(plans),jobs:[],accounts:[],discoveries:[],capabilities:{},aiReceipt:null},calls=[],errors=[];
 const dom=new JSDOM(fs.readFileSync(path.join(root,'ui','index.html'),'utf8').replace('<script src="app.js"></script>',''),{runScripts:'outside-only',url:'https://offline-test.invalid/'}),w=dom.window;let onChanged;
 w.confirm=()=>true;w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.addEventListener('error',e=>errors.push(e.message));
 w.workbench={onChanged(fn){onChanged=fn;},async call(action,args={}){calls.push({action,args:JSON.parse(JSON.stringify(args))});if(action==='state')return {state:structuredClone(state),paths:{},tools:{}};if(action==='generatePlan'){state.plans.unshift(plan());return {jobId:'topic-job'};}if(action==='generateShootingPlan'){const p=state.plans.find(p=>p.id===args.planId);p.shootingPlans=p.shootingPlans||{};p.shootingPlans[args.index]={script:script(args.index),createdAt:at,edits:[]};return {jobId:'shooting-job'};}if(action==='copy')return true;if(action==='editPlan'){const p=state.plans.find(p=>p.id===args.planId),entry=p.shootingPlans[args.candidateIndex];entry.edits.push({script:structuredClone(entry.script),at});entry.script=args.script;entry.editedAt=at;return true;}if(action==='export')return path.resolve(__dirname,'fixtures','export.md');throw Error('Unexpected action '+action);}};
 w.eval(fs.readFileSync(path.join(root,'ui','app.js'),'utf8'));
 const wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}assert.fail('UI did not update');};await wait(()=>w.document.querySelector('#content').textContent.length>0);
 const click=selector=>{const button=w.document.querySelector(selector);assert.ok(button,selector);button.click();};
 return {w,state,calls,errors,wait,click,changed:()=>onChanged(),close:()=>dom.window.close()};
}

test('先生成选题，不生成或展示脚本；点击第二选题才展开对应方案',async()=>{
 const f=await fixture();try{
  f.click('[data-action="generatePlan"]');await f.wait(()=>f.w.document.querySelectorAll('[data-action="generateShootingPlan"]').length===3);
  assert.equal(f.calls.filter(c=>c.action==='generateShootingPlan').length,0);assert.equal(f.w.document.querySelector('[data-action="copyScript"]'),null);assert.doesNotMatch(f.w.document.querySelector('#content').textContent,/完整口播/);
  assert.match(f.w.document.querySelector('#content').textContent,/1 条热点/);assert.match(f.w.document.querySelector('#content').textContent,/热点获取于/);assert.match(f.w.document.querySelector('#content').textContent,/热点只代表关注度/);
  f.click('[data-action="generateShootingPlan"][data-index="1"]');await f.wait(()=>f.w.document.querySelector('[data-action="copyScript"]'));
  assert.deepEqual(f.calls.find(c=>c.action==='generateShootingPlan').args,{planId:'p',index:1});assert.match(f.w.document.querySelector('#content').textContent,/口播1/);assert.doesNotMatch(f.w.document.querySelector('#content').textContent,/口播0/);
  f.changed();await f.wait(()=>f.calls.filter(c=>c.action==='state').length>=4);assert.ok(f.w.document.querySelector('[data-action="copyScript"][data-index="1"]'));
  assert.deepEqual(f.errors,[]);
 }finally{f.close();}
});

test('已生成方案直接查看；复制、编辑、导出均针对所选候选',async()=>{
 const p=plan();p.shootingPlans={0:{script:script(0),createdAt:at,edits:[]},1:{script:script(1),createdAt:at,edits:[]}};const f=await fixture([p]);try{
  f.click('[data-action="generateShootingPlan"][data-index="1"]');assert.equal(f.calls.some(c=>c.action==='generateShootingPlan'),false);
  f.click('[data-action="copyScript"]');f.click('[data-action="copyPlanDraft"][data-platform="x"]');await f.wait(()=>f.calls.filter(c=>c.action==='copy').length===2);assert.deepEqual(f.calls.filter(c=>c.action==='copy').map(c=>c.args.text),['口播1','X1']);
  f.click('[data-action="exportPlan"][data-index="1"]');await f.wait(()=>f.calls.some(c=>c.action==='export'));assert.deepEqual(f.calls.find(c=>c.action==='export').args,{planId:'p',candidateIndex:1});
  f.click('[data-action="editPlan"]');const form=f.w.document.getElementById('plan-edit-form');assert.equal(form.dataset.index,'1');form.elements.spoken.value='手动校对第二题';form.elements.spoken.dispatchEvent(new f.w.Event('input',{bubbles:true}));
  form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await f.wait(()=>f.calls.some(c=>c.action==='editPlan'));assert.equal(f.calls.find(c=>c.action==='editPlan').args.candidateIndex,1);assert.equal(f.state.plans[0].shootingPlans[0].script.spoken,'口播0');assert.equal(f.state.plans[0].shootingPlans[1].script.spoken,'手动校对第二题');await f.wait(()=>!f.w.document.getElementById('modal').open);
  f.click('[data-action="generateShootingPlan"][data-force="true"]');await f.wait(()=>f.calls.some(c=>c.action==='generateShootingPlan'));assert.deepEqual(f.calls.find(c=>c.action==='generateShootingPlan').args,{planId:'p',index:1,force:true});assert.deepEqual(f.errors,[]);
 }finally{f.close();}
});

test('旧计划脚本默认折起，无脚本历史记录可打开，导出选题不夹带方案',async()=>{
 const legacy=plan('legacy');legacy.result.script=script(0);const f=await fixture([legacy,plan('new')]);try{
  assert.equal(f.w.document.querySelector('[data-action="copyScript"]'),null);f.click('[data-action="exportPlan"]');await f.wait(()=>f.calls.some(c=>c.action==='export'));assert.deepEqual(f.calls.find(c=>c.action==='export').args,{planId:'legacy'});
  f.click('[data-action="generateShootingPlan"][data-index="0"]');assert.ok(f.w.document.querySelector('[data-action="copyScript"]'));assert.equal(f.calls.some(c=>c.action==='generateShootingPlan'),false);
  f.click('[data-action="showPlan"][data-plan="new"]');assert.equal(f.w.document.querySelector('[data-action="copyScript"]'),null);assert.equal(f.w.document.querySelectorAll('[data-action="generateShootingPlan"]').length,3);assert.deepEqual(f.errors,[]);
 }finally{f.close();}
});

test('未保存编辑时生成选题或切换方案会受到保护',async()=>{
 const p=plan();p.shootingPlans={0:{script:script(0),createdAt:at,edits:[]}};const f=await fixture([p]);try{
  f.click('[data-action="generateShootingPlan"][data-index="0"]');f.click('[data-action="editPlan"]');const editor=f.w.document.querySelector('#plan-edit-form textarea[name="spoken"]');editor.value='保留未保存内容';editor.dispatchEvent(new f.w.Event('input',{bubbles:true}));
  f.click('[data-action="generatePlan"]');assert.equal(f.calls.some(c=>c.action==='generatePlan'),false);assert.match(f.w.document.getElementById('toast').textContent,/请先保存/);
  f.w.confirm=()=>false;f.click('[data-action="generateShootingPlan"][data-index="1"]');assert.equal(f.calls.some(c=>c.action==='generateShootingPlan'),false);assert.equal(editor.value,'保留未保存内容');
 }finally{f.close();}
});

test('新选题展示方法、方向和待验证想法，旧选题兼容且不自动生成方案',async()=>{
 const current=plan('current');current.contentMethod={name:'cheat-on-content',mode:'选题方法适配',notice:'采用热点筛选、历史去重和延续/探索推荐方法；尚未校准，不作播放量预测。'};
 current.result.candidates[0].strategy='延续';current.result.candidates[0].testHypothesis='观众是否需要更具体的入门例子';current.result.candidates[1].strategy='探索';current.result.candidates[1].testHypothesis='<img src=x onerror=alert(1)>只是待验证的文字';
 const f=await fixture([current,plan('legacy')]);try{
  assert.match(f.w.document.querySelector('.content-method').textContent,/cheat-on-content/);assert.match(f.w.document.querySelector('.content-method').textContent,/尚未校准，不作播放量预测/);
  assert.deepEqual([...f.w.document.querySelectorAll('.candidate-strategy')].map(el=>el.textContent),['延续','探索']);assert.match(f.w.document.querySelector('.candidate-hypothesis').textContent,/观众是否需要更具体的入门例子/);assert.equal(f.w.document.querySelector('.candidate-hypothesis img'),null);
  assert.equal(f.calls.some(c=>c.action==='generateShootingPlan'),false);assert.equal(f.w.document.querySelector('[data-action="copyScript"]'),null);
  f.click('[data-action="showPlan"][data-plan="legacy"]');assert.equal(f.w.document.querySelector('.content-method'),null);assert.equal(f.w.document.querySelector('.candidate-strategy'),null);assert.equal(f.w.document.querySelector('.candidate-hypothesis'),null);assert.equal(f.w.document.querySelectorAll('[data-action="generateShootingPlan"]').length,3);assert.deepEqual(f.errors,[]);
 }finally{f.close();}
});
