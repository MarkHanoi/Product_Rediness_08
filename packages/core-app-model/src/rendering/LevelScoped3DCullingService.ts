/**
 * @file packages/core-app-model/src/rendering/LevelScoped3DCullingService.ts
 *
 * LevelScoped3DCullingService — §FIX-HEAVY-SCENE-3D-SCALABILITY (L-139).
 *
 * ## Why this exists
 *
 * A large generated building (the founder's 40-storey / 1366-element office:
 * 1065 walls + 41 slabs + per-slab curtain-wall glass) renders EVERY level's
 * full BIM geometry into the 3D view at once. At that scale the WebGPU device
 * runs out of headroom (draw calls + PSO + GPU memory + shadow casters) and is
 * LOST — the renderer cascades to a dead state and the view becomes impossible
 * to navigate (L-139).
 *
 * Rendering 40 storeys simultaneously is the single biggest avoidable cost: the
 * user only ever looks at a few floors at a time. This service scopes the 3D
 * view to the ACTIVE level ± N adjacent storeys on large models, hiding the rest.
 * For a 40-storey tower with N=1 that is 3 visible storeys instead of 40 — an
 * ~13× cut in draw calls / PSO / GPU memory / shadow casters, which is what keeps
 * the WebGPU device alive and the view navigable.
 *
 * ## What it is (and is NOT)
 *
 * - It is a VIEW-transform / visibility concern (P7 visibility intent) — it only
 *   toggles `Object3D.visible`. It NEVER deletes elements from any store, never
 *   removes anything from the scene graph, and never mutates semantic state.
 * - It applies ONLY in the 3D (perspective) view. In plan / section (orthographic)
 *   it stands fully down and restores every root it hid, so the plan-view culler
 *   (clip planes + PlanViewVisibilityCuller) remains the sole authority there.
 * - It is a well-behaved citizen w.r.t. the user's explicit "Active Level Only" /
 *   solo isolation (BottomActionMenu): it ONLY ever sets `visible=false` on roots
 *   that are CURRENTLY visible, and ONLY ever restores roots IT hid (tracked in
 *   {@link _hidden}). It therefore never clobbers another system's hide, and it
 *   self-heals to the correct state on the next derive (which fires on
 *   activeLevelChanged / view-activated / geometry / project-loaded).
 *
 * ## Flag — DEFAULT ON for large models, revertible
 *
 * `globalThis.__pryzmLevelScoped3DCulling === false` disables the service
 * entirely (restores everything it hid → EXACT pre-fix behaviour: all levels
 * render). Any other value (undefined / true) enables it, but it only ACTS on a
 * large model (> {@link LARGE_MODEL_ELEMENT_THRESHOLD} elements OR
 * > {@link LARGE_MODEL_LEVEL_THRESHOLD} levels). Small / normal scenes (a house,
 * one apartment) are never touched.
 *
 * `globalThis.__pryzmLevelScopedAdjacent` (default {@link DEFAULT_ADJACENT_LEVELS})
 * tunes how many storeys above/below the active level stay visible.
 *
 * ## Measurability
 *
 * Emits `§PERF` lines via {@link perfLog} when `globalThis.__pryzmPerfTrace` is on,
 * and publishes a live snapshot to `globalThis.__pryzmLevelCullStats` on every
 * derive (hidden-root count, visible level ids, whether it engaged).
 *
 * Contract compliance:
 *   P2 — THREE only via '@pryzm/renderer-three/three'.
 *   P3 — no requestAnimationFrame; a plain debounce timer only.
 *   P4 — no `(window as any)`; typed `globalThis` casts (perfTrace / SharedMaterialCache pattern).
 *   P7 — visibility intent only; capture/restore discipline, no store writes.
 *   P8 — the public derive/activate paths carry an OpenTelemetry span.
 *   §01-BIM-ENGINE-CORE §5 — projection-layer service; no store reads/mutations.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { trace, SpanStatusCode, type Attributes } from '@opentelemetry/api';
import { perfLog } from './perfTrace.js';

const TRACER = trace.getTracer('@pryzm/core-app-model/level-scoped-3d-culling', '0.1.0');

function withSpan<T>(verb: string, attrs: Attributes, fn: () => T): T {
    const span = TRACER.startSpan(`pryzm.level-cull.${verb}`, { attributes: attrs });
    try {
        const out = fn();
        span.setStatus({ code: SpanStatusCode.OK });
        return out;
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.setAttribute('error', true);
        throw err;
    } finally {
        span.end();
    }
}

// ── Thresholds ──────────────────────────────────────────────────────────────

/** Only scope the 3D view when the model has more than N placed elements. */
const LARGE_MODEL_ELEMENT_THRESHOLD = 500;

