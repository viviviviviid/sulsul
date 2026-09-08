import fs from 'node:fs';
import { buildPrompt, parseTranslation } from './core.mjs';
import { health as cliHealth, translate as cliTranslate } from './runner.mjs';
import { PROVIDERS, localEndpoint, validateModel } from './provider-settings.mjs';
import {accountPaths,ACCOUNT_CLIS} from './account-runtime.mjs';
import {translateAccount} from './account-providers.mjs';
import path from 'node:path';

const schema = JSON.parse(fs.readFileSync(new URL('./translation.schema.json',import.meta.url),'utf8'));
const MAX_RESPONSE = 4_000_000;

// Fixed cloud origins: a page or a pasted endpoint cannot redirect an API credential elsewhere.
export function apiRequest(provider, data) {
  const prompt = buildPrompt(data,{cli:false});
  const headers = { 'Content-Type':'application/json' };
  const { id, model, apiKey } = provider;
  validateModel(model);
  if (id === 'gemini') return {
    url:`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    headers:{...headers,'x-goog-api-key':apiKey},
    body:{contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',responseJsonSchema:schema,maxOutputTokens:16384}}
  };
  if (id === 'openai') return {
    url:'https://api.openai.com/v1/responses', headers:{...headers,Authorization:`Bearer ${apiKey}`},
    body:{model,input:prompt,store:false,max_output_tokens:16384,text:{format:{type:'json_schema',name:'sulsul_translation',strict:true,schema}}}
  };
  if (id === 'anthropic') return {
    url:'https://api.anthropic.com/v1/messages', headers:{...headers,'x-api-key':apiKey,'anthropic-version':'2023-06-01'},
    body:{model,max_tokens:16384,messages:[{role:'user',content:prompt}],output_config:{format:{type:'json_schema',schema}}}
  };
  if (id === 'ollama') return {
    url:localEndpoint(provider.endpoint)+'/api/chat', headers,
    body:{model,stream:false,messages:[{role:'user',content:prompt}],format:schema,options:{num_predict:16384}}
  };
  throw new Error('지원하지 않는 AI입니다.');
}

export async function requestJSON(url, init, fetcher = fetch) {
  let response;
  try { response = await fetcher(url,{...init,redirect:'error'}); }
  catch { throw new Error(init.signal?.aborted ? '번역을 중지했거나 응답 시간이 초과되었습니다.' : 'AI에 연결하지 못했습니다. 인터넷 연결 또는 Ollama 실행 상태를 확인해 주세요.'); }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    // Never echo provider bodies: errors can contain credentials, prompts, or private URLs.
    const messages = { 400:'모델이 이 요청 형식을 지원하지 않습니다. 모델 ID와 구조화 출력 지원 여부를 확인해 주세요.',401:'API 키가 유효하지 않습니다. AI 설정에서 다시 입력해 주세요.',403:'이 API 키 또는 계정에 모델 사용 권한이 없습니다.',404:'모델을 찾지 못했습니다. 모델 ID 또는 Ollama 설치 모델을 확인해 주세요.',429:'AI 사용 한도에 도달했습니다. 다른 AI로 자동 전환하지 않습니다.' };
    throw new Error(messages[response.status] || `AI 요청에 실패했습니다 (HTTP ${response.status}). 잠시 후 다시 시도해 주세요.`);
  }
  const reader = response.body.getReader();
  let bytes = 0; const chunks = [];
  try {
    while (true) {
      const {done,value} = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE) throw new Error('AI 응답이 너무 큽니다.');
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    await reader.cancel().catch(() => {});
    throw new Error(init.signal?.aborted ? '번역을 중지했거나 응답 시간이 초과되었습니다.' : 'AI 응답을 읽지 못했습니다. 원문은 유지됩니다.');
  } finally { reader.releaseLock(); }
}

export function extractText(id, response) {
  if (id === 'gemini') {
    const candidate = response.candidates?.[0];
    if (candidate?.finishReason !== 'STOP') throw new Error('AI가 번역을 끝까지 반환하지 않았습니다. 원문은 유지됩니다.');
    return candidate.content?.parts?.filter(p => !p.thought).map(p => p.text || '').join('');
  }
  if (id === 'openai') {
    if (response.status !== 'completed') throw new Error('AI가 번역을 끝까지 반환하지 않았습니다. 원문은 유지됩니다.');
    return response.output?.filter(o => o.type === 'message').flatMap(o => o.content || []).filter(c => c.type === 'output_text').map(c => c.text).join('');
  }
  if (id === 'anthropic') {
    if (response.stop_reason !== 'end_turn') throw new Error('AI가 번역을 끝까지 반환하지 않았습니다. 원문은 유지됩니다.');
    return response.content?.filter(c => c.type === 'text').map(c => c.text).join('');
  }
  if (id === 'ollama') {
    if (response.done !== true || response.done_reason === 'length') throw new Error('AI가 번역을 끝까지 반환하지 않았습니다. 원문은 유지됩니다.');
    return response.message?.content;
  }
  throw new Error('지원하지 않는 AI입니다.');
}

export async function assertLocalModel(provider, signal, fetcher = fetch) {
  if (/(?:^|[-:/])cloud(?:$|[-:/])/i.test(provider.model)) throw new Error('Ollama의 클라우드 모델은 지원하지 않습니다. PC에 내려받은 모델을 선택해 주세요.');
  const info = await requestJSON(localEndpoint(provider.endpoint)+'/api/show',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:provider.model}),signal},fetcher);
  if (info.remote_host || info.remote_model || !info.model_info || !Object.keys(info.model_info).length) throw new Error('Ollama 로컬 모델인지 확인하지 못했습니다. 내려받은 모델을 선택해 주세요.');
}

export async function translateAPI(provider, data, signal, fetcher = fetch) {
  const started = performance.now();
  const deadline = AbortSignal.timeout(240_000);
  const combined = signal ? AbortSignal.any([signal,deadline]) : deadline;
  const request = apiRequest(provider,data);
  if (provider.id === 'ollama') await assertLocalModel(provider,combined,fetcher);
  const response = await requestJSON(request.url,{method:'POST',headers:request.headers,body:JSON.stringify(request.body),signal:combined},fetcher);
  const parsing = performance.now();
  const result = parseTranslation(extractText(provider.id,response),data);
  return {...result,timings:{providerTotalMs:Math.round(performance.now()-started),responseMs:Math.round(parsing-started),validationMs:Math.round(performance.now()-parsing),attempts:1}};
}

export class ProviderRouter {
  constructor(config, settings) { this.config = config; this.settings = settings; }
  health() {
    const publicSettings = this.settings.public();
    const id = publicSettings.selected, option = publicSettings.providers[id];
    if (id === 'antigravity') return {...cliHealth({...this.config,model:option.model}),provider:id};
    if (ACCOUNT_CLIS[id]) {
      const runtime=accountPaths(this.config,id),installed=fs.existsSync(runtime.cli),loginCached=fs.existsSync(path.join(runtime.profile,'verified.json'));
      return {protocol:1,installed,loginCached,provider:id,model:option.model,modelLabel:`${runtime.label} · ${option.model}`,message:!installed?'계정 연결을 누르면 공식 연결 프로그램을 준비합니다.':loginCached?'최근 번역에서 계정 연결을 확인했어요.':'AI 설정에서 계정을 연결해 주세요.'};
    }
    const ready = !option.key || option.hasKey;
    return {protocol:1,installed:true,provider:id,loginCached:ready,model:option.model,modelLabel:`${PROVIDERS[id].label} · ${option.model || '모델 미선택'}`,message:ready ? 'AI 설정 저장됨 · 연결 테스트로 확인할 수 있어요.' : 'AI 설정에서 API 키를 저장해 주세요.'};
  }
  async translate(data, signal, expectedScope) {
    const state = this.settings.read();
    if (expectedScope && expectedScope !== this.settings.public(state).scope) throw new Error('AI 설정이 변경되었습니다. 이어 읽기를 다시 눌러 주세요.');
    const provider = await this.settings.credentials(state);
    if (provider.id === 'antigravity') return cliTranslate({...this.config,model:provider.model},data,signal);
    if (ACCOUNT_CLIS[provider.id]) return translateAccount(this.config,provider,data,signal);
    return translateAPI(provider,data,signal);
  }
  async localModels(endpoint) {
    const response = await requestJSON(localEndpoint(endpoint)+'/api/tags',{signal:AbortSignal.timeout(8000)});
    return (response.models || []).filter(m => !m.remote_host && !m.remote_model && !/(?:^|[-:/])cloud(?:$|[-:/])/i.test(m.name)).map(m => m.name).filter(m => typeof m === 'string').slice(0,200);
  }
}
