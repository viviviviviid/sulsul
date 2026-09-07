import test from 'node:test';
import assert from 'node:assert/strict';
import {withFormatRetry,DEFAULT_MODEL,cliArguments} from '../host/runner.mjs';

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
    assert.equal(calls,1);
  }
});
test('a failed Medium repair is returned without an endless retry',async()=>{
  let calls=0;
  await assert.rejects(withFormatRetry({}, {},undefined,async()=>{
    calls++;throw Object.assign(new Error('invalid output'),{code:'INVALID_TRANSLATION'});
  }));
  assert.equal(calls,2);
});
