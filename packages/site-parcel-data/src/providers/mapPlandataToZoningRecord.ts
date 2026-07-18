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
//   bebygpct           int      bebyggelsesprocent  → plotRatioFAR = bebygpct / 100
//   maxbygnhjd         decimal  maks. bygningshøjde → maxHeight_m (metres, passthrough)
//   maxetager          decimal  maks. antal etager  → maxFloors  (floored to an int)
//   anvendelsegenerel  string   generel anvendelse  → permittedUse[] (classified)
//   anvgen             string   anvendelseskode     → fallback use text + zoneCode
//   plannavn/plannr/planid       plan identity       → zoneLabel + zoneCode + provenance
//   doklink            string   plandokument-link   → ordinanceRef (the C58 §1.3 citation)
//   zonestatus         string   Byzone/Landzone …   → overlay tag (context)
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
import { ZoningRecordSchema } from '@pryzm/schemas';

/** Which Plandata layer a feature came from (a lokalplan is more specific than
 *  a kommuneplan framework, so the proxy prefers it). */
export type PlandataLayer = 'lokalplan' | 'kommuneplanramme';

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

/** Coerce a raw WFS value to a positive finite number, else null (honest absence). */
function posNumberOrNull(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number.parseFloat(String(v));
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
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
 * Map a fetched Plandata plan feature → a C58 `ZoningRecord` (structured), or
 * `null` when the plan carries no usable dimensional rule (→ caller falls back to
 * the estimated default, never a broken envelope).
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

    // ── Dimensional numbers (published-structured where present). ────────────
    const bebygpct = posNumberOrNull(p.bebygpct);
    const plotRatioFAR = bebygpct !== null ? bebygpct / 100 : null;
    const maxHeight_m = posNumberOrNull(p.maxbygnhjd);
    const etager = posNumberOrNull(p.maxetager);
    // maxetager is a decimal in the source (e.g. "3.5" storeys incl. an attic);
    // C58 `maxFloors` is an integer — floor it (conservative, never over-stated).
    const maxFloors = etager !== null ? Math.floor(etager) : null;

    const usable = maxHeight_m !== null || maxFloors !== null || plotRatioFAR !== null;
    if (!usable) return null;

    // ── Permitted use (classified onto the closed vocabulary). ───────────────
    const useText = firstString(p.anvendelsegenerel, p.anvgen);
    const use = classifyDanishUse(useText);
    const permittedUse: PermittedUse[] = use ? [use] : [];

    // ── Identity / citation. ─────────────────────────────────────────────────
    const planName = firstString(p.plannavn);
    const planNr = firstString(p.plannr);
    const planId = firstString(p.planid);
    const zoneCode =
        firstString(p.anvgen) ??
        planNr ??
        planId ??
        (response.layer === 'lokalplan' ? 'DK-LOKALPLAN' : 'DK-KOMMUNEPLANRAMME');
    const zoneLabel = planName ?? useText ?? null;
    const doklink = firstString(p.doklink);
    const zonestatus = firstString(p.zonestatus);

    const label = planName
        ? `Plandata.dk — ${planName}`
        : `Plandata.dk — ${response.layer}`;

    const record: ZoningRecord = ZoningRecordSchema.parse({
        zoneCode,
        zoneLabel,
        jurisdictionId: 'dk',
        structuredFields: {
            maxHeight_m,
            maxFloors,
            plotRatioFAR,
            // Coverage NOT derived from bebyggelsesprocent (FAR ≠ coverage) — honest null.
            maxCoverage: null,
            // Per-edge setbacks are a separate byggelinjer dataset — honest null.
            setbacks: { front_m: null, side_m: null, rear_m: null },
            permittedUse,
        },
        overlays: zonestatus ? [zonestatus] : [],
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
