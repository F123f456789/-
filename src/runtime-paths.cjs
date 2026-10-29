const fs=require('node:fs');const path=require('node:path');
const DEFAULT_ROOT=path.resolve(__dirname,'..');
const ENV_KEYS={ffmpeg:'WORKBENCH_FFMPEG',ffprobe:'WORKBENCH_FFPROBE',python:'WORKBENCH_PYTHON',whisperModel:'WORKBENCH_WHISPER_MODEL'};
function fileExists(file){try{return !!file&&fs.statSync(file).isFile();}catch{return false;}}
function directoryExists(file){try{return !!file&&fs.statSync(file).isDirectory();}catch{return false;}}
function readConfig(root){const file=path.join(root,'runtime-config.json');if(!fs.existsSync(file))return {};
 let config;try{config=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}catch{throw Error('runtime-config.json 格式有误，请参照 runtime-config.example.json 检查双引号和逗号。');}
 if(!config||typeof config!=='object'||Array.isArray(config))throw Error('runtime-config.json 必须是包含工具路径的对象。');
 for(const key of Object.keys(ENV_KEYS))if(config[key]!==undefined&&(typeof config[key]!=='string'||!config[key].trim()))throw Error(`runtime-config.json 中的 ${key} 必须填写非空路径，或删除该项以使用自动查找。`);
 return config;
}
function executableOnPath(names,env,platform){const searchPath=env.PATH||env.Path||'';
 for(const name of names)for(const folder of searchPath.split(path.delimiter).filter(Boolean)){
  const candidate=path.resolve(folder.replace(/^"|"$/g,''),name);
  if(fileExists(candidate)){try{fs.accessSync(candidate,platform==='win32'?fs.constants.F_OK:fs.constants.X_OK);return candidate;}catch{}}
 }
 return '';
}
function configuredExecutable(value,root,env,platform){if(!value)return '';
 const direct=path.resolve(root,value);if(path.isAbsolute(value)||/[\\/]/.test(value)||fileExists(direct))return direct;
 const names=platform==='win32'&&!path.extname(value)?[value+'.exe',value]:[value];
 // Preserve an invalid explicit choice so it cannot silently select a different tool.
 return executableOnPath(names,env,platform)||direct;
}
function resolveRuntimePaths({root=DEFAULT_ROOT,env=process.env,platform=process.platform}={}){
 const config=readConfig(root),selected=key=>{const value=env[ENV_KEYS[key]];return typeof value==='string'&&value.trim()?value.trim():config[key]?.trim();};
 const ffmpegValue=selected('ffmpeg'),ffprobeValue=selected('ffprobe'),pythonValue=selected('python');
 const ffmpeg=ffmpegValue?configuredExecutable(ffmpegValue,root,env,platform):executableOnPath(platform==='win32'?['ffmpeg.exe']:['ffmpeg'],env,platform);
 const siblingProbe=ffmpeg?path.join(path.dirname(ffmpeg),platform==='win32'?'ffprobe.exe':'ffprobe'):'';
 const ffprobe=ffprobeValue?configuredExecutable(ffprobeValue,root,env,platform):(fileExists(siblingProbe)?siblingProbe:executableOnPath(platform==='win32'?['ffprobe.exe']:['ffprobe'],env,platform));
 const python=pythonValue?configuredExecutable(pythonValue,root,env,platform):executableOnPath(platform==='win32'?['python.exe','python3.exe']:['python3','python'],env,platform);
 const modelValue=selected('whisperModel');const whisperModel=modelValue?path.resolve(root,modelValue):path.join(root,'models','faster-whisper');
 return {ffmpeg,ffprobe,python,whisperModel};
}
function runtimeStatus(paths){return {video:fileExists(paths.ffmpeg)&&fileExists(paths.ffprobe),speech:fileExists(paths.python)&&directoryExists(paths.whisperModel)};}
module.exports={resolveRuntimePaths,runtimeStatus,fileExists,directoryExists};
