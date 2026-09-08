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
 await worker.evaluate(id=>chrome.scripting.executeScript({target:{tabId:id},files:['content.js']}),id);
 await worker.evaluate(()=>qaHold=true);
 await worker.evaluate(id=>chrome.tabs.sendMessage(id,{type:'sulsul-toggle'}),id);
 await page.waitForTimeout(3000);
 let sources=await worker.evaluate(()=>qaCalls.flatMap(c=>c.data.blocks.flatMap(b=>b.parts.map(p=>p.text))));
 assert.ok(sources.length>0);assert.ok(sources.some(t=>t.includes('Documentation title')));
 assert.ok(sources.every(t=>!t.includes('Navigation item')),'menus must wait while main text is in flight');
 await worker.evaluate(()=>{qaHold=false;qaRelease();});
 await page.waitForFunction(()=>document.querySelector('nav a').textContent.startsWith('번역: '),null,{timeout:15000});
 assert.ok((await page.locator('#body p').first().innerText()).startsWith('번역: '));
 console.log('PASS inferred main content before large navigation; menu eventually translated');
} finally {await context.close();}
