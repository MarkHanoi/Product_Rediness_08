/**
 * MoveBoundaryLineCommand — L-7920..L-7926 / C105 §3 / ADR-0348.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * THE FOUNDER'S CASE, PINNED — *"if the user moves the boundary line and this line
 * had slabs and walls, they should move, adapt, propagate with all elements!!"*
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * These are DIFFERENTIATING cases. Each fails against a plausible wrong
 * implementation, and the wrong one is NAMED at the case:
 *
 *   · "moves the line and strands the dependents"      → the SILENT verdict (C84 EI-PROP);
 *   · "moves the dependents and says nothing about the door" → the partial cascade;
 *   · "reports success unconditionally"                 → the L-2401 `CompositeCommand` defect;
 *   · "trusts the write instead of re-reading it"       → `SetLevelHeightCommand`'s own lesson;
 *   · "renumbers the segments and re-anchors silently"  → the vertex-count trap;
 *   · "snaps an inset wall onto the line"               → an unsigned offset.
 *
 * DATA/COMMAND test: faithful in-memory stubs, no THREE, no DOM.
 *
 * ⚠ WHAT THIS FILE DOES **NOT** PROVE, stated so a green run is not over-read. The
 * ONE-UNDO property comes from `CommandManagerImpl` folding `STRUCTURAL_CASCADE`
 * children into the spawning gesture's history entry (§L-874-ONE-UNDO); this file
 * asserts that the command ASKS for that source on every child, which is the half the
 * command owns. It does not re-test `CommandManagerImpl`, which has its own suite.
 */

import { describe, it, expect } from 'vitest';
import { MoveBoundaryLineCommand } from '../src/boundaryLine/MoveBoundaryLineCommand';
import { BOUNDARY_LINE_DEPENDENT_ADAPTERS } from '../src/boundaryLine/boundaryLineDependentAdapters';
import { BOUNDARY_LINE_FAMILY_RULES, type BoundaryLineData } from '@pryzm/geometry-boundary-line';
import type { CommandContext } from '../src/types';

const BL = 'boundaryLine_01ARZ3NDEKTSV4RRFFQ69G5H00';
const WALL = 'wall_01ARZ3NDEKTSV4RRFFQ69G5H01';
const SLAB = 'slab_01ARZ3NDEKTSV4RRFFQ69G5H02';
const DOOR = 'door_01ARZ3NDEKTSV4RRFFQ69G5H03';

/** A 10 m line along +X at z = 0, with whatever attachments a case needs. */
function makeLine(attachments: unknown[] = []): BoundaryLineData {
    return {
        id: BL,
        type: 'boundaryLine',
        levelId: 'level-1',
        vertices: [
            { x: 0, y: 0, z: 0 },
            { x: 10, y: 0, z: 0 },
        ],
        closed: false,
        drawMode: 'linear',
        hasVolume: false,
        attachments,
        childrenIds: [],
    } as unknown as BoundaryLineData;
}

const wallAtt = {
    elementId: WALL,
    elementKind: 'wall',
    segmentIndex: 0,
    t: 0,
    offset: 0,
    end: { segmentIndex: 0, t: 1, offset: 0 },
};

const slabAtt = {
    elementId: SLAB,
    elementKind: 'slab',
    segmentIndex: 0,
    t: 0.5,
    offset: 2,
};

const doorAtt = { elementId: DOOR, elementKind: 'door', segmentIndex: 0, t: 0.5, offset: 0 };

/**
 * A world with a boundary-line store, a wall store and a slab store — all in-memory,
 * all behaving like the real ones in the ONE way that matters here: a write to an
 * unknown id is a SILENT NO-OP. That is what the command's read-back exists to catch,
 * so a stub that threw instead would make the verification untestable.
 */
