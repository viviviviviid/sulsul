import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {accountPaths,accountEnvironment,packageLocation} from '../host/account-runtime.mjs';
import {translateAccount,checkAccountConnection,codexArguments,accountError} from '../host/account-providers.mjs';
import {AccountLoginSession,accountLoginURL} from '../host/account-login.mjs';

const data={blocks:[{id:'b0',parts:[{id:'t0',text:'Read this paragraph.',locked:false}]}]};
const output={blocks:[{id:'b0',parts:[{id:'t0',text:'이 문단을 읽어 보세요.'}]}]};
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sulsul-accounts-')),config={schema:path.join(root,'host','translation.schema.json')};
  for(const id of ['codex']){
    const runtime=accountPaths(config,id);for(const dir of [runtime.workspace,runtime.profile,path.dirname(runtime.cli)])fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(runtime.cli,'test');
  }
  return {config,dispose(){fs.rmSync(root,{recursive:true,force:true});}};
}
const until=async fn=>{const deadline=Date.now()+3000;while(!fn()){if(Date.now()>deadline)throw new Error('state timeout');await new Promise(r=>setTimeout(r,5));}};

test('connection checks refresh login only, never create a thread or generate tokens',async()=>{
  const f=fixture(),requests=[];let closed=false;
  class Connection extends EventEmitter{
    async initialize(){requests.push('initialize');}
    async request(method,params){requests.push(method);assert.equal(method,'account/read');assert.equal(params.refreshToken,true);return {account:{type:'chatgpt'}};}
    close(){closed=true;}
  }
  try{
    assert.match((await checkAccountConnection(f.config,null,{Connection})).message,/AI를 호출하지/);
    assert.deepEqual(requests,['initialize','account/read']);assert.equal(closed,true);
    assert.ok(fs.existsSync(path.join(accountPaths(f.config,'codex').profile,'verified.json')));
    class NoLogin extends Connection{async request(){return {account:null};}}
    await assert.rejects(checkAccountConnection(f.config,null,{Connection:NoLogin}),/계정 연결/);
    const beforeCancel=requests.length;
    const controller=new AbortController();controller.abort();
    await assert.rejects(checkAccountConnection(f.config,controller.signal,{Connection}),/중지/);
    assert.equal(requests.length,beforeCancel,'canceled verification cannot send requests');
  }finally{f.dispose();}
});

test('account runtimes isolate credentials and never inherit API keys or user hooks',()=>{
  const f=fixture();
  try{
    const runtime=accountPaths(f.config,'codex'),env=accountEnvironment(runtime);
    assert.equal(env.CODEX_HOME,runtime.profile);assert.equal(env.CLAUDE_CONFIG_DIR,undefined);
    for(const name of ['OPENAI_API_KEY','ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','CLAUDE_CODE_OAUTH_TOKEN','NODE_OPTIONS','BASH_ENV'])assert.equal(env[name],undefined);
    assert.throws(()=>accountPaths(f.config,'claude'),/지원하지/);
    assert.match(packageLocation('codex','darwin','arm64').version,/-darwin-arm64$/);
    assert.ok(codexArguments().includes('forced_login_method="chatgpt"'));
  }finally{f.dispose();}
});

