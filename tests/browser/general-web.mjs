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
globalThis.qaMalformed=false;
native=async(type,data,tabId,sourceUrl)=>{
 if(type!=='translate')return {};
 qaCalls.push({data,tabId,sourceUrl});
 if(qaMalformed)return {blocks:[]};
 const result={blocks:data.blocks.map(b=>({id:b.id,parts:b.parts.filter(p=>!p.locked).map(p=>({id:p.id,text:'번역: '+p.text}))}))};
 if(qaHold)await new Promise(resolve=>{globalThis.qaRelease=resolve;});
 return result;
};
`);
const context=await chromium.launchPersistentContext(path.join(scratch,'general-profile-'+Date.now()),{channel:'chromium',headless:true,viewport:{width:1280,height:1000},args:['--disable-extensions-except='+ext,'--load-extension='+ext]});
const fixture=`<!doctype html><html><head><title>Home feed</title><style>body{font:16px/1.7 system-ui;padding:20px;background:#f7f7f3}article{border:1px solid #ddd;padding:15px;margin:15px 0}aside,nav,footer{padding:10px;background:#eaf0e6}code{font-family:monospace}.hidden{display:none}shreddit-post{display:block}</style></head><body>
<nav><a id="nav" href="#home">Popular posts</a></nav><main>
<article id="first"><h2>First feed post</h2><p id="first-body">A long first post must not prevent all the later posts from being translated. Every article should appear in the collected page text.</p><button id="vote">Upvote</button></article>
<article id="second"><h2>Second feed post</h2><p id="second-body">Another independent author has a different opinion. Do not merge these two viewpoints.</p></article>
<shreddit-post id="component"><h2 slot="title">Slotted post title</h2><p slot="body">Slotted post body with a <a href="https://example.com" id="source-link">source link</a> and <code>fixedIdentifier()</code>.</p><p id="unassigned">Unassigned private component internals</p></shreddit-post>
<div id="closed-host"></div><div id="late-host"></div><section id="comments"><p>First comment from another author.</p></section>
<div id="hidden-content" class="hidden"><p>Collapsed comment becomes visible later.</p></div>
<div contenteditable="true" id="editor">PRIVATE UNSENT DRAFT</div><textarea>PRIVATE INPUT</textarea><pre>codeShouldStayEnglish();</pre>
</main><aside><p id="sidebar">Community rules and useful resources.</p></aside><footer>About this community</footer>
<script>
document.querySelector('#component').attachShadow({mode:'open'}).innerHTML='<article><slot name="title"></slot><slot name="body"></slot><p id="shadow-comment">A comment inside the web component.</p></article>';
window.closedRoot=document.querySelector('#closed-host').attachShadow({mode:'closed'});closedRoot.innerHTML='<p id="closed-comment">A comment inside a closed component.</p><div contenteditable="true">PRIVATE SHADOW DRAFT</div>';
window.voteCount=0;document.querySelector('#vote').addEventListener('click',()=>voteCount++);
window.codeNode=document.querySelector('code');window.linkNode=document.querySelector('#source-link');
</script></body></html>`;
await context.route('https://feed.test/**',route=>route.fulfill({contentType:'text/html',body:fixture}));
const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
const page=await context.newPage();let tabId;
const command=type=>worker.evaluate(({id,type})=>chrome.tabs.sendMessage(id,{type}),{id:tabId,type});
const state=()=>command('sulsul-state');
const count=()=>worker.evaluate(()=>qaCalls.length);
const allSources=()=>worker.evaluate(()=>qaCalls.flatMap(c=>c.data.blocks.flatMap(b=>b.parts.map(p=>p.text))));
async function until(predicate,label,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){if(await predicate())return;await new Promise(r=>setTimeout(r,100));}throw new Error(label+': '+JSON.stringify(await state()));}
const translated=selector=>until(async()=> (await page.locator(selector).innerText()).startsWith('번역: '),'translate '+selector);
async function settled(){await until(async()=>{const s=await state();return s.translated&&!s.busy&&!s.waiting;},'settled');}
try {
 await page.goto('https://feed.test/home',{waitUntil:'load'});
 tabId=await worker.evaluate(async()=> (await chrome.tabs.query({})).find(t=>t.url==='https://feed.test/home').id);
 await worker.evaluate(id=>chrome.scripting.executeScript({target:{tabId:id},files:['content.js']}),tabId);
 await worker.evaluate(()=>qaHold=true);
 await command('sulsul-toggle');
 await until(async()=>await count()>0,'first request');
 await page.evaluate(()=>document.querySelector('#comments').insertAdjacentHTML('beforeend','<p id="during-request">Comment arriving while the first translation is running.</p>'));
 await worker.evaluate(()=>{qaHold=false;qaRelease();});
 await translated('#during-request');await settled();
 for(const selector of ['#first h2','#second h2','#first-body','#second-body','#nav','#vote','#sidebar','#component h2','#comments p:first-child'])await translated(selector);
 assert.ok(await page.evaluate(()=>closedRoot.querySelector('p').textContent.startsWith('번역: ')));
 assert.ok(await page.evaluate(()=>document.querySelector('#component').shadowRoot.querySelector('#shadow-comment').textContent.startsWith('번역: ')));
 assert.equal(await page.locator('code').innerText(),'fixedIdentifier()');
 assert.equal(await page.evaluate(()=>codeNode===document.querySelector('code')&&linkNode===document.querySelector('#source-link')),true);
 await page.locator('#vote').click();assert.equal(await page.evaluate(()=>voteCount),1);
 const sources=await allSources();
 assert.equal(sources.some(t=>t.includes('PRIVATE')||t.includes('Unassigned')||t.includes('Collapsed comment')),false);
 const initialCount=await count();await page.waitForTimeout(3800);
 assert.equal(await count(),initialCount,'no loop from own text mutations or periodic scans');
 console.log('PASS all feed articles, menus/sidebar/buttons, slots, open/closed shadow DOM, input protection, original node identity and no retranslating unchanged text');

 await page.evaluate(()=>{
  const post=document.createElement('article');post.innerHTML='<h2 id="infinite-title">New post appended by infinite scroll</h2><p id="infinite-body">Newly loaded feed body.</p>';document.querySelector('main').append(post);
  document.querySelector('#hidden-content').classList.remove('hidden');
  const p=document.createElement('p');p.id='closed-new';p.textContent='Newly expanded reply inside a closed component.';closedRoot.append(p);
 });
 await translated('#infinite-title');await translated('#hidden-content p');
 await until(()=>page.evaluate(()=>closedRoot.querySelector('#closed-new').textContent.startsWith('번역: ')),'dynamic closed comment');await settled();
 assert.equal((await allSources()).filter(t=>t==='First feed post').length,1);
 await page.evaluate(()=>document.querySelector('#late-host').attachShadow({mode:'open'}).innerHTML='<p id="late-component">This shadow root attaches later without a document mutation.</p>');
 await until(()=>page.evaluate(()=>document.querySelector('#late-host').shadowRoot.querySelector('p').textContent.startsWith('번역: ')),'late root');
 console.log('PASS appended posts, hidden comment expansion, late shadow attachment and comments inside closed components');

 await page.evaluate(()=>{
  document.querySelector('#first h2').firstChild.data='Recycled card now shows a different post.';
  document.querySelector('#second-body').append(document.createTextNode(' Newly edited sentence.'));
 });
 await until(async()=> (await page.locator('#first h2').innerText())==='번역: Recycled card now shows a different post.','recycled card');
 await until(()=>page.evaluate(()=>document.querySelector('#second-body').lastChild.data==='번역:  Newly edited sentence.'),'edited paragraph');await settled();
 assert.equal((await allSources()).some(t=>t.startsWith('번역: ')),false,'source never contains our previous translation');
 console.log('PASS reused cards and edited paragraphs use the new original source');

 await command('sulsul-stop');const paused=await count();
 await page.evaluate(()=>document.querySelector('#comments').insertAdjacentHTML('beforeend','<p id="paused-comment">This reply arrives while paused.</p>'));
 await page.waitForTimeout(3600);assert.equal(await count(),paused);
 assert.equal(await page.locator('#paused-comment').innerText(),'This reply arrives while paused.');
 await command('sulsul-toggle');await translated('#paused-comment');await settled();
 await page.screenshot({path:path.join(scratch,'general-web-translated.png')});
 await command('sulsul-restore');
 assert.equal(await page.locator('#first h2').innerText(),'Recycled card now shows a different post.');
 assert.equal(await page.locator('#second-body').innerText(),'Another independent author has a different opinion. Do not merge these two viewpoints. Newly edited sentence.');
 assert.equal(await page.locator('#infinite-title').innerText(),'New post appended by infinite scroll');
 assert.equal(await page.evaluate(()=>closedRoot.querySelector('p').textContent),'A comment inside a closed component.');
 const beforeCached=await count();await command('sulsul-toggle');await settled();assert.equal(await count(),beforeCached);
 await command('sulsul-end');const ended=await count();
 await page.evaluate(()=>document.querySelector('#comments').insertAdjacentHTML('beforeend','<p>New reply after exit.</p>'));
 await page.waitForTimeout(3300);assert.equal(await count(),ended);assert.equal(await page.locator('[data-sulsul-ui]').count(),0);
 console.log('PASS pause, resume, restore all appended content, cached restore, and exit');

 await worker.evaluate(()=>qaMalformed=true);
 await page.goto('https://feed.test/errors',{waitUntil:'load'});
 await worker.evaluate(id=>chrome.scripting.executeScript({target:{tabId:id},files:['content.js']}),tabId);
 await command('sulsul-toggle');
 await until(async()=> (await state()).message.includes('수가 맞지'),'format failure');
 const errors=await count();await page.waitForTimeout(3500);assert.equal(await count(),errors,'no automatic error retry loop');
 console.log('PASS failed model response waits for an explicit retry');
}finally{await context.close();}
