// L-449 SIGNED (2026-07-30) — Denmark (Plandata.dk) PLANDATA → buildable-envelope RULE PACK.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS — the founder-signed legal mapping, as executable code
// ═════════════════════════════════════════════════════════════════════════════════════════════
// Denmark publishes its planning envelope as first-class, machine-readable WFS attributes on the
// adopted-plan features at geoserver.plandata.dk (VERIFIED-LIVE 2026-07-23). L-449 signs the LEGAL
// MAPPING from those attributes to a buildable envelope, verified against the primary source BR18
// (bygningsreglementet.dk, §168–186):
//
//   maksbygningshojde  (WFS: `maxbygnhjd`)  → maxHeightM   (metres, direct passthrough).  Conf. 99%.
//   maksbebyggelsesprocent (WFS: `bebygpct`) → farRatio via  FAR = maksbebyggelsesprocent / 100.
//                        BR18 §168–186 defines *bebyggelsesprocent* as "etagearealets procentvise
//                        andel af grundens areal" = gross floor area ÷ site area × 100. That IS a
//                        floor-area ratio expressed as a percentage. So 40 % → FAR 0,40; 120 % → 1,20.
//   maxetager          (WFS: `maxetager`)   → maxStoreys   (floored to an int — never over-stated).
//
// The WFS SHORT NAMES (`bebygpct` / `maxbygnhjd` / `maxetager`) are what the ingestion actually emits
// (server/plandataZoningProxy.js, providers/mapPlandataToZoningRecord.ts, verified against the
// DescribeFeatureType) — NOT the long legal names. This module consumes the emitted names.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ THE CRITICAL LEGAL CAVEAT — bebyggelsesprocent DENOMINATOR SCOPE (a HARD requirement)
// ═════════════════════════════════════════════════════════════════════════════════════════════
// `bebyggelsesprocent` is a RATIO, and BR18 (and Plandata's own guidance) make its DENOMINATOR
// legally VARIABLE. The same 40 % means three different things depending on what it is computed over:
//
//   • 'parcel'       — the individual matrikel (grundens areal). FAR × parcelArea is a valid GFA.
//   • 'property'     — the individual ejendom (which may be SEVERAL matrikler). The floor-area budget
//                      is FAR × propertyArea, distributed across the property's parcels — applying it
//                      to ONE parcel's area over- or under-states, and PRYZM does not hold the
//                      property boundary. So it is NOT a per-parcel FAR.
//   • 'planningArea' — the plan area *som helhed*. A 40 % "whole-area" value is emphatically NOT 40 %
//                      per lot; the area's floor-area budget is shared, and per-lot density is unknown.
//
// Ignoring the scope and treating every bebyggelsesprocent as a parcel-FAR is the exact
// §CONTEXT-DATA-HONESTY "envelope-overstates-on-partial-data" failure class (memory:
// envelope-solid-overstates-partial-data). So this module models an EXPLICIT `densityScope` and:
//
//   PARCEL scope            → farRatio = pct/100  (a real number the envelope may use).
//   PROPERTY / PLANNINGAREA → farRatio = null, WITHHELD with a cited reason. Height + storeys still
//                             pass through (they are absolute caps, scope-independent).
//   UNKNOWN scope (null)    → farRatio = null, WITHHELD. Assuming 'parcel' when the scope field was
//                             not ingested would be the silent mis-scaling this caveat exists to stop.
//
// WHERE THE FAR DENOMINATOR IS CHOSEN (and why WITHHOLDING is how scope is honoured today).
// The buildable-envelope solid multiplies FAR by the PARCEL area — see
// `farLimitedHeight.ts::computeFarLimitedHeight` (`maxGFA = maxFAR * parcelAreaM2`), consumed by
// `ZoningRulesEngine.computeBuildableEnvelope`. That denominator is HARDWIRED to the parcel and the
// engine is jurisdiction-agnostic (C58 §1.5 — it must carry no DK-specific branch). So the ONLY
// FAR value that is correct to feed it is a PARCEL-scoped one. This pack therefore emits
// `plotRatioFAR` ONLY at parcel scope; for property/planningArea/unknown it emits `null`, so FAR
// does not bind and the volume is honestly under-stated rather than confidently over-stated. A
// TODO at `farLimitedHeight.ts` marks the denominator site for the day the engine grows a real
// scope parameter (then property scope could denominate by property area, planningArea could refuse
// with the shared-budget reason). Until then: parcel-only produces a number.
//
// PURITY: L2-pure (C58 §1.9) — no I/O, no THREE, no DOM, no clock. Pure data + arithmetic.
// Validated against the L0 schema at pack build (a malformed pack throws at build, never silently).
//
// Strategic context — C58 §1.2/§1.4/§1.6/§2.2, ADR-0269, L-449, BR18 §168–186,
// docs/04-reference/jurisdictions/dk/dk-PLANDATA-ENVELOPE-MAPPING.md.

