const fs=require('node:fs');const path=require('node:path');const {spawn}=require('node:child_process');
const {resolveRuntimePaths,runtimeStatus,fileExists,directoryExists}=require('./runtime-paths.cjs');
const runtime=resolveRuntimePaths();const FFMPEG=runtime.ffmpeg,FFPROBE=runtime.ffprobe,PYTHON=runtime.python,MODEL=runtime.whisperModel;
function run(exe,args,{timeout=1800000,onLine=()=>{},env={}}={}){if(!exe)return Promise.reject(Error('未配置本地处理程序，请按 README 设置视频或语音工具路径后重启。'));return new Promise((resolve,reject)=>{const p=spawn(exe,args,{windowsHide:true,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});let out='',err='';const timer=setTimeout(()=>{p.kill();reject(Error('本地视频处理超过时限，任务已停止。'));},timeout);p.stdout.setEncoding('utf8');p.stderr.setEncoding('utf8');p.stdout.on('data',c=>{out+=c;onLine(c);});p.stderr.on('data',c=>{err=(err+c).slice(-6000);});p.on('error',e=>{clearTimeout(timer);reject(Error('本地处理工具无法启动：'+e.message));});p.on('close',code=>{clearTimeout(timer);code===0?resolve(out):reject(Error('本地视频处理失败：'+err.slice(-1800)));});});}
async function prepare(root,work,onProgress){
 if(!fileExists(FFMPEG)||!fileExists(FFPROBE))throw Error('缺少 FFmpeg 或 ffprobe（本地视频处理工具）。请按 README 配置 runtime-config.json，或设置 WORKBENCH_FFMPEG 和 WORKBENCH_FFPROBE 后重启。');
 const folder=path.dirname(work.videoPath);const inputOptions=work.mediaOrigin?['-protocol_whitelist','file,pipe']:[];const meta=JSON.parse(await run(FFPROBE,['-v','error',...inputOptions,'-show_format','-show_streams','-of','json',work.videoPath]));
 const duration=Number(meta.format?.duration);if(!Number.isFinite(duration)||duration<=0)throw Error('无法读取视频时长，请确认文件可以正常播放。');
 if(duration>7200)throw Error('当前版本支持 2 小时以内的视频，请先分段。');
 const frames=[];const n=Math.min(12,Math.max(3,Math.ceil(duration/8)));
 for(let i=0;i<n;i++){const time=Number(((i+.5)*duration/n).toFixed(3));const file=path.join(folder,`frame-${i+1}.jpg`);await run(FFMPEG,['-hide_banner','-loglevel','error','-y','-ss',String(time),...inputOptions,'-i',work.videoPath,'-frames:v','1','-vf','scale=960:-2',file]);if(fs.existsSync(file))frames.push({path:file,time});onProgress(`正在提取关键画面 ${i+1}/${n}`);}
 const hasAudio=meta.streams?.some(s=>s.codec_type==='audio');let transcript={segments:[],text:'',language:null,source:'无音轨'};
 if(work.subtitlePath&&fs.existsSync(work.subtitlePath)){
   const raw=fs.readFileSync(work.subtitlePath,'utf8').replace(/^\uFEFF/,'');transcript={segments:[],text:raw,language:null,source:'导入字幕（未经逐句校对）'};
 }else if(hasAudio){
   if(!fileExists(PYTHON))throw Error('自动识别语音需要 Python 和 faster-whisper。请配置 WORKBENCH_PYTHON 或 runtime-config.json 的 python；也可以导入同名字幕后重试。');
   if(!directoryExists(MODEL))throw Error('本地语音模型文件夹不存在。请配置 WORKBENCH_WHISPER_MODEL 或 runtime-config.json 的 whisperModel。程序不会自动下载模型，也可以导入同名字幕。');
   fs.mkdirSync(path.join(root,'cache'),{recursive:true});
   const audio=path.join(folder,'audio.wav');onProgress('正在提取音频…');await run(FFMPEG,['-hide_banner','-loglevel','error','-y',...inputOptions,'-i',work.videoPath,'-vn','-ac','1','-ar','16000',audio]);
   const output=path.join(folder,'transcript.json');onProgress('正在本地识别语音，第一次加载模型可能较慢…');
   await run(PYTHON,[path.join(root,'scripts','transcribe.py'),audio,output,MODEL],{onLine:c=>{for(const line of c.split(/\r?\n/)){try{const p=JSON.parse(line);if(p.progress)onProgress(p.progress);}catch{}}},env:{HF_HOME:path.join(root,'cache','huggingface'),XDG_CACHE_HOME:path.join(root,'cache'),TEMP:path.join(root,'cache'),TMP:path.join(root,'cache'),PYTHONUTF8:'1'}});
   transcript=JSON.parse(fs.readFileSync(output,'utf8'));
 }
 fs.writeFileSync(path.join(folder,'文字稿.txt'),transcript.text,'utf8');
 return {duration,hasAudio,frames,transcript,sampling:`均匀采样 ${frames.length} 张关键画面，未逐帧检查；识别结果需要人工核对。`};
}
module.exports={prepare,run,FFMPEG,FFPROBE,PYTHON,MODEL,toolStatus:()=>runtimeStatus(runtime)};
