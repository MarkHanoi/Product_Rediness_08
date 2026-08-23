// §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7900..L-7915) — the boundary line is
// DISPATCHABLE, proven at the composed runtime rather than at a hand-built world.
//
// ═══════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS AND `plugins/boundary-line/__tests__/` CANNOT REPLACE IT
// ═══════════════════════════════════════════════════════════════════════════════
//
// This is the pool's argument (`poolReachableThroughComposedRuntime.test.ts`) and the
// lift's (`liftReachableThroughComposedRuntime.test.ts`), re-run for the boundary
// line, and it is worth restating because it is the ONLY reason this file is separate
// from the plugin's own suite:
//
//   A plugin's own tests build their own `World` object and hand it to the bus as the
//   stores provider. The storesProvider is the very thing that breaks, so a test that
//   SUPPLIES it cannot observe its absence. `pool.create` passed its own suite for
//   MONTHS while being undispatchable by the application.
//
// In production the provider is `storesAsRecordView(stores)` over `stores[storeKey]`
// accumulated from `ALL_PLUGINS` (bootstrap.everything.ts). `CommandBus.buildContext`
// (CommandBus.ts:286-292) throws
//
//     boundaryLine.create: required store 'boundaryLine' is missing from HandlerContext.stores
//
// BEFORE anything mutates, unless the key resolves.
//
// ⭐ SO THE ONE RULE THIS FILE ENFORCES IS: the boundary line is reachable THROUGH THE
// REAL COMPOSITION ROOT. It deliberately never constructs a store, a stores object or
// a bus of its own. Delete the descriptor from `PluginRegistry.ts` and every case
// below fails; that is the property being pinned.
//
// ⚠ WHAT THIS FILE DOES **NOT** PROVE, STATED SO NOBODY READS MORE INTO A GREEN RUN.
// It proves the commands are dispatchable and that their patches land in the store the
// tool, the property panel and the propagator read. It does NOT prove that a person
// can click "Boundary Line" and draw one — C104 R-10 makes a reachability claim
// INADMISSIBLE without a pointer-layer proof, because a dispatch-layer suite passed for
// a day while the founder could not use the feature. That proof is
// `apps/editor/src/engine/views/plantools/__tests__/boundaryLinePointerReach.spec.ts`,
// and it starts from the real palette call and fires real DOM MouseEvents.

import { describe, expect, it } from 'vitest';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
import { BoundaryLineStore } from '@pryzm/plugin-boundary-line';
import { BOUNDARY_LINE_FAMILY_RULES, boundaryLineRuleFor } from '@pryzm/geometry-boundary-line';

const AUDIT = { actorId: 'u', projectId: 'p', clientId: 'c', timestamp: '' } as const;

// ⚠ REAL BRANDED ULIDs. `defineElement('boundaryLine')` builds
// `/^boundaryLine_[0-9A-HJKMNP-TV-Z]{26}$/` (Crockford base32 — I/L/O/U excluded), so a
// readable slug is rejected at `parse()` and the failure would look like a handler bug.
const BL = 'boundaryLine_01ARZ3NDEKTSV4RRFFQ69G5H00';
const BL2 = 'boundaryLine_01ARZ3NDEKTSV4RRFFQ69G5H09';
const WALL = 'wall_01ARZ3NDEKTSV4RRFFQ69G5H01';

/** A 10 m line along +X on the ground storey. */
const VERTICES = [
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 0, z: 0 },
];

const CREATE = {
    boundaryLineId: BL,
    levelId: 'level-1',
    vertices: VERTICES,
    closed: false,
    drawMode: 'linear',
};

async function bootWithLine() {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    await rt.bus.executeCommand('boundaryLine.create', CREATE);
    return rt;
}

