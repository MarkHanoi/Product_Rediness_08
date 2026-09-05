#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// §SYNC-SWITCH (2026-09-02) — per-region bake staging + merge/publish for the context tilesets.
//
// THE DEFECT THIS RETIRES, measured not assumed. Each layer is ONE global `<layer>.pmtiles`
// merged across every region, and the R2 publish is an `aws s3 sync` that REPLACES the live
// tileset. So a `--region`-scoped bake + publish DELETES every other region from the map
// (context-bake.yml's own region input warns this verbatim), while an UNSCOPED full bake of the
// 35-region / ~33 GB-of-pbf table CANNOT finish inside GitHub's 330-minute job ceiling — run
// 30706761446 was killed at 99.9 % with already-succeeded height joins dying with it, and the
// workflow's §BAKE-TIMEOUT-RAISED note names the fix: "per-region artifacts merged before a
// single publish". bake.mjs:57 designed the same switch in-comment. This file is that switch.
//
// THE SHAPE.
//   1. A region-scoped bake run uploads its per-layer .pmtiles + a staging-manifest.json to a
//      STAGING prefix (s3://pryzm-assets/tiles-staging/<slug>/) — NEVER the live tiles/ prefix.
//      (`stage-manifest` below writes that manifest; context-bake.yml's stage=true input drives it.)
//   2. A separate merge+publish workflow (context-merge-publish.yml) downloads ALL staged sets,
//      runs `merge` below — which REFUSES BY NAME when any expected region has no staged bake
//      (no silent city loss), refuses a region staged ambiguously in two sets, refuses colliding
//      tiles (js engine), verifies staged shas, and only then merges per layer — and publishes the
//      merged tileset plus a tileset-manifest.json BESIDE the tiles, so the next run KNOWS what
//      the live tileset contains. The current design's blindness (nothing records what is live)
//      is the root defect; the manifest is the cure, and the merge's no-loss gate reads it.
//
// ENGINES.
//   • `tile-join` (tippecanoe's sibling, in the SAME pryzm-context-bake Docker image CI already
//     builds — `make install` installs it alongside tippecanoe) is the PRODUCTION engine: it
//     properly re-merges vector features in tiles shared by two inputs (adjacent countries share
//     border tiles at low zoom) and handles multi-GB inputs streaming. Felt tippecanoe ≥ 2.17
//     reads AND writes .pmtiles directly.
//   • `js` is the dependency-free fallback engine in this file (node builtins only): it unions
//     DISJOINT tile sets byte-for-byte and REFUSES colliding tile ids by name rather than guess —
//     an MVT tile must not carry two same-named layers, so a naive concat would silently drop one
//     region's features in every border tile. It exists so the merge semantics are provable on a
//     box with no osmium/tippecanoe/docker (this one — measured absent 2026-09-02), and as an
//     emergency small-scale merge. Production merges use tile-join.
//
// PMTiles v3 read/write below is implemented from the spec (github.com/protomaps/PMTiles/spec/v3)
// with node builtins only, and its Hilbert tile addressing is pinned in
// __tests__/mergeTiles.spec.ts against constants computed by the INDEPENDENT `pmtiles` npm
// library (v4.4.1) — two implementations, one truth, per §probe-can-be-wrong-three-ways.
//
// USAGE:
//   node merge-tiles.mjs stage-manifest --dir <bakeOut> --regions <csv> [--layers all|csv]
//        [--slug <s>] [--git-sha <sha>] [--run-id <id>]
//   node merge-tiles.mjs merge --staging <dir> --out <dir> [--expect all|staged|<csv>]
//        [--layer <csv>] [--engine auto|js|tile-join] [--live-manifest <file>]
//        [--allow-region-removal <csv>] [--allow-unknown-regions] [--no-verify] [--dry-run]
//   node merge-tiles.mjs write-fixture --out <file.pmtiles> --spec <spec.json>   (tests only)
// Exit codes: 0 ok · 1 refusal (missing region / region loss / ambiguity / collision / integrity)
//             2 usage · 3 engine failure.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync, spawnSync } from 'node:child_process';
import {
  closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync,
  readdirSync, statSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'out');
const BAKE = resolve(HERE, 'bake.mjs');

// ── tiny CLI arg helpers ─────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const SUB = argv[0];
const flag = (name) => argv.includes(name);
const opt = (name, dflt = null) => {
  const i = argv.indexOf(name);
  if (i < 0) return dflt;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) { die(2, `${name} needs a value`); }
  return v;
};
function die(code, msg) { console.error(`✖ ${msg}`); process.exit(code); }
const csv = (s) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);

// ── Hilbert tile addressing (PMTiles v3) ─────────────────────────────────────
// Implemented from the spec; verified in mergeTiles.spec.ts against constants computed by the
// independent `pmtiles` npm library. All arithmetic avoids 32-bit bitwise ops where values can
// exceed 2^31 (tileIds reach ~5.7e9 at z16) — `%`/`Math.floor` are exact to 2^53.
function rotate(s, xy, rx, ry) {
  if (ry === 0) {
    if (rx === 1) { xy[0] = s - 1 - xy[0]; xy[1] = s - 1 - xy[1]; }
    const t = xy[0]; xy[0] = xy[1]; xy[1] = t;
  }
}
export function zxyToTileId(z, x, y) {
  if (z > 26) throw new Error('zoom > 26 unsupported');
  let acc = 0;
  for (let t = 0; t < z; t++) acc += 4 ** t; // cumulative tiles below this zoom = (4^z - 1) / 3
  const n = 2 ** z;
  let d = 0;
  const xy = [x, y];
  for (let s = n / 2; s >= 1; s = s / 2) {
    const rx = (Math.floor(xy[0] / s) % 2 === 1) ? 1 : 0;
    const ry = (Math.floor(xy[1] / s) % 2 === 1) ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    rotate(n, xy, rx, ry); // canonical xy2d rotates within the FULL grid n; d2xy rotates within s.
  }
  return acc + d;
}
export function tileIdToZxy(id) {
  let z = 0, acc = 0;
  for (;;) {
    const numAtZ = 4 ** z;
    if (acc + numAtZ > id) break;
    acc += numAtZ;
    z++;
    if (z > 26) throw new Error(`tileId ${id} exceeds z26`);
  }
  let t = id - acc;
  const n = 2 ** z;
  const xy = [0, 0];
  for (let s = 1; s < n; s = s * 2) {
    const rx = Math.floor(t / 2) % 2;
    const ry = ((t % 2) + rx) % 2; // low bit of (t ^ rx), 32-bit-safe
    rotate(s, xy, rx, ry);
    xy[0] += s * rx;
    xy[1] += s * ry;
    t = Math.floor(t / 4);
  }
  return [z, xy[0], xy[1]];
}

