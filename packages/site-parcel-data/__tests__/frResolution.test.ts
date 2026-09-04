// FR — the composer that makes the rule packs REACHABLE. Each block pins a routing decision that,
// got wrong, produces a plausible answer citing the wrong law.

import { describe, expect, it } from 'vitest';

import type { Pt, RuleSourceRef } from '@pryzm/schemas';
import {
    FR_RESOLUTION_ORDER,
    frEnvelopeRuleStates,
    frMissingSourceReclassification,
    type FrParcelGeometry,
    type FrResolutionInput,
} from '../src/rulepacks/frResolution.js';

const ref: RuleSourceRef = {
    country: 'FR',
    authority: "IGN / Géoportail de l'urbanisme (DGALN)",
    dataset: 'zone_urba',
    plan_id: '200046977_PLUI_20260326',
    object_id: null,
    document: '200046977_reglement_20260326.pdf',
    article: null,
    page: null,
};

/** A 40 × 30 m parcel with its long edge on the x axis. */
const RING: readonly Pt[] = [
    { x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: 30 }, { x: 0, z: 30 },
];

/** A 12 m-wide public road running along the parcel's z=0 edge, 1 m off it. */
const ROAD = {
    id: 'troncon-1',
    points: [{ x: -20, z: -1 }, { x: 60, z: -1 }] as readonly Pt[],
    widthM: 12,
    nature: 'Route à 2 chaussées',
    isPrivate: false,
};

function geometry(p: Partial<FrParcelGeometry> = {}): FrParcelGeometry {
    return { ring: RING, roads: [ROAD], dwellings: [], dwellingsCoverage: 'complete-within-radius', ...p };
}

function input(p: Partial<FrResolutionInput> = {}): FrResolutionInput {
    return {
        facts: { isRnu: false, duType: 'PLU', zoneServed: true, secteurCcServed: false },
        prescriptions: [],
        ref,
        reglementReachable: true,
        ...p,
    };
}

const rowOf = (typepsc: string, stypepsc: string | null, libelle: string | null) => ({
    typepsc, stypepsc, nature: null, libelle, txt: null,
    nomfic: '200046977_reglement_20260326.pdf', idurba: '200046977_PLUI_20260326',
});

