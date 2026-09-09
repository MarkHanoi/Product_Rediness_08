/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Side System (NEW FILE) — read-only store observer
 * Phase:             Platform Phase — P4A Persistence
 * Files Modified:    ProjectSerializer.ts (new)
 * Classification:    A
 *
 * Impact Assessment:
 *   Store Reads:      Yes — reads all stores via getAll()
 *   Store Writes:     NO — pure read-only side system
 *   Event Bus:        NO — does not publish any events
 *   Builder Calls:    NO — does not call any builders
 *   Command Dispatch: NO — passive observer only
 *
 * Risk Level:   Low (read-only, no side effects)
 * Rationale:
 *   Converts live store state to a plain-JSON ProjectSnapshot that can be
 *   persisted to Supabase (or localStorage as fallback). All THREE.js class
 *   instances are stripped to plain { x, y, z } / { x, y, z, order } objects
 *   so the snapshot survives JSON.stringify/JSON.parse round-trips.
 */

import { vgGovernanceStore } from '@pryzm/core-app-model';
import { serializeHandrailRecord } from '@pryzm/core-app-model/stores';
import { semanticIndex } from '@pryzm/core-app-model';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { visibilityRuleEngine } from '@pryzm/core-app-model';
import { visibilityIntentStore } from '@pryzm/core-app-model/presentation';
import { viewIntentInstanceStore } from '@pryzm/core-app-model/presentation';
import { hierarchyStore } from '@pryzm/core-app-model';
import { templateStore } from '@pryzm/core-app-model';
import { templateAssignmentStore } from '@pryzm/core-app-model';
import { elementCodeStore } from '@pryzm/core-app-model';
// §RATES157 (L-12503) — the 5D rate book's ONE key-format helper. See its own
// header in CostModel.ts: rates live in a per-project localStorage cache that
// this snapshot now carries through save/load, and the key MUST be derived the
// same way here as in MedicionesBucket.ts's rateKey() — this import is that
// guarantee instead of a second copy of the prefix string.
import { rateBookStorageKey, type RateEntry } from '@pryzm/core-app-model';
import { deriveSnapshotRates } from './rateBookSnapshotSync';
// §MANUALENV159 (L-12640, C47 additive-optional — the SAME pattern §RATES157 used above). A
// pure, dependency-free (no DOM/store/fetch) leaf module, so importing it here is cheap — unlike
// `siteDispatch.ts` (512 KB), which is why THAT module is reached only via `@app/ui/site/siteDispatch`
// in `ProjectLoader.ts`, never imported by this file.
import { serializeUserSuppliedStudyHeights } from '@app/ui/site/userSuppliedStudyHeightState';
import { roomBoundingLineStore } from '@pryzm/core-app-model/stores';
import { WallStore } from '@pryzm/geometry-wall';
import { SlabStore } from '@pryzm/geometry-slab';
import type { SlabData } from '@pryzm/geometry-slab';
import { ColumnStore } from '@pryzm/geometry-column';
import { GridStore } from '@pryzm/core-app-model';
import { StairStore } from '@pryzm/geometry-stair';
import { BeamStore } from '@pryzm/core-app-model/stores';
import { CurtainWallStore } from '@pryzm/geometry-curtain-wall';
// §L-1057 / C87 §13.1 CW-P — the sparse panel-override layer. A MODULE, not a
// closure here: a mapping that lives inside a persistence function is unreachable
// from any suite, which is how six constant-false reads survived in the
// curtain-wall create bridge (L-972).
import {
    collectCurtainPanelOverrides,
    resolveCurtainGrid,
    type CurtainPanelOverride,
} from '@pryzm/geometry-curtain-wall';
import { RoofStore } from '@pryzm/geometry-roof';
import { PlumbingStore } from '@pryzm/geometry-plumbing';
import { FurnitureStore } from '@pryzm/geometry-furniture';
import { HandrailStore } from '@pryzm/core-app-model/stores';
import { OpeningStore } from '@pryzm/core-app-model/stores';
import { doorStore, doorSystemTypeStore } from '@pryzm/geometry-door';
import { windowStore, windowSystemTypeStore } from '@pryzm/geometry-window';
import { BimManager } from '@pryzm/core-app-model';
import { MigrationEngine } from './MigrationEngine';
import { semanticGraphManager, SemanticGraph } from '@pryzm/core-app-model';
import { temporalGraphManager } from '@pryzm/core-app-model';
import { decisionRecordStore } from '@pryzm/core-app-model';
// S70 D8 — Phase-L lifecycle / maintenance imports removed alongside the
// deletion of `src/lifecycle/` per SPEC-27 §4.3 + ADR-030 Part D + ADR-0052 §B.7.
// The `lifecycle?: { … }` field on the snapshot type below is preserved as
// a forward-compat tombstone (legacy v5 archives still parse; no fields
// are written by S70 D8+ serialisers).
import { SlabSystemTypeStore } from '@pryzm/geometry-slab';
import { WallSystemTypeStore } from '@pryzm/geometry-wall';
// §TYPE-SNAPSHOT-CODEC — shared with ProjectLoader; see wallSystemTypeCodec.ts.
import { encodeWallSystemType } from './wallSystemTypeCodec';
// §TYPE-SNAPSHOT-CODEC (C65) — door/window types share their own codec with the loader.
import { encodeHostedSystemType } from './hostedSystemTypeCodec';
// A.R.3 (Revit round-trip · S55) — type-only ref to the L3 IfcMetaStore so the
// snapshot can carry imported IFC/Revit element metadata (GlobalId + psets, the
// round-trip join keys). The snapshot shape is the store's own serialize() output.
import type { IfcMetaStore } from '@pryzm/stores';
type IfcMetaSnapshot = ReturnType<IfcMetaStore['serialize']>;
// §FIX-GIS-SITE-STATE-NOT-PERSISTED (L-188) — type-only refs to the L3 SiteModelStore
// (a per-runtime instance, like IfcMetaStore) and the L0 SiteModel schema. The GIS/site
// state (location lat/lon, parcel boundary, C19 geospatial origin, footprint, context
// buildings) lives ONLY in this store — it was never in the snapshot, so it was lost on
// every save/reload (the site silently defaulted to Madrid). The SiteModel is pure Zod
// data (no THREE / DOM), so it round-trips through JSON directly.
import type { SiteModelStore } from '@pryzm/stores';
import { trace } from '@opentelemetry/api';
import type { SiteModel } from '@pryzm/schemas';
import { CeilingStore } from '@pryzm/core-app-model/stores';
import { CeilingSystemTypeStore } from '@pryzm/core-app-model/stores';
// §FEAT-HANDRAIL-TYPE-PERSISTENCE (C95 §15.7, R3) — the railing CATALOGUE,
// as a module SINGLETON (see the twin in packages/persistence-client for why).
import { handrailTypeStore } from '@pryzm/core-app-model/stores';
import { requirementStore } from '@pryzm/core-app-model';
import { assetCatalogStore } from '@pryzm/core-app-model';
import { dxfOverlayStore } from '@pryzm/file-format';
// ADR-0346 (L-2900) — the host's linked-model REFERENCE table. Never elements.
import { linkedModelStore } from '../links/LinkedModelStore';
import { sheetStore } from '@pryzm/core-app-model';
// L-10690 LEG 1 of 3 — a store can be perfectly correct and still never save.
import { titleBlockStore } from '@pryzm/core-app-model';
import { scheduleStore } from '@pryzm/core-app-model';
import { userMaterialStore } from '@pryzm/core-app-model'; // #105 Materials Repository
import { annotationStore } from '@pryzm/plugin-annotations';
// §ANN-TYPE-PERSIST — custom annotation system types (the Revit Type/Instance split).
import { annotationSystemTypeStore } from '@pryzm/plugin-annotations';
// ANNOTATION-SYSTEM-AUDIT-2026 A4 / B8 / B9 — additional annotation slices
import { constraintStore } from '@pryzm/plugin-annotations';
import { annotationVisibilityStore } from '@pryzm/plugin-annotations';
import { obcAnnotationAdapter } from '@pryzm/plugin-annotations';
// L-334 / L-360 — content-integrity checksum stamped into the snapshot at SAVE
// and verified at LOAD (client-side; a server-side column is a tracked
// follow-up). See packages/persistence-client/src/loader/SnapshotIntegrity.ts.
import {
    computeSnapshotChecksumWithReport,
    INTEGRITY_ALGO,
    type SnapshotIntegrityMeta,
} from '@pryzm/persistence-client';
// §PERSIST103 (L-11520) — the DECLARED answer to "does this family survive a reload?",
// one row per plugin DTO store. Imported here so the loss is announced by the code that
// causes it (C84 EI-6), and read by `tools/ga-gate/check-snapshot-family-coverage.ts`
// so a NEW family cannot be added without somebody stating the answer in writing.
// Pure data, zero imports — importing it costs nothing and drags in no module graph.
import { UNPERSISTED_FAMILY_KEYS } from './snapshotFamilyCoverage';
// §82.7-DEFINITIONS-TRAVEL-WITH-PROJECT — the component DEFINITION set's save leg.
import { serializeComponentDefinitions } from './restoreComponentDefinitions';

export const SNAPSHOT_SCHEMA_VERSION = 5;

// ── Serialized plain-object types ───────────────────────────────────────────

export interface Vec3 { x: number; y: number; z: number; }
export interface Vec2 { x: number; y: number; }
export interface Euler { x: number; y: number; z: number; order: string; }
export type Baseline = [Vec3, Vec3];

