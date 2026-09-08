import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {buildPrompt,parseTranslation} from './core.mjs';
import {accountPaths,accountEnvironment} from './account-runtime.mjs';

const schema=JSON.parse(fs.readFileSync(new URL('./translation.schema.json',import.meta.url),'utf8'));
export function accountError(id,text='') {
  const label=id==='codex'?'ChatGPT':'Claude';
  if(/quota|rate.?limit|usage.?limit|429|exhaust/i.test(text))return new Error(`${label} 사용 한도에 도달했습니다. 다른 AI나 API로 자동 전환하지 않습니다.`);
  if(/authenticat|oauth|login|credential|401|token.*(?:expir|invalid)|subscription/i.test(text))return new Error(`${label} 계정 연결이 필요합니다. AI 설정에서 계정을 연결해 주세요.`);
  return new Error(`${label} 연결 또는 응답을 확인하지 못했습니다. 연결 테스트를 다시 실행해 주세요.`);
}
// Disable external capabilities; the read-only sandbox also blocks built-in patches.
export function codexArguments() {
  const disabled=['shell_tool','unified_exec','code_mode','code_mode_host','multi_agent','multi_agent_v2','plugins','apps','browser_use','computer_use','image_generation','view_image','goals','hooks','memories','skill_search','tool_suggest','sleep_tool','workspace_dependencies'];
  const config={web_search:'disabled',forced_login_method:'chatgpt',project_doc_max_bytes:0,'skills.bundled.enabled':false,'skills.include_instructions':false,'tools.update_plan.enabled':false,'analytics.enabled':false,'agents.enabled':false};
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
  async initialize(){await this.request('initialize',{clientInfo:{name:'sulsul',title:'술술',version:'0.8.1'}});this.child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n');}
  close(error=accountError('codex')) {
    if(this.closed)return;this.closed=true;
    for(const task of this.pending.values()){clearTimeout(task.timer);task.reject(error);}this.pending.clear();
    try{this.child.kill();}catch{}this.emit('closed',error);
  }
}
export function claudeArguments(model) {
  return ['--print','--output-format','json','--json-schema',JSON.stringify(schema),'--model',model,'--tools','','--disallowedTools','mcp__*','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--disable-slash-commands','--setting-sources','','--settings','{"disableAllHooks":true,"enableAllProjectMcpServers":false}','--no-session-persistence','--no-chrome','--permission-mode','dontAsk'];
}
export function runClaude(runtime,args,input='',signal,{spawnProcess=spawn}={}) {
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(new Error('번역을 중지했습니다.'));
    const child=spawnProcess(runtime.cli,args,{cwd:runtime.workspace,env:accountEnvironment(runtime),shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let stdout='',stderr='',size=0,settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',abort);try{child.kill();}catch{}error?reject(error):resolve(value);};
    const abort=()=>finish(new Error('번역을 중지했습니다.'));signal?.addEventListener('abort',abort,{once:true});
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdin.on('error',()=>{});
    child.stdout.on('data',chunk=>{size+=Buffer.byteLength(chunk);if(size>4_000_000)return finish(accountError('claude'));stdout+=chunk;});
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-8000);});
    child.on('error',()=>finish(accountError('claude')));
    child.on('close',code=>{if(code!==0)return finish(accountError('claude',stderr+stdout));try{finish(null,JSON.parse(stdout));}catch{finish(accountError('claude'));}});
    child.stdin.end(input);
  });
}
export async function translateAccount(config,provider,data,signal,{Connection=CodexConnection,run=runClaude}={}) {
  const runtime=accountPaths(config,provider.id);
  if(!fs.existsSync(runtime.cli))throw new Error('AI 설정에서 계정 연결을 먼저 눌러 주세요.');
  const deadline=AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(240_000)]);
  const prompt=buildPrompt(data,{cli:false});let result;
  if(provider.id==='claude') {
    const auth=await run(runtime,['auth','status'],'',deadline);
    if(!auth.loggedIn||auth.authMethod!=='claude.ai'||auth.apiProvider!=='firstParty'||!auth.subscriptionType)throw accountError('claude','subscription');
    const output=await run(runtime,claudeArguments(provider.model),prompt,deadline);
    if(output.is_error||output.subtype!=='success')throw accountError('claude',output.result||output.subtype);
    result=parseTranslation(output.structured_output?JSON.stringify(output.structured_output):output.result,data);
  }else{
    const client=new Connection(runtime),abort=()=>client.close(new Error('번역을 중지했습니다.'));
    deadline.addEventListener('abort',abort,{once:true});
    try{
      if(deadline.aborted)throw new Error('번역을 중지했습니다.');
      await client.initialize();
      const auth=await client.request('account/read');if(auth.account?.type!=='chatgpt')throw accountError('codex','subscription');
      const {thread}=await client.request('thread/start',{cwd:runtime.workspace,ephemeral:true,sandbox:'read-only',approvalPolicy:'never',model:provider.model==='default'?null:provider.model,baseInstructions:'Translate supplied webpage text into clear Korean. Return only the requested JSON. Do not use tools.'});
      result=await new Promise((resolve,reject)=>{
        let text='';
        const closed=error=>{cleanup();reject(error);};
        const notification=(method,params)=>{
          if(params?.threadId!==thread.id)return;
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
    }finally{deadline.removeEventListener('abort',abort);client.close();}
  }
  if(deadline.aborted)throw new Error('번역을 중지했습니다.');
  try{fs.writeFileSync(path.join(runtime.profile,'verified.json'),JSON.stringify({at:Date.now()}));}catch{}
  return result;
}
