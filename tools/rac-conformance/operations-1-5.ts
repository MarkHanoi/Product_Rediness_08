/**
 * tools/rac-conformance/operations.ts
 *
 * THE OPERATION TABLE — categories 1–5 of the founder's ~92 named BIM
 * operations, as a user would ASK for them.
 *
 * ─── Why utterances and not command objects ──────────────────────────────────
 * V1 (RESOLVE) is only a claim if the input is a sentence. A test that hands
 * `{ intent: 'set-thickness', millimetres: 300 }` to `applySemanticIntent` has
 * skipped the entire grammar and proves nothing about what a user can type.
 * Every row below carries the sentence. C67 §0/§4 and C68 §5.j are explicit
 * that the vocabulary is FREE-FORM with hard stoppers, so where a row FAILS on
 * phrasing the fix is the grammar, never a narrower sentence here.
 *
 * ─── The seven verdicts ──────────────────────────────────────────────────────
 * V1 RESOLVE · V2 DISPATCH · V3 STATE · V4 PERSIST · V5 UNDO · V6 SYNC · V7 REPORT
 * Each is PASS / FAIL / UNPROVEN, independently. `authoritative` names the exact
 * property that would prove V3 — it is written down even where this harness
 * cannot read it, because "we do not know which store is authoritative" is
 * itself a finding (see SCORECARD §Findings).
 */

export type Verdict = 'PASS' | 'FAIL' | 'UNPROVEN';

export interface OperationRow {
  /** Stable id — `<category>.<n>`. */
  readonly id: string;
  readonly category: 1 | 2 | 3 | 4 | 5;
  readonly name: string;
  /** Real user sentences, in the order a user would try them. The FIRST is the
   *  primary; the rest are paraphrase probes (C68 §5.j — free-form or nothing). */
  readonly utterances: readonly string[];
  /** Selection context, as element kinds. Empty = nothing selected. */
  readonly selection?: readonly string[];
  /** Inject a stub scope resolver (spatially-scoped asks refuse without one —
   *  `requireResolvedIds`, and correctly so: a Confirm card may not show a
   *  count it does not have). */
  readonly scoped?: boolean;
  /** The capability id V1 must land on. `null` = we assert NOTHING is offered
   *  (a "not offered" row: a miss is the EXPECTED, honest answer). */
  readonly expectCapability: string | null;
  /** The bus command V2 must reach. `null` for local actions / not-offered. */
  readonly expectBusCommand: string | null;
  /** Payload keys/values V2 must carry. Values are compared loosely (number
   *  within 1e-6, string exact, RegExp tested against String(v)). */
  readonly expectPayload?: Readonly<Record<string, number | string | RegExp>>;
  /** A refusal is the CORRECT outcome (categories 5.9 / 5.10, adversarials). */
  readonly expectRefusal?: boolean;
  /** THE V3 QUESTION, written out: which property, on which store, proves it. */
  readonly authoritative: string;
  /** Why V3..V7 are or are not establishable for this row. */
  readonly note?: string;
}

