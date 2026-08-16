// ConsequencePreviewService — R3 of docs/03-execution/plans/BIM30-REASONING-LOOP-PLAN.md.
//
// The PREVIEW invocation surface (ADR-0322 §3, STR-06 §4). It answers the question
// "what WOULD this command do?" by producing the one authoritative `ConsequencePlan`
// (packages/command-bus/src/consequence.ts) WITHOUT mutating anything.
//
// ── WHY THIS DOES NOT ROUTE THROUGH `executeCommand` (the bus) ────────────────────────
// `CommandBus.executeCommand` MUTATES: it dispatches a handler, writes stores, pushes
// undo, sets dirty flags, emits events. Adding a `{mode:'preview'}` branch there would
// force ONE of two defects:
//   • L1 command-bus would have to import an L7 planner to answer the preview branch —
//     an UPWARD import, the exact violation `check-layer-boundaries.ts` exits 3 on; or
//   • the bus would gain a bespoke preview path that re-implements consequence logic,
//     which is the "two preview implementations" ADR-0322 §8 forbids by name.
// So preview is NOT a bus mode. It is a SEPARATE L7 capability that reads the SAME
// contract type family. The bus is never touched: `preview()` below calls
// `planner.plan()` and returns — no dispatch, no handler, no store write, no event.
// The planner's own contract (consequence.ts) forbids it to mutate (G-REASON-01), so the
// whole path is read-only by construction, and the purity gate proves it
// (tools/rac-conformance/certification/gates/check-preview-purity.ts).
//
// ── WHY THIS LIVES IN apps/editor/src/engine (L7) ────────────────────────────────────
// Same reasoning as WallMoveConsequencePlanner.ts: the CONTRACT is L1
// (`@pryzm/command-bus`), so anything may implement it; the SERVICE composes L7 planners
// and reads L2/L3 store views, so it must sit at the top where every edge is downward.
// All runtime imports here are `import type` (erased) — the concrete planners and the
// `PlanningContext` factory are INJECTED (see the composition file), so this file couples
// nothing at import and is testable in a plain node env with doubles.

import type {
  ConsequencePlan,
  ConsequencePlanner,
  PlanningContext,
} from '@pryzm/command-bus';
import type { WallMoveCommand } from './WallMoveConsequencePlanner.js';

/**
 * A command as it arrives at the preview surface — the SAME `(type, payload)` shape the
 * bus dispatches (ADR-0324 §1: one funnel, never a parallel action taxonomy). The service
 * reasons about the SEMANTIC operation, not the bus verb (L-49): `wall.move` is a
 * deliberately-refused dead verb, `wall.updateBaseline` is the live mutation, and BOTH map
 * to the one `wall.move` planner — the plan is CONSUMED by the executor in R4, never
 * dispatched from here.
 */
export interface PreviewCommand {
  readonly type: string;
  readonly payload: unknown;
}

/**
 * The minimal capability the overlay (and any other preview consumer) depends on. Kept as
 * an interface so the overlay imports no engine singletons — it is handed a provider and
 * renders whatever `ConsequencePlan` comes back. Tests inject a fake provider; production
 * injects {@link ConsequencePreviewService}.
 */
export interface ConsequencePreviewProvider {
  /** Compute the plan for `command`, or `null` when no planner is registered for its type. */
  preview(command: PreviewCommand): Promise<ConsequencePlan | null>;
}

/** The wall.move payload as the planner expects it (`WallMoveCommand.payload`). */
type WallMovePayload = WallMoveCommand['payload'];

/** The `wall.updateBaseline` payload keys (plugins/wall UpdateWallBaseline, pinned by L-49). */
interface UpdateBaselinePayload {
  readonly wallId: string;
  readonly newBaseLine: WallMovePayload['baseLine'];
  readonly prevBaseLine?: WallMovePayload['baseLine'];
}

/**
 * Map a dispatched `(type, payload)` onto the semantic `WallMoveCommand` the planner
 * answers for. `wall.updateBaseline` (the live verb) and `wall.move` (the refused-but-
 * semantic verb, L-49) both resolve to the `'wall.move'` planner key.
 *
 * Exported (R4) so the EXECUTION service normalises with the SAME rule the preview
 * used — two normalisers would let preview and execute plan different semantic
 * commands for one dispatch, which is a plan-fidelity divergence minted at the front
 * door (the G-REASON-03 failure class, manufactured rather than measured).
 */
export function normalizeToWallMove(command: PreviewCommand): WallMoveCommand | null {
  if (command.type === 'wall.move') {
    const p = command.payload as Partial<WallMovePayload> | undefined;
    if (!p || typeof p.id !== 'string' || !p.baseLine) return null;
    return { type: 'wall.move', payload: { id: p.id, baseLine: p.baseLine } };
  }
  if (command.type === 'wall.updateBaseline') {
    const p = command.payload as Partial<UpdateBaselinePayload> | undefined;
    if (!p || typeof p.wallId !== 'string' || !p.newBaseLine) return null;
    return { type: 'wall.move', payload: { id: p.wallId, baseLine: p.newBaseLine } };
  }
  return null;
}

