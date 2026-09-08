import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args = new Set(process.argv.slice(2));
if (process.platform !== 'darwin') throw new Error('macOS용 설치 프로그램입니다.');
if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 이상이 필요합니다.');
for (const arg of args) if (!['--skip-download','--uninstall','--bundled'].includes(arg)) throw new Error('알 수 없는 옵션: '+arg);
const bundled=args.has('--bundled');
const userHome=process.env.SULSUL_INSTALL_HOME || os.homedir();
const host = path.join(root,'host');
// Chrome-launched processes cannot reliably read Desktop/Documents under TCC.
// Install the runtime in Application Support, independent of the source checkout.
const installed = path.join(userHome,'Library','Application Support','Sulsul','runtime');
const installedHost = path.join(installed,'host');
const registry = path.join(userHome,'Library','Application Support','Google','Chrome','NativeMessagingHosts','com.sulsul.gemini.json');
const installedData = path.join(installed,'data');
if (args.has('--uninstall')) {
  if (fs.existsSync(registry)) {
    const registered = JSON.parse(fs.readFileSync(registry,'utf8'));
    if (![path.join(host,'sulsul-host'),path.join(installedHost,'sulsul-host')].includes(registered.path)) throw new Error('다른 폴더의 술술이 등록되어 있어 삭제하지 않았습니다.');
    fs.unlinkSync(registry);
  }
  console.log('Chrome 연결 등록을 제거했습니다. 확장 프로그램은 Chrome에서 삭제하세요. 기존 로그인 데이터는 유지합니다.');
} else {
  console.log('ChatGPT 연결 프로그램을 준비합니다.');
  fs.mkdirSync(installedHost,{recursive:true,mode:0o700});
  fs.mkdirSync(path.join(installed,'extension'),{recursive:true});
  fs.cpSync(path.join(root,'extension'),path.join(installed,'extension'),{recursive:true});
  for (const name of ['core.mjs','runner.mjs','host.mjs','setup-runtime.mjs','translation.schema.json','account-runtime.mjs','account-providers.mjs','account-login.mjs','provider-settings.mjs','providers.mjs']) {
    fs.copyFileSync(path.join(host,name),path.join(installedHost,name));
  }
  let installedNode=process.execPath;
  if (bundled) {
    fs.mkdirSync(path.join(installed,'bin'),{recursive:true});
    installedNode=path.join(installed,'bin','node');
    fs.copyFileSync(path.join(root,'bin','node'),installedNode);fs.chmodSync(installedNode,0o755);
    fs.cpSync(path.join(root,'licenses'),path.join(installed,'licenses'),{recursive:true});
  }
  const installedConfig = path.join(installedHost,'config.json');
  if (!fs.existsSync(installedConfig) && fs.existsSync(path.join(host,'config.json'))) {
    const previous = JSON.parse(fs.readFileSync(path.join(host,'config.json'),'utf8'));
    const profile = path.join(installedData,'profile');
    if (fs.existsSync(previous.profile) && !fs.existsSync(profile)) fs.cpSync(previous.profile,profile,{recursive:true});
    const providerSettings = path.join(profile,'providers.json');
    if (previous.providerSettings && fs.existsSync(previous.providerSettings)) {
      fs.mkdirSync(profile,{recursive:true});
      fs.copyFileSync(previous.providerSettings,providerSettings);
    }
    fs.writeFileSync(installedConfig,JSON.stringify({profile,providerSettings})+'\n',{mode:0o600});
  }
  execFileSync(installedNode,[path.join(installedHost,'setup-runtime.mjs')],{stdio:'inherit'});
  if (fs.existsSync(registry)) JSON.parse(fs.readFileSync(registry,'utf8'));
  fs.mkdirSync(path.dirname(registry),{recursive:true});
  fs.copyFileSync(path.join(installedHost,'com.sulsul.gemini.json'),registry);
  console.log(`설치 완료! Chrome의 chrome://extensions에서 개발자 모드를 켜고 다음 폴더를 로드하세요:\n${path.join(bundled?installed:root,'extension')}\n술술 → ChatGPT 연결 → 공식 로그인 → 쉽게 읽기`);
}
