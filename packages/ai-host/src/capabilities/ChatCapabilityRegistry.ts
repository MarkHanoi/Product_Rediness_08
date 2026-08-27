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
// §FEAT-BULK-DIMENSIONS (L-949) — same one-way discipline: this module imports
// the pure table; the table imports NOTHING from here (a cycle would be the
// §SCC-NO-BARREL-ACCESS-AT-MODULE-LOAD white-screen hazard).
import {
  DIMENSION_FAMILIES,
  DIMENSION_LABEL,
  dimensionFamilyTargets,
  type DimensionKey,
} from '../intents/DimensionFamilies.js';
// §L-1032 — THE LEVEL-CHANGE REGISTER, read straight out of L1. The same rows
// the L7 property panel offers its control from and the L3 event bridge builds
// `element.level-changed` from, so "which families can change storey, and by
// which verb" is answered in exactly one place (C84 EI-9). Importing the
// register here rather than restating it is what makes a row added to
// `LEVEL_CHANGE_VERBS` a chat target in the SAME edit.
import { LEVEL_CHANGE_REFUSALS, LEVEL_CHANGE_VERBS } from '@pryzm/command-bus';

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
  /**
   * §FEAT-CHAT-STAIR-TYPES (L-1441) — the stair types (`BUILT_IN_STAIR_TYPES`,
   * five entries), resolved by `publishedStairTypeCatalogue()`.
   *
   * ⚠ NOT the same channel as the five sources above, and the difference is
   * declared rather than hidden. Those read the PROJECT's store through the
   * editor bridge; this reads the PUBLISHED BUILT-IN table, because the
   * bridge's catalogue channel carries only slab + ceiling today. A stair type
   * a user authored in this project is therefore NOT resolvable from chat yet,
   * and the refusal says so in the user's own words rather than reporting it as
   * "no such type" (§CONTEXT-DATA-HONESTY). See publishedCatalogues.ts.
   */
  | 'stair-types'
  /** §FEAT-CHAT-STAIR-TYPES (L-1441) — the railing catalogue, read off the LIVE
   *  `handrailTypeStore` singleton (20 built-ins PLUS anything the project
   *  authored) — the same object element.changeType's stair-railing branch
   *  resolves against, so a name this resolves is a name that branch accepts. */
  | 'handrail-types'
  /**
   * §FEAT-CHAT-LIGHTING-TYPES (L-10220) — the lighting fixture catalogue,
   * `BUILT_IN_LIGHTING_TYPES` (@pryzm/geometry-lighting): 12 named families +
   * the 20 LOD-200 rows, by construction.
   *
   * ⭐ NO "built-in only" caveat, and the difference from `stair-types` is
   * MEASURED, not stylistic: `element.changeType`'s lighting branch validates
   * against `getLightingTypeDefinition()`, which reads THIS SAME ARRAY. The set
   * this source can resolve is exactly the set the route will accept, so there
   * is no third catalogue for a refusal to be silent about.
   */
  | 'lighting-types'
  /** §CW90 item 5 — the curtain-wall types (LIVE `curtainWallTypeStore`, 20
   *  built-ins + project customs), resolved on the FULL resolveCatalogueRef
   *  ladder — bridge row first, `publishedCurtainWallTypeCatalogue()` fallback. */
  | 'curtain-wall-types'
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
  | 'coordinates'
  /**
   * ⭐ §FEAT-REVEAL-DIRECTION-RAC (L-3414) — a CLOSED SET OF WORDS declared by the
   * property vocabulary's own `enumSpoken` table, not a quantity.
   *
   * ⛔ It is a member of its own rather than being folded into `user-text`, and the
   * difference is enforcement: `user-text` is free prose nothing validates, while an
   * enumeration is REFUSED by name when the word is not a member — *"'sideways' is not a
   * reveal direction I know. It can be: outdoor or indoor."* Calling a closed set free
   * text would throw away the refusal that makes it usable.
   *
   * ⚠ It is also NOT `measurement`: the unit converter is length-only, so a word routed
   * through it is NaN and the refusal then names the wrong problem (§L-3203 records that
   * failure from the other direction — a unitless 20 read as twenty METRES).
   */
  /**
   * ⭐ §CHAT-OPENING-SHAPE (L-10945) — the opening PROFILE axis:
   * `OPENING_PROFILE_KINDS` (@pryzm/geometry-wall), four values, resolved by the
   * ONE token vocabulary in `intents/OpeningShapeVocabulary.ts`.
   *
   * ⛔ A MEMBER OF ITS OWN, not folded into `enumeration`, and the difference is
   * the same one that separates the catalogue sources from each other: this axis
   * is a CLOSED ENUM shipped in geometry-wall, identical in every project and
   * needing no injection — while `enumeration` is specifically the property
   * vocabulary's `enumSpoken` table, which this is not in. Calling it a project
   * catalogue would claim an injection channel it does not use; calling it free
   * text would throw away the refusal that lists the four real names.
   *
   * ⚠ It also carries a per-FAMILY legality rule no other value source has — a
   * door may not be circular (§OPENING-PROFILE-BY-FAMILY, L-1251) — which the
   * value stage states BY NAME rather than dropping.
   */
  | 'opening-shapes'
  | 'enumeration';

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
  /** §GATE-QUERYENGINE-READ-ONLY — the capability ANSWERS rather than mutates:
   *  busCommand is null AND no local action changes document or view state.
   *  Absent means mutating. */
  readonly readOnly?: true;
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
  /** §GATE-VIS-INTENT (VIS-CLASS, 2026-08-11) — two members joined:
   *  'applyVisibilityIntent' (the bridge dispatches the resolution's declared
   *  `visibility.*` bus command — registered by the COMPOSITION ROOT,
   *  composeRuntime §4d-bis, which the coverage gate's handler-file scan
   *  cannot see, so declaring it as `busCommand` would read as a phantom —
   *  then projects the intent onto the scene) and 'answer' (the READ-ONLY
   *  class: the summary IS the answer, nothing is dispatched).
   *  §FEAT-CHAT-TOOL-ACTIVATION (L-906) added 'activateTool': the bridge
   *  resolves the spoken item against the element-creation matrix + the
   *  furniture catalogue (the ONE resolveCatalogueRef ladder, C69) and
   *  activates the SAME placement tool the Create palette button does —
   *  no bus command, no store write; the user's canvas click creates. */
  readonly localAction?: 'undo' | 'redo' | 'setActiveLevel' | 'applyVisibilityIntent' | 'answer' | 'activateTool';
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
  // §FEAT-CHAT-STAIR-TYPES (L-1441) — a stair's railing is its OWN element
  // kind, registered under exactly this key (apps/editor initStores.ts:107)
  // with its own store, its own record (`StairRailingConfig`) and its own
  // command. ⛔ It is NOT `handrail`: that is the STANDALONE railing family,
  // a different store and a different element, and conflating them is how a
  // retype would silently hit the wrong objects.
  'stair-railing',
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

/**
 * §FEAT-RAC-PROPERTY-QUERY (L-2210) — `set-height`'s proven kind list, named
 * ONCE because TWO capabilities must agree on it exactly.
 *
 * `property-query`'s `probe` asks for the `height` row, so proof 1
 * (`refusal ⟺ kind ∉ targets`) compares it against precisely this set. Written
 * twice it would drift, and the drift would surface as a probe failure blaming
 * the wrong capability. `-beam` is the L-949 finding (`BeamData` has width and
 * depth and NO height — see this file's header); `+ceiling` is the one kind the
 * generic parameter command routes that is not in the base list.
 */
const SET_HEIGHT_TARGETS: readonly string[] = Object.freeze([
  ...GENERIC_PARAMETER_TARGETS.filter((k) => k !== 'beam'),
  'ceiling',
]);

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
  // §FIX-UNDECLARED-SPATIAL-REACH (L-1142, C67 §1.8 / §4 rule 14, 2026-08-19).
  // 'orientation' ADDED. The arm already honoured it; the gate printed
  // "honours 'orientation' without declaring it" for all four delete
  // families. A mode the arm honours and the registry hides makes the
  // system UNDER-REPORT itself, because the "what I CAN do" answer is
  // generated from this table (EI-9 in the reporting direction — the
  // mirror of L-998, where a refusal advertised what it was refusing).
  scopeModes: ['all', 'level', 'room', 'orientation'],
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

// ─── §FEAT-BULK-DIMENSIONS (L-949) — the DIMENSION FAMILIES, as generated metadata ─
//
// The founder's ask: "bulk change any element (doors, windows, walls)
// dimensions (or multiple dims) — I want ALL elements dims to be able to be
// changed." Three families today (wall / window / door), each ONE record in
// `DimensionFamilies.ts` from which BOTH its execution spec and this metadata
// are built — so `targets`, the examples and the command proof are GENERATED
// rather than restated, and a family removed from the table is a claim removed
// in the same edit.
//
// `destructive: true` is not decoration: the bridge draws a Confirm card, and
// the generated spec's `requireResolvedIds` forces the summary that card shows
// to carry a REAL resolved count ("This sets all 42 windows in the project to
// height 2 m"). A mass resize is not a gesture whose extent is obvious from the
// sentence, so it is confirmed before it runs — the same reasoning that lets
// the scoped deletes be confirmed honestly.
//
// WHICH DIMENSIONS EACH FAMILY REALLY TAKES is `carries` on the table, and the
// parameter list below is generated from it. A field a family's carrier cannot
// carry (wall thickness, door sill) is REFUSED BY NAME with the route that can
// do it — never advertised here and never silently dropped.
const DIMENSION_FAMILY_CAPABILITIES: readonly ChatCapability[] = DIMENSION_FAMILIES.map((family) => ({
  id: family.intent,
  description: `change the ${family.elementKind} ${family.carries.map((k: DimensionKey) => DIMENSION_LABEL[k]).join(' / ')}`,
  verbs: ['set', 'change', 'make', 'resize', 'update', 'adjust'],
  aliases: [
    family.elementKind,
    family.nounPlural,
    ...family.nounAliases,
    ...family.carries.map((k: DimensionKey) => DIMENSION_LABEL[k]),
  ],
  // NO `refusalLabel`, deliberately. That field builds the "here is what I CAN
  // do" half of a generated refusal, and it lists PROPERTIES. These families set
  // no NEW property — height and width are already offered by `set-height` and
  // `set-width`; what is new is the SCOPE. Adding "dimensions" to that list
  // would read as a fourth thing the user could ask for and change the pinned
  // copy ("I can change door height, width and door type") for no information.
  targets: dimensionFamilyTargets(family.intent),
  parameters: family.carries.map((k: DimensionKey) => ({
    name: k,
    description: `the new ${DIMENSION_LABEL[k]} (one or more may be given in the same sentence)`,
    // NONE is individually required — the ask needs AT LEAST ONE, which the
    // value stage enforces with a concrete example. Marking them all required
    // would make "make all windows 2m high" look under-specified when it is
    // exactly the founder's sentence.
    required: false,
    valueSource: 'measurement' as const,
    example: k === 'sillHeight' ? '0.9m' : k === 'thickness' ? '200mm' : '2m',
  })),
  scope: 'all',
  // The SELECTION form is claimed too ("make the selected windows 2m high"):
  // unlike the scoped deletes, no other capability owns the multi-element
  // dimension ask — `set-dimensions` refuses it by design (ADR-0314 D3) and now
  // points here.
  //
  // §CW90 item 5 — 'room' is declared ONLY when the family's own spatialKinds
  // claims it: the curtain-wall family narrows to ['level'] (room membership
  // for curtain walls is new with §CW90 items 4+9 and the room arm is
  // unmeasured against it), and a declared mode the arm refuses is the C68
  // §7.d lie the coverage gate rightly fails.
  scopeModes: (family.spatialKinds === undefined || family.spatialKinds.includes('room'))
    ? ['all', 'selection', 'level', 'room']
    : ['all', 'selection', 'level'],
  destructive: true,
  busCommand: family.busCommand,
  // Selection-scope probe, for the same reason every batch capability uses one:
  // proof 3a asks "does the arm accept this element kind and refuse every other
  // one", and the selection scope is the only form that answers per-KIND. An
  // 'all' probe refuses for every kind in the harness (no resolveScope is
  // injected there) and would prove nothing.
  probe: {
    intent: family.intent,
    dims: { [family.carries[0]!]: 2 },
    scope: 'selection',
  } as unknown as SemanticIntent,
  commandProof: family.commandProof,
  examples: [...family.examples],
}));

// ─── §L-1032 — the LEVEL-CHANGE family, derived from the L1 register ─────────
//
// Both lists are COMPUTED from `LEVEL_CHANGE_VERBS`, never transcribed. The
// register's `panelTypes` are the property panel's `normalizeType()` spellings
// and the chat's are `PROBE_ELEMENT_KINDS`'; the only difference is hyphenation
// ('curtainwall' → 'curtain-wall'), which `normalizeElementKind` — the function
// the gate itself checks targets with — already reconciles.
//
// A family whose row exists but whose handler is not registered will be caught
// by the coverage gate's PHANTOM check ("claims a command that is not a
// registered bus command"), which is the correct place for that to surface: the
// register's own header says a row is a claim that the verb IS registered.

/** Every element kind the chat can really re-storey. */
export const MOVE_TO_LEVEL_TARGETS: readonly string[] = Object.freeze([
  ...new Set(
    Object.values(LEVEL_CHANGE_VERBS).flatMap((s) => s.panelTypes.map(normalizeElementKind)),
  ),
]);

/** Every bus verb `move-to-level` can dispatch — the register's key set. */
export const MOVE_TO_LEVEL_BUS_COMMANDS: readonly string[] = Object.freeze(
  Object.keys(LEVEL_CHANGE_VERBS),
);

