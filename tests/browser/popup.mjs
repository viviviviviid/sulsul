import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'sulsul-popup-'));
const ext=path.join(scratch,'extension');fs.cpSync('extension',ext,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(ext,'manifest.json')));manifest.host_permissions=['https://reader.test/*'];fs.writeFileSync(path.join(ext,'manifest.json'),JSON.stringify(manifest));
fs.appendFileSync(path.join(ext,'background.js'),`
globalThis.qaHealth='ready';native=async(type,data)=>{
 if(type==='health'){if(qaHealth==='missing')throw new Error('Native host not found');return {provider:'codex',loginCached:qaHealth==='ready'};}
 if(type==='settings-get')return {selected:'codex',scope:'test',providers:{codex:{targetLanguage:'en'}}};
 if(type==='translate')return {blocks:data.blocks.map(b=>({id:b.id,parts:b.parts.filter(p=>!p.locked).map(p=>({id:p.id,text:'Translated: '+p.text}))}))};
 return {};
};
`);
const context=await chromium.launchPersistentContext(path.join(scratch,'profile'),{channel:'chromium',headless:true,args:['--disable-extensions-except='+ext,'--load-extension='+ext]});
try{
 await context.route('https://reader.test/**',r=>r.fulfill({contentType:'text/html',body:'<main><h1>A clear guide to private networks</h1><p>Read this paragraph in your preferred language.</p></main>'}));
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
 const web=await context.newPage();await web.goto('https://reader.test/article');
 const tab=await worker.evaluate(async()=> (await chrome.tabs.query({})).find(t=>t.url==='https://reader.test/article'));
 const popup=await context.newPage();await popup.setViewportSize({width:344,height:650});
 await popup.addInitScript(tab=>{chrome.tabs.query=async()=>[tab];},tab);
 const open=async()=>{await popup.goto('chrome-extension://'+id+'/popup.html');await popup.locator('#translate:not([disabled])').waitFor();};
 await open();assert.equal(await popup.locator('#button-text').innerText(),'번역 시작');await popup.locator('#language').filter({hasText:'English'}).waitFor();
 await popup.locator('#shortcut-prompt').waitFor({state:'visible'});
 assert.equal((await worker.evaluate(()=>chrome.commands.getAll())).find(c=>c.name==='start-reading').shortcut,'','new install has no silently assigned shortcut');
 await popup.locator('body').screenshot({path:path.join(scratch,'popup-first.png')});
 await popup.locator('#shortcut-no').click();await popup.reload();await popup.locator('#translate:not([disabled])').waitFor();assert.equal(await popup.locator('#shortcut-prompt').isVisible(),false);
 await popup.locator('#translate').click();await web.waitForFunction(()=>document.querySelector('p').textContent.startsWith('Translated:')).catch(async e=>{console.log(await popup.locator('body').innerText());console.log(await web.locator('body').innerText());throw e;});
 await popup.locator('#progress').filter({hasText:'번역 완료'}).waitFor();
 await popup.locator('#translate').click();await popup.locator('#button-text').filter({hasText:'이어서 번역'}).waitFor();
 await popup.locator('#restore').click();assert.equal(await web.locator('p').innerText(),'Read this paragraph in your preferred language.');
 await popup.locator('#end').click();await popup.locator('#button-text').filter({hasText:'번역 시작'}).waitFor();
 await popup.locator('body').screenshot({path:path.join(scratch,'popup-ready.png')});
 console.log('PASS first-use choice, persisted decline, explicit assignment and popup reader controls');
 await worker.evaluate(()=>chrome.storage.local.set({'shortcut-choice':'pending'}));await popup.reload();await popup.locator('#shortcut-heading').filter({hasText:'아직'}).waitFor();
 await popup.addInitScript(()=>{chrome.commands.getAll=async()=>[{name:'start-reading',shortcut:'Alt+Shift+S'}];});await popup.reload();await popup.locator('#shortcut').filter({hasText:'Alt+Shift+S'}).waitFor();
 assert.equal(await popup.locator('#shortcut-prompt').isVisible(),false);assert.equal(await worker.evaluate(async()=>(await chrome.storage.local.get('shortcut-choice'))['shortcut-choice']),'accepted');
 console.log('PASS unfinished setup stays actionable and a confirmed assignment completes onboarding');
 await worker.evaluate(()=>{qaHealth='login';});await open();assert.equal(await popup.locator('#button-text').innerText(),'ChatGPT 연결');
 const loginCreated=context.waitForEvent('page');await popup.locator('#translate').click();const login=await loginCreated;await login.waitForURL('**/login.html');await login.close();
 await worker.evaluate(()=>{qaHealth='missing';});await open();assert.equal(await popup.locator('#button-text').innerText(),'연결 프로그램 설치');
 await popup.locator('body').screenshot({path:path.join(scratch,'popup-install.png')});
 const setupCreated=context.waitForEvent('page');await popup.locator('#translate').click();const setup=await setupCreated;await setup.waitForURL('**/setup.html');await setup.setViewportSize({width:900,height:900});await setup.screenshot({path:path.join(scratch,'guide.png')});
 console.log('PASS install and login actions match connection state');console.log('Popup previews: '+scratch);
}finally{await context.close();}
