// bootStepProfile.ts — §STARTUP-BUILDERS-LEG (founder 2026-09-07: "please work harder to improve
// speed in project start up — it should be SUPER QUICK from image 1 to image 2 — but it takes
// seconds — it should be one second — architecturally sound").
//
// ── WHY THIS MODULE EXISTS, AND WHY IT IS NOT ANOTHER `markStartupPhase` ─────────────────────
//
// The founder's §STARTUP-BUDGET trace reads:
//
//     boot:scene-done       t+1 144   (+259 ms)
//     boot:builders-done    t+19 770  (+18 626 ms)   ⛔ 85 % of a 22 s startup
//     boot:tools-done       t+20 811  (+1 041 ms)
//
// Everyone who read that log — including the brief that commissioned this lane — concluded
// "`initBuilders` is 18.6 s". THAT CONCLUSION DOES NOT FOLLOW FROM THE MARK, and this repo has
// made exactly this mistake before, twice, in this exact file family:
//
//   · `startupBudget.ts` §"the 44.2 s hole" — `runtime:composed → boot:ensure-requested` was read
//     as a hub that blocks the main thread for 44 s. It was the user READING the project hub.
//     Human dwell and machine work, THE SAME VALUE.
//   · `startupBudget.ts` §`enter-canvas` — 300 s attributed to a zoom-to-fit; it was a human
//     deciding. "⛔ Never quote an `enter-canvas` delta as a cost again without
//     `enter-canvas:requested` in the same run."
//
// A `markStartupPhase` delta is WALL CLOCK BETWEEN TWO LINES OF CODE. It cannot distinguish:
//   (a) our synchronous code burning the CPU  — shortening our code fixes it;
//   (b) our code SUSPENDED at an `await` while the event loop runs somebody ELSE'S work
//       (Cesium globe construction, tile decode, terrain, a worker hand-off) — shortening our
//       code fixes NOTHING, because the boot was never the thing running;
//   (c) a network round trip.
// Those three demand three different fixes, and the mark reports one number for all three.
//
// ⭐ MEASURED BEFORE THIS MODULE WAS WRITTEN (lane BOOT-BUILDERS, 2026-09-07, Node+happy-dom
// harness constructing every store/builder `initBuilders` constructs, against the real classes):
//
//     TOTAL 11.4 ms over 51 constructor steps — heaviest single step 1.50 ms (DoorBuilder
//     +activate). Every `await import(...)` inside `initBuilders` resolves a module that is
//     ALREADY in the engine chunk (`@app/ui/WorkspaceController` is statically imported by
//     `engineLauncher.ts:23`; `@pryzm/core-app-model/*` and `@pryzm/geometry-*` are static
//     imports at the top of `initBuilders.ts` and are routed to the `domain-engine` manual
//     chunk), so not one of them is a chunk download.
//
// So the BUILDERS THEMSELVES ARE ~11 ms AND THE MARK SAYS 18 626 ms. The missing 18.6 s is (a)
// elsewhere in the same mark span or (b) not ours at all. THIS MODULE IS THE INSTRUMENT THAT
// SAYS WHICH, on the founder's own hardware, in the same console paste he already sends.
//
// ── WHAT IT MEASURES ────────────────────────────────────────────────────────────────────────
//
//   · Per-STEP wall time — the leg is tiled exactly by its steps, so the table sums to the
//     `markStartupPhase` delta and can be reconciled against it line by line.
//   · A step named `await:…` is a segment in which OUR CODE IS SUSPENDED. Any main-thread time
//     inside it is, by construction, somebody else's.
//   · Browser long tasks (> 50 ms) observed during the leg, attributed to the step they land in.
//     `foreign` = long-task time inside `await:` steps — main-thread work the boot WAITED FOR
//     but did not DO. That is the number that separates hypothesis (a) from hypothesis (b), and
//     it is the only honest way to answer "is `initBuilders` slow?".
//
// ⛔ IT CHANGES NO BEHAVIOUR. Like `markStartupPhase`, no step is gated, delayed, retried or
// skipped because of it. Cost per step: one `performance.now()` and one array push.
//
// ⛔ IT IS UNCONDITIONAL, not gated on `import.meta.env.DEV` or `?perf`. The `?perf`-gated
// LONGTASK observer in `src/main.ts:106` is exactly why the founder's production traces have
// never carried long-task attribution: the instrument that would have answered this question
// has been switched off in every session it existed to explain. An instrument installed behind
// a flag is missing in the runs that matter (`engineLauncher.ts` §PRYZM-PERF makes the same
// argument for the same reason).
//
// P8: every exported function carries an OTel span.

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.boot-step-profile');

