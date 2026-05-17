import { State }     from './state.js';
import { PlayState } from './playstate.js';
import { Bus }       from './bus.js';
import { UI }        from './ui.js';
import { I18n }      from './i18n.js';

/** tex 入力用リソースピッカー */
let targetInputId = null;
let selected      = null;

// 複数選択モード用
let multiMode     = false;
let multiElemId   = null;
let multiSelected = [];  // 選択順に並んだ画像名の配列

// ── 連番パターン正規表現 ──────────────────────────────────────────
// "basename-N.png" 形式のみを連番として扱う
const FRAME_RE = /^(.+)-(\d+)\.png$/i;

// ── 公開 API ─────────────────────────────────────────────────────

function open(inputId) {
  multiMode     = false;
  targetInputId = inputId;
  selected      = null;
  _renderGrid();
  document.querySelector('#m-res-picker .modal-hdr span').textContent = '🖼 ' + I18n.t('modal_res.title');
  _clearError();
  UI.openModal('m-res-picker');
}

function openMulti(elemId) {
  multiMode     = true;
  multiElemId   = elemId;
  targetInputId = null;
  selected      = null;
  const elem    = State.getElem(elemId);
  multiSelected = elem?.frames ? [...elem.frames] : [];
  _renderGrid();
  document.querySelector('#m-res-picker .modal-hdr span').textContent = '🎞 ' + I18n.t('modal_res.multi_title');
  _clearError();
  UI.openModal('m-res-picker');
}

function _pick(i, el) {
  document.querySelectorAll('.rp-thumb').forEach(t => t.classList.remove('sel'));
  el.classList.add('sel');
  selected = State.getResources().images[i].name;
}

/**
 * 複数選択モードのクリック処理。
 * - 既選択画像をクリック → 単体解除
 * - 未選択かつ他に選択済み画像がある → 単体追加
 * - 未選択かつ何も選択されていない → 連番グループを自動選択
 */
function _pickMulti(i) {
  const name = State.getResources().images[i].name;
  const idx  = multiSelected.indexOf(name);

  if (idx >= 0) {
    // 既選択 → 解除
    multiSelected.splice(idx, 1);
  } else if (multiSelected.length === 0) {
    // 何も選択されていない → 連番グループを自動選択
    multiSelected = _autoSelectGroup(name);
  } else {
    // 他に選択済みがある → 単体追加のみ（自動選択なし）
    multiSelected.push(name);
  }

  _clearError();
  _renderGrid();
}

function confirm() {
  if (multiMode) {
    // バリデーション
    const err = _validate(multiSelected);
    if (err) { _showError(err); return; }

    if (multiElemId !== null) {
      const elem = State.getElem(multiElemId);
      if (elem) {
        elem.frames = [...multiSelected];
        // "basename/start-end" 形式で tex に設定
        elem.tex = _toUisPattern(multiSelected) || (multiSelected[0] || elem.tex || '');
        Bus.emit('project-changed');
      }
    }
    _resetMulti();
    UI.closeModal('m-res-picker');
  } else {
    if (selected && targetInputId) {
      const el = document.getElementById(targetInputId);
      if (el) el.value = selected;

      if (targetInputId === 'prop-tex' && PlayState.selectedId) {
        const elem = State.getElem(PlayState.selectedId);
        if (elem) { elem.tex = selected; Bus.emit('project-changed'); }
      }
    }
    UI.closeModal('m-res-picker');
  }
}

export const ResPicker = { open, openMulti, _pick, _pickMulti, confirm };

// ── 内部ヘルパー ──────────────────────────────────────────────────

/**
 * クリックされたファイル名と同じ連番グループに属する画像を
 * リソース一覧から検索して番号順に返す。
 * パターンに一致しない場合はそのファイル1枚だけを返す。
 */
