(() => {
  if(globalThis.__sulsulMotion)return;
  const choices=[
    {id:'mix',name:'모두 섞기',description:'다섯 모션을 천천히 이어서'},
    {id:'play',name:'장난꾸러기',description:'점 · 선 · 곡선으로 변신'},
    {id:'orbit',name:'빙글빙글',description:'두 선이 원을 이루며 회전'},
    {id:'fold',name:'접었다 펴기',description:'선이 접혀 작은 괄호로'},
    {id:'breathe',name:'숨 고르기',description:'작아졌다 편안하게 펼침'},
    {id:'wave',name:'잔물결',description:'천천히 흐르는 두 파도'},
    {id:'off',name:'정지',description:'움직임 없이 차분하게'}
  ];
  const normalize=value=>value==='relay'?'orbit':choices.some(c=>c.id===value)?value:'play';
  const line=(y,a=4,b=20)=>`M${a} ${y}C${a} ${y} ${(a+b)/2} ${y} ${(a+b)/2} ${y}C${(a+b)/2} ${y} ${b} ${y} ${b} ${y}`;
  const dot=(x,y)=>`M${x} ${y}C${x} ${y} ${x} ${y} ${x} ${y}C${x} ${y} ${x} ${y} ${x+.02} ${y}`;
  const wave=(y,a=4)=>`M4 ${y}C7 ${y-a} 9 ${y+a} 12 ${y}C15 ${y-a} 17 ${y+a} 20 ${y}`;
  const arc=(y,a)=>`M4 ${y}C6 ${y+a} 9 ${y+a} 12 ${y+a}C15 ${y+a} 18 ${y+a} 20 ${y}`;
  const frames=(name,stops)=>`@keyframes sulsul-${name}{${stops.map(([at,d])=>`${at}%{d:path("${d}")}`).join('')}}`;
  let css=`
    .sulsul-motion{width:26px;height:26px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;overflow:hidden}
    .sulsul-motion .motion-morph,.sulsul-motion .motion-flow{display:none}
    .sulsul-motion[data-active]:not([data-motion="off"]) .motion-static{display:none}
    .sulsul-motion[data-active]:not([data-motion="off"]):not([data-motion="wave"]) .motion-morph{display:block}
    .sulsul-motion[data-active][data-motion="wave"] .motion-flow{display:block}
    .sulsul-motion[data-active][data-motion="wave"] .flow-top{animation:sulsul-drift 4.8s linear infinite}
    .sulsul-motion[data-active][data-motion="wave"] .flow-bottom{animation:sulsul-drift 5.6s linear infinite reverse;animation-delay:-1.4s}
    @keyframes sulsul-drift{0%{transform:translate(0,0)}50%{transform:translate(-8px,-.6px)}100%{transform:translate(-16px,0)}}
  `;
  const durations={play:6.8,orbit:8,fold:7.6,breathe:6.4,mix:40};
  const circle=index=>index?'M19.88 13.39C19.22 17.14 16.07 20 12 20C7.93 20 4.78 17.14 4.12 13.39':'M4.12 10.61C4.78 6.86 7.93 4 12 4C16.07 4 19.22 6.86 19.88 10.61';
  for(const [index,part] of ['top','bottom'].entries()){
    const y=index?16:8,sign=index?1:-1;
    const tracks={
      play:[[0,wave(y)],[12,wave(y)],[27,line(y)],[37,line(y)],[51,dot(12,y)],[60,dot(12,y)],[78,arc(y,sign*2.5)],[88,arc(y,sign*2.5)],[100,wave(y)]],
      orbit:[[0,line(y)],[12,line(y)],[28,circle(index)],[85,circle(index)],[100,line(y)]],
      fold:[[0,line(y)],[15,line(y)],[40,index?'M15 5C19 8 19 10 18 12C19 14 19 16 15 19':'M9 5C5 8 5 10 6 12C5 14 5 16 9 19'],[56,index?'M15 5C19 8 19 10 18 12C19 14 19 16 15 19':'M9 5C5 8 5 10 6 12C5 14 5 16 9 19'],[73,dot(index?16:8,12)],[82,dot(index?16:8,12)],[100,line(y)]],
      breathe:[[0,wave(y,3)],[18,wave(y,3)],[45,line(y,9,15)],[58,line(y,9,15)],[82,arc(y,sign*2)],[100,wave(y,3)]]
    };
    // One shared timeline keeps both lines together; the final wave joins the first frame.
    const flowing=[[0,wave(y)],[25,wave(y,-4)],[50,wave(y)],[75,wave(y,-4)],[100,wave(y)]];
    tracks.mix=[['play',0,17],['orbit',20,40],['fold',43,62],['breathe',65,81],['flow',84,100]].flatMap(([id,start,end])=>(id==='flow'?flowing:tracks[id]).map(([at,d])=>[start+(end-start)*at/100,d]));
    for(const [id,stops] of Object.entries(tracks)){
      css+=frames(id+'-'+part,stops)+`.sulsul-motion[data-active][data-motion="${id}"] .morph-${part}{animation:sulsul-${id}-${part} ${durations[id]}s cubic-bezier(.45,0,.25,1) infinite;animation-delay:${index&&id==='play'?-.35:0}s}`;
    }
  }
  css+=`
    .sulsul-motion[data-active][data-motion="orbit"] .motion-morph path{transform-origin:12px 12px;animation-name:sulsul-orbit-top,sulsul-orbit-spin;animation-duration:8s;animation-timing-function:cubic-bezier(.45,0,.25,1),linear}
    .sulsul-motion[data-active][data-motion="orbit"] .motion-morph .morph-bottom{animation-name:sulsul-orbit-bottom,sulsul-orbit-spin}
    .sulsul-motion[data-active][data-motion="mix"] .motion-morph path{transform-origin:12px 12px;animation-name:sulsul-mix-top,sulsul-mix-spin;animation-duration:40s;animation-timing-function:cubic-bezier(.45,0,.25,1),linear}
    .sulsul-motion[data-active][data-motion="mix"] .motion-morph .morph-bottom{animation-name:sulsul-mix-bottom,sulsul-mix-spin}
    @keyframes sulsul-orbit-spin{0%,28%{transform:rotate(0deg)}85%,100%{transform:rotate(360deg)}}
    @keyframes sulsul-mix-spin{0%,25.6%{transform:rotate(0deg)}37%,100%{transform:rotate(360deg)}}
  `;
  css+=`@media(prefers-reduced-motion:reduce){.sulsul-motion[data-active] path{animation:none!important}.sulsul-motion[data-active] .motion-static{display:block!important}.sulsul-motion[data-active] .motion-morph,.sulsul-motion[data-active] .motion-flow{display:none!important}}`;
  let sequence=0;
  function create(value='play'){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),clip='sulsul-motion-clip-'+(++sequence);
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('class','sulsul-motion');svg.dataset.motion=normalize(value);
    svg.innerHTML=`<defs><clipPath id="${clip}"><rect x="3" y="3" width="18" height="18" rx="1"/></clipPath></defs><path class="motion-static" d="M4 9c3-6 5 6 8 0s5 6 8 0M4 15c3-6 5 6 8 0s5 6 8 0"/><g class="motion-morph"><path class="morph-top" d="${wave(8)}"/><path class="morph-bottom" d="${wave(16)}"/></g><g class="motion-flow" clip-path="url(#${clip})"><path class="flow-top" d="M-13 8q4-4 8 0t8 0t8 0t8 0t8 0t8 0t8 0"/><path class="flow-bottom" d="M-13 16q4-4 8 0t8 0t8 0t8 0t8 0t8 0t8 0"/></g>`;
    return svg;
  }
  globalThis.__sulsulMotion=Object.freeze({choices,normalize,create,css});
})();
