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
import { MATERIAL_CATALOG, type MaterialRecord } from "@pryzm/schemas/materials";

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
    textures?: {
        color?: THREE.Texture;
        normal?: THREE.Texture;
        roughness?: THREE.Texture;
    };
};

/** One catalogue row -> the THREE-typed shape this module has always exposed. */
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
    return { id: m.id, label: m.label, category: m.category, params };
}

/**
 * STANDARD_MATERIAL_LIBRARY — the master material library for PRYZM, projected
 * from `MATERIAL_CATALOG` (C84 §1.3). Exposed as a read-only "Materials Library"
 * schedule in the Data Panel (SchedulePanel -> Materials Schedule).
 *
 * Textures are still unpopulated here; `MaterialRecord.textureUrl` is where user
 * uploads land (SPEC-MATERIALS-REPOSITORY §3.2 is still the roadmap for wiring them).
 */
export const STANDARD_MATERIAL_LIBRARY: StandardMaterialDef[] = MATERIAL_CATALOG.map(project);

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

export function disposeLibraryTextures(): void {
    STANDARD_MATERIAL_LIBRARY.forEach(def => {
        def.textures?.color?.dispose();
        def.textures?.normal?.dispose();
        def.textures?.roughness?.dispose();
    });
}
