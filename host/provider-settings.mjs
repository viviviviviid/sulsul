import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {PROMPT_VERSION} from './core.mjs';

export const PROVIDERS=Object.freeze({codex:{label:'ChatGPT',model:'default',fast:false,key:false,
  note:'ChatGPT로 로그인합니다. 계정의 Codex 이용 한도가 적용됩니다.'}});
export function providerDefinition(id){if(id!=='codex')throw new Error('술술은 ChatGPT 계정 연결만 지원합니다.');return PROVIDERS.codex;}
export function validateModel(model){
  if(typeof model!=='string'||!model||model.length>160||!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(model))throw new Error('모델 ID를 확인해 주세요.');
  return model;
}
export class ProviderSettings{
  constructor(config){this.config=config;this.file=config.providerSettings||path.join(config.profile,'providers.json');this.writes=Promise.resolve();}
  read(){
    if(!fs.existsSync(this.file))return {selected:'codex',revision:'chatgpt-only-initial',providers:{}};
    try{
      const state=JSON.parse(fs.readFileSync(this.file,'utf8').replace(/^\uFEFF/,''));
      if(!state||!state.providers||typeof state.providers!=='object'||typeof state.revision!=='string')throw new Error();
      // Old provider selections and encrypted keys are never used. Keep the file
      // intact until the user saves settings, and retain an existing Codex model.
      return {selected:'codex',revision:'chatgpt-only:'+state.revision,providers:{codex:{model:state.providers.codex?.model||'default',fast:state.providers.codex?.fast===true}}};
    }catch{throw new Error('설정을 읽지 못했습니다. 설치 안내의 설정 복구 방법을 확인해 주세요.');}
  }
  options(state){return {model:validateModel(state.providers.codex?.model||'default'),fast:state.providers.codex?.fast===true,hasKey:false};}
  public(state=this.read()){
    const option={...PROVIDERS.codex,...this.options(state)};
    const scope=createHash('sha256').update(JSON.stringify([PROMPT_VERSION,'chatgpt-only',state.revision,option])).digest('hex');
    return {selected:'codex',providers:{codex:option},scope};
  }
  async credentials(state=this.read()){return {id:'codex',...this.options(state)};}
  save(data){
    const task=this.writes.catch(()=>{}).then(()=>{
      providerDefinition(data?.provider);
      const model=validateModel(data.model?.trim());
      if(data.fast!==undefined&&typeof data.fast!=='boolean')throw new Error('Fast 설정을 확인해 주세요.');
      const state={selected:'codex',revision:randomUUID(),providers:{codex:{model,fast:data.fast===true}}};
      fs.mkdirSync(path.dirname(this.file),{recursive:true});
      const temporary=this.file+'.tmp';fs.writeFileSync(temporary,JSON.stringify(state,null,2)+'\n',{mode:0o600});fs.renameSync(temporary,this.file);
      return this.public(this.read());
    });
    this.writes=task;return task;
  }
}
