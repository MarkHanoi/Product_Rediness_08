// §ROOM-MODULE-RULE-ENGINE P2 — kitchen HARD-rule VALIDATION pass (§59 P2).
//
// The FIRST real consumer of the §59 corpus: P1 seeded the ontology DATA
// (moduleOntology.ts / ruleSchema.ts); P2 ENFORCES the HARD rules as a pure
// validation pass over the kitchen layout's PlacedFurniture[] output.
//
// Pure + deterministic (ADR-0061 purity): NO geometry/THREE/DOM imports, NO RNG,
// NO Date.now — only the placements + the ontology + the room polygon/openings.
// Metres, world XZ. Returns a structured { valid, violations[] } the caller logs
// (§DIAG-KITCHEN-RULES) and uses to prefer a valid arrangement when it can choose.
//
// SCOPE (P2 HARD rules transcribed from the founder's 2026-06-11 corpus, mapped
// from the ontology forbiddenZones + clearance fields):
//   • C01  corner-forbidden appliances NOT in a corner       (forbiddenZones 'corner')
//   • HOB  hob side-clearance ≥300 mm to a wall / tall unit   (HobUnit.clearance.sideMm)
//   • HOB  hob not directly under a window                    (forbiddenZones 'underWindow')
//   • DW   dishwasher front clearance ≥900 mm                 (Dishwasher.clearance.frontMm)
//   • FR   fridge vent: side ≥25 mm / top ≥50 mm + door swing (Fridge.clearance)
//   • SWING appliance not blocking a door swing               (door keep-clear)
//   • WIN  no floor module overlapping a window below sill    (window keep-clear)
//
// These are CHECKS, not placement — kitchenLayout still composes the run; this pass
// reports HARD violations so the layout can be preferred/flagged, never crashing.

import type { PlacedFurniture, FurnitureKind, OpeningPose, Pt, RoomWallSeg, FurnishRoomInput }
    from '../types.js';
import type { ModuleMeta, RoomOntology } from './ruleSchema.js';
import { KITCHEN_ONTOLOGY, kitchenModule } from './moduleOntology.js';

/** One HARD-rule violation. `rule` is the stable rule id; `kind` is the offending
 *  furniture kind; `detail` is a human string for the §DIAG log. */
export interface KitchenViolation {
    readonly rule: string;            // 'C01-corner' | 'HOB-side' | 'HOB-window' | 'DW-front' | 'FR-vent' | 'SWING-door' | 'WIN-overlap'
    readonly kind: FurnitureKind;
    readonly detail: string;
    readonly position: Pt;
}

export interface KitchenValidationResult {
    readonly valid: boolean;                       // false ⇒ ≥1 HARD violation
    readonly violations: readonly KitchenViolation[];
}

/** Map a D-FLE FurnitureKind to its ontology module type. The ontology is keyed by
 *  the founder's PascalCase module types; the placement engine uses snake-case
 *  appliance kinds. This is the single bridge between the two namespaces. */
const KIND_TO_MODULE: Partial<Record<FurnitureKind, string>> = {
    sink: 'SinkUnit',
    hob: 'HobUnit',
    oven: 'OvenTower',
    dishwasher: 'Dishwasher',
    fridge: 'Fridge',
    extractor: 'Extractor',
    base_unit: 'BaseCabinet',
    washing_machine: 'BaseCabinet',   // a run-mounted washer occupies a base cell
    kitchen_island: 'Island',
    pantry_cabinet: 'Pantry',
};

/** The ontology meta for a placed kind, or undefined when it isn't an ontology module. */
function moduleFor(kind: FurnitureKind, ontology: RoomOntology = KITCHEN_ONTOLOGY): ModuleMeta | undefined {
    const type = KIND_TO_MODULE[kind];
    return type ? (ontology.modules[type] ?? kitchenModule(type)) : undefined;
}

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.z - b.z);

/** A FULL-HEIGHT (tall) floor module — the kind that blocks the hob's landing space
 *  or a fridge's vent when butted flush. Worktop-height units (sink/hob/base/oven
 *  under-counter) are NOT tall: the worktop runs continuously over them. The hob's
 *  ≥300 side-clearance + the fridge's vent gap are HARD only against these. */
