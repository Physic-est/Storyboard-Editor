import { State }     from './state.js';
import { PlayState } from './playstate.js';
import { AnimMath }  from './anim-math.js';
import { Chart }     from './chart.js';

/** キャンバスプレビュー描画 + ズーム管理 */
let zoom = null;

const IMG_TYPES = ['image', 'anim', 'stretch', 'ninepatch'];

const _textSizeCache = new Map();
function _measureText(text) {
  if (_textSizeCache.has(text)) return _textSizeCache.get(text);
  const probe = document.createElement('span');
  probe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;visibility:hidden;white-space:nowrap;font-size:100px;line-height:1;';
  probe.textContent = text;
  document.body.appendChild(probe);
  const result = { w: probe.offsetWidth || 1, h: probe.offsetHeight || 1 };
  document.body.removeChild(probe);
  _textSizeCache.set(text, result);
  return result;
}

/** anim タイプの現在フレームのリソース名を返す */
function getAnimFrameName(elem, time) {
  const interval = elem.interval || 100;
  const frameIdx = Math.floor(time / interval);
  if (elem.frames?.length > 0) {
    return elem.frames[frameIdx % elem.frames.length];
  }
  if (elem.tex) {
    // "basename/start-end" 形式: xxxxx/1-50
    const rm = elem.tex.match(/^(.+)\/(\d+)-(\d+)$/);
    if (rm) {
      const base = rm[1], start = parseInt(rm[2]), end = parseInt(rm[3]);
      const count = end - start + 1;
      return `${base}-${start + (frameIdx % count)}.png`;
    }
    // "@index" パターン
    if (elem.tex.includes('@index')) {
      return elem.tex.replace(/@index/g, frameIdx);
    }
  }
  return elem.tex;
}

function resolvePos(v, unit, dim, sc, unitBase) {
  if (unit === '_px') return v * sc;
  if (unit === '%')   return v / 100 * dim * sc;
  if (unit === 'px')  return v * sc;
  return v * unitBase * sc;
}

function resolveSize(v, unit, dim, sc, unitBase) {
  if (unit === '_px') return v * sc;
  if (unit === '%')   return v / 100 * dim * sc;
  if (unit === 'px')  return v * sc;
  return v * unitBase * sc;
}

function anchorOffset(anchor, pw, ph) {
  return [(anchor % 3) * pw / 2, Math.floor(anchor / 3) * ph / 2];
}

function fit() {
  const { width, height } = State.getSettings();
  const wrap = document.getElementById('canvas-wrap');
  const aw = wrap.clientWidth - 60, ah = wrap.clientHeight - 60;
  zoom = Math.min(aw / width, ah / height, 1);
  applyZoom();
}

function applyZoom() {
  const { width, height } = State.getSettings();
  const stage = document.getElementById('canvas-stage');
  stage.style.width  = (width  * zoom) + 'px';
  stage.style.height = (height * zoom) + 'px';
  stage._sc = zoom;
  const pct = Math.round(zoom * 100) + '%';
  document.getElementById('zoom-pct').textContent = pct;
  document.getElementById('canvas-size-info').textContent = `${width}×${height}`;
  const sbZoom = document.getElementById('sb-zoom');
  if (sbZoom) sbZoom.textContent = pct;
}

function zoomBy(delta) {
  if (zoom === null) fit();
  zoom = Math.min(Math.max(zoom + delta, 0.05), 4);
  applyZoom();
  render();
}

