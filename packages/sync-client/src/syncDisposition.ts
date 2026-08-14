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
