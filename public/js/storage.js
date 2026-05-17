/**
 * storage.js — IndexedDB によるプロジェクト永続化
 * GitHub Pages / サーバーレス環境でも動作する
 */

const DB_NAME    = 'uis-storyboard-editor';
const DB_VERSION = 1;
const STORE      = 'projects';

let db = null;

function openDB() {
  if (db) return Promise.resolve(db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(STORE)) {
        const store = d.createObjectStore(STORE, { keyPath: 'name' });
        store.createIndex('modified', 'modified', { unique: false });
      }
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror   = e => reject(e.target.error);
  });
}

function tx(mode) {
  return openDB().then(d => d.transaction(STORE, mode).objectStore(STORE));
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

export const Storage = {
  /** プロジェクト一覧を modified 降順で返す */
  async list() {
    const store = await tx('readonly');
    const all   = await wrap(store.getAll());
    return all
      .sort((a, b) => b.modified - a.modified)
      .map(r => ({ name: r.name, modified: r.modified }));
  },

  /** プロジェクトを保存 (上書き) */
  async save(name, data) {
    const store = await tx('readwrite');
    await wrap(store.put({ name, data, modified: Date.now() }));
  },

  /** プロジェクトを読み込む */
  async load(name) {
    const store = await tx('readonly');
    const rec   = await wrap(store.get(name));
    if (!rec) throw new Error(`"${name}" が見つかりません`);
    return rec.data;
  },

  /** プロジェクトを削除 */
  async delete(name) {
    const store = await tx('readwrite');
    await wrap(store.delete(name));
  }
};
