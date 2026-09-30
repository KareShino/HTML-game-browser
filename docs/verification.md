# 検証手順

## 開発環境で確認済みの項目（Linux）

- `node --test tools/build.test.mjs`（ID変換・Zip Slip・シンボリックリンク・サイズ偽装・shim注入）
- `node tools/build.mjs` で3形式のサンプルが `dist/games/<ID>/index.html` にそろい、`dist/games.json` が生成される
- `cd offline && go vet ./... && go test ./...`
- Goサーバーを実際に起動し、`curl` で以下を確認
  - `/`、`/games.json`、`/games/<ID>/` が200、MIMEタイプが正しい
  - 2つ目のサーバーが使用中ポートを避けて別番号で起動する
  - Hostを偽ると403、`..` を含むパスと一覧表示は404
- Windows / macOS 向けクロスコンパイル（`-H=windowsgui` を含む）が通る
- Chromium（ヘッドレス）で、一覧表示・選択・プレイ・最初から・全画面・一覧へ戻る・テーマ保存・ゲーム間のキー分離・外部リクエストなしを確認

## 実機で確認すること（この環境では検証不可）

事前にReleasesの各ZIPをダウンロードして展開する。

### Windows

1. `html-game-launcher.exe` をダブルクリックし、SmartScreen警告が出ることを確認 →「詳細情報」→「実行」
2. コンソールウィンドウが出ず、既定ブラウザに `http://127.0.0.1:18080/` が開く
3. 一覧・プレイ・全画面・一覧へ戻る・ライト/ダークが動く
4. ブラウザを閉じて再度 `http://127.0.0.1:18080/` を開いても表示できる（サーバーが残っている）
5. exeを2重に起動 → 2つ目は別ポート（18081など）で開く
6. `stop.bat` でプロセスが終了する（タスクマネージャーで `html-game-launcher.exe` が消える）
7. ウイルス対策ソフトが exe を隔離しない
8. 起動しない場合は exe と同じフォルダの `launcher.log` を確認

### Mac（Apple Silicon・Intel の両方があれば両方）

1. ZIPをSafari/Chromeでダウンロードして展開
2. `start.command` を右クリック →「開く」で警告が出て、開ける
3. Terminalウィンドウが自動で閉じ、既定ブラウザに `http://127.0.0.1:18080/` が開く
   - Terminalが「実行中のプロセスがある」と確認を出す場合、`start.command` の `osascript` 部分を見直す
   - バイナリが「開発元を検証できない」で止まる場合は、README記載の `xattr -dr com.apple.quarantine` を試し、必要ならREADMEの手順を更新
4. 一覧・プレイ・全画面・一覧へ戻る・ライト/ダークが動く（Safariの全画面挙動も確認）
5. `stop.command` でプロセスが終了する（アクティビティモニタで確認）
6. `.command` ファイルとバイナリに実行権限が残っている（残っていなければ ZIP作成手順を見直す）

### Web版

1. `main` へのpush後、Actionsの Deploy to GitHub Pages が成功する
2. `https://kareshino.github.io/html-game-browser/` で一覧が表示され、3形式のサンプルがプレイできる
3. ゲームのHTTPS環境での動作（音声・全画面・localStorage）

### 展示前の通し確認

1. 展示に使うPCのブラウザで、全ゲームを最初から最後まで操作
2. 全画面中にマウスだけで一覧へ戻れる
3. ライト/ダークの選択がPCを再起動しても残る
4. ネットワークを切断した状態で全項目が動く
