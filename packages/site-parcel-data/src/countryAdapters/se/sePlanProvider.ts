// LANE E7-SE — SWEDEN (SE) · the plan-geometry arm. E7-family conventions §6.A
// (`<cc>PlanProvider.ts`: plan/zone geometry + the register join).
//
// ⛔ DECLARED DEFERRAL, for the same measured reason as the parcel arm. Lantmäteriet's Nationella
// Geodataplattformen (NGP) serves digital detaljplaner nationally — **11,662 plans across 236 of
// Sweden's 290 kommuner as of April 2025**, CC BY 4.0, OGC API Features + WMS + STAC. New plans
// have been mandated digital since 2022-01-01 (BFS 2020:5) and carry structured bestämmelser keyed
// to the Boverket catalogue this adapter DOES import. The data is real, national, open and — from
// an unregistered client — unreachable:
//   `…/sokning/v1/detaljplan/v1/search`                → HTTP 401 `900902 Missing Credentials`
//   `…/visning/v1/detaljplan/v1/wms?…GetCapabilities`  → HTTP 401, byte-identical body
// (measured 2026-09-01; fixtures at `__tests__/fixtures/se-lantmateriet-ngp-2026-09-01/`.)
//
// ⭐ WHAT THAT GATE COSTS, STATED AS A NUMBER SO NOBODY HAS TO GUESS. This adapter can currently
// name **83 of 83** numeric parameters a Swedish detaljplan may carry, and **0 of 83** values for
// any actual parcel. The 83 come from Boverket; every one of the values comes from NGP. That is
// the whole gap in one ratio, and it is asserted in the test suite rather than narrated.
//
// ⛔ NO GML/JSON PARSER FOR THE NATIONAL DETALJPLAN SPECIFICATION IS SHIPPED. Lantmäteriet
// publishes the "Specifikation för detaljplan" and PRYZM already has an APP-GML parser from lane
// E2b — it would have been easy to write a Swedish sibling from the specification document. That
// is precisely the [[fake-more-capable-than-real]] trap: a parser built from the spec cannot
// falsify the spec, and its tests would confirm the header rather than the service. It waits for
// recorded bytes.

import type { FetchOutcome } from '@pryzm/schemas';
import { SE_NGP_GATED_ENDPOINTS, seNgpDeferredRefusal } from './seNgpGate.js';

/**
 * The instance shape a detaljplan bestämmelse would take: a Boverket provision code, the value the
 * plan filled into it, and the plan identity. **Declared, never constructed by this lane** — it is
 * the seat `seRuleMapper.ts` will accept once NGP is reachable, and its existence is what makes
 * the mapper's UNKNOWN branch honest rather than the only branch anyone thought about.
 */
export interface SeDetaljplanProvisionInstance {
    /** Boverket `bestammelsekod` — the join key into `SE_NUMERIC_PROVISIONS`. */
    readonly kod: string;
    /** The number the plan filled into the provision's `[…:decimaltal]` slot. */
    readonly value: number;
    /** National plan identity (`planbeteckning` / `objektidentitet`). */
    readonly planId: string;
    /** The plan's legal in-force date, `YYYY-MM-DD`, when the register serves one. */
    readonly inForceFrom: string | null;
}

/** A resolved detaljplan area with the provisions drawn on it. Declared, never constructed here. */
export interface SeDetaljplanArea {
    readonly planId: string;
    readonly ring: ReadonlyArray<readonly [number, number]>;
    readonly crs: string;
    readonly provisions: readonly SeDetaljplanProvisionInstance[];
}

/**
 * Resolve the detaljplan area(s) covering a WGS84 point. **DEFERRED** — the self-announcing
 * credential-gate refusal (C74 §3.2). Emphatically `transient`, never `absent`: Sweden has 11,662
 * digital plans, and answering "no plan here" would be the failure≠absence conflation at national
 * scale.
 */
export async function resolveSeDetaljplanAtWgs84Point(
    lat: number,
    lon: number,
): Promise<FetchOutcome<readonly SeDetaljplanArea[]>> {
    return seNgpDeferredRefusal<readonly SeDetaljplanArea[]>(
        `detaljplan at ${lat.toFixed(6)},${lon.toFixed(6)}`,
        SE_NGP_GATED_ENDPOINTS.detaljplanSearch,
    );
}

/** Resolve one detaljplan by its national identifier. **DEFERRED** — same refusal. */
export async function resolveSeDetaljplanById(
    planId: string,
): Promise<FetchOutcome<SeDetaljplanArea>> {
    return seNgpDeferredRefusal<SeDetaljplanArea>(
        `detaljplan planId="${planId}"`,
        SE_NGP_GATED_ENDPOINTS.detaljplanSearch,
    );
}

/**
 * Coverage as SERVED FACTS, not as an estimate — recorded from Lantmäteriet's own 2025 publication
 * and the NGP FAQ, so the deferral above can be sized rather than merely stated. Not a claim that
 * PRYZM can reach any of it.
 */
export const SE_DETALJPLAN_COVERAGE = Object.freeze({
    plansInNgp: 11662,
    kommunerServing: 236,
    kommunerTotal: 290,
    asOf: '2025-04',
    /** Plans adopted before this date are mostly scanned PDF until a kommun converts them. */
    digitalMandateFrom: '2022-01-01',
    mandateInstrument: 'BFS 2020:5 (Boverkets föreskrifter om detaljplan)',
});
