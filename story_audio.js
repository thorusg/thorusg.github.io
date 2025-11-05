(function(global){
  // Shared assets base; configurable via window.DATA_ASSETS set by app.js
  const ASSETS_BASE = (global && global.DATA_ASSETS ? String(global.DATA_ASSETS) : '/content/assets/').replace(/\/+$/, '');
  const PLAY_RE = /^\[PlayMusic(?:\(([^)]*)\))?\]/i;
  const STOP_RE = /^\[StopMusic(?:\(([^)]*)\))?\]/i;
  const SOUND_RE = /^\[PlaySound(?:\(([^)]*)\))?\]/i;

  function cloneGuard(guard){
    if(!guard) return null;
    return {
      decisionId: guard.decisionId,
      allow: Array.isArray(guard.allow) ? [...guard.allow] : [],
    };
  }

  function parseParams(str){
    const out = Object.create(null);
    if(!str) return out;
    const re = /([a-z0-9_]+)\s*=\s*("[^"]*"|'[^']*'|[^,]+)/gi;
    let match;
    while((match = re.exec(str))){
      const key = match[1] ? match[1].toLowerCase() : '';
      if(!key) continue;
      let value = match[2] != null ? String(match[2]).trim() : '';
      if((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))){
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
    if(out.volu7me != null && out.volume == null){ out.volume = out.volu7me; }
    if(out.daley != null && out.delay == null){ out.delay = out.daley; }
    if(out.crosstime != null && out.crossfade == null){ out.crossfade = out.crosstime; }
    if(out.faddetime != null && out.fadetime == null){ out.fadetime = out.faddetime; }
    if(out.fadeetime != null && out.fadetime == null){ out.fadetime = out.fadeetime; }
    if(out.fdetime != null && out.fadetime == null){ out.fadetime = out.fdetime; }
    return out;
  }

  function normalizeKey(value){
    if(value == null) return '';
    let out = String(value).trim();
    if(!out) return '';
    if((out.startsWith("\"") && out.endsWith("\"")) || (out.startsWith("'") && out.endsWith("'"))){
      out = out.slice(1, -1);
    }
    if(out.startsWith('$')){
      out = out.slice(1);
    }
    return out.trim();
  }

  function toNumber(value, fallback){
    if(value == null || value === '') return fallback;
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function clamp01(value){
    const n = Number.isFinite(value) ? value : 0;
    if(n <= 0) return 0;
    if(n >= 1) return 1;
    return n;
  }

  function guardAllows(guard, selections){
    if(!guard) return true;
    if(!selections) return false;
    const sel = selections[guard.decisionId];
    if(sel == null) return false;
    return Array.isArray(guard.allow) && guard.allow.length
      ? guard.allow.includes(sel)
      : false;
  }

  function parsePlayMusic(raw, guard){
    if(!raw) return null;
    const match = PLAY_RE.exec(raw);
    if(!match) return null;
    const params = parseParams(match[1] || '');
    const entry = {
      type: 'audio',
      action: 'play',
      raw: raw.trim(),
      guard: cloneGuard(guard),
    };
    entry.intro = normalizeKey(params.intro);
    entry.key = normalizeKey(params.key || params.loop);
    entry.volume = clamp01(toNumber(params.volume, 1));
    entry.delay = Math.max(0, toNumber(params.delay, 0));
    entry.crossfade = Math.max(0, toNumber(params.crossfade, 0));
    entry.fadeTime = Math.max(0, toNumber(params.fadetime, 0));
    return entry;
  }

  // Parse one-shot sound effects: [PlaySound(key="$...", volume=1, delay=0)]
  function parsePlaySound(raw, guard){
    if(!raw) return null;
    const match = SOUND_RE.exec(raw);
    if(!match) return null;
    const params = parseParams(match[1] || '');
    const entry = {
      type: 'sound',
      action: 'play',
      raw: raw.trim(),
      guard: cloneGuard(guard),
    };
    entry.key = normalizeKey(params.key);
    entry.volume = clamp01(toNumber(params.volume, 1));
    entry.delay = Math.max(0, toNumber(params.delay, 0));
    return entry;
  }

  function parseStopMusic(raw, guard){
    if(!raw) return null;
    const match = STOP_RE.exec(raw);
    if(!match) return null;
    const params = parseParams(match[1] || '');
    const entry = {
      type: 'audio',
      action: 'stop',
      raw: raw.trim(),
      guard: cloneGuard(guard),
    };
    entry.fadeTime = Math.max(0, toNumber(params.fadetime || params.time || params.crossfade, 0));
    return entry;
  }

  function findActiveAudio(dialogues, selections, target){
    if(!Array.isArray(dialogues) || !target) return null;
    const idx = dialogues.indexOf(target);
    if(idx < 0) return null;
    for(let i = idx; i >= 0; i--){
      const entry = dialogues[i];
      if(!entry || entry.type !== 'audio') continue;
      if(!guardAllows(entry.guard, selections)) continue;
      return entry;
    }
    return null;
  }

  class AudioController {
    constructor(options = {}){
      this.basePath = (options.basePath || `${ASSETS_BASE}/torappu/dynamicassets/audio`).replace(/\/+$/, '');
      this.variables = options.variables || null;
      this.currentEntry = null;
      this.currentState = null;
      this._activeSfx = new Set();
      this._unlocked = false;
    }

    setVariables(map){
      this.variables = map || null;
    }

    reset(){
      this.stop(0);
      this.currentEntry = null;
    }

    // Attempt to unlock audio autoplay by performing a muted play
    // in response to a user gesture; retries current track afterwards.
    unlock(){
      if(this._unlocked) return;
      this._unlocked = true;
      try{
        const a = new Audio();
        a.muted = true;
        // some browsers need a source; use a short, empty data URI
        // but it's acceptable to call play() without setting src
        const p = a.play();
        if(p && typeof p.finally === 'function'){
          p.finally(()=>{ try{ a.pause(); }catch{} });
        } else {
          try{ a.pause(); }catch{}
        }
      }catch{}
      // Re-apply current track if any
      try{ if(this.currentEntry){ this.apply(this.currentEntry); } }catch{}
    }

    apply(entry){
      if(!entry){
        if(this.currentState){ this.stop(0); }
        this.currentEntry = null;
        return;
      }
      if(entry.action === 'stop'){
        if(this.currentEntry === entry) return;
        const fade = Number.isFinite(entry.fadeTime) ? Math.max(0, entry.fadeTime) : 0;
        this.stop(fade);
        this.currentEntry = entry;
        return;
      }
      if(entry.action !== 'play') return;
      if(this.currentEntry === entry) return;
      const info = this.resolveEntry(entry);
      if(!info){
        if(this.currentState){ this.stop(0); }
        this.currentEntry = entry;
        if(entry.key || entry.intro){
          console.warn('Unable to resolve music key', entry.key || entry.intro);
        }
        return;
      }
      this.play(entry, info);
    }

    applyFor(dialogues, selections, target){
      const entry = findActiveAudio(dialogues, selections, target);
      if(!entry){
        if(this.currentState){ this.stop(0); }
        this.currentEntry = null;
        return;
      }
      this.apply(entry);
    }

    resolveEntry(entry){
      const info = {
        volume: clamp01(Number.isFinite(entry.volume) ? entry.volume : 1),
        delay: Number.isFinite(entry.delay) ? Math.max(0, entry.delay) : 0,
        crossfade: Number.isFinite(entry.crossfade) ? Math.max(0, entry.crossfade) : 0,
        fadeTime: Number.isFinite(entry.fadeTime) ? Math.max(0, entry.fadeTime) : 0,
      };
      info.intro = this.resolveKey(entry.intro);
      info.loop = this.resolveKey(entry.key);
      if(!info.intro && !info.loop) return null;
      return info;
    }

    // Play a non-looping sound effect resolved via story_variables
    playSound(entry){
      if(!entry || entry.action !== 'play') return;
      const key = entry.key ? String(entry.key) : '';
      if(!key) return;
      const src = this.resolveKey(key);
      if(!src || !Array.isArray(src.sources) || !src.sources.length) return;
      const audio = new Audio();
      audio.preload = 'auto';
      audio.loop = false;
      let sources = [...src.sources];
      const setSource = () => { if(sources.length){ audio.src = sources[0]; try{ audio.load(); }catch(_){} } };
      const onError = () => {
        if(sources.length > 1){
          sources.shift();
          audio.src = sources[0];
          try{ audio.load(); audio.play().catch(()=>{}); }catch(_){ }
        }
      };
      setSource();
      audio.addEventListener('error', onError);
      const cleanup = () => {
        audio.removeEventListener('error', onError);
        try{ audio.pause(); }catch(_){}
        try{ audio.currentTime = 0; }catch(_){}
        audio.removeAttribute('src');
        try{ audio.load(); }catch(_){}
        this._activeSfx.delete(audio);
      };
      audio.addEventListener('ended', cleanup);
      // Volume and optional delay
      const vol = clamp01(Number.isFinite(entry.volume) ? entry.volume : 1);
      const start = () => {
        audio.volume = vol;
        const p = audio.play();
        if(p && typeof p.catch === 'function'){ p.catch(()=>{}); }
      };
      this._activeSfx.add(audio);
      const d = Number.isFinite(entry.delay) ? Math.max(0, entry.delay) : 0;
      if(d > 0){ setTimeout(start, Math.round(d * 1000)); }
      else { start(); }
    }

    resolveKey(name){
      if(!name) return null;
      let ref = null;
      if(this.variables && Object.prototype.hasOwnProperty.call(this.variables, name)){
        ref = this.variables[name];
      }
      if(!ref){
        ref = name;
      }
      if(!ref) return null;
      let normalized = String(ref).replace(/\\/g, '/');
      normalized = normalized.replace(/^\/+/, '');
      const lowerPath = normalized.toLowerCase();
      if(lowerPath.startsWith('dyn/audio/')){
        normalized = normalized.slice('dyn/audio/'.length);
      } else if(lowerPath.startsWith('audio/')){
        normalized = normalized.slice('audio/'.length);
      }
      if(!normalized) return null;
      const segments = normalized.split('/').map(s => s.trim()).filter(Boolean);
      if(!segments.length) return null;
      let file = segments.pop();
      let ext = '';
      const extMatch = file.match(/\.(mp3|ogg)$/i);
      if(extMatch){
        ext = extMatch[0].toLowerCase();
        file = file.slice(0, -ext.length);
      }
      const dir = segments.map(s => s.toLowerCase()).join('/');
      const fileLower = file.toLowerCase();
      const baseDir = dir ? `${this.basePath}/${dir}` : this.basePath;
      const sources = [];
      if(ext){
        sources.push(`${baseDir}/${fileLower}${ext}`);
      } else {
        sources.push(`${baseDir}/${fileLower}.mp3`);
        sources.push(`${baseDir}/${fileLower}.ogg`);
      }
      if(!sources.length) return null;
      return { sources, dir: baseDir, file: fileLower, key: name };
    }

    stop(fadeSeconds){
      const state = this.currentState;
      if(!state) return;
      if(state.delayTimer){
        clearTimeout(state.delayTimer);
        state.delayTimer = null;
      }
      const finalize = () => {
        this.teardownAudio(state.introAudio, state.introHandlers);
        this.teardownAudio(state.loopAudio, state.loopHandlers);
        if(this.currentState === state){
          this.currentState = null;
          if(this.currentEntry === state.entry || this.currentEntry == null){
            this.currentEntry = null;
          }
        }
      };
      const tasks = [];
      const duration = fadeSeconds && fadeSeconds > 0 ? fadeSeconds : 0;
      if(duration > 0){
        if(state.introAudio){ tasks.push(new Promise(resolve => this.fadeAudio(state.introAudio, 0, duration, resolve))); }
        if(state.loopAudio){ tasks.push(new Promise(resolve => this.fadeAudio(state.loopAudio, 0, duration, resolve))); }
        if(tasks.length){
          Promise.allSettled(tasks).finally(finalize);
          return;
        }
      }
      finalize();
    }

    play(entry, info){
      this.stop(info.fadeTime || 0);
      const state = {
        entry,
        targetVolume: info.volume,
        crossfade: info.crossfade,
        delayTimer: null,
        introAudio: null,
        loopAudio: null,
        introHandlers: null,
        loopHandlers: null,
        info,
      };
      this.currentState = state;
      this.currentEntry = entry;
      if(info.delay && info.delay > 0){
        state.delayTimer = setTimeout(() => {
          state.delayTimer = null;
          this.startPlayback(state);
        }, info.delay * 1000);
      } else {
        this.startPlayback(state);
      }
    }

    startPlayback(state){
      if(this.currentState !== state) return;
      const info = state.info;
      if(info.intro){
        const intro = this.createAudio(info.intro, false);
        if(intro){
          state.introAudio = intro.audio;
          state.introHandlers = intro;
          const onEnded = () => {
            if(state.loopAudio){
              this.playAudio(state.loopAudio, state.crossfade, state.targetVolume);
            }
          };
          intro.audio.addEventListener('ended', onEnded);
          intro.endedHandler = onEnded;
          this.playAudio(intro.audio, state.crossfade, state.targetVolume);
        }
      }
      if(info.loop){
        const loop = this.createAudio(info.loop, true);
        if(loop){
          state.loopAudio = loop.audio;
          state.loopHandlers = loop;
          if(!state.introAudio){
            this.playAudio(loop.audio, state.crossfade, state.targetVolume);
          }
        }
      }
      if(!state.introAudio && !state.loopAudio){
        this.currentState = null;
      }
    }

    createAudio(sourceInfo, loop){
      if(!sourceInfo || !Array.isArray(sourceInfo.sources) || !sourceInfo.sources.length) return null;
      const audio = new Audio();
      audio.preload = 'auto';
      audio.loop = !!loop;
      const sources = [...sourceInfo.sources];
      const setSource = () => {
        if(!sources.length) return;
        audio.src = sources[0];
        audio.load();
      };
      const onError = () => {
        if(sources.length > 1){
          sources.shift();
          audio.src = sources[0];
          audio.load();
          audio.play().catch(()=>{});
        }
      };
      setSource();
      audio.addEventListener('error', onError);
      return { audio, onError };
    }

    playAudio(audio, fadeDuration, targetVolume){
      if(!audio) return;
      const goal = clamp01(targetVolume);
      if(fadeDuration && fadeDuration > 0){
        audio.volume = 0;
      } else {
        audio.volume = goal;
      }
      const playPromise = audio.play();
      if(playPromise && typeof playPromise.catch === 'function'){
        playPromise.catch(err => console.warn('Audio playback blocked', err));
      }
      if(fadeDuration && fadeDuration > 0){
        this.fadeAudio(audio, goal, fadeDuration);
      }
    }

    fadeAudio(audio, target, durationSeconds, done){
      if(!audio){ if(done) done(); return; }
      const startVol = audio.volume;
      const targetVol = clamp01(target);
      const duration = Math.max(0, durationSeconds) * 1000;
      if(duration === 0){
        audio.volume = targetVol;
        if(targetVol <= 0){ try { audio.pause(); audio.currentTime = 0; } catch(_){ } }
        if(done) done();
        return;
      }
      if(audio._fadeFrame){
        cancelAnimationFrame(audio._fadeFrame);
        audio._fadeFrame = null;
      }
      const start = performance.now();
      const step = () => {
        const now = performance.now();
        const ratio = Math.min(1, (now - start) / duration);
        audio.volume = startVol + (targetVol - startVol) * ratio;
        if(ratio < 1){
          audio._fadeFrame = requestAnimationFrame(step);
        } else {
          audio._fadeFrame = null;
          if(targetVol <= 0){
            try { audio.pause(); audio.currentTime = 0; } catch(_){ }
          }
          if(done) done();
        }
      };
      audio._fadeFrame = requestAnimationFrame(step);
    }

    teardownAudio(audio, handlers){
      if(!audio) return;
      if(audio._fadeFrame){
        cancelAnimationFrame(audio._fadeFrame);
        audio._fadeFrame = null;
      }
      try { audio.pause(); } catch(_){ }
      try { audio.currentTime = 0; } catch(_){ }
      if(handlers){
        if(handlers.onError){ audio.removeEventListener('error', handlers.onError); }
        if(handlers.endedHandler){ audio.removeEventListener('ended', handlers.endedHandler); }
      }
      audio.removeAttribute('src');
      try { audio.load(); } catch(_){ }
    }
  }

  global.StoryAudio = {
    parsePlayMusic,
    parseStopMusic,
    parsePlaySound,
    guardAllows,
    findActiveAudio,
    AudioController,
  };
})(typeof window !== 'undefined' ? window : globalThis);
