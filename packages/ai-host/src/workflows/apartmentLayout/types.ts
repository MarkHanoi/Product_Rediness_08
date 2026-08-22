// Apartment Layout Generator — shared types (SPEC-APARTMENT-LAYOUT-GENERATOR §3/§7/§8/§9).
//
// ZERO imports by design: the validator + scorer are pure functions over these
// plain types, so they unit-test in plain Node without any package barrel. The
// runtime Zod parse of the AI response (A1/A4) lives with the workflow and reuses
// these shapes.

export type RoomType =
    | 'master' | 'bedroom' | 'living' | 'kitchen' | 'dining'
    | 'bathroom' | 'ensuite' | 'wc' | 'hall' | 'corridor' | 'study' | 'utility'
    // §STAIR-ROOM-TYPE (ADR-0063, 2026-06-10, founder rule #1) — vertical-
    // circulation as a FIRST-CLASS room type. A multi-storey HOUSE reserves a
    // stair keep-out; modelling it as a NAMED `stair` room (not just a tiling
    // hole) makes the modal "Stair" cell EQUAL the executed stair cell so a
    // habitable room can never tile into the stair footprint. The apartment
    // (single storey) NEVER mints a `stair`, so it is byte-identical (ADR-0061).
    | 'stair'
    // §NEW-ROOM-TYPES (2026-06-12, program-rules-improvements-queue #1) — three
    // OPT-IN room types. A program that doesn't request them is byte-identical
    // (no minter creates them by default), but the type vocabulary + the single-
    // source-of-truth rule/dimension databases now cover them so a future modal
    // or AI brief can ask for one and the engine validates it correctly:
    //   • balcony   — EXTERIOR outdoor extension of a habitable room (shallow,
    //                 never glazed/windowed — it IS open air; never open-plan-merged).
    //   • storage   — small WINDOWLESS service room (store / walk-in / dressing);
    //                 interior-acceptable, never glazed, off a corridor/hall/bedroom.
    //   • open_plan — a FUSED kitchen-living-dining "great room" as a FIRST-CLASS
    //                 type (public, windowed, open-plan-eligible by construction).
    | 'balcony' | 'storage' | 'open_plan';

/** A room in an AI-proposed layout (areas in m², coordinates in mm). */
export interface LayoutRoom {
    name: string;
    type: RoomType;
    area: number;                  // m²
    windowCount: number;
    /** Reachable without passing through another room (en-suite via master is allowed). */
    hasDirectAccess: boolean;
    /** Names of rooms this one is adjacent to (shares a wall / a door). */
    adjacentTo: string[];
    /** Names of rooms this one is connected to by an ACTUAL DOOR / opening (a
     *  permeable boundary) — the real ACCESS graph, as opposed to `adjacentTo`
     *  which also counts mere wall-sharing. Circulation compliance must follow
     *  THIS: sharing a wall with the corridor is not the same as a door onto it.
     *  Optional for back-compat (older results / hand-built rooms omit it). */
    doorAdjacentTo?: string[];
    /** Footprint centroid (plan mm) — lets the build match this room to the
     *  detected room and apply its semantic name/type. */
    centroid?: Vec2mm;
    /** Footprint polygon (plan mm). Used by D-FLE in the open-plan case to
     *  constrain each sub-program's furnishing to its OWN sub-zone (kitchen
     *  run anchors against the kitchen sub-zone's walls, not the merged
     *  hall+living+kitchen+dining polygon). Optional for back-compat. */
    polygon?: ReadonlyArray<Vec2mm>;
    /** RoomOccupancyType string (e.g. 'bedroom','living-room') applied to the
     *  detected room post-build so it is coloured/tagged by use. */
    occupancy?: string;
}

export interface Vec2mm { x: number; y: number }      // plan coords, mm
/** A wall in a layout. `isExternal` marks a perimeter/shell wall — shown in the
 *  preview for context but skipped at build (the shell already exists). */
export interface LayoutWall { start: Vec2mm; end: Vec2mm; isExternal?: boolean }
export interface LayoutDoor {
    wallRef: number;
    offset: number;
    width: number;          // mm
    name?: string;
    // T1.D (2026-05-30) — room types on either side. Optional for back-compat
    // with AI-produced layouts that predate the field; when present, executePlan
    // calls `defaultDoorSystemTypeId(roomTypeA, roomTypeB)` to pick a per-pair
    // system-type id (privacy / glazed / solid-timber).
    roomTypeA?: RoomType;
    roomTypeB?: RoomType;
}
/** T1.W-B (2026-05-30) — emitted internal-side window. Mirrors LayoutDoor
 *  but only carries ONE roomType because a window has one room + the
 *  exterior; executePlan applies the per-room window system-type via
 *  `defaultWindowSystemTypeId(roomType)`. All dims mm. */
export interface LayoutWindow {
    wallRef:    number;
    offset:     number;
    width:      number;
    height:     number;
    sillHeight: number;
    name?:      string;
    roomType?:  RoomType;
}
/** A virtual room-bounding line (no wall, no door) that splits two adjacent
 *  open-plan spaces logically so room detection sees them as separate rooms.
 *  Built via the editor's `CreateRoomBoundingLineCommand` at execute time. */
