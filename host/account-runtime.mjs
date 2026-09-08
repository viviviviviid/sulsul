import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {makeEnvironment} from './runner.mjs';

export const ACCOUNT_CLIS = Object.freeze({
  codex:{label:'ChatGPT',version:'0.153.4',binary:'codex'}
});
const exec=promisify(execFile);
export function accountPaths(config,id) {
  const definition=ACCOUNT_CLIS[id];if(!definition)throw new Error('지원하지 않는 계정입니다.');
  const root=path.resolve(path.dirname(config.schema),'../data/accounts',id);
  const profile=path.join(root,'profile'),workspace=path.join(root,'workspace');
  const binary=definition.binary+(process.platform==='win32'?'.exe':'');
  return {root,profile,workspace,cli:path.join(root,definition.version,binary),...definition};
}
export function accountEnvironment(runtime) {
  const env=makeEnvironment(runtime);
  // Only the official child process owns these dedicated authentication stores.
  env.CODEX_HOME=runtime.profile;
  return env;
}
export function packageLocation(id,platform=process.platform,arch=process.arch) {
  if(!['win32','darwin','linux'].includes(platform)||!['x64','arm64'].includes(arch))throw new Error('지원하지 않는 운영체제 또는 CPU입니다.');
  const definition=ACCOUNT_CLIS[id];if(!definition)throw new Error('지원하지 않는 계정입니다.');
  return {name:'@openai/codex',version:`${definition.version}-${platform}-${arch}`};
}
export async function ensureAccountRuntime(config,id,signal) {
  const runtime=accountPaths(config,id);
  for(const dir of [runtime.root,runtime.profile,runtime.workspace])fs.mkdirSync(dir,{recursive:true,mode:0o700});
  if(fs.existsSync(runtime.cli))return runtime;
  const pkg=packageLocation(id),deadline=AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(300_000)]);
  const response=await fetch(`https://registry.npmjs.org/${pkg.name}/${pkg.version}`,{signal:deadline,redirect:'error'});
  if(!response.ok)throw new Error('공식 연결 프로그램의 배포 정보를 가져오지 못했습니다.');
  const meta=await response.json();
  const url=new URL(meta.dist?.tarball);
  if(meta.name!==pkg.name||meta.version!==pkg.version||url.origin!=='https://registry.npmjs.org'||!/^sha512-[A-Za-z0-9+/=]+$/.test(meta.dist?.integrity))throw new Error('공식 배포 정보를 확인하지 못했습니다.');
  const stage=fs.mkdtempSync(path.join(runtime.root,'.download-'));
  try {
    const archive=path.join(stage,'package.tgz'),hash=createHash('sha512');let size=0;
    const download=await fetch(url,{signal:deadline,redirect:'error'});
    if(!download.ok||!download.body)throw new Error('공식 연결 프로그램 다운로드에 실패했습니다.');
    await pipeline(Readable.fromWeb(download.body),new Transform({transform(chunk,encoding,done){
      size+=chunk.length;if(size>512_000_000)return done(new Error('다운로드 파일이 너무 큽니다.'));
      hash.update(chunk);done(null,chunk);
    }}),fs.createWriteStream(archive,{mode:0o600}),{signal:deadline});
    if('sha512-'+hash.digest('base64')!==meta.dist.integrity)throw new Error('다운로드 파일 검증에 실패했습니다.');
    const tar=process.platform==='win32'?path.join(process.env.SystemRoot,'System32','tar.exe'):'/usr/bin/tar';
    const options={windowsHide:true,signal:deadline,maxBuffer:4_000_000};
    const {stdout}=await exec(tar,['-tf',archive],options);
    const entries=stdout.trim().split(/\r?\n/);
    const candidates=entries.filter(name=>name.endsWith('/'+path.basename(runtime.cli)));
    if(candidates.length!==1||!/^package\/[A-Za-z0-9_./-]+$/.test(candidates[0])||candidates[0].split('/').includes('..'))throw new Error('공식 실행 파일을 확인하지 못했습니다.');
    await exec(tar,['-xf',archive,'-C',stage,candidates[0]],options);
    const extracted=path.join(stage,candidates[0]);
    if(!fs.lstatSync(extracted).isFile())throw new Error('실행 파일 형식이 맞지 않습니다.');
    fs.chmodSync(extracted,0o700);
    const destination=path.dirname(runtime.cli);fs.mkdirSync(destination,{recursive:true,mode:0o700});
    fs.renameSync(extracted,runtime.cli);
    fs.writeFileSync(path.join(destination,'release.json'),JSON.stringify({name:pkg.name,version:pkg.version,integrity:meta.dist.integrity})+'\n');
    return runtime;
  } finally {await fs.promises.rm(stage,{recursive:true,force:true,maxRetries:15,retryDelay:100});}
}
