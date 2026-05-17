import { State }     from './state.js';
import { PlayState } from './playstate.js';
import { Bus }       from './bus.js';
import { UI }        from './ui.js';
import { I18n }      from './i18n.js';
import { History }   from './history.js';

/** アニメーションキーフレームの追加・削除・編集 */
let pendingElemId  = null;
let pendingEditIdx = -1;   // -1 = 追加モード, >=0 = 編集モード

const INSTANT_TYPES = new Set(['show', 'hide']);
const XY_TYPES      = new Set(['move', 'size', 'scale', 'skew']);
const XY_LABELS     = { move: ['X','Y'], size: ['W','H'], scale: ['X','Y'], skew: ['X','Y'] };
const KNOWN_TRANS   = new Set(['', 'easein', 'easeout']);

/**
 * タプル文字列 "(50%+300,340)" または "50%+300,340" を X,Y 配列に分割。
 * 括弧内のカンマは分割しない（ネスト式対応）。
 */
function _splitTuple(s) {
  const str   = String(s ?? '').trim();
  const inner = str.startsWith('(') ? str.slice(1, str.lastIndexOf(')')) : str;
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of inner) {
    if      (ch === '(') { depth++; cur += ch; }
    else if (ch === ')') { depth--; cur += ch; }
    else if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

// ── イージングプレビュー ────────────────────────────────────────────

const EASING_PRESETS = {
  '':        [0, 0, 1, 1],
  'easein':  [0.42, 0, 1, 1],
  'easeout': [0, 0, 0.58, 1],
};

function _drawEasingPreview() {
  const canvas = document.getElementById('ma-easing-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const pad = 10;
  const DW = W - 2 * pad, DH = H - 2 * pad;
  const cs = getComputedStyle(document.documentElement);

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = cs.getPropertyValue('--bg3').trim();
  ctx.fillRect(0, 0, W, H);

  // グリッド
  ctx.strokeStyle = cs.getPropertyValue('--bdr').trim();
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const gx = pad + (i / 4) * DW;
    const gy = pad + (i / 4) * DH;
    ctx.beginPath(); ctx.moveTo(gx, pad); ctx.lineTo(gx, H - pad); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad, gy); ctx.lineTo(W - pad, gy); ctx.stroke();
  }

  const sel = document.getElementById('ma-trans').value;
  let x1, y1, x2, y2;
  if (sel === 'custom') {
    x1 = parseFloat(document.getElementById('ma-trans-b0').value);
    y1 = parseFloat(document.getElementById('ma-trans-b1').value);
    x2 = parseFloat(document.getElementById('ma-trans-b2').value);
    y2 = parseFloat(document.getElementById('ma-trans-b3').value);
    if ([x1, y1, x2, y2].some(isNaN)) return;
  } else {
    const p = EASING_PRESETS[sel];
    if (!p) return;
    [x1, y1, x2, y2] = p;
  }

  // カーブ描画
  ctx.strokeStyle = cs.getPropertyValue('--accent').trim();
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pad, H - pad);
  for (let i = 1; i <= 80; i++) {
    const t = i / 80, mt = 1 - t;
    const bx = 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t;
    const by = 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t;
    ctx.lineTo(pad + bx * DW, (H - pad) - by * DH);
  }
  ctx.stroke();

  // カスタム時はコントロールハンドルも表示
  if (sel === 'custom') {
    ctx.strokeStyle = cs.getPropertyValue('--accent').trim();
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(pad, H - pad); ctx.lineTo(pad + x1 * DW, (H - pad) - y1 * DH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W - pad, pad); ctx.lineTo(pad + x2 * DW, (H - pad) - y2 * DH); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}

// ── バリデーション ──────────────────────────────────────────────────

function _clearErrors() {
  document.querySelectorAll('#m-add-anim .modal-field').forEach(f => f.classList.remove('is-error'));
  document.querySelectorAll('#m-add-anim .modal-err').forEach(e => e.classList.add('hidden'));
}

