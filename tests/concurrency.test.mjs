import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {encodeMessage,createDecoder} from '../host/core.mjs';

test('native host runs four requests, cancels only the requested job, and guards settings writes',{timeout:15000},async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sulsul-concurrency-'));
  const held=new Map();
  for(const name of ['workspace','profile'])fs.mkdirSync(path.join(directory,'data','accounts','codex',name),{recursive:true});
  const fake=path.join(directory,'fake-codex.mjs');
  fs.writeFileSync(fake,`import fs from 'node:fs';import readline from 'node:readline';
    const send=value=>process.stdout.write(JSON.stringify(value)+'\\n');
    readline.createInterface({input:process.stdin}).on('line',line=>{
      const m=JSON.parse(line);if(!m.id)return;
      const reply=result=>send({id:m.id,result});
      if(m.method==='initialize')return reply({});
      if(m.method==='account/read')return reply({account:{type:'chatgpt'}});
      if(m.method==='thread/start')return reply({thread:{id:'thread'}});
      if(m.method==='turn/start'){
        reply({});const text=m.params.input[0].text;
        const data=JSON.parse(text.split('DOCUMENT_DATA\\n')[1].split('\\nEND_DOCUMENT_DATA')[0]);
        const id=data.blocks[0].id;fs.writeFileSync(${JSON.stringify(directory)}+'/'+id+'.started','');
        const timer=setInterval(()=>{if(!fs.existsSync(${JSON.stringify(directory)}+'/'+id+'.release'))return;clearInterval(timer);
          const output={blocks:data.blocks.map(b=>({id:b.id,parts:[{id:'t0',text:'이 문단을 읽어 보세요.'}]}))};
          send({method:'item/completed',params:{threadId:'thread',item:{type:'agentMessage',text:JSON.stringify(output)}}});
          send({method:'turn/completed',params:{threadId:'thread',turn:{status:'completed'}}});
        },10);
      }
    });`);
  const extensionId='a'.repeat(32);
  for(const name of ['host.mjs','core.mjs','runner.mjs','provider-settings.mjs','providers.mjs','account-runtime.mjs','account-providers.mjs','translation.schema.json']){
    let source=fs.readFileSync(new URL('../host/'+name,import.meta.url),'utf8');
    if(name==='account-runtime.mjs')source=source.replace("cli:path.join(root,definition.version,binary)","cli:process.execPath");
    if(name==='account-providers.mjs')source=source.replace('args=codexArguments()','args='+JSON.stringify([fake])).replace('args:codexArguments(provider.fast===true)','args:'+JSON.stringify([fake]));
    fs.writeFileSync(path.join(directory,name),source);
  }
  fs.writeFileSync(path.join(directory,'config.json'),JSON.stringify({extensionId,profile:directory,schema:path.join(directory,'host','translation.schema.json')}));
  fs.writeFileSync(path.join(directory,'providers.json'),JSON.stringify({selected:'codex',revision:'test',providers:{codex:{model:'default'}}}));
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
  const release=id=>fs.writeFileSync(path.join(directory,id+'.release'),'');
  try{
    assert.equal((await rpc('capacity','settings-get')).result.maxConcurrentTranslations,4);
    const first=rpc('first','translate',input('b1'));
    const second=rpc('second','translate',input('b2'));
    const third=rpc('third','translate',input('b3'));
    const fourth=rpc('fourth','translate',input('b4'));
    const end=Date.now()+5000;
    while(held.size!==4){for(const id of ['b1','b2','b3','b4'])if(fs.existsSync(path.join(directory,id+'.started')))held.set(id,true);if(Date.now()>end)assert.fail('four Codex translations must be in flight');await new Promise(resolve=>setTimeout(resolve,5));}
    const overflow=await rpc('overflow','translate',input('b5'));
    assert.equal(overflow.ok,false);assert.match(overflow.error,/진행 중/);assert.equal(held.size,4);
    const saving=await rpc('saving','settings-save',{provider:'codex',model:'next'});
    assert.equal(saving.ok,false);assert.match(saving.error,/중지/);
    assert.equal((await rpc('cancel','cancel',{ids:['first']})).ok,true);
    const canceled=await first;assert.equal(canceled.ok,false);assert.match(canceled.error,/중지/);
    assert.equal(pending.has('second'),true,'other request remains pending after targeted cancel');
    assert.equal(pending.has('third'),true);assert.equal(pending.has('fourth'),true);
    release('b4');assert.equal((await fourth).result.blocks[0].id,'b4');
    release('b3');assert.equal((await third).result.blocks[0].id,'b3');
    release('b2');
    const completed=await second;assert.equal(completed.ok,true);
    assert.equal(completed.result.blocks[0].id,'b2');
    assert.ok(completed.result.timings.hostTotalMs>=0);
    assert.equal((await rpc('saved','settings-save',{provider:'codex',model:'next'})).ok,true);
    assert.equal((await rpc('settings','settings-get')).result.providers.codex.model,'next');
    assert.equal((await rpc('removed','settings-save',{provider:'claude',model:'sonnet'})).ok,false);
  }finally{
    child.stdin.end();child.kill();rejectAll(new Error('test ended'));
    await new Promise(resolve=>child.once('close',resolve));
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
