import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { slugify, makeId, safeEntryPath, readZipEntries, extractZip, injectShim, LIMITS } from "./build.mjs";

// テスト用の最小ZIPライター（任意の名前・属性を書ける）
function makeZip(files, { symlink = false } = {}) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const data = Buffer.from(f.data ?? "");
    const comp = zlib.deflateRawSync(data);
    const crc = zlib.crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE((3 << 8) | 20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(((f.symlink ? 0o120777 : 0o100644) << 16) >>> 0, 38); ch.writeUInt32LE(offset, 42);
    locals.push(lh, name, comp); centrals.push(ch, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

test("slugify / makeId", () => {
  assert.equal(slugify("My Game_01"), "my-game-01");
  assert.equal(slugify("ＡＢＣ"), "abc");
  assert.equal(slugify("ゲーム"), "");
  const used = new Set();
  const a = makeId("ゲーム", used);
  assert.match(a, /^game-[0-9a-f]{6}$/);
  assert.equal(makeId("Foo", used), "foo");
  assert.equal(makeId("foo", used), "foo-2");
});

test("safeEntryPath rejects traversal", () => {
  for (const bad of ["../a", "a/../../b", "/etc/passwd", "C:\\x", "a\\..\\b", "a:b", "a\0b"]) {
    assert.throws(() => safeEntryPath(bad), undefined, bad);
  }
  assert.equal(safeEntryPath("./a//b.txt"), "a/b.txt");
});

test("zip: normal extract and top-folder strip", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "zt-"));
  extractZip(makeZip([{ name: "g/index.html", data: "<html></html>" }, { name: "g/a/b.js", data: "1" }]), tmp);
  assert.ok(fs.existsSync(path.join(tmp, "index.html")));
  assert.ok(fs.existsSync(path.join(tmp, "a", "b.js")));
});

test("zip: zip-slip / symlink / bomb are rejected", () => {
  assert.throws(() => readZipEntries(makeZip([{ name: "../evil.txt", data: "x" }])));
  assert.throws(() => readZipEntries(makeZip([{ name: "a/../../evil.txt", data: "x" }])));
  assert.throws(() => readZipEntries(makeZip([{ name: "/abs.txt", data: "x" }])));
  assert.throws(() => readZipEntries(makeZip([{ name: "link", data: "/etc/passwd", symlink: true }])), /シンボリック/);
  const big = makeZip([{ name: "index.html", data: Buffer.alloc(1024) }]);
  big.writeUInt32LE(LIMITS.fileBytes + 1, big.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 24);
  assert.throws(() => readZipEntries(big), /大きすぎる/);
});

test("zip: lying uncompressed size is rejected", () => {
  const z = makeZip([{ name: "index.html", data: Buffer.alloc(5000, 97) }]);
  z.writeUInt32LE(10, z.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 24);
  const [e] = readZipEntries(z);
  assert.throws(() => e.read());
});

test("injectShim keeps doctype first and bytes intact", () => {
  const src = Buffer.from("<!DOCTYPE html>\n<html><head><meta charset=shift_jis></head><body>\x83\x41</body></html>", "latin1");
  const out = injectShim(src, "abc", "var id=__GAME_ID__;").toString("latin1");
  assert.ok(out.startsWith("<!DOCTYPE html>"));
  assert.ok(out.includes('<head><script>var id="abc";</script><meta'));
  assert.ok(out.includes("\x83\x41"));
  assert.equal(injectShim(Buffer.from("hello"), "a", "x").toString(), "<script>x</script>hello");
});
