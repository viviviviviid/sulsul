import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
const source=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
const request={blocks:[{id:'b0',parts:[{id:'t0',text:'Read easily.',locked:false}]}]};
function worker(maxConcurrentTranslations=2){
  const callbacks={},events=[],sessions={},local={},calls=[];
  const event=name=>({addListener(fn){callbacks[name]=fn;}});
  const storage=data=>({async get(key){return key===null?{...data}:{[key]:data[key]};},async set(value){Object.assign(data,value);},async remove(key){for(const k of [].concat(key))delete data[k];},async clear(){for(const k of Object.keys(data))delete data[k];}});
  let scope='first',sequence=0; const held=new Map();
  const port={onMessage:event('nativeMessage'),onDisconnect:event('disconnect'),postMessage(message){
    calls.push(message);events.push(message.type);
    const answer=result=>queueMicrotask(()=>callbacks.nativeMessage({id:message.id,ok:true,result}));
    if(message.type==='settings-get')answer({scope,maxConcurrentTranslations});
    else if(message.type==='translate'||message.type==='provider-test'){
      sequence++;
      if(message.data?.hold||message.type==='provider-test')held.set(message.id,()=>{held.delete(message.id);events.push('canceled-translation-finished');answer({blocks:[]});});
      else answer({blocks:[],sequence});
    }else if(message.type==='cancel'){answer({});setTimeout(()=>{for(const id of message.data?.ids || held.keys())held.get(id)?.();},20);}
    else if(message.type==='settings-save'){scope='second';answer({scope});}
  }};
  const context=vm.createContext({URL,crypto:webcrypto,setTimeout,clearTimeout,TextEncoder,chrome:{
    runtime:{id:'test',getURL:()=> 'chrome-extension://test/',connectNative:()=>port,onMessage:event('message'),onInstalled:event('installed'),onStartup:event('startup')},
    contextMenus:{onClicked:event('menu')},
    storage:{local:storage(local),session:storage(sessions)},
    tabs:{async get(){return {url:'https://example.com/page'};},async sendMessage(id,msg){events.push(msg.type);},onUpdated:event('updated'),onRemoved:event('removed')},
    commands:{onCommand:event('command')}
  }});
  vm.runInContext(source,context);
  return {context,sessions,local,calls,events,callbacks,held};
}
test('provider switch cancels and drains translation before saving, and pauses the reader',async()=>{
  const w=worker();await w.context.setReader(7,'https://example.com/page','running');
  const pending=w.context.native('translate',{hold:true},7,'https://example.com/page');
  await w.context.saveProvider({provider:'openai'});await pending;
  assert.equal(w.sessions['reader:7'].mode,'paused');
  assert.ok(w.events.indexOf('canceled-translation-finished')<w.events.indexOf('settings-save'));
  assert.ok(w.events.includes('sulsul-provider-changed'));
});
test('provider and model scopes prevent reusing a previous AI cache',async()=>{
  const w=worker();await w.context.setReader(7,'https://example.com/page','running');
  const first=await w.context.translate(request,7,'https://example.com/page');
  const cached=await w.context.translate(request,7,'https://example.com/page');
  assert.equal(first.sequence,1);assert.equal(cached.cached,true);
  await w.context.saveProvider({provider:'openai'});
  await assert.rejects(w.context.translate(request,7,'https://example.com/page'),/중지/);
  await w.context.setReader(7,'https://example.com/page','running');
  const next=await w.context.translate(request,7,'https://example.com/page');
  assert.equal(next.sequence,2);assert.equal(next.cached,undefined);
  assert.equal(w.calls.filter(c=>c.type==='translate').at(-1).scope,'second');
});
test('webpage content scripts cannot read or change keys, login, or run probes',()=>{
  const w=worker(),sender={id:'test',url:'https://example.com/page',tab:{id:7}};
  for(const type of ['settings-get','settings-save','provider-test','ollama-models','login','health'])assert.equal(w.callbacks.message({type,data:{apiKey:'fake'}},sender,()=>assert.fail('privileged webpage reply')),undefined);
  assert.equal(w.calls.length,0);
});

