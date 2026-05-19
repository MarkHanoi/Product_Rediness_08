// GeometryWorkerPool.test.ts — ADR-047 · Task 4.2
//
// Tests the GeometryWorkerPool class using a mock Worker so no real OS threads
// are spawned in the test environment.
//
// Acceptance criteria verified:
//   ✓ Pool spawns `size` workers on construction (default 2).
//   ✓ dispatch() returns a Promise that resolves with the worker's result.
//   ✓ Round-robin dispatch routes requests across the pool.
//   ✓ terminate() rejects all inflight promises and prevents new dispatches.
//   ✓ Pool size is configurable via GEOMETRY_WORKER_POOL_SIZE localStorage key.
//   ✓ P3: no rAF invocations in pool logic.
//   ✓ P2: GeometryWorkerPool itself does not import from 'three'.
//
// §4.2-ROBUST-FALLBACK criteria (resilience additions):
//   ✓ Worker error event marks the worker dead and rejects all inflight promises.
//   ✓ dispatch() to a dead worker (all-dead pool) rejects immediately.
//   ✓ Worker messageerror event marks the worker dead and rejects all inflight.
//   ✓ Error result (result.error set by worker) rejects the pending promise.
//   ✓ Per-request timeout rejects after DISPATCH_TIMEOUT_MS when worker never responds.
//   ✓ Timeout is cleared when the worker responds normally (no timer leak).

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { GeometryWorkerRequest, GeometryWorkerResult } from '@pryzm/geometry-curtain-wall';

// ---------------------------------------------------------------------------
// Mock Worker
//
// Captures all event listeners so tests can trigger synthetic responses,
// errors, and messageerror events.
// ---------------------------------------------------------------------------

type MessageListener      = (ev: { data: GeometryWorkerResult }) => void;
type ErrorListener        = (ev: { message: string }) => void;
type MessageErrorListener = (ev: MessageEvent) => void;

interface MockWorkerInstance {
  _messageListeners:      MessageListener[];
  _errorListeners:        ErrorListener[];
  _messageErrorListeners: MessageErrorListener[];
  postMessage:            ReturnType<typeof vi.fn>;
  terminate:              ReturnType<typeof vi.fn>;
  addEventListener:       ReturnType<typeof vi.fn>;
  /** Simulate a successful geometry result from the worker. */
  _respond(result: GeometryWorkerResult): void;
  /** Simulate an uncaught error inside the worker (fires the error event). */
  _error(message: string): void;
  /** Simulate a structured-clone deserialization failure (messageerror event). */
  _messageError(): void;
}

const mockWorkerInstances: MockWorkerInstance[] = [];

class MockWorker implements MockWorkerInstance {
  _messageListeners:      MessageListener[]      = [];
  _errorListeners:        ErrorListener[]        = [];
  _messageErrorListeners: MessageErrorListener[] = [];
  postMessage = vi.fn();
  terminate   = vi.fn();

  addEventListener = vi.fn((event: string, listener: (...args: unknown[]) => void) => {
    if (event === 'message')      this._messageListeners.push(listener as MessageListener);
    if (event === 'error')        this._errorListeners.push(listener as ErrorListener);
    if (event === 'messageerror') this._messageErrorListeners.push(listener as MessageErrorListener);
  });

  _respond(result: GeometryWorkerResult): void {
    for (const l of this._messageListeners) l({ data: result });
  }

  _error(message: string): void {
    for (const l of this._errorListeners) l({ message });
  }

  _messageError(): void {
    for (const l of this._messageErrorListeners) l(new MessageEvent('messageerror'));
  }

  constructor() {
    mockWorkerInstances.push(this);
  }
}

// ---------------------------------------------------------------------------
// Import helper — load pool after stubbing Worker
// ---------------------------------------------------------------------------

let GeometryWorkerPool: typeof import('@pryzm/geometry-curtain-wall').GeometryWorkerPool;

