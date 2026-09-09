import {renderCharts} from './history-charts.js';
const $=id=>document.getElementById(id);
const number=value=>Number.isSafeInteger(value)&&value>=0?value.toLocaleString('ko-KR'):'미확인';
const money=value=>typeof value==='number'&&Number.isFinite(value)?'$'+value.toFixed(5):'—';
const statuses={success:'완료',failed:'실패',canceled:'취소',running:'진행 중',incomplete:'완료 미확인'};
const kinds={translation:'번역', 'connection-check':'연결 확인', 'login-check':'로그인 확인'};
let entries=[],visible=[],page=0,busy=false;
async function rpc(type){const reply=await chrome.runtime.sendMessage({type});if(!reply?.ok)throw new Error(reply?.error||'기록을 읽지 못했어요.');return reply.result;}
function sum(rows,get){return rows.reduce((total,row)=>total+(get(row)||0),0);}
function render(){
 const now=new Date(),period=$('period').value;const cutoff=period==='today'?new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime():Date.now()-Number(period)*86400000;
 visible=entries.filter(e=>e.startedAt>=cutoff&&($('model').value==='all'||e.model===$('model').value));
 const measured=visible.filter(e=>e.usage),priced=visible.filter(e=>Number.isFinite(e.cost?.usd));
 $('request-total').textContent=number(visible.length);$('request-detail').textContent='완료 '+visible.filter(e=>e.status==='success').length+' · 실패/취소 '+visible.filter(e=>['failed','canceled'].includes(e.status)).length;
 $('input-total').textContent=measured.length?number(sum(measured,e=>e.usage.inputTokens)):'—';$('input-detail').textContent='캐시 읽기 '+(measured.length?number(sum(measured,e=>e.usage.cachedInputTokens)):'미확인');
 $('output-total').textContent=measured.length?number(sum(measured,e=>e.usage.outputTokens)):'—';$('output-detail').textContent='토큰 확인 '+measured.length+' / '+visible.length+'건';
 $('cost-total').textContent=priced.length?money(sum(priced,e=>e.cost.usd)):'—';$('cost-detail').textContent='산정 가능 '+priced.length+' / '+visible.length+'건';
 renderCharts(visible,{metric:$('chart-metric').value,group:$('chart-group').value,period});
 const maxPage=Math.max(0,Math.ceil(visible.length/50)-1);page=Math.min(page,maxPage);
 $('rows').replaceChildren();
 for(const entry of visible.slice(page*50,(page+1)*50)){
  const row=document.createElement('tr');
  const cell=(text,detail)=>{const td=document.createElement('td');td.textContent=text;if(detail){const small=document.createElement('small');small.textContent=detail;td.append(small);}row.append(td);return td;};
  cell(new Date(entry.startedAt).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}),entry.site||kinds[entry.kind]||'연결 확인');
  cell(entry.model==='default'?'계정 기본 모델':entry.model,(entry.modelResolved?'':'모델 확인 전 · ')+(entry.fast?'Fast 요청 · ':'')+(entry.rerouted?'모델 전환 · ':'')+(kinds[entry.kind]||'번역')+' · '+entry.blocks+'문단');
  const state=cell('');const badge=document.createElement('span');badge.className='badge '+(Object.hasOwn(statuses,entry.status)?entry.status:'');badge.textContent=statuses[entry.status]||'미확인';state.append(badge);
  cell(number(entry.usage?.inputTokens),entry.usage?'캐시 읽기 '+number(entry.usage.cachedInputTokens)+' / 쓰기 '+number(entry.usage.cacheWriteInputTokens):'');
  cell(number(entry.usage?.outputTokens),entry.usage?'추론 '+number(entry.usage.reasoningOutputTokens)+' 포함':'');
  cell(money(entry.cost?.usd),entry.cost?entry.cost.priceDate+' · '+entry.cost.basis:'산정 불가');
  cell(Number.isFinite(entry.durationMs)?(entry.durationMs/1000).toFixed(1)+'초':'—');
  $('rows').append(row);
 }
 $('empty').hidden=visible.length>0;$('page-label').textContent=visible.length?(page+1)+' / '+(maxPage+1):'';$('previous').disabled=page===0;$('next').disabled=page>=maxPage;$('export').disabled=!visible.length||busy;
}
async function refresh(){
 if(busy)return;busy=true;$('refresh').disabled=true;$('export').disabled=true;
 try{
  const result=await rpc('history-get');
  if(!Array.isArray(result.entries))throw new Error('연결 프로그램을 최신 버전으로 업데이트해 주세요.');
  entries=result.entries;const selected=$('model').value;$('model').replaceChildren(new Option('모든 모델','all'));
  for(const model of [...new Set(entries.map(e=>e.model))].sort())$('model').append(new Option(model==='default'?'계정 기본 모델':model,model));
  $('model').value=[...$('model').options].some(o=>o.value===selected)?selected:'all';
  $('status').className=result.storageError||result.unreadable?'error':'';
  $('status').textContent=result.storageError||result.unreadable?'일부 기록을 저장하거나 읽지 못했습니다. 합계가 실제 사용량보다 적을 수 있어요.':'최근 '+result.days+'일 · 최대 '+number(result.limit)+'건 · '+new Date().toLocaleTimeString('ko-KR')+' 기준';
 }catch(error){$('status').className='error';$('status').textContent=error.message+' 연결 프로그램 업데이트 후 다시 확인해 주세요.';}
 finally{busy=false;$('refresh').disabled=false;render();}
}
$('period').addEventListener('change',()=>{page=0;render();});$('model').addEventListener('change',()=>{page=0;render();});$('refresh').addEventListener('click',refresh);
$('chart-metric').addEventListener('change',render);$('chart-group').addEventListener('change',render);
$('previous').addEventListener('click',()=>{page--;render();});$('next').addEventListener('click',()=>{page++;render();});
$('export').addEventListener('click',()=>{
 const csvCell=value=>{let s=String(value??'');if(/^\s*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 const rows=[['started_at','site','kind','model','model_resolved','fast_requested','status','input_tokens','cached_input_tokens','cache_write_input_tokens','output_tokens','reasoning_output_tokens','api_reference_usd','price_date','price_basis','duration_ms'],...visible.map(e=>[new Date(e.startedAt).toISOString(),e.site,e.kind,e.model,e.modelResolved,e.fast,e.status,e.usage?.inputTokens,e.usage?.cachedInputTokens,e.usage?.cacheWriteInputTokens,e.usage?.outputTokens,e.usage?.reasoningOutputTokens,e.cost?.usd,e.cost?.priceDate,e.cost?.basis,e.durationMs])];
 const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
 const link=document.createElement('a');link.href=url;link.download='sulsul-usage-'+new Date().toISOString().slice(0,10)+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('clear').addEventListener('click',()=>$('clear-dialog').showModal());$('cancel-clear').addEventListener('click',()=>$('clear-dialog').close());
$('confirm-clear').addEventListener('click',async()=>{if(busy)return;$('confirm-clear').disabled=true;try{await rpc('history-clear');$('clear-dialog').close();await refresh();}catch(error){$('status').className='error';$('status').textContent=error.message;}finally{$('confirm-clear').disabled=false;}});
refresh();
