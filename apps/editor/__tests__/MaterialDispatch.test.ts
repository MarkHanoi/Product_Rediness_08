// @vitest-environment happy-dom
//
// §FIX-MATERIAL-DEAD-DISPATCH (Gate G7, supersedes the L-08 / L-57 assertions)
//
// The old version of this suite asserted that `dispatchSetMaterial` dispatched
// `<family>.setMaterial` with the right id field — and it passed, every time, against a
// mock bus. It was green while material was a NO-OP for every element family in the app.
//
// That is the lesson: VERIFY AT THE OUTCOME, NOT AT THE SEAM. A handler that DISPATCHES
// proves nothing; what matters is whether THE RECORD MUTATES. The `<family>.setMaterial`
// plugin handlers `produceCommand` against the plugin DTO store (`ctx.stores.slab`, …),
// which in production is a FRESH `new SlabStore()` built by PluginRegistry — not the
// geometry `window.slabStore` the fragment builders, the plan projector, the IFC exporter
// and persistence read. Nothing bridges plugin-store updates back (initTools mirrors
// `<family>.created` only; composeRuntime registers no committers). So the command landed
// in a store nobody reads, while `PropertyInspector.onMaterialChange` repainted the THREE
// mesh live — the change LOOKED applied and evaporated on the next rebuild.
//
// These assertions now pin the thing that actually matters:
//
//   1. Every route names a command that reaches the GEOMETRY store (a `<family>.update`
//      legacy bridge, or one of the two dedicated handlers that bridge to commandManager).
//   2. NO route may name a `*.setMaterial` plugin command except `room.setMaterial` —
//      the one that bridges to commandManager. If someone re-points a family back at a
//      detached plugin handler, this suite goes red.
//   3. Families with no live path are DECLARED (with a reason) rather than dispatched
//      into the void.

import { describe, it, expect } from 'vitest';
import {
    dispatchSetMaterial,
    dispatchSetMaterialMany,
    routeFor,
    hasMaterialCommand,
    materialUnsupportedReason,
    materialIdUnsupportedReason,
    MATERIAL_UNSUPPORTED_REASON,
    MATERIAL_ID_UNSUPPORTED_REASON,
} from '../src/ui/property-inspector/MaterialDispatch';

interface Call { type: string; payload: any }

function makeRuntime() {
    const calls: Call[] = [];
    const runtime = {
        bus: {
            executeCommand(type: string, payload: unknown) {
                calls.push({ type, payload });
                return Promise.resolve();
            },
        },
    };
    return { runtime, calls };
}

/**
 * The commands that are KNOWN to reach the geometry store (verified by reading the
 * handler at each end):
 *   • `<family>.update` → initBusHandlers bridge / plugin bridge → legacy UpdateXCommand
 *     → `store.update(id, updates)` → `bim-<family>-updated` → mesh rebuild + plan
 *     re-projection + persistence.
 *   • `room.setMaterial` → SetRoomMaterialHandler → commandManager → geometry roomStore.
 *   • `furniture.updateParameters` → UpdateFurnitureParametersHandler → commandManager
 *     → geometry furnitureStore.
 */
const LIVE_COMMANDS = new Set([
    'column.update',
    'ceiling.update',
    'floor.update',
    'roof.update',
    'wall.updateCurtainWall',
    'room.setMaterial',
    'furniture.updateParameters',
    // §FIX-MATERIAL-REACHES-RECORD (G7) — new legacy bus bridges. Each verified END TO END:
    //   wall.updateColor      → UpdateWallColorCommand      → wallStore.updateWall()
    //                           WallFragmentBuilder resolves materialId + materialColor.
    //   slab.updateDimensions → UpdateSlabDimensionsCommand → slabStore.update()
    //                           SlabFragmentBuilder reads data.materialId + data.materialColor.
    //   handrail.updateColor  → UpdateHandrailCommand       → handrailStore.update()
    //                           HandrailFragmentBuilder reads materialColor.
    'wall.updateColor',
    'slab.updateDimensions',
    'handrail.updateColor',
]);

/**
 * Bus types CLAIMED by a plugin handler that `produceCommand`s against the DETACHED plugin
 * DTO store (a fresh `new SlabStore()` / `new WallStore()` from PluginRegistry). Registration
 * is FIRST-WINS, so routing a family to one of these means the command is shadowed and the
 * mutation lands in a store nothing reads — while the inspector's live mesh repaint tells
 * the user it worked. This is the disease. No route may name one of these, ever.
 */