import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
    type ZoningRule,
} from '@pryzm/schemas';

/** The DK national jurisdiction id — equal to the `jurisdictionId` the DK ZoningRecord already
 *  carries (`providers/mapPlandataToZoningRecord.ts`), so the registry registration and the live
 *  structured record name the same jurisdiction. */
export const DK_PLANDATA_JURISDICTION_ID = 'dk';

/** The WFS short attribute names the Plandata ingestion emits (verified against DescribeFeatureType,
 *  used by `mapPlandataToZoningRecord.ts` + `server/plandataZoningProxy.js`). Named so a reader never
 *  has to guess whether the code keys on the legal long name or the emitted short name. */
export const DK_PLANDATA_FIELD = Object.freeze({
    /** maksbebyggelsesprocent — bebyggelsesprocent (FAR × 100). */
    bebyggelsesprocent: 'bebygpct',
    /** maksbygningshojde — maks. bygningshøjde (m). */
    maxHeight: 'maxbygnhjd',
    /** maxetager — maks. antal etager. */
    maxStoreys: 'maxetager',
} as const);

/**
 * The legally-variable DENOMINATOR of a `bebyggelsesprocent` (the caveat above). A CLOSED union —
 * BR18/Plandata recognise exactly these three computation bases. `null` (in a resolution) means the
 * scope was not encoded/ingested, which is treated as NOT parcel-confirmed (FAR withheld).
 */
export type DkDensityScope = 'parcel' | 'property' | 'planningArea';

/**
 * Parse Plandata's *bebyggelsesprocent beregningsgrundlag* (the scope of the density ratio) onto the
 * closed `DkDensityScope` union. Deterministic keyword match on the Danish phrasing.
 *
 * ⚠ PROBE-DON'T-ASSUME: the ingestion does not YET emit a scope attribute (the current mapper reads
 * only `bebygpct`), so the exact WFS field name must be confirmed at wiring time against the
 * DescribeFeatureType (candidate: the beregningsgrundlag/afgrænsning attribute on the ramme/lokalplan
 * feature). This parser handles the documented value phrasings so it is ready the moment the field is
 * wired; until then callers pass the scope explicitly (or `null` → withheld).
 *
 * Returns `null` for an absent/unrecognised value — NEVER a guessed 'parcel' (that would be the
 * silent mis-scaling the densityScope caveat forbids). Order matters: the whole-area phrasing is
 * tested first because "området som helhed" contains neither *ejendom* nor *matrikel*.
 */
export function parseDkDensityScope(raw: string | null | undefined): DkDensityScope | null {
    if (typeof raw !== 'string') return null;
    const t = raw.toLowerCase().trim();
    if (t.length === 0) return null;
    // planningArea — "området som helhed" / "området under ét" / "samlet" / "helhed".
    if (
        t.includes('område') ||
        t.includes('omraade') ||
        t.includes('helhed') ||
        t.includes('samlet') ||
        t.includes('under ét') ||
        t.includes('under et')
    ) {
        return 'planningArea';
    }
    // property — "den enkelte ejendom".
    if (t.includes('ejendom')) return 'property';
    // parcel — "det enkelte matrikelnummer" / "grunden" / "grundens areal".
    if (t.includes('matrik') || t.includes('grund')) return 'parcel';
    return null;
}

/**
 * LANE DK (E1 verdict §G DK-parallel, 2026-09-01) — the SERVED denominator code →
 * the L-449 `DkDensityScope`. Plandata serves the bebyggelsesprocent denominator as the
 * CODED attribute `bebygpctaf` (codelist `pdk:theme_pdk_codelist_bygberegnaf_v`, imported
 * verbatim at L0 in `@pryzm/schemas` `vocabularies/dk.ts` — lane 2 §DK-2, probed
 * 2026-08-31). Mapping the code onto a computation scope is ADAPTER semantics (L-664:
 * no mapping table at L0), and THIS package is that adapter — so the one mapping lives
 * here, beside the L-449 signed scope machinery it feeds:
 *
 *   1 "Omraadet som helhed"      → 'planningArea'  (the plan area as a whole — the Aarhus
 *                                   af=1 trap: a naive per-parcel multiply is WRONG)
 *   2 "Den enkelte ejendom"      → 'property'      (the ejendom may span several matrikler)
 *   3 "Den enkelte grund"        → 'parcel'        (grundens areal — the BR18 §168–186 basis
 *                                   `parseDkDensityScope` already signs as parcel scope)
 *   4 "Det enkelte jordstykke"   → 'parcel'        (the individual cadastral parcel — the
 *                                   Noerrebro af=4 case: FAR × parcelArea is valid)
 *
 * Returns `null` for absent/unrecognised input — NEVER a guessed 'parcel' (a fifth code is
 * a national schema change and must surface as UNKNOWN scope → FAR withheld, not be
 * absorbed; `vocabularies/dk.ts` doctrine).
 */