/** …OR more than N levels (a tall tower with sparse floors still qualifies). */
const LARGE_MODEL_LEVEL_THRESHOLD = 5;

/** Storeys above/below the active level kept visible (active ± N). */
const DEFAULT_ADJACENT_LEVELS = 1;

/**
 * Coalesce a burst of geometry-added events (a batch load fires one per element)
 * into a single derive after the burst settles. Not a frame budget — a plain
 * debounce (P3: no rAF).
 */
const DEBOUNCE_MS = 300;

// ── Typed global access (P4 — no `window as any`) ───────────────────────────

interface BimLevelLike {
    id: string;
    elevation: number;
}

interface BimManagerLike {
    getLevels?: () => BimLevelLike[];
    getLevelForElement?: (id: string) => { id?: string } | null | undefined;
    activeLevelId?: string | null;
}

interface CullGlobals {
    __pryzmLevelScoped3DCulling?: boolean;
    __pryzmLevelScopedAdjacent?: number;
    __pryzmLevelCullStats?: {
        engaged: boolean;
        hidden: number;
        elementCount: number;
        levelCount: number;
        activeLevelId: string | null;
        visibleLevelIds: string[];
    };
    bimManager?: BimManagerLike;
    projectContext?: { activeLevelId?: string | null };
    threeCamera?: { isOrthographicCamera?: boolean };
}

function G(): CullGlobals {
    return globalThis as unknown as CullGlobals;
}

// ── Service ─────────────────────────────────────────────────────────────────

export class LevelScoped3DCullingService {
    private _scene: THREE.Scene | null = null;
    private _active = false;

    /** Roots WE set `visible=false` on. Only these are ever restored by us. */
    private readonly _hidden = new Set<THREE.Object3D>();

    private _debounceTimer: ReturnType<typeof setTimeout> | null = null;

    /** Bound listeners kept so deactivate() can detach them. */
    private _onImmediate: (() => void) | null = null;
    private _onDebounced: (() => void) | null = null;

    /** Immediate re-derive on level / view change (no debounce — user action). */
    private static readonly IMMEDIATE_EVENTS = [
        'activeLevelChanged',
        'view-activated',
    ] as const;

    /** Debounced re-derive on geometry / project change (bursty). */
    private static readonly DEBOUNCED_EVENTS = [
        'project-loaded',
        'pryzm-project-loaded',
        'bim-wall-added',     'bim-wall-removed',
        'bim-slab-added',     'bim-slab-removed',
        'bim-ceiling-added',  'bim-floor-added',
        'bim-column-added',   'bim-beam-added',
        'bim-roof-added',     'bim-stair-added',
        'bim-curtainwall-added',
        'bim-furniture-added',
    ] as const;

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /** Inject the Three.js scene. Call once from initScene after the world is ready. */
    setScene(scene: THREE.Scene): void {
        this._scene = scene;
    }

    /**
     * Activate: register listeners that re-derive the level scope on level / view /
     * geometry changes. Safe to call multiple times (listeners register once).
     */
    activate(): void {
        withSpan('activate', {}, () => {
            if (this._active) return;
            this._active = true;

            if (typeof window !== 'undefined') {
                this._onImmediate = () => this.derive();
                this._onDebounced = () => this._scheduleDerive();
                for (const evt of LevelScoped3DCullingService.IMMEDIATE_EVENTS) {
                    window.addEventListener(evt, this._onImmediate);
                }
                for (const evt of LevelScoped3DCullingService.DEBOUNCED_EVENTS) {
                    window.addEventListener(evt, this._onDebounced);
                }
            }

            console.log(
                '[LevelScoped3DCullingService] Active — 3D view scoped to active level ± ' +
                `${this._adjacentCount()} on large models (> ${LARGE_MODEL_ELEMENT_THRESHOLD} elems ` +
                `or > ${LARGE_MODEL_LEVEL_THRESHOLD} levels). Flag: __pryzmLevelScoped3DCulling.`,
            );
            // Derive once now in case geometry is already present (e.g. reactivation).
            this.derive();
        });
    }

