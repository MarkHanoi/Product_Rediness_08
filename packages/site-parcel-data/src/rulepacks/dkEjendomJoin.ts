// §DK-EJENDOM-JOIN (lane ENVELOPE-NLDK, 2026-09-04) — the `BFE → ejendom` join, and the correction
// of round one's "credential blocker".
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE CORRECTION — the highest-value Danish unlock was NOT credential-gated
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `DK-ENVELOPE-COMPLETION.md` §1.3 / §3.2 said: ~40 % of populated `bebygpct` is scoped to the
// `ejendom` (code 2 of `pdk:theme_pdk_codelist_bygberegnaf_v`) and is REFUSED because PRYZM does
// not hold the property boundary — and named that a CREDENTIAL blocker (Datafordeler MAT 401).
//
// Re-probed 2026-09-04: `https://api.dataforsyningen.dk/jordstykker` (DAWA — Klimadatastyrelsen's
// keyless address/cadastre API, already the fallback in `server/jurisdiction/dkMatrikelProxy.js`
// and registered as `dk-dawa-jordstykker` in `sourceRegistry/dk.ts`) returns, for a point, the
// jordstykke POLYGON plus `bfenummer` (BFE = the SamletFastEjendom the parcel belongs to),
// `sfeejendomsnr`, `registreretareal`, `vejareal`, `matrikelnr`, `ejerlavkode` — and it accepts
// `?bfenummer=<n>`, returning EVERY jordstykke of that ejendom. HTTP 200, no key. (Copenhagen
// probe: ejerlav 2000179 matrikel 7000q, BFE 100058855, registreretareal 64 981 m².)
//
// So the ejendom boundary is the UNION of the jordstykker sharing a BFE, and the ejendom AREA is
// the SUM of their registered areas — both from a keyless state service. The Datafordeler
// credential still gates MAT/BBR/GeoDanmark/DHM proper (re-probed 2026-09-04: 404/403/503/403
// anonymously), but the D3 unlock does not need it. Round one's claim was stale-PESSIMISTIC — the
// same defect class CLAUDE.md documents against itself.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS MODULE DOES — pure arithmetic over published facts, and one honest non-derivation
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Given the jordstykker of one BFE, it computes the ejendom's registered area and decides what an
// ejendom-scoped bebyggelsesprocent means for THIS parcel:
//   · ONE jordstykke on the BFE  → the ejendom IS the parcel; ejendom-scope and parcel-scope
//                                  coincide; FAR × area is a per-parcel GFA. The common case.
//   · SEVERAL jordstykker        → the GFA budget is pct × Σ area for the WHOLE property, shared
//                                  across its parcels. The per-parcel share is NOT a legal fact and
//                                  is not derived; the property-level budget is stated as such.
//
// ⚠ NOT ENCODED, BY NAME: BR18's rule on which parts of the grund count (road areas in particular)
// is not applied here — `registreretareal` and `vejareal` are both carried so a consumer can see
// them, and `netAreaRule` says 'not-encoded'. Encoding it would be asserting a beregningsregel this
// lane did not verify. Geometry UNION stays with the engine (P5); this module sums AREAS.
//
// PURE (C58 §1.9). Deterministic. Emits the shared `RuleState` vocabulary against **D1**.

import type { RuleState } from '@pryzm/schemas';

/** One DAWA `jordstykke` as this module reads it (GeoJSON `properties` or the JSON row). */
export interface DkJordstykke {
    readonly bfenummer?: unknown;
    readonly registreretareal?: unknown;
    readonly vejareal?: unknown;
    readonly matrikelnr?: unknown;
    readonly ejerlavkode?: unknown;
    readonly featureid?: unknown;
}

export const DK_DAWA_JORDSTYKKER_SOURCE = Object.freeze({
    id: 'dk-dawa-jordstykker',
    url: 'https://api.dataforsyningen.dk/jordstykker',
    keyless: true,
    probedAt: '2026-09-04',
    supports: ['?x=&y= (point)', '?bfenummer= (all jordstykker of one ejendom)'],
    fields: ['bfenummer', 'sfeejendomsnr', 'registreretareal', 'vejareal', 'matrikelnr', 'ejerlavkode', 'geometry'],
} as const);

function posNum(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number.parseFloat(String(v));
    return Number.isFinite(n) && n > 0 ? n : null;
}
function nonNegNum(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number.parseFloat(String(v));
    return Number.isFinite(n) && n >= 0 ? n : null;
}
function intOf(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10);
    return Number.isInteger(n) && n > 0 ? n : null;
}

export type DkEjendomJoin =
    | {
          readonly kind: 'joined';
          readonly bfe: number;
          readonly jordstykkeCount: number;
          /** Σ `registreretareal` over the BFE's jordstykker, m². */
          readonly registreretArealM2: number;
          /** Σ `vejareal`, m², or null when any jordstykke lacks the field. Carried, not applied. */
          readonly vejArealM2: number | null;
          readonly matrikler: readonly string[];
          /** TRUE iff the ejendom consists of exactly one jordstykke. */
          readonly ejendomIsSingleParcel: boolean;
          readonly netAreaRule: 'not-encoded';
      }
    | { readonly kind: 'no-jordstykker-for-bfe'; readonly bfe: number }
    | { readonly kind: 'mixed-bfe-input'; readonly bfe: number; readonly foreignBfes: readonly number[] }
    | { readonly kind: 'area-missing'; readonly bfe: number; readonly matriklerWithoutArea: readonly string[] };