export interface LayoutBoundary { start: Vec2mm; end: Vec2mm }

export interface LayoutOption {
    summary: string;
    rooms: LayoutRoom[];
    walls: LayoutWall[];
    doors: LayoutDoor[];
    /** T1.W-B (2026-05-30) — emitted internal-side windows. Optional for
     *  back-compat with AI-produced options that predate the field; when
     *  present, executePlan emits one wall.createOpening + window.batch.create
     *  per entry (mirrors the door cascade). */
    windows?: LayoutWindow[];
    /** Virtual room-splitters for open-plan thresholds (hall↔living, kitchen↔living,
     *  kitchen↔dining, …). Optional for back-compat with AI-produced options that
     *  predate this field. */
    boundaries?: LayoutBoundary[];
    corridorWidthMin: number;      // mm
    /** §INTERIOR-HEIGHT-MATCH (2026-05-29, audit follow-up): partition wall
     *  height in MM, derived from the SHELL's perimeter walls at payload time
     *  (gatherLayoutPayload reads the max height of existing exterior walls)
     *  and threaded through constraints.floorToCeiling. The executor reads
     *  this to size generated partitions so they match the shell — replaces
     *  the prior live-fix that reached into the wall store from the executor
     *  itself. Omitted ⇒ executor falls back to level.height, then default. */
    floorToCeilingMm?: number;
    /** §DIAG-WINDOW-RULE (founder rule #1 GENERAL, 2026-06-10) — every WINDOW-DESIRED
     *  room that FRONTS a façade (has ≥1 external/shell wall on its boundary), as
     *  `[roomKey, roomType]` pairs. The `roomKey` matches the window-emission engine's
     *  `roomKeyOf` (the room's stamped window name, e.g. `"Bedroom 1 Window"`, else
     *  `type@wallRef`). Lets the shell-window resolver's §DIAG-WINDOW-RULE flag ANY
     *  perimeter-touching room that ends WINDOWLESS as a ⚠ rule violation — even when
     *  the room emitted ZERO surviving window candidates. Optional + ADDITIVE: omitted
     *  ⇒ the diagnostic falls back to the emitted-window set (byte-identical output). */
    perimeterWindowRooms?: ReadonlyArray<readonly [string, string]>;
    /** §CI-0 (SPEC-49 §4, 2026-08-13) — the engine's own circulation verdict about
     *  THIS option. See {@link LayoutCirculationVerdict}. Optional and ADDITIVE: an
     *  AI-produced or hand-built option that never went through `enumerate.ts` has no
     *  verdict, and `undefined` here means **NOT MEASURED**, never "sound". */
    circulation?: LayoutCirculationVerdict;
    /**
     * §HONEST-PICKER (L-4200, 2026-08-22) — STATED LIMITATIONS OF *THIS* OPTION,
     * in the words the user must read BEFORE pressing "Use this layout".
     *
     * The founder's Room 03-002 report is the reason this field exists. The strip
     * slicer had planned on an inscribed rectangle 10.6 m² smaller than the room,
     * after the D-TGL engine had ALREADY declined the same program for a NAMED
     * architectural reason — and the only trace of either fact was a sentence
     * appended to `summary`, which `.alm-title`'s `text-overflow: ellipsis`
     * truncated away. A card that looks authoritative while silently dropping 12 %
     * of the room is the exact defect class C83 §5.2.1 / C78 §1.4 forbid.
     *
     * ABSENT ⇒ NOTHING IS CLAIMED — never "no limitations". An empty array is the
     * positive statement "this option was checked and carries none".
     */
    limitations?: readonly LayoutLimitation[];
}

/**
 * §HONEST-PICKER (L-4200) — one stated limitation of a layout option.
 *
 * `severity` is the user-facing weight, NOT a legality verdict: `error` means the
 * option breaches something normative (a room below its `programRules.minAreaM2`),
 * `warning` means it is buildable but the engine had to approximate (planning on an
 * inscribed rectangle; running a fallback engine after the real one declined).
 */
export interface LayoutLimitation {
    /** Stable machine code — the renderer never keys on the prose. */
    readonly code:
        | 'shape-approximated'      // planned on an inscribed rectangle, not the real polygon
        | 'engine-fallback'         // the D-TGL engine declined; a weaker generator produced this
        | 'room-below-minimum'      // a room is smaller than its programRules minimum
        | 'private-room-is-passage' // a bathroom/en-suite is only reachable through another room
        | 'requested-room-absent';  // a room the user asked for is not in this layout
    readonly severity: 'error' | 'warning';
    /** One sentence, plain language, carrying BOTH numbers wherever two exist. */
    readonly text: string;
}

/**
 * §HONEST-PICKER (L-4200) — WHY THE D-TGL ENGINE PRODUCED NO CANDIDATE.
 *
 * `enumerateLayouts` computed exactly this diagnosis at every `return []` and then
 * DISCARDED it (the mandatory / min-area sentence was `console.warn`-ed only behind
 * `__pryzmLayoutDiag`). `generate.ts` therefore could not distinguish "the engine
 * refused this program on architectural grounds" from "the engine crashed on a
 * degenerate perimeter", and fell through to the strip slicer for both — shipping
 * the very layout the engine had just refused. ABSENT ⇒ NOT MEASURED.
 */
