// SWITZERLAND / City of Zürich (BFS-Nr 261, canton ZH) — the BZO zone-parameter CATALOGUE + the
// per-parcel REGIME resolver. The machine transcription of `docs/04-reference/jurisdictions/ch/
// sources/bzo_zone_data.json` (founder-supplied, transcribed from the BZO 700.100 primary PDFs and
// cross-checked). PURE + deterministic — no I/O.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS — the reference-commune upgrade, and WHY it stays gated (ZURICH-BZO-PROBE §3/§4)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The Zürich probe settled Outcome B: the City BZO WFS publishes the zone IDENTITY (`typ`, the
// per-parcel ordinance link) but NOT the Ausnützungsziffer / Vollgeschosse / Gebäudehöhe — those are
// PDF-bound in BZO 700.100, keyed by the zone code. This module is the human-verified TRANSCRIPTION of
// that per-code table, so the day `CH_FAR_CERTIFIED` is flipped ON the CH path can compute an
// `estimated-ruleset` envelope (AZ × parcel area → GFA, with the Vollgeschosse + Gebäudehöhe as caps).
// It is a TRANSCRIPTION, not a live authoritative feed — never `structured` confidence.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE TWO PARALLEL REGIMES — why per-parcel REGIME RESOLUTION is soundness-critical (not optional)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Zürich runs TWO parallel plan regimes over different plan areas: `bzo_91_99` (the older BZO
// 1991/1999, Art. 13 Wohnzonen / Art. 18 Zentrumszonen — most of the city) and `bzo_2016` (the newer
// plan area, different article numbering). They DISAGREE on numbers:
//
//     W2bIII:  AZ 0.45 in BOTH regimes  —  but max Gebäudehöhe 8.5 m (91/99) vs 9.0 m (2016).
//
// So a parcel's HEIGHT cap CANNOT be chosen from the zone code `W2bIII` alone — the governing regime
// must be resolved first, from the parcel's `rechtsvorschrift_url` / plan area. `resolveZurichBzoRegime`
// does that, and — critically — REFUSES (`regime-ambiguous`) when it cannot be determined, rather than
// guess a regime (the §CONTEXT-DATA-HONESTY family: a refusal and a fabrication must not collapse; a
// coin-flipped 8.5-vs-9.0 m height is a fabrication). The FAR (AZ) is regime-INDEPENDENT for every zone
// we carry (identical across regimes where a zone appears in both; the rest appear only in 91/99), so
// `zurichBzoFarFor` can answer the FAR without a regime — but the ENVELOPE (which needs the height)
// cannot, and demands the regime.
//
// Strategic context — docs/04-reference/jurisdictions/ch/regions/zurich/ZURICH-BZO-PROBE.md §3/§4,
// ch/sources/VERIFICATION.md, ch/sources/bzo_zone_data.json, C58 §1.2/§1.4/§1.5, §CONTEXT-DATA-HONESTY.

import type { ChFarKind, ChFarCatalogueEntry, ChCantonFarCatalogue } from './resolveChFarFromCantonCatalogue.js';

/** The two parallel BZO regimes that govern different plan areas of the City of Zürich. */
export type ZurichBzoRegime = 'bzo_91_99' | 'bzo_2016';

/** The two-letter canton this catalogue belongs to (the key `CH_CANTON_FAR_CATALOGUES` registers under). */
export const ZURICH_CANTON = 'ZH' as const;

/** The transcribed per-zone parameters for one BZO `typ` code, under one regime. AZ is a FRACTION. */
export interface ZurichBzoZoneParams {
    /** Ausnützungsziffer as a fraction of parcel area (e.g. 45% → 0.45). Max GFA = az × parcel area. */
    readonly az: number;
    /** Max Vollgeschosse (full storeys) — a cap, carried, never derived from `az`. */
    readonly maxVollgeschosse: number;
    /** Max Gebäudehöhe in metres — a cap. This is the REGIME-SENSITIVE field (W2bIII 8.5 vs 9.0). */
    readonly maxGebaeudehoehe_m: number;
    /** Grundgrenzabstand (boundary setback) in metres, where the article states one (else null). */
    readonly grundgrenzabstand_m?: number | null;
    /** Überbauungsziffer (coverage ratio) as a fraction, where the article states one (else null). */
    readonly ueberbauungsziffer?: number | null;
}

