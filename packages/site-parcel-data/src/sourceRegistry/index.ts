// ─────────────────────────────────────────────────────────────────────────────
// E1b — THE SOURCE REGISTRY, NOW-THIN (E1 gate decision §F item 5 · verdict §G item 5 ·
// supplement §7: "implement the machine-readable Source Registry NOW, as schema + data only —
// no fetching, no UI, no OME2 harvest yet").
//
// WHAT THIS IS: the typed, build-time-validated form of the four rotting prose registries —
// parcelProviders/registry.ts per-row probe notes, tools/context-bake/heightSources.mjs
// per-country impl table, docs/04-reference/jurisdictions/** dated probes, and REPORT §F's
// 30-country matrix — seeded row-for-row from those files and NEVER inventing beyond them.
// Every row carries its licence colour and its machine-readable/adapter status FROM THE LANE
// FILES ("supplement §7: it freezes the audit's 30-country findings into a shrink-proof
// artefact before the prose rots").
//
// WHAT THIS IS NOT:
//   • NOT a rival of the runtime parcel-provider registry (registry.ts routes clicks; this
//     records sources — the entities.ts Source doc says exactly this).
//   • NOT an OME2 seed — verdict §F item 15: "no OME2 15-country registry seed before its
//     licence text is fetched (founder item)". ZERO OME2 rows here, deliberately.
//   • NOT a fetch layer — nothing here performs I/O; rows are data validated at module load
//     (a corrupted row is a BUILD error naming the row — defineSources.ts).
//
// COUNTRY SET: REPORT §F's 30 countries, verbatim (spelling included — §F writes "UK"; ISO
// rows carry "GB"; the alias is explicit data below, never silent). A §F country with no
// endpoint-level row in the prose registries appears with an HONEST ABSENCE reason, not an
// invented row — failure/absence must stay distinct values (§CONTEXT-DATA-HONESTY).
// ─────────────────────────────────────────────────────────────────────────────

import type { SiteIntelSource } from '@pryzm/schemas';
// EE is the exemplar the whole registry copies (supplement §7: "the E1d draft has proven the
// pattern end-to-end") — REUSED from the adapter, never duplicated (C84 EI-9 one authority).
import { EE_SOURCES } from '../countryAdapters/ee/eeSources.js';
import { BE_SOURCES } from './be.js';
import { CH_SOURCES } from './ch.js';
import { DE_SOURCES } from './de.js';
import { DK_SOURCES } from './dk.js';
import { ES_SOURCES } from './es.js';
import { FI_SOURCES } from './fi.js';
import { FR_SOURCES } from './fr.js';
import { GB_SOURCES } from './gb.js';
import { IT_SOURCES } from './it.js';
import { LT_SOURCES } from './lt.js';
import { NL_SOURCES } from './nl.js';
import { NO_SOURCES } from './no.js';
import { PL_SOURCES } from './pl.js';
import { PT_SOURCES } from './pt.js';

export { defineSources } from './defineSources.js';
export {
    BE_SOURCES,
    CH_SOURCES,
    DE_SOURCES,
    DK_SOURCES,
    ES_SOURCES,
    FI_SOURCES,
    FR_SOURCES,
    GB_SOURCES,
    IT_SOURCES,
    LT_SOURCES,
    NL_SOURCES,
    NO_SOURCES,
    PL_SOURCES,
    PT_SOURCES,
};

/**
 * REPORT §F's 30 country codes, VERBATIM in §F's own row order and spelling ("UK", not
 * "GB"). This list is the registry's census frame: the coverage view iterates it, never the
 * module set, so a §F country with zero rows is PRINTED as zero instead of vanishing.
 */
export const REPORT_F_COUNTRIES = [
    'DE', 'DK', 'CH', 'ES', 'FR', 'PT', 'NL', 'PL', 'LT', 'EE',
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'FI', 'GR', 'HU', 'IE',
    'IT', 'LV', 'LU', 'MT', 'NO', 'RO', 'SI', 'SK', 'SE', 'UK',
] as const;
export type ReportFCountry = (typeof REPORT_F_COUNTRIES)[number];

/** §F spelling → ISO 3166-1 alpha-2 used by SiteIntelSourceSchema rows. Only UK differs. */
export const REPORT_F_TO_ISO: Readonly<Record<string, string>> = { UK: 'GB' };

/**
 * The registry: ISO country code → schema-validated source rows. Only countries with at
 * least one row seeded from the prose registries appear as keys; absence is handled by
 * `SOURCE_ABSENCE_REASONS` + `coverageByCountry`, never by an empty invented module.
 */
