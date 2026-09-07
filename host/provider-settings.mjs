import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MODEL } from './runner.mjs';
import { PROMPT_VERSION } from './core.mjs';

export const PROVIDERS = Object.freeze({
  antigravity: { label: 'Antigravity · Google 계정', model: DEFAULT_MODEL, key: false,
    note: '공식 Google 로그인으로 연결합니다. 계정의 사용 한도가 적용되며, 추가 크레딧 사용은 꺼져 있습니다.' },
  gemini: { label: 'Gemini API', model: 'gemini-3.8-flash', key: true,
    note: 'Google AI 구독과 별도입니다. API 키의 무료 한도 또는 사용량 요금이 적용됩니다.' },
  openai: { label: 'OpenAI API', model: 'gpt-5.4-mini', key: true,
    note: 'ChatGPT 구독과 별도인 API 사용량 요금이 적용됩니다.' },
  anthropic: { label: 'Claude API', model: 'claude-sonnet-5', key: true,
    note: 'Claude 구독과 별도인 API 사용량 요금이 적용됩니다.' },
  ollama: { label: 'Ollama · 내 PC', model: '', key: false,
    note: 'Ollama에서 내려받은 로컬 모델을 사용합니다. 번역 품질과 속도는 모델·PC 성능에 따라 달라집니다.' }
});

export function providerDefinition(id) {
  if (!Object.hasOwn(PROVIDERS, id)) throw new Error('지원하지 않는 AI입니다.');
  return PROVIDERS[id];
}

export function validateModel(model, allowEmpty = false) {
  if (typeof model !== 'string' || (!model && !allowEmpty) || model.length > 160 || (model && !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(model))) throw new Error('모델 ID를 확인해 주세요.');
  return model;
}

export function localEndpoint(value = 'http://127.0.0.1:11434') {
  let url;
  try { url = new URL(value); } catch { throw new Error('Ollama 주소를 확인해 주세요.'); }
  if (url.protocol !== 'http:' || !['127.0.0.1','[::1]','localhost'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Ollama는 이 PC의 localhost 주소만 사용할 수 있습니다.');
  return url.origin;
}

export function protectSecret(value, mode = 'protect') {
  return new Promise((resolve, reject) => {
    if (!['win32','darwin'].includes(process.platform)) return reject(new Error('API 키 저장은 Windows와 macOS에서 지원합니다.'));
    if (!['protect','unprotect'].includes(mode)) return reject(new Error('지원하지 않는 키 저장 요청입니다.'));
    const mac = process.platform === 'darwin';
    const script = fileURLToPath(new URL('./secret-store.ps1', import.meta.url));
    const command = mac ? fileURLToPath(new URL('./secret-store-macos',import.meta.url)) : path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
    const args = mac ? [mode] : ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Mode',mode];
    const child = spawn(command, args, { windowsHide:true, shell:false, stdio:['pipe','pipe','ignore'] });
    let output = '', done = false;
    const finish = (ok) => {
      if (done) return; done = true; clearTimeout(timer); child.kill();
      if (!ok || !/^[a-zA-Z0-9+/=]+$/.test(output)) return reject(new Error('이 PC에서 API 키를 읽거나 저장하지 못했습니다. 설치 프로그램을 실행하고 AI 설정에서 키를 다시 입력해 주세요.'));
      resolve(mode === 'protect' ? output : Buffer.from(output,'base64').toString('utf8'));
    };
    const timer = setTimeout(() => finish(false), 10_000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 32768) finish(false); });
    child.on('error', () => finish(false));
    child.on('close', code => finish(code === 0));
    child.stdin.on('error', () => finish(false));
    // Secrets travel only through anonymous pipes, never command arguments or environment variables.
    child.stdin.end(mode === 'protect' ? Buffer.from(value,'utf8').toString('base64') : value);
  });
}

export class ProviderSettings {
  constructor(config, crypt = protectSecret) {
    this.config = config;
    this.file = config.providerSettings || path.join(config.profile, 'providers.json');
    this.crypt = crypt;
    this.writes = Promise.resolve();
  }
  read() {
    if (!fs.existsSync(this.file)) return { selected:'antigravity', revision:'initial', providers:{} };
    try {
      const state = JSON.parse(fs.readFileSync(this.file,'utf8'));
      providerDefinition(state.selected);
      if (!state.providers || typeof state.providers !== 'object' || typeof state.revision !== 'string') throw new Error();
      return state;
    } catch { throw new Error('AI 설정을 읽지 못했습니다. 설치 안내의 설정 복구 방법을 확인해 주세요.'); }
  }
  options(state, id) {
    const definition = providerDefinition(id);
    const saved = Object.hasOwn(state.providers,id) ? state.providers[id] : {};
    const model = saved.model ?? (id === 'antigravity' ? this.config.model : undefined) ?? definition.model;
    return { model:validateModel(model,true), ...(id === 'ollama' ? { endpoint:localEndpoint(saved.endpoint) } : {}), hasKey:!!saved.secret };
  }
  public(state = this.read()) {
    const providers = Object.fromEntries(Object.entries(PROVIDERS).map(([id,definition]) => [id,{ ...definition, ...this.options(state,id) }]));
    const selected = state.selected;
    const scope = createHash('sha256').update(JSON.stringify([PROMPT_VERSION,state.revision,selected,providers[selected]])).digest('hex');
    return { selected, providers, scope };
  }
  async credentials(state = this.read()) {
    const id = state.selected, options = this.options(state,id);
    validateModel(options.model);
    const secret = state.providers[id]?.secret;
    if (PROVIDERS[id].key && !secret) throw new Error('AI 설정에서 API 키를 저장해 주세요.');
    return { id, ...options, ...(PROVIDERS[id].key ? { apiKey:await this.crypt(secret,'unprotect') } : {}) };
  }
  save(data) {
    const task = this.writes.catch(() => {}).then(async () => {
      const id = data?.provider, definition = providerDefinition(id);
      const model = validateModel(data.model?.trim());
      const state = this.read();
      const previous = Object.hasOwn(state.providers,id) ? state.providers[id] : {};
      const next = { model };
      if (id === 'ollama') next.endpoint = localEndpoint(data.endpoint);
      if (definition.key) {
        if (typeof data.apiKey !== 'string' || data.apiKey.length > 4096 || /[^\x21-\x7e]/.test(data.apiKey)) throw new Error('API 키에 공백이나 잘못된 문자가 있습니다.');
        if (data.clearKey === true) next.secret = undefined;
        else next.secret = data.apiKey ? await this.crypt(data.apiKey) : previous.secret;
      }
      state.providers[id] = next;
      state.selected = id; state.revision = randomUUID();
      fs.mkdirSync(path.dirname(this.file), { recursive:true });
      const temporary = this.file + '.tmp';
      fs.writeFileSync(temporary,JSON.stringify(state,null,2)+'\n',{mode:0o600});
      fs.renameSync(temporary,this.file);
      return this.public(state);
    });
    this.writes = task;
    return task;
  }
}
