// Node worker_thread entry point.  Loaded by `headless-runner.ts`
// via `new Worker(...)` with `tsx` for TypeScript support.

import { parentPort } from 'node:worker_threads';
import { handleRequest, collectTransferables, type WorkerInbound } from './worker-entry.js';

if (!parentPort) {
  throw new Error('node-worker.ts must be loaded as a worker_thread');
}

parentPort.postMessage({ kind: 'ready' });

parentPort.on('message', (req: WorkerInbound) => {
  const out = handleRequest(req);
  if (out.kind === 'produceWall:ok') {
    parentPort!.postMessage(out, collectTransferables(out.descriptor));
  } else {
    parentPort!.postMessage(out);
  }
});
