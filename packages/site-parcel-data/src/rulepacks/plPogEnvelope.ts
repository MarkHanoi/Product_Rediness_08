// LANE PL-POG (2026-09-03) — POLAND (PL) · POG APP GML 2.0 `app:StrefaPlanistyczna` planning-zone
// parameters → buildable-envelope CONTRIBUTION SCALARS. The COMPILE half of the census's Type-B
// verdict for Poland (CENSUS.md row 23; §STR-EUROPEAN-ENVELOPE-SOURCES §9 "P2 authoritative
// machine-readable parameters — COMPILE"). This is the DK `dkPlandataEnvelope.ts` pattern applied
// to Poland: the state publishes envelope numbers as first-class data, and this module signs the
// mapping from those numbers to the `computeBuildableEnvelope` scalar-cap path — WITH the honest
// denominator withholding that makes the Polish case never over-state.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS — and what it is NOT
// ═════════════════════════════════════════════════════════════════════════════════════════════
// Poland's 2023 planning reform (ustawa z dnia 7 lipca 2023 r., Dz.U. 2023 poz. 1688) added the
// `plan ogólny gminy` (POG) and its national APP GML 2.0 schema. Every `app:StrefaPlanistyczna`
// (planning zone) carries FOUR published numeric ceilings, national-MANDATORY, versioned:
//
//   maksWysokoscZabudowy                    → max building HEIGHT (gml:LengthType, uom MANDATORY)
//   maksNadziemnaIntensywnoscZabudowy       → max above-ground FAR (intensywność, decimal)
//   maksUdzialPowierzchniZabudowy           → max building COVERAGE (udział, %)
//   minUdzialPowierzchniBiologicznieCzynnej → min GREEN share (powierzchnia biol. czynna, %)
//
// This module COMPILES those four into an envelope-contribution resolution, EACH carrying its APP
// citation (plan IIP identity + version + the reform statutory basis). It does NOT re-parse XML
// (the parser is `parsers/appGml/`), does NOT decide typology, and does NOT compute a solid — it
// feeds the EXISTING `computeBuildableEnvelope` via a `ZoningRecord.structuredFields`, exactly as
// DK Plandata does through `mapPlandataToZoningRecord`. NO new engine.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ THE CRITICAL HONESTY BRANCH — the DZIAŁKA BUDOWLANA DENOMINATOR (never-overstate, C63)
// ═════════════════════════════════════════════════════════════════════════════════════════════
// FAR (intensywność) and COVERAGE (udział powierzchni zabudowy) are RATIOS, and their statutory
// denominator is *powierzchnia działki budowlanej* — the BUILDABLE PLOT (upzp art. 2 pkt 12), a
// planning concept that is NOT the same object as the cadastral *działka ewidencyjna* the ULDK
// parcel leg serves. The buildable plot may exclude parts of the cadastral parcel (road reserves,
// easements) or combine several. So:
//
//   • `computeBuildableEnvelope` multiplies FAR × parcelRing area (`farLimitedHeight.ts`) and
//     COVERAGE × parcelRing area (the occupation cap). Feeding a POG FAR/coverage into that path
//     denominates them on the CADASTRAL parcel — and where the buildable plot is smaller, that
//     OVER-states the footprint / GFA on real land. That is precisely the C63 Aarhus denominator
//     trap (`bebygpct=180, af=1` → wrong GFA while every field parses clean), restated for Poland.
//   • The PL country adapter already REFUSES development potential for exactly this reason
//     (`PL_CHAIN_GRADES.DP`: "computing GFA from FAR × cadastral parcel area would be the C63
//     denominator trap").
//
// So this module BINDS ONLY the denominator-free axis — HEIGHT (an absolute metric cap, true of
// any building in the strefa regardless of plot) — and WITHHOLDS FAR and COVERAGE from the binding
// multiply, carrying each as a CITED FACT with the withhold reason. Min-green is carried as a fact
// (it would only TIGHTEN the envelope; presenting it as a coverage relaxation would over-state).
//
// THE FLIP POINT (mirrors DK's densityScope flip): the day the działka-budowlana denominator is
// resolved (a served buildable-plot geometry, or a per-plan rule), FAR and COVERAGE can move from
// `withheld` to binding — one branch here changes, and the grade improves visibly, rather than the
// module being silently rewritten.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ THE RANGE GATE — an out-of-range or non-metre height is REFUSED, never compiled into a cap
// ═════════════════════════════════════════════════════════════════════════════════════════════
// `maksWysokoscZabudowy` is gml:LengthType: the uom is MANDATORY and is NOT assumed to be metres.
// A height binds ONLY when (a) its uom resolves to metres AND (b) its value is a finite number in
// the plausibility band (0, PL_POG_HEIGHT_MAX_M]. A non-metre uom, a non-positive value, or a value
// past the band (a units-confusion artefact — cm/mm mis-served, or a corrupt export) is WITHHELD
// with a named reason. Withholding under-states (the safe direction); it never emits a wrong cap.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ LEGAL FORCE — a DRAFT act's numbers are compiled, but never presented as in force
// ═════════════════════════════════════════════════════════════════════════════════════════════
// The APP `status` element (INSPIRE ProcessStepGeneralValue) says whether the act is `legalForce`
// or a draft (`elaboration`/`adoption`). The official ministry sample is `elaboration` throughout —
// a DRAFT — so its ceilings are compiled with a caveat that they are NOT in force on any date. The
// scalar is still the plan's stated number; the caveat is what keeps it from reading as a
// determination (mirrors the country adapter's R3 `plValidity`).
//
// PURITY: L2-pure (C58 §1.9) — no I/O, no THREE, no DOM, no clock. Pure data + arithmetic.
// Re-parsed through the L0 `ZoningRecordSchema` at record build (a malformed clone throws at build).
//
// Strategic context — CENSUS.md row 23 + TOP-10 #2; STR-EUROPEAN-ENVELOPE-SOURCES §9;
// C58 §1.2/§1.4/§1.6; the PL country adapter (`countryAdapters/pl/`, E6-PL); ADR-0377 (datum);
// memory: envelope-solid-overstates-partial-data, c63-denominator-is-buildable-land.

