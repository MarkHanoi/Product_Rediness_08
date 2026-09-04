// §NSW-ACCEPTANCE — the build prompt §13 criteria, against LIVE-CAPTURED attribute bags.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THE FIXTURE IS RAW AND NOT HAND-WRITTEN
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `fixtures/nsw-eplanning-2026-09-04.json` holds the UNMODIFIED `identify` responses captured from
// `mapprod3.environment.nsw.gov.au` on 2026-09-04 (the capture script is
// `docs/04-reference/jurisdictions/au/nsw/phase0-transcripts/scripts/fixtures.mjs`; re-run it).
//
// ⛔ §FAKE-MORE-CAPABLE-THAN-REAL. A fixture typed by hand from a reader's own field list cannot
// falsify that reader — it reproduces its assumptions, including the two silent-false-zero defects
// Phase 0 caught. These bags carry the real shape: layer 14 keyed by field ALIAS ("Maximum
// Building Height", "Legislative Clause"), the Local Provisions layers keyed by field NAME, and
// the literal string `"Null"` used as a null sentinel throughout. Every one of those would be
// smoothed away by a hand-written fixture, and each one has already cost this lane a false reading.
//
// The parcels are the measured multi-control corpus from PHASE0-REPORT §M3.4 — the six parcels in
// a uniform random sample of 2,000 that carry more than one vertical control — plus the single
// `m(RL)` parcel in that sample. They are not chosen to be convenient.

import { describe, it, expect } from 'vitest';

import raw from './fixtures/nsw-eplanning-2026-09-04.json' assert { type: 'json' };
import {
    resolveNswVerticalPrecedence,
    nswReadControl,
    type NswRawControlHit,
} from '../src/rulepacks/au/nswVerticalPrecedence.js';
import { NSW_LAYER } from '../src/rulepacks/au/nswPortalLayers.js';
import { nswQuantitySemantics, NSW_LAY_NAME_SEMANTICS } from '../src/rulepacks/au/nswLayName.js';
import {
    nswMayContributeValue,
    nswMayPublish,
    type NswCitationState,
} from '../src/rulepacks/au/nswCitationState.js';
import { parseNswHeight } from '../src/rulepacks/au/nswHeightValue.js';

type Fixture = {
    readonly parcels: Record<
        string,
        { why: string; hits: Array<{ layerId: number; layerName: string; attributes: Record<string, unknown> }> }
    >;
    readonly layers: Record<string, { label: string; count: number; features: Array<Record<string, unknown>> }>;
};
const FX = raw as unknown as Fixture;

/** Vertical hits only — the FSR layer is a different parameter and a different resolver. */
function verticalHits(parcel: string): NswRawControlHit[] {
    const p = FX.parcels[parcel];
    if (!p) throw new Error(`fixture missing parcel ${parcel}`);
    return p.hits
        .filter((h) => h.layerId !== NSW_LAYER.FLOOR_SPACE_RATIO)
        .map((h) => ({ layerId: h.layerId, attributes: h.attributes }));
}

describe('NSW fixture integrity — the fixture must still be the thing it claims to be', () => {
    it('carries the six measured multi-control parcels and the three single-council overlays', () => {
        expect(Object.keys(FX.parcels).sort()).toEqual(
            ['101//DP1265976', '152//DP877246', '2//DP782292', '291//DP1287257', '5//DP240402', '54//DP1259000'].sort(),
        );
        expect(FX.layers['430']?.count).toBe(9); // Building Height Plane, all BURWOOD
        expect(FX.layers['573']?.count).toBe(9); // Sun Plane Protection, all WOLLONGONG
        expect(FX.layers['469']?.count).toBe(14); // Floor Height Restriction, all SINGLETON
    });

    it('still carries the two defects a normalised fixture would hide', () => {
        const hob = FX.parcels['152//DP877246']!.hits.find((h) => h.layerId === NSW_LAYER.HEIGHT_OF_BUILDINGS)!;
        // 1. ALIAS keying on Principal/14 — the field NAME is absent entirely.
        expect(hob.attributes['Maximum Building Height']).toBe('8.5');
        expect(hob.attributes['MAX_B_H']).toBeUndefined();
        // 2. The literal string 'Null' as a sentinel. An `!= null` test scores this as populated.
        const bha = FX.parcels['152//DP877246']!.hits.find((h) => h.layerId === NSW_LAYER.BUILDING_HEIGHT_ALLOWANCE)!;
        expect(bha.attributes['LEGIS_REF_CLAUSE']).toBe('Null');
    });
});

