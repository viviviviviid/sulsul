import {createRequire} from 'node:module';
import os from 'node:os';
import {mkdtempSync} from 'node:fs';
const scratch=mkdtempSync(path.join(os.tmpdir(),'sulsul-browser-'));
import {readFileSync,writeFileSync,mkdirSync,cpSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const {chromium}=createRequire(import.meta.url)('playwright');
const ext=path.join(scratch,'general-extension');
mkdirSync(ext,{recursive:true});cpSync('extension',ext,{recursive:true});
const manifest=JSON.parse(readFileSync(path.join(ext,'manifest.json'),'utf8'));
manifest.host_permissions=['https://feed.test/*'];
writeFileSync(path.join(ext,'manifest.json'),JSON.stringify(manifest,null,2));
writeFileSync(path.join(ext,'background.js'),readFileSync(path.join(ext,'background.js'),'utf8')+`
globalThis.qaCalls=[];
globalThis.qaHold=false;
globalThis.qaHeld=new Map();
globalThis.qaRelease=()=>{for(const task of qaHeld.values())task.resolve();qaHeld.clear();};
globalThis.qaMaxActive=0;
globalThis.qaMalformed=false;
native=async(type,data,tabId,sourceUrl,scope,requestId)=>{
 if(type==='settings-get')return {selected:'codex',maxConcurrentTranslations:4};
 if(type==='cancel'){for(const id of data?.ids || qaHeld.keys()){const task=qaHeld.get(id);if(task){qaHeld.delete(id);task.reject(new Error('번역을 중지했습니다.'));}}return {};}
 if(type!=='translate')return {};
 qaCalls.push({data,tabId,sourceUrl});
 if(qaMalformed)return {blocks:[]};
 const result={blocks:data.blocks.map(b=>({id:b.id,parts:b.parts.filter(p=>!p.locked).map(p=>({id:p.id,text:'번역: '+p.text}))}))};
 if(qaHold)await new Promise((resolve,reject)=>{qaHeld.set(requestId,{resolve:()=>{qaHeld.delete(requestId);resolve();},reject});qaMaxActive=Math.max(qaMaxActive,qaHeld.size);});
 return result;
};
`);
const context=await chromium.launchPersistentContext(path.join(scratch,'general-profile-'+Date.now()),{channel:'chromium',headless:true,viewport:{width:1280,height:1000},args:['--disable-extensions-except='+ext,'--load-extension='+ext]});

const prose='This paragraph explains how messages are verified and executed across different networks. Readers need the main explanation before browsing the navigation links. ';
const menus=Array.from({length:40},(_,i)=>'<a href="#">Navigation item '+i+'</a><br>').join('');
await context.route('https://feed.test/**',r=>r.fulfill({contentType:'text/html',body:'<style>body{margin:0}nav{position:fixed;width:200px}#body{margin-left:250px;width:650px}p{height:80px;margin:0}</style><nav>'+menus+'</nav><div id="body"><h1>Documentation title</h1>'+Array.from({length:18},()=>'<p>'+prose+'</p>').join('')+'</div>'}));
const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
try {
 const page=await context.newPage();await page.goto('https://feed.test/docs');
 const id=await worker.evaluate(async()=> (await chrome.tabs.query({})).find(t=>t.url==='https://feed.test/docs').id);
 await worker.evaluate(id=>chrome.scripting.executeScript({target:{tabId:id},files:['motion.js','content.js']}),id);
 await worker.evaluate(()=>qaHold=true);
 await worker.evaluate(id=>chrome.tabs.sendMessage(id,{type:'sulsul-toggle'}),id);
 await page.waitForTimeout(3000);
 let sources=await worker.evaluate(()=>qaCalls.flatMap(c=>c.data.blocks.flatMap(b=>b.parts.map(p=>p.text))));
 assert.ok(sources.length>0);assert.ok(sources.some(t=>t.includes('Documentation title')));
 assert.ok(sources.every(t=>!t.includes('Navigation item')),'menus must wait while main text is in flight');
 await worker.evaluate(()=>{qaHold=false;qaRelease();});
 await page.waitForFunction(()=>document.querySelector('nav a').textContent.startsWith('번역: '),null,{timeout:15000});
 assert.ok((await page.locator('#body p').first().innerText()).startsWith('번역: '));
 await page.waitForFunction(()=>[...document.querySelectorAll('nav a')].every(a=>a.textContent.startsWith('번역: ')),null,{timeout:15000});
 const navigationBatches=await worker.evaluate(()=>qaCalls.map(c=>c.data.blocks.filter(b=>b.cacheKind==='navigation').length).filter(Boolean));
 assert.ok(Math.max(...navigationBatches)>8,'short navigation labels share larger requests');
 assert.ok(navigationBatches.every(n=>n<=24),'all requests respect the host block limit');
 assert.equal(navigationBatches.reduce((a,b)=>a+b,0),40,'every navigation label is submitted once');
 console.log('PASS inferred main content before large navigation; menu eventually translated');
 await worker.evaluate(id=>chrome.tabs.sendMessage(id,{type:'sulsul-end'}),id);
 const longText='A verifier checks messages across independent networks and preserves every condition before delivery. Readers can review the explanation at their own pace while the next sections are prepared. '.repeat(2);
 await context.route('https://feed.test/large',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><style>body{margin:0}main{width:800px;margin:auto}p{height:80px;margin:0;font:16px/20px system-ui}</style><main>'+Array.from({length:200},(_,i)=>'<p id="p'+i+'">Paragraph '+i+'. '+longText+'</p>').join('')+'</main>'}));
 await worker.evaluate(()=>{qaCalls=[];qaMaxActive=0;qaHold=true;});await page.goto('https://feed.test/large');
 await worker.evaluate(id=>chrome.scripting.executeScript({target:{tabId:id},files:['motion.js','content.js']}),id);
 const command=type=>worker.evaluate(({id,type})=>chrome.tabs.sendMessage(id,{type},{frameId:0}),{id,type});
 const until=async(fn,label)=>{for(let i=0;i<160;i++){try{if(await fn())return;}catch(e){if(!/Receiving end does not exist/.test(e.message))throw e;}await page.waitForTimeout(60);}throw new Error(label);};
 await command('sulsul-start');await until(()=>worker.evaluate(()=>qaHeld.size===4),'first visible requests');
 assert.ok(await worker.evaluate(()=>qaCalls.every(c=>c.data.blocks.length<=4)),'first viewport stays small');
 await worker.evaluate(()=>qaRelease());await until(()=>worker.evaluate(()=>qaCalls.some(c=>c.data.blocks.length===12)),'nearby batch');
 assert.ok(await worker.evaluate(()=>qaCalls.filter(c=>c.data.blocks.length===12).every(c=>c.data.blocks.reduce((n,b)=>n+b.parts.reduce((n,p)=>n+p.text.length,0),0)<=5000)));
 await worker.evaluate(()=>{qaHold=false;qaRelease();});
 const settled=()=>until(async()=>{const s=await command('sulsul-state');return !s.busy&&!s.waiting&&s.translated;},'reading range settled');
 await settled();const topCalls=await worker.evaluate(()=>qaCalls.length);
 sources=await worker.evaluate(()=>qaCalls.flatMap(c=>c.data.blocks.flatMap(b=>b.parts.map(p=>p.text))));
 const indexes=sources.map(s=>Number(s.match(/Paragraph (\d+)/)[1]));assert.ok(Math.max(...indexes)<=37,'only current viewport plus two screens are sent');
 assert.ok((await command('sulsul-state')).remaining>150);assert.match((await command('sulsul-state')).message,/읽는 범위/);
 await page.waitForTimeout(3500);assert.equal(await worker.evaluate(()=>qaCalls.length),topCalls,'distant source never trickles into idle requests');
 assert.equal(await page.locator('#p100').textContent(),'Paragraph 100. '+longText);
 await worker.evaluate(()=>qaHold=true);await page.locator('#p170').scrollIntoViewIfNeeded();
 await until(()=>worker.evaluate(n=>qaCalls.length>n,topCalls),'new viewport request');
 const next=await worker.evaluate(n=>qaCalls[n].data.blocks,topCalls);assert.ok(next.some(b=>b.parts.some(p=>p.text.includes('Paragraph 170.'))));assert.ok(next.length<=8);
 // Switching tabs stops dispatch, while already-submitted results are retained.
 // Headless Chromium reports every tab visible. Emulate its visibility signal in the isolated world.
 const visibility=hidden=>worker.evaluate(({id,hidden})=>chrome.scripting.executeScript({target:{tabId:id},func:hidden=>{
   Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
   Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>hidden?'hidden':'visible'});
   document.dispatchEvent(new Event('visibilitychange'));
 },args:[hidden]}),{id,hidden});
 await visibility(true);
 const hiddenCalls=await worker.evaluate(()=>qaCalls.length);await worker.evaluate(()=>qaRelease());
 await until(async()=>!(await command('sulsul-state')).busy,'in-flight work drains in background');
 await page.waitForTimeout(3500);assert.equal(await worker.evaluate(()=>qaCalls.length),hiddenCalls,'hidden tabs do not dispatch more work');
 assert.ok((await page.locator('#p170').innerText()).startsWith('번역: '),'already-submitted translations still apply');
 await page.evaluate(()=>scrollTo(0,8000));await page.waitForTimeout(700);assert.equal(await worker.evaluate(()=>qaCalls.length),hiddenCalls);
 await worker.evaluate(()=>qaHold=false);await visibility(false);await until(async()=>(await page.locator('#p100').innerText()).startsWith('번역: '),'visible tab resumes');await settled();
 assert.ok((await page.locator('#p100').innerText()).startsWith('번역: '),'returning to the tab resumes the current reading range');
 const all=await worker.evaluate(()=>qaCalls.flatMap(c=>c.data.blocks.map(b=>b.id)));assert.equal(new Set(all).size,all.length,'no duplicate submissions across scroll and tab switches');assert.ok(all.length<200);
 assert.ok(await worker.evaluate(()=>qaCalls.every(c=>c.data.blocks.length<=24&&c.data.blocks.reduce((n,b)=>n+b.parts.reduce((n,p)=>n+p.text.length,0),0)<=12000)));
 await visibility(true);const drained=await worker.evaluate(()=>qaCalls.length);await page.evaluate(()=>scrollTo(0,12000));await page.waitForTimeout(700);assert.equal(await worker.evaluate(()=>qaCalls.length),drained,'hidden idle reader stays silent');
 await page.evaluate(()=>scrollTo(0,0));await visibility(false);
 const beforeReturn=await worker.evaluate(()=>qaCalls.length);await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(1000);await settled();assert.equal(await worker.evaluate(()=>qaCalls.length),beforeReturn,'return to translated range makes no AI call');
 await page.reload();await settled();assert.equal(await worker.evaluate(()=>qaCalls.length),beforeReturn,'refresh reuses cached reading range');
 console.log('PASS viewport + two-screen horizon, idle restraint, scroll priority, hidden tab drain/resume and cache reuse without duplicate submissions');

} finally {await context.close();}
