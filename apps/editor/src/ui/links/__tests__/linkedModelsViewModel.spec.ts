/**
 * §LINK-UX-PROOF (L-3156/L-3158) — the C83 presentation, and the row read model.
 *
 * ── WHAT THESE PIN, AND WHY IT IS WORTH PINNING ─────────────────────────────
 *
 * The whole value of a linked model is that you can TRUST WHERE IT IS. ADR-0346 D4
 * is blunt about the failure mode: a silent mis-alignment is strictly worse than a
 * refusal, because it renders, it is measurable, and every dimension drawn to it is
 * wrong. So the three C83 answers must reach the user as three visibly different
 * things — and each refusal must carry its escape hatch, or it is a regression with
 * a contract citation attached ([[refusing-half-needs-its-escape-hatch]]).
 *
 * These specs assert exactly that: three verdicts, three affordances, and BOTH
 * numbers in the one that crosses a threshold (C74).
 *
 * They also pin the honesty boundaries the panel is built on — `null` never
 * collapsing to `0`, and "hidden" / "empty" / "failed" never rendering as each
 * other (§CONTEXT-DATA-HONESTY).
 */

import { describe, it, expect } from 'vitest';
import {
    presentLinkAnchor,
    presentLinkRow,
    presentLinkBudget,
} from '../linkedModelsViewModel';
import {
    FAR_SEPARATION_M,
    LinkedModelRefSchema,
    createLinkedModelId,
    type LinkGeoOrigin,
    type LinkedModelRef,
} from '@pryzm/schemas';
import type { LinkStatus } from '../../../engine/links/linkedModelController';

const AT = '2026-08-21T00:00:00.000Z';
const BCN: LinkGeoOrigin = { latitude: 41.3874, longitude: 2.1686, elevationAsl: 12, trueNorth: 0 };

describe('§LINK-UX-PROOF · the three C83 answers reach the user as three DIFFERENT things', () => {
    it('FINE offers one action, needs no confirmation, and still states the distance', () => {
        const near: LinkGeoOrigin = { ...BCN, longitude: BCN.longitude + 0.0004 };
        const p = presentLinkAnchor(BCN, near, AT);
        expect(p.verdict).toBe('FINE');
        expect(p.affordance).toBe('link-now');
        expect(p.requiresConfirmation).toBe(false);
        expect(p.decision.anchor).not.toBeNull();
        // Even the happy path names the number — a user never told where it landed
        // cannot notice when it lands somewhere wrong.
        expect(p.detail).toMatch(/\d/);
        expect(p.separationM).toBeGreaterThan(0);
    });

    it('INADVISABLE demands confirmation and names BOTH numbers (C74)', () => {
        const far: LinkGeoOrigin = { ...BCN, latitude: BCN.latitude + 0.5 };
        const p = presentLinkAnchor(BCN, far, AT);
        expect(p.verdict).toBe('INADVISABLE');
        expect(p.affordance).toBe('confirm-or-place-by-hand');
        expect(p.requiresConfirmation).toBe(true);
        // The escape hatch: the derived anchor is still offered, so "Link anyway"
        // has something to place.
        expect(p.decision.anchor).not.toBeNull();
        expect(p.separationM!).toBeGreaterThan(FAR_SEPARATION_M);
        // BOTH the measurement and the threshold it broke. The threshold renders
        // through the SAME `formatMetres` the measurement does — hence "5.0 km",
        // not "5 km". One formatter, so the two numbers in one sentence can never
        // be shown in two different notations.
        expect(p.detail).toMatch(/\d+(\.\d+)? km apart/);   // the measurement
        expect(p.detail).toContain('5.0 km auto-align limit'); // the rule it broke
    });

    it('IMPOSSIBLE refuses AUTO-ALIGNMENT but keeps the hand-placed path', () => {
        const p = presentLinkAnchor(BCN, null, AT);
        expect(p.verdict).toBe('IMPOSSIBLE');
        // NOT "no". The feature stays reachable — ADR-0346 §4.2.
        expect(p.affordance).toBe('place-by-hand-only');
        expect(p.primaryLabel).toBe('Place by hand');
        expect(p.decision.anchor).toBeNull();
        expect(p.detail.length).toBeGreaterThan(20);
    });

    it('IMPOSSIBLE reports separation as NULL, never 0', () => {
        // "I could not tell" and "they are in the same place" must never share a
        // value. A 0 here would render as "0 m apart" — a confident, wrong claim.
        expect(presentLinkAnchor(BCN, null, AT).separationM).toBeNull();
        expect(presentLinkAnchor(null, BCN, AT).separationM).toBeNull();
    });

    it('a host with no site is IMPOSSIBLE too — the frame is missing, not the source', () => {
        const p = presentLinkAnchor(null, BCN, AT);
        expect(p.verdict).toBe('IMPOSSIBLE');
        expect(p.detail.toLowerCase()).toContain('this project');
    });

    it('the three verdicts produce three DISTINCT affordances', () => {
        const fine = presentLinkAnchor(BCN, { ...BCN, longitude: BCN.longitude + 0.0004 }, AT);
        const inadv = presentLinkAnchor(BCN, { ...BCN, latitude: BCN.latitude + 0.5 }, AT);
        const imposs = presentLinkAnchor(BCN, null, AT);
        const set = new Set([fine.affordance, inadv.affordance, imposs.affordance]);
        expect(set.size).toBe(3);
        expect(new Set([fine.headline, inadv.headline, imposs.headline]).size).toBe(3);
    });
});

