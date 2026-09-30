#!/usr/bin/env node
// games/ の3形式（単一HTML・フォルダ・ZIP）を dist/games/<ID>/index.html にそろえ、dist/games.json を生成する。
// 依存パッケージなし（Node 20+）。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const LIMITS = {
  files: 5000,
  totalBytes: 512 * 1024 * 1024,
  fileBytes: 256 * 1024 * 1024,
};

const IGNORED = new Set([".ds_store", "thumbs.db", "__macosx", ".git"]);
const isIgnored = (name) => IGNORED.has(name.toLowerCase()) || name.startsWith("._");

// ---------- ID ----------

export function slugify(name) {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

export function makeId(name, used) {
  let id = slugify(name);
  if (!id) id = "game-" + crypto.createHash("sha1").update(name).digest("hex").slice(0, 6);
  let candidate = id;
  for (let n = 2; used.has(candidate); n++) candidate = `${id}-${n}`;
  used.add(candidate);
  return candidate;
}

// ---------- 安全なパス ----------

export function safeEntryPath(raw) {
  if (raw.includes("\0")) throw new Error(`不正なパス(NUL): ${JSON.stringify(raw)}`);
  const p = raw.replace(/\\/g, "/");
  if (p.startsWith("/") || /^[a-zA-Z]:/.test(p)) throw new Error(`絶対パスは不可: ${raw}`);
  const parts = p.split("/").filter((s) => s !== "" && s !== ".");
  for (const s of parts) {
    if (s === "..") throw new Error(`".." を含むパスは不可: ${raw}`);
    if (s.includes(":")) throw new Error(`":" を含むパスは不可: ${raw}`);
  }
  return parts.join("/");
}

function resolveInside(base, rel) {
  const target = path.resolve(base, rel);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error(`展開先の外を指すパス: ${rel}`);
  }
  return target;
}

// ---------- ZIP ----------

function decodeName(buf, utf8Flag) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    if (utf8Flag) throw new Error("ZIPのファイル名がUTF-8として不正");
    return new TextDecoder("shift_jis").decode(buf);
  }
}

export function readZipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ZIPとして不正（終端が見つからない）");
  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new Error("ZIP64は未対応");
  }
  if (count > LIMITS.files) throw new Error(`ファイル数が上限(${LIMITS.files})超過`);
  if (cdOffset + cdSize > buf.length) throw new Error("ZIPとして不正（中央ディレクトリ範囲外）");

  const entries = [];
  let total = 0;
  let pos = cdOffset;
  for (let n = 0; n < count; n++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== 0x02014b50) throw new Error("ZIPとして不正（中央ディレクトリ）");
    const madeBy = buf.readUInt16LE(pos + 4);
    const flags = buf.readUInt16LE(pos + 8);
    const method = buf.readUInt16LE(pos + 10);
    const crc = buf.readUInt32LE(pos + 16);
    const csize = buf.readUInt32LE(pos + 20);
    const usize = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const extAttr = buf.readUInt32LE(pos + 38);
    const lho = buf.readUInt32LE(pos + 42);
    const rawName = decodeName(buf.subarray(pos + 46, pos + 46 + nameLen), !!(flags & 0x800));
    pos += 46 + nameLen + extraLen + commentLen;

    const isDir = rawName.endsWith("/") || rawName.endsWith("\\");
    const name = safeEntryPath(rawName);
    if (name === "") continue;
    if ((madeBy >> 8) === 3 && ((extAttr >>> 16) & 0xf000) === 0xa000) throw new Error(`シンボリックリンクは不可: ${rawName}`);
    if (flags & 1) throw new Error(`暗号化ZIPは未対応: ${rawName}`);
    if (!isDir) {
      if (method !== 0 && method !== 8) throw new Error(`未対応の圧縮方式(${method}): ${rawName}`);
      if (usize > LIMITS.fileBytes) throw new Error(`ファイルが大きすぎる: ${rawName}`);
      total += usize;
      if (total > LIMITS.totalBytes) throw new Error("展開後の合計サイズが上限超過");
    }
    entries.push({ name, isDir, method, crc, csize, usize, lho });
  }

  const seen = new Set();
  for (const e of entries) {
    if (seen.has(e.name)) throw new Error(`ZIP内でパスが重複: ${e.name}`);
    seen.add(e.name);
  }

  for (const e of entries) {
    e.read = () => {
      if (buf.readUInt32LE(e.lho) !== 0x04034b50) throw new Error(`ZIPとして不正（ローカルヘッダ）: ${e.name}`);
      const start = e.lho + 30 + buf.readUInt16LE(e.lho + 26) + buf.readUInt16LE(e.lho + 28);
      if (start + e.csize > buf.length) throw new Error(`ZIPとして不正（データ範囲外）: ${e.name}`);
      const raw = buf.subarray(start, start + e.csize);
      const out = e.method === 0 ? raw : zlib.inflateRawSync(raw, { maxOutputLength: e.usize + 1 });
      if (out.length !== e.usize) throw new Error(`サイズ不一致: ${e.name}`);
      if (typeof zlib.crc32 === "function" && zlib.crc32(out) !== e.crc) throw new Error(`CRC不一致: ${e.name}`);
      return out;
    };
  }
  return entries.filter((e) => !e.name.split("/").some(isIgnored));
}

