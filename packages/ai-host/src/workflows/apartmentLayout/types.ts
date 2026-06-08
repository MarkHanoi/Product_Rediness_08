// Apartment Layout Generator — shared types (SPEC-APARTMENT-LAYOUT-GENERATOR §3/§7/§8/§9).
//
// ZERO imports by design: the validator + scorer are pure functions over these
// plain types, so they unit-test in plain Node without any package barrel. The
// runtime Zod parse of the AI response (A1/A4) lives with the workflow and reuses
// these shapes.

export type RoomType =
    | 'master' | 'bedroom' | 'living' | 'kitchen' | 'dining'
    | 'bathroom' | 'ensuite' | 'wc' | 'hall' | 'corridor' | 'study' | 'utility';

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
}

export interface ApartmentConstraints {
    minCorridorWidth: number;      // mm
    wallThickness: number;         // mm
    floorToCeiling: number;        // mm
    wallTypeId: string;
}

export interface ApartmentProgram {
    bedrooms: number;
    bathrooms: number;
    masterEnSuite: boolean;
    openPlanKitchenDining: boolean;
    livingRoom: boolean;
    entranceHall: boolean;
    /** §A.21.x-KITCHEN (2026-06-06): whether this plate gets a kitchen. Optional;
     *  ABSENT or `true` → a kitchen is created (apartment default — unchanged).
     *  `false` → NO kitchen (multi-storey HOUSE upper storeys, per SPEC-CASA §3:
     *  "UPPER level(s): bedrooms + bathrooms. No kitchen"). Without this the frozen
     *  single-plate engine pushed a kitchen onto EVERY storey → a 2-storey house
     *  had 2 kitchens (A.21.x test finding). */
    includeKitchen?: boolean;
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
    program: ApartmentProgram;
    constraints: ApartmentConstraints;
    options: { count: number; scoringWeights: ScoringWeights };
    /** A.25.3 — non-scoring engine-input tuning from the Living Design Parameter
     *  sliders (adjacency / accessibility / climate / space). Omitted ⇒ engine
     *  defaults (identity). Set by `gatherLayoutPayload` from the active sliders. */
    tuning?: EngineTuning;
}

