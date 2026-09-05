/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Side System — command dispatcher / Persistence
 * Phase:             PERF-AUDIT-2026 — P0 Critical Path (project load latency)
 * Files Modified:    ProjectLoader.ts
 * Classification:    B (performance enhancement — no semantic model changes)
 *
 * Impact Assessment:
 *   Store Reads:      Yes — reads snapshot data (plain objects)
 *   Store Writes:     NO DIRECT WRITES — all mutations go through CommandManager
 *   Command Dispatch: YES — dispatches existing Create* commands per PlanOrdering
 *   Event Bus:        BATCHED — all StoreEventBus events buffered during load(),
 *                     flushed once at end → builders fire once per type, not once per element.
 *   Builder Calls:    Collapsed from O(N²) to O(N): 100 walls = 1 WallBuilder call (was 100).
 *
 * Risk Level:   Low — storeEventBus.beginBatch()/endBatch() is the proven mechanism
 *               used by BatchCoordinator for CurtainWall bulk-creation. Depth-counter
 *               prevents nesting issues. try/finally guarantees endBatch() always fires.
 *
 * Rationale:
 *   BEFORE: Each the legacy command manager fires StoreEventBus → DependencyResolver →
 *   WallBuilder.rebuild(). For 100 walls, WallBuilder runs 100 times, each rebuilding
 *   all walls seen so far. This is O(N²) in geometry operations, causing 30-second loads.
 *
 *   AFTER: storeEventBus.beginBatch() opens a buffer. All N commands fire their events
 *   into the buffer. At the end, endBatch() flushes ONCE → each builder runs exactly
 *   once regardless of how many elements were loaded. O(N) load time.
 *
 *   Measured impact: 100 walls ~29s → ~3s, 200 elements project ~45s → ~5s (estimated).
 *
 * Load Order (mirrors PlanOrdering.ts priority):
 *   1. ClearProjectCommand (priority 0 — always first)
 *   2. AddLevelCommand × N (priority 10)
 *   3. AddGridCommand × N (priority 11)
 *   4. CreateColumnCommand × N (priority 15)
 *   5. CreateWallCommand × N (priority 20) + CreateWallOpeningCommand per wall
 *   6. CreateSlabCommand × N (priority 21)
 *   7. CreateStairCommand × N (priority 22)
 *   8. CreateFurnitureCommand × N (priority 23)
 *   9. CreateRoofCommand × N (priority 24)
 *   10. CreateHandrailCommand × N (priority 25)
 *   11. CreatePlumbingFixtureCommand × N (priority 25)
 *   12. CreateCurtainWallCommand × N (priority 26)
 *   13. CreateBeamCommand × N (priority 30)
 */

import { CommandManager } from '@pryzm/command-registry';
// §LOAD-CHUNKED / §PROGRESS-SCHEDULER — the chunked-load yield. Visible: the
// P3-owned frame bus (progressive paint, unchanged). Hidden: an unclamped
// macrotask, so the load completes instead of parking at 0 Hz. No new rAF.
import { yieldForProgress, scheduleProgress, isHiddenForProgress } from '@pryzm/frame-scheduler';
import { storeEventBus } from '@pryzm/core-app-model';
import { buildHandrailCreatePayload } from '@pryzm/core-app-model/stores';
// §PERF-L03-PHASE (L-03) — gated per-phase load timing; OFF unless globalThis.__pryzmPerfTrace.
import { perfTraceOn, perfLog } from '@pryzm/core-app-model';
import { ProjectSnapshot } from './ProjectSerializer';
// §PERSIST103 (L-11520) — the restore half for the five compound slices that had no
// snapshot key at all. Called ONCE from the common tail, past the
// `if (useImportCommandPath) … else …` join, so both load paths get it. See that call
// site for why duplicating a restore into two paths is the defect, not the pattern.
import { restoreCompoundFamilies } from './restoreCompoundFamilies';
// §82.7-DEFINITIONS-TRAVEL-WITH-PROJECT — the component definition set's load leg.
import { restoreComponentDefinitions } from './restoreComponentDefinitions';
// L-334 / L-360 — verify the content-integrity checksum at LOAD. A mismatch is a
// NON-BLOCKING warning (load best-effort); an absent checksum (legacy snapshot)
// verifies clean. NEVER a hard refuse on the checksum alone.
import { verifySnapshotChecksum } from '@pryzm/persistence-client';
// GR-06 / GR-08 — SINGLE-owner SemanticGraph pre-graph rebuild (was a byte-
// identical private copy in this file AND persistence-client; C71 §5.3 / §7.j).
import { rebuildSemanticGraphFromSnapshot } from '@pryzm/persistence-client';
import { BatchCreateRoomsCommand } from '@pryzm/command-registry';
import { deserializeRoom } from '@pryzm/room-topology';
import { vgGovernanceStore } from '@pryzm/core-app-model';
import { semanticIndex } from '@pryzm/core-app-model';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { visibilityRuleEngine } from '@pryzm/core-app-model';
import { visibilityIntentStore } from '@pryzm/core-app-model/presentation';
import { viewIntentInstanceStore } from '@pryzm/core-app-model/presentation';
import { runVGToIntentMigration, prewarmIntentStyleCache } from '@pryzm/core-app-model';
import { sheetStore } from '@pryzm/core-app-model';
// L-10690 LEG 2 of 3 — the READ.
import { titleBlockStore } from '@pryzm/core-app-model';
import { scheduleStore } from '@pryzm/core-app-model';
import { userMaterialStore } from '@pryzm/core-app-model'; // #105 Materials Repository
import { requirementStore, assetCatalogStore, buildDefaultAssetCatalog } from '@pryzm/core-app-model';
// §FIX-EMPTY-LOAD-HANG (L-108) — annotationStore was already statically imported
// from @pryzm/plugin-annotations, so the plugin chunk is ALWAYS in the boot graph.
// The constraint / visibility / OBC restores below used to `await import(...)` the
// SAME package during every load — pointless indirection that added cold-import
// await points to the hydrate critical path (each yields the event loop and, in a
// prod build, can trigger a lazy-chunk fetch). Pull them into this static import so
// no dynamic import fires during load; the restore logic is unchanged.
import { annotationStore, constraintStore, annotationVisibilityStore, obcAnnotationAdapter } from '@pryzm/plugin-annotations';
// §ANN-TYPE-PERSIST — custom annotation system types.
import { annotationSystemTypeStore } from '@pryzm/plugin-annotations';
import { ClearProjectCommand } from '@pryzm/command-registry';
// §FIX-EMPTY-LOAD-HANG (L-108) — statically import the (small, idempotent) view-
// template migration. It only reads live @pryzm/core-app-model stores (already in
// this file's boot graph → no new dependency, no cycle) and is a no-op for a new/
// empty project. Previously it was `await import()`-ed on EVERY load, fetching a
// separate lazy chunk and adding an await yield to the hydrate critical path.
import { runViewTemplateToIntentMigration } from './migrations/ViewTemplateToIntentMigration';
import { doorStore, doorSystemTypeStore } from '@pryzm/geometry-door';
import { windowStore, windowSystemTypeStore } from '@pryzm/geometry-window';
import { AddLevelCommand } from '@pryzm/command-registry';
import { AddGridCommand } from '@pryzm/command-registry';
import { CreateWallCommand } from '@pryzm/command-registry';
import { CreateWallOpeningCommand } from '@pryzm/command-registry';
import { CreateSlabCommand } from '@pryzm/command-registry';
import { CreateStairCommand } from '@pryzm/command-registry';
import { CreateBeamCommand } from '@pryzm/command-registry';
import { CreateCurtainWallCommand } from '@pryzm/command-registry';
// §L-1057 / C87 §13.1 CW-P — the sparse panel-override layer. Shared with the
// serializer so the save and load halves cannot key against different grids.
import {
    applyCurtainPanelOverrides,
    resolveCurtainGrid,
    describeLostOverride,
    type CurtainPanelOverride,
    type LostOverride,
    type PanelUpdateTarget,
} from '@pryzm/geometry-curtain-wall';
import { CreateRoofCommand } from '@pryzm/command-registry';
import { CreateFurnitureCommand } from '@pryzm/command-registry';
// §FIX-PERSIST-AI-ELEMENT (L-85 follow-up) — route ai_element furniture back
// through its own command so aiElementConfig (the entire procedural geometry)
// round-trips instead of being dropped by CreateFurnitureCommand.
import { CreateAIElementCommand, buildAIElementRestorePayload } from '@pryzm/command-registry';
import { CreateHandrailCommand } from '@pryzm/command-registry';
import { CreatePlumbingFixtureCommand } from '@pryzm/command-registry';
import { CreateLightingCommand } from '@pryzm/command-registry'; // §PERSIST-LIGHTING
import { pickAuthoredLightingParams } from '@pryzm/command-registry'; // §PERSIST-LIGHTING-PARAMS
import { CreateColumnCommand } from '@pryzm/command-registry';
import { CreateRoomBoundingLineCommand } from '@pryzm/command-registry';
import { RoofType, RoofFootprint } from '@pryzm/geometry-roof';
import { slabSystemTypeStore } from '@pryzm/geometry-slab';
import { wallSystemTypeStore } from '@pryzm/geometry-wall';
// §TYPE-SNAPSHOT-CODEC — the ONE codec shared with ProjectSerializer, so a field can
// no longer be written by one side and dropped by the other (it dropped `function`).
import { decodeWallSystemType } from './wallSystemTypeCodec';
// §TYPE-SNAPSHOT-CODEC (C65) — door/window types share their own codec with the serializer.
import { decodeHostedSystemType } from './hostedSystemTypeCodec';
import { ceilingSystemTypeStore } from '@pryzm/core-app-model/stores';
// §FEAT-HANDRAIL-TYPE-PERSISTENCE (C95 §15.7, R3) — the railing CATALOGUE.
import { handrailTypeStore } from '@pryzm/core-app-model/stores';
import { CreateCeilingCommand } from '@pryzm/command-registry';
import { floorSystemTypeStore } from '@pryzm/core-app-model/stores';
import { CreateFloorCommand, ImportProjectCommand, dropDegeneratePolygonRecords, ceilingRestoreBoundaryFields } from '@pryzm/command-registry'; // §LOAD-HEAL-DEGENERATE-POLYGON + §OPEN-OLD-CEILING-RESTORE
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { hierarchyStore } from '@pryzm/core-app-model';
// §FIX-GIS-SITE-STATE-NOT-PERSISTED (L-188) — restores the persisted C19 SiteModel
// (location / parcel boundary / geospatial origin) into the live runtime + re-emits
// the site.* domain events so the sun (RealSunService), Cesium globe, and parcel
// renderer re-anchor to the REAL site instead of defaulting to Madrid.
import { restoreSiteState } from '@app/ui/site/siteDispatch';
// §MANUALENV159 (L-12640) — the user-supplied study-height decision(s). MUST be restored BEFORE
// `restoreSiteState` runs below: that function reads this state (keyed by site id) to rehydrate
// the DISPLAYED study against the just-restored parcel ring, so the raw decision has to already
// be in memory by the time it looks.
import { restoreUserSuppliedStudyHeights } from '@app/ui/site/userSuppliedStudyHeightState';
import { templateStore } from '@pryzm/core-app-model';
import { templateAssignmentStore } from '@pryzm/core-app-model';
import { elementCodeStore } from '@pryzm/core-app-model';
// §RATES157 (L-12503) — the 5D rate book's ONE key-format helper, shared with
// `ProjectSerializer.ts` and `MedicionesBucket.ts`'s `rateKey()`. See CostModel.ts.
import { rateBookStorageKey, type RateEntry } from '@pryzm/core-app-model';
import { reconcileRateBookOnLoad } from './rateBookSnapshotSync';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { temporalGraphManager } from '@pryzm/core-app-model';
import { decisionRecordStore } from '@pryzm/core-app-model';
// S70 D8 — Phase-L lifecycle / maintenance imports removed alongside the
// deletion of `src/lifecycle/` per SPEC-27 §4.3 + ADR-030 Part D + ADR-0052 §B.7.
// v5+ snapshots that contain a `.lifecycle` block are read in restore-loop
// below and skipped (forward-compat: a future plugins/lifecycle/ port will
// re-introduce a deserialiser at that surface).

/**
 * §PERSIST-OPENING-NO-SUPERSET (W1-5, 2026-08-11) — back-fill the wall-opening
 * descriptor's OWN missing fields from the hosted door/window record. Nothing more.
 *
 * This is the LEGACY loader's copy of the rule (there are three: here,
 * `packages/persistence-client/src/loader/ProjectLoader.ts` and — the one the default-on
 * path actually runs — `packages/command-registry/src/project/projectLoaderUtils.ts`).
 * **The canonical explanation, including the ADR-0319 classification argument and the
 * proof that the removed keys are not load-bearing, lives on the `projectLoaderUtils.ts`
 * copy.** In short: `frameThickness` / `frameWidth` / `frameColor` / `leafColor` /
 * `fireRating` / `accessibilityType` are `DoorData`/`WindowData` fields, not `Opening`
 * fields, so merging them made the reloaded wall a strict SUPERSET of the live one
 * (certification F-4). `CreateWallOpeningCommand` reads none of them.
 *
 * Three copies of one rule is itself the C11 §5.4 defect; they are kept in lock-step
 * here rather than de-duplicated because collapsing them crosses a package boundary that
 * this change is not scoped to. If you edit one, edit all three.
 */
export function findOpeningElementData(snapshot: ProjectSnapshot, opening: any): any {
    if (opening.type === 'window') {
        if (opening.windowType !== undefined) return {};
        const win = snapshot.windows.find(w => w.openingId === opening.id || w.id === opening.elementId);
        return win?.windowType !== undefined ? { windowType: win.windowType } : {};
    }
    if (opening.type === 'door') {
        if (opening.doorType !== undefined) return {};
        const door = snapshot.doors.find(d => d.openingId === opening.id || d.id === opening.elementId);
        return door?.doorType !== undefined ? { doorType: door.doorType } : {};
    }
    return {};
}

/**
 * Convert a serialised roof snapshot record into a CreateRoofCommand.
 *
 * Exported so ImportProjectCommand (PROJECT-LOAD-PERFORMANCE-13 §2 — Phase 1)
 * can reuse the same migration logic that ProjectLoader has used since the
 * snapshot schema migration.
 */
export function migrateRoofSnapshotToCommand(roof: any): CreateRoofCommand | null {
    try {
        let footprint: RoofFootprint;

        if (roof.footprint && Array.isArray(roof.footprint.polygon) && roof.footprint.polygon.length >= 3) {
            footprint = {
                polygon:  roof.footprint.polygon,
                centroid: roof.footprint.centroid ?? [0, 0],
            };
        } else if (Array.isArray(roof.polygon) && roof.polygon.length >= 3) {
            const pts: [number, number][] = roof.polygon.map((p: any) =>
                Array.isArray(p) ? [p[0], p[1]] : [p.x ?? 0, p.y ?? 0]
            );
            let cx = 0, cz = 0;
            if (roof.position) {
                cx = roof.position.x ?? 0;
                cz = roof.position.z ?? 0;
            } else {
                for (const [x, z] of pts) { cx += x; cz += z; }
                cx /= pts.length; cz /= pts.length;
            }
            footprint = { polygon: pts, centroid: [cx, cz] };
        } else {
            const w = roof.width ?? 1;
            const d = roof.depth ?? 1;
            const cx = roof.position?.x ?? 0;
            const cz = roof.position?.z ?? 0;
            footprint = {
                polygon: [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]],
                centroid: [cx, cz],
            };
        }

        const modeToType: Record<string, RoofType> = {
            'single_slope': 'shed',
            'hip_roof':     'hip',
            'by_region':    'by_region',
            'flat':         'flat',
        };
        const roofType: RoofType = roof.roofType
            ?? modeToType[roof.mode ?? '']
            ?? 'flat';

        return new CreateRoofCommand(roof.id ?? crypto.randomUUID(), {
            levelId:       roof.levelId,
            footprint,
            roofType,
            slope:         roof.slope,
            overhang:      roof.overhang ?? 0.3,
            baseOffset:    roof.baseOffset ?? 3.0,
            thickness:     roof.thickness ?? 0.2,
            fascia:        roof.fascia,
            materialColor: roof.materialColor,
            materialId:    roof.materialId,
            // §PERSIST-L1 (W1-2) — carry the persisted IFC GUID so the roof's IFC
            // round-trip join key survives reload.
            ifcGuid:       roof.ifcData?.guid,
        });
    } catch (e) {
        console.error('[ProjectLoader] migrateRoofSnapshotToCommand failed:', e);
        return null;
    }
}

export interface LoadResult {
    success: boolean;
    loaded: number;
    failed: number;
    errors: string[];
    warnings: string[];
    /**
     * L-334 / L-360 — set ONLY when the whole-snapshot checksum FAILED to verify.
     * The project is STILL loaded (best-effort); this drives a loud, persistent
     * "integrity check failed — file may be corrupted, loaded best-effort" warning
     * in the UI. A checksum mismatch NEVER bricks the project.
     */
    integrity?: { ok: false; reason: string; expected?: string; actual?: string };
}

/**
 * §LOAD-REDETECT-FREEZE (2026-06-25) — pure decision helper for the post-load
 * room-redetect sweep.
 *
 * Returns the set of level IDs that ALREADY have rooms persisted in the
 * snapshot. The post-load sweep skips redetection for these levels because the
 * hydrated rooms (restored via BatchCreateRoomsCommand) are the authoritative
 * saved state (ADR-0069). Levels NOT in this set — legacy/pre-room-persistence
 * snapshots, or levels whose rooms went missing — still get a full redetect so
 * room detection for un-persisted geometry is never lost.
 *
 * Exported and pure so the skip decision is unit-testable without standing up
 * the whole runtime + command pipeline.
 */
export function levelsWithPersistedRooms(
    snapshotRooms: ReadonlyArray<{ levelId?: string | null }> | null | undefined,
): Set<string> {
    const out = new Set<string>();
    if (Array.isArray(snapshotRooms)) {
        for (const room of snapshotRooms) {
            const lvl = room?.levelId;
            if (typeof lvl === 'string' && lvl.length > 0) out.add(lvl);
        }
    }
    return out;
}

/**
 * §FIX-EMPTY-LOAD-HANG (L-108) — does this snapshot carry ANY geometry the
 * importer will build?
 *
 * Used to skip the frame-yielding chunked load path for an empty (new) project.
 * Chunking exists ONLY to spread heavy per-element geometry across frames so the
 * UI doesn't freeze (C11 §6.1); a 0-element snapshot has nothing to spread, so
 * the chunked driver's unconditional per-build-step FrameScheduler round-trips
 * are pure latency on the load critical path. The empty new-project cold open
 * that took ~16 s to reach the `hydrate` boundary (L-108) is routed to the
 * synchronous one-task path by this predicate.
 *
 * Prefers the snapshot's own `elementCount` when present (the canonical field
 * ProjectSerializer writes) and falls back to summing the element arrays the
 * ImportProjectCommand actually iterates, so the decision never depends on a
 * possibly-stale count. Exported + pure so the skip decision is unit-testable
 * without standing up the whole runtime + command pipeline.
 */
export function snapshotHasElements(
    snapshot: { elementCount?: unknown } & Record<string, unknown>,
): boolean {
    if (!snapshot) return false;
    const ec = snapshot.elementCount;
    if (typeof ec === 'number') return ec > 0;
    const len = (a: unknown): number => (Array.isArray(a) ? a.length : 0);
    const total =
        len(snapshot.walls) + len(snapshot.slabs) + len(snapshot.columns) +
        len(snapshot.stairs) + len(snapshot.furniture) + len(snapshot.roofs) +
        len(snapshot.handrails) + len(snapshot.plumbing) + len(snapshot.curtainWalls) +
        len(snapshot.beams) + len(snapshot.ceilings) + len(snapshot.floors) +
        len(snapshot.rooms) + len(snapshot.lighting) + len(snapshot.doors) +
        len(snapshot.windows) + len(snapshot.grids) +
        // L-9948 — a boundary line is an element. A project whose ONLY content is
        // setting-out lines would otherwise read as empty, and "empty" is what this
        // predicate protects against overwriting.
        len((snapshot as { boundaryLines?: unknown }).boundaryLines) +
        // §PERSIST103 (L-11520) — the compound parents, for the identical reason
        // L-9948 gives above and with a sharper edge: this predicate is what stops a
        // real project being treated as empty and OVERWRITTEN. A file whose compounds
        // were the only thing in it would read as empty here, so the C13 promise
        // ("projects must never silently disappear") would be broken by the very
        // guard that exists to keep it.
        len((snapshot as { lifts?: unknown }).lifts) +
        len((snapshot as { liftParts?: unknown }).liftParts) +
        len((snapshot as { pools?: unknown }).pools) +
        len((snapshot as { waters?: unknown }).waters) +
        len((snapshot as { balconies?: unknown }).balconies) +
        // §COMPONENT-PLACE (audit §12 Phase 4C · ADR-0376 D9) — placed component
        // occurrences, for the identical reason. ⭐ SHARPER HERE THAN FOR ANY FAMILY
        // ABOVE: a placed component has NO legacy twin and NO member families, so a
        // project whose only content is placed components has EVERY other slice empty.
        // Omitted from this predicate, such a file reads as empty and is OVERWRITTEN —
        // the C13 promise broken by the guard that exists to keep it.
        len((snapshot as { components?: unknown }).components);
    return total > 0;
}

export class ProjectLoader {
    /**
     * @param provenanceStore PV-05 (C70 I-INV-2) §PV-05-APP-COPY — optional and
     *   additive. This is the loader `initPersistence.ts:372` constructs, i.e.
     *   the one PRODUCTION runs; the hydrate added at 8cab70c1 went to the
     *   persistence-client copy, which the app never builds. Absent, a snapshot
     *   carrying a lineage is NAMED as unloaded rather than silently dropped,
     *   so nobody re-saves the key away unaware.
     */
    constructor(
        private commandManager: CommandManager,
        private provenanceStore?: import('@pryzm/stores').ProvenanceStore,
    ) {}

