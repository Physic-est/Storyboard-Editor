import { Bus } from './bus.js';

/** 再生位置・選択状態 */
export const PlayState = {
  currentTime: 0,
  selectedId:  null,

  setTime(ms) {
    this.currentTime = ms;
    Bus.emit('time-changed', ms);
  },

  select(id) {
    this.selectedId = id;
    Bus.emit('selection-changed', id);
  }
};
