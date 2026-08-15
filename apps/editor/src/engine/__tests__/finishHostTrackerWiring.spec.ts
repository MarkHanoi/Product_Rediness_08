/**
 * §FINISH-FOLLOWS-WALL — EDITOR-SIDE WIRING REACHABILITY (GR-12 · C79 §5).
 *
 * WHY THIS SPEC EXISTS, in the editor and not the package: on 2026-08-13
 * `check-move-propagation` arms A5/A6 went GREEN while
 * `require.resolve('@pryzm/finish-host-tracker')` from `apps/editor` threw
 * MODULE_NOT_FOUND — the tracker package existed and was wired into NOTHING,
 * so the founder saw finishes NOT follow a moved wall while the gate said they
 * do. This spec asserts the three facts the gate could not see, from the
 * editor's own resolution context:
 *
 *   1. `@pryzm/finish-host-tracker` RESOLVES from apps/editor (the exact
 *      import initTools.ts now performs — this file sits in the same tree and
 *      resolves through the same apps/editor/node_modules link).
 *   2. `UpdateFloorBoundaryCommand` / `UpdateCeilingBoundaryCommand` are
 *      exported from the `@pryzm/command-registry` BARREL — they existed as
 *      files reachable from no export before this wiring landed.
 *   3. The EXACT construction shape initTools.ts uses — real trackers, the one
 *      real WallFaceResolver + SketchLoopIntersector, the REAL boundary
 *      commands via the same payload→command factory mapping — makes a wall
 *      move re-project a real FloorStore/CeilingStore boundary, exactly ONCE
 *      per move (§FINISH-TRACKER-REENTRANT-SET, f5f312de).
 *
 * The wall store is the package suite's probe double (the SUBJECT of the move,
 * never the source of the answer); everything downstream of the wall event is
 * the production class. Fixtures mirror the package suite's proven room
 * (6 × 4 m, walls 0.2 m, finish ring inset 0.1 m → 22.04 m²; north wall +2 m
 * → 33.64 m²) so the two suites can be cross-read.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

// FACT 1 — these specifiers resolving from apps/editor IS part of the assertion.
import {
    FloorHostDependencyTracker,
    CeilingHostDependencyTracker,
    signedAreaXZ,
    type FinishBoundaryWritePayload,
    type FinishCommandManagerRef,
    type XZ,
} from '@pryzm/finish-host-tracker';
// FACT 2 — the barrel, not a deep path: initTools.ts imports these from the barrel.
import {
    UpdateFloorBoundaryCommand,
    UpdateCeilingBoundaryCommand,
    buildRoomFinishBoundarySketch,
} from '@pryzm/command-registry';
import { WallFaceResolver, SketchLoopIntersector } from '@pryzm/geometry-slab';
import { FloorStore, CeilingStore, type FloorData, type CeilingData } from '@pryzm/core-app-model/stores';

// ── probe wall store (the package suite's double, verbatim shape) ────────────

type ProbeWall = { id: string; baseLine: { x: number; y: number; z: number }[]; thickness: number };
type WallEvent = 'add' | 'update' | 'remove';
type Listener = (e: WallEvent, w: ProbeWall, prev?: ProbeWall) => void;

class ProbeWallStore {
    private walls = new Map<string, ProbeWall>();
    private listeners: Listener[] = [];
    seed(w: ProbeWall): void { this.walls.set(w.id, w); }
    getById(id: string): ProbeWall | undefined { return this.walls.get(id); }
    subscribe(cb: Listener): () => void {
        this.listeners.push(cb);
        return () => { this.listeners = this.listeners.filter((l) => l !== cb); };
    }
    move(id: string, dx: number, dz: number): void {
        const w = this.walls.get(id);
        if (!w) throw new Error(`probe wall "${id}" not seeded`);
        const prev: ProbeWall = { ...w, baseLine: w.baseLine.map((p) => ({ ...p })) };
        w.baseLine = w.baseLine.map((p) => ({ x: p.x + dx, y: p.y, z: p.z + dz }));
        for (const l of this.listeners) l('update', w, prev);
    }
    remove(id: string): void {
        const w = this.walls.get(id);
        if (!w) return;
        this.walls.delete(id);
        for (const l of this.listeners) l('remove', w);
    }
}

const RING: XZ[] = [
    { x: 0.1, z: 0.1 },
    { x: 5.9, z: 0.1 },
    { x: 5.9, z: 3.9 },
    { x: 0.1, z: 3.9 },
];

let walls: ProbeWallStore;

function seedRoom(store: ProbeWallStore): void {
    const w = (id: string, x0: number, z0: number, x1: number, z1: number): ProbeWall => ({
        id,
        baseLine: [{ x: x0, y: 0, z: z0 }, { x: x1, y: 0, z: z1 }],
        thickness: 0.2,
    });
    store.seed(w('w-south', 0, 0, 6, 0));
    store.seed(w('w-east', 6, 0, 6, 4));
    store.seed(w('w-north', 6, 4, 0, 4));
    store.seed(w('w-west', 0, 4, 0, 0));
}

function producedSketch() {
    return buildRoomFinishBoundarySketch(RING, 'room-1', {
        getRoomById: () => ({ boundingWallIds: ['w-south', 'w-east', 'w-north', 'w-west'] }),
        getWallById: (id: string) => {
            const w = walls.getById(id);
            return w
                ? { id: w.id, baseLine: w.baseLine.map((p) => ({ x: p.x, z: p.z })), thickness: w.thickness }
                : undefined;
        },
    });
}

function finishFloor(id: string): FloorData {
    const s = producedSketch();
    return {
        id,
        type: 'floor',
        levelId: 'L0',
        label: `Floor-${id}`,
        floorNumber: `F.${id}`,
        boundary: { polygon: RING.map((p) => ({ ...p })), baseOffset: 0.015, thickness: 0.015, detectionMethod: 'from-room' },
        sketch: { outerLoop: s.outerLoop },
        finishSpec: { exposedScreed: false },
        serviceHoles: [],
        coveredRoomIds: [],
        boundingWallIds: s.boundingWallIds,
        hostRoomId: 'room-1',
        visible: true,
        properties: {},
        metadata: { createdAt: Date.now(), modifiedAt: Date.now(), createdBy: 'test', version: 1 },
    } as unknown as FloorData;
}

function finishCeiling(id: string): CeilingData {
    const s = producedSketch();
    return {
        id,
        type: 'ceiling',
        levelId: 'L0',
        label: `Ceiling-${id}`,
        ceilingNumber: `C.${id}`,
        boundary: { polygon: RING.map((p) => ({ ...p })), height: 2.5, thickness: 0.05, baseOffset: 0, detectionMethod: 'from-room' },
        sketch: { outerLoop: s.outerLoop },
        finishSpec: { exposedStructure: false },
        holeElements: [],
        coveredRoomIds: [],
        boundingWallIds: s.boundingWallIds,
        hostRoomId: 'room-1',
        visible: true,
        properties: {},
        ifcData: { guid: `guid-${id}`, ifcClass: 'IfcCovering', predefinedType: 'CEILING' },
        metadata: { createdAt: Date.now(), modifiedAt: Date.now(), createdBy: 'test', version: 1 },
    } as unknown as CeilingData;
}

const areaOf = (polygon: ReadonlyArray<XZ>): number => Math.abs(signedAreaXZ(polygon));

// ── the initTools.ts wiring shape, replicated with the REAL commands ─────────
// (initTools.ts:~840 — same geometry pair, same commandManagerRef late-binding
// shape, same payload→command factory mapping with only the id key renamed.)

const finishGeometryServices = { resolver: WallFaceResolver, intersector: SketchLoopIntersector };

function makeCmRef(context: unknown): FinishCommandManagerRef & { executions: number } {
    const ref = {
        executions: 0,
        current: {
            getContext: () => context,
            execute: (cmd: unknown) => {
                ref.executions += 1;
                return (cmd as { execute(ctx: unknown): unknown }).execute(context);
            },
        },
    };
    return ref;
}

beforeEach(() => {
    walls = new ProbeWallStore();
    seedRoom(walls);
    // WallFaceResolver reads window.wallStore (its documented TASK-08 seam) —
    // in the editor initBuilders/initTools assign it; here the probe does.
    (window as unknown as { wallStore: unknown }).wallStore = walls;
    vi.spyOn(console, 'warn');
});

afterEach(() => {
    delete (window as unknown as { wallStore?: unknown }).wallStore;
    vi.restoreAllMocks();
});

describe('§FINISH-FOLLOWS-WALL editor wiring — the initTools construction shape, real commands, real stores', () => {
    it('a moved wall re-projects a real floor boundary ONCE, through UpdateFloorBoundaryCommand', () => {
        const floorStore = new FloorStore();
        const context = { stores: { floorStore } };
        const cmRef = makeCmRef(context);

        const tracker = new FloorHostDependencyTracker(
            floorStore, walls, finishGeometryServices, cmRef,
            (payload: FinishBoundaryWritePayload) => new UpdateFloorBoundaryCommand({
                floorId: payload.elementId,
                mode: payload.mode,
                polygon: payload.polygon,
                outerLoopEdges: payload.outerLoopEdges,
                cause: payload.cause,
            }),
        );
        floorStore.add(finishFloor('fl-wired'));

        expect(areaOf(floorStore.getById('fl-wired')!.boundary.polygon)).toBeCloseTo(22.04, 6);
        walls.move('w-north', 0, 2);

        const stored = floorStore.getById('fl-wired')!;
        expect(areaOf(stored.boundary.polygon)).toBeCloseTo(33.64, 6);
        expect(Math.max(...stored.boundary.polygon.map((p) => p.z))).toBeCloseTo(5.9, 6);
        // §FINISH-TRACKER-REENTRANT-SET (f5f312de) — exactly ONE command per move.
        expect(cmRef.executions).toBe(1);
        // Command path, never the audible direct-write fallback.
        expect(vi.mocked(console.warn).mock.calls.filter((c) => String(c[0]).includes('NOT be undoable'))).toHaveLength(0);
        tracker.dispose();
    });

    it('a removed wall degrades the floor sketch through the UNDOABLE command; geometry stays (C79 §4.1/§4.2)', () => {
        const floorStore = new FloorStore();
        const context = { stores: { floorStore } };
        const cmRef = makeCmRef(context);
        const tracker = new FloorHostDependencyTracker(
            floorStore, walls, finishGeometryServices, cmRef,
            (payload: FinishBoundaryWritePayload) => new UpdateFloorBoundaryCommand({
                floorId: payload.elementId,
                mode: payload.mode,
                polygon: payload.polygon,
                outerLoopEdges: payload.outerLoopEdges,
                cause: payload.cause,
            }),
        );
        floorStore.add(finishFloor('fl-degrade'));

        walls.remove('w-north');

        const stored = floorStore.getById('fl-degrade')!;
        expect(areaOf(stored.boundary.polygon)).toBeCloseTo(22.04, 6);
        const edges = stored.sketch!.outerLoop.edges;
        expect(edges.filter((e) => e.type === 'hostReference')).toHaveLength(3);
        expect(edges[2]!.type).toBe('freeLine');
        expect(cmRef.executions).toBe(1);
        tracker.dispose();
    });

    it('a moved wall re-projects a real ceiling boundary ONCE, through UpdateCeilingBoundaryCommand', () => {
        const ceilingStore = new CeilingStore();
        const context = { stores: { ceilingStore } };
        const cmRef = makeCmRef(context);

        const tracker = new CeilingHostDependencyTracker(
            ceilingStore, walls, finishGeometryServices, cmRef,
            (payload: FinishBoundaryWritePayload) => new UpdateCeilingBoundaryCommand({
                ceilingId: payload.elementId,
                mode: payload.mode,
                polygon: payload.polygon,
                outerLoopEdges: payload.outerLoopEdges,
                cause: payload.cause,
            }),
        );
        ceilingStore.add(finishCeiling('cl-wired'));

        walls.move('w-north', 0, 2);

        expect(areaOf(ceilingStore.getById('cl-wired')!.boundary.polygon)).toBeCloseTo(33.64, 6);
        expect(cmRef.executions).toBe(1);
        tracker.dispose();
    });
});

// ── FACT 4 — the wiring itself cannot vanish silently ────────────────────────
//
// WHY THIS BLOCK EXISTS, and why the three tests above do not already cover it.
// The tests above REPLICATE the initTools.ts construction shape; they do not READ
// it. Measured 2026-08-15, repo-wide: if the wiring block at initTools.ts:853-890
// were deleted, NOTHING in this estate would turn red —
//   · these three specs construct their own trackers (L198/L227/L255) and stay green;
//   · no test anywhere imports or executes initTools / the composition root;
//   · the three specs that DO read initTools.ts as source text grep for
//     `__pryzmInitComplete`, the `floor.created` bridge, and a `window.*Store`
//     writer allowlist — none for these trackers;
//   · check-move-propagation A5/A6 count consumers of the SYMBOLS
//     `Floor/CeilingHostReferenceEdge`, which initTools.ts does not contain at all
//     — its whole count comes from packages/finish-host-tracker/, which survives
//     the deletion untouched.
// The only breakage would be `noUnusedLocals` complaining about dangling imports —
// compiler hygiene, not a behavioural guard, and it disappears if the imports are
// deleted alongside the block.
//
// That is the EXACT recurrence path of L-860 ("floor finish and ceiling DO NOT
// ADAPT when the wall moves"), whose diagnosis was that this package had zero
// wiring sites. The package was authored, correct, tested — and reachable from
// nothing, which every static instrument read as present. This block makes the
// reachability itself an assertion, so the capability cannot be un-wired in
// silence a second time.
//
// This is a SOURCE-TEXT guard, which is weaker than execution — it proves the
// call sites are written, not that they run. It is here because the alternative
// (booting the real composition root in a unit test) is not available, and a weak
// guard over an ungated capability beats none. The `#4b` control below is what
// keeps it from being a tautology.

// `import.meta.url` is NOT a file: URL under this vite/happy-dom runner, so the
// path is resolved from cwd instead. This spec is claimed by the ROOT
// vitest.config.ts (`apps/editor/src/engine/__tests__/**/*.spec.ts`), i.e. cwd is
// the repo root; the second candidate keeps it working if it is ever run from
// apps/editor. Resolution FAILING LOUDLY is deliberate — a guard that silently
// skipped when it could not find its subject would be the very defect class this
// block exists to catch.
const INIT_TOOLS_PATH = (() => {
    const candidates = [
        resolvePath(process.cwd(), 'apps/editor/src/engine/initTools.ts'),
        resolvePath(process.cwd(), 'src/engine/initTools.ts'),
    ];
    const found = candidates.find((p) => existsSync(p));
    if (!found) throw new Error(`initTools.ts not found; looked in:\n  ${candidates.join('\n  ')}`);
    return found;
})();

/**
 * Comments are stripped before matching, for the reason
 * check-no-empty-means-unknown's own control states: a gate must not measure its
 * own changelog. The prose at initTools.ts:853-861 names these very trackers, so
 * an un-wiring that left the comment behind would otherwise still read as wired.
 *
 * The `//` scan is string-naive: a `//` inside a string literal truncates that
 * line early. Stated rather than hidden — the error direction is SAFE, because
 * removing text can only make a needle harder to find, i.e. it can produce a
 * false FAILURE and never a false pass.
 */