// ── varints (LEB128, unsigned, ≤ 2^53) ───────────────────────────────────────
class ByteWriter {
  constructor() { this.buf = Buffer.allocUnsafe(4096); this.len = 0; }
  ensure(n) {
    if (this.len + n > this.buf.length) {
      const next = Buffer.allocUnsafe(Math.max(this.buf.length * 2, this.len + n));
      this.buf.copy(next, 0, 0, this.len);
      this.buf = next;
    }
  }
  byte(b) { this.ensure(1); this.buf[this.len++] = b; }
  varint(v) {
    if (v < 0 || !Number.isSafeInteger(v)) throw new Error(`bad varint ${v}`);
    while (v >= 0x80) { this.byte((v % 128) + 128); v = Math.floor(v / 128); }
    this.byte(v);
  }
  bytes() { return this.buf.subarray(0, this.len); }
}
function readVarint(buf, pos) {
  let v = 0, shiftMul = 1;
  for (;;) {
    const b = buf[pos.i++];
    v += (b % 128) * shiftMul;
    if (b < 0x80) return v;
    shiftMul *= 128;
    if (shiftMul > 2 ** 56) throw new Error('varint too long');
  }
}

// ── PMTiles v3 header ────────────────────────────────────────────────────────
const HEADER_BYTES = 127;
const COMPRESSION = { unknown: 0, none: 1, gzip: 2, brotli: 3, zstd: 4 };
const COMPRESSION_NAME = ['unknown', 'none', 'gzip', 'brotli', 'zstd'];
const TILE_TYPE = { unknown: 0, mvt: 1, png: 2, jpeg: 3, webp: 4, avif: 5 };

function readHeader(fd, path) {
  const b = Buffer.alloc(HEADER_BYTES);
  const n = readSync(fd, b, 0, HEADER_BYTES, 0);
  if (n < HEADER_BYTES || b.toString('latin1', 0, 7) !== 'PMTiles') {
    throw new Error(`${path}: not a PMTiles v3 archive (bad magic)`);
  }
  if (b[7] !== 3) throw new Error(`${path}: PMTiles version ${b[7]}, expected 3`);
  const u64 = (off) => Number(b.readBigUInt64LE(off));
  return {
    rootDirOffset: u64(8), rootDirLength: u64(16),
    metadataOffset: u64(24), metadataLength: u64(32),
    leafDirsOffset: u64(40), leafDirsLength: u64(48),
    tileDataOffset: u64(56), tileDataLength: u64(64),
    numAddressedTiles: u64(72), numTileEntries: u64(80), numTileContents: u64(88),
    clustered: b[96], internalCompression: b[97], tileCompression: b[98], tileType: b[99],
    minZoom: b[100], maxZoom: b[101],
    minLonE7: b.readInt32LE(102), minLatE7: b.readInt32LE(106),
    maxLonE7: b.readInt32LE(110), maxLatE7: b.readInt32LE(114),
    centerZoom: b[118], centerLonE7: b.readInt32LE(119), centerLatE7: b.readInt32LE(123),
  };
}
function writeHeader(h) {
  const b = Buffer.alloc(HEADER_BYTES);
  b.write('PMTiles', 0, 'latin1'); b[7] = 3;
  const u64 = (off, v) => b.writeBigUInt64LE(BigInt(v), off);
  u64(8, h.rootDirOffset); u64(16, h.rootDirLength);
  u64(24, h.metadataOffset); u64(32, h.metadataLength);
  u64(40, h.leafDirsOffset); u64(48, h.leafDirsLength);
  u64(56, h.tileDataOffset); u64(64, h.tileDataLength);
  u64(72, h.numAddressedTiles); u64(80, h.numTileEntries); u64(88, h.numTileContents);
  b[96] = h.clustered; b[97] = h.internalCompression; b[98] = h.tileCompression; b[99] = h.tileType;
  b[100] = h.minZoom; b[101] = h.maxZoom;
  b.writeInt32LE(h.minLonE7, 102); b.writeInt32LE(h.minLatE7, 106);
  b.writeInt32LE(h.maxLonE7, 110); b.writeInt32LE(h.maxLatE7, 114);
  b[118] = h.centerZoom; b.writeInt32LE(h.centerLonE7, 119); b.writeInt32LE(h.centerLatE7, 123);
  return b;
}
function decompressInternal(buf, internalCompression, path) {
  if (internalCompression === COMPRESSION.none) return buf;
  if (internalCompression === COMPRESSION.gzip) return gunzipSync(buf);
  throw new Error(`${path}: internal compression ${COMPRESSION_NAME[internalCompression] ?? internalCompression} unsupported`);
}

