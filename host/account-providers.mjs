import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {buildPrompt,parseTranslation,translationSchema,TARGET_LANGUAGES,validateTargetLanguage} from './core.mjs';
import {accountPaths,accountEnvironment} from './account-runtime.mjs';
import {normalizeUsage,estimateCost} from './usage.mjs';

export function accountError(id,text='') {
  const label='ChatGPT';
  if(/quota|rate.?limit|usage.?limit|429|exhaust/i.test(text))return new Error(`${label} 사용 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.`);
  if(/authenticat|oauth|login|credential|401|token.*(?:expir|invalid)|subscription/i.test(text))return new Error(`${label} 계정 연결이 필요합니다. ChatGPT 설정에서 계정을 연결해 주세요.`);
  return new Error(`${label} 연결 또는 응답을 확인하지 못했습니다. 연결 테스트를 다시 실행해 주세요.`);
}
// Disable external capabilities; the read-only sandbox also blocks built-in patches.
export function codexArguments(fast=false) {
  const disabled=['shell_tool','unified_exec','code_mode','code_mode_host','multi_agent','multi_agent_v2','plugins','apps','browser_use','computer_use','image_generation','view_image','goals','hooks','memories','skill_search','tool_suggest','sleep_tool','workspace_dependencies'];
  const config={web_search:'disabled',forced_login_method:'chatgpt',project_doc_max_bytes:0,'skills.bundled.enabled':false,'skills.include_instructions':false,'tools.update_plan.enabled':false,'analytics.enabled':false,'agents.enabled':false};
  config['features.fast_mode']=fast;
  if(fast)config.service_tier='fast';
  return ['app-server','--listen','stdio://',...disabled.flatMap(name=>['--disable',name]),...Object.entries(config).flatMap(([key,value])=>['-c',key+'='+JSON.stringify(value)])];
}
export class CodexConnection extends EventEmitter {
  constructor(runtime,{spawnProcess=spawn,args=codexArguments()}={}) {
    super();this.sequence=0;this.pending=new Map();this.buffer='';this.bytes=0;this.closed=false;
    this.child=spawnProcess(runtime.cli,args,{cwd:runtime.workspace,env:accountEnvironment(runtime),shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.child.stdout.setEncoding('utf8');this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data',()=>{});this.child.stdin.on('error',()=>{});
    this.child.stdout.on('data',chunk=>{
      this.bytes+=Buffer.byteLength(chunk);if(this.bytes>8_000_000)return this.close(accountError('codex'));
      this.buffer+=chunk;let index;
      while((index=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,index);this.buffer=this.buffer.slice(index+1);if(!line.trim())continue;
        let message;try{message=JSON.parse(line);}catch{return this.close(accountError('codex'));}
        if(message.id!==undefined&&message.method){
          // Translation must never execute a requested external action.
          this.child.stdin.write(JSON.stringify({id:message.id,error:{code:-32601,message:'Tools are unavailable in this translator.'}})+'\n');continue;
        }
        const task=this.pending.get(message.id);
        if(task){this.pending.delete(message.id);clearTimeout(task.timer);message.error?task.reject(accountError('codex',message.error.message)):task.resolve(message.result);}
        else if(message.method)this.emit('notification',message.method,message.params);
      }
    });
    this.child.on('error',()=>this.close(accountError('codex')));
    this.child.on('close',()=>this.close(accountError('codex')));
  }
  request(method,params={},timeout=15000) {
    if(this.closed)return Promise.reject(accountError('codex'));
    const id=++this.sequence;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(accountError('codex'));},timeout);
      this.pending.set(id,{resolve,reject,timer});
      this.child.stdin.write(JSON.stringify({id,method,params})+'\n');
    });
  }
  async initialize(){await this.request('initialize',{clientInfo:{name:'sulsul',title:'술술',version:'0.13.3'}});this.child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n');}
  close(error=accountError('codex')) {
    if(this.closed)return;this.closed=true;
    for(const task of this.pending.values()){clearTimeout(task.timer);task.reject(error);}this.pending.clear();
    try{this.child.kill();}catch{}this.emit('closed',error);
  }
}
export async function checkAccountConnection(config,signal,{Connection=CodexConnection}={}) {
  const runtime=accountPaths(config,'codex');
  if(!fs.existsSync(runtime.cli))throw new Error('ChatGPT 설정에서 계정 연결을 먼저 눌러 주세요.');
  const deadline=AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(60_000)]);
  const client=new Connection(runtime,{args:codexArguments(false)}),abort=()=>client.close(new Error('연결 확인을 중지했습니다.'));
  deadline.addEventListener('abort',abort,{once:true});
  try{
    if(deadline.aborted)throw new Error('연결 확인을 중지했습니다.');
    await client.initialize();
    const auth=await client.request('account/read',{refreshToken:true},45_000);
    if(deadline.aborted)throw new Error('연결 확인을 중지했습니다.');
    if(auth.account?.type!=='chatgpt')throw accountError('codex','subscription');
    fs.writeFileSync(path.join(runtime.profile,'verified.json'),JSON.stringify({at:Date.now()}));
    return {message:'ChatGPT 로그인 확인 완료 · AI를 호출하지 않았어요.'};
  }finally{deadline.removeEventListener('abort',abort);client.close();}
}

