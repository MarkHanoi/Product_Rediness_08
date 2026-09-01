// C58 §3.1 / L-399a — PURE mapping: raw Plandata.dk plan attributes → `ZoningRecord`.
//
// This is the compliance-critical, DETERMINISTIC core of `DkZoningProvider`
// (C58 §1.1). Given a Plandata plan feature's `properties` (the field names come
// straight from the plandata.dk GeoServer WFS `DescribeFeatureType`, verified
// 2026-07-17 — see FIELD MAP below) it emits a C58 `ZoningRecord` with
// `structuredFields` populated from the plan's published numbers. When the engine
// consumes that record with `rulePack: null`, every number resolves from the
// provider → `confidence: 'structured'` (C58 §1.2 fidelity 1 — the DK reference
// case). Absent fields map to `null` + are simply omitted — NEVER an invented
// value (C58 §1.6 / §2.2 note).
//
// PURITY (C58 §1.9): no I/O, no clock, no RNG. The fetch date is passed IN
// (`opts.fetchDateISO`) by the impure `DkZoningProvider` — this module never
// calls `Date`. Same input → byte-identical `ZoningRecord`.
//
// FIELD MAP (Plandata `theme_pdk_lokalplan_vedtaget` / `kommuneplanramme_vedtaget_v`):
//   bebygpct           int      bebyggelsesprocent  → plotRatioFAR = bebygpct / 100 — ONLY when
//                               the SERVED `bebygpctaf` denominator code is parcel-scoped
//                               (codes 3/4). The branch is NOT re-derived here: this file
//                               delegates to the L-449 signed `resolveDkPlanEnvelope`
//                               (rulepacks/dkPlandataEnvelope.ts); see §DK-DENOMINATOR-BRANCH
//   bebygpctaf         int      beregnes af (codelist bygberegnaf 1–4) — WHAT the % is
//                               computed OF (lane 2 §DK-2, probed 2026-08-31)
//   maxbygnhjd         decimal  maks. bygningshøjde → maxHeight_m (metres, passthrough)
//   maxetager          decimal  maks. antal etager  → maxFloors  (floored to an int)
//   anvendelsegenerel  string   generel anvendelse  → permittedUse[] (classified)
//   anvgen             string   anvendelseskode     → fallback use text + zoneCode
//   plannavn/plannr/planid       plan identity       → zoneLabel + zoneCode + provenance
//   lp_plannavn/lp_plannr/lokplan_id  (delområde layer) same identity, `lp_*`-named
//   delnr              string   delområde-nummer    → zoneLabel suffix (which sub-area)
//   doklink            string   plandokument-link   → ordinanceRef (the C58 §1.3 citation)
//   zonestatus         string   Byzone/Landzone …   → overlay tag (context)
//
// SUB-AREA (delområde) — a multi-area lokalplan publishes its real per-area
// height/FAR/storeys on the `theme_pdk_lokalplandelomraade_vedtaget` feature (SAME
// dimensional field names: maxbygnhjd/maxetager/bebygpct), NOT on the whole-plan
// polygon (whose fields are then null). The proxy queries the delområde FIRST
// (server/plandataZoningProxy.js §USABLE-FALLBACK); this mapper needs no dimensional
// change for it — only the `lp_*` identity aliases above.
//
// BUILDING FIELD (byggefelt, L-609) — `theme_pdk_byggefelt_vedtaget` is the tightest
// instrument: a per-building-field footprint that MAY also cap that field's
// maxbygnhjd/maxetager (SAME field names again; it carries NO bebygpct → no FAR). The
// proxy queries it most-specific; this mapper maps its dimensions + identity (via the
// SAME `lp_*` aliases) with a `DK-BYGGEFELT` fallback code. ⚠ Its FOOTPRINT is NOT
// turned into `maxCoverage` here: coverage = area(footprint ∩ parcel)/area(parcel)
// needs the parcel geometry (downstream, C57) + an L0 footprint-ring field — the
// ADR-gated cross-layer step in dk/NEXT Blocker C. Emitting a coverage number from the
// footprint alone would fabricate, so `maxCoverage` stays null on byggefelt too. A
// binding byggefelt (`bygkunifelt && !bygvejledende`) is surfaced as an overlay tag so
// the facts card records that a real footprint cap exists, without inventing its ratio.
//
// NOTE — bebyggelsesprocent is the Danish FLOOR-AREA ratio (etageareal/grundareal
// ×100), i.e. FAR×100 — NOT ground coverage. It maps to `plotRatioFAR` ONLY;
// `maxCoverage` stays `null` (Plandata's standard plan fields publish no separate
// coverage %, and reusing the same number for both would be a fabrication).
//
// NOTE — per-edge setbacks (byggelinjer) are a SEPARATE Plandata dataset, not
// carried on the plan feature, so `setbacks` stay `null` here (honest absence).
//
// Strategic context — docs/02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md §1.2/§3.1;
// docs/04-reference/DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md §2.3.

