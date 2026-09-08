import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {accountPaths,accountEnvironment,packageLocation} from '../host/account-runtime.mjs';
import {translateAccount,claudeArguments,codexArguments,accountError} from '../host/account-providers.mjs';
import {AccountLoginSession,accountLoginURL} from '../host/account-login.mjs';

const data={blocks:[{id:'b0',parts:[{id:'t0',text:'Read this paragraph.',locked:false}]}]};
const output={blocks:[{id:'b0',parts:[{id:'t0',text:'이 문단을 읽어 보세요.'}]}]};
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sulsul-accounts-')),config={schema:path.join(root,'host','translation.schema.json')};
  for(const id of ['codex','claude']){
    const runtime=accountPaths(config,id);for(const dir of [runtime.workspace,runtime.profile,path.dirname(runtime.cli)])fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(runtime.cli,'test');
  }
  return {config,dispose(){fs.rmSync(root,{recursive:true,force:true});}};
}
const until=async fn=>{const deadline=Date.now()+3000;while(!fn()){if(Date.now()>deadline)throw new Error('state timeout');await new Promise(r=>setTimeout(r,5));}};

test('account runtimes isolate credentials and never inherit API keys or user hooks',()=>{
  const f=fixture();
  try{
    const runtime=accountPaths(f.config,'codex'),env=accountEnvironment(runtime);
    assert.equal(env.CODEX_HOME,runtime.profile);assert.equal(env.CLAUDE_CONFIG_DIR,runtime.profile);
    for(const name of ['OPENAI_API_KEY','ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','CLAUDE_CODE_OAUTH_TOKEN','NODE_OPTIONS','BASH_ENV'])assert.equal(env[name],undefined);
    assert.notEqual(accountPaths(f.config,'claude').profile,runtime.profile);
    assert.match(packageLocation('codex','darwin','arm64').version,/-darwin-arm64$/);
    assert.match(packageLocation('claude','win32','x64').name,/-win32-x64$/);
    const args=claudeArguments('sonnet');assert.equal(args[args.indexOf('--tools')+1],'');assert.equal(args[args.indexOf('--disallowedTools')+1],'mcp__*');
    assert.ok(args.includes('--no-session-persistence'));assert.ok(codexArguments().includes('forced_login_method="chatgpt"'));
  }finally{f.dispose();}
});

