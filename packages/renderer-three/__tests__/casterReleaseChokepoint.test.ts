/**
 * §GPU-CASTER-RELEASE-CHOKEPOINT (L-1290) — the DERIVED shadow-caster guard, and
 * the gate that keeps the derivation TRUE.
 *
 * ═══ WHY A DERIVED GUARD, AND WHAT "DERIVED" HAS TO EARN ═══════════════════
 *
 * `apps/editor/src/engine/geometryMutationEvents.ts` answers *"which mutation
 * changes the shadow caster set?"* by ENUMERATING BIM events. That list is
 * gated, disjoint and complete against the event catalogue — and it still only
 * covers a route that ANNOUNCES ITSELF. The founder lost his viewport to the
 * same `Destroyed texture [Texture "ShadowDepthTexture"] used in a submit` five
 * times in one week, once per newly exercised route (nav · whole-load · wall
 * commit · tier ceiling · handrail retype), and the fifth recurrence arrived
 * through the GENERIC `element.updateParameters` bridge — a verb no per-family
 * event list is shaped to cover.
 *
 * So the arm moved to the point where the danger IS: the RELEASE. Every element
 * builder frees through `scheduleGpuRelease` / `detachAndReleaseChildren`
 * because ADR-0297 INVARIANT L2 made that the only legal way to free
 * element-owned GPU memory. A route that forgets to announce itself is still
 * guarded, because it cannot free a caster's mesh without passing through here.
 *
 * ⭐ THAT ARGUMENT IS ONLY AS GOOD AS THE FUNNEL'S COMPLETENESS. A builder that
 * disposes in place bypasses the derivation silently — and `StairLandingBuilder`
 * was doing exactly that when this was written. ARM C is therefore not a
 * stylistic lint: it is the PREMISE of the derivation, measured from the
 * filesystem rather than from a list a human maintains. Without it, this file
 * would be asserting an architecture it had not established.
 *
 * CONTRACTS: C04 §GPU-RESOURCE-LIFETIME · ADR-0297 · ADR-0111 · C84 EI-4a.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';
import {
    setShadowCasterReleaseObserver,
    hasShadowCasterReleaseObserver,
    subtreeHasShadowCaster,
    scheduleGpuRelease,
    drainGpuReleaseQueue,
    pendingGpuReleaseCount,
} from '../src/safeDispose.js';

const REPO_ROOT = resolve(__dirname, '../../..');

/** Force the manager into active-WebGPU state with a fake renderer, no real GPU. */
function armWebGpu(rpm: RenderPipelineManager): void {
    (rpm as unknown as { _webGpuActive: boolean })._webGpuActive = true;
    (rpm as unknown as { _renderer: unknown })._renderer = {
        shadowMap: { autoUpdate: true, needsUpdate: false },
    };
}
/** The boolean `render()` actually gates the WebGPU submit on. */
function submitsPaused(rpm: RenderPipelineManager): boolean {
    return (rpm as unknown as { _shadowRebuildPaused: boolean })._shadowRebuildPaused;
}
function freezeDepth(rpm: RenderPipelineManager): number {
    return (rpm as unknown as { _shadowReallocFreezeDepth: number })._shadowReallocFreezeDepth;
}

/** A minimal Object3D-shaped node — structural, so this file needs no THREE value import (P2). */
function node(opts: { mesh?: boolean; caster?: boolean; children?: unknown[] } = {}): any {
    return {
        isMesh: opts.mesh === true,
        castShadow: opts.caster === true,
        children: opts.children ?? [],
        traverse: () => { /* presence is what scheduleGpuRelease classifies on */ },
    };
}