import type { PermittedUse, ZoningRecord } from '@pryzm/schemas';
import { DkBygberegnafCodeSchema, ZoningRecordSchema, dkBygberegnafRow } from '@pryzm/schemas';
import {
    dkDensityScopeFromBygberegnaf,
    resolveDkPlanEnvelope,
} from '../rulepacks/dkPlandataEnvelope.js';

/** Which Plandata layer a feature came from, MOST-SPECIFIC first. A lokalplan's
 *  building field (`byggefelt`) is tighter than a local plan's sub-area
 *  (`lokalplandelomraade`), which is tighter than the whole local plan, which is
 *  tighter than the kommuneplan framework — the proxy prefers whichever most-specific
 *  layer actually publishes a number (server/plandataZoningProxy.js §USABLE-FALLBACK). */
export type PlandataLayer =
    | 'byggefelt'
    | 'lokalplandelomraade'
    | 'lokalplan'
    | 'kommuneplanramme';

/**
 * The proxy's normalised hand-off: the winning plan's raw `properties` (the WFS
 * field names) plus which layer it came from. `null` = no plan at the point.
 * This is exactly the shape `server/plandataZoningProxy.js` returns under
 * `{ zoning: … }`.
 */
export interface PlandataZoningResponse {
    readonly layer: PlandataLayer;
    /** Raw WFS feature attributes (field names as published by Plandata GeoServer). */
    readonly properties: Readonly<Record<string, unknown>>;
}

export interface MapPlandataOpts {
    /** ISO date the record was fetched (passed in — the mapper never calls Date). */
    readonly fetchDateISO: string;
}

/**
 * Narrow a raw WFS attribute (`unknown`) to the `number | string | null` a `DkPlanFields`
 * slot accepts. Anything else (boolean, object, array) is "no number" — the same verdict the
 * signed resolver's own coercion reaches, arrived at one step earlier so the pure mapper does
 * no arithmetic of its own.
 */
function planField(v: unknown): number | string | null {
    return typeof v === 'number' || typeof v === 'string' ? v : null;
}

/**
 * §DK-DENOMINATOR-BRANCH — describe the SERVED `bebygpctaf` value for the withhold overlay,
 * distinguishing the THREE non-parcel situations that must never read alike
 * (§CONTEXT-DATA-HONESTY: an absent code, an alien code and a known non-parcel code are
 * different facts):
 *   • served + inside the state codelist → the codelist row VERBATIM, code included;
 *   • served + OUTSIDE {1,2,3,4}         → named as a possible national schema change,
 *                                          never absorbed into a scope;
 *   • not served                          → the denominator is UNKNOWN, and UNKNOWN is never
 *                                          read as 'parcel' (E4 control 9).
 */
function describeBygberegnaf(raw: unknown): string {
    if (raw === null || raw === undefined || raw === '') {
        return 'denominator code (bebygpctaf) NOT served — the denominator is UNKNOWN';
    }
    const codeNum = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
    const parsed = DkBygberegnafCodeSchema.safeParse(codeNum);
    if (!parsed.success) {
        return (
            `bebygpctaf=${String(raw)} is outside the state bygberegnaf codelist {1,2,3,4} ` +
            '(national schema change?)'
        );
    }
    const row = dkBygberegnafRow(parsed.data);
    return `beregnes af: ${row.da} (bebygpctaf=${parsed.data} — ${row.en})`;
}

