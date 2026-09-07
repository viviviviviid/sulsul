import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args = new Set(process.argv.slice(2));
if (process.platform !== 'darwin') throw new Error('macOS용 설치 프로그램입니다.');
if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 이상이 필요합니다.');
for (const arg of args) if (!['--without-antigravity','--skip-download','--uninstall','--bundled'].includes(arg)) throw new Error('알 수 없는 옵션: '+arg);
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
  console.log('Chrome 연결 등록을 제거했습니다. 확장 프로그램은 Chrome에서 삭제하세요. 로그인·암호화 키 파일과 Keychain 항목은 유지합니다.');
} else {
  if (!args.has('--without-antigravity') && !args.has('--skip-download')) {
    const arch = {arm64:'arm64',x64:'amd64'}[process.arch];
    if (!arch) throw new Error('지원하지 않는 Mac 아키텍처입니다.');
    console.log('공식 Antigravity CLI를 다운로드하고 SHA-512를 확인합니다.');
    const get = async url => {
      const response = await fetch(url,{signal:AbortSignal.timeout(180_000)});
      if (!response.ok) throw new Error(`다운로드 실패 (${response.status})`);
      return response;
    };
    const release = await (await get(`https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/darwin_${arch}.json`)).json();
    if (new URL(release.url).protocol !== 'https:' || !/^[a-f0-9]{128}$/i.test(release.sha512) || !release.version) throw new Error('공식 배포 정보를 확인하지 못했습니다.');
    const data = Buffer.from(await (await get(release.url)).arrayBuffer());
    if (createHash('sha512').update(data).digest('hex') !== release.sha512.toLowerCase()) throw new Error('다운로드 검증에 실패했습니다.');
    const runtime = path.join(installedData,'sulsul-agy');
    fs.mkdirSync(runtime,{recursive:true});
    const stage = fs.mkdtempSync(path.join(runtime,'.download-'));
    try {
      const payload = path.join(stage,'payload');
      fs.writeFileSync(payload,data);
      let binary = payload;
      if (new URL(release.url).pathname.endsWith('.tar.gz')) {
        execFileSync('/usr/bin/tar',['-xzf',payload,'-C',stage,'antigravity']);
        binary = path.join(stage,'antigravity');
      }
      if (!fs.lstatSync(binary).isFile()) throw new Error('배포 파일이 실행 파일이 아닙니다.');
      fs.chmodSync(binary,0o755);
      fs.renameSync(binary,path.join(runtime,'agy'));
      fs.writeFileSync(path.join(installedData,'agy-release.json'),JSON.stringify(release,null,2)+'\n');
    } finally { fs.rmSync(stage,{recursive:true,force:true}); }
  }
  console.log('macOS 연결 프로그램과 API 키 저장을 준비합니다.');
  try { if (!bundled) {
    execFileSync('/usr/bin/xcrun',['swiftc','-O',path.join(host,'SecretStore.swift'),'-o',path.join(host,'secret-store-macos')],{stdio:'inherit'});
  }
  } catch { throw new Error('Apple Command Line Tools가 필요합니다. xcode-select --install 후 다시 설치하세요.'); }
  fs.mkdirSync(installedHost,{recursive:true,mode:0o700});
  fs.mkdirSync(path.join(installed,'extension'),{recursive:true});
  fs.cpSync(path.join(root,'extension'),path.join(installed,'extension'),{recursive:true});
  for (const name of ['core.mjs','runner.mjs','host.mjs','setup-runtime.mjs','translation.schema.json','login.mjs','login-session.mjs','provider-settings.mjs','providers.mjs','secret-store-macos']) {
    fs.copyFileSync(path.join(host,name),path.join(installedHost,name));
  }
  const pty=path.join(root,'node_modules','node-pty');
  if (!fs.existsSync(pty)) throw new Error('로그인 실행 환경이 없습니다. npm ci 또는 새 Mac 설치 앱으로 설치해 주세요.');
  fs.cpSync(pty,path.join(installed,'node_modules','node-pty'),{recursive:true});
  let installedNode=process.execPath;
  if (bundled) {
    fs.mkdirSync(path.join(installed,'bin'),{recursive:true});
    installedNode=path.join(installed,'bin','node');
    fs.copyFileSync(path.join(root,'bin','node'),installedNode);fs.chmodSync(installedNode,0o755);
    fs.cpSync(path.join(root,'licenses'),path.join(installed,'licenses'),{recursive:true});
  }
  fs.mkdirSync(path.join(installedData,'sulsul-agy'),{recursive:true});
  for (const name of ['sulsul-agy/agy','agy-release.json']) {
    const source = path.join(root,'data',name);
    if (args.has('--skip-download') && fs.existsSync(source)) fs.copyFileSync(source,path.join(installedData,name));
  }
  const installedConfig = path.join(installedHost,'config.json');
  if (!fs.existsSync(installedConfig) && fs.existsSync(path.join(host,'config.json'))) {
    const previous = JSON.parse(fs.readFileSync(path.join(host,'config.json'),'utf8'));
    const profile = path.join(installedData,'sulsul-agy-profile');
    if (fs.existsSync(previous.profile) && !fs.existsSync(profile)) fs.cpSync(previous.profile,profile,{recursive:true});
    const providerSettings = path.join(profile,'providers.json');
    if (previous.providerSettings && fs.existsSync(previous.providerSettings)) {
      fs.mkdirSync(profile,{recursive:true});
      fs.copyFileSync(previous.providerSettings,providerSettings);
    }
    fs.writeFileSync(installedConfig,JSON.stringify({model:previous.model,profile,providerSettings})+'\n',{mode:0o600});
  }
  execFileSync(installedNode,[path.join(installedHost,'setup-runtime.mjs')],{stdio:'inherit'});
  if (fs.existsSync(registry)) JSON.parse(fs.readFileSync(registry,'utf8'));
  fs.mkdirSync(path.dirname(registry),{recursive:true});
  fs.copyFileSync(path.join(installedHost,'com.sulsul.gemini.json'),registry);
  console.log(`설치 완료! Chrome의 chrome://extensions에서 개발자 모드를 켜고 다음 폴더를 로드하세요:\n${path.join(bundled?installed:root,'extension')}\n술술 → AI 선택 · 설정 → Google 계정 연결 또는 API 키 저장 → 연결 테스트`);
}
