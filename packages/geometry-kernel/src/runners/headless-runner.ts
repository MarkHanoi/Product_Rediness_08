// headless-runner — Node `worker_thread` runner for the kernel.
// **K1-B foundation** (`phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md`
// §S08 line 520): proves the kernel is genuinely Node-runnable.
//
// Posts `{ dto, joinData, worldY }` to a worker thread, awaits the
// `BufferGeometryDescriptor`, asserts the descriptor invariants on
// receipt.
//
// Implementation note — TypeScript-in-worker_threads:
//   `--import tsx` does not reliably propagate to worker_threads
//   spawned from inside Vitest's own worker pool (Node 20.x picks up
//   a stale ESM loader chain).  We side-step by bundling
//   `node-worker.ts` on first call with esbuild → write the bundle
//   to `os.tmpdir()/pryzm-geom-kernel-worker.<hash>.mjs` → spawn the
//   worker from there.  Bundle is reused across calls.

import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import type { Wall } from '@pryzm/protocol';
import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';
import type { JoinData } from '../types/JoinData.js';
import { assertValidDescriptor } from '../types/assertValidDescriptor.js';
import type { WorkerOutbound } from './worker-entry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let nextId = 0;
const pending = new Map<string, {
  resolve: (d: BufferGeometryDescriptor) => void;
  reject: (e: Error) => void;
}>();

let worker: Worker | null = null;
let starting: Promise<Worker> | null = null;
let bundlePath: string | null = null;

async function ensureBundle(): Promise<string> {
  if (bundlePath && existsSync(bundlePath)) return bundlePath;
  const esbuild = await import('esbuild');
  const entry = resolve(__dirname, './node-worker.ts');
  // Hash the workspace root so a second checkout doesn't reuse a stale bundle.
  const hash = createHash('sha1').update(entry).digest('hex').slice(0, 12);
  const dir = join(tmpdir(), 'pryzm-geom-kernel');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `node-worker.${hash}.mjs`);
  // Always rebuild to pick up source edits during dev.
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    write: false,
    sourcemap: 'inline',
    external: [],
    logLevel: 'silent',
  });
  const text = result.outputFiles[0]!.text;
  writeFileSync(out, text);
  bundlePath = out;
  return out;
}

async function getWorker(): Promise<Worker> {
  if (worker) return worker;
  if (starting) return starting;
  starting = (async () => {
    const workerPath = await ensureBundle();
    return new Promise<Worker>((resolveWorker, rejectWorker) => {
      const w = new Worker(workerPath, {
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
      });

      const onReady = (msg: unknown) => {
        if ((msg as { kind?: string })?.kind === 'ready') {
          w.off('message', onReady);
          worker = w;
          starting = null;

          w.on('message', (out: WorkerOutbound) => {
            const slot = pending.get(out.id);
            if (!slot) return;
            pending.delete(out.id);
            if (out.kind === 'produceWall:ok') slot.resolve(out.descriptor);
            else slot.reject(new Error(out.message));
          });
          w.on('error', (err: unknown) => {
            const e = err instanceof Error ? err : new Error(String(err));
            for (const { reject } of pending.values()) reject(e);
            pending.clear();
            worker = null;
          });
          w.on('exit', (code) => {
            if (code !== 0) {
              for (const { reject } of pending.values()) {
                reject(new Error(`worker exited with code ${code}`));
              }
              pending.clear();
            }
            worker = null;
          });

          resolveWorker(w);
        }
      };
      w.on('message', onReady);
      w.on('error', rejectWorker);
    });
  })();
  return starting;
}

export async function runProducerInNode(
  dto: Wall,
  joinData: JoinData,
  worldY: number,
): Promise<BufferGeometryDescriptor> {
  const id = String(++nextId);
  const w = await getWorker();
  const promise = new Promise<BufferGeometryDescriptor>((resolveOk, rejectErr) => {
    pending.set(id, { resolve: resolveOk, reject: rejectErr });
  });
  w.postMessage({ kind: 'produceWall', id, dto, joinData, worldY });
  const descriptor = await promise;
  assertValidDescriptor(descriptor);
  return descriptor;
}

export async function shutdownNodeWorker(): Promise<void> {
  if (!worker) return;
  await worker.terminate();
  worker = null;
}
