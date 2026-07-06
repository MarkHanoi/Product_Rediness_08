/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Builder layer (Three.js scene transform only — no semantic mutation)
 * Phase:            Phase 1 (Current)
 * Files Modified:   src/engine/inspect/LevelExplodeController.ts (NEW)
 * Architectural Classification: A
 *
 * Impact Assessment:
 *   - Semantic Impact:    No — no stores, registry, or semantic graph touched
 *   - Constraint Impact:  No
 *   - Graph Impact:       No
 *   - Propagation Impact: No
 *   - Topology Impact:    No — visual-only Y-offset, fully reverted on deactivation
 *   - World Model Impact: No
 *   - Event Bus Impact:   No — listens to DOM CustomEvents only (same pattern as Z-Slicer)
 *   - Store Registry Impact: No
 *   - Undo/Redo Impact:   No — visual only
 *   - Spatial Impact:     No — position changes reverted when leaving inspect mode
 *   - Idempotency Impact: No
 *
 * Risk Level: Low
 * Rationale: Pure visual explode effect for Inspect mode. Groups Three.js Object3Ds
 *             by BIM level using window.bimManager.childrenIds, then animates Y-offsets
 *             via RAF lerp. Mirrors Pascal's LevelSystem (level-system.tsx) using
 *             PRYZM's imperative/event-driven architecture instead of React hooks.
 *
 * Contract compliance:
 *   §01 §1.5  — Builder layer: pure visual output, no store mutations
 *   §02 §6.3  — Visual-only transform: position changes do not affect spatial queries
 *   §05 §6.1  — Accesses bimManager via window global (same pattern as InspectModeCoordinator)
 *
 * Event consumed:
 *   pryzm-inspect-level-explode  { mode: 'stacked'|'exploded'|'solo', soloLevelId?: string }
 */

import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';

export type LevelExplodeMode = 'stacked' | 'exploded' | 'solo';

const EXPLODE_GAP  = 5.0;  // metres of Y separation per floor in exploded mode
const LERP_FACTOR  = 10;   // higher = snappier approach (units: 1/sec decay)
const DONE_EPSILON = 0.001; // stop RAf loop when within this distance of target

// §FIX-LEVEL-EXPLODE-COORDINATION (L-113) — DOM/runtime events emitted by every
// element builder AFTER it disposes the old Object3D and adds a fresh one (same
// userData.id). While the explode is active, a rebuild (move / property edit /
// undo) produces a NEW root that is NOT in any level group, so it renders at its
// true (model) elevation and drops OUT of the exploded stack — the founder's
// "moved element jumps back to its unstacked position". We reconcile the groups
// on these events so the rebuilt mesh is re-lifted into the stack. Mirrors the
// set SelectionManager listens to for §SELECT-GIZMO-REATTACH.
const REBUILD_EVENTS = [
  'bim-wall-added',        'bim-wall-updated',        'bim-wall-removed',
  'bim-slab-added',        'bim-slab-updated',        'bim-slab-removed',
  'bim-floor-added',       'bim-floor-updated',       'bim-floor-removed',
  'bim-ceiling-added',     'bim-ceiling-updated',     'bim-ceiling-removed',
  'bim-furniture-added',   'bim-furniture-updated',   'bim-furniture-removed',
  'bim-column-added',      'bim-column-updated',      'bim-column-removed',
  'bim-beam-added',        'bim-beam-updated',        'bim-beam-removed',
  'bim-roof-added',        'bim-roof-updated',        'bim-roof-removed',
  'bim-stair-added',       'bim-stair-updated',       'bim-stair-removed',
  'bim-curtainwall-added', 'bim-curtainwall-updated', 'bim-curtainwall-removed',
  'bim-door-added',        'bim-door-updated',        'bim-door-removed',
  'bim-window-added',      'bim-window-updated',      'bim-window-removed',
] as const;

// SelectionManager surface reached (cross-layer, via window per §05 §6.1) to
// re-anchor the highlight + gizmo after the explode offset for the selected
// element changes. Kept intentionally narrow.
interface SelectionManagerLike {
  selectedObject?: THREE.Object3D | null;
  applyHighlight?: (obj: THREE.Object3D) => void;
}

