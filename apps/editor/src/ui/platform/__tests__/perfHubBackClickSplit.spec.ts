/**
 * @vitest-environment happy-dom
 */
// §PERF-HUB-BOOT (2026-09-03) — THE PIN for the back-hub dwell/machine split.
//
// The founder's paste read `[§STARTUP-BUDGET] hub:mount-start +76753ms (t+82680ms)` after
// clicking back-hub from an open project — and read as a 77-second hub boot. It was not:
// `markStartupPhase` deltas are measured against the PREVIOUS MARK of the run, no mark
// existed at the back-hub gesture, and so that delta spanned the tail of the project open
// (t+5,927 ms) plus his ENTIRE editing session. The marks that followed in the same paste
// (hub:warm-start +36ms, hub:grid-painted +104ms, hub:sync-done +103ms) already proved the
// hub fast once mounted. This is §CONTEXT-DATA-HONESTY applied to a stopwatch, in the
// RETURN direction of the exact defect `hub:open-clicked` closed (L-11440, PERF100).
//
// TWO ARMS:
//   A. SEMANTICS — reproduces the misreading against the real startupBudget module with a
//      controlled clock (75 s of dwell lands inside hub:mount-start's delta when no gesture
//      mark exists), then proves the fix's split (with hub:back-clicked at the gesture, the
//      dwell lands in the gesture mark's delta and hub:mount-start carries only the
//      navigation cost). If someone deletes the mark, arm B fails; if someone changes the
//      delta semantics, arm A fails.
//   B. SOURCE PIN — PlatformRouter's `pryzm-go-hub` window listener must call
//      `markStartupPhase('hub:back-clicked')` BEFORE it reaches `showHub` (which emits
//      `hub:mount-start`). Pinned at source level because importing PlatformRouter drags the
//      engine-warmup graph into a unit test; precedent: mt05StoreIdentityHeap.spec.ts et al.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    beginStartupBudget,
    markStartupPhase,
    getStartupBudgetMarks,
} from '@app/engine/startupBudget';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('§PERF-HUB-BOOT A — dwell is attributable only if the gesture is marked', () => {
    it('without a gesture mark, hub:mount-start swallows the editing dwell (the founder misreading)', () => {
        let t = 0;
        vi.spyOn(performance, 'now').mockImplementation(() => t);

        beginStartupBudget();                       // t0
        t = 5_927; markStartupPhase('enter-canvas'); // tail of the project open
        t = 82_664;                                 // ← 76.7 s of HUMAN editing dwell, no mark
        t = 82_680; markStartupPhase('hub:mount-start');

        const marks = getStartupBudgetMarks();
        const mount = marks.find((m) => m.phase === 'hub:mount-start')!;
        // The delta is against the PREVIOUS MARK — dwell and machine work are one value.
        expect(Math.round(mount.sincePrevMs)).toBe(76_753);
        expect(Math.round(mount.sinceStartMs)).toBe(82_680);
    });

    it('with hub:back-clicked at the gesture, hub:mount-start carries only the navigation cost', () => {
        let t = 0;
        vi.spyOn(performance, 'now').mockImplementation(() => t);

        beginStartupBudget();
        t = 5_927; markStartupPhase('enter-canvas');
        t = 82_664; markStartupPhase('hub:back-clicked'); // the gesture, marked
        t = 82_680; markStartupPhase('hub:mount-start');

        const marks = getStartupBudgetMarks();
        const back = marks.find((m) => m.phase === 'hub:back-clicked')!;
        const mount = marks.find((m) => m.phase === 'hub:mount-start')!;
        // Dwell lands on the gesture mark (human), nav cost on the mount mark (machine).
        expect(Math.round(back.sincePrevMs)).toBe(76_737);
        expect(Math.round(mount.sincePrevMs)).toBe(16);
    });
});

describe('§PERF-HUB-BOOT B — the gesture mark exists on the back-hub choke point', () => {
    it('PlatformRouter marks hub:back-clicked inside the pryzm-go-hub listener, before showHub', () => {
        const src = readFileSync(
            resolve(__dirname, '../PlatformRouter.ts'),
            'utf8',
        );
        const listenerStart = src.indexOf("window.addEventListener('pryzm-go-hub'");
        expect(listenerStart).toBeGreaterThan(-1);
        // The listener body ends where the next platform-lifetime listener begins.
        const listenerEnd = src.indexOf("window.addEventListener('pryzm-sign-out'", listenerStart);
        expect(listenerEnd).toBeGreaterThan(listenerStart);
        const body = src.slice(listenerStart, listenerEnd);

        const markIdx = body.indexOf("markStartupPhase('hub:back-clicked')");
        const showHubIdx = body.indexOf('showHub(');
        expect(markIdx).toBeGreaterThan(-1);
        expect(showHubIdx).toBeGreaterThan(-1);
        // The gesture must be marked BEFORE showHub runs — showHub emits hub:mount-start,
        // and the split only exists if the gesture mark precedes it in the same sync stack.
        expect(markIdx).toBeLessThan(showHubIdx);
    });

    it('hub:mount-start is still emitted by showHub (the other half of the split)', () => {
        const src = readFileSync(
            resolve(__dirname, '../PlatformRouter.ts'),
            'utf8',
        );
        expect(src.includes("markStartupPhase('hub:mount-start')")).toBe(true);
    });
});