export const SOURCE_REGISTRY: Readonly<Record<string, readonly SiteIntelSource[]>> = {
    DE: DE_SOURCES,
    DK: DK_SOURCES,
    CH: CH_SOURCES,
    ES: ES_SOURCES,
    FR: FR_SOURCES,
    PT: PT_SOURCES,
    NL: NL_SOURCES,
    PL: PL_SOURCES,
    LT: LT_SOURCES,
    EE: EE_SOURCES,
    BE: BE_SOURCES,
    FI: FI_SOURCES,
    GB: GB_SOURCES,
    IT: IT_SOURCES,
    NO: NO_SOURCES,
};

/**
 * Per-country HONEST-ABSENCE register — why a §F country has zero rows, each reason citing
 * the lane file that establishes it. An absence with a reason is a finding; an absence
 * without one would be indistinguishable from "nobody looked" (§CONTEXT-DATA-HONESTY:
 * failure vs empty are the same value unless separated).
 */
export const SOURCE_ABSENCE_REASONS: Readonly<Record<string, string>> = {
    AT: 'L5 sweep AT: CC BY 3.0 AT cadastre snapshots + 9-Länder planning patchwork, rules PDF — no endpoint-level dated probe row in the prose registries to copy.',
    BG: 'L5 sweep BG: free viewing, PAID extracts; planning per-municipality PDF — no open endpoint-level row exists (§F row is an L5 estimate).',
    HR: 'L5 sweep HR: INSPIRE ATOM bulk since 2023 + ISPU plan WMS/WFS noted, but no dated endpoint probe with a licence colour in the prose registries (licence IDs unconfirmed — §F reading note).',
    CY: 'L5 sweep CY: zones GIS + numeric coefficient tables = automatable join, but "sample unverified" and licence unconfirmed (§F reading note) — seeding would invent.',
    CZ: 'L5 sweep CZ: daily-change cadastre feed probed (best incremental design found) but "licence text NOT captured by the probe" — a row requires a licence colour; deferred to the licence read.',
    GR: 'L5 sweep GR: incomplete cadastre; rules FEK-scanned; licence IDs unconfirmed (§F reading note) — no seedable row.',
    HU: 'L5 sweep HU: paid Lechner gate; E-ING transition troubled — no open endpoint to seed.',
    IE: 'L5 sweep IE: no cadastre by design; national harmonized zoning GIS open but no dated endpoint probe with licence colour in the prose registries.',
    LV: 'L5 sweep LV: weekly open cadastre + TAPIS noted; "exact licence id not captured — confirm at implementation" (sweep) — deferred to that confirmation.',
    LU: 'L5 sweep LU: all PAGs in ONE national GML model (cheapest structured pilot) — no dated endpoint probe row in the prose registries yet.',
    MT: 'L5 sweep MT: no complete cadastre (honest near-zero, §F row) — nothing to seed.',
    RO: 'L5 sweep RO: REST cadastre with incomplete fabric; licence unconfirmed (§F reading note) — no seedable row.',
    SI: 'L5 sweep SI: richest open building register noted, but no dated endpoint probe with a licence colour in the prose registries to copy.',
    SK: 'L5 sweep SK: HVD cadastre WFS noted; planning digitisation ~2028 — no dated endpoint probe row in the prose registries.',
    SE: 'L5 sweep SE: graded GREEN (HVD cadastre 2025 CC BY 4.0 + NGP detaljplan API, 236/290 kommuner) but no API endpoint URL captured in the prose registries (OAuth2/org-onboarding gate; heightSources.mjs lidar_se endpoint is prose, not a URL) — rows deferred until the endpoint is probed.',
};

/** One row of the 30-country coverage view: §F code, ISO code, and the seeded row count. */
export interface SourceCoverageRow {
    readonly reportFCode: ReportFCountry;
    readonly iso: string;
    readonly rows: number;
    /** null when rows > 0; the honest-absence reason when rows === 0. */
    readonly absenceReason: string | null;
}

/**
 * The §F-framed coverage view — one entry per REPORT §F country, in §F order. Rows counts
 * come from the validated registry; zero-row countries carry their lane-file absence reason.
 */
export function coverageByCountry(): readonly SourceCoverageRow[] {
    return REPORT_F_COUNTRIES.map((reportFCode) => {
        const iso = REPORT_F_TO_ISO[reportFCode] ?? reportFCode;
        const rows = SOURCE_REGISTRY[iso]?.length ?? 0;
        return {
            reportFCode,
            iso,
            rows,
            absenceReason: rows > 0 ? null : (SOURCE_ABSENCE_REASONS[reportFCode] ?? null),
        };
    });
}

/** Every validated row across all countries — the flat view consumers (C63 heatmap, E1b sequencing) read. */
export const ALL_SOURCES: readonly SiteIntelSource[] = Object.values(SOURCE_REGISTRY).flat();