describe('routing — the REGIME decides which pack speaks, and only one of them does', () => {
    it('⭐ an RNU commune reaches the NATIONAL pack — the source is the Code, not a missing PDF', () => {
        const r = frEnvelopeRuleStates(input({
            facts: { isRnu: true, duType: null, zoneServed: false, secteurCcServed: false },
        }));
        expect(r.regime.regime).toBe('RNU');
        expect(r.packsConsulted).toContain('rnu-national');
        expect(r.packsConsulted).not.toContain('cnig-prescriptions');
        // Every state cites the Code, never a commune règlement that does not exist.
        expect(r.states.length).toBeGreaterThan(0);
        expect(r.states.every((s) => s.ref.dataset === 'code-de-l-urbanisme')).toBe(true);
    });

    it('⭐ `discretionary` stops being an artefact — an RNU parcel carries the E4 deliberation', () => {
        // Founder review §4: the conseil municipal may authorise outside the PAU by REASONED
        // DELIBERATION. That is textbook E4, and it reached nothing until this composer existed.
        const r = frEnvelopeRuleStates(input({
            facts: { isRnu: true, duType: null, zoneServed: false, secteurCcServed: false },
        }));
        const e4 = r.states.find((s) => s.rule === 'E4');
        expect(e4).toBeDefined();
        expect(e4).toMatchObject({ status: 'unrecovered', failure: 'discretionary', mechanism: 'present' });
        if (e4!.status !== 'unrecovered') throw new Error('unreachable');
        expect(e4!.stoppedAt).toContain('conseil municipal');
    });

    it('a PLU parcel reaches the CNIG tree and NOT the national pack', () => {
        const r = frEnvelopeRuleStates(input({
            prescriptions: [rowOf('39', '97', "La hauteur doit s'harmoniser avec le bâti voisin.")],
        }));
        expect(r.packsConsulted).toContain('cnig-prescriptions');
        expect(r.packsConsulted).not.toContain('rnu-national');
        expect(r.states.find((s) => s.rule === 'C2')).toMatchObject({ status: 'qualitative' });
    });

    it('⛔ a POS-caduc parcel is RNU-governed — the lapsed document does not supply rules', () => {
        const r = frEnvelopeRuleStates(input({
            facts: { isRnu: false, duType: 'POS', zoneServed: true, secteurCcServed: false },
            // ⚠ Even with a drawn height prescription served, the CNIG tree must NOT be consulted:
            // the POS lapsed by law (L.174-1) and its graphics no longer state anything binding.
            prescriptions: [rowOf('39', '02', 'Hauteur maximale 12 m')],
        }));
        expect(r.regime.regime).toBe('POS-caduc');
        expect(r.packsConsulted).toContain('rnu-national');
        expect(r.packsConsulted).not.toContain('cnig-prescriptions');
    });

    it('⛔ a CONFLICT consults NEITHER pack — two disagreeing statements do not average', () => {
        // is_rnu=true says "no local document"; document.du_type=PLU says there is one. Picking the
        // pack that yields more rows would be choosing an answer by its convenience.
        const r = frEnvelopeRuleStates(input({
            facts: { isRnu: true, duType: 'PLU', zoneServed: true, secteurCcServed: false },
            prescriptions: [rowOf('39', '02', 'Hauteur maximale 12 m')],
        }));
        expect(r.regime.regime).toBe('undetermined-conflict');
        expect(r.packsConsulted).not.toContain('rnu-national');
        expect(r.packsConsulted).not.toContain('cnig-prescriptions');
        expect(r.states.filter((s) => s.rule === 'C2')).toHaveLength(0);
    });
});

describe('the derivations are INPUTS to the packs, not rivals of them', () => {
    it('⭐ frontage feeds R.111-16 — the derived road width RESOLVES the RNU height', () => {
        const withGeo = frEnvelopeRuleStates(input({
            facts: { isRnu: true, duType: null, zoneServed: false, secteurCcServed: false },
            geometry: geometry(),
        }));
        expect(withGeo.packsConsulted).toContain('frontage');
        // R.111-16 caps height at the road width at the alignment: a 12 m road ⇒ a 12 m cap.
        expect(withGeo.states.find((s) => s.rule === 'C2')).toMatchObject({ status: 'resolved', value: 12, unit: 'm' });

        // ⚠ THE SAME PARCEL WITHOUT GEOMETRY MUST NOT RESOLVE. If it did, the number would be
        // coming from somewhere other than the measurement, which is the whole failure mode.
        const noGeo = frEnvelopeRuleStates(input({
            facts: { isRnu: true, duType: null, zoneServed: false, secteurCcServed: false },
        }));
        expect(noGeo.states.find((s) => s.rule === 'C2')!.status).not.toBe('resolved');
    });

    it('⚠ the governing width is the NARROWEST frontage, never an average', () => {
        // Two roads, 12 m and 6 m. Averaging would grant 9 m of height the 6 m street refuses;
        // on partial data the answer must err toward the constraint (L-616).
        const narrow = { id: 'troncon-2', points: [{ x: -20, z: 31 }, { x: 60, z: 31 }] as readonly Pt[], widthM: 6, nature: 'Route', isPrivate: false };
        const r = frEnvelopeRuleStates(input({
            facts: { isRnu: true, duType: null, zoneServed: false, secteurCcServed: false },
            geometry: geometry({ roads: [ROAD, narrow] }),
        }));
        expect(r.states.find((s) => s.rule === 'C2')).toMatchObject({ status: 'resolved', value: 6 });
    });

    it('⭐ the PAU derivation is seated ONCE as B5 — never a resolved and a refused B5 side by side', () => {
        const r = frEnvelopeRuleStates(input({
            facts: { isRnu: true, duType: null, zoneServed: false, secteurCcServed: false },
            geometry: geometry({
                dwellings: Array.from({ length: 12 }, (_, i) => ({ id: `d${i}`, point: { x: 20 + i, z: -10 } })),
            }),
        }));
        expect(r.packsConsulted).toContain('pau');
        const b5 = r.states.filter((s) => s.rule === 'B5');
        expect(b5).toHaveLength(1);
        expect(b5[0]).toMatchObject({ status: 'resolved', reachability: 'derivable', provenance: 'estimated' });
        // Non-authoritative, and it says so in the citation — only the instructing authority decides.
        expect(b5[0]!.ref.article).toContain('non-authoritative');
    });

    it('⛔ the PAU test does NOT run where it has no subject — a PLU parcel gets no B5 derivation', () => {
        const r = frEnvelopeRuleStates(input({ geometry: geometry() }));
        expect(r.regime.pauTestApplies).toBe(false);
        expect(r.packsConsulted).not.toContain('pau');
        expect(r.states.filter((s) => s.rule === 'B5')).toHaveLength(0);
    });
});

