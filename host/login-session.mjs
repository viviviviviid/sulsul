import { randomUUID } from 'node:crypto';
import { makeEnvironment } from './runner.mjs';

const messages = {
  starting:'Google 연결을 준비하고 있어요.', waiting:'Google 로그인 후 표시되는 인증 코드를 붙여넣어 주세요.',
  verifying:'짧은 예문으로 Google 연결을 확인하고 있어요.', connected:'Google 계정을 연결했어요. 이제 번역을 시작할 수 있습니다.',
  canceled:'계정 연결을 취소했어요.', failed:'계정 연결을 완료하지 못했습니다. 다시 연결해 주세요.'
};
export function oauthURL(text) {
  for (const value of text.match(/https:\/\/accounts\.google\.com\/[^\s\x1b]+/g) || []) {
    try {
      const url = new URL(value), q = url.searchParams;
      if (url.origin === 'https://accounts.google.com' && !url.username && !url.password && q.get('response_type') === 'code' && q.get('state') && q.get('code_challenge') && q.get('code_challenge_method') === 'S256' && q.get('redirect_uri') === 'https://antigravity.google/oauth-callback') return url.href;
    } catch {}
  }
  return null;
}

// No raw terminal output, authorization code or URL is written to logs or disk.
export class LoginSession {
  constructor(config, verify, {spawn, timeoutMs=600_000}={}) {
    this.config=config; this.verify=verify; this.spawn=spawn; this.timeoutMs=timeoutMs;
    this.id=randomUUID(); this.state='starting'; this.buffer=''; this.message=messages.starting;
    this.controller=new AbortController();
  }
  get active() { return ['starting','waiting','verifying'].includes(this.state); }
  snapshot() { return {sessionId:this.id,state:this.state,message:this.message,...(this.state==='waiting' ? {url:this.url} : {})}; }
  async start() {
    this.timer=setTimeout(()=>this.fail('연결 시간이 지났습니다. 다시 연결해 주세요.'),this.timeoutMs);
    this.startTimer=setTimeout(()=>{if(this.state==='starting')this.fail('Google 로그인 화면을 준비하지 못했습니다. 연결 프로그램을 업데이트해 주세요.');},45_000);
    try {
      const spawn=this.spawn || (await import('node-pty')).spawn;
      if (!this.active) return;
      this.pty=spawn(this.config.cli,[],{name:'xterm-256color',cols:4096,rows:40,cwd:this.config.workspace,env:makeEnvironment(this.config),useConpty:true});
      this.pty.onData(chunk=>this.consume(chunk));
      this.pty.onExit(()=>{if(['starting','waiting'].includes(this.state))this.fail(messages.failed);});
    } catch { this.fail('로그인 실행 환경을 찾지 못했습니다. 술술 연결 프로그램을 다시 설치해 주세요.'); }
  }
  consume(chunk) {
    if (!['starting','waiting'].includes(this.state)) return;
    this.buffer=(this.buffer+chunk).slice(-65536);
    const text=this.buffer.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g,'').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'');
    if (!this.selected && text.includes('Select login method:') && text.includes('Google OAuth')) {
      this.selected=true; this.buffer=''; this.pty.write('\r'); return;
    }
    const url=oauthURL(text);
    if (!this.submitted && url) { this.url=url;this.state='waiting';this.message=messages.waiting;clearTimeout(this.startTimer); }
    // Onboarding appears after successful authentication. Existing profiles can
    // instead reach the signed-in account header. Neither alone proves readiness:
    // a fresh, bounded translation must succeed before reporting connected.
    if (text.includes('Choose your color scheme:') || (/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/.test(text) && /Gemini|Antigravity/.test(text))) {
      this.check(); return;
    }
    if (this.submitted && /invalid_grant|authorization.*(?:invalid|expired)|authentication failed|sign.in failed/i.test(text)) this.fail('인증 코드가 만료됐거나 연결에 실패했습니다. 다시 연결해 주세요.');
  }
  submit(code) {
    if (this.state!=='waiting' || this.submitted) throw new Error('새 Google 로그인 화면에서 다시 연결해 주세요.');
    if (typeof code!=='string' || !/^[A-Za-z0-9_./~-]{10,4096}$/.test(code.trim())) throw new Error('Google에서 표시한 인증 코드만 붙여넣어 주세요.');
    this.submitted=true;this.buffer='';this.url=null;
    this.message='Google 로그인을 확인하고 있어요.';
    try { this.pty.write(code.trim()+'\r'); }
    catch { this.fail(messages.failed); }
    clearTimeout(this.startTimer);
    this.startTimer=setTimeout(()=>this.fail('Google 인증 응답이 늦습니다. 다시 연결해 주세요.'),60_000);
    return this.snapshot();
  }
  async check() {
    if (!this.active || this.state==='verifying') return;
    this.state='verifying';this.message=messages.verifying;this.disposePTY();clearTimeout(this.startTimer);
    const signal=AbortSignal.any([this.controller.signal,AbortSignal.timeout(60_000)]);
    try {
      await this.verify(signal);
      if (this.controller.signal.aborted) return;
      this.state='connected';this.message=messages.connected;this.cleanup();
    } catch(error) { if(!this.controller.signal.aborted)this.fail(error.message || messages.failed); }
  }
  disposePTY() { const pty=this.pty;this.pty=null;this.buffer='';this.url=null;try{pty?.kill();}catch{} }
  cleanup() {clearTimeout(this.timer);clearTimeout(this.startTimer);this.disposePTY();}
  fail(message) {if(!this.active)return;this.state='failed';this.message=message;this.controller.abort();this.cleanup();}
  cancel() {if(this.active){this.state='canceled';this.message=messages.canceled;this.controller.abort();this.cleanup();}return this.snapshot();}
}
