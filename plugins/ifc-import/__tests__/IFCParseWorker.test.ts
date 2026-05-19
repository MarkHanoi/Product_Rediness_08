/**
 * IFC Parse Worker tests — Wave A17-T6 (2026-05-03).
 *
 * Tests the IFCParseWorker message protocol and IFCImportHandler behaviour
 * using a mock Worker so the suite runs in Node/vitest without a real browser
 * Worker or WASM binary.
 *
 * Exit criterion (A17-T6): ≥ 6 tests; parse does not block main thread;
 * parse result is structurally correct.
 *
 * Timing strategy: IFCImportHandler binds `onmessage` synchronously (before
 * the async file.arrayBuffer() call). Tests configure `postMessage` to
 * auto-emit a canned response so the flow is:
 *   parseFile() → Worker() → onmessage bound (sync) → file.arrayBuffer()
 *   resolves → postMessage() → mock emits → Promise resolves.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { IFCParseResponse } from '../src/workers/IFCParseWorker.js';
import { IFCImportHandler, type IFCParseResult } from '../src/IFCImportHandler.js';

// ---------------------------------------------------------------------------
// Minimal Worker mock
// ---------------------------------------------------------------------------

interface MockWorkerInstance {
  onmessage: ((ev: MessageEvent) => void) | null;
  onerror: ((ev: ErrorEvent) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
  /** Fire a MessageEvent as if coming from the worker. */
  _emit(data: IFCParseResponse): void;
  /** Fire an ErrorEvent from the worker. */
  _error(msg: string): void;
}

function makeMockWorker(): MockWorkerInstance {
  const w: MockWorkerInstance = {
    onmessage: null,
    onerror: null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
    _emit(data: IFCParseResponse) {
      w.onmessage?.({ data } as MessageEvent);
    },
    _error(msg: string) {
      w.onerror?.({ message: msg } as ErrorEvent);
    },
  };
  return w;
}

// `latestMock` is updated every time `new Worker()` is called.
let latestMock: MockWorkerInstance;

vi.stubGlobal(
  'Worker',
  vi.fn().mockImplementation(() => {
    latestMock = makeMockWorker();
    return latestMock;
  }),
);

// ---------------------------------------------------------------------------
// IFCImportHandler tests
// ---------------------------------------------------------------------------