export function extractZip(buf, dest) {
  let entries = readZipEntries(buf);
  const files = entries.filter((e) => !e.isDir);
  if (!files.some((e) => e.name === "index.html")) {
    // 単一の最上位フォルダに包まれている場合は1階層剥がす
    const tops = new Set(files.map((e) => e.name.split("/")[0]));
    if (tops.size === 1 && files.some((e) => e.name === `${[...tops][0]}/index.html`)) {
      const prefix = `${[...tops][0]}/`;
      entries = entries
        .filter((e) => e.name.startsWith(prefix))
        .map((e) => Object.assign(e, { name: e.name.slice(prefix.length) }));
    }
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const e of entries) {
    const target = resolveInside(dest, e.name);
    if (e.isDir) fs.mkdirSync(target, { recursive: true });
    else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, e.read());
    }
  }
}

// ---------- フォルダコピー ----------

function copyDir(src, dest, counter = { files: 0, bytes: 0 }) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (isIgnored(ent.name)) continue;
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isSymbolicLink()) throw new Error(`シンボリックリンクは不可: ${from}`);
    if (ent.isDirectory()) copyDir(from, to, counter);
    else if (ent.isFile()) {
      const size = fs.statSync(from).size;
      counter.files++;
      counter.bytes += size;
      if (size > LIMITS.fileBytes || counter.files > LIMITS.files || counter.bytes > LIMITS.totalBytes) {
        throw new Error(`サイズ/ファイル数が上限超過: ${src}`);
      }
      fs.copyFileSync(from, to);
    }
  }
}

// ---------- HTML加工（localStorage名前空間shim注入） ----------

export function injectShim(htmlBuf, id, shimSource) {
  const s = htmlBuf.toString("latin1"); // バイト列を保ったまま扱う
  const tag = `<script>${shimSource.replace("__GAME_ID__", JSON.stringify(id).replace(/</g, "\\u003c"))}</script>`;
  let idx = 0;
  const bom = s.startsWith("\xEF\xBB\xBF") ? 3 : 0;
  const doctype = /^\s*<!doctype[^>]*>/i.exec(s.slice(bom));
  const afterDoctype = doctype ? bom + doctype[0].length : bom;
  const head = /<head(?=[\s>])[^>]*>/i.exec(s);
  const html = /<html(?=[\s>])[^>]*>/i.exec(s);
  if (head) idx = head.index + head[0].length;
  else if (html) idx = html.index + html[0].length;
  else idx = afterDoctype;
  return Buffer.from(s.slice(0, idx) + tag + s.slice(idx), "latin1");
}

function injectAll(dir, id, shimSource) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) injectAll(p, id, shimSource);
    else if (/\.html?$/i.test(ent.name)) fs.writeFileSync(p, injectShim(fs.readFileSync(p), id, shimSource));
  }
}

