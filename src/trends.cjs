const {createHash}=require('node:crypto');

const SOURCES=[
 {key:'douyin',name:'抖音公开热榜',url:'https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/',referer:'https://www.douyin.com/',limit:50},
 {key:'bilibili',name:'B站搜索热词',url:'https://s.search.bilibili.com/main/hotword',referer:'https://www.bilibili.com/',limit:50}
];
const MAX_BYTES=256*1024,TIMEOUT_MS=10000,MAX_AGE_MS=6*60*60*1000;

async function readJson(source,request){
 const controller=new AbortController();let response,reader,timer;
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('读取超时'));},TIMEOUT_MS);});
 try{
  response=await Promise.race([request(source.url,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal,headers:{'User-Agent':'Mozilla/5.0',Referer:source.referer,Accept:'application/json'}}),deadline]);
  if(!response.ok)throw Error('平台返回 HTTP '+response.status);
  const expected=Number(response.headers.get('content-length'));if(expected>MAX_BYTES)throw Error('返回内容过大');
  if(!response.body)throw Error('平台没有返回榜单内容');reader=response.body.getReader();const parts=[];let size=0;
  while(true){const next=await Promise.race([reader.read(),deadline]);if(next.done)break;size+=next.value.byteLength;if(size>MAX_BYTES)throw Error('返回内容过大');parts.push(Buffer.from(next.value));}
  let payload;try{payload=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw Error('平台返回了验证页或无法识别的数据');}
  return payload;
 }finally{clearTimeout(timer);controller.abort();if(reader){void reader.cancel().catch(()=>{});reader.releaseLock();}else if(response?.body){void response.body.cancel().catch(()=>{});}}
}

function sourceTime(payload,source){
 if(source.key==='douyin'){
  if(typeof payload.active_time!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(payload.active_time))throw Error('未返回可核对的榜单更新时间');
  const value=Date.parse(payload.active_time.replace(' ','T')+'+08:00');if(!Number.isFinite(value))throw Error('榜单更新时间无法识别');
  return {value,meaning:'榜单更新时间，不是事件发生或新闻发布时间'};
 }
 const value=Number(payload.timestamp)*1000;if(!Number.isFinite(value)||value<=0)throw Error('未返回可核对的数据响应时间');
 return {value,meaning:'平台数据响应时间，不是事件发生或新闻发布时间'};
}

function parseSource(payload,source,fetchedAt){
 if((source.key==='douyin'?payload?.status_code:payload?.code)!==0)throw Error('平台没有返回成功的热榜结果');
 const time=sourceTime(payload,source),age=Date.parse(fetchedAt)-time.value;
 if(age>MAX_AGE_MS)throw Error('榜单数据已超过6小时，本次未当作当前热点使用');
 if(age< -15*60*1000)throw Error('平台数据时间晚于当前时间，无法核对时效');
 const rows=source.key==='douyin'?payload.word_list:payload.list;if(!Array.isArray(rows))throw Error('热榜数据结构发生变化');
 const items=[],seen=new Set();
 for(const [index,row] of rows.slice(0,100).entries()){
  if(!row||typeof row!=='object')continue;
  const raw=source.key==='douyin'?row.word:(row.show_name||row.keyword);if(typeof raw!=='string')continue;
  const title=raw.replace(/[\r\n\t]+/g,' ').trim();if(!title||title.length>200||seen.has(title))continue;
  if(source.key==='bilibili'&&String(row.stat_datas?.is_commercial)==='1')continue;
  seen.add(title);
  const keyword=source.key==='bilibili'&&typeof row.keyword==='string'?row.keyword:title;
  const url=source.key==='douyin'?'https://www.douyin.com/search/'+encodeURIComponent(keyword):'https://search.bilibili.com/all?keyword='+encodeURIComponent(keyword);
  const rank=source.key==='bilibili'&&Number.isInteger(row.pos)&&row.pos>0?row.pos:index+1;
  items.push({id:'trend:'+source.key+':'+createHash('sha256').update(title).digest('hex').slice(0,16),title,url,source:source.name,sourceUrl:source.url,platform:source.key,rank,fetchedAt,sourceUpdatedAt:new Date(time.value).toISOString(),timeMeaning:time.meaning});
  if(items.length===source.limit)break;
 }
 if(!items.length)throw Error('没有返回可用热词，本次未生成虚构热点');
 return items;
}

async function fetchTrends({request=fetch,now=()=>new Date()}={}){
 const fetchedAt=new Date(now()).toISOString();
 const results=await Promise.allSettled(SOURCES.map(async source=>parseSource(await readJson(source,request),source,fetchedAt)));
 const items=[],issues=[];
 for(const [index,result] of results.entries()){
  if(result.status==='fulfilled')items.push(...result.value);
  else{
   // Keep network internals and any unexpected upstream text out of saved diagnostics.
   const message=String(result.reason?.message||'');const safe=/^(读取超时|平台返回 HTTP \d+|返回内容过大|平台没有返回榜单内容|平台返回了验证页或无法识别的数据|未返回可核对的榜单更新时间|榜单更新时间无法识别|未返回可核对的数据响应时间|平台没有返回成功的热榜结果|榜单数据已超过6小时，本次未当作当前热点使用|平台数据时间晚于当前时间，无法核对时效|热榜数据结构发生变化|没有返回可用热词，本次未生成虚构热点)$/.test(message)?message:'当前无法读取，可能是网络或平台限制';
   issues.push(SOURCES[index].name+'：'+safe+'。');
  }
 }
 return {items,fetchedAt,issues,scope:'本次实时请求取得的公开热榜样本，非全平台趋势；热词只表示榜单关注，不能据此确认事件事实。'};
}

module.exports={fetchTrends};
