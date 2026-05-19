// Curtain-wall self-snapshot — S13-T7.
//
// Mirrors `tests/parity/wall/wall-snapshot.test.ts`: first run captures
// `tests/parity/curtain-wall/snapshots/<id>.snap.json`, subsequent
// runs gate byte-equality on every typed array (position / normal /
// uv / index / bounds / groups / materialKeys / hash).
//
// Refresh by deleting the snapshot file or running with the env var
// `CURTAIN_WALL_SNAPSHOT_REFRESH=1`.
//
// This is the kernel-side parity gate; cross-engine PRYZM 1 reference
// captures land in S14 once the PRYZM 1 façade harness is online (see
// `scripts/capture-pryzm1-curtain-wall-references.ts`, not yet written).

import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { produceCurtainWall } from '../../../packages/geometry-kernel/src/producers/curtainwall.js';
import { assertValidDescriptor } from '../../../packages/geometry-kernel/src/types/assertValidDescriptor.js';
import type { BufferGeometryDescriptor } from '../../../packages/geometry-kernel/src/types/BufferGeometryDescriptor.js';
import { CW_FIXTURES } from '../../../packages/geometry-kernel/__tests__/__configs__/curtainwall-index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = resolve(__dirname, 'snapshots');
const CONFIG_DIR = resolve(__dirname, 'configs');
const REFRESH = process.env.CURTAIN_WALL_SNAPSHOT_REFRESH === '1';

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

describe(`curtain-wall snapshot parity (${CW_FIXTURES.length} fixtures)`, () => {
  // Write configs out as JSON so they stay in sync with the TS catalog;
  // these will be consumed downstream by the (S14) PRYZM 1 capture script.
  for (const f of CW_FIXTURES) {
    writeFileSync(
      resolve(CONFIG_DIR, `${f.id}.json`),
      JSON.stringify(
        { id: f.id, description: f.description, curtainWall: f.cw, joinData: f.joinData, worldY: f.worldY },
        null, 2,
      ) + '\n',
    );
  }

  for (const f of CW_FIXTURES) {
    it(`${f.id} matches snapshot`, () => {
      const desc = produceCurtainWall(f.cw, f.joinData, f.worldY);
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
