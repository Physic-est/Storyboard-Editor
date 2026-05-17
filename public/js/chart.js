/**
 * chart.js — 譜面 (.mc) データの読み込みと管理
 *
 * .mc ファイルをパースして beat→ms 変換を行い、
 * Canvas のノーツ描画に使えるデータ構造を提供する。
 */

let _notes     = [];   // パース済みノーツ配列
let _loaded    = false;
let _meta      = null;
let _approachMs = 1500; // 判定線に到達するまでの時間 (ms)

// ── タイミング計算 ─────────────────────────────────────

/** [measure, num, den] → 小節単位の絶対位置 */
function _beatPos(beat) {
  return beat[0] + (beat[1] / beat[2]);
}

/**
 * time セクション（単一オブジェクト or 配列）から
 * BPM 変化マップを構築する。
 * @param {object|Array} timeSection
 * @param {number} audioOffset - type=1 ノーツの offset (ms)。delay=0 の場合のフォールバック。
 * @returns {Array<{pos, bpm, startMs}>}
 */
function _buildTimingMap(timeSection, audioOffset = 0) {
  const events = Array.isArray(timeSection) ? timeSection : [timeSection];
  const sorted = [...events].sort((a, b) => _beatPos(a.beat) - _beatPos(b.beat));

  const map = [];
  // delay が設定されていればそちらを優先し、なければ audioOffset を使う（二重計上防止）
  let currentMs = sorted[0].delay || audioOffset;

  for (let i = 0; i < sorted.length; i++) {
    const t   = sorted[i];
    const pos = _beatPos(t.beat);
    map.push({ pos, bpm: t.bpm, startMs: currentMs });

    if (i + 1 < sorted.length) {
      const nextPos = _beatPos(sorted[i + 1].beat);
      // 次の BPM 変化点まで何 ms かを加算
      currentMs += (nextPos - pos) / t.bpm * 60000;
    }
  }
  return map;
}

/**
 * 小節単位の絶対位置 → ms 変換
 * BPM 変化点を考慮して正確な時刻を返す。
 */
function _posToMs(measurePos, timingMap) {
  let seg = timingMap[0];
  for (const s of timingMap) {
    if (s.pos <= measurePos) seg = s;
    else break;
  }
  return seg.startMs + (measurePos - seg.pos) / seg.bpm * 60000;
}

/** beat 配列 → ms 変換（ラッパー） */
function _beatToMs(beat, timingMap) {
  return _posToMs(_beatPos(beat), timingMap);
}

// ── ノーツパース ───────────────────────────────────────

/**
 * 生のノーツオブジェクトをパースして正規化する。
 * audioOffset は _buildTimingMap に組み込み済みのため、ここでは加算しない。
 * @param {object} raw       - .mc note オブジェクト
 * @param {Array}  timingMap - BPM マップ
 * @returns {object|null} パース済みノーツ（type=1 は null）
 */
function _parseNote(raw, timingMap) {
  // type=1 は音声トラック定義なのでスキップ
  if (raw.type === 1) return null;

  const time = _beatToMs(raw.beat, timingMap);

  const note = {
    time,
    x:       raw.x  ?? 0,
    w:       raw.w  ?? 64,
    isSlide: !!raw.seg,
    isWipe:  raw.type === 4,
    isDir:   raw.dir !== undefined,
    dir:     raw.dir,
    seg:     null,
    tailTime: null
  };

  if (raw.seg) {
    const headPos = _beatPos(raw.beat);
    let prevX = 0; // seg.x は相対オフセットなので、省略時の初期値は 0

    note.seg = raw.seg.map(s => {
      // x が省略されている場合は直前の相対オフセットを引き継ぐ
      const x = s.x !== undefined ? s.x : prevX;
      prevX = x;
      // seg.beat は head からの相対オフセット
      const absPos = headPos + _beatPos(s.beat);
      return { time: _posToMs(absPos, timingMap), x };
    });

    note.tailTime = note.seg[note.seg.length - 1].time;
  }

  return note;
}

// ── 公開 API ──────────────────────────────────────────

/**
 * .mc ファイルを読み込んでパースする。
 * @param {File} file
 * @returns {Promise<{meta, noteCount}>}
 */
async function load(file) {
  const text = await file.text();
  const data = JSON.parse(text);

  // type=1 ノーツから音声オフセットを取得し、タイミングマップに組み込む
  const audioEvent  = data.note.find(n => n.type === 1);
  const audioOffset = audioEvent?.offset ?? 0;
  const timingMap   = _buildTimingMap(data.time, audioOffset);

  _meta   = data.meta;
  _notes  = data.note
    .map(n => _parseNote(n, timingMap))
    .filter(Boolean);
  _loaded = true;

  return { meta: _meta, noteCount: _notes.length };
}

/** 譜面データをクリアする */
function clear() {
  _notes  = [];
  _loaded = false;
  _meta   = null;
}

export const Chart = {
  load,
  clear,
  isLoaded:      () => _loaded,
  getNotes:      () => _notes,
  getMeta:       () => _meta,
  getApproachMs: () => _approachMs,
  setApproachMs: ms => { _approachMs = Math.max(200, Number(ms) || 1500); }
};
