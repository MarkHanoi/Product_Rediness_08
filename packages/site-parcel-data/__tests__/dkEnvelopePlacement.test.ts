// §L-619 / DK gap G6 — the Denmark footprint-placement resolver, tested against the founder's
// actual Copenhagen karré parcel (≈1,116 m²; modelled here as the 40 × 28 m plot the L-619 tests
// already use) rather than against abstract shapes.
//
// WHAT IS BEING PROVED — the four honesty rules, behaviourally:
//   §BYGGEFELT-BINDING-GATE  an adopted-but-not-proven-binding byggefelt does NOT become a footprint.
//   §UNKNOWN-IS-NOT-ZERO     one byggelinje yields NO depth — the second line is never synthesised.
//   §FAILURE-IS-NOT-EMPTY    a failed fetch and a genuine absence produce DIFFERENT answers.
//   §NO-SILENT-FALLBACK      a refusal is a typed value that names what a caller must do instead.
// Plus the end-to-end result: the parcel that used to render as a filled 1,120 m² solid now
// resolves to a real perimeter band with a courtyard behind it.

import { describe, it, expect } from 'vitest';
import type { ParcelEdgeClassification, Pt, ZoningRecord } from '@pryzm/schemas';
import {
    resolveDkEnvelopePlacement,
    dkByggefeltFromRing,
    applyDkPlacement,
    computeBuildableEnvelope,
    DK_BYGGEFELT_RING_REF,
    type BuildingLineConstraint,
    type DkPlacementInputs,
} from '../src/index.js';
import { fetchAbsent, fetchFound, fetchTransient } from '@pryzm/schemas';

// ── The founder's Copenhagen karré parcel. Edge 0 (z = 0) is the street frontage. ──
function rect(x0: number, z0: number, x1: number, z1: number): Pt[] {
    return [
        { x: x0, z: z0 },
        { x: x1, z: z0 },
        { x: x1, z: z1 },
        { x: x0, z: z1 },
    ];
}
const PARCEL = rect(0, 0, 40, 28); // 1,120 m²
const PARCEL_AREA = 1120;
const FRONTED: ParcelEdgeClassification[] = ['front', 'unclassified', 'unclassified', 'unclassified'];
const UNCLASSIFIED: ParcelEdgeClassification[] = [
    'unclassified',
    'unclassified',
    'unclassified',
    'unclassified',
];
/**
 * A FULLY classified karré parcel. Needed wherever the measured façade offset is fed to the engine
 * as `setbacks.front_m`: with unclassified side/rear edges the engine applies its sanctioned
 * UNIFORM fallback (C58 §10.3) and insets the sides by the front value too, which is correct
 * engine behaviour but not what a byggelinje band means. Per-edge classification is the wiring
 * prerequisite the byggelinjer tier assumes.
 */
const CLASSIFIED: ParcelEdgeClassification[] = ['front', 'side', 'rear', 'side'];

/** A byggelinje as Plandata publishes it: geometry only — no binding, no distance. */
function byggelinje(zDepth: number): BuildingLineConstraint {
    return {
        geometry: [
            { x: 0, z: zDepth },
            { x: 40, z: zDepth },
        ],
        binding: 'unknown',
        distanceM: null,
    };
}
/** Façade line 4 m in + rear line 16 m in ⇒ a 12 m karré building band. */
const FACADE_LINE = byggelinje(4);
const REAR_LINE = byggelinje(16);

function inputs(over: Partial<DkPlacementInputs> = {}): DkPlacementInputs {
    return {
        parcelRing: PARCEL,
        parcelEdgeClassifications: FRONTED,
        ...over,
    };
}

