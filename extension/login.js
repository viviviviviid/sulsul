const $=id=>document.getElementById(id);
let sessionId,timer;
async function rpc(type,data){const reply=await chrome.runtime.sendMessage({type,data});if(!reply?.ok)throw new Error(reply?.error||'연결 프로그램을 확인해 주세요.');return reply.result;}
function failure(error){clearTimeout(timer);$('connection').hidden=true;$('signin').hidden=true;$('status').textContent=error.message;$('status').className='error';$('retry').hidden=false;}
function render(result){
  if(!result?.sessionId||result.provider!=='codex'||result.flow!=='browser')throw new Error('ChatGPT 전용 연결 프로그램으로 업데이트해 주세요.');
  sessionId=result.sessionId;$('status').textContent=result.message;$('status').className=result.state==='failed'?'error':'';
  $('retry').hidden=!['failed','canceled'].includes(result.state);$('done').hidden=result.state!=='connected';$('signin').hidden=true;
  if(result.state==='waiting'&&result.url){
    const url=new URL(result.url);
    if(!['https://auth.openai.com','https://chatgpt.com'].includes(url.origin)||url.username||url.password)throw new Error('공식 로그인 주소를 확인하지 못했습니다.');
    $('signin').href=url.href;$('signin').hidden=false;
  }
  if(['starting','waiting','verifying'].includes(result.state))timer=setTimeout(poll,1000);else $('connection').hidden=true;
}
async function poll(){try{render(await rpc('login-status',{sessionId}));}catch(error){failure(error);}}
async function start(){clearTimeout(timer);$('connection').hidden=false;$('signin').hidden=true;$('retry').hidden=true;$('done').hidden=true;
  try{const settings=await rpc('settings-get');if(settings.selected!=='codex'||settings.connectionCheck!=='account-only')throw new Error('AI 호출 없는 로그인 확인을 위해 연결 프로그램을 최신 버전으로 업데이트해 주세요.');render(await rpc('login'));}catch(error){failure(error);}}
$('cancel').addEventListener('click',async()=>{clearTimeout(timer);try{render(await rpc('login-cancel',{sessionId}));}catch(error){failure(error);}});
$('retry').addEventListener('click',start);start();