function render() {
  const stage     = document.getElementById('canvas-stage');
  const container = document.getElementById('canvas-elems');
  const sc        = stage._sc || 0.5;
  const settings  = State.getSettings();
  const { width, height, apply3d, angle } = settings;
  const unitValue = settings.unit || 1080;
  const unitBase = height / unitValue;
  const time  = PlayState.currentTime;
  const selId = PlayState.selectedId;
  const ctx = { cw: width, ch: height, unitValue: unitValue };
  const H   = height * sc;

  // ── 親子位置解決プリパス ─────────────────────────────────────────
  // 全可視要素のジオメトリを先に計算し、parent が設定された要素の
  // cssLeft / cssTop を親要素の左下隅を原点として補正する。
  const _geom = {};
  State.getElems().filter(e => e.visible).forEach(elem => {
    const p   = AnimMath.computeProps(elem, time, ctx);
    const pxU = p.posXUnit  ?? p.posUnit  ?? '%';
    const pyU = p.posYUnit  ?? p.posUnit  ?? '%';
    const pwU = p.sizeXUnit ?? p.sizeUnit ?? 'px';
    const phU = p.sizeYUnit ?? p.sizeUnit ?? 'px';
    let epx = resolvePos(p.x,  pxU, width,  sc, unitBase);
    let epy = resolvePos(p.y,  pyU, height, sc, unitBase);
    let epw = resolveSize(p.w, pwU, width,  sc, unitBase);
    let eph = resolveSize(p.h, phU, height, sc, unitBase);
    if (IMG_TYPES.includes(elem.type) && (epw === 0 || eph === 0)) {
      const texName = elem.type === 'anim' ? getAnimFrameName(elem, time) : elem.tex;
      const res = window.Resources?.getImage(texName);
      const nw = res?.naturalW || 0, nh = res?.naturalH || 0;
      if (epw === 0 && eph === 0) { epw = nw > 0 ? nw*sc : 64*sc; eph = nh > 0 ? nh*sc : 64*sc; }
      else if (epw === 0 && nh > 0) epw = eph * (nw / nh);
      else if (eph === 0 && nw > 0) eph = epw * (nh / nw);
      else { if (epw === 0) epw = 64*sc; if (eph === 0) eph = 64*sc; }
    }
    const [eox, eoy] = anchorOffset(p.anchor, epw, eph);
    _geom[elem.name] = { p, epx, epy, epw, eph, eox, eoy };
  });

  // 再帰で親チェーンを解決して絶対 CSS 座標を返す
  const _absPos = {};
  const _resolve = (name) => {
    if (_absPos[name]) return _absPos[name];
    const g = _geom[name];
    if (!g) return null;
    let cssLeft = g.epx - g.eox;
    let cssTop  = H - g.epy - g.eoy;
    const elem = State.getElems().find(e => e.name === name);
    if (elem?.parent) {
      if (!_geom[elem.parent]) {
        // 親が不可視または未定義 → そのまま絶対座標として扱う
      } else {
        const pg = _resolve(elem.parent);
        if (pg) {
          // 子の原点を親の左下隅に移動
          cssLeft = pg.cssLeft + g.epx - g.eox;
          cssTop  = (pg.cssTop + pg.ph) - g.epy - g.eoy;
        }
      }
    }
    return (_absPos[name] = { cssLeft, cssTop, pw: g.epw, ph: g.eph });
  };
  Object.keys(_geom).forEach(name => _resolve(name));
  // ────────────────────────────────────────────────────────────────

  container.innerHTML = '';

  // zindex <= 0: 最下層 2D（@angle 影響なし）
  const layer2dBottom = document.createElement('div');
  layer2dBottom.style.cssText = 'position:absolute;inset:0;z-index:0;pointer-events:none;';

  // zindex 1-99: 3D レイヤー（@angle 適用）
  const layer3d = document.createElement('div');
  if (apply3d && angle > 0) {
    const perspPx = height * sc * 3;
    layer3d.style.cssText =
      `position:absolute;inset:0;z-index:1;pointer-events:none;` +
      `transform:perspective(${perspPx}px) rotateX(${angle}deg);` +
      `transform-origin:50% 100%;`;
  } else {
    layer3d.style.cssText = 'position:absolute;inset:0;z-index:1;pointer-events:none;';
  }

  // zindex >= 100: 最上位 2D（@angle 影響なし）
  const layer2dTop = document.createElement('div');
  layer2dTop.style.cssText = 'position:absolute;inset:0;z-index:2;pointer-events:none;';

  container.appendChild(layer2dBottom);
  container.appendChild(layer3d);
  container.appendChild(layer2dTop);

  [...State.getElems()]
    .sort((a, b) => (a.zindex || 0) - (b.zindex || 0))
    .forEach(elem => {
      if (!elem.visible) return;
      const gd = _geom[elem.name];
      if (!gd) return;
      if (!gd.p.animVisible) return;
      const p  = gd.p;
      const pw = gd.epw;
      const ph = gd.eph;
      const ap = _absPos[elem.name] ?? { cssLeft: gd.epx - gd.eox, cssTop: H - gd.epy - gd.eoy };
      const { cssLeft, cssTop } = ap;

      // blend モードの CSS
      const blendCss = elem.blend === 0 ? 'mix-blend-mode:plus-lighter;'
                     : elem.blend === 1 ? 'mix-blend-mode:screen;'
                     : '';

      const el = document.createElement('div');
      el.className = 'ce' + (elem.id === selId ? ' sel' : '');
      el.dataset.id = elem.id;
      el.style.cssText =
        `left:${cssLeft}px;top:${cssTop}px;width:${pw}px;height:${ph}px;` +
        `transform:rotate(${p.rotate}deg) skewX(${p.skewX || 0}deg) skewY(${p.skewY || 0}deg);z-index:${p.zindex};` +
        blendCss +
        `pointer-events:auto;`;

      const inner = document.createElement('div');
      inner.className = 'ce-inner';

      if (elem.type === 'rect') {
        inner.style.cssText = `background:${p.color};width:100%;height:100%;`;

      } else if (elem.type === 'text') {
        const textStr = elem.textVal || '{text}';
        if (elem.sizeMode === 'size') {
          const nat = _measureText(textStr);
          const sx = (pw / nat.w).toFixed(4);
          const sy = (ph / nat.h).toFixed(4);
          inner.style.cssText = `color:${p.color};display:block;overflow:visible;`;
          const span = document.createElement('span');
          span.style.cssText = `white-space:nowrap;line-height:1;font-size:100px;display:inline-block;transform-origin:top left;transform:scale(${sx},${sy});`;
          span.textContent = textStr;
          inner.appendChild(span);
        } else {
          inner.style.cssText = `color:${p.color};font-size:${Math.max(7, p.fsize * sc)}px;`;
          inner.textContent = textStr;
        }

      } else if (IMG_TYPES.includes(elem.type)) {
        const texName = elem.type === 'anim' ? getAnimFrameName(elem, time) : elem.tex;
        const res = window.Resources?.getImage(texName);
        if (res) {
          inner.style.position = 'relative';
          const img = document.createElement('img');
          img.src = res.dataUrl;
          img.style.cssText = 'width:100%;align-self:stretch;object-fit:fill;pointer-events:none;';
          inner.appendChild(img);
          const c = p.color;
          if (c && c !== '#ffffff' && c !== '#fff' && c !== 'white') {
            const tint = document.createElement('div');
            tint.style.cssText =
              `position:absolute;inset:0;background:${c};` +
              `mix-blend-mode:multiply;pointer-events:none;`;
            inner.appendChild(tint);
          }
          if (elem.type === 'stretch' || elem.type === 'ninepatch') {
            const badge = document.createElement('div');
            badge.style.cssText =
              'position:absolute;top:1px;right:1px;font-size:7px;' +
              'background:rgba(245,166,35,.8);color:#fff;padding:1px 3px;' +
              'border-radius:2px;pointer-events:none;z-index:1;';
            badge.textContent = elem.type === 'stretch' ? 'S4' : 'S5';
            inner.appendChild(badge);
          }
        } else {
          const icon = elem.type === 'anim' ? '🎞'
                     : elem.type === 'stretch' ? '≡'
                     : elem.type === 'ninepatch' ? '⊞' : '🖼';
          inner.style.cssText =
            'background:rgba(123,104,240,.1);border:1px dashed rgba(123,104,240,.3);' +
            'width:100%;height:100%;display:flex;align-items:center;justify-content:center;' +
            'color:rgba(123,104,240,.5);font-size:9px;font-family:monospace;';
          inner.textContent = elem.tex ? elem.tex.split('/').pop() : icon;
        }
      }

      inner.style.cssText += `opacity:${p.opacity/100};`;

      el.appendChild(inner);

      const lbl = document.createElement('div');
      lbl.className = 'ce-label';
      lbl.textContent = elem.name;
      el.appendChild(lbl);

      ['tl','tr','bl','br'].forEach(h => {
        const rh = document.createElement('div');
        rh.className = 'rh ' + h;
        rh.onmousedown = e => {
          e.preventDefault(); e.stopPropagation();
          window.Drag?.startResize(e, elem.id, h);
        };
        el.appendChild(rh);
      });

      // 選択・ドラッグはコンテナレベルのハンドラに委譲（クリック選択優先度を一元管理）
      el.onmousedown = e => {
        if (e.target.classList.contains('rh')) return;
        e.preventDefault(); // テキスト選択防止のみ
      };

      // レイヤー振り分け: zindex<=0→最下層2D、1-99→3D、>=100→最上位2D
      let target;
      if (apply3d && p.zindex >= 1 && p.zindex <= 99) {
        target = layer3d;
      } else if (p.zindex >= 100) {
        target = layer2dTop;
      } else {
        target = layer2dBottom;
      }
      target.appendChild(el);
    });

  // 譜面ノーツ描画（zindex=10 → layer3d へ）
  if (Chart.isLoaded()) {
    _renderChartNotes(layer3d, { width, height, sc, time });
  }
}