import {
    ZoningRecordSchema,
    fetchTransient,
    type FetchOutcome,
    type ZoningRecord,
} from '@pryzm/schemas';
import type { AppMeasure, AppDecimal, AppStrefaPlanistyczna } from '../parsers/appGml/index.js';
// ONE authority per concept (C84 EI-9): the statutory basis + the source id + the in-force code
// live in the PL country adapter's rule leg. Imported from the LEAF files, never the
// `countryAdapters/pl/index.js` barrel (§SCC-no-barrel-access-at-module-load).
import { PL_APP_GML_SOURCE_ID } from '../countryAdapters/pl/plSources.js';
import {
    PL_ACT_STATUS_IN_FORCE,
    PL_VALUE_BASIS_SCHEME,
    plCodeTail,
    plIipIdentity,
} from '../countryAdapters/pl/plRuleMapper.js';

/** The national jurisdiction id — equal to the id the PL parcel/rules leg already carries. */
export const PL_POG_JURISDICTION_ID = 'pl';

/** A stable zone code when a strefa serves no `symbol` (should not happen; XSD minOccurs=1). */
export const PL_POG_DEFAULT_ZONE_CODE = 'PL-POG';

/**
 * THE RANGE GATE plausibility band for `maksWysokoscZabudowy` (metres). Open lower bound (a
 * non-positive height is not a cap); the upper bound is generous — well above any conceivable POG
 * ceiling (the tallest Polish building, Varso Tower, is ~310 m) so it never false-refuses a real
 * value, while still catching a units-confusion artefact (a cm/mm mis-serve, 4 500 for 45 m).
 */
export const PL_POG_HEIGHT_MAX_M = 1000;

