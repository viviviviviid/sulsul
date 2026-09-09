import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {chromium} from 'playwright';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'sulsul-completion-')),ext=path.join(root,'extension');fs.cpSync('extension',ext,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(ext,'manifest.json'),'utf8'));manifest.host_permissions=['https://completion.test/*'];fs.writeFileSync(path.join(ext,'manifest.json'),JSON.stringify(manifest));
fs.appendFileSync(path.join(ext,'background.js'),`
globalThis.qaCalls=[];globalThis.qaUnchanged=true;globalThis.qaHold=false;globalThis.qaRelease=null;
native=async(type,data)=>{
 if(type==='settings-get')return {selected:'codex',maxConcurrentTranslations:4,providers:{codex:{targetLanguage:'ko'}}};
 if(type!=='translate')return {};
 qaCalls.push(data.blocks.map(b=>b.parts.map(p=>p.text).join('')));
 if(qaHold)await new Promise(resolve=>{qaRelease=resolve;});
 return {blocks:data.blocks.map(b=>({id:b.id,parts:b.parts.filter(p=>!p.locked).map(p=>({id:p.id,text:qaUnchanged&&p.text.startsWith('The Routescan')?p.text:'번역: '+p.text}))}))};
};`);
const quote='The Routescan AI Agent now connects our native explorer APIs with GeckoTerminal and Moralis to give you an all-in-one on-chain terminal inside the explorer.';
const fixture=`<!doctype html><meta charset="utf-8"><style>.late{opacity:0}body{font:18px system-ui;padding:30px}article{margin:20px}</style><main><article><div dir="auto"><span id="first">An earlier post is ready to read.</span></div></article><article class="late"><div dir="auto"><span id="late">A later reply appears after the first response.</span></div></article></main><script>
const observer=new MutationObserver(()=>{if(document.querySelector('#first').textContent.startsWith('번역:')){observer.disconnect();setTimeout(()=>document.styleSheets[0].cssRules[0].style.opacity='1',100);}});observer.observe(document.querySelector('#first'),{subtree:true,characterData:true});
</script>`;
const context=await chromium.launchPersistentContext(path.join(root,'profile'),{channel:'chromium',headless:true,args:['--disable-extensions-except='+ext,'--load-extension='+ext]});
try{
 await context.route('https://completion.test/**',route=>route.fulfill({contentType:'text/html',body:route.request().url().endsWith('/unchanged')?'<main><article><div dir="auto"><span id="reply">'+quote+'</span></div></article></main>':fixture}));
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),page=await context.newPage();let tabId;
 const command=type=>worker.evaluate(({tabId,type})=>chrome.tabs.sendMessage(tabId,{type}),{tabId,type});
 const count=()=>worker.evaluate(()=>qaCalls.length);
 async function until(fn,label){const end=Date.now()+12000;while(Date.now()<end){if(await fn())return;await page.waitForTimeout(50);}throw new Error(label);}
 async function start(url){await page.goto(url);tabId=await worker.evaluate(async url=>(await chrome.tabs.query({})).find(t=>t.url===url).id,url);await worker.evaluate(tabId=>chrome.scripting.executeScript({target:{tabId},files:['content.js']}),tabId);await command('sulsul-start');}
 await start('https://completion.test/late');
 await until(async()=>{const s=await command('sulsul-state');return s.translated&&!s.busy&&!s.waiting;},'completion');
 assert.match(await page.locator('#late').innerText(),/^번역:/,'completion scan includes CSSOM-revealed reply before done');
 assert.equal(await count(),2);const baseline=await count();await page.waitForTimeout(3500);assert.equal(await count(),baseline,'audit never repeats translated input');
 console.log('PASS final scan catches later visible div/span replies before completion, without idle requests');
 await command('sulsul-end');await start('https://completion.test/unchanged');
 await until(async()=>{const s=await command('sulsul-state');return s.skipped===1&&!s.busy;},'unchanged warning');
 assert.equal((await command('sulsul-state')).complete,0);assert.equal(await count()-baseline,2,'one original call plus exactly one repair');
 assert.equal(await page.locator('#reply').innerText(),quote);assert.equal(await page.locator('[data-sulsul-issue]').count(),1);
 const stopped=await count();await page.waitForTimeout(3700);assert.equal(await count(),stopped,'periodic scan does not retry unresolved prose');
 assert.equal(await page.locator('[data-sulsul-issue]').count(),1,'warning survives scan');
 await worker.evaluate(()=>qaUnchanged=false);
 await worker.evaluate(tabId=>chrome.scripting.executeScript({target:{tabId},func:()=>document.querySelector('[data-sulsul-issue]')._detail.querySelector('button').click()}),tabId);
 await until(async()=>{const s=await command('sulsul-state');return s.translated&&!s.busy;},'manual retry');
 assert.match(await page.locator('#reply').innerText(),/^번역:/);assert.equal(await page.locator('[data-sulsul-issue]').count(),0);
 assert.equal(await count(),stopped+1);await command('sulsul-restore');assert.equal(await page.locator('#reply').innerText(),quote);
 console.log('PASS unchanged prose gets one repair, persistent warning, no request loop and explicit retry');
 await command('sulsul-end');await worker.evaluate(()=>qaHold=true);
 const beforeRebuild=await count();await start('https://completion.test/rebuilt');
 await until(async()=>await count()>beforeRebuild,'held request');
 await page.locator('#first').evaluate(el=>{el.innerHTML=el.innerHTML;});
 await worker.evaluate(()=>{qaHold=false;qaRelease();});
 await until(async()=>{const s=await command('sulsul-state');return !s.busy&&!s.waiting;},'rebuilt completion');
 assert.match(await page.locator('#first').innerText(),/^번역:/,'same original text rebuilt during request must not remain skipped');
 assert.equal(await count()-beforeRebuild,2,'only the first post and newly visible reply call AI; rebinding uses cache');
 const rebuiltCalls=await count();await page.waitForTimeout(3500);assert.equal(await count(),rebuiltCalls,'rebound original uses returned cached result without a loop');
 console.log('PASS original text-node replacement during a request recovers from cache before completion');
}finally{await context.close();}
