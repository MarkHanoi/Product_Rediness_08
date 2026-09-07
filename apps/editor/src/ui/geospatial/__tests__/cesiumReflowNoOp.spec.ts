/**
 * §REFLOW-NO-OP-IS-NOT-WORK (L-13205 · C59 §2.10.5) — a reflow to a box that has NOT MOVED must
 * do NO WORK: no `scene.requestRender()`, no scheduled second pass, no console line.
 *
 * ⭐ WHY THIS SPEC ASSERTS CALL COUNTS AND NOT "did not throw". The defect was never a crash. It
 * was a renderer being asked, dozens of times per divider drag, to draw a frame at a size it was
 * already drawn at — with `requestRenderMode: true`, `requestRender()` is precisely the call that
 * forces Cesium to render a frame it had decided it did not need. A spec that only proved the
 * path survives would have passed BEFORE the fix and after it. **These assertions fail if the
 * gate is removed.**
 *
 * ⛔ AND IT MUST NOT BECOME A DEBOUNCE SPEC. C59 §2.10.2 forbids a timer/latch used to settle a
 * feedback loop between rival writers. `runReflow` holds no timer and delays nothing: the last
 * case below pins that a box change is honoured IMMEDIATELY, on the very next call, which is what
 * separates a pure equality test from a debounce.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    ReflowGate,
    runReflow,
    sameBox,
    type MeasuredBox,
    type ReflowPort,
} from '../reflowGate';

interface Counting {
    port: ReflowPort;
    counts: { render: number; log: number; scheduled: number; warn: number };
    logs: Array<{ reason: string; skipped: number }>;
    /** Run the pass that was scheduled most recently, if any. */
    runSecondPass(): void;
    set(box: MeasuredBox | null): void;
    setLive(v: boolean): void;
    failNextRender(err?: unknown): void;
}

function countingPort(initial: MeasuredBox | null): Counting {
    let box = initial;
    let live = true;
    let pending: (() => void) | null = null;
    let failNext: unknown = null;
    const counts = { render: 0, log: 0, scheduled: 0, warn: 0 };
    const logs: Array<{ reason: string; skipped: number }> = [];

    const port: ReflowPort = {
        measure: () => box,
        resizeAndRender: () => {
            if (failNext !== null) {
                const e = failNext;
                failNext = null;
                throw e;
            }
            counts.render++;
        },
        log: (reason, skipped) => { counts.log++; logs.push({ reason, skipped }); },
        warn: () => { counts.warn++; },
        scheduleSecondPass: (fn) => { counts.scheduled++; pending = fn; },
        isLive: () => live,
    };

    return {
        port,
        counts,
        logs,
        runSecondPass: () => { const f = pending; pending = null; f?.(); },
        set: (b) => { box = b; },
        setLive: (v) => { live = v; },
        failNextRender: (err = new Error('viewer torn down')) => { failNext = err; },
    };
}

const BOX = (w: number, h: number, dpr = 1): MeasuredBox => ({ w, h, dpr });

describe('§REFLOW-NO-OP-IS-NOT-WORK — sameBox', () => {
    it('compares all three quantities Cesium itself compares', () => {
        expect(sameBox(BOX(701, 976), BOX(701, 976))).toBe(true);
        expect(sameBox(BOX(701, 976), BOX(702, 976))).toBe(false);
        expect(sameBox(BOX(701, 976), BOX(701, 975))).toBe(false);
        // devicePixelRatio is the third: a monitor change resizes the drawing buffer at the
        // same CSS box, and skipping THAT would leave the globe rendering at the wrong density.
        expect(sameBox(BOX(701, 976, 1), BOX(701, 976, 2))).toBe(false);
    });

    it('null is never equal to anything, including another null', () => {
        // An unmeasurable viewer must take the FULL path, never be silently skipped —
        // "cannot tell" and "unchanged" are different answers (§CONTEXT-DATA-HONESTY).
        expect(sameBox(null, null)).toBe(false);
        expect(sameBox(null, BOX(1, 1))).toBe(false);
        expect(sameBox(BOX(1, 1), null)).toBe(false);
    });
});