// ── PMTiles v3 directories ───────────────────────────────────────────────────
function deserializeDirectory(buf) {
  const pos = { i: 0 };
  const count = readVarint(buf, pos);
  const entries = new Array(count);
  let lastId = 0;
  for (let i = 0; i < count; i++) { lastId += readVarint(buf, pos); entries[i] = { tileId: lastId }; }
  for (let i = 0; i < count; i++) entries[i].runLength = readVarint(buf, pos);
  for (let i = 0; i < count; i++) entries[i].length = readVarint(buf, pos);
  for (let i = 0; i < count; i++) {
    const v = readVarint(buf, pos);
    entries[i].offset = (v === 0 && i > 0) ? entries[i - 1].offset + entries[i - 1].length : v - 1;
  }
  return entries;
}
function serializeDirectory(entries) {
  const w = new ByteWriter();
  w.varint(entries.length);
  let lastId = 0;
  for (const e of entries) { w.varint(e.tileId - lastId); lastId = e.tileId; }
  for (const e of entries) w.varint(e.runLength);
  for (const e of entries) w.varint(e.length);
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (i > 0 && e.offset === entries[i - 1].offset + entries[i - 1].length) w.varint(0);
    else w.varint(e.offset + 1);
  }
  return Buffer.from(w.bytes());
}

/** Enumerate EVERY tile entry (leaf dirs walked, run-lengths expanded) of a PMTiles v3 archive. */
export function readPmtilesIndex(path) {
  const fd = openSync(path, 'r');
  try {
    const h = readHeader(fd, path);
    const readAt = (off, len) => {
      const b = Buffer.alloc(len);
      readSync(fd, b, 0, len, off);
      return b;
    };
    const root = deserializeDirectory(decompressInternal(readAt(h.rootDirOffset, h.rootDirLength), h.internalCompression, path));
    const tiles = []; // { tileId, offset (abs file offset), length }
    const walk = (entries) => {
      for (const e of entries) {
        if (e.runLength === 0) { // leaf directory pointer
          const leaf = deserializeDirectory(decompressInternal(readAt(h.leafDirsOffset + e.offset, e.length), h.internalCompression, path));
          walk(leaf);
        } else {
          for (let k = 0; k < e.runLength; k++) {
            tiles.push({ tileId: e.tileId + k, offset: h.tileDataOffset + e.offset, length: e.length });
          }
        }
      }
    };
    walk(root);
    let metadata = null;
    if (h.metadataLength > 0) {
      try {
        metadata = JSON.parse(decompressInternal(readAt(h.metadataOffset, h.metadataLength), h.internalCompression, path).toString('utf8'));
      } catch { metadata = null; }
    }
    return { header: h, tiles, metadata };
  } finally { closeSync(fd); }
}

/**
 * Write a PMTiles v3 archive. `tiles`: [{ tileId, bytes }] (bytes ALREADY tile-compressed per
 * `tileCompression`). Root-only directory up to 16 KB compressed, then leaf directories — both
 * spec shapes, so readers see nothing unusual either way. Clustered layout (data in tileId order).
 */
export function writePmtiles(outPath, { tiles, metadata, tileType, tileCompression, minZoom, maxZoom, boundsE7, centerZoom }) {
  const sorted = [...tiles].sort((a, b) => a.tileId - b.tileId);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].tileId === sorted[i - 1].tileId) throw new Error(`duplicate tileId ${sorted[i].tileId} in writePmtiles input`);
  }
  const dataChunks = [];
  const entries = [];
  let off = 0;
  for (const t of sorted) {
    dataChunks.push(t.bytes);
    entries.push({ tileId: t.tileId, offset: off, length: t.bytes.length, runLength: 1 });
    off += t.bytes.length;
  }
  const data = Buffer.concat(dataChunks);
  const metaBuf = gzipSync(Buffer.from(JSON.stringify(metadata ?? {}), 'utf8'));

  // Directories: try root-only; spill to leaves if the compressed root exceeds the spec's 16 KB
  // initial-fetch guidance.
  let rootBuf = gzipSync(serializeDirectory(entries));
  let leavesBuf = Buffer.alloc(0);
  if (rootBuf.length > 16384 && entries.length > 1) {
    const PER_LEAF = 8192;
    const rootEntries = [];
    const leafChunks = [];
    let leafOff = 0;
    for (let i = 0; i < entries.length; i += PER_LEAF) {
      const chunk = entries.slice(i, i + PER_LEAF);
      const leaf = gzipSync(serializeDirectory(chunk));
      rootEntries.push({ tileId: chunk[0].tileId, offset: leafOff, length: leaf.length, runLength: 0 });
      leafChunks.push(leaf);
      leafOff += leaf.length;
    }
    rootBuf = gzipSync(serializeDirectory(rootEntries));
    leavesBuf = Buffer.concat(leafChunks);
  }

  const rootDirOffset = HEADER_BYTES;
  const metadataOffset = rootDirOffset + rootBuf.length;
  const leafDirsOffset = metadataOffset + metaBuf.length;
  const tileDataOffset = leafDirsOffset + leavesBuf.length;
  const zooms = sorted.map((t) => tileIdToZxy(t.tileId)[0]);
  const minZ = minZoom ?? (zooms.length ? Math.min(...zooms) : 0);
  const maxZ = maxZoom ?? (zooms.length ? Math.max(...zooms) : 0);
  const be7 = boundsE7 ?? { minLonE7: -1800000000, minLatE7: -850000000, maxLonE7: 1800000000, maxLatE7: 850000000 };
  const header = writeHeader({
    rootDirOffset, rootDirLength: rootBuf.length,
    metadataOffset, metadataLength: metaBuf.length,
    leafDirsOffset, leafDirsLength: leavesBuf.length,
    tileDataOffset, tileDataLength: data.length,
    numAddressedTiles: sorted.length, numTileEntries: entries.length, numTileContents: entries.length,
    clustered: 1, internalCompression: COMPRESSION.gzip,
    tileCompression: COMPRESSION[tileCompression] ?? tileCompression,
    tileType: TILE_TYPE[tileType] ?? tileType,
    minZoom: minZ, maxZoom: maxZ,
    ...be7,
    centerZoom: centerZoom ?? minZ,
    centerLonE7: Math.round((be7.minLonE7 + be7.maxLonE7) / 2),
    centerLatE7: Math.round((be7.minLatE7 + be7.maxLatE7) / 2),
  });
  writeFileSync(outPath, Buffer.concat([header, rootBuf, metaBuf, leavesBuf, data]));
}

