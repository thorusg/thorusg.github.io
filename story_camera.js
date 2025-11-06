(function(global){
  const SHAKE_RE = /^\[CameraShake(?:\(([^)]*)\))?\]/i;

  function cloneGuard(guard){
    if(!guard) return null;
    return { decisionId: guard.decisionId, allow: Array.isArray(guard.allow) ? [...guard.allow] : [] };
  }

  function parseParams(str){
    const out = Object.create(null);
    if(!str) return out;
    const re = /([a-z0-9_]+)\s*=\s*("[^"]*"|'[^']*'|[^,]+)/gi;
    let m;
    while((m = re.exec(str))){
      const k = (m[1]||'').toLowerCase();
      if(!k) continue;
      let v = m[2] != null ? String(m[2]).trim() : '';
      if((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))){ v = v.slice(1,-1); }
      out[k] = v;
    }
    return out;
  }

  function toNumber(value, def){
    if(value == null || value === '') return def;
    const n = Number(value);
    return Number.isFinite(n) ? n : def;
  }

  function parseCameraShake(raw, guard){
    if(!raw) return null;
    const m = SHAKE_RE.exec(raw);
    if(!m) return null;
    const p = parseParams(m[1] || '');
    return {
      type: 'camerashake',
      raw: raw.trim(),
      guard: cloneGuard(guard),
      duration: Math.max(0, toNumber(p.duration, 0.5)),
      xstrength: toNumber(p.xstrength, 8),
      ystrength: toNumber(p.ystrength, 10),
      vibrato: Math.max(0, toNumber(p.vibrato, 30)),
      randomness: Math.max(0, toNumber(p.randomness, 90)),
      fadeout: String(p.fadeout||'').toLowerCase() === 'true',
      block: String(p.block||'').toLowerCase() === 'true',
    };
  }

  class CameraShakeController{
    constructor(){
      this._active = [];
      this._raf = null;
    }
    // elements: array of HTMLElements to shake in sync
    shake(entry, elements){
      if(!entry || !elements || !elements.length) return;
      const dur = Number(entry.duration||0) || 0;
      if(dur <= 0) return;
      const xs = Number(entry.xstrength||0) || 0;
      const ys = Number(entry.ystrength||0) || 0;
      const vib = Math.max(0, Number(entry.vibrato||0) || 0);
      const rand = Math.max(0, Math.min(100, Number(entry.randomness||0) || 0));
      const fade = !!entry.fadeout;
      const start = performance.now();
      const ms = dur * 1000;
      const prevTransforms = new Map();
      for(const el of elements){
        if(!el || !el.style) continue;
        const inlineVal = el.style.transform || '';
        let computedVal = '';
        if(!inlineVal && typeof global.getComputedStyle === 'function'){
          try{
            const style = global.getComputedStyle(el);
            if(style){
              computedVal = style.transform || (typeof style.getPropertyValue === 'function' ? style.getPropertyValue('transform') : '') || '';
            }
          }catch{}
        }
        prevTransforms.set(el, { inline: inlineVal, computed: computedVal });
      }
      let lastTick = start;
      const step = (now) => {
        const t = now - start;
        const p = Math.min(1, t / ms);
        // throttle by vibrato if provided
        const minDelta = vib > 0 ? (1000 / vib) : 0;
        if(minDelta > 0 && now - lastTick < minDelta){
          this._raf = requestAnimationFrame(step);
          return;
        }
        lastTick = now;
        const amp = fade ? (1 - p) : 1;
        // randomness reduces correlation between axes; use it to skew distribution
        const rx = (Math.random()*2 - 1) * (1 - rand/100);
        const ry = (Math.random()*2 - 1) * (1 - rand/100);
        const dx = (Math.random()*2 - 1 + rx) * xs * amp;
        const dy = (Math.random()*2 - 1 + ry) * ys * amp;
        for(const el of elements){
          if(!el || !el.style) continue;
          const prev = prevTransforms.get(el) || { inline: '', computed: '' };
          const base = prev.inline && prev.inline !== 'none'
            ? prev.inline
            : (prev.computed && prev.computed !== 'none' ? prev.computed : '');
          const translation = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`;
          el.style.transform = base ? `${base} ${translation}` : translation;
        }
        if(p < 1){ this._raf = requestAnimationFrame(step); }
        else {
          for(const el of elements){
            if(!el || !el.style) continue;
            const prev = prevTransforms.get(el);
            if(prev && prev.inline != null && prev.inline !== ''){
              el.style.transform = prev.inline;
            } else {
              el.style.removeProperty('transform');
            }
          }
        }
      };
      if(this._raf){ try{ cancelAnimationFrame(this._raf);}catch{} }
      this._raf = requestAnimationFrame(step);
    }

    reset(elements){
      if(this._raf){ try{ cancelAnimationFrame(this._raf);}catch{} this._raf = null; }
      const list = Array.isArray(elements) ? elements : [];
      for(const el of list){
        if(el && el.style){
          try{ el.style.removeProperty('transform'); }catch{}
        }
      }
    }
  }

  global.StoryCamera = {
    parseCameraShake,
    CameraShakeController,
  };
})(typeof window !== 'undefined' ? window : globalThis);
