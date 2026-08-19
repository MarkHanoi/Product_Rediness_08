// wallViewStyleMaterials — the wall's UNSTYLED appearance, per VIEW STYLE.
//
// ⭐ C100 §9.9 (S13) — DECIDED 2026-08-19: these are a **C04 VIEW STYLE**, not
// rows of the master material database, and they live here rather than in
// `materialLibrary.ts` so that the projection file is what its own header says
// it is: a THREE-typed map of `MATERIAL_CATALOG` and *nothing else*.
//
// ─── The decision, and the four measurements behind it ──────────────────────
// C100 §9.7 flagged `color: 0xe8e8e8` / `0xf5f5f5` sitting inside the projection
// as hex literals a `#rrggbb` gate could not see, and named the fold as blocked:
// *are these a master row, or a C04 view style?* Guessing would have minted the
// rival vocabulary the whole contract exists to prevent, so it was measured.
//
//  1. ⛔ **There are TWO of them for ONE physical surface, chosen by render
//     mode.** `WallFragmentBuilder.ts:4521/4531` picks REALISTIC or SCHEMATIC by
//     `VisualStyle`. A material row cannot be two different colours depending on
//     how you are looking at it — that is the definition of a view style, and
//     the definition of *not* a material.
//  2. ⛔ **They sit LAST in the precedence chain**, after
//     `finishColour || wall.materialColor`. C100 §2.1's ladder makes an authored
//     material or an explicit override win every time, so a "material" here
//     could never be chosen, only fallen back to.
//  3. ⛔ **They are unnameable and unassignable.** No id, no label, no category —
//     they never appear in the picker, and no element can reference them. An
//     element REFERENCES a material by `materialId` (§2.1); nothing can
//     reference these.
//  4. ⛔ **Promoting them would put "unstyled" in the catalogue as something a
//     user can PICK** — which is precisely the beige-default failure C100 §1.2
//     traces: "this wall has no material" and "this wall is light grey" would
//     become the same value, chosen deliberately, in the master.
//
// So: **NOT master rows. NOT folded. MOVED.** The hexes stay literal here
// because a view style's colour is a rendering constant (C04), and C100 §3
// already permits family render constants — what it forbids is a *material* hex
// masquerading as data. Naming the file for what these are is the fix; deleting
// the literal would only hide it somewhere less honest.
//
// ⚠ WHAT THIS DOES **NOT** DECIDE: whether a wall with no material SHOULD render
// as a light grey at all, rather than as C100 §5's NAMED unresolved state. That
// is a product question about the default appearance of unauthored fabric, it is
// a much larger change than a file move, and it is deliberately left open rather
// than settled by a relocation.
//
// ⚠ EVERY EXPORT KEEPS ITS NAME AND SHAPE. `materialLibrary.ts` re-exports all
// four, so `@pryzm/core-app-model/material-library` importers — `geometry-wall`
// among them, owned by a concurrent lane — are untouched by this move.
//
// CONTRACTS: C100 §9.9 (this decision) · C100 §3 (family render constants are
// legitimate) · C04 (view styles) · C84 §1.3 (a projection never extends the
// master).

import * as THREE from "@pryzm/renderer-three/three";

/** SCHEMATIC view style — the wall body when nothing has styled it. */
export const WALL_SCHEMATIC_MATERIAL = {
    color:     0xe8e8e8,
    roughness: 0.9,
    metalness: 0.0,
};

/** REALISTIC view style — the same unstyled wall, lit for presentation. */
export const WALL_REALISTIC_MATERIAL = {
    color:     0xf5f5f5,
    roughness: 0.85,
    metalness: 0.0,
};

export function createWallSchematicMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ ...WALL_SCHEMATIC_MATERIAL });
}

export function createWallRealisticMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ ...WALL_REALISTIC_MATERIAL });
}