    /** Restore everything we hid and detach listeners. */
    deactivate(): void {
        this.restoreAll();
        if (this._debounceTimer !== null) {
            clearTimeout(this._debounceTimer);
            this._debounceTimer = null;
        }
        if (typeof window !== 'undefined') {
            if (this._onImmediate) {
                for (const evt of LevelScoped3DCullingService.IMMEDIATE_EVENTS) {
                    window.removeEventListener(evt, this._onImmediate);
                }
            }
            if (this._onDebounced) {
                for (const evt of LevelScoped3DCullingService.DEBOUNCED_EVENTS) {
                    window.removeEventListener(evt, this._onDebounced);
                }
            }
        }
        this._onImmediate = null;
        this._onDebounced = null;
        this._active = false;
    }

    // ── Config readers ──────────────────────────────────────────────────────

    /** True unless explicitly disabled. DEFAULT ON (restores pre-fix behaviour only when === false). */
    private _flagEnabled(): boolean {
        return G().__pryzmLevelScoped3DCulling !== false;
    }

    private _adjacentCount(): number {
        const n = G().__pryzmLevelScopedAdjacent;
        return typeof n === 'number' && Number.isFinite(n) && n >= 0
            ? Math.floor(n)
            : DEFAULT_ADJACENT_LEVELS;
    }

    /**
     * True when the live camera is the 3D (perspective) view. In plan / section
     * (orthographic) we stand down so the plan-view culler stays authoritative.
     * If the camera is unknown, assume 3D (the case this fix targets).
     */
    private _is3DView(): boolean {
        const cam = G().threeCamera;
        if (!cam) return true;
        return cam.isOrthographicCamera !== true;
    }

    private _getBimManager(): BimManagerLike | undefined {
        return G().bimManager;
    }

    private _getActiveLevelId(): string | null {
        const g = G();
        return g.projectContext?.activeLevelId ?? g.bimManager?.activeLevelId ?? null;
    }

    // ── Debounce ────────────────────────────────────────────────────────────

