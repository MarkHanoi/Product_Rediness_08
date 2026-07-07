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
 * ## Engagement — full detail by default, auto-escalates only on huge models
 *
 * The resting state is {@link DEFAULT_MODE} = 'all' (every floor full detail). The
 * service only scopes / massing-LODs when it AUTO-ESCALATES on a genuinely
 * device-loss-risk model — see {@link isHeavyModel} (a tall tower ≥
 * {@link HEAVY_MODEL_LEVEL_THRESHOLD} levels carrying ≥
 * {@link HEAVY_MODEL_ELEMENT_THRESHOLD} elements, OR ≥
 * {@link HUGE_MODEL_ELEMENT_THRESHOLD} elements outright). A house, an apartment,
 * a modest ~6-storey residential block are never touched (L-164).
 *
 * `globalThis.__pryzmLevelScoped3DMode` ('all' | 'scoped' | 'massing') is an
 * explicit user override honoured at ANY scale (the "3D detail" control writes it):
 * a user can force massing/scoped on a small model, or 'all' on a huge one.
 * `globalThis.__pryzmLevelScoped3DCulling === false` is the legacy back-compat flag
 * — it forces 'all' (exact pre-fix behaviour: every level renders).
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
import { levelMassingRenderer, type LevelMassingGroup } from './LevelMassingRenderer.js';

/**
 * §FIX-HEAVY-SCENE-MASSING-LOD (L-150) / §FIX-MASSING-LOD-THRESHOLD-TOO-AGGRESSIVE (L-164)
 * — how the 3D view treats out-of-scope levels:
 *
 *   'all'     — DEFAULT. Render every level at full detail — the resting state for
 *               ANY building a normal GPU handles (a house, an apartment, a modest
 *               6-storey residential block). No massing block, no hidden storeys.
 *   'massing' — full-detail BIM near the active level; every other level is drawn as
 *               a lightweight massing block so the WHOLE building silhouette stays
 *               visible (see {@link LevelMassingRenderer}). This is what the service
 *               AUTO-ESCALATES to on a genuinely device-loss-risk model (a tall tower
 *               with substantial geometry — the 40-storey office L-139/L-150 target),
 *               and what a user can opt into via the "3D detail" control.
 *   'scoped'  — the L-139 behaviour: out-of-scope levels are simply hidden (no
 *               massing). Lightest possible, but the far building is invisible.
 *
 * Rationale for the L-164 change: L-150 shipped with `massing` as the DEFAULT that
 * engaged at > 500 elements OR > 5 levels. A normal ~6-storey residential building
 * trips that (it clears one storey ± the active level and collapses the rest into a
 * translucent grey massing block), so the founder saw a grey "envelope shade" around
 * a building the GPU renders fine in full. Massing is now a heavy-model AUTO-ESCALATION
 * (see {@link isHeavyModel}), never the resting state — full detail is the default.
 */
export type LevelScoped3DMode = 'scoped' | 'massing' | 'all';

/**
 * Resting-state mode: full detail. Massing is NOT the default — it is an
 * auto-escalation gated on {@link isHeavyModel} (L-164). A user / the console flag
 * can still override to any mode.
 */
const DEFAULT_MODE: LevelScoped3DMode = 'all';

/**
 * The representation the service auto-escalates to when — and only when — a model is
 * at genuine device-loss-risk scale ({@link isHeavyModel}). Keeps the 40-storey tower
 * (L-139/L-150) protected while a modest building stays at {@link DEFAULT_MODE}.
 */
const AUTO_ESCALATION_MODE: LevelScoped3DMode = 'massing';

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

// ── Heavy-model (device-loss-risk) thresholds — §FIX-MASSING-LOD-THRESHOLD-TOO-AGGRESSIVE (L-164) ──
//
// Massing LOD / scoping AUTO-ESCALATES only for a genuinely device-loss-risk model.
// The discriminator is a TALL tower (many levels) CARRYING substantial geometry — the
// 40-storey / 1366-element office L-139/L-150 exist to protect. A normal building that
// a browser GPU renders fine — a house, an apartment, a densely-furnished ~6-storey
// residential block — must render EVERY floor at full detail (no massing block).
//
// Why level count is the primary gate (not raw element count): the L-150 default
// (> 500 elements OR > 5 levels) regressed on a 6-storey residential building (L-164) —
// low-rise buildings can carry hundreds of elements per floor, so element count alone
// does NOT separate them from the tall tower. Storey count does: people rarely model a
// > 12–15-storey building in the browser, and the device-loss cascade was specifically
// the 40-storey case. So auto-escalation requires BOTH a tall stack AND substantial
// geometry — a modest building trips neither.

/**
 * Auto-escalate only at/above this many levels. A modest low-rise (≤ ~12 storeys) never
 * engages massing regardless of how densely furnished it is (fixes L-164); the 40-storey
 * tower does. Chosen at 15 to sit clearly above any normal residential/house typology.
 */
const HEAVY_MODEL_LEVEL_THRESHOLD = 15;

