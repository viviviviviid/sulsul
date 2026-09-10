(() => {
  if(window.top!==window)return;
  if (globalThis.__sulsul) return;
  const extensionId=chrome.runtime.id;
  if(!extensionId)return;
  // A new isolated context can inherit DOM left by a previous extension instance.
  document.dispatchEvent(new Event('sulsul-reader-claim'));
  const lifecycle=new AbortController();
  let disposed=false,urlTimer,sweepTimer,observer;
  const motion=globalThis.__sulsulMotion;
  const MAX_CONCURRENT_TRANSLATIONS = 4;
  const UNTRANSLATED_MESSAGE='AI가 이 문단을 번역하지 않고 원문으로 돌려줬어요. 한 번 더 요청했지만 같아 자동 재시도를 멈췄어요.';
  // Mintlify renders prose paragraphs as direct spans, without p elements.
  const BLOCKS = 'h1,h2,h3,h4,h5,h6,p,li,td,th,dt,dd,figcaption,blockquote,.mdx-content > span';
  const EXCLUDE = '[role="timer"],pre,script,style,noscript,svg,math,input,textarea,select,iframe,object,canvas,video,audio,[contenteditable]:not([contenteditable="false"]),[aria-hidden="true"],[hidden],[inert],[data-sulsul-ui],[data-sulsul-issue]';
  const LOCKED = 'code,kbd,samp,var,[translate="no"],.notranslate';
  // Sanity stega metadata starts with four zero-width spaces. Preserve ordinary joiners.
  const readableText = text => text.replace(/\u200b{4}[\u200b-\u200d\ufeff]+/g, '');
  // Live countdowns change every second and must never become translation jobs.
  function liveCounter(text) {
    return text.length<=160 && (/(?:\d+\s*(?:days?|hrs?|hours?|mins?|minutes?|secs?|seconds?|d|h|m|s)\b[ ,:]*){2,}/i.test(text) || /\b\d{1,2}:\d{2}:\d{2}\b/.test(text));
  }
  const pageUrl = () => location.href.split('#')[0];
  let records = [], busy = false, translated = false, token = 0, complete = 0, skipped = 0, message = '', currentUrl = pageUrl(), toolbar;
  let mode = 'off', waiting = false, control = 0, readyTimer, lastChange = performance.now(), oldDocument;
  let cancellation = Promise.resolve();
  let nextId = 0, dirty = false, failed = false, scanTimer;
  let knownParts = new WeakMap();
  let providerRevision = 'initial';
  let measurements = null;
  const corners = new Set(['top-left','top-right','bottom-left','bottom-right']);
  let toolbarCorner = 'bottom-right', cornerRevision = 0;
  let toolbarMotion='play',motionRevision=0;
  let cornerWrites = Promise.resolve();
  const shadowObservers = new Map();

  function dispose(){
    if(disposed)return;
    const hadWork=busy;
    disposed=true;token++;control++;mode='off';busy=false;waiting=false;
    clearTimeout(readyTimer);clearTimeout(scanTimer);clearInterval(urlTimer);clearInterval(sweepTimer);
    lifecycle.abort();observer?.disconnect();for(const watcher of shadowObservers.values())watcher.disconnect();shadowObservers.clear();
    try{chrome.runtime.onMessage.removeListener(onMessage);chrome.storage.onChanged.removeListener(onStorageChange);}catch{}
    toolbar?._cancelDrag();restore();toolbar?.remove();
    if(globalThis.__sulsul?.dispose===dispose)delete globalThis.__sulsul;
    if(hadWork)try{chrome.runtime.sendMessage({type:'cancel',url:pageUrl()}).catch(()=>{});}catch{}
  }
  function live(){
    if(disposed)return false;
    try{if(chrome.runtime.id===extensionId)return true;}catch{}
    dispose();return false;
  }
  function pruneToolbars(){for(const node of document.querySelectorAll('[data-sulsul-ui]'))if(node!==toolbar)node.remove();}

  function state() { return { mode, waiting, busy, failed, translated, complete, total: records.length, remaining:records.filter(r=>r.status==='new'||r.status==='pending').length, background:document.hidden, skipped, message, measurements }; }
  function findRoot() { return document.body; }

  function expected(record, part) { return record.applied && !part.locked ? record.result.get(part.id) : part.original; }

  function refreshCounts() {
    complete = records.filter(r => r.applied).length;
    translated = complete > 0;
  }

  function retryIssue(element) {
    const record=records.find(r=>r.element===element);
    if(record?.status==='untranslated'){
      record.status='new';clearIssue(element);
      if(mode==='running'&&!failed){requestScan();return;}
    }
    startReading();
  }

  function restoreRecord(record) {
    if (!record.applied) return;
    record.applied = false;
    for (const part of record.parts) {
      if (!part.locked && part.node.isConnected && part.node.data === record.result.get(part.id) && part.node.data !== part.original) part.node.data = part.original;
    }
  }

  function watchShadow(root) {
    if (shadowObservers.has(root)) return;
    const observer = new MutationObserver(onMutations);
    observer.observe(root, observationOptions);
    shadowObservers.set(root, observer);
  }

  const issueMarks = new Map();
  function clearIssue(element) {
    issueMarks.get(element)?.remove();issueMarks.delete(element);
  }
  function clearIssues() { for(const element of issueMarks.keys())clearIssue(element); }
  function markIssue(element, reason, retryable=false) {
    if(!element.isConnected)return;
    const existing=issueMarks.get(element);
    if(existing?.isConnected && existing._reason===reason)return;
    clearIssue(element);
    const host=document.createElement('span');host.dataset.sulsulIssue='';
    const root=host.attachShadow({mode:'closed'});
    const style=document.createElement('style');style.textContent=`
      :host{display:inline-block!important;vertical-align:middle!important;margin-inline:6px!important;font:12px/1.6 system-ui,sans-serif!important;letter-spacing:normal!important;text-transform:none!important}
      button{font:inherit;cursor:pointer;border:1px solid #d9b97c;border-radius:50%;width:22px;height:22px;padding:0;background:#fff6df;color:#785619}
      button:focus-visible{outline:2px solid #785619;outline-offset:2px}
      .detail{display:inline-block;max-width:min(320px,70vw);padding:6px 10px;margin:4px;border-radius:8px;background:#fff8e9;color:#654c22;font:12px/1.6 system-ui,sans-serif;white-space:normal;overflow-wrap:anywhere}
      .retry{width:auto;height:auto;border-radius:6px;padding:3px 8px;margin-inline-start:6px}
      [hidden]{display:none!important}
    `;
    const button=document.createElement('button');button.type='button';button.textContent='!';button.title=reason;button.setAttribute('aria-label','술술: 이 문단 번역 문제 · '+reason);button.setAttribute('aria-expanded','false');
    const detail=document.createElement('span');detail.className='detail';detail.hidden=true;detail.textContent=reason;
    if(retryable){const retry=document.createElement('button');retry.type='button';retry.className='retry';retry.textContent='다시 시도';retry.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();retryIssue(element);});detail.append(retry);}
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();detail.hidden=!detail.hidden;button.setAttribute('aria-expanded',String(!detail.hidden));});
    root.append(style,button,detail);host._button=button;host._detail=detail;host._reason=reason;host._retryable=retryable;issueMarks.set(element,host);element.append(host);
  }

  function collect() {
    for(const [element,mark] of issueMarks)if(!element.isConnected || (mark._retryable && !records.some(r=>r.element===element&&r.status==='untranslated')))clearIssue(element);
    const groups = new Map();
    const reading = new Map();
    const inferred = new WeakSet(), checked = new WeakSet();
    const navigation = 'nav,aside,header,footer,[role="navigation"],[role="complementary"],[role="banner"],[role="contentinfo"]';
    // Infer prose containers only from text density and geometry together.
    for (const paragraph of document.querySelectorAll('p')) {
      if (paragraph.closest(navigation)) continue;
      let parent = paragraph.parentElement;
      for (let depth=0; parent && parent!==document.body && depth<4; depth++,parent=parent.parentElement) {
        if (checked.has(parent)) continue;
        checked.add(parent);
        const box=parent.getBoundingClientRect();
        if (box.width<Math.min(320,innerWidth*.5) || box.left>innerWidth*.6 || box.right<innerWidth*.4 || parent.querySelector(navigation)) continue;
        const prose=[...parent.querySelectorAll('p')].reduce((n,p)=>n+p.textContent.trim().length,0);
        const links=[...parent.querySelectorAll('a')].reduce((n,a)=>n+a.textContent.trim().length,0);
        if (prose>=240 && links<prose*.4) inferred.add(parent);
      }
    }
    const walk = (node, primary = null, fallback = null, locked = false, canRead = false, textVisible = true) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if ((!node.data.trim() && !knownParts.has(node)) || !textVisible || liveCounter(node.data)) return;
        const block = primary || fallback || node.parentElement;
        if (!block) return;
        if (node.data.trim()) {
          const range = document.createRange(); range.selectNodeContents(node);
          if (![...range.getClientRects()].some(r => r.width > 0 && r.height > 0)) return;
        }
        if (!groups.has(block)) groups.set(block, []);
        groups.get(block).push({ node, locked });
        reading.set(block, canRead);
        return;
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.matches(EXCLUDE)) return;
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.contentVisibility === 'hidden' || style.opacity === '0') return;
        textVisible = !['hidden', 'collapse'].includes(style.visibility);
        locked = locked || node.matches(LOCKED);
        if (node.matches(BLOCKS)) primary = node;
        if (node.matches('main,article,[role="main"],[role="article"]') || inferred.has(node)) canRead = true;
        if (node.matches(navigation)) canRead = false;
        if (node.matches('div,section,article,main,li,a,button,label,summary,legend,[role="button"],[role="tab"],[role="menuitem"]') || node.localName.includes('-') || !fallback) fallback = node;
        if (node.tagName === 'SLOT') {
          const assigned = node.assignedNodes({ flatten: true });
          for (const child of assigned.length ? assigned : node.childNodes) walk(child, primary, fallback, locked, canRead, textVisible);
          return;
        }
        // Chrome exposes closed component roots too. Keep traversal in rendered slot order.
        const shadow = node.shadowRoot || chrome.dom?.openOrClosedShadowRoot?.(node);
        if (shadow) {
          watchShadow(shadow);
          for (const child of shadow.childNodes) walk(child, primary, fallback, locked, canRead, textVisible);
          return;
        }
      }
      for (const child of node.childNodes) walk(child, primary, fallback, locked, canRead, textVisible);
    };
    if (document.body) walk(document.body);
    for(const element of issueMarks.keys())if(!groups.has(element))clearIssue(element);
    const previous = new Map(records.map(r => [r.element, r]));
    const reusable = new Set();
    for (const r of records) {
      const group = groups.get(r.element);
      // Keep original text and cached output when only the node identity changes.
      if (group?.length===r.parts.length && group.every((p,i)=>p.locked===r.parts[i].locked && p.node.data===expected(r,r.parts[i]))) {
        r.parts=r.parts.map((part,i)=>({...part,node:group[i].node}));
      }
      if (group?.length === r.parts.length && group.every((p,i) => p.node === r.parts[i].node && p.locked === r.parts[i].locked && p.node.data === expected(r, r.parts[i]))) reusable.add(r);
      else restoreRecord(r); // Restore only our unchanged fragments when a site edits/reuses a block.
    }
    const result = []; skipped = 0;
    let heading = '';
    for (const [element, group] of groups) {
      const old = previous.get(element);
      if (old && reusable.has(old)) {
        // A framework may replace text nodes with identical originals while AI is working.
        // Rebinding repairs the snapshot, but the rejected application must also be queued again.
        if(old.status==='skipped')old.status='new';
        if(old.status==='untranslated'){skipped++;markIssue(element,UNTRANSLATED_MESSAGE,true);}
        if (/^H[1-6]$/.test(element.tagName)) heading = old.parts.map(p => p.source).join('');
        old.reading=reading.get(element);result.push(old); continue;
      }
      const parts = group.map((p,i) => ({ ...p, id: `t${i}`, original: p.node.data, source: readableText(p.node.data) }));
      const text = parts.map(p => p.source).join('');
      if (/^H[1-6]$/.test(element.tagName)) heading = text;
      if (!parts.some(p => !p.locked && /\p{L}/u.test(p.source))) continue;
      if (!/\p{L}/u.test(text)) continue;
      // Fixed addresses/URLs/identifiers have no prose to translate.
      if (/^(?:https?:\/\/\S+|0x[0-9a-f]+|(?:[ur]\/|@)[\w.-]+|[\d\s.,_():/-]+)$/i.test(text.trim())) continue;
      if (parts.length > 300 || text.length > 14000) { skipped++; markIssue(element, parts.length > 300 ? '이 문단의 텍스트 조각이 너무 많아 원문을 유지했어요.' : '이 문단이 너무 길어 원문을 유지했어요.'); continue; }
      clearIssue(element);
      result.push({ id: `b${nextId++}`, element, heading, parts, result: null, applied: false, status: 'new', reading: reading.get(element) });
    }
    records = result;
    knownParts = new WeakMap();
    for (const record of records) for (const part of record.parts) knownParts.set(part.node, { record, part });
    for (const [root, observer] of shadowObservers) if (!root.host.isConnected) { observer.disconnect(); shadowObservers.delete(root); }
    refreshCounts();
    return records;
  }

  function serialize(record) {
    const navigation=!!record.element.closest('nav,aside,header,footer,[role="navigation"],[role="complementary"],[role="banner"],[role="contentinfo"]');
    return { id: record.id, cacheKind:navigation?'navigation':'content', heading: record.heading.slice(0,240), parts: record.parts.map(p => ({ id: p.id, text: p.source, locked: p.locked })) };
  }

  function unchanged(record, mode) {
    return record.element.isConnected && record.parts.every(p => p.node.isConnected && p.node.data === (mode === 'translated' && !p.locked ? record.result?.get(p.id) ?? p.original : p.original));
  }

  function apply(record, block) {
    if (!records.includes(record) || !unchanged(record, 'original')) return false;
    const editable = record.parts.filter(p => !p.locked);
    if (!block || !Array.isArray(block.parts) || block.parts.length !== editable.length) throw new Error('번역 문장 수가 맞지 않아 원문을 유지합니다.');
    const output = new Map();
    for (const part of block.parts) {
      if (!editable.some(p => p.id === part.id) || output.has(part.id) || typeof part.text !== 'string') throw new Error('잘못된 번역 응답입니다.');
      output.set(part.id, part.text);
    }
    // Only text data changes. No innerHTML, node replacement, href or event-handler changes.
    clearIssue(record.element);
    record.result = output;
    record.applied = true; record.status = 'done';
    for (const part of editable) part.node.data = output.get(part.id);
    return true;
  }

  function restore() {
    clearIssues();
    const restored = records.filter(r => r.applied).length;
    for (const record of records) restoreRecord(record);
    refreshCounts();
    return restored;
  }

  function displayCached() {
    let applied = 0;
    for (const r of records) if (!r.applied && r.result && unchanged(r, 'original')) {
      r.applied = true; r.status = 'done';
      for (const p of r.parts) if (!p.locked) p.node.data = r.result.get(p.id);
      applied++;
    }
    refreshCounts();
    return applied;
  }

  function dockToolbar(corner, save = false) {
    if (!corners.has(corner)) return;
    toolbarCorner = corner;
    if (toolbar) toolbar.dataset.corner = corner;
    if (save) {
      cornerRevision++;
      cornerWrites = cornerWrites.catch(() => {}).then(() => chrome.storage.local.set({'toolbar-corner':corner})).catch(() => {});
    }
  }

  function enableToolbarDrag(bar, section) {
    let drag = null, suppressClick = false, snap = null;
    const finishDrag = (event, canceled = false) => {
      if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.id)) return;
      const previous = drag; drag = null;
      const from = bar.getBoundingClientRect();
      if (canceled) suppressClick = true;
      if (previous.moved) {
        suppressClick = true;
        const corner = canceled ? previous.corner : `${event.clientY < innerHeight/2 ? 'top' : 'bottom'}-${event.clientX < innerWidth/2 ? 'left' : 'right'}`;
        dockToolbar(corner,!canceled);
      }
      bar.removeAttribute('data-dragging');
      for (const name of ['--drag-left','--drag-top','--drag-width']) bar.style.removeProperty(name);
      if (previous.moved && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const to = bar.getBoundingClientRect();
        snap = bar.animate([
          {transform:`translate(${from.left-to.left}px, ${from.top-to.top}px)`},
          {transform:'translate(0, 0)'}
        ],{duration:420,easing:'cubic-bezier(.22,1,.36,1)'});
      }
      if (previous.capture.hasPointerCapture(previous.id)) previous.capture.releasePointerCapture(previous.id);
    };
    bar._cancelDrag = () => finishDrag(null,true);
    section.addEventListener('pointerdown',event => {
      if (event.button !== 0 || !event.isPrimary || drag) return;
      const box = bar.getBoundingClientRect();
      const interrupted = snap?.playState === 'running';
      snap?.cancel(); snap = null;
      suppressClick = false;
      cornerRevision++;
      const capture=event.target.closest('button') || section;
      drag = {id:event.pointerId,x:event.clientX,y:event.clientY,corner:toolbarCorner,moved:false,capture};
      if (interrupted) {
        Object.assign(drag,{moved:true,offsetX:event.clientX-box.left,offsetY:event.clientY-box.top,width:box.width,height:box.height});
        bar.style.setProperty('--drag-width',`${box.width}px`);
        bar.style.setProperty('--drag-left',`${box.left}px`);
        bar.style.setProperty('--drag-top',`${box.top}px`);
        bar.setAttribute('data-dragging','');
      }
      capture.setPointerCapture(event.pointerId);
    });
    section.addEventListener('pointermove',event => {
      if (!drag || event.pointerId !== drag.id) return;
      if (!drag.moved) {
        if (Math.hypot(event.clientX-drag.x,event.clientY-drag.y) < 6) return;
        const box=bar.getBoundingClientRect();
        drag.moved=true; drag.offsetX=drag.x-box.left; drag.offsetY=drag.y-box.top; drag.width=box.width; drag.height=box.height;
        bar.style.setProperty('--drag-width',`${box.width}px`);
        bar.setAttribute('data-dragging','');
      }
      event.preventDefault();
      const x=Math.max(0,Math.min(innerWidth-drag.width,event.clientX-drag.offsetX));
      const y=Math.max(0,Math.min(innerHeight-drag.height,event.clientY-drag.offsetY));
      bar.style.setProperty('--drag-left',`${x}px`); bar.style.setProperty('--drag-top',`${y}px`);
    });
    section.addEventListener('pointerup',event => finishDrag(event));
    section.addEventListener('pointercancel',event => finishDrag(event,true));
    section.addEventListener('lostpointercapture',event => finishDrag(event,true));
    section.addEventListener('keydown',event => {
      if (event.key === 'Escape' && drag) { event.preventDefault(); event.stopPropagation(); finishDrag(null,true); }
    });
    // Keyboard clicks have detail 0. A new pointerdown re-enables ordinary clicks.
    section.addEventListener('click',event => {
      if (suppressClick && event.detail !== 0) { event.preventDefault(); event.stopImmediatePropagation(); }
    },true);
  }

  function notify(text = message) {
    if(!live())return;
    message = text;
    if (mode === 'off') { publish(); return; }
    pruneToolbars();
    if (!toolbar?.isConnected) {
      toolbar = document.createElement('div');
      toolbar.dataset.sulsulUi = '';
      dockToolbar(toolbarCorner);
      const shadow = toolbar.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = `
        :host{position:fixed!important;bottom:20px!important;right:16px!important;z-index:2147483647!important;font:12px/1.5 system-ui,-apple-system,"Malgun Gothic",sans-serif!important;color:#263e32!important}
        :host([data-corner^="top"]){top:20px!important;bottom:auto!important}
        :host([data-corner$="left"]){left:16px!important;right:auto!important}
        :host([data-corner$="left"]) button.extra{right:auto;left:calc(100% + 10px)}
        :host([data-corner$="left"]) button.end{left:calc(100% + 64px)}
        :host([data-dragging]){left:var(--drag-left)!important;top:var(--drag-top)!important;right:auto!important;bottom:auto!important;width:var(--drag-width)!important}
        :host([data-dragging]) section{opacity:1}
        :host([data-dragging]) section,:host([data-dragging]) button{cursor:grabbing}
        :host([data-dragging]) .alert{visibility:hidden}
        *{box-sizing:border-box}
        section{position:relative;width:48px;height:48px;border-radius:50%;opacity:.72;touch-action:none;user-select:none;cursor:grab;transition:opacity .2s}
        button{display:grid;place-items:center;border:1px solid #ffffff38;border-radius:50%;padding:0;cursor:pointer;font:600 11px/1.2 system-ui,-apple-system,"Malgun Gothic",sans-serif;white-space:nowrap;color:#353940;background:rgba(242,243,246,.66);backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);box-shadow:0 2px 10px #171c2814,0 0 0 .5px #222b3b0a;text-shadow:none;transition:background .2s,opacity .2s,transform .2s,visibility .2s}
        button.main{position:relative;width:48px;height:48px;cursor:grab;font-size:15px;color:#fff;background:rgba(38,44,55,.8);border-color:#ffffff24;box-shadow:0 3px 12px #1016241c}
        button[data-label]::after{content:attr(data-label);position:absolute;bottom:calc(100% + 9px);left:50%;transform:translateX(-50%);padding:5px 8px;border-radius:6px;background:#303640;color:#fff;font:11px/1.4 system-ui,sans-serif;white-space:nowrap;opacity:0;visibility:hidden;pointer-events:none;text-shadow:none;box-shadow:none}
        button[data-label]:hover::after,button[data-label]:focus-visible::after{opacity:1;visibility:visible}
        :host([data-corner^="top"]) button[data-label]::after{top:calc(100% + 9px);bottom:auto}
        :host([data-dragging]) button[data-label]::after{display:none}
        button svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.65;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
        button.main .brand{width:26px;height:26px;stroke-width:1.8}
        ${motion.css}
        :host([data-concealed]) .brand path{animation-play-state:paused}
        button.main .control{display:none}
        section:hover button.main .brand,section:focus-within button.main .brand{display:none}
        section:hover button.main .control,section:focus-within button.main .control{display:block}
        .control .play,.control .retry{display:none}
        section[data-paused] .control .pause,section[data-error] .control .pause{display:none}
        section[data-paused]:not([data-error]) .control .play,section[data-error] .control .retry{display:block}

        button.extra{position:absolute;top:4px;right:calc(100% + 10px);width:40px;height:40px;opacity:0;visibility:hidden;transform:translateX(8px) scale(.88)}
        button.end{right:calc(100% + 64px)}
        button.hide{right:calc(100% + 118px)}
        button.settings{right:calc(100% + 172px)}
        :host([data-corner$="left"]) button.hide{left:calc(100% + 118px)}
        :host([data-corner$="left"]) button.settings{left:calc(100% + 172px)}
        section::before{content:'';position:absolute;top:0;bottom:0;right:100%;width:222px;visibility:hidden}
        :host([data-corner$="left"]) section::before{right:auto;left:100%}
        section:hover,section:focus-within,section[data-error]{opacity:1}
        section:hover::before,section:focus-within::before{visibility:visible}
        section:hover button.extra,section:focus-within button.extra{opacity:1;visibility:visible;transform:translateX(0) scale(1)}
        .action-text,.state-text{display:none}
        section[data-error] .main{background:rgba(255,239,227,.9);color:#93421f}

        section[data-paused] .main{color:#f4da9f}
        :host([data-dragging]) button.extra,:host([data-dragging]) section::before{visibility:hidden;opacity:0}
        button.reveal{display:none;position:absolute;right:0;bottom:8px;width:28px;height:32px;border-radius:16px;background:rgba(242,243,246,.35);box-shadow:none;opacity:.4}
        button.reveal:hover,button.reveal:focus-visible{opacity:1;background:rgba(242,243,246,.8)}
        :host([data-corner$="left"]) button.reveal{left:0;right:auto}
        :host([data-concealed]) section{visibility:hidden;pointer-events:none}
        :host([data-concealed]) section button,:host([data-concealed]) section::before{visibility:hidden!important;pointer-events:none}
        :host([data-concealed]) button.reveal{display:grid}
        .alert{position:absolute;right:0;bottom:calc(100% + 10px);width:min(320px,calc(100vw - 32px));padding:13px 15px;border:1px solid #e8c7b5;border-radius:12px;background:#fffaf5;color:#78391f;font-size:12px;line-height:1.65;box-shadow:0 5px 24px #39200f1a;overflow-wrap:anywhere;white-space:pre-line}
        .alert::after{content:'';position:absolute;bottom:-6px;right:24px;width:10px;height:10px;background:#fffaf5;border-right:1px solid #e8c7b5;border-bottom:1px solid #e8c7b5;transform:rotate(45deg)}
        :host([data-corner$="left"]) .alert{left:0;right:auto}
        :host([data-corner$="left"]) .alert::after{left:24px;right:auto}
        :host([data-corner^="top"]) .alert{top:calc(100% + 10px);bottom:auto}
        :host([data-corner^="top"]) .alert::after{top:-6px;bottom:auto;transform:rotate(225deg)}
        [hidden]{display:none!important}
        section button.main:hover{background:rgba(38,44,55,.95)}
        section button:hover{background:rgba(250,250,252,.86)}
        button:focus-visible{outline:2px solid #245b40;outline-offset:2px}
        .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
        @media(prefers-reduced-motion:reduce){section,button,button.extra{transition:none}}
      `;
      const section = document.createElement('section'); section.setAttribute('aria-label','술술 네비게이션');
      const label = document.createElement('span'); label.className = 'sr-only'; label.setAttribute('role','status'); label.setAttribute('aria-live','polite');
      const alert = document.createElement('div'); alert.className='alert'; alert.setAttribute('role','alert'); alert.hidden=true;
      const action = document.createElement('button'); action.className='main'; action.addEventListener('click', () => { toggle(); });
      const stateText=document.createElement('span'); stateText.className='state-text'; stateText.setAttribute('aria-hidden','true');
      const actionText=document.createElement('span'); actionText.className='action-text'; actionText.setAttribute('aria-hidden','true'); action.append(stateText,actionText);
      const original = document.createElement('button'); original.className = 'original extra'; original.textContent = '원문'; original.title = '자동 번역을 일시중지하고 원문 보기'; original.addEventListener('click', () => { showOriginal(); });
      const end = document.createElement('button'); end.className = 'end extra'; end.textContent = '종료'; end.title = '자동 번역을 끝내고 원문으로 돌아가기'; end.addEventListener('click', () => { finish(); });
      const icon = (markup, className='') => {
        const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
        svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
        if(className)svg.setAttribute('class',className);
        svg.innerHTML=markup;return svg;
      };
      const brand=motion.create(toolbarMotion);brand.classList.add('brand');
      action.append(brand,icon('<g class="pause"><path d="M9 6v12M15 6v12"/></g><g class="play"><path d="m9 5 10 7-10 7Z"/></g><g class="retry"><path d="M20 7v5h-5M19 12a7 7 0 1 0-2 5M20 12l-3-5"/></g>','control'));
      original.dataset.label='원문';original.textContent='';original.setAttribute('aria-label','원문 보기');original.append(icon('<path d="M3 5h5c2 0 4 1 4 3v12c0-2-2-3-4-3H3Zm18 0h-5c-2 0-4 1-4 3v12c0-2 2-3 4-3h5Z"/>'));
      end.dataset.label='종료';end.textContent='';end.setAttribute('aria-label','번역 종료');end.append(icon('<path d="m7 7 10 10M17 7 7 17"/>'));
      const closedEye='<path d="M3 8c2 4 5 6 9 6s7-2 9-6M5 11l-2 3M9 14l-1 3M15 14l1 3M19 11l2 3"/>';
      const hide=document.createElement('button');hide.className='hide extra';hide.dataset.label='숨기기';hide.title='버튼 숨기기 · 번역은 계속해요';hide.setAttribute('aria-label','버튼 숨기기');hide.append(icon(closedEye));
      const reveal=document.createElement('button');reveal.className='reveal';reveal.title='술술 버튼 다시 보기';reveal.setAttribute('aria-label','술술 버튼 다시 보기');reveal.append(icon(closedEye));
      const settings=document.createElement('button');settings.className='settings extra';settings.dataset.label='설정';settings.setAttribute('aria-label','술술 설정');
      settings.append(icon('<path d="m9.5 3-.5 2-2 .9-1.9-.6-2.5 4.3 1.5 1.4v2l-1.5 1.4 2.5 4.3 1.9-.6 2 .9.5 2h5l.5-2 2-.9 1.9.6 2.5-4.3-1.5-1.4v-2l1.5-1.4-2.5-4.3-1.9.6-2-.9-.5-2Z"/><circle cx="12" cy="12" r="3"/>'));
      settings.addEventListener('click',()=>{send('open-settings').catch(error=>notify(error.message));});
      hide.addEventListener('click',()=>{toolbar.setAttribute('data-concealed','');reveal.focus({preventScroll:true});});
      reveal.addEventListener('click',()=>{toolbar.removeAttribute('data-concealed');action.focus({preventScroll:true});});
      section.append(original,end,hide,settings,action,label); shadow.append(style,alert,section,reveal);
      toolbar._hide=hide;toolbar._reveal=reveal;toolbar._motion=brand;
      toolbar._label = label; toolbar._original = original; toolbar._action = action; toolbar._end = end;
      toolbar._section=section; toolbar._alert=alert; toolbar._stateText=stateText; toolbar._actionText=actionText;
      enableToolbarDrag(toolbar,section);
      document.documentElement.append(toolbar);
    }
    toolbar._label.textContent = failed ? '' : message;
    toolbar._alert.hidden = !failed;
    if(failed)toolbar.removeAttribute('data-concealed');
    toolbar._alert.textContent = failed ? message : '';
    toolbar._section.toggleAttribute('data-error',failed);
    toolbar._section.toggleAttribute('data-paused',mode === 'paused');
    toolbar._section.toggleAttribute('data-translating',mode==='running'&&busy&&!failed);
    toolbar._motion.dataset.motion=toolbarMotion;
    toolbar._motion.toggleAttribute('data-active',mode==='running'&&busy&&!failed);
    const actionText = failed ? '다시 시도' : mode === 'paused' ? '이어 읽기' : '일시중지';
    toolbar._stateText.textContent = failed ? '번역 오류' : mode === 'paused' ? '일시중지' : waiting ? '준비 중' : busy ? `번역 중 · ${complete}개 처리` : skipped ? '일부 문단 확인 필요' : document.hidden ? '다른 탭에서 대기 중' : translated ? (records.some(r=>r.status==='new')?'읽는 범위 번역 완료':'번역 완료') : '자동 번역 켜짐';
    toolbar._actionText.textContent = actionText;
    toolbar._action.setAttribute('aria-label',`${toolbar._stateText.textContent} · ${actionText}`);
    toolbar._action.dataset.label = actionText;
    toolbar._action.removeAttribute('title');
    publish();
  }

  function publish() {
    chrome.runtime.sendMessage({ type:'sulsul-state', state:state() }).catch(() => {});
  }

  async function send(type, data) {
    if(!live())throw new Error('페이지를 새로고침하고 술술을 다시 실행해 주세요.');
    const reply = await chrome.runtime.sendMessage({ type, data, url: pageUrl() });
    if (!reply?.ok) throw new Error(reply?.error || '연결을 확인해 주세요.');
    return reply.result;
  }

  function interrupt() {
    token++;
    busy = false; waiting = false;
    clearTimeout(readyTimer);
    clearTimeout(scanTimer); scanTimer = undefined;
    for (const record of records) if (record.status === 'pending') record.status = 'new';
    cancellation = cancellation.catch(() => {}).then(() => send('cancel')).catch(() => {});
    return cancellation;
  }

  function resetProvider(nextRevision) {
    if (!nextRevision || nextRevision === providerRevision) return;
    interrupt(); restore();
    records=[]; knownParts=new WeakMap(); nextId=0; complete=0; skipped=0; translated=false; dirty=false; failed=false; oldDocument=null;
    providerRevision = nextRevision;
    measurements = null;
  }

  async function changeMode(next) {
    const revision = ++control;
    mode = next;
    failed = false;
    if (next === 'running') oldDocument = null;
    const canceled = interrupt();
    if (next === 'off') {
      restore(); toolbar?.remove(); message = ''; publish();
    } else notify(next === 'paused' ? '일시중지 중 · 다음 페이지에서도 멈춰 있어요.' : '본문이 준비되면 번역을 시작할게요…');
    try {
      const session = await send('reader-set', { mode: next });
      await canceled;
      if (revision !== control) return;
      resetProvider(session?.providerRevision);
      if (next === 'running') schedule();
    } catch(e) {
      if (revision !== control) return;
      mode = next === 'off' ? 'off' : 'paused';
      failed = true;
      notify(e.message);
    }
  }

  function stop() { return changeMode('paused'); }
  function finish() { return changeMode('off'); }
  async function showOriginal() {
    const paused = stop();
    restore(); notify('원문을 보고 있어요 · 자동 번역 일시중지 중');
    await paused;
  }

  function schedule() {
    if (mode !== 'running' || busy || waiting) return;
    waiting = true;
    lastChange = performance.now();
    const started = lastChange;
    measurements = { startedAt:started, firstTextMs:null, viewportMs:null, totalMs:null, requests:0, cacheHits:0, batches:[] };
    const run = token;
    notify('본문이 준비되면 번역을 시작할게요…');
    const check = async () => {
      if (run !== token || mode !== 'running' || currentUrl !== pageUrl()) return;
      const stillOld = oldDocument?.root.isConnected && oldDocument.root.textContent === oldDocument.text;
      if (document.readyState === 'loading' || (performance.now() - lastChange < 700 && performance.now() - started < 2000) || stillOld) {
        readyTimer = setTimeout(check, 200); return;
      }
      await cancellation;
      if (run !== token || mode !== 'running' || currentUrl !== pageUrl()) return;
      waiting = false; oldDocument = null;
      start();
    };
    readyTimer = setTimeout(check, 200);
  }

  function nextBatch() {
    if(document.hidden)return [];
    const ranked = records.filter(r => r.status === 'new' || r.status === 'pending').map(r => {
      const box = r.element.getBoundingClientRect();
      const onScreen = box.bottom >= 0 && box.top <= innerHeight && box.right>0 && box.left<innerWidth;
      const nearby = box.top>innerHeight && box.top<=innerHeight*2;
      return { record:r, inRange:box.bottom>=0&&box.top<=innerHeight*3&&box.right>0&&box.left<innerWidth, priority:r.reading && onScreen ? 0 : r.reading && nearby ? 1 : onScreen ? 2 : 3, distance:onScreen ? Math.max(0,box.top) : Math.abs(box.top) };
    }).filter(item=>item.inRange).sort((a,b) => a.priority-b.priority || a.distance-b.distance);
    const pending=ranked.filter(r=>r.record.status==='new');
    if (!pending.length) return [];
    // Finish the visible/nearby prose before allowing menus to occupy slots.
    if (pending[0].priority>=2 && ranked.some(r=>r.priority<2 && r.record.status==='pending')) return [];
    const priority=pending[0].priority;
    // Keep the current view quick; amortize instructions over larger offscreen batches.
    const blockLimit = priority===3 ? 24 : priority===1 ? 12 : !complete ? 4 : 8;
    const charLimit = priority===3 ? 12000 : priority===1 ? 5000 : !complete ? 1800 : 3200;
    const current = []; let size=0, fragments=0, allShort=true;
    for (const {record,priority} of pending) {
      const n = record.parts.reduce((v,p) => v+p.source.length,0);
      const short=n<=100;
      const limit=allShort&&short?24:blockLimit;
      if (current.length && (current.length >= limit || size+n > charLimit || fragments+record.parts.length > 1200 || priority!==pending[0].priority)) break;
      current.push(record); size+=n; fragments+=record.parts.length; allShort=allShort&&short;
    }
    return current;
  }

  function measureVisible(stats) {
    if (!stats || !complete) return;
    const elapsed = Math.round(performance.now()-stats.startedAt);
    stats.firstTextMs ??= elapsed;
    if (stats.viewportMs === null && !records.some(r => {
      const box=r.element.getBoundingClientRect();
      return !r.applied && r.status !== 'skipped' && box.bottom >= 0 && box.top <= innerHeight;
    })) stats.viewportMs=elapsed;
  }

  async function start() {
    if (busy || mode !== 'running' || failed) return;
    if(document.hidden){notify('다른 탭을 보는 동안 새 번역을 기다려요.');return;}
    const run = ++token;
    busy = true;
    currentUrl = pageUrl();
    const inFlight = new Map();
    let affected = [];
    const stats = measurements;
    let completionChecks=0,hadRequests=false;
    try {
      dirty = true;
      while (true) {
        if (run !== token || mode !== 'running' || currentUrl !== pageUrl()) return;
        // Keep references stable while requests are using this DOM snapshot.
        if (dirty && !inFlight.size) { dirty=false; collect(); displayCached(); measureVisible(stats); }
        while (inFlight.size < MAX_CONCURRENT_TRANSLATIONS) {
          const current = nextBatch();
          if (!current.length) break;
          const page = { title:readableText(document.title).slice(0,500), url:location.origin+location.pathname, headings:records.filter(r => /^H[1-6]$/.test(r.element.tagName)).map(r => r.parts.map(p => p.source).join('').slice(0,240)).slice(0,60), introduction:records.filter(r => r.reading).slice(0,4).map(r => r.parts.map(p => p.source).join('')).join('\n').slice(0,2400) };
          const first=records.indexOf(current[0]), last=records.indexOf(current.at(-1))+1;
          const data = {page,before:records[first-1]?.parts.map(p=>p.source).join('').slice(-1000)||'',after:records[last]?.parts.map(p=>p.source).join('').slice(0,1000)||'',blocks:current.map(serialize)};
          for (const r of current) r.status='pending';
          const id = current[0].id, sent = performance.now();
          hadRequests=true;
          if (stats) { stats.requests++; stats.totalMs=null; }
          // Resolve failures as values so every in-flight response is observed.
          const task = send('translate',data).then(out => ({id,current,out,sent}),error => ({id,current,error}));
          inFlight.set(id,task);
        }
        if (!inFlight.size) {
          if (dirty) continue;
          // Give rendering a moment to settle, then collect once more before reporting completion.
          // Bounded per run; unchanged records retain results and never become new AI requests.
          if(hadRequests&&!document.hidden&&completionChecks<2){
            completionChecks++;
            notify('빠진 문단이 있는지 확인하고 있어요…');
            await new Promise(resolve=>setTimeout(resolve,250));
            if(run!==token||mode!=='running'||currentUrl!==pageUrl())return;
            dirty=true;continue;
          }
          break;
        }
        notify(`번역 항목 ${complete} / ${records.length}개 · 이어서 읽고 있어요…`);
        const finished = await Promise.race(inFlight.values());
        inFlight.delete(finished.id);
        if (run !== token || mode !== 'running' || currentUrl !== pageUrl()) return;
        affected = finished.current;
        if (finished.error) throw finished.error;
        const {current,out,sent} = finished;
        if (!Array.isArray(out?.blocks) || out.blocks.length !== current.length) throw new Error('번역 항목 수가 맞지 않습니다.');
        const applyStarted = performance.now();
        for (const r of current) {
          affected = [r];
          if(out.untranslated?.includes(r.id)){
            if(unchanged(r,'original')){r.status='untranslated';r.result=null;markIssue(r.element,UNTRANSLATED_MESSAGE,true);}
            else r.status='skipped';
            dirty=true;continue;
          }
          if (!apply(r,out.blocks.find(b => b.id === r.id))) { r.status='skipped'; dirty=true; }
        }
        refreshCounts();
        measureVisible(stats);
        if (stats) {
          if (out.cached) stats.cacheHits++;
          stats.batches.push({...out.timings,blocks:current.length,cached:!!out.cached,roundTripMs:Math.round(applyStarted-sent),applyMs:Math.round(performance.now()-applyStarted)});
          if (stats.batches.length > 20) stats.batches.shift();
        }
        notify(`번역 항목 ${complete} / ${records.length}개 · 이어서 바꾸고 있어요…`);
      }
      busy=false;
      if (stats && stats.totalMs === null) stats.totalMs=Math.round(performance.now()-stats.startedAt);
      notify(document.hidden ? '다른 탭을 보는 동안 새 번역을 기다려요.' : skipped ? `번역 항목 ${skipped}개는 확인이 필요해요. 문단의 ! 표시를 확인해 주세요.` : !records.length ? '번역할 텍스트가 나타나면 자동으로 읽어요.' : records.some(r=>r.status==='new') ? '읽는 범위 번역 완료 · 스크롤하면 이어서 번역해요.' : '번역 완료 · 새로 나타나는 내용도 자동으로 읽어요.');
    } catch(e) {
      if (run !== token) return;
      failed=true;
      for(const r of affected)if(!r.applied)markIssue(r.element, e.message || '번역을 완료하지 못했어요.', true);
      const canceled=interrupt();
      notify(e.message);
      await canceled;
    } finally {
      if (run === token) { busy=false; if (dirty && !failed) requestScan(); }
    }
  }

  function requestScan() {
    if(!live())return;
    if (mode !== 'running' || failed) return;
    dirty = true;
    if (document.hidden || busy || waiting || scanTimer !== undefined) return;
    scanTimer = setTimeout(() => { scanTimer = undefined; if (mode === 'running' && !busy && !waiting && !failed) start(); }, 500);
  }

  function startReading() {
    if(mode==='running'&&!failed){toolbar?.removeAttribute('data-concealed');notify();return Promise.resolve();}
    return changeMode('running');
  }
  function toggle() { return changeMode(failed || mode !== 'running' ? 'running' : 'paused'); }
  function onMessage(msg, sender, reply) {
    if(!live())return;
    if (sender.id !== chrome.runtime.id) return;
    if (msg.type === 'sulsul-state') { reply(state()); return; }
    if (msg.type === 'sulsul-provider-changed') {
      control++; resetProvider(msg.providerRevision);
      if (mode !== 'off') { mode='paused'; notify('AI 설정이 바뀌었어요. 이어 읽기를 누르면 새 설정으로 번역합니다.'); }
      reply(state()); return;
    }
    if (msg.type === 'sulsul-navigate') { navigate(); reply(state()); return; }
    const action = { 'sulsul-start': startReading, 'sulsul-toggle': toggle, 'sulsul-restore': showOriginal, 'sulsul-stop': stop, 'sulsul-end': finish }[msg.type];
    if (action) { action().then(() => reply(state())); return true; }
  }
  chrome.runtime.onMessage.addListener(onMessage);
  // Documentation sites navigate without a page reload. Never write a late response onto a new page.
  function navigate() {
    if(!live())return;
    if (currentUrl !== pageUrl()) {
      const stillOld = records.length && records.every(r => unchanged(r, r.applied ? 'translated' : 'original'));
      interrupt();
      restore();
      const root = findRoot();
      oldDocument = stillOld ? { root, text: root.textContent } : null;
      records=[]; knownParts=new WeakMap(); nextId=0; complete=0; skipped=0; translated=false; message=''; dirty=false; failed=false; currentUrl=pageUrl();
      if (mode === 'running') schedule();
      else if (mode === 'paused') notify('일시중지 중 · 이어 읽기를 누르면 번역해요.');
    }
  }
  function onMutations(changes) {
    if(!live())return;
    navigate();
    if (mode === 'off') return;
    pruneToolbars();
    const contentChanged = changes.some(m => {
      const target = m.target.nodeType === Node.ELEMENT_NODE ? m.target : m.target.parentElement;
      if (target?.closest(EXCLUDE)) return false;
      if (m.type === 'characterData') {
        const known = knownParts.get(m.target);
        return !known || m.target.data !== expected(known.record, known.part);
      }
      return m.type === 'attributes' || [...m.addedNodes, ...m.removedNodes].some(n => n !== toolbar && !(n.nodeType === Node.ELEMENT_NODE && n.matches(EXCLUDE)));
    });
    if (contentChanged) {
      if (waiting) lastChange = performance.now();
      requestScan();
    }
    if (mode !== 'off' && !toolbar?.isConnected) notify();
  }
  const observationOptions = { childList:true, characterData:true, subtree:true, attributes:true, attributeFilter:['hidden','aria-hidden','class','style','open','slot'] };
  observer = new MutationObserver(onMutations);
  observer.observe(document.documentElement, observationOptions);
  // pushState does not fire popstate, and may precede the new document's DOM update.
  urlTimer=setInterval(() => { if (mode !== 'off') navigate(); }, 300);
  // attachShadow itself emits no document mutation; a slow sweep also finds late components.
  sweepTimer=setInterval(requestScan, 3000);
  window.addEventListener('scroll', requestScan, { passive:true, capture:true,signal:lifecycle.signal });
  window.addEventListener('resize', () => { toolbar?._cancelDrag(); requestScan(); }, { passive:true,signal:lifecycle.signal });
  window.addEventListener('popstate', navigate,{signal:lifecycle.signal});
  window.addEventListener('pagehide', () => { toolbar?._cancelDrag(); control++; interrupt(); },{signal:lifecycle.signal});
  async function synchronize() {
    if(!live())return;
    const revision = control;
    try {
      const session = await send('reader-get');
      if (revision !== control) return;
      // A document restored from BFCache may have missed the provider-change message.
      resetProvider(session?.providerRevision);
      mode = session?.mode === 'running' ? 'running' : session?.mode === 'paused' ? 'paused' : 'off';
      if (mode === 'running') schedule();
      else if (mode === 'paused') notify('일시중지 중 · 이어 읽기를 누르면 번역해요.');
      else { restore(); toolbar?.remove(); message = ''; publish(); }
    } catch {} // An unstarted reader stays silent when the extension is reloaded.
  }
  window.addEventListener('pageshow', event => { if (event.persisted) synchronize(); },{signal:lifecycle.signal});
  document.addEventListener('visibilitychange',()=>{
    if(!live()||mode!=='running')return;
    if(document.hidden){
      clearTimeout(scanTimer);scanTimer=undefined;
      if(!busy){clearTimeout(readyTimer);waiting=false;notify('다른 탭을 보는 동안 새 번역을 기다려요.');}
    }else requestScan();
  },{signal:lifecycle.signal});
  document.addEventListener('sulsul-reader-claim',dispose,{signal:lifecycle.signal});
  globalThis.__sulsul = { state,dispose };
  const initialMotionRevision=motionRevision;
  chrome.storage.local.get('toolbar-motion').then(data=>{if(motionRevision===initialMotionRevision){toolbarMotion=motion.normalize(data['toolbar-motion']);if(toolbar)toolbar._motion.dataset.motion=toolbarMotion;}}).catch(()=>{});
  function onStorageChange(changes,area){if(!live())return;if(area==='local'&&changes['toolbar-motion']){motionRevision++;toolbarMotion=motion.normalize(changes['toolbar-motion'].newValue);if(toolbar)toolbar._motion.dataset.motion=toolbarMotion;}}
  chrome.storage.onChanged.addListener(onStorageChange);
  const initialCornerRevision = cornerRevision;
  chrome.storage.local.get('toolbar-corner').then(saved => {
    if (cornerRevision === initialCornerRevision) dockToolbar(saved['toolbar-corner']);
  }).catch(() => {});
  synchronize();
})();
