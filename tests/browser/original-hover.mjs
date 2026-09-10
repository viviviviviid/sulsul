import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {chromium} from 'playwright';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'sulsul-hover-')),ext=path.join(root,'extension');fs.cpSync('extension',ext,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(ext,'manifest.json'),'utf8'));manifest.host_permissions=['https://hover.test/*'];fs.writeFileSync(path.join(ext,'manifest.json'),JSON.stringify(manifest));
fs.appendFileSync(path.join(ext,'background.js'),`
globalThis.qaCalls=0;native=async(type,data)=>{
 if(type==='settings-get')return {selected:'codex',maxConcurrentTranslations:4,providers:{codex:{targetLanguage:'ko'}}};
 if(type!=='translate')return {};qaCalls++;
 return {blocks:data.blocks.map(b=>({id:b.id,parts:b.parts.filter(p=>!p.locked).map(p=>({id:p.id,text:'번역 '+p.text}))}))};
};`);
const context=await chromium.launchPersistentContext(path.join(root,'profile'),{channel:'chromium',headless:true,viewport:{width:1000,height:850},args:['--disable-extensions-except='+ext,'--load-extension='+ext]});
try{
 const original='Read the source link and call verify() only after verification.';
 await context.route('https://hover.test/**',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><style>body{font:18px/1.8 system-ui;padding:80px 40px}p{margin:35px 0;max-width:650px}#long{height:100px;overflow:auto}</style><main><p id="first">Read the <a href="#proof" id="link" aria-describedby="existing-description">source link</a> and call <code>verify()</code> only after verification.</p><p id="second">Another author wrote this separate paragraph.</p><div id="component"></div><p id="metadata">Matter Labs${'\u200b'.repeat(4)+'\u200c'.repeat(100)} publishes its work.</p><p id="long">${'A lengthy paragraph keeps its full original available for reference. '.repeat(50)}</p></main><script>const root=document.querySelector('#component').attachShadow({mode:'closed'});root.innerHTML='<p>A paragraph inside a closed component.</p>';window.componentRoot=root;document.querySelector('#link').addEventListener('click',()=>window.linkClicked=true);</script>`}));
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),page=await context.newPage();await page.goto('https://hover.test/article');
 const id=await worker.evaluate(async()=>(await chrome.tabs.query({})).find(t=>t.url==='https://hover.test/article').id);
 const command=type=>worker.evaluate(({id,type})=>chrome.tabs.sendMessage(id,{type},{frameId:0}),{id,type});
 const tip=()=>worker.evaluate(async id=>(await chrome.scripting.executeScript({target:{tabId:id},func:()=>{const tip=document.querySelector('[data-sulsul-original]');if(!tip)return null;const b=tip.getBoundingClientRect();return {hidden:tip.hidden,text:tip._text.textContent,x:b.x,y:b.y,width:b.width,height:b.height,scroll:tip._text.scrollHeight>tip._text.clientHeight};}}))[0].result,id);
 const until=async(fn,label)=>{for(let i=0;i<150;i++){if(await fn())return;await page.waitForTimeout(50);}throw new Error(label);};
 await worker.evaluate(id=>chrome.scripting.executeScript({target:{tabId:id},files:['motion.js','content.js']}),id);await command('sulsul-start');
 await until(async()=>{const s=await command('sulsul-state');return s.translated&&!s.busy&&!s.waiting;},'translated');const baseline=await worker.evaluate(()=>qaCalls);
 await page.locator('#link').hover();await until(async()=>(await tip())?.text===original&&!(await tip()).hidden,'joined paragraph original');
 assert.ok(!(await tip()).text.includes('Another author'));assert.ok((await page.locator('#first').innerText()).startsWith('번역 '));
 const box=await tip();await page.mouse.move(box.x+40,box.y+25);await page.waitForTimeout(220);assert.equal((await tip()).hidden,false,'tooltip remains available under the pointer');
 await page.screenshot({path:path.join(root,'original-hover.png')});
 await page.keyboard.press('Escape');assert.equal((await tip()).hidden,true);await page.locator('#link').click();assert.equal(await page.evaluate(()=>window.linkClicked),true,'original link behavior is preserved');
 await page.locator('#second').hover();await until(async()=>(await tip())?.text==='Another author wrote this separate paragraph.'&&!(await tip()).hidden,'second paragraph only');
 await page.mouse.move(950,750);await until(async()=>(await tip()).hidden,'pointer leaves');
 await page.locator('#link').evaluate(el=>el.blur());await page.locator('#link').focus();await until(async()=>!(await tip()).hidden,'keyboard focus');assert.match(await page.locator('#link').getAttribute('aria-describedby'),/existing-description sulsul-original-/);
 await page.keyboard.press('Escape');assert.equal(await page.locator('#link').getAttribute('aria-describedby'),'existing-description');
 const bounds=await page.locator('#component').boundingBox();await page.mouse.move(bounds.x+80,bounds.y+20);await until(async()=>(await tip())?.text==='A paragraph inside a closed component.'&&!(await tip()).hidden,'closed shadow paragraph');
 await page.locator('#metadata').hover();await until(async()=>(await tip())?.text==='Matter Labs publishes its work.','metadata removed from preview');
 await page.locator('#long').hover();await until(async()=>(await tip())?.scroll,'long original scrolls inside tooltip');const long=await tip();assert.ok(long.y>=0&&long.y+long.height<=850&&long.x>=0&&long.x+long.width<=1000);
 await page.setViewportSize({width:375,height:700});await page.locator('#second').hover();await until(async()=>!(await tip()).hidden,'narrow viewport tooltip');const narrow=await tip();assert.ok(narrow.x>=0&&narrow.x+narrow.width<=375&&narrow.y>=0&&narrow.y+narrow.height<=700);
 await page.screenshot({path:path.join(root,'original-hover-mobile.png')});
 await page.waitForTimeout(3500);assert.equal(await worker.evaluate(()=>qaCalls),baseline,'hover, focus and tooltip text never call AI');
 await command('sulsul-restore');assert.equal((await tip()).hidden,true);assert.equal(await page.locator('#first').textContent(),original);await page.locator('#first').hover();await page.waitForTimeout(450);assert.equal((await tip()).hidden,true,'original mode has no translated tooltip');
 await command('sulsul-start');await until(async()=>{const s=await command('sulsul-state');return s.translated&&!s.busy&&!s.waiting;},'cached resume');await page.locator('#first').hover();await until(async()=>!(await tip()).hidden,'cache restores original preview');
 assert.equal(await worker.evaluate(()=>qaCalls),baseline);await command('sulsul-end');assert.equal((await tip()).hidden,true);
 console.log('PASS per-paragraph original hover, links/code, closed shadow DOM, metadata, keyboard, viewport bounds, restoration and no AI calls. Preview: '+root);
}finally{await context.close();}
