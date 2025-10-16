(function(global){
  const EFFECT_RE = /^\[CameraEffect(?:\(([^)]*)\))?\]/i;

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

  function clamp01(v){
    const n = Number(v);
    if(!Number.isFinite(n)) return 0;
    if(n <= 0) return 0;
    if(n >= 1) return 1;
    return n;
  }

  function parseCameraEffect(raw, guard){
    if(!raw) return null;
    const m = EFFECT_RE.exec(raw);
    if(!m) return null;
    const p = parseParams(m[1] || '');
    return {
      type: 'cameraeffect',
      raw: raw.trim(),
      guard: cloneGuard(guard),
      effect: String(p.effect||'').trim(),
      keep: String(p.keep||'').toLowerCase() === 'true',
      fadeTime: Math.max(0, toNumber(p.fadetime, 0)),
      initAmount: (p.initamount != null ? clamp01(toNumber(p.initamount, 0)) : null),
      amount: (p.amount != null ? clamp01(toNumber(p.amount, 0)) : (p.amout != null ? clamp01(toNumber(p.amout, 0)) : null)),
      block: String(p.block||'').toLowerCase() === 'true',
    };
  }

  class EffectsController{
    constructor(){
      this._state = { grayscale: 0 };
      this._anim = null;
    }
    _applyToElements(elements){
      const g = clamp01(this._state.grayscale);
      const filter = g > 0 ? `grayscale(${g})` : '';
      for(const el of (elements||[])){
        if(!el || !el.style) continue;
        el.style.filter = filter;
      }
    }
    _cancel(){
      if(this._anim){
        cancelAnimationFrame(this._anim);
        this._anim = null;
      }
    }
    apply(entry, elements){
      if(!entry || entry.type !== 'cameraeffect') return;
      const eff = String(entry.effect||'').toLowerCase();
      if(eff !== 'grayscale'){ return; }
      if(entry.initAmount != null){ this._state.grayscale = clamp01(entry.initAmount); }
      const target = (entry.amount != null ? clamp01(entry.amount) : this._state.grayscale);
      const ft = Number(entry.fadeTime||0) || 0;
      if(ft <= 0){
        this._cancel();
        this._state.grayscale = target;
        this._applyToElements(elements);
        return;
      }
      const start = performance.now();
      const ms = ft * 1000;
      const from = this._state.grayscale;
      const step = (now) => {
        const p = Math.min(1, (now - start) / ms);
        const val = from + (target - from) * p;
        this._state.grayscale = clamp01(val);
        this._applyToElements(elements);
        if(p < 1){ this._anim = requestAnimationFrame(step); }
        else { this._anim = null; }
      };
      this._cancel();
      this._anim = requestAnimationFrame(step);
    }

    reset(elements){
      if(this._anim){ try{ cancelAnimationFrame(this._anim);}catch{} this._anim = null; }
      this._state.grayscale = 0;
      this._applyToElements(Array.isArray(elements) ? elements : []);
    }
  }

  global.StoryEffects = {
    parseCameraEffect,
    EffectsController,
  };
})(typeof window !== 'undefined' ? window : globalThis);
