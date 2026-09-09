import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {chromium} from 'playwright';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'sulsul-motion-')),ext=path.join(root,'extension');fs.cpSync('extension',ext,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(ext,'manifest.json'),'utf8'));manifest.host_permissions=['https://motion.test/*'];fs.writeFileSync(path.join(ext,'manifest.json'),JSON.stringify(manifest));
fs.appendFileSync(path.join(ext,'background.js'),`
globalThis.qaCalls=0;globalThis.qaSaves=0;globalThis.qaCancels=0;globalThis.qaHeld=new Map();native=async(type,data,tabId,url,scope,id)=>{
 if(type==='settings-get')return {selected:'codex',maxConcurrentTranslations:4,targetLanguages:{ko:'Korean'},providers:{codex:{model:'default',targetLanguage:'ko'}}};
 if(type==='settings-save'){qaSaves++;return {};}
 if(type==='cancel'){qaCancels++;for(const key of data.ids||[]){qaHeld.get(key)?.reject(new Error('중지'));qaHeld.delete(key);}return {};}
 if(type!=='translate')return {};qaCalls++;await new Promise((resolve,reject)=>qaHeld.set(id,{resolve,reject}));qaHeld.delete(id);
 return {blocks:data.blocks.map(b=>({id:b.id,parts:b.parts.filter(p=>!p.locked).map(p=>({id:p.id,text:'번역된 문장입니다.'}))}))};};`);
const context=await chromium.launchPersistentContext(path.join(root,'profile'),{channel:'chromium',headless:true,viewport:{width:1000,height:1100},args:['--disable-extensions-except='+ext,'--load-extension='+ext]});
try{
 await context.route('https://motion.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><style>body{font:18px system-ui;padding:60px}</style><main><h1>Read at your own pace</h1><p>A calm animation tells you that your translation is being prepared.</p></main>'}));
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),extensionId=new URL(worker.url()).host;
 const options=await context.newPage();await options.goto('chrome-extension://'+extensionId+'/options.html');await options.locator('input[name="toolbar-motion"]:enabled').first().waitFor();
 assert.equal(await options.locator('input[name="toolbar-motion"]').count(),7);assert.equal(await options.locator('input[value="play"]').isChecked(),true);
 for(const id of ['play','orbit','fold','breathe','mix']){
  const shapes=await options.locator('.sulsul-motion[data-motion="'+id+'"]').evaluate(svg=>{const p=svg.querySelector('.morph-top'),a=p.getAnimations()[0],original=a.currentTime;a.pause();a.currentTime=a.effect.getTiming().duration*.03;const start=getComputedStyle(p).d;a.currentTime=a.effect.getTiming().duration*.52;const end=getComputedStyle(p).d;a.currentTime=original;a.play();return {start,end};});
  assert.notEqual(shapes.start,shapes.end,id+' actually morphs its path');
 }
 for(const id of ['orbit','mix']){
  const rotation=await options.locator('.sulsul-motion[data-motion="'+id+'"]').evaluate((svg,id)=>{const paths=[...svg.querySelectorAll('.motion-morph path')],animations=svg.getAnimations({subtree:true});const times=animations.map(a=>a.currentTime);animations.forEach(a=>{a.pause();a.currentTime=id==='orbit'?4000:12500;});const transforms=paths.map(p=>getComputedStyle(p).transform);const shapes=paths.map(p=>getComputedStyle(p).d);animations.forEach((a,i)=>{a.currentTime=times[i];a.play();});return {transforms,shapes};},id);
  assert.equal(rotation.transforms[0],rotation.transforms[1],id+' rotates both halves around one center');assert.notEqual(rotation.transforms[0],'matrix(1, 0, 0, 1, 0, 0)');assert.notEqual(rotation.shapes[0],rotation.shapes[1],'two distinct halves remain visible');
 }
 await worker.evaluate(()=>chrome.storage.local.set({'toolbar-motion':'relay'}));await options.locator('input[value="orbit"]:checked').waitFor();
 await options.reload();await options.locator('input[value="orbit"]:checked').waitFor();await options.locator('input[value="play"]').check();
 await options.locator('.motion-card').screenshot({path:path.join(root,'motion-choices.png')});
 await options.setViewportSize({width:375,height:950});assert.equal(await options.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await options.locator('.motion-card').screenshot({path:path.join(root,'motion-mobile.png')});
 const page=await context.newPage();await page.goto('https://motion.test/page');const tabId=await worker.evaluate(async()=>(await chrome.tabs.query({})).find(t=>t.url==='https://motion.test/page').id);
 await worker.evaluate(tabId=>chrome.scripting.executeScript({target:{tabId},files:['motion.js','content.js']}),tabId);
 const command=type=>worker.evaluate(({tabId,type})=>chrome.tabs.sendMessage(tabId,{type}),{tabId,type});
 const state=()=>worker.evaluate(async tabId=>(await chrome.scripting.executeScript({target:{tabId},func:()=>{const svg=document.querySelector('[data-sulsul-ui]')._motion;return {id:svg.dataset.motion,active:svg.hasAttribute('data-active'),animations:svg.getAnimations({subtree:true}).length,static:getComputedStyle(svg.querySelector('.motion-static')).display};}}))[0].result,tabId);
 const until=async fn=>{for(let i=0;i<160;i++){if(await fn())return;await page.waitForTimeout(50);}throw Error('Motion state timeout');};
 await command('sulsul-start');await until(()=>worker.evaluate(()=>qaHeld.size>0));assert.equal((await state()).id,'play');assert.equal((await state()).animations,2);
 const before=await worker.evaluate(()=>({calls:qaCalls,saves:qaSaves,cancels:qaCancels}));
 for(const id of ['orbit','fold','breathe','wave','off','mix','play']){
  await options.locator('input[value="'+id+'"]').check();await until(async()=>(await state()).id===id);
  assert.equal((await state()).animations,id==='off'?0:['orbit','mix'].includes(id)?4:2);assert.equal((await command('sulsul-state')).mode,'running');
 }
 assert.deepEqual(await worker.evaluate(()=>({calls:qaCalls,saves:qaSaves,cancels:qaCancels})),before,'motion preferences never call AI, save model settings, or cancel translations');
 await options.locator('input[value="fold"]').check();await options.reload();await options.locator('input[value="fold"]:checked').waitFor();
 await options.locator('#clear-cache').click();await until(async()=>(await options.locator('#status').innerText()).includes('지웠어요'));assert.equal(await worker.evaluate(async()=>(await chrome.storage.local.get('toolbar-motion'))['toolbar-motion']),'fold');
 await options.locator('input[value="mix"]').check();await until(async()=>(await state()).id==='mix');
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal((await state()).animations,0);assert.equal((await state()).static,'block');await page.emulateMedia({reducedMotion:'no-preference'});
 await command('sulsul-stop');assert.equal((await state()).animations,0);assert.equal((await state()).active,false);
 await command('sulsul-start');await until(()=>worker.evaluate(()=>qaHeld.size>0));await worker.evaluate(()=>{for(const pending of qaHeld.values())pending.resolve();});
 await until(async()=>{const s=await command('sulsul-state');return s.translated&&!s.busy;});assert.equal((await state()).animations,0);
 const finalCalls=await worker.evaluate(()=>qaCalls);await page.waitForTimeout(3500);assert.equal(await worker.evaluate(()=>qaCalls),finalCalls);
 console.log('PASS seven motion choices, real SVG morphs, immediate sync, persistence, cache isolation, reduced motion, stopped states and no AI side effects. Previews: '+root);
}finally{await context.close();}
