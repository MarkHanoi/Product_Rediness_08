// §EXTENT-CLAIM-TOTALITY (L-677) — THE REPO-WIDE ANTI-FABRICATION GUARD.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT THIS FILE EXISTS TO MAKE IMPOSSIBLE TO REINTRODUCE — MEASURED, NOT HYPOTHESISED
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Until 2026-08-01 a parcel anywhere in Córdoba OUTSIDE the COACo 2-district pilot was answered
// with the GENERIC ESTIMATED TRIPLE — 3,0 / 1,5 / 3,0 m setbacks, FAR 2,00, coverage 50 % — on
// **95.1 % of the municipality's SUELO URBANO** (33.342 km², national SIU `OGC_Clases_Suelo`, INE
// 14021, queried 2026-08-01). No article had been read about that land. The mechanism was NOT a bug
// in the §L-663 chokepoint: the chokepoint correctly asks `resolveRegisteredJurisdictionAt`, and
// that function correctly answered `'none'` — "genuinely uncovered land, the estimate is honest
// here". **The hole was in the REGISTRY**: Córdoba's only registration was the pilot district, so
// the rest of the city was, to the registry, unclaimed land.
//
// The per-city fix (`es-14021-cordoba-municipal`, §CORDOBA-MUNICIPAL-CLOSURE, commit 478c1be7) is
// DATA. This file is the PROPERTY that stops the same shape appearing in the next city, and it is
// deliberately written over the WHOLE registry, not over Córdoba:
//
//   ⚠ A REGISTRATION MAY NEVER ADVERTISE MORE LAND THAN IT CLAIMS.
//
// `extent` is what the C60 §2 coverage globe DRAWS. `contains` is what the §L-663 chokepoint ASKS.
// If `contains` is tighter than `extent`, the two disagree in the one direction that fabricates: a
// point inside the drawn box is unclaimed by the registry, so `resolveRegisteredJurisdictionAt`
// returns `'none'`, `refuseEstimateInsideRegisteredJurisdiction` returns `false`, and
// `applyEstimatedZoning` PUBLISHES the generic triple. That is precisely the Córdoba failure, and it
// is silent — the globe looks covered, the card looks numeric, and nothing logs.
//
// The opposite direction (`contains` wider than `extent`) is NOT tested as a failure here: it costs
// one extra cited refusal on land the globe did not advertise, which is the safe sign, and several
// registrations round their box outward on purpose (`CORDOBA_MUNICIPAL_BBOX` says so verbatim).
//
// ⚠ WHAT THIS PROPERTY CANNOT DO, STATED SO IT IS NOT MISTAKEN FOR MORE. It proves DECLARED land is
// CLAIMED land. It cannot prove a city declared its whole municipal term — no registry-derivable
// fact says where Córdoba ends (PRYZM holds no municipal boundary geometry; inventing one is the
// fabrication this subsystem refuses). That second half is necessarily per-city knowledge, and the
// Córdoba half of it is the second `describe` below, pinned to the OSM relation the box came from.
//
// LAYERING: L2 pure. Data + lookups, no I/O, no network. Authority: C58 §1.4/§1.5, C60 §2/§3, C63
// §1.5, L-656, L-663, §CONTEXT-DATA-HONESTY.

import { describe, it, expect } from 'vitest';
import {
    listJurisdictionCoverage,
    resolveRegisteredJurisdictionAt,
    resolveZoneDisposition,
} from '../src/rulepacks/registry.js';
import { isEnvelopePublicationAuthorised } from '../src/rulepacks/envelopeAuthorisation.js';
import { classifyAnswerability } from '../src/rulepacks/answerabilityClass.js';
import {
    CORDOBA_BBOX,
    CORDOBA_MUNICIPAL_BBOX,
    isInCordoba,
    isInCordobaMunicipality,
} from '../src/providers/cordobaBbox.js';

/**
 * A deterministic lattice over a bbox, INCLUSIVE of the corners and edges. Corners are where a
 * `>=`/`>` slip lives, and edges are where a tighter `contains` first diverges from its `extent`.
 */
function lattice(
    box: { minLat: number; maxLat: number; minLon: number; maxLon: number },
    n: number,
): Array<readonly [number, number]> {
    const pts: Array<readonly [number, number]> = [];
    for (let i = 0; i <= n; i++) {
        for (let j = 0; j <= n; j++) {
            const lat = box.minLat + ((box.maxLat - box.minLat) * i) / n;
            const lon = box.minLon + ((box.maxLon - box.minLon) * j) / n;
            pts.push([lat, lon]);
        }
    }
    return pts;
}

