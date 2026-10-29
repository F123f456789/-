const test=require('node:test');const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {allowedNavigation,installPlatformNavigationGuard}=require('../src/platform-navigation.cjs');

test('平台页及 HTTPS 登录子框架可用，客户端协议在所有框架被阻止',()=>{
 assert.equal(allowedNavigation('https://www.douyin.com/video/9000000000000000001','douyin'),true);
 assert.equal(allowedNavigation('https://sso.douyin.com/login','douyin'),true);
 assert.equal(allowedNavigation('https://verification.example.test/verify','douyin',false),true);
 for(const url of ['about:blank','about:srcdoc','data:text/html,<p>test</p>','blob:https://www.douyin.com/test'])assert.equal(allowedNavigation(url,'douyin',false),true);
 for(const url of ['bytedance://open','snssdk1128://video/123','ms-windows-store://pdp','file:///C:/secret','https://www.douyin.com.evil.example/','http://www.douyin.com/'])assert.equal(allowedNavigation(url,'douyin'),false);
 for(const url of ['bytedance://open','snssdk1128://video/123','ms-windows-store://pdp','file:///C:/secret'])assert.equal(allowedNavigation(url,'douyin',false),false);
});

test('真实事件形状覆盖主框架、子框架和重定向，诊断不保存登录参数',()=>{
 const contents=new EventEmitter(),blocked=[];installPlatformNavigationGuard(contents,'douyin',x=>blocked.push(x));
 for(const name of ['will-navigate','will-frame-navigate','will-redirect']){
  let denied=false;contents.emit(name,{url:'bytedance://login?token=must-not-log',isMainFrame:false,preventDefault(){denied=true;}});assert.equal(denied,true);
  let accepted=true;contents.emit(name,{url:'https://sso.douyin.com/login',isMainFrame:true,preventDefault(){accepted=false;}});assert.equal(accepted,true);
 }
 assert.deepEqual(blocked,[1,2,3].map(()=>({protocol:'bytedance:',isMainFrame:false})));
 let legacyDenied=false;contents.emit('will-redirect',{preventDefault(){legacyDenied=true;}},'bytedance://open',false,false);assert.equal(legacyDenied,true);
 let legacyAllowed=true;contents.emit('will-navigate',{preventDefault(){legacyAllowed=false;}},'https://www.douyin.com/');assert.equal(legacyAllowed,true);
});
