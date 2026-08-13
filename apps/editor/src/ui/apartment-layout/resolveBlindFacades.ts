// §DIAG-PARTY-WALL (PW.1, 2026-06-09) — the editor-side seam that resolves the set
// of BLIND/PARTY shell-wall ids for a given storey's shell walls.
//
// THE RULE (founder): a shell/perimeter wall that ABUTS a neighbouring building
// (a party wall, or one within a small setback) must be a BLIND wall — NO windows,
// NO doors, NO entrance, NO glazing on that façade. See
// docs/03-execution/specs/SPEC-PARTY-WALL-AWARENESS.md.
//
// PHASING — this module is the SUPPRESSION SEAM (PW.1) + the DETECTION PRODUCER
// (PW.2). The ENGINE-side mechanism (ai-host) already consumes a
// `blindFacadeWallIds` set and suppresses windows + the entrance door on those
// walls (additive: empty ⇒ byte-identical). What this module provides is the
// PRODUCER that decides WHICH shell walls are blind:
//
//   • PW.1 (done): the mechanism + this seam. A manual override via
//     `window.__pryzmBlindFacadeWallIds` (a string[] of shell wall ids) remains the
//     explicit deterministic injection point for testing/demos — it is UNION-ed
//     with the computed set below.
//   • PW.2 (THIS): compute the blind set from neighbour FOOTPRINTS. Neighbour
//     footprints are fetched by the GIS viewports
//     (apps/editor/src/ui/geospatial/contextBuildings.ts → CesiumViewport /
//     SiteBoundaryMap2D) and CAPTURED into `neighbourFootprintStore` at the fetch
//     site. Here we PROJECT each footprint (lon/lat → world-XZ) via the SAME
//     `latLonToSceneXZ` the parcel boundary uses, about the pinned C19 site origin
//     (`getCurrentSiteOrigin`), then run the pure proximity test
//     (`computeBlindFacadeHits`): a shell wall within `setbackM` of a roughly-
//     parallel neighbour edge on its OUTWARD side becomes blind.
//   • PW.3 (follow-up): a typology-configurable setback + cadastral party-wall data
//     (explicit shared boundaries) override the proximity heuristic.
//
// ADDITIVE + SAFE: no site origin / no neighbours / detection finds nothing ⇒ EMPTY
// DETERMINED set ⇒ byte-identical to the pre-PW.2 behaviour (the common case + all
// tests). Pure geometry; deterministic per ADR-0061. NEVER throws.
//
// GR-10 / C75 §1.4 (2026-08-13) — the ARM A ledger row: the outer
// `catch { return new Set(); }` made a CRASHED detection indistinguishable from
// "no party walls found", and the engine then happily placed windows + the
// entrance on façades nobody had cleared. The function now returns a
// `BlindFacadeDetermination`: a determined (possibly empty) set, or a TYPED
// refusal (`PLANNER_THREW`, C78 §8.1) the executors must branch on — the
// explicit, logged decision to proceed without suppression replaces the silent
// one.

import type { UndeterminedReason } from '@pryzm/command-bus';
import { getCurrentSiteOrigin } from '../site/siteDispatch.js';
import { getNeighbourFootprints } from '../site/neighbourFootprintStore.js';
import { latLonToSceneXZ } from '../site/boundaryProjection.js';
import {
    computeBlindFacadeHits,
    DEFAULT_PROXIMITY_CONFIG,
    type ProximityShellWall,
    type ProximityFootprint,
    type XZ,
} from './blindFacadeProximity.js';

/** A shell wall in the editor's world-XZ frame (matches `gatherShellWalls`). */
export interface BlindFacadeShellWall {
    readonly id: string;
    readonly start: { readonly x: number; readonly z: number };
    readonly end: { readonly x: number; readonly z: number };
}

