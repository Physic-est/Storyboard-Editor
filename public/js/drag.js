import { State }     from './state.js';
import { PlayState } from './playstate.js';
import { Canvas }    from './canvas.js';
import { AnimMath }  from './anim-math.js';
import { History }   from './history.js';
import { Bus }       from './bus.js';

/** キャンバス要素のドラッグ移動・リサイズ */

const SNAP_PX = 8; // スナップ判定距離 (CSS px)

let _state = null;

// 任意の単位・式を論理 px に変換
function toPx(v, unit, dim, ub) {
  if (typeof v === 'string' || unit === 'expr') {
    return AnimMath.evalExpr(v, dim, ub);
  }
  const n = typeof v === 'number' ? v : (parseFloat(v) || 0);
  if (unit === '_px' || unit === 'px') return n;
  if (unit === '%')   return n / 100 * dim;
  if (unit === 'rel') return n * ub;
  return n;
}

function getUnitBase() {
  const s = State.getSettings();
  return (s.height || 1080) / (s.unit || 1080);
}

// 他要素のエッジ/センターを CSS px (canvas-stage 基準) で収集。canvas 端も含む
function collectSnapTargets(excludeId) {
  const stage = document.getElementById('canvas-stage');
  const sr    = stage.getBoundingClientRect();
  const { width, height } = State.getSettings();
  const sc = stage._sc || 0.5;
  const W  = width * sc, H = height * sc;
  const out = [{ xs: [0, W / 2, W], ys: [0, H / 2, H] }];
  document.querySelectorAll('#canvas-elems .ce').forEach(el => {
    if (parseInt(el.dataset.id) === excludeId) return;
    const r = el.getBoundingClientRect();
    const l = r.left - sr.left, t = r.top - sr.top;
    const ri = l + r.width, bo = t + r.height;
    out.push({ xs: [l, (l + ri) / 2, ri], ys: [t, (t + bo) / 2, bo] });
  });
  return out;
}

// スナップ線を #snap-lines に描画
function drawSnapLines(lines) {
  const ov = document.getElementById('snap-lines');
  if (!ov) return;
  if (!lines.length) { ov.innerHTML = ''; return; }
  const st = document.getElementById('canvas-stage');
  const W  = st.offsetWidth, H = st.offsetHeight;
  ov.innerHTML = lines.map(({ x, y }) =>
    x != null
      ? `<div style="position:absolute;left:${x - 0.5}px;top:0;width:1px;height:${H}px;` +
        `background:#56d6f5;pointer-events:none;z-index:999;opacity:.9;"></div>`
      : `<div style="position:absolute;left:0;top:${y - 0.5}px;width:${W}px;height:1px;` +
        `background:#56d6f5;pointer-events:none;z-index:999;opacity:.9;"></div>`
  ).join('');
}

// 最近傍スナップ候補を返す: { delta, line } or null
function bestSnap(vals, allTargets) {
  let best = null;
  for (const v of vals) {
    for (const t of allTargets) {
      const d = v - t;
      if (Math.abs(d) < SNAP_PX && (!best || Math.abs(d) < Math.abs(best.delta)))
        best = { delta: d, line: t };
    }
  }
  return best;
}