describe('§GPU-CASTER-RELEASE-CHOKEPOINT — ARM A: the release funnel detects a caster', () => {
    beforeEach(() => { drainGpuReleaseQueue(); setShadowCasterReleaseObserver(null); });
    afterEach(() => { setShadowCasterReleaseObserver(null); drainGpuReleaseQueue(); });

    it('subtreeHasShadowCaster finds a caster at depth and EARLY-EXITS', () => {
        const deep = node({ children: [node({ children: [node({ mesh: true, caster: true })] })] });
        expect(subtreeHasShadowCaster(deep)).toBe(true);
        // A mesh that does not cast is not a caster; nor is a non-mesh with the flag.
        expect(subtreeHasShadowCaster(node({ children: [node({ mesh: true, caster: false })] }))).toBe(false);
        expect(subtreeHasShadowCaster(node({ children: [node({ mesh: false, caster: true })] }))).toBe(false);
        expect(subtreeHasShadowCaster(null)).toBe(false);
    });

    it('a caster release notifies ONCE per batch, and the next batch re-arms', () => {
        let n = 0;
        setShadowCasterReleaseObserver(() => { n++; });
        expect(hasShadowCasterReleaseObserver()).toBe(true);

        scheduleGpuRelease(node({ mesh: true, caster: true }));
        scheduleGpuRelease(node({ mesh: true, caster: true }));
        scheduleGpuRelease(node({ mesh: true, caster: true }));
        expect(n, 'one guard window per batch — 279 meshes must not be 279 windows').toBe(1);
        expect(pendingGpuReleaseCount()).toBe(3);

        drainGpuReleaseQueue();
        scheduleGpuRelease(node({ mesh: true, caster: true }));
        expect(n, 'a drained batch is a closed window; the next release must re-arm').toBe(2);
    });

    it('a NON-caster release never arms the window', () => {
        let n = 0;
        setShadowCasterReleaseObserver(() => { n++; });
        scheduleGpuRelease(node({ mesh: true, caster: false }));
        expect(n, 'a submit pause per non-caster edit would be cost with no safety').toBe(0);
        expect(pendingGpuReleaseCount(), 'the release still happens — only the WINDOW is skipped').toBe(1);
    });

    it('an observer that THROWS cannot strand the release', () => {
        setShadowCasterReleaseObserver(() => { throw new Error('observer exploded'); });
        expect(() => scheduleGpuRelease(node({ mesh: true, caster: true }))).not.toThrow();
        expect(pendingGpuReleaseCount(), 'a leak is recoverable; a stranded release is not').toBe(1);
    });
});

