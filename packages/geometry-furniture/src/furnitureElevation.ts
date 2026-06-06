// A.21.D15 (2026-06-06) — single source of truth for furniture/fixture vertical
// placement. Pure (no THREE, no DOM) so it unit-tests in plain Node.
//
// THE DATUM CONTRACT (one rule, applied ONCE):
//
//   worldY = floorY + mountOffset
//
//   • floorY      — the world Y of the storey FLOOR the item sits on. For a
//     multi-storey building this is the level's `elevation` (ground floor 0,
//     upper floors their base elevation). EVERY fixture's Y derives from its
//     own storey's floor — upper-storey furniture must NOT be anchored to 0.
//   • mountOffset — the height the item is MOUNTED above that floor:
//        0      → floor-standing (bed, sofa, table, appliance, base unit)
//        >0     → wall-mounted   (tv ~1.20, wall_unit ~1.45, extractor ~1.50,
//                 mirror ~1.10–1.20, towel rail ~0.40, curtain rod ~2.40)
//
// THE OLD BUG (A.21.D15): `mountOffset` was being applied TWICE — once baked
// into `position.y` by CreateFurnitureCommand (`level.elevation + baseOffset`)
// and again by FurnitureFragmentBuilder (`position.y + baseOffset`). Floor
// items (offset 0) were unaffected, so ONLY wall-mounted items floated at
// `floor + 2 × offset` (and the TV at +3× via its own hardcoded internal
// offset). The fix anchors `position.y` to the FLOOR datum and applies the
// mount offset exactly once, in FurnitureFragmentBuilder.
//
// Builders draw geometry FLOOR-RELATIVE (group origin = floor); the mount
// offset is the GROUP's position, never re-added inside a builder.

/**
 * World Y of a furniture/fixture group root.
 * @param floorY      world Y of the storey floor (the level's elevation).
 * @param mountOffset height mounted above that floor (0 = floor-standing).
 */
export function furnitureWorldY(floorY: number, mountOffset: number): number {
    return (floorY ?? 0) + (mountOffset ?? 0);
}