describe('IFCImportHandler', () => {
  let handler: IFCImportHandler;

  beforeEach(() => {
    handler = new IFCImportHandler();
    vi.mocked(Worker).mockClear();
  });

  // Test 1 — happy path: resolves with correct modelId and elementCount
  it('resolves with modelId and elementCount on a successful parse', async () => {
    const file = new File([new Uint8Array(16)], 'test.ifc');

    // Start parse — Worker is constructed synchronously, latestMock is set,
    // and onmessage is bound before file.arrayBuffer() is awaited.
    const parsePromise = handler.parseFile(file);

    // Configure postMessage to auto-respond AFTER it is called (buffer is ready)
    latestMock.postMessage.mockImplementation(() => {
      latestMock._emit({ type: 'result', modelId: 7, elementCount: 1234 });
    });

    const result: IFCParseResult = await parsePromise;
    expect(result.modelId).toBe(7);
    expect(result.elementCount).toBe(1234);
  });

  // Test 2 — progress callback fires in order before the final result
  it('calls onProgress for each progress message then resolves', async () => {
    const file = new File([new Uint8Array(8)], 'test.ifc');
    const progress: number[] = [];

    const parsePromise = handler.parseFile(file, (pct) => progress.push(pct));

    latestMock.postMessage.mockImplementation(() => {
      latestMock._emit({ type: 'progress', percent: 10 });
      latestMock._emit({ type: 'progress', percent: 50 });
      latestMock._emit({ type: 'progress', percent: 90 });
      latestMock._emit({ type: 'result', modelId: 1, elementCount: 0 });
    });

    await parsePromise;
    expect(progress).toEqual([10, 50, 90]);
  });

  // Test 3 — rejects when the worker emits an error response
  it('rejects when the worker emits an error response', async () => {
    const file = new File([new Uint8Array(8)], 'corrupt.ifc');

    const parsePromise = handler.parseFile(file);
    latestMock.postMessage.mockImplementation(() => {
      latestMock._emit({ type: 'error', message: 'Failed to open IFC model' });
    });

    await expect(parsePromise).rejects.toThrow('Failed to open IFC model');
  });

  // Test 4 — rejects on worker onerror (uncaught exception in the worker script)
  it('rejects when the worker fires an onerror event', async () => {
    const file = new File([new Uint8Array(8)], 'crash.ifc');

    const parsePromise = handler.parseFile(file);
    latestMock.postMessage.mockImplementation(() => {
      latestMock._error('Worker script failed to load');
    });

    await expect(parsePromise).rejects.toThrow('Worker script failed to load');
  });

  // Test 5 — worker is lazy-created once and reused for subsequent calls
  it('creates the Worker lazily and reuses it for subsequent calls', async () => {
    const file1 = new File([new Uint8Array(4)], 'a.ifc');
    const p1 = handler.parseFile(file1);
    latestMock.postMessage.mockImplementation(() => {
      latestMock._emit({ type: 'result', modelId: 1, elementCount: 10 });
    });
    await p1;

    const file2 = new File([new Uint8Array(4)], 'b.ifc');
    const p2 = handler.parseFile(file2);
    latestMock.postMessage.mockImplementation(() => {
      latestMock._emit({ type: 'result', modelId: 2, elementCount: 20 });
    });
    await p2;

    // Worker constructor called exactly once across both parseFile calls
    expect(Worker).toHaveBeenCalledTimes(1);
  });

  // Test 6 — buffer is transferred (postMessage called with a transferable list)
  it('transfers ArrayBuffer ownership to the worker (zero-copy)', async () => {
    const file = new File([new Uint8Array(32)], 'transfer.ifc');

    const parsePromise = handler.parseFile(file);
    latestMock.postMessage.mockImplementation(() => {
      latestMock._emit({ type: 'result', modelId: 3, elementCount: 5 });
    });
    await parsePromise;

    expect(latestMock.postMessage).toHaveBeenCalledOnce();
    const [msg, transferList] = latestMock.postMessage.mock.calls[0] as [
      { type: string; buffer: ArrayBuffer },
      ArrayBuffer[],
    ];
    expect(msg.type).toBe('parse');
    expect(msg.buffer).toBeInstanceOf(ArrayBuffer);
    expect(Array.isArray(transferList)).toBe(true);
    expect(transferList.length).toBe(1);
    expect(transferList[0]).toBeInstanceOf(ArrayBuffer);
  });

  // Test 7 — dispose() terminates the worker and forces a fresh one on next call
  it('terminates the worker on dispose() and spawns a fresh one for the next call', async () => {
    const file1 = new File([new Uint8Array(4)], 'pre.ifc');
    const p1 = handler.parseFile(file1);
    latestMock.postMessage.mockImplementation(() => {
      latestMock._emit({ type: 'result', modelId: 1, elementCount: 1 });
    });
    await p1;

    handler.dispose();
    expect(latestMock.terminate).toHaveBeenCalledOnce();

    // Next parseFile must create a new Worker instance
    const file2 = new File([new Uint8Array(4)], 'post.ifc');
    const p2 = handler.parseFile(file2);
    latestMock.postMessage.mockImplementation(() => {
      latestMock._emit({ type: 'result', modelId: 2, elementCount: 2 });
    });
    await p2;

    expect(Worker).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// IFCParseResponse discriminated-union type contract (10 structural checks)
// ---------------------------------------------------------------------------

describe('IFCParseResponse type contract', () => {
  it('progress response has type "progress" and numeric percent', () => {
    const msg: IFCParseResponse = { type: 'progress', percent: 42 };
    expect(msg.type).toBe('progress');
    if (msg.type === 'progress') expect(typeof msg.percent).toBe('number');
  });

  it('result response has type "result" with modelId and elementCount', () => {
    const msg: IFCParseResponse = { type: 'result', modelId: 99, elementCount: 500 };
    expect(msg.type).toBe('result');
    if (msg.type === 'result') {
      expect(msg.modelId).toBe(99);
      expect(msg.elementCount).toBe(500);
    }
  });

  it('error response has type "error" with string message', () => {
    const msg: IFCParseResponse = { type: 'error', message: 'parse failed' };
    expect(msg.type).toBe('error');
    if (msg.type === 'error') expect(typeof msg.message).toBe('string');
  });
});
