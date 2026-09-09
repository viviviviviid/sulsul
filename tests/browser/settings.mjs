import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PROVIDERS } from '../../host/provider-settings.mjs';
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'sulsul-settings-browser-'));
const ext=path.join(scratch,'extension');fs.cpSync('extension',ext,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(ext,'manifest.json'),'utf8'));manifest.host_permissions=['https://reader.test/*'];fs.writeFileSync(path.join(ext,'manifest.json'),JSON.stringify(manifest));
const catalog={selected:'codex',scope:'initial',targetLanguages:{ko:'Korean',en:'English'},maxConcurrentTranslations:2,providers:JSON.parse(JSON.stringify(PROVIDERS))};
fs.appendFileSync(path.join(ext,'background.js'),`
globalThis.qaSettings=${JSON.stringify(catalog)};
globalThis.qaRequests=[];
globalThis.qaTests=0;
globalThis.qaContextMenu=handleContextMenu;
globalThis.qaFailNext=false;
globalThis.qaLoginState='waiting';
globalThis.qaLogin=()=>({sessionId:'test-login',provider:'codex',flow:'browser',state:qaLoginState,url:'https://auth.openai.com/authorize?test=1',message:'공식 로그인 창에서 연결해 주세요.'});
native=async(type,data,tabId,sourceUrl)=>{
 if(type==='settings-get')return structuredClone(qaSettings);
 if(type==='settings-save'){
  qaSettings.selected=data.provider;qaSettings.scope=crypto.randomUUID();
  const p=qaSettings.providers[data.provider];p.model=data.model;p.fast=data.fast;p.targetLanguage=data.targetLanguage;
  return structuredClone(qaSettings);
 }
 if(type==='provider-test'){qaTests++;return {message:'연결 성공 · 편하게 읽어요.'};}
 if(type==='login'||type==='login-status')return qaLogin();
 if(type==='login-cancel')return {...qaLogin(),state:'canceled',message:'계정 연결을 취소했어요.'};
 if(type==='translate'){
  if(qaFailNext){qaFailNext=false;throw new Error('일시적인 테스트 연결 오류');}
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
let options=await context.newPage();
const waitStatus=text=>options.waitForFunction(text=>document.querySelector('#status').textContent.includes(text),text);
try{
 const login=await context.newPage();await login.goto('chrome-extension://'+extensionId+'/login.html');
 await login.locator('#signin').waitFor({state:'visible'});assert.match(await login.locator('#signin').getAttribute('href'),/^https:\/\/auth\.openai\.com\//);
 assert.equal(await login.locator('input').count(),0,'no code or secret inputs');
 await worker.evaluate(()=>{qaLoginState='connected';});await login.locator('#done').waitFor({state:'visible'});
 await worker.evaluate(()=>{qaLoginState='waiting';});await login.reload();await login.locator('#signin').waitFor({state:'visible'});await login.locator('#cancel').click();
 await login.locator('#retry').waitFor({state:'visible'});assert.match(await login.locator('#status').innerText(),/취소/);
 await login.close();console.log('PASS ChatGPT official login, completion and cancellation');
 await options.goto('chrome-extension://'+extensionId+'/options.html');await waitStatus('ChatGPT 계정을');
 assert.equal(await options.locator('#provider,#api-key,#endpoint').count(),0);
 assert.equal(await options.locator('#login').innerText(),'ChatGPT 연결');
 const page=await context.newPage();await page.goto('https://reader.test/page');
 const tabId=await worker.evaluate(async()=> (await chrome.tabs.query({})).find(t=>t.url==='https://reader.test/page').id);
 const command=type=>worker.evaluate(({id,type})=>chrome.tabs.sendMessage(id,{type}),{id:tabId,type});
 const barState=()=>worker.evaluate(async id=>(await chrome.scripting.executeScript({target:{tabId:id},func:()=>{
  const bar=document.querySelector('[data-sulsul-ui]');
  const buttons=[bar._original,bar._end,bar._hide,bar._action];
  const rect=bar._action.getBoundingClientRect();
  const box=bar.getBoundingClientRect(), alertBox=bar._alert.getBoundingClientRect();
  return {visible:buttons.filter(b=>getComputedStyle(b).visibility!=='hidden'&&b.getBoundingClientRect().width>0).length,
   corner:bar.dataset.corner,dragging:bar.hasAttribute('data-dragging'),box:{x:box.x,y:box.y,right:box.right,bottom:box.bottom},
   alertBox:{x:alertBox.x,y:alertBox.y,right:alertBox.right,bottom:alertBox.bottom},
   opacity:Number(getComputedStyle(bar._section).opacity),width:bar.getBoundingClientRect().width,
   alertVisible:!bar._alert.hidden,alert:bar._alert.textContent,status:bar._stateText.textContent,action:bar._actionText.textContent,
   main:{x:rect.x+rect.width/2,y:rect.y+rect.height/2}};
 }}))[0].result,tabId);
 const menu=menuItemId=>worker.evaluate(async({id,menuItemId})=>qaContextMenu({menuItemId},await chrome.tabs.get(id)),{id:tabId,menuItemId});
 // Verify that Chrome accepted the real menu registration made by onInstalled.
 await worker.evaluate(async()=>{
  await chrome.contextMenus.update('sulsul-start',{});
 });
 for(const id of ['sulsul','sulsul-stop','sulsul-restore','sulsul-end','sulsul-separator','sulsul-settings']){
  await assert.rejects(worker.evaluate(id=>chrome.contextMenus.update(id,{}),id));
 }
 await menu('sulsul-start');await page.waitForFunction(()=>document.querySelector('h1').textContent.startsWith('codex 한국어'));
 await page.mouse.move(0,0);await page.waitForTimeout(250);
 const collapsed=await barState();assert.equal(collapsed.visible,1);assert.ok(collapsed.opacity<1);
 assert.equal(collapsed.status,'번역 완료');assert.equal(collapsed.alertVisible,false);
 await page.locator('[data-sulsul-ui]').hover();await page.waitForTimeout(250);
 const expanded=await barState();assert.equal(expanded.visible,4);assert.equal(expanded.opacity,1);assert.equal(expanded.width,56);assert.equal(collapsed.width,56);
 await page.screenshot({path:path.join(scratch,'toolbar-expanded.png')});
 await page.mouse.move(0,0);await page.waitForTimeout(250);assert.equal((await barState()).visible,1);
 await page.screenshot({path:path.join(scratch,'toolbar-collapsed.png')});
 await worker.evaluate(id=>chrome.scripting.executeScript({target:{tabId:id},func:()=>document.querySelector('[data-sulsul-ui]')._action.focus()}),tabId);
 await page.waitForTimeout(250);assert.equal((await barState()).visible,4,'keyboard focus reveals controls');
 await page.mouse.click(10,10);
 await worker.evaluate(id=>chrome.scripting.executeScript({target:{tabId:id},func:()=>document.querySelector('[data-sulsul-ui]')._hide.click()}),tabId);
 await page.waitForTimeout(250);assert.equal((await barState()).visible,0);
 assert.equal((await command('sulsul-state')).mode,'running','hiding keeps translation running');
 const revealPoint=await worker.evaluate(async id=>(await chrome.scripting.executeScript({target:{tabId:id},func:()=>{const b=document.querySelector('[data-sulsul-ui]')._reveal.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};}}))[0].result,tabId);
 await page.mouse.click(revealPoint.x,revealPoint.y);await page.waitForTimeout(250);
 assert.equal((await barState()).visible,4,'edge control restores all buttons');
 await page.mouse.click(10,10);
 console.log('PASS compact controls, keyboard access, hide without stopping and restore');
 const dragTo=async(x,y)=>{
  let p=(await barState()).main;await page.mouse.move(p.x,p.y);await page.waitForTimeout(250);
  p=(await barState()).main;await page.mouse.move(p.x,p.y);await page.mouse.down();
  await page.mouse.move(x,y,{steps:12});
  assert.equal((await barState()).dragging,true,'toolbar follows pointer before release');
  await page.mouse.up();
  assert.ok(await worker.evaluate(async id=>(await chrome.scripting.executeScript({target:{tabId:id},func:()=>document.querySelector('[data-sulsul-ui]').getAnimations().some(a=>a.playState==='running')}))[0].result,tabId),'drop animates toward corner');
  await page.mouse.click(640,350);await page.waitForTimeout(500);
 };
 const assertCorner=async corner=>{
  const s=await barState(),{width,height}=page.viewportSize();assert.equal(s.corner,corner);assert.equal(s.dragging,false);
  assert.ok(s.box.x>=0&&s.box.y>=0&&s.box.right<=width&&s.box.bottom<=height);
  assert.ok(Math.abs((corner.endsWith('left')?s.box.x:width-s.box.right)-16)<1);
  assert.ok(Math.abs((corner.startsWith('top')?s.box.y:height-s.box.bottom)-20)<1);
  assert.equal((await command('sulsul-state')).mode,'running','drag never pauses or ends translation');
 };
 for(const [corner,x,y] of [['top-left',40,40],['top-right',1240,40],['bottom-left',40,680],['bottom-right',1240,680]]){
  await dragTo(x,y);await assertCorner(corner);
 }
 await dragTo(580,320);await assertCorner('top-left'); // Drop near the middle still snaps to a corner.
 // Escape cancels a move without changing the saved corner or activating a button.
 let p=(await barState()).main;await page.mouse.move(p.x,p.y);await page.waitForTimeout(250);p=(await barState()).main;
 await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(900,500,{steps:8});await page.keyboard.press('Escape');await page.mouse.up();await page.waitForTimeout(500);
 await assertCorner('top-left');
 await page.reload();await page.waitForFunction(()=>document.querySelector('h1').textContent.startsWith('codex 한국어'));
 await assertCorner('top-left');
 await page.setViewportSize({width:375,height:720});await page.waitForTimeout(250);await assertCorner('top-left');
 await page.locator('[data-sulsul-ui]').hover();await page.waitForTimeout(250);await assertCorner('top-left');
 await page.screenshot({path:path.join(scratch,'toolbar-top-left-narrow.png')});
 await page.setViewportSize({width:1280,height:720});
 console.log('PASS dragging to all four corners, middle snap, click suppression, Escape, persisted position and narrow screens');
 await menu('sulsul-start');assert.equal((await command('sulsul-state')).mode,'running');
 await command('sulsul-stop');assert.equal((await command('sulsul-state')).mode,'paused');
 assert.match(await page.locator('h1').innerText(),/^codex 한국어/);
 await command('sulsul-restore');assert.equal(await page.locator('h1').innerText(),'Read this page');
 await menu('sulsul-start');await page.waitForFunction(()=>document.querySelector('h1').textContent.startsWith('codex 한국어'));
 await command('sulsul-end');assert.equal((await command('sulsul-state')).mode,'off');
 assert.equal(await page.locator('[data-sulsul-ui]').count(),0);
 assert.equal(await page.locator('h1').innerText(),'Read this page');
 assert.equal(await worker.evaluate(async id=>(await chrome.storage.session.get('reader:'+id))['reader:'+id],tabId),undefined);
 // A failed request leaves the reader running; Start should retry it directly.
 await options.evaluate(()=>chrome.runtime.sendMessage({type:'clear-cache'}));
 await worker.evaluate(()=>{qaFailNext=true;});
 await page.reload();await menu('sulsul-start');
 await worker.evaluate(async id=>{
  const deadline=Date.now()+10000;
  while(!(await chrome.tabs.sendMessage(id,{type:'sulsul-state'})).message.includes('테스트 연결 오류')){
   if(Date.now()>deadline)throw new Error('Expected translation error');
   await new Promise(resolve=>setTimeout(resolve,100));
  }
 },tabId);
 assert.equal((await command('sulsul-state')).failed,true);
 await page.waitForTimeout(250);
 const errorBar=await barState();assert.equal(errorBar.alertVisible,true);assert.match(errorBar.alert,/테스트 연결 오류/);assert.equal(errorBar.action,'다시 시도');
 assert.equal(errorBar.opacity,1,'errors stay readable without hovering');
 assert.equal(errorBar.corner,'top-left');assert.ok(errorBar.alertBox.y>errorBar.box.bottom,'top-docked errors open downward');
 assert.ok(errorBar.alertBox.x>=0&&errorBar.alertBox.right<=1280);
 await page.screenshot({path:path.join(scratch,'toolbar-error.png')});
 await page.mouse.move(errorBar.main.x,errorBar.main.y);await page.waitForTimeout(250);
 const retry=await barState();await page.mouse.click(retry.main.x,retry.main.y);
 await page.waitForFunction(()=>document.querySelector('h1').textContent.startsWith('codex 한국어'));
 assert.equal((await command('sulsul-state')).failed,false);assert.equal((await barState()).alertVisible,false);
 console.log('PASS visible error alert and one-click retry without pausing first');
 await options.close();
 const openedSettings=context.waitForEvent('page');
 await worker.evaluate(()=>chrome.runtime.openOptionsPage());options=await openedSettings;
 await options.waitForURL('chrome-extension://'+extensionId+'/options.html');await waitStatus('ChatGPT 계정을');
 console.log('PASS single direct translation menu, removed submenu, reader actions and error retry');
 await options.locator('#model-choice').selectOption('gpt-5.6-luna');
 await options.locator('#fast').check();
 await options.locator('#target-language').selectOption('en');
 await options.locator('#save').click();await waitStatus('저장했어요');
 assert.equal(await worker.evaluate(()=>qaSettings.providers.codex.model),'gpt-5.6-luna');
 await options.reload();await waitStatus('ChatGPT 계정을');
 assert.equal(await options.locator('#model-choice').inputValue(),'gpt-5.6-luna');
 assert.equal(await options.locator('#fast').isChecked(),true);
 assert.equal(await options.locator('#target-language').inputValue(),'en');
 assert.equal(await worker.evaluate(()=>qaSettings.providers.codex.targetLanguage),'en');
 await options.locator('#model-choice').selectOption('custom');
 await options.locator('#model').fill('another-model');assert.equal(await options.locator('#test').isDisabled(),true);assert.equal(await options.locator('#login').isDisabled(),true);
 await options.locator('#save').click();await waitStatus('저장했어요');
 assert.equal(await page.locator('h1').innerText(),'Read this page');assert.equal((await command('sulsul-state')).mode,'paused');
 await command('sulsul-toggle');await page.waitForFunction(()=>document.querySelector('h1').textContent.startsWith('codex 한국어'));
 assert.equal(await worker.evaluate(()=>qaRequests.at(-1).model),'another-model');
 await options.locator('#test').click();await waitStatus('연결 성공');assert.equal(await worker.evaluate(()=>qaTests),1);
 // A restored document must discard translations from the previous model.
 await worker.evaluate(async id=>{const key='reader:'+id;const state=(await chrome.storage.session.get(key))[key];await chrome.storage.session.set({[key]:{...state,mode:'paused'},'provider-revision':crypto.randomUUID()});qaSettings.providers.codex.model='default';qaSettings.scope=crypto.randomUUID();},tabId);
 await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
 await page.waitForFunction(()=>document.querySelector('h1').textContent==='Read this page');
 await command('sulsul-toggle');await page.waitForFunction(()=>document.querySelector('h1').textContent.startsWith('codex 한국어'));
 assert.equal(await worker.evaluate(()=>qaRequests.at(-1).model),'default');
 const opened=context.waitForEvent('page');await options.locator('#login').click();const loginPage=await opened;
 await loginPage.waitForURL('chrome-extension://'+extensionId+'/login.html');await loginPage.locator('#signin').waitFor({state:'visible'});
 assert.equal(await loginPage.locator('input').count(),0);await loginPage.locator('#cancel').click();await loginPage.close();
 await options.setViewportSize({width:900,height:1000});await options.screenshot({path:path.join(scratch,'settings.png'),fullPage:true});
 await options.setViewportSize({width:375,height:900});assert.equal(await options.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 console.log('PASS ChatGPT-only settings, model changes, cache reset, connection check and mobile layout');
 console.log('Settings preview: '+path.join(scratch,'settings.png'));
}finally{await context.close();}
