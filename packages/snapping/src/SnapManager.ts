import * as THREE from '@pryzm/renderer-three/three';
import {
    ISnapProvider,
    SnapCandidate,
    SnapResult,
    SnapSettings,
    SnapType,
    DEFAULT_SNAP_SETTINGS,
    DEFAULT_SNAP_PRIORITIES
} from './types';
// §SNAP-LEVEL-SCOPE (L-1108) — the level-scoping policy lives in ONE module; this
// class is the only place that APPLIES it. See LevelScope.ts for the reasoning.
import {
    OTHER_LEVEL_DEMOTION,
    classifyCandidateLevel,
    type SnapLevelRelation,
} from './LevelScope';
import { SnapVisualizer } from './SnapVisualizer';
import { WallSnapProvider } from './providers/WallSnapProvider';
import { WallJoinSnapProvider } from './providers/WallJoinSnapProvider';
import { GridSnapProvider } from './providers/GridSnapProvider';
import { CurtainWallSnapProvider } from './providers/CurtainWallSnapProvider';
import { DoorSnapProvider } from './providers/DoorSnapProvider';
import { WindowSnapProvider } from './providers/WindowSnapProvider';
import { ColumnSnapProvider } from './providers/ColumnSnapProvider';
import { SlabSnapProvider } from './providers/SlabSnapProvider';
import { StairSnapProvider } from './providers/StairSnapProvider';
import { FurnitureSnapProvider } from './providers/FurnitureSnapProvider';
import { BeamSnapProvider } from './providers/BeamSnapProvider';
// §L-432 — parcel boundary + buildable-envelope setback line as snap targets.
import { SiteContextSnapProvider, type SiteSnapContext } from './providers/SiteContextSnapProvider';

/**
 * §SNAP-LEVEL-SCOPE (L-1108) — the app's answer to "which storey is being drawn on?".
 *
 * Reads `window.projectContext.activeLevelId` through the same guarded lazy-global
 * pattern `gatherCandidates()` already uses for the wall-store mutation guard and that
 * ADR-0112 introduced for `SlabSnapProvider`. `@pryzm/snapping` is L1/L3 and cannot
 * import the L3 `ProjectContext` type without inverting the dependency, so the global
 * is the seam. Fully guarded — an absent global just means "level unknown", which
 * `LevelScope.ts` treats as leave-alone, never a crash and never a silent filter.
 */
function defaultActiveLevelAccessor(): string | null {
    try {
        const win: any = typeof window !== 'undefined' ? window : undefined;
        return win?.projectContext?.activeLevelId ?? null;
    } catch { return null; }
}

export class SnapManager {
    private providers: Map<string, ISnapProvider> = new Map();
    private settings: SnapSettings;
    private visualizer: SnapVisualizer | null = null;
    private activeStartPoint: THREE.Vector3 | null = null;
    private overrideDistance: number = 0.15;

    /** §WALL-DEEP-2026 O1 — one-shot warning latch (process-lifetime). */
    private static _warnedMidMutation = false;

    /**
     * §SNAP-LEVEL-SCOPE (L-1108) — accessor for the storey being drawn on.
     *
     * An ACCESSOR, not a value, and read on every `snap()`: a level switch must take
     * effect on the next pointer-move without re-registering anything. This mirrors
     * the accessor ADR-0112 already gave `SlabSnapProvider`; that one is now a
     * special case of this general rule rather than the only level-aware thing in
     * the pipeline.
     */
    private _getActiveLevelId?: () => string | null | undefined = defaultActiveLevelAccessor;

    /**
     * §SNAP-LEVEL-SCOPE (L-1108) — when true (the default) other-storey element
     * references are OFFERED BUT SUBORDINATE. When false they are dropped outright.
     *
     * Default true because deleting them would destroy the "align the Level-1 wall to
     * the Level-0 wall below" gesture that ADR-0112 exists to provide. The founder's
     * defect was not that the reference existed — it was that it won SILENTLY.
     */
    private _crossLevelReferences: boolean = true;