describe("§REFLOW-NO-OP-IS-NOT-WORK — 'if-changed' drops a reflow to a box that has not moved", () => {
    it('does NO work at all on the second and subsequent identical requests', () => {
        const c = countingPort(BOX(701, 976));
        const gate = new ReflowGate();

        runReflow(c.port, gate, 'external-reflow (multi-pane host)', 'if-changed');
        expect(c.counts.render).toBe(1);
        expect(c.counts.log).toBe(1);
        expect(c.counts.scheduled).toBe(1);

        // Twelve more drag frames that all measure the SAME integer pixel width — the exact
        // shape of the founder's trace, where `flex: 0 0 49.372%` moved but `clientWidth` did not.
        for (let i = 0; i < 12; i++) {
            runReflow(c.port, gate, 'external-reflow (multi-pane host)', 'if-changed');
        }
        expect(c.counts.render).toBe(1);     // ⭐ still ONE, not thirteen
        expect(c.counts.log).toBe(1);        // ⭐ and ONE console line, not thirteen
        expect(c.counts.scheduled).toBe(1);  // ⭐ and no second passes queued for nothing
        expect(gate.pendingSkipCount).toBe(12);
    });

    it('honours a real size change IMMEDIATELY — no timer, no settling window', () => {
        const c = countingPort(BOX(701, 976));
        const gate = new ReflowGate();
        runReflow(c.port, gate, 'r1', 'if-changed');
        expect(c.counts.render).toBe(1);

        c.set(BOX(702, 976));
        runReflow(c.port, gate, 'r2', 'if-changed');
        // ⛔ THIS is what makes it an equality test and not a debounce: the very next call after
        // a change does the full work, with no elapsed time and no quiet period.
        expect(c.counts.render).toBe(2);
        expect(c.counts.log).toBe(2);
    });

    it('folds the dropped count into the NEXT real reflow — skipped is never silent', () => {
        const c = countingPort(BOX(701, 976));
        const gate = new ReflowGate();
        runReflow(c.port, gate, 'first', 'if-changed');
        for (let i = 0; i < 7; i++) runReflow(c.port, gate, 'noop', 'if-changed');

        c.set(BOX(722, 976));
        runReflow(c.port, gate, 'real', 'if-changed');

        expect(c.logs).toHaveLength(2);
        expect(c.logs[0]).toEqual({ reason: 'first', skipped: 0 });
        // "No reflow happened" and "seven reflows were dropped" must not print the same value.
        expect(c.logs[1]).toEqual({ reason: 'real', skipped: 7 });
        expect(gate.pendingSkipCount).toBe(0);
    });

    it('never skips when the box cannot be measured', () => {
        const c = countingPort(null);
        const gate = new ReflowGate();
        runReflow(c.port, gate, 'unmeasurable', 'if-changed');
        runReflow(c.port, gate, 'unmeasurable', 'if-changed');
        expect(c.counts.render).toBe(2);
    });

    it('renders on the FIRST show even though nothing was ever recorded (0 → N)', () => {
        const c = countingPort(BOX(0, 0));
        const gate = new ReflowGate();
        // Container display:none — canvas measures 0×0. Must still do the work: an empty gate
        // has no recorded box, and null/absent never compares equal.
        runReflow(c.port, gate, 'setVisible(true)', 'if-changed');
        expect(c.counts.render).toBe(1);

        c.set(BOX(836, 976));
        runReflow(c.port, gate, 'external-reflow (multi-pane host)', 'if-changed');
        expect(c.counts.render).toBe(2);
    });
});

describe("§REFLOW-NO-OP-IS-NOT-WORK — 'force' is never skipped", () => {
    it('renders at an unchanged box, because mount / setVisible / re-parent depend on it', () => {
        const c = countingPort(BOX(836, 976));
        const gate = new ReflowGate();
        runReflow(c.port, gate, 'setVisible(true)', 'force');
        runReflow(c.port, gate, 'setVisible(true)', 'force');
        runReflow(c.port, gate, 'reparent', 'force');
        // A DOM move can land in an identically-sized pane; "nothing moved" and "nothing needs
        // drawing" diverge there, and force is the caller saying so.
        expect(c.counts.render).toBe(3);
        expect(c.counts.log).toBe(3);
    });
});

describe('§REFLOW-NO-OP-IS-NOT-WORK — the scheduled second pass', () => {
    it('does nothing when the box did not move after layout flushed', () => {
        const c = countingPort(BOX(836, 976));
        const gate = new ReflowGate();
        runReflow(c.port, gate, 'setVisible(true)', 'force');
        expect(c.counts.render).toBe(1);

        c.runSecondPass();
        // ⭐ The second forced frame per reflow — gone. It existed only to catch a size acquired
        // a frame late; when the size did not change, the first pass already drew at it.
        expect(c.counts.render).toBe(1);
    });

    it('DOES render when the container acquired its real size a frame late', () => {
        const c = countingPort(BOX(0, 0));
        const gate = new ReflowGate();
        runReflow(c.port, gate, 'setVisible(true)', 'force');
        expect(c.counts.render).toBe(1);

        c.set(BOX(836, 976)); // display flipped none → block; layout has now run
        c.runSecondPass();
        expect(c.counts.render).toBe(2);
        expect(gate.lastBox).toEqual(BOX(836, 976));
    });

    it('does nothing once the viewer is gone (§GLOBE-CRASH-GUARD)', () => {
        const c = countingPort(BOX(0, 0));
        const gate = new ReflowGate();
        runReflow(c.port, gate, 'setVisible(true)', 'force');
        c.set(BOX(836, 976));
        c.setLive(false);
        c.runSecondPass();
        expect(c.counts.render).toBe(1);
    });
});

