import { State } from './state.js';
import { Bus }   from './bus.js';
import { UI }    from './ui.js';
import { I18n }  from './i18n.js';

/** 画像・音声リソース管理 */
export const Resources = {
  loadImages(input) {
    Array.from(input.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        const dataUrl = e.target.result;
        const img = new Image();
        img.onload = () => {
          State.getResources().images.push({
            name: file.name, dataUrl,
            naturalW: img.naturalWidth, naturalH: img.naturalHeight
          });
          this.renderPanel();
          Bus.emit('resources-changed');
        };
        img.onerror = () => {
          State.getResources().images.push({ name: file.name, dataUrl });
          this.renderPanel();
          Bus.emit('resources-changed');
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
    input.value = '';
  },

  getImage(name) {
    return State.getResources().images.find(i => i.name === name) || null;
  },

  removeImage(idx) {
    const img = State.getResources().images[idx];
    UI.confirm(I18n.t('msg.delete_confirm', { name: img?.name || 'image' }), () => {
      State.getResources().images.splice(idx, 1);
      this.renderPanel();
      Bus.emit('resources-changed');
    });
  },

  removeAudio(idx) {
    const aud = State.getResources().audio[idx];
    UI.confirm(I18n.t('msg.delete_confirm', { name: aud?.name || 'audio' }), () => {
      State.getResources().audio.splice(idx, 1);
      this.renderPanel();
    });
  },

  renderPanel() {
    const imgs  = State.getResources().images;
    const auds  = State.getResources().audio;
    const grid  = document.getElementById('res-img-grid');
    const alist = document.getElementById('res-audio-list');

    grid.innerHTML = imgs.length === 0
      ? `<div class="res-empty">${I18n.t('res.no_images')}</div>`
      : imgs.map((img, i) => `
        <div class="res-thumb">
          <img src="${img.dataUrl}"/>
          <div class="rname">${img.name}</div>
          <button class="rdel" onclick="event.stopPropagation();Resources.removeImage(${i})">✕</button>
        </div>`).join('');

    alist.innerHTML = auds.length === 0
      ? `<div class="res-empty">${I18n.t('res.no_audio')}</div>`
      : auds.map((a, i) => `
        <div class="res-audio">
          <span>🎵</span>
          <span class="ra-name">${a.name}</span>
          <button class="ra-use" onclick="Audio.useResource(${i})">${I18n.t('res.audio_use')}</button>
          <button class="ra-del" onclick="Resources.removeAudio(${i})">✕</button>
        </div>`).join('');
  }
};