describe('determinism and non-duplication', () => {
    it('no parameter is answered twice, and the order is the DECLARED one', () => {
        const r = frEnvelopeRuleStates(input({
            facts: { isRnu: true, duType: null, zoneServed: false, secteurCcServed: false },
            geometry: geometry(),
        }));
        const rules = r.states.map((s) => s.rule);
        // A3 is emitted once; A4 once per measured frontage — those are FACTS, not rules, and are
        // the only keys allowed to repeat.
        const ruleOnly = rules.filter((k) => k !== 'A4');
        expect(new Set(ruleOnly).size).toBe(ruleOnly.length);
        const rank = (k: string) => FR_RESOLUTION_ORDER.indexOf(k as never);
        for (let i = 1; i < rules.length; i++) expect(rank(rules[i]!)).toBeGreaterThanOrEqual(rank(rules[i - 1]!));
    });

    it('is byte-comparable across runs and independent of prescription order', () => {
        const p = [rowOf('39', '02', 'Hauteur maximale 12 m'), rowOf('15', '01', 'Marge de recul')];
        const a = frEnvelopeRuleStates(input({ prescriptions: p }));
        const b = frEnvelopeRuleStates(input({ prescriptions: [...p].reverse() }));
        expect(a.states).toEqual(b.states);
    });
});

describe('⭐ the `missing-source` re-classification — the observation is not the inference', () => {
    it('an RNU commune is NOT missing a source; it has a different one', () => {
        expect(frMissingSourceReclassification({ isRnu: true, duType: null, zoneServed: false, secteurCcServed: false }))
            .toBe('rnu-national-source-applies');
        // A lapsed POS is the same case: the Code supplies the rules.
        expect(frMissingSourceReclassification({ isRnu: false, duType: 'POS', zoneServed: true, secteurCcServed: false }))
            .toBe('rnu-national-source-applies');
    });

    it('a commune that DECLARES a local document and serves none is genuinely missing one', () => {
        expect(frMissingSourceReclassification({ isRnu: false, duType: 'PLU', zoneServed: false, secteurCcServed: false }))
            .toBe('genuinely-missing');
    });

    it('⛔ a conflict is neither — no source may be asserted from two disagreeing statements', () => {
        expect(frMissingSourceReclassification({ isRnu: true, duType: 'PLU', zoneServed: true, secteurCcServed: false }))
            .toBe('undetermined-conflict');
        // No commune served at all: there is no regime statement to read, so nothing is concluded.
        expect(frMissingSourceReclassification({ isRnu: null, duType: null, zoneServed: false, secteurCcServed: false }))
            .toBe('undetermined-conflict');
    });
});
