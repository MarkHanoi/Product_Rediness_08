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
 * The `rechtsvorschrift_url` → regime map. ⚠ DELIBERATELY EMPTY. Which oerebdocs document id maps to
 * which BZO regime is itself a HUMAN-VERIFIED fact (the docid→regime crosswalk is not published as
 * structured data), so until it is signed off, a URL alone cannot determine the regime — and
 * `resolveZurichBzoRegime` must refuse rather than guess. A verified entry here is a data drop, not a
 * redesign (mirrors `CH_CANTON_FAR_CATALOGUES`).
 */
export const ZURICH_BZO_REGIME_BY_DOC: ReadonlyMap<string, ZurichBzoRegime> = new Map();

/** Input to `resolveZurichBzoRegime` — the parcel's ordinance link and/or a known plan-area tag. */
export interface ZurichBzoRegimeInput {
    /** `rechtsvorschrift_url` from `resolveZurichBzoZone` (the per-parcel BZO ordinance link). */
    readonly rechtsvorschriftUrl?: string | null;
    /** An explicitly-known plan-area / regime tag, when a caller already holds it (e.g. from sign-off). */
    readonly planArea?: string | null;
}

/** The regime resolution — a determined regime, or an honest refusal (never a guessed regime). */
export type ZurichBzoRegimeResolution =
    | { readonly ok: true; readonly regime: ZurichBzoRegime }
    | { readonly ok: false; readonly reason: 'regime-ambiguous' };

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
 * Resolve WHICH BZO regime governs a parcel — the soundness-critical step before any height cap.
 *
 * Resolution order: (1) an explicit, recognised `planArea` tag the caller already holds wins; (2) else
 * a VERIFIED `rechtsvorschrift_url` → regime mapping (`ZURICH_BZO_REGIME_BY_DOC`, empty until signed
 * off); (3) else REFUSE `regime-ambiguous`. It NEVER guesses: with two regimes that disagree on the
 * W2bIII height (8.5 vs 9.0 m), a guessed regime is a fabricated height. This is why the resolver
 * refuses a parcel it cannot place, rather than defaulting to one regime.
 */
export function resolveZurichBzoRegime(input: ZurichBzoRegimeInput): ZurichBzoRegimeResolution {
    const fromPlanArea = normalisePlanAreaToRegime(input.planArea);
    if (fromPlanArea) return { ok: true, regime: fromPlanArea };

    const url = typeof input.rechtsvorschriftUrl === 'string' ? input.rechtsvorschriftUrl.trim() : '';
    if (url !== '') {
        const mapped = ZURICH_BZO_REGIME_BY_DOC.get(url);
        if (mapped) return { ok: true, regime: mapped };
    }
    // Neither a recognised plan area nor a verified ordinance-URL mapping — refuse, never guess.
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
