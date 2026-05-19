// browser-worker-runner — vanilla `postMessage` runner for the
// browser worker.  No Comlink — the protocol is the small typed
// envelope shared with `headless-runner.ts` (`worker-entry.ts`).
// Keeps the runtime contract uniform with Node and avoids pulling
// Comlink (or any other RPC library) into the kernel surface.
//
// The committer (S09) wires this up against a `Worker` constructed
// from `browser-worker-entry.ts`.  At S08 we publish only the
// runner; the actual `Worker` boot lives in the editor app.

import type { Wall } from '@pryzm/protocol';
import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';
import type { JoinData } from '../types/JoinData.js';
import { assertValidDescriptor } from '../types/assertValidDescriptor.js';
import type { WorkerOutbound } from './worker-entry.js';

/**
 * Minimal interface that both `Worker` (browser) and a Node-side
 * test double satisfy.  Lets us write the runner once and unit-test
 * it without a real worker.
 */
export interface PostMessagePort {
  postMessage(message: unknown, transfer?: ArrayBuffer[]): void;
  addEventListener(type: 'message', listener: (ev: { data: WorkerOutbound }) => void): void;
  removeEventListener(type: 'message', listener: (ev: { data: WorkerOutbound }) => void): void;
}

export class BrowserWorkerRunner {
  private nextId = 0;
  private readonly pending = new Map<string, {
    resolve: (d: BufferGeometryDescriptor) => void;
    reject: (e: Error) => void;
  }>();

  constructor(private readonly port: PostMessagePort) {
    port.addEventListener('message', (ev) => {
      const out = ev.data;
      const slot = this.pending.get(out.id);
      if (!slot) return;
      this.pending.delete(out.id);
      if (out.kind === 'produceWall:ok') slot.resolve(out.descriptor);
      else slot.reject(new Error(out.message));
    });
  }

  async produceWall(
    dto: Wall,
    joinData: JoinData,
    worldY: number,
  ): Promise<BufferGeometryDescriptor> {
    const id = String(++this.nextId);
    const promise = new Promise<BufferGeometryDescriptor>((resolveOk, rejectErr) => {
      this.pending.set(id, { resolve: resolveOk, reject: rejectErr });
    });
    this.port.postMessage({ kind: 'produceWall', id, dto, joinData, worldY });
    const descriptor = await promise;
    assertValidDescriptor(descriptor);
    return descriptor;
  }
}
