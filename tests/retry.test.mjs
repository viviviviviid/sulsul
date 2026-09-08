import test from 'node:test';
import assert from 'node:assert/strict';
import {withFormatRetry,DEFAULT_MODEL,cliArguments,cliError,runTranslation} from '../host/runner.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';

test('translation explicitly chooses Flash Low instead of inheriting the CLI default',()=>{
  const args=cliArguments({schema:'schema.json'});
  assert.equal(args[args.indexOf('--model')+1],'gemini-3.8-flash-low');
});
test('invalid model structure gets one Medium repair attempt',async()=>{
  const models=[];const expected={blocks:[]};
  const result=await withFormatRetry({}, {},undefined,async config=>{
    models.push(config.model||DEFAULT_MODEL);
    if(models.length===1)throw Object.assign(new Error('missing fragment'),{code:'INVALID_TRANSLATION'});
    return expected;
  });
  assert.deepEqual(models,['gemini-3.8-flash-low','gemini-3.8-flash-medium']);
  assert.equal(result,expected);
});
test('quota errors and cancellation are not retried',async()=>{
  for(const canceled of [false,true]){
    let calls=0;const controller=new AbortController();
    if(canceled)controller.abort();
    await assert.rejects(withFormatRetry({}, {},controller.signal,async()=>{
      calls++;throw Object.assign(new Error(canceled?'canceled':'quota'),{code:canceled?'INVALID_TRANSLATION':'QUOTA'});
    }));
    assert.equal(calls,canceled?0:1);
  }
});
test('a failed Medium repair is returned without an endless retry',async()=>{
  let calls=0;
  await assert.rejects(withFormatRetry({}, {},undefined,async()=>{
    calls++;throw Object.assign(new Error('invalid output'),{code:'INVALID_TRANSLATION'});
  }));
  assert.equal(calls,2);
});

test('a stream interruption retries the same model once, including after format repair',async()=>{
  const models=[];
  await assert.rejects(withFormatRetry({}, {},undefined,async config=>{
    models.push(config.model||DEFAULT_MODEL);
    if(models.length===1)throw Object.assign(new Error('invalid output'),{code:'INVALID_TRANSLATION'});
    throw cliError('The stream was interrupted. Please continue the task you were working on.');
  },{wait:async()=>{}}),/응답 연결이 중간에 끊겼/);
  assert.deepEqual(models,[DEFAULT_MODEL,'gemini-3.8-flash-medium','gemini-3.8-flash-medium']);
  let calls=0;
  assert.equal(await withFormatRetry({model:'custom-model'}, {},undefined,async config=>{
    calls++;assert.equal(config.model,'custom-model');
    if(calls===1)throw cliError({message:'The stream was interrupted.'});return 'ok';
  },{wait:async()=>{}}),'ok');assert.equal(calls,2);
  for(const text of ['429 quota exceeded; stream was interrupted','401 authentication failed; stream was interrupted']){
    assert.notEqual(cliError(text).code,'STREAM_INTERRUPTED');
  }
});

test('canceling during stream retry backoff never starts another process',async()=>{
  const controller=new AbortController();let calls=0;
  const pending=withFormatRetry({}, {},controller.signal,async()=>{calls++;throw cliError('The stream was interrupted.');});
  setTimeout(()=>controller.abort(),10);await assert.rejects(pending,/중지/);assert.equal(calls,1);
});

test('CLI error status rejects even complete-looking output, and releases its slot only after close',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sulsul-stream-'));
  const config={cli:'fixture',profile:root,workspace:root,settings:path.join(root,'settings.json'),schema:'unused'};
  fs.writeFileSync(config.settings,JSON.stringify({permissions:{deny:['read_file(*)','write_file(*)','command(*)','unsandboxed(*)','read_url(*)','execute_url(*)','mcp(*)']}}));
  const data={blocks:[{id:'b0',parts:[{id:'t0',text:'Read comfortably.',locked:false}]}]};
  const output={blocks:[{id:'b0',parts:[{id:'t0',text:'편하게 읽어요.'}]}]};
  let child,closed=false;
  const spawnProcess=()=>{
    const script=`process.stdin.resume(); process.stdout.write(JSON.stringify(${JSON.stringify({event:'result',result:{status:'ERROR',error:'The stream was interrupted.',structured_output:output}})})+'\\n'); setInterval(()=>{},1000);`;
    child=spawn(process.execPath,['-e',script],{stdio:['pipe','pipe','pipe'],windowsHide:true});
    child.on('close',()=>{closed=true;});return child;
  };
  try{
    await assert.rejects(runTranslation(config,data,undefined,{spawnProcess}),{code:'STREAM_INTERRUPTED'});
    assert.equal(closed,true);assert.equal(fs.existsSync(path.join(root,'verified.json')),false);
  }finally{child?.kill();fs.rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