/** One tiled segment of a leg. `awaited` is true for steps named `await:…`. */
export interface BootStepRecord {
    readonly step: string;
    readonly ms: number;
    readonly awaited: boolean;
    /** Long-task milliseconds observed inside this step's window. */
    readonly longTaskMs: number;
}

interface LegState {
    readonly leg: string;
    readonly startedAtMs: number;
    lastAtMs: number;
    readonly steps: Array<{ step: string; startMs: number; endMs: number; awaited: boolean }>;
    observer: PerformanceObserver | null;
    readonly longTasks: Array<{ startMs: number; durationMs: number }>;
}

/** At most one leg is open at a time; boot legs do not nest. */
let _leg: LegState | null = null;

const now = (): number =>
    typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

/**
 * A step whose name begins with `await:` is one where the caller is SUSPENDED. Everything else
 * is our own synchronous code. This is a naming convention rather than a parameter because the
 * call sites are read far more often than they are written, and `bootStep('await:type stores')`
 * says at the call site which of the two kinds it is.
 */
const AWAIT_PREFIX = 'await:';

/**
 * Open a leg. `leg` should name the `markStartupPhase` span it tiles (e.g. `'builders'` for
 * `boot:scene-done → boot:builders-done`) so the table can be reconciled against the budget.
 *
 * Idempotent-ish: opening a leg while one is already open closes the old one silently rather
 * than throwing. A profiler must never be able to break a boot.
 */
export function beginBootLeg(leg: string): void {
    const span = _tracer.startSpan('pryzm.boot-step-profile.beginLeg');
    try {
        const at = now();
        _leg = {
            leg,
            startedAtMs: at,
            lastAtMs: at,
            steps: [],
            observer: null,
            longTasks: [],
        };
        const state = _leg;
        // Long-task attribution. Guarded on every axis: `PerformanceObserver` may not exist,
        // `longtask` may be unsupported (Safari/Firefox), and `observe` throws on an unknown
        // type in some engines. A profiler that can throw is worse than no profiler.
        try {
            if (typeof PerformanceObserver === 'function') {
                const obs = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        state.longTasks.push({ startMs: entry.startTime, durationMs: entry.duration });
                    }
                });
                obs.observe({ type: 'longtask', buffered: false });
                state.observer = obs;
            }
        } catch {
            // longtask unsupported — the per-step table still works, `foreign` reads 0 and the
            // report says the observer was unavailable rather than implying zero long tasks.
            state.observer = null;
        }
    } finally {
        span.end();
    }
}

/**
 * Close the segment that ends here and name it. Steps tile the leg exactly: the first step runs
 * from `beginBootLeg` to this call, the next from this call to the following one.
 *
 * A call with no open leg is a no-op (not a throw) — the boot must be unaffected by whether
 * somebody remembered to open a leg.
 */
export function bootStep(step: string): void {
    const span = _tracer.startSpan('pryzm.boot-step-profile.step');
    try {
        const state = _leg;
        if (state === null) return;
        const at = now();
        state.steps.push({
            step,
            startMs: state.lastAtMs,
            endMs: at,
            awaited: step.startsWith(AWAIT_PREFIX),
        });
        state.lastAtMs = at;
    } finally {
        span.end();
    }
}

/** The current leg's steps, resolved with their long-task attribution. Read-only; for tests. */
export function getBootLegSteps(): readonly BootStepRecord[] {
    const span = _tracer.startSpan('pryzm.boot-step-profile.getSteps');
    try {
        const state = _leg;
        if (state === null) return [];
        return state.steps.map((s) => ({
            step: s.step,
            ms: s.endMs - s.startMs,
            awaited: s.awaited,
            longTaskMs: _longTaskMsWithin(state, s.startMs, s.endMs),
        }));
    } finally {
        span.end();
    }
}

/**
 * Long-task milliseconds OVERLAPPING `[from, to)`. Overlap, not containment: a 3-second long
 * task that starts before a step and ends inside it contributed its tail to that step, and
 * counting only fully-contained tasks would report 0 for exactly the pathological case this
 * instrument exists to catch.
 */
