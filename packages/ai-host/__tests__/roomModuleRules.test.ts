// §ROOM-MODULE-RULE-ENGINE P1 — schema + kitchen ontology foundation tests
// (ADR-0071 / SPEC-ROOM-MODULE-RULE-ENGINE §2/§5). Locks the data shape + the scorecard
// math so P2/P3 (the HARD/SCORING predicates) build on a verified foundation.

import { describe, expect, it } from 'vitest';
import {
    KITCHEN_SCORECARD_WEIGHTS, weightedTotal, type ScorecardWeights,
} from '../src/workflows/furnishLayout/rules/ruleSchema.js';
import {
    KITCHEN_ONTOLOGY, kitchenModule, CORNER_FORBIDDEN_APPLIANCES,
} from '../src/workflows/furnishLayout/rules/moduleOntology.js';

describe('§ROOM-MODULE-RULE-ENGINE — scorecard weights', () => {
    it('the kitchen scorecard weights sum to 100 (SPEC §5)', () => {
        const w = KITCHEN_SCORECARD_WEIGHTS;
        const sum = w.workflow + w.circulation + w.storage + w.mep + w.naturalLight + w.buildability + w.cost + w.aesthetics;
        expect(sum).toBe(100);
    });

    it('weightedTotal of all-100 axes is 100; all-0 is 0', () => {
        const all = (v: number): Record<keyof ScorecardWeights, number> => ({
            workflow: v, circulation: v, storage: v, mep: v, naturalLight: v, buildability: v, cost: v, aesthetics: v,
        });
        expect(weightedTotal(all(100))).toBeCloseTo(100, 6);
        expect(weightedTotal(all(0))).toBeCloseTo(0, 6);
    });

    it('weightedTotal honours the axis weights (workflow dominates)', () => {
        const axes: Record<keyof ScorecardWeights, number> = {
            workflow: 100, circulation: 0, storage: 0, mep: 0, naturalLight: 0, buildability: 0, cost: 0, aesthetics: 0,
        };
        // only the 25% workflow axis is full → total 25.
        expect(weightedTotal(axes)).toBeCloseTo(25, 6);
    });
});

describe('§ROOM-MODULE-RULE-ENGINE — kitchen ontology', () => {
    it('declares the core kitchen modules', () => {
        for (const t of ['Dishwasher', 'SinkUnit', 'HobUnit', 'Fridge', 'OvenTower', 'CornerUnit', 'Island', 'TallUnit']) {
            expect(kitchenModule(t), `missing ${t}`).toBeDefined();
        }
        expect(KITCHEN_ONTOLOGY.roomType).toBe('kitchen');
    });

    it('every module has positive dimensions + a scoreWeight', () => {
        for (const m of Object.values(KITCHEN_ONTOLOGY.modules)) {
            expect(m.widthMm).toBeGreaterThan(0);
            expect(m.depthMm).toBeGreaterThan(0);
            expect(m.heightMm).toBeGreaterThan(0);
            expect(m.weights.scoreWeight).toBeGreaterThan(0);
        }
    });

    it('Rule C01 — fridge / dishwasher / hob / oven are corner-forbidden', () => {
        for (const t of ['Fridge', 'Dishwasher', 'HobUnit', 'OvenTower', 'SinkUnit']) {
            expect(CORNER_FORBIDDEN_APPLIANCES, `${t} should be corner-forbidden`).toContain(t);
        }
        // a corner cabinet is NOT corner-forbidden (it belongs in the corner).
        expect(CORNER_FORBIDDEN_APPLIANCES).not.toContain('CornerUnit');
    });

    it('key clearances match the corpus (dishwasher front 900, fridge vent 25/50, hob 300)', () => {
        expect(kitchenModule('Dishwasher')!.clearance.frontMm).toBe(900);
        expect(kitchenModule('Fridge')!.clearance.sideMm).toBe(25);
        expect(kitchenModule('Fridge')!.clearance.topMm).toBe(50);
        expect(kitchenModule('HobUnit')!.clearance.sideMm).toBe(300);
        expect(kitchenModule('Island')!.clearance.frontMm).toBe(900);
    });

    it('adjacency seeds: dishwasher prefers sink; corner forbids appliances', () => {
        expect(kitchenModule('Dishwasher')!.preferredAdjacent).toContain('SinkUnit');
        expect(kitchenModule('CornerUnit')!.forbiddenAdjacent).toEqual(
            expect.arrayContaining(['Dishwasher', 'Fridge', 'HobUnit']),
        );
    });

    it('Level-2 cabinet options: drawers score above doors', () => {
        const sink = kitchenModule('SinkUnit')!;
        const door = sink.cabinetOptions?.find(c => c.cabinetType === 'Door');
        const drawer3 = sink.cabinetOptions?.find(c => c.cabinetType === '3_Drawer');
        expect(door && drawer3).toBeTruthy();
        expect(drawer3!.ergonomicScore!).toBeGreaterThan(door!.ergonomicScore!);
    });
});
