import { State } from './state.js';

/**
 * フレーム配列から UIS の "basename/start-end" 形式を検出する。
 * ['walk-1.png', 'walk-2.png', ..., 'walk-50.png'] → 'walk/1-50'
 * 検出できなければ空文字を返す。
 */
function _detectAnimPattern(names) {
  if (names.length < 2) return '';
  const re = /^(.+)-(\d+)\.png$/;
  const first = names[0].match(re);
  if (!first) return '';
  const basename = first[1];
  const start    = parseInt(first[2]);
  const isSeq = names.every((n, j) => {
    const m = n.match(re);
    return m && m[1] === basename && parseInt(m[2]) === start + j;
  });
  if (!isSeq) return '';
  return `${basename}/${start}-${start + names.length - 1}`;
}

/** UISコード生成 */
export const CodeGen = {
  /**
   * 単軸の値を UIS 文字列にフォーマット。
   * 式文字列 (posXUnit='expr') はそのまま出力。
   */
  fmtAxis(v, unit) {
    if (typeof v === 'string') return v;          // 式: そのまま
    if (unit === '%')  return `${v.toFixed(1)}%`;
    if (unit === 'px') return `${Math.round(v)}px`;
    return `${Math.round(v)}`;                    // rel / _px など → 数値のみ
  },

  /** pos= / size= の "x,y" 文字列を生成（軸ごとに異なる単位に対応） */
  fmt(x, y, xUnit, yUnit) {
    return `${this.fmtAxis(x, xUnit)},${this.fmtAxis(y, yUnit)}`;
  },

  generate() {
    const { settings, elements } = State.getProject();
    const lines = [];

    if (settings.apply3d) {
      lines.push('@apply 3d');
      lines.push(`@angle ${settings.angle}`);
    }
    lines.push(`@unit ${settings.unit}`, '');

    // アニメーション定義
    const defs = {};
    elements.forEach(e => {
      if (!e.animations?.length) return;
      const n = `mtn${e.name.replace(/[^a-zA-Z0-9]/g, '')}`;
      e._mtnName = n;
      defs[n] = e.animations;
    });

    for (const [n, anims] of Object.entries(defs)) {
      lines.push(`:${n}`);
      anims.forEach(a => {
        const kw = a.timeMode === 'time' ? 'time' : 'atime';
        if (a.name === 'show' || a.name === 'hide') {
          const t = a.atimeStart ?? a.time ?? 0;
          lines.push(`\tname=${a.name}, ${kw}=${t}`);
          return;
        }
        const parts = [`name=${a.name}`];
        if (a.from !== undefined) parts.push(`from=${a.from}`);
        if (a.to   !== undefined) parts.push(`to=${a.to}`);
        const s    = a.atimeStart || 0;
        const e    = a.atimeEnd   ?? s + 1000;
        const form = a.timeForm   || (s === 0 ? 'end' : 'plus');
        if (form === 'end')        parts.push(`${kw}=${e}`);
        else if (form === 'range') parts.push(`${kw}=(${s},${e})`);
        else                       parts.push(`${kw}=(${s},+${e - s})`);
        if (a.trans)  parts.push(`trans=${a.trans}`);
        if (a.repeat) parts.push(`repeat=${a.repeat}`);
        lines.push('\t' + parts.join(', '));
      });
      lines.push('');
    }

    // 要素定義
    elements.forEach(e => {
      // 軸ごとの単位を解決（posXUnit/posYUnit が優先、なければ posUnit にフォールバック）
      const posXU  = e.posXUnit  ?? e.posUnit  ?? '%';
      const posYU  = e.posYUnit  ?? e.posUnit  ?? '%';
      const sizeXU = e.sizeXUnit ?? e.sizeUnit ?? 'px';
      const sizeYU = e.sizeYUnit ?? e.sizeUnit ?? 'px';

      lines.push(`_${e.name}`);
      lines.push(`\tanchor=${e.anchor ?? 4}`);
      lines.push(`\topacity=${e.opacity ?? 100}`);
      lines.push(`\tpos=${this.fmt(e.x ?? 0, e.y ?? 0, posXU, posYU)}`);
      lines.push(`\tsize=${this.fmt(e.w ?? 0, e.h ?? 0, sizeXU, sizeYU)}`);
      if (e.zindex)        lines.push(`\tzindex=${e.zindex}`);
      if (e.rotate)        lines.push(`\trotate=${e.rotate}`);
      if (e.blend != null) lines.push(`\tblend=${e.blend}`);
      if (e.parent)        lines.push(`\tparent=${e.parent}`);
      const typeNum = { image: 0, text: 1, rect: 2, anim: 3, stretch: 4, ninepatch: 5 }[e.type] || 0;
      if (typeNum)    lines.push(`\ttype=${typeNum}`);
      if ((e.type === 'image' || e.type === 'stretch' || e.type === 'ninepatch') && e.tex)
        lines.push(`\ttex=${e.tex}`);
      if (e.type === 'text') {
        if (e.textVal) lines.push(`\ttext=${e.textVal}`);
        if (e.sizeMode !== 'size' && e.fsize) lines.push(`\tfsize=${e.fsize}`);
      }
      if (e.color) lines.push(`\tcolor=${e.color}`);
      if (e.type === 'anim') {
        const frameStr = e.frames?.length > 0 ? (_detectAnimPattern(e.frames) || e.tex || '') : (e.tex || '');
        if (frameStr) lines.push(`\tframe=${frameStr}`);
        if (e.interval != null) lines.push(`\tinterval=${e.interval}`);
      }
      if (e.type === 'stretch'   && e.part)      lines.push(`\tpart=${e.part}`);
      if (e.type === 'ninepatch' && e.nineRect)  lines.push(`\trect=${e.nineRect}`);
      if (e._mtnName)  lines.push(`\tmotion=${e._mtnName}`);
      lines.push('');
    });

    return lines.join('\n');
  },

  update() {
    const preview = this.generate().split('\n').slice(0, 35).join('\n');
    document.getElementById('code-pre').textContent = preview;
  },

  showFullPreview() {
    document.getElementById('m-uis-code').value = this.generate();
    window.UI?.openModal('m-uis-preview');
  },

  async copy(btn) {
    const text = this.generate();
    await navigator.clipboard.writeText(text);
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✓ OK';
      setTimeout(() => { btn.textContent = orig; }, 1400);
    }
  }
};
