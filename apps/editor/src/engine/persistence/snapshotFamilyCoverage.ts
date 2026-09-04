// snapshotFamilyCoverage — §PERSIST103 (L-11520) · C13 · C47 · C84 EI-6.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ THE DECLARED ANSWER TO ONE QUESTION: **does this element family survive a
//    save and a reload?** — one row per plugin DTO store, no exceptions, no blanks.
// ═══════════════════════════════════════════════════════════════════════════════
//
// ─── WHY THIS FILE EXISTS ──────────────────────────────────────────────────────
// `ProjectSerializer.ts` has now lost an entire element family THREE TIMES, and it
// documents two of them in its own source:
//
//   · §PERSIST-LIGHTING (2026-05-22) — *"lighting fixtures were NEVER serialized, so
//     every light the user placed was silently lost on reload."*
//   · §FIX-POOL-AND-BOUNDARY-LINE-INVISIBLE (L-9948, 2026-08-23) — *"`grep -c
//     "boundaryLine" ProjectSerializer.ts` → **0**, in BOTH copies … the record died
//     on save."*
//   · §PERSIST103 (L-11520, 2026-08-26) — the founder: *"11 elements did not survive
//     project opening — the lift for example, I can see it is not there."* Measured:
//     `grep -c "liftStore\|liftCompound\|LiftCompound" ProjectSerializer.ts` → **0**,
//     and the same zero for `pool`, `water`, `balcony`, `structural` and `section`.
//
// Each fix added ONE key and left the CLASS open. A comment is not a detector — that
// sentence is already written in `CommandEventBridge.ts`, about this same family of
// defect, and the lift shipped afterwards with the identical silence anyway.
//
// ⭐ THIS TABLE IS THE SIBLING GATE `check-mirror-completeness.ts` ASKS FOR BY NAME:
//
//     "⛔ It does not check the serializer. `boundaryLine` had a third break — zero
//      occurrences in either `ProjectSerializer` — and no arm here would have seen
//      it. That is a sibling gate somebody still has to write."
//
// `tools/ga-gate/check-snapshot-family-coverage.ts` is that gate, and this file is
// the authority it reads. Add a `Store` subclass to `plugins/<x>/src/store.ts` and
// the gate goes RED until a row appears here — so the NEXT family cannot be lost in
// silence, only lost LOUDLY and on purpose.
//
// ─── WHY A DECLARED TABLE AND NOT A REGEX OVER THE SERIALIZER ──────────────────
// A gate that greps `ProjectSerializer.ts` for the store key would score `structural`
// as covered (the word appears in three unrelated comments) and `water` as covered
// (`window.runtime` contains no `water`, but `curtainWalls`/`boundaryLines` prose
// does). [[grep-silence-has-three-causes]] cuts both ways: a grep that returns a HIT
// is not the same fact as a thing that is persisted. So the claim is DECLARED here,
// per family, and the gate checks the declaration against the snapshot's own field
// list — a set comparison, never a substring.
//
// ─── THE VOCABULARY IS CLOSED, ON PURPOSE ──────────────────────────────────────
// A free-text status would let the next lane invent a category meaning "I did not
// want to think about it" — the failure `check-mirror-completeness.ts` names in its
// own EXEMPT_KINDS comment.
//
// ⛔ THIS TABLE IS NOT A PERMISSION SLIP. An `UNPERSISTED` row does not make the loss
// acceptable; it makes the loss DECLARED, countable and shrink-only. Read the
// `UNPERSISTED` rows as a work list, exactly as `mirror-debt.json` is read.

/**
 * What a row CLAIMS about its family. Closed vocabulary — the gate rejects anything
 * else, and each value is checked differently:
 *
 *  · `persisted`      — the family reaches the snapshot under `snapshotKey`, and the
 *                       gate VERIFIES that key is a real field of `ProjectSnapshot`
 *                       AND is written by `serialize()`. A false claim here is worse
 *                       than an honest `UNPERSISTED`, so it is the arm with no slack.
 *  · `via-legacy-twin`— the family's records reach the snapshot through a DIFFERENT
 *                       store than the plugin DTO one (the legacy geometry twin that
 *                       `CommandEventBridge` mirrors into). The DATA survives; the
 *                       plugin store is repopulated by the loader's own path, not by
 *                       a key of its own. Verified the same way as `persisted`.
 *  · `not-model-state`— the store holds no authored model: transient UI selection, a
 *                       view pointer, a dev toy. Nothing to persist, and persisting
 *                       it would be the defect.
 *  · `UNPERSISTED`    — ⛔ THE BACKLOG. Records the user authored are destroyed on
 *                       reload. A DEFECT with a row, never an exemption. Shrink-only.
 */
