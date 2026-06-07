// apps/editor — A.21.D37 Living Graph: SELECT-TO-3D + select/isolate wiring.
//
// L5. Bridges a Living Graph ROOM node → its geometry in the live 3D model, in
// two user-chosen modes:
//
//   • SELECT  — highlight the room's element instances in the scene via the
//               canonical `selectionBus` (the SAME bus the Inspect tree, plan
//               view + 3D canvas use), so the room's walls/doors/windows light
//               up without dimming anything else.
//   • ISOLATE — dim everything else, REUSING the Inspect panel's isolation
//               pipeline verbatim (createIsolationStateStore + IsolationAnimator
//               + ElementMeshRegistryAdapter + buildModelElementLocations), with
//               an `InspectSelection` of kind `room`.
//
// The room→element map is derived from `buildModelElementLocations(runtime)` —
// the same projection the Inspect tree feeds to the isolation resolver: every
// `elementInstance` location whose parentChain contains `{ kind:'room', id }`
// belongs to that room. No new traversal, no scene access from this file.
//
// P2-safe (no THREE), P3-safe (no requestAnimationFrame — the IsolationAnimator
// subscribes to the frame bus, with a guarded-setInterval fallback identical to
// InspectPanel). P4: window reads go through a narrowly-typed shim, never
// `(window as any)` outside the allowlisted file.

import { buildModelElementLocations, type BuildModelElementLocationsRuntime } from '../inspect/buildModelElementLocations';
import { ElementMeshRegistryAdapter, type SceneLike } from '../inspect/ElementMeshRegistryAdapter';
import { createIsolationStateStore, type IsolationStateStore } from '@pryzm/stores';
import { IsolationAnimator, type FrameSchedulerLike } from '@pryzm/renderer-three';
import type { InspectSelection } from '@pryzm/schemas';

/** The select/isolate mode the panel toggle drives. */
export type RoomFocusMode = 'select' | 'isolate';

/** A minimally-typed view of the bits of `window` we touch (P4-safe — no `any`
 *  cast at the call sites; this is the one narrow shim). */
interface SelectionWindow {
  runtime?: BuildModelElementLocationsRuntime & Record<string, unknown>;
  selectionBus?: {
    selectMany?(ids: string[], source?: string, additive?: boolean): void;
    clearAll?(source?: string): void;
  };
}

function sw(): SelectionWindow | undefined {
  return (typeof window !== 'undefined' ? window : undefined) as unknown as SelectionWindow | undefined;
}

/** The composed runtime, read defensively (same probe order as InspectPanel). */
function resolveRuntime(): BuildModelElementLocationsRuntime {
  return (sw()?.runtime as BuildModelElementLocationsRuntime | undefined) ?? {};
}

/**
 * Resolve a room id → its scene element-instance ids, using the SAME
 * `buildModelElementLocations` projection the Inspect tree uses. An element
 * belongs to the room when its parent chain contains `{ kind:'room', id }`.
 * Read-only, never throws — a partial/empty model yields `[]`.
 */