// ── Minimal bimManager interface (accessed via window global per §05 §6.1) ──

interface BimLevel {
  id:          string;
  elevation:   number;
  childrenIds: string[];
}

interface BimManagerLike {
  getLevels(): BimLevel[];
}

// ── Per-level group state ─────────────────────────────────────────────────

interface LevelGroup {
  levelId:      string;
  elevation:    number;
  index:        number;               // sort index (0 = ground floor)
  roots:        THREE.Object3D[];
  originalY:    Map<THREE.Object3D, number>;
  targetOffset: number;               // additive Y offset relative to originalY
}

// ═════════════════════════════════════════════════════════════════════════════

export class LevelExplodeController {

  private _scene:        THREE.Scene | null = null;
  private _mode:         LevelExplodeMode = 'stacked';
  private _soloLevelId:  string | undefined;
  private _levelGroups:  LevelGroup[] = [];
  // D.7.6: rAF handle replaced by FrameScheduler disposer.
  private _raf:          TickListenerDisposer | null = null;
  private _lastTime:     number = 0;
  private _active:       boolean = false;

  private _unsubExplode: (() => void) | null = null;

  // §FIX-LEVEL-EXPLODE-COORDINATION (L-113) — rebuild reconciliation state.
  /** Bound handler kept so we can removeEventListener on dispose. */
  private _onRebuild:    (() => void) | null = null;
  /** Debounce handle for a queued reconcile (coalesces bursts to one/frame). */
  private _reconcileScheduled: TickListenerDisposer | null = null;
  /** True when the explode offset for the selected element changed and the
   *  selection highlight / gizmo must be re-anchored once the lift settles. */
  private _reanchorPending: boolean = false;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  init(scene: THREE.Scene): void {
    this._scene = scene;
    // runtime.events is available here — init() is called from InspectModeCoordinator.init()
    // which in turn is called from engineLauncher.ts after flushRuntimeEventListeners().
    this._unsubExplode = window.runtime?.events?.on(
      'pryzm-inspect-level-explode',
      this._onExplodeEvent.bind(this),
    ) ?? null;

    // §FIX-LEVEL-EXPLODE-COORDINATION (L-113) — reconcile on element rebuilds so a
    // moved/edited element re-lifts into the exploded stack instead of dropping
    // back to its true elevation. Builders dispatch these as window CustomEvents
    // (DOMEventBus during migration), so window.addEventListener reaches them —
    // the same channel SelectionManager uses for §SELECT-GIZMO-REATTACH.
    this._onRebuild = () => { if (this._active) this._scheduleReconcile(); };
    for (const evt of REBUILD_EVENTS) window.addEventListener(evt, this._onRebuild);

    // Publish the active per-level explode offset so the interaction layer
    // (SelectionManager anchor logic in @pryzm/input-host, a lower layer) can
    // place a MODEL-space highlight box (instanced walls / OBB fallback) in the
    // SAME exploded space the mesh is drawn — no floating highlight.
    window.pryzmLevelExplodeOffsetForObject = (obj: unknown): number =>
      this.getActiveOffsetForObject(obj as THREE.Object3D | null | undefined);

    console.log('[LevelExplodeController] Initialized');
  }

  /**
   * Called by InspectModeCoordinator when the workspace enters inspect mode.
   * Builds the per-level groups and marks the controller active.
   */
  activate(): void {
    if (!this._scene) return;
    this._buildLevelGroups();
    this._active = true;
    // Reset to stacked on each activation
    this._applyMode('stacked', undefined);
    console.log('[LevelExplodeController] Activated —', this._levelGroups.length, 'level groups');
  }

  /**
   * Called by InspectModeCoordinator when leaving inspect mode.
   * Restores all Y positions and visibility instantly (no animation).
   */
  deactivate(): void {
    this._active = false;
    this._mode = 'stacked';
    this._cancelRaf();
    this._cancelReconcile();
    this._reanchorPending = false;

    let restored = 0;
    for (const group of this._levelGroups) {
      for (const root of group.roots) {
        const origY = group.originalY.get(root);
        if (origY !== undefined) root.position.y = origY;
        root.visible = true;
        restored++;
      }
    }
    this._levelGroups = [];
    console.log(`[§LEVEL-STACK] Deactivated — restored ${restored} root positions + visibility`);
  }

