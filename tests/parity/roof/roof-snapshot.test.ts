// Roof self-snapshot — S10-T7 (track B parity gate).
//
// First run captures `tests/parity/roof/snapshots/<id>.snap.json`;
// subsequent runs gate byte-equality on every typed array
// (position / normal / uv / index / bounds / groups / materialKeys /
// hash).  Refresh by deleting the snapshot file or running with
// `ROOF_SNAPSHOT_REFRESH=1`.
//
// Mirrors `tests/parity/wall/wall-snapshot.test.ts` (S08-T7).
// PRYZM 1 cross-engine parity (the `*.ref.json` files) is captured by
// a follow-up script (out of scope for the S10-T7 "begin" port —
// PRYZM 1 had 9 shapes vs PRYZM 2's 5, so reference diff requires a
// schema-mapping table).

import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { produceRoof } from '../../../packages/geometry-kernel/src/producers/roof.js';
import { assertValidDescriptor } from '../../../packages/geometry-kernel/src/types/assertValidDescriptor.js';
import type { BufferGeometryDescriptor } from '../../../packages/geometry-kernel/src/types/BufferGeometryDescriptor.js';
import { ROOF_FIXTURES } from '../../../packages/geometry-kernel/__tests__/__configs__/roof-index.js';
import type { JoinData } from '../../../packages/geometry-kernel/src/types/JoinData.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = resolve(__dirname, 'snapshots');
const CONFIG_DIR = resolve(__dirname, 'configs');
const REFRESH = process.env.ROOF_SNAPSHOT_REFRESH === '1';
const NO_JOIN: JoinData = { start: null, end: null };

mkdirSync(SNAP_DIR, { recursive: true });
mkdirSync(CONFIG_DIR, { recursive: true });

interface Snapshot {
  position: number[];
  normal: number[];
  uv: number[];
  index: { kind: 'u16' | 'u32'; values: number[] };
  bounds: BufferGeometryDescriptor['bounds'];
  groups: BufferGeometryDescriptor['groups'];
  materialKeys: readonly string[];
  hash: string;
}

function toSnapshot(d: BufferGeometryDescriptor): Snapshot {
  return {
    position: Array.from(d.position),
    normal: Array.from(d.normal),
    uv: Array.from(d.uv),
    index: {
      kind: d.index instanceof Uint16Array ? 'u16' : 'u32',
      values: Array.from(d.index),
    },
    bounds: d.bounds,
    groups: d.groups,
    materialKeys: d.materialKeys.map((k) => String(k)),
    hash: d.hash,
  };
}

describe('roof snapshot parity (20 fixtures)', () => {
  // Always (re)write the config JSON so they stay in sync with the
  // TS catalog — these are downstream consumed by any future PRYZM 1
  // capture script.
  for (const f of ROOF_FIXTURES) {
    writeFileSync(
      resolve(CONFIG_DIR, `${f.id}.json`),
      JSON.stringify(
        { id: f.id, description: f.description, roof: f.roof, worldY: f.worldY },
        null, 2,
      ) + '\n',
    );
  }

  for (const f of ROOF_FIXTURES) {
    it(`${f.id} matches snapshot`, () => {
      const desc = produceRoof(f.roof, NO_JOIN, f.worldY);
      assertValidDescriptor(desc);
      const snap = toSnapshot(desc);
      const path = resolve(SNAP_DIR, `${f.id}.snap.json`);

      if (REFRESH || !existsSync(path)) {
        writeFileSync(path, JSON.stringify(snap, null, 2) + '\n');
        // First-write path still asserts something so the test
        // is a green checkmark.
        expect(snap.position.length).toBeGreaterThan(0);
        return;
      }

      const expected = JSON.parse(readFileSync(path, 'utf8')) as Snapshot;
      expect(snap.hash).toBe(expected.hash);
      expect(snap.materialKeys).toEqual(expected.materialKeys);
      expect(snap.groups).toEqual(expected.groups);
      expect(snap.bounds).toEqual(expected.bounds);
      expect(snap.index.kind).toBe(expected.index.kind);
      expect(snap.index.values).toEqual(expected.index.values);
      expect(snap.position).toEqual(expected.position);
      expect(snap.normal).toEqual(expected.normal);
      expect(snap.uv).toEqual(expected.uv);
    });
  }
});
