import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pty from 'node-pty';
import {LoginSession,oauthURL} from '../host/login-session.mjs';

const url='https://accounts.google.com/o/oauth2/auth?response_type=code&state=test-state&code_challenge=test-challenge&code_challenge_method=S256&redirect_uri=https%3A%2F%2Fantigravity.google%2Foauth-callback';
const until=async fn=>{const end=Date.now()+5000;while(!fn()){if(Date.now()>end)throw new Error('login state timed out');await new Promise(r=>setTimeout(r,10));}};
test('only complete official Google PKCE URLs can be shown',()=>{
  assert.equal(oauthURL('Open '+url+'\n'),url);
  for(const value of [url.replace('https:','http:'),url.replace('accounts.google.com','accounts.google.com.evil.test'),url.replace('response_type=code','response_type=token'),url.replace('test-state',''),url.replace('S256','plain'),url.replace('antigravity.google','evil.test')])assert.equal(oauthURL(value),null);
});

async function fixture(verify, timeoutMs) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sulsul-login-test-'));
  const script=path.join(root,'cli.cjs');
  fs.writeFileSync(script,`
process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');let stage=0;
process.stdout.write('Select login method:\\n > 1. Google OAuth\\n');
process.stdin.on('data',data=>{
 if(!stage&&data.includes('\\r')){stage=1;process.stdout.write(${JSON.stringify(url)}+'\\n authorization code...');}
 else if(stage===1&&data.includes('\\r')){stage=2;process.stdout.write(data.startsWith('invalid')?'Authentication failed':'Choose your color scheme:');}
});
`);
  const session=new LoginSession({cli:process.execPath,profile:root,workspace:root},verify,{spawn:(file,args,opts)=>pty.spawn(file,[script],opts),timeoutMs});
  await session.start();
  return {session,dispose(){session.cancel();fs.rmSync(root,{recursive:true,force:true});}};
}
test('real background PTY accepts a code, exits, and reports connected only after verification',{timeout:10000},async()=>{
  let finish;const verified=new Promise(resolve=>{finish=resolve;});let calls=0;
  const f=await fixture(async()=>{calls++;await verified;});
  try{
    await until(()=>f.session.state==='waiting');assert.equal(f.session.snapshot().url,url);
    assert.throws(()=>f.session.submit('a\n/quit'),/인증 코드/);
    f.session.submit('valid-test-code');
    await until(()=>f.session.state==='verifying');
    assert.equal(f.session.pty,null);assert.equal(calls,1);assert.equal(f.session.snapshot().url,undefined);
    assert.equal(JSON.stringify(f.session.snapshot()).includes('valid-test-code'),false);
    finish();await until(()=>f.session.state==='connected');assert.equal(f.session.active,false);
  }finally{finish();f.dispose();}
});
test('invalid authentication and cancellation never report connected',{timeout:10000},async()=>{
  let verified=false;const f=await fixture(async()=>{verified=true;});
  try{await until(()=>f.session.state==='waiting');f.session.submit('invalid-test-code');await until(()=>f.session.state==='failed');assert.equal(verified,false);assert.equal(f.session.pty,null);}finally{f.dispose();}
  const g=await fixture(async()=>{});
  try{await until(()=>g.session.state==='waiting');assert.equal(g.session.cancel().state,'canceled');assert.equal(g.session.pty,null);assert.throws(()=>g.session.submit('valid-test-code'));}finally{g.dispose();}
});
test('login timeout closes the background process',{timeout:10000},async()=>{
  const f=await fixture(async()=>{},400);
  try{await until(()=>f.session.state==='failed');assert.match(f.session.snapshot().message,/시간/);assert.equal(f.session.pty,null);}finally{f.dispose();}
});
