// @pryzm/ai-host — ChatCapabilityRegistry (ADR-0313 §Capability-driven resolution)
// =============================================================================
//
// WHY THIS EXISTS — a defect, not a theory.
//
// Commit c1902a5a shipped `wall.updateSystemTypeBatch` (retype every wall in one
// undo step) and commit 48750f9c shipped the chat panel IN THE SAME RELEASE. The
// founder typed "make all walls interior partition" and the chat answered
// "I'm not sure how to help with that yet." Nothing was broken: the command
// existed, the language was unambiguous, and the resolver simply had no idea the
// command was there. The defect is CAPABILITY DISCOVERABILITY.
//
// The cause is two sources of truth. The editor's capabilities live in the
// command handlers; the chat's idea of the editor's capabilities lived in a
// hand-maintained list of thirteen intents. Every new capability required
// someone to remember to teach the chat a fourteenth. Nobody did, and nobody
// could have been told by CI, because nothing compared the two lists.
//
// This registry is that comparison made mechanical. A capability declares what
// the chat can do, WHICH bus command does it, and WHICH element kinds it really
// applies to. `tools/ga-gate/check-chat-capability-coverage.ts` then fails CI
// when a registered bus command has no declaration — capability or explicit,
// reasoned deferral — so the c1902a5a release could not have merged.
//
// ── THE PRECEDENT COPIED ────────────────────────────────────────────────────
//
// `apps/editor/src/ui/property-panel/ElementTypeAuthoringRegistry.ts`: per-family
// declarations, an explicit UNAVAILABLE list WITH STATED REASONS, and the UI
// driven from the declaration instead of hard-coded branches. Same shape here.
// `CHAT_UNAVAILABLE` is the honest half: a command listed there says out loud
// why the chat will not drive it, so the next person extends the right thing.
//
// ── ⚠ A CAPABILITY TABLE THAT LIES IS WORSE THAN NONE ───────────────────────
//
// This repository already has one. `packages/input-host/src/operations/
// ElementCapabilities.ts` advertises Mirror / Offset / Scale on slab, floor,
// roof, door, window, column and furniture. Those commands are WALL-ONLY and
// refuse at `canExecute`. The table is a second source of truth that drifted
// from the first, which is precisely the disease this registry is the cure for.
//
// So `targets` here is NOT a wish. Two independent proofs are required, and the
// gate enforces both:
//
//   1. EXECUTABLE (chat side). Every capability carries a `probe` SemanticIntent.
//      The gate and `chat-capability-registry.test.ts` run
//      `applySemanticIntent(probe, ctxSelecting(kind))` for EVERY kind in
//      `PROBE_ELEMENT_KINDS` and assert: refusal ⟺ kind ∉ targets. A declared
//      target the guard rejects FAILS. An undeclared kind the guard accepts
//      FAILS too — silent over-reach is the same lie in the other direction.
//
//   2. SOURCE-ANCHORED (command side). `commandProof` names the file that
//      decides which element kinds the implementing command actually accepts,
//      and the literals that must appear in it. The gate reads that file. If
//      `set-height` claims `ceiling` but `UpdateElementParameterCommand`'s store
//      switch has no `ceiling` case, the claim is unprovable and the gate fails.
//
// Proof 2 is how the honest target list below was DERIVED rather than guessed.
// `set-height` on a non-wall dispatches `element.updateParameters` →
// `UpdateElementParameterCommand.resolveStore()`, whose switch handles wall,
// slab, column, beam, stair, curtain-wall, roof, furniture, handrail, window and
// door — and returns `null` for everything else. Before this registry the chat
// accepted "set height to 3m" on a ROOM, a CEILING or a FLOOR and dispatched a
// command that resolved no store and changed nothing. That is the ElementCapabilities
// defect reproduced inside the chat, and it is fixed here by narrowing the claim
// to what the command can prove, not by widening the command.
//
// ── WHY THE DECLARATIONS LIVE HERE AND NOT IN THE HANDLER FILE ──────────────
//
// The stated goal is metadata colocated with command registration. The literal
// version — a `chatCapability` field on each `CommandHandler` in `plugins/**` —
// cannot work at RUNTIME: the resolver is a pure L2 module that must answer
// before any plugin is loaded, and a `plugins → ai-host` runtime import would
// add an SDK-facade bypass (baseline 172, shrink-only). So the coupling is made
// STATIC instead: the declaration lives here and CI proves it against the real
// registration lists in `plugins/*/src/handlers/*.ts` and
// `apps/editor/src/engine/initBusHandlers.ts`. The guarantee "a feature cannot
// ship without its chat metadata" is delivered by the gate, not by an import.
//
// P8: the exported functions carry the bounded `pryzm.ai.chat.capability` span.

import { trace, type Tracer } from '@opentelemetry/api';
import type { SemanticIntent } from '../intents/ZeroTokenResolver.js';

const TRACER_NAME = '@pryzm/ai-host';
let cachedTracer: Tracer | null = null;
function tracer(): Tracer {
  cachedTracer ??= trace.getTracer(TRACER_NAME, '0.1.0');
  return cachedTracer;
}

// ─── Types ───────────────────────────────────────────────────────────────────

/** Where a parameter's legal values come from — the VALUE SOURCE. A parameter
 *  whose values come from a project catalogue must name it, so a refusal can
 *  list the real options instead of inventing syntax. */
export type CapabilityValueSource =
  /** A length parsed under ADR-0313 §Units (mm/cm/m; bare > 20 is mm). */
  | 'measurement'
  /** An angle in degrees ("30°", "30 degrees"); converted to the command's
   *  radians inside applySemanticIntent — one conversion site. */
  | 'angle'
  /** The project's wall system types (`wallSystemTypeStore`), resolved by
   *  `resolveWallSystemTypeRef` — exact id → exact name → case-insensitive. */
  | 'wall-system-types'
  /** The project's level list, resolved by `findLevel`. */
  | 'project-levels'
  /** A colour name or '#hex', resolved by the ONE table in
   *  `intents/colorRef.ts` (ADR-0314 §Value sources). */
  | 'color'
  /** ADR-0315 U2.5 — a room reference (name / occupancy), resolved by the
   *  RoomStore predicates (findByName / findByOccupancy) via the injected
   *  scope resolver. First consumers land with U3. */
  | 'project-rooms'
  /** ADR-0315 U2.5 — a compass orientation (N/E/S/W), resolved by the
   *  θ-threaded FacadeOrientationService. */
  | 'orientation'
  /** ADR-0315 U2.5 — a level range ("levels 2–4"), resolved by findLevel per
   *  bound against the injected level list. */
  | 'level-range'
  /** Free user text (a room name). */
  | 'user-text'
  /** A pair of plan coordinates. */
  | 'coordinates';