const OPS: OperationRow[] = [
  // ─── CATEGORY 1 — PROJECT / STRUCTURE ─────────────────────────────────────
  {
    id: '1.1', category: 1, name: 'create project',
    utterances: ['create a new project called Villa Alba', 'start a new project', 'make a new project'],
    expectCapability: null, expectBusCommand: null,
    authoritative: 'server-side `projects` row + client project context id',
    note: 'Project creation is an APPLICATION/AUTH concern owned by server.js, not a bus command. Not a chat capability by design — but the founder asked for it, so it is a scope finding, not a defect.',
  },
  {
    id: '1.2', category: 1, name: 'create site',
    utterances: ['create a site', 'add a site to this project', 'set up the site'],
    expectCapability: null, expectBusCommand: null,
    authoritative: 'site/parcel record consulted by the 3D-Site context loader',
    note: 'Site creation runs through the onboarding location flow (draw/geocode), not the RAC.',
  },
  {
    id: '1.3', category: 1, name: 'create building',
    utterances: ['create a building', 'add a building'],
    expectCapability: null, expectBusCommand: null,
    authoritative: 'building container consulted by the level ladder',
    note: '`generate-building` ("generate a 3-storey residential building") is a GENERATOR, not "create an empty building". Distinct operations; row 1.3 asks for the empty container.',
  },
  {
    id: '1.4', category: 1, name: 'create Level 0',
    utterances: ['create level 0', 'add the ground floor'],
    expectCapability: 'add-level', expectBusCommand: 'level.add',
    authoritative: 'levelStore: a level with elevation 0',
    note: 'Level 0 exists at project bootstrap; asking for it again must REFUSE on occupied elevation, not silently duplicate.',
  },
  {
    id: '1.5', category: 1, name: 'create Level 1',
    utterances: ['create a new level at 3m', 'add a level at 3 m', 'add a first floor at 3m'],
    expectCapability: 'add-level', expectBusCommand: 'level.add',
    expectPayload: { elevation: 3 },
    authoritative: 'levelStore: new level, elevation === 3',
  },
  {
    id: '1.6', category: 1, name: 'rename level',
    utterances: ['rename Level 1 to First Floor', 'call level 1 the first floor'],
    expectCapability: null, expectBusCommand: null,
    authoritative: 'levelStore level.name === "First Floor"',
    note: 'No capability. `rename-room` exists; there is no `rename-level`. NOT OFFERED.',
  },
  {
    id: '1.7', category: 1, name: 'change level elevation',
    utterances: ['set level 1 elevation to 3.5m', 'change the elevation of level 1 to 3.5 m'],
    expectCapability: null, expectBusCommand: null,
    authoritative: 'levelStore level.elevation === 3.5, AND every element hosted on that level re-seated',
    note: 'No capability. This is the operation with the largest blast radius in category 1 (every hosted element moves) and it has no route.',
  },
  {
    id: '1.8', category: 1, name: 'add another level',
    utterances: ['add a level', 'add another level', 'add one more floor'],
    expectCapability: 'add-level', expectBusCommand: 'level.add',
    authoritative: 'levelStore length increases by exactly 1',
  },
  {
    id: '1.9', category: 1, name: 'move a level',
    utterances: ['move level 1 up by 500mm', 'raise level 1 by 0.5m'],
    expectCapability: null, expectBusCommand: null,
    authoritative: 'levelStore level.elevation shifted; hosted elements follow',
    note: 'No capability. Same gap as 1.7 in relative form.',
  },
  {
    id: '1.10', category: 1, name: 'delete a level',
    utterances: ['delete level 2', 'remove level 2'],
    expectCapability: null, expectBusCommand: null,
    authoritative: 'levelStore no longer contains L2; hosted elements deleted or re-hosted (and the answer must say WHICH)',
    note: 'No capability. Deleting a level with content is a destructive op that must report what it takes with it (C68 §5.g).',
  },

  // ─── CATEGORY 2 — WALLS ───────────────────────────────────────────────────
  {
    id: '2.1', category: 2, name: 'create exterior wall',
    utterances: ['draw a wall from (0,0) to (5,0) height 3m', 'create a wall from (0,0) to (5,0)'],
    expectCapability: 'create-wall', expectBusCommand: 'wall.create',
    authoritative: 'the wall store the fragment builders + ProjectSerializer read — see FINDING F-2: `create-wall` has NO commandProof and its handler is the ONE unclassified global route in the D14 gate (baseline 1)',
    note: 'Utterance says "a wall", not "an exterior wall" — the exterior/interior distinction is a SYSTEM TYPE, applied separately (row 2.8). A create verb that silently picks a type is a claim nobody made.',
  },
  {
    id: '2.2', category: 2, name: 'create interior wall',
    utterances: ['create an interior wall from (0,0) to (4,0)', 'draw an interior partition from (0,0) to (4,0)'],
    expectCapability: 'create-wall', expectBusCommand: 'wall.create',
    expectPayload: { },
    authoritative: 'wall store: created wall carries an INTERIOR system type',
    note: 'The interesting half is whether the adjective survives to the payload. If `wall.create` ignores "interior", the sentence was half-heard — a silent substitution, C68 §7 class.',
  },
  {
    id: '2.3', category: 2, name: 'set wall length',
    utterances: ['set the wall length to 6m', 'make this wall 6m long', 'change the length to 6m'],
    selection: ['wall'],
    expectCapability: null, expectBusCommand: null,
    authoritative: 'wall store: |end − start| === 6.0 m, and the wall JOINS re-resolved',
    note: '`set-length` exists but targets FURNITURE ONLY. A wall has no length route. Given "create wall from A to B" is the create form, length is the most obvious wall edit a user will try.',
  },
  {
    id: '2.4', category: 2, name: 'set wall height',
    utterances: ['set height to 3m', 'make this wall about three meters tall', 'set height to 2700'],
    selection: ['wall'],
    expectCapability: 'set-height', expectBusCommand: 'element.updateParameters',
    expectPayload: { },
    authoritative: 'wall store wall.height === 3.0 m (metres, not mm) — and the extruded fragment rebuilt',
  },
  {
    id: '2.5', category: 2, name: 'set wall thickness',
    utterances: ['make this wall 300mm thick', 'set thickness to 200mm', 'change the thickness to 0.2m'],
    selection: ['wall'],
    expectCapability: 'set-thickness', expectBusCommand: 'wall.updateDimensions',
    authoritative: 'wall store wall.thickness === 0.3 m. L-815 re-routed this verb OFF the detached plugin wall store onto the legacy bridge — reading the plugin DTO store here would give a FALSE PASS.',
  },
  {
    id: '2.6', category: 2, name: 'move wall',
    utterances: ['move this wall 500mm north', 'shift this wall 0.5m to the right', 'move the wall 500 mm'],
    selection: ['wall'],
    expectCapability: null, expectBusCommand: null,
    authoritative: 'wall store: start and end both translated by exactly (0, 0.5); joins re-resolved',
    note: 'No move capability for ANY element kind. Move is arguably the single most-used editor operation.',
  },
  {
    id: '2.7', category: 2, name: 'rotate wall',
    utterances: ['rotate this wall by 90 degrees', 'turn this wall 90 degrees'],
    selection: ['wall'],
    expectCapability: null, expectBusCommand: null,
    authoritative: 'wall store: direction vector rotated 90°, length preserved',
    note: 'No rotate capability. NB `set-wall-rake` ("tilt all walls by 60 degrees") is RAKE — out-of-plane lean — and must NOT capture a rotate utterance. If it does, that is a mis-resolve, which is what V1 is for.',
  },
  {
    id: '2.8', category: 2, name: 'change wall type',
    utterances: ['make all walls interior partition', 'convert every wall to interior partition', 'change all walls to Interior – Partition 100mm'],
    expectCapability: 'set-wall-type', expectBusCommand: 'wall.updateSystemTypeBatch',
    authoritative: 'wall store wall.systemTypeId — the field `systemTypeStore` resolves and the layered-wall grid builder reads',
  },
  {
    id: '2.9', category: 2, name: 'change wall material',
    utterances: ['make all walls white', 'paint the selected walls light grey', 'turn all walls beige'],
    selection: ['wall'], scoped: true,
    expectCapability: 'set-wall-color', expectBusCommand: 'wall.updateColorBatch',
    authoritative: 'wall store wall.color (hex). ⚠ COLOUR IS NOT MATERIAL. A material carries a system type + finish layers; `set-wall-color` sets a display hex. The founder asked for MATERIAL — recorded as a semantic gap, not a pass.',
  },
  {
    id: '2.10', category: 2, name: 'add wall layer',
    utterances: ['add a 12mm plasterboard layer to all walls', 'add a 10mm plaster layer to the inner side of the selected wall'],
    selection: ['wall'],
    expectCapability: 'add-wall-layer', expectBusCommand: 'wall.addLayerBatch',
    authoritative: 'wall store wall.layers[] gains one entry, thickness 0.012 m, and the LAYERED wall path (grid builder, not CSG) renders it — see [[wall-opening-seam-two-paths]]',
  },
  {
    id: '2.11', category: 2, name: 'remove wall layer',
    utterances: ['remove the plasterboard layer from all walls', 'delete the inner plaster layer from the selected wall'],
    selection: ['wall'],
    expectCapability: null, expectBusCommand: null,
    authoritative: 'wall store wall.layers[] loses exactly that entry',
    note: 'ADD exists, REMOVE does not. An asymmetric pair is a trap: the user can get into a state they cannot get out of by sentence.',
  },
  {
    id: '2.12', category: 2, name: 'connect / intersect walls',
    utterances: ['join these two walls', 'connect these walls at the corner', 'make these two walls meet'],
    selection: ['wall', 'wall'],
    expectCapability: null, expectBusCommand: null,
    authoritative: 'JunctionResolverV2 output: an L/T/X junction record for the pair, and a MITRED footprint (ADR-0055)',
    note: 'No capability. Joining is done implicitly by the resolver on create/move; there is no way to ASK for it.',
  },
  {
    id: '2.13', category: 2, name: 'split wall',
    utterances: ['split this wall at the midpoint', 'divide this wall in two', 'split this wall'],
    selection: ['wall'],
    expectCapability: null, expectBusCommand: null,
    authoritative: 'wall store: one wall becomes two, endpoints contiguous, hosted openings re-parented to the correct half',
    note: 'No capability. The hosted-opening re-parenting is the hard half (C15) and nothing tests it.',
  },
  {
    id: '2.14', category: 2, name: 'delete wall',
    utterances: ['remove this wall', 'delete selected', 'get rid of this wall'],
    selection: ['wall'],
    expectCapability: 'delete-selected', expectBusCommand: 'element.delete',
    authoritative: 'wall store no longer has the id, AND its hosted doors/windows are gone too (C15 — an orphaned opening is the failure mode)',
  },
  {
    id: '2.15', category: 2, name: 'undo wall deletion',
    utterances: ['undo', 'undo that', 'actually, undo that'],
    expectCapability: 'undo', expectBusCommand: null,
    authoritative: 'wall store has the id BACK, with the same thickness/height/layers, and hosted openings restored. THE RIGHT THING must be reversed — see [[undo-architecture-three-stores]]: three store layers, one performUndoRedo.',
  },
  {
    id: '2.16', category: 2, name: 'redo wall deletion',
    utterances: ['redo', 'redo that', 'do that again'],
    expectCapability: 'redo', expectBusCommand: null,
    authoritative: 'wall store no longer has the id, again',
  },

  // ─── CATEGORY 3 — OPENINGS / DOORS / WINDOWS ──────────────────────────────
  {
    id: '3.1', category: 3, name: 'add door',
    utterances: ['add a door to this wall', 'put a door in this wall', 'create a door 900mm wide in this wall'],
    selection: ['wall'],
    expectCapability: null, expectBusCommand: null,
    authoritative: 'door store: a door hosted on that wall id with a wall-relative offset, AND the wall fragment re-cut (WallOccupancyStore.canPlace consulted)',
    note: 'NOT OFFERED. `create-windows-parametric` exists for windows; there is no door create verb at all. C15 is the hosted-element contract and the chat cannot reach it for doors.',
  },
  {
    id: '3.2', category: 3, name: 'move door',
    utterances: ['move the door 500mm to the right', 'shift this door 0.5m along the wall'],
    selection: ['door'],
    expectCapability: null, expectBusCommand: null,
    authoritative: 'door store door.offset (wall-relative) shifted 0.5 m, wall re-cut at the new position and healed at the old',
    note: 'No capability. [[realtime-edit-perf-and-adr057]] notes setOffset rebuilds the WHOLE level — so even the panel path is a known perf defect here.',
  },
  {
    id: '3.3', category: 3, name: 'change door type',
    utterances: ['change all doors to glazed timber', 'convert the selected doors to fire door fd30', 'change the door type to glazed timber'],
    selection: ['door'],
    expectCapability: 'set-door-type', expectBusCommand: 'door.updateSystemTypeBatch',
    authoritative: 'door store door.systemTypeId, resolved through `resolveDoorSystemTypeRef`',
  },
  {
    id: '3.4', category: 3, name: 'change door width',
    utterances: ['set door width to 900mm', 'make the door 1m wide', 'change width to 850mm'],
    selection: ['door'],
    expectCapability: 'set-width', expectBusCommand: 'element.updateParameters',
    authoritative: 'door store door.width === 0.9 m AND the wall opening re-cut to match. Width without a re-cut is the seam defect.',
  },
  {
    id: '3.5', category: 3, name: 'add window',
    utterances: ['create a window in the middle of every wall segment', 'create 2 windows in all the wall segments', 'add a window to this wall'],
    selection: ['wall'], scoped: true,
    expectCapability: 'create-windows-parametric', expectBusCommand: 'window.parametricCreate',
    authoritative: 'window store: N windows hosted on the wall ids, each with a wall-relative offset; ONE bus command for the batch (ADR-0314 — runBatch is undo-NEUTRAL)',
    note: 'The third utterance ("add a window to this wall") is the SINGULAR form a user reaches for first. If only the parametric/batch grammar resolves, the singular case is a gap.',
  },
  {
    id: '3.6', category: 3, name: 'move window',
    utterances: ['move this window 300mm left', 'shift the window 0.3m along the wall'],
    selection: ['window'],
    expectCapability: null, expectBusCommand: null,
    authoritative: 'window store window.offset shifted 0.3 m, wall re-cut',
    note: 'No capability — same gap as 3.2.',
  },
  {
    id: '3.7', category: 3, name: 'change window size',
    utterances: ['set the window width to 1.2m', 'make this window 1.2m by 1.5m', 'set the window height to 1.5m'],
    selection: ['window'],
    expectCapability: 'set-width', expectBusCommand: 'element.updateParameters',
    authoritative: 'window store window.width === 1.2 AND window.height === 1.5. ⚠ "1.2m by 1.5m" is ONE ask setting TWO fields — if the grammar only hears width, half the sentence was dropped silently.',
  },
  {
    id: '3.8', category: 3, name: 'delete opening',
    utterances: ['remove every window on level 2', 'delete all windows in the kitchen', 'delete all doors on level 2'],
    scoped: true,
    expectCapability: 'delete-windows-scoped', expectBusCommand: 'element.deleteBatch',
    authoritative: 'window store loses those ids AND the host walls are HEALED (the opening void closed). An unhealed void is the visible failure.',
  },
  {
    id: '3.9', category: 3, name: 'undo opening change',
    utterances: ['undo', 'undo that'],
    expectCapability: 'undo', expectBusCommand: null,
    authoritative: 'the opening is back at its ORIGINAL offset/width and the wall re-cut accordingly — one undo step, not N',
  },
  {
    id: '3.10', category: 3, name: 'reload and verify openings',
    utterances: ['(no utterance — save/reload cycle)'],
    expectCapability: null, expectBusCommand: null,
    authoritative: 'ProjectSerializer output contains the opening with its offset/width; ProjectLoader restores it hosted on the same wall id',
    note: 'This is V4 for the whole category, stated as its own row because the founder asked for it explicitly.',
  },

  // ─── CATEGORY 4 — SLABS / FLOORS ──────────────────────────────────────────
  {
    id: '4.1', category: 4, name: 'create slab',
    utterances: ['create a slab', 'add a floor slab on this level', 'create a 200mm slab'],
    expectCapability: null, expectBusCommand: null,
    authoritative: 'slab store: a slab with a boundary polygon on the active level',
    note: 'NOT OFFERED. `set-slab-type` / `set-thickness` can EDIT a slab the chat cannot CREATE.',
  },
  {
    id: '4.2', category: 4, name: 'change slab thickness',
    utterances: ['set the slab thickness to 250mm', 'make this slab 250mm thick'],
    selection: ['slab'],
    expectCapability: 'set-thickness', expectBusCommand: 'wall.updateDimensions',
    authoritative: 'slab store slab.thickness === 0.25 m. NB the verb is `wall.updateDimensions` for a SLAB — the proof file is UpdateSlabDimensionsCommand.ts, so the naming is misleading but the route is separate.',
  },
  {
    id: '4.3', category: 4, name: 'change slab boundary',
    utterances: ['change the slab boundary to the room outline', 'extend the slab 500mm past the walls', 'make the slab match the building footprint'],
    selection: ['slab'],
    expectCapability: null, expectBusCommand: null,
    authoritative: 'slab store slab.boundary vertex ring, measured as a POLYGON (edge-midpoint oracle for the 500mm case)',
    note: 'No capability. Note the second utterance is a 500 mm OUTWARD OFFSET — the same primitive category 5 needs, and the same known defect.',
  },
  {
    id: '4.4', category: 4, name: 'add floor finish',
    utterances: ['add floor finishes to all rooms', 'add a floor finish to this room'],
    expectCapability: 'generate-room-finishes', expectBusCommand: 'generation.rooms',
    authoritative: 'floor-finish elements in the element store, one per room, at the room boundary — NOT a slab field',
    note: 'This resolves to a GENERATOR over rooms. It is not "add a finish layer to this slab", which has no route (cf. 2.10 which does exist for walls).',
  },
  {
    id: '4.5', category: 4, name: 'change slab material',
    utterances: ['change all slabs to rc slab monolithic 200mm', 'change the slab type to composite deck', 'make the slab grey'],
    selection: ['slab'],
    expectCapability: 'set-slab-type', expectBusCommand: 'slab.updateSystemTypeBatch',
    authoritative: 'slab store slab.systemTypeId via `resolveSlabSystemTypeRef` (4 built-ins ship). The THIRD utterance is a COLOUR ask — there is no `set-slab-color` (only walls have one), so it must refuse rather than land here.',
  },
  {
    id: '4.6', category: 4, name: 'move slab',
    utterances: ['set the base offset to 150 mm', 'move the slab up 200mm', 'lower this slab by 0.2m'],
    selection: ['slab'],
    expectCapability: 'set-base-offset', expectBusCommand: 'element.updateParameters',
    authoritative: 'slab store slab.baseOffset === 0.15 m. Only the VERTICAL form has a route; utterances 2/3 are relative and horizontal moves have none (cf. 2.6).',
  },
  {
    id: '4.7', category: 4, name: 'delete slab',
    utterances: ['delete selected', 'remove this slab'],
    selection: ['slab'],
    expectCapability: 'delete-selected', expectBusCommand: 'element.delete',
    authoritative: 'slab store loses the id; any floor finish hosted on it is handled (deleted or orphaned — the answer must say which)',
  },
  {
    id: '4.8', category: 4, name: 'rebuild / reload slab',
    utterances: ['(no utterance — save/reload cycle)'],
    expectCapability: null, expectBusCommand: null,
    authoritative: 'ProjectSerializer round-trip preserves boundary ring order, thickness, systemTypeId and baseOffset',
  },

  // ─── CATEGORY 5 — ROOFS (founder-flagged) ─────────────────────────────────
  {
    id: '5.1', category: 5, name: 'create pitched roof',
    utterances: ['create a pitched roof', 'add a pitched roof at 30 degrees', 'put a pitched roof on this building'],
    expectCapability: null, expectBusCommand: null,
    authoritative: 'roof store: roof.form === "pitched" AND the built BufferGeometry has a RIDGE — i.e. max vertex Y > base Y by pitch·span/2, and vertex Y is NOT constant',
    note: 'NOT OFFERED by chat. Worse, the underlying builder is a KNOWN LIVE DEFECT: pitched silently returns FLAT (identical BufferGeometry, no log). Measured by the geometry probe, not the resolver.',
  },
  {
    id: '5.2', category: 5, name: 'create hip roof',
    utterances: ['create a hip roof', 'add a hipped roof'],
    expectCapability: null, expectBusCommand: null,
    authoritative: 'roof store roof.form === "hip"; geometry has FOUR sloping planes meeting a ridge shorter than the footprint',
    note: 'NOT OFFERED by chat.',
  },
  {
    id: '5.3', category: 5, name: 'create mansard roof',
    utterances: ['create a mansard roof', 'add a mansard'],
    expectCapability: null, expectBusCommand: null,
    authoritative: 'roof store roof.form === "mansard"; geometry has TWO distinct slope angles per side (the mansard break) — provable as ≥2 distinct face normals per side',
    note: 'NOT OFFERED by chat, AND the builder is a known live defect: mansard silently returns a HIP. Distinguishable ONLY by comparing geometry to the hip case, which the geometry probe does.',
  },
  {
    id: '5.4', category: 5, name: 'set roof pitch',
    utterances: ['set the roof pitch to 30 degrees', 'change pitch to 45', 'set pitch to 22.5 degrees'],
    selection: ['roof'],
    expectCapability: 'set-roof-pitch', expectBusCommand: 'roof.update',
    authoritative: 'roof store roof.pitch === 30 (degrees) AND the rebuilt geometry\'s slope-plane angle to horizontal measures 30° ± 0.5° — the number in the store is not the number on the surface',
  },
  {
    id: '5.5', category: 5, name: 'set ridge',
    utterances: ['set the ridge height to 2m', 'raise the ridge to 2m', 'move the ridge to the middle'],
    selection: ['roof'],
    expectCapability: null, expectBusCommand: null,
    authoritative: 'roof store roof.ridgeHeight === 2.0 AND max vertex Y − eaves Y === 2.0 m ± 1 mm',
    note: 'No capability. Ridge is the defining parameter of a pitched roof and there is no route to it.',
  },
  {
    id: '5.6', category: 5, name: 'set overhang',
    utterances: ['set the roof overhang to 300mm', 'give the roof a 300mm overhang', 'change the overhang to 0.3m'],
    selection: ['roof'],
    expectCapability: 'set-overhang', expectBusCommand: 'roof.update',
    authoritative: 'EDGE-MIDPOINT ORACLE: every edge midpoint of the overhung ring sits 300 mm ± 1 mm from the source boundary, and the min–max SPREAD of those distances is ≈ 0. A centroid scale gives spread ∝ distance-from-centre — the spread IS the discriminator.',
    // UPDATED 2026-08-11 (VERBS-CAP). BOTH halves of the old note are now stale,
    // and the second one is the interesting correction:
    //
    //  · "No chat capability" — there is one. `set-overhang` is a
    //    PropertyVocabulary row routed to `roof.update`, the same live carrier
    //    `set-roof-pitch` ships on (NOT the D-dead `roof.setOverhang`, which
    //    writes the detached plugin DTO store).
    //  · "the primitive is a known live defect (a centroid radial dilation sold
    //    as a parallel offset)" — RE-MEASURED by `probe-geometry.ts` on this
    //    tree: 300 mm requested delivers mean 300.00 mm with SPREAD 0.000 mm on
    //    square, elongated 40×4, L-plan and U-plan/courtyard footprints, vertex
    //    count preserved on all four, and −200 mm insets likewise. A centroid
    //    dilation cannot produce zero spread on a 40×4 rectangle. The offset is
    //    a true parallel offset now, and impossible insets REFUSE ("inward
    //    offset consumed the ring") rather than substituting.
    //
    // So the geometry was already right and the SENTENCE was the whole gap —
    // which is exactly what this row now scores.
    note: 'Chat capability `set-overhang` (PropertyVocabulary row + registry metadata, zero resolver lines) on the live `roof.update` carrier. The eave primitive re-measures as a true parallel offset: 0.000 mm spread on square / elongated / L / U plans (probe-geometry.ts).',
  },
  {
    id: '5.7', category: 5, name: 'modify roof footprint',
    utterances: ['change the roof footprint to the building outline', 'make the roof follow the walls', 'shrink the roof footprint by 200mm'],
    selection: ['roof'],
    expectCapability: null, expectBusCommand: null,
    authoritative: 'roof store roof.footprint ring; for the shrink case the same edge-midpoint oracle at −200 mm; vertex COUNT preserved',
    note: 'No capability. `shrinkPolygon` is a known live defect: it DELETES vertices and returns 2-vertex "polygons" as success — so vertex-count preservation is the invariant that catches it.',
  },
  {
    id: '5.8', category: 5, name: 'modify roof height',
    utterances: ['set height to 3m', 'make this roof 3m tall'],
    selection: ['roof'],
    expectCapability: 'set-height', expectBusCommand: 'element.updateParameters',
    authoritative: 'roof store roof.height === 3.0 m and the geometry\'s Y extent === 3.0 m ± 1 mm',
  },
  {
    id: '5.9', category: 5, name: 'invalid footprint → REFUSE',
    utterances: ['create a roof on a footprint of (0,0) (0,0) (0,0)', 'put a roof on this single wall'],
    expectCapability: null, expectBusCommand: null, expectRefusal: true,
    authoritative: 'NO roof element is created, AND the transcript names a refusal code. A degenerate footprint must not produce a 2-vertex "polygon" reported as success (`shrinkPolygon`\'s defect) nor a convex hull substituted for the real ring.',
    note: 'A refusal is the CORRECT answer. Emptiness and failure are not the same value.',
  },
  {
    id: '5.10', category: 5, name: 'impossible offset → REFUSE, not substitute',
    utterances: ['shrink the roof footprint by 50m', 'inset the roof by 50 metres'],
    selection: ['roof'],
    expectCapability: null, expectBusCommand: null, expectRefusal: true,
    authoritative: 'An inset larger than the inradius has NO valid parallel offset. The only honest outcomes are (a) refuse quoting the max feasible inset in mm, or (b) return the collapsed-to-nothing result explicitly. Silently clamping, or returning a scaled-down ring, is the substitution the founder named.',
    note: 'This row is the single sharpest test in category 5: it asks whether the system knows the difference between "cannot" and "here you go".',
  },
  {
    id: '5.11', category: 5, name: 'save/reload roof and verify geometry',
    utterances: ['(no utterance — save/reload cycle)'],
    expectCapability: null, expectBusCommand: null,
    authoritative: 'ProjectSerializer round-trip preserves form, pitch, ridge, overhang and the footprint RING ORDER; the rebuilt geometry is vertex-for-vertex identical (hash equality), not merely similar',
  },
];

