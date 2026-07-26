// PARIS — the PLU bioclimatique PROVIDER test: `parseParisPluResponse` (pure) + `resolveParisPluZone`
// (the impure seam, never throws). Fixture-driven: no live network. The fixtures are modelled on the
// LIVE probe of 2026-07-25 — real zone code (`UG`), real règlement doc (`75056_reglement_20260616.pdf`),
// real hauteur values (18/25/31/37 m), and the honest secteur-sauvegardé case (zone but no height).
//
// Mirrors `esMadridNZ1Provider.test.ts` / `chGrundnutzungProvider.test.ts`: prove the parse keeps the
// honesty invariants (a fabricated height is impossible; a failure and an empty answer stay distinct)
// and the resolver never throws on any upstream shape.

import { describe, it, expect } from 'vitest';
import {
    parseParisPluResponse,
    parseParisRing,
    resolveParisPluZone,
    resolveParisEnvelope,
    parisFiletMetresForCode,
    parseParisSourceVersion,
    PARIS_PLU_PATH,
    PARIS_HAUTEUR_SOURCE,
    PARIS_FILET_CODE_TO_METRES,
    type ParisPluProxyResponse,
} from '../src/providers/resolveParisPluZone.js';
import { isInParis } from '../src/providers/parisBbox.js';

// A live-shaped ECM half on the combined body: the real footprint ring + source fields.
const ECM_HALF = {
    ring: [
        [2.393, 48.882],
        [2.3931, 48.882],
        [2.3931, 48.8821],
        [2.393, 48.8821],
    ],
    areaM2: 83.12,
    emprisePct: null,
    graphicHeight: null,
    cadastral: '19-DL-0002',
};

// ── Fixtures anchored on the live 2026-07-25 probe. ──
const UG_ZONE = {
    libelle: 'UG',
    libelong: 'Zone urbaine générale',
    typezone: 'U',
    nomfic: '75056_reglement_20260616.pdf',
    idurba: '75056_PLU_20260616',
    datappro: null,
};
const bodyUG = (hauteur_m: number | null): ParisPluProxyResponse => ({
    zone: UG_ZONE,
    hauteur: hauteur_m === null ? null : { hauteur_m },
});
// The FULL live-probe body at (48.857, 2.380): UG / 25 m ceiling, NO HMC overlay here, nearest filet `N` (20 m).
const bodyUGFull: ParisPluProxyResponse = {
    zone: UG_ZONE,
    hauteur: { hauteur_m: 25 },
    hmc: null,
    filet: { code: 'N' },
};
// An HMC-covered body (field shapes verified live at 2.408404, 48.858855): ht_hmc 85.0 NGF.
const bodyWithHmc: ParisPluProxyResponse = {
    zone: UG_ZONE,
    hauteur: { hauteur_m: 25 },
    hmc: { hmc_m: 85, datum: 'NGF' },
    filet: { code: 'L' },
};

const PARIS = { lat: 48.857, lon: 2.38 }; // 11th arrondissement — the UG / 25 m probe point.