function _longTaskMsWithin(state: LegState, fromMs: number, toMs: number): number {
    let total = 0;
    for (const lt of state.longTasks) {
        const a = Math.max(fromMs, lt.startMs);
        const b = Math.min(toMs, lt.startMs + lt.durationMs);
        if (b > a) total += b - a;
    }
    return total;
}

/**
 * Close the leg and print it.
 *
 * The report deliberately leads with the OWN / FOREIGN split rather than the biggest step,
 * because the biggest step is what misled every previous reader of this boot:
 *
 *   own     — wall time in steps where our code was RUNNING. Shortening our code shortens this.
 *   foreign — long-task time inside `await:` steps. The boot was SUSPENDED; another task held
 *             the main thread. Shortening `initBuilders` does not move this by one millisecond;
 *             the fix is to stop WAITING for it, or to stop the other task from running here.
 *   idle    — `await:` wall time with no long task in it: a genuine round trip or a starved
 *             callback queue, not CPU.
 */
export function endBootLeg(leg: string): void {
    const span = _tracer.startSpan('pryzm.boot-step-profile.endLeg');
    try {
        const state = _leg;
        if (state === null) return;
        _leg = null;
        try { state.observer?.disconnect(); } catch { /* already gone */ }

        const wallMs = state.lastAtMs - state.startedAtMs;
        const rows = state.steps.map((s) => ({
            step: s.step,
            ms: s.endMs - s.startMs,
            awaited: s.awaited,
            longTaskMs: _longTaskMsWithin(state, s.startMs, s.endMs),
        }));

        let ownMs = 0;
        let foreignMs = 0;
        let idleMs = 0;
        for (const r of rows) {
            if (r.awaited) {
                foreignMs += r.longTaskMs;
                idleMs += Math.max(0, r.ms - r.longTaskMs);
            } else {
                ownMs += r.ms;
            }
        }

        const observed = state.observer !== null || state.longTasks.length > 0;
        console.log(
            `[§STARTUP-BUILDERS-LEG] ══ leg "${leg}" — ${wallMs.toFixed(0)}ms wall ══ ` +
            `own ${ownMs.toFixed(0)}ms · foreign ${foreignMs.toFixed(0)}ms · idle ${idleMs.toFixed(0)}ms` +
            (observed ? '' : ' (longtask observer UNAVAILABLE — foreign/idle cannot be separated in this browser)'),
        );
        // Sorted by cost: the reader wants the offender, not the chronology, and the chronology
        // is recoverable from the call order in the source.
        const sorted = rows.slice().sort((a, b) => b.ms - a.ms);
        console.table(
            sorted.map((r) => ({
                step: r.step,
                'ms': Math.round(r.ms),
                'kind': r.awaited ? 'AWAIT (suspended)' : 'own code',
                'longtask ms': Math.round(r.longTaskMs),
            })),
        );
        if (foreignMs > ownMs && foreignMs > 250) {
            console.warn(
                `[§STARTUP-BUILDERS-LEG] ⭐ ${foreignMs.toFixed(0)}ms of this leg was OTHER main-thread ` +
                `work running while the boot was suspended at an await — against ${ownMs.toFixed(0)}ms of ` +
                'the boot\'s own code. Making this leg\'s code faster CANNOT fix that; the boot must stop ' +
                'waiting here, or the competing work must not run here.',
            );
        }
    } finally {
        span.end();
    }
}

/**
 * TEST-ONLY seam — inject a long-task observation into the open leg.
 *
 * `longtask` is not implemented by happy-dom (nor by Firefox or Safari), so the overlap
 * arithmetic in `_longTaskMsWithin` — the part that decides whether an 18-second task is
 * attributed to the step it straddles or silently dropped — is unreachable from a spec without
 * this. Named `__`-prefixed and documented as a seam, following `__resetEagerGlobeStart`.
 */
export function __pushLongTaskForTest(startMs: number, durationMs: number): void {
    const span = _tracer.startSpan('pryzm.boot-step-profile.pushLongTaskForTest');
    try {
        _leg?.longTasks.push({ startMs, durationMs });
    } finally {
        span.end();
    }
}

/** TEST-ONLY seam — drop any open leg so one spec cannot leak state into the next. */
export function __resetBootStepProfile(): void {
    const span = _tracer.startSpan('pryzm.boot-step-profile.reset');
    try {
        try { _leg?.observer?.disconnect(); } catch { /* already gone */ }
        _leg = null;
    } finally {
        span.end();
    }
}