// ── Rows ─────────────────────────────────────────────────────────────────────

function ref(over: Partial<LinkedModelRef> = {}): LinkedModelRef {
    return LinkedModelRefSchema.parse({
        id: createLinkedModelId(),
        sourceProjectId: 'proj-podium',
        sourceProjectName: 'Podium',
        hostProjectId: 'proj-tower',
        pin: { mode: 'pinned', versionId: 'v-7', versionLabel: 'Scheme C', pinnedAt: AT },
        anchor: {
            mode: 'shared-geo-origin',
            transform: { east: 12, north: -4, elevation: 0, rotationY: 0 },
            hostOrigin: BCN, sourceOrigin: BCN, separationM: 42,
            resolvedAt: AT,
        },
        display: 'massing',
        discipline: 'architectural',
        linkedAt: AT,
        ...over,
    });
}

function status(over: Partial<LinkStatus> = {}): LinkStatus {
    return {
        kind: 'shown', reason: null, bands: 5, drawCalls: 1,
        versionLabel: 'Scheme C', sourceElementCount: 3898,
        ...over,
    } as LinkStatus;
}

describe('§LINK-UX-PROOF · a row makes the PIN-vs-LIVE choice visible (ADR-0346 D5)', () => {
    it('a pinned link says so, and names the version', () => {
        const r = presentLinkRow(ref(), status());
        expect(r.versionLine).toContain('Pinned to');
        expect(r.versionLine).toContain('Scheme C');
    });

    it('a follow-latest link says so IN WORDS, and names what it is showing now', () => {
        const r = presentLinkRow(
            ref({ pin: { mode: 'latest', lastResolvedVersionId: 'v-9' } }),
            status({ versionLabel: 'Autosave 19:04' }),
        );
        expect(r.versionLine).toContain('Following latest');
        // An undeclared version choice is not defensible — so the row declares it.
        expect(r.versionLine).toContain('Autosave 19:04');
    });

    /**
     * §LINK-LATEST-IS-NOT-LIVE (L-3161). `latest` re-resolves on project open and
     * on an explicit Refresh; it does NOT poll. A row saying only "Following latest
     * save" would leave a user expecting a colleague's save to appear on its own —
     * a reasonable reading, and the wrong one. So the row states WHEN.
     */
    it('a follow-latest link states WHEN it updates, not just that it follows', () => {
        const r = presentLinkRow(
            ref({ pin: { mode: 'latest', lastResolvedVersionId: 'v-9' } }),
            status(),
        );
        expect(r.versionLine).toContain('Refresh');
        expect(r.versionLine).toContain('open');
    });

    it('a PINNED link makes no refresh promise — it is pinned, that is the point', () => {
        expect(presentLinkRow(ref(), status()).versionLine).not.toContain('Refresh');
    });
});

