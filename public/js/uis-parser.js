/**
 * uis-parser.js — UIS ファイルをプロジェクトデータに変換
 */

/**
 * 単一値をパース。
 * 複合式 (50%+300, 100%-20px) は文字列のまま u:'expr' で返す。
 * `50%` → {v:50, u:'%'}
 * `100px` → {v:100, u:'px'}
 * `100`   → {v:100, u:'rel'}
 * `50%+300` → {v:'50%+300', u:'expr'}
 */
function parseVal(s) {
  s = s.trim();
  if (/^-?[\d.]+%$/.test(s))  return { v: parseFloat(s), u: '%' };
  if (/^-?[\d.]+px$/.test(s)) return { v: parseFloat(s), u: 'px' };
  if (/^-?[\d.]+$/.test(s))   return { v: parseFloat(s), u: 'rel' };
  // 複合式: 文字列のまま保持
  return { v: s, u: 'expr' };
}

/**
 * `50%,50%` → {x, xUnit, y, yUnit}
 * 各軸の単位を独立して保持する（⑤ 混合単位対応）
 */
function parseXY(s) {
  const [a, b] = splitCommaRespectingParens(s);
  const xp = parseVal(a);
  const yp = parseVal(b);
  return { x: xp.v, xUnit: xp.u, y: yp.v, yUnit: yp.u };
}

