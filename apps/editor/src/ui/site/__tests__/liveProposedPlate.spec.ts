/**
 * §MASSING-ON-THE-SITE-VIEWS (L-13022 · STR §26.6.3) — the ONE resolver of *"which massing
 * candidate is live right now"*, and the three surfaces that must all ask it.
 *
 * ⭐ WHAT THESE ARMS ARE FOR. The founder's requirement has two halves and only one of them is
 * about drawing:
 *
 *   1. THE MASSING HE PICKS RENDERS ON THE VIEW HE IS ON. Measured before this lane:
 *      `CesiumViewport.ts` and `SiteBoundaryMap2D.ts` imported `targetFootprintAreaState` ZERO
 *      times. The last arm below pins all three surfaces to this ONE resolver, because a lane that
 *      later adds a fourth surface reading the slot directly re-opens the gap silently.
 *
 *   2. ONE AT A TIME. That is not enforced by a rule anywhere — it is a property of there being
 *      exactly ONE session slot, which `setTargetFootprintProposal` REPLACES. The arm below proves
 *      the replacement rather than an accumulation, because a per-view cache in any renderer would
 *      be the way this stops being true, and it would be invisible in a single-view test.
 *
 * ⛔ AND THE STALENESS GATE IS ASSERTED, not assumed. A plate solved inside a 92 m² permitted
 * footprint is not a proposal about a re-solved 61 m² one; drawing it anyway is a picture of a claim
 * that has been withdrawn (§VERIFICATION-ARTIFACT-CAN-PREDATE-SUBJECT, in geometry). The resolver
 * withdraws it on READ, which is what makes three surfaces asking independently still agree.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envelope = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('../siteDispatch', () => ({
    getLastBuildableEnvelope: () => envelope.current,
}));

import { resolveLiveProposedPlate, currentPermittedFootprintAreaM2 } from '../liveProposedPlate';
import {
    setTargetFootprintProposal,
    getTargetFootprintProposal,
    __resetTargetFootprintProposalForTests,
} from '../targetFootprintAreaState';
import type { TargetFootprintProposal } from '../targetFootprintAreaSolver';

/**
 * Drop line comments and block comments, so a source assertion reads CODE, not prose.
 * See the §RAF-GATE-COMMENT-BLIND note at its call site for why this is not incidental.
 */
function stripComments(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((l) => !l.trimStart().startsWith('//'))
        .join('\n');
}

/** A 10 × 10 permitted ring — 100 m² by shoelace, so the `insetAreaM2` fallback is testable. */
const PERMITTED = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }];

const plate = (over: Partial<TargetFootprintProposal> = {}): TargetFootprintProposal => ({
    ok: true,
    ring: [{ x: 1, z: 1 }, { x: 9, z: 1 }, { x: 9, z: 9 }, { x: 1, z: 9 }],
    achievedAreaM2: 64,
    targetAreaM2: 65,
    permittedAreaM2: 100,
    insetM: 1,
    statement: 'test',
    ...over,
});

beforeEach(() => {
    envelope.current = { insetPolygon: PERMITTED, insetAreaM2: 100, maxHeight_m: 12 };
    __resetTargetFootprintProposalForTests();
});
afterEach(() => {
    __resetTargetFootprintProposalForTests();
});

describe('§26.6.3 — currentPermittedFootprintAreaM2: one derivation, not three', () => {
    it('prefers the envelope\'s OWN field so the renderers and the card compare the same number', () => {
        envelope.current = { insetPolygon: PERMITTED, insetAreaM2: 97.4 };
        expect(currentPermittedFootprintAreaM2()).toBeCloseTo(97.4, 6);
    });

    it('falls back to the shoelace of the ring the envelope actually carries', () => {
        envelope.current = { insetPolygon: PERMITTED, insetAreaM2: 0 };
        expect(currentPermittedFootprintAreaM2()).toBeCloseTo(100, 6);
        envelope.current = { insetPolygon: PERMITTED };
        expect(currentPermittedFootprintAreaM2()).toBeCloseTo(100, 6);
    });

    it('⛔ null — NOT 0 — when there is no solved envelope at all', () => {
        envelope.current = null;
        expect(currentPermittedFootprintAreaM2()).toBeNull();
    });
});