    /** One-shot per-process log latch so the policy is PROVABLE in a live console. */
    private static _loggedCrossLevelDemotion = false;

    constructor(settings: Partial<SnapSettings> = {}) {
        this.settings = {
            ...DEFAULT_SNAP_SETTINGS,
            ...settings,
            enabledTypes: settings.enabledTypes || new Set(DEFAULT_SNAP_SETTINGS.enabledTypes)
        };
    }

    initVisualizer(scene: THREE.Scene): void {
        if (this.visualizer) {
            this.visualizer.dispose();
        }
        this.visualizer = new SnapVisualizer(scene);
    }

    registerProvider(provider: ISnapProvider): void {
        this.providers.set(provider.providerType, provider);
    }

    unregisterProvider(providerType: string): void {
        const provider = this.providers.get(providerType);
        if (provider?.dispose) {
            provider.dispose();
        }
        this.providers.delete(providerType);
    }

    setSettings(settings: Partial<SnapSettings>): void {
        this.settings = {
            ...this.settings,
            ...settings
        };
        if (settings.enabledTypes) {
            this.settings.enabledTypes = new Set(settings.enabledTypes);
        }
    }

    getSettings(): SnapSettings {
        return { ...this.settings };
    }

    setEnabled(enabled: boolean): void {
        this.settings.enabled = enabled;
        if (!enabled && this.visualizer) {
            this.visualizer.hideImmediate();
        }
    }

    isEnabled(): boolean {
        return this.settings.enabled;
    }

    setSnapRadius(radius: number): void {
        this.settings.snapRadius = radius;
    }

    enableSnapType(type: SnapType): void {
        this.settings.enabledTypes.add(type);
    }

    disableSnapType(type: SnapType): void {
        this.settings.enabledTypes.delete(type);
    }

    toggleSnapType(type: SnapType): boolean {
        if (this.settings.enabledTypes.has(type)) {
            this.settings.enabledTypes.delete(type);
            return false;
        } else {
            this.settings.enabledTypes.add(type);
            return true;
        }
    }

    // ── §SNAP-LEVEL-SCOPE (L-1108) — active-storey context ───────────────────

    /**
     * Supply the accessor that answers "which storey is being drawn on?".
     *
     * Takes a FUNCTION rather than an id so a level switch needs no re-registration.
     * `createWithDefaults()` wires the app's `window.projectContext.activeLevelId`;
     * callers that hold the value directly should prefer {@link setActiveLevelId}.
     */
    setActiveLevelAccessor(fn: (() => string | null | undefined) | undefined): void {
        // Passing `undefined` is a deliberate OPT-OUT: with no accessor every candidate
        // classifies as 'unknown' and nothing is demoted — the pre-L-1108 behaviour.
        this._getActiveLevelId = fn;
    }

    /** Convenience over {@link setActiveLevelAccessor} for a caller holding the id. */
    setActiveLevelId(levelId: string | null | undefined): void {
        this._getActiveLevelId = () => levelId;
    }

    /** The storey currently being drawn on, or `null` when unknown. */
    getActiveLevelId(): string | null {
        try { return this._getActiveLevelId?.() ?? null; }
        catch { return null; }
    }

    /**
     * Toggle whether OTHER-storey element references are offered at all.
     *
     * `true`  (default) — offered, demoted by {@link OTHER_LEVEL_DEMOTION}, tagged
     *                     `metadata.crossLevel` so the visualiser can say so.
     * `false`           — dropped. A hard level filter. Only for callers that
     *                     genuinely want a single-storey world.
     */
    setCrossLevelReferences(enabled: boolean): void {
        this._crossLevelReferences = enabled;
    }

    /** @see setCrossLevelReferences */
    getCrossLevelReferences(): boolean {
        return this._crossLevelReferences;
    }

    /**
     * Sets the active drawing start point and propagates the context to all
     * providers that implement `onContextChange` (e.g. WallJoinSnapProvider).
     */
    setActiveStartPoint(point: THREE.Vector3 | null): void {
        this.activeStartPoint = point?.clone() || null;

        // Propagate context to all aware providers
        for (const provider of this.providers.values()) {
            if (provider.onContextChange) {
                provider.onContextChange(this.activeStartPoint);
            }
        }
    }

