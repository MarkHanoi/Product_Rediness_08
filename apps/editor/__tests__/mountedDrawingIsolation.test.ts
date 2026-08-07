// §C13-MOUNTED-DRAWING-OWNER — C13 §3.8/§3.10 owner gate for the ONE THREE group
// that the documentation pipeline parents into the shared 3D scene.
//
// THE FOUNDER'S REPRODUCTION (2026-08-07, production build main-r_Pba4Ji.js)
// ─────────────────────────────────────────────────────────────────────────
//   work in project A (draw walls) → back to the hub → create a NEW project
//   ⇒ the new project's 3D pane still drew a dotted L-shaped polyline — "the
//     projection of some walls" — while its PLAN pane showed the empty state,
//     "Add walls to see the floor plan".
//
// The two panes disagreeing is the whole diagnosis, not a curiosity. They read
// DIFFERENT HALVES OF ONE SURFACE:
//
//   PLAN pane → viewTechnicalDrawingCache.get(viewId)   (PlanViewCanvas.ts:352)
//   3D   pane → the THREE scene
//
// and the C13 render-side teardown cleared only the first. `ViewController`
// `scene.add(...)`s the drawing's group (ViewController.ts:1767) and detaches it
// only in `_unmountDrawing()`, whose three callers are all VIEW ACTIVATION —
// ViewController subscribes to no project lifecycle event whatsoever. So the
// switch disposed the drawing, emptied the cache, and left the group parented to
// the incoming project's scene.
//
// WHY THIS IS A SOURCE-TEXT GATE, like gisProjectIsolationOwnerGate.test.ts:
// `ViewController.ts` drags in OBC/THREE/DOM and cannot be imported under this
// suite's node environment — and it is exactly the file the defect lived in. The
// alternative to pinning its lifecycle wiring in source is not pinning it at all,
// which is how this surface reached a founder report with no owner. The behaviour
// of the OWNER MODULE itself is unit-tested for real, below.
//
// THE PROBE, STATED AS A MEASUREMENT (all four fail on the parent commit):
//   grep ViewController.ts for 'pryzm-project-switch'        → 0
//   grep ViewController.ts for 'bim-project-cleared'         → 0
//   grep ViewController.ts for 'projectScopeRegistry'        → 0
//   grep ViewTechnicalDrawingCache.clear() body for 'remove' → 0
// Four independent teardown mechanisms, none of which reached this group.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    noteDrawingMounted,
    noteDrawingUnmounted,
    clearMountedDrawing,
    getMountedDrawingOwningProjectId,
    describeMountedDrawing,
    _resetMountedDrawingScopeForTest,
} from '../src/engine/views/mountedDrawingScope';

const APP = resolve(__dirname, '..');
const read = (rel: string): string => readFileSync(resolve(APP, rel), 'utf8');

// ── 1. The owner module actually detaches, and answers honestly ──────────────

