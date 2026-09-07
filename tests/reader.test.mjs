import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';

const source=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
function worker(data={},tabs=new Map([[7,{url:'https://docs.example.com/start',status:'complete'}]])) {
  const callbacks={},injected=[];
  const event=name=>({addListener(fn){callbacks[name]=fn;}});
  const storage={async get(key){return key===null?{...data}:{[key]:data[key]};},async set(value){Object.assign(data,value);},async remove(key){delete data[key];}};
  const context=vm.createContext({URL,crypto:webcrypto,setTimeout,clearTimeout,TextEncoder,chrome:{
    runtime:{id:'test',getURL(){return 'chrome-extension://test/';},onMessage:event('message'),onInstalled:event('installed'),onStartup:event('startup')},
    contextMenus:{onClicked:event('menu')},
    tabs:{async get(id){return tabs.get(id);},async sendMessage(){},onRemoved:event('removed'),onUpdated:event('updated')},
    storage:{session:storage},scripting:{async executeScript(args){injected.push(args.target.tabId);}},commands:{onCommand:event('command')}
  }});
  vm.runInContext(source,context);
  return {context,callbacks,injected,data,tabs};
}

test('reader mode survives worker restart and restores only its tab and origin',async()=>{
  const w=worker();
  await w.context.setReader(7,'https://docs.example.com/start','running');
  w.tabs.set(7,{url:'https://docs.example.com/next',status:'complete'});
  const restarted=worker(w.data,w.tabs);
  await restarted.context.restoreReader(7);
  assert.deepEqual(restarted.injected,[7]);
  assert.equal((await restarted.context.readReader(7,'https://docs.example.com/next')).mode,'running');
  await restarted.context.restoreReader(8);
  assert.deepEqual(restarted.injected,[7]);
  w.tabs.set(7,{url:'https://elsewhere.example.com/next',status:'complete'});
  await restarted.context.restoreReader(7);
  assert.equal(w.data['reader:7'],undefined);
  assert.deepEqual(restarted.injected,[7]);
});

test('rapid pause, resume and exit persist in user action order',async()=>{
  const w=worker();
  await Promise.all(['running','paused','running','off'].map(mode=>w.context.setReader(7,'https://docs.example.com/start',mode)));
  assert.equal(w.data['reader:7'],undefined);
  await w.context.setReader(7,'https://docs.example.com/start','paused');
  w.tabs.set(7,{url:'https://docs.example.com/next'});
  await w.context.restoreReader(7);
  assert.equal((await w.context.readReader(7,'https://docs.example.com/next')).mode,'paused');
  await assert.rejects(w.context.setReader(7,'https://docs.example.com/start','running'),/페이지가 바뀌었습니다/);
  assert.equal(w.data['reader:7'].mode,'paused');
  w.callbacks.removed(7);
  await w.context.readReader(7,'https://docs.example.com/next');
  assert.equal(w.data['reader:7'],undefined);
});

test('SPA controls accept the current URL and reject a different origin',async()=>{
  const w=worker();
  w.tabs.set(7,{url:'https://docs.example.com/spa'});
  const sender={id:'test',url:'https://docs.example.com/start',tab:{id:7}};
  const result=await new Promise(resolve=>w.callbacks.message({type:'reader-set',url:'https://docs.example.com/spa',data:{mode:'running'}},sender,resolve));
  assert.equal(result.ok,true);
  assert.equal(w.data['reader:7'].mode,'running');
  assert.equal(w.callbacks.message({type:'reader-set',url:'https://evil.example.com/spa',data:{mode:'off'}},sender,()=>assert.fail('wrong-origin message replied')),undefined);
  assert.equal(w.data['reader:7'].mode,'running');
});
