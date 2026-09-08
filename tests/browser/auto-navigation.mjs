import {createRequire} from 'node:module';
import os from 'node:os';
import {mkdtempSync} from 'node:fs';
const scratch=mkdtempSync(path.join(os.tmpdir(),'sulsul-browser-'));
import {readFileSync,writeFileSync,mkdirSync,cpSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const {chromium}=createRequire(import.meta.url)('playwright');
const ext=path.join(scratch,'auto-extension');
mkdirSync(ext,{recursive:true});cpSync('extension',ext,{recursive:true});
const manifest=JSON.parse(readFileSync(path.join(ext,'manifest.json'),'utf8'));
manifest.host_permissions=['https://reader.test/*','https://another.test/*'];
writeFileSync(path.join(ext,'manifest.json'),JSON.stringify(manifest,null,2));
// Only replace the native AI boundary; run the actual service worker, storage and content script.
writeFileSync(path.join(ext,'background.js'),readFileSync(path.join(ext,'background.js'),'utf8')+`
globalThis.qaCalls=[];
globalThis.qaHold=false;
globalThis.qaHeld=new Map();
globalThis.qaRelease=()=>{for(const task of qaHeld.values())task.resolve();qaHeld.clear();};
globalThis.qaMaxActive=0;
native=async(type,data,tabId,sourceUrl,scope,requestId)=>{
 if(type==='settings-get')return {selected:'codex',maxConcurrentTranslations:2};
 if(type==='cancel'){for(const id of data?.ids || qaHeld.keys()){const task=qaHeld.get(id);if(task){qaHeld.delete(id);task.reject(new Error('번역을 중지했습니다.'));}}return {};}
  if(type!=='translate')return {};
  qaCalls.push({data,tabId,sourceUrl});
  const result={blocks:data.blocks.map(b=>({id:b.id,parts:b.parts.filter(p=>!p.locked).map(p=>({id:p.id,text:'쉬운 한국어: '+p.text}))}))};
  if(qaHold)await new Promise((resolve,reject)=>{qaHeld.set(requestId,{resolve:()=>{qaHeld.delete(requestId);resolve();},reject});qaMaxActive=Math.max(qaMaxActive,qaHeld.size);});
  return result;
};
`);
const context=await chromium.launchPersistentContext(path.join(scratch,'auto-profile-'+Date.now()),{channel:'chromium',headless:true,viewport:{width:1280,height:850},args:['--disable-extensions-except='+ext,'--load-extension='+ext]});
const fixture=name=>`<!doctype html><html><head><title>${name}</title><style>body{font:18px/1.8 system-ui;padding:60px;max-width:850px}a{display:block}</style></head><body><nav>Navigation stays English.</nav><main><h1>${name} document</h1><p>A verifier checks the message before the destination application receives it. Every important condition stays in place.</p><p>Call <code>lzReceive()</code> after <a href="#section">verification</a> is complete.</p><pre>const neverTranslate = true;</pre></main><a id="next" href="/second">Next page</a><a id="third" href="/third">Third page</a><a id="away" href="https://another.test/elsewhere">Another site</a></body></html>`;
await context.route('https://reader.test/**',route=>route.fulfill({contentType:'text/html',body:fixture(new URL(route.request().url()).pathname.slice(1))}));
await context.route('https://another.test/**',route=>route.fulfill({contentType:'text/html',body:fixture('Other site')}));
const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
const page=await context.newPage();
let tabId;
const command=type=>worker.evaluate(({id,type})=>chrome.tabs.sendMessage(id,{type}),{id:tabId,type});
const state=()=>command('sulsul-state');
const count=()=>worker.evaluate(()=>qaCalls.length);
const isolated=op=>worker.evaluate(async({id,op})=>(await chrome.scripting.executeScript({target:{tabId:id},func:op=>{const bar=document.querySelector('[data-sulsul-ui]');if(op==='label')return bar._actionText.textContent;if(op==='action')bar._action.click();if(op==='end')bar._end.click();},args:[op]}))[0].result,{id:tabId,op});
async function until(predicate,label,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){try{if(await predicate())return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error('Timed out: '+label+' '+JSON.stringify(await state().catch(()=>null)));}
async function done(){await until(async()=>{const s=await state();return s.translated&&!s.busy&&!s.waiting;},'translation');}
try {
  await page.goto('https://reader.test/first',{waitUntil:'load'});
  tabId=await worker.evaluate(async()=> (await chrome.tabs.query({})).find(t=>t.url==='https://reader.test/first').id);
  await worker.evaluate(id=>chrome.scripting.executeScript({target:{tabId:id},files:['content.js']}),tabId);
  assert.equal((await state()).mode,'off');
  assert.equal(await count(),0);
  await command('sulsul-toggle');await done();
  assert.equal(await page.locator('code').innerText(),'lzReceive()');
  assert.equal(await page.locator('nav').innerText(),'쉬운 한국어: Navigation stays English.');
  assert.equal(await isolated('label'),'일시중지');
  const n=await count();
  await page.locator('#next').click();await done();
  assert.ok((await count())>n);
  assert.match(await page.locator('h1').innerText(),/쉬운 한국어: second document/);
  console.log('PASS full document navigation automatically translates and restores toolbar');

  const secondCount=await count();
  await page.reload();await done();
  assert.equal(await count(),secondCount,'reload reuses translation cache');
  const beforeHash=await count();
  await page.evaluate(()=>location.hash='section');
  await page.waitForTimeout(1000);
  assert.equal(await count(),beforeHash);
  assert.equal((await state()).translated,true);
  console.log('PASS refresh uses cache; section anchors preserve translation');

  await page.goBack({waitUntil:'load'}); // Undo the section anchor first.
  await page.goBack({waitUntil:'load'});await done();
  assert.match(await page.locator('h1').innerText(),/쉬운 한국어: first document/);
  await page.goForward({waitUntil:'load'});await done();
  assert.match(await page.locator('h1').innerText(),/쉬운 한국어: second document/);
  console.log('PASS back and forward keep automatic reading');

  const beforeSpa=await count();
  await page.evaluate(()=>{history.pushState({},'','/spa');setTimeout(()=>{document.querySelector('main').innerHTML='<h1>SPA document</h1><p>This content arrives after a delayed client-side navigation. The reader must wait until this actual new page has been rendered before translating.</p>';},1600);});
  await page.waitForTimeout(1100);
  assert.equal(await count(),beforeSpa,'old document is not translated while next page is loading');
  await done();assert.match(await page.locator('h1').innerText(),/쉬운 한국어: SPA document/);
  console.log('PASS delayed SPA navigation waits for the new document');

  await isolated('action');
  await until(async()=> (await state()).mode==='paused','pause');
  assert.match(await page.locator('h1').innerText(),/쉬운 한국어/);
  const pausedCount=await count();
  await page.goto('https://reader.test/paused',{waitUntil:'load'});
  await until(async()=> (await state()).mode==='paused','paused after navigation');
  await page.waitForTimeout(1200);
  assert.equal(await count(),pausedCount);
  assert.equal(await page.locator('h1').innerText(),'paused document');
  assert.equal(await isolated('label'),'이어 읽기');
  await isolated('action');await done();
  console.log('PASS pause survives navigation, keeps current translations, and resume works');

  await isolated('end');
  await until(async()=>!(await worker.evaluate(id=>chrome.storage.session.get('reader:'+id),tabId))['reader:'+tabId],'session removed');
  assert.equal(await page.locator('h1').innerText(),'paused document');
  assert.equal(await page.locator('[data-sulsul-ui]').count(),0);
  const endedCount=await count();
  await page.goto('https://reader.test/ended',{waitUntil:'load'});
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('[data-sulsul-ui]').count(),0);
  assert.equal(await count(),endedCount);
  console.log('PASS exit restores originals, closes toolbar, and disables the next page');

  await worker.evaluate(id=>chrome.scripting.executeScript({target:{tabId:id},files:['content.js']}),tabId);
  await worker.evaluate(()=>qaHold=true);
  await command('sulsul-toggle');await until(async()=> (await state()).busy,'pending translation');
  await until(async()=> await count()>endedCount,'native pending');
  await command('sulsul-stop');
  await worker.evaluate(()=>{qaHold=false;qaRelease();});
  await page.waitForTimeout(300);
  assert.equal(await page.locator('h1').innerText(),'ended document');
  assert.equal((await state()).mode,'paused');
  console.log('PASS pause ignores a late AI response');
  await command('sulsul-toggle');await done();
  await page.screenshot({path:path.join(scratch,'auto-reading-wide.png')});
  await page.setViewportSize({width:375,height:720});
  const box=await page.locator('[data-sulsul-ui]').boundingBox();
  assert.ok(box.x>=0&&box.x+box.width<=375,'toolbar fits a narrow window');
  await page.screenshot({path:path.join(scratch,'auto-reading-narrow.png')});
  await page.setViewportSize({width:1280,height:850});

  const other=await context.newPage();
  await other.goto('https://reader.test/unstarted',{waitUntil:'load'});
  await other.waitForTimeout(1000);
  assert.equal(await other.locator('[data-sulsul-ui]').count(),0);
  await other.close();
  await page.locator('#away').click();
  await until(async()=> !(await worker.evaluate(id=>chrome.storage.session.get('reader:'+id),tabId))['reader:'+tabId],'other origin ends session');
  assert.equal(await page.locator('[data-sulsul-ui]').count(),0);
  console.log('PASS reader is scoped to its tab and origin');

}finally{await context.close();}
