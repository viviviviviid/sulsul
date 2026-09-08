import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import { buildPrompt, parseTranslation } from './core.mjs';

export const DEFAULT_MODEL = 'gemini-3.8-flash-low';
export function cliArguments(config) {
  return ['--input-format','stream-json','--output-format','stream-json','--disable-slash-commands','--json-schema',config.schema,'--model',config.model || DEFAULT_MODEL,'--print-timeout','4m'];
}

export function makeEnvironment(config) {
  // Dedicated CLI profile. Never inherit API keys, endpoints or startup hooks.
  const env = {};
  for (const key of ['SystemRoot','WINDIR','ComSpec','PATH','PATHEXT','TEMP','TMP','TMPDIR','TERM','LANG','LC_CTYPE','USER','LOGNAME','USERNAME','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS']) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  if (process.platform !== 'win32') {
    // This child process gets its own home; the parent environment is untouched.
    env.HOME = config.profile;
    env.XDG_CONFIG_HOME = path.join(config.profile,'.config');
    env.XDG_CACHE_HOME = path.join(config.profile,'.cache');
  }
  return Object.assign(env, {
    USERPROFILE:config.profile,
    APPDATA:path.join(config.profile,'AppData','Roaming'),
    LOCALAPPDATA:path.join(config.profile,'AppData','Local'),
    NO_COLOR:'1'
  });
}

export function health(config) {
  const ready = existsSync(config.cli);
  const verified = existsSync(path.join(config.profile,'verified.json'));
  const model = config.model || DEFAULT_MODEL;
  const modelLabel = model === DEFAULT_MODEL ? 'Gemini 3.8 Flash · Low' : model;
  return { protocol:1, installed:ready, loginCached:verified, version:config.cliVersion, model, modelLabel,
    message:!ready ? '연결 프로그램 설치가 필요합니다.' : verified ? '최근 번역에서 Google 연결을 확인했어요.' : '연결 프로그램 준비됨 · 첫 번역에서 계정을 확인해요.' };
}

const INTERRUPTED_MESSAGE = 'Gemini 응답 연결이 중간에 끊겼습니다. 잠시 후 다시 시도해 주세요.';
export function readableError(text) {
  text = typeof text === 'string' ? text : JSON.stringify(text || '');
  if (/no longer supported|migrate to.*Antigravity/i.test(text)) return '기존 Gemini CLI 지원이 종료되었습니다. 술술 설치 프로그램을 다시 실행해 주세요.';
  if (/quota|resource_exhausted|429|rate.?limit|exhaust/i.test(text)) return 'Gemini 사용 한도에 도달했습니다. 잠시 후 다시 시도해 주세요. 유료 API로 전환하지 않습니다.';
  if (/auth|credential|login|log in|sign.in|401|invalid_grant|token.*expir/i.test(text)) return 'Google 로그인이 필요하거나 만료되었습니다. 확장의 계정 연결을 눌러 주세요.';
  if (/403|permission_denied|access.denied/i.test(text)) return '이 Google 계정에서 Antigravity를 사용할 수 없습니다. 계정 또는 구독 상태를 확인해 주세요.';
  if (/stream (?:was |has been )?interrupted/i.test(text)) return INTERRUPTED_MESSAGE;
  if (/ENOTFOUND|ECONN|fetch failed|network|ETIMEDOUT|dial tcp|unavailable/i.test(text)) return 'Gemini에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.';
  return 'Gemini가 번역을 완료하지 못했습니다. 다시 시도해 주세요.';
}

export function cliError(text) {
  const error = new Error(readableError(text));
  if (error.message === INTERRUPTED_MESSAGE) error.code = 'STREAM_INTERRUPTED';
  return error;
}

export async function withFormatRetry(config, data, signal, run, {wait=signal=>delay(800,undefined,{signal})}={}) {
  let current=config, streamRetried=false, formatRetried=false;
  for (;;) {
    if (signal?.aborted) throw new Error('번역을 중지했습니다.');
    try { return await run(current, data, signal); }
    catch(error) {
      if (signal?.aborted) throw error;
      if (error.code === 'STREAM_INTERRUPTED' && !streamRetried) {
        streamRetried=true;
        try { await wait(signal); } catch { throw new Error('번역을 중지했습니다.'); }
        continue; // Same model, once per request, after the previous child exits.
      }
      if (error.code === 'INVALID_TRANSLATION' && !formatRetried && (current.model || DEFAULT_MODEL) === DEFAULT_MODEL) {
        formatRetried=true; current={...current,model:'gemini-3.8-flash-medium'}; continue;
      }
      throw error; // Authentication, quota and other failures are never retried.
    }
  }
}

