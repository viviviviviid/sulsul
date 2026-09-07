import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, parseTranslation, encodeMessage, createDecoder } from '../host/core.mjs';
import { makeEnvironment, readableError } from '../host/runner.mjs';
const request = {blocks:[{id:'b0',parts:[{id:'t0',text:'Call ',locked:false},{id:'t1',text:'lzReceive()',locked:true},{id:'t2',text:' after verification.',locked:false}]}]};
test('full sentence can be distributed around a locked code node',()=>{
  const result = parseTranslation(JSON.stringify({blocks:[{id:'b0',parts:[{id:'t0',text:'검증 후 '},{id:'t2',text:'를 호출합니다.'}]}]}),request);
  assert.equal(result.blocks[0].parts[1].text,'를 호출합니다.');
});
test('missing, duplicated, unknown and locked fragment IDs fail closed',()=>{
  for(const parts of [[],[{id:'t0',text:'a'},{id:'t0',text:'b'}],[{id:'t0',text:'a'},{id:'t1',text:'modified code'}],[{id:'t0',text:'a'},{id:'unknown',text:'b'}]]) assert.throws(()=>parseTranslation(JSON.stringify({blocks:[{id:'b0',parts}]}),request));
});
test('empty complete translations and missing blocks are rejected',()=>{
  assert.throws(()=>parseTranslation('{"blocks":[]}',request));
  assert.throws(()=>parseTranslation(JSON.stringify({blocks:[{id:'b0',parts:[{id:'t0',text:''},{id:'t2',text:''}]}]}),request));
});
test('input limits and instruction/data separation',()=>{
  const prompt=buildPrompt(request); assert.match(prompt,/untrusted/); assert.match(prompt,/DOCUMENT_DATA/);
  assert.throws(()=>buildPrompt({blocks:[{id:'b0',parts:[{id:'t0',text:'x'.repeat(40000),locked:false}]}]}));
});
test('native messaging tolerates UTF-8 split at every byte and multiple frames',()=>{
  const got=[];const errors=[];const decode=createDecoder(x=>got.push(x),e=>errors.push(e));
  const first={id:'한글',text:'술술 읽는 문서 📖'};
  for(const byte of encodeMessage(first)) decode(Buffer.from([byte]));
  decode(Buffer.concat([encodeMessage({a:1}),encodeMessage({b:2})]));
  assert.deepEqual(got,[first,{a:1},{b:2}]);assert.equal(errors.length,0);
});
test('malformed/oversized native frames close parsing',()=>{
  let count=0;const decode=createDecoder(()=>assert.fail(),()=>count++);
  const huge=Buffer.alloc(4);huge.writeUInt32LE(2000000);decode(huge);decode(encodeMessage({}));assert.equal(count,1);
});
test('API credentials and arbitrary Node startup options do not enter CLI environment',()=>{
  const before=process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY='sentinel';
  const env=makeEnvironment({profile:'P',settings:'S',systemPrompt:'M'});
  if(before===undefined) delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=before;
  assert.equal(env.GEMINI_API_KEY,undefined);assert.equal(env.NODE_OPTIONS,undefined);assert.equal(env.USERPROFILE,'P');
  if (process.platform !== 'win32') {
    assert.equal(env.HOME,'P');assert.equal(env.XDG_CONFIG_HOME,'P/.config');
    assert.notEqual(process.env.HOME,'P');
  }
});
test('quota failures cannot silently switch to paid API',()=>assert.match(readableError('429 RESOURCE_EXHAUSTED quota exceeded'),/전환하지/));
test('retired consumer login is reported as a migration error, not a retry-login error',()=>{
  assert.match(readableError('Failed to sign in: This client is no longer supported. Please migrate to Antigravity'),/지원이 종료/);
});
