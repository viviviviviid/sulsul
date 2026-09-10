import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {UsageHistory,HISTORY_LIMIT} from '../host/history.mjs';
import {normalizeUsage,estimateCost} from '../host/usage.mjs';
import {ProviderRouter} from '../host/providers.mjs';
import {ProviderSettings} from '../host/provider-settings.mjs';
const usage=normalizeUsage({inputTokens:1000,cachedInputTokens:200,cacheWriteInputTokens:300,outputTokens:100,reasoningOutputTokens:40,totalTokens:1100});
test('API reference pricing separates cached reads/writes and does not add reasoning twice',()=>{
 assert.ok(Math.abs(estimateCost('gpt-5.6-luna',usage).usd-.000299)<1e-12);
 assert.ok(Math.abs(estimateCost('gpt-5.6-luna',usage,{fast:true}).usd-.000598)<1e-12);
 assert.equal(estimateCost('gpt-5.6-luna',usage,{fast:true,serviceTier:'default'}).basis,'standard');
 for(const model of ['default','gpt-5.3-codex-spark','unknown','__proto__'])assert.equal(estimateCost(model,usage),null);
 assert.equal(estimateCost('gpt-5.6-luna',usage,{rerouted:true}),null);
 assert.equal(estimateCost('gpt-5.6-luna',{...usage,inputTokens:300000}),null);
 assert.equal(estimateCost('gpt-5.6-luna',{...usage,cachedInputTokens:900}),null);
 assert.equal(normalizeUsage({inputTokens:0}),null);
 assert.equal(normalizeUsage({...usage,outputTokens:-1}),null);
 const {cacheWriteInputTokens,...old}=usage;
 assert.equal(estimateCost('gpt-5.6-luna',normalizeUsage(old)),null,'unreported cache writes are not invented as zero');
});
test('history survives restart, records concurrent success/failure/cancel, and excludes page contents',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sulsul-history-'));const config={schema:path.join(root,'host','translation.schema.json'),profile:root};
 try{
  const provider={id:'codex',model:'gpt-5.6-luna'},history=new UsageHistory(config);
  const pending=history.begin(provider,{page:{url:'https://example.com/private?token=SECRET',title:'PRIVATE TITLE'},blocks:[{}]},'translation');
  const restarted=new UsageHistory(config);assert.equal(restarted.read().entries[0].status,'running');
  history.finish(pending,'success',{model:'gpt-5.6-luna',modelResolved:true,usage,cost:estimateCost('gpt-5.6-luna',usage)});
  const settings=new ProviderSettings(config);let calls=0;
  const router=new ProviderRouter(config,settings,{history,translate:async(_c,_p,data,signal)=>{calls++;await new Promise(r=>setTimeout(r,1));if(data.fail||signal?.aborted){const error=new Error('PRIVATE ERROR');error.telemetry={usage};throw error;}return {blocks:[],telemetry:{usage}};}});
  const controller=new AbortController();controller.abort();
  await Promise.allSettled([router.translate({blocks:[]}),router.translate({fail:true}),router.translate({},controller.signal),router.translate({},null,null,'connection-check'),router.translate({},null,null,'login-check')]);
  const records=restarted.read().entries;assert.equal(calls,5);assert.equal(records.length,6);
  assert.equal(records.filter(e=>e.status==='failed').length,1);assert.equal(records.filter(e=>e.status==='canceled').length,1);
  assert.ok(records.some(e=>e.kind==='login-check'));assert.ok(records.every(e=>e.usage.inputTokens===1000));
  const text=JSON.stringify(records);for(const secret of ['SECRET','PRIVATE','/private','?token'])assert.ok(!text.includes(secret));
  assert.ok(records.some(e=>e.site==='example.com'));
  restarted.clear();assert.equal(history.read().entries.length,0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('history retention is bounded and does not delete unrelated files',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sulsul-retention-'));const history=new UsageHistory({schema:path.join(root,'host','translation.schema.json')});
 try{
  for(let i=0;i<HISTORY_LIMIT+2;i++)history.write({id:randomUUID(),startedAt:Date.now()+i,status:'success'});
  history.write({id:randomUUID(),startedAt:Date.now()-31*86400000,status:'success'});
  fs.writeFileSync(path.join(history.directory,'keep.txt'),'keep');
  assert.equal(history.read().entries.length,HISTORY_LIMIT);
  history.clear();assert.equal(fs.readFileSync(path.join(history.directory,'keep.txt'),'utf8'),'keep');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('private fingerprints find repeated sources across batches and restarts without storing source text',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sulsul-fingerprints-')),config={schema:path.join(root,'host','translation.schema.json')};
 try{
  const provider={model:'gpt-5.3-codex-spark',targetLanguage:'ko'},history=new UsageHistory(config);
  const block=(id,text)=>({id,heading:'PRIVATE HEADING',parts:[{id:'t0',text,locked:false}]});
  const data={page:{url:'https://example.com/private?token=SECRET',title:'PRIVATE TITLE'},blocks:[block('b0','PRIVATE SOURCE'),block('b1','SECOND SOURCE')]};
  const first=history.begin(provider,data,'translation');history.finish(first,'success',{usage});await new Promise(resolve=>setTimeout(resolve,2));
  // Changing DOM IDs, neighboring context and batch order must not hide a repeated source.
  const restarted=new UsageHistory(config),second=restarted.begin(provider,{...data,before:'new context',blocks:[block('b99','SECOND SOURCE'),block('b52','PRIVATE SOURCE')]},'translation');
  assert.deepEqual(second.fingerprints.blocks,[first.fingerprints.blocks[1],first.fingerprints.blocks[0]]);assert.equal(second.fingerprints.batch,first.fingerprints.batch);
  assert.notEqual(history.fingerprints({...provider,fast:true},data).batch,first.fingerprints.batch);
  assert.notEqual(history.fingerprints(provider,{...data,page:{...data.page,title:'Different context'}}).batch,first.fingerprints.batch);
  const one=history.fingerprints(provider,{...data,blocks:[block('b77','PRIVATE SOURCE')]});assert.equal(one.blocks[0],first.fingerprints.blocks[0]);
  // Read-only diagnostics compare retained entries and never expose per-block digests to Chrome.
  const entries=restarted.read().entries,compared=entries.find(e=>e.id===second.id);assert.equal(compared.repeatedBlocks,2);assert.equal(compared.fingerprint,first.fingerprints.batch);assert.ok(!('fingerprints' in compared));
  for(const name of history.files()){const text=fs.readFileSync(path.join(history.directory,name),'utf8');for(const secret of ['PRIVATE','SECOND SOURCE','SECRET','/private'])assert.ok(!text.includes(secret));}
  const other=new UsageHistory({schema:path.join(root,'another','host','translation.schema.json')});assert.notEqual(other.fingerprints(provider,data).batch,first.fingerprints.batch,'installations use different secrets');
  const before=restarted.files().length;restarted.read();assert.equal(restarted.files().length,before,'reading does not add requests');
  restarted.clear();assert.equal(restarted.read().entries.length,0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
