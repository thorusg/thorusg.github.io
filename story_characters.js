(function(global){
  // Shared assets base; configurable via window.DATA_ASSETS set by app.js
  const ASSETS_BASE = (global && global.DATA_ASSETS ? String(global.DATA_ASSETS) : '/content/assets/').replace(/\/+$/, '');
  const PARAM_RE = /([a-z0-9_]+)\s*=\s*("[^"]*"|'[^']*'|[^,]+)/gi;

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
    let match;
    while((match = PARAM_RE.exec(str))){
      const key = match[1] ? match[1].toLowerCase() : '';
      if(!key) continue;
      let value = match[2] != null ? String(match[2]).trim() : '';
      if((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))){
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
    return out;
  }

  function parsePoint(value){
    if(value == null) return null;
    let v = String(value).trim();
    if(!v) return null;
    const parts = v.split(/[,\s]+/).filter(Boolean);
    if(!parts.length) return null;
    const xVal = Number(parts[0]);
    const yVal = Number(parts.length > 1 ? parts[1] : '0');
    return {
      x: Number.isFinite(xVal) ? xVal : 0,
      y: Number.isFinite(yVal) ? yVal : 0,
    };
  }

  function toNumber(value, fallback){
    if(value == null || value === '') return fallback;
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
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

  function normalizeCharacterName(name){
    if(!name) return '';
    let out = String(name).trim();
    if(!out) return '';
    if(!out.includes('#')){
      out += '#1';
    }
    if(!out.includes('$')){
      out += '$1';
    }
    if(out.toLowerCase().endsWith('.png')){
      return out.toLowerCase();
    }
    return out.toLowerCase();
  }

  function encodePath(path){
    return path
      .split('/')
      .map(segment => encodeURIComponent(segment))
      .join('/');
  }

  function buildSources(name, options = {}){
    if(!name) return null;
    let file = normalizeCharacterName(name);
    const hasExt = /\.(png|webp|avif)$/i.test(file);
    const filename = hasExt ? file : `${file}.png`;
    const encoded = encodePath(filename.replace(/^\/+/, ''));
    const primaryBase = (options.primaryBase || `${ASSETS_BASE}/avg/characters`).replace(/\/+$/, '');
    const fallbacks = Array.isArray(options.fallbackBases)
      ? options.fallbackBases
      : [`${ASSETS_BASE}/torappu/dynamicassets/avg/characters`, `${ASSETS_BASE}/torappu/dynamicassets/arts/charavatars`];
    const bases = [primaryBase, ...fallbacks];
    const seen = new Set();
    const sources = [];
    for(const base of bases){
      if(!base) continue;
      const cleanBase = base.replace(/\/+$/, '');
      const url = `${cleanBase}/${encoded}`;
      if(seen.has(url)) continue;
      seen.add(url);
      sources.push(url);
    }
    if(!sources.length) return null;
    return { key: filename.toLowerCase(), sources };
  }

  function parseCharacterTag(raw, guard){
    if(!raw) return null;
    const trimmed = raw.trim();
    if(!/^\[Character/i.test(trimmed)) return null;
    const start = trimmed.indexOf('(');
    const end = trimmed.lastIndexOf(')');
    const body = start >= 0 && end > start ? trimmed.slice(start + 1, end) : '';
    const params = parseParams(body);
    const entry = {
      type: 'character',
      raw: trimmed,
      guard: cloneGuard(guard),
      name: params.name || '',
      name2: params.name2 || '',
      name3: params.name3 || '',
      focus: params.focus != null ? Number(params.focus) : null,
      fadeTime: toNumber(params.fadetime, null),
      options: params,
    };
    entry.clear = !entry.name && !entry.name2 && !entry.name3;
    return entry;
  }

  // Parse [Dialog(...)] markers. Used as a visual cue to hide sprites
  function parseDialogTag(raw, guard){
    if(!raw) return null;
    const trimmed = raw.trim();
    if(!/^\[Dialog/i.test(trimmed)) return null;
    return { type: 'dialog', raw: trimmed, guard: cloneGuard(guard) };
  }

  // Per-slot sprite directive: [charslot(slot="l|r|m", name="...", duration=1.5, focus="l|r|m", isblock=true|false)]
  function parseCharSlotTag(raw, guard){
    if(!raw) return null;
    const trimmed = raw.trim();
    if(!/^\[charslot/i.test(trimmed)) return null;
    const start = trimmed.indexOf('(');
    const end = trimmed.lastIndexOf(')');
    const body = start >= 0 && end > start ? trimmed.slice(start + 1, end) : '';
    const params = parseParams(body);
    const slotRaw = (params.slot || '').toLowerCase();
    let slot = null;
    if(slotRaw === 'l' || slotRaw === 'left') slot = 'left';
    else if(slotRaw === 'r' || slotRaw === 'right') slot = 'right';
    else if(slotRaw === 'm' || slotRaw === 'c' || slotRaw === 'center' || slotRaw === 'mid' || slotRaw === 'main') slot = 'center';
    const name = params.name || '';
    // Focus can be multiple, e.g. "l,r" meaning dim only the remaining slot(s)
    const focusTokensRaw = String(params.focus || '').trim();
    let focusMulti = null;
    if(focusTokensRaw){
      const tokens = focusTokensRaw.split(/[\s,]+/).filter(Boolean).map(t=>t.toLowerCase());
      const list = [];
      for(const t of tokens){
        let v = null;
        if(t === 'l' || t === 'left') v = 'left';
        else if(t === 'r' || t === 'right') v = 'right';
        else if(t === 'm' || t === 'c' || t === 'center' || t === 'mid' || t === 'main') v = 'center';
        else if(t === 'all') { if(!list.includes('left')) list.push('left'); if(!list.includes('right')) list.push('right'); if(!list.includes('center')) list.push('center'); continue; }
        if(v && !list.includes(v)) list.push(v);
      }
      focusMulti = list.length ? list : null;
    }
    const dur = params.duration != null ? Number(params.duration) : (params.fadetime != null ? Number(params.fadetime) : null);
    const duration = Number.isFinite(dur) ? dur : null;
    const actionRaw = (params.action || '').toLowerCase();
    const action = actionRaw ? actionRaw : null;
    const powerRaw = params.power != null ? Number(params.power) : null;
    const timesRaw = params.times != null ? Number(params.times) : null;
    let posFrom = params.posfrom != null ? parsePoint(params.posfrom) : null;
    let posTo = params.posto != null ? parsePoint(params.posto) : null;
    // Invert Y-axis semantics for motion: negative Y moves down, positive moves up
    if(posFrom){ posFrom = { x: posFrom.x, y: -posFrom.y }; }
    if(posTo){ posTo = { x: posTo.x, y: -posTo.y }; }
    // Zoom-specific params
    const posZoomRaw = params.poszoom != null ? parsePoint(params.poszoom) : null; // 0..1 in both axes
    const zoomPivot = posZoomRaw ? { x: posZoomRaw.x, y: posZoomRaw.y } : null;
    const zoomScaleRaw = params.scale != null ? Number(params.scale) : null;
    const zoomScale = Number.isFinite(zoomScaleRaw) ? zoomScaleRaw : null;
    // Opacity tween params
    const aFromRaw = params.afrom != null ? Number(params.afrom) : null;
    const aToRaw = params.ato != null ? Number(params.ato) : null;
    const alphaFrom = Number.isFinite(aFromRaw) ? Math.max(0, Math.min(1, aFromRaw)) : null;
    const alphaTo = Number.isFinite(aToRaw) ? Math.max(0, Math.min(1, aToRaw)) : null;
    // Marker, currently unused but kept for completeness
    const endRaw = (params.end || '').toString().toLowerCase();
    const endMark = endRaw === 'true' || endRaw === '1';
    // Support optional blocking/gating flag
    const isBlockRaw = (params.isblock != null) ? String(params.isblock).trim().toLowerCase() : '';
    const isBlock = (isBlockRaw === '1' || isBlockRaw === 'true' || isBlockRaw === 'yes');

    const entry = {
      type: 'charslot',
      raw: trimmed,
      guard: cloneGuard(guard),
      slot,
      name,
      duration,
      focus: null,
    };
    entry.isBlock = isBlock;
    entry.action = action;
    entry.actionPower = Number.isFinite(powerRaw) ? powerRaw : null;
    entry.actionTimes = Number.isFinite(timesRaw) ? timesRaw : null;
    entry.motion = (posFrom || posTo) ? { from: posFrom, to: posTo } : null;
    entry.zoomPivot = zoomPivot;
    entry.zoomScale = zoomScale;
    entry.alphaFrom = alphaFrom;
    entry.alphaTo = alphaTo;
    entry.end = endMark;
    // Directive-only when there is no name but there are effects/motion to apply to existing sprite
    entry.hasDirective = !name && !!(entry.action || entry.motion || zoomPivot || (zoomScale != null) || (alphaFrom != null) || (alphaTo != null));
    // Effects present regardless of whether a name is set (used to also apply after showing sprite)
    entry.hasEffects = !!(entry.action || entry.motion || zoomPivot || (zoomScale != null) || (alphaFrom != null) || (alphaTo != null));
    entry.focusMulti = focusMulti;
    // Empty [charslot] is a no-op; do not mark as clear
    entry.clear = false;
    return entry;
  }



  function findActiveCharacter(dialogues, selections, target){
    if(!Array.isArray(dialogues) || !target) return null;
    const idx = dialogues.indexOf(target);
    if(idx < 0) return null;
    let useCharSlot = false;
    const agg = { left: null, right: null, center: null, focus: null, fade: { left: null, right: null, center: null } };
    // Collect latest sprite per slot by scanning backwards until a clear-boundary.
    for(let i = idx; i >= 0; i--){
      const entry = dialogues[i];
      // Clear conditions from script conventions
      if(entry && guardAllows(entry.guard, selections)){
        // [Image] always clears character sprites (even with an image)
        // Empty [Background] (no image) also clears
        if(entry.type === 'image'){
          const tag = (entry.tag || '').toLowerCase();
          const hasImage = !!(entry.image && String(entry.image).trim());
          const isImage = tag === 'image';
          const isBackground = tag === 'background';
          if(isImage || (isBackground && !hasImage)){
            if(useCharSlot){ break; }
            const fade = Number(entry.fadeTime||0) || null;
            return { type: 'clear', fade };
          }
        }
        // Empty [charslot] (optionally with duration) => clear
        if(entry.type === 'charslot' && !entry.slot && !entry.name){
          if(useCharSlot){
            // A later charslot has already established state; treat this as a boundary
            // and stop scanning without clearing newer sprites.
            break;
          } else {
            const fade = Number(entry.duration||0) || null;
            return { type: 'clear', fade };
          }
        }
        // Legacy [Character] without names => clear
        if(entry.type === 'character' && entry.clear){
          return null;
        }
      }
      if(entry && entry.type === 'charslot' && guardAllows(entry.guard, selections)){
        if(entry.hasDirective){
          if(!agg.focus && (entry.focusMulti && entry.focusMulti.length)){
            agg.focus = [...entry.focusMulti];
          }
          continue;
        }
        // Empty [charslot] should not clear; ignore it
        if(!entry.slot && !entry.name){
          continue;
        }
        useCharSlot = true;
        if(!agg.focus && (entry.focusMulti && entry.focusMulti.length)){
          agg.focus = [...entry.focusMulti];
        }
        if(entry.slot === 'center'){
          if(agg.center == null){
            agg.center = entry.name || null;
            if(entry.duration != null) agg.fade.center = entry.duration;
          }
        } else if(entry.slot === 'left'){
          if(agg.left == null){
            agg.left = entry.name || null;
            if(entry.duration != null) agg.fade.left = entry.duration;
          }
        } else if(entry.slot === 'right'){
          if(agg.right == null){
            agg.right = entry.name || null;
            if(entry.duration != null) agg.fade.right = entry.duration;
          }
        }
        continue;
      }
      if(entry && entry.type === 'character' && guardAllows(entry.guard, selections)){
        if(entry.clear) return null;
        if(!useCharSlot){
          return entry;
        } else {
          // We already have charslot state later than this legacy tag; prefer it.
          break;
        }
      }
    }
    if(useCharSlot){
      return { type: 'charslotState', positions: { left: agg.left, center: agg.center, right: agg.right }, focus: agg.focus, fade: agg.fade };
    }
    return null;
  }

  class CharacterController {
    constructor(options = {}){
      this.baseOptions = {
        primaryBase: options.primaryBase || `${ASSETS_BASE}/avg/characters`,
        fallbackBases: Array.isArray(options.fallbackBases) ? options.fallbackBases : [
          `${ASSETS_BASE}/torappu/dynamicassets/avg/characters`,
          `${ASSETS_BASE}/torappu/dynamicassets/arts/charavatars`
        ],
      };
      this.root = options.root || (global.document && global.document.body) || null;
      this.layer = null;
      this.slots = {};
      // cache basic metrics per slot so we can recompute offsets on resize
      this.metrics = { left: null, center: null, right: null };
      this.current = { left: null, center: null, right: null };
      this.currentFocus = null;
      this.slotBaseOffsets = { left: { x: 0, y: 0 }, center: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
      this.slotJumpOffsets = { left: 0, center: 0, right: 0 };
      if(this.root){
        this.ensureLayer();
      }

      // Re-apply offsets on resize so baseline remains correct when 80vh changes
      if(typeof global.addEventListener === 'function'){
        global.addEventListener('resize', () => this.reapplyMetrics());
      }
    }

    ensureLayer(){
      if(this.layer || !this.root || !global.document) return;
      const layer = global.document.createElement('div');
      layer.className = 'character-layer';
      const createSlot = (pos) => {
        const wrapper = global.document.createElement('div');
        wrapper.className = `character-slot character-slot--${pos}`;
        const img = global.document.createElement('img');
        img.alt = '';
        wrapper.appendChild(img);
        layer.appendChild(wrapper);
        return { wrapper, img, pendingFadeIn: null, pendingFadeOut: null, motionToken: 0, motionRaf: null, jumpToken: 0, jumpRaf: null };
      };
      this.slots.left = createSlot('left');
      this.slots.center = createSlot('center');
      this.slots.right = createSlot('right');
      this.root.appendChild(layer);
      this.layer = layer;
    }

    reset(){
      this.ensureLayer();
      this.current = { left: null, center: null, right: null };
      this.currentFocus = null;
      for(const [key, slot] of Object.entries(this.slots)){
        slot.wrapper.classList.remove('is-visible', 'is-dimmed', 'is-focused');
        slot.wrapper.style.removeProperty('--sprite-key');
        slot.wrapper.style.removeProperty('--fade-time');
        slot.wrapper.style.removeProperty('--sprite-vshift');
        slot.wrapper.style.removeProperty('--slot-offset-x');
        slot.wrapper.style.removeProperty('--slot-offset-y');
        slot.img.src = '';
        slot.img.alt = '';
        slot.img.style.removeProperty('--sprite-scale');
        slot.img.style.removeProperty('--sprite-zoom');
        slot.img.style.removeProperty('--sprite-zoom-extra');
        slot.img.style.removeProperty('transform-origin');
        slot.img.style.removeProperty('opacity');
        slot.img.style.removeProperty('transition');
        slot.pendingFadeIn = null;
        if(slot.pendingFadeOut != null){ try{ clearTimeout(slot.pendingFadeOut); }catch{} slot.pendingFadeOut = null; }
        if(slot.motionRaf != null){ try{ cancelAnimationFrame(slot.motionRaf); }catch{} slot.motionRaf = null; }
        if(slot.jumpRaf != null){ try{ cancelAnimationFrame(slot.jumpRaf); }catch{} slot.jumpRaf = null; }
        slot.motionToken = 0;
        slot.jumpToken = 0;
        this.slotBaseOffsets[key] = { x: 0, y: 0 };
        this.slotJumpOffsets[key] = 0;
      }
    }

    apply(entry){
      this.ensureLayer();
      if(!entry || entry.clear){
        this.reset();
        return;
      }
      const resolved = this.mapPositions(entry);
      const focusSlot = this.resolveFocus(entry, resolved.order);
      for(const position of ['left', 'center', 'right']){
        const data = resolved.positions[position] || null;
        this.updateSlot(position, data, focusSlot, Number(entry.fadeTime||0) || null);
      }
      this.currentFocus = focusSlot;
    }

    applyFor(dialogues, selections, target){
      const isChar = target && target.type === 'charslot';
      const hasDirective = isChar && target.hasDirective;
      const hasEffects = isChar && target.hasEffects;
      const found = findActiveCharacter(dialogues, selections, target);
      if(!found){
        if(hasDirective || hasEffects) {
          // Even without a visible state change, directives (e.g., motion/zoom on existing sprite) may apply
          this.applyCharSlotDirective(target);
          return;
        }
        this.reset();
        return;
      }
      if(found.type === 'clear'){
        // Fade out any visible slots with provided fade time
        const fade = Number(found.fade||0) || null;
        this.updateSlot('left', null, null, fade);
        this.updateSlot('center', null, null, fade);
        this.updateSlot('right', null, null, fade);
        this.currentFocus = null;
        if(hasDirective || hasEffects){ this.applyCharSlotDirective(target); }
        return;
      }
      if(found.type === 'charslotState'){
        const focus = this.normalizeFocusMulti(found.positions, found.focus);
        const leftSprite = this.resolveSprite(found.positions.left);
        const centerSprite = this.resolveSprite(found.positions.center);
        const rightSprite = this.resolveSprite(found.positions.right);
        this.updateSlot('left', leftSprite, focus, Number(found.fade.left||0) || null);
        this.updateSlot('center', centerSprite, focus, Number(found.fade.center||0) || null);
        this.updateSlot('right', rightSprite, focus, Number(found.fade.right||0) || null);
        // Set single-slot focus for directive targeting only if exactly one focused
        this.currentFocus = Array.isArray(focus) && focus.length === 1 ? focus[0] : this.currentFocus;
        if(hasDirective || hasEffects){ this.applyCharSlotDirective(target); }
        return;
      }
      this.apply(found);
      if(hasDirective || hasEffects){ this.applyCharSlotDirective(target); }
    }

    normalizeFocusMulti(positions, focus){
      if(!focus) return null;
      const list = Array.isArray(focus) ? focus : [String(focus).toLowerCase()];
      const out = [];
      for(const f of list){
        const v = (f === 'l' || f === 'left') ? 'left' : (f === 'r' || f === 'right') ? 'right' : (f === 'm' || f === 'c' || f === 'center' || f === 'mid' || f === 'main') ? 'center' : null;
        if(!v) continue;
        if(v === 'left' && positions.left && !out.includes('left')) out.push('left');
        else if(v === 'right' && positions.right && !out.includes('right')) out.push('right');
        else if(v === 'center' && (positions.center || (!positions.left && !positions.right)) && !out.includes('center')) out.push('center');
      }
      if(out.length) return out;
      const present = ['left','center','right'].filter(k=>positions && positions[k]);
      return present.length === 1 ? present : null;
    }

    mapPositions(entry){
      const order = [];
      if(entry.name) order.push({ positionHint: 'left', name: entry.name, index: 1 });
      if(entry.name2) order.push({ positionHint: 'right', name: entry.name2, index: 2 });
      if(entry.name3) order.push({ positionHint: 'center', name: entry.name3, index: 3 });
      const positions = { left: null, center: null, right: null };
      if(order.length === 0){
        return { positions, order };
      }
      if(order.length === 1){
        positions.center = this.resolveSprite(order[0].name);
        order[0].slot = 'center';
      } else if(order.length === 2){
        positions.left = this.resolveSprite(order[0].name);
        positions.right = this.resolveSprite(order[1].name);
        order[0].slot = 'left';
        order[1].slot = 'right';
      } else {
        positions.left = this.resolveSprite(order[0].name);
        positions.center = this.resolveSprite(order[1].name);
        positions.right = this.resolveSprite(order[2].name);
        order[0].slot = 'left';
        order[1].slot = 'center';
        order[2].slot = 'right';
      }
      return { positions, order };
    }

    resolveFocus(entry, order){
      const focus = Number(entry.focus);
      if(!Number.isFinite(focus) || focus <= 0) return null;
      const match = order.find(item => item.index === focus);
      if(match && match.slot) return match.slot;
      return null;
    }

    updateSlot(position, sprite, focusSlot, fadeSec){
      this.ensureLayer();
      const slot = this.slots[position];
      if(!slot) return;
      const fadeDuration = Number.isFinite(fadeSec) && fadeSec > 0 ? fadeSec : null;
      if(fadeDuration != null){
        slot.wrapper.style.setProperty('--fade-time', `${fadeDuration}s`);
      } else {
        slot.wrapper.style.removeProperty('--fade-time');
      }
      if(!sprite || !sprite.sources || !sprite.sources.length){
        const fadeDuration = (Number.isFinite(fadeSec) && fadeSec > 0) ? Number(fadeSec) : null;
        const wasVisible = slot.wrapper.classList.contains('is-visible');
        const hasImg = !!(slot.img && slot.img.src);
        if(fadeDuration != null && (wasVisible || hasImg)){
          if(slot.pendingFadeOut != null){ try{ clearTimeout(slot.pendingFadeOut); }catch{} }
          try{ slot.wrapper.style.opacity = '0'; }catch{}
          const ms = Math.round(fadeDuration * 1000);
          slot.pendingFadeOut = setTimeout(() => {
            slot.pendingFadeOut = null;
            slot.wrapper.classList.remove('is-visible', 'is-dimmed', 'is-focused');
            try{ slot.wrapper.style.removeProperty('opacity'); }catch{}
            slot.wrapper.style.removeProperty('--sprite-key');
            slot.wrapper.style.removeProperty('--slot-offset-x');
            slot.wrapper.style.removeProperty('--slot-offset-y');
            slot.img.src = '';
            slot.img.alt = '';
            slot.img.style.removeProperty('--sprite-zoom');
            slot.img.style.removeProperty('--sprite-zoom-extra');
            slot.img.style.removeProperty('transform-origin');
            slot.img.style.removeProperty('opacity');
            slot.img.style.removeProperty('transition');
            this.current[position] = null;
            this.metrics[position] = null;
            slot.pendingFadeIn = null;
            if(slot.motionRaf != null){ try{ cancelAnimationFrame(slot.motionRaf); }catch{} slot.motionRaf = null; }
            if(slot.jumpRaf != null){ try{ cancelAnimationFrame(slot.jumpRaf); }catch{} slot.jumpRaf = null; }
            slot.motionToken = 0;
            slot.jumpToken = 0;
            this.slotBaseOffsets[position] = { x: 0, y: 0 };
            this.slotJumpOffsets[position] = 0;
          }, ms);
          return;
        } else {
          slot.wrapper.classList.remove('is-visible', 'is-dimmed', 'is-focused');
          slot.wrapper.style.removeProperty('--sprite-key');
          slot.wrapper.style.removeProperty('--slot-offset-x');
          slot.wrapper.style.removeProperty('--slot-offset-y');
          slot.img.src = '';
          slot.img.alt = '';
          slot.img.style.removeProperty('--sprite-zoom');
          slot.img.style.removeProperty('--sprite-zoom-extra');
          slot.img.style.removeProperty('transform-origin');
          slot.img.style.removeProperty('opacity');
          slot.img.style.removeProperty('transition');
          this.current[position] = null;
          this.metrics[position] = null;
          slot.pendingFadeIn = null;
          if(slot.motionRaf != null){ try{ cancelAnimationFrame(slot.motionRaf); }catch{} slot.motionRaf = null; }
          if(slot.jumpRaf != null){ try{ cancelAnimationFrame(slot.jumpRaf); }catch{} slot.jumpRaf = null; }
          slot.motionToken = 0;
          slot.jumpToken = 0;
          this.slotBaseOffsets[position] = { x: 0, y: 0 };
          this.slotJumpOffsets[position] = 0;
          return;
        }
      }
      if(slot.pendingFadeOut != null){ try{ clearTimeout(slot.pendingFadeOut); }catch{} slot.pendingFadeOut = null; try{ slot.wrapper.style.removeProperty('opacity'); }catch{} }
      const prev = this.current[position];
      const keyChanged = !prev || prev.key !== sprite.key;
      if(keyChanged){
        this.current[position] = sprite;
        slot.wrapper.style.setProperty('--sprite-key', sprite.key);
        slot.img.alt = sprite.key;
        if(fadeDuration != null){
          slot.pendingFadeIn = fadeDuration;
          slot.img.style.transition = 'none';
          slot.img.style.opacity = '0';
        } else {
          slot.pendingFadeIn = null;
          // Do not reset opacity here; only remove any previous transition
          slot.img.style.removeProperty('transition');
        }
        this.assignSources(slot, sprite.sources);
      } else {
        // Same key as before; ensure the <img> still points at a matching URL.
        // If a prior clear/fade-out removed src, we must reassign sources.
        try {
          const srcNow = String(slot.img && slot.img.src || '');
          const expectSub = String(sprite.key || '').split('#')[0];
          if(!srcNow || (expectSub && srcNow.indexOf(expectSub) < 0)){
            this.assignSources(slot, sprite.sources);
          }
        } catch(_){
          this.assignSources(slot, sprite.sources);
        }
        slot.pendingFadeIn = null;
        // No fade requested and key unchanged: preserve current opacity/transition
      }
      this.applyCombinedOffset(position);
      slot.wrapper.classList.add('is-visible');
      const list = Array.isArray(focusSlot) ? focusSlot : (focusSlot ? [focusSlot] : null);
      const isFocused = list ? list.includes(position) : true;
      slot.wrapper.classList.toggle('is-focused', !!isFocused);
      slot.wrapper.classList.toggle('is-dimmed', list ? !list.includes(position) : false);
    }

    applyCombinedOffset(position){
      const slot = this.slots[position];
      if(!slot || !slot.wrapper) return;
      const base = this.slotBaseOffsets[position] || { x: 0, y: 0 };
      const jump = this.slotJumpOffsets[position] || 0;
      const x = Number.isFinite(base.x) ? base.x : 0;
      const y = Number.isFinite(base.y) ? base.y : 0;
      const totalY = y + (Number.isFinite(jump) ? jump : 0);
      slot.wrapper.style.setProperty('--slot-offset-x', String(x) + 'px');
      slot.wrapper.style.setProperty('--slot-offset-y', String(totalY) + 'px');
    }

    applyCharSlotDirective(entry){
      if(!entry) return;
      const slotName = entry.slot || this.currentFocus || null;
      if(!slotName || !this.slots[slotName]) return;
      if(!this.current[slotName]) return;
      const durationSec = Number.isFinite(entry.duration) ? Math.max(0, entry.duration) : null;
      if(entry.motion){
        this.animateSlotMotion(slotName, {
          from: entry.motion.from || null,
          to: entry.motion.to || null,
          duration: durationSec,
        });
      }
      if(entry.action === 'jump'){
        this.animateSlotJump(slotName, {
          power: entry.actionPower,
          times: entry.actionTimes,
          duration: durationSec,
        });
      }
      // Zoom and opacity directives (explicit action=zoom or implicit via params)
      if(entry.action === 'zoom' || entry.zoomPivot || (entry.zoomScale != null) || (entry.alphaFrom != null) || (entry.alphaTo != null)){
        const slot = this.slots[slotName];
        if(!slot || !slot.img) return;
        const img = slot.img;
        // Apply pivot if provided; poszoom is in 0..1 (percent of image)
        if(entry.zoomPivot && Number.isFinite(entry.zoomPivot.x) && Number.isFinite(entry.zoomPivot.y)){
          const px = Math.max(0, Math.min(1, entry.zoomPivot.x)) * 100;
          const py = Math.max(0, Math.min(1, entry.zoomPivot.y)) * 100;
          img.style.transformOrigin = `${px}% ${py}%`;
        }
        // Build transitions if animating
        const transitions = [];
        const willScale = (entry.zoomScale != null);
        const willFade = (entry.alphaFrom != null) || (entry.alphaTo != null);
        if(Number.isFinite(durationSec) && durationSec > 0){
          if(willScale) transitions.push(`transform ${durationSec}s ease`);
          if(willFade) transitions.push(`opacity ${durationSec}s ease`);
        }
        if(transitions.length){ img.style.transition = transitions.join(', '); }
        // Set starting alpha if specified
        if(entry.alphaFrom != null){ img.style.opacity = String(entry.alphaFrom); }
        const applyTargets = () => {
          if(willScale){ img.style.setProperty('--sprite-zoom-extra', String(entry.zoomScale)); }
          if(entry.alphaTo != null){ img.style.opacity = String(entry.alphaTo); }
          if(!transitions.length){ img.style.removeProperty('transition'); }
        };
        // Apply immediately or on next frame for smooth transition
        if(Number.isFinite(durationSec) && durationSec > 0 && typeof global.requestAnimationFrame === 'function'){
          global.requestAnimationFrame(applyTargets);
        } else {
          applyTargets();
        }
      }
    }

    animateSlotMotion(position, opts = {}){
      const slot = this.slots[position];
      if(!slot) return;
      if(slot.motionRaf != null){ try{ cancelAnimationFrame(slot.motionRaf); }catch{} slot.motionRaf = null; }
      slot.motionToken = (slot.motionToken || 0) + 1;
      const token = slot.motionToken;
      const current = this.slotBaseOffsets[position] || { x: 0, y: 0 };
      const from = opts.from && typeof opts.from === 'object' ? opts.from : null;
      const to = opts.to && typeof opts.to === 'object' ? opts.to : null;
      const startX = Number.isFinite(from && from.x) ? from.x : (Number.isFinite(current.x) ? current.x : 0);
      const startY = Number.isFinite(from && from.y) ? from.y : (Number.isFinite(current.y) ? current.y : 0);
      const endX = Number.isFinite(to && to.x) ? to.x : startX;
      const endY = Number.isFinite(to && to.y) ? to.y : startY;
      const durationSec = Number.isFinite(opts.duration) ? Math.max(0, opts.duration) : 0;
      const raf = typeof global.requestAnimationFrame === 'function' ? global.requestAnimationFrame.bind(global) : null;
      const perf = (global.performance && typeof global.performance.now === 'function') ? global.performance : null;
      if(durationSec <= 0 || !raf || !perf){
        this.slotBaseOffsets[position] = { x: endX, y: endY };
        this.applyCombinedOffset(position);
        return;
      }
      const totalMs = durationSec * 1000;
      const start = perf.now();
      this.slotBaseOffsets[position] = { x: startX, y: startY };
      this.applyCombinedOffset(position);
      const step = (now) => {
        if(slot.motionToken !== token) return;
        const ratio = Math.min(1, (now - start) / totalMs);
        const x = startX + (endX - startX) * ratio;
        const y = startY + (endY - startY) * ratio;
        this.slotBaseOffsets[position] = { x, y };
        this.applyCombinedOffset(position);
        if(ratio < 1){
          slot.motionRaf = raf(step);
        } else {
          slot.motionRaf = null;
        }
      };
      slot.motionRaf = raf(step);
    }

    animateSlotJump(position, opts = {}){
      const slot = this.slots[position];
      if(!slot) return;
      if(slot.jumpRaf != null){ try{ cancelAnimationFrame(slot.jumpRaf); }catch{} slot.jumpRaf = null; }
      slot.jumpToken = (slot.jumpToken || 0) + 1;
      const token = slot.jumpToken;
      const ampRaw = opts.power != null ? Number(opts.power) : null;
      const amplitude = Number.isFinite(ampRaw) ? Math.abs(ampRaw) : 0;
      if(amplitude === 0){
        this.slotJumpOffsets[position] = 0;
        this.applyCombinedOffset(position);
        return;
      }
      const cyclesRaw = opts.times != null ? Number(opts.times) : null;
      const cycles = Number.isFinite(cyclesRaw) && cyclesRaw > 0 ? cyclesRaw : 1;
      const durationRaw = opts.duration != null ? Number(opts.duration) : null;
      const durationSec = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : 0.5;
      const raf = typeof global.requestAnimationFrame === 'function' ? global.requestAnimationFrame.bind(global) : null;
      const perf = (global.performance && typeof global.performance.now === 'function') ? global.performance : null;
      if(!raf || !perf){
        this.slotJumpOffsets[position] = 0;
        this.applyCombinedOffset(position);
        return;
      }
      const totalMs = durationSec * 1000;
      const start = perf.now();
      const step = (now) => {
        if(slot.jumpToken !== token) return;
        const ratio = Math.min(1, (now - start) / totalMs);
        const wave = Math.abs(Math.sin(ratio * cycles * Math.PI));
        this.slotJumpOffsets[position] = -amplitude * wave;
        this.applyCombinedOffset(position);
        if(ratio < 1){
          slot.jumpRaf = raf(step);
        } else {
          this.slotJumpOffsets[position] = 0;
          this.applyCombinedOffset(position);
          slot.jumpRaf = null;
        }
      };
      slot.jumpRaf = raf(step);
    }

    // Assign image sources with fallbacks and measure on load to normalize size
    assignSources(slot, sources){
      const img = slot && slot.img ? slot.img : null;
      const list = Array.isArray(sources) ? sources.filter(Boolean) : [];
      if(!img || !list.length) return;
      const slotKey = slot === this.slots.left ? 'left' : (slot === this.slots.right ? 'right' : 'center');
      const token = (slot.loadToken || 0) + 1;
      slot.loadToken = token;

      img.dataset.sources = JSON.stringify(list);
      img.dataset.sourceIndex = '-1';
      try { img.crossOrigin = 'anonymous'; } catch {}
      try { img.decoding = 'async'; } catch {}

      const attempt = (index) => {
        if(slot.loadToken !== token) return;
        if(index >= list.length){
          slot.pendingLoader = null;
          return;
        }
        const url = list[index];
        const loader = new Image();
        slot.pendingLoader = loader;
        try { loader.crossOrigin = 'anonymous'; } catch {}

        const swapIn = () => {
          if(slot.loadToken !== token) return;
          slot.pendingLoader = null;
          img.dataset.sourceIndex = String(index);
          if(img.src !== url){
            // Set both property and attribute so CSS [src*="..."] rules reliably match
            try { img.src = url; } catch(_){ }
            try { img.setAttribute('src', url); } catch(_){ }
          }
        };

        const tryDecode = () => {
          if(slot.loadToken !== token) return;
          let decoded = false;
          if(typeof loader.decode === 'function'){
            try {
              const p = loader.decode();
              if(p && typeof p.then === 'function'){
                decoded = true;
                p.then(swapIn, swapIn);
              }
            } catch {
              // ignore decode errors, fall back to immediate swap
            }
          }
          if(!decoded){ swapIn(); }
        };

        loader.onload = () => {
          if(slot.loadToken !== token) return;
          tryDecode();
        };
        loader.onerror = () => {
          if(slot.loadToken !== token) return;
          attempt(index + 1);
        };
        loader.src = url;
      };

      img.onload = () => {
        if(slot.loadToken !== token) return;
        try {
          const m = this.measureSprite(img);
          this.metrics[slotKey] = m;
          this.applyMetrics(slot, m);
        } catch (e) {
          // ignore measurement failures
        }
        const pending = slot.pendingFadeIn;
        if(pending != null){
          slot.pendingFadeIn = null;
          this.animateSpriteFadeIn(slot, pending);
        } else {
          // Preserve any existing opacity set by directives; just clear transition
          slot.img.style.removeProperty('transition');
        }
      };

      img.onerror = () => {
        if(slot.loadToken !== token) return;
        const nextIndex = Number(img.dataset.sourceIndex || '0') + 1;
        attempt(nextIndex);
      };

      attempt(0);
    }

    animateSpriteFadeIn(slot, duration){
      if(!slot || !slot.img) return;
      const img = slot.img;
      if(typeof global.requestAnimationFrame === 'function'){
        global.requestAnimationFrame(() => {
          img.style.transition = `opacity ${duration}s ease`;
          global.requestAnimationFrame(() => { img.style.opacity = '1'; });
        });
      } else {
        img.style.transition = `opacity ${duration}s ease`;
        setTimeout(() => { img.style.opacity = '1'; }, 16);
      }
    }

    // Compute sprite metrics. Smart scaling disabled: treat full canvas as content
    measureSprite(img){
      const w = img.naturalWidth || 0;
      const h = img.naturalHeight || 0;
      if(!w || !h) return null;
      // Do not inspect alpha or crop bounds; return defaults so scale=1 and no vshift
      return { naturalWidth: w, naturalHeight: h, top: 0, bottom: h - 1, left: 0, right: w - 1, bboxWidth: w, bboxHeight: h, bottomPad: 0, scale: 1 };
    }

    // Apply metrics as CSS variables; recompute baseline shift with current viewport height
    applyMetrics(slot, m){
      if(!slot || !slot.img || !m) return;
      const img = slot.img;
      // With smart scaling disabled, keep scale at 1 and no vertical shift
      img.style.setProperty('--sprite-scale', '1');
      slot.wrapper.style.setProperty('--sprite-vshift', '0px');
    }

    // Reapply vertical shifts on viewport resize
    reapplyMetrics(){
      for(const key of ['left','center','right']){
        const slot = this.slots[key];
        const m = this.metrics[key];
        if(slot && m){ this.applyMetrics(slot, m); }
        this.applyCombinedOffset(key);
      }
    }

    resolveSprite(name){
      if(!name) return null;
      const sprite = buildSources(name, this.baseOptions);
      return sprite;
    }
  }

  global.StoryCharacters = {
    parseCharacterTag,
    parseCharSlotTag,
    parseDialogTag,
    guardAllows,
    findActiveCharacter,
    CharacterController,
  };
})(typeof window !== 'undefined' ? window : globalThis);
