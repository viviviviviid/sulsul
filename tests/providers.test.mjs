import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {ProviderSettings,PROVIDERS} from '../host/provider-settings.mjs';
import {ProviderRouter} from '../host/providers.mjs';
import {AccountLoginSession} from '../host/account-login.mjs';
import {accountError} from '../host/account-providers.mjs';

function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'sulsul-settings-'));const config={profile:root,schema:path.join(root,'host','translation.schema.json')};return {root,config,settings:new ProviderSettings(config),dispose(){fs.rmSync(root,{recursive:true,force:true});}};}
test('Fast persists, changes cache scope and can be disabled',async()=>{
  const f=fixture();try{
    const initial=f.settings.public().scope;
    await f.settings.save({provider:'codex',model:'gpt-5.6-luna',fast:true});
    const reopened=new ProviderSettings(f.config);
    assert.equal((await reopened.credentials()).fast,true);
    assert.notEqual(reopened.public().scope,initial);
    await reopened.save({provider:'codex',model:'gpt-5.6-luna',fast:false});
    assert.equal((await f.settings.credentials()).fast,false);
    await assert.rejects(reopened.save({provider:'codex',model:'default',fast:'true'}),/Fast/);
  }finally{f.dispose();}
});
test('new installations support only ChatGPT and need no API key',async()=>{
  const f=fixture();try{assert.deepEqual(Object.keys(PROVIDERS),['codex']);assert.equal(f.settings.public().selected,'codex');assert.deepEqual(await f.settings.credentials(),{id:'codex',model:'default',fast:false,hasKey:false});assert.equal(new ProviderRouter(f.config,f.settings).health().provider,'codex');}finally{f.dispose();}
});
test('all old selections migrate without exposing or using saved keys and retain the Codex model',async()=>{
  const f=fixture();try{
    for(const selected of ['antigravity','claude','gemini','openai','anthropic','ollama','codex']){
      const state={selected,revision:'old',providers:{[selected]:{model:'old-model',secret:'SENTINEL'},codex:{model:'kept-model'}}};
      const original=JSON.stringify(state);fs.writeFileSync(f.settings.file,original);
      const view=f.settings.public();assert.equal(view.selected,'codex');assert.deepEqual(Object.keys(view.providers),['codex']);assert.equal(view.providers.codex.model,'kept-model');assert.ok(!JSON.stringify(view).includes('SENTINEL'));
      assert.deepEqual(await f.settings.credentials(),{id:'codex',model:'kept-model',fast:false,hasKey:false});assert.equal(fs.readFileSync(f.settings.file,'utf8'),original);
    }
    const before=f.settings.public().scope;const saved=await f.settings.save({provider:'codex',model:'default'});
    assert.notEqual(saved.scope,before);assert.equal(f.settings.public().scope,saved.scope);
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(f.settings.file)).providers),['codex']);
    await assert.rejects(new ProviderRouter(f.config,f.settings).translate({},null,before),/설정이 변경/);
  }finally{f.dispose();}
});
test('old model does not become the ChatGPT model and unsupported requests fail closed',async()=>{
  const f=fixture();try{
    fs.writeFileSync(f.settings.file,JSON.stringify({selected:'antigravity',revision:'old',providers:{antigravity:{model:'gemini-old'}}}));
    assert.equal(f.settings.public().providers.codex.model,'default');
    for(const provider of ['antigravity','claude','openai','anthropic','gemini','ollama','__proto__'])await assert.rejects(f.settings.save({provider,model:'test',apiKey:'fake'}),/ChatGPT/);
    for(const model of ['', '../bad model','x'.repeat(161)])await assert.rejects(f.settings.save({provider:'codex',model}),/모델/);
    assert.throws(()=>new AccountLoginSession({},'claude',()=>{}),/ChatGPT/);
    assert.match(accountError('codex','429 quota').message,/한도/);
    await f.settings.save({provider:'codex',model:'default'});assert.equal(f.settings.public().providers.codex.model,'default');
  }finally{f.dispose();}
});
