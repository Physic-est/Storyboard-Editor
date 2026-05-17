import { Bus } from './bus.js';

export const Theme = {
  current: 'light',

  toggle() {
    this.current = this.current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', this.current);
    document.getElementById('tt-dark').classList.toggle('on',  this.current === 'dark');
    document.getElementById('tt-light').classList.toggle('on', this.current === 'light');
    Bus.emit('theme-changed', this.current);
  }
};
