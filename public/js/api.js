/** ブラウザダウンロードヘルパー (サーバー不要) */
export const Api = {
  downloadBlob(filename, content, mime = 'text/plain') {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a   = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  downloadJson(filename, obj) {
    this.downloadBlob(filename, JSON.stringify(obj, null, 2), 'application/json');
  }
};