describe('§GPU-CASTER-RELEASE-CHOKEPOINT — ARM B: the frame owner opens the SAME window', () => {
    beforeEach(() => { vi.useFakeTimers(); drainGpuReleaseQueue(); setShadowCasterReleaseObserver(null); });
    afterEach(() => { vi.useRealTimers(); setShadowCasterReleaseObserver(null); drainGpuReleaseQueue(); });

    it('a caster release PAUSES submits, and the pause survives past the mutation tick', () => {
        const rpm = new RenderPipelineManager();
        armWebGpu(rpm);
        expect(submitsPaused(rpm)).toBe(false);

        // The arm the production `bind()` installs, invoked exactly as the funnel does.
        (rpm as unknown as { _onShadowCasterRelease: () => void })._onShadowCasterRelease();

        // ⛔ THE LOAD-BEARING ASSERTION. `runShadowCasterMutation`'s own doc block
        // records why a freeze alone is the wrong lever for a caster-set change:
        // there is no depth pass left to defer, so only PAUSING SUBMITS orders
        // three's release against the frames still in flight.
        expect(submitsPaused(rpm), 'the release window must pause submits, not merely freeze').toBe(true);
        expect(freezeDepth(rpm), 'and it composes through the SHARED ref-count, not a sixth latch').toBe(1);

        // Nothing un-pauses on its own tick — the window has to span the teardown.
        vi.advanceTimersByTime(50);
        expect(submitsPaused(rpm)).toBe(true);
    });

    it('the window is CLOSED at the frame boundary, deferred so the current frame stays unsubmitted', () => {
        const rpm = new RenderPipelineManager();
        armWebGpu(rpm);
        (rpm as unknown as { _onShadowCasterRelease: () => void })._onShadowCasterRelease();
        expect(submitsPaused(rpm)).toBe(true);

        // `render()` calls this immediately after `drainGpuReleaseQueue()`.
        (rpm as unknown as { _closeCasterReleaseWindowAtBoundary: () => void })
            ._closeCasterReleaseWindowAtBoundary();
        // Still paused ON THIS TICK: resuming synchronously would let THIS frame submit,
        // and this frame is precisely the one that must not.
        expect(submitsPaused(rpm), 'the resume must be DEFERRED, never synchronous').toBe(true);

        vi.advanceTimersByTime(0);
        expect(submitsPaused(rpm), 'the next frame submits against the settled caster set').toBe(false);
        // The freeze pops one macrotask LATER still — `_endShadowRebuildGuard` defers its
        // own thaw, so the single depth regen at the new caster set lands on an idle frame
        // rather than on the frame that just resumed submitting (ADR-0111).
        expect(freezeDepth(rpm), 'the thaw must trail the resume, never lead it').toBe(1);
        vi.runAllTimers();
        expect(freezeDepth(rpm), 'and it does eventually pop — a leaked freeze is L-205').toBe(0);
    });

    it('the window is BOUNDED — sustained churn cannot hold the viewport dark', () => {
        const rpm = new RenderPipelineManager();
        armWebGpu(rpm);
        (rpm as unknown as { _onShadowCasterRelease: () => void })._onShadowCasterRelease();
        // Keep the queue non-empty so the "drained" exit can never be taken.
        setShadowCasterReleaseObserver(null);
        scheduleGpuRelease(node({ mesh: true, caster: true }));
        expect(pendingGpuReleaseCount()).toBeGreaterThan(0);

        const close = (rpm as unknown as { _closeCasterReleaseWindowAtBoundary: () => void })
            ._closeCasterReleaseWindowAtBoundary.bind(rpm);
        // The cap is 8 consecutive frames; walk right up to it and one past.
        for (let i = 0; i < 7; i++) { close(); vi.advanceTimersByTime(0); }
        expect(submitsPaused(rpm), 'still guarded while within the frame budget').toBe(true);
        close();
        vi.advanceTimersByTime(0);
        expect(
            submitsPaused(rpm),
            'past the cap the guard DEGRADES to the batch-level freezes — an unbounded ' +
            'submit pause is a frozen viewport (the L-663 shape, one layer down)',
        ).toBe(false);
    });

    it('is inert on the WebGL2 fallback, which owns its own shadowMap', () => {
        const rpm = new RenderPipelineManager();
        (rpm as unknown as { _webGpuActive: boolean })._webGpuActive = false;
        (rpm as unknown as { _onShadowCasterRelease: () => void })._onShadowCasterRelease();
        expect(submitsPaused(rpm), 'a skipped frame on a path that needs no ordering is pure cost').toBe(false);
    });
});

