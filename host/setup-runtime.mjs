import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeyPairSync, createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = path.join(root, 'data');
const previousPath = path.join(root,'host','config.json');
const previous = fs.existsSync(previousPath) ? JSON.parse(fs.readFileSync(previousPath,'utf8').replace(/^\uFEFF/,'')) : {};
const windows = process.platform === 'win32';
// Reinstalling preserves an existing user's dedicated login profile and provider settings.
const profile = previous.profile || path.join(work, 'profile');
const workspace = path.join(profile, 'workspace');
fs.mkdirSync(workspace, { recursive:true });
fs.mkdirSync(path.join(profile,'AppData','Local'), { recursive:true });
fs.mkdirSync(path.join(profile,'AppData','Roaming'), { recursive:true });
const manifestPath = path.join(root,'extension','manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath,'utf8'));
if (!manifest.key) {
  const { publicKey } = generateKeyPairSync('rsa',{modulusLength:2048});
  manifest.key = publicKey.export({type:'spki',format:'der'}).toString('base64');
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
}
const extensionId = [...createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest().subarray(0,16)].map(n => String.fromCharCode(97+(n>>4),97+(n&15))).join('');
const host = path.join(root,'host');
const config = {node:process.execPath,profile,workspace,extensionId,providerSettings:previous.providerSettings||path.join(profile,'providers.json'),schema:path.join(host,'translation.schema.json')};
const write = (file,value) => fs.writeFileSync(file, JSON.stringify(value,null,2)+'\n');
write(path.join(host,'config.json'),config);
fs.writeFileSync(path.join(host,'node-path.txt'),process.execPath);
if (!windows) {
  // Absolute paths let Chrome launch Node without loading nvm or shell profiles.
  const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
  for (const [name, script] of [['sulsul-host','host.mjs']]) {
    const target = path.join(host,name);
    fs.writeFileSync(target,`#!/bin/sh\nexec ${quote(process.execPath)} ${quote(path.join(host,script))} "$@"\n`,{mode:0o700});
    fs.chmodSync(target,0o700);
  }
}
write(path.join(host,'com.sulsul.gemini.json'),{name:'com.sulsul.gemini',description:'Sulsul web translation host',path:path.join(host,windows ? 'sulsul-host.exe' : 'sulsul-host'),type:'stdio',allowed_origins:[`chrome-extension://${extensionId}/`]});
console.log(JSON.stringify({extensionId,profile,manifest:path.join(host,'com.sulsul.gemini.json')}));
