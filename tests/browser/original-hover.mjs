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
 await context.route('https://hover.test/**',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><style>body{font:18px/1.8 system-ui;padding:80px 40px}p{margin:35px 0;max-width:650px}#second{padding:20px;max-width:300px;line-height:2.5}#long{height:100px;overflow:auto}</style><main><p id="first">Read the <a href="#proof" id="link" aria-describedby="existing-description">source link</a> and call <code>verify()</code> only after verification.</p><p id="second">Another author wrote this separate paragraph.</p><div id="component"></div><p id="metadata">Matter Labs${'\u200b'.repeat(4)+'\u200c'.repeat(100)} publishes its work.</p><p id="long">${'A lengthy paragraph keeps its full original available for reference. '.repeat(50)}</p></main><script>const root=document.querySelector('#component').attachShadow({mode:'closed'});root.innerHTML='<p>A paragraph inside a closed component.</p>';window.componentRoot=root;document.querySelector('#link').addEventListener('click',()=>window.linkClicked=true);</script>`}));
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),page=await context.newPage();await page.goto('https://hover.test/article');
 const id=await worker.evaluate(async()=>(await chrome.tabs.query({})).find(t=>t.url==='https://hover.test/article').id);
 const command=type=>worker.evaluate(({id,type})=>chrome.tabs.sendMessage(id,{type},{frameId:0}),{id,type});
 const textPoint=selector=>page.evaluate(selector=>{const el=selector==='#component'?window.componentRoot.querySelector('p'):document.querySelector(selector);const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode()){if(!node.data.trim())continue;const r=document.createRange();r.selectNodeContents(node);const b=r.getClientRects()[0];if(b?.width)return {x:b.x+Math.min(10,b.width/2),y:b.y+b.height/2};}},selector);
 const hoverText=async selector=>{await page.locator(selector).scrollIntoViewIfNeeded();const p=await textPoint(selector);await page.mouse.move(p.x,p.y);};
 const tip=()=>worker.evaluate(async id=>(await chrome.scripting.executeScript({target:{tabId:id},func:()=>{const tip=document.querySelector('[data-sulsul-original]');if(!tip)return null;const b=tip.getBoundingClientRect();return {hidden:tip.hidden,text:tip._text.textContent,x:b.x,y:b.y,width:b.width,height:b.height,scroll:tip._text.scrollHeight>tip._text.clientHeight};}}))[0].result,id);
 const until=async(fn,label)=>{for(let i=0;i<150;i++){if(await fn())return;await page.waitForTimeout(50);}throw new Error(label);};
 await worker.evaluate(id=>chrome.scripting.executeScript({target:{tabId:id},files:['motion.js','content.js']}),id);await command('sulsul-start');
 await until(async()=>{const s=await command('sulsul-state');return s.translated&&!s.busy&&!s.waiting;},'translated');const baseline=await worker.evaluate(()=>qaCalls);
 await page.locator('#link').hover();await until(async()=>(await tip())?.text===original&&!(await tip()).hidden,'joined paragraph original');
 assert.ok(!(await tip()).text.includes('Another author'));assert.ok((await page.locator('#first').innerText()).startsWith('번역 '));
 const box=await tip();await page.mouse.move(box.x+40,box.y+25);await page.waitForTimeout(220);assert.equal((await tip()).hidden,false,'tooltip remains available under the pointer');
 await page.screenshot({path:path.join(root,'original-hover.png')});
 await page.keyboard.press('Escape');assert.equal((await tip()).hidden,true);await page.locator('#link').click();assert.equal(await page.evaluate(()=>window.linkClicked),true,'original link behavior is preserved');
 await hoverText('#second');await until(async()=>(await tip())?.text==='Another author wrote this separate paragraph.'&&!(await tip()).hidden,'second paragraph only');
 // A wrapped short final line must not activate the paragraph's remaining rectangle.
 const areas=await page.locator('#second').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const lines=[...range.getClientRects()],box=el.getBoundingClientRect(),last=lines.at(-1);return {tail:{x:box.right-25,y:last.y+last.height/2},padding:{x:box.left+5,y:box.top+5},gap:{x:lines[0].x+10,y:(lines[0].bottom+lines[1].top)/2},text:{x:last.x+5,y:last.y+last.height/2},lastRight:last.right};});
 assert.ok(areas.tail.x>areas.lastRight,'fixture has empty space after final line');
 for(const area of ['tail','padding','gap']){if(area!=='tail')await page.keyboard.press('Escape');await page.mouse.move(areas[area].x,areas[area].y);await page.waitForTimeout(450);assert.equal((await tip()).hidden,true,area+' must not show original');await page.mouse.move(areas.text.x,areas.text.y);await until(async()=>!(await tip()).hidden,'text re-entry inside same paragraph');}
 await page.mouse.move(areas.tail.x,areas.tail.y);await page.waitForTimeout(220);await page.mouse.move(areas.text.x,areas.text.y);await page.waitForTimeout(80);await page.mouse.move(areas.tail.x,areas.tail.y);await page.waitForTimeout(450);assert.equal((await tip()).hidden,true,'leaving text cancels pending tooltip');
 await page.mouse.move(950,750);await until(async()=>(await tip()).hidden,'pointer leaves');
 await page.locator('#link').evaluate(el=>el.blur());await page.locator('#link').focus();await until(async()=>!(await tip()).hidden,'keyboard focus');assert.match(await page.locator('#link').getAttribute('aria-describedby'),/existing-description sulsul-original-/);
 await page.keyboard.press('Escape');assert.equal(await page.locator('#link').getAttribute('aria-describedby'),'existing-description');
 await hoverText('#component');await until(async()=>(await tip())?.text==='A paragraph inside a closed component.'&&!(await tip()).hidden,'closed shadow paragraph');
 await hoverText('#metadata');await until(async()=>(await tip())?.text==='Matter Labs publishes its work.','metadata removed from preview');
 await hoverText('#long');await until(async()=>(await tip())?.scroll,'long original scrolls inside tooltip');const long=await tip();assert.ok(long.y>=0&&long.y+long.height<=850&&long.x>=0&&long.x+long.width<=1000);
 await page.setViewportSize({width:375,height:700});await hoverText('#second');await until(async()=>!(await tip()).hidden,'narrow viewport tooltip');const narrow=await tip();assert.ok(narrow.x>=0&&narrow.x+narrow.width<=375&&narrow.y>=0&&narrow.y+narrow.height<=700);
 await page.screenshot({path:path.join(root,'original-hover-mobile.png')});
 await page.waitForTimeout(3500);assert.equal(await worker.evaluate(()=>qaCalls),baseline,'hover, focus and tooltip text never call AI');
 const options=await context.newPage();await options.goto('chrome-extension://'+new URL(worker.url()).host+'/options.html');
 const toggle=options.getByRole('switch',{name:'원문 툴팁'});await until(async()=>await toggle.isEnabled(),'tooltip preference ready');assert.equal(await toggle.isChecked(),true,'default on');
 await toggle.uncheck();await until(async()=>(await tip()).hidden,'turning off hides an open tooltip');assert.equal((await command('sulsul-state')).mode,'running','display setting does not pause translation');
 await hoverText('#second');await page.waitForTimeout(450);assert.equal((await tip()).hidden,true,'hover disabled');await page.locator('#link').evaluate(el=>el.blur());await page.locator('#link').focus();await page.waitForTimeout(100);assert.equal((await tip()).hidden,true,'focus disabled');
 await options.reload();await until(async()=>await toggle.isEnabled(),'reloaded preference');assert.equal(await toggle.isChecked(),false,'setting persists');
 await page.reload();await until(async()=>{try{const state=await command('sulsul-state');return state.translated&&!state.busy&&!state.waiting;}catch{return false;}},'cached page reload');await hoverText('#second');await page.waitForTimeout(450);assert.ok(!(await tip())|| (await tip()).hidden,'new reader honors disabled preference');
 await toggle.check();await page.mouse.move(0,0);await hoverText('#second');await until(async()=>!!(await tip())&&!(await tip()).hidden,'enable applies to existing reader');
 await page.keyboard.press('Escape');await page.mouse.move(0,0);await hoverText('#second');await worker.evaluate(()=>chrome.storage.local.set({'original-tooltip':false}));await page.waitForTimeout(450);assert.equal((await tip()).hidden,true,'disable cancels delayed show');
 await until(async()=>!(await toggle.isChecked()),'settings follows external change');await toggle.check();await options.screenshot({path:path.join(root,'tooltip-setting.png')});await options.close();assert.equal(await worker.evaluate(()=>qaCalls),baseline,'settings and reload never add AI calls');
 await command('sulsul-restore');assert.equal((await tip()).hidden,true);assert.equal(await page.locator('#first').textContent(),original);await hoverText('#first');await page.waitForTimeout(450);assert.equal((await tip()).hidden,true,'original mode has no translated tooltip');
 await command('sulsul-start');await until(async()=>{const s=await command('sulsul-state');return s.translated&&!s.busy&&!s.waiting;},'cached resume');await hoverText('#first');await until(async()=>!(await tip()).hidden,'cache restores original preview');
 assert.equal(await worker.evaluate(()=>qaCalls),baseline);await command('sulsul-end');assert.equal((await tip()).hidden,true);
 console.log('PASS per-paragraph original hover, links/code, closed shadow DOM, metadata, keyboard, viewport bounds, restoration and no AI calls. Preview: '+root);
}finally{await context.close();}