describe('§EXTENT-CLAIM-TOTALITY — no registration advertises land the registry does not claim', () => {
    const ALL = listJurisdictionCoverage();

    it('the registry is non-empty (an empty registry would pass every property below vacuously)', () => {
        expect(ALL.length).toBeGreaterThan(10);
    });

    it("every point in a registration's DECLARED extent satisfies its OWN `contains` predicate", () => {
        // 11 × 11 = 121 points per registration, corners and edges included.
        const offenders: string[] = [];
        for (const c of ALL) {
            for (const [lat, lon] of lattice(c.extent, 10)) {
                if (!c.contains(lat, lon)) {
                    offenders.push(
                        `${c.jurisdictionId} declares extent [${c.extent.minLat},${c.extent.minLon} → ` +
                            `${c.extent.maxLat},${c.extent.maxLon}] but its own contains() rejects ` +
                            `${lat.toFixed(5)},${lon.toFixed(5)}`,
                    );
                    break; // one witness per registration is enough to fail and to read
                }
            }
        }
        expect(
            offenders,
            'A `contains` tighter than its declared `extent` is the CÓRDOBA HOLE: the globe draws ' +
                'the box, the §L-663 chokepoint asks the registry, the registry says "none", and the ' +
                'generic estimated triple (3.0/1.5/3.0 m, FAR 2.0, 50 %) is published on land no ' +
                'article was read about. Either narrow `extent` or widen `contains` — never leave them ' +
                'disagreeing in this direction.',
        ).toEqual([]);
    });

    it('…and therefore NO point in any declared extent ever resolves to `none`', () => {
        // The property one level up, through the REAL function the chokepoint calls — so the guard
        // survives a future change to how claims are resolved, not only to how they are declared.
        const offenders: string[] = [];
        for (const c of ALL) {
            for (const [lat, lon] of lattice(c.extent, 6)) {
                if (resolveRegisteredJurisdictionAt(lat, lon).kind === 'none') {
                    offenders.push(
                        `${c.jurisdictionId} @ ${lat.toFixed(5)},${lon.toFixed(5)} → 'none' ` +
                            '(⇒ applyEstimatedZoning would fabricate)',
                    );
                    break;
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it('the guard is LIVE, not vacuous — a deliberately holed registration is caught', () => {
        // A registration shaped exactly like pre-478c1be7 Córdoba: a municipal-sized declared extent
        // with a district-sized predicate. If the assertion above ever stops catching this, it has
        // stopped testing anything.
        const holed = {
            jurisdictionId: 'synthetic-holed-city',
            extent: CORDOBA_MUNICIPAL_BBOX,
            contains: isInCordoba, // the PILOT predicate under a MUNICIPAL box — the original defect
        };
        const miss = lattice(holed.extent, 10).find(([lat, lon]) => !holed.contains(lat, lon));
        expect(miss, 'the synthetic hole must be detectable by the same lattice').toBeDefined();
    });
});

describe('§CORDOBA-MUNICIPAL-CLOSURE — the fabrication is dead across the WHOLE municipal term', () => {
    // The per-city half the repo-wide property cannot derive. `CORDOBA_MUNICIPAL_BBOX` is the extent
    // of OSM relation 343207 (`boundary=administrative`, `admin_level=8`, `ine:municipio=14021`),
    // read live from Nominatim 2026-08-01 as [37.6658228, 38.0315171, -4.9985994, -4.3514283] and
    // rounded OUTWARD (cordobaBbox.ts §CORDOBA-MUNICIPAL-CLOSURE).
    const CORDOBA_IDS = new Set(['es-14021-cordoba', 'es-14021-cordoba-municipal']);

    it('a 41 × 41 lattice over the municipal term NEVER resolves to `none`', () => {
        const pts = lattice(CORDOBA_MUNICIPAL_BBOX, 40); // 1 681 points, ≈ 1 km spacing
        const none: string[] = [];
        const foreign: string[] = [];
        for (const [lat, lon] of pts) {
            const r = resolveRegisteredJurisdictionAt(lat, lon);
            if (r.kind === 'none') {
                none.push(`${lat.toFixed(5)},${lon.toFixed(5)}`);
                continue;
            }
            const ids =
                r.kind === 'resolved'
                    ? [r.jurisdiction.jurisdictionId]
                    : r.candidates.map((c) => c.jurisdictionId);
            if (!ids.some((id) => CORDOBA_IDS.has(id))) {
                foreign.push(`${lat.toFixed(5)},${lon.toFixed(5)} → ${ids.join('/')}`);
            }
        }
        expect(pts.length).toBe(41 * 41);
        expect(
            none,
            'ANY `none` inside the Córdoba municipal term re-opens the 95.1 %-of-SUELO-URBANO ' +
                'fabrication closed by §CORDOBA-MUNICIPAL-CLOSURE.',
        ).toEqual([]);
        expect(foreign, 'no Córdoba point may be answered by another city’s instrument').toEqual([]);
    });

    it('the PILOT wins its own land by RULE, and the municipal box wins everywhere else', () => {
        // Pilot centre (Córdoba historic centre ≈ 37.8800, −4.7850).
        const inPilot = resolveRegisteredJurisdictionAt(37.88, -4.785);
        expect(inPilot.kind).toBe('resolved');
        if (inPilot.kind === 'resolved') {
            expect(inPilot.jurisdiction.jurisdictionId).toBe('es-14021-cordoba');
        }
        // Every lattice point INSIDE the pilot resolves to the pilot; every point inside the
        // municipality but outside it resolves to the refusal-only municipal registration.
        for (const [lat, lon] of lattice(CORDOBA_MUNICIPAL_BBOX, 40)) {
            const r = resolveRegisteredJurisdictionAt(lat, lon);
            if (r.kind !== 'resolved') continue;
            const expected = isInCordoba(lat, lon)
                ? 'es-14021-cordoba'
                : 'es-14021-cordoba-municipal';
            expect(
                r.jurisdiction.jurisdictionId,
                `${lat.toFixed(5)},${lon.toFixed(5)} (isInCordoba=${isInCordoba(lat, lon)})`,
            ).toBe(expected);
        }
    });

    it('the REFUSAL-ONLY registration carries NO pack, so it can never draw a number', () => {
        const muni = listJurisdictionCoverage().find(
            (c) => c.jurisdictionId === 'es-14021-cordoba-municipal',
        );
        expect(muni).toBeDefined();
        // Empty BY CONSTRUCTION (registry.ts): outside the pilot no calificación is published, so
        // there is nothing to key a pack on. A non-empty map here would mean somebody packed rules
        // for land COACo maps no ordenanza onto.
        expect(muni!.packZoneCodes).toEqual([]);
        expect(muni!.extentResolution).toBe('municipal');
    });

    it('the refusal-only registration CANNOT fail open on the authorisation gate', () => {
        // ⚠ THE FOUNDER'S WARNING, CHECKED RATHER THAN ASSUMED. `ENVELOPE_PUBLICATION_GATES` is
        // FAIL-OPEN BY ABSENCE (an unlisted jurisdiction is authorised), and
        // `es-14021-cordoba-municipal` is NOT listed — so `isEnvelopePublicationAuthorised` returns
        // `true` for it. That looks exactly like the València hole. It is NOT one, and the reason is
        // structural rather than lucky: the gate is consulted ONLY in `classifyDisposition`'s
        // `'pack'` branch, and this registration's `packsByZone` is empty BY CONSTRUCTION, so no
        // zone code can ever reach that branch. Pinned here so that if either half changes — a pack
        // is added, or the gate starts being read on a non-pack branch — this goes red instead of
        // silently authorising an envelope on the 95.1 % of Córdoba that has no published rules.
        expect(isEnvelopePublicationAuthorised('es-14021-cordoba-municipal')).toBe(true);
        for (const zone of [
            'MC-2', 'CTP-1', 'OA-1', 'PAS-2', 'UAD-3', // real packed codes from the PILOT
            'cordoba-pgou-2001-pilot', 'Uso Comercial', 'anything-at-all', '',
        ]) {
            const d = resolveZoneDisposition('es-14021-cordoba-municipal', zone);
            expect(d.kind, `${zone} must never resolve to a PACK on the municipal registration`)
                .not.toBe('pack');
            expect(
                classifyAnswerability('es-14021-cordoba-municipal', zone),
                `${zone} must never be classified as a full envelope outside the pilot`,
            ).not.toBe('full-envelope');
        }
        // …while the PILOT, which does hold packs, is correctly held shut by its own gate.
        expect(isEnvelopePublicationAuthorised('es-14021-cordoba')).toBe(false);
        expect(classifyAnswerability('es-14021-cordoba', 'MC-2')).toBe('pack-unverified');
    });

    it('the two Córdoba boxes are nested the way the specificity rule requires', () => {
        // The pilot must be strictly INSIDE the municipal term, or the `'district'` ≺ `'municipal'`
        // ordering would leave pilot land unclaimed on one side.
        for (const [lat, lon] of lattice(CORDOBA_BBOX, 12)) {
            expect(isInCordobaMunicipality(lat, lon), `${lat},${lon}`).toBe(true);
        }
    });
});
