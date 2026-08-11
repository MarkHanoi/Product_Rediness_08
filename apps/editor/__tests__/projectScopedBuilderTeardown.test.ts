/**
 * §C13-BUILDER-SCENE-CLEAR — every builder that parents roots into the shared THREE
 * scene is swept at a project switch, and the sweep says what it could not sweep.
 *
 * THE DEFECT THIS PINS
 * ────────────────────
 * `initTools.ts` disposed FOUR builders on `bim-project-cleared` (wall, floor-finish,
 * handrail, stair-railing — §FIX-BUILDER-ISOLATION-LEAK / L-320). `initBuilders.ts`
 * constructs NINETEEN. The remaining fifteen were swept only indirectly, by the
 * per-element `bim-*-removed` events `ClearProjectCommand` fires while emptying the
 * stores — the very path L-320 documented as abortable mid-teardown. Project A's
 * linework, furniture boxes, lights and slabs therefore reached Project B's scene.
 *
 * AND WHY THE OBVIOUS FIX WOULD HAVE BEEN WORSE
 * `dispose()` is TERMINAL on several of these builders (StairMeshBuilder drops its
 * `_disposers`, LightingFragmentBuilder its `_unsubDayNight`, SlabFragmentBuilder its
 * view subscription) and on FurnitureFragmentBuilder it removes no roots at all.
 * Blanket-disposing at a switch would have left the INCOMING project unrendered —
 * L-224's dead-listener bug, re-created one layer down. Hence a separate, non-terminal
 * verb: `clearProjectGeometry()`.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    clearProjectScopedBuilderGeometry,
    formatBuilderTeardownReport,
} from '../src/engine/projectScopedBuilderTeardown';

const APP = resolve(__dirname, '..');
const read = (rel: string): string => readFileSync(resolve(APP, rel), 'utf8');

// ── 1. The sweep itself ─────────────────────────────────────────────────────

describe('§C13-BUILDER-SCENE-CLEAR — clearProjectScopedBuilderGeometry', () => {
    it('clears every builder and reports each by name', () => {
        const a = { clearProjectGeometry: vi.fn() };
        const b = { clearProjectGeometry: vi.fn() };
        const r = clearProjectScopedBuilderGeometry([
            { name: 'slabBuilder', builder: a },
            { name: 'furnitureBuilder', builder: b },
        ]);
        expect(a.clearProjectGeometry).toHaveBeenCalledTimes(1);
        expect(b.clearProjectGeometry).toHaveBeenCalledTimes(1);
        expect(r.cleared).toEqual(['slabBuilder', 'furnitureBuilder']);
        expect(r.noApi).toEqual([]);
        expect(r.failed).toEqual([]);
    });

    it('NEVER calls dispose() by default — a terminal dispose here is a new L-224', () => {
        // The whole point of the separate verb. A builder that exposes only dispose()
        // must be reported as UNSWEPT, not disposed on a hunch.
        const terminal = { dispose: vi.fn() };
        const r = clearProjectScopedBuilderGeometry([{ name: 'stairMeshBuilder', builder: terminal }]);
        expect(terminal.dispose).not.toHaveBeenCalled();
        expect(r.cleared).toEqual([]);
        expect(r.noApi).toEqual(['stairMeshBuilder.clearProjectGeometry']);
    });

    it('uses an explicitly declared alternative verb when one is given', () => {
        const legacy = { removeAll: vi.fn(), clearProjectGeometry: vi.fn() };
        clearProjectScopedBuilderGeometry([
            { name: 'roomBoundaryBuilder', builder: legacy, via: 'removeAll' },
        ]);
        expect(legacy.removeAll).toHaveBeenCalledTimes(1);
        expect(legacy.clearProjectGeometry).not.toHaveBeenCalled();
    });

    it('isolates a throwing builder — one failure never stops the rest of the sweep', () => {
        const boom = { clearProjectGeometry: () => { throw new Error('device lost'); } };
        const after = { clearProjectGeometry: vi.fn() };
        const r = clearProjectScopedBuilderGeometry([
            { name: 'lightingBuilder', builder: boom },
            { name: 'doorBuilder', builder: after },
        ]);
        expect(after.clearProjectGeometry).toHaveBeenCalledTimes(1);
        expect(r.failed).toEqual([{ name: 'lightingBuilder', error: 'device lost' }]);
        expect(r.cleared).toEqual(['doorBuilder']);
    });

    it('§CONTEXT-DATA-HONESTY — "absent", "no API" and "cleared" are three values, not one', () => {
        const r = clearProjectScopedBuilderGeometry([
            { name: 'present', builder: { clearProjectGeometry: vi.fn() } },
            { name: 'absent', builder: null },
            { name: 'blind', builder: {} },
        ]);
        expect(r.cleared).toEqual(['present']);
        expect(r.absent).toEqual(['absent']);
        expect(r.noApi).toEqual(['blind.clearProjectGeometry']);
    });
});

describe('§C13-BUILDER-SCENE-CLEAR — the log line confesses', () => {
    it('a fully-swept run states the fraction and nothing alarming', () => {
        const line = formatBuilderTeardownReport({ cleared: ['a', 'b'], absent: [], noApi: [], failed: [] });
        expect(line).toContain('2/2 builder(s) cleared');
        expect(line).not.toContain('⚠');
    });

    it('an unswept builder is named IN the line — not merely omitted from the successes', () => {
        const line = formatBuilderTeardownReport({
            cleared: ['a'], absent: ['b'], noApi: ['c.clearProjectGeometry'], failed: [{ name: 'd', error: 'x' }],
        });
        expect(line).toContain('1/4 builder(s) cleared');
        expect(line).toContain('NOT SWEPT [c.clearProjectGeometry]');
        expect(line).toContain('FAILED [d: x]');
        expect(line).toContain('absent [b]');
    });
});

// ── 2. Simulated project switch: A's roots must not reach B ─────────────────
//
// A headless stand-in for the founder's flow. Builders hold roots in a fake scene
// exactly as the real ones do (a Map of id → root, `scene.remove` on clear); the
// switch fires the sweep; the scene must be empty and every builder registry drained.

interface FakeScene { children: unknown[]; remove(o: unknown): void }

const makeScene = (): FakeScene => ({
    children: [],
    remove(o: unknown) { this.children = this.children.filter(c => c !== o); },
});

/** Mirrors the real builder shape: a root map + a per-element remove + the C13 verb. */
class FakeBuilder {
    readonly roots = new Map<string, { id: string }>();
    constructor(private readonly scene: FakeScene) { }
    build(id: string): void {
        const root = { id };
        this.roots.set(id, root);
        this.scene.children.push(root);
    }
    remove(id: string): void {
        const root = this.roots.get(id);
        if (root) { this.scene.remove(root); this.roots.delete(id); }
    }
    clearProjectGeometry(): void {
        for (const id of [...this.roots.keys()]) this.remove(id);
    }
}

