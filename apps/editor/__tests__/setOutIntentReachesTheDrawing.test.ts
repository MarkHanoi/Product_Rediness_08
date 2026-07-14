// @vitest-environment happy-dom
//
// §FEAT-SET-OUT-INTENT (L-289) — DOES PICKING "SET OUT" ACTUALLY CHANGE THE DRAWING?
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS SUITE ASSERTS ON GEOMETRY AND NOT ON THE INTENT RECORD
// ─────────────────────────────────────────────────────────────────────────────
// The bug this feature exists to close is a REACHABILITY bug: PRYZM shipped a complete
// live-documentation engine (L-286) behind `ViewDefinition.setOut.live`, a field with a
// reader and NO WRITER. A guard that asserts `intent.documentation.setOutLive === true`
// would have passed on the broken build too — the intent record was never the problem.
// ASK WHAT THE BUG WOULD SCORE. It scores 1.000. That is not a guard.
//
// So every assertion below ends at one of the two things the product actually consumes:
//
//   1. THE EMITTED SYMBOL GEOMETRY — `DoorPlanSymbolBuilder._computeSwingGeometry()`, the
//      function whose output is injected into the TechnicalDrawing. If Set Out does not
//      change what this emits, the founder sees no change, whatever the record says.
//   2. THE FIELD `registerSetOut()` GATES ON — `setOutIntentOf(viewId)?.live`, imported from
//      the annotations agent's own module, not re-implemented here. If that predicate is
//      false, the reconcile loop `continue`s and NO tag and NO dimension is ever derived.
//
// Contracts: C09 §4.6 / P7 (intent is a domain concept), ADR-121 §4.2 (the LOD tiers),
// ADR-121 §4.3 (ONE resolver), C16 (command authoring).

import { describe, it, expect, beforeEach } from 'vitest';
import {
    viewDefinitionStore,
    viewIntentInstanceStore,
    visibilityIntentStore,
    resolveEffectiveDetailLevel,
    SYSTEM_INTENT_IDS,
    cloneSystemIntents,
} from '@pryzm/core-app-model';
import { AssignViewIntentCommand } from '@pryzm/command-registry';
import { DoorPlanSymbolBuilder } from '@pryzm/geometry-door';
// The REAL reader. Not a re-implementation — if `registerSetOut` ever changes which field it
// gates on, this import breaks with it, which is the entire point.
import { setOutIntentOf } from '@app/ui/documentation/setOut';

type Lod = 'coarse' | 'medium' | 'fine';

const VIEW_ID = 'vd-set-out-1';
const DOOR_ID = 'd1';

// The same fixture the door's own LOD suite uses (geometry-door/__tests__/
// DoorPlanSymbolBuilder.detailLevel.test.ts) — a 900 mm single door in a 200 mm wall.
const WALL = { baseLine: [{ x: 0, z: 0 }, { x: 4, z: 0 }], thickness: 0.2, levelId: 'L0' };
const DOOR = {
    id: DOOR_ID, wallId: 'w1', width: 0.9, offset: 1.0,
    doorType: 'single' as const, hingesSide: 'left', swingDirection: 'inward',
};

type Geo = { getAttribute(n: string): { array: ArrayLike<number> } } | null;
interface Geos { cut: Geo; proj: Geo; ghost: Geo }

/** What the projector ACTUALLY EMITS for this door at the detail level THIS VIEW resolves to. */
function emitForView(viewId: string): { cut: number[]; proj: number[]; ghost: number[] } {
    const lod = resolveEffectiveDetailLevel(DOOR_ID, viewId, {
        elementType: 'door',
        category:    'door',
    }) as Lod;
    const geos = (new DoorPlanSymbolBuilder() as unknown as {
        _computeSwingGeometry(d: unknown, w: unknown, lod: Lod): Geos | null;
    })._computeSwingGeometry(DOOR, WALL, lod)!;
    return {
        cut:   Array.from(geos.cut?.getAttribute('position').array ?? []),
        proj:  Array.from(geos.proj?.getAttribute('position').array ?? []),
        ghost: Array.from(geos.ghost?.getAttribute('position').array ?? []),
    };
}

const segCount = (flat: number[]): number => flat.length / 6;
const totalSegs = (g: { cut: number[]; proj: number[]; ghost: number[] }): number =>
    segCount(g.cut) + segCount(g.proj) + segCount(g.ghost);

