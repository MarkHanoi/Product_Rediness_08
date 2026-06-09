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

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  init(scene: THREE.Scene): void {
    this._scene = scene;
    // runtime.events is available here — init() is called from InspectModeCoordinator.init()
    // which in turn is called from engineLauncher.ts after flushRuntimeEventListeners().
    this._unsubExplode = window.runtime?.events?.on(
      'pryzm-inspect-level-explode',
      this._onExplodeEvent.bind(this),
    ) ?? null;
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

    for (const group of this._levelGroups) {
      // Y offset: stacked = 0, exploded = index * GAP
      group.targetOffset = mode === 'exploded' ? group.index * EXPLODE_GAP : 0;

      // Visibility: solo hides all levels except the selected one
      const isVisible = mode !== 'solo' || group.levelId === this._soloLevelId;
      for (const root of group.roots) {
        root.visible = isVisible;
      }
    }

    this._startRaf();
  }

  // ── Scene group building ──────────────────────────────────────────────────

  private _buildLevelGroups(): void {
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
        originalY.set(root, root.position.y);
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
    }
  }
}

export const levelExplodeController = new LevelExplodeController();
