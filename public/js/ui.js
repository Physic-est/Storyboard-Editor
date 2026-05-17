/** UI ヘルパー — DOM操作の共通ユーティリティ */
let _confirmCb = null;

export const UI = {
  openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('modal-open')));
  },
  closeModal(id) {
    const el = document.getElementById(id);
    if (!el || el.classList.contains('hidden')) return;
    el.classList.remove('modal-open');
    let done = false;
    const hide = () => { if (!done) { done = true; el.classList.add('hidden'); } };
    el.addEventListener('transitionend', hide, { once: true });
    setTimeout(hide, 250);
  },

  toast(msg, type = 'success', duration = 2500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    container.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    setTimeout(() => {
      el.classList.remove('show');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
    }, duration);
  },

  setLoading(id, loading) {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = loading;
    el.classList.toggle('loading', loading);
  },

  confirm(msg, onOk) {
    document.getElementById('m-confirm-msg').textContent = msg;
    _confirmCb = onOk;
    this.openModal('m-confirm');
  },

  _confirmOk() {
    this.closeModal('m-confirm');
    const cb = _confirmCb; _confirmCb = null;
    if (cb) cb();
  },

  alert(msg) {
    document.getElementById('m-alert-msg').textContent = msg;
    this.openModal('m-alert');
  },

  switchTab(name, el) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('on'));
    el.classList.add('on');
    document.getElementById('tab-' + name).classList.add('on');
  },

  showCtxMenu(x, y) {
    const menu = document.getElementById('ctx-menu');
    menu.classList.remove('hidden');
    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';
  },

  hideCtxMenu() {
    document.getElementById('ctx-menu').classList.add('hidden');
  }
};
