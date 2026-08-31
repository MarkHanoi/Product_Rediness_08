import { writeFileSync } from 'node:fs';

const REG_LINE = {
  wall: 299, slab: 318, pool: 355, water: 364, door: 379, window: 387, roof: 395,
  curtainWall: 403, grid: 411, column: 419, beam: 427, stair: 435, handrail: 443,
  ceiling: 451, floor: 463, balcony: 498, lift: 545, liftPart: 551, boundaryLine: 595,
  furniture: 603, plumbing: 618, bathroomPod: 657, lighting: 677, room: 691,
  structural: 700, dimension: 715, selection: 752, annotation: 773,
};
const REG_ID = {
  wall: 'wall', slab: 'slab', pool: 'pool', water: 'water', door: 'door', window: 'window',
  roof: 'roof', curtainWall: 'curtain-wall', grid: 'grid', column: 'column', beam: 'beam',
  stair: 'stair', handrail: 'handrail', ceiling: 'ceiling', floor: 'floor', balcony: 'balcony',
  lift: 'lift', liftPart: 'liftPart', boundaryLine: 'boundary-line', furniture: 'furniture',
  plumbing: 'plumbing', bathroomPod: 'bathroomPod', lighting: 'lighting', room: 'rooms',
  structural: 'structural', dimension: 'dimensions', selection: 'selection', annotation: 'annotations',
};
const ACTIVATOR = {
  annotation: "runtime.tools.register('annotation') at apps/editor/src/PluginRegistry.ts:1073",
  furniture: "runtime.tools.register('furniture') at apps/editor/src/PluginRegistry.ts:1157",
  grid: "runtime.tools.register('grid:tool') at apps/editor/src/PluginRegistry.ts:1173",
  lighting: "runtime.tools.register('lighting') at apps/editor/src/PluginRegistry.ts:1188",
  structural: "runtime.tools.register('structural') at apps/editor/src/PluginRegistry.ts:1203",
  room: "runtime.tools.register('rooms') at apps/editor/src/PluginRegistry.ts:1273",
  section: "runtime.tools.register('section-view') at apps/editor/src/PluginRegistry.ts:1299",
  selection: "runtime.tools.register('selection') at apps/editor/src/PluginRegistry.ts:1314",
};
const INIT_TOOLS = {
  beam: 'apps/editor/src/engine/initTools.ts:3376 `new BeamTool` · §-tag NONE within 30 lines above',
  ceiling: 'apps/editor/src/engine/initTools.ts:607 `new CeilingTool` · §SLAB-SYSTEM-AUDIT-2026',
  column: 'apps/editor/src/engine/initTools.ts:1125 `new ColumnTool` · §W6',
  curtainWall: 'apps/editor/src/engine/initTools.ts:1119 `new CurtainWallTool` · §MT-05',
  door: 'apps/editor/src/engine/initTools.ts:1110 `new DoorTool` · §-tag NONE within 30 lines above',
  floor: 'apps/editor/src/engine/initTools.ts:623 `new FloorTool` · §FIX-FLOOR-FINISH-CREATION-PARITY',
  furniture: 'apps/editor/src/engine/initTools.ts:689 `new FurnitureTool`, :690 `window.furnitureTool = furnitureTool` · §-tag NONE',
  handrail: 'apps/editor/src/engine/initTools.ts:752 `new HandrailTool` · §WALL-AUDIT-2026-W2',
  lift: 'apps/editor/src/engine/initTools.ts:3395 `new LiftTool` · §LIFT-CREATE-TOOL',
  liftPart: 'apps/editor/src/engine/initTools.ts:3395 `new LiftTool` (shared with lift) · §LIFT-CREATE-TOOL',
  lighting: 'apps/editor/src/engine/initTools.ts:842 `new LightingTool`, :843 `window.lightingTool = lightingTool` · §-tag NONE',
  plumbing: 'apps/editor/src/engine/initTools.ts:685 `new PlumbingTool` · §-tag NONE',
  roof: 'apps/editor/src/engine/initTools.ts:739 `new RoofTool` · §WALL-AUDIT-2026-W2',
  room: 'apps/editor/src/engine/initTools.ts:3323 `new RoomTool`, :3358 `window.roomTool = roomTool` · §ROOM-LOSS-NOTICE',
  boundaryLine: 'apps/editor/src/engine/initTools.ts:3366 `new RoomBoundingLineTool` · §-tag NONE',
  slab: 'apps/editor/src/engine/initTools.ts:590 `new SlabTool` · §-tag NONE',
  stair: 'apps/editor/src/engine/initTools.ts:3377 `new StairTool` · §-tag NONE',
  wall: 'apps/editor/src/engine/initTools.ts:879 `new WallTool` · §WALL-AUDIT-2026-M2; :3552 `new OpeningTool` · §A',
  window: 'apps/editor/src/engine/initTools.ts:1109 `new WindowTool` · §-tag NONE',
};
const L6_TOOL = {
  annotation: 'TextNoteTool (plugins/annotations/src/tool.ts)', beam: 'BeamPlacementTool',
  ceiling: 'CeilingPlacementTool', column: 'ColumnPlacementTool', curtainWall: 'CurtainWallPlacementTool',
  dimension: 'DimensionTool', door: 'DoorPlacementTool', furniture: 'FurniturePlacementTool',
  grid: 'GridPlacementTool', handrail: 'HandrailPlacementTool', lighting: 'LightingPlacementTool',
  plumbing: 'PlumbingPlacementTool', bathroomPod: 'PlumbingPlacementTool (rides plumbing)',
  roof: 'RoofPlacementTool', room: 'RoomSeedTool', section: 'SectionTool', selection: 'SelectionTool',
  slab: 'SlabPlacementTool', stair: 'StairPlacementTool', structural: 'StructuralPlacementTool',
  wall: 'WallCreationTool', window: 'WindowPlacementTool',
};
const CONSTRUCTED_AT_L7 = new Set(['grid', 'lighting', 'structural', 'annotation']);
const NEVER_NAMED_OUTSIDE = new Set(['beam', 'ceiling', 'column', 'curtainWall', 'door', 'handrail', 'plumbing', 'bathroomPod', 'roof', 'slab', 'stair', 'window']);
const NAMED_ONLY_IN_COMMENTS = new Set(['furniture', 'room', 'section', 'wall', 'dimension']);