  dispose(): void {
    this.deactivate();
    this._unsubExplode?.();
    this._unsubExplode = null;
    if (this._onRebuild) {
      for (const evt of REBUILD_EVENTS) window.removeEventListener(evt, this._onRebuild);
      this._onRebuild = null;
    }
    if (window.pryzmLevelExplodeOffsetForObject) {
      window.pryzmLevelExplodeOffsetForObject = undefined;
    }
    this._scene = null;
    console.log('[LevelExplodeController] Disposed');
  }

  isActive(): boolean { return this._active; }

  getMode(): LevelExplodeMode { return this._mode; }

  // ── Public API for WorkspaceController level names ────────────────────────

  getLevelNames(): Array<{ id: string; name: string; elevation: number }> {
    const bm = window.bimManager as BimManagerLike | undefined;
    if (!bm) return [];
    return bm.getLevels()
      .sort((a, b) => a.elevation - b.elevation)
      .map((l, i) => {
        const withName = l as BimLevel & { name?: string };
        return {
          id:        l.id,
          name:      withName.name ?? `Level ${i + 1}`,
          elevation: l.elevation,
        };
      });
  }

  // ── Event handler ─────────────────────────────────────────────────────────

  private _onExplodeEvent(payload: unknown): void {
    const { mode, soloLevelId } = (payload as { mode?: string; soloLevelId?: string }) ?? {};
    if (!mode || !this._active) return;
    this._applyMode(mode as LevelExplodeMode, soloLevelId as string | undefined);
    console.log(`[LevelExplodeController] Mode: ${mode}${soloLevelId ? ` solo:${soloLevelId}` : ''}`);
  }

  // ── Mode application ──────────────────────────────────────────────────────

  private _applyMode(mode: LevelExplodeMode, soloLevelId: string | undefined): void {
    this._mode        = mode;
    this._soloLevelId = soloLevelId;

    // §FIX-LEVEL-EXPLODE-COORDINATION (L-113) — the per-level offset for the
    // selected element is about to change; once the lift settles we must
    // re-anchor its highlight (frozen geometry-overlay clones) + gizmo so the
    // selection tracks the exploded mesh instead of floating at the old Y.
    this._reanchorPending = true;

    let hiddenCeilings = 0;
    for (const group of this._levelGroups) {
      // Y offset: stacked = 0, exploded = index * GAP
      group.targetOffset = mode === 'exploded' ? group.index * EXPLODE_GAP : 0;

      // Visibility derivation — single source of truth (mirrors the
      // §FLOOR-ISOLATE-ROOMTAG capture/restore discipline: every root's
      // visibility is recomputed from scratch each apply, so collapsing or
      // switching modes restores exactly without per-root saved snapshots).
      //
      //  · solo  → hide all levels except the selected one
      //  · explode → §LEVEL-EXPLODE-HIDE-CEILINGS (2026-06-24): hide ceiling
      //    roots so they don't cap each storey and occlude the room layout
      //    below. Stacked (collapsed) keeps ceilings — the normal building
      //    view is unaffected.
      const levelVisible = mode !== 'solo' || group.levelId === this._soloLevelId;
      for (const root of group.roots) {
        const ceiling = LevelExplodeController._isCeilingRoot(root);
        const visible = levelVisible && !(mode === 'exploded' && ceiling);
        if (ceiling && !visible) hiddenCeilings++;
        root.visible = visible;
      }
    }

    if (mode === 'exploded') {
      console.log(`[§LEVEL-EXPLODE-HIDE-CEILINGS] exploded — hid ${hiddenCeilings} ceiling root(s)`);
    }

    this._startRaf();
  }