export interface ProjectSnapshot {
    schemaVersion: number;
    timestamp: number;
    projectName: string;
    projectId?: string;
    versionLabel?: string;
    /**
     * L-334 / L-360 — content-integrity block stamped at SAVE and verified at
     * LOAD. Absent on legacy/pre-L-334 snapshots (treated as "no checksum", NOT
     * corruption). Excluded (with `versionLabel`) from its own checksum, and an
     * additive optional field — old builds ignore it, so no file-format bump.
     */
    integrity?: SnapshotIntegrityMeta;
    levels: any[];
    grids: any[];
    walls: any[];
    windows: any[];
    doors: any[];
    slabs: any[];
    columns: any[];
    stairs: any[];
    beams: any[];
    curtainWalls: any[];
    roofs: any[];
    furniture: any[];
    handrails: any[];
    plumbing: any[];
    openings: any[];
    /** §PERSIST-LIGHTING — lighting fixtures (were never serialized → lost on reload). */
    lighting?: any[];
    /**
     * §FIX-POOL-AND-BOUNDARY-LINE-INVISIBLE (L-9948) · C106 — construction /
     * setting-out BOUNDARY LINES.
     *
     * ⛔ THE THIRD OF THIS FAMILY'S THREE BREAKS, AND THE LAST TO CLOSE. Measured
     * 2026-08-23: `grep -c "boundaryLine" ProjectSerializer.ts` → **0**, in BOTH
     * copies. `boundaryLine.create` validated, executed, mutated its store, returned
     * a `PatchPair` and reported success — and the record died on save. The other two
     * breaks (no bridge case; `boundaryLineSolid()` with zero production callers)
     * closed in L-9940/L-9944; this key is what makes the line survive a reload.
     *
     * ⭐ READ FROM THE ONE AUTHORITY. This family has exactly one store
     * (`plugins/boundary-line/src/store.ts` opens by saying so — C84 EI-1 holding by
     * construction rather than by discipline), so unlike every other slice here there
     * is no legacy geometry twin to choose between and no chance of serialising the
     * stale one.
     *
     * ADDITIVE AND OPTIONAL, so no `SNAPSHOT_SCHEMA_VERSION` bump — the disposition
     * `lighting?` and `curtainPanels?` carry, for the identical stated reason: an old
     * snapshot simply lacks the key, and "no boundary lines" IS the pre-fix state, so
     * the migration is correct by construction. A bump with an empty migration step
     * would be a lie about compatibility.
     *
     * ⛔ IT IS DIGEST-COVERED LIKE EVERY OTHER MODEL MEMBER. C05 §3.7 req 4 forbids
     * adding a model member to `CHECKSUM_EXCLUDED_TOP_KEYS`, which stays at its two
     * members. Excluding a field to make a checksum settle is the shape that produced
     * three prior false-"corrupt" incidents.
     */
    boundaryLines?: any[];
    /**
     * §PERSIST103 (L-11520) · C104 · ADR-0124 · C103 — THE FIVE COMPOUND SLICES THAT
     * HAD NO KEY AT ALL, and the founder's report verbatim: *"11 elements did not
     * survive project opening — the lift for example, I can see it is not there."*
     *
     * ⛔ THE FOURTH RECURRENCE OF ONE DEFECT IN THIS ONE FILE. `lighting` (2026-05-22)
     * and `boundaryLines` (L-9948, 2026-08-23) are the first two, and both wrote the
     * lesson down HERE — in this interface — while the class stayed open. Measured
     * 2026-08-26: `grep -c "liftStore\|liftCompound\|LiftCompound" ProjectSerializer.ts`
     * → **0**. So `lift.create` validated, minted nineteen records across six stores,
     * rendered, reported success — and the compound died on save.
     *
     * ⭐ WHAT WAS ACTUALLY LOST IS NARROWER THAN "THE LIFT", AND THE DIFFERENCE IS THE
     * WHOLE DESIGN. A compound's members are first-class records in the families that
     * own them (C104 §2.2 / C103 §2.4 / ADR-0124 §4 all open by saying so), and
     * `CommandEventBridge` mirrors every one of them into the LEGACY store this
     * serializer reads. So the shaft walls, the glass, the landing doors and the
     * voided slabs ALREADY round-tripped. What did not:
     *
     *   · the PARENT record — `childrenIds`, `hostWallId`/`hostSlabId`, the profile,
     *     the mark. Without it the members survive as anonymous walls and slabs and
     *     the element stops being a lift, a pool or a balcony at all: not selectable
     *     as one, not schedulable as one, not deletable as one.
     *   · `liftPart` and `water`, which have NO family to fall back on (each mints
     *     exactly one new family, and that is stated as deliberate in both stores).
     *     Those were destroyed outright — the cabin vanished while the shaft
     *     remained, and a reloaded pool was a dry hole.
     *
     * ADDITIVE AND OPTIONAL, so no `SNAPSHOT_SCHEMA_VERSION` bump — the disposition
     * `lighting?`, `boundaryLines?` and `curtainPanels?` all carry, for the identical
     * stated reason: an old snapshot simply LACKS the key, "no lifts were authored" IS
     * the pre-fix state, and the migration is therefore correct by construction. A
     * bump with an empty migration step would be a lie about compatibility.
     *
     * ⛔ EACH IS OMITTED ENTIRELY WHEN NOTHING WAS AUTHORED, so a project with no
     * compounds produces a snapshot byte-identical to a pre-fix one — the rule this
     * file states twice already, honoured a third time.
     *
     * ⛔ THEY ARE DIGEST-COVERED LIKE EVERY OTHER MODEL MEMBER. C05 §3.7 req 4 forbids
     * adding a model member to `CHECKSUM_EXCLUDED_TOP_KEYS`, which stays at its two.
     */
    lifts?: any[];
    /** §PERSIST103 · C104 §2.2 — the five LOD-300 cabin parts. No legacy twin exists. */
    liftParts?: any[];
    /** §PERSIST103 · ADR-0124 — the pool compound parent (walls + floor slab are their own families). */
    pools?: any[];
    /** §PERSIST103 · ADR-0124 §4 — the water body. No legacy twin exists. */
    waters?: any[];
    /** §PERSIST103 · C103 — the balcony compound parent (slab + finish + railings are their own families). */
    balconies?: any[];
    /**
     * §COMPONENT-PLACE (audit §12 Phase 4C) · **ADR-0376 D9** — ⭐⭐ PLACED COMPONENT
     * OCCURRENCES: the join between a `.pryzm-family` definition and a project.
     *
     * ⭐ THIS FAMILY HAS NO LEGACY TWIN AND NO MEMBER FAMILIES, so unlike the lift or
     * the balcony there is no half of it that would survive without this key. A
     * balcony that lost its parent record still left a slab, a floor finish and
     * railings behind — which is precisely why that loss went unnoticed for four days
     * (L-11530). A placed component that loses this key leaves NOTHING: the
     * occurrence, its type, its instance overrides and its position all vanish
     * together, and the project simply has fewer elements than the architect drew.
     *
     * ⚠ Additive-optional and omitted entirely when nothing was authored (C47), so a
     * project with no placed components produces a snapshot byte-identical to a
     * pre-Phase-4C one — no `SNAPSHOT_SCHEMA_VERSION` bump, no migration step.
     */
    components?: any[];
    /**
     * §82.7-DEFINITIONS-TRAVEL-WITH-PROJECT · STR-UCE-MASTER-SPEC §82.7 · C111 §4.3-a/b —
     * ⭐ THE COMPONENT DEFINITIONS THE OCCURRENCES ABOVE RESOLVE AGAINST. Each row is
     * the `.pryzm-family` ENVELOPE's exact bytes (base64, opaque — never a parsed
     * document, so the snapshot holds no second definition schema) keyed by
     * `(definitionId, schemaHash)`. Without this key a project that reopens has its
     * `components` and no definition to bake them from: the audit's rank-2 gap, "an
     * authored component dies on F5". See `restoreComponentDefinitions.ts`.
     *
     * ⚠ Additive-optional and omitted when the catalogue is empty (C47).
     */
    componentDefinitions?: any[];
    /**
     * §PERSIST-BATHROOM-POD (L-11527 / L-11405) · C109 §8 — the LOD-300 BATHROOM POD
     * compound parent.
     *
     * ⭐ THE MEMBERS ALREADY ROUND-TRIPPED AND THE PARENT DID NOT, WHICH IS WHY THE
     * LOSS WAS INVISIBLE. A pod's WC, basin, shower and accessories are projected into
     * the LEGACY fixture store by `bathroomPodMemberMirror` and are saved under
     * `plumbing`, so a reloaded project still showed sanitaryware — it simply was no
     * longer a POD. `members[]`, the drill-in, the ownership `parentId` on every member
     * and the delete-reap were all gone, and the fixtures came back as ordinary
     * hand-placed ones. That is L-11405, and it is the same shape as the lift / pool /
     * balcony losses §PERSIST103 closed.
     *
     * ⚠ THE POD RECORD IS THE AUTHORITY FOR ITS MEMBERS' PLACEMENT (C109 §2 — they are
     * a PROJECTION re-derived on every store diff, never independent state). So
     * restoring the parent also restores the two things the `plumbing` slice cannot
     * carry: `parentId`, which `serializePlumbing` does not emit, and the per-family
     * variant slug (`showerVariant` / `accessoryVariant`), which neither
     * `serializePlumbing` nor `CreatePlumbingFixtureCommand`'s payload carries — a
     * walk-in shower reloaded as the default one, silently, before this key existed.
     *
     * ADDITIVE AND OPTIONAL, omitted entirely when no pod was authored, so no
     * `SNAPSHOT_SCHEMA_VERSION` bump and no migration step (C47) — the identical
     * disposition `lifts` / `balconies` / `boundaryLines` carry, for the identical
     * reason: an old snapshot simply LACKS the key, and "no pods were authored" IS its
     * correct reading.
     */
    bathroomPods?: any[];
    /**
     * §FEAT-SPACE-ENVELOPE (L-12900) · **C114 §9** · ADR-0380 — the AUTHORED spatial
     * volume an architect places BEFORE any wall exists.
     *
     * ⛔ THE LOSS THIS KEY PREVENTS IS TOTAL, NOT PARTIAL, and that is the whole
     * argument for landing it in the same lane as the family rather than after a
     * founder reports it. A balcony that lost its parent still left a slab, a finish
     * and railings on screen — which is precisely why nobody noticed for four days
     * (L-11530). A space envelope has NO legacy twin, NO member families and NO
     * mirror into any other store (C114 §2a declines a plugin DTO twin and a
     * `roomStore` mirror outright, by construction). If this key is absent, the
     * footprint, the height, the role, the `withinId` membership and the cited basis
     * vanish TOGETHER and the massing study is simply gone — the `component` /
     * `liftPart` / `water` shape, where the record is the only copy there is.
     *
     * ⚠ AND THE LOSS WOULD HAVE BEEN INVISIBLE TO THE SAVE-TIME WARNING TOO. The C84
     * EI-6 loop below reports only families this project DECLARES `UNPERSISTED` in
     * `snapshotFamilyCoverage.ts`; a family with no row at all is in neither list.
     * `check-snapshot-family-coverage.ts` ARM A read RED for exactly that reason on
     * the commit that introduced the store — the tripwire firing as designed.
     *
     * ADDITIVE AND OPTIONAL, omitted entirely when no envelope was authored, so no
     * `SNAPSHOT_SCHEMA_VERSION` bump and no migration step (C47) — the identical
     * disposition `lifts` / `balconies` / `components` carry, for the identical
     * reason: an old snapshot simply LACKS the key, and "no envelopes were authored"
     * IS its correct reading.
     */
    spaceEnvelopes?: any[];
    /**
     * C116 9 - AUTHORED paved surfaces (roads, parking, pedestrian areas).
     * Omit-when-absent per C47, and no SNAPSHOT_SCHEMA_VERSION bump: an old
     * snapshot simply LACKS the key, and "no siteworks were authored" IS its
     * correct reading.
     */
    siteworks?: any[];
    /**
     * §L-1057 / C87 §13.1 CW-P — SPARSE curtain-panel overrides: only the panels a
     * user AUTHORED away from what the grid regenerates. A 20×10 façade with three
     * doors writes 3 entries, not 200; an untouched façade writes none.
     *
     * ADDITIVE AND OPTIONAL, so no `SNAPSHOT_SCHEMA_VERSION` bump — the same
     * disposition `lighting?` and `integrity?` carry, and for the same stated reason:
     * an old snapshot simply lacks the key and falls back to regenerate-from-grid,
     * which IS the pre-fix behaviour and is therefore a correct migration by
     * construction. A bump with an empty migration step would be a lie about
     * compatibility. It becomes REQUIRED the moment this field stops being optional
     * or a reader must reject a file lacking it — neither is true today.
     */
    curtainPanels?: import('@pryzm/geometry-curtain-wall').CurtainPanelOverride[];
    elementCount: number;
    /** Room Bounding Lines — virtual partition elements (§ROOM-BOUNDING). Optional for backward compat. */
    roomBoundingLines?: any[];
    /** Phase 3 — VG Governance persistence. Optional for backward compat. */
    vgGovernance?: {
        version: 1;
        templates: any[];
        models:    any[];
        views?:    any[];
    };
    /** Phase A — Semantic tag index. Optional for backward compat with older snapshots. */
    semanticTags?: {
        version: 1;
        tags: Array<{ elementId: string; tags: string[] }>;
    };
    /** Phase B — ViewDefinition store snapshot. Optional for backward compat. */
    viewDefinitions?: {
        version: 1;
        views: any[];
    };
    /** Phase C — VisibilityRule engine snapshot. Optional for backward compat. */
    visibilityRules?: {
        version: 1;
        rules: any[];
    };
    visibilityIntents?: {
        version: 1;
        intents: any[];
    };
    viewIntentInstances?: {
        version: 1;
        instances: any[];
    };
    /** Room subsystem — serialised RoomData array. Optional for backward compat. */
    rooms?: any[];
    /** Ceiling subsystem — serialised CeilingData array. Optional for backward compat. */
    ceilings?: any[];
    /** Custom CeilingSystemType definitions. Optional for backward compat. */
    ceilingSystemTypes?: any[];
    /**
     * §M-H4 (DAILY-USE-AUDIT 2026-05-20) — Custom door/window finish types
     * (frame profile, glazing assembly, hardware spec). Built-in presets are
     * re-seeded from code each boot; only the custom types need persisting.
     * Optional for backward compat with snapshots predating this addition.
     */
    doorSystemTypes?: any[];
    windowSystemTypes?: any[];
    /** Floor finish subsystem — serialised FloorData array. Optional for backward compat. */
    floors?: any[];
    /** Custom FloorSystemType definitions. Optional for backward compat. */
    floorSystemTypes?: any[];
    /**
     * FIX-12 §07 §3: Custom SlabSystemType definitions.
     * Only CUSTOM types are persisted (built-in presets are always reconstructed
     * from code). Optional for backward compat with older snapshots.
     */
    slabSystemTypes?: any[];
    /**
     * FIX-3 (M9): Custom WallSystemType definitions.
     * Only user-created types are persisted; built-in presets are always
     * reconstructed from code. Optional for backward compat.
     */
    wallSystemTypes?: any[];
    /**
     * §FEAT-HANDRAIL-TYPE-PERSISTENCE (C95 §15.7, R3) — custom HandrailType
     * definitions (the RAILING CATALOGUE), not handrail records.
     *
     * ⛔ `handrailTypeStore` had a DESTRUCTOR AND NO CONSTRUCTOR: registered on
     * `projectScopeRegistry` with `clear: clearCustomTypes()`, so a project
     * switch DELETED every user-authored railing type while no save path had
     * ever written one (C95 §15.7, measured 2026-08-19).
     *
     * Only CUSTOM types are persisted; the 20 built-ins come from code.
     */
    handrailTypes?: any[];

    /**
     * Data Platform — Phase 4 (schema v2).
     * Hierarchy nodes (Site / Building / Level / Unit).
     * Optional for backward compat with v1 snapshots (migration adds empty block).
     */
    hierarchy?: {
        version: 1;
        nodes: import('@pryzm/core-app-model').AnyHierarchyEntity[];
    };

    /**
     * Data Platform — Phase 4 (schema v2).
     * Template definitions and their node assignments.
     * Optional for backward compat with v1 snapshots.
     */
    templates?: {
        version: 1;
        templates: import('@pryzm/core-app-model').TemplateDefinition[];
        assignments: import('@pryzm/core-app-model').TemplateAssignment[];
    };

    /**
     * Data Platform — Phase 4 (schema v2).
     * Element code registry (e.g. DO001, WA042).
     * Optional for backward compat with v1 snapshots.
     */
    elementCodes?: {
        version: 1;
        codes: import('@pryzm/core-app-model').ElementCode[];
        counters: Record<string, number>;
    };

    /**
     * §RATES157 (L-12503, C47 additive-optional).
     * The 5D rate book — user-typed/imported per-line prices (BEDEC, SPON'S,
     * RSMeans, a bespoke quotation — never a PRYZM-shipped default). Optional
     * for backward compat: a snapshot saved before this lane has no `rates` key
     * and MUST load cleanly with an empty book, never throw and never wipe the
     * per-browser localStorage cache that may still hold the real data (see
     * `ProjectLoader`'s §RATES157 recovery block).
     */
    rates?: {
        version: 1;
        currency: string;
        entries: RateEntry[];
    };

    /**
     * §MANUALENV159 (L-12640, C47 additive-optional).
     * The user-supplied "study height" decision (e.g. *"assume 24.5 m on this parcel"*) for a
     * site where no normative buildable envelope resolves — see `ManualAdminZonePanel.ts`'s
     * sibling entry point and `userSuppliedStudyHeightState.ts` for the full context. A PROJECT
     * decision (survives reload/collaboration), not a browser preference — mirrors `rates` above
     * exactly, keyed by site id rather than a single project-wide value because
     * `contextDerivedStudyEnvelopeState.ts` (the display slot this rehydrates into) is ALSO keyed
     * that way. Optional for backward compat: a snapshot saved before this lane, or a project
     * that never used this feature, has no `manualStudyHeight` key and MUST load cleanly with
     * nothing rehydrated.
     */
    manualStudyHeight?: {
        version: 1;
        bySiteId: Record<string, {
            readonly heightM: number;
            readonly setbackM: number;
            readonly savedAtIso: string;
        }>;
    };

    /**
     * Phase D — D-1 (schema v3).
     * Semantic graph: all typed relationships between BIM elements.
     * Optional for backward compat with v1/v2 snapshots (graph starts empty on load).
     */
    semanticGraph?: SemanticGraph;