export interface ChatCapabilityParameter {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
  readonly valueSource: CapabilityValueSource;
  readonly example: string;
}

/** What the capability acts ON (its DEFAULT scope). */
export type CapabilityScope =
  /** The current selection. Empty selection ⇒ an honest refusal, never a no-op. */
  | 'selection'
  /** Every matching element in the project, across all levels. */
  | 'all'
  /** Neither — the whole view/document (undo, zoom-fit, add-level). */
  | 'global';

/**
 * ADR-0315 U2.5 — the scope modes a capability CAN operate under, beyond its
 * default. This is the declared half of the U3 ScopeResolver contract: a
 * capability listing 'level' promises the resolver may hand it a
 * level-resolved id set ("all doors on Level 2"); one listing 'room' accepts
 * room-membership sets ("the windows in the living room"); 'orientation'
 * accepts façade-orientation sets ("south-facing exterior walls"). The gate
 * validates the list (known modes only, must include the default scope) so a
 * spatial claim is a declaration, never an accident. No capability declares
 * the spatial modes until the resolver that honours them ships (U3) — a
 * declared-but-unresolvable scope would be the ElementCapabilities lie again.
 */
export type CapabilityScopeMode = CapabilityScope | 'level' | 'room' | 'orientation';

/**
 * SOURCE-ANCHORED proof that the implementing command really accepts the
 * declared targets. `file` is the file that DECIDES (a store switch, a type
 * guard, a wallIds-only payload), and `mustMention` are literals the gate
 * requires to be present in it. See the header, proof 2.
 */
export interface CapabilityCommandProof {
  readonly file: string;
  readonly mustMention: readonly string[];
  /** One sentence: what in that file constitutes the proof. */
  readonly note: string;
}

export interface ChatCapability {
  /** Stable id — identical to the `SemanticIntent.intent` it is reached by, so
   *  the resolver and the registry cannot drift apart by construction. */
  readonly id: string;
  /** Human sentence used verbatim in generated refusals ("change wall height"). */
  readonly description: string;
  /** Verbs that reach this capability. Documentation + refusal copy; the
   *  matchers stay in the resolver. */
  readonly verbs: readonly string[];
  /** Nouns/properties the user might say for it ("tall", "high", "storey"). */
  readonly aliases: readonly string[];
  /**
   * The PROPERTY noun this capability sets, used to build the "here is what I
   * CAN do" half of a generated refusal ("I can change wall height, thickness
   * and type"). Present only on capabilities that set a named property —
   * delete/zoom are actions, not properties, and read differently in that
   * sentence, so they deliberately omit it.
   */
  readonly refusalLabel?: string;
  /** Element kinds this capability really applies to — PROVEN, see the header.
   *  `'global'` means it is not element-scoped at all. */
  readonly targets: readonly string[] | 'global';
  readonly parameters: readonly ChatCapabilityParameter[];
  readonly scope: CapabilityScope;
  /** ADR-0315 U2.5 — additional scope modes the capability supports (must
   *  include `scope`). Absent = the default scope only. Spatial modes may only
   *  be declared once the U3 ScopeResolver can honour them. */
  readonly scopeModes?: readonly CapabilityScopeMode[];
  readonly destructive: boolean;
  /**
   * The bus command that implements it. `null` for the three LOCAL actions
   * (undo / redo / active-level switch) that deliberately are not bus verbs
   * today — ADR-0313 records why, and `localAction` says which.
   */
  readonly busCommand: string | null;
  /** Additional bus commands the same capability dispatches on other targets
   *  (set-height uses `wall.updateDimensions` for walls and the generic
   *  parameter command for everything else). Counted by the coverage gate too. */
  readonly alsoDispatches?: readonly string[];
  readonly localAction?: 'undo' | 'redo' | 'setActiveLevel';
  /** Minimal well-formed intent the gate/specs feed to `applySemanticIntent`
   *  to VERIFY `targets` against the live guard (proof 1). */
  readonly probe: SemanticIntent;
  /** Proof 2 — omitted only for capabilities whose targets are `'global'`.
   *  A capability that routes to SEVERAL commands (set-thickness → wall /
   *  slab / roof) proves each route with its own entry. */
  readonly commandProof?: CapabilityCommandProof | readonly CapabilityCommandProof[];
  /** Phrasings that must resolve to this capability. The acceptance suite is
   *  generated from these, and the gate fails a capability that declares none. */
  readonly examples: readonly string[];
}

// ─── The element-kind universe used for target probing ───────────────────────
//
// Every kind the selection can report to the resolver. The probe asserts a
// capability's behaviour on ALL of them, so "undeclared but silently accepted"
// is as much a failure as "declared but refused".

export const PROBE_ELEMENT_KINDS: readonly string[] = [
  'wall', 'door', 'window', 'room', 'slab', 'roof', 'stair', 'column', 'beam',
  'ceiling', 'floor', 'furniture', 'curtain-wall', 'handrail', 'lighting',
  'plumbing',
];

/**
 * The element kinds `element.updateParameters` can actually route to a store —
 * read off `UpdateElementParameterCommand.resolveStore()`'s switch, whose
 * `default:` arm returns `null` (a silent no-op at the store layer). This is the
 * honest ceiling on every generic-parameter capability, and the reason
 * `set-height` does NOT claim room / ceiling / floor / lighting / plumbing.
 */
export const GENERIC_PARAMETER_TARGETS: readonly string[] = [
  'wall', 'slab', 'column', 'beam', 'stair', 'curtain-wall', 'roof',
  'furniture', 'handrail', 'window', 'door',
];