const okFetch = (body: unknown): typeof fetch =>
    (async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch;

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('parseParisPluResponse — the PURE parse (no fabricated height, no invented emprise)', () => {
    it('maps a UG zone + the numeric height CEILING (heightCeiling_m, never maxBuildingHeight)', () => {
        const { zone, heightCeiling_m } = parseParisPluResponse(bodyUG(25));
        expect(zone?.zoneCode).toBe('UG');
        expect(zone?.zoneLabel).toBe('Zone urbaine générale');
        expect(zone?.typeZone).toBe('U');
        expect(zone?.reglementDoc).toBe('75056_reglement_20260616.pdf');
        expect(zone?.planId).toBe('75056_PLU_20260616');
        expect(heightCeiling_m).toBe(25);
    });

    it('HMC is a DISTINCT field — never collapsed into heightCeiling; carries its datum (NGF)', () => {
        const p = parseParisPluResponse(bodyWithHmc);
        expect(p.heightCeiling_m).toBe(25); // the plafond
        expect(p.hmc_m).toBe(85); // the HMC ceiling — a SEPARATE number
        expect(p.hmcDatum).toBe('NGF'); // absolute-altitude datum, not a relative height
        expect(p.heightCeiling_m).not.toBe(p.hmc_m);
    });

    it('a non-positive / absent HMC withholds both hmc_m and its datum', () => {
        expect(parseParisPluResponse(bodyUGFull).hmc_m).toBeNull();
        expect(parseParisPluResponse(bodyUGFull).hmcDatum).toBeNull();
        expect(parseParisPluResponse({ hmc: { hmc_m: 0, datum: 'NGF' } }).hmc_m).toBeNull();
    });

    it('the filet code is mapped to metres via the gabarit table (N → 20 m); code is upper-cased', () => {
        const p = parseParisPluResponse(bodyUGFull);
        expect(p.filetCode).toBe('N');
        expect(p.filetFrontageHeight_m).toBe(20);
        expect(parseParisPluResponse({ filet: { code: 'l' } }).filetFrontageHeight_m).toBe(25);
    });

    it('filet code M ("same as existing façade") → code kept, metres null (never fabricated)', () => {
        const p = parseParisPluResponse({ zone: UG_ZONE, filet: { code: 'M' } });
        expect(p.filetCode).toBe('M');
        expect(p.filetFrontageHeight_m).toBeNull();
    });

    it('sourceVersion is derived from the plan idurba (75056_PLU_20260616 → 2026-06-16)', () => {
        expect(parseParisPluResponse(bodyUG(25)).sourceVersion).toBe('2026-06-16');
    });

    it('a zone with no `libelle` is dropped (an identity needs a code) — never a blank zone', () => {
        const { zone } = parseParisPluResponse({ zone: { libelong: 'x' }, hauteur: { hauteur_m: 31 } });
        expect(zone).toBeNull();
    });

    it('the secteur-sauvegardé case: a zone but NO height sector → real zone + null height', () => {
        const { zone, heightCeiling_m } = parseParisPluResponse(bodyUG(null));
        expect(zone?.zoneCode).toBe('UG');
        expect(heightCeiling_m).toBeNull(); // honest withheld, not 0
    });

    it('a zero / negative / non-numeric height is WITHHELD (null), never coerced to 0', () => {
        expect(parseParisPluResponse({ hauteur: { hauteur_m: 0 } }).heightCeiling_m).toBeNull();
        expect(parseParisPluResponse({ hauteur: { hauteur_m: -5 } }).heightCeiling_m).toBeNull();
        expect(parseParisPluResponse({ hauteur: { hauteur_m: 'n/a' } }).heightCeiling_m).toBeNull();
    });

    it('a comma-decimal height string parses (French locale tolerance)', () => {
        expect(parseParisPluResponse({ hauteur: { hauteur_m: '18,5' } }).heightCeiling_m).toBe(18.5);
    });

    it('both halves absent → zone null + height null (caller refuses no-plu-here)', () => {
        const { zone, heightCeiling_m } = parseParisPluResponse({ zone: null, hauteur: null });
        expect(zone).toBeNull();
        expect(heightCeiling_m).toBeNull();
        const empty = parseParisPluResponse(null);
        expect(empty.zone).toBeNull();
        expect(empty.heightCeiling_m).toBeNull();
        expect(empty.hmc_m).toBeNull();
        expect(empty.filetCode).toBeNull();
        expect(empty.sourceVersion).toBeNull();
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('parisFiletMetresForCode + parseParisSourceVersion — the pure helpers', () => {
    it('the full gabarit code→metres map (K7 V10 O12 P15 B18 N20 G23 L25, M/unknown → null)', () => {
        expect(PARIS_FILET_CODE_TO_METRES).toMatchObject({ K: 7, V: 10, O: 12, P: 15, B: 18, N: 20, G: 23, L: 25 });
        expect(parisFiletMetresForCode('k')).toBe(7); // case-insensitive
        expect(parisFiletMetresForCode('M')).toBeNull(); // same-as-façade, no fixed metres
        expect(parisFiletMetresForCode('Z')).toBeNull(); // unknown code
        expect(parisFiletMetresForCode(null)).toBeNull();
    });

    it('parseParisSourceVersion reads YYYYMMDD off the idurba, rejects garbage/impossible dates', () => {
        expect(parseParisSourceVersion('75056_PLU_20260616')).toBe('2026-06-16');
        expect(parseParisSourceVersion('75056_PLU_20241120')).toBe('2024-11-20');
        expect(parseParisSourceVersion('75056_PLU')).toBeNull();
        expect(parseParisSourceVersion('75056_PLU_20261340')).toBeNull(); // month 13 / day 40
        expect(parseParisSourceVersion(null)).toBeNull();
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('resolveParisPluZone — the impure seam (never throws)', () => {
    it('a Paris point + the FULL live body → ok carrying every structured fact', async () => {
        const res = await resolveParisPluZone(PARIS.lat, PARIS.lon, { fetchImpl: okFetch(bodyUGFull) });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.zone?.zoneCode).toBe('UG');
        expect(res.heightCeiling_m).toBe(25);
        expect(res.hauteurSource).toBe(PARIS_HAUTEUR_SOURCE);
        expect(res.hmc_m).toBeNull(); // no HMC overlay at the probe point
        expect(res.filetCode).toBe('N');
        expect(res.filetFrontageHeight_m).toBe(20);
        expect(res.sourceVersion).toBe('2026-06-16');
        // The deprecated alias mirrors the canonical field (kept for the L5 dispatcher).
        expect(res.hauteurPlafond_m).toBe(res.heightCeiling_m);
    });

    it('an HMC-covered point carries hmc_m + datum WITHOUT collapsing into heightCeiling', async () => {
        const res = await resolveParisPluZone(PARIS.lat, PARIS.lon, { fetchImpl: okFetch(bodyWithHmc) });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.heightCeiling_m).toBe(25);
        expect(res.hmc_m).toBe(85);
        expect(res.hmcDatum).toBe('NGF');
    });

    it('the secteur-sauvegardé point (zone, no height) still resolves ok with a null height', async () => {
        const res = await resolveParisPluZone(PARIS.lat, PARIS.lon, { fetchImpl: okFetch(bodyUG(null)) });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.zone?.zoneCode).toBe('UG');
        expect(res.heightCeiling_m).toBeNull();
    });

    it('a point OUTSIDE Paris → out-of-paris WITHOUT any fetch (jurisdiction guard)', async () => {
        let calls = 0;
        const counting = (async () => { calls++; return { ok: true, json: async () => bodyUG(25) }; }) as unknown as typeof fetch;
        const res = await resolveParisPluZone(48.8, 2.13, { fetchImpl: counting }); // Boulogne-Billancourt, outside bbox
        expect(res).toEqual({ ok: false, reason: 'out-of-paris' });
        expect(calls).toBe(0);
    });

    it('both-null body (proxy up, nothing published) → no-plu-here', async () => {
        const res = await resolveParisPluZone(PARIS.lat, PARIS.lon, { fetchImpl: okFetch({ zone: null, hauteur: null }) });
        expect(res).toEqual({ ok: false, reason: 'no-plu-here' });
    });

    it('an upstream non-OK / a throw → endpoint-unreachable, never throws', async () => {
        const bad = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
        await expect(resolveParisPluZone(PARIS.lat, PARIS.lon, { fetchImpl: bad }))
            .resolves.toEqual({ ok: false, reason: 'endpoint-unreachable' });
        const throwing = (async () => { throw new Error('gpu down'); }) as unknown as typeof fetch;
        await expect(resolveParisPluZone(PARIS.lat, PARIS.lon, { fetchImpl: throwing }))
            .resolves.toEqual({ ok: false, reason: 'endpoint-unreachable' });
    });

    it('sends the parcel point to the same-origin proxy path (never a gov endpoint)', async () => {
        let seen = '';
        const spy = (async (url: string) => { seen = url; return { ok: true, json: async () => bodyUG(37) }; }) as unknown as typeof fetch;
        await resolveParisPluZone(PARIS.lat, PARIS.lon, { fetchImpl: spy });
        expect(seen.startsWith(PARIS_PLU_PATH)).toBe(true);
        expect(seen).toContain('lat=48.857');
        expect(seen).toContain('lon=2.38');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('parseParisRing + the ECM/cour/EAL parse — real footprint geometry, honest nulls', () => {
    it('parseParisRing keeps clean [lon,lat] pairs (≥3), rejects short/garbage rings', () => {
        expect(parseParisRing(ECM_HALF.ring)?.length).toBe(4);
        expect(parseParisRing([[1, 2], [3, 4]])).toBeNull(); // < 3
        expect(parseParisRing([[1, 2], ['x', 4], [5, 6], [7, 8]])?.length).toBe(3); // drops the bad pair
        expect(parseParisRing(null)).toBeNull();
    });

    it('parseParisPluResponse lifts the cour crown code + the ECM footprint + the EAL strip', () => {
        const p = parseParisPluResponse({
            zone: { libelle: 'UG', idurba: '75056_PLU_20260616' },
            hauteur: { hauteur_m: 25 },
            filet: { code: 'N', cour: 'x' },
            ecm: ECM_HALF,
            eal: { ring: ECM_HALF.ring, areaM2: 6.6 },
        });
        expect(p.courCode).toBe('X'); // upper-cased
        expect(p.ecm?.ring.length).toBe(4);
        expect(p.ecm?.areaM2).toBe(83.12);
        expect(p.ecm?.emprisePct).toBeNull(); // 0/absent = not specified
        expect(p.ecm?.cadastral).toBe('19-DL-0002');
        expect(p.eal?.areaM2).toBe(6.6);
    });

    it('an ECM half with no valid ring → ecm null (no geometry, no footprint)', () => {
        const p = parseParisPluResponse({ zone: { libelle: 'UG' }, ecm: { ring: [[1, 2]], areaM2: 50 } });
        expect(p.ecm).toBeNull();
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('resolveParisEnvelope — the structured-envelope inputs seam (never throws)', () => {
    const fullBody: ParisPluProxyResponse = {
        zone: { libelle: 'UG', libelong: 'Zone urbaine générale', idurba: '75056_PLU_20260616' },
        hauteur: { hauteur_m: 25 },
        filet: { code: 'V', cour: 'C' },
        ecm: ECM_HALF,
    };
    it('a Paris point with an ECM footprint → ok carrying the structured envelope inputs', async () => {
        const res = await resolveParisEnvelope(PARIS.lat, PARIS.lon, { fetchImpl: okFetch(fullBody) });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.inputs.ecmGeometry?.length).toBe(4);
        expect(res.inputs.ecmAreaM2).toBe(83.12);
        expect(res.inputs.heightCeiling_m).toBe(25);
        expect(res.inputs.courCode).toBe('C');
        expect(res.inputs.sourceVersion).toBe('2026-06-16');
    });

    it('an ECM-only point (no zone, no height) still resolves ok — the footprint is worth carrying', async () => {
        const res = await resolveParisEnvelope(PARIS.lat, PARIS.lon, { fetchImpl: okFetch({ ecm: ECM_HALF }) });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.inputs.ecmGeometry?.length).toBe(4);
        expect(res.inputs.heightCeiling_m).toBeNull();
    });

    it('a point outside Paris → out-of-paris with no fetch; a bare empty body → no-plu-here', async () => {
        let calls = 0;
        const counting = (async () => { calls++; return { ok: true, json: async () => fullBody }; }) as unknown as typeof fetch;
        expect(await resolveParisEnvelope(45.764, 4.8357, { fetchImpl: counting })).toEqual({ ok: false, reason: 'out-of-paris' });
        expect(calls).toBe(0);
        const empty = await resolveParisEnvelope(PARIS.lat, PARIS.lon, { fetchImpl: okFetch({ zone: null, hauteur: null }) });
        expect(empty).toEqual({ ok: false, reason: 'no-plu-here' });
    });

    it('an upstream throw → endpoint-unreachable, never throws', async () => {
        const throwing = (async () => { throw new Error('gpu down'); }) as unknown as typeof fetch;
        await expect(resolveParisEnvelope(PARIS.lat, PARIS.lon, { fetchImpl: throwing }))
            .resolves.toEqual({ ok: false, reason: 'endpoint-unreachable' });
    });
});

describe('isInParis — the proximity gate', () => {
    it('Paris in, elsewhere out', () => {
        expect(isInParis(48.8566, 2.3522)).toBe(true); // Île de la Cité
        expect(isInParis(48.857, 2.38)).toBe(true); // 11th
        expect(isInParis(45.764, 4.8357)).toBe(false); // Lyon
        expect(isInParis(41.3874, 2.1686)).toBe(false); // Barcelona
        expect(isInParis(NaN, NaN)).toBe(false);
    });
});
