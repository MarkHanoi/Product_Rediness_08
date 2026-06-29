// D-FLE — §FURNISH-ACCENT-OVERLAP (2026-06-29) — accent overlap resolution.
//
// THE DEFECT (live §VALIDATE warnings on furnished bedrooms):
//   bedside_table[1] OVERLAPS lamp[12]   (lamp clashes its OWN host table)
//   dresser[0]      OVERLAPS lamp[8]     (a riding lamp's plan footprint over a
//   dresser[0]      OVERLAPS lamp[9]      neighbouring FLOOR piece)
//
// Two distinct causes, both shipped because the lamps are appended AFTER the main
// place pass and bypass every collision/validation check:
//
//   1. HOST-CLASH (the lamp-vs-its-own-host warning). A bedside/integrated lamp
//      SITS ON its host (a bedside_table / Japanese nightstand): its `position.y`
//      is the host top, but its footprint `baseOffset` was left 0. The post-furnish
//      validator's height-awareness (`bandsOverlap`) therefore reads the lamp at the
//      FLOOR band [0, h] and reports it clashing the host (whose band is [0, hostH]).
//      FIX: stamp the lamp's `baseOffset` to the host TOP surface so the lamp band is
//      [hostTop, hostTop+h] — strictly above the host band → no vertical overlap, so
//      a lamp legitimately resting on its table is no longer a clash. (Identical
//      mechanism to the rug-under-bed / mirror-above-bed height exemptions already in
//      the validator.)
//
//   2. NEIGHBOUR-CLASH (the dresser-vs-lamp warning). A riding lamp's PLAN footprint
//      genuinely overlaps a NON-host FLOOR piece (a dresser / wardrobe / vanity) whose
//      vertical band still overlaps the lamp's. Height separation does NOT help here —
//      the boxes truly intersect in plan. FIX: a reject→retry→drop feedback loop. For
//      each accent we test its plan footprint (band-aware) against every other placed
//      FLOOR piece except its own host; on a clash we NUDGE it a few steps toward the
//      host centre / along the host, and if no clear slot is found we DROP the accent
//      rather than ship the overlap. This makes the validator's finding actually feed
//      back into placement instead of merely logging.
//
// PURE + deterministic — no THREE/DOM, no RNG. Metres, world XZ.

import type { PlacedFurniture } from './types.js';
import { footprintCorners, quadsOverlap, type Quad } from './collision.js';

const EPS = 1e-6;

/** The accent kinds that RIDE a host surface (lamp on a bedside table / nightstand)
 *  and so must be height-separated + overlap-resolved against neighbouring floor
 *  pieces. Kept narrow on purpose: only the small task accents the lamp passes emit. */
const ACCENT_KINDS = new Set<PlacedFurniture['kind']>(['lamp']);
const isAccent = (k: PlacedFurniture['kind']): boolean => ACCENT_KINDS.has(k);

/** Mirrors validate.ts: a flat floor UNDERLAY (rug) — band ignored vs others. */
const UNDERLAY_H_M = 0.05;
const isUnderlay = (p: PlacedFurniture): boolean =>
    p.footprint.baseOffset < EPS && p.footprint.h <= UNDERLAY_H_M;
/** Mirrors validate.ts: a wall-mounted accessory (mirror / rod / art) at height. */
const MOUNT_BASE_M = 0.40;
const isMounted = (p: PlacedFurniture): boolean => p.footprint.baseOffset >= MOUNT_BASE_M;

/** The oriented plan footprint of a placed item (same convention as the solver). */
function quadFor(p: PlacedFurniture): Quad {
    return footprintCorners(p.position.x, p.position.z, p.footprint.w, p.footprint.l, p.rotationY);
}

/** Vertical band overlap — IDENTICAL to validate.ts `bandsOverlap` so the resolver
 *  and the validator agree on what "clashes". */
function bandsOverlap(a: PlacedFurniture, b: PlacedFurniture): boolean {
    const aLo = a.footprint.baseOffset, aHi = aLo + a.footprint.h;
    const bLo = b.footprint.baseOffset, bHi = bLo + b.footprint.h;
    return aHi > bLo + EPS && bHi > aLo + EPS;
}

/** TRUE when the validator would report `a OVERLAPS b` — the SAME predicate the
 *  post-furnish gate uses (height-aware + underlay/mounted exemptions + oriented
 *  quad overlap). Resolving against THIS predicate guarantees a residual clash the
 *  validator would flag is the one we drop. */
function validatorWouldClash(a: PlacedFurniture, b: PlacedFurniture, qa: Quad, qb: Quad): boolean {
    if (!bandsOverlap(a, b)) return false;
    if (isUnderlay(a) !== isUnderlay(b)) return false;
    if (isMounted(a) !== isMounted(b)) return false;
    return quadsOverlap(qa, qb);
}

/** Find the host an accent rides: the nearest non-accent floor piece whose plan
 *  footprint CONTAINS the accent centre (a lamp sits centred on its table). Returns
 *  the index in `others`, or -1 when the accent rides nothing (a free-standing floor
 *  lamp — left untouched). */
