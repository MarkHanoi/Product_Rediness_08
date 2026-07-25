// L-609 — Amsterdam (BAG/CBS gemeente 0363) rule pack: the bestemmingsplan `explicit-area` zone.
//
// ⚠⚠ THIS PACK IS A DECLARATION, NOT A SOLVE. Its numeric fields are all `null`: an Amsterdam
//     parcel's REAL numbers come LIVE from the plan's `maatvoering` objects (resolved by
//     `resolveAmsterdamBestemmingsplan`), not from this pack. What the pack declares is the SHAPE of
//     the rule (`explicit-area` — the ordinance publishes the buildable `bouwvlak` as geometry) and
//     the governing citation. Read this header before touching it or the registry.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// WHY explicit-area, AND WHY NL IS THE STRONGEST CASE FOR IT (C58 §2.2 / ADR-0270)
// ═════════════════════════════════════════════════════════════════════════════════════════════
// Like Madrid NZ 1, the Dutch bestemmingsplan PUBLISHES THE BUILDABLE FOOTPRINT DIRECTLY AS
// GEOMETRY — the `bouwvlak` polygon (IMRO2012 / SVBP2012). Transcribing it into setback parameters
// would be a lossy re-derivation of something already authoritative, so `explicit-area` (ADR-0270)
// is the correct and only honest kind.
//
// Where NL is STRONGER than Madrid: the `maatvoering` objects carry the rule NUMBERS with
// UNAMBIGUOUS SVBP2012 units — "maximum bouwhoogte (m)" (height), "maximum bebouwingspercentage (%)"
// (coverage), "maximum aantal bouwlagen" (storeys). Madrid's COEF_Z is a coded token whose FAR
// semantics stay withheld (⇒ estimated-ruleset even when certified); a clean NL "maximum bouwhoogte
// (m)" is a genuine `published-structured` metre value. So a CERTIFIED Amsterdam parcel with a real
// maatvoering can render `structured` (the dispatcher feeds the height into `structuredFields`),
// not merely `estimated-ruleset`. See `resolveAmsterdamBestemmingsplan.ts` + the dispatcher.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// WHY IT DOES NOT SOLVE YET, AND WHY THAT IS THE SAFE STATE (§CONTEXT-DATA-HONESTY)
// ═════════════════════════════════════════════════════════════════════════════════════════════
// The national DSO **Ruimtelijke Plannen API v4** is LIVE and authoritative (probe L-609,
// 2026-07-25 at 52.3676,4.9041: `POST …/plannen/_zoek` returned HTTP 401 "Missing API Key"), but it
// is GATED behind an Informatiehuis Ruimte API key PRYZM does not yet hold, and no same-origin proxy
// is wired. So until `NL_AMS_BESTEMMINGSPLAN_CERTIFIED` is signed the dispatcher renders the cited
// `nlAmsterdamRefusal` — never a fabricated bouwhoogte (C58 §1.4). A plan that GENUINELY lacks a
// maatvoering also refuses honestly (naming the plan), rather than invent a height.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// WIRING TODO (orchestrator) — DO NOT DO THIS FROM AN IMPLEMENTER AGENT
// ═════════════════════════════════════════════════════════════════════════════════════════════
//   This file is intentionally NOT imported by `registry.ts` (mirrors the Madrid L-608 constraint):
//   the dispatcher (`applyNlZoningThenFallback`) references the pack directly, gated on the flag.
//   Full registration is unlocked only AFTER: (a) the `/api/nl/bestemmingsplan` proxy is wired with
//   the key; (b) a real plan's `bouwvlak` + `maximum bouwhoogte (m)` are human-verified; (c) the
//   `NL_AMS_BESTEMMINGSPLAN_CERTIFIED` gate is flipped. Then add an Amsterdam
//   `JurisdictionRegistration` (extent = the Amsterdam bbox + `contains` predicate).
//
// Confidence: `estimated-ruleset` as a PACK default — a pack cannot self-certify. The per-parcel
// render is `structured` when a live maatvoering resolves under the certified gate (see above).
//
// PURE + deterministic (C58 §1.1). Strategic context: C58 §1.4/§2.2, ADR-0270, and the mirrored
// `esMadridNZ1.ts`.

