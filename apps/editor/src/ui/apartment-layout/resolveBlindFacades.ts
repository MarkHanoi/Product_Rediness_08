// §DIAG-PARTY-WALL (PW.1, 2026-06-09) — the editor-side seam that resolves the set
// of BLIND/PARTY shell-wall ids for a given storey's shell walls.
//
// THE RULE (founder): a shell/perimeter wall that ABUTS a neighbouring building
// (a party wall, or one within a small setback) must be a BLIND wall — NO windows,
// NO doors, NO entrance, NO glazing on that façade. See
// docs/03-execution/specs/SPEC-PARTY-WALL-AWARENESS.md.
//
// PHASING — this module is the SUPPRESSION SEAM (PW.1). The ENGINE-side mechanism
// (ai-host) already consumes a `blindFacadeWallIds` set and suppresses windows +
// the entrance door on those walls (additive: empty ⇒ byte-identical). What this
// module provides is the PRODUCER hook that decides WHICH shell walls are blind:
//
//   • PW.1 (done): the mechanism + this seam. The default producer returns an EMPTY
//     set (no behaviour change) UNLESS a manual override is supplied via
//     `window.__pryzmBlindFacadeWallIds` (a string[] of shell wall ids) — used for
//     manual testing + demos and as the explicit, deterministic injection point.
//   • PW.2 (follow-up): compute the blind set HERE from the neighbour FOOTPRINTS.
//     Today neighbour footprints are fetched ONLY by the GIS viewports
//     (apps/editor/src/ui/geospatial/contextBuildings.ts → CesiumViewport /
//     SiteBoundaryMap2D) as VISUAL massing — they are NOT stored where the executor
//     can reach them, NOR projected into the editor's world-XZ frame. PW.2 plumbs a
//     neighbour-footprint store (lon/lat → ENU via the pinned site origin) and tests
//     each shell wall's midpoint/segment for proximity (≤ setback) to a neighbour
//     edge; the proximate walls become the blind set.
//   • PW.3 (follow-up): a setback config + cadastral party-wall data (explicit shared
//     boundaries) override the proximity heuristic.
//
// Pure-ish: the override read is the only input today; deterministic per ADR-0061.

/** A shell wall in the editor's world-XZ frame (matches `gatherShellWalls`). */
export interface BlindFacadeShellWall {
    readonly id: string;
    readonly start: { readonly x: number; readonly z: number };
    readonly end: { readonly x: number; readonly z: number };
}

/**
 * Resolve the BLIND/PARTY shell-wall ids for the given shell walls.
 *
 * PW.1: returns the manual override set intersected with the supplied shell walls
 * (so a stale id never leaks), else an EMPTY set. NEVER throws; on any error
 * returns an empty set (no suppression — today's behaviour).
 *
 * PW.2 plugs the neighbour-footprint proximity producer in here (see file header).
 *
 * @param shellWalls the storey's shell walls (world metres, from `gatherShellWalls`).
 * @returns the subset of `shellWalls[].id` that are blind party walls.
 */
export function resolveBlindFacades(
    shellWalls: readonly BlindFacadeShellWall[],
): ReadonlySet<string> {
    try {
        const ids = new Set(shellWalls.map(w => w.id));
        // Manual / test / demo override: window.__pryzmBlindFacadeWallIds = ['wall-id', …].
        // This is the deterministic injection point until PW.2 derives the set from
        // neighbour footprints. Intersect with the live shell wall ids so a stale id
        // (from a previous shell) is ignored.
        const override = (globalThis as unknown as { __pryzmBlindFacadeWallIds?: unknown })
            .__pryzmBlindFacadeWallIds;
        if (Array.isArray(override)) {
            const blind = new Set<string>();
            for (const v of override) {
                if (typeof v === 'string' && ids.has(v)) blind.add(v);
            }
            if (blind.size > 0) {
                console.log(
                    `[apartment-layout] §DIAG-PARTY-WALL override: ${blind.size} blind façade(s) ` +
                    `[${[...blind].join(',')}] (PW.2 neighbour detection is the follow-up)`,
                );
            }
            return blind;
        }
        return new Set();
    } catch {
        return new Set();
    }
}
