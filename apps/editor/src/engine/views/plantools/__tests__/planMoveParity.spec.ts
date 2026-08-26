// §FIX-PLAN-MOVE-PARITY (Gate G7) — the guard against the TENTH instance of the disease.
//
// This project has a nine-times-repeated defect (L-239/240/243/246/251/255/260A/266/267):
// ONE element, TWO paths, and the PLAN path silently drops what the 3-D path resolves.
// MOVE was carrying three live instances of it when this file was written:
//
//   • stair    — moves with the 3-D gizmo (`stair.move`); `MovePlanToolHandler` had NO
//                stair branch and fell to `default:` ("No move implementation"), while the
//                Move button stayed capability-gated ON. Enabled, and inert.
//   • plumbing — identical shape (`plumbing.moveFixture` in 3-D, nothing in plan).
//   • undo     — every 3-D drag-end opts into the ring-buffer undo timeline
//                (`_recordUndo` + the pre-gesture `_prev*` pose, L-72); the plan Move tool
//                did not, for ANY type. Same gesture, different undo (C16 violation).
//
// The antidote is this file. It pins the one thing that makes a second gesture safe:
//
//     MOVING A PLACED ELEMENT IN PLAN PRODUCES THE SAME RECORD MUTATION —
//     AND THE SAME UNDO ENTRY — AS MOVING IT IN 3-D.
//
// It does that two ways:
//   1. Behaviourally — asserting the payloads `buildMoveCommand()` (which the plan tool
//      calls) produces for each family.
//   2. STRUCTURALLY — by reading `registerTransformDragHandler.ts` (the 3-D gizmo
//      drag-end) and asserting that every command it dispatches is the command the shared
//      table names for that family, and that the two agree on ring-buffer undo capture.
//      A 3-D-only move command, or a plan/3-D fork, is a RED TEST, not a shipped bug.
//
// Pure module: no DOM, no THREE, no window at module load.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import {
    buildMoveCommand,
    canMove,
    moveCommandFor,
    MOVE_COMMAND_BY_TYPE,
    MOVE_UNSUPPORTED_REASON,
} from '../../../transforms/elementMove';

// `@pryzm/input-host` exports only its barrel, which drags THREE + DOM in at module load
// (§SCC). `ElementCapabilities` is a pure lookup table, so we reach it directly — the same
// escape hatch `planRotateParity.spec.ts` uses and for the same reason.
// eslint-disable-next-line pryzm/no-legacy-src-import
import { canDo, availableOps } from '../../../../../../../packages/input-host/src/operations/ElementCapabilities';

const HERE = dirname(fileURLToPath(import.meta.url));
const DRAG_HANDLER_SRC = readFileSync(
    resolve(HERE, '../../../registerTransformDragHandler.ts'),
    'utf8',
);

