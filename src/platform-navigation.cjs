const {platformUrl}=require('./platforms.cjs');

function allowedNavigation(raw,platform,isMainFrame=true){
 try{
  if(isMainFrame)return platformUrl(raw).platform===platform;
  const url=new URL(raw);
  // Embedded web login/verification may use a separate HTTPS host or an inline page.
  // Application-launch schemes must never reach Windows from any frame.
  return url.protocol==='https:'||url.protocol==='data:'||url.protocol==='blob:'||
   (url.protocol==='about:'&&['blank','srcdoc'].includes(url.pathname));
 }catch{return false;}
}

function installPlatformNavigationGuard(contents,platform,onBlocked=()=>{}){
 const guard=(event,legacyUrl,_legacySameDocument,legacyMainFrame)=>{
  const url=typeof event.url==='string'?event.url:legacyUrl;
  const main=typeof event.isMainFrame==='boolean'?event.isMainFrame:
   typeof legacyMainFrame==='boolean'?legacyMainFrame:true;
  if(!allowedNavigation(url,platform,main)){
   event.preventDefault();
   // Report only protocol and frame type; URLs can contain authentication tokens.
   let protocol='invalid';try{protocol=new URL(url).protocol;}catch{}
   onBlocked({protocol,isMainFrame:main});
  }
 };
 contents.on('will-navigate',guard);
 contents.on('will-frame-navigate',guard);
 contents.on('will-redirect',guard);
}

module.exports={allowedNavigation,installPlatformNavigationGuard};
