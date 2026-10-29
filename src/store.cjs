const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const id=()=>crypto.randomUUID();const now=()=>new Date().toISOString();
function recordMetrics(publication,values,source){
 if(publication.metrics){publication.metricsHistory=publication.metricsHistory||[];publication.metricsHistory.unshift({values:structuredClone(publication.metrics),source:structuredClone(publication.metricsSource||{method:'早期记录，来源信息不完整',at:publication.lastCollectedAt||null})});publication.metricsHistory=publication.metricsHistory.slice(0,100);}
 publication.metrics=structuredClone(values);publication.metricsSource={...source,at:source.at||now()};
}
function initial(){return {version:1,settings:{direction:'',audience:'',style:'自然、具体、避免夸张',duration:60,model:'',scheduleEnabled:false,scheduleTime:'',includeDemo:false},works:[],comments:[],plans:[],jobs:[],accounts:[],discoveries:[],capabilities:{},aiReceipt:null};}
class Store{
 constructor(root){this.root=root;fs.mkdirSync(root,{recursive:true});this.file=path.join(root,'library.json');this.state=initial();if(fs.existsSync(this.file)){try{this.state={...initial(),...JSON.parse(fs.readFileSync(this.file,'utf8'))};}catch{const backup=this.file+'.bak';if(!fs.existsSync(backup))throw Error('作品库无法读取，请从备份恢复，不会覆盖原文件。');this.state=JSON.parse(fs.readFileSync(backup,'utf8'));this.state.recoveryNotice='作品库主文件损坏，已使用上次备份，请检查最近一次操作。';}}this.state.settings={...initial().settings,...this.state.settings};for(const j of this.state.jobs){if(['running','queued'].includes(j.status)){j.status='interrupted';j.message='上次运行被中断，素材已保存，请手动重试。';j.finishedAt=now();}}this.save();}
 save(){const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(this.state,null,2));if(fs.existsSync(this.file))fs.copyFileSync(this.file,this.file+'.bak');fs.renameSync(tmp,this.file);}
 update(fn){const before=JSON.stringify(this.state);try{const r=fn(this.state);this.save();return r;}catch(e){if(JSON.stringify(this.state)!==before)this.state=JSON.parse(before);throw e;}}
 getWork(workId){const w=this.state.works.find(w=>w.id===workId);if(!w)throw Error('没有找到这个作品。');return w;}
 addWork(value){const w={id:id(),createdAt:now(),updatedAt:now(),title:value.title||'未命名作品',demo:false,publications:[],drafts:[],generationHistory:[],...value};this.update(s=>s.works.unshift(w));return w;}
 editDraft(workId,draftId,text){if(typeof text!=='string'||text.length>80000)throw Error('文案长度无效。');return this.update(()=>{const w=this.getWork(workId),d=w.drafts.find(d=>d.id===draftId);if(!d)throw Error('草稿不存在。');d.edits=d.edits||[];d.edits.push({text:d.text,at:now()});d.text=text;d.editedAt=now();w.updatedAt=now();return d;});}
 editPlan(planId,script,candidateIndex){
  for(const key of ['title','hook','spoken'])if(typeof script[key]!=='string'||!script[key].trim()||script[key].length>80000)throw Error('请完整填写标题、开头和口播，单项不超过8万字。');
  for(const key of ['shots','materials'])if(!Array.isArray(script[key])||script[key].some(s=>typeof s!=='string')||JSON.stringify(script[key]).length>80000)throw Error('镜头和材料清单格式不正确。');
  for(const key of ['douyin','bilibili','xiaohongshu','x'])if(typeof script.drafts?.[key]!=='string'||!script.drafts[key].trim()||script.drafts[key].length>80000)throw Error('请保留完整的四平台草稿，单项不超过8万字。');
  if(!Number.isFinite(script.durationSeconds)||script.durationSeconds<=0||script.durationSeconds>7200)throw Error('预计时长请填1至7200秒。');
  return this.update(s=>{const p=s.plans.find(p=>p.id===planId);if(!p)throw Error('选题不存在。');
   if(candidateIndex!==undefined&&candidateIndex!==null){
    if(!Number.isInteger(candidateIndex)||candidateIndex<0||candidateIndex>=p.result.candidates.length)throw Error('选题序号无效。');
    const entry=p.shootingPlans?.[candidateIndex];
    if(entry){entry.edits=entry.edits||[];entry.edits.push({script:structuredClone(entry.script),at:now()});entry.script=structuredClone(script);entry.editedAt=now();return p;}
    if(candidateIndex!==p.result.recommendedIndex)throw Error('请先为这条选题展开拍摄方案。');
   }
   if(!p.result.script)throw Error('请先展开拍摄方案。');p.edits=p.edits||[];p.edits.push({script:structuredClone(p.result.script),at:now()});p.result.script=structuredClone(script);p.editedAt=now();return p;
  });
 }
 addDrafts(workId,drafts,receipt){return this.update(()=>{const w=this.getWork(workId);const version=id();for(const p of ['douyin','bilibili','xiaohongshu','x']){if(typeof drafts[p]!=='string'||!drafts[p].trim())throw Error('AI 未生成完整的四平台草稿。');}w.drafts.unshift(...Object.entries(drafts).map(([platform,text])=>({id:id(),platform,text,createdAt:now(),version,edits:[]})));w.generationHistory.push(receipt);w.updatedAt=now();});}
 addComments(workId,publicationId,rows,source){return this.update(s=>{this.getWork(workId);let added=0;for(const r of rows){if(!r.text?.trim())continue;const text=r.text.trim().slice(0,10000);const key=crypto.createHash('sha256').update([workId,source.platform,r.externalId||r.author||'',text].join('|')).digest('hex');if(s.comments.some(c=>c.key===key))continue;s.comments.push({id:id(),key,workId,publicationId:publicationId||null,text,author:r.author||'',likes:Number.isFinite(r.likes)?r.likes:null,externalId:r.externalId||null,publishedAt:r.publishedAt||null,source:{...source},collectedAt:now()});added++;}return added;});}
}
function beijingParts(date=new Date()){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);const o=Object.fromEntries(p.map(x=>[x.type,x.value]));return {day:`${o.year}-${o.month}-${o.day}`,time:`${o.hour}:${o.minute}`};}
function scheduleDue(state,date=new Date()){const s=state.settings;if(!s.scheduleEnabled||!/^\d{2}:\d{2}$/.test(s.scheduleTime))return false;const t=beijingParts(date);if(t.time<s.scheduleTime)return false;if(state.plans.some(p=>p.day===t.day&&!p.demo))return false;if(state.jobs.some(j=>j.scheduleDay===t.day))return false;return t.day;}
module.exports={Store,id,now,beijingParts,scheduleDue,recordMetrics};