    /**
     * @param worldTolerance §WALL-AUDIT-2026-W5 — optional per-call snap radius
     *        (metres) that overrides `this.settings.snapRadius` for THIS call only.
     *        Callers (WallTool, CurtainWallTool, BeamTool) can supply the same
     *        camera-zoom-aware tolerance computed via CameraToleranceService that
     *        WallJoinResolver uses, ensuring preview snap and post-creation join
     *        agree on what "touching" means.
     */
    snap(
        worldPoint: THREE.Vector3,
        screenPosition?: { x: number; y: number },
        forceNoSnap: boolean = false,
        worldTolerance?: number,
    ): SnapResult {
        const result: SnapResult = {
            snapped: false,
            point: worldPoint.clone(),
            candidate: null,
            allCandidates: []
        };

        if (!this.settings.enabled || forceNoSnap) {
            if (this.visualizer) {
                this.visualizer.hide();
            }
            return result;
        }

        const effectiveRadius =
            worldTolerance != null && Number.isFinite(worldTolerance) && worldTolerance > 0
                ? worldTolerance
                : this.settings.snapRadius;

        const candidates = this.gatherCandidates(worldPoint, effectiveRadius);
        result.allCandidates = candidates;

        if (candidates.length === 0) {
            if (this.visualizer) {
                this.visualizer.hide();
            }
            return result;
        }

        const rankedCandidates = this.rankCandidates(candidates, worldPoint, effectiveRadius);

        // §SNAP-LEVEL-SCOPE (L-1108) — report the SCOPED, ranked set, not the raw gather.
        // `rankCandidates()` is where the level policy is applied, so a caller reading
        // `allCandidates` from the raw list would see candidates the manager has already
        // ruled out (and, under `setCrossLevelReferences(false)`, ones it dropped
        // outright). No consumer outside this package reads the field — measured — so
        // this narrows the contract to the honest answer rather than breaking one.
        result.allCandidates = rankedCandidates;

        if (rankedCandidates.length > 0) {
            const best = rankedCandidates[0]!;
            result.snapped = true;
            result.point = best.point.clone();
            result.candidate = best;

            if (this.visualizer) {
                this.visualizer.show(best, screenPosition);
            }
        } else {
            if (this.visualizer) {
                this.visualizer.hide();
            }
        }

        return result;
    }

    snapWithOverride(
        worldPoint: THREE.Vector3,
        rawWorldPoint: THREE.Vector3,
        screenPosition?: { x: number; y: number },
        worldTolerance?: number,
    ): SnapResult {
        const snapResult = this.snap(worldPoint, screenPosition, false, worldTolerance);

        if (snapResult.snapped && snapResult.candidate) {
            const distToSnap = rawWorldPoint.distanceTo(snapResult.candidate.point);
            const distToRaw = rawWorldPoint.distanceTo(worldPoint);

            if (distToRaw < this.overrideDistance && distToSnap > distToRaw * 1.5) {
                return {
                    snapped: false,
                    point: rawWorldPoint.clone(),
                    candidate: null,
                    allCandidates: snapResult.allCandidates
                };
            }
        }

        return snapResult;
    }