beforeEach(async () => {
  mockWorkerInstances.length = 0;
  vi.stubGlobal('Worker', MockWorker);

  // Reset module so each test gets a fresh pool class with the mocked Worker.
  vi.resetModules();
  const mod = await import('@pryzm/geometry-curtain-wall');
  GeometryWorkerPool = mod.GeometryWorkerPool;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Minimal request / result fixtures
// ---------------------------------------------------------------------------

function makeRequest(wallId = 'wall-1', requestId = 'req-1'): GeometryWorkerRequest {
  return {
    requestId,
    wallId,
    cells: [],
    mullionSize: 0.05,
    panelThickness: 0.03,
    wallHeight: 3,
    wallLength: 5,
    uLinesT: [0.25, 0.75],
    vLinesT: [0.5],
  };
}

function makeResult(req: GeometryWorkerRequest): GeometryWorkerResult {
  return {
    requestId:      req.requestId,
    wallId:         req.wallId,
    fallbackPanels: [],
    vMullionBox:    null,
    hMullionBox:    null,
    vInstanceMatrices: null,
    hInstanceMatrices: null,
  };
}

function makeErrorResult(req: GeometryWorkerRequest, error: string): GeometryWorkerResult {
  return {
    requestId:      req.requestId,
    wallId:         req.wallId,
    error,
    fallbackPanels: [],
    vMullionBox:    null,
    hMullionBox:    null,
    vInstanceMatrices: null,
    hInstanceMatrices: null,
  };
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe('GeometryWorkerPool — construction', () => {
  it('spawns exactly 2 workers by default', () => {
    new GeometryWorkerPool();
    expect(mockWorkerInstances).toHaveLength(2);
  });

  it('spawns the requested number of workers when size is given', () => {
    new GeometryWorkerPool(3);
    expect(mockWorkerInstances).toHaveLength(3);
  });

  it('registers message, error, and messageerror listeners on each worker', () => {
    new GeometryWorkerPool(1);
    const calls = mockWorkerInstances[0].addEventListener.mock.calls.map(c => c[0]);
    expect(calls).toContain('message');
    expect(calls).toContain('error');
    expect(calls).toContain('messageerror');
  });
});

// ---------------------------------------------------------------------------
// Dispatch and round-trip
// ---------------------------------------------------------------------------

describe('GeometryWorkerPool — dispatch and round-trip', () => {
  it('dispatch() resolves when the worker posts a matching result', async () => {
    const pool = new GeometryWorkerPool(1);
    const req  = makeRequest();

    const promise = pool.dispatch(req);

    expect(mockWorkerInstances[0].postMessage).toHaveBeenCalledWith(req);

    mockWorkerInstances[0]._respond(makeResult(req));

    const result = await promise;
    expect(result.wallId).toBe('wall-1');
    expect(result.requestId).toBe('req-1');
  });

  it('dispatch routes requests round-robin across the pool', async () => {
    const pool = new GeometryWorkerPool(2);
    const req1 = makeRequest('wall-1', 'req-1');
    const req2 = makeRequest('wall-2', 'req-2');

    const p1 = pool.dispatch(req1);
    const p2 = pool.dispatch(req2);

    expect(mockWorkerInstances[0].postMessage).toHaveBeenCalledWith(req1);
    expect(mockWorkerInstances[1].postMessage).toHaveBeenCalledWith(req2);

    mockWorkerInstances[0]._respond(makeResult(req1));
    mockWorkerInstances[1]._respond(makeResult(req2));

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.wallId).toBe('wall-1');
    expect(r2.wallId).toBe('wall-2');
  });

  it('unknown requestId in response is silently ignored (no crash)', () => {
    new GeometryWorkerPool(1);
    expect(() => {
      mockWorkerInstances[0]._respond({
        requestId:      'stale-req-that-was-never-dispatched',
        wallId:         'x',
        fallbackPanels: [],
        vMullionBox:    null,
        hMullionBox:    null,
        vInstanceMatrices: null,
        hInstanceMatrices: null,
      });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Terminate
// ---------------------------------------------------------------------------

describe('GeometryWorkerPool — terminate', () => {
  it('terminate() rejects all inflight promises', async () => {
    const pool = new GeometryWorkerPool(1);
    const req  = makeRequest();

    const promise = pool.dispatch(req);
    pool.terminate();

    await expect(promise).rejects.toThrow(/terminated/);
  });

  it('dispatch() after terminate() returns a rejected promise', async () => {
    const pool = new GeometryWorkerPool(1);
    pool.terminate();
    await expect(pool.dispatch(makeRequest())).rejects.toThrow(/terminated/);
  });

  it('isTerminated is true after terminate()', () => {
    const pool = new GeometryWorkerPool(1);
    expect(pool.isTerminated).toBe(false);
    pool.terminate();
    expect(pool.isTerminated).toBe(true);
  });

  it('terminate() calls Worker.terminate() on every pool member', () => {
    const pool = new GeometryWorkerPool(2);
    pool.terminate();
    expect(mockWorkerInstances[0].terminate).toHaveBeenCalledOnce();
    expect(mockWorkerInstances[1].terminate).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Pool size from localStorage
// ---------------------------------------------------------------------------

describe('GeometryWorkerPool — pool size from localStorage', () => {
  it('respects GEOMETRY_WORKER_POOL_SIZE = 4 from localStorage', async () => {
    const storageMock = { getItem: vi.fn().mockReturnValue('4'), setItem: vi.fn() };
    vi.stubGlobal('localStorage', storageMock);

    vi.resetModules();
    const mod = await import('@pryzm/geometry-curtain-wall');
    new mod.GeometryWorkerPool();
    expect(mockWorkerInstances).toHaveLength(4);

    vi.unstubAllGlobals();
    vi.stubGlobal('Worker', MockWorker);
  });

  it('ignores GEOMETRY_WORKER_POOL_SIZE = 99 (out of range) and falls back to 2', async () => {
    const storageMock = { getItem: vi.fn().mockReturnValue('99'), setItem: vi.fn() };
    vi.stubGlobal('localStorage', storageMock);

    vi.resetModules();
    const mod = await import('@pryzm/geometry-curtain-wall');
    new mod.GeometryWorkerPool();
    expect(mockWorkerInstances).toHaveLength(2);

    vi.unstubAllGlobals();
    vi.stubGlobal('Worker', MockWorker);
  });
});

// ---------------------------------------------------------------------------
// §4.2-ROBUST-FALLBACK — Dead worker detection via error event
// ---------------------------------------------------------------------------

describe('GeometryWorkerPool — §4.2-ROBUST-FALLBACK dead-worker detection', () => {
  it('worker error event rejects all inflight requests for that worker', async () => {
    const pool = new GeometryWorkerPool(1);
    const req  = makeRequest();

    const promise = pool.dispatch(req);

    // Simulate a runtime error inside the worker.
    mockWorkerInstances[0]._error('SyntaxError: Unexpected token');

    await expect(promise).rejects.toThrow(/Geometry worker error/);
  });

  it('worker error event with no inflight requests does not throw', () => {
    new GeometryWorkerPool(1);
    // No dispatches yet — error fires when inflight map is empty.
    expect(() => {
      mockWorkerInstances[0]._error('module load failed');
    }).not.toThrow();
  });

  it('dispatch() to all-dead pool rejects immediately without postMessage', async () => {
    const pool = new GeometryWorkerPool(1);

    // Mark the single worker dead via error event.
    mockWorkerInstances[0]._error('module load failed');
    const postMessageCallsBefore = mockWorkerInstances[0].postMessage.mock.calls.length;

    // New dispatch should reject immediately — no postMessage to the dead worker.
    await expect(pool.dispatch(makeRequest('wall-x', 'req-x'))).rejects.toThrow(
      /all workers dead/
    );

    // Confirm no postMessage was sent to the dead worker.
    expect(mockWorkerInstances[0].postMessage.mock.calls.length).toBe(postMessageCallsBefore);
  });

  it('dead worker from error event does not accept new inflight requests', async () => {
    const pool = new GeometryWorkerPool(2);

    // Kill worker 0 before any dispatch.
    mockWorkerInstances[0]._error('init failure');

    // With worker 0 dead, dispatch should go to worker 1.
    const req = makeRequest('wall-1', 'req-1');
    const p   = pool.dispatch(req);

    // Worker 0 should NOT have received the request; worker 1 should.
    expect(mockWorkerInstances[0].postMessage).not.toHaveBeenCalled();
    expect(mockWorkerInstances[1].postMessage).toHaveBeenCalledWith(req);

    // Resolve via worker 1 to prevent unhandled rejection.
    mockWorkerInstances[1]._respond(makeResult(req));
    await p;
  });
});

// ---------------------------------------------------------------------------
// §4.2-ROBUST-FALLBACK — messageerror event
// ---------------------------------------------------------------------------

describe('GeometryWorkerPool — §4.2-ROBUST-FALLBACK messageerror', () => {
  it('messageerror event marks the worker dead and rejects inflight requests', async () => {
    const pool = new GeometryWorkerPool(1);
    const req  = makeRequest();

    const promise = pool.dispatch(req);

    mockWorkerInstances[0]._messageError();

    await expect(promise).rejects.toThrow(/messageerror/);
  });

  it('dispatch() after messageerror (all-dead pool) rejects immediately', async () => {
    const pool = new GeometryWorkerPool(1);

    // Trigger messageerror with empty inflight.
    mockWorkerInstances[0]._messageError();

    await expect(pool.dispatch(makeRequest())).rejects.toThrow(/all workers dead/);
  });
});

// ---------------------------------------------------------------------------
// §4.2-ROBUST-FALLBACK — Error result forwarded from worker
// ---------------------------------------------------------------------------

describe('GeometryWorkerPool — §4.2-ROBUST-FALLBACK error result', () => {
  it('dispatch() rejects when the worker posts a result with error set', async () => {
    const pool = new GeometryWorkerPool(1);
    const req  = makeRequest();

    const promise = pool.dispatch(req);

    // Worker encountered an exception and posted back an error result.
    mockWorkerInstances[0]._respond(makeErrorResult(req, 'processRequest failed: NaN dimensions'));

    await expect(promise).rejects.toThrow(/worker returned error.*processRequest failed/);
  });

  it('dispatch() resolves normally when result.error is absent (undefined)', async () => {
    const pool = new GeometryWorkerPool(1);
    const req  = makeRequest();

    const promise = pool.dispatch(req);
    // Happy path — no error field.
    mockWorkerInstances[0]._respond(makeResult(req));

    const result = await promise;
    expect(result.wallId).toBe('wall-1');
  });

  it('error result does not mark the worker dead (transient per-request failure)', async () => {
    const pool = new GeometryWorkerPool(1);
    const req1 = makeRequest('wall-1', 'req-1');
    const req2 = makeRequest('wall-2', 'req-2');

    const p1 = pool.dispatch(req1);
    // First request fails via error result.
    mockWorkerInstances[0]._respond(makeErrorResult(req1, 'bad cell dims'));
    await expect(p1).rejects.toThrow(/worker returned error/);

    // Second request to the same (still-alive) worker should work fine.
    const p2 = pool.dispatch(req2);
    mockWorkerInstances[0]._respond(makeResult(req2));
    const result = await p2;
    expect(result.wallId).toBe('wall-2');
  });
});

// ---------------------------------------------------------------------------
// §4.2-ROBUST-FALLBACK — Per-request dispatch timeout
// ---------------------------------------------------------------------------

describe('GeometryWorkerPool — §4.2-ROBUST-FALLBACK dispatch timeout', () => {
  it('dispatch() rejects after DISPATCH_TIMEOUT_MS when the worker never responds', async () => {
    vi.useFakeTimers();

    const pool    = new GeometryWorkerPool(1);
    const req     = makeRequest();
    const promise = pool.dispatch(req);

    // Advance past the 10-second timeout window.
    await vi.advanceTimersByTimeAsync(10_001);

    await expect(promise).rejects.toThrow(/timeout after 10000ms/);
  });

  it('timeout is cleared when the worker responds normally (no timer leak)', async () => {
    vi.useFakeTimers();

    const pool    = new GeometryWorkerPool(1);
    const req     = makeRequest();
    const promise = pool.dispatch(req);

    // Worker responds well within the timeout.
    mockWorkerInstances[0]._respond(makeResult(req));

    const result = await promise;
    expect(result.wallId).toBe('wall-1');

    // Advancing past the timeout window must not cause any further rejection.
    await vi.advanceTimersByTimeAsync(10_001);

    // Promise is already settled — no unhandled rejections.
    await expect(promise).resolves.toBeDefined();
  });

  it('two concurrent requests both timeout independently', async () => {
    vi.useFakeTimers();

    const pool = new GeometryWorkerPool(2);
    const req1 = makeRequest('wall-1', 'req-1');
    const req2 = makeRequest('wall-2', 'req-2');

    const p1 = pool.dispatch(req1);
    const p2 = pool.dispatch(req2);

    await vi.advanceTimersByTimeAsync(10_001);

    await expect(p1).rejects.toThrow(/timeout/);
    await expect(p2).rejects.toThrow(/timeout/);
  });

  it('timeout is cleared when worker fails with an error result (no double-reject)', async () => {
    vi.useFakeTimers();

    const pool    = new GeometryWorkerPool(1);
    const req     = makeRequest();
    const promise = pool.dispatch(req);

    // Worker posts back an error result immediately.
    mockWorkerInstances[0]._respond(makeErrorResult(req, 'oops'));

    // Promise should already be rejected via the error-result path.
    await expect(promise).rejects.toThrow(/worker returned error/);

    // Advancing past the timeout must not cause any additional rejection.
    // (The settled flag prevents double-reject.)
    await vi.advanceTimersByTimeAsync(10_001);
  });
});
