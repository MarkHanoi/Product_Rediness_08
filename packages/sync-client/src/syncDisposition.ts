// @pryzm/sync-client — SYNC DISPOSITION DECLARATIONS (W5-3)
//
// ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
//
// Before W5-3, `YjsDocAdapter.applyCommand()` wrote a payload into the CRDT doc
// only when the payload carried a top-level `id` key:
//
//     const elementId = String(payload['id'] ?? '');
//     if (!elementId) return;            // ← SILENT DROP
//
// Every `*.create` verb in this repository keys its payload `id`.  Essentially
// no PROPERTY-MUTATION verb does: they key `wallId`, `elementId`, `slabId`,
// `ceilingId`, `wallIds`, … .  The consequence was not "property sync is
// approximate"; it was that a collaborator's document kept the value from
// element CREATION forever, and the drop raised nothing anywhere.  Two users in
// one model: A raises a wall to 5 m, B's document still says 3 m — confidently,
// not emptily.  Failure and emptiness had the same value (they still had a
// height; it was simply the wrong one).
//
// ─── THE SHAPE OF THE FIX ────────────────────────────────────────────────────
//
// The fix is NOT a per-property special case inside the adapter.  It is a
// declaration: for each command type, WHERE the subject element id lives and
// WHERE its properties live.  Given that, the adapter's path is generic — every
// remaining payload key is a property and lands on the element's CRDT record.
// **A new property on an already-declared verb needs no new sync code.**
//
// It is also, per P8, a path whose GAPS ARE DETECTABLE.  A command type absent
// from this table is not silently skipped: `YjsDocAdapter` records it in
// `getUndeclaredCommandTypes()`, and `tools/ga-gate/check-sync-disposition.ts`
// fails the build for any authoritative property-mutation verb that is neither
// declared here nor explicitly declared NOT-SYNCED with a written reason.
//
// ─── WHAT THIS FILE DELIBERATELY DOES NOT CLAIM ──────────────────────────────
//
// C66 §1.1: a claimed capability and a measured one must not be written the same
// way.  Declaring a verb here means "its payload reaches the CRDT document and a
// receiving document can read the property back".  It does NOT mean the
// receiving CLIENT re-renders — no code reads the canonical element map back
// into local stores yet, and no CRDT transport is deployed in production
// (L-391).  See the `README` note in this package and the W5-3 report.

/**
 * How a merge that loses one side's value is handled for a property class.
 *
 * `'disclose'`  — P8 default.  If a remote update overwrites a value THIS
 *                 document changed locally and had not yet exchanged, the
 *                 adapter emits a `CRDTConflict` so the user resolves it.
 *                 Yjs still converges (it must); disclosure is additive.
 *
 * `'last-writer-wins'` — silent convergence is ACCEPTABLE for this property,
 *                 and the declaration MUST say why in `lwwReason`.  P8 forbids
 *                 silent loss by default; this is the documented exception, not
 *                 the fallback.
 */
export type ConflictPolicy = 'disclose' | 'last-writer-wins';

/** A command type whose payload mutates properties of an identified element. */
export interface ElementPropertyDisposition {
  readonly kind: 'element-property';
  /**
   * Payload key naming the subject element id.  MUST resolve to a string at
   * runtime; if it does not, the adapter records an unresolved subject rather
   * than dropping the command silently.
   */
  readonly subject: string;
  /**
   * When set, the mutated properties live in a nested bag under this payload
   * key (e.g. `element.updateParameters` → `parameters`, `roof.update` →
   * `updates`) rather than at the payload's top level.
   */
  readonly nested?: string;
  /**
   * Payload keys that are routing/metadata, not properties of the element.
   * Keys beginning with `_` are excluded globally and need not be listed.
   */
  readonly exclude?: readonly string[];
  readonly conflict: ConflictPolicy;
  /** Required when `conflict === 'last-writer-wins'` — why silence is OK here. */
  readonly lwwReason?: string;
}

/** A command type that is deliberately NOT replicated, with a stated reason. */
export interface NotSyncedDisposition {
  readonly kind: 'not-synced';
  /** Why. An empty or placeholder reason is a gate failure, not a disposition. */
  readonly reason: string;
}