  /**
   * §LEVEL-EXPLODE-HIDE-CEILINGS (2026-06-24): a level-group root represents a
   * ceiling when its userData is stamped by CeilingPanelBuilder
   * (elementType/type === 'ceiling'). View-only classification — no geometry or
   * store state is touched.
   */
  private static _isCeilingRoot(root: THREE.Object3D): boolean {
    const ud = root.userData as { elementType?: string; type?: string };
    return ud.elementType === 'ceiling' || ud.type === 'ceiling';
  }

  // ── Scene group building ──────────────────────────────────────────────────

  private _buildLevelGroups(): void {
    // §FIX-LEVEL-EXPLODE-COORDINATION (L-113) — preserve the captured baseY
    // (unstacked/model Y) of roots that survive a reconcile. Re-capturing baseY
    // from a root that is CURRENTLY lifted would bake the explode offset into the
    // baseline and double-lift it on the next apply; only genuinely NEW roots
    // (freshly rebuilt meshes, still at model Y) get a fresh capture.
    const preservedBaseY = new Map<THREE.Object3D, number>();
    for (const group of this._levelGroups) {
      for (const [root, y] of group.originalY) preservedBaseY.set(root, y);
    }

    this._levelGroups = [];

    const bm = window.bimManager as (BimManagerLike & { getLevels(): BimLevel[] }) | undefined;
    if (!bm || !this._scene) {
      console.warn('[LevelExplodeController] bimManager not available — explode will be inert');
      return;
    }

    const allLevels = bm.getLevels().sort((a, b) => a.elevation - b.elevation);
    if (allLevels.length === 0) return;

    // Build a single-pass lookup: elementId → Object3D, plus a per-level bucket of
    // every level-tagged object. §LEVEL-STACK (Bug 1): instanced wall groups carry
    // userData.levelId but NO per-element userData.id, so the id-keyed lookup alone
    // skipped them — they were "left behind" at ground level while CSG walls on the
    // same level lifted. We now also gather by userData.levelId.
    // §LEVEL-STACK (rooms+furniture) — room-NAME labels are THREE.Sprites carrying
    // only userData.roomId (no levelId), so the levelId-keyed bucket below skipped
    // them and they floated at the wrong storey. Stamp the owning level onto any
    // level-less room annotation FIRST (resolved via the room store) so it buckets
    // like the room fill/volume + furniture roots (which already carry levelId).
    const roomStore = (window as { roomStore?: { getById?: (id: string) => { levelId?: string } | undefined } }).roomStore;
    this._scene.traverse(obj => {
      const ud = obj.userData as { levelId?: string; roomId?: string; type?: string; id?: string };
      if (ud.levelId) return;
      const roomId = ud.roomId ?? (ud.type === 'room' ? ud.id : undefined);
      if (roomId && roomStore?.getById) {
        const lvl = roomStore.getById(String(roomId))?.levelId;
        if (lvl) ud.levelId = String(lvl);
      }
    });

    const objectById = new Map<string, THREE.Object3D>();
    const byLevel    = new Map<string, THREE.Object3D[]>();
    this._scene.traverse(obj => {
      const id = obj.userData.id as string | undefined;
      if (id && !objectById.has(id)) {
        objectById.set(id, obj);
      }
      const lvl = obj.userData.levelId as string | undefined;
      if (lvl) {
        const arr = byLevel.get(lvl);
        if (arr) arr.push(obj); else byLevel.set(lvl, [obj]);
      }
    });

    // Drop any level-tagged object whose ancestor is ALSO selected for the same
    // level — offsetting both would compound the Y shift.
    const dropDescendants = (objs: THREE.Object3D[]): THREE.Object3D[] => {
      const set = new Set(objs);
      return objs.filter(o => {
        for (let p = o.parent; p; p = p.parent) if (set.has(p)) return false;
        return true;
      });
    };

    for (let i = 0; i < allLevels.length; i++) {
      const level = allLevels[i];
      const rootSet = new Set<THREE.Object3D>();

      for (const childId of level.childrenIds) {
        const obj = objectById.get(childId);
        if (obj) rootSet.add(obj);
      }
      for (const obj of byLevel.get(level.id) ?? []) rootSet.add(obj);

      const roots = dropDescendants(Array.from(rootSet));
      if (roots.length === 0) continue; // skip empty levels

      const originalY = new Map<THREE.Object3D, number>();
      for (const root of roots) {
        // Reconcile: reuse the survivor's original baseY; capture model Y only
        // for NEW roots (which sit at their true elevation before any lift).
        const preserved = preservedBaseY.get(root);
        originalY.set(root, preserved !== undefined ? preserved : root.position.y);
      }

      this._levelGroups.push({
        levelId:      level.id,
        elevation:    level.elevation,
        index:        i,
        roots,
        originalY,
        targetOffset: 0,
      });
    }

    const classify = (roots: THREE.Object3D[]) => {
      let rm = 0, lbl = 0, fur = 0;
      for (const r of roots) {
        const ud = r.userData as { type?: string; elementType?: string; furnitureType?: string; isRoomOverlay?: boolean; isRoomVolume?: boolean };
        if (ud.type === 'room-label') lbl++;
        else if (ud.elementType === 'Furniture' || ud.furnitureType) fur++;
        else if (ud.isRoomOverlay || ud.isRoomVolume || ud.elementType === 'room') rm++;
      }
      return { rm, lbl, fur };
    };
    let totalRooms = 0, totalLabels = 0, totalFurniture = 0;
    const perLevel = this._levelGroups
      .map(g => {
        const c = classify(g.roots);
        totalRooms += c.rm; totalLabels += c.lbl; totalFurniture += c.fur;
        return `${g.levelId}=${g.roots.length}(rm${c.rm}+lbl${c.lbl}+fur${c.fur})`;
      })
      .join(', ');
    console.log(
      `[§LEVEL-STACK] Built ${this._levelGroups.length} level groups` +
      ` (${this._levelGroups.reduce((acc, g) => acc + g.roots.length, 0)} roots total;` +
      ` rooms ${totalRooms}, labels ${totalLabels}, furniture ${totalFurniture})` +
      ` — per level: ${perLevel}`
    );
  }