const FAMS = Object.keys(REG_ID).concat(['section']);
const per_family = {};
for (const fam of FAMS) {
  const l7 = {
    tool_file_L6: L6_TOOL[fam] ?? 'NONE — no plugins/<fam>/src/tool.ts on disk (git ls-files)',
    tool_file_L2_geometry: null,
    PluginRegistry_entry: fam === 'section'
      ? "NOT an inline ALL_PLUGINS descriptor. Imported as a bare value: apps/editor/src/PluginRegistry.ts:117 `import { sectionViewPluginRegistration } from '@pryzm/plugin-section-view'`; PluginRegistry.ts:807-808 states in source that 'nothing about section-view is described here'."
      : `apps/editor/src/PluginRegistry.ts:${REG_LINE[fam]} — inline ALL_PLUGINS descriptor, id '${REG_ID[fam]}'`,
    initTools_bridge: INIT_TOOLS[fam] ?? 'NONE — no `new <X>Tool` for this family in apps/editor/src/engine/initTools.ts (grep -on "new [A-Z][A-Za-z]*Tool\\b", 25 hits, none for this family)',
    tool_activator_L7: ACTIVATOR[fam] ?? "NONE — no runtime.tools.register(...) for this family (grep -n 'runtime.tools.register(' apps/editor/src/PluginRegistry.ts -> 26 registrations, none for this family)",
    L6_tool_reachability: CONSTRUCTED_AT_L7.has(fam)
      ? 'IMPORTED AND CONSTRUCTED at L7 (apps/editor/src/PluginRegistry.ts) — but see read_but_never_assigned: its screenToWorld dependency resolves to a global assigned nowhere.'
      : NEVER_NAMED_OUTSIDE.has(fam)
        ? 'NEVER NAMED outside plugins/ — the class name does not appear in apps/, packages/ or src/ at all (non-test, non-dist). AUTHORED-BUT-UNREACHABLE.'
        : NAMED_ONLY_IN_COMMENTS.has(fam)
          ? 'NAMED OUTSIDE plugins/ ONLY IN COMMENTS — no import statement, no `new X(`. AUTHORED-BUT-UNREACHABLE with a comment that reads as if it were wired.'
          : 'n/a',
    read_but_never_assigned_symbols: [],
  };
  if (fam === 'section') l7.read_but_never_assigned_symbols.push("window.sectionTool — READ at apps/editor/src/PluginRegistry.ts:1300, ASSIGNED NOWHERE. `grep -rn sectionTool apps packages plugins src --include=*.ts` -> 2 hits: the read, and apps/editor/__tests__/sectionViewReachableThroughComposedRuntime.test.ts:47 which says so in prose. The `t?.activate` branch is PERMANENTLY dead; the else-branch (busAdapter 'section.panel.open') always runs.");
  if (['grid', 'lighting', 'structural'].includes(fam)) l7.read_but_never_assigned_symbols.push("window.__pryzmScreenToWorld — READ at apps/editor/src/PluginRegistry.ts:1063 (inside eventScreenToWorld, handed to this family's tool at :1182/:1197/:1212), ASSIGNED NOWHERE repo-wide. Consequence: onPointerDown's `if (!isFiniteVec3(p)) return undefined` / `if (!p) return undefined` guard is PERMANENT, so the tool can never dispatch its create verb.");
  if (fam === 'annotation') l7.read_but_never_assigned_symbols.push("window.__pryzmScreenToWorld — READ at apps/editor/src/PluginRegistry.ts:1055 (inside annotationScreenToWorld, handed to TextNoteTool at :1088), ASSIGNED NOWHERE repo-wide. TextNoteTool's anchor (plugins/annotations/src/tool.ts:108) is therefore always null and :112 raises 'screenToWorld returned non-finite anchor'.");

  per_family[fam] = {
    extension_contract_layer: fam === 'section'
      ? 'COMPLIANT with ADR-0367 and the ONLY family that is. The contract is L5 (packages/plugin-sdk/src/registration.ts:121, `export interface PluginRegistration`). The DECLARATION is L6: plugins/section-view/src/registration.ts:48 imports the type from @pryzm/plugin-sdk and :69-74 declares `sectionViewPluginRegistration ... satisfies PluginRegistration`. `ls plugins/*/src/registration.ts` -> 1 file, this one.'
      : `CONTRACT AT L5 — ok. DECLARATION SITE STILL L7. The contract is declared exactly once repo-wide, at packages/plugin-sdk/src/registration.ts:121 (grep -rn "interface PluginRegistration|type PluginRegistration" packages plugins apps --include=*.ts -> 2 hits, both in that one file: :82 PluginRegistrationDeps, :121 PluginRegistration). No rival contract at L6 or L7 — apps/editor/src/PluginRegistry.ts:198 is an ALIAS (\`export type PluginDescriptor = PluginRegistration<PluginContribution, RoomEventRuntime>\`), not a second declaration. This family's own registration is still an inline object literal in the L7 file at PluginRegistry.ts:${REG_LINE[fam]}, which is the arrangement ADR-0367 exists to end, not a violation of the layer rule (L7 may import downward).`,
    l7_surface: l7,
    findings: [],
  };
}
// water / pool / bathroomPod / liftPart carry their parent's L2 tool
per_family.pool.l7_surface.tool_file_L6 = 'NONE — `git ls-files plugins/pool/**/*Tool*.ts plugins/pool/src/tool.ts` -> 0 files.';
per_family.water.l7_surface.tool_file_L6 = 'NONE — water has no directory of its own (members.json: store authored in plugins/pool/src/store.ts).';
per_family.balcony.l7_surface.tool_file_L6 = 'NONE — `git ls-files plugins/balcony/**/*Tool*.ts plugins/balcony/src/tool.ts` -> 0 files.';
per_family.boundaryLine.l7_surface.tool_file_L6 = 'NONE at L6. The tool is L2: packages/geometry-wall/src/RoomBoundingLineTool.ts, instantiated at initTools.ts:3366.';
per_family.floor.l7_surface.tool_file_L6 = 'NONE at L6. The tool is L2: packages/geometry-slab/src/floor/FloorTool.ts, instantiated at initTools.ts:623.';
per_family.lift.l7_surface.tool_file_L6 = 'NONE at L6. The tool is L2: packages/geometry-lift/src/LiftTool.ts.';
per_family.liftPart.l7_surface.tool_file_L6 = 'NONE at L6 (rides lift).';

