const fs=require('node:fs');const path=require('node:path');const {execFileSync}=require('node:child_process');
const {FFMPEG,FFPROBE,run}=require('../src/media.cjs');
const cache=path.resolve(__dirname,'..','cache');
function temp(prefix='test-'){fs.mkdirSync(cache,{recursive:true});return fs.mkdtempSync(path.join(cache,prefix));}
function placeholderVideo(){const file=path.join(temp('import-fixture-'),'video.mp4');fs.writeFileSync(file,'Synthetic import fixture; media decoding is mocked in this test.');return file;}
function mediaAvailable(){try{for(const executable of [FFMPEG,FFPROBE])execFileSync(executable,['-version'],{windowsHide:true,stdio:'ignore',timeout:10000});return true;}catch{return false;}}
function skipWithoutMedia(t){if(mediaAvailable())return false;t.skip('需要本地 FFmpeg 与 FFprobe；其余测试无需媒体工具。可设置 WORKBENCH_FFMPEG / WORKBENCH_FFPROBE。');return true;}
async function syntheticVideo({audio=true}={}){
 const file=path.join(temp('synthetic-media-'),audio?'color-tone.mp4':'silent.mp4');
 const args=['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=blue:s=160x120:r=10:d=2'];
 if(audio)args.push('-f','lavfi','-i','sine=frequency=440:sample_rate=16000:duration=2');
 args.push('-c:v','mpeg4','-q:v','5','-pix_fmt','yuv420p');
 if(audio)args.push('-c:a','aac','-shortest');else args.push('-an');
 args.push(file);await run(FFMPEG,args,{timeout:20000});return file;
}
module.exports={temp,placeholderVideo,skipWithoutMedia,syntheticVideo};
