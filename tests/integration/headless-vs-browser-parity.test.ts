// W-1C-7 — headless-vs-browser parity test.
//
// Architectural invariant: the editor (browser) and the headless CLI
// share ONE source of geometry truth — the kernel producers in
// `@pryzm/geometry-kernel`.  Both call `produce<Family>(...)` with
// identical typed-array inputs and receive identical typed-array
// outputs.  This test pins that invariant by:
//
//   1. Loading the disk-based parity snapshots written by the
//      kernel-side `tests/parity/<family>/cw-snapshot.test.ts` runs
//      (those snapshots were captured from the same Node producers
//      this test invokes — they are the canonical "browser-equivalent"
//      output, since the browser runs the SAME kernel JS bundle).
//
//   2. Re-invoking the kernel producers through the headless surface
//      (`@pryzm/headless`-style direct call, no DOM, no THREE) using
//      the on-disk `configs/<id>.json` inputs.
//
//   3. Asserting byte-equality on the typed-array outputs.
//
// We sample ≥ 3 fixtures per family across all 12 families, exercising
// the same code path the editor uses at runtime.  A future Playwright
// addition (W-1B-3) will additionally render under Chromium and
// pixel-diff; this test pins the producer-output invariant that
// renderer pixel-diff depends on.
//
// Fixture-loading strategy:
//   - The `__configs__/<family>-index.ts` modules export
//     `XX_FIXTURES` arrays of typed { id, <element>, placement, …}
//     objects.  We import them directly (THREE-free) and pick the
//     first 3 fixtures per family as the parity sample.
//   - For each sampled fixture we hash the producer output via
//     `compose<Family>GeometryHash` (where exposed) or the descriptor
//     `hash` field, then assert it matches the on-disk snapshot's
//     `hash` field byte-for-byte.

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  produceWall, produceSlab, produceDoor, produceWindow, produceRoof,
  produceCurtainWall, produceGrid, produceColumn, produceBeam,
  produceStair, produceHandrail, produceCeiling,
  assertValidDescriptor, NO_JOINS,
} from '@pryzm/geometry-kernel';
import { FIXTURES as WALL_FIXTURES } from '../../packages/geometry-kernel/__tests__/__configs__/index.js';
import { DOOR_FIXTURES } from '../../packages/geometry-kernel/__tests__/__configs__/door-index.js';
import { WINDOW_FIXTURES } from '../../packages/geometry-kernel/__tests__/__configs__/window-index.js';
import { SLAB_FIXTURES } from '../../packages/geometry-kernel/__tests__/__configs__/slab-index.js';
import { ROOF_FIXTURES } from '../../packages/geometry-kernel/__tests__/__configs__/roof-index.js';
import { CW_FIXTURES } from '../../packages/geometry-kernel/__tests__/__configs__/curtainwall-index.js';
import { GRID_FIXTURES } from '../../packages/geometry-kernel/__tests__/__configs__/grid-index.js';
import { COLUMN_FIXTURES } from '../../packages/geometry-kernel/__tests__/__configs__/column-index.js';
import { BEAM_FIXTURES } from '../../packages/geometry-kernel/__tests__/__configs__/beam-index.js';
import { STAIR_FIXTURES } from '../../packages/geometry-kernel/__tests__/__configs__/stair-index.js';
import { HANDRAIL_FIXTURES } from '../../packages/geometry-kernel/__tests__/__configs__/handrail-index.js';
import { CEILING_FIXTURES } from '../../packages/geometry-kernel/__tests__/__configs__/ceiling-index.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PARITY_ROOT = resolve(__dirname, '../parity');
const SAMPLE_PER_FAMILY = 3;

interface SnapshotShape {
  position: number[];
  normal: number[];
  uv: number[];
  index: { kind: 'u16' | 'u32'; values: number[] };
  hash: string;
  materialKeys: readonly string[];
}