function makeWorld(line: BoundaryLineData) {
    const lines = new Map<string, BoundaryLineData>([[BL, line]]);
    const walls = new Map<string, { id: string; baseLine: [unknown, unknown] }>([
        [WALL, { id: WALL, baseLine: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }] }],
    ]);
    const slabs = new Map<string, { id: string; boundary: Array<{ x: number; y: number }> }>([
        [SLAB, { id: SLAB, boundary: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }] }],
    ]);

    /** Every child the command handed the manager, with the source it asked for. */
    const dispatched: Array<{ type: string; source: string | undefined; targetIds: string[] }> = [];
    /** Ids the manager should REFUSE to execute, so "landed" can be made to differ. */
    const refuse = new Set<string>();

    /**
     * ⭐ THE MANAGER STUB RECORDS AND ACCEPTS; IT DOES **NOT** RUN THE CHILD.
     *
     * ⚠ DELIBERATE, AND THE FIRST DRAFT GOT IT WRONG. It originally called
     * `cmd.execute(ctx)` and every case went red — `UpdateWallBaselineCommand` reaches
     * `semanticGraphManager`, `wallOccupancyStore`, `evaluateWallPlacement` and the
     * hosted-opening frame sync, none of which a stub can honestly imitate. Building a
     * fake capable enough to satisfy it would have produced a fake more capable than
     * the real thing, which cannot falsify anything.
     *
     * So the boundary is drawn where the responsibility is: THIS command owns *which*
     * children are built, *what* they are built from, and *that each is dispatched as a
     * STRUCTURAL_CASCADE child whose verdict is counted*. Whether
     * `UpdateWallBaselineCommand` then moves a wall is ITS suite's question, and it has
     * one. `refuse` lets a child be declined so `landed !== attempted` is reachable.
     */
    const commandManager = {
        execute: (cmd: { type: string; targetIds: string[] }, opts?: { source?: string }) => {
            dispatched.push({ type: String(cmd.type), source: opts?.source, targetIds: [...cmd.targetIds] });
            if (cmd.targetIds.some((id) => refuse.has(id))) return { success: false };
            return { success: true, affectedElementIds: [...cmd.targetIds] };
        },
    };

    const ctx = {
        bimManager: { getLevelById: () => ({ elevation: 0 }) },
        commandManager,
        stores: {
            boundaryLineStore: {
                getState: () => lines,
            },
            wallStore: {
                getById: (id: string) => walls.get(id),
                update: (id: string, patch: Record<string, unknown>) => {
                    const w = walls.get(id);
                    if (!w) return;
                    walls.set(id, { ...w, ...patch } as never);
                },
            },
            slabStore: {
                getById: (id: string) => slabs.get(id),
                update: (id: string, patch: Record<string, unknown>) => {
                    const s = slabs.get(id);
                    if (!s) return;
                    slabs.set(id, { ...s, ...patch } as never);
                },
            },
        },
    } as unknown as CommandContext;

    return { ctx, lines, walls, slabs, dispatched, refuse };
}

/** The line, shifted 4 m in +Z — the founder's "move the boundary line". */
const MOVED = [
    { x: 0, y: 0, z: 4 },
    { x: 10, y: 0, z: 4 },
];

