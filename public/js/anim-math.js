/** アニメーション補間計算 */

// ── 内部ユーティリティ ────────────────────────────────────────────

/**
 * 式文字列を評価してロジカルピクセル値を返す。
 * @param {string|number} s    値または式 (例: "50%+300", "100px", "540")
 * @param {number} dim         対応する軸のキャンバス寸法（論理ピクセル）
 * @param {number} unitBase    @unit 値（相対単位の基準）
 */
function evalExpr(s, dim, unitBase) {
  const str = String(s).trim();
  // 単純な数値
  if (/^-?[\d.]+$/.test(str))   return parseFloat(str) * unitBase;
  if (/^-?[\d.]+%$/.test(str))  return parseFloat(str) / 100 * dim;
  if (/^-?[\d.]+px$/.test(str)) return parseFloat(str);

  // 複合式 (50%+300, 100%-20px, etc.)
  let result = 0;
  // 先頭が '+' か '-' でなければ + として開始
  const normalized = /^[+\-]/.test(str) ? str : '+' + str;
  const re = /([+-])\s*([\d.]+)\s*(%|px)?/g;
  let m;
  while ((m = re.exec(normalized)) !== null) {
    const sign = m[1] === '-' ? -1 : 1;
    const val  = parseFloat(m[2]);
    const u    = m[3] || 'rel';
    if      (u === '%')  result += sign * val / 100 * dim;
    else if (u === 'px') result += sign * val;
    else                 result += sign * val * unitBase;
  }
  return result;
}

/**
 * "(a,b)" または "a,b" 形式のタプル文字列を分割する。
 * カンマはネスト括弧の外側のみ認識。
 */