describe('§C13-BUILDER-SCENE-CLEAR — project A → project B leaves ZERO of A behind', () => {
    it('empties the scene AND every builder registry on the switch', () => {
        const scene = makeScene();
        const walls = new FakeBuilder(scene);
        const floors = new FakeBuilder(scene);
        const linework = new FakeBuilder(scene);   // the black plan drawing
        const furniture = new FakeBuilder(scene);  // the floating grey boxes

        // Project A: walls + a floor + plan linework + furniture.
        walls.build('w1'); walls.build('w2');
        floors.build('f1');
        linework.build('rbl-1');
        furniture.build('fu1');
        expect(scene.children).toHaveLength(5);

        // Switch to empty project B.
        const r = clearProjectScopedBuilderGeometry([
            { name: 'wallBuilder', builder: walls },
            { name: 'floorBuilder', builder: floors },
            { name: 'roomBoundingLineBuilder', builder: linework },
            { name: 'furnitureBuilder', builder: furniture },
        ]);

        expect(scene.children).toEqual([]);
        expect(walls.roots.size).toBe(0);
        expect(floors.roots.size).toBe(0);
        expect(linework.roots.size).toBe(0);
        expect(furniture.roots.size).toBe(0);
        expect(r.noApi).toEqual([]);
        expect(r.failed).toEqual([]);
    });

    it('is idempotent — a duplicate project-switch event is a no-op, not a crash', () => {
        const scene = makeScene();
        const b = new FakeBuilder(scene);
        b.build('x');
        const entries = [{ name: 'b', builder: b }];
        clearProjectScopedBuilderGeometry(entries);
        expect(() => clearProjectScopedBuilderGeometry(entries)).not.toThrow();
        expect(scene.children).toEqual([]);
    });
});