const UPDATE_ELEMENT_PARAMETER_FILE =
  'packages/command-registry/src/generic/UpdateElementParameterCommand.ts';

// ─── The capabilities ────────────────────────────────────────────────────────

const CAPABILITIES: readonly ChatCapability[] = [
  {
    id: 'undo',
    description: 'undo the last change',
    verbs: ['undo', 'revert', 'go back'],
    aliases: ['undo'],
    targets: 'global',
    parameters: [],
    scope: 'global',
    destructive: false,
    busCommand: null,
    localAction: 'undo',
    probe: { intent: 'undo' },
    examples: ['undo', 'undo that', 'actually, undo that'],
  },
  {
    id: 'redo',
    description: 'redo the change you just undid',
    verbs: ['redo'],
    aliases: ['redo'],
    targets: 'global',
    parameters: [],
    scope: 'global',
    destructive: false,
    busCommand: null,
    localAction: 'redo',
    probe: { intent: 'redo' },
    examples: ['redo', 'redo that', 'do that again'],
  },
  {
    id: 'zoom-fit',
    description: 'zoom the view to fit the whole model',
    verbs: ['zoom', 'fit', 'frame'],
    aliases: ['extents', 'everything'],
    targets: 'global',
    parameters: [],
    scope: 'global',
    destructive: false,
    busCommand: 'zoom-fit',
    probe: { intent: 'zoom-fit' },
    examples: ['zoom to fit', 'fit the model', 'frame everything'],
  },
  {
    id: 'zoom-selected',
    description: 'zoom the view to what you have selected',
    verbs: ['zoom', 'frame'],
    aliases: ['selection'],
    // Zooming is view-only: it reads the selection's bounds and touches no
    // element data, so every kind is a legitimate target.
    targets: PROBE_ELEMENT_KINDS,
    parameters: [],
    scope: 'selection',
    destructive: false,
    busCommand: 'zoom-selected',
    probe: { intent: 'zoom-selected' },
    commandProof: {
      file: 'apps/editor/src/engine/engineLauncher.ts',
      mustMention: ['zoom-selected'],
      note: 'The zoom-selected handler frames the selection bounds; it reads no per-kind store, so it is kind-agnostic by construction.',
    },
    examples: ['zoom to selection', 'frame this', 'zoom in on the selected wall'],
  },
  {
    id: 'delete-selected',
    description: 'delete what you have selected',
    verbs: ['delete', 'remove', 'erase', 'get rid of'],
    aliases: ['trash', 'discard'],
    targets: PROBE_ELEMENT_KINDS,
    parameters: [],
    scope: 'selection',
    destructive: true,
    busCommand: 'element.delete',
    probe: { intent: 'delete-selected' },
    commandProof: {
      file: 'plugins/view/src/handlers/DeleteElement.ts',
      mustMention: ['element.delete'],
      note: 'DeleteElement is the generic per-kind delete route dispatched by the selection manager for every element type.',
    },
    examples: ['delete selected', 'get rid of the doors I selected', 'remove this wall'],
  },
  {
    id: 'set-height',
    description: 'change the height',
    verbs: ['set', 'change', 'make'],
    aliases: ['height', 'tall', 'high', 'taller'],
    refusalLabel: 'height',
    // PROVEN, not wished — see GENERIC_PARAMETER_TARGETS and the header.
    // §FEAT-CHAT-SYMMETRY (2026-08-10): ceiling joined via its OWN command
    // (`ceiling.setHeight`, ceilingId-keyed) — the generic parameter command
    // still cannot route it, so the extra route carries its own proof below.
    targets: [...GENERIC_PARAMETER_TARGETS, 'ceiling'],
    parameters: [
      {
        name: 'height',
        description: 'the new height',
        required: true,
        valueSource: 'measurement',
        example: '3m',
      },
    ],
    scope: 'selection',
    destructive: false,
    busCommand: 'element.updateParameters',
    // §FIX-CHAT-DEAD-ROUTES (ADR-0315 audit): ceiling.setHeight was a plugin
    // DTO-store handler nothing in production reads; the live route is the
    // legacy ceiling.update bridge → UpdateCeilingCommand → ceilingStore.
    alsoDispatches: ['wall.updateDimensions', 'ceiling.update'],
    probe: { intent: 'set-height', value: 3 },
    commandProof: [
      {
        file: UPDATE_ELEMENT_PARAMETER_FILE,
        mustMention: GENERIC_PARAMETER_TARGETS,
        note: "resolveStore()'s switch names every kind that resolves to a store; its default arm returns null, so any kind absent from the switch is a silent no-op and must not be claimed.",
      },
      {
        file: 'packages/command-registry/src/ceilings/UpdateCeilingCommand.ts',
        mustMention: ['ceilingId', 'height'],
        note: 'The LIVE ceiling route: UpdateCeilingCommand is keyed by ceilingId and its soffit math reads baseOffset + height − thickness — the height field really drives geometry.',
      },
    ],
    examples: [
      'set height to 3m',
      'make this 3m tall',
      'can you make this wall about three meters tall',
      'set height to 2700',
      'set the ceiling height to 2.7m',
    ],
  },
  {
    id: 'set-thickness',
    // §FEAT-CHAT-SYMMETRY (2026-08-10) — the founding incident's twin family.
    // slab.setThickness and roof.setThickness were registered and unreachable
    // while walls worked; each route is id-keyed and separately proven.
    description: 'change the thickness',
    verbs: ['set', 'change', 'make'],
    aliases: ['thickness', 'thick', 'thicker'],
    refusalLabel: 'thickness',
    targets: ['wall', 'slab', 'roof'],
    parameters: [
      {
        name: 'thickness',
        description: 'the new thickness',
        required: true,
        valueSource: 'measurement',
        example: '200mm',
      },
    ],
    scope: 'selection',
    destructive: false,
    busCommand: 'wall.updateDimensions',
    // §FIX-CHAT-DEAD-ROUTES (ADR-0315 audit): slab.setThickness /
    // roof.setThickness were plugin DTO-store handlers (detached — the
    // §FIX-MATERIAL-DEAD-DISPATCH disease, re-found by the liveness audit).
    // Live routes are the legacy bridges the property surfaces use.
    alsoDispatches: ['slab.updateDimensions', 'roof.update'],
    probe: { intent: 'set-thickness', value: 0.2 },
    commandProof: [
      {
        // §FIX-DIMS-REACH-RECORD (L-815): the verb is now owned by the
        // initBusHandlers bridge running this LIVE legacy command against the
        // geometry wallStore (the plugin handler wrote a detached store and
        // was retired from registration).
        file: 'packages/command-registry/src/walls/UpdateWallDimensionsCommand.ts',
        mustMention: ['wallId'],
        note: 'The payload is keyed by wallId — the command cannot address any other element kind; it writes the geometry wallStore the builders read.',
      },
      {
        file: 'packages/command-registry/src/slabs/UpdateSlabDimensionsCommand.ts',
        mustMention: ['slabId', 'thickness'],
        note: 'The LIVE slab route: keyed by slabId, writes the geometry slabStore the fragment builders read.',
      },
      {
        file: 'packages/command-registry/src/roofs/UpdateRoofCommand.ts',
        mustMention: ['thickness'],
        note: 'The LIVE roof route: UpdateRoofCommand (id-keyed) validates and applies thickness on the geometry roof store.',
      },
    ],
    examples: [
      'set thickness to 200mm',
      'make this wall 300mm thick',
      'change the thickness to 0.2m',
      'set the slab thickness to 250mm',
      'make this roof 300mm thick',
    ],
  },
  {
    id: 'set-width',
    // §FEAT-CHAT-SYMMETRY (2026-08-10) — replaces `set-door-width`, whose id
    // encoded the accident that doors got wired first. window.setSize and
    // stair.setWidth were registered and unreachable.
    description: 'change the width',
    verbs: ['set', 'change', 'make'],
    aliases: ['width', 'wide', 'wider'],
    refusalLabel: 'width',
    targets: ['door', 'window', 'stair'],
    parameters: [
      {
        name: 'width',
        description: 'the new width',
        required: true,
        valueSource: 'measurement',
        example: '900mm',
      },
    ],
    scope: 'selection',
    destructive: false,
    // §FIX-CHAT-DEAD-ROUTES (ADR-0315 audit): door.setWidth / window.setSize /
    // stair.setWidth were plugin DTO-store handlers (detached). Live routes:
    // hosted openings via the generic parameter command (→ wallStore + host
    // rebuild, production-proven by §FIX-CHAT-COMPOUND-DIMENSIONS), stairs via
    // stair.updateParameters (STAIR_CONSTRAINTS-validated).
    busCommand: 'element.updateParameters',
    alsoDispatches: ['stair.updateParameters'],
    probe: { intent: 'set-width', value: 0.9 },
    commandProof: [
      {
        file: UPDATE_ELEMENT_PARAMETER_FILE,
        mustMention: ['window', 'door'],
        note: "resolveStore() routes window and door to the wallStore (openings are hosted); parameters.width is applied before the single host rebuild.",
      },
      {
        file: 'packages/command-registry/src/stair/UpdateStairParametersCommand.ts',
        mustMention: ['stairId', 'width'],
        note: 'The LIVE stair route: keyed by stairId, validates width against STAIR_CONSTRAINTS and writes the geometry stair store.',
      },
    ],
    examples: [
      'set door width to 900mm',
      'make the door 1m wide',
      'change width to 850mm',
      'set the window width to 1.2m',
      'set the stair width to 1m',
    ],
  },
  {
    id: 'set-roof-pitch',
    // §FEAT-CHAT-SYMMETRY (2026-08-10) — roof.setPitch was registered and
    // unreachable. Users speak degrees; the command takes radians; the
    // conversion has exactly one site (applySemanticIntent).
    description: 'change the roof pitch',
    verbs: ['set', 'change', 'make'],
    aliases: ['pitch', 'slope', 'steeper'],
    refusalLabel: 'pitch',
    targets: ['roof'],
    parameters: [
      {
        name: 'pitch',
        description: 'the new pitch in degrees (0–89)',
        required: true,
        valueSource: 'angle',
        example: '30 degrees',
      },
    ],
    scope: 'selection',
    destructive: false,
    // §FIX-CHAT-DEAD-ROUTES (ADR-0315 audit): roof.setPitch wrote the detached
    // plugin DTO store. The live route is roof.update → UpdateRoofCommand;
    // its `slope` is a gradient (RoofGeometryBuilder: height = slope×distance),
    // degrees → tan() in applySemanticIntent — still one conversion site.
    busCommand: 'roof.update',
    probe: { intent: 'set-roof-pitch', degrees: 30 },
    commandProof: {
      file: 'packages/command-registry/src/roofs/UpdateRoofCommand.ts',
      mustMention: ['slope'],
      note: 'The LIVE roof route: UpdateRoofCommand (id-keyed) validates slope > 0 and applies it on the geometry roof store the builder reads.',
    },
    examples: ['set the roof pitch to 30 degrees', 'change pitch to 45', 'set pitch to 22.5 degrees'],
  },
  {
    id: 'set-sill-height',
    description: 'change the sill height',
    verbs: ['set', 'change', 'make'],
    aliases: ['sill'],
    refusalLabel: 'sill height',
    targets: ['window'],
    parameters: [
      {
        name: 'sillHeight',
        description: 'the new sill height above the floor',
        required: true,
        valueSource: 'measurement',
        example: '1m',
      },
    ],
    scope: 'selection',
    destructive: false,
    // §FIX-CHAT-DEAD-ROUTES (ADR-0315 audit): window.setSillHeight wrote the
    // detached plugin DTO store. Live route: the generic parameter command's
    // parameters.sillHeight (→ wallStore + host rebuild), production-proven by
    // the §FIX-CHAT-COMPOUND-DIMENSIONS founder repro.
    busCommand: 'element.updateParameters',
    probe: { intent: 'set-sill-height', value: 1 },
    commandProof: {
      file: UPDATE_ELEMENT_PARAMETER_FILE,
      mustMention: ['window', 'updateWindow'],
      note: 'resolveStore() routes window to the wallStore and applyUpdate passes the WHOLE parameters object to wallStore.updateWindow — sillHeight rides that pass-through into the single host rebuild (production-proven by the compound-dimensions repro).',
    },
    examples: ['set sill height to 1m', 'raise the sill to 900mm'],
  },
  {
    id: 'set-riser-height',
    // ADR-0315 P1 — shipped on the LIVE stair.updateParameters carrier. The
    // dead per-field verb (stair.setRiserHeight, plugin DTO store) is pinned
    // out by the DEAD_VERBS registry test.
    description: 'change the stair riser height',
    verbs: ['set', 'change', 'make'],
    aliases: ['riser', 'riser height', 'risers'],
    refusalLabel: 'riser height',
    targets: ['stair'],
    parameters: [
      {
        name: 'riserHeight',
        description: 'the new riser height',
        required: true,
        valueSource: 'measurement',
        example: '180mm',
      },
    ],
    scope: 'selection',
    destructive: false,
    busCommand: 'stair.updateParameters',
    probe: { intent: 'set-riser-height', value: 0.18 },
    commandProof: {
      file: 'packages/command-registry/src/stair/UpdateStairParametersCommand.ts',
      mustMention: ['stairId', 'riserHeight'],
      note: 'The LIVE stair route: keyed by stairId; riserHeight is validated against STAIR_CONSTRAINTS (min/max and level-height consistency) and written to the geometry stair store.',
    },
    examples: ['set the riser height to 180mm', 'change riser height to 0.175m'],
  },
  {
    id: 'set-tread-depth',
    // ADR-0315 P1 — the sibling field on the same live carrier. Tread COUNT is
    // deliberately absent: UpdateStairParametersCommand has no numRisers field,
    // so that ask has no live route (G-class editor gap, not a capability).
    description: 'change the stair tread depth',
    verbs: ['set', 'change', 'make'],
    aliases: ['tread', 'tread depth', 'going'],
    refusalLabel: 'tread depth',
    targets: ['stair'],
    parameters: [
      {
        name: 'treadDepth',
        description: 'the new tread depth (going)',
        required: true,
        valueSource: 'measurement',
        example: '250mm',
      },
    ],
    scope: 'selection',
    destructive: false,
    busCommand: 'stair.updateParameters',
    probe: { intent: 'set-tread-depth', value: 0.25 },
    commandProof: {
      file: 'packages/command-registry/src/stair/UpdateStairParametersCommand.ts',
      mustMention: ['stairId', 'treadDepth'],
      note: 'The LIVE stair route: keyed by stairId; treadDepth is validated against STAIR_CONSTRAINTS.MIN_TREAD_DEPTH and written to the geometry stair store.',
    },
    examples: ['set the tread depth to 250mm', 'change the tread depth to 0.28m'],
  },
  {
    id: 'set-room-height-offset',
    // ADR-0315 P1 — LIVE via the room.setHeightOffset commandManager bridge
    // (the handler deliberately mutates no plugin store); range [-10, 10] m is
    // the handler's own gate, mirrored in the resolver for unit-honest copy.
    description: 'change the room height offset',
    verbs: ['set', 'change'],
    aliases: ['height offset'],
    refusalLabel: 'height offset',
    targets: ['room'],
    parameters: [
      {
        name: 'heightOffset',
        description: 'the offset from the level height (may be negative)',
        required: true,
        valueSource: 'measurement',
        example: '0.5m',
      },
    ],
    scope: 'selection',
    destructive: false,
    busCommand: 'room.setHeightOffset',
    probe: { intent: 'set-room-height-offset', value: 0.5 },
    commandProof: {
      file: 'plugins/rooms/src/handlers/SetRoomHeightOffset.ts',
      mustMention: ['roomId', 'heightOffset'],
      note: 'The handler is keyed by roomId and BRIDGES to the legacy commandManager (it mutates no plugin store — the header says so), with heightOffset range-guarded to [-10, 10] m at canExecute.',
    },
    examples: ['set the room height offset to 0.5m', 'change the height offset to -0.2m'],
  },
  {
    id: 'set-wall-type',
    // §FEAT-CHAT-WALL-TYPE (2026-08-10) — the capability whose ABSENCE is the
    // reason this registry exists. `wall.updateSystemTypeBatch` shipped in
    // c1902a5a and the chat could not reach it.
    description: 'change the wall type',
    verbs: ['set', 'change', 'make', 'switch', 'convert', 'retype'],
    aliases: ['type', 'system type', 'wall type', 'partition', 'assembly'],
    refusalLabel: 'type',
    targets: ['wall'],
    parameters: [
      {
        name: 'systemType',
        description: 'the wall type to apply, by id or name',
        required: true,
        // The value source is the PROJECT CATALOGUE, and it is resolved by the
        // command's own `resolveWallSystemTypeRef` (exact id → exact name →
        // case-insensitive name) — injected into the resolver as a function so
        // there is exactly one implementation of the lookup.
        valueSource: 'wall-system-types',
        example: 'Interior – Partition 100mm',
      },
    ],
    // 'all' is the DEFAULT scope ("make all walls…"); the resolver narrows to
    // the selection when the user says "these"/"selected".
    scope: 'all',
    destructive: false,
    busCommand: 'wall.updateSystemTypeBatch',
    // The probe deliberately uses the SELECTION scope: the 'all' scope never
    // reads the selection, so it could not exercise the target guard at all and
    // proof 1 would silently prove nothing.
    probe: { intent: 'set-wall-type', typeRef: 'Interior – Partition 100mm', scope: 'selection' },
    commandProof: {
      file: 'packages/command-registry/src/walls/UpdateWallsSystemTypeBatchCommand.ts',
      mustMention: ['wallStore', 'resolveWallSystemTypeRef'],
      note: "_resolveWallIds reads ctx.stores.wallStore and nothing else, so the command's reachable set is walls only; the type reference is resolved by resolveWallSystemTypeRef in the same file.",
    },
    examples: [
      'make all walls interior partition',
      'change all walls to Interior – Partition 100mm',
      'set the selected walls to exterior brick',
      'convert every wall to interior partition',
    ],
  },
  {
    id: 'set-wall-color',
    // §FEAT-WALL-COLOR-BATCH (ADR-0314) — the founder's declared next ask
    // ("make all walls white") and the GAP-C case study: the batch primitive
    // had to be BUILT (`wall.updateColorBatch`), because the shapely
    // `wall.bulkSetVisuals` writes a detached DTO store nothing renders
    // (§FIX-MATERIAL-DEAD-DISPATCH) and `wall.updateColor` is single-wall.
    description: 'change the wall colour',
    verbs: ['make', 'paint', 'set', 'change', 'turn'],
    // NOTE: 'colour'/'color' are deliberately NOT aliases here — the word
    // stays an UNCONNECTED_TOPICS label for the element kinds whose colour
    // is still not chat-drivable; the topic excludes 'wall' instead.
    aliases: ['wall colour', 'wall color', 'repaint'],
    refusalLabel: 'colour',
    targets: ['wall'],
    parameters: [
      {
        name: 'color',
        description: 'the colour to apply, by name or #hex',
        required: true,
        valueSource: 'color',
        example: 'white',
      },
    ],
    // 'all' is the DEFAULT scope ("make all walls white"); the resolver
    // narrows to the selection on "these"/"selected" — same discipline as
    // set-wall-type, and the scope word is REQUIRED, never inferred.
    scope: 'all',
    // ADR-0315 U3 — the first spatial-scope declarations: "make all walls on
    // level 2 white" / "paint all walls in the kitchen white" resolve through
    // the injected ScopeResolver.
    scopeModes: ['all', 'selection', 'level', 'room'],
    destructive: false,
    busCommand: 'wall.updateColorBatch',
    // Selection-scope probe for the same reason as set-wall-type: the 'all'
    // scope never reads the selection, so it could not exercise the target
    // guard and proof 1 would prove nothing.
    probe: { intent: 'set-wall-color', colorRef: 'white', scope: 'selection' },
    commandProof: {
      file: 'packages/command-registry/src/walls/UpdateWallsColorBatchCommand.ts',
      mustMention: ['wallStore', 'UpdateWallColorCommand'],
      note: "_resolveWallIds reads ctx.stores.wallStore and nothing else, so the command's reachable set is walls only; per wall it reuses the proven single-wall UpdateWallColorCommand (geometry store → fragment rebuild), never the detached plugin DTO store.",
    },
    examples: [
      'make all walls white',
      'paint the selected walls light grey',
      'make every wall #f4f1e8',
      'turn all walls beige',
    ],
  },
  {
    id: 'go-to-level',
    description: 'switch to another level',
    verbs: ['go to', 'open', 'show', 'switch to'],
    aliases: ['level', 'floor', 'storey', 'upstairs', 'downstairs'],
    targets: 'global',
    parameters: [
      {
        name: 'level',
        description: 'which level to switch to',
        required: true,
        valueSource: 'project-levels',
        example: 'Level 1',
      },
    ],
    scope: 'global',
    destructive: false,
    busCommand: null,
    localAction: 'setActiveLevel',
    probe: { intent: 'go-to-level', levelQuery: '1' },
    examples: ['go to level 2', 'take me to the second floor', 'go upstairs'],
  },
  {
    id: 'add-level',
    description: 'add a new level',
    verbs: ['add', 'create'],
    aliases: ['level', 'storey', 'floor'],
    targets: 'global',
    parameters: [
      {
        name: 'elevation',
        description: 'the elevation of the new level',
        required: false,
        valueSource: 'measurement',
        example: '6m',
      },
    ],
    scope: 'global',
    destructive: false,
    busCommand: 'level.add',
    probe: { intent: 'add-level' },
    examples: ['add a level', 'create a new level at 6m'],
  },
  {
    id: 'duplicate-level',
    // ADR-0315 U5a — the first Dimension-B capability: no working UI exists
    // (the batch-catalogue leaf is disabled, "needs a target-level picker"),
    // but the SHIPPED DuplicateFloorPlanCommand is production-quality
    // (deterministic dup-ids, full undo, validated). Conversation IS the
    // target-level picker. The report is honest about what is NOT cloned.
    description: 'duplicate a level\'s floor plan onto other levels',
    verbs: ['duplicate', 'copy', 'replicate', 'clone'],
    aliases: ['floor plan', 'duplicate level', 'duplicate floor'],
    targets: 'global',
    parameters: [
      {
        name: 'sourceLevel',
        description: 'the level to copy from',
        required: true,
        valueSource: 'project-levels',
        example: 'Ground Floor',
      },
      {
        name: 'targetLevels',
        description: 'the level(s) to copy onto',
        required: true,
        valueSource: 'project-levels',
        example: 'Levels 2, 3 and 4',
      },
    ],
    scope: 'global',
    // Consequential blast radius (whole floors of new elements) — the
    // destructive flag routes it through the existing Confirm/Cancel card.
    destructive: true,
    busCommand: 'level.duplicate-floor-plan',
    probe: { intent: 'duplicate-level', sourceQuery: '0', targetQueries: ['1'] },
    examples: [
      'duplicate level 0 to level 1',
      'duplicate Level 0 to Levels 1 and 2',
      'copy level 0 onto level 2',
    ],
  },
  {
    id: 'create-wall',
    description: 'create a wall between two coordinates',
    verbs: ['create', 'draw', 'add', 'build'],
    aliases: ['wall'],
    targets: 'global',
    parameters: [
      {
        name: 'endpoints',
        description: 'the start and end of the wall in plan coordinates',
        required: true,
        valueSource: 'coordinates',
        example: 'from (0,0) to (5,0)',
      },
      {
        name: 'height',
        description: 'the wall height',
        required: false,
        valueSource: 'measurement',
        example: '3m',
      },
    ],
    scope: 'global',
    destructive: false,
    busCommand: 'wall.create',
    probe: { intent: 'create-wall', start: { x: 0, z: 0 }, end: { x: 5, z: 0 } },
    examples: ['create a wall from (0,0) to (5,0)', 'draw a wall from (0,0) to (5,0) height 3m'],
  },
  {
    id: 'rename-room',
    description: 'rename the room',
    verbs: ['rename', 'call'],
    aliases: ['name'],
    refusalLabel: 'name',
    targets: ['room'],
    parameters: [
      {
        name: 'name',
        description: 'the new room name',
        required: true,
        valueSource: 'user-text',
        example: 'Kitchen',
      },
    ],
    scope: 'selection',
    destructive: false,
    busCommand: 'room.rename',
    probe: { intent: 'rename-room', name: 'Kitchen' },
    commandProof: {
      file: 'plugins/rooms/src/handlers/RenameRoom.ts',
      mustMention: ['roomId'],
      note: 'The payload is keyed by roomId — the command cannot address any other element kind.',
    },
    examples: ['rename room to Kitchen', 'call this room the master bedroom'],
  },
  {
    id: 'set-room-number',
    // §FEAT-CHAT-SYMMETRY (2026-08-10) — the sibling of rename-room;
    // room.setNumber was registered and unreachable.
    description: 'set the room number',
    verbs: ['set', 'change'],
    aliases: ['number', 'room number'],
    refusalLabel: 'number',
    targets: ['room'],
    parameters: [
      {
        name: 'number',
        description: 'the new room number',
        required: true,
        valueSource: 'user-text',
        example: '101',
      },
    ],
    scope: 'selection',
    destructive: false,
    busCommand: 'room.setNumber',
    probe: { intent: 'set-room-number', number: '101' },
    commandProof: {
      file: 'plugins/rooms/src/handlers/SetRoomNumber.ts',
      mustMention: ['roomId'],
      note: 'The payload is keyed by roomId — the command cannot address any other element kind.',
    },
    examples: ['set the room number to 101', 'change the room number to 2.04'],
  },
];

