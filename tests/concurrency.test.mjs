import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {encodeMessage,createDecoder} from '../host/core.mjs';

test('native host runs two requests, cancels only the requested job, and guards settings writes',{timeout:15000},async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sulsul-concurrency-'));
  const held=new Map();
  const server=http.createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=JSON.parse(Buffer.concat(chunks));
    res.setHeader('Content-Type','application/json');
    if(req.url==='/api/show')return res.end(JSON.stringify({model_info:{architecture:'test'}}));
    const data=JSON.parse(body.messages[0].content.split('DOCUMENT_DATA\n')[1].split('\nEND_DOCUMENT_DATA')[0]);
    held.set(data.blocks[0].id,{res,data});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const endpoint=`http://127.0.0.1:${server.address().port}`;
  const extensionId='a'.repeat(32);
  for(const name of ['host.mjs','core.mjs','runner.mjs','provider-settings.mjs','providers.mjs','translation.schema.json']){
    fs.copyFileSync(new URL('../host/'+name,import.meta.url),path.join(directory,name));
  }
  fs.writeFileSync(path.join(directory,'config.json'),JSON.stringify({extensionId,profile:directory,cli:'unused',model:'test'}));
  fs.writeFileSync(path.join(directory,'providers.json'),JSON.stringify({selected:'ollama',revision:'test',providers:{ollama:{model:'test',endpoint}}}));
  const child=spawn(process.execPath,[path.join(directory,'host.mjs'),`chrome-extension://${extensionId}/`],{stdio:['pipe','pipe','pipe']});
  const pending=new Map();
  const rejectAll=error=>{for(const task of pending.values()){clearTimeout(task.timer);task.reject(error);}pending.clear();};
  child.on('error',rejectAll);
  child.stdout.on('data',createDecoder(message=>{
    const task=pending.get(message.id);if(!task)return;
    clearTimeout(task.timer);pending.delete(message.id);task.resolve(message);
  },rejectAll));
  const rpc=(id,type,data)=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('native request timed out: '+id));},5000);
    pending.set(id,{resolve,reject,timer});child.stdin.write(encodeMessage({id,type,data}));
  });
  const input=id=>({blocks:[{id,parts:[{id:'t0',text:'Read this paragraph.',locked:false}]}]});
  const release=id=>{
    const {res,data}=held.get(id);
    res.end(JSON.stringify({done:true,done_reason:'stop',message:{content:JSON.stringify({blocks:data.blocks.map(b=>({id:b.id,parts:[{id:'t0',text:'이 문단을 읽어 보세요.'}]}))})}}));
  };
  try{
    const first=rpc('first','translate',input('b1'));
    const second=rpc('second','translate',input('b2'));
    const end=Date.now()+5000;
    while(held.size!==2){if(Date.now()>end)assert.fail('both HTTP translations must be in flight');await new Promise(resolve=>setTimeout(resolve,5));}
    const overflow=await rpc('overflow','translate',input('b3'));
    assert.equal(overflow.ok,false);assert.match(overflow.error,/진행 중/);assert.equal(held.size,2);
    const saving=await rpc('saving','settings-save',{provider:'ollama',model:'next',endpoint});
    assert.equal(saving.ok,false);assert.match(saving.error,/중지/);
    assert.equal((await rpc('cancel','cancel',{ids:['first']})).ok,true);
    const canceled=await first;assert.equal(canceled.ok,false);assert.match(canceled.error,/중지/);
    assert.equal(pending.has('second'),true,'other request remains pending after targeted cancel');
    release('b2');
    const completed=await second;assert.equal(completed.ok,true);
    assert.equal(completed.result.blocks[0].id,'b2');
    assert.ok(completed.result.timings.hostTotalMs>=0);assert.equal(completed.result.timings.attempts,1);
    assert.equal((await rpc('saved','settings-save',{provider:'ollama',model:'next',endpoint})).ok,true);
    assert.equal((await rpc('settings','settings-get')).result.providers.ollama.model,'next');
  }finally{
    child.stdin.end();child.kill();rejectAll(new Error('test ended'));
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