// ── js merge engine ──────────────────────────────────────────────────────────
/**
 * Union DISJOINT pmtiles archives byte-for-byte. A tileId present in ≥2 inputs is a REFUSAL by
 * name (an MVT tile cannot carry two same-named layers, so a blind concat would silently drop one
 * region's features in every shared border tile — production merges of adjacent countries use
 * tile-join, which re-merges features properly).
 */
function mergeJs(inputs, outPath) {
  const idx = inputs.map((p) => ({ path: p, ...readPmtilesIndex(p) }));
  const t0 = idx[0].header;
  for (const i of idx) {
    if (i.header.tileType !== t0.tileType) die(1, `tile type mismatch: ${i.path} is ${i.header.tileType}, ${idx[0].path} is ${t0.tileType}`);
    if (i.header.tileCompression !== t0.tileCompression) die(1, `tile compression mismatch: ${i.path} vs ${idx[0].path}`);
  }
  const byId = new Map();
  const collisions = [];
  for (const i of idx) {
    for (const t of i.tiles) {
      const prev = byId.get(t.tileId);
      if (prev) collisions.push({ tileId: t.tileId, a: prev.path, b: i.path });
      else byId.set(t.tileId, { path: i.path, offset: t.offset, length: t.length });
    }
  }
  if (collisions.length > 0) {
    console.error(`✖ TILE COLLISION — ${collisions.length} tile id(s) exist in more than one staged input. The js engine`);
    console.error('  refuses to guess (concatenating same-named MVT layers silently drops features); merge these');
    console.error('  inputs with --engine tile-join, which re-merges the vector features properly.');
    for (const c of collisions.slice(0, 20)) {
      const [z, x, y] = tileIdToZxy(c.tileId);
      console.error(`    · tile ${z}/${x}/${y} (id ${c.tileId}): ${basename(dirname(c.a))} vs ${basename(dirname(c.b))}`);
    }
    if (collisions.length > 20) console.error(`    … and ${collisions.length - 20} more`);
    process.exit(1);
  }
  // Copy bytes. Open each source once.
  const fds = new Map(inputs.map((p) => [p, openSync(p, 'r')]));
  try {
    const tiles = [];
    for (const [tileId, loc] of [...byId.entries()].sort((a, b) => a[0] - b[0])) {
      const b = Buffer.alloc(loc.length);
      readSync(fds.get(loc.path), b, 0, loc.length, loc.offset);
      tiles.push({ tileId, bytes: b });
    }
    // Metadata: union vector_layers by id; keep the first input's scalar fields.
    const metas = idx.map((i) => i.metadata).filter(Boolean);
    const vlById = new Map();
    for (const m of metas) for (const vl of m.vector_layers ?? []) if (!vlById.has(vl.id)) vlById.set(vl.id, vl);
    const metadata = {
      ...(metas[0] ?? {}),
      vector_layers: [...vlById.values()],
      'pryzm:merged_from': inputs.map((p) => basename(dirname(p))),
      'pryzm:merged_at': new Date().toISOString(),
    };
    delete metadata.tilestats; // per-input stats are meaningless for the union; drop rather than misstate.
    const boundsE7 = {
      minLonE7: Math.min(...idx.map((i) => i.header.minLonE7)),
      minLatE7: Math.min(...idx.map((i) => i.header.minLatE7)),
      maxLonE7: Math.max(...idx.map((i) => i.header.maxLonE7)),
      maxLatE7: Math.max(...idx.map((i) => i.header.maxLatE7)),
    };
    writePmtiles(outPath, {
      tiles, metadata,
      tileType: t0.tileType, tileCompression: t0.tileCompression,
      minZoom: Math.min(...idx.map((i) => i.header.minZoom)),
      maxZoom: Math.max(...idx.map((i) => i.header.maxZoom)),
      boundsE7,
    });
  } finally { for (const fd of fds.values()) closeSync(fd); }
}

// ── tile-join engine (local binary, else the pryzm-context-bake Docker image) ─
function has(bin) {
  try {
    const r = spawnSync(process.platform === 'win32' ? 'where' : 'sh',
      process.platform === 'win32' ? [bin] : ['-c', `command -v ${bin}`], { stdio: 'ignore' });
    return r.status === 0;
  } catch { return false; }
}
function tileJoinCmd(inputs, outPath) {
  // -f overwrite · -pk no tile-size limit (bake already drop-densest'ed at source; a merged border
  // tile slightly over 500 KB must be KEPT, not silently skipped) · --no-tile-stats saves a pass.
  const args = ['-f', '-pk', '--no-tile-stats', '-o', outPath, ...inputs];
  if (has('tile-join')) return { cmd: 'tile-join', argv: args };
  if (has('docker')) {
    const rel = (p) => {
      const abs = resolve(p);
      if (!abs.startsWith(OUT)) die(2, `docker engine: ${p} must live under ${OUT} (mounted at /work)`);
      return '/work' + abs.slice(OUT.length).replace(/\\/g, '/');
    };
    return { cmd: 'docker', argv: ['run', '--rm', '-v', `${OUT}:/work`, 'pryzm-context-bake', 'tile-join', ...args.map((a) => (a.endsWith('.pmtiles') ? rel(a) : a))] };
  }
  return null;
}