// ---------- メタ情報 ----------

function htmlTitle(buf) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(buf.toString("utf8"));
  if (!m) return "";
  return m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}

function readMeta(dir) {
  const p = path.join(dir, "meta.json");
  if (!fs.existsSync(p)) return {};
  let j;
  try { j = JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "")); }
  catch (e) { throw new Error(`meta.json が不正: ${e.message}`); }
  const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  return { title: str(j?.title, 100), description: str(j?.description, 500) };
}

// ---------- ビルド ----------

export function build({ gamesDir, outDir, launcherDir, log = console.log }) {
  const shimSource = fs.readFileSync(path.join(ROOT, "tools", "storage-shim.js"), "utf8");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, "games"), { recursive: true });
  if (fs.existsSync(launcherDir)) fs.cpSync(launcherDir, outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, ".nojekyll"), "");

  const names = fs.existsSync(gamesDir) ? fs.readdirSync(gamesDir).filter((n) => !n.startsWith(".") && !isIgnored(n)).sort() : [];
  const used = new Set();
  const games = [];
  const errors = [];

  for (const entry of names) {
    const src = path.join(gamesDir, entry);
    const st = fs.lstatSync(src);
    let format, base;
    if (st.isSymbolicLink()) { errors.push(`${entry}: シンボリックリンクは不可`); continue; }
    if (st.isDirectory()) { format = "folder"; base = entry; }
    else if (/\.html?$/i.test(entry)) { format = "single"; base = entry.replace(/\.html?$/i, ""); }
    else if (/\.zip$/i.test(entry)) { format = "zip"; base = entry.replace(/\.zip$/i, ""); }
    else { log(`skip: ${entry}（対象外の形式）`); continue; }

    const id = makeId(base, used);
    const dest = path.join(outDir, "games", id);
    try {
      if (format === "single") {
        const buf = fs.readFileSync(src);
        if (buf.length > LIMITS.fileBytes) throw new Error("ファイルが大きすぎる");
        fs.mkdirSync(dest, { recursive: true });
        fs.writeFileSync(path.join(dest, "index.html"), buf);
      } else if (format === "folder") {
        copyDir(src, dest);
      } else {
        extractZip(fs.readFileSync(src), dest);
      }
      const indexPath = path.join(dest, "index.html");
      if (!fs.existsSync(indexPath)) throw new Error("index.html がない");

      const meta = format === "single" ? {} : readMeta(dest);
      const title = meta.title || htmlTitle(fs.readFileSync(indexPath)) || base;
      const hasThumb = format !== "single" && fs.existsSync(path.join(dest, "thumbnail.png"));
      injectAll(dest, id, shimSource);

      games.push({
        id,
        title,
        description: meta.description || "",
        format,
        path: `games/${id}/index.html`,
        thumbnail: hasThumb ? `games/${id}/thumbnail.png` : null,
      });
      log(`ok:   ${entry} -> ${id} (${format})${id !== base ? "  ※IDを変換" : ""}`);
    } catch (e) {
      fs.rmSync(dest, { recursive: true, force: true });
      errors.push(`${entry}: ${e.message}`);
    }
  }

  games.sort((a, b) => a.title.localeCompare(b.title, "ja") || a.id.localeCompare(b.id));
  fs.writeFileSync(path.join(outDir, "games.json"), JSON.stringify({ version: 1, games }, null, 2) + "\n");
  return { games, errors };
}

function main() {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? path.resolve(args[i + 1]) : d; };
  const { games, errors } = build({
    gamesDir: opt("--games", path.join(ROOT, "games")),
    outDir: opt("--out", path.join(ROOT, "dist")),
    launcherDir: opt("--launcher", path.join(ROOT, "launcher")),
  });
  console.log(`\n${games.length} 件のゲームを dist/games.json に出力`);
  if (errors.length) {
    console.error("\nエラー:\n" + errors.map((e) => "  - " + e).join("\n"));
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