    /**
     * Phase G — G-1 (schema v4).
     * Temporal graph: append-only record of all relationship mutations and
     * element-level create/update/delete events with timestamps and session IDs.
     * Powers the DesignHistoryPanel time-travel scrubber (G-2).
     * Optional for backward compat with v1–v3 snapshots (starts empty on load).
     */
    temporalGraph?: import('@pryzm/core-app-model').SerializedTemporalGraph;

    /**
     * Phase G — G-3 (schema v4).
     * Decision records: architect rationale entries linked to non-standard decisions.
     * Populated by the IntentPrompt when the architect deviates from a template
     * requirement or overrides a ConstraintEngine violation.
     * Optional for backward compat with v1–v3 snapshots (starts empty on load).
     */
    decisionRecords?: import('@pryzm/core-app-model').SerializedDecisionRecords;

    /**
     * PV-05 (C70 I-INV-2) — the C23 AI-lineage substrate: artefacts, lineage
     * edges, context snapshots and redaction records.
     *
     * §PV-05-APP-COPY (2026-08-17). The slice was added to
     * `packages/persistence-client/src/loader/ProjectSerializer.ts` at 8cab70c1
     * and PV-05 was marked closed. It was not closed: PRODUCTION imports THIS
     * copy — `apps/editor/src/engine/initPersistence.ts:41` — and calls its
     * `serialize()` at :100. The persistence-client copy is not on the save
     * path, so the key was written by a serializer the app never invokes and
     * the C23 audit log was still destroyed on every reload. Measured before
     * this change by `apps/editor/__tests__/provenanceSliceProductionPath.test.ts`,
     * which drove THIS serializer and found no `provenance` key at all.
     *
     * Optional and ADDITIVE: every snapshot written before today omits it, and
     * omission is NOT an empty audit log. `ProvenanceStore.hydrate(undefined)`
     * returns `absent: 'predates-provenance-persistence'` — UNKNOWN with a
     * reason (C75 §1.4) — and the loader NAMES the loss rather than silently
     * starting a fresh lineage.
     *
     * Written only when a `provenanceStore` is supplied in ProjectStores; a
     * bootstrap that wires none omits the key entirely, so an unwired session
     * can never write a MISLEADING empty slice over a project that has one.
     *
     * Kept in lock-step with the persistence-client copy (C71 §250 names the
     * duplication). If you edit one, edit both.
     */
    provenance?: import('@pryzm/stores').SerializedProvenance;

    /**
     * Phase L — L-1 + L-2 (schema v5).  TOMBSTONE — the in-engine lifecycle /
     * maintenance stores were deleted at S70 D8 alongside `src/lifecycle/`
     * per SPEC-27 §4.3 + ADR-030 Part D + ADR-0052 §B.7.  The field is kept
     * as `unknown` so v5 archives still type-check on parse; no writer
     * populates it from S70 D8+.  Re-instated by `plugins/lifecycle/`.
     */
    lifecycle?: unknown;

    /**
     * Autonomous Auditor — Phase 0 (schema v5+).
     * Space-programme brief: all RoomRequirement records from RequirementStore.
     * Optional for backward compat with all prior snapshots (starts empty on load).
     */
    requirements?: {
        version: 1;
        records: import('@pryzm/core-app-model').RoomRequirement[];
    };

    /**
     * Autonomous Auditor — Phase 3 (schema v5+).
     * Equipment archetype catalog: all AssetCatalogEntry records.
     * Optional for backward compat — catalog is re-seeded from defaults on load
     * when this field is absent.
     */
    assetCatalog?: {
        version: 1;
        entries: import('@pryzm/core-app-model').AssetCatalogEntry[];
    };
    /** §31 Phase 2 — DXF/DWG underlay overlays. Optional for backward compat. */
    dxfOverlays?: {
        version: 1;
        overlays: Array<{
            overlayId: string;
            fileName: string;
            sourceText: string;
            metersPerUnit: number;
            elevation: number;
            positionOffset: { x: number; z: number };
            opacity: number;
            locked: boolean;
            layers: Array<{ name: string; visible: boolean; color: string; linewidth: number }>;
        }>;
    };
    /**
     * ADR-0346 / C13 §3.13 (L-2900) — LINKED MODELS: references to OTHER projects
     * whose buildings are drawn read-only in this one, anchored on the shared parcel.
     *
     * ⚠ READ THIS BEFORE ADDING ANYTHING ELSE TO IT. These are REFERENCES, not
     * elements. The linked project's walls, slabs and rooms are NOT here and must
     * never be: they enter no element store, so `serialize()` above never sees them
     * and needs no exclusion filter. That absence of a filter is the DESIGN
     * WORKING, not an oversight — if a future change ever puts linked elements in
     * a store, this comment is the record that it broke ADR-0346 D1 and C13 §3.13.
     *
     * Shaped exactly like `dxfOverlays` (version + array of plain records), which is
     * the proven slot for "N serialisable records beside the elements".
     * Optional for backward compat — C47 §1.2 additive-optional, so a project with
     * no links is byte-identical to a pre-ADR-0346 snapshot.
     */
    linkedModels?: import('@pryzm/schemas').LinkedModelSnapshot;
    /**
     * Phase III — Sheet store snapshot.
     * All SheetDefinition records (viewports, sheet names, sizes).
     * Optional for backward compat with pre-Phase-III snapshots.
     */
    sheets?: {
        version: 1;
        sheets: any[];
    };
    /**
     * Phase III — Schedule store snapshot.
     * All ScheduleDefinition records.
     * Optional for backward compat with pre-Phase-III snapshots.
     */
    schedules?: {
        version: 1;
        schedules: any[];
    };
    /**
     * §TITLE-BLOCK-EDIT-FORKS (L-10690) — USER-AUTHORED title-block templates.
     *
     * Only the user's own templates. The ten built-ins are code and are reseeded
     * by the store, so baking copies of them into every snapshot would freeze
     * today's geometry into files that then never pick up a correction.
     *
     * Optional for backward compat: a snapshot written before ask #4 has no
     * templates, which is correctly "none", not "lost".
     */
    titleBlocks?: {
        version: 1;
        templates: any[];
    };
    /**
     * #105 Materials Repository — user-created/uploaded material store snapshot.
     * Optional for backward compat with snapshots created before the repository.
     */
    userMaterials?: {
        version: 1;
        materials: any[];
    };
    /**
     * §ANN-A2 — Annotation store snapshot.
     * All AnnotationElement and DimensionElement records, keyed by ownerViewId.
     * Optional for backward compat with pre-annotation snapshots.
     */
    annotations?: {
        version: 1;
        annotations: any[];
        dimensions: any[];
    };
    /**
     * ANNOTATION-SYSTEM-AUDIT-2026 A4 — ConstraintRecord persistence.
     * Locked-dimension constraint records derived from annotations.
     * Optional for backward compat with pre-A4 snapshots.
     */
    /**
     * §ANN-TYPE-PERSIST — user-created annotation system types. Built-ins are code and
     * are never serialised. Optional for backward compat with pre-§ANN-TYPE snapshots.
     */
    annotationSystemTypes?: { version: 1; types: any[] };
    /**
     * ANNOTATION-SYSTEM-AUDIT-2026 A4 — ConstraintRecord persistence.
     * Locked-dimension constraint records derived from annotations.
     */
    annotationConstraints?: {
        version: 1;
        records: any[];
    };
    /**
     * ANNOTATION-SYSTEM-AUDIT-2026 B8 — AnnotationVisibility persistence.
     * Per-view annotation hide list. Optional for backward compat.
     */
    annotationVisibility?: any;
    /**
     * ANNOTATION-SYSTEM-AUDIT-2026 B9 — OBC adapter UUID → annotationId map
     * Persists the bidirectional Pickability bridge so post-load picks
     * resolve to the same AnnotationElement IDs.
     */
    obcAnnotationMap?: {
        version: 1;
        entries: Array<[string, string]>;
    };
    /**
     * §IFC-STORE-1 — IFC import registry.
     * Stores metadata for all imported IFC models so they can be re-fetched
     * from Supabase Storage on session restore. Binary fragment data is stored
     * separately in the `ifc-uploads` storage bucket.
     * Optional for backward compat.
     */
    ifcImports?: {
        version: 1;
        models: Array<{
            modelId: string;
            fileName: string;
            storagePath: string;
            uploadedAt: number;
            elementCount: number;
        }>;
    };
    /**
     * A.R.3 (Revit round-trip · S55) — per-element IFC/Revit metadata from the
     * IfcMetaStore: each imported element's GlobalId, IFC type, psets + quantities,
     * keyed by pryzmElementId. These are the round-trip join keys — without persisting
     * them, an imported IFC/Revit model would lose its GlobalIds/psets on save/reload
     * and re-export would mint fresh GlobalIds (breaking the Revit round-trip across
     * sessions). Shape is the store's own `serialize()` output (Zod-validated on
     * hydrate). Optional + omitted when the store is empty (backward compat).
     */
    ifcElementMeta?: IfcMetaSnapshot;

    /**
     * §FIX-GIS-SITE-STATE-NOT-PERSISTED (L-188) — the full C19 SiteModel for this
     * project: location (lat/lon/elev/true-north/CRS/address), parcel boundary +
     * setbacks + zoning, building footprint, and reference context buildings. This
     * is the geospatial substrate the LTP-ENU origin, RealSunService and Cesium
     * globe are all anchored to. Prior to L-188 it lived ONLY in the per-runtime
     * `SiteModelStore` (never serialized), so reopening a GIS project lost the real
     * site and silently defaulted to Madrid. The SiteModel is pure Zod data, so it
     * round-trips through JSON as-is. `null` / absent = no site authored (backward
     * compat with every pre-L-188 snapshot).
     */
    site?: SiteModel | null;

    /**
     * §L-545-SITE-CAPTURE-PROVENANCE (L-188 / L-489) — WHY `site` has the value it
     * has, recorded at SAVE time.
     *
     * The defect this closes: `site: null` was AMBIGUOUS. It meant BOTH "this is a
     * plain BIM project that never had a georeference" (correct, common) AND "this
     * is a GIS project whose georeference was LOST at save" (the P0 — the building
     * reopens floating over the North Atlantic, nothing renders in 3D Site, and the
     * envelope will not re-derive). Those two need opposite responses, and nothing
     * downstream could tell them apart, so the loader silently treated the second
     * as the first. Same failure shape as the [context-data honesty] family: an
     * error and an empty result were the same value.
     *
     * `status` is therefore explicit:
     *   - `captured`  — a SiteModel was read and is in `site`.
     *   - `none`      — no site, and no geometry either. Nothing was lost.
     *   - `degraded`  — **geometry was saved with NO georeference.** The save was
     *                   ALLOWED (see the block-vs-degrade argument at the capture
     *                   site) but it is recorded as a known-lossy save so the
     *                   reopen path can say so instead of pretending.
     *
     * Absent on every pre-L-545 snapshot; readers must treat `undefined` as "not
     * recorded", never as `none`.
     */
    siteCapture?: {
        readonly status: 'captured' | 'none' | 'degraded';
        /** Human-readable cause, for the reopen path and for support. */
        readonly reason: string;
        /** Element count at save time — what would be orphaned by a lost origin. */
        readonly elementCount: number;
        /** Which store candidate produced the site (diagnostic for instance drift). */
        readonly source: 'threaded' | 'window.runtime' | 'none';
    };
}

// ── THREE.js strippers ──────────────────────────────────────────────────────

function stripVec3(v: any): Vec3 {
    if (!v) return { x: 0, y: 0, z: 0 };
    return { x: Number(v.x ?? 0), y: Number(v.y ?? 0), z: Number(v.z ?? 0) };
}

function stripEuler(e: any): Euler {
    if (!e) return { x: 0, y: 0, z: 0, order: 'XYZ' };
    const x = e._x !== undefined ? e._x : (e.x ?? 0);
    const y = e._y !== undefined ? e._y : (e.y ?? 0);
    const z = e._z !== undefined ? e._z : (e.z ?? 0);
    const order = e._order || e.order || 'XYZ';
    return { x: Number(x), y: Number(y), z: Number(z), order: String(order) };
}

function stripVec2(v: any): Vec2 {
    if (!v) return { x: 0, y: 0 };
    return { x: Number(v.x ?? 0), y: Number(v.y ?? 0) };
}

function stripBaseline(bl: any): Baseline {
    if (!Array.isArray(bl) || bl.length < 2) return [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }];
    return [stripVec3(bl[0]), stripVec3(bl[1])];
}

/** Generic deep-strip: removes THREE.js class methods, leaves plain data. */
function deepStrip(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;

    // THREE.Vector3
    if (obj.isVector3 || (obj.x !== undefined && obj.y !== undefined && obj.z !== undefined && obj.isVector3 !== undefined)) {
        return stripVec3(obj);
    }
    // THREE.Euler
    if (obj.isEuler || (obj._x !== undefined && obj._y !== undefined && obj._order !== undefined)) {
        return stripEuler(obj);
    }
    // THREE.Vector2
    if (obj.isVector2 || (obj.x !== undefined && obj.y !== undefined && obj.z === undefined && typeof obj.cross === 'function')) {
        return stripVec2(obj);
    }

    if (Array.isArray(obj)) return obj.map(deepStrip);

    const out: any = {};
    for (const key of Object.keys(obj)) {
        out[key] = deepStrip(obj[key]);
    }
    return out;
}

// ── Wall serialization ──────────────────────────────────────────────────────