/** One legal-source citation carried with a resolved envelope (never a bare number). */
export interface ZurichBzoLegalSource {
    readonly document: string;
    readonly article: string;
    readonly url: string;
    readonly bzoVersion: string;
}

/**
 * The two source documents the catalogue is transcribed from (mirrors `bzo_zone_data.json`
 * `sourceDocuments`). ⚠ The exact consolidated-PDF URLs are founder-supplied primary references; the
 * `oerebdocs.zh.ch/getDoc` base was verified live 2026-07-25, but the precise per-regime PDF URL is to
 * be confirmed by the repo owner at sign-off (see VERIFICATION.md "Open items").
 */
export const ZURICH_BZO_SOURCE_DOCUMENTS: Readonly<Record<ZurichBzoRegime, ZurichBzoLegalSource>> = {
    bzo_91_99: {
        document: 'Bau- und Zonenordnung der Stadt Zürich (BZO 1991/1999)',
        article: 'Art. 13 (Wohnzonen) / Art. 18 (Zentrumszonen)',
        url: 'https://oerebdocs.zh.ch/getDoc?docid=573',
        bzoVersion: '1991/1999',
    },
    bzo_2016: {
        document: '700.100 Bau- und Zonenordnung der Stadt Zürich (BZO 2016)',
        article: 'BZO 2016 (Wohn-/Zentrumszonen)',
        url: 'https://oerebdocs.zh.ch/getDoc?docid=6808',
        bzoVersion: '2016',
    },
} as const;

/**
 * THE CATALOGUE — the transcribed BZO zone table, per regime, per `typ` code. The single machine
 * source of the numbers `bzo_zone_data.json` documents for humans; `chZurichBzoCatalogue.test.ts`
 * parity-guards them. AZ is a fraction; height is the regime-sensitive cap.
 *
 * ⚠ `bzo_2016` deliberately carries ONLY the zones the founder cross-checked under that regime
 * (W2bIII + Z5/Z6/Z7). Zones absent from `bzo_2016` are NOT guessed — a lookup there refuses.
 */
export const ZURICH_BZO_ZONE_CATALOGUE: Readonly<
    Record<ZurichBzoRegime, Readonly<Record<string, ZurichBzoZoneParams>>>
> = {
    bzo_91_99: {
        W2bI: { az: 0.4, maxVollgeschosse: 2, maxGebaeudehoehe_m: 9.0 },
        W2bII: { az: 0.4, maxVollgeschosse: 2, maxGebaeudehoehe_m: 9.0 },
        W2bIII: { az: 0.45, maxVollgeschosse: 2, maxGebaeudehoehe_m: 8.5, grundgrenzabstand_m: 5.0, ueberbauungsziffer: 0.25 },
        W2: { az: 0.6, maxVollgeschosse: 2, maxGebaeudehoehe_m: 9.0 },
        W3: { az: 0.9, maxVollgeschosse: 3, maxGebaeudehoehe_m: 9.5 },
        W4b: { az: 1.05, maxVollgeschosse: 4, maxGebaeudehoehe_m: 12.5 },
        W4: { az: 1.2, maxVollgeschosse: 4, maxGebaeudehoehe_m: 12.5 },
        W5: { az: 1.65, maxVollgeschosse: 5, maxGebaeudehoehe_m: 15.5 },
        W6: { az: 2.05, maxVollgeschosse: 6, maxGebaeudehoehe_m: 18.5 },
        Z5: { az: 2.0, maxVollgeschosse: 5, maxGebaeudehoehe_m: 19.0, grundgrenzabstand_m: 3.5 },
        Z6: { az: 2.3, maxVollgeschosse: 6, maxGebaeudehoehe_m: 22.0 },
        Z7: { az: 2.6, maxVollgeschosse: 7, maxGebaeudehoehe_m: 25.0 },
    },
    bzo_2016: {
        // Height discrepancy vs 91/99 (9.0 vs 8.5); AZ unchanged.
        W2bIII: { az: 0.45, maxVollgeschosse: 2, maxGebaeudehoehe_m: 9.0 },
        // Identical to 91/99 (cross-checked).
        Z5: { az: 2.0, maxVollgeschosse: 5, maxGebaeudehoehe_m: 19.0 },
        Z6: { az: 2.3, maxVollgeschosse: 6, maxGebaeudehoehe_m: 22.0 },
        Z7: { az: 2.6, maxVollgeschosse: 7, maxGebaeudehoehe_m: 25.0 },
    },
} as const;

