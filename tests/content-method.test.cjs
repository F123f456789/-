const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {loadContentMethod}=require('../src/content-method.cjs');const {planPrompt,videoPrompt,shootingPrompt,validatePlan}=require('../src/content.cjs');const {legacyResult}=require('./fixtures.cjs');
const {temp}=require('./support.cjs');
const state={settings:{direction:'',audience:''},works:[],comments:[],plans:[]};
test('从随项目提供的方法参考读取适用方法，话题与写稿分阶段，来源摘要可追溯',()=>{
 const topics=loadContentMethod('topics'),writing=loadContentMethod('writing');
 assert.equal(topics.receipt.name,'cheat-on-content');assert.equal(topics.receipt.calibrated,false);assert.match(topics.prompt,/尚未确定|尚未确定/);assert.match(topics.prompt,/只选择主题/);assert.match(topics.prompt,/strategy 和 testHypothesis/);
 assert.ok(topics.receipt.sources.some(x=>x.file.includes('cheat-recommend')));assert.ok(topics.receipt.sources.some(x=>x.file.includes('cheat-trends')));assert.ok(topics.receipt.sources.some(x=>x.file.includes('cheat-seed')));
 assert.ok(topics.receipt.sources.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)));assert.ok(writing.receipt.sources.some(x=>x.file.endsWith('script_patterns.md')));
 assert.doesNotMatch(topics.prompt,/±50%|前 5 篇精度|30-100w|小爆/);assert.doesNotMatch(writing.prompt,/±50%|局限性讨论|永远在 emotional/);
});
test('三个生成入口采用该方法，选题缺少适配字段不会被保存为新结果',()=>{
 const context=planPrompt(state);assert.equal(context.contentMethod.name,'cheat-on-content');assert.match(context.prompt,/没有作品或评论/);assert.match(context.prompt,/只生成选题，不生成拍摄方案/);
 const result=legacyResult();assert.equal(validatePlan(result,[],{requireMethod:true}),true);delete result.candidates[0].testHypothesis;assert.throws(()=>validatePlan(result,[],{requireMethod:true}),/推荐依据/);assert.equal(validatePlan(result,[]),true);
 const work={title:'实际素材',media:{frames:[],duration:14,transcript:{text:'已有视频内容'}}};assert.match(videoPrompt(work,{}),/cheat-on-content/);assert.match(shootingPrompt(state,{result:legacyResult(),evidence:[]},1),/cheat-on-content/);
});
test('技能缺失时明确停止，不能悄悄退回旧方法却宣称已使用',()=>{
 assert.throws(()=>loadContentMethod('topics',{skillDirectory:path.join(__dirname,'not-installed')}),/所需文件缺失/);
 const dir=temp('method-test-');fs.writeFileSync(path.join(dir,'.cheat-state.json'),'{bad');
 assert.throws(()=>loadContentMethod('topics',{projectDirectory:dir}),/状态无法读取/);
});
