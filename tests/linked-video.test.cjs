const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {EventEmitter}=require('node:events');
const {mediaAddress,selectPlayer,playerSnapshot,downloadVideo,readPlayingVideo}=require('../src/linked-video.cjs');
const {Workbench}=require('../src/service.cjs');const {JSDOM}=require('jsdom');
const {run,FFPROBE,prepare}=require('../src/media.cjs');
const root=path.resolve(__dirname,'..');const {temp,placeholderVideo,skipWithoutMedia,syntheticVideo}=require('./support.cjs');
const pub={url:'https://www.douyin.com/video/9000000000000000001',platform:'douyin'};
const player={src:'https://v1.douyinvod.com/test.mp4?signature=PRIVATE',duration:14,width:1080,height:1920,readyState:4};
const snapshot=()=>({url:pub.url,title:'测试标题 - 抖音',players:[{...player}]});
const videoResponse=(bytes='local video bytes')=>new Response(bytes,{status:200,headers:{'content-type':'video/mp4'}});

test('只接受同一作品中唯一、已加载的视频；分段播放和不安全来源明确停止',()=>{
 assert.equal(selectPlayer(snapshot(),pub).duration,14);
 for(const bad of [{...snapshot(),url:'https://www.douyin.com/video/999'},{...snapshot(),players:[]},{...snapshot(),players:[player,player]},{...snapshot(),players:[{...player,src:'blob:https://www.douyin.com/example'}]},{...snapshot(),players:[{...player,duration:Infinity}]},{...snapshot(),players:[{...player,width:0}]}])assert.throws(()=>selectPlayer(bad,pub));
 for(const url of ['http://v1.douyinvod.com/a','file:///E:/private','https://127.0.0.1/a','https://douyinvod.com.evil.example/a','https://user:password@douyinvod.com/a','https://douyinvod.com:999/a'])assert.throws(()=>mediaAddress(url));
});

test('可见播放器读取排除屏幕外推荐与遮挡，播放器内控件不影响读取',()=>{
 const dom=new JSDOM('<div><video id="main"></video><span id="controls"></span></div><div><video id="recommendation"></video></div><div id="login"></div>',{url:pub.url,runScripts:'outside-only'}),w=dom.window;
 const main=w.document.getElementById('main'),other=w.document.getElementById('recommendation');
 main.getBoundingClientRect=()=>({left:0,top:0,right:400,bottom:600});other.getBoundingClientRect=()=>({left:0,top:2000,right:400,bottom:2600});
 for(const [key,value] of Object.entries({currentSrc:player.src,duration:14,videoWidth:1080,videoHeight:1920,readyState:4}))Object.defineProperty(main,key,{value});
 w.document.elementFromPoint=()=>w.document.getElementById('controls');assert.equal(w.eval(playerSnapshot()).players.length,1);
 w.document.elementFromPoint=()=>w.document.getElementById('login');assert.equal(w.eval(playerSnapshot()).players.length,0);dom.window.close();
});

test('逐跳校验下载，拒绝部分文件、非视频和超限；失败清理且不覆盖旧文件',async()=>{
 const dir=temp(),file=path.join(dir,'download.mp4');let calls=[];
 const result=await downloadVideo(player.src,file,{request:async(url,options)=>{calls.push({url,redirect:options.redirect});return calls.length===1?new Response(null,{status:302,headers:{location:'https://v2.douyinvod.com/video.mp4'}}):videoResponse();}});
 assert.equal(result.bytes,17);assert.equal(calls.length,2);assert.ok(calls.every(x=>x.redirect==='manual'));assert.equal(fs.readFileSync(file,'utf8'),'local video bytes');
 await assert.rejects(downloadVideo(player.src,file,{request:async()=>videoResponse('replace')}));assert.equal(fs.readFileSync(file,'utf8'),'local video bytes');
 for(const [name,response,options] of [
  ['redirect',()=>new Response(null,{status:302,headers:{location:'https://127.0.0.1/private'}}),{}],
  ['partial',()=>new Response('partial',{status:206,headers:{'content-type':'video/mp4'}}),{}],
  ['login',()=>new Response('<html>login</html>',{headers:{'content-type':'text/html'}}),{}],
  ['large',()=>videoResponse('too large'),{maxBytes:3}],
  ['truncated',()=>new Response('short',{headers:{'content-type':'video/mp4','content-length':'99'}}),{}]
 ]){let count=0;const target=path.join(dir,name+'.mp4');await assert.rejects(downloadVideo(player.src,target,{request:async()=>{count++;return response();},...options}));assert.equal(count,1);assert.equal(fs.existsSync(target),false);}
 const target=path.join(dir,'error.mp4');await assert.rejects(downloadVideo(player.src,target,{request:async()=>{throw Error('request failed '+player.src);}}),error=>!error.message.includes('PRIVATE'));
});

