import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runtimeFiles, sourceFiles } from './files.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=process.argv.includes('--source');
const extension=process.argv.includes('--extension');
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('Invalid package version');
const check=spawnSync(process.execPath,[path.join(root,'scripts/check.mjs')],{stdio:'inherit'});
if(check.status!==0)process.exit(1);
const dist=path.join(root,'dist');fs.mkdirSync(dist,{recursive:true});
const stage=fs.mkdtempSync(path.join(dist,'.stage-'));
const folder=path.join(stage,source?'sulsul':`Sulsul-${version}`);
for(const name of extension?runtimeFiles.filter(name=>name.startsWith('extension/')):source?sourceFiles:runtimeFiles){
  const target=path.join(folder,extension?name.slice('extension/'.length):name);fs.mkdirSync(path.dirname(target),{recursive:true});
  let text=fs.readFileSync(path.join(root,name),'utf8');
  if(/\.(ps1|txt)$/.test(name))text='\ufeff'+text.replace(/^\uFEFF/,'').replace(/\r?\n/g,'\r\n');
  fs.writeFileSync(target,text);
}
const zip=path.join(dist,extension?`Sulsul-Extension-${version}.zip`:source?`Sulsul-Source-${version}.zip`:`Sulsul-Windows-${version}.zip`);
const shell=process.platform==='win32'?'powershell.exe':'pwsh';
const temporaryZip=path.join(stage,'archive.zip');
const result=process.platform==='darwin'
  ? spawnSync('/usr/bin/ditto',['-c','-k',...(!extension?['--keepParent']:[]),folder,temporaryZip],{stdio:'inherit'})
  : spawnSync(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/zip.ps1'),'-Source',folder,'-Destination',temporaryZip,...(extension?['-ContentsOnly']:[])],{stdio:'inherit'});
if(result.error)throw new Error('PowerShell is needed to create the ZIP. Use Windows or the GitHub release workflow.');
if(result.status!==0)process.exit(1);
fs.renameSync(temporaryZip,zip);
fs.rmSync(stage,{recursive:true,force:true});
console.log(zip);