function _validate() {
  _clearErrors();
  const type = document.getElementById('ma-type').value;
  const isInstant = INSTANT_TYPES.has(type);
  const isXY = XY_TYPES.has(type);
  let ok = true;
  let firstErr = null;

  if (!isInstant) {
    if (isXY) {
      const tx = document.getElementById('ma-to-x').value.trim();
      const ty = document.getElementById('ma-to-y').value.trim();
      if (!tx && !ty) {
        document.getElementById('ma-to-x').classList.add('is-error');
        document.getElementById('ma-to-y').classList.add('is-error');
        document.getElementById('ma-to-xy-err').classList.remove('hidden');
        firstErr = firstErr ?? document.getElementById('ma-to-x');
        ok = false;
      }
    } else {
      const toVal = document.getElementById('ma-to').value.trim();
      if (!toVal) {
        document.getElementById('ma-to').classList.add('is-error');
        document.getElementById('ma-to-err').classList.remove('hidden');
        firstErr = firstErr ?? document.getElementById('ma-to');
        ok = false;
      }
    }

    // 時刻チェック (range / plus モード)
    const form = document.getElementById('ma-time-form').value;
    if (form === 'range' || form === 'plus') {
      const start = parseInt(document.getElementById('ma-start').value) || 0;
      const dur   = parseInt(document.getElementById('ma-duration').value) || 0;
      const end   = form === 'plus'
        ? start + dur
        : (parseInt(document.getElementById('ma-end').value) || 0);
      if (end <= start) {
        const errField = form === 'plus'
          ? document.getElementById('ma-duration')
          : document.getElementById('ma-end');
        errField.classList.add('is-error');
        document.getElementById('ma-time-err').classList.remove('hidden');
        firstErr = firstErr ?? errField;
        ok = false;
      }
    }
  }

  if (firstErr) firstErr.focus();
  return ok;
}

// ── UI 同期ヘルパー ───────────────────────────────────────────────

function _syncModalForType(name) {
  const isInstant = INSTANT_TYPES.has(name);
  const isXY      = XY_TYPES.has(name);

  // from / to
  document.getElementById('ma-row-from').classList.toggle('hidden', isInstant || isXY);
  document.getElementById('ma-row-to').classList.toggle('hidden', isInstant || isXY);
  document.getElementById('ma-row-from-xy').classList.toggle('hidden', isInstant || !isXY);
  document.getElementById('ma-row-to-xy').classList.toggle('hidden', isInstant || !isXY);

  // 時刻形式セレクト（show/hide は単一トリガー時刻のみ）
  document.getElementById('ma-row-time-form').classList.toggle('hidden', isInstant);

  // trans / repeat（show/hide には不要）
  document.getElementById('ma-row-trans').classList.toggle('hidden', isInstant);
  document.getElementById('ma-row-trans-custom').classList.add('hidden');
  document.getElementById('ma-row-repeat').classList.toggle('hidden', isInstant);

  // XY ラベル更新
  if (isXY) {
    const [lx, ly] = XY_LABELS[name] ?? ['X', 'Y'];
    document.getElementById('ma-from-x-lbl').textContent = lx;
    document.getElementById('ma-from-y-lbl').textContent = ly;
    document.getElementById('ma-to-x-lbl').textContent   = lx;
    document.getElementById('ma-to-y-lbl').textContent   = ly;
  }

  // 時刻フィールド
  if (isInstant) {
    // 発火時刻のみ
    document.getElementById('ma-start-lbl').textContent = '発火時刻 (ms)';
    document.getElementById('ma-row-start').classList.remove('hidden');
    document.getElementById('ma-row-end').classList.add('hidden');
    document.getElementById('ma-row-duration').classList.add('hidden');
  } else {
    document.getElementById('ma-start-lbl').textContent = '開始 (ms)';
    _syncModalForTimeForm(document.getElementById('ma-time-form').value);
  }
}

function _syncModalForTimeForm(form) {
  // end   → 開始非表示・終了表示・継続非表示
  // range → 開始表示・終了表示・継続非表示
  // plus  → 開始表示・終了非表示・継続表示
  document.getElementById('ma-row-start').classList.toggle('hidden', form === 'end');
  document.getElementById('ma-row-end').classList.toggle('hidden', form === 'plus');
  document.getElementById('ma-row-duration').classList.toggle('hidden', form !== 'plus');
}

function _syncModalForTrans(val) {
  document.getElementById('ma-row-trans-custom').classList.toggle('hidden', val !== 'custom');
}

// ── 公開イベントハンドラ ──────────────────────────────────────────

function onTypeChange() {
  _syncModalForType(document.getElementById('ma-type').value);
}

function onTimeFormChange() {
  const isInstant = INSTANT_TYPES.has(document.getElementById('ma-type').value);
  if (!isInstant) _syncModalForTimeForm(document.getElementById('ma-time-form').value);
}

function onTransChange() {
  _syncModalForTrans(document.getElementById('ma-trans').value);
  _drawEasingPreview();
}

function onBezierInput() {
  _drawEasingPreview();
}