function serializeWall(wall: any): any {
    // §WALL-JOIN-SAVE-FIX: Prefer _sourceBaseLine (the user-drawn, pre-join-resolution
    // position) over baseLine (which may have been trimmed by the join resolver).
    // Using the original endpoints means the join resolver re-runs on untouched input
    // after reload and produces the same geometry, guaranteeing idempotent round-trips.
    const baseLineToSave = wall._sourceBaseLine ?? wall.baseLine;
    return {
        id: wall.id,
        type: wall.type,
        levelId: wall.levelId,
        parentId: wall.parentId,
        baseLine: stripBaseline(baseLineToSave),
        height: wall.height,
        thickness: wall.thickness,
        baseOffset: wall.baseOffset,
        materialId: wall.materialId,
        materialColor: wall.materialColor,
        openings: Array.isArray(wall.openings) ? wall.openings.map((o: any) => ({ ...o })) : [],
        childrenIds: Array.isArray(wall.childrenIds) ? [...wall.childrenIds] : [],
        layers: wall.layers ? wall.layers.map((l: any) => ({ ...l })) : undefined,
        systemTypeId: wall.systemTypeId,
        curve: wall.curve ? { ...wall.curve } : undefined,
        // §WALL-RAKE — the wall's lean. Emitted ONLY when non-vertical, so a wall that
        // has never been raked re-serialises byte-identically to a pre-rake snapshot
        // (C47 §1.2: an additive optional field is forward-compatible, no MAJOR bump).
        rakeAngleDeg: wall.rakeAngleDeg,
        // §WALL-PROFILE — the wall's authored elevation outline. AUTHORED DATA: it cannot
        // be re-derived from anything else on the record, so C84 EI-6 makes persistence a
        // precondition of the affordance existing at all. Emitted only when present, so a
        // wall that has never been profiled re-serialises byte-identically to a
        // pre-profile snapshot (C47 §1.2 — additive optional field, no MAJOR bump).
        //
        // Deep-copied rather than referenced: the ring is nested, and `{...wall}` would
        // hand the snapshot a live reference into the store.
        wallProfile: wall.wallProfile
            ? { ring: (wall.wallProfile.ring ?? []).map((v: any) => ({ u: v.u, v: v.v })) }
            : undefined,
        // §WALL-JOIN-INTENT / §PERSIST-JOININTENT (L-927) — what the AUTHOR DID at each
        // endpoint: 'butt' (snapped onto an already-committed junction) or 'through'
        // (continuing a run). This is the ONLY field on a wall that cannot be recovered
        // if it is dropped. Every other field here is either measurable from the geometry
        // or re-derivable from a catalogue; this one records a HISTORICAL gesture, and
        // L-923 proved no predicate over geometry, type, thickness or createdAt can
        // reconstruct it — the founder's mitred-L-plus-newcomer and a legitimate collinear
        // pass-through are the same three segments differing only in draw order.
        //
        // Omitting it from this whitelist is what made the fix worthless in practice: the
        // stamp was computed correctly at creation and then destroyed by the next save, so
        // the founder's corner came back square on every reload. Emitted only when present,
        // so a wall that never got a stamp re-serialises byte-identically to a pre-L-927
        // snapshot (C47 §1.2: additive optional field, no MAJOR bump).
        // §FIX-SIDEFINISH-PERSISTS (L-999) — the per-side finish. AUTHORED DATA:
        // `sideFinishes` records a choice the user made face by face and nothing on the
        // record can re-derive it, so C84 EI-6 makes persistence a precondition of the
        // affordance existing at all. C85 §5 row 23 and §11 row 6 both pinned it as
        // NEVER SERIALISED, i.e. a finish did not survive a save/load — so once L-995
        // made the write land, "Done" would have been true until the next reload and
        // false afterwards, which is the same false success with a delay fuse.
        //
        // Deep-copied per side rather than referenced: `{...wall}` would hand the
        // snapshot a live reference into the store, and the two sides must stay
        // independent values (the whole point of the feature). Emitted only when
        // present, so a wall that never got a finish re-serialises byte-identically to
        // a pre-L-995 snapshot (C47 §1.2 — additive optional field, no MAJOR bump).
        sideFinishes: wall.sideFinishes
            ? {
                ...(wall.sideFinishes.interior ? { interior: { ...wall.sideFinishes.interior } } : {}),
                ...(wall.sideFinishes.exterior ? { exterior: { ...wall.sideFinishes.exterior } } : {}),
            }
            : undefined,
        joinIntent: wall.joinIntent,
        // §WALL-PROVENANCE (L-13117) — WHICH ELEMENT THIS WALL CAME OUT OF. The
        // element-lineage half of provenance: `provenance` (C75 `ValueOrigin`) says what
        // KIND of thing produced a value and carries NO ELEMENT ID, which is the measured
        // gap that confined the envelope→wall relationship to a semantic-graph side table
        // exactly ONE producer writes. A wall generated by any other route reported "No
        // walls are linked to this envelope yet" on a face drag and moved nothing.
        //
        // AUTHORED-CLASS DATA under C84 EI-6: it records a HISTORICAL fact — *at the moment
        // this wall was minted, it was edge 3 of that envelope* — and no predicate over the
        // saved geometry can reconstruct it. Proximity to an edge is not the same claim: a
        // hand-drawn wall that happens to lie on an envelope edge did NOT come out of it,
        // and a generated wall the user has since moved still did. So dropping it here is
        // not a lossy round-trip, it is the destruction of the only copy — the same defect
        // that made the L-251 joinIntent fix worthless until §PERSIST-JOININTENT.
        //
        // DEEP-COPIED PER ROW, never referenced: the array is nested and `{...wall}` would
        // hand the snapshot a live reference into the store.
        //
        // EMITTED ONLY WHEN PRESENT, and `[]` is emitted when it is present-and-empty.
        // ABSENT and EMPTY are DIFFERENT VALUES here and neither may be turned into the
        // other (§CONTEXT-DATA-HONESTY): absent is "not recorded", empty is "a stamping
        // producer found no source". A pre-L-13117 wall therefore re-serialises
        // byte-identically (C47 §1.2 — additive optional field, no MAJOR bump).
        derivedFrom: Array.isArray(wall.derivedFrom)
            ? wall.derivedFrom.map((d: any) => ({ ...d }))
            : undefined,
        properties: wall.properties ? { ...wall.properties } : {},
        ifcData: wall.ifcData ? { ...wall.ifcData } : undefined,
        metadata: wall.metadata ? { ...wall.metadata } : undefined,
        loadBearing: wall.loadBearing
    };
}

// ── Slab serialization ──────────────────────────────────────────────────────

/**
 * ⭐ §TYPED-SERIALIZER-BOUNDARY (L-1224) — THE PROOF FAMILY. `any` in, `any` out, and a
 * hand-written field list in between, was the shape of all ten serialisers here. The
 * compiler could not tell you a field was missing, because you never told it what a slab
 * was. This one family is typed end-to-end so the cost and the payoff are both measured
 * rather than argued.
 *
 * ⚠ TYPING THE SIGNATURE ALONE BUYS ALMOST NOTHING, and pretending otherwise would be
 * the whole defect again. TypeScript does not complain when an object literal OMITS an
 * optional property, and every interesting field on `SlabData` is optional. So the
 * signature is paired with a COMPILE-TIME COVERAGE ASSERTION below: every key of
 * `SlabData` must appear either in `SerializedSlab` or on the NAMED transient list, and
 * the error message names the missing key. That is the part that catches the bug.
 *
 * COST, measured on this family: ~40 lines, one import, zero behaviour change. The other
 * nine families are the same shape and the same size. The blocker is not effort, it is
 * that four of them (`stair`, `handrail`, `roof`, `furniture`) serialise records whose
 * store type is looser than the family type, so each needs its own transient list agreed
 * with its element lane — which is exactly the conversation this assertion forces.
 */
type Vec3Plain = { x: number; y: number; z: number };
type Vec2Plain = { x: number; y: number };

interface SerializedSlab {
    id: string;
    type: SlabData['type'];
    levelId: string;
    parentId: string | undefined;
    width: number;
    depth: number;
    thickness: number;
    position: Vec3Plain;
    polygon: Vec2Plain[] | undefined;
    holes: Vec2Plain[][] | undefined;
    baseOffset: number | undefined;
    materialId: string | undefined;
    materialColor: string | undefined;
    layers: SlabData['layers'];
    systemTypeId: string | null | undefined;
    sketch: unknown;
    // §FEAT-BOUNDARY-SHAPE-DESCRIPTOR (L-1323) — the shape INTENT. ⭐ It is listed HERE
    // rather than in `TransientSlabKey` deliberately: it is authored by the user and is
    // NOT recoverable from the polygon, so omitting it would be a real loss, not a
    // transient. The `_SlabSnapshotCoverage` assertion below is what forced this line to
    // exist — the field could not be added to `SlabData` without the build naming it.
    boundaryShape: SlabData['boundaryShape'];
    properties: SlabData['properties'];
    ifcData: SlabData['ifcData'];
}

/**
 * Keys of `SlabData` deliberately absent from the snapshot. ⛔ A key belongs here only
 * with a reason, and "we never got round to it" is a KNOWN LOSS with an L-number, not a
 * transient. Adding a name here to silence the assertion below re-creates the defect.
 */
type TransientSlabKey =
    // Recomputed at load by the spatial index / room detection — a stale saved copy
    // would be WORSE than an absent one.
    | 'spatialRelationship'
    | 'spatialStatus'
    // A constant today (`'LEVEL'`, C92 §3). If a second value is ever authored this must
    // move out of this list and into the snapshot, and the assertion will not remind you
    // — which is why it is called out here.
    | 'topReference'
    // Duplicate of `properties.phase`, which IS persisted. One concept, one wire.
    | 'phase'
    // ⚠ KNOWN LOSS, not a transient — L-1215. `childrenIds` is serialised for walls and
    // dropped by every restore path because no create-command declares it; for slabs it
    // is not even written. Listed so the assertion passes at today's honest state and
    // fails the moment someone believes it is covered.
    | 'childrenIds';

/** Fails the build NAMING any `SlabData` key that reaches neither the snapshot nor the list. */
type AssertNever<T extends never> = T;
export type _SlabSnapshotCoverage = AssertNever<
    Exclude<keyof SlabData, keyof SerializedSlab | TransientSlabKey>
>;

function serializeSlab(s: SlabData): SerializedSlab {
    return {
        id: s.id, type: s.type, levelId: s.levelId, parentId: s.parentId,
        width: s.width, depth: s.depth, thickness: s.thickness,
        position: stripVec3(s.position),
        polygon: Array.isArray(s.polygon) ? s.polygon.map(stripVec2) : undefined,
        holes: Array.isArray(s.holes) ? s.holes.map((h: any[]) => h.map(stripVec2)) : undefined,
        baseOffset: s.baseOffset,
        materialId: s.materialId, materialColor: s.materialColor,
        layers: s.layers ? s.layers.map((l: any) => ({ ...l })) : undefined,
        systemTypeId: s.systemTypeId,
        sketch: s.sketch ? deepStrip(s.sketch) : undefined,
        // §FEAT-BOUNDARY-SHAPE-DESCRIPTOR (L-1323) — the shape INTENT. Written
        // here and read back by BOTH restore twins (ImportProjectCommand, the
        // default-on path, and ProjectLoader), because a field written by the
        // serializer and read by only one of them is the exact shape of the five
        // save/load holes found this week.
        boundaryShape: s.boundaryShape ? deepStrip(s.boundaryShape) : undefined,
        properties: s.properties ? { ...s.properties } : {},
        ifcData: s.ifcData ? { ...s.ifcData } : undefined
    };
}

// ── Column serialization ─────────────────────────────────────────────────────

function serializeColumn(c: any): any {
    return {
        id: c.id, type: c.type, levelId: c.levelId, parentId: c.parentId,
        position: stripVec3(c.position),
        height: c.height, rotation: c.rotation,
        profile: c.profile, width: c.width, depth: c.depth,
        baseOffset: c.baseOffset,
        materialId: c.materialId,
        properties: c.properties ? { ...c.properties } : {},
        ifcData: c.ifcData ? { ...c.ifcData } : undefined
    };
}

// ── Stair serialization ──────────────────────────────────────────────────────

function serializeStair(s: any): any {
    return deepStrip(s);
}

// ── Beam serialization ───────────────────────────────────────────────────────

function serializeBeam(b: any): any {
    return {
        id: b.id, levelId: b.levelId, parentId: b.parentId,
        startPoint: stripVec3(b.startPoint),
        endPoint: stripVec3(b.endPoint),
        width: b.width, depth: b.depth,
        startSupportId: b.startSupportId, endSupportId: b.endSupportId,
        startSupportType: b.startSupportType, endSupportType: b.endSupportType,
        material: b.material,
        // ⭐ C100 §2.1 / L-1127 ARM D — the MASTER material reference. `material`
        // beside it is a free-form descriptive string that nothing resolves; this
        // is the id `BeamFragmentBuilder` renders from, and it is PERSIST-OR-LOSE.
        // Written here AND read back by `ProjectLoader`'s CreateBeamCommand
        // payload — writing without reading is the slab defect (ARM E), where the
        // id sat correctly in the saved file and the reloaded element had none.
        materialId: b.materialId,
        loadBearing: b.loadBearing,
        fireRating: b.fireRating,
        properties: b.properties ? { ...b.properties } : {},
        ifcData: b.ifcData ? { ...b.ifcData } : undefined,
        metadata: b.metadata ? { ...b.metadata } : undefined
    };
}

// ── CurtainWall serialization ────────────────────────────────────────────────

function serializeCurtainWall(c: any): any {
    return {
        id: c.id, type: c.type, levelId: c.levelId, parentId: c.parentId,
        baseLine: stripBaseline(c.baseLine),
        height: c.height, baseOffset: c.baseOffset,
        gridXSpacing: c.gridXSpacing, gridYSpacing: c.gridYSpacing,
        mullionSize: c.mullionSize, panelThickness: c.panelThickness,
        mullionColor: c.mullionColor,
        // §MAT-CW-MATERIAL (#53) — glazing colour + mullion/glazing material-library IDs.
        glazingColor: c.glazingColor,
        mullionMaterialId: c.mullionMaterialId,
        glazingMaterialId: c.glazingMaterialId,
        // §FEAT-CURTAIN-WALL-TYPE-CATALOGUE (L-958) — the assigned published type.
        systemTypeId: c.systemTypeId,
        gridSystem: c.gridSystem ? deepStrip(c.gridSystem) : undefined,
        properties: c.properties ? { ...c.properties } : {},
        ifcData: c.ifcData ? { ...c.ifcData } : undefined
    };
}

