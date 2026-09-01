// E1b — THE SOURCE REGISTRY, NOW-THIN · build-time row validator (supplement §7 item 3;
// E1 gate decision §F item 5: "the Source Registry NOW-thin … build-time validation").
//
// One loader, validating every seeded row through the E1a `SiteIntelSourceSchema` at MODULE
// LOAD — the EE_SOURCES exemplar generalised ("a source row that does not parse is a build
// error, not a runtime surprise", countryAdapters/ee/eeSources.ts). Three loader-level
// disciplines the frozen schema deliberately does not carry:
//
//   1. FAILURE NAMES THE ROW. A bare `SiteIntelSourceSchema.parse(row)` throws a ZodError
//      whose message names paths, not rows. Corrupting one licence colour in a 35-row
//      registry must fail naming `country + row id + index`, or the build error is a
//      needle hunt.
//   2. COUNTRY CONSISTENCY. Every row in a per-country module must carry that module's
//      country code — a copy-pasted row from another module is a corruption, not a merge.
//   3. NO UNPROBED ROWS. A row with an empty `probes[]` is exactly the unverified-claims
//      table the probes field exists to prevent (verdict §F item 15 — the reason OME2's
//      15-country seed is DEFERRED, not seeded).
//
// PROTOCOL POLICY (read before adding rows): `protocol` is the REPORT §I closed set
// (WFS2 | OGCAPI | REST | ATOM | bulk) and that enum is FROZEN — it is the coarse transport
// class, not the service dialect. WMS / WCS / ArcGIS-REST services are classed `REST` and the
// exact dialect is named VERBATIM in `dataset` / `probes[].note`, so no fact is lost and no
// frozen enum is extended.
//
// NO FETCHING here or in any module this validates — L0/L2 purity; the registry is data.

import { SiteIntelSourceSchema, type SiteIntelSource } from '@pryzm/schemas';

/**
 * Validate one country module's seeded rows at module load.
 *
 * @param country ISO 3166-1 alpha-2 code the module owns (every row must match).
 * @param rows    Raw row literals — validated, never trusted.
 * @returns       The parsed, typed rows (with the four NOW-thin columns defaulted to
 *                honest nulls where the prose sources recorded nothing).
 * @throws        Error naming `country`, the row id and index, and every Zod issue —
 *                a corrupted row is a BUILD error naming its row, not a runtime surprise.
 */
export function defineSources(country: string, rows: readonly unknown[]): readonly SiteIntelSource[] {
    return rows.map((row, index) => {
        const rowId =
            typeof row === 'object' && row !== null && 'id' in row
                ? String((row as { id: unknown }).id)
                : '<row without id>';
        const result = SiteIntelSourceSchema.safeParse(row);
        if (!result.success) {
            const issues = result.error.issues
                .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
                .join(' · ');
            throw new Error(
                `[source-registry] ${country} row '${rowId}' (index ${index}) does not parse — ${issues}`,
            );
        }
        if (result.data.country !== country) {
            throw new Error(
                `[source-registry] ${country} row '${rowId}' (index ${index}) carries country '${result.data.country}' — a row pasted from another module is a corruption, not a merge`,
            );
        }
        if (result.data.probes.length === 0) {
            throw new Error(
                `[source-registry] ${country} row '${rowId}' (index ${index}) has an empty probe log — an unprobed row is an unverified claim (verdict §F item 15); record the dated probe from the lane file or do not seed the row`,
            );
        }
        return result.data;
    });
}