// ─── The honest half: commands the chat deliberately does NOT drive ──────────
//
// Mirrors `AUTHORING_UNAVAILABLE`. A bus command listed here is a decision with
// a stated reason, not an oversight. The coverage gate treats a command as
// DECLARED if it is either implemented by a capability above or listed here — so
// shipping a new command still forces an explicit choice, and the choice is
// visible in review.
//
// Only commands whose absence a user could plausibly notice are listed; every
// OTHER registered verb is classified — with a class and a truthful reason — in
// `ChatCommandClassification.ts` next to this file, and the coverage gate fails
// any registered command that appears in neither place (baseline 0 since
// 2026-08-10; NO SILENT GAPS).

export const CHAT_UNAVAILABLE: ReadonlyMap<string, string> = new Map([
  // Geometry that needs a pointer, not a sentence. These are refusable with a
  // good answer ("use the tool"), which is why they are named rather than left
  // in the undeclared bulk.
  ['wall.move', 'Moving a wall from chat needs a target position I cannot infer — drag it, or use the Move tool.'],
  ['wall.transform', 'Rotating and mirroring from chat is not wired yet — use the Modify tools.'],
  ['wall.join', 'Joining walls needs two picked walls — use the Join tool.'],
  ['wall.cut', 'Cutting a wall needs a picked cut point — use the Cut tool.'],
  ['wall.createOpening', 'Openings are placed by pointing at a spot on the wall — use the Door or Window tool.'],
  ['wall.opening.create', 'Openings are placed by pointing at a spot on the wall — use the Door or Window tool.'],
  ['door.move', 'Moving a door along its wall needs a picked position — drag it.'],
  ['door.setOffset', 'Moving a door along its wall needs a picked position — drag it.'],
  ['window.move', 'Moving a window along its wall needs a picked position — drag it.'],
  ['window.setOffset', 'Moving a window along its wall needs a picked position — drag it.'],
  ['room.move', 'Rooms follow their bounding walls; move the walls instead.'],

  // §FEAT-CHAT-SYMMETRY (2026-08-10) — the move/rotate twins across the other
  // element families. Same reason as wall.move: chat has no pointer.
  ['slab.move', 'Moving a slab from chat needs a target position I cannot infer — drag it, or use the Move tool.'],
  ['roof.move', 'Moving a roof from chat needs a target position I cannot infer — drag it, or use the Move tool.'],
  ['column.move', 'Moving a column from chat needs a target position I cannot infer — drag it, or use the Move tool.'],
  ['beam.move', 'Moving a beam from chat needs a target position I cannot infer — drag it, or use the Move tool.'],
  ['furniture.move', 'Moving furniture from chat needs a target position I cannot infer — drag it, or use the Move tool.'],
  ['furniture.rotate', 'Rotating from chat is not wired yet — use the Modify tools.'],
  ['curtain-wall.move', 'Moving a curtain wall from chat needs a target position I cannot infer — drag it, or use the Move tool.'],
  ['stair.move', 'Moving a stair from chat needs a target position I cannot infer — drag it, or use the Move tool.'],
  ['stair.rotate', 'Rotating from chat is not wired yet — use the Modify tools.'],
  ['lighting.move', 'Moving a light from chat needs a target position I cannot infer — drag it, or use the Move tool.'],
  ['plumbing.move', 'Moving a plumbing run from chat needs a target position I cannot infer — drag it, or use the Move tool.'],
  ['plumbing.moveFixture', 'Moving a fixture from chat needs a target position I cannot infer — drag it, or use the Move tool.'],
  ['structural.move', 'Moving a structural member from chat needs a target position I cannot infer — drag it, or use the Move tool.'],

  // Hosted / drawn placement — same family as wall.createOpening.
  ['opening.create', 'Openings are placed by pointing at a spot on the wall — use the Door or Window tool.'],
  ['door.create', 'Doors are placed by pointing at a spot on a wall — use the Door tool.'],
  ['window.create', 'Windows are placed by pointing at a spot on a wall — use the Window tool.'],

  // View switching needs the project view list wired into the resolver context
  // (a `project-views` value source) — a real design step, tracked as class B in
  // ChatCommandClassification.ts.
  ['view.switch', 'Switching views from chat is not wired yet — use the view tabs.'],

  // Appearance. The founder's most likely next ask, so it is declared rather
  // than silently missing — `capabilityGapRefusal` names these topics in the
  // refusal it generates.
  ['ceiling.setMaterial', 'Materials are not connected to chat yet — set them in the Properties panel.'],
  ['floor.setMaterial', 'Materials are not connected to chat yet — set them in the Properties panel.'],
  ['furniture.setMaterial', 'Materials are not connected to chat yet — set them in the Properties panel.'],
  ['handrail.setMaterial', 'Materials are not connected to chat yet — set them in the Properties panel.'],
  ['curtain-wall.setMaterial', 'Materials are not connected to chat yet — set them in the Properties panel.'],
  ['lighting.setMaterial', 'Materials are not connected to chat yet — set them in the Properties panel.'],
  ['plumbing.setMaterial', 'Materials are not connected to chat yet — set them in the Properties panel.'],
  ['structural.setMaterial', 'Materials are not connected to chat yet — set them in the Properties panel.'],
  ['handrail.updateColor', 'Handrail colour is not connected to chat yet — set it in the Properties panel.'],
  // §FEAT-WALL-COLOR-BATCH (ADR-0314) — wall colour IS chat-drivable now, via
  // wall.updateColorBatch. These three stay deferred with the true reasons:
  ['wall.setColor', 'Writes a detached plugin store nothing renders (§FIX-MATERIAL-DEAD-DISPATCH) — say "make all walls white"; chat drives wall.updateColorBatch instead.'],
  ['wall.updateColor', 'The single-wall inspector route — from chat, "make all walls white" / "paint the selected walls …" drives wall.updateColorBatch (one undo entry, honest batch report).'],
  ['wall.bulkSetVisuals', 'Writes a detached plugin store nothing renders (§FIX-MATERIAL-DEAD-DISPATCH) — chat bulk colour drives wall.updateColorBatch, which reaches the geometry store.'],
  ['slab.setMaterial', 'Materials are not connected to chat yet — set them in the Properties panel.'],
  ['roof.setMaterial', 'Materials are not connected to chat yet — set them in the Properties panel.'],
  ['room.setMaterial', 'Materials are not connected to chat yet — set them in the Properties panel.'],
  ['beam.setMaterial', 'Materials are not connected to chat yet — set them in the Properties panel.'],
  ['column.setMaterial', 'Materials are not connected to chat yet — set them in the Properties panel.'],
  ['stair.setMaterial', 'Materials are not connected to chat yet — set them in the Properties panel.'],
  ['door.setFrameColor', 'Door finishes are not connected to chat yet — set them in the Properties panel.'],
  ['window.setFrameColor', 'Window finishes are not connected to chat yet — set them in the Properties panel.'],

  // Selection is a pointer concern; the chat reads the selection, it does not
  // author it.
  ['selection.select', 'The chat acts on what you have selected; it does not change the selection.'],
  ['selection.deselect', 'The chat acts on what you have selected; it does not change the selection.'],
  ['selection.clear', 'The chat acts on what you have selected; it does not change the selection.'],
]);