    private _scheduleDerive(): void {
        if (this._debounceTimer !== null) clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
            this._debounceTimer = null;
            this.derive();
        }, DEBOUNCE_MS);
    }

    // ── Core derivation ───────────────────────────────────────────────────────

    /**
     * Recompute which levels are in scope and toggle root visibility accordingly.
     * Idempotent. Restores everything when disabled / not-large / not-3D-view.
     *
     * P8: `pryzm.level-cull.derive` span.
     */
    derive(): void {
        withSpan('derive', {}, () => this._deriveImpl());
    }

    private _deriveImpl(): void {
        const scene = this._scene;
        if (!scene) return;

        // Disabled → exact pre-fix behaviour.
        if (!this._flagEnabled()) { this._restoreAllInternal('flag-off'); return; }
        // Plan / section view → the plan culler is authoritative; stand down.
        if (!this._is3DView()) { this._restoreAllInternal('plan-view'); return; }

        const bimManager = this._getBimManager();
        const levels = bimManager?.getLevels?.() ?? [];
        const levelCount = levels.length;

        const elementCount = this._elementCount(scene);
        const isLarge =
            elementCount > LARGE_MODEL_ELEMENT_THRESHOLD ||
            levelCount > LARGE_MODEL_LEVEL_THRESHOLD;

        // Small / normal scene → never scope; restore anything left over.
        if (!isLarge) { this._restoreAllInternal('small-model'); return; }

        // Resolve the active level's index in the elevation-sorted stack.
        const sorted = [...levels].sort((a, b) => a.elevation - b.elevation);
        const activeLevelId = this._getActiveLevelId();
        const activeIdx = sorted.findIndex((l) => l.id === activeLevelId);

        // Can't place the active level → fail OPEN (show everything) rather than
        // risk hiding the wrong storeys.
        if (activeIdx < 0) { this._restoreAllInternal('active-level-unresolved'); return; }

        const n = this._adjacentCount();
        const lo = Math.max(0, activeIdx - n);
        const hi = Math.min(sorted.length - 1, activeIdx + n);
        const visibleLevelIds = new Set<string>();
        for (let i = lo; i <= hi; i++) visibleLevelIds.add(sorted[i].id);

        const newHidden = new Set<THREE.Object3D>();
        let hidThisPass = 0;
        let restoredThisPass = 0;

        for (const child of scene.children) {
            const ud = child.userData as {
                id?: string; levelId?: string;
                isPreview?: boolean; isHelper?: boolean;
            };
            if (ud.isPreview === true || ud.isHelper === true) continue;

            const levelId = this._levelIdOf(child, bimManager);
            // No resolvable level (site / context / grid / helpers) → never hide.
            if (!levelId) {
                if (this._hidden.has(child)) { child.visible = true; restoredThisPass++; }
                continue;
            }

            const inRange = visibleLevelIds.has(levelId);
            if (!inRange) {
                // Out of scope → hide, but ONLY if currently visible (never clobber
                // another system's hide), and only track roots WE actually hid.
                if (child.visible === true) {
                    child.visible = false;
                    newHidden.add(child);
                    hidThisPass++;
                } else if (this._hidden.has(child)) {
                    // Still hidden and it was ours — keep tracking so we can restore it.
                    newHidden.add(child);
                }
                // else: hidden by someone else → leave alone, don't track.
            } else {
                // In scope → restore only if WE hid it.
                if (this._hidden.has(child)) {
                    child.visible = true;
                    restoredThisPass++;
                }
            }
        }

        // Restore roots we previously hid that no longer belong to the hidden set
        // (e.g. removed / moved into range) and were not handled above.
        for (const prev of this._hidden) {
            if (!newHidden.has(prev) && prev.visible === false) {
                prev.visible = true;
                restoredThisPass++;
            }
        }

        this._hidden.clear();
        for (const r of newHidden) this._hidden.add(r);

        this._publishStats({
            engaged: true,
            hidden: this._hidden.size,
            elementCount,
            levelCount,
            activeLevelId,
            visibleLevelIds: [...visibleLevelIds],
        });

        perfLog(
            '§FIX-HEAVY-SCENE-3D-SCALABILITY',
            `level-cull engaged: active=${activeLevelId} scope=±${n} ` +
            `visibleLevels=${visibleLevelIds.size}/${levelCount} ` +
            `hiddenRoots=${this._hidden.size} (+${hidThisPass}/-${restoredThisPass} this pass) ` +
            `elements=${elementCount}`,
        );
    }

    // ── Restore ───────────────────────────────────────────────────────────────

    /** Restore every root we hid. Public entry (P8 span). */
    restoreAll(): void {
        withSpan('restore-all', {}, () => this._restoreAllInternal('explicit'));
    }

    private _restoreAllInternal(reason: string): void {
        if (this._hidden.size === 0) return;
        let restored = 0;
        for (const r of this._hidden) {
            if (r.visible === false) { r.visible = true; restored++; }
        }
        this._hidden.clear();
        this._publishStats({
            engaged: false, hidden: 0, elementCount: 0, levelCount: 0,
            activeLevelId: this._getActiveLevelId(), visibleLevelIds: [],
        });
        perfLog('§FIX-HEAVY-SCENE-3D-SCALABILITY', `level-cull stood down (${reason}) — restored ${restored} root(s)`);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Count top-level BIM element roots (mirrors FrustumCullingService.getElementCount). */
    private _elementCount(scene: THREE.Scene): number {
        let count = 0;
        for (const child of scene.children) {
            const ud = child.userData as { id?: string; levelId?: string; isPreview?: boolean; isHelper?: boolean };
            if (!ud.id && !ud.levelId) continue;
            if (ud.isPreview === true) continue;
            if (ud.isHelper === true) continue;
            count++;
        }
        return count;
    }

    /** Resolve a root's level id from its own stamp, else via the bim manager. */
    private _levelIdOf(root: THREE.Object3D, bimManager: BimManagerLike | undefined): string | undefined {
        const ud = root.userData as { levelId?: string; id?: string };
        if (ud.levelId) return String(ud.levelId);
        if (ud.id && bimManager?.getLevelForElement) {
            const lvl = bimManager.getLevelForElement(String(ud.id));
            if (lvl?.id) return String(lvl.id);
        }
        return undefined;
    }

    private _publishStats(stats: NonNullable<CullGlobals['__pryzmLevelCullStats']>): void {
        G().__pryzmLevelCullStats = stats;
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/**
 * Global LevelScoped3DCullingService singleton.
 *
 * initScene calls:
 *   levelScoped3DCullingService.setScene(world.scene.three as THREE.Scene);
 *   levelScoped3DCullingService.activate();
 */
export const levelScoped3DCullingService = new LevelScoped3DCullingService();