    /**
     * §WALL-AUDIT-2026-W5: `radius` is now passed in by `snap()` so a single
     * snap call uses one consistent tolerance — either the per-call camera-
     * zoom-aware value or `this.settings.snapRadius` as fallback.
     */
    private gatherCandidates(queryPoint: THREE.Vector3, radius?: number): SnapCandidate[] {
        const candidates: SnapCandidate[] = [];
        const r = radius ?? this.settings.snapRadius;

        // §WALL-DEEP-2026 O1 (RESOLVED 2026-04-24) — mid-mutation guard.
        //   If the WallStore is currently inside a mutation (i.e. its emit()
        //   loop is fanning out and a subscriber re-entered SnapManager via a
        //   secondary cascade), return an empty candidate list. Reading a
        //   half-mutated wall would produce a snap point against geometry
        //   that no longer exists. The one-time warning surfaces the bypass
        //   so it can be diagnosed in dev.
        //   §SNAP-LEVEL-SCOPE (L-1108) — this read was a BARE `window`, unlike every
        //   other global read in this file. `snap()` therefore threw a ReferenceError
        //   in any non-DOM environment, which is why no test had ever driven the
        //   manager end-to-end: only individual providers could be exercised. Guarded
        //   to match the accessor above; behaviour in the browser is unchanged.
        const wallStoreGlobal = (typeof window !== 'undefined' ? (window as any) : undefined)?.wallStore;
        const mutationDepth = wallStoreGlobal?.getMutationDepth?.() ?? 0;
        if (mutationDepth > 0) {
            if (!SnapManager._warnedMidMutation) {
                console.warn(
                    `[SnapManager] gatherCandidates() invoked while WallStore ` +
                    `is mid-mutation (depth=${mutationDepth}). Returning empty ` +
                    `candidate set to avoid stale-snapshot snap targets. ` +
                    `(Logged once per process — see WALL-WINDOW-DOOR-DEEP-REVIEW §O1.)`
                );
                SnapManager._warnedMidMutation = true;
            }
            return [];
        }

        for (const provider of this.providers.values()) {
            const providerCandidates = provider.getCandidates(
                queryPoint,
                r,
                this.settings.enabledTypes
            );
            candidates.push(...providerCandidates);
        }

        // Perpendicular candidates from wall provider (handled separately because
        // they need the activeStartPoint which is owned by SnapManager)
        if (this.activeStartPoint && this.settings.enabledTypes.has(SnapType.PERPENDICULAR)) {
            const wallProvider = this.providers.get('wall') as WallSnapProvider | undefined;
            if (wallProvider) {
                const perpCandidates = wallProvider.getPerpendicularCandidates(
                    this.activeStartPoint,
                    queryPoint,
                    r
                );
                candidates.push(...perpCandidates);
            }
        }

        return candidates;
    }

    private rankCandidates(
        candidates: SnapCandidate[],
        _queryPoint: THREE.Vector3,
        radius?: number,
    ): SnapCandidate[] {
        const priorityOverrides = this.settings.priorityOverrides || new Map();
        const r = radius ?? this.settings.snapRadius;

        // §SNAP-LEVEL-SCOPE (L-1108) — read the storey ONCE per ranking pass, not
        // once per candidate: a level switch mid-sort would produce an incoherent
        // ordering, and the accessor may reach a store.
        const activeLevelId = this.getActiveLevelId();

        const scoped: SnapCandidate[] = [];
        let demotedCount = 0;
        let demotedSample: SnapCandidate | null = null;

        for (const c of candidates) {
            const relation: SnapLevelRelation = classifyCandidateLevel(c, activeLevelId);

            if (relation === 'other') {
                // Hard-filter mode: the other storey does not exist for this caller.
                if (!this._crossLevelReferences) continue;
                demotedCount++;
                if (!demotedSample) demotedSample = c;
            }

            const basePriority = priorityOverrides.get(c.type) ??
                DEFAULT_SNAP_PRIORITIES[c.type] ?? 50;

            const distanceFactor = Math.max(0, 1 - (c.distance / r));
            let adjustedPriority = basePriority + (distanceFactor * 10);

            // THE demotion. Wider than the whole priority band, so an other-storey
            // reference can never outrank an active-storey one or a datum — however
            // much closer to the cursor it happens to be. It survives only as the
            // last thing standing, which is the "align to the wall below" case.
            if (relation === 'other') adjustedPriority -= OTHER_LEVEL_DEMOTION;

            scoped.push({
                ...c,
                priority: adjustedPriority,
                // Tag it. The founder's defect was a ground-floor reference winning
                // SILENTLY; an unlabelled subordinate candidate would only make it
                // rarer, not honest. SnapVisualizer reads this.
                metadata: relation === 'other'
                    ? { ...(c.metadata ?? {}), crossLevel: true, sourceLevelId: c.levelId, activeLevelId }
                    : c.metadata,
            });
        }

        // Reachability evidence (see the lane brief: "committed is not reachable").
        // One line, once per process, naming BOTH storeys — so a live console proves
        // the policy ran in the real app rather than only in a test.
        if (demotedCount > 0 && !SnapManager._loggedCrossLevelDemotion) {
            SnapManager._loggedCrossLevelDemotion = true;
            console.log(
                `[SnapManager] §SNAP-LEVEL-SCOPE (L-1108) active level "${activeLevelId}" — ` +
                `${demotedCount} other-storey snap candidate(s) demoted by ${OTHER_LEVEL_DEMOTION} ` +
                `(first: ${demotedSample?.type} on level "${demotedSample?.levelId}" ` +
                `from ${demotedSample?.sourceType ?? '?'} ${demotedSample?.sourceId ?? '?'}). ` +
                'They remain available as subordinate references; they can no longer outrank ' +
                'an active-level target or a project-wide datum. Logged once per process.'
            );
        }

        return scoped
            .sort((a, b) => {
                if (Math.abs(a.priority - b.priority) > 5) {
                    return b.priority - a.priority;
                }
                return a.distance - b.distance;
            });
    }