function _autoSelectGroup(clickedName) {
  const m = clickedName.match(FRAME_RE);
  if (!m) return [clickedName];

  const basename = m[1];
  const group = State.getResources().images
    .map(img => {
      const mm = img.name.match(FRAME_RE);
      return (mm && mm[1] === basename) ? { name: img.name, num: parseInt(mm[2]) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.num - b.num)
    .map(x => x.name);

  return group.length > 0 ? group : [clickedName];
}

/**
 * 選択済みフレームを検証する。
 * @returns {string|null} エラーメッセージ、問題なければ null
 */
function _validate(names) {
  if (names.length <= 1) return null;

  const parsed = names.map(n => {
    const m = n.match(FRAME_RE);
    return m ? { name: n, basename: m[1], num: parseInt(m[2]) } : null;
  });

  // 連番形式でないファイルが含まれている
  const nonSeq = parsed.filter(p => p === null);
  if (nonSeq.length > 0) {
    const bad = names.find((n, i) => parsed[i] === null);
    return I18n.t('msg.frames_err_non_seq', { name: bad });
  }

  // 異なるグループが混在している
  const basenames = [...new Set(parsed.map(p => p.basename))];
  if (basenames.length > 1) {
    return I18n.t('msg.frames_err_mixed', { names: basenames.join(', ') });
  }

  // 番号順にソートして欠番チェック
  const nums = parsed.map(p => p.num).sort((a, b) => a - b);
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] !== nums[i - 1] + 1) {
      return I18n.t('msg.frames_err_gap', { a: nums[i - 1], b: nums[i] });
    }
  }

  return null;
}

/**
 * 選択済みフレームから UIS の "basename/start-end" 文字列を生成する。
 * ['walk-1.png', ..., 'walk-50.png'] → 'walk/1-50'
 */
function _toUisPattern(names) {
  if (names.length === 0) return '';
  const parsed = names
    .map(n => { const m = n.match(FRAME_RE); return m ? { basename: m[1], num: parseInt(m[2]) } : null; })
    .filter(Boolean)
    .sort((a, b) => a.num - b.num);
  if (parsed.length === 0 || parsed.length !== names.length) return '';
  const { basename } = parsed[0];
  const start = parsed[0].num;
  const end   = parsed[parsed.length - 1].num;
  return `${basename}/${start}-${end}`;
}

function _resetMulti() {
  multiMode     = false;
  multiElemId   = null;
  multiSelected = [];
}

// ── エラー表示 ────────────────────────────────────────────────────

function _showError(msg) {
  let el = document.getElementById('rp-error');
  if (!el) {
    el = document.createElement('div');
    el.id = 'rp-error';
    el.style.cssText =
      'color:var(--accent3);font-size:10px;padding:4px 10px;' +
      'text-align:center;white-space:pre-line;flex-shrink:0;';
    const footer = document.querySelector('#m-res-picker .modal-footer');
    footer.insertBefore(el, footer.firstChild);
  }
  el.textContent = '⚠ ' + msg;
}

function _clearError() {
  const el = document.getElementById('rp-error');
  if (el) el.textContent = '';
}

function _renderGrid() {
  const imgs = State.getResources().images;
  const grid = document.getElementById('rp-grid');

  if (imgs.length === 0) {
    grid.innerHTML = `<div class="rp-empty">${I18n.t('modal_res.empty')}</div>`;
    return;
  }

  grid.innerHTML = imgs.map((img, i) => {
    if (multiMode) {
      const order = multiSelected.indexOf(img.name);
      const isSel = order >= 0;
      return `
        <div class="rp-thumb${isSel ? ' sel' : ''}" onclick="ResPicker._pickMulti(${i})">
          <img src="${img.dataUrl}"/>
          <div class="rpn">${img.name}</div>
          ${isSel ? `<div class="rp-order">${order + 1}</div>` : ''}
        </div>`;
    } else {
      return `
        <div class="rp-thumb" onclick="ResPicker._pick(${i},this)">
          <img src="${img.dataUrl}"/>
          <div class="rpn">${img.name}</div>
        </div>`;
    }
  }).join('');
}