/**
 * The uom spellings this module accepts as METRES. gml:LengthType carries the uom verbatim; the
 * official sample serves `uom="m"`. A uom NOT in this set is treated as a non-metre unit and the
 * height is WITHHELD (never silently coerced — the Madrid EPSG:4326 silent-zero class of defect).
 */
export const PL_POG_METRE_UOMS: ReadonlySet<string> = new Set(['m', 'metre', 'meter', 'metres', 'meters']);

/**
 * The reform statutory basis carried on every compiled POG scalar (F2/F3 — the reform legal basis
 * the brief requires). `pl-upzp-2003` is the statute the APP schema cites by name; the POG strefa
 * parameters were added by the 2023 reform.
 */
export const PL_POG_ENVELOPE_REF =
    'POG (plan ogólny gminy) strefa-planistyczna ceilings, published as APP GML 2.0 ' +
    '`app:StrefaPlanistyczna` attributes (schemat aplikacyjny planowaniePrzestrzenne 2.0, ' +
    'Ministerstwo Rozwoju i Technologii). Statutory basis: ustawa z dnia 27 marca 2003 r. o ' +
    'planowaniu i zagospodarowaniu przestrzennym (upzp), art. 13e — the plan-ogólny strefa ' +
    'parameters added by the 2023 reform (ustawa z dnia 7 lipca 2023 r., Dz.U. 2023 poz. 1688). ' +
    'HEIGHT is an absolute metric cap and BINDS; FAR (intensywność) and COVERAGE (udział ' +
    'powierzchni zabudowy) are ratios over the *działka budowlana* (buildable plot, upzp art. 2 ' +
    'pkt 12), which is NOT the cadastral działka ewidencyjna — so they are WITHHELD from the ' +
    'binding multiply (C63 denominator), carried as facts.';

/** The APP source id every compiled POG scalar cites (resolves in the PL source registry leg). */
export const PL_POG_SOURCE_ID = PL_APP_GML_SOURCE_ID;

/* ───────────────────────────── the compile input ──────────────────────── */

/**
 * The raw POG numeric ceilings this module consumes — either extracted from an
 * `app:StrefaPlanistyczna` (see `plPogFieldsFromStrefa`) or supplied directly (a recorded fixture).
 * Percentages are the served decimals (e.g. `50.0` for 50 %), NOT fractions.
 */
export interface PlPogFields {
    /** `maksWysokoscZabudowy` value in the served uom, or null (absent). */
    readonly maxHeightValue: number | null;
    /** The served uom of the height (gml:LengthType) — MANDATORY when a value is present. */
    readonly maxHeightUom: string | null;
    /** `maksNadziemnaIntensywnoscZabudowy` (FAR, decimal), or null (absent). */
    readonly maxFar: number | null;
    /** `maksUdzialPowierzchniZabudowy` (coverage, PERCENT decimal e.g. 50.0), or null. */
    readonly maxCoveragePct: number | null;
    /** `minUdzialPowierzchniBiologicznieCzynnej` (green share, PERCENT decimal), or null. */
    readonly minGreenPct: number | null;
}

/** The APP citation context one strefa carries — the plan id + version + act status. */
export interface PlPogCitation {
    /** The plan's national IIP identity (`przestrzenNazw/lokalnyId`), or null when unresolved. */
    readonly planIdentity: string | null;
    /** The plan version (`wersjaId`), or null. */
    readonly planVersion: string | null;
    /** The act status code (INSPIRE ProcessStepGeneralValue), or null — gates the in-force claim. */
    readonly actStatus: string | null;
    /** The strefa designation (`oznaczenie`, e.g. `1SZ`) — the human object label. */
    readonly zoneDesignation: string;
    /** The strefa symbol (`symbol`, e.g. `SZ`) — the zone code. */
    readonly zoneSymbol: string;
    /** The strefa's own IIP identity, for the object-level citation. */
    readonly zoneIdentity: string | null;
}

