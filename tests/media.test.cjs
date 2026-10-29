const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {prepare,run,FFMPEG}=require('../src/media.cjs');
const root=path.resolve(__dirname,'..');const {temp,skipWithoutMedia,syntheticVideo}=require('./support.cjs');
test('合成本地视频：无音轨不编造文字，旁挂字幕优先读取',async t=>{
 if(skipWithoutMedia(t))return;
 const dir=temp('media-test-');const video=await syntheticVideo({audio:false});
 const silent=await prepare(root,{videoPath:video},()=>{});assert.equal(silent.hasAudio,false);assert.equal(silent.transcript.text,'');assert.equal(silent.transcript.source,'无音轨');assert.equal(silent.frames.length,3);
 const subtitles=path.join(dir,'字幕.srt');const expected='1\n00:00:00,000 --> 00:00:01,500\n测试字幕必须保持原样\n';fs.writeFileSync(subtitles,expected);const withSubs=await prepare(root,{videoPath:video,subtitlePath:subtitles},()=>{});assert.equal(withSubs.transcript.text,expected);assert.match(withSubs.transcript.source,/导入字幕/);
});
