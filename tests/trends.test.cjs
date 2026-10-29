const test=require('node:test');const assert=require('node:assert/strict');const {fetchTrends}=require('../src/trends.cjs');
const at=new Date('2026-10-28T07:25:00Z');
const douyin=()=>({status_code:0,active_time:'2026-10-28 15:18:00',word_list:[{word:'测试中的AI话题'},{word:'测试中的AI话题'},{word:'第二个测试话题'}]});
const bilibili=()=>({code:0,timestamp:Math.floor(at.getTime()/1000),list:[{show_name:'B站测试话题',keyword:'B站搜索词',pos:1},{show_name:'广告测试',pos:2,stat_datas:{is_commercial:'1'}}]});
const response=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});

test('合并第一方公开榜单，保留来源和采集时间并去重，不把更新时间当事件发布时间',async()=>{
 const calls=[];const result=await fetchTrends({now:()=>at,request:async(url,options)=>{calls.push({url,options});return response(url.includes('bilibili')?bilibili():douyin());}});
 assert.equal(calls.length,2);assert.ok(calls.every(c=>c.options.redirect==='error'&&c.options.credentials==='omit'&&c.options.cache==='no-store'));
 assert.equal(result.items.length,3);assert.deepEqual(result.issues,[]);assert.equal(result.fetchedAt,at.toISOString());
 for(const item of result.items){assert.ok(item.id.startsWith('trend:'));assert.ok(item.url.startsWith('https://'));assert.ok(item.sourceUrl.startsWith('https://'));assert.equal(item.fetchedAt,at.toISOString());assert.equal(item.publishedAt,undefined);assert.match(item.timeMeaning,/不是事件/);}
 assert.equal(result.items[2].url,'https://search.bilibili.com/all?keyword='+encodeURIComponent('B站搜索词'));assert.match(result.scope,/不能据此确认事件事实/);
});

test('单个来源受限不影响另一个，全部失败明确缺失而不是补旧缓存',async()=>{
 const partial=await fetchTrends({now:()=>at,request:async url=>url.includes('bilibili')?response(bilibili()):new Response('login',{status:403})});
 assert.equal(partial.items.length,1);assert.match(partial.issues[0],/抖音.*403/);
 const empty=await fetchTrends({now:()=>at,request:async()=>{throw Error('secret upstream information');}});assert.deepEqual(empty.items,[]);assert.equal(empty.issues.length,2);assert.ok(!JSON.stringify(empty).includes('secret'));
});

test('空榜单、无时间、过期和未来时间都不冒充当下热点',async()=>{
 for(const payload of [{...douyin(),word_list:[]},{...douyin(),active_time:undefined},{...douyin(),active_time:'2026-10-27 15:18:00'},{...douyin(),active_time:'2026-10-29 15:18:00'},{...douyin(),status_code:1}]){
  const result=await fetchTrends({now:()=>at,request:async url=>response(url.includes('bilibili')?bilibili():payload)});assert.equal(result.items.length,1);assert.equal(result.issues.length,1);assert.match(result.issues[0],/抖音/);
 }
 const staleBili=await fetchTrends({now:()=>at,request:async url=>response(url.includes('bilibili')?{...bilibili(),timestamp:Math.floor(at.getTime()/1000)-86400}:douyin())});assert.equal(staleBili.items.length,2);assert.match(staleBili.issues[0],/超过6小时/);
});

test('读取体积有上限，验证页或异常结构返回可理解的缺失说明',async()=>{
 for(const make of [()=>new Response('x',{headers:{'content-length':'999999'}}),()=>new Response('x'.repeat(256*1024+1)),()=>new Response('<html>请验证</html>'),()=>response({code:0,status_code:0})]){
  const result=await fetchTrends({now:()=>at,request:async()=>make()});assert.deepEqual(result.items,[]);assert.equal(result.issues.length,2);
 }
});