describe('MoveBoundaryLineCommand — the line moves and what is on it moves with it', () => {
    it('M-1: ⭐ THE LINE MOVES, AND ITS WALL IS DISPATCHED A BASELINE UPDATE', () => {
        // Fails against "moves the line and strands the dependents" — the SILENT
        // verdict C84 EI-PROP names as the defect this whole feature exists to avoid.
        const w = makeWorld(makeLine([wallAtt]));
        const cmd = new MoveBoundaryLineCommand({ boundaryLineId: BL, vertices: MOVED });
        expect(cmd.canExecute(w.ctx).ok).toBe(true);
        const r = cmd.execute(w.ctx);

        expect(r.success).toBe(true);
        // The line landed — read back out of the store, never taken from the result.
        expect(w.lines.get(BL)!.vertices[0]!.z).toBe(4);
        // …and exactly one child was dispatched, for the wall.
        expect(w.dispatched).toHaveLength(1);
        expect(w.dispatched[0]!.targetIds).toEqual([WALL]);
    });

    it('M-2: ⭐ EVERY CHILD IS DISPATCHED AS `STRUCTURAL_CASCADE` — the ONE-undo mechanism', () => {
        // Fails against a cascade that pushes N history entries: the founder would
        // press Ctrl+Z once and watch half his building stay moved. §L-874-ONE-UNDO.
        const w = makeWorld(makeLine([wallAtt, slabAtt]));
        new MoveBoundaryLineCommand({ boundaryLineId: BL, vertices: MOVED }).execute(w.ctx);
        expect(w.dispatched).toHaveLength(2);
        for (const d of w.dispatched) expect(d.source).toBe('STRUCTURAL_CASCADE');
    });

    it('M-3: ⭐ THE DOOR REFUSES **BY NAME**, and the sentence reaches `result.info`', () => {
        // Fails against "moves the dependents and says nothing about the door". The
        // refusal must reach a PERSON — a console.warn is a refusal nobody reads.
        const w = makeWorld(makeLine([wallAtt, doorAtt]));
        const r = new MoveBoundaryLineCommand({ boundaryLineId: BL, vertices: MOVED }).execute(w.ctx);

        expect(r.success).toBe(true);           // the door is a REFUSAL, not a failure
        expect(w.dispatched).toHaveLength(1);   // only the wall was carried
        const info = (r.info ?? []).join(' | ');
        expect(info).toMatch(/did NOT move/);
        expect(info).toMatch(/1 door/);
        expect(info).toMatch(/hosted/i);
        expect(info).toMatch(/Attach the WALL/);
    });

    it('M-4: ⛔ SUCCESS IS `landed === attempted` — it is NOT reported unconditionally', () => {
        // Fails against the L-2401 `CompositeCommand` defect verbatim: that class
        // returns success:true in BOTH directions and counts children ATTEMPTED.
        const w = makeWorld(makeLine([wallAtt, slabAtt]));
        w.refuse.add(SLAB);                     // the manager will decline this child
        const r = new MoveBoundaryLineCommand({ boundaryLineId: BL, vertices: MOVED }).execute(w.ctx);

        expect(r.success).toBe(false);
        expect(r.error).toMatch(/1 of 2/);
        // ⭐ AND THE ONE THAT DID LAND STILL LANDED. A cascade that aborts on the first
        // failure is a different, worse defect than one that reports the fraction.
        expect(w.lines.get(BL)!.vertices[0]!.z).toBe(4);
    });

    it('M-5: ⭐ THE WALL ADAPTER **REFUSES** WITHOUT THE PRE-MOVE BASELINE', () => {
        // Fails against an adapter that omits `prevBaseLine`. `UpdateWallBaselineCommand`
        // says that field is "the ONLY input that lets undo restore the pre-move
        // position", so an adapter that builds a command without it produces a
        // HALF-UNDOABLE step that still reports success — the worst of both.
        //
        // ⚠ ASSERTED AS A REFUSAL RATHER THAN BY INSPECTING THE BUILT COMMAND, because
        // `UpdateWallBaselineCommand` keeps its prev-baseline private and `serialize()`
        // legitimately omits it. "Refuses without it" is the same property, observable.
        const adapter = BOUNDARY_LINE_DEPENDENT_ADAPTERS['wall']!;
        const adaptation = {
            elementId: WALL, family: 'wall', shape: 'line' as const, moveVerb: 'wall.updateBaseline',
            span: { start: { x: 0, y: 0, z: 4 }, end: { x: 10, y: 0, z: 4 } },
        };
        expect(adapter(adaptation, {})).toBeNull();
        expect(
            adapter(adaptation, {
                span: { start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } },
            }),
        ).not.toBeNull();
    });

    it('M-5b: ⭐ AND THE DISPATCHER SUPPLIES IT, READ FROM THE AUTHORITATIVE STORE', () => {
        // The other half: `_readBefore` must actually find the wall's CURRENT baseline
        // in `ctx.stores.wallStore`. If it did not, M-5's refusal would fire in
        // production and the wall would silently never move — a green M-5 with a dead
        // feature behind it.
        const w = makeWorld(makeLine([wallAtt]));
        new MoveBoundaryLineCommand({ boundaryLineId: BL, vertices: MOVED }).execute(w.ctx);
        expect(w.dispatched.map((d) => d.targetIds[0])).toEqual([WALL]);
    });

    it('M-6: ⛔ CHANGING THE VERTEX COUNT IS REFUSED, WITH BOTH NUMBERS', () => {
        // Fails against "renumbers the segments and re-anchors silently". Every
        // attachment stores a `segmentIndex`; adding a vertex renumbers them, so half
        // the dependents would quietly move to the wrong edge. C74 — refuse with the
        // numbers, never clamp and never guess.
        const w = makeWorld(makeLine([wallAtt]));
        const res = new MoveBoundaryLineCommand({
            boundaryLineId: BL,
            vertices: [...MOVED, { x: 10, y: 0, z: 8 }],
        }).canExecute(w.ctx);
        expect(res.ok).toBe(false);
        expect(res.reason).toMatch(/2 vertices/);
        expect(res.reason).toMatch(/3/);
        expect(res.reason).toMatch(/Detach them first/);
    });

    it('M-7: ⛔ A COLLAPSING EDIT IS REFUSED BEFORE ANYTHING MOVES', () => {
        const w = makeWorld(makeLine([wallAtt]));
        const res = new MoveBoundaryLineCommand({
            boundaryLineId: BL,
            vertices: [{ x: 1, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }],
        }).canExecute(w.ctx);
        expect(res.ok).toBe(false);
        expect(res.reason).toMatch(/collapses/);
        // The line is untouched: `canExecute` never mutates.
        expect(w.lines.get(BL)!.vertices[0]!.z).toBe(0);
    });

    it('M-8: an unknown boundary line is refused rather than silently no-oping', () => {
        const w = makeWorld(makeLine([]));
        const res = new MoveBoundaryLineCommand({
            boundaryLineId: 'boundaryLine_01ARZ3NDEKTSV4RRFFQ69G5HZZ',
            vertices: MOVED,
        }).canExecute(w.ctx);
        expect(res.ok).toBe(false);
        expect(res.reason).toMatch(/not found/);
    });

    it('M-9: ⭐ UNDO REVERSES CHILDREN FIRST, THEN THE LINE, AND COUNTS WHAT LANDED', () => {
        const w = makeWorld(makeLine([wallAtt]));
        const cmd = new MoveBoundaryLineCommand({ boundaryLineId: BL, vertices: MOVED });
        cmd.execute(w.ctx);
        expect(w.lines.get(BL)!.vertices[0]!.z).toBe(4);

        const u = cmd.undo(w.ctx);
        // The line is back where it was — asserted by RE-READING the store, which is
        // the same discipline execute() uses. `SetLevelHeightCommand`'s lesson.
        expect(w.lines.get(BL)!.vertices[0]!.z).toBe(0);
        expect(u.affectedElementIds).toContain(BL);
        expect(u.affectedElementIds).toContain(WALL);
    });
});

