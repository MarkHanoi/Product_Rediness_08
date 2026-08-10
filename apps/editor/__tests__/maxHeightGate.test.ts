// §GEN-MAXHEIGHT-GATE (audit GENERATIVE-PIPELINE-AUDIT-2026-08-10 P0-2 / RAC U5b.3, C58)
// — the pure envelope-height gate shared by the residential / house / office controllers,
// plus the residential friendly-copy branch that renders its refusal.

import { describe, expect, it } from 'vitest';
import { checkMaxHeightGate } from '../src/ui/generation/maxHeightGate.js';
import { friendlyResidentialError } from '../src/ui/residential-building/residentialError.js';

describe('checkMaxHeightGate', () => {
    it('§CONTEXT-DATA-HONESTY — null cap = "no cap recorded" ⇒ proceed (never 0, never ∞)', () => {
        expect(checkMaxHeightGate({ floors: 50, floorToFloorM: 4, maxHeightM: null }).ok).toBe(true);
    });

    it('proceeds when the requested height fits under the cap', () => {
        expect(checkMaxHeightGate({ floors: 8, floorToFloorM: 3, maxHeightM: 25.75 }).ok).toBe(true);
    });

    it('proceeds at EXACTLY the cap (float tolerance, no false refusal)', () => {
        expect(checkMaxHeightGate({ floors: 10, floorToFloorM: 3, maxHeightM: 30 }).ok).toBe(true);
        // 3 × 0.1-style float drift must not refuse either.
        expect(checkMaxHeightGate({ floors: 3, floorToFloorM: 0.1 * 3, maxHeightM: 0.9 }).ok).toBe(true);
    });

    it('refuses over the cap, quoting BOTH numbers + the max feasible floor count', () => {
        const out = checkMaxHeightGate({ floors: 10, floorToFloorM: 3, maxHeightM: 25.75 });
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.requestedHeightM).toBe(30);
        expect(out.maxHeightM).toBe(25.75);
        expect(out.maxFeasibleFloors).toBe(8);      // floor(25.75 / 3)
        // The refusal sentence carries BOTH numbers and the feasible offer verbatim.
        expect(out.reason).toContain('allows 25.75 m');
        expect(out.reason).toContain('10 floors × 3 m ≈ 30 m');
        expect(out.reason).toContain('Up to 8 floors');
    });

    it('a recorded cap of 0 is DATA (refuses; offers no feasible floors) — only null skips', () => {
        const out = checkMaxHeightGate({ floors: 1, floorToFloorM: 3, maxHeightM: 0 });
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.maxFeasibleFloors).toBe(0);
        expect(out.reason).toContain('Not even a single floor fits');
    });

    it('degenerate floors / floor-to-floor proceed (height is the ONLY thing this gate rules on)', () => {
        expect(checkMaxHeightGate({ floors: 0, floorToFloorM: 3, maxHeightM: 10 }).ok).toBe(true);
        expect(checkMaxHeightGate({ floors: 3, floorToFloorM: 0, maxHeightM: 10 }).ok).toBe(true);
    });
});

describe('friendlyResidentialError — exceeds-height branch (§GEN-MAXHEIGHT-GATE)', () => {
    it('maps the gate refusal to the exceeds-height modal copy, quoting the reason verbatim', () => {
        const gate = checkMaxHeightGate({ floors: 10, floorToFloorM: 3, maxHeightM: 25.75 });
        expect(gate.ok).toBe(false);
        if (gate.ok) return;
        const err = friendlyResidentialError(gate.reason, 674);
        expect(err.kind).toBe('exceeds-height');
        expect(err.body).toContain('allows 25.75 m');
        expect(err.body).toContain('≈ 30 m');
        expect(err.guidance.toLowerCase()).toContain('floors');
    });

    it('does not shadow the existing branches (a non-height reason keeps its kind)', () => {
        expect(friendlyResidentialError('all 4 apartment cell(s) failed to lay out').kind).toBe('no-apartments');
        expect(friendlyResidentialError(undefined).kind).toBe('generic');
    });
});