    updateProviders(): void {
        for (const provider of this.providers.values()) {
            if (provider.update) {
                provider.update();
            }
        }
    }

    hideVisualizer(): void {
        if (this.visualizer) {
            this.visualizer.hideImmediate();
        }
    }

    dispose(): void {
        for (const provider of this.providers.values()) {
            if (provider.dispose) {
                provider.dispose();
            }
        }
        this.providers.clear();

        if (this.visualizer) {
            this.visualizer.dispose();
            this.visualizer = null;
        }
    }

    /**
     * Factory: creates a SnapManager wired with the full set of standard providers.
     *
     *   - WallSnapProvider        — endpoint / midpoint / centreline / face / intersection
     *   - WallJoinSnapProvider    — direction-aware face snap for T-join guidance
     *   - GridSnapProvider        — uniform math grid + optional BIM structural grid
     *   - CurtainWallSnapProvider — curtain wall endpoint / midpoint / centreline (optional)
     *
     * Wall and curtain-wall providers are skipped gracefully when their store is
     * null/undefined so callers with no store (e.g. HandrailTool) do not crash.
     *
     * @param scene          - Three.js scene for the SnapVisualizer
     * @param wallStore      - WallStore instance (or null)
     * @param curtainWallStore - CurtainWallStore instance (or null/undefined)
     */
    static createWithDefaults(
        scene: THREE.Scene,
        wallStore: any,
        curtainWallStore?: any,
        extraStores?: {
            doorStore?:      any;
            windowStore?:    any;
            columnStore?:    any;
            slabStore?:      any;
            stairStore?:     any;
            furnitureStore?: any;
            beamStore?:      any;
            /** §40 §4 — Optional. When present, GridSnapProvider emits BIM-grid candidates. */
            gridStore?:      any;
        }
    ): SnapManager {
        const manager = new SnapManager();
        manager.initVisualizer(scene);

        if (wallStore != null) {
            manager.registerProvider(new WallSnapProvider(wallStore));
            manager.registerProvider(new WallJoinSnapProvider(wallStore));
        }

        if (curtainWallStore != null) {
            manager.registerProvider(new CurtainWallSnapProvider(curtainWallStore));
        }

        if (extraStores?.doorStore != null && wallStore != null) {
            manager.registerProvider(new DoorSnapProvider(extraStores.doorStore, wallStore));
        }

        if (extraStores?.windowStore != null && wallStore != null) {
            manager.registerProvider(new WindowSnapProvider(extraStores.windowStore, wallStore));
        }

        if (extraStores?.columnStore != null) {
            manager.registerProvider(new ColumnSnapProvider(extraStores.columnStore));
        }

        // §FEAT-SLAB-CORNER-REFS (ADR-0112) — cross-level slab-corner reference.
        //   The slab provider offers the active floor's slab corners/edges as
        //   snap targets so upper-floor walls line up with the shell below.
        //   Callers that don't explicitly pass a slabStore (e.g. WallTool, which
        //   only forwards { gridStore }) still get the reference: we fall back to
        //   the read-only `window.slabStore` global — the same lazy-global
        //   pattern gatherCandidates() already uses for the wall-store mutation
        //   guard. The active draw level is likewise read lazily from
        //   `window.projectContext.activeLevelId` so the reference is scoped to
        //   the floor being drawn on and follows level switches without
        //   re-registration. Both reads are fully guarded — absent globals just
        //   mean an all-slabs (or no-slab) provider, never a crash.
        const win: any = typeof window !== 'undefined' ? window : undefined;

        // §SNAP-LEVEL-SCOPE (L-1108) — ONE accessor for the active storey, shared by
        // the manager's ranking policy AND SlabSnapProvider's pre-existing hard gate.
        // It used to be built inside the `slabStore != null` branch, which meant a
        // project with no slabs also had no notion of an active level ANYWHERE in the
        // snap pipeline. It is now unconditional: the level policy must not depend on
        // whether a slab happens to exist.
        // The constructor already installs `defaultActiveLevelAccessor`, so EVERY
        // SnapManager is level-aware — including `new SnapManager()` built by
        // CurtainWallTool, which never goes through this factory. That is deliberate:
        // the policy must not depend on which constructor a tool happened to call.
        // Named here as well because `SlabSnapProvider` takes the accessor by argument.
        const getActiveLevelId = defaultActiveLevelAccessor;

        const slabStore = extraStores?.slabStore ?? win?.slabStore ?? null;
        if (slabStore != null) {
            manager.registerProvider(new SlabSnapProvider(slabStore, getActiveLevelId));
        }

        if (extraStores?.stairStore != null) {
            manager.registerProvider(new StairSnapProvider(extraStores.stairStore));
        }

        if (extraStores?.furnitureStore != null) {
            manager.registerProvider(new FurnitureSnapProvider(extraStores.furnitureStore));
        }

        if (extraStores?.beamStore != null) {
            manager.registerProvider(new BeamSnapProvider(extraStores.beamStore));
        }

        // §40 §4 — Pipe BIM grids into the snap provider when a gridStore is
        // available so all elements snap to user-placed structural grids while
        // grids are visible.
        const gridStore = extraStores?.gridStore;
        const getBimGrids = gridStore
            ? () => {
                try {
                    const all: any[] = gridStore.getAll?.() ?? [];
                    return all.filter(g => g && g.isVisible !== false);
                } catch { return []; }
            }
            : undefined;
        manager.registerProvider(new GridSnapProvider(manager.settings.gridSize, getBimGrids));

        // §L-432 — SITE CONTEXT: the parcel boundary + the buildable-envelope SETBACK LINE as
        // snap targets. Without this, compliance-by-construction holds only on the GENERATED
        // path: a user drawing walls by hand has nothing to bite onto and can silently cross
        // the setback line the envelope panel claims to enforce.
        //
        // Read via the SAME lazy-global pattern as `slabStore` above, and for the same reason:
        // callers like WallTool forward only `{ gridStore }`, so an explicitly-passed store
        // would leave the reference missing exactly where walls are drawn. The app layer
        // publishes the rings (it owns the site-store + envelope reads, which are L5 and not
        // importable from this L1 package). Fully guarded — an absent global simply means no
        // site candidates, never a crash.
        const getSiteSnapContext = (): SiteSnapContext | null => {
            try {
                const ctx = win?.__pryzmSiteSnapContext;
                return typeof ctx === 'function' ? (ctx() ?? null) : null;
            } catch { return null; }
        };
        manager.registerProvider(new SiteContextSnapProvider(getSiteSnapContext));

        return manager;
    }
}