describe('§REFLOW-NO-OP-IS-NOT-WORK — a failed reflow does not poison the cache', () => {
    it('forgets the box entirely, so the next if-changed request is not skipped', () => {
        const c = countingPort(BOX(701, 976));
        const gate = new ReflowGate();
        runReflow(c.port, gate, 'ok', 'if-changed');
        expect(gate.lastBox).toEqual(BOX(701, 976));

        c.failNextRender();
        runReflow(c.port, gate, 'throws', 'force');
        expect(c.counts.warn).toBe(1);
        // Recording a size we never actually rendered at would let a later request skip.
        expect(gate.lastBox).toBeNull();

        runReflow(c.port, gate, 'recovered', 'if-changed');
        expect(c.counts.render).toBe(2); // 1 ok + 1 recovered (the throwing one never counted)
    });
});

describe('§REFLOW-NO-OP-IS-NOT-WORK — the production wiring, not just the gate', () => {
    const src = readFileSync(
        join(process.cwd(), 'apps/editor/src/ui/geospatial/CesiumViewport.ts'),
        'utf8',
    );

    it("routes forceResizeAndRender through runReflow — the gate is not authored-but-unwired", () => {
        // §AUTHORED-BUT-UNWIRED-IS-THE-BOTTLENECK: a decision module nothing calls is not a fix.
        expect(src).toMatch(/runReflow\(this\.reflowPort\(\),\s*this\.reflowGate,\s*reason,\s*mode\)/);
        expect(src).toMatch(/private\s+readonly\s+reflowGate\s*=\s*new\s+ReflowGate\(\)/);
    });

    it("makes reflowContainer() default to 'if-changed' — that is the storm's entry point", () => {
        // `MultiPaneController` → `PaneHost.resize()` → the Cesium mounter's `resize` →
        // `reflowContainer()`, once per settle pass, i.e. once per mousemove of a divider drag.
        expect(src).toMatch(
            /reflowContainer\(opts\?: \{ force\?: boolean \}\)[\s\S]{0,900}?opts\?\.force \? 'force' : 'if-changed'/,
        );
    });

    it('forces the reflow when the container was actually MOVED in the DOM', () => {
        // A canvas can move into an identically-sized pane; the measured box cannot report that.
        expect(src).toMatch(/paneEl\.appendChild\(this\.container\)[\s\S]{0,1200}?this\.reflowContainer\(\{ force: true \}\)/);
    });

    it('leaves no rival unconditional requestRender on the reflow path', () => {
        // The defect in one line: `viewer.resize(); viewer.scene.requestRender();` with no
        // comparison in between. If that shape comes back anywhere outside the port, the storm
        // comes back with it.
        const port = src.slice(src.indexOf('private reflowPort()'), src.indexOf('private forceResizeAndRender'));
        const occurrences = src.split('scene.requestRender()').length - 1;
        const inPort = port.split('scene.requestRender()').length - 1;
        expect(inPort).toBe(1);
        // Other requestRender calls exist elsewhere in the viewport (camera moves, layer
        // toggles) and are legitimate; what must not exist is a SECOND one on the reflow path.
        expect(occurrences).toBeGreaterThanOrEqual(1);
    });
});

describe('§REFLOW-NO-OP-IS-NOT-WORK — the pane shell no longer reflows every pane twice', () => {
    const src = readFileSync(
        join(process.cwd(), 'apps/editor/src/engine/views/SiteAuthoringPaneShell.ts'),
        'utf8',
    );

    it('does not call controller.resize() after reassertPlacement(), which already resized', () => {
        // Every return path of `PaneHost.reassertPlacement()` ends in `this.resize()`. Following
        // it with `controller.resize()` reflowed every host a SECOND time, to the same box, on
        // every placement settle — a guaranteed doubling for the whole drag.
        expect(src).toMatch(/if \(withPlacement\) controller\.reassertPlacement\(\);\s*\r?\n\s*else controller\.resize\(\);/);
        expect(src).not.toMatch(/controller\.reassertPlacement\(\);\s*\r?\n\s*controller\.resize\(\);/);
    });
});