// ─── The GENERIC normaliser registry (C78 §5 · U-INV-5) ───────────────────────────────
//
// §PLANNER-REGISTRY-GENERIC (2026-08-13). `normalizeToWallMove` above is a PER-VERB
// function, and until now it was the only normaliser the three composition roots had.
// That made the whole consequence surface structurally single-family: a second planner
// could be put in the `planners` map and would STILL be unreachable, because every entry
// point funnelled through a function that returns `null` for any verb that is not
// `wall.move` / `wall.updateBaseline`. That is exactly U-INV-5's defect — a registry
// whose genericity is nominal because the lookup ahead of it is hard-coded — and it is
// why the Phase 6c `wall.create` planner sat authored-but-unreachable (C70 §4.2).
//
// The fix is a MAP from bus verb → semantic command, not a second `if`. Adding the third
// row of the golden-operation matrix (`opening.move`) is then a map entry plus a planner,
// with NO edit to any service: the services below take the map and know no verb names.
//
// Each rule returns `null` on a payload it cannot form a semantic command from. `null`
// remains a first-class answer meaning "this verb is not one I normalise", and the
// executor already distinguishes it from "no planner registered" via the typed
// `no-normalizer-for-verb` / `no-planner-registered` sub-reasons — that distinction is
// preserved unchanged and is what keeps a capability gap from printing as staleness.

/** A semantic command as the registry produces it: a canonical planner key + payload. */
export interface SemanticCommand {
  readonly type: string;
  readonly payload: unknown;
}

/** One normalisation rule: a dispatched command → a semantic command, or `null`. */
export type NormalizerRule = (command: PreviewCommand) => SemanticCommand | null;

/**
 * Map a dispatched `wall.create` onto the semantic `wall.create` command the Phase 6c
 * planner answers for (`WallCreateConsequencePlanner.WallCreateCommand`).
 *
 * The bus verb and the semantic verb are the SAME here — unlike wall.move, whose live
 * verb is `wall.updateBaseline` — so this rule is a VALIDATING pass-through rather than
 * a rename. It is still a rule and not a special case in the service, because the
 * validation is real: the planner's contract distinguishes "no baseLine supplied"
 * (a typed UNDETERMINED it handles internally) from "not a create payload at all".
 *
 * Deliberately PERMISSIVE about missing fields: `CreateWallPayload` makes every field
 * optional (`Wall.parse({})` is a valid wall), and the planner already answers the
 * no-baseLine case with a typed UNDETERMINED rather than a crash. Rejecting here would
 * turn a question the planner CAN answer into a silent `null` — the failure-as-emptiness
 * defect, moved one layer upstream. Only a structurally absent payload is refused.
 */
export function normalizeToWallCreate(command: PreviewCommand): SemanticCommand | null {
  if (command.type !== 'wall.create') return null;
  const p = command.payload;
  if (p === null || p === undefined || typeof p !== 'object') return null;
  return { type: 'wall.create', payload: p };
}

// ─── opening.move — the THIRD matrix row's normalisation (2026-08-13) ─────────────────
//
// THE GENERICITY TEST, and its result. The §PLANNER-REGISTRY-GENERIC note above predicted
// that "adding the third row of the golden-operation matrix (`opening.move`) is then a map
// entry plus a planner, with NO edit to any service". That held: what follows is a rule
// function and two map entries. `ConsequencePreviewService`, `ConsequenceExecutionService`
// and `ConfirmationFlow` are UNTOUCHED by this row — none of them names a verb, none of them
// branches on a family, and all three inherit `opening.move` by consuming the shared registry
// and the shared factory. The centralisation of commit 46d06234 was load-bearing.
//
// TWO live verbs map onto ONE semantic operation, which is the same shape as `wall.move`
// (`wall.updateBaseline` → `wall.move`) and for a stronger reason. `door.setOffset` and
// `window.setOffset` (initBusHandlers.ts, bridging `SetDoorOffsetCommand` /
// `SetWindowOffsetCommand`) are the same operation on the same host↔hosted relationship,
// differing only in which standalone store C15 §8.1's dual-write also touches. Planning them
// as two families would mean two planners that must be kept identical by hand — and the
// moment they drifted, a door and a window on the same wall would get different answers to
// "does this collide?". One semantic verb, two rules.

/** The `door.setOffset` payload keys (initBusHandlers E.5 bridge → SetDoorOffsetCommand). */
interface DoorSetOffsetPayload {
  readonly doorId: string;
  readonly newOffset: number;
  readonly prevOffset?: number;
  /** Some call sites carry the host; most do not. Forwarded when present (see below). */
  readonly wallId?: string;
}

/** The `window.setOffset` payload keys (→ SetWindowOffsetCommand). Same shape, different key. */
interface WindowSetOffsetPayload {
  readonly windowId: string;
  readonly newOffset: number;
  readonly prevOffset?: number;
  readonly wallId?: string;
}

/**
 * Build the semantic `opening.move` command from a hosted-element offset dispatch.
 *
 * `wallId` is forwarded ONLY when the payload actually carries it. Neither live verb requires
 * it — `SetDoorOffsetCommand(doorId, newOffset, prevOffset)` names the element alone — and the
 * planner's host-resolution branch is written for exactly that: absent, it performs the
 * reverse scan and declares `RELATIONSHIP_NOT_READABLE` when the scan cannot answer. Inventing
 * a host here would move a real refusal path out of reach and replace it with a guess.
 *
 * The offset is REQUIRED and must be a number. A dispatch with no offset is not an
 * `opening.move` this planner can answer for at all — unlike `wall.create`'s permissive
 * missing-baseLine case, where the planner has a typed UNDETERMINED for it, here the payload
 * simply is not the command. `null` is the honest answer, and the executor's typed
 * `no-normalizer-for-verb` path renders it as a capability gap rather than staleness.
 */
