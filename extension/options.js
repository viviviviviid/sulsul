const $=id=>document.getElementById(id);
let saved,dirty=false,busy=false;
const status=(text,error=false)=>{$('status').textContent=text;$('status').className=error?'error':'';};
async function rpc(type,data){const reply=await chrome.runtime.sendMessage({type,data});if(!reply?.ok)throw new Error(reply?.error||'연결 프로그램을 확인해 주세요.');return reply.result;}
function render(){
  if(saved.selected!=='codex'||!saved.providers?.codex)throw new Error('ChatGPT 전용 연결 프로그램으로 업데이트해 주세요.');
  $('model').value=saved.providers.codex.model;
  $('target-language').value=saved.providers.codex.targetLanguage||'ko';
  $('target-language').disabled=!saved.targetLanguages;
  $('fast').checked=saved.providers.codex.fast===true;
  $('model-choice').value=Array.from($('model-choice').options).some(o=>o.value!=='custom'&&o.value===$('model').value)?$('model').value:'custom';
  $('custom-model').hidden=$('model-choice').value!=='custom';
  $('test').disabled=dirty;$('login').disabled=dirty;
}
async function action(fn){if(busy)return;busy=true;$('fields').disabled=true;
  try{await fn();}catch(error){status(error.message,true);}finally{busy=false;$('fields').disabled=!saved;}}
$('model').addEventListener('input',()=>{dirty=true;$('test').disabled=true;$('login').disabled=true;status('설정을 저장한 뒤 연결을 확인해 주세요.');});
$('target-language').addEventListener('change',()=>$('model').dispatchEvent(new Event('input')));
$('fast').addEventListener('change',()=>$('model').dispatchEvent(new Event('input')));
$('model-choice').addEventListener('change',()=>{
  const custom=$('model-choice').value==='custom';$('custom-model').hidden=!custom;
  if(!custom)$('model').value=$('model-choice').value;
  $('model').dispatchEvent(new Event('input'));
  if(custom)$('model').focus();
});
$('settings').addEventListener('submit',event=>{event.preventDefault();action(async()=>{
  status('번역을 일시중지하고 설정을 저장하고 있어요.');
  saved=await rpc('settings-save',{provider:'codex',model:$('model').value,fast:$('fast').checked,targetLanguage:$('target-language').value});dirty=false;render();status('저장했어요. 페이지에서 이어 읽기를 눌러 주세요.');
});});
$('test').addEventListener('click',()=>action(async()=>{status('짧은 예문으로 ChatGPT 연결을 확인하고 있어요.');status((await rpc('provider-test')).message);}));
$('login').addEventListener('click',()=>chrome.tabs.create({url:chrome.runtime.getURL('login.html')}));
action(async()=>{const result=await rpc('settings-get');if(result.selected!=='codex')throw new Error('ChatGPT 전용 연결 프로그램으로 업데이트해 주세요.');saved=result;render();status('ChatGPT 계정을 연결하면 준비가 끝나요.');});

$('shortcut-settings').addEventListener('click',()=>chrome.tabs.create({url:'chrome://extensions/shortcuts'}));
async function shortcutStatus(){const list=await chrome.commands.getAll();$('shortcut-state').textContent=list.find(c=>c.name==='start-reading')?.shortcut||'지정 안 함';}
shortcutStatus().catch(()=>{});window.addEventListener('focus',()=>shortcutStatus().catch(()=>{}));
$('clear-cache').addEventListener('click',()=>action(async()=>{await rpc('clear-cache');status('저장된 번역을 지웠어요.');}));