/** First non-empty string among the candidates, else null. */
function firstString(...vals: unknown[]): string | null {
    for (const v of vals) {
        if (typeof v === 'string' && v.trim().length > 0) return v.trim();
        if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    }
    return null;
}

/**
 * Classify a Danish general-use string (`anvendelsegenerel` / `anvgen`) onto the
 * C58 closed `PermittedUse` vocabulary. Deterministic keyword match (no AI). An
 * unrecognised but present use → `'other'`; empty → `null` (caller omits it).
 *
 * Order matters: "blandet bolig og erhverv" contains both `bolig` and `erhverv`,
 * so `blandet` (mixed) is tested first.
 */
export function classifyDanishUse(text: string | null): PermittedUse | null {
    if (!text) return null;
    const t = text.toLowerCase();
    if (t.includes('blandet')) return 'mixed';
    if (t.includes('center')) return 'mixed';
    if (t.includes('bolig')) return 'residential';
    if (t.includes('industri')) return 'industrial';
    if (t.includes('erhverv')) return 'commercial';
    if (t.includes('offentlig') || t.includes('institution')) return 'civic';
    if (
        t.includes('rekreativ') ||
        t.includes('grøn') ||
        t.includes('gron') ||
        t.includes('friareal') ||
        t.includes('park') ||
        t.includes('landzone')
    ) {
        return 'green';
    }
    return 'other';
}

/**
 * §DK-HONEST-REFUSAL — the plan's IDENTITY + citation, extractable even when the plan carries no
 * usable dimensional number. `mapPlandataToZoningRecord` returns `null` for a dimensionless plan
 * (it has no structured envelope to build), which DISCARDS the zone code + plan-document link. The
 * DK dispatch path needs exactly those to build an HONEST cited refusal instead of the generic
 * `estimated-default` — so this exposes the identity block on its own.
 *
 * ⚠ Field precedence is IDENTICAL to `mapPlandataToZoningRecord`'s (same `zoneCode`/`zoneLabel`/
 * `doklink` derivation), so the refusal names the same zone the structured record would have. A
 * drift-guard test pins that agreement. `null` only when there is no feature at all.
 */
export interface DkPlanIdentity {
    readonly zoneCode: string;
    readonly zoneLabel: string | null;
    readonly doklink: string | null;
    readonly layer: PlandataLayer;
}

export function extractDkPlanIdentity(
    response: PlandataZoningResponse | null,
): DkPlanIdentity | null {
    if (!response || !response.properties) return null;
    const p = response.properties;
    // An empty attribute bag is "no feature" (the proxy's `pickFirstFeatureProps` already returns
    // null for it) — never a `DK-LOKALPLAN` fallback identity for nothing.
    if (Object.keys(p).length === 0) return null;
    const planName = firstString(p.plannavn, p.lp_plannavn);
    const planNr = firstString(p.plannr, p.lp_plannr);
    const planId = firstString(p.planid, p.lokplan_id);
    const delnr = firstString(p.delnr);
    const useText = firstString(p.anvendelsegenerel, p.anvgen);
    const layerFallbackCode =
        response.layer === 'byggefelt'
            ? 'DK-BYGGEFELT'
            : response.layer === 'lokalplandelomraade'
              ? 'DK-LOKALPLAN-DELOMRAADE'
              : response.layer === 'lokalplan'
                ? 'DK-LOKALPLAN'
                : 'DK-KOMMUNEPLANRAMME';
    const zoneCode = firstString(p.anvgen) ?? planNr ?? planId ?? layerFallbackCode;
    const baseLabel = planName ?? useText ?? null;
    const zoneLabel = baseLabel && delnr ? `${baseLabel} (delområde ${delnr})` : baseLabel;
    const doklink = firstString(p.doklink);
    return { zoneCode, zoneLabel, doklink, layer: response.layer };
}

