(() => {
  if (globalThis.__sulsul) return;
  // Mintlify renders prose paragraphs as direct spans, without p elements.
  const BLOCKS = 'h1,h2,h3,h4,h5,h6,p,li,td,th,dt,dd,figcaption,blockquote,.mdx-content > span';
  const EXCLUDE = 'pre,script,style,noscript,svg,math,input,textarea,select,iframe,object,canvas,video,audio,[contenteditable]:not([contenteditable="false"]),[aria-hidden="true"],[hidden],[inert],[data-sulsul-ui]';
  const LOCKED = 'code,kbd,samp,var,[translate="no"],.notranslate';
  const pageUrl = () => location.href.split('#')[0];
  let records = [], busy = false, translated = false, token = 0, complete = 0, skipped = 0, message = '', currentUrl = pageUrl(), toolbar;
  let mode = 'off', waiting = false, control = 0, readyTimer, lastChange = performance.now(), oldDocument;
  let cancellation = Promise.resolve();
  let nextId = 0, dirty = false, failed = false, scanTimer;
  let knownParts = new WeakMap();
  let providerRevision = 'initial';
  const shadowObservers = new Map();

  function state() { return { mode, waiting, busy, translated, complete, total: records.length, skipped, message }; }
  function findRoot() { return document.body; }

  function expected(record, part) { return record.applied && !part.locked ? record.result.get(part.id) : part.original; }

  function refreshCounts() {
    complete = records.filter(r => r.applied).length;
    translated = complete > 0;
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

  function collect() {
    const groups = new Map();
    const reading = new Map();
    const walk = (node, primary = null, fallback = null, locked = false, canRead = false, textVisible = true) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if ((!node.data.trim() && !knownParts.has(node)) || !textVisible) return;
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
        if (node.matches('main,article,[role="main"],[role="article"]')) canRead = true;
        if (node.matches('nav,[role="navigation"]')) canRead = false;
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
    const previous = new Map(records.map(r => [r.element, r]));
    const reusable = new Set();
    for (const r of records) {
      const group = groups.get(r.element);
      if (group?.length === r.parts.length && group.every((p,i) => p.node === r.parts[i].node && p.locked === r.parts[i].locked && p.node.data === expected(r, r.parts[i]))) reusable.add(r);
      else restoreRecord(r); // Restore only our unchanged fragments when a site edits/reuses a block.
    }
    const result = []; skipped = 0;
    let heading = '';
    for (const [element, group] of groups) {
      const old = previous.get(element);
      if (old && reusable.has(old)) {
        if (/^H[1-6]$/.test(element.tagName)) heading = old.parts.map(p => p.original).join('');
        result.push(old); continue;
      }
      const parts = group.map((p,i) => ({ ...p, id: `t${i}`, original: p.node.data }));
      const text = parts.map(p => p.original).join('');
      if (/^H[1-6]$/.test(element.tagName)) heading = text;
      if (!parts.some(p => !p.locked && /[a-zA-Z]{2}/.test(p.original))) continue;
      if (!/[a-zA-Z]{2}/.test(text)) continue;
      // Fixed addresses/URLs/identifiers have no prose to translate.
      if (/^(?:https?:\/\/\S+|0x[0-9a-f]+|(?:[ur]\/|@)[\w.-]+|[\d\s.,_():/-]+)$/i.test(text.trim())) continue;
      if (parts.length > 300 || text.length > 14000) { skipped++; continue; }
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
    return { id: record.id, heading: record.heading.slice(0,240), parts: record.parts.map(p => ({ id: p.id, text: p.original, locked: p.locked })) };
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
    record.result = output;
    record.applied = true; record.status = 'done';
    for (const part of editable) part.node.data = output.get(part.id);
    return true;
  }

  function restore() {
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

  function notify(text = message) {
    message = text;
    if (mode === 'off') { publish(); return; }
    if (!toolbar?.isConnected) {
      toolbar = document.createElement('div');
      toolbar.dataset.sulsulUi = '';
      const shadow = toolbar.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = `
        :host{position:fixed!important;bottom:20px!important;right:16px!important;z-index:2147483647!important;font:12px/1.5 system-ui,-apple-system,"Malgun Gothic",sans-serif!important;color:#263e32!important}
        *{box-sizing:border-box}
        section{display:flex;align-items:center;gap:4px;padding:5px;border:1px solid #ffffff80;border-radius:12px;background:#fffffc66;backdrop-filter:blur(10px) saturate(130%);-webkit-backdrop-filter:blur(10px) saturate(130%);box-shadow:0 2px 12px #122d220d;transition:background .18s,border-color .18s,box-shadow .18s}
        button{border:0;border-radius:7px;padding:7px 10px;cursor:pointer;font:inherit;white-space:nowrap;background:#eaf2e948;color:#245b408c;transition:background .18s,color .18s}
        button.end,button.original{background:transparent;color:#65746780}
        section:hover,section:focus-within{background:#fffffced;border-color:#d9e1d8e6;box-shadow:0 3px 18px #122d2220}
        section:hover button,section:focus-within button{background:#eaf2e9;color:#245b40}
        section:hover button.end,section:focus-within button.end,section:hover button.original,section:focus-within button.original{background:transparent;color:#657467}
        section button:hover{background:#dcebd9}section button.end:hover,section button.original:hover{background:#eef0e9}
        button:focus-visible{outline:2px solid #245b40;outline-offset:2px}
        .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
        @media(prefers-reduced-motion:reduce){section,button{transition:none}}
      `;
      const section = document.createElement('section'); section.setAttribute('aria-label','술술 번역');
      const label = document.createElement('span'); label.className = 'sr-only'; label.setAttribute('role','status'); label.setAttribute('aria-live','polite');
      const action = document.createElement('button'); action.addEventListener('click', () => { toggle(); });
      const original = document.createElement('button'); original.className = 'original'; original.textContent = '원문'; original.title = '자동 번역을 일시중지하고 원문 보기'; original.addEventListener('click', () => { showOriginal(); });
      const end = document.createElement('button'); end.className = 'end'; end.textContent = '종료'; end.title = '자동 번역을 끝내고 원문으로 돌아가기'; end.addEventListener('click', () => { finish(); });
      section.append(original,action,end,label); shadow.append(style,section);
      toolbar._label = label; toolbar._original = original; toolbar._action = action; toolbar._end = end;
      document.documentElement.append(toolbar);
    }
    toolbar._label.textContent = message;
    toolbar._action.textContent = mode === 'paused' ? '이어 읽기' : '일시중지';
    toolbar._action.title = message;
    publish();
  }

  function publish() {
    chrome.runtime.sendMessage({ type:'sulsul-state', state:state() }).catch(() => {});
  }

  async function send(type, data) {
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
  }

  async function changeMode(next) {
    const revision = ++control;
    mode = next;
    if (next === 'running') { failed = false; oldDocument = null; }
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

  async function start() {
    if (busy || mode !== 'running' || failed) return;
    const run = ++token;
    busy = true;
    currentUrl = pageUrl();
    try {
      dirty = true;
      while (true) {
        if (run !== token || currentUrl !== pageUrl()) return;
        if (dirty) { dirty = false; collect(); displayCached(); }
        const pending = records.filter(r => r.status === 'new').map(r => {
          const box = r.element.getBoundingClientRect();
          const onScreen = box.bottom >= 0 && box.top <= innerHeight;
          return { record: r, priority: onScreen ? (r.reading ? 0 : 1) : 2, distance: onScreen ? 0 : Math.abs(box.top) };
        }).sort((a,b) => a.priority - b.priority || a.distance - b.distance);
        if (!pending.length) break;
        const current = []; let size = 0, fragments = 0;
        for (const {record} of pending) {
          const n = record.parts.reduce((v,p) => v + p.original.length, 0);
          if (current.length && (current.length >= (complete ? 18 : 4) || size+n > (complete ? 7000 : 1800) || fragments+record.parts.length > 1200)) break;
          current.push(record); size += n; fragments += record.parts.length;
        }
        const page = { title: document.title.slice(0,500), url: location.origin + location.pathname, headings: records.filter(r => /^H[1-6]$/.test(r.element.tagName)).map(r => r.parts.map(p => p.original).join('').slice(0,240)).slice(0,60), introduction: records.filter(r => r.reading).slice(0,4).map(r => r.parts.map(p => p.original).join('')).join('\n').slice(0,2400) };
        const first = records.indexOf(current[0]), last = records.indexOf(current.at(-1)) + 1;
        const data = { page, before: records[first-1]?.parts.map(p=>p.original).join('').slice(-1000) || '', after: records[last]?.parts.map(p=>p.original).join('').slice(0,1000) || '', blocks: current.map(serialize) };
        for (const r of current) r.status = 'pending';
        notify(`번역 항목 ${complete} / ${records.length}개 · 이어서 읽고 있어요…`);
        const out = await send('translate', data);
        if (run !== token || currentUrl !== pageUrl()) return;
        if (!Array.isArray(out?.blocks) || out.blocks.length !== current.length) throw new Error('번역 항목 수가 맞지 않습니다.');
        for (const r of current) {
          if (!apply(r, out.blocks.find(b => b.id === r.id))) { r.status = 'skipped'; dirty = true; }
        }
        refreshCounts();
        notify(`번역 항목 ${complete} / ${records.length}개 · 이어서 바꾸고 있어요…`);
      }
      busy = false;
      notify(!records.length ? '영어 텍스트가 나타나면 자동으로 읽어요.' : skipped ? `번역 항목 ${complete}개 완료 · 너무 긴 항목 ${skipped}개는 원문 유지` : '번역 완료 · 새로 나타나는 내용도 자동으로 읽어요.');
    } catch(e) {
      if (run !== token) return;
      busy = false;
      failed = true;
      for (const r of records) if (r.status === 'pending') r.status = 'new';
      notify(e.message);
    } finally {
      if (run === token) { busy = false; if (dirty && !failed) requestScan(); }
    }
  }

  function requestScan() {
    if (mode !== 'running' || failed) return;
    dirty = true;
    if (busy || waiting || scanTimer !== undefined) return;
    scanTimer = setTimeout(() => { scanTimer = undefined; if (mode === 'running' && !busy && !waiting && !failed) start(); }, 500);
  }

  function toggle() { return changeMode(mode === 'running' ? 'paused' : 'running'); }
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return;
    if (msg.type === 'sulsul-state') { reply(state()); return; }
    if (msg.type === 'sulsul-provider-changed') {
      control++; resetProvider(msg.providerRevision);
      if (mode !== 'off') { mode='paused'; notify('AI 설정이 바뀌었어요. 이어 읽기를 누르면 새 설정으로 번역합니다.'); }
      reply(state()); return;
    }
    if (msg.type === 'sulsul-navigate') { navigate(); reply(state()); return; }
    const action = { 'sulsul-toggle': toggle, 'sulsul-restore': showOriginal, 'sulsul-stop': stop, 'sulsul-end': finish }[msg.type];
    if (action) { action().then(() => reply(state())); return true; }
  });
  // Documentation sites navigate without a page reload. Never write a late response onto a new page.
  function navigate() {
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
    navigate();
    if (mode === 'off') return;
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
  const observer = new MutationObserver(onMutations);
  observer.observe(document.documentElement, observationOptions);
  // pushState does not fire popstate, and may precede the new document's DOM update.
  setInterval(() => { if (mode !== 'off') navigate(); }, 300);
  // attachShadow itself emits no document mutation; a slow sweep also finds late components.
  setInterval(requestScan, 3000);
  window.addEventListener('scroll', requestScan, { passive:true, capture:true });
  window.addEventListener('resize', requestScan, { passive:true });
  window.addEventListener('popstate', navigate);
  window.addEventListener('pagehide', () => { control++; interrupt(); });
  async function synchronize() {
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
  window.addEventListener('pageshow', event => { if (event.persisted) synchronize(); });
  globalThis.__sulsul = { state };
  synchronize();
})();