test('Codex translates a fresh ephemeral read-only thread and validates auth',async()=>{
  const f=fixture(),requests=[],launches=[];
  class Connection extends EventEmitter{
    constructor(runtime,options){super();launches.push(options.args);}
    async initialize(){}
    async request(method,params){requests.push({method,params});
      if(method==='account/read')return {account:{type:'chatgpt'}};
      if(method==='thread/start')return {thread:{id:'test'},model:'gpt-5.6-luna',serviceTier:'default'};
      if(method==='turn/start')setTimeout(()=>{
        this.emit('notification','item/completed',{threadId:'other',item:{type:'agentMessage',text:'wrong'}});
        const total={inputTokens:1000,cachedInputTokens:200,cacheWriteInputTokens:300,outputTokens:100,reasoningOutputTokens:40,totalTokens:1100};
        this.emit('notification','thread/tokenUsage/updated',{threadId:'other',tokenUsage:{total:{...total,inputTokens:999999}}});
        for(let i=0;i<2;i++)this.emit('notification','thread/tokenUsage/updated',{threadId:'test',tokenUsage:{total,last:{...total,inputTokens:10}}});
        this.emit('notification','item/completed',{threadId:'test',item:{type:'agentMessage',text:JSON.stringify({blocks:{b0:{t0:output.blocks[0].parts[0].text}}})}});
        this.emit('notification','turn/completed',{threadId:'test',turn:{status:'completed'}});
      },1);
      return {};
    }
    close(error){this.emit('closed',error);}
  }
  try{
    const measured=await translateAccount(f.config,{id:'codex',model:'default'},data,null,{Connection});
    assert.deepEqual(measured.blocks,output.blocks);
    assert.equal(measured.telemetry.model,'gpt-5.6-luna');assert.equal(measured.telemetry.usage.inputTokens,1000,'thread snapshots must not be summed or replaced by the last-call count');
    assert.ok(measured.telemetry.cost.usd>0);
    assert.ok(launches[0].includes('features.fast_mode=false'));
    await translateAccount(f.config,{id:'codex',model:'default',fast:true},data,null,{Connection});
    assert.ok(launches[1].includes('features.fast_mode=true'));
    assert.ok(launches[1].includes('service_tier="fast"'));
    const thread=requests.find(r=>r.method==='thread/start').params;
    assert.equal(thread.ephemeral,true);assert.equal(thread.sandbox,'read-only');assert.equal(thread.approvalPolicy,'never');assert.equal(thread.model,null);
    const turn=requests.find(r=>r.method==='turn/start').params;
    assert.deepEqual(turn.outputSchema.properties.blocks.properties.b0.required,['t0']);assert.ok(codexArguments().includes('project_doc_max_bytes=0'));
    class APIConnection extends Connection{async request(method,params){if(method==='account/read')return {account:{type:'apiKey'}};return super.request(method,params);}}
    const before=requests.length;await assert.rejects(translateAccount(f.config,{id:'codex',model:'default'},data,null,{Connection:APIConnection}),/계정 연결/);assert.equal(requests.length,before);
    const controller=new AbortController();
    class Held extends Connection{async request(method,params){if(method==='turn/start'){setTimeout(()=>controller.abort(),1);return {};}return super.request(method,params);}}
    await assert.rejects(translateAccount(f.config,{id:'codex',model:'default'},data,controller.signal,{Connection:Held}),/중지/);
    class Failed extends Connection{async request(method,params){if(method==='turn/start'){setTimeout(()=>{this.emit('notification','thread/tokenUsage/updated',{threadId:'test',tokenUsage:{total:{inputTokens:50,cachedInputTokens:0,cacheWriteInputTokens:0,outputTokens:10,reasoningOutputTokens:0,totalTokens:60}}});this.emit('notification','turn/completed',{threadId:'test',turn:{status:'failed',error:{message:'429'}}});},1);return {};}return super.request(method,params);}}
    await assert.rejects(translateAccount(f.config,{id:'codex',model:'default'},data,null,{Connection:Failed}),error=>error.telemetry.usage.inputTokens===50);
  }finally{f.dispose();}
});

test('account login URLs stay on official origins and raw errors never expose credentials',()=>{
  assert.ok(accountLoginURL('codex','https://auth.openai.com/authorize?state=example'));
  assert.equal(accountLoginURL('claude','https://claude.ai/oauth/authorize?state=example'),null);
  for(const url of ['https://auth.openai.com.evil.test/','http://auth.openai.com/','https://user:password@auth.openai.com/'])assert.equal(accountLoginURL('codex',url),null);
  assert.equal(accountLoginURL('codex','https://claude.ai/'),null);
  assert.ok(!accountError('codex','quota FAKE_SECRET').message.includes('FAKE_SECRET'));
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

test('ChatGPT login timeout and quota verification errors remain actionable',async()=>{
  let client;
  class Connection extends EventEmitter{
    constructor(){super();client=this;}
    async initialize(){}
    async request(method){return method==='account/read'?{account:null}:{loginId:'login',authUrl:'https://auth.openai.com/authorize'};}
    close(){this.closed=true;this.emit('closed');}
  }
  const options={ensure:async()=>({}),Connection};
  const timeout=new AccountLoginSession({},'codex',async()=>assert.fail('expired login verified'),{...options,timeoutMs:20});
  await timeout.start();await until(()=>timeout.state==='failed');assert.equal(client.closed,true);
  const failed=new AccountLoginSession({},'codex',async()=>{throw accountError('codex','429 quota');},options);
  try{await failed.start();client.emit('notification','account/login/completed',{loginId:'login',success:true});await until(()=>failed.state==='failed');assert.match(failed.snapshot().message,/사용 한도/);assert.equal(failed.snapshot().url,undefined);}finally{failed.cancel();}
});
