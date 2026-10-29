const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
const at='2026-10-28T06:00:00.000Z';
function work(platform='douyin',extra={}){return {id:'fixture-'+platform,title:'固定测试作品',demo:false,createdAt:at,updatedAt:at,publications:[{id:'pub-'+platform,platform,url:platform==='douyin'?'https://www.douyin.com/video/9000000000000000001':'https://www.bilibili.com/video/BV1TEST00001/',createdAt:at}],drafts:[],generationHistory:[],...extra};}
async function fixture({works=[],registered=work(),processError=null}={}){
 const state={settings:{direction:'',audience:'',style:'自然',duration:60,scheduleEnabled:false,scheduleTime:''},works:structuredClone(works),comments:[],plans:[],jobs:[],accounts:[],discoveries:[],capabilities:{},aiReceipt:null};
 const calls=[],errors=[];
 const dom=new JSDOM(fs.readFileSync(path.join(root,'ui','index.html'),'utf8').replace('<script src="app.js"></script>',''),{runScripts:'outside-only',url:'https://offline-test.invalid/'});
 const window=dom.window;
 window.confirm=()=>true;
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 window.addEventListener('error',e=>errors.push(e.message));
 window.workbench={onChanged(){},async call(action,args={}){
  calls.push({action,args:JSON.parse(JSON.stringify(args))});
  if(action==='state')return {state:structuredClone(state),paths:{root,data:path.resolve(__dirname,'fixtures')},tools:{video:true,speech:true}};
  if(action==='media')return '';
  if(action==='registerPublished'){
   const existing=state.works.some(w=>w.id===registered.id);
   if(!existing)state.works.unshift(structuredClone(registered));
   return {workId:registered.id,pubId:registered.publications[0].id,existing,demo:false};
  }
  if(action==='processLinkedVideo'||action==='processVideo'){
   if(processError)throw Error(processError);
   state.jobs.unshift({id:'job-1',workId:args.workId,type:'video',label:'读取视频并生成文案',status:'queued',message:'等待处理',createdAt:at});
   return 'job-1';
  }
  throw Error('Unexpected action: '+action);
 }};
 window.eval(fs.readFileSync(path.join(root,'ui','app.js'),'utf8'));
 const wait=async check=>{for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}assert.fail('界面状态未按预期更新');};
 await wait(()=>window.document.querySelector('#content').textContent.length>0);
 const click=selector=>{const el=window.document.querySelector(selector);assert.ok(el,selector);el.click();};
 const submit=()=>{const f=window.document.querySelector('#published-work-form');f.elements.url.value=registered.publications[0].url;f.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));return f;};
 return {window,state,calls,errors,wait,click,submit,close:()=>dom.window.close()};
}

test('抖音链接入口先登记、保留作品编号，再生成文案，并阻止重复提交',async()=>{
 const f=await fixture();try{
  f.click('[data-action="registerLinkedVideo"]');
  assert.equal(f.window.document.querySelector('#published-work-form').dataset.generate,'true');
  assert.match(f.window.document.querySelector('#modal-content').textContent,/先实际读取视频/);
  f.submit();f.submit();
  await f.wait(()=>f.window.document.querySelector('#taskbar').textContent.includes('读取视频并生成文案'));
  assert.deepEqual(f.calls.filter(c=>['registerPublished','processLinkedVideo'].includes(c.action)).map(c=>c.action),['registerPublished','processLinkedVideo']);
  assert.deepEqual(f.calls.find(c=>c.action==='processLinkedVideo').args,{workId:'fixture-douyin',pubId:'pub-douyin'});
  assert.match(f.window.document.querySelector('#content').textContent,/固定测试作品/);
  assert.ok(f.window.document.querySelector('[data-action="processLinkedVideo"][data-work="fixture-douyin"]'));
  assert.ok(f.window.document.querySelector('[data-action="attachVideo"]'));
  assert.equal(f.state.works.length,1);
  assert.deepEqual(f.errors,[]);
 }finally{f.close();}
});

test('读取任务启动失败后作品保留，详情仍可重试，且有错误说明',async()=>{
 const f=await fixture({processError:'需要先登录并播放视频'});try{
  f.click('[data-action="registerLinkedVideo"]');f.submit();
  await f.wait(()=>f.window.document.querySelector('#toast').textContent.includes('作品已保留'));
  assert.equal(f.state.works.length,1);
  assert.equal(f.window.document.querySelector('#modal').open,false);
  assert.match(f.window.document.querySelector('#toast').textContent,/需要先登录并播放视频/);
  f.click('[data-action="backLibrary"]');
  f.click('[data-action="showWork"][data-work="fixture-douyin"]');
  f.click('[data-action="processLinkedVideo"]');
  await f.wait(()=>f.calls.filter(c=>c.action==='processLinkedVideo').length===2);
  assert.equal(f.calls.filter(c=>c.action==='registerPublished').length,1);
  assert.deepEqual(f.errors,[]);
 }finally{f.close();}
});

test('普通登记不调用生成；B站纯链接仅补原视频，评论按钮标明用途',async()=>{
 const f=await fixture({registered:work('bilibili')});try{
  f.click('[data-action="registerPublished"]');f.submit();
  await f.wait(()=>f.window.document.querySelector('[data-action="attachVideo"]'));
  assert.equal(f.window.document.querySelector('[data-action="processLinkedVideo"]'),null);
  assert.equal(f.calls.some(c=>c.action==='processLinkedVideo'),false);
  assert.match(f.window.document.querySelector('[data-action="collect"]').textContent,/读取评论与数据/);
  assert.match(f.window.document.querySelector('#content').textContent,/其他平台请补入原视频/);
  assert.deepEqual(f.errors,[]);
 }finally{f.close();}
});

test('已有本地视频直接整理，不提供重新下载按钮',async()=>{
 const f=await fixture({works:[work('douyin',{videoPath:path.resolve(__dirname,'fixtures','video.mp4')})]});try{
  f.click('[data-page="library"]');f.click('[data-action="showWork"]');
  assert.equal(f.window.document.querySelector('[data-action="processLinkedVideo"]'),null);
  assert.equal(f.window.document.querySelector('[data-action="attachVideo"]'),null);
  f.click('[data-action="processVideo"]');
  await f.wait(()=>f.calls.some(c=>c.action==='processVideo'));
  assert.equal(f.calls.some(c=>c.action==='processLinkedVideo'),false);
  assert.deepEqual(f.errors,[]);
 }finally{f.close();}
});
