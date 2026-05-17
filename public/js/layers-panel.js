import { State }     from './state.js';
import { PlayState } from './playstate.js';
import { Elements }  from './elements.js';
import { History }   from './history.js';
import { Bus }       from './bus.js';

const BADGES = { image: 'IMG', text: 'TXT', rect: 'RCT', anim: 'ANM', stretch: 'S4', ninepatch: 'S5' };

let _dragId   = null;
let _overId   = null;
let _overPos  = null; // 'before' | 'after'

/** 左パネルのレイヤーリスト描画（ツリー構造・zindex降順） */
export const LayersPanel = {
  _filter: '',

  setFilter(v) {
    this._filter = v.toLowerCase();
    this.render();
  },

  render() {
    const list  = document.getElementById('layer-list');
    const selId = PlayState.selectedId;
    list.innerHTML = '';

    const elems  = State.getElems();
    const byName = {};
    elems.forEach(e => { byName[e.name] = e; });

    const childrenOf = {};
    elems.forEach(e => {
      if (e.parent && byName[e.parent]) {
        (childrenOf[e.parent] = childrenOf[e.parent] || []).push(e);
      }
    });

    const roots = elems.filter(e => !e.parent || !byName[e.parent]);
    const sortDesc = arr => [...arr].sort((a, b) => (b.zindex || 0) - (a.zindex || 0));

    const filter = this._filter;

    const matchesFilter = (elem) => {
      if (!filter) return true;
      if (elem.name.toLowerCase().includes(filter)) return true;
      const kids = childrenOf[elem.name] || [];
      return kids.some(k => k.name.toLowerCase().includes(filter));
    };

    const renderItem = (elem, depth) => {
      if (!matchesFilter(elem)) return;

      const color   = State.elemColor(elem.colorIdx);
      const kids    = childrenOf[elem.name] || [];
      const hasKids = kids.length > 0;
      const item    = document.createElement('div');

      item.className = 'layer-item'
        + (elem.id === selId ? ' sel' : '')
        + (elem.locked ? ' locked' : '');
      item.dataset.id = elem.id;
      item.draggable  = true;

      if (_overId === elem.id) {
        item.classList.add(_overPos === 'before' ? 'dnd-over-before' : 'dnd-over-after');
      }

      item.onclick = () => { if (!elem.locked) PlayState.select(elem.id); };

      const paddingLeft = 8 + depth * 14;
      item.style.paddingLeft = paddingLeft + 'px';

      const treePfx = depth === 0 ? '' : '<span style="color:var(--tx2);margin-right:2px;">└</span>';
      const foldIcon = hasKids
        ? `<span style="font-size:8px;color:var(--tx2);margin-right:1px;">▾</span>`
        : `<span style="font-size:8px;margin-right:1px;"> </span>`;

      const eyeIcon = elem.visible
        ? `<svg class="icon icon-sm" aria-hidden="true"><use href="#icon-eye"/></svg>`
        : `<svg class="icon icon-sm" aria-hidden="true"><use href="#icon-eye-off"/></svg>`;

      const lockIcon = elem.locked
        ? `<svg class="icon icon-sm" aria-hidden="true"><use href="#icon-lock-on"/></svg>`
        : `<svg class="icon icon-sm" aria-hidden="true"><use href="#icon-lock-off"/></svg>`;

      item.innerHTML = `
        <button class="layer-vis ${elem.visible ? '' : 'off'}"
          onclick="event.stopPropagation();Elements.toggleVisible(${elem.id})">
          ${eyeIcon}
        </button>
        ${treePfx}${foldIcon}
        <div class="layer-dot" style="background:${color}"></div>
        <div class="layer-name" ondblclick="event.stopPropagation();LayersPanel.startRename(${elem.id},this)">${elem.name}</div>
        <span style="font-size:8px;color:var(--tx2);margin-right:3px;font-family:monospace;">${elem.zindex || 0}</span>
        <div class="layer-badge">${BADGES[elem.type] || 'IMG'}</div>
        <button class="layer-lock ${elem.locked ? 'on' : ''}"
          onclick="event.stopPropagation();Elements.toggleLock(${elem.id})"
          title="${elem.locked ? 'ロック解除' : 'ロック'}">
          ${lockIcon}
        </button>
        <button class="layer-del"
          onclick="event.stopPropagation();Elements.remove(${elem.id})">✕</button>`;

      // DnD イベント
      item.addEventListener('dragstart', e => {
        _dragId = elem.id;
        e.dataTransfer.effectAllowed = 'move';
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', () => {
        _dragId = null; _overId = null; _overPos = null;
        item.classList.remove('dragging');
        LayersPanel.render();
      });
      item.addEventListener('dragover', e => {
        if (_dragId === null || _dragId === elem.id) return;
        e.preventDefault();
        const rect = item.getBoundingClientRect();
        const pos  = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after';
        if (_overId !== elem.id || _overPos !== pos) {
          _overId  = elem.id;
          _overPos = pos;
          LayersPanel.render();
        }
      });
      item.addEventListener('dragleave', () => {
        if (_overId === elem.id) { _overId = null; _overPos = null; LayersPanel.render(); }
      });
      item.addEventListener('drop', e => {
        e.preventDefault();
        if (_dragId !== null && _dragId !== elem.id) {
          Elements.reorder(_dragId, elem.id, _overPos === 'before');
        }
        _dragId = null; _overId = null; _overPos = null;
      });

      list.appendChild(item);
      sortDesc(kids).forEach(k => renderItem(k, depth + 1));
    };

    sortDesc(roots).forEach(r => renderItem(r, 0));
  },

  startRename(id, nameEl) {
    const elem = State.getElem(id); if (!elem) return;
    if (elem.locked) return;
    const input = document.createElement('input');
    input.className = 'layer-name-input';
    input.value = elem.name;
    nameEl.replaceWith(input);
    input.focus();
    input.select();

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const newName = input.value.trim();
      if (newName && newName !== elem.name) {
        History.push('rename:' + id);
        elem.name = newName;
        Bus.emit('project-changed');
      } else {
        LayersPanel.render();
      }
    };
    const cancel = () => {
      if (committed) return;
      committed = true;
      LayersPanel.render();
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.removeEventListener('blur', commit); cancel(); }
    });
  }
};
