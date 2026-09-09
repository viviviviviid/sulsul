(() => {
  const motion=globalThis.__sulsulMotion,grid=document.getElementById('motion-choices'),status=document.getElementById('motion-status');
  const style=document.createElement('style');style.textContent=motion.css;document.head.append(style);
  let selected='play';
  const radios=[];
  const render=value=>{selected=motion.normalize(value);for(const radio of radios)radio.checked=radio.value===selected;};
  for(const choice of motion.choices){
    const label=document.createElement('label');label.className='motion-choice';
    const radio=document.createElement('input');radio.type='radio';radio.name='toolbar-motion';radio.value=choice.id;radio.disabled=true;
    const preview=document.createElement('span');preview.className='motion-preview';const svg=motion.create(choice.id);svg.setAttribute('data-active','');preview.append(svg);
    const name=document.createElement('strong');name.textContent=choice.name;
    const description=document.createElement('small');description.textContent=choice.description;
    label.append(radio,preview,name,description);grid.append(label);radios.push(radio);
    radio.addEventListener('change',async()=>{
      if(!radio.checked)return;const previous=selected;
      for(const input of radios)input.disabled=true;
      try{await chrome.storage.local.set({'toolbar-motion':radio.value});render(radio.value);status.textContent='적용했어요. 번역 중인 버튼에도 바로 반영됩니다.';}
      catch{render(previous);status.textContent='저장하지 못했어요. 다시 선택해 주세요.';}
      finally{for(const input of radios)input.disabled=false;}
    });
  }
  chrome.storage.local.get('toolbar-motion').then(data=>render(data['toolbar-motion'])).catch(()=>{render('play');status.textContent='설정을 읽지 못했어요. 원하는 모션을 다시 선택해 주세요.';}).finally(()=>{for(const radio of radios)radio.disabled=false;});
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes['toolbar-motion'])render(changes['toolbar-motion'].newValue);});
  const visibility=()=>grid.toggleAttribute('data-paused',document.hidden);document.addEventListener('visibilitychange',visibility);visibility();
})();
