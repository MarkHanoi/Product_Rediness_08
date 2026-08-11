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
// RAC U9.2 — the delete families' metadata is GENERATED from the same table
// that generates their execution spec. One-way dependency: this module imports
// the pure table; the table imports nothing from here.
import { DELETE_FAMILIES, deleteFamilyTargets } from '../intents/DeleteFamilies.js';

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
  /** The project's window system types (`windowSystemTypeStore`), resolved by
   *  `resolveWindowSystemTypeRef` — the same resolveCatalogueRef ladder. */
  | 'window-system-types'
  /** The project's door system types (`doorSystemTypeStore`), resolved by
   *  `resolveDoorSystemTypeRef` — the same resolveCatalogueRef ladder (RAC U4.3). */
  | 'door-system-types'
  /** RAC U7.2 — the project's slab assemblies (`slabSystemTypeStore`, four
   *  built-ins), resolved by `resolveSlabSystemTypeRef` on the same ladder. */
  | 'slab-system-types'
  /** RAC U7.2 — the project's ceiling assemblies (`ceilingSystemTypeStore`,
   *  ten built-ins), resolved by `resolveCeilingSystemTypeRef`. */
  | 'ceiling-system-types'
  /** Finish names ("plaster", "limewash"), resolved by the ONE table in
   *  packages/ai-host/src/intents/finishRef.ts (materialLibrary-transcribed). */
  | 'finish'
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
  /**
   * §PLAN (RAC U6) — a COMPOSITE capability dispatches no command of its own:
   * it composes other declared capabilities and dispatches THEIR commands. The
   * only member today is `execute-plan` (compound sentences).
   *
   * It is declared explicitly rather than inferred, because "busCommand null
   * and no localAction" otherwise means the c1902a5a defect ("this capability
   * does nothing") and the gate must keep failing that. A composite adds no
   * coverage of its own — every command it can reach is already covered by the
   * capability that owns it — so the ratchet is unaffected by construction.
   */
  readonly composite?: boolean;
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

// ─── RAC U9.2 — the DELETE FAMILIES, as generated metadata ───────────────────
//
// The U7.2 lesson applied to the destructive tranche: a family is ONE record in
// `DeleteFamilies.ts`, and BOTH its execution spec and this metadata are built
// from it. The dependency runs one way only (registry → DeleteFamilies →
// FilterScope, all pure) so there is no barrel cycle to trip over
// (§SCC-NO-BARREL-ACCESS-AT-MODULE-LOAD), and the `targets` claim is generated
// rather than restated — a kind removed from the table is a target removed, in
// the same edit.
//
// Every one of these is `destructive: true`. That is not decoration: the bridge
// draws a Confirm card for it, and the summary the card shows is required by
// the spec generator to carry a REAL resolved count ("This deletes 42 furniture
// items on Level 1"). See the DeleteFamilies header for why deletion can be
// confirmed honestly where ADR-0313's deferred bulk GENERATION could not.
const DELETE_FAMILY_CAPABILITIES: readonly ChatCapability[] = DELETE_FAMILIES.map((family) => ({
  id: family.intent,
  description: `delete ${family.nounPlural} in a scope`,
  verbs: ['delete', 'remove', 'clear', 'erase', 'get rid of'],
  aliases: [family.elementKind, family.nounPlural, ...family.nounAliases],
  targets: deleteFamilyTargets(family.intent),
  parameters: [],
  scope: 'all',
  // NOT 'selection': `delete-selected` owns the selection ask and always has.
  // A scoped delete claims a PLACE or the whole project — see the
  // DeleteFamilies header for why claiming both would be two capabilities for
  // one sentence.
  scopeModes: ['all', 'level', 'room'],
  destructive: true,
  busCommand: 'element.deleteBatch',
  // The probe carries the SELECTION scope, not 'all', and that is a statement
  // about what proof 3a is for: it asks "does the arm accept this element
  // kind and refuse every other one", and the selection scope is the only
  // form that answers per-KIND. An 'all' probe would refuse for every kind in
  // the harness (no resolveScope is injected there) and prove nothing. The
  // GRAMMAR still never produces a selection scope for these — delete-selected
  // owns that ask.
  probe: { intent: family.intent, scope: 'selection' } as SemanticIntent,
  commandProof: [
    {
      file: 'plugins/view/src/handlers/DeleteElementsBatch.ts',
      mustMention: ['element.deleteBatch', 'commandManager', 'affectedStores: [] as const'],
      note: 'The LIVE route: a legacy bridge (commandManager + empty affectedStores — undo lives on the legacy stack) forwarding to DeleteElementsBatchCommand, so N deletes are ONE undo entry instead of N.',
    },
    {
      file: 'packages/command-registry/src/generic/DeleteElementsBatchCommand.ts',
      mustMention: ['DeleteElementCommand', 'Deleted', 'skipped'],
      note: 'The batch COMPOSES the per-element DeleteElementCommand (rather than re-deriving its per-kind cascade and undo), undoes children in REVERSE order so a host comes back before anything it cascaded, and reports "Deleted N of M — K skipped: <reason>".',
    },
    {
      file: 'packages/command-registry/src/walls/DeleteElementCommand.ts',
      mustMention: [family.elementKind],
      note: family.branchNote,
    },
  ],
  examples: [...family.suggestions],
}));

// ─── The capabilities ────────────────────────────────────────────────────────