export type SyncDisposition = ElementPropertyDisposition | NotSyncedDisposition;

/**
 * Property keys excluded from EVERY element-property declaration.
 *
 * `levelId` is CRDT ROUTING (ADR-049 per-level doc selection), not a property.
 * The `_`-prefixed keys are local dispatch flags (`_skipBridge`, `_recordUndo`,
 * `_prevPosition`, …) — replicating them would make a collaborator re-run local
 * bridge behaviour.  Excluded by prefix rather than by enumeration so a new
 * private flag does not silently become replicated state.
 */
export const GLOBAL_PROPERTY_EXCLUDES: readonly string[] = ['levelId'];

/**
 * ─── THE TABLE ─────────────────────────────────────────────────────────────
 *
 * Declared here = the adapter has a general path for it.  A verb NOT in this
 * table is reported by `getUndeclaredCommandTypes()` and, if the gate's
 * property-verb heuristic matches it, fails `check-sync-disposition.ts`.
 */
export const SYNC_DISPOSITIONS: Readonly<Record<string, SyncDisposition>> = {
  // ── Creation verbs ─────────────────────────────────────────────────────────
  // Declared so a create and a later property edit land on the SAME canonical
  // element record; otherwise the update would merge onto nothing.
  'wall.create':   { kind: 'element-property', subject: 'id', conflict: 'disclose' },
  'slab.create':   { kind: 'element-property', subject: 'id', conflict: 'disclose' },
  'door.create':   { kind: 'element-property', subject: 'id', conflict: 'disclose' },
  'opening.create':{ kind: 'element-property', subject: 'id', conflict: 'disclose' },
  'stair.create':  { kind: 'element-property', subject: 'id', conflict: 'disclose' },

  // ── Generic element property routes ────────────────────────────────────────
  // The property panel's and the RAC chat's live single-element route.
  'element.updateParameters': {
    kind: 'element-property',
    subject: 'elementId',
    nested: 'parameters',
    exclude: ['elementType'],
    conflict: 'disclose',
  },
  'element.updateMark': {
    kind: 'element-property',
    subject: 'elementId',
    exclude: ['elementType'],
    conflict: 'disclose',
  },

  // ── Wall ───────────────────────────────────────────────────────────────────
  'wall.updateDimensions': { kind: 'element-property', subject: 'wallId', conflict: 'disclose' },
  'wall.updateSystemType': { kind: 'element-property', subject: 'wallId', conflict: 'disclose' },
  'wall.updateBaseline': {
    kind: 'element-property',
    subject: 'wallId',
    // `prevBaseLine` is undo bookkeeping carried in the payload — the element's
    // state is `newBaseLine`.  Replicating the previous value would let a peer
    // reconstruct an older geometry as if it were current.
    exclude: ['prevBaseLine'],
    conflict: 'disclose',
  },
  'wall.updateCurtainWall': {
    kind: 'element-property', subject: 'id', nested: 'updates', conflict: 'disclose',
  },

  // ── Slab / floor / ceiling / roof ──────────────────────────────────────────
  'slab.update':         { kind: 'element-property', subject: 'id',        conflict: 'disclose' },
  'slab.updateLayers':   { kind: 'element-property', subject: 'slabId',    conflict: 'disclose' },
  'slab.updatePolygon':  { kind: 'element-property', subject: 'slabId',    conflict: 'disclose' },
  'floor.updateLayers':  { kind: 'element-property', subject: 'floorId',   conflict: 'disclose' },
  'floor.setMaterial':   { kind: 'element-property', subject: 'floorId',   conflict: 'disclose' },
  'ceiling.update':      { kind: 'element-property', subject: 'ceilingId', nested: 'updates', conflict: 'disclose' },
  'ceiling.updateLayers':{ kind: 'element-property', subject: 'ceilingId', conflict: 'disclose' },
  'roof.update':         { kind: 'element-property', subject: 'id',        nested: 'updates', conflict: 'disclose' },

  // ── Stair / furniture / room ───────────────────────────────────────────────
  'stair.updateParameters':     { kind: 'element-property', subject: 'stairId', nested: 'updates', conflict: 'disclose' },
  'furniture.updateParameters': { kind: 'element-property', subject: 'id',      conflict: 'disclose' },
  'room.rename': {
    kind: 'element-property',
    subject: 'roomId',
    // A room's NAME is a label, not geometry.  Two users renaming the same room
    // concurrently lose nothing recoverable by re-typing, and disclosing it
    // would train users to dismiss the conflict dialog — which is how a
    // dimension conflict later gets dismissed too.
    conflict: 'last-writer-wins',
    lwwReason:
      'Free-text label with no geometric dependents; the losing side is trivially ' +
      're-entered, and conflict fatigue on a label devalues disclosure where it matters.',
  },

  // ── Curtain wall ───────────────────────────────────────────────────────────
  'curtain-wall.addGridLine':    { kind: 'element-property', subject: 'curtainWallId', conflict: 'disclose' },
  'curtain-wall.removeGridLine': { kind: 'element-property', subject: 'curtainWallId', conflict: 'disclose' },
  'curtain-wall.replacePanel':   { kind: 'element-property', subject: 'panelId',       conflict: 'disclose' },

  // ── NOT SYNCED — batch verbs with a late-bound subject ─────────────────────
  //
  // These take `xIds: readonly string[] | 'all'`.  When the caller passes
  // `'all'`, the SUBJECT SET DOES NOT EXIST IN THE PAYLOAD — it is resolved
  // inside the command against the local store, and the resulting id list is
  // reported only on a `pryzm-*-batch-report` window CustomEvent.  The adapter
  // cannot enumerate it without either (a) reading a store, which an L3 sync
  // package must not do, or (b) the HANDLER passing `affectedElementIds` back
  // through the command record.
  //
  // (b) is the correct fix and it is a PLUGIN HANDLER CHANGE — out of this
  // agent's ownership.  Declared NOT-SYNCED with the seam named rather than
  // wired against a subject that may be the literal string 'all'.
  'wall.updateColorBatch': {
    kind: 'not-synced',
    reason:
      'SEAM: subject is `wallIds: string[] | "all"`, resolved inside ' +
      'UpdateWallsColorBatchCommand. The adapter cannot enumerate "all" without ' +
      'reading a store (forbidden at L3). Needs the handler to surface ' +
      'affectedElementIds on the command record — plugins/wall handler change.',
  },
  'wall.updateRakeBatch': {
    kind: 'not-synced',
    reason: 'SEAM: same late-bound `wallIds: "all"` subject as wall.updateColorBatch.',
  },
  // §W5-3-SEAM (2026-08-11) — authored in the same session that built this table,
  // and declared not-synced for the SAME structural reason as its four siblings,
  // not as a convenience. `wall.updateHeightBatch` takes `wallIds: string[] | 'all'`.
  //
  // This is the sharpest instance of the seam: the RAC's strongest capabilities are
  // its LEAST syncable, because every mass edit the chat can actually perform is
  // late-bound. Declaring it synced would be worse than declaring it not-synced —
  // the adapter would replicate the literal string "all", which means a different
  // set of walls on the receiving document.
  'wall.updateHeightBatch': {
    kind: 'not-synced',
    reason: 'SEAM: same late-bound `wallIds: "all"` subject as wall.updateColorBatch.',
  },
  'wall.addLayerBatch': {
    kind: 'not-synced',
    reason: 'SEAM: same late-bound `wallIds: "all"` subject as wall.updateColorBatch.',
  },
  'wall.updateSystemTypeBatch': {
    kind: 'not-synced',
    reason: 'SEAM: same late-bound `wallIds: "all"` subject as wall.updateColorBatch.',
  },
  'slab.updateSystemTypeBatch': {
    kind: 'not-synced',
    reason: 'SEAM: late-bound `slabIds: "all"` subject; see wall.updateColorBatch.',
  },
  'ceiling.updateSystemTypeBatch': {
    kind: 'not-synced',
    reason: 'SEAM: late-bound `ceilingIds: "all"` subject; see wall.updateColorBatch.',
  },
  'door.updateSystemTypeBatch': {
    kind: 'not-synced',
    reason: 'SEAM: late-bound `doorIds: "all"` subject; see wall.updateColorBatch.',
  },
  'window.updateSystemTypeBatch': {
    kind: 'not-synced',
    reason: 'SEAM: late-bound `windowIds: "all"` subject; see wall.updateColorBatch.',
  },

  // ── NOT SYNCED — detached DTO stores (BLOCKED ON W3-3) ─────────────────────
  //
  // These verbs `produceCommand` a plugin-local DTO store that NOTHING renders,
  // exports or persists (§FIX-MATERIAL-DEAD-DISPATCH; ADR-0314 §Wall colour).
  // A dead verb cannot reach sync, and wiring sync to a detached DTO store
  // would be wiring sync to nothing — it would make the CRDT document a fourth
  // source of truth for a value the model does not hold.  These are declared
  // NOT-SYNCED so the gate holds them, and are re-classified once W3-3 either
  // deletes them or reattaches them to authoritative state.
  'wall.bulkSetVisuals': { kind: 'not-synced', reason: 'BLOCKED-ON-W3-3: writes a detached plugin DTO store nothing reads.' },
  'wall.setColor':       { kind: 'not-synced', reason: 'BLOCKED-ON-W3-3: writes a detached plugin DTO store nothing reads.' },
  'wall.setDimensions':  { kind: 'not-synced', reason: 'BLOCKED-ON-W3-3: writes a detached plugin DTO store nothing reads.' },
  'wall.setLayers':      { kind: 'not-synced', reason: 'BLOCKED-ON-W3-3: writes a detached plugin DTO store nothing reads.' },

  // ── NOT SYNCED — per-viewer state, correctly local ─────────────────────────
  //
  // P7: visibility INTENT is a domain concept, but a VIEW is one user's window.
  // Replicating these would drag a collaborator's camera and hide elements out
  // from under them.  Not-synced here is the correct behaviour, not a gap.
  'view.switch':          { kind: 'not-synced', reason: 'Per-viewer navigation state; replicating it would move a collaborator\'s view.' },
  'view.updateCamera':    { kind: 'not-synced', reason: 'Per-viewer camera; C66 §4 lists CameraPositionService as the local owner.' },
  'view.setCrop':       { kind: 'not-synced', reason: 'Crop region of one user\'s open view; replicating it would resize a collaborator\'s viewport mid-edit.' },
  'view.setRange':      { kind: 'not-synced', reason: 'Cut-plane / depth range of one user\'s open view; replicating it would hide geometry a collaborator is working on.' },
  'view.setProjection': { kind: 'not-synced', reason: 'Ortho/perspective choice of one user\'s open view; replicating it would flip a collaborator\'s projection under them.' },
  'view.setUnderlay':   { kind: 'not-synced', reason: 'Underlay layer shown beneath one user\'s open view; a per-viewer reference aid, not model state.' },
  'view.setOutput':     { kind: 'not-synced', reason: 'Print/export output settings of one user\'s open view; consumed at that user\'s export time only.' },
  'element.hideInView':   { kind: 'not-synced', reason: 'Per-viewer visibility override, scoped to one user\'s view (P7 intent lives in packages/visibility).' },
  'element.isolateInView':{ kind: 'not-synced', reason: 'Per-viewer isolation, scoped to one user\'s view.' },
  'selection.select':     { kind: 'not-synced', reason: 'Selection is per-user; it travels over PRESENCE/awareness, not the document.' },
  'selection.clear':      { kind: 'not-synced', reason: 'Selection is per-user; see selection.select.' },

  // ── NOT SYNCED — views are not replicated at all, and that is UNDECIDED ─────
  //
  // A VIEW DEFINITION is arguably shared document state (a named plan view one
  // user creates ought to appear for the others), unlike the per-viewer camera
  // above.  W5-3 did NOT decide that, and declaring it 'element-property' would
  // assert a product decision this task has no authority to make.  Declared
  // NOT-SYNCED with the open question written down rather than left as an
  // absence that reads like a settled answer.
  'view.rename': {
    kind: 'not-synced',
    reason:
      'OPEN QUESTION: view DEFINITIONS may belong to the shared document (a named ' +
      'view one user creates arguably should appear for others), unlike the ' +
      'per-viewer camera. W5-3 did not decide it and does not assert an answer.',
  },
  'view.updateDefinition': { kind: 'not-synced', reason: 'OPEN QUESTION: see view.rename — view definitions may be shared document state; undecided.' },
  'view.create':           { kind: 'not-synced', reason: 'OPEN QUESTION: see view.rename — view definitions may be shared document state; undecided.' },
  'view.delete':           { kind: 'not-synced', reason: 'OPEN QUESTION: see view.rename — view definitions may be shared document state; undecided.' },
  'element.setGraphicOverride': {
    kind: 'not-synced',
    reason:
      'A graphic override is keyed by (viewId, elementId) — its subject is a PAIR, ' +
      'not an element. The adapter\'s element-property path is single-subject, and ' +
      'views are unreplicated (see view.rename). Needs a composite-subject disposition.',
  },

  // ── NOT SYNCED — subjects the single-subject path cannot express ───────────
  'wall.cascadeBaseline': {
    kind: 'not-synced',
    reason:
      'Subject is an `entries[]` array of per-wall baselines — MULTI-SUBJECT. The ' +
      'element-property path resolves exactly one id per dispatch; wiring this needs ' +
      'a multi-subject disposition kind. Not a silent gap: declared and unwired.',
  },
  'level.add': {
    kind: 'not-synced',
    reason:
      'A LEVEL is not an element: it is coordination-doc state with its own ADR-049 ' +
      'routing (levelId selects the doc, so it cannot also be a record within one). ' +
      'Needs a coordination-scope disposition kind; W5-3 did not wire it.',
  },
  'projectOrigin.setVisible': {
    kind: 'not-synced',
    reason: 'Per-viewer display toggle for the origin marker; not model state.',
  },
  'projectOrigin.setPosition': {
    kind: 'not-synced',
    reason:
      'Shared model datum, but a PROJECT SINGLETON with no element id — the ' +
      'element-property path has no subject to key it by. Needs a document-scope ' +
      'disposition kind. Declared unwired rather than left undeclared.',
  },
};

