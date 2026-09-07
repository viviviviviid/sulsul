import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PROVIDERS } from '../../host/provider-settings.mjs';
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'sulsul-settings-browser-'));
const ext=path.join(scratch,'extension');fs.cpSync('extension',ext,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(ext,'manifest.json'),'utf8'));manifest.host_permissions=['https://reader.test/*'];fs.writeFileSync(path.join(ext,'manifest.json'),JSON.stringify(manifest));
const catalog={selected:'antigravity',scope:'initial',providers:JSON.parse(JSON.stringify(PROVIDERS))};
fs.appendFileSync(path.join(ext,'background.js'),`
globalThis.qaSettings=${JSON.stringify(catalog)};
globalThis.qaRequests=[];
globalThis.qaTests=0;
native=async(type,data,tabId,sourceUrl)=>{
 if(type==='settings-get')return structuredClone(qaSettings);
 if(type==='settings-save'){
  qaSettings.selected=data.provider;qaSettings.scope=crypto.randomUUID();
  const p=qaSettings.providers[data.provider];p.model=data.model;
  if(p.key)p.hasKey=data.clearKey?false:!!data.apiKey||p.hasKey;
  if(data.provider==='ollama')p.endpoint=data.endpoint;
  return structuredClone(qaSettings);
 }
 if(type==='provider-test'){qaTests++;return {message:'연결 성공 · 편하게 읽어요.'};}
 if(type==='ollama-models')return ['local-model:8b','other-model:latest'];
 if(type==='login')return {message:'Google 로그인 창을 열었습니다.'};
 if(type==='translate'){
  qaRequests.push({provider:qaSettings.selected,model:qaSettings.providers[qaSettings.selected].model});
  return {blocks:data.blocks.map(b=>({id:b.id,parts:b.parts.filter(p=>!p.locked).map(p=>({id:p.id,text:qaSettings.selected+' 한국어: '+p.text}))}))};
 }
 return {};
};
`);
const context=await chromium.launchPersistentContext(path.join(scratch,'profile'),{channel:'chromium',headless:true,args:['--disable-extensions-except='+ext,'--load-extension='+ext]});
await context.route('https://reader.test/**',r=>r.fulfill({contentType:'text/html',body:'<html><body><main><h1>Read this page</h1><p>Clear writing makes complex ideas easier to understand.</p></main></body></html>'}));
const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
const extensionId=new URL(worker.url()).host;
const options=await context.newPage();
const waitStatus=text=>options.waitForFunction(text=>document.querySelector('#status').textContent.includes(text),text);
try{
 await options.goto('chrome-extension://'+extensionId+'/options.html');await waitStatus('선택한 AI로만');
 assert.equal(await options.locator('#provider option').count(),5);
 assert.equal(await options.locator('#provider').inputValue(),'antigravity');
 const page=await context.newPage();await page.goto('https://reader.test/page');
 const tabId=await worker.evaluate(async()=> (await chrome.tabs.query({})).find(t=>t.url==='https://reader.test/page').id);
 const command=type=>worker.evaluate(({id,type})=>chrome.tabs.sendMessage(id,{type}),{id:tabId,type});
 await worker.evaluate(id=>chrome.scripting.executeScript({target:{tabId:id},files:['content.js']}),tabId);
 await command('sulsul-toggle');await page.waitForFunction(()=>document.querySelector('h1').textContent.startsWith('antigravity 한국어'));
 await options.locator('#provider').selectOption('openai');
 assert.equal(await options.locator('#test').isDisabled(),true);
 assert.equal(await options.locator('#login').isVisible(),false);
 await options.locator('#api-key').fill('FAKE_BROWSER_TEST_KEY');await options.locator('#save').click();await waitStatus('저장했어요');
 assert.equal(await page.locator('h1').innerText(),'Read this page');
 assert.equal((await command('sulsul-state')).mode,'paused');
 assert.equal(await options.locator('#api-key').inputValue(),'');
 assert.equal(await options.locator('#key-state').innerText(),'저장된 키 있음');
 assert.equal(await worker.evaluate(async()=>JSON.stringify(await chrome.storage.local.get(null)).includes('FAKE_BROWSER_TEST_KEY')),false);
 await command('sulsul-toggle');await page.waitForFunction(()=>document.querySelector('h1').textContent.startsWith('openai 한국어'));
 assert.equal(await worker.evaluate(async id=>(await chrome.scripting.executeScript({target:{tabId:id},func:()=>chrome.dom.openOrClosedShadowRoot(document.querySelector('[data-sulsul-ui]')).querySelectorAll('button').length}))[0].result,tabId),3);
 await options.locator('#test').click();await waitStatus('연결 성공');assert.equal(await worker.evaluate(()=>qaTests),1);
 await options.locator('#model').fill('another-model');assert.equal(await options.locator('#test').isDisabled(),true);
 await options.locator('#save').click();await waitStatus('저장했어요');await command('sulsul-toggle');
 await page.waitForFunction(()=>document.querySelector('h1').textContent.startsWith('openai 한국어'));
 assert.equal(await worker.evaluate(()=>qaRequests.at(-1).model),'another-model');
 // Simulate a frozen/BFCache document that missed the live change notification.
 await worker.evaluate(async id=>{const key='reader:'+id;const state=(await chrome.storage.session.get(key))[key];await chrome.storage.session.set({[key]:{...state,mode:'paused'},'provider-revision':crypto.randomUUID()});qaSettings.selected='gemini';qaSettings.scope=crypto.randomUUID();},tabId);
 await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
 await page.waitForFunction(()=>document.querySelector('h1').textContent==='Read this page');
 await command('sulsul-toggle');await page.waitForFunction(()=>document.querySelector('h1').textContent.startsWith('gemini 한국어'));
 console.log('PASS a restored document discards translations from a previous provider');
 await options.locator('#clear-key').check();await options.locator('#save').click();await waitStatus('저장했어요');assert.equal(await options.locator('#key-state').innerText(),'키 미등록');
 await options.locator('#provider').selectOption('ollama');await options.locator('#load-models').click();await waitStatus('모델 입력란');
 assert.equal(await options.locator('#model').inputValue(),'local-model:8b');await options.locator('#save').click();await waitStatus('저장했어요');
 await options.locator('#provider').selectOption('antigravity');await options.locator('#save').click();await waitStatus('저장했어요');
 assert.equal(await options.locator('#login').isVisible(),true);
 await options.setViewportSize({width:900,height:1000});await options.screenshot({path:path.join(scratch,'settings.png'),fullPage:true});
 await options.setViewportSize({width:375,height:900});assert.equal(await options.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 console.log('PASS settings selection, key redaction/deletion, probe, model cache reset, local model list, and three-button reader');
 console.log('Settings preview: '+path.join(scratch,'settings.png'));
}finally{await context.close();}