// ──────────────────────────────────────────────────────────────────────────────────────────────
// REGIME RESOLUTION — the soundness-critical step: which regime governs THIS parcel?
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * THE STATIC CROSSWALK — the oerebdocs `docid` → BZO regime map, keyed by the numeric `docid` (a
 * string, e.g. `'573'`), NOT by the raw URL. Populated 2026-07-25 from REAL documents: each `docid`
 * was self-sourced from the live Stadt-Zürich BZO WFS `rechtsvorschrift_url` field, then fetched from
 * `oerebdocs.zh.ch/getDoc?docid=<N>` and classified by `classifyBzoRegimeFromDocText` against its own
 * verbatim legal-basis text. The canonical human artefact (with per-docid provenance: the marker text
 * found, the source URL, retrieved date, and the DELIBERATELY-EXCLUDED unclassifiable docids) is
 * `docs/04-reference/jurisdictions/ch/sources/bzo_regime_crosswalk.json`; `chZurichBzoCatalogue.test.ts`
 * parity-guards this map against it.
 *
 * ⚠ A docid ABSENT from this map is NOT a bug and NEVER a guess: it means the governing document could
 * not be classified from its own text (an image-only scan such as `docid=6808`, a cantonal — not
 * municipal-BZO — ordinance such as `docid=16381`, or a zone-plan change that restates no regime
 * lineage). For such a parcel `resolveZurichBzoRegime` REFUSES `regime-ambiguous` (§CONTEXT-DATA-HONESTY:
 * a refusal and a fabrication must not collapse; the W2bIII 8.5-vs-9.0 m height forbids a coin flip).
 *
 * ⚠ This still does NOT flip `CH_FAR_CERTIFIED` — the crosswalk only makes regime RESOLUTION possible;
 * the density/height compute stays gated OFF behind the repo owner's separate human sign-off.
 */
export const ZURICH_BZO_REGIME_BY_DOC: ReadonlyMap<string, ZurichBzoRegime> = new Map<
    string,
    ZurichBzoRegime
>([
    // BZO 91/99 — the older regime (BZO 92 → BZO 99 festsetzung lineage; the consolidated 91/99 text).
    ['573', 'bzo_91_99'],
    ['562', 'bzo_91_99'],
    ['601', 'bzo_91_99'],
    ['606', 'bzo_91_99'],
    ['610', 'bzo_91_99'],
    ['615', 'bzo_91_99'],
    ['620', 'bzo_91_99'],
    ['16945', 'bzo_91_99'], // the CONSOLIDATED "Bau- und Zonenordnung (BZO 91/99)" ordinance text.
    // BZO 2016 — the newer regime (BZO 2016 fassung + post-2016 Teilrevisionen / Stadtratsbeschluss chain).
    ['10868', 'bzo_2016'],
    ['10984', 'bzo_2016'],
    ['11130', 'bzo_2016'],
    ['15172', 'bzo_2016'],
]);

/** Input to `resolveZurichBzoRegime` — the parcel's ordinance link and/or a known plan-area tag. */
export interface ZurichBzoRegimeInput {
    /** `rechtsvorschrift_url` from `resolveZurichBzoZone` (the per-parcel BZO ordinance link). */
    readonly rechtsvorschriftUrl?: string | null;
    /** An explicitly-known plan-area / regime tag, when a caller already holds it (e.g. from sign-off). */
    readonly planArea?: string | null;
}

/**
 * The regime resolution — a determined regime, or an honest refusal (never a guessed regime).
 * `regime-ambiguous` — the regime genuinely cannot be placed (no signal, an unclassified docid, or two
 *   docids that disagree). `regime-fetch-failed` — a runtime classify was attempted and the doc could
 *   not be retrieved (the async resolver only; the pure `resolveZurichBzoRegime` never emits it).
 */