function findHostIndex(accent: PlacedFurniture, others: readonly PlacedFurniture[], otherQuads: readonly Quad[]): number {
    let best = -1;
    let bestD = Infinity;
    const ac = { x: accent.position.x, z: accent.position.z };
    for (let i = 0; i < others.length; i++) {
        const o = others[i]!;
        if (isAccent(o.kind) || isUnderlay(o) || isMounted(o)) continue;   // host is a floor body
        // The accent centre must lie within the candidate host's plan footprint.
        if (!pointInQuad(ac, otherQuads[i]!)) continue;
        const d = (o.position.x - ac.x) ** 2 + (o.position.z - ac.z) ** 2;
        if (d < bestD - EPS) { bestD = d; best = i; }
    }
    return best;
}

/** Point-in-convex-quad (winding-agnostic, inclusive). */
function pointInQuad(p: { x: number; z: number }, q: Quad): boolean {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
        const a = q[i]!, b = q[(i + 1) & 3]!;
        const cross = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
        if (cross > EPS) { if (sign < 0) return false; sign = 1; }
        else if (cross < -EPS) { if (sign > 0) return false; sign = -1; }
    }
    return true;
}

/**
 * §FURNISH-ACCENT-OVERLAP — resolve riding accents (lamps) against their host + the
 * room's other floor furniture, returning the SAME list with each accent either
 *   (a) lifted so its footprint `baseOffset` sits on the host top (height-separated
 *       from the host → the host-clash warning is gone), and
 *   (b) KEPT (no neighbour clash), NUDGED toward its host until clear, or DROPPED
 *       (a residual clash the validator would flag).
 *
 * Non-accent items pass through byte-identical. Free-standing accents (no host
 * found) are also passed through unchanged (the corner floor lamp is placed by the
 * solver's collision pass already). Pure + deterministic.
 */
export function resolveAccentOverlaps(placed: readonly PlacedFurniture[]): PlacedFurniture[] {
    // Non-accent items form the obstacle set the accents resolve against.
    const bodies: PlacedFurniture[] = placed.filter(p => !isAccent(p.kind));
    const bodyQuads = bodies.map(quadFor);

    const result: PlacedFurniture[] = [];
    // keep all non-accents; track placed accents so two lamps don't overlap each other
    const placedAccents: PlacedFurniture[] = [];
    const placedAccentQuads: Quad[] = [];
    for (const p of placed) {
        if (!isAccent(p.kind)) { result.push(p); continue; }

        const hostIdx = findHostIndex(p, bodies, bodyQuads);
        // (a) Height-separate: sit the accent footprint ON the host top so the
        //     validator never reads it as floor-clashing the host.
        let accent = p;
        if (hostIdx >= 0) {
            const host = bodies[hostIdx]!;
            const hostTop = host.footprint.baseOffset + host.footprint.h;
            if (Math.abs(accent.footprint.baseOffset - hostTop) > EPS) {
                accent = { ...accent, footprint: { ...accent.footprint, baseOffset: hostTop } };
            }
        }

        // (b) Neighbour resolution: nudge toward the host centre / drop on a residual
        //     clash. Candidate offsets: the original spot, then small pulls toward the
        //     host centre (so the lamp slides INWARD onto its table, away from a
        //     neighbouring floor piece it was poking).
        const candidates = nudgeCandidates(accent, hostIdx >= 0 ? bodies[hostIdx]! : null);
        let chosen: { item: PlacedFurniture; quad: Quad } | null = null;
        for (const cand of candidates) {
            const cq = quadFor(cand);
            let clash = false;
            // against floor bodies (skip the host — the lamp legitimately sits on it)
            for (let i = 0; i < bodies.length; i++) {
                if (i === hostIdx) continue;
                if (validatorWouldClash(cand, bodies[i]!, cq, bodyQuads[i]!)) { clash = true; break; }
            }
            // against already-placed accents (two lamps must not overlap each other)
            if (!clash) {
                for (let j = 0; j < placedAccents.length; j++) {
                    if (validatorWouldClash(cand, placedAccents[j]!, cq, placedAccentQuads[j]!)) { clash = true; break; }
                }
            }
            if (!clash) { chosen = { item: cand, quad: cq }; break; }
        }
        if (chosen) {
            result.push(chosen.item);
            placedAccents.push(chosen.item);
            placedAccentQuads.push(chosen.quad);
        }
        // else: DROP the accent (a residual overlap the validator would flag) — better
        //       a missing reading lamp than a lamp embedded in the dresser.
    }
    return result;
}

/** Deterministic candidate poses for an accent: the original, then small pulls toward
 *  the host CENTRE (so the lamp slides inboard onto its host, clearing a neighbour it
 *  was poking). When there is no host, only the original is tried (free-standing). */
function nudgeCandidates(accent: PlacedFurniture, host: PlacedFurniture | null): PlacedFurniture[] {
    const out: PlacedFurniture[] = [accent];
    if (!host) return out;
    const hx = host.position.x, hz = host.position.z;
    const dx = hx - accent.position.x, dz = hz - accent.position.z;
    const len = Math.hypot(dx, dz);
    if (len < EPS) return out;                       // already centred on the host
    const ux = dx / len, uz = dz / len;
    // Pull toward the host centre in small steps, clamped so the lamp never passes the
    // host centre (it must stay ON the host).
    const STEP = 0.05;
    for (let s = STEP; s <= len + EPS; s += STEP) {
        out.push({
            ...accent,
            position: { x: accent.position.x + ux * s, y: accent.position.y, z: accent.position.z + uz * s },
        });
    }
    return out;
}