// ── Roof serialization ───────────────────────────────────────────────────────

function serializeRoof(r: any): any {
    const footprint = r.footprint
        ? {
            polygon:  r.footprint.polygon,
            centroid: r.footprint.centroid,
        }
        : undefined;
    return {
        id:           r.id,
        type:         r.type,
        levelId:      r.levelId,
        parentId:     r.parentId,
        footprint,
        roofType:     r.roofType,
        slope:        r.slope,
        overhang:     r.overhang,
        thickness:    r.thickness,
        baseOffset:   r.baseOffset,
        fascia:       r.fascia,
        materialColor: r.materialColor,
        materialId:   r.materialId,
        properties:   r.properties ? { ...r.properties } : {},
        ifcData:      r.ifcData ? { ...r.ifcData } : undefined,
        metadata:     r.metadata ? { ...r.metadata } : undefined,
        width:        r.width,
        depth:        r.depth,
        mode:         r.mode,
        polygon:      Array.isArray(r.polygon) ? r.polygon : undefined,
    };
}

// ── Furniture serialization ──────────────────────────────────────────────────

function serializeFurniture(f: any): any {
    return {
        id: f.id, type: f.type, furnitureType: f.furnitureType,
        position: stripVec3(f.position),
        rotation: stripEuler(f.rotation),
        levelId: f.levelId, levelName: f.levelName,
        levelElevation: f.levelElevation, baseOffset: f.baseOffset,
        width: f.width, length: f.length, height: f.height,
        widthBranchTwo: f.widthBranchTwo, lengthBranchTwo: f.lengthBranchTwo,
        widthMain: f.widthMain, lengthSide: f.lengthSide,
        seatDepthMain: f.seatDepthMain, seatDepthSide: f.seatDepthSide,
        startPoint: f.startPoint ? stripVec3(f.startPoint) : undefined,
        cornerPoint: f.cornerPoint ? stripVec3(f.cornerPoint) : undefined,
        endPoint: f.endPoint ? stripVec3(f.endPoint) : undefined,
        // ⭐ C100 §2.1 / L-1460 — `materialId` is PERSIST-OR-LOSE. `material` beside
        // it is the legacy FOUR-VALUE construction hint (wood|metal|fabric|glass),
        // not a material reference; writing only that is how the master's 205 rows
        // were absent from every saved project. C84 EI-7a: write set = restore set —
        // `ProjectLoader` reads this back through `CreateFurnitureCommand` (the gate's
        // ARM E), because a field written and never read is the WORST persistence
        // shape: the JSON a reviewer opens says it worked.
        lo3: f.lo3, material: f.material, materialId: f.materialId, color: f.color,
        hasHeadboard: f.hasHeadboard,
        mark: typeof f.mark === 'string' ? f.mark : undefined,
        hostedSpaceId: typeof f.hostedSpaceId === 'string' ? f.hostedSpaceId : undefined,
        wardrobeConfig: f.wardrobeConfig ? deepStrip(f.wardrobeConfig) : undefined,
        // Group configs for kitchen / wardrobe RUNs. Without these, a saved
        // kitchen U-shape or wardrobe L-shape reloads as a single primitive
        // and FurnitureFactory throws "requires kitchenConfig" /
        // "requires wardrobeCabinetConfig". Contract 13 §2: snapshots must
        // round-trip byte-compatibly, so every parametric input that drives
        // geometry MUST be serialised here.
        kitchenConfig:         f.kitchenConfig         ? deepStrip(f.kitchenConfig)         : undefined,
        wardrobeCabinetConfig: f.wardrobeCabinetConfig ? deepStrip(f.wardrobeCabinetConfig) : undefined,
        // Descriptor-level grouping (kitchen / bedroom / outdoor / …). Used
        // by inspector grouping, schedules and category filters; loss on
        // reload would silently regress the UI.
        furnitureCategory:     typeof f.furnitureCategory === 'string' ? f.furnitureCategory : undefined,
        aiElementConfig: f.aiElementConfig ? deepStrip(f.aiElementConfig) : undefined,
        properties: f.properties ? { ...f.properties } : {},
        // Descriptor-supplied metadata (defaultProperties from the carousel
        // registry, custom tags). `properties` already round-trips, but
        // `metadata` is the canonical channel for descriptor extras and is
        // round-tripped separately in CreateFurnitureCommand.
        metadata:              f.metadata ? deepStrip(f.metadata) : undefined,
        ifcData: f.ifcData ? { ...f.ifcData } : undefined
    };
}

// ── Handrail serialization ───────────────────────────────────────────────────

/**
 * §L-1102 / §L-1037 — SAVE goes through the ONE exported serialiser.
 *
 * This used to be a hand-written 10-field whitelist, duplicated byte-for-byte in
 * `packages/persistence-client`. C95 §16 measured it: 14 authored fields
 * (`fillType`, `railProfile`, `postSpacing`, `hostId`, …) were never written at
 * all, so a Frameless Glass Balustrade reloaded as a grey rectangular one.
 *
 * `serializeHandrailRecord` inverts the default — it emits the record MINUS the
 * NAMED transient list in `handrailPersistence.ts`. A field added to
 * `HandrailData` now reaches the snapshot without anyone editing this file.
 */
function serializeHandrail(h: any): any {
    return serializeHandrailRecord(h);
}

// ── Plumbing serialization ───────────────────────────────────────────────────