export async function translateAccount(config,provider,data,signal,{Connection=CodexConnection}={}) {
  const runtime=accountPaths(config,provider.id);
  if(!fs.existsSync(runtime.cli))throw new Error('ChatGPT 설정에서 계정 연결을 먼저 눌러 주세요.');
  const deadline=AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(240_000)]);
  const prompt=buildPrompt(data,{cli:false,keyed:true,targetLanguage:provider.targetLanguage}),schema=translationSchema(data);let result;
  const telemetry={model:provider.model,modelResolved:false,fast:provider.fast===true,serviceTier:null,usage:null,cost:null,rerouted:false};
  const finishTelemetry=()=>({...telemetry,cost:telemetry.modelResolved?estimateCost(telemetry.model,telemetry.usage,telemetry):null});
  {
    const client=new Connection(runtime,{args:codexArguments(provider.fast===true)}),abort=()=>client.close(new Error('번역을 중지했습니다.'));
    deadline.addEventListener('abort',abort,{once:true});
    try{
      if(deadline.aborted)throw new Error('번역을 중지했습니다.');
      await client.initialize();
      const auth=await client.request('account/read');if(auth.account?.type!=='chatgpt')throw accountError('codex','subscription');
      const started=await client.request('thread/start',{cwd:runtime.workspace,ephemeral:true,sandbox:'read-only',approvalPolicy:'never',model:provider.model==='default'?null:provider.model,baseInstructions:`Translate supplied webpage text into clear ${TARGET_LANGUAGES[validateTargetLanguage(provider.targetLanguage)]}. Return only the requested JSON. Do not use tools.`});
      const {thread}=started;
      if(typeof started.model==='string'&&started.model.length<=160){telemetry.model=started.model;telemetry.modelResolved=true;}
      telemetry.serviceTier=typeof started.serviceTier==='string'?started.serviceTier:null;
      result=await new Promise((resolve,reject)=>{
        let text='';
        const closed=error=>{cleanup();reject(error);};
        const notification=(method,params)=>{
          if(params?.threadId!==thread.id)return;
          // Total is a cumulative snapshot for this fresh, ephemeral thread. Never sum notifications.
          if(method==='thread/tokenUsage/updated')telemetry.usage=normalizeUsage(params.tokenUsage?.total);
          if(method==='model/rerouted'){telemetry.rerouted=true;if(typeof params.toModel==='string'&&params.toModel.length<=160)telemetry.model=params.toModel;}
          if(method==='item/completed'&&params.item?.type==='agentMessage')text=params.item.text;
          if(method==='turn/completed'){
            cleanup();
            try{if(params.turn?.status!=='completed')throw accountError('codex',params.turn?.error?.message);resolve(parseTranslation(text,data));}catch(error){reject(error);}
          }
        };
        const cleanup=()=>{client.off('closed',closed);client.off('notification',notification);};
        client.on('closed',closed);client.on('notification',notification);
        client.request('turn/start',{threadId:thread.id,input:[{type:'text',text:prompt}],effort:'low',outputSchema:schema}).catch(error=>{cleanup();reject(error);});
      });
    }catch(error){error.telemetry=finishTelemetry();throw error;}
    finally{deadline.removeEventListener('abort',abort);client.close();}
  }
  if(deadline.aborted)throw Object.assign(new Error('번역을 중지했습니다.'),{telemetry:finishTelemetry()});
  try{fs.writeFileSync(path.join(runtime.profile,'verified.json'),JSON.stringify({at:Date.now()}));}catch{}
  return {...result,telemetry:finishTelemetry()};
}