/**
 * Map a fetched Plandata plan feature → a C58 `ZoningRecord` (structured), or
 * `null` when the plan carries no usable dimensional rule. ⚠ On `null` the DK dispatch path no
 * longer falls to the estimated default — it builds an HONEST cited refusal from
 * `extractDkPlanIdentity` (§DK-HONEST-REFUSAL). "No usable rule" is a data gap on a packed
 * jurisdiction, not a licence to fabricate a triple.
 *
 * "Usable" = at least one of {maxHeight_m, maxFloors, plotRatioFAR} is published.
 * A plan with only a use class (or nothing) yields no meaningful study volume, so
 * we defer to the estimated pack rather than show a 0-setback whole-parcel box.
 */
export function mapPlandataToZoningRecord(
    response: PlandataZoningResponse | null,
    opts: MapPlandataOpts,
): ZoningRecord | null {
    if (!response || !response.properties) return null;
    const p = response.properties;

    // ── Dimensional numbers, via the L-449 SIGNED resolver (no second arithmetic). ──
    // §DK-DENOMINATOR-BRANCH (LANE DK 2026-09-01 · E1 verdict §B.1 · lane 2 §DK-2 · C63) —
    // `bebyggelsesprocent` is a RATIO whose denominator is legally VARIABLE, and Plandata SERVES
    // it as the coded attribute `bebygpctaf` (state codelist
    // `pdk:theme_pdk_codelist_bygberegnaf_v`: 1 = the plan area as a whole · 2 = the ejendom ·
    // 3 = the grund · 4 = the individual jordstykke).
    //
    // `rulepacks/dkPlandataEnvelope.ts` ALREADY carries the founder-signed branch for this
    // (`resolveDkPlanEnvelope`: FAR ONLY at parcel scope, pct kept as a fact, typed
    // `farWithheldReason`) and its own header says why it was dormant — "⚠ PROBE-DON'T-ASSUME:
    // the ingestion does not YET emit a scope attribute (the current mapper reads only
    // `bebygpct`) … the exact WFS field name must be confirmed at wiring time against the
    // DescribeFeatureType". THIS IS THAT WIRING: `bebygpctaf` is the field, live-probed
    // 2026-09-01. The mapper therefore DELEGATES rather than re-deriving the branch — one
    // signed authority for the FAR arithmetic, no rival (C84 EI-9).
    //
    // WHY IT MATTERS, measured nationally 2026-09-01 (keyless WFS `resulttype=hits`): of the
    // features that publish a `bebygpct`, only 15.2 % (lokalplan) / 15.5 % (delområde) /
    // 28.1 % (ramme) are parcel-scoped (codes 3+4). The other 72–85 % are codes 1/2 — the
    // unconditional `bebygpct/100` this replaces stated a per-parcel FAR for every one of them.
    // `bebygpctaf` is served on 99.8–100 % of populated `bebygpct` values, so withholding on an
    // ABSENT code costs 28 features nationally, not coverage.
    const dkEnv = resolveDkPlanEnvelope({
        bebyggelsesprocent: planField(p.bebygpct),
        maxHeightM: planField(p.maxbygnhjd),
        maxStoreys: planField(p.maxetager),
        // The SERVED code → the signed `DkDensityScope`. null (absent / alien code) is NOT
        // parcel-confirmed, and the resolver withholds — UNKNOWN is never read as 'parcel'.
        densityScope: dkDensityScopeFromBygberegnaf(p.bebygpctaf),
    });
    const plotRatioFAR = dkEnv.farRatio;
    const maxHeight_m = dkEnv.maxHeightM;
    // maxetager is a decimal in the source (e.g. "3.5" storeys incl. an attic); the resolver
    // floors it to the C58 integer (conservative, never over-stated).
    const maxFloors = dkEnv.maxStoreys;
    // A withheld FAR keeps its pct AND its basis VISIBLE as an overlay fact — the record
    // refuses NAMING the basis; the served number is never silently dropped.
    const farBasisOverlay = dkEnv.farWithheld
        ? `Bebyggelsesprocent ${dkEnv.bebyggelsesprocent} % — ${describeBygberegnaf(p.bebygpctaf)}` +
          ` — not a per-parcel FAR; FAR withheld (${dkEnv.farWithheldReason}, L-449 ` +
          '§DK-DENOMINATOR-BRANCH)'
        : null;

    const usable = maxHeight_m !== null || maxFloors !== null || plotRatioFAR !== null;
    if (!usable) return null;

    // ── Permitted use (classified onto the closed vocabulary). ───────────────
    const useText = firstString(p.anvendelsegenerel, p.anvgen);
    const use = classifyDanishUse(useText);
    const permittedUse: PermittedUse[] = use ? [use] : [];

    // ── Identity / citation. ─────────────────────────────────────────────────
    // The delområde (sub-area) layer carries the plan identity under `lp_*` field
    // names + its own `delnr` (sub-area number), so read both spellings — the plan
    // name/number is the SAME instrument, just published on the sub-area feature.
    const planName = firstString(p.plannavn, p.lp_plannavn);
    const planNr = firstString(p.plannr, p.lp_plannr);
    const planId = firstString(p.planid, p.lokplan_id);
    const delnr = firstString(p.delnr);
    const layerFallbackCode =
        response.layer === 'byggefelt'
            ? 'DK-BYGGEFELT'
            : response.layer === 'lokalplandelomraade'
              ? 'DK-LOKALPLAN-DELOMRAADE'
              : response.layer === 'lokalplan'
                ? 'DK-LOKALPLAN'
                : 'DK-KOMMUNEPLANRAMME';
    // A BINDING byggefelt (bygkunifelt && !bygvejledende) IS a real footprint cap; record
    // that fact as context so the facts card can say so — WITHOUT inventing a coverage
    // ratio (which needs the parcel; ADR-gated, dk/NEXT Blocker C). A vejledende byggefelt
    // is only a placement guide and earns no tag.
    const wfsBool = (v: unknown): boolean | null => {
        if (v === true || v === false) return v;
        if (typeof v === 'string') {
            const s = v.trim().toLowerCase();
            if (s === 'true' || s === 't' || s === '1') return true;
            if (s === 'false' || s === 'f' || s === '0') return false;
        }
        return null;
    };
    const bindingByggefelt =
        response.layer === 'byggefelt' &&
        wfsBool(p.bygkunifelt) === true &&
        wfsBool(p.bygvejledende) !== true;
    const zoneCode = firstString(p.anvgen) ?? planNr ?? planId ?? layerFallbackCode;
    // Name the governing sub-area explicitly when we resolved one (delområde), so the
    // facts card shows WHICH part of the plan the numbers came from.
    const baseLabel = planName ?? useText ?? null;
    const zoneLabel =
        baseLabel && delnr ? `${baseLabel} (delområde ${delnr})` : baseLabel;
    const doklink = firstString(p.doklink);
    const zonestatus = firstString(p.zonestatus);

    const label = planName
        ? `Plandata.dk — ${planName}${delnr ? ` · delområde ${delnr}` : ''}`
        : `Plandata.dk — ${response.layer}`;

    const record: ZoningRecord = ZoningRecordSchema.parse({
        zoneCode,
        zoneLabel,
        jurisdictionId: 'dk',
        structuredFields: {
            maxHeight_m,
            maxFloors,
            plotRatioFAR,
            // Coverage NOT derived from bebyggelsesprocent (FAR ≠ coverage), NOR from a
            // byggefelt footprint (that needs the parcel + an L0 ring field — ADR-gated,
            // dk/NEXT Blocker C) — honest null in every case; never a fabricated ratio.
            maxCoverage: null,
            // Per-edge setbacks are a separate byggelinjer dataset — honest null.
            setbacks: { front_m: null, side_m: null, rear_m: null },
            permittedUse,
        },
        overlays: [
            ...(zonestatus ? [zonestatus] : []),
            ...(bindingByggefelt ? ['Bindende byggefelt'] : []),
            // §DK-DENOMINATOR-BRANCH — a withheld FAR keeps its pct + basis VISIBLE as a fact
            // (the record refuses NAMING the basis; the number is never silently dropped).
            ...(farBasisOverlay ? [farBasisOverlay] : []),
        ],
        // The plan document is the governing-document citation (C58 §1.3).
        ordinanceRef: doklink,
        provenance: {
            source: 'plandata-dk',
            label,
            version: opts.fetchDateISO,
            license: 'Open public data — Plandata.dk (Erhvervsstyrelsen)',
            crs: 'EPSG:25832',
        },
    });
    return record;
}
