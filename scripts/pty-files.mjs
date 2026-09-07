import fs from 'node:fs';
import path from 'node:path';

export function copyPTY(root, target, platforms=[`${process.platform}-${process.arch}`]) {
  const source=path.join(root,'node_modules','node-pty'), destination=path.join(target,'node_modules','node-pty');
  for (const name of ['package.json','LICENSE','lib',...(platforms.some(p=>p.startsWith('win32-'))?['deps/winpty/LICENSE']:[]),...platforms.map(platform=>'prebuilds/'+platform)]) {
    if (!fs.existsSync(path.join(source,name))) throw new Error('Missing node-pty runtime: '+name+'. Run npm ci first.');
    fs.mkdirSync(path.dirname(path.join(destination,name)),{recursive:true});
    fs.cpSync(path.join(source,name),path.join(destination,name),{recursive:true,filter:file=>!/(?:\.test\.js|\.map|\.pdb)$/.test(file)});
  }
  for (const platform of platforms.filter(p=>p.startsWith('darwin-'))) fs.chmodSync(path.join(destination,'prebuilds',platform,'spawn-helper'),0o755);
}
