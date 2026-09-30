# セキュリティ方針

| 懸念 | 対処 | 実装 |
|---|---|---|
| ゲーム間の localStorage 共有 | ビルド時に全HTMLへshimを注入し、`localStorage` / `sessionStorage` のキーに `g:<ID>:` を付与。ランチャー自身は `launcher:` 接頭辞 | `tools/storage-shim.js`, `injectShim` |
| ZIPのパストラバーサル（Zip Slip） | `..`・絶対パス・ドライブ文字・`:`・NULを含むエントリを拒否。書き込み先が展開先の外なら拒否 | `safeEntryPath`, `resolveInside` |
| ZIP爆弾 | ファイル数5000 / 1ファイル256MB / 合計512MB を上限に。宣言サイズを超える展開は打ち切り、サイズ・CRC不一致は拒否 | `LIMITS`, `readZipEntries` |
| シンボリックリンク | ZIP内のリンクはビルド失敗。フォルダ内のリンクもビルド失敗 | `readZipEntries`, `copyDir` |
| 暗号化 / ZIP64 | 未対応としてビルド失敗 | `readZipEntries` |
| ID経由のパス操作 | IDは `a-z0-9-` のみに正規化する | `slugify`, `makeId` |
| メタ情報経由のXSS | タイトル・説明は `textContent` のみで描画（`innerHTML` 不使用） | `launcher/app.js` |
| サーバーへの外部アクセス | `127.0.0.1` のみバインド。Hostヘッダ検証（DNS rebinding対策）。GET/HEADのみ。`http.Dir` でdist外を配信しない。ドットファイル・一覧表示を拒否 | `offline/server.go` |

## 既知の限界

- shimが分離するのは `localStorage` / `sessionStorage` のみ。IndexedDB・Cookie・Cache Storage は同一オリジンで共有される（キー名が衝突するゲームがあると影響しうる）。
- 悪意あるゲームは同一オリジンのため、他のゲームのデータやランチャーのキーに到達できる。`games/` には信頼できるゲームだけを置く前提。
- shimは `<script>` を `<head>` 直後に挿入する。`window.localStorage` を先に退避してから上書きするゲームには効かない。