/** Join the jordstykker of one BFE into the ejendom's area facts. Pure and total. */
export function joinDkEjendom(jordstykker: readonly DkJordstykke[], bfe: number): DkEjendomJoin {
    const foreign = new Set<number>();
    const mine: DkJordstykke[] = [];
    for (const j of jordstykker) {
        const b = intOf(j.bfenummer);
        if (b === bfe) mine.push(j);
        else if (b !== null) foreign.add(b);
    }
    if (foreign.size > 0) return { kind: 'mixed-bfe-input', bfe, foreignBfes: Object.freeze([...foreign].sort((a, b) => a - b)) };
    if (mine.length === 0) return { kind: 'no-jordstykker-for-bfe', bfe };

    const matrikler: string[] = [];
    const missing: string[] = [];
    let areal = 0;
    let vej: number | null = 0;
    for (const j of mine) {
        const label = `${j.ejerlavkode ?? '?'}/${j.matrikelnr ?? '?'}`;
        matrikler.push(label);
        const a = posNum(j.registreretareal);
        if (a === null) {
            missing.push(label);
            continue;
        }
        areal += a;
        const v = nonNegNum(j.vejareal);
        vej = vej !== null && v !== null ? vej + v : null;
    }
    if (missing.length > 0) return { kind: 'area-missing', bfe, matriklerWithoutArea: Object.freeze(missing) };
    return {
        kind: 'joined',
        bfe,
        jordstykkeCount: mine.length,
        registreretArealM2: areal,
        vejArealM2: vej,
        matrikler: Object.freeze(matrikler),
        ejendomIsSingleParcel: mine.length === 1,
        netAreaRule: 'not-encoded',
    };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Applying an ejendom-scoped bebyggelsesprocent
// ──────────────────────────────────────────────────────────────────────────────────────────────

export type DkEjendomBebygpctResolution =
    /** 🟢 the ejendom is this one parcel — the scopes coincide; a per-parcel GFA. */
    | { readonly kind: 'per-parcel-usable'; readonly bfe: number; readonly pct: number; readonly arealM2: number; readonly gfaM2: number }
    /** 🟡 the property spans several parcels — a SHARED budget; per-parcel share not derived. */
    | {
          readonly kind: 'ejendom-budget-shared';
          readonly bfe: number;
          readonly pct: number;
          readonly jordstykkeCount: number;
          readonly ejendomArealM2: number;
          readonly ejendomGfaBudgetM2: number;
      }
    /** ⚫ the join did not produce an area. */
    | { readonly kind: 'ejendom-unresolved'; readonly join: Exclude<DkEjendomJoin, { kind: 'joined' }> }
    | { readonly kind: 'pct-invalid'; readonly raw: unknown };

/** Resolve what an `ejendom`-scoped bebyggelsesprocent yields for the parcel. Pure and total. */
export function resolveDkEjendomScopedBebygpct(opts: {
    readonly bebygpct: unknown;
    readonly join: DkEjendomJoin;
}): DkEjendomBebygpctResolution {
    const pct = posNum(opts.bebygpct);
    if (pct === null) return { kind: 'pct-invalid', raw: opts.bebygpct };
    const j = opts.join;
    if (j.kind !== 'joined') return { kind: 'ejendom-unresolved', join: j };
    if (j.ejendomIsSingleParcel) {
        return { kind: 'per-parcel-usable', bfe: j.bfe, pct, arealM2: j.registreretArealM2, gfaM2: (pct / 100) * j.registreretArealM2 };
    }
    return {
        kind: 'ejendom-budget-shared',
        bfe: j.bfe,
        pct,
        jordstykkeCount: j.jordstykkeCount,
        ejendomArealM2: j.registreretArealM2,
        ejendomGfaBudgetM2: (pct / 100) * j.registreretArealM2,
    };
}

/**
 * Project onto `RuleState` against **D1** (floor-area limit — bebyggelsesprocent is a FAR, BR18).
 *
 *   per-parcel-usable      → `resolved`, unit `m2`, reachability `derivable`
 *   ejendom-budget-shared  → `resolved`, unit names the SCOPE explicitly ("m2 (ejendom GFA budget,
 *                            shared across N jordstykker)") so a consumer cannot read it per-parcel
 *   ejendom-unresolved     → `unrecovered` / `inaccessible` (DAWA answers; a retry or a wider query
 *                            can complete the join) / mechanism `present`
 *   pct-invalid            → `unrecovered` / `semantic` / mechanism `unknown`
 */
export function dkEjendomBebygpctToRuleState(r: DkEjendomBebygpctResolution, ref: RuleState['ref']): RuleState {
    switch (r.kind) {
        case 'per-parcel-usable':
            return {
                rule: 'D1',
                status: 'resolved',
                reachability: 'derivable',
                value: r.gfaM2,
                unit: 'm2',
                datum: null,
                provenance: 'pipeline-extracted',
                ref,
            };
        case 'ejendom-budget-shared':
            return {
                rule: 'D1',
                status: 'resolved',
                reachability: 'derivable',
                value: r.ejendomGfaBudgetM2,
                unit: `m2 (ejendom GFA budget, BFE ${r.bfe}, shared across ${r.jordstykkeCount} jordstykker — not a per-parcel figure)`,
                datum: null,
                provenance: 'pipeline-extracted',
                ref,
            };
        case 'ejendom-unresolved':
            return {
                rule: 'D1',
                status: 'unrecovered',
                partial: null,
                reachability: 'derivable',
                failure: 'inaccessible',
                mechanism: 'present',
                stoppedAt: `BFE → ejendom join incomplete: ${r.join.kind} (DAWA /jordstykker?bfenummer=${r.join.bfe})`,
                ref,
            };
        case 'pct-invalid':
            return {
                rule: 'D1',
                status: 'unrecovered',
                partial: null,
                reachability: 'source-complete',
                failure: 'semantic',
                mechanism: 'unknown',
                stoppedAt: `bebygpct "${String(r.raw)}" is not a positive number`,
                ref,
            };
    }
}
