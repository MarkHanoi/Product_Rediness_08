// ─── §ROOF-HOSTED-OPENINGS — the founder's ask, proved through the real path ─
//
// "First time asking for hosted elements on Roof — can you check if we could
//  create openings on roofs? I would like to be able to host lucernarios in roofs
//  also — windows hosted on roof planar surfaces of the roof."
//
// ⚠ §COMMITTED-IS-NOT-REACHABLE. Four fixes in one earlier session ran nowhere
// because they were proved at a pure function's return value. So every assertion
// below goes through the REAL `CreateRoofOpeningCommand`, reads the record back
// out of the store via `getByHostId` — the exact call `RoofFragmentBuilder`
// makes — and then feeds THAT record, mapped exactly as the builder maps it,
// into `RoofGeometryBuilder.generate`. The final assertion is a ray cast through
// the emitted vertex buffer. Command → store → geometry, with no step assumed.
//
// Contracts: C15 (hosted elements — the host relationship must be DETERMINED,
// not guessed; see the command's header for where a roof host differs from the
// wall model C15 is written around), C11 (element creation pipeline).

import { describe, it, expect } from 'vitest';
import { CreateRoofOpeningCommand } from '../src/roofs/CreateRoofOpeningCommand';
import { RoofGeometryBuilder } from '@pryzm/geometry-roof';
import type { CommandContext } from '../src/types';

/** A 10 × 6 m roof at world (20, 10); the polygon is stored CENTROID-LOCAL. */
const ROOF_CENTROID: [number, number] = [20, 10];
const ROOF_POLYGON: Array<[number, number]> = [[-5, -3], [5, -3], [5, 3], [-5, 3]];

function makeRoof(over: Record<string, unknown> = {}) {
    return {
        id: 'roof-1',
        type: 'roof',
        levelId: 'level-2',
        roofType: 'flat',
        footprint: { polygon: ROOF_POLYGON, centroid: ROOF_CENTROID },
        overhang: 0,
        baseOffset: 0,
        thickness: 0.25,
        properties: {},
        metadata: { createdAt: 0, modifiedAt: 0, createdBy: 't', version: 1 },
        ...over,
    };
}

/**
 * A minimal opening store with the REAL `OpeningStore` surface the builder uses
 * (`add` / `getByHostId` / `remove`). Kept local so the test needs no
 * ProjectContext or DOM event bus, but the method names are load-bearing: a
 * rename in the real store makes this fixture stop matching, which is the point.
 */
function makeStores(roof: Record<string, unknown> | null) {
    const openings = new Map<string, any>();
    const rebuilds: string[] = [];
    return {
        rebuilds,
        openings,
        stores: {
            roofStore: {
                getById: (id: string) => (roof && (roof as any).id === id ? roof : null),
                triggerRebuild: (id: string) => { rebuilds.push(id); },
            },
            openingStore: {
                add: (o: any) => { openings.set(o.id, structuredClone(o)); },
                remove: (id: string) => { openings.delete(id); },
                getById: (id: string) => openings.get(id),
                getByHostId: (hostId: string) => [...openings.values()].filter(o => o.hostId === hostId),
            },
        } as any,
    };
}

function ctxFor(roof: Record<string, unknown> | null) {
    const s = makeStores(roof);
    const context = {
        stores: s.stores,
        bimManager: { registerElement: () => {}, unregisterElement: () => {} },
    } as unknown as CommandContext;
    return { ...s, context };
}

/** Exactly what `RoofFragmentBuilder._openingHoles` does with the stored record. */
function holesAsBuilderReadsThem(stores: any, roofId: string): Array<Array<[number, number]>> {
    return stores.openingStore.getByHostId(roofId)
        .filter((o: any) => Array.isArray(o.profile) && o.profile.length >= 3)
        .map((o: any) => o.profile.map((p: any) => [p.x, p.y] as [number, number]));
}