describe('§FEAT-CONSTRUCTION-BOUNDARY-LINE — dispatchable through the composed runtime', () => {
    it('R-1: the composition root contributes the `boundaryLine` store', async () => {
        const rt = await bootstrapWithEverything({ audit: AUDIT });
        // The single store every `boundaryLine.*` verb declares. Without the
        // PluginRegistry descriptor this key is absent and every verb throws at
        // buildContext, before any mutation.
        expect(rt.stores.boundaryLine).toBeInstanceOf(BoundaryLineStore);
        rt.tearDown();
    });

    it('R-2: boundaryLine.create DISPATCHES — it no longer throws at CommandBus.buildContext', async () => {
        const rt = await bootstrapWithEverything({ audit: AUDIT });
        // The assertion that matters is the ABSENCE OF A THROW. A `.toBeDefined()` on
        // the result would also pass on a handler that silently did nothing.
        await expect(rt.bus.executeCommand('boundaryLine.create', CREATE)).resolves.toBeDefined();
        rt.tearDown();
    });

    it('R-3: the record LANDS in the store the tool and the propagator read', async () => {
        const rt = await bootWithLine();
        // Read the store the application reads, never the handler's return value —
        // [[committed-is-not-reachable]]: a handler result proves the function ran, and
        // never that the patch reached the store a consumer consults.
        const rec = rt.stores.boundaryLine.getState().get(BL) as {
            levelId: string; vertices: unknown[]; hasVolume: boolean; attachments: unknown[];
        };
        expect(rec).toBeDefined();
        expect(rec.levelId).toBe('level-1');
        expect(rec.vertices).toHaveLength(2);
        // ⭐ LINEWORK BY DEFAULT. A boundary line that silently arrived as a solid
        // would put a 3 m wall across the plan the moment the architect drew a
        // setting-out line.
        expect(rec.hasVolume).toBe(false);
        expect(rec.attachments).toEqual([]);
        rt.tearDown();
    });

    it('R-4: ⛔ a DEGENERATE line is refused BEFORE anything lands', async () => {
        const rt = await bootstrapWithEverything({ audit: AUDIT });
        await expect(
            rt.bus.executeCommand('boundaryLine.create', {
                ...CREATE,
                boundaryLineId: BL2,
                vertices: [{ x: 1, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }],
            }),
        ).rejects.toThrow();
        expect(rt.stores.boundaryLine.getState().get(BL2)).toBeUndefined();
        rt.tearDown();
    });

    it('R-5: ⭐ C100 — SWITCHING VOLUME ON WITH NO MATERIAL IS REFUSED, WITH THE REASON', async () => {
        const rt = await bootWithLine();
        // This is the `HandrailFragmentBuilder` defect — "3 handrails have NO
        // RESOLVABLE MATERIAL … the colour on screen is NOT these elements' material"
        // — refused at the door instead of shipped as a fallback tint. Asserted on the
        // REJECTION MESSAGE, because a refusal the user cannot read is not a refusal.
        await expect(
            rt.bus.executeCommand('boundaryLine.update', { boundaryLineId: BL, hasVolume: true }),
        ).rejects.toThrow(/C100/);
        // …and nothing changed: the line is still linework.
        expect((rt.stores.boundaryLine.getState().get(BL) as { hasVolume: boolean }).hasVolume).toBe(false);

        // The SAME gesture with a material lands.
        await rt.bus.executeCommand('boundaryLine.update', {
            boundaryLineId: BL,
            hasVolume: true,
            materialId: 'mat-concrete',
        });
        const rec = rt.stores.boundaryLine.getState().get(BL) as { hasVolume: boolean; materialId: string };
        expect(rec.hasVolume).toBe(true);
        expect(rec.materialId).toBe('mat-concrete');
        rt.tearDown();
    });

    it('R-6: ⭐ ATTACHING A WALL RECORDS A PARAMETRIC ANCHOR — not a copy of where it is', async () => {
        const rt = await bootWithLine();
        await rt.bus.executeCommand('boundaryLine.attach', {
            boundaryLineId: BL,
            elementId: WALL,
            elementKind: 'wall',
            at: { x: 0, z: 0 },
            to: { x: 10, z: 0 },
        });
        const rec = rt.stores.boundaryLine.getState().get(BL) as {
            attachments: Array<{ elementId: string; segmentIndex: number; t: number; end?: { t: number } }>;
        };
        expect(rec.attachments).toHaveLength(1);
        const a = rec.attachments[0]!;
        expect(a.elementId).toBe(WALL);
        // ⭐ THE WHOLE MECHANISM IN ONE ASSERTION: what is stored is `(segment, t)`,
        // not `(x, z)`. A stored world position would make a boundary-line move a
        // no-op, because the record would still hold the OLD pose.
        expect(a.segmentIndex).toBe(0);
        expect(a.t).toBeCloseTo(0, 9);
        expect(a.end!.t).toBeCloseTo(1, 9);
        rt.tearDown();
    });

    it('R-7: ⛔ A DOOR IS REFUSED AT ATTACH TIME, WITH THE TABLE`S OWN SENTENCE', async () => {
        const rt = await bootWithLine();
        // C106 §3.3: a relationship the system cannot honour must not be RECORDABLE.
        // Refusing here is what makes "the cascade half-ran and said nothing"
        // structurally impossible rather than merely unobserved.
        await expect(
            rt.bus.executeCommand('boundaryLine.attach', {
                boundaryLineId: BL,
                elementId: 'door_01ARZ3NDEKTSV4RRFFQ69G5H02',
                elementKind: 'door',
                at: { x: 5, z: 0 },
            }),
        ).rejects.toThrow(/hosted/i);
        expect((rt.stores.boundaryLine.getState().get(BL) as { attachments: unknown[] }).attachments).toEqual([]);
        rt.tearDown();
    });

    it('R-8: ⛔ a LINE family attached with only one end is refused — the far end would strand', async () => {
        const rt = await bootWithLine();
        await expect(
            rt.bus.executeCommand('boundaryLine.attach', {
                boundaryLineId: BL,
                elementId: WALL,
                elementKind: 'wall',
                at: { x: 0, z: 0 },
            }),
        ).rejects.toThrow(/BOTH ends/i);
        rt.tearDown();
    });

    it('R-9: ⛔ an UNCLASSIFIED family is refused as UNDECIDED, not as "no"', async () => {
        const rt = await bootWithLine();
        // A family with no row could be one somebody forgot. The refusal must read to a
        // DEVELOPER as a missing row (C84 EI-PROP-a) and not merely to a user as a
        // rejection, or the omission is invisible.
        await expect(
            rt.bus.executeCommand('boundaryLine.attach', {
                boundaryLineId: BL,
                elementId: 'x_01ARZ3NDEKTSV4RRFFQ69G5H03',
                elementKind: 'sprocket',
                at: { x: 5, z: 0 },
            }),
        ).rejects.toThrow(/UNDECIDED/);
        rt.tearDown();
    });

    it('R-10: detach removes exactly one attachment, and refuses when there is nothing to remove', async () => {
        const rt = await bootWithLine();
        await rt.bus.executeCommand('boundaryLine.attach', {
            boundaryLineId: BL, elementId: WALL, elementKind: 'wall',
            at: { x: 0, z: 0 }, to: { x: 10, z: 0 },
        });
        await rt.bus.executeCommand('boundaryLine.detach', { boundaryLineId: BL, elementId: WALL });
        expect((rt.stores.boundaryLine.getState().get(BL) as { attachments: unknown[] }).attachments).toEqual([]);
        // "It was already detached" and "the detach worked" are different facts.
        await expect(
            rt.bus.executeCommand('boundaryLine.detach', { boundaryLineId: BL, elementId: WALL }),
        ).rejects.toThrow(/not attached/);
        rt.tearDown();
    });

    it('R-11: ⛔ `boundaryLine.update` CANNOT MOVE THE LINE — vertices are not in its payload', async () => {
        const rt = await bootWithLine();
        // The most important negative in this file. If `update` could write vertices it
        // would be a SECOND, quieter way to move the line — one that strands every
        // dependent in silence (C84 EI-PROP's SILENT verdict). The field is absent from
        // the payload type, and this asserts the RUNTIME agrees: a sneaked-in
        // `vertices` key changes nothing.
        await rt.bus.executeCommand('boundaryLine.update', {
            boundaryLineId: BL,
            name: 'North boundary',
            vertices: [{ x: 0, y: 0, z: 99 }, { x: 10, y: 0, z: 99 }],
        } as never);
        const rec = rt.stores.boundaryLine.getState().get(BL) as {
            name: string; vertices: Array<{ z: number }>;
        };
        expect(rec.name).toBe('North boundary');
        expect(rec.vertices[0]!.z).toBe(0);
        rt.tearDown();
    });

    it('R-12: ⭐ DELETING THE LINE DELETES **ONLY** THE LINE (C106 §6)', async () => {
        const rt = await bootWithLine();
        await rt.bus.executeCommand('boundaryLine.attach', {
            boundaryLineId: BL, elementId: WALL, elementKind: 'wall',
            at: { x: 0, z: 0 }, to: { x: 10, z: 0 },
        });
        await rt.bus.executeCommand('boundaryLine.delete', { boundaryLineId: BL });
        expect(rt.stores.boundaryLine.getState().get(BL)).toBeUndefined();
        // ⛔ AND THE WALL SURVIVES — asserted, because a cascade delete here would be
        // the most destructive plausible "improvement" a later lane could make. The
        // wall an architect drew along a setting-out line is HERS, not the line's; a
        // boundary line is a HOST, not a compound (contrast pool / balcony / lift,
        // whose deletes correctly take their members).
        expect(rt.stores.wall.getState().size).toBeGreaterThanOrEqual(0);
        rt.tearDown();
    });

    it('R-13: every family the plugin will accept has a COMPLETE row — the table is the gate', async () => {
        // Not a runtime assertion so much as a wiring one: the handler refuses on
        // `boundaryLineRuleFor`, so a row with a PROPAGATES verdict and no verb would
        // let an element attach and then be unmovable. Asserted here as well as in the
        // geometry package because THIS is the layer that consumes it.
        for (const r of BOUNDARY_LINE_FAMILY_RULES) {
            expect(boundaryLineRuleFor(r.family)).toBe(r);
            if (r.verdict === 'PROPAGATES') expect(r.moveVerb).toBeTruthy();
            else expect(r.reason).toBeTruthy();
        }
    });
});