/** Why a compiled scalar was WITHHELD from the binding envelope path (never a silent null). */
export type PlPogWithheldReason =
    /** the ratio's denominator is the działka budowlana, unresolved here (C63). Carried as a fact. */
    | 'denominator-dzialka-budowlana'
    /** the plan published no value for this element (minOccurs=0, absent). UNKNOWN, never 0. */
    | 'not-published'
    /** the height's uom is not metres — never coerced (gml:LengthType carries the uom). */
    | 'height-non-metre-uom'
    /** the height value is outside the plausibility band (units-confusion / corrupt export). */
    | 'height-out-of-range';

/**
 * The resolved POG envelope contribution — the four compiled scalars, each with its state (binds /
 * withheld-with-reason), plus the assembled citation and honesty metadata. NEVER throws.
 */
export interface PlPogEnvelopeResolution {
    /** HEIGHT (m) — BINDS. null when withheld (non-metre uom / out-of-range / not published). */
    readonly maxHeightM: number | null;
    readonly heightWithheldReason: PlPogWithheldReason | null;
    /** FAR — the compiled FACT (or null when not published). Never binds (denominator). */
    readonly maxFar: number | null;
    readonly farWithheldReason: PlPogWithheldReason | null;
    /** COVERAGE as a FRACTION [0,1] — the compiled FACT (pct/100). Never binds (denominator). */
    readonly maxCoverageFraction: number | null;
    /** The raw coverage PERCENT, carried verbatim as a fact even where the fraction is withheld. */
    readonly maxCoveragePct: number | null;
    readonly coverageWithheldReason: PlPogWithheldReason | null;
    /** MIN GREEN share (percent) — a fact; no engine slot (it only tightens). */
    readonly minGreenPct: number | null;
    /** TRUE only when the act status is the INSPIRE `legalForce` code. */
    readonly inForce: boolean;
    /** The assembled APP citation (plan id + version + reform basis) — on every scalar. */
    readonly citation: string;
    /** The value basis scheme + code the country adapter's rule leg cites (R2). */
    readonly valueBasis: { readonly scheme: string; readonly code: string };
    /** Human derivation for the facts row. */
    readonly why: string;
    /** Conditions a consumer MUST state — never silent. */
    readonly caveats: readonly string[];
}

/* ───────────────────────────── pure helpers ───────────────────────────── */

function finitePositiveOrNull(v: number | null | undefined): number | null {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
    return v;
}

/** Extract the raw POG ceilings from a parsed `app:StrefaPlanistyczna`. Pure, total. */
export function plPogFieldsFromStrefa(strefa: AppStrefaPlanistyczna): PlPogFields {
    const measure = (m: AppMeasure): { value: number | null; uom: string | null } =>
        m.kind === 'value' ? { value: m.value, uom: m.uom } : { value: null, uom: null };
    const decimal = (d: AppDecimal): number | null => (d.kind === 'value' ? d.value : null);
    const h = measure(strefa.maksWysokoscZabudowy);
    return {
        maxHeightValue: h.value,
        maxHeightUom: h.uom,
        maxFar: decimal(strefa.maksNadziemnaIntensywnoscZabudowy),
        maxCoveragePct: decimal(strefa.maksUdzialPowierzchniZabudowy),
        minGreenPct: decimal(strefa.minUdzialPowierzchniBiologicznieCzynnej),
    };
}

/** Extract the citation context from a parsed strefa + its resolved plan identity. Pure, total. */
export function plPogCitationFromStrefa(
    strefa: AppStrefaPlanistyczna,
    plan: { readonly planIdentity: string | null; readonly planVersion: string | null; readonly actStatus: string | null },
): PlPogCitation {
    return {
        planIdentity: plan.planIdentity,
        planVersion: plan.planVersion,
        actStatus: plan.actStatus,
        zoneDesignation: strefa.oznaczenie,
        zoneSymbol: strefa.symbol,
        zoneIdentity: plIipIdentity(strefa.idIIP),
    };
}