export type LayoutDeclineKind =
    /** §D3.5 apartment-envelope band: shell area vs bedroom count. */
    | 'envelope'
    /** Viability gate: every strategy dropped a requested mandatory room, or shrank
     *  a habitable room below its `programRules.minAreaM2`. */
    | 'program-does-not-fit'
    /** No usable boundary, or no strategy built a candidate at all. */
    | 'degenerate';

export interface LayoutDeclineDiagnosis {
    readonly kind: LayoutDeclineKind;
    /** The ENGINE's own sentence. Never empty. */
    readonly reason: string;
    /** Mandatory room types dropped by EVERY strategy (union). */
    readonly missingMandatoryTypes?: readonly string[];
    /** Rooms every strategy shrank below minimum — BOTH numbers, per C73 §4.4. */
    readonly underMinAreaRooms?: ReadonlyArray<{
        readonly type: string;
        readonly areaM2: number;
        readonly minAreaM2: number;
    }>;
    /** The shell area the engine judged (m²). */
    readonly shellAreaM2?: number;
}

/**
 * §CI-0 (SPEC-49 §4) — THE VERDICT THE ENGINE ALREADY COMPUTES, CARRIED ACROSS THE
 * EMIT BOUNDARY INSTEAD OF DROPPED.
 *
 * Before this block existed, `enumerate.ts` evaluated every hard architectural rule
 * (reach · circulation · served-through · corridor-stair · corridor-hall), decided
 * `hardValid`, warned §TOPO-HARD-REJECT-ALL to the console — and then `emitGeometry`
 * projected to a `LayoutOption` with nowhere to put any of it. A caller that WANTED to
 * refuse a broken plan could not see that it was broken. SPEC-49 §3 item 4 calls that
 * "the single most consequential structural fact in this audit".
 *
 * ⚠ THIS TYPE CARRIES A VERDICT, NOT A DECISION. Nothing in the engine refuses on it.
 * The house path in particular ships the least-bad HARD-INVALID candidate by design
 * (`isHousePath` disables the structured rejection outright), which is why SPEC-49
 * measured 12 of 24 house storeys with an unreachable room. The founder's decision
 * (2026-08-13) is **ship the least-bad storey PLUS a blocking banner naming the sealed
 * rooms** — the banner is a separate consumer of this block (CI-1), and silently
 * shipping is the one option that was ruled out.
 *
 * ⚠ THE THREE ROOM SETS ARE THREE DIFFERENT QUESTIONS AND ARE NEVER MERGED (C75 §1.2 —
 * two distinct facts must never print the same value). A room can appear in one, two or
 * all three, and each has a different remedy.
 */
export interface LayoutCirculationVerdict {
    /** True ⇒ this option violated NO hard architectural rule. False ⇒ it is a
     *  §TOPO-HARD-REJECT-ALL least-bad survivor: the engine shipped it knowing it fails. */
    readonly hardValid: boolean;
    /** WHICH rules failed — subset of {'window','circulation','privacy','overlap',
     *  'minarea','mandatory','reach','served-through','corridor-stair','corridor-hall',
     *  'room-out-of-bounds',…}. Empty iff `hardValid`. */
    readonly hardFailedRules: readonly string[];
    /** SEALED, by BFS from the entrance: habitable rooms the access graph cannot reach.
     *  A room here may still HAVE a door — if every route to it is itself sealed. */
    readonly unreachableRoomIds: readonly string[];
    /** Display names for {@link unreachableRoomIds}, resolved through the emit-time
     *  id→name index. An id with no emitted room resolves to the id itself rather than
     *  being dropped — a name we cannot resolve is still a room that is sealed. */
    readonly unreachableRoomNames: readonly string[];
    /** NO DOOR ONTO CIRCULATION, by the door router: rooms reachable only THROUGH
     *  another room. Distinct from `unreachableRoomIds` — a served-through bedroom is
     *  here and not there; a room behind a sealed corridor is there and not here. */
    readonly unroutedToCirculationRoomIds: readonly string[];
    /** Display names for {@link unroutedToCirculationRoomIds}. */
    readonly unroutedToCirculationRoomNames: readonly string[];
    /** NO DOOR AT ALL — derived at emit time from the realised door graph
     *  (`LayoutRoom.doorAdjacentTo` empty). This is the set the founder saw and SPEC-49
     *  §10.3 measured at 11/24 house storeys, one of them a doorless `Stair`. It is
     *  NEITHER of the two sets above: those are computed on the bubble graph before
     *  emission, this one on the doors that actually shipped. */
    readonly doorlessRoomIds: readonly string[];
    /** Display names for {@link doorlessRoomIds}. */
    readonly doorlessRoomNames: readonly string[];
    /** §CI-4 — house-path storey-scale contiguity: the corridor shares no door-width
     *  wall with the stair keep-out. ALWAYS false on the apartment path and on plates
     *  with no corridor, so it never fires where it cannot apply. */
    readonly corridorStairGap: boolean;
    /** §CI-4 — the ground-floor twin: the corridor shares no door-width wall with the
     *  entrance hall. Mutually exclusive with {@link corridorStairGap} per storey. */
    readonly corridorHallGap: boolean;
}