const L2_TOOL = {
  column: 'packages/geometry-column/src/ColumnTool.ts', curtainWall: 'packages/geometry-curtain-wall/src/CurtainWallTool.ts',
  door: 'packages/geometry-door/src/DoorTool.ts', furniture: 'packages/geometry-furniture/src/FurnitureTool.ts',
  handrail: 'packages/geometry-handrail/src/HandrailTool.ts', lift: 'packages/geometry-lift/src/LiftTool.ts',
  liftPart: 'packages/geometry-lift/src/LiftTool.ts', lighting: 'packages/geometry-lighting/src/LightingTool.ts',
  plumbing: 'packages/geometry-plumbing/src/PlumbingTool.ts', bathroomPod: 'packages/geometry-plumbing/src/PlumbingTool.ts',
  roof: 'packages/geometry-roof/src/RoofTool.ts', slab: 'packages/geometry-slab/src/SlabTool.ts',
  ceiling: 'packages/geometry-slab/src/ceiling/CeilingTool.ts', floor: 'packages/geometry-slab/src/floor/FloorTool.ts',
  stair: 'packages/geometry-stair/src/StairTool.ts', wall: 'packages/geometry-wall/src/WallTool.ts + OpeningTool.ts + RoomBoundingLineTool.ts',
  boundaryLine: 'packages/geometry-wall/src/RoomBoundingLineTool.ts', window: 'packages/geometry-window/src/WindowTool.ts',
  beam: 'packages/input-host/src/BeamTool.ts (L2)',
};
for (const [f, p] of Object.entries(L2_TOOL)) if (per_family[f]) per_family[f].l7_surface.tool_file_L2_geometry = p;

writeFileSync('audit/full-stack/2026-08-31/_p5/per-family-manual.json', JSON.stringify(per_family, null, 1));
console.log('per_family rows', Object.keys(per_family).length);
