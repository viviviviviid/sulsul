import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
const source=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
const request={blocks:[{id:'b0',parts:[{id:'t0',text:'Read easily.',locked:false}]}]};
function worker(){
  const callbacks={},events=[],sessions={},local={},calls=[];
  const event=name=>({addListener(fn){callbacks[name]=fn;}});
  const storage=data=>({async get(key){return key===null?{...data}:{[key]:data[key]};},async set(value){Object.assign(data,value);},async remove(key){for(const k of [].concat(key))delete data[k];},async clear(){for(const k of Object.keys(data))delete data[k];}});
  let scope='first',sequence=0,held;
  const port={onMessage:event('nativeMessage'),onDisconnect:event('disconnect'),postMessage(message){
    calls.push(message);events.push(message.type);
    const answer=result=>queueMicrotask(()=>callbacks.nativeMessage({id:message.id,ok:true,result}));
    if(message.type==='settings-get')answer({scope});
    else if(message.type==='translate'){
      sequence++;
      if(message.data.hold)held=()=>{events.push('canceled-translation-finished');answer({blocks:[]});};
      else answer({blocks:[],sequence});
    }else if(message.type==='cancel'){answer({});setTimeout(()=>held?.(),20);}
    else if(message.type==='settings-save'){scope='second';answer({scope});}
  }};
  const context=vm.createContext({URL,crypto:webcrypto,setTimeout,clearTimeout,TextEncoder,chrome:{
    runtime:{id:'test',getURL:()=> 'chrome-extension://test/',connectNative:()=>port,onMessage:event('message')},
    storage:{local:storage(local),session:storage(sessions)},
    tabs:{async get(){return {url:'https://example.com/page'};},async sendMessage(id,msg){events.push(msg.type);},onUpdated:event('updated'),onRemoved:event('removed')},
    commands:{onCommand:event('command')}
  }});
  vm.runInContext(source,context);
  return {context,sessions,local,calls,events,callbacks};
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