// ── 3. REACHABILITY — the sweep must be WIRED, not merely authored ──────────
//
// "Authored-but-unwired is the bottleneck": a sweep nothing calls is the same value
// as a sweep that does not exist. `initBuilders.ts` cannot be imported under this
// suite (THREE + DOM + twenty workspace packages), and it is exactly the file the
// defect lived in — so its wiring is pinned as source text, like
// `gisProjectIsolationOwnerGate.test.ts` and `mountedDrawingIsolation.test.ts`.

describe('§C13-BUILDER-SCENE-CLEAR — initBuilders wires the sweep', () => {
    const src = read('src/engine/initBuilders.ts');

    it('subscribes the sweep to bim-project-cleared', () => {
        expect(src).toContain("from './projectScopedBuilderTeardown'");
        const start = src.indexOf("addEventListener('bim-project-cleared'");
        expect(start).toBeGreaterThan(-1);
        const body = src.slice(start, start + 3000);
        expect(body).toContain('clearProjectScopedBuilderGeometry(');
        expect(body).toContain('formatBuilderTeardownReport(');
    });

    it('registers EVERY builder that parents roots into the shared scene', () => {
        // The list this asserts is the list `initBuilders` returns. If a new builder is
        // added to the return and not to the sweep, that is the L-320 defect again, so
        // this test must fail rather than let it through silently.
        const start = src.indexOf("addEventListener('bim-project-cleared'");
        const body = src.slice(start, start + 3000);
        for (const name of [
            'slabBuilder', 'ceilingBuilder', 'floorBuilder', 'columnBuilder', 'beamBuilder',
            'roofBuilder', 'plumbingBuilder', 'furnitureBuilder', 'lightingBuilder',
            'doorBuilder', 'windowBuilder', 'stairMeshBuilder', 'stairLandingBuilder',
            'liftMeshBuilder', 'roomBoundingLineBuilder', 'roomBoundaryBuilder',
            'roomLabelRenderer',
        ]) {
            expect(body, `${name} missing from the C13 sweep`).toContain(`builder: ${name}`);
        }
    });
});

describe('§C13-BUILDER-SCENE-CLEAR — every swept builder implements the verb', () => {
    const PKG = resolve(APP, '../../packages');
    const readPkg = (rel: string): string => readFileSync(resolve(PKG, rel), 'utf8');

    // Source-text, not import: these modules pull in THREE (P2 — only renderer-three
    // may) and cannot be loaded under a node-environment suite.
    it.each([
        ['geometry-beam/src/BeamFragmentBuilder.ts'],
        ['geometry-column/src/ColumnFragmentBuilder.ts'],
        ['geometry-roof/src/RoofFragmentBuilder.ts'],
        ['geometry-plumbing/src/PlumbingFragmentBuilder.ts'],
        ['geometry-slab/src/SlabFragmentBuilder.ts'],
        ['geometry-slab/src/ceiling/CeilingPanelBuilder.ts'],
        ['geometry-slab/src/floor/FloorPanelBuilder.ts'],
        ['geometry-furniture/src/FurnitureFragmentBuilder.ts'],
        ['geometry-lighting/src/LightingFragmentBuilder.ts'],
        ['geometry-door/src/DoorBuilder.ts'],
        ['geometry-window/src/WindowBuilder.ts'],
        ['geometry-stair/src/StairMeshBuilder.ts'],
        ['geometry-stair/src/StairLandingBuilder.ts'],
        ['geometry-lift/src/LiftMeshBuilder.ts'],
        ['geometry-wall/src/RoomBoundingLineBuilder.ts'],
    ])('%s exposes clearProjectGeometry()', (rel) => {
        expect(readPkg(rel)).toMatch(/\n\s*clearProjectGeometry\(\): void \{/);
    });
});
