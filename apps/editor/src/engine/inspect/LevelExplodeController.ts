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
 *   - Event Bus Impact:   No — consumes the `pryzm-inspect-level-explode` runtime event
 *                         plus THREE's own `childadded`/`childremoved` scene-graph
 *                         events (L-233); emits nothing but the narrow
 *                         `pryzm-reanchor-transform` re-anchor signal.
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

// §FIX-LEVEL-EXPLODE-RECONCILE-ALL-TYPES (L-233) — the reconcile TRIGGER is now
// TYPE-AGNOSTIC BY CONSTRUCTION. It used to be a hand-maintained allowlist of
// per-element-type `bim-<type>-added|updated|removed` window events
// (§FIX-LEVEL-EXPLODE-COORDINATION / L-113). That allowlist was necessarily
// incomplete — it covered wall/slab/floor/ceiling/furniture/column/beam/roof/
// stair/curtainwall/door/window but NOT rooms, room-bounding-lines, room LABELS,
// handrail, opening, plumbing, lighting or stair-railing. So the founder's
// MOVE_WINDOW (which fires `bim-window-updated` + `bim-wall-updated` → the wall
// re-lifted) ALSO triggered a room re-detect that rebuilt 789 room + label roots
// which were NOT on the list — they dropped back to model Y while the walls
// stayed exploded. "Many elements un-stacked from one edit."
//
// The invariant we now key on instead: EVERY level-tracked root is a DIRECT CHILD
// of the scene root. Verified across the builder surface — WallFragmentBuilder /
// SlabFragmentBuilder / ColumnFragmentBuilder (`this.scene.add(root)`),
// InstancedMeshCoalescer (`scene.add(merged)`) and RoomLabelRenderer
// (`this._scene.add(sprite)` / `.remove(sprite)`) all attach their ROOT to the
// scene and nest their meshes INSIDE it. A rebuild is therefore always a
// `scene.remove(oldRoot)` + `scene.add(newRoot)` pair on the scene root.
//
// ⚠ CORRECTED 2026-08-19 (L-1123) — the paragraph below used to end with the claim
// that *"an in-place rebuild that swaps only a root's CHILD meshes needs no reconcile:
// the root object (and hence its lifted position.y + its captured baseY) is untouched.
// Only a root SWAP can drop an element, and only a root swap fires here."*
// **THE FIRST HALF IS FALSE, MEASURED.** `SlabFragmentBuilder._buildSlab` REUSES its
// root (`this.slabRoots.get(id)`) and ends with `root.position.set(pivotX, worldY,
// pivotZ)` — an in-place rebuild that MOVES the root, fires nothing on the scene root,
// and therefore silently drops that element out of the exploded stack. The same shape
// is available to any builder that repositions a retained root.
// The SECOND half — that only a root swap fires here — is still true, and that is
// precisely why the trigger cannot be the whole answer. The durable fix is NOT another
// trigger: builders now PUBLISH the model Y they wrote (`root.userData.modelY`) and
// this controller RE-DERIVES its baseline from it instead of caching a copy
// (§LEVEL-STACK-MODEL-Y below). A re-derived baseline is immune to every cause of a
// stale one, including the ones nobody has measured yet.
//
// THREE (r163+, this repo is 0.183) dispatches `childadded` / `childremoved` on
// the PARENT for exactly those calls. Listening to them on the scene root catches
// every rebuilt root of every element type — rooms, labels, handrails, openings
// and ANY FUTURE TYPE — with no list to remember. Note an in-place rebuild that
// swaps only a root's CHILD meshes needs no reconcile: the root object (and hence
// its lifted position.y + its captured baseY) is untouched, so it stays in the
// stack. Only a root SWAP can drop an element, and only a root swap fires here.
const SCENE_MUTATION_EVENTS = ['childadded', 'childremoved'] as const;

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
  /** Baseline for dt. `null` = no tick yet; the next tick adopts its own `now`. */
  private _lastTime:     number | null = null;
  private _active:       boolean = false;

  private _unsubExplode: (() => void) | null = null;

  // §FIX-LEVEL-EXPLODE-COORDINATION (L-113) — rebuild reconciliation state.
  /** Bound scene-mutation handler, kept so we can removeEventListener on dispose. */
  private _onSceneMutation: ((e: { child?: THREE.Object3D }) => void) | null = null;
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

    // §FIX-LEVEL-EXPLODE-RECONCILE-ALL-TYPES (L-233) — reconcile on SCENE-GRAPH
    // mutation, not on a per-element-type event allowlist. Every rebuilt root of
    // every element type lands here (see SCENE_MUTATION_EVENTS above), so
    // rooms/labels/handrails/openings — and any future type — are covered by
    // construction rather than by remembering to add them to a list.
    this._onSceneMutation = (e) => this._onSceneChildMutated(e?.child);
    for (const evt of SCENE_MUTATION_EVENTS) {
      scene.addEventListener(evt, this._onSceneMutation as never);
    }

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
    let fromModelY = 0;
    for (const group of this._levelGroups) {
      for (const root of group.roots) {
        // §LEVEL-STACK-MODEL-Y (L-1123) — restore to the BUILDER'S CURRENT model Y when
        // the root publishes one, never to a baseline captured before the user's edits.
        // The cached `originalY` remains the answer only for roots that publish nothing.
        const publishedModelY = (root.userData as { modelY?: unknown }).modelY;
        if (typeof publishedModelY === 'number' && Number.isFinite(publishedModelY)) {
          root.position.y = publishedModelY;
          fromModelY++;
        } else {
          const origY = group.originalY.get(root);
          if (origY !== undefined) root.position.y = origY;
        }
        root.visible = true;
        restored++;
      }
    }
    this._levelGroups = [];
    // §EXPLODE-MOVES-THE-BOUNDS (L-2071) — collapsing the stack moves the bounds back.
    window.__sceneBoundsCache?.invalidate();
    console.log(
      `[§LEVEL-STACK] Deactivated — restored ${restored} root positions + visibility `
      + `(${fromModelY} from the builder's published userData.modelY, `
      + `${restored - fromModelY} from the captured baseline)`,
    );
  }

  dispose(): void {
    this.deactivate();
    this._unsubExplode?.();
    this._unsubExplode = null;
    if (this._onSceneMutation && this._scene) {
      for (const evt of SCENE_MUTATION_EVENTS) {
        this._scene.removeEventListener(evt, this._onSceneMutation as never);
      }
    }
    this._onSceneMutation = null;
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

    // §FIX-EXPLODE-GROUP-WIPE (L-1124) — the guard runs BEFORE the wipe now.
    //
    // This used to read `this._levelGroups = []` and only THEN check for bimManager /
    // the scene, returning early on a miss. On a reconcile that hit either miss — and a
    // reconcile can fire at any moment, driven by any element rebuild — the controller
    // discarded its entire record of which roots it had lifted WHILE THEY WERE STILL
    // LIFTED. `deactivate()` then iterated an empty list and restored NOTHING: every
    // element in the model stayed at its exploded height with no channel left that knew
    // where it belonged. Losing the restore map is strictly worse than an inert
    // reconcile, so the map now survives a failed rebuild.
    const bm = window.bimManager as (BimManagerLike & { getLevels(): BimLevel[] }) | undefined;
    if (!bm || !this._scene) {
      console.warn(
        '[LevelExplodeController] §FIX-EXPLODE-GROUP-WIPE bimManager not available — reconcile '
        + `is inert and the existing ${this._levelGroups.length} level group(s) are KEPT, so the `
        + 'lifted roots can still be restored.',
      );
      return;
    }

    const allLevels = bm.getLevels().sort((a, b) => a.elevation - b.elevation);
    if (allLevels.length === 0) {
      console.warn(
        '[LevelExplodeController] §FIX-EXPLODE-GROUP-WIPE bimManager reports ZERO levels — '
        + `keeping the existing ${this._levelGroups.length} level group(s) rather than dropping `
        + 'the restore map for roots that are currently lifted.',
      );
      return;
    }

    this._levelGroups = [];

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
        // §LEVEL-STACK-MODEL-Y (L-1123) — PREFER THE BUILDER'S PUBLISHED MODEL Y over
        // any cached baseline.
        //
        // ⭐ WHAT WAS WRONG. `originalY` was an absolute Y captured once and preserved
        // across every later reconcile, and `deactivate()` writes it straight back onto
        // the root. That makes this controller a SECOND AUTHORITY on element height
        // (C84 EI-1/EI-9) — and a stale one, because builders reposition their root on
        // EVERY rebuild: `SlabFragmentBuilder.ts` `root.position.set(pivotX, worldY,
        // pivotZ)` runs whenever thickness, baseOffset or LEVEL changes, and it reuses
        // the SAME root object, so no `childadded`/`childremoved` fires and this
        // controller is never told. Collapse then wrote the pre-edit height back over
        // the correct one, and nothing recomputed it afterwards: the element was
        // stranded at a height no store agreed with. That is the founder's *"a slab was
        // left up there and it doesn't relocate"* (L-1123), and the class of it is
        // exactly L-1087 — a cached copy of a number another layer owns.
        //
        // ⛔ THE HEADER OF THIS FILE ASSERTED THE OPPOSITE and must not be restored:
        // *"an in-place rebuild that swaps only a root's CHILD meshes needs no
        // reconcile: the root object (and hence its lifted position.y + its captured
        // baseY) is untouched."* It IS touched, by the line quoted above.
        //
        // THE RULE: when a root publishes `userData.modelY`, that is the baseline, every
        // time — the builder wrote it on its last build, so it cannot be stale. Only a
        // root that publishes nothing falls back to the old two-branch behaviour
        // (preserve a survivor's baseY; capture a new root's current Y). A root at a
        // lifted Y with no published model Y still cannot be re-captured, which is the
        // double-lift `preservedBaseY` was written to prevent.
        const publishedModelY = (root.userData as { modelY?: unknown }).modelY;
        if (typeof publishedModelY === 'number' && Number.isFinite(publishedModelY)) {
          originalY.set(root, publishedModelY);
          continue;
        }
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
    // §FIX-LEVEL-EXPLODE-OFFSET-COMPOUNDING (L-248) — ONE CLOCK, AND IT IS THE
    // INJECTED ONE. This used to seed `performance.now()` — the AMBIENT global —
    // while `_tick` is handed its `now` by the FrameScheduler. Nothing guarantees
    // those two clocks share a time origin, so the FIRST dt was whatever the gap
    // between them happened to be. A NEGATIVE dt inverts the approach factor
    // (`k = 1 - 0.01^(dt*LERP)` goes large-negative), the lerp runs BACKWARDS, and
    // the lift diverges exponentially — the model is flung to ~1e+119 in a few
    // frames. `null` means "no baseline yet"; the first tick establishes it from
    // the same clock every later tick uses, so dt starts at exactly 0.
    this._lastTime = null;
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
    // §FIX-LEVEL-EXPLODE-OFFSET-COMPOUNDING (L-248). First tick after a start:
    // adopt `now` as the baseline (dt = 0) rather than differencing it against a
    // foreign clock. Thereafter dt is clamped to [0, 0.05]: the upper bound keeps
    // a long stall from teleporting the stack, and the LOWER bound is the load-
    // bearing one — time must never run backwards. A negative dt makes
    // `k = 1 - 0.01^(dt*LERP)` large-NEGATIVE, which turns the exponential
    // approach into exponential DIVERGENCE (`position.y += diff * k` overshoots
    // further every frame). That is not drift; it reaches ~1e+119 in a handful of
    // frames and rips every root out of the exploded stack. Clamping here makes
    // the lerp correct for ANY timestamp source, monotonic or not.
    const dt   = this._lastTime === null
      ? 0
      : Math.max(0, Math.min((now - this._lastTime) / 1000, 0.05));
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
      // §EXPLODE-MOVES-THE-BOUNDS (L-2071) — the lift moved every root up to 10 m per
      // level, and NOTHING told the scene-bounds cache. Every consumer of those bounds
      // then reads the UN-exploded stack: default framing, Fit All, the near-plane
      // standoff policy (§CAM-NEAR-SCALES-WITH-STANDOFF, L-2070). Invalidating at the
      // SETTLE point and not per tick is deliberate — `getBounds()` rebuilds by full
      // scene traversal, so a per-frame invalidation would traverse the scene on every
      // frame of the animation.
      window.__sceneBoundsCache?.invalidate();
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
   * §FIX-LEVEL-EXPLODE-RECONCILE-ALL-TYPES (L-233) — the single, type-agnostic
   * reconcile trigger: a root was added to / removed from the SCENE ROOT.
   *
   * Two cheap gates keep this off the hot path without ever reintroducing a
   * per-element-type list:
   *
   *  (1) MODE. Only a NON-stacked mode can strand a rebuilt root. In `stacked`
   *      every group's targetOffset is 0 and every root sits at its model Y — a
   *      freshly rebuilt root arrives at model Y and is therefore ALREADY correct,
   *      so there is nothing to reconcile. `exploded` (Y offset + ceiling-hide) and
   *      `solo` (per-level visibility) both need the rebuilt root re-processed.
   *
   *  (2) TRACKABILITY. Skip nodes `_buildLevelGroups` could never bucket anyway.
   *      This is deliberately NOT an element-type check — it is precisely the
   *      predicate `_buildLevelGroups` itself keys on (`userData.levelId`, or a
   *      `userData.id` matched against `level.childrenIds`, or a `userData.roomId`
   *      resolved to a level via the room store). A node carrying none of the three
   *      cannot land in any level group, so it cannot drop out of the stack. This
   *      filters the scene's non-BIM furniture — the TransformControls helper, the
   *      selection-highlight outlines, the diagnostic overlay group — so hovering
   *      or selecting in exploded mode does not trigger a whole-scene re-bucket.
   */
  private _onSceneChildMutated(child: THREE.Object3D | undefined): void {
    if (!this._active) return;
    if (this._mode === 'stacked') return;
    if (child && !LevelExplodeController._isTrackableRoot(child)) return;
    this._scheduleReconcile();
  }

  /** True when `obj` carries level-identifying userData — see gate (2) above. */
  private static _isTrackableRoot(obj: THREE.Object3D): boolean {
    const ud = obj.userData as { levelId?: string; id?: string; roomId?: string };
    return ud.levelId !== undefined || ud.id !== undefined || ud.roomId !== undefined;
  }

  /** True when `obj`'s parent chain still reaches the live scene root. */
  private _isAttachedToScene(obj: THREE.Object3D): boolean {
    for (let cur: THREE.Object3D | null = obj; cur; cur = cur.parent) {
      if (cur === this._scene) return true;
    }
    return false;
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

    // §FIX-LEVEL-EXPLODE-RECONCILE-ALL-TYPES (L-233) P4 — NEVER re-anchor onto a
    // DETACHED object. When the reconcile is driven by a rebuild, `selectedObject`
    // can still point at the PRE-rebuild mesh that the builder just
    // `scene.remove()`d. Emitting `pryzm-reanchor-transform` for it makes
    // registerTransformDragHandler run `wallTransformController.activateFor(stale)`
    // et al, which re-attaches TransformControls to an object whose parent chain no
    // longer reaches the scene root — and stock THREE's
    // `TransformControls.updateMatrixWorld()` then THROWS "The attached 3D object
    // must be a part of the scene graph" on EVERY render frame. That is the
    // §SELECT-GIZMO-REATTACH per-frame flood in the founder's log: the explode
    // controller was re-arming the very stale binding SelectionManager's guard had
    // just torn down. Bail out instead — SelectionManager owns re-resolution
    // (`_reresolveSelectionAfterRebuild` re-selects the REBUILT mesh by element id
    // on the same `bim-*-updated` event, which re-applies the highlight and
    // re-attaches the gizmo). The rebuilt mesh is already lifted by the reconcile
    // above, so that re-selection lands on the mesh at its exploded Y.
    if (!this._isAttachedToScene(sel)) return;

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