import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
    type GeometricRule,
    type EnvelopeRefusal,
    type PermittedUse,
} from '@pryzm/schemas';
import { NL_AMS_RING_REF } from '../providers/resolveAmsterdamBestemmingsplan.js';

/** The jurisdiction id Amsterdam packs and records use — gemeente 0363 (BAG/CBS). */
export const NL_AMS_JURISDICTION_ID = 'nl-0363-amsterdam';

/** The single generic zone code this pack answers for. The real bestemming (zone naam) rides on the
 *  `ZoningRecord` per parcel; the pack keys one `explicit-area` zone because the buildability SHAPE
 *  is identical across bestemmingen — the `bouwvlak` IS the rule (mirrors Madrid's one-rule pack). */
export const NL_AMS_ZONE_CODE = 'nl-ams:bouwvlak' as const;

/** The governing citation carried on the pack + the refusal. */
export const NL_AMS_ORDINANCE_REF =
    'Bestemmingsplan (Wet ruimtelijke ordening) — het buildable `bouwvlak` en de `maatvoering` ' +
    '(o.a. "maximum bouwhoogte (m)", "maximum bebouwingspercentage (%)", "maximum aantal ' +
    'bouwlagen") worden machine-leesbaar gepubliceerd volgens IMRO2012 / SVBP2012, ontsloten via ' +
    'de DSO Ruimtelijke Plannen API v4 (Kadaster / Informatiehuis Ruimte), ' +
    'ruimte.omgevingswet.overheid.nl/ruimtelijke-plannen/api/opvragen/v4 (live geverifieerd ' +
    '2026-07-25). Daarom is deze zone gemodelleerd als explicit-area (het bouwvlak IS de regel), ' +
    'niet getranscribeerd naar setback-afstanden.';

/**
 * The Amsterdam bestemmingsplan geometric rule. `explicit-area` carries ONLY a `ringRef`: the
 * `bouwvlak` geometry is resolved at the provider boundary (`resolveAmsterdamBestemmingsplan`),
 * never inlined here. The handle is versioned so the pack stays diffable across API vintages.
 */
export const NL_AMS_RULE: GeometricRule = {
    kind: 'explicit-area',
    ringRef: NL_AMS_RING_REF,
};

/**
 * The generic Amsterdam bestemmingsplan zone. Every numeric field is `null` — the parcel's real
 * numbers are the LIVE maatvoering, resolved externally; the `bouwvlak` geometry IS the shape rule.
 */
function nlAmsterdamZone(code: string) {
    return {
        code,
        label: 'Bestemmingsplan bouwvlak (IMRO2012 / SVBP2012)',
        permittedUse: [] as PermittedUse[], // the bestemming (Wonen/Gemengd/…) rides live per parcel.
        maxHeight_m: null, // "maximum bouwhoogte (m)" is live maatvoering, not a pack constant.
        maxFloors: null,
        plotRatioFAR: null,
        maxCoverage: null,
        setbacks: { front_m: null, side_m: null, rear_m: null },
        geometricRule: NL_AMS_RULE,
        fieldProvenance: {},
        ordinanceRef: NL_AMS_ORDINANCE_REF,
    };
}

/**
 * The Amsterdam bestemmingsplan pack. `defaultConfidence: 'estimated-ruleset'` — a pack cannot
 * self-certify; the per-parcel render upgrades to `structured` when a live maatvoering resolves
 * under the certified gate. `source: 'manual'` — the pack asserts NO numbers (all null); the real
 * data source (`nl-rp-api-v4`) is stamped on the `ZoningRecord.provenance` at dispatch time.
 */
export const NL_AMSTERDAM_BESTEMMINGSPLAN_PACK: JurisdictionZoningContract =
    JurisdictionZoningContractSchema.parse({
        jurisdictionId: NL_AMS_JURISDICTION_ID,
        displayName: 'Amsterdam — bestemmingsplan bouwvlak + maatvoering (DSO RP API v4)',
        source: 'manual',
        crs: 'EPSG:4326', // the proxy asks the RP API for WGS84 (content-crs epsg:4326); L5 projects it.
        lastReviewed: '2026-07-25',
        defaultConfidence: 'estimated-ruleset',
        zones: [nlAmsterdamZone(NL_AMS_ZONE_CODE)],
    });

