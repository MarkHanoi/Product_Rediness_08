// STANDARD_MATERIAL_LIBRARY — the THREE-typed PROJECTION of the master catalogue.
//
// ─── C84 §1.3: this file is no longer the authority ─────────────────────────
// It used to hold 204 literal entries, each with a `THREE.Color` built at module
// load. That made it UNREACHABLE from every THREE-free consumer — including
// `geometry-kernel`, which has zero THREE imports by design and is the package
// that composes the material key and therefore DECIDES THE RENDERED COLOUR.
// Four of the six rival material vocabularies were minted by consumers that could
// not import this file and copied its numbers instead. See ADR-0333.
//
// The DATA now lives at L0 in `@pryzm/schemas/materials`, beneath every consumer.
// This file MAPS it into THREE types and holds no material data of its own.
// A projection maps the master; it never extends it. To add a material, add a row
// to `MATERIAL_CATALOG` — adding one here is what the §7 gate fails on.
//
// ⚠ EVERY PUBLIC EXPORT BELOW KEEPS ITS NAME, SIGNATURE AND BEHAVIOUR. 21 importers
// depend on them and a concurrent lane consumes them mid-flight (C84 §8.3).

import * as THREE from "@pryzm/renderer-three/three";
import { MATERIAL_CATALOG, hasAnyMap, type MaterialMaps, type MaterialRecord, type MaterialSurface, type MaterialTiling } from "@pryzm/schemas/materials";
import { disposeMaterialTextures } from "./materials/MaterialResolver";

export type { MaterialCategory } from "@pryzm/schemas/materials";

export enum VisualStyle {
    CONSISTENT_COLORS = "consistent",
    TEXTURES = "textures",
    REALISTIC = "realistic",
    SCHEMATIC = "schematic",
}

export type StandardMaterialDef = {
    id: string;
    label: string;
    category: string;
    params: THREE.MeshStandardMaterialParameters;
    /**
     * The master's LOGICAL map paths and real-world scale, carried through
     * unchanged. A projection MAPS the master (C84 §1.3) — these are master
     * fields, so passing them through is mapping, not extending. They are what
     * `applyMaterialMaps()` needs in order to derive a PER-SURFACE repeat.
     *
     * ⛔ THE `textures?: { color, normal, roughness }` FIELD THAT USED TO SIT HERE
     * IS DELETED (L-1702), and deleting it was the point of the slice rather than
     * a side effect. C100 §10.6 measured it READ at seven sites and WRITTEN by
     * nothing — *"all seven reads resolve `undefined` on every element, every
     * frame"* — and the obvious repair, "populate it", is WRONG:
     *
     *   a `THREE.Texture`'s `repeat` is only meaningful against a KNOWN uv space,
     *   and this field carried no uv space. A single pre-resolved texture set
     *   handed to seven call sites is correct on the ones whose geometry happens
     *   to be metre-UV and silently wrong on the rest — and three of those seven
     *   (`initUI`'s style sweep, the property inspector, the roof builder)
     *   re-material geometry that has NO uv attribute at all, where an attached
     *   map paints texel (0,0) over the whole surface.
     *
     * So the field is replaced by a seam that cannot be used wrong:
     * `applyMaterialMaps(params, def, uvSpace)`, where the caller must state what
     * its own UVs mean. `uvSpaceOfGeometry()` reads the builder's declared stamp
     * and refuses when there is none.
     */
    readonly maps?: MaterialMaps;
    readonly tiling?: MaterialTiling;
    /**
     * §MATERIAL-DECLARED-SURFACES (L-9702) — the master's DECLARED suitability,
     * carried through unchanged. A master field, so passing it through is
     * mapping and not extending (C84 §1.3).
     *
     * ⛔ ABSENT MEANS **NOT DECLARED**, NEVER "SUITABLE EVERYWHERE". Every
     * consumer must render that third state rather than assume one of the two
     * ordinary answers; `isDeclaredForSurface()` returns `null` for it so the
     * compiler makes the caller see it.
     */
    readonly surfaces?: readonly MaterialSurface[];
};

/**
 * One catalogue row -> the THREE-typed shape this module has always exposed.
 *
 * ⭐ EXPORTED as `projectMaterialRecord` since L-1702, and not only for tests: the
 * T2 tier (`UserMaterialStore`) holds records in the SAME shape (C100 §1.1), so a
 * user material needs the same projection a built-in gets. Exposing the one
 * projection is what stops a second one being written for T2 — which is exactly
 * how four of the six rival vocabularies C100 §1.1 counted came to exist.
 */
function project(m: MaterialRecord): StandardMaterialDef {
    const params: THREE.MeshStandardMaterialParameters = {
        color: new THREE.Color(m.color),
        metalness: m.metalness,
        roughness: m.roughness,
    };
    // Preserved exactly: the original entries carried these two keys ONLY on the
    // 20 rows that set them, and `MeshStandardMaterialParameters` treats an absent
    // key and `transparent: false` differently enough to matter to the renderer.
    if (m.transparent) {
        params.transparent = true;
        params.opacity = m.opacity;
    }
    // §MATERIAL-MAPS-AND-TILING (L-1702) — the master's map paths and real-world
    // scale ride through to the projection as DATA. No texture is loaded here:
    // resolution needs a uv space, which only the surface knows, so it happens in
    // `applyMaterialMaps()` at the point of use. That also means building
    // `STANDARD_MATERIAL_LIBRARY` at module load stays free — eagerly resolving
    // 205 rows would fire a request per map for materials nothing places.
    // §MATERIAL-DECLARED-SURFACES (L-9702). Carried on BOTH arms, because
    // suitability is orthogonal to whether a row has maps: a flat paint declares
    // `['wall', 'ceiling']` and has no texture at all, and dropping the field on
    // the map-less arm would have made "no maps" silently mean "no suitability".
    if (!hasAnyMap(m.maps)) {
        return { id: m.id, label: m.label, category: m.category, params, surfaces: m.surfaces };
    }
    return {
        id: m.id, label: m.label, category: m.category, params,
        maps: m.maps, tiling: m.tiling, surfaces: m.surfaces,
    };
}

