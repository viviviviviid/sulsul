import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregate,groupRows,timeBuckets} from '../extension/history-charts.js';
test('chart metrics exclude unknown values, retain measured zero, and average requests directly',()=>{
 const rows=[{model:'a',usage:{inputTokens:100,outputTokens:20,cachedInputTokens:40,reasoningOutputTokens:5},cost:{usd:.002},durationMs:1000},{model:'a',durationMs:3000},{model:'b',usage:{inputTokens:0,outputTokens:0},cost:{usd:0}}];
 assert.deepEqual(aggregate(rows,'tokens'),{count:3,known:2,value:120});
 assert.deepEqual(aggregate(rows,'cost'),{count:3,known:2,value:.002});
 assert.deepEqual(aggregate(rows,'duration'),{count:3,known:2,value:2000});
 assert.deepEqual(aggregate([rows[1]],'tokens'),{count:1,known:0,value:null});
 assert.equal(aggregate(rows,'requests').value,3);
 assert.deepEqual(groupRows(rows,'tokens',e=>e.model).map(g=>[g.label,g.value]),[['a',120],['b',0]]);
});
test('time series respects local calendar boundaries, gaps and partial days',()=>{
 const now=new Date(2026,8,9,14,30),at=(day,hour)=>new Date(2026,8,day,hour).getTime();
 const rows=[{startedAt:at(9,0)},{startedAt:at(9,13)},{startedAt:at(8,23)}];
 const hourly=timeBuckets(rows,'requests','today',now);
 assert.equal(hourly.length,15);assert.equal(hourly[0].value,1);assert.equal(hourly[13].value,1);assert.equal(hourly[14].value,0);
 const daily=timeBuckets(rows,'requests','7',now);
 assert.equal(daily.length,8);assert.equal(daily.at(-1).value,2);assert.equal(daily.at(-2).value,1);
 assert.equal(timeBuckets([rows[0]],'cost','today',now)[0].value,null);
});