function isTallUnit(kind: FurnitureKind): boolean {
    return kind === 'fridge' || kind === 'pantry_cabinet';
}

/** Axis-aligned half-extents of a placement after its (cardinal) yaw. `w` runs
 *  along the wall, `l` is depth into the room; yaw 90/270 swaps them. */
function halfExtents(p: PlacedFurniture): { hx: number; hz: number } {
    const q = Math.round(p.rotationY / (Math.PI / 2)) & 3;
    const ew = (q === 1 || q === 3) ? p.footprint.l : p.footprint.w;
    const el = (q === 1 || q === 3) ? p.footprint.w : p.footprint.l;
    return { hx: ew / 2, hz: el / 2 };
}

/** AABB of a placement (metres, world XZ). */
function aabbOf(p: PlacedFurniture): { x0: number; z0: number; x1: number; z1: number } {
    const { hx, hz } = halfExtents(p);
    const c = p.position;
    return { x0: c.x - hx, z0: c.z - hz, x1: c.x + hx, z1: c.z + hz };
}

const aabbOverlap = (
    a: { x0: number; z0: number; x1: number; z1: number },
    b: { x0: number; z0: number; x1: number; z1: number },
): boolean => a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6;

/** Is the placement centred near a polygon VERTEX (a room corner)? A run module is
 *  "in a corner" when its centre is within `tol` of a polygon corner — the cell
 *  that wraps the L/U corner. Deterministic geometric test (no module-index magic). */
function inCorner(p: PlacedFurniture, polygon: readonly Pt[], tol: number): boolean {
    const c = { x: p.position.x, z: p.position.z };
    for (const v of polygon) {
        // The module centre sits ~half a cabinet (0.3 m) + clearance off the wall, so
        // a corner cell's centre is ~0.4-0.5 m from the polygon vertex along the
        // diagonal. `tol` (default ≈ a module width) captures that corner band.
        if (dist(c, v) <= tol) return true;
    }
    return false;
}

/** True when ANY window's centre projects onto the placement's wall-facing span —
 *  i.e. the module sits directly under/over a window aperture. Tests the module's
 *  along-wall extent against each window centre projected to the same line. */
function underAnyWindow(p: PlacedFurniture, windows: readonly OpeningPose[]): OpeningPose | null {
    const ab = aabbOf(p);
    for (const w of windows) {
        // Window centre inside the module's footprint AABB (grown by the window
        // half-width along the wall) → the module spans under the aperture.
        const half = w.width / 2;
        if (w.center.x >= ab.x0 - half && w.center.x <= ab.x1 + half &&
            w.center.z >= ab.z0 - half && w.center.z <= ab.z1 + half) {
            return w;
        }
    }
    return null;
}

/** A door's keep-clear swing rectangle (mirrors kitchenLayout.doorObstacles /
 *  placeSolver.doorObstacles: a 0.9 m-deep band the door sweeps into the room). */
function doorSwingAabb(d: OpeningPose): { x0: number; z0: number; x1: number; z1: number } {
    const cx = d.center.x + d.normal.x * 0.45;
    const cz = d.center.z + d.normal.z * 0.45;
    // width along the wall, 0.9 deep into the room; the band is axis-aligned for
    // the cardinal walls the apartment/house shells use.
    const along = d.width / 2;
    const depth = 0.45;
    // normal is cardinal → swap extents when the door faces along x.
    const facesX = Math.abs(d.normal.x) > Math.abs(d.normal.z);
    const hx = facesX ? depth : along;
    const hz = facesX ? along : depth;
    return { x0: cx - hx, z0: cz - hz, x1: cx + hx, z1: cz + hz };
}

/**
 * Validate a kitchen layout's module placements against the §59 HARD rules.
 *
 * Pure + deterministic. `polygon`, `doors`, `windows` come from the same
 * FurnishRoomInput the layout was planned from; `ontology` defaults to the kitchen
 * ontology. The result lists every HARD violation; `valid` is true iff none fired.
 *
 * The clearance thresholds are READ FROM THE ONTOLOGY (never re-hard-coded) so the
 * validator can never drift from the P1 corpus.
 */
