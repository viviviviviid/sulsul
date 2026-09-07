import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { ProviderSettings, protectSecret, localEndpoint } from '../host/provider-settings.mjs';
import { apiRequest, translateAPI, extractText, requestJSON, ProviderRouter } from '../host/providers.mjs';
import { buildPrompt } from '../host/core.mjs';
const data={blocks:[{id:'b0',parts:[{id:'t0',text:'Read easily.',locked:false},{id:'t1',text:'fixed()',locked:true}]}]};
const translated={blocks:[{id:'b0',parts:[{id:'t0',text:'편하게 읽어요.'}]}]};
const json=JSON.stringify(translated);
const responses={
  gemini:{candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'private thought'},{text:json}]}}]},
  openai:{status:'completed',output:[{type:'reasoning',summary:[]},{type:'message',content:[{type:'output_text',text:json}]}]},
  anthropic:{stop_reason:'end_turn',content:[{type:'thinking',thinking:'private thought'},{type:'text',text:json}]},
  ollama:{done:true,done_reason:'stop',message:{content:json}}
};
const response=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
test('all four HTTP providers normalize the same fragments and never send tools',async()=>{
  for(const id of Object.keys(responses)){
    const calls=[];
    const result=await translateAPI({id,model:'test-model',apiKey:'FAKE_TEST_KEY'},data,undefined,async(url,init)=>{
      calls.push({url,init});assert.equal(init.redirect,'error');
      if(url.endsWith('/api/show'))return response({model_info:{architecture:'test'}});
      const body=JSON.parse(init.body);assert.equal(body.tools,undefined);assert.equal(JSON.stringify(body).includes('finish tool'),false);
      return response(responses[id]);
    });
    assert.deepEqual(result,translated);
    assert.equal(calls.length,id==='ollama'?2:1);
    const last=calls.at(-1);
    if(id==='openai'){assert.equal(last.url,'https://api.openai.com/v1/responses');assert.equal(JSON.parse(last.init.body).store,false);assert.equal(JSON.parse(last.init.body).text.format.strict,true);}
    if(id==='gemini')assert.equal(last.init.headers['x-goog-api-key'],'FAKE_TEST_KEY');
    if(id==='anthropic')assert.equal(last.init.headers['anthropic-version'],'2023-06-01');
    if(id==='ollama')assert.equal(Object.values(last.init.headers).includes('FAKE_TEST_KEY'),false);
  }
  assert.ok(buildPrompt(data).includes('finish tool'));
});
test('truncation, refusals, missing IDs and altered locked parts are rejected',async()=>{
  assert.throws(()=>extractText('openai',{...responses.openai,status:'incomplete'}));
  assert.throws(()=>extractText('gemini',{candidates:[{finishReason:'MAX_TOKENS'}]}));
  assert.throws(()=>extractText('anthropic',{...responses.anthropic,stop_reason:'max_tokens'}));
  assert.throws(()=>extractText('ollama',{...responses.ollama,done_reason:'length'}));
  for(const text of ['not json',JSON.stringify({blocks:[]}),JSON.stringify({blocks:[{id:'b0',parts:[{id:'t1',text:'changed code'}]}]})]){
    await assert.rejects(translateAPI({id:'openai',model:'test',apiKey:'fake'},data,undefined,async()=>response({status:'completed',output:[{type:'message',content:[{type:'output_text',text}]}]})));
  }
});
test('HTTP quota/auth errors never echo server content or retry',async()=>{
  for(const code of [400,401,403,404,429,500]){
    let calls=0;
    await assert.rejects(translateAPI({id:'openai',model:'test',apiKey:'sensitive-value'},data,undefined,async()=>{calls++;return new Response('sensitive-value private page',{status:code});}),e=>!e.message.includes('sensitive')&&!e.message.includes('private page'));
    assert.equal(calls,1);
  }
});
test('loopback transport aborts a running HTTP request and blocks redirects',async()=>{
  let received;
  const started=new Promise(resolve=>{received=resolve;});
  let connections=0;
  const server=http.createServer((req,res)=>{connections++;if(req.url==='/redirect'){res.writeHead(302,{Location:'/destination'});res.end();}else received();});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const endpoint=`http://127.0.0.1:${server.address().port}`;
  try{
    await assert.rejects(requestJSON(endpoint+'/redirect',{}));assert.equal(connections,1);
    const controller=new AbortController();
    const pending=requestJSON(endpoint+'/pending',{signal:controller.signal});
    await started;controller.abort();await assert.rejects(pending,/중지/);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('large responses fail before being parsed',async()=>{
  await assert.rejects(requestJSON('https://api.openai.com/v1/responses',{},async()=>new Response('x'.repeat(4_000_001))));
});
test('Ollama cannot use a remote endpoint or cloud model, including aliases',async()=>{
  for(const url of ['https://example.com','http://127.0.0.1.evil.test','http://127.0.0.1/path','http://user:secret@localhost','http://localhost/?key=value'])assert.throws(()=>localEndpoint(url));
  assert.equal(localEndpoint('http://localhost:1234/'),'http://localhost:1234');
  for(const model of ['example:cloud','example-cloud'])await assert.rejects(translateAPI({id:'ollama',model},data,undefined,async()=>assert.fail('cloud generation attempted')));
  let calls=0;
  await assert.rejects(translateAPI({id:'ollama',model:'disguised-alias'},data,undefined,async()=>{calls++;return response({remote_host:'https://ollama.com',remote_model:'some-model',model_info:{architecture:'test'}});}));
  assert.equal(calls,1);
  const request=apiRequest({id:'openai',model:'example',apiKey:'fake',endpoint:'https://other.example'},data);
  assert.equal(new URL(request.url).host,'api.openai.com');
});
test('settings preserve per-provider keys, redact them, and change cache scopes',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sulsul-settings-'));
  const config={profile:dir,model:'gemini-3.8-flash-low',cli:path.join(dir,'missing.exe')};
  const crypt=async(value,mode)=>mode==='unprotect'?Buffer.from(value,'base64').toString():Buffer.from(value).toString('base64');
  const settings=new ProviderSettings(config,crypt);
  const initial=settings.public();assert.equal(initial.selected,'antigravity');
  const saved=await settings.save({provider:'openai',model:'test-a',apiKey:'FAKE_TEST_KEY'});
  assert.notEqual(saved.scope,initial.scope);assert.equal(saved.providers.openai.hasKey,true);
  assert.equal(JSON.stringify(saved).includes('FAKE_TEST_KEY'),false);assert.equal(JSON.stringify(saved).includes('secret'),false);
  const firstScope=saved.scope;
  await settings.save({provider:'gemini',model:'test-b',apiKey:'SECOND_FAKE_KEY'});
  const switched=await settings.save({provider:'openai',model:'test-a',apiKey:''});
  assert.notEqual(switched.scope,firstScope);assert.equal((await settings.credentials()).apiKey,'FAKE_TEST_KEY');
  const router=new ProviderRouter(config,settings);
  await assert.rejects(router.translate(data,undefined,firstScope),/설정이 변경/);
  await settings.save({provider:'openai',model:'test-a',apiKey:'',clearKey:true});
  assert.equal(settings.public().providers.openai.hasKey,false);await assert.rejects(settings.credentials(),/API 키/);
  await assert.rejects(settings.save({provider:'__proto__',model:'x',apiKey:''}));
  await assert.rejects(settings.save({provider:'openai',model:'--command',apiKey:'fake'}));
  await settings.save({provider:'antigravity',model:'gemini-3.8-flash-low',apiKey:''});
  assert.equal((await settings.credentials()).apiKey,undefined);
});
test('Windows DPAPI encrypts and decrypts a fake credential without plaintext on disk',{skip:process.platform!=='win32'},async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sulsul-dpapi-'));
  const settings=new ProviderSettings({profile:dir});
  await settings.save({provider:'openai',model:'test-model',apiKey:'SULSUL_FAKE_CREDENTIAL_NOT_A_REAL_KEY'});
  assert.equal(fs.readFileSync(settings.file,'utf8').includes('SULSUL_FAKE_CREDENTIAL'),false);
  assert.equal((await settings.credentials()).apiKey,'SULSUL_FAKE_CREDENTIAL_NOT_A_REAL_KEY');
  await assert.rejects(protectSecret('not-a-valid-ciphertext','unprotect'));
});
