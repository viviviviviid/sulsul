import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { runtimeFiles } from './files.mjs';
import { copyPTY } from './pty-files.mjs';

if(process.platform!=='darwin')throw new Error('Build the Mac installer on macOS.');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const swiftTarget=`${process.arch==='arm64'?'arm64':'x86_64'}-apple-macos13.5`;
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const dist=path.join(root,'dist');fs.mkdirSync(dist,{recursive:true});
const stage=fs.mkdtempSync(path.join(dist,'.mac-stage-'));
const folder=path.join(stage,`Sulsul-Mac-${process.arch}-${version}`);
const app=path.join(folder,'술술 설치.app'), contents=path.join(app,'Contents'), payload=path.join(contents,'Resources','payload');
const get=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(180_000)});if(!r.ok)throw new Error('Download failed: '+r.status);return r;};
try {
  for(const name of runtimeFiles.filter(n=>n.startsWith('host/')||n.startsWith('extension/')||n==='LICENSE'||n==='scripts/install-macos.mjs')){
    const target=path.join(payload,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,name),target);
  }
  copyPTY(root,payload);
  fs.mkdirSync(path.join(payload,'bin'),{recursive:true});fs.mkdirSync(path.join(payload,'licenses'),{recursive:true});
  // A pinned official Node archive supplies a self-contained runtime and license.
  const nodeVersion='24.12.0', archive=`node-v${nodeVersion}-darwin-${process.arch}.tar.gz`, base=`https://nodejs.org/dist/v${nodeVersion}/`;
  const cache=path.join(root,'.build');fs.mkdirSync(cache,{recursive:true});
  const checksums=await(await get(base+'SHASUMS256.txt')).text();
  const expected=checksums.split('\n').map(line=>line.trim().split(/\s+/)).find(parts=>parts[1]===archive)?.[0];
  if(!/^[a-f0-9]{64}$/.test(expected||''))throw new Error('Missing official Node checksum.');
  const tar=path.join(cache,archive);
  if(!fs.existsSync(tar))fs.writeFileSync(tar,Buffer.from(await(await get(base+archive)).arrayBuffer()));
  if(createHash('sha256').update(fs.readFileSync(tar)).digest('hex')!==expected)throw new Error('Node archive checksum mismatch.');
  execFileSync('/usr/bin/tar',['-xzf',tar,'-C',stage,`node-v${nodeVersion}-darwin-${process.arch}/bin/node`,`node-v${nodeVersion}-darwin-${process.arch}/LICENSE`]);
  fs.copyFileSync(path.join(stage,`node-v${nodeVersion}-darwin-${process.arch}/bin/node`),path.join(payload,'bin/node'));
  fs.chmodSync(path.join(payload,'bin/node'),0o755);
  fs.copyFileSync(path.join(stage,`node-v${nodeVersion}-darwin-${process.arch}/LICENSE`),path.join(payload,'licenses/Node-LICENSE.txt'));
  fs.copyFileSync(path.join(root,'node_modules/node-pty/LICENSE'),path.join(payload,'licenses/node-pty-LICENSE.txt'));
  fs.mkdirSync(path.join(contents,'MacOS'),{recursive:true});
  execFileSync('/usr/bin/xcrun',['swiftc','-O','-target',swiftTarget,path.join(root,'host/SecretStore.swift'),'-o',path.join(payload,'host/secret-store-macos')],{stdio:'inherit'});
  execFileSync('/usr/bin/xcrun',['swiftc','-O','-target',swiftTarget,path.join(root,'host/Installer.swift'),'-o',path.join(contents,'MacOS/Installer')],{stdio:'inherit'});
  fs.writeFileSync(path.join(contents,'Info.plist'),`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Installer</string><key>CFBundleIdentifier</key><string>com.sulsul.installer</string><key>CFBundleName</key><string>술술 설치</string><key>CFBundleVersion</key><string>${version}</string><key>CFBundleShortVersionString</key><string>${version}</string><key>CFBundlePackageType</key><string>APPL</string><key>LSMinimumSystemVersion</key><string>13.5</string><key>NSHighResolutionCapable</key><true/></dict></plist>`);
  fs.writeFileSync(path.join(folder,'먼저 읽어주세요.txt'),`술술 ${version} · macOS 13.5 이상 · ${process.arch}\n\n1. ZIP을 풀고 술술 설치.app을 여세요. Node.js나 개발 도구를 설치할 필요가 없습니다.\n2. 설치하기를 누르세요. 공식 Google 연결 프로그램을 다운로드하므로 인터넷 연결이 필요합니다.\n3. 설치 창에 표시되는 안내에 따라 Chrome에 확장을 직접 추가하세요.\n4. 술술 → AI 설정 → Google 계정 연결 → Google 로그인 → 인증 코드 붙여넣기.\n\n이 초기 배포는 Apple 개발자 서명·공증이 없습니다. macOS에서 실행을 차단하면 시스템 설정 → 개인정보 보호 및 보안에서 다운로드한 앱의 실행 허용 여부를 확인하세요.\nChrome 웹 스토어 버전은 아직 없습니다.\n\n설치 위치: ~/Library/Application Support/Sulsul/runtime\n삭제: Chrome 확장을 삭제하고 ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.sulsul.gemini.json을 제거하세요. 로그인·키 데이터는 runtime/data에 남습니다.\n`);
  // Local ad-hoc signing preserves executable integrity; this is not Developer ID notarization.
  execFileSync('/usr/bin/codesign',['--force','--deep','--sign','-',app],{stdio:'inherit'});
  execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',app],{stdio:'inherit'});
  const zip=path.join(dist,`Sulsul-Mac-${process.arch}-${version}.zip`);
  if(fs.existsSync(zip))fs.unlinkSync(zip);
  execFileSync('/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',folder,zip]);
  console.log(JSON.stringify({zip,app,payload}));
} catch(error){throw error;}
