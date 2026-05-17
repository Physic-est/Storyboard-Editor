import { State }     from './state.js';
import { PlayState } from './playstate.js';
import { Resources } from './resources.js';

/** 音声再生・波形描画・シーク */
let audioCtx = null;
let buffer   = null;
let source   = null;
let startT   = 0, startOff = 0;
let rafId    = null;
let playing  = false;
let dur      = 0;

function ensureCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

async function load(input) {
  const file = input.files[0]; if (!file) return;
  ensureCtx();
  const ab = await file.arrayBuffer();
  buffer   = await audioCtx.decodeAudioData(ab);
  dur      = buffer.duration * 1000;

  const reader = new FileReader();
  reader.onload = e => {
    const res = State.getResources();
    if (!res.audio.find(a => a.name === file.name))
      res.audio.push({ name: file.name, dataUrl: e.target.result });
    Resources.renderPanel();
  };
  reader.readAsDataURL(file);

  drawWaveform();
  document.querySelector('.audio-btn').innerHTML = `<svg class="icon" aria-hidden="true"><use href="#icon-music"/></svg> ${file.name}`;
  input.value = '';
  window.Timeline?.render();
  updateUI();
}

async function useResource(idx) {
  const a = State.getResources().audio[idx]; if (!a) return;
  ensureCtx();
  const res = await fetch(a.dataUrl);
  const ab  = await res.arrayBuffer();
  buffer    = await audioCtx.decodeAudioData(ab);
  dur       = buffer.duration * 1000;
  drawWaveform();
  document.querySelector('.audio-btn').innerHTML = `<svg class="icon" aria-hidden="true"><use href="#icon-music"/></svg> ${a.name}`;
  window.Timeline?.render();
  updateUI();
}

function drawWaveform() {
  if (!buffer) return;
  const cv   = document.getElementById('waveform-cv');
  const wrap = document.getElementById('waveform-wrap');
  const dpr  = window.devicePixelRatio || 1;
  cv.width   = wrap.clientWidth  * dpr;
  cv.height  = wrap.clientHeight * dpr;
  cv.style.width  = wrap.clientWidth  + 'px';
  cv.style.height = wrap.clientHeight + 'px';
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const bg  = getComputedStyle(document.documentElement).getPropertyValue('--wv-bg').trim();
  const acc = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const data = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / W));
  ctx.strokeStyle = acc;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < W; i++) {
    let mn = 1, mx = -1;
    for (let j = 0; j < step; j++) {
      const v = data[i * step + j] || 0;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    ctx.moveTo(i, H / 2 + mn * H / 2 * 0.88);
    ctx.lineTo(i, H / 2 + mx * H / 2 * 0.88);
  }
  ctx.stroke();
}

function toggle() { playing ? stop() : start(); }

function start() {
  ensureCtx();
  if (buffer) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    const offsetMs    = State.getSettings().audioOffset ?? 0;
    const audioPosSec = (PlayState.currentTime - offsetMs) / 1000;
    if (audioPosSec >= 0) {
      source.start(0, audioPosSec);
    } else {
      source.start(-audioPosSec, 0);
    }
    source.onended = () => { if (playing) stop(); };
  }
  startT   = audioCtx ? audioCtx.currentTime : performance.now() / 1000;
  startOff = PlayState.currentTime / 1000;
  playing  = true;
  document.getElementById('tp-play').classList.add('playing');
  document.getElementById('tp-play').innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-pause"/></svg>';
  tick();
}

function stop() {
  if (source) { try { source.stop(); } catch (e) {} source = null; }
  playing = false;
  document.getElementById('tp-play').classList.remove('playing');
  document.getElementById('tp-play').innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-play"/></svg>';
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
}

function tick() {
  if (!playing) return;
  const now = audioCtx ? audioCtx.currentTime : performance.now() / 1000;
  const t   = (startOff + (now - startT)) * 1000;
  if (dur > 0 && t >= dur) { seek(dur); stop(); updateAll(); return; }
  PlayState.setTime(t);
  updateAll();
  rafId = requestAnimationFrame(tick);
}

function seek(ms) {
  const was = playing; if (was) stop();
  PlayState.setTime(Math.max(0, Math.min(ms, dur || Infinity)));
  updateAll();
  if (was) start();
}

function seekRel(deltaMs) {
  seek(PlayState.currentTime + deltaMs);
}

function seekByClick(e) {
  const wrap = document.getElementById('waveform-wrap');
  const r    = wrap.getBoundingClientRect();
  seek((e.clientX - r.left) / r.width * (dur || 10000));
}

function updateAll() {
  updateUI();
  window.Timeline?.updatePlayhead();
  window.Canvas?.render();
  updateWaveheadPos();
}

function updateUI() {
  const ms  = Math.floor(PlayState.currentTime);
  const m   = Math.floor(ms / 60000);
  const s   = Math.floor(ms % 60000 / 1000);
  const ms3 = ms % 1000;
  document.getElementById('time-display').textContent =
    `${m}:${String(s).padStart(2, '0')}.${String(ms3).padStart(3, '0')}`;
  const fmt = t => {
    const mm = Math.floor(t / 60000);
    const ss = (t % 60000 / 1000).toFixed(1);
    return `${mm}:${ss.padStart(4, '0')}`;
  };
  document.getElementById('dur-display').textContent =
    `${fmt(PlayState.currentTime)} / ${fmt(dur)}`;
}

function updateWaveheadPos() {
  if (dur <= 0) return;
  document.getElementById('wv-playhead').style.left =
    (PlayState.currentTime / dur * 100) + '%';
}

export const Audio = {
  load, useResource, toggle, seek, seekRel, seekByClick, drawWaveform,
  get duration() { return dur; }
};
