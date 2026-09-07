import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeMessage, createDecoder } from '../host/core.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(root,'host','config.json');
const launcher=path.join(root,'host',process.platform==='win32'?'sulsul-host.exe':'sulsul-host');
test('native launcher answers protocol and exits on pipe closure',{skip:!fs.existsSync(file)},async()=>{
  const config=JSON.parse(fs.readFileSync(file,'utf8'));
  const child=spawn(launcher,[`chrome-extension://${config.extensionId}/`],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  try {
    const result=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('native handshake timed out')),10000);
      child.on('error',reject);
      child.stdout.on('data',createDecoder(x=>{clearTimeout(timer);resolve(x);},reject));
      child.stdin.write(encodeMessage({id:'health-1',type:'health'}));
    });
    assert.equal(result.ok,true);assert.equal(result.result.protocol,1);assert.equal(typeof result.result.installed,'boolean');
  } finally { child.stdin.end(); setTimeout(()=>child.kill(),2000).unref(); }
});
test('unregistered extension cannot call the native host',{skip:!fs.existsSync(file)},async()=>{
  const child=spawn(launcher,['chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const code=await new Promise((resolve,reject)=>{child.on('exit',resolve);child.on('error',reject);});
  assert.equal(code,1);
});
