# UIS Storyboard Editor

Malody 音楽ゲーム用の UIS ストーリーボードをビジュアルエディターで作成・編集できるブラウザアプリです。コードを書かずに、タイムライン操作とプレビューだけでアニメーション付き `.uis` ファイルを出力できます。

> **A browser-based visual editor for Malody UIS storyboards.** Create animated elements with a timeline UI and export `.uis` files directly — no coding required.

**[▶ エディターを開く / Open Editor](https://physic-est.github.io/Storyboard-Editor/public/)**

---

## 機能 / Features

### 要素タイプ
| 種類 | 説明 |
|------|------|
| **Image** | 画像スプライト |
| **Text** | テキストラベル |
| **Rect** | 矩形（色塗り） |
| **Anim** | フレームアニメーション画像 |
| **Stretch** | 引き伸ばし画像 |
| **9patch** | ナインパッチ画像 |

### アニメーションプロパティ
`fade` / `movex` / `movey` / `move` / `rotate` / `scale` / `scalex` / `scaley` / `size` / `width` / `height` / `tint` / `skew` / `show` / `hide`

### その他の機能
- **タイムライン** — アニメーショントラックをドラッグ操作で編集
- **イージング** — easein / easeout / カスタムベジェ曲線
- **音声再生 + 波形表示** — 音楽に合わせてプレビュー
- **譜面同期** — Malody `.mc` ファイルを読み込んでノーツタイミングを表示（**Slide モードのみ対応**）
- **UIS 入出力** — `.uis` ファイルのインポート／エクスポート、ZIP 一括エクスポート
- **ブラウザ保存** — IndexedDB にプロジェクトを保存（オフライン対応）
- **アンドゥ／リドゥ** — 100 ステップ履歴
- **テーマ** — ダーク / ライト切り替え
- **多言語** — 日本語 / English / 中文

---

## 使い方 / Usage

1. ヘッダーの **Image / Text / Rect …** ボタンで要素を追加
2. キャンバス上でドラッグして位置・サイズを調整
3. タイムラインを右クリック → **アニメーション追加** でキーフレームを設定
4. **Space** キーで再生してプレビュー確認
5. **Export .uis** ボタンで UIS ファイルを出力

### キーボードショートカット
| キー | 動作 |
|------|------|
| `Space` | 再生 / 停止 |
| `Ctrl+Z` | 元に戻す |
| `Ctrl+Y` / `Ctrl+Shift+Z` | やり直す |
| `Ctrl+S` | 保存ダイアログ |
| `Ctrl+D` | 要素を複製 |
| `Delete` / `Backspace` | 選択要素を削除 |
| `?` | ショートカット一覧 |

---

## ローカル実行 / Local Development

ビルド不要。Python の開発サーバーを起動するだけで使えます。

```bash
python -m http.server 3000 --directory public
```

その後 `http://localhost:3000` にアクセス。

ネイティブ ES モジュールを使用しているため、`file://` での直接開封は機能しません。

---

## 技術スタック / Tech Stack

- **Vanilla JS** (ES Modules、フレームワーク不使用)
- **Canvas API** — プレビューレンダリング
- **Web Audio API** — 音声再生・波形描画
- **IndexedDB** — ブラウザ内永続化
- サーバーサイド処理なし、完全クライアントサイド

---

## UIS フォーマット

UIS アニメーション構文については [`docs/UISアニメーションマニュアル.md`](docs/UISアニメーションマニュアル.md) を参照してください。

Malody `.mc` 譜面フォーマットは [`docs/mc-format-spec.md`](docs/mc-format-spec.md) を参照してください。

---

## ライセンス / License

MIT