/** Look up a command type's declared disposition, or `undefined` if undeclared. */
export function getSyncDisposition(commandType: string): SyncDisposition | undefined {
  return Object.prototype.hasOwnProperty.call(SYNC_DISPOSITIONS, commandType)
    ? SYNC_DISPOSITIONS[commandType]
    : undefined;
}

/** Every command type carrying a declaration.  Used by the GA gate. */
export function declaredCommandTypes(): readonly string[] {
  return Object.keys(SYNC_DISPOSITIONS);
}

/**
 * Extract `{ elementId, properties }` from a payload under a declaration.
 *
 * Returns `null` when the subject key is absent or is not a non-empty string —
 * the caller MUST treat that as an unresolved subject to report, never as an
 * empty result to discard.  (§CONTEXT-DATA-HONESTY: a refusal and an empty
 * property set are different values and must not be returned the same way.)
 */
export function extractElementProperties(
  d: ElementPropertyDisposition,
  payload: Readonly<Record<string, unknown>>,
): { elementId: string; properties: Record<string, unknown> } | null {
  const rawSubject = payload[d.subject];
  if (typeof rawSubject !== 'string' || rawSubject === '') return null;

  const source: Record<string, unknown> =
    d.nested !== undefined
      ? (typeof payload[d.nested] === 'object' && payload[d.nested] !== null
          ? payload[d.nested] as Record<string, unknown>
          : {})
      : payload;

  const excluded = new Set<string>([
    d.subject,
    ...GLOBAL_PROPERTY_EXCLUDES,
    ...(d.exclude ?? []),
    ...(d.nested !== undefined ? [d.nested] : []),
  ]);

  const properties: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(source)) {
    if (excluded.has(k)) continue;
    if (k.startsWith('_')) continue;   // local dispatch flags — never replicated
    if (v === undefined) continue;      // an absent optional is not a mutation
    properties[k] = v;
  }
  return { elementId: rawSubject, properties };
}
