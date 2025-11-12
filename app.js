  // Base server default (used when no hash specified)
  const SERVER_STRING = 'en_US';
  // Base to static assets (images, audio, etc.). Replace this to point to a CDN/raw URL when needed.
  const DATA_ASSETS = `https://raw.githubusercontent.com/akgcc/arkdata/main/assets/`;
  // Expose assets base for other modules loaded on the page, but don't overwrite if set early in index.html

  const DEFAULT_CHAPTER_ID = 'main_0';
  const DEFAULT_LEVEL_TXT = 'obt/guide/beg/0_welcome_to_guide';
  const DEFAULT_ROUTE_HASH = '#chapter=main_0&level=obt%2Fguide%2Fbeg%2F0_welcome_to_guide';

(function(){
  const SERVER_NAMES = {
    en_US: 'EN (en_US)',
    ja_JP: 'JP (ja_JP)',
    ko_KR: 'KR (ko_KR)',
    zh_CN: 'CN (zh_CN)',
    ru_RU: 'RU (ru_RU)'
  };

  let currentServer = SERVER_STRING;
  function getDataBase(){
    if(currentServer === 'zh_CN'){
      return `https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/${currentServer}`;
    }
    return `https://raw.githubusercontent.com/thorusg/ArknightsGameData_YoStar/main/${currentServer}`;
  }
  const serverSelect = document.getElementById('serverSelect');
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
  const speedSlider = document.getElementById('speedSlider');
  const speedValueEl = document.getElementById('speedValue');
  const headerEl = document.getElementById('appHeader') || document.querySelector('header');
  const headerToggleBtn = document.getElementById('headerToggle');
  const playerNameInput = document.getElementById('playerName');

  const isLocalEnvironment = (() => {
    try{
      const loc = window.location || {};
      const protocol = (loc.protocol || '').toLowerCase();
      const host = (loc.hostname || '').toLowerCase();
      if(protocol === 'file:') return true;
      if(!host) return true;
      if(host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
      if(/\.local$/.test(host)) return true;
    }catch{}
    return false;
  })();
  const enableDebugLog = isLocalEnvironment;
  const enableBacktrack = isLocalEnvironment;

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

  const cameraAPI = window.StoryCamera || {};
  const cameraController = cameraAPI.CameraShakeController
    ? new cameraAPI.CameraShakeController()
    : null;
  const parseCameraShake = typeof cameraAPI.parseCameraShake === 'function' ? cameraAPI.parseCameraShake : null;

  // Camera effects/controllers
  // (moved to top of file) duplicate leftover removed

  const effectsAPI = window.StoryEffects || {};
  const effectsController = effectsAPI.EffectsController
    ? new effectsAPI.EffectsController()
    : null;
  const parseCameraEffect = typeof effectsAPI.parseCameraEffect === 'function' ? effectsAPI.parseCameraEffect : null;

  // Hash bootstrap: include server param when missing entirely
  if(!window.location.hash){
    window.location.hash = `server=${encodeURIComponent(SERVER_STRING)}&` + DEFAULT_ROUTE_HASH.slice(1);
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
  const logEntryCache = new WeakMap();

  // Player nickname handling
  let playerNickname = null;
  function readNickname(){
    try{
      const s = localStorage.getItem('playerNickname');
      if(s!=null) return String(s);
    }catch{}
    return '';
  }
  function writeNickname(v){
    try{ localStorage.setItem('playerNickname', String(v||'')); }catch{}
  }
  function getNickname(){
    if(playerNickname == null || playerNickname === '') return '{@nickname}';
    return playerNickname;
  }
  function applyVariables(str){
    try{
      let s = String(str == null ? '' : str);
      // Replace {@nickname} with the chosen name
      s = s.replace(/\{@nickname\}/gi, getNickname());
      return s;
    }catch{ return String(str||''); }
  }

  const CACHE_DEFAULT_MAX_AGE = 5 * 60 * 1000; // 5 minutes
  const DEFAULT_LEVEL_CACHE_MS = 30 * 60 * 1000; // 30 minutes
  const requestCache = new Map();
  const inflightRequests = new Map();
  const isCacheDisabled = !!window.DISABLE_DATA_CACHE;
  const LEVEL_CACHE_MAX_AGE = (() => {
    const override = Number(window.LEVEL_CACHE_MAX_AGE);
    if(Number.isFinite(override) && override >= 0){
      return override;
    }
    return DEFAULT_LEVEL_CACHE_MS;
  })();

  function buildCacheKey(url, parser, explicitKey){
    if(explicitKey) return explicitKey;
    const type = typeof parser === 'string' ? parser : (typeof parser === 'function' ? 'fn' : 'text');
    return `${type}:${url}`;
  }

  async function parseResponse(res, parser){
    if(typeof parser === 'function'){
      return parser(res);
    }
    const mode = (parser || 'json').toLowerCase();
    if(mode === 'json'){
      return res.json();
    }
    if(mode === 'text'){
      return res.text();
    }
    if(mode === 'blob'){
      return res.blob();
    }
    if(mode === 'arraybuffer'){
      return res.arrayBuffer();
    }
    return res.text();
  }

  function getCachedValue(key, maxAgeMs){
    if(!requestCache.has(key)) return null;
    const entry = requestCache.get(key);
    if(!entry) return null;
    if(maxAgeMs === 0) return null;
    const age = Date.now() - entry.timestamp;
    if(maxAgeMs === Infinity || age <= maxAgeMs){
      return entry.value;
    }
    requestCache.delete(key);
    return null;
  }

  function clearDataCaches(){
    requestCache.clear();
    inflightRequests.clear();
  }

  async function fetchCached(url, options = {}){
    const {
      parser = 'json',
      maxAgeMs = CACHE_DEFAULT_MAX_AGE,
      cacheKey: explicitKey,
      fetchOptions = {}
    } = options;
    const key = buildCacheKey(url, parser, explicitKey);
    if(!isCacheDisabled){
      const cached = getCachedValue(key, maxAgeMs);
      if(cached != null){
        return cached;
      }
      if(inflightRequests.has(key)){
        return inflightRequests.get(key);
      }
    }
    const promise = (async () => {
      const mergedOptions = Object.assign(
        { cache: maxAgeMs === 0 ? 'reload' : 'default' },
        fetchOptions || {}
      );
      const res = await fetch(url, mergedOptions);
      if(!res.ok){
        throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
      }
      const value = await parseResponse(res, parser);
      if(!isCacheDisabled && maxAgeMs !== 0){
        requestCache.set(key, { value, timestamp: Date.now() });
      }
      return value;
    })().catch((err) => {
      if(!isCacheDisabled){
        requestCache.delete(key);
      }
      throw err;
    }).finally(() => {
      if(!isCacheDisabled){
        inflightRequests.delete(key);
      }
    });
    if(!isCacheDisabled){
      inflightRequests.set(key, promise);
    }
    return promise;
  }

  function collectEffectTargets(){
    const targets = [];
    try{
      if(backgroundController){
        const names = ['bgLayer', 'bgTweenLayer', 'imageLayer', 'imageLayer2', 'tweenLayer', 'curtainLayer', 'blockerLayer'];
        for(const name of names){
          const node = backgroundController[name];
          if(node) targets.push(node);
        }
      }
      if(characterController && characterController.layer){
        targets.push(characterController.layer);
      }
    }catch{}
    return targets;
  }

  function hardResetControllers(){
    clearPendingEffects();
    if(backgroundController && typeof backgroundController.reset === 'function'){ backgroundController.reset(); }
    if(audioController && typeof audioController.reset === 'function'){ audioController.reset(); }
    if(characterController && typeof characterController.reset === 'function'){ characterController.reset(); }
    try{
      const targets = collectEffectTargets();
      if(cameraController && typeof cameraController.reset === 'function'){ cameraController.reset(targets); }
      if(effectsController && typeof effectsController.reset === 'function'){ effectsController.reset(targets); }
    }catch{}
  }

  function runEffectOperation(op){
    if(!op) return;
    try{
      if(op.type === 'blocker' && backgroundController && typeof backgroundController.applyBlocker === 'function'){
        backgroundController.applyBlocker(op.entry);
      } else if(op.type === 'image' && backgroundController && typeof backgroundController.apply === 'function'){
        backgroundController.apply(op.entry);
        try{
          if(characterController && typeof characterController.applyFor === 'function'){
            characterController.applyFor(dialogues, selections, op.entry);
          }
        }catch{}
      } else if(op.type === 'curtain' && backgroundController && typeof backgroundController.applyCurtain === 'function'){
        backgroundController.applyCurtain(op.entry);
      } else if(op.type === 'audio' && audioController && typeof audioController.apply === 'function'){
        audioController.apply(op.entry);
      } else if(op.type === 'sound' && audioController && typeof audioController.playSound === 'function'){
        audioController.playSound(op.entry);
      } else if(op.type === 'character' && characterController && typeof characterController.applyFor === 'function'){
        characterController.applyFor(dialogues, selections, op.entry);
      } else if(op.type === 'camerashake' && cameraController){
        const targets = collectEffectTargets();
        cameraController.shake(op.entry, targets);
      } else if(op.type === 'cameraeffect' && effectsController && typeof effectsController.apply === 'function'){
        const targets = collectEffectTargets();
        effectsController.apply(op.entry, targets);
      }
    }catch{}
  }

  function scheduleEffectOperation(op, delayMs){
    if(delayMs > 0){
      const id = setTimeout(()=>{ runEffectOperation(op); }, delayMs);
      pendingEffectTimers.push(id);
    } else {
      runEffectOperation(op);
    }
  }
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

  // Text speed controls
  function clamp01(n){ return Math.max(0, Math.min(1, Number(n)||0)); }
  function cpsFromSlider(val){
    const v = Math.max(0, Math.min(100, Math.floor(Number(val)||0)));
    if(v >= 100) return Infinity; // instant
    // Map 0..99 -> 2..120 cps (linear)
    return 2 + (v/99) * 118;
  }
  function defaultSliderForCps(cps){
    const c = Math.max(2, Math.min(120, Number(cps)||28));
    const v = Math.round(((c - 2) / 118) * 99);
    return Math.max(0, Math.min(99, v));
  }
  function readSpeed(){
    try{ const s = localStorage.getItem('textSpeed'); if(s!=null) return Math.max(0, Math.min(100, parseInt(s))); }catch{}
    return defaultSliderForCps(28);
  }
  function writeSpeed(v){
    try{ localStorage.setItem('textSpeed', String(Math.max(0, Math.min(100, Math.floor(v||0))))); }catch{}
  }
  function updateSpeedLabel(){
    if(!speedValueEl) return;
    const v = speedSlider ? Number(speedSlider.value)||0 : readSpeed();
    if(v >= 100){ speedValueEl.textContent = 'Instant'; return; }
    const cps = Math.round(cpsFromSlider(v));
    speedValueEl.textContent = `${cps} cps`;
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
  function setHashRoute(chapterId, levelTxt, server){
    const parts = [];
    const srv = server || parseHash().server || currentServer || SERVER_STRING;
    if(srv) parts.push(`server=${encodeURIComponent(srv)}`);
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

  function populateServers(preferred){
    if(!serverSelect) return;
    serverSelect.innerHTML = '';
    for(const code of Object.keys(SERVER_NAMES)){
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = SERVER_NAMES[code];
      serverSelect.appendChild(opt);
    }
    const want = preferred || parseHash().server || currentServer || SERVER_STRING;
    currentServer = Object.prototype.hasOwnProperty.call(SERVER_NAMES, want) ? want : SERVER_STRING;
    serverSelect.value = currentServer;
  }

  async function loadStoryIndex(){
    setStatus('Loading story index...');
    try{
      const base = getDataBase();
      const [
        reviewData,
        moduleMaybe,
        rogueMaybe,
        variablesMaybe
      ] = await Promise.all([
        fetchCached(`${base}/gamedata/excel/story_review_table.json`, { parser: 'json', maxAgeMs: 15 * 60 * 1000 }),
        fetchCached(`${base}/gamedata/excel/uniequip_table.json`, { parser: 'json', maxAgeMs: 30 * 60 * 1000 }).catch(()=>null),
        fetchCached(`${base}/gamedata/excel/roguelike_topic_table.json`, { parser: 'json', maxAgeMs: 30 * 60 * 1000 }).catch(()=>null),
        storyVariables
          ? Promise.resolve(null)
          : fetchCached(`${base}/gamedata/story/story_variables.json`, { parser: 'json', maxAgeMs: 30 * 60 * 1000 })
              .then((vars) => {
                if(audioController && typeof audioController.setVariables === 'function'){
                  audioController.setVariables(vars);
                }
                return vars;
              })
              .catch((err) => {
                console.warn('Failed to load story variables', err);
                return null;
              })
      ]);
      storyReview = reviewData;
      if(moduleMaybe) moduleData = moduleMaybe;
      if(rogueMaybe) rogueData = rogueMaybe;
      if(!storyVariables && variablesMaybe){
        storyVariables = variablesMaybe;
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
    hardResetControllers();
    try{
      const url = `${getDataBase()}/gamedata/story/${storyTxt}.txt`;
      const text = await fetchCached(url, { parser: 'text', maxAgeMs: LEVEL_CACHE_MAX_AGE });
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
      hardResetControllers();
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

  // Helper: detect CJK characters
  function containsCJK(str){
    return /[\u3400-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(str);
  }
  // Only filter CJK lines when reading EN server files.
  function shouldFilterCJK(){ return currentServer === 'en_US'; }

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
    const withVars = applyVariables(text);
    const norm = normalizeTextForDisplay(withVars);
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
    const headerRe = /^\[header\b/i; // e.g., [HEADER(...)] Title
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
      if(headerRe.test(raw)){
        continue;
      }
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
        if(body.length && (!shouldFilterCJK() || !containsCJK(body))){
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
          if(body.length && (!shouldFilterCJK() || !containsCJK(body))){
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
          if(body.length && (!shouldFilterCJK() || !containsCJK(body))){
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
        if(body.length && (!shouldFilterCJK() || !containsCJK(body))){
          out.push({ type: 'line', name: nm, text: body, guard: activeGuard ? { decisionId: activeGuard.decisionId, allow: [...activeGuard.allow] } : null });
        }
        continue;
      }
      // Bare narration lines (non-empty and not a control tag)
      if(raw.trim().length && raw.trim()[0] !== '['){
        const body = raw.trim();
        if(!shouldFilterCJK() || !containsCJK(body)){
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
    const isSimpleCharacterEntry = (entry) => {
      if(!entry) return false;
      if(entry.type === 'charslot'){
        if(entry.hasDirective) return false;
        if(entry.hasEffects) return false;
        return true;
      }
      if(entry.type === 'character'){
        return !entry.clear;
      }
      return false;
    };
    let t = 0;
    let lastPlainImage = null; // last [Image] (not ImageTween) in this window
    let lastPlainBackground = null; // last [Background] (not BackgroundTween) in this window
    for(let i = startPos + 1; i <= endPos; i++){
      const it = dialogues[i];
      if(!it) continue;
      if(it.guard && !isGuardSatisfied(it.guard, selections)) continue;
      // Schedule character-layer updates exactly when they appear in the timeline,
      // so character swaps take effect during blockers/delays between visible lines.
      if(it.type === 'character' || it.type === 'charslot'){
        // Determine if this entry is a clear (empty [charslot] or [Character] without names)
        const isClearCharslot = (it.type === 'charslot') && !it.slot && !it.name && !it.hasDirective;
        const isClearCharacter = (it.type === 'character') && !!it.clear;
        const isClear = isClearCharslot || isClearCharacter;

        if(isClear){
          // Always keep explicit clears; do not coalesce them away.
          // If a clear shares the exact same timestamp as another character op,
          // nudge it by a tiny epsilon so prior shows can paint before fading out.
          let atT = t;
          for(let k = plan.ops.length - 1; k >= 0; k--){
            const op = plan.ops[k];
            if(!op) continue;
            if(op.atMs < t) break;
            // Use a slightly larger epsilon to ensure a visible paint even when images swap in async
            if(op.type === 'character' && op.atMs === t){ atT = t + 100; break; }
          }
          plan.ops.push({ atMs: atT, type: 'character', entry: it });
          continue;
        }

        // For non-clear character/slot updates at the same timestamp, replace the last
        // non-clear character op while preserving any earlier clear ops at that time.
        const newIsSimple = isSimpleCharacterEntry(it);
        let replaced = false;
        for(let k = plan.ops.length - 1; k >= 0; k--){
          const op = plan.ops[k];
          if(!op) continue;
          if(op.atMs < t) break; // earlier time; stop scanning
          if(op.type === 'character'){
            const opEntry = op.entry || {};
            const opIsClear = ((opEntry.type === 'charslot') && !opEntry.slot && !opEntry.name && !opEntry.hasDirective)
              || ((opEntry.type === 'character') && !!opEntry.clear);
            if(!opIsClear && op.atMs === t){
              const opIsSimple = isSimpleCharacterEntry(opEntry);
              if(opIsSimple && newIsSimple){
                plan.ops[k] = { atMs: t, type: 'character', entry: it };
                replaced = true;
                break;
              }
            }
          }
        }
        if(!replaced){
          plan.ops.push({ atMs: t, type: 'character', entry: it });
        }
        // Character ops do not affect overall wait/hide timing by default.
        // If a [charslot] explicitly requests blocking via isblock=true, gate for its duration.
        if(it.type === 'charslot' && (it.isBlock === true)){
          const secs = Number(it.duration || it.fadeTime || 0) || 0;
          if(secs > 0){
            const ms = Math.round(secs * 1000);
            plan.totalMs += ms;
            plan.hideMs += ms;
            plan.blockRender = true;
            plan.shouldHideUI = true;
            t += ms;
          }
        }
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
        // If this is an ImageTween, attach explicit params from the immediately preceding Image only.
        try{
          const tag = (it.tag || '').toLowerCase();
          if(tag === 'image'){
            lastPlainImage = it;
          } else if(tag === 'background'){
            lastPlainBackground = it;
          } else if(tag === 'imagetween'){
            const p = lastPlainImage || null;
            const toNum = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
            it._baseParams = p ? {
              x: toNum(p.x),
              y: toNum(p.y),
              xScale: toNum(p.xScale),
              yScale: toNum(p.yScale),
            } : null;
          } else if(tag === 'backgroundtween'){
            const p = lastPlainBackground || null;
            const toNum = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
            it._baseParams = p ? {
              x: toNum(p.x),
              y: toNum(p.y),
              xScale: toNum(p.xScale),
              yScale: toNum(p.yScale),
            } : null;
          }
        }catch{}
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
      if(/^\[header\b/i.test(raw)) { continue; }
      // Named or empty-name dialogue lines
      const m = re.exec(raw);
      if(m){
        const name = (m[1]||'').trim();
        const body = (m[2]||'').trim();
        if(body.length && (!shouldFilterCJK() || !containsCJK(body))){ out.push({ name, text: body }); }
        continue;
      }
      // Subtitle blocks with explicit text param
      const s = subtitleRe.exec(raw);
      if(s){
        const params = s[1] || '';
        const tm = params.match(/text\s*=\s*\"([^\"]*)\"/i);
        if(tm && tm[1]){
          const body = tm[1].trim();
          if(body.length && (!shouldFilterCJK() || !containsCJK(body))){ out.push({ name: '', text: body }); }
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
          if(body.length && (!shouldFilterCJK() || !containsCJK(body))){ out.push({ name: '', text: body }); }
        }
        continue;
      }
      // Other named tags with inline text, e.g., [multiline(name="X")]Hello
      const nt = namedTagRe.exec(raw);
      if(nt){
        const params = nt[1] || '';
        const body = (nt[2]||'').trim();
        const nm = (params.match(/\bname\s*=\s*\"([^\"]*)\"/i) || [,''])[1].trim();
        if(body.length && (!shouldFilterCJK() || !containsCJK(body))){ out.push({ name: nm, text: body }); }
        continue;
      }
      // Bare narration lines (non-empty and not a control tag)
      if(raw.trim().length && raw.trim()[0] !== '['){
        const body = raw.trim();
        if(!shouldFilterCJK() || !containsCJK(body)){
          out.push({ name: '', text: body });
        }
        continue;
      }
      // ignore other control lines
    }
    return out;
  }

  function populateLogEntry(el, item, opts = {}){
    if(!el || !item) return null;
    const doc = el.ownerDocument || document;
    const { includeIndex = false, index = -1 } = opts;
    el.textContent = '';
    let className = 'line';
    if(item.type==='decision'){
      className += ' decision';
    } else if(item.type==='image'){
      className += ' image-change';
    } else if(item.type==='audio'){
      className += ' audio-change';
    }
    el.className = className;
    if(includeIndex && index >= 0){
      el.dataset.idx = String(index);
    } else if(el.dataset && el.dataset.idx != null){
      delete el.dataset.idx;
    }
    if(item.type==='image'){
      const text = doc.createElement('span');
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
      el.appendChild(text);
      return el;
    }
    if(item.type==='blocker'){
      const text = doc.createElement('span');
      text.className = 'text muted';
      const f = item.from || {}; const t = item.to || {};
      const fade = Number(item.fadeTime) || 0;
      let label = `Blocker ${f.r||0},${f.g||0},${f.b||0},${f.a||0} -> ${t.r||255},${t.g||255},${t.b||255},${t.a||1}`;
      if(fade>0){ label += ` (fade ${fade}s)`; }
      text.textContent = label;
      el.appendChild(text);
      return el;
    }
    if(item.type==='audio'){
      const text = doc.createElement('span');
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
      el.appendChild(text);
      return el;
    }
    if(item.type==='charslot'){
      const text = doc.createElement('span');
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
      el.appendChild(text);
      return el;
    }
    if(item.type==='character'){
      const text = doc.createElement('span');
      text.className = 'text muted';
      const parts = [];
      if(item.name){ parts.push(`Left: ${item.name}`); }
      if(item.name3){ parts.push(`Center: ${item.name3}`); }
      if(item.name2){ parts.push(`Right: ${item.name2}`); }
      if(!parts.length){ parts.push('Characters cleared'); }
      if(Number.isFinite(item.focus)){ parts.push(`focus=${item.focus}`); }
      text.textContent = parts.join(' | ');
      el.appendChild(text);
      return el;
    }
    if(item.type==='line' && item.name){
      const name = doc.createElement('span');
      name.className = 'name';
      name.textContent = applyVariables(item.name) + ':';
      el.appendChild(name);
    }
    if(item.type==='line'){
      const text = doc.createElement('span');
      text.className = 'text';
      renderRichText(text, item.text);
      el.appendChild(text);
    } else if(item.type==='decision'){
      const text = doc.createElement('span');
      const labels = (item.options||[]).map(o=>applyVariables(o.label)).join(' / ');
      const chosen = selections[item.id];
      const chosenOpt = item.options.find(o=>o.value===chosen) || null;
      const chosenLabel = chosenOpt ? applyVariables(chosenOpt.label) : chosen;
      text.textContent = 'Choices: ' + labels + (chosen? ` (selected: ${chosenLabel||''})` : '');
      el.appendChild(text);
    }
    return el;
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
      const populated = populateLogEntry(div, item, { includeIndex, index: i });
      if(populated) frag.appendChild(populated);
    }
    return frag;
  }
  function renderDialogues(list){
    const items = Array.isArray(list) ? list : [];
    if(currentEl){ currentEl.hidden = !items.length; }
    if(!enableDebugLog) return;
    if(!listEl) return;
    if(!items.length){
      listEl.innerHTML = '';
      listEl.appendChild(buildLogFragment(items));
      return;
    }
    let pos = 0;
    for(let i=0;i<items.length;i++){
      const item = items[i];
      if(!item) continue;
      let node = logEntryCache.get(item);
      if(!node){
        node = document.createElement('div');
        logEntryCache.set(item, node);
      }
      populateLogEntry(node, item);
      const current = listEl.children[pos];
      if(current !== node){
        listEl.insertBefore(node, current || null);
      }
      pos++;
    }
    while(listEl.children.length > pos){
      listEl.removeChild(listEl.lastElementChild);
    }
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
      currentNameEl.textContent = applyVariables(item.name);
    } else {
      currentNameEl.textContent = '';
      currentNameEl.style.display = 'none'; // hide for subtitles
    }
    if(item.type==='line'){
      cancelTextReveal();
      renderRichText(currentTextEl, item.text);
      // Start per-character reveal using configured speed
      try {
        const v = speedSlider ? Number(speedSlider.value)||readSpeed() : readSpeed();
        const cps = cpsFromSlider(v);
        if(Number.isFinite(cps)) startTextReveal(currentTextEl, { cps });
      } catch {}
      if(prevBtn){ prevBtn.disabled = enableBacktrack ? index === 0 : true; }
      nextBtn.disabled = index >= view.length - 1;
    } else if(item.type==='decision'){
      cancelTextReveal();
      currentTextEl.textContent = 'Choose a response:';
      if(choicesEl){
        choicesEl.style.display = 'flex';
        for(const opt of item.options){
          const b = document.createElement('button');
          b.textContent = applyVariables(opt.label);
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
      if(prevBtn){ prevBtn.disabled = enableBacktrack ? index === 0 : true; }
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
        scheduleEffectOperation(op, op.atMs);
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
        scheduleEffectOperation(op, op.atMs);
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
        runEffectOperation(op);
      }
    }
    renderCurrentCore();
  }

  function applyRouteFromHash(){
    const route = parseHash();
    // Server switching via hash
    const srv = route.server && SERVER_NAMES[route.server] ? route.server : SERVER_STRING;
    if(srv !== currentServer){
      currentServer = srv;
      if(serverSelect && serverSelect.value !== srv){ serverSelect.value = srv; }
      // Clear cached data that is server-specific
      storyReview = null;
      moduleData = null;
      rogueData = null;
      storyVariables = null;
      clearDataCaches();
      // Reload index for the new server; this will repopulate UI and continue routing
      loadStoryIndex();
      return;
    }
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
  // Unlock audio on first user gesture (click, pointer, key)
  (function initAudioUnlock(){
    if(!audioController || typeof audioController.unlock !== 'function') return;
    const once = () => {
      try{ audioController.unlock(); }catch{}
    };
    const opts = { once: true, capture: true };
    try{
      window.addEventListener('pointerdown', once, opts);
      window.addEventListener('keydown', once, opts);
      window.addEventListener('click', once, opts);
    }catch{}
  })();

  // Header collapse/expand toggle
  (function initHeaderToggle(){
    if(!headerToggleBtn) return;
    function setCollapsed(on){
      const b = document.body;
      if(!b) return;
      if(on){ b.classList.add('has-collapsed-header'); }
      else { b.classList.remove('has-collapsed-header'); }
      try{
        headerToggleBtn.setAttribute('aria-expanded', on ? 'false' : 'true');
        headerToggleBtn.textContent = on ? '▼' : '▲';
        headerToggleBtn.title = on ? 'Show header' : 'Hide header';
      }catch{}
    }
    headerToggleBtn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const collapsed = document.body.classList.contains('has-collapsed-header');
      setCollapsed(!collapsed);
    });
    // Start expanded
    setCollapsed(false);
  })();

  // Initialize speed slider
  (function initSpeed(){
    if(!speedSlider){ return; }
    const v = readSpeed();
    speedSlider.value = String(v);
    updateSpeedLabel();
    const onChange = () => {
      const val = Number(speedSlider.value)||0;
      writeSpeed(val);
      updateSpeedLabel();
      // Apply to current line without reloading other systems
      const item = view[index];
      if(item && item.type === 'line'){
        cancelTextReveal();
        try{ renderRichText(currentTextEl, item.text); }catch{}
        const cps = cpsFromSlider(val);
        if(Number.isFinite(cps)){
          try{ startTextReveal(currentTextEl, { cps }); }catch{}
        }
      }
    };
    speedSlider.addEventListener('input', onChange);
    speedSlider.addEventListener('change', onChange);
  })();

  // Initialize player nickname input
  (function initNickname(){
    if(!playerNameInput){ return; }
    playerNickname = readNickname();
    if(playerNickname){ try{ playerNameInput.value = playerNickname; }catch{} }
    const onChange = () => {
      try{ playerNickname = String(playerNameInput.value || '').trim(); }catch{ playerNickname = ''; }
      writeNickname(playerNickname);
      // Re-render current line and log to reflect substitutions
      try{ renderDialogues(view); }catch{}
      try{ updateCurrent(); }catch{}
    };
    playerNameInput.addEventListener('input', onChange);
    playerNameInput.addEventListener('change', onChange);
  })();
  // Populate server list and sync initial selection
  populateServers();
  if(serverSelect){
    serverSelect.addEventListener('change', () => {
      const srv = serverSelect.value;
      // Update route preserving chapter/level; applyRouteFromHash will reload index
      const r = parseHash();
      setHashRoute(r.chapter, r.level, srv);
    });
  }
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
  function goNext(){
    if(isDelaying) return;
    const item = view[index];
    if(item && item.type === 'decision' && !selections[item.id]){ return; }
    if(index<view.length-1){ index++; updateCurrent(); }
  }
  if(enableBacktrack && prevBtn){
    prevBtn.addEventListener('click', () => { if(isDelaying) return; if(index>0){ index--; updateCurrent(); } });
  } else if(prevBtn){
    prevBtn.disabled = true;
    prevBtn.title = 'Back navigation is available only when running locally.';
  }
  nextBtn.addEventListener('click', () => { goNext(); });

  // Advance on space anywhere except the header and interactive controls
  document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space') {
    return; 
  }
  try {
    const activeEl = document.activeElement;
    if (activeEl) {
      const tag = activeEl.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        return;
      }
    }
    e.preventDefault();
    goNext();
  } catch (err) {
  }
}, true);

  // Helper: highlight the current line in the log
  function highlightLogCurrent(){
    if(!enableDebugLog) return;
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
    if(!enableDebugLog) return;
    if(!logModal) return;
    logContainer.innerHTML = '';
    // Show full dialogues, including branches beyond current selections
    logContainer.appendChild(buildLogFragment(dialogues, { includeIndex: true }));
    logModal.style.display = 'flex';
    highlightLogCurrent();
  }
  function closeLog(){ if(logModal) logModal.style.display = 'none'; }
  if(enableDebugLog){
    if(logBtn) logBtn.addEventListener('click', openLog);
    if(closeLogBtn) closeLogBtn.addEventListener('click', closeLog);
    if(logModal){
      logModal.addEventListener('click', (e)=>{ if(e.target === logModal) closeLog(); });
      window.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeLog(); });
    }
  } else {
    if(logBtn){
      logBtn.disabled = true;
      logBtn.style.display = 'none';
    }
    if(logModal){ logModal.remove(); }
  }

  // Jump to a line when clicking in the log
  if(enableDebugLog && logContainer){
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