export function validateKitchenLayout(
    placed: readonly PlacedFurniture[],
    room: Pick<FurnishRoomInput, 'polygon' | 'doors' | 'windows'> &
        { walls?: readonly RoomWallSeg[] },
    ontology: RoomOntology = KITCHEN_ONTOLOGY,
): KitchenValidationResult {
    const violations: KitchenViolation[] = [];
    const polygon = room.polygon;
    const doors = room.doors ?? [];
    const windows = room.windows ?? [];

    // Floor (worktop-height) modules only; the extractor + wall units are above the
    // worktop and exempt from the floor-clearance / corner / window-sill rules.
    const floor = placed.filter(p => p.kind !== 'extractor' && p.footprint.baseOffset < 0.5);

    const mm = (n: number): number => n / 1000;   // ontology mm → metres

    for (const p of floor) {
        const meta = moduleFor(p.kind, ontology);
        const at = { x: p.position.x, z: p.position.z };

        // ── C01 — corner-forbidden appliance NOT in a corner ─────────────────────
        if (meta?.forbiddenZones?.includes('corner')) {
            // corner tolerance ≈ one module (0.6) + the wall offset (~0.3) diagonal.
            if (inCorner(p, polygon, 0.75)) {
                violations.push({
                    rule: 'C01-corner', kind: p.kind, position: at,
                    detail: `${p.kind} (${meta.moduleType}) sits in a room corner (forbidden)`,
                });
            }
        }

        // ── HOB — under a window + side-clearance to a wall / tall unit ───────────
        if (p.kind === 'hob' && meta) {
            if (meta.forbiddenZones?.includes('underWindow')) {
                const win = underAnyWindow(p, windows);
                if (win) {
                    violations.push({
                        rule: 'HOB-window', kind: p.kind, position: at,
                        detail: `hob sits under a window aperture (fire/draught risk)`,
                    });
                }
            }
            const sideMin = mm(meta.clearance.sideMm ?? 0);
            if (sideMin > 0) {
                // Need ≥ sideMin clear on EACH along-wall side to a TALL unit / wall.
                // The HARD safety rule is the hob's landing space beside a TALL
                // obstruction (a full-height fridge / pantry / tall tower). An
                // under-counter oven or a worktop-height base unit butting flush is
                // fine (the worktop continues over them), so only TALL neighbours
                // count — matching the founder's "≥300 to a tall/wall" wording.
                const tallNeighbour = floor.find(o =>
                    o !== p && isTallUnit(o.kind) &&
                    Math.abs(o.rotationY - p.rotationY) < 1e-3,
                );
                if (tallNeighbour) {
                    const gap = edgeGapAlongWall(p, tallNeighbour);
                    if (gap >= 0 && gap < sideMin - 1e-6) {
                        violations.push({
                            rule: 'HOB-side', kind: p.kind, position: at,
                            detail: `hob ${(gap * 1000).toFixed(0)}mm from ${tallNeighbour.kind} ` +
                                `(< ${meta.clearance.sideMm}mm side-clearance)`,
                        });
                    }
                }
            }
        }

        // ── DW — dishwasher front clearance ≥ frontMm ────────────────────────────
        if (p.kind === 'dishwasher' && meta) {
            const frontMin = mm(meta.clearance.frontMm ?? 0);
            // The placement's own clearFront models the reserved band; flag when the
            // footprint's reserved front is below the ontology minimum.
            if (frontMin > 0 && p.footprint.clearFront + 1e-6 < frontMin) {
                violations.push({
                    rule: 'DW-front', kind: p.kind, position: at,
                    detail: `dishwasher front clearance ${(p.footprint.clearFront * 1000).toFixed(0)}mm ` +
                        `< ${meta.clearance.frontMm}mm`,
                });
            }
        }

        // ── FR — fridge vent (side ≥25 / top ≥50) — the vent gap matters against
        // ANOTHER TALL appliance flush beside it (two fridges / fridge + oven tower
        // butting hot sides). A worktop-height base cabinet beside a fridge does NOT
        // block the vent (the carcass sides clear above the worktop), so only a TALL
        // neighbour triggers the rule. ───────────────────────────────────────────
        if (p.kind === 'fridge' && meta) {
            const sideMin = mm(meta.clearance.sideMm ?? 0);
            if (sideMin > 0) {
                const neighbour = floor
                    .filter(o => o !== p && isTallUnit(o.kind) && Math.abs(o.rotationY - p.rotationY) < 1e-3)
                    .map(o => ({ o, gap: edgeGapAlongWall(p, o) }))
                    .filter(g => g.gap >= 0)
                    .sort((a, b) => a.gap - b.gap)[0];
                if (neighbour && neighbour.gap < sideMin - 1e-6) {
                    violations.push({
                        rule: 'FR-vent', kind: p.kind, position: at,
                        detail: `fridge ${(neighbour.gap * 1000).toFixed(0)}mm from ${neighbour.o.kind} ` +
                            `(< ${meta.clearance.sideMm}mm vent gap)`,
                    });
                }
            }
        }

        // ── SWING — appliance not blocking a door swing ──────────────────────────
        const ab = aabbOf(p);
        for (const d of doors) {
            if (aabbOverlap(ab, doorSwingAabb(d))) {
                violations.push({
                    rule: 'SWING-door', kind: p.kind, position: at,
                    detail: `${p.kind} overlaps a door swing zone`,
                });
                break;
            }
        }

        // ── WIN — no floor module overlapping a window below the sill ────────────
        // Only TALL floor modules (fridge / pantry) block a window below the sill;
        // worktop-height units (sink/hob/base) sit under the cill and are fine — the
        // sink UNDER the window is the desired ergonomic. So flag tall units only.
        if (p.kind === 'fridge' || p.kind === 'pantry_cabinet') {
            const win = underAnyWindow(p, windows);
            if (win) {
                violations.push({
                    rule: 'WIN-overlap', kind: p.kind, position: at,
                    detail: `tall ${p.kind} overlaps a window aperture (blocks daylight)`,
                });
            }
        }
    }

    return { valid: violations.length === 0, violations };
}

