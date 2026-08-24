// §STARTUP-BUDGET (founder 2026-08-07: "speed up ideally 5× the complete project start-up
// process — from the Cesium earth rendering much quicker — but SPECIALLY from the moment the
// user clicks after adding the location") — the startup pipeline as ONE measured budget.
//
// WHY THIS EXISTS
// ---------------
// The startup path crosses five subsystems (onboarding overlay → globe entry → geocode →
// context/catastro fetches → site commit → canvas), and every one of them has its OWN local
// timing log. What did not exist was a single table: phase → ms, cold, end to end. Without it,
// every performance claim about startup is an anecdote, and every regression is invisible until
// the founder reports it. This module is that table. A 5× claim (or a 1.3× claim) is made
// against THESE numbers or it is not made at all.
//
// WHAT IT IS (and is deliberately not)
// ------------------------------------
// A passive mark recorder. `markStartupPhase('geocode:end')` records `performance.now()` and
// logs one short line; `reportStartupBudget()` prints the whole run as a table once, when the
// startup pipeline reaches the usable editor (§ENTER-CANVAS) — or whenever a caller decides the
// run is over. It changes NO behaviour: no phase is gated, delayed, retried or skipped because
// of a mark. It holds no timers (P3), touches no DOM/window (P4), and is DOM-free so it can be
// unit-tested directly.
//
// THE PHASE VOCABULARY (stable names — the next regression is only measurable if the names
// don't drift): onboarding:shown · cesium:warm-start/-done · location-step:open ·
// globe:camera-host-ready · geocode:start/end · context-warm:start/done ·
// flight:parcel-arrival · reveal:content-ready · reveal:flight-settled · reveal:split-mounted ·
// parcel:committed · envelope:dispatched · enter-canvas. Add phases; do not rename them.
//
// ⭐ ADDED 2026-08-24 (lane EARTH31, §STARTUP-GLOBE-PREWARM / §STARTUP-BOOT-STAGES, L-10560) —
// two families, both because the founder's own run had a 2.5-second hole in it that no mark
// named:
//
//   · globe:prewarm-start / globe:prewarm-done — the Cesium viewport's CONSTRUCTION + MOUNT,
//     which now begins at the onboarding seam instead of at the tail of the engine boot. Read
//     `globe:prewarm-done` against `globe:eager-init-start`: the gap between them is the boot
//     time the globe NO LONGER SPENDS WAITING. (`globe:eager-init-start/-done` are retained and
//     unchanged — on the prewarmed path they now bracket an ADOPTION, not a construction, so a
//     near-zero delta there is the success signal, not a missing measurement.)
//
//   · boot:engine-start · boot:scene-done · boot:builders-done · boot:tools-done ·
//     boot:bus-handlers-done · boot:data-platform-done · boot:ui-done — the engine boot's own
//     stages. Before these, `onboarding:shown +0ms` was followed by `globe:eager-init-start
//     +2633ms` with NOTHING named in between, so "which stage costs the 2.5 s?" could only be
//     guessed at. These name it. They map 1:1 onto SPEC-PROJECT-OPEN-CREATE-PIPELINE §3's
//     O4/O5/O6/O9/O7/O8 rows, deliberately, so a reading here is quotable against that spec.
//
// ⛔ These are MARKS, not gates. Adding one must never change what runs or in what order — the
// "passive mark recorder" clause above is the whole contract of this module.
//
// P8: every exported function carries an OTel span.

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.startup-budget');

export interface StartupBudgetMark {
    readonly phase: string;
    /** `performance.now()` at the mark. */
    readonly atMs: number;
    /** Milliseconds since the previous mark of this run. */
    readonly sincePrevMs: number;
    /** Milliseconds since the run began. */
    readonly sinceStartMs: number;
}

let _marks: StartupBudgetMark[] = [];
let _startedAtMs: number | null = null;
let _reported = false;

const now = (): number =>
    typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

/**
 * Start (or restart) a startup-budget run. Called at the earliest point of the pipeline we can
 * see (`PlatformRouter.showOnboarding`). Restarting discards the previous run's marks — one run
 * per project-startup attempt, so a second "New Project" measures fresh instead of appending.
 */
export function beginStartupBudget(): void {
    const span = _tracer.startSpan('pryzm.startup-budget.begin');
    try {
        _marks = [];
        _startedAtMs = now();
        _reported = false;
        console.log('[§STARTUP-BUDGET] run started (t0).');
    } finally {
        span.end();
    }
}

/**
 * Record one named phase boundary. Cheap (one `performance.now()`, one array push, one log
 * line) and safe to call from anywhere — a mark that arrives before `beginStartupBudget()`
 * auto-begins a run so a pipeline entered by an unforeseen path is still measured rather than
 * silently dropped.
 */
export function markStartupPhase(phase: string): void {
    const span = _tracer.startSpan('pryzm.startup-budget.mark');
    try {
        if (_startedAtMs === null) {
            _startedAtMs = now();
            _marks = [];
            _reported = false;
        }
        const at = now();
        const prevAt = _marks.length > 0 ? _marks[_marks.length - 1]!.atMs : _startedAtMs;
        const mark: StartupBudgetMark = {
            phase,
            atMs: at,
            sincePrevMs: at - prevAt,
            sinceStartMs: at - _startedAtMs,
        };
        _marks.push(mark);
        console.log(
            `[§STARTUP-BUDGET] ${phase} +${mark.sincePrevMs.toFixed(0)}ms (t+${mark.sinceStartMs.toFixed(0)}ms)`,
        );
    } finally {
        span.end();
    }
}

/** The current run's marks — read-only, for tests and for the report. */
export function getStartupBudgetMarks(): readonly StartupBudgetMark[] {
    const span = _tracer.startSpan('pryzm.startup-budget.getMarks');
    try {
        return _marks.slice();
    } finally {
        span.end();
    }
}

/**
 * Print the whole run as one table. Once per run (idempotent — the pipeline has several
 * "arrived" signals and only the first should report); a run with no marks reports nothing.
 * `trigger` names the phase that ended the run (normally `enter-canvas`).
 */
export function reportStartupBudget(trigger: string): void {
    const span = _tracer.startSpan('pryzm.startup-budget.report');
    try {
        if (_reported || _marks.length === 0 || _startedAtMs === null) return;
        _reported = true;
        const total = _marks[_marks.length - 1]!.sinceStartMs;
        console.log(
            `[§STARTUP-BUDGET] ══ run complete (trigger=${trigger}) — total ${total.toFixed(0)}ms ══`,
        );
        // console.table renders aligned in every browser devtools; the map keeps it to the three
        // columns a human compares across runs.
        console.table(
            _marks.map((m) => ({
                phase: m.phase,
                'Δ prev (ms)': Math.round(m.sincePrevMs),
                't+ (ms)': Math.round(m.sinceStartMs),
            })),
        );
    } finally {
        span.end();
    }
}