export interface ApartmentConstraints {
    minCorridorWidth: number;      // mm
    wallThickness: number;         // mm
    floorToCeiling: number;        // mm
    wallTypeId: string;
    /**
     * §HABITABILITY-MINIMA-ARE-JURISDICTIONAL (L-4406, lane JURIS11, 2026-08-22) —
     * WHERE this apartment is, so the room minima the engine enforces are the ones
     * the law of THAT place imposes rather than a foreign country's (L-4210).
     *
     * Resolved at the composition surface from the ONE existing geography resolver
     * (`resolveRegisteredJurisdictionAt` in @pryzm/site-parcel-data) and carried here
     * as plain strings — the layout engine never touches geometry-to-jurisdiction.
     * See `rules/habitability/` and ADR-0352.
     *
     * ⛔ OPTIONAL, AND ABSENT MEANS "PRYZM DOES NOT KNOW WHERE THIS IS". It resolves
     * to the ONE named PRYZM baseline, and every sentence built from it says the
     * figure is a PRYZM default and not a regulation. Absent is NOT "the UK" and is
     * NOT "unconstrained". A call site that omits it is byte-identical to the
     * pre-L-4400 engine, which is why it is safe to migrate call sites one at a time.
     */
    habitability?: import('./rules/habitability/types.js').HabitabilityBinding;
}