test('读取前后核对作品和视频时长；不把无音轨流当作完整素材',async()=>{
 function browser(snapshots){const browser=new EventEmitter();let index=0;browser.isDestroyed=()=>false;browser.webContents={getURL:()=>pub.url,executeJavaScript:async()=>snapshots[Math.min(index++,snapshots.length-1)],session:{fetch:async()=>videoResponse(Buffer.from([0,0,0,24,102,116,121,112,105,115,111,109]))}};return browser;}
 const good=()=>({format:{duration:'14'},streams:[{codec_type:'video'},{codec_type:'audio'}]});
 const result=await readPlayingVideo(browser([snapshot()]),pub,root,()=>{},{probe:async()=>good(),waitMs:0});assert.equal(fs.existsSync(result.file),true);assert.equal(result.title,'测试标题');assert.ok(!JSON.stringify(result.source).includes('PRIVATE'));await result.cleanup();assert.equal(fs.existsSync(result.file),false);
 await assert.rejects(readPlayingVideo(browser([snapshot(),{...snapshot(),url:'https://www.douyin.com/video/999'}]),pub,root,()=>{},{probe:async()=>good(),waitMs:0}),/其他作品/);
 await assert.rejects(readPlayingVideo(browser([snapshot()]),pub,root,()=>{},{probe:async()=>({...good(),format:{duration:'3'}}),waitMs:0}),/时长/);
 await assert.rejects(readPlayingVideo(browser([snapshot()]),pub,root,()=>{},{probe:async()=>({...good(),streams:[{codec_type:'video'}]}),waitMs:0}),/只有画面/);
 const closing=browser([snapshot()]);await assert.rejects(readPlayingVideo(closing,pub,root,()=>{},{probe:async()=>{closing.emit('closed');return good();},waitMs:0}),/关闭/);
 const manifest=browser([snapshot()]);manifest.webContents.session.fetch=async()=>videoResponse('#EXTM3U\nhttps://private.invalid/video');let probes=0;await assert.rejects(readPlayingVideo(manifest,pub,root,()=>{},{probe:async()=>{probes++;return good();},waitMs:0}),/不是支持的完整视频/);assert.equal(probes,0);
});

test('隔离素材与AI替身验证链接视频到四平台草稿，失败不调用AI且保留记录',async()=>{
 let calls=0,reads=0,prepared=0,cleaned=0;
 const app=new Workbench(root,{dataRoot:temp(),prepareVideo:async(_root,work)=>{prepared++;assert.ok(fs.existsSync(work.videoPath));return {duration:14,frames:[],transcript:{text:'已获取视频的真实测试转写',source:'隔离测试'},sampling:'隔离测试'};},ai:{async generate(prompt){calls++;assert.match(prompt,/真实测试转写/);return {data:{summary:'测试摘要',points:[],uncertainties:[],visualNotes:[],drafts:{douyin:'抖音稿',bilibili:'B站稿',xiaohongshu:'小红书稿',x:'X稿'}},receipt:{status:'completed'}};},close(){}}});
 const registered=await app.registerPublished(pub.url,{title:'保留用户标题'}),work=app.store.getWork(registered.workId);
 app.importComments(work.id,registered.pubId,[{text:'保留已有评论'}],{platform:'douyin',url:pub.url,method:'测试'});
 app.linkedVideoReader=async()=>{reads++;throw Error('平台需要登录');};app.processLinkedVideo(work.id);await app.chain;assert.equal(calls,0);assert.equal(work.videoPath,undefined);assert.equal(work.drafts.length,0);assert.equal(app.store.state.jobs[0].status,'failed');
 app.linkedVideoReader=async()=>{reads++;return {file:placeholderVideo(),title:'页面名称',source:{url:pub.url},cleanup:async()=>{cleaned++;}};};
 app.processLinkedVideo(work.id);assert.throws(()=>app.processLinkedVideo(work.id),/已在处理/);await app.chain;
 assert.equal(calls,1);assert.equal(prepared,1);assert.equal(cleaned,1);assert.equal(work.title,'保留用户标题');assert.equal(work.drafts.length,4);assert.equal(app.store.state.comments.length,1);assert.equal(work.publications.length,1);assert.equal(app.store.state.jobs[0].status,'completed');
 app.processLinkedVideo(work.id);await app.chain;assert.equal(reads,2);assert.equal(calls,2);assert.equal(prepared,1);assert.equal(work.drafts.length,8);
});

test('合成MP4通过文件检测、复制和画面提取，不访问平台或模型',async t=>{
 if(skipWithoutMedia(t))return;
 const source=await syntheticVideo();const metadata=JSON.parse(await run(FFPROBE,['-v','error','-show_format','-of','json',source]));
 const browser=new EventEmitter();browser.isDestroyed=()=>false;browser.webContents={getURL:()=>pub.url,executeJavaScript:async()=>({...snapshot(),players:[{...player,duration:Number(metadata.format.duration)}]}),session:{fetch:async()=>videoResponse(fs.readFileSync(source))}};
 const result=await readPlayingVideo(browser,pub,root,()=>{},{waitMs:0});const dir=temp(),videoPath=path.join(dir,'video.mp4'),subtitlePath=path.join(dir,'transcript.txt');fs.copyFileSync(result.file,videoPath);fs.writeFileSync(subtitlePath,'隔离测试字幕，验证媒体处理链路，与合成音调没有语义关系。');await result.cleanup();
 const media=await prepare(root,{videoPath,subtitlePath,mediaOrigin:result.source},()=>{});assert.equal(media.hasAudio,true);assert.ok(media.frames.length>=3);assert.equal(media.transcript.text,fs.readFileSync(subtitlePath,'utf8'));assert.ok(Math.abs(media.duration-Number(metadata.format.duration))<0.5);
});
