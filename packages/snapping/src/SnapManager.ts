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

export class SnapManager {
    private providers: Map<string, ISnapProvider> = new Map();
    private settings: SnapSettings;
    private visualizer: SnapVisualizer | null = null;
    private activeStartPoint: THREE.Vector3 | null = null;
    private overrideDistance: number = 0.15;

    /** §WALL-DEEP-2026 O1 — one-shot warning latch (process-lifetime). */
    private static _warnedMidMutation = false;

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
        const wallStoreGlobal = (window as any).wallStore;
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

        return candidates
            .map(c => {
                const basePriority = priorityOverrides.get(c.type) ??
                    DEFAULT_SNAP_PRIORITIES[c.type] ?? 50;

                const distanceFactor = Math.max(0, 1 - (c.distance / r));
                const adjustedPriority = basePriority + (distanceFactor * 10);

                return {
                    ...c,
                    priority: adjustedPriority
                };
            })
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

        if (extraStores?.slabStore != null) {
            manager.registerProvider(new SlabSnapProvider(extraStores.slabStore));
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

        return manager;
    }
}