  // ── RAF animation loop ────────────────────────────────────────────────────

  private _startRaf(): void {
    this._cancelRaf();
    this._lastTime = performance.now();
    // D.7.6: continuous tick driven by FrameScheduler. The scheduler passes
    // (now, deltaMs); we forward `now` to the existing `_tick` signature so
    // its dt computation against `_lastTime` stays bit-exact with the prior
    // rAF-driven implementation. Self-termination is preserved: when
    // `allSettled` becomes true `_tick` invokes the disposer and the loop
    // stops (matching the legacy "don't re-schedule when settled" branch).
    this._raf = getFrameScheduler().addTickListener(
      'level-explode-tick',
      (now) => this._tick(now),
      'render',
    );
  }

  private _cancelRaf(): void {
    if (this._raf !== null) {
      this._raf();
      this._raf = null;
    }
  }

  private _tick(now: DOMHighResTimeStamp): void {
    const dt   = Math.min((now - this._lastTime) / 1000, 0.05);
    this._lastTime = now;

    // Exponential approach lerp factor: fraction of remaining distance to close per frame.
    // pow(0.01, dt * LERP_FACTOR) decays to ~0 over 1/LERP_FACTOR seconds.
    const k = 1 - Math.pow(0.01, dt * LERP_FACTOR);

    let allSettled = true;

    for (const group of this._levelGroups) {
      for (const root of group.roots) {
        const origY   = group.originalY.get(root) ?? root.position.y;
        const targetY = origY + group.targetOffset;
        const diff    = targetY - root.position.y;

        if (Math.abs(diff) < DONE_EPSILON) {
          root.position.y = targetY;
        } else {
          root.position.y += diff * k;
          allSettled = false;
        }
      }
    }

    // D.7.6: rAF reschedule removed — FrameScheduler re-invokes this body
    // every tick via the disposer registered in `_startRaf`. Self-termination
    // when `allSettled` is preserved by disposing our tick registration so
    // the scheduler stops calling us.
    if (allSettled && this._raf !== null) {
      this._raf();
      this._raf = null;
      // §FIX-LEVEL-EXPLODE-COORDINATION (L-113) — the lift has settled; re-anchor
      // the selection now so the highlight + gizmo sit on the exploded mesh.
      if (this._reanchorPending) this._refreshSelectionAnchor();
    }
  }

