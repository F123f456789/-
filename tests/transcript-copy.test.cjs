const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');

test('文字稿显示和保存时间，按钮与选区复制仅取当前正文，不误删正文数字',async()=>{
 const original='[0.0–2.0s] 2026年先练3–5秒，正文里的[1–2s]要保留。\n[2.0–4.9s] 第二句。';
 const work={id:'copy-fixture',title:'隔离复制检查',demo:false,publications:[],drafts:[],media:{duration:4.9,frames:[],sampling:'测试',transcript:{text:original,source:'用户校对后的文字稿',segments:[{text:'过时的识别文字'}]}}};
 const state={works:[work],comments:[],plans:[],jobs:[],accounts:[],discoveries:[],capabilities:{},settings:{scheduleEnabled:false},aiReceipt:null};const copied=[],saved=[];
 const dom=new JSDOM(fs.readFileSync(path.join(root,'ui','index.html'),'utf8').replace('<script src="app.js"></script>',''),{runScripts:'outside-only',url:'https://offline-test.invalid/'});const w=dom.window;
 w.workbench={onChanged(){},async call(action,args){if(action==='state')return {state:structuredClone(state),paths:{},tools:{}};if(action==='copy'){copied.push(args.text);return true;}if(action==='editTranscript'){saved.push(args.text);work.media.transcript.text=args.text;return true;}throw Error(action);}};
 const settle=()=>new Promise(resolve=>setTimeout(resolve,10));
 try{
  w.eval(fs.readFileSync(path.join(root,'ui','app.js'),'utf8'));await settle();w.document.querySelector('[data-page="library"]').click();w.document.querySelector('[data-action="showWork"]').click();
  const editor=w.document.getElementById('transcript-editor');assert.equal(editor.value,original);
  const edited=original.replace('第二句。','尚未保存的校对文字。');editor.value=edited;editor.dispatchEvent(new w.Event('input',{bubbles:true}));
  const plain='2026年先练3–5秒，正文里的[1–2s]要保留。\n尚未保存的校对文字。';
  w.document.querySelector('[data-action="copyTranscript"]').click();await settle();assert.deepEqual(copied,[plain]);assert.equal(editor.value,edited);assert.equal(saved.length,0);
  const copy=(start,end)=>{editor.setSelectionRange(start,end);let output;const event=new w.Event('copy',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{setData(type,text){assert.equal(type,'text/plain');output=text;}}});editor.dispatchEvent(event);assert.equal(event.defaultPrevented,true);return output;};
  assert.equal(copy(0,edited.length),plain);assert.equal(copy(4,edited.length),plain);assert.equal(copy(0,8),'');assert.equal(copy(2,5),'');
  const bodyStart=edited.indexOf('正文里的');assert.equal(copy(bodyStart,edited.indexOf('\n')),'正文里的[1–2s]要保留。');
  w.document.querySelector('[data-action="saveTranscript"]').click();await settle();assert.deepEqual(saved,[edited]);assert.equal(w.document.getElementById('transcript-editor').value,edited);
  const other=w.document.createElement('textarea');other.value=original;w.document.body.append(other);other.select();const normal=new w.Event('copy',{bubbles:true,cancelable:true});other.dispatchEvent(normal);assert.equal(normal.defaultPrevented,false);
 }finally{dom.window.close();}
});
