const HOST = 'com.sulsul.gemini';
const CACHE_VERSION = '5';
const MAX_CONCURRENT_TRANSLATIONS = 4;
let nativePort;
let changingProvider = false;
const pending = new Map();
const cacheWrites = { promise: Promise.resolve() };
const recentResults = new Map();
const translationJobs = new Map();
const translationQueue = [];
let runningTranslations = 0;
// Older installed hosts support only one request. Upgrade only after negotiation.
let translationLimit = 1;
const readerWrites = new Map();
const readerKey = tabId => `reader:${tabId}`;
const originOf = url => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.origin : null; } catch { return null; } };

// Session storage survives service-worker suspension, but ends with the browser session.
function updateReader(tabId, operation) {
  const previous = readerWrites.get(tabId) || Promise.resolve();
  const task = previous.catch(() => {}).then(operation);
  readerWrites.set(tabId, task);
  task.finally(() => { if (readerWrites.get(tabId) === task) readerWrites.delete(tabId); }).catch(() => {});
  return task;
}

function writeReader(tabId, session) {
  return updateReader(tabId, async () => {
    if (session) await chrome.storage.session.set({ [readerKey(tabId)]: session });
    else await chrome.storage.session.remove(readerKey(tabId));
    return session;
  });
}

async function readReader(tabId, url) {
  await readerWrites.get(tabId)?.catch(() => {});
  const session = (await chrome.storage.session.get(readerKey(tabId)))[readerKey(tabId)];
  const providerRevision = (await chrome.storage.session.get('provider-revision'))['provider-revision'] || 'initial';
  return session?.origin === originOf(url) ? {...session,providerRevision,...(changingProvider?{mode:'paused'}:{})} : null;
}

async function setReader(tabId, url, mode) {
  if (!['running', 'paused', 'off'].includes(mode)) throw new Error('잘못된 읽기 상태입니다.');
  // A message from a document that has already been left cannot restart the reader.
  return updateReader(tabId, async () => {
    if (changingProvider && mode === 'running') throw new Error('AI 설정을 저장한 뒤 이어 읽기를 눌러 주세요.');
    const tab = await chrome.tabs.get(tabId);
    if (tab.url?.split('#')[0] !== url.split('#')[0]) throw new Error('페이지가 바뀌었습니다.');
    const session = mode === 'off' ? null : { mode, origin: originOf(url) };
    if (session) await chrome.storage.session.set({ [readerKey(tabId)]: session });
    else await chrome.storage.session.remove(readerKey(tabId));
    const providerRevision = (await chrome.storage.session.get('provider-revision'))['provider-revision'] || 'initial';
    return session ? {...session,providerRevision} : null;
  });
}

async function restoreReader(tabId) {
  await readerWrites.get(tabId)?.catch(() => {});
  const session = (await chrome.storage.session.get(readerKey(tabId)))[readerKey(tabId)];
  if (!session) return;
  const tab = await chrome.tabs.get(tabId);
  if (originOf(tab.url) !== session.origin) { await writeReader(tabId, null); return; }
  // activeTab permits subsequent pages on this origin; no permanent site permission is needed.
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  await chrome.tabs.sendMessage(tabId, { type: 'sulsul-navigate' });
}

function connect() {
  if (nativePort) return nativePort;
  const port = chrome.runtime.connectNative(HOST);
  nativePort = port;
  port.onMessage.addListener(message => {
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    clearTimeout(task.timer);
    message.ok ? task.resolve(message.result) : task.reject(new Error(message.error || '연결 오류입니다.'));
  });
  port.onDisconnect.addListener(() => {
    const detail = chrome.runtime.lastError?.message || '';
    if (nativePort === port) { nativePort = null; translationLimit = 1; }
    const error = /not found|forbidden|not registered/i.test(detail)
      ? '연결 프로그램 설치가 필요합니다. 설치 안내를 확인해 주세요.'
      : 'AI 연결이 끊겼습니다. 다시 시도해 주세요.';
    for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error(error)); }
    pending.clear();
  });
  return port;
}

