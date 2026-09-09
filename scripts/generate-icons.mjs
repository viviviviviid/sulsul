import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const folder=path.join(root,'extension/icons');
const svg=fs.readFileSync(path.join(folder,'sulsul.svg'),'utf8');
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({deviceScaleFactor:1});
  for(const size of [16,32,48,128]) {
    // Optical sizing: toolbar icons need less padding and heavier strokes.
    const artwork=size<=32 ? svg
      .replace('x="8" y="8" width="112" height="112" rx="34"','x="0" y="0" width="128" height="128" rx="30"')
      .replace('stroke-width="8"','stroke-width="12"')
      .replace('M32 49c12-24 20 24 32 0s20 24 32 0','M18 43c17-28 29 28 46 0s29 28 46 0')
      .replace('M32 77c12-24 20 24 32 0s20 24 32 0','M18 83c17-28 29 28 46 0s29 28 46 0') : svg;
    await page.setViewportSize({width:size,height:size});
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${artwork}`);
    await page.screenshot({path:path.join(folder,`icon-${size}.png`),omitBackground:true});
  }
} finally {await browser.close();}
console.log('Generated extension icons: 16, 32, 48, 128px');
