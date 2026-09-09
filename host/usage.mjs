// USD per 1M tokens, checked 2026-09-09. Standard short-context API reference rates.
// https://developers.openai.com/api/docs/pricing
export const PRICE_DATE='2026-09-09';
export const PRICE_SOURCE='https://developers.openai.com/api/docs/pricing';
const prices={
  'gpt-5.6-luna':[.2,.02,.25,1.2],
  'gpt-5.6-terra':[2,.2,2.5,12],
  'gpt-5.6-sol':[4,.4,5,20],
  'gpt-6-astra':[10,1,12.5,50]
};
export function normalizeUsage(value){
  if(!value||!['inputTokens','outputTokens','cachedInputTokens','reasoningOutputTokens','totalTokens'].every(k=>Number.isSafeInteger(value[k])&&value[k]>=0))return null;
  const result=Object.fromEntries(['inputTokens','outputTokens','cachedInputTokens','reasoningOutputTokens','totalTokens'].map(k=>[k,value[k]]));
  result.cacheWriteInputTokens=Number.isSafeInteger(value.cacheWriteInputTokens)&&value.cacheWriteInputTokens>=0?value.cacheWriteInputTokens:null;
  return result;
}
export function estimateCost(model,usage,{fast=false,serviceTier=null,rerouted=false}={}){
  const rate=Object.hasOwn(prices,model||'')?prices[model]:null;
  if(!rate||!usage||rerouted)return null;
  const {inputTokens:input,outputTokens:output,cachedInputTokens:cached,cacheWriteInputTokens:write}=usage;
  if(write===null||cached+write>input||usage.reasoningOutputTokens>output)return null;
  // Translation batches should never reach long context. Do not guess its pricing.
  if(input>272000)return null;
  if(serviceTier&&!['default','standard','fast','priority'].includes(serviceTier))return null;
  const fastRate=serviceTier?['fast','priority'].includes(serviceTier):fast;
  const multiplier=fastRate?2:1;
  return {usd:((input-cached-write)*rate[0]+cached*rate[1]+write*rate[2]+output*rate[3])*multiplier/1e6,
    priceDate:PRICE_DATE,basis:fastRate?'fast':'standard',tierConfirmed:!!serviceTier};
}