/**
 * The answer to "which shell walls are blind/party walls?", with its
 * determination status in the type (C75 §1.4 · C71 §4.4). An EMPTY determined
 * set is a real answer — no neighbour within setback, no override. The
 * `undetermined` arm is what the old swallowed catch used to hide: the
 * detection CRASHED, and "no blind walls" was never determined.
 */
export type BlindFacadeDetermination =
    | { readonly kind: 'determined'; readonly blind: ReadonlySet<string> }
    | {
          readonly kind: 'undetermined';
          readonly scope: string;
          readonly reason: UndeterminedReason;
          readonly detail: string;
      };

/**
 * Resolve the configured setback (m): `window.__pryzmPartyWallSetbackM` overrides
 * the default (~1.0 m) when a finite positive number. PW.3 promotes this to a
 * typology/jurisdiction config.
 */
function resolveSetbackM(): number {
    try {
        const v = (globalThis as unknown as { __pryzmPartyWallSetbackM?: unknown })
            .__pryzmPartyWallSetbackM;
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
    } catch { /* no globals */ }
    return DEFAULT_PROXIMITY_CONFIG.setbackM;
}

/** Centroid of all shell wall endpoints — used as the building INTERIOR point so
 *  the proximity test can reject neighbours on the wall's INWARD side. */
function shellCentroid(walls: readonly BlindFacadeShellWall[]): XZ | undefined {
    let sx = 0, sz = 0, n = 0;
    for (const w of walls) {
        sx += w.start.x + w.end.x; sz += w.start.z + w.end.z; n += 2;
    }
    return n > 0 ? { x: sx / n, z: sz / n } : undefined;
}

/**
 * Compute the BLIND set from captured neighbour footprints (PW.2). Returns the
 * subset of `shellWalls[].id` whose façade abuts a neighbour within the setback,
 * as a DETERMINED set — EMPTY when there is no site origin, no captured
 * footprints, or nothing qualifies (additive identity). A crash is returned as
 * the `undetermined` arm (PLANNER_THREW), never as a partial or empty set — the
 * old warn-and-return-partial path asserted a suppression set nobody computed.
 * Logs §DIAG-PARTY-WALL. NEVER throws.
 */
function computeNeighbourBlindSet(
    shellWalls: readonly BlindFacadeShellWall[],
): BlindFacadeDetermination {
    const blind = new Set<string>();
    try {
        if (shellWalls.length === 0) return { kind: 'determined', blind };

        const origin = getCurrentSiteOrigin();
        const snapshot = getNeighbourFootprints();
        const neighbourCount = snapshot?.footprints.length ?? 0;

        if (!origin || (origin.lat === 0 && origin.lon === 0) || neighbourCount === 0) {
            // No site frame or no neighbours → nothing to detect (the common
            // case) — a DETERMINED empty, not an unknown: there is genuinely
            // nothing to test against.
            return { kind: 'determined', blind };
        }

        // Project each neighbour footprint (lon/lat ring → world-XZ) about the same
        // pinned site origin the parcel boundary + shell walls live in.
        const footprints: ProximityFootprint[] = snapshot!.footprints.map((fp) => ({
            ring: fp.ring.map(([lon, lat]) =>
                latLonToSceneXZ({ lat, lon }, origin.lat, origin.lon),
            ),
        }));

        const walls: ProximityShellWall[] = shellWalls.map((w) => ({
            id: w.id,
            start: { x: w.start.x, z: w.start.z },
            end: { x: w.end.x, z: w.end.z },
        }));

        const setbackM = resolveSetbackM();
        const interiorPoint = shellCentroid(shellWalls);
        const hits = computeBlindFacadeHits(walls, footprints, {
            ...DEFAULT_PROXIMITY_CONFIG,
            setbackM,
            ...(interiorPoint ? { interiorPoint } : {}),
        });

        for (const h of hits) blind.add(h.wallId);

        // §DIAG-PARTY-WALL — always-on rule-compliance log (PW.2 detection).
        console.log(
            `[apartment-layout] §DIAG-PARTY-WALL detection: neighbours=${neighbourCount} ` +
            `setback=${setbackM.toFixed(2)}m shellWalls=${shellWalls.length} ` +
            `→ blind=${blind.size}` +
            (hits.length > 0
                ? ' [' + hits.map(h =>
                    `${h.wallId}(d=${h.distanceM.toFixed(2)}m,∠=${h.angleDeg.toFixed(0)}°,nbr#${h.footprintIndex})`,
                ).join(', ') + ']'
                : ''),
        );
    } catch (e) {
        // GR-10 — the failure is a VALUE, not an empty set. The old path
        // warned and fell through to `return blind`, asserting a suppression
        // set the crashed detection never computed.
        console.warn('[apartment-layout] §DIAG-PARTY-WALL detection failed:', e);
        return {
            kind: 'undetermined',
            scope: `blind/party façade detection over ${shellWalls.length} shell wall(s)`,
            reason: 'PLANNER_THREW',
            detail: `neighbour-footprint detection threw: ${e instanceof Error ? e.message : String(e)}`,
        };
    }
    return { kind: 'determined', blind };
}

