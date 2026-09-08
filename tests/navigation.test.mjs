import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';

test('section links keep an active translation, but a different document cancels it',async()=>{
  const callbacks={};const sent=[];
  const event=name=>({addListener(fn){callbacks[name]=fn;}});
  const port={onMessage:event('nativeMessage'),onDisconnect:event('disconnect'),postMessage(msg){
    sent.push(msg);
    if(msg.type==='cancel')queueMicrotask(()=>callbacks.nativeMessage({id:msg.id,ok:true,result:{}}));
  }};
  const context=vm.createContext({URL,crypto:webcrypto,setTimeout,clearTimeout,TextEncoder,chrome:{
    runtime:{id:'test',connectNative(){return port;},getURL(){return 'chrome-extension://test/';},onMessage:event('message'),onInstalled:event('installed'),onStartup:event('startup')},
    contextMenus:{onClicked:event('menu')},
    storage:{local:{async get(){return {};}},session:{async get(key){return {[key]:{mode:'running',origin:'https://docs.example.com'}};}}},
    tabs:{async get(){return {url:'https://docs.example.com/guide?version=2#start'};},onRemoved:event('removed'),onUpdated:event('updated')},commands:{onCommand:event('command')}
  }});
  vm.runInContext(readFileSync(new URL('../extension/background.js',import.meta.url),'utf8'),context);
  const task=context.translate({},7,'https://docs.example.com/guide?version=2#start').catch(e=>e);
  await Promise.resolve();
  callbacks.nativeMessage({id:sent[0].id,ok:true,result:{selected:'codex',scope:'test'}});
  const end=Date.now()+2000;
  while(!sent.some(m=>m.type==='translate')){
    if(Date.now()>end)assert.fail('translation did not start');
    await new Promise(resolve=>setTimeout(resolve,5));
  }
  try{
    callbacks.updated(7,{url:'https://docs.example.com/guide?version=2#details'});
    await Promise.resolve();
    assert.equal(sent.filter(m=>m.type==='cancel').length,0);
    callbacks.updated(7,{url:'https://docs.example.com/other'});
    await Promise.resolve();
    assert.equal(sent.filter(m=>m.type==='cancel').length,1);
  }finally{
    callbacks.nativeMessage({id:sent.find(m=>m.type==='translate').id,ok:true,result:{}});
    assert.match((await task).message,/중지/);
  }
});