describe('§13 — same parcel, same vintage → byte-identical output', () => {
    it('is deterministic across repeated resolution of every fixture parcel', () => {
        for (const parcel of Object.keys(FX.parcels)) {
            const a = resolveNswVerticalPrecedence(verticalHits(parcel));
            const b = resolveNswVerticalPrecedence(verticalHits(parcel));
            expect(JSON.stringify(b)).toBe(JSON.stringify(a));
        }
    });
});

describe('§1.3 / §5 — NEVER take the minimum. The 152//DP877246 trap.', () => {
    // HOB 8.5 m and a layer-429 value of 2.1. `min()` returns 2.1 — a garage.
    const res = resolveNswVerticalPrecedence(verticalHits('152//DP877246'));

    it('resolves the base to 8.5 m and never to 2.1', () => {
        expect(res.state.status).toBe('resolved');
        expect(res.state.status === 'resolved' && res.state.value).toBe(8.5);
        expect(res.state.status === 'resolved' && res.state.unit).toBe('m');
    });

    it('excludes the layer-429 value for the MEASURED reason: it is a minimum AHD level', () => {
        const bha = res.allControls.find((c) => c.layerId === NSW_LAYER.BUILDING_HEIGHT_ALLOWANCE)!;
        // ⭐ The correction. LAY_NAME on 203/203 rows is "Minimum Level Australian Height Datum
        // (AHD)" — a minimum floor level in Ballina, a coastal flood LGA. Not an additive bonus.
        expect(bha.quantity.layName).toBe('Minimum Level Australian Height Datum (AHD)');
        expect(bha.quantity.direction).toBe('minimum');
        expect(bha.quantity.datum).toBe('AHD');
        expect(bha.quantity.axis).toBe('floor-level');
        expect(bha.quantity.constrainsEnvelopeTop).toBe(false);
        // ⛔ It is NOT excluded as an "additive allowance" — that classification was measured wrong.
        expect(bha.additive).toBe(false);
    });

    it('reports the excluded control rather than dropping it — a real constraint, wrong axis', () => {
        const reported = res.conditionalUplifts.find(
            (u) => u.control.layerId === NSW_LAYER.BUILDING_HEIGHT_ALLOWANCE,
        );
        expect(reported).toBeDefined();
        expect(reported!.notAppliedBecause).toMatch(/MINIMUM level in the Australian Height Datum/);
    });

    it('has no Math.min over competing controls anywhere in the resolver source', async () => {
        // A structural guard, not a behavioural one: the invariant is that the function never
        // ACQUIRES a minimiser, and only reading the source can assert that.
        const fs = await import('node:fs/promises');
        const url = new URL('../src/rulepacks/au/nswVerticalPrecedence.ts', import.meta.url);
        const src = await fs.readFile(url, 'utf8');
        expect(src).not.toMatch(/Math\.min\s*\(/);
        expect(src).not.toMatch(/Math\.max\s*\(/);
    });
});

describe('§13 — a conditional Incentive HOB emits base + UNAPPLIED uplift', () => {
    it('2//DP782292: base 31 m stands; Incentive HOB 36 is listed and not applied', () => {
        const res = resolveNswVerticalPrecedence(verticalHits('2//DP782292'));
        expect(res.state.status === 'resolved' && res.state.value).toBe(31);
        const uplift = res.conditionalUplifts.find(
            (u) => u.control.layerId === NSW_LAYER.INCENTIVE_HEIGHT_OF_BUILDINGS,
        );
        expect(uplift).toBeDefined();
        expect(uplift!.control.layClass).toBe('36');
        expect(uplift!.notAppliedBecause.length).toBeGreaterThan(0);
        // ⛔ 36 must appear NOWHERE as the answer. Reporting it inflates the site's yield.
        expect(res.state.status === 'resolved' && res.state.value).not.toBe(36);
    });

    it('5//DP240402: base 12 m stands against an Alternative HOB of 25 m', () => {
        const res = resolveNswVerticalPrecedence(verticalHits('5//DP240402'));
        expect(res.state.status === 'resolved' && res.state.value).toBe(12);
        const alt = res.conditionalUplifts.find(
            (u) => u.control.layerId === NSW_LAYER.ALTERNATIVE_HEIGHT_OF_BUILDINGS,
        );
        expect(alt).toBeDefined();
        expect(alt!.control.layClass).toBe('25');
    });
});

describe('§6 / §13 — an m(RL) value is never treated as height-above-ground', () => {
    it('101//DP1265976 resolves to an ABSOLUTE AHD level, unit "m AHD"', () => {
        const res = resolveNswVerticalPrecedence(verticalHits('101//DP1265976'));
        expect(res.state.status).toBe('resolved');
        expect(res.state.status === 'resolved' && res.state.value).toBe(999.126);
        expect(res.state.status === 'resolved' && res.state.unit).toBe('m AHD');
        expect(res.state.status === 'resolved' && res.state.datum).toBe('AHD');
        expect(res.baseHeight?.kind).toBe('absolute_level');
    });

    it('the service corroborates it in a SECOND column — MAX_B_H_RL, not MAX_B_H_M', () => {
        // An independent reading of the same fact (§PROBE-CAN-BE-WRONG-THREE-WAYS). Layer 14
        // splits the value across two columns, and only one of them is ever populated.
        const hob = FX.parcels['101//DP1265976']!.hits[0]!;
        expect(hob.attributes['Units']).toBe('m(RL)');
        expect(hob.attributes['MAX_B_H_RL']).toBe('999.126');
        expect(hob.attributes['MAX_B_H_M']).toBe('Null');
        // …and the inverse on a metres parcel.
        const agl = FX.parcels['5//DP240402']!.hits[0]!;
        expect(agl.attributes['MAX_B_H_M']).toBe('12');
        expect(agl.attributes['MAX_B_H_RL']).toBe('Null');
    });

    it('an absolute level and an above-ground height are not interchangeable', () => {
        const abs = parseNswHeight(43, 'm(RL)');
        const agl = parseNswHeight(43, 'm');
        expect(abs.kind).toBe('absolute_level');
        expect(agl.kind).toBe('height_above_ground');
        expect(JSON.stringify(abs)).not.toBe(JSON.stringify(agl));
    });
});

describe("§13 — UNITS='NA' refuses, and is NOT read as unbounded", () => {
    it('emits refused / no-limit-stated, never a value and never Infinity', () => {
        // Synthesised from the real Principal/14 alias schema: no NA parcel fell in n=2,000
        // (measured 0 of 1,213), so the domain member is exercised directly. The BAG shape is the
        // captured one — only the two values under test differ.
        const base = { ...FX.parcels['5//DP240402']!.hits[0]!.attributes };
        base['Maximum Building Height'] = 'Null';
        base['Units'] = 'NA';
        base['MAX_B_H_M'] = 'Null';
        const res = resolveNswVerticalPrecedence([
            { layerId: NSW_LAYER.HEIGHT_OF_BUILDINGS, attributes: base },
        ]);
        expect(res.state.status).toBe('refused');
        expect(res.state.status === 'refused' && res.state.basis).toBe('no-limit-stated');
        expect(res.baseHeight?.kind).toBe('no_numeric_control');
        // ⛔ L-616: an unknown/absent limit must never surface as unbounded.
        expect(JSON.stringify(res)).not.toMatch(/Infinity|1e\+?308/);
    });
});

describe('§11 — F1 (a gap) and F2 (a correct null) stay separate', () => {
    it('no controls + no land-class reading = F1, unrecovered, mechanism absent', () => {
        const res = resolveNswVerticalPrecedence([]);
        expect(res.state.status).toBe('unrecovered');
        expect(res.state.status === 'unrecovered' && res.state.mechanism).toBe('absent');
        expect(res.state.status === 'unrecovered' && res.state.failure).toBe('missing-source');
    });

    it('no controls + a positive land-class reading = F2, refused, rule-not-applicable', () => {
        const res = resolveNswVerticalPrecedence([], { landHasNoHeightSubject: true });
        expect(res.state.status).toBe('refused');
        expect(res.state.status === 'refused' && res.state.basis).toBe('rule-not-applicable');
    });

    it('the two never produce the same status — the distinction is structural', () => {
        const f1 = resolveNswVerticalPrecedence([]);
        const f2 = resolveNswVerticalPrecedence([], { landHasNoHeightSubject: true });
        expect(f1.state.status).not.toBe(f2.state.status);
    });
});

describe('§1.2 decomposed — ARM A: every emitted state carries a legal address', () => {
    it('populates country/authority/dataset on every arm, refusals included', () => {
        const cases = [
            resolveNswVerticalPrecedence([]),
            resolveNswVerticalPrecedence([], { landHasNoHeightSubject: true }),
            ...Object.keys(FX.parcels).map((p) => resolveNswVerticalPrecedence(verticalHits(p))),
        ];
        for (const res of cases) {
            expect(res.state.ref.country).toBe('AU');
            expect(res.state.ref.authority.length).toBeGreaterThan(0);
            expect(res.state.ref.dataset.length).toBeGreaterThan(0);
        }
    });
});

describe('§1.2 decomposed — ARM B: an UNCITED control never contributes a number', () => {
    it('the same layer serves two citation states, and the fixture proves it', () => {
        // Layer 572 Sun Access Protection: SERVED on the Sydney feature, absent on Parramatta's.
        const sydney = nswReadControl({
            layerId: NSW_LAYER.SUN_ACCESS_PROTECTION,
            attributes: FX.parcels['54//DP1259000']!.hits.find((h) => h.layerId === 572)!.attributes,
        });
        const parramatta = nswReadControl({
            layerId: NSW_LAYER.SUN_ACCESS_PROTECTION,
            attributes: FX.parcels['291//DP1287257']!.hits.find((h) => h.layerId === 572)!.attributes,
        });
        expect(sydney.citation.state).toBe('served');
        expect(sydney.citation.clause).toBe('Clause 6.17 & Clause 6.18');
        expect(parramatta.citation.state).toBe('absent');
        expect(parramatta.citation.clause).toBeNull();
        // An absent citation owes the reader a reason. Always.
        expect(parramatta.citation.absenceReason).toBeTruthy();
    });

    it('no control in state `absent` is ever applied on any fixture parcel', () => {
        for (const parcel of Object.keys(FX.parcels)) {
            const res = resolveNswVerticalPrecedence(verticalHits(parcel));
            for (const cap of res.hardCaps) {
                if (!nswMayContributeValue(cap.control.citation.state)) {
                    expect(cap.applied).toBe(false);
                    expect(cap.notAppliedBecause).toBeTruthy();
                }
            }
            if (res.state.status === 'resolved') {
                expect(nswMayContributeValue(res.baseControl!.citation.state)).toBe(true);
            }
        }
    });

    it('`clause` and `citation.state` can never disagree', () => {
        for (const parcel of Object.keys(FX.parcels)) {
            for (const c of resolveNswVerticalPrecedence(verticalHits(parcel)).allControls) {
                expect(c.clause === null).toBe(c.citation.state === 'absent');
                expect(c.clause).toBe(c.citation.clause);
            }
        }
    });

    it('the citable and publishable sets are ordered, and `absent` is in neither', () => {
        const all: NswCitationState[] = ['served', 'registry-signed', 'registry-unsigned', 'absent'];
        expect(all.filter(nswMayContributeValue)).toEqual(['served', 'registry-signed', 'registry-unsigned']);
        // §1.4: a named signer is the condition for publication. registry-unsigned computes and
        // ships to nobody.
        expect(all.filter(nswMayPublish)).toEqual(['served', 'registry-signed']);
    });
});

describe('L-616 — an unapplied CAP makes the answer an UPPER BOUND, and says so', () => {
    it('291//DP1287257 carries an uncited Sun Access Protection and is flagged, not silently clean', () => {
        const res = resolveNswVerticalPrecedence(verticalHits('291//DP1287257'));
        const sap = res.allControls.find((c) => c.layerId === NSW_LAYER.SUN_ACCESS_PROTECTION)!;
        expect(sap.citation.state).toBe('absent');
        expect(res.uncitedConstraints.map((c) => c.layerId)).toContain(NSW_LAYER.SUN_ACCESS_PROTECTION);
        // The height still ships — §1.5 partial over blank — but never as a settled maximum.
        expect(res.publishable).toBe(false);
    });

    it('an unapplied UPLIFT does NOT set the upper-bound flag — conservative is not overstatement', () => {
        const res = resolveNswVerticalPrecedence(verticalHits('5//DP240402'));
        expect(res.conditionalUplifts.length).toBeGreaterThan(0);
        expect(res.hardCaps.filter((h) => !h.applied)).toHaveLength(0);
        expect(res.envelopeIsUpperBound).toBe(false);
    });
});

describe('§8 / §13 — an unresolvable Building Height Plane is bounded, never a prism', () => {
    const bhp = FX.layers['430']!.features;

    it('the Burwood classes serve their own plane parameters — measured, not extracted', () => {
        // ⭐ Better than §8 assumed: CLASS_DESCRIPTION carries line height, angle and orientation
        // on all 9 polygons. The registry's A–E table is checked against the live rows here so a
        // transcription error cannot survive.
        const byClass = new Map<string, string>();
        for (const f of bhp) byClass.set(String(f['LAY_CLASS']), String(f['CLASS_DESCRIPTION']));
        expect(byClass.get('A')).toMatch(/Line Height: 1m.*Angle: 54°.*East/);
        expect(byClass.get('B')).toMatch(/Line Height: 1\.8m.*Angle: 54°.*East/);
        expect(byClass.get('C')).toMatch(/Line Height: 1m.*Angle: 36°.*West/);
        expect(byClass.get('D')).toMatch(/Line Height: 1m.*Angle: 33°.*North/);
        expect(byClass.get('E')).toMatch(/Line Height: 1\.8m.*Angle: 33°.*North/);
    });

    it('a plane whose class has no registry ruling is reported and NOT extruded', () => {
        // Class "Z" does not exist in Burwood. The engine must name the gap, not invent a prism.
        const unknown = { ...bhp[0]!, LAY_CLASS: 'Z', CLASS_DESCRIPTION: 'Null' };
        const res = resolveNswVerticalPrecedence([
            { layerId: NSW_LAYER.HEIGHT_OF_BUILDINGS, attributes: FX.parcels['5//DP240402']!.hits[0]!.attributes },
            { layerId: NSW_LAYER.BUILDING_HEIGHT_PLANE, attributes: unknown },
        ]);
        const plane = res.allControls.find((c) => c.layerId === NSW_LAYER.BUILDING_HEIGHT_PLANE)!;
        expect(plane.inclinedPlane).toBe(true);
        expect(plane.ruling).toBeNull();
        // Bounded and underdetermined — status C — so the answer is an upper bound, not status A.
        expect(res.state.status).toBe('resolved');
        expect(res.publishable).toBe(false);
        expect(JSON.stringify(res)).not.toMatch(/prism|extrud/i);
    });
});

describe('§NSW-LAY-NAME — the closed vocabulary refuses rather than defaults', () => {
    it('covers every LAY_NAME on the three captured overlay layers', () => {
        for (const [, layer] of Object.entries(FX.layers)) {
            for (const f of layer.features) {
                const q = nswQuantitySemantics(String(f['LAY_NAME']));
                expect(q.layName).toBe(String(f['LAY_NAME']));
                expect(NSW_LAY_NAME_SEMANTICS[q.layName]).toBeDefined();
            }
        }
    });

    it('an unlisted LAY_NAME is unknown, not "probably a maximum height"', () => {
        const q = nswQuantitySemantics('Maximum Building Height in Storeys');
        expect(q.constrainsEnvelopeTop).toBe(false);
        expect(q.datum).toBeNull();
        expect(q.direction).toBeNull();
    });

    it('minimum and maximum are not folded together by a substring match', () => {
        const max = nswQuantitySemantics('Maximum Building Height (m)');
        const min = nswQuantitySemantics('Minimum Level Australian Height Datum (AHD)');
        expect(max.constrainsEnvelopeTop).toBe(true);
        expect(min.constrainsEnvelopeTop).toBe(false);
        expect(max.datum).toBe('existing_ground_level');
        expect(min.datum).toBe('AHD');
    });

    it('Floor Height Restriction is a MINIMUM in AHD — never an envelope cap', () => {
        for (const f of FX.layers['469']!.features) {
            const q = nswQuantitySemantics(String(f['LAY_NAME']));
            expect(q.direction).toBe('minimum');
            expect(q.datum).toBe('AHD');
            expect(q.constrainsEnvelopeTop).toBe(false);
        }
    });
});
