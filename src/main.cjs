const {app,BrowserWindow,ipcMain,dialog,shell,clipboard,Menu,protocol,net,powerMonitor}=require('electron');
const fs=require('node:fs');const path=require('node:path');const {pathToFileURL}=require('node:url');
const {Workbench}=require('./service.cjs');const {platformUrl,publicationIdentity,publicationKey,resolvePublicationUrl,parseComments,visibleReader,PLATFORMS}=require('./platforms.cjs');const {id,now,recordMetrics}=require('./store.cjs');const {toolStatus}=require('./media.cjs');
const {installPlatformNavigationGuard}=require('./platform-navigation.cjs');
const {readPlayingVideo,bounded}=require('./linked-video.cjs');
const ROOT=path.resolve(__dirname,'..');const DATA=process.env.WORKBENCH_DATA||path.join(ROOT,'data');
app.setName('自媒体工作台');app.setPath('userData',path.join(DATA,'browser-session'));app.setPath('sessionData',path.join(DATA,'browser-session'));app.setPath('logs',path.join(ROOT,'cache','logs'));app.commandLine.appendSwitch('disk-cache-dir',path.join(ROOT,'cache','browser'));
protocol.registerSchemesAsPrivileged([{scheme:'workmedia',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
let win,service,timer;const platformWindows=new Map();
const locked=app.requestSingleInstanceLock();if(!locked)app.quit();else{
 app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
 app.whenReady().then(async()=>{
  service=new Workbench(ROOT,{dataRoot:DATA});service.browserCollect=autoReadPublication;service.browserDiscover=autoDiscover;service.linkedVideoReader=readLinkedVideo;
  protocol.handle('workmedia',request=>{try{const u=new URL(request.url);const file=path.resolve(DATA,decodeURIComponent(u.pathname.slice(1)));const relative=path.relative(path.join(DATA,'media'),file);if(relative.startsWith('..')||path.isAbsolute(relative)||!fs.existsSync(file))return new Response('',{status:403});return net.fetch(pathToFileURL(file).href,{headers:request.headers});}catch{return new Response('',{status:400});}});
  win=new BrowserWindow({width:1380,height:920,minWidth:940,minHeight:660,title:'自媒体工作台',backgroundColor:'#F5F7FA',show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(e,url)=>{if(url!==pathToFileURL(path.join(ROOT,'ui','index.html')).href)e.preventDefault();});
  win.webContents.on('will-prevent-unload',event=>{const choice=dialog.showMessageBoxSync(win,{type:'question',buttons:['继续编辑','不保存关闭'],defaultId:0,cancelId:0,message:'还有未保存的修改',detail:'保存草稿和文字稿后再关闭，可以保留本次修改。'});if(choice===1)event.preventDefault();});
  Menu.setApplicationMenu(null);await win.loadFile(path.join(ROOT,'ui','index.html'));win.show();
  win.on('close',e=>{if(service.running){e.preventDefault();dialog.showMessageBox(win,{type:'info',message:'当前任务仍在运行',detail:'请等待任务完成后关闭。直接强制结束会保留素材并在下次启动提示重试。'});}});
  service.on('changed',()=>{if(!win.isDestroyed())win.webContents.send('state-changed');});
  timer=setInterval(()=>service.tick(),60000);powerMonitor.on('resume',()=>service.tick());service.tick();
 });
 app.on('window-all-closed',()=>app.quit());app.on('before-quit',()=>{clearInterval(timer);service?.close();});
}
function mediaUrl(file){if(!file)return '';const relative=path.relative(DATA,file);if(relative.startsWith('..')||path.isAbsolute(relative))return '';return 'workmedia://local/'+relative.split(path.sep).map(encodeURIComponent).join('/');}
async function openPlatform(args){const target=platformUrl(args.url);const key=args.pubId||args.accountId||target.url;let browser=platformWindows.get(key);if(browser&&!browser.isDestroyed()){browser.show();browser.focus();return;}
 browser=new BrowserWindow({width:1120,height:850,title:PLATFORMS[target.platform]+' · 自媒体工作台',webPreferences:{partition:'persist:platform-'+target.platform,contextIsolation:true,nodeIntegration:false,sandbox:true}});platformWindows.set(key,browser);
 browser.webContents.setWindowOpenHandler(({url})=>{try{if(platformUrl(url).platform===target.platform)browser.loadURL(url);}catch{}return {action:'deny'};});
 installPlatformNavigationGuard(browser.webContents,target.platform);
 browser.setMenu(Menu.buildFromTemplate([{label:'操作',submenu:[...(target.platform==='douyin'&&args.workId&&args.pubId?[{label:'读取视频并生成四平台文案',click:()=>{try{service.processLinkedVideo(args.workId,args.pubId);}catch(e){dialog.showErrorBox('视频读取未开始',e.message);}}}]:[]),{label:'读取已加载评论 / 发现作品',click:()=>readPlatform(args).catch(e=>dialog.showErrorBox('读取未完成',e.message))},{label:'刷新',click:()=>browser.reload()},{label:'关闭',click:()=>browser.close()}]}]));
 browser.on('closed',()=>platformWindows.delete(key));await browser.loadURL(target.url);
}
async function readLinkedVideo(pub,workId,progress){
 progress('正在打开抖音作品；如需登录，请本人完成后点击“操作 → 读取视频并生成四平台文案”。');
 await bounded(openPlatform({workId,pubId:pub.id,url:pub.url}),18000,'抖音页面尚未加载完成，请稍后在页面的“操作”菜单重新读取视频。');
 const browser=platformWindows.get(pub.id);if(!browser||browser.isDestroyed())throw Error('抖音窗口已关闭，请重新读取。');
 return readPlayingVideo(browser,pub,ROOT,progress);
}
async function readPlatform(args){const target=platformUrl(args.url);const key=args.pubId||args.accountId||target.url;const browser=platformWindows.get(key);if(!browser||browser.isDestroyed())throw Error('请先打开平台窗口，并加载要读取的评论。');const actual=platformUrl(browser.webContents.getURL());if(actual.platform!==target.platform)throw Error('当前页面与选择的平台不一致。');
 if(args.pubId){const expected=publicationKey(target.url),got=publicationKey(actual.url);if(!expected||expected!==got)throw Error('窗口已经切换到其他作品。请回到关联作品，或先在工作台添加新的发布链接，避免评论归错作品。');}
 if(args.accountId&&new URL(target.url).pathname.replace(/\/$/,'')!==new URL(actual.url).pathname.replace(/\/$/,''))throw Error('窗口已切换到其他页面，请先回到登记的主页再读取作品。');
 const r=await browser.webContents.executeJavaScript(visibleReader(target.platform));
 if(args.accountId){const discovered=[];let recognized=0;for(const link of r.links){try{const u=publicationIdentity(link.url);if(u.platform!==target.platform)continue;recognized++;if(service.store.state.discoveries.some(d=>(d.publicationKey||publicationKey(d.url))===u.publicationKey)||discovered.some(d=>d.publicationKey===u.publicationKey)||service.publicationOwner(u.url))continue;discovered.push({id:id(),accountId:args.accountId,...u,title:link.title,foundAt:now()});}catch{}}
  if(discovered.length){service.store.update(s=>s.discoveries.unshift(...discovered));service.changed();}if(!recognized)throw Error('当前主页没有识别到已加载的作品链接，请滚动加载作品后再试。');return {count:discovered.length,type:'discoveries'};
 }
 if(!r.comments.length)throw Error(r.commentError||'没有识别到已加载的评论。请在平台窗口展开评论、完成必要登录并滚动加载后再试；仍不可用时请导入评论文件。');
 const count=service.importComments(args.workId,args.pubId,r.comments,{platform:target.platform,url:r.url,method:'平台窗口已渲染评论',scope:'只读取当前页面已加载的评论，最多300条，非全部评论。'});
 service.store.update(s=>s.capabilities[target.platform]={...s.capabilities[target.platform],status:'窗口读取已验证',automatic:false,checkedAt:now(),detail:'读取用户已加载的评论成功；需打开平台并保持登录，不等于后台全自动采集。'});service.changed();return {count,type:'comments'};
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function autoReadPublication(pub,workId,progress){
 if(pub.platform==='x')throw Error('X 页面可能混入推荐帖子，当前不能可靠确认回复归属。请从对应帖子的回复区手动复制或导出评论后导入。');
 const args={url:pub.url,pubId:pub.id,workId};const existing=platformWindows.has(pub.id);await openPlatform(args);const browser=platformWindows.get(pub.id);if(existing)await browser.loadURL(pub.url);const rows=new Map();
 for(let round=0;round<4;round++){
  progress(`正在加载 ${PLATFORMS[pub.platform]} 评论（${round+1}/4），需要登录时请在平台窗口完成…`);await delay(round===0?3500:1800);
  if(!browser||browser.isDestroyed())throw Error('平台窗口已关闭，评论读取停止。');
  const actual=platformUrl(browser.webContents.getURL());if(actual.platform!==pub.platform||!publicationKey(pub.url)||publicationKey(actual.url)!==publicationKey(pub.url))throw Error('平台跳转到了登录页或其他作品，请完成登录后回到作品并重新读取。');
  const r=await browser.webContents.executeJavaScript(visibleReader(pub.platform));for(const c of r.comments)rows.set(c.externalId||c.author+'|'+c.text,c);
  if(round===3||rows.size>=200)break;
  await browser.webContents.executeJavaScript(`(()=>{const selectors=['[data-e2e="comment-list"]','.comments-container','.comment-list','.note-scroller'];const target=selectors.map(s=>document.querySelector(s)).find(e=>e&&e.scrollHeight>e.clientHeight+20)||document.scrollingElement;target?.scrollBy({top:650,behavior:'instant'});})()`);
 }
 if(!rows.size)throw Error('没有读到评论。可能尚未登录、评论未展开、平台要求验证或页面结构变化。请在平台窗口完成必要操作，再点击“读取已加载评论”；也可导入评论文件。');
 return {comments:[...rows.values()],metrics:null,commentError:null,scope:'应用打开作品页并进行了最多4次有限读取，只包含本次已加载、可解析的评论，非全部评论；未获取后台指标。',source:{platform:pub.platform,url:pub.url,method:'已登录平台页面自动读取',at:now()}};
}
async function autoDiscover(account){const existed=platformWindows.has(account.id);await openPlatform({url:account.url,accountId:account.id});if(existed)await platformWindows.get(account.id).loadURL(account.url);await delay(3000);return readPlatform({url:account.url,accountId:account.id});}
const actions={
 state:()=>({state:service.snapshot(),paths:{root:ROOT,data:DATA},tools:toolStatus()}),
 media:args=>mediaUrl(args.path),
 importVideo:async()=>{const result=await dialog.showOpenDialog(win,{title:'选择你拍摄的视频',properties:['openFile'],filters:[{name:'视频',extensions:['mp4','mov','mkv','webm','avi','m4v']}]});if(result.canceled)return null;const w=await service.importVideo(result.filePaths[0]);service.processVideo(w.id);return w.id;},
 attachVideo:async args=>{service.store.getWork(args.workId);const result=await dialog.showOpenDialog(win,{title:'为这个已发布作品补入原视频',properties:['openFile'],filters:[{name:'视频',extensions:['mp4','mov','mkv','webm','avi','m4v']}]});if(result.canceled)return null;const w=await service.importVideo(result.filePaths[0],{existingWorkId:args.workId});service.processVideo(w.id);return w.id;},
 registerPublished:args=>service.registerPublished(args.url,{title:args.title,publishedAt:args.publishedAt}),
 processVideo:args=>service.processVideo(args.workId),
 processLinkedVideo:args=>service.processLinkedVideo(args.workId,args.pubId),
 checkAi:()=>service.checkAi(),
 saveSettings:args=>service.settings(args),
 editDraft:args=>{service.store.editDraft(args.workId,args.draftId,args.text);service.changed();return true;},
 editPlan:args=>{service.store.editPlan(args.planId,args.script,args.candidateIndex);service.changed();return true;},
 editTranscript:args=>{if(typeof args.text!=='string'||args.text.length>500000)throw Error('文字稿过长。');service.store.update(()=>{const w=service.store.getWork(args.workId);if(!w.media)throw Error('请先识别视频。');w.transcriptHistory=w.transcriptHistory||[];w.transcriptHistory.push({...w.media.transcript,editedAt:now()});w.media.transcript={...w.media.transcript,text:args.text,source:'用户校对后的文字稿'};});service.changed();},
 rename:args=>{if(!args.title?.trim())throw Error('请输入作品名称。');service.store.update(()=>Object.assign(service.store.getWork(args.workId),{title:args.title.trim().slice(0,200),titleSource:'manual'}));service.changed();},
 addPublication:async args=>{const parsed=await resolvePublicationUrl(args.url);return service.addPublication(args.workId,parsed.url,args.publishedAt);},
 collect:args=>service.collectJob(args.workId,args.pubId),
 openPlatform,
 readPlatform,
 addAccount:args=>{const u=platformUrl(args.url);service.store.update(s=>{if(s.accounts.some(a=>a.url===u.url))throw Error('主页已登记。');s.accounts.push({id:id(),...u,name:String(args.name||PLATFORMS[u.platform]).slice(0,100),createdAt:now()});});service.changed();},
 linkDiscovery:async args=>{const d=service.store.state.discoveries.find(d=>d.id===args.discoveryId);if(!d)throw Error('发现记录不存在。');let workId=args.workId;if(workId==='__new__'){const r=await service.registerPublished(d.url,{title:d.title});workId=r.workId;}else service.addPublication(workId,d.url);service.store.update(()=>d.linkedWorkId=workId);service.changed();return {workId};},
 importComments:async args=>{let text=args.text||'',extension='txt';if(args.file){const r=await dialog.showOpenDialog(win,{title:'导入评论（CSV / JSON / TXT）',properties:['openFile'],filters:[{name:'评论文件',extensions:['csv','tsv','json','txt']}]});if(r.canceled)return null;const file=r.filePaths[0];if(fs.statSync(file).size>10*1024**2)throw Error('评论文件超过10MB，请分批导入。');text=fs.readFileSync(file,'utf8');extension=path.extname(file).slice(1);}
  return service.importComments(args.workId,args.pubId,parseComments(text,extension),{platform:args.platform,url:args.url||'',note:args.note||'',method:'用户手动导入',scope:'用户提供的评论样本，非全量数据。'});},
 saveMetrics:args=>{const allowed=['plays','likes','comments','favorites','shares','coins','completionRate'];const values={};for(const k of allowed){const v=args.metrics?.[k];if(v===''||v===null||v===undefined)values[k]=null;else{const n=Number(v);if(!Number.isFinite(n)||n<0||(k==='completionRate'&&n>100))throw Error('指标必须为非负数，完播率范围0–100，未知请留空。');values[k]=n;}}service.store.update(()=>{const p=service.store.getWork(args.workId).publications.find(p=>p.id===args.pubId);if(!p)throw Error('发布记录不存在。');recordMetrics(p,values,{method:'用户从创作者后台手动录入',note:String(args.note||''),at:now()});});service.changed();},
 generatePlan:args=>service.generatePlan({includeDemo:!!args.includeDemo,force:!!args.force}),
 generateShootingPlan:args=>service.generateShootingPlan({planId:args.planId,index:args.index,force:!!args.force}),
 feedback:args=>service.feedback(args.planId,args.status,args.index??null),
 copy:args=>{clipboard.writeText(String(args.text||''));return true;},
 export:async args=>{const text=args.workId?service.exportWork(args.workId):service.exportPlan(args.planId,args.candidateIndex);const output=path.join(ROOT,'输出');fs.mkdirSync(output,{recursive:true});const r=await dialog.showSaveDialog(win,{title:'导出文字内容',defaultPath:path.join(output,'自媒体文案-'+Date.now()+'.md'),filters:[{name:'文字文档',extensions:['md','txt']}]});if(r.canceled)return null;fs.writeFileSync(r.filePath,text);return r.filePath;},
 backup:async()=>{const output=path.join(ROOT,'备份');fs.mkdirSync(output,{recursive:true});const r=await dialog.showOpenDialog(win,{title:'选择备份存放文件夹',defaultPath:output,properties:['openDirectory','createDirectory']});if(r.canceled)return null;const dest=path.resolve(r.filePaths[0]);if(dest===DATA||dest.startsWith(DATA+path.sep))throw Error('备份文件夹不能放在作品数据内部。');return service.backup(dest);},
 openData:()=>shell.openPath(DATA),
 openGuide:()=>shell.openPath(path.join(ROOT,'使用说明.md'))
};
ipcMain.handle('workbench',async(event,action,args={})=>{if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)return {ok:false,error:'访问未授权。'};try{if(!Object.hasOwn(actions,action))throw Error('未知操作。');return {ok:true,value:await actions[action](args)};}catch(e){return {ok:false,error:String(e.message).slice(0,1600)};}});