test('Claude uses subscription auth, normalized fragments, and refuses API credentials',async()=>{
  const f=fixture(),calls=[];
  try{
    const run=async(runtime,args,input)=>{
      calls.push({args,input});
      return args[0]==='auth'?{loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty',subscriptionType:'max'}:{subtype:'success',is_error:false,structured_output:output};
    };
    assert.deepEqual((await translateAccount(f.config,{id:'claude',model:'sonnet'},data,null,{run})).blocks,output.blocks);
    assert.match(calls[1].input,/DOCUMENT_DATA/);
    assert.ok(!calls[1].args.some(a=>a.includes(data.blocks[0].parts[0].text)),'page text travels over stdin');
    let translated=false;
    await assert.rejects(translateAccount(f.config,{id:'claude',model:'sonnet'},data,null,{run:async(r,args)=>{
      if(args[0]!=='auth')translated=true;
      return {loggedIn:true,authMethod:'api_key',apiProvider:'firstParty'};
    }}),/계정 연결/);assert.equal(translated,false);
    await assert.rejects(translateAccount(f.config,{id:'claude',model:'sonnet'},data,null,{run:async(r,args)=>args[0]==='auth'?{loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty',subscriptionType:'max'}:{subtype:'error_max_turns'}}),/확인하지 못/);
  }finally{f.dispose();}
});

test('Codex translates a fresh ephemeral read-only thread and validates auth',async()=>{
  const f=fixture(),requests=[];
  class Connection extends EventEmitter{
    async initialize(){}
    async request(method,params){requests.push({method,params});
      if(method==='account/read')return {account:{type:'chatgpt'}};
      if(method==='thread/start')return {thread:{id:'test'}};
      if(method==='turn/start')setTimeout(()=>{
        this.emit('notification','item/completed',{threadId:'other',item:{type:'agentMessage',text:'wrong'}});
        this.emit('notification','item/completed',{threadId:'test',item:{type:'agentMessage',text:JSON.stringify(output)}});
        this.emit('notification','turn/completed',{threadId:'test',turn:{status:'completed'}});
      },1);
      return {};
    }
    close(error){this.emit('closed',error);}
  }
  try{
    assert.deepEqual((await translateAccount(f.config,{id:'codex',model:'default'},data,null,{Connection})).blocks,output.blocks);
    const thread=requests.find(r=>r.method==='thread/start').params;
    assert.equal(thread.ephemeral,true);assert.equal(thread.sandbox,'read-only');assert.equal(thread.approvalPolicy,'never');assert.equal(thread.model,null);
    const turn=requests.find(r=>r.method==='turn/start').params;
    assert.ok(turn.outputSchema);assert.ok(codexArguments().includes('project_doc_max_bytes=0'));
    class APIConnection extends Connection{async request(method,params){if(method==='account/read')return {account:{type:'apiKey'}};return super.request(method,params);}}
    const before=requests.length;await assert.rejects(translateAccount(f.config,{id:'codex',model:'default'},data,null,{Connection:APIConnection}),/계정 연결/);assert.equal(requests.length,before);
    const controller=new AbortController();
    class Held extends Connection{async request(method,params){if(method==='turn/start'){setTimeout(()=>controller.abort(),1);return {};}return super.request(method,params);}}
    await assert.rejects(translateAccount(f.config,{id:'codex',model:'default'},data,controller.signal,{Connection:Held}),/중지/);
  }finally{f.dispose();}
});

test('account login URLs stay on official origins and raw errors never expose credentials',()=>{
  assert.ok(accountLoginURL('codex','https://auth.openai.com/authorize?state=example'));
  assert.ok(accountLoginURL('claude','https://claude.ai/oauth/authorize?state=example'));
  for(const url of ['https://claude.ai.evil.test/','http://claude.ai/','https://user:password@claude.ai/'])assert.equal(accountLoginURL('claude',url),null);
  assert.equal(accountLoginURL('codex','https://claude.ai/'),null);
  assert.ok(!accountError('claude','quota FAKE_SECRET').message.includes('FAKE_SECRET'));
});

test('ChatGPT login waits for official completion and a fresh verification; cancel stops it',async()=>{
  let client,verified=0,finishVerify;
  class Connection extends EventEmitter{
    constructor(){super();client=this;}
    async initialize(){}
    async request(method){return method==='account/read'?{account:null}:{loginId:'login-1',authUrl:'https://auth.openai.com/authorize?state=example'};}
    close(){this.closed=true;this.emit('closed');}
  }
  const verify=()=>{verified++;return new Promise(r=>{finishVerify=r;});};
  const options={ensure:async()=>({}),Connection};
  const session=new AccountLoginSession({},'codex',verify,options);
  try{
    await session.start();assert.equal(session.state,'waiting');assert.equal(session.snapshot().flow,'browser');
    assert.throws(()=>session.submit('fake-code'),/공식 로그인/);
    client.emit('notification','account/login/completed',{loginId:'unrelated',success:true});assert.equal(verified,0);
    client.emit('notification','account/login/completed',{loginId:'login-1',success:true});assert.equal(session.state,'verifying');assert.equal(client.closed,true);
    finishVerify();await until(()=>session.state==='connected');assert.equal(session.snapshot().url,undefined);
  }finally{session.cancel();finishVerify?.();}
  const canceled=new AccountLoginSession({},'codex',async()=>assert.fail('canceled login verified'),options);
  await canceled.start();canceled.cancel();client.emit('notification','account/login/completed',{loginId:'login-1',success:true});assert.equal(canceled.state,'canceled');
});

test('Claude login uses the official process, verifies success and cleans up on timeout',async()=>{
  let child,verified=0,invocation;
  const spawnProcess=(command,args,options)=>{
    invocation={command,args,options};child=new EventEmitter();
    for(const name of ['stdin','stdout','stderr'])child[name]=new PassThrough();
    child.kill=()=>{child.killed=true;};return child;
  };
  const options={ensure:async()=>({cli:'official-claude',profile:os.tmpdir(),workspace:os.tmpdir()}),spawnProcess};
  const session=new AccountLoginSession({},'claude',async()=>{verified++;},options);
  try{
    await session.start();assert.deepEqual(invocation.args,['auth','login']);assert.equal(invocation.options.shell,false);
    child.stdout.write('Open https://claude.ai/oauth/authorize?state=test\n');
    assert.match(session.snapshot().url,/^https:\/\/claude\.ai\//);
    child.emit('close',0);await until(()=>session.state==='connected');assert.equal(verified,1);assert.equal(child.killed,true);
  }finally{session.cancel();}
  const timeout=new AccountLoginSession({},'claude',async()=>assert.fail('timed-out login verified'),{...options,timeoutMs:20});
  await timeout.start();await until(()=>timeout.state==='failed');assert.equal(child.killed,true);
  child.emit('close',0);assert.equal(timeout.state,'failed');
});
