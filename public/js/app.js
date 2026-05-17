import { Bus }         from './bus.js';
import { State }       from './state.js';
import { PlayState }   from './playstate.js';
import { History }     from './history.js';
import { Theme }       from './theme.js';
import { UI }          from './ui.js';
import { I18n }        from './i18n.js';
import { Canvas }      from './canvas.js';
import { Drag }        from './drag.js';
import { Elements }    from './elements.js';
import { LayersPanel } from './layers-panel.js';
import { Resources }   from './resources.js';
import { ResPicker }   from './res-picker.js';
import { Animations }  from './animations.js';
import { Props }       from './props.js';
import { Timeline }    from './timeline.js';
import { Audio }       from './audio.js';
import { CodeGen }     from './codegen.js';
import { Api }         from './api.js';
import { Storage }     from './storage.js';
import { UISParser }   from './uis-parser.js';
import { Chart }       from './chart.js';

let _dirty = false;

const App = {
  init() {
    Bus.on('project-changed', () => {
      _dirty = true;
      App._updateDirtyIndicator();
      LayersPanel.render();
      Canvas.render();
      Props.render();
      Timeline.render();
      CodeGen.update();
      App._updateHistoryBtns();
      App._updateStatusBar();
    });
    Bus.on('selection-changed', () => {
      LayersPanel.render();
      Canvas.render();
      Props.render();
      Timeline.render();
    });
    Bus.on('time-changed', () => {
      Canvas.render();
      Timeline.updatePlayhead();
      App._updateStatusTime();
    });
    Bus.on('resources-changed', () => {
      Resources.renderPanel();
      Canvas.render();
    });
    Bus.on('theme-changed', () => {
      Audio.drawWaveform();
      Timeline.render();
    });
    Bus.on('lang-changed', () => {
      Props.render();
      Resources.renderPanel();
    });

    window.addEventListener('beforeunload', e => {
      if (_dirty) { e.preventDefault(); e.returnValue = ''; }
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('#ctx-menu')) UI.hideCtxMenu();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop:not(.hidden)')
          .forEach(m => { if (m.id) UI.closeModal(m.id); });
        UI.hideCtxMenu();
      }
      // Ctrl+S はフォーム入力中でも動作させる
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); App.showSaveDialog(); return; }

      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) { e.preventDefault(); History.undo(); return; }
      if (e.ctrlKey && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); History.redo(); return; }
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        if (PlayState.selectedId) Elements.duplicate(PlayState.selectedId);
        return;
      }
      if (e.key === ' ') { e.preventDefault(); Audio.toggle(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && PlayState.selectedId) {
        Elements.remove(PlayState.selectedId);
        return;
      }
      if (e.key === '[') { e.preventDefault(); Timeline.scrollBy(-200); return; }
      if (e.key === ']') { e.preventDefault(); Timeline.scrollBy(200); return; }
      if (e.key === '?') { e.preventDefault(); App.showShortcuts(); return; }
    });

    document.getElementById('m-add-color').addEventListener('input', function () {
      document.getElementById('m-add-colorhex').value = this.value.toUpperCase();
    });
    document.getElementById('m-add-colorhex').addEventListener('input', function () {
      if (/^#[0-9A-Fa-f]{6}$/.test(this.value))
        document.getElementById('m-add-color').value = this.value;
    });

    Canvas.fit();
    Resources.renderPanel();
    CodeGen.update();

    Elements._addDirect({
      type: 'rect', name: 'BG', color: '#000000',
      x: 50, y: 50, posUnit: '%',
      w: 100, h: 100, sizeUnit: '%',
      anchor: 4, opacity: 100, zindex: 0,
      rotate: 0, visible: true, locked: false, animations: [], parent: '', colorIdx: 0
    });

    I18n.applyDOM();
    App._markClean();
  },

  newProject() {
    UI.confirm(I18n.t('msg.new_project'), () => {
      State.reset();
      History.clear();
      PlayState.select(null);
      PlayState.setTime(0);
      Bus.emit('project-changed');
      Resources.renderPanel();
      App._markClean();
    });
  },

  // ── Save ──
  showSaveDialog() {
    document.getElementById('save-name').value = 'storyboard';
    UI.openModal('m-save');
  },

  async saveToIndexedDB() {
    const name = document.getElementById('save-name').value.trim() || 'storyboard';
    UI.setLoading('btn-save-idb', true);
    try {
      await Storage.save(name, State.serialize());
      UI.closeModal('m-save');
      App._markClean();
      UI.toast(I18n.t('msg.saved', { name }));
    } catch (e) {
      UI.alert(I18n.t('msg.save_err', { msg: e.message }));
    } finally {
      UI.setLoading('btn-save-idb', false);
    }
  },

  saveToBrowser() {
    const name = document.getElementById('save-name').value.trim() || 'storyboard';
    Api.downloadJson(name + '.json', State.serialize());
    UI.closeModal('m-save');
    App._markClean();
  },

  // ── Load ──
  async showLoadDialog() {
    const list = document.getElementById('load-idb-list');
    list.innerHTML = `<div style="color:var(--tx2);font-size:10px;padding:8px">${I18n.t('msg.loading')}</div>`;
    UI.openModal('m-load');

    try {
      const projects = await Storage.list();
      if (projects.length === 0) {
        list.innerHTML = `<div style="color:var(--tx2);font-size:10px;padding:8px">${I18n.t('msg.no_saved_projects')}</div>`;
        return;
      }
      list.innerHTML = '';
      projects.forEach(p => {
        const item = document.createElement('div');
        item.className = 'load-item';
        const date = new Date(p.modified).toLocaleString(I18n.getLang() === 'ja' ? 'ja-JP' : I18n.getLang() === 'zh' ? 'zh-CN' : 'en-US');
        item.innerHTML = `
          <span class="li-name"><svg class="icon" aria-hidden="true"><use href="#icon-new"/></svg> ${p.name}</span>
          <span class="li-date">${date}</span>
          <button class="li-del"
            onclick="event.stopPropagation();App._deleteProject('${p.name}',this.closest('.load-item'))"><svg class="icon" aria-hidden="true"><use href="#icon-trash"/></svg></button>`;
        item.onclick = () => App._loadFromIDB(p.name);
        list.appendChild(item);
      });
    } catch (e) {
      list.innerHTML = `<div style="color:var(--accent3);font-size:10px;padding:8px">${I18n.t('msg.error', { msg: e.message })}</div>`;
    }
  },

  async _loadFromIDB(name) {
    try {
      const data = await Storage.load(name);
      State.loadProject(data);
      History.clear();
      PlayState.select(null);
      PlayState.setTime(0);
      Bus.emit('project-changed');
      Resources.renderPanel();
      App._markClean();
      UI.closeModal('m-load');
    } catch (e) {
      UI.alert(I18n.t('msg.load_err', { msg: e.message }));
    }
  },

  _deleteProject(name, el) {
    UI.confirm(I18n.t('msg.delete_confirm', { name }), async () => {
      try {
        await Storage.delete(name);
        el.remove();
      } catch (e) {
        UI.alert(I18n.t('msg.delete_err', { msg: e.message }));
      }
    });
  },

  loadFile(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        State.loadProject(data);
        History.clear();
        PlayState.select(null);
        PlayState.setTime(0);
        Bus.emit('project-changed');
        Resources.renderPanel();
        App._markClean();
      } catch (err) {
        UI.alert(I18n.t('msg.load_fail', { msg: err.message }));
      }
    };
    reader.readAsText(file);
    input.value = '';
  },

  // ── UIS Import ──
  async importUIS(input) {
    const files = Array.from(input.files);
    input.value = '';
    if (!files.length) return;

    const uisFiles = files.filter(f => f.name.endsWith('.uis'));
    if (!uisFiles.length) { UI.alert(I18n.t('msg.uis_not_found')); return; }

    if (uisFiles.length > 1) {
      const list = document.getElementById('m-uis-select-list');
      list.innerHTML = '';
      uisFiles.forEach(f => {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.style.cssText = 'text-align:left;justify-content:flex-start;font-size:12px;padding:7px 10px;';
        btn.textContent = f.name;
        btn.onclick = () => {
          UI.closeModal('m-uis-select');
          this._doImportUIS(f, files);
        };
        list.appendChild(btn);
      });
      UI.openModal('m-uis-select');
      return;
    }

    this._doImportUIS(uisFiles[0], files);
  },

  _doImportUIS(uisFile, files) {
    UI.confirm(I18n.t('msg.uis_import_confirm', { name: uisFile.name }), async () => {
      const text = await uisFile.text();
      const { settings, elements } = UISParser.parse(text);

      State.reset();
      Object.assign(State.getSettings(), settings);

      const elems = State.getElems();
      elements.forEach((elem, i) => {
        if (!elem.id)       elem.id       = State.nextId();
        if (!elem.colorIdx) elem.colorIdx = i % 9;
        if (!elem.animations) elem.animations = [];
        elems.push(elem);
      });

      const imgFiles = files.filter(f => /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(f.name));
      if (imgFiles.length) {
        const res = State.getResources();
        for (const img of imgFiles) {
          if (res.images.find(r => r.name === img.name)) continue;
          const dataUrl = await _blobToBase64(img);
          const { w: naturalW, h: naturalH } = await _getImgSize(dataUrl);
          res.images.push({ name: img.name, dataUrl, naturalW, naturalH });
        }
      }

      History.clear();
      PlayState.select(null);
      PlayState.setTime(0);
      Bus.emit('project-changed');
      Bus.emit('resources-changed');
      App._markClean();
    });
  },

  // ── Export .uis ──
  exportUIS() {
    const code = CodeGen.generate();
    Api.downloadBlob('storyboard.uis', code, 'text/plain');
  },

  // ── ZIP Export ──
  async exportZIP() {
    UI.setLoading('btn-export-zip', true);
    let JSZip;
    try {
      JSZip = (await import('https://esm.sh/jszip@3.10.1')).default;
    } catch (e) {
      UI.alert(I18n.t('msg.jszip_fail', { msg: e.message }));
      UI.setLoading('btn-export-zip', false);
      return;
    }
    try {
      const zip  = new JSZip();
      const code = CodeGen.generate();
      zip.file('storyboard.uis', code);

      const images = State.getResources().images;
      for (const img of images) {
        if (!img.dataUrl) continue;
        const data = img.dataUrl.startsWith('data:')
          ? img.dataUrl.split(',')[1]
          : await fetch(img.dataUrl).then(r => r.arrayBuffer()).then(_ab2b64);
        zip.file(img.name, data, { base64: true });
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      Api.downloadBlob('storyboard.zip', blob, 'application/zip');
    } finally {
      UI.setLoading('btn-export-zip', false);
    }
  },

  // ── Chart ──
  async loadChart(input) {
    const file = input.files[0]; if (!file) return;
    input.value = '';
    try {
      const { noteCount } = await Chart.load(file);
      const info = document.getElementById('chart-info');
      const btn  = document.getElementById('chart-clear-btn');
      if (info) info.textContent = `${file.name}  |  ${noteCount} notes`;
      if (btn)  btn.style.display = '';
      Canvas.render();
    } catch (e) {
      UI.alert(I18n.t('msg.chart_err', { msg: e.message }));
    }
  },

  clearChart() {
    Chart.clear();
    const info = document.getElementById('chart-info');
    const btn  = document.getElementById('chart-clear-btn');
    if (info) info.textContent = '';
    if (btn)  btn.style.display = 'none';
    Canvas.render();
  },

  setApproachMs(val) {
    Chart.setApproachMs(val);
    Canvas.render();
  },

  // ── Settings ──
  openSettings() {
    const s = State.getSettings();
    document.getElementById('s-width').value  = s.width;
    document.getElementById('s-height').value = s.height;
    document.getElementById('s-unit').value   = s.unit;
    document.getElementById('s-angle').value  = s.angle;
    document.getElementById('s-3d').checked              = s.apply3d;
    document.getElementById('s-audio-offset').value      = s.audioOffset ?? 0;
    UI.openModal('m-settings');
  },

  _markClean() {
    _dirty = false;
    App._updateDirtyIndicator();
  },

  _updateDirtyIndicator() {
    const dot = document.getElementById('dirty-dot');
    if (dot) dot.style.display = _dirty ? '' : 'none';
  },

  _updateStatusBar() {
    const elems = State.getElems();
    const animCount = elems.reduce((sum, e) => sum + (e.animations?.length || 0), 0);
    const sbElems = document.getElementById('sb-elems');
    const sbAnims = document.getElementById('sb-anims');
    if (sbElems) sbElems.textContent = I18n.t('status.elems', { n: elems.length });
    if (sbAnims) sbAnims.textContent = I18n.t('status.anims', { n: animCount });
  },

  _updateStatusTime() {
    const el = document.getElementById('sb-time');
    if (!el) return;
    const ms = PlayState.currentTime;
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const cs = Math.floor((ms % 1000) / 10);
    el.textContent = `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  },

  showShortcuts() {
    UI.openModal('m-shortcuts');
  },

  _updateHistoryBtns() {
    const u = document.getElementById('btn-undo');
    const r = document.getElementById('btn-redo');
    if (u) u.disabled = !History.canUndo();
    if (r) r.disabled = !History.canRedo();
  },

  applySettings() {
    History.push();
    const s = State.getSettings();
    s.width   = parseInt(document.getElementById('s-width').value)  || 1920;
    s.height  = parseInt(document.getElementById('s-height').value) || 1080;
    s.unit    = parseInt(document.getElementById('s-unit').value)   || 1080;
    s.angle   = parseInt(document.getElementById('s-angle').value)  || 45;
    s.apply3d     = document.getElementById('s-3d').checked;
    s.audioOffset = parseInt(document.getElementById('s-audio-offset').value) || 0;
    UI.closeModal('m-settings');
    Canvas.fit();
    Bus.emit('project-changed');
  }
};

function _blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

function _ab2b64(ab) {
  return btoa(String.fromCharCode(...new Uint8Array(ab)));
}

function _getImgSize(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload  = () => resolve({ w: img.naturalWidth,  h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = dataUrl;
  });
}

Object.assign(window, {
  App, Theme, UI, I18n, Bus, History, Canvas, Drag, Elements, LayersPanel,
  Resources, ResPicker, Animations, Props, Timeline, Audio, CodeGen, Api, Chart
});

App.init();
