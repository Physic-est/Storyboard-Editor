import { State }     from './state.js';
import { PlayState } from './playstate.js';
import { Bus }       from './bus.js';

const LIMIT = 100;
const _undo = [];
const _redo = [];
let _lastKey  = null;
let _lastTime = 0;
const DEBOUNCE_MS = 800;

export const History = {
  /** 変更前に呼ぶ。key が同じなら 800ms 以内は重複スナップを省く */
  push(key = null) {
    const now = Date.now();
    if (key && key === _lastKey && now - _lastTime < DEBOUNCE_MS) return;
    _lastKey  = key;
    _lastTime = now;
    _undo.push(JSON.stringify(State.getProject()));
    if (_undo.length > LIMIT) _undo.shift();
    _redo.length = 0;
  },

  undo() {
    if (!_undo.length) return;
    _redo.push(JSON.stringify(State.getProject()));
    State.loadProject({ project: JSON.parse(_undo.pop()), resources: State.getResources() });
    if (PlayState.selectedId && !State.getElem(PlayState.selectedId)) PlayState.select(null);
    _lastKey = null;
    Bus.emit('project-changed');
  },

  redo() {
    if (!_redo.length) return;
    _undo.push(JSON.stringify(State.getProject()));
    State.loadProject({ project: JSON.parse(_redo.pop()), resources: State.getResources() });
    if (PlayState.selectedId && !State.getElem(PlayState.selectedId)) PlayState.select(null);
    _lastKey = null;
    Bus.emit('project-changed');
  },

  canUndo() { return _undo.length > 0; },
  canRedo()  { return _redo.length > 0; },

  clear() {
    _undo.length = 0;
    _redo.length = 0;
    _lastKey = null;
  }
};
