# HTMLゲームランチャー

## Web版の開き方

1. ブラウザで [https://kareshino.github.io/html-game-browser/](https://kareshino.github.io/HTML-game-browser/) を開く

## ゲームの追加方法

1. `games/` に次のいずれかを置く
   - 単一HTML（例: `my-game.html`）
   - フォルダ（中に `index.html` 必須。任意で `thumbnail.png`、`meta.json`）
   - ZIP（中身はフォルダと同じ）
2. `meta.json`（任意）
   ```json
   { "title": "ゲーム名", "description": "説明" }
   ```
3. `main` にpushする（Web版に自動で反映）
4. オフライン版に反映するには、新しいタグ（例: `v1.0.1`）をpushして Releases から再ダウンロードする

## オフライン版の入手と起動

### 入手

1. [Releases](https://github.com/kareshino/html-game-browser/releases) を開く
2. OSに合うZIPをダウンロードして展開する
   - Windows: `html-game-launcher-windows.zip`
   - Mac: `html-game-launcher-macos.zip`

### Windows

1. `html-game-launcher.exe` をダブルクリック
2. 「WindowsによってPCが保護されました」が出たら「詳細情報」→「実行」
3. ブラウザが自動で開く
4. 終了するときは `stop.bat` をダブルクリック

### Mac

1. `start.command` を右クリック →「開く」
2. 「開発元を検証できません」が出たら「開く」
   - 出るのが「移動」だけの場合は「システム設定」→「プライバシーとセキュリティ」→「このまま開く」
3. ブラウザが自動で開く
4. 起動しない場合は、ターミナルに `xattr -dr com.apple.quarantine ` と入力し、展開したフォルダをドラッグして Enter を押してから、手順1をやり直す
5. 終了するときは `stop.command` を右クリック →「開く」
