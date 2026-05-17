import { State }      from './state.js';
import { PlayState }  from './playstate.js';
import { Bus }        from './bus.js';
import { Animations } from './animations.js';
import { UI }         from './ui.js';

/** タイムライン — ルーラー・トラック描画とインタラクション */
const ZOOM_STEPS = [0.01, 0.02, 0.03, 0.05, 0.08, 0.12, 0.2, 0.32, 0.5, 0.8, 1.2];
let zoom     = 0.06;
let ctxState = null;

function TRACK_H() {
  return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--track-h')) || 28;
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function zoomStep(dir) {
  const ci = ZOOM_STEPS.findIndex(s => s >= zoom);
  const ni = Math.min(Math.max((ci < 0 ? ZOOM_STEPS.length - 1 : ci) + dir, 0), ZOOM_STEPS.length - 1);
  zoom = ZOOM_STEPS[ni];
  render();
}

/**
 * 要素リストからタイムライン行を構築する。
 * 同一要素に複数のアニメーション種別がある場合は種別ごとにサブ行を生成。
 *
 * 返り値: [{ elem, type:string|null, isFirst:bool }, ...]
 *   type=null → アニメーションなし（要素行のみ）
 *   isFirst   → その要素の先頭行かどうか
 */
function buildRows(elems) {
  const rows = [];
  for (const elem of elems) {
    const types = [...new Set((elem.animations || []).map(a => a.name).filter(Boolean))];
    if (types.length <= 1) {
      rows.push({ elem, type: types[0] || null, isFirst: true });
    } else {
      types.forEach((t, i) => rows.push({ elem, type: t, isFirst: i === 0 }));
    }
  }
  return rows;
}

function render() {
  const elems     = State.getElems();
  const rows      = buildRows(elems);
  const scrollEl  = document.getElementById('tl-scroll-area');
  const labelsEl  = document.getElementById('tl-labels');
  const rulerCv   = document.getElementById('tl-ruler-cv');
  const trackCv   = document.getElementById('tl-cv');
  const dpr       = window.devicePixelRatio || 1;
  const audioDur  = window.Audio?.duration || 10000;

  const totalMs = Math.max(
    audioDur,
    ...elems.flatMap(e => e.animations.map(a => a.atimeEnd ?? a.time ?? a.atimeStart ?? 0)),
    10000
  );
  const TH      = TRACK_H();
  const visW    = scrollEl.clientWidth  || 600;
  const scrollX = scrollEl.scrollLeft;
  // trackW はスクロール領域の仮想幅 (Canvas に割り当てない)
  const trackW  = Math.max(totalMs * zoom, visW);
  const trackH  = Math.max(rows.length * TH, scrollEl.clientHeight || 160);

  // ── ラベル ──
  labelsEl.innerHTML = '';
  rows.forEach(row => {
    const color = State.elemColor(row.elem.colorIdx);
    const isSel = row.elem.id === PlayState.selectedId;
    const lbl   = document.createElement('div');

    if (row.isFirst) {
      lbl.className = 'tl-lbl' + (isSel ? ' sel' : '');
      lbl.dataset.id = row.elem.id;
      lbl.onclick = () => PlayState.select(row.elem.id);
      lbl.innerHTML =
        `<div class="tl-dot" style="background:${color}"></div>` +
        `<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${row.elem.name}</span>` +
        (row.type ? `<span class="tl-type-badge">${row.type}</span>` : '');
    } else {
      // サブ行（2種目以降のアニメーション種別）
      lbl.className = 'tl-lbl tl-lbl-sub' + (isSel ? ' sel' : '');
      lbl.dataset.id = row.elem.id;
      lbl.onclick = () => PlayState.select(row.elem.id);
      lbl.innerHTML =
        `<div class="tl-dot" style="background:${color};opacity:.4"></div>` +
        `<span class="tl-type-badge" style="background:${color}22;color:${color}">${row.type}</span>`;
    }
    labelsEl.appendChild(lbl);
  });

  // ── ルーラー ──
  rulerCv.width        = visW * dpr;
  rulerCv.height       = 26 * dpr;
  rulerCv.style.width  = visW + 'px';
  rulerCv.style.height = '26px';
  const rctx = rulerCv.getContext('2d');
  rctx.scale(dpr, dpr);
  drawRuler(rctx, visW, scrollX);

  // ── トラック ──
  // Canvas をビューポート幅に限定してブラウザの最大サイズ制限を回避する。
  // tl-canvas-wrap だけを仮想全幅に設定してスクロール領域を確保し、
  // Canvas 自体はスクロール位置に合わせて絶対配置＋描画オフセットを使う。
  document.getElementById('tl-canvas-wrap').style.cssText =
    `width:${trackW}px;height:${trackH}px;position:relative;`;
  trackCv.width        = visW * dpr;
  trackCv.height       = trackH * dpr;
  trackCv.style.cssText =
    `display:block;position:absolute;top:0;left:${scrollX}px;` +
    `width:${visW}px;height:${trackH}px;`;
  const ctx = trackCv.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.translate(-scrollX, 0);
  drawTracks(ctx, trackW, trackH, rows);

  updatePlayhead();
}

function drawRuler(ctx, w, scroll) {
  ctx.fillStyle = cssVar('--bg2');
  ctx.fillRect(0, 0, w, 26);
  ctx.strokeStyle = cssVar('--bdr');
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 25.5); ctx.lineTo(w, 25.5); ctx.stroke();

  const startMs = scroll / zoom;
  const endMs   = (scroll + w) / zoom;
  const minor = 500, major = 1000;

  for (let ms = Math.floor(startMs / minor) * minor; ms <= endMs; ms += minor) {
    const x     = ms * zoom - scroll;
    const isMaj = ms % major === 0;
    ctx.strokeStyle = isMaj ? cssVar('--bdr2') : cssVar('--bdr');
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, isMaj ? 4 : 14); ctx.lineTo(x, 26); ctx.stroke();
    if (isMaj) {
      const s = ms / 1000, m = Math.floor(s / 60), sec = (s % 60).toFixed(1);
      ctx.fillStyle = cssVar('--tx1');
      ctx.font = `9px 'Menlo','Consolas',monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(`${m}:${sec.padStart(4, '0')}`, x + 3, 12);
    }
  }
}

function drawTracks(ctx, w, h, rows) {
  const TH = TRACK_H();
  rows.forEach((row, ri) => {
    const y     = ri * TH;
    const color = State.elemColor(row.elem.colorIdx);
    const isSel = row.elem.id === PlayState.selectedId;

    ctx.fillStyle = ri % 2 === 0 ? cssVar('--tl-even') : cssVar('--tl-odd');
    ctx.fillRect(0, y, w, TH);
    ctx.strokeStyle = cssVar('--bdr');
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y + TH - 0.5); ctx.lineTo(w, y + TH - 0.5); ctx.stroke();

    // この行に属するアニメーションだけ描画
    const anims = (row.elem.animations || []).filter(
      a => row.type === null || a.name === row.type
    );

    anims.forEach(anim => {
      const alpha = isSel ? 0.9 : 0.55;
      const hexA  = Math.round(alpha * 255).toString(16).padStart(2, '0');
      const barY  = y + 4, barH = TH - 8;

      // show/hide: ダイヤモンドマーカー（瞬間イベント）
      if (anim.name === 'show' || anim.name === 'hide') {
        const mx = (anim.time ?? anim.atimeStart ?? 0) * zoom;
        const cy = y + TH / 2;
        const mr = Math.min(barH / 2, 8);
        ctx.beginPath();
        ctx.moveTo(mx,      cy - mr);
        ctx.lineTo(mx + mr, cy);
        ctx.lineTo(mx,      cy + mr);
        ctx.lineTo(mx - mr, cy);
        ctx.closePath();
        ctx.fillStyle = color + hexA;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth   = isSel ? 1.5 : 0.8;
        ctx.stroke();
        ctx.fillStyle   = color;
        ctx.globalAlpha = 0.85;
        ctx.font        = `8px 'Menlo','Consolas',monospace`;
        ctx.textAlign   = 'left';
        ctx.fillText(anim.name, mx + mr + 3, cy + 3);
        ctx.globalAlpha = 1;
        return;
      }

      const s  = anim.atimeStart || 0;
      const e  = anim.atimeEnd   || s + 1000;
      const x1 = s * zoom;
      const bw = Math.max((e - s) * zoom, 6);

      ctx.fillStyle = color + hexA;
      ctx.beginPath(); roundRect(ctx, x1, barY, bw, barH, 3); ctx.fill();

      ctx.strokeStyle = color;
      ctx.lineWidth   = isSel ? 1.5 : 0.8;
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.fillRect(x1,           barY, 3, barH);
      ctx.fillRect(x1 + bw - 3,  barY, 3, barH);

      if (bw > 26) {
        ctx.fillStyle   = '#fff';
        ctx.globalAlpha = 0.75;
        ctx.font        = `8px 'Menlo','Consolas',monospace`;
        ctx.textAlign   = 'left';
        ctx.fillText(anim.name, x1 + 5, barY + 9);
        ctx.globalAlpha = 1;
      }
    });
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

function updatePlayhead() {
  const ph = document.getElementById('tl-playhead');
  const sc = document.getElementById('tl-scroll-area');
  ph.style.left   = (PlayState.currentTime * zoom) + 'px';
  ph.style.height = Math.max(sc.scrollHeight, sc.clientHeight, 100) + 'px';
}

function onScroll(el) {
  document.getElementById('tl-labels').scrollTop = el.scrollTop;
  const dpr     = window.devicePixelRatio || 1;
  const visW    = el.clientWidth || 600;
  const scrollX = el.scrollLeft;

  // ── ルーラー再描画 ──
  const rulerCv = document.getElementById('tl-ruler-cv');
  rulerCv.width        = visW * dpr;
  rulerCv.height       = 26 * dpr;
  rulerCv.style.width  = visW + 'px';
  rulerCv.style.height = '26px';
  const rctx = rulerCv.getContext('2d');
  rctx.scale(dpr, dpr);
  drawRuler(rctx, visW, scrollX);

  // ── トラックキャンバス再描画 ──
  const trackCv = document.getElementById('tl-cv');
  const elems   = State.getElems();
  const rows    = buildRows(elems);
  const TH      = TRACK_H();
  const audioDur = window.Audio?.duration || 10000;
  const totalMs  = Math.max(
    audioDur,
    ...elems.flatMap(e => e.animations.map(a => a.atimeEnd ?? a.time ?? a.atimeStart ?? 0)),
    10000
  );
  const trackW = Math.max(totalMs * zoom, visW);
  const trackH = Math.max(rows.length * TH, el.clientHeight || 160);

  trackCv.style.left = scrollX + 'px';
  // 幅/高さが変わっていなくても width 代入で context が reset されるため setTransform で再設定する
  trackCv.width  = visW * dpr;
  trackCv.height = trackH * dpr;
  const ctx = trackCv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(-scrollX, 0);
  drawTracks(ctx, trackW, trackH, rows);
}

// ── マウスイベント ──
let drag = null;

/** クリック座標から行インデックスとアニメーションのヒット情報を返す */
function hitTest(e) {
  const scrollEl = document.getElementById('tl-scroll-area');
  const rect     = scrollEl.getBoundingClientRect();
  const x        = e.clientX - rect.left + scrollEl.scrollLeft;
  const y        = e.clientY - rect.top  + scrollEl.scrollTop;
  const ms       = x / zoom;
  const TH       = TRACK_H();
  const ri       = Math.floor(y / TH);
  const rows     = buildRows(State.getElems());
  const row      = rows[ri] || null;

  if (!row) return { ms, row: null, elem: null, hitAnim: -1, hitPart: null };

  const elem   = row.elem;
  const EDGE   = 6 / zoom;
  let hitAnim  = -1, hitPart = null;

  // この行に属するアニメーションのみ当たり判定
  const anims = elem.animations.filter(
    a => row.type === null || a.name === row.type
  );
  for (const a of anims) {
    const ai = elem.animations.indexOf(a);
    if (a.name === 'show' || a.name === 'hide') {
      const t = a.time ?? a.atimeStart ?? 0;
      if (ms >= t - EDGE && ms <= t + EDGE) {
        hitAnim = ai; hitPart = 'move'; break;
      }
    } else {
      const s  = a.atimeStart || 0;
      const en = a.atimeEnd   || s + 1000;
      if (ms >= s - EDGE && ms <= en + EDGE) {
        hitAnim = ai;
        hitPart = ms < s + EDGE ? 'left' : ms > en - EDGE ? 'right' : 'move';
        break;
      }
    }
  }
  return { ms, row, elem, hitAnim, hitPart };
}

document.getElementById('tl-scroll-area').addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const { ms, elem, hitAnim, hitPart } = hitTest(e);

  if (!elem) {
    drag = { type: 'seek' };
    window.Audio?.seek(Math.max(0, ms));
    return;
  }

  if (hitAnim >= 0) {
    e.preventDefault();
    PlayState.select(elem.id);
    const a = elem.animations[hitAnim];
    const isInstant = a.name === 'show' || a.name === 'hide';
    drag = {
      type: hitPart === 'move' ? 'tl-move' : hitPart === 'left' ? 'tl-rl' : 'tl-rr',
      elemId: elem.id, animIdx: hitAnim, startMs: ms,
      origStart: isInstant ? (a.time ?? a.atimeStart ?? 0) : (a.atimeStart || 0),
      origEnd:   isInstant ? (a.time ?? a.atimeStart ?? 0) : (a.atimeEnd   || 0)
    };
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup',   onDragUp);
  } else {
    drag = { type: 'seek' };
    window.Audio?.seek(Math.max(0, ms));
    document.addEventListener('mousemove', onSeekMove);
    document.addEventListener('mouseup',   onSeekUp);
  }
});

// ダブルクリックで編集モーダルを開く
document.getElementById('tl-scroll-area').addEventListener('dblclick', e => {
  const { elem, hitAnim } = hitTest(e);
  if (elem && hitAnim >= 0) {
    e.preventDefault();
    Animations.beginEdit(elem.id, hitAnim);
  }
});

function onDragMove(e) {
  if (!drag || drag.type === 'seek') return;
  const scrollEl = document.getElementById('tl-scroll-area');
  const rect     = scrollEl.getBoundingClientRect();
  const x        = e.clientX - rect.left + scrollEl.scrollLeft;
  const ms       = Math.max(0, x / zoom);
  const delta    = ms - drag.startMs;
  const elem     = State.getElem(drag.elemId); if (!elem) return;
  const anim     = elem.animations[drag.animIdx]; if (!anim) return;
  const MIN      = 50;

  if (anim.name === 'show' || anim.name === 'hide') {
    const newT = Math.max(0, Math.round(drag.origStart + delta));
    if (anim.time !== undefined) anim.time = newT;
    else anim.atimeStart = newT;
  } else if (drag.type === 'tl-move') {
    const dur = drag.origEnd - drag.origStart;
    anim.atimeStart = Math.max(0, Math.round(drag.origStart + delta));
    anim.atimeEnd   = anim.atimeStart + dur;
  } else if (drag.type === 'tl-rl') {
    anim.atimeStart = Math.max(0, Math.min(Math.round(drag.origStart + delta), drag.origEnd - MIN));
  } else {
    anim.atimeEnd = Math.max(drag.origStart + MIN, Math.round(drag.origEnd + delta));
  }

  render();
  window.Props?.render();
  window.CodeGen?.update();
  window.Canvas?.render();
}

function onDragUp() {
  drag = null;
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup',   onDragUp);
}

function onSeekMove(e) {
  const scrollEl = document.getElementById('tl-scroll-area');
  const rect     = scrollEl.getBoundingClientRect();
  const x        = e.clientX - rect.left + scrollEl.scrollLeft;
  window.Audio?.seek(Math.max(0, x / zoom));
}

function onSeekUp() {
  drag = null;
  document.removeEventListener('mousemove', onSeekMove);
  document.removeEventListener('mouseup',   onSeekUp);
}

// ── コンテキストメニュー ──
function onContextMenu(e) {
  e.preventDefault();
  const { ms, elem, hitAnim } = hitTest(e);
  ctxState = { elemId: elem?.id, animIdx: hitAnim, ms };
  document.getElementById('ctx-del-anim').classList.toggle('hidden',  hitAnim < 0);
  document.getElementById('ctx-edit-anim').classList.toggle('hidden', hitAnim < 0);
  UI.showCtxMenu(e.clientX, e.clientY);
}

function ctxAddAnim() {
  UI.hideCtxMenu();
  if (ctxState?.elemId) {
    Animations.beginAdd(ctxState.elemId);
    document.getElementById('ma-start').value = Math.round(ctxState.ms);
    document.getElementById('ma-end').value   = Math.round(ctxState.ms) + 1000;
  }
}

function ctxDelAnim() {
  UI.hideCtxMenu();
  if (ctxState?.elemId !== undefined && ctxState.animIdx >= 0) {
    Animations.remove(ctxState.elemId, ctxState.animIdx);
  }
}

function ctxEditAnim() {
  UI.hideCtxMenu();
  if (ctxState?.elemId !== undefined && ctxState.animIdx >= 0) {
    Animations.beginEdit(ctxState.elemId, ctxState.animIdx);
  }
}

// Ctrl+wheel ズーム
document.getElementById('tl-scroll-area').addEventListener('wheel', e => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  zoomStep(e.deltaY < 0 ? 1 : -1);
}, { passive: false });

function scrollBy(px) {
  const el = document.getElementById('tl-scroll-area');
  if (el) el.scrollLeft = Math.max(0, el.scrollLeft + px);
}

export const Timeline = {
  render, zoomStep, onScroll, onContextMenu,
  ctxAddAnim, ctxDelAnim, ctxEditAnim,
  updatePlayhead, scrollBy
};