export function elementIdsForRoom(roomId: string): string[] {
  if (!roomId) return [];
  try {
    const locations = buildModelElementLocations(resolveRuntime());
    const out: string[] = [];
    for (const loc of locations) {
      if (loc.kind !== 'elementInstance') continue;
      if (loc.parentChain.some((p) => p.kind === 'room' && p.id === roomId)) {
        out.push(loc.elementId);
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** The InspectSelection for a room node (level 4 in the C27 master tree). */
function roomSelection(roomId: string): InspectSelection {
  return { kind: 'room', id: roomId, level: 4, breadcrumb: [] };
}

// ── Scene probes (mirror InspectPanel.setupIsolationPipeline) ──────────────────

function readPath(host: Record<string, unknown>, path: ReadonlyArray<string>): unknown {
  try {
    let cur: unknown = host;
    for (const key of path) {
      if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
      cur = (cur as Record<string, unknown>)[key];
    }
    return cur;
  } catch {
    return undefined;
  }
}

function looksLikeScene(obj: unknown): boolean {
  if (obj === null || obj === undefined || typeof obj !== 'object') return false;
  const rec = obj as Record<string, unknown>;
  return typeof rec['traverse'] === 'function' || Array.isArray(rec['children']);
}

function probeScene(runtime: Record<string, unknown>): SceneLike | null {
  const candidates: Array<unknown> = [
    runtime['scene'],
    readPath(runtime, ['renderer', 'scene']),
    readPath(runtime, ['threeRoot']),
    readPath(runtime, ['world', 'scene', 'three']),
    readPath(runtime, ['scene', 'three']),
  ];
  try {
    const w = sw() as unknown as Record<string, unknown> | undefined;
    const wr = w?.['runtime'] as Record<string, unknown> | undefined;
    if (wr) {
      candidates.push(wr['scene']);
      candidates.push(readPath(wr, ['renderer', 'scene']));
    }
    if (w) candidates.push(w['pryzmRenderer']);
  } catch {
    /* defensive */
  }
  for (const c of candidates) if (looksLikeScene(c)) return c as SceneLike;
  return null;
}

function probeFrameScheduler(runtime: Record<string, unknown>): FrameSchedulerLike | null {
  const fs = runtime['frameScheduler'];
  if (fs && typeof (fs as { onFrame?: unknown }).onFrame === 'function') {
    return fs as FrameSchedulerLike;
  }
  return null;
}

/** Guarded-setInterval scheduler — NOT requestAnimationFrame (P3). Identical
 *  fallback to InspectPanel's `makeFallbackScheduler`. */
function makeFallbackScheduler(): FrameSchedulerLike {
  return {
    onFrame(_priority, cb): () => void {
      const interval = setInterval(() => {
        try { cb(16.67); }
        catch (err) { console.error('[living-graph] isolation tick threw:', err); }
      }, 16) as unknown as number;
      return () => { clearInterval(interval as unknown as ReturnType<typeof setInterval>); };
    },
  };
}

/**
 * The SELECT-TO-3D controller the overlay owns. Lazily sets up the Inspect
 * isolation pipeline on first use, then routes a focused room node to either
 * SELECT (selectionBus highlight) or ISOLATE (dim the rest) per the panel mode.
 *
 * Lifecycle: `setMode` / `focus` are called from the overlay; `clear` drops both
 * the highlight and the isolation; `dispose` tears down the animator + store.
 */
export class RoomFocusController {
  private mode: RoomFocusMode = 'select';
  private store: IsolationStateStore | null = null;
  private animator: IsolationAnimator | null = null;
  private pipelineTried = false;
  /** The room currently driven into the 3D model (so re-focus / mode-switch can
   *  re-apply, and clear knows what to undo). */
  private activeRoomId: string | null = null;

  getMode(): RoomFocusMode {
    return this.mode;
  }

  /** Switch select↔isolate. Re-applies to the active room so the toggle takes
   *  effect immediately on whatever room is focused. */
  setMode(mode: RoomFocusMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (this.activeRoomId) this.focus(this.activeRoomId);
  }

  /** Drive a room node into the 3D model in the current mode. A null/empty id
   *  clears any current highlight + isolation. */
  focus(roomId: string | null): void {
    if (!roomId) {
      this.clear();
      return;
    }
    this.activeRoomId = roomId;
    const ids = elementIdsForRoom(roomId);
    if (this.mode === 'select') {
      // Highlight only — and lift any isolation so the two modes don't stack.
      this.clearIsolation();
      this.applySelection(ids);
    } else {
      // Dim the rest — and drop the scene highlight so isolation reads cleanly.
      this.clearSelection();
      this.applyIsolation(roomId);
    }
  }

  /** Clear BOTH the scene highlight and the isolation (node de-selected / hide). */
  clear(): void {
    this.activeRoomId = null;
    this.clearSelection();
    this.clearIsolation();
  }

  dispose(): void {
    this.clear();
    try { this.animator?.stop(); } catch { /* ignore */ }
    try { this.store?.dispose(); } catch { /* ignore */ }
    this.animator = null;
    this.store = null;
  }

  // ── Select (highlight) via the canonical selectionBus ───────────────────────

  private applySelection(ids: string[]): void {
    const bus = sw()?.selectionBus;
    if (!bus?.selectMany) return;
    try {
      // Source 'inspect-panel' — the bus's feedback-loop guard treats us as the
      // tree/inspect surface, so the 3D canvas + property panel react correctly.
      bus.selectMany(ids, 'inspect-panel');
    } catch (err) {
      console.warn('[living-graph] selection highlight failed:', err);
    }
  }

  private clearSelection(): void {
    const bus = sw()?.selectionBus;
    if (!bus?.clearAll) return;
    try { bus.clearAll('inspect-panel'); }
    catch { /* non-fatal */ }
  }

  // ── Isolate via the Inspect isolation pipeline ──────────────────────────────

  /** Lazily build the isolation pipeline (store + animator + scene registry),
   *  EXACTLY as InspectPanel.setupIsolationPipeline does. Tried once; on failure
   *  isolation no-ops (select still works). */
  private ensurePipeline(): IsolationStateStore | null {
    if (this.store) return this.store;
    if (this.pipelineTried) return this.store;
    this.pipelineTried = true;
    const store = createIsolationStateStore();
    try {
      const runtime = (sw()?.runtime as Record<string, unknown> | undefined) ?? {};
      const scene: SceneLike = probeScene(runtime) ?? { children: [] };
      const registry = new ElementMeshRegistryAdapter(scene);
      const scheduler: FrameSchedulerLike = probeFrameScheduler(runtime) ?? makeFallbackScheduler();
      const animator = new IsolationAnimator(store, scheduler, registry);
      animator.start();
      this.animator = animator;
    } catch (err) {
      console.warn('[living-graph] isolation pipeline setup failed:', err);
      this.animator = null;
    }
    this.store = store;
    return store;
  }

  private applyIsolation(roomId: string): void {
    const store = this.ensurePipeline();
    if (!store) return;
    try {
      const elements = buildModelElementLocations(resolveRuntime());
      store.applyIsolation(roomSelection(roomId), elements, { hideUnrelated: false });
    } catch (err) {
      console.warn('[living-graph] applyIsolation failed:', err);
    }
  }

  private clearIsolation(): void {
    try { this.store?.clearIsolation(); }
    catch { /* non-fatal */ }
  }
}