function openingMoveFrom(
  elementId: unknown,
  offset: unknown,
  prevOffset: unknown,
  wallId: unknown,
): SemanticCommand | null {
  if (typeof elementId !== 'string' || elementId.length === 0) return null;
  if (typeof offset !== 'number' || !Number.isFinite(offset)) return null;
  return {
    type: 'opening.move',
    payload: {
      id: elementId,
      offset,
      ...(typeof wallId === 'string' && wallId.length > 0 ? { wallId } : {}),
      ...(typeof prevOffset === 'number' && Number.isFinite(prevOffset) ? { prevOffset } : {}),
    },
  };
}

/** `door.setOffset` → the semantic `opening.move`. */
export function normalizeToOpeningMoveFromDoor(command: PreviewCommand): SemanticCommand | null {
  if (command.type !== 'door.setOffset') return null;
  const p = command.payload as Partial<DoorSetOffsetPayload> | undefined | null;
  if (!p || typeof p !== 'object') return null;
  return openingMoveFrom(p.doorId, p.newOffset, p.prevOffset, p.wallId);
}

/** `window.setOffset` → the semantic `opening.move`. */
export function normalizeToOpeningMoveFromWindow(command: PreviewCommand): SemanticCommand | null {
  if (command.type !== 'window.setOffset') return null;
  const p = command.payload as Partial<WindowSetOffsetPayload> | undefined | null;
  if (!p || typeof p !== 'object') return null;
  return openingMoveFrom(p.windowId, p.newOffset, p.prevOffset, p.wallId);
}

// ─── door.move / window.move — the REGISTER move-verbs of the same family (2026-08-13) ─
//
// The C69 register carries `door.move` and `window.move` as move-class consequential verbs.
// Both are REFUSES-status at the bus (§FIX-DEAD-MOVE-VERB-REFUSE: they wrote a detached
// plugin DTO store nothing renders, and now refuse naming `door.setOffset` /
// `window.setOffset` as the commit path) — exactly the `wall.move` situation, and resolved
// the same way (L-49 precedent): a refused-but-semantic bus verb is still a QUESTION the
// consequence surface must answer. check-relationship-determination counted both as
// silent-dispatch — every one of their 41 relationship cells yielded C78 §1.1's forbidden
// fourth answer — because no rule mapped them onto the composed `opening.move` planner.
//
// Their payloads are the handlers' own declared shapes (`MoveDoorPayload { doorId, offset }`,
// `MoveWindowPayload { windowId, offset }` — plugins/door/src/handlers/MoveDoor.ts,
// plugins/window/src/handlers/MoveWindow.ts): the offset is already the LEFT-EDGE offset
// along the host baseline in metres, the same quantity `door.setOffset.newOffset` carries,
// so the mapping is a key rename, not a unit conversion. Neither payload carries `wallId`
// or a previous offset — nothing is invented; the planner's reverse-scan branch resolves
// the host, and the metric `before` is read from the store.

/** The `door.move` payload keys (plugins/door MoveDoorHandler — the C69 register verb). */
interface DoorMovePayload {
  readonly doorId: string;
  readonly offset: number;
}

/** The `window.move` payload keys (plugins/window MoveWindowHandler). Same shape, different key. */
interface WindowMovePayload {
  readonly windowId: string;
  readonly offset: number;
}

/** `door.move` → the semantic `opening.move`. */
export function normalizeToOpeningMoveFromDoorMove(command: PreviewCommand): SemanticCommand | null {
  if (command.type !== 'door.move') return null;
  const p = command.payload as Partial<DoorMovePayload> | undefined | null;
  if (!p || typeof p !== 'object') return null;
  return openingMoveFrom(p.doorId, p.offset, undefined, undefined);
}

/** `window.move` → the semantic `opening.move`. */
export function normalizeToOpeningMoveFromWindowMove(command: PreviewCommand): SemanticCommand | null {
  if (command.type !== 'window.move') return null;
  const p = command.payload as Partial<WindowMovePayload> | undefined | null;
  if (!p || typeof p !== 'object') return null;
  return openingMoveFrom(p.windowId, p.offset, undefined, undefined);
}

/**
 * `opening.move` dispatched under its own SEMANTIC name — a validating pass-through, the same
 * shape as `normalizeToWallCreate`. Present for the same reason `wall.move` is a normaliser
 * key despite being a refused bus verb: the AI/parity surfaces and the certification harnesses
 * dispatch the semantic verb directly, and a family reachable only through its two legacy bus
 * spellings would be a family the reasoning surfaces cannot address.
 */
export function normalizeToOpeningMove(command: PreviewCommand): SemanticCommand | null {
  if (command.type !== 'opening.move') return null;
  const p = command.payload as
    | Partial<{ id: string; offset: number; wallId: string; prevOffset: number }>
    | undefined
    | null;
  if (!p || typeof p !== 'object') return null;
  return openingMoveFrom(p.id, p.offset, p.prevOffset, p.wallId);
}