/** カンマ分割（括弧内は分割しない） */
function splitCommaRespectingParens(s) {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') { depth++; cur += ch; }
    else if (ch === ')') { depth--; cur += ch; }
    else if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/**
 * `atime=1000`         → {start:0,    end:1000, form:'end'}
 * `atime=(1000,2000)`  → {start:1000, end:2000, form:'range'}
 * `atime=(1000,+500)`  → {start:1000, end:1500, form:'plus'}
 */
function parseAtime(raw) {
  const s = raw.trim();
  if (!s.startsWith('(')) {
    return { start: 0, end: parseInt(s) || 0, form: 'end' };
  }
  const inner = s.slice(1, -1);
  const [a, b] = inner.split(',').map(x => x.trim());
  const start = parseInt(a) || 0;
  if (b.startsWith('+')) {
    return { start, end: start + (parseInt(b.slice(1)) || 0), form: 'plus' };
  }
  return { start, end: parseInt(b) || 0, form: 'range' };
}

/**
 * バッチ定義を展開し、各エントリの名前と @index 値を返す。
 * `_Name-[0-10]`     → [{name:'Name-0', index:0}, ..., {name:'Name-10', index:10}]
 * `_Name-[0,1,3,5]`  → [{name:'Name-0', index:0}, {name:'Name-1', index:1}, ...]
 * `_Name`             → [{name:'Name', index:null}]
 */
function expandBatch(raw) {
  const m = raw.match(/^(.+)-\[(.+)\]$/);
  if (!m) return [{ name: raw, index: null }];
  const prefix = m[1];
  const inner  = m[2];
  // 範囲記法: カンマなし かつ ハイフンあり → [lo-hi]
  if (!inner.includes(',') && inner.includes('-')) {
    const [lo, hi] = inner.split('-').map(Number);
    return Array.from({ length: hi - lo + 1 }, (_, i) => ({
      name: `${prefix}-${lo + i}`,
      index: lo + i
    }));
  }
  // カンマ記法: [v0,v1,v2,...] — 負数も含む任意のインデックス値を展開
  return inner.split(',').map(x => {
    const v = x.trim();
    return { name: `${prefix}-${v}`, index: parseInt(v, 10) };
  });
}

/**
 * 行内の `base$step` 式をバッチインデックスで解決する。
 * `12.5%$25%` at index 2 → `62.5%`
 * `40%-93$62` at index 1 → `40%-31`
 * ベース・ステップが同一単位の単純値なら合算、複合式なら文字列追記。
 */
function resolveStepExprs(line, index) {
  return line.replace(/([^,=\s]*)\$(-?[\d.]+(?:px|%)?)/g, (match, base, stepStr) => {
    const sm = stepStr.match(/^(-?[\d.]+)(px|%)?$/);
    if (!sm) return match;
    const stepNum  = parseFloat(sm[1]);
    const stepUnit = sm[2] || '';
    const increment = index * stepNum;

    if (increment === 0) return base;

    // ベースが単純な数値+同一単位なら合算
    const bm = base.match(/^(-?[\d.]+)(px|%)?$/);
    if (bm && (bm[2] || '') === stepUnit) {
      return `${parseFloat(bm[1]) + increment}${stepUnit}`;
    }

    // ベースが複合式なら文字列として追記
    return increment > 0
      ? `${base}+${increment}${stepUnit}`
      : `${base}${increment}${stepUnit}`;
  });
}

/**
 * show/hide 用：time= / atime= の値から発火時刻を取り出す。
 * "1000" → 1000、"(1000,2000)" → 1000、"(1000,+500)" → 1000
 */
function _parseTrigger(raw) {
  const s = String(raw).trim();
  if (s.startsWith('(')) {
    return parseInt(s.slice(1).split(',')[0].trim()) || 0;
  }
  return parseInt(s) || 0;
}

/** キープロパティを行リストから解析 (`key=value` 形式) */
function parsePropLines(lines) {
  const props = {};
  for (const line of lines) {
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    props[k] = v;
  }
  return props;
}

/**
 * アニメーション行 (`\tname=fade, from=100, ...`) をパース
 */
function parseAnimLine(line) {
  const parts = splitCommaRespectingParens(line.replace(/^\t/, ''));
  const kv = {};
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    kv[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  const rawName = (kv.name || '').trim();
  const name    = ANIM_ALIAS[rawName] ?? rawName;
  // time= / atime= のどちらが使われているか判定
  const useTime = kv.time !== undefined;
  const timeMode = useTime ? 'time' : 'atime';

  // show/hide: 発火時刻 = 単一値ならその値、範囲 (n1,n2) なら n1
  if (name === 'show' || name === 'hide') {
    const t = _parseTrigger(useTime ? kv.time : (kv.atime || '0'));
    return { name, atimeStart: t, atimeEnd: t, timeMode };
  }

  // 全アニメーション共通: time= / atime= どちらも受け付ける
  const at = parseAtime(useTime ? kv.time : (kv.atime || '0'));
  return {
    name,
    // ⑥ from/to は文字列のまま保持（タプル値・式に対応するため parseFloat しない）
    from:       kv.from  !== undefined ? kv.from : undefined,
    to:         kv.to    !== undefined ? kv.to   : undefined,
    atimeStart: at.start,
    atimeEnd:   at.end,
    timeMode,
    timeForm:   at.form,
    trans:      kv.trans  || '',
    repeat:     kv.repeat || ''
  };
}

// アニメーション名の省略形 → 正規名
const ANIM_ALIAS = {
  f: 'fade', r: 'rotate',
  m: 'move', mx: 'movex', my: 'movey',
  s: 'scale', sx: 'scalex', sy: 'scaley',
  w: 'width', h: 'height',
};

// type 番号 → エディター内部タイプ名
const TYPE_MAP = {
  '0': 'image', '1': 'text', '2': 'rect',
  '3': 'anim',  '4': 'stretch', '5': 'ninepatch'
};

/**
 * UIS テキスト全体をパースして State 互換データを返す
 */
export const UISParser = {
  parse(text) {
    const settings = { width: 1920, height: 1080, unit: 720, angle: 45, apply3d: false };
    const animDefs  = {};   // { mtnName: [animObj, ...] }
    const elemMap   = {};   // { name: elem } — 上書き対応用
    const elemOrder = [];   // 順序保持

    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    let mode     = null;   // 'anim' | 'elem'
    let curKey   = null;
    let curLines = [];

    const flushBlock = () => {
      if (!mode || !curKey) return;
      if (mode === 'anim') {
        const entries = expandBatch(curKey);
        for (const { name, index } of entries) {
          const lines = index !== null
            ? curLines.map(l => resolveStepExprs(l, index))
            : curLines;
          const anims = lines
            .filter(l => l.startsWith('\t') && !l.startsWith('\t#'))
            .map(parseAnimLine);
          if (animDefs[name]) {
            // 既存定義に追記（一括定義後の個別追加）
            animDefs[name] = animDefs[name].concat(anims);
          } else {
            animDefs[name] = [...anims];
          }
        }
      } else if (mode === 'elem') {
        const entries = expandBatch(curKey);
        for (const { name, index } of entries) {
          const lines = index !== null
            ? curLines.map(l => resolveStepExprs(l, index))
            : curLines;
          const props = parsePropLines(lines.map(l => l.replace(/^\t/, '')));
          if (elemMap[name]) {
            // 既存要素への上書き（バッチ定義後の個別オーバーライド対応）
            Object.assign(elemMap[name], buildElemProps(name, props));
          } else {
            const elem = buildElem(name, props);
            elemMap[name] = elem;
            elemOrder.push(name);
          }
        }
      }
      mode = null; curKey = null; curLines = [];
    };

    for (const raw of lines) {
      const line = raw.trimEnd();
      if (!line.trim()) { continue; }

      if (line.startsWith('#')) { continue; }  // コメント行

      if (line.startsWith('@')) {
        flushBlock();
        const sp  = line.slice(1).split(/\s+/);
        const cmd = sp[0].toLowerCase();
        if (cmd === 'apply') settings.apply3d = sp[1]?.toLowerCase() === '3d';
        else if (cmd === 'unit')  settings.unit  = parseInt(sp[1]) || 1080;
        else if (cmd === 'angle') settings.angle = parseFloat(sp[1]) || 45;
        continue;
      }

      if (line.startsWith(':') && !line.startsWith('\t')) {
        flushBlock();
        mode = 'anim'; curKey = line.slice(1).trim(); curLines = [];
        continue;
      }

      if (line.startsWith('_') && !line.startsWith('\t')) {
        flushBlock();
        mode = 'elem'; curKey = line.slice(1).trim(); curLines = [];
        continue;
      }

      if (mode && line.startsWith('\t')) {
        curLines.push(line);
      }
    }
    flushBlock();

    // motion 参照を animations に解決
    const elements = elemOrder.map(n => elemMap[n]);
    for (const elem of elements) {
      if (elem._motion && animDefs[elem._motion]) {
        elem.animations = animDefs[elem._motion].map(a => ({ ...a }));
      }
      delete elem._motion;
    }

    return { settings, elements, animDefs };
  }
};

/** props オブジェクト → State 互換の要素オブジェクト（新規作成） */
function buildElem(name, props) {
  // 新規要素のデフォルト値を先に設定し、指定プロパティで上書き
  const elem = {
    name,
    animations: [],
    visible:    true,
    colorIdx:   0,
    type:      'image',
    anchor:    4,
    opacity:   100,
    x:         0,
    y:         0,
    posUnit:   '%',
    posXUnit:  '%',
    posYUnit:  '%',
    w:         0,
    h:         0,
    sizeUnit:  'px',
    sizeXUnit: 'px',
    sizeYUnit: 'px',
    zindex:    0,
    rotate:    0,
    blend:     undefined,
    parent:    ''
  };
  return Object.assign(elem, buildElemProps(name, props));
}

/**
 * props → State 互換のプロパティ差分。
 * 指定されたプロパティのみ返す（未指定は含めない）ことで、
 * Object.assign による上書き対応で既存値を保持できる。
 */
function buildElemProps(name, props) {
  const ep = {};

  const typeStr = TYPE_MAP[props.type];
  if (typeStr !== undefined)        ep.type    = typeStr;
  if (props.anchor  !== undefined)  ep.anchor  = parseInt(props.anchor);
  if (props.opacity !== undefined)  ep.opacity = parseFloat(props.opacity);
  if (props.zindex  !== undefined)  ep.zindex  = parseInt(props.zindex);
  if (props.rotate  !== undefined)  ep.rotate  = parseFloat(props.rotate);
  if (props.blend   !== undefined)  ep.blend   = parseInt(props.blend);
  if (props.parent  !== undefined)  ep.parent  = props.parent;

  if (props.pos) {
    const posXY = parseXY(props.pos);
    ep.x       = posXY.x;
    ep.y       = posXY.y;
    ep.posUnit  = posXY.xUnit;   // 後方互換用
    ep.posXUnit = posXY.xUnit;
    ep.posYUnit = posXY.yUnit;
  }

  if (props.size) {
    const sizeXY = parseXY(props.size);
    ep.w        = sizeXY.x;
    ep.h        = sizeXY.y;
    ep.sizeUnit  = sizeXY.xUnit;  // 後方互換用
    ep.sizeXUnit = sizeXY.xUnit;
    ep.sizeYUnit = sizeXY.yUnit;
  }

  if (props.tex)   ep.tex = props.tex;
  if (props.frame) {
    ep.tex = props.frame;
    // "basename/start-end" 形式を展開: xxxxx/1-50 → ['xxxxx-1.png', ..., 'xxxxx-50.png']
    const rm = props.frame.match(/^(.+)\/(\d+)-(\d+)$/);
    if (rm) {
      const base = rm[1], start = parseInt(rm[2]), end = parseInt(rm[3]);
      ep.frames = [];
      for (let i = start; i <= end; i++) ep.frames.push(`${base}-${i}.png`);
    }
  }
  if (props.interval !== undefined) ep.interval = parseInt(props.interval);
  if (props.text)   ep.textVal  = props.text;
  if (props.fsize) {
    ep.fsize    = parseInt(props.fsize);
    ep.sizeMode = 'fsize';
  } else if (ep.type === 'text') {
    ep.sizeMode = 'size';
  }
  if (props.color)  ep.color    = props.color;
  if (props.part)   ep.part     = props.part;    // type=4 (stretch)
  if (props.rect)   ep.nineRect = props.rect;    // type=5 (ninepatch)
  if (props.motion) ep._motion  = props.motion;

  return ep;
}