/**
 * …AND at/above this many placed elements. "Substantial geometry" — the L-150 office was
 * 1366 elements. A tall-but-trivially-light model gains nothing from massing, so we
 * require real GPU load before escalating. Combined with the level gate (AND, not OR).
 */
const HEAVY_MODEL_ELEMENT_THRESHOLD = 1000;

/**
 * …OR a single model this enormous regardless of storey count — a few thousand elements
 * is device-loss-risk on its own even in a squat footprint. Set well above anything a
 * normal building (incl. the L-164 6-storey block) reaches, so it never regresses.
 */
const HUGE_MODEL_ELEMENT_THRESHOLD = 4000;

/**
 * True when a model is at genuine device-loss-risk scale and the service should
 * auto-escalate to massing LOD. A modest building returns false → full detail (L-164).
 */
function isHeavyModel(levelCount: number, elementCount: number): boolean {
    return (
        (levelCount >= HEAVY_MODEL_LEVEL_THRESHOLD && elementCount >= HEAVY_MODEL_ELEMENT_THRESHOLD) ||
        elementCount >= HUGE_MODEL_ELEMENT_THRESHOLD
    );
}

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
    __pryzmLevelScoped3DMode?: LevelScoped3DMode;
    __pryzmLevelScopedAdjacent?: number;
    __pryzmLevelCullStats?: {
        engaged: boolean;
        mode: LevelScoped3DMode;
        hidden: number;
        massingLevels: number;
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
        // §FIX-HEAVY-SCENE-MASSING-LOD (L-150) — the massing renderer shares this scene.
        levelMassingRenderer.setScene(scene);
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
                `[LevelScoped3DCullingService] Active (mode=${this.getMode()}) — full detail by default; ` +
                `AUTO-ESCALATES to massing LOD (active level ± ${this._adjacentCount()}) only on a ` +
                `device-loss-risk model (≥ ${HEAVY_MODEL_LEVEL_THRESHOLD} levels AND ` +
                `≥ ${HEAVY_MODEL_ELEMENT_THRESHOLD} elems, or ≥ ${HUGE_MODEL_ELEMENT_THRESHOLD} elems). ` +
                `A modest ~6-storey building renders every floor full-detail (L-164). ` +
                `View option: __pryzmLevelScoped3DMode ('all'|'scoped'|'massing'); ` +
                `legacy flag __pryzmLevelScoped3DCulling (=== false ⇒ all).`,
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

    /**
     * §FIX-HEAVY-SCENE-MASSING-LOD (L-150) / §FIX-MASSING-LOD-THRESHOLD-TOO-AGGRESSIVE (L-164)
     * — resolve the effective mode for a model of the given scale.
     *
     *   1. `__pryzmLevelScoped3DCulling === false` → 'all' (legacy back-compat).
     *   2. An explicit `__pryzmLevelScoped3DMode` → that value, honoured at ANY scale
     *      (a user who picked "Active floors only" means it, even on a small model).
     *   3. Otherwise AUTO: 'all' (full detail) for anything a normal GPU handles, and
     *      only AUTO-ESCALATE to massing when the model is device-loss-risk scale
     *      ({@link isHeavyModel}). This is the L-164 fix — massing is never the resting
     *      default, so a modest ~6-storey building renders every floor in full.
     */
    private _resolveMode(isHeavy: boolean): LevelScoped3DMode {
        if (G().__pryzmLevelScoped3DCulling === false) return 'all';
        const m = G().__pryzmLevelScoped3DMode;
        if (m === 'scoped' || m === 'massing' || m === 'all') return m;
        return isHeavy ? AUTO_ESCALATION_MODE : DEFAULT_MODE;
    }

    /** Whether the CURRENT scene (if injected) is device-loss-risk scale. */
    private _currentIsHeavy(): boolean {
        const scene = this._scene;
        if (!scene) return false;
        const levelCount = this._getBimManager()?.getLevels?.().length ?? 0;
        return isHeavyModel(levelCount, this._elementCount(scene));
    }

    /** The mode currently in effect (explicit override, else scale-based auto). */
    getMode(): LevelScoped3DMode {
        return this._resolveMode(this._currentIsHeavy());
    }

    /**
     * Set the 3D detail mode from a user-facing control and re-derive immediately.
     * Keeps the legacy flag coherent (`'all'` ⇔ `__pryzmLevelScoped3DCulling=false`)
     * so the console escape hatch and the view option never disagree.
     *
     * P8: `pryzm.level-cull.set-mode` span.
     */
    setMode(mode: LevelScoped3DMode): void {
        withSpan('set-mode', { 'pryzm.level-cull.mode': mode }, () => {
            const g = G();
            g.__pryzmLevelScoped3DMode = mode;
            g.__pryzmLevelScoped3DCulling = mode !== 'all';
            this.derive();
        });
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

        const bimManager = this._getBimManager();
        const levels = bimManager?.getLevels?.() ?? [];
        const levelCount = levels.length;
        const elementCount = this._elementCount(scene);

        // §FIX-MASSING-LOD-THRESHOLD-TOO-AGGRESSIVE (L-164): scale drives the AUTO mode.
        // A modest building is not heavy → auto resolves to 'all' → full detail (no massing).
        const isHeavy = isHeavyModel(levelCount, elementCount);
        const mode = this._resolveMode(isHeavy);

        // 'all' — the resting default for anything a normal GPU handles (auto, non-heavy),
        // an explicit user choice, or the legacy flag === false. Full detail, no massing.
        if (mode === 'all') { this._standDown('mode-all', mode); return; }
        // Plan / section view → the plan culler is authoritative; stand down.
        if (!this._is3DView()) { this._standDown('plan-view', mode); return; }

        // Reaching here, mode is 'scoped' | 'massing': either the model auto-escalated
        // (heavy) or the user explicitly opted in. A modest model with no explicit choice
        // resolves to 'all' and already stood down above (L-164).

        // Resolve the active level's index in the elevation-sorted stack.
        const sorted = [...levels].sort((a, b) => a.elevation - b.elevation);
        const activeLevelId = this._getActiveLevelId();
        const activeIdx = sorted.findIndex((l) => l.id === activeLevelId);

        // Can't place the active level → fail OPEN (show everything) rather than
        // risk hiding the wrong storeys.
        if (activeIdx < 0) { this._standDown('active-level-unresolved', mode); return; }

        const n = this._adjacentCount();
        const lo = Math.max(0, activeIdx - n);
        const hi = Math.min(sorted.length - 1, activeIdx + n);
        const visibleLevelIds = new Set<string>();
        for (let i = lo; i <= hi; i++) visibleLevelIds.add(sorted[i].id);

        const newHidden = new Set<THREE.Object3D>();
        // §FIX-HEAVY-SCENE-MASSING-LOD (L-150) — out-of-scope roots grouped by level so
        // the massing renderer can build one block per level from their union AABB.
        // Includes ALL out-of-scope roots with a level (even ones another system hid),
        // so the block always spans the real floor footprint.
        const outByLevel = new Map<string, THREE.Object3D[]>();
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
                // Collect for the massing LOD regardless of who hid it.
                let bucket = outByLevel.get(levelId);
                if (!bucket) { bucket = []; outByLevel.set(levelId, bucket); }
                bucket.push(child);

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

        // §FIX-HEAVY-SCENE-MASSING-LOD (L-150) — 'massing' draws the out-of-scope levels
        // as one instanced block mesh (full silhouette visible, device-loss safety kept:
        // far-level FULL geometry is still hidden = not submitted). 'scoped' = pure hide.
        let massingLevels = 0;
        if (mode === 'massing') {
            const groups: LevelMassingGroup[] = [];
            for (const [levelId, roots] of outByLevel) groups.push({ levelId, roots });
            levelMassingRenderer.syncMassing(groups);
            massingLevels = levelMassingRenderer.levelCount;
        } else {
            levelMassingRenderer.clear();
        }

        this._publishStats({
            engaged: true,
            mode,
            hidden: this._hidden.size,
            massingLevels,
            elementCount,
            levelCount,
            activeLevelId,
            visibleLevelIds: [...visibleLevelIds],
        });

        perfLog(
            '§FIX-HEAVY-SCENE-MASSING-LOD',
            `level-cull engaged (${mode}): active=${activeLevelId} scope=±${n} ` +
            `visibleLevels=${visibleLevelIds.size}/${levelCount} ` +
            `hiddenRoots=${this._hidden.size} (+${hidThisPass}/-${restoredThisPass} this pass) ` +
            `massingLevels=${massingLevels} elements=${elementCount}`,
        );
    }

    // ── Restore ───────────────────────────────────────────────────────────────

    /** Restore every root we hid AND drop the massing LOD. Public entry (P8 span). */
    restoreAll(): void {
        withSpan('restore-all', {}, () => this._standDown('explicit', this.getMode()));
    }

    /**
     * §FIX-HEAVY-SCENE-MASSING-LOD (L-150) — full stand-down: restore hidden roots
     * to full detail AND remove the massing blocks, so neither perf effect lingers.
     */
    private _standDown(reason: string, mode: LevelScoped3DMode): void {
        levelMassingRenderer.clear();
        this._restoreAllInternal(reason, mode);
    }

    private _restoreAllInternal(reason: string, mode: LevelScoped3DMode): void {
        if (this._hidden.size === 0) {
            this._publishStats({
                engaged: false, mode, hidden: 0, massingLevels: 0,
                elementCount: 0, levelCount: 0,
                activeLevelId: this._getActiveLevelId(), visibleLevelIds: [],
            });
            return;
        }
        let restored = 0;
        for (const r of this._hidden) {
            if (r.visible === false) { r.visible = true; restored++; }
        }
        this._hidden.clear();
        this._publishStats({
            engaged: false, mode, hidden: 0, massingLevels: 0,
            elementCount: 0, levelCount: 0,
            activeLevelId: this._getActiveLevelId(), visibleLevelIds: [],
        });
        perfLog('§FIX-HEAVY-SCENE-MASSING-LOD', `level-cull stood down (${reason}) — restored ${restored} root(s), massing cleared`);
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