const CAPABILITIES: readonly ChatCapability[] = [
  ...DELETE_FAMILY_CAPABILITIES,
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
    // §PROP-BEAM-HEIGHT-LIE (RAC U7.1) — beam LEFT this target set. The
    // generic command routes a beam to its store, so proof 3b passed and the
    // claim looked sound; but `BeamData` (core-app-model/src/stores/
    // BeamTypes.ts) has `width` and `depth` and NO `height`, and
    // BeamFragmentBuilder builds every section from `beam.width` ×
    // `beam.depth`. "Make this beam 500mm tall" therefore wrote a field
    // nothing reads and reported success — the ElementCapabilities lie,
    // reproduced inside the chat by a proof that pinned STORE ROUTING and not
    // FIELD EXISTENCE. The honest answer is a refusal that offers the property
    // a beam really has, which `set-depth` now provides.
    targets: [...GENERIC_PARAMETER_TARGETS.filter((k) => k !== 'beam'), 'ceiling'],
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
    // RAC U7.1 — column, beam and furniture JOINED, as metadata only: the
    // resolver's per-kind routing already sends everything that is not a stair
    // through `element.updateParameters`, and all three carry a `width` field
    // their builders read (ColumnData.width — the rectangular/circular section
    // dimension; BeamData.width — the section width; FurnitureData.width).
    // This is the founder's "set the column width to 400mm", bought with zero
    // resolver lines.
    targets: ['door', 'window', 'stair', 'column', 'beam', 'furniture'],
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
        mustMention: ['window', 'door', 'column', 'beam', 'furniture'],
        note: "resolveStore() routes window and door to the wallStore (openings are hosted, width applied before the single host rebuild), and column / beam / furniture to their own geometry stores; each of those three has a `width` field its builder reads.",
      },
      {
        file: 'apps/editor/src/engine/initBuilders.ts',
        mustMention: ['beamStore.setBuilder', 'window.columnBuilder', 'bim-furniture-updated'],
        note: 'The REBUILD half for the three kinds added in RAC U7.1: the beam builder is subscribed to the store event, the column builder is the instance the command calls buildColumn on, and furniture rebuilds off bim-furniture-updated.',
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
  // ── RAC U7.1 — the PROPERTY VOCABULARY capabilities ───────────────────────
  //
  // Each of these is a `PropertyVocabulary.ts` table entry plus the metadata
  // below, and NOTHING else: no case arm in applySemanticIntent, no matcher in
  // the grammar. `targets` is restated here as a literal rather than imported
  // from the vocabulary on purpose — this module is the vocabulary's own
  // dependency (it provides `capabilityAppliesTo`), and importing back would
  // make CAPABILITIES depend on a table that may not be initialised yet
  // (§SCC-NO-BARREL-ACCESS-AT-MODULE-LOAD). The drift that shortcut would have
  // prevented is instead pinned by `chat-capability-registry.test.ts`, which
  // asserts targets === propertyTargets(id) for every property.
  {
    id: 'set-depth',
    // §PROP-DEPTH — the structural section depth. It exists because the audit
    // that built the vocabulary found `set-height` claiming BEAM while
    // BeamData has no height field at all: the chat wrote a field nothing
    // reads and said "Done". Beam left set-height in the same commit; depth is
    // the property a beam really has.
    description: 'change the section depth',
    verbs: ['set', 'change', 'make'],
    aliases: ['depth', 'deep', 'section depth'],
    refusalLabel: 'depth',
    targets: ['beam', 'column'],
    parameters: [
      {
        name: 'depth',
        description: 'the new section depth',
        required: true,
        valueSource: 'measurement',
        example: '500mm',
      },
    ],
    scope: 'selection',
    destructive: false,
    busCommand: 'element.updateParameters',
    probe: { intent: 'set-depth', value: 0.4 },
    commandProof: [
      {
        file: UPDATE_ELEMENT_PARAMETER_FILE,
        mustMention: ['beam', 'column'],
        note: "resolveStore() routes beam to context.stores.beamStore and column to context.stores.columnStore; applyUpdate passes the whole parameter set to store.update, so `depth` reaches the record the builders read.",
      },
      {
        file: 'apps/editor/src/engine/initBuilders.ts',
        mustMention: ['beamStore.setBuilder', 'window.columnBuilder'],
        note: 'The REBUILD half of the claim: beamStore.setBuilder(beamBuilder) subscribes the builder to the store event a depth write emits (updateBeam builds from beam.width × beam.depth), and window.columnBuilder is the instance the generic command calls buildColumn on.',
      },
    ],
    examples: [
      'set the depth to 500mm',
      'set the beam depth to 500mm',
      'change the column depth to 400mm',
      'make this 500mm deep',
    ],
  },
  {
    id: 'set-length',
    // §PROP-LENGTH — furniture's long-axis dimension. FurnitureStore.update is
    // a full REPLACE, which is why the generic command merges onto the
    // existing record first; without that merge a length edit wiped the
    // furnitureType and produced an empty mesh (the comment is in the command).
    description: 'change the length',
    verbs: ['set', 'change', 'make'],
    aliases: ['length', 'long'],
    refusalLabel: 'length',
    targets: ['furniture'],
    parameters: [
      {
        name: 'length',
        description: 'the new length',
        required: true,
        valueSource: 'measurement',
        example: '2m',
      },
    ],
    scope: 'selection',
    destructive: false,
    busCommand: 'element.updateParameters',
    probe: { intent: 'set-length', value: 2 },
    commandProof: [
      {
        file: UPDATE_ELEMENT_PARAMETER_FILE,
        mustMention: ['furniture', 'bim-furniture-updated'],
        note: 'resolveStore() routes furniture to the furnitureStore, applyUpdate MERGES the partial parameters onto the existing record (the store is a full-replace store), and the command emits bim-furniture-updated.',
      },
      {
        file: 'apps/editor/src/engine/initBuilders.ts',
        mustMention: ['bim-furniture-updated'],
        note: 'The REBUILD half: initBuilders listens for bim-furniture-updated and re-runs the furniture fragment builder for that id.',
      },
    ],
    examples: [
      'set the length to 2m',
      'change the length to 1.8m',
      'make this 2m long',
    ],
  },
  {
    id: 'set-base-offset',
    // §PROP-BASE-OFFSET — the RAC plan's own U7 test sentence ("set the base
    // offset to 150 mm"), and the widest property in the vocabulary. BEAM is
    // absent because BeamData has no baseOffset field — the beam property
    // panel offers one anyway, and mirroring that dead control into the chat
    // is exactly what this registry exists to stop.
    description: 'change the base offset',
    verbs: ['set', 'change'],
    aliases: ['base offset', 'base elevation'],
    refusalLabel: 'base offset',
    targets: ['wall', 'slab', 'column', 'roof', 'curtain-wall', 'furniture', 'handrail'],
    parameters: [
      {
        name: 'baseOffset',
        description: 'the vertical offset from the level datum (may be negative)',
        required: true,
        valueSource: 'measurement',
        example: '150mm',
      },
    ],
    scope: 'selection',
    destructive: false,
    busCommand: 'element.updateParameters',
    probe: { intent: 'set-base-offset', value: 0.15 },
    commandProof: [
      {
        file: UPDATE_ELEMENT_PARAMETER_FILE,
        mustMention: ['wall', 'slab', 'column', 'roof', 'curtain-wall', 'furniture', 'handrail'],
        note: "resolveStore() names every one of these kinds; each also has a rebuild arm in triggerGeometryRebuild (buildWall / buildSlab / buildColumn / the roof store event / buildCurtainWall / bim-furniture-updated / bim-handrail-updated), which is why BEAM — which has no baseOffset field — is not claimed.",
      },
      {
        file: 'apps/editor/src/ui/property-panel/PropertyDescriptorGenerator.ts',
        mustMention: ['baseOffset:'],
        note: 'The panel exposes Base Offset as an EDITABLE number row for exactly these families and commits it through the same element.updateParameters command — the field is a live control, not a chat invention.',
      },
    ],
    examples: [
      'set the base offset to 150 mm',
      'change the base offset to -0.2m',
      'set the base offset to 0.3m',
    ],
  },
  // ── RAC U7.3 — THE EXTENSION PROOF ────────────────────────────────────────
  //
  // The four capabilities below are the U7 claim tested rather than asserted:
  // each is a PropertyVocabulary row plus the metadata here, and NOTHING else.
  // The commit that added them changes ZERO lines of ZeroTokenResolver.ts and
  // ZERO lines of CapabilityExecutionSpec.ts — no case arm, no matcher, no
  // grammar. Grammar, refusals, bounds, summaries and the compound-sentence
  // plan executor all pick them up from the table.
  {
    id: 'set-mullion-size',
    // §PROP-MULLION-SIZE — the mullion section extruded along every curtain
    // grid line. Bounds are deliberately absent: the only numbers that exist
    // (0.01–0.5 m) live in the property panel's descriptor, which is a UI
    // control, not a published policy authority. Re-typing them here would
    // mint a second source of truth for a rule this layer does not own; the
    // command's own validateParameters is the gate (C65 §3.5).
    description: 'change the curtain-wall mullion size',
    verbs: ['set', 'change'],
    aliases: ['mullion size', 'mullion width'],
    refusalLabel: 'mullion size',
    targets: ['curtain-wall'],
    parameters: [
      {
        name: 'mullionSize',
        description: 'the new mullion section size',
        required: true,
        valueSource: 'measurement',
        example: '60mm',
      },
    ],
    scope: 'selection',
    destructive: false,
    busCommand: 'element.updateParameters',
    probe: { intent: 'set-mullion-size', value: 0.06 },
    commandProof: [
      {
        file: UPDATE_ELEMENT_PARAMETER_FILE,
        mustMention: ['curtain-wall', 'buildCurtainWall'],
        note: 'resolveStore() routes curtain-wall to the curtainWallStore, and triggerGeometryRebuild calls window.curtainWallBuilder.buildCurtainWall on the updated record — both halves of the honesty bar in one file.',
      },
      {
        file: 'packages/geometry-curtain-wall/src/CurtainPanelFactory.ts',
        mustMention: ['mullionSize'],
        note: 'The READ half: the panel factory sizes every cell as (cell.width − mullionSize) × (cell.height − mullionSize) and derives the frame thickness from it, so the written field really changes geometry.',
      },
    ],
    examples: [
      'set the mullion size to 60mm',
      'change the mullion width to 0.08m',
      'set the curtain wall mullion size to 50mm',
    ],
  },
  {
    id: 'set-panel-thickness',
    // §PROP-PANEL-THICKNESS — the glazing/panel build thickness. NOT folded
    // into `set-thickness`: that capability's routing is hand-written and
    // sends anything that is not a slab or a roof to wall.updateDimensions,
    // so a curtain wall would have been addressed as a wall.
    description: 'change the curtain-wall panel thickness',
    verbs: ['set', 'change'],
    aliases: ['panel thickness', 'glazing thickness'],
    refusalLabel: 'panel thickness',
    targets: ['curtain-wall'],
    parameters: [
      {
        name: 'panelThickness',
        description: 'the new panel / glazing thickness',
        required: true,
        valueSource: 'measurement',
        example: '12mm',
      },
    ],
    scope: 'selection',
    destructive: false,
    busCommand: 'element.updateParameters',
    probe: { intent: 'set-panel-thickness', value: 0.012 },
    commandProof: [
      {
        file: UPDATE_ELEMENT_PARAMETER_FILE,
        mustMention: ['curtain-wall', 'buildCurtainWall'],
        note: 'Same store and same rebuild call as the mullion size — one command, one dispatch, one rebuild.',
      },
      {
        file: 'packages/geometry-curtain-wall/src/CurtainPanelFactory.ts',
        mustMention: ['panelThickness'],
        note: 'The READ half: panelThickness is the BoxGeometry depth of every glazed panel and the frame depth of every framed panel.',
      },
    ],
    examples: [
      'set the panel thickness to 12mm',
      'change the glazing thickness to 0.024m',
      'set the curtain wall panel thickness to 20mm',
    ],
  },
  {
    id: 'set-baluster-spacing',
    // §PROP-BALUSTER-SPACING — the railing infill pitch. The builder derives
    // the baluster COUNT from it, so this is the one railing number a user
    // actually reaches for, and the chat could not say it.
    description: 'change the handrail baluster spacing',
    verbs: ['set', 'change'],
    aliases: ['baluster spacing'],
    refusalLabel: 'baluster spacing',
    targets: ['handrail'],
    parameters: [
      {
        name: 'balusterSpacing',
        description: 'the centre-to-centre spacing of the balusters',
        required: true,
        valueSource: 'measurement',
        example: '100mm',
      },
    ],
    scope: 'selection',
    destructive: false,
    busCommand: 'element.updateParameters',
    probe: { intent: 'set-baluster-spacing', value: 0.1 },
    commandProof: [
      {
        file: UPDATE_ELEMENT_PARAMETER_FILE,
        mustMention: ['handrail', 'bim-handrail-updated'],
        note: 'resolveStore() routes handrail to the handrailStore (a partial-merge update), and the command emits bim-handrail-updated for the rebuild.',
      },
      {
        file: 'packages/geometry-stair/src/HandrailFragmentBuilder.ts',
        mustMention: ['balusterSpacing'],
        note: 'The READ half: the builder takes handrail.balusterSpacing (falling back to postSpacing, then 0.11) and computes the baluster count as floor(length / balusterSpacing) − 1.',
      },
    ],
    examples: [
      'set the baluster spacing to 100mm',
      'change the baluster spacing to 0.12m',
    ],
  },
  {
    id: 'set-baluster-width',
    // §PROP-BALUSTER-WIDTH — the baluster section. Not `set-width`: that
    // capability's kind list is hand-written and has no handrail on it, so
    // this ask was refused rather than served before U7.3.
    description: 'change the handrail baluster width',
    verbs: ['set', 'change'],
    aliases: ['baluster width', 'baluster thickness'],
    refusalLabel: 'baluster width',
    targets: ['handrail'],
    parameters: [
      {
        name: 'balusterWidth',
        description: 'the section width of each baluster',
        required: true,
        valueSource: 'measurement',
        example: '40mm',
      },
    ],
    scope: 'selection',
    destructive: false,
    busCommand: 'element.updateParameters',
    probe: { intent: 'set-baluster-width', value: 0.04 },
    commandProof: [
      {
        file: UPDATE_ELEMENT_PARAMETER_FILE,
        mustMention: ['handrail', 'bim-handrail-updated'],
        note: 'Same store and same rebuild event as the baluster spacing.',
      },
      {
        file: 'packages/geometry-stair/src/HandrailFragmentBuilder.ts',
        mustMention: ['balusterWidth'],
        note: 'The READ half: the builder sizes each baluster from handrail.balusterWidth (default 0.02).',
      },
    ],
    examples: [
      'set the baluster width to 40mm',
      'change the baluster thickness to 0.03m',
    ],
  },
  {
    id: 'set-overhang',
    // §PROP-OVERHANG (RAC VERBS-CAP) — the RAC conformance exercise reached
    // exactly ONE of the roof verbs from language while the roof geometry had
    // just been proven correct to 0.000 mm (a 300 mm eave delivers 300.00 mm on
    // square, elongated, L and U plans). The geometry was right and no sentence
    // could reach it; this declaration plus one PropertyVocabulary row is the
    // whole of the fix — zero lines in ZeroTokenResolver, zero in
    // CapabilityExecutionSpec.
    //
    // THE CARRIER IS `roof.update`, NOT `roof.setOverhang`. The latter is
    // classified D-DEAD (plugin DTO store nothing renders) and its note said
    // roof overhang had "no proven live carrier yet". It has one: the carrier
    // `set-roof-pitch` already ships on. Same command, same geometry roof
    // store, same rebuild — the liveness claim below is not a new one.
    description: 'change the roof overhang',
    verbs: ['set', 'change', 'make'],
    aliases: ['overhang', 'eaves', 'eaves overhang', 'eave overhang', 'roof overhang'],
    refusalLabel: 'overhang',
    targets: ['roof'],
    parameters: [
      {
        name: 'overhang',
        description: 'the new eave overhang beyond the footprint (0 = a flush eave)',
        required: true,
        valueSource: 'measurement',
        example: '300mm',
      },
    ],
    scope: 'selection',
    destructive: false,
    busCommand: 'roof.update',
    probe: { intent: 'set-overhang', value: 0.3 },
    commandProof: [
      {
        // WRITE half — an execution-authority root (packages/command-registry).
        file: 'packages/command-registry/src/roofs/UpdateRoofCommand.ts',
        mustMention: ['Partial<Omit<RoofData', 'store.update(this.roofId, this.updates)'],
        note: 'The LIVE roof route set-roof-pitch already rides: initBusHandlers bridges roof.update to UpdateRoofCommand, which applies an arbitrary Partial<RoofData> to context.stores.roofStore — the GEOMETRY roof store, not the detached plugin DTO store — and snapshots the previous record for undo.',
      },
      {
        // READ half — proves `overhang` is a field the geometry consumes, the
        // check the beam-height lie failed. NOT accepted as the only proof
        // (proveCommandTargets requires an execution-authority root too).
        file: 'packages/geometry-roof/src/RoofGeometryBuilder.ts',
        mustMention: ['_applyOverhang', 'data.overhang'],
        note: 'The READ half: every roof-type arm consumes data.overhang — _applyOverhang(poly, data.overhang ?? 0) for gable/hip/shed, per-edge eave expansion in the rectangular decomposition, and seg.overhang ?? data.overhang for compound segments. This is the field the 0.000 mm eave proof measured.',
      },
    ],
    examples: [
      'set the roof overhang to 300mm',
      'change the overhang to 0.5m',
      'set the eaves overhang to 450mm',
      'make the overhang 300mm',
    ],
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
    scopeModes: ['all', 'selection', 'level', 'room', 'orientation'],
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
    id: 'set-wall-rake',
    // §FEAT-WALL-RAKE-BATCH (ADR-0315, founder ask #1) — "make all walls
    // angled by 120 degrees". Rides the batch primitive built for it
    // (`wall.updateRakeBatch` → UpdateWallsRakeBatchCommand): ONE undo entry,
    // and every wall is pre-judged by geometry-wall's `rakeAuthorability`
    // single gate — the SAME policy WallStore.update enforces — because the
    // generic parameter route reports success on walls the store silently
    // refuses (curved / layered / opening-hosting). "Raked N of M — K
    // skipped: <reason>" is the honest report shape.
    description: 'lean walls to an angle (90° = vertical)',
    verbs: ['make', 'set', 'angle', 'tilt', 'lean', 'rake', 'slant'],
    aliases: ['wall angle', 'vertical angle', 'wall rake', 'wall lean'],
    refusalLabel: 'wall angle',
    targets: ['wall'],
    parameters: [
      {
        name: 'angle',
        description: 'the lean in degrees (15–165; 90 = vertical); "vertical" means 90',
        required: true,
        valueSource: 'angle',
        example: '70',
      },
    ],
    scope: 'all',
    // Same spatial-scope set as the colour batch: "make all walls on level 2
    // angled by 60" / "rake all walls in the kitchen by 75" resolve through
    // the injected ScopeResolver.
    scopeModes: ['all', 'selection', 'level', 'room', 'orientation'],
    destructive: false,
    busCommand: 'wall.updateRakeBatch',
    // Selection-scope probe (the 'all' scope never reads the selection, so it
    // could not exercise the target guard) — same reasoning as set-wall-color.
    probe: { intent: 'set-wall-rake', angleDeg: 70, scope: 'selection' },
    commandProof: {
      file: 'packages/command-registry/src/walls/UpdateWallsRakeBatchCommand.ts',
      mustMention: ['wallStore', 'rakeAuthorability'],
      note: "_resolveWalls reads ctx.stores.wallStore and nothing else, so the command's reachable set is walls only; per wall it consults geometry-wall's rakeAuthorability (the store's own gate) and executes through the proven UpdateElementParameterCommand rake route (geometry store → fragment rebuild, L-813-hardened).",
    },
    examples: [
      'make all walls angled by 120 degrees',
      'make the selected walls angled by 70',
      'tilt all walls on the ground floor by 60 degrees',
      'make all walls vertical',
    ],
  },
  {
    id: 'create-windows-parametric',
    // §FEAT-WINDOW-PARAMETRIC-CREATE (ADR-0315, founder ask #3) — "create a
    // window in the middle of every wall segment" / "a 1x2m window every 3
    // meters". Rides window.parametricCreate → CreateWindowsParametricBatchCommand:
    // children are the proven CreateWallOpeningCommand (plan-tool/generative
    // route: §OCCUPANCY canPlace, hosted mirroring, semantic graph, marks);
    // §WINDOW-CORNER-OVERFLOW caps spans to the segment; raked hosts refuse
    // (C15); ONE undo entry; destructive:true = Confirm card before the mass
    // creation, then "Created N of M planned — K skipped" honesty.
    description: 'create windows across walls parametrically',
    verbs: ['create', 'add', 'place', 'put'],
    aliases: ['windows in walls', 'window every'],
    refusalLabel: 'window creation',
    targets: ['wall'],
    parameters: [
      {
        name: 'size',
        description: 'window width × height in metres (default 1×1.2m, stated in the Confirm card)',
        required: false,
        valueSource: 'measurement',
        example: '1x2m',
      },
      {
        name: 'count or spacing',
        description: 'N windows per wall, or "every X meters"',
        required: false,
        valueSource: 'user-text',
        example: 'every 3 meters',
      },
    ],
    scope: 'all',
    scopeModes: ['all', 'selection', 'level'],
    destructive: true,
    busCommand: 'window.parametricCreate',
    probe: { intent: 'create-windows-parametric', mode: { kind: 'count', count: 1 }, widthM: 1, heightM: 2, scope: 'selection' },
    commandProof: {
      file: 'packages/command-registry/src/windows/CreateWindowsParametricBatchCommand.ts',
      mustMention: ['wallStore', 'CreateWallOpeningCommand'],
      note: "_resolveWalls reads ctx.stores.wallStore and nothing else; per planned window it instantiates the proven CreateWallOpeningCommand (ADD_OPENING: occupancy gate, hosted door/window store mirroring, semantic graph), executed sequentially so self-collisions are detected.",
    },
    examples: [
      'create a window in the middle of every wall segment',
      'create 2 windows in all the wall segments',
      'create a 1x2m window every 3 meters in all walls',
    ],
  },
  {
    id: 'add-wall-layer',
    // §FEAT-WALL-LAYER-ADD-BATCH (ADR-0315, founder ask #2) — "add a 10mm
    // plaster finish to the inner side of the selected wall". Rides
    // wall.addLayerBatch → AddWallLayerBatchCommand: INSTANCE-scoped children
    // on the property panel's proven UpdateWallSystemTypeCommand route
    // (geometry wallStore; never the detached wall.setLayers store, never the
    // sibling-restamping type-store path). Raked walls skip with the L-812
    // gate's reason; monolithic walls keep their body as a seeded structure
    // layer; wall.thickness re-derives per §03-WALL-THICKNESS-CONTRACT.
    description: 'add a finish layer to walls',
    verbs: ['add'],
    aliases: ['finish layer', 'wall layer', 'plaster layer'],
    refusalLabel: 'finish layer',
    targets: ['wall'],
    parameters: [
      {
        name: 'thickness',
        description: 'the layer thickness (e.g. 10mm)',
        required: true,
        valueSource: 'measurement',
        example: '10mm',
      },
      {
        name: 'finish',
        description: 'the finish, by name (plaster, plasterboard, limewash, …)',
        required: true,
        valueSource: 'finish',
        example: 'plaster',
      },
      {
        name: 'side',
        description: 'inner (default) or outer face',
        required: false,
        valueSource: 'user-text',
        example: 'inner side',
      },
    ],
    scope: 'all',
    scopeModes: ['all', 'selection'],
    destructive: false,
    busCommand: 'wall.addLayerBatch',
    probe: { intent: 'add-wall-layer', side: 'interior', thicknessM: 0.01, finishRef: 'plaster', scope: 'selection' },
    commandProof: {
      file: 'packages/command-registry/src/walls/AddWallLayerBatchCommand.ts',
      mustMention: ['wallStore', 'UpdateWallSystemTypeCommand'],
      note: "_resolveWalls reads ctx.stores.wallStore and nothing else, so the command's reachable set is walls only; per wall it reuses the proven instance-scoped UpdateWallSystemTypeCommand (geometry store → fragment rebuild, L-812 rake gate), never the detached plugin layer store.",
    },
    examples: [
      'add a 10mm plaster layer to the inner side of the selected wall',
      'add a 12mm plasterboard layer to all walls',
      'add a 20mm limewash finish to the outer side of all walls',
    ],
  },
  {
    id: 'set-window-type',
    // §FEAT-WINDOW-TYPE-BATCH (ADR-0315, founder ask #4) — "change the window
    // type to Steel Crittal Style". Rides window.updateSystemTypeBatch, whose
    // children are the L-620-proven UpdateWindowSystemTypeCommand against the
    // geometry windowStore (planWindowTypeChange preserves id/openingId/host
    // void, C15) — never the plugin `window.setType` detached-store route.
    description: 'change the window type',
    verbs: ['change', 'set', 'convert', 'swap', 'make', 'turn'],
    aliases: ['window type', 'window style'],
    refusalLabel: 'window type',
    targets: ['window'],
    parameters: [
      {
        name: 'type',
        description: 'the window type, by catalogue name or id',
        required: true,
        valueSource: 'window-system-types',
        example: 'Timber Casement',
      },
    ],
    scope: 'all',
    scopeModes: ['all', 'selection'],
    destructive: false,
    busCommand: 'window.updateSystemTypeBatch',
    // Selection-scope probe — the 'all' scope never reads the selection, so it
    // could not exercise the target guard (same reasoning as set-wall-type).
    probe: { intent: 'set-window-type', typeRef: 'Timber Casement', scope: 'selection' },
    commandProof: {
      file: 'packages/command-registry/src/windows/UpdateWindowsSystemTypeBatchCommand.ts',
      mustMention: ['windowStore', 'UpdateWindowSystemTypeCommand'],
      note: "_resolveWindowIds reads the geometry windowStore and nothing else, so the command's reachable set is windows only; per window it reuses the L-620-proven UpdateWindowSystemTypeCommand (windowStore.update → WindowBuilder rebuild), never the detached plugin DTO store.",
    },
    examples: [
      'change all windows to timber casement',
      'change the window type to steel crittal style',
      'convert the selected windows to upvc casement',
      'change all windows to aluminium triple glazed',
    ],
  },
  {
    id: 'set-door-type',
    // §FEAT-DOOR-TYPE-BATCH (RAC U4.3) — "change the door type to solid core
    // flush". THE EXTENSION PROOF for the U4 spec-driven arm: this entry plus
    // a CapabilityExecutionSpec table entry is the whole resolver cost — zero
    // new case code. Rides door.updateSystemTypeBatch, whose children are the
    // L-620-proven UpdateDoorSystemTypeCommand against the geometry doorStore
    // (planDoorTypeChange preserves id/openingId/host void, C15) — never the
    // plugin `door.setType` detached-store route.
    description: 'change the door type',
    verbs: ['change', 'set', 'convert', 'swap', 'make', 'turn'],
    aliases: ['door type', 'door style'],
    refusalLabel: 'door type',
    targets: ['door'],
    parameters: [
      {
        name: 'type',
        description: 'the door type, by catalogue name or id',
        required: true,
        valueSource: 'door-system-types',
        example: 'White Primed Softwood',
      },
    ],
    scope: 'all',
    scopeModes: ['all', 'selection'],
    destructive: false,
    busCommand: 'door.updateSystemTypeBatch',
    // Selection-scope probe — the 'all' scope never reads the selection, so it
    // could not exercise the target guard (same reasoning as set-window-type).
    probe: { intent: 'set-door-type', typeRef: 'White Primed Softwood', scope: 'selection' },
    commandProof: {
      file: 'packages/command-registry/src/doors/UpdateDoorsSystemTypeBatchCommand.ts',
      mustMention: ['doorStore', 'UpdateDoorSystemTypeCommand'],
      note: "_resolveDoorIds reads the geometry doorStore and nothing else, so the command's reachable set is doors only; per door it reuses the L-620-proven UpdateDoorSystemTypeCommand (doorStore.update → DoorBuilder rebuild), never the detached plugin DTO store.",
    },
    examples: [
      'change all doors to white primed softwood',
      'change the door type to glazed timber',
      'convert the selected doors to fire door fd30',
    ],
  },
  {
    id: 'set-slab-type',
    // §FEAT-SLAB-TYPE-BATCH (RAC U7.2) — "change all slabs to RC 250". A
    // CATALOGUE FAMILY table entry (CatalogueFamilies.ts): the spec, the
    // grammar and the refusal copy are GENERATED, so the resolver cost is the
    // same zero set-door-type paid. The command is the deliverable —
    // UpdateSlabsSystemTypeBatchCommand materialises the chosen assembly's
    // layer stack and derived thickness onto each slab through the live
    // UpdateSlabLayersCommand (geometry slabStore → fragment rebuild), never
    // the plugin `slab.setType` DTO store whose own header admits it "simply
    // records the type id on the DTO" (L-620).
    description: 'change the slab type',
    verbs: ['change', 'set', 'convert', 'swap', 'make', 'turn'],
    aliases: ['slab type', 'slab assembly', 'slab buildup'],
    refusalLabel: 'slab type',
    targets: ['slab'],
    parameters: [
      {
        name: 'type',
        description: 'the slab type, by catalogue name or id',
        required: true,
        valueSource: 'slab-system-types',
        example: 'RC Slab – Monolithic 200mm',
      },
    ],
    scope: 'all',
    scopeModes: ['all', 'selection'],
    destructive: false,
    busCommand: 'slab.updateSystemTypeBatch',
    // Selection-scope probe — the 'all' scope never reads the selection, so it
    // could not exercise the target guard (same reasoning as set-door-type).
    probe: { intent: 'set-slab-type', typeRef: 'RC Slab – Monolithic 200mm', scope: 'selection' },
    commandProof: {
      file: 'packages/command-registry/src/slabs/UpdateSlabsSystemTypeBatchCommand.ts',
      mustMention: ['slabStore', 'UpdateSlabLayersCommand', 'resolveCatalogueRef'],
      note: "_resolveSlabIds reads ctx.stores.slabStore and nothing else, so the command's reachable set is slabs only; per slab it reuses the proven UpdateSlabLayersCommand (geometry store → fragment rebuild) and resolves the type reference through the ONE resolveCatalogueRef ladder.",
    },
    examples: [
      'change all slabs to rc slab monolithic 200mm',
      'change the slab type to composite deck',
      'convert the selected slabs to insulated screed',
    ],
  },
  {
    id: 'set-ceiling-type',
    // §FEAT-CEILING-TYPE-BATCH (RAC U7.2) — the slab twin, one family over.
    // Routes through UpdateCeilingsSystemTypeBatchCommand →
    // UpdateCeilingLayersCommand against the LEGACY geometry ceilingStore that
    // the 3D CeilingTool and the project loader write — never the plugin Immer
    // ceiling store, which is populated only for plan-tool ceilings and whose
    // failure mode ("ceiling not found: <id>") is recorded in initBusHandlers.
    description: 'change the ceiling type',
    verbs: ['change', 'set', 'convert', 'swap', 'make', 'turn'],
    aliases: ['ceiling type', 'ceiling assembly'],
    refusalLabel: 'ceiling type',
    targets: ['ceiling'],
    parameters: [
      {
        name: 'type',
        description: 'the ceiling type, by catalogue name or id',
        required: true,
        valueSource: 'ceiling-system-types',
        example: 'Suspended ACT 600×600',
      },
    ],
    scope: 'all',
    scopeModes: ['all', 'selection'],
    destructive: false,
    busCommand: 'ceiling.updateSystemTypeBatch',
    probe: { intent: 'set-ceiling-type', typeRef: 'Plasterboard 12.5mm', scope: 'selection' },
    commandProof: {
      file: 'packages/command-registry/src/ceilings/UpdateCeilingsSystemTypeBatchCommand.ts',
      mustMention: ['ceilingStore', 'UpdateCeilingLayersCommand', 'resolveCatalogueRef'],
      note: "_resolveCeilingIds reads ctx.stores.ceilingStore and nothing else, so the command's reachable set is ceilings only; per ceiling it reuses the proven UpdateCeilingLayersCommand (geometry store → rebuild) and resolves the reference through the ONE resolveCatalogueRef ladder.",
    },
    examples: [
      'change all ceilings to plasterboard 12.5mm',
      'change the ceiling type to suspended act 600x600',
      'convert the selected ceilings to exposed concrete soffit',
    ],
  },
  {
    id: 'set-rhino-material',
    // §FEAT-RHINO-CHAT-MATERIAL — the imported Rhino model is REFERENCE
    // content (THREE meshes in a tagged scene group, not store elements), so
    // this is deliberately targets:'global': it acts on the whole imported
    // model, never on the element selection, and no per-element command
    // family exists to prove targets against. The bridge (initBusHandlers
    // `rhino.setMaterial` / `rhino.resetMaterial`) applies ONE shared override
    // material — or restores the as-imported materials — as a single undoable
    // commandManager entry, and reports honestly through
    // 'pryzm-rhino-material-report' (including "no Rhino model is imported").
    description: 'recolour the imported Rhino model',
    verbs: ['make', 'paint', 'set', 'change', 'turn', 'reset', 'restore'],
    aliases: ['rhino', 'rhino model', '3dm', 'imported model'],
    // NO refusalLabel: 'colour' remains an UNCONNECTED_TOPICS label for the
    // element kinds whose colour is still not chat-drivable (same decision as
    // set-wall-color), and a global capability may not claim a topic word.
    targets: 'global',
    parameters: [
      {
        name: 'color',
        description: 'the colour to apply, by name or #hex; "reset … materials" restores the original look',
        required: true,
        valueSource: 'color',
        example: 'white',
      },
    ],
    scope: 'global',
    destructive: false,
    busCommand: 'rhino.setMaterial',
    alsoDispatches: ['rhino.resetMaterial'],
    probe: { intent: 'set-rhino-material', colorRef: 'white' },
    examples: [
      'change all elements of the rhino model to white',
      'paint the rhino model white',
      'make the rhino model light grey',
      'reset the rhino model materials',
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
    examples: ['add a level', 'create a new level at 9m'],
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
  {
    id: 'generate-building',
    // §GEN-CHAT (RAC U5b.2, Dimension B core) — conversational building
    // generation over the FOUR proven executors, reached through ONE bus verb
    // (`generation.building`, registered in initBusHandlers). The handler maps
    // the payload through the typed GenerationRequest seam
    // (apps/editor/src/ui/generation/generationRequest.ts) and drives the SAME
    // controllers/executors the onboarding modal drives — never a second
    // pipeline — under the `beginBuildingGeneration` lease (ONE coalesced
    // undo, §GEN-VIEW-COALESCE suppression). Hard stoppers live in the
    // execution layer: §GEN-MAXHEIGHT-GATE (8bb9dac8) refuses over-cap floor
    // counts quoting BOTH numbers, §RESI-ZERO-APARTMENTS-REFUSE surfaces the
    // engine's real reason — all relayed verbatim into the chat transcript via
    // 'pryzm-generation-report'.
    description: 'generate a whole building (residential / house / office) on the site',
    verbs: ['generate', 'create', 'build', 'make'],
    aliases: ['residential building', 'house', 'office building', 'office tower', 'building'],
    // targets:'global' — generation is SITE-scoped, not element-scoped: it
    // reads the parcel boundary, never the selection, so there is no element
    // target set to prove (same ruling as set-rhino-material). scopeModes n/a.
    targets: 'global',
    parameters: [
      {
        name: 'typology',
        description: 'what to generate: residential building, house, or office building',
        required: true,
        valueSource: 'user-text',
        example: 'residential building',
      },
      {
        name: 'storeys',
        description: 'total floor count (house 1–3, residential 2–21, office 1–40); omitted ⇒ the stated default',
        required: false,
        valueSource: 'measurement',
        example: '3-storey',
      },
      {
        name: 'apartment mix',
        description: 'optional T1–T4 mix hints for residential ("with 2-bed and 3-bed apartments")',
        required: false,
        valueSource: 'user-text',
        example: '2-bed and 3-bed',
      },
    ],
    scope: 'global',
    // A whole building is consequential — Confirm card (floors + typology +
    // the adds-alongside contract) before anything is dispatched.
    destructive: true,
    busCommand: 'generation.building',
    probe: { intent: 'generate-building', typology: 'residential-building', floors: 3 },
    // Not gate-validated for a 'global' capability, but recorded so the claim
    // is source-anchored anyway: the three executors this verb reaches all
    // open the beginBuildingGeneration lease themselves.
    commandProof: [
      {
        file: 'apps/editor/src/ui/residential-building/ResidentialBuildingExecutor.ts',
        mustMention: ['beginBuildingGeneration'],
        note: 'The residential executor builds through the command bus inside the beginBuildingGeneration lease (one coalesced undo).',
      },
      {
        file: 'apps/editor/src/ui/house-layout/HouseLayoutExecutor.ts',
        mustMention: ['beginBuildingGeneration'],
        note: 'The house executor opens the same lease around its composite build.',
      },
      {
        file: 'apps/editor/src/ui/office-building/OfficeBuildingExecutor.ts',
        mustMention: ['beginBuildingGeneration'],
        note: 'The office executor opens the same lease around its composite build.',
      },
    ],
    examples: [
      'generate a 3-storey residential building',
      'generate a 2-storey house',
      'generate an office building with 5 floors',
      'create a residential building with 2-bed and 3-bed apartments',
    ],
  },
  {
    id: 'generate-apartment-layout',
    // §GEN-CHAT-APARTMENT (RAC U5b.2, founder P0 2026-08-10) — the founder
    // typed "Create 3 bedroom apparment" and got "I'm not sure how to help
    // with that yet". The apartment-layout engine has shipped for months and
    // is driven by the AI-panel leaf and `pryzmGenerateApartmentLayout()`;
    // nothing told the chat it was there. This declaration is that fix.
    //
    // DISTINCT FROM generate-building: this fills the walls ALREADY DRAWN on
    // the active level with an ApartmentProgram (bedrooms / bathrooms /
    // en-suite / open-plan), through the SAME shared trigger both existing
    // entry points use — one pipeline, one shell read, one options modal.
    description: 'lay out an apartment inside the walls already drawn on this level',
    verbs: ['generate', 'create', 'make', 'lay out', 'plan', 'design'],
    aliases: ['apartment', 'apartment layout', 'flat', 'bedroom apartment'],
    // targets:'global' — the layout engine reads the LEVEL's exterior shell,
    // never the element selection, so there is no element target set to prove
    // (the same ruling as generate-building and set-rhino-material).
    targets: 'global',
    parameters: [
      {
        name: 'bedrooms',
        description: 'how many bedrooms to plan; omitted ⇒ the engine\'s default programme',
        required: false,
        valueSource: 'measurement',
        example: '3 bedroom',
      },
      {
        name: 'bathrooms',
        description: 'how many bathrooms to plan; omitted ⇒ the engine\'s default',
        required: false,
        valueSource: 'measurement',
        example: '2 bathrooms',
      },
      {
        name: 'en-suite / open-plan',
        description: 'optional programme flags ("with an en-suite", "open-plan kitchen")',
        required: false,
        valueSource: 'user-text',
        example: 'with an en-suite',
      },
    ],
    scope: 'global',
    // Generating a whole plan into the drawn shell is consequential — the
    // Confirm card states bedrooms/bathrooms and that it fills the EXISTING
    // shell, so nobody confirms it thinking they asked for a new building.
    destructive: true,
    busCommand: 'generation.apartment',
    probe: {
      intent: 'generate-apartment-layout',
      bedrooms: 3,
      bathrooms: null,
      masterEnSuite: false,
      openPlanKitchenDining: false,
    },
    // Source-anchored: the chat reaches the layout engine through the SAME
    // shared trigger module the AI-panel leaf and the console command use.
    commandProof: [
      {
        file: 'apps/editor/src/ui/apartment-layout/apartmentLayoutTrigger.ts',
        mustMention: ['requestApartmentLayout', 'gatherLayoutPayload'],
        note: 'The chat path calls the same shared trigger the AI-panel leaf and pryzmGenerateApartmentLayout() call — one shell read, one pipeline.',
      },
    ],
    examples: [
      'create a 3 bedroom apartment',
      'generate a 2 bed apartment in this shell',
      'make a 3-bedroom apartment with 2 bathrooms',
      'create a 4 bedroom apartment with an en-suite',
    ],
  },
  {
    id: 'generate-room-finishes',
    // §GEN-ROOMS (RAC U5c.1) — the authored-but-unreachable case AGAIN, four
    // times over. The D-CE ceiling engine, the room-type floor-finish pass,
    // the D-FLE furniture engine and the D-LE lighting engine have all shipped
    // and all run today from `pryzmCeilAllRooms()` / `pryzmFloorAllRooms()` /
    // `pryzmFurnishAllRooms()` / `pryzmLightAllRooms()` and the AI-panel
    // leaves. The chat reached NONE of them. This declaration is that fix, and
    // it drives the SAME triggers — not a second pipeline.
    description: 'run the room-scale engines (ceilings, floor finishes, furniture, lighting) on a level',
    verbs: ['furnish', 'light', 'add', 'apply', 'run', 'place'],
    aliases: ['furnish', 'furniture', 'ceilings', 'floor finishes', 'lighting', 'lights'],
    // targets:'global' — every one of these engines reads the LEVEL's rooms,
    // never the element selection (which is exactly why a selection-scoped ask
    // is refused rather than reinterpreted).
    targets: 'global',
    parameters: [
      {
        name: 'steps',
        description: 'which engines to run — ceilings, floor finishes, furniture, lighting (any combination)',
        required: true,
        valueSource: 'user-text',
        example: 'furnish and light',
      },
      {
        name: 'scope',
        description: 'this floor (default), a named level, or every floor (furnishing only — the other three have no every-floor driver)',
        required: false,
        valueSource: 'user-text',
        example: 'on level 2',
      },
    ],
    scope: 'global',
    // Creating furniture / ceilings / finishes across a whole floor is
    // consequential — the Confirm card names the engines and the level.
    destructive: true,
    busCommand: 'generation.rooms',
    probe: { intent: 'generate-room-finishes', steps: ['furnish'], scope: 'active-level' },
    commandProof: [
      {
        file: 'apps/editor/src/ui/generation/roomFinishChatSeam.ts',
        mustMention: ['triggerFurnishLayout', 'triggerCeilingLayout', 'triggerFloorLayout', 'triggerLightingLayout'],
        note: 'The chat path calls the SAME shared triggers the console entries and AI-panel leaves call — one engine, four entry points.',
      },
    ],
    examples: [
      'furnish all rooms',
      'add ceilings to every room',
      'add floor finishes to all rooms',
      'light all rooms',
      'furnish and light this floor',
      'furnish every floor',
    ],
  },
  {
    id: 'finish-apartment-chain',
    // §GEN-CHAIN (RAC U5c.2) — the auto-chain (apartment → ceilings + floor
    // finishes → furniture → lighting) as a conversational flow. The chain is
    // ALREADY WIRED between the trigger modules, each link with its own
    // §CHAIN-TIMEOUT fallback; this capability starts it and REPORTS it stage
    // by stage. It re-implements nothing and must never double-fire a link.
    description: 'run the whole finishing chain on a level — ceilings, floor finishes, furniture, lighting',
    verbs: ['finish', 'complete', 'fit out'],
    aliases: ['finish apartment', 'finish this floor', 'fit out'],
    targets: 'global',
    parameters: [
      {
        name: 'with layout',
        description: 'whether to re-plan the apartment first ("generate and finish") or finish the rooms that already exist',
        required: false,
        valueSource: 'user-text',
        example: 'generate and finish an apartment',
      },
    ],
    scope: 'global',
    destructive: true,
    busCommand: 'generation.finish-chain',
    probe: { intent: 'finish-apartment-chain', withLayout: false, scope: 'active-level' },
    commandProof: [
      {
        file: 'apps/editor/src/ui/generation/roomFinishChatSeam.ts',
        mustMention: ['runGenerationFinishChain', 'ceiling.layout-executed', 'furnish.layout-executed'],
        note: 'The chain seam OBSERVES the shipped cascade rather than re-driving it — it fires the first link and reports every stage from the engines own executed events.',
      },
    ],
    examples: [
      'finish this apartment',
      'finish this floor',
      'generate and finish an apartment',
    ],
  },
  {
    id: 'execute-plan',
    // §PLAN (RAC U6) — the COMPOSITE capability: it implements no command of
    // its own. A compound sentence is a sequence of the capabilities already
    // declared above, resolved clause by clause through the same ladder and
    // executed step by step by the same dispatcher. Its `busCommand` is null
    // and `composite` is true for exactly that reason — the gate treats the
    // pair as a declared shape rather than as the "does nothing" defect.
    description: 'run several asks in the order you said them ("…, then …")',
    verbs: ['then', 'and then', 'after that', 'first'],
    aliases: ['then', 'after that', 'next'],
    targets: 'global',
    parameters: [
      {
        name: 'steps',
        description:
          'the clauses, in order — each one an ordinary ask this chat already understands; a clause it would refuse alone refuses the whole plan',
        required: false,
        valueSource: 'user-text',
        example: 'duplicate level 0 to level 1, then furnish it',
      },
    ],
    scope: 'global',
    // Destructive if ANY step is — the plan's Confirm card is never a weaker
    // gate than the gates of its own steps.
    destructive: true,
    busCommand: null,
    composite: true,
    probe: {
      intent: 'execute-plan',
      steps: [
        { intent: 'set-wall-color', colorRef: 'white', scope: 'all' },
        { intent: 'generate-room-finishes', steps: ['ceilings'], scope: 'active-level' },
      ],
      clauses: ['make all walls white', 'add ceilings to every room'],
    },
    examples: [
      'duplicate level 0 to level 1, then furnish it',
      'generate a 2-storey house and then furnish all rooms',
      'add a level at 9 m, then duplicate level 0 onto it',
      'make all walls white then add ceilings to every room',
      'create a 3 bedroom apartment, then light all rooms',
    ],
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