export function dkDensityScopeFromBygberegnaf(raw: unknown): DkDensityScope | null {
    const code =
        typeof raw === 'number' && Number.isInteger(raw)
            ? raw
            : typeof raw === 'string' && /^[0-9]+$/.test(raw.trim())
              ? Number.parseInt(raw.trim(), 10)
              : null;
    if (code === 1) return 'planningArea';
    if (code === 2) return 'property';
    if (code === 3 || code === 4) return 'parcel';
    return null;
}

/** Coerce a raw WFS value to a positive finite number, else null (honest absence). This is the
 *  SINGLE coercion for DK plan numbers: `mapPlandataToZoningRecord.ts` used to carry a twin and
 *  now delegates to `resolveDkPlanEnvelope` instead, so "what counts as no number" is decided
 *  once (LANE DK 2026-09-01; the twin was how the FAR branch drifted out of this signed pack). */
function posNumberOrNull(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number.parseFloat(String(v));
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
}

/** The raw Plandata fields this pack consumes (WFS short names + the scope + identity). */
export interface DkPlanFields {
    /** `bebygpct` — bebyggelsesprocent (FAR × 100). number | numeric string | null. */
    readonly bebyggelsesprocent?: number | string | null;
    /** `maxbygnhjd` — maks. bygningshøjde (m). */
    readonly maxHeightM?: number | string | null;
    /** `maxetager` — maks. antal etager. */
    readonly maxStoreys?: number | string | null;
    /**
     * The bebyggelsesprocent DENOMINATOR SCOPE. Either the already-parsed union, or a raw
     * beregningsgrundlag string (parsed here), or null/absent (→ withheld). ⚠ HARD requirement per
     * L-449: this MUST be honoured, not just stored.
     */
    readonly densityScope?: DkDensityScope | string | null;
    /** Plan name / label, carried into facts + the pack zone label. */
    readonly zoneLabel?: string | null;
    /** The governing plan document link (`doklink`) — the C58 §1.3 citation. */
    readonly doklink?: string | null;
}

/** Why the FAR (plot ratio) could not be stated as a per-parcel number, if it could not. */
export type DkFarWithheldReason =
    /** bebyggelsesprocent is computed over the individual ejendom, not the matrikel — a property may
     *  span several parcels, so FAR × parcelArea is not the property's per-parcel density. */
    | 'scope-property'
    /** bebyggelsesprocent is computed over the plan area *som helhed* — a whole-area value is not a
     *  per-lot allowance; the floor-area budget is shared and per-lot density is unknown. */
    | 'scope-planning-area'
    /** the density-scope was not encoded/ingested — treated as NOT parcel-confirmed (assuming parcel
     *  would silently mis-scale). Wire the beregningsgrundlag attribute to resolve. */
    | 'scope-unknown'
    /** the plan published no bebyggelsesprocent at all (no ratio to state). */
    | 'no-bebyggelsesprocent';

/**
 * The resolved DK planning envelope — the `{ farRatio, maxHeightM, maxStoreys, densityScope }` the
 * signed mapping produces, plus honesty metadata. NEVER throws; a missing/scoped input yields a
 * `null` field with a stated reason, never a fabricated number.
 */
export interface DkPlanEnvelopeResolution {
    /** FAR = pct/100, present ONLY when `densityScope === 'parcel'`. Null (withheld) otherwise. */
    readonly farRatio: number | null;
    /** The raw bebyggelsesprocent (pct), ALWAYS carried as a FACT even when `farRatio` is withheld —
     *  a consumer may show "bebyggelsesprocent 40 % (whole-area — not a per-lot FAR)". */
    readonly bebyggelsesprocent: number | null;
    /** maks. bygningshøjde (m). Scope-independent — always passed through when published. */
    readonly maxHeightM: number | null;
    /** maks. antal etager (floored int). Scope-independent — always passed through when published. */
    readonly maxStoreys: number | null;
    /** The resolved density scope, or null when unknown/unencoded. */
    readonly densityScope: DkDensityScope | null;
    /** TRUE when a bebyggelsesprocent exists but its FAR was WITHHELD on scope grounds. */
    readonly farWithheld: boolean;
    /** The withhold reason, or null when FAR is either usable (parcel) or genuinely absent. */
    readonly farWithheldReason: DkFarWithheldReason | null;
    /** Human derivation for the facts/derivation row. */
    readonly why: string;
    /** Conditions the mapping imposes that a consumer must state. */
    readonly caveats: readonly string[];
}

