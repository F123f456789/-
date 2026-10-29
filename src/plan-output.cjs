const {PLATFORMS}=require('./platforms.cjs');
function shootingEntry(plan,index){
 if(!Number.isInteger(index)||index<0||index>=plan.result.candidates.length)return null;
 return plan.shootingPlans?.[index]||(index===plan.result.recommendedIndex&&plan.result.script?{script:plan.result.script,receipt:plan.receipt,createdAt:plan.createdAt,edits:plan.edits||[],editedAt:plan.editedAt}:null);
}
function exportTopics(plan,index){
 const r=plan.result,entry=index===undefined||index===null?null:shootingEntry(plan,index);
 if(index!==undefined&&index!==null&&!entry)throw Error('这条选题尚未生成拍摄方案，请先点击“展开拍摄方案”。');
 const title=r.candidates[r.recommendedIndex]?.title||'选题';const evidence=plan.evidence||[];
 let out=`# ${plan.day} ${title}\n\n${plan.demo?'第三方演示分析，不代表用户作品或账号表现。\n':''}生成时间：${plan.createdAt}\n状态：${plan.feedback}\n热点读取时间：${plan.trends?.fetchedAt||'此历史记录未读取热点'}\n\n## 本次分析\n${r.analysis.overview}\n\n`;
 if(plan.contentMethod)out+=`内容方法：${plan.contentMethod.name}\n${plan.contentMethod.notice}\n\n`;
 out+=r.candidates.map((c,i)=>`## 候选${i+1}：${c.title}${i===r.recommendedIndex?'（推荐）':''}\n${c.strategy?'方向：'+c.strategy+'\n':''}${c.reason}\n${c.testHypothesis?'想验证：'+c.testHypothesis+'\n':''}新角度：${c.difference}\n来源：${c.evidenceIds.join(', ')||'探索性建议'}\n不确定性：${c.uncertainty}`).join('\n\n');
 if(entry){const s=entry.script;out+=`\n\n## 候选${index+1}的拍摄方案：${s.title}\n预计时长：${s.durationSeconds} 秒\n\n### 开头\n${s.hook}\n\n### 完整口播\n${s.spoken}\n\n### 画面\n${s.shots.map(t=>'- '+t).join('\n')}\n\n### 素材准备\n${s.materials.map(t=>'- '+t).join('\n')}\n\n${Object.entries(s.drafts).map(([k,v])=>`### ${PLATFORMS[k]}\n${v}`).join('\n\n')}`;}
 out+=`\n\n## 来源\n${evidence.map(e=>`${e.id}：${e.title||e.text}\n${e.source?.url||e.publications?.[0]?.url||''}\n${e.source?.method||'本地作品'}${e.fetchedAt||e.collectedAt?'；读取时间：'+(e.fetchedAt||e.collectedAt):''}${e.publishedAt?'；来源更新时间：'+e.publishedAt:''}`).join('\n\n')}\n\n## 本次读取限制\n${plan.collectionIssues?.join('\n')||'详见上述样本范围与判断限制。'}\n`;
 return out;
}
module.exports={shootingEntry,exportTopics};