// ─── wall.opening.create — the hosted-opening CREATE family (2026-08-14) ──────────────
//
// The C69 register carries THREE consequential create-class verbs for wall-hosted
// openings — `wall.opening.create` (the live PRYZM3 adapter), `door.create` and
// `window.create` (both REFUSES-status, §FIX-CREATE-LIVENESS-LIE) — plus the
// unclassified authoritative spelling `wall.createOpening`, which both refusal texts
// name as THE commit path. All four name ONE atomic semantic operation: create a hosted
// opening on a host wall, occupying `[offset, offset + width]` along its baseline. The
// old two-step choreography (`wall.createOpening` then `door.create { openingId }`)
// survives only in unregistered plugin tools; the register's own documentation of the
// family — the refusal sentences themselves — is the one-command form, and that is the
// form these rules translate to. check-relationship-determination counted the three
// register verbs as silent-dispatch; this family lands them WHOLE (C78 §19.1: all
// spellings or none) onto ONE planner, `WallOpeningCreateConsequencePlanner`.
//
// The subject IDENTITY rule, stated once for all four spellings: the rules never mint an
// id. The adapter's execute() falls back to `crypto.randomUUID()` when the payload
// carries no ids — a planner that mirrored that would produce a different plan on every
// run (G-REASON-02 dead on arrival) — so a payload with NO stable identity normalises to
// `null` (a capability gap, typed downstream as `no-normalizer-for-verb`), never to a
// plan about an invented element.

/** The `wall.opening.create` ADAPTER payload (CreateWallOpeningLegacyAdapter). */
interface WallOpeningCreateAdapterPayload {
  readonly wallId: string;
  readonly openingData: Readonly<Record<string, unknown>>;
}

/** The `wall.createOpening` payload (CreateWallOpeningHandler — the authoritative path). */
interface CreateWallOpeningPayload {
  readonly wallId: string;
  readonly opening: Readonly<Record<string, unknown>>;
}

/** The `door.create` / `window.create` payload keys this surface reads (CreateDoorPayload
 *  / CreateWindowPayload — the hosted-element create halves of the refused choreography). */
interface HostedElementCreatePayload {
  readonly wallId: string;
  readonly openingId: string;
  readonly id?: string;
  readonly offset?: number;
  readonly width?: number;
  readonly height?: number;
  readonly sillHeight?: number;
}

/**
 * Build the semantic `wall.opening.create` command from resolved parts, or `null` when
 * no well-formed create can be stated. `offset` and `width` are REQUIRED finite numbers:
 * a create without a span is not a question this planner can pose (the same rule as
 * `openingMoveFrom`'s required offset — and NOT the `wall.create` permissive case, whose
 * planner has a typed UNDETERMINED for a missing baseline; here a missing span admits no
 * typed answer that is not an invented number).
 */
function wallOpeningCreateFrom(
  elementId: unknown,
  wallId: unknown,
  offset: unknown,
  width: unknown,
  openingType: unknown,
  openingId: unknown,
  height: unknown,
  sillHeight: unknown,
): SemanticCommand | null {
  if (typeof elementId !== 'string' || elementId.length === 0) return null;
  if (typeof wallId !== 'string' || wallId.length === 0) return null;
  if (typeof offset !== 'number' || !Number.isFinite(offset)) return null;
  if (typeof width !== 'number' || !Number.isFinite(width)) return null;
  return {
    type: 'wall.opening.create',
    payload: {
      id: elementId,
      wallId,
      offset,
      width,
      ...(openingType === 'door' || openingType === 'window' ? { openingType } : {}),
      ...(typeof openingId === 'string' && openingId.length > 0 ? { openingId } : {}),
      ...(typeof height === 'number' && Number.isFinite(height) ? { height } : {}),
      ...(typeof sillHeight === 'number' && Number.isFinite(sillHeight) ? { sillHeight } : {}),
    },
  };
}

/**
 * `wall.opening.create` → the semantic command. TWO payload shapes arrive under this one
 * verb, and both are accepted: the ADAPTER shape `{ wallId, openingData }` (what the
 * plan tools dispatch) and the FLAT semantic shape `{ id, wallId, offset, width, … }`
 * (what the AI/parity surfaces and certification harnesses dispatch — the same reason
 * `opening.move` has a pass-through rule). The flat form is recognised by its own `id`;
 * a payload carrying NEITHER `openingData` NOR a flat identity is not this command.
 */
export function normalizeToWallOpeningCreate(command: PreviewCommand): SemanticCommand | null {
  if (command.type !== 'wall.opening.create') return null;
  const p = command.payload as Partial<WallOpeningCreateAdapterPayload> &
    Partial<{ id: string; offset: number; width: number; openingType: string; openingId: string; height: number; sillHeight: number }> | undefined | null;
  if (!p || typeof p !== 'object') return null;
  const d = p.openingData;
  if (d && typeof d === 'object') {
    return wallOpeningCreateFrom(
      (typeof d.elementId === 'string' && d.elementId.length > 0 ? d.elementId : d.id),
      p.wallId, d.offset, d.width, d.type, d.id, d.height, d.sillHeight,
    );
  }
  return wallOpeningCreateFrom(
    p.id, p.wallId, p.offset, p.width, p.openingType, p.openingId, p.height, p.sillHeight,
  );
}

