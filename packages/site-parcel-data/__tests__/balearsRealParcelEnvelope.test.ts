// ⭐ THE DEFINITION OF DONE: **ONE REAL BALEARS PARCEL PRODUCES A DRAWN ENVELOPE WITH PROVENANCE.**
//
// Not a percentage. A parcel:
//
//   referencia catastral   7704702ED1870S — PZ DE L'EBENISTA 8, MANACOR (ILLES BALEARS)
//   official area          297 m² (Catastro INSPIRE `cp:areaValue`, the registry's own figure)
//   zone                   MUIB `RE_NA` / municipal `RE-NA`, "Nucli antic RE-NA"
//   governing plan         2021_PG_MANACOR_033, in force from 22/12/2021, no end date
//   fitxa                  muib.caib.es/mapurbibfront/normativa.jsp?identitat=292430
//   parameters             NP 3 plantes · O 80 % · E 2.4 · PM 200 m² · AM 7 m · IRP 120 m²/hab
//   articles               Article 66 (on NP) · Article 56.3.j (on O)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// EVERY INPUT IS REAL, AND TWO INDEPENDENT SOURCES CROSS-CHECK EACH OTHER
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The ring comes from the Spanish Catastro; the zoning comes from the Govern de les Illes Balears.
// Neither knows about the other. ⭐ SO THE PROJECTION IS ITS OWN CONTROL: the ring is in WGS84 and
// the engine works in scene-XZ metres, and the projected polygon's area must reproduce CATASTRO'S
// OWN REGISTERED AREA. It does, to 0.2 % — which is what licenses every metric assertion below.
// Without that check a wrong projection would silently scale every area and volume in the result.
//
// ⚠ THE PROJECTION IS DONE HERE, IN THE TEST, DELIBERATELY. It is not Balears-specific and does not
// belong in a Balears adapter; in production the caller hands the engine an already-projected ring
// (C58 §1.9 — the engine is pure and has no idea where geometry came from).

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ParcelEdgeClassification, Pt, ZoningRecord } from '@pryzm/schemas';
import { requiresBlockRing } from '@pryzm/schemas';
import { computeBuildableEnvelope } from '../src/ZoningRulesEngine.js';
import { resolveBalearsMuib } from '../src/providers/resolveBalearsMuib.js';
import {
    balearsResolvedPack,
    balearsGeometricRule,
    balearsMaxCoverage,
    balearsPlotRatioFAR,
    balearsMaxFloors,
    balearsMaxHeightM,
    balearsSetbacks,
    BALEARS_JURISDICTION_ID,
    BALEARS_OPEN_TOP_REASONS,
    BALEARS_ENVELOPE_VERIFIED,
} from '../src/rulepacks/esBalearsMuib.js';
import { envelopePublicationAuthorisation } from '../src/rulepacks/envelopeAuthorisation.js';
import {
    envelopePublicationPosture,
    mayPublishAsDetermination,
    mayDrawEnvelope,
    OPEN_TOP_INDICATIVE_JURISDICTIONS,
} from '../src/rulepacks/openTopIndicative.js';
import { resolveRegisteredJurisdictionAt } from '../src/rulepacks/registry.js';

const HERE = dirname(fileURLToPath(import.meta.url));

const FIXTURE = JSON.parse(
    readFileSync(resolve(HERE, 'fixtures', 'balears-manacor-7704702ED1870S.json'), 'utf8'),
) as {
    refcat: string;
    officialAreaM2: number;
    ringLonLat: [number, number][];
    queryPoint: { lat: number; lon: number };
    muibAttributes: Record<string, unknown>;
};