function native(type, data, tabId, sourceUrl, scope, requestId) {
  let markDone;
  const done = new Promise(resolve => { markDone = resolve; });
  return new Promise((resolve, reject) => {
    const succeed = value => { markDone(); resolve(value); };
    const fail = error => { markDone(); reject(error); };
    const id = requestId || crypto.randomUUID();
    const timer = setTimeout(() => {
      pending.delete(id);
      fail(new Error('연결 시간이 초과되었습니다. 다시 시도해 주세요.'));
      if (type === 'translate' || type === 'account-check') native('cancel',{ids:[id]}).catch(() => {});
    }, type === 'translate' ? 250000 : type === 'account-check' ? 70000 : type === 'settings-save' ? 25000 : 12000);
    pending.set(id, { id, resolve: succeed, reject: fail, done, timer, tabId, type, sourceUrl });
    try { connect().postMessage({ id, type, data, scope }); }
    catch { clearTimeout(timer); pending.delete(id); fail(new Error('연결 프로그램을 실행하지 못했습니다.')); }
  });
}

async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

async function blockCacheKey(block,data,sourceUrl,scope) {
  const url=new URL(sourceUrl),navigation=block.cacheKind==='navigation';
  // IDs and batch neighbors change with collection order; they aren't content identity.
  return 'page:block:' + await hash(JSON.stringify(['1',CACHE_VERSION,scope,url.origin,
    navigation?'navigation':[url.pathname+url.search,data.page?.title||'',block.heading||''],
    block.parts.map(p=>[p.text,!!p.locked])]));
}

function cachedBlock(entry,block) {
  const parts=block.parts.filter(p=>!p.locked),texts=entry?.texts;
  if(!Array.isArray(texts)||texts.length!==parts.length||!texts.every(t=>typeof t==='string')||!texts.some(t=>t.trim()))return null;
  return {id:block.id,parts:parts.map((p,i)=>({id:p.id,text:texts[i]}))};
}

// Only flag long, unchanged Latin prose for targets that require another script.
// Names, short labels, code and already-target-language text may stay unchanged.
function untranslatedProse(block,output,language) {
  const script={ko:/[가-힣]/,ja:/[\u3040-\u30ff\u3400-\u9fff]/,'zh-Hans':/[\u3400-\u9fff]/,'zh-Hant':/[\u3400-\u9fff]/}[language];
  if(!script||!output?.parts)return false;
  const editable=block.parts.filter(p=>!p.locked);
  const normalize=text=>text.replace(/\s+/g,' ').trim();
  const source=normalize(editable.map(p=>p.text).join(''));
  const result=normalize(editable.map(p=>output.parts.find(t=>t.id===p.id)?.text??'').join(''));
  return source.length>=80 && (source.match(/[A-Za-z]+/g)||[]).length>=12 && !script.test(source) && source===result;
}

function drainTranslations() {
  while (runningTranslations < translationLimit && translationQueue.length) {
    const job = translationQueue.shift();
    if (job.canceled) { job.rejectSlot(new Error('번역을 중지했습니다.')); continue; }
    runningTranslations++;
    job.hasSlot = true;
    job.resolveSlot();
  }
}

async function translationSettings() {
  const settings = await native('settings-get');
  if (settings.selected !== 'codex') throw new Error('ChatGPT 전용 연결 프로그램으로 업데이트해 주세요.');
  const capacity = settings.maxConcurrentTranslations;
  translationLimit = Number.isInteger(capacity) && capacity > 0 ? Math.min(capacity,MAX_CONCURRENT_TRANSLATIONS) : 1;
  drainTranslations();
  return settings;
}

async function cancelTranslations(jobs) {
  for (const job of jobs) {
    job.canceled = true;
    const index = translationQueue.indexOf(job);
    if (index >= 0) { translationQueue.splice(index,1); job.rejectSlot(new Error('번역을 중지했습니다.')); }
  }
  const ids = jobs.filter(job => job.nativeSent).map(job => job.id);
  if (ids.length) await native('cancel',{ids});
  await Promise.all(jobs.map(job => job.done));
}