/** A DK structured record: real height + FAR, setbacks NULL (Plandata publishes none). */
function dkRecord(over?: Partial<ZoningRecord['structuredFields']>): ZoningRecord {
    return {
        zoneCode: 'DK-LOKALPLAN',
        zoneLabel: 'Copenhagen lokalplan',
        jurisdictionId: 'dk',
        structuredFields: {
            maxHeight_m: 24,
            maxFloors: null,
            plotRatioFAR: 1.5,
            maxCoverage: null,
            setbacks: { front_m: null, side_m: null, rear_m: null },
            permittedUse: ['residential'],
            ...over,
        },
        overlays: [],
        ordinanceRef: 'https://dokument.plandata.dk/plan-123',
        provenance: {
            source: 'plandata-dk',
            label: 'Plandata.dk',
            version: '2026-07-30',
            license: 'Open public data',
            crs: 'EPSG:25832',
        },
    } as ZoningRecord;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('G6 tier hierarchy — the strongest available source places the footprint', () => {
    it('TIER 1: a PROVEN-BINDING byggefelt wins, even with byggelinjer and a cited depth present', () => {
        const r = resolveDkEnvelopePlacement(
            inputs({
                byggefelt: fetchFound(dkByggefeltFromRing(rect(2, 2, 38, 14), 'binding', 'byggefelt.4711')),
                byggelinjer: fetchFound([FACADE_LINE, REAR_LINE]),
                lokalplanDepth: fetchFound({ depthM: 12, citation: 'Lokalplan 123 §7.2' }),
                blockRingAvailable: true,
            }),
        );
        expect(r.placed).toBe(true);
        expect(r.tier).toBe('byggefelt');
        expect(r.placement).toEqual({ source: 'byggefelt' });
        expect(r.openSpace).toEqual({ courtyard: true, source: 'byggefelt-hole' });
        expect(r.geometricRule).toEqual({ kind: 'explicit-area', ringRef: DK_BYGGEFELT_RING_REF });
        expect(r.explicitAreaSource?.footprintParts).toEqual([{ outer: rect(2, 2, 38, 14), holes: [] }]);
    });

    it('TIER 2: byggelinjer place the band when no binding byggefelt exists', () => {
        const r = resolveDkEnvelopePlacement(
            inputs({
                byggefelt: fetchAbsent('no-byggefelt'),
                byggelinjer: fetchFound([FACADE_LINE, REAR_LINE]),
                lokalplanDepth: fetchFound({ depthM: 12, citation: 'Lokalplan 123 §7.2' }),
                blockRingAvailable: true,
            }),
        );
        expect(r.tier).toBe('byggelinjer');
        expect(r.placement).toEqual({ source: 'buildingLine' });
        expect(r.openSpace).toEqual({ courtyard: true, source: 'building-line-band' });
        // MEASURED, not assumed: façade at 4 m, rear at 16 m ⇒ a 12 m band.
        expect(r.facadeOffsetM).toBeCloseTo(4, 9);
        expect(r.buildableDepthM).toBeCloseTo(16, 9);
        expect(r.geometricRule).toMatchObject({ kind: 'alignment', buildableDepth_m: 16 });
    });

    it('TIER 3: a CITED lokalplan depth places the band when no geometry source can', () => {
        const r = resolveDkEnvelopePlacement(
            inputs({
                byggefelt: fetchAbsent('no-byggefelt'),
                byggelinjer: fetchAbsent('no-byggelinje'),
                lokalplanDepth: fetchFound({ depthM: 12, citation: 'Lokalplan 123 §7.2' }),
                blockRingAvailable: true,
            }),
        );
        expect(r.tier).toBe('lokalplan-depth');
        // `derived` = CONSTRUCTED from a depth, not read off published geometry. Its official
        // status lives in openSpace.source, which is what the schema pairing enforces.
        expect(r.placement).toEqual({ source: 'derived' });
        expect(r.openSpace).toEqual({ courtyard: true, source: 'lokalplan-depth' });
        expect(r.buildableDepthM).toBe(12);
        expect(r.caveats.join(' ')).toMatch(/Lokalplan 123 §7\.2/);
    });

    it('TIER 4: the conservative block study is the LAST resort, and says so in its caveats', () => {
        const r = resolveDkEnvelopePlacement(
            inputs({
                byggefelt: fetchAbsent('no-byggefelt'),
                byggelinjer: fetchAbsent('no-byggelinje'),
                lokalplanDepth: fetchAbsent('no-depth-clause'),
                blockRingAvailable: true,
            }),
        );
        expect(r.tier).toBe('block-derived-study');
        expect(r.placement).toEqual({ source: 'derived' });
        expect(r.openSpace).toEqual({ courtyard: true, source: 'block-derived-study' });
        expect(r.geometricRule).toMatchObject({ kind: 'block-derived-alignment' });
        expect(r.caveats.join(' ')).toMatch(/Study courtyard/i);
        expect(r.caveats.join(' ')).toMatch(/upper-bound study, not a surveyed buildable area/i);
    });

    it('records EVERY tier exactly once, so "not reached" never reads as "found nothing"', () => {
        const r = resolveDkEnvelopePlacement(
            inputs({ byggefelt: fetchFound(dkByggefeltFromRing(rect(2, 2, 38, 14), 'binding')) }),
        );
        expect(r.diagnostics.map((d) => d.tier)).toEqual([
            'byggefelt',
            'byggelinjer',
            'lokalplan-depth',
            'block-derived-study',
        ]);
        expect(r.diagnostics[0]!.outcome).toBe('used');
        // The three that never ran are labelled `not-consulted` WITH the reason they were skipped.
        for (const d of r.diagnostics.slice(1)) {
            expect(d.outcome).toBe('not-consulted');
            expect(d.detail).toMatch(/higher-authority/);
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('§BYGGEFELT-BINDING-GATE (G3) — vedtaget = adopted ≠ binding', () => {
    for (const binding of ['unknown', 'advisory'] as const) {
        it(`does NOT draw a byggefelt with binding='${binding}' as the footprint`, () => {
            const r = resolveDkEnvelopePlacement(
                inputs({
                    byggefelt: fetchFound(dkByggefeltFromRing(rect(2, 2, 38, 14), binding)),
                    byggelinjer: fetchAbsent('no-byggelinje'),
                    lokalplanDepth: fetchAbsent('no-depth-clause'),
                    blockRingAvailable: true,
                }),
            );
            expect(r.tier).not.toBe('byggefelt');
            expect(r.tier).toBe('block-derived-study'); // fell all the way through to the study
            const bf = r.diagnostics.find((d) => d.tier === 'byggefelt')!;
            expect(bf.outcome).toBe('binding-unproven');
            expect(bf.detail).toMatch(/vedtaget = adopted ≠ binding/);
        });
    }

    it('does not treat an unproven byggefelt as a fetch failure either — it is present, just unusable', () => {
        const r = resolveDkEnvelopePlacement(
            inputs({ byggefelt: fetchFound(dkByggefeltFromRing(rect(2, 2, 38, 14), 'unknown')) }),
        );
        // The distinction matters: a retry will not make it binding, so this is NOT retryable.
        expect(r.higherAuthorityUnresolved).toBe(false);
        expect(r.refusalReason).toBe('no-usable-source');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('§UNKNOWN-IS-NOT-ZERO — a band needs TWO lines; the second is never synthesised', () => {
    it('REFUSES the byggelinjer tier on a single frontage-parallel line', () => {
        const r = resolveDkEnvelopePlacement(
            inputs({
                byggefelt: fetchAbsent('no-byggefelt'),
                byggelinjer: fetchFound([FACADE_LINE]),
                lokalplanDepth: fetchAbsent('no-depth-clause'),
            }),
        );
        const bl = r.diagnostics.find((d) => d.tier === 'byggelinjer')!;
        expect(bl.outcome).toBe('insufficient-lines-for-band');
        expect(bl.detail).toMatch(/depth is NOT synthesised/);
        expect(r.placed).toBe(false); // no study available either
    });

    it('falls THROUGH to a cited depth rather than inventing one from the single line', () => {
        const r = resolveDkEnvelopePlacement(
            inputs({
                byggelinjer: fetchFound([FACADE_LINE]),
                lokalplanDepth: fetchFound({ depthM: 12, citation: 'Lokalplan 99 §5.1' }),
            }),
        );
        expect(r.tier).toBe('lokalplan-depth');
        expect(r.buildableDepthM).toBe(12);
    });

    it('drops byggelinjer that CROSS the frontage — they are not façade/rear lines', () => {
        const crossing: BuildingLineConstraint = {
            geometry: [
                { x: 10, z: 0 },
                { x: 10, z: 28 },
            ],
            binding: 'unknown',
            distanceM: null,
        };
        const r = resolveDkEnvelopePlacement(
            inputs({ byggelinjer: fetchFound([FACADE_LINE, crossing]) }),
        );
        const bl = r.diagnostics.find((d) => d.tier === 'byggelinjer')!;
        // Only ONE frontage-parallel line survives ⇒ still no band.
        expect(bl.outcome).toBe('insufficient-lines-for-band');
    });

    it('REFUSES without a classified frontage — never assumes "front = north"', () => {
        const r = resolveDkEnvelopePlacement(
            inputs({
                parcelEdgeClassifications: UNCLASSIFIED,
                byggelinjer: fetchFound([FACADE_LINE, REAR_LINE]),
                lokalplanDepth: fetchFound({ depthM: 12, citation: 'Lokalplan 99 §5.1' }),
                blockRingAvailable: true,
            }),
        );
        expect(r.placed).toBe(false);
        expect(r.diagnostics.find((d) => d.tier === 'byggelinjer')!.outcome).toBe('no-front-edge');
        expect(r.diagnostics.find((d) => d.tier === 'lokalplan-depth')!.outcome).toBe('no-front-edge');
        expect(r.diagnostics.find((d) => d.tier === 'block-derived-study')!.outcome).toBe('no-front-edge');
    });

    it('measures the SAME band whichever way the karré frontage points', () => {
        // The Copenhagen frontage may run any direction; the answer must not depend on north.
        const rotate = (pts: readonly Pt[], deg: number): Pt[] => {
            const a = (deg * Math.PI) / 180;
            const c = Math.cos(a);
            const s = Math.sin(a);
            return pts.map((p) => ({ x: p.x * c - p.z * s, z: p.x * s + p.z * c }));
        };
        for (const deg of [0, 37, 90, 180, 293]) {
            const r = resolveDkEnvelopePlacement({
                parcelRing: rotate(PARCEL, deg),
                parcelEdgeClassifications: FRONTED,
                byggelinjer: fetchFound([
                    { ...FACADE_LINE, geometry: rotate(FACADE_LINE.geometry, deg) },
                    { ...REAR_LINE, geometry: rotate(REAR_LINE.geometry, deg) },
                ]),
            });
            expect(r.tier, `rotation ${deg}°`).toBe('byggelinjer');
            expect(r.facadeOffsetM!, `rotation ${deg}°`).toBeCloseTo(4, 6);
            expect(r.buildableDepthM!, `rotation ${deg}°`).toBeCloseTo(16, 6);
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('§FAILURE-IS-NOT-EMPTY — a failed fetch and a genuine absence are different answers', () => {
    it('distinguishes them in the diagnostic, carrying the source’s own reason', () => {
        const r = resolveDkEnvelopePlacement(
            inputs({
                byggefelt: fetchTransient('endpoint-unreachable'),
                byggelinjer: fetchAbsent('no-byggelinje published for this plan'),
                lokalplanDepth: null, // not consulted at all — a THIRD state
            }),
        );
        expect(r.diagnostics.find((d) => d.tier === 'byggefelt')).toMatchObject({
            outcome: 'transient',
            detail: 'endpoint-unreachable',
        });
        expect(r.diagnostics.find((d) => d.tier === 'byggelinjer')).toMatchObject({
            outcome: 'absent',
            detail: 'no-byggelinje published for this plan',
        });
        expect(r.diagnostics.find((d) => d.tier === 'lokalplan-depth')).toMatchObject({
            outcome: 'not-consulted',
        });
    });

    it('a transient on a HIGHER tier makes the refusal RETRYABLE, not a coverage fact', () => {
        const failed = resolveDkEnvelopePlacement(inputs({ byggefelt: fetchTransient('timeout') }));
        expect(failed.refusalReason).toBe('sources-unresolved');
        expect(failed.higherAuthorityUnresolved).toBe(true);
        expect(failed.caveats.join(' ')).toMatch(/must NOT be cached/);

        const empty = resolveDkEnvelopePlacement(inputs({ byggefelt: fetchAbsent('no-byggefelt') }));
        expect(empty.refusalReason).toBe('no-usable-source');
        expect(empty.higherAuthorityUnresolved).toBe(false);
        expect(empty.caveats.join(' ')).not.toMatch(/must NOT be cached/);
    });

    it('a transient above a tier that DID fire marks the study PROVISIONAL, not authoritative', () => {
        const r = resolveDkEnvelopePlacement(
            inputs({
                byggefelt: fetchTransient('upstream-failed'),
                byggelinjer: fetchAbsent('no-byggelinje'),
                lokalplanDepth: fetchAbsent('no-depth-clause'),
                blockRingAvailable: true,
            }),
        );
        expect(r.placed).toBe(true);
        expect(r.tier).toBe('block-derived-study');
        // Placed, but the answer could be REPLACED by plan geometry on retry — so it is uncacheable.
        expect(r.higherAuthorityUnresolved).toBe(true);
        expect(r.caveats.join(' ')).toMatch(/PROVISIONAL/);
        expect(r.caveats.join(' ')).toMatch(/do NOT.*cache/i);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('§NO-SILENT-FALLBACK — a refusal is a typed value that names the fallback', () => {
    it('refuses with nothing consulted, and points the caller at the upper-bound envelope', () => {
        const r = resolveDkEnvelopePlacement(inputs());
        expect(r.placed).toBe(false);
        expect(r.tier).toBeNull();
        expect(r.placement).toBeNull();
        expect(r.openSpace).toBeNull();
        expect(r.geometricRule).toBeNull();
        expect(r.refusalReason).toBe('no-usable-source');
        expect(r.caveats.join(' ')).toMatch(/WHOLE PARCEL as an UPPER BOUND/);
        expect(r.caveats.join(' ')).toMatch(/footprintIsUpperBound/);
    });

    it('refuses on a degenerate parcel without throwing', () => {
        const r = resolveDkEnvelopePlacement({
            parcelRing: [{ x: 0, z: 0 }, { x: 1, z: 1 }],
            parcelEdgeClassifications: ['front', 'front'],
            byggefelt: fetchFound(dkByggefeltFromRing(rect(0, 0, 1, 1), 'binding')),
        });
        expect(r.refusalReason).toBe('degenerate-parcel');
        expect(r.diagnostics).toHaveLength(4);
    });

    it('rejects a degenerate byggefelt ring rather than drawing a 2-point footprint', () => {
        const r = resolveDkEnvelopePlacement(
            inputs({ byggefelt: fetchFound(dkByggefeltFromRing([{ x: 0, z: 0 }, { x: 1, z: 0 }], 'binding')) }),
        );
        expect(r.diagnostics.find((d) => d.tier === 'byggefelt')!.outcome).toBe('degenerate');
        expect(r.placed).toBe(false);
    });

    it('rejects a non-positive cited depth rather than clipping to nothing', () => {
        const r = resolveDkEnvelopePlacement(
            inputs({ lokalplanDepth: fetchFound({ depthM: 0, citation: 'Lokalplan 1 §1' }) }),
        );
        expect(r.diagnostics.find((d) => d.tier === 'lokalplan-depth')!.outcome).toBe('degenerate');
        expect(r.placed).toBe(false);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('END-TO-END — the L-619 defect parcel now yields a band + courtyard, not a filled solid', () => {
    it('BEFORE: with no placement source the footprint is the whole parcel, flagged upper-bound', () => {
        const env = computeBuildableEnvelope({
            parcelRing: PARCEL,
            edgeClassifications: FRONTED,
            zoning: dkRecord(),
            rulePack: null,
        });
        expect(env.insetAreaM2).toBeCloseTo(PARCEL_AREA, 6);
        expect(env.footprintIsUpperBound).toBe(true);
        expect(env.placement).toBeNull();
        expect(env.openSpace).toBeNull();
    });

    it('AFTER: byggelinjer place a 12 m band, leaving 640 m² of courtyard, stamped buildingLine', () => {
        const r = resolveDkEnvelopePlacement(
            inputs({ byggelinjer: fetchFound([FACADE_LINE, REAR_LINE]) }),
        );
        expect(r.tier).toBe('byggelinjer');

        // The caller feeds the MEASURED façade offset as the front setback; the rule's depth then
        // cuts the rear. This is the wiring the resolution documents.
        const solved = computeBuildableEnvelope({
            parcelRing: PARCEL,
            edgeClassifications: CLASSIFIED,
            zoning: dkRecord({ setbacks: { front_m: r.facadeOffsetM, side_m: null, rear_m: null } }),
            rulePack: null,
            geometricRule: r.geometricRule!,
        });
        expect(solved.status).toBe('ok');
        // 40 m frontage × 12 m band = 480 m² — the courtyard behind it is the remaining 640 m².
        expect(solved.insetAreaM2).toBeCloseTo(480, 4);
        expect(PARCEL_AREA - solved.insetAreaM2).toBeCloseTo(640, 4);
        // A shaping rule ran, so this is a SOLVED footprint — not an upper bound.
        expect(solved.footprintIsUpperBound).toBe(false);

        const stamped = applyDkPlacement(solved, r);
        expect(stamped.placement).toEqual({ source: 'buildingLine' });
        expect(stamped.openSpace).toEqual({ courtyard: true, source: 'building-line-band' });
        expect(stamped.caveats.join(' ')).toMatch(/MEASURED between published lines/);
        // L-616 stays protected: FAR still caps the massing inside the 24 m height shell.
        expect(stamped.maxHeight_m).toBe(24);
        expect(stamped.farLimitedHeight_m!).toBeLessThan(24);
    });

    it('AFTER: a cited lokalplan depth yields the SAME machinery with an official-text void label', () => {
        const r = resolveDkEnvelopePlacement(
            inputs({ lokalplanDepth: fetchFound({ depthM: 12, citation: 'Lokalplan 123 §7.2' }) }),
        );
        const solved = computeBuildableEnvelope({
            parcelRing: PARCEL,
            edgeClassifications: FRONTED,
            zoning: dkRecord(),
            rulePack: null,
            geometricRule: r.geometricRule!,
        });
        expect(solved.insetAreaM2).toBeCloseTo(40 * 12, 4);
        const stamped = applyDkPlacement(solved, r);
        expect(stamped.openSpace).toEqual({ courtyard: true, source: 'lokalplan-depth' });
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('applyDkPlacement — validates rather than trusts', () => {
    it('stamps nothing for a refusal, leaving the upper-bound envelope untouched', () => {
        const env = computeBuildableEnvelope({
            parcelRing: PARCEL,
            edgeClassifications: FRONTED,
            zoning: dkRecord(),
            rulePack: null,
        });
        const stamped = applyDkPlacement(env, resolveDkEnvelopePlacement(inputs()));
        expect(stamped).toBe(env); // identical object — no silent mutation, no partial stamp
        expect(stamped.footprintIsUpperBound).toBe(true);
    });

    it('stamps nothing onto a non-ok envelope — there is no footprint to attribute a void to', () => {
        const refusedEnv = computeBuildableEnvelope({
            parcelRing: PARCEL,
            edgeClassifications: FRONTED,
            zoning: dkRecord(),
            rulePack: null,
            // block-derived rule with NO block ring ⇒ the engine hard-refuses (degenerate).
            geometricRule: resolveDkEnvelopePlacement(inputs({ blockRingAvailable: true }))
                .geometricRule!,
        });
        expect(refusedEnv.status).toBe('degenerate');
        const stamped = applyDkPlacement(
            refusedEnv,
            resolveDkEnvelopePlacement(inputs({ blockRingAvailable: true })),
        );
        expect(stamped.placement).toBeNull();
        expect(stamped.openSpace).toBeNull();
    });

    it('THROWS on an incoherent pairing rather than letting a mislabelled envelope reach a renderer', () => {
        const solved = computeBuildableEnvelope({
            parcelRing: PARCEL,
            edgeClassifications: FRONTED,
            zoning: dkRecord(),
            rulePack: null,
            geometricRule: {
                kind: 'alignment',
                alignTo: 'street',
                alignmentOffset_m: 0,
                sideTreatment: 'party-wall',
                buildableDepth_m: 12,
            },
        });
        const good = resolveDkEnvelopePlacement(
            inputs({ lokalplanDepth: fetchFound({ depthM: 12, citation: 'Lokalplan 123 §7.2' }) }),
        );
        // A constructed band claiming a PUBLISHED byggefelt hole as its courtyard would launder a
        // study into plan geometry — the L0 refinement must stop it here.
        const laundered = { ...good, openSpace: { courtyard: true, source: 'byggefelt-hole' } as const };
        expect(() => applyDkPlacement(solved, laundered)).toThrow();
    });
});
