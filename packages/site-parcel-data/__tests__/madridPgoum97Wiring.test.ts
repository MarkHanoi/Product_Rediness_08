// §MADRID-PGOUM97-WIRING — Madrid (INE 28079): is the transcribed ordinance REACHABLE, and does
// every zone family come back with the answer its own law requires?
//
// Not "does the pack parse?" — `esMadridPgoum97Pack.test.ts` proves that, and it proved it while no
// line of the pack could be reached from a click. This file walks the chain a real click walks,
// minus the two ends that are not L2:
//
//   isInMadrid (S2 routing gate)
//     → resolveMadridNormaZonal (S3, the live NORMAS_ZONALES code — fetch INJECTED here)
//       → resolveZoneDisposition (S5, the registry the dispatcher and the coverage globe share)
//         → the refusal / pack the disposition names
//
// The L5 half — a real `dispatchParcelBoundary` on a real `SiteModelStore` at a real Madrid parcel —
// is proven in `apps/editor/__tests__/madridSiteDispatch.test.ts`, which drives this same resolver
// through the editor's dispatcher.
//
// ⚠ THE LOAD-BEARING ASSERTION IN THIS FILE IS THAT **NO NUMBER SHIPS**. `MADRID_ENVELOPE_VERIFIED`
// is `false`; every value in the pack was machine-extracted from the Compendio 2025 and no human has
// signed the transcription. A test that only checked "the pack is registered" would go green on
// exactly the failure this gate exists to prevent.

import { describe, expect, it, vi } from 'vitest';
import { isInMadrid, MADRID_BBOX } from '../src/providers/madridBbox.js';
import {
    resolveMadridNormaZonal,
    readMadridZoneFeature,
    MADRID_NORMAS_ZONALES_PATH,
    MADRID_ZONE_CODE_FIELD,
} from '../src/providers/resolveMadridNormaZonal.js';
import {
    MADRID_JURISDICTION_ID,
    MADRID_NZ1_ZONE_CODES,
    MADRID_NZ1_CODE_PREFIX,
} from '../src/rulepacks/esMadridNZ1.js';
import {
    ES_MADRID_PGOUM97_PACK,
    MADRID_PGOUM97_ZONE_CODES,
    MADRID_NZ3_ZONE_CODES,
    MADRID_ENVELOPE_VERIFIED,
    MADRID_PGOUM97_DEFAULT_CONFIDENCE,
    madridPgoum97UnverifiedRefusal,
    madridUnknownZoneRefusal,
} from '../src/rulepacks/esMadridPgoum97.js';
import { resolveZoneDisposition, listJurisdictionCoverage } from '../src/rulepacks/registry.js';
import { buildRefusedEnvelope, isRefusedEnvelope } from '../src/rulepacks/zoneRefusal.js';
// §THE-ORDERING-PIN (L-665) — the two preconditions on signing MADRID_ENVELOPE_VERIFIED.
import { computeBuildableEnvelope } from '../src/ZoningRulesEngine.js';
import { classifyAnswerability } from '../src/rulepacks/answerabilityClass.js';

/** Puerta del Sol — unambiguously inside the Madrid municipal term. */
const MADRID_POINT = { lat: 40.41678, lon: -3.70379 } as const;

/** One Esri feature from `NORMAS_ZONALES/MapServer/0`, in the shape the proxy returns. */
function feature(code: string, denom: string | null = null) {
    return {
        attributes: {
            [MADRID_ZONE_CODE_FIELD]: code,
            ...(denom === null ? {} : { AMB_TX_DENOM: denom }),
        },
    };
}

