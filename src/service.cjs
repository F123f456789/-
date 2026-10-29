const fs=require('node:fs');const fsp=require('node:fs/promises');const path=require('node:path');const {EventEmitter}=require('node:events');
const {Store,id,now,beijingParts,scheduleDue,recordMetrics}=require('./store.cjs');const {Codex,safeError}=require('./codex.cjs');const {prepare}=require('./media.cjs');const content=require('./content.cjs');const platforms=require('./platforms.cjs');
const {fetchTrends}=require('./trends.cjs');const {shootingEntry,exportTopics}=require('./plan-output.cjs');
class Workbench extends EventEmitter{
 constructor(root,{dataRoot,ai,prepareVideo=prepare,trendsFetcher=fetchTrends}={}){super();this.root=root;this.dataRoot=dataRoot||path.join(root,'data');this.store=new Store(this.dataRoot);this.ai=ai||new Codex(root);this.prepareVideo=prepareVideo;this.trendsFetcher=trendsFetcher;this.chain=Promise.resolve();this.running=false;fs.mkdirSync(path.join(root,'cache'),{recursive:true});this.store.update(s=>{s.capabilities=Object.fromEntries(Object.entries(platforms.capabilityDefaults).map(([key,value])=>[key,s.capabilities[key]?.checkedAt?{...value,...s.capabilities[key]}:{...value}]));});}
 snapshot(){return structuredClone(this.store.state);}
 changed(){this.emit('changed');}
 queue(type,label,fn,extra={}){const job={id:id(),type,label,status:'queued',message:'等待处理',createdAt:now(),...extra};this.store.update(s=>s.jobs.unshift(job));this.changed();this.chain=this.chain.then(async()=>{this.running=true;this.store.update(()=>Object.assign(job,{status:'running',startedAt:now(),message:'正在准备…'}));this.changed();const progress=message=>{this.store.update(()=>job.message=message);this.changed();};try{await fn(progress);this.store.update(()=>Object.assign(job,{status:'completed',message:'已完成',finishedAt:now()}));}catch(e){this.store.update(()=>Object.assign(job,{status:'failed',message:safeError(e),finishedAt:now()}));}finally{this.running=false;this.changed();}});return job.id;}
 async importVideo(file,{demo=false,title,source='',existingWorkId=null}={}){
  const existing=existingWorkId?this.store.getWork(existingWorkId):null;if(existing?.videoPath)throw Error('这个作品已有原视频，不会覆盖。请在原作品中生成新版本，或另建作品。');
  const stat=await fsp.stat(file);if(!stat.isFile()||!/\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(file))throw Error('请选择常见视频文件（MP4、MOV、MKV、WebM）。');if(stat.size>8*1024**3)throw Error('当前版本单个视频上限为8GB，请先分段。');
  if(existing?.videoPath)throw Error('这个作品已有原视频，不会覆盖。');const workId=existingWorkId||id();this.importing=this.importing||new Set();if(this.importing.has(workId))throw Error('原视频正在复制，请等待完成。');this.importing.add(workId);
  try{
   const folder=path.join(this.dataRoot,'media',workId);await fsp.mkdir(folder,{recursive:true});const videoPath=path.join(folder,'video'+path.extname(file).toLowerCase());await fsp.copyFile(file,videoPath);let subtitlePath=null;
   for(const ext of ['.srt','.vtt','.txt']){const sub=file.slice(0,-path.extname(file).length)+ext;if(fs.existsSync(sub)){subtitlePath=path.join(folder,'字幕'+ext);await fsp.copyFile(sub,subtitlePath);break;}}
   let w=existing;if(w)this.store.update(()=>Object.assign(w,{videoPath,subtitlePath,updatedAt:now()}));else w=this.store.addWork({id:workId,title:title||path.basename(file,path.extname(file)),titleSource:'file',videoPath,subtitlePath,demo,source});this.changed();return w;
  }finally{this.importing.delete(workId);}
 }
 assertVideoIdle(workId){if(this.store.state.jobs.some(j=>j.type==='video'&&j.workId===workId&&['queued','running'].includes(j.status)))throw Error('这个视频已在处理，请等待完成，避免重复使用额度。');}
 async analyzeVideo(workId,progress){const w=this.store.getWork(workId);if(!w.media){const media=await this.prepareVideo(this.root,w,progress);this.store.update(()=>w.media=media);}progress('正在使用 ChatGPT 会员分析画面和文字…');const method=content.loadContentMethod('writing');const r=await this.ai.generate(content.videoPrompt(w,this.store.state.settings,{method}),{images:w.media.frames.map(f=>f.path),schema:content.videoSchema,model:this.store.state.settings.model||undefined});if(!r.data.summary||!Array.isArray(r.data.points))throw Error('AI 内容分析不完整。');this.store.addDrafts(workId,r.data.drafts,{...r.receipt,contentMethod:method.receipt});this.store.update(s=>{w.analysis={contentMethod:method.receipt,summary:r.data.summary,points:r.data.points,uncertainties:r.data.uncertainties,visualNotes:r.data.visualNotes};s.aiReceipt=r.receipt;});}
 processVideo(workId){if(!this.store.getWork(workId).videoPath)throw Error('这个作品只有发布链接，请先点击“读取视频并生成文案”，或补入本地原视频，再识别内容和生成文案。');this.assertVideoIdle(workId);return this.queue('video','整理视频与四平台草稿',progress=>this.analyzeVideo(workId,progress),{workId});}
 processLinkedVideo(workId,pubId){
  const w=this.store.getWork(workId);if(w.videoPath)return this.processVideo(workId);
  const pub=w.publications.find(p=>pubId?p.id===pubId:p.platform==='douyin');
  if(!pub||pub.platform!=='douyin')throw Error('链接读取视频目前只支持抖音；其他平台请导入本地视频。');
  if(!this.linkedVideoReader)throw Error('请从桌面打开最新版工作台后读取视频。');
  this.assertVideoIdle(workId);
  return this.queue('video','读取抖音视频并生成四平台文案',async progress=>{
   if(!w.videoPath){
    const result=await this.linkedVideoReader(pub,workId,progress);
    try{
     await this.importVideo(result.file,{existingWorkId:workId});
     this.store.update(()=>{w.mediaOrigin=result.source;w.source='从抖音作品页面读取的完整视频；画面为抽样观察，语音识别需校对。来源：'+pub.url;if(w.titleSource==='link'&&result.title){w.title=String(result.title).slice(0,200);w.titleSource='page';}});
    }finally{await result.cleanup?.();}
   }
   await this.analyzeVideo(workId,progress);
  },{workId});
 }
 checkAi(){return this.queue('ai','验证会员连接',async progress=>{progress('通过现有 ChatGPT 登录发起真实验证…');const r=await this.ai.generate('只返回JSON，answer 为“连接成功”。',{schema:{type:'object',properties:{answer:{type:'string'}},required:['answer'],additionalProperties:false},model:this.store.state.settings.model||undefined});this.store.update(s=>s.aiReceipt=r.receipt);});}
 async collect(pub,workId,progress=()=>{}){
  progress('正在读取 '+platforms.PLATFORMS[pub.platform]+' 公开数据…');
  try{
   const r=pub.platform==='bilibili'?await platforms.fetchPublication(pub):this.browserCollect?await this.browserCollect(pub,workId,progress):await platforms.fetchPublication(pub);
   this.store.update(s=>{if(r.title){pub.title=r.title;const w=this.store.getWork(workId);if(w.titleSource==='link'){w.title=r.title;w.updatedAt=now();}}if(r.metrics)recordMetrics(pub,r.metrics,r.source);pub.lastCollectedAt=now();pub.collectionNote=r.commentError||r.scope;pub.lastError=r.commentError||null;s.capabilities[pub.platform]={...s.capabilities[pub.platform],status:r.commentError?'仅指标可用':'本次读取成功',automatic:!r.commentError,checkedAt:now(),detail:r.commentError||r.scope};});
   if(r.comments.length)this.store.addComments(workId,pub.id,r.comments,{...r.source,scope:r.scope});if(r.commentError)throw Error(r.commentError);return r;
  }catch(e){this.store.update(s=>{pub.lastError=safeError(e);pub.lastAttemptAt=now();s.capabilities[pub.platform]={...s.capabilities[pub.platform],status:'当前读取受限',automatic:false,checkedAt:now(),detail:safeError(e)};});throw e;}
 }
 collectJob(workId,pubId){const w=this.store.getWork(workId),pub=w.publications.find(p=>p.id===pubId);if(!pub)throw Error('发布记录不存在。');return this.queue('collect','读取作品评论与数据',p=>this.collect(pub,workId,p),{workId});}
 publicationOwner(url){const key=platforms.publicationKey(url);if(!key)return null;for(const w of this.store.state.works){const pub=w.publications.find(p=>(p.publicationKey||platforms.publicationKey(p.url))===key);if(pub)return {work:w,pub};}return null;}
 addPublication(workId,url,publishedAt=''){
  const parsed=platforms.publicationIdentity(url);const w=this.store.getWork(workId);const owner=this.publicationOwner(parsed.url);
  if(owner)throw Error(owner.work.id===workId?'这个作品链接已经关联，分享参数不同也不会重复登记。':`该链接已关联到“${owner.work.title}”，请打开已有作品，避免重复统计。`);
  const pub={id:id(),...parsed,publishedAt,metrics:null,createdAt:now()};this.store.update(()=>w.publications.push(pub));this.changed();return pub;
 }
 async registerPublished(raw,{title='',publishedAt='',demo=false}={}){
  const parsed=await platforms.resolvePublicationUrl(raw);const owner=this.publicationOwner(parsed.url);if(owner)return {workId:owner.work.id,pubId:owner.pub.id,existing:true,demo:!!owner.work.demo};
  const pub={id:id(),...parsed,publishedAt,metrics:null,createdAt:now()};const supplied=String(title).trim().slice(0,200);
  const w=this.store.addWork({title:supplied||`${platforms.PLATFORMS[parsed.platform]} 已发布作品`,titleSource:supplied?'manual':'link',demo,publications:[pub],source:'由已发布作品链接建立记录。视频内容以实际导入的原视频为准。'});this.changed();return {workId:w.id,pubId:pub.id,existing:false,demo:!!w.demo};
 }
 importComments(workId,publicationId,rows,source){
  if(!source.url&&!source.note)throw Error('请填写评论来源链接或来源说明。');
  if(!Object.hasOwn(platforms.PLATFORMS,source.platform))throw Error('请选择评论对应的平台。');
  const w=this.store.getWork(workId);let pub=publicationId?w.publications.find(p=>p.id===publicationId):null;
  if(publicationId&&!pub)throw Error('评论对应的发布记录不存在。');
  if(source.url){const parsed=platforms.platformUrl(source.url);if(parsed.platform!==source.platform)throw Error('来源链接与选择的平台不一致，请检查后导入。');source={...source,url:parsed.url};const key=platforms.publicationKey(parsed.url);if(pub&&key&&(pub.publicationKey||platforms.publicationKey(pub.url))!==key)throw Error('来源链接与指定作品不一致，请检查评论属于哪条作品。');pub=pub||w.publications.find(p=>key&&(p.publicationKey||platforms.publicationKey(p.url))===key||p.url===parsed.url);}
  if(pub&&pub.platform!==source.platform)throw Error('评论平台与发布记录不一致。');
  const n=this.store.addComments(workId,pub?.id||null,rows,source);this.changed();return n;
 }
 generatePlan({includeDemo=false,scheduleDay=null,force=false}={}){const day=scheduleDay||beijingParts().day;const existing=this.store.state.plans.find(p=>p.day===day&&!!p.demo===!!includeDemo);if(existing&&!force)return {existingId:existing.id};if(this.store.state.jobs.some(j=>j.type==='plan'&&j.planDay===day&&!!j.demo===!!includeDemo&&['queued','running'].includes(j.status)))throw Error('今日选题已在生成，请等待完成。');const jobId=this.queue('plan',includeDemo?'生成演示选题':'生成今日选题',async progress=>{
   const issues=[];if(this.browserDiscover&&!includeDemo){for(const account of this.store.state.accounts){try{progress('正在检查 '+account.name+' 的已发布作品…');await this.browserDiscover(account);}catch(e){issues.push(`${account.name}作品发现：${safeError(e)}`);}}}for(const w of this.store.state.works.filter(w=>!!w.demo===!!includeDemo)){for(const pub of w.publications){try{await this.collect(pub,w.id,progress);}catch(e){issues.push(`${w.title}：${safeError(e)}`);}}}
   progress('正在读取抖音和 B 站当前热点…');let trends;try{trends=await this.trendsFetcher();}catch{trends={items:[],fetchedAt:now(),issues:['本次未取得当前热点，仅根据已保存内容与评论生成选题。']};}issues.push(...(trends.issues||[]));
   progress('正在结合当下热点、历史内容和评论，只生成选题…');const context=content.planPrompt(this.store.state,{includeDemo,trends});const r=await this.ai.generate(context.prompt,{schema:content.planSchema,model:this.store.state.settings.model||undefined});content.validatePlan(r.data,context.evidence,{excludedTopics:context.excludedTopics,requireMethod:true});
   // Never persist an unsolicited script, even if an older model ignores the topic-only schema.
   const result={analysis:r.data.analysis,candidates:r.data.candidates,recommendedIndex:r.data.recommendedIndex};
   this.store.update(s=>{s.plans.unshift({id:id(),day,demo:includeDemo,result,shootingPlans:{},contentMethod:context.contentMethod,trends,evidence:context.evidence,contextScope:context.selection,collectionIssues:issues,createdAt:now(),feedback:'未处理',candidateFeedback:{},receipt:r.receipt});s.aiReceipt=r.receipt;});
 },{planDay:day,demo:includeDemo,...(scheduleDay?{scheduleDay}:{})});return {jobId};}
 generateShootingPlan({planId,index,force=false}={}){
  const plan=this.store.state.plans.find(p=>p.id===planId);if(!plan)throw Error('选题记录不存在。');
  if(!Number.isInteger(index)||index<0||index>=plan.result.candidates.length)throw Error('请选择要展开的选题。');
  if(shootingEntry(plan,index)&&!force)return {existing:true,planId,index};
  if(this.store.state.jobs.some(j=>j.type==='shooting'&&j.planId===planId&&j.candidateIndex===index&&['queued','running'].includes(j.status)))throw Error('这条选题的拍摄方案正在生成，请等待完成。');
  return {jobId:this.queue('shooting','展开拍摄方案：'+plan.result.candidates[index].title,async progress=>{
   progress('正在为你选择的这条选题生成口播和拍摄步骤…');
   const method=content.loadContentMethod('writing');const r=await this.ai.generate(content.shootingPrompt(this.store.state,plan,index,{method}),{schema:content.shootingSchema,model:this.store.state.settings.model||undefined});content.validateShooting(r.data);
   this.store.update(s=>{const previous=shootingEntry(plan,index);const history=previous?[...(previous.history||[]),{script:structuredClone(previous.script),receipt:previous.receipt,contentMethod:previous.contentMethod,createdAt:previous.createdAt,edits:structuredClone(previous.edits||[]),editedAt:previous.editedAt}]:[];plan.shootingPlans=plan.shootingPlans||{};plan.shootingPlans[index]={script:r.data.script,contentMethod:method.receipt,receipt:r.receipt,createdAt:now(),edits:[],history};s.aiReceipt=r.receipt;});
  },{planId,candidateIndex:index})};
 }
 tick(date=new Date()){const day=scheduleDue(this.store.state,date);if(day&&!this.running)return this.generatePlan({scheduleDay:day});return null;}
 settings(values){const allowed=['direction','audience','style','duration','model','scheduleEnabled','scheduleTime'];const next={...this.store.state.settings};for(const k of allowed)if(Object.hasOwn(values,k))next[k]=values[k];if(!Number.isFinite(Number(next.duration))||next.duration<15||next.duration>1800)throw Error('视频时长请填15至1800秒。');next.duration=Number(next.duration);if(next.scheduleEnabled&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(next.scheduleTime))throw Error('启用定时前，请选择每天执行的北京时间。');for(const k of ['direction','audience','style','model'])if(typeof next[k]!=='string'||next[k].length>4000)throw Error('设置内容过长或格式不正确。');this.store.update(s=>s.settings=next);this.changed();return next;}
 feedback(planId,status,index=null){if(!['采用','暂存','不感兴趣','已拍摄'].includes(status))throw Error('选题状态不正确。');this.store.update(s=>{const p=s.plans.find(p=>p.id===planId);if(!p)throw Error('选题不存在。');if(index===null){p.feedback=status;p.feedbackAt=now();}else{if(!Number.isInteger(index)||index<0||index>2)throw Error('选题序号不正确。');p.candidateFeedback=p.candidateFeedback||{};p.candidateFeedback[index]=status;p.candidateFeedbackAt=p.candidateFeedbackAt||{};p.candidateFeedbackAt[index]=now();}});this.changed();}
 exportWork(workId){const w=this.store.getWork(workId);return `# ${w.title}\n\n${w.demo?'第三方演示资料，不是用户原创作品。\n':''}${w.source||''}\n\n## 摘要\n${w.analysis?.summary||'尚未生成'}\n\n## 完整文字稿\n${w.media?.transcript?.text||'尚未识别'}\n\n${w.drafts.map(d=>`## ${platforms.PLATFORMS[d.platform]} · ${d.createdAt}\n\n${d.text}`).join('\n\n')}\n\n## 发布记录\n${w.publications.map(p=>`${platforms.PLATFORMS[p.platform]}：${p.url}`).join('\n')}\n`;}
 exportPlan(planId,candidateIndex){const plan=this.store.state.plans.find(p=>p.id===planId);if(!plan)throw Error('选题不存在。');return exportTopics(plan,candidateIndex);}
 async backup(destination){if(this.running)throw Error('请等当前任务完成后备份。');const folder=path.join(destination,'自媒体工作台备份-'+new Date().toISOString().replace(/[:.]/g,'-'));await fsp.mkdir(folder,{recursive:true});await fsp.cp(this.dataRoot,folder,{recursive:true,filter:src=>!src.includes('browser-session')});await fsp.writeFile(path.join(folder,'备份说明.txt'),'包含作品库、视频、文字稿及草稿，不包含登录信息。备份到另一块实体磁盘才属于独立备份。恢复时关闭应用，将备份内容复制到应用 data 文件夹。');return folder;}
 close(){this.ai.close();}
}
module.exports={Workbench};