export type SnapshotFamilyStatus =
    | 'persisted'
    | 'via-legacy-twin'
    | 'not-model-state'
    | 'UNPERSISTED';

export interface SnapshotFamilyRow {
    /**
     * The `super('<key>')` argument of the `Store` subclass in
     * `plugins/<plugin>/src/store.ts` — the key `PluginRegistry` binds and the key
     * `affectedStores` names.
     *
     * ⚠ NOT the plugin directory name and NOT the class name. `plugins/curtain-wall`
     * binds `curtainwall`, unhyphenated; `plugins/dimensions` binds `dimension`,
     * singular. One character of drift here made a live channel read `0 subscribers`
     * once already ([[grep-silence-has-three-causes]]).
     */
    readonly storeKey: string;
    readonly status: SnapshotFamilyStatus;
    /**
     * The top-level field of `ProjectSnapshot` this family's records land in.
     * `null` for every status except `persisted` / `via-legacy-twin`, where it is
     * REQUIRED and is checked against the interface.
     */
    readonly snapshotKey: string | null;
    /** Non-empty, always. A blank reason is how a ledger becomes a rubber stamp. */
    readonly reason: string;
}

/**
 * ⛔ ONE ROW PER `super('key')` FOUND UNDER `plugins/<pkg>/src/store.ts`. The gate
 * compares the two SETS in BOTH directions, so a missing row and a stale row are
 * both RED — the `check-contract-index-equivalence.ts` discipline (a count can be
 * right while the membership is wrong), applied to persistence.
 */
