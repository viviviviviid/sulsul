import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDecoder, encodeMessage } from './core.mjs';
import { loadConfig } from './runner.mjs';
import { ProviderSettings } from './provider-settings.mjs';
import { ProviderRouter } from './providers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig(path.join(here, 'config.json'));
const settings = new ProviderSettings(config);
const router = new ProviderRouter(config,settings);
const origin = process.argv[2];
if (origin !== `chrome-extension://${config.extensionId}/`) process.exit(1);
const active = new Map();
let saving = false;
const abortAll = () => { for (const task of active.values()) task.controller.abort(); };
function send(value) { try { process.stdout.write(encodeMessage(value)); } catch { process.exit(1); } }

async function handle(message) {
  const id = message?.id;
  if (typeof id !== 'string' || id.length > 100) return;
  try {
    if (message.type === 'health') return send({ id, ok: true, result: router.health() });
    if (message.type === 'settings-get') return send({ id, ok:true, result:{...settings.public(),maxConcurrentTranslations:2} });
    if (message.type === 'settings-save') {
      if (active.size || saving) throw new Error('번역을 중지한 뒤 설정을 저장해 주세요.');
      saving = true;
      try { return send({id,ok:true,result:await settings.save(message.data)}); }
      finally { saving = false; }
    }
    if (message.type === 'ollama-models') return send({id,ok:true,result:await router.localModels(message.data?.endpoint)});
    if (message.type === 'cancel') {
      const ids = message.data?.ids;
      if (ids === undefined) abortAll(); // Compatibility with older extensions.
      else {
        if (!Array.isArray(ids) || ids.length > 100 || ids.some(value => typeof value !== 'string')) throw new Error('잘못된 취소 요청입니다.');
        for (const target of ids) active.get(target)?.controller.abort();
      }
      return send({ id, ok: true, result: {} });
    }
    if (message.type === 'login') {
      if (active.size || saving) throw new Error('번역을 중지한 뒤 계정을 연결해 주세요.');
      if (settings.read().selected !== 'antigravity') throw new Error('Google 로그인은 Antigravity를 선택했을 때 사용할 수 있습니다.');
      if (!router.health().installed) throw new Error('술술 설치 프로그램에서 Antigravity 설치를 선택해 주세요.');
      const mac = process.platform === 'darwin';
      const command = mac ? '/usr/bin/open' : path.join(process.env.SystemRoot, 'System32','WindowsPowerShell','v1.0','powershell.exe');
      const args = mac ? ['-a','Terminal',path.join(here,'login.command')] : ['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(here,'open-login.ps1')];
      // Fixed script and arguments, never browser-provided command text.
      await new Promise((resolve,reject) => {
        const child = spawn(command,args,{windowsHide:true,stdio:'ignore',shell:false});
        child.on('error',() => reject(new Error('로그인 창을 열지 못했습니다. 설치 프로그램을 다시 실행해 주세요.')));
        child.on('close',code => code === 0 ? resolve() : reject(new Error('로그인 창을 열지 못했습니다.')));
      });
      return send({ id, ok: true, result: { message: 'Google 로그인 창을 열었습니다. 연결 후 이 창을 다시 열어 주세요.' } });
    }
    if (!['translate','provider-test'].includes(message.type)) throw new Error('지원하지 않는 요청입니다.');
    if (saving || active.size >= 2 || active.has(id)) throw new Error('다른 번역이 진행 중입니다. 잠시 후 다시 시도해 주세요.');
    const task = { id, controller: new AbortController() };
    active.set(id,task);
    const started = performance.now();
    try {
      const testing = message.type === 'provider-test';
      const data = testing ? {blocks:[{id:'b0',parts:[{id:'t0',text:'Read comfortably, right where you are.',locked:false}]}]} : message.data;
      const signal = testing ? AbortSignal.any([task.controller.signal,AbortSignal.timeout(60_000)]) : task.controller.signal;
      const result = await router.translate(data,signal,message.scope);
      if (signal.aborted) throw new Error('번역을 중지했습니다.');
      const timings = {...result.timings,hostTotalMs:Math.round(performance.now()-started)};
      send({id,ok:true,result:testing ? {message:'연결 성공 · '+result.blocks[0].parts[0].text,timings} : {...result,timings}});
    }
    finally { active.delete(id); }
  } catch (e) { send({ id, ok: false, error: e.message }); }
}
process.stdin.on('data', createDecoder(handle, () => process.exit(1)));
process.stdin.on('end', () => { abortAll(); setTimeout(() => process.exit(0), 200).unref(); });
process.stdout.on('error', () => { abortAll(); process.exit(1); });
