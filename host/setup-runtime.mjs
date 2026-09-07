import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeyPairSync, createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = path.join(root, 'data');
const previousPath = path.join(root,'host','config.json');
const previous = fs.existsSync(previousPath) ? JSON.parse(fs.readFileSync(previousPath,'utf8').replace(/^\uFEFF/,'')) : {};
const runtime = path.join(work, 'sulsul-agy');
const windows = process.platform === 'win32';
const cliName = windows ? 'agy.exe' : 'agy';
// Reinstalling preserves an existing user's dedicated login profile and provider settings.
const profile = previous.profile || path.join(work, 'sulsul-agy-profile');
const workspace = path.join(profile, 'workspace');
fs.mkdirSync(workspace, { recursive:true });
fs.mkdirSync(path.join(profile,'.gemini','antigravity-cli'), { recursive:true });
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
const releasePath = path.join(work,'agy-release.json');
const release = fs.existsSync(releasePath) ? JSON.parse(fs.readFileSync(releasePath,'utf8').replace(/^\uFEFF/,'')) : {};
const config = { node: process.execPath, cli:fs.existsSync(path.join(runtime,cliName)) ? path.join(runtime,cliName) : previous.cli || path.join(runtime,cliName), cliVersion:release.version || previous.cliVersion || null, model:previous.model || 'gemini-3.8-flash-low', profile, workspace, extensionId, providerSettings:previous.providerSettings || path.join(profile,'providers.json'), settings:path.join(profile,'.gemini','antigravity-cli','settings.json'), schema:path.join(host,'translation.schema.json') };
const write = (file,value) => fs.writeFileSync(file, JSON.stringify(value,null,2)+'\n');
write(path.join(host,'config.json'),config);
fs.writeFileSync(path.join(host,'node-path.txt'),process.execPath);
write(config.settings, {
  toolPermission:'strict', allowNonWorkspaceAccess:false,
  permissions:{allow:[],ask:[],deny:['read_file(*)','write_file(*)','command(*)','unsandboxed(*)','read_url(*)','execute_url(*)','mcp(*)']},
  useG1Credits:false, enableTelemetry:false, notifications:false, showTips:false, showFeedbackSurvey:false
});
if (!windows) {
  // Absolute paths let Chrome launch Node without loading nvm or shell profiles.
  const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
  for (const [name, script] of [['sulsul-host','host.mjs'],['login.command','login.mjs']]) {
    const target = path.join(host,name);
    fs.writeFileSync(target,`#!/bin/sh\nexec ${quote(process.execPath)} ${quote(path.join(host,script))} "$@"\n`,{mode:0o700});
    fs.chmodSync(target,0o700);
  }
}
write(path.join(host,'com.sulsul.gemini.json'),{name:'com.sulsul.gemini',description:'Sulsul AI translation host',path:path.join(host,windows ? 'sulsul-host.exe' : 'sulsul-host'),type:'stdio',allowed_origins:[`chrome-extension://${extensionId}/`]});
console.log(JSON.stringify({extensionId,runtime,profile,manifest:path.join(host,'com.sulsul.gemini.json')}));