export const SNAPSHOT_FAMILY_COVERAGE: readonly SnapshotFamilyRow[] = Object.freeze([
    // ── The long-standing element families ────────────────────────────────────
    { storeKey: 'wall', status: 'via-legacy-twin', snapshotKey: 'walls',
      reason: 'Serialized from the legacy WallStore (ProjectStores.wallStore); the plugin DTO twin is mirrored into it by CommandEventBridge `wall.created`.' },
    { storeKey: 'slab', status: 'via-legacy-twin', snapshotKey: 'slabs',
      reason: 'Serialized from the legacy SlabStore; plugin twin mirrored via `slab.created`.' },
    { storeKey: 'door', status: 'via-legacy-twin', snapshotKey: 'doors',
      reason: 'Serialized from the legacy door store; the C15 hosted path writes it through the one `buildDoorStoreRecord` chokepoint on `wall.opening.created`.' },
    { storeKey: 'window', status: 'via-legacy-twin', snapshotKey: 'windows',
      reason: 'As door — hosted, serialized from the legacy window store.' },
    { storeKey: 'column', status: 'via-legacy-twin', snapshotKey: 'columns',
      reason: 'Serialized from the legacy ColumnStore.' },
    { storeKey: 'beam', status: 'via-legacy-twin', snapshotKey: 'beams',
      reason: 'Serialized from the legacy BeamStore (C100 §2.1 materialId included since L-1127 ARM D).' },
    { storeKey: 'stair', status: 'via-legacy-twin', snapshotKey: 'stairs',
      reason: 'Serialized from the legacy StairStore.' },
    { storeKey: 'roof', status: 'via-legacy-twin', snapshotKey: 'roofs',
      reason: 'Serialized from the legacy RoofStore.' },
    { storeKey: 'curtainwall', status: 'via-legacy-twin', snapshotKey: 'curtainWalls',
      reason: 'Serialized from the legacy CurtainWallStore; per-panel authoring rides the sparse `curtainPanels` key (§L-1057).' },
    { storeKey: 'grid', status: 'via-legacy-twin', snapshotKey: 'grids',
      reason: 'Serialized from the legacy GridStore.' },
    { storeKey: 'handrail', status: 'via-legacy-twin', snapshotKey: 'handrails',
      reason: 'Serialized from the legacy HandrailStore; custom railing types ride `handrailTypes` (C95 §15.7 R3).' },
    { storeKey: 'ceiling', status: 'via-legacy-twin', snapshotKey: 'ceilings',
      reason: 'Serialized from the legacy CeilingStore; optional key, omitted when none authored.' },
    { storeKey: 'floor', status: 'via-legacy-twin', snapshotKey: 'floors',
      reason: 'Serialized from the legacy FloorStore; optional key, omitted when none authored.' },
    { storeKey: 'furniture', status: 'via-legacy-twin', snapshotKey: 'furniture',
      reason: 'Serialized from the legacy FurnitureStore.' },
    { storeKey: 'plumbing', status: 'via-legacy-twin', snapshotKey: 'plumbing',
      reason: 'Serialized from the legacy PlumbingStore. ⚠ C109 §L-11405 (OPEN, not this lane): a bathroom POD parent is not persisted AS a pod — its member fixtures survive, the compound identity does not.' },
    { storeKey: 'room', status: 'via-legacy-twin', snapshotKey: 'rooms',
      reason: 'Serialized from the room-topology RoomStore. ⚠ The plugin binds `super(\'room\')` while PluginRegistry declares storeKey `rooms` — a divergence noted, not introduced here.' },
    { storeKey: 'lighting', status: 'via-legacy-twin', snapshotKey: 'lighting',
      reason: '§PERSIST-LIGHTING (2026-05-22) — read from the window-managed legacy lightingStore, which is also the store CreateLightingCommand writes on restore. ⚠ The PLUGIN LightingStore at runtime.stores.lighting is NOT repopulated by a load (L-11405 shape); the data survives, the plugin store does not see it.' },
    { storeKey: 'annotation', status: 'persisted', snapshotKey: 'annotations',
      reason: '§ANN-A2 — the annotations block carries AnnotationElement records keyed by ownerViewId.' },
    { storeKey: 'dimension', status: 'persisted', snapshotKey: 'annotations',
      reason: '§ANN-A2 — dimensions ride the SAME `annotations` block as its `dimensions` array; the family has no top-level key of its own.' },
    { storeKey: 'boundaryLine', status: 'persisted', snapshotKey: 'boundaryLines',
      reason: '§FIX-POOL-AND-BOUNDARY-LINE-INVISIBLE (L-9948) · C106 — read from the ONE authority (runtime.stores.boundaryLine). ⚠ CORRECTED 2026-08-30 (L-11528): this row used to read "restored by dispatching the bus verb", and that restore SAT IN THE LEGACY BRANCH of ProjectLoader while `_useImportCommandPath()` defaults TRUE and `grep -c boundaryLine ImportProjectCommand.ts` -> 0, so it never ran in production — saved and never read back. Now restored ONCE in the common tail by `restoreCompoundFamilies`, through `boundaryLineUndoAdapter` (store applyPatch + the family\'s own bus events, so the 3-D linework and the plan symbol are rebuilt by the SAME §FT-BOUNDARY-LINE seam). ⭐ That route also carries `attachments[]` back verbatim, which the bus verb could not (CreateBoundaryLineHandler writes `attachments: []` by construction) — L-9950 CLOSED for the restore path.' },

    // ── §PERSIST103 (L-11520) — the five this lane closed ─────────────────────
    { storeKey: 'lift', status: 'persisted', snapshotKey: 'lifts',
      reason: '§PERSIST103 (L-11520) · C104 — the compound parent. Its shaft walls / glass / landing doors / slab voids already survived as their OWN families (CommandEventBridge mirrors them into the legacy stores the serializer reads); the parent record did not, so the lift stopped being a lift on reload.' },
    { storeKey: 'liftPart', status: 'persisted', snapshotKey: 'liftParts',
      reason: '§PERSIST103 (L-11520) · C104 §2.2 — the five LOD-300 cabin parts, the only lift members with no other family to belong to. They have no legacy twin at all, so they were destroyed outright: the cabin vanished while the shaft walls remained.' },
    { storeKey: 'pool', status: 'persisted', snapshotKey: 'pools',
      reason: '§PERSIST103 (L-11520) · ADR-0124 — the pool compound parent. Its walls and floor slab survive as wall/slab; the parent (hostSlabId, childrenIds, the void it punched) did not.' },
    { storeKey: 'water', status: 'persisted', snapshotKey: 'waters',
      reason: '§PERSIST103 (L-11520) · ADR-0124 §4 — the water body. Like liftPart it has NO legacy twin and no family of its own, so it was destroyed outright: a reloaded pool was a dry hole.' },
    { storeKey: 'balcony', status: 'persisted', snapshotKey: 'balconies',
      reason: '§PERSIST103 (L-11520) · C103 — the compound parent. Its slab, floor finish and railings survive as their own families; the balcony record (childrenIds, hostWallId, profile) did not. ⚠ CORRECTED 2026-08-30 (L-11530): this row read `persisted` for four days while the family was STILL destroyed on every reload. The serializer reads it as `readPluginStore(\'balcony\')` = `window.runtime.stores.balcony`; `window.runtime` is the composeRuntime() handle, and `StoresSlot` declared no `balcony` key and no index signature — so the read was `undefined`, `balconies` was never written, and because THIS ROW said `persisted` the family stayed out of UNPERSISTED_FAMILY_KEYS and out of the C84 EI-6 save-time loss warning. Closed by adopting the store in composeRuntime, exactly as §BATH102 adopted lift/liftPart/pool/water. ⛔ A `persisted` row asserts the READ CHANNEL resolves, not merely that a key and a writer exist — this gate checks the latter and says so.' },

    // ── §COMPONENT-PLACE (audit §12 Phase 4C · ADR-0376 D9) — THE JOIN ───────
    { storeKey: 'component', status: 'persisted', snapshotKey: 'components',
      reason: '§COMPONENT-PLACE (audit §12 Phase 4C) · ADR-0376 D9 · C84 §6.2 — the PLACED OCCURRENCE of a component definition, and the family the universal-component-editor programme exists to create: the audit\'s §3.1 headline gap is that NO BUS VERB ANYWHERE IN THIS REPOSITORY placed a component into a project. ⭐ THE ROW LANDS IN THE SAME COMMIT AS THE FAMILY, AND ITS READ CHANNEL WAS PROVEN BY EXECUTION BEFORE THE ROW WAS WRITTEN — which is the R11 / L-11530 lesson applied forwards instead of backwards. The `balcony` row above read `persisted` for FOUR DAYS while every balcony was destroyed on reload, because the family had a store, a writer and a snapshot key while `StoresSlot` had no `balcony` key: `readPluginStore(\'balcony\')` = `window.runtime.stores.balcony` resolved `undefined`, the slice was never written, and this table\'s own claim kept the family out of UNPERSISTED_FAMILY_KEYS and out of the C84 EI-6 save-time loss warning. So for THIS family the channel is closed end to end and each leg is executed by a named arm rather than declared: (1) `StoresSlot.component` is declared in `packages/runtime-composer/src/types.ts` and assigned in `composeRuntime.ts` from the `component` PluginRegistry descriptor — ADOPTED, never constructed; (2) `ProjectSerializer.serialize()` reads it through the shared lazy `readPluginStore(\'component\')` and writes `components`, omit-when-absent per C47 so an untouched project stays byte-identical; (3) `restoreCompoundFamilies()` reads that slice back through `resolveComposedStoreFromWindow(\'component\')` in the loader\'s COMMON TAIL (never inside one branch — that is L-11528, where a restore sat on the path production does not take and never ran); (4) `apps/editor/__tests__/componentJoinThroughComposedRuntime.test.ts` boots the REAL composition root, dispatches `component.place`, reads the occurrence back OUT of `rt.stores.component` (C16 CA-21 — never the handler\'s return, never a spy), then serialises and restores and reads it back again. ⛔ THIS FAMILY HAS NO LEGACY TWIN AND NO MEMBER FAMILIES, which makes the loss it would suffer TOTAL rather than partial: a balcony that lost its parent still left a slab, a finish and railings on screen, and that is precisely why nobody noticed for four days; a placed component that loses `components` leaves NOTHING — the occurrence, its type, its instance overrides and its position vanish together. ⛔ AND WHAT THIS ROW DOES NOT CLAIM (C84 §6.2c): that a placed component RENDERS. Nothing subscribes this store\'s dirty channel at this commit — the 3-D leg is Phase 4E\'s under ADR-0376 D10, whose descope is pre-authorised — so `persisted` here means the RECORD survives a save and a reload, which is exactly what this table asks and no more.' },

    // ── §FEAT-SPACE-ENVELOPE (L-12900 · C114 · ADR-0380) — the authored volume ──
    { storeKey: 'spaceEnvelope', status: 'persisted', snapshotKey: 'spaceEnvelopes',
      reason: '§FEAT-SPACE-ENVELOPE (L-12900) · C114 §9 · ADR-0380 — the AUTHORED spatial volume an architect places BEFORE any wall exists (roles `level` and `room`; `maximumBuildable` is declared and refused at the create verb). ⭐ THE ROW LANDS IN THE SAME COMMIT AS THE CHANNEL AND EVERY LEG IS EXECUTED BY A NAMED ARM, which is the R11 / L-11530 lesson applied forwards — the `component` discipline, not the `balcony` one: (1) `StoresSlot.spaceEnvelope` is declared in `packages/runtime-composer/src/types.ts` and ADOPTED in `composeRuntime.ts` from the `space-envelope` PluginRegistry descriptor, never constructed; (2) `ProjectSerializer.serialize()` reads it through the shared lazy `readPluginStore(\'spaceEnvelope\')` and writes `spaceEnvelopes`, omit-when-absent per C47 so an untouched project stays byte-identical and no SNAPSHOT_SCHEMA_VERSION bump is needed; (3) `restoreCompoundFamilies()` reads that slice back through `resolveComposedStoreFromWindow(\'spaceEnvelope\')` in the loader\'s COMMON TAIL — never inside one branch, which is L-11528; (4) `apps/editor/__tests__/spaceEnvelopeReachableThroughComposedRuntime.test.ts` boots the REAL composition root, dispatches `spaceEnvelope.batch.create`, reads the record back OUT of `rt.stores.spaceEnvelope` (C16 CA-21 — never the handler\'s return, never a spy), then serialises, clears, restores and reads it back again. ⛔ THE LOSS THIS PREVENTS IS TOTAL, NOT PARTIAL, and that asymmetry is why it could not wait: a balcony that lost its parent still left a slab, a finish and railings on screen — which is exactly why nobody noticed for four days — whereas this family has NO legacy twin, NO member families and NO mirror (C114 §2a declines a plugin DTO twin and a `roomStore` mirror by construction), so footprint, height, role, `withinId` and the cited basis vanish together and nothing remains to hint at it. ⛔ AND WHAT THIS ROW DOES NOT CLAIM (C114 §14a): that a space envelope RENDERS. Nothing subscribes this store\'s dirty channel at this commit, so `persisted` here means the RECORD survives a save and a reload — exactly what this table asks, and no more.' },

    // ── Declared losses that remain OPEN — the shrink-only backlog ────────────
    { storeKey: 'structural', status: 'UNPERSISTED', snapshotKey: null,
      reason: 'L-11523 (OPEN) — brace / footing / foundation-slab / connection (S26, ADR-0026) have NO snapshot key and NO legacy twin: `grep -c structural ProjectSerializer.ts` finds only unrelated prose. Every structural record is destroyed on reload. NOT fixed here because the family has no restore command on the loader path and no render mirror to reach (it is also `owner: nothing` in UNMAPPED_BUS_STORE_KEYS) — closing it is a lane, not a key.' },
    { storeKey: 'section', status: 'UNPERSISTED', snapshotKey: null,
      reason: 'L-11524 (OPEN) — SectionStore (plugins/section-view) has no snapshot key, so every section view the user cuts is lost on reload. Sibling of `view`, whose ViewRegistry DOES persist via `viewDefinitions`; the asymmetry is real and undeclared until now.' },

    // ── Found ONLY because the gate's glob was widened past `store.ts` ────────
    //
    // ⭐ NEITHER OF THESE TWO IS VISIBLE TO `check-mirror-completeness.ts`, whose
    // subject is `^plugins/<p>/src/store\.ts$` exactly. They live in files named after
    // their class. A detector that cannot see a family because of its FILENAME is the
    // defect it exists to catch, wearing the detector's uniform — which is why this
    // gate's subject is every file under `plugins/<pkg>/src/` that extends `Store`.
    { storeKey: 'level', status: 'via-legacy-twin', snapshotKey: 'levels',
      reason: 'plugins/plan-view/src/LevelStore.ts — declares `static readonly ephemeral = true` and its own header says levels are "project metadata loaded on project open", not replayed. The AUTHORITY is BimManager: `snapshot.levels` is written from it and restored by AddLevelCommand, which repopulates this session registry. Nothing is lost; the store is a per-session view of a persisted fact.' },
    { storeKey: 'bathroomPod', status: 'persisted', snapshotKey: 'bathroomPods',
      reason: '§PERSIST-BATHROOM-POD (L-11527 / L-11405) · C109 §8 — the compound parent. ⚠ CORRECTED 2026-08-31: this row previously read `UNPERSISTED` with the rationale "lane BATH102 has the store on disk but UNTRACKED, and it is registered in NEITHER `ALL_PLUGINS` nor `runtime.stores`, so no user can author a pod yet and nothing is being destroyed TODAY". ALL THREE CLAUSES WERE FALSE and the classification was right for the wrong reason, which inverted the severity: `git ls-files plugins/plumbing/src/bathroomPodStore.ts` returns the path (tracked); `PluginRegistry.ts:619-624` registers `id: bathroomPod` with `buildStore: () => new BathroomPodStore()` and `composeRuntime.ts:1785` hangs it on `StoresSlot.bathroomPod`; and `BathroomPodPlanToolHandler.ts:330` dispatches `bathroomPod.create` from a REAL plan overlay (pinned by `bathroomPodPointerReach.spec.ts:231`). So pods were being authored and destroyed on every reload, while this row told the reader it was a pre-emptive placeholder. The row and the key now move together, as the row itself required. ⭐ THE LOSS WAS INVISIBLE BECAUSE THE MEMBERS SURVIVED: the WC, basin and shower are `plumbing` fixtures the mirror projects into the legacy store the serializer writes, so a reloaded bathroom still had sanitaryware — it had simply stopped being a pod (no `members[]`, no `parentId`, no drill-in, no delete-reap). Closed by `bathroomPods` in `ProjectSnapshot` (omit-when-absent, C47, no schema bump) plus a restore leg in `restoreCompoundFamilies` that goes through `bathroomPodUndoAdapter` — `Store.applyPatch`, the same method the bus calls on execute — so `bathroomPodMemberMirror` re-projects the members through the ONE road create/undo/redo already take. ⛔ NOT re-dispatching `bathroomPod.create`: that verb runs the C109 solver and would re-fit the pod to the rules of today instead of restoring the pod the architect approved. ⛔ L-11485 comes due: a member moved with `plumbing.moveFixture` writes the legacy store only, so that move does not survive the re-projection — C109 §2 makes the pod record the authority, and the honest fix is a `bathroomPod.update` verb, not a merge here.' },


    // ── Not model state — persisting these would be the defect ────────────────
    { storeKey: 'cube', status: 'not-model-state', snapshotKey: null,
      reason: 'plugins/toy-cube — the dev demo family. performUndoRedo.ts already names it "REACHABLE AND STRANDED, dev demo". It is not registered in ALL_PLUGINS, so no user can author one; persisting it would put a developer toy in an architect\'s file.' },
]);

/** Every store key this table declares. Set, not array — the gate compares sets. */
export const DECLARED_FAMILY_KEYS: ReadonlySet<string> =
    new Set(SNAPSHOT_FAMILY_COVERAGE.map((r) => r.storeKey));

/**
 * The families whose records are DESTROYED on reload today, by name.
 *
 * Consumed by the save-time warning in `ProjectSerializer.serialize()` so the loss
 * is LOUD at the moment it happens (C84 EI-6 — "persistence not optional, absence
 * loud"), rather than discovered by a founder on the next open. This is what keeps
 * the table load-bearing instead of decorative.
 */
export const UNPERSISTED_FAMILY_KEYS: readonly string[] = Object.freeze(
    SNAPSHOT_FAMILY_COVERAGE.filter((r) => r.status === 'UNPERSISTED').map((r) => r.storeKey),
);
