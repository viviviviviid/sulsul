import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { sourceFiles } from './files.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8').replace(/^\uFEFF/,'');
const pkg=JSON.parse(read('package.json')), manifest=JSON.parse(read('extension/manifest.json'));
if(pkg.version!==manifest.version)throw new Error('Package and extension versions must match.');
for(const name of sourceFiles){
  if(name.endsWith('.png')) {
    const bytes=fs.readFileSync(path.join(root,name));
    const size=Number(/icon-(\d+)\.png$/.exec(name)?.[1]);
    if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==size||bytes.readUInt32BE(20)!==size)throw new Error('Invalid icon: '+name);
    continue;
  }
  const text=read(name);
  if(/BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/.test(text))throw new Error('Private key detected: '+name);
  if(/(?:[A-Z]:[\\/]+Users[\\/]+[^\s'"/\\]+[\\/]|\/home\/[^/]+\/)/.test(text))throw new Error('Personal absolute path detected: '+name);
  if(/\.(?:m?js)$/.test(name)){
    const checked=spawnSync(process.execPath,['--check',path.join(root,name)],{encoding:'utf8'});
    if(checked.status!==0)throw new Error(checked.stderr);
  }
}
console.log(`Checked ${sourceFiles.length} public files; versions match (${pkg.version}).`);