/** `wall.createOpening` (the authoritative path both create-refusals cite) → the semantic
 *  command. The handler's own shape: `{ wallId, opening: { id, elementId, type, offset,
 *  width, height, sillHeight } }`, with `elementId` the bus identity. */
export function normalizeToWallOpeningCreateFromLegacy(
  command: PreviewCommand,
): SemanticCommand | null {
  if (command.type !== 'wall.createOpening') return null;
  const p = command.payload as Partial<CreateWallOpeningPayload> | undefined | null;
  if (!p || typeof p !== 'object') return null;
  const o = p.opening;
  if (!o || typeof o !== 'object') return null;
  return wallOpeningCreateFrom(
    (typeof o.elementId === 'string' && o.elementId.length > 0 ? o.elementId : o.id),
    p.wallId, o.offset, o.width, o.type, o.id, o.height, o.sillHeight,
  );
}

/**
 * `door.create` → the semantic `wall.opening.create` (openingType 'door').
 *
 * `offset` and `width` must be EXPLICIT in the payload. The handler's own default chain
 * runs `cmd.width ?? getDoorType(systemTypeId)?.width ?? 0.9` — a TYPE-REGISTRY lookup
 * this surface deliberately does not consult (a normaliser translates; it does not
 * resolve registries), and answering with the base literal while a `systemTypeId` is
 * present would plan a width the handler would not commit. A defaulted dispatch
 * therefore normalises to `null` — the typed capability-gap answer — never to a span
 * assembled from guessed numbers.
 *
 * The subject id is `cmd.id` when the caller supplied one, else `cmd.openingId` — the
 * payload's only other STABLE identity (the wall-side opening id, which C15 §1 pairs 1:1
 * with the hosted element). The handler's `createId('door')` fallback is NOT mirrored:
 * minting is nondeterministic and minting is not translating.
 */
export function normalizeToWallOpeningCreateFromDoor(
  command: PreviewCommand,
): SemanticCommand | null {
  if (command.type !== 'door.create') return null;
  const p = command.payload as Partial<HostedElementCreatePayload> | undefined | null;
  if (!p || typeof p !== 'object') return null;
  if (typeof p.openingId !== 'string' || p.openingId.length === 0) return null;
  return wallOpeningCreateFrom(
    (typeof p.id === 'string' && p.id.length > 0 ? p.id : p.openingId),
    p.wallId, p.offset, p.width, 'door', p.openingId, p.height, p.sillHeight,
  );
}

/** `window.create` → the semantic `wall.opening.create` (openingType 'window'). Same
 *  shape and same rules as the door rule, differing only in the element kind. */
export function normalizeToWallOpeningCreateFromWindow(
  command: PreviewCommand,
): SemanticCommand | null {
  if (command.type !== 'window.create') return null;
  const p = command.payload as Partial<HostedElementCreatePayload> | undefined | null;
  if (!p || typeof p !== 'object') return null;
  if (typeof p.openingId !== 'string' || p.openingId.length === 0) return null;
  return wallOpeningCreateFrom(
    (typeof p.id === 'string' && p.id.length > 0 ? p.id : p.openingId),
    p.wallId, p.offset, p.width, 'window', p.openingId, p.height, p.sillHeight,
  );
}

// ─── opening.delete — the hosted-opening DELETE family (2026-08-14) ───────────────────
//
// The C69 register carries TWO consequential delete-class verbs for wall-hosted openings —
// `door.delete` (plugins/door DeleteDoorHandler, payload `{ doorId }`) and `window.delete`
// (plugins/window DeleteWindowHandler, payload `{ windowId }`). Both name ONE atomic
// semantic operation: remove a hosted opening from whichever wall records it in
// `openings[]`. check-relationship-determination counted both as silent-dispatch — every
// one of their 41 relationship cells yielded C78 §1.1's forbidden fourth answer — because
// no rule mapped them onto a composed planner.
//
// The family lands WHOLE (C78 §19.1: both verbs or neither) onto ONE planner,
// `OpeningDeleteConsequencePlanner`, exactly as the move row landed `door.setOffset` /
// `window.setOffset` and the create row landed its four spellings. The rules are KEY
// RENAMES and nothing else: neither payload carries a host (the planner's reverse-scan
// branch over the C15 §1 record is the resolution path, and inventing a `wallId` here
// would move a real UNDETERMINED out of reach), neither carries geometry, and neither
// needs a registry lookup. `openingType` is set from the VERB, which is the one fact the
// verb spelling genuinely determines — it reaches only the declaration sentences and never
// decides anything geometric.
//
// NOT mapped here, deliberately: `wall.delete` (deletes the HOST — a different
// relationship set and the next family) and `element.delete` (the generic
// type-dispatching legacy verb, which would hand this planner a beam).

/** The `door.delete` payload (plugins/door DeleteDoorPayload). */
interface DoorDeletePayload {
  readonly doorId: string;
  /** Some call sites carry the host; neither live verb requires it. Forwarded when present. */
  readonly wallId?: string;
}

/** The `window.delete` payload (plugins/window DeleteWindowPayload). Same shape, different key. */
interface WindowDeletePayload {
  readonly windowId: string;
  readonly wallId?: string;
}