function fitxaHtml(): string {
    const rel = 'tools/balears-muib-probe/out/p-test-292430.html';
    const candidates = [resolve(HERE, '..', '..', '..', rel)];
    const m = HERE.replace(/\\/g, '/').match(/^(.*)\/\.claude\/worktrees\/[^/]+\//);
    if (m) candidates.push(resolve(m[1] as string, rel));
    for (const c of candidates) if (existsSync(c)) return readFileSync(c, 'utf8');
    throw new Error('BALEARS fitxa fixture missing — the DoD test cannot run on nothing.');
}

/**
 * Local equirectangular projection about the ring's own centroid, using the standard WGS84
 * metres-per-degree series. Sound at parcel scale (tens of metres), and the area cross-check below
 * is what PROVES it here rather than asserting it.
 */
function projectToSceneXZ(ringLonLat: readonly (readonly [number, number])[]): Pt[] {
    let r = [...ringLonLat];
    const f = r[0] as [number, number];
    const l = r[r.length - 1] as [number, number];
    if (f[0] === l[0] && f[1] === l[1]) r = r.slice(0, -1); // drop the closing repeat
    const lat0 = r.reduce((s, p) => s + p[1], 0) / r.length;
    const lon0 = r.reduce((s, p) => s + p[0], 0) / r.length;
    const phi = (lat0 * Math.PI) / 180;
    const mLat = 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);
    const mLon = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);
    return r.map(([lon, lat]) => ({ x: (lon - lon0) * mLon, z: (lat - lat0) * mLat }));
}

function shoelaceArea(ring: readonly Pt[]): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i] as Pt;
        const q = ring[(i + 1) % ring.length] as Pt;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a / 2);
}

const PARCEL_RING = projectToSceneXZ(FIXTURE.ringLonLat);
const EDGES: ParcelEdgeClassification[] = PARCEL_RING.map(() => 'unclassified');
const HTML = fitxaHtml();

const proxyBody = {
    qualificacions: [{ attributes: FIXTURE.muibAttributes }],
    fitxa: { identitat: 292430, url: FIXTURE.muibAttributes['URL'], html: HTML },
};
const fakeFetch = (async () =>
    ({ ok: true, status: 200, json: async () => proxyBody }) as unknown as Response) as unknown as typeof fetch;

describe('§BALEARS-PROJECTION-CONTROL — the ring is real, and Catastro checks our arithmetic', () => {
    it('the projected parcel reproduces Catastro’s OWN registered area to better than 1 %', () => {
        const area = shoelaceArea(PARCEL_RING);
        expect(area).toBeGreaterThan(0);
        const errorPct = Math.abs(area - FIXTURE.officialAreaM2) / FIXTURE.officialAreaM2;
        expect(errorPct).toBeLessThan(0.01);
    });

    it('the ring is a real 23-vertex cadastral polygon, not a synthetic rectangle', () => {
        expect(PARCEL_RING.length).toBeGreaterThan(10);
        expect(FIXTURE.refcat).toBe('7704702ED1870S');
    });
});