async function translate(data, tabId, sourceUrl) {
  if (changingProvider) throw new Error('AI 설정을 변경하고 있습니다. 잠시 후 이어 읽기를 눌러 주세요.');
  const arrived = Date.now();
  let finish;
  const job = {id:crypto.randomUUID(),tabId,sourceUrl,done:new Promise(resolve => { finish = resolve; })};
  translationJobs.set(job.id,job);
  try {
    await new Promise((resolve,reject) => {
      job.resolveSlot = resolve; job.rejectSlot = reject;
      translationQueue.push(job); drainTranslations();
    });
    const admitted = Date.now();
    const check = () => { if (job.canceled || changingProvider) throw new Error('번역이 중지되었거나 AI 설정이 바뀌었습니다.'); };
    check();
    const settings=await translationSettings();
    const { scope,cacheScope=scope } = settings;
    const language=settings.providers?.codex?.targetLanguage||'ko';
    const unchanged=(block,result)=>untranslatedProse(block,result,language);
    const key = 'page:' + await hash(JSON.stringify([CACHE_VERSION, cacheScope, data]));
    const cached = recentResults.get(key) || (await chrome.storage.local.get(key))[key];
    const session = await readReader(tabId, sourceUrl);
    const tab = await chrome.tabs.get(tabId);
    check();
    if (session?.mode !== 'running' || tab.url?.split('#')[0] !== sourceUrl.split('#')[0]) throw new Error('번역이 중지되었거나 페이지가 바뀌었습니다.');
    const timings = {queueMs:admitted-arrived,prepareMs:Date.now()-admitted};
    if (cached && !data.blocks.some(b=>unchanged(b,cached.result?.blocks?.find(r=>r.id===b.id)))) return { ...cached.result, cached:true, timings:{...timings,totalRequestMs:Date.now()-arrived} };
    const blockKeys=await Promise.all(data.blocks.map(b=>blockCacheKey(b,data,sourceUrl,cacheScope)));
    const savedBlocks=await Promise.all(blockKeys.map(async key=>recentResults.get(key)||(await chrome.storage.local.get(key))[key]));
    const restored=data.blocks.map((b,i)=>{const result=cachedBlock(savedBlocks[i],b);return unchanged(b,result)?null:result;});
    const missing=data.blocks.filter((b,i)=>!restored[i]);
    check();
    if(!missing.length)return {blocks:restored,cached:true,timings:{...timings,totalRequestMs:Date.now()-arrived}};
    const sent = Date.now();
    job.nativeSent = true;
    let fresh = await native('translate', {...data,blocks:missing}, tabId, sourceUrl, scope, job.id);
    check();
    const retry=missing.filter(b=>unchanged(b,fresh.blocks?.find(r=>r.id===b.id)));
    if(retry.length){
      // One repair request, only for suspicious blocks. A second unchanged answer stops here.
      const repaired=await native('translate',{...data,blocks:retry},tabId,sourceUrl,scope,job.id);
      check();
      fresh={...fresh,blocks:missing.map(b=>(retry.includes(b)?repaired:fresh).blocks?.find(r=>r.id===b.id)).filter(Boolean)};
    }
    const result={...fresh,blocks:data.blocks.map((b,i)=>restored[i]||fresh.blocks?.find(v=>v.id===b.id)).filter(Boolean)};
    result.untranslated=data.blocks.filter(b=>unchanged(b,result.blocks.find(r=>r.id===b.id))).map(b=>b.id);
    const entry = {time:Date.now(),result:{blocks:result.blocks}};
    const writes={};let validBlocks=0;
    // Only complete, valid blocks enter the reusable cache. Never cache partial errors.
    for(let i=0;i<data.blocks.length;i++) {
      const block=data.blocks[i],out=result.blocks.find(b=>b.id===block.id),parts=block.parts.filter(p=>!p.locked);
      if(!out||out.parts?.length!==parts.length)continue;
      if(result.untranslated.includes(block.id))continue;
      const texts=parts.map(p=>out.parts.find(t=>t.id===p.id)?.text);
      if(!cachedBlock({texts},block))continue;
      validBlocks++;
      writes[blockKeys[i]]={time:Date.now(),texts};
      recentResults.set(blockKeys[i],writes[blockKeys[i]]);
    }
    if(validBlocks===data.blocks.length){writes[key]=entry;recentResults.set(key,entry);}
    while (recentResults.size > 500) recentResults.delete(recentResults.keys().next().value);
    cacheWrites.promise = cacheWrites.promise.catch(() => {}).then(async () => {
      await chrome.storage.local.set(writes);
      const all = await chrome.storage.local.get(null);
      const entries = Object.entries(all).filter(([k]) => k.startsWith('page:')).sort((a,b) => a[1].time - b[1].time);
      let bytes = entries.reduce((n, [k,v]) => n + k.length + JSON.stringify(v).length * 2, 0);
      const remove = [];
      while (bytes > 3_000_000 || entries.length > 1500) {
        const [k,v] = entries.shift(); remove.push(k); bytes -= k.length + JSON.stringify(v).length * 2;
      }
      if (remove.length) await chrome.storage.local.remove(remove);
    }).catch(() => {}); // Cache maintenance must not delay or discard visible output.
    return {...result,timings:{...result.timings,...timings,nativeRoundTripMs:Date.now()-sent,totalRequestMs:Date.now()-arrived}};
  } finally {
    translationJobs.delete(job.id);
    if (job.hasSlot) runningTranslations--;
    finish(); drainTranslations();
  }
}

