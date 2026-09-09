import fs from 'node:fs';
import path from 'node:path';
import {accountPaths} from './account-runtime.mjs';
import {translateAccount,checkAccountConnection} from './account-providers.mjs';
import {UsageHistory} from './history.mjs';

export class ProviderRouter{
  constructor(config,settings,{translate=translateAccount,history=new UsageHistory(config)}={}){this.config=config;this.settings=settings;this.translateAccount=translate;this.history=history;}
  health(){
    const option=this.settings.public().providers.codex,runtime=accountPaths(this.config,'codex');
    const installed=fs.existsSync(runtime.cli),loginCached=fs.existsSync(path.join(runtime.profile,'verified.json'));
    return {protocol:1,installed,loginCached,provider:'codex',model:option.model,modelLabel:option.model==='default'?'ChatGPT · 기본 모델':'ChatGPT · '+option.model,
      message:!installed?'ChatGPT 연결을 누르면 공식 연결 프로그램을 준비합니다.':loginCached?'이전에 ChatGPT 연결을 확인했어요.':'ChatGPT 계정을 연결해 주세요.'};
  }
  check(signal){return checkAccountConnection(this.config,signal);}
  async translate(data,signal,expectedScope,kind='translation'){
    const state=this.settings.read();
    if(expectedScope&&expectedScope!==this.settings.public(state).scope)throw new Error('설정이 변경되었습니다. 이어 읽기를 다시 눌러 주세요.');
    const provider=await this.settings.credentials(state),entry=this.history.begin(provider,data,kind);
    try{const result=await this.translateAccount(this.config,provider,data,signal);this.history.finish(entry,'success',result.telemetry);return result;}
    catch(error){this.history.finish(entry,signal?.aborted?'canceled':'failed',error.telemetry);throw error;}
  }
}