function startMove(e, id) {
  const elem = State.getElem(id); if (!elem || elem.locked) return;
  e.preventDefault();
  History.push();
  const sc = document.getElementById('canvas-stage')._sc || 0.5;
  const { width, height } = State.getSettings();
  const ub = getUnitBase();

  // pos を論理 px に統一（ドラッグ中の計算用）
  const pxU = elem.posXUnit ?? elem.posUnit ?? '%';
  const pyU = elem.posYUnit ?? elem.posUnit ?? '%';
  elem.x = toPx(elem.x ?? 0, pxU, width,  ub);
  elem.y = toPx(elem.y ?? 0, pyU, height, ub);
  elem.posUnit = 'px';
  delete elem.posXUnit; delete elem.posYUnit;

  _state = {
    mode: 'move', id, sc, width, height,
    startX: e.clientX, startY: e.clientY,
    origX: elem.x, origY: elem.y,
    targets: collectSnapTargets(id)
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

function startResize(e, id, corner) {
  const elem = State.getElem(id); if (!elem || elem.locked) return;
  e.preventDefault();
  History.push();
  PlayState.select(id);
  const sc = document.getElementById('canvas-stage')._sc || 0.5;
  const { width, height } = State.getSettings();
  const ub = getUnitBase();

  // size を論理 px に統一（ドラッグ中の計算用）
  const swU = elem.sizeXUnit ?? elem.sizeUnit ?? 'px';
  const shU = elem.sizeYUnit ?? elem.sizeUnit ?? 'px';
  elem.w = toPx(elem.w ?? 0, swU, width,  ub);
  elem.h = toPx(elem.h ?? 0, shU, height, ub);
  elem.sizeUnit = 'px';
  delete elem.sizeXUnit; delete elem.sizeYUnit;

  _state = {
    mode: 'resize', id, corner, sc, width, height,
    startX: e.clientX, startY: e.clientY,
    origW: elem.w, origH: elem.h,
    targets: collectSnapTargets(id)
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

function onMove(e) {
  if (!_state) return;
  const { id, sc, width, height, targets } = _state;
  const elem = State.getElem(id); if (!elem) return;

  const dx = (e.clientX - _state.startX) / sc;
  const dy = (e.clientY - _state.startY) / sc;
  const H  = height * sc;
  const ub = getUnitBase();

  const anchor = elem.anchor ?? 0;
  const ax = anchor % 3;
  const ay = Math.floor(anchor / 3);

  const snapLines = [];
  const allXs = targets.flatMap(t => t.xs);
  const allYs = targets.flatMap(t => t.ys);

  if (_state.mode === 'move') {
    let propX = _state.origX + dx;
    let propY = _state.origY - dy;  // UIS は左下原点（Y上向き）

    if (targets.length) {
      // move 中 posUnit='px' だが sizeUnit は元のままなので正しく解決する
      const swU = elem.sizeXUnit ?? elem.sizeUnit ?? 'px';
      const shU = elem.sizeYUnit ?? elem.sizeUnit ?? 'px';
      const pw  = toPx(elem.w ?? 0, swU, width,  ub) * sc;
      const ph  = toPx(elem.h ?? 0, shU, height, ub) * sc;
      const eox = ax * pw / 2, eoy = ay * ph / 2;
      const cl  = propX * sc - eox;
      const ct  = H - propY * sc - eoy;
      const cr  = cl + pw, cb = ct + ph;

      const sx = bestSnap([cl, (cl + cr) / 2, cr], allXs);
      const sy = bestSnap([ct, (ct + cb) / 2, cb], allYs);

      if (sx) { propX -= sx.delta / sc; snapLines.push({ x: sx.line }); }
      if (sy) { propY += sy.delta / sc; snapLines.push({ y: sy.line }); }
    }

    elem.x = propX;
    elem.y = propY;

  } else {
    // リサイズ
    let newW = _state.origW, newH = _state.origH;
    const { corner } = _state;

    if (corner === 'br' || corner === 'tr') newW = Math.max(1, _state.origW + dx);
    if (corner === 'bl' || corner === 'tl') newW = Math.max(1, _state.origW - dx);
    if (corner === 'br' || corner === 'bl') newH = Math.max(1, _state.origH + dy);
    if (corner === 'tr' || corner === 'tl') newH = Math.max(1, _state.origH - dy);

    if (targets.length) {
      // anchor オフセット係数
      const kR = 1 - ax / 2, kL = ax / 2;
      const kB = 1 - ay / 2, kT = ay / 2;
      // resize 中 posUnit は元のままなので正しく解決する
      const pxU = elem.posXUnit ?? elem.posUnit ?? '%';
      const pyU = elem.posYUnit ?? elem.posUnit ?? '%';
      const ex  = toPx(elem.x ?? 0, pxU, width,  ub) * sc;
      const ey  = H - toPx(elem.y ?? 0, pyU, height, ub) * sc;

      if ((corner === 'br' || corner === 'tr') && kR > 0) {
        const cssR = ex + kR * newW * sc;
        const sx = bestSnap([cssR], allXs);
        if (sx) { newW -= sx.delta / (kR * sc); snapLines.push({ x: sx.line }); }
      }
      if ((corner === 'bl' || corner === 'tl') && kL > 0) {
        const cssL = ex - kL * newW * sc;
        const sx = bestSnap([cssL], allXs);
        if (sx) { newW += sx.delta / (kL * sc); snapLines.push({ x: sx.line }); }
      }
      if ((corner === 'br' || corner === 'bl') && kB > 0) {
        const cssB = ey + kB * newH * sc;
        const sy = bestSnap([cssB], allYs);
        if (sy) { newH -= sy.delta / (kB * sc); snapLines.push({ y: sy.line }); }
      }
      if ((corner === 'tr' || corner === 'tl') && kT > 0) {
        const cssT = ey - kT * newH * sc;
        const sy = bestSnap([cssT], allYs);
        if (sy) { newH += sy.delta / (kT * sc); snapLines.push({ y: sy.line }); }
      }

      newW = Math.max(1, newW);
      newH = Math.max(1, newH);
    }

    elem.w = newW;
    elem.h = newH;
  }

  drawSnapLines(snapLines);
  Canvas.render();
  window.Props?.render();
  window.CodeGen?.update();
}

function onUp() {
  drawSnapLines([]);
  if (_state) {
    const elem = State.getElem(_state.id);
    if (elem) {
      const ub = getUnitBase();
      if (_state.mode === 'move') {
        // 論理 px → 単位なし (rel) に変換して確定
        elem.x = elem.x / ub;
        elem.y = elem.y / ub;
        elem.posUnit = 'rel';
        delete elem.posXUnit; delete elem.posYUnit;
      } else {
        // 論理 px → 単位なし (rel) に変換して確定
        elem.w = elem.w / ub;
        elem.h = elem.h / ub;
        elem.sizeUnit = 'rel';
        delete elem.sizeXUnit; delete elem.sizeYUnit;
      }
    }
  }
  const had = !!_state;
  _state = null;
  document.removeEventListener('mousemove', onMove);
  document.removeEventListener('mouseup',   onUp);
  if (had) Bus.emit('project-changed');
}

export const Drag = { startMove, startResize };