async function testProvider() {
  if (changingProvider) throw new Error('AI 설정을 저장한 뒤 연결 테스트를 눌러 주세요.');
  let finish;
  const job = {id:crypto.randomUUID(),done:new Promise(resolve => { finish=resolve; })};
  translationJobs.set(job.id,job);
  try {
    await new Promise((resolve,reject) => {
      job.resolveSlot=resolve; job.rejectSlot=reject;
      translationQueue.push(job); drainTranslations();
    });
    const {scope} = await translationSettings();
    if (job.canceled || changingProvider) throw new Error('연결 테스트가 중지되었습니다.');
    job.nativeSent=true;
    const result=await native('account-check',undefined,undefined,undefined,scope,job.id);
    if (job.canceled || changingProvider) throw new Error('연결 테스트가 중지되었습니다.');
    return result;
  } finally {
    translationJobs.delete(job.id);
    if (job.hasSlot) runningTranslations--;
    finish(); drainTranslations();
  }
}

async function saveProvider(data) {
  if (changingProvider) throw new Error('AI 설정을 저장하고 있습니다.');
  changingProvider = true;
  try {
    const providerRevision = crypto.randomUUID();
    await chrome.storage.session.set({'provider-revision':providerRevision});
    const sessions = await chrome.storage.session.get(null);
    // Pause every active reader before changing where its next document will be sent.
    const tabIds = Object.keys(sessions).filter(key => /^reader:\d+$/.test(key)).map(key => Number(key.slice(7)));
    await Promise.all(tabIds.map(id => updateReader(id,async () => {
      const key = readerKey(id), session = (await chrome.storage.session.get(key))[key];
      if (session) await chrome.storage.session.set({[key]:{...session,mode:'paused'}});
    })));
    const jobs = [...translationJobs.values()];
    const tasks = [...pending.values()].filter(p => p.type === 'translate' || p.type === 'account-check');
    for (const job of jobs) job.canceled = true;
    const extraIds = tasks.filter(p => !translationJobs.has(p.id)).map(p => p.id);
    if (extraIds.length) await native('cancel',{ids:extraIds});
    await cancelTranslations(jobs);
    await Promise.all(tasks.map(p => p.done));
    await Promise.all(tabIds.map(id => chrome.tabs.sendMessage(id,{type:'sulsul-provider-changed',providerRevision}).catch(() => {})));
    // The next provider may have a lower limit. Negotiate before widening again.
    translationLimit = 1;
    return await native('settings-save',data);
  } finally { changingProvider = false; }
}