/** Undirected segment keys — for the strict-superset invariant (ADR-121 §4.2). */
function segKeys(g: { cut: number[]; proj: number[]; ghost: number[] }): Set<string> {
    const out = new Set<string>();
    for (const flat of [g.cut, g.proj, g.ghost]) {
        for (let i = 0; i < flat.length; i += 6) {
            const a = [flat[i].toFixed(5), flat[i + 2].toFixed(5)].join();
            const b = [flat[i + 3].toFixed(5), flat[i + 5].toFixed(5)].join();
            out.add([a, b].sort().join('|'));
        }
    }
    return out;
}

/** A view SAVED BEFORE L-252 raised the default: it carries its own stored 'medium'. */
function makeSavedView(id = VIEW_ID): void {
    viewDefinitionStore.create({
        id, name: 'Level 0 Plan', viewType: 'plan',
        spatial: { levelId: 'L0' },
        output:  { scale: 50, detailLevel: 'medium' },
    });
}

function bind(intentId: string, viewId = VIEW_ID): AssignViewIntentCommand {
    const cmd = new AssignViewIntentCommand({ viewId, intentId });
    expect(cmd.canExecute({} as never).ok).toBe(true);
    expect(cmd.execute({} as never).success).toBe(true);
    return cmd;
}

describe('§FEAT-SET-OUT-INTENT (L-289) — the "Set Out" preset reaches the DRAWING', () => {
    beforeEach(() => {
        viewDefinitionStore.reset();
        viewIntentInstanceStore.reset();
        visibilityIntentStore.deserialize({ version: 1, intents: cloneSystemIntents() });
        makeSavedView();
    });

    it('the preset EXISTS in the same dropdown as the other four', () => {
        const all = visibilityIntentStore.getAll();
        const setOut = all.find(i => i.id === SYSTEM_INTENT_IDS.setOut);
        expect(setOut, 'Set Out must be pickable from the Visibility Intent dropdown').toBeDefined();
        expect(setOut!.name).toBe('Set Out — Live Documentation');
        expect(all).toHaveLength(5);   // the original four are still there
    });

    // ══ THE HEADLINE. The founder's saved view is on 'medium'; LOD-300 detail is ABSENT. ══
    it('BEFORE: a SAVED view is on medium — the door draws NO rebate, NO lever, NO closed-leaf ghost', () => {
        expect(viewDefinitionStore.get(VIEW_ID)!.output!.detailLevel).toBe('medium');

        const before = emitForView(VIEW_ID);
        // The LOD-300 features, asserted as GEOMETRY, not as an enum:
        //   ghost   = the closed-leaf rectangle (4 segments) — 'fine' only.
        //   rebate  = 2 stop faces × 2 jambs (4 cut segments) — 'fine' only.
        expect(segCount(before.ghost), 'medium must emit no closed-leaf ghost').toBe(0);
        expect(totalSegs(before)).toBeGreaterThan(0);   // it IS drawing a door — just not a fine one
    });

    it('AFTER: binding "Set Out" makes the SAME door emit STRICTLY MORE geometry — the dial turns', () => {
        const before = emitForView(VIEW_ID);

        bind(SYSTEM_INTENT_IDS.setOut);

        const after = emitForView(VIEW_ID);

        // 1. The projector emits MORE. This is the assertion that cannot be faked by a record.
        expect(totalSegs(after)).toBeGreaterThan(totalSegs(before));

        // 2. The specific LOD-300 construction detail the founder is looking for now exists.
        //    The REBATE and the GHOST are unconditional at 'fine', so they are pinned exactly.
        expect(segCount(after.ghost), 'fine must emit the closed-leaf ghost').toBe(4);
        expect(segCount(after.cut)).toBe(segCount(before.cut) + 4);    // the rebate: 2 stops × 2 jambs
        //    The IRONMONGERY (lever + escutcheon) is conditional on the door's resolved hardware,
        //    so its exact segment count belongs to the fixture that controls the system type —
        //    it is pinned at +8 in geometry-door/__tests__/DoorPlanSymbolBuilder.detailLevel.test.ts.
        //    Here we assert only what must be true for ANY door: the projection linework GROWS.
        //    (Non-vacuous: it goes red the moment 'fine' stops adding hardware to the projection.)
        expect(segCount(after.proj)).toBeGreaterThan(segCount(before.proj));

        // 3. ADR-121 §4.2 — LOD 300 is a STRICT SUPERSET of LOD 200. A tier may only ADD.
        const hi = segKeys(after);
        for (const seg of segKeys(before)) {
            expect(hi.has(seg), 'Set Out must not DELETE a line the medium view drew').toBe(true);
        }
    });

    it('AFTER: the view is LIVE — the exact predicate registerSetOut() gates on returns true', () => {
        expect(setOutIntentOf(VIEW_ID)?.live ?? false).toBe(false);   // opt-in: not live before

        bind(SYSTEM_INTENT_IDS.setOut);

        // `registerSetOut` does: `if (!setOutIntentOf(viewId)?.live) continue;`
        // If this is false, NO tag and NO dimension is ever derived, for any model change.
        expect(setOutIntentOf(VIEW_ID)?.live).toBe(true);
    });

    it('the preset does NOT wipe the settings the user already chose (scale survives)', () => {
        bind(SYSTEM_INTENT_IDS.setOut);
        expect(viewDefinitionStore.get(VIEW_ID)!.output!.scale).toBe(50);
        expect(viewDefinitionStore.get(VIEW_ID)!.output!.detailLevel).toBe('fine');
    });

    // ══ PLAN *AND* ELEVATION. A documentation feature that lands plan-only is the disease. ══
    it('carries PLAN and ELEVATION modifiers — not a plan-only preset (ADR-121 §1)', () => {
        const setOut = visibilityIntentStore.get(SYSTEM_INTENT_IDS.setOut)!;
        const viewTypes = new Set(setOut.viewTypeModifiers.map(m => m.viewType));
        expect(viewTypes.has('plan')).toBe(true);
        expect(viewTypes.has('elevation')).toBe(true);
        expect(viewTypes.has('section')).toBe(true);
    });

    it('an ELEVATION view bound to Set Out is ALSO live and ALSO fine', () => {
        viewDefinitionStore.create({
            id: 'vd-elev-1', name: 'North Elevation', viewType: 'elevation',
            spatial: { levelId: 'L0' }, output: { detailLevel: 'medium' },
        });
        bind(SYSTEM_INTENT_IDS.setOut, 'vd-elev-1');

        expect(setOutIntentOf('vd-elev-1')?.live).toBe(true);
        // ADR-121 §4.3 — ONE resolver. The elevation asks the SAME function the plan asks.
        expect(resolveEffectiveDetailLevel(DOOR_ID, 'vd-elev-1', { elementType: 'door', category: 'door' }))
            .toBe('fine');
    });

    // ══ DO NOT BREAK THE EXISTING FOUR. ══
    it('the four original intents are APPEARANCE-ONLY — they touch neither detailLevel nor setOut', () => {
        const untouched = [
            SYSTEM_INTENT_IDS.architecturalDocumentation,
            SYSTEM_INTENT_IDS.architecturalPlanCurrentLevel,
            SYSTEM_INTENT_IDS.cleanPresentation,
            SYSTEM_INTENT_IDS.structuralCoordination,
        ];
        for (const intentId of untouched) {
            viewDefinitionStore.reset();
            viewIntentInstanceStore.reset();
            makeSavedView();

            const before = JSON.stringify(viewDefinitionStore.get(VIEW_ID)!.output);
            const beforeGeo = totalSegs(emitForView(VIEW_ID));

            bind(intentId);

            // Byte-compare the resolved output, and the DRAWING it produces.
            expect(JSON.stringify(viewDefinitionStore.get(VIEW_ID)!.output)).toBe(before);
            expect(viewDefinitionStore.get(VIEW_ID)!.setOut).toBeUndefined();
            expect(setOutIntentOf(VIEW_ID)?.live ?? false).toBe(false);
            expect(totalSegs(emitForView(VIEW_ID))).toBe(beforeGeo);
        }
    });

    // ══ UNDO. Binding an intent is one command; it must be one reversible command. ══
    it('UNDO restores the view exactly — detail level AND liveness go back', () => {
        const beforeGeo = totalSegs(emitForView(VIEW_ID));

        const cmd = bind(SYSTEM_INTENT_IDS.setOut);
        expect(setOutIntentOf(VIEW_ID)?.live).toBe(true);

        cmd.undo({} as never);

        expect(viewDefinitionStore.get(VIEW_ID)!.output!.detailLevel).toBe('medium');
        expect(viewDefinitionStore.get(VIEW_ID)!.output!.scale).toBe(50);
        expect(setOutIntentOf(VIEW_ID)?.live ?? false).toBe(false);
        expect(totalSegs(emitForView(VIEW_ID))).toBe(beforeGeo);   // the DRAWING is back too
    });
});
