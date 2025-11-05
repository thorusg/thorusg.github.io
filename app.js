  // Base path to local data (no example deps)
  const SERVER_STRING = 'en_US';
  // Base to story data (JSON + txt). Replace this with a raw GitHub URL if desired.
  const DATA_BASE = `/content/Kengxxiao/${SERVER_STRING}`;
  // Base to static assets (images, audio, etc.). Replace this to point to a CDN/raw URL when needed.
  const DATA_ASSETS = `https://raw.githubusercontent.com/akgcc/arkdata/main/assets/`;
  // Expose assets base for other modules loaded on the page, but don't overwrite if set early in index.html

  const DEFAULT_CHAPTER_ID = 'main_0';
  const DEFAULT_LEVEL_TXT = 'obt/guide/beg/0_welcome_to_guide';
  const DEFAULT_ROUTE_HASH = '#chapter=main_0&level=obt%2Fguide%2Fbeg%2F0_welcome_to_guide';

(function(){
  const categorySelect = document.getElementById('categorySelect');
  const chapterSelect = document.getElementById('chapterSelect');
  const levelSelect = document.getElementById('levelSelect');
  const statusEl = document.getElementById('status');
  const currentEl = document.getElementById('current');
  const currentNameEl = document.getElementById('currentName');
  const currentTextEl = document.getElementById('currentText');
  const choicesEl = document.getElementById('choices');
  const progressEl = document.getElementById('progress');
  const prevBtn = document.getElementById('prevBtn');
  const logBtn = document.getElementById('logBtn');
  const nextBtn = document.getElementById('nextBtn');
  const listEl = document.getElementById('list');
  const logModal = document.getElementById('logModal');
  const logContainer = document.getElementById('logContainer');
  const closeLogBtn = document.getElementById('closeLogBtn');
  const controlsEl = document.getElementById('controls');

  const backgroundAPI = window.StoryBackground || {};
  const backgroundController = backgroundAPI.BackgroundController
    ? new backgroundAPI.BackgroundController({ root: document.body })
    : null;
  const parseImageTag = typeof backgroundAPI.parseImageTag === 'function' ? backgroundAPI.parseImageTag : null;
  const parseBlockerTag = typeof backgroundAPI.parseBlockerTag === 'function' ? backgroundAPI.parseBlockerTag : null;
  const parseCurtainTag = typeof backgroundAPI.parseCurtainTag === 'function' ? backgroundAPI.parseCurtainTag : null;
  const guardAllows = typeof backgroundAPI.guardAllows === 'function' ? backgroundAPI.guardAllows : null;

  const audioAPI = window.StoryAudio || {};
  const audioController = audioAPI.AudioController
    ? new audioAPI.AudioController()
    : null;
  const parsePlayMusic = typeof audioAPI.parsePlayMusic === 'function' ? audioAPI.parsePlayMusic : null;
  const parseStopMusic = typeof audioAPI.parseStopMusic === 'function' ? audioAPI.parseStopMusic : null;
  const parsePlaySound = typeof audioAPI.parsePlaySound === 'function' ? audioAPI.parsePlaySound : null;

  const characterAPI = window.StoryCharacters || {};
  const characterController = characterAPI.CharacterController
    ? new characterAPI.CharacterController()
    : null;
  const parseCharacterTag = typeof characterAPI.parseCharacterTag === 'function' ? characterAPI.parseCharacterTag : null;
  const parseCharSlotTag = typeof characterAPI.parseCharSlotTag === 'function' ? characterAPI.parseCharSlotTag : null;
  const parseDialogTag = typeof characterAPI.parseDialogTag === 'function' ? characterAPI.parseDialogTag : null;

  // Camera effects/controllers
  // (moved to top of file) duplicate leftover removed

  const effectsAPI = window.StoryEffects || {};
  const effectsController = effectsAPI.EffectsController
    ? new effectsAPI.EffectsController()
    : null;
  const parseCameraEffect = typeof effectsAPI.parseCameraEffect === 'function' ? effectsAPI.parseCameraEffect : null;

  if(!window.location.hash){
    window.location.hash = DEFAULT_ROUTE_HASH.slice(1);
  }

  let storyReview = null; // story_review_table.json
  let moduleData = null; // uniequip_table.json
  let rogueData = null; // roguelike_topic_table.json
  let storyVariables = null; // story_variables.json
  // id -> { id, name, items: [ { code, name, txt, sort } ], category }
  let chapters = {};
  // category -> [chapterId]
  let chapterByCategory = {};
  const CATEGORY_NAMES = {
    main: 'Main Story',
    side: 'Side Story',
    mini: 'Vignette',
    record: 'Operator Record',
    // reserved for future expansion
    module: 'Operator Module',
    rogue: 'Integrated Strategies',
  };
  const CATEGORY_ORDER = ['main', 'side', 'mini', 'record', 'rogue'];
  let dialogues = [];
  let view = [];
  let index = 0;
  let selections = {};
  let isDelaying = false;
  let delayTimerId = null;
  let lastRenderedViewIndex = -1;
  let pendingEffectTimers = [];
  let textRevealRafId = null;
  // Responsive scaling: match background's contain scale for a 16:9 canvas
  function updateViewportScale(){
    try{
      const baseW = 1920; // logical background width
      const baseH = 1080; // logical background height
      const s = Math.min((window.innerWidth||baseW)/baseW, (window.innerHeight||baseH)/baseH) || 1;
      document.documentElement.style.setProperty('--viewport-scale', String(s));
    }catch{}
  }
  updateViewportScale();
  window.addEventListener('resize', updateViewportScale);

  function cancelTextReveal(){
    if(textRevealRafId){ try{ cancelAnimationFrame(textRevealRafId); }catch{} textRevealRafId = null; }
  }

  function wrapCharsForReveal(root){
    const spans = [];
    try{
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.nodeValue && n.nodeValue.length) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
      });
      const textNodes = [];
      let node;
      while((node = walker.nextNode())){ textNodes.push(node); }
      for(const tn of textNodes){
        const chars = Array.from(tn.nodeValue);
        const frag = document.createDocumentFragment();
        for(const ch of chars){
          const s = document.createElement('span');
          s.className = 'tw-char';
          s.textContent = ch;
          frag.appendChild(s);
          spans.push(s);
        }
        tn.parentNode.replaceChild(frag, tn);
      }
    } catch {}
    return spans;
  }

  function startTextReveal(root, opts){
    const cps = (opts && opts.cps) || 28;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    cancelTextReveal();
    if(reduce){ return; }
    const spans = wrapCharsForReveal(root);
    if(!spans.length){ return; }
    const start = performance.now();
    function step(now){
      const elapsed = now - start;
      const shown = Math.min(spans.length, Math.floor((elapsed/1000) * cps));
      for(let i=0;i<shown;i++){
        const s = spans[i];
        if(s && !s.classList.contains('is-on')) s.classList.add('is-on');
      }
      if(shown < spans.length){
        textRevealRafId = requestAnimationFrame(step);
      } else {
        cancelTextReveal();
      }
    }
    textRevealRafId = requestAnimationFrame(step);
  }

  function setStatus(text){ statusEl.textContent = text || ''; }

  function parseHash(){
    const h = window.location.hash.replace(/^#/, '');
    const out = {};
    if(!h) return out;
    for(const part of h.split('&')){
      if(!part) continue;
      const [k, v] = part.split('=');
      if(!k) continue;
      out[decodeURIComponent(k)] = v ? decodeURIComponent(v) : '';
    }
    return out;
  }
  function setHashRoute(chapterId, levelTxt){
    const parts = [];
    if(chapterId) parts.push(`chapter=${encodeURIComponent(chapterId)}`);
    if(levelTxt) parts.push(`level=${encodeURIComponent(levelTxt)}`);
    const newHash = '#' + parts.join('&');
    if(newHash !== window.location.hash){
      window.location.hash = newHash;
    } else {
      // If hash unchanged (e.g., selecting same), still apply
      applyRouteFromHash();
    }
  }

  async function loadStoryIndex(){
    setStatus('Loading story index...');
    try{
      // Preload extra sources for future categories (Module, Integrated Strategies)
      try {
        const modRes = await fetch(`${DATA_BASE}/gamedata/excel/uniequip_table.json`, { cache: 'no-store' });
        if(modRes.ok){ moduleData = await modRes.json(); }
      } catch {}
      try {
        const rogRes = await fetch(`${DATA_BASE}/gamedata/excel/roguelike_topic_table.json`, { cache: 'no-store' });
        if(rogRes.ok){ rogueData = await rogRes.json(); }
      } catch {}

      const url = `${DATA_BASE}/gamedata/excel/story_review_table.json`;
      const res = await fetch(url, { cache: 'no-store' });
      if(!res.ok) throw new Error('Failed to load story_review_table');
      storyReview = await res.json();
      if(!storyVariables){
        try {
          const varRes = await fetch(`${DATA_BASE}/gamedata/story/story_variables.json`, { cache: 'no-store' });
          if(varRes.ok){
            storyVariables = await varRes.json();
            if(audioController && typeof audioController.setVariables === 'function'){
              audioController.setVariables(storyVariables);
            }
          }
        } catch(err){
          console.warn('Failed to load story variables', err);
        }
      }
      buildChapters();
      await buildRogueChapters();
      populateCategories();
      const defaultChapter = DEFAULT_CHAPTER_ID && DEFAULT_CHAPTER_ID in chapters
        ? chapters[DEFAULT_CHAPTER_ID]
        : null;
      const defaultCategory = defaultChapter ? defaultChapter.category : undefined;
      populateChapters(defaultCategory);
      // initialize routing
      const route = parseHash();
      if(route.chapter && chapters[route.chapter]){
        // let hashchange drive the rest
        applyRouteFromHash();
      } else {
        if(defaultChapter){
          const hasSpecificLevel = defaultChapter.items.some(it => it.txt === DEFAULT_LEVEL_TXT);
          const level = hasSpecificLevel ? DEFAULT_LEVEL_TXT : (defaultChapter.items[0] || {}).txt;
          setHashRoute(defaultChapter.id, level);
        } else {
          // default to first chapter alphabetically if configured home is unavailable
          const list = Object.values(chapters).sort((a,b)=> a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
          if(list.length){
            const first = list[0];
            const firstLevel = (first.items[0]||{}).txt;
            setHashRoute(first.id, firstLevel);
          }
        }
      }
      setStatus('');
    }catch(err){
      console.error(err);
      setStatus('Failed to load story index');
    }
  }

  function buildChapters(){
    chapters = {};
    chapterByCategory = {};
    const toCategory = (id, entryType) => {
      if(id && id.startsWith('main_')) return 'main';
      if(id && id.startsWith('story_')) return 'record';
      const et = String(entryType || '').toUpperCase();
      if(et === 'MAINLINE') return 'main';
      if(et.startsWith('MINI')) return 'mini';
      return 'side';
    };
    for(const id of Object.keys(storyReview)){
      const entry = storyReview[id];
      const items = (entry.infoUnlockDatas || [])
        .map(it => ({
          code: it.storyCode || '',
          name: it.storyName || '',
          txt: it.storyTxt || '',
          sort: it.storySort || 0,
        }))
        .filter(it => it.txt)
        .sort((a,b)=> a.sort - b.sort || a.code.localeCompare(b.code));
      if(items.length){
        const category = toCategory(id, entry.entryType || '');
        chapters[id] = {
          id,
          name: entry.name || id,
          items,
          category,
        };
        if(!chapterByCategory[category]) chapterByCategory[category] = [];
        chapterByCategory[category].push(id);
      }
    }
    // Preserve JSON order (approx. release order) by not re-sorting here.
  }

  async function buildRogueChapters(){
    try{
      if(!rogueData || !rogueData.topics) return;
      const topics = rogueData.topics;
      // Keep the order they appear in the JSON
      const topicIds = Object.keys(topics);
      for(const tid of topicIds){
        const t = topics[tid] || {};
        const m = String(tid).match(/rogue_(\d+)/);
        if(!m) continue;
        const n = m[1];
        const details = (rogueData.details && rogueData.details[tid]) || {};
        const items = [];
        // Prefer endbook entries if present (ro2+), with real titles
        const endbook = details.archiveComp && details.archiveComp.endbook && details.archiveComp.endbook.endbook;
        if(endbook && Object.keys(endbook).length){
          for(const [ekey, ev] of Object.entries(endbook)){
            const endingId = String(ev.endingId || '').toLowerCase(); // e.g., ro2_ending_1
            const idx = (endingId.match(/ending_(\w+)/) || [,''])[1];
            const code = idx ? `END-${idx}` : 'END';
            const name = ev.title || ev.name || `Ending ${idx || ''}`.trim();
            const txt = String(ev.avgId || '').toLowerCase(); // e.g., Obt/Roguelike/RO2/... -> lower
            if(txt){ items.push({ code, name, txt, sort: 100 + (parseInt(idx)||0) }); }
            // Also include the endbook's pages (clientEndbookItemDatas) when available
            const pages = ev.clientEndbookItemDatas || [];
            for(const page of pages){
              const endBookId = String(page.endBookId || '').toLowerCase();
              const mpage = endBookId.match(/endbook_rogue_\d+_(\d+)_(\d+)$/);
              const a = mpage ? Number(mpage[1]) : (parseInt(idx)||0);
              const b = mpage ? Number(mpage[2]) : (page.sortId||0);
              const pcode = `EB-${a}-${b}`;
              const pname = page.endbookName || `Endbook ${a}-${b}`;
              const ptxt = String(page.textId || '').toLowerCase(); // e.g., Obt/Rogue/rogue_4/Endbook/endbook_rogue_4_2_2
              if(ptxt){ items.push({ code: pcode, name: pname, txt: ptxt, sort: 200 + a*10 + b }); }
            }
          }
        } else if(details.endings){
          // ro1 or topics with explicit endings list including names
          for(const [k, v] of Object.entries(details.endings)){
            const endingId = String(v.id || k || '').toLowerCase(); // e.g., ro3_ending_1
            const idx = (endingId.match(/ending_(\w+)/) || [,''])[1];
            const code = idx ? `END-${idx}` : 'END';
            const name = v.name || `Ending ${idx || ''}`.trim();
            const txt = `obt/roguelike/ro${n}/level_rogue${n}_ending_${idx}`;
            items.push({ code, name, txt, sort: 100 + (parseInt(idx)||0) });
          }
        }
        // Also include endbook chapters split pages if desired later. For now, endings only.
        items.sort((a,b)=> a.sort - b.sort || a.code.localeCompare(b.code));
        if(items.length){
          const id = tid;
          chapters[id] = {
            id,
            name: t.name || id,
            items,
            category: 'rogue',
          };
          if(!chapterByCategory['rogue']) chapterByCategory['rogue'] = [];
          chapterByCategory['rogue'].push(id);
        }
      }
      // Do not sort rogue chapters; keep JSON order.
    }catch(err){
      console.warn('Failed to build rogue chapters:', err);
    }
  }

  function populateCategories(){
    if(!categorySelect) return;
    categorySelect.innerHTML = '';
    const present = CATEGORY_ORDER.filter(k => chapterByCategory[k] && chapterByCategory[k].length);
    for(const key of present){
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = CATEGORY_NAMES[key] || key;
      categorySelect.appendChild(opt);
    }
    if(present.length && !present.includes(categorySelect.value)){
      categorySelect.value = present[0];
    }
  }

  function populateChapters(preferredCategory){
    chapterSelect.innerHTML = '';
    const cat = preferredCategory || (categorySelect && categorySelect.value) || CATEGORY_ORDER.find(k=>chapterByCategory[k] && chapterByCategory[k].length) || null;
    if(categorySelect && cat && categorySelect.value !== cat){ categorySelect.value = cat; }
    const ids = cat && chapterByCategory[cat] ? chapterByCategory[cat] : Object.keys(chapters);
    for(const id of ids){
      const ch = chapters[id];
      const opt = document.createElement('option');
      opt.value = ch.id;
      opt.textContent = ch.name; // show proper name
      chapterSelect.appendChild(opt);
    }
  }

  function populateLevels(chapterId){
    const ch = chapters[chapterId];
    const items = ch ? ch.items : [];
    levelSelect.innerHTML = '';
    for(const it of items){
      const opt = document.createElement('option');
      opt.value = it.txt; // storyTxt relative path under gamedata/story
      const label = it.code ? `${it.code} - ${it.name}` : (it.name || it.txt);
      opt.textContent = label;
      levelSelect.appendChild(opt);
    }
  }

  // Prevent race conditions when switching levels quickly
  let currentLoadToken = 0;

  async function loadLevel(storyTxt){
    const myToken = ++currentLoadToken;
    setStatus('Loading level...');
    // Hard reset any in-flight scheduled ops first
    clearPendingEffects();
    if(backgroundController){ backgroundController.reset(); }
    if(audioController){ audioController.reset(); }
    if(characterController){ characterController.reset(); }
    // Also reset camera shake and grayscale effects immediately
    try{
      const els = [];
      if(backgroundController){
        if(backgroundController.bgLayer) els.push(backgroundController.bgLayer);
        if(backgroundController.bgTweenLayer) els.push(backgroundController.bgTweenLayer);
        if(backgroundController.imageLayer) els.push(backgroundController.imageLayer);
        if(backgroundController.imageLayer2) els.push(backgroundController.imageLayer2);
        if(backgroundController.tweenLayer) els.push(backgroundController.tweenLayer);
        if(backgroundController.curtainLayer) els.push(backgroundController.curtainLayer);
        if(backgroundController.blockerLayer) els.push(backgroundController.blockerLayer);
      }
      if(characterController && characterController.layer){ els.push(characterController.layer); }
      if(typeof cameraController?.reset === 'function'){ cameraController.reset(els); }
      if(typeof effectsController?.reset === 'function'){ effectsController.reset(els); }
    }catch{}
    try{
      const url = `${DATA_BASE}/gamedata/story/${storyTxt}.txt`;
      const res = await fetch(url, { cache: 'no-store' });
      if(!res.ok) throw new Error('Failed to load level file');
      const text = await res.text();
      // If a newer load started while we awaited, ignore this result
      if(myToken !== currentLoadToken) return;
      selections = {};
      dialogues = parseStructuredDialogues(text);
      view = computeVisible(dialogues, selections);
      index = 0;
      renderDialogues(view);
      lastRenderedViewIndex = -1;
      clearPendingEffects();
      updateCurrent();
      if(myToken === currentLoadToken) setStatus('');
    }catch(err){
      console.error(err);
      if(myToken === currentLoadToken) setStatus('Failed to load level');
      renderDialogues([]);
      if(backgroundController){ backgroundController.reset(); }
      if(audioController){ audioController.reset(); }
      if(characterController){ characterController.reset(); }
      try{
        const els = [];
        if(backgroundController){
          if(backgroundController.bgLayer) els.push(backgroundController.bgLayer);
          if(backgroundController.bgTweenLayer) els.push(backgroundController.bgTweenLayer);
          if(backgroundController.imageLayer) els.push(backgroundController.imageLayer);
          if(backgroundController.imageLayer2) els.push(backgroundController.imageLayer2);
          if(backgroundController.tweenLayer) els.push(backgroundController.tweenLayer);
          if(backgroundController.curtainLayer) els.push(backgroundController.curtainLayer);
          if(backgroundController.blockerLayer) els.push(backgroundController.blockerLayer);
        }
        if(characterController && characterController.layer){ els.push(characterController.layer); }
        if(typeof cameraController?.reset === 'function'){ cameraController.reset(els); }
        if(typeof effectsController?.reset === 'function'){ effectsController.reset(els); }
      }catch{}
    }
  }

  function isGuardSatisfied(guard, picks){
    if(!guard) return true;
    if(guardAllows){
      return guardAllows(guard, picks);
    }
    if(!picks) return false;
    const sel = picks[guard.decisionId];
    return !!sel && Array.isArray(guard.allow) && guard.allow.includes(sel);
  }

  function computeVisible(items, picks){
    const out = [];
    for(const it of items){
      if(it.type === 'decision'){
        out.push(it);
        continue;
      }
      if(it.type === 'line'){
        if(isGuardSatisfied(it.guard, picks)){
          out.push(it);
        }
      }
    }
    return out;
  }

  // Helper: detect CJK characters (used to suppress non-English title lines)
  function containsCJK(str){
    return /[\u3400-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(str);
  }

  // Render limited inline markup (<i>, <b>) safely
  function escapeHTML(str){
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  function normalizeTextForDisplay(text){
    // Convert literal escaped newlines ("\n", "\r\n") into real newlines
    // and strip any leading newlines so they don't render as visible markers or empty lines.
    let s = String(text);
    s = s.replace(/\r/g, '');
    s = s.replace(/\\r\\n|\\n|\\r/g, '\n');
    s = s.replace(/^\n+/, '');
    return s;
  }
  function sanitizeInlineColor(value){
    if(value == null) return null;
    let v = String(value).trim();
    if(!v) return null;
    // Strip wrapping quotes if present
    v = v.replace(/^['"]+|['"]+$/g, '');
    if(!v) return null;
    if(/^#?[0-9a-f]{3,8}$/i.test(v)){
      return v.startsWith('#') ? v : `#${v}`;
    }
    if(/^[a-z]+$/i.test(v)){
      return v.toLowerCase();
    }
    return null;
  }
  function renderRichText(el, text){
    const norm = normalizeTextForDisplay(text);
    const esc = escapeHTML(norm);
    // Allow only a safe subset of tags
    const html = esc
      .replace(/&lt;i&gt;/gi, '<i>')
      .replace(/&lt;\/i&gt;/gi, '</i>')
      .replace(/&lt;b&gt;/gi, '<b>')
      .replace(/&lt;\/b&gt;/gi, '</b>')
      .replace(/&lt;color\s*=\s*([^&]*)&gt;/gi, (match, value) => {
        const color = sanitizeInlineColor(value);
        return color ? `<span style="color:${color}">` : '<span>';
      })
      .replace(/&lt;\/color&gt;/gi, '</span>')
      .replace(/\r?\n/g, '<br>');
    el.innerHTML = html;
  }

  // Parse dialogues with branching (Decision/Predicate) and subtitles
  function parseStructuredDialogues(text){
    const lines = text.split(/\r?\n/);
    const out = [];
    const nameLineRe = /^\[name="([^"]*)"\](.*)$/i;
    const subtitleRe = /^\[subtitle\((.*)\)\]/i;
    const namedTagRe = /^\[[a-z]+\(([^)]*)\)\](.*)$/i;
    const textInTagRe = /^\[(subtitle|sticker)\(([^)]*)\)\]/i;
    const decisionRe = /^\[decision\b/i;
    const predicateRe = /^\[predicate\b/i;
    const delayRe = /^\[delay\b/i;
    const extractParams = (line) => {
      const start = line.indexOf('(');
      const end = line.lastIndexOf(')');
      if(start >= 0 && end > start){ return line.slice(start + 1, end); }
      return '';
    };
    let lastDecisionId = 0;
    let activeGuard = null; // { decisionId, allow: [] }
    for(const rawLine of lines){
      const raw = (rawLine || '').replace(/\uFEFF/g, '');
      // Decision nodes
      if(decisionRe.test(raw)){
        const params = extractParams(raw);
        const opts = (params.match(/options\s*=\s*"([^"]*)"/i) || [,''])[1];
        const vals = (params.match(/values\s*=\s*"([^"]*)"/i) || [,''])[1];
        const options = (opts ? opts.split(';') : []).map(s=>s.trim()).filter(Boolean);
        const values = (vals ? vals.split(';') : []).map(s=>s.trim()).filter(Boolean);
        const list = [];
        for(let i=0;i<Math.max(options.length, values.length);i++){
          const label = options[i] != null ? options[i] : String(values[i]||'');
          const value = values[i] != null ? values[i] : String(i+1);
          list.push({ label, value });
        }
        lastDecisionId += 1;
        activeGuard = null;
        out.push({ type: 'decision', id: lastDecisionId, options: list });
        continue;
      }
      // Predicate guards
      if(predicateRe.test(raw)){
        const params = extractParams(raw);
        const refs = (params.match(/references\s*=\s*"([^"]*)"/i) || [,''])[1];
        const allow = (refs ? refs.split(';') : []).map(s=>s.trim()).filter(Boolean);
        activeGuard = { decisionId: lastDecisionId, allow };
        continue;
      }
      // Delay directive
      if(delayRe.test(raw)){
        const params = extractParams(raw);
        const t1 = (params.match(/\btime\s*=\s*([0-9]*\.?[0-9]+)/i) || [,''])[1];
        const t2 = (params.match(/\btime\s*=\s*\"([^\"]*)\"/i) || [,''])[1];
        const val = t1 || t2 || '';
        const time = parseFloat(val);
        out.push({ type: 'delay', time: Number.isFinite(time) ? time : 0, guard: activeGuard ? { decisionId: activeGuard.decisionId, allow: [...activeGuard.allow] } : null });
        continue;
      }
      if(parseCharacterTag){
        const charEntry = parseCharacterTag(raw, activeGuard);
        if(charEntry){
          out.push(charEntry);
          continue;
        }
      }
      if(parseCharSlotTag){
        const slotEntry = parseCharSlotTag(raw, activeGuard);
        if(slotEntry){
          out.push(slotEntry);
          continue;
        }
      }
      if(parseDialogTag){
        const dlgEntry = parseDialogTag(raw, activeGuard);
        if(dlgEntry){
          out.push(dlgEntry);
          continue;
        }
      }
      if(parseStopMusic){
        const stopEntry = parseStopMusic(raw, activeGuard);
        if(stopEntry){
          out.push(stopEntry);
          continue;
        }
      }
      if(parsePlayMusic){
        const musicEntry = parsePlayMusic(raw, activeGuard);
        if(musicEntry){
          out.push(musicEntry);
          continue;
        }
      }
      if(parseImageTag){
        const imgEntry = parseImageTag(raw, activeGuard);
        if(imgEntry){
          out.push(imgEntry);
          continue;
        }
      }
      if(parseBlockerTag){
        const blkEntry = parseBlockerTag(raw, activeGuard);
        if(blkEntry){
          out.push(blkEntry);
          continue;
        }
      }
      if(parseCurtainTag){
        const curEntry = parseCurtainTag(raw, activeGuard);
        if(curEntry){
          out.push(curEntry);
          continue;
        }
      }
      if(parseCameraShake){
        const camEntry = parseCameraShake(raw, activeGuard);
        if(camEntry){
          out.push(camEntry);
          continue;
        }
      }
      if(parseCameraEffect){
        const effEntry = parseCameraEffect(raw, activeGuard);
        if(effEntry){
          out.push(effEntry);
          continue;
        }
      }
      if(parsePlaySound){
        const sfxEntry = parsePlaySound(raw, activeGuard);
        if(sfxEntry){
          out.push(sfxEntry);
          continue;
        }
      }
      // Named or empty-name dialogue lines
      let m = nameLineRe.exec(raw);
      if(m){
        const name = (m[1]||'').trim();
        const body = (m[2]||'').trim();
        if(body.length && !containsCJK(body)){
          out.push({ type: 'line', name, text: body, guard: activeGuard ? { decisionId: activeGuard.decisionId, allow: [...activeGuard.allow] } : null });
        }
        continue;
      }
      // Subtitle blocks with explicit text param
      let s = subtitleRe.exec(raw);
      if(s){
        const params = s[1] || '';
        const tm = params.match(/\btext\s*=\s*"([^"]*)"/i);
        if(tm && tm[1]){
          const body = tm[1].trim();
          if(body.length && !containsCJK(body)){
            out.push({ type: 'line', name: '', text: body, guard: activeGuard ? { decisionId: activeGuard.decisionId, allow: [...activeGuard.allow] } : null });
          }
        }
        continue;
      }
      // Sticker/Subtitle-like tags with text payload
      m = textInTagRe.exec(raw);
      if(m){
        const params = m[2] || '';
        const tm2 = params.match(/\btext\s*=\s*"([^"]*)"/i);
        if(tm2 && tm2[1]){
          const body = tm2[1].trim();
          if(body.length && !containsCJK(body)){
            out.push({ type: 'line', name: '', text: body, guard: activeGuard ? { decisionId: activeGuard.decisionId, allow: [...activeGuard.allow] } : null });
          }
        }
        continue;
      }
      // Other named tags with inline text, e.g., [multiline(name="X")]Hello
      m = namedTagRe.exec(raw);
      if(m){
        const params = m[1] || '';
        const body = (m[2]||'').trim();
        const nm = (params.match(/\bname\s*=\s*"([^"]*)"/i) || [,''])[1].trim();
        if(body.length && !containsCJK(body)){
          out.push({ type: 'line', name: nm, text: body, guard: activeGuard ? { decisionId: activeGuard.decisionId, allow: [...activeGuard.allow] } : null });
        }
        continue;
      }
      // Bare narration lines (non-empty and not a control tag)
      if(raw.trim().length && raw.trim()[0] !== '['){
        const body = raw.trim();
        if(!containsCJK(body)){
          out.push({ type: 'line', name: '', text: body, guard: activeGuard ? { decisionId: activeGuard.decisionId, allow: [...activeGuard.allow] } : null });
        }
        continue;
      }
      // ignore other control lines
    }
    return out;
  }

  function clearPendingEffects(){
    if(Array.isArray(pendingEffectTimers)){
      for(const id of pendingEffectTimers){ try{ clearTimeout(id); }catch{} }
    }
    pendingEffectTimers = [];
  }

  // Build a sequential plan of control effects between two visible items.
  // Returns { totalMs, hideMs, blockRender, shouldHideUI, ops: [ { atMs, type, entry } ] }
  function planTransition(prevVisibleItem, nextVisibleItem){
    const plan = { totalMs: 0, hideMs: 0, blockRender: false, shouldHideUI: false, ops: [] };
    if(!nextVisibleItem) return plan;
    const endPos = dialogues ? dialogues.indexOf(nextVisibleItem) : -1;
    const startPos = prevVisibleItem && dialogues ? dialogues.indexOf(prevVisibleItem) : -1;
    if(endPos < 0) return plan;
    let t = 0;
    for(let i = startPos + 1; i <= endPos; i++){
      const it = dialogues[i];
      if(!it) continue;
      if(it.guard && !isGuardSatisfied(it.guard, selections)) continue;
      // Do not schedule per-[Character]/[charslot] ops here.
      // Character state is resolved and applied once when rendering the next visible item
      // so multiple consecutive [charslot] directives appear together.
      if(it.type === 'character' || it.type === 'charslot'){
        // Skip scheduling; handled by renderCurrentCore via characterController.applyFor
        continue;
      }
      if(it.type === 'sound'){
        // One-shot SFX do not affect timing; schedule to fire at the moment
        plan.ops.push({ atMs: t, type: 'sound', entry: it });
        continue;
      }
      if(it.type === 'camerashake'){
        plan.ops.push({ atMs: t, type: 'camerashake', entry: it });
        continue;
      }
      if(it.type === 'cameraeffect'){
        plan.ops.push({ atMs: t, type: 'cameraeffect', entry: it });
        const ft = Number(it.fadeTime||0) || 0;
        const gate = !!(it.block && !it.keep);
        if(ft > 0 && gate){
          const ms = Math.round(ft * 1000);
          plan.totalMs += ms;
          plan.hideMs += ms;
          plan.shouldHideUI = true;
          t += ms;
        }
        continue;
      }
      if(it.type === 'audio'){
        plan.ops.push({ atMs: t, type: 'audio', entry: it });
      } else if(it.type === 'image'){
        plan.ops.push({ atMs: t, type: 'image', entry: it });
        const ft = Number(it.fadeTime||0) || 0;
        if(ft > 0){
          const ms = Math.round(ft * 1000);
          plan.totalMs += ms;
          if(it.block){ plan.hideMs += ms; plan.shouldHideUI = true; }
          t += ms;
        } else {
          // If UI is currently hidden by a blocker/delay and the image has no fade,
          // keep the screen hidden a brief moment to mask late paints/loads
          if(plan.shouldHideUI){
            const buffer = 250; // ms
            plan.totalMs += buffer;
            plan.hideMs += buffer;
            t += buffer;
          }
        }
      } else if(it.type === 'blocker'){
        plan.ops.push({ atMs: t, type: 'blocker', entry: it });
        const ft = Number(it.fadeTime||0) || 0;
        if(ft > 0){
          const ms = Math.round(ft * 1000);
          plan.totalMs += ms;
          plan.hideMs += (it.block ? ms : 0);
          plan.blockRender = plan.blockRender || !!it.block;
          t += ms;
        }
        if(it.block) plan.shouldHideUI = true;
      } else if(it.type === 'curtain'){
        plan.ops.push({ atMs: t, type: 'curtain', entry: it });
        const ft = Number(it.fadeTime||0) || 0;
        if(ft > 0){
          const ms = Math.round(ft * 1000);
          // Run concurrent with other curtains: do not advance t; use max windows
          plan.totalMs = Math.max(plan.totalMs, ms);
          if(it.block){ plan.hideMs = Math.max(plan.hideMs, ms); plan.shouldHideUI = true; }
        }
      } else if(it.type === 'delay'){
        const secs = Number(it.time||0) || 0;
        if(secs > 0){
          const ms = Math.round(secs * 1000);
          plan.totalMs += ms;
          plan.hideMs += ms; // delays always hide UI
          plan.blockRender = true; // delays gate rendering
          plan.shouldHideUI = true;
          t += ms;
        }
      }
    }
    return plan;
  }

  // Compute delay in seconds for transition between two visible items
  function getDelaySecondsForTransition(prevVisibleItem, nextVisibleItem){
    if(!nextVisibleItem) return 0;
    const endPos = dialogues ? dialogues.indexOf(nextVisibleItem) : -1;
    const startPos = prevVisibleItem && dialogues ? dialogues.indexOf(prevVisibleItem) : -1;
    if(endPos < 0) return 0;
    let foundDelay = null;
    for(let i = startPos + 1; i <= endPos; i++){
      const it = dialogues[i];
      if(!it || it.type !== 'delay') continue;
      if(!it.guard || isGuardSatisfied(it.guard, selections)){
        foundDelay = it; // last wins
      }
    }
    const secs = foundDelay && Number.isFinite(Number(foundDelay.time)) ? Number(foundDelay.time) : 0;
    return secs > 0 ? secs : 0;
  }

  // Compute generic fade gating between two visible items (e.g., Blocker, Image, Audio)
  function getFadeInfoForTransition(prevVisibleItem, nextVisibleItem){
    const out = { secs: 0, blocker: null, image: null, audio: null, shouldHide: false };
    if(!nextVisibleItem) return out;
    const endPos = dialogues ? dialogues.indexOf(nextVisibleItem) : -1;
    const startPos = prevVisibleItem && dialogues ? dialogues.indexOf(prevVisibleItem) : -1;
    if(endPos < 0) return out;
    let maxFade = 0;
    for(let i = startPos + 1; i <= endPos; i++){
      const it = dialogues[i];
      if(!it) continue;
      if(it.guard && !isGuardSatisfied(it.guard, selections)) continue;
      const f = Number.isFinite(Number(it.fadeTime)) ? Number(it.fadeTime) : 0;
      if(f > 0){ maxFade = Math.max(maxFade, f); }
      if(it.type === 'blocker'){ out.blocker = it; if(it.block) out.shouldHide = true; }
      if(it.type === 'image'){ out.image = it; if(it.block) out.shouldHide = true; }
      if(it.type === 'audio'){ out.audio = it; }
    }
    out.secs = maxFade;
    return out;
  }

  // Find the last blocker between two visible items and its fade seconds
  function getBlockerInfoForTransition(prevVisibleItem, nextVisibleItem){
    const out = { entry: null, secs: 0 };
    if(!nextVisibleItem) return out;
    const endPos = dialogues ? dialogues.indexOf(nextVisibleItem) : -1;
    const startPos = prevVisibleItem && dialogues ? dialogues.indexOf(prevVisibleItem) : -1;
    if(endPos < 0) return out;
    for(let i = startPos + 1; i <= endPos; i++){
      const it = dialogues[i];
      if(!it || it.type !== 'blocker') continue;
      if(!it.guard || isGuardSatisfied(it.guard, selections)){
        out.entry = it; // last wins
      }
    }
    const fade = out.entry && Number.isFinite(Number(out.entry.fadeTime)) ? Number(out.entry.fadeTime) : 0;
    out.secs = fade > 0 ? fade : 0;
    return out;
  }

  function parseDialogues(text){
    const lines = text.split(/\r?\n/);
    const out = [];
    const re = /^\[name=\"([^\"]*)\"\](.*)$/i; // name can be empty => subtitles
    const subtitleRe = /^\[subtitle\((.*)\)\]/i; // [Subtitle(text="...")]
    const namedTagRe = /^\[[a-z]+\(([^\)]*)\)\](.*)$/i; // [multiline(name="...")]Text
    const textInTagRe = /^\[(subtitle|sticker)\(([^\)]*)\)\]/i; // [Sticker(..., text="...")]
    for(const rawLine of lines){
      const raw = rawLine || '';
      // Named or empty-name dialogue lines
      const m = re.exec(raw);
      if(m){
        const name = (m[1]||'').trim();
        const body = (m[2]||'').trim();
        if(body.length && !containsCJK(body)){ out.push({ name, text: body }); }
        continue;
      }
      // Subtitle blocks with explicit text param
      const s = subtitleRe.exec(raw);
      if(s){
        const params = s[1] || '';
        const tm = params.match(/text\s*=\s*\"([^\"]*)\"/i);
        if(tm && tm[1]){
          const body = tm[1].trim();
          if(body.length && !containsCJK(body)){ out.push({ name: '', text: body }); }
        }
        continue;
      }
      // Sticker/Subtitle-like tags with text payload
      const t = textInTagRe.exec(raw);
      if(t){
        const params = t[2] || '';
        const tm2 = params.match(/\btext\s*=\s*\"([^\"]*)\"/i);
        if(tm2 && tm2[1]){
          const body = tm2[1].trim();
          if(body.length && !containsCJK(body)){ out.push({ name: '', text: body }); }
        }
        continue;
      }
      // Other named tags with inline text, e.g., [multiline(name="X")]Hello
      const nt = namedTagRe.exec(raw);
      if(nt){
        const params = nt[1] || '';
        const body = (nt[2]||'').trim();
        const nm = (params.match(/\bname\s*=\s*\"([^\"]*)\"/i) || [,''])[1].trim();
        if(body.length && !containsCJK(body)){ out.push({ name: nm, text: body }); }
        continue;
      }
      // Bare narration lines (non-empty and not a control tag)
      if(raw.trim().length && raw.trim()[0] !== '['){
        const body = raw.trim();
        if(!containsCJK(body)){
          out.push({ name: '', text: body });
        }
        continue;
      }
      // ignore other control lines
    }
    return out;
  }

  function buildLogFragment(list, opts = {}){
    const { includeIndex = false } = opts;
    const frag = document.createDocumentFragment();
    if(!list || !list.length){
      const p = document.createElement('p');
      p.textContent = 'No dialogue lines found in this level.';
      frag.appendChild(p);
      return frag;
    }
    for(let i=0;i<list.length;i++){
      const item = list[i];
      if(!item) continue;
      const div = document.createElement('div');
      let className = 'line';
      if(item.type==='decision'){
        className += ' decision';
      } else if(item.type==='image'){
        className += ' image-change';
      } else if(item.type==='audio'){
        className += ' audio-change';
      }
      div.className = className;
      if(includeIndex){ div.dataset.idx = String(i); }
      if(item.type==='image'){
        const text = document.createElement('span');
        text.className = 'text muted';
        const kind = item.tag === 'background' ? 'Background' : 'Image';
        let label = item.image ? `${kind} -> ${item.image}` : `${kind} cleared`;
        if(item.tiled){ label += ' (tiled)'; }
        if(Number.isFinite(item.width) || Number.isFinite(item.height)){
          const w = Number.isFinite(item.width) ? item.width : '?';
          const h = Number.isFinite(item.height) ? item.height : '?';
          label += ` [${w}x${h}]`;
        }
        text.textContent = label;
        div.appendChild(text);
        frag.appendChild(div);
        continue;
      }
      if(item.type==='blocker'){
        const text = document.createElement('span');
        text.className = 'text muted';
        const f = item.from || {}; const t = item.to || {};
        const fade = Number(item.fadeTime) || 0;
        let label = `Blocker ${f.r||0},${f.g||0},${f.b||0},${f.a||0} -> ${t.r||255},${t.g||255},${t.b||255},${t.a||1}`;
        if(fade>0){ label += ` (fade ${fade}s)`; }
        text.textContent = label;
        div.appendChild(text);
        frag.appendChild(div);
        continue;
      }
      if(item.type==='audio'){
        const text = document.createElement('span');
        text.className = 'text muted';
        let label;
        if(item.action === 'stop'){
          label = 'Music stop';
          if(Number.isFinite(item.fadeTime) && item.fadeTime > 0){
            label += ` (fade ${item.fadeTime}s)`;
          }
        } else {
          const parts = [];
          if(item.intro){ parts.push(`intro ${item.intro}`); }
          if(item.key){ parts.push(`loop ${item.key}`); }
          label = 'Music -> ' + (parts.length ? parts.join(', ') : 'unknown');
          if(Number.isFinite(item.volume)){ label += ` [vol ${item.volume}]`; }
          if(Number.isFinite(item.delay) && item.delay > 0){ label += ` [delay ${item.delay}s]`; }
          if(Number.isFinite(item.crossfade) && item.crossfade > 0){ label += ` [fade-in ${item.crossfade}s]`; }
        }
        text.textContent = label;
        div.appendChild(text);
        frag.appendChild(div);
        continue;
      }
      if(item.type==='charslot'){
        const text = document.createElement('span');
        text.className = 'text muted';
        const slotMap = { left: 'Left', right: 'Right', center: 'Center', l: 'Left', r: 'Right', m: 'Center' };
        let label = '';
        const hasTarget = !!(item.slot || item.name);
        if(!hasTarget){
          label = 'Sprites cleared';
          const dur = (Number(item.duration) || Number(item.fadeTime));
          if(Number.isFinite(dur) && dur > 0){ label += ` (fade ${dur}s)`; }
        } else {
          const side = slotMap[item.slot] || (item.slot || '');
          label = `Sprite -> ${side || '?'}: ${item.name || ''}`.trim();
          const parts = [];
          const dur = (Number(item.duration) || Number(item.fadeTime));
          if(Number.isFinite(dur) && dur > 0){ parts.push(`fade ${dur}s`); }
          if(item.focus){ parts.push(`focus=${item.focus}`); }
          if(parts.length){ label += ' [' + parts.join(', ') + ']'; }
        }
        text.textContent = label;
        div.appendChild(text);
        frag.appendChild(div);
        continue;
      }
      if(item.type==='character'){
        const text = document.createElement('span');
        text.className = 'text muted';
        const parts = [];
        if(item.name){ parts.push(`Left: ${item.name}`); }
        if(item.name3){ parts.push(`Center: ${item.name3}`); }
        if(item.name2){ parts.push(`Right: ${item.name2}`); }
        if(!parts.length){ parts.push('Characters cleared'); }
        if(Number.isFinite(item.focus)){ parts.push(`focus=${item.focus}`); }
        text.textContent = parts.join(' | ');
        div.appendChild(text);
        frag.appendChild(div);
        continue;
      }
      if(item.type==='line' && item.name){
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = item.name + ':';
        div.appendChild(name);
      }
      if(item.type==='line'){
        const text = document.createElement('span');
        text.className = 'text';
        renderRichText(text, item.text);
        div.appendChild(text);
      } else if(item.type==='decision'){
        const text = document.createElement('span');
        const labels = (item.options||[]).map(o=>o.label).join(' / ');
        const chosen = selections[item.id];
        text.textContent = 'Choices: ' + labels + (chosen? ` (selected: ${(item.options.find(o=>o.value===chosen)||{}).label||chosen})` : '');
        div.appendChild(text);
      }
      frag.appendChild(div);
    }
    return frag;
  }
  function renderDialogues(list){
    // Keep generating hidden list for potential debugging; not displayed inline
    listEl.innerHTML = '';
    listEl.appendChild(buildLogFragment(list));
    currentEl.hidden = !list || !list.length;
  }

  function renderCurrentCore(){
    if(!view.length){
      cancelTextReveal();
      currentEl.hidden = true;
      progressEl.textContent = '';
      if(backgroundController){ backgroundController.reset(); }
      if(audioController){ audioController.reset(); }
      if(characterController){ characterController.reset(); }
      return;
    }
    currentEl.hidden = false;
    const item = view[index];
    if(!item){
      cancelTextReveal();
      if(backgroundController){ backgroundController.reset(); }
      if(audioController){ audioController.reset(); }
      if(characterController){ characterController.reset(); }
      return;
    }
    if(backgroundController){ backgroundController.applyFor(dialogues, selections, item); }
    if(audioController){ audioController.applyFor(dialogues, selections, item); }
    if(characterController){ characterController.applyFor(dialogues, selections, item); }
    // reset choices area
    if(choicesEl){ choicesEl.innerHTML = ''; choicesEl.style.display = 'none'; }
    if(item.type==='line' && item.name){
      currentNameEl.style.display = '';
      currentNameEl.textContent = item.name;
    } else {
      currentNameEl.textContent = '';
      currentNameEl.style.display = 'none'; // hide for subtitles
    }
    if(item.type==='line'){
      cancelTextReveal();
      renderRichText(currentTextEl, item.text);
      // Start per-character reveal at constant speed (prevents parallel wrapped lines)
      try { startTextReveal(currentTextEl, { cps: 28 }); } catch {}
      prevBtn.disabled = index === 0;
      nextBtn.disabled = index >= view.length - 1;
    } else if(item.type==='decision'){
      cancelTextReveal();
      currentTextEl.textContent = 'Choose a response:';
      if(choicesEl){
        choicesEl.style.display = 'flex';
        for(const opt of item.options){
          const b = document.createElement('button');
          b.textContent = opt.label;
          b.addEventListener('click', ()=>{
            selections[item.id] = opt.value;
            view = computeVisible(dialogues, selections);
            const pos = view.findIndex(x=>x.type==='decision' && x.id===item.id);
            index = Math.min(pos+1, view.length-1);
            renderDialogues(view);
            updateCurrent();
          });
          choicesEl.appendChild(b);
        }
      }
      prevBtn.disabled = index === 0;
      nextBtn.disabled = !selections[item.id];
    }
    progressEl.textContent = ` ${index+1} / ${view.length}`;
    // Reflect current line in the log if it's open
    highlightLogCurrent();
    lastRenderedViewIndex = index;
  }

  function setHiddenDuringDelay(hidden){
    try {
      const nameEl = currentEl ? currentEl.querySelector('.name') : null;
      const dialogEl = currentEl ? currentEl.querySelector('.dialog') : null;
      if(document && document.body){
        if(hidden){ document.body.dataset.uiDelay = '1'; } else { try{ delete document.body.dataset.uiDelay; }catch{} }
      }
      // Use opacity (non-inherited) to ensure children can't force themselves visible
      if(nameEl){
        nameEl.style.visibility = hidden ? 'hidden' : '';
        nameEl.style.opacity = hidden ? '0' : '';
        nameEl.style.pointerEvents = hidden ? 'none' : '';
      }
      if(dialogEl){
        dialogEl.style.visibility = hidden ? 'hidden' : '';
        dialogEl.style.opacity = hidden ? '0' : '';
        dialogEl.style.pointerEvents = hidden ? 'none' : '';
      }
      if(controlsEl){
        controlsEl.style.visibility = hidden ? 'hidden' : '';
        controlsEl.style.opacity = hidden ? '0' : '';
        controlsEl.style.pointerEvents = hidden ? 'none' : '';
      }
    } catch {}
  }

  function updateCurrent(){
    if(isDelaying){ return; }
    const prevItem = (lastRenderedViewIndex >= 0 && lastRenderedViewIndex < view.length) ? view[lastRenderedViewIndex] : null;
    const nextItem = (index >= 0 && index < view.length) ? view[index] : null;
    const goingForward = lastRenderedViewIndex < index;
    const plan = goingForward ? planTransition(prevItem, nextItem) : { totalMs: 0, hideMs: 0, blockRender: false, shouldHideUI: false, ops: [] };
    const waitMs = Math.max(0, plan.totalMs);
    const hideMs = Math.max(0, plan.hideMs || 0);
    const shouldBlock = waitMs > 0 && plan.blockRender;
    if(shouldBlock){
      // Blocking timeline (e.g., [Delay]): schedule ops and gate UI/navigation until finished
      isDelaying = true;
      if(delayTimerId){ try{ clearTimeout(delayTimerId); }catch{} delayTimerId = null; }
      clearPendingEffects();
      for(const op of plan.ops){
        if(op.type === 'blocker' && backgroundController && typeof backgroundController.applyBlocker === 'function'){
          pendingEffectTimers.push(setTimeout(()=>{ try{ backgroundController.applyBlocker(op.entry); }catch{} }, op.atMs));
        } else if(op.type === 'image' && backgroundController && typeof backgroundController.apply === 'function'){
          pendingEffectTimers.push(setTimeout(()=>{ try{ backgroundController.apply(op.entry); if(characterController && typeof characterController.applyFor === 'function'){ characterController.applyFor(dialogues, selections, op.entry); } }catch{} }, op.atMs));
        } else if(op.type === 'curtain' && backgroundController && typeof backgroundController.applyCurtain === 'function'){
          pendingEffectTimers.push(setTimeout(()=>{ try{ backgroundController.applyCurtain(op.entry); }catch{} }, op.atMs));
        } else if(op.type === 'audio' && audioController && typeof audioController.apply === 'function'){
          pendingEffectTimers.push(setTimeout(()=>{ try{ audioController.apply(op.entry); }catch{} }, op.atMs));
        } else if(op.type === 'sound' && audioController && typeof audioController.playSound === 'function'){
          pendingEffectTimers.push(setTimeout(()=>{ try{ audioController.playSound(op.entry); }catch{} }, op.atMs));
        } else if(op.type === 'character' && characterController && typeof characterController.applyFor === 'function'){
          // Apply character changes relative to their own entry in the dialogue list
          pendingEffectTimers.push(setTimeout(()=>{ try{ characterController.applyFor(dialogues, selections, op.entry); }catch{} }, op.atMs));
        } else if(op.type === 'camerashake' && cameraController){
          const els = [];
          try{
            if(backgroundController){
              if(backgroundController.bgLayer) els.push(backgroundController.bgLayer);
              if(backgroundController.bgTweenLayer) els.push(backgroundController.bgTweenLayer);
              if(backgroundController.imageLayer) els.push(backgroundController.imageLayer);
              if(backgroundController.imageLayer2) els.push(backgroundController.imageLayer2);
              if(backgroundController.tweenLayer) els.push(backgroundController.tweenLayer);
              if(backgroundController.curtainLayer) els.push(backgroundController.curtainLayer);
              if(backgroundController.blockerLayer) els.push(backgroundController.blockerLayer);
            }
            if(characterController && characterController.layer){ els.push(characterController.layer); }
          }catch{}
          pendingEffectTimers.push(setTimeout(()=>{ try{ cameraController.shake(op.entry, els); }catch{} }, op.atMs));
        } else if(op.type === 'cameraeffect' && effectsController){
          const els = [];
          try{
            if(backgroundController){
              if(backgroundController.bgLayer) els.push(backgroundController.bgLayer);
              if(backgroundController.bgTweenLayer) els.push(backgroundController.bgTweenLayer);
              if(backgroundController.imageLayer) els.push(backgroundController.imageLayer);
              if(backgroundController.imageLayer2) els.push(backgroundController.imageLayer2);
              if(backgroundController.tweenLayer) els.push(backgroundController.tweenLayer);
              if(backgroundController.curtainLayer) els.push(backgroundController.curtainLayer);
              if(backgroundController.blockerLayer) els.push(backgroundController.blockerLayer);
            }
            if(characterController && characterController.layer){ els.push(characterController.layer); }
          }catch{}
          pendingEffectTimers.push(setTimeout(()=>{ try{ effectsController.apply(op.entry, els); }catch{} }, op.atMs));
        }
      }
      setHiddenDuringDelay(plan.shouldHideUI);
      // Unhide UI earlier only for non-blocking plans (not for Delay)
      if(!plan.blockRender && hideMs > 0 && hideMs < waitMs){
        pendingEffectTimers.push(setTimeout(()=>{ try{ setHiddenDuringDelay(false); }catch{} }, hideMs));
      }
      delayTimerId = setTimeout(()=>{
        isDelaying = false;
        setHiddenDuringDelay(false);
        clearPendingEffects();
        renderCurrentCore();
      }, waitMs);
      return;
    } else if(waitMs > 0){
      // Non-blocking timeline: schedule ops but do not gate navigation
      for(const op of plan.ops){
        if(op.type === 'blocker' && backgroundController && typeof backgroundController.applyBlocker === 'function'){
          pendingEffectTimers.push(setTimeout(()=>{ try{ backgroundController.applyBlocker(op.entry); }catch{} }, op.atMs));
        } else if(op.type === 'image' && backgroundController && typeof backgroundController.apply === 'function'){
          pendingEffectTimers.push(setTimeout(()=>{ try{ backgroundController.apply(op.entry); if(characterController && typeof characterController.applyFor === 'function'){ characterController.applyFor(dialogues, selections, op.entry); } }catch{} }, op.atMs));
        } else if(op.type === 'audio' && audioController && typeof audioController.apply === 'function'){
          pendingEffectTimers.push(setTimeout(()=>{ try{ audioController.apply(op.entry); }catch{} }, op.atMs));
        } else if(op.type === 'sound' && audioController && typeof audioController.playSound === 'function'){
          pendingEffectTimers.push(setTimeout(()=>{ try{ audioController.playSound(op.entry); }catch{} }, op.atMs));
        } else if(op.type === 'character' && characterController && typeof characterController.applyFor === 'function'){
          // Apply character changes relative to their own entry in the dialogue list
          pendingEffectTimers.push(setTimeout(()=>{ try{ characterController.applyFor(dialogues, selections, op.entry); }catch{} }, op.atMs));
        } else if(op.type === 'camerashake' && cameraController){
          const els = [];
          try{
            if(backgroundController){
              if(backgroundController.bgLayer) els.push(backgroundController.bgLayer);
              if(backgroundController.bgTweenLayer) els.push(backgroundController.bgTweenLayer);
              if(backgroundController.imageLayer) els.push(backgroundController.imageLayer);
              if(backgroundController.imageLayer2) els.push(backgroundController.imageLayer2);
              if(backgroundController.tweenLayer) els.push(backgroundController.tweenLayer);
              if(backgroundController.blockerLayer) els.push(backgroundController.blockerLayer);
            }
            if(characterController && characterController.layer){ els.push(characterController.layer); }
          }catch{}
          pendingEffectTimers.push(setTimeout(()=>{ try{ cameraController.shake(op.entry, els); }catch{} }, op.atMs));
        }
      }
      // Temporarily hide UI only for hideMs (e.g., Image/Blocker with block=true)
      if(hideMs > 0){
        setHiddenDuringDelay(plan.shouldHideUI);
        pendingEffectTimers.push(setTimeout(()=>{ try{ setHiddenDuringDelay(false); }catch{} }, hideMs));
      }
      // Immediately render next line; leave timers running
      renderCurrentCore();
      return;
    }
    // Zero-duration transition: execute inline ops immediately
    if(plan.ops && plan.ops.length){
      for(const op of plan.ops){
        try {
          if(op.type === 'blocker' && backgroundController && typeof backgroundController.applyBlocker === 'function'){
            backgroundController.applyBlocker(op.entry);
          } else if(op.type === 'image' && backgroundController && typeof backgroundController.apply === 'function'){
            backgroundController.apply(op.entry);
            try{ if(characterController && typeof characterController.applyFor === 'function'){ characterController.applyFor(dialogues, selections, op.entry); } }catch{}
          } else if(op.type === 'curtain' && backgroundController && typeof backgroundController.applyCurtain === 'function'){
            backgroundController.applyCurtain(op.entry);
          } else if(op.type === 'audio' && audioController && typeof audioController.apply === 'function'){
            audioController.apply(op.entry);
          } else if(op.type === 'sound' && audioController && typeof audioController.playSound === 'function'){
            audioController.playSound(op.entry);
          } else if(op.type === 'character' && characterController && typeof characterController.applyFor === 'function'){
            characterController.applyFor(dialogues, selections, op.entry);
          } else if(op.type === 'camerashake' && cameraController){
            const els = [];
            try{
              if(backgroundController){
                if(backgroundController.bgLayer) els.push(backgroundController.bgLayer);
                if(backgroundController.imageLayer) els.push(backgroundController.imageLayer);
                if(backgroundController.imageLayer2) els.push(backgroundController.imageLayer2);
                if(backgroundController.tweenLayer) els.push(backgroundController.tweenLayer);
                if(backgroundController.blockerLayer) els.push(backgroundController.blockerLayer);
              }
              if(characterController && characterController.layer){ els.push(characterController.layer); }
            }catch{}
            cameraController.shake(op.entry, els);
          } else if(op.type === 'cameraeffect' && effectsController){
            const els = [];
            try{
              if(backgroundController){
                if(backgroundController.bgLayer) els.push(backgroundController.bgLayer);
                if(backgroundController.bgTweenLayer) els.push(backgroundController.bgTweenLayer);
                if(backgroundController.imageLayer) els.push(backgroundController.imageLayer);
                if(backgroundController.imageLayer2) els.push(backgroundController.imageLayer2);
                if(backgroundController.tweenLayer) els.push(backgroundController.tweenLayer);
                if(backgroundController.blockerLayer) els.push(backgroundController.blockerLayer);
              }
              if(characterController && characterController.layer){ els.push(characterController.layer); }
            }catch{}
            effectsController.apply(op.entry, els);
          }
        } catch {}
      }
    }
    renderCurrentCore();
  }

  function applyRouteFromHash(){
    const route = parseHash();
    const chapterId = route.chapter && chapters[route.chapter] ? route.chapter : null;
    if(!chapterId){
      return; // wait for init to set default
    }
    // ensure category matches the selected chapter
    const ch = chapters[chapterId];
    if(ch && categorySelect && ch.category && categorySelect.value !== ch.category){
      categorySelect.value = ch.category;
      populateChapters(ch.category);
    }
    // set chapter select
    if(chapterSelect.value !== chapterId){
      chapterSelect.value = chapterId;
    }
    populateLevels(chapterId);
    // choose level
    const levelTxt = route.level && ch.items.find(i=>i.txt===route.level) ? route.level : (ch.items[0]||{}).txt;
    if(levelTxt){
      if(levelSelect.value !== levelTxt){
        levelSelect.value = levelTxt;
      }
      loadLevel(levelTxt);
    } else {
      renderDialogues([]);
      if(backgroundController){ backgroundController.reset(); }
      if(audioController){ audioController.reset(); }
      if(characterController){ characterController.reset(); }
    }
  }

  // Events: drive state via routing
  window.addEventListener('hashchange', applyRouteFromHash);
  if(categorySelect){
    categorySelect.addEventListener('change', () => {
      const cat = categorySelect.value;
      populateChapters(cat);
      const ids = chapterByCategory[cat] || [];
      const firstId = ids[0];
      const firstLevel = firstId && chapters[firstId] && chapters[firstId].items[0] ? chapters[firstId].items[0].txt : '';
      if(firstId) setHashRoute(firstId, firstLevel);
    });
  }
  chapterSelect.addEventListener('change', () => {
    const id = chapterSelect.value;
    const ch = chapters[id];
    const firstLevel = ch && ch.items[0] ? ch.items[0].txt : '';
    setHashRoute(id, firstLevel);
  });
  levelSelect.addEventListener('change', () => {
    setHashRoute(chapterSelect.value, levelSelect.value);
  });
  prevBtn.addEventListener('click', () => { if(isDelaying) return; if(index>0){ index--; updateCurrent(); } });
  nextBtn.addEventListener('click', () => {
    if(isDelaying) return;
    const item = view[index];
    if(item && item.type === 'decision' && !selections[item.id]){ return; }
    if(index<view.length-1){ index++; updateCurrent(); }
  });

  // Helper: highlight the current line in the log
  function highlightLogCurrent(){
    if(!logModal || !logContainer) return;
    if(logModal.style.display !== 'flex') return; // only when visible
    const current = view && view[index] ? view[index] : null;
    if(!current) return;
    const di = dialogues ? dialogues.indexOf(current) : -1;
    if(di < 0) return;
    const prev = logContainer.querySelector('.line.is-current');
    if(prev) prev.classList.remove('is-current');
    const el = logContainer.querySelector(`.line[data-idx="${di}"]`);
    if(el){ el.classList.add('is-current'); try{ el.scrollIntoView({ block: 'nearest' }); }catch{} }
  }

  // Log modal controls
  function openLog(){
    if(!logModal) return;
    logContainer.innerHTML = '';
    // Show full dialogues, including branches beyond current selections
    logContainer.appendChild(buildLogFragment(dialogues, { includeIndex: true }));
    logModal.style.display = 'flex';
    highlightLogCurrent();
  }
  function closeLog(){ if(logModal) logModal.style.display = 'none'; }
  if(logBtn) logBtn.addEventListener('click', openLog);
  if(closeLogBtn) closeLogBtn.addEventListener('click', closeLog);
  if(logModal){
    logModal.addEventListener('click', (e)=>{ if(e.target === logModal) closeLog(); });
    window.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeLog(); });
  }

  // Jump to a line when clicking in the log
  if(logContainer){
    logContainer.addEventListener('click', (e)=>{
      const line = e.target && e.target.closest ? e.target.closest('.line') : null;
      if(!line || !line.dataset || line.dataset.idx == null) return;
      const i = Number(line.dataset.idx);
      if(!Number.isFinite(i) || i < 0 || i >= dialogues.length) return;

      const target = dialogues[i];
      // If the target line is guarded by a decision, pre-select a compatible option
      if(target && target.type === 'line' && target.guard){
        const decisionId = target.guard.decisionId;
        const allowed = Array.isArray(target.guard.allow) ? target.guard.allow : [];
        // Find the decision entry and a matching option
        const dec = dialogues.find(x=>x && x.type==='decision' && x.id===decisionId);
        let chosen = selections[decisionId];
        if(!chosen || (allowed.length && !allowed.includes(chosen))){
          const match = dec && dec.options ? dec.options.find(o=>allowed.includes(o.value)) : null;
          chosen = (match && match.value) || (allowed[0] || null);
          if(chosen) selections[decisionId] = chosen;
        }
      }

      // Recompute view and jump to selected item
      view = computeVisible(dialogues, selections);
      let pos = view.indexOf(target);
      if(pos < 0){
        // Fallback: jump to nearest visible item after the target index
        for(let j=i+1;j<dialogues.length && pos<0;j++){
          const candidate = dialogues[j];
          const k = view.indexOf(candidate);
          if(k >= 0) pos = k;
        }
      }
      if(pos < 0){
        // If still not found, go to last visible item
        pos = Math.max(0, view.length - 1);
      }
      index = pos;
      closeLog();
      updateCurrent();
    });
  }

  // init
  loadStoryIndex();
})();

  const cameraAPI = window.StoryCamera || {};
  const cameraController = cameraAPI.CameraShakeController
    ? new cameraAPI.CameraShakeController()
    : null;
  const parseCameraShake = typeof cameraAPI.parseCameraShake === 'function' ? cameraAPI.parseCameraShake : null;