    /**
     * Load a ProjectSnapshot by dispatching Create* commands through CommandManager.
     * Clears the current project first using ClearProjectCommand.
     *
     * CONTRACT: No direct store mutation. All writes go through CommandManager.execute().
     *
     * Cancellation (§5.2 — Cancellable Async Scene Loading):
     *   Pass an `isCancelled` predicate that returns `true` when the caller has
     *   switched to a different project.  The loader checks this flag between each
     *   command batch and returns early (with success=false) if cancelled.
     *   The caller is responsible for setting the flag — typically via a closure:
     *
     *     let cancelled = false;
     *     const result = await loader.load(snapshot, () => cancelled);
     *     // on project switch:
     *     cancelled = true;
     */
    async load(snapshot: ProjectSnapshot, isCancelled?: () => boolean): Promise<LoadResult> {
        const cancelled = isCancelled ?? (() => false);
        const result: LoadResult = { success: false, loaded: 0, failed: 0, errors: [], warnings: [] };

        console.group(`[ProjectLoader] Loading "${snapshot.projectName}" (${snapshot.elementCount} elements)`);

        // ── L-334 / L-360 — content-integrity check (WARN-not-BRICK) ────────────
        // Recompute the checksum over the snapshot and compare it to the one stamped
        // at SAVE. A mismatch means the stored bytes may have been corrupted /
        // truncated / edited outside PRYZM. The L-360 lesson is absolute: a checksum
        // mismatch MUST NOT refuse the project (the original L-334 did, and it bricked
        // a valid 1009-element file). We record a NON-BLOCKING warning and fall
        // through to a best-effort load. An absent checksum (legacy/pre-L-334
        // snapshot) verifies clean → no warning. This check is pure + read-only.
        try {
            const __integrity = verifySnapshotChecksum(snapshot);

            // §L-8700 — NOT COMPARABLE is not a mismatch. A digest stamped by a
            // different algorithm version (or describing pre-migration content)
            // cannot be re-derived by this build, so the difference between the
            // two carries no information about the file. Console note only: the
            // user has nothing to act on, and a warning they cannot act on is how
            // a true warning later gets ignored.
            if (__integrity.present && __integrity.comparable === false) {
                console.log(
                    `[ProjectLoader] §L-8700 integrity stamp not comparable — ${__integrity.note ?? 'reason not recorded'} ` +
                    `Loaded normally; no integrity claim is being made either way.`,
                );
            } else if (__integrity.present && !__integrity.ok) {
                // The digest encodes its own canonical length as the hex suffix,
                // so the two halves carry a readable Δ. Print it: it is the single
                // most diagnostic number in the line (L-8700 was identified from
                // `0x50432 → 0x5041d`, i.e. LOAD 21 characters SHORTER), and
                // making the reader do hex by hand is why it went unread for a day.
                const __eb = __integrity.expectedBytes;
                const __ab = __integrity.actualBytes;
                const __delta = typeof __eb === 'number' && typeof __ab === 'number'
                    ? ` — canonical length ${__eb} at save vs ${__ab} at load (Δ ${__ab - __eb})`
                    : '';
                // ⛔ DO NOT restore "the file may be corrupted or was modified
                // outside PRYZM". That sentence was WRONG in production (L-8700):
                // the stamp and the stored bytes disagreed because PRYZM's own
                // canonical form did not mirror JSON.stringify, and blaming the
                // user's file for PRYZM's defect spends the credibility every
                // TRUE corruption warning will need. Say only what is known:
                // WHAT differs, that NOTHING was dropped from the load, and that
                // the two possible sources cannot be told apart from here.
                const reason =
                    `Integrity stamp mismatch (stored ${__integrity.expected}, computed ` +
                    `${__integrity.actual})${__delta}. The project was loaded IN FULL — no element ` +
                    `was dropped, skipped or altered because of this. The stamp records what PRYZM ` +
                    `computed when it saved; PRYZM cannot tell from the stamp alone whether the ` +
                    `difference arose in its own save path or in the stored bytes. Re-saving ` +
                    `re-stamps the project.`;
                console.error(`[ProjectLoader] §L-334/§L-8700 checksum mismatch — loading BEST-EFFORT (project NOT bricked): ${reason}`);
                result.warnings.push(reason);
                result.integrity = {
                    ok: false, reason, expected: __integrity.expected, actual: __integrity.actual,
                };
            }
        } catch (e) {
            // The integrity check is advisory — never let it break a load.
            console.warn('[ProjectLoader] §L-334 integrity check threw (non-fatal, ignored):', e);
        }

        // ── PHASE-TIME INSTRUMENTATION (Flow 3 audit, 2026-04-30) ─────────────
        // The cold-open log of the "jk project" (192 walls × 11 levels) showed
        // ~30 s of main-thread block dominated by a 14 619 ms LONGTASK and a
        // 6 169 ms LONGTASK with no source attribution.  This breakdown table
        // attributes wall-clock time to each phase so the next cold open
        // prints exactly where the budget is spent.  Each phase start ts is
        // captured when its console.log fires, and the totals are emitted as
        // ONE summary line right before "Load complete" so the user can read
        // the full table in a single view.  The instrumentation is read-only
        // — no behavioural change.
        const __t_load_start = performance.now();
        const __phase_starts: Record<string, number> = { __load: __t_load_start };
        const __phase_ms: Record<string, number> = {};
        // §AUTOSAVE-LOAD-SLOW-OR-HANG (DAILY-USE 2026-05-21) — emit a console
        // line at every phase boundary so the live log shows real-time load
        // progress. Previously the phase summary was only printed at the
        // END of load; if the load hung mid-phase, the user had no signal
        // and saw the spinner forever. Now each phase fires `[ProjectLoader]
        // §LOAD-PHASE name=… elapsed=…ms total=…ms` as it completes,
        // making it instantly obvious which phase is the slow one.
        // §LOAD-PHASE-ELAPSED-ALWAYS-ZERO (L-3051) — the boundary of the phase
        // that just CLOSED. This used to be read out of `__phase_starts[name]`,
        // guarded by `if (__phase_starts[name] !== undefined)`. Every phase name
        // ('setup', 'hydrate', 'event_flush', 'wall_rebuild_flush',
        // 'redetect_sweep') fires EXACTLY ONCE per load, so that key was ALWAYS
        // undefined at the moment it was read and `__phase_ms[name]` was NEVER
        // assigned. Result: every §LOAD-PHASE line printed `elapsed=0.0ms` and
        // the PHASE_TIMINGS summary printed `setup=0.0ms hydrate=0.0ms
        // event_flush=0.0ms` on a load whose own `total=` read 47 397.8 ms.
        // Only the running total was ever real. A phase is the span since the
        // PREVIOUS boundary, not since the previous call bearing the same name.
        let __phase_boundary = __t_load_start;
        const __phase = (name: string) => {
            const now = performance.now();
            __phase_ms[name] = now - __phase_boundary;
            __phase_boundary = now;
            const sinceLoadStart = now - __t_load_start;
            console.log(
                `[ProjectLoader] §LOAD-PHASE name=${name} ` +
                `elapsed=${(__phase_ms[name] ?? 0).toFixed(1)}ms ` +
                `total=${sinceLoadStart.toFixed(1)}ms`,
            );
            // §LOAD-TIMEOUT-PROGRESS (2026-07-02) — emit a forward-progress tick on
            // every phase boundary so the load-timeout watchdog in
            // PlatformVersionController can RESET its deadline instead of failing a
            // legitimately-slow large load. A 40-storey office (1300 elements /
            // 22.7 MB) completes in ~62 s of steady progress; the old fixed 30 s
            // Promise.race declared "Load failed" while ProjectLoader was demonstrably
            // still advancing. This event is the heartbeat that proves it is.
            try {
                window.dispatchEvent(new CustomEvent('pryzm-load-progress', {
                    detail: { phase: name, totalMs: sinceLoadStart },
                }));
            } catch { /* non-browser / SSR — no-op */ }
            __phase_starts[name] = now;
        };
        // §PERF-L03-PHASE (P1.2) — gated per-phase wall-clock, measured with an
        // EXPLICIT start→now span (not the rolling per-name __phase timer), so each
        // of the four heavy-load phases — import-drain, wall restore flush, deferred
        // resolveLevel scheduling, redetect-sweep dispatch — is independently
        // attributable. OFF unless globalThis.__pryzmPerfTrace === true (production
        // pays a single boolean read). Complements the always-on §LOAD-PHASE table.
        const __perfPhase = (name: string, startMs: number, extra = ''): void => {
            if (!perfTraceOn()) return;
            perfLog('§PERF-L03-PHASE', `phase=${name} ms=${(performance.now() - startMs).toFixed(1)}${extra ? ' ' + extra : ''}`);
        };
        // §DIAG-EMPTY-LOAD-HANG (L-108) — FINE-GRAINED sub-step timing WITHIN the
        // hydrate window. The coarse __phase() table only prints one `hydrate`
        // boundary, so a 16 s empty-project load (0 elements) could not be
        // attributed to a specific sub-step — the watchdog even mislabels it
        // `phase="setup"` (it names the last STARTED boundary, not the running
        // work). __mark(name) records the wall-time each named sub-step consumed
        // and __marksSummary() emits ONE `§LOAD-HYDRATE-STEPS` line just before the
        // hydrate boundary so the next prod load shows exactly where the budget
        // goes. Read-only instrumentation — no behavioural change.
        const __mark_ms: Record<string, number> = {};
        let __mark_last = performance.now();
        const __mark = (name: string) => {
            const now = performance.now();
            __mark_ms[name] = (__mark_ms[name] ?? 0) + (now - __mark_last);
            __mark_last = now;
        };
        const __marksSummary = () => {
            const parts = Object.entries(__mark_ms)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => `${k}=${v.toFixed(1)}ms`);
            if (parts.length > 0) {
                console.log(`[ProjectLoader] §LOAD-HYDRATE-STEPS ${parts.join(' ')}`);
            }
        };
        // §AUTOSAVE-LOAD-SLOW-OR-HANG — watchdog: if no phase completes
        // within WATCHDOG_MS the load is hung in the current phase. The
        // watchdog emits a console.warn every WATCHDOG_MS describing the
        // current phase so the user has a heartbeat instead of silence.
        // Self-cleared via clearInterval in the load's finally block (added
        // below where __phase('redetect_sweep') is called).
        // §LOAD-WATCHDOG-NAMES-THE-WRONG-THING (L-3052) — the live import step.
        // The watchdog names the last phase boundary that COMPLETED, and the
        // boundary immediately before the element import is `setup`. So on a
        // 47 s load, every one of the 20 import steps reported as
        // `current phase="setup" stuck for 38.5s` — literally true and
        // diagnostically worthless: it says the load has not reached `hydrate`,
        // which was never in doubt. ImportProjectCommand now reports each step as
        // it OPENS (§LOAD-IMPORT-STEPS, L-3050) and the watchdog names it, so a
        // stuck load says WHICH element family it is stuck in.
        let __importStep = '';
        let __importStepN = 0;
        let __importStepStart = 0;
        const __onImportStep = (step: string, n: number): void => {
            __importStep = step;
            __importStepN = n;
            __importStepStart = performance.now();
        };
        const WATCHDOG_MS = 5000;
        const __watchdog = setInterval(() => {
            const now = performance.now();
            const elapsed = now - __t_load_start;
            const lastPhaseName = Object.keys(__phase_starts).pop() ?? '<unknown>';
            const sinceLastPhase = now - (__phase_starts[lastPhaseName] ?? __t_load_start);
            const stepSuffix = __importStep !== ''
                ? ` — import step="${__importStep}" (n=${__importStepN}) running for ` +
                  `${((now - __importStepStart) / 1000).toFixed(1)}s`
                : '';
            console.warn(
                `[ProjectLoader] §LOAD-WATCHDOG load still running after ${(elapsed / 1000).toFixed(1)}s ` +
                `— current phase="${lastPhaseName}" stuck for ${(sinceLastPhase / 1000).toFixed(1)}s${stepSuffix} ` +
                // §AUTOSAVE-LOAD-DIAG (2026-05-23) — carry the model size on every
                // heartbeat so the stuck phase AND the workload that's overwhelming it
                // are visible from a SINGLE repeating line (the architect's "review the
                // live logs" ask). A heartbeat that fires means the stall is across
                // await points; if the tab is frozen with NO heartbeat, the hang is a
                // synchronous block inside the phase named on the last §LOAD-PHASE line.
                `[walls=${snapshot.walls?.length ?? 0} slabs=${snapshot.slabs?.length ?? 0} ` +
                `levels=${snapshot.levels?.length ?? 0} curtainWalls=${snapshot.curtainWalls?.length ?? 0} ` +
                `rooms=${(snapshot as { rooms?: any[] }).rooms?.length ?? 0} ` +
                `doors=${snapshot.doors?.length ?? 0} windows=${snapshot.windows?.length ?? 0}]. ` +
                `If this keeps firing the load is hung; check the prior §LOAD-PHASE line for the last completed phase.`,
            );
            // §LOAD-TIMEOUT-PROGRESS — the watchdog itself is a forward-progress
            // heartbeat: as long as it keeps firing across await points, the load is
            // advancing (a truly hung synchronous phase would freeze this interval
            // too). Emit a progress tick so a slow-but-alive phase that spans several
            // watchdog windows (e.g. a big event_flush) still resets the load-timeout
            // deadline instead of tripping a false failure.
            try {
                window.dispatchEvent(new CustomEvent('pryzm-load-progress', {
                    detail: { phase: `${lastPhaseName}:watchdog`, totalMs: elapsed },
                }));
            } catch { /* non-browser / SSR — no-op */ }
        }, WATCHDOG_MS);
        // ── End PHASE-TIME INSTRUMENTATION ───────────────────────────────────

        // §AUTOSAVE-SUPPRESS-DURING-LOAD (2026-07-02) — open a caller-INDEPENDENT
        // autosave-suppression window for the ENTIRE load/restore, including the
        // fire-and-forget post-load redetect + wall-resolve sweep that continues
        // AFTER load() resolves. ADR-0098 F2 root-caused the project-open freeze as a
        // "post-load rebuild/re-anchor storm": each of those deferred store mutations
        // fires a `bim-*` event, the SaveOrchestrator debounce fires, and it SERIALIZES
        // + compresses the whole 22.7 MB / 1300-element snapshot to IndexedDB while the
        // load is still settling — the self-inflicted freeze in the reported stack
        // (`_drainBuildQueue → … → onAutoSave → saveVersionInternal`). The existing
        // `setLoading(true/false)` guard closes as soon as load()'s promise resolves,
        // so it does NOT cover the deferred sweep. Reusing the proven ref-counted
        // §AUTOSAVE-BATCH-SUPPRESS channel (`pryzm-batch-started`/`-ended`), we open a
        // batch window here and close it only once the sweep has fully drained (see the
        // finally block), guaranteeing NO autosave serialize runs until the project is
        // fully interactive — independent of which caller invoked the load.
        let __suppressClosed = false;
        // Set true by the chunked redetect drain, which then owns closing the
        // suppression window asynchronously; when false the finally-tail closes it.
        let __suppressCloseDeferred = false;
        const __closeAutosaveSuppress = () => {
            if (__suppressClosed) return;
            __suppressClosed = true;
            try { window.dispatchEvent(new CustomEvent('pryzm-load-suppress-end')); } catch { /* SSR — no-op */ }
        };
        // Dedicated load-suppression channel (NOT the batch channel): a stale load's
        // end must not decrement a fresher load's window. SaveOrchestrator treats this
        // as a boolean latch that setLoading(true) also resets on a new load.
        try { window.dispatchEvent(new CustomEvent('pryzm-load-suppress-begin')); } catch { /* SSR — no-op */ }

        // ── PROJECT-LOAD METADATA + EXEC HELPER ──────────────────────────────
        // Every command dispatched during load uses `source: 'PROJECT_LOAD'` so
        // CommandManager skips per-command snapshot creation, undo-history push,
        // and verbose console logging. Together these eliminate the O(N²) cost
        // that made large-project opens take 30+ seconds.
        // See CommandManager.execute() — PROJECT-LOAD FAST PATH comment.
        const LOAD_META = { source: 'PROJECT_LOAD' as const };
        const exec = (cmd: any) => this.commandManager.execute(cmd, LOAD_META); // PROJECT_LOAD fast-path: bypasses bus/undo-stack by design (see CommandManager PROJECT_LOAD comment); OI-023
        // ── End PROJECT-LOAD metadata ────────────────────────────────────────

        // ── ROOM TOPOLOGY OBSERVER — pause per Contract §R-8 ─────────────────
        // The observer's WallStore subscription fires `_scheduleRedetect()` on
        // every wall add. During load this triggers REDETECT_ROOMS × 3 per level
        // (debounce timer expires mid-load) which serialises the main thread.
        // Pause it for the duration of the load; we fire one ReDetectRoomsCommand
        // per level explicitly in the finally block (mirrors BatchCoordinator
        // ._executeFinalSweep).
        const topologyObserver = (typeof window !== 'undefined') ? window.roomTopologyObserver : null;
        try { topologyObserver?.pause?.(); } catch (e) { console.warn('[ProjectLoader] roomTopologyObserver.pause() failed', e); }

        // ── §LOAD-RAF-PAUSE — pause WallJoinResolver + buildWall flush cascade ──
        // Each wall add and each opening insertion fires a wallStore event that
        // would normally schedule a per-frame rebuild (one O(N²) WallJoinResolver
        // pass + one buildWall per dirty wall). Awaits later in this function
        // (e.g. dynamic `import(...)` calls) yield to the event loop and let
        // those rebuilds fire MID-LOAD, producing repeated full-level resolves
        // and triggering the verbose §MULTI-CLUSTER pre-pass each time. On
        // larger projects with multi-wall junctions this manifests as a load
        // that appears stuck at the last `[WallJoinResolver] §MULTI-CLUSTER ...
        // trimmed → (...)` line printed.
        //
        // We pause the rebuild scheduler here and explicitly call
        // resumeAndFlush() in the finally block, which runs ONE coalesced
        // resolveLevel + buildWall pass per affected level after every wall,
        // slab, and opening is already in its store.
        const wallRebuildControl = (typeof window !== 'undefined') ? window.__wallRebuildControl : null;
        try { wallRebuildControl?.pause?.(); } catch (e) { console.warn('[ProjectLoader] __wallRebuildControl.pause() failed', e); }
        // ── End §LOAD-RAF-PAUSE pause ────────────────────────────────────────

        // ── §LOAD-REDETECT-FREEZE (2026-06-25) — suppress per-element verbose
        //    logging for the duration of the load/restore window. ──────────────
        // Restoring a persisted project replays the Create* commands, so the
        // hot per-element loggers fire THOUSANDS of synchronous console.log
        // lines on the main thread during a single open:
        //   • `[BimManager] Registered element … to level …` (BimKernel.ts)
        //   • `[WallOccupancyStore] canPlace OK: wall=… …`   (WallOccupancyStore.ts)
        // At 783 elements × 7 levels that console flood is itself real
        // main-thread jank (DevTools serialises + paints every line). These
        // logs are noise on a known-good restore — the data was already
        // validated when first authored. Gate them behind this flag, which the
        // shared-package loggers check; it is set ONLY for the load() body and
        // cleared in finally, so live-edit logging is unchanged.
        (globalThis as unknown as { __pryzmProjectLoadActive?: boolean }).__pryzmProjectLoadActive = true;

        // Track which level IDs were actually loaded so the post-load sweep
        // only fires for levels that have geometry.
        const loadedLevelIds = new Set<string>();
        // §LOAD-HEAL-DEGENERATE-POLYGON — levels whose persisted (degenerate)
        // rooms were dropped at import; these MUST be force-redetected even
        // though the raw snapshot still lists rooms for them (so the
        // §LOAD-REDETECT-FREEZE skip is overridden for them below).
        const healedRoomLevelIds = new Set<string>();
        // ── End topology observer pause ──────────────────────────────────────

        // ── PERF-AUDIT-2026 P0: Event-Bus Batch Wrap ─────────────────────────
        // Opens a StoreEventBus buffer so all Create* command events are queued
        // rather than dispatched synchronously per element.  The buffer is flushed
        // once in the finally block — each builder fires exactly once per element
        // type instead of once per element (O(N) vs O(N²) geometry operations).
        //
        // ClearProjectCommand runs inside the batch so WALL_CLEARED is buffered
        // before WALL_ADDED events — builders receive the correct clear-then-create
        // sequence when the bus flushes.  The depth-counter in StoreEventBus makes
        // this safe to nest with any BatchCoordinator.runBatch() calls that may
        // be triggered by individual Create* commands.
        storeEventBus.beginBatch();
        // ── End PERF-AUDIT-2026 P0 batch open ────────────────────────────────

        // ── §FIX-TEMPORAL-LOAD-REPLAY-RATCHET (L-5820) ───────────────────────
        // ⭐ A LOAD IS A REPLAY, AND A REPLAY IS NOT HISTORY.
        //
        // `temporalGraphManager` subscribes to StoreEventBus and mints a
        // NodeMutationRecord per create/update/delete. Hydrating a project writes
        // every restored element into its store, so the buffer opened above ends up
        // holding one `create` per restored element — and `endBatch()` below sits in
        // the `finally`, i.e. it flushes them to subscribers AFTER the Phase G
        // `temporalGraphManager.deserialize()` has already clear-then-restored the
        // real journal. So they landed ON TOP of it and were persisted.
        //
        // That made OPENING a project permanently enlarge its own payload: the
        // journal is embedded whole in every ProjectSnapshot, the local store keeps
        // 20 of them, and every autosave POSTs one to the server. MEASURED (lane
        // LOAD30, 2026-08-22, `tools/perf/bench-version-container.mjs`): the model
        // for a 264-element project is ~0.1 MB and its whole 20-version container
        // 0.3 MB — against the ~35 MB container the founder is carrying. The journal
        // is the difference, and this loop is where it grew.
        //
        // ⛔ NOTHING IS DELETED. Suspension only declines to MINT records for a
        // replay of history the snapshot already carries; `deserialize()` restores
        // that journal unchanged. Resumed in the `finally` immediately after
        // `endBatch()`, so it spans exactly the flush it exists to cover.
        temporalGraphManager.suspendRecording();