// ── 読み書きヘルパー ─────────────────────────────────────────────

/** anim の atimeStart/atimeEnd → timeForm を推定（保存値があればそれを使う） */
function _inferTimeForm(anim) {
  if (anim.timeForm) return anim.timeForm;
  return (anim.atimeStart || 0) === 0 ? 'end' : 'plus';
}

/** フォームから時刻値を読み取って {atimeStart, atimeEnd, timeMode, timeForm} を返す */
function _readTimeFields(isInstant) {
  const timeMode = document.getElementById('ma-time-mode').value;
  if (isInstant) {
    const t = parseInt(document.getElementById('ma-start').value) || 0;
    return { atimeStart: t, atimeEnd: t, timeMode };
  }
  const form = document.getElementById('ma-time-form').value;
  let atimeStart, atimeEnd;
  if (form === 'end') {
    atimeStart = 0;
    atimeEnd   = parseInt(document.getElementById('ma-end').value) || 0;
  } else if (form === 'range') {
    atimeStart = parseInt(document.getElementById('ma-start').value) || 0;
    atimeEnd   = parseInt(document.getElementById('ma-end').value)   || 0;
  } else { // plus
    atimeStart = parseInt(document.getElementById('ma-start').value)    || 0;
    atimeEnd   = atimeStart + (parseInt(document.getElementById('ma-duration').value) || 0);
  }
  return { atimeStart, atimeEnd, timeMode, timeForm: form };
}

/** アニメーションの時刻情報をフォームに書き込む */
function _writeTimeFields(anim, isInstant) {
  document.getElementById('ma-time-mode').value = anim.timeMode || 'atime';
  if (isInstant) {
    const t = anim.atimeStart ?? anim.time ?? 0;  // backward compat: 古い time プロパティも読む
    document.getElementById('ma-start').value = t;
  } else {
    const s    = anim.atimeStart ?? 0;
    const e    = anim.atimeEnd   ?? 1000;
    const form = _inferTimeForm(anim);
    document.getElementById('ma-time-form').value = form;
    if (form === 'end') {
      document.getElementById('ma-end').value = e;
    } else if (form === 'range') {
      document.getElementById('ma-start').value = s;
      document.getElementById('ma-end').value   = e;
    } else { // plus
      document.getElementById('ma-start').value    = s;
      document.getElementById('ma-duration').value = e - s;
    }
  }
}

/** ベジェ係数を UIS 省略記法で文字列化 (0.58 → .58, 0 → 0) */
function _fmtN(n) {
  const s = String(parseFloat(Number(n).toFixed(4)));
  return s.replace(/^0\./, '.').replace(/^-0\./, '-.');
}

const _BEZIER_IDS = ['b0', 'b1', 'b2', 'b3'];

/** trans 値をフォームに書き込む */
function _writeTrans(val) {
  const v = val || '';
  if (KNOWN_TRANS.has(v)) {
    document.getElementById('ma-trans').value = v;
    _BEZIER_IDS.forEach(id => { document.getElementById(`ma-trans-${id}`).value = ''; });
  } else {
    document.getElementById('ma-trans').value = 'custom';
    const m = v.match(/\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/);
    _BEZIER_IDS.forEach((id, i) => {
      document.getElementById(`ma-trans-${id}`).value = m ? m[i + 1] : '';
    });
  }
}

/** trans フォームから値を読む */
function _readTrans() {
  const sel = document.getElementById('ma-trans').value;
  if (sel === 'custom') {
    const vals = _BEZIER_IDS.map(id => parseFloat(document.getElementById(`ma-trans-${id}`).value));
    if (vals.every(v => !isNaN(v))) return `(${vals.map(_fmtN).join(',')})`;
    return undefined;
  }
  return sel || undefined;
}

// ── CRUD ─────────────────────────────────────────────────────────

function beginAdd(elemId) {
  pendingElemId  = elemId;
  pendingEditIdx = -1;
  document.getElementById('m-add-anim').querySelector('.modal-hdr span').textContent = I18n.t('modal_anim.add_title');
  document.getElementById('m-anim-confirm-btn').textContent = I18n.t('modal_anim.add_btn');

  const now = Math.round(PlayState.currentTime);
  document.getElementById('ma-time-mode').value    = 'atime';
  document.getElementById('ma-time-form').value    = 'plus';
  document.getElementById('ma-start').value        = now;
  document.getElementById('ma-end').value          = now + 1000;
  document.getElementById('ma-duration').value     = 1000;
  document.getElementById('ma-from').value         = '';
  document.getElementById('ma-to').value           = '';
  document.getElementById('ma-from-x').value       = '';
  document.getElementById('ma-from-y').value       = '';
  document.getElementById('ma-to-x').value         = '';
  document.getElementById('ma-to-y').value         = '';
  document.getElementById('ma-trans').value = '';
  _BEZIER_IDS.forEach(id => { document.getElementById(`ma-trans-${id}`).value = ''; });
  document.getElementById('ma-repeat').value       = '';

  _clearErrors();
  _syncModalForType(document.getElementById('ma-type').value);
  UI.openModal('m-add-anim');
  requestAnimationFrame(_drawEasingPreview);
}