export function translate(config, data, signal) {
  const deadline = AbortSignal.timeout(240_000);
  const combined = signal ? AbortSignal.any([signal,deadline]) : deadline;
  const started = performance.now();
  let attempts = 0;
  return withFormatRetry(config,data,combined,(...args) => { attempts++; return runTranslation(...args); })
    .then(result => ({...result,timings:{...result.timings,attempts,providerTotalMs:Math.round(performance.now()-started)}}));
}

export function runTranslation(config, data, signal, {spawnProcess=spawn}={}) {
  const started = performance.now();
  const timings = {};
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('번역을 중지했습니다.'));
    let prompt;
    try {
      prompt = buildPrompt(data);
      // Fail closed if tools or paid fallback have been enabled in this profile.
      const settings = loadConfig(config.settings);
      const required = ['read_file(*)','write_file(*)','command(*)','unsandboxed(*)','read_url(*)','execute_url(*)','mcp(*)'];
      // AGY sparsely persists settings and removes explicit false values matching defaults.
      if (settings.modelProvider || settings.useG1Credits === true || !required.every(rule => settings.permissions?.deny?.includes(rule))) throw new Error('연결 설정이 바뀌었습니다. 설치 프로그램을 다시 실행해 주세요.');
    } catch(e) { reject(e); return; }
    const args = cliArguments(config);
    const child = spawnProcess(config.cli, args, { cwd:config.workspace, env:makeEnvironment(config), shell:false, windowsHide:true, stdio:['pipe','pipe','pipe'] });
    timings.promptChars = prompt.length;
    child.once('spawn',() => { timings.spawnMs=Math.round(performance.now()-started); });
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    let buffer='', stderr='', settled=false, bytes=0, closed=false;
    const finish = (error, value) => {
      if (settled) return;
      settled=true; clearTimeout(timeout); signal?.removeEventListener('abort',abort);
      // Keep the host slot until the process and its streams are fully closed.
      let delivered=false, forceKill;
      const deliver=()=>{if(delivered)return;delivered=true;clearTimeout(forceKill);error?reject(error):resolve(value);};
      child.once('close',deliver);
      try { child.kill(); } catch {}
      if (closed) deliver();
      if (!delivered) forceKill=setTimeout(()=>{try{child.kill('SIGKILL');}catch{}},1000).unref();
    };
    const abort = () => finish(new Error('번역을 중지했습니다.'));
    const timeout = setTimeout(() => finish(new Error('번역 응답이 늦어 중지했습니다. 잠시 후 다시 시도해 주세요.')),240_000);
    signal?.addEventListener('abort',abort,{once:true});
    child.on('error',()=>finish(new Error('Antigravity CLI를 실행하지 못했습니다. 설치 프로그램을 다시 실행해 주세요.')));
    child.stdin.on('error',()=>{});
    child.stderr.on('data',chunk=>{
      stderr=(stderr+chunk).slice(-16000);
      if (/Authentication required/i.test(stderr)) finish(new Error(readableError('authentication required')));
    });
    const consume = line => {
      if (!line.trim() || settled) return;
      let event;
      try { event=JSON.parse(line); } catch { return finish(new Error('Gemini 응답 형식이 맞지 않습니다.')); }
      if (event.event !== 'result') return;
      const result=event.result;
      if (result?.status !== 'SUCCESS' || result.error) {
        if (/auth|credential|login|401|token/i.test(result?.error || '')) {
          try { rmSync(path.join(config.profile,'verified.json'),{force:true}); } catch {}
        }
        return finish(cliError(result?.error || stderr));
      }
      try {
        const parsing = performance.now();
        const value=parseTranslation(result.structured_output ? JSON.stringify(result.structured_output) : result.response,data);
        timings.resultMs=Math.round(parsing-started);
        timings.validationMs=Math.round(performance.now()-parsing);
        try { writeFileSync(path.join(config.profile,'verified.json'),JSON.stringify({at:Date.now()})); } catch {}
        finish(null,{...value,timings});
      } catch(e) { e.code='INVALID_TRANSLATION'; finish(e); }
    };
    child.stdout.on('data',chunk=>{
      timings.firstOutputMs ??= Math.round(performance.now()-started);
      bytes+=Buffer.byteLength(chunk);
      if (bytes>4_000_000) return finish(new Error('Gemini 응답이 너무 큽니다.'));
      buffer+=chunk;
      let index;
      while((index=buffer.indexOf('\n'))>=0) { const line=buffer.slice(0,index);buffer=buffer.slice(index+1);consume(line); }
    });
    child.on('close',()=>{
      closed=true;
      if (settled) return;
      consume(buffer);
      if (!settled) finish(cliError(stderr));
    });
    child.stdin.end(JSON.stringify({event:'user',message:{content:prompt}})+'\n','utf8');
  });
}

export function loadConfig(filename) {
  return JSON.parse(readFileSync(filename,'utf8').replace(/^\uFEFF/,''));
}
