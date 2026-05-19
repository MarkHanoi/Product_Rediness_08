// Stair self-snapshot (S14-T3).
//
// Mirrors `tests/parity/curtain-wall/cw-snapshot.test.ts` — the
// "kernel-side" parity gate.  Cross-engine PRYZM 1 capture script
// lands alongside the façade harness in S15.
//
// Refresh by deleting the snapshot file or running with the env var
// `STAIR_SNAPSHOT_REFRESH=1`.

import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { produceStair } from '../../../packages/geometry-kernel/src/producers/stair.js';
import { NO_JOINS } from '../../../packages/geometry-kernel/src/types/JoinData.js';
import { assertValidDescriptor } from '../../../packages/geometry-kernel/src/types/assertValidDescriptor.js';
import type { BufferGeometryDescriptor } from '../../../packages/geometry-kernel/src/types/BufferGeometryDescriptor.js';
import { STAIR_FIXTURES } from '../../../packages/geometry-kernel/__tests__/__configs__/stair-index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = resolve(__dirname, 'snapshots');
const CONFIG_DIR = resolve(__dirname, 'configs');
const REFRESH = process.env.STAIR_SNAPSHOT_REFRESH === '1';

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

describe(`stair snapshot parity (${STAIR_FIXTURES.length} fixtures)`, () => {
  for (const f of STAIR_FIXTURES) {
    writeFileSync(
      resolve(CONFIG_DIR, `${f.id}.json`),
      JSON.stringify({ id: f.id, description: f.description, stair: f.stair, worldY: f.worldY }, null, 2) + '\n',
    );
  }

  for (const f of STAIR_FIXTURES) {
    it(`${f.id} matches snapshot`, () => {
      const desc = produceStair(f.stair, NO_JOINS, f.worldY);
      assertValidDescriptor(desc);
      const snap = toSnapshot(desc);
      const path = resolve(SNAP_DIR, `${f.id}.snap.json`);
      if (REFRESH || !existsSync(path)) {
        writeFileSync(path, JSON.stringify(snap, null, 2) + '\n');
        expect(snap.position.length).toBeGreaterThanOrEqual(0);
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
