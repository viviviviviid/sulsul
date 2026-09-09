const $=id=>document.getElementById(id);
let tabId,available=false,connection='checking',reader={mode:'off'},working=false;
async function rpc(type){const reply=await chrome.runtime.sendMessage({type});if(!reply?.ok)throw new Error(reply?.error||'연결을 확인해 주세요.');return reply.result;}
function render(){
 const connected=connection==='ready';
 $('translate').disabled=working||connection==='checking'||(connected&&!available);
 $('button-text').textContent=connection==='checking'?'연결 확인 중':connection==='install'?'연결 프로그램 설치':connection==='login'?'ChatGPT 연결':!available?'웹페이지에서 실행해 주세요':reader.failed?'다시 시도':reader.mode==='running'?'일시중지':reader.mode==='paused'?'이어서 번역':'번역 시작';
 $('restore').hidden=!connected||!reader.translated;
 $('end').hidden=!connected||!reader.mode||reader.mode==='off';
 $('hint').hidden=!connected||!available||reader.failed;
 $('progress').textContent=reader.failed?reader.message:reader.skipped?'번역하지 못한 문단의 ! 표시를 확인해 주세요.':reader.busy?'번역 중 · '+reader.complete+' / '+reader.total:reader.mode==='paused'?'자동 번역을 멈췄어요.':reader.translated?'번역 완료':'';
}
async function act(type){if(!available||working)return;working=true;render();try{reader=await chrome.tabs.sendMessage(tabId,{type});}catch{reader.failed=true;reader.message='페이지를 새로고침하고 다시 실행해 주세요.';}finally{working=false;render();}}
async function loadConnection(){
 try{const status=await rpc('health');connection=status.provider!=='codex'?'install':status.loginCached?'ready':'login';}
 catch{connection='install';}
 $('connection-text').textContent=connection==='ready'?'ChatGPT 연결됨':connection==='login'?'계정 연결 필요':'연결 프로그램 필요';
 $('connection-dot').className='status-dot '+(connection==='ready'?'ready':'error');render();
 if(connection==='ready')try{const settings=await rpc('settings-get');const lang=settings.providers?.codex?.targetLanguage||'ko';$('language').textContent=({ko:'한국어',en:'English',ja:'日本語','zh-Hans':'简体中文','zh-Hant':'繁體中文',es:'Español',fr:'Français',de:'Deutsch'})[lang]||lang;}catch{}
}
async function shortcuts(){
 const commands=await chrome.commands.getAll();const key=commands.find(c=>c.name==='start-reading')?.shortcut;
 const saved=await chrome.storage.local.get('shortcut-choice');
 $('shortcut').textContent=key||'단축키 설정';$('shortcut').title=key?'술술 실행 · 변경하기':'Chrome에서 실행 키를 지정하세요.';
 $('shortcut-prompt').hidden=!!saved['shortcut-choice'];
 $('shortcut-help').textContent=key?'현재 '+key+'로 실행할 수 있어요.':'Chrome 설정에서 술술 실행에 Alt + Shift + S를 지정해 주세요. 다른 확장이 쓰고 있다면 다른 키를 선택하세요.';
 $('shortcut-yes').textContent=key?'이 키 사용':'설정하기';
 $('shortcut-no').textContent=key?'변경하기':'사용 안 함';
 $('shortcut-yes').onclick=async()=>{if(key){await chrome.storage.local.set({'shortcut-choice':'accepted'});$('shortcut-prompt').hidden=true;}else{await chrome.storage.local.set({'shortcut-choice':'pending'});await chrome.tabs.create({url:'chrome://extensions/shortcuts'});window.close();}};
 $('shortcut-no').onclick=async()=>{if(key){await chrome.tabs.create({url:'chrome://extensions/shortcuts'});window.close();}else{await chrome.storage.local.set({'shortcut-choice':'declined'});$('shortcut-prompt').hidden=true;}};
 if(saved['shortcut-choice']==='pending'){
  if(key){await chrome.storage.local.set({'shortcut-choice':'accepted'});}
  else{$('shortcut-prompt').hidden=false;$('shortcut-heading').textContent='아직 단축키가 지정되지 않았어요.';$('shortcut-no').textContent='나중에';}
 }
}
$('translate').addEventListener('click',async()=>{if(connection==='install')return chrome.tabs.create({url:chrome.runtime.getURL('setup.html')});if(connection==='login')return chrome.tabs.create({url:chrome.runtime.getURL('login.html')});await act('sulsul-toggle');});
$('restore').addEventListener('click',()=>act('sulsul-restore'));
$('end').addEventListener('click',()=>act('sulsul-end'));
$('shortcut').addEventListener('click',()=>chrome.tabs.create({url:'chrome://extensions/shortcuts'}));
chrome.runtime.onMessage.addListener((msg,sender)=>{if(msg.type==='sulsul-state'&&sender.tab?.id===tabId){reader=msg.state;render();}});
async function init(){
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});$('page-title').textContent=tab?.title||'웹페이지를 열어 주세요';
 if(Number.isInteger(tab?.id)&&/^https?:/.test(tab.url||'')){tabId=tab.id;try{await chrome.scripting.executeScript({target:{tabId},files:['content.js']});reader=await chrome.tabs.sendMessage(tabId,{type:'sulsul-state'});available=true;}catch{}}
 render();await loadConnection();
}
init().catch(()=>{$('progress').textContent='팝업을 닫고 다시 열어 주세요.';});
shortcuts().catch(()=>{$('shortcut').textContent='단축키 설정';});
window.addEventListener('focus',()=>{shortcuts().catch(()=>{});loadConnection().catch(()=>{});});
