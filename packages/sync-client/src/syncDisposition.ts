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
  // §FEAT-WALL-SIDE-FINISH — same late-bound subject as the two batches below
  // and above: `wallIds: string[] | 'all'`, resolved INSIDE
  // SetWallSideFinishBatchCommand. The adapter cannot enumerate 'all' without
  // reading a store, which is forbidden at L3.
  'wall.setSideFinishBatch': {
    kind: 'not-synced',
    reason:
      'SEAM: same late-bound `wallIds: "all"` subject as wall.updateColorBatch. ' +
      'Needs the handler to surface affectedElementIds on the command record — ' +
      'plugins/wall handler change.',
  },
  'wall.addLayerBatch': {
    kind: 'not-synced',
    reason: 'SEAM: same late-bound `wallIds: "all"` subject as wall.updateColorBatch.',
  },
  // §FEAT-BULK-DIMENSIONS (L-949) — "make all windows 2 meters height".
  // A DIFFERENT reason from its siblings, and it must not be conflated with
  // theirs: this verb's subject is ALWAYS an explicit `elementIds: string[]`
  // (there is deliberately no 'all' form — the Confirm card has to state a real
  // count), so the late-bound seam above does NOT apply. What blocks it is that
  // `ElementPropertyDisposition` names exactly ONE `subject` key holding ONE id
  // string, and a MULTI-subject payload has no representation in this table at
  // all. Declaring it with `subject: 'elementIds'` would hand the adapter an
  // ARRAY where it expects an id and record an unresolved subject on every
  // dispatch. The honest state is not-synced with the missing shape named.
  'element.updateDimensionsBatch': {
    kind: 'not-synced',
    reason:
      'SHAPE: subject is `elementIds: string[]` — a MULTI-subject payload, which ' +
      'ElementPropertyDisposition (one `subject` key -> one id string) cannot express. ' +
      'Not the late-bound "all" seam: this verb never carries "all". Needs a ' +
      'multi-subject disposition kind, which is a sync-client change.',
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
  'room.redetect': {
    kind: 'not-synced',
    reason:
      'DERIVED RECOMPUTE with a LEVEL subject: payload is `levelId` (+ optional ' +
      'elevation/height), and its output — rooms — is derived state re-computed from ' +
      'wall geometry (RedetectRoomsHandler, @pryzm/plugin-rooms). Two independent ' +
      'reasons not to replicate it: the element-property path resolves one ELEMENT id ' +
      'and a level is not an element (see level.add), and replicating a recompute ' +
      'TRIGGER would sync the instruction rather than the state — each client ' +
      'derives rooms from the wall edits it already receives. NOT asserted here: ' +
      'that remote clients actually re-run detection when replicated wall edits ' +
      'arrive. That is the derived-refresh question; this entry declares the ' +
      'disposition, not that answer.',
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

  // ═══════════════════════════════════════════════════════════════════════════
  // §FIX-SYNC-GATE-UNDERSCOPED (2026-08-11) — the 139 verbs the gate could not see
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Everything above this line was authored against a gate whose discovery
  // matched the OBJECT-LITERAL handler form only. Most handlers in this repo are
  // CLASSES (`readonly type = 'roof.setPitch';`), so the gate held 39 property
  // verbs to a declaration when the repository has 184 — and printed
  // "✓ Every property-mutation command type declares its sync disposition" over
  // the other 79%. Widening discovery (check-sync-disposition.ts, S6) made 139
  // undeclared property verbs visible at once. Every one is placed below.
  //
  // ─── The six structural classes, and why a class is not a shortcut ──────────
  //
  // The temptation with 139 verbs is one sentence, 139 times. That would restore
  // exactly the silence this table exists to break: a reason nobody had to think
  // about is a placeholder with better grammar (S2 rejects the honest kind and
  // would happily accept the fluent kind). So each verb was read, and each landed
  // in one of six classes that are STRUCTURAL FACTS ABOUT ITS PAYLOAD, checkable
  // by anyone who opens the handler:
  //
  //   1. ELEMENT-PROPERTY — the payload is {subjectId, …absolute property values}.
  //      The generic adapter path is correct as written. 80 verbs.
  //   2. RELATIVE MUTATION — the payload carries a DELTA (`delta`, `dx/dy/dz`),
  //      applied `+=` inside the handler. Two hazards, either fatal: `delta` is
  //      not a property of the element (writing it puts a key named "delta" on
  //      the record), and a delta replayed against a document whose base already
  //      moved lands somewhere else. Needs a relative-mutation kind. 14 verbs.
  //   3. COLLECTION-MEMBER EDIT — the payload identifies a member of a list the
  //      element owns (a curtain-wall PANEL, a roof SKYLIGHT, a slab HOLE, a
  //      sheet VIEWPORT/WIDGET). The element-property path would write
  //      `panelId`/`holeIndex` as top-level properties of the host, which is
  //      false: the mutation is a list edit, not a property set. 13 verbs.
  //   4. KEYED SUB-RECORD — the payload carries a DISCRIMINATOR selecting which
  //      sub-key of a bag to write (`room.setFinish`'s `surface`). Same defect
  //      as 3, one level down. 1 verb.
  //   5. DOCUMENTATION OBJECT (OPEN QUESTION) — sheets, schedules, section views
  //      and view templates are the same class as a VIEW DEFINITION, and W5-3
  //      explicitly did not decide whether view definitions are shared document
  //      state (see `view.rename`). Declaring them synced would assert a product
  //      decision this table has no authority to make. 11 verbs.
  //   6. NON-ELEMENT SUBJECT — the subject is a level, a hierarchy node, a type
  //      catalogue entry, an imported scene group, a visibility intent, or a
  //      (viewId, targetId) PAIR. The element-property path resolves exactly one
  //      ELEMENT id; none of these is one. 8 verbs. Plus 12 verbs that REFUSE.
  //
  // ⚠ WHAT DECLARING A VERB `element-property` HERE DOES **NOT** ASSERT.
  // It does not assert that the verb's LOCAL execution reaches authoritative
  // state. `check-verb-register.ts` classifies most of the plugin handlers below
  // as UNKNOWN liveness — a lone `produceCommand` against a plugin store nobody
  // has proven live or dead. That is a different question, tracked in a different
  // artefact, and conflating the two would let "we do not know if it writes
  // anything" be recorded here as "it is not synced", which is a lie in the
  // shape of a disposition. What IS asserted is the mapping: IF the command
  // executes, its payload is {subject, properties} exactly as declared.
  //
  // ⚠ A KNOWN INCONSISTENCY, recorded rather than quietly fixed. Three
  // curtain-wall entries above (`addGridLine`, `removeGridLine`, `replacePanel`)
  // are collection-member edits by the class-3 rule and are nonetheless declared
  // `element-property`. They predate the rule. Re-classifying them changes an
  // already-shipped declaration, which is a decision for whoever owns the
  // curtain-wall grid model, not a tidy-up.

  // ── Class 1 — ELEMENT-PROPERTY: annotation / dimension (drawing content) ────
  // Annotation and dimension records carry an id and absolute property values;
  // they are model records that live in the shared document, not per-viewer state.
  'annotation.setColor':      { kind: 'element-property', subject: 'annotationId', conflict: 'disclose' },
  'annotation.setKind':       { kind: 'element-property', subject: 'annotationId', conflict: 'disclose' },
  'annotation.setRotation':   { kind: 'element-property', subject: 'annotationId', conflict: 'disclose' },
  'annotation.setText':       { kind: 'element-property', subject: 'annotationId', conflict: 'disclose' },
  'annotation.setTextHeight': { kind: 'element-property', subject: 'annotationId', conflict: 'disclose' },
  'annotation.update':        { kind: 'element-property', subject: 'annotationId', conflict: 'disclose' },
  'dimension.setPrecision':   { kind: 'element-property', subject: 'dimensionId',  conflict: 'disclose' },
  // An override REPLACES a measured value with a typed one, so a silently lost
  // override leaves a drawing asserting a number the author overrode on purpose.
  'dimension.setText':        { kind: 'element-property', subject: 'dimensionId',  conflict: 'disclose' },
  'dimension.setUnit':        { kind: 'element-property', subject: 'dimensionId',  conflict: 'disclose' },

  // ── Class 1 — ELEMENT-PROPERTY: structural frame ───────────────────────────
  'beam.setSection':               { kind: 'element-property', subject: 'beamId',       conflict: 'disclose' },
  'beam.setType':                  { kind: 'element-property', subject: 'beamId',       conflict: 'disclose' },
  'beam.update':                   { kind: 'element-property', subject: 'beamId',       nested: 'updates', conflict: 'disclose' },
  'column.setHeight':              { kind: 'element-property', subject: 'columnId',     conflict: 'disclose' },
  'column.setType':                { kind: 'element-property', subject: 'columnId',     conflict: 'disclose' },
  'column.update':                 { kind: 'element-property', subject: 'id',           nested: 'updates', conflict: 'disclose' },
  'structural.setBraceEndOffset':  { kind: 'element-property', subject: 'structuralId', conflict: 'disclose' },
  'structural.setDimensions':      { kind: 'element-property', subject: 'structuralId', conflict: 'disclose' },
  'structural.setKind':            { kind: 'element-property', subject: 'structuralId', conflict: 'disclose' },

  // ── Class 1 — ELEMENT-PROPERTY: enclosure (ceiling / roof / slab / floor) ───
  'ceiling.setBoundary':  { kind: 'element-property', subject: 'ceilingId', conflict: 'disclose' },
  'ceiling.setHeight':    { kind: 'element-property', subject: 'ceilingId', conflict: 'disclose' },
  'floor.update':         { kind: 'element-property', subject: 'floorId',   nested: 'updates', conflict: 'disclose' },
  'roof.setOverhang':     { kind: 'element-property', subject: 'roofId',    conflict: 'disclose' },
  'roof.setPitch':        { kind: 'element-property', subject: 'roofId',    conflict: 'disclose' },
  'roof.setShape':        { kind: 'element-property', subject: 'roofId',    conflict: 'disclose' },
  'roof.setThickness':    { kind: 'element-property', subject: 'roofId',    conflict: 'disclose' },
  'slab.setBaseOffset':   { kind: 'element-property', subject: 'slabId',    conflict: 'disclose' },
  'slab.setThickness':    { kind: 'element-property', subject: 'slabId',    conflict: 'disclose' },
  'slab.setType':         { kind: 'element-property', subject: 'slabId',    conflict: 'disclose' },
  // ABSOLUTE, despite the `move` verb: the payload is the whole new polygon (and
  // its holes), not an offset — so it belongs in class 1, not class 2.
  'slab.movePolygon':     { kind: 'element-property', subject: 'slabId',    conflict: 'disclose' },
  'slab.updateDimensions':{ kind: 'element-property', subject: 'slabId',    conflict: 'disclose' },

  // ── Class 1 — ELEMENT-PROPERTY: wall and its hosted openings ───────────────
  // C15 — a door/window offset is measured ALONG its host wall's baseline and is
  // absolute (`d.offset = cmd.offset`), so it replicates as a property. The
  // `prev*` keys are undo bookkeeping travelling in the payload: replicating one
  // would let a peer reconstruct the pre-edit position as if it were current
  // (the same trap `wall.updateBaseline` excludes `prevBaseLine` for).
  'wall.move':             { kind: 'element-property', subject: 'id',       conflict: 'disclose' },
  'wall.setSystemType':    { kind: 'element-property', subject: 'id',       conflict: 'disclose' },
  'wall.updateColor':      { kind: 'element-property', subject: 'wallId',   conflict: 'disclose' },
  'door.move':             { kind: 'element-property', subject: 'doorId',   conflict: 'disclose' },
  'door.setAccessibility': { kind: 'element-property', subject: 'doorId',   conflict: 'disclose' },
  'door.setFireRating':    { kind: 'element-property', subject: 'doorId',   conflict: 'disclose' },
  'door.setFrameColor':    { kind: 'element-property', subject: 'doorId',   conflict: 'disclose' },
  'door.setHeight':        { kind: 'element-property', subject: 'doorId',   conflict: 'disclose' },
  'door.setOffset':        { kind: 'element-property', subject: 'doorId',   exclude: ['prevOffset'], conflict: 'disclose' },
  'door.setSillHeight':    { kind: 'element-property', subject: 'doorId',   conflict: 'disclose' },
  'door.setSwing':         { kind: 'element-property', subject: 'doorId',   conflict: 'disclose' },
  'door.setType':          { kind: 'element-property', subject: 'doorId',   conflict: 'disclose' },
  'door.setWidth':         { kind: 'element-property', subject: 'doorId',   conflict: 'disclose' },
  'window.move':           { kind: 'element-property', subject: 'windowId', conflict: 'disclose' },
  'window.setFireRating':  { kind: 'element-property', subject: 'windowId', conflict: 'disclose' },
  'window.setFrameColor':  { kind: 'element-property', subject: 'windowId', conflict: 'disclose' },
  'window.setOffset':      { kind: 'element-property', subject: 'windowId', exclude: ['prevOffset'], conflict: 'disclose' },
  'window.setSillHeight':  { kind: 'element-property', subject: 'windowId', conflict: 'disclose' },
  'window.setSize':        { kind: 'element-property', subject: 'windowId', conflict: 'disclose' },
  'window.setType':        { kind: 'element-property', subject: 'windowId', conflict: 'disclose' },

  // ── Class 1 — ELEMENT-PROPERTY: curtain wall (whole-element properties only) ─
  // The PANEL-scoped verbs of this family are class 3, below.
  'curtain-wall.setGrid':        { kind: 'element-property', subject: 'curtainWallId', conflict: 'disclose' },
  'curtain-wall.setMullionType': { kind: 'element-property', subject: 'curtainWallId', conflict: 'disclose' },
  'curtain-wall.setOutline':     { kind: 'element-property', subject: 'curtainWallId', conflict: 'disclose' },
  'curtain-wall.setTransomType': { kind: 'element-property', subject: 'curtainWallId', conflict: 'disclose' },

  // ── Class 1 — ELEMENT-PROPERTY: stair / handrail ───────────────────────────
  'stair.setRiserHeight':  { kind: 'element-property', subject: 'stairId',    conflict: 'disclose' },
  'stair.setShape':        { kind: 'element-property', subject: 'stairId',    conflict: 'disclose' },
  'stair.setTreadCount':   { kind: 'element-property', subject: 'stairId',    conflict: 'disclose' },
  'stair.setType':         { kind: 'element-property', subject: 'stairId',    conflict: 'disclose' },
  'stair.setWidth':        { kind: 'element-property', subject: 'stairId',    conflict: 'disclose' },
  // `hostId` is the handrail's HOST REFERENCE — an absolute property of the
  // handrail, not a second subject: the record being mutated is the handrail.
  'handrail.setHost':      { kind: 'element-property', subject: 'handrailId', conflict: 'disclose' },
  'handrail.setPath':      { kind: 'element-property', subject: 'handrailId', conflict: 'disclose' },
  'handrail.setShape':     { kind: 'element-property', subject: 'handrailId', conflict: 'disclose' },
  'handrail.moveBaseLine': { kind: 'element-property', subject: 'id',         conflict: 'disclose' },
  'handrail.updateColor':  { kind: 'element-property', subject: 'id',         conflict: 'disclose' },

  // ── Class 1 — ELEMENT-PROPERTY: furniture / lighting / plumbing / grid ─────
  'furniture.setActiveLod':      { kind: 'element-property', subject: 'furnitureId', conflict: 'disclose' },
  'furniture.setRepresentation': { kind: 'element-property', subject: 'furnitureId', conflict: 'disclose' },
  'furniture.setScale':          { kind: 'element-property', subject: 'furnitureId', conflict: 'disclose' },
  'lighting.setEmergency':       { kind: 'element-property', subject: 'lightingId',  conflict: 'disclose' },
  'lighting.setIntensity':       { kind: 'element-property', subject: 'lightingId',  conflict: 'disclose' },
  'plumbing.setSystem':          { kind: 'element-property', subject: 'plumbingId',  conflict: 'disclose' },
  // ABSOLUTE: the payload is the destination point (`to`), not a displacement.
  'plumbing.moveFixture':        { kind: 'element-property', subject: 'id',          conflict: 'disclose' },
  // A GRID is a placed model datum with its own id — unlike a LEVEL, it is not
  // ADR-049 routing, so it can be a record inside a document rather than the
  // thing that selects one.
  'grid.setExtent':              { kind: 'element-property', subject: 'gridId',      conflict: 'disclose' },
  'grid.setSpacing':             { kind: 'element-property', subject: 'gridId',      conflict: 'disclose' },
  'grid.update':                 { kind: 'element-property', subject: 'gridId',      nested: 'updates', conflict: 'disclose' },

  // ── Class 1 — ELEMENT-PROPERTY: room ───────────────────────────────────────
  'room.setHeightOffset': { kind: 'element-property', subject: 'roomId', conflict: 'disclose' },
  'room.setMaterial':     { kind: 'element-property', subject: 'roomId', conflict: 'disclose' },
  'room.setOccupancy':    { kind: 'element-property', subject: 'roomId', conflict: 'disclose' },
  // A room NUMBER is not a label: door tags, schedules and exported drawings key
  // off it, so a silently dropped renumber leaves other documents pointing at a
  // room that no longer answers to that number. DISCLOSE, unlike `setName`.
  'room.setNumber':       { kind: 'element-property', subject: 'roomId', conflict: 'disclose' },
  'room.updateBoundary':  { kind: 'element-property', subject: 'id',     conflict: 'disclose' },
  // The plugin-side twin of `room.rename` above, and it carries the same policy
  // for the same stated reason — a free-text label with no geometric dependents,
  // where conflict fatigue would devalue disclosure where it matters.
  'room.setName': {
    kind: 'element-property',
    subject: 'roomId',
    conflict: 'last-writer-wins',
    lwwReason:
      'Free-text label with no geometric dependents; identical policy to room.rename, ' +
      'and the losing side is trivially re-entered. Note room.setNumber is DISCLOSE — ' +
      'a number other documents cite is not a label.',
  },

  // ── Class 2 — NOT SYNCED: RELATIVE (delta) mutations ───────────────────────
  //
  // Each of these applies `+=` to the element's origin/baseline/anchor from a
  // `delta` in the payload. Two independent reasons the element-property path is
  // WRONG here, either sufficient:
  //
  //   (a) `delta` IS NOT A PROPERTY. The generic path treats every non-subject
  //       key as a property of the element, so it would write a field literally
  //       named `delta` onto the CRDT record. Nothing reads that field; the
  //       element's position would never change on the receiving side, and the
  //       document would carry a plausible-looking key that means nothing.
  //   (b) A DELTA IS NOT IDEMPOTENT AND NOT BASE-INDEPENDENT. Replayed against a
  //       document whose base already moved — which is the ONLY interesting case
  //       in a CRDT — it lands somewhere else. Yjs would converge on a value
  //       neither user chose, silently: precisely the P8 loss this table exists
  //       to make visible.
  //
  // The fix is a relative-mutation disposition kind that replicates the RESULT,
  // or handlers that dispatch absolute positions. Both are out of W5-3's scope
  // and neither is a reason to leave the verb undeclared.
  'annotation.move':    { kind: 'not-synced', reason: 'RELATIVE: payload is `delta`, applied `a.anchor += delta`. Replicating a displacement writes a non-property key and lands elsewhere on a diverged base. Needs a relative-mutation kind.' },
  'beam.move':          { kind: 'not-synced', reason: 'RELATIVE: `delta` applied to every baseLine point (`p.x += delta.x`). See annotation.move — a displacement is not a property and is not base-independent.' },
  'column.move':        { kind: 'not-synced', reason: 'RELATIVE: `delta` applied to `c.origin`. See annotation.move.' },
  'curtain-wall.move':  { kind: 'not-synced', reason: 'RELATIVE: `delta` applied to each baseLine point. See annotation.move.' },
  'dimension.move':     { kind: 'not-synced', reason: 'RELATIVE: `delta` applied to the dimension\'s points. See annotation.move.' },
  'furniture.move':     { kind: 'not-synced', reason: 'RELATIVE: `delta` applied to `f.origin`. See annotation.move.' },
  'lighting.move':      { kind: 'not-synced', reason: 'RELATIVE: `delta` applied to `l.origin`. See annotation.move.' },
  'plumbing.move':      { kind: 'not-synced', reason: 'RELATIVE: `delta` applied to `p.origin`. Contrast plumbing.moveFixture, which carries an ABSOLUTE `to` and IS declared synced.' },
  'roof.move':          { kind: 'not-synced', reason: 'RELATIVE: `delta` added to every footprint point. See annotation.move.' },
  'room.move':          { kind: 'not-synced', reason: 'RELATIVE: horizontal `delta.x/.z` on the boundary plus `baseOffset += delta.y`. Two relative writes in one payload; see annotation.move.' },
  'slab.move':          { kind: 'not-synced', reason: 'RELATIVE: `delta` applied to the slab polygon. Contrast slab.movePolygon, which carries the ABSOLUTE polygon and IS declared synced.' },
  'stair.move':         { kind: 'not-synced', reason: 'RELATIVE: `delta` applied to `dto.origin`. See annotation.move.' },
  'structural.move':    { kind: 'not-synced', reason: 'RELATIVE: `delta` applied to `s.origin`. See annotation.move.' },
  'cube.move':          { kind: 'not-synced', reason: 'RELATIVE: `dx/dy/dz` applied `cube.x += dx`. The toy-cube demo element, and the same displacement hazard as the real families.' },

  // ── Class 3 — NOT SYNCED: COLLECTION-MEMBER edits ──────────────────────────
  //
  // The payload names a MEMBER of a list the host element owns. The
  // element-property path writes every non-subject key as a top-level property
  // of the HOST, so `curtain-wall.removePanel` would store `panelId` ON THE
  // CURTAIN WALL — a field that is not a property of a curtain wall, while the
  // panel it names stays exactly where it was on the receiving document. The
  // mutation is a LIST EDIT (insert / remove / update-at-key) and needs a
  // collection disposition kind; a list edit merged as a scalar property is how
  // two users each adding a panel end with one panel.
  'curtain-wall.addPanel':      { kind: 'not-synced', reason: 'COLLECTION: inserts a panel at grid cell (row, col) in the curtain wall\'s panel list. A list insert is not a property set; needs a collection disposition kind.' },
  'curtain-wall.removePanel':   { kind: 'not-synced', reason: 'COLLECTION: removes `panelId` from the curtain wall\'s panel list. The single-subject path would store panelId as a property of the wall. See curtain-wall.addPanel.' },
  'curtain-wall.setPanelType':  { kind: 'not-synced', reason: 'COLLECTION: mutates ONE panel (`panelId`, with an `upsertAt` insert path) inside the curtain wall\'s panel list. Subject is the panel, container is the wall. See curtain-wall.addPanel.' },
  'roof.addSkylight':           { kind: 'not-synced', reason: 'COLLECTION: appends a skylight record to the roof\'s skylight list, with the member\'s own minted id nested in `skylight`. See curtain-wall.addPanel.' },
  'roof.removeSkylight':        { kind: 'not-synced', reason: 'COLLECTION: removes `skylightId` from the roof\'s skylight list. See curtain-wall.addPanel.' },
  'slab.addHole':               { kind: 'not-synced', reason: 'COLLECTION: appends a hole polygon to the slab\'s hole list. See curtain-wall.addPanel.' },
  'slab.removeHole':            { kind: 'not-synced', reason: 'COLLECTION: removes a hole by ARRAY INDEX (`holeIndex`) — the worst case for a merge, since a concurrent insert renumbers the index and the wrong hole is cut. Needs a collection disposition kind keyed by identity, not position.' },
  'sheet.addViewport':          { kind: 'not-synced', reason: 'COLLECTION: appends a viewport to the sheet\'s viewport list. Also class 5 — see sheet.rename on whether sheets replicate at all.' },
  'sheet.removeViewport':       { kind: 'not-synced', reason: 'COLLECTION: removes `viewportId` from the sheet\'s viewport list. See sheet.addViewport.' },
  'sheet.moveViewport':         { kind: 'not-synced', reason: 'COLLECTION: repositions ONE viewport inside the sheet\'s list; the subject is the viewport, the payload keys the sheet. See sheet.addViewport.' },
  'sheet.setViewportScale':     { kind: 'not-synced', reason: 'COLLECTION: rescales ONE viewport inside the sheet\'s list, carrying its frame with it. See sheet.addViewport.' },
  'sheet.addWidget':            { kind: 'not-synced', reason: 'COLLECTION: appends a widget to the sheet\'s widget list. See sheet.addViewport.' },
  'sheet.removeWidget':         { kind: 'not-synced', reason: 'COLLECTION: removes `widgetId` from the sheet\'s widget list. See sheet.addViewport.' },

  // ── Class 4 — NOT SYNCED: KEYED SUB-RECORD ─────────────────────────────────
  'room.setFinish': {
    kind: 'not-synced',
    reason:
      'KEYED SUB-RECORD: `surface` is a DISCRIMINATOR ("floor" | "ceiling" | "walls") ' +
      'choosing which key of the room\'s single `finishes` bag to write; the handler ' +
      'read-merges so that setting one surface does not wipe the others. The generic ' +
      'path would replicate `surface` and `finish` as two flat properties of the room, ' +
      'losing which surface the finish belongs to — and a naive whole-bag write is the ' +
      'exact defect SetRoomFinish.ts documents at length. Needs a keyed-sub-record kind.',
  },

  // ── Class 5 — NOT SYNCED: DOCUMENTATION OBJECTS (open question) ────────────
  //
  // A SHEET, a SCHEDULE, a SECTION VIEW and a VIEW TEMPLATE are the same class of
  // thing as the VIEW DEFINITION above: shared documentation output, not
  // per-viewer state, and arguably shared document state. W5-3 did not decide
  // whether view definitions replicate (see `view.rename`), and deciding it here
  // for four more families — by declaring them synced — would settle a product
  // question through a table entry. Declared NOT-SYNCED with the open question
  // written down, exactly as `view.rename` is, rather than left absent (which
  // reads like a settled "no").
  'sheet.rename':           { kind: 'not-synced', reason: 'OPEN QUESTION (documentation object): a SHEET is shared drawing output, the same class as a view definition — see view.rename. W5-3 did not decide whether it replicates.' },
  'sheet.setSheetMetadata': { kind: 'not-synced', reason: 'OPEN QUESTION: revision / issue / approvedBy on a shared sheet — and an APPROVAL is the one field where a silent last-writer-wins would be worst. See sheet.rename.' },
  'sheet.setTitleBlock':    { kind: 'not-synced', reason: 'OPEN QUESTION: which title block a shared sheet uses. See sheet.rename.' },
  'schedule.setFilter':     { kind: 'not-synced', reason: 'OPEN QUESTION (documentation object): a SCHEDULE is a shared derived table, the same undecided class as a view definition. See view.rename.' },
  'schedule.setGroupBy':    { kind: 'not-synced', reason: 'OPEN QUESTION: grouping of a shared schedule. See schedule.setFilter.' },
  'schedule.update':        { kind: 'not-synced', reason: 'OPEN QUESTION: generic `patch` over a shared schedule definition. See schedule.setFilter.' },
  'section.moveLine':       { kind: 'not-synced', reason: 'OPEN QUESTION: a SECTION is a view definition with a marker placed in the model; moving its cut line is a view-definition edit. See view.rename.' },
  'section.setDepth':       { kind: 'not-synced', reason: 'OPEN QUESTION: look depth of a section VIEW DEFINITION — compare view.setRange, which is per-viewer and correctly local. See section.moveLine.' },
  'section.setMark':        { kind: 'not-synced', reason: 'OPEN QUESTION: the section\'s drawing mark (its cross-reference label on other sheets). See section.moveLine.' },
  'section.setScale':       { kind: 'not-synced', reason: 'OPEN QUESTION: drawing scale of a section view definition. See section.moveLine.' },
  'viewTemplate.update':    { kind: 'not-synced', reason: 'OPEN QUESTION: a VIEW TEMPLATE is a reusable view definition applied to many views — the same undecided class, one level of indirection up. See view.rename.' },

  // ── Class 6 — NOT SYNCED: the subject is not an element ────────────────────
  'level.update': {
    kind: 'not-synced',
    reason:
      'A LEVEL is not an element — identical reasoning to level.add above: levelId ' +
      'is ADR-049 CRDT ROUTING (it selects the document), so it cannot also be a ' +
      'record within one. Needs a coordination-scope disposition kind.',
  },
  'hierarchy.updateNode': {
    kind: 'not-synced',
    reason:
      'A PROJECT-HIERARCHY node (site / building / level / unit) is project ' +
      'ORGANISATION state, not an element: it has no geometry and its level nodes ' +
      'collide with the same ADR-049 routing that level.add names. Needs a ' +
      'coordination-scope kind.',
  },
  'data.setDerivation': {
    kind: 'not-synced',
    reason:
      'PROVENANCE, not a value: it marks a SET of property keys on a hierarchy node ' +
      'as derived, with a reason. The subject is a node (not an element) and the ' +
      'payload is a key list, not properties — the generic path would replicate the ' +
      'literal array under a key named `keys`.',
  },
  'elementType.update': {
    kind: 'not-synced',
    reason:
      'A TYPE CATALOGUE entry, keyed by (family, typeId) — project LIBRARY state, ' +
      'not a placed element. The element-property path resolves one element id and ' +
      'there is none here; the payload\'s `draft` is a whole type record. Needs a ' +
      'catalogue-scope kind. (C05: built-ins are refused by the handler outright, ' +
      'so only authored types can reach this at all.)',
  },
  'grid.add': {
    kind: 'not-synced',
    reason:
      'SUBJECT DOES NOT EXIST IN THE PAYLOAD: the payload is `{ orientation, updates }` ' +
      'and the new grid line\'s id is MINTED INSIDE AddGridCommand. The adapter cannot ' +
      'key a record it has no id for; replicating it would create an unaddressable ' +
      'row. Contrast grid.update / grid.setSpacing, which carry `gridId` and ARE ' +
      'declared synced.',
  },
  'rhino.setMaterial': {
    kind: 'not-synced',
    reason:
      'NO ELEMENT SUBJECT: this recolours the whole imported Rhino model — a tagged ' +
      'SCENE GROUP (userData.isRhinoImport) with one shared override material — and ' +
      'those meshes are in no geometry store, so there is no per-element record to ' +
      'key. The payload is a single colour. Needs an import-scope kind.',
  },
  'vg.updateVisibilityIntent': {
    kind: 'not-synced',
    reason:
      'A VISIBILITY INTENT (P7, packages/visibility) is a domain record but not an ' +
      'element: it is keyed by intentId and scoped per view. The P7 gate\'s own output ' +
      'says persistence and per-view scoping of visibility intent are NOT CHECKED, so ' +
      'this table will not be the first artefact to assert they replicate.',
  },
  'view.setGraphicOverride': {
    kind: 'not-synced',
    reason:
      'COMPOSITE SUBJECT — keyed by (viewId, targetId, targetKind), exactly like ' +
      'element.setGraphicOverride above. The element-property path is single-subject, ' +
      'and views are unreplicated anyway (see view.rename).',
  },

  // ── Class 6b — NOT SYNCED: the verb REFUSES, so no payload can ever reach sync ─
  //
  // §FIX-DEAD-VERB-REFUSE (W3-3). Every `<family>.setMaterial` handler below has a
  // `canExecute` that returns `{ valid: false }` on EVERY path, deliberately: the
  // handler writes the plugin DTO store, which is a fresh PluginRegistry instance
  // read by no renderer, no 2-D projector, no IFC exporter and no persistence
  // (§FIX-MATERIAL-DEAD-DISPATCH). CommandBus throws before touching either undo
  // stack, so no payload is ever produced.
  //
  // Declaring these `element-property` would be worse than leaving them out: it
  // would put a CRDT path on a command that cannot execute, making the shared
  // document a source of truth for a value the model does not hold — the same
  // objection recorded above for wall.setColor / wall.setDimensions. They are
  // declared here so the gate holds them, and they are re-classified when W3-3
  // either deletes them or reattaches them to authoritative state. Each names the
  // live alternative its own handler names, so the entry is actionable.
  'beam.setMaterial':         { kind: 'not-synced', reason: 'REFUSES (§FIX-DEAD-VERB-REFUSE): canExecute rejects on every path — the plugin DTO store it writes is read by nothing. Live route: beam.update.' },
  'ceiling.setMaterial':      { kind: 'not-synced', reason: 'REFUSES (§FIX-DEAD-VERB-REFUSE): unconditional canExecute rejection; detached plugin DTO store. Live route: ceiling.update.' },
  'column.setMaterial':       { kind: 'not-synced', reason: 'REFUSES (§FIX-DEAD-VERB-REFUSE): unconditional canExecute rejection; detached plugin DTO store. Live route: column.update.' },
  'curtain-wall.setMaterial': { kind: 'not-synced', reason: 'REFUSES (§FIX-DEAD-VERB-REFUSE): unconditional canExecute rejection; detached plugin DTO store. Live route: curtain-wall.batch.update.' },
  'furniture.setMaterial':    { kind: 'not-synced', reason: 'REFUSES (§FIX-DEAD-VERB-REFUSE): unconditional canExecute rejection; detached plugin DTO store. Live route: furniture.updateParameters.' },
  'handrail.setMaterial':     { kind: 'not-synced', reason: 'REFUSES (§FIX-DEAD-VERB-REFUSE): unconditional canExecute rejection; detached plugin DTO store. Live route: handrail.updateColor.' },
  'lighting.setMaterial':     { kind: 'not-synced', reason: 'REFUSES (§FIX-DEAD-VERB-REFUSE): unconditional canExecute rejection; detached plugin DTO store. No live per-element colour route exists for lighting today.' },
  'plumbing.setMaterial':     { kind: 'not-synced', reason: 'REFUSES (§FIX-DEAD-VERB-REFUSE): unconditional canExecute rejection; detached plugin DTO store. No live per-element colour route exists for plumbing today.' },
  'roof.setMaterial':         { kind: 'not-synced', reason: 'REFUSES (§FIX-DEAD-VERB-REFUSE): unconditional canExecute rejection; detached plugin DTO store. Live route: roof.update.' },
  'slab.setMaterial':         { kind: 'not-synced', reason: 'REFUSES (§FIX-DEAD-VERB-REFUSE): unconditional canExecute rejection; detached plugin DTO store. Live route: slab.update / slab.updateDimensions.' },
  'stair.setMaterial':        { kind: 'not-synced', reason: 'REFUSES (§FIX-DEAD-VERB-REFUSE): unconditional canExecute rejection; detached plugin DTO store. Live route: stair.updateParameters.' },
  'structural.setMaterial':   { kind: 'not-synced', reason: 'REFUSES (§FIX-DEAD-VERB-REFUSE): unconditional canExecute rejection; detached plugin DTO store. No live per-element colour route exists for structural today.' },

  // ═══════════════════════════════════════════════════════════════════════════
  // §FIX-SYNC-GATE-NAME-SCOPED (2026-08-17, L-937) — the 127 verbs the gate
  // never ASKED about
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Everything above this line was authored against a gate that held only the
  // verbs whose NAME matched `PROPERTY_VERB_RE` — 185 of the 326 registered
  // handler types. The RUNTIME has never classified by name: `CommandBus` hands
  // `YjsDocAdapter._applyDeclaredProperties` EVERY successful dispatch, and it
  // warns on every type with no entry here. So the gate could sit at exit 0 while
  // the founder watched production log this, twice in one session:
  //
  //     [YjsDocAdapter] W5-3: command type 'generation.rooms' has NO sync disposition.
  //     [YjsDocAdapter] W5-3: command type 'stair.createRailing' has NO sync disposition.
  //
  // Neither verb was a hard case. `generation.rooms` fails the regex on its second
  // segment; `stair.createRailing` fails it because "createRailing" starts with
  // `create`. They were simply never in the gate's subject. 127 were not. The gate
  // now carries S7, whose subject is the whole handler set — identical to the
  // runtime's — so this class cannot regrow.
  //
  // ─── WHAT THE SWEEP FOUND, stated before the entries ────────────────────────
  //
  // 23 of the 127 are ELEMENT-PROPERTY. The other 104 are NOT-SYNCED, and that
  // ratio is not a shortcut — it is the finding. Three whole LIFECYCLE families
  // have no representation in this file's type system at all:
  //
  //   • DELETION (28 verbs). `ElementPropertyDisposition` replicates non-subject
  //     payload keys as properties. A delete payload is `{ <x>Id }` and nothing
  //     else, so the generic path extracts ZERO properties and returns early —
  //     declaring a delete `element-property` would read as "synced" while
  //     provably writing nothing. And there is no read-back route either:
  //     `elementSyncReader.ts:261` says `if (change.action === 'delete') continue;
  //     // deletion is not a property route`. Measured, not assumed. A
  //     collaborator therefore keeps a deleted element FOREVER. That needs a
  //     tombstone/lifecycle disposition kind; it is out of this sweep's scope and
  //     it is named here rather than left as an absence.
  //   • BATCH CREATION (12 verbs). `*.batch.create` takes `{ <x>s: Payload[] }`
  //     and runs ONE `produceCommand` over the array — it does NOT re-dispatch the
  //     singular `*.create` verbs, so the singular declarations above do not cover
  //     it. Multi-subject, which this file cannot express (see
  //     `element.updateDimensionsBatch`). This is the path GENERATION uses, so it
  //     is the widest single replication gap in the table.
  //   • DOCUMENT MOVE (`wall.changeLevel`, `roof.changeLevel`). `levelId` is
  //     ADR-049 routing and is in GLOBAL_PROPERTY_EXCLUDES, so a level
  //     REASSIGNMENT is precisely the mutation the property path is built to
  //     discard.
  //
  // ⚠ The same caveat the §FIX-SYNC-GATE-UNDERSCOPED block states applies verbatim
  // to every entry below: declaring a verb `element-property` asserts the MAPPING
  // (its payload is {subject, properties} as declared), never that its local
  // execution reaches authoritative state, and never that production replicates —
  // no CRDT transport is deployed (L-391).

  // ── ELEMENT-PROPERTY: creation verbs carrying a subject id ─────────────────
  //
  // Same shape and same precedent as `wall.create` / `slab.create` / `door.create`
  // / `opening.create` / `stair.create` above: the payload's id key is OPTIONAL and
  // the handler mints one (`cmd.id ?? createId('beam')`) when it is absent. When a
  // caller DOES supply the id — which the tools and batch paths do — the create
  // replicates and a later property edit merges onto the same record. When it does
  // not, `extractElementProperties` returns null and the adapter REPORTS an
  // unresolved subject. Declaring these not-synced would forfeit the working half
  // to avoid a case that is already loud.
  'annotation.create':  { kind: 'element-property', subject: 'id',      conflict: 'disclose' },
  'beam.create':        { kind: 'element-property', subject: 'id',      conflict: 'disclose' },
  'ceiling.create':     { kind: 'element-property', subject: 'id',      conflict: 'disclose' },
  'column.create':      { kind: 'element-property', subject: 'id',      conflict: 'disclose' },
  'curtain-wall.create':{ kind: 'element-property', subject: 'id',      conflict: 'disclose' },
  'dimension.create':   { kind: 'element-property', subject: 'id',      conflict: 'disclose' },
  'floor.create':       { kind: 'element-property', subject: 'floorId', conflict: 'disclose' },
  'furniture.create':   { kind: 'element-property', subject: 'id',      conflict: 'disclose' },
  'grid.create':        { kind: 'element-property', subject: 'id',      conflict: 'disclose' },
  'handrail.create':    { kind: 'element-property', subject: 'id',      conflict: 'disclose' },
  'lighting.create':    { kind: 'element-property', subject: 'id',      conflict: 'disclose' },
  'plumbing.create':    { kind: 'element-property', subject: 'id',      conflict: 'disclose' },
  // `wallIds` / `floorSlabId` / `waterId` are the pool's COMPOSITION references —
  // properties of the pool naming its parts, not second subjects.
  'pool.create':        { kind: 'element-property', subject: 'poolId',  conflict: 'disclose' },
  'roof.create':        { kind: 'element-property', subject: 'id',      conflict: 'disclose' },
  'room.create':        { kind: 'element-property', subject: 'id',      conflict: 'disclose' },
  'structural.create':  { kind: 'element-property', subject: 'id',      conflict: 'disclose' },
  'wall.createBetweenMarks': { kind: 'element-property', subject: 'id', conflict: 'disclose' },
  // `wallId` / `openingId` are the window's HOST references — absolute properties
  // of the window (C15), exactly as `handrail.setHost`'s `hostId` is.
  'window.create':      { kind: 'element-property', subject: 'id',      conflict: 'disclose' },

  // ── ELEMENT-PROPERTY: absolute mutations the name heuristic missed ─────────
  //
  // Each carries a subject id and ABSOLUTE values. These are the verbs that were
  // undeclared purely because their name does not begin with a mutation word —
  // the clearest demonstration that the old scoping was about spelling, not shape.
  'curtain-wall.resize': { kind: 'element-property', subject: 'curtainWallId', conflict: 'disclose' },
  // ABSOLUTE `rotation`, not a delta — contrast `furniture.move`, which carries
  // `delta` and is not-synced for that reason.
  'furniture.rotate':    { kind: 'element-property', subject: 'furnitureId',   conflict: 'disclose' },
  'stair.rotate':        { kind: 'element-property', subject: 'stairId',       conflict: 'disclose' },
  // The recomputed `path` is the absolute new geometry. `cause` and `stairId` are
  // RECOMPUTE PROVENANCE — why this ran and what triggered it — not handrail
  // state; the handrail's own host reference is `hostId` (see handrail.setHost).
  // Replicating provenance would put "cause" on the element record.
  'handrail.recompute':  {
    kind: 'element-property', subject: 'handrailId', exclude: ['cause', 'stairId'], conflict: 'disclose',
  },
  // Swaps a PLACED element's type IN PLACE, preserving id/transform/host
  // (ADR-0105). `newTypeId` is absolute state; `elementType` is family ROUTING,
  // excluded on the same grounds as `element.updateMark` above.
  'element.changeType':  {
    kind: 'element-property', subject: 'elementId', exclude: ['elementType'], conflict: 'disclose',
  },

  // ── NOT SYNCED — DELETION: no lifecycle route exists, in either direction ──
  //
  // Read the block comment at the head of this section first. In one line: the
  // property path extracts zero properties from `{ <x>Id }` and returns early, and
  // `elementSyncReader.ts:261` refuses deletion explicitly. Declaring any of these
  // `element-property` would be the worst available answer — a CRDT path that
  // reads as replication and demonstrably writes nothing. They are declared
  // not-synced so the gate holds them and so the missing kind is on the record.
  // §NEEDS-TOMBSTONE-KIND.
  'annotation.delete':  { kind: 'not-synced', reason: 'LIFECYCLE §NEEDS-TOMBSTONE-KIND: a delete is a record REMOVAL. Payload is `{annotationId}` only, so the property path extracts nothing, and elementSyncReader refuses deletion outright. Needs a tombstone disposition kind.' },
  'beam.delete':        { kind: 'not-synced', reason: 'LIFECYCLE §NEEDS-TOMBSTONE-KIND: payload is `{beamId}` only; no property survives extraction and no read-back route accepts a removal. See annotation.delete.' },
  'ceiling.delete':     { kind: 'not-synced', reason: 'LIFECYCLE §NEEDS-TOMBSTONE-KIND: payload is `{ceilingId}` only. See annotation.delete.' },
  'column.delete':      { kind: 'not-synced', reason: 'LIFECYCLE §NEEDS-TOMBSTONE-KIND: payload is `{columnId}` only. See annotation.delete.' },
  'curtain-wall.delete':{ kind: 'not-synced', reason: 'LIFECYCLE §NEEDS-TOMBSTONE-KIND: payload is `{curtainWallId}` only. See annotation.delete.' },
  'dimension.delete':   { kind: 'not-synced', reason: 'LIFECYCLE §NEEDS-TOMBSTONE-KIND: payload is `{dimensionId}` only. See annotation.delete.' },
  'door.delete':        { kind: 'not-synced', reason: 'LIFECYCLE §NEEDS-TOMBSTONE-KIND: payload is `{doorId}` only. A hosted opening also leaves a void in its host wall, so the tombstone kind must carry the host consequence too. See annotation.delete.' },
  'window.delete':      { kind: 'not-synced', reason: 'LIFECYCLE §NEEDS-TOMBSTONE-KIND: payload is `{windowId}` only; same host-void consequence as door.delete. See annotation.delete.' },
  'element.delete':     { kind: 'not-synced', reason: 'LIFECYCLE §NEEDS-TOMBSTONE-KIND: the generic single-element delete; payload is `{elementId, elementType?, source?}` — routing and provenance, no properties. See annotation.delete.' },
  'element.deleteBatch':{ kind: 'not-synced', reason: 'LIFECYCLE + MULTI-SUBJECT: payload is `{elementIds: string[]}`. Both blockers at once — no tombstone kind exists, and one `subject` key cannot name a set. See annotation.delete and element.updateDimensionsBatch.' },
  'furniture.delete':   { kind: 'not-synced', reason: 'LIFECYCLE §NEEDS-TOMBSTONE-KIND: payload is `{furnitureId}` only. See annotation.delete.' },
  'grid.delete':        { kind: 'not-synced', reason: 'LIFECYCLE §NEEDS-TOMBSTONE-KIND: payload is `{gridId}` only. See annotation.delete.' },
  'handrail.delete':    { kind: 'not-synced', reason: 'LIFECYCLE §NEEDS-TOMBSTONE-KIND: payload is `{handrailId}` only. See annotation.delete.' },
  'lighting.delete':    { kind: 'not-synced', reason: 'LIFECYCLE §NEEDS-TOMBSTONE-KIND: payload is `{lightingId}` only. See annotation.delete.' },
  'plumbing.delete':    { kind: 'not-synced', reason: 'LIFECYCLE §NEEDS-TOMBSTONE-KIND: payload is `{plumbingId}` only. See annotation.delete.' },
  'pool.delete':        { kind: 'not-synced', reason: 'LIFECYCLE §NEEDS-TOMBSTONE-KIND: payload is `{poolId}` only, and the handler also removes the pool\'s composed walls/slabs — a CASCADE the tombstone kind must express. See annotation.delete.' },
  'roof.delete':        { kind: 'not-synced', reason: 'LIFECYCLE §NEEDS-TOMBSTONE-KIND: payload is `{roofId}` only. See annotation.delete.' },
  'room.delete':        { kind: 'not-synced', reason: 'LIFECYCLE §NEEDS-TOMBSTONE-KIND: payload is `{roomId}` only. See annotation.delete.' },
  'slab.delete':        { kind: 'not-synced', reason: 'LIFECYCLE §NEEDS-TOMBSTONE-KIND: payload is `{slabId}` only. See annotation.delete.' },
  'stair.delete':       { kind: 'not-synced', reason: 'LIFECYCLE §NEEDS-TOMBSTONE-KIND: payload is `{stairId}` only. See annotation.delete.' },
  'structural.delete':  { kind: 'not-synced', reason: 'LIFECYCLE §NEEDS-TOMBSTONE-KIND: payload is `{structuralId}` only. See annotation.delete.' },
  'wall.delete':        { kind: 'not-synced', reason: 'LIFECYCLE §NEEDS-TOMBSTONE-KIND: payload is `{id}` only. The sharpest instance — a wall a collaborator deleted stays standing in every other document, indefinitely. See annotation.delete.' },
  'schedule.delete':    { kind: 'not-synced', reason: 'LIFECYCLE §NEEDS-TOMBSTONE-KIND, and also a DOCUMENTATION OBJECT whose replication is itself undecided (see schedule.setFilter / view.rename). Two independent blockers.' },
  'section.delete':     { kind: 'not-synced', reason: 'LIFECYCLE §NEEDS-TOMBSTONE-KIND, and a view definition whose replication is undecided. See section.moveLine and annotation.delete.' },
  'sheet.delete':       { kind: 'not-synced', reason: 'LIFECYCLE §NEEDS-TOMBSTONE-KIND, and a documentation object whose replication is undecided. See sheet.rename and annotation.delete.' },
  'view.deleteDefinition': { kind: 'not-synced', reason: 'LIFECYCLE §NEEDS-TOMBSTONE-KIND, and view definitions are the OPEN QUESTION `view.rename` records. The pre-existing `view.delete` entry above declares the same thing under the other key.' },
  'viewTemplate.delete':{ kind: 'not-synced', reason: 'LIFECYCLE §NEEDS-TOMBSTONE-KIND, and a view template is the undecided class `viewTemplate.update` names. See view.rename.' },
  'elementType.delete': { kind: 'not-synced', reason: 'LIFECYCLE §NEEDS-TOMBSTONE-KIND on a TYPE CATALOGUE entry — not a placed element at all. See elementType.update for the catalogue-scope kind this needs.' },

  // ── NOT SYNCED — BATCH CREATION: multi-subject, and the widest gap here ────
  //
  // `*.batch.create` takes `{ <x>s: readonly CreatePayload[] }` and runs ONE
  // `produceCommand` over the whole array (§batch-perf). It does NOT re-dispatch
  // the singular `*.create` verbs, so the singular declarations above cover none
  // of this traffic. `ElementPropertyDisposition` names exactly one `subject` key
  // resolving to one id STRING; an array of payloads has no representation here —
  // the same missing shape `element.updateDimensionsBatch` records.
  //
  // ⚠ This is the path GENERATION runs on. Every wall, slab and door a generator
  // produces arrives through these verbs, so "generation does not replicate" is
  // this entry, not the `generation.*` entries below.
  // §NEEDS-MULTI-SUBJECT-KIND.
  'beam.batch.create':        { kind: 'not-synced', reason: 'MULTI-SUBJECT §NEEDS-MULTI-SUBJECT-KIND: payload is `{beams: CreateBeamPayload[]}` applied in ONE produceCommand; no singular create is re-dispatched. One `subject` key cannot name an array.' },
  'ceiling.batch.create':     { kind: 'not-synced', reason: 'MULTI-SUBJECT §NEEDS-MULTI-SUBJECT-KIND: `{ceilings: CreateCeilingPayload[]}`. See beam.batch.create.' },
  'column.batch.create':      { kind: 'not-synced', reason: 'MULTI-SUBJECT §NEEDS-MULTI-SUBJECT-KIND: `{columns: CreateColumnPayload[]}`. See beam.batch.create.' },
  'curtain-wall.batch.create':{ kind: 'not-synced', reason: 'MULTI-SUBJECT §NEEDS-MULTI-SUBJECT-KIND: `{curtainWalls?: CreateCurtainWallPayload[]}`, and it can also DERIVE the set from `slabId` — so the subject may not be in the payload at all. See beam.batch.create.' },
  'door.batch.create':        { kind: 'not-synced', reason: 'MULTI-SUBJECT §NEEDS-MULTI-SUBJECT-KIND: `{doors: CreateDoorPayload[]}`. See beam.batch.create.' },
  'furniture.batch.create':   { kind: 'not-synced', reason: 'MULTI-SUBJECT §NEEDS-MULTI-SUBJECT-KIND: `{furniture: CreateFurnitureBatchEntry[]}`. See beam.batch.create.' },
  'slab.batch.create':        { kind: 'not-synced', reason: 'MULTI-SUBJECT §NEEDS-MULTI-SUBJECT-KIND: `{slabs: CreateSlabPayload[]}`. See beam.batch.create.' },
  'stair.batch.create':       { kind: 'not-synced', reason: 'MULTI-SUBJECT §NEEDS-MULTI-SUBJECT-KIND: `{stairs: CreateStairPayload[]}`. See beam.batch.create.' },
  'wall.batch.create':        { kind: 'not-synced', reason: 'MULTI-SUBJECT §NEEDS-MULTI-SUBJECT-KIND: `{walls: CreateWallPayload[]}` — the highest-traffic creation verb in the product, and the one every generator uses. See beam.batch.create.' },
  'window.batch.create':      { kind: 'not-synced', reason: 'MULTI-SUBJECT §NEEDS-MULTI-SUBJECT-KIND: `{windows: CreateWindowPayload[]}`. See beam.batch.create.' },
  'curtain-wall.batch.update':{ kind: 'not-synced', reason: 'MULTI-SUBJECT §NEEDS-MULTI-SUBJECT-KIND: `{updates: {id, updates}[]}` — a per-element patch LIST. See beam.batch.create.' },
  'curtain-wall.batch.delete':{ kind: 'not-synced', reason: 'MULTI-SUBJECT + LIFECYCLE: `{ids: string[]}`. Both missing kinds at once — see beam.batch.create and annotation.delete.' },

  // ── NOT SYNCED — DERIVED-MULTI CREATION: the subject is minted inside ──────
  //
  // Each of these creates N elements whose ids are MINTED INSIDE the handler from
  // a derived set (every slab, every floor, a slab perimeter, a wall list). The
  // adapter cannot key records it has no ids for — the same objection `grid.add`
  // records. Not the batch shape above: here the payload does not even carry the
  // element payloads, only the parameters used to derive them.
  'curtain-wall.create-on-all-slabs': { kind: 'not-synced', reason: 'DERIVED-MULTI: payload is `{height?, gridXSpacing?, gridYSpacing?}` — the SET is resolved from every slab in the local store and every id is minted inside. No subject exists in the payload; see grid.add.' },
  'slab.create-on-all-floors':        { kind: 'not-synced', reason: 'DERIVED-MULTI: payload is placement parameters only; the target floors and the new slab ids are resolved and minted inside. See grid.add.' },
  'wall.create-on-all-slabs':         { kind: 'not-synced', reason: 'DERIVED-MULTI: payload is `{wallHeight?, wallThickness?}`; walls and their ids are derived from every slab inside the handler. See grid.add.' },
  'wall.createFromSlab':              { kind: 'not-synced', reason: 'DERIVED-MULTI: payload is a `perimeter` polygon; ONE wall per edge is minted inside via createId(\'wall\'). Multi-subject with no ids in the payload. See grid.add.' },
  'dimension.createMany':             { kind: 'not-synced', reason: 'MULTI-SUBJECT: payload is `{dimensions: CreateDimensionPayload[]}` — an array, which one `subject` key cannot name. See beam.batch.create.' },
  'window.parametricCreate':          { kind: 'not-synced', reason: 'DERIVED-MULTI + LATE-BOUND: `wallIds: string[] | "all"` selects the hosts, and N window ids are minted inside. Both the wall.updateColorBatch "all" seam and the missing multi-subject kind. See grid.add.' },
  'plumbing.createFixture':           { kind: 'not-synced', reason: 'SUBJECT DOES NOT EXIST IN THE PAYLOAD: payload is `{fixtureType, position, …}` with no id key at all — the fixture id is minted inside CreatePlumbingFixtureHandler. Contrast plumbing.create, which accepts `id` and IS declared synced. See grid.add.' },
  // §L-937 — one of the TWO verbs the founder saw warn live.
  'stair.createRailing':              { kind: 'not-synced', reason: 'SUBJECT DOES NOT EXIST IN THE PAYLOAD: `stairId` is the HOST, not the subject — the railing\'s own id is minted inside CreateStairRailingCommand on the legacy commandManager path, and the bus handler returns an EMPTY patch pair. Declaring `stairId` would write the railing\'s dimensions onto the STAIR record. Needs the handler to surface the minted railing id, exactly as grid.add does.' },
  'wall.createOpening':               { kind: 'not-synced', reason: 'COLLECTION: inserts an `opening` record into the host wall\'s opening list; the member carries its own id and the payload keys the WALL. The single-subject path would store the opening object as a property of the wall. See curtain-wall.addPanel.' },
  'wall.opening.create':              { kind: 'not-synced', reason: 'COLLECTION: the legacy-adapter twin of wall.createOpening — `{wallId, openingData}`, a list insert on the host wall. See curtain-wall.addPanel.' },

  // ── NOT SYNCED — TOPOLOGY EDITS: one subject in, different subjects out ────
  'wall.cut':   { kind: 'not-synced', reason: 'TOPOLOGY: consumes wall `id` and produces TWO walls whose ids (`leftId`/`rightId`) are optional in the payload and minted inside otherwise. A create, a create and a delete in one dispatch — expressible by none of the three kinds this file has.' },
  'wall.split': { kind: 'not-synced', reason: 'TOPOLOGY: the same payload and the same one-in/two-out shape as wall.cut.' },
  'wall.join':  { kind: 'not-synced', reason: 'MULTI-SUBJECT TOPOLOGY: payload is `{idA, endpointA, idB, endpointB}` — TWO wall subjects welded at named endpoints. One `subject` key cannot name a pair, and the result mutates both.' },
  'roof.joinRoofs': { kind: 'not-synced', reason: 'MULTI-SUBJECT TOPOLOGY: `{sourceId, targetId}` — merges the source into the target and removes the source. Two subjects plus a deletion; see wall.join and annotation.delete.' },
  'wall.transform': { kind: 'not-synced', reason: 'RELATIVE: a discriminated union whose `move` arm carries `delta: XZPoint`, applied to the baseline. A displacement is not a property and is not base-independent — see annotation.move.' },
  'curtain-wall.rotatePanel': { kind: 'not-synced', reason: 'COLLECTION + RELATIVE: mutates ONE panel inside the curtain wall\'s panel list, and its `deltaDeg` arm is a displacement. Both class-2 and class-3 objections apply; see curtain-wall.addPanel and annotation.move.' },
  'curtain-wall.swapPanel':   { kind: 'not-synced', reason: 'COLLECTION: replaces the kind/material of ONE panel keyed by `panelId` inside the host wall\'s list. See curtain-wall.setPanelType, which is the same edit under another name.' },
  'schedule.column.add':      { kind: 'not-synced', reason: 'COLLECTION on a DOCUMENTATION OBJECT: splices a column into the schedule\'s column list at `at`. Position-keyed list edits merge wrongly as scalars (see slab.removeHole), and whether schedules replicate at all is undecided (schedule.setFilter).' },
  'schedule.column.remove':   { kind: 'not-synced', reason: 'COLLECTION on a DOCUMENTATION OBJECT: removes `columnId` from the schedule\'s column list. See schedule.column.add.' },
  'sheet.reorder':            { kind: 'not-synced', reason: 'COLLECTION on a DOCUMENTATION OBJECT: splices the sheet to `newIndex` in the sheet ORDER — the mutated state is the list, not the sheet. See sheet.addViewport and sheet.rename.' },

  // ── NOT SYNCED — DOCUMENT MOVE: levelId is routing, so a re-route is invisible ─
  //
  // `levelId` is in GLOBAL_PROPERTY_EXCLUDES because ADR-049 uses it to SELECT the
  // Y.Doc. A level reassignment is therefore the one mutation the property path is
  // built to discard: it would replicate `newElevationY` into the element's OLD
  // document and leave the element in a level it no longer belongs to. Needs a
  // document-move disposition kind.
  'wall.changeLevel': { kind: 'not-synced', reason: 'DOCUMENT MOVE §NEEDS-DOC-MOVE-KIND: `{id, newLevelId, newElevationY}` re-homes the wall to another ADR-049 per-level doc. levelId is CRDT ROUTING, not a property, so the generic path would write the elevation into the doc the wall is leaving.' },
  'roof.changeLevel': { kind: 'not-synced', reason: 'DOCUMENT MOVE §NEEDS-DOC-MOVE-KIND: `{roofId, levelId}` — and `levelId` is in GLOBAL_PROPERTY_EXCLUDES, so extraction yields ZERO properties and the declaration would replicate literally nothing while reading as synced. See wall.changeLevel.' },
  'level.duplicate-floor-plan': { kind: 'not-synced', reason: 'DERIVED-MULTI ACROSS DOCS: `{sourceLevelId, targetLevelIds[]}` copies a whole level\'s elements into N other levels, minting every id inside. A level is not an element (see level.add), the target is a set, and the ids do not exist in the payload.' },

  // ── NOT SYNCED — ORCHESTRATION TRIGGERS (the founder\'s other warning) ──────
  //
  // §L-937. `generation.rooms` was the second live warning, and the disposition is
  // NOT a shortcut: the payload is a BRIEF (`typology`, `floors`, `bedrooms`), with
  // no element subject anywhere in it. The generators mutate through the element
  // and BATCH commands they dispatch downstream, so the state to replicate is
  // those commands' — replicating the TRIGGER would sync the instruction instead,
  // and each receiving client would RE-RUN a scored, non-deterministic generator
  // and arrive at a DIFFERENT building. That is strictly worse than not
  // replicating. The `room.redetect` entry records the same reasoning for a
  // recompute.
  //
  // ⚠ NOT ASSERTED HERE: that the generated elements therefore reach a peer. They
  // travel on `*.batch.create`, which is declared NOT-SYNCED above for want of a
  // multi-subject kind. Naming the trigger correctly does not close that.
  'generation.building':      { kind: 'not-synced', reason: 'ORCHESTRATION TRIGGER: payload is a BRIEF (`typology`, `floors`, `roofKind`) with no element subject. The state lives in the element/batch commands the generator dispatches; replicating the trigger would re-run a non-deterministic generator on each peer and produce a different building. See room.redetect.' },
  'generation.apartment':     { kind: 'not-synced', reason: 'ORCHESTRATION TRIGGER: payload is a BRIEF (`bedrooms`, `bathrooms`, `masterEnSuite`). See generation.building.' },
  'generation.rooms':         { kind: 'not-synced', reason: 'ORCHESTRATION TRIGGER (§L-937 — one of the two verbs the founder saw warn live): payload is a room BRIEF with no element subject; the rooms it produces are dispatched as their own commands. See generation.building.' },
  'generation.finish-chain':  { kind: 'not-synced', reason: 'ORCHESTRATION TRIGGER: chains ceiling → furnish → light over an already-generated layout. No element subject; every mutation is a downstream command. See generation.building.' },
  'generative.applyLayout':   { kind: 'not-synced', reason: 'ORCHESTRATION TRIGGER: payload is `{layout, levelId, levelHeight}` — a whole layout DTO plus a level, not an element. The elements it materialises carry their own commands. See generation.building.' },
  'room.regenerate':          { kind: 'not-synced', reason: 'DERIVED RECOMPUTE with a LEVEL subject: `{levelId, roomIds?, generator?}` re-derives rooms from wall geometry. Identical reasoning to room.redetect — a level is not an element, and a recompute trigger is an instruction, not state.' },
  'room.recomputeBoundary':   { kind: 'not-synced', reason: 'DERIVED RECOMPUTE: `{roomId, cascadedFrom?, wallId?}` carries NO boundary — the new geometry is derived inside from the walls. The payload is provenance, so the generic path would replicate `cascadedFrom` and `wallId` as properties of the room. See room.redetect.' },

  // ── NOT SYNCED — QUERIES: nothing is mutated, so nothing can replicate ─────
  //
  // These are READ verbs registered on the bus so the RAC can ask the semantic
  // graph questions. They return an answer on the command record and mutate no
  // store. A disposition is required (the runtime warns on every dispatched type)
  // but replication is not merely unwired here — it is meaningless.
  'graph.query':     { kind: 'not-synced', reason: 'QUERY, NOT A MUTATION: reads the semantic graph for `{elementId, relationshipType}` and returns the answer to the caller. It writes no store, so there is no state to replicate — each client queries its own graph.' },
  'graph.neighbors': { kind: 'not-synced', reason: 'QUERY, NOT A MUTATION: reads adjacent elements for `elementId`. See graph.query.' },
  'graph.path':      { kind: 'not-synced', reason: 'QUERY, NOT A MUTATION: reads a circulation path between `fromRoomId` and `toRoomId`. See graph.query.' },

  // ── NOT SYNCED — PER-VIEWER / PER-USER state (P7), correctly local ─────────
  'view.hideElement':       { kind: 'not-synced', reason: 'Per-viewer visibility override keyed by (viewId, elementId); the plugin-side twin of element.hideInView above, and local for the same reason.' },
  'view.isolateElement':    { kind: 'not-synced', reason: 'Per-viewer isolation keyed by (viewId, elementId); the twin of element.isolateInView. Replicating it would blank a collaborator\'s view.' },
  'view.clearOverride':     { kind: 'not-synced', reason: 'COMPOSITE SUBJECT — clears the override at (viewId, targetKind, targetId). The inverse of view.setGraphicOverride and unreplicated for the same two reasons: the path is single-subject and views are unreplicated.' },
  'view.clearAllOverrides': { kind: 'not-synced', reason: 'Clears EVERY graphic override in one view. The subject is the VIEW, not an element, and views are unreplicated (see view.rename).' },
  'selection.deselect':     { kind: 'not-synced', reason: 'Selection is per-user and travels over PRESENCE/awareness, not the document; the third member of selection.select / selection.clear above.' },
  'copy-selection':         { kind: 'not-synced', reason: 'Per-user CLIPBOARD: the payload is empty (`Record<string, never>`) and the handler copies the local selection into a local clipboard buffer. Nothing about one user\'s clipboard is model state.' },
  'paste-clipboard':        { kind: 'not-synced', reason: 'Per-user clipboard READ that creates N elements with ids minted inside (`freshId()`). Empty payload, so no subject exists to key; the pasted elements need the multi-subject kind. See copy-selection and grid.add.' },
  'zoom-fit':               { kind: 'not-synced', reason: 'Per-viewer CAMERA fit with an empty payload; replicating it would yank a collaborator\'s camera. Same owner as view.updateCamera (C66 §4, CameraPositionService).' },
  'zoom-selected':          { kind: 'not-synced', reason: 'Per-viewer camera fit to the local selection — doubly local, since the selection it reads is per-user too. See zoom-fit.' },

  // ── NOT SYNCED — NON-ELEMENT SUBJECTS: hierarchy, catalogue, view, intent ──
  'hierarchy.createSite':     { kind: 'not-synced', reason: 'PROJECT HIERARCHY node, not an element — the creation counterpart of hierarchy.updateNode above, and blocked by the same missing coordination-scope kind.' },
  'hierarchy.createBuilding': { kind: 'not-synced', reason: 'PROJECT HIERARCHY node (building under a site). See hierarchy.createSite and hierarchy.updateNode.' },
  'hierarchy.createLevel':    { kind: 'not-synced', reason: 'PROJECT HIERARCHY node, and its `bimLevelId` collides with the ADR-049 routing that level.add names. See hierarchy.updateNode.' },
  'hierarchy.createUnit':     { kind: 'not-synced', reason: 'PROJECT HIERARCHY node (unit under a level). See hierarchy.createSite.' },
  'data.markPropertyDerived': { kind: 'not-synced', reason: 'PROVENANCE on a hierarchy node, not a value: `{nodeId, key, reason}` marks ONE property key as derived. Same class as data.setDerivation above — the subject is a node and the payload is a key name.' },
  'data.clearPropertyDerived':{ kind: 'not-synced', reason: 'PROVENANCE on a hierarchy node: clears the derived mark for `{nodeId, key}`. See data.markPropertyDerived.' },
  'elementType.create':       { kind: 'not-synced', reason: 'TYPE CATALOGUE entry — project LIBRARY state, not a placed element, and keyed by (family, typeId). Needs the catalogue-scope kind elementType.update names.' },
  'elementType.duplicate':    { kind: 'not-synced', reason: 'TYPE CATALOGUE entry cloned to a new (family, typeId). See elementType.create and elementType.update.' },
  'template.create':          { kind: 'not-synced', reason: 'ROOM TEMPLATE — a reusable library record with a `scope`, not a placed element. Same catalogue-scope objection as elementType.create.' },
  'template.assignToNode':    { kind: 'not-synced', reason: 'COMPOSITE SUBJECT: binds `templateId` to a HIERARCHY NODE (`nodeId`, `nodeType`). Neither end is an element — see hierarchy.updateNode and elementType.update.' },
  'template.unassign':        { kind: 'not-synced', reason: 'Removes the template binding from hierarchy node `nodeId`. See template.assignToNode.' },
  'viewTemplate.create':      { kind: 'not-synced', reason: 'OPEN QUESTION (documentation object): a VIEW TEMPLATE is the undecided class viewTemplate.update records. See view.rename.' },
  'view.createDefinition':    { kind: 'not-synced', reason: 'OPEN QUESTION: a VIEW DEFINITION — precisely what view.rename declines to decide. The pre-existing `view.create` entry above declares the same thing under the other key.' },
  'elevation.create':         { kind: 'not-synced', reason: 'OPEN QUESTION: an ELEVATION MARK creates a view definition plus a navigable marker — the same undecided class as section.moveLine and view.rename.' },
  'section.create':           { kind: 'not-synced', reason: 'OPEN QUESTION: a SECTION is a view definition with a cut line. See section.moveLine and view.rename.' },
  'section.mark.create':      { kind: 'not-synced', reason: 'OPEN QUESTION: creates the section VIEW DEFINITION plus its cross-reference annotation, keyed by `{sectionViewId, hostViewId}` — a pair, and both ends are views. See section.create.' },
  'sheet.create':             { kind: 'not-synced', reason: 'OPEN QUESTION (documentation object): a SHEET is shared drawing output whose replication sheet.rename declines to decide.' },
  'schedule.create':          { kind: 'not-synced', reason: 'OPEN QUESTION (documentation object): a SCHEDULE is a shared derived table, the class schedule.setFilter records as undecided.' },
  'vg.createVisibilityIntent':{ kind: 'not-synced', reason: 'A VISIBILITY INTENT (P7, packages/visibility) is a domain record but not an element, and the P7 gate states its persistence and per-view scoping are NOT CHECKED. See vg.updateVisibilityIntent.' },
  'vg.assignIntent':          { kind: 'not-synced', reason: 'COMPOSITE SUBJECT: binds `intentId` to `viewId`. Neither is an element, and views are unreplicated. See vg.updateVisibilityIntent and view.rename.' },
  'vg.takeLatestIntentVersion': { kind: 'not-synced', reason: 'Advances ONE view to the newest version of its assigned intent — subject is `viewId`, a view, and the mutation is a version pointer. See vg.assignIntent.' },
  'rhino.resetMaterial':      { kind: 'not-synced', reason: 'NO ELEMENT SUBJECT: restores the imported Rhino scene group\'s original materials from a snapshot. Those meshes are in no geometry store, so there is no per-element record to key — the exact objection rhino.setMaterial records.' },
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
