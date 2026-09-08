import {randomUUID} from 'node:crypto';
import {ensureAccountRuntime,ACCOUNT_CLIS} from './account-runtime.mjs';
import {CodexConnection,accountError} from './account-providers.mjs';

export function accountLoginURL(id,value) {
  if(id!=='codex')return null;
  try{
    const url=new URL(value);
    const origins=['https://auth.openai.com','https://chatgpt.com'];
    if(url.protocol==='https:'&&!url.username&&!url.password&&origins.includes(url.origin))return url.href;
  }catch{}
  return null;
}
export class AccountLoginSession {
  constructor(config,provider,verify,{ensure=ensureAccountRuntime,Connection=CodexConnection,timeoutMs=600_000}={}) {
    if(provider!=='codex')throw new Error('술술은 ChatGPT 계정 연결만 지원합니다.');
    this.config=config;this.provider=provider;this.verify=verify;this.ensure=ensure;this.Connection=Connection;this.timeoutMs=timeoutMs;
    this.id=randomUUID();this.state='starting';this.label=ACCOUNT_CLIS[provider].label;
    this.message=`공식 ${this.label} 연결 프로그램을 준비하고 있어요. 첫 연결은 다운로드가 필요합니다.`;
    this.controller=new AbortController();
  }
  get active(){return ['starting','waiting','verifying'].includes(this.state);}
  snapshot(){return {sessionId:this.id,provider:this.provider,state:this.state,message:this.message,flow:'browser',...(this.state==='waiting'&&this.url?{url:this.url}:{})};}
  async start(){
    this.timer=setTimeout(()=>this.fail('연결 시간이 지났습니다. 다시 연결해 주세요.'),this.timeoutMs);
    try{
      const runtime=await this.ensure(this.config,this.provider,this.controller.signal);if(!this.active)return;
      if(this.provider==='codex'){
        const client=this.client=new this.Connection(runtime);
        client.on('closed',()=>{if(this.state==='starting'||this.state==='waiting')this.fail('ChatGPT 연결이 끊겼습니다. 다시 연결해 주세요.');});
        await client.initialize();
        const auth=await client.request('account/read');
        if(auth.account?.type==='chatgpt'){await this.check();return;}
        const completed=params=>{if(params.loginId===this.loginId){params.success?void this.check():this.fail('ChatGPT 로그인을 완료하지 못했습니다. 다시 연결해 주세요.');}};
        client.on('notification',(method,params)=>{
          if(method==='account/login/completed'){if(!this.loginId)this.completion=params;else completed(params);}
        });
        const login=await client.request('account/login/start',{type:'chatgpt'});
        if(!this.active)return;
        this.loginId=login.loginId;this.url=accountLoginURL('codex',login.authUrl);
        if(!this.url)throw accountError('codex');
        if(this.completion)completed(this.completion);
      }
      if(!this.active||this.state==='verifying')return;
      this.state='waiting';this.message=`${this.label} 공식 로그인 창에서 연결을 완료해 주세요. 완료되면 이 화면에 자동으로 반영됩니다.`;
    }catch(error){if(this.active)this.fail(error.message || '공식 연결 프로그램을 준비하지 못했습니다.');}
  }
  submit(){throw new Error('인증 코드는 공식 로그인 창에서만 입력해 주세요.');}
  async check(){
    if(!this.active||this.state==='verifying')return;
    this.state='verifying';this.message=`짧은 예문으로 ${this.label} 연결을 확인하고 있어요.`;this.dispose();
    try{
      await this.verify(AbortSignal.any([this.controller.signal,AbortSignal.timeout(60_000)]));
      if(this.controller.signal.aborted)return;
      this.state='connected';this.message=`${this.label} 계정을 연결했어요. 이제 번역을 시작할 수 있습니다.`;this.cleanup();
    }catch(error){if(this.active)this.fail(error.message||'ChatGPT 연결을 확인하지 못했습니다. 다시 연결해 주세요.');}
  }
  dispose(){this.url=null;this.client?.close();this.client=null;}
  cleanup(){clearTimeout(this.timer);this.dispose();}
  fail(message){if(!this.active)return;this.state='failed';this.message=message;this.controller.abort();this.cleanup();}
  cancel(){if(this.active){this.state='canceled';this.message='계정 연결을 취소했어요.';this.controller.abort();this.cleanup();}return this.snapshot();}
}