// ── shared helpers ───────────────────────────────────────────────────────────
function sha256File(path) {
  const h = createHash('sha256');
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(8 * 1024 * 1024);
    let pos = 0;
    for (;;) {
      const n = readSync(fd, buf, 0, buf.length, pos);
      if (n <= 0) break;
      h.update(buf.subarray(0, n));
      pos += n;
    }
  } finally { closeSync(fd); }
  return h.digest('hex');
}
function bakeTables(regionCsv = null) {
  const args = [BAKE, '--regions-json'];
  if (regionCsv) args.push('--region', regionCsv);
  const out = execFileSync(process.execPath, args, { encoding: 'utf8' });
  return JSON.parse(out);
}

/**
 * §PENDING-REGION (2026-09-05, lane NZ-EVERYWHERE) — the expected-region set of a merge, PURE.
 *
 * `expect=all` used to be "every bake.mjs row". That made adding a row a PUBLISH-BLOCKING act: the
 * moment `newzealand` entered ALL_REGIONS, the next expect=all publish (france+switzerland, staged
 * hours later) would have REFUSED BY NAME because the new row had no staged bake — the gate doing its
 * job against a region that had never been live and so could not be lost. A row may now carry
 * `pending: true` (emitted by `bake.mjs --regions-json`): under `all` it is EXPECTED ONLY WHEN
 * STAGED. A staged pending row merges in (so the first NZ publish needs no special expect= value);
 * an unstaged one is listed by name as "pending, not expected" and never refuses. `staged` and an
 * explicit csv are unchanged — naming a pending region in the csv expects it, flag or no flag.
 *
 * ⚠ The flag is for rows that have NEVER been live. A live region flagged pending could be dropped
 * by a later publish without a refusal — which is why the no-loss gate (§4, the LIVE manifest) sits
 * downstream of this and is NOT flag-aware: a region in the live manifest is protected regardless.
 *
 * @param {Array<{name:string, pending?:boolean}>} allRegions  bake.mjs --regions-json `allRegions`
 * @param {string} expectArg  'all' | 'staged' | '<csv>'
 * @param {string[]} stagedNames  the regions found in the staging manifests
 * @returns {{ expected: string[], pendingUnstaged: string[] }}
 */
export function expectedRegions(allRegions, expectArg, stagedNames) {
  const staged = new Set(stagedNames);
  if (expectArg === 'all') {
    const expected = allRegions.filter((r) => r.pending !== true || staged.has(r.name)).map((r) => r.name);
    const pendingUnstaged = allRegions.filter((r) => r.pending === true && !staged.has(r.name)).map((r) => r.name);
    return { expected, pendingUnstaged };
  }
  if (expectArg === 'staged') return { expected: [...staged], pendingUnstaged: [] };
  return { expected: csv(expectArg), pendingUnstaged: [] };
}

// ── subcommand: stage-manifest ───────────────────────────────────────────────
function cmdStageManifest() {
  const dir = opt('--dir') ?? OUT;
  const regions = csv(opt('--regions'));
  if (regions.length === 0) die(2, 'stage-manifest: --regions <csv> is required (the regions this bake run actually baked)');
  const tables = bakeTables();
  const known = new Set(tables.allRegions.map((r) => r.name));
  const unknown = regions.filter((r) => !known.has(r));
  if (unknown.length > 0) die(2, `stage-manifest: unknown region(s) [${unknown.join(', ')}] — not in bake.mjs ALL_REGIONS. A typo here would stage a set the merge can never trust.`);
  const layersArg = opt('--layers', 'all');
  const layerIds = layersArg === 'all' ? tables.allLayers : csv(layersArg);
  const badLayers = layerIds.filter((l) => !tables.allLayers.includes(l));
  if (badLayers.length > 0) die(2, `stage-manifest: unknown layer(s) [${badLayers.join(', ')}]`);
  const layers = {};
  for (const l of layerIds) {
    const f = join(dir, `${l}.pmtiles`);
    if (!existsSync(f)) die(1, `stage-manifest: ${f} does not exist — refusing to write a manifest claiming a layer the bake did not produce.`);
    const bytes = statSync(f).size;
    console.log(`  hashing ${l}.pmtiles (${(bytes / 1e6).toFixed(1)} MB)…`);
    layers[l] = { file: `${l}.pmtiles`, bytes, sha256: sha256File(f) };
  }
  const joinByName = new Map(tables.allRegions.map((r) => [r.name, r.heightJoin]));
  const manifest = {
    schema: 'pryzm-context-staging-manifest@1',
    slug: opt('--slug', regions.join('-')),
    regions,
    heightJoinRegions: regions.filter((r) => joinByName.get(r)),
    layers,
    bakedAt: new Date().toISOString(),
    bakeRunId: opt('--run-id', process.env.GITHUB_RUN_ID ?? null),
    gitSha: opt('--git-sha', process.env.GITHUB_SHA ?? null),
  };
  const outFile = join(dir, 'staging-manifest.json');
  writeFileSync(outFile, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`✔ staging manifest → ${outFile} (${regions.length} region(s), ${layerIds.length} layer(s))`);
}