async function cancelTab(tabId, nextUrl) {
  const jobs = [...translationJobs.values()].filter(p => p.tabId === tabId && (!nextUrl || p.sourceUrl?.split('#')[0] !== nextUrl.split('#')[0]));
  await cancelTranslations(jobs);
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  const extensionPage = sender.url?.startsWith(chrome.runtime.getURL(''));
  const tabId = sender.tab?.id;
  // Chrome may keep sender.url at the initial document URL after pushState.
  const sourceUrl = message.url || sender.url;
  const documentMessage = tabId !== undefined && originOf(sourceUrl) && originOf(sourceUrl) === originOf(sender.url);
  let task;
  if (message.type === 'translate' && documentMessage) task = translate(message.data, tabId, sourceUrl);
  else if (message.type === 'reader-get' && documentMessage) task = readReader(tabId, sourceUrl);
  else if (message.type === 'reader-set' && documentMessage) task = setReader(tabId, sourceUrl, message.data?.mode);
  else if (message.type === 'cancel' && tabId !== undefined) task = cancelTab(tabId);
  else if (message.type === 'open-settings' && (documentMessage || extensionPage)) task = chrome.runtime.openOptionsPage();
  else if (message.type === 'health' && extensionPage) task = native('health');
  else if (message.type === 'login' && extensionPage) task = native('login');
  else if (['login-status','login-cancel'].includes(message.type) && extensionPage) task = native(message.type,message.data);
  else if (message.type === 'settings-get' && extensionPage) task = native('settings-get');
  else if (['history-get','history-clear'].includes(message.type) && extensionPage) task = native(message.type);
  else if (message.type === 'settings-save' && extensionPage) task = saveProvider(message.data);
  else if (message.type === 'provider-test' && extensionPage) task = testProvider();
  else if (message.type === 'clear-cache' && extensionPage) task = cacheWrites.promise.catch(() => {}).then(async () => {
    recentResults.clear();
    const saved = await chrome.storage.local.get(null);
    await chrome.storage.local.remove(Object.keys(saved).filter(key => key.startsWith('page:')));
  });
  else return;
  task.then(result => reply({ ok: true, result })).catch(error => reply({ ok: false, error: error.message }));
  return true;
});

chrome.tabs.onRemoved.addListener(tabId => { cancelTab(tabId).catch(() => {}); writeReader(tabId, null).catch(() => {}); });
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  const canceled = change.url ? cancelTab(tabId, change.url)
    : change.status === 'loading' ? cancelTab(tabId) : Promise.resolve();
  canceled.catch(() => {});
  if (change.status === 'complete' || (change.url && tab?.status === 'complete')) {
    canceled.catch(() => {}).then(() => restoreReader(tabId)).catch(() => {});
  }
});
async function runReaderAction(tab, type) {
  if (!Number.isInteger(tab?.id) || !originOf(tab.url)) return;
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  return chrome.tabs.sendMessage(tab.id, { type }, { frameId: 0 });
}

let menuInstall = Promise.resolve();
function installContextMenus() {
  // Callback APIs also work on our minimum Chrome version (120).
  const menuCall = (method, ...args) => new Promise((resolve, reject) => {
    chrome.contextMenus[method](...args, () => {
      const error = chrome.runtime.lastError;
      error ? reject(new Error(error.message)) : resolve();
    });
  });
  menuInstall = menuInstall.catch(() => {}).then(async () => {
    await menuCall('removeAll');
    const page = { contexts: ['all'], documentUrlPatterns: ['http://*/*', 'https://*/*'] };
    const commands=await chrome.commands.getAll();
    const shortcut=commands.find(command=>command.name==='start-reading')?.shortcut;
    await menuCall('create', { ...page, id: 'sulsul-start', title: shortcut ? `술술 번역 (${shortcut})` : '술술 번역 (단축키 미설정)' });
  });
  return menuInstall;
}

async function handleContextMenu(info, tab) {
  if (info.menuItemId === 'sulsul-start') {
    // Use the page that was right-clicked, even when the pointer is on a link or frame.
    return runReaderAction(tab, info.menuItemId);
  }
}
const refreshContextMenus = () => installContextMenus().catch(error => console.warn('술술 메뉴를 만들지 못했습니다.', error));
chrome.runtime.onInstalled.addListener(refreshContextMenus);
chrome.runtime.onStartup.addListener(refreshContextMenus);
chrome.tabs.onActivated?.addListener(refreshContextMenus);
chrome.contextMenus.onClicked.addListener((info, tab) => handleContextMenu(info, tab).catch(() => {}));

chrome.commands.onCommand.addListener(async command => {
  if (!['toggle-reading','start-reading'].includes(command)) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try { await runReaderAction(tab, command === 'start-reading' ? 'sulsul-start' : 'sulsul-toggle'); }
  catch {} // Chrome internal pages cannot be modified.
});