/** Every `dragDispatch('<type>', …)` the 3-D gizmo fires on drag-end. */
function threeDDispatchedTypes(): string[] {
    return [...DRAG_HANDLER_SRC.matchAll(/dragDispatch\(\s*'([^']+)'/g)].map((m) => m[1]!);
}

/**
 * Does the 3-D branch that dispatches `type` opt into ring-buffer undo capture?
 *
 * Two ways a branch can qualify, and the second is STRONGER than the first:
 *
 *   1. It writes `_recordUndo` into an INLINE payload literal (column / beam / floor / …).
 *      We read the argument list of the `dragDispatch` call to find it.
 *   2. §FIX-MOVE-SLAB-AND-HANDRAIL (G7) — it builds its payload with the SHARED
 *      `buildMoveCommand()`, the very function the plan tool calls. Then undo capture is
 *      identical to the plan surface BY CONSTRUCTION — it is literally the same object —
 *      so there is nothing left to diverge. (The `buildMoveCommand(...)` call sits ABOVE
 *      the `dragDispatch`, so we look BACKWARD to the top of the enclosing `if (elemType`
 *      branch, not forward into the payload.)
 *
 * Neither path is a free pass: a branch that does neither returns false, and the parity
 * assertion then fails against the plan payload — which is exactly what we want.
 */
function threeDRecordsUndo(type: string): boolean {
    const start = DRAG_HANDLER_SRC.indexOf(`dragDispatch('${type}'`);
    if (start < 0) return false;

    // (1) Inline literal: the payload is the argument list of this call — bounded by the
    // next dragDispatch (or 600 chars, whichever is nearer). Every inline payload in that
    // file is well under 600 chars.
    const nextCall = DRAG_HANDLER_SRC.indexOf('dragDispatch(', start + 10);
    const end = nextCall < 0 ? start + 600 : Math.min(nextCall, start + 600);
    if (DRAG_HANDLER_SRC.slice(start, end).includes('_recordUndo')) return true;

    // (2) Shared builder: scan back to the head of the enclosing element branch.
    const branchStart = DRAG_HANDLER_SRC.lastIndexOf('if (elemType', start);
    if (branchStart < 0) return false;
    return DRAG_HANDLER_SRC.slice(branchStart, start).includes('buildMoveCommand(');
}

/**
 * §FIX-CW-ALIGN-VERB (L-1164) — THE THIRD MOVE SURFACE, WHICH THIS FILE DID NOT WATCH.
 *
 * This spec pinned two surfaces: the plan Move tool (behaviourally, via
 * `buildMoveCommand`) and the 3-D gizmo (structurally, by reading its source). ALIGN is a
 * third — it translates a placed element by a delta, which is a move by any definition —
 * and it hand-rolls a `_move<Family>()` per type instead of calling the shared builder.
 * Being outside the net is how its curtain-wall arm came to dispatch a verb whose handler
 * rejects the payload on every call, for as long as the feature has existed.
 */
const ALIGN_HANDLER_SRC = readFileSync(resolve(HERE, '../AlignPlanToolHandler.ts'), 'utf8');

describe('§FIX-PLAN-MOVE-PARITY — the shared translate definition (Gate G7)', () => {
    // ── 1. The command table is the SINGLE source of truth for both surfaces ──────
    describe('no fork: every 3-D move command is the command the shared table names', () => {
        it('every dragDispatch() type in registerTransformDragHandler is in MOVE_COMMAND_BY_TYPE', () => {
            const known = new Set<string>(Object.values(MOVE_COMMAND_BY_TYPE));
            // Sanity: the source really was read (a silent empty read would make this
            // assertion vacuous — an unfalsifiable guard is not a guard).
            expect(DRAG_HANDLER_SRC.length).toBeGreaterThan(1000);
            const dispatched = threeDDispatchedTypes();
            expect(dispatched.length).toBeGreaterThan(5);

            for (const type of dispatched) {
                expect(
                    known.has(type),
                    `registerTransformDragHandler dispatches "${type}" on drag-end, but no element ` +
                    `family in MOVE_COMMAND_BY_TYPE names it. Either the plan surface cannot move ` +
                    `that family (a fork — the L-267 defect) or the table is stale.`,
                ).toBe(true);
            }
        });

        it('names the SAME command the 3-D gizmo dispatches, per family', () => {
            // Spot-pinned per family: the exact string the 3-D branch fires.
            expect(moveCommandFor('stair')).toBe('stair.move');
            expect(DRAG_HANDLER_SRC).toContain("dragDispatch('stair.move'");

            expect(moveCommandFor('plumbing')).toBe('plumbing.moveFixture');
            expect(moveCommandFor('plumbingfixture')).toBe('plumbing.moveFixture');
            expect(DRAG_HANDLER_SRC).toContain("dragDispatch('plumbing.moveFixture'");

            // §LIGHT121 (L-11900) — the founder's "no move icon" report closed with
            // the identical L-220 pattern plumbing uses above.
            expect(moveCommandFor('lighting')).toBe('lighting.moveFixture');
            expect(DRAG_HANDLER_SRC).toContain("dragDispatch('lighting.moveFixture'");

            expect(moveCommandFor('column')).toBe('column.update');
            expect(moveCommandFor('beam')).toBe('beam.update');
            expect(moveCommandFor('furniture')).toBe('furniture.updateParameters');
            expect(moveCommandFor('floor')).toBe('floor.update');
            expect(moveCommandFor('ceiling')).toBe('ceiling.update');
            expect(moveCommandFor('roof')).toBe('roof.update');
            expect(moveCommandFor('curtain-wall')).toBe('wall.updateCurtainWall');
            expect(moveCommandFor('wall')).toBe('wall.updateBaseline');
            expect(moveCommandFor('door')).toBe('door.setOffset');
            expect(moveCommandFor('window')).toBe('window.setOffset');

            // §FIX-MOVE-SLAB-AND-HANDRAIL (G7) — the two families that were enabled and inert
            // on BOTH surfaces. Each must now name an UN-SHADOWED bus type AND have a real
            // 3-D branch. Before the fix: slab had no `dragDispatch` at all, and handrail's
            // branch only `console.warn`ed and emitted a snap-back event — so both `toContain`
            // assertions below fail RED on the pre-fix file.
            expect(moveCommandFor('slab')).toBe('slab.movePolygon');
            expect(DRAG_HANDLER_SRC).toContain("dragDispatch('slab.movePolygon'");

            expect(moveCommandFor('handrail')).toBe('handrail.moveBaseLine');
            expect(moveCommandFor('railing')).toBe('handrail.moveBaseLine');
            expect(DRAG_HANDLER_SRC).toContain("dragDispatch('handrail.moveBaseLine'");
        });

        it('the two new bridges use a type NO plugin handler claims (the L-220 rule)', () => {
            // The whole point of the L-220 `plumbing.moveFixture` precedent: the plugin
            // handlers (`slab.updatePolygon`, `slab.update`, `slab.setMaterial`,
            // `wall.setColor`) `produceCommand` against a DETACHED plugin DTO store. Bridging
            // to the legacy geometry command under one of THEIR type names would be shadowed
            // — first registration wins — and the move would land in the dead store again.
            //
            // This assertion is NOT vacuous: swap `slab.movePolygon` back to
            // `slab.updatePolygon` (the name the pre-fix plan tool actually dispatched) and
            // it goes red.
            const SHADOWED_BY_PLUGIN_HANDLERS = [
                'slab.updatePolygon', 'slab.update', 'slab.setMaterial',
                'wall.setColor', 'plumbing.move',
            ];
            for (const cmd of Object.values(MOVE_COMMAND_BY_TYPE)) {
                expect(
                    SHADOWED_BY_PLUGIN_HANDLERS.includes(cmd),
                    `A move routes to "${cmd}" — a bus type CLAIMED by a plugin handler that writes ` +
                    `the DETACHED plugin DTO store. It will be shadowed (first registration wins) and ` +
                    `the move will never reach the geometry record. Use a DISTINCT type bridged to the ` +
                    `legacy command (the L-220 plumbing.moveFixture pattern).`,
                ).toBe(false);
            }
        });

        it('the handrail 3-D branch no longer REFUSES the drag', () => {
            // The pre-fix branch told the user to "use the Plan View move tool" — a tool that
            // had never implemented handrail move. A double lie: two surfaces, each pointing
            // at the other. If that text ever comes back, so has the lie.
            expect(
                DRAG_HANDLER_SRC.includes('Use the Plan View move tool instead'),
                'The 3-D handrail branch is refusing the drag again and redirecting the user to the ' +
                'Plan View move tool. HandrailData.baseLine is a two-point LINE — it moves.',
            ).toBe(false);
        });
    });

    // ── 2. ONE GESTURE = ONE UNDO ENTRY, on BOTH surfaces (C16) ───────────────────
    describe('undo parity: plan and 3-D agree on ring-buffer capture', () => {
        const bothSurfaces: Array<{ type: string; record: unknown }> = [
            { type: 'column',    record: { id: 'c1', position: { x: 1, y: 0, z: 2 } } },
            { type: 'furniture', record: { id: 'f1', position: { x: 1, y: 0, z: 2 } } },
            { type: 'beam',      record: { id: 'b1', startPoint: { x: 0, y: 3, z: 0 }, endPoint: { x: 4, y: 3, z: 0 } } },
            { type: 'floor',     record: { id: 'fl1', boundary: { polygon: [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }] } } },
            { type: 'ceiling',   record: { id: 'ce1', boundary: { polygon: [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }] } } },
            { type: 'roof',      record: { id: 'r1', footprint: { polygon: [[0, 0], [2, 0], [2, 2]], centroid: [1, 1] } } },
            { type: 'plumbing',  record: { id: 'p1', position: { x: 1, y: 0, z: 2 } } },
            // §LIGHT121 (L-11900) — the same absolute-destination shape as plumbing.
            { type: 'lighting',  record: { id: 'l1', position: { x: 1, y: 2.7, z: 2 } } },
            { type: 'stair',     record: { id: 's1' } },
            // §FIX-MOVE-SLAB-AND-HANDRAIL (G7) — both now move on BOTH surfaces.
            { type: 'slab',      record: { id: 'sl1', polygon: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }] } },
            { type: 'handrail',  record: { id: 'h1', baseLine: [{ x: 0, y: 1, z: 0 }, { x: 3, y: 1, z: 0 }] } },
        ];

        for (const { type, record } of bothSurfaces) {
            it(`${type}: plan payload records undo iff the 3-D payload does`, () => {
                const cmd = buildMoveCommand(type, record, 1, 1);
                expect(cmd, `${type} must have a shared move definition`).not.toBeNull();
                const planRecordsUndo = '_recordUndo' in cmd!.payload;
                expect(
                    planRecordsUndo,
                    `The plan move for "${type}" ${planRecordsUndo ? 'records' : 'does NOT record'} ring-buffer undo, ` +
                    `but the 3-D drag ${threeDRecordsUndo(cmd!.type) ? 'does' : 'does not'}. Same gesture, ` +
                    `different undo → C16 violation.`,
                ).toBe(threeDRecordsUndo(cmd!.type));
            });
        }
    });

    // ── 3. Payloads — a move is a position delta on the record, nothing else ──────
    describe('payload shape (C11 — no new representation)', () => {
        it('column: translates position, carries the pre-move pose for the inverse patch', () => {
            const cmd = buildMoveCommand('column', { id: 'c1', position: { x: 1, y: 0, z: 2 } }, 0.5, -1.5);
            expect(cmd).toEqual({
                type: 'column.update',
                payload: {
                    id: 'c1',
                    updates:     { position: { x: 1.5, y: 0, z: 0.5 } },
                    _recordUndo: true,
                    _prev:       { position: { x: 1, y: 0, z: 2 } },
                },
            });
        });

        it('furniture: translates position and does NOT touch rotation', () => {
            const cmd = buildMoveCommand(
                'furniture',
                { id: 'f1', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 1.2, z: 0 } },
                2, 3,
            );
            expect(cmd!.type).toBe('furniture.updateParameters');
            expect(cmd!.payload).toEqual({
                id: 'f1',
                position:      { x: 2, y: 0, z: 3 },
                _recordUndo:   true,
                _prevPosition: { x: 0, y: 0, z: 0 },
            });
            // A MOVE must not rewrite the yaw — that is `elementYawRotate`'s job.
            expect(cmd!.payload).not.toHaveProperty('rotation');
        });

        it('beam: translates BOTH endpoints by the same delta (length preserved)', () => {
            const cmd = buildMoveCommand(
                'beam',
                { id: 'b1', startPoint: { x: 0, y: 3, z: 0 }, endPoint: { x: 4, y: 3, z: 0 } },
                1, 1,
            );
            const u = cmd!.payload.updates as { startPoint: { x: number; z: number }; endPoint: { x: number; z: number } };
            expect(u.startPoint).toEqual({ x: 1, y: 3, z: 1 });
            expect(u.endPoint).toEqual({ x: 5, y: 3, z: 1 });
            expect(Math.hypot(u.endPoint.x - u.startPoint.x, u.endPoint.z - u.startPoint.z)).toBeCloseTo(4);
        });

        it('stair: a DELTA, exactly as the 3-D gizmo commits it (Y level-locked)', () => {
            const cmd = buildMoveCommand('stair', { id: 's1' }, 1.25, -0.75);
            expect(cmd).toEqual({
                type: 'stair.move',
                payload: { stairId: 's1', delta: { x: 1.25, y: 0, z: -0.75 } },
            });
        });

        it('plumbing: an absolute destination `to`, exactly as the 3-D gizmo commits it', () => {
            const cmd = buildMoveCommand('plumbing', { id: 'p1', position: { x: 1, y: 0.4, z: 1 } }, 1, 1);
            expect(cmd).toEqual({
                type: 'plumbing.moveFixture',
                payload: { id: 'p1', to: { x: 2, y: 0.4, z: 2 } },
            });
        });

        it('lighting: an absolute destination `to`, the same shape as plumbing (§LIGHT121, L-11900)', () => {
            const cmd = buildMoveCommand('lighting', { id: 'l1', position: { x: 1, y: 2.7, z: 1 } }, 1, 1);
            expect(cmd).toEqual({
                type: 'lighting.moveFixture',
                payload: { id: 'l1', to: { x: 2, y: 2.7, z: 2 } },
            });
        });

        it('floor / ceiling: every polygon vertex translates by the same delta', () => {
            const poly = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }];
            const cmd = buildMoveCommand('floor', { id: 'fl1', boundary: { polygon: poly } }, 2, -1);
            const next = (cmd!.payload.updates as { boundary: { polygon: Array<{ x: number; z: number }> } }).boundary.polygon;
            expect(next).toEqual([{ x: 2, z: -1 }, { x: 6, z: -1 }, { x: 6, z: 2 }, { x: 2, z: 2 }]);
            // The pre-move polygon must be a DEEP clone — the store mutates boundaries in
            // place, and a shared reference would make the inverse patch restore the NEW
            // vertices (i.e. undo would be a no-op).
            const prev = (cmd!.payload._prev as { boundary: { polygon: Array<{ x: number; z: number }> } }).boundary.polygon;
            expect(prev).toEqual([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }]);
            expect(prev[0]).not.toBe(poly[0]);
        });

        it('roof: footprint tuples + centroid travel together', () => {
            const cmd = buildMoveCommand(
                'roof',
                { id: 'r1', footprint: { polygon: [[0, 0], [4, 0], [4, 4]], centroid: [2, 2] } },
                1, 2,
            );
            expect(cmd!.payload.updates).toEqual({
                footprint: { polygon: [[1, 2], [5, 2], [5, 6]], centroid: [3, 4] },
            });
        });

        it('room: polygon AND centroid translate together', () => {
            const cmd = buildMoveCommand(
                'room',
                {
                    id: 'rm1',
                    boundary: { polygon: [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 3, z: 3 }], centroid: { x: 2, z: 1 } },
                    boundingWallIds: ['w1'],
                },
                1, 1,
            );
            expect(cmd!.type).toBe('room.updateBoundary');
            const b = cmd!.payload.boundary as { polygon: Array<{ x: number; z: number }>; centroid: { x: number; z: number } };
            expect(b.polygon).toEqual([{ x: 1, z: 1 }, { x: 4, z: 1 }, { x: 4, z: 4 }]);
            expect(b.centroid).toEqual({ x: 3, z: 2 });
            expect(cmd!.payload.boundingWallIds).toEqual(['w1']);
        });

        it('curtain wall: both baseline endpoints travel', () => {
            const cmd = buildMoveCommand(
                'curtain-wall',
                { id: 'cw1', baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }] },
                0, 2,
            );
            expect(cmd!.type).toBe('wall.updateCurtainWall');
            expect(cmd!.payload.updates).toEqual({
                baseLine: [{ x: 0, y: 0, z: 2 }, { x: 5, y: 0, z: 2 }],
            });
        });

        // ── §FIX-MOVE-SLAB-AND-HANDRAIL (Gate G7) — the last two lying Move buttons ──
        it('slab: every polygon vertex translates — and Z lands on `y` (the 2-D slab convention)', () => {
            // SlabData.polygon is `{x,y}[]` where `y` MAPS TO WORLD Z. Getting that wrong
            // would move the slab along the wrong axis — so pin the AXIS, not just "it moved".
            const poly = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
            const cmd = buildMoveCommand('slab', { id: 'sl1', polygon: poly }, 2, -1);
            expect(cmd!.type).toBe('slab.movePolygon');
            expect(cmd!.payload.slabId).toBe('sl1');
            expect(cmd!.payload.polygon).toEqual([
                { x: 2, y: -1 }, { x: 6, y: -1 }, { x: 6, y: 2 }, { x: 2, y: 2 },
            ]);
            // The pre-move polygon must be a DEEP clone — the store mutates in place, and a
            // shared reference would make the inverse patch restore the NEW vertices (i.e.
            // undo would be a silent no-op — the L-72 defect).
            const prev = (cmd!.payload._prev as { polygon: Array<{ x: number; y: number }> }).polygon;
            expect(prev).toEqual(poly);
            expect(prev[0]).not.toBe(poly[0]);
            // A translate is AABB-invariant, so the command's width/depth stay correct and
            // must NOT be re-sent (a second representation of the same fact — C11).
            expect(cmd!.payload).not.toHaveProperty('width');
            expect(cmd!.payload).not.toHaveProperty('depth');
        });

        it('slab: HOLES travel with the ring — a hole left behind would slide across the slab', () => {
            // Holes are stored in the same WORLD frame as the outer ring, not as an offset
            // from it. UpdateSlabPolygonCommand preserves existing holes only when `holes` is
            // OMITTED — so translating the ring while omitting the holes would leave the
            // openings where they were. This assertion fails if the holes are dropped, and it
            // fails if they are passed through untranslated.
            const holes = [[{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }]];
            const cmd = buildMoveCommand(
                'slab',
                { id: 'sl1', polygon: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }], holes },
                10, 20,
            );
            expect(cmd!.payload.holes).toEqual([[{ x: 11, y: 21 }, { x: 12, y: 21 }, { x: 12, y: 22 }]]);
            expect((cmd!.payload._prev as { holes: unknown }).holes).toEqual(holes);
        });

        it('slab: a slab with NO holes omits the key entirely (passing [] would DELETE them)', () => {
            const cmd = buildMoveCommand('slab', { id: 'sl1', polygon: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }] }, 1, 1);
            expect(Object.prototype.hasOwnProperty.call(cmd!.payload, 'holes')).toBe(false);
        });

        it('handrail: both baseLine endpoints travel (it is a LINE, not "path points")', () => {
            // The premise that killed this for a year — "handrail geometry is defined by path
            // points" — was false. HandrailData.baseLine is [Point3D, Point3D].
            const cmd = buildMoveCommand(
                'handrail',
                { id: 'h1', baseLine: [{ x: 0, y: 1, z: 0 }, { x: 3, y: 1, z: 4 }] },
                1, -2,
            );
            expect(cmd!.type).toBe('handrail.moveBaseLine');
            expect(cmd!.payload.baseLine).toEqual([
                { x: 1, y: 1, z: -2 }, { x: 4, y: 1, z: 2 },
            ]);
            // Length preserved (a translate, not a stretch) — and Y is untouched.
            const [a, b] = cmd!.payload.baseLine as Array<{ x: number; y: number; z: number }>;
            expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(5);
            expect(a.y).toBe(1);
            expect(b.y).toBe(1);
            expect((cmd!.payload._prev as { baseLine: unknown }).baseLine).toEqual([
                { x: 0, y: 1, z: 0 }, { x: 3, y: 1, z: 4 },
            ]);
        });

        it('railing is an alias of handrail — the same command, the same payload', () => {
            const rec = { id: 'h1', baseLine: [{ x: 0, y: 1, z: 0 }, { x: 3, y: 1, z: 0 }] };
            expect(buildMoveCommand('railing', rec, 1, 1)).toEqual(buildMoveCommand('handrail', rec, 1, 1));
        });

        it('a zero delta, a non-finite delta, or a missing record is a no-op — never a dispatch', () => {
            expect(buildMoveCommand('column', { id: 'c1', position: { x: 0, y: 0, z: 0 } }, 0, 0)).toBeNull();
            expect(buildMoveCommand('column', { id: 'c1', position: { x: 0, y: 0, z: 0 } }, NaN, 1)).toBeNull();
            expect(buildMoveCommand('column', null, 1, 1)).toBeNull();
            expect(buildMoveCommand('column', { position: { x: 0, y: 0, z: 0 } }, 1, 1)).toBeNull(); // no id
        });
    });

    // ── 4. No lying buttons: every movable-by-capability type is wired or declared ─
    describe('capability agreement — an enabled Move button must move something', () => {
        // The types ElementCapabilities declares 'move' for. `floor_plan_underlay` is not a
        // BIM element: ContextualEditBar intercepts it before the plan tool ever sees it
        // (it unlocks the underlay for dragging), so it is legitimately absent here.
        const CAPABILITY_MOVE_TYPES = [
            'wall', 'curtain-wall', 'curtainwall', 'beam', 'slab', 'floor', 'ceiling',
            'railing', 'stair', 'stairs', 'column', 'roof', 'door', 'window', 'furniture',
            'plumbing', 'handrail',
            // §LIGHT121 (L-11900) — lighting joins: the Move icon now renders for it
            // AND lands on a real command (`lighting.moveFixture`).
            'lighting',
        ];

        it('the capability table really does declare move for all of these (guard is not vacuous)', () => {
            for (const t of CAPABILITY_MOVE_TYPES) {
                expect(canDo(t, 'move'), `${t} should declare 'move'`).toBe(true);
            }
            // §LIGHT121 (L-11900) — lighting declares MOVE ONLY, deliberately narrower
            // than plumbing's POINT_OPS: move is the one op this fix verified end to
            // end; mirror/copy must not be claimed until they are (the L-267 rule).
            expect(availableOps('lighting').sort()).toEqual(['move']);
        });

        it('every type whose Move button is ON either MOVES, or SAYS WHY IT CANNOT', () => {
            for (const t of CAPABILITY_MOVE_TYPES) {
                const wired    = canMove(t);                          // has a shared/handler command
                const declared = MOVE_UNSUPPORTED_REASON[t] !== undefined; // refuses out loud
                expect(
                    wired || declared,
                    `"${t}" shows an enabled Move button but has neither a move command nor an entry ` +
                    `in MOVE_UNSUPPORTED_REASON. That is a button that lies — the L-267 defect. ` +
                    `Wire it, or declare (and surface) why it cannot move yet.`,
                ).toBe(true);
            }
        });

        it('records the families that CANNOT move yet, so the gap is visible rather than silent', () => {
            // §FIX-MOVE-SLAB-AND-HANDRAIL (G7) — slab, handrail and railing left this list
            // when they were wired. §LIGHT121 (L-11900) — `lighting` was the LAST entry and
            // it is wired now too (`lighting.moveFixture`, both surfaces), so the honest
            // state of this ledger is EMPTY. Any future family that shows a Move button it
            // cannot honour must land here, and this assertion will name it.
            expect(Object.keys(MOVE_UNSUPPORTED_REASON).sort()).toEqual([]);
            expect(canMove('slab')).toBe(true);
            expect(canMove('handrail')).toBe(true);
            expect(canMove('railing')).toBe(true);
            expect(canMove('lighting')).toBe(true);
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §FIX-CW-ALIGN-VERB (L-1164) — the ALIGN surface, scoped to curtain wall.
//
// Deliberately NOT a blanket "every align verb must be in MOVE_COMMAND_BY_TYPE" arm.
// Align also fires `slab.updatePolygon` where the table names `slab.movePolygon`, and
// that divergence sits in another lane's fence. A red test for someone else's file is a
// broken build, not a finding — the divergence is REPORTED (C87 §13.10) and this arm
// pins the family this lane owns.
// ─────────────────────────────────────────────────────────────────────────────
describe('§FIX-CW-ALIGN-VERB — align moves a curtain wall with the verb that reaches the record', () => {
    it('the source really was read (an empty read would make every assertion below vacuous)', () => {
        expect(ALIGN_HANDLER_SRC.length).toBeGreaterThan(1000);
        expect(ALIGN_HANDLER_SRC).toContain('_moveCurtainWall');
    });

    it('dispatches the command MOVE_COMMAND_BY_TYPE names for curtain-wall', () => {
        expect(moveCommandFor('curtain-wall')).toBe('wall.updateCurtainWall');
        expect(ALIGN_HANDLER_SRC).toContain("executeCommand('wall.updateCurtainWall'");
    });

    it('no longer dispatches curtain-wall.move, whose handler rejects this payload on EVERY call', () => {
        // `MoveCurtainWallHandler` requires `{ curtainWallId, delta }`; align builds
        // `{ id, updates: { baseLine } }`. canExecute therefore returned
        // "curtainWallId must be a non-empty string", CommandBus threw, and the catch
        // turned a 100%-failing feature into a console line. And the handler writes the
        // plugin DTO store, so even a shape-corrected dispatch would move nothing visible.
        expect(ALIGN_HANDLER_SRC).not.toContain("executeCommand('curtain-wall.move'");
    });

    it('sends the SAME payload shape as the 3-D gizmo and the plan Move tool', () => {
        // All three surfaces: { id, updates: { baseLine: [start, end] } }.
        expect(ALIGN_HANDLER_SRC).toContain('updates: { baseLine: next }');
        expect(DRAG_HANDLER_SRC).toContain("dragDispatch('wall.updateCurtainWall', { id, updates: { baseLine: next } })");

        const built = buildMoveCommand(
            'curtain-wall',
            { id: 'cw-1', baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }] },
            1,
            2,
        );
        expect(built?.type).toBe('wall.updateCurtainWall');
        expect(Object.keys(built!.payload).sort()).toEqual(['id', 'updates']);
    });
});
