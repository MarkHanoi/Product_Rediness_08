// LiftMaterials — WHICH MASTER ROWS a lift's parts default to.
//
// §FEAT-LIFT-OBSERVATION-FRAME (L-9400..L-9406) · C100 §6.1 · C84 EI-8.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⛔ EVERY VALUE IN THIS FILE IS AN **ID INTO THE MASTER CATALOGUE**, NEVER A HEX.
// ═══════════════════════════════════════════════════════════════════════════════
// C100 §6.1 is the rule and C100 §1.1 records what breaking it costs: eight rival
// material vocabularies, each a private hex chain, none of them reachable from the
// material picker, the schedule or the IFC export. The founder's reference render
// shows a RED steel frame; the temptation is to write `0x8f3328` into a mesh
// builder and be done. That colour would then exist in exactly one place, mean
// nothing to the inspector, and diverge from `Steel · Red Oxide Primer` the first
// time anyone tuned the master row.
//
// So the frame names `steel-painted-red-oxide` and the RENDERER resolves it through
// `resolveMaterialColour` — the same ladder the beam, the handrail, the door and
// the window already use. Change the master row and every lift frame in every
// project follows; override it per-lift and the override is visible AS an override.
//
// ⚠ THESE ARE DEFAULTS, NOT CONSTANTS. Each is the value used when the lift record
// (or the caller) names nothing. A `materialId` on the record always wins — that is
// what makes the assembly parametric in finish as well as in geometry.
//
// PURITY: string constants. No THREE, no DOM, no store, no catalogue import — the
// ids are checked against the master by `LiftMasterMaterialIdsExist.test.ts`, which
// is where the coupling belongs: a compile-time import of the catalogue into an L2
// geometry package would drag the whole material subsystem behind it, and a test
// proves the same property without the edge.

import type { LiftPartKind } from './LiftPartTypes.js';

/**
 * The observation-lift frame — corner columns, storey ring beams, top-bay bracing.
 *
 * ⭐ `Steel · Red Oxide Primer` (#8f3328) is the founder's red/maroon, and it is a
 * REAL finish rather than a colour chosen to match a picture: red oxide is the
 * primer a fabricated steel frame arrives on site wearing, and a great many
 * observation lifts are left in it deliberately. C100 §6.1 — the master already had
 * the row, so nothing is seeded here.
 */
export const LIFT_FRAME_MATERIAL_ID = 'steel-painted-red-oxide';

/**
 * The glazed enclosure. `Glass · Structural / Toughened` — a panoramic shaft is
 * toughened glass by regulation, not float, and the master row already says so.
 */
export const LIFT_GLASS_MATERIAL_ID = 'glass-structural';

/** The guide rails. Machined rail steel is bright and unpainted. */
export const LIFT_GUIDE_RAIL_MATERIAL_ID = 'steel-galvanised';

/** The landing-door assemblies — the reference's dark grey leaves. */
export const LIFT_LANDING_DOOR_MATERIAL_ID = 'steel-powder-coated-dark';

/**
 * Per-part cabin defaults. A lift car is not one material: the sling is structural
 * steel, the linings and the car door are brushed stainless (the near-universal
 * passenger-car finish), and the floor is a dark platform. One table, so the
 * inspector, the schedule and the mesh cannot disagree about what a car is made of.
 */
export const LIFT_PART_DEFAULT_MATERIAL_IDS: Readonly<Record<LiftPartKind, string>> =
    Object.freeze({
        'cabin-structure': 'steel-structural',
        'cabin-wall-finish': 'steel-stainless-brushed',
        'cabin-floor': 'steel-powder-coated-dark',
        'cabin-ceiling': 'steel-stainless-brushed',
        'cabin-door': 'steel-stainless-brushed',
        'frame-column': LIFT_FRAME_MATERIAL_ID,
        'frame-ring-beam': LIFT_FRAME_MATERIAL_ID,
        'frame-brace': LIFT_FRAME_MATERIAL_ID,
        'guide-rail': LIFT_GUIDE_RAIL_MATERIAL_ID,
    });

/**
 * Every master id this subsystem names, as a VALUE a test can iterate.
 *
 * ⚠ A list a test can read, not a shape a test can probe one string at a time —
 * the same reason `ACCEPTED_CURTAIN_WALL_COMMAND_TYPES` is a `Set` rather than a
 * `||` chain (L-972). If someone adds a tenth part kind with a material that is not
 * in the master, `LiftMasterMaterialIdsExist.test.ts` fails on the NEW id rather
 * than silently painting it magenta at runtime (C100 §5).
 */
export const LIFT_MASTER_MATERIAL_IDS: readonly string[] = Object.freeze([
    LIFT_FRAME_MATERIAL_ID,
    LIFT_GLASS_MATERIAL_ID,
    LIFT_GUIDE_RAIL_MATERIAL_ID,
    LIFT_LANDING_DOOR_MATERIAL_ID,
    ...Object.values(LIFT_PART_DEFAULT_MATERIAL_IDS),
]);
