const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('workbench',{call:async(action,args)=>{const r=await ipcRenderer.invoke('workbench',action,args);if(!r.ok)throw Error(r.error);return r.value;},onChanged:fn=>{const cb=()=>fn();ipcRenderer.on('state-changed',cb);return()=>ipcRenderer.removeListener('state-changed',cb);}});