// ─── Lookup surface ──────────────────────────────────────────────────────────

const BY_ID: ReadonlyMap<string, ChatCapability> =
  new Map(CAPABILITIES.map((c) => [c.id, c]));

/** Every declared capability — for the coverage gate, the specs, and refusals. */
export function allChatCapabilities(): readonly ChatCapability[] {
  return CAPABILITIES;
}

/** The capability reached by a `SemanticIntent.intent`, or null. */
export function resolveChatCapability(id: string): ChatCapability | null {
  return BY_ID.get(id) ?? null;
}

/** A capability's command proofs, normalized to a list (a capability that
 *  routes to several commands proves each route). */
export function commandProofsOf(cap: ChatCapability): readonly CapabilityCommandProof[] {
  if (cap.commandProof === undefined) return [];
  return Array.isArray(cap.commandProof) ? cap.commandProof : [cap.commandProof as CapabilityCommandProof];
}

/** Normalize a selection's element type to the registry's vocabulary. */
export function normalizeElementKind(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (t === 'curtainwall') return 'curtain-wall';
  if (t === 'stairs') return 'stair';
  if (t === 'walls') return 'wall';
  if (['bed', 'table', 'chair', 'sofa', 'wardrobe'].includes(t)) return 'furniture';
  return t;
}