/** The primary-source citation carried on every DK envelope value. */
export const DK_BR18_ENVELOPE_REF =
    'bebyggelsesprocent → FAR = bebyggelsesprocent / 100, per BR18 (bygningsreglementet.dk §168–186): ' +
    'bebyggelsesprocent = "etagearealets procentvise andel af grundens areal" (gross floor area ÷ ' +
    'site area × 100). maks. bygningshøjde (maxbygnhjd) → height (m); maks. antal etager (maxetager) ' +
    '→ storeys. Numbers are published-structured WFS attributes from geoserver.plandata.dk (the ' +
    'Danish national plan register, Erhvervsstyrelsen). ⚠ The FAR denominator scope ' +
    '(bebyggelsesprocent beregningsgrundlag: parcel / property / planning-area) is legally variable ' +
    'and is honoured — FAR is stated ONLY at parcel scope. L-449 SIGNED 2026-07-30; see ' +
    'docs/04-reference/jurisdictions/dk/dk-PLANDATA-ENVELOPE-MAPPING.md.';

/**
 * Resolve the DK buildable envelope from Plandata fields under the L-449 signed mapping.
 *
 * PURE, deterministic, never throws. The whole point of the `densityScope` branch is that a FAR is
 * produced ONLY when it is a genuine per-parcel ratio; every other scope withholds the number (with
 * a cited reason) rather than mis-scale the envelope.
 */
