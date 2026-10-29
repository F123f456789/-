const fs=require('node:fs/promises');
const path=require('node:path');
const {publicationIdentity,publicationKey}=require('./platforms.cjs');
const {FFPROBE,run}=require('./media.cjs');

const VIDEO_HOSTS=['douyinvod.com','douyin.com','amemv.com','bytecdn.cn','bytedance.com'];
function mediaAddress(raw){
 let url;try{url=new URL(raw);}catch{throw Error('没有取得可读取的视频地址，请播放视频后重试，或补入原视频。');}
 if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||!VIDEO_HOSTS.some(host=>url.hostname===host||url.hostname.endsWith('.'+host)))throw Error('这条视频没有提供支持的安全播放地址，请补入原视频后生成文案。');
 return url.href;
}

// Read only the rendered player. Never inspect cookies, storage, or account state.
function playerSnapshot(){
 return `(()=>{const players=[...document.querySelectorAll('video')].filter(v=>{const r=v.getBoundingClientRect(),style=getComputedStyle(v);if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;const x1=Math.max(0,r.left),y1=Math.max(0,r.top),x2=Math.min(innerWidth,r.right),y2=Math.min(innerHeight,r.bottom);if(x2-x1<80||y2-y1<80)return false;const hit=document.elementFromPoint((x1+x2)/2,(y1+y2)/2),parent=v.parentElement;return hit===v||v.contains(hit)||(parent&&parent!==document.body&&parent.querySelectorAll('video').length===1&&parent.contains(hit));});return {url:location.href,title:document.title,players:players.map(v=>({src:v.currentSrc||v.src,duration:v.duration,width:v.videoWidth,height:v.videoHeight,readyState:v.readyState}))};})()`;
}
function selectPlayer(snapshot,pub){
 const expected=publicationIdentity(pub.url);
 if(expected.platform!=='douyin'||publicationKey(snapshot?.url)!==expected.publicationKey)throw Error('窗口已切换到登录页或其他作品，请回到这条作品后重新读取视频。');
 if(!Array.isArray(snapshot.players)||snapshot.players.length!==1)throw Error('尚未找到唯一可见的视频。请完成网页登录、关闭遮挡窗口并播放这条视频，再点击“读取视频并生成文案”；也可以补入原视频。');
 const player=snapshot.players[0];
 if(!Number.isFinite(player.duration)||player.duration<=0||player.width<=0||player.height<=0||player.readyState<1)throw Error('视频尚未加载完成，请先播放，再重新读取。');
 if(player.duration>7200)throw Error('当前支持两小时以内的视频，请分段后导入。');
 if(String(player.src).startsWith('blob:'))throw Error('该播放器使用分段播放，当前无法直接取得完整视频。请保存这条视频到电脑，再点击“补入原视频”生成文案。');
 return {url:mediaAddress(player.src),duration:player.duration,title:String(snapshot.title||'').slice(0,200)};
}

async function downloadVideo(raw,file,{request=fetch,maxBytes=500*1024*1024,timeout=90000,onProgress=()=>{},signal}={}){
 let current=mediaAddress(raw),response;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();
 let handle,created=false;
 try{
  for(let hop=0;hop<5;hop++){
   response=await request(current,{redirect:'manual',signal:controller.signal,headers:{Referer:'https://www.douyin.com/'}});
   if([301,302,303,307,308].includes(response.status)){
    const location=response.headers.get('location');await response.body?.cancel();response=null;
    if(!location)throw Error('视频地址跳转不完整，请重新打开作品。');
    current=mediaAddress(new URL(location,current).href);continue;
   }
   break;
  }
  if(!response||[301,302,303,307,308].includes(response.status))throw Error('视频地址跳转次数过多，请补入原视频。');
  // A partial range must not be mistaken for the complete video.
  if(response.status!==200)throw Error('平台没有返回完整视频，请确认可以正常播放，或补入原视频。');
  const type=(response.headers.get('content-type')||'').toLowerCase();
  if(!/^(video\/|application\/octet-stream)/.test(type))throw Error('平台返回的不是视频文件，可能需要登录或验证。');
  const expected=Number(response.headers.get('content-length'));
  if(expected>maxBytes)throw Error('视频超过500MB，请使用本地视频导入。');
  if(!response.body)throw Error('平台没有返回视频内容。');
  handle=await fs.open(file,'wx');created=true;let size=0;
  for await(const chunk of response.body){
   if(controller.signal.aborted)throw Error('读取视频已停止。');
   size+=chunk.byteLength;if(size>maxBytes)throw Error('视频超过500MB，请使用本地视频导入。');
   await handle.writeFile(chunk);onProgress(size);
  }
  if(!size||(expected>0&&size!==expected))throw Error('视频下载不完整，请重试。');
  await handle.close();handle=null;
  return {bytes:size,host:new URL(current).hostname};
 }catch(error){
  if(handle)await handle.close();if(created)await fs.unlink(file).catch(()=>{});
  // Network errors may contain a signed playback URL; do not expose those URLs.
  if(controller.signal.aborted)throw Error(signal?.aborted?'视频窗口已关闭，读取已停止。':'读取视频超时，请确认网络后重试，或补入原视频。');
  if(error.message?.startsWith('视频')||error.message?.startsWith('平台')||error.message?.startsWith('这条'))throw error;
  throw Error('没有取得完整视频，请确认作品可正常播放后重试，或补入原视频。');
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(response?.body&&!response.bodyUsed)await response.body.cancel().catch(()=>{});}
}