describe('§GPU-CASTER-RELEASE-CHOKEPOINT — ARM C: the funnel is claimed, and nothing bypasses it', () => {
    it('the frame owner CLAIMS the observer slot on bind and GIVES IT BACK on dispose', () => {
        const src = readFileSync(
            resolve(REPO_ROOT, 'packages/renderer-three/src/pipeline/RenderPipelineManager.ts'), 'utf8',
        );
        expect(src).toMatch(/setShadowCasterReleaseObserver\(this\._onShadowCasterRelease\)/);
        expect(src).toMatch(/setShadowCasterReleaseObserver\(null\)/);
        // The close must sit in `render()` immediately after the boundary drain — anywhere
        // else and the window either never opens or never closes.
        const renderBody = src.slice(src.indexOf('render(delta = 0.016)'));
        const drainAt = renderBody.indexOf('drainGpuReleaseQueue();');
        const closeAt = renderBody.indexOf('_closeCasterReleaseWindowAtBoundary()');
        expect(drainAt, 'render() must drain the release queue').toBeGreaterThan(-1);
        expect(closeAt, 'render() must close the derived window').toBeGreaterThan(-1);
        expect(closeAt, 'the window closes AFTER the releases have actually happened')
            .toBeGreaterThan(drainAt);
    });

    /**
     * ⭐ THE ANTI-RECURRENCE GATE — and the PREMISE of the whole derivation.
     *
     * Derived by walking every `packages/geometry-<x>` src tree rather than from a list, so a
     * NEW element family cannot be born bypassing the funnel. Scoped to BUILDERS
     * and MANAGERS: those own the persisted element meshes that
     * `PascalSceneLighting._enableShadowsOnScene()` promotes to shadow casters.
     * Tools (`*Tool.ts`) own transient drawing previews and are a separate,
     * larger population — deliberately NOT swept in with these, because a gate
     * whose baseline is 78 is a gate nobody can move.
     *
     * ⛔ SHRINK-ONLY. Each remaining site frees a caster's GPU memory ON THE
     * MUTATION TICK, which is both an ADR-0297 L2 violation and invisible to the
     * guard above. Migrating one is mechanical (`traverse+dispose; clear()` →
     * `detachAndReleaseChildren(root)`, or `scheduleGpuRelease(mesh)`), so the
     * number goes DOWN. Never raise it to make a new builder pass.
     */
    it('no geometry BUILDER frees a mesh in place — the funnel has no bypass', () => {
        const walk = (dir: string, out: string[] = []): string[] => {
            for (const entry of readdirSync(dir)) {
                const p = join(dir, entry);
                if (statSync(p).isDirectory()) { walk(p, out); continue; }
                if (!/(Builder|Manager)\.ts$/.test(entry)) continue;
                if (/\.(test|spec)\.ts$/.test(entry)) continue;
                out.push(p);
            }
            return out;
        };

        const pkgRoot = resolve(REPO_ROOT, 'packages');
        const builders: string[] = [];
        for (const entry of readdirSync(pkgRoot)) {
            if (!entry.startsWith('geometry-')) continue;
            const src = join(pkgRoot, entry, 'src');
            try { if (statSync(src).isDirectory()) walk(src, builders); } catch { /* no src */ }
        }
        expect(builders.length, 'the sweep must actually find geometry builders').toBeGreaterThan(10);

        const IN_PLACE = /\.(geometry|materials?)\.dispose\(\)/g;
        const offenders: string[] = [];
        for (const file of builders) {
            const text = readFileSync(file, 'utf8');
            const hits = text.match(IN_PLACE);
            if (!hits) continue;
            offenders.push(`${file.slice(REPO_ROOT.length + 1).replace(/\\/g, '/')} (${hits.length})`);
        }
        offenders.sort();

        /**
         * BASELINE, measured 2026-08-19 (lane GPU1). It was EIGHT sites across five
         * files; `StairLandingBuilder` (2 of them) is closed by this change, which is
         * how a shrink-only ratchet is supposed to move. The rest are named so the
         * next lane inherits a list of work, not a mystery.
         */
        const BASELINE = [
            'packages/geometry-lift/src/LiftMeshBuilder.ts (1)',
            'packages/geometry-lighting/src/LightingFragmentBuilder.ts (1)',
            'packages/geometry-wall/src/WallFragmentBuilder.ts (1)',
            'packages/geometry-wall/src/WallJunctionInfillManager.ts (3)',
        ];

        const newOffenders = offenders.filter((o) => !BASELINE.includes(o));
        expect(
            newOffenders,
            'a builder that disposes a mesh IN PLACE frees GPU memory on the mutation tick ' +
            '(ADR-0297 L2) AND bypasses §GPU-CASTER-RELEASE-CHOKEPOINT, so the derived shadow ' +
            'guard never opens for it. Route the teardown through detachAndReleaseChildren() / ' +
            'scheduleGpuRelease() instead of extending this baseline.',
        ).toEqual([]);

        // Shrink-only in the other direction too: a name that leaves the baseline must
        // leave the BASELINE ARRAY, or the ratchet silently stops ratcheting.
        const stale = BASELINE.filter((b) => !offenders.includes(b));
        expect(
            stale,
            'these baseline entries no longer exist — delete them from BASELINE so the ' +
            'ceiling actually falls (a ratchet that keeps paid-off debt is not a ratchet)',
        ).toEqual([]);
    });
});
