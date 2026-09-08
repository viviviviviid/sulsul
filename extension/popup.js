const $ = id => document.getElementById(id);
let tabId, available = false;
function showState(s) {
  $('button-text').textContent = s.failed ? '다시 시도' : s.mode === 'running' ? '일시중지' : s.mode === 'paused' ? '이어 읽기' : '쉽게 읽기';
  $('restore').hidden = !s.translated;
  $('end').hidden = !s.mode || s.mode === 'off';
  $('progress').textContent = s.message || '';
}
async function rpc(type) {
  const result = await chrome.runtime.sendMessage({ type });
  if (!result?.ok) throw new Error(result?.error || '연결 실패');
  return result.result;
}
async function init() {
  const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
  $('page-title').textContent = tab?.title || '현재 페이지';
  if (tab?.id && /^https?:/.test(tab.url || '')) {
    tabId = tab.id;
    try {
      await chrome.scripting.executeScript({ target:{tabId}, files:['content.js'] });
      showState(await chrome.tabs.sendMessage(tabId,{type:'sulsul-state'}));
      available = true; $('translate').disabled = false;
    } catch { $('button-text').textContent = '이 페이지는 번역할 수 없어요'; }
  } else $('button-text').textContent = '웹페이지에서 열어 주세요';
  try {
    const status = await rpc('health');
    $('model-name').textContent = status.modelLabel || 'ChatGPT · 기본 모델';
    $('model-name').title = status.model || '';
    $('connection-text').textContent = status.message;
    $('connection-dot').className = 'status-dot ' + (status.loginCached ? 'ready' : 'error');
    const account = status.provider==='codex'?'ChatGPT':null;
    $('login').hidden = !account;
    $('login').textContent = account + (status.loginCached ? ' 계정 다시 연결' : ' 계정 연결');
    if (!account) {$('connection-text').textContent='ChatGPT 전용 연결 프로그램으로 업데이트해 주세요.';$('setup').hidden=false;}
  } catch(e) {
    $('connection-text').textContent = e.message;
    $('connection-dot').className = 'status-dot error'; $('setup').hidden = false;
  }
}
$('translate').addEventListener('click', async () => {
  if (!available) return;
  try { showState(await chrome.tabs.sendMessage(tabId,{type:'sulsul-toggle'})); }
  catch { $('progress').textContent = '페이지를 새로고침한 뒤 다시 시도해 주세요.'; }
});
$('restore').addEventListener('click', async () => showState(await chrome.tabs.sendMessage(tabId,{type:'sulsul-restore'})));
$('end').addEventListener('click', async () => showState(await chrome.tabs.sendMessage(tabId,{type:'sulsul-end'})));
$('login').addEventListener('click', async () => {
  try { await chrome.tabs.create({url:chrome.runtime.getURL('login.html')}); }
  catch(e) { $('progress').textContent=e.message; }
});
$('clear-cache').addEventListener('click', async () => {
  try { await rpc('clear-cache'); $('progress').textContent='이 PC에 저장된 번역을 지웠어요.'; }
  catch(e) { $('progress').textContent=e.message; }
});
chrome.runtime.onMessage.addListener((msg,sender) => { if (msg.type==='sulsul-state' && sender.tab?.id===tabId) showState(msg.state); });
init().catch(e => { $('progress').textContent=e.message; });