const SHADOWED_BY_DETACHED_PLUGIN_STORE = new Set([
    'wall.setColor',        // plugins/wall SetWallColor  — ALSO required { id } vs the panel's { wallId }
    'slab.setMaterial',     // plugins/slab SetSlabMaterial
    'slab.update',          // plugins/slab UpdateSlab
    'slab.updatePolygon',   // plugins/slab UpdateSlabPolygon
    'plumbing.move',        // the L-220 original
]);

describe('MaterialDispatch — every route must reach the geometry record (G7)', () => {
    it('routes ONLY to commands that mutate the geometry store', () => {
        const families = ['slab', 'ceiling', 'roof', 'floor', 'room', 'column', 'beam', 'stair',
                          'handrail', 'furniture', 'plumbing', 'lighting', 'curtainwall',
                          'structural', 'wall', 'door', 'window'];
        for (const f of families) {
            const route = routeFor(f);
            if (!route) continue;
            expect(
                LIVE_COMMANDS.has(route.command),
                `"${f}" routes material to "${route.command}", which is not known to reach the ` +
                `geometry store. If it is a plugin *.setMaterial handler, it writes a DETACHED ` +
                `plugin DTO store and the change is invisible + unsaved.`,
            ).toBe(true);
        }
    });

    it('never routes a family back to a detached plugin *.setMaterial handler', () => {
        const families = ['slab', 'ceiling', 'roof', 'floor', 'column', 'beam', 'stair',
                          'handrail', 'furniture', 'plumbing', 'lighting', 'curtainwall', 'structural'];
        for (const f of families) {
            const cmd = routeFor(f)?.command;
            expect(
                cmd?.endsWith('.setMaterial') ?? false,
                `"${f}" is routed to "${cmd}" — a plugin setMaterial handler on a detached store.`,
            ).toBe(false);
        }
        // room is the ONE setMaterial handler that bridges to commandManager.
        expect(routeFor('room')?.command).toBe('room.setMaterial');
    });

    // ── Payload shapes ────────────────────────────────────────────────────────────
    it('column: material lands in the `updates` bag the legacy UpdateColumnCommand spreads', () => {
        const { runtime, calls } = makeRuntime();
        const ok = dispatchSetMaterial(runtime, 'column', 'c1', { materialId: 'steel', materialColor: '#ff0000' });
        expect(ok).toBe(true);
        expect(calls[0]!.type).toBe('column.update');
        expect(calls[0]!.payload).toEqual({ id: 'c1', updates: { materialId: 'steel', materialColor: '#ff0000' } });
    });

    it('ceiling / floor / roof / curtain-wall: correct id field + updates bag', () => {
        const { runtime, calls } = makeRuntime();
        dispatchSetMaterial(runtime, 'ceiling', 'ce1', { materialId: 'plaster' });
        dispatchSetMaterial(runtime, 'floor', 'fl1', { materialColor: '#112233' });
        dispatchSetMaterial(runtime, 'roof', 'r1', { materialId: null });
        dispatchSetMaterial(runtime, 'curtain-wall', 'cw1', { materialId: 'glass' });

        expect(calls[0]).toEqual({ type: 'ceiling.update', payload: { ceilingId: 'ce1', updates: { materialId: 'plaster' } } });
        expect(calls[1]).toEqual({ type: 'floor.update',   payload: { floorId: 'fl1',   updates: { materialColor: '#112233' } } });
        expect(calls[2]).toEqual({ type: 'roof.update',    payload: { id: 'r1',         updates: { materialId: null } } });
        expect(calls[3]).toEqual({ type: 'wall.updateCurtainWall', payload: { id: 'cw1', updates: { materialId: 'glass' } } });
    });

    it('furniture: flat payload on the bridging updateParameters command; colour field is `color`', () => {
        const { runtime, calls } = makeRuntime();
        const ok = dispatchSetMaterial(runtime, 'wardrobe', 'f1', { materialColor: '#0a0b0c' });
        expect(ok).toBe(true);
        expect(calls[0]!.type).toBe('furniture.updateParameters');
        expect(calls[0]!.payload).toEqual({ id: 'f1', color: '#0a0b0c' });
    });

    it('room: keeps its commandManager-bridging handler, but NOT the catalogue materialId', () => {
        // §FIX-DEAD-VERB-ROOM-MATERIAL-ID (W3-3). The colour half is live: it bridges to
        // `UpdateRoomCommand(roomId, { colour })` → the legacy roomStore → plan fill +
        // persistence. The materialId half never was: a room has NO top-level catalogue
        // field, so `SetRoomMaterialHandler` returned `{forward: [], inverse: []}` and
        // reported SUCCESS while the inspector had already repainted the fill — the user
        // saw the material apply, saved, reloaded, and it was gone.
        //
        // This route now declares `supportsMaterialId: false`, exactly as `handrail` does
        // above, so the id is never dispatched and the caller surfaces the reason instead.
        // The bug this catches scores ZERO, not 1.000: drop `supportsMaterialId: false`
        // and `materialId` reappears in the payload and this goes RED.
        const { runtime, calls } = makeRuntime();
        dispatchSetMaterial(runtime, 'room', 'rm1', { materialId: 'oak', materialColor: '#123456' });
        expect(calls[0]).toEqual({
            type: 'room.setMaterial',
            payload: { roomId: 'rm1', materialColor: '#123456' },
        });
        expect(calls[0]!.payload).not.toHaveProperty('materialId');
        // …and the gap is EXPLAINED, not silent (failure ≠ emptiness).
        expect(materialIdUnsupportedReason('room')).toBeTruthy();
    });

    // ── §FIX-MATERIAL-REACHES-RECORD (G7) — the families that now REACH the record ───
    it('NO route may name a bus type claimed by a detached-plugin-store handler', () => {
        // The L-220 rule, as an assertion. This is not vacuous: re-point wall to
        // `wall.setColor` (what the panel actually dispatched before G7) and it goes RED.
        for (const f of ['slab', 'wall', 'handrail', 'ceiling', 'roof', 'floor', 'column',
                         'curtainwall', 'furniture', 'room']) {
            const cmd = routeFor(f)?.command;
            if (!cmd) continue;
            expect(
                SHADOWED_BY_DETACHED_PLUGIN_STORE.has(cmd),
                `"${f}" routes material to "${cmd}", which a PLUGIN handler already claims. Bus ` +
                `registration is first-wins, so the legacy bridge is SHADOWED and the material ` +
                `lands in a detached DTO store nobody reads — while the inspector repaints the ` +
                `mesh live and the user believes it worked. Use a DISTINCT type (L-220).`,
            ).toBe(false);
        }
    });

    it('wall: routes to the geometry-store command, with the id field the panel actually sends', () => {
        // The wall bug in one assertion. `wall.setColor` was dispatched with { wallId } while
        // the plugin handler that claimed it required { id } → rejected at canExecute →
        // swallowed. UpdateWallColorInput takes `wallId`, so the panel was right all along;
        // the ROUTE was wrong.
        const { runtime, calls } = makeRuntime();
        const ok = dispatchSetMaterial(runtime, 'wall', 'w1', { materialId: 'brick', materialColor: '#aa3311' });
        expect(ok).toBe(true);
        expect(calls[0]).toEqual({
            type: 'wall.updateColor',
            payload: { wallId: 'w1', materialId: 'brick', materialColor: '#aa3311' },
        });
    });

    it('slab: routes to UpdateSlabDimensionsCommand — the command that OWNS the material fields', () => {
        // Not `slab.update`: UpdateSlabCommand deliberately THROWS on materialId/materialColor
        // ("MUST be mutated via UpdateSlabDimensionsCommand"), and the `slab.update` BUS type
        // is claimed by a plugin handler on the detached store anyway.
        const { runtime, calls } = makeRuntime();
        const ok = dispatchSetMaterial(runtime, 'slab', 's1', { materialId: 'concrete', materialColor: '#9a9a9a' });
        expect(ok).toBe(true);
        expect(calls[0]).toEqual({
            type: 'slab.updateDimensions',
            payload: { slabId: 's1', materialId: 'concrete', materialColor: '#9a9a9a' },
        });
    });

    it('handrail: colour reaches the record; a catalogue materialId is NOT written, and says why', () => {
        // HandrailFragmentBuilder reads `materialColor` and has NO material-library lookup.
        // Writing a materialId the builder never resolves would put a dead field on the record
        // while the live mesh repaint implied success — the G7 defect one layer down.
        //
        // The bug this catches scores ZERO, not 1.000: if `supportsMaterialId: false` is
        // dropped, `materialId` appears in the payload and this goes RED.
        const { runtime, calls } = makeRuntime();
        const ok = dispatchSetMaterial(runtime, 'handrail', 'h1', { materialId: 'oak', materialColor: '#8b5a2b' });
        expect(ok).toBe(true);
        expect(calls[0]).toEqual({
            type: 'handrail.updateColor',
            payload: { id: 'h1', materialColor: '#8b5a2b' },
        });
        expect(calls[0]!.payload).not.toHaveProperty('materialId');
        expect(materialIdUnsupportedReason('handrail')).toBeTruthy();
    });

    it('a colour-only family refuses a materialId-ONLY change rather than pretending', () => {
        // Nothing renderable to write → no dispatch at all, so the caller surfaces the gap.
        const { runtime, calls } = makeRuntime();
        expect(dispatchSetMaterial(runtime, 'handrail', 'h1', { materialId: 'oak' })).toBe(false);
        expect(calls).toHaveLength(0);
    });

    it('materialIdUnsupportedReason only speaks for families that HAVE a live route', () => {
        // A family with no route at all is covered by MATERIAL_UNSUPPORTED_REASON; reporting
        // both would be contradictory advice.
        expect(materialIdUnsupportedReason('beam')).toBeUndefined();
        expect(materialIdUnsupportedReason('column')).toBeUndefined(); // full support
        // §FIX-DEAD-VERB-ROOM-MATERIAL-ID (W3-3) — `room` joins `handrail` as the second
        // colour-reaches / id-does-not family. Both have a LIVE colour route and no
        // catalogue field behind it, which is exactly what this table is for. Kept as an
        // exhaustive list on purpose: a family may only be added here together with the
        // `supportsMaterialId: false` that stops the id being dispatched.
        expect(Object.keys(MATERIAL_ID_UNSUPPORTED_REASON).sort()).toEqual(['handrail', 'room']);
    });

    it('room refuses a materialId-ONLY change rather than pretending (W3-3)', () => {
        // The colour half is live, so an id-ONLY payload has nothing renderable to write:
        // no dispatch at all, and the caller surfaces `materialIdUnsupportedReason('room')`.
        // Before W3-3 this dispatched `room.setMaterial`, which returned an empty patch pair
        // and reported SUCCESS.
        const { runtime, calls } = makeRuntime();
        expect(dispatchSetMaterial(runtime, 'room', 'rm1', { materialId: 'oak' })).toBe(false);
        expect(calls).toHaveLength(0);
        expect(materialIdUnsupportedReason('room')).toBeTruthy();
    });

    // ── The families that CANNOT commit a material — declared, not dispatched ─────
    it('returns false for every family with no live material path, and says why', () => {
        const { runtime, calls } = makeRuntime();
        for (const f of ['beam', 'stair', 'plumbing', 'lighting', 'structural', 'door', 'window']) {
            expect(dispatchSetMaterial(runtime, f, `${f}-1`, { materialId: 'm', materialColor: '#123456' })).toBe(false);
            expect(hasMaterialCommand(f)).toBe(false);
            expect(materialUnsupportedReason(f), `${f} must declare WHY it cannot apply a material`).toBeTruthy();
        }
        expect(calls, 'nothing may be dispatched into a detached store').toHaveLength(0);
    });

    it('the unsupported list is the honest, complete G7 material gap', () => {
        // §FIX-MATERIAL-REACHES-RECORD — slab, wall and handrail are GONE from this list
        // (they reach the record now). door/window remain, but for a DIFFERENT and honest
        // reason: their frame colour has its own control (door.setFrameColor /
        // window.setFrameColor — now bridged; NO handler existed for either before G7), and
        // routing the generic Material dropdown at the same command would fire it twice for
        // one gesture (two undo entries — a C16 violation).
        expect(Object.keys(MATERIAL_UNSUPPORTED_REASON).sort()).toEqual(
            ['beam', 'door', 'lighting', 'plumbing', 'stair', 'structural', 'window'],
        );
    });

    it('a "cannot render it" reason is MEASURED AT THE BUILDER, not guessed at the bus', () => {
        // The pre-G7 reasons all blamed "the detached plugin store". For these five that was
        // true of the DISPATCH but WRONG about the cause: each HAS a legacy command that
        // reaches the geometry store, and bridging it would STILL have shown nothing, because
        // the record has no material field the builder reads (or the builder ignores the one
        // it has). Bridging them would have produced a record carrying a material and a mesh
        // that never shows it — the same lie, one layer deeper and much harder to see.
        //
        // So: a reason of this kind must name the RECORD or the BUILDER. A reason that names
        // only the bus is a reason nobody verified — which is precisely how this defect
        // survived a 100%-green suite.
        const CANNOT_RENDER = ['beam', 'stair', 'plumbing', 'lighting', 'structural'];
        const BUILDER_WORDS = /builder|hardcode|record|enum|schema-only|materialid|materialcolor/i;
        for (const family of CANNOT_RENDER) {
            const reason = MATERIAL_UNSUPPORTED_REASON[family]!;
            expect(reason, `${family} must declare a reason`).toBeTruthy();
            expect(
                BUILDER_WORDS.test(reason),
                `The reason given for "${family}" does not mention the RECORD or the BUILDER — ` +
                `so it was measured at the dispatch. Read the builder, then write the reason.`,
            ).toBe(true);
        }
    });

    it('door/window declare the RIGHT CONTROL — their gap is a different kind, not a dead builder', () => {
        // door/window are NOT "the builder can't render it" (both builders read frameColor).
        // Their reason is that the GENERIC Material dropdown is the wrong control: an opening's
        // finish comes from its SYSTEM TYPE (C15), and its frame colour has a dedicated control
        // that dispatches door.setFrameColor / window.setFrameColor — commands for which NO
        // handler was registered anywhere on the bus before G7. So the reason must point the
        // user AT the working control, not just say "no".
        for (const f of ['door', 'window']) {
            const reason = MATERIAL_UNSUPPORTED_REASON[f]!;
            expect(reason).toMatch(/frame colour|framecolor|setFrameColor/i);
            expect(reason, `${f} must point at the system type (C15), the real source of its finish`)
                .toMatch(/system type/i);
        }
    });

    // ── Facade behaviour (unchanged contract) ────────────────────────────────────
    it('normalises aliases (stairs → stair, furniture sub-types → furniture)', () => {
        expect(routeFor('stairs')).toBeUndefined();          // stair has no live path
        expect(materialUnsupportedReason('stairs')).toBeTruthy();
        expect(routeFor('corner_wardrobe')?.command).toBe('furniture.updateParameters');
        expect(routeFor('curtain-wall')?.command).toBe('wall.updateCurtainWall');
    });

    it('every element family the inspector can show is either WIRED or DECLARED — never silent', () => {
        // The no-lying-buttons invariant, as one assertion. A family that is neither routed
        // nor declared shows a Material control that dispatches nothing and says nothing.
        const INSPECTOR_FAMILIES = [
            'slab', 'wall', 'beam', 'stair', 'handrail', 'plumbing', 'lighting', 'structural',
            'door', 'window', 'ceiling', 'floor', 'roof', 'column', 'curtainwall', 'furniture', 'room',
        ];
        for (const f of INSPECTOR_FAMILIES) {
            const wired    = hasMaterialCommand(f);
            const declared = materialUnsupportedReason(f) !== undefined;
            expect(
                wired || declared,
                `"${f}" has neither a live material route nor a declared reason. Its Material ` +
                `control is enabled and inert — a button that lies (the L-267 lesson).`,
            ).toBe(true);
            // …and never BOTH: a family that works must not also claim it cannot.
            expect(wired && declared, `"${f}" is both wired AND declared unsupported.`).toBe(false);
        }
    });

    it('is a no-op with no runtime/bus, and when there is nothing to apply', () => {
        expect(dispatchSetMaterial(null, 'column', 'c1', { materialId: 'm' })).toBe(false);
        expect(dispatchSetMaterial({}, 'column', 'c1', { materialId: 'm' })).toBe(false);
        const { runtime, calls } = makeRuntime();
        expect(dispatchSetMaterial(runtime, 'column', 'c1', {})).toBe(false);
        expect(calls).toHaveLength(0);
    });

    it('multi-select: dispatches per element and counts only the families that can commit', () => {
        const { runtime, calls } = makeRuntime();
        const n = dispatchSetMaterialMany(
            runtime,
            [
                { id: 'ce1', type: 'ceiling' },
                { id: 'c1', type: 'column' },
                // §FIX-MATERIAL-REACHES-RECORD (G7): slab has a LIVE path now — it counts.
                { id: 's1', type: 'slab' },
                // beam still cannot render a material (its builder hardcodes two shared
                // materials) → not counted, not dispatched, declared instead.
                { id: 'b1', type: 'beam' },
            ],
            { materialId: 'm', materialColor: '#0a0b0c' },
        );
        expect(n).toBe(3);
        expect(calls.map(c => c.type)).toEqual([
            'ceiling.update', 'column.update', 'slab.updateDimensions',
        ]);
    });
});
