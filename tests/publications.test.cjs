const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {publicationIdentity,resolvePublicationUrl}=require('../src/platforms.cjs');const {Workbench}=require('../src/service.cjs');const {Store}=require('../src/store.cjs');
const root=path.resolve(__dirname,'..');const {temp,placeholderVideo}=require('./support.cjs');
test('按作品编号去重，保留小红书打开页面所需的分享参数',()=>{
 assert.equal(publicationIdentity('https://www.bilibili.com/video/BV1TEST00001/?share_source=copy#reply').publicationKey,'bilibili:BV1TEST00001');
 assert.equal(publicationIdentity('https://www.douyin.com/?modal_id=12345').publicationKey,publicationIdentity('https://www.douyin.com/share/video/12345/').publicationKey);
 const xhs='https://www.xiaohongshu.com/explore/1234567890abcdef12345678?xsec_token=public-share-example';assert.equal(publicationIdentity(xhs).url,xhs);assert.equal(publicationIdentity(xhs).publicationKey,publicationIdentity('https://www.xiaohongshu.com/discovery/item/1234567890abcdef12345678').publicationKey);
 assert.equal(publicationIdentity('https://x.com/example/status/123').publicationKey,publicationIdentity('https://twitter.com/example/status/123?s=20').publicationKey);
 assert.throws(()=>publicationIdentity('https://space.bilibili.com/123'),/单条作品/);
});
test('分享文字与短链可识别；跳转到其他网站时不继续访问',async()=>{
 const direct=await resolvePublicationUrl('这是分享文字 https://www.bilibili.com/video/BV1TEST00001/?share_source=copy 复制后打开');assert.equal(direct.contentId,'BV1TEST00001');
 let calls=0;const resolved=await resolvePublicationUrl('https://b23.tv/example',{request:async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://www.bilibili.com/video/BV1TEST00001/?from=share'}});}});assert.equal(resolved.publicationKey,direct.publicationKey);assert.equal(calls,1);
 let denied=0;await assert.rejects(resolvePublicationUrl('https://v.douyin.com/example/',{request:async()=>{denied++;return new Response(null,{status:302,headers:{location:'https://example.invalid/private'}});}}),/仅支持/);assert.equal(denied,1);
 await assert.rejects(resolvePublicationUrl('https://www.bilibili.com/video/BV1TEST00001/ https://www.douyin.com/video/123'),/一次/);
});
test('只有链接也能建库，重复链接不新建，未导入视频不会调用AI',async()=>{
 let calls=0;const app=new Workbench(root,{dataRoot:temp(),ai:{generate(){calls++;},close(){}}});
 const first=await app.registerPublished('https://www.bilibili.com/video/BV1TEST00001/?from=one');const again=await app.registerPublished('https://www.bilibili.com/video/BV1TEST00001/?from=two');assert.equal(first.workId,again.workId);assert.equal(again.existing,true);assert.equal(app.store.state.works.length,1);
 const another=app.store.addWork({title:'另一条本地作品'});assert.throws(()=>app.addPublication(another.id,'https://www.bilibili.com/video/BV1TEST00001/'),/已有作品/);
 assert.throws(()=>app.processVideo(first.workId),/补入本地原视频/);assert.equal(calls,0);assert.equal(app.store.state.jobs.length,0);
});
test('合成抖音分享文字经 iesdouyin 分享页展开，仍保持同平台校验和作品编号',async()=>{
 const raw='1.23 01/01 Abc:/ :1pm 测试分享文字 #测试标签 https://v.douyin.com/Synthetic01/ 复制此链接，打开应用查看！';
 const mobile='https://www.iesdouyin.com/share/video/9000000000000000001/';
 const requested=[];const result=await resolvePublicationUrl(raw,{request:async(url,options)=>{requested.push({url,method:options.method});return new Response(null,{status:302,headers:{location:mobile}});}});
 assert.deepEqual(requested,[{url:'https://v.douyin.com/Synthetic01/',method:'HEAD'}]);
 assert.equal(result.url,'https://www.douyin.com/video/9000000000000000001');
 assert.equal(result.contentId,'9000000000000000001');
 assert.equal(result.publicationKey,publicationIdentity(mobile).publicationKey);
 assert.equal(result.publicationKey,publicationIdentity(result.url).publicationKey);
 await assert.rejects(resolvePublicationUrl(raw,{request:async()=>new Response(null,{status:302,headers:{location:'https://www.iesdouyin.com.evil.example/share/video/9000000000000000001/'}})}),/仅支持/);
 await assert.rejects(resolvePublicationUrl(raw,{request:async()=>new Response(null,{status:302,headers:{location:'https://www.bilibili.com/video/BV1TEST00001/'}})}),/其他平台/);
});
test('先登记链接再补原视频，发布记录、评论和手动标题重启后仍在',async()=>{
 const dir=temp(),app=new Workbench(root,{dataRoot:dir,ai:{close(){}}});const r=await app.registerPublished('https://www.douyin.com/video/9990009990009990000',{title:'隔离测试：只验证文件关联'});const w=app.store.getWork(r.workId);
 app.importComments(w.id,r.pubId,[{text:'隔离测试评论，非真实用户数据'}],{platform:'douyin',url:w.publications[0].url,method:'隔离测试'});
 const source=placeholderVideo();await app.importVideo(source,{existingWorkId:w.id});await assert.rejects(app.importVideo(source,{existingWorkId:w.id}),/不会覆盖/);
 const saved=new Store(dir);assert.equal(saved.state.works.length,1);assert.equal(saved.getWork(w.id).publications[0].id,r.pubId);assert.equal(saved.state.comments[0].workId,w.id);assert.equal(saved.getWork(w.id).title,'隔离测试：只验证文件关联');assert.ok(fs.existsSync(saved.getWork(w.id).videoPath));assert.equal(saved.getWork(w.id).analysis,undefined);
});