  // ── §FIX-LEVEL-EXPLODE-COORDINATION (L-113) — explode-aware interaction ──────

  /**
   * The Y offset (metres) currently applied to `levelId`'s roots by the explode
   * (0 when inactive or stacked). This is the authoritative "active per-level
   * explode offset" the interaction layer adds to a MODEL-space anchor so the
   * selection tracks the exploded mesh, and that a move commit treats as a pure
   * view transform (never persisted).
   */
  getActiveOffsetForLevel(levelId: string): number {
    if (!this._active) return 0;
    const g = this._levelGroups.find(grp => grp.levelId === levelId);
    return g ? g.targetOffset : 0;
  }

  /**
   * The active explode Y offset for the level owning `obj` (0 when inactive /
   * stacked / unknown). Resolves the object's level by group membership first
   * (covers instanced roots with no per-element id), then by walking the parent
   * chain for a `userData.levelId`.
   */
  getActiveOffsetForObject(obj: THREE.Object3D | null | undefined): number {
    if (!this._active || !obj) return 0;

    // (1) Direct membership — obj or an ancestor is a tracked level root.
    for (const group of this._levelGroups) {
      for (const root of group.roots) {
        for (let cur: THREE.Object3D | null = obj; cur; cur = cur.parent) {
          if (cur === root) return group.targetOffset;
        }
      }
    }
    // (2) Fall back to a levelId stamped on obj or an ancestor.
    for (let cur: THREE.Object3D | null = obj; cur; cur = cur.parent) {
      const lvl = (cur.userData as { levelId?: string }).levelId;
      if (lvl) return this.getActiveOffsetForLevel(String(lvl));
    }
    return 0;
  }

  /**
   * Debounced reconcile — coalesces a burst of rebuild events (e.g. a whole-level
   * wall re-resolve) into a single next-frame reconcile.
   */
  private _scheduleReconcile(): void {
    if (this._reconcileScheduled !== null) return;
    this._reconcileScheduled = getFrameScheduler().scheduleOnce(
      'level-explode-reconcile',
      () => {
        this._reconcileScheduled = null;
        this._reconcile();
      },
    );
  }

  private _cancelReconcile(): void {
    if (this._reconcileScheduled !== null) {
      this._reconcileScheduled();
      this._reconcileScheduled = null;
    }
  }

  /**
   * Re-bucket the level groups after an element rebuild (preserving survivors'
   * baseY) and re-apply the current mode so any freshly-rebuilt mesh animates
   * back INTO the exploded stack instead of stranding at its true elevation.
   */
  private _reconcile(): void {
    if (!this._active || !this._scene) return;
    this._buildLevelGroups();
    this._applyMode(this._mode, this._soloLevelId);
  }

  /**
   * Re-anchor the current selection to the (now-lifted) exploded mesh: re-apply
   * its highlight so frozen geometry-overlay clones + OBB boxes track the mesh,
   * and emit `pryzm-reanchor-transform` so the wall/stair gizmo PROXIES re-sync
   * to the lifted position. Deliberately does NOT re-emit `bim-selection-changed`
   * (that would re-populate every property panel). No-op headless / no selection.
   */
  private _refreshSelectionAnchor(): void {
    this._reanchorPending = false;
    const sm = window.selectionManager as SelectionManagerLike | undefined;
    const sel = sm?.selectedObject ?? null;
    if (!sel) return;

    // Direct-attach gizmos (furniture/column/slab/…) already track obj.matrixWorld
    // every frame; walls/stairs use a static proxy that needs an explicit re-sync.
    window.runtime?.events?.emit('pryzm-reanchor-transform', { object: sel });

    // Re-clone the frozen highlight overlay at the settled (lifted) matrixWorld.
    // Skip instanced groups: re-applying without the per-instance id would box the
    // whole group — their OBB is placed correctly via the offset provider instead.
    if (sel.userData?.isInstancedGroup === true) return;
    sm?.applyHighlight?.(sel);
  }
}

export const levelExplodeController = new LevelExplodeController();