// ─── The capabilities ────────────────────────────────────────────────────────

const CAPABILITIES: readonly ChatCapability[] = [
  ...DELETE_FAMILY_CAPABILITIES,
  ...DIMENSION_FAMILY_CAPABILITIES,
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
  // ── §GATE-VIS-INTENT (VIS-CLASS, 2026-08-11) — the visibility family ──────
  //
  // The structural half left open at 6b538355. All four ride the intent path
  // wired in composeRuntime §4d-bis (`ViewVisibilityIntentStore`), reached as
  // LOCAL actions — see the `localAction` doc above for why the compose-root
  // bus verbs (`visibility.hide.selection` / `.isolate.selection` /
  // `.reveal.all`) are not declared as `busCommand` here.
  //
  // HONESTY, stated in every description and summary: visibility intents are
  // VIEW-ONLY — the handlers declare `affectedStores: []` (no undo entry),
  // `serialize()` has no production caller (no persistence), and there is no
  // CRDT binding (no sync). Nothing here implies durability that does not
  // exist.
  {
    id: 'hide-selection',
    description: 'hide the selected elements in this view (view-only — not undoable, not saved, not shared)',
    verbs: ['hide', 'conceal'],
    aliases: ['hide', 'invisible'],
    // Visibility is kind-agnostic: the intent store records element IDS and
    // never consults a per-kind store, so every kind is a legitimate target
    // (the same construction argument as zoom-selected).
    targets: PROBE_ELEMENT_KINDS,
    parameters: [],
    scope: 'selection',
    destructive: false,
    busCommand: null,
    localAction: 'applyVisibilityIntent',
    probe: { intent: 'hide-selection' },
    commandProof: {
      file: 'apps/editor/src/ui/ai/ZeroTokenChatBridge.ts',
      mustMention: ['visibility.hide.selection', 'applyToScene'],
      note: 'The bridge dispatches visibility.hide.selection (registered by composeRuntime §4d-bis against ViewVisibilityIntentStore) and then projects the intent onto the scene via runtime.visibility.applyToScene — the SpatialTree write-then-project gesture. Id-keyed and kind-agnostic by construction.',
    },
    examples: ['hide this wall', 'hide the selection', 'hide the selected walls'],
  },
  {
    id: 'isolate-selection',
    description: 'isolate the selected elements — everything else in this view hides (view-only — not undoable, not saved, not shared)',
    verbs: ['isolate'],
    aliases: ['isolate', 'isolation'],
    targets: PROBE_ELEMENT_KINDS,
    parameters: [],
    scope: 'selection',
    destructive: false,
    busCommand: null,
    localAction: 'applyVisibilityIntent',
    probe: { intent: 'isolate-selection' },
    commandProof: {
      file: 'apps/editor/src/ui/ai/ZeroTokenChatBridge.ts',
      mustMention: ['visibility.isolate.selection', 'applyToScene'],
      note: 'Same route as hide-selection: visibility.isolate.selection writes the wave-8 temporaryIsolation for the active view, then the bridge projects every scene element so non-isolated elements hide. Id-keyed and kind-agnostic.',
    },
    examples: ['isolate this room', 'isolate the selection', 'isolate selected elements'],
  },
  {
    id: 'reveal-all',
    description: 'reveal everything hidden in this view and exit isolation (view-only state)',
    verbs: ['reveal', 'unhide', 'show', 'exit'],
    aliases: ['reveal all', 'exit isolation', 'show everything'],
    targets: 'global',
    parameters: [],
    scope: 'global',
    destructive: false,
    busCommand: null,
    localAction: 'applyVisibilityIntent',
    probe: { intent: 'reveal-all' },
    examples: ['reveal all', 'show everything', 'unhide everything', 'exit isolation'],
  },
  {
    id: 'visibility-query',
    // §GATE-QUERYENGINE-READ-ONLY — the FIRST read-only capability: it ANSWERS
    // from the injected ViewVisibilityIntentStore snapshot and mutates NOTHING
    // (localAction 'answer' dispatches no command; an unreadable snapshot is
    // answered as unreadable, never as "nothing is hidden").
    description: 'answer what is hidden or isolated in this view, and which levels exist',
    verbs: ['what', 'which', 'list'],
    aliases: ['hidden', 'visible', 'visibility', 'isolation mode'],
    targets: 'global',
    parameters: [],
    readOnly: true,
    scope: 'global',
    destructive: false,
    busCommand: null,
    localAction: 'answer',
    probe: { intent: 'visibility-query', topic: 'hidden' },
    examples: ['what is hidden', 'which elements are hidden in this view', 'what levels are visible'],
  },
  {
    id: 'property-query',
    // ⭐ §FEAT-RAC-PROPERTY-QUERY (L-2210) — the SECOND read-only capability, and
    // the half of the founder's ask that had no implementation at all:
    // *"All dims and properties of all elements should be QUERYABLE and
    // executable by RAC."*
    //
    // Before this row, EVERY property question ended at the generic miss string.
    // Measured 2026-08-21: `LocalNaturalLanguageResolver.ts:1428` turns every
    // interrogative into a miss BY DESIGN, `QueryEngine`'s six read-only blocks
    // (:416 :429 :448 :475 :506 :526) answer counts and lists and never a
    // property value, and `LlmPlanner`'s entire legal output space is
    // `allChatCapabilities()` — all executions. The one engine that CAN read the
    // model, `SemanticQueryEngine`, is imported by exactly one surface
    // (`apps/editor/src/ui/dataworkbench/NLQueryPanel.ts:165`) and the chat is
    // not it.
    //
    // ⛔ THE TARGETS ARE `set-height`'s, NOT THE FAMILY'S UNION, AND THAT IS
    // DELIBERATE. `probe` asks for the `height` row, and proof 1 asserts
    // `refusal ⟺ kind ∉ targets` FOR THE PROBE. Declaring the union would make
    // this capability claim `beam` (which `set-depth` serves and `set-height`
    // does not) and the probe would correctly refuse it — a declared target the
    // guard rejects, which is the ElementCapabilities lie. Per-row reach is
    // proven instead by `PROPERTY_QUERY_ROWS`, whose kinds are READ OFF the
    // mirrored capability at call time (`queryableKinds`), and asserted row by
    // row in `propertyQueryMirrorsExecute.test.ts`.
    description:
      'report a dimension or property of the selected element — height, width, thickness, sill height, depth, length, base offset, riser height, tread depth, overhang, mullion size, panel thickness, baluster spacing, baluster width, room height offset, roof pitch',
    verbs: ['what', 'how', 'tell', 'show'],
    aliases: ['how tall', 'how wide', 'how thick', 'how long', 'how deep'],
    targets: SET_HEIGHT_TARGETS,
    parameters: [],
    readOnly: true,
    scope: 'selection',
    destructive: false,
    busCommand: null,
    localAction: 'answer',
    probe: { intent: 'property-query', property: 'height' },
    commandProof: {
      // Proof 2 for a READ is not a command — it is the reader, and the thing
      // worth proving is that it reads the AUTHORITATIVE record rather than a
      // parallel copy. `initBusHandlers.ts:1160-1168` records what the parallel
      // copy costs: every `<family>.setMaterial` writes a fresh plugin DTO store
      // that nothing renders, exports or persists.
      file: 'apps/editor/src/ui/ai/chatPropertyReader.ts',
      mustMention: ['storeRegistry', 'getStoreForType', 'field'],
      note:
        'The editor bridge builds the reader from the SAME storeRegistry the fragment builders and the exporter resolve through, keyed by the SAME field name the matching write sets — so an answer is a claim about the record the user sees, never about the plugin DTO twin.',
    },
    // ⛔ WALL-ONLY, and NOT because the capability is. `examples` are executed by
    // `check-chat-capability-coverage` against the ONE selection the acceptance
    // family declares, so an example naming a window would be refused BY KIND in
    // a wall context and counted as a broken example — the harness measuring
    // itself. The family's real per-kind reach ("what is the sill height of this
    // window") is proven where a per-kind context exists, in propertyQuery.test.ts.
    examples: [
      'how tall is this wall',
      'how thick is the selected wall',
      'what is the base offset of this wall',
      'tell me the height of this wall',
    ],
  },
  {
    id: 'activate-placement',
    // §FEAT-CHAT-TOOL-ACTIVATION (L-906, founder-urgent) — "create a bed"
    // activates the SAME placement tool the Create palette button does, mouse
    // preview and all, for ALL placeable elements. Chat → TOOL ACTIVATION,
    // never chat → creation: nothing is created until the user clicks in the
    // canvas, so no position is ever guessed (C83 §4.3) and activation writes
    // no store — there is nothing to undo until the user places. The bridge
    // (`apps/editor/src/ui/ai/chatPlacementActivation.ts`) resolves the RAW
    // noun against the element-creation matrix + the furniture catalogue
    // through the ONE resolveCatalogueRef ladder (C69 — no hand-written
    // list); ambiguity ASKS naming candidates; a no-match names the nearest
    // real items instead of dead-ending.
    description:
      'start placing an element or furniture item — activates the same tool as the Create palette; you click in the canvas to place it',
    verbs: ['create', 'place', 'add', 'insert', 'draw', 'put'],
    aliases: ['placement', 'placement tool'],
    targets: 'global',
    parameters: [
      {
        name: 'item',
        description:
          'what to place — a creation tool (slab, wall, roof, …) from the element-creation matrix, or a furniture catalogue item (bed, sofa, wardrobe, …)',
        required: true,
        valueSource: 'user-text',
        example: 'bed',
      },
    ],
    scope: 'global',
    destructive: false,
    busCommand: null,
    localAction: 'activateTool',
    probe: { intent: 'activate-placement', itemRef: 'bed' },
    commandProof: {
      file: 'apps/editor/src/ui/ai/chatPlacementActivation.ts',
      mustMention: ['ELEMENT_CREATION_MATRIX', 'getCategories', 'resolveCatalogueRef'],
      note:
        'The editor bridge enumerates placeables LIVE from the element-creation matrix and the furniture catalogue and resolves through the one resolveCatalogueRef ladder — the two sources the L-906 ratified shape names; a kind added to either is automatically chat-reachable (proven by ChatPlacementActivation.spec.ts).',
    },
    examples: ['create a bed', 'place a sofa', 'create slab', 'add a wardrobe', 'put a table'],
  },
  {
    id: 'create-stair-shape',
    // §FEAT-RAC-STAIR-SHAPE (L-1541) — "create a stair in L shape".
    //
    // ⭐ THE SHAPE AXIS EXISTED AND WAS REACHABLE FROM THE PALETTE AND FROM
    // NOWHERE ELSE. C98 §16 made SHAPE its own declared axis on 2026-08-19
    // (`shapes: STAIR_SHAPES` on the matrix's `stair` row, separate from
    // `modes`), and the Create palette's four buttons call
    // `activateStairPathTool('I'|'L'|'U'|'C')`. The founder typed "create stair
    // in L shape aligned to the selected wall" and got a MISS, because the
    // placement grammar declines any sentence carrying a preposition and every
    // natural way of saying "L-shaped" carries one.
    //
    // Refusing it would have been C84 §4F.5's named WRONG-REFUSAL DEFECT CLASS —
    // a correct-looking refusal for a capability that EXISTS.
    //
    // Like `activate-placement` it ACTIVATES rather than creates: the shape is
    // published to the one `StairToolConfigStore` chokepoint (the same setter
    // `BimService.activateStairPathTool` calls) and the user's canvas click
    // places the stair, so no position is ever guessed (C83 §4.3) and there is
    // nothing to undo until they place.
    description:
      'start placing a stair of a named shape — straight, L-shape, U-shape or curved; activates the same tool as the Create palette\'s stair buttons and you draw it in the canvas',
    verbs: ['create', 'place', 'add', 'draw', 'build', 'make'],
    aliases: ['l-shape', 'u-shape', 'straight', 'curved', 'quarter turn', 'half turn', 'dog leg'],
    targets: 'global',
    parameters: [
      {
        name: 'shape',
        description:
          'the stair shape — I/straight, L/quarter-turn, U/half-turn or C/curved; read from STAIR_SHAPES (@pryzm/geometry-stair), the same catalogue the palette and the shape picker render',
        required: true,
        // ⚠ `user-text` and NOT a new value source. `stair-types` is a
        // CONSTRUCTION catalogue (monolithic concrete, steel open riser …), a
        // different axis entirely, and C98 §16.1.a forbids expressing one axis
        // in the other's control. Minting a `stair-shapes` source would also
        // have tripped gate 31 check 5, whose KNOWN_VALUE_SOURCES list is
        // already out of step with the registry (it omits `stair-types` and
        // `handrail-types`) — a gap this lane records rather than widens.
        valueSource: 'user-text',
        example: 'L shape',
      },
    ],
    scope: 'global',
    destructive: false,
    busCommand: null,
    localAction: 'activateTool',
    probe: { intent: 'create-stair-shape', shape: 'L' },
    commandProof: {
      file: 'apps/editor/src/ui/ai/chatPlacementActivation.ts',
      mustMention: ['setStairToolConfig', 'STAIR_SHAPES', 'ELEMENT_CREATION_MATRIX'],
      note:
        'The editor bridge publishes the shape to StairToolConfigStore — the single chokepoint BimService.activateStairPathTool itself writes, whose comment states it exists "so the plan tool, the 3D sketch tool and any batch/AI path all author from the SAME resolved config (P2)" — and then activates the stair tool through the same ELEMENT_CREATION_MATRIX route every other placement uses. The shape labels are read from STAIR_SHAPES, never transcribed.',
    },
    examples: [
      'create a stair in L shape',
      'create a stair in U shape',
      'create an L-shaped stair',
      'add a straight stair',
      'create a curved stair',
    ],
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
    targets: SET_HEIGHT_TARGETS,
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
    // §FEAT-DOOR-SILL-DECLARED (2026-08-17, founder ask: "batch change dimensions of
    // all windows AND DOORS — width, height and sill height").
    //
    // 'door' was ABSENT here, and the gap was a DECLARATION gap, never a modelling
    // one. MEASURED before adding it, because a capability that claims a write it
    // cannot perform is the defect this registry exists to prevent:
    //   · `DoorData.sillHeight` is a REQUIRED nonnegative field (DoorTypes.ts:52) —
    //     it is the threshold step, not a window-only concept;
    //   · `DoorBuilder` READS it — `elevation + door.sillHeight + door.height / 2`
    //     (DoorBuilder.ts:498), so a write moves real geometry;
    //   · the door property panel already edits it (DoorSection.ts, range 0–0.5 m);
    //   · the WRITE PATH through this capability's own `element.updateParameters`
    //     is already live and exercised: `UpdateElementParameterCommand.applyUpdate`
    //     :487-492 routes 'door' to `store.updateDoor()` + `doorStore.update()`,
    //     passing parameters through generically exactly as the 'window' arm does;
    //   · and `WallStore`'s own header names `door.setSillHeight` among the paths
    //     BIM 2.0 certification MEASURED (the `_renderVersion` +2-per-undo finding).
    //
    // So the one-element form already worked at the store; only this line refused
    // it. The bulk form may never out-claim the single form (SINGLE_FORM_CAPABILITY
    // in DimensionFamilies.ts), which is why `set-door-dimensions` could not carry
    // sillHeight while this read `['window']` — the batch was correctly refusing on
    // a declaration, and correctly said so instead of inventing "a door has no sill".
    targets: ['window', 'door'],
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
    id: 'set-post-spacing',
    // §CW90 item 5 — the vertical-mullion (post) pitch. ⛔ NOT
    // element.updateParameters: that command skips explicit-undefined
    // parameters and cannot clear `gridSystem`, which CurtainWallBuilder
    // prefers over the spacing (`cw.gridSystem ?? migrateToGridSystem`). The
    // route is wall.updateCurtainWall → UpdateCurtainWallCommand, whose merge
    // clears gridSystem WITH the spacing — the type-change mechanism — so the
    // write is live on grid-edited walls too.
    description: 'change the curtain-wall post spacing (vertical mullion pitch)',
    verbs: ['set', 'change'],
    aliases: ['post spacing', 'grid x spacing', 'vertical mullion spacing', 'bay width', 'u spacing'],
    refusalLabel: 'post spacing',
    targets: ['curtain-wall'],
    parameters: [
      {
        name: 'gridXSpacing',
        description: 'the new post (vertical mullion) spacing',
        required: true,
        valueSource: 'measurement',
        example: '1.5m',
      },
    ],
    scope: 'selection',
    destructive: false,
    busCommand: 'wall.updateCurtainWall',
    probe: { intent: 'set-post-spacing', value: 1.5 },
    commandProof: [
      {
        file: 'packages/command-registry/src/curtainwall/UpdateCurtainWallCommand.ts',
        mustMention: ['curtainWallStore', 'updates'],
        note: 'The wall.updateCurtainWall bridge (initBusHandlers §FIX-CW-UPDATE-REACH-RECORD) dispatches UpdateCurtainWallCommand, the only writer of the geometry curtainWallStore on an update; its merge overwrites gridSystem to undefined alongside gridXSpacing, and undo restores the full pre-mutation snapshot via store.set().',
      },
      {
        file: 'packages/geometry-curtain-wall/src/CurtainGridSystem.ts',
        mustMention: ['gridXSpacing'],
        note: 'The READ half: with gridSystem cleared, migrateToGridSystem divides the run by gridXSpacing to mint the uLines — the posts really move.',
      },
    ],
    examples: [
      'set the post spacing to 1.5m',
      'change the post spacing to 1200mm',
      'set the curtain wall bay width to 1m',
    ],
  },
  {
    id: 'set-transom-spacing',
    // §CW90 item 5 — the horizontal (transom) course. Same route and same
    // gridSystem clearing as set-post-spacing.
    description: 'change the curtain-wall transom spacing (horizontal course)',
    verbs: ['set', 'change'],
    aliases: ['transom spacing', 'grid y spacing', 'horizontal mullion spacing', 'bay height', 'v spacing', 'transom course'],
    refusalLabel: 'transom spacing',
    targets: ['curtain-wall'],
    parameters: [
      {
        name: 'gridYSpacing',
        description: 'the new transom (horizontal course) spacing',
        required: true,
        valueSource: 'measurement',
        example: '1.2m',
      },
    ],
    scope: 'selection',
    destructive: false,
    busCommand: 'wall.updateCurtainWall',
    probe: { intent: 'set-transom-spacing', value: 1.2 },
    commandProof: [
      {
        file: 'packages/command-registry/src/curtainwall/UpdateCurtainWallCommand.ts',
        mustMention: ['curtainWallStore', 'updates'],
        note: 'Same writer and same snapshot undo as set-post-spacing; gridSystem is cleared with gridYSpacing in the one merge.',
      },
      {
        file: 'packages/geometry-curtain-wall/src/CurtainGridSystem.ts',
        mustMention: ['gridYSpacing'],
        note: 'The READ half: migrateToGridSystem divides the height by gridYSpacing to mint the vLines — the transoms really move.',
      },
    ],
    examples: [
      'set the transom spacing to 1.2m',
      'change the transom spacing to 900mm',
      'set the curtain wall bay height to 1.5m',
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
        // §FIX-CAPABILITY-PROOF-PATH (RAC1, 2026-08-19) — this read
        // `packages/geometry-stair/...`, A FILE THAT DOES NOT EXIST, and gate 31
        // check 2 had been RED on it: "commandProof.file ... does not exist".
        // The builder is and always was in `geometry-handrail`. ⭐ A capability
        // table that cites a path nobody can open is the ElementCapabilities lie
        // in miniature — the note below was TRUE about the code and FALSE about
        // where to find it, which is the harder half to notice.
        file: 'packages/geometry-handrail/src/HandrailFragmentBuilder.ts',
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
        // §FIX-CAPABILITY-PROOF-PATH (RAC1, 2026-08-19) — this read
        // `packages/geometry-stair/...`, A FILE THAT DOES NOT EXIST, and gate 31
        // check 2 had been RED on it: "commandProof.file ... does not exist".
        // The builder is and always was in `geometry-handrail`. ⭐ A capability
        // table that cites a path nobody can open is the ElementCapabilities lie
        // in miniature — the note below was TRUE about the code and FALSE about
        // where to find it, which is the harder half to notice.
        file: 'packages/geometry-handrail/src/HandrailFragmentBuilder.ts',
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

  // ── ⭐ §FEAT-WINDOW-REVEAL-RAC (L-3202 … L-3204) — THE WINDOW REVEAL ────────
  //
  // The founder was told the reveal fields are "not reachable by RAC at all".
  // They were panel-only: `WindowSection` dispatches `UpdateWindowParameterCommand`
  // through the commandManager directly, and NO bus command reaches that class —
  // so there was no route for a sentence to take.
  //
  // These five ride `element.updateParameters`, and they may do so only because
  // that carrier was repaired first (L-3200 / L-3202, commit 0fb1e9f9): it now
  // READS BACK what landed instead of returning success off a void, and it now
  // carries the C83 IMPOSSIBLE gate that previously lived only in the panel's
  // command. Declaring these before that fix would have advertised a route which
  // could store a zero-glazing window and call it done.
  //
  // The shared WRITE proof for all five. It is quoted once per entry because
  // `proveCommandTargets` reads it per capability, but it is one claim: the
  // reveal fields are on `WindowOpeningSchema`, `windowStore.update` merges and
  // re-parses them, and `WindowRevealLeaf` builds from them.
  /**
   * ⭐ §FEAT-REVEAL-DIRECTION-RAC (L-3414, founder 2026-08-22) — WHICH FACE the whole
   * reveal runs from, and the FIRST capability in this registry whose value is a WORD.
   *
   * ⛔ IT GOVERNS THE PROJECTION AND THE SPLAY AS ONE. `WindowReveal` resolves the
   * direction to a single sign that every z-expression multiplies by, so a chat user
   * cannot end up with the box on one face and the splay on the other. ADR-0342's
   * one-reveal rule is kept by the MODEL, not by this description.
   *
   * ⚠ `valueSource: 'enumeration'` and the probe carries a STRING. The unit converter is
   * length-only — `toMeters('outdoor', undefined)` is NaN — so the vocabulary declares
   * `measure: 'enum'` and `applyPropertyIntent` returns from its enum arm before any
   * numeric stage. §L-3203 is the recorded cost of getting that wrong in the other
   * direction (a unitless 20 read as twenty METRES).
   */
  {
    id: 'set-reveal-direction',
    description: 'choose whether the window reveal runs from the outdoor or the indoor face',
    verbs: ['set', 'change', 'make'],
    aliases: ['reveal direction', 'reveal side', 'reveal face'],
    refusalLabel: 'reveal direction',
    targets: ['window'],
    parameters: [
      {
        name: 'revealDirection',
        description:
          'which wall face the reveal runs from — outdoor or indoor. Governs the projecting box AND the splay together, because they are one reveal.',
        required: true,
        valueSource: 'enumeration',
        example: 'outdoor',
      },
    ],
    scope: 'selection',
    destructive: false,
    busCommand: 'element.updateParameters',
    probe: { intent: 'set-reveal-direction', value: 'outdoor' },
    commandProof: [
      {
        file: UPDATE_ELEMENT_PARAMETER_FILE,
        mustMention: ['window', 'windowStore.update'],
        note: 'WRITE half: applyUpdate routes window to windowStore.update, which merges and re-parses through WindowOpeningSchema — which declares revealDirection, so Zod keeps it rather than stripping it.',
      },
      {
        file: 'packages/geometry-window/src/WindowReveal.ts',
        mustMention: ['revealDirection', 'outwardSign'],
        note: 'GEOMETRY half: resolveWindowReveal reads the field on every call and turns it into the ONE sign every z-expression is multiplied by. WindowRevealLeaf.test.ts asserts the built BufferGeometry moves to the other face for the box AND the splay plate.',
      },
    ],
    examples: [
      'set the reveal direction to outdoor',
      'change the reveal direction to indoor',
      'set the reveal side to outside',
    ],
  },

  {
    id: 'set-reveal-projection',
    description: 'push the window face proud of the wall, or recess it',
    verbs: ['set', 'change', 'make'],
    aliases: ['reveal projection', 'projection', 'reveal depth', 'reveal offset'],
    refusalLabel: 'reveal projection',
    targets: ['window'],
    parameters: [
      {
        name: 'revealProjection',
        description:
          'how far the window face sits beyond the exterior wall face — SIGNED: negative recesses it into a deep-set reveal',
        required: true,
        valueSource: 'measurement',
        example: '100mm',
      },
    ],
    scope: 'selection',
    destructive: false,
    busCommand: 'element.updateParameters',
    probe: { intent: 'set-reveal-projection', value: 0.1 },
    commandProof: [
      {
        file: UPDATE_ELEMENT_PARAMETER_FILE,
        mustMention: ['window', 'windowStore.update'],
        note: 'WRITE half: applyUpdate routes window to windowStore.update, which merges and re-parses through WindowOpeningSchema. The command now reads the record back and refuses when a field did not land (§PARAM-DROP-IS-A-REFUSAL), and it consults the C83 reveal gate before writing.',
      },
      {
        file: 'packages/geometry-window/src/WindowReveal.ts',
        mustMention: ['revealProjection', 'isRevealAuthored'],
        note: 'READ half: resolveWindowReveal consumes revealProjection and isRevealAuthored keys the whole feature on it — the check the beam-height lie failed. WindowRevealLeaf builds the projecting box from the result.',
      },
    ],
    examples: [
      'set the reveal projection to 100mm',
      'change the reveal projection to -50mm',
      'set the window projection to 0.12m',
    ],
  },
  {
    id: 'set-reveal-splay',
    description: 'splay all four sides of the window reveal',
    verbs: ['set', 'change', 'make'],
    aliases: ['reveal splay', 'splay', 'splay angle'],
    refusalLabel: 'reveal splay',
    targets: ['window'],
    parameters: [
      {
        name: 'revealSplay',
        description: 'the splay angle applied to head, sill and both jambs at once',
        required: true,
        valueSource: 'measurement',
        example: '15 degrees',
      },
    ],
    scope: 'selection',
    destructive: false,
    busCommand: 'element.updateParameters',
    probe: { intent: 'set-reveal-splay', value: 15 },
    commandProof: [
      {
        file: UPDATE_ELEMENT_PARAMETER_FILE,
        mustMention: ['window', 'checkWindowRevealAuthorability'],
        note: 'WRITE half plus the refusal: all four splay fields arrive in ONE parameter set (one command, one undo step, matching the panel\'s "Splay all sides"), and checkWindowRevealAuthorability asks the C83 gate about the MERGED record before anything is written.',
      },
      {
        file: 'packages/geometry-window/src/WindowReveal.ts',
        mustMention: ['revealSplayHead', 'revealSplayJambLeft'],
        note: 'READ half: the splay fields drive the wedge geometry and the glazing-area computation windowRevealRefusal refuses on.',
      },
    ],
    examples: [
      'set the reveal splay to 15 degrees',
      'change the splay to 20',
      'set the reveal splay to 0',
    ],
  },
  {
    id: 'set-reveal-splay-head',
    description: 'splay the head of the window reveal',
    verbs: ['set', 'change', 'make'],
    aliases: ['head splay', 'splay head', 'reveal splay head'],
    refusalLabel: 'head splay',
    targets: ['window'],
    parameters: [
      {
        name: 'revealSplayHead',
        description: 'the splay angle at the top of the opening',
        required: true,
        valueSource: 'measurement',
        example: '20 degrees',
      },
    ],
    scope: 'selection',
    destructive: false,
    busCommand: 'element.updateParameters',
    probe: { intent: 'set-reveal-splay-head', value: 20 },
    commandProof: [
      {
        file: UPDATE_ELEMENT_PARAMETER_FILE,
        mustMention: ['window', 'windowStore.update'],
        note: 'WRITE half: the single field reaches windowStore.update and is read back before success is reported.',
      },
      {
        file: 'packages/geometry-window/src/WindowReveal.ts',
        mustMention: ['revealSplayHead'],
        note: 'READ half: the head splay is one of the four sides resolveWindowReveal builds a wedge for.',
      },
    ],
    examples: [
      'set the head splay to 20 degrees',
      'change the reveal splay head to 10',
    ],
  },
  {
    id: 'set-reveal-splay-sill',
    description: 'splay the sill of the window reveal',
    verbs: ['set', 'change', 'make'],
    aliases: ['sill splay', 'splay sill', 'reveal splay sill'],
    refusalLabel: 'sill splay',
    targets: ['window'],
    parameters: [
      {
        name: 'revealSplaySill',
        description: 'the splay angle at the bottom of the opening',
        required: true,
        valueSource: 'measurement',
        example: '20 degrees',
      },
    ],
    scope: 'selection',
    destructive: false,
    busCommand: 'element.updateParameters',
    probe: { intent: 'set-reveal-splay-sill', value: 20 },
    commandProof: [
      {
        file: UPDATE_ELEMENT_PARAMETER_FILE,
        mustMention: ['window', 'windowStore.update'],
        note: 'WRITE half: the single field reaches windowStore.update and is read back before success is reported.',
      },
      {
        file: 'packages/geometry-window/src/WindowReveal.ts',
        mustMention: ['revealSplaySill'],
        note: 'READ half: the sill splay is one of the four sides resolveWindowReveal builds a wedge for.',
      },
    ],
    examples: [
      'set the sill splay to 20 degrees',
      'change the reveal splay sill to 10',
    ],
  },
  {
    id: 'set-reveal-splay-jambs',
    // ⚠ BOTH jambs, together. The asymmetric ask ("splay the left jamb and leave
    // the right") is a real detail and NO capability reaches it — recorded at
    // L-3204 rather than implied by an alias that would then disappoint.
    description: 'splay both jambs of the window reveal',
    verbs: ['set', 'change', 'make'],
    aliases: ['jamb splay', 'splay jambs', 'side splay'],
    refusalLabel: 'jamb splay',
    targets: ['window'],
    parameters: [
      {
        name: 'revealSplayJambs',
        description: 'the splay angle applied to BOTH jambs',
        required: true,
        valueSource: 'measurement',
        example: '20 degrees',
      },
    ],
    scope: 'selection',
    destructive: false,
    busCommand: 'element.updateParameters',
    probe: { intent: 'set-reveal-splay-jambs', value: 20 },
    commandProof: [
      {
        file: UPDATE_ELEMENT_PARAMETER_FILE,
        mustMention: ['window', 'checkWindowRevealAuthorability'],
        note: 'WRITE half plus the refusal: both jamb fields arrive in one parameter set, and the C83 gate is asked about the merged record — two jambs that meet leave zero glazing, which is exactly the case this capability makes easiest to ask for.',
      },
      {
        file: 'packages/geometry-window/src/WindowReveal.ts',
        mustMention: ['revealSplayJambLeft', 'revealSplayJambRight'],
        note: 'READ half: both jamb splays drive their wedges and the glazing-width computation the refusal is derived from.',
      },
    ],
    examples: [
      'set the jamb splay to 20 degrees',
      'change the splay jambs to 15',
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
    // §FIX-UNDECLARED-SPATIAL-REACH (L-1142, 2026-08-19) — this entry declared
    // NO scopeModes at all, so it silently defaulted to ['all'] while the arm
    // honoured selection, level, room AND orientation. The founder's
    // "BY LEVEL, BY ROOM" already worked here and the registry denied it.
    scopeModes: ['all', 'selection', 'level', 'room', 'orientation'],
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
    // refuses (curved / layered — §RAKE-HOSTED-OPENING removed the third,
    // opening-hosting, on 2026-08-18). "Raked N of M — K skipped: <reason>"
    // is the honest report shape.
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
    // §FIX-UNDECLARED-SPATIAL-REACH (L-1142, 2026-08-19) — the modes the arm
    // ALREADY honoured, now declared. See the note on DELETE_FAMILY_CAPABILITIES.
    // §FIX-UNDECLARED-SPATIAL-REACH (L-1142, 2026-08-19) — ⚠ AND THE ONE THAT
    // WAS ROLLED BACK, RECORDED RATHER THAN QUIETLY DROPPED. This lane
    // declared 'room' and 'orientation' here alongside the other eight
    // capabilities, on the strength of the gate's ARM-reach listing. Gate 31's
    // SYMMETRIC arm immediately refused it: "declares scope mode 'room' but the
    // resolver received a 'level' descriptor" — twice. ⭐ THE GATE CAUGHT AN
    // OVER-CLAIM IN THE ACT, which is exactly the ElementCapabilities lie it
    // exists to prevent, and the reading that suggested it was ARM reach, not
    // LANGUAGE reach — two different facts the gate's own header separates.
    // The window-creation grammar resolves a LEVEL descriptor for every spatial
    // phrase, so 'room' and 'orientation' would have been a promise the
    // resolver silently widens. They stay UNDECLARED until the grammar honours
    // them (C68 §7.d: a missing resolver must refuse, never widen to 'all').
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
    id: 'set-wall-side-finish',
    // §FEAT-WALL-SIDE-FINISH — the founder's "change / make all walls in room X
    // finish wall Y" and "make all inner finishes walls in ground floor to X".
    //
    // SIBLING of add-wall-layer, not a replacement. That one ADDS a construction
    // layer and therefore MOVES wall.thickness (§03-WALL-THICKNESS-CONTRACT §1);
    // this one changes appearance only and never moves the wall. Both are
    // correct for their own ask, and they share ONE finish table (finishRef.ts).
    //
    // The side is the SEMANTIC side — the axis WallLayerFunction already
    // declares ('finish-interior' / 'finish-exterior') — never the geometric
    // frontSide/backSide, which have zero writers repo-wide. A ROOM scope
    // against a PARTITION (both faces interior) refuses by name rather than
    // guessing which face looks into the named room.
    description: 'change the finish material on one side of walls',
    verbs: ['make', 'change', 'set', 'finish'],
    aliases: ['wall finish', 'inner finish', 'outer finish', 'interior finish', 'exterior finish'],
    refusalLabel: 'wall side finish',
    targets: ['wall'],
    parameters: [
      {
        name: 'finish',
        description: 'the finish, by name (plaster, limewash, microcement, …)',
        required: true,
        valueSource: 'finish',
        example: 'plaster',
      },
      {
        name: 'side',
        // §RACSIDE144 — "inner and outer" / "both sides" / "both faces" change
        // BOTH faces in ONE undo entry. The bare-form default is scope-
        // dependent: exterior for a compass-scoped ask ("west-facing walls"
        // has no interior side to default to), interior everywhere else.
        description: 'inner, outer, or both faces (default depends on scope — see the capability note)',
        required: false,
        valueSource: 'user-text',
        example: 'inner finishes',
      },
    ],
    scope: 'all',
    // §FIX-UNDECLARED-SPATIAL-REACH (L-1142, 2026-08-19) — the modes the arm
    // ALREADY honoured, now declared. See the note on DELETE_FAMILY_CAPABILITIES.
    // §RACWALL128 — 'orientation' ADDED, mirroring every other wall/window
    // capability's scopeModes (e.g. line 2025): "all east-facing walls" is the
    // same compass axis those already declare, and `CapabilityExecutionSpec`'s
    // `spatialKinds` was the only place still refusing it for this capability.
    scopeModes: ['all', 'selection', 'level', 'room', 'orientation'],
    destructive: false,
    busCommand: 'wall.setSideFinishBatch',
    // scope:'selection' deliberately — the anti-ElementCapabilities guard probes
    // by SELECTING each kind, and an 'all' probe never reaches the selection
    // gate, so it would 'accept' all sixteen kinds and declare a lie.
    // §RACSIDE144 made `sideExplicit` REQUIRED on WallSideFinishIntent — the probe
    // must state it too. `true` here because this probe NAMES a side ('interior'),
    // which is exactly what the flag records: the side was chosen, not defaulted.
    probe: { intent: 'set-wall-side-finish', side: 'interior', sideExplicit: true, finishRef: 'plaster', scope: 'selection' },
    commandProof: {
      file: 'packages/command-registry/src/walls/SetWallSideFinishCommand.ts',
      mustMention: ['wallStore', 'withWallSideFinish'],
      note: "_resolveWallIds reads ctx.stores.wallStore and nothing else, so the command's reachable set is walls only; per wall it writes WallData.sideFinishes through the geometry store (fragment rebuild), composing the next value with withWallSideFinish so the untouched side is copied BY VALUE and the two sides can never collapse into one shared field.",
    },
    examples: [
      'make all inner finishes walls on the ground floor to plaster',
      'change all walls in the kitchen finish limewash',
      'change all outer finishes walls to clay plaster',
      'change all east-facing walls exterior finish to clay plaster',
      // §RACSIDE144 — the founder's actual complaint: "I want to also change
      // the INTERIOR wall finish, but this still would only change the outer
      // finish." Both sides, one undo entry.
      'change outside and inside finish of all west-facing walls to green pastel paint',
      'make all walls white paint',
    ],
  },
  {
    id: 'set-floor-finish',
    // §FEAT-FLOOR-SURFACE-FINISH (L-1881) — the founder's "finish to wooden
    // parquet" (2026-08-21), which the product answered *"Floor surface finish
    // isn't connected to chat yet. I can change floor level."*
    //
    // That refusal was HONEST — `floor.setMaterial` is a DECLARED DEAD VERB
    // (`plugins/floor/src/handlers/SetFloorMaterial.ts` refuses at `canExecute`:
    // it writes a detached plugin DTO store nothing renders, exports or
    // persists). So the capability had to be BUILT, not merely published, and it
    // rides a NEW verb — `floor.setFinishBatch` → SetFloorFinishBatchCommand →
    // the geometry `FloorStore` — rather than resurrecting the dead one.
    //
    // ⚠ WHAT THIS CAPABILITY CAN AND CANNOT SHOW, measured 2026-08-21 and stated
    // in the command's own success sentence rather than hidden here:
    // `FloorPanelBuilder` calls `applyMaterialMaps` NOWHERE (the slab, roof, wall
    // and curtain-wall builders all do), so a floor renders its material's flat
    // COLOUR plus the plank/tile grid overlay — never the material's texture
    // maps. Both of the maps sources are separately dark as well: runtime
    // procedural generation defaults OFF (§PROCEDURAL-COST L-1820) and
    // `public/items/textures/` does not exist, so the 16 file-backed rows 404.
    // The capability is real and visible; the photographic pattern is not part of
    // what it delivers, and saying so is the L-960 rule.
    description: 'change the surface finish material of floor finishes',
    verbs: ['make', 'change', 'set', 'finish', 'lay'],
    aliases: ['floor finish', 'floor material', 'flooring', 'parquet', 'floor covering'],
    refusalLabel: 'floor finish',
    targets: ['floor'],
    parameters: [
      {
        name: 'finish',
        description: 'the finish, by name (oak chevron, walnut herringbone, marble …)',
        required: true,
        valueSource: 'finish',
        example: 'oak chevron',
      },
    ],
    scope: 'all',
    scopeModes: ['all', 'selection', 'level', 'room'],
    destructive: false,
    busCommand: 'floor.setFinishBatch',
    // scope:'selection' deliberately — the anti-ElementCapabilities guard probes
    // by SELECTING each kind, and an 'all' probe never reaches the selection
    // gate, so it would 'accept' every kind and declare a lie.
    probe: { intent: 'set-floor-finish', finishRef: 'oak chevron', scope: 'selection' },
    commandProof: {
      file: 'packages/command-registry/src/floors/SetFloorFinishCommand.ts',
      mustMention: ['floorStore', 'floorCarriesFinish'],
      note: "_resolveFloorIds reads ctx.stores.floorStore and nothing else, so the command's reachable set is floor finishes only; per floor it writes materialId AND finishSpec through the geometry FloorStore (which emits bim-floor-updated and rebuilds the panel), then RE-READS the record and asks floorCarriesFinish whether the value really landed — the count is records, never successful calls.",
    },
    examples: [
      'make all floors oak chevron',
      'make the living room floor walnut herringbone',
      // ⚠ NOT "to marble" (L-1889). It read fine and the coverage gate caught it:
      // `check-chat-capability-coverage` proved the example REFUSED in its own
      // acceptance context, because "marble" names FIVE master rows and an
      // ambiguity is a question, never a pick. An example that does not work is a
      // lie shipped in the UI copy — the refusal OFFERS these strings to the user.
      'set all floors on level 2 to walnut herringbone',
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
    // §FIX-UNDECLARED-SPATIAL-REACH (L-1142, 2026-08-19) — the modes the arm
    // ALREADY honoured, now declared. See the note on DELETE_FAMILY_CAPABILITIES.
    scopeModes: ['all', 'selection', 'level', 'room', 'orientation'],
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
    // §FIX-UNDECLARED-SPATIAL-REACH (L-1142, 2026-08-19) — the modes the arm
    // ALREADY honoured, now declared. See the note on DELETE_FAMILY_CAPABILITIES.
    scopeModes: ['all', 'selection', 'level', 'room', 'orientation'],
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
    // §FIX-UNDECLARED-SPATIAL-REACH (L-1142, 2026-08-19) — the modes the arm
    // ALREADY honoured, now declared. See the note on DELETE_FAMILY_CAPABILITIES.
    scopeModes: ['all', 'selection', 'level', 'room', 'orientation'],
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
    id: 'set-window-shape',
    // ⭐⭐ §CHAT-OPENING-SHAPE (L-10945) — THE FOUNDER'S REFUSAL, CLOSED.
    //
    // He typed "change all windows to segmental type" and was told *"There is no
    // window type called 'segmental type' in this project"*. There is not, and
    // there never will be: "segmental" is not a TYPE, it is an opening PROFILE.
    // The profile axis has been complete since L-1200/L-1250 — four values,
    // family-aware, cut by WallHoleBodyBuilder, framed by
    // OpeningProfileFrameGeometry, on both mode bars — and EDITABLE on an
    // already-placed opening since L-1252. The capability existed; only the
    // vocabulary was missing, so an entire axis was invisible to a sentence.
    //
    // Rides element.updateOpeningProfileBatch → UpdateOpeningProfileBatchCommand,
    // which composes the LIVE UpdateWindowParameterCommand — the only route that
    // carries a profile all the way to `wall.openings[]`, the record every
    // wall-body arm consumes. A write that stopped at the windowStore would leave
    // the wall cutting a rectangle under a curved frame (C86 §11 #1).
    description: 'change the shape of a window opening (rectangular / arched / segmental / circular)',
    verbs: ['change', 'set', 'convert', 'swap', 'make', 'turn', 'reshape'],
    aliases: ['window shape', 'opening shape', 'opening profile', 'window head'],
    refusalLabel: 'opening shape',
    targets: ['window'],
    parameters: [
      {
        name: 'shape',
        description: 'the opening shape: Rectangular, Arched, Segmental or Circular',
        required: true,
        valueSource: 'opening-shapes',
        example: 'segmental',
      },
    ],
    scope: 'all',
    // ⭐ ORIENTATION IS DECLARED, and it is real: §CHAT-ORIENTATION-HOSTED-OPENINGS
    // (L-10946) teaches the scope resolver to answer "the south facade" with the
    // OPENINGS hosted in the south-facing walls. Declaring it without that hop
    // would have meant reshaping WALL ids — reach that exists only as a defect
    // (C68 §6.3-G3), which is why DimensionFamilies declares only level+room.
    scopeModes: ['all', 'selection', 'level', 'room', 'orientation'],
    destructive: false,
    busCommand: 'element.updateOpeningProfileBatch',
    probe: { intent: 'set-window-shape', shapeRef: 'segmental', scope: 'selection' },
    commandProof: [
      {
        file: 'plugins/view/src/handlers/UpdateOpeningProfileBatch.ts',
        mustMention: ['element.updateOpeningProfileBatch', 'commandManager', 'affectedStores: [] as const'],
        note: 'The LIVE route: a legacy bridge (commandManager + empty affectedStores — undo lives on the legacy stack) forwarding to UpdateOpeningProfileBatchCommand, so N reshapes are ONE undo entry instead of N.',
      },
      {
        file: 'packages/command-registry/src/generic/UpdateOpeningProfileBatchCommand.ts',
        mustMention: ['UpdateWindowParameterCommand', 'UpdateDoorParameterCommand', 'skipped'],
        note: 'Composes the live single-opening route rather than re-implementing it: that command carries the updateOpening hop to wall.openings[], the circular box-squaring (width IS the diameter, PR-8) and openingProfileRefusal — the ONE gate the builders obey.',
      },
    ],
    examples: [
      'change all windows to segmental',
      'change all windows to arched',
      'make all windows circular',
      'change all windows on level 2 to segmental',
    ],
  },
  {
    id: 'set-door-shape',
    // §CHAT-OPENING-SHAPE (L-10945) — the door half. Same table, same generated
    // spec, same bus verb.
    //
    // ⛔ A DOOR MAY NOT BE CIRCULAR (§OPENING-PROFILE-BY-FAMILY, L-1251), and the
    // reason is GEOMETRY rather than taste: a door reaches the floor, so its
    // opening is a NOTCH in the wall's outer profile rather than a closed hole,
    // and a circle has no jamb feet for the notch walk to traverse. The value
    // stage refuses it BY NAME with that rule and the three legal alternatives —
    // never a silent drop. `targets` is doors only, so the claim surface matches.
    description: 'change the shape of a door opening (rectangular / arched / segmental)',
    verbs: ['change', 'set', 'convert', 'swap', 'make', 'turn', 'reshape'],
    aliases: ['door shape', 'door head', 'doorway shape'],
    refusalLabel: 'opening shape',
    targets: ['door'],
    parameters: [
      {
        name: 'shape',
        description: 'the opening shape: Rectangular, Arched or Segmental (a door cannot be circular)',
        required: true,
        valueSource: 'opening-shapes',
        example: 'arched',
      },
    ],
    scope: 'all',
    scopeModes: ['all', 'selection', 'level', 'room', 'orientation'],
    destructive: false,
    busCommand: 'element.updateOpeningProfileBatch',
    probe: { intent: 'set-door-shape', shapeRef: 'arched', scope: 'selection' },
    commandProof: [
      {
        file: 'plugins/view/src/handlers/UpdateOpeningProfileBatch.ts',
        mustMention: ['element.updateOpeningProfileBatch', 'commandManager', 'affectedStores: [] as const'],
        note: 'Same LIVE bridge as set-window-shape; the family is a payload field, not a second verb.',
      },
      {
        file: 'packages/command-registry/src/generic/UpdateOpeningProfileBatchCommand.ts',
        mustMention: ['UpdateDoorParameterCommand', 'openingProfilesFor', 'notch'],
        note: 'The family gate is checked in canExecute AND execute — a validator that lives in one of two callers is a validator that will be bypassed. openingProfilesFor is the geometry-wall table itself, never a transcription.',
      },
    ],
    examples: [
      'change all doors to arched',
      'change all doors to segmental',
      'make all doors rectangular',
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
    // §FIX-UNDECLARED-SPATIAL-REACH (L-1142, 2026-08-19) — the modes the arm
    // ALREADY honoured, now declared. See the note on DELETE_FAMILY_CAPABILITIES.
    scopeModes: ['all', 'selection', 'level', 'room', 'orientation'],
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
    // §FIX-UNDECLARED-SPATIAL-REACH (L-1142, 2026-08-19) — the modes the arm
    // ALREADY honoured, now declared. See the note on DELETE_FAMILY_CAPABILITIES.
    scopeModes: ['all', 'selection', 'level', 'room', 'orientation'],
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
  // ─── §FEAT-CHAT-STAIR-TYPES (L-1441) — the founder's two stair sentences ───
  //
  // ⭐ THE RAILING ENTRY IS DECLARED FIRST for the same reason its table row is:
  // "stair railings" contains "stair", and the two sentences differ by one word.
  // See CatalogueFamilies.ts for the measurement and the second, order-independent
  // guard (`rejectRef`).
  //
  // ⚠ BOTH FAN OUT — `scopeModes` therefore omits nothing it cannot honour, but
  // the UNDO GRANULARITY is N steps rather than one, because neither route has a
  // batch twin. That is declared on `CatalogueFamily.fanOutPerId` and spoken by
  // `dispatchCommands`; it is a disclosed trade, not an omission.
  {
    id: 'set-stair-railing-type',
    description: 'change the stair railing type',
    verbs: ['change', 'set', 'convert', 'swap', 'make', 'turn'],
    aliases: ['stair railing', 'stair railing type', 'balustrade', 'railing type'],
    refusalLabel: 'stair railing type',
    targets: ['stair-railing'],
    parameters: [
      {
        name: 'type',
        description: 'the railing type, by catalogue name or id',
        required: true,
        valueSource: 'handrail-types',
        example: 'Frameless Glass Balustrade',
      },
    ],
    scope: 'all',
    scopeModes: ['all', 'selection', 'level', 'room'],
    destructive: false,
    busCommand: 'element.changeType',
    probe: { intent: 'set-stair-railing-type', typeRef: 'Frameless Glass Balustrade', scope: 'selection' },
    commandProof: {
      file: 'packages/command-registry/src/stair/UpdateStairRailingCommand.ts',
      mustMention: ['stairRailingStore', 'stair-railing'],
      note: "element.changeType's stair-railing branch resolves the catalogue definition through resolveStairRailingTypeFields (geometry-stair, the ONE projection the property panel also uses) and dispatches UpdateStairRailingCommand, whose affectedStores is ['stair-railing'] and whose writes go to ctx.stores.stairRailingStore — the geometry store StairRailingBuilder rebuilds from. The chat forwards ONE id and never re-derives the thirteen construction fields (C84 EI-4a/EI-9).",
    },
    examples: [
      'make all the stair railings frameless glass balustrade',
      'change all stair railings to stainless cable railing',
      'make the selected railings timber picket railing',
    ],
  },
  {
    id: 'set-stair-type',
    description: 'change the stair type',
    verbs: ['change', 'set', 'convert', 'swap', 'make', 'turn'],
    aliases: ['stair type', 'staircase type', 'stair construction'],
    refusalLabel: 'stair type',
    targets: ['stair'],
    parameters: [
      {
        name: 'type',
        description: 'the stair type, by catalogue name or id',
        required: true,
        valueSource: 'stair-types',
        example: 'Monolithic Concrete',
      },
    ],
    scope: 'all',
    scopeModes: ['all', 'selection', 'level', 'room'],
    destructive: false,
    busCommand: 'stair.updateParameters',
    probe: { intent: 'set-stair-type', typeRef: 'Monolithic Concrete', scope: 'selection' },
    commandProof: {
      file: 'packages/command-registry/src/stair/UpdateStairParametersCommand.ts',
      mustMention: ['stairId', 'typeId', 'stairTypeStore'],
      note: "The LIVE stair route, and the SAME one element.changeType's stair branch runs ('the SAME legacy command the plugin bridge already runs'): keyed by stairId, it writes updates.typeId onto the record, asks ctx.stores.stairTypeStore.resolveDefaults(typeId) for the type's parameter defaults, and typeId is in the command's GEOMETRY_KEYS so the flight geometry regenerates. Choosing this verb over the generic one is deliberate — it is the route set-riser-height / set-tread-depth / set-width already use, so the bulk and single asks cannot validate differently.",
    },
    examples: [
      'make all the stairs monolithic concrete',
      'change all stairs to steel open riser',
      'change the stair type to timber closed string',
    ],
  },
  // ─── §FEAT-CHAT-LIGHTING-TYPES (L-10220) — the founder's lighting sentence ───
  //
  //     "change all lightings in ground level to X"
  //
  // ⭐ A PUBLICATION, NOT AN IMPLEMENTATION. `CatalogueFamilies.ts`' own header
  // already said so: `element.changeType` has routed sixteen families with
  // ring-buffer undo parity since L-623, lighting among them, and the properties
  // panel has offered the type picker since §FEAT-ELEMENT-TYPE-PICKER-REGISTRY.
  // Only the CHAT had never been told. C84 EI-3 is directional — what the UI
  // offers, the pipeline must accept — and this row closes it in the cheap
  // direction.
  //
  // ⚠ FAN-OUT, like the stair pair: `element.changeType` is singular and there
  // is no `lighting.updateSystemTypeBatch`, so N fixtures are N undo steps.
  // `dispatchCommands` states that out loud ("undo with Ctrl+Z (N steps)"); it
  // is a disclosed trade carried on `CatalogueFamily.fanOutPerId`, not an
  // omission. The batch verb is the follow-up that upgrades N steps to one.
  {
    id: 'set-lighting-type',
    description: 'change the lighting fixture type',
    verbs: ['change', 'set', 'convert', 'swap', 'make', 'turn'],
    aliases: ['lighting type', 'light type', 'fixture type', 'luminaire'],
    refusalLabel: 'lighting type',
    targets: ['lighting'],
    parameters: [
      {
        name: 'type',
        description: 'the lighting fixture type, by catalogue name or id',
        required: true,
        valueSource: 'lighting-types',
        example: 'Recessed Downlight',
      },
    ],
    scope: 'all',
    // ⛔ NO 'orientation'. A luminaire has no facade, and the arm's orientation
    // descriptor answers with WALLS — see CatalogueFamilies.spatialKinds, which
    // makes the ARM refuse it too rather than leaving the declaration to police
    // a reach the code still had (C68 §6.3-G3).
    scopeModes: ['all', 'selection', 'level', 'room'],
    destructive: false,
    busCommand: 'element.changeType',
    probe: { intent: 'set-lighting-type', typeRef: 'Recessed Downlight', scope: 'selection' },
    commandProof: {
      file: 'packages/command-registry/src/lighting/UpdateLightingParametersCommand.ts',
      mustMention: ['lightingStore', 'fixtureType', 'lightingFragmentBuilder'],
      note: "element.changeType's lighting branch (initBusHandlers.ts) REFUSES any id getLightingTypeDefinition() does not know — the same BUILT_IN_LIGHTING_TYPES table this capability's valueSource resolves against, so a name the chat resolves is a name the branch accepts. It then dispatches UpdateLightingParametersCommand, whose affectedStores is ['lighting'], which writes ctx.stores.lightingStore and then calls lightingFragmentBuilder.update(record) explicitly, because a fixture's whole geometry switches on fixtureType. Keyed by elementId, so its reachable set is that one lighting element and nothing else. Pinned end-to-end by packages/command-registry/__tests__/lightingTypeSwap.test.ts.",
    },
    examples: [
      'change all lights to pendant',
      'change all lightings in ground level to recessed downlight',
      'make all the lights linear pendant',
      'change the lighting type to brass arc floor lamp',
    ],
  },
  // §CW90 item 5 — curtain-wall types over the SAME fan-out route as lighting.
  // The founder's type names are huge ("Point-Fixed Structural Glazing …"), so
  // resolution is the FUZZY resolveCatalogueRef ladder (bridge row) — a few
  // uniquely-matching words resolve, an ambiguous ref lists the candidates by
  // name (C72 §9), never a silent pick.
  {
    id: 'set-curtain-wall-type',
    description: 'change the curtain wall type',
    verbs: ['change', 'set', 'convert', 'swap', 'make', 'turn'],
    aliases: ['curtain wall type', 'curtainwall type', 'glazing type', 'facade type'],
    refusalLabel: 'curtain wall type',
    targets: ['curtain-wall'],
    parameters: [
      {
        name: 'type',
        description: 'the curtain wall type, by catalogue name, a uniquely-matching few words of it, or id',
        required: true,
        valueSource: 'curtain-wall-types',
        example: 'Structural Glazing',
      },
    ],
    scope: 'all',
    // ⛔ NO 'orientation' (the descriptor answers with WALLS — same reasoning
    // as set-lighting-type) and NO 'room' yet: room membership for curtain
    // walls landed with §CW90 items 4+9 and the room scope arm is not measured
    // against it — declaring it un-measured would be the C68 §6.3-G3 shape.
    scopeModes: ['all', 'selection', 'level'],
    destructive: false,
    busCommand: 'element.changeType',
    probe: { intent: 'set-curtain-wall-type', typeRef: 'Structural Glazing', scope: 'selection' },
    commandProof: {
      file: 'apps/editor/src/engine/initBusHandlers.ts',
      mustMention: ['curtainWallTypeStore', 'resolveCurtainWallTypeFields', 'UpdateCurtainWallCommand'],
      note: "element.changeType's curtain-wall branch (initBusHandlers.ts:2094) REFUSES any id curtainWallTypeStore.getById() does not know — the same LIVE singleton this capability's valueSource resolves against, so a name the chat resolves is a name the branch accepts. It resolves the type against the wall's OWN height (resolveCurtainWallTypeFields — transomCourse intent is height-agnostic), dispatches UpdateCurtainWallCommand into the legacy geometry store the builders / plan projector / IFC exporter read (C87 §2 THE AUTHORITY), and re-materialises the surviving panels via resolveCurtainWallTypePanelFields. Keyed by elementId; fan-out per wall, N undo steps disclosed.",
    },
    examples: [
      'change all curtain walls to structural glazing',
      'change all curtain walls in ground level to storefront',
      'make all the curtain walls spider point-fixed',
      'change the curtain wall type to unitised bronze',
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
    // §L-1032 — the founder's ask: *"Every element needs to be possible to be
    // changed the level via properties panel … and via chat: e.g. 'Move/Change
    // slab from Level 1 to Level 2'."* The panel half shipped in 40494b09 /
    // d6a80d02; this is the chat half.
    //
    // ── WHY THIS IS NOW A CAPABILITY AND NOT A CLASS-B DEFERRAL ─────────────
    // `ChatCommandClassification` deferred `wall.changeLevel` / `roof.changeLevel`
    // with `blockedBy: 'defined re-hosting semantics per element family'`. That
    // blocker is DISCHARGED, and by the named thing: the per-family semantics
    // are now written down, once, in `LEVEL_CHANGE_VERBS` (the families that
    // move, each with its verb and its payload spelling) and
    // `LEVEL_CHANGE_REFUSALS` (the families that must NOT get the control, each
    // with the clause that decides it). The class-B entry was deleted in the
    // same commit — the coverage gate fails a verb declared twice, and rightly.
    //
    // ⚠ DO NOT COUNT THE FAMILIES HERE. The register moves: L-1087 demoted
    // beam / furniture / lighting / plumbing from movable to DEFERRED on
    // 2026-08-19 (their fragment builders seat the mesh at a stored absolute Y,
    // so a storey change re-files the record and leaves the mesh hovering at the
    // old floor). Everything below is derived from the register precisely so a
    // move like that costs zero lines here — read `LEVEL_CHANGE_VERBS`, never a
    // number in this comment.
    //
    // ── THE REFUSALS ARE THE POINT ─────────────────────────────────────────
    // "Move this door to level 2" answers *"A door belongs to its host wall.
    // Move the wall and the door goes with it."* — the family's own sentence
    // out of the register, not "I can't do that" and emphatically not a
    // success. `targets` therefore excludes door / window / room / grid /
    // annotation / dimension / stair / lift / pool, and `applyMoveToLevelIntent`
    // refuses each with its declared reason rather than the generated
    // capability-gap copy.
    id: 'move-to-level',
    description: 'move the selected element to another level',
    verbs: ['move', 'change', 'put', 'send', 'relocate', 'transfer'],
    // ⚠ NO 'move'-family word may appear in `aliases` or `refusalLabel`. The
    // L998 contradiction invariant tests the `position` unconnected topic's
    // regex against exactly those two fields, and `position` still matches
    // /move|relocate|shift|…/ — deliberately, because PLANAR repositioning
    // really is unconnected. The topic was NARROWED (a level-shaped sentence no
    // longer fires it) rather than excluded, so both statements stay true: a
    // storey change is live, a planar move is not.
    aliases: ['level', 'storey', 'floor', 'level change'],
    refusalLabel: 'level',
    targets: MOVE_TO_LEVEL_TARGETS,
    parameters: [
      {
        name: 'level',
        description: 'the level to move the element onto',
        required: true,
        valueSource: 'project-levels',
        example: 'Level 2',
      },
    ],
    scope: 'selection',
    // NOT 'all', and the arm refuses "move all walls to level 2" by name: every
    // row in the register is ONE element per command, so a project-wide claim
    // would be an over-claim with no verb behind it (§L-995…L-998).
    destructive: false,
    busCommand: 'wall.changeLevel',
    // The other eleven families, generated from the register — never typed out.
    alsoDispatches: MOVE_TO_LEVEL_BUS_COMMANDS.filter((v) => v !== 'wall.changeLevel'),
    probe: { intent: 'move-to-level', levelQuery: '0' },
    commandProof: {
      // The move's LIVENESS question is not "did the bus verb run" — it is
      // "did the storey change reach the store the renderer reads". That is
      // exactly what this mirror does, one row per family, and it is under
      // apps/editor so the gate classifies it as an execution authority.
      //
      // The literals are GENERATED from the register, so the proof covers
      // exactly the families this capability claims and no more. A family that
      // leaves `LEVEL_CHANGE_VERBS` stops being claimed AND stops being proven
      // in the same edit — which is what happened to beam / furniture /
      // lighting / plumbing under L-1087, and the reason this must not be a
      // hand-typed list.
      file: 'apps/editor/src/engine/elementLevelChangedMirror.ts',
      mustMention: Object.values(LEVEL_CHANGE_VERBS).map(
        (spec) => `${spec.kind}: (deps) => deps.${spec.kind}Store`,
      ),
      note:
        'LEGACY_LEVEL_MOVERS — the bus verb\'s `element.level-changed` event is mirrored into the ' +
        'LEGACY store the renderer actually reads, one row per family, and the mirror refuses BY NAME ' +
        'into the log when a store is unwired rather than no-opping silently. A family present in the ' +
        'register but absent here is the silent half of L-1032: the command succeeds, the plugin store ' +
        'is right, and the renderer keeps its own unchanged copy.',
    },
    examples: [
      'move the slab to level 2',
      'move slab from level 0 to level 2',
      "change this slab's level to level 1",
      'change the level of this slab to level 2',
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
    id: 'set-room-occupancy',
    // §FEAT-CHAT-ROOM-OCCUPANCY (2026-08-14) — the founder's ask, verbatim:
    // "if i want to go to the RAC and say i want a bathroom in the room 001,
    // a bedroom in room 002 and 003 and a living room — can that be done?"
    //
    // ── WHAT WAS ACTUALLY MISSING ────────────────────────────────────────────
    //
    // Nothing about the MODEL. `room.setOccupancy` has been LIVE (a registered
    // bus verb with a row in API-VERB-REGISTER, a legacy-bridge handler and an
    // undoable command), and `RoomOccupancyType` has carried bathroom, bedroom,
    // living-room and kitchen among 51 members all along. The founder's rooms
    // read `unclassified` because NOTHING COULD REACH THE VERB from a sentence —
    // the authored-but-unreachable defect, one more time.
    //
    // It was reachable-in-principle and BLOCKED IN FACT: ChatCommandClassification
    // filed `room.setOccupancy` under B_CATALOGUE — "the value is a
    // project-catalogue reference … those catalogues are not injected into the
    // resolver context yet". That reason was FALSE FOR THIS VERB. Occupancy is
    // not a project catalogue at all; it is a CLOSED COMPILE-TIME ENUM in
    // packages/schemas' sibling `room-topology`, knowable without any injection
    // and identical in every project. The classification blocked a capability on
    // a dependency it never had, and the fix was to delete the wrong reason —
    // not to build the injection it asked for.
    //
    // §FEAT-OCCUPANCY-LABEL-FOLLOWS (L-905, `e78d2536`) — the LABEL follows
    // the occupancy in the same gesture: a generator-minted name ("Room
    // 00-003") is renamed to the occupancy's own numbering ("Bedroom 01"),
    // while a name the user typed themselves is PRESERVED and the reply says
    // so (C81 §2.2). Occupancy + rename share ONE gesture → one Ctrl+Z.
    description:
      'set what a room is used for (a generated room label follows — "Room 00-003" becomes e.g. "Bedroom 01"; a name you typed yourself is kept)',
    verbs: ['make', 'set', 'change', 'turn', 'assign'],
    aliases: ['occupancy', 'room use', 'use', 'usage', 'function', 'programme'],
    refusalLabel: 'use',
    targets: ['room'],
    parameters: [
      {
        name: 'occupancy',
        description:
          'the room use, from the canonical room-occupancy vocabulary (bathroom, bedroom, living room, kitchen, …)',
        required: true,
        // `user-text` is the honest available source, NOT a claim that this is
        // free text. The value is a closed 51-member enum and the spec refuses
        // by listing real options. A dedicated 'room-occupancy' source would be
        // truer, but CapabilityValueSource members must also exist in
        // check-chat-capability-coverage.ts's KNOWN_VALUE_SOURCES, and that gate
        // was owned by another lane — so the precise source is deferred with a
        // logged row rather than half-added here.
        valueSource: 'user-text',
        example: 'bathroom',
      },
      {
        name: 'room',
        description:
          'which room, by its NUMBER (unique) or its name — omit it to use the selected room',
        required: false,
        valueSource: 'project-rooms',
        example: 'room 001',
      },
    ],
    // Selection by default; `room` is the founder's route ("room 001"), which
    // rides the SAME U3 spatial-scope channel "make all walls white in the
    // kitchen" already uses, so the editor's injected resolver does the lookup
    // and the resolver package stays pure.
    //
    // 'all' is deliberately ABSENT: "make every room in the project a bathroom"
    // has no correct answer, and a use assignment is exactly the edit where a
    // too-wide scope is worst.
    scope: 'selection',
    scopeModes: ['selection', 'room'],
    destructive: false,
    busCommand: 'room.setOccupancy',
    // `scope: 'selection'` is explicit for the same reason set-wall-type's probe
    // is: only the selection scope reads ctx.selection, so only it can exercise
    // the target guard the coverage gate probes with.
    probe: { intent: 'set-room-occupancy', occupancyRef: 'bathroom', scope: 'selection' },
    commandProof: {
      file: 'packages/command-registry/src/rooms/SetRoomOccupancyCommand.ts',
      mustMention: ['roomStore', 'occupancyType', 'restoreSnapshot'],
      note:
        'The command reads ctx.stores.roomStore and writes { occupancyType } for a single roomId, so rooms are its whole reachable set; restoreSnapshot is the undo that makes each fanned-out step reversible.',
    },
    examples: [
      'make room 001 a bathroom',
      'set room 002 to bedroom',
      'i want a bathroom in room 001',
      'room 003 is a living room',
      'set the occupancy to kitchen',
    ],
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
    // targets:'global' — generation is SITE-scoped, not element-scoped: there is
    // no element target set to prove (same ruling as set-rhino-material).
    // scopeModes n/a.
    //
    // ⚠ THIS COMMENT USED TO END "it reads the parcel boundary, NEVER THE
    // SELECTION", and §GEN-ON-BOUNDARY-LINE (L-7961 · C106 §7.2) made that false.
    // Corrected in the SAME commit that made it false, because a capability table
    // that lies is precisely the disease this file's header (lines 33-41) says it
    // exists to cure — `ElementCapabilities` advertising Mirror/Offset/Scale on
    // seven families that refuse at `canExecute`.
    //
    // WHAT IS TRUE NOW: generation reads the parcel boundary by DEFAULT, and reads
    // a SELECTED `boundaryLine` when the sentence asks to build on one ("create a
    // 5-storey residential building on this boundary line"). The selection is one
    // rung of a ladder — explicit pick → the one closed line on the active level →
    // refuse naming the count — and every rung after the first is resolved at the
    // execution layer, which is why `targets` stays 'global': there is still no
    // element SET this capability operates ON. It reads at most one element to
    // decide WHERE to build, and builds nothing on that element.
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
      {
        // §GEN-ON-BOUNDARY-LINE (L-7961 · C106 §7.2) — declared because the
        // capability really accepts it now. An undeclared parameter is the
        // mirror-image of an overclaimed target: both make this table disagree
        // with the code it describes.
        name: 'footprint',
        description:
          'where to build: the site parcel by default, or a drawn boundary line ("on this boundary line"). ' +
          'A selected line wins; otherwise the one CLOSED line on the active level is used, and two or ' +
          'more closed lines refuse by naming the count rather than guessing.',
        required: false,
        valueSource: 'user-text',
        example: 'on this boundary line',
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
    // §RAC-APARTMENT-IN-ROOM (L-1640..L-1644, 2026-08-21) — extended with the
    // founder's per-room ask: "…on room 00-001 in ground level". The place
    // phrase reads through SpatialScopeTail (C67 §4 rule 16); the room resolves
    // through the shared roomNumberMatch ladder (number column first, ambiguity
    // refuses naming candidates); a room-scoped run synthesises the shell from
    // the room's boundary ring (shellRingWorld) so its REAL walls are never
    // re-created. `scopeModes` stays undeclared DELIBERATELY: the declared-mode
    // contract (check 5c) requires ctx.resolveScope dispatch semantics, and
    // this capability resolves its scope inside the intent + arm — the
    // generate-room-finishes precedent. Reach stays out of the undeclared-reach
    // ratchet because the arm never calls ctx.resolveScope.
    description: 'lay out an apartment inside the walls already drawn — the whole level, or one room by its number',
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
      {
        name: 'en-suite count',
        description: 'how many bedrooms get their own en-suite, paired one per bedroom master-first ("2 en-suite bathrooms", "an en-suite in every bedroom")',
        required: false,
        valueSource: 'measurement',
        example: '2 en-suite bathrooms',
      },
      {
        name: 'open kitchen + living',
        description: 'fuse kitchen, living and dining into ONE open-plan great room ("opened kitchen + living room")',
        required: false,
        valueSource: 'user-text',
        example: 'opened kitchen + living room',
      },
      {
        name: 'room',
        description: 'lay out inside ONE room, addressed by its Room Schedule NUMBER ("on room 00-001"); ambiguous or unknown numbers refuse listing the real ones',
        required: false,
        valueSource: 'project-rooms',
        example: 'on room 00-001',
      },
      {
        name: 'level',
        description: 'the level to lay out on — must be the level being viewed ("in ground level"); a different level refuses naming the switch',
        required: false,
        valueSource: 'project-levels',
        example: 'in ground level',
      },
    ],
    scope: 'global',
    // Generating a whole plan into the drawn shell is consequential — the
    // Confirm card states bedrooms/bathrooms/en-suites, the room (number +
    // name + area) or level, every unstated default (L-911), and that it fills
    // EXISTING walls, so nobody confirms it thinking they asked for a new
    // building or a different room.
    destructive: true,
    busCommand: 'generation.apartment',
    probe: {
      intent: 'generate-apartment-layout',
      bedrooms: 3,
      bathrooms: null,
      masterEnSuite: false,
      openPlanKitchenDining: false,
      enSuiteCount: null,
      openPlanKitchenLiving: false,
      scope: null,
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
      // §RAC-APARTMENT-IN-ROOM (rule 19.b) — the founder's LITERAL sentence,
      // word order, "+", and "opened kitchen" included. A paraphrase that
      // happens to work is not acceptance evidence.
      'Create an apartment of 3 bedrooms with opened kitchen + living room and 2 en-suite bathrooms on room 00-001 in ground level',
      'create a 2 bedroom apartment in ground level',
      'create an apartment in room 001',
      'create a 3 bedroom apartment with an en-suite in every bedroom',
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
  // §FEAT-WALL-SPLIT-ID (GE-10) — `wall.split` is a second id over the SAME
  // opening-aware cut handler, so it inherits the same honest refusal: the point
  // is picked, not spoken.
  ['wall.split', 'Splitting a wall needs a picked split point — use the Cut tool.'],
  ['wall.createOpening', 'Openings are placed by pointing at a spot on the wall — use the Door or Window tool.'],
  ['wall.opening.create', 'Openings are placed by pointing at a spot on the wall — use the Door or Window tool.'],
  ['door.move', 'Moving a door along its wall needs a picked position — drag it.'],
  ['door.setOffset', 'Moving a door along its wall needs a picked position — drag it.'],
  ['window.move', 'Moving a window along its wall needs a picked position — drag it.'],
  ['window.setOffset', 'Moving a window along its wall needs a picked position — drag it.'],
  ['room.move', 'Rooms follow their bounding walls; move the walls instead.'],

  // ── §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7960, C106 §7) ──────────────────────
  //
  // ⭐ THE FOUNDER'S RAC SENTENCE, ANSWERED HONESTLY RATHER THAN HALF-WIRED:
  //
  //     "After creating it, I could ask via RAC: 'create a 3-bedroom apartment on
  //      this boundary line'."
  //
  // Two DIFFERENT things are needed for that, and only one of them is a boundary-line
  // problem:
  //   (a) the line must be an ADDRESSABLE SUBJECT — a stable id the chat can name.
  //       ✅ DONE: `boundaryLine_<ulid>` is a branded L0 id, the record lives in the
  //       ONE store at `runtime.stores.boundaryLine`, and every verb below takes it by
  //       id. Nothing further is needed to REFER to a boundary line.
  //   (b) the GENERATOR must consume it as its footprint. ✅ DONE 2026-08-24
  //       (§GEN-ON-BOUNDARY-LINE, L-7961 CLOSED). ⚠ THIS BULLET READ "⛔ NOT DONE, and
  //       not stubbed … Logged as L-7961, OPEN" — corrected in the commit that closed it.
  //       It is NOT wired the way this bullet predicted, and the difference matters:
  //       nothing was added to `packages/ai-host/src/generative` /
  //       `FloorPlanBatchExecutor`. The `generate-building` capability already drove
  //       three orchestrators that each accept an EXPLICIT footprint polygon, so the
  //       whole change was giving the existing seam a second footprint SOURCE
  //       (`apps/editor/src/ui/generation/boundaryLineFootprint.ts` — a pure resolver)
  //       instead of teaching a generator a new input. One verb, one pipeline.
  //
  // ⛔ THE VERBS BELOW STAY UNAVAILABLE, AND THAT IS UNCHANGED BY (b). They are the
  // line's own AUTHORING verbs — draw, move, attach, update, delete — every one of
  // which needs a pointer rather than a sentence. Building ON a line is a different
  // question from AUTHORING one, and closing the first does not make the second
  // speakable. Declared unavailable rather than classified-and-dead:
  // A verb that the chat CLASSIFIES but that generates nothing is the silent-success
  // shape this repository keeps finding; a named refusal with the route back to success
  // is the honest answer while (b) is open. Each sentence tells the user what to do
  // instead, which is the whole point of this map (C16 CA-18).
  ['boundaryLine.create', 'Drawing a setting-out line needs the points you want it through, which I cannot infer from a sentence — use the Boundary Line tool under Architecture (Alt+Shift+N).'],
  ['boundaryLine.move', 'Moving a boundary line from chat needs a target position I cannot infer — drag its vertices in plan. Everything attached to it moves with it.'],
  ['boundaryLine.attach', 'Attaching an element to a boundary line needs both of them picked — select the element and the line in plan.'],
  ['boundaryLine.detach', 'Detaching an element from a boundary line needs it picked — select it in plan.'],
  ['boundaryLine.update', 'Boundary-line properties (volume, height, thickness, material) are edited in the Properties panel with the line selected.'],
  ['boundaryLine.delete', 'Deleting a boundary line needs it picked — select it in plan and press Delete. Deleting the line does NOT delete what was built along it.'],

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
  // ⭐ §FEAT-FLOOR-SURFACE-FINISH (L-1884, 2026-08-21) — THESE TWO ROWS WERE THE
  // SECOND HALF OF THE FOUNDER'S REFUSAL, AND THEY NAMED A ROUTE THAT DOES NOT
  // WORK THE WAY THEY CLAIM. Both used to read, identically, *"Materials are not
  // connected to chat yet — set them in the Properties panel."*
  //
  // Two different sentences answered one ask (the other is
  // `capabilityGapRefusal`'s generated *"Floor surface finish isn't connected to
  // chat yet"*), and they pointed at DIFFERENT fallbacks. Worse, the fallback the
  // panel offers for a FLOOR is measurably partial — see the floor row.
  //
  // ⛔ NEITHER VERB IS RETIRED. `check-chat-capability-coverage.ts` requires every
  // name cited by a refusal to be a REGISTERED bus command, and both are; and
  // `floor.setMaterial`'s own handler refuses by declaration
  // (§FIX-DEAD-VERB-REFUSE) so a third dispatcher gets a reason rather than a lie.
  ['ceiling.setMaterial', 'Writes a detached plugin DTO store nothing renders (§FIX-MATERIAL-DEAD-DISPATCH). The Properties panel routes a ceiling material to ceiling.update instead, which reaches the geometry record; chat has no ceiling-finish grammar yet.'],
  // MEASURED 2026-08-21 (lane RAC1): the panel route for a floor is `floor.update`
  // with `{materialId, materialColor}`. `materialColor` is a field FloorData does
  // not declare and `resolveFloorColor` never reads — DEAD. And `materialId` sits
  // BELOW `floor.colour` and `finishSpec.finishColor` in that resolver's chain, so
  // on any auto-generated floor (all of which carry a finishColor) the panel's
  // material pick resolves to the OLD colour: `#E2D6BE` where the chosen material
  // is `#c8a96e`. Chat's own route writes the whole finish and does not have that
  // problem, which is why it is named here as the live alternative (C16 CA-18).
  ['floor.setMaterial', 'Writes a detached plugin DTO store nothing renders (§FIX-MATERIAL-DEAD-DISPATCH) — say "make all floors oak chevron"; chat drives floor.setFinishBatch, which writes materialId AND finishSpec to the geometry FloorStore. (The Properties panel Material dropdown reaches floor.update, but its value is masked by finishSpec.finishColor on any floor that has one — L-1884).'],
  // ══ §FIX-MATERIAL-REASON-NAMES-THE-CAUSE (L-11030) ═════════════════════════
  //
  // ⭐ TWELVE ROWS HERE ALL READ, VERBATIM: *"Materials are not connected to chat
  // yet — set them in the Properties panel."* MEASURED 2026-08-25 (lane
  // CHATPHOTO57), that sentence was WRONG IN BOTH HALVES for most of them — and a
  // refusal that misnames its own cause is a lie sitting in the registry whose
  // entire purpose is to prevent lies.
  //
  // ⛔ HALF ONE — THE CAUSE. "Not connected to chat yet" says the blocker is
  // GRAMMAR. It is not. `<family>.setMaterial` writes a DETACHED plugin DTO store
  // that no renderer, no 2-D projector, no IFC exporter and no persistence path
  // reads (§FIX-MATERIAL-DEAD-DISPATCH), and `tools/ga-gate/mirror-reachability-ledger.json`
  // holds the EXECUTED proof: `slab.setMaterial` and `roof.setMaterial` were
  // dispatched through a real CommandBus and measured REFUSED at canExecute. A lane
  // acting on the old sentence would wire chat to a dead verb and ship a silent
  // no-op — the exact defect §FIX-MATERIAL-DEAD-DISPATCH was raised to close.
  //
  // ⛔ HALF TWO — THE REMEDY, and this half is worse. "Set them in the Properties
  // panel" is FALSE for five of these families: `MaterialDispatch.ts` declares
  // beam / stair / plumbing / lighting / structural in `MATERIAL_UNSUPPORTED_REASON`,
  // so `dispatchSetMaterial` returns false and the panel commits nothing either. We
  // were routing the user to a control that refuses him too — a refusing half whose
  // escape hatch does not exist.
  //
  // ⭐ THE SPLIT BELOW IS THE FINDING: two genuinely different states were hiding
  // behind one sentence. Every reason is sourced from `MaterialDispatch.ts`
  // (measured at the BUILDER under Gate G7) or from the executed mirror ledger —
  // not from reading the handler and inferring.

  // ── CLASS 1 — A LIVE ROUTE EXISTS. Only the chat GRAMMAR is missing. ────────
  // The honest sentence names the verb that really commits, so the next lane wires
  // chat to THAT one instead of to the dead one.
  ['furniture.setMaterial', 'A dead verb — it writes a detached plugin store nothing renders. Furniture colour DOES commit through furniture.updateParameters, which is the route the Properties panel uses; chat has no furniture-material grammar yet.'],
  ['handrail.setMaterial', 'A dead verb — it writes a detached plugin store nothing renders. Handrail COLOUR commits through handrail.updateColor; a catalogue material does not, because the handrail builder has no material-library lookup. Set a colour in the Properties panel.'],
  ['curtain-wall.setMaterial', 'A dead verb — it writes a detached plugin store nothing renders. Curtain-wall material DOES commit through wall.updateCurtainWall, which is the route the Properties panel uses; chat has no curtain-wall-material grammar yet.'],
  ['handrail.updateColor', 'This is the LIVE handrail colour route — it reaches the handrail store and the builder reads it — but chat has no handrail-colour grammar yet. Set it in the Properties panel.'],

  // ── CLASS 2 — NO LIVE PATH ANYWHERE. The panel cannot do it either. ─────────
  // ⛔ These must NEVER say "set them in the Properties panel": measured at the
  // BUILDER (Gate G7), there is nothing for any control to write.
  ['lighting.setMaterial', 'Not a wiring gap — LightingData has no material field at all. A light fixture\'s colour lives in per-fixture parameter blocks (downlight, pendant, emission — a different field per fixture type), so there is nothing a single Material control could write, in chat or in the Properties panel. It needs a per-fixture-part colour UI first.'],
  ['plumbing.setMaterial', 'Not a wiring gap — the plumbing builder honours a colour for the BATH fixture only. Sink, toilet, urinal, bidet, shower and accessories hardcode their ceramic and chrome, so a material would apply to one fixture type in six and silently do nothing on the rest. The Properties panel refuses it for the same reason.'],
  ['structural.setMaterial', 'Not a wiring gap — there is no structural runtime family. The schema defines the element, but no store, no builder and no command exist anywhere; it is schema-only. The real structural element is the COLUMN, which has a full, live material path.'],
  // §FEAT-WALL-COLOR-BATCH (ADR-0314) — wall colour IS chat-drivable now, via
  // wall.updateColorBatch. These three stay deferred with the true reasons:
  ['wall.setColor', 'Writes a detached plugin store nothing renders (§FIX-MATERIAL-DEAD-DISPATCH) — say "make all walls white"; chat drives wall.updateColorBatch instead.'],
  ['wall.updateColor', 'The single-wall inspector route — from chat, "make all walls white" / "paint the selected walls …" drives wall.updateColorBatch (one undo entry, honest batch report).'],
  ['wall.bulkSetVisuals', 'Writes a detached plugin store nothing renders (§FIX-MATERIAL-DEAD-DISPATCH) — chat bulk colour drives wall.updateColorBatch, which reaches the geometry store.'],
  // CLASS 1 continued — a live route exists; chat grammar is the only gap.
  // ⭐ slab and roof are the two verbs the mirror ledger DISPATCHED and measured
  // REFUSED. They are not inferred dead, they are PROVEN dead.
  ['slab.setMaterial', 'A dead verb — dispatched through a real bus it REFUSES at canExecute, because it writes a detached plugin store nothing renders. A slab material DOES commit through slab.updateDimensions, which is the route the Properties panel uses; chat has no slab-material grammar yet.'],
  ['roof.setMaterial', 'A dead verb — dispatched through a real bus it REFUSES at canExecute, because it writes a detached plugin store nothing renders. A roof material DOES commit through roof.update, which is the route the Properties panel uses; chat has no roof-material grammar yet.'],
  ['column.setMaterial', 'A dead verb — it writes a detached plugin store nothing renders. A column material DOES commit through column.update, which is the route the Properties panel uses; chat has no column-material grammar yet.'],
  // ⭐ ROOM IS THE EXCEPTION, AND THE OLD SENTENCE BURIED IT: this is the ONE
  // `setMaterial` handler that writes the geometry store. Colour is LIVE; only the
  // catalogue id is refused, and only because a room has no field to hold one.
  ['room.setMaterial', 'Room COLOUR is live through this very verb — it is the one setMaterial that reaches the geometry store — but chat has no room-colour grammar yet, so set it in the Properties panel. A catalogue MATERIAL is refused: a room has no material-id field, and its fill comes from the room colour override.'],

  // CLASS 2 continued — no live path; the panel refuses these too.
  ['beam.setMaterial', 'Not a wiring gap — the beam builder HARDCODES its material, choosing between two shared steel and concrete materials from the section type, and BeamData carries no material fields at all. Nothing a Material control writes would reach the mesh, in chat or in the Properties panel.'],
  ['stair.setMaterial', 'Not a wiring gap — StairData has no material or colour field. Its only material is a fixed enum (concrete, steel, timber, marble, glass, composite) resolved to a preset, which a material dropdown cannot express. It needs an enum picker first.'],

  // ── Openings: the refusal is CORRECT, and now names the live route. ─────────
  // A door/window finish comes from its SYSTEM TYPE (C15); the frame colour has its
  // own dedicated panel control, and that control DOES commit to the record.
  ['door.setFrameColor', 'Not connected to chat yet — the Frame Colour control in the Properties panel drives this and does commit to the record. A door\'s wider finish comes from its system type, so changing the door type is the other route.'],
  ['window.setFrameColor', 'Not connected to chat yet — the Frame Colour control in the Properties panel drives this and does commit to the record. A window\'s wider finish comes from its system type, so changing the window type is the other route.'],

  // Selection is a pointer concern; the chat reads the selection, it does not
  // author it.
  ['selection.select', 'The chat acts on what you have selected; it does not change the selection.'],
  ['selection.deselect', 'The chat acts on what you have selected; it does not change the selection.'],
  ['selection.clear', 'The chat acts on what you have selected; it does not change the selection.'],

  // ── §L-1032 / §L-1087 — LEVEL CHANGES THAT ARE BUILT BUT WITHHELD ────────
  //
  // These four verbs ARE registered, their store move works and their undo
  // route passes. They are still not offered, and the reason is measured, not
  // stylistic: their fragment builders seat the mesh at an absolute Y stamped
  // into the record at create time, so a storey change re-files the element and
  // leaves the 3-D mesh hovering at the OLD floor's height with nothing
  // reporting a failure. `LEVEL_CHANGE_REFUSALS` carries the per-family
  // evidence; the SENTENCE below is read out of that same row, so the chat's
  // refusal and the property panel's are literally the same string.
  //
  // WHY THE FOUR KINDS ARE NAMED HERE AND NOT DERIVED: the register does not
  // record "a verb exists for this refused family" — refusals like `door` and
  // `grid` have no verb at all, and inventing `door.changeLevel` would be a
  // phantom. The list is self-correcting rather than trusted: if a row moves
  // back into `LEVEL_CHANGE_VERBS`, `move-to-level` claims its verb through
  // `alsoDispatches` and the "nothing is both exposed and deferred" invariant in
  // `chat-capability-registry.test.ts` goes RED until this entry is removed.
  ...(['beam', 'furniture', 'lighting', 'plumbing'] as const).flatMap((kind) => {
    const row = LEVEL_CHANGE_REFUSALS[kind];
    // A row that vanished is NOT silently skipped into a covered state: dropping
    // it leaves the verb undeclared, which is exactly what the coverage gate
    // exists to shout about.
    return row === undefined ? [] : [[`${kind}.changeLevel`, row.reason] as const];
  }),

  // ── §RACKITCHEN127 — the founder's kitchen-material RAC ask, BUILT but the
  // grammar not yet wired. ────────────────────────────────────────────────────
  //
  // "I want to change the carcass body, door front and countertop material via
  // RAC for kitchens — for ALL kitchens in a floor, for ALL kitchens in the
  // project, etc." `furniture.bulkUpdateKitchenMaterial` and its command
  // (`BulkUpdateKitchenMaterialCommand`, @pryzm/command-registry) ship this
  // release: one element / one level / the whole project, ONE undo entry,
  // §CONTEXT-DATA-HONESTY partial-failure reporting, and a forgiving lookup
  // against STANDARD_MATERIAL_LIBRARY (`resolveKitchenMaterialRef`). The
  // command is real and reachable by any caller (`window.commandManager` bridge,
  // an AI-panel pill, a future test) — what is NOT done is teaching
  // `ZeroTokenResolver` to turn "change all kitchen countertops on level 2 to
  // marble" into that bus command. That needs its OWN family (not a
  // `CatalogueFamilies` / `DimensionFamilies` row — this capability has an
  // extra axis, WHICH surface (carcass / door-front / countertop), that no
  // existing spec-driven family carries) plus a `ChatCapabilityRegistry`
  // capability entry with its own `probe`/`commandProof`/acceptance examples.
  // Declared here rather than left undeclared so the shrink-only
  // `MAX_UNDECLARED` coverage ratchet in `check-chat-capability-coverage.ts`
  // reads this command HONESTLY (built, not yet chat-driven) instead of
  // silently failing the next unrelated PR that trips the ratchet.
  // §RACWALL128 — punctuation fix only: the sentence originally ended
  // "...grammar is missing.)" (period BEFORE the closing paren), which failed
  // `chat-capability-registry.test.ts`'s "every deferral states a reason a
  // user could read" — `reason.endsWith('.')` — for the trivial reason that a
  // closing paren was the actual last character. Every other parenthetical
  // aside in this map (see `floor.setMaterial` above, "...L-1884).") ends the
  // sentence AFTER the paren; this row now matches that convention. No other
  // change: the RACKITCHEN127 content and authorship are untouched.
  ['furniture.bulkUpdateKitchenMaterial', 'Bulk kitchen material changes are not wired to chat yet — use the kitchen\'s Edit Kitchen Layout panel for one kitchen at a time (the bulk command itself is built — only the sentence-to-command grammar is missing).'],

  // ── §RACORIENT145 — curtain-wall PANEL type/material, BUILT but the grammar
  // not yet wired. ─────────────────────────────────────────────────────────────
  //
  // The founder's ask: "change all west-facing curtain panels to spider
  // point-fix glazing" / "... to a MATERIAL — any from the materials list."
  // `curtain-wall.bulkUpdatePanels` and its command
  // (`BulkUpdateCurtainPanelsCommand`, @pryzm/command-registry) ship this
  // release: one panel / one level / the whole project / an explicit
  // pre-resolved id list (where a COMPASS scope lands — see the command's own
  // header), ONE undo entry, §CONTEXT-DATA-HONESTY partial-failure reporting,
  // TYPE resolved against the live `PanelType` union (refuses naming every real
  // one) and MATERIAL resolved against STANDARD_MATERIAL_LIBRARY via the SAME
  // forgiving ladder §RACKITCHEN127 shipped (`resolveKitchenMaterialRef`,
  // reused verbatim — not forked). The command is real and reachable by any
  // caller (`window.commandManager` bridge, a future test) — what is NOT done
  // is teaching `ZeroTokenResolver` to turn "change all west-facing curtain
  // panels to spider point-fix glazing" into that bus command, exactly the
  // same honestly-declared gap `furniture.bulkUpdateKitchenMaterial` above
  // states for kitchens. Declared here rather than left undeclared so the
  // shrink-only `MAX_UNDECLARED` coverage ratchet in
  // `check-chat-capability-coverage.ts` reads this command HONESTLY (built,
  // not yet chat-driven) instead of silently failing the next unrelated PR
  // that trips the ratchet.
  //
  // ⚠ NEITHER of the founder's two named TYPE examples exists in the catalogue
  // TODAY: `VALID_PANEL_TYPES` (@pryzm/geometry-curtain-wall) has no "crittal"
  // and no "spider point-fix" / "point-fix" / "spider" member (measured —
  // `grep -ri 'crittal|spider|point-fix'` across geometry-window /
  // geometry-door / geometry-curtain-wall → 0 hits). "steel crittal style"
  // (a window/door style) likewise matches no built-in window/door SYSTEM
  // TYPE name. Creating those new types is a DIFFERENT lane's job (C65 — the
  // element type system); this capability's honest answer for either name
  // today is a refusal LISTING the real panel/window/door types, never a
  // silent invention.
  ['curtain-wall.bulkUpdatePanels', 'Bulk curtain-wall panel type/material changes are not wired to chat yet — use the curtain-wall panel editor for one panel at a time (the bulk command itself is built — only the sentence-to-command grammar is missing).'],

  // ── §CWPROPS152 — curtain-wall PARAMETER (mullion size / panel thickness /
  // post spacing / transom spacing), COMMAND AND GRAMMAR BOTH BUILT. ─────────
  //
  // The founder's ask, verbatim: *"important request via RAC ... Make mullion
  // size of all curtain walls in ground level to 0.06 meters ... Post Spacing
  // (m) 1.5 / Transom Spacing (m) 5 / Mullion Size (m) 0.03 / Panel Thickness
  // (m) 0.019."* `curtain-wall.bulkUpdateParameter` and its command
  // (`BulkUpdateCurtainWallParameterCommand`, @pryzm/command-registry) ship
  // this release: one wall / one level / the whole project / an explicit
  // pre-resolved id list (where a COMPASS scope lands), ONE undo entry,
  // §CONTEXT-DATA-HONESTY partial-failure reporting, and the SAME write path
  // (`UpdateCurtainWallCommand`) the property panel's Post/Transom
  // Spacing/Mullion Size/Panel Thickness rows already use — so a bulk edit
  // re-derives the grid exactly as a single-wall edit does (C87 §13.6 CW-4).
  //
  // UNLIKE `curtain-wall.bulkUpdatePanels` above, the grammar for THIS
  // capability is ALSO built and unit-tested end to end —
  // `parseCurtainWallParameterIntent` (`@pryzm/ai-host/src/intents/CurtainWallParameterFamily.ts`)
  // parses every one of the founder's four literal example sentences,
  // including both tail-before-value and tail-after-value word orders, into
  // `{ parameter, value, scope }`. What remains is WIRING, not authoring: a
  // `CapabilityExecutionSpec` row (mirroring `dimensionFamilySpec`) and a call
  // site in `ZeroTokenResolver`'s tier-0 dispatch (mirroring
  // `parseDimensionScopedIntent`'s own call site) — deferred in THIS lane
  // because the generic `applyExecutionSpec` template `DimensionFamilies` rides
  // assumes a flat resolved `elementIds: string[]`, while this capability's
  // scope is the SAME `{kind:'element'|'level'|'project'|'ids'}` shape
  // `curtain-wall.bulkUpdatePanels` above already uses and which that sibling
  // ALSO left unwired for the identical reason — a hand-written case arm (the
  // shape `CapabilityExecutionSpec.ts`'s own header carves out for
  // create-windows-parametric, set-rhino-material, etc.) is the likely correct
  // route, not a spec-table row, and is a bigger change than one lane should
  // make silently. Declared here rather than left undeclared so the
  // shrink-only `MAX_UNDECLARED` coverage ratchet in
  // `check-chat-capability-coverage.ts` reads this command HONESTLY (command
  // built, grammar built and tested, only the resolver wiring missing) instead
  // of silently failing the next unrelated PR that trips the ratchet.
  ['curtain-wall.bulkUpdateParameter', 'Bulk curtain-wall parameter changes (mullion size, panel thickness, post spacing, transom spacing) are not wired to chat yet — use the property panel for one curtain wall at a time (the bulk command AND its sentence grammar are both built and tested; only the resolver wiring that connects the two is missing).'],
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