export interface ApartmentProgram {
    bedrooms: number;
    bathrooms: number;
    masterEnSuite: boolean;
    openPlanKitchenDining: boolean;
    livingRoom: boolean;
    entranceHall: boolean;
    /** §RAC-APARTMENT-IN-ROOM (L-1642, 2026-08-21) — how many bedrooms get their
     *  OWN en-suite, paired one-per-bedroom in mint order (bedIds[0..N-1], the
     *  master first). Optional; ABSENT ⇒ the legacy behaviour byte-for-byte:
     *  exactly one en-suite iff {@link masterEnSuite}, paired to the master.
     *  Clamped to [0, bedrooms] in the bubble graph (an en-suite pairs 1:1 with a
     *  bedroom — §ENSUITE-1TO1). Any value ≥ 1 makes the FIRST bedroom a master
     *  (the ensuite type rule reaches it there), exactly as masterEnSuite does.
     *  Rides the SAME per-instance `ProgramRoom.ensuiteHostId` machinery the
     *  §SUITE-WITHIN-PARENT hotel-suite mode uses — never a global rule change
     *  (see the §BEDROOM-ENSUITE-2DOOR doctrine block in programRules.ts). */
    enSuiteCount?: number;
    /** §RAC-APARTMENT-IN-ROOM (L-1643, 2026-08-21) — the TRUE fused open-plan ask
     *  ("open kitchen + living room"): mint ONE `open_plan` great room (the
     *  first-class RoomType programRules.ts:739 fully specifies) INSTEAD OF the
     *  separate living / kitchen / dining rooms, wired per its accessFrom
     *  ['hall','corridor']. DISTINCT from {@link openPlanKitchenDining}, which
     *  keeps three rooms and merely opens the LIVING↔DINING threshold
     *  (§KITCHEN-DISTINCT re-interpretation). Optional; ABSENT / false ⇒
     *  byte-identical legacy minting. types.ts:19-22 promised "a future brief may
     *  ask for one" — this is that brief field. */
    openPlanKitchenLiving?: boolean;
    /** §DIAG-MERGE-DIVIDER (tracker §57.3, 2026-06-11) — whether the LIVING room
     *  shares an OPEN (wall-less) threshold with the dining zone (the "lounge-diner"
     *  pattern). Optional; ABSENT or `true` → the legacy behaviour: when
     *  {@link openPlanKitchenDining} is on, LIVING ↔ DINING is an `open` edge
     *  (apartment default — byte-identical). `false` → LIVING is a SEPARATE, fully
     *  WALLED room (a `door` edge to dining) while the open-plan merge moves to the
     *  literal KITCHEN ↔ DINING pair (the architecturally-correct "open-plan kitchen +
     *  dining" = one kitchen-diner; Living distinct).
     *
     *  THE DEFECT this closes: the multi-storey HOUSE GROUND floor forced
     *  `openPlanKitchenDining: true`, which under the legacy edge opened LIVING ↔ DINING
     *  and SUPPRESSED the divider between them — so room detection flooded across the
     *  missing wall and shipped the compound "Living Room / Dining" (and on deeper plates
     *  swept a corridor / bathroom in too). The HOUSE ground now sets this `false`, so
     *  Living keeps its sealing partition; kitchen + dining still merge as intended. */
    openPlanLivingDining?: boolean;
    /** §A.21.x-KITCHEN (2026-06-06): whether this plate gets a kitchen. Optional;
     *  ABSENT or `true` → a kitchen is created (apartment default — unchanged).
     *  `false` → NO kitchen (multi-storey HOUSE upper storeys, per SPEC-CASA §3:
     *  "UPPER level(s): bedrooms + bathrooms. No kitchen"). Without this the frozen
     *  single-plate engine pushed a kitchen onto EVERY storey → a 2-storey house
     *  had 2 kitchens (A.21.x test finding). */
    includeKitchen?: boolean;
    /** §HOUSE-GROUND-PUBLIC-SET (A.21.D28 #4, 2026-06-11): whether this plate gets a
     *  STUDY (home office). Optional; ABSENT or `false` → no study (apartment default
     *  + every storey that doesn't ask — unchanged / byte-identical). `true` → mint a
     *  `study` room linked off the corridor spine (study.accessFrom includes
     *  'corridor', maxDoors 1). Used ONLY by the multi-storey HOUSE GROUND `fillGroundPlate`
     *  to grow the ground floor's PUBLIC room SET on a large plate (so the few public
     *  rooms aren't stretched into a blob and the §HOUSE-MAX-CAP presents the whole
     *  plate) WITHOUT moving bedrooms off the upper storeys. A study is corridor-served,
     *  so it never seals. */
    includeStudy?: boolean;
    /** §HOUSE-GROUND-PUBLIC-SET (A.21.D28 #4, 2026-06-11): whether this plate gets a
     *  UTILITY / laundry room. Optional; ABSENT or `false` → no utility (apartment
     *  default — unchanged / byte-identical). `true` → mint a `utility` room linked off
     *  the corridor spine (utility.accessFrom includes 'corridor', maxDoors 1). Same
     *  role as {@link includeStudy}: a corridor-served service room that grows the
     *  multi-storey GROUND floor's room SET on a large plate without sealing. */
    includeUtility?: boolean;
    /** §ROOM-AREAS (2026-05-29, user-request from modal dynamic feedback):
     *  per-`RoomType` ABSOLUTE area override in m². When supplied, the bubble
     *  graph uses this value as the room's `targetAreaM2` directly, BYPASSING
     *  the area-weight × shell-area distribution. Still clamped to the room
     *  type's `minAreaM2` floor (the per-program-rules HQI / Building Reg
     *  minimum) so an override smaller than the legal minimum can't sneak in.
     *
     *  All rooms of the SAME TYPE share one override — i.e. setting
     *  `bedroom: 14` makes every bedroom target 14 m². For PER-INSTANCE
     *  overrides (Bedroom 1 = 14, Bedroom 2 = 12) use `roomAreasByName`
     *  below — name-keyed lookups win over type-keyed.
     *
     *  Omitted / undefined → engine default (area-weight share). Empty
     *  object = same as omitted. */
    roomAreas?: Partial<Record<RoomType, number>>;
    /** §ROOM-AREAS-BY-NAME (2026-05-29 follow-up): per-INSTANCE absolute area
     *  override in m², keyed by the deterministic bubble-graph display name
     *  ("Bedroom 1", "Master Bedroom", "Bathroom 2", etc.). Lets a future
     *  modal UI assign different areas to "Bedroom 1" vs "Bedroom 2" without
     *  affecting other bedrooms.
     *
     *  Lookup order: bubble graph checks `roomAreasByName[r.name]` FIRST;
     *  falls back to `roomAreas[r.type]` if the name has no override; falls
     *  back to the weight-scaled default if neither is set. Names that don't
     *  match any minted room are silently ignored (no warning) — handy when
     *  the user toggles a program flag that renames a room (e.g. master
     *  en-suite changes "Bedroom 1" → "Master Bedroom"). The same
     *  architectural-minimum clamp applies. */
    roomAreasByName?: Partial<Record<string, number>>;
    /** §ROOM-TYPES-BY-NAME (A.26.4, 2026-06-08, ADR-0061 / C52): per-INSTANCE
     *  ROOM-TYPE (occupancy) override, keyed by the deterministic bubble-graph
     *  display name ("Bedroom 1", "Master Bedroom", "Study", …). The direct
     *  sibling of `roomAreasByName`: where that re-targets a room's AREA, this
     *  re-targets its TYPE. It lets the Editable Living Graph (A.26.4) re-type a
     *  single DETECTED room — "make Bedroom 2 a Study" — without touching the
     *  program's bedroom/bathroom COUNT flags.
     *
     *  Consumed in `buildBubbleGraph` AFTER the rooms are minted from the program
     *  flags: a minted room whose `name` has an override is re-typed to the new
     *  `RoomType` (its `needsWindow`, area weight, minima, adjacency rules + the
     *  semantic edges it participates in then all derive from the NEW type, via
     *  the single-source-of-truth `roomRule`). Because the override re-types an
     *  EXISTING room slot (it never adds or removes a room), the room set, order,
     *  ids + names are unchanged — only the type. Names that don't match any
     *  minted room are silently ignored; an entry whose value equals the room's
     *  existing type is a no-op.
     *
     *  Omitted / undefined / empty object ⇒ engine default (types come purely
     *  from the program flags) ⇒ byte-identical baseline (ADR-0061 invariant I2). */
    roomTypesByName?: Partial<Record<string, RoomType>>;
    /** §ROOM-FLOOR-BY-NAME (XFLOOR-GRAPH XA, 2026-06-09, SPEC §9.4b / C52 / ADR-0061):
     *  per-INSTANCE FLOOR (storey) override for the multi-storey HOUSE engine, keyed
     *  by the concatenated-graph STOREY-QUALIFIED node id (`"storey:<s>/<roomName>"`)
     *  → target storey index (0 = ground). It lets the cross-floor Living Graph
     *  "move a bedroom from upstairs to downstairs" by re-assigning which storey a
     *  named room instance lives on — without a parallel mutator (C52 §3.4).
     *
     *  Consumed ONLY by `allocateProgramToStoreys` (the one place that decides a
     *  room's storey): after the count-based default split, each `(nodeId → target)`
     *  moves ONE count of that room's TYPE (derived from the room name) from the
     *  SOURCE storey (the `storey:<s>/` id prefix) to the target. Floor-pinned types
     *  (kitchen/dining/living/entrance hall) are GROUND-only and a move that violates
     *  the pin is REJECTED (logged), keeping each storey feasible.
     *
     *  Room names are unique WITHIN a storey but NOT across, so the key MUST be the
     *  storey-qualified node id (a bare name would be ambiguous). Apartment (single
     *  storey) is unaffected — `storeyCount === 1` has no other storey to move to.
     *
     *  Omitted / undefined / empty object ⇒ no move ⇒ the count-split is unchanged ⇒
     *  byte-identical baseline (ADR-0061 invariant I2). */
    roomFloorByName?: Partial<Record<string, number>>;
    /** §ROOM-ADJACENCY (SPEC-DYNAMIC-PROGRAM-CANVAS §5.6, C52 E3, 2026-06-10): desired
     *  room-to-room adjacencies the user drew as edges in the program-canvas graph
     *  ("connect two rooms → they share a door"). Each `[nameA, nameB]` pair (the
     *  deterministic minted display names) asks the bubble graph to add a `door`
     *  edge between those rooms — but ONLY when the pair is PERMITTED
     *  (`doorAllowedBetween`); a forbidden pair (e.g. bedroom↔bedroom) is ignored, so
     *  the override can never breach the permission matrix. A pair already linked is a
     *  no-op. Omitted / empty ⇒ no extra edge ⇒ byte-identical baseline (ADR-0061 I2). */
    roomAdjacencyByName?: ReadonlyArray<readonly [string, string]>;
    /** §FORCE-CORRIDOR-DIRECT (founder 2026-06-18, "the user should be able to select
     *  which rooms in each level connect directly with the corridor via door — the
     *  shortest path possible"): the per-level "↔ Corridor" toggles. A `RoomType` listed
     *  here REQUESTS that EVERY room of that type on this plate gets a DIRECT door onto the
     *  circulation spine (corridor preferred, else hall), placed BEFORE the generic
     *  reconcile on the room↔corridor shared wall with the LONGEST run nearest the room's
     *  centroid (the shortest-path door). Honoured by `buildWallsAndDoors` ONLY when the
     *  pair is PERMITTED (`doorAllowedBetween`) and the host room is under its door cap — a
     *  forced door that would breach a hard rule is SKIPPED (logged `§DIAG-CORRIDOR-FORCE
     *  skipped`), never realised illegally. Omitted / empty ⇒ engine decides (today's
     *  behaviour) ⇒ byte-identical baseline (ADR-0061 invariant I2). */
    corridorDirectRoomTypes?: readonly RoomType[];
    /** §WETROOM-PUBLIC-DOOR (founder 2026-06-18, "the ground-floor bathroom ships SEALED"):
     *  when true, a GROUND-floor bathroom that every standard door pass left genuinely
     *  SEALED may, as a NET-ADD last resort, open onto the nearest reachable PUBLIC space
     *  (hall → living → dining priority). Threaded straight into `buildWallsAndDoors`. The
     *  house orchestrator sets this true ONLY for the GROUND storey program; the apartment
     *  and every upper storey leave it undefined ⇒ the fallback pass is skipped ⇒
     *  byte-identical baseline (ADR-0061 invariant I2). */
    groundFloorWetRoomPublicFallback?: boolean;
}