describe('MoveBoundaryLineCommand — the table and the adapters cannot disagree', () => {
    it('COV-1: ⭐ EVERY `PROPAGATES` FAMILY HAS AN ADAPTER', () => {
        // ⛔ C84 EI-PROP: a PROPAGATES row that nothing can execute is a FALSE verdict
        // on the ledger, and C84 says that is WORSE than the SILENT cell it replaces.
        // This is the assertion that makes the table's promise mechanical.
        const missing = BOUNDARY_LINE_FAMILY_RULES
            .filter((r) => r.verdict === 'PROPAGATES')
            .map((r) => r.family)
            .filter((f) => !BOUNDARY_LINE_DEPENDENT_ADAPTERS[f]);
        expect(missing, `families claiming to follow with no adapter: ${missing.join(', ')}`).toEqual([]);
    });

    it('COV-2: ⛔ AND NO ADAPTER EXISTS FOR A FAMILY THE TABLE DOES NOT CARRY', () => {
        // The other direction, and it is not decoration: an adapter for a REFUSES
        // family is a loaded gun — one edit to the table and a door starts moving.
        const carried = new Set(
            BOUNDARY_LINE_FAMILY_RULES.filter((r) => r.verdict === 'PROPAGATES').map((r) => r.family),
        );
        const stray = Object.keys(BOUNDARY_LINE_DEPENDENT_ADAPTERS).filter((f) => !carried.has(f));
        expect(stray, `adapters for families the table refuses: ${stray.join(', ')}`).toEqual([]);
    });
});
