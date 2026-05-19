#!/usr/bin/env node
// PRYZM 2 — largest-fixture generator (S69 D2 deliverable).
//
// Spec source: PHASE-3D §S69 D2 (line 288):
//   "production-scale fixture creation (`tests/fixtures/largest.pryzm`)."
// NFT contract source: 08-VISION.md §6 row "Largest model (walls × levels)":
//   "10,000 walls / 50 levels — apps/bench/largest-model.ts."
//
// Run with `node tools/generate-largest-fixture.mjs` to (re)generate
// `tests/fixtures/largest-project.pryzm-stub.json`.  Deterministic LCG so
// every regeneration yields byte-identical output (different seed than the
// 5K-wall fixture so the output is independent and won't accidentally
// alias byte-for-byte at small sample sizes).
//
// Shape mirrors `large-project.pryzm-stub.json` exactly — same wall record
// shape, same level shape, same `_comment / version / totalWalls / levels /
// walls` envelope — so existing parse/produce code paths in
// `load-large.bench.ts` can be reused 1:1 in `largest-model.bench.ts`
// without per-fixture wiring forks.

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(
  __dirname,
  '..',
  'tests',
  'fixtures',
  'largest-project.pryzm-stub.json',
);

// Deterministic LCG (numerical recipes).  Seed differs from the 5K fixture
// so the two fixtures are independent — useful when both run in the same
// vitest process (e.g. CI matrix).
let _rngState = 0x69deadbe >>> 0;
function rand() {
  _rngState = (Math.imul(1664525, _rngState) + 1013904223) >>> 0;
  return _rngState / 0xffffffff;
}
function randIntInRange(min, max) {
  return Math.floor(min + rand() * (max - min + 1));
}

// Same PRYZM 1 wall-length distribution as the 5K fixture — keeps the per-
// wall geometry-kernel cost comparable so the per-wall slope is the only
// dimension that scales with fixture size.
const WALL_LENGTH_BUCKETS = [
  [0.5, 1.5, 0.05],
  [2, 4, 0.30],
  [4, 6, 0.35],
  [6, 9, 0.20],
  [9, 14, 0.10],
];
function pickWallLength() {
  const r = rand();
  let cum = 0;
  for (const [min, max, p] of WALL_LENGTH_BUCKETS) {
    cum += p;
    if (r <= cum) return min + rand() * (max - min);
  }
  return 5;
}

// ULID-shaped wall id — uniqueness within the fixture only.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function ulidLikeId(prefix, n) {
  let s = '';
  let x = n;
  for (let i = 0; i < 26; i++) {
    s = CROCKFORD[x & 31] + s;
    x = Math.floor(x / 32);
  }
  return `${prefix}_${s}`;
}

// 10,000 / 50 = 200 walls/level base; vary by ±50 per level so the
// distribution matches PRYZM 1 telemetry — some levels are sparse
// rooftops, others are dense plant rooms.
const TOTAL_WALLS = 10_000;
const LEVELS = 50;

const wallsPerLevel = [];
let assigned = 0;
for (let i = 0; i < LEVELS - 1; i++) {
  const c = randIntInRange(150, 250);
  wallsPerLevel.push(c);
  assigned += c;
}
wallsPerLevel.push(TOTAL_WALLS - assigned);

const walls = [];
const COLORS = ['#d4c5b0', '#c9bda3', '#b8a78a', '#a89478', '#9c8466'];
let id = 0;
for (let lvl = 0; lvl < LEVELS; lvl++) {
  const perRow = 25;
  const spacingX = 6;
  const spacingY = 6;
  for (let i = 0; i < wallsPerLevel[lvl]; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const length = pickWallLength();
    const x0 = col * spacingX;
    const y0 = row * spacingY;
    walls.push({
      id: ulidLikeId('wall', id++),
      type: 'wall',
      levelId: `lvl_${lvl}`,
      baseLine: [
        { x: x0, y: y0, z: 0 },
        { x: x0 + length, y: y0, z: 0 },
      ],
      height: 2.7 + (rand() - 0.5) * 0.4,
      thickness: rand() < 0.15 ? 0.3 : 0.2,
      baseOffset: 0,
      materialColor: COLORS[lvl % COLORS.length],
    });
  }
}

const levels = [];
for (let lvl = 0; lvl < LEVELS; lvl++) {
  levels.push({
    id: `lvl_${lvl}`,
    name: `Level ${lvl + 1}`,
    worldY: lvl * 3.2,
    elevation: 0 + lvl * 3.2,
  });
}

const out = {
  _comment:
    'PRYZM 2 — S69 D2 production-scale (largest) fixture.  10,000 walls × 50 levels distributed by PRYZM 1 telemetry-derived length buckets, varied 150–250 walls/level (mean 200).  Used by `apps/bench/src/benches/largest-model.bench.ts` to gate the §6 NFT-contract "Largest model" target (`apps/bench/largest-model.ts` row).  Generated deterministically by `tools/generate-largest-fixture.mjs` (LCG seed 0x69deadbe, distinct from the 5K-wall fixture seed).',
  version: 1,
  totalWalls: walls.length,
  levels,
  walls,
};

writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
const size = (JSON.stringify(out).length / 1024).toFixed(1);
console.log(
  `✓ wrote ${OUT} (${walls.length} walls, ${LEVELS} levels, ${size} KiB)`,
);
console.log(
  `  walls per level: min=${Math.min(...wallsPerLevel)}, max=${Math.max(...wallsPerLevel)}, mean=${(walls.length / LEVELS).toFixed(1)}`,
);