// ── subcommand: merge ────────────────────────────────────────────────────────
function cmdMerge() {
  const stagingDir = opt('--staging') ?? join(OUT, 'staging');
  const outDir = opt('--out') ?? join(OUT, 'merged');
  const DRY = flag('--dry-run');
  const VERIFY = !flag('--no-verify');
  const tables = bakeTables();
  const known = new Set(tables.allRegions.map((r) => r.name));

  // 1 · Discover staged sets: every child dir of stagingDir holding a staging-manifest.json.
  if (!existsSync(stagingDir)) die(1, `merge: staging dir ${stagingDir} does not exist — nothing staged, nothing to merge.`);
  const sets = [];
  for (const name of readdirSync(stagingDir)) {
    const d = join(stagingDir, name);
    const mf = join(d, 'staging-manifest.json');
    if (!statSync(d).isDirectory() || !existsSync(mf)) continue;
    let manifest;
    try { manifest = JSON.parse(readFileSync(mf, 'utf8')); } catch (e) { die(1, `merge: ${mf} is unreadable JSON (${e.message}) — a corrupt staged set is a refusal, not a skip.`); }
    if (manifest.schema !== 'pryzm-context-staging-manifest@1') die(1, `merge: ${mf} has schema '${manifest.schema}', expected pryzm-context-staging-manifest@1`);
    sets.push({ slug: name, dir: d, manifest });
  }
  if (sets.length === 0) die(1, `merge: no staged sets found under ${stagingDir} (each set = <slug>/staging-manifest.json + <layer>.pmtiles).`);
  console.log(`▶ staged sets: ${sets.map((s) => `${s.slug}[${s.manifest.regions.join(',')}]`).join(' · ')}`);

  // 2 · Region → set map. A region staged in TWO sets is ambiguous: each set's pmtiles is a merged
  // artifact of ITS region list, so the duplicate cannot be subtracted — merging both double-bakes it.
  const regionToSet = new Map();
  const dupes = [];
  for (const s of sets) {
    for (const r of s.manifest.regions) {
      if (regionToSet.has(r)) dupes.push({ region: r, a: regionToSet.get(r).slug, b: s.slug });
      else regionToSet.set(r, s);
    }
  }
  if (dupes.length > 0) {
    for (const d of dupes) console.error(`✖ region '${d.region}' is staged by BOTH '${d.a}' and '${d.b}' — merging both would double-bake it. Delete one staged set (aws s3 rm --recursive s3://pryzm-assets/tiles-staging/<slug>/) and re-run.`);
    process.exit(1);
  }
  const unknownStaged = [...regionToSet.keys()].filter((r) => !known.has(r));
  if (unknownStaged.length > 0 && !flag('--allow-unknown-regions')) {
    die(1, `merge: staged region(s) [${unknownStaged.join(', ')}] are not in bake.mjs ALL_REGIONS — a renamed/deleted row or a typo. Pass --allow-unknown-regions only if this is deliberate.`);
  }

  // 3 · Expected coverage — THE gate. A publish missing an expected region REFUSES BY NAME:
  // the live sync REPLACES the tileset, so an absent region is a deleted region.
  const expectArg = opt('--expect', 'all');
  const { expected, pendingUnstaged } = expectedRegions(tables.allRegions, expectArg, [...regionToSet.keys()]);
  if (pendingUnstaged.length > 0) {
    console.log(`▶ §PENDING-REGION — ${pendingUnstaged.length} bake.mjs row(s) flagged pending and NOT staged: [${pendingUnstaged.join(', ')}] — not expected by this merge (stage them with context-bake.yml region=<name> stage=true, then they merge in; drop the flag once live).`);
  }
  const missing = expected.filter((r) => !regionToSet.has(r));
  if (missing.length > 0) {
    console.error(`✖ MISSING REGION(S) — ${missing.length} expected region(s) have NO staged bake: [${missing.join(', ')}].`);
    console.error('  Refusing to merge: publishing this tileset would DELETE the missing region(s) from the live map');
    console.error('  (the R2 publish is a sync that REPLACES the tileset — §BAKE-BY-REGION). Stage a bake for each');
    console.error('  named region (context-bake.yml with region=<name>, stage=true), or pass --expect staged /');
    console.error('  --expect <csv> for a DELIBERATE subset.');
    process.exit(1);
  }

  // 4 · No-loss gate against the LIVE tileset-manifest.json (what the map currently serves).
  const liveManifestPath = opt('--live-manifest');
  let liveManifest = null;
  if (liveManifestPath && existsSync(liveManifestPath)) {
    const live = JSON.parse(readFileSync(liveManifestPath, 'utf8'));
    liveManifest = live;
    const liveRegions = Object.keys(live.regions ?? {});
    const allowRemoval = new Set(csv(opt('--allow-region-removal')));
    const lost = liveRegions.filter((r) => !regionToSet.has(r) && !allowRemoval.has(r));
    if (lost.length > 0) {
      console.error(`✖ REGION LOSS — the LIVE tileset contains [${lost.join(', ')}] but the merged set does not.`);
      console.error('  Publishing would remove them from the map. Stage them, or name each in --allow-region-removal');
      console.error('  to remove them DELIBERATELY.');
      process.exit(1);
    }
    console.log(`▶ no-loss gate: all ${liveRegions.length} live region(s) covered${allowRemoval.size ? ` (deliberate removals: ${[...allowRemoval].join(', ')})` : ''}`);
  } else if (liveManifestPath) {
    console.log(`▶ no-loss gate: live manifest ${liveManifestPath} not found — BOOTSTRAP publish (no manifest is live yet). The gate arms itself on the first publish that ships one.`);
  }

  // 5 · Which sets participate + per-layer coverage. Only sets carrying expected regions merge in.
  const activeSets = [...new Set(expected.map((r) => regionToSet.get(r)))];
  const layerArg = opt('--layer');
  const targetLayers = layerArg ? csv(layerArg) : tables.allLayers;
  const badLayers = targetLayers.filter((l) => !tables.allLayers.includes(l));
  if (badLayers.length > 0) die(2, `merge: unknown layer(s) [${badLayers.join(', ')}]`);
  const layerGaps = [];
  for (const l of targetLayers) {
    for (const s of activeSets) {
      if (!s.manifest.layers?.[l]) layerGaps.push({ layer: l, slug: s.slug, regions: s.manifest.regions });
    }
  }
  if (layerGaps.length > 0) {
    for (const g of layerGaps) console.error(`✖ staged set '${g.slug}' (regions ${g.regions.join(',')}) has NO '${g.layer}' layer — it was baked with a --layer scope. Re-stage it with all layers, or merge with --layer <the layers it has>.`);
    process.exit(1);
  }

  // 6 · Integrity: staged bytes must match the manifest the bake wrote (a truncated R2 download or
  // a half-overwritten set must not merge silently).
  if (VERIFY && !DRY) {
    for (const s of activeSets) {
      for (const l of targetLayers) {
        const rec = s.manifest.layers[l];
        const f = join(s.dir, rec.file);
        if (!existsSync(f)) die(1, `merge: ${f} is named by ${s.slug}'s manifest but does not exist on disk.`);
        const bytes = statSync(f).size;
        if (bytes !== rec.bytes) die(1, `merge: ${s.slug}/${rec.file} is ${bytes} B but the manifest says ${rec.bytes} B — truncated or stale download.`);
        const sha = sha256File(f);
        if (sha !== rec.sha256) die(1, `merge: ${s.slug}/${rec.file} sha256 ${sha.slice(0, 12)}… ≠ manifest ${rec.sha256.slice(0, 12)}… — corrupt or stale download.`);
      }
    }
    console.log(`▶ integrity: ${activeSets.length} set(s) × ${targetLayers.length} layer(s) sha256-verified against their staging manifests`);
  }

  // 7 · Engine selection.
  const engineArg = opt('--engine', 'auto');
  let engine = engineArg;
  if (engineArg === 'auto') engine = (has('tile-join') || has('docker')) ? 'tile-join' : 'js';
  if (engine === 'tile-join' && !has('tile-join') && !has('docker')) die(3, 'merge: --engine tile-join but neither tile-join nor docker is available.');
  console.log(`▶ engine: ${engine}${engineArg === 'auto' ? ' (auto)' : ''} · layers: ${targetLayers.join(', ')} · sets: ${activeSets.map((s) => s.slug).join(', ')}`);

  if (DRY) {
    for (const l of targetLayers) {
      const inputs = activeSets.map((s) => join(s.dir, s.manifest.layers[l].file));
      const cmd = engine === 'tile-join' ? tileJoinCmd(inputs, join(outDir, `${l}.pmtiles`)) : null;
      console.log(`  · ${l}: ${inputs.length} input(s) → ${join(outDir, `${l}.pmtiles`)}${cmd ? `\n      ${cmd.cmd} ${cmd.argv.join(' ')}` : ' (js engine)'}`);
    }
    console.log('▶ --dry-run: all gates passed; nothing merged.');
    return;
  }

  // 8 · Merge per layer.
  mkdirSync(outDir, { recursive: true });
  const layerResults = {};
  for (const l of targetLayers) {
    const inputs = activeSets.map((s) => join(s.dir, s.manifest.layers[l].file));
    const outPath = join(outDir, `${l}.pmtiles`);
    console.log(`\n▶ merge ${l} — ${inputs.length} input(s)`);
    if (engine === 'tile-join') {
      const cmd = tileJoinCmd(inputs, outPath);
      console.log(`  ${cmd.cmd} ${cmd.argv.join(' ')}`);
      const r = spawnSync(cmd.cmd, cmd.argv, { stdio: 'inherit' });
      if (r.status !== 0) die(3, `tile-join failed for ${l} (exit ${r.status})`);
    } else {
      mergeJs(inputs, outPath);
    }
    // Post-merge verification: real archive, and it cannot hold FEWER addressed tiles than its
    // largest input (union ⊇ every input; equality only when inputs nest, e.g. koln ⊂ germany).
    const fd = openSync(outPath, 'r');
    let h;
    try { h = readHeader(fd, outPath); } finally { closeSync(fd); }
    const inputCounts = inputs.map((p) => {
      const ifd = openSync(p, 'r');
      try { return readHeader(ifd, p).numAddressedTiles; } finally { closeSync(ifd); }
    });
    const maxIn = Math.max(...inputCounts);
    const sumIn = inputCounts.reduce((a, b) => a + b, 0);
    if (h.numAddressedTiles < maxIn) die(1, `merged ${l}.pmtiles addresses ${h.numAddressedTiles} tiles < largest input's ${maxIn} — the merge LOST tiles.`);
    if (h.numAddressedTiles < sumIn * 0.5 && inputs.length > 1) {
      console.warn(`  ⚠ merged ${l} addresses ${h.numAddressedTiles} tiles vs ${sumIn} summed across inputs — heavy overlap. Expected only for deliberately double-baked rows (koln⊂germany, paris/lyon⊂france).`);
    }
    const bytes = statSync(outPath).size;
    console.log(`  ✔ ${l}.pmtiles — ${(bytes / 1e6).toFixed(1)} MB · ${h.numAddressedTiles} addressed tiles (inputs sum ${sumIn}) · z${h.minZoom}–${h.maxZoom}`);
    layerResults[l] = { file: `${l}.pmtiles`, bytes, sha256: sha256File(outPath), numAddressedTiles: h.numAddressedTiles, sources: activeSets.map((s) => s.slug) };
  }

  // 9 · The tileset manifest — published BESIDE the tiles so the next run KNOWS what is live.
  // Iterated over the PARTICIPATING SETS' full region lists, not the expected list: a set staged
  // as {lu,ee} merged under --expect luxembourg still ships Estonia's bytes, and a manifest that
  // omitted estonia would make the next run's no-loss gate blind to it — the exact blindness this
  // manifest exists to cure. The manifest describes the BYTES, not the intent.
  const regionsOut = {};
  const shippedRegions = [...new Set(activeSets.flatMap((s) => s.manifest.regions))];
  for (const r of shippedRegions) {
    const s = regionToSet.get(r);
    regionsOut[r] = {
      stagedSet: s.slug,
      bakedAt: s.manifest.bakedAt ?? null,
      bakeRunId: s.manifest.bakeRunId ?? null,
      bakeGitSha: s.manifest.gitSha ?? null,
      heightJoin: (s.manifest.heightJoinRegions ?? []).includes(r) ? (tables.allRegions.find((x) => x.name === r)?.heightJoin ?? null) : null,
    };
  }
  // §MANIFEST-LAYER-CARRY-FORWARD (lane CONTEXT-R2, 2026-09-04) — a LAYER-SCOPED merge must not
  // erase the record of the layers it did not merge.
  //
  // THE DEFECT THIS CLOSES. `layers: layerResults` recorded ONLY the merged layers, but the R2
  // publish is `aws s3 sync` WITHOUT `--delete` (deliberately — context-merge-publish.yml:315
  // "a layer-scoped publish must not" remove its siblings). So after a `--layer roads` publish the
  // OTHER layers' .pmtiles were still live and still served, while the manifest published beside
  // them claimed the tileset contained roads and nothing else. The workflow header PRESCRIBES the
  // per-layer dispatch as the disk-budget escape — so following the documented procedure for the
  // seven layers ended with a manifest naming one of them, and the no-loss gate is REGION-scoped,
  // so nothing refused. That is precisely the blindness this manifest exists to cure, reintroduced
  // one axis over: the old design could not see what regions were live, this one could not see
  // what LAYERS were.
  //
  // WHY CARRY-FORWARD IS SOUND, stated. The manifest is written only by a run that then publishes,
  // and the publish never deletes. So a layer named by the LIVE manifest is still on R2 with those
  // bytes unless a later run overwrote it — and a later run that overwrote it re-merged it, which
  // puts it in `layerResults` and takes this branch out of play. The carried entry is therefore a
  // true statement about the live object; what it is NOT is a statement this run verified, so it
  // is marked `carriedForward` with the run that DID produce it (§CONTEXT-DATA-HONESTY: a fact and
  // the evidence for it are different fields). Never strip that mark to make the shapes uniform.
  const layersOut = { ...layerResults };
  const carried = [];
  for (const [name, rec] of Object.entries(liveManifest?.layers ?? {})) {
    if (layersOut[name]) continue;
    layersOut[name] = {
      ...rec,
      carriedForward: true,
      // Provenance of the BYTES, not of this run. Preserved verbatim through repeated
      // carry-forwards so the seventh per-layer publish still names the run that built buildings.
      producedBy: rec.producedBy ?? {
        mergeRunId: liveManifest.mergeRunId ?? null,
        mergedAt: liveManifest.mergedAt ?? null,
        mergeGitSha: liveManifest.mergeGitSha ?? null,
      },
    };
    carried.push(name);
  }
  if (carried.length > 0) {
    console.log(`▶ layer carry-forward: ${carried.length} live layer(s) not merged this run kept in the manifest [${carried.join(', ')}] — the publish has no --delete, so their bytes are still live. Each is marked carriedForward with the run that produced it.`);
    // Cross-layer region skew is real and worth SAYING: `regions` is tileset-wide, but a carried
    // layer was built from ITS sources, which may be a different set than this run merged.
    const shipped = new Set(shippedRegions);
    for (const name of carried) {
      const src = layersOut[name].sources ?? [];
      const gap = [...shipped].filter((r) => !src.includes(r));
      if (gap.length > 0) {
        console.warn(`  ⚠ layer '${name}' was built from ${src.length} source set(s) and does NOT cover [${gap.slice(0, 8).join(', ')}${gap.length > 8 ? `, +${gap.length - 8} more` : ''}] — the regions block is tileset-wide, per-layer coverage is the layer's own 'sources'.`);
      }
    }
  }

  const tilesetManifest = {
    schema: 'pryzm-context-tileset-manifest@1',
    mergedAt: new Date().toISOString(),
    mergeRunId: process.env.GITHUB_RUN_ID ?? null,
    mergeGitSha: process.env.GITHUB_SHA ?? null,
    engine,
    mergedLayers: targetLayers,
    layers: layersOut,
    regions: regionsOut,
  };
  const manifestPath = join(outDir, 'tileset-manifest.json');
  writeFileSync(manifestPath, JSON.stringify(tilesetManifest, null, 2) + '\n');
  console.log(`\n✔ merge complete — ${targetLayers.length} layer(s), ${shippedRegions.length} region(s) in the bytes (${expected.length} expected) → ${outDir}`);
  console.log(`  tileset manifest → ${manifestPath} (publish it BESIDE the tiles; the no-loss gate reads it next run)`);
}