function beginEdit(elemId, idx) {
  const elem = State.getElem(elemId); if (!elem) return;
  const anim = elem.animations[idx];  if (!anim) return;
  pendingElemId  = elemId;
  pendingEditIdx = idx;
  document.getElementById('m-add-anim').querySelector('.modal-hdr span').textContent = I18n.t('modal_anim.edit_title');
  document.getElementById('m-anim-confirm-btn').textContent = I18n.t('modal_anim.edit_btn');

  document.getElementById('ma-type').value = anim.name;
  const isInstant = INSTANT_TYPES.has(anim.name);

  _writeTimeFields(anim, isInstant);

  if (!isInstant) {
    if (XY_TYPES.has(anim.name)) {
      const fParts = anim.from !== undefined ? _splitTuple(anim.from) : [];
      const tParts = anim.to   !== undefined ? _splitTuple(anim.to)   : [];
      document.getElementById('ma-from-x').value = fParts[0] ?? '';
      document.getElementById('ma-from-y').value = fParts[1] ?? '';
      document.getElementById('ma-to-x').value   = tParts[0] ?? '';
      document.getElementById('ma-to-y').value   = tParts[1] ?? '';
    } else {
      document.getElementById('ma-from').value = anim.from ?? '';
      document.getElementById('ma-to').value   = anim.to   ?? '';
    }
    _writeTrans(anim.trans);
    document.getElementById('ma-repeat').value = anim.repeat || '';
  }

  _clearErrors();
  _syncModalForType(anim.name);
  if (!isInstant) _syncModalForTrans(document.getElementById('ma-trans').value);
  UI.openModal('m-add-anim');
  requestAnimationFrame(_drawEasingPreview);
}

function confirmAdd() {
  if (!_validate()) return;
  const elem = State.getElem(pendingElemId); if (!elem) return;
  const name      = document.getElementById('ma-type').value;
  const isInstant = INSTANT_TYPES.has(name);
  const timeFields = _readTimeFields(isInstant);

  let anim;
  if (isInstant) {
    anim = { name, ...timeFields };
  } else {
    let fromVal, toVal;
    if (XY_TYPES.has(name)) {
      const fx = document.getElementById('ma-from-x').value.trim();
      const fy = document.getElementById('ma-from-y').value.trim();
      const tx = document.getElementById('ma-to-x').value.trim();
      const ty = document.getElementById('ma-to-y').value.trim();
      fromVal = (fx !== '' || fy !== '') ? `(${fx},${fy})` : undefined;
      toVal   = (tx !== '' || ty !== '') ? `(${tx},${ty})` : undefined;
    } else {
      fromVal = document.getElementById('ma-from').value.trim() || undefined;
      toVal   = document.getElementById('ma-to').value.trim()   || undefined;
    }
    anim = {
      name,
      ...timeFields,
      from:   fromVal,
      to:     toVal,
      trans:  _readTrans(),
      repeat: document.getElementById('ma-repeat').value.trim() || undefined
    };
    Object.keys(anim).forEach(k => anim[k] === undefined && delete anim[k]);
  }

  History.push();
  if (pendingEditIdx >= 0) {
    elem.animations[pendingEditIdx] = anim;
  } else {
    elem.animations.push(anim);
  }
  UI.closeModal('m-add-anim');
  Bus.emit('project-changed');
}

function remove(elemId, idx) {
  const elem = State.getElem(elemId); if (!elem) return;
  const anim = elem.animations[idx];  if (!anim) return;
  UI.confirm(I18n.t('msg.anim_delete_confirm', { name: anim.name }), () => {
    History.push();
    elem.animations.splice(idx, 1);
    Bus.emit('project-changed');
  });
}

export const Animations = {
  beginAdd, beginEdit, confirmAdd, remove,
  onTypeChange, onTimeFormChange, onTransChange, onBezierInput
};
