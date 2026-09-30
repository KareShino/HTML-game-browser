# 開発者向けドキュメント

## 構成

| パス | 内容 |
|---|---|
| `games/` | ゲームの原本（単一HTML / フォルダ / ZIP） |
| `launcher/` | ランチャーUI（素のHTML/CSS/JS。Web版・オフライン版共通、外部依存なし） |
| `tools/build.mjs` | ビルド。Node 20+ 標準機能のみ（`npm install` 不要） |
| `tools/storage-shim.js` | 各ゲームに注入する localStorage 名前空間shim |
| `tools/build.test.mjs` | ビルドのテスト（ID変換・ZIP安全性・shim注入） |
| `offline/` | オフライン版サーバー（Go、外部依存なし） |
| `offline/package/` | ZIPに同梱する起動・停止スクリプト |
| `.github/workflows/pages.yml` | main push で Pages にデプロイ |
| `.github/workflows/release.yml` | タグ `v*` push でオフライン版ZIPを Releases に作成 |
| `dist/` | ビルド成果物（コミットしない） |

## ビルド

```sh
node tools/build.mjs          # dist/ を生成（既存の dist/ は削除される）
node --test tools/build.test.mjs
```

- どれか1つのゲームでエラーが出るとビルド全体が失敗する（警告のみで欠落する事故を防ぐため）。
- オプション: `--games <dir>` `--out <dir>` `--launcher <dir>`

### ID規則

- ファイル名（拡張子なし）またはフォルダ名から生成する。
- NFKC正規化 → 小文字化 → `a-z0-9` 以外の連続を `-` に置換 → 先頭末尾の `-` を除去 → 48文字まで。
- 結果が空（日本語のみ等）の場合は `game-<名前のsha1先頭6桁>`。
- 重複した場合は `-2`, `-3` を付ける。
- 表示名は `meta.json` の `title` → `index.html` の `<title>` → 元の名前 の順。
- ビルドログに、IDが元の名前と変わったものに `※IDを変換` と出る。

### games.json

```json
{
  "version": 1,
  "games": [
    {
      "id": "sample-zip",
      "title": "表示名",
      "description": "説明（空文字可）",
      "format": "single | folder | zip",
      "path": "games/sample-zip/index.html",
      "thumbnail": "games/sample-zip/thumbnail.png"
    }
  ]
}
```

- `path` / `thumbnail` は `dist/` からの相対パス（Pagesのサブパスでも動く）。`thumbnail` がなければ `null`。
- ZIPは `index.html` が直下にあるか、単一の最上位フォルダ直下にあれば取り込める。

## ランチャー

- 画面切り替えは URL ハッシュ（`#/` と `#/play/<id>`）。
- テーマは `localStorage` の `launcher:theme`。`<html data-theme>` で切り替え、ゲーム側（iframe内）には影響しない。
- 全画面はプレイ画面全体（`#stage`）に対して行う。全画面中は上部バーを隠し、画面上端12pxにマウスを寄せると表示。左上には薄い「一覧に戻る」ボタンを常時表示する。

## オフライン版

```sh
cd offline
go test ./...
go build -o html-game-launcher .
./html-game-launcher -dist ../dist          # 既定: 実行ファイルと同じ場所の dist
```

| フラグ | 既定 | 内容 |
|---|---|---|
| `-dist` | 実行ファイル隣の `dist` | 配信するフォルダ |
| `-port` | 18080 | 優先ポート。使用中なら +1 ずつ20個、それも駄目ならOS任せ |
| `-no-browser` | false | ブラウザを自動で開かない |

- `127.0.0.1` のみで待ち受ける。Hostヘッダが `127.0.0.1` / `localhost` 以外なら403。
- GET/HEAD以外は405。`.` で始まるパスと `index.html` のないディレクトリは404。
- ログは実行ファイルの隣の `launcher.log`。
- Windows版は `-H=windowsgui` でビルドし、コンソールウィンドウを出さない。停止は `stop.bat`（`taskkill`）。
- Mac版は `start.command` が `osascript` 経由でTerminalの外で起動し、Terminalウィンドウを閉じる。停止は `stop.command`（`pkill`）。ユニバーサルバイナリ（arm64+amd64）をアドホック署名する。

## リリース

```sh
git tag v1.0.0
git push origin v1.0.0
```

`release.yml` が dist → Windows / macOS のZIP → Releases の順に処理する。Actions画面の「Run workflow」からタグ名を指定して手動実行もできる。
