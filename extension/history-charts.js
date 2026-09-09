export const metrics={tokens:'전체 토큰',input:'입력 토큰',output:'출력 토큰',requests:'요청 수',cost:'API 환산액',duration:'평균 처리 시간'};
export function metricValue(entry,metric){
 if(metric==='requests')return 1;
 if(metric==='cost')return Number.isFinite(entry.cost?.usd)?entry.cost.usd:null;
 if(metric==='duration')return Number.isFinite(entry.durationMs)?entry.durationMs:null;
 const input=entry.usage?.inputTokens,output=entry.usage?.outputTokens;
 if(metric==='input')return Number.isSafeInteger(input)?input:null;
 if(metric==='output')return Number.isSafeInteger(output)?output:null;
 return Number.isSafeInteger(input)&&Number.isSafeInteger(output)?input+output:null;
}
export function aggregate(rows,metric){
 const values=rows.map(e=>metricValue(e,metric)).filter(v=>v!==null);
 return {count:rows.length,known:values.length,value:values.length?values.reduce((a,b)=>a+b,0)/(metric==='duration'?values.length:1):rows.length?null:0};
}
export function groupRows(rows,metric,key){
 const groups=new Map();for(const row of rows){const name=key(row);if(!groups.has(name))groups.set(name,[]);groups.get(name).push(row);}
 return [...groups].map(([label,items])=>({label,...aggregate(items,metric)})).sort((a,b)=>(b.value??-1)-(a.value??-1)||a.label.localeCompare(b.label));
}
// Calendar boundaries use the same local time zone as the history table.
export function timeBuckets(rows,metric,period,now=new Date()){
 const start=new Date(now);start.setMinutes(0,0,0);
 if(period==='today')start.setHours(0);else{start.setHours(0);start.setDate(start.getDate()-Number(period));}
 const buckets=[];
 for(let cursor=new Date(start);cursor<=now;){
  const end=new Date(cursor);if(period==='today')end.setHours(end.getHours()+1);else end.setDate(end.getDate()+1);
  const items=rows.filter(e=>e.startedAt>=cursor.getTime()&&e.startedAt<end.getTime());
  buckets.push({label:period==='today'?cursor.getHours()+'시':(cursor.getMonth()+1)+'/'+cursor.getDate(),...aggregate(items,metric)});cursor=end;
 }
 return buckets;
}
const format=(value,metric)=>value===null?'미확인':metric==='cost'?'$'+value.toFixed(5):metric==='duration'?(value/1000).toFixed(1)+'초':value.toLocaleString('ko-KR')+(metric==='requests'?'건':'');
const statuses={success:'완료',failed:'실패',canceled:'취소',running:'진행 중',incomplete:'완료 미확인'};
const groupLabels={model:e=>e.model==='default'?'계정 기본 모델':e.model||'모델 미확인',site:e=>e.site||'연결 확인',fast:e=>e.fast?'Fast 요청':'일반 요청',kind:e=>({'translation':'번역','connection-check':'연결 확인','login-check':'로그인 확인'}[e.kind]||'기타')};
function node(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
function detail(bucket,metric){return bucket.label+' · '+(bucket.count?format(bucket.value,metric):'요청 없음')+' · 확인 '+bucket.known+'/'+bucket.count+'건';}
function bars(target,buckets,metric,{percent=false}={}){
 target.replaceChildren();if(!buckets.length){target.append(node('p','chart-empty','표시할 기록이 없어요.'));return;}
 const max=Math.max(...buckets.map(b=>b.value||0))||1,total=buckets.reduce((n,b)=>n+(b.value||0),0);
 for(const bucket of buckets){
  const row=node('div','bar-row'),heading=node('div','bar-heading');heading.append(node('span','bar-label',bucket.label),node('strong','',format(bucket.value,metric)+(percent&&total?' · '+Math.round(bucket.value/total*100)+'%':'')));
  const track=node('div','bar-track'),fill=node('span','bar-fill');fill.style.width=(bucket.value||0)/(percent?total||1:max)*100+'%';track.append(fill);track.setAttribute('aria-hidden','true');
  row.append(heading,track);if(!percent)row.append(node('small','',bucket.count?'확인 '+bucket.known+' / '+bucket.count+'건':''));target.append(row);
 }
}
function trend(target,buckets,metric){
 target.replaceChildren();if(!buckets.some(b=>b.count)){target.append(node('p','chart-empty','선택한 기간에 기록이 없어요.'));return;}
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 960 225');svg.setAttribute('role','group');svg.setAttribute('aria-label',metrics[metric]+' 추이');
 const add=(tag,attrs,text)=>{const el=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))el.setAttribute(key,value);if(text!==undefined)el.textContent=text;svg.append(el);return el;};
 const max=Math.max(...buckets.map(b=>b.value||0))||1,left=100,width=840,step=width/buckets.length;
 for(const fraction of [0,.5,1]){const y=180-fraction*150;add('line',{x1:left,x2:940,y1:y,y2:y,class:'chart-grid'});add('text',{x:90,y:y+4,'text-anchor':'end',class:'chart-tick'},format(max*fraction,metric));}
 const hint=node('p','chart-hint','막대에 커서를 올리거나 키보드로 선택하면 정확한 값을 볼 수 있어요.'+(buckets.some(b=>b.value===null)?' 갈색은 값이 미확인인 구간입니다.':''));
 buckets.forEach((bucket,i)=>{
  const height=(bucket.value||0)/max*150,x=left+i*step+step*.18;
  const rect=add('rect',{x,y:180-Math.max(height,2),width:step*.64,height:Math.max(height,2),rx:3,class:'trend-bar'+(bucket.value===null?' unknown':!bucket.count?' vacant':''),tabindex:0,'aria-label':detail(bucket,metric)});
  const title=document.createElementNS(ns,'title');title.textContent=detail(bucket,metric);rect.append(title);rect.addEventListener('mouseenter',()=>hint.textContent=detail(bucket,metric));rect.addEventListener('focus',()=>hint.textContent=detail(bucket,metric));
  if(i%Math.ceil(buckets.length/10)===0||i===buckets.length-1)add('text',{x:left+i*step+step/2,y:206,'text-anchor':'middle',class:'chart-tick'},bucket.label);
 });
 const scroll=node('div','trend-scroll');scroll.append(svg);target.append(scroll,hint);
}
export function renderCharts(rows,{metric,group,period}){
 const summary=aggregate(rows,metric);
 document.getElementById('chart-coverage').textContent=metrics[metric]+' · 확인 '+summary.known+' / '+summary.count+'건'+(summary.known<summary.count?' · 미확인 값은 합계·평균에서 제외합니다.':'');
 document.getElementById('trend-title').textContent=(period==='today'?'시간별':'날짜별')+' '+metrics[metric];
 trend(document.getElementById('trend-chart'),timeBuckets(rows,metric,period),metric);
 const grouped=groupRows(rows,metric,groupLabels[group]);
 bars(document.getElementById('breakdown-chart'),grouped,metric);
 document.getElementById('breakdown-note').textContent=group==='fast'?'Fast 설정별 비교입니다. 문단 길이·모델 등이 달라 속도 실험 결과를 뜻하지 않습니다.':metric==='duration'?'사용량과 처리 시간이 확인된 범위는 다를 수 있습니다. 요청별 소요 시간의 평균입니다.':'';
 bars(document.getElementById('status-chart'),groupRows(rows,'requests',e=>statuses[e.status]||'미확인'),'requests',{percent:true});
}