/**
 * ADVERSARIAL ROWS — read-only questions that LOOK operational (doctrine 3).
 * Any of these that MUTATES is a hard failure regardless of category scores.
 * These are additional to, and disjoint from, the D14 gate's own corpus.
 */
export const ADVERSARIAL: readonly { readonly utterance: string; readonly why: string }[] = [
  { utterance: 'how thick is this wall?', why: 'informational — a question about thickness must not set it' },
  { utterance: 'what is the roof pitch?', why: 'informational' },
  { utterance: 'how many levels does this project have?', why: 'informational' },
  { utterance: 'should I make all walls interior partition?', why: 'a question ABOUT an operation, not the operation' },
  { utterance: 'why is the slab thickness 250mm?', why: 'explanatory' },
  { utterance: 'if I set the pitch to 45 degrees, what happens?', why: 'hypothetical (C68 §5.f class)' },
  { utterance: 'do not delete this wall', why: 'negation — the §FIX-CHAT-REPORT-PASTEBACK class' },
  { utterance: 'I did not ask you to add a level', why: 'negation + paste-back' },
  { utterance: 'Changed 4 of 6 walls — 2 skipped: no system type', why: 'report paste-back: our OWN output fed back in must not re-execute' },
  { utterance: 'Level 1 elevation 3.0 m, 4 walls, 2 doors', why: 'report-shaped noun phrase — closest thing to a level/plan capability' },
  { utterance: 'a window with 4 panes', why: 'the with → width stopword repro (C68 §5.j)' },
  { utterance: 'the door is 900mm wide', why: 'a STATEMENT of fact, not an instruction' },
  { utterance: 'can PRYZM create a mansard roof?', why: 'capability question — must answer, never build' },
  { utterance: 'undo would remove the wall, right?', why: 'hypothetical undo — must not undo' },
];

export const OPERATIONS: readonly OperationRow[] = OPS;
