const path=require('node:path');
// Fixed, synthetic data. Tests must not depend on the user's current library.
const at='2026-10-28T06:00:00.000Z';
function legacyResult(){return {
 analysis:{overview:'隔离测试分析，不代表真实运营结论。',questions:['测试问题'],agreements:[],objections:[],needs:[],limitations:['固定测试样本']},
 candidates:[0,1,2].map(i=>({title:'隔离选题'+i,strategy:'探索',testHypothesis:'固定测试假设',reason:'固定测试理由'+i,evidenceIds:[],difference:'固定测试角度'+i,uncertainty:'测试用内容'})),recommendedIndex:0,
 script:{title:'隔离选题0',hook:'固定测试开头',spoken:'这是完整口播的固定测试文本，供编辑保存和历史检查使用。',shots:['固定测试镜头'],durationSeconds:60,materials:['固定测试材料'],drafts:{douyin:'固定抖音稿',bilibili:'固定B站稿',xiaohongshu:'固定小红书稿',x:'固定X稿'}}
};}
function demoPlan(){return {id:'fixture-demo-plan',day:'2026-10-28',createdAt:at,demo:true,feedback:'未处理',candidateFeedback:{},result:legacyResult(),evidence:[],collectionIssues:[],edits:[],receipt:{status:'test-only',at}};}
function demoState(){
 const work={id:'fixture-demo-work',title:'固定演示视频',demo:true,createdAt:at,updatedAt:at,source:'隔离测试素材，非用户作品',videoPath:path.resolve(__dirname,'fixtures','video.mp4'),publications:[],generationHistory:[],media:{duration:14,frames:[{time:1,path:path.resolve(__dirname,'fixtures','frame.jpg')}],sampling:'隔离测试画面',transcript:{text:'[0.0–2.0s] 固定文字稿，用于编辑测试。',source:'隔离测试文字稿',segments:[]}},analysis:{summary:'固定测试摘要',points:['测试要点'],visualNotes:[],uncertainties:[]},drafts:['douyin','bilibili','xiaohongshu','x'].map(platform=>({id:'draft-'+platform,platform,createdAt:at,version:'fixture-v1',edits:[],text:platform+'：这是一份独立的固定测试文案，用于验证界面渲染、复制和编辑保存，不代表用户发布过的内容。原文在测试中必须保留历史版本，以便检查保存前后的变化。'}))};
 return {works:[work],comments:[{id:'fixture-comment',workId:work.id,publicationId:null,text:'固定评论样本',author:'测试观众',likes:1,collectedAt:at,source:{platform:'bilibili',method:'隔离测试',url:'https://www.bilibili.com/video/BV1TEST00001/'}}],plans:[demoPlan()],aiReceipt:{status:'test-only',at,model:'isolated-fixture'}};
}
module.exports={legacyResult,demoPlan,demoState};
