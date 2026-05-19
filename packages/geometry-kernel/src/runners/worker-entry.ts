// Shared producer worker entry — used by both the Node worker_thread
// runner (`headless-runner.ts`) and the browser worker runner
// (`browser-worker-runner.ts`).
//
// The entry receives `{ kind: 'produceWall', dto, joinData, worldY }`
// over `postMessage`-style transport and replies with the
// `BufferGeometryDescriptor`.  All buffers are transferable
// `Float32Array` / `Uint16Array` / `Uint32Array` so the round-trip
// avoids structured-clone copies of the heavy payload.

import type { Wall } from '@pryzm/protocol';
import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';
import type { JoinData } from '../types/JoinData.js';
import { produceWall } from '../producers/wall.js';

export interface ProduceWallRequest {
  readonly kind: 'produceWall';
  readonly id: string;
  readonly dto: Wall;
  readonly joinData: JoinData;
  readonly worldY: number;
}

export interface ProduceWallResponse {
  readonly kind: 'produceWall:ok';
  readonly id: string;
  readonly descriptor: BufferGeometryDescriptor;
}

export interface ProduceWallError {
  readonly kind: 'produceWall:err';
  readonly id: string;
  readonly message: string;
  readonly stack?: string;
}

export type WorkerInbound = ProduceWallRequest;
export type WorkerOutbound = ProduceWallResponse | ProduceWallError;

export function handleRequest(req: WorkerInbound): WorkerOutbound {
  if (req.kind === 'produceWall') {
    try {
      const descriptor = produceWall(req.dto, req.joinData, req.worldY);
      return { kind: 'produceWall:ok', id: req.id, descriptor };
    } catch (e) {
      const err = e as Error;
      return {
        kind: 'produceWall:err',
        id: req.id,
        message: err.message,
        stack: err.stack,
      };
    }
  }
  return {
    kind: 'produceWall:err',
    id: (req as { id: string }).id,
    message: `unknown request kind: ${(req as { kind: string }).kind}`,
  };
}

/**
 * Collect the typed-array buffers inside a descriptor so a worker
 * runtime can pass them via the `transfer` list of `postMessage`.
 */
export function collectTransferables(d: BufferGeometryDescriptor): ArrayBuffer[] {
  // Typed-array `.buffer` is `ArrayBufferLike` under TS lib.es2024;
  // worker_threads / postMessage only accept the strict `ArrayBuffer`
  // subtype.  All kernel-emitted descriptors back their typed arrays
  // with plain ArrayBuffer (never SharedArrayBuffer), so the cast is
  // safe — see `serializeDescriptor` which allocates fresh `new
  // Float32Array(n)` etc.
  return [
    d.position.buffer as ArrayBuffer,
    d.normal.buffer as ArrayBuffer,
    d.uv.buffer as ArrayBuffer,
    d.index.buffer as ArrayBuffer,
  ];
}