export interface ScoringWeights {
    naturalLight: number;
    privacy: number;
    kitchenWorkflow: number;
    corridorEfficiency: number;
}

/**
 * A.25.3 — non-scoring engine-input tuning derived from the Living Design
 * Parameter sliders that DON'T map to a `ScoringWeights` axis. Each field binds
 * to an existing engine substrate (ADR-0060: bind, don't fork) and re-runs the
 * deterministic engine differently. Every field's NEUTRAL value reproduces the
 * legacy engine constant exactly, so a centred slider is identity.
 *
 * Threaded (when present) from the payload → `generateLayoutOptions` →
 * `generateDeterministicLayouts` → `enumerateLayouts`. ABSENT (undefined) ⇒ the
 * engine uses its built-in defaults — byte-identical to the pre-A.25.3 baseline.
 */
export interface EngineTuning {
    /** Program-rules adjacency strictness multiplier (neutral 1.0). > 1 rewards
     *  preferred adjacencies harder + penalises low-preference / forbidden ones
     *  more; < 1 relaxes. Feeds `computeObjectives` (the `adjacency` axis). */
    adjacencyStrictness?: number;
    /** Corridor clear-width (metres, neutral 1.2 = engine default). Feeds the
     *  subdivider's corridor strip — wider when accessibility is high. */
    corridorWidthM?: number;
    /** D6 `SolarBias.weight` ∈ [0,1] (neutral 0.6 = D6 default). Feeds the
     *  climate-driven window-orientation pass. */
    solarWeight?: number;
    /** Habitable-room area-weight multiplier (neutral 1.0). > 1 grows
     *  living/bedroom areas; feeds the bubble-graph allocator. */
    spaceGenerosity?: number;
}