export type ZurichBzoRegimeResolution =
    | { readonly ok: true; readonly regime: ZurichBzoRegime }
    | { readonly ok: false; readonly reason: 'regime-ambiguous' | 'regime-fetch-failed' };

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE PURE CLASSIFIER — read the BZO regime off a fetched ordinance document's own text
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Classify which BZO regime an oerebdocs ordinance document declares, from its extracted TEXT. PURE +
 * deterministic — no I/O. Returns `null` when NO clear marker is present (an image-only scan, a
 * non-BZO cantonal ordinance, or a zone-plan change that restates no regime lineage): the caller must
 * then REFUSE `regime-ambiguous`, never guess (§CONTEXT-DATA-HONESTY — the W2bIII 8.5-vs-9.0 m height).
 *
 * The marker precedence is derived from REAL documents (verified 2026-07-25 against the fetched PDFs):
 *   1. The explicit consolidated-fassung self-label `BZO 91/99` WINS — the consolidated
 *      "Bau- und Zonenordnung (BZO 91/99)" text cross-references `BZO 2016` and the Stadtratsbeschluss
 *      (STRB) chain for grandfathered parcels (`docid=16945`), so those markers are NOT 2016-exclusive
 *      and must not be read as such.
 *   2. Else the `BZO 2016` fassung / a post-2016 `Teilrevision Bau- und Zonenordnung` → `bzo_2016`
 *      (these phrases never appear in the 2000–2005 91/99 genehmigung documents).
 *   3. Else the 1991/1992/1999 festsetzung lineage (`BZO 92`/`BZO 99`, `Bau- und Zonenordnung 199x`,
 *      the `1992/1999` fassung, GRB `1815 und 1816` / `Nr. 1559`, the `17. Mai 1992` Urnenabstimmung)
 *      → `bzo_91_99`.
 *   4. Else `null` — no clear marker.
 */
export function classifyBzoRegimeFromDocText(text: string | null | undefined): ZurichBzoRegime | null {
    if (typeof text !== 'string' || text.trim() === '') return null;
    const t = text;
    // (1) Explicit consolidated-fassung self-label — decisive over the cross-referenced 2016/STRB markers.
    if (/BZO\s*91\s*\/\s*99/i.test(t)) return 'bzo_91_99';
    // (2) BZO 2016 fassung or a post-2016 Teilrevision der Bau- und Zonenordnung.
    if (/\bBZO\s*2016\b/i.test(t) || /Teilrevision\s+Bau-\s*und\s+Zonenordnung/i.test(t)) {
        return 'bzo_2016';
    }
    // (3) The 1991/1992/1999 festsetzung lineage.
    if (
        /\bBZO\s*9[29]\b/i.test(t) ||
        /Bau-\s*und\s+Zonenordnung\s*199[29]/i.test(t) ||
        /199[29]\s*\/\s*199[29]/.test(t) ||
        /\b1815\s+und\s+1816\b/.test(t) ||
        /\bNr\.?\s*1559\b/.test(t) ||
        /Urnenabstimmung\s+vom\s+17\.\s*Mai\s+1992/i.test(t)
    ) {
        return 'bzo_91_99';
    }
    // (4) No clear marker — refuse to guess.
    return null;
}

/**
 * Extract every oerebdocs `docid` from a `rechtsvorschrift_url` value, in order, deduplicated. The WFS
 * field can carry MULTIPLE `getDoc?docid=<N>` links for one parcel, separated by `; ` (verified live
 * 2026-07-25, e.g. `…docid=573; …docid=6808`), so a single URL can name several governing documents.
 * PURE. Returns `[]` when the input is not a string or carries no docid.
 */
export function extractOerebDocIds(url: string | null | undefined): string[] {
    if (typeof url !== 'string') return [];
    const ids: string[] = [];
    const re = /docid=(\d+)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(url)) !== null) ids.push(m[1]!);
    return [...new Set(ids)];
}

/**
 * Resolve a regime from a set of docids via the static crosswalk. Returns a regime only on CONSENSUS:
 *   • any docid ABSENT from the crosswalk (unclassifiable) ⇒ `null` (cannot confirm — refuse);
 *   • docids that map to DIFFERENT regimes ⇒ `null` (genuinely conflicting — refuse);
 *   • exactly one distinct regime across all docids ⇒ that regime.
 * PURE. `[]` docids ⇒ `null`.
 */
function regimeFromDocIds(docIds: readonly string[]): ZurichBzoRegime | null {
    if (docIds.length === 0) return null;
    const regimes = new Set<ZurichBzoRegime>();
    for (const id of docIds) {
        const r = ZURICH_BZO_REGIME_BY_DOC.get(id);
        if (!r) return null; // an unclassified governing document — cannot resolve, never guess.
        regimes.add(r);
    }
    return regimes.size === 1 ? [...regimes][0]! : null; // conflicting regimes ⇒ refuse.
}