function assembleCitation(citation: PlPogCitation): string {
    const planPart =
        citation.planIdentity !== null
            ? `plan ${citation.planIdentity}${citation.planVersion !== null ? ` (wersja ${citation.planVersion})` : ''}`
            : 'plan identity UNRESOLVED (strefa carries no matched act in this document)';
    const zonePart =
        citation.zoneIdentity !== null
            ? `strefa ${citation.zoneDesignation} (${citation.zoneIdentity})`
            : `strefa ${citation.zoneDesignation}`;
    return `${zonePart} · ${planPart} · ${PL_POG_ENVELOPE_REF}`;
}

/* ───────────────────────────── the resolver ───────────────────────────── */

/**
 * Resolve the POG envelope contribution from a strefa's raw ceilings under the signed mapping.
 * PURE, deterministic, never throws. HEIGHT binds (metres + in range); FAR/COVERAGE are compiled
 * as facts but WITHHELD from binding (działka-budowlana denominator); min-green is a fact.
 */
export function resolvePlPogEnvelope(
    fields: PlPogFields,
    citation: PlPogCitation,
): PlPogEnvelopeResolution {
    const caveats: string[] = [];
    const inForce = citation.actStatus === PL_ACT_STATUS_IN_FORCE;

    // ── HEIGHT — the one binding axis, behind the range gate. ────────────────────────────────
    let maxHeightM: number | null = null;
    let heightWithheldReason: PlPogWithheldReason | null = null;
    const rawHeight = finitePositiveOrNull(fields.maxHeightValue);
    if (fields.maxHeightValue === null) {
        heightWithheldReason = 'not-published';
    } else if (fields.maxHeightUom === null || !PL_POG_METRE_UOMS.has(fields.maxHeightUom.trim().toLowerCase())) {
        heightWithheldReason = 'height-non-metre-uom';
        caveats.push(
            `maksWysokoscZabudowy served uom ${JSON.stringify(fields.maxHeightUom)} is not metres — ` +
                'height WITHHELD (gml:LengthType carries the uom; it is never coerced to metres)',
        );
    } else if (rawHeight === null || rawHeight > PL_POG_HEIGHT_MAX_M) {
        heightWithheldReason = 'height-out-of-range';
        caveats.push(
            `maksWysokoscZabudowy ${JSON.stringify(fields.maxHeightValue)} m is outside the ` +
                `plausibility band (0, ${PL_POG_HEIGHT_MAX_M}] — a units-confusion or corrupt value; ` +
                'height WITHHELD (the range gate) rather than compiled into a wrong cap',
        );
    } else {
        maxHeightM = rawHeight;
    }

    // ── FAR (intensywność) — compiled FACT, WITHHELD from binding (denominator). ──────────────
    const maxFar = finitePositiveOrNull(fields.maxFar);
    const farWithheldReason: PlPogWithheldReason | null =
        maxFar === null ? 'not-published' : 'denominator-dzialka-budowlana';
    if (maxFar !== null) {
        caveats.push(
            `maksNadziemnaIntensywnoscZabudowy ${maxFar} is a FACT but does NOT bind the envelope: ` +
                'its denominator is the działka budowlana (buildable plot), not the cadastral parcel — ' +
                'FAR × cadastral parcel area would over-state GFA (C63 denominator trap)',
        );
    }

    // ── COVERAGE (udział) — compiled FACT (pct→fraction), WITHHELD from binding (denominator). ─
    const maxCoveragePct = finitePositiveOrNull(fields.maxCoveragePct);
    const maxCoverageFraction = maxCoveragePct !== null ? maxCoveragePct / 100 : null;
    const coverageWithheldReason: PlPogWithheldReason | null =
        maxCoveragePct === null ? 'not-published' : 'denominator-dzialka-budowlana';
    if (maxCoveragePct !== null) {
        caveats.push(
            `maksUdzialPowierzchniZabudowy ${maxCoveragePct} % (fraction ${maxCoverageFraction}) is a ` +
                'FACT but does NOT bind the envelope: coverage is a share of the działka budowlana, ' +
                'not the cadastral parcel — coverage × cadastral parcel area would over-state the ' +
                'footprint where the buildable plot is smaller (C63 denominator trap)',
        );
    }

    // ── MIN GREEN — a fact (it only tightens; presenting it as a coverage relaxation would lie). ─
    const minGreenPct = finitePositiveOrNull(fields.minGreenPct);
    if (minGreenPct !== null) {
        caveats.push(
            `minUdzialPowierzchniBiologicznieCzynnej ${minGreenPct} % is a FACT and would only ` +
                'TIGHTEN the buildable footprint — carried informationally, never as a relaxation',
        );
    }

    if (!inForce) {
        const label = citation.actStatus === null ? 'no act status served' : citation.actStatus;
        caveats.push(
            `act status ${JSON.stringify(label)} is not ${PL_ACT_STATUS_IN_FORCE} — these ceilings ` +
                'are a DRAFT plan and answer NO point-in-time question; compiled, but not in force',
        );
    }

    const heightTxt =
        maxHeightM !== null ? `${maxHeightM} m (binds)` : `withheld (${heightWithheldReason})`;
    const farTxt = maxFar !== null ? `${maxFar} (fact, withheld)` : 'not published';
    const covTxt = maxCoveragePct !== null ? `${maxCoveragePct} % (fact, withheld)` : 'not published';
    const greenTxt = minGreenPct !== null ? `${minGreenPct} %` : 'not published';
    const why =
        `POG strefa ${citation.zoneDesignation} [${citation.zoneSymbol}] — height ${heightTxt}; ` +
        `FAR ${farTxt}; coverage ${covTxt}; min green ${greenTxt}; ` +
        `${inForce ? 'in force' : 'DRAFT (not in force)'}.`;

    return {
        maxHeightM,
        heightWithheldReason,
        maxFar,
        farWithheldReason,
        maxCoverageFraction,
        maxCoveragePct,
        coverageWithheldReason,
        minGreenPct,
        inForce,
        citation: assembleCitation(citation),
        // R2: the same value basis the country adapter's rule leg cites (art. 13e upzp-2003).
        valueBasis: { scheme: PL_VALUE_BASIS_SCHEME, code: 'art. 13e' },
        why,
        caveats,
    };
}