/**
 * Build the semantic `opening.delete` command from a hosted-element delete dispatch, or
 * `null` when no well-formed delete can be stated. The element id is REQUIRED and is the
 * ONLY required field: a delete needs no span, no offset and no host to be a well-posed
 * question, which is exactly why this family's rules are shorter than the create family's.
 */
function openingDeleteFrom(
  elementId: unknown,
  openingType: 'door' | 'window' | undefined,
  wallId: unknown,
): SemanticCommand | null {
  if (typeof elementId !== 'string' || elementId.length === 0) return null;
  return {
    type: 'opening.delete',
    payload: {
      id: elementId,
      ...(typeof wallId === 'string' && wallId.length > 0 ? { wallId } : {}),
      ...(openingType ? { openingType } : {}),
    },
  };
}

/** `door.delete` → the semantic `opening.delete`. */
export function normalizeToOpeningDeleteFromDoor(command: PreviewCommand): SemanticCommand | null {
  if (command.type !== 'door.delete') return null;
  const p = command.payload as Partial<DoorDeletePayload> | undefined | null;
  if (!p || typeof p !== 'object') return null;
  return openingDeleteFrom(p.doorId, 'door', p.wallId);
}

/** `window.delete` → the semantic `opening.delete`. */
export function normalizeToOpeningDeleteFromWindow(command: PreviewCommand): SemanticCommand | null {
  if (command.type !== 'window.delete') return null;
  const p = command.payload as Partial<WindowDeletePayload> | undefined | null;
  if (!p || typeof p !== 'object') return null;
  return openingDeleteFrom(p.windowId, 'window', p.wallId);
}

/**
 * `opening.delete` dispatched under its own SEMANTIC name — a validating pass-through, the
 * same shape as `normalizeToOpeningMove` and `normalizeToWallCreate`, and present for the
 * same reason: the AI/parity surfaces and the certification harnesses dispatch the semantic
 * verb directly, and a family reachable only through its two plugin bus spellings would be
 * a family the reasoning surfaces cannot address.
 */
export function normalizeToOpeningDelete(command: PreviewCommand): SemanticCommand | null {
  if (command.type !== 'opening.delete') return null;
  const p = command.payload as
    | Partial<{ id: string; wallId: string; openingType: 'door' | 'window' }>
    | undefined
    | null;
  if (!p || typeof p !== 'object') return null;
  const t = p.openingType === 'door' || p.openingType === 'window' ? p.openingType : undefined;
  return openingDeleteFrom(p.id, t, p.wallId);
}

// ─── wall.delete — the WALL (host-side) DELETE family (2026-08-15) ────────────────────
//
// ENUMERATED FROM THE REGISTER, never hand-listed (C69's rival-list rule). The
// denominator is the GENERATED `docs/04-reference/API-VERB-REGISTER.md`, the same file
// check-relationship-determination parses. Filtered by that gate's own `opClassOf`, the
// verbs able to remove a wall are exactly three, and this family is ONE of them:
//
//   `wall.delete`         (row 339 · plugins/wall DeleteWall.ts · payload `{ id }`) — HERE.
//   `element.delete`      (row 129) — the generic TYPE-DISPATCHING legacy verb; it resolves
//                         a kind at runtime, so mapping it here would plan a wall delete
//                         for a beam. Excluded, exactly as the opening-delete family
//                         excluded it (9e780581).
//   `element.deleteBatch` (row 130) — generic AND outside the gate's own consequential
//                         denominator (`opClassOf` returns null for a `deleteBatch` tail).
//
// MEASURED ABSENT: `wall.batch.delete`, `wall.deleteBatch`, `walls.delete` and
// `wall.remove` do not exist anywhere in the tree. There is no batch-delete counterpart to
// `wall.batch.create`. So this family is ONE verb — and, unlike the hosted-opening rows,
// the register spelling IS the semantic spelling, as it already is for `wall.create` and
// `wall.move`. No second rule is minted for a spelling nothing dispatches.
//
// THE PAYLOAD KEY IS NOT SETTLED IN-TREE. `DeleteWallHandler` reads `cmd.id`, but the
// cross-plugin cascade rule `plugins/cross/src/wall-room.ts:87-96` — the rule that fires on
// THIS verb to synthesise `room.recomputeBoundary` — reads `payload.wallId` first and falls
// back to `payload.id`. This rule mirrors that precedence VERBATIM so the planner and the
// wall→room cascade always name the same wall; a third order would let one dispatch be
// explained two ways. `payload.targetId` (packages/sync-client's chaos generator) is a
// TEST-ONLY spelling with no production dispatcher behind it and is deliberately NOT
// accepted — normalising a fixture's shape would make the family answer for a dispatch
// nobody emits.

/** The `wall.delete` payload, in the two live spellings its two readers disagree over. */
interface WallDeletePayload {
  readonly id?: string;
  readonly wallId?: string;
}

/**
 * `wall.delete` → the semantic `wall.delete`. A validating KEY RENAME and nothing else: no
 * geometry is invented, no host is inferred, and no registry is consulted. `null` — a
 * capability gap, never a plan about an invented element — when no id is carried at all.
 *
 * NOTE the deliberate asymmetry with the planner: an EMPTY-STRING id normalises through
 * (it is a well-formed dispatch of a malformed command) so that the planner's mirrored
 * `cmd.id must be a non-empty string` REFUSAL is reachable. Filtering it here would hide a
 * real refusal branch behind a silent null.
 */