// ── 譜面ノーツ描画ヘルパー ──────────────────────────────────────────

function _renderChartNotes(layer3d, { width, height, sc, time }) {
  const notes      = Chart.getNotes();
  const approachMs = Chart.getApproachMs();
  const NOTE_H     = Math.max(4, height * sc * 0.022);

  const yPct = noteTime => (noteTime - time) / approachMs * 100;

  const toCss = (mcX, mcW, y) => {
    const yC  = Math.max(0, Math.min(500, y));
    const py  = yC / 90 * height * sc;
    const cx  = mcX / 256 * width * sc;
    const w   = mcW  / 255 * width * sc;
    return {
      left:   cx - w / 2,
      top:    height * sc - py - NOTE_H / 2,
      width:  w,
      height: NOTE_H
    };
  };

  for (const note of notes) {
    const hy = yPct(note.time);

    if (note.isSlide) {
      const ty = yPct(note.tailTime);
      if (hy > 500 || ty < -5) continue;
      _renderSlideNote(layer3d, note, yPct, toCss, 0, width, height, sc);
    } else {
      if (hy > 500 || hy < -5) continue;
      const cls = note.isWipe ? 'chart-note-wipe' : 'chart-note-tap';
      _renderNoteBar(layer3d, note.x, note.w, hy, toCss, cls);
    }
  }

  const jl = document.createElement('div');
  jl.style.cssText =
    `position:absolute;left:0;top:${height * sc - 2}px;` +
    `width:${width * sc}px;height:2px;z-index:11;pointer-events:none;` +
    `background:rgba(255,255,255,0.65);box-shadow:0 0 10px rgba(255,255,255,0.8);`;
  layer3d.appendChild(jl);
}