describe('§BALEARS-DOD — parcel 7704702ED1870S → A DRAWN ENVELOPE WITH PROVENANCE', () => {
    it('⭐ THE WHOLE CHAIN: point → MUIB zone → fitxa → pack → a solved, non-empty envelope', async () => {
        const r = await resolveBalearsMuib(FIXTURE.queryPoint, {
            fetchImpl: fakeFetch,
            asOf: '2026-08-02',
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;

        const pack = balearsResolvedPack(r.record);
        const zone = pack.zones[0];
        expect(zone).toBeDefined();
        if (!zone) return;

        const zoning: ZoningRecord = {
            zoneCode: zone.code,
            zoneLabel: zone.label,
            jurisdictionId: BALEARS_JURISDICTION_ID,
            structuredFields: {},
            overlays: [],
            ordinanceRef: zone.ordinanceRef,
            provenance: {
                source: BALEARS_JURISDICTION_ID,
                label: 'GOIB MUIB (live)',
                version: r.record.feature.CODIPLA ?? 'n/a',
                license: null,
                crs: 'EPSG:4326',
            },
        };

        const env = computeBuildableEnvelope({
            parcelRing: PARCEL_RING,
            edgeClassifications: EDGES,
            zoning,
            rulePack: pack,
        });

        // ── ⭐ IT DRAWS. ────────────────────────────────────────────────────────────────────
        expect(env.status).toBe('ok');
        expect(env.insetPolygon.length).toBeGreaterThanOrEqual(3);
        expect(env.insetAreaM2).toBeGreaterThan(0);

        // ── THE NUMBERS ARE THE FITXA'S, UNALTERED. ─────────────────────────────────────────
        expect(env.maxFloors).toBe(3); // NP 3 plantes
        expect(env.maxCoverage).toBeCloseTo(0.8, 6); // O 80 %
        expect(env.maxFAR).toBeCloseTo(2.4, 6); // E 2.4
        // ⛔ NO METRIC HEIGHT IS INVENTED FROM THE STOREY COUNT. This fitxa prints no HR/HT.
        expect(env.maxHeight_m).toBeNull();

        // ── PROVENANCE. ────────────────────────────────────────────────────────────────────
        // ⚠ `BuildableEnvelope` carries NO top-level `ordinanceRef` BY DESIGN: a citation belongs
        // to a CONSTRAINT, not to a solid, so C58 §1.3 puts it on every `derivation` row. Asserting
        // it there is asserting the thing the compliance report actually reads.
        expect(env.confidence).toBe('estimated-ruleset');
        expect(env.zoneCode).toBe('RE_NA');
        const constraints = env.derivation.map((d) => d.constraint);
        expect(constraints).toEqual(expect.arrayContaining(['maxFAR', 'maxCoverage']));
        expect(env.derivation.length).toBeGreaterThan(0);
        for (const d of env.derivation) {
            expect(d.zoneCode).toBe('RE_NA');
            expect(d.source).toBe(BALEARS_JURISDICTION_ID);
            // The citation names the ARTICLES, the FITXA and the GOVERNING PLAN — all three, so a
            // reader can dereference every one of them.
            expect(d.ordinanceRef).toContain('Article 66');
            expect(d.ordinanceRef).toContain('Article 56.3.j');
            expect(d.ordinanceRef).toContain('identitat=292430');
            expect(d.ordinanceRef).toContain('2021_PG_MANACOR_033');
            // ⚠ Read from the publisher's own table, not estimated by PRYZM.
            expect(d.fieldProvenance).toBe('ordinance-pdf');
        }

        // ── ⛔ AND IT IS HONEST ABOUT ITS FOOTPRINT. ────────────────────────────────────────
        // `RE_NA` publishes NO *Reculada*, so the ring is the whole parcel ONLY because the
        // setbacks are UNKNOWN — not because full coverage was granted. The engine's §L-619 guard
        // must say so, and the renderer greys it on the strength of exactly this flag.
        expect(env.footprintIsUpperBound).toBe(true);
        expect(env.caveats.join(' ')).toMatch(/UPPER BOUND/i);
        expect(env.insetAreaM2).toBeCloseTo(shoelaceArea(PARCEL_RING), 2);
    });

    it('⛔ the pack transcribes ABSENT setbacks as null — NEVER as zero (L-616)', async () => {
        const r = await resolveBalearsMuib(FIXTURE.queryPoint, { fetchImpl: fakeFetch, asOf: '2026-08-02' });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const s = balearsSetbacks(r.record.parameters);
        expect(s).toEqual({ front_m: null, side_m: null, rear_m: null });
        expect(balearsResolvedPack(r.record).zones[0]?.setbacks).toEqual({
            front_m: null,
            side_m: null,
            rear_m: null,
        });
    });

    it('⭐ NO BALEARS RULE NEEDS A BLOCK RING — `requiresBlockRing` is false for every kind emitted', async () => {
        const r = await resolveBalearsMuib(FIXTURE.queryPoint, { fetchImpl: fakeFetch, asOf: '2026-08-02' });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        // This zone: no *Reculada* ⇒ no shaping rule at all (the legacy inset, honestly flagged).
        expect(balearsGeometricRule(r.record.parameters)).toBeNull();

        // And a zone that DOES publish *Reculades* takes the plain `setback` kind — the engine
        // §L-591 already has. ⛔ No new geometry engine is written for the Balears.
        const withSetbacks = {
            RA: { status: 'PRESENT', verdict: 'VALID', kind: 'METRES', value: 5 },
            RM: { status: 'PRESENT', verdict: 'VALID', kind: 'METRES', value: 3 },
            RF: { status: 'PRESENT', verdict: 'VALID', kind: 'METRES', value: 4 },
        } as const;
        const rule = balearsGeometricRule(withSetbacks as never);
        expect(rule).toEqual({ kind: 'setback', front_m: 5, side_m: 3, rear_m: 4 });
        expect(requiresBlockRing(rule!)).toBe(false);
    });

    it('a setback rule really does erode the parcel — the envelope is SMALLER than the plot', () => {
        const rule = balearsGeometricRule({
            RA: { status: 'PRESENT', verdict: 'VALID', kind: 'METRES', value: 3 },
            RM: { status: 'PRESENT', verdict: 'VALID', kind: 'METRES', value: 2 },
            RF: { status: 'PRESENT', verdict: 'VALID', kind: 'METRES', value: 2 },
        } as never);
        const env = computeBuildableEnvelope({
            parcelRing: PARCEL_RING,
            edgeClassifications: EDGES,
            zoning: {
                zoneCode: 'TEST',
                zoneLabel: 'test',
                jurisdictionId: BALEARS_JURISDICTION_ID,
                structuredFields: {
                    setbacks: { front_m: 3, side_m: 2, rear_m: 2 },
                    maxFloors: 3,
                },
                overlays: [],
                ordinanceRef: null,
                provenance: {
                    source: BALEARS_JURISDICTION_ID, label: 'test', version: '1',
                    license: null, crs: 'EPSG:4326',
                },
            },
            rulePack: null,
            geometricRule: rule,
        });
        expect(env.status).toBe('ok');
        expect(env.insetAreaM2).toBeLessThan(shoelaceArea(PARCEL_RING));
        // ⚠ Real setbacks ⇒ the footprint is SOLVED, not an upper bound.
        expect(env.footprintIsUpperBound).toBe(false);
    });

    it('the parameter mappers read the UNIT, so a m² occupation never becomes a coverage ratio', async () => {
        const r = await resolveBalearsMuib(FIXTURE.queryPoint, { fetchImpl: fakeFetch, asOf: '2026-08-02' });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const P = r.record.parameters;
        expect(balearsMaxCoverage(P)).toBeCloseTo(0.8, 6);
        expect(balearsPlotRatioFAR(P)).toBeCloseTo(2.4, 6);
        expect(balearsMaxFloors(P)).toBe(3);
        expect(balearsMaxHeightM(P)).toBeNull();
    });
});

describe('§BALEARS-NOT-AUTHORISED — the route exists; permission does NOT', () => {
    // ⚠⚠ THIS ASSERTION CHANGED WITH §REGISTRATION-APPLIED (L-680), AND THE CHANGE IS THE POINT.
    // It used to read `expect(a.reason).toBe('unknown-jurisdiction')` — correct while Balears was
    // in NEITHER authorisation table. The registration commit put it in `ENVELOPE_PUBLICATION_GATES`
    // with `BALEARS_ENVELOPE_VERIFIED = false`, so the reason is now `gate-shut`.
    //
    // ⭐ THE TWO REASONS ARE NOT INTERCHANGEABLE AND SWAPPING THEM IS THE WHOLE DELIVERABLE:
    //   `unknown-jurisdiction` = "nobody has ever assessed this place."   ← was FALSE of Balears
    //   `gate-shut`            = "a human has not signed the reading."    ← is TRUE of Balears
    // Both refuse; only one is true. Loosening this to `expect(a.authorised).toBe(false)` alone
    // would let a future edit silently drop Balears out of both tables and still pass.
    it('⛔ Balears is REGISTERED, GATED and SHUT — it refuses, and it refuses for the TRUE reason', () => {
        const a = envelopePublicationAuthorisation(BALEARS_JURISDICTION_ID);
        expect(a.authorised).toBe(false);
        expect(a.reason).toBe('gate-shut');
        expect(a.reason).not.toBe('unknown-jurisdiction');
        // ⛔ THE GATE CONSTANT ITSELF. A test that only read the projection would pass if someone
        // signed the gate and forgot everything else; this pins the legal act at its declaration.
        expect(BALEARS_ENVELOPE_VERIFIED).toBe(false);
    });

    // ⛔ THE SECOND DOOR — NOW OPEN, ON PURPOSE, AND ONLY THIS FAR. `openTopIndicative.ts` can DRAW
    // without a determination; the renderer capability closed first (`rendererCanExpressOpenTop`,
    // measured, an indicative solid can no longer render identically to a determined one — ADR-0293's
    // prohibition), and the founder listed Balears on 2026-08-03. The determination gate below this
    // test is untouched: Balears DRAWS, and still asserts no buildable right.
    it('⭐ Balears is listed as open-top indicative — posture is `draw`, never `determination`', () => {
        expect(OPEN_TOP_INDICATIVE_JURISDICTIONS.has(BALEARS_JURISDICTION_ID)).toBe(true);
        const p = envelopePublicationPosture(BALEARS_JURISDICTION_ID);
        expect(p.posture).toBe('open-top-indicative');
        // The UNDERLYING reason survives the refinement — that is the composition guarantee.
        expect(p.authorisationReason).toBe('gate-shut');
        expect(mayPublishAsDetermination(BALEARS_JURISDICTION_ID)).toBe(false);
        expect(mayDrawEnvelope(BALEARS_JURISDICTION_ID)).toBe(true);
    });

    // §BALEARS-REGISTRATION — the estimated-triple hole this registration exists to close (§L-663).
    // ⚠ Asserted through the REGISTRY's own resolver, not through a literal, because the registry is
    // what `siteDispatch.ts`'s chokepoint asks: a Manacor point that resolved to `'none'` would let
    // `applyEstimatedZoning` publish 3,0/1,5/3,0 m · FAR 2,00 · 50 % on land PRYZM has read no
    // article about — which is exactly what happened here before this commit.
    it('§L-663 — a real Manacor point RESOLVES to the Balears jurisdiction, so no estimate can escape', () => {
        const claim = resolveRegisteredJurisdictionAt(
            FIXTURE.queryPoint.lat,
            FIXTURE.queryPoint.lon,
        );
        expect(claim.kind).toBe('resolved');
        if (claim.kind !== 'resolved') return;
        expect(claim.jurisdiction.jurisdictionId).toBe(BALEARS_JURISDICTION_ID);
        // ⚠ `'regional'` — the box is the whole autonomous community, so a future Palma or Eivissa
        // registration at `'municipal'` out-ranks it automatically (§JURISDICTION-SPECIFICITY).
        expect(claim.jurisdiction.extentResolution).toBe('regional');
        // EMPTY BY CONSTRUCTION — the pack is live-resolved per parcel, never a static table.
        expect(claim.jurisdiction.packZoneCodes.length).toBe(0);
    });

    it('ADR-0293 — the open-top reasons are non-empty wherever the pack is used', () => {
        expect(BALEARS_OPEN_TOP_REASONS.length).toBeGreaterThan(0);
    });

    // ── L-664 §ENVELOPE-CONFIDENCE-LADDER — THE TIER PIN. ────────────────────────────────────────
    // `packPublishedConfidenceUnchanged.test.ts` asserts its frozen manifest is TOTAL over every
    // `src/rulepacks/*.ts` file declaring a `defaultConfidence`, and names this file in its
    // `FUNCTION_BUILT` exception set — because the Balears pack is built PER PARCEL, from a live
    // source, so there is no module constant for that manifest to pin. ⚠ THE EXCEPTION IS ONLY
    // HONEST IF THE TIER IS PINNED SOMEWHERE, and this is that somewhere.
    it('§CONFIDENCE-PIN — the resolved pack ships `estimated-ruleset`, and cannot self-certify', async () => {
        const r = await resolveBalearsMuib(FIXTURE.queryPoint, { fetchImpl: fakeFetch, asOf: '2026-08-02' });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const pack = balearsResolvedPack(r.record);
        expect(pack.defaultConfidence).toBe('estimated-ruleset');
        // ⛔ `authoritative` and `block-constructed` are ENGINE/authority-assigned, never a pack seed
        // (C58 §1.2 / L-572). A pack certifying its own numbers is what the gates exist to prevent.
        expect(pack.defaultConfidence).not.toBe('authoritative');
        expect(pack.defaultConfidence).not.toBe('block-constructed');
        // ⚠ AND NOT `structured` EITHER, though every number here is machine-read from a published
        // table. `structured` claims the authority published the DETERMINATION as data; MUIB
        // publishes a fitxa, and only 2.0 % of fitxes cite the governing article on the parameter.
        expect(pack.defaultConfidence).not.toBe('structured');
    });
});
