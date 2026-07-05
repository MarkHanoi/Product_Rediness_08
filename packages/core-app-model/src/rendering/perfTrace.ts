/**
 * §PERF — gated perf-trace instrumentation (L-02 heavy-scene nav / L-03 heavy load).
 *
 * Every marker in this subsystem is OFF by default and gated behind the runtime
 * flag `globalThis.__pryzmPerfTrace === true`. When the flag is unset (production
 * default) each helper short-circuits on a single boolean read, so production pays
 * nothing — no `performance.now()`, no accumulation, no logging.
 *
 * Enable at runtime from the devtools console:  `globalThis.__pryzmPerfTrace = true`
 *
 * Pure module: no I/O, no THREE, no DOM. Layer-safe for both `apps/editor`
 * (via the `@pryzm/core-app-model` barrel) and in-package callers
 * (`UnifiedFrameLoop`, `BimWorld`) via a relative import. No P8 span required —
 * these helpers are pure and perform no I/O.
 */

/** True iff the runtime perf-trace flag is on. Single boolean read when off. */
export function perfTraceOn(): boolean {
    return (globalThis as { __pryzmPerfTrace?: boolean }).__pryzmPerfTrace === true;
}

interface PerfAccumulator {
    count: number;
    totalMs: number;
    maxMs: number;
}

const _accums = new Map<string, PerfAccumulator>();

/**
 * Accumulate one wall-clock sample under `name` (invocation count + summed +
 * max ms). No-op unless perfTraceOn(), so callers may invoke unconditionally,
 * but should still gate the surrounding `performance.now()` bookkeeping.
 */
export function perfAccum(name: string, ms: number): void {
    if (!perfTraceOn()) return;
    const a = _accums.get(name) ?? { count: 0, totalMs: 0, maxMs: 0 };
    a.count++;
    a.totalMs += ms;
    if (ms > a.maxMs) a.maxMs = ms;
    _accums.set(name, a);
}

/**
 * Run `fn`, returning its result. When perf-trace is on, the wall-clock cost is
 * accumulated under `name`; when off, `fn` runs directly with zero overhead
 * beyond the boolean read (no timing calls).
 */
export function perfTime<T>(name: string, fn: () => T): T {
    if (!perfTraceOn()) return fn();
    const t0 = performance.now();
    try {
        return fn();
    } finally {
        perfAccum(name, performance.now() - t0);
    }
}

/** Snapshot of an accumulator (zeros if never sampled). */
export function perfRead(name: string): PerfAccumulator {
    const a = _accums.get(name);
    return { count: a?.count ?? 0, totalMs: a?.totalMs ?? 0, maxMs: a?.maxMs ?? 0 };
}

/** Clear one accumulator (or all when `name` is omitted). */
export function perfReset(name?: string): void {
    if (name) _accums.delete(name);
    else _accums.clear();
}

/**
 * Log a `§PERF` line only when perf-trace is on. `console.log` is not touched
 * (no string construction) when the flag is off.
 */
export function perfLog(marker: string, msg: string): void {
    if (!perfTraceOn()) return;
    console.log(`[§PERF] ${marker} ${msg}`);
}

/**
 * Emit a one-line summary of an accumulator via `perfLog`, then reset it.
 * Useful at the end of a load/motion window to print `count`/`total`/`max`.
 */
export function perfDump(marker: string, name: string, extra = ''): void {
    if (!perfTraceOn()) return;
    const a = perfRead(name);
    perfLog(
        marker,
        `${name} count=${a.count} totalMs=${a.totalMs.toFixed(1)} ` +
        `maxMs=${a.maxMs.toFixed(2)}${extra ? ' ' + extra : ''}`,
    );
    perfReset(name);
}
