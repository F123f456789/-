const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const projectRoot=path.resolve(__dirname,'..','内容方法','cheat-on-content');
// Reproducible, licensed method sources are bundled; an explicit override is optional.
const skillRoot=process.env.WORKBENCH_CONTENT_SKILL_DIR||path.resolve(__dirname,'..','vendor','cheat-on-content');
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
function readRequired(root,file){try{return fs.readFileSync(path.join(root,file),'utf8');}catch{throw Error(`cheat-on-content 所需文件缺失：${file}。请恢复内容方法文件或所配置的技能后重试。`);}}
function section(text,start,end){const a=text.indexOf(start),b=text.indexOf(end,a+start.length);if(a<0||b<0)throw Error('cheat-on-content 技能内容已变化，请先检查内容方法接入。');return text.slice(a,b).trim();}
function loadContentMethod(stage,{skillDirectory=skillRoot,projectDirectory=projectRoot}={}){
 if(!['topics','writing'].includes(stage))throw Error('内容方法阶段无效。');
 let state;try{state=JSON.parse(readRequired(projectDirectory,'.cheat-state.json'));}catch(e){if(e.message.includes('所需文件缺失'))throw e;throw Error('内容方法状态无法读取，请检查 .cheat-state.json。');}
 if(state.integration?.mode!=='workbench-adapted')throw Error('内容方法配置与工作台不匹配，请先检查。');
 const sources=[],read=(root,file)=>{const text=readRequired(root,file);sources.push({file:path.join(root,file),sha256:hash(text)});return text;};
 read(skillDirectory,'SKILL.md');const workflow=read(projectDirectory,'WORKFLOW.md');let excerpts=[];
 if(stage==='topics'){
  const seed=read(skillDirectory,'skills/cheat-seed/SKILL.md');const trends=read(skillDirectory,'skills/cheat-trends/SKILL.md');const recommend=read(skillDirectory,'skills/cheat-recommend/SKILL.md');
  // Read only applicable principles. The workbench contract below deliberately
  // adapts the command workflow to topic-only output with an uncalibrated rubric.
  excerpts=[section(seed,'### Phase 2A:','**反问类型'),section(trends,'**优雅降级**','### Phase 3:'),section(recommend,'#### 第 2 条（实验性）','#### 剩余')];
  excerpts.push(read(projectDirectory,'rubric_notes.md'));
 }else{
  const patterns=read(skillDirectory,'templates/script_patterns.template.md');
  excerpts=[section(patterns,'## 结构选型 cheat sheet','### 用法')];
  excerpts.push(read(projectDirectory,'script_patterns.md'));
 }
 const notice='采用热点筛选、历史去重和延续/探索推荐方法；尚未校准，不作播放量预测。';
 const receipt={name:'cheat-on-content',mode:'选题方法适配',version:state.integration.version,stage,notice,calibrated:false,sources};
 return {receipt,prompt:`内容方法：cheat-on-content（工作台适配）。下面是指定版本技能的适用方法片段，不是独立命令调用；本次任务和项目约定优先。\n${excerpts.join('\n\n')}\n\n本项目适配约定：\n${workflow}\n当前阶段：${stage==='topics'?'只选择主题；不写任何脚本或拍摄步骤。':'按当前任务整理已有视频或展开用户已选题目，不另选题。'}\n方向尚未确定时不替用户固定赛道。当前没有完成正式盲预测与复盘校准，不给播放量、爆款概率或成稿分数；原技能中的分数、bucket、pattern 等只作方法背景，不输出数字预测。`};
}
module.exports={loadContentMethod};
