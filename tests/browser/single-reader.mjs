import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {chromium} from 'playwright';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'sulsul-single-')),ext=path.join(root,'extension');fs.cpSync('extension',ext,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(ext,'manifest.json'),'utf8'));manifest.host_permissions=['https://single.test/*'];fs.writeFileSync(path.join(ext,'manifest.json'),JSON.stringify(manifest));
fs.appendFileSync(path.join(ext,'background.js'),`
globalThis.qaStart=tab=>handleContextMenu({menuItemId:'sulsul-start'},tab);
globalThis.qaCalls=[];globalThis.qaHold=true;globalThis.qaHeld=new Map();globalThis.qaCanceled=0;
native=async(type,data,tabId,sourceUrl,scope,requestId)=>{
 if(type==='health')return {provider:'codex',loginCached:true};
 if(type==='settings-get')return {selected:'codex',maxConcurrentTranslations:4,providers:{codex:{targetLanguage:'ko'}}};
 if(type==='cancel'){for(const id of data?.ids||qaHeld.keys()){const task=qaHeld.get(id);if(task){qaCanceled++;qaHeld.delete(id);task.reject(new Error('Canceled'));}}return {};}
 if(type!=='translate')return {};
 qaCalls.push(data.blocks.map(b=>b.parts.map(p=>p.text).join('')));
 if(qaHold)await new Promise((resolve,reject)=>qaHeld.set(requestId,{resolve,reject}));
 return {blocks:data.blocks.map(b=>({id:b.id,parts:b.parts.filter(p=>!p.locked).map(p=>({id:p.id,text:'번역: '+p.text}))}))};
};
globalThis.qaRelease=()=>{qaHold=false;for(const task of qaHeld.values())task.resolve();qaHeld.clear();};
`);
const original='A verifier checks the message before the destination application receives it.';
const context=await chromium.launchPersistentContext(path.join(root,'profile'),{channel:'chromium',headless:true,args:['--disable-extensions-except='+ext,'--load-extension='+ext]});
try{
 await context.route('https://single.test/**',r=>r.fulfill({contentType:'text/html',body:r.request().url().endsWith('/frame')?'<p>Text inside an embedded frame.</p>':'<!doctype html><meta charset="utf-8"><main><p>'+original+'</p></main><iframe src="/frame"></iframe>'}));
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),page=await context.newPage();await page.goto('https://single.test/article');
 const tab=await worker.evaluate(async()=>(await chrome.tabs.query({})).find(t=>t.url==='https://single.test/article'));
 const command=type=>worker.evaluate(({id,type})=>chrome.tabs.sendMessage(id,{type},{frameId:0}),{id:tab.id,type});
 const menu=()=>worker.evaluate(tab=>qaStart(tab),tab);
 const count=()=>worker.evaluate(()=>qaCalls.length);
 const isolated=async op=>(await worker.evaluate(async({id,op})=>chrome.scripting.executeScript({target:{tabId:id},func:op=>{
  if(op==='remember'){globalThis.qaFirstReader=__sulsul;globalThis.qaFirstBar=document.querySelector('[data-sulsul-ui]');}
  if(op==='same')return __sulsul===qaFirstReader&&document.querySelector('[data-sulsul-ui]')===qaFirstBar;
  if(op==='hide')document.querySelector('[data-sulsul-ui]')._hide.click();
  if(op==='replace'){globalThis.qaPreviousReader=__sulsul;delete globalThis.__sulsul;}
  if(op==='first-mode')return qaFirstReader.state().mode;
  if(op==='first-connected')return qaFirstBar.isConnected;
  if(op==='previous-mode')return qaPreviousReader.state().mode;
 },args:[op]}),{id:tab.id,op}))[0].result;
 async function until(fn,label){const end=Date.now()+12000;while(Date.now()<end){if(await fn())return;await page.waitForTimeout(70);}throw new Error(label);}
 const done=()=>until(async()=>{const s=await command('sulsul-state');return s.translated&&!s.busy&&!s.waiting;},'translation completed');
 await Promise.all(Array.from({length:12},menu));await until(async()=>await count()===1,'first request held');
 assert.equal(await page.locator('[data-sulsul-ui]').count(),1);
 await isolated('remember');
 await worker.evaluate(id=>chrome.scripting.executeScript({target:{tabId:id,allFrames:true},files:['motion.js','content.js']}),tab.id);
 assert.equal(await page.frames()[1].locator('[data-sulsul-ui]').count(),0,'embedded frames do not start another reader');
 const popup=await context.newPage();await popup.addInitScript(tab=>{chrome.tabs.query=async()=>[tab];},tab);
 await popup.goto('chrome-extension://'+new URL(worker.url()).host+'/popup.html');await popup.locator('#translate:not([disabled])').waitFor();await popup.close();
 await Promise.all(Array.from({length:8},menu));await page.waitForTimeout(1200);
 assert.equal(await count(),1,'menu, popup and reinjection do not duplicate a held request');
 assert.equal(await isolated('same'),true);
 await isolated('hide');
 assert.equal(await page.locator('[data-sulsul-ui][data-concealed]').count(),1);await menu();
 assert.equal(await page.locator('[data-sulsul-ui][data-concealed]').count(),0,'start reveals the same concealed toolbar');
 await page.locator('[data-sulsul-ui]').evaluate(el=>document.body.append(el.cloneNode(true)));
 await until(async()=>await page.locator('[data-sulsul-ui]').count()===1,'orphan toolbar removed');
 assert.equal(await count(),1);await worker.evaluate(()=>qaRelease());await done();
 console.log('PASS repeated menu starts, popup, reinjection, iframe and hide/reveal keep one reader and one request');

 const baseline=await count();
 // Simulate a new isolated context attaching while the old closure still owns DOM/listeners.
 await isolated('replace');
 await worker.evaluate(id=>chrome.scripting.executeScript({target:{tabId:id},files:['motion.js','content.js']}),tab.id);await done();
 assert.equal(await isolated('first-mode'), 'off','previous reader retired');
 assert.equal(await isolated('first-connected'),false,'previous toolbar removed');
 assert.equal(await page.locator('[data-sulsul-ui]').count(),1);
 assert.equal(await page.locator('main p').innerText(),'번역: '+original,'new context uses the restored original, not translated output');
 assert.equal(await count(),baseline,'replacement reuses cached translation');
 await command('sulsul-restore');assert.equal(await page.locator('main p').innerText(),original);
 await menu();await done();await Promise.all(Array.from({length:8},menu));await page.waitForTimeout(3600);
 assert.equal(await count(),baseline,'idle and completed restarts make no extra AI calls');
 console.log('PASS a replaced context restores provenance, retires its predecessor and reuses cached results');

 await worker.evaluate(()=>qaHold=true);
 await page.locator('main p').evaluate(el=>el.textContent='Another original paragraph arrives while the reader is already active.');
 await until(async()=>await worker.evaluate(()=>qaHeld.size)===1,'new request held');
 await isolated('replace');
 await worker.evaluate(id=>chrome.scripting.executeScript({target:{tabId:id},files:['motion.js','content.js']}),tab.id);
 await until(async()=>await worker.evaluate(()=>qaCanceled)===1,'old in-flight request canceled');
 assert.equal(await isolated('previous-mode'),'off');
 await worker.evaluate(()=>qaRelease());await done();
 assert.equal(await page.locator('[data-sulsul-ui]').count(),1);const settled=await count();await page.waitForTimeout(3500);assert.equal(await count(),settled);
 await command('sulsul-end');assert.equal(await page.locator('[data-sulsul-ui]').count(),0);await page.waitForTimeout(1000);assert.equal(await page.locator('[data-sulsul-ui]').count(),0,'retired reader cannot recreate its toolbar');
 console.log('PASS replacement cancels old in-flight work and ending removes the only toolbar');
}finally{await context.close();}