/** Edge-to-edge gap (metres) between two same-orientation modules measured along
 *  the shared wall axis. Returns the clear distance between their nearer faces, or
 *  -1 when they are not collinear (different wall line, off-axis). */
function edgeGapAlongWall(a: PlacedFurniture, b: PlacedFurniture): number {
    const q = Math.round(a.rotationY / (Math.PI / 2)) & 3;
    const alongX = (q === 0 || q === 2);   // module width runs along x for yaw 0/180
    const ea = aabbOf(a), eb = aabbOf(b);
    if (alongX) {
        // collinear → their z spans must overlap (same wall line).
        if (ea.z1 < eb.z0 - 0.3 || eb.z1 < ea.z0 - 0.3) return -1;
        if (eb.x0 >= ea.x1) return eb.x0 - ea.x1;
        if (ea.x0 >= eb.x1) return ea.x0 - eb.x1;
        return 0;   // overlapping along the wall
    }
    if (ea.x1 < eb.x0 - 0.3 || eb.x1 < ea.x0 - 0.3) return -1;
    if (eb.z0 >= ea.z1) return eb.z0 - ea.z1;
    if (ea.z0 >= eb.z1) return ea.z0 - eb.z1;
    return 0;
}

/** Format a validation result for the §DIAG-KITCHEN-RULES log line. Pure. */
export function formatKitchenViolations(roomId: string, res: KitchenValidationResult): string {
    if (res.valid) return `§DIAG-KITCHEN-RULES room=${roomId} valid — 0 HARD violations`;
    const summary = res.violations.map(v => `${v.rule}:${v.kind}`).join(', ');
    return `§DIAG-KITCHEN-RULES room=${roomId} INVALID ${res.violations.length} HARD ` +
        `violation(s) — ${summary}`;
}