/**
 * Resolve the BLIND/PARTY shell-wall ids for the given shell walls.
 *
 * Computes the PW.2 neighbour-footprint blind set, then UNIONs it with the manual
 * override (`window.__pryzmBlindFacadeWallIds`, intersected with live shell ids so a
 * stale id never leaks). Determined-EMPTY when there is no site data / no neighbours /
 * nothing qualifies AND no override — byte-identical to the pre-PW.2 behaviour.
 * NEVER throws; on any error returns the `undetermined` arm (C78 §8.1
 * `PLANNER_THREW`), never an empty set — "the detection crashed" and "no party
 * walls" are different facts (C75 §1.4), and the executors must decide, visibly,
 * what to do with the first one.
 *
 * @param shellWalls the storey's shell walls (world metres, from `gatherShellWalls`).
 * @returns the determination: the blind subset of `shellWalls[].id`, or a typed refusal.
 */
export function resolveBlindFacades(
    shellWalls: readonly BlindFacadeShellWall[],
): BlindFacadeDetermination {
    try {
        const ids = new Set(shellWalls.map(w => w.id));

        // PW.2 — neighbour-footprint proximity detection (determined-empty when
        // no site data; undetermined when the detection crashed).
        const detection = computeNeighbourBlindSet(shellWalls);
        if (detection.kind === 'undetermined') return detection;
        const blind = new Set(detection.blind);

        // Manual / test / demo override: window.__pryzmBlindFacadeWallIds = ['wall-id', …].
        // The deterministic injection point — UNION-ed with the computed set so it
        // augments (never erases) the detection. Intersect with live shell ids so a
        // stale id (from a previous shell) is ignored.
        const override = (globalThis as unknown as { __pryzmBlindFacadeWallIds?: unknown })
            .__pryzmBlindFacadeWallIds;
        if (Array.isArray(override)) {
            let added = 0;
            for (const v of override) {
                if (typeof v === 'string' && ids.has(v) && !blind.has(v)) { blind.add(v); added++; }
            }
            if (added > 0) {
                console.log(
                    `[apartment-layout] §DIAG-PARTY-WALL override: +${added} manual blind façade(s) ` +
                    `(union total ${blind.size}) [${[...blind].join(',')}]`,
                );
            }
        }
        return { kind: 'determined', blind };
    } catch (e) {
        // GR-10 (the ARM A row) — the failure leaves as a TYPED value. The old
        // `return new Set()` here is exactly the collapse the ledger named.
        return {
            kind: 'undetermined',
            scope: 'blind/party façade resolution',
            reason: 'PLANNER_THREW',
            detail: `resolveBlindFacades threw: ${e instanceof Error ? e.message : String(e)}`,
        };
    }
}