// ── subcommand: write-fixture (tests) ────────────────────────────────────────
function cmdWriteFixture() {
  const outPath = opt('--out');
  const specPath = opt('--spec');
  if (!outPath || !specPath) die(2, 'write-fixture: --out <file.pmtiles> --spec <spec.json> required');
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const compress = (b) => (spec.tileCompression === 'gzip' ? gzipSync(b) : b);
  const tiles = spec.tiles.map((t) => ({
    tileId: zxyToTileId(t.z, t.x, t.y),
    bytes: compress(Buffer.from(t.payloadBase64 ? Buffer.from(t.payloadBase64, 'base64') : t.payloadText, t.payloadBase64 ? undefined : 'utf8')),
  }));
  writePmtiles(outPath, {
    tiles,
    metadata: spec.metadata ?? { name: 'fixture', vector_layers: [{ id: spec.layerName ?? 'buildings', fields: {} }] },
    tileType: spec.tileType ?? 'mvt',
    tileCompression: spec.tileCompression ?? 'gzip',
    boundsE7: spec.boundsE7,
  });
  console.log(`✔ fixture → ${outPath} (${tiles.length} tile(s))`);
}

// ── dispatch ─────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (SUB === 'stage-manifest') cmdStageManifest();
  else if (SUB === 'merge') cmdMerge();
  else if (SUB === 'write-fixture') cmdWriteFixture();
  else die(2, `usage: merge-tiles.mjs <stage-manifest|merge|write-fixture> …  (got '${SUB ?? ''}')`);
}