/** Normalise a free-form plan-area / regime string to a regime literal, or null if unrecognised. */
function normalisePlanAreaToRegime(planArea: string | null | undefined): ZurichBzoRegime | null {
    if (typeof planArea !== 'string') return null;
    const s = planArea.trim().toLowerCase().replace(/\s+/g, '');
    if (s === '') return null;
    if (s === 'bzo_2016' || s === 'bzo2016' || s === '2016') return 'bzo_2016';
    if (
        s === 'bzo_91_99' ||
        s === 'bzo91_99' ||
        s === 'bzo91/99' ||
        s === '91/99' ||
        s === '1991/1999' ||
        s === '1991' ||
        s === '1999'
    ) {
        return 'bzo_91_99';
    }
    return null;
}

/**
 * Resolve WHICH BZO regime governs a parcel — the soundness-critical step before any height cap. PURE
 * (no I/O): it reads the STATIC docid→regime crosswalk, never fetches. The runtime-classify fallback
 * (fetch + retry + `regime-fetch-failed`) lives in `resolveZurichBzoRegimeWithFetch`.
 *
 * Resolution order: (1) an explicit, recognised `planArea` tag the caller already holds wins; (2) else
 * parse the oerebdocs `docid`(s) out of `rechtsvorschrift_url` and look each up in the static crosswalk
 * (`ZURICH_BZO_REGIME_BY_DOC`) — resolving only on CONSENSUS (all classified, one regime); (3) else
 * REFUSE `regime-ambiguous`. It NEVER guesses: with two regimes that disagree on the W2bIII height
 * (8.5 vs 9.0 m), a guessed regime is a fabricated height. An unclassified docid, a conflict between a
 * parcel's several docids, or no signal at all all refuse rather than default to one regime.
 */