function readSnap(family: string, id: string): SnapshotShape | null {
  const p = resolve(PARITY_ROOT, family, 'snapshots', `${id}.snap.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf-8')) as SnapshotShape;
}

function gateHash(family: string, id: string, hash: string): void {
  const snap = readSnap(family, id);
  if (!snap) throw new Error(`Missing parity snapshot ${family}/${id}`);
  expect(hash, `${family}/${id} hash mismatch (headless vs disk)`).toBe(snap.hash);
}

function gateBuffers(family: string, id: string, desc: { position: Float32Array; normal: Float32Array; uv: Float32Array; index: Uint16Array | Uint32Array }): void {
  const snap = readSnap(family, id);
  if (!snap) throw new Error(`Missing parity snapshot ${family}/${id}`);
  expect(Array.from(desc.position)).toEqual(snap.position);
  expect(Array.from(desc.normal)).toEqual(snap.normal);
  expect(Array.from(desc.uv)).toEqual(snap.uv);
  expect(Array.from(desc.index)).toEqual(snap.index.values);
  expect(desc.index instanceof Uint16Array ? 'u16' : 'u32').toBe(snap.index.kind);
}

describe('W-1C-7 — headless-vs-browser parity (12 families × 3 fixtures)', () => {
  describe('wall', () => {
    for (const f of WALL_FIXTURES.slice(0, SAMPLE_PER_FAMILY)) {
      it(`wall ${f.id}`, () => {
        const desc = produceWall(f.wall, f.joinData ?? NO_JOINS, f.worldY ?? 0);
        assertValidDescriptor(desc);
        gateHash('wall', f.id, desc.hash);
        gateBuffers('wall', f.id, desc);
      });
    }
  });

  describe('door', () => {
    for (const f of DOOR_FIXTURES.slice(0, SAMPLE_PER_FAMILY)) {
      it(`door ${f.id}`, () => {
        const desc = produceDoor(f.door, f.placement);
        assertValidDescriptor(desc);
        gateHash('door', f.id, desc.hash);
        gateBuffers('door', f.id, desc);
      });
    }
  });

  describe('window', () => {
    for (const f of WINDOW_FIXTURES.slice(0, SAMPLE_PER_FAMILY)) {
      it(`window ${f.id}`, () => {
        const desc = produceWindow(f.window, f.placement);
        assertValidDescriptor(desc);
        gateHash('window', f.id, desc.hash);
        gateBuffers('window', f.id, desc);
      });
    }
  });

  describe('slab', () => {
    for (const f of SLAB_FIXTURES.slice(0, SAMPLE_PER_FAMILY)) {
      it(`slab ${f.id}`, () => {
        const desc = produceSlab(f.slab, f.joinData ?? NO_JOINS, f.worldY ?? 0);
        assertValidDescriptor(desc);
        gateHash('slab', f.id, desc.hash);
        gateBuffers('slab', f.id, desc);
      });
    }
  });

  describe('roof', () => {
    for (const f of ROOF_FIXTURES.slice(0, SAMPLE_PER_FAMILY)) {
      it(`roof ${f.id}`, () => {
        const desc = produceRoof(f.roof, f.joinData ?? NO_JOINS, f.worldY ?? 0);
        assertValidDescriptor(desc);
        gateHash('roof', f.id, desc.hash);
        gateBuffers('roof', f.id, desc);
      });
    }
  });

  describe('curtain-wall', () => {
    for (const f of CW_FIXTURES.slice(0, SAMPLE_PER_FAMILY)) {
      it(`curtain-wall ${f.id}`, () => {
        const desc = produceCurtainWall(f.cw, f.joinData ?? NO_JOINS, f.worldY ?? 0);
        assertValidDescriptor(desc);
        gateHash('curtain-wall', f.id, desc.hash);
        gateBuffers('curtain-wall', f.id, desc);
      });
    }
  });

  describe('grid', () => {
    for (const f of GRID_FIXTURES.slice(0, SAMPLE_PER_FAMILY)) {
      it(`grid ${f.id}`, () => {
        const desc = produceGrid(f.grid, NO_JOINS, f.worldY ?? 0);
        assertValidDescriptor(desc);
        gateHash('grid', f.id, desc.hash);
        gateBuffers('grid', f.id, desc);
      });
    }
  });

  describe('column', () => {
    for (const f of COLUMN_FIXTURES.slice(0, SAMPLE_PER_FAMILY)) {
      it(`column ${f.id}`, () => {
        const desc = produceColumn(f.column, NO_JOINS, f.worldY ?? 0);
        assertValidDescriptor(desc);
        gateHash('column', f.id, desc.hash);
        gateBuffers('column', f.id, desc);
      });
    }
  });

  describe('beam', () => {
    for (const f of BEAM_FIXTURES.slice(0, SAMPLE_PER_FAMILY)) {
      it(`beam ${f.id}`, () => {
        const desc = produceBeam(f.beam, f.joinData ?? NO_JOINS, f.worldY ?? 0);
        assertValidDescriptor(desc);
        gateHash('beam', f.id, desc.hash);
        gateBuffers('beam', f.id, desc);
      });
    }
  });

  describe('stair', () => {
    for (const f of STAIR_FIXTURES.slice(0, SAMPLE_PER_FAMILY)) {
      it(`stair ${f.id}`, () => {
        const desc = produceStair(f.stair, NO_JOINS, f.worldY ?? 0);
        assertValidDescriptor(desc);
        gateHash('stair', f.id, desc.hash);
        gateBuffers('stair', f.id, desc);
      });
    }
  });

  describe('handrail', () => {
    for (const f of HANDRAIL_FIXTURES.slice(0, SAMPLE_PER_FAMILY)) {
      it(`handrail ${f.id}`, () => {
        const desc = produceHandrail(f.handrail, NO_JOINS, f.worldY ?? 0);
        assertValidDescriptor(desc);
        gateHash('handrail', f.id, desc.hash);
        gateBuffers('handrail', f.id, desc);
      });
    }
  });

  describe('ceiling', () => {
    for (const f of CEILING_FIXTURES.slice(0, SAMPLE_PER_FAMILY)) {
      it(`ceiling ${f.id}`, () => {
        const desc = produceCeiling(f.ceiling, NO_JOINS, f.worldY ?? 0);
        assertValidDescriptor(desc);
        gateHash('ceiling', f.id, desc.hash);
        gateBuffers('ceiling', f.id, desc);
      });
    }
  });
});