function _renderNoteBar(layer3d, mcX, mcW, y, toCss, cssClass) {
  const pos = toCss(mcX, mcW, y);
  const el  = document.createElement('div');
  el.className = 'chart-note ' + cssClass;
  el.style.cssText =
    `position:absolute;left:${pos.left}px;top:${pos.top}px;` +
    `width:${pos.width}px;height:${pos.height}px;` +
    `z-index:10;pointer-events:none;border-radius:${pos.height * 0.35}px;`;
  layer3d.appendChild(el);
}

function _renderSlideNote(layer3d, note, yPctFn, toCss, NOTE_H, width, height, sc) {
  const chain = [
    { time: note.time, x: note.x },
    ...note.seg.map(s => ({ time: s.time, x: note.x + s.x }))
  ];
  const mcW = note.w;

  const pts = chain.map(wp => {
    const y = Math.max(-5, Math.min(500, yPctFn(wp.time)));
    return toCss(wp.x, mcW, y);
  });

  if (pts.length >= 2) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.cssText =
      `position:absolute;left:0;top:0;` +
      `width:${width * sc}px;height:${height * sc}px;` +
      `pointer-events:none;z-index:9;overflow:visible;`;

    for (let i = 0; i < pts.length - 1; i++) {
      const y1 = yPctFn(chain[i].time);
      const y2 = yPctFn(chain[i + 1].time);
      if ((y1 > 500 && y2 > 500) || (y1 < -5 && y2 < -5)) continue;

      const p1 = pts[i], p2 = pts[i + 1];
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', [
        `${p1.left},${p1.top}`,
        `${p2.left},${p2.top}`,
        `${p2.left + p2.width},${p2.top}`,
        `${p1.left + p1.width},${p1.top}`
      ].join(' '));
      poly.setAttribute('fill',         'rgba(60,210,120,0.3)');
      poly.setAttribute('stroke',       'rgba(60,210,120,0.6)');
      poly.setAttribute('stroke-width', '1');
      svg.appendChild(poly);
    }
    layer3d.appendChild(svg);
  }

  const hy = yPctFn(note.time);
  if (hy >= -5 && hy <= 500) {
    _renderNoteBar(layer3d, note.x, mcW, hy, toCss, 'chart-note-slide');
  }

  if (chain.length > 1) {
    const tail = chain[chain.length - 1];
    const ty   = yPctFn(tail.time);
    if (ty >= -5 && ty <= 500) {
      _renderNoteBar(layer3d, tail.x, mcW, ty, toCss, 'chart-note-slide-tail');
    }
  }
}