export function normalizeToWallDelete(command: PreviewCommand): SemanticCommand | null {
  if (command.type !== 'wall.delete') return null;
  const p = command.payload as Partial<WallDeletePayload> | undefined | null;
  if (!p || typeof p !== 'object') return null;
  const id = typeof p.wallId === 'string' ? p.wallId : typeof p.id === 'string' ? p.id : undefined;
  if (id === undefined) return null;
  return { type: 'wall.delete', payload: { id } };
}

// ─── wall.batch.create — the BATCH create family (2026-08-16) ─────────────────────────
//
// ENUMERATED FROM THE REGISTER, never hand-listed (C69's rival-list rule). Filtered by
// check-relationship-determination's own `opClassOf` — which classes a verb `batch` when
// `batch` is a SEGMENT of it — the register carries exactly TWELVE batch verbs, and exactly
// ONE of them creates walls:
//
//   `wall.batch.create`  (row 329 · plugins/wall CreateWallBatch.ts · `{walls, levelId?}`) — HERE.
//
// MEASURED ABSENT: `wall.batch.update`, `wall.batch.delete`, `walls.batch.create`,
// `wall.createBatch` exist nowhere in the tree. `curtain-wall.batch.*` is a different element
// family (its own three verbs, its own handler, its own store).
//
// ⚠ FIVE WALL VERBS THE DENOMINATOR NEVER MEASURES — named, not silently absorbed. The
// register also carries `wall.addLayerBatch`, `wall.updateColorBatch`, `wall.updateHeightBatch`,
// `wall.updateRakeBatch` and `wall.updateSystemTypeBatch`. Each mutates N walls in one
// dispatch, and `opClassOf` returns NULL for all five, because `Batch` there is a SUFFIX
// inside the last segment rather than a segment of its own — so they are outside the 100-verb
// consequential set and outside the 4,100 cells entirely. That is an INHERITED gap in the
// gate's classifier, identical in shape to `element.deleteBatch` as the wall.delete family
// (d572fb7e) recorded it. Mapping them here would NOT move the bar-3 number and would attach
// a wall-CREATE planner to five UPDATE verbs, so they are recorded as a gap and left alone.
//
// ── NOT AN ALIAS OF `wall.create` ────────────────────────────────────────────────────
// It would be cheap to point this verb at the `wall.create` planner key and call the family
// landed. That would be WRONG, and the reason is the same one that settles the one-plan-or-N
// question: a batch's junction question is a diff over the WHOLE candidate set, and no
// per-candidate decomposition reproduces it (leave-one-out admits a false DETERMINED-unaffected
// for a wall two candidates jointly re-cut; one-at-a-time misses every candidate↔candidate
// junction, which is most of a generator batch). Same substrate, different question, own key.

/** The `wall.batch.create` payload — `CreateWallBatchPayload`, the one live spelling. */
interface WallBatchCreatePayload {
  readonly walls?: unknown;
  readonly levelId?: unknown;
}

/**
 * `wall.batch.create` → the semantic `wall.batch.create`. The bus verb and the semantic verb
 * are the SAME here — as they already are for `wall.create` and `wall.delete` — so this rule
 * is a VALIDATING pass-through rather than a rename. It is still a rule and not a special
 * case in the service, because the validation is real and because the service names no verb.
 *
 * Deliberately PERMISSIVE, and MORE so than `normalizeToWallCreate`: a payload whose `walls`
 * is absent, empty, or not an array normalises THROUGH. That is not laxity — it is what keeps
 * the planner's mirrored `walls must be a non-empty array` REFUSAL reachable. Filtering those
 * shapes here would replace the commit path's own refusal sentence with a silent `null`,
 * which the executor renders as "no normaliser for this verb" — a CAPABILITY GAP. A malformed
 * batch would then be indistinguishable from an unsupported one, which is exactly the
 * same-value defect (C78 §1.4) this family exists to remove. Only a structurally absent
 * payload is refused, matching `normalizeToWallCreate`'s single guard.
 */
export function normalizeToWallBatchCreate(command: PreviewCommand): SemanticCommand | null {
  if (command.type !== 'wall.batch.create') return null;
  const p = command.payload as WallBatchCreatePayload | undefined | null;
  if (p === null || p === undefined || typeof p !== 'object') return null;
  return { type: 'wall.batch.create', payload: p };
}

/**
 * THE canonical normaliser registry — bus verb → rule. The three composition roots share
 * this ONE map, for the same reason preview and execute shared ONE normaliser function
 * before it: two registries would let preview and execute form different semantic
 * commands for one dispatch (the G-REASON-03 divergence class).
 */
export const CONSEQUENCE_NORMALIZERS: ReadonlyMap<string, NormalizerRule> = new Map<
  string,
  NormalizerRule