/* ───────────────────────────── the record builder ─────────────────────── */

/**
 * Build a `ZoningRecord` for one resolved POG strefa — the structured-provider shape
 * `computeBuildableEnvelope` consumes (the DK `mapPlandataToZoningRecord` analog). ONLY the binding
 * axis (HEIGHT) is placed in `structuredFields`; FAR and COVERAGE are deliberately ABSENT from the
 * numbers the engine multiplies (so the działka-budowlana denominator trap can never fire), and
 * ride on in the resolution + the `ordinanceRef` citation as facts. Setbacks stay null (POG serves
 * none — the building lines are a separate MPZP layer), so the engine stamps
 * `footprintIsUpperBound` (mechanism A, unknown ≠ 0).
 *
 * Re-parsed through the L0 schema so a malformed clone fails loudly. Pure, deterministic.
 */
export function plPogZoningRecord(
    fields: PlPogFields,
    citation: PlPogCitation,
): { readonly record: ZoningRecord; readonly resolution: PlPogEnvelopeResolution } {
    const resolution = resolvePlPogEnvelope(fields, citation);
    const facts: string[] = [];
    if (resolution.maxFar !== null) facts.push(`FAR ${resolution.maxFar} (withheld — denominator)`);
    if (resolution.maxCoveragePct !== null) {
        facts.push(`coverage ${resolution.maxCoveragePct} % (withheld — denominator)`);
    }
    if (resolution.minGreenPct !== null) facts.push(`min green ${resolution.minGreenPct} %`);
    const factsSuffix = facts.length > 0 ? ` · compiled facts NOT binding: ${facts.join('; ')}` : '';

    const record = ZoningRecordSchema.parse({
        zoneCode: citation.zoneSymbol.trim().length > 0 ? citation.zoneSymbol : PL_POG_DEFAULT_ZONE_CODE,
        zoneLabel:
            `POG strefa ${citation.zoneDesignation}` +
            (resolution.inForce ? '' : ' (DRAFT — not in force)'),
        jurisdictionId: PL_POG_JURISDICTION_ID,
        structuredFields: {
            // HEIGHT — the ONE binding scalar (null → the engine does not bind height either).
            maxHeight_m: resolution.maxHeightM,
            // FAR + COVERAGE are WITHHELD by OMISSION here — the whole denominator point. They are
            // present in `resolution` (facts) and in `ordinanceRef` (citation), never multiplied.
            // maxFloors: POG uses metres, not storeys — honest absence.
            setbacks: { front_m: null, side_m: null, rear_m: null },
        },
        ordinanceRef: `${resolution.citation}${factsSuffix}`,
        provenance: {
            source: PL_POG_SOURCE_ID,
            label: 'Poland — POG plan ogólny (APP GML 2.0 strefa planistyczna)',
            version: citation.planVersion,
            license: null,
            crs: null,
        },
    });
    return { record, resolution };
}