// ── コンテナレベルのクリック選択ハンドラ（一度だけ設定）──────────────
// 選択優先度: zindex 高い方を優先、同レイヤーは面積が小さい方を優先
document.getElementById('canvas-elems').addEventListener('mousedown', e => {
  if (e.target.classList.contains('rh')) return;  // リサイズハンドルは除外

  const hits = [];
  document.querySelectorAll('#canvas-elems .ce').forEach(el => {
    const rect = el.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top  && e.clientY <= rect.bottom) {
      const id   = parseInt(el.dataset.id);
      const elem = State.getElem(id);
      if (elem && elem.visible) {
        hits.push({ id, zindex: elem.zindex || 0, area: rect.width * rect.height });
      }
    }
  });

  if (!hits.length) {
    PlayState.select(null);
    return;
  }

  // zindex 降順、同 zindex は面積昇順（小さい要素を優先）
  hits.sort((a, b) => {
    if (a.zindex !== b.zindex) return b.zindex - a.zindex;
    return a.area - b.area;
  });

  const { id } = hits[0];
  PlayState.select(id);
  window.Drag?.startMove(e, id);
});

// Ctrl+wheel ズーム
document.getElementById('canvas-wrap').addEventListener('wheel', e => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  if (zoom === null) fit();
  zoom = Math.min(Math.max(zoom * (e.deltaY < 0 ? 1.1 : 0.9), 0.05), 4);
  applyZoom();
  render();
}, { passive: false });

window.addEventListener('resize', () => {
  fit();
  render();
  window.Timeline?.render();
});

export const Canvas = { fit, render, zoomBy, getZoom: () => zoom };
