// §PROCEDURAL-PATTERNS — write every generator to PNG so a human can look at it.
//
// ⚠ THIS IS THE HONEST LIMIT OF THE TEST SUITE. Seamlessness, real-world scale,
// determinism, grout coverage and pattern continuity are all proven numerically in
// `__tests__/`. Whether the floor LOOKS GOOD is not, and no assertion in this
// package establishes it. This script exists so the one judgement a test cannot make
// is made by a person, on the actual pixels.
//
// ⭐ It emits each generator TILED 2 × 2 as well as single, because a seam that
// survives every numeric arm would still show up here instantly — and because the
// eye is the right instrument for "does this read as a floor".
//
// ⛔ Node-only, and deliberately OUTSIDE `src/`: `node:zlib` is I/O-adjacent and the
// library core is L0. Nothing in `src/` imports this file.
//
//   npx tsx packages/procedural-textures/scripts/emit-samples.ts [outDir] [resolution]

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateProceduralTexture, type GeneratedTextureSet } from '../src/generate.js';
import { PROCEDURAL_ID_PREFIX, PROCEDURAL_TEXTURE_SPECS } from '../src/presets.js';
import type { TextureMap } from '../src/shading/shade.js';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (CRC_TABLE[(c ^ (buf[i] as number)) & 0xff] as number) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crcInput = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([head, Buffer.from(data), tail]);
}

/** Minimal RGBA8 PNG encoder. No dependencies — `node:zlib` ships with the runtime. */
function encodePng(map: TextureMap): Buffer {
  const { width, height, data } = map;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const o = y * (width * 4 + 1);
    raw[o] = 0; // filter type 0 (None)
    for (let x = 0; x < width * 4; x++) {
      raw[o + 1 + x] = data[y * width * 4 + x] as number;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

/** Tile a map 2 × 2. A seam that survived every numeric arm shows here at once. */
function tile2x2(map: TextureMap): TextureMap {
  const width = map.width * 2;
  const height = map.height * 2;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = y % map.height;
    for (let x = 0; x < width; x++) {
      const sx = x % map.width;
      for (let c = 0; c < 4; c++) {
        data[(y * width + x) * 4 + c] = map.data[(sy * map.width + sx) * 4 + c] as number;
      }
    }
  }
  return { width, height, data };
}

const outDir = process.argv[2] ?? join(process.cwd(), 'procedural-texture-samples');
const resolution = Number(process.argv[3] ?? 768);
mkdirSync(outDir, { recursive: true });

const rows: string[] = [];
for (const spec of PROCEDURAL_TEXTURE_SPECS) {
  const set: GeneratedTextureSet = generateProceduralTexture(spec, resolution);
  const base = spec.id.replace(PROCEDURAL_ID_PREFIX, '');
  writeFileSync(join(outDir, `${base}.albedo.png`), encodePng(set.albedo));
  writeFileSync(join(outDir, `${base}.normal.png`), encodePng(set.normal));
  writeFileSync(join(outDir, `${base}.roughness.png`), encodePng(set.roughness));
  writeFileSync(join(outDir, `${base}.tiled2x2.png`), encodePng(tile2x2(set.albedo)));
  rows.push(
    [
      spec.id.padEnd(42),
      `${set.albedo.width}x${set.albedo.height}px`.padEnd(12),
      `${set.realWorldSizeM.x.toFixed(3)} x ${set.realWorldSizeM.y.toFixed(3)} m`.padEnd(20),
      `pieces ${String(set.diagnostics.pieceCount).padStart(4)}`,
      `joint ${(set.diagnostics.jointCoverage * 100).toFixed(2)}%`.padStart(14),
      `overlap ${set.diagnostics.overlapPx}`,
    ].join('  '),
  );
}

// eslint-disable-next-line no-console
console.log(rows.join('\n'));
// eslint-disable-next-line no-console
console.log(`\n${PROCEDURAL_TEXTURE_SPECS.length} generators, 4 PNGs each -> ${outDir}`);