export interface ValidationResult {
    valid: boolean;
    /** Human-readable reasons; fed back into the retry prompt (§10). */
    failures: string[];
}

export interface LayoutScoreBreakdown {
    naturalLight: number;          // 0-1
    privacy: number;               // 0-1
    kitchenWorkflow: number;       // 0-1
    corridorEfficiency: number;    // 0-1
    // §L1-α-4 PREP (2026-05-29) — additional objective-axis scores plumbed
    // from `TglCandidate.objectives` when the layout came from the D-TGL
    // deterministic path. Absent when the layout came from the AI relay (no
    // candidate). Modal-side rendering arrives in a follow-on commit.
    /** §PRIVACY-DEPTH discrete-tier hierarchy (L2-β-1, shipped `deffad5`). */
    hierarchy?: number;            // 0-1
    /** §SHAPE-QUALITY soft-finding aggregate (D3.1, shipped `1bf7767`). */
    shapeQuality?: number;         // 0-1
    /** §TOPOLOGY-QUALITY soft-finding aggregate over A1/A3/A5/A6/A8 validators
     *  (T3.3, shipped `3972a27`; gradient since `4d1b41f`). */
    topologyQuality?: number;      // 0-1
    /** §L3-γ-4 edgeRealisation — per-edge match between geometric `via`
     *  (door / open) and semantic `kind` (CEREMONIAL_THRESHOLD / INTIMATE_ACCESS
     *  / VISUAL_CONNECTION / …). Pareto-ranks "every edge realised right"
     *  above "every edge realised wrong" (e.g. INTIMATE_ACCESS via open is
     *  a privacy failure). Shipped `cf13b11`. */
    edgeRealisation?: number;      // 0-1
    /** §L4-δ-3 openingCadence — per-wall rhythmic regularity of opening
     *  spacing (including gaps to wall ends as virtual openings). Score
     *  per wall = 1 − coefficient_of_variation(gaps); aggregate axis is
     *  the mean across walls that host any opening. 1.0 = perfectly
     *  regular cadence; 0.0 = bunched. Architectural intent: distinguish
     *  "designed door spacing" from "doors-happen-to-bunch-here."
     *  Cognition Layer 4 (Compositional Geometry). */
    openingCadence?: number;       // 0-1
    /** §L4-δ-4 proportionalElegance — per-room aspect-ratio comfort
     *  plateau on top of D2.1's HARD aspect bounds. Square→golden (1.0–φ)
     *  scores 1.0; rooms beyond 2.5 decay; corridor-like (>4) collapses
     *  to 0.1. Area-weighted mean. Distinguishes layouts that PASS D2.1
     *  but produce uncomfortable long/thin rooms. Cognition Layer 4. */
    proportionalElegance?: number; // 0-1
    /** §L2-β-4 spatialClimax — identifies dominant non-circulation space
     *  and scores its arrival depth. Compression-release ideal at depth
     *  ∈ [2, 4]; too shallow / too deep penalised. Cognition Layer 2
     *  (Spatial Hierarchy) — complements hierarchy axis (privacy depth)
     *  with arrival-sequence depth. */
    spatialClimax?: number;        // 0-1
    /** §L2-β-2 entrySightline — graph-distance proxy for how many spaces
     *  the entry visually reveals at one threshold (counts CONNECTS_THROUGH
     *  + permeable ADJACENT_TO edges from the hall/entry). Bell around 1-2
     *  visible (architectural ideal); 0 = blind entry; ≥4 = over-exposed.
     *  Cognition Layer 2. The ray-cast variant is queued as L2-β-2b. */
    entrySightline?: number;       // 0-1
    /** §L2-β-3 arrivalSequence — compression-release pattern: ratio of
     *  largest-visible-from-entry space area to the entry's own area.
     *  ratio ≥ 4× → 1.0 (small lobby releasing into large living, ideal);
     *  ratio < 1 → 0 (anti-pattern: entry is bigger than what it reveals).
     *  Cognition Layer 2. */
    arrivalSequence?: number;      // 0-1
    /** §L4-δ-2 wetStackAlignment — wet-room centroids collinear on X or Z?
     *  σ_min on the stack axis → score = 1 − σ/2m. Aligned wet rooms can
     *  share a plumbing stack. Complements T2.4 wet-cluster (which scores
     *  wall-sharing) by adding a centroid-axis check. Cognition Layer 4. */
    wetStackAlignment?: number;    // 0-1
    /** §L4-δ-1 alignmentField — shared axis-line detection across the plan.
     *  Score = fraction of room-rect edges that share an axis line (within
     *  50 mm) with at least one other edge. Rewards layouts whose walls
     *  participate in a small, disciplined axis system. Cognition Layer 4. */
    alignmentField?: number;       // 0-1
    /** §L1-α-4 facadeAlignment — habitable rooms anchored on HIGH-VALUE
     *  shell edges (south-facing > north-facing, corner > straight, per
     *  L1-α-1 `FacadeValueField`). Pareto-ranks "good rooms on best
     *  façades" above "good rooms on poor façades." Cognition Layer 1
     *  (Environmental Intelligence) — complements `naturalLight` (which
     *  counts windowed rooms binary) by weighting by façade quality. */
    facadeAlignment?: number;      // 0-1
    /** §ENV-E2-SOLAR — solar room-placement bias (Environmental-Design-Drivers
     *  spec §2; extends A.21.D6). DAYTIME rooms (living/dining/kitchen) on the
     *  equator-facing (sun) side + BUFFER rooms (garage/utility/bath/ensuite/wc/
     *  storage) on the cold side score higher. Neutral (1.0) when no site latitude
     *  is supplied. Cognition Layer 1 (Environmental Intelligence). */
    solarOrientation?: number;     // 0-1
    /** §ENV-E3-ACOUSTIC — acoustic-zoning bias (Environmental-Design-Drivers spec
     *  §4, driver 5). QUIET rooms (bedroom/master/study) buffered from NOISY rooms
     *  (kitchen/utility/laundry/wc/bathroom) score higher; a hall/corridor/wc/
     *  storage between them is rewarded. Neutral (1.0) when no quiet↔noisy relation
     *  exists. Env-performance band. */
    acousticZoning?: number;       // 0-1
    /** §ENV-E4-VENT — natural-ventilation bias (Environmental-Design-Drivers spec
     *  §5, driver 6). Habitable rooms with windows on ≥2 differently-oriented
     *  façades (cross-vent) + plan depth within the cross-vent reach (~12.5 m)
     *  score higher; a stair/stack path nudges up. Neutral (1.0) when no external-
     *  wall/opening data. Env-performance band. */
    naturalVentilation?: number;   // 0-1
}