function stripComments(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map((line) => {
            const i = line.indexOf('//');
            return i === -1 ? line : line.slice(0, i);
        })
        .join('\n');
}

/** The facts that together mean "a moved wall reaches a finish, through a command". */
const WIRING_NEEDLES = [
    'new FloorHostDependencyTracker(',
    'floorHostDependencyTracker.bootstrap()',
    'new CeilingHostDependencyTracker(',
    'ceilingHostDependencyTracker.bootstrap()',
    // The COMMAND path (P6 / C79 §4.2) — without these the trackers could still be
    // constructed while every write silently degraded to the declared
    // non-undoable direct-store fallback.
    'new UpdateFloorBoundaryCommand(',
    'new UpdateCeilingBoundaryCommand(',
] as const;

describe('§FINISH-FOLLOWS-WALL — initTools.ts reachability is itself asserted (L-860 recurrence guard)', () => {
    const code = stripComments(readFileSync(INIT_TOOLS_PATH, 'utf8'));

    it('#4a — initTools.ts constructs BOTH finish trackers, bootstraps both, and routes both through the boundary COMMANDS', () => {
        for (const needle of WIRING_NEEDLES) {
            expect(code, `initTools.ts no longer contains \`${needle}\` — §FINISH-FOLLOWS-WALL has been un-wired`).toContain(needle);
        }

        // bootstrap() is what FILLS the dependency graph (check-move-propagation:364
        // — the event path alone never populates it), so a construction whose
        // bootstrap was dropped would leave the graph permanently empty: wired to
        // the eye, dead in the product. Assert the ORDER, not merely the presence.
        expect(code.indexOf('floorHostDependencyTracker.bootstrap()'))
            .toBeGreaterThan(code.indexOf('new FloorHostDependencyTracker('));
        expect(code.indexOf('ceilingHostDependencyTracker.bootstrap()'))
            .toBeGreaterThan(code.indexOf('new CeilingHostDependencyTracker('));
    });

    it('#4b — EXECUTED CONTROL: the same predicate FAILS on a copy with the wiring block excised (this guard can fail)', () => {
        // A guard that cannot fail asserts nothing — the lesson of edec6838 in this
        // very package, where the §REENTRANT-SET guard was UNPROVEN because a thrown
        // cap could not escape a DOM event listener. Build the mutant this guard is
        // meant to catch and prove the predicate rejects it.
        const start = code.indexOf('const finishGeometryServices');
        const endAnchor = 'ceilingHostDependencyTracker.bootstrap();';
        const end = code.indexOf(endAnchor);
        expect(start, 'wiring block start anchor not found').toBeGreaterThan(-1);
        expect(end, 'wiring block end anchor not found').toBeGreaterThan(start);

        const mutant = code.slice(0, start) + code.slice(end + endAnchor.length);

        // The mutant is the real un-wiring: block gone, everything else intact.
        expect(mutant.length).toBeLessThan(code.length);
        for (const needle of WIRING_NEEDLES) {
            expect(mutant, `control failed: \`${needle}\` survived excision, so #4a would pass an un-wired tree`).not.toContain(needle);
        }
    });
});
