import { State }     from './state.js';
import { PlayState } from './playstate.js';
import { Bus }       from './bus.js';
import { UI }        from './ui.js';
import { I18n }      from './i18n.js';
import { History }   from './history.js';

/** 要素の追加・削除・表示切替 */
let pendingType = null;

const TEX_TYPES = ['image', 'anim', 'stretch', 'ninepatch'];

function beginAdd(type) {
  pendingType = type;
  document.getElementById('m-add-title').textContent = I18n.t('msg.add_elem_title', { type });
  document.getElementById('m-add-name').value =
    type.charAt(0).toUpperCase() + type.slice(1) + '-' + State.getProject().nextId;
  document.getElementById('m-add-tex-row').classList.toggle('hidden',   !TEX_TYPES.includes(type));
  document.getElementById('m-add-text-row').classList.toggle('hidden',  type !== 'text');
  document.getElementById('m-add-color-row').classList.toggle('hidden', type !== 'rect');
  UI.openModal('m-add-elem');
  const nameField = document.getElementById('m-add-name');
  nameField.focus();
  nameField.select();
}

function confirmAdd() {
  const name = document.getElementById('m-add-name').value.trim() || 'Elem-' + State.nextId();
  const elems = State.getElems();
  History.push();
  const elem = {
    id:       State.nextId(),
    name,
    type:     pendingType,
    tex:      document.getElementById('m-add-tex').value.trim(),
    textVal:  document.getElementById('m-add-textval').value.trim(),
    color:    document.getElementById('m-add-color').value,
    x: 50, y: 50, posUnit: '%',
    w: 200, h: 200, sizeUnit: 'px',
    anchor: 4, opacity: 100, zindex: 100,
    rotate: 0, visible: true, locked: false, animations: [],
    parent: '', colorIdx: elems.length
  };
  UI.closeModal('m-add-elem');
  _addDirect(elem);
}

function _addDirect(elem) {
  if (!elem.id)         elem.id       = State.nextId();
  if (!('colorIdx' in elem)) elem.colorIdx = State.getElems().length;
  if (!elem.animations) elem.animations = [];
  State.getElems().push(elem);
  Bus.emit('project-changed');
  PlayState.select(elem.id);
}

function remove(id) {
  const elems = State.getElems();
  const elem  = elems.find(e => e.id === id);
  if (!elem) return;
  UI.confirm(I18n.t('msg.delete_confirm', { name: elem.name }), () => {
    const i = elems.findIndex(e => e.id === id);
    if (i < 0) return;
    History.push();
    elems.splice(i, 1);
    if (PlayState.selectedId === id) PlayState.select(null);
    Bus.emit('project-changed');
  });
}

function toggleVisible(id) {
  const e = State.getElem(id); if (!e) return;
  History.push();
  e.visible = !e.visible;
  Bus.emit('project-changed');
}

function toggleLock(id) {
  const e = State.getElem(id); if (!e) return;
  History.push();
  e.locked = !e.locked;
  Bus.emit('project-changed');
}

function duplicate(id) {
  const src = State.getElem(id); if (!src) return;
  History.push();
  const clone = JSON.parse(JSON.stringify(src));
  clone.id = State.nextId();
  clone.name = src.name + '-copy';
  clone.colorIdx = State.getElems().length % 9;
  State.getElems().push(clone);
  Bus.emit('project-changed');
  PlayState.select(clone.id);
}

function reorder(draggedId, targetId, insertBefore) {
  const elems   = State.getElems();
  const ordered = [...elems].sort((a, b) => (b.zindex || 0) - (a.zindex || 0));
  const zvals   = ordered.map(e => e.zindex || 0);

  const dragIdx = ordered.findIndex(e => e.id === draggedId);
  if (dragIdx < 0) return;
  const [dragged] = ordered.splice(dragIdx, 1);

  const targetIdx = ordered.findIndex(e => e.id === targetId);
  if (targetIdx < 0) return;
  const insertAt = insertBefore ? targetIdx : targetIdx + 1;
  ordered.splice(insertAt, 0, dragged);

  History.push();
  ordered.forEach((e, i) => { e.zindex = zvals[i]; });
  Bus.emit('project-changed');
}

export const Elements = { beginAdd, confirmAdd, _addDirect, remove, toggleVisible, toggleLock, duplicate, reorder };