/**
 * Compile a parsed `app:StrefaPlanistyczna` (+ its resolved plan identity) straight to a
 * `ZoningRecord` + resolution — the live/GML path. `plan` is the strefa's matched act identity
 * (from the country adapter's chain); pass `{ planIdentity: null, ... }` for a strefa whose act did
 * not resolve (its citation then names the unresolved plan honestly).
 */
export function plPogZoningRecordFromStrefa(
    strefa: AppStrefaPlanistyczna,
    plan: { readonly planIdentity: string | null; readonly planVersion: string | null; readonly actStatus: string | null },
): { readonly record: ZoningRecord; readonly resolution: PlPogEnvelopeResolution } {
    return plPogZoningRecord(plPogFieldsFromStrefa(strefa), plPogCitationFromStrefa(strefa, plan));
}

/**
 * Read the act identity a strefa needs for its citation directly from a parsed act — a convenience
 * so a caller with the parsed act does not re-derive `plCodeTail(akt.status)` by hand.
 */
export function plPogPlanIdentityOf(
    akt: { readonly idIIP: Parameters<typeof plIipIdentity>[0]; readonly status: Parameters<typeof plCodeTail>[0] } | null,
): { readonly planIdentity: string | null; readonly planVersion: string | null; readonly actStatus: string | null } {
    if (akt === null) return { planIdentity: null, planVersion: null, actStatus: null };
    return {
        planIdentity: plIipIdentity(akt.idIIP),
        planVersion: akt.idIIP.wersjaId,
        actStatus: plCodeTail(akt.status),
    };
}

/* ─────────────────────── the coverage-gap refusal seam ─────────────────── */

/**
 * The named coverage-gap refusal for a commune the POG reform corpus has NOT yet reached (adoption
 * ran to the 2026-08-31 deadline; the Rejestr Urbanistyczny data channel is not published before
 * 2026-11-30 — re-confirmed live 2026-09-03, `PL_RU_ENDPOINT_DISCOVERY`). It is a TRANSIENT
 * `endpoint-unreachable` (the L0 token, L-12874 — no new spelling minted): "the national POG data
 * service is not published yet / this commune has no POG in the corpus yet" is NOT "there is no
 * plan at this parcel", and it must NEVER fall back to the pre-reform MPZP (document-extraction, a
 * later lane). Names the commune so the gap is auditable, never a bare empty.
 */
export function plPogCoverageGapRefusal(communeRef: string): FetchOutcome<never> {
    return fetchTransient(
        `endpoint-unreachable: no POG (plan ogólny) is reachable for ${JSON.stringify(communeRef)} — ` +
            'the national APP/Rejestr Urbanistyczny data channel is not published yet (transition ' +
            'ends 2026-11-30; re-confirmed live 2026-09-03) and POG adoption is still filling the ' +
            'corpus. This is a coverage gap, NOT "no plan here", and NEVER the pre-reform MPZP. ' +
            'Supply a POG APP GML export (or the served channel once it lands) to compile the ' +
            'strefa ceilings via plPogZoningRecordFromStrefa.',
    );
}
