// browser-worker-entry — the browser-side counterpart to
// `node-worker.ts`.  Bundlers (Vite / esbuild) pick this up via the
// `new Worker(new URL('.../browser-worker-entry.ts', import.meta.url))`
// pattern from the S09 committer.

import { handleRequest, collectTransferables, type WorkerInbound } from './worker-entry.js';

const ctx = self as unknown as {
  postMessage(msg: unknown, transfer?: ArrayBuffer[]): void;
  addEventListener(type: 'message', l: (ev: { data: WorkerInbound }) => void): void;
};

ctx.postMessage({ kind: 'ready' });

ctx.addEventListener('message', (ev) => {
  const out = handleRequest(ev.data);
  if (out.kind === 'produceWall:ok') {
    ctx.postMessage(out, collectTransferables(out.descriptor));
  } else {
    ctx.postMessage(out);
  }
});