function parseTuple(s) {
  const str   = String(s).trim();
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

/**
 * repeat プロパティに従って時刻を調整して返す。
 * ギャップ期間中は -1 を返す（その animation をスキップ）。
 * 繰り返し終了後は末端時刻 e を返す。
 *
 * repeat フォーマット:
 *   "-1"        → 無限ループ
 *   "3"         → 3 回再生
 *   "r3"        → 3 回リバース（交互）
 *   "r-1"       → 無限リバースループ
 *   "(3,500)"   → 3 回 + 各回の後に 500ms ギャップ
 *   "(-1,500)"  → 無限ループ + 各回の後に 500ms ギャップ
 */
function applyRepeat(time, s, e, repeatStr) {
  const d = e - s;
  if (d <= 0 || !repeatStr) return time;

  const rs = String(repeatStr).trim();
  let count = -1, reverse = false, gap = 0;

  if (rs.startsWith('(')) {
    const m = rs.match(/\(\s*(-?\d+)\s*,\s*(\d+)\s*\)/);
    if (m) { count = parseInt(m[1]); gap = parseInt(m[2]); }
  } else if (rs.startsWith('r') || rs.startsWith('R')) {
    reverse = true;
    const n = parseInt(rs.slice(1));
    count = isNaN(n) ? -1 : n;
  } else {
    const n = parseInt(rs);
    if (!isNaN(n)) count = n > 0 ? n : -1; // -1 or 0 → infinite
  }

  const elapsed = time - s;
  const period  = d + gap;
  const phase   = elapsed % period;
  const iter    = Math.floor(elapsed / period);

  // 有限回数を超えたら末端で停止
  if (count > 0 && iter >= count) return e;
  // ギャップ期間中
  if (phase > d) return -1;
  // リバース（奇数イテレーションで逆向き）
  const adjPhase = (reverse && iter % 2 === 1) ? (d - phase) : phase;
  return s + adjPhase;
}

// ── メイン ────────────────────────────────────────────────────────

export const AnimMath = {
  /** 式文字列 or 数値を論理ピクセル値に変換（外部公開用ラッパー） */
  evalExpr(s, dim, unitBase) { return evalExpr(s, dim, unitBase); },

  ease(t, trans) {
    if (!trans || trans === 'linear') return t;
    if (trans === 'easeout') return 1 - Math.pow(1 - t, 3);
    if (trans === 'easein')  return t * t * t;
    const m = trans.match(/\(\s*(-?(?:\d+\.?\d*|\.\d+))\s*,\s*(-?(?:\d+\.?\d*|\.\d+))\s*,\s*(-?(?:\d+\.?\d*|\.\d+))\s*,\s*(-?(?:\d+\.?\d*|\.\d+))\s*\)/);
    if (m) return this.cubicBezier(+m[1], +m[2], +m[3], +m[4], t);
    return t;
  },

  cubicBezier(x1, y1, x2, y2, t) {
    const cx = 3*x1, bx = 3*(x2-x1)-cx, ax = 1-cx-bx;
    const cy = 3*y1, by = 3*(y2-y1)-cy, ay = 1-cy-by;
    let e = t;
    for (let i = 0; i < 4; i++) {
      const f = ((ax*e + bx)*e + cx)*e - t;
      const d = (3*ax*e + 2*bx)*e + cx;
      e -= d ? f/d : 0;
    }
    return ((ay*e + by)*e + cy)*e;
  },

  /**
   * 指定時刻における要素の描画プロパティを返す
   * @param {object} elem  要素データ
   * @param {number} time  現在時刻 (ms)
   * @param {object} ctx   {cw, ch, unitValue} — キャンバス寸法と @unit 値
   */
  computeProps(elem, time, ctx = {}) {
    const { cw = 1920, ch = 1080, unitValue = 1080 } = ctx;
    const unitBase = ch / unitValue;

    const p = {
      x:        elem.x        ?? 0,
      y:        elem.y        ?? 0,
      posUnit:  elem.posUnit  ?? '%',
      posXUnit: elem.posXUnit ?? null,
      posYUnit: elem.posYUnit ?? null,
      w:        elem.w        ?? 0,
      h:        elem.h        ?? 0,
      sizeUnit:  elem.sizeUnit  ?? 'px',
      sizeXUnit: elem.sizeXUnit ?? null,
      sizeYUnit: elem.sizeYUnit ?? null,
      anchor:  elem.anchor  ?? 0,
      opacity: elem.opacity ?? 100,
      rotate:  elem.rotate  ?? 0,
      skewX:   elem.skewX   ?? 0,
      skewY:   elem.skewY   ?? 0,
      zindex:  elem.zindex  ?? 0,
      color:   elem.color   ?? '#ffffff',
      fsize:   elem.fsize   ?? 24,
      animVisible: true
    };

    // ⑤ 要素自体の pos/size に expr が含まれている場合は先に評価して _px に変換
    const pxu = p.posXUnit ?? p.posUnit;
    const pyu = p.posYUnit ?? p.posUnit;
    const pwu = p.sizeXUnit ?? p.sizeUnit;
    const phu = p.sizeYUnit ?? p.sizeUnit;
    if (pxu === 'expr' || typeof p.x === 'string') {
      p.x = evalExpr(p.x, cw, unitBase); p.posXUnit = '_px';
    }
    if (pyu === 'expr' || typeof p.y === 'string') {
      p.y = evalExpr(p.y, ch, unitBase); p.posYUnit = '_px';
    }
    if (pwu === 'expr' || typeof p.w === 'string') {
      p.w = evalExpr(p.w, cw, unitBase); p.sizeXUnit = '_px';
    }
    if (phu === 'expr' || typeof p.h === 'string') {
      p.h = evalExpr(p.h, ch, unitBase); p.sizeYUnit = '_px';
    }

    for (const anim of (elem.animations || [])) {
      // show/hide はメインループでは扱わず、後処理で解決する
      if (anim.name === 'show' || anim.name === 'hide') continue;

      const s = anim.atimeStart ?? 0;
      const e = anim.atimeEnd   ?? s + 1000;
      if (time < s) continue;

      // ④ repeat 対応
      let adjTime = time;
      if (anim.repeat) {
        adjTime = applyRepeat(time, s, e, anim.repeat);
        if (adjTime < 0) continue;  // ギャップ期間中
      }

      const raw  = adjTime > e ? 1 : (e === s ? 1 : (adjTime - s) / (e - s));
      const t    = this.ease(raw, anim.trans);
      const lerp = (a, b) => a + (b - a) * t;

      // スカラー値（文字列の場合も parseFloat で読む）
      const fv = anim.from !== undefined ? parseFloat(String(anim.from)) : null;
      const tv = anim.to   !== undefined ? parseFloat(String(anim.to))   : null;

      switch (anim.name) {
        case 'fade':   case 'f':
          if (fv !== null && tv !== null) p.opacity = lerp(fv, tv);
          else if (tv !== null) p.opacity = tv;
          break;

        case 'rotate': case 'r':
          if (fv !== null && tv !== null) p.rotate = lerp(fv, tv);
          else if (tv !== null) p.rotate = tv;
          break;

        // ⑤ movex/movey: 式評価対応（plain 数値は % 相当として後方互換）
        case 'movex':  case 'mx': {
          if (anim.from !== undefined && anim.to !== undefined) {
            const fStr = String(anim.from).trim();
            const tStr = String(anim.to).trim();
            const isSimple = /^-?[\d.]+$/.test(fStr) && /^-?[\d.]+$/.test(tStr);
            if (isSimple) {
              p.x = lerp(parseFloat(fStr), parseFloat(tStr));
              p.posXUnit = 'rel';
            } else {
              // 式評価 → 論理ピクセル
              p.x = lerp(evalExpr(fStr, cw, unitBase), evalExpr(tStr, cw, unitBase));
              p.posXUnit = '_px';
            }
          }
          break;
        }

        case 'movey':  case 'my': {
          if (anim.from !== undefined && anim.to !== undefined) {
            const fStr = String(anim.from).trim();
            const tStr = String(anim.to).trim();
            const isSimple = /^-?[\d.]+$/.test(fStr) && /^-?[\d.]+$/.test(tStr);
            if (isSimple) {
              p.y = lerp(parseFloat(fStr), parseFloat(tStr));
              p.posYUnit = 'rel';
            } else {
              p.y = lerp(evalExpr(fStr, ch, unitBase), evalExpr(tStr, ch, unitBase));
              p.posYUnit = '_px';
            }
          }
          break;
        }

        // ⑥ move: タプル座標 + 式評価対応
        case 'move': case 'm': {
          if (anim.from !== undefined && anim.to !== undefined) {
            const fParts = parseTuple(String(anim.from));
            const tParts = parseTuple(String(anim.to));
            if (fParts.length >= 2 && tParts.length >= 2) {
              p.x = lerp(evalExpr(fParts[0], cw, unitBase), evalExpr(tParts[0], cw, unitBase));
              p.y = lerp(evalExpr(fParts[1], ch, unitBase), evalExpr(tParts[1], ch, unitBase));
              p.posXUnit = '_px';
              p.posYUnit = '_px';
            }
          }
          break;
        }

        case 'scale':  case 's': {
          const fParts = anim.from !== undefined ? parseTuple(String(anim.from)) : [];
          const tParts = anim.to   !== undefined ? parseTuple(String(anim.to))   : [];
          if (fParts.length >= 2 && tParts.length >= 2) {
            p.w *= lerp(parseFloat(fParts[0]), parseFloat(tParts[0]));
            p.h *= lerp(parseFloat(fParts[1]), parseFloat(tParts[1]));
          } else if (fv !== null && tv !== null) {
            const sc = lerp(fv, tv); p.w *= sc; p.h *= sc;
          }
          break;
        }
        case 'scalex': case 'sx':
          if (fv !== null && tv !== null) p.w *= lerp(fv, tv);
          break;
        case 'scaley': case 'sy':
          if (fv !== null && tv !== null) p.h *= lerp(fv, tv);
          break;
        case 'width':  case 'w':
          if (fv !== null && tv !== null) p.w = lerp(fv, tv);
          break;
        case 'height': case 'h':
          if (fv !== null && tv !== null) p.h = lerp(fv, tv);
          break;
        case 'size': {
          const fParts = anim.from !== undefined ? parseTuple(String(anim.from)) : [];
          const tParts = anim.to   !== undefined ? parseTuple(String(anim.to))   : [];
          if (fParts.length >= 2 && tParts.length >= 2) {
            p.w = lerp(parseFloat(fParts[0]), parseFloat(tParts[0]));
            p.h = lerp(parseFloat(fParts[1]), parseFloat(tParts[1]));
          } else if (fv !== null && tv !== null) {
            p.w = lerp(fv, tv); p.h = lerp(fv, tv);
          }
          break;
        }
        case 'skew': {
          const fParts = anim.from !== undefined ? parseTuple(String(anim.from)) : [];
          const tParts = anim.to   !== undefined ? parseTuple(String(anim.to))   : [];
          if (fParts.length >= 2 && tParts.length >= 2) {
            p.skewX = lerp(parseFloat(fParts[0]), parseFloat(tParts[0]));
            p.skewY = lerp(parseFloat(fParts[1]), parseFloat(tParts[1]));
          } else if (fv !== null && tv !== null) {
            p.skewX = lerp(fv, tv);
          } else if (tv !== null) {
            p.skewX = tv;
          }
          break;
        }
        case 'skewx':
          if (fv !== null && tv !== null) p.skewX = lerp(fv, tv);
          else if (tv !== null) p.skewX = tv;
          break;
        case 'skewy':
          if (fv !== null && tv !== null) p.skewY = lerp(fv, tv);
          else if (tv !== null) p.skewY = tv;
          break;
      }
    }

    // show/hide: 発火済みイベントのうち最後のものが表示状態を決定する
    const showHideEvents = (elem.animations || [])
      .filter(a => a.name === 'show' || a.name === 'hide')
      .sort((a, b) => (a.time ?? a.atimeStart ?? 0) - (b.time ?? b.atimeStart ?? 0));
    for (const ev of showHideEvents) {
      if ((ev.time ?? ev.atimeStart ?? 0) <= time) p.animVisible = ev.name === 'show';
    }

    return p;
  }
};
