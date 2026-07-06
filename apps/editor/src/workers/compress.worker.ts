// compress.worker.ts — §PERF-COMPRESS-WORKER (L-131 P4a)
//
// Dedicated Web Worker that runs the snapshot DEFLATE OFF the main thread.
//
// WHY: on large (80-apartment) models the auto-save path deflated the whole
// version snapshot synchronously on the main thread — a documented LONGTASK that
// froze the UI right after generation. This worker moves that CPU off the render
// thread; the main thread merely awaits the compressed bytes and writes them to
// IndexedDB (already an async, fire-and-forget step).
//
// CONTRACT INVARIANTS:
//   P2 — Does NOT import 'three' / renderer-three (pure fflate + string work).
//   P3 — Does NOT call requestAnimationFrame.
//   WORKER — Runs in a DedicatedWorkerGlobalScope; `self` is the worker global.
//
// FORMAT IDENTITY: compression is delegated to `encodeCompressed` in the SHARED
// `compressCodec` module — the identical function the main-thread synchronous
// fallback uses. So a blob produced here is byte-for-byte what the main thread
// would have produced, and inflates through the same read path. This is the
// guarantee that lets P4a be transparently revertible (flag OFF or worker
// unavailable → main thread compresses the same bytes).
//
// The worker input/output are plain JSON strings (structured-clone friendly);
// no ArrayBuffer transfer is needed because the payload is text.

import {
    encodeCompressed,
    COMPRESS_WORKER_READY_ID,
    type CompressWorkerRequest,
    type CompressWorkerResult,
} from './compressCodec';

// Startup handshake: tell the pool this worker is live and its module evaluated
// successfully. The pool only routes work to a worker that has handshaked, so a
// worker that fails to load (404 / transform error) never receives a job and the
// main thread stays on the synchronous fallback.
self.postMessage({ requestId: COMPRESS_WORKER_READY_ID, ready: true } satisfies CompressWorkerResult);

self.addEventListener('message', (event: MessageEvent<CompressWorkerRequest>) => {
    const req = event.data;
    try {
        const results = req.items.map((it) => ({ key: it.key, blob: encodeCompressed(it.json) }));
        self.postMessage({ requestId: req.requestId, results } satisfies CompressWorkerResult);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[compress.worker] compression failed:', message, err);
        self.postMessage({ requestId: req.requestId, error: message } satisfies CompressWorkerResult);
    }
});
