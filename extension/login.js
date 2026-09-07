const $=id=>document.getElementById(id);
let sessionId, timer, submitted=false, busy=false;
async function rpc(type,data) {
  const reply=await chrome.runtime.sendMessage({type,data});
  if(!reply?.ok)throw new Error(reply?.error || '연결 프로그램을 확인해 주세요.');
  return reply.result;
}
function failure(error) {
  clearTimeout(timer);$('fields').disabled=true;$('code').value='';$('google').hidden=true;
  $('status').textContent=error.message;$('status').className='error';$('retry').hidden=false;
}
function render(result) {
  if(!result?.sessionId || !result.state)throw new Error('새 로그인 화면을 사용하려면 술술 연결 프로그램을 업데이트해 주세요.');
  sessionId=result.sessionId;$('status').textContent=result.message;$('status').className=result.state==='failed'?'error':'';
  const waiting=result.state==='waiting';
  $('fields').disabled=!waiting || submitted;
  $('cancel').disabled=false;
  $('retry').hidden=!['failed','canceled'].includes(result.state);
  $('done').hidden=result.state!=='connected';
  $('google').hidden=true;
  if(waiting && result.url && !submitted) {
    const url=new URL(result.url);
    if(url.origin!=='https://accounts.google.com' || url.username || url.password)throw new Error('Google 로그인 주소를 확인하지 못했습니다.');
    $('google').href=url.href;$('google').hidden=false;
  }
  if(['starting','waiting','verifying'].includes(result.state))timer=setTimeout(poll,1000);
  else {$('code').value='';$('connection').hidden=true;}
}
async function poll(){try{render(await rpc('login-status',{sessionId}));}catch(error){failure(error);}}
async function start(){
  clearTimeout(timer);submitted=false;$('code').value='';$('fields').disabled=true;$('connection').hidden=false;$('retry').hidden=true;$('done').hidden=true;
  try{render(await rpc('login'));}catch(error){failure(error);}
}
$('connection').addEventListener('submit',async event=>{
  event.preventDefault();if(busy || submitted)return;busy=true;clearTimeout(timer);$('fields').disabled=true;
  let code=$('code').value.trim();$('code').value='';
  try{const result=await rpc('login-code',{sessionId,code});submitted=true;render(result);}catch(error){failure(error);}finally{code='';busy=false;}
});
$('cancel').addEventListener('click',async()=>{clearTimeout(timer);try{render(await rpc('login-cancel',{sessionId}));}catch(error){failure(error);}});
$('retry').addEventListener('click',start);
start();