async function bounded(promise,ms,message){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms);})]);}finally{clearTimeout(timer);}}
async function readPlayingVideo(browser,pub,root,progress=()=>{},{probe=async file=>JSON.parse(await run(FFPROBE,['-v','error','-protocol_whitelist','file,pipe','-show_format','-show_streams','-of','json',file],{timeout:20000})),waitMs=12000}={}){
 const controller=new AbortController();const closed=()=>controller.abort();browser.once('closed',closed);
 let folder;
 const snapshot=async()=>{
  if(browser.isDestroyed()||controller.signal.aborted)throw Error('视频窗口已关闭，读取已停止。');
  if(publicationKey(browser.webContents.getURL())!==publicationKey(pub.url))throw Error('窗口已切换到登录页或其他作品，请回到这条作品后重新读取视频。');
  const result=await bounded(browser.webContents.executeJavaScript(playerSnapshot()),8000,'读取页面超时，请等待视频加载后重新读取。');
  if(browser.isDestroyed()||publicationKey(browser.webContents.getURL())!==publicationKey(pub.url))throw Error('读取过程中页面发生变化，请回到这条作品重试。');
  return selectPlayer(result,pub);
 };
 try{
  progress('正在读取这条作品的视频；如出现登录提示，请本人完成后重新点击读取。');
  const deadline=Date.now()+waitMs;let player,lastError;
  do{try{player=await snapshot();break;}catch(error){lastError=error;if(controller.signal.aborted)throw error;}if(Date.now()>=deadline)break;await new Promise(resolve=>setTimeout(resolve,500));}while(Date.now()<deadline);
  if(!player)throw lastError;
  folder=await fs.mkdtemp(path.join(root,'cache','linked-video-'));const file=path.join(folder,'video.mp4');
  progress('已找到实际视频，正在保存到 E 盘…');
  const receipt=await downloadVideo(player.url,file,{request:(url,options)=>browser.webContents.session.fetch(url,options),signal:controller.signal});
  const after=await snapshot();if(after.url!==player.url||Math.abs(after.duration-player.duration)>0.5)throw Error('读取时播放器切换了视频，本次结果未导入，请回到目标作品重试。');
  const handle=await fs.open(file,'r');const header=Buffer.alloc(12);try{await handle.read(header,0,12,0);}finally{await handle.close();}
  if(header.toString('ascii',4,8)!=='ftyp')throw Error('取得的内容不是支持的完整视频文件，请补入原视频。');
  let metadata;try{metadata=await probe(file);}catch{throw Error('取得的文件无法完整读取，请补入原视频。');}
  const duration=Number(metadata.format?.duration);
  if(!metadata.streams?.some(s=>s.codec_type==='video')||!Number.isFinite(duration)||Math.abs(duration-player.duration)>Math.max(0.5,player.duration*0.01))throw Error('读取到的视频时长与页面不一致，可能只是片段，本次未生成文案。请补入完整原视频。');
  if(!metadata.streams.some(s=>s.codec_type==='audio'))throw Error('这个播放地址只有画面，无法确认完整语音。请补入原视频，避免漏掉口播。');
  const final=await snapshot();if(final.url!==player.url||Math.abs(final.duration-player.duration)>0.5)throw Error('读取过程中视频发生变化，本次结果未导入，请重新读取。');
  const cleanup=async()=>{await fs.unlink(file);await fs.rmdir(folder);};
  return {file,title:player.title.replace(/\s*[-|]\s*抖音\s*$/,''),source:{platform:'douyin',url:pub.url,method:'平台窗口可见播放器',at:new Date().toISOString(),bytes:receipt.bytes,mediaHost:receipt.host,duration},cleanup};
 }catch(error){if(folder){await fs.unlink(path.join(folder,'video.mp4')).catch(()=>{});await fs.rmdir(folder).catch(()=>{});}throw error;
 }finally{browser.removeListener('closed',closed);}
}

module.exports={mediaAddress,playerSnapshot,selectPlayer,downloadVideo,readPlayingVideo,bounded};