/** Does this capability really apply to that element kind? The single answer
 *  used by the resolver's guards, the refusal generator AND the coverage gate —
 *  one function, so the claim and the behaviour cannot diverge. */
export function capabilityAppliesTo(cap: ChatCapability, elementKind: string): boolean {
  if (cap.targets === 'global') return false;
  return cap.targets.includes(normalizeElementKind(elementKind));
}

/**
 * Every element-scoped capability that applies to `elementKind`, in declaration
 * order. This is what "here is what I CAN do" is generated from — so the list a
 * refusal offers is, by construction, the list the resolver will actually honour.
 *
 * P8: `pryzm.ai.chat.capability` (1 bounded span name for this module).
 */
export function capabilitiesForElement(elementKind: string): readonly ChatCapability[] {
  return tracer().startActiveSpan('pryzm.ai.chat.capability', (span) => {
    try {
      const kind = normalizeElementKind(elementKind);
      const out = CAPABILITIES.filter((c) => capabilityAppliesTo(c, kind));
      span.setAttribute('pryzm.ai.chat.capability.kind', kind);
      span.setAttribute('pryzm.ai.chat.capability.count', out.length);
      return out;
    } finally {
      span.end();
    }
  });
}

/** Why the chat will not drive a bus command, when it deliberately will not.
 *  `undefined` means it is either exposed as a capability or simply undeclared. */
export function chatUnavailableReason(busCommand: string): string | undefined {
  return CHAT_UNAVAILABLE.get(busCommand);
}

/** Every bus command any capability dispatches — the gate's "covered" set. */
export function capabilityBusCommands(): readonly string[] {
  const out = new Set<string>();
  for (const c of CAPABILITIES) {
    if (c.busCommand !== null) out.add(c.busCommand);
    for (const extra of c.alsoDispatches ?? []) out.add(extra);
  }
  return [...out];
}