        __phase('setup');           // setup window closed — element hydration begins
        try {
            // ── PROJECT-LOAD-PERFORMANCE-13 §2 Phase 1 — path selector ────────
            // Default-on: dispatch a single ImportProjectCommand instead of N
            // per-element CreateXCommands.  The legacy path is kept verbatim in
            // the `else` branch as a rollback for the rare regression — flip the
            // localStorage key 'PRYZM_USE_IMPORT_COMMAND' to 'false' (or set
            // VITE_PRYZM_USE_IMPORT_COMMAND=false at build time) to use it.
            const useImportCmd = this._useImportCommandPath();
            console.log(
                `[ProjectLoader] Element-creation path: ` +
                `${useImportCmd ? 'ImportProjectCommand (Phase 1)' : 'legacy per-command'}`
            );

            if (useImportCmd) {
                // ── New path: one command, one callback fan-out ──────────────
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const importCmd = new ImportProjectCommand(snapshot as any, {
                    isCancelled: cancelled,
                    // §LOAD-IMPORT-STEPS (L-3050/L-3052) — feed the hang watchdog.
                    onStep: __onImportStep,
                });

                // ── §LOAD-CHUNKED (2026-06-29) — frame-yielding dispatch ──────
                // The element-creation loop drives SYNCHRONOUS geometry (slab
                // triangulation fires inline via the `bim-slab-added` DOM event;
                // wall bodies are deferred, but per-element store/registry/spatial
                // work still adds up). Running it as one JS task froze the screen
                // mid-open on a heavy residential building. Chunked dispatch yields
                // a frame (via the P3-owned FrameScheduler — no new rAF) between
                // element chunks so the loading overlay + partial scene stay live
                // and the user sees a progressive build (C11 §6.1).
                //
                // Default-ON; set localStorage 'PRYZM_CHUNKED_LOAD'='false' (or
                // globalThis.__pryzmChunkedLoad = false) to fall back to the
                // synchronous one-task path used before this fix.
                //
                // §FIX-EMPTY-LOAD-HANG (L-108) — chunking exists ONLY to spread
                // heavy per-element geometry across frames so the UI doesn't freeze.
                // A project with ZERO elements has no geometry to spread: the chunked
                // driver still performs several FrameScheduler round-trips (the
                // generator yields unconditionally at each build-step boundary), and
                // each `await yieldFrame()` waits a full frame — pure latency on the
                // load critical path with no benefit. For an empty (elementless)
                // snapshot, run the synchronous one-task path instead so the loader
                // never blocks on the frame loop. Real projects (≥1 element) keep the
                // progressive chunked build unchanged.
                const __hasElements = snapshotHasElements(snapshot as unknown as Record<string, unknown>);
                const useChunked = this._useChunkedLoad() && __hasElements;
                // §LOAD-IMPORT-STEPS (L-3053) — close the PRE-import window before
                // the drain opens. `__mark_last` is initialised up at the
                // instrumentation block, so the `element_import` bucket used to
                // also contain the checksum verify, the watchdog install, the
                // observer/wall-rebuild pauses, `beginBatch()` and the path
                // select. `element_import=47168.2ms` therefore did not mean "the
                // import took 47.2 s" — it meant "everything from the top of the
                // instrumentation to the end of the import took 47.2 s". Now
                // `load_setup` carries that prologue and `element_import` is the
                // drain alone.
                __mark('load_setup');
                // §PERF-L03-PHASE (P1.2) — import-drain span start (gated read below).
                const __tImportDrain = performance.now();
                let importResult: ReturnType<typeof exec>;
                if (useChunked) {
                    // yieldFn schedules a single FrameScheduler tick and resolves
                    // after it fires — the browser renders the frame in between, so
                    // each chunk is followed by a paint. P3-compliant: no rAF here.
                    //
                    // §LOAD-CHUNKED instrumentation: count the yields and the
                    // longest synchronous gap BETWEEN yields. A small max-gap proves
                    // the main thread is being released (no single LONGTASK). The
                    // summary prints once after the import resolves.
                    //
                    // §PROGRESS-SCHEDULER (2026-08-07) — the yield is now
                    // VISIBILITY-INDEPENDENT. Chunking exists to keep the UI
                    // responsive; a hidden tab has no UI to keep responsive AND
                    // stops firing rAF entirely, so a frame-bus yield parked the
                    // load mid-hydration for as long as the founder was in
                    // Visual Studio — while the raw-`setTimeout` watchdogs that
                    // guard this pipeline kept firing on real time and
                    // force-completed work that had merely been parked. That is
                    // the "stuck / corrupt" symptom. `yieldForProgress()` keeps
                    // the exact frame-bus behaviour while visible and falls to an
                    // unclamped MessageChannel macrotask while hidden, so the
                    // load always runs to completion. P3 is untouched — no new
                    // rAF; see `packages/frame-scheduler/src/progressScheduler.ts`.
                    let _yields = 0;
                    let _maxGapMs = 0;
                    let _hiddenYields = 0;
                    let _lastResume = performance.now();
                    // §LOAD-YIELD-WAIT (L-3054) — the load is COMPUTE + WAITING, and
                    // only the compute half was ever measured. `_maxGapMs` times the
                    // synchronous chunk between two yields; the time spent INSIDE
                    // `yieldForProgress` — i.e. waiting for the frame bus to deliver
                    // the next frame — was invisible. That matters because the frame
                    // the loader waits for is drawn by a viewport that is itself
                    // rendering the half-built scene: if a frame costs 500 ms, every
                    // yield costs 500 ms, and a load with 30 yields pays 15 s for
                    // waiting alone with ZERO of it visible in any existing counter.
                    // Splitting the two is what makes "the import is slow" a
                    // falsifiable claim rather than a feeling.
                    let _yieldWaitMs = 0;
                    let _maxYieldWaitMs = 0;
                    let _computeMs = 0;
                    const yieldFrame = async (): Promise<void> => {
                        // Time the synchronous chunk that just ran (since the last resume).
                        const gap = performance.now() - _lastResume;
                        _computeMs += gap;
                        if (gap > _maxGapMs) _maxGapMs = gap;
                        if (isHiddenForProgress()) _hiddenYields++;
                        const __tWait = performance.now();
                        await yieldForProgress('project-load-chunk', 'post-render');
                        const __wait = performance.now() - __tWait;
                        _yieldWaitMs += __wait;
                        if (__wait > _maxYieldWaitMs) _maxYieldWaitMs = __wait;
                        _yields++;
                        _lastResume = performance.now();
                    };
                    importResult = await this.commandManager.executeChunked(importCmd, yieldFrame);
                    // §LOAD-YIELD-WAIT (L-3054) — the FINAL chunk. `_maxGapMs` was
                    // only ever updated at the TOP of `yieldFrame`, so the segment
                    // between the last yield and the end of the import — which
                    // contains rooms, room bounding lines and every step after the
                    // last `yield` in the generator — was never timed at all. On a
                    // generator whose last yield is at the curtain-wall step, that is
                    // a large and permanently invisible tail.
                    {
                        const __tail = performance.now() - _lastResume;
                        _computeMs += __tail;
                        if (__tail > _maxGapMs) _maxGapMs = __tail;
                    }
                    console.log(
                        `[ProjectLoader] §LOAD-CHUNKED — yielded ${_yields} time(s) during element build; ` +
                        `longest synchronous chunk between yields=${_maxGapMs.toFixed(1)}ms ` +
                        `(main thread released ${_yields} time(s), so the UI painted progressively instead of freezing)` +
                        `${_hiddenYields > 0
                            ? `; §PROGRESS-SCHEDULER — ${_hiddenYields} yield(s) ran while the tab was HIDDEN ` +
                              `(macrotask path, rAF was stopped — the load still completed)`
                            : ''}.`,
                    );
                    // §LOAD-YIELD-WAIT (L-3054) — COMPUTE vs WAITING, on one line.
                    // If waiting dominates, the fix is the frame loop (or the yield
                    // cadence), NOT the import; if compute dominates, read
                    // §LOAD-IMPORT-STEPS below for which element family owns it.
                    console.log(
                        `[ProjectLoader] §LOAD-YIELD-WAIT compute=${_computeMs.toFixed(1)}ms ` +
                        `waiting=${_yieldWaitMs.toFixed(1)}ms yields=${_yields} ` +
                        `avgWait=${_yields > 0 ? (_yieldWaitMs / _yields).toFixed(1) : '0.0'}ms ` +
                        `maxWait=${_maxYieldWaitMs.toFixed(1)}ms maxChunk=${_maxGapMs.toFixed(1)}ms ` +
                        `— waiting is time the loader spent parked in the frame bus, not work.`,
                    );
                } else {
                    importResult = exec(importCmd);
                }
                __mark('element_import'); // §DIAG-EMPTY-LOAD-HANG — element hydration wall-time
                // §LOAD-IMPORT-STEPS (L-3050) — the 20-step decomposition of the
                // bucket that used to be one opaque number. Sorted heaviest-first
                // and printed unconditionally, because the load a lane needs to see
                // is always the one that already happened on the founder's machine.
                try {
                    const __stepRows = Object.entries(importCmd.stats.stepMs)
                        .sort((a, b) => b[1] - a[1])
                        .map(([k, v]) => `${k}=${v.toFixed(1)}ms/n=${importCmd.stats.stepN[k] ?? 0}`);
                    if (__stepRows.length > 0) {
                        console.log(`[ProjectLoader] §LOAD-IMPORT-STEPS ${__stepRows.join(' ')}`);
                    }
                } catch (e) {
                    console.warn('[ProjectLoader] §LOAD-IMPORT-STEPS summary failed (non-fatal):', e);
                }
                // §LOAD-IMPORT-STEPS — the import is over; stop the watchdog naming
                // a step that is no longer running.
                __importStep = '';
                // §PERF-L03-PHASE (P1.2) — import-drain total (ImportProjectCommand
                // element replay, chunked or one-task). Confirms/kills L03 import cost.
                __perfPhase('import_drain', __tImportDrain, `chunked=${useChunked} elements=${result.loaded}`);

                // Roll the command's per-element counters up into the LoadResult
                // so the calling UI sees identical {loaded, failed, errors,
                // warnings} bookkeeping regardless of which path ran.
                result.loaded   += importCmd.stats.loaded;
                result.failed   += importCmd.stats.failed;
                result.errors.push(...importCmd.stats.errors);
                result.warnings.push(...importCmd.stats.warnings);
                for (const lvlId of importCmd.stats.loadedLevelIds) {
                    loadedLevelIds.add(lvlId);
                }
                // §LOAD-HEAL-DEGENERATE-POLYGON — carry healed levels through so
                // the post-load redetect sweep re-seals them.
                for (const lvlId of importCmd.stats.healedRoomLevelIds) {
                    healedRoomLevelIds.add(lvlId);
                }

                if (!importResult.success) {
                    // The command failed at Clear, was cancelled mid-import, or
                    // hit a fatal exception.  Surface that to the caller via the
                    // same early-return path the legacy code uses for cancellation.
                    return { ...result, success: false };
                }
            } else {
                // ── Legacy per-command path (preserved verbatim for rollback) ─
                // ── Step 0: Clear current project ────────────────────────────────
                const clearResult = exec(new ClearProjectCommand());
                if (!clearResult.success) {
                    result.errors.push('ClearProjectCommand failed: ' + (clearResult.error ?? 'unknown'));
                    return result;
                }

            // ── Cancellation check (before Step 1) ────────────────────────────
            if (cancelled()) {
                console.log('[ProjectLoader] Load cancelled before levels.');
                return { ...result, success: false };
            }

            // ── Step 1: Levels (PlanOrdering priority 10) ─────────────────────
            console.log(`[ProjectLoader] Loading ${snapshot.levels.length} levels`);
            for (const level of snapshot.levels) {
                // Skip 'L0' if BimManager already created it as default
                const ctx = this.commandManager.getContext();
                const existing = ctx.bimManager.getLevelById(level.id);
                if (existing) {
                    console.log(`[ProjectLoader] Level ${level.id} already exists, skipping`);
                    result.warnings.push(`Level ${level.id} already exists — skipped`);
                    continue;
                }
                const cmd = new AddLevelCommand({
                    levelId: level.id,
                    name: level.name,
                    elevation: level.elevation,
                    height: level.height ?? 3.0
                });
                const r = exec(cmd);
                r.success ? result.loaded++ : this.recordFail(result, `Level ${level.id}`, r);
            }

            // ── Cancellation check (before Step 2) ────────────────────────────
            if (cancelled()) {
                console.log('[ProjectLoader] Load cancelled before grids.');
                return { ...result, success: false };
            }

            // ── Step 2: Grids (PlanOrdering priority 11) ─────────────────────
            console.log(`[ProjectLoader] Loading ${snapshot.grids.length} grids`);
            for (const grid of snapshot.grids) {
                const cmd = new AddGridCommand({
                    gridId: grid.id,
                    orientation: grid.axis as 'X' | 'Y',
                    position: grid.position,
                    name: grid.name
                });
                const r = exec(cmd);
                r.success ? result.loaded++ : this.recordFail(result, `Grid ${grid.id}`, r);
            }

            // ── Cancellation check (before Step 3) ────────────────────────────
            if (cancelled()) {
                console.log('[ProjectLoader] Load cancelled before columns.');
                return { ...result, success: false };
            }

            // ── Step 3: Columns (priority 15) ─────────────────────────────────
            console.log(`[ProjectLoader] Loading ${snapshot.columns.length} columns`);
            for (const col of snapshot.columns) {
                const cmd = new CreateColumnCommand({
                    id: col.id,
                    position: col.position,
                    height: col.height,
                    rotation: col.rotation ?? 0,
                    profile: col.profile ?? 'rectangular',
                    width: col.width,
                    depth: col.depth,
                    baseOffset: col.baseOffset ?? 0,
                    levelId: col.levelId,
                    materialId: col.materialId,
                    // §PERSIST-L1 (W1-2) — carry the persisted IFC GUID; it is the IFC
                    // round-trip join key and was re-minted on every reload.
                    ifcGuid: col.ifcData?.guid
                });
                const r = exec(cmd);
                r.success ? result.loaded++ : this.recordFail(result, `Column ${col.id}`, r);
            }

            // ── Cancellation check (before Step 4) ────────────────────────────
            if (cancelled()) {
                console.log('[ProjectLoader] Load cancelled before walls.');
                return { ...result, success: false };
            }

            // ── B7b: Restore DoorStore / WindowStore from rich snapshot data ─────
            // Clear first (ClearProjectCommand may not know about these stores).
            // Restore rich records BEFORE walls so CreateWallOpeningCommand's
            // `!doorStore.has()` guard prevents duplicate insertion on redo.
            doorStore.clear();
            windowStore.clear();
            if (Array.isArray(snapshot.doors) && snapshot.doors.length > 0) {
                for (const d of snapshot.doors) {
                    try { doorStore.add(d); }
                    catch (err) { console.warn('[ProjectLoader] Skipping invalid door record:', err); }
                }
                console.log(`[ProjectLoader] Restored ${snapshot.doors.length} door records from snapshot`);
            }
            if (Array.isArray(snapshot.windows) && snapshot.windows.length > 0) {
                for (const w of snapshot.windows) {
                    try { windowStore.add(w); }
                    catch (err) { console.warn('[ProjectLoader] Skipping invalid window record:', err); }
                }
                console.log(`[ProjectLoader] Restored ${snapshot.windows.length} window records from snapshot`);
            }

            // ── Step 4: Walls (priority 20) ───────────────────────────────────
            console.log(`[ProjectLoader] Loading ${snapshot.walls.length} walls`);
            // §WALL-JOIN-INTENT HYDRATION (L-927) — suppress joinIntent DERIVATION for the
            // wall restore; a PERSISTED stamp still flows through untouched. Walls are
            // replayed in FILE order against a partially-populated store, and at the
            // UNTRIMMED `_sourceBaseLine` the serializer writes (§WALL-JOIN-SAVE-FIX) —
            // neither input matches authoring time, so deriving here would be a guess
            // dressed as a recovery. Legacy snapshots load with no stamp and therefore
            // behave EXACTLY as they did before this field existed.
            // §P4-CAST-AT-SOURCE (H4, 2026-08-16) — the window fallback reads the
            // DECLARED global (`Window['wallStore']`, apps/editor/src/types/globals.d.ts)
            // and narrows it once. It used to be `window as unknown as { wallStore?… }`,
            // a double cast through `unknown` that defeats the Window type as
            // completely as `(window as any)` — it was one of the two sites that
            // pushed `check-cast-unknown` (L-845) past its shrink-only ceiling.
            // Behaviour is unchanged: same property, same optional-chained call,
            // same `undefined` when no legacy store is present.
            type HydratableWallStore = { beginHydration?: () => () => void };
            const _wallStoreForHydration: HydratableWallStore | undefined = (this as unknown as {
                _stores?: { wallStore?: HydratableWallStore };
            })._stores?.wallStore
                ?? (window.wallStore as HydratableWallStore | undefined);
            const _endHydration = _wallStoreForHydration?.beginHydration?.();
            try {
            for (const wall of snapshot.walls) {
                const bl = wall.baseLine;
                const cmd = new CreateWallCommand(wall.id, {
                    start: { x: bl[0].x, z: bl[0].z },
                    end: { x: bl[1].x, z: bl[1].z },
                    height: wall.height,
                    thickness: wall.thickness,
                    levelId: wall.levelId,
                    baseOffset: wall.baseOffset,
                    materialId: wall.materialId,
                    materialColor: wall.materialColor,
                    curve: wall.curve,
                    // §PERSIST-L1 (W1-2) — carry the persisted IFC GUID; it is the IFC
                    // round-trip join key and was re-minted on every reload.
                    ifcGuid: wall.ifcData?.guid,
                    // §WALL-RAKE — restore the lean. Absent in every pre-rake snapshot,
                    // and `undefined` resolves to 90° (vertical) in WallRake.resolveRakeDeg.
                    rakeAngleDeg: wall.rakeAngleDeg,
                    // §FIX-SIDEFINISH-PERSISTS (L-999) — restore the per-side finish. THE LOAD
                    // HALF, and the half most easily forgotten: a field can be serialised
                    // perfectly and still be destroyed on reload, because this loop rebuilds
                    // every wall through `CreateWallCommand` and passes a hand-written option
                    // list. Absent in every pre-L-995 snapshot, and absent ⇒ no authored
                    // finish, which is exactly the legacy behaviour.
                    sideFinishes: (wall as { sideFinishes?: Record<string, unknown> }).sideFinishes,
                    // §WALL-PROFILE — restore the authored outline. This is the LOAD half,
                    // and it is the half most easily forgotten: a field can be serialised
                    // perfectly and still be destroyed on reload, because this loop rebuilds
                    // every wall through `CreateWallCommand` and passes a hand-written option
                    // list. `baseLine[i].y` is the standing proof — the serialiser preserves it
                    // via `stripVec3` and this loop reads only `.x` / `.z` (:877-878).
                    // Absent in every pre-profile snapshot, and absent ⇒ the rectangle.
                    wallProfile: (wall as { wallProfile?: { ring: { u: number; v: number }[] } }).wallProfile,
                    systemTypeId: wall.systemTypeId,
                    // §FIX-WALL-LAYERS-PLAN-VS-3D-CREATION (L-239, P4 backfill) — thread the
                    // PERSISTED layer stack back in. ProjectSerializer has always written
                    // `wall.layers`, but this restore dropped it and asked CreateWallCommand to
                    // re-derive from `systemTypeId` — which CANNOT work for a user-defined type,
                    // because custom wallSystemTypes are restored LATER in this same load() (see
                    // "FIX-3 (M9)" below). Result: walls of custom types came back plain.
                    // Persisted stack wins; absent ⇒ CreateWallCommand backfills from the
                    // catalogue (upgrading legacy walls saved before layers were stamped) and
                    // falls back safely to an unlayered wall if the type is gone.
                    layers: (wall as { layers?: any[] }).layers,
                    // §WALL-JOIN-INTENT / §PERSIST-JOININTENT (L-927) — restore what the
                    // AUTHOR DID at each endpoint, for exactly the reason `layers` above is
                    // threaded through: the persisted value is the wall's own frozen record
                    // and re-derivation cannot reproduce it. Stronger here, in fact — a
                    // layer stack CAN be rebuilt from the catalogue, whereas L-923 proved
                    // the join gesture cannot be recovered from geometry at all. Absent in
                    // any pre-L-927 snapshot; absent is the legacy behaviour, and the
                    // hydration guard around this loop keeps it that way rather than
                    // guessing from file order.
                    joinIntent: (wall as {
                        joinIntent?: { start?: 'butt' | 'through'; end?: 'butt' | 'through' };
                    }).joinIntent,
                });
                const r = exec(cmd);
                if (r.success) {
                    result.loaded++;
                    // Restore openings for this wall
                    if (Array.isArray(wall.openings) && wall.openings.length > 0) {
                        for (const opening of wall.openings) {
                            // Enrich opening with window/door data if available
                            const elementData = findOpeningElementData(snapshot, opening);
                            const openingCmd = new CreateWallOpeningCommand({
                                wallId: wall.id,
                                openingData: { ...opening, ...elementData }
                            });
                            const or = exec(openingCmd);
                            or.success ? result.loaded++ : this.recordFail(result, `Opening ${opening.id}`, or);
                        }
                    }
                } else {
                    this.recordFail(result, `Wall ${wall.id}`, r);
                }
            }
            } finally {
                // Always leave hydration — a leaked flag would silently disable stamping
                // for every wall the user draws afterwards, i.e. the original defect with
                // extra steps.
                _endHydration?.();
            }

            // ── Cancellation check (before Step 5) ────────────────────────────
            if (cancelled()) {
                console.log('[ProjectLoader] Load cancelled before slabs.');
                return { ...result, success: false };
            }

            // ── Step 5: Slabs (priority 21) ───────────────────────────────────
            console.log(`[ProjectLoader] Loading ${snapshot.slabs.length} slabs`);
            for (const slab of snapshot.slabs) {
                const cmd = new CreateSlabCommand({
                    id: slab.id,
                    // §LOAD-FLOOD-GATE (2026-06-29) — thread the persisted IFC GUID
                    // (or mint a fresh one) so CreateSlabCommand.execute() never logs
                    // its `§2.6 C2 ifcGuid not injected` warning-with-stack-trace once
                    // per slab on a heavy load. Also round-trips the IFC key (parity
                    // with the ImportProjectCommand fast path + ceiling/floor restores).
                    ifcGuid: (slab as { ifcData?: { guid?: string } }).ifcData?.guid ?? crypto.randomUUID(),
                    width: slab.width,
                    depth: slab.depth,
                    thickness: slab.thickness,
                    position: slab.position,
                    levelId: slab.levelId,
                    polygon: slab.polygon,
                    // §FEAT-BOUNDARY-SHAPE-DESCRIPTOR (L-1323) — parity with
                    // ImportProjectCommand, so the two twins cannot disagree about
                    // what a restored slab remembers.
                    boundaryShape: (slab as { boundaryShape?: never }).boundaryShape,
                    holes: slab.holes,
                    sketch: slab.sketch,
                    // ⭐ C100 §2.1 / ARM E — the slab's MATERIAL, which this payload
                    // did not list. `serializeSlab()` has always WRITTEN `materialId`
                    // and `materialColor`; nothing read them back, and
                    // `CreateSlabCommand.execute()` hard-coded `#808080`. So every
                    // reopened project silently repainted its slabs mid-grey while the
                    // saved file still held the right answer.
                    //
                    // ⭐ §COMMITTED-IS-NOT-REACHABLE — the evidence a reviewer reaches
                    // for (open the JSON, find the id) said it worked. The user's
                    // evidence is the reload, never the file.
                    //
                    // ⚠ MEASURED WHILE FIXING THIS, NOT FIXED HERE, and named so it is
                    // not mistaken for covered: `serializeSlab()` also writes
                    // `systemTypeId`, `layers`, `baseOffset` and `properties`, and this
                    // is the ONLY slab restore path in the loader (there is no
                    // `slabStore` reference anywhere else in this file). Those four are
                    // lost on reload too — a slab's whole ASSEMBLY, not just its
                    // colour. That is C65's territory and the slab lane's, it needs its
                    // own test, and guessing at it inside a material commit is how a
                    // fix becomes a regression.
                    materialId: slab.materialId,
                    materialColor: slab.materialColor,
                    // ⭐ L-1178 — the four fields the comment above named as MEASURED
                    // BUT NOT FIXED are now carried. `serializeSlab()` writes all of
                    // them (`ProjectSerializer.ts:646-653`) and this is still the only
                    // slab restore path, so until now a reload silently rebuilt every
                    // slab with baseOffset 0, no layers, no system type and a fresh mark.
                    //
                    // ⭐ `baseOffset` is C92 §10's DATUM OFFSET — the slab's top face
                    // sits at `level.elevation + baseOffset`, so dropping it did not
                    // merely lose a number, IT MOVED THE SLAB on every reopen. That is
                    // the founder's L-1177 sentence reached by a second, independent
                    // route: L-1177 is the live-edit defect, this is the persistence one.
                    baseOffset: slab.baseOffset,
                    layers: slab.layers,
                    systemTypeId: slab.systemTypeId,
                    // The saved `properties` carry the slab's MARK; without this the
                    // schedule renumbered itself on every reopen.
                    properties: slab.properties
                });
                const r = exec(cmd);
                r.success ? result.loaded++ : this.recordFail(result, `Slab ${slab.id}`, r);
            }

            // ── Step 5b: Ceilings (priority 21.5 — after slabs, before stairs) ──
            // §LOAD-HEAL-DEGENERATE-POLYGON — drop degenerate ceiling polygons
            // (old-snapshot collapsed-wall rooms) so they don't fail on open.
            const { kept: snapshotCeilings, dropped: __droppedCeilings } =
                dropDegeneratePolygonRecords<any>((snapshot as any).ceilings, (c: any) => c?.polygon ?? c?.boundary?.polygon);
            if (__droppedCeilings.length > 0) {
                console.warn(`[ProjectLoader] §LOAD-HEAL-DEGENERATE-POLYGON — dropped ${__droppedCeilings.length} degenerate ceiling polygon(s) from an old snapshot`);
            }
            if (Array.isArray(snapshotCeilings) && snapshotCeilings.length > 0) {
                console.log(`[ProjectLoader] Loading ${snapshotCeilings.length} ceilings`);
                for (const ceiling of snapshotCeilings) {
                    try {
                        // §OPEN-OLD-CEILING-RESTORE (2026-07-01) — the serialized
                        // ceiling nests polygon/height/thickness/baseOffset under
                        // `boundary` (CeilingData.boundary: CeilingBoundary). Reading
                        // the flat fields (`ceiling.polygon`, `ceiling.height`, …)
                        // yielded `undefined` → validateCeilingPolygon(undefined)
                        // failed → EVERY ceiling was counted as a failed element and
                        // never restored (the "N elements failed" banner + missing
                        // ceilings). `ceilingRestoreBoundaryFields` reads `boundary`
                        // first, keeping a flat fallback for any legacy record.
                        const cb = ceilingRestoreBoundaryFields(ceiling);
                        const cmd = new CreateCeilingCommand({
                            ceilingId:    ceiling.id ?? crypto.randomUUID(),
                            ifcGuid:      ceiling.ifcGuid ?? ceiling.ifc?.guid ?? ceiling.ifcData?.guid ?? crypto.randomUUID(),
                            levelId:      ceiling.levelId,
                            polygon:      cb.polygon,
                            height:       cb.height,
                            thickness:    cb.thickness,
                            baseOffset:   cb.baseOffset,
                            systemTypeId: ceiling.systemTypeId,
                            label:        ceiling.label,
                            layers:       ceiling.layers,
                            finishSpec:   ceiling.finishSpec,
                            holeElements: ceiling.holeElements,
                            createdBy:    ceiling.metadata?.createdBy ?? ceiling.createdBy,
                            // §FIX-FINISH-HOST-SURVIVES-RELOAD (L-10641) — identical omission and
                            // identical repair to the floor loader below; see the reasoning there.
                            // The ceiling's host binding was saved and dropped in the same way.
                            hostRoomId:   ceiling.hostRoomId,
                            boundarySource: 'explicit-polygon',
                        });
                        const r = exec(cmd);
                        r.success ? result.loaded++ : this.recordFail(result, `Ceiling ${ceiling.id}`, r);
                    } catch (e) {
                        this.recordFail(result, `Ceiling ${ceiling.id ?? '?'}`, { success: false, affectedElementIds: [], error: String(e) });
                    }
                }
            }

            // ── Step 5c: Floor Finishes (priority 21.8 — after ceilings, before stairs) ──
            // §LOAD-HEAL-DEGENERATE-POLYGON — drop degenerate floor polygons.
            const { kept: snapshotFloors, dropped: __droppedFloors } =
                dropDegeneratePolygonRecords<any>((snapshot as any).floors, (f: any) => f?.boundary?.polygon ?? f?.polygon);
            if (__droppedFloors.length > 0) {
                console.warn(`[ProjectLoader] §LOAD-HEAL-DEGENERATE-POLYGON — dropped ${__droppedFloors.length} degenerate floor polygon(s) from an old snapshot`);
            }
            if (Array.isArray(snapshotFloors) && snapshotFloors.length > 0) {
                console.log(`[ProjectLoader] Loading ${snapshotFloors.length} floor finishes`);
                for (const floor of snapshotFloors) {
                    try {
                        const cmd = new CreateFloorCommand({
                            floorId:      floor.id ?? crypto.randomUUID(),
                            ifcGuid:      floor.ifcGuid ?? floor.ifcData?.guid ?? crypto.randomUUID(),
                            levelId:      floor.levelId,
                            polygon:      floor.boundary?.polygon ?? floor.polygon,
                            baseOffset:   floor.boundary?.baseOffset ?? floor.baseOffset ?? 0,
                            thickness:    floor.boundary?.thickness ?? floor.thickness ?? 0.075,
                            systemTypeId: floor.systemTypeId,
                            label:        floor.label,
                            layers:       floor.layers,
                            finishSpec:   floor.finishSpec,
                            serviceHoles: floor.serviceHoles,
                            hostSlabId:   floor.hostSlabId,
                            createdBy:    floor.metadata?.createdBy ?? floor.createdBy ?? 'project-load',
                            // §FIX-FINISH-HOST-SURVIVES-RELOAD (L-10641) — the host room was
                            // WRITTEN at create, SAVED by the serializer, and then DROPPED here:
                            // this payload carried thirteen fields and none of them the binding,
                            // so `hostRoomId` and `coveredRoomIds` were destroyed by every
                            // save/load cycle. Any adaptivity built on the host would have worked
                            // until the first reload and silently stopped afterwards.
                            hostRoomId:   floor.hostRoomId,
                            // ⛔ AND THE BOUNDARY MUST NOT BE RE-DERIVED FROM IT. Restoring the
                            // host re-arms `_resolveBoundary`, whose UNDECLARED branch insets any
                            // ring that still coincides with the room centreline. On a project
                            // saved before L-10640 that ring IS a centreline fall-back, so the
                            // loader would silently "correct" stored geometry on open — hiding the
                            // defect and changing a scheduled quantity without saying so. A
                            // persisted ring is by definition the FILE's stated geometry, which is
                            // exactly what this flag means (see `CreateFloorPayload.boundarySource`),
                            // so it is stored VERBATIM. Repairing already-damaged saves is a
                            // migration, and it is owed separately.
                            boundarySource: 'explicit-polygon',
                        });
                        const r = exec(cmd);
                        r.success ? result.loaded++ : this.recordFail(result, `Floor ${floor.id}`, r);
                    } catch (e) {
                        this.recordFail(result, `Floor ${floor.id ?? '?'}`, { success: false, affectedElementIds: [], error: String(e) });
                    }
                }
            }

            // ── Cancellation check (before Step 6) ────────────────────────────
            if (cancelled()) {
                console.log('[ProjectLoader] Load cancelled before stairs.');
                return { ...result, success: false };
            }

            // ── Step 6: Stairs (priority 22) ──────────────────────────────────
            // §PERSIST-L1 (DAILY-USE 2026-05-20) — Previously this loop passed
            // only 11 curated fields, silently dropping `id`, `typeId`,
            // `typeSnapshot`, `properties` (mark + material + treadMaterial +
            // railingType + …), `turnDirection`, `secondRunSide`,
            // `stepsBeforeLanding`, `buildingCodeVariant`, and `metadata`.
            // That gave the architect-reported symptom: "stair type goes back
            // to default" after reload — the system-type-id was being thrown
            // away on every save/load cycle. The fix mirrors the wall restore
            // pattern (line 461-476) — every field the serializer wrote is
            // threaded back through the command so the snapshot round-trips
            // bit-identically.
            console.log(`[ProjectLoader] Loading ${snapshot.stairs.length} stairs`);
            for (const stair of snapshot.stairs) {
                try {
                    const cmd = new CreateStairCommand({
                        // §PERSIST-L1 — preserve the original UUID so railings,
                        // openings, room boundaries, and selection state all
                        // continue to resolve after reload.
                        id: stair.id,
                        // §PERSIST-L1 (W1-2) — carry the persisted IFC GUID; it is the IFC
                        // round-trip join key and was re-minted on every reload.
                        ifcGuid: stair.ifcData?.guid,
                        baseLevelId: stair.baseLevelId,
                        topLevelId: stair.topLevelId,
                        shape: stair.shape,
                        riserHeight: stair.riserHeight,
                        treadDepth: stair.treadDepth,
                        width: stair.width,
                        startPosition: stair.startPosition ?? { x: 0, y: 0, z: 0 },
                        flights: stair.flights ?? [],
                        landings: stair.landings,
                        // §PERSIST-L1 — code-compliance + shape-control fields.
                        fireRating: stair.fireRating,
                        accessibilityType: stair.accessibilityType,
                        buildingCodeVariant: stair.buildingCodeVariant,
                        turnDirection: stair.turnDirection,
                        secondRunSide: stair.secondRunSide,
                        stepsBeforeLanding: stair.stepsBeforeLanding,
                        // §PERSIST-L1 — the architect's system-type choice
                        // (was silently dropped → stair reverted to default).
                        typeId: stair.typeId,
                        typeSnapshot: stair.typeSnapshot,
                        // §PERSIST-L1 — full properties bag carries mark +
                        // material + treadMaterial + riserMaterial + nosingType
                        // + stringerType + handrail flags + railingType + tags +
                        // description. CreateStairCommand merges these on top
                        // of DEFAULT_STAIR_PROPERTIES and the type defaults.
                        properties: stair.properties,
                        // §PERSIST-L1 — carry the persisted audit block VERBATIM.
                        //
                        // Corrected 2026-08-11 (W1-3/W1-5 sweep): this used to spread
                        // `source: 'import'` over it. MEASURED on the default-on path,
                        // that produced `stair.<id>.metadata.source: expected "user"
                        // got "import"` — a divergence the loader itself created.
                        // ADR-0319 §1 classes authored provenance AUTHORITATIVE, and
                        // its "Alternatives considered" names provenance INVENTED ON
                        // LOAD as the repo's recurring defect. Re-opening your own
                        // saved project is not an import, and the stamp destroys the
                        // stair's real provenance on the first open-save cycle in
                        // exchange for an audit distinction nothing reads. Kept in
                        // lock-step with `ImportProjectCommand`, which carries the
                        // full reasoning.
                        metadata: stair.metadata,
                        // §PERSIST-L1 — Skip the auto-opening punch on restore
                        // (the opening was already created at original-author
                        // time and serialised separately in slab.holes /
                        // standalone openings). Re-punching would duplicate it.
                        autoCreateOpening: false,
                    });
                    const r = exec(cmd);
                    r.success ? result.loaded++ : this.recordFail(result, `Stair ${stair.id}`, r);
                } catch (e) {
                    this.recordFail(result, `Stair ${stair.id}`, { success: false, affectedElementIds: [], error: String(e) });
                }
            }

            // ── Cancellation check (before Step 7) ────────────────────────────
            if (cancelled()) {
                console.log('[ProjectLoader] Load cancelled before furniture.');
                return { ...result, success: false };
            }

            // ── Step 7: Furniture (priority 23) ───────────────────────────────
            console.log(`[ProjectLoader] Loading ${snapshot.furniture.length} furniture items`);
            for (const f of snapshot.furniture) {
                try {
                    // §FIX-PERSIST-AI-ELEMENT (L-85 follow-up) — an ai_element's
                    // geometry lives ENTIRELY in aiElementConfig, which only
                    // CreateAIElementCommand rebuilds. Route those records to it so
                    // the config round-trips instead of vanishing; a malformed
                    // ai_element (no config) returns null and falls through to the
                    // ordinary furniture restore below (byte-identical to pre-fix).
                    const aiPayload = buildAIElementRestorePayload(f);
                    const cmd = aiPayload
                        ? new CreateAIElementCommand(aiPayload)
                        : new CreateFurnitureCommand({
                        id: f.id,
                        furnitureType: f.furnitureType,
                        position: f.position,
                        rotation: f.rotation,
                        levelId: f.levelId,
                        baseOffset: f.baseOffset ?? 0.2,
                        width: f.width,
                        length: f.length,
                        height: f.height,
                        widthBranchTwo: f.widthBranchTwo,
                        lengthBranchTwo: f.lengthBranchTwo,
                        widthMain: f.widthMain,
                        lengthSide: f.lengthSide,
                        seatDepthMain: f.seatDepthMain,
                        seatDepthSide: f.seatDepthSide,
                        material: f.material ?? 'wood',
                        // ⭐ C100 §2.1 / L-1460 — READ THE ID BACK. The gate's ARM E exists
                        // because `slab` wrote a `materialId` the loader never listed, so the
                        // saved file said it worked and the reloaded element had no material.
                        // `serializeFurniture` now writes this; without this line it would be
                        // that same defect, freshly minted.
                        materialId: f.materialId,
                        color: f.color,
                        hasHeadboard: f.hasHeadboard,
                        lo3: f.lo3,
                        startPoint: f.startPoint,
                        cornerPoint: f.cornerPoint,
                        endPoint: f.endPoint,
                        wardrobeConfig: f.wardrobeConfig,
                        // Restore the kitchen / wardrobe RUN configs so the
                        // group geometry rebuilds identically (Contract 13 §2).
                        // Without these, FurnitureFactory would either throw
                        // ("requires kitchenConfig" / "requires wardrobeCabinetConfig")
                        // or silently collapse the RUN to a single primitive.
                        kitchenConfig:         f.kitchenConfig,
                        wardrobeCabinetConfig: f.wardrobeCabinetConfig,
                        // Descriptor-level grouping must survive the round-trip.
                        furnitureCategory:     f.furnitureCategory,
                        // Descriptor-supplied metadata (defaultProperties etc.).
                        metadata:              f.metadata
                    });
                    const r = exec(cmd);
                    r.success ? result.loaded++ : this.recordFail(result, `Furniture ${f.id}`, r);
                } catch (e) {
                    this.recordFail(result, `Furniture ${f.id}`, { success: false, affectedElementIds: [], error: String(e) });
                }
            }

            // ── Cancellation check (before Step 8) ────────────────────────────
            if (cancelled()) {
                console.log('[ProjectLoader] Load cancelled before roofs.');
                return { ...result, success: false };
            }

            // ── Step 8: Roofs (priority 24) ───────────────────────────────────
            console.log(`[ProjectLoader] Loading ${snapshot.roofs.length} roofs`);
            for (const roof of snapshot.roofs) {
                const cmd = migrateRoofSnapshotToCommand(roof);
                if (!cmd) {
                    this.recordFail(result, `Roof ${roof.id}`, { success: false, affectedElementIds: [], error: 'Failed to build roof command from snapshot' });
                    continue;
                }
                const r = exec(cmd);
                r.success ? result.loaded++ : this.recordFail(result, `Roof ${roof.id}`, r);
            }

            // ── Cancellation check (before Step 9) ────────────────────────────
            if (cancelled()) {
                console.log('[ProjectLoader] Load cancelled before handrails.');
                return { ...result, success: false };
            }

            // ── Step 9: Handrails (priority 25) ───────────────────────────────
            console.log(`[ProjectLoader] Loading ${snapshot.handrails.length} handrails`);
            for (const hr of snapshot.handrails) {
                // §L-1102 / §L-1037 — LOAD goes through THE ONE payload builder.
                // The hand-assembled 8-field literal that stood here carried
                // neither `materialId` (which SAVE wrote and this side discarded)
                // nor any of the 14 fields SAVE never wrote. It is now a single
                // call, shared with the persistence-client loader, so save and
                // load are a PAIR rather than two lists that agree by habit.
                const cmd = new CreateHandrailCommand(buildHandrailCreatePayload(hr) as any);
                const r = exec(cmd);
                r.success ? result.loaded++ : this.recordFail(result, `Handrail ${hr.id}`, r);
            }

            // ── Cancellation check (before Step 10) ───────────────────────────
            if (cancelled()) {
                console.log('[ProjectLoader] Load cancelled before plumbing.');
                return { ...result, success: false };
            }

            // ── Step 10: Plumbing (priority 25) ──────────────────────────────
            console.log(`[ProjectLoader] Loading ${snapshot.plumbing.length} plumbing fixtures`);
            for (const p of snapshot.plumbing) {
                try {
                    const cmd = new CreatePlumbingFixtureCommand({
                        id: p.id,
                        fixtureType: p.fixtureType,
                        toiletVariant: p.toiletVariant,
                        position: p.position,
                        rotation: p.rotation,
                        levelId: p.levelId,
                        baseOffset: p.baseOffset ?? 0,
                        width: p.width,
                        height: p.height,
                        length: p.length,
                        color: p.color,
                        startPoint: p.startPoint,
                        endPoint: p.endPoint,
                        // §GRAPH115 / ADR-0374 §2.7 — C84 EI-6.1: the field is persisted only
                        // because THIS restore path reads it back.
                        wallAnchor: p.wallAnchor
                    });
                    const r = exec(cmd);
                    r.success ? result.loaded++ : this.recordFail(result, `Plumbing ${p.id}`, r);
                } catch (e) {
                    this.recordFail(result, `Plumbing ${p.id}`, { success: false, affectedElementIds: [], error: String(e) });
                }
            }

            // ── Step 10b: Lighting fixtures ──────────────────────────────────
            // §PERSIST-LIGHTING (2026-05-22) — lighting was serialized nowhere AND
            // restored nowhere, so every light fixture the user placed was lost on
            // reload. Mirrors the plumbing/furniture restore: recreate each fixture
            // via CreateLightingCommand so the LightingStore + LightingFragmentBuilder
            // rebuild it (the command fires bim-lighting-placed). `lighting` is
            // optional on the snapshot for backward compat with pre-fix projects.
            const snapshotLighting = (snapshot as { lighting?: any[] }).lighting;
            if (Array.isArray(snapshotLighting) && snapshotLighting.length > 0) {
                console.log(`[ProjectLoader] Loading ${snapshotLighting.length} lighting fixtures`);
                for (const lt of snapshotLighting) {
                    try {
                        const cmd = new CreateLightingCommand({
                            id: lt.id,
                            fixtureType: lt.fixtureType,
                            position: lt.position,
                            rotation: lt.rotation,
                            levelId: lt.levelId,
                            roomId: lt.roomId,
                            hostId: lt.hostId,
                            tags: lt.tags,
                            properties: lt.properties,
                            // §PERSIST-LIGHTING-PARAMS (F1, 2026-08-18) — the 12 parametric
                            // blocks + `emission`. Serialized all along, dropped here: this
                            // list was 9 fields wide, so every authored dimension, colour
                            // and brightness reverted to the fixture default on reopen.
                            // Same shared key list the fast path uses, so the two restore
                            // paths cannot drift apart again.
                            ...pickAuthoredLightingParams(lt),
                        });
                        const r = exec(cmd);
                        r.success ? result.loaded++ : this.recordFail(result, `Lighting ${lt.id}`, r);
                    } catch (e) {
                        this.recordFail(result, `Lighting ${lt.id}`, { success: false, affectedElementIds: [], error: String(e) });
                    }
                }
            }

            // ── Step 10c: Boundary lines — DELETED, MOVED, NOT DROPPED ───────
            // §FIX-BOUNDARY-LINE-RESTORE-STRANDED (L-11528) · C106 · C84 EI-9.
            //
            // ⛔ THE RESTORE THAT USED TO BE HERE NEVER RAN. L-9948 wrote it
            // correctly and put it on the wrong side of a branch. Measured 2026-08-29:
            //
            //     grep -c 'boundaryLine' ImportProjectCommand.ts   ->  0
            //     this._useImportCommandPath()                      ->  true (DEFAULT)
            //
            // so these ~60 lines sat inside `else { … }` while every real load took the
            // `if`. A boundary line was saved (`ProjectSerializer` writes `boundaryLines`)
            // and never read back: the file held the data and the editor could not show
            // it. The block's own header said so about a DIFFERENT bug and could not see
            // itself — which is exactly why the fix is a MOVE, not a third copy.
            //
            // ⭐ IT NOW RUNS IN `restoreCompoundFamilies()`, IN THE COMMON TAIL
            // BELOW, past the `if (useImportCmd) … else …` join — so BOTH load paths get
            // it by construction and neither can drift. Read that module's boundary-line
            // block for why it goes through `boundaryLineUndoAdapter` (one store+render
            // seam, already proven by L-11160) rather than re-dispatching the bus verb,
            // and for why that also restores `attachments[]` verbatim — which the verb
            // could not, since `CreateBoundaryLineHandler` writes `attachments: []` by
            // construction (L-9950).
            //
            // ⛔ DO NOT RE-ADD A RESTORE HERE. Two roads to one store is the defect,
            // and the async `create` racing the synchronous patch would non-
            // deterministically wipe the attachment edges it just restored.

            // ── Cancellation check (before Step 11) ───────────────────────────
            if (cancelled()) {
                console.log('[ProjectLoader] Load cancelled before curtain walls.');
                return { ...result, success: false };
            }

            // ── Step 11: Curtain Walls (priority 26) ──────────────────────────
            // §PERSIST-L1 (DAILY-USE 2026-05-20) — Previously this loop passed
            // only 8 curated fields, silently dropping `mullionSize`,
            // `panelThickness`, `mullionColor`, `gridSystem`, `properties`,
            // and the IFC GUID. After reload every curtain wall fell back to
            // the hard-coded mullion defaults (0.08m black mullions, 0.02m
            // glazing) regardless of what the architect had picked. The fix
            // mirrors the wall restore pattern (line 461-476) — every field
            // the serializer wrote is threaded back through the command so
            // the snapshot round-trips bit-identically.
            console.log(`[ProjectLoader] Loading ${snapshot.curtainWalls.length} curtain walls`);
            for (const cw of snapshot.curtainWalls) {
                try {
                    const bl = cw.baseLine;
                    const cmd = new CreateCurtainWallCommand({
                        id: cw.id,
                        start: { x: bl[0].x, z: bl[0].z },
                        end: { x: bl[1].x, z: bl[1].z },
                        height: cw.height,
                        levelId: cw.levelId,
                        baseOffset: cw.baseOffset,
                        gridXSpacing: cw.gridXSpacing,
                        gridYSpacing: cw.gridYSpacing,
                        // §PERSIST-L1 — architect-set mullion + glazing fields.
                        mullionSize:    cw.mullionSize,
                        panelThickness: cw.panelThickness,
                        mullionColor:   cw.mullionColor,
                        // §MAT-CW-MATERIAL (#53) — glazing colour + material-library IDs
                        // round-trip so a reloaded curtain wall keeps its PBR finish.
                        glazingColor:      cw.glazingColor,
                        mullionMaterialId: cw.mullionMaterialId,
                        glazingMaterialId: cw.glazingMaterialId,
                        // §FEAT-CURTAIN-WALL-TYPE-CATALOGUE (L-958) — without this the
                        // serializer's systemTypeId is written and never read back, so a
                        // reload forgets which type the architect chose (C84 EI-6).
                        systemTypeId:      cw.systemTypeId,
                        // §PERSIST-L1 — non-uniform grid lines.
                        gridSystem:     cw.gridSystem,
                        // §PERSIST-L1 — architect-set mark / tags survive reload.
                        properties:     cw.properties,
                        // §PERSIST-L1 — IFC GUID continuity for external tools.
                        ifcGuid:        cw.ifcData?.guid,
                    });
                    const r = exec(cmd);
                    r.success ? result.loaded++ : this.recordFail(result, `CurtainWall ${cw.id}`, r);
                } catch (e) {
                    this.recordFail(result, `CurtainWall ${cw.id}`, { success: false, affectedElementIds: [], error: String(e) });
                }
            }

            // ── Step 11b: curtain-panel overrides (§L-1057 / C87 §13.1 CW-P) ──
            //
            // MUST run AFTER Step 11. `CurtainWallStore.add()` synchronously drives
            // `CurtainPanelSyncHandler`, which mints a panel for every cell and SKIPS
            // cells that already have one. So the panels exist by now, all of them
            // regenerated as `SystemPanel_Glass` — and this pass re-applies the sparse
            // set the user actually authored ON TOP of them.
            //
            // Applying BEFORE the wall existed would find no cells; inserting panel
            // records directly would fight the sync handler. Neither is correct, and
            // the ordering is the whole reason this is a separate step rather than a
            // field on the create command.
            //
            // Absent `curtainPanels` (every snapshot saved before 2026-08-19) this is a
            // no-op and the wall keeps the regenerated glazing — which IS the pre-fix
            // behaviour, and is why the field needed no schema bump.
            if (snapshot.curtainPanels && snapshot.curtainPanels.length > 0) {
                const panelStore = (this.commandManager as { getContext?: () => { stores?: { curtainPanelStore?: unknown } } })
                    .getContext?.()?.stores?.curtainPanelStore as PanelUpdateTarget | undefined;
                if (!panelStore) {
                    // C84 EI-6 — absence must be loud. The authoring is IN the file; we
                    // simply cannot place it, and the user must not find that out by
                    // looking at a uniformly glazed façade.
                    const msg = `§L-1057 ${snapshot.curtainPanels.length} authored curtain panel(s) are in `
                        + 'this snapshot but curtainPanelStore is not on the command context, so NONE was '
                        + 'restored. Every panel reverted to regenerated glazing.';
                    console.error('[ProjectLoader] ' + msg);
                    result.warnings.push(msg);
                } else {
                    // Group by wall so each wall's grid is resolved once, by the SAME
                    // function the serializer keyed against (C84 EI-9).
                    const byWall = new Map<string, CurtainPanelOverride[]>();
                    for (const o of snapshot.curtainPanels) {
                        const list = byWall.get(o.curtainWallId);
                        if (list) list.push(o); else byWall.set(o.curtainWallId, [o]);
                    }
                    let applied = 0;
                    const lost: LostOverride[] = [];
                    for (const [cwId, overrides] of byWall) {
                        const cw = snapshot.curtainWalls.find((w: any) => w.id === cwId);
                        if (!cw) {
                            // ⚠ 'wall-gone', NOT 'grid-line-gone'. Borrowing the neighbouring
                            // reason here made the report say "the grid was edited" when the WALL
                            // is missing from the snapshot — a confidently wrong diagnosis of a
                            // different failure. CW-P-D is about the report being RIGHT.
                            for (const o of overrides) lost.push({ override: o, reason: 'wall-gone' });
                            continue;
                        }
                        const r = applyCurtainPanelOverrides(panelStore, resolveCurtainGrid(cw), overrides);
                        applied += r.applied;
                        lost.push(...r.lost);
                    }
                    console.log(`[ProjectLoader] §L-1057 restored ${applied} authored curtain panel(s).`);
                    // ⛔ C87 CW-P-D — THE ONE REFUSAL THIS DESIGN OWES. An override whose
                    // bounding grid lines no longer exist is REPORTED BY NAME, never
                    // silently dropped and never re-targeted onto a different cell: a door
                    // in the wrong cell is worse than a door reported missing. A silent
                    // `catch` here is forbidden — this is the single place the design can
                    // lose data.
                    for (const l of lost) {
                        const msg = '§L-1057 ' + describeLostOverride(l);
                        console.error('[ProjectLoader] ' + msg);
                        result.warnings.push(msg);
                    }
                }
            }

            // ── Cancellation check (before Step 12) ───────────────────────────
            if (cancelled()) {
                console.log('[ProjectLoader] Load cancelled before beams.');
                return { ...result, success: false };
            }

            // ── Step 12: Beams (priority 30) ──────────────────────────────────
            console.log(`[ProjectLoader] Loading ${snapshot.beams.length} beams`);
            for (const b of snapshot.beams) {
                try {
                    const cmd = new CreateBeamCommand({
                        // ⭐ §PERSIST-DEFAULT-PATH (L-1213) — `beamId`. The DEFAULT path has
                        // carried it since §PERSIST-L1 W1-1; this arm never did, so a project
                        // reopened on the LEGACY branch RE-IDENTIFIED every beam — support
                        // assignments, schedule rows, IFC references and `level.childrenIds`
                        // left pointing at ids that no longer existed. The divergence between
                        // the two restore paths ran in BOTH directions: this arm had
                        // `materialId` and the default one did not.
                        beamId: b.id,
                        startPoint: b.startPoint,
                        endPoint: b.endPoint,
                        width: b.width,
                        depth: b.depth,
                        levelId: b.levelId,
                        material: b.material,
                        // ⭐ C100 §2.1 / L-1127 ARM D+E — the MASTER material, READ BACK.
                        // ARM E exists because `serializeSlab` wrote an id that no loader
                        // payload listed, so the material was right in the file and gone
                        // from the reloaded element. Writing without reading is the same
                        // defect; both halves land together here.
                        materialId: b.materialId,
                        loadBearing: b.loadBearing,
                        fireRating: b.fireRating,
                        // §PERSIST-BEAM-SUPPORTS (L-1213) — the support ASSIGNMENT. AUTHORED
                        // data (`AssignBeamSupports`), and NOT re-derivable from geometry:
                        // two beams meeting a column look identical whether or not the user
                        // declared the joint, so a dropped assignment is lost for good.
                        // Serialised by `serializeBeam()`, declared on the payload, stamped
                        // onto the record by `execute()` — and read by NEITHER restore path.
                        startSupportId:   b.startSupportId,
                        endSupportId:     b.endSupportId,
                        startSupportType: b.startSupportType,
                        endSupportType:   b.endSupportType,
                        // §PERSIST-L1 (W1-2) — carry the persisted IFC GUID; it is the IFC
                        // round-trip join key and was re-minted on every reload.
                        ifcGuid: b.ifcData?.guid
                    });
                    const r = exec(cmd);
                    r.success ? result.loaded++ : this.recordFail(result, `Beam ${b.id}`, r);
                } catch (e) {
                    this.recordFail(result, `Beam ${b.id}`, { success: false, affectedElementIds: [], error: String(e) });
                }
            }

            // ── Step 13: Rooms (priority 31 — after walls for boundary accuracy) ─
            // §LOAD-HEAL-DEGENERATE-POLYGON — drop degenerate room boundaries
            // (record the affected levels so they are force-redetected below).
            const { kept: snapshotRooms, dropped: __droppedRooms } =
                dropDegeneratePolygonRecords<any>((snapshot as any).rooms, (r: any) => r?.boundary?.polygon);
            if (__droppedRooms.length > 0) {
                console.warn(`[ProjectLoader] §LOAD-HEAL-DEGENERATE-POLYGON — dropped ${__droppedRooms.length} degenerate room polygon(s) from an old snapshot`);
                for (const r of __droppedRooms) {
                    const lvl = (r as { levelId?: string })?.levelId;
                    if (typeof lvl === 'string' && lvl.length > 0) healedRoomLevelIds.add(lvl);
                }
            }
            if (Array.isArray(snapshotRooms) && snapshotRooms.length > 0) {
                console.log(`[ProjectLoader] Loading ${snapshotRooms.length} rooms`);
                const hydrated = [];
                for (const raw of snapshotRooms) {
                    try {
                        const room = deserializeRoom(raw);
                        hydrated.push(room);
                    } catch (e) {
                        this.recordFail(result, `Room ${raw.id ?? '?'}`, { success: false, affectedElementIds: [], error: String(e) });
                    }
                }
                if (hydrated.length > 0) {
                    const cmd = new BatchCreateRoomsCommand(hydrated);
                    const r = exec(cmd);
                    if (r.success) {
                        result.loaded += hydrated.length;
                    } else {
                        result.failed += hydrated.length;
                        result.errors.push(`Rooms batch: ${r.error ?? 'failed'}`);
                    }
                }
            }

            // ── Step 13b: Room Bounding Lines (priority 31.5 — with rooms) ────
            const snapshotRoomBoundingLines = (snapshot as any).roomBoundingLines;
            if (Array.isArray(snapshotRoomBoundingLines) && snapshotRoomBoundingLines.length > 0) {
                console.log(`[ProjectLoader] Loading ${snapshotRoomBoundingLines.length} room bounding line(s)`);
                let __rblSkipped = 0;
                for (const rbl of snapshotRoomBoundingLines) {
                    try {
                        // §RBL-NO-PERSIST-DEGENERATE (2026-07-02) — DROP degenerate legacy
                        // records (undefined placement) on load-migrate instead of
                        // recreating a bogus 1 m line at the origin (the old
                        // `?? {x:0,z:0}` / `?? {x:1,z:0}` default). These are re-saved out
                        // by the serializer's matching filter, so the count self-heals.
                        if (rbl?.placement?.start == null || rbl?.placement?.end == null) {
                            __rblSkipped++;
                            continue;
                        }
                        const cmd = new CreateRoomBoundingLineCommand({
                            id:         rbl.id,
                            levelId:    rbl.levelId,
                            start:      rbl.placement.start,
                            end:        rbl.placement.end,
                            name:       rbl.properties?.name,
                            color:      rbl.properties?.color,
                            createdBy:  rbl.metadata?.createdBy ?? 'system',
                        });
                        const r = exec(cmd);
                        r.success ? result.loaded++ : this.recordFail(result, `RoomBoundingLine ${rbl.id}`, r);
                    } catch (e) {
                        this.recordFail(result, `RoomBoundingLine ${rbl?.id ?? '?'}`, { success: false, affectedElementIds: [], error: String(e) });
                    }
                }
                if (__rblSkipped > 0) {
                    console.warn(`[ProjectLoader] §RBL-NO-PERSIST-DEGENERATE — skipped ${__rblSkipped} degenerate room-bounding-line(s) on load (will be dropped on next save).`);
                }
            }
            } // end legacy per-command path (PROJECT-LOAD-PERFORMANCE-13 §2)

            // ── Cancellation check (before metadata restoration) ──────────────
            if (cancelled()) {
                console.log('[ProjectLoader] Load cancelled before metadata restoration.');
                return { ...result, success: false };
            }

            // ── §PERSIST103 (L-11520) — the COMPOUND PARENTS ─────────────────
            //
            // The founder: *"11 elements did not survive project opening — the lift
            // for example, I can see it is not there."* The save half is written
            // (`lifts` / `liftParts` / `pools` / `waters` / `balconies`); this is the
            // restore half, and a save without a restore is a file that holds the data
            // and an editor that cannot show it.
            //
            // ⭐ IT IS HERE — IN THE COMMON TAIL, AFTER THE `if (useImportCmd) … else …`
            // JOIN — AND THAT PLACEMENT IS THE WHOLE POINT, NOT AN ACCIDENT OF LAYOUT.
            //
            // Every other element restore in this file exists TWICE: once in the legacy
            // branch above and once in `ImportProjectCommand` (the default path). That
            // duplication has already stranded a fix. Measured 2026-08-26:
            //
            //     grep -c "boundaryLine" ImportProjectCommand.ts   ->  0
            //     _useImportCommandPath()                          ->  true (default)
            //
            // so L-9948's boundary-line restore — Step 10c, two hundred lines above —
            // DOES NOT RUN IN PRODUCTION. The line is saved and never read back. That is
            // §PV-05's shape verbatim ("the fix landed on the copy this file does not
            // import"), and it is reported as L-11528 rather than fixed here.
            //
            // Restoring the compounds ONCE, past the join, makes both paths correct by
            // construction and gives the next family nowhere to drift.
            //
            // ⛔ IT DOES NOT RE-DISPATCH `lift.create` / `pool.create` / `balcony.create`.
            // Those verbs mint their members too, and every member ALREADY round-tripped
            // as its own family (`walls`, `curtainWalls`, `doors`, `slabs`, `floors`,
            // `handrails`) and has ALREADY been restored above. Re-dispatching would
            // double them — a lift back with eight shaft walls instead of four. See
            // `restoreCompoundFamilies.ts` for the full argument and for why the render
            // half reuses the undo/redo adapters rather than minting a rival channel.
            // ⭐ §82.7-DEFINITIONS-TRAVEL-WITH-PROJECT · STR-UCE-MASTER-SPEC §82.7 · C111
            // §4.3-a/b — THE DEFINITIONS FIRST, THEN THE OCCURRENCES. The catalogue is
            // replaced with the file's definition set (project scope) through the ONE
            // loader wrap, so `restoreCompoundFamilies()` below restores `components`
            // whose `definitionId` the verbs' resolver and the render seam can answer.
            // Awaited — the loader unzips and Zod-validates — and in the COMMON TAIL for
            // the same reason the compounds are (L-11528). A refused row is reported on
            // the LoadResult by name; its occurrences stay in the model and draw nothing.
            try {
                const __defs = await restoreComponentDefinitions(snapshot);
                if (__defs.total > 0) {
                    console.log(
                        `[ProjectLoader] §82.7 restored ${__defs.restored.length}/${__defs.total} component definition(s)` +
                        (__defs.restored.length ? `: ${__defs.restored.join(' ')}` : ''),
                    );
                }
                for (const err of __defs.errors) {
                    console.error(err);
                    result.errors.push(err);
                    result.failed++;
                }
            } catch (e) {
                const msg = `[ProjectLoader] §82.7 component-definition restore threw — placed components will have no definition to draw from: ${String(e)}`;
                console.error(msg);
                result.errors.push(msg);
            }

            try {
                const __compound = restoreCompoundFamilies(snapshot);
                if (__compound.total > 0) {
                    result.loaded += __compound.total;
                    console.log(
                        `[ProjectLoader] §PERSIST103 restored ${__compound.total} compound record(s): ` +
                        Object.entries(__compound.restored).map(([k, n]) => `${k}=${n}`).join(' '),
                    );
                }
                // A diagnosed failure that reaches nobody is still a silent failure
                // (C03 §4.6 U-4) — these ride the LoadResult the calling UI already shows.
                for (const err of __compound.errors) {
                    console.error(err);
                    result.errors.push(err);
                    result.failed++;
                }
            } catch (e) {
                // Never fail a whole project load over one compound: losing the entire
                // project is strictly worse than the defect being fixed (C13).
                const msg = `[ProjectLoader] §PERSIST103 compound restore threw — lifts/pools/balconies may be missing: ${String(e)}`;
                console.error(msg);
                result.errors.push(msg);
            }

            // FIX-12 §07 §3: Restore custom SlabSystemType definitions from snapshot.
            // Built-in presets are always present from code; only custom types need restoring.
            const snapshotSlabSystemTypes = (snapshot as any).slabSystemTypes;
            if (Array.isArray(snapshotSlabSystemTypes) && snapshotSlabSystemTypes.length > 0) {
                let restoredTypeCount = 0;
                for (const raw of snapshotSlabSystemTypes) {
                    try {
                        if (!raw.id || !raw.name || !Array.isArray(raw.layers)) {
                            console.warn('[ProjectLoader] Skipping malformed slabSystemType:', raw);
                            continue;
                        }
                        // Only restore if not already present (avoids duplicates on re-load)
                        if (slabSystemTypeStore.getById(raw.id)) continue;

                        // §M-B1 loader-side: pass `id: raw.id` so the store
                        // preserves the snapshot's UUID. Without this, every
                        // slab referencing the custom type became a dangling
                        // reference on the next reload.
                        // ⭐ §TYPE-SNAPSHOT-SPREAD (L-1214) — INVERTED: emit the whole
                        // saved definition MINUS the derived fields, instead of a
                        // hand-written include-list.
                        //
                        // The list here used to be `{id, name, description, layers}`,
                        // which is NOT the inverse of what the serializer writes —
                        // `structuredClone(t)`, i.e. EVERY field. `loadBearing`
                        // (§FEAT-LANDSCAPE-SLAB-TYPES, L-963) was therefore saved
                        // correctly and silently discarded on reload, so every custom
                        // landscape assembly came back with its structural flag UNKNOWN.
                        // That is the identical drift `wallSystemTypeCodec.ts` was created
                        // to end for `function` on the wall arm — the fix was made once
                        // and not carried across.
                        //
                        // ⭐ Spreading is safe and is the point: `SlabSystemTypeStore.add()`
                        // overwrites `id`, `createdAt`, `modifiedAt`, `layers` and
                        // `totalThickness` from its own arguments after the spread, so the
                        // four DERIVED fields cannot be forged by a snapshot, while a
                        // fifth AUTHORED field added to `SlabSystemType` next month reaches
                        // the store without anyone editing this file. Derived, not
                        // remembered — the same inversion `serializeHandrailRecord` uses.
                        const { totalThickness: _derivedThickness, createdAt: _derivedCreated,
                                modifiedAt: _derivedModified, ...savedDefinition } =
                            raw as Record<string, unknown>;
                        const restored = slabSystemTypeStore.add({
                            ...(savedDefinition as object),
                            id: raw.id,
                            name: raw.name,
                            description: raw.description,
                            layers: raw.layers,
                        });

                        // Register in ElementRegistry so the ID→store mapping is complete (FIX-11)
                        try {
                            elementRegistry.registerSemantic(restored.id, 'slabSystemType');
                        } catch {
                            // Already registered (e.g. repeated load) — safe to ignore
                        }

                        restoredTypeCount++;
                    } catch (e) {
                        console.warn('[ProjectLoader] Failed to restore slabSystemType:', raw, e);
                    }
                }
                if (restoredTypeCount > 0) {
                    console.log(`[ProjectLoader] Restored ${restoredTypeCount} custom slab system type(s) from snapshot.`);
                }
            }

            // FIX-3 (M9): Restore custom WallSystemType definitions from snapshot.
            // Built-in presets are always present from code; only custom types need restoring.
            const snapshotWallSystemTypes = (snapshot as any).wallSystemTypes;
            if (Array.isArray(snapshotWallSystemTypes) && snapshotWallSystemTypes.length > 0) {
                let restoredWallTypeCount = 0;
                for (const raw of snapshotWallSystemTypes) {
                    try {
                        // §TYPE-SNAPSHOT-CODEC — the hand-written field list that used to
                        // live here (`{id, name, description, layers}`) was NOT the inverse
                        // of what ProjectSerializer writes (`structuredClone(t)` — every
                        // field). `function` (the L-285 envelope function driving plan pen
                        // weight) was therefore saved and silently dropped on reload, so a
                        // user type declared 'exterior' came back UNDECLARED and the drawing
                        // re-weighted itself on every reopen. Save and load now share ONE
                        // codec and cannot drift field-by-field again.
                        const params = decodeWallSystemType(raw);
                        if (!params) {
                            console.warn('[ProjectLoader] Skipping malformed wallSystemType:', raw);
                            continue;
                        }
                        // Only restore if not already present (avoids duplicates on re-load)
                        if (wallSystemTypeStore.getById(params.id!)) continue;

                        // §M-B1 loader-side: preserve the snapshot UUID — same
                        // reasoning as the slabSystemTypeStore.add above.
                        const restored = wallSystemTypeStore.add(params);

                        // Register in ElementRegistry so the ID→store mapping is complete
                        try {
                            elementRegistry.registerSemantic(restored.id, 'wallSystemType' as any);
                        } catch {
                            // Already registered (e.g. repeated load) — safe to ignore
                        }

                        restoredWallTypeCount++;
                    } catch (e) {
                        console.warn('[ProjectLoader] Failed to restore wallSystemType:', raw, e);
                    }
                }
                if (restoredWallTypeCount > 0) {
                    console.log(`[ProjectLoader] Restored ${restoredWallTypeCount} custom wall system type(s) from snapshot.`);
                }
            }

            // §FEAT-HANDRAIL-TYPE-PERSISTENCE (C95 §15.7, R3) — restore custom
            // HANDRAIL TYPE definitions (the railing catalogue) from the snapshot.
            //
            // ⛔ WHY: `handrailTypeStore` is registered on `projectScopeRegistry` with
            // `clear: clearCustomTypes()`, so switching project DELETED every
            // user-authored railing type — while no save path had ever written one. A
            // DESTRUCTOR WITH NO CONSTRUCTOR (C95 §15.7, measured 2026-08-19).
            //
            // ⚠ THIS IS THE SECOND OF TWO PERSISTENCE PAIRS (C95 §3.2). The twin lives
            // at packages/persistence-client/src/loader/. Patching ONE would have made
            // a custom railing type survive on one save path and vanish on the other —
            // which is L-1102's defect exactly, one level up.
            //
            // ⭐ IT PRESERVES `raw.id`, deliberately unlike the wall arm above:
            // `HandrailTypeStore.add()` takes the whole definition INCLUDING the id, so
            // identity survives and every record's materialised fields, schedule row
            // and future library edit still point at the same type (C84 EI-1).
            const snapshotHandrailTypes = (snapshot as any).handrailTypes;
            if (Array.isArray(snapshotHandrailTypes) && snapshotHandrailTypes.length > 0) {
                let restoredHandrailTypeCount = 0;
                for (const raw of snapshotHandrailTypes) {
                    try {
                        if (!raw || !raw.id || !raw.name) {
                            console.warn('[ProjectLoader] Skipping malformed handrailType:', raw);
                            continue;
                        }
                        // `add()` THROWS on a duplicate id, so this guard is load-bearing.
                        if (handrailTypeStore.getById(raw.id)) continue;

                        // ⛔ `isBuiltIn` is NOT copied from the snapshot — the store sets it
                        // false itself, and must: a snapshot claiming `isBuiltIn: true` for a
                        // user type would make it permanently unremovable and unmodifiable,
                        // since `remove()` and `update()` both refuse on built-ins.
                        const { isBuiltIn: _ignoredBuiltIn, ...definition } = raw as Record<string, unknown>;
                        handrailTypeStore.add(definition as never);
                        restoredHandrailTypeCount++;
                    } catch (e) {
                        console.warn('[ProjectLoader] Failed to restore handrailType:', raw, e);
                    }
                }
                if (restoredHandrailTypeCount > 0) {
                    console.log(`[ProjectLoader] Restored ${restoredHandrailTypeCount} custom handrail type(s) from snapshot.`);
                }
            }

            // Restore custom CeilingSystemType definitions from snapshot.
            // Built-in presets are always present from code; only custom types need restoring.
            const snapshotCeilingSystemTypes = (snapshot as any).ceilingSystemTypes;
            if (Array.isArray(snapshotCeilingSystemTypes) && snapshotCeilingSystemTypes.length > 0) {
                let restoredCeilingTypeCount = 0;
                for (const raw of snapshotCeilingSystemTypes) {
                    try {
                        if (!raw.id || !raw.name || !Array.isArray(raw.layers)) {
                            console.warn('[ProjectLoader] Skipping malformed ceilingSystemType:', raw);
                            continue;
                        }
                        if (ceilingSystemTypeStore.getById(raw.id)) continue;

                        const layers = raw.layers ?? [];
                        const restored = ceilingSystemTypeStore.addCustomType({
                            id: raw.id,
                            name: raw.name,
                            description: raw.description,
                            layers,
                            totalThickness: raw.totalThickness ?? layers.reduce((s: number, l: any) => s + (l.thickness ?? 0), 0),
                            category: raw.category ?? 'custom',
                            tags: raw.tags,
                            ifcTypeName: raw.ifcTypeName,
                        });

                        try {
                            elementRegistry.registerSemantic(restored.id, 'ceilingSystemType');
                        } catch {
                            // Already registered — safe to ignore
                        }

                        restoredCeilingTypeCount++;
                    } catch (e) {
                        console.warn('[ProjectLoader] Failed to restore ceilingSystemType:', raw, e);
                    }
                }
                if (restoredCeilingTypeCount > 0) {
                    console.log(`[ProjectLoader] Restored ${restoredCeilingTypeCount} custom ceiling system type(s) from snapshot.`);
                }
            }

            // Restore custom FloorSystemType definitions from snapshot.
            // Built-in presets are always present from code; only custom types need restoring.
            const snapshotFloorSystemTypes = (snapshot as any).floorSystemTypes;
            if (Array.isArray(snapshotFloorSystemTypes) && snapshotFloorSystemTypes.length > 0) {
                let restoredFloorTypeCount = 0;
                for (const raw of snapshotFloorSystemTypes) {
                    try {
                        if (!raw.id || !raw.name || !Array.isArray(raw.layers)) {
                            console.warn('[ProjectLoader] Skipping malformed floorSystemType:', raw);
                            continue;
                        }
                        if (floorSystemTypeStore.getById(raw.id)) continue;

                        const layers = raw.layers ?? [];
                        const restored = floorSystemTypeStore.addCustomType({
                            id: raw.id,
                            name: raw.name,
                            description: raw.description,
                            layers,
                            category: raw.category ?? 'custom',
                            zoneTypes: raw.zoneTypes ?? ['dry'],
                            tags: raw.tags,
                            ifcTypeName: raw.ifcTypeName,
                        });

                        try {
                            elementRegistry.registerSemantic(restored.id, 'floorSystemType');
                        } catch {
                            // Already registered — safe to ignore
                        }

                        restoredFloorTypeCount++;
                    } catch (e) {
                        console.warn('[ProjectLoader] Failed to restore floorSystemType:', raw, e);
                    }
                }
                if (restoredFloorTypeCount > 0) {
                    console.log(`[ProjectLoader] Restored ${restoredFloorTypeCount} custom floor system type(s) from snapshot.`);
                }
            }

            // §M-H4 (DAILY-USE-AUDIT 2026-05-20) — Restore custom DOOR system
            // types. Without this, every door finish type the user authored
            // ("Solid oak 35mm") was wiped on every project reload — only
            // built-in presets survived (because they're re-seeded from code).
            // Doors referencing the dropped type would then log the
            // [DoorBuilder] "unknown systemTypeId" warning and fall back to
            // inline parameters. The serializer pairs with this restore.
            //
            // Architectural note: door/window stores expose `getAll()` + simple
            // `add(type)` API where the type carries its own `id` + `isBuiltIn`
            // flag — slightly different from wall/slab's `addCustomType({...})`
            // shape — so the loop here mirrors that store's contract. The
            // duplicate-skip guard prevents re-adding a type already seeded
            // from code (e.g. when a future build re-classifies a previously-
            // custom type as built-in).
            // §TYPE-SNAPSHOT-CODEC (C65 §3.1) — decoded through the SAME codec the
            // serializer encodes with (`hostedSystemTypeCodec.ts`), which owns the
            // validation and the isBuiltIn-forced-false identity policy that used to
            // be spelled inline here.
            const snapshotDoorSystemTypes = (snapshot as { doorSystemTypes?: unknown[] }).doorSystemTypes;
            if (Array.isArray(snapshotDoorSystemTypes) && snapshotDoorSystemTypes.length > 0) {
                let restoredDoorTypeCount = 0;
                for (const raw of snapshotDoorSystemTypes) {
                    try {
                        const decoded = decodeHostedSystemType(raw, 'door');
                        if (!decoded) {
                            console.warn('[ProjectLoader] Skipping malformed doorSystemType:', raw);
                            continue;
                        }
                        const existing = doorSystemTypeStore.getById?.(decoded.id as string);
                        if (existing) continue; // already seeded (built-in or earlier custom)
                        doorSystemTypeStore.add(decoded as unknown as Parameters<typeof doorSystemTypeStore.add>[0]);
                        // 'doorSystemType' is not (yet) in the StoreType enum; cast
                        // via unknown so type registration is safe even though
                        // the registry's enum doesn't list this kind today.
                        try { elementRegistry.registerSemantic(decoded.id as string, 'doorSystemType' as unknown as Parameters<typeof elementRegistry.registerSemantic>[1]); } catch { /* already registered */ }
                        restoredDoorTypeCount++;
                    } catch (e) {
                        console.warn('[ProjectLoader] Failed to restore doorSystemType:', raw, e);
                    }
                }
                if (restoredDoorTypeCount > 0) {
                    console.log(`[ProjectLoader] Restored ${restoredDoorTypeCount} custom door system type(s) from snapshot.`);
                }
            }

            // §M-H4 — Restore custom WINDOW system types (mirrors door above).
            const snapshotWindowSystemTypes = (snapshot as { windowSystemTypes?: unknown[] }).windowSystemTypes;
            if (Array.isArray(snapshotWindowSystemTypes) && snapshotWindowSystemTypes.length > 0) {
                let restoredWindowTypeCount = 0;
                for (const raw of snapshotWindowSystemTypes) {
                    try {
                        const decoded = decodeHostedSystemType(raw, 'window');
                        if (!decoded) {
                            console.warn('[ProjectLoader] Skipping malformed windowSystemType:', raw);
                            continue;
                        }
                        const existing = windowSystemTypeStore.getById?.(decoded.id as string);
                        if (existing) continue;
                        windowSystemTypeStore.add(decoded as unknown as Parameters<typeof windowSystemTypeStore.add>[0]);
                        try { elementRegistry.registerSemantic(decoded.id as string, 'windowSystemType' as unknown as Parameters<typeof elementRegistry.registerSemantic>[1]); } catch { /* already registered */ }
                        restoredWindowTypeCount++;
                    } catch (e) {
                        console.warn('[ProjectLoader] Failed to restore windowSystemType:', raw, e);
                    }
                }
                if (restoredWindowTypeCount > 0) {
                    console.log(`[ProjectLoader] Restored ${restoredWindowTypeCount} custom window system type(s) from snapshot.`);
                }
            }

            // Phase 3: Restore VG Governance state from snapshot (additive, no side effects)
            if (snapshot.vgGovernance) {
                vgGovernanceStore.deserialize(snapshot.vgGovernance);
                console.log('[ProjectLoader] VG Governance state restored from snapshot');
            }

            // A.R.3 (Revit round-trip · S55) — restore per-element IFC/Revit metadata
            // (GlobalId + psets + quantities) into the runtime IfcMetaStore so an
            // imported IFC/Revit model keeps its round-trip join keys across reload.
            // The store lives on the runtime (per-runtime instance, not a module
            // singleton), reached via window.runtime — the same typed-cast pattern used
            // for runtime.bus below (§U-B1).
            //
            // IMPORTANT — project-switch isolation: we ALWAYS touch the store on load,
            // not only when the snapshot carries metadata. The dedicated C13 project-
            // switch reset is not yet wired (tracker A.R.3 step 2 note), so a project
            // WITHOUT ifcElementMeta must still CLEAR any metadata left by a previously
            // open project — otherwise project A's GlobalIds would leak into an export
            // of project B. hydrate() Zod-validates + clears-then-loads; reset() clears.
            try {
                const ifcMetaStore = (window as {
                    runtime?: { ifcMetaStore?: { hydrate(s: unknown): number; reset(): void } };
                }).runtime?.ifcMetaStore;
                const ifcMeta = (snapshot as any).ifcElementMeta;
                if (ifcMetaStore) {
                    if (ifcMeta) {
                        const n = ifcMetaStore.hydrate(ifcMeta);
                        console.log(`[ProjectLoader] Restored ${n} IFC/Revit element meta record(s) from snapshot`);
                    } else {
                        ifcMetaStore.reset();   // clear any prior project's metadata
                    }
                } else if (ifcMeta) {
                    console.warn('[ProjectLoader] ifcElementMeta present in snapshot but runtime.ifcMetaStore is unavailable — IFC/Revit metadata not restored');
                }
            } catch (e) {
                console.error('[ProjectLoader] Failed to hydrate IFC/Revit element meta:', e);
            }

            // Phase A: Restore Semantic Tag index from snapshot
            if ((snapshot as any).semanticTags) {
                semanticIndex.deserialize((snapshot as any).semanticTags);
                console.log('[ProjectLoader] Semantic tag index restored from snapshot');
            }

            // Phase B: Restore ViewDefinition store from snapshot
            if ((snapshot as any).viewDefinitions) {
                viewDefinitionStore.deserialize((snapshot as any).viewDefinitions);
                console.log('[ProjectLoader] ViewDefinition store restored from snapshot');
            }

            // Phase C: Restore VisibilityRule engine from snapshot
            if ((snapshot as any).visibilityRules) {
                visibilityRuleEngine.deserialize((snapshot as any).visibilityRules);
                console.log('[ProjectLoader] Visibility rule engine restored from snapshot');
            }

            if ((snapshot as any).visibilityIntents) {
                visibilityIntentStore.deserialize((snapshot as any).visibilityIntents);
                console.log('[ProjectLoader] Visibility intent store restored from snapshot');
            }

            if ((snapshot as any).viewIntentInstances) {
                viewIntentInstanceStore.deserialize((snapshot as any).viewIntentInstances);
                console.log('[ProjectLoader] View intent instance store restored from snapshot');
            }

            // Phase 8.1 — VG → Intent migration (one-time, idempotent)
            // Runs only for projects that have VGTemplates but no migrated intents yet.
            // After migration, the Intent system is the style authority.
            try {
                const { intentCount, viewCount, overrideCount } = runVGToIntentMigration();
                if (intentCount > 0 || viewCount > 0 || overrideCount > 0) {
                    console.log(
                        `[ProjectLoader] Phase 8.1 migration complete: ` +
                        `${intentCount} intents, ${viewCount} view instances, ${overrideCount} overrides`
                    );
                }
            } catch (migErr) {
                console.warn('[ProjectLoader] Phase 8.1 VG→Intent migration failed (non-fatal):', migErr);
            }

            // Master Plan Wave 1 / Stage P0 — View Template → Intent.viewSeed migration.
            // One-time, idempotent. Runs after VG→Intent so the absorbed Intents
            // sit alongside any VG-derived ones. Skipped once any `migrated-vt-*`
            // intent already exists.
            try {
                // §FIX-EMPTY-LOAD-HANG (L-108) — statically imported at module top;
                // no per-load lazy-chunk fetch / await yield. No-op for a new project.
                const { intentCount, viewCount, skippedCount } = runViewTemplateToIntentMigration();
                if (intentCount > 0 || viewCount > 0 || skippedCount > 0) {
                    console.log(
                        `[ProjectLoader] Wave 1 / P0 view-template absorption complete: ` +
                        `${intentCount} intents, ${viewCount} view bindings, ${skippedCount} skipped`
                    );
                }
            } catch (vtMigErr) {
                console.warn('[ProjectLoader] Wave 1 / P0 view-template absorption failed (non-fatal):', vtMigErr);
            }
            __mark('migrations'); // §DIAG-EMPTY-LOAD-HANG — VG/VT intent migrations

            // Phase 8.2 — Style cache pre-warming (background micro-task)
            // Pre-resolves styles for all known element types so the first render
            // frame is served from cache (Contract 25a §8.2 — target < 0.5ms cold resolve).
            setTimeout(() => {
        // §SWALLOW-OPTIONAL — cache PREWARM only. Every consumer of the intent-style
        // cache populates it lazily on first use, so a failed prewarm costs one frame
        // of latency and changes no result. It is deliberately fired off the load path
        // (setTimeout 0) precisely so it can never fail a project open.
        try { prewarmIntentStyleCache(); } catch { /* §SWALLOW-OPTIONAL */ }
    }, 0);

            // §TITLE-BLOCK-EDIT-FORKS (L-10690) LEG 2 of 3 — restore the user's
            // own title-block templates BEFORE the sheets that reference them by
            // id, so a sheet carrying `titleBlock: 'tb-user-...'` never resolves
            // through `getDefault()` on the way in and renders as an A1 for one
            // frame.
            //
            // ⛔ `deserialize` is called UNCONDITIONALLY. A snapshot with no
            // `titleBlocks` key is a project with no user templates, and the
            // store must be cleared to match it — skipping the call would leave
            // the PREVIOUS project's templates in place, which is the C13 leak
            // this store's scope registration exists to prevent.
            titleBlockStore.deserialize((snapshot as any).titleBlocks);
            console.log('[ProjectLoader] Title-block templates restored from snapshot');

            // Phase III: Restore Sheet store from snapshot
            if ((snapshot as any).sheets) {
                sheetStore.deserialize((snapshot as any).sheets);
                console.log('[ProjectLoader] Sheet store restored from snapshot');
            }

            // Phase III: Restore Schedule store from snapshot
            if ((snapshot as any).schedules) {
                scheduleStore.deserialize((snapshot as any).schedules);
                console.log('[ProjectLoader] Schedule store restored from snapshot');
            } else {
                // Seed default schedules if none were in the snapshot
                scheduleStore.seedDefaultSchedules();
            }

            // #105 Materials Repository — restore user-created/uploaded materials.
            if ((snapshot as any).userMaterials) {
                userMaterialStore.deserialize((snapshot as any).userMaterials);
                console.log('[ProjectLoader] User materials restored from snapshot');
            }

            // Data Platform — Phase 4 (schema v2)
            // Restore hierarchy nodes, template definitions/assignments, and element codes.
            // All three blocks are guaranteed to exist on v2 snapshots (migration backfills them).
            // Defensive `if` guard retained for safety against edge-case snapshots.
            if (snapshot.hierarchy) {
                hierarchyStore.deserialize(snapshot.hierarchy.nodes);
                console.log(`[ProjectLoader] Hierarchy store restored from snapshot (${snapshot.hierarchy.nodes.length} nodes)`);
            }

            // §FIX-GIS-SITE-STATE-NOT-PERSISTED (L-188) — restore the C19 SiteModel into
            // the live runtime.siteModelStore + re-seed the LTP-ENU geospatial origin +
            // re-emit site.* events, so reopening a GIS project shows its REAL location
            // + parcel boundary (the sun/Cesium/parcel-renderer re-anchor via the events)
            // instead of silently defaulting to Madrid. ALWAYS invoked (even when
            // snapshot.site is absent) so a non-GIS project resets any prior project's
            // site for C13 isolation — mirrors the IfcMetaStore restore above.
            try {
                // §MANUALENV159 (L-12640) — repopulate the RAW user-supplied study-height state
                // FIRST: `restoreSiteState` (next call) reads it by site id to rehydrate the
                // displayed study against the boundary it is about to restore. A snapshot saved
                // before this lane has no `manualStudyHeight` key, and `restoreUserSuppliedStudyHeights`
                // treats `undefined` the same as "nothing recorded" — never throws, never invents one.
                restoreUserSuppliedStudyHeights(
                    (snapshot as { manualStudyHeight?: { bySiteId?: Record<string, { heightM: number; setbackM: number; savedAtIso: string }> } }).manualStudyHeight?.bySiteId,
                );
                const restored = restoreSiteState(
                    (window as { runtime?: import('@pryzm/runtime-composer/types').PryzmRuntime }).runtime,
                    (snapshot as { site?: import('@pryzm/schemas').SiteModel | null }).site ?? null,
                );
                if (restored) console.log('[ProjectLoader] §FIX-GIS-SITE-STATE-NOT-PERSISTED — C19 site state restored from snapshot');

                // §L-545-SITE-CAPTURE-PROVENANCE (L-188 / L-489) — SAY IT, DO NOT SWALLOW IT.
                //
                // Before this, a snapshot saved WITH geometry but WITHOUT a georeference
                // reopened indistinguishably from a plain non-GIS project: `snapshot.site`
                // was null, `restoreSiteState` had nothing to anchor with, and the load
                // reported success. The building floated, 3D Site rendered nothing, the
                // envelope would not re-derive — and no line of output said why. The
                // serializer now stamps `siteCapture`, so the reopen can name the cause.
                //
                // Deliberately NOT fatal and deliberately NOT a repair attempt: there is
                // nothing to repair from — the origin is simply not in the file. Inventing
                // one (a default city, a bbox centroid) is the L-459 mistake, and it would
                // render a fabricated location as convincingly as a surveyed one.
                const capture = (snapshot as { siteCapture?: { status?: string; reason?: string; elementCount?: number } }).siteCapture;
                if (capture?.status === 'degraded') {
                    console.error(
                        '[ProjectLoader] ⚠ §L-545 — THIS PROJECT WAS SAVED WITHOUT A GEOREFERENCE. ' +
                        `It carries ${capture.elementCount ?? '?'} element(s) but no C19 site, so the model has no ` +
                        'origin: it will appear misplaced in 3D Site, context will not load, and any ' +
                        'buildable-envelope result cannot be re-derived. This is recorded loss, not a ' +
                        `load failure — the geometry is intact. Cause at save time: ${capture.reason ?? 'unrecorded'}.`,
                    );
                    try {
                        (window as { runtime?: { events?: { emit?: (t: string, p: unknown) => void } } }).runtime?.events?.emit?.(
                            'pryzm:toast',
                            {
                                message: 'This project was saved without a site georeference — the model has no origin. Re-select the site/parcel to restore it.',
                                severity: 'warning',
                            },
                        );
                    } catch { /* toast is best-effort; the console line above is the record */ }
                } else if (capture === undefined && ((snapshot as { site?: unknown }).site == null)) {
                    // Pre-L-545 snapshot with no site. UNKNOWABLE whether a georeference was
                    // lost or never existed — say exactly that rather than assert either.
                    console.log(
                        '[ProjectLoader] §L-545 — snapshot predates site-capture provenance; ' +
                        'cannot distinguish "never had a site" from "site was lost at save".',
                    );
                }
            } catch (e) {
                console.warn('[ProjectLoader] §FIX-GIS-SITE-STATE-NOT-PERSISTED — site restore failed (non-fatal):', e);
            }
            if (snapshot.templates) {
                templateStore.deserialize(snapshot.templates.templates);
                templateAssignmentStore.deserialize(snapshot.templates.assignments);
                console.log(
                    `[ProjectLoader] Template store restored from snapshot ` +
                    `(${snapshot.templates.templates.length} templates, ` +
                    `${snapshot.templates.assignments.length} assignments)`
                );
            }
            if (snapshot.elementCodes) {
                elementCodeStore.deserialize({
                    codes: snapshot.elementCodes.codes,
                    counters: snapshot.elementCodes.counters,
                });
                console.log(`[ProjectLoader] Element code store restored from snapshot (${snapshot.elementCodes.codes.length} codes)`);
            }

            // §RATES157 (L-12503) — restore/migrate the 5D rate book.
            //
            // There is no in-memory rate store (mirrors `ProjectSerializer`'s write
            // side): `MedicionesBucket.ts` reads/writes a per-project cache directly
            // in `localStorage` under `rateBookStorageKey(projectId)`, so restoring
            // means reconciling THAT cache against `snapshot.rates` rather than
            // calling a `.deserialize()` on a store. The precedence rule (never
            // clobber a populated side; an empty side gets filled in) is documented
            // and unit-tested, in both directions, in `rateBookSnapshotSync.ts` —
            // read that file's header for the full reasoning, not this comment.
            try {
                if (typeof window !== 'undefined' && window.localStorage) {
                    const ratePid = (snapshot as any).projectId ?? null;
                    const rateCacheKey = rateBookStorageKey(ratePid);
                    const cachedRaw = window.localStorage.getItem(rateCacheKey);
                    const snapRates = (snapshot as any).rates as
                        { version?: 1; currency?: string; entries?: RateEntry[] } | undefined;
                    // The PRECEDENCE decision is pure and lives in `rateBookSnapshotSync.ts`
                    // (unit-tested in both directions there); this call site only performs
                    // the actual localStorage I/O the decision asks for.
                    const decision = reconcileRateBookOnLoad(snapRates, cachedRaw);
                    if (decision.action === 'write-cache' && decision.cacheValue !== undefined) {
                        window.localStorage.setItem(rateCacheKey, decision.cacheValue);
                    }
                    console.log(`[ProjectLoader] ${decision.message}`);
                }
            } catch (e) {
                console.warn('[ProjectLoader] §RATES157 rate book restore/migration failed (non-fatal):', e);
            }

            // Phase D — D-1 (schema v3): Restore SemanticGraph relationships.
            // If absent (v1/v2 snapshots), graph remains empty — relationships will
            // be repopulated as commands are subsequently executed.
            if (snapshot.semanticGraph) {
                // §GR10-DESERIALIZE-DROP-REPORT (C71 §5.7 · C70 L-INV-1/I-INV-3).
                // This log used to print `relationships.length` — the INPUT count —
                // as the restored count, so a slice whose rows were half-refused
                // reported full success. It now prints what was ADMITTED, and the
                // refusals travel to result.warnings instead of vanishing.
                const graphLoad = semanticGraphManager.deserialize(snapshot.semanticGraph);
                console.log(`[ProjectLoader] SemanticGraph restored (${graphLoad.loaded} of ${graphLoad.presented} relationship rows admitted)`);
                if (graphLoad.absent) {
                    const msg = `[ProjectLoader] SemanticGraph slice present but UNREADABLE (${graphLoad.absent}) — the graph is not empty, it is UNKNOWN. Nothing was invented in its place.`;
                    console.warn(msg);
                    result.warnings.push(msg);
                }
                if (graphLoad.dropped.length > 0) {
                    // Never a silent drop (C71 §5.7 — a defect that self-erases on
                    // reload is a defect nobody can reproduce). Each row is NAMED
                    // by index/id/reason, never reduced to a bare count.
                    const msg = `[ProjectLoader] SemanticGraph: ${graphLoad.dropped.length} malformed relationship row(s) refused at load — ${graphLoad.dropped.map(d => `#${d.index} ${d.id ?? '<no id>'}: ${d.reason}`).join(' · ')}`;
                    console.warn(msg);
                    result.warnings.push(msg);
                }
            } else {
                semanticGraphManager.clear();
                console.log('[ProjectLoader] SemanticGraph cleared (v1/v2 snapshot — no graph data)');
            }

            // Gap 2 (Phase 3.2): If the graph is empty after deserialize, rebuild it
            // from the snapshot data so pre-graph projects get a populated graph.
            if (semanticGraphManager.size === 0) {
                const { added, unreconstructable } = rebuildSemanticGraphFromSnapshot(snapshot);
                if (added > 0) {
                    console.log(`[ProjectLoader] SemanticGraph rebuilt from snapshot (${added} relationships)`);
                }
                if (unreconstructable.length > 0) {
                    // C70 I-INV-3 — a pre-graph snapshot loses nothing SILENTLY: name
                    // the families the rebuild cannot reconstruct from authoritative state.
                    console.warn(`[ProjectLoader] SemanticGraph rebuild: ${unreconstructable.length} family/families not reconstructable from this snapshot (persist-or-lose, named per C70 I-INV-3): ${unreconstructable.join(', ')}`);
                }
            }

            // PV-05 (C70 I-INV-2) §PV-05-APP-COPY — restore the C23 AI-lineage
            // substrate. Kept in lock-step with the persistence-client copy of
            // this loader (C71 §250 names the duplication); that copy had this
            // block from 8cab70c1, this one — the one production builds — did not.
            if (this.provenanceStore) {
                // Project LOAD replaces the project, so the live lineage is
                // cleared first: hydrate() refuses to merge two lineages
                // (C23 §1.9), and merging is exactly the wrong answer here.
                this.provenanceStore.reset();
                // C75 §2.6 — read the slice THROUGH the type, never around it.
                // `ProjectSnapshot.provenance` is already declared as
                // `SerializedProvenance | undefined` (ProjectSerializer.ts:290)
                // and `hydrate()` takes exactly that, so the `as any` this line
                // used to carry bought nothing and cost the one check that
                // matters: it defeated the provenance union at the precise
                // boundary the union exists to police.
                const prov = this.provenanceStore.hydrate(snapshot.provenance);
                if (prov.absent) {
                    // C75 §1.4 / C70 I-INV-3 — the absence is NAMED. A snapshot
                    // without the slice is not a project with no AI history; it
                    // is one whose AI history predates provenance persistence
                    // and is UNRECOVERABLE. "I could not look" is never "I
                    // found nothing".
                    const msg = `[ProjectLoader] Provenance slice absent (${prov.absent}) — the C23 AI-lineage log for this snapshot is NOT empty, it is UNRECOVERABLE. Nothing was invented in its place.`;
                    console.warn(msg);
                    result.warnings.push(msg);
                } else {
                    console.log(`[ProjectLoader] Provenance restored (${prov.artefacts} artefacts, ${prov.edges} edges, ${prov.contextSnapshots} context snapshots, ${prov.redactions} redactions)`);
                }
                if (prov.edgesUndetermined) {
                    // §GR-10 · C78 §8.1 — a slice with NO `edges` member is not
                    // a slice with zero edges. Named, never folded into 0.
                    const msg = `[ProjectLoader] Provenance: lineage EDGES undetermined (${String(prov.edgesUndetermined)}) — the slice carried no edges member, which is not the same as having none.`;
                    console.warn(msg);
                    result.warnings.push(msg);
                }
                if (prov.dropped.length > 0) {
                    // Never a silent drop (the C71 §5.7 ARM E lesson).
                    const msg = `[ProjectLoader] Provenance: ${prov.dropped.length} malformed row(s) refused at load — ${prov.dropped.map(d => `${d.kind} ${d.id}: ${d.reason}`).join(' · ')}`;
                    console.warn(msg);
                    result.warnings.push(msg);
                }
            } else if (snapshot.provenance) {
                // The snapshot HAS a lineage and this session cannot hold it.
                // Saying nothing would let the next save write the key away.
                // Bound through the TYPE (see above): `artefacts` is a required
                // member of SerializedProvenance, so the count below is read off
                // the declared shape rather than off an `any`.
                const slice = snapshot.provenance;
                const msg = `[ProjectLoader] Snapshot carries a C23 provenance slice (${slice.artefacts?.length ?? 0} artefacts) but no ProvenanceStore was wired into this loader — the lineage is NOT loaded and MUST NOT be re-saved from this session.`;
                console.warn(msg);
                result.warnings.push(msg);
            }

            // Phase G — G-1 (schema v4): Restore TemporalGraph mutation log.
            // If absent (v1–v3 snapshots), temporal graph remains empty — mutations
            // will be recorded incrementally from this point forward.
            if ((snapshot as any).temporalGraph) {
                temporalGraphManager.deserialize((snapshot as any).temporalGraph);
                console.log(
                    `[ProjectLoader] TemporalGraph restored (` +
                    `${(snapshot as any).temporalGraph.edges?.length ?? 0} edges, ` +
                    `${(snapshot as any).temporalGraph.mutations?.length ?? 0} mutations)`
                );
            } else {
                temporalGraphManager.clear();
                console.log('[ProjectLoader] TemporalGraph cleared (pre-v4 snapshot — no temporal data)');
            }

            // Phase G — G-3 (schema v4): Restore DecisionRecordStore.
            // If absent (v1–v3 snapshots), store remains empty — decisions will
            // be recorded incrementally from this point forward.
            if ((snapshot as any).decisionRecords) {
                decisionRecordStore.deserialize((snapshot as any).decisionRecords);
            } else {
                decisionRecordStore.clear();
                console.log('[ProjectLoader] DecisionRecordStore cleared (pre-v4 snapshot — no decision data)');
            }


            // Autonomous Auditor — Phase 0: Restore RequirementStore.
            // If absent (all prior snapshots), store remains empty — brief starts blank.
            const reqData = (snapshot as any).requirements;
            if (reqData?.records && Array.isArray(reqData.records)) {
                try {
                    requirementStore.clear();
                    let reqLoaded = 0;
                    for (const record of reqData.records) {
                        try {
                            requirementStore.add(record);
                            reqLoaded++;
                        } catch (e) {
                            console.warn('[ProjectLoader] Failed to restore requirement', record?.id, e);
                        }
                    }
                    console.log(`[ProjectLoader] RequirementStore restored: ${reqLoaded} requirements`);
                } catch (importErr) {
                    console.warn('[ProjectLoader] RequirementStore not available (non-fatal):', importErr);
                }
            } else {
                requirementStore.clear();
                console.log('[ProjectLoader] RequirementStore cleared (no requirement data in snapshot)');
            }

            // Autonomous Auditor — Phase 3: Restore AssetCatalogStore.
            // If snapshot contains assetCatalog, restore it directly.
            // If absent (all prior snapshots), re-seed from built-in defaults.
            const catalogData = (snapshot as any).assetCatalog;
            try {
                if (catalogData?.entries && Array.isArray(catalogData.entries) && catalogData.entries.length > 0) {
                    assetCatalogStore.setDirect(catalogData.entries);
                    console.log(`[ProjectLoader] AssetCatalogStore restored: ${catalogData.entries.length} entries`);
                } else {
                    // Seed from defaults — new project or pre-Phase-3 snapshot
                    assetCatalogStore.setDirect(buildDefaultAssetCatalog());
                    console.log('[ProjectLoader] AssetCatalogStore seeded from defaults');
                }
            } catch (catalogErr) {
                console.warn('[ProjectLoader] AssetCatalogStore not available (non-fatal):', catalogErr);
            }

            // §31 Phase 2 — Restore DXF/DWG underlay overlays
            // The DxfOverlayStore is restored here; actual THREE.js geometry is
            // rebuilt lazily by DxfImportPanel.restoreDxfOverlay() after the scene
            // is ready (dispatched via pryzm-project-loaded event).
            const dxfData = (snapshot as any).dxfOverlays;
            try {
                if (dxfData?.overlays && Array.isArray(dxfData.overlays) && dxfData.overlays.length > 0) {
                    const { dxfOverlayStore: dxfStore } = await import('@pryzm/file-format');
                    dxfStore.restore(dxfData);
                    console.log(`[ProjectLoader] DxfOverlayStore restored: ${dxfData.overlays.length} overlay(s)`);
                    // Signal that DXF overlays need geometry rebuild after scene is ready
                    window.runtime?.events?.emit('pryzm-dxf-restore-overlays', { overlays: dxfData.overlays }); // F.events.13
                }
            } catch (dxfErr) {
                console.warn('[ProjectLoader] DxfOverlayStore restore failed (non-fatal):', dxfErr);
            }

            // ADR-0346 / C13 §3.13 (L-2900) — Restore LINKED MODEL REFERENCES.
            //
            // References only: no linked element ever enters a store, so there is
            // nothing here to clear from the element side and nothing to exclude on
            // save. The geometry is rebuilt by `linkedModelController.syncAll()`,
            // which the store's own change broadcast triggers — the same route a
            // user-created link takes, so restore and create cannot diverge.
            //
            // `restore()` DROPS AND COUNTS rows whose `hostProjectId` names another
            // project. A link belongs to the project that created it (C13 §3.13
            // rule 3); silently adopting a foreign ref would launder it into host
            // state, which is precisely the crossing this contract governs.
            try {
                const linkData = (snapshot as any).linkedModels;
                if (linkData?.links && Array.isArray(linkData.links)) {
                    const { linkedModelStore } = await import('../links/LinkedModelStore');
                    const hostId = (snapshot as any).projectId ?? null;
                    const dropped = linkedModelStore.restore(linkData, hostId);
                    console.log(
                        `[ProjectLoader] §C13-LINKED-MODELS restored: ${linkData.links.length - dropped} link(s)`
                        + (dropped > 0 ? `, ${dropped} DROPPED (host mismatch)` : ''),
                    );
                }
            } catch (linkErr) {
                console.warn('[ProjectLoader] LinkedModelStore restore failed (non-fatal):', linkErr);
            }

            // §ANN-A2 — Restore Annotation store from snapshot
            // §ANN-TYPE-PERSIST — restore CUSTOM annotation system types BEFORE the
            // annotations that point at them, so no element loads with a dangling
            // `systemTypeId` and silently falls back to a default presentation.
            if ((snapshot as any).annotationSystemTypes) {
                annotationSystemTypeStore.deserialize((snapshot as any).annotationSystemTypes);
            }
            if ((snapshot as any).annotations) {
                annotationStore.deserialize((snapshot as any).annotations);
                const annSnap = (snapshot as any).annotations as { annotations?: any[]; dimensions?: any[] };
                console.log(
                    `[ProjectLoader] Annotation store restored from snapshot ` +
                    `(${annSnap.annotations?.length ?? 0} annotations, ` +
                    `${annSnap.dimensions?.length ?? 0} dimensions)`
                );
            } else {
                annotationStore.clear();
                console.log('[ProjectLoader] Annotation store cleared (no annotation data in snapshot)');
            }

            // ── ANNOTATION-SYSTEM-AUDIT-2026 — restore additional slices ────────
            // Order matters here:
            //   1. Constraints (A4) — must be restored before the dependency
            //      graph is rebuilt so the solver can re-evaluate them.
            //   2. Visibility hide list (B8).
            //   3. OBC bridge map (B9) — restore before subsequent OBC events
            //      can fire so deletions resolve to the right annotation.
            //   4. AnnotationDependencyGraph.rebuild (A5) — rehydrates the
            //      reverse-index from element ids to dependent annotation ids
            //      so subsequent element updates push through to annotations.
            try {
                // §FIX-EMPTY-LOAD-HANG (L-108) — constraintStore is statically
                // imported at module top (same package as annotationStore, already
                // in the boot graph). No per-load `await import()` yield / lazy chunk.
                const constraintsSlice = (snapshot as any).annotationConstraints;
                if (constraintsSlice) {
                    constraintStore.deserialize(constraintsSlice);
                } else {
                    constraintStore.clear();
                }
            } catch (e) {
                console.warn('[ProjectLoader] ConstraintStore restore failed (non-fatal):', e);
            }

            try {
                // §FIX-EMPTY-LOAD-HANG (L-108) — static import (see module top).
                const visibilitySlice = (snapshot as any).annotationVisibility;
                // fromJSON({}) wipes the internal hide map, so we use it both to
                // restore an empty payload and to apply a non-empty one.
                annotationVisibilityStore.fromJSON(
                    (visibilitySlice && typeof visibilitySlice === 'object') ? visibilitySlice : {}
                );
            } catch (e) {
                console.warn('[ProjectLoader] AnnotationVisibilityStore restore failed (non-fatal):', e);
            }

            try {
                // §FIX-EMPTY-LOAD-HANG (L-108) — static import (see module top).
                const obcSlice = (snapshot as any).obcAnnotationMap;
                if (obcSlice) {
                    obcAnnotationAdapter.deserialize(obcSlice);
                }
            } catch (e) {
                console.warn('[ProjectLoader] OBCAnnotationAdapter restore failed (non-fatal):', e);
            }

            try {
                // ANNOTATION-SYSTEM-AUDIT-2026 A5 — rebuild the dependency
                // graph from the restored annotations so element-update events
                // again propagate to the annotations that reference them.
                // The graph instance lives on the AnnotationManager created in
                // initTools and is exposed as window.annotationDependencyGraph
                // (also threaded through CommandContext for future callers).
                const depGraph =
                    (typeof window !== 'undefined') ? window.annotationDependencyGraph : null;
                if (depGraph && typeof depGraph.rebuild === 'function') {
                    depGraph.rebuild();
                    console.log('[ProjectLoader] AnnotationDependencyGraph rebuilt after restore');
                }
            } catch (e) {
                console.warn('[ProjectLoader] AnnotationDependencyGraph rebuild failed (non-fatal):', e);
            }
            __mark('nonelement_stores'); // §DIAG-EMPTY-LOAD-HANG — all non-element store restores + annotation slices

            result.success = result.errors.length === 0 || result.loaded > 0;
            __marksSummary();       // §DIAG-EMPTY-LOAD-HANG — per-substep breakdown of the hydrate window
            __phase('hydrate');     // element + non-element store hydration done
            console.log(
                `[ProjectLoader] Load complete: ${result.loaded} loaded, ` +
                `${result.failed} failed, ${result.errors.length} errors`
            );

            if (result.errors.length > 0) {
                console.warn('[ProjectLoader] Errors:', result.errors);
            }

        } catch (err) {
            result.errors.push(String(err));
            console.error('[ProjectLoader] Fatal error:', err);
        } finally {
            // ── PERF-AUDIT-2026 P0: Flush event buffer ────────────────────────
            // Dispatches all buffered StoreEventBus events in insertion order.
            // Builders (WallBuilder, SlabBuilder, etc.) receive their events here
            // and fire geometry updates exactly once per type, regardless of how
            // many elements were loaded.  Safe to call from finally — if depth is
            // already 0 (e.g. nested batch already closed it) this is a no-op.
            storeEventBus.endBatch();
            // §FIX-TEMPORAL-LOAD-REPLAY-RATCHET (L-5820) — resume the INSTANT the
            // replay flush is done, and not one statement earlier: everything the
            // buffer just delivered is a restore, everything after it is the user.
            // In `finally` (not after the try) so a fatal load error can never
            // leave the manager permanently deaf to real edits.
            temporalGraphManager.resumeRecording();
            __phase('event_flush'); // builders fanned out — geometry pipeline drained
            // ── End PERF-AUDIT-2026 P0 batch close ───────────────────────────

            // ── §LOAD-RAF-PAUSE — flush wall rebuild ONCE before resuming room
            //    topology observer so walls/buildWall geometry is final before
            //    the post-load REDETECT_ROOMS sweep runs.  Must come AFTER
            //    storeEventBus.endBatch() above so all CREATE events have been
            //    delivered to builders, but BEFORE topologyObserver.resume()
            //    so the room re-detection scans final wall geometry.
            // §WALL-JOIN-LOAD-SKIP (2026-06-24) — project-open HANG fix. The persisted
            // wall geometry is ALREADY join-resolved (ProjectSerializer saves the trimmed
            // baseline verbatim), so re-running the whole-level WallJoinResolver.resolveLevel
            // pass on the critical load thread is redundant and blocks for large residential
            // buildings (hundreds–thousands of walls × 5–6 floors → "Loading Auto-save…"
            // forever). Setting this flag for the duration of this single resumeAndFlush()
            // routes the coordinator to its RESTORE path: build every wall from its persisted
            // baseline (O(walls), no resolve) + defer ONE whole-level resolve per level off
            // the critical path to refine the mitered corner caps. The flag is set ONLY here
            // and cleared immediately after, so live-edit flushes are unaffected.
            // §PERF-L03-PHASE (P1.2) — wall restore flush span start. Covers the
            // synchronous RESTORE-path build (build every wall from baseline) + the
            // per-level deferred resolveLevel SCHEDULING. The deferred resolves
            // themselves run asynchronously OFF this critical path (§WALL-JOIN-LOAD-SKIP),
            // so this measures the on-thread cost the loader is accountable for.
            const __tWallRestore = performance.now();
            try {
                (globalThis as unknown as { __pryzmWallRestoreFlush?: boolean }).__pryzmWallRestoreFlush = true;
                wallRebuildControl?.resumeAndFlush?.();
            } catch (e) {
                console.warn('[ProjectLoader] __wallRebuildControl.resumeAndFlush() failed', e);
            } finally {
                (globalThis as unknown as { __pryzmWallRestoreFlush?: boolean }).__pryzmWallRestoreFlush = false;
            }
            __phase('wall_rebuild_flush'); // WallJoinResolver + buildWall coalesced pass
            // §PERF-L03-PHASE (P1.2) — wall restore flush + deferred-resolve scheduling total.
            __perfPhase('wall_restore_flush', __tWallRestore, `walls=${snapshot.walls?.length ?? 0}`);
            // §PERF-L03-PHASE (P1.2) — redetect-sweep dispatch span start (the
            // synchronous scheduling of the per-level ReDetectRooms dispatch; the
            // chunked path drains one level per frame off this span). Logged at the
            // redetect_sweep boundary below.
            const __tRedetectSweep = performance.now();
            // ── End §LOAD-RAF-PAUSE flush ────────────────────────────────────

            // ── ROOM TOPOLOGY OBSERVER — resume + final REDETECT_ROOMS sweep ─
            // Mirrors BatchCoordinator._executeFinalSweep: fires exactly ONE
            // ReDetectRoomsCommand per loaded level after the event buffer has
            // flushed and geometry is built. Replaces the per-level ×3 storm
            // that previously blocked the main thread during load.
            try { topologyObserver?.resume?.(); } catch (e) { console.warn('[ProjectLoader] roomTopologyObserver.resume() failed', e); }

            // §LOAD-REDETECT-FREEZE (2026-06-25) — project-open FREEZE fix.
            //
            // Rooms ARE persisted in the snapshot (ProjectSerializer writes
            // `snapshot.rooms`; both load paths hydrate them via
            // BatchCreateRoomsCommand — Step 13 in the legacy path,
            // ImportProjectCommand in the fast path). When a level already
            // carries hydrated rooms, re-running the full
            // RoomDetectionEngine.detectRoomsForLevel() graph-walk on EVERY
            // level is pure redundant work — for a 783-element / 7-level
            // residential building it dominated load as a ~6 s `redetect_sweep`
            // phase (`[ProjectLoader] §LOAD-PHASE name=redetect_sweep
            // total=6025.9ms`), each level preceded by hundreds of
            // `[BimManager] Unregistered element …` churn lines as the
            // freshly-detected room IDs replaced the hydrated ones, plus the
            // WallRebuildCoordinator re-queue + WallJoinResolver multi-cluster
            // storm those redetects re-triggered.
            //
            // Hydrating the persisted rooms IS the authoritative state
            // (ADR-0069 — graph-authoritative room identity at execution: the
            // saved rooms already carry their identity + semantic data, and the
            // persisted wall geometry is already join-resolved — see
            // §WALL-JOIN-LOAD-SKIP above). So: SKIP the redetect for any level
            // whose rooms were restored from the snapshot, and only redetect
            // levels that have NO persisted rooms (legacy/pre-room-persistence
            // snapshots, or a level whose rooms went missing). New geometry and
            // manual edits are unaffected — they still redetect through the
            // now-resumed RoomTopologyObserver debounce, exactly as before, so
            // room detection for NEW walls is preserved.
            const persistedRooms = (snapshot as { rooms?: Array<{ levelId?: string }> }).rooms;
            const skipRedetectLevels = levelsWithPersistedRooms(persistedRooms);
            // §LOAD-HEAL-DEGENERATE-POLYGON — a level whose persisted rooms we
            // DROPPED (degenerate boundary) must NOT be skipped: it has to
            // redetect so it re-seals from the now join-resolved walls. Remove
            // healed levels from the skip-set (the raw snapshot still lists their
            // dropped rooms, so levelsWithPersistedRooms() would otherwise skip).
            for (const lvlId of healedRoomLevelIds) skipRedetectLevels.delete(lvlId);

            // ── §LOAD-REDETECT-CHUNKED (2026-06-30) — project-open FREEZE fix B ──
            // The per-level redetect sweep used to run as ONE synchronous for-loop:
            // each `room.redetect` dispatch lands (via the CustomEvent bridge) on a
            // synchronous `commandManager.execute(ReDetectRoomsCommand)` whose
            // RoomDetectionEngine.detectRoomsForLevel() graph-walk + the room-store
            // churn it drives (→ `bim-room-updated` → SpatialTree.refreshTree +
            // RuleEngine re-validation, per level) all run on the SAME task. For a
            // 7-level building that is a multi-hundred-ms synchronous block that
            // freezes the WebGL viewport right as the scene appears — the founder's
            // forced-WebGL "3D view freezes while opening" symptom. §LOAD-CHUNKED
            // (ADR-060) chunked the element BUILD but not THIS post-load sweep.
            //
            // Fix: drive the sweep through the P3-owned FrameScheduler (no new rAF)
            // ONE LEVEL PER FRAME, so the browser paints between levels and the
            // viewport stays live + builds progressively. Fire-and-forget, exactly
            // like the old loop (load() never awaited these dispatches). A runtime
            // kill-switch (globalThis.__pryzmChunkedLoad === false) routes back to
            // the synchronous one-task sweep for parity debugging.
            const levelsToRedetect = (Array.isArray(snapshot.levels) ? snapshot.levels : [])
                .filter((lvl: any) => lvl?.id && !skipRedetectLevels.has(lvl.id));
            const skippedLevels = (Array.isArray(snapshot.levels) ? snapshot.levels.length : 0) - levelsToRedetect.length;
            if (skippedLevels > 0) {
                console.log(
                    `[ProjectLoader] §LOAD-REDETECT-FREEZE — hydrated persisted rooms; ` +
                    `skipped redetect for ${skippedLevels} level(s) ` +
                    `(${skipRedetectLevels.size} level(s) had saved rooms), ` +
                    `redetecting ${levelsToRedetect.length} level(s) without persisted rooms` +
                    `${healedRoomLevelIds.size > 0 ? ` (incl. ${healedRoomLevelIds.size} healed)` : ''}.`,
                );
            }

            if (levelsToRedetect.length > 0) {
                const elevationOf = (lvl: any) => (typeof lvl.elevation === 'number' ? lvl.elevation : 0);
                const heightOf    = (lvl: any) => (typeof lvl.height === 'number' ? lvl.height : 3.0);
                const dispatchOne = (lvl: any): void => {
                    try {
                        // Phase F-1.2: dispatch to room.redetect bus handler, which calls
                        // commandManager internally (initBusHandlers.ts §P0-A39 registration).
                        window.runtime?.bus?.executeCommand('room.redetect', {
                            levelId:   lvl.id,
                            elevation: elevationOf(lvl),
                            height:    heightOf(lvl),
                        })?.catch((e: unknown) => {
                            console.warn(`[ProjectLoader] room.redetect bus dispatch failed for level '${lvl.id}':`, e);
                        });
                    } catch (e) {
                        console.warn(`[ProjectLoader] Final REDETECT_ROOMS failed for level '${lvl.id}':`, e);
                    }
                };

                if (this._useChunkedLoad()) {
                    // §LOAD-REDETECT-CHUNKED — drain the level queue ONE PER FRAME:
                    // redetect a level, then schedule the next on the FrameScheduler's
                    // next post-render tick (the browser paints in between). A simple
                    // recursive drain — the same pattern the chunked element load uses.
                    // §AUTOSAVE-SUPPRESS-DURING-LOAD — the drain owns closing the
                    // suppression window (on the frame AFTER the last redetect); the
                    // finally-tail fallback must NOT close it synchronously here.
                    // §PROGRESS-SCHEDULER (2026-08-07) — this sweep is NON-VISUAL
                    // correctness work (room topology + the autosave-suppression
                    // window that closes behind it), so it must not stop when the
                    // tab hides. `scheduleProgress` keeps the one-level-per-frame
                    // cadence while visible and switches to an unclamped
                    // macrotask while hidden. Without this, hiding the tab
                    // mid-sweep left rooms undetected AND left autosave
                    // suppressed indefinitely — the next snapshot would then
                    // persist a half-redetected model.
                    __suppressCloseDeferred = true;
                    const queue = [...levelsToRedetect];
                    const drainNext = (): void => {
                        const lvl = queue.shift();
                        if (!lvl) { __closeAutosaveSuppress(); return; }
                        dispatchOne(lvl);
                        if (queue.length > 0) {
                            scheduleProgress('project-load-redetect', drainNext, 'post-render');
                        } else {
                            // §AUTOSAVE-SUPPRESS-DURING-LOAD — the LAST level's redetect has
                            // been dispatched; give its downstream store churn (room updates →
                            // spatial-tree refresh → rule re-validation) one more frame to
                            // settle, THEN re-enable autosave so the single post-load snapshot
                            // captures the fully-settled model.
                            scheduleProgress('project-load-redetect', __closeAutosaveSuppress, 'post-render');
                        }
                    };
                    // Kick the first level off the next frame too, so the load()
                    // finally block returns (and the scene paints) before any redetect
                    // runs — the viewport is never blocked synchronously at open.
                    scheduleProgress('project-load-redetect', drainNext, 'post-render');
                    console.log(
                        `[ProjectLoader] §LOAD-REDETECT-CHUNKED — scheduled ${levelsToRedetect.length} per-level redetect(s) ` +
                        `across frames (one level/frame) so the viewport paints progressively instead of freezing.`,
                    );
                } else {
                    // Synchronous fallback (parity with pre-fix one-task sweep).
                    for (const lvl of levelsToRedetect) dispatchOne(lvl);
                }
            }
            // ── End topology observer resume ──────────────────────────────────

            // ── UNDO STACK — clear after rehydration (Contract 20 GAP-3) ─────
            // §U-B1 (DAILY-USE-AUDIT 2026-05-20) — clear THREE stacks, not just the
            // legacy commandManager. Before this fix, the PRYZM-3 RingBufferUndoStack
            // and the command-bus EventRecord UndoStack survived project load: the
            // user's first Ctrl+Z applied an inverse JSON-Patch from the PREVIOUS
            // project (no-op on missing IDs, data corruption on ID collision).
            // `runtime.bus.clearUndoStacks()` (added in composeRuntime §U-B1) wipes
            // both PRYZM-3 stacks; commandManager.clearHistory wipes the legacy one.
            try { this.commandManager.clearHistory(); } catch (e) { /* no-op */ }
            try {
                const r = (window as { runtime?: { bus?: { clearUndoStacks?: () => void } } }).runtime;
                r?.bus?.clearUndoStacks?.();
            } catch (e) { /* no-op */ }
            // ── End undo stack clear ──────────────────────────────────────────

            // ── §L-224 — publish the EXPECTED element-id set for the audit ─────
            // ProjectIsolationAudit fires on `pryzm-project-loaded` (emitted by
            // PlatformShell / PlatformVersionController AFTER this load resolves).
            // It compares the live scene + element stores against the ids this
            // snapshot declared: any live element whose id is NOT in this set is a
            // cross-project leftover (the founder-reported "reminiscencia"). We
            // publish here — in the load finally, on every path — so the audit can
            // run on EVERY load (not only empty ones) with zero false positives:
            // legitimately-restored elements are all in the set. Derived state
            // (redetected rooms, room-bounding-lines, annotations) is intentionally
            // NOT part of the audited surface, so it is not included here.
            try {
                const __expectedIds: string[] = [];
                const __pushIds = (arr: unknown): void => {
                    if (!Array.isArray(arr)) return;
                    for (const e of arr) {
                        const id = (e as { id?: unknown } | null)?.id;
                        if (typeof id === 'string' && id.length > 0) __expectedIds.push(id);
                    }
                };
                const s = snapshot as unknown as Record<string, unknown>;
                __pushIds(s.walls);     __pushIds(s.slabs);    __pushIds(s.columns);
                __pushIds(s.beams);     __pushIds(s.stairs);   __pushIds(s.roofs);
                __pushIds(s.furniture); __pushIds(s.handrails); __pushIds(s.curtainWalls);
                __pushIds(s.plumbing);  __pushIds(s.ceilings); __pushIds(s.floors);
                __pushIds(s.grids);     __pushIds(s.doors);    __pushIds(s.windows);
                // §L-711 (ADR-0298 — COMPLETENESS, not presence) — `lighting`.
                //
                // `§PERSIST-LIGHTING` added `snapshot.lighting` to the serializer AND a
                // restore loop at Step 10b of this file, but never to THIS list. Every
                // restored fixture therefore registered an `elementRegistry` root with an
                // id outside the expected set, and the §L-325 render-registry audit
                // reported it verbatim as "N FOREIGN root(s) FROM A PRIOR PROJECT" —
                // in a fresh session, on live `096e12b4`, where no prior project existed.
                //
                // Lighting is NOT derived state: it is authored, serialized and restored
                // one-for-one, so C13 §3.10's deliberate exclusion of redetected rooms /
                // room-bounding-lines / annotations does not cover it. The expectation was
                // simply incomplete, and an incomplete expectation does not weaken the
                // audit quietly — it makes it accuse the innocent, which is worse: it
                // trains the reader to discount a P0 line. (§CONTEXT-DATA-HONESTY: the
                // audit's model and the world disagreed, and the model won the log.)
                __pushIds(s.lighting);
                // L-9948 — `boundaryLines`, for the same COMPLETENESS reason as
                // `lighting` above (§L-711). A restored boundary line registers an
                // `elementRegistry` root; omitting it here would make the §L-325 audit
                // report every legitimately-restored line as "a FOREIGN root FROM A
                // PRIOR PROJECT". An incomplete expectation does not weaken an audit
                // quietly — it makes it accuse the innocent, which trains the reader to
                // discount a P0 line.
                __pushIds(s.boundaryLines);
                // §PERSIST103 (L-11520) — the five compound slices, for the SAME
                // COMPLETENESS reason as `lighting` above (§L-711), and this is the
                // THIRD time that reason has had to be written out. A restored lift,
                // cabin part, pool, water body or balcony registers an
                // `elementRegistry` root; omitting them here would make the §L-325
                // audit report every legitimately-restored compound as "a FOREIGN root
                // FROM A PRIOR PROJECT". An incomplete expectation does not weaken an
                // audit quietly — it makes it accuse the innocent, which trains the
                // reader to discount a P0 line.
                __pushIds(s.lifts);      __pushIds(s.liftParts);
                __pushIds(s.pools);      __pushIds(s.waters);
                __pushIds(s.balconies);
                // §COMPONENT-PLACE (audit §12 Phase 4C) — the FOURTH time the reason
                // above has had to be written out. A restored placed component registers
                // an `elementRegistry` root exactly as the five compounds do; omitting it
                // would make the §L-325 audit report every legitimately-restored
                // occurrence as "a FOREIGN root FROM A PRIOR PROJECT".
                __pushIds(s.components);
                // §C13-SCENE-ID-KEY — `levels`, for the same COMPLETENESS reason as
                // `lighting` above (§L-711), surfaced by the same widening.
                //
                // `LevelVisualizer` stamps every level datum line + label with
                // `{ elementType: 'LevelLine', id: level.id }` (LevelVisualizer.ts:241/290)
                // and `snapshot.levels` is serialized, restored one-for-one project state —
                // not derived. It was absent from this list only because the scene check was
                // gated on `userData.elementId`, which no level line carries, so nothing
                // ever asked. Now that the check reads `id` as well, omitting levels would
                // make the audit accuse every legitimately-restored storey. Incomplete
                // expectations do not weaken an audit quietly; they make it cry wolf.
                __pushIds(s.levels);
                (globalThis as unknown as {
                    __pryzmLoadedProjectExpectation?: { projectId: string; elementIds: string[] };
                }).__pryzmLoadedProjectExpectation = {
                    projectId: (s.projectId as string | undefined) ?? '<unknown>',
                    elementIds: __expectedIds,
                };
            } catch (e) { /* audit expectation is best-effort — never fail a load over it */ }
            // ── End §L-224 audit expectation ──────────────────────────────────

            // Reference loadedLevelIds so TS strict mode doesn't flag it unused.
            // (Reserved for future per-level instrumentation.)
            void loadedLevelIds;

            __phase('redetect_sweep'); // explicit per-level ReDetectRoomsCommand sweep
            // §PERF-L03-PHASE (P1.2) — redetect-sweep synchronous dispatch total.
            __perfPhase('redetect_sweep', __tRedetectSweep);
            // §AUTOSAVE-LOAD-SLOW-OR-HANG — clear the watchdog. Load has reached
            // the summary line; no longer at risk of silent hang.
            clearInterval(__watchdog);
            const __t_total = performance.now() - __t_load_start;
            // ONE summary line so the cold-open log shows the wall-clock budget
            // distribution at a glance.  Phases sum to total within ~0.1 ms; any
            // residual is tiny inter-phase bookkeeping.
            console.log(
                `[ProjectLoader] PHASE_TIMINGS total=${__t_total.toFixed(1)}ms ` +
                `setup=${(__phase_ms.setup ?? 0).toFixed(1)}ms ` +
                `hydrate=${(__phase_ms.hydrate ?? 0).toFixed(1)}ms ` +
                `event_flush=${(__phase_ms.event_flush ?? 0).toFixed(1)}ms ` +
                `wall_rebuild_flush=${(__phase_ms.wall_rebuild_flush ?? 0).toFixed(1)}ms ` +
                `redetect_sweep=${(__phase_ms.redetect_sweep ?? 0).toFixed(1)}ms ` +
                `[walls=${snapshot.walls?.length ?? 0} ` +
                `slabs=${snapshot.slabs?.length ?? 0} ` +
                `levels=${snapshot.levels?.length ?? 0} ` +
                `curtainWalls=${snapshot.curtainWalls?.length ?? 0}]`
            );

            // §AUTOSAVE-LOAD-SLOW-OR-HANG — defensive clearInterval: if any
            // exception thrown above bypasses the earlier clearInterval at
            // the redetect_sweep phase, this guarantees the watchdog stops
            // firing. Idempotent — clearInterval on a cleared id is a no-op.
            clearInterval(__watchdog);
            // §LOAD-REDETECT-FREEZE — restore per-element verbose logging now
            // that the (synchronous) restore replay + sweep dispatch is done.
            (globalThis as unknown as { __pryzmProjectLoadActive?: boolean }).__pryzmProjectLoadActive = false;

            // §AUTOSAVE-SUPPRESS-DURING-LOAD — close the suppression window. When the
            // chunked redetect drain is active it OWNS the close (fires it on the frame
            // after the last level), so skip here to avoid re-enabling autosave before
            // the sweep settles. In every other path (sync-fallback sweep, no levels to
            // redetect, cancelled/failed load) close it now so autosave never stays
            // permanently suppressed. Idempotent via the __suppressClosed latch.
            if (!__suppressCloseDeferred) __closeAutosaveSuppress();
            console.groupEnd();
        }

