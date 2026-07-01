// Office furnish — CIRCULATION CLEARANCES + FINAL VALIDATION (SPEC §7 + §9 steps 7–8).
//
// SPEC §7: furniture must NEVER obstruct circulation; escape routes stay unobstructed. SPEC §9 step
// 8: after placement, validate that ALL furniture respects circulation, accessibility and fire-egress
// constraints. This module models the KEEP-OUT geometry (the circulation rings + escape spokes the
// circulation-first architecture laid FIRST) and asserts no placed-module footprint overlaps it.
//
// The office floor is radial (origin-centred): the primary corridor is an annulus around the core,
// the secondary corridor is a perimeter annulus, and escape routes are axial spokes to the glass.
// PURE + DETERMINISTIC — zero THREE / DOM / I/O (L2).

import type { PlacedModule } from './officeModuleTypes.js';

/** Named minimum clearances (m) — SPEC §7. */
export const CLEARANCES = {
    mainCorridorMinM: 1.8,       // 1800–2400 mm
    mainCorridorMaxM: 2.4,
    secondaryCorridorMinM: 1.2,  // 1200–1500 mm
    secondaryCorridorMaxM: 1.5,
    deskClearanceMinM: 0.9,      // 900–1200 mm
    meetingAccessMinM: 1.0,      // ≥ 1000 mm
} as const;

/** A radial annulus keep-out band (a circulation ring), origin-centred. */
export interface AnnulusKeepout {
    readonly label: string;
    readonly innerR: number;
    readonly outerR: number;
}

/** An axial escape spoke keep-out (a half-width corridor along a heading, from innerR to outerR). */
export interface SpokeKeepout {
    readonly label: string;
    /** Heading (radians). */
    readonly angle: number;
    /** Corridor half-width (m). */
    readonly halfWidthM: number;
    readonly innerR: number;
    readonly outerR: number;
}

/** The full keep-out model for a floor: the core disc, circulation annuli, and escape spokes. */
export interface FloorKeepouts {
    /** Core keep-out radius (m) — nothing furnished inside the core. */
    readonly coreR: number;
    /** Plate radius (m) — nothing furnished past the glass. */
    readonly discR: number;
    readonly annuli: readonly AnnulusKeepout[];
    readonly spokes: readonly SpokeKeepout[];
}

/** Sample points of a module bbox tested against a keep-out (corners + centre + edge midpoints). */
function sampleBBox(m: PlacedModule): Array<{ x: number; z: number }> {
    const { x0, z0, x1, z1 } = m.bbox;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    return [
        { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 },
        { x: mx, z: mz }, { x: mx, z: z0 }, { x: mx, z: z1 }, { x: x0, z: mz }, { x: x1, z: mz },
    ];
}

/** True iff a point lies inside an annulus keep-out. */
function inAnnulus(x: number, z: number, a: AnnulusKeepout): boolean {
    const r = Math.hypot(x, z);
    return r >= a.innerR && r <= a.outerR;
}

/** True iff a point lies inside an axial escape spoke corridor. */
function inSpoke(x: number, z: number, s: SpokeKeepout): boolean {
    const r = Math.hypot(x, z);
    if (r < s.innerR || r > s.outerR) return false;
    // Perpendicular distance to the spoke centre-line (the ray at angle s.angle).
    const dirX = Math.cos(s.angle), dirZ = Math.sin(s.angle);
    const perp = Math.abs(-dirZ * x + dirX * z);
    // Only count the half-plane in front of the origin along the heading (a spoke is one-sided).
    const along = dirX * x + dirZ * z;
    return along > 0 && perp <= s.halfWidthM;
}

/** A single validation violation. */
export interface ClearanceViolation {
    readonly moduleKind: PlacedModule['kind'];
    readonly reason: string;
}

/** The result of the §9-8 final validation pass. */
export interface FurnishValidation {
    readonly ok: boolean;
    readonly modulesPlaced: number;
    readonly violations: readonly ClearanceViolation[];
    /** The tightest clearance (m) any module leaves to the nearest keep-out band (diagnostic). */
    readonly minClearanceM: number;
    /** The `§DIAG-OFFICE-FURNISH-VALIDATION` one-line summary. */
    readonly diagnostic: string;
}

/**
 * SPEC §9 step 8 — validate that no placed module obstructs circulation or the fire-egress routes.
 * A module is a VIOLATION if any bbox sample point falls inside a circulation annulus, an escape
 * spoke, the core keep-out, or outside the glass. Returns the violations + the `minClearanceM` (the
 * tightest gap any module leaves to a keep-out band) + a `§DIAG-OFFICE-FURNISH-VALIDATION` summary.
 * PURE + deterministic — the placement engine should produce ZERO violations by construction; this
 * is the assertion that proves it (and the test hook).
 */
export function validateFurnish(modules: readonly PlacedModule[], keepouts: FloorKeepouts): FurnishValidation {
    const violations: ClearanceViolation[] = [];
    let minClearanceM = Infinity;
    for (const m of modules) {
        const pts = sampleBBox(m);
        let hit = false;
        for (const p of pts) {
            const r = Math.hypot(p.x, p.z);
            if (r < keepouts.coreR) { violations.push({ moduleKind: m.kind, reason: `inside core (r=${r.toFixed(2)}<${keepouts.coreR})` }); hit = true; break; }
            if (r > keepouts.discR) { violations.push({ moduleKind: m.kind, reason: `past glass (r=${r.toFixed(2)}>${keepouts.discR})` }); hit = true; break; }
            for (const a of keepouts.annuli) {
                if (inAnnulus(p.x, p.z, a)) { violations.push({ moduleKind: m.kind, reason: `overlaps ${a.label}` }); hit = true; break; }
            }
            if (hit) break;
            for (const s of keepouts.spokes) {
                if (inSpoke(p.x, p.z, s)) { violations.push({ moduleKind: m.kind, reason: `overlaps ${s.label}` }); hit = true; break; }
            }
            if (hit) break;
        }
        // Track the tightest clearance to any annulus band (radial gap) for the diagnostic.
        if (!hit) {
            const cr = Math.hypot(m.cx, m.cz);
            for (const a of keepouts.annuli) {
                const gap = cr < a.innerR ? a.innerR - cr : cr - a.outerR;
                if (gap >= 0) minClearanceM = Math.min(minClearanceM, gap);
            }
        }
    }
    const ok = violations.length === 0;
    const minC = Number.isFinite(minClearanceM) ? minClearanceM : 0;
    const diagnostic =
        `§DIAG-OFFICE-FURNISH-VALIDATION ok=${ok} modules=${modules.length} ` +
        `violations=${violations.length} minClearanceM=${minC.toFixed(2)}`;
    return { ok, modulesPlaced: modules.length, violations, minClearanceM: minC, diagnostic };
}
