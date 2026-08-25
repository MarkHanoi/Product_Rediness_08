// @vitest-environment happy-dom
//
// §RESI-SINGLE-CORE-LANDING (ADR-0372, lane SMALLPLATE68, L-11190..L-11199) — proven at the layer the
// user reaches: the chat/onboarding brief → `residentialGenerationFromBrief` → the controller's own
// `buildOrchestratorInput` → `orchestrateResidentialBuilding` → the honesty report the transcript
// prints. This is exactly `ResidentialBuildingController._request`'s data path minus the runtime
// (active level, toast, executor) — the same input the founder's refusal was computed from.
//
// THE FOUNDER'S REFUSAL, verbatim (production, 2026-08-25):
//   [resi-building] controller: rejected — level 1 partition placed zero apartments on a
//   13.1753 m × 16.0623 m plate (core/corridor leave no usable band runs (placed 0/6))

import { describe, expect, it } from 'vitest';
import { residentialGenerationFromBrief } from '../src/ui/generation/generationRequest.js';
import {
    buildOrchestratorInput,
    buildResidentialHonestyReport,
    countPlacedApartments,
} from '../src/ui/residential-building/ResidentialBuildingController.js';
import { friendlyResidentialError } from '../src/ui/residential-building/residentialError.js';
import { orchestrateResidentialBuilding } from '@pryzm/ai-host';

const W = 13.1753;
const D = 16.0623;
const rect = (w: number, d: number) => [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
const rotated = (pts: ReadonlyArray<{ x: number; z: number }>, deg: number) => {
    const t = (deg * Math.PI) / 180;
    return pts.map((p) => ({ x: 100 + p.x * Math.cos(t) - p.z * Math.sin(t), z: 50 + p.x * Math.sin(t) + p.z * Math.cos(t) }));
};

/** The onboarding brief as the chat seam captures it (field-id keyed). The founder's defaults. */
const BRIEF: Record<string, unknown> = { floors: 5, minApartmentAreaM2: 60, maxApartmentAreaM2: 100, T2: true, T3: true };

function through(footprint: ReadonlyArray<{ x: number; z: number }>, md: Record<string, unknown> = BRIEF) {
    const gen = residentialGenerationFromBrief(md, footprint);
    expect(gen.kind).toBe('residential-building');
    const input = buildOrchestratorInput(gen.request, footprint, 0);
    return { input, result: orchestrateResidentialBuilding(input) };
}

describe('§RESI-SINGLE-CORE-LANDING — the founder plate through the request path', () => {
    it('13.1753 × 16.0623 m boundary line (rotated, as drawn) → a building: ≥1 apartment per floor, a corner core, a landing, NO corridor', () => {
        const { input, result } = through(rotated(rect(W, D), 27));
        expect(input.upperLevels).toBe(5);
        expect(input.minApartmentAreaM2).toBe(60);
        expect(input.maxApartmentAreaM2).toBe(100);
        expect(result.status).toBe('ok');
        if (result.status !== 'ok') return;
        expect(result.circulationTypology).toBe('single-core-landing');
        const uppers = result.perLevelApartments.filter((l) => l.role === 'upper');
        expect(uppers.length).toBe(5);
        for (const level of uppers) {
            expect(level.apartments.filter((a) => a.status === 'ok').length).toBeGreaterThanOrEqual(1);
            expect(level.apartments.length).toBe(2);
            expect(level.publicCorridor.length).toBe(1);                 // the landing, nothing else
            const landing = level.publicCorridor[0]!;
            expect(landing.x1 - landing.x0).toBeLessThanOrEqual(result.core.x1 - result.core.x0 + 1e-3);
            for (const a of level.apartments) {
                expect(a.cell.coreReachable).toBe(true);
                expect(a.facadeEdges.length).toBeGreaterThanOrEqual(1);
            }
        }
        // 2 per floor × 5 floors — the whole count the controller would report.
        expect(countPlacedApartments(result)).toBe(10);
        const report = buildResidentialHonestyReport(result, countPlacedApartments(result));
        expect(report.some((line) => /landing/i.test(line) && /no corridor/i.test(line))).toBe(true);
    }, 180_000);

    it('the same plate as a perfect axis-aligned rectangle → the same typology (was ONE 187 m² residual unit)', () => {
        const { result } = through(rect(W, D));
        expect(result.status).toBe('ok');
        if (result.status !== 'ok') return;
        expect(result.circulationTypology).toBe('single-core-landing');
        expect(countPlacedApartments(result)).toBe(10);
    }, 180_000);

    it('NO REGRESSION — the founder’s other run through the same path: 20 × 25 m, 7 floors → 28 apartments on the corridor typology', () => {
        const { result } = through(rect(20, 25), { floors: 7, minApartmentAreaM2: 45, maxApartmentAreaM2: 120, T2: true, T3: true });
        expect(result.status).toBe('ok');
        if (result.status !== 'ok') return;
        expect(result.circulationTypology).toBe('corridor');
        expect(countPlacedApartments(result)).toBe(28);
        const report = buildResidentialHonestyReport(result, 28);
        expect(report[0]).toContain('28 apartments');
        expect(report.some((line) => /landing/i.test(line))).toBe(false);
    }, 240_000);

    it('a plate BOTH typologies refuse reaches the friendly copy naming both (C74): 10 × 12 m', () => {
        const { result } = through(rect(10, 12));
        expect(result.status).toBe('rejected');
        if (result.status !== 'rejected') return;
        const friendly = friendlyResidentialError(result.reason, 120);
        expect(friendly.kind).toBe('too-narrow');
        expect(friendly.body).toContain('single-core landing');
        expect(friendly.body).toContain('10 m');
    }, 60_000);
});