export function resolveDkPlanEnvelope(fields: DkPlanFields): DkPlanEnvelopeResolution {
    const pct = posNumberOrNull(fields.bebyggelsesprocent);
    const maxHeightM = posNumberOrNull(fields.maxHeightM);
    const etager = posNumberOrNull(fields.maxStoreys);
    // maxetager may be a decimal in the source (e.g. "3.5" incl. an attic); floor to an int —
    // conservative, never over-stated (same rule as the structured mapper).
    const maxStoreys = etager !== null ? Math.floor(etager) : null;

    // Accept EITHER a pre-parsed union literal (the caller already resolved the scope) OR a raw
    // Danish beregningsgrundlag string (parsed here). A bare `null`/absent → unknown → withheld.
    const rawScope = fields.densityScope;
    const densityScope: DkDensityScope | null =
        rawScope === 'parcel' || rawScope === 'property' || rawScope === 'planningArea'
            ? rawScope
            : typeof rawScope === 'string'
              ? parseDkDensityScope(rawScope)
              : rawScope ?? null;

    const caveats: string[] = [];

    // ── The FAR / density-scope branch — the HARD requirement. ───────────────────────────────
    let farRatio: number | null = null;
    let farWithheld = false;
    let farWithheldReason: DkFarWithheldReason | null = null;
    let farWhy: string;

    if (pct === null) {
        farWithheldReason = 'no-bebyggelsesprocent';
        farWhy = 'no bebyggelsesprocent published on this plan feature — no FAR to state';
    } else if (densityScope === 'parcel') {
        farRatio = pct / 100;
        farWhy =
            `bebyggelsesprocent ${pct} % over the individual matrikel (grundens areal) → ` +
            `FAR = ${pct}/100 = ${farRatio.toFixed(2)} (BR18 §168–186)`;
    } else {
        // property / planningArea / unknown → WITHHOLD. The pct rides on as a FACT.
        farWithheld = true;
        farWithheldReason =
            densityScope === 'property'
                ? 'scope-property'
                : densityScope === 'planningArea'
                  ? 'scope-planning-area'
                  : 'scope-unknown';
        farWhy =
            densityScope === 'property'
                ? `bebyggelsesprocent ${pct} % is computed over the whole ejendom (property), which ` +
                  "may span several matrikler — applying it to this parcel's area would mis-scale " +
                  'the density, so the FAR is WITHHELD (the pct is kept as a fact)'
                : densityScope === 'planningArea'
                  ? `bebyggelsesprocent ${pct} % is computed over the plan area som helhed — a ` +
                    'whole-area value is NOT a per-lot allowance (the floor-area budget is shared), ' +
                    'so the FAR is WITHHELD (the pct is kept as a fact)'
                  : `bebyggelsesprocent ${pct} % has no encoded denominator scope ` +
                    '(beregningsgrundlag not ingested); assuming per-parcel would risk silently ' +
                    'mis-scaling a whole-area value, so the FAR is WITHHELD until the scope is wired';
        caveats.push(
            'FAR withheld on density-scope grounds — bebyggelsesprocent ' +
                `${pct} % is ${
                    densityScope === 'property'
                        ? 'a whole-property ratio'
                        : densityScope === 'planningArea'
                          ? 'a whole-planning-area ratio'
                          : 'of unknown denominator scope'
                }, not a per-parcel FAR. Height and storeys are unaffected (absolute caps). ` +
                'Ignoring scope would over-state the envelope (§CONTEXT-DATA-HONESTY, L-449).',
        );
    }

    const heightTxt = maxHeightM === null ? 'not published' : `${maxHeightM} m`;
    const storeysTxt = maxStoreys === null ? 'not published' : String(maxStoreys);
    const why = `${farWhy}. height ${heightTxt}; storeys ${storeysTxt}.`;

    return {
        farRatio,
        bebyggelsesprocent: pct,
        maxHeightM,
        maxStoreys,
        densityScope,
        farWithheld,
        farWithheldReason,
        why,
        caveats,
    };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The pack builder — a PER-PARCEL resolved `JurisdictionZoningContract` that feeds
// `computeBuildableEnvelope` (mirrors `saRiyadhResolvedPack`).
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** A stable zone code for a resolved DK plan when the caller has no more specific one. */
export const DK_PLANDATA_DEFAULT_ZONE_CODE = 'DK-PLANDATA';

/**
 * Build a resolved DK rule pack for one parcel's plan fields. The single zone carries:
 *   • `plotRatioFAR` = farRatio  (present ONLY at parcel scope — null otherwise, withheld);
 *   • `maxHeight_m`  = the published height;
 *   • `maxFloors`    = the published storeys;
 * all stamped `published-structured` provenance (these are structured WFS numbers, not PDF
 * transcriptions). Passing this pack to `computeBuildableEnvelope` makes the engine's FAR-limited
 * massing bind by FAR × parcelArea ONLY when a real per-parcel FAR exists (density-scope honoured).
 *
 * PURE, deterministic. Re-parsed through the L0 schema so a malformed clone fails loudly.
 */
export function dkPlandataResolvedPack(
    fields: DkPlanFields,
    zoneCode: string = DK_PLANDATA_DEFAULT_ZONE_CODE,
    lastReviewedISO = '2026-07-30',
): { readonly pack: JurisdictionZoningContract; readonly resolution: DkPlanEnvelopeResolution } {
    const resolution = resolveDkPlanEnvelope(fields);
    const label =
        (fields.zoneLabel && fields.zoneLabel.trim().length > 0
            ? `Plandata.dk — ${fields.zoneLabel.trim()}`
            : 'Plandata.dk — adopted plan') +
        (resolution.farWithheld ? ' (FAR withheld — density scope)' : '');

    const zone: ZoningRule = {
        code: zoneCode,
        label,
        permittedUse: [],
        maxHeight_m: resolution.maxHeightM,
        maxFloors: resolution.maxStoreys,
        // ⚠ null (withheld) at property/planningArea/unknown scope — the whole densityScope point.
        plotRatioFAR: resolution.farRatio,
        // FAR ≠ coverage; Plandata's standard plan fields publish no separate coverage — honest null.
        maxCoverage: null,
        // Per-edge setbacks are a separate byggelinjer dataset — honest null.
        setbacks: { front_m: null, side_m: null, rear_m: null },
        // These are structured WFS numbers → published-structured (NOT ordinance-pdf).
        fieldProvenance: {
            ...(resolution.maxHeightM !== null ? { maxHeight: 'published-structured' as const } : {}),
            ...(resolution.maxStoreys !== null ? { maxFloors: 'published-structured' as const } : {}),
            ...(resolution.farRatio !== null ? { maxFAR: 'published-structured' as const } : {}),
        },
        ordinanceRef: fields.doklink ?? DK_BR18_ENVELOPE_REF,
        geometricRule: null,
    };

    const pack = JurisdictionZoningContractSchema.parse({
        jurisdictionId: DK_PLANDATA_JURISDICTION_ID,
        displayName: 'Denmark — Plandata.dk buildable envelope (BR18 §168–186, L-449 signed)',
        source: 'plandata-dk',
        crs: 'EPSG:25832',
        lastReviewed: lastReviewedISO,
        defaultConfidence: 'structured',
        zones: [zone],
    });

    return { pack, resolution };
}
