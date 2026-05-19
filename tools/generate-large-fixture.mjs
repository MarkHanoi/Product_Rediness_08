#!/usr/bin/env node
// PRYZM 2 — large-fixture generator (S19 D2 deliverable).
//
// Spec source: PHASE-1D §S19 D2 (line 390):
//   "Build tests/fixtures/large-project.pryzm-stub.json skeleton —
//    5,000 walls × 20 levels.  Realistic distribution: levels 1–20 get
//    200–300 walls each with random lengths from PRYZM 1 real project
//    distributions.  No geometry yet — data model only."
//
// Run with `node tools/generate-large-fixture.mjs` to (re)generate
// `tests/fixtures/large-project.pryzm-stub.json`.  Deterministic — uses
// a seeded LCG so every regeneration yields byte-identical output.
//
// The fixture is shaped like the existing medium fixture (see
// `tests/fixtures/medium-project.pryzm-stub.json`); the only structural
// difference is the size (5,000 walls vs 2,500) and that walls are
// distributed across 20 levels rather than 5.

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'tests', 'fixtures', 'large-project.pryzm-stub.json');

// Deterministic LCG (numerical recipes). Seed chosen so the output is
// stable across regenerations without depending on Math.random.
let _rngState = 0x1d191d19 >>> 0;
function rand() {
  _rngState = (Math.imul(1664525, _rngState) + 1013904223) >>> 0;
  return _rngState / 0xffffffff;
}
function randIntInRange(min, max) {
  return Math.floor(min + rand() * (max - min + 1));
}

// PRYZM 1 wall-length distribution (approximate, from production
// telemetry).  Values are metres.
const WALL_LENGTH_BUCKETS = [
  [0.5, 1.5, 0.05],   // tiny — closet walls
  [2, 4, 0.30],       // typical interior
  [4, 6, 0.35],       // typical perimeter
  [6, 9, 0.20],       // long perimeter
  [9, 14, 0.10],      // facade
];

function pickWallLength() {
  const r = rand();
  let cum = 0;
  for (const [min, max, p] of WALL_LENGTH_BUCKETS) {
    cum += p;
    if (r <= cum) return min + rand() * (max - min);
  }
  return 5; // fallback
}

// ULID-shaped wall ID (`wall_<26 base32 chars>`).  We only need
// uniqueness within the fixture; a counter encoded in Crockford base32
// satisfies that and is deterministic.
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

const TOTAL_WALLS = 5000;
const LEVELS = 20;
// 5000 / 20 = 250 walls/level base.  Vary by ±50 so the distribution
// is realistic per PRYZM 1 telemetry.
const wallsPerLevel = [];
let assigned = 0;
for (let i = 0; i < LEVELS - 1; i++) {
  const c = randIntInRange(200, 300);
  wallsPerLevel.push(c);
  assigned += c;
}
// Last level absorbs the remainder so we hit exactly TOTAL_WALLS.
wallsPerLevel.push(TOTAL_WALLS - assigned);

const walls = [];
const COLORS = ['#d4c5b0', '#c9bda3', '#b8a78a', '#a89478', '#9c8466'];
let id = 0;
for (let lvl = 0; lvl < LEVELS; lvl++) {
  // Lay walls on a coarse grid so producers see realistic spatial
  // distribution (no two walls colocated).
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
    worldY: lvl * 3.2, // 3.2 m floor-to-floor
    elevation: 0 + lvl * 3.2,
  });
}

const out = {
  _comment:
    'PRYZM 2 — S19 large-project fixture (D2 deliverable). 5,000 walls × 20 levels distributed by PRYZM 1 telemetry-derived length buckets. Used by `apps/bench/src/benches/load-large.bench.ts` to gate cold-load performance once S23 tier-streaming lands. Generated deterministically by `tools/generate-large-fixture.mjs`. NOTE: each wall id uses the ULID-shaped wall_<base32-26> form mandated by the protocol Id brand — but the seeds are fixed so regeneration is byte-stable.',
  version: 1,
  totalWalls: walls.length,
  levels,
  walls,
};

writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
const size = (JSON.stringify(out).length / 1024).toFixed(1);
console.log(`✓ wrote ${OUT} (${walls.length} walls, ${LEVELS} levels, ${size} KiB)`);
console.log(`  walls per level: min=${Math.min(...wallsPerLevel)}, max=${Math.max(...wallsPerLevel)}, mean=${(walls.length / LEVELS).toFixed(1)}`);
