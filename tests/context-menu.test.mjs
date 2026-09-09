import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
function worker(menus=new Map(), activeTab=null, shortcut='Alt+Shift+S') {
  const callbacks={},injected=[],sent=[];
  let settingsOpened=0;
  const event=name=>({addListener(fn){callbacks[name]=fn;}});
  const context=vm.createContext({URL,console,chrome:{
    runtime:{onMessage:event('message'),onInstalled:event('installed'),onStartup:event('startup'),async openOptionsPage(){settingsOpened++;}},
    contextMenus:{onClicked:event('menu'),removeAll(done){setTimeout(()=>{menus.clear();done();},0);},create(item,done){
      assert.equal(menus.has(item.id),false,'duplicate menu id');
      if(item.parentId)assert.ok(menus.has(item.parentId),'parent must be registered first');
      menus.set(item.id,JSON.parse(JSON.stringify(item)));queueMicrotask(done);return item.id;
    }},
    tabs:{onRemoved:event('removed'),onUpdated:event('updated'),async query(){if(activeTab)return [activeTab];assert.fail('context click must use the clicked tab');},async sendMessage(id,message,options){sent.push({id,type:message.type,frameId:options.frameId});}},
    scripting:{async executeScript(args){injected.push(JSON.parse(JSON.stringify(args)));}},
    commands:{onCommand:event('command'),async getAll(){return [{name:'start-reading',shortcut}]}}
  }});
  vm.runInContext(source,context);
  return {callbacks,menus,injected,sent,get settingsOpened(){return settingsOpened;}};
}

test('context menus install once, rebuild without duplicates, and survive worker restarts',async()=>{
  const w=worker();
  await Promise.all([w.callbacks.installed(),w.callbacks.startup()]);
  assert.equal(w.menus.size,1);
  assert.equal(w.menus.get('sulsul-start').title,'술술 번역 (Alt+Shift+S)');
  assert.equal(w.menus.get('sulsul-start').parentId,undefined);
  for(const item of w.menus.values()){
    assert.deepEqual(item.documentUrlPatterns,['http://*/*','https://*/*']);
    assert.deepEqual(item.contexts,['all']);
  }
  const restarted=worker(w.menus);
  assert.equal(restarted.menus.size,1);
  await restarted.callbacks.startup();
  assert.equal(restarted.menus.size,1);
});

test('the single translation menu targets the clicked webpage main frame',async()=>{
  const w=worker(),tab={id:0,url:'https://example.com/page'};
  for(const type of ['sulsul-start']){
    await w.callbacks.menu({menuItemId:type,linkUrl:'https://other.example/link',frameId:12},tab);
    assert.deepEqual(w.sent.at(-1),{id:0,type,frameId:0});
  }
  assert.equal(w.injected.length,1);
  assert.deepEqual(w.injected[0],{target:{tabId:0},files:['content.js']});
  await w.callbacks.menu({menuItemId:'sulsul-settings'});
  assert.equal(w.settingsOpened,0);
  for(const item of [{id:7,url:'chrome://extensions/'},{id:8,url:'file:///example.html'},undefined]){
    await w.callbacks.menu({menuItemId:'sulsul-start'},item);
  }
  await w.callbacks.menu({menuItemId:'unknown'},tab);
  assert.equal(w.injected.length,1);
});

test('Alt Shift S starts reading and preserves the existing toggle shortcut',async()=>{
 const w=worker(new Map(),{id:42,url:'https://example.com/article'});
 await w.callbacks.command('start-reading');
 assert.equal(w.sent.at(-1).type,'sulsul-start');
 await w.callbacks.command('toggle-reading');
 assert.equal(w.sent.at(-1).type,'sulsul-toggle');
 const manifest=JSON.parse(readFileSync(new URL('../extension/manifest.json',import.meta.url),'utf8'));
 assert.equal(manifest.commands['start-reading'].suggested_key,undefined,'new installs choose their shortcut explicitly');
});

test('menu shows the actual assignment or an unassigned hint',async()=>{
 for(const shortcut of ['', 'Ctrl+Shift+Y']){
  const w=worker(new Map(),null,shortcut);await w.callbacks.installed();
  assert.equal(w.menus.get('sulsul-start').title,shortcut ? '술술 번역 ('+shortcut+')' : '술술 번역 (단축키 미설정)');
 }
});