        return result;
    }

    // GR-06 / GR-08 — the SemanticGraph pre-graph rebuild used to live here as a
    // private method AND as a byte-identical copy in persistence-client's
    // ProjectLoader. It is now the single-owner `rebuildSemanticGraphFromSnapshot`
    // (imported from @pryzm/persistence-client above); both loaders call it.
    // See packages/persistence-client/src/loader/rebuildSemanticGraph.ts (C71 §5.3/§7.j).

    private recordFail(result: LoadResult, label: string, r: any): void {
        result.failed++;
        const msg = `${label}: ${r.error ?? r.info?.join(', ') ?? 'failed'}`;
        result.errors.push(msg);
        console.warn(`[ProjectLoader] Failed: ${msg}`);
    }

    /**
     * PROJECT-LOAD-PERFORMANCE-13 §2 (Phase 1) — feature-flag resolver for the
     * ImportProjectCommand fast path.
     *
     * Default is ON.  Two overrides, checked in order:
     *
     *   1. Vite build env: VITE_PRYZM_USE_IMPORT_COMMAND
     *        - 'false' / '0' / 'off' → legacy path
     *        - any other value (including unset)              → new path
     *
     *   2. Browser localStorage: 'PRYZM_USE_IMPORT_COMMAND'
     *        - same semantics as above; takes precedence over the env var so a
     *          developer can flip the path at runtime without rebuilding.
     *
     * Wrapped in try/catch because (a) `import.meta.env` access is rejected by
     * the TS isolatedModules compiler unless the build target supports it, and
     * (b) localStorage throws in private-browsing modes / SSR contexts.
     */
    private _useImportCommandPath(): boolean {
        const isFalsy = (v: unknown): boolean => {
            if (typeof v !== 'string') return false;
            const lc = v.trim().toLowerCase();
            return lc === 'false' || lc === '0' || lc === 'off' || lc === 'no';
        };

        // Runtime override (highest priority)
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                const ls = window.localStorage.getItem('PRYZM_USE_IMPORT_COMMAND');
                if (ls !== null) return !isFalsy(ls);
            }
        } catch { /* private-browsing or sandboxed iframe — fall through */ }

        // Build-time env override
        try {
            const env = (import.meta as any)?.env;
            const v = env?.VITE_PRYZM_USE_IMPORT_COMMAND;
            if (typeof v === 'string' && v.length > 0) return !isFalsy(v);
        } catch { /* env not available — fall through */ }

        // Default: new path on
        return true;
    }

    /**
     * §LOAD-CHUNKED (2026-06-29) — feature-flag resolver for the chunked,
     * frame-yielding load dispatch. Default ON. Overrides (checked in order):
     *
     *   1. globalThis.__pryzmChunkedLoad (boolean) — runtime kill-switch a dev
     *      can flip in the console without reload.
     *   2. localStorage 'PRYZM_CHUNKED_LOAD' — 'false'/'0'/'off'/'no' → sync path.
     *
     * Falling back to `false` routes the load through the original synchronous
     * one-task `exec(importCmd)` path (byte-identical to pre-fix behaviour).
     */
    private _useChunkedLoad(): boolean {
        const isFalsy = (v: unknown): boolean => {
            if (typeof v !== 'string') return false;
            const lc = v.trim().toLowerCase();
            return lc === 'false' || lc === '0' || lc === 'off' || lc === 'no';
        };

        // Runtime boolean kill-switch (highest priority).
        const g = globalThis as unknown as { __pryzmChunkedLoad?: boolean };
        if (typeof g.__pryzmChunkedLoad === 'boolean') return g.__pryzmChunkedLoad;

        // localStorage override.
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                const ls = window.localStorage.getItem('PRYZM_CHUNKED_LOAD');
                if (ls !== null) return !isFalsy(ls);
            }
        } catch { /* private-browsing or sandboxed iframe — fall through */ }

        // Default: chunked load on
        return true;
    }
}