describe('§LINK-UX-PROOF · shown / hidden / refused / resolving are FOUR states', () => {
    it('shown states the measured structural cost', () => {
        const r = presentLinkRow(ref(), status({ bands: 5, drawCalls: 1 }));
        expect(r.tone).toBe('shown');
        expect(r.statusChip).toBe('SHOWN');
        expect(r.costLine).toBe('5 levels · 1 draw call');
        expect(r.reason).toBeNull();
    });

    it('hidden costs literally nothing — it is not an invisible subtree', () => {
        const r = presentLinkRow(
            ref({ display: 'hidden' }),
            status({ kind: 'hidden', bands: 0, drawCalls: 0 }),
        );
        expect(r.tone).toBe('hidden');
        expect(r.isHidden).toBe(true);
        expect(r.costLine).toContain('0 draw calls');
    });

    it('refused carries the reason VERBATIM and draws nothing', () => {
        const why = 'The pinned version "Scheme C" no longer exists.';
        const r = presentLinkRow(ref(), status({ kind: 'refused', reason: why, bands: 0, drawCalls: 0 }));
        expect(r.tone).toBe('refused');
        expect(r.statusChip).toBe('NOT SHOWN');
        expect(r.reason).toBe(why);
    });

    it('an unknown link reads RESOLVING, never "empty"', () => {
        // A link whose status has not arrived must not render as a link that
        // resolved to nothing. Absence and emptiness are different facts.
        const r = presentLinkRow(ref(), null);
        expect(r.tone).toBe('resolving');
        expect(r.statusChip).toBe('RESOLVING');
        expect(r.reason).toBeNull();
    });

    it('the four states produce four DISTINCT chips', () => {
        const chips = new Set([
            presentLinkRow(ref(), status()).statusChip,
            presentLinkRow(ref({ display: 'hidden' }), status({ kind: 'hidden' })).statusChip,
            presentLinkRow(ref(), status({ kind: 'refused', reason: 'x' })).statusChip,
            presentLinkRow(ref(), null).statusChip,
        ]);
        expect(chips.size).toBe(4);
    });
});

describe('§LINK-UX-PROOF · the anchor line reports how it was placed', () => {
    it('a derived anchor names the separation it was derived at', () => {
        expect(presentLinkRow(ref(), status()).anchorLine).toContain('42 m apart');
    });

    it('a hand-placed anchor says so, and claims no separation', () => {
        const r = presentLinkRow(ref({
            anchor: {
                mode: 'explicit',
                transform: { east: 5, north: 5, elevation: 0, rotationY: 0 },
                hostOrigin: BCN, sourceOrigin: null, separationM: null, resolvedAt: AT,
            },
        }), status());
        expect(r.anchorLine).toBe('Placed by hand');
        expect(r.anchorLine).not.toContain('apart');
    });

    it('a derived anchor with UNKNOWN separation does not invent a number', () => {
        const r = presentLinkRow(ref({
            anchor: {
                mode: 'shared-geo-origin',
                transform: { east: 0, north: 0, elevation: 0, rotationY: 0 },
                hostOrigin: null, sourceOrigin: null, separationM: null, resolvedAt: AT,
            },
        }), status());
        expect(r.anchorLine).not.toMatch(/\d/);
    });
});

describe('§LINK-UX-PROOF · the DETAILED representation states its cost while refusing', () => {
    it('names the mesh count full detail would add, against massing’s one draw call', () => {
        const r = presentLinkRow(ref(), status({ sourceElementCount: 3898 }));
        expect(r.detailedCostLine).toContain('3898');
        expect(r.detailedCostLine).toContain('not built yet');
        // C82 §1.2 — the control is disabled and says why, rather than dispatching
        // into nothing and erroring after the click.
        expect(r.detailedCostLine).toContain('one draw call');
    });

    it('still refuses honestly when the source element count is unknown', () => {
        const r = presentLinkRow(ref(), status({ sourceElementCount: 0 }));
        expect(r.detailedCostLine).toContain('not built yet');
        // No fabricated "0 more meshes" claim.
        expect(r.detailedCostLine).not.toContain('0 more meshes');
    });
});

describe('§LINK-UX-PROOF · the budget line counts what links ADD', () => {
    it('reports link count, shown count and total draw calls', () => {
        const rows = [
            presentLinkRow(ref(), status({ drawCalls: 1 })),
            presentLinkRow(ref({ display: 'hidden' }), status({ kind: 'hidden', drawCalls: 0 })),
        ];
        const line = presentLinkBudget(rows, 1);
        expect(line).toContain('2 links');
        expect(line).toContain('1 shown');
        expect(line).toContain('1 draw call');
    });

    it('says so plainly when there are none', () => {
        expect(presentLinkBudget([], 0)).toBe('No linked models in this project.');
    });

    it('pluralises so the line never reads "1 draw calls"', () => {
        const rows = [presentLinkRow(ref(), status())];
        expect(presentLinkBudget(rows, 1)).toContain('1 draw call added');
        expect(presentLinkBudget(rows, 2)).toContain('2 draw calls added');
    });
});