export interface LayoutScore {
    overall: number;               // 0-100
    breakdown: LayoutScoreBreakdown;
}

export interface ScoredLayoutOption extends LayoutOption {
    score: LayoutScore;
}

/** Generate-phase payload (SPEC §3). Units: mm for constraints; areas m². */
export interface ApartmentGenerateLayoutPayload {
    levelId: string;
    shellWallIds: string[];
    entranceDoorId: string;
    windowIds: string[];
    /** Optional: WORLD-XZ axis-aligned window spans on the shell perimeter
     *  (metres). Fed to D-TGL's subdivide so interior partitions never
     *  terminate inside a window opening. Empty/omitted ⇒ no snap. */
    windowSpansWorld?: Array<{ a: { x: number; z: number }; b: { x: number; z: number } }>;
    /** §DOOR-AVOIDANCE (2026-05-29): WORLD-XZ axis-aligned door spans on the
     *  shell perimeter (metres) — the user-placed exterior doors (e.g. the
     *  front door) BEFORE the apartment generator runs. Fed to the same
     *  partition-snap pass so a generated interior wall never terminates
     *  INSIDE a pre-existing door opening. Empty/omitted ⇒ no snap. */
    doorSpansWorld?: Array<{ a: { x: number; z: number }; b: { x: number; z: number } }>;
    /** A.21.D6 — site latitude (decimal degrees) for climate-driven window
     *  orientation (windows prefer the sun-facing façade). Read from
     *  `siteModelStore.getLocation().latitude`; omitted ⇒ pure-length placement. */
    siteLatitudeDeg?: number;
    /** §RAC-APARTMENT-IN-ROOM (L-1644, 2026-08-21) — a room-scoped run: the target
     *  ROOM's wall-CENTRELINE boundary ring (closed, world-XZ metres — the
     *  RoomData.boundary.polygon contract). When present with ≥3 vertices the
     *  shell reader synthesises the shell from THESE edges instead of resolving
     *  `shellWallIds` against the wall store — the room's bounding walls already
     *  exist and must never be re-created, so they enter as geometry, not as
     *  store ids. The centreline ring (not the inner face) is deliberate:
     *  `analyseShell`'s contract is wall baseLines, which ARE centrelines, so the
     *  engine's own net-area / inset semantics land partitions inside the inner
     *  face exactly as they do for a whole-level shell; feeding an already-inset
     *  ring would inset twice. `shellWallIds` then carries the synthetic
     *  `room-ring-N` edge ids (≥3 by the RoomBoundary min-3-vertex contract). */
    shellRingWorld?: Array<{ x: number; z: number }>;
    /** §RAC-APARTMENT-IN-ROOM / L-911 (2026-08-21) — the user STATED the bedroom
     *  count in the sentence, so it is exact: suppresses the ~130 m²/bedroom
     *  plate-density round-up, the §ENVELOPE-FIT-GROWTH auto-growth AND the
     *  §BEDROOM-AUTO-ITERATE retry (a stated count is never silently adjusted —
     *  the envelope refusal then names both numbers instead). Absent ⇒ every
     *  existing caller is byte-identical (growth stays on). */
    lockBedroomCount?: boolean;
    program: ApartmentProgram;
    constraints: ApartmentConstraints;
    options: { count: number; scoringWeights: ScoringWeights };
    /** A.25.3 — non-scoring engine-input tuning from the Living Design Parameter
     *  sliders (adjacency / accessibility / climate / space). Omitted ⇒ engine
     *  defaults (identity). Set by `gatherLayoutPayload` from the active sliders. */
    tuning?: EngineTuning;
}