function serializePlumbing(p: any): any {
    return {
        id: p.id, type: p.type, fixtureType: p.fixtureType,
        toiletVariant: p.toiletVariant,
        position: stripVec3(p.position),
        rotation: stripEuler(p.rotation),
        levelId: p.levelId, levelName: p.levelName,
        levelElevation: p.levelElevation, baseOffset: p.baseOffset,
        width: p.width, height: p.height, length: p.length,
        color: p.color,
        startPoint: p.startPoint ? stripVec3(p.startPoint) : undefined,
        endPoint: p.endPoint ? stripVec3(p.endPoint) : undefined,
        // §GRAPH115 / ADR-0374 §2.7 — additive-optional (C47): the key is emitted only
        // when present, so an unanchored project's snapshot is byte-identical. ⚠ Two
        // hand-synced serializer copies (C78 §14.3) — the persistence-client twin
        // carries the same line; both restore paths pass it to CreatePlumbingFixtureCommand.
        ...(p.wallAnchor ? { wallAnchor: { ...p.wallAnchor } } : {}),
        properties: p.properties ? { ...p.properties } : {}
    };
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface ProjectStores {
    wallStore: WallStore;
    slabStore: SlabStore;
    columnStore: ColumnStore;
    gridStore: GridStore;
    stairStore: StairStore;
    beamStore: BeamStore;
    curtainWallStore: CurtainWallStore;
    roofStore: RoofStore;
    plumbingStore: PlumbingStore;
    furnitureStore: FurnitureStore;
    handrailStore: HandrailStore;
    openingStore: OpeningStore;
    /** Room subsystem — optional for backward compat with bootstraps that don't yet wire it. */
    roomStore?: import('@pryzm/room-topology').RoomStore;
    /**
     * §L-1057 / C87 §13.1 CW-P — the panel AUTHORITY. Absent from this interface
     * until 2026-08-19, which is why `grep curtainPanel ProjectSerializer.ts` returned
     * nothing: there was no store here for a branch to read even if one had existed.
     * Optional, so a bootstrap that does not wire it simply writes no overrides —
     * the same shape every other late arrival above uses.
     */
    curtainPanelStore?: import('@pryzm/geometry-curtain-wall').CurtainPanelStore;
    /**
     * FIX-12 §07 §3: SlabSystemTypeStore — needed to persist custom slab assembly types.
     * Optional for backward compat; when absent, slabSystemTypes is omitted from snapshot.
     */
    slabSystemTypeStore?: SlabSystemTypeStore;
    /**
     * FIX-3 (M9): WallSystemTypeStore — needed to persist custom wall assembly types.
     * Optional for backward compat; when absent, wallSystemTypes is omitted from snapshot.
     */
    wallSystemTypeStore?: WallSystemTypeStore;
    /** CeilingStore — optional for backward compat. */
    ceilingStore?: CeilingStore;
    /** CeilingSystemTypeStore — needed to persist custom ceiling assembly types. */
    ceilingSystemTypeStore?: CeilingSystemTypeStore;
    /** FloorStore — optional for backward compat. */
    floorStore?: import('@pryzm/core-app-model/stores').FloorStore;
    /** FloorSystemTypeStore — needed to persist custom floor assembly types. */
    floorSystemTypeStore?: import('@pryzm/core-app-model/stores').FloorSystemTypeStore;
    /**
     * A.R.3 (Revit round-trip · S55) — IfcMetaStore. Persists per-element IFC/Revit
     * metadata (GlobalId + psets + quantities — the round-trip join keys) so an
     * imported IFC/Revit model survives `.pryzm` save/reload. Optional for backward
     * compat with bootstraps (and isolated tests) that don't wire the runtime store.
     */
    ifcMetaStore?: IfcMetaStore;
    /**
     * §FIX-GIS-SITE-STATE-NOT-PERSISTED (L-188) — the per-runtime SiteModelStore
     * (`runtime.siteModelStore`). Threaded through here (like `ifcMetaStore`) so the
     * snapshot can capture the C19 site/geospatial state. Optional for backward
     * compat with bootstraps / isolated tests that don't wire the runtime store; when
     * absent the serializer falls back to `window.runtime.siteModelStore` and finally
     * omits `site` from the snapshot.
     */
    siteModelStore?: SiteModelStore;
    /**
     * PV-05 (C70 I-INV-2) — the per-runtime C23 ProvenanceStore
     * (`runtime.provenanceStore`, created in composeRuntime.ts:1044). Threaded
     * through here like `ifcMetaStore` / `siteModelStore` so the AI lineage can
     * reach the snapshot.
     *
     * Optional ON PURPOSE, and the absence is NOT defensive slack: when no
     * store is wired the serializer OMITS the `provenance` key rather than
     * writing an empty slice. An empty slice is the positive claim "no AI ever
     * touched this project" (C75 §1.4); written by an unwired bootstrap over a
     * project that HAS a lineage, it would silently destroy the audit log C23
     * §1.8 promises a regulator.
     */
    provenanceStore?: import('@pryzm/stores').ProvenanceStore;
    /**
     * §FIX-POOL-AND-BOUNDARY-LINE-INVISIBLE (L-9948) · C106 — the boundary-line
     * store, as the NARROWEST surface this serializer needs from it.
     *
     * ⭐ A PORT, NOT AN IMPORT, and for the reason `BoundaryLineStorePort` already
     * states in `@pryzm/geometry-boundary-line`: the store is built by
     * `PluginRegistry` at L7 and hung on the runtime under its `storeKey`, so a
     * structural shape here lets the serializer reach it without inverting a layer or
     * importing a plugin.
     *
     * ⚠ It is deliberately NOT `unknown` with a cast at the call site: an `any`-shaped
     * seam is a defect factory ([[fake-more-capable-than-real]]), and the point of the
     * port is that a store which cannot answer `getState()` is a COMPILE error rather
     * than a runtime silence.
     *
     * Optional, and the absence is honest rather than defensive: when nothing is wired
     * the resolver below falls back to `window.runtime.stores.boundaryLine` (the same
     * two-candidate shape `siteModelStore` uses, and for the same measured reason —
     * a threaded reference captured at init goes stale across a runtime recomposition)
     * and finally OMITS the key.
     */
    boundaryLineStore?: { getState(): Map<string, unknown> };
}


/**
 * §L-545-SITE-CAPTURE (L-188 / L-489) — resolve the C19 SiteModel to persist, and
 * record WHY it has the value it has.
 *
 * ── DEFECT 1: THE `??` WAS ON THE WRONG THING ───────────────────────────────
 * The previous inline code was `siteModelStore ?? window.runtime.siteModelStore`.
 * That short-circuits on the STORE REFERENCE, not on whether the store actually
 * holds a site. `SiteModelStore` is a PER-RUNTIME instance (`composeRuntime.ts:908`),
 * and `initPersistence.ts:83-89` binds the threaded one ONCE, at init, into a
 * closure that lives for the rest of the session. If the runtime is recomposed
 * after that bind — the reconstruction-boundary family: project switch, renderer
 * backend swap, device-loss recovery — the serializer keeps saving from a STALE,
 * EMPTY store while the live `window.runtime.siteModelStore` holds the real parcel.
 * The store resolves, `getSite()` returns null, the save proceeds. That is exactly
 * the founder's signature: `siteStore=resolved · site=NULL · walls>0`.
 *
 * Fix: try EVERY candidate and take the first that actually HAS a site. This
 * strictly dominates the old behaviour — it can only find a site where the old
 * code found none, never the reverse — and it records which candidate won, so
 * instance drift becomes visible instead of inferred.
 *
 * ── DEFECT 2: `site: null` WAS AMBIGUOUS ────────────────────────────────────
 * It meant BOTH "plain BIM project, never had a georeference" (correct, common)
 * and "GIS project whose georeference was LOST at save" (the P0). Nothing
 * downstream could tell them apart, so the loader treated the second as the first
 * and reported a clean load. Same failure shape as the context-data honesty
 * family: an error and an empty result were the same value. `capture.status`
 * separates them.
 *
 * ── BLOCK THE SAVE, OR SAVE WITH EXPLICIT DEGRADATION? ──────────────────────
 * FOR BLOCKING: an element-bearing GIS snapshot with a null georeference is
 * corrupt-on-arrival — it reopens floating, renders nothing in 3D Site, and any
 * compliance envelope derived from it is meaningless.
 *
 * AGAINST BLOCKING — decisive, three independent reasons:
 *  1. **The alternative to a lossy save is NO SAVE, which loses MORE.** The
 *     georeference is one field; the geometry is the user's actual work. A
 *     "data-loss prevention" that discards the model to protect a lat/lon causes
 *     strictly greater loss than the bug it guards against.
 *  2. **This runs on the AUTO-SAVE path.** A throw here does not produce a dialog
 *     the user answers — it produces auto-saves that silently stop succeeding.
 *     That is the L-188 bug again with the blame moved.
 *  3. **A null site is CORRECT for most projects.** Plain BIM work has no parcel
 *     and never will. The predicate that would gate the block ("is this a GIS
 *     project?") is not reliably knowable at save time, and inventing one is the
 *     L-459 mistake — dressing a guess as a determination.
 *
 * DECISION: **SAVE, AND RECORD THE DEGRADATION AS FIRST-CLASS DATA** — not a
 * console warning (those printed for a day and changed nothing) but a field ON
 * THE SNAPSHOT, so the loss travels with the artefact and the reopen path can
 * state it plainly. This does NOT stop the loss; it makes it legible and removes
 * the ambiguity. Never fabricate a substitute origin.
 *
 * ⚠ HONEST LIMIT: the audit's standing instruction on L-489 is *"Do NOT patch the
 * persistence path until that one line is read [with walls>0]"*, and it has not
 * been read — no browser exists in this environment. Defect 1 is therefore NOT
 * claimed as "the" root cause; it is a provable capture bug fixed on its own
 * merits. If a live save still reports `degraded`, `capture.source` and
 * `capture.reason` narrow what is left.
 *
 * Pure: no I/O, no mutation of the stores, no events. Safe to call from a test.
 */
export function resolveSiteCapture(
    candidates: readonly { readonly label: 'threaded' | 'window.runtime'; readonly store: SiteModelStore | undefined }[],
    elementCount: number,
): { site: SiteModel | null; capture: NonNullable<ProjectSnapshot['siteCapture']> } {
    const span = trace.getTracer('pryzm.editor.persistence').startSpan('persistence.resolveSiteCapture');
    try {
        let site: SiteModel | null = null;
        let source: 'threaded' | 'window.runtime' | 'none' = 'none';
        let anyStoreResolved = false;

        for (const c of candidates) {
            if (!c.store) continue;
            anyStoreResolved = true;
            try {
                const s = c.store.getSite?.() ?? null;
                if (s) {
                    // structuredClone yields a plain, unfrozen snapshot — the SiteModel is
                    // pure Zod data (no THREE/DOM refs), so this round-trips through JSON.
                    site = structuredClone(s) as SiteModel;
                    source = c.label;
                    break;
                }
            } catch (e) {
                // Try the NEXT candidate rather than giving up: one broken store must not
                // cost the georeference when another holds it.
                console.warn(
                    `[ProjectSerializer] §L-545 — failed to read SiteModel from the ${c.label} store (trying the next candidate):`,
                    e,
                );
            }
        }

        let capture: NonNullable<ProjectSnapshot['siteCapture']>;
        if (site) {
            capture = {
                status: 'captured',
                reason: `SiteModel read from the ${source} SiteModelStore.`,
                elementCount,
                source,
            };
        } else if (elementCount > 0) {
            const reason = anyStoreResolved
                ? 'a SiteModelStore was available but getSite() returned null on every candidate — the parcel/origin was never committed into a store the serializer can see'
                : 'no SiteModelStore was available at save time (neither threaded via initPersistence nor on window.runtime)';
            capture = { status: 'degraded', reason, elementCount, source: 'none' };
            console.warn(
                '[ProjectSerializer] ⚠ §L-489/§L-545 — SAVING A PROJECT WITH GEOMETRY BUT NO SITE ' +
                'GEOREFERENCE. The save is ALLOWED (blocking it would discard the geometry too — see ' +
                "the argument above) but is RECORDED on the snapshot as siteCapture.status='degraded', " +
                `so the reopen path can say so instead of silently re-deriving nothing. Reason: ${reason}.`,
            );
        } else {
            capture = {
                status: 'none',
                reason: 'No site and no geometry — nothing was lost (a plain non-GIS project).',
                elementCount,
                source: 'none',
            };
        }

        span.setAttribute('site.capture.status', capture.status);
        span.setAttribute('site.capture.source', capture.source);
        span.setAttribute('site.capture.element_count', elementCount);
        console.log(
            `[ProjectSerializer] §L-489-SITE-CAPTURE-DIAG siteStore=${anyStoreResolved ? 'resolved' : 'NULL'} ` +
            `site=${site ? `captured(lat=${typeof site.location?.latitude === 'number' ? site.location.latitude.toFixed(5) : '?'}, from=${source})` : 'NULL'} ` +
            `walls=${elementCount} status=${capture.status}`,
        );
        return { site, capture };
    } finally {
        span.end();
    }
}

export class ProjectSerializer {
    /**
     * Serialize the current live project state to a plain-JSON snapshot.
     * This method ONLY READS from stores — it never writes to any store,
     * calls any builder, or publishes any event.
     */
    static serialize(
        stores: ProjectStores,
        _bimManager: BimManager,
        opts: { projectName?: string; projectId?: string; versionLabel?: string } = {}
    ): ProjectSnapshot {
        const {
            wallStore, slabStore, columnStore, gridStore, stairStore,
            beamStore, curtainWallStore, roofStore, plumbingStore,
            furnitureStore, handrailStore, openingStore, roomStore,
            slabSystemTypeStore, wallSystemTypeStore, ceilingStore, ceilingSystemTypeStore,
            floorStore, floorSystemTypeStore, ifcMetaStore, siteModelStore,
            provenanceStore, curtainPanelStore,
        } = stores;

        // §FIX-GIS-SITE-STATE-NOT-PERSISTED (L-188) / §L-545 (L-489) — capture the C19
        // SiteModel so the real location / parcel boundary / geospatial origin survive
        // save+reload. The resolution + degradation logic is the pure, exported
        // `resolveSiteCapture` below (extracted so it is testable WITHOUT constructing
        // the ~25-store serializer bundle — the old inline version had no unit coverage,
        // which is a large part of why L-188 recurred as L-489).
        const { site, capture: siteCapture } = resolveSiteCapture(
            [
                { label: 'threaded', store: siteModelStore },
                { label: 'window.runtime', store: (window as { runtime?: { siteModelStore?: SiteModelStore } }).runtime?.siteModelStore },
            ],
            (() => { try { return wallStore.getAll().length; } catch { return -1; } })(),
        );

        const levels = wallStore.getLevels().map(l => ({ ...l }));
        const grids = gridStore.getAll().map(g => ({ ...g }));
        const walls = wallStore.getAll().map(serializeWall);
        // B7a: Serialize from the first-class DoorStore/WindowStore (Phase B).
        // These are plain objects — no THREE.js class stripping required.
        const windows = windowStore.getAll().map(w => ({ ...w }));
        const doors = doorStore.getAll().map(d => ({ ...d }));
        const slabs = slabStore.getAll().map(serializeSlab);
        const columns = columnStore.getAll().map(serializeColumn);
        const stairs = stairStore.getAll().map(serializeStair);
        const beams = beamStore.getAll().map(serializeBeam);
        const curtainWalls = curtainWallStore.getAll().map(serializeCurtainWall);

        // §L-1057 / C87 §13.1 CW-P — SPARSE CURTAIN-PANEL OVERRIDES.
        //
        // `CurtainPanelStore` is the declared AUTHORITY for panels (C87 §2) and was
        // read by NOTHING here until now, so every authored panelType,
        // materialOverride, materialId and hostedDoor was destroyed on save. It hid
        // because `CurtainPanelSyncHandler` REGENERATES every cell as
        // `SystemPanel_Glass` on load, returning the right cell count and a plausible
        // façade — a wall that came back EMPTY would have been reported years ago.
        //
        // Only panels that DIVERGE from what regeneration produces are written
        // (L-1035): O(authored), not O(cells). Keyed on the bounding grid-line PAIR,
        // never on (row, col), because an inserted line shifts every index downstream
        // of it and a door quietly moving to the wrong cell is worse than losing it.
        const curtainPanels: CurtainPanelOverride[] = [];
        if (curtainPanelStore) {
            for (const cw of curtainWallStore.getAll()) {
                const panels = curtainPanelStore.getByCurtainWallId(cw.id);
                if (panels.length === 0) continue;
                const { overrides, unaddressable } = collectCurtainPanelOverrides(
                    cw.id,
                    resolveCurtainGrid(cw),
                    panels,
                    { glazingMaterialId: cw.glazingMaterialId },
                );
                curtainPanels.push(...overrides);
                // C84 EI-6 — an authored panel we cannot ADDRESS is still a loss, and a
                // loss must be loud. This should be unreachable (the sync handler only
                // mints panels for cells the grid has), so if it fires the grid and the
                // panel store have diverged and that is worth knowing at save time.
                if (unaddressable.length > 0) {
                    console.error(
                        `[ProjectSerializer] §L-1057 curtain wall '${cw.id}': ${unaddressable.length} ` +
                        `authored panel(s) sit on cells the grid does not have and were NOT saved — ` +
                        unaddressable.map(p => `${p.id}[${p.cellIndex.join(',')}]`).join(', '),
                    );
                }
            }
        } else {
            // Declared, not silent (C84 EI-2). A bootstrap that does not wire the panel
            // store saves no per-panel authoring, and the user must not discover that
            // on reload.
            if (curtainWalls.length > 0) {
                console.warn(
                    '[ProjectSerializer] §L-1057 no curtainPanelStore was passed, so per-panel ' +
                    `authoring on ${curtainWalls.length} curtain wall(s) is NOT being saved. ` +
                    'Wire `stores.curtainPanelStore` — see C87 §13.1 CW-P.',
                );
            }
        }
        const roofs = roofStore.getAll().map(serializeRoof);
        const furniture = furnitureStore.getAll().map(serializeFurniture);
        const handrails = handrailStore.getAll().map(serializeHandrail);
        const plumbing = plumbingStore.getAll().map(serializePlumbing);
        const openings = openingStore.getAll().map(o => deepStrip(o));
        // §PERSIST-LIGHTING (2026-05-22) — lighting fixtures were NEVER serialized,
        // so every light the user placed was silently lost on reload. The lighting
        // store is window-managed (initBuilders sets window.lightingStore; the same
        // ref CreateLightingCommand reads), so we source it from there rather than
        // threading it through the `stores` param.
        const lighting = (((window as { lightingStore?: { getAll?: () => unknown[] } }).lightingStore?.getAll?.()) ?? [])
            .map((l) => deepStrip(l));

        // §FIX-POOL-AND-BOUNDARY-LINE-INVISIBLE (L-9948) · C106 — BOUNDARY LINES.
        //
        // ⛔ TWO CANDIDATES, AND THE FIRST THAT ACTUALLY HOLDS RECORDS WINS — the
        // §L-545-SITE-CAPTURE lesson, reused verbatim. `store ?? window.runtime.store`
        // short-circuits on the REFERENCE, not on whether the store holds anything, and
        // a reference threaded once at `initPersistence` time goes stale the moment the
        // runtime is recomposed (project switch, renderer backend swap, device-loss
        // recovery). That is how a serializer keeps saving from an empty store while the
        // live one holds the model.
        const boundaryLines = ((): unknown[] => {
            const threaded = stores.boundaryLineStore;
            const onRuntime = (window as {
                runtime?: { stores?: Record<string, { getState?: () => Map<string, unknown> } | undefined> };
            }).runtime?.stores?.['boundaryLine'];
            for (const candidate of [threaded, onRuntime]) {
                const state = candidate?.getState?.();
                if (state && state.size > 0) return [...state.values()].map((b) => deepStrip(b));
            }
            return [];
        })();

        // §PERSIST103 (L-11520) — THE COMPOUND SLICES, read through ONE resolver.
        //
        // ⭐ ONE HELPER, NOT FIVE COPIES OF THE `boundaryLines` BLOCK ABOVE. Every one
        // of these stores is built by `PluginRegistry` and hung on the composed runtime
        // under its descriptor's `storeKey` (`lift`, `liftPart`, `pool`, `water`,
        // `balcony`) — the identical shape `boundaryLine` uses. Five hand-copied
        // resolvers would be five places for the next `undefined`-vs-empty confusion to
        // hide, and this file already records what copy-paste per family costs: the
        // §TYPE-SNAPSHOT-CODEC note two hundred lines down exists because a hand-written
        // field list drifted from the codec it was supposed to invert.
        //
        // ⛔ IT RESOLVES LAZILY, AT SAVE TIME — the §L-545-SITE-CAPTURE lesson the
        // `boundaryLines` block states in full just above. A store reference threaded in
        // at `initPersistence` time goes stale the moment the runtime is recomposed
        // (project switch, renderer backend swap, device-loss recovery), and that is
        // exactly how a serializer keeps saving from an empty store while the live one
        // holds the model.
        //
        // ⚠ `[]` HERE MEANS "the store holds no records", AND `undefined` MEANS "there is
        // no such store on the runtime" — kept apart deliberately (C70 L-INV-1;
        // [[context-data-honesty-family]]: failure and empty must never be the same
        // value). The caller below turns BOTH into an omitted key, because for a
        // SNAPSHOT they have the same correct outcome — but the warning arm can only
        // fire because the two were distinguished first.
        const readPluginStore = (storeKey: string): unknown[] | undefined => {
            const store = (window as {
                runtime?: { stores?: Record<string, { getState?: () => Map<string, unknown> } | undefined> };
            }).runtime?.stores?.[storeKey];
            const state = store?.getState?.();
            if (!state) return undefined;
            return [...state.values()].map((r) => deepStrip(r));
        };

        const lifts      = readPluginStore('lift');
        const liftParts  = readPluginStore('liftPart');
        const pools      = readPluginStore('pool');
        const waters     = readPluginStore('water');
        const balconies  = readPluginStore('balcony');
        const bathroomPods = readPluginStore('bathroomPod');
        // §COMPONENT-PLACE (audit §12 Phase 4C · ADR-0376 D9) — THE JOIN's save leg,
        // through the SAME lazy resolver as the six above rather than a seventh
        // hand-copied block. See `StoresSlot.component` for why the key on the
        // composed runtime is what makes this read resolve at all (R11 / L-11530).
        const components = readPluginStore('component');
        // §82.7-DEFINITIONS-TRAVEL-WITH-PROJECT — the definitions those occurrences
        // resolve against, read from the ONE catalogue (never from a store: a
        // definition is not an element, C111 §4.3-a). `[]` → omitted below (C47).
        let componentDefinitions: unknown[] = [];
        try {
            componentDefinitions = serializeComponentDefinitions();
        } catch (e) {
            // ⛔ LOUD: a save that silently dropped the definitions would reopen as
            // the exact defect §82.7 closes.
            console.error('[ProjectSerializer] §82.7 could not serialise the component definitions — the file will carry the occurrences WITHOUT their definitions:', e);
        }
        // §FEAT-SPACE-ENVELOPE (L-12900) · C114 §9 — the authored massing volume,
        // through the SAME lazy resolver as the seven above rather than an eighth
        // hand-copied block. `StoresSlot.spaceEnvelope` is declared in
        // `packages/runtime-composer/src/types.ts` and ADOPTED (never constructed) in
        // `composeRuntime.ts` from the `space-envelope` PluginRegistry descriptor —
        // which is the leg L-11530 was missing for `balcony`, and the reason THAT row
        // could read `persisted` for four days while every record was destroyed.
        const spaceEnvelopes = readPluginStore('spaceEnvelope');
        // C116 9 / ADR-0384 - the authored paved surfaces, through the SAME lazy
        // resolver rather than another hand-copied block. `StoresSlot.siteworks` is
        // declared in runtime-composer types.ts and ADOPTED (never constructed) in
        // composeRuntime.ts from the `siteworks` PluginRegistry descriptor - the leg
        // L-11530 was missing for `balcony`, which is how THAT row read `persisted`
        // for four days while every record was destroyed on reload.
        const siteworks = readPluginStore('siteworks');

        // ── C84 EI-6, THE LOUD HALF: say what is about to be destroyed ────────────
        //
        // ⭐ THIS IS WHAT KEEPS `snapshotFamilyCoverage.ts` LOAD-BEARING RATHER THAN
        // DECORATIVE. The table declares which families do NOT survive a reload; this
        // reads it back at the moment of the loss and names them, with counts, in the
        // console the founder is already watching. "Persistence is not optional and
        // absence must be loud" is unenforceable if the only place the absence is
        // written down is a table nobody prints.
        //
        // ⚠ It reports the LOSS, never a success. A family on this list is a DEFECT
        // with an ISSUE-LOG row (structural → L-11523, section → L-11524), not an
        // exemption, and the message says so rather than reading as a status line.
        for (const key of UNPERSISTED_FAMILY_KEYS) {
            const n = readPluginStore(key)?.length ?? 0;
            if (n === 0) continue;
            console.error(
                `[ProjectSerializer] §PERSIST103 C84 EI-6 — ${n} '${key}' record(s) are in the live ` +
                `store and are NOT being saved: this family has no snapshot key, so they will be GONE ` +
                `on the next open. See snapshotFamilyCoverage.ts for the row and its ISSUE-LOG id.`,
            );
        }

        // Room subsystem — deepStrip removes any residual THREE.js references
        const rooms = roomStore ? roomStore.getAll().map(r => deepStrip(r)) : [];

        // Room Bounding Line subsystem — plain DTOs, no THREE.js references
        const roomBoundingLines = roomBoundingLineStore.getAll().map(l => ({ ...l }));

        // Ceiling subsystem — deepStrip removes any residual THREE.js references
        const ceilings = ceilingStore ? ceilingStore.getAll().map(c => deepStrip(c)) : [];
        const ceilingSystemTypes = ceilingSystemTypeStore
            ? ceilingSystemTypeStore.getAll()
                .filter(t => !ceilingSystemTypeStore.isBuiltIn(t.id))
                .map(t => structuredClone(t))
            : [];

        // Floor finish subsystem — deepStrip removes any residual THREE.js references
        const floors = floorStore ? floorStore.getAll().map(f => deepStrip(f)) : [];
        const floorSystemTypes = floorSystemTypeStore
            ? floorSystemTypeStore.getAll()
                .filter(t => !floorSystemTypeStore.isBuiltIn(t.id))
                .map(t => structuredClone(t))
            : [];

        // FIX-12 §07 §3: Persist only CUSTOM slab system types (built-ins are always
        // reconstructed from code). structuredClone ensures no frozen-object issues.
        const slabSystemTypes = slabSystemTypeStore
            ? slabSystemTypeStore.getAll()
                .filter(t => !slabSystemTypeStore.isBuiltIn(t.id))
                .map(t => structuredClone(t))
            : [];

        // FIX-3 (M9): Persist only CUSTOM wall system types (built-ins are always
        // reconstructed from code). structuredClone ensures no frozen-object issues.
        // §TYPE-SNAPSHOT-CODEC — projected through the SAME codec the loader decodes with
        // (`wallSystemTypeCodec.ts`), replacing a bare `structuredClone(t)` whose inverse
        // was a hand-written four-field list in ProjectLoader. The two sides had already
        // drifted: `function` (L-285) was written here and dropped there.
        const wallSystemTypes = wallSystemTypeStore
            ? wallSystemTypeStore.getAll()
                .filter(t => !wallSystemTypeStore.isBuiltIn(t.id))
                .map(t => encodeWallSystemType(t))
            : [];

        // §M-H4 (DAILY-USE-AUDIT 2026-05-20) — Persist only CUSTOM door/window
        // finish types. The store's `isBuiltIn` field (vs the per-method
        // `isBuiltIn(id)` API on wall/slab/ceiling/floor) is a small surface
        // divergence we accept here rather than refactor 4 stores. Built-in
        // presets are re-seeded from code each boot, so omitting them keeps
        // snapshot size minimal.
        // §TYPE-SNAPSHOT-CODEC (C65 §3.1) — projected through the SAME codec the
        // loader decodes with (`hostedSystemTypeCodec.ts`), so the two sides
        // cannot drift — the wallSystemTypeCodec arrangement, applied here when
        // door/window types became user-authorable.
        const doorSystemTypes = doorSystemTypeStore.getAll()
            .filter(t => !t.isBuiltIn)
            .map(t => encodeHostedSystemType(t));
        const windowSystemTypes = windowSystemTypeStore.getAll()
            .filter(t => !t.isBuiltIn)
            .map(t => encodeHostedSystemType(t));

        // §FEAT-HANDRAIL-TYPE-PERSISTENCE (C95 §15.7, R3) — only CUSTOM railing
        // types. `getCustom()` is the store's own filter, so it cannot drift from
        // `isBuiltIn` the way a local predicate would.
        const handrailTypes = handrailTypeStore.getCustom().map(t => structuredClone(t));

        const elementCount =
            walls.length + slabs.length + ceilings.length + floors.length + columns.length + stairs.length +
            beams.length + curtainWalls.length + roofs.length + furniture.length +
            handrails.length + plumbing.length + rooms.length + lighting.length +
            // ⭐ L-9948 — a boundary line IS an element, and the founder's report was
            // literally that the count did not move. Omitting it here would leave the
            // save log saying "14 elements" for a project with fifteen.
            boundaryLines.length +
            // ⭐ §PERSIST103 (L-11520) — the same argument, and it is the reason the
            // founder could count the loss at all. A lift, a pool and a balcony ARE
            // elements; their absence from this sum is why `elementCount` did not move
            // when they were destroyed, so the save log agreed with the corrupted file
            // instead of contradicting it.
            //
            // ⛔ MEMBERS ARE NOT DOUBLE-COUNTED. A lift's shaft walls are already in
            // `walls`, its glass in `curtainWalls` and its landing doors in `doors`
            // (C104 §2.2 — the compound owns them by `childrenIds`, not by containment),
            // so only the PARENT and the twin-less parts are added here.
            (lifts?.length ?? 0) + (liftParts?.length ?? 0) +
            (pools?.length ?? 0) + (waters?.length ?? 0) +
            (balconies?.length ?? 0) +
            // ⭐ §PERSIST-BATHROOM-POD — the pod PARENT only. Its members are already
            // counted in `plumbing` (the mirror projects them into the legacy fixture
            // store this serializer reads), so adding them here would double them —
            // the same rule the lift's shaft walls follow four lines up.
            (bathroomPods?.length ?? 0) +
            // ⭐ §COMPONENT-PLACE — a placed component IS an element (ADR-0376 D9), so
            // it counts. ⛔ NOTHING IS DOUBLE-COUNTED HERE and the reason is different
            // from the lift's: a placed component has NO member families at all, so
            // there is no other slice this record could already be inside.
            (components?.length ?? 0) +
            // ⭐ §FEAT-SPACE-ENVELOPE — an authored space envelope IS an element
            // (ADR-0380 D1 rules it its own KIND, not a Room), so it counts. ⛔ NOTHING
            // IS DOUBLE-COUNTED: like a placed component it has no member families, and
            // unlike a lift its `withinId` children are SIBLING envelopes already in
            // this same slice — a reference, never ownership (C114 §8), so the parent
            // does not carry them.
            (spaceEnvelopes?.length ?? 0) +
            // C116 - counted like the others; a siteworks surface has no member
            // families and no legacy twin, so nothing here is double-counted.
            (siteworks?.length ?? 0);

        const snapshot: ProjectSnapshot = {
            schemaVersion: SNAPSHOT_SCHEMA_VERSION,
            timestamp: Date.now(),
            projectName: opts.projectName ?? 'Untitled Project',
            projectId: opts.projectId,
            versionLabel: opts.versionLabel,
            levels, grids, walls, windows, doors, slabs, columns,
            stairs, beams, curtainWalls, roofs, furniture, handrails,
            plumbing, openings, elementCount, rooms,
            lighting: lighting.length > 0 ? lighting : undefined,
            // Omitted entirely when nothing was authored, so a project with no
            // boundary lines produces a snapshot byte-identical to a pre-fix one.
            boundaryLines: boundaryLines.length > 0 ? boundaryLines : undefined,
            // §PERSIST103 (L-11520) — the five compound slices, each omitted entirely
            // when nothing was authored (C47): an untouched project's snapshot stays
            // byte-identical to a pre-fix one, so no `SNAPSHOT_SCHEMA_VERSION` bump and
            // no migration step. `undefined` (no such store on the runtime) and `[]`
            // (store present, empty) collapse to the SAME omission here — deliberately,
            // because for a snapshot both mean "this file records no lifts", and a
            // written `[]` would be the positive claim "the user deleted them all".
            lifts:      lifts?.length      ? lifts      : undefined,
            liftParts:  liftParts?.length  ? liftParts  : undefined,
            pools:      pools?.length      ? pools      : undefined,
            waters:     waters?.length     ? waters     : undefined,
            balconies:  balconies?.length  ? balconies  : undefined,
            // §PERSIST-BATHROOM-POD (L-11527) · C109 §8 — same omit-when-absent rule.
            bathroomPods: bathroomPods?.length ? bathroomPods : undefined,
            // §COMPONENT-PLACE (audit §12 Phase 4C · ADR-0376 D9) — THE JOIN, same
            // omit-when-absent rule (C47): a project with no placed components writes
            // a snapshot byte-identical to a pre-Phase-4C one.
            components: components?.length ? components : undefined,
            // §82.7-DEFINITIONS-TRAVEL-WITH-PROJECT — same omit-when-absent rule (C47).
            componentDefinitions: componentDefinitions.length ? componentDefinitions : undefined,
            // §FEAT-SPACE-ENVELOPE (L-12900) · C114 §9 — same omit-when-absent rule
            // (C47). `undefined` (no such store on the runtime) and `[]` (store
            // present, empty) collapse to the same omission here, deliberately: for a
            // SNAPSHOT both mean "this file records no envelopes", while the two stay
            // DISTINGUISHED at the read above so the warning arm can fire.
            spaceEnvelopes: spaceEnvelopes?.length ? spaceEnvelopes : undefined,
            // C116 9 - omit-when-absent (C47), so an untouched project's snapshot
            // stays byte-identical. `undefined` (no such store) and `[]` (store
            // present, empty) collapse to the same omission HERE deliberately, while
            // staying DISTINGUISHED at the read above so the C84 EI-6 warning can fire.
            siteworks: siteworks?.length ? siteworks : undefined,
            // §L-1057 — omitted entirely when nothing was authored, so an untouched
            // project's snapshot is byte-identical to a pre-fix one.
            curtainPanels: curtainPanels.length > 0 ? curtainPanels : undefined,
            roomBoundingLines: roomBoundingLines.length > 0 ? roomBoundingLines : undefined,
            ceilings: ceilings.length > 0 ? ceilings : undefined,
            ceilingSystemTypes: ceilingSystemTypes.length > 0 ? ceilingSystemTypes : undefined,
            floors: floors.length > 0 ? floors : undefined,
            floorSystemTypes: floorSystemTypes.length > 0 ? floorSystemTypes : undefined,
            slabSystemTypes: slabSystemTypes.length > 0 ? slabSystemTypes : undefined,
            wallSystemTypes: wallSystemTypes.length > 0 ? wallSystemTypes : undefined,
            handrailTypes: handrailTypes.length > 0 ? handrailTypes : undefined,
            // §M-H4 — custom door / window finish types
            doorSystemTypes:   doorSystemTypes.length   > 0 ? doorSystemTypes   : undefined,
            windowSystemTypes: windowSystemTypes.length > 0 ? windowSystemTypes : undefined,
            vgGovernance:    vgGovernanceStore.serialize()     as ProjectSnapshot['vgGovernance'],
            semanticTags:    semanticIndex.serialize()         as ProjectSnapshot['semanticTags'],
            viewDefinitions: viewDefinitionStore.serialize()   as ProjectSnapshot['viewDefinitions'],
            visibilityRules: visibilityRuleEngine.serialize()  as ProjectSnapshot['visibilityRules'],
            visibilityIntents: visibilityIntentStore.serialize() as ProjectSnapshot['visibilityIntents'],
            viewIntentInstances: viewIntentInstanceStore.serialize() as ProjectSnapshot['viewIntentInstances'],

            // Data Platform — Phase 4 (schema v2)
            // All three blocks are always written, even when empty, so MigrationEngine
            // never needs to backfill them on the next round-trip.
            hierarchy: {
                version: 1,
                nodes: hierarchyStore.serialize(),
            },
            templates: {
                version: 1,
                templates: templateStore.serialize(),
                assignments: templateAssignmentStore.serialize(),
            },
            elementCodes: ((): ProjectSnapshot['elementCodes'] => {
                const { codes, counters } = elementCodeStore.serialize();
                return { version: 1, codes, counters };
            })(),

            // §RATES157 (L-12503) — the 5D rate book (C47 additive-optional).
            // There is no in-memory rate store yet — `MedicionesBucket.ts` reads
            // and writes a per-project cache directly in `localStorage` under
            // `rateBookStorageKey(projectId)`. Reading that SAME key here is what
            // makes the rate book travel with the project instead of dying with
            // the browser it was typed in. Omitted entirely (never an empty stub)
            // when this browser holds nothing for the project, so an untouched
            // project's snapshot carries no `rates` key at all.
            rates: ((): ProjectSnapshot['rates'] => {
                // Guarded exactly like `ProjectLoader`'s existing localStorage reads:
                // this serializer also runs under `apps/editor/vitest.config.ts`
                // (`environment: 'node'`, `window` deliberately undefined), where a
                // bare `localStorage` reference does not exist. The SHAPING logic
                // itself (`deriveSnapshotRates`) is pure and lives in
                // `rateBookSnapshotSync.ts` so it is unit-testable without `window`.
                if (typeof window === 'undefined' || !window.localStorage) return undefined;
                const raw = window.localStorage.getItem(rateBookStorageKey(opts.projectId ?? null));
                return deriveSnapshotRates(raw);
            })(),

            // §MANUALENV159 (L-12640) — the user-supplied study-height decision(s) (C47
            // additive-optional). UNLIKE `rates` above, there IS an in-memory store already
            // (`userSuppliedStudyHeightState.ts`, kept live by `siteDispatch.ts`'s
            // `applyUserSuppliedStudyHeight`), so this reads it directly rather than reaching into
            // `localStorage` — no per-browser cache is involved at all. Omitted entirely (never an
            // empty stub) when nothing was ever typed this session, so an untouched project's
            // snapshot carries no `manualStudyHeight` key.
            manualStudyHeight: ((): ProjectSnapshot['manualStudyHeight'] => {
                const bySiteId = serializeUserSuppliedStudyHeights();
                return bySiteId ? { version: 1, bySiteId } : undefined;
            })(),

            // Phase D — D-1 (schema v3): Semantic graph relationships
            semanticGraph: semanticGraphManager.serialize(),

            // Phase G — G-1 (schema v4): Temporal graph (append-only mutation log)
            temporalGraph: temporalGraphManager.serialize(),

            // Phase G — G-3 (schema v4): Decision records (architect rationale)
            decisionRecords: decisionRecordStore.serialize(),

            // PV-05 (C70 I-INV-2) — §PV-05-APP-COPY. The C23 AI-lineage
            // substrate, on the copy of the serializer PRODUCTION actually
            // calls (initPersistence.ts:100). Written ONLY when the store is
            // wired: an unwired bootstrap omits the key rather than writing an
            // empty slice, because an empty slice overwriting a real audit log
            // is the claim "no AI ever touched this project" — a fabrication
            // (C75 §1.4).
            //
            // NOTE the condition is on the STORE's presence, never on row
            // COUNT. `provenanceStore.serialize()` emits all four arrays
            // unconditionally, so a wired-but-empty store writes
            // `{version, artefacts: [], edges: [], …}` — "this project
            // genuinely has no lineage" — which is a DIFFERENT VALUE from an
            // absent key ("this snapshot predates provenance persistence").
            // A `length > 0 ? … : undefined` here would collapse the two.
            provenance: provenanceStore
                ? provenanceStore.serialize()
                : undefined,

            // Phase L — L-1/L-2 (schema v5): TOMBSTONE.  The lifecycle /
            // maintenance stores were deleted at S70 D8 (SPEC-27 §4.3 +
            // ADR-030 Part D + ADR-0052 §B.7).  No bytes written here;
            // `lifecycle?` is re-introduced by the future `plugins/lifecycle/`
            // port.

            // Autonomous Auditor — Phase 0: Space-programme requirements brief
            requirements: ((): ProjectSnapshot['requirements'] => {
                const records = requirementStore.getAll().map(r => structuredClone(r as any));
                return { version: 1, records };
            })(),

            // Autonomous Auditor — Phase 3: Asset catalog
            assetCatalog: ((): ProjectSnapshot['assetCatalog'] => {
                const entries = assetCatalogStore.getAll().map(e => structuredClone(e as any));
                return { version: 1, entries };
            })(),

            // §31 Phase 2 — DXF/DWG underlays
            dxfOverlays: dxfOverlayStore.size() > 0
                ? dxfOverlayStore.serialize() as ProjectSnapshot['dxfOverlays']
                : undefined,

            // ADR-0346 / C13 §3.13 — LINKED MODELS (references only; see the type above)
            linkedModels: linkedModelStore.size() > 0
                ? linkedModelStore.serialize()
                : undefined,

            // Phase III — Sheets (SheetDefinition records, viewports)
            sheets: sheetStore.serialize() as ProjectSnapshot['sheets'],
            // L-10690 LEG 1 of 3 — the WRITE. Without this the store is right
            // and the work is still gone on reload (L-10700).
            titleBlocks: titleBlockStore.serialize() as ProjectSnapshot['titleBlocks'],

            // Phase III — Schedules (ScheduleDefinition records)
            schedules: scheduleStore.serialize() as ProjectSnapshot['schedules'],

            // #105 Materials Repository — user-created/uploaded materials
            userMaterials: userMaterialStore.serialize() as ProjectSnapshot['userMaterials'],

            // §ANN-A2 — Annotations + Dimensions (all AnnotationElement and DimensionElement)
            annotations: (() => {
                const snap = annotationStore.serialize();
                return (snap.annotations.length > 0 || snap.dimensions.length > 0)
                    ? snap as ProjectSnapshot['annotations']
                    : undefined;
            })(),

            // §ANN-TYPE-PERSIST — CUSTOM annotation system types. Built-ins are code and
            // are NOT emitted; re-emitting them would fork them on every load. This is the
            // hole `stairTypeStore` still has (custom stair types are silently lost on
            // save/load) and it was closed for annotations before shipping, not after.
            annotationSystemTypes: (() => {
                const snap = annotationSystemTypeStore.serialize();
                return snap.types.length > 0 ? snap as ProjectSnapshot['annotationSystemTypes'] : undefined;
            })(),

            // ANNOTATION-SYSTEM-AUDIT-2026 A4 — ConstraintRecord persistence.
            annotationConstraints: (() => {
                const snap = constraintStore.serialize();
                return snap.records.length > 0
                    ? snap as ProjectSnapshot['annotationConstraints']
                    : undefined;
            })(),

            // ANNOTATION-SYSTEM-AUDIT-2026 B8 — Per-view annotation hide list.
            annotationVisibility: (() => {
                const json = annotationVisibilityStore.toJSON();
                return Object.keys(json).length > 0 ? json : undefined;
            })(),

            // ANNOTATION-SYSTEM-AUDIT-2026 B9 — OBC uuid → annotationId bridge map.
            obcAnnotationMap: (() => {
                const snap = obcAnnotationAdapter.serialize();
                return snap.entries.length > 0
                    ? snap as ProjectSnapshot['obcAnnotationMap']
                    : undefined;
            })(),

            // A.R.3 (Revit round-trip · S55) — per-element IFC/Revit metadata. Emitted
            // only when the IfcMetaStore is wired AND non-empty, so projects with no
            // imported IFC/Revit content (the common case today) keep a byte-identical
            // snapshot. The store's serialize() returns { version, elements }.
            ifcElementMeta: (() => {
                if (!ifcMetaStore || ifcMetaStore.size() === 0) return undefined;
                return ifcMetaStore.serialize();
            })(),

            // §FIX-GIS-SITE-STATE-NOT-PERSISTED (L-188) — the C19 SiteModel (location,
            // parcel boundary, footprint, context buildings). Omitted when no site is
            // authored so non-GIS projects keep a byte-identical snapshot.
            site: site ?? undefined,

            // §L-545-SITE-CAPTURE-PROVENANCE (L-188 / L-489) — WHY `site` is what it
            // is. Without this, `site: undefined` cannot be distinguished from
            // `site: LOST`, and the reopen path treated the second as the first.
            // Always stamped from here on; readers must treat `undefined` as
            // "pre-L-545 snapshot, not recorded" rather than as `none`.
            siteCapture,
        };

        // L-334 / L-360 — stamp a stable content checksum into the snapshot so
        // LOAD can detect byte-corruption / truncation of the stored blob. Computed
        // LAST, over the fully-built snapshot with the `integrity` block AND the
        // volatile `versionLabel` excluded (the autosave path appends versionLabel
        // AFTER this stamp — excluding it is what stops the L-360 false-"corrupt"
        // that bricked a valid project). Round-trips through JSON.stringify/parse
        // unchanged, so a faithfully-saved project always re-verifies at LOAD.
        //
        // §L-8701 — the SAVE-side probe the L-8700 investigation did not have.
        // `computeSnapshotChecksumWithReport` returns the same digest plus the
        // members of the LIVE snapshot that `JSON.stringify` cannot persist at
        // all (function-valued, symbol-valued, `toJSON()`→undefined). Under the
        // v2 canonical form those no longer perturb the digest — but each one is
        // content silently dropped on EVERY save, and the whole reason L-8700
        // took a 21-character hex delta to diagnose is that nothing here could
        // name the member. Folded into the digest walk, so it costs one extra
        // array push/pop per node and no second traversal.
        const __integrityReport = computeSnapshotChecksumWithReport(snapshot);
        const integrity: SnapshotIntegrityMeta = {
            algo: INTEGRITY_ALGO,
            checksum: __integrityReport.checksum,
            schemaVersion: SNAPSHOT_SCHEMA_VERSION,
            // Omitted entirely when zero, so a clean snapshot stays byte-identical
            // to a pre-L-8701 one. `integrity` is excluded from the digest, so
            // adding this key cannot move any checksum.
            ...(__integrityReport.jsonInvisibleCount > 0
                ? { jsonInvisible: __integrityReport.jsonInvisibleCount }
                : {}),
        };
        snapshot.integrity = integrity;

        if (__integrityReport.jsonInvisibleCount > 0) {
            console.warn(
                `[ProjectSerializer] §L-8701 ${__integrityReport.jsonInvisibleCount} snapshot member(s) ` +
                `cannot be persisted by JSON.stringify and are DROPPED on save — ` +
                __integrityReport.jsonInvisible.map(m => `${m.path} (${m.kind})`).join(', ') +
                (__integrityReport.jsonInvisibleCount > __integrityReport.jsonInvisible.length
                    ? `, … (${__integrityReport.jsonInvisibleCount - __integrityReport.jsonInvisible.length} more)`
                    : ''),
            );
        }

        // §PROBE-SNAPSHOT-JOURNAL-WEIGHT (L-5821) — name the OTHER thing in here.
        //
        // This line has always reported the MODEL (elements, levels, walls…), which
        // reads as though the model were what the snapshot costs. It is not, and the
        // gap is not small: for a 264-element project the model serialises to ~0.1 MB
        // while the founder's stored 20-version container is ~35 MB (lane LOAD30,
        // 2026-08-22). The difference is `temporalGraph`, embedded WHOLE in every
        // snapshot — and nothing printed its size, so every reading of this log
        // silently attributed the payload to the elements it happened to name.
        //
        // Counts only (`.length`), never a `JSON.stringify` of the sub-tree: this
        // runs on the autosave path and a probe that measures by re-serialising the
        // largest member would BE the cost it reports. Paired with
        // `[ProjectLoader] TemporalGraph restored (…)` on open and the
        // `[VersionRepository] … persisted to IndexedDB (~N MB …)` line on write, a
        // single console paste now shows journal-in, journal-out and bytes-stored.
        const _tg = snapshot.temporalGraph;
        console.log(
            `[ProjectSerializer] Snapshot created: ${elementCount} elements, ` +
            `${levels.length} levels, ${walls.length} walls, ` +
            `${slabs.length} slabs, ${furniture.length} furniture ` +
            `(integrity ${integrity.checksum}) · temporalGraph ` +
            `${_tg?.mutations?.length ?? 0} mutations / ${_tg?.edges?.length ?? 0} edges`
        );

        return snapshot;
    }

    /** Stringify a snapshot — safe to call after serialize(). */
    static stringify(snapshot: ProjectSnapshot): string {
        // §PERF-SERIALIZE-COMPACT (L-131 P3a) — emit COMPACT JSON (no pretty-print
        // indent). At 80-apartment scale the snapshot is thousands of elements; the
        // former `JSON.stringify(snapshot, null, 2)` inserted ~2 spaces of indent +
        // a newline per node, inflating the payload with pure whitespace BEFORE it is
        // deflated + written to localStorage/IndexedDB (and re-compressed across the
        // 20-version history on every save). The on-disk format is JSON — parse() uses
        // `JSON.parse`, never a line/indent-sensitive reader — so dropping the indent
        // is byte-for-byte round-trip-safe and only shrinks the stored/compressed size.
        return JSON.stringify(snapshot);
    }

    /**
     * Parse a stored JSON string back to a ProjectSnapshot.
     *
     * Phase 3: integrates MigrationEngine so that snapshots at any prior
     * schemaVersion are automatically upgraded to SNAPSHOT_SCHEMA_VERSION
     * before being returned. The old warn-only path is replaced.
     */
    static parse(json: string): ProjectSnapshot {
        const raw = JSON.parse(json);

        if (MigrationEngine.needsMigration(raw)) {
            const fromV = MigrationEngine.getStoredVersion(raw);
            console.log(
                `[ProjectSerializer] Migrating snapshot: ` +
                `v${fromV} → v${SNAPSHOT_SCHEMA_VERSION}`
            );
        }

        return MigrationEngine.migrate(raw);
    }
}
