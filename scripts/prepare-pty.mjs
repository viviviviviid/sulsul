import fs from 'node:fs';
// node-pty 1.1.0's macOS prebuild is published without its helper executable bit.
// Set it during installation, before Chrome starts the read-only runtime.
if(process.platform==='darwin') {
  const helper=new URL(`../node_modules/node-pty/prebuilds/darwin-${process.arch}/spawn-helper`,import.meta.url);
  if(fs.existsSync(helper))fs.chmodSync(helper,0o755);
}
