// S08-T8 — Headless Node-vs-in-process parity.
//
// Runs each of the 30 wall fixtures through:
//   (1) the in-process producer  → `produceWall(dto, ...)`
//   (2) the Node `worker_thread` runner → `runProducerInNode(dto, ...)`
//
// Asserts byte-equality on every typed array (position / normal / uv
// / index) plus structural fields (bounds, groups, materialKeys,
// hash).  This is the **K1-B foundation** test (PHASE-1B-Q2-M4-M6
// line 520): if it ever red-lines, deterministic execution across
// runtimes is broken and the kernel cannot ship.

import { describe, expect, it, afterAll } from 'vitest';
import { produceWall } from '../../../packages/geometry-kernel/src/producers/wall.js';
import {
  runProducerInNode,
  shutdownNodeWorker,
} from '../../../packages/geometry-kernel/src/runners/headless-runner.js';
import { FIXTURES } from '../../../packages/geometry-kernel/__tests__/__configs__/index.js';

function bytesEqual(a: ArrayBufferView, b: ArrayBufferView): boolean {
  if (a.byteLength !== b.byteLength) return false;
  const av = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const bv = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  for (let i = 0; i < av.length; i++) if (av[i] !== bv[i]) return false;
  return true;
}

describe('wall — in-process vs Node worker_thread parity', () => {
  afterAll(async () => {
    await shutdownNodeWorker();
  });

  for (const f of FIXTURES) {
    it(`${f.id} is byte-identical across runtimes`, async () => {
      const inProcess = produceWall(f.wall, f.joinData, f.worldY);
      const viaWorker = await runProducerInNode(f.wall, f.joinData, f.worldY);

      expect(viaWorker.hash).toBe(inProcess.hash);
      expect(viaWorker.materialKeys.map(String)).toEqual(
        inProcess.materialKeys.map(String),
      );
      expect(viaWorker.groups).toEqual(inProcess.groups);
      expect(viaWorker.bounds).toEqual(inProcess.bounds);
      expect(viaWorker.position.length).toBe(inProcess.position.length);
      expect(bytesEqual(viaWorker.position, inProcess.position)).toBe(true);
      expect(bytesEqual(viaWorker.normal, inProcess.normal)).toBe(true);
      expect(bytesEqual(viaWorker.uv, inProcess.uv)).toBe(true);
      expect(bytesEqual(viaWorker.index, inProcess.index)).toBe(true);
    });
  }
});