describe('§26.6.3 — resolveLiveProposedPlate: the ONE read every surface makes', () => {
    it('returns the live plate when the envelope it was solved against still stands', () => {
        setTargetFootprintProposal(plate());
        const live = resolveLiveProposedPlate();
        expect(live).not.toBeNull();
        expect(live!.achievedAreaM2).toBe(64);
    });

    it('returns null when nothing is proposed — the resting state, not a failure', () => {
        expect(resolveLiveProposedPlate()).toBeNull();
    });

    it('⛔ WITHDRAWS a plate solved against a permitted footprint that has since been re-solved', () => {
        setTargetFootprintProposal(plate({ permittedAreaM2: 100 }));
        // The envelope is re-solved: 100 m² becomes 61 m². The plate describes the old one.
        envelope.current = { insetPolygon: PERMITTED, insetAreaM2: 61 };
        expect(resolveLiveProposedPlate()).toBeNull();
        // ⭐ SELF-HEALING ON READ — the slot itself is cleared, so the OTHER two surfaces get the
        // same answer without each having to notice the envelope moved.
        expect(getTargetFootprintProposal()).toBeNull();
    });

    it('⛔ withdraws it when the envelope disappears entirely', () => {
        setTargetFootprintProposal(plate());
        envelope.current = null;
        expect(resolveLiveProposedPlate()).toBeNull();
        expect(getTargetFootprintProposal()).toBeNull();
    });

    it('⛔ withholds a ring that is not a plate, so no surface has to remember the check', () => {
        setTargetFootprintProposal(plate({ ring: [{ x: 0, z: 0 }, { x: 1, z: 1 }] }));
        expect(resolveLiveProposedPlate()).toBeNull();
    });

    it('⭐ ONE AT A TIME, BY CONSTRUCTION — picking a second option REPLACES the first', () => {
        setTargetFootprintProposal(plate({ achievedAreaM2: 64, targetAreaM2: 65 }));
        expect(resolveLiveProposedPlate()!.achievedAreaM2).toBe(64);
        setTargetFootprintProposal(plate({ achievedAreaM2: 81, targetAreaM2: 80 }));
        const live = resolveLiveProposedPlate();
        expect(live!.achievedAreaM2).toBe(81);
        // There is exactly one slot, so there is nowhere for the first candidate to still live.
        expect(getTargetFootprintProposal()!.achievedAreaM2).toBe(81);
    });

    it('⛔ ALL THREE surfaces ask THIS resolver, and none reads the slot directly', () => {
        const files = {
            scene: resolve(__dirname, '../ParcelBoundarySceneRenderer.ts'),
            cesium: resolve(__dirname, '../../geospatial/CesiumViewport.ts'),
            map2d: resolve(__dirname, '../../geospatial/SiteBoundaryMap2D.ts'),
        };
        for (const [name, path] of Object.entries(files)) {
            const src = readFileSync(path, 'utf8');
            expect(src, `${name} does not draw the live massing candidate`)
                .toContain('resolveLiveProposedPlate(');
            // ⛔ THE GATE-SKIPPING READ. `getTargetFootprintProposal()` returns the slot WITHOUT the
            // staleness check, and the surface that uses it is the one that keeps drawing a
            // withdrawn massing while its neighbours have stopped.
            //
            // ⚠ COMMENT-BLIND ON PURPOSE. Both site views NAME that function in a comment, to say
            // they must not call it — and a naive `src.includes(...)` would fail on the very
            // sentence forbidding the thing. That is the §RAF-GATE-COMMENT-BLIND defect (a gate
            // counting sentences instead of code), and it is worth one line of stripping to not
            // re-commit it here.
            const code = stripComments(src);
            expect(code.includes('getTargetFootprintProposal('), `${name} skips the staleness gate`)
                .toBe(false);
            // Style comes from the ONE owner — no second table, no second hue.
            expect(src, `${name} does not read the ONE to-be-built style owner`)
                .toContain('toBeBuiltEnvelopeStyle');
        }
    });

    it('⛔ each of the two site views SUBSCRIBES to the slot — a draw with no subscription is a stale plate', () => {
        for (const path of [
            resolve(__dirname, '../../geospatial/CesiumViewport.ts'),
            resolve(__dirname, '../../geospatial/SiteBoundaryMap2D.ts'),
        ]) {
            const src = readFileSync(path, 'utf8');
            expect(src).toContain('subscribeTargetFootprintProposal(');
        }
    });
});