/**
 * STANDARD_MATERIAL_LIBRARY — the master material library for PRYZM, projected
 * from `MATERIAL_CATALOG` (C84 §1.3). Exposed as a read-only "Materials Library"
 * schedule in the Data Panel (SchedulePanel -> Materials Schedule).
 *
 * ⭐ TEXTURE MAPS ARE REACHABLE SINCE L-1702 (§MATERIAL-MAPS-AND-TILING).
 * `project()` carries the master's `maps` + `tiling` through as DATA, and
 * `materials/MaterialResolver.ts` — SPEC-MATERIALS-REPOSITORY §3.2, built at last
 * — turns them into shared `THREE.Texture`s at the point of use, where the
 * surface's uv space is known. The dead `textures` field C100 §10.6 measured
 * (read at seven sites, written by nothing) is GONE; see `StandardMaterialDef`
 * for why populating it would have been the wrong repair.
 * `MaterialRecord.textureUrl` remains the separate (T2-only, swatch-only) home
 * for user uploads; C100 §10.6 records why that path is still a decoy.
 */
export const STANDARD_MATERIAL_LIBRARY: StandardMaterialDef[] = MATERIAL_CATALOG.map(project);

/** The ONE projection from a master record (either tier) to the THREE-typed view. */
export const projectMaterialRecord = project;

/**
 * Index of the master library by id, built once.
 *
 * Why this exists: the library shipped NO lookup helper, so all 21 importers
 * hand-roll `STANDARD_MATERIAL_LIBRARY.find(m => m.id === id)` — an O(n) scan
 * over 200+ entries repeated per element per rebuild. The bigger cost is that
 * a hand-rolled scan gives every call site its own miss behaviour, which is
 * how "I set the material and nothing changed" bugs get written.
 */
const MATERIAL_BY_ID: ReadonlyMap<string, StandardMaterialDef> =
    new Map(STANDARD_MATERIAL_LIBRARY.map(def => [def.id, def]));

/** Look up a master-library material by id. Returns undefined on a miss. */
export function findMaterialById(id: string): StandardMaterialDef | undefined {
    return MATERIAL_BY_ID.get(id);
}

/**
 * Resolve a master-library material id to a `#rrggbb` string.
 *
 * This is the THREE-free-FACING edge of the master library. Consumers that must
 * stay free of THREE — colour-resolution services, the AI finish resolver —
 * cannot import this module, and that constraint is exactly what produced the
 * transcribed id/hex copy in ai-host's `finishRef.ts`. Passing THIS function in
 * as a resolver lets such a consumer read the master data set without taking the
 * THREE dependency, instead of copying the values into a rival table.
 *
 * Returns undefined on a miss so callers fall through their own chain — a miss
 * must never be silently rendered as black.
 */
export function materialHexById(id: string): string | undefined {
    const def = MATERIAL_BY_ID.get(id);
    if (!def) return undefined;
    const colour = def.params.color;
    if (!(colour instanceof THREE.Color)) return undefined;
    return `#${colour.getHexString()}`;
}

// ------------------------------------------------------------------
// Wall view-style materials — MOVED OUT (C100 §9.9 / S13, 2026-08-19)
// ------------------------------------------------------------------
// These four used to be DEFINED here, and their `0x` hexes were the literals
// C100 §9.7 found sitting inside the projection where a `#rrggbb` gate could
// not see them. S13 asked whether they were master rows or a C04 view style;
// §9.9 DECIDED **view style**, on four measurements, and moved them to
// `wallViewStyleMaterials.ts` — which carries the reasoning in full.
//
// They are RE-EXPORTED, not re-declared: this file holds no colour data of its
// own (C84 §1.3), and 21 importers plus a concurrent lane depend on the names
// resolving from `@pryzm/core-app-model/material-library` exactly as before.
export {
    WALL_SCHEMATIC_MATERIAL,
    WALL_REALISTIC_MATERIAL,
    createWallSchematicMaterial,
    createWallRealisticMaterial,
} from './wallViewStyleMaterials';

/**
 * Dispose every texture the library has caused to be loaded.
 *
 * ⚠ REWRITTEN L-1702. The old body walked `STANDARD_MATERIAL_LIBRARY` disposing
 * `def.textures`, a field that no longer exists — and could not exist, because a
 * texture's `repeat` is only meaningful against a known uv space and a material
 * definition has no surface. The textures are owned by the RESOLVER's cache (one
 * per path x scale, shared by every element that uses the material), so disposal
 * delegates there. Same observable effect, and one owner rather than two.
 */
export function disposeLibraryTextures(): void {
    disposeMaterialTextures();
}
