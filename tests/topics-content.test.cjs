const test=require('node:test');const assert=require('node:assert/strict');
const {planSchema,shootingSchema,videoPrompt,planPrompt,shootingPrompt,validatePlan,validateShooting,historyContext}=require('../src/content.cjs');
const timestamp='2026-10-28T09:00:00Z';
function state(){return {settings:{direction:'AI实践',duration:60,style:'自然'},works:[{id:'work-1',demo:false,title:'已经拍过的话题',publications:[],createdAt:timestamp,analysis:{summary:'分享一次用AI整理生活资料的过程'}}],comments:[{id:'comment-1',workId:'work-1',text:'不知道该从哪一步开始',collectedAt:timestamp,source:{platform:'douyin',url:'https://www.douyin.com/video/123',method:'平台窗口已渲染评论'}}],plans:[]};}
function result(){return {analysis:{overview:'分析',questions:[],agreements:[],objections:[],needs:[],limitations:[]},candidates:['新题一','新题二','新题三'].map(title=>({title,reason:'理由',difference:'不同角度',uncertainty:'样本有限',evidenceIds:['comment-1']})),recommendedIndex:0};}
function script(){return {title:'新题二的拍摄标题',hook:'从这个问题开始',spoken:'按选中的问题说明具体步骤。',shots:['录制一次实际操作'],durationSeconds:60,materials:['手机'],drafts:{douyin:'抖音发布稿',bilibili:'B站发布稿',xiaohongshu:'笔记标题\n笔记正文',x:'精简中文帖'}};}

test('选题结构不要求脚本，来源包含历史内容、评论与有时间的热点',()=>{
 const trends={fetchedAt:timestamp,items:[{id:'trend-1',title:'AI工具使用讨论',url:'https://www.douyin.com/search/AI',source:'抖音热榜',sourceUrl:'https://www.douyin.com/hot',platform:'douyin',rank:2,fetchedAt:timestamp,sourceUpdatedAt:timestamp,timeMeaning:'榜单更新时间'}],issues:[]};
 const context=planPrompt(state(),{trends});
 assert.deepEqual(planSchema.required,['analysis','candidates','recommendedIndex']);assert.equal(Object.hasOwn(planSchema.properties,'script'),false);
 assert.deepEqual(context.evidence.map(e=>e.kind),['作品','评论','热点']);const hot=context.evidence[2];assert.equal(hot.id,'trend-1');assert.equal(hot.source.url,trends.items[0].url);assert.equal(hot.source.sourceUrl,trends.items[0].sourceUrl);assert.equal(hot.sourceUpdatedAt,timestamp);assert.equal(hot.publishedAt,null);assert.equal(context.selection.selectedTrends,1);
 assert.match(context.prompt,/只生成选题，不生成拍摄方案/);assert.match(context.prompt,/不必强行追热点/);assert.match(context.prompt,/不能把热榜标题当作已核实事实/);
 const topics=result();topics.candidates[0].evidenceIds.push('trend-1');assert.equal(validatePlan(topics,context.evidence),true);topics.candidates[0].evidenceIds.push('invented-id');assert.throws(()=>validatePlan(topics,context.evidence),/不存在的来源/);
});

test('没有真实热点来源时不捏造热度；重复ID与没有时间的热点不纳入',()=>{
 const context=planPrompt(state(),{trends:{fetchedAt:timestamp,items:[{id:'work-1',title:'重复ID',url:'https://example.test',fetchedAt:timestamp},{id:'unknown-time',title:'无采集时间',url:'https://example.test'}],issues:['本次热点读取失败']}});
 assert.equal(context.selection.selectedTrends,0);assert.equal(context.trendStatus.available,false);assert.match(context.prompt,/本次没有取得可确认的当下热点/);assert.match(context.prompt,/不从模型记忆编造当前热度/);assert.match(context.prompt,/本次热点读取失败/);
});

test('点击第二个候选时只为这个选题生成拍摄方案，结构与校验独立',()=>{
 const topics=result(),plan={id:'plan-1',result:topics,evidence:[{id:'comment-1',text:'已有来源'}],createdAt:timestamp};
 const prompt=shootingPrompt(state(),plan,1);assert.match(prompt,/用户选中的第2个选题/);assert.match(prompt,/新题二/);assert.doesNotMatch(prompt,/新题一|新题三/);assert.match(prompt,/不重新挑题/);assert.match(prompt,/未实际测试或尚未发生/);assert.deepEqual(shootingSchema.required,['script']);
 assert.equal(validateShooting({script:script()}),true);assert.throws(()=>shootingPrompt(state(),plan,3),/请选择/);assert.throws(()=>shootingPrompt(state(),plan,-1),/请选择/);
 const bad=script();delete bad.drafts.x;assert.throws(()=>validateShooting({script:bad}),/完整发布草稿/);assert.throws(()=>validateShooting({script:{...script(),durationSeconds:0}}),/时长/);assert.throws(()=>validateShooting({script:{...script(),shots:[]}}),/镜头/);
});

test('新旧选题反馈均参与长期去重，无脚本的计划使用推荐候选标题',()=>{
 const data=state();data.plans=[{id:'new',day:'2026-10-28',demo:false,feedback:'不感兴趣',candidateFeedback:{1:'已拍摄'},result:result()},{id:'old',day:'2026-10-20',demo:false,feedback:'已拍摄',result:{recommendedIndex:0,candidates:[{title:'历史候选标题'}],script:{title:'历史脚本标题'}}}];
 const history=historyContext(data);assert.equal(history.recentPlans[0].title,'新题一');assert.ok(history.excludedTopics.includes('新题一'));assert.ok(history.excludedTopics.includes('新题二'));assert.ok(history.excludedTopics.includes('历史候选标题'));assert.ok(history.excludedTopics.includes('历史脚本标题'));
 const fresh=result();assert.throws(()=>validatePlan(fresh,[{id:'comment-1'}],{excludedTopics:['新题一！']}),/重复/);
});

test('视频改写要求小红书和X为可发布正文，未知信息放在独立待确认项',()=>{
 const work={title:'真实视频',demo:false,source:'本地素材',media:{duration:14,frames:[{time:2}],sampling:'抽样画面',transcript:{text:'[0.0–2.0s] 视频中实际说过的内容'}}};
 const prompt=videoPrompt(work,state().settings);assert.match(prompt,/直接提炼这条已拍视频中的核心观点/);assert.match(prompt,/首行是简洁标题/);assert.match(prompt,/不拆成连续帖/);assert.match(prompt,/只放可直接复制发布的内容/);assert.match(prompt,/只放在 uncertainties 待确认项中/);assert.match(prompt,/不要把转写行首的时间标记带进/);assert.match(prompt,/视频中实际说过的内容/);
});
