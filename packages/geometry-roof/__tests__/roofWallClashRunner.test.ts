/**
 * §GE-06-ROOF-WALL-WIRE — the runner's HONESTY contract, at its own package.
 *
 * The end-to-end proof that `clash-run` reaches this code lives in
 * `apps/editor/__tests__/RoofWallClashVerbReach.test.ts`, dispatched through a
 * real CommandBus — that is the load-bearing one, and it is deliberately NOT
 * duplicated here.
 *
 * What this file guards is the half that would otherwise only be caught two
 * packages away: the runner's own `[]` discipline. `roofWallClashRunner.ts`
 * lives here, ships in this package's CI, and its single most breakable
 * property is the one every future edit is tempted to break — returning an
 * empty findings list from a path that could not read the model, because that
 * path is shorter to write and looks green.
 *
 * C70 L-INV-1: "I found nothing" and "I could not look" are never the same
 * value. Each test below names which of the two it is asserting.
 */

import { describe, expect, it } from 'vitest';
import { createRoofWallClashRunner, type RoofWallClashSource } from '../src/pure/roofWallClashRunner';

const SQUARE: Array<[number, number]> = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
];

const wall = (height: number) => ({
    id: 'w-1',
    baseLine: [
        { x: 1, z: 5 },
        { x: 9, z: 5 },
    ],
    height,
});

/** Level elevation 0, flat roof origin 3.0, thickness 0.3 ⇒ soffit at 2.7 m. */
function source(over: Partial<RoofWallClashSource> = {}, wallHeight = 2.7): RoofWallClashSource {
    return {
        levelIds: () => ['L0'],
        roofsOnLevel: () => [
            { id: 'r-1', footprint: { polygon: SQUARE }, roofType: 'flat', baseOffset: 3, thickness: 0.3, overhang: 0 },
        ],
        wallsOnLevel: () => [wall(wallHeight)],
        levelElevation: () => 0,
        ...over,
    };
}

describe('roofWallClashRunner — "found nothing" (the legal empty)', () => {
    it('a readable, conforming model RAN and found zero', () => {
        const out = createRoofWallClashRunner(source()).run();
        expect(out.kind).toBe('ran');
        // Narrowed, so a future change of arm shape fails to compile here.
        if (out.kind !== 'ran') throw new Error('unreachable');
        expect(out.findings).toEqual([]);
    });

    it('a readable model with NO roofs RAN and found zero — nothing to clash IS an answer', () => {
        const out = createRoofWallClashRunner(source({ roofsOnLevel: () => [] })).run();
        expect(out.kind).toBe('ran');
    });

    it('a readable model with NO walls RAN and found zero', () => {
        const out = createRoofWallClashRunner(source({ wallsOnLevel: () => [] })).run();
        expect(out.kind).toBe('ran');
    });

    it('an empty but READABLE level list RAN — no levels is not a failure to read', () => {
        const out = createRoofWallClashRunner(source({ levelIds: () => [] })).run();
        expect(out.kind).toBe('ran');
    });
});

describe('roofWallClashRunner — "could not look" (never an empty)', () => {
    it('an unreadable level elevation REFUSES rather than reading false-clean', () => {
        // ⚠ The wall in this fixture DOES clash if the elevation were known.
        // Defaulting the missing elevation to 0 would have produced a green
        // "no clashes" over a model with a real penetration — the §L-616 shape.
        const out = createRoofWallClashRunner(source({ levelElevation: () => undefined }, 3.2)).run();
        expect(out.kind).toBe('unavailable');
        if (out.kind !== 'unavailable') throw new Error('unreachable');
        expect(out.reason).toBe('RELATIONSHIP_NOT_READABLE');
        expect(out.detail).toContain('L0');
        // There is no findings key to misread — the arms are structurally
        // different, not the same object with a flag.
        expect('findings' in out).toBe(false);
    });

    it('a roof with no footprint REFUSES — a roof that cannot be outlined is not "clean"', () => {
        const out = createRoofWallClashRunner(
            source({ roofsOnLevel: () => [{ id: 'r-1', roofType: 'flat', baseOffset: 3, thickness: 0.3 }] }, 3.2),
        ).run();
        expect(out.kind).toBe('unavailable');
        if (out.kind !== 'unavailable') throw new Error('unreachable');
        expect(out.detail).toContain('r-1');
    });

    it('an absent model source REFUSES rather than reporting a clean building', () => {
        const out = createRoofWallClashRunner({} as unknown as RoofWallClashSource).run();
        expect(out.kind).toBe('unavailable');
    });

    it('ONE unreadable level refuses the WHOLE run, not just that level', () => {
        // Partial silence is the subtle version of the same lie: the readable
        // levels' emptiness would be read as covering the unreadable one too.
        const out = createRoofWallClashRunner(
            source({
                levelIds: () => ['L0', 'L1'],
                levelElevation: (id) => (id === 'L0' ? 0 : undefined),
            }, 3.2),
        ).run();
        expect(out.kind).toBe('unavailable');
    });
});

describe('roofWallClashRunner — what it reports when it DOES find something', () => {
    it('a penetration is attributed to the checked pair, with both ids and the depth', () => {
        const out = createRoofWallClashRunner(source({}, 3.2)).run();
        if (out.kind !== 'ran') throw new Error('expected a run');
        expect(out.findings).toHaveLength(1);
        const f = out.findings[0]!;
        // `scope` must equal the pair the runner declares it checks, or the bus
        // rejects the report at construction (capabilityRan).
        expect(f.scope).toBe('roof×wall');
        expect(out.findings.every((x) => x.scope === 'roof×wall')).toBe(true);
        expect(f.aId).toBe('r-1');
        expect(f.bId).toBe('w-1');
        expect(f.kind).toBe('penetrates');
        expect(f.magnitudeM).toBeCloseTo(0.5, 6);
    });

    it('a shortfall is a GAP — the two kinds are not collapsed into "clash"', () => {
        const out = createRoofWallClashRunner(source({}, 2.0)).run();
        if (out.kind !== 'ran') throw new Error('expected a run');
        expect(out.findings[0]!.kind).toBe('gap');
        expect(out.findings[0]!.magnitudeM).toBeCloseTo(0.7, 6);
    });

    it('declares exactly the pair it evaluates — never more', () => {
        expect(createRoofWallClashRunner(source()).pairs).toEqual(['roof×wall']);
    });

    it('is DETERMINISTIC — identical input, deep-equal output', () => {
        const a = createRoofWallClashRunner(source({}, 3.2)).run();
        const b = createRoofWallClashRunner(source({}, 3.2)).run();
        expect(a).toEqual(b);
    });
});