/** Downward-ray triangle count at a plan point — a test-local oracle. */
function hitsAt(geo: any, x: number, z: number): number {
    const pos = geo.getAttribute('position');
    const idx = geo.getIndex();
    const v = (i: number) => [pos.getX(i), pos.getY(i), pos.getZ(i)] as [number, number, number];
    let hits = 0;
    for (let t = 0; t < idx.count; t += 3) {
        const a = v(idx.getX(t)), b = v(idx.getX(t + 1)), c = v(idx.getX(t + 2));
        const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
        if (Math.abs(d) < 1e-12) continue;
        const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d;
        const l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d;
        if (l1 >= 0 && l2 >= 0 && 1 - l1 - l2 >= 0) hits++;
    }
    return hits;
}

describe('§ROOF-HOSTED-OPENINGS — command → store → built geometry', () => {
    it('a skylight on a FLAT roof reaches the vertex buffer as an actual hole', () => {
        const roof = makeRoof();
        const { context, stores, rebuilds } = ctxFor(roof);

        // World (21.5, 10.5) → roof-local (1.5, 0.5).
        const cmd = new CreateRoofOpeningCommand({
            id: 'skylight-1', roofId: 'roof-1',
            worldX: 21.5, worldZ: 10.5, widthM: 1.2, heightM: 1.2,
        });
        expect(cmd.canExecute(context).ok).toBe(true);

        const res = cmd.execute(context);
        expect(res.success).toBe(true);
        expect(rebuilds).toContain('roof-1');

        // The record the builder will read.
        const stored = stores.openingStore.getByHostId('roof-1');
        expect(stored).toHaveLength(1);
        expect(stored[0].type).toBe('opening');
        expect(stored[0].hostId).toBe('roof-1');
        expect(stored[0].levelId).toBe('level-2');   // inherited from the HOST roof
        expect(stored[0].properties.hostKind).toBe('roof');
        expect(stored[0].properties.roofFace.index).toBe(0);
        expect(stored[0].properties.roofFace.widthM).toBe(1.2);

        // …fed through the builder's own mapping, into the real geometry builder.
        const holes = holesAsBuilderReadsThem(stores, 'roof-1');
        expect(holes).toHaveLength(1);
        const geo = RoofGeometryBuilder.generate(roof as any, holes);

        expect(geo.userData.pryzmRoofOpeningsCut).toBe(1);
        expect(hitsAt(geo, 1.5, 0.5)).toBe(0);                    // the void
        expect(hitsAt(geo, -3, 0.5)).toBeGreaterThanOrEqual(2);   // roof still there

        // Undo removes the record, and the roof heals back to solid.
        cmd.undo(context);
        expect(stores.openingStore.getByHostId('roof-1')).toHaveLength(0);
        const healed = RoofGeometryBuilder.generate(roof as any, holesAsBuilderReadsThem(stores, 'roof-1'));
        expect(hitsAt(healed, 1.5, 0.5)).toBeGreaterThanOrEqual(2);
    });

    it('on a GABLE roof the skylight is hosted on the slope that CONTAINS it', () => {
        const roof = makeRoof({ roofType: 'gable', slope: 0.5 });
        const south = ctxFor(roof);
        const north = ctxFor(roof);

        // World z = 8.5 → roof-local z = −1.5 (south slope);
        // world z = 11.5 → roof-local z = +1.5 (north slope).
        new CreateRoofOpeningCommand({ id: 'sk-s', roofId: 'roof-1', worldX: 20, worldZ: 8.5, widthM: 1, heightM: 1 })
            .execute(south.context);
        new CreateRoofOpeningCommand({ id: 'sk-n', roofId: 'roof-1', worldX: 20, worldZ: 11.5, widthM: 1, heightM: 1 })
            .execute(north.context);

        const fs = south.stores.openingStore.getById('sk-s').properties.roofFace.index;
        const fn = north.stores.openingStore.getById('sk-n').properties.roofFace.index;
        // ⚠ THE CONTROL: the two faces share ONE `footprint.centroid`, so any
        // nearest-centroid rule returns the SAME face for both points. Only
        // containment can separate them.
        expect(fs).not.toBe(fn);

        const geo = RoofGeometryBuilder.generate(roof as any, holesAsBuilderReadsThem(south.stores, 'roof-1'));
        expect(hitsAt(geo, 0, -1.5)).toBe(0);                     // cut on the south slope
        expect(hitsAt(geo, 0, 1.5)).toBeGreaterThanOrEqual(2);    // north slope untouched
    });

    it('THE FOUNDER CASE — a SLOPED roof over an L-SHAPED plan hosts a lucernario on one wing', () => {
        // "When I am targeting roof — I am targeting SLOPED roofs", over an
        // L-shaped building. §ROOF-CONCAVE-DECOMPOSE builds this as one gable per
        // wing (its own log says `requestedKind=hip chosenKind=gable-per-wing`),
        // so the roof has FOUR pitched faces and the question "which one" is the
        // whole feature — not a guard on it.
        //
        //  z=+7  ┌────┐
        //        │ N  │        north wing: x∈[−6,0], z∈[−1,+7]
        //  z=−1  ├────┴──────┐
        //        │    S      │ south wing: x∈[−6,+6], z∈[−7,−1]
        //  z=−7  └───────────┘
        const L: Array<[number, number]> = [[-6, -7], [6, -7], [6, -1], [0, -1], [0, 7], [-6, 7]];
        const roof = makeRoof({ roofType: 'hip', slope: 0.4, footprint: { polygon: L, centroid: ROOF_CENTROID } });
        const { context, stores } = ctxFor(roof);

        // World (23, 4.5) → roof-local (3, −5.5): inside the SOUTH wing's LOWER
        // slope (its ridge runs at z = −4), and clear of it. The north wing does
        // not reach x = 3 at all.
        const res = new CreateRoofOpeningCommand({
            id: 'lucernario-1', roofId: 'roof-1', worldX: 23, worldZ: 4.5, widthM: 1.2, heightM: 1.2,
        }).execute(context);
        expect(res.info?.join(' ')).not.toMatch(/inside NONE|does not fit/);
        expect(res.success).toBe(true);

        const stored = stores.openingStore.getById('lucernario-1');
        const faceIndex = stored.properties.roofFace.index;

        const geo = RoofGeometryBuilder.generate(roof as any, holesAsBuilderReadsThem(stores, 'roof-1'));
        expect(geo.userData.pryzmRoofOpeningsCut).toBe(1);
        expect(hitsAt(geo, 3, -5.5)).toBe(0);                    // the void, on its slope
        expect(hitsAt(geo, -4.5, 4)).toBeGreaterThanOrEqual(2);  // the OTHER wing untouched
        expect(hitsAt(geo, -3, -5.5)).toBeGreaterThanOrEqual(2); // same slope, elsewhere: solid

        // A skylight on the other wing must land on a DIFFERENT face — the proof
        // that four faces are being told apart, not collapsed to one.
        const other = ctxFor(roof);
        new CreateRoofOpeningCommand({
            id: 'lucernario-2', roofId: 'roof-1', worldX: 20 - 4.5, worldZ: 10 + 4, widthM: 1, heightM: 1,
        }).execute(other.context);
        const otherFace = other.stores.openingStore.getById('lucernario-2')?.properties.roofFace.index;
        expect(otherFace).toBeDefined();
        expect(otherFace).not.toBe(faceIndex);
    });

    it('a skylight that STRADDLES a ridge is refused, naming both slopes', () => {
        const roof = makeRoof({ roofType: 'gable', slope: 0.5 });
        const { context, openings } = ctxFor(roof);

        // Centre 0.3 m off the ridge, 2 m up the slope → it crosses the ridge.
        const res = new CreateRoofOpeningCommand({
            id: 'sk-straddle', roofId: 'roof-1', worldX: 20, worldZ: 10 - 0.3, widthM: 1, heightM: 2,
        }).execute(context);

        expect(res.success).toBe(false);
        const why = res.info?.join(' ') ?? '';
        expect(why).toMatch(/does not fit inside face #\d/);
        expect(why).toMatch(/face #\d/);
        expect(why).toMatch(/refused rather than\s+clipped/);
        // ⛔ NOT clipped, NOT silently carved into one slope.
        expect(openings.size).toBe(0);
    });

    it('a point on NO face of the roof REFUSES, names the roof, and writes nothing', () => {
        const roof = makeRoof();
        const { context, stores, openings } = ctxFor(roof);

        // World (60, 60) is far outside the 10 × 6 m roof at (20, 10).
        const cmd = new CreateRoofOpeningCommand({
            id: 'skylight-nope', roofId: 'roof-1', worldX: 60, worldZ: 60, widthM: 1, heightM: 1,
        });

        const check = cmd.canExecute(context);
        expect(check.ok).toBe(false);
        expect(check.ok === false && check.reason).toContain('roof-1');
        expect(check.ok === false && check.reason).toMatch(/inside NONE/);

        const res = cmd.execute(context);
        expect(res.success).toBe(false);
        expect(res.info?.join(' ')).toMatch(/inside NONE/);
        // …and no opening was minted. A refusal that still writes is not a refusal.
        expect(openings.size).toBe(0);
    });

    it('a roof whose faces cannot be derived refuses with THAT reason, not with "not on the roof"', () => {
        const roof = makeRoof({ roofType: 'hip', slope: 0.4 });
        const { context, stores, openings } = ctxFor(roof);

        const res = new CreateRoofOpeningCommand({
            id: 'sk-hip', roofId: 'roof-1', worldX: 20, worldZ: 10, widthM: 1, heightM: 1,
        }).execute(context);

        expect(res.success).toBe(false);
        const why = res.info?.join(' ') ?? '';
        expect(why).toContain('Cannot host a skylight on roof roof-1');
        expect(why).toContain('hip');
        expect(why).not.toMatch(/inside NONE/); // a DIFFERENT answer, told apart
        expect(openings.size).toBe(0);
    });

    it('a missing roof refuses rather than minting an orphan opening', () => {
        const { context, openings } = ctxFor(null);
        const res = new CreateRoofOpeningCommand({
            id: 'sk-x', roofId: 'roof-gone', worldX: 0, worldZ: 0, widthM: 1, heightM: 1,
        }).execute(context);
        expect(res.success).toBe(false);
        expect(openings.size).toBe(0);
    });

    it('the stored profile is the AUTHORED slope rectangle projected — not a plan rectangle', () => {
        const slope = 0.577350269; // 30°
        const roof = makeRoof({ roofType: 'shed', slope });
        const { context, stores, openings } = ctxFor(roof);

        new CreateRoofOpeningCommand({
            id: 'sk-p', roofId: 'roof-1', worldX: 21, worldZ: 10, widthM: 1.2, heightM: 1.2,
        }).execute(context);

        const profile = stores.openingStore.getById('sk-p').profile as Array<{ x: number; y: number }>;
        const eaveSide = Math.hypot(profile[1]!.x - profile[0]!.x, profile[1]!.y - profile[0]!.y);
        const slopeSide = Math.hypot(profile[2]!.x - profile[1]!.x, profile[2]!.y - profile[1]!.y);

        expect(eaveSide).toBeCloseTo(1.2, 9);
        // Up-slope, the PLAN footprint is shorter by cos 30°. If this ever equals
        // 1.2 the implementation has silently reverted to authoring from plan and
        // every skylight on a pitched roof is 15 % too big on the surface.
        expect(slopeSide).toBeCloseTo(1.2 * Math.cos(Math.atan(slope)), 9);
        expect(slopeSide).toBeLessThan(1.2);
    });
});
