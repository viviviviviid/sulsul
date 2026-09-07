const $ = id => document.getElementById(id);
const links = {gemini:'https://aistudio.google.com/api-keys',openai:'https://platform.openai.com/api-keys',anthropic:'https://platform.claude.com/settings/keys'};
let saved, dirty = false, busy = false;
const status = (text,error = false) => { $('status').textContent = text; $('status').className = error ? 'error' : ''; };
async function rpc(type,data) {
  const reply = await chrome.runtime.sendMessage({type,data});
  if (!reply?.ok) throw new Error(reply?.error || '연결 프로그램을 확인해 주세요.');
  return reply.result;
}
function markDirty() { dirty = true; $('test').disabled = true; $('login').disabled = true; }
function render() {
  const id = $('provider').value, option = saved.providers[id];
  $('model').value = option.model;
  $('model').placeholder = id === 'ollama' ? '설치한 모델을 불러와 선택하세요' : '모델 ID';
  $('models').replaceChildren();
  if (option.model) { const item = document.createElement('option'); item.value = option.model; $('models').append(item); }
  $('provider-note').textContent = option.note;
  $('key-fields').hidden = !option.key;
  $('endpoint-fields').hidden = id !== 'ollama';
  $('endpoint').value = option.endpoint || 'http://127.0.0.1:11434';
  $('api-key').value = ''; $('clear-key').checked = false;
  $('key-state').textContent = option.hasKey ? '저장된 키 있음' : '키 미등록';
  if (links[id]) $('key-link').href = links[id];
  $('login').hidden = id !== 'antigravity';
  $('test').disabled = dirty; $('login').disabled = dirty;
}
async function action(fn) {
  if (busy) return;
  busy = true; $('fields').disabled = true;
  try { await fn(); } catch(e) { status(e.message,true); }
  finally { busy = false; $('fields').disabled = !saved; }
}
$('provider').addEventListener('change',() => { markDirty(); render(); status('변경 내용을 저장한 뒤 연결을 확인해 주세요.'); });
for (const id of ['model','api-key','endpoint','clear-key']) $(id).addEventListener('input',markDirty);
$('settings').addEventListener('submit',event => {
  event.preventDefault();
  action(async () => {
    status('번역을 일시중지하고 설정을 저장하고 있어요.');
    saved = await rpc('settings-save',{provider:$('provider').value,model:$('model').value,apiKey:$('api-key').value.trim(),clearKey:$('clear-key').checked,endpoint:$('endpoint').value});
    dirty = false; render(); status('저장했어요. 연결 테스트를 하거나 페이지에서 이어 읽기를 눌러 주세요.');
  });
});
$('test').addEventListener('click',() => action(async () => { status('짧은 예문으로 연결을 확인하고 있어요. 최대 1분 정도 걸릴 수 있어요.'); status((await rpc('provider-test')).message); }));
$('login').addEventListener('click',() => action(async () => status((await rpc('login')).message)));
$('load-models').addEventListener('click',() => action(async () => {
  const models = await rpc('ollama-models',{endpoint:$('endpoint').value});
  $('models').replaceChildren(...models.map(name => { const option = document.createElement('option'); option.value = name; return option; }));
  if (!$('model').value && models.length) { $('model').value = models[0]; markDirty(); }
  status(models.length ? '모델 입력란에서 설치한 모델을 고를 수 있어요.' : '설치한 로컬 모델이 없습니다. Ollama에서 모델을 먼저 내려받아 주세요.');
}));
action(async () => {
  saved = await rpc('settings-get');
  $('provider').replaceChildren(...Object.entries(saved.providers).map(([id,value]) => { const option = document.createElement('option'); option.value = id; option.textContent = value.label; return option; }));
  $('provider').value = saved.selected; render(); status('선택한 AI로만 번역합니다. 사용 한도에 도달해도 자동 전환하지 않아요.');
});
