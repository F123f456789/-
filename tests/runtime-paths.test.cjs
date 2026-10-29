const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {resolveRuntimePaths,runtimeStatus}=require('../src/runtime-paths.cjs');
const cache=path.resolve(__dirname,'..','cache');fs.mkdirSync(cache,{recursive:true});
function fixture(){const root=fs.mkdtempSync(path.join(cache,'runtime-paths-'));return {root,env:{PATH:''}};}
function file(root,name){const value=path.join(root,name);fs.mkdirSync(path.dirname(value),{recursive:true});fs.writeFileSync(value,'test fixture',{mode:0o755});return value;}
function config(root,value){fs.writeFileSync(path.join(root,'runtime-config.json'),JSON.stringify(value));}
test('环境变量优先于本地配置；相对路径基于项目根，缺失显式路径不暗中回退',()=>{
 const {root,env}=fixture();const onPath=file(root,'bin/ffmpeg.exe');config(root,{ffmpeg:'configured/ffmpeg.exe',python:'python/python.exe',whisperModel:'models/custom'});
 const result=resolveRuntimePaths({root,env:{...env,PATH:path.dirname(onPath),WORKBENCH_FFMPEG:'explicit/missing.exe',WORKBENCH_WHISPER_MODEL:'models/env'},platform:'win32'});
 assert.equal(result.ffmpeg,path.join(root,'explicit/missing.exe'));assert.equal(result.python,path.join(root,'python/python.exe'));assert.equal(result.whisperModel,path.join(root,'models/env'));assert.equal(runtimeStatus(result).video,false);
});
test('无配置时从 PATH 发现程序，ffprobe 优先与 ffmpeg 同目录，模型仅本地目录',()=>{
 const {root,env}=fixture();const suffix=process.platform==='win32'?'.exe':'';const ffmpeg=file(root,'tools/ffmpeg'+suffix),ffprobe=file(root,'tools/ffprobe'+suffix),python=file(root,'python/'+(process.platform==='win32'?'python.exe':'python3'));
 const result=resolveRuntimePaths({root,env:{...env,PATH:[path.dirname(ffmpeg),path.dirname(python)].join(path.delimiter)}});
 assert.equal(result.ffmpeg,ffmpeg);assert.equal(result.ffprobe,ffprobe);assert.equal(result.python,python);assert.equal(result.whisperModel,path.join(root,'models','faster-whisper'));assert.deepEqual(runtimeStatus(result),{video:true,speech:false});
 fs.mkdirSync(result.whisperModel,{recursive:true});assert.deepEqual(runtimeStatus(result),{video:true,speech:true});
});
test('ffprobe 可独立覆盖，配置命令名支持 PATH；坏 JSON 和非字符串有明确错误',()=>{
 const {root,env}=fixture();const python=file(root,'tools/python.exe'),customProbe=file(root,'different/probe.exe');
 config(root,{python:'python',ffprobe:customProbe});const result=resolveRuntimePaths({root,env:{...env,PATH:path.dirname(python)},platform:'win32'});
 assert.equal(result.python,python);assert.equal(result.ffprobe,customProbe);
 config(root,{python:7});assert.throws(()=>resolveRuntimePaths({root,env}),/python.*非空路径/);
 fs.writeFileSync(path.join(root,'runtime-config.json'),'{');assert.throws(()=>resolveRuntimePaths({root,env}),/格式有误/);
});
test('模型路径不能被在线模型名称或普通文件当作已安装目录',()=>{
 const {root,env}=fixture();const model=file(root,'not-a-model');config(root,{whisperModel:model});const paths=resolveRuntimePaths({root,env});assert.equal(runtimeStatus({...paths,python:file(root,'python.exe')}).speech,false);
 config(root,{whisperModel:'large-v3-turbo'});assert.equal(resolveRuntimePaths({root,env}).whisperModel,path.join(root,'large-v3-turbo'));assert.equal(fs.existsSync(path.join(root,'large-v3-turbo')),false);
});
