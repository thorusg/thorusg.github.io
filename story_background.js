(function(global){
  // Shared assets base; configurable via window.DATA_ASSETS set by app.js
  const ASSETS_BASE = (global && global.DATA_ASSETS ? String(global.DATA_ASSETS) : '/content/assets/').replace(/\/+$/, '');
  const EXT_PATTERN = /\.(png|jpe?g|gif|webp|bmp|avif)(?:$|[?#])/i;
  const ABS_PATTERN = /^(?:https?:|data:|\/)/i;

  function cloneGuard(guard){
    if(!guard) return null;
    return {
      decisionId: guard.decisionId,
      allow: Array.isArray(guard.allow) ? [...guard.allow] : [],
    };
  }

  function parseImageTag(raw, guard){
    if(!raw) return null;
    const match = raw.match(/^\[(Image|Background|ImageTween|BackgroundTween)(?:\(([^)]*)\))?\]/i);
    if(!match) return null;
    const tag = (match[1] || 'image').toLowerCase();
    const imageMatch = raw.match(/\bimage\s*=\s*"([^"]*)"/i) || raw.match(/\bimage\s*=\s*'([^']*)'/i);
    const tiledMatch = raw.match(/\btiled\s*=\s*(true|false|0|1)/i);
    const fadeMatch = raw.match(/\bfadetime\s*=\s*([-+]?\d*\.?\d+)/i);
    const blockMatch = raw.match(/\bblock\s*=\s*(true|false|0|1)/i);
    const widthMatch = raw.match(/\bwidth\s*=\s*([-+]?\d*\.?\d+)/i);
    const heightMatch = raw.match(/\bheight\s*=\s*([-+]?\d*\.?\d+)/i);
    // Tween-specific params
    const xFromMatch = raw.match(/\bxFrom\s*=\s*([-+]?\d*\.?\d+)/i);
    const yFromMatch = raw.match(/\byFrom\s*=\s*([-+]?\d*\.?\d+)/i);
    const xToMatch = raw.match(/\bxTo\s*=\s*([-+]?\d*\.?\d+)/i);
    const yToMatch = raw.match(/\byTo\s*=\s*([-+]?\d*\.?\d+)/i);
    const xScaleFromMatch = raw.match(/\bxScaleFrom\s*=\s*([-+]?\d*\.?\d+)/i);
    const yScaleFromMatch = raw.match(/\byScaleFrom\s*=\s*([-+]?\d*\.?\d+)/i);
    const xScaleToMatch = raw.match(/\bxScaleTo\s*=\s*([-+]?\d*\.?\d+)/i);
    const yScaleToMatch = raw.match(/\byScaleTo\s*=\s*([-+]?\d*\.?\d+)/i);
    // Plain Image positioning/scale
    const xMatch = raw.match(/\bx\s*=\s*([-+]?\d*\.?\d+)/i);
    const yMatch = raw.match(/\by\s*=\s*([-+]?\d*\.?\d+)/i);
    const xScaleMatch = raw.match(/\bxScale\s*=\s*([-+]?\d*\.?\d+)/i);
    const yScaleMatch = raw.match(/\byScale\s*=\s*([-+]?\d*\.?\d+)/i);
    const durationMatch = raw.match(/\bduration\s*=\s*([-+]?\d*\.?\d+)/i);
    const entry = {
      type: 'image',
      tag,
      raw: raw.trim(),
      guard: cloneGuard(guard),
    };
    entry.image = imageMatch && imageMatch[1] ? imageMatch[1].trim() : '';
    if(tiledMatch && tiledMatch[1]){
      entry.tiled = /^(?:true|1)$/i.test(tiledMatch[1]);
    }
    if(fadeMatch && fadeMatch[1]){
      const v = Number(fadeMatch[1]);
      entry.fadeTime = Number.isFinite(v) ? v : null;
    }
    if(blockMatch && blockMatch[1]){
      entry.block = /^(?:true|1)$/i.test(blockMatch[1]);
    }
    if(widthMatch && widthMatch[1]){
      const v = Number(widthMatch[1]);
      if(Number.isFinite(v)) entry.width = v;
    }
    if(heightMatch && heightMatch[1]){
      const v = Number(heightMatch[1]);
      if(Number.isFinite(v)) entry.height = v;
    }
    if(tag === 'imagetween' || tag === 'backgroundtween'){
      const num = (m) => (m && m[1] != null && Number.isFinite(Number(m[1])) ? Number(m[1]) : null);
      entry.duration = num(durationMatch);
      entry.xFrom = num(xFromMatch);
      entry.yFrom = num(yFromMatch);
      entry.xTo = num(xToMatch);
      entry.yTo = num(yToMatch);
      entry.xScaleFrom = num(xScaleFromMatch);
      entry.yScaleFrom = num(yScaleFromMatch);
      entry.xScaleTo = num(xScaleToMatch);
      entry.yScaleTo = num(yScaleToMatch);
    } else if(tag === 'image' || tag === 'background'){
      const num = (m) => (m && m[1] != null && Number.isFinite(Number(m[1])) ? Number(m[1]) : null);
      entry.x = num(xMatch);
      entry.y = num(yMatch);
      entry.xScale = num(xScaleMatch);
      entry.yScale = num(yScaleMatch);
    }
    return entry;
  }

  function parseBlockerTag(raw, guard){
    if(!raw) return null;
    const match = raw.match(/^\[Blocker(?:\(([^)]*)\))?\]/i);
    if(!match) return null;
    // numeric helper
    const num = (name, dflt) => {
      const re = new RegExp(`\\b${name}\\s*=\\s*([\"\']?)(-?[0-9]*\\.?[0-9]+)\\1`, 'i');
      const m = raw.match(re);
      if(!m) return dflt;
      const v = Number(m[2]);
      if(!Number.isFinite(v)) return dflt;
      if(name === 'r' || name === 'g' || name === 'b' || name === 'rfrom' || name === 'gfrom' || name === 'bfrom') {
        if(v >= 0 && v <= 1) {
          return v * 255;
        }
        return v;
      }
      return v;
    };
    const has = (name) => {
      const re = new RegExp(`\\b${name}\\s*=`, 'i');
      return re.test(raw);
    };
    const bool = (name, dflt) => {
      const m = raw.match(new RegExp(`\\b${name}\\s*=\\s*(true|false|0|1)`, 'i'));
      if(!m) return dflt;
      return /^(?:true|1)$/i.test(m[1]);
    };
    // Defaults per spec
    const rTo = Math.min(255, Math.max(0, Math.round(num('r', 255))));
    const gTo = Math.min(255, Math.max(0, Math.round(num('g', 255))));
    const bTo = Math.min(255, Math.max(0, Math.round(num('b', 255))));
    const aTo = Math.min(1, Math.max(0, num('a', 1)));
    const fromExplicit = has('afrom') || has('rfrom') || has('gfrom') || has('bfrom');
    const rFrom = Math.min(255, Math.max(0, Math.round(num('rfrom', fromExplicit ? 0 : 0))));
    const gFrom = Math.min(255, Math.max(0, Math.round(num('gfrom', fromExplicit ? 0 : 0))));
    const bFrom = Math.min(255, Math.max(0, Math.round(num('bfrom', fromExplicit ? 0 : 0))));
    const aFrom = Math.min(1, Math.max(0, num('afrom', fromExplicit ? 0 : 0)));
    const fade = num('fadetime', 1);
    const block = bool('block', false);
    return {
      type: 'blocker',
      raw: raw.trim(),
      guard: cloneGuard(guard),
      from: { r: rFrom, g: gFrom, b: bFrom, a: aFrom },
      to: { r: rTo, g: gTo, b: bTo, a: aTo },
      fadeTime: Number.isFinite(fade) ? fade : 1,
      block: !!block,
      fromExplicit,
    };
  }

  function parseCurtainTag(raw, guard){
    if(!raw) return null;
    const match = raw.match(/^\[Curtain(?:\(([^)]*)\))?\]/i);
    if(!match) return null;
    const params = match[1] || '';
    const getNum = (name, dflt) => {
      const re = new RegExp(`\\b${name}\\s*=\\s*([\"\']?)(-?[0-9]*\\.?[0-9]+)\\1`, 'i');
      const m = params.match(re);
      if(!m) return dflt;
      const v = Number(m[2]);
      return Number.isFinite(v) ? v : dflt;
    };
    const getBool = (name, dflt) => {
      const m = params.match(new RegExp(`\\b${name}\\s*=\\s*(true|false|0|1)`, 'i'));
      if(!m) return dflt;
      return /^(?:true|1)$/i.test(m[1]);
    };
    const direction = Math.trunc(getNum('direction', 0));
    const fillFrom = getNum('fillfrom', 0);
    const fillTo = getNum('fillto', 0);
    const fadeTime = getNum('fadetime', 0);
    const blockA = getBool('blocker', false);
    const blockB = getBool('block', false);
    return {
      type: 'curtain',
      direction,
      fillFrom,
      fillTo,
      fadeTime,
      block: !!(blockA || blockB),
      guard: cloneGuard(guard),
    };
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

  function findActiveBackground(dialogues, selections, target){
    if(!Array.isArray(dialogues) || !target) return null;
    const idx = dialogues.indexOf(target);
    if(idx < 0) return null;
    for(let i = idx; i >= 0; i--){
      const entry = dialogues[i];
      if(entry && entry.type === 'image' && guardAllows(entry.guard, selections)){
        return entry;
      }
    }
    return null;
  }

  class BackgroundController {
    constructor(options = {}){
      this.root = options.root || (global.document && global.document.body) || null;
      this.assetRoot = (options.assetRoot || `${ASSETS_BASE}/torappu/dynamicassets/avg`).replace(/\/+$/, '');
      this.imageDir = options.imageDir || 'images';
      this.backgroundDir = options.backgroundDir || 'backgrounds';
      this.defaultColor = options.defaultColor || '#000';
      this.currentKey = null;
      this._currentAssetKey = null; // image|tiled (no tag)
      this._pendingTweenTimer = null;
      this._pendingTweenIndex = -1;
      this._pendingImageTimer = null;
      this._pendingBgTimer = null;
      this._uiBlockUntil = 0;
      this._uiBlockTimer = null;
      this._currentBlockerRef = null;
      this._lastAppliedImageIndex = -1;
      this._lastImageParams = null;
      // Foreground image layers for [Image(...)] crossfade + block
      this.imageLayer = null;   // primary (index 0)
      this.imageInner = null;
      this.imageLayer2 = null;  // secondary (index 1)
      this.imageInner2 = null;
      this._imageActiveIndex = 0; // which layer currently active (showing)
      this._pendingImageSwapTimer = null;
      // Tween layer for [ImageTween(...)] separate from [Image]
      this.tweenLayer = null;
      this.tweenInner = null;
      // Background crossfade layer for [Background(...)] with fadetime
      this.bgLayer = null;
      this.bgInner = null;
      // Background tween layer for [BackgroundTween(...)]
      this.bgTweenLayer = null;
      this.bgTweenInner = null;
      this.bgTweenContent = null;
      // Fullscreen color overlay for [Blocker]
      this.blockerLayer = null;
      // Curtain layer for [Curtain]
      this.curtainLayer = null;
      this.curtainTop = null;
      this.curtainBottom = null;
      this.curtainLeft = null;
      this.curtainRight = null;
      if(this.root && global.document){
        // Background crossfade layer (below characters and image layer)
        const bgl = global.document.createElement('div');
        bgl.style.position = 'fixed';
        bgl.style.inset = '0';
        bgl.style.pointerEvents = 'none';
        bgl.style.opacity = '0';
        bgl.style.transition = 'opacity 0.25s ease';
        bgl.style.zIndex = '3'; // below image layers (4/5) and characters (6)
        const bgi = global.document.createElement('div');
        bgi.style.position = 'absolute';
        bgi.style.inset = '0';
        bgi.style.backgroundRepeat = 'no-repeat';
        bgi.style.backgroundPosition = 'center center';
        bgi.style.backgroundSize = 'contain';
        bgl.appendChild(bgi);
        this.root.appendChild(bgl);
        this.bgLayer = bgl;
        this.bgInner = bgi;
        // Background tween layer (immediately above bgLayer, below image layers)
        const bgtl = global.document.createElement('div');
        bgtl.style.position = 'fixed';
        bgtl.style.inset = '0';
        bgtl.style.pointerEvents = 'none';
        bgtl.style.opacity = '0';
        bgtl.style.transition = 'opacity 0.25s ease';
        bgtl.style.zIndex = '4'; // above bg (3), below image layers (4/5) created later
        const bgti = global.document.createElement('div');
        bgti.style.position = 'absolute';
        bgti.style.inset = '0';
        bgti.style.overflow = 'hidden';
        const bgtc = global.document.createElement('div');
        bgtc.style.position = 'absolute';
        bgtc.style.inset = '0';
        bgtc.style.backgroundRepeat = 'no-repeat';
        bgtc.style.backgroundPosition = 'center center';
        bgtc.style.backgroundSize = 'cover';
        bgtc.style.transformOrigin = 'center center';
        bgtc.style.transform = 'translate(0px, 0px) scale(1, 1)';
        bgtc.style.willChange = 'transform, opacity';
        bgti.appendChild(bgtc);
        bgtl.appendChild(bgti);
        this.root.appendChild(bgtl);
        this.bgTweenLayer = bgtl;
        this.bgTweenInner = bgti;
        this.bgTweenContent = bgtc;
        const layer = global.document.createElement('div');
        layer.style.position = 'fixed';
        layer.style.inset = '0';
        layer.style.pointerEvents = 'none';
        layer.style.opacity = '0';
        layer.style.transition = 'opacity 0.25s ease';
        layer.style.zIndex = '5'; // behind character-layer (6)
        const inner = global.document.createElement('div');
        inner.style.position = 'absolute';
        inner.style.inset = '0';
        inner.style.overflow = 'hidden';
        // Content element holds the actual background and transform so it can bleed outside viewport
        const innerContent = global.document.createElement('div');
        innerContent.style.position = 'absolute';
        innerContent.style.inset = '0';
        innerContent.style.backgroundRepeat = 'no-repeat';
        innerContent.style.backgroundPosition = 'center center';
        innerContent.style.backgroundSize = 'cover';
        innerContent.style.transformOrigin = 'center center';
        innerContent.style.transform = 'translate(0px, 0px) scale(1, 1)';
        innerContent.style.willChange = 'transform, opacity';
        inner.appendChild(innerContent);
        layer.appendChild(inner);
        this.root.appendChild(layer);
        this.imageLayer = layer;
        this.imageInner = inner;
        this.imageContent = innerContent;
        // secondary image layer for crossfade (starts hidden)
        const layer2 = global.document.createElement('div');
        layer2.style.position = 'fixed';
        layer2.style.inset = '0';
        layer2.style.pointerEvents = 'none';
        layer2.style.opacity = '0';
        layer2.style.transition = 'opacity 0.25s ease';
        layer2.style.zIndex = '4'; // under primary image layer (5), above bg layer (3)
        const inner2 = global.document.createElement('div');
        inner2.style.position = 'absolute';
        inner2.style.inset = '0';
        inner2.style.overflow = 'hidden';
        const innerContent2 = global.document.createElement('div');
        innerContent2.style.position = 'absolute';
        innerContent2.style.inset = '0';
        innerContent2.style.backgroundRepeat = 'no-repeat';
        innerContent2.style.backgroundPosition = 'center center';
        innerContent2.style.backgroundSize = 'cover';
        innerContent2.style.transformOrigin = 'center center';
        innerContent2.style.transform = 'translate(0px, 0px) scale(1, 1)';
        innerContent2.style.willChange = 'transform, opacity';
        inner2.appendChild(innerContent2);
        layer2.appendChild(inner2);
        this.root.appendChild(layer2);
        this.imageLayer2 = layer2;
        this.imageInner2 = inner2;
        this.imageContent2 = innerContent2;
        // blocker layer
        const blocker = global.document.createElement('div');
        blocker.style.position = 'fixed';
        blocker.style.inset = '0';
        blocker.style.pointerEvents = 'none';
        blocker.style.backgroundColor = 'rgba(0,0,0,0)';
        blocker.style.transition = 'background-color 0.25s linear';
        blocker.style.zIndex = '7'; // above characters (6), below vignette (8) and dialog (10)
        this.root.appendChild(blocker);
        this.blockerLayer = blocker;
        // curtain layer (above sprites, below dialog)
        const cur = global.document.createElement('div');
        cur.style.position = 'fixed';
        cur.style.inset = '0';
        cur.style.pointerEvents = 'none';
        cur.style.zIndex = '8'; // above characters (6), below blocker (9) and dialog (10)
        const topBar = global.document.createElement('div');
        topBar.style.position = 'absolute';
        topBar.style.left = '0';
        topBar.style.right = '0';
        topBar.style.top = '0';
        topBar.style.height = '0%';
        topBar.style.backgroundColor = '#000';
        const bottomBar = global.document.createElement('div');
        bottomBar.style.position = 'absolute';
        bottomBar.style.left = '0';
        bottomBar.style.right = '0';
        bottomBar.style.bottom = '0';
        bottomBar.style.height = '0%';
        bottomBar.style.backgroundColor = '#000';
        const leftBar = global.document.createElement('div');
        leftBar.style.position = 'absolute';
        leftBar.style.top = '0';
        leftBar.style.bottom = '0';
        leftBar.style.left = '0';
        leftBar.style.width = '0%';
        leftBar.style.backgroundColor = '#000';
        const rightBar = global.document.createElement('div');
        rightBar.style.position = 'absolute';
        rightBar.style.top = '0';
        rightBar.style.bottom = '0';
        rightBar.style.right = '0';
        rightBar.style.width = '0%';
        rightBar.style.backgroundColor = '#000';
        cur.appendChild(topBar);
        cur.appendChild(bottomBar);
        cur.appendChild(leftBar);
        cur.appendChild(rightBar);
        this.root.appendChild(cur);
        this.curtainLayer = cur;
        this.curtainTop = topBar;
        this.curtainBottom = bottomBar;
        this.curtainLeft = leftBar;
        this.curtainRight = rightBar;
        // tween layer (above bg, above characters). Place after image layers to sit on top
        const twl = global.document.createElement('div');
        twl.style.position = 'fixed';
        twl.style.inset = '0';
        twl.style.pointerEvents = 'none';
        twl.style.opacity = '0';
        twl.style.transition = 'opacity 0.25s ease';
        twl.style.zIndex = '6';
        const twi = global.document.createElement('div');
        twi.style.position = 'absolute';
        twi.style.inset = '0';
        twi.style.overflow = 'hidden';
        const twc = global.document.createElement('div');
        twc.style.position = 'absolute';
        twc.style.inset = '0';
        twc.style.backgroundRepeat = 'no-repeat';
        twc.style.backgroundPosition = 'center center';
        twc.style.backgroundSize = 'cover';
        twc.style.transformOrigin = 'center center';
        twc.style.transform = 'translate(0px, 0px) scale(1, 1)';
        twc.style.willChange = 'transform, opacity';
        twi.appendChild(twc);
        twl.appendChild(twi);
        this.root.appendChild(twl);
        this.tweenLayer = twl;
        this.tweenInner = twi;
        this.tweenContent = twc;
        this.apply(null);
      }
    }
    _readBodyBackground(){
      const out = { image: 'none', repeat: 'no-repeat', size: 'contain', position: 'center center' };
      try{
        const b = this.root || (global.document && global.document.body);
        if(!b) return out;
        const cs = global.getComputedStyle ? global.getComputedStyle(b) : null;
        if(cs){
          out.image = cs.backgroundImage || 'none';
          out.repeat = cs.backgroundRepeat || 'no-repeat';
          out.size = cs.backgroundSize || 'contain';
          out.position = cs.backgroundPosition || 'center center';
        }
      }catch{}
      return out;
    }
    reset(){
      if(this._pendingTweenTimer){ try{ clearTimeout(this._pendingTweenTimer); }catch{} this._pendingTweenTimer = null; }
      this._pendingTweenIndex = -1;
      if(this._pendingImageTimer){ try{ clearTimeout(this._pendingImageTimer); }catch{} this._pendingImageTimer = null; }
      if(this._pendingBgTimer){ try{ clearTimeout(this._pendingBgTimer); }catch{} this._pendingBgTimer = null; }
      if(this._pendingImageSwapTimer){ try{ clearTimeout(this._pendingImageSwapTimer); }catch{} this._pendingImageSwapTimer = null; }
      this.apply(null);
      this._currentBlockerRef = null;
      this._uiBlockUntil = 0;
      if(this._uiBlockTimer){ try{ clearTimeout(this._uiBlockTimer); }catch{} this._uiBlockTimer = null; }
      this._applyUiBlockState(false);
      // Ensure visual overlays are cleared immediately
      try{ this.applyBlocker(null); }catch{}
      try{ this.applyCurtain(null); }catch{}
      this._lastAppliedImageIndex = -1;
      // Reset curtain
      try{
        if(this.curtainTop){ this.curtainTop.style.transition = 'height 0.25s linear'; this.curtainTop.style.height = '0%'; }
        if(this.curtainBottom){ this.curtainBottom.style.transition = 'height 0.25s linear'; this.curtainBottom.style.height = '0%'; }
        if(this.curtainLeft){ this.curtainLeft.style.transition = 'width 0.25s linear'; this.curtainLeft.style.width = '0%'; }
        if(this.curtainRight){ this.curtainRight.style.transition = 'width 0.25s linear'; this.curtainRight.style.width = '0%'; }
      }catch{}
    }
    _assetKey(entry){
      if(!entry) return '__none__';
      // Use only image name for asset identity so [Image] and [ImageTween]
      // with differing tiled flags are still considered the same asset.
      const img = (entry.image || '').toLowerCase();
      return img;
    }
    resolveUrl(image, tag){
      if(!image) return '';
      let path = String(image).trim();
      if(!path) return '';
      path = path.replace(/\\+/g, '/');
      // Normalize filename segment to lowercase to tolerate script case variants
      const lowerLastSegment = (p) => {
        const clean = String(p || '').replace(/^\/+/, '');
        const idx = clean.lastIndexOf('/');
        if(idx < 0){ return clean.toLowerCase(); }
        const dir = clean.slice(0, idx);
        const file = clean.slice(idx + 1);
        return `${dir}/${file.toLowerCase()}`;
      };
      if(ABS_PATTERN.test(path)){
        // Respect absolute URL casing as-is
        return this.ensureExtension(path);
      }
      if(path.startsWith('./') || path.startsWith('../')){
        return this.ensureExtension(lowerLastSegment(path));
      }
      const normalized = path.replace(/^\/+/, '');
      const normalizedLower = lowerLastSegment(normalized);
      if(normalizedLower.includes('/')){
        return this.ensureExtension(`${this.assetRoot}/${normalizedLower}`);
      }
      const isBackground = (tag === 'background' || tag === 'backgroundtween');
      const dirs = isBackground
        ? [this.backgroundDir, this.imageDir]
        : [this.imageDir, this.backgroundDir];
      for(const dir of dirs){
        if(!dir) continue;
        const candidate = `${this.assetRoot}/${dir.replace(/\\+/g, '/')}/${normalizedLower}`;
        return this.ensureExtension(candidate);
      }
      return this.ensureExtension(`${this.assetRoot}/${normalizedLower}`);
    }
    ensureExtension(path){
      if(/^data:/i.test(path)) return path;
      if(EXT_PATTERN.test(path)) return path;
      return `${path}.png`;
    }
    _toRgba(c){
      const r = Math.min(255, Math.max(0, Math.round(c && c.r != null ? c.r : 0)));
      const g = Math.min(255, Math.max(0, Math.round(c && c.g != null ? c.g : 0)));
      const b = Math.min(255, Math.max(0, Math.round(c && c.b != null ? c.b : 0)));
      const a = Math.min(1, Math.max(0, Number(c && c.a != null ? c.a : 0)));
      return `rgba(${r},${g},${b},${a})`;
    }
    _readCurrentBlockerColor(){
      try{
        if(!global.document || !this.blockerLayer) return { r:0,g:0,b:0,a:0 };
        const cs = global.getComputedStyle ? global.getComputedStyle(this.blockerLayer) : null;
        const s = cs ? cs.backgroundColor : (this.blockerLayer.style && this.blockerLayer.style.backgroundColor) || '';
        const m = String(s||'').match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9\.]+))?\)/i);
        if(m){
          const r = Number(m[1])||0; const g = Number(m[2])||0; const b = Number(m[3])||0; const a = m[4] != null ? Number(m[4]) : 1;
          return { r, g, b, a };
        }
      }catch{}
      return { r:0,g:0,b:0,a:0 };
    }
    _readCurrentTransform(){
      try{
        const inner = (this._activeImageContent && this._activeImageContent()) || this.imageContent || this.imageInner;
        const t = String(inner && inner.style && inner.style.transform || '');
        const m = t.match(/translate\(([-0-9\.]+)px,\s*([-0-9\.]+)px\)\s*scale\(([-0-9\.]+),\s*([-0-9\.]+)\)/);
        if(m){
          return { tx: Number(m[1])||0, ty: Number(m[2])||0, sx: Number(m[3])||1, sy: Number(m[4])||1 };
        }
      }catch{}
      return { tx: 0, ty: 0, sx: 1, sy: 1 };
    }
    _readTransformOf(el){
      try{
        const t = String(el && el.style && el.style.transform || '');
        const m = t.match(/translate\(([-0-9\.]+)px,\s*([-0-9\.]+)px\)\s*scale\(([-0-9\.]+),\s*([-0-9\.]+)\)/);
        if(m){
          return { tx: Number(m[1])||0, ty: Number(m[2])||0, sx: Number(m[3])||1, sy: Number(m[4])||1 };
        }
      }catch{}
      return { tx: 0, ty: 0, sx: 1, sy: 1 };
    }
    _getImageLayer(idx){ return idx === 1 ? this.imageLayer2 : this.imageLayer; }
    _getImageInner(idx){ return idx === 1 ? this.imageInner2 : this.imageInner; }
    _getImageContent(idx){ return idx === 1 ? this.imageContent2 : this.imageContent; }
    _activeImageInner(){ return this._getImageInner(this._imageActiveIndex); }
    _activeImageContent(){ return this._getImageContent(this._imageActiveIndex); }
    _inactiveIndex(){ return this._imageActiveIndex === 0 ? 1 : 0; }
    applyTweenOnly(entry){
      if(!entry || !this.imageInner) return;
      const dur = Number(entry.duration||0) || 0;
      const curT = this._readCurrentTransform();
      const sx0 = (entry.xScaleFrom != null ? Number(entry.xScaleFrom) : curT.sx) || 1;
      const sy0 = (entry.yScaleFrom != null ? Number(entry.yScaleFrom) : curT.sy) || sx0;
      const sx1 = (entry.xScaleTo != null ? Number(entry.xScaleTo) : sx0) || sx0;
      const sy1 = (entry.yScaleTo != null ? Number(entry.yScaleTo) : sy0) || sy0;
      const tx0 = (entry.xFrom != null ? Number(entry.xFrom) : curT.tx) || 0;
      const ty0 = (entry.yFrom != null ? -Number(entry.yFrom) : curT.ty) || 0;
      const tx1 = (entry.xTo != null ? Number(entry.xTo) : tx0);
      const ty1 = (entry.yTo != null ? -Number(entry.yTo) : ty0);
      const inner = this._activeImageContent();
      if(!inner) return;
      const minS = Math.max(0.0001, Math.min(sx0, sy0, sx1, sy1));
      const overscan = minS < 1 ? (1 / minS) : 1;
      inner.style.transition = dur > 0 ? `transform ${dur}s linear` : '';
      inner.style.transform = `translate(${tx0}px, ${ty0}px) scale(${sx0 * overscan}, ${sy0 * overscan})`;
      requestAnimationFrame(()=>{
        if(!inner) return;
        inner.style.transform = `translate(${tx1}px, ${ty1}px) scale(${sx1 * overscan}, ${sy1 * overscan})`;
      });
    }
  apply(entry){
      const root = this.root;
      if(!root) return;
      if(this._pendingBgTimer){ try{ clearTimeout(this._pendingBgTimer); }catch{} this._pendingBgTimer = null; }
      // Compute key; ignore 'tiled' for [Image] so toggling it has no effect
      const tag = entry && entry.tag ? String(entry.tag).toLowerCase() : '';
      const isImageTag = tag === 'image';
      const isTweenTag = tag === 'imagetween';
      const isBgTweenTag = tag === 'backgroundtween';
      const isBgTag = tag === 'background';
      const tileFlag = (tag === 'image') ? 'f' : (entry && entry.tiled ? 't' : 'f');
      const key = entry ? `${entry.image || ''}|${tileFlag}|${tag}` : '__none__';
      // If the same image is being reapplied, still allow transform-only updates for [Image]
      if(this.currentKey === key){
        if(isImageTag){
          const content = this._activeImageContent();
          if(content){
            const tx = (entry.x != null ? Number(entry.x) : 0) || 0;
            const yParam = (entry.y != null ? Number(entry.y) : null);
            const ty = (yParam != null ? -yParam : 0);
            const sx = (entry.xScale != null ? Number(entry.xScale) : 1) || 1;
            const sy = (entry.yScale != null ? Number(entry.yScale) : sx) || sx;
            try { content.style.transition = ''; } catch{}
            try { content.style.transform = `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`; } catch{}
            // Keep last params in script domain for tween base
            this._lastImageParams = { x: tx, y: (yParam != null ? yParam : 0), xScale: sx, yScale: sy };
          }
        } else if(isBgTag){
          // Allow transform-only updates for [Background] reapply on the same asset
          const inner = this.bgInner;
          if(inner){
            const tx = (entry.x != null ? Number(entry.x) : 0) || 0;
            const yParam = (entry.y != null ? Number(entry.y) : null);
            const ty = (yParam != null ? -yParam : 0); // invert script Y
            const sx = (entry.xScale != null ? Number(entry.xScale) : 1) || 1;
            const sy = (entry.yScale != null ? Number(entry.yScale) : sx) || sx;
            try { inner.style.transition = ''; } catch{}
            try {
              inner.style.transformOrigin = 'center center';
              inner.style.transform = `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;
            } catch{}
          }
        }
        return;
      }
      this.currentKey = key;
      this._currentAssetKey = this._assetKey(entry);
      // tag already computed above
      const fadeSec = entry && Number.isFinite(entry.fadeTime) ? Number(entry.fadeTime) : (entry && entry.fadeTime != null ? Number(entry.fadeTime) : null);
      const fade = Number.isFinite(fadeSec) && fadeSec > 0 ? fadeSec : 0;
      // If no entry is provided (e.g., on level change/reset), clear overlay and background
      if(!entry){
        root.style.backgroundColor = this.defaultColor;
        root.style.backgroundImage = 'none';
        root.style.backgroundRepeat = 'no-repeat';
        root.style.backgroundSize = 'contain';
        root.style.backgroundPosition = 'center center';
        this._lastImageParams = null;
        if(this._pendingImageSwapTimer){ try{ clearTimeout(this._pendingImageSwapTimer);}catch{} this._pendingImageSwapTimer = null; }
        if(this.imageLayer){ this.imageLayer.style.opacity = '0'; this.imageLayer.style.transition = 'opacity 0.25s ease'; }
        if(this.imageContent){ this.imageContent.style.backgroundImage = 'none'; this.imageContent.style.transform = 'translate(0px, 0px) scale(1, 1)'; this.imageContent.style.transition = ''; }
        if(this.imageLayer2){ this.imageLayer2.style.opacity = '0'; this.imageLayer2.style.transition = 'opacity 0.25s ease'; }
        if(this.imageContent2){ this.imageContent2.style.backgroundImage = 'none'; this.imageContent2.style.transform = 'translate(0px, 0px) scale(1, 1)'; this.imageContent2.style.transition = ''; }
        if(this.tweenLayer){ this.tweenLayer.style.opacity = '0'; this.tweenLayer.style.transition = 'opacity 0.25s ease'; }
        if(this.tweenContent){ this.tweenContent.style.backgroundImage = 'none'; this.tweenContent.style.transform = 'translate(0px, 0px) scale(1, 1)'; this.tweenContent.style.transition = ''; }
        if(this.bgTweenLayer){ this.bgTweenLayer.style.opacity = '0'; this.bgTweenLayer.style.transition = 'opacity 0.25s ease'; }
        if(this.bgTweenContent){ this.bgTweenContent.style.backgroundImage = 'none'; this.bgTweenContent.style.transform = 'translate(0px, 0px) scale(1, 1)'; this.bgTweenContent.style.transition = ''; }
        this._imageActiveIndex = 0;
        if(this.bgLayer){ this.bgLayer.style.opacity = '0'; }
        if(this.bgInner){ this.bgInner.style.backgroundImage = 'none'; this.bgInner.style.transform = 'translate(0px, 0px) scale(1, 1)'; this.bgInner.style.transition = ''; }
        return;
      }
      if(entry && entry.image){
        const url = this.resolveUrl(entry.image, entry.tag);
        if(isImageTag && (this.imageLayer && this.imageLayer2)){
          // Foreground image crossfade between two layers (only for [Image])
          const toIdx = this._inactiveIndex();
          const fromIdx = this._imageActiveIndex;
          const toLayer = this._getImageLayer(toIdx);
          const toInner = this._getImageInner(toIdx);
          const toContent = this._getImageContent(toIdx);
          const fromLayer = this._getImageLayer(fromIdx);
          const fromInner = this._getImageInner(fromIdx);
          const fromContent = this._getImageContent(fromIdx);
          // configure target layer
          toLayer.style.transition = `opacity ${fade || 0.25}s ease`;
          toContent.style.backgroundImage = `url('${url}')`;
          // Ignore 'tiled' for [Image]: always no-repeat and cover
          toContent.style.backgroundRepeat = 'no-repeat';
          toContent.style.backgroundSize = 'cover';
          // Ensure transforms for plain [Image] from provided x/y/xScale/yScale
          // Script coordinates: positive Y is up. Convert to CSS by negating Y.
          if(!isTweenTag){
            const tx = (entry.x != null ? Number(entry.x) : 0) || 0;
            const yParam = (entry.y != null ? Number(entry.y) : null);
            const ty = (yParam != null ? -yParam : 0);
            const sx = (entry.xScale != null ? Number(entry.xScale) : 1) || 1;
            const sy = (entry.yScale != null ? Number(entry.yScale) : sx) || sx;
            toContent.style.transition = '';
            toContent.style.transform = `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;
            // Store last params in script domain so subsequent tweens inherit correctly
            this._lastImageParams = { x: tx, y: (yParam != null ? yParam : 0), xScale: sx, yScale: sy };
          }
          // stack order: show new above old
          toLayer.style.zIndex = '5';
          fromLayer.style.zIndex = '4';
          // block UI during fade if requested
          // UI hide for [Image] fades is managed by app.js; avoid duplicate toggles here
          // Start crossfade
          toLayer.style.opacity = '0';
          requestAnimationFrame(()=>{
            try{ void(toLayer && toLayer.offsetWidth); }catch{}
            if(toLayer){ toLayer.style.opacity = '1'; }
          });
          // schedule swap completion
          if(this._pendingImageSwapTimer){ try{ clearTimeout(this._pendingImageSwapTimer); }catch{} this._pendingImageSwapTimer = null; }
          const done = () => {
            // clear old layer and make new the active
            if(fromLayer){ fromLayer.style.opacity = '0'; }
            if(fromContent){ fromContent.style.backgroundImage = 'none'; fromContent.style.transition = ''; fromContent.style.transform = 'translate(0px, 0px) scale(1, 1)'; }
            // keep top z-index on active
            toLayer.style.zIndex = '6';
            this._imageActiveIndex = toIdx;
          };
          if(fade > 0){ this._pendingImageSwapTimer = setTimeout(()=>{ this._pendingImageSwapTimer = null; done(); }, fade * 1000); }
          else { done(); }
          // If tween requested, also animate scale/position on the target inner
          if(isTweenTag && toContent){
            const toFinite = (value) => {
              if(value == null) return null;
              const n = typeof value === 'number' ? value : Number(value);
              return Number.isFinite(n) ? n : null;
            };
            const pickFinite = (...values) => {
              for(let i = 0; i < values.length; i++){
                const n = toFinite(values[i]);
                if(n != null) return n;
              }
              return null;
            };
            const dur = Number(entry.duration||0) || 0;
            const priorTransform = this._readTransformOf(fromContent);
            const baseParams = entry._baseParams || null;
          // Only inherit from previous [Image] params. If missing there too, default to 1.
          const startScaleX = pickFinite(entry.xScaleFrom, baseParams && baseParams.xScale, 1);
          const startScaleY = pickFinite(entry.yScaleFrom, baseParams && baseParams.yScale, startScaleX, 1);
            const endScaleX = pickFinite(entry.xScaleTo, startScaleX);
            const endScaleY = pickFinite(entry.yScaleTo, startScaleY, endScaleX);
          // Only inherit from previous [Image] params. If missing there too, default to 0.
          const startX = pickFinite(entry.xFrom, baseParams && baseParams.x, 0);
            const endX = pickFinite(entry.xTo, startX);
          const baseYParam = toFinite(baseParams && baseParams.y);
          const fallbackY = 0;
            const startYParam = entry.yFrom != null ? toFinite(entry.yFrom) : baseYParam;
            const startYCss = entry.yFrom != null
              ? (startYParam != null ? -startYParam : fallbackY)
              : (baseYParam != null ? baseYParam : fallbackY);
            const endYParam = entry.yTo != null ? toFinite(entry.yTo)
              : (entry.yFrom != null ? startYParam : baseYParam);
            let endYCss;
            if(entry.yTo != null){
              endYCss = endYParam != null ? -endYParam : (entry.yFrom != null ? startYCss : fallbackY);
            } else if(entry.yFrom != null){
              endYCss = startYCss;
            } else {
              endYCss = endYParam != null ? endYParam : startYCss;
            }
            const minS = Math.max(0.0001, Math.min(startScaleX, startScaleY, endScaleX, endScaleY));
            const overscan = minS < 1 ? (1 / minS) : 1;
            toContent.style.transition = dur > 0 ? `transform ${dur}s linear` : '';
            toContent.style.transform = `translate(${startX}px, ${startYCss}px) scale(${startScaleX * overscan}, ${startScaleY * overscan})`;
            requestAnimationFrame(()=>{
              if(!toContent) return;
              toContent.style.transform = `translate(${endX}px, ${endYCss}px) scale(${endScaleX * overscan}, ${endScaleY * overscan})`;
            });
            const finalXParam = endX != null ? endX : startX;
            const finalYParam = endYParam != null ? endYParam : (startYParam != null ? startYParam : (baseYParam != null ? baseYParam : fallbackY));
            const finalScaleXParam = endScaleX != null ? endScaleX : startScaleX;
            let finalScaleYParam = endScaleY != null ? endScaleY : startScaleY;
            if(finalScaleYParam == null) finalScaleYParam = finalScaleXParam;
            this._lastImageParams = {
              x: finalXParam,
              y: finalYParam != null ? finalYParam : 0,
              xScale: finalScaleXParam != null ? finalScaleXParam : 1,
              yScale: finalScaleYParam != null ? finalScaleYParam : (finalScaleXParam != null ? finalScaleXParam : 1),
            };
          }
        } else if(isTweenTag && this.tweenLayer && this.tweenInner){
          // Render [ImageTween] on dedicated tween layer (above background, below sprites)
          const layer = this.tweenLayer;
          const inner = this.tweenContent;
          const fadeDur = fade || 0;
          // prepare tween content
          inner.style.backgroundImage = `url('${url}')`;
          // Ignore 'tiled' for ImageTween: always non-repeating, contain sizing
          inner.style.backgroundRepeat = 'no-repeat';
          inner.style.backgroundSize = 'cover';
          // optional fade-in
          layer.style.transition = `opacity ${fadeDur}s ease`;
          layer.style.opacity = '0';
          // UI hide handled by app.js
          requestAnimationFrame(()=>{ layer && (layer.style.opacity = '1'); });
          // Hide still image layers after a short delay to avoid flicker
          try{ setTimeout(()=>{ try{ if(this.imageLayer){ this.imageLayer.style.opacity = '0'; } if(this.imageLayer2){ this.imageLayer2.style.opacity = '0'; } }catch{} }, 250); }catch{}
          // Apply tween transform on tween inner
          const dur = Number(entry.duration||0) || 0;
          const toFinite = (value) => {
            if(value == null) return null;
            const n = typeof value === 'number' ? value : Number(value);
            return Number.isFinite(n) ? n : null;
          };
          const pickFinite = (...values) => {
            for(let i = 0; i < values.length; i++){
              const n = toFinite(values[i]);
              if(n != null) return n;
            }
            return null;
          };
          const baseParams = entry._baseParams || null;
          const startScaleX = pickFinite(entry.xScaleFrom, baseParams && baseParams.xScale, 1);
          const startScaleY = pickFinite(entry.yScaleFrom, baseParams && baseParams.yScale, startScaleX, 1);
          const endScaleX = pickFinite(entry.xScaleTo, startScaleX);
          const endScaleY = pickFinite(entry.yScaleTo, startScaleY, endScaleX);
          const startX = pickFinite(entry.xFrom, baseParams && baseParams.x, 0);
          const endX = pickFinite(entry.xTo, startX);
          const baseYParam = toFinite(baseParams && baseParams.y);
          const fallbackY = 0;
          const startYParam = entry.yFrom != null ? toFinite(entry.yFrom) : baseYParam;
          // Background invert: when falling back to base y, flip sign for CSS
          const baseYCss = (baseYParam != null ? -baseYParam : fallbackY);
          const startYCss = entry.yFrom != null
            ? (startYParam != null ? -startYParam : fallbackY)
            : baseYCss;
          const endYParam = entry.yTo != null ? toFinite(entry.yTo)
            : (entry.yFrom != null ? startYParam : baseYParam);
          let endYCss;
          if(entry.yTo != null){
            endYCss = endYParam != null ? -endYParam : (entry.yFrom != null ? startYCss : fallbackY);
          } else if(entry.yFrom != null){
            endYCss = startYCss;
          } else {
            endYCss = (endYParam != null ? -endYParam : startYCss);
          }
          const minS2 = Math.max(0.0001, Math.min(startScaleX, startScaleY, endScaleX, endScaleY));
          const overscan2 = minS2 < 1 ? (1 / minS2) : 1;
          // Ensure browser registers initial transform before animating
          inner.style.transition = '';
          inner.style.transform = `translate(${startX}px, ${startYCss}px) scale(${startScaleX * overscan2}, ${startScaleY * overscan2})`;
          try{ void (inner.offsetWidth); }catch{}
          inner.style.transition = dur > 0 ? `transform ${dur}s linear` : '';
          requestAnimationFrame(()=>{
            if(!inner) return;
            inner.style.transform = `translate(${endX}px, ${endYCss}px) scale(${endScaleX * overscan2}, ${endScaleY * overscan2})`;
          });
          const finalXParam = endX != null ? endX : startX;
          const finalYParam = endYParam != null ? endYParam : (startYParam != null ? startYParam : (baseYParam != null ? baseYParam : fallbackY));
          const finalScaleXParam = endScaleX != null ? endScaleX : startScaleX;
          let finalScaleYParam = endScaleY != null ? endScaleY : startScaleY;
          if(finalScaleYParam == null) finalScaleYParam = finalScaleXParam;
          this._lastImageParams = {
            x: finalXParam,
            y: finalYParam != null ? finalYParam : 0,
            xScale: finalScaleXParam != null ? finalScaleXParam : 1,
            yScale: finalScaleYParam != null ? finalScaleYParam : (finalScaleXParam != null ? finalScaleXParam : 1),
          };
        } else if(isBgTweenTag && this.bgTweenLayer && this.bgTweenInner){
          // Render [BackgroundTween] on dedicated background tween layer (above bg, below images)
          const layer = this.bgTweenLayer;
          const inner = this.bgTweenContent;
          const fadeDur = fade || 0;
          // prepare tween content
          inner.style.backgroundImage = `url('${url}')`;
          // Ignore 'tiled' for BackgroundTween: always non-repeating, cover sizing
          inner.style.backgroundRepeat = 'no-repeat';
          inner.style.backgroundSize = 'cover';
          // optional fade-in
          layer.style.transition = `opacity ${fadeDur}s ease`;
          layer.style.opacity = '0';
          requestAnimationFrame(()=>{ layer && (layer.style.opacity = '1'); });
          // Hide still background layer after a short delay to avoid flicker
          try{ setTimeout(()=>{ try{ if(this.bgLayer){ this.bgLayer.style.opacity = '0'; } }catch{} }, 250); }catch{}
          // Apply tween transform on bg tween inner using ImageTween precedence rules
          const dur = Number(entry.duration||0) || 0;
          const toFinite = (value) => {
            if(value == null) return null;
            const n = typeof value === 'number' ? value : Number(value);
            return Number.isFinite(n) ? n : null;
          };
          const pickFinite = (...values) => {
            for(let i = 0; i < values.length; i++){
              const n = toFinite(values[i]);
              if(n != null) return n;
            }
            return null;
          };
          const baseParams = entry._baseParams || null;
          const startScaleX = pickFinite(entry.xScaleFrom, baseParams && baseParams.xScale, 1);
          const startScaleY = pickFinite(entry.yScaleFrom, baseParams && baseParams.yScale, startScaleX, 1);
          const endScaleX = pickFinite(entry.xScaleTo, startScaleX);
          const endScaleY = pickFinite(entry.yScaleTo, startScaleY, endScaleX);
          const startX = pickFinite(entry.xFrom, baseParams && baseParams.x, 0);
          const endX = pickFinite(entry.xTo, startX);
          const baseYParam = toFinite(baseParams && baseParams.y);
          const fallbackY = 0;
          const startYParam = entry.yFrom != null ? toFinite(entry.yFrom) : baseYParam;
          const startYCss = entry.yFrom != null
            ? (startYParam != null ? -startYParam : fallbackY)
            : (baseYParam != null ? baseYParam : fallbackY);
          const endYParam = entry.yTo != null ? toFinite(entry.yTo)
            : (entry.yFrom != null ? startYParam : baseYParam);
          let endYCss;
          if(entry.yTo != null){
            endYCss = endYParam != null ? -endYParam : (entry.yFrom != null ? startYCss : fallbackY);
          } else if(entry.yFrom != null){
            endYCss = startYCss;
          } else {
            endYCss = endYParam != null ? endYParam : startYCss;
          }
          const minSbg = Math.max(0.0001, Math.min(startScaleX, startScaleY, endScaleX, endScaleY));
          const overscanBg = minSbg < 1 ? (1 / minSbg) : 1;
          // Commit initial state, then animate
          inner.style.transition = '';
          inner.style.transform = `translate(${startX}px, ${startYCss}px) scale(${startScaleX * overscanBg}, ${startScaleY * overscanBg})`;
          try{ void (inner.offsetWidth); }catch{}
          inner.style.transition = dur > 0 ? `transform ${dur}s linear` : '';
          requestAnimationFrame(()=>{ if(inner){ inner.style.transform = `translate(${endX}px, ${endYCss}px) scale(${endScaleX * overscanBg}, ${endScaleY * overscanBg})`; } });
        } else {
          // Background image: keep it on the dedicated bgLayer so camera effects (e.g., grayscale)
          // can target and affect it. Do not commit to document.body background.
          if(this.bgLayer && this.bgInner){
            // Ensure body uses default color and no background image
            root.style.backgroundColor = this.defaultColor;
            root.style.backgroundImage = 'none';
          // Configure background layer content
          this.bgInner.style.backgroundImage = url ? `url('${url}')` : 'none';
          this.bgInner.style.backgroundRepeat = entry.tiled ? 'repeat' : 'no-repeat';
          this.bgInner.style.backgroundSize = entry.tiled ? 'auto' : 'contain';
          this.bgInner.style.backgroundPosition = 'center center';
          // Apply transform from [Background] params (invert Y)
          try{
            const tx = (entry.x != null ? Number(entry.x) : 0) || 0;
            const yParam = (entry.y != null ? Number(entry.y) : null);
            const ty = (yParam != null ? -yParam : 0);
            const sx = (entry.xScale != null ? Number(entry.xScale) : 1) || 1;
            const sy = (entry.yScale != null ? Number(entry.yScale) : sx) || sx;
            this.bgInner.style.transition = '';
            this.bgInner.style.transformOrigin = 'center center';
            this.bgInner.style.transform = `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;
          }catch{}
          // Apply fade if requested
          const fadeDur = fade || 0;
          this.bgLayer.style.transition = `opacity ${fadeDur}s ease`;
          // Start from 0 only when fading; otherwise snap visible
          if(fadeDur > 0){ this.bgLayer.style.opacity = '0'; }
          requestAnimationFrame(()=>{ if(this.bgLayer){ this.bgLayer.style.opacity = '1'; } });
          // Also clear any active BackgroundTween overlay using the same fade
          if(this.bgTweenLayer){
            try{
              this.bgTweenLayer.style.transition = `opacity ${fadeDur}s ease`;
              this.bgTweenLayer.style.opacity = '0';
              if(this.bgTweenContent){
                if(fadeDur > 0){
                  setTimeout(()=>{
                    try{
                      this.bgTweenContent.style.backgroundImage = 'none';
                      this.bgTweenContent.style.transform = 'translate(0px, 0px) scale(1, 1)';
                      this.bgTweenContent.style.transition = '';
                    }catch{}
                  }, fadeDur * 1000);
                } else {
                  this.bgTweenContent.style.backgroundImage = 'none';
                  this.bgTweenContent.style.transform = 'translate(0px, 0px) scale(1, 1)';
                  this.bgTweenContent.style.transition = '';
                }
              }
            }catch{}
          }
        } else {
          // Fallback: set on body if no layer was created (unlikely)
          root.style.backgroundColor = this.defaultColor;
          root.style.backgroundImage = url ? `url('${url}')` : 'none';
          root.style.backgroundRepeat = entry.tiled ? 'repeat' : 'no-repeat';
          root.style.backgroundSize = entry.tiled ? 'auto' : 'contain';
          root.style.backgroundPosition = 'center center';
          // Also clear BackgroundTween layer if present (no bgLayer fade available)
          if(this.bgTweenLayer){
            try{
              const fadeDur = fade || 0;
              this.bgTweenLayer.style.transition = `opacity ${fadeDur}s ease`;
              this.bgTweenLayer.style.opacity = '0';
              if(this.bgTweenContent){
                if(fadeDur > 0){
                  setTimeout(()=>{
                    try{
                      this.bgTweenContent.style.backgroundImage = 'none';
                      this.bgTweenContent.style.transform = 'translate(0px, 0px) scale(1, 1)';
                      this.bgTweenContent.style.transition = '';
                    }catch{}
                  }, fadeDur * 1000);
                } else {
                  this.bgTweenContent.style.backgroundImage = 'none';
                  this.bgTweenContent.style.transform = 'translate(0px, 0px) scale(1, 1)';
                  this.bgTweenContent.style.transition = '';
                }
              }
            }catch{}
          }
        }
        }
      } else if(isTweenTag && this.tweenLayer && this.tweenInner){
        // ImageTween with no image: copy current [Image] layer content and animate it
        // Pick the topmost visible [Image] inner (considering z-index and opacity)
        const candidates = [
          { inner: this.imageContent, layer: this.imageLayer },
          { inner: this.imageContent2, layer: this.imageLayer2 },
        ];
        let srcInner = null;
        let bg = '';
        let bestScore = -Infinity;
        for(const c of candidates){
          const cand = c && c.inner;
          const layer = c && c.layer;
          if(!cand || !layer) continue;
          let val = '';
          try{
            val = (cand.style && cand.style.backgroundImage) || '';
            if((!val || val === 'none') && global.getComputedStyle){
              const cs = global.getComputedStyle(cand);
              val = cs && cs.backgroundImage || '';
            }
          }catch{}
          if(!val || val === 'none') continue;
          let z = 0, op = 0;
          try{
            const zraw = (layer.style && layer.style.zIndex) || (global.getComputedStyle ? global.getComputedStyle(layer).zIndex : '') || '0';
            z = Number(parseInt(zraw, 10)); if(!Number.isFinite(z)) z = 0;
            const opraw = (layer.style && layer.style.opacity) || (global.getComputedStyle ? global.getComputedStyle(layer).opacity : '') || '0';
            op = Number(parseFloat(opraw)); if(!Number.isFinite(op)) op = 0;
          }catch{}
          const score = (op * 1000) + z; // prefer higher opacity, then z-index
          if(score > bestScore){ bestScore = score; srcInner = cand; bg = val; }
        }
        if(!bg || bg === 'none'){
          // Nothing to animate; treat as no-op (do not clear existing image)
          return;
        }
        const layer = this.tweenLayer;
        const inner = this.tweenContent;
        const fadeDur = fade || 0;
        // Prefer base snapshot URL if provided on entry, else copy computed bg
        if(entry._baseImageUrl){
          inner.style.backgroundImage = `url('${entry._baseImageUrl}')`;
        } else {
          inner.style.backgroundImage = bg; // copy as-is
        }
        inner.style.backgroundRepeat = 'no-repeat';
        inner.style.backgroundSize = 'cover';
        layer.style.transition = `opacity ${fadeDur}s ease`;
        layer.style.opacity = '0';
        // UI hide handled by app.js
        requestAnimationFrame(()=>{ layer && (layer.style.opacity = '1'); });
        // Hide still image layers after a short delay to avoid flicker
        try{ setTimeout(()=>{ try{ if(this.imageLayer){ this.imageLayer.style.opacity = '0'; } if(this.imageLayer2){ this.imageLayer2.style.opacity = '0'; } }catch{} }, 250); }catch{}
        // Apply tween transform
        const dur = Number(entry.duration||0) || 0;
        const toFinite = (value) => {
          if(value == null) return null;
          const n = typeof value === 'number' ? value : Number(value);
          return Number.isFinite(n) ? n : null;
        };
        const pickFinite = (...values) => {
          for(let i = 0; i < values.length; i++){
            const n = toFinite(values[i]);
            if(n != null) return n;
          }
          return null;
        };
        const cur = this._readTransformOf(srcInner);
        const baseT = entry._baseTransform || null;
        const transform = baseT || cur;
        const baseParams = entry._baseParams || null;
        // Only inherit from previous [Image] params. If missing there too, default to 1.
        const startScaleX = pickFinite(entry.xScaleFrom, baseParams && baseParams.xScale, 1);
        const startScaleY = pickFinite(entry.yScaleFrom, baseParams && baseParams.yScale, startScaleX, 1);
        const endScaleX = pickFinite(entry.xScaleTo, startScaleX);
        const endScaleY = pickFinite(entry.yScaleTo, startScaleY, endScaleX);
        // Only inherit from previous [Image] params. If missing there too, default to 0.
        const startX = pickFinite(entry.xFrom, baseParams && baseParams.x, 0);
        const endX = pickFinite(entry.xTo, startX);
        const baseYParam = toFinite(baseParams && baseParams.y);
        const fallbackY = 0;
        const startYParam = entry.yFrom != null ? toFinite(entry.yFrom) : baseYParam;
        const startYCss = entry.yFrom != null
          ? (startYParam != null ? -startYParam : fallbackY)
          : (baseYParam != null ? baseYParam : fallbackY);
        const endYParam = entry.yTo != null ? toFinite(entry.yTo)
          : (entry.yFrom != null ? startYParam : baseYParam);
        let endYCss;
        if(entry.yTo != null){
          endYCss = endYParam != null ? -endYParam : (entry.yFrom != null ? startYCss : fallbackY);
        } else if(entry.yFrom != null){
          endYCss = startYCss;
        } else {
          endYCss = endYParam != null ? endYParam : startYCss;
        }
        // Ensure browser registers initial transform before animating
        inner.style.transition = '';
        const minS = Math.max(0.0001, Math.min(startScaleX, startScaleY, endScaleX, endScaleY));
        const overscan = minS < 1 ? (1 / minS) : 1;
        inner.style.transform = `translate(${startX}px, ${startYCss}px) scale(${startScaleX * overscan}, ${startScaleY * overscan})`;
        // Force reflow to commit initial state
        try{ void (inner.offsetWidth); }catch{}
        inner.style.transition = dur > 0 ? `transform ${dur}s linear` : '';
        requestAnimationFrame(()=>{
          if(!inner) return;
          inner.style.transform = `translate(${endX}px, ${endYCss}px) scale(${endScaleX * overscan}, ${endScaleY * overscan})`;
        });
        const finalXParam = endX != null ? endX : startX;
        const finalYParam = endYParam != null ? endYParam : (startYParam != null ? startYParam : (baseYParam != null ? baseYParam : fallbackY));
        const finalScaleXParam = endScaleX != null ? endScaleX : startScaleX;
        let finalScaleYParam = endScaleY != null ? endScaleY : startScaleY;
        if(finalScaleYParam == null) finalScaleYParam = finalScaleXParam;
        this._lastImageParams = {
          x: finalXParam,
          y: finalYParam != null ? finalYParam : 0,
          xScale: finalScaleXParam != null ? finalScaleXParam : 1,
          yScale: finalScaleYParam != null ? finalScaleYParam : (finalScaleXParam != null ? finalScaleXParam : 1),
        };
      } else if(isBgTweenTag && this.bgTweenLayer && this.bgTweenInner){
        // BackgroundTween with no image: copy current [Background] layer content and animate it
        // Source is bgInner
        const srcInner = this.bgInner;
        let bg = '';
        try{
          bg = (srcInner && srcInner.style && srcInner.style.backgroundImage) || '';
          if((!bg || bg === 'none') && global.getComputedStyle){
            const cs = global.getComputedStyle(srcInner);
            bg = cs && cs.backgroundImage || '';
          }
        }catch{}
        if(!bg || bg === 'none'){
          // Nothing to animate; treat as no-op
          return;
        }
        const layer = this.bgTweenLayer;
        const inner = this.bgTweenContent;
        const fadeDur = fade || 0;
        if(entry._baseImageUrl){
          inner.style.backgroundImage = `url('${entry._baseImageUrl}')`;
        } else {
          inner.style.backgroundImage = bg;
        }
        inner.style.backgroundRepeat = 'no-repeat';
        inner.style.backgroundSize = 'cover';
        layer.style.transition = `opacity ${fadeDur}s ease`;
        layer.style.opacity = '0';
        requestAnimationFrame(()=>{ layer && (layer.style.opacity = '1'); });
        // Hide still bg layer after a short delay
        try{ setTimeout(()=>{ try{ if(this.bgLayer){ this.bgLayer.style.opacity = '0'; } }catch{} }, 250); }catch{}
        // Apply tween transform using base [Background] params only (no computed transform fallback)
        const dur = Number(entry.duration||0) || 0;
        const toFinite = (value) => {
          if(value == null) return null;
          const n = typeof value === 'number' ? value : Number(value);
          return Number.isFinite(n) ? n : null;
        };
        const pickFinite = (...values) => {
          for(let i = 0; i < values.length; i++){
            const n = toFinite(values[i]);
            if(n != null) return n;
          }
          return null;
        };
        const baseParams = entry._baseParams || null;
        const startScaleX = pickFinite(entry.xScaleFrom, baseParams && baseParams.xScale, 1);
        const startScaleY = pickFinite(entry.yScaleFrom, baseParams && baseParams.yScale, startScaleX, 1);
        const endScaleX = pickFinite(entry.xScaleTo, startScaleX);
        const endScaleY = pickFinite(entry.yScaleTo, startScaleY, endScaleX);
        const startX = pickFinite(entry.xFrom, baseParams && baseParams.x, 0);
        const endX = pickFinite(entry.xTo, startX);
        const baseYParam = toFinite(baseParams && baseParams.y);
        const fallbackY = 0;
        const startYParam = entry.yFrom != null ? toFinite(entry.yFrom) : baseYParam;
        // Background invert: when falling back to base y, flip sign for CSS
        const baseYCss = (baseYParam != null ? -baseYParam : fallbackY);
        const startYCss = entry.yFrom != null
          ? (startYParam != null ? -startYParam : fallbackY)
          : baseYCss;
        const endYParam = entry.yTo != null ? toFinite(entry.yTo)
          : (entry.yFrom != null ? startYParam : baseYParam);
        let endYCss;
        if(entry.yTo != null){
          endYCss = endYParam != null ? -endYParam : (entry.yFrom != null ? startYCss : fallbackY);
        } else if(entry.yFrom != null){
          endYCss = startYCss;
        } else {
          endYCss = (endYParam != null ? -endYParam : startYCss);
        }
        inner.style.transition = '';
        const minS = Math.max(0.0001, Math.min(startScaleX, startScaleY, endScaleX, endScaleY));
        const overscan = minS < 1 ? (1 / minS) : 1;
        inner.style.transform = `translate(${startX}px, ${startYCss}px) scale(${startScaleX * overscan}, ${startScaleY * overscan})`;
        try{ void (inner.offsetWidth); }catch{}
        inner.style.transition = dur > 0 ? `transform ${dur}s linear` : '';
        requestAnimationFrame(()=>{ inner && (inner.style.transform = `translate(${endX}px, ${endYCss}px) scale(${endScaleX * overscan}, ${endScaleY * overscan})`); });
      } else {
        // Clear
        if(tag === 'background' && this.bgLayer && this.bgInner && fade > 0){
          // Fade-out current bgLayer background to clear/default
          try{
            this.bgLayer.style.transition = `opacity ${fade}s ease`;
            // Ensure we are visible before starting fade out
            this.bgLayer.style.opacity = '1';
            requestAnimationFrame(()=>{
              try{ void(this.bgLayer && this.bgLayer.offsetWidth); }catch{}
              if(this.bgLayer){ this.bgLayer.style.opacity = '0'; }
            });
            this._pendingBgTimer = setTimeout(()=>{
              this._pendingBgTimer = null;
              if(this.bgInner){ this.bgInner.style.backgroundImage = 'none'; this.bgInner.style.transform = 'translate(0px, 0px) scale(1, 1)'; this.bgInner.style.transition = ''; }
              // Keep body clear
              root.style.backgroundImage = 'none';
            }, Math.max(0, fade) * 1000);
          }catch{}
        } else if((isImageTag || isTweenTag) && (this.imageLayer && this.imageLayer2)){
          const fadeDur = fade || 0.25;
          const l0 = this._getImageLayer(0), i0 = this._getImageContent(0);
          const l1 = this._getImageLayer(1), i1 = this._getImageContent(1);
          l0.style.transition = `opacity ${fadeDur}s ease`;
          l1.style.transition = `opacity ${fadeDur}s ease`;
          if(fade > 0){
            l0.style.opacity = '0'; l1.style.opacity = '0';
            setTimeout(()=>{ if(i0){ i0.style.backgroundImage = 'none'; } if(i1){ i1.style.backgroundImage = 'none'; } }, fade * 1000);
          } else {
            l0.style.opacity = '0'; l1.style.opacity = '0';
            if(i0){ i0.style.backgroundImage = 'none'; } if(i1){ i1.style.backgroundImage = 'none'; }
          }
          this._lastImageParams = null;
          this._imageActiveIndex = 0;
          if(this.tweenLayer){ this.tweenLayer.style.transition = `opacity ${fadeDur}s ease`; this.tweenLayer.style.opacity = '0'; }
          if(this.tweenContent){
            if(fade > 0){
              setTimeout(()=>{ if(this.tweenContent){ this.tweenContent.style.backgroundImage = 'none'; this.tweenContent.style.transform = 'translate(0px, 0px) scale(1, 1)'; this.tweenContent.style.transition = ''; } }, fade * 1000);
            } else {
              this.tweenContent.style.backgroundImage = 'none';
              this.tweenContent.style.transform = 'translate(0px, 0px) scale(1, 1)';
              this.tweenContent.style.transition = '';
            }
          }
        } else if(isBgTweenTag && this.bgTweenLayer){
          const fadeDur = fade || 0.25;
          this.bgTweenLayer.style.transition = `opacity ${fadeDur}s ease`;
          this.bgTweenLayer.style.opacity = '0';
          if(this.bgTweenContent){
            if(fade > 0){
              setTimeout(()=>{ if(this.bgTweenContent){ this.bgTweenContent.style.backgroundImage = 'none'; this.bgTweenContent.style.transform = 'translate(0px, 0px) scale(1, 1)'; this.bgTweenContent.style.transition = ''; } }, fade * 1000);
            } else {
              this.bgTweenContent.style.backgroundImage = 'none';
              this.bgTweenContent.style.transform = 'translate(0px, 0px) scale(1, 1)';
              this.bgTweenContent.style.transition = '';
            }
          }
        } else {
          root.style.backgroundColor = this.defaultColor;
          root.style.backgroundImage = 'none';
          root.style.backgroundRepeat = 'no-repeat';
          root.style.backgroundSize = 'contain';
          if(this.bgLayer){ this.bgLayer.style.opacity = '0'; }
        }
      }
    }
    applyBlocker(entry){
      const layer = this.blockerLayer;
      if(!layer){ return; }
      if(!entry){
        layer.style.transition = 'background-color 0.25s linear';
        layer.style.backgroundColor = 'rgba(0,0,0,0)';
        this._currentBlockerRef = null;
        return;
      }
      if(this._currentBlockerRef === entry){ return; }
      const fade = Number(entry.fadeTime)||1;
      // set start color immediately, then animate to end
      try{
        layer.style.transition = '';
        const start = (entry.fromExplicit ? entry.from : this._readCurrentBlockerColor());
        layer.style.backgroundColor = this._toRgba(start);
        // block UI during fade if requested
        // UI hide handled by app.js
        // Record end time so subsequent image changes can respect the gate
        this._blockerGateUntil = Date.now() + (Math.max(0, fade) * 1000);
        requestAnimationFrame(()=>{
          layer.style.transition = `background-color ${fade}s linear`;
          layer.style.backgroundColor = this._toRgba(entry.to);
        });
        this._currentBlockerRef = entry;
      }catch{}
    }
    applyCurtain(entry){
      const layer = this.curtainLayer;
      if(!layer || !this.curtainTop || !this.curtainBottom || !this.curtainLeft || !this.curtainRight){ return; }
      if(!entry){
        try{
          this.curtainTop.style.transition = 'height 0.25s linear';
          this.curtainTop.style.height = '0%';
          this.curtainBottom.style.transition = 'height 0.25s linear';
          this.curtainBottom.style.height = '0%';
          this.curtainLeft.style.transition = 'width 0.25s linear';
          this.curtainLeft.style.width = '0%';
          this.curtainRight.style.transition = 'width 0.25s linear';
          this.curtainRight.style.width = '0%';
        }catch{}
        return;
      }
      const dir = Math.trunc(Number(entry.direction||0)) || 0;
      const from = Math.max(0, Math.min(1, Number(entry.fillFrom||0) || 0));
      const to = Math.max(0, Math.min(1, Number(entry.fillTo||0) || 0));
      const fade = Math.max(0, Number(entry.fadeTime||0) || 0);
      // 0: bottom, 4: top, 2: left, 6: right
      let target = this.curtainBottom;
      let prop = 'height';
      if(dir === 4){ target = this.curtainTop; prop = 'height'; }
      else if(dir === 2){ target = this.curtainLeft; prop = 'width'; }
      else if(dir === 6){ target = this.curtainRight; prop = 'width'; }
      try{
        target.style.transition = '';
        if(prop === 'height'){
          target.style.height = `${from * 100}%`;
        } else {
          target.style.width = `${from * 100}%`;
        }
        requestAnimationFrame(()=>{
          target.style.transition = `${prop} ${fade}s linear`;
          if(prop === 'height'){
            target.style.height = `${to * 100}%`;
          } else {
            target.style.width = `${to * 100}%`;
          }
        });
      }catch{}
      // UI hide handled by app.js via planTransition when block=true
    }
    _applyUiBlockState(active){
      if(!global.document) return;
      const delayActive = this._isDelayGateActive();
      const effective = !!(active || delayActive);
      const current = global.document.getElementById('current');
      const controls = global.document.getElementById('controls');
      const nameEl = current ? (current.querySelector('.name') || global.document.getElementById('currentName')) : null;
      const dialogEl = current ? current.querySelector('.dialog') : null;
      const prev = global.document.getElementById('prevBtn');
      const next = global.document.getElementById('nextBtn');
      const log = global.document.getElementById('logBtn');
      const vis = effective ? 'hidden' : '';
      if(nameEl) nameEl.style.visibility = vis;
      if(dialogEl) dialogEl.style.visibility = vis;
      if(controls) controls.style.visibility = vis;
      if(prev) prev.disabled = effective;
      if(next) next.disabled = effective;
      if(log) log.disabled = effective;
    }
    _isDelayGateActive(){
      try{
        const b = global.document && global.document.body;
        if(!b) return false;
        if(b.dataset && b.dataset.uiDelay === '1') return true;
        if(b.classList && b.classList.contains('ui-delay')) return true;
      }catch{}
      return false;
    }
    blockUI(seconds){
      const dur = Number(seconds)||0; if(dur<=0) return;
      const now = Date.now();
      const until = now + dur*1000;
      if(until > this._uiBlockUntil){ this._uiBlockUntil = until; }
      // Apply active state immediately
      this._applyUiBlockState(true);
      // Reschedule a single timer to lift the block at the furthest until
      if(this._uiBlockTimer){ try{ clearTimeout(this._uiBlockTimer); }catch{} this._uiBlockTimer = null; }
      const delay = Math.max(0, this._uiBlockUntil - Date.now());
      this._uiBlockTimer = setTimeout(()=>{
        this._uiBlockTimer = null;
        // Check if still within block window due to later calls
        const remain = this._uiBlockUntil - Date.now();
        if(remain > 10){ // still blocked; reschedule
          const d = Math.max(0, remain);
          this._uiBlockTimer = setTimeout(()=>{ this._applyUiBlockState(false); this._uiBlockUntil = 0; }, d);
        } else {
          this._applyUiBlockState(false);
          this._uiBlockUntil = 0;
        }
      }, delay);
    }
    applyFor(dialogues, selections, target){
      // Apply blocker overlay independent of image/tween
      try{
        const idx = dialogues.indexOf(target);
        let blk = null;
        for(let i=idx; i>=0; i--){
          const e = dialogues[i];
          if(e && e.type==='blocker' && guardAllows(e.guard, selections)){ blk = e; break; }
        }
        if(blk && blk !== this._currentBlockerRef){ this.applyBlocker(blk); }
      }catch{}
      // Default active entry by scanning back from target
      const entry = findActiveBackground(dialogues, selections, target);
      if(!entry){ this.apply(null); return; }
      const tag = String(entry.tag||'').toLowerCase();
      // If a Blocker with positive fade exists after the previous image change,
      // defer applying any subsequent image/background change until the fade ends.
      try{
        const idx = dialogues.indexOf(target);
        // find last blocker at or before idx
        let blk = null, blkIdx = -1;
        for(let i=idx; i>=0; i--){
          const e = dialogues[i];
          if(e && e.type==='blocker' && guardAllows(e.guard, selections)){ blk = e; blkIdx = i; break; }
        }
        const fade = blk && Number.isFinite(Number(blk.fadeTime)) ? Number(blk.fadeTime) : 0;
        if(blk && fade > 0){
          // find last image at or before idx (the candidate we're about to apply)
          let imgAfterIdx = -1;
          for(let i=idx; i>=0; i--){ const e = dialogues[i]; if(e && e.type==='image' && guardAllows(e.guard, selections)){ imgAfterIdx = i; break; } }
          if(imgAfterIdx > blkIdx){
            // find image before blocker to keep visible during fade
            let imgBefore = null, imgBeforeIdx = -1;
            for(let i=blkIdx-1; i>=0; i--){ const e = dialogues[i]; if(e && e.type==='image' && guardAllows(e.guard, selections)){ imgBefore = e; imgBeforeIdx = i; break; } }
            // Only re-show placeholder if it's newer than what we've already applied
            if(imgBefore && imgBeforeIdx > this._lastAppliedImageIndex){
              this.apply(imgBefore);
              this._lastAppliedImageIndex = imgBeforeIdx;
            }
            if(this._pendingImageTimer){ try{ clearTimeout(this._pendingImageTimer); }catch{} this._pendingImageTimer = null; }
            const delayedEntry = dialogues[imgAfterIdx];
            const remaining = this._blockerGateUntil ? Math.max(0, this._blockerGateUntil - Date.now()) : Math.max(0, fade*1000);
            if(remaining <= 0){
              this.apply(delayedEntry);
              this._lastAppliedImageIndex = imgAfterIdx;
            } else {
              this._pendingImageTimer = setTimeout(()=>{
                this._pendingImageTimer = null;
                this.apply(delayedEntry);
                this._lastAppliedImageIndex = imgAfterIdx;
              }, remaining);
            }
            return; // do not apply 'entry' yet
          }
        }
      }catch{}
      // If the active entry is an ImageTween and there is a preceding Image
      // with a positive fadetime for the same asset, wait for that fadetime
      // before starting the tween so the fade is visible.
      if(tag === 'imagetween' || tag === 'backgroundtween'){
        try{
          const idx = dialogues.indexOf(entry);
          let base = null;
          for(let i=idx-1; i>=0 && !base; i--){
            const e = dialogues[i];
            const bt = String(e.tag||'').toLowerCase();
            if(e && e.type==='image' && guardAllows(e.guard, selections)){
              if(tag === 'imagetween' && bt==='image'){ base = e; break; }
              if(tag === 'backgroundtween' && bt==='background'){ base = e; break; }
            }
          }
          // Attach base params from the immediately preceding Image/Background
          if(base){
            const toNum = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
            entry._baseParams = {
              x: toNum(base.x),
              y: toNum(base.y),
              xScale: toNum(base.xScale),
              yScale: toNum(base.yScale),
            };
          }
          const fade = base && Number.isFinite(Number(base.fadeTime)) ? Number(base.fadeTime) : 0;
          const sameAsset = base && (this._assetKey(base) === this._assetKey(entry));
          if(base && sameAsset && fade > 0){
            // Apply base with fade, then schedule tween
            this.apply(base);
            if(this._pendingTweenTimer){ try{ clearTimeout(this._pendingTweenTimer); }catch{} this._pendingTweenTimer = null; }
            const expectedAssetKey = this._assetKey(base);
            // Capture base snapshot for no-image tween
            try{
              entry._baseImageUrl = this.resolveUrl(base.image, base.tag);
              const sx = (base.xScale != null ? Number(base.xScale) : 1) || 1;
              const sy = (base.yScale != null ? Number(base.yScale) : sx) || sx;
              const tx = (base.x != null ? Number(base.x) : 0) || 0;
              const ty = (base.y != null ? Number(base.y) : 0) || 0;
              entry._baseTransform = { tx, ty, sx, sy };
              // Also attach explicit base params for tween precedence
              entry._baseParams = {
                x: Number.isFinite(tx) ? tx : null,
                y: Number.isFinite(ty) ? ty : null,
                xScale: Number.isFinite(sx) ? sx : null,
                yScale: Number.isFinite(sy) ? sy : null,
              };
            }catch{}
            const remaining = this._blockerGateUntil ? Math.max(0, this._blockerGateUntil - Date.now()) : Math.max(0, fade*1000);
            if(remaining <= 0){
              if(this._currentAssetKey === expectedAssetKey){ this.apply(entry); }
            } else {
              this._pendingTweenTimer = setTimeout(()=>{
                this._pendingTweenTimer = null;
                if(this._currentAssetKey === expectedAssetKey){ this.apply(entry); }
              }, remaining);
            }
            return;
          }
        }catch{}
      }
      // Otherwise just apply the active entry
      this.apply(entry);
      try{ const i = dialogues.indexOf(entry); if(i >= 0) this._lastAppliedImageIndex = i; }catch{}
    }
  }

  global.StoryBackground = {
    parseImageTag,
    parseBlockerTag,
    parseCurtainTag,
    guardAllows,
    findActiveBackground,
    BackgroundController,
  };
})(typeof window !== 'undefined' ? window : globalThis);