export function resolveZurichBzoRegime(input: ZurichBzoRegimeInput): ZurichBzoRegimeResolution {
    const fromPlanArea = normalisePlanAreaToRegime(input.planArea);
    if (fromPlanArea) return { ok: true, regime: fromPlanArea };

    const regime = regimeFromDocIds(extractOerebDocIds(input.rechtsvorschriftUrl));
    if (regime) return { ok: true, regime };

    // Neither a recognised plan area nor a resolvable ordinance-docid mapping — refuse, never guess.
    return { ok: false, reason: 'regime-ambiguous' };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// LOOKUPS
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Look up one zone's transcribed parameters under a specific regime, or null if not carried there. */
export function zurichBzoZoneParams(
    regime: ZurichBzoRegime,
    typ: string | null | undefined,
): ZurichBzoZoneParams | null {
    const code = typeof typ === 'string' ? typ.trim() : '';
    if (code === '') return null;
    return ZURICH_BZO_ZONE_CATALOGUE[regime][code] ?? null;
}

/**
 * The REGIME-INDEPENDENT FAR (AZ) for a zone code, or null if not in the catalogue. The AZ is identical
 * across regimes for every zone that appears in both (W2bIII/Z5/Z6/Z7); the rest appear only in 91/99.
 * So the FAR can be answered without a regime — unlike the height cap, which cannot. If a zone somehow
 * carried divergent AZ across regimes it would refuse (return null) rather than pick one — but none do.
 */
export function zurichBzoFarFor(typ: string | null | undefined): number | null {
    const code = typeof typ === 'string' ? typ.trim() : '';
    if (code === '') return null;
    const a = ZURICH_BZO_ZONE_CATALOGUE.bzo_91_99[code];
    const b = ZURICH_BZO_ZONE_CATALOGUE.bzo_2016[code];
    if (a && b) return a.az === b.az ? a.az : null; // divergent AZ ⇒ refuse (never happens today).
    if (a) return a.az;
    if (b) return b.az;
    return null;
}

/** Input to the regime-aware envelope-parameter resolver. */
export interface ZurichBzoEnvelopeParamsInput extends ZurichBzoRegimeInput {
    /** The municipal BZO zone code (`typ`, e.g. `W2bIII`, `Z5`). */
    readonly typ: string | null | undefined;
}

/** The regime-aware resolution: the full envelope inputs, or a typed refusal. Never throws. */
export type ZurichBzoEnvelopeParamsResolution =
    | {
          readonly ok: true;
          readonly zone: string;
          readonly far: number;
          readonly maxStoreys: number;
          readonly maxHeight_m: number;
          readonly regime: ZurichBzoRegime;
          readonly legalSources: readonly ZurichBzoLegalSource[];
      }
    | {
          readonly ok: false;
          /** The regime could not be determined for this parcel — refuse, never guess. */
          readonly reason: 'regime-ambiguous' | 'unknown-zone' | 'not-in-regime';
      };

/**
 * Resolve the full, regime-aware envelope parameters for a Zürich parcel:
 * `{ zone, far, maxStoreys, maxHeight_m, regime, legalSources }`, or a typed refusal.
 *
 * ⚠ This is PURE and does NOT consult `CH_FAR_CERTIFIED` — it is the data lookup. The CERTIFICATION
 * gate + the GFA compute live in `computeZurichBzoEnvelope` (colocated with the flag). This resolver
 * REFUSES `regime-ambiguous` whenever the regime is undetermined, because the height cap is
 * regime-sensitive (W2bIII 8.5 vs 9.0 m) and a guessed regime would be a fabricated height.
 */
export function resolveZurichBzoEnvelopeParams(
    input: ZurichBzoEnvelopeParamsInput,
): ZurichBzoEnvelopeParamsResolution {
    const code = typeof input.typ === 'string' ? input.typ.trim() : '';
    if (code === '') return { ok: false, reason: 'unknown-zone' };

    const regimeRes = resolveZurichBzoRegime(input);
    if (!regimeRes.ok) return { ok: false, reason: 'regime-ambiguous' };
    const regime = regimeRes.regime;

    const params = zurichBzoZoneParams(regime, code);
    if (!params) return { ok: false, reason: 'not-in-regime' };

    return {
        ok: true,
        zone: code,
        far: params.az,
        maxStoreys: params.maxVollgeschosse,
        maxHeight_m: params.maxGebaeudehoehe_m,
        regime,
        legalSources: [ZURICH_BZO_SOURCE_DOCUMENTS[regime]],
    };
}

/** Max GFA from AZ × parcel area. Returns null on non-finite / non-positive inputs (never NaN). */
export function computeZurichBzoGfa(az: number, parcelAreaM2: number): number | null {
    if (!Number.isFinite(az) || !Number.isFinite(parcelAreaM2)) return null;
    if (az <= 0 || parcelAreaM2 <= 0) return null;
    return az * parcelAreaM2;
}

/**
 * The C58 `ZoningRecord.structuredFields` a Zürich BZO parcel contributes to the SHARED buildable-
 * envelope engine (`computeBuildableEnvelope`) — the mapping the L5 dispatcher drops onto the record
 * once `computeZurichBzoEnvelope` is wired in (L-616).
 *
 * ⚠ WHY `plotRatioFAR` (not a bare `far`/`az`): the engine's L-616 `farLimitedHeight_m` FAR-cap reads
 * the AZ from `resolveNumber(structured.plotRatioFAR, zone?.plotRatioFAR, …)` — the EXACT field name
 * `plotRatioFAR` (see ZoningRulesEngine + JurisdictionZoningContract). Emitting the AZ under any other
 * key would leave `maxFAR` null → the shared massing would extrude footprint × `maxHeight_m` and IGNORE
 * the AZ cap, the OVERSTATES-FAR defect L-616 exists to prevent. So the Zürich AZ MUST travel as
 * `plotRatioFAR`, `maxHeight_m` as the regime-correct Gebäudehöhe, `maxFloors` as the Vollgeschosse.
 *
 * PURE and gate-INDEPENDENT (does NOT consult `CH_FAR_CERTIFIED`) — it is a data lookup, exactly like
 * `resolveZurichBzoEnvelopeParams` on which it is built; the CERTIFICATION gate lives in
 * `computeZurichBzoEnvelope`. Returns `null` when the regime/zone cannot be resolved (never a guess).
 */
export interface ZurichBzoStructuredFields {
    /** Ausnützungsziffer (AZ) as a fraction — emitted under the ENGINE's FAR-cap field name. */
    readonly plotRatioFAR: number;
    /** Max Gebäudehöhe (m) under the resolved regime — the shell height cap. */
    readonly maxHeight_m: number;
    /** Max Vollgeschosse (full storeys) — the floor cap; also sets the FAR floor-height divisor. */
    readonly maxFloors: number;
}

/**
 * Build the engine-shaped `structuredFields` for a Zürich parcel: `{ plotRatioFAR, maxHeight_m,
 * maxFloors }`, or `null` when the regime/zone cannot be placed. This is what the orchestrator copies
 * into the C58 `ZoningRecord.structuredFields` so the shared engine's L-616 FAR-cap binds the massing.
 */
export function zurichBzoStructuredFields(
    input: ZurichBzoEnvelopeParamsInput,
): ZurichBzoStructuredFields | null {
    const params = resolveZurichBzoEnvelopeParams(input);
    if (!params.ok) return null;
    return {
        plotRatioFAR: params.far, // AZ under the engine's FAR-cap field name — the load-bearing rename.
        maxHeight_m: params.maxHeight_m,
        maxFloors: params.maxStoreys,
    };
}

/**
 * The `knownFacts` lines that enrich the honest refusal (gate OFF) with the transcribed AZ / height /
 * storeys as REFERENCE values, clearly labelled "pending certification" so no chip reads them as a
 * cited ordinance figure. When the regime is undetermined, the W2bIII-style height ambiguity is shown
 * explicitly (both regime values) rather than a single guessed number.
 */
export function zurichBzoPendingCertFacts(input: ZurichBzoEnvelopeParamsInput): string[] {
    const code = typeof input.typ === 'string' ? input.typ.trim() : '';
    if (code === '') return [];
    const facts: string[] = [];

    const far = zurichBzoFarFor(code);
    if (far !== null) {
        facts.push(
            `Ausnützungsziffer (AZ): ${(far * 100).toFixed(0)}% (${far}) — transcribed BZO 700.100, pending certification`,
        );
    }

    const regimeRes = resolveZurichBzoRegime(input);
    if (regimeRes.ok) {
        const p = zurichBzoZoneParams(regimeRes.regime, code);
        if (p) {
            facts.push(
                `Max Gebäudehöhe: ${p.maxGebaeudehoehe_m} m (${ZURICH_BZO_SOURCE_DOCUMENTS[regimeRes.regime].bzoVersion}) — transcribed, pending certification`,
            );
            facts.push(`Max Vollgeschosse: ${p.maxVollgeschosse} — transcribed, pending certification`);
        }
    } else {
        // Regime undetermined: show the height ambiguity honestly rather than a single guessed value.
        const a = ZURICH_BZO_ZONE_CATALOGUE.bzo_91_99[code];
        const b = ZURICH_BZO_ZONE_CATALOGUE.bzo_2016[code];
        if (a && b && a.maxGebaeudehoehe_m !== b.maxGebaeudehoehe_m) {
            facts.push(
                `Max Gebäudehöhe: ${a.maxGebaeudehoehe_m} m (BZO 91/99) or ${b.maxGebaeudehoehe_m} m (BZO 2016) — governing regime unresolved for this parcel; pending certification`,
            );
        } else if (a && b) {
            facts.push(
                `Max Gebäudehöhe: ${a.maxGebaeudehoehe_m} m (identical across regimes) — transcribed, pending certification`,
            );
        }
        facts.push('Governing BZO regime not resolved for this parcel — height cap pending regime confirmation.');
    }
    return facts;
}

/**
 * The Zürich `ChCantonFarCatalogue` (canton `ZH`) the national FAR scaffold registers: the
 * REGIME-INDEPENDENT AZ per zone code, as `ChFarCatalogueEntry` rows (`farKind: 'AZ'`). Height /
 * storeys are NOT here — they are regime-sensitive and belong to the regime-aware resolver above; this
 * catalogue answers only the FAR question the generic `resolveChFarFromCantonCatalogue` asks.
 */
export const ZURICH_ZH_FAR_CATALOGUE: ChCantonFarCatalogue = (() => {
    const kind: ChFarKind = 'AZ';
    const source =
        'City of Zürich BZO 700.100 zone table (transcribed, cross-checked, PENDING CERTIFICATION) — ' +
        'see ch/sources/bzo_zone_data.json + VERIFICATION.md. AZ is regime-independent; height is not.';
    const rows: Array<[string, ChFarCatalogueEntry]> = [];
    for (const code of Object.keys(ZURICH_BZO_ZONE_CATALOGUE.bzo_91_99)) {
        const far = zurichBzoFarFor(code);
        if (far !== null) rows.push([code, { typKommunalCode: code, far, farKind: kind, source }]);
    }
    return new Map(rows);
})();
