const {now}=require('./store.cjs');
const PLATFORMS={douyin:'抖音',bilibili:'哔哩哔哩',xiaohongshu:'小红书',x:'X'};
const roots={douyin:['douyin.com','iesdouyin.com'],bilibili:['bilibili.com','b23.tv'],xiaohongshu:['xiaohongshu.com','xhslink.com','xhslink.cn'],x:['x.com','twitter.com']};
function platformUrl(raw){let u;try{u=new URL(raw.trim());}catch{throw Error('请输入完整的 https 作品或主页链接。');}if(u.protocol!=='https:')throw Error('仅支持 https 平台链接。');const platform=Object.keys(roots).find(p=>roots[p].some(d=>u.hostname===d||u.hostname.endsWith('.'+d)));if(!platform)throw Error('仅支持抖音、哔哩哔哩、小红书和 X 的链接。');if(u.username||u.password)throw Error('链接不能包含账号或密码。');return {url:u.href,platform};}
function extractPublicationUrl(raw){
 if(typeof raw!=='string'||raw.length>12000)throw Error('请粘贴一条作品链接或分享文字。');
 const matches=[...new Set((raw.match(/https:\/\/[^\s<>"「」]+/g)||[]).map(x=>x.replace(/[)\]}，。；！？、]+$/g,'')))];
 if(matches.length!==1)throw Error('请一次粘贴一条完整的 https 作品链接。');
 return platformUrl(matches[0]);
}
function publicationIdentity(raw){
 const parsed=platformUrl(raw),u=new URL(parsed.url);let contentId;
 if(parsed.platform==='bilibili')contentId=u.pathname.match(/^\/video\/(BV[0-9A-Za-z]{10})(?:\/|$)/)?.[1];
 if(parsed.platform==='douyin')contentId=u.pathname.match(/^\/(?:share\/)?video\/(\d+)(?:\/|$)/)?.[1]||(/^[0-9]+$/.test(u.searchParams.get('modal_id')||'')?u.searchParams.get('modal_id'):null);
 if(parsed.platform==='xiaohongshu')contentId=u.pathname.match(/^\/(?:explore|discovery\/item)\/([0-9a-f]{24})(?:\/|$)/i)?.[1]?.toLowerCase();
 if(parsed.platform==='x')contentId=u.pathname.match(/^\/[^/]+\/status\/(\d+)(?:\/|$)/)?.[1];
 if(!contentId)throw Error('没有识别到单条作品。请打开分享链接后复制作品地址；B站目前使用含 BV 编号的视频地址，主页请到“设置”登记。');
 let url=parsed.url;
 if(parsed.platform==='bilibili')url='https://www.bilibili.com/video/'+contentId+'/';
 if(parsed.platform==='douyin')url='https://www.douyin.com/video/'+contentId;
 return {...parsed,url,contentId,publicationKey:parsed.platform+':'+contentId};
}
function publicationKey(raw){try{return publicationIdentity(raw).publicationKey;}catch{return null;}}
async function resolvePublicationUrl(raw,{request=fetch}={}){
 let current=extractPublicationUrl(raw);const expected=current.platform;
 try{return publicationIdentity(current.url);}catch{}
 const shortHosts=['b23.tv','v.douyin.com','xhslink.com','www.xhslink.com','xhslink.cn','www.xhslink.cn'];
 if(!shortHosts.includes(new URL(current.url).hostname))return publicationIdentity(current.url);
 for(let hop=0;hop<5;hop++){
  let response=await request(current.url,{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(10000)});
  if(response.status===405||response.status===501){await response.body?.cancel();response=await request(current.url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(10000)});}
  const status=response.status,location=response.headers.get('location');await response.body?.cancel();
  if(![301,302,303,307,308].includes(status)||!location)throw Error('分享链接暂时无法展开，可能需要在平台内打开或登录。请复制展开后的完整作品地址。');
  current=platformUrl(new URL(location,current.url).href);
  if(current.platform!==expected)throw Error('分享链接跳转到其他平台，已停止解析。请检查链接。');
  try{return publicationIdentity(current.url);}catch{}
 }
 throw Error('分享链接跳转次数过多，请在平台中打开后复制完整作品地址。');
}
async function json(url){const r=await fetch(url,{signal:AbortSignal.timeout(18000),headers:{'User-Agent':'Mozilla/5.0','Referer':'https://www.bilibili.com/'}});if(!r.ok)throw Error(`平台暂不允许读取（HTTP ${r.status}），可以打开平台窗口或导入评论。`);let d;try{d=await r.json();}catch{throw Error('平台返回登录或验证页面，未读取到数据。');}if(d.code!==0)throw Error(`平台返回 ${d.code}：${d.message||'当前访问受限'}。不会绕过验证。`);return d.data;}
async function fetchBilibili(url){
 const match=url.match(/BV[0-9A-Za-z]{10}/);if(!match)throw Error('请粘贴展开后的 B 站 BV 视频链接；短链接可先在平台中打开。');
 const data=await json('https://api.bilibili.com/x/web-interface/view?bvid='+match[0]);
 const stat=data.stat||{};const metrics={plays:stat.view??null,likes:stat.like??null,comments:stat.reply??null,favorites:stat.favorite??null,shares:stat.share??null,coins:stat.coin??null};
 let comments=[],commentError=null;
 try{const reply=await json(`https://api.bilibili.com/x/v2/reply?type=1&oid=${data.aid}&pn=1&ps=20&sort=2`);const rows=reply.replies||[];for(const r of rows){comments.push({externalId:String(r.rpid),text:r.content?.message||'',author:r.member?.uname||'',likes:r.like??null,publishedAt:r.ctime?new Date(r.ctime*1000).toISOString():null});for(const child of r.replies||[])comments.push({externalId:String(child.rpid),text:child.content?.message||'',author:child.member?.uname||'',likes:child.like??null,publishedAt:child.ctime?new Date(child.ctime*1000).toISOString():null});}}catch(e){commentError=e.message;}
 return {title:data.title,metrics,comments,commentError,scope:'公开页面接口的第一页热门评论（至多20条主评论及接口附带的部分回复），不是全部评论。',source:{platform:'bilibili',url,method:'公开页面数据接口',at:now()}};
}
async function fetchPublication(pub){if(pub.platform==='bilibili')return fetchBilibili(pub.url);throw Error(`${PLATFORMS[pub.platform]}未配置可验证的免费自动接口。请先打开平台窗口，加载评论后读取已显示内容，或导入评论文件。`);}
function parseDelimited(text){const rows=[];let row=[],cell='',quoted=false;const delimiter=text.split('\n')[0].includes('\t')?'\t':',';for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===delimiter&&!quoted){row.push(cell);cell='';}else if(c==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=c;}if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}return rows;}
function parseComments(text,extension='txt'){
 if(Buffer.byteLength(text)>10*1024*1024)throw Error('评论文件超过10MB，请分批导入。');
 if(extension==='json'){let r;try{r=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw Error('JSON 评论文件格式不正确。');}const rows=Array.isArray(r)?r:r.comments;if(!Array.isArray(rows))throw Error('JSON 需要评论数组或 comments 数组。');return rows.map(x=>typeof x==='string'?{text:x}:{text:x.text||x.content||x.评论内容||'',author:x.author||x.昵称||'',externalId:x.id?String(x.id):null,likes:Number.isFinite(x.likes)?x.likes:null});}
 if(['csv','tsv'].includes(extension)){const rows=parseDelimited(text.replace(/^\uFEFF/,''));const head=rows.shift()?.map(s=>s.trim().toLowerCase())||[];const col=(names)=>head.findIndex(s=>names.includes(s));const t=col(['text','content','评论','评论内容']),a=col(['author','昵称','用户','用户名']),l=col(['likes','点赞','点赞数']);if(t<0)throw Error('表格需要“评论内容”或 text 列。');return rows.map(r=>({text:r[t]||'',author:a<0?'':r[a]||'',likes:l<0||r[l]===''?null:Number(r[l])}));}
 return text.split(/\r?\n/).filter(t=>t.trim()).map(text=>({text}));
}
const capabilityDefaults={
 douyin:{status:'需登录后验证',automatic:false,detail:'官方数据接口需要权限；已实现打开作品页、有限加载并读取评论的免费流程，需登录后实测，当前未验证。',source:'https://open.douyin.com/platform/resource/docs/openapi/data-open-service/video-data/get-comment-data/'},
 bilibili:{status:'待实际验证',automatic:false,detail:'尝试免费公开页面数据；平台可能要求验证。可用性以每次读取回执为准，不保证长期稳定。',source:'https://open.bilibili.com/doc'},
 xiaohongshu:{status:'需登录后验证',automatic:false,detail:'未接通免费接口；已实现尝试页面自动加载读取流程，需真实登录页验证，也可导入文件。'},
 x:{status:'评论需手动导入',automatic:false,detail:'未接通免费接口；页面可能混入推荐帖子，回复归属尚未验证，因此暂停页面评论提取。支持带来源的手动导入。'}
};
// Runs only inside a user-visible platform window; it reads rendered comment nodes, never cookies or hidden account state.
function visibleReader(platform){
 if(platform==='x')return `(()=>({url:location.href,title:document.title,comments:[],commentError:'X 页面可能混入推荐帖子，当前不能可靠确认回复归属，请手动导入对应帖子的评论。',links:[...document.querySelectorAll('a[href]')].map(a=>({url:a.href,title:a.innerText?.trim()||''})).filter(a=>a.title&&/\\/status\\//.test(a.url)).slice(0,100)}))()`;
 const rules={
  bilibili:{root:'.reply-item,.root-reply-container,bili-comment-thread-renderer,bili-comment-reply-renderer',text:'.reply-content,.reply-text,#content,.text',author:'.user-name,.sub-user-name,#user-name'},
  douyin:{root:'[data-e2e="comment-item"],.comment-item',text:'[data-e2e="comment-content"]',author:'[data-e2e="comment-user-name"]'},
  xiaohongshu:{root:'.comment-item',text:'.content .note-text,.content .content,.comment-content,.note-text',author:'.author .name,.user-name'},
  x:{root:'article[data-testid="tweet"]',text:'[data-testid="tweetText"]',author:'[data-testid="User-Name"]'}
 };
 return `(()=>{const rule=${JSON.stringify(rules[platform])}; const roots=[document]; const scan=root=>{for(const el of root.querySelectorAll('*'))if(el.shadowRoot){roots.push(el.shadowRoot);scan(el.shadowRoot)}};scan(document); const result=[];for(const r of roots)for(const el of r.querySelectorAll(rule.root)){const visible=el.getBoundingClientRect();if(visible.width===0||visible.height===0)continue;const inner=el.shadowRoot||el;const node=inner.querySelector(rule.text);const text=node?.innerText?.trim();if(!text)continue;let source=inner.querySelector('a[href*="/status/"]')?.href||null;if(${JSON.stringify(platform)}==='x'&&source&&source.split('?')[0]===location.href.split('?')[0])continue;result.push({text,author:inner.querySelector(rule.author)?.innerText?.trim()||'',externalId:source});}return {url:location.href,title:document.title,comments:result.slice(0,300),links:[...document.querySelectorAll('a[href]')].map(a=>({url:a.href,title:a.innerText.trim()})).filter(a=>a.title&&/\/video\/|\/explore\/|\/status\//.test(a.url)).slice(0,100)};})()`;
}
module.exports={PLATFORMS,platformUrl,extractPublicationUrl,publicationIdentity,publicationKey,resolvePublicationUrl,fetchPublication,fetchBilibili,parseComments,capabilityDefaults,visibleReader};
