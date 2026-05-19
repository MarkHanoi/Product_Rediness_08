// Window producer parity-snapshot fixture suite (W-1C-2 disk-based upgrade).
//
// Mirrors `tests/parity/door/cw-snapshot.test.ts`.
// Refresh by deleting the snapshot file or running with the env var
// `WINDOW_SNAPSHOT_REFRESH=1`.

import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  produceWindow,
  assertValidDescriptor,
} from '../../../packages/geometry-kernel/src/index.js';
import type { BufferGeometryDescriptor } from '../../../packages/geometry-kernel/src/types/BufferGeometryDescriptor.js';
import { WINDOW_FIXTURES } from '../../../packages/geometry-kernel/__tests__/__configs__/window-index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = resolve(__dirname, 'snapshots');
const CONFIG_DIR = resolve(__dirname, 'configs');
const REFRESH = process.env.WINDOW_SNAPSHOT_REFRESH === '1';

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

describe(`window snapshot parity (${WINDOW_FIXTURES.length} fixtures)`, () => {
  for (const f of WINDOW_FIXTURES) {
    writeFileSync(
      resolve(CONFIG_DIR, `${f.id}.json`),
      JSON.stringify({ id: f.id, description: f.description, window: f.window, placement: f.placement }, null, 2) + '\n',
    );
  }

  for (const f of WINDOW_FIXTURES) {
    it(`${f.id} matches snapshot`, () => {
      const desc = produceWindow(f.window, f.placement);
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