/**
 * Map a Dutch bestemming (zone) naam onto the closed `PermittedUse` vocabulary (C58 §2.2 — the
 * jurisdiction use-code → shared-vocabulary hand-off the schema mandates). A DIRECT translation of
 * the authoritative bestemming, not a guess; an unrecognised bestemming → `'other'` (honest, never
 * dropped). Case-insensitive, prefix-tolerant ("Wonen - 1", "Gemengd-2" both classify).
 */
export function bestemmingToPermittedUse(bestemming: string | null | undefined): PermittedUse | null {
    if (typeof bestemming !== 'string') return null;
    const s = bestemming.trim().toLowerCase();
    if (s === '') return null;
    if (s.startsWith('wonen') || s.startsWith('woondoeleinden') || s.includes('woning')) return 'residential';
    if (s.startsWith('gemengd') || s.startsWith('centrum')) return 'mixed';
    if (
        s.startsWith('bedrijf') ||
        s.startsWith('bedrijventerrein') ||
        s.startsWith('bedrijvent') ||
        s.startsWith('industrie')
    ) {
        return 'industrial';
    }
    if (
        s.startsWith('kantoor') ||
        s.startsWith('detailhandel') ||
        s.startsWith('horeca') ||
        s.startsWith('dienstverlening')
    ) {
        return 'commercial';
    }
    if (s.startsWith('maatschappelijk') || s.startsWith('sport') || s.startsWith('cultuur')) return 'civic';
    if (s.startsWith('groen') || s.startsWith('natuur') || s.startsWith('recreatie')) return 'green';
    return 'other';
}

/**
 * L-609 — the Amsterdam bestemmingsplan REFUSAL, shipped WHILE the RP API v4 key/proxy are not
 * wired (and `NL_AMS_BESTEMMINGSPLAN_CERTIFIED` is OFF), OR when a resolved plan genuinely lacks a
 * `bouwvlak`.
 *
 * ⚠ THIS, NOT A NUMBER, IS THE CURRENT SHIPPING OUTPUT for an Amsterdam parcel. The honest answer
 * until the published `bouwvlak` + `maatvoering` are resolvable AND verified is a cited refusal —
 * never a fabricated bouwhoogte or bebouwingspercentage (C58 §1.4, §CONTEXT-DATA-HONESTY: a REFUSAL
 * and a FAILURE must not collapse to the same value).
 *
 * `code: 'source-data-unavailable'` — PRYZM HOLDS the rule (this explicit-area declaration +
 * `resolveAmsterdamBestemmingsplan`), but cannot yet fetch the published `bouwvlak`/`maatvoering`
 * (no keyed same-origin proxy). `legallyGrounded: false` — the LAW is known; what is missing is our
 * data path, a statement about PRYZM's inputs, not about the ordinance. The `ordinanceRef` cites the
 * bestemmingsplan / IMRO publication for the one LEGAL claim we make (that NL publishes the bouwvlak
 * as geometry), never for a number.
 */
export function nlAmsterdamRefusal(
    planName: string | null = null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const planClause = planName ? ` (plan: ${planName})` : '';
    return {
        code: 'source-data-unavailable',
        headline:
            'Amsterdam bestemmingsplan — the published buildable envelope (bouwvlak) could not be ' +
            `resolved for this parcel yet${planClause}.`,
        detail:
            'PRYZM models the Amsterdam bestemmingsplan as an explicit-area zone: the plan publishes ' +
            'the buildable envelope (bouwvlak) and its dimensions (maatvoering — e.g. "maximum ' +
            'bouwhoogte (m)", "maximum bebouwingspercentage (%)") machine-readable per IMRO2012 / ' +
            'SVBP2012, served by the national DSO Ruimtelijke Plannen API v4. That data must be ' +
            'fetched live for your parcel through an authenticated key, which is not wired here yet. ' +
            'Rather than fabricate a maximum height or coverage, PRYZM declines to draw a buildable ' +
            'envelope — no number is shown because none can be cited.',
        ordinanceRef: NL_AMS_ORDINANCE_REF,
        legallyGrounded: false,
        knownFacts: [...knownFacts],
    };
}