async function until(fn) {
  const end=Date.now()+2000;
  while(!fn()) { if(Date.now()>end)throw new Error('timed out');await new Promise(r=>setTimeout(r,5)); }
}
test('global queue runs two jobs and canceling a tab leaves another tab running',async()=>{
  const w=worker();
  await w.context.setReader(1,'https://example.com/page','running');
  await w.context.setReader(2,'https://example.com/page','running');
  const a=w.context.translate({...request,hold:true},1,'https://example.com/page').catch(e=>e);
  const b=w.context.translate({...request,hold:true},2,'https://example.com/page');
  await until(()=>w.held.size===2);
  const queued=w.context.translate({...request,hold:true},1,'https://example.com/page').catch(e=>e);
  await new Promise(r=>setTimeout(r,20));
  assert.equal(w.calls.filter(c=>c.type==='translate').length,2);
  await w.context.cancelTab(1);
  assert.match((await a).message,/중지/);assert.match((await queued).message,/중지/);
  assert.equal(w.held.size,1,'other tab remains active');
  const canceled=w.calls.filter(c=>c.type==='cancel').flatMap(c=>c.data.ids);
  const other=w.calls.find(c=>c.type==='translate'&&!canceled.includes(c.id));
  assert(other);w.held.get(other.id)();await b;
  assert.equal(w.calls.filter(c=>c.type==='translate').length,2,'queued canceled job never reaches provider');
});
test('cancel during preparation cannot dispatch after a rapid resume',async()=>{
  const w=worker();await w.context.setReader(1,'https://example.com/page','running');
  let release;
  const oldGet=w.context.chrome.storage.local.get;
  w.context.chrome.storage.local.get=()=>new Promise(resolve=>{release=()=>resolve({});});
  const job=w.context.translate(request,1,'https://example.com/page').catch(e=>e);
  await until(()=>!!release);
  const canceled=w.context.cancelTab(1);
  await w.context.setReader(1,'https://example.com/page','running');
  release();await canceled;
  assert.match((await job).message,/중지/);
  assert.equal(w.calls.filter(c=>c.type==='translate').length,0);
  w.context.chrome.storage.local.get=oldGet;
});
test('visible results and immediate cache hits do not wait for disk cache writes',async()=>{
  const w=worker();await w.context.setReader(1,'https://example.com/page','running');
  let release,finished=false;
  w.context.chrome.storage.local.set=()=>new Promise(resolve=>{release=()=>{finished=true;resolve();};});
  const result=await w.context.translate(request,1,'https://example.com/page');
  assert.equal(result.sequence,1);assert.equal(finished,false);
  const cached=await w.context.translate(request,1,'https://example.com/page');
  assert.equal(cached.cached,true);
  assert.equal(w.calls.filter(c=>c.type==='translate').length,1);
  await until(()=>!!release);release();
});
test('provider switch cancels both active and queued jobs before changing settings',async()=>{
  const w=worker();await w.context.setReader(1,'https://example.com/page','running');
  const jobs=Array.from({length:3},()=>w.context.translate({...request,hold:true},1,'https://example.com/page').catch(e=>e));
  await until(()=>w.held.size===2);
  await w.context.saveProvider({provider:'openai'});
  for(const result of await Promise.all(jobs))assert.match(result.message,/중지/);
  assert.equal(w.held.size,0);assert.equal(w.calls.filter(c=>c.type==='translate').length,2);
  assert.equal(w.sessions['reader:1'].mode,'paused');
  assert(w.events.lastIndexOf('canceled-translation-finished')<w.events.indexOf('settings-save'));
});
test('cache storage errors preserve successful translation and release the queue',async()=>{
  const w=worker();await w.context.setReader(1,'https://example.com/page','running');
  w.context.chrome.storage.local.set=async()=>{throw new Error('disk full');};
  const first=await w.context.translate(request,1,'https://example.com/page');
  assert.equal(first.sequence,1);
  const second=await w.context.translate({...request,before:'different context'},1,'https://example.com/page');
  assert.equal(second.sequence,2);
  assert.equal((await w.context.translate(request,1,'https://example.com/page')).cached,true);
});
test('connection tests share translation slots and are not canceled by another tab',async()=>{
  const w=worker();await w.context.setReader(1,'https://example.com/page','running');
  const a=w.context.translate({...request,hold:true},1,'https://example.com/page');
  const b=w.context.translate({...request,hold:true},1,'https://example.com/page').catch(e=>e);
  await until(()=>w.held.size===2);
  const probe=w.context.testProvider();
  await new Promise(r=>setTimeout(r,20));
  assert.equal(w.calls.filter(c=>c.type==='provider-test').length,0);
  w.held.values().next().value();await a;
  await until(()=>w.calls.some(c=>c.type==='provider-test'));
  assert.equal(w.held.size,2);
  await w.context.cancelTab(1);assert.match((await b).message,/중지/);
  assert.equal(w.held.size,1,'tab cancellation preserves the settings probe');
  w.held.values().next().value();await probe;
});
test('older installed hosts receive only one translation at a time',async()=>{
  const w=worker(null);await w.context.setReader(1,'https://example.com/page','running');
  const a=w.context.translate({...request,hold:true},1,'https://example.com/page');
  const b=w.context.translate({...request,hold:true,before:'other'},1,'https://example.com/page');
  await until(()=>w.held.size===1);
  await new Promise(r=>setTimeout(r,20));
  assert.equal(w.calls.filter(c=>c.type==='translate').length,1);
  w.held.values().next().value();await a;
  await until(()=>w.calls.filter(c=>c.type==='translate').length===2);
  assert.equal(w.held.size,1);w.held.values().next().value();await b;
});
test('four slots cover multiple tabs and probes without dispatching canceled queued work',async()=>{
  const w=worker(4);
  for(const id of [1,2])await w.context.setReader(id,'https://example.com/page','running');
  const jobs=[1,1,2,2].map((tabId,index)=>w.context.translate({...request,hold:true,before:String(index)},tabId,'https://example.com/page').catch(e=>e));
  await until(()=>w.held.size===4);
  const queued=w.context.translate({...request,hold:true,before:'queued'},1,'https://example.com/page').catch(e=>e);
  const probe=w.context.testProvider();
  await new Promise(r=>setTimeout(r,20));
  assert.equal(w.calls.filter(c=>c.type==='translate').length,4);
  assert.equal(w.calls.filter(c=>c.type==='provider-test').length,0);
  await w.context.cancelTab(1);
  for(const job of [jobs[0],jobs[1],queued])assert.match((await job).message,/중지/);
  await until(()=>w.calls.some(c=>c.type==='provider-test'));
  assert.equal(w.held.size,3,'other tab and probe survive');
  for(const finish of [...w.held.values()])finish();
  await Promise.all([...jobs,probe]);
  assert.equal(w.calls.filter(c=>c.type==='translate').length,4);
});
test('provider change drains four active jobs and rejects queued jobs',async()=>{
  const w=worker(4);await w.context.setReader(1,'https://example.com/page','running');
  const jobs=Array.from({length:6},(_,index)=>w.context.translate({...request,hold:true,before:String(index)},1,'https://example.com/page').catch(e=>e));
  await until(()=>w.held.size===4);
  await w.context.saveProvider({provider:'openai'});
  for(const result of await Promise.all(jobs))assert.match(result.message,/중지/);
  assert.equal(w.calls.filter(c=>c.type==='translate').length,4);assert.equal(w.held.size,0);
  assert(w.events.lastIndexOf('canceled-translation-finished')<w.events.indexOf('settings-save'));
});
test('clearing translation cache preserves the saved toolbar corner',async()=>{
  const w=worker();
  Object.assign(w.local,{'toolbar-corner':'top-left','page:test':{result:{blocks:[]}}});
  const reply=await new Promise(resolve=>w.callbacks.message({type:'clear-cache'},{id:'test',url:'chrome-extension://test/options.html'},resolve));
  assert.equal(reply.ok,true);assert.equal(w.local['toolbar-corner'],'top-left');assert.equal(w.local['page:test'],undefined);
});