/** Stub the same-origin proxy. Any other URL rejects — a unit test may reach no network. */
function stubProxy(body: unknown, ok = true) {
    return vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (!url.startsWith(MADRID_NORMAS_ZONALES_PATH)) {
            throw new TypeError(`unstubbed URL in unit test: ${url}`);
        }
        return { ok, status: ok ? 200 : 502, json: async () => body } as unknown as Response;
    }) as unknown as typeof fetch;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('§MADRID-PGOUM97 — S3: the live Norma-Zonal resolver', () => {
    it('resolves the zone code VERBATIM from AMB_TX_ETIQ — the live 34-code vocabulary', async () => {
        const res = await resolveMadridNormaZonal(MADRID_POINT, {
            fetchImpl: stubProxy({ features: [feature('8.2.b', 'Vivienda unifamiliar')] }),
        });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        // ⚠ VERBATIM. `8.2.b` is a grado+nivel, not a zone number: normalising it to `8` would
        // collapse ten different ordinance rows onto one.
        expect(res.zoneCode).toBe('8.2.b');
        expect(res.zoneLabel).toBe('Vivienda unifamiliar');
    });

    it('sends the parcel point to the SAME-ORIGIN proxy, never to sigma.madrid.es', async () => {
        const fetchImpl = stubProxy({ features: [feature('4')] });
        await resolveMadridNormaZonal(MADRID_POINT, { fetchImpl });
        const url = String((fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0]);
        expect(url.startsWith(MADRID_NORMAS_ZONALES_PATH)).toBe(true);
        expect(url).not.toContain('sigma.madrid.es'); // C57 — CSP `connect-src 'self'`
        const q = new URLSearchParams(url.split('?')[1]!);
        expect(Number(q.get('lat'))).toBeCloseTo(MADRID_POINT.lat, 5);
        expect(Number(q.get('lon'))).toBeCloseTo(MADRID_POINT.lon, 5);
    });

    it('§CONTEXT-DATA-HONESTY — an OUTAGE and a genuine EMPTY are different answers', async () => {
        // The proxy answered 502: the municipal service did not answer. TRANSIENT.
        const down = await resolveMadridNormaZonal(MADRID_POINT, {
            fetchImpl: stubProxy({ error: 'upstream' }, false),
        });
        expect(down.ok).toBe(false);
        if (!down.ok) expect(down.reason).toBe('endpoint-unreachable');

        // The proxy answered 200 with zero features: the layer publishes no Norma Zonal here. A REAL
        // negative — and evidence for the open zones-2/6/10/11 question, never an outage.
        const empty = await resolveMadridNormaZonal(MADRID_POINT, {
            fetchImpl: stubProxy({ features: [] }),
        });
        expect(empty.ok).toBe(false);
        if (!empty.ok) expect(empty.reason).toBe('no-feature');
    });

    it('REFUSES a boundary rather than picking features[0] — a zone by array order is a coin flip', async () => {
        const res = await resolveMadridNormaZonal(MADRID_POINT, {
            fetchImpl: stubProxy({ features: [feature('8.4'), feature('5.2')] }),
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('ambiguous-zone');
        // …but identical duplicates are NOT ambiguous.
        const dup = await resolveMadridNormaZonal(MADRID_POINT, {
            fetchImpl: stubProxy({ features: [feature('8.4'), feature('8.4')] }),
        });
        expect(dup.ok).toBe(true);
    });

    it('never leaves Madrid, and never invents a label it was not given', async () => {
        // A point outside the municipal box is not queried at all.
        const away = await resolveMadridNormaZonal({ lat: 41.3874, lon: 2.1686 }, {
            fetchImpl: stubProxy({ features: [feature('4')] }),
        });
        expect(away.ok).toBe(false);
        if (!away.ok) expect(away.reason).toBe('out-of-madrid');
        expect(isInMadrid(MADRID_POINT.lat, MADRID_POINT.lon)).toBe(true);
        expect(MADRID_BBOX.minLat).toBeLessThan(MADRID_POINT.lat);

        // `AMB_TX_DENOM` is probe P1 — ASSERTED, never run. An absent label stays absent.
        const noLabel = await resolveMadridNormaZonal(MADRID_POINT, {
            fetchImpl: stubProxy({ features: [feature('7.1.a')] }),
        });
        expect(noLabel.ok).toBe(true);
        if (noLabel.ok) expect(noLabel.zoneLabel).toBeNull();

        // A feature with no readable routing code is `unparsable-response`, not "nothing here".
        expect(readMadridZoneFeature({ attributes: { SOMETHING_ELSE: 'x' } })).toBeNull();
        const junk = await resolveMadridNormaZonal(MADRID_POINT, {
            fetchImpl: stubProxy({ features: [{ attributes: { SOMETHING_ELSE: 'x' } }] }),
        });
        expect(junk.ok).toBe(false);
        if (!junk.ok) expect(junk.reason).toBe('unparsable-response');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('§MADRID-PGOUM97 — S5: the registry routes all 34 live codes, three ways', () => {
    it('the 23 transcribed codes resolve to the PGOUM-97 PACK — the link that was missing', () => {
        for (const code of MADRID_PGOUM97_ZONE_CODES) {
            const d = resolveZoneDisposition(MADRID_JURISDICTION_ID, code);
            expect(d.kind, code).toBe('pack');
            if (d.kind !== 'pack') continue;
            expect(d.pack).toBe(ES_MADRID_PGOUM97_PACK);
            expect(d.pack.zones.some((z) => z.code === code), code).toBe(true);
        }
    });

    it('NZ 3 resolves to the LEGALLY GROUNDED derived-plan refusal (Art. 8.3.1)', () => {
        for (const code of MADRID_NZ3_ZONE_CODES) {
            const d = resolveZoneDisposition(MADRID_JURISDICTION_ID, code);
            expect(d.kind, code).toBe('refusal');
            if (d.kind !== 'refusal') continue;
            // The ordinance ANSWERED: the aprovechamiento is already exhausted. `legallyGrounded`
            // is what separates "the law says no" from "we have no data" — the whole point of the
            // three-outcome registry.
            expect(d.refusal.code).toBe('derived-plan');
            expect(d.refusal.legallyGrounded).toBe(true);
            expect(d.refusal.ordinanceRef).toContain('8.3.1');
        }
    });

    it('NZ 1 keeps its SETTLED explicit-area answer and never enters packsByZone', () => {
        for (const code of MADRID_NZ1_ZONE_CODES) {
            expect((MADRID_PGOUM97_ZONE_CODES as readonly string[]).includes(code), code).toBe(false);
            expect(code.startsWith(MADRID_NZ1_CODE_PREFIX)).toBe(true);
            const d = resolveZoneDisposition(MADRID_JURISDICTION_ID, code);
            expect(d.kind, code).toBe('refusal');
            if (d.kind !== 'refusal') continue;
            // ⚠ NZ 1's footprint is PUBLISHED AS GEOMETRY and resolved live per manzana by the L5
            // dispatcher. The registry's answer is the coverage statement, not the envelope.
            expect(d.refusal.code).toBe('source-data-unavailable');
            expect(d.refusal.detail).toContain('Fondo de la');
        }
    });

    it('a zone code in NONE of the three families gets the COVERAGE GAP, not a borrowed NZ 1 citation', () => {
        // Normas Zonales 2/6/10/11 are absent from `AMB_TX_ETIQ` for undetermined reasons
        // (SOURCES.md §0.3, candidate (c) = parcels that route nowhere). If one surfaces, it must
        // NOT be told about NZ 1's Fondo de la Edificación — that is land it is not on.
        const d = resolveZoneDisposition(MADRID_JURISDICTION_ID, '2.1', { zoneLabel: 'Norma Zonal 2' });
        expect(d.kind).toBe('refusal');
        if (d.kind !== 'refusal') return;
        expect(d.refusal.code).toBe('no-rule-pack');
        expect(d.refusal.legallyGrounded).toBe(false); // a PRYZM coverage gap, never the ordinance
        expect(d.refusal.detail).not.toContain('Fondo de la');
        expect(d.refusal.headline).toContain('Norma Zonal 2');
    });

    it('all 34 live codes are accounted for — 23 + 6 + 5, with no overlap', () => {
        const all = [
            ...MADRID_PGOUM97_ZONE_CODES,
            ...MADRID_NZ1_ZONE_CODES,
            ...MADRID_NZ3_ZONE_CODES,
        ];
        expect(all).toHaveLength(34); // VERIFICATION.md V5 — VERIFIED-LIVE 2026-07-24
        expect(new Set(all).size).toBe(34); // `packMap()` would throw on a duplicate; assert it too
    });

    it('lights the C60 coverage globe with the 23 packed codes', () => {
        const madrid = listJurisdictionCoverage().find((j) => j.jurisdictionId === MADRID_JURISDICTION_ID);
        expect(madrid).toBeDefined();
        expect(madrid!.packZoneCodes.sort()).toEqual([...MADRID_PGOUM97_ZONE_CODES].sort());
        // ⚠ The summary must SAY that no figure is published, or the globe over-promises.
        expect(madrid!.answerSummary).toMatch(/MACHINE-EXTRACTED/i);
        expect(madrid!.answerSummary).toMatch(/NO buildable figure/i);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('§MADRID-PGOUM97 — THE HONESTY GATE: registration is not authorisation', () => {
    it('MADRID_ENVELOPE_VERIFIED is FALSE — and the pack says so about itself', () => {
        // If this ever flips without a signature in sources/VERIFICATION.md §3, that is the bug.
        expect(MADRID_ENVELOPE_VERIFIED).toBe(false);
        expect(ES_MADRID_PGOUM97_PACK.defaultConfidence).toBe('pipeline-extracted-unverified');
        expect(MADRID_PGOUM97_DEFAULT_CONFIDENCE).toBe('pipeline-extracted-unverified');
    });

    it('the gated refusal names OUR process, never a silence in the ordinance', () => {
        const r = madridPgoum97UnverifiedRefusal('8.2.b', ['Parcel area: 480 m²']);
        // `source-data-unavailable` + `legallyGrounded: false`: the LAW is known and transcribed;
        // what is missing is a human signature on our transcription. Calling this `derived-plan`
        // (or `legallyGrounded: true`) would blame Madrid for PRYZM's unfinished verification.
        expect(r.code).toBe('source-data-unavailable');
        expect(r.legallyGrounded).toBe(false);
        expect(r.detail).toMatch(/not.*been checked line by line by a\s*human/i);
        expect(r.knownFacts).toContain('Parcel area: 480 m²');
        // …and it renders as an envelope carrying NO number at all.
        const env = buildRefusedEnvelope('8.2.b', r, 'none');
        expect(isRefusedEnvelope(env)).toBe(true);
        expect(env.status).toBe('none');
        expect(env.maxHeight_m).toBeNull();
        expect(env.maxFAR).toBeNull();
        expect(env.maxCoverage).toBeNull();
        expect(env.insetPolygon).toEqual([]);
        expect(env.confidence).toBe('not-determined');
    });

    it('the coverage-gap refusal quotes no other zone\'s figures', () => {
        const r = madridUnknownZoneRefusal('6.1', null, []);
        expect(r.code).toBe('no-rule-pack');
        // No metre, no ratio, no percentage may appear in a card for a zone we have not read.
        expect(`${r.headline} ${r.detail}`).not.toMatch(/\d+(?:[.,]\d+)?\s*(?:m²\/m²|m\b|%)/);
    });

    // ═══════════════════════════════════════════════════════════════════════════════════════════
    // §THE-ORDERING-PIN — the precondition on signing MADRID_ENVELOPE_VERIFIED.
    //
    // HISTORY. This block previously held a single assertion (`MADRID_ENVELOPE_VERIFIED === false`)
    // standing in for a DIAGNOSED-BUT-UNFIXED defect: `ZoningRulesEngine` hard-coded
    // `let confidence: EnvelopeConfidence = 'estimated-ruleset'` and never read
    // `rulePack.defaultConfidence`, so Madrid's `pipeline-extracted-unverified` tier — the whole
    // reason the red machine-extracted chip exists in the renderer — could not reach an envelope.
    // Flipping the gate ALONE would have published a machine reading under the violet "Estimated"
    // chip. The pin said: those two changes must land together.
    //
    // ⚠ THE PRECONDITION IS NOW DISCHARGED (L-665, §PACK-CONFIDENCE-CEILING). The engine reads the
    // pack's declared ceiling, so the gate can be signed on its own merits. The assertions below
    // are EXTENDED, not replaced: they now pin the FIX rather than the defect, so a regression that
    // re-hard-codes the tier fails loudly HERE — at the file a signer reads — and not only in
    // `packConfidenceCeiling.test.ts`.
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    it('§THE-ORDERING-PIN — the confidence precondition is DISCHARGED: a solved Madrid zone badges RED', () => {
        // The gate is still shut, so nothing ships today…
        expect(MADRID_ENVELOPE_VERIFIED).toBe(false);

        // …but this is what signing it would now publish. Solved DIRECTLY through the engine,
        // deliberately bypassing the dispatcher gate — i.e. exactly the state the flip creates.
        const zone = ES_MADRID_PGOUM97_PACK.zones[0]!;
        const env = computeBuildableEnvelope({
            parcelRing: [
                { x: 0, z: 0 },
                { x: 40, z: 0 },
                { x: 40, z: 25 },
                { x: 0, z: 25 },
            ],
            edgeClassifications: ['unclassified', 'unclassified', 'unclassified', 'unclassified'],
            zoning: {
                jurisdictionId: ES_MADRID_PGOUM97_PACK.jurisdictionId,
                zoneCode: zone.code,
                structuredFields: null,
                provenance: { source: 'madrid-compendio-2025', fetchedAt: '2026-08-01T00:00:00.000Z' },
            } as never,
            rulePack: ES_MADRID_PGOUM97_PACK,
        });

        // THE ASSERTION THAT WAS IMPOSSIBLE BEFORE L-665. It fails on `6632f0e3` with
        // `'estimated-ruleset'` — the silent promotion of our own unchecked OCR read to the tier a
        // curated human estimate occupies.
        expect(env.confidence).toBe('pipeline-extracted-unverified');
        expect(env.confidence).not.toBe('estimated-ruleset');
        expect(env.confidence).toBe(ES_MADRID_PGOUM97_PACK.defaultConfidence);
        // …and it can never be promoted past its declaration by any solve path.
        expect(env.confidence).not.toBe('block-constructed');
        expect(env.confidence).not.toBe('structured');
        expect(env.confidence).not.toBe('authoritative');
    });

    it('§THE-ORDERING-PIN — the answerability precondition is DISCHARGED: registered ≠ answerable', () => {
        // The second half of the same root cause (L-665): `classifyAnswerability` read the registry
        // without reading the gate, so every one of Madrid's 23 packed codes claimed
        // `full-envelope` — a real buildable volume — for parcels that receive a cited refusal.
        // It now reads the gate, so registration and authorisation are separate facts in code, as
        // they already are in `sources/VERIFICATION.md`.
        expect(MADRID_ENVELOPE_VERIFIED).toBe(false);
        for (const code of MADRID_PGOUM97_ZONE_CODES) {
            expect(resolveZoneDisposition(MADRID_JURISDICTION_ID, code).kind, code).toBe('pack');
            expect(classifyAnswerability(MADRID_JURISDICTION_ID, code), code).toBe('pack-unverified');
        }
    });
});