describe('§C13-MOUNTED-DRAWING-OWNER — the owner module', () => {
    beforeEach(() => {
        _resetMountedDrawingScopeForTest();
        // This suite runs in the node environment; the module resolves the owning
        // project through `window.runtime`, so give it a window to read (or not).
        (globalThis as unknown as { window?: unknown }).window = globalThis;
        delete (globalThis as unknown as { runtime?: unknown }).runtime;
    });

    it('answers null when nothing is mounted — the only clean answer', () => {
        expect(getMountedDrawingOwningProjectId()).toBeNull();
        expect(describeMountedDrawing().mounted).toBe(false);
    });

    it('DETACHES the group on the C13 clear — the founder case', () => {
        const detach = vi.fn();
        noteDrawingMounted(detach, 'view-plan-L0');

        clearMountedDrawing();

        expect(detach).toHaveBeenCalledTimes(1);
        expect(getMountedDrawingOwningProjectId()).toBeNull();
    });

    it('is idempotent — a second clear is a no-op, not a second detach', () => {
        const detach = vi.fn();
        noteDrawingMounted(detach);
        clearMountedDrawing();
        clearMountedDrawing();
        expect(detach).toHaveBeenCalledTimes(1);
    });

    it('drops the handle even when detach THROWS (§L-676-B)', () => {
        // A throwing detach must never leave the module convinced it still owns a
        // group it no longer does — that would make the NEXT switch a silent no-op.
        noteDrawingMounted(() => { throw new Error('scene disposed'); });
        expect(() => clearMountedDrawing()).not.toThrow();
        expect(getMountedDrawingOwningProjectId()).toBeNull();
    });

    it('stamps the mount with the project it belongs to, so the audit can SEE a leak', () => {
        (globalThis as unknown as { runtime?: unknown }).runtime = { audit: { projectId: 'proj-A' } };
        noteDrawingMounted(vi.fn(), 'view-plan-L0');
        // Project B is now loading; the probe must still name A.
        expect(getMountedDrawingOwningProjectId()).toBe('proj-A');
        expect(describeMountedDrawing()).toMatchObject({ mounted: true, viewId: 'view-plan-L0' });
    });

    it('§CONTEXT-DATA-HONESTY — an unattributable mount is NOT reported as clean', () => {
        // No runtime ⇒ the project cannot be resolved. "I hold nothing" and "I hold
        // something I cannot attribute" must not share a value (the L-713 mistake).
        noteDrawingMounted(vi.fn());
        expect(getMountedDrawingOwningProjectId()).toBe('<mounted-project-unresolved>');
        expect(getMountedDrawingOwningProjectId()).not.toBeNull();
    });

    it('the normal view-activation unmount clears ownership without a second detach', () => {
        const detach = vi.fn();
        noteDrawingMounted(detach);
        noteDrawingUnmounted();            // ViewController._unmountDrawing did the work
        clearMountedDrawing();             // …so the C13 clear has nothing to do
        expect(detach).not.toHaveBeenCalled();
        expect(getMountedDrawingOwningProjectId()).toBeNull();
    });

    it('registers BOTH a teardown entry and an audit probe, at module scope', () => {
        const src = read('src/engine/views/mountedDrawingScope.ts');
        // Column 0 = an unconditional import side effect (ADR-0298 gate D6): the only
        // registration whose ABSENCE proves the module never loaded.
        expect(src).toMatch(/^projectScopeRegistry\.register\(/m);
        expect(src).toMatch(/^registerProjectScopeProbe\(/m);
        expect(src).toContain("scopeName: 'views.mountedDrawing'");
        expect(src).toContain("scope: 'views.mountedDrawing'");
    });
});

// ── 2. REACHABILITY — the owner must actually be WIRED, not merely authored ──
//
// "Authored-but-unwired is the bottleneck": a scope that nothing calls is the same
// value as a scope that does not exist. These assertions are what make the module
// above load-bearing rather than decorative.

describe('§C13-MOUNTED-DRAWING-OWNER — ViewController hands the mount to the owner', () => {
    const src = read('src/engine/ViewController.ts');

    it('imports the owner module', () => {
        expect(src).toContain("from './views/mountedDrawingScope'");
        expect(src).toContain('noteDrawingMounted');
        expect(src).toContain('noteDrawingUnmounted');
    });

    it('notes the mount in the SAME body that calls scene.add', () => {
        const mount = src.slice(
            src.indexOf('private _mountDrawing('),
            src.indexOf('private _unmountDrawing('),
        );
        expect(mount).toContain('scene.add(');
        expect(mount).toContain('noteDrawingMounted(');
    });

    it('notes the unmount in the SAME body that calls scene.remove', () => {
        const unmountStart = src.indexOf('private _unmountDrawing(');
        const unmount = src.slice(unmountStart, unmountStart + 1200);
        expect(unmount).toContain('scene.remove(');
        expect(unmount).toContain('noteDrawingUnmounted(');
    });
});

describe('§C13-MOUNTED-DRAWING-OWNER — the render-side teardown detaches it', () => {
    const src = read('src/engine/initScene.ts');

    it('imports and calls clearMountedDrawing()', () => {
        expect(src).toContain("from './views/mountedDrawingScope'");
        expect(src).toContain('clearMountedDrawing()');
    });

    /** The body of the `pryzm-project-switch` render-side teardown handler. */
    const switchHandler = (): string => {
        const start = src.indexOf("events?.on('pryzm-project-switch'");
        expect(start).toBeGreaterThan(-1);
        return src.slice(start, start + 6000);
    };

    it('detaches the group in the SAME teardown block that clears the drawing CACHE', () => {
        // These two are the two readers of ONE surface. Clearing the cache without
        // detaching the group IS the founder's bug, so they must never drift apart:
        // whoever deletes one must trip over the other.
        const body = switchHandler();
        const cacheClear = body.indexOf('viewTechnicalDrawingCache.clear()');
        const detach = body.indexOf('clearMountedDrawing()');
        expect(cacheClear).toBeGreaterThan(-1);
        expect(detach).toBeGreaterThan(cacheClear);
    });

    it('runs on pryzm-project-switch — the C13 §3.7 synchronous teardown trigger', () => {
        expect(switchHandler()).toContain('clearMountedDrawing()');
    });
});

// ── 3. The measurement that was the root cause ──────────────────────────────

describe('§C13-MOUNTED-DRAWING-OWNER — the cache cannot do this job (why a new owner)', () => {
    it('ViewTechnicalDrawingCache.clear() disposes drawings but never touches the scene', () => {
        // Its own doc-comment says "Called on project close / project switch", which is
        // why it LOOKED like the owner. It is not: the cache never received the scene.
        // This assertion pins that fact, so a future reader does not re-delete the
        // detach call believing the cache already covers it.
        const cacheSrc = readFileSync(
            resolve(APP, '../../packages/core-app-model/src/views/ViewTechnicalDrawingCache.ts'),
            'utf8',
        );
        const clearStart = cacheSrc.indexOf('    clear(): void {');
        expect(clearStart).toBeGreaterThan(-1);
        const clearBody = cacheSrc.slice(clearStart, clearStart + 1400);
        expect(clearBody).toContain('this._cache.clear()');
        expect(clearBody).not.toContain('scene.remove');
        expect(cacheSrc).not.toContain('world.scene');
    });
});
