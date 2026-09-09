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
let loginSession;
const MAX_CONCURRENT_TRANSLATIONS = 4;
const translationCapacity = () => MAX_CONCURRENT_TRANSLATIONS;
let saving = false;
const abortAll = () => { for (const task of active.values()) task.controller.abort(); };
function send(value) { try { process.stdout.write(encodeMessage(value)); } catch { process.exit(1); } }

async function handle(message) {
  const id = message?.id;
  if (typeof id !== 'string' || id.length > 100) return;
  try {
    if (message.type === 'health') return send({ id, ok: true, result: router.health() });
    if (message.type === 'settings-get') return send({ id, ok:true, result:{...settings.public(),maxConcurrentTranslations:translationCapacity(),connectionCheck:'account-only'} });
    if (message.type === 'history-get') return send({id,ok:true,result:router.history.read()});
    if (message.type === 'history-clear') return send({id,ok:true,result:router.history.clear()});
    if (message.type === 'settings-save') {
      if (loginSession?.active) throw new Error('계정 연결을 완료하거나 취소한 뒤 설정을 저장해 주세요.');
      if (active.size || saving) throw new Error('번역을 중지한 뒤 설정을 저장해 주세요.');
      saving = true;
      try { return send({id,ok:true,result:await settings.save(message.data)}); }
      finally { saving = false; }
    }
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
      const provider=settings.read().selected;
      if (!loginSession?.active) {
        // Mark busy before the dynamic import so simultaneous starts cannot fork
        // two authentication sessions or race a settings write.
        saving=true;
        try {
          const verify=signal=>router.check(signal);
          const {AccountLoginSession}=await import('./account-login.mjs');
          loginSession=new AccountLoginSession(config,provider,verify);
          void loginSession.start();
        } finally {saving=false;}
      }
      return send({id,ok:true,result:loginSession.snapshot()});
    }
    if (['login-status','login-cancel'].includes(message.type)) {
      if (!loginSession || message.data?.sessionId !== loginSession.id) throw new Error('계정 연결 시간이 지났습니다. 다시 연결해 주세요.');
      const result=message.type==='login-cancel'?loginSession.cancel():loginSession.snapshot();
      return send({id,ok:true,result});
    }
    if (!['translate','provider-test','account-check'].includes(message.type)) throw new Error('지원하지 않는 요청입니다.');
    if (loginSession?.active) throw new Error('계정 연결을 완료한 뒤 번역을 시작해 주세요.');
    if (saving || active.size >= translationCapacity() || active.has(id)) throw new Error('다른 번역이 진행 중입니다. 잠시 후 다시 시도해 주세요.');
    const task = { id, controller: new AbortController() };
    active.set(id,task);
    const started = performance.now();
    try {
      const testing = message.type !== 'translate';
      const signal = testing ? AbortSignal.any([task.controller.signal,AbortSignal.timeout(60_000)]) : task.controller.signal;
      const result = testing ? await router.check(signal) : await router.translate(message.data,signal,message.scope);
      if (signal.aborted) throw new Error('번역을 중지했습니다.');
      const timings = {...result.timings,hostTotalMs:Math.round(performance.now()-started)};
      send({id,ok:true,result:{...result,timings}});
    }
    finally { active.delete(id); }
  } catch (e) { send({ id, ok: false, error: e.message }); }
}
process.stdin.on('data', createDecoder(handle, () => process.exit(1)));
process.stdin.on('end', () => { loginSession?.cancel();abortAll(); setTimeout(() => process.exit(0), 200).unref(); });
process.stdout.on('error', () => { loginSession?.cancel();abortAll(); process.exit(1); });
for (const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>{loginSession?.cancel();abortAll();setTimeout(()=>process.exit(0),200).unref();});