>([
  ['wall.move', normalizeToWallMove],
  ['wall.updateBaseline', normalizeToWallMove],
  ['wall.create', normalizeToWallCreate],
  // The third matrix row — one semantic planner key, three dispatch spellings.
  ['opening.move', normalizeToOpeningMove],
  ['door.setOffset', normalizeToOpeningMoveFromDoor],
  ['window.setOffset', normalizeToOpeningMoveFromWindow],
  // The register move-verbs of the SAME family (refused-but-semantic, the wall.move shape) —
  // five dispatch spellings, ONE semantic planner key, one occupancy rule, one answer.
  ['door.move', normalizeToOpeningMoveFromDoorMove],
  ['window.move', normalizeToOpeningMoveFromWindowMove],
  // The hosted-opening CREATE family (2026-08-14) — four dispatch spellings, ONE semantic
  // planner key, the SAME canPlace rule the commit path runs, one answer.
  ['wall.opening.create', normalizeToWallOpeningCreate],
  ['wall.createOpening', normalizeToWallOpeningCreateFromLegacy],
  ['door.create', normalizeToWallOpeningCreateFromDoor],
  ['window.create', normalizeToWallOpeningCreateFromWindow],
  // The hosted-opening DELETE family (2026-08-14) — the two C69 register verbs plus the
  // semantic spelling, ONE planner key, one host-resolution rule (the SAME reverse scan
  // over the C15 §1 record the move row uses), one answer.
  ['opening.delete', normalizeToOpeningDelete],
  ['door.delete', normalizeToOpeningDeleteFromDoor],
  ['window.delete', normalizeToOpeningDeleteFromWindow],
  // The WALL (host-side) DELETE family (2026-08-15) — ONE register verb, ONE planner key.
  // A different relationship set from the hosted-opening row above: the wall's CHILDREN,
  // its JOINED walls' mitres, and the ROOMS it bounds. `element.delete` /
  // `element.deleteBatch` are NOT mapped — they are the generic type-dispatching verbs.
  ['wall.delete', normalizeToWallDelete],
  // The BATCH create family (2026-08-16) — ONE register verb, ONE planner key, and the first
  // batch-class verb to reach a planner. NOT pointed at `wall.create`: same substrate, but a
  // batch's junction question is a whole-set diff no per-candidate decomposition reproduces.
  ['wall.batch.create', normalizeToWallBatchCreate],
]);

/**
 * The GENERIC normalise entry point. Looks the verb up in `registry` and applies its
 * rule; unknown verbs answer `null` exactly as the per-verb function did, so the typed
 * `no-normalizer-for-verb` path downstream is unchanged.
 *
 * The registry is a PARAMETER with a default so tests can drive a narrower or wider set
 * without mutating module state — the same injection discipline every other collaborator
 * in this subsystem follows.
 */
export function normalizeConsequenceCommand(
  command: PreviewCommand,
  registry: ReadonlyMap<string, NormalizerRule> = CONSEQUENCE_NORMALIZERS,
): SemanticCommand | null {
  return registry.get(command.type)?.(command) ?? null;
}

export class ConsequencePreviewService implements ConsequencePreviewProvider {
  /**
   * @param planners      keyed by the CANONICAL (semantic) command type, e.g. `'wall.move'`.
   * @param context       a factory that materialises the read-only `PlanningContext` from
   *                      the live stores at the moment of preview — the planner never
   *                      reaches for globals; the caller supplies the views (consequence.ts).
   */
  /**
   * @param planners   keyed by the CANONICAL (semantic) command type, e.g. `'wall.move'`,
   *                   `'wall.create'`. The value type is `ConsequencePlanner<never>` —
   *                   the FAMILY-AGNOSTIC form. It used to be
   *                   `ConsequencePlanner<WallMoveCommand>`, which made the map's key
   *                   generic but its VALUE single-family: a `wall.create` planner could
   *                   not be put in it without a cast, and the commit that authored one
   *                   declared exactly this as its blocker. `never` is the correct
   *                   variance here — a planner accepting `never` accepts whatever its
   *                   own normaliser rule produced, and the pairing of rule↔planner (not
   *                   the map's type) is what keeps them in step.
   * @param context    a factory that materialises the read-only `PlanningContext` from
   *                   the live stores at the moment of preview — the planner never
   *                   reaches for globals; the caller supplies the views (consequence.ts).
   * @param normalizers the bus-verb → semantic-command registry. Injected (default:
   *                   {@link CONSEQUENCE_NORMALIZERS}) so this service hard-codes NO verb
   *                   name at all — C78 §5 / U-INV-5.
   */
  constructor(
    private readonly planners: ReadonlyMap<string, ConsequencePlanner<never>>,
    private readonly context: () => PlanningContext,
    private readonly normalizers: ReadonlyMap<string, NormalizerRule> = CONSEQUENCE_NORMALIZERS,
  ) {}

  async preview(command: PreviewCommand): Promise<ConsequencePlan | null> {
    const normalized = this.normalize(command);
    if (!normalized) return null;
    const planner = this.planners.get(normalized.type);
    if (!planner) return null;
    // The ONE call. `plan()` is contractually pure (G-REASON-01): no dispatch, no bus, no
    // store write, no event, no undo push. This service adds nothing on top — it routes
    // and returns. That is the whole reason preview is not an `executeCommand` mode.
    return planner.plan(normalized as never, this.context());
  }

  /** Delegates to the module-level GENERIC normaliser — ONE rule set, three consumers. */
  private normalize(command: PreviewCommand): SemanticCommand | null {
    return normalizeConsequenceCommand(command, this.normalizers);
  }
}
