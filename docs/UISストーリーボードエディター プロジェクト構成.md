Malody UISストーリーボードエディター

1. ファイル・ディレクトリ構成（全ファイルリスト）
/d/Claude/Projects/Malody/Storyboard Editor/
├── public/
│   ├── css/
│   │   └── app.css                    # メインスタイルシート
│   ├── js/
│   │   ├── app.js                     # エントリーポイント（モジュール統合）
│   │   ├── anim-math.js               # アニメーション補間計算エンジン
│   │   ├── animations.js              # アニメーション追加・編集・削除
│   │   ├── api.js                     # ファイルダウンロードAPI
│   │   ├── audio.js                   # 音声再生・波形描画・シーク管理
│   │   ├── bus.js                     # イベントバス（Pub/Sub）
│   │   ├── canvas.js                  # キャンバスプレビュー描画 + ズーム
│   │   ├── chart.js                   # Malody .mc 譜面ファイル読み込み
│   │   ├── codegen.js                 # UIS コード生成
│   │   ├── drag.js                    # ドラッグ・リサイズインタラクション
│   │   ├── elements.js                # 要素追加・削除・表示切替
│   │   ├── history.js                 # Undo/Redo エンジン（スナップショット方式）
│   │   ├── i18n.js                    # 多言語対応（ja/en/zh）
│   │   ├── layers-panel.js            # レイヤーパネルレンダリング
│   │   ├── playstate.js               # 再生時刻・選択状態管理
│   │   ├── props.js                   # プロパティパネルレンダリング
│   │   ├── res-picker.js              # リソースピッカーモーダル
│   │   ├── resources.js               # リソース管理（画像・音声）
│   │   ├── state.js                   # プロジェクト全データの単一ソース
│   │   ├── storage.js                 # IndexedDB永続化
│   │   ├── theme.js                   # ダークライトテーマ管理
│   │   ├── timeline.js                # タイムライン描画・インタラクション
│   │   ├── ui.js                      # UI補助機能（モーダル・メニュー）
│   │   └── uis-parser.js              # UISファイルパース
│   └── index.html                     # メインHTML
├── server.js                          # Express サーバー
├── package.json                       # npm設定
├── UISマニュアル.md                   # UIS仕様書
├── UISアニメーションマニュアル.md    # アニメーション仕様書
├── ストーリーボードエディター.md     # 開発要件・概要
└── mc-format-spec.md                  # 未確認


2. 各主要ファイルの役割

| ファイル | 役割 |
|---|---|
| app.js | モジュール統合、イベント配線、初期化、キーボードショートカット登録 |
| state.js | プロジェクトデータの単一ソース（要素、設定、リソース、ID管理） |
| playstate.js | 再生時刻（currentTime）と選択中要素ID の管理 |
| history.js | Undo/Redo エンジン。変更前スナップショットをスタック管理（最大100件）。同一プロパティの連続変更は800ms以内でまとめる |
| bus.js | イベント発行・購読（project-changed, selection-changed, time-changed, resources-changed, theme-changed, lang-changed） |
| canvas.js | プレビュー画面の描画とズーム管理。各フレームでAnimMath.computePropsを呼び出し |
| anim-math.js | 時刻→プロパティ変換エンジン。補間・easing・repeat・式評価を実装 |
| audio.js | 音声再生、波形描画、シーク、tick()で requestAnimationFrame ループ |
| timeline.js | タイムライン描画、ドラッグ操作（アニメーション時間編集）、playhead更新 |
| animations.js | アニメーションキーフレームの追加・編集・削除UI。変更前に History.push() |
| codegen.js | エディター状態 → UIS文字列 の生成 |
| uis-parser.js | UIS文字列 → エディターデータ の逆変換 |
| elements.js | 要素の追加・削除・表示切替。変更前に History.push() |
| props.js | プロパティパネルのレンダリングと書き込み。変更前に History.push(id:key) |
| drag.js | キャンバス上のドラッグ移動・リサイズ。ドラッグ開始時に History.push() |
| layers-panel.js | 左パネルのレイヤー一覧（順序・可視切替・選択） |
| resources.js | 画像・音声リソースの管理（IndexedDB に data URL で保存） |
| res-picker.js | リソース選択モーダル |
| theme.js | ダーク/ライトテーマ切替、theme-changed イベント発行 |
| ui.js | モーダル開閉、確認ダイアログ、アラート、タブ切替、コンテキストメニュー |
| i18n.js | 多言語対応（ja/en/zh）。I18n.t(key) で翻訳文字列取得 |
| storage.js | IndexedDB へのプロジェクト保存・読み込み・削除 |
| chart.js | Malody .mc 譜面ファイル（JSON）読み込み。ノーツタイミングをキャンバスに表示 |
| api.js | ファイルダウンロードヘルパー（downloadBlob / downloadJson） |