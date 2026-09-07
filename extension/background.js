const HOST = 'com.sulsul.gemini';
const CACHE_VERSION = '5';
let nativePort;
let changingProvider = false;
const pending = new Map();
const cacheWrites = { promise: Promise.resolve() };
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
    if (nativePort === port) nativePort = null;
    const error = /not found|forbidden|not registered/i.test(detail)
      ? '연결 프로그램 설치가 필요합니다. 설치 안내를 확인해 주세요.'
      : 'AI 연결이 끊겼습니다. 다시 시도해 주세요.';
    for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error(error)); }
    pending.clear();
  });
  return port;
}

function native(type, data, tabId, sourceUrl, scope) {
  let markDone;
  const done = new Promise(resolve => { markDone = resolve; });
  return new Promise((resolve, reject) => {
    const succeed = value => { markDone(); resolve(value); };
    const fail = error => { markDone(); reject(error); };
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      pending.delete(id);
      fail(new Error('연결 시간이 초과되었습니다. 다시 시도해 주세요.'));
      if (type === 'translate') native('cancel').catch(() => {});
    }, type === 'translate' ? 250000 : type === 'provider-test' ? 70000 : type === 'settings-save' ? 25000 : 12000);
    pending.set(id, { resolve: succeed, reject: fail, done, timer, tabId, type, sourceUrl });
    try { connect().postMessage({ id, type, data, scope }); }
    catch { clearTimeout(timer); pending.delete(id); fail(new Error('연결 프로그램을 실행하지 못했습니다.')); }
  });
}

async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

async function translate(data, tabId, sourceUrl) {
  if (changingProvider) throw new Error('AI 설정을 변경하고 있습니다. 잠시 후 이어 읽기를 눌러 주세요.');
  const { scope } = await native('settings-get');
  const key = 'page:' + await hash(JSON.stringify([CACHE_VERSION, scope, data]));
  const cached = (await chrome.storage.local.get(key))[key];
  const session = await readReader(tabId, sourceUrl);
  const tab = await chrome.tabs.get(tabId);
  if (changingProvider || session?.mode !== 'running' || tab.url?.split('#')[0] !== sourceUrl.split('#')[0]) throw new Error('번역이 중지되었거나 페이지가 바뀌었습니다.');
  if (cached) return { ...cached.result, cached: true };
  const result = await native('translate', data, tabId, sourceUrl, scope);
  cacheWrites.promise = cacheWrites.promise.catch(() => {}).then(async () => {
    await chrome.storage.local.set({ [key]: { time: Date.now(), result } });
    const all = await chrome.storage.local.get(null);
    const entries = Object.entries(all).filter(([k]) => k.startsWith('page:')).sort((a,b) => a[1].time - b[1].time);
    let bytes = entries.reduce((n, [k,v]) => n + k.length + JSON.stringify(v).length * 2, 0);
    const remove = [];
    while (bytes > 3_000_000 || entries.length > 150) {
      const [k,v] = entries.shift(); remove.push(k); bytes -= k.length + JSON.stringify(v).length * 2;
    }
    if (remove.length) await chrome.storage.local.remove(remove);
  });
  await cacheWrites.promise.catch(() => {}); // Storage failure must not discard a completed translation.
  return result;
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
    const tasks = [...pending.values()].filter(p => p.type === 'translate' || p.type === 'provider-test');
    if (tasks.length) { await native('cancel'); await Promise.all(tasks.map(p => p.done)); }
    await Promise.all(tabIds.map(id => chrome.tabs.sendMessage(id,{type:'sulsul-provider-changed',providerRevision}).catch(() => {})));
    return await native('settings-save',data);
  } finally { changingProvider = false; }
}

async function cancelTab(tabId, nextUrl) {
  const tasks = [...pending.values()].filter(p => p.type === 'translate' && p.tabId === tabId && (!nextUrl || p.sourceUrl?.split('#')[0] !== nextUrl.split('#')[0]));
  if (tasks.length) {
    await native('cancel');
    // Cancellation acknowledgement precedes process exit. Let it finish before starting the next page.
    await Promise.all(tasks.map(p => p.done));
  }
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
  else if (message.type === 'health' && extensionPage) task = native('health');
  else if (message.type === 'login' && extensionPage) task = native('login');
  else if (message.type === 'settings-get' && extensionPage) task = native('settings-get');
  else if (message.type === 'settings-save' && extensionPage) task = saveProvider(message.data);
  else if (message.type === 'provider-test' && extensionPage) task = native('provider-test');
  else if (message.type === 'ollama-models' && extensionPage) task = native('ollama-models',message.data);
  else if (message.type === 'clear-cache' && extensionPage) task = cacheWrites.promise.catch(() => {}).then(() => chrome.storage.local.clear());
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
chrome.commands.onCommand.addListener(async command => {
  if (command !== 'toggle-reading') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await chrome.tabs.sendMessage(tab.id, { type: 'sulsul-toggle' });
  } catch {} // Chrome internal pages cannot be modified.
});
