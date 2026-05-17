/** モジュール間の疎結合イベントバス */
const listeners = {};

export const Bus = {
  on(ev, fn)  { (listeners[ev] = listeners[ev] || []).push(fn); },
  emit(ev, d) { (listeners[ev] || []).forEach(fn => fn(d)); }
};
