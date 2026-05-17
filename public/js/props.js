import { State }      from './state.js';
import { PlayState }  from './playstate.js';
import { Bus }        from './bus.js';
import { Animations } from './animations.js';
import { I18n }       from './i18n.js';
import { AnimMath }   from './anim-math.js';
import { History }    from './history.js';

/** 右パネル — プロパティ表示・編集 */
export const Props = {
  render() {
    const area = document.getElementById('props-scroll');
    const elem = State.getElem(PlayState.selectedId);
    if (!elem) {
      area.innerHTML = `<div class="empty-state"><div class="ei">✦</div><div>${I18n.t('props.empty')}</div></div>`;
      return;
    }

    const E = elem.id;

    const fmtVal = v => {
      if (typeof v === 'string') return v;
      const n = typeof v === 'number' ? v : (parseFloat(v) || 0);
      return parseFloat(n.toFixed(3)).toString();
    };
    const unitSel = (cur, defU, key) => {
      const u = cur || defU;
      return `<select class="field unit-sel" onchange="Props.setUnit(${E},'${key}',this.value)">
        <option value="%"   ${u==='%'   ?'selected':''}>%</option>
        <option value="px"  ${u==='px'  ?'selected':''}>px</option>
        <option value="rel" ${u==='rel' ?'selected':''}>rel</option>
        <option value="expr"${u==='expr'?'selected':''}>f(x)</option>
      </select>`;
    };

    const ANCHOR_LABELS = ['↖','↑','↗','←','·','→','↙','↓','↘'];
    const anchorCells = ANCHOR_LABELS.map((lbl, i) =>
      `<div class="anchor-cell${elem.anchor === i ? ' on' : ''}"
        onclick="Props.setAnchor(${E},${i})" title="${i}">${lbl}</div>`
    ).join('');

    // アニメーションリスト
    let animHtml = '';
    if (elem.animations && elem.animations.length) {
      const groups = {};
      elem.animations.forEach((a, i) => {
        (groups[a.name] = groups[a.name] || []).push({ ...a, idx: i });
      });
      for (const name in groups) {
        animHtml += `
          <div style="background:var(--bg2);border:1px solid var(--bdr);border-radius:4px;overflow:hidden;margin:0 8px 6px;">
            <div style="padding:4px 8px;background:var(--bg3);border-bottom:1px solid var(--bdr);display:flex;align-items:center;gap:5px;">
              <span style="font-size:9px;color:var(--accent2);font-family:monospace;flex:1">${name}</span>
              <span style="font-size:8px;color:var(--tx2)">${groups[name].length} kf</span>
            </div>`;
        groups[name].forEach(a => {
          const t = `${a.atimeStart || 0}~${a.atimeEnd || 0}ms`;
          const v = [
            a.from !== undefined ? `from:${a.from}` : '',
            a.to   !== undefined ? `to:${a.to}`     : ''
          ].filter(Boolean).join(' ');
          animHtml += `
            <div class="anim-kf">
              <span class="kf-name">${a.name.slice(0, 5)}</span>
              <span class="kf-range">${t}</span>
              <span class="kf-vals">${v}</span>
              <button class="kf-edit" onclick="Animations.beginEdit(${E},${a.idx})" title="${I18n.t('ctx.edit_anim')}"><svg class="icon icon-sm" aria-hidden="true"><use href="#icon-edit"/></svg></button>
              <button class="kf-del"  onclick="Animations.remove(${E},${a.idx})" title="${I18n.t('ctx.delete')}"><svg class="icon icon-sm" aria-hidden="true"><use href="#icon-close"/></svg></button>
            </div>`;
        });
        animHtml += '</div>';
      }
    } else {
      animHtml = `<div style="padding:8px 10px;font-size:10px;color:var(--tx2)">${I18n.t('props.no_anims')}</div>`;
    }

    // タイプ別フィールド
    const NON_ANIM_TEX_TYPES = ['image','stretch','ninepatch'];
    const texField = NON_ANIM_TEX_TYPES.includes(elem.type) ? `
      <div class="prop-row">
        <div class="prop-lbl">tex</div>
        <div class="tex-row">
          <input id="prop-tex" class="field" value="${elem.tex || ''}"
            onchange="Props.set(${E},'tex',this.value)" placeholder="image.png" style="flex:1"/>
          <button class="tex-pick-btn" onclick="ResPicker.open('prop-tex')"><svg class="icon" aria-hidden="true"><use href="#icon-folder"/></svg></button>
        </div>
      </div>` : '';

    const framesInfo = elem.frames?.length > 0
      ? `<div class="prop-row">
          <div class="prop-lbl"></div>
          <span style="font-size:9px;color:var(--accent2);flex:1">${I18n.t('msg.frames_selected', { n: elem.frames.length })}: ${elem.frames.slice(0,2).map(f=>f.split('/').pop()).join(', ')}${elem.frames.length>2?'…':''}</span>
          <button style="font-size:9px;background:none;border:none;color:var(--tx2);cursor:pointer;padding:0 4px;" onclick="Props.clearFrames(${E})">${I18n.t('props.frames_clear')}</button>
        </div>` : '';
    const animFrameField = elem.type === 'anim' ? `
      <div class="prop-row">
        <div class="prop-lbl">frame</div>
        <div class="tex-row">
          <input id="prop-tex" class="field" value="${elem.tex || ''}"
            onchange="Props.setAnimTex(${E},this.value)" placeholder="img_@index.png" style="flex:1"/>
          <button class="tex-pick-btn" title="${I18n.t('props.frame_pick_title')}" onclick="ResPicker.openMulti(${E})">📁</button>
        </div>
      </div>
      ${framesInfo}` : '';

    const animIntervalField = elem.type === 'anim' ? `
      <div class="prop-row">
        <div class="prop-lbl">interval</div>
        <input class="field" type="number" min="1" value="${elem.interval ?? 100}"
          onchange="Props.setN(${E},'interval',this.value)" placeholder="100"/>
        <span style="font-size:9px;color:var(--tx2);margin-left:4px;">ms</span>
      </div>` : '';

    const stretchField = elem.type === 'stretch' ? `
      <div class="prop-row">
        <div class="prop-lbl">part</div>
        <input class="field" value="${elem.part || ''}"
          onchange="Props.set(${E},'part',this.value)" placeholder="始点x,終点x"/>
      </div>` : '';

    const ninepatchField = elem.type === 'ninepatch' ? `
      <div class="prop-row">
        <div class="prop-lbl">rect</div>
        <input class="field" value="${elem.nineRect || ''}"
          onchange="Props.set(${E},'nineRect',this.value)" placeholder="x,y,w,h"/>
      </div>` : '';

    const _sizeMode = elem.sizeMode || 'fsize';
    const textFields = elem.type === 'text' ? `
      <div class="prop-row"><div class="prop-lbl">text</div>
        <input class="field" value="${elem.textVal || ''}" onchange="Props.set(${E},'textVal',this.value)"/>
      </div>
      <div class="prop-row"><div class="prop-lbl">サイズ</div>
        <select class="field" onchange="Props.set(${E},'sizeMode',this.value)">
          <option value="fsize" ${_sizeMode === 'fsize' ? 'selected' : ''}>fsize</option>
          <option value="size"  ${_sizeMode === 'size'  ? 'selected' : ''}>size</option>
        </select>
      </div>
      ${_sizeMode === 'fsize' ? `<div class="prop-row"><div class="prop-lbl">fsize</div>
        <input class="field" type="number" value="${elem.fsize || 24}" onchange="Props.setN(${E},'fsize',this.value)"/>
      </div>` : ''}` : '';

    const colorField = `
      <div class="prop-row">
        <div class="prop-lbl">color</div>
        <input type="color" class="field" value="${elem.color || '#ffffff'}"
          style="width:28px;flex:none;padding:1px;height:24px;${!elem.color ? 'opacity:0.35;' : ''}"
          onchange="Props.set(${E},'color',this.value);this.nextElementSibling.value=this.value.toUpperCase();this.style.opacity=1"/>
        <input class="field" value="${elem.color ? elem.color.toUpperCase() : ''}" placeholder="—"
          onchange="var v=this.value.trim();Props.set(${E},'color',v);this.previousElementSibling.value=v||'#ffffff';this.previousElementSibling.style.opacity=v?1:0.35"
          style="flex:1"/>
        <button class="icon-btn" title="クリア"
          onclick="Props.set(${E},'color','');this.previousElementSibling.value='';this.previousElementSibling.previousElementSibling.value='#ffffff';this.previousElementSibling.previousElementSibling.style.opacity=0.35">×</button>
      </div>`;

    const parentOptions = State.getElems()
      .filter(e => e.id !== E)
      .map(e => `<option value="${e.name}" ${elem.parent === e.name ? 'selected' : ''}>${e.name}</option>`)
      .join('');

    area.innerHTML = `
      <div class="prop-sec">
        <div class="sec-hdr">${I18n.t('props.basic')}</div>
        <div class="prop-row"><div class="prop-lbl">name</div>
          <input class="field" value="${elem.name}" onchange="Props.set(${E},'name',this.value)"/>
        </div>
        <div class="prop-row"><div class="prop-lbl">type</div>
          <select class="field" onchange="Props.set(${E},'type',this.value)">
            <option value="image"     ${elem.type === 'image'     ? 'selected' : ''}>0 - Image</option>
            <option value="text"      ${elem.type === 'text'      ? 'selected' : ''}>1 - Text</option>
            <option value="rect"      ${elem.type === 'rect'      ? 'selected' : ''}>2 - Rect</option>
            <option value="anim"      ${elem.type === 'anim'      ? 'selected' : ''}>3 - Anim</option>
            <option value="stretch"   ${elem.type === 'stretch'   ? 'selected' : ''}>4 - Stretch</option>
            <option value="ninepatch" ${elem.type === 'ninepatch' ? 'selected' : ''}>5 - Ninepatch</option>
          </select>
        </div>
        ${texField}${animFrameField}${animIntervalField}${stretchField}${ninepatchField}${textFields}${colorField}
        <div class="prop-row">
          <div class="prop-lbl">parent</div>
          <select class="field" onchange="Props.set(${E},'parent',this.value)">
            <option value="" ${!elem.parent ? 'selected' : ''}>${I18n.t('props.parent_none')}</option>
            ${parentOptions}
          </select>
        </div>
      </div>

      <div class="prop-sec">
        <div class="sec-hdr">Position</div>
        <div class="prop-row">
          <div class="prop-lbl">X</div>
          <input class="field" value="${fmtVal(elem.x ?? 0)}" style="flex:1;min-width:0"
            onchange="Props.setVU(${E},'x','posXUnit',this.value,this.nextElementSibling.value)"/>
          ${unitSel(elem.posXUnit ?? elem.posUnit, '%', 'posXUnit')}
        </div>
        <div class="prop-row">
          <div class="prop-lbl">Y</div>
          <input class="field" value="${fmtVal(elem.y ?? 0)}" style="flex:1;min-width:0"
            onchange="Props.setVU(${E},'y','posYUnit',this.value,this.nextElementSibling.value)"/>
          ${unitSel(elem.posYUnit ?? elem.posUnit, '%', 'posYUnit')}
        </div>
      </div>

      <div class="prop-sec">
        <div class="sec-hdr">Size</div>
        <div class="prop-row">
          <div class="prop-lbl">W</div>
          <input class="field" value="${fmtVal(elem.w ?? 0)}" style="flex:1;min-width:0"
            onchange="Props.setVU(${E},'w','sizeXUnit',this.value,this.nextElementSibling.value)"/>
          ${unitSel(elem.sizeXUnit ?? elem.sizeUnit, 'px', 'sizeXUnit')}
        </div>
        <div class="prop-row">
          <div class="prop-lbl">H</div>
          <input class="field" value="${fmtVal(elem.h ?? 0)}" style="flex:1;min-width:0"
            onchange="Props.setVU(${E},'h','sizeYUnit',this.value,this.nextElementSibling.value)"/>
          ${unitSel(elem.sizeYUnit ?? elem.sizeUnit, 'px', 'sizeYUnit')}
        </div>
      </div>

      <div class="prop-sec">
        <div class="sec-hdr">Transform</div>
        <div class="prop-row">
          <div class="prop-lbl">anchor</div>
          <div class="anchor-picker">${anchorCells}</div>
          <span style="font-size:9px;color:var(--tx2);margin-left:4px;">${elem.anchor ?? 4}</span>
        </div>
        <div class="prop-row"><div class="prop-lbl">rotate</div>
          <input class="field" type="number" value="${elem.rotate || 0}" min="0" max="360"
            onchange="Props.setN(${E},'rotate',this.value)"/>
        </div>
      </div>

      <div class="prop-sec">
        <div class="sec-hdr">${I18n.t('props.appearance')}</div>
        <div class="prop-row">
          <div class="prop-lbl">opacity</div>
          <input class="field" type="range" min="0" max="100" value="${elem.opacity ?? 100}"
            style="padding:7px 0;"
            oninput="Props.setN(${E},'opacity',this.value);this.nextElementSibling.textContent=this.value"/>
          <span style="font-size:9px;color:var(--tx2);min-width:22px;">${elem.opacity ?? 100}</span>
        </div>
        <div class="prop-row"><div class="prop-lbl">zindex</div>
          <input class="field" type="number" value="${elem.zindex || 0}"
            onchange="Props.setN(${E},'zindex',this.value)"/>
        </div>
        <div class="prop-row"><div class="prop-lbl">blend</div>
          <select class="field" onchange="Props.setBlend(${E},this.value)">
            <option value="" ${elem.blend == null ? 'selected' : ''}>${I18n.t('props.blend_normal')}</option>
            <option value="0" ${elem.blend === 0 ? 'selected' : ''}>${I18n.t('props.blend_add')}</option>
            <option value="1" ${elem.blend === 1 ? 'selected' : ''}>${I18n.t('props.blend_screen')}</option>
          </select>
        </div>
      </div>

      <div class="prop-sec">
        <div class="sec-hdr"><span>${I18n.t('modal_anim.add_title')} (${elem.animations.length})</span></div>
        ${animHtml}
      </div>
    `;

    const addBtn = document.createElement('button');
    addBtn.className = 'add-anim-btn';
    addBtn.innerHTML = I18n.t('props.add_anim');
    addBtn.onclick = () => Animations.beginAdd(elem.id);
    area.appendChild(addBtn);
  },

  set(id, key, val) {
    const e = State.getElem(id); if (!e) return;
    History.push(`${id}:${key}`);
    e[key] = val;
    Bus.emit('project-changed');
  },

  setN(id, key, val) { this.set(id, key, parseFloat(val) || 0); },

  setVU(id, valKey, unitKey, rawVal, unit) {
    const e = State.getElem(id); if (!e) return;
    History.push(`${id}:${valKey}`);
    if (unit === 'expr') {
      e[valKey]  = String(rawVal).trim();
      e[unitKey] = 'expr';
    } else {
      e[valKey]  = parseFloat(rawVal) || 0;
      e[unitKey] = unit;
    }
    if (unitKey === 'posXUnit')  e.posUnit  = e[unitKey];
    if (unitKey === 'sizeXUnit') e.sizeUnit = e[unitKey];
    Bus.emit('project-changed');
  },

  setUnit(id, unitKey, newUnit) {
    const e = State.getElem(id); if (!e) return;
    History.push();
    const { width, height, unit: unitValue } = State.getSettings();
    const ub = (height || 1080) / (unitValue || 1080);

    // 軸ごとの valKey と dim
    const META = {
      posXUnit:  { valKey: 'x', dim: width  },
      posYUnit:  { valKey: 'y', dim: height },
      sizeXUnit: { valKey: 'w', dim: width  },
      sizeYUnit: { valKey: 'h', dim: height },
    };

    // 任意の単位から論理 px → 新単位 へ変換
    const convert = (val, fromUnit, toUnit, dim) => {
      if (fromUnit === toUnit || toUnit === 'expr') return val;
      // → 論理 px
      let px;
      if (typeof val === 'string' || fromUnit === 'expr') {
        px = AnimMath.evalExpr(val, dim, ub);
      } else {
        const n = typeof val === 'number' ? val : (parseFloat(val) || 0);
        if      (fromUnit === 'px' || fromUnit === '_px') px = n;
        else if (fromUnit === '%')   px = n / 100 * dim;
        else if (fromUnit === 'rel') px = n * ub;
        else px = n;
      }
      // → 新単位
      if (newUnit === 'px')  return px;
      if (newUnit === '%')   return px / dim * 100;
      if (newUnit === 'rel') return px / ub;
      return px;
    };

    // 対応する値を変換
    const meta = META[unitKey];
    if (meta) {
      const oldUnit = e[unitKey]
        ?? (unitKey.startsWith('pos')  ? e.posUnit  : e.sizeUnit)
        ?? (unitKey.startsWith('pos')  ? '%'        : 'px');
      const converted = convert(e[meta.valKey] ?? 0, oldUnit, newUnit, meta.dim);
      if (newUnit !== 'expr') e[meta.valKey] = parseFloat(converted.toFixed(4));
    }

    // posXUnit 変更時: posUnit も変わるため、posYUnit 未設定なら Y も変換
    if (unitKey === 'posXUnit' && e.posYUnit == null) {
      const oldShared = e.posUnit ?? '%';
      const converted = convert(e.y ?? 0, oldShared, newUnit, height);
      if (newUnit !== 'expr') e.y = parseFloat(converted.toFixed(4));
    }
    // sizeXUnit 変更時: sizeUnit も変わるため、sizeYUnit 未設定なら H も変換
    if (unitKey === 'sizeXUnit' && e.sizeYUnit == null) {
      const oldShared = e.sizeUnit ?? 'px';
      const converted = convert(e.h ?? 0, oldShared, newUnit, height);
      if (newUnit !== 'expr') e.h = parseFloat(converted.toFixed(4));
    }

    e[unitKey] = newUnit;
    if (unitKey === 'posXUnit')  e.posUnit  = newUnit;
    if (unitKey === 'sizeXUnit') e.sizeUnit = newUnit;
    Bus.emit('project-changed');
  },

  setAnchor(id, val) { this.set(id, 'anchor', val); this.render(); },

  setBlend(id, val) {
    const e = State.getElem(id); if (!e) return;
    History.push();
    if (val === '') delete e.blend;
    else e.blend = parseInt(val);
    Bus.emit('project-changed');
  },

  setAnimTex(id, val) {
    const e = State.getElem(id); if (!e) return;
    History.push(`${id}:tex`);
    e.tex = val;
    e.frames = [];
    Bus.emit('project-changed');
  },

  clearFrames(id) {
    const e = State.getElem(id); if (!e) return;
    History.push();
    e.frames = [];
    Bus.emit('project-changed');
  }
};
