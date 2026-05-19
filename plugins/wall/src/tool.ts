// WallCreationTool — Straight + Arc + Polyline modes, vanilla TS
// (S09-T3 + S10-D6).
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md`:
//   - §S09-T3 (line 694): "vanilla TS Tool subclass... Click/drag/escape
//     state machine.  Constructor mirrors `WallTool.ts:144-147` strict-
//     injection.  Emits `CreateWall` commands via `commandBus.dispatch(...)`.
//     Snap-cycling via Tab key (mirrors `WallSnapCycler.ts:196`)."
//   - §S10-D6: "Arc + Polyline land S10."
//
// State machines (per `mode`):
//
//   STRAIGHT (S09):
//     IDLE
//       │  onPointerDown (1st click)
//       ▼
//     AWAITING_END  ─── onKeyDown(Esc) / cancel() ──→  IDLE
//       │  onPointerDown (2nd click)
//       ▼  → dispatch wall.create (Line)
//     IDLE
//
//   ARC (S10):
//     IDLE
//       │  onPointerDown (1st click — start)
//       ▼
//     AWAITING_THROUGH  ─── Esc ──→  IDLE
//       │  onPointerDown (2nd click — through point becomes Bézier control)
//       ▼
//     AWAITING_END_ARC  ─── Esc ──→  IDLE
//       │  onPointerDown (3rd click — end)
//       ▼  → dispatch wall.create with `curve.control` set
//     IDLE
//
//   POLYLINE (S10):
//     IDLE
//       │  onPointerDown (1st click — first vertex)
//       ▼
//     BUILDING  ─── Esc ──→ IDLE                       (drop everything)
//       │ ─── Backspace ──→ BUILDING                   (pop last vertex)
//       │ ─── onPointerDown ──→ BUILDING               (push vertex)
//       │ ─── Enter / dblclick ──→ IDLE                (commit N-1 walls)
//       ▼
//
//   In all modes, `Tab` invokes `snapCycle?.()` (no-op default).
//
// Strict-injection (mirrors `WallTool.ts:144-147` verbatim):
//   The constructor THROWS if `commandBus` or `screenToWorld` is missing.
//   No `(window as any)` fallback.  This is what lets the toolbar safely
//   lazy-instantiate the tool ONLY after bootstrap has wired the bus.
//
// THREE-FREE: this file does NOT import THREE.  Screen-to-world resolution
// is delegated to the injected `screenToWorld` callback so the tool can be
// unit-tested without a renderer.  The toolbar wires the real raycaster-
// backed `screenToWorld` from the renderer's RaycasterFacade.

import type { CommandBus } from '@pryzm/plugin-sdk';
import type { WallSystemType } from './system-type-store.js';

/** A 3D point in world space.  Mirrors `Point3D` from `@pryzm/geometry-kernel`
 *  (we re-declare here so the tool stays in the L2 layer — the kernel
 *  type isn't visible to L2 today). */
export interface ToolPoint3D {
  x: number;
  y: number;
  z: number;
}

/** Resolves a pointer event to a world-space point on the active level's
 *  plane.  Returns `undefined` when no surface is hit (e.g. pointer over
 *  the sky outside the level plane). */
export type ScreenToWorld = (
  ev: { clientX: number; clientY: number; pointerId: number },
) => ToolPoint3D | undefined;

/** Snap-cycler hook (mirrors `WallSnapCycler.ts`). */
export type SnapCycle = () => void;

/** Optional preview hook — the renderer subscribes to this to draw a
 *  ghost line / arc / polyline from accumulated points to the current
 *  pointer.  Default: no-op.
 *
 *  - Straight mode: passes `[start, current]`.
 *  - Arc mode: passes `[start, throughOrCurrent]` then
 *               `[start, through, current]` (3-tuple).
 *  - Polyline mode: passes the full accumulated vertex list with the
 *               current pointer appended.
 *  - Reset: passes `[]`. */
export type PreviewLine = (points: readonly ToolPoint3D[]) => void;

/** Wall creation mode — chosen by the toolbar via the `mode` constructor
 *  option.  Defaults to `'straight'` (S09 behaviour preserved). */
export type WallToolMode = 'straight' | 'arc' | 'polyline';

export interface WallCreationToolDeps {
  /** REQUIRED.  Strict-injection: throws on missing.  Mirrors
   *  `WallTool.ts:144`. */
  readonly commandBus: CommandBus;
  /** REQUIRED.  Resolves pointer events to world-space points. */
  readonly screenToWorld: ScreenToWorld;
  /** Optional — Tab-key snap-cycle hook.  Default: no-op. */
  readonly snapCycle?: SnapCycle;
  /** Optional — preview hook.  Default: no-op. */
  readonly previewLine?: PreviewLine;
  /** Optional — current level id stamped on every `wall.create`. */
  readonly levelId?: string;
  /** Optional — current system-type from the catalogue. */
  readonly systemType?: WallSystemType;
  /** Optional — wall creation mode.  Default: `'straight'`. */
  readonly mode?: WallToolMode;
}

/** Public union of every state across every mode. */
export type WallToolState =
  | 'IDLE'
  | 'AWAITING_END'         // straight mode, after 1st click
  | 'AWAITING_THROUGH'     // arc mode, after 1st click
  | 'AWAITING_END_ARC'     // arc mode, after 2nd click (through point set)
  | 'BUILDING';            // polyline mode, after 1st click

export const WALL_TOOL_ID = 'wall.create' as const;

export class WallCreationTool {
  static readonly id = WALL_TOOL_ID;

  private state: WallToolState = 'IDLE';
  private readonly mode: WallToolMode;

  /** Single start point used by straight + arc modes. */
  private startPoint: ToolPoint3D | null = null;

  /** Through point used by arc mode (becomes Bézier control). */
  private throughPoint: ToolPoint3D | null = null;

  /** Vertex accumulator used by polyline mode.  Each consecutive pair
   *  becomes a separate `wall.create` command on commit. */
  private vertices: ToolPoint3D[] = [];

  constructor(private readonly deps: WallCreationToolDeps) {
    if (!deps || deps.commandBus === undefined || deps.commandBus === null) {
      throw new Error(
        '[WallCreationTool] strict-injection violation — `commandBus` is required (mirrors WallTool.ts:144).',
      );
    }
    if (deps.screenToWorld === undefined || deps.screenToWorld === null) {
      throw new Error(
        '[WallCreationTool] strict-injection violation — `screenToWorld` is required.',
      );
    }
    this.mode = deps.mode ?? 'straight';
  }

  // ── Public read-only state ────────────────────────────────────────

  /** Current state. */
  getState(): WallToolState {
    return this.state;
  }

  /** Current mode. */
  getMode(): WallToolMode {
    return this.mode;
  }

  /** Start point — set by the first click in straight + arc modes. */
  getStartPoint(): Readonly<ToolPoint3D> | null {
    return this.startPoint;
  }

  /** Through point — set by the second click in arc mode. */
  getThroughPoint(): Readonly<ToolPoint3D> | null {
    return this.throughPoint;
  }

  /** Polyline vertices — populated as the user clicks in polyline mode.
   *  Returned as a read-only snapshot so tests can inspect without
   *  mutating. */
  getVertices(): readonly Readonly<ToolPoint3D>[] {
    return this.vertices.slice();
  }

  // ── Tool API ──────────────────────────────────────────────────────

  onPointerDown(ev: { clientX: number; clientY: number; pointerId: number }): void {
    const world = this.deps.screenToWorld(ev);
    if (world === undefined) return;

    switch (this.mode) {
      case 'straight':
        return this.onPointerDownStraight(world);
      case 'arc':
        return this.onPointerDownArc(world);
      case 'polyline':
        return this.onPointerDownPolyline(world);
    }
  }

  onPointerMove(ev: { clientX: number; clientY: number; pointerId: number }): void {
    if (this.state === 'IDLE') return;
    const world = this.deps.screenToWorld(ev);
    if (world === undefined) return;

    switch (this.mode) {
      case 'straight':
        if (this.startPoint !== null) this.deps.previewLine?.([this.startPoint, world]);
        return;
      case 'arc':
        if (this.state === 'AWAITING_THROUGH' && this.startPoint !== null) {
          this.deps.previewLine?.([this.startPoint, world]);
        } else if (
          this.state === 'AWAITING_END_ARC'
          && this.startPoint !== null
          && this.throughPoint !== null
        ) {
          this.deps.previewLine?.([this.startPoint, this.throughPoint, world]);
        }
        return;
      case 'polyline':
        if (this.state === 'BUILDING' && this.vertices.length > 0) {
          this.deps.previewLine?.([...this.vertices, world]);
        }
        return;
    }
  }

  /** Double-click commits a polyline (when in polyline mode + BUILDING).
   *  No-op in straight / arc modes. */
  onDoubleClick(_ev: { clientX: number; clientY: number; pointerId: number }): void {
    if (this.mode === 'polyline' && this.state === 'BUILDING') {
      void this.commitPolyline();
    }
  }

  onKeyDown(ev: { key: string }): void {
    if (ev.key === 'Escape') {
      this.cancel();
      return;
    }
    if (ev.key === 'Tab') {
      this.deps.snapCycle?.();
      return;
    }
    if (ev.key === 'Enter' && this.mode === 'polyline' && this.state === 'BUILDING') {
      void this.commitPolyline();
      return;
    }
    if (
      ev.key === 'Backspace'
      && this.mode === 'polyline'
      && this.state === 'BUILDING'
    ) {
      this.vertices.pop();
      if (this.vertices.length === 0) {
        this.reset();
      } else {
        this.deps.previewLine?.(this.vertices.slice());
      }
      return;
    }
  }

  /** Reset to IDLE without dispatching.  Public for the toolbar to call
   *  on tool deactivation (user picked another tool mid-draw). */
  cancel(): void {
    this.reset();
  }

  // ── Per-mode pointer handlers ─────────────────────────────────────

  private onPointerDownStraight(world: ToolPoint3D): void {
    if (this.state === 'IDLE') {
      this.startPoint = world;
      this.state = 'AWAITING_END';
      this.deps.previewLine?.([world, world]);
      return;
    }
    if (this.startPoint === null) {
      this.cancel();
      return;
    }
    void this.dispatchLine(this.startPoint, world);
    this.reset();
  }

  private onPointerDownArc(world: ToolPoint3D): void {
    if (this.state === 'IDLE') {
      this.startPoint = world;
      this.state = 'AWAITING_THROUGH';
      this.deps.previewLine?.([world, world]);
      return;
    }
    if (this.state === 'AWAITING_THROUGH') {
      this.throughPoint = world;
      this.state = 'AWAITING_END_ARC';
      this.deps.previewLine?.([this.startPoint!, world, world]);
      return;
    }
    // AWAITING_END_ARC → dispatch + back to IDLE.
    if (this.startPoint === null || this.throughPoint === null) {
      this.cancel();
      return;
    }
    void this.dispatchArc(this.startPoint, this.throughPoint, world);
    this.reset();
  }

  private onPointerDownPolyline(world: ToolPoint3D): void {
    if (this.state === 'IDLE') {
      this.vertices = [world];
      this.state = 'BUILDING';
      this.deps.previewLine?.([world]);
      return;
    }
    // BUILDING — append.
    this.vertices.push(world);
    this.deps.previewLine?.(this.vertices.slice());
  }

  // ── Internals ─────────────────────────────────────────────────────

  private reset(): void {
    this.state = 'IDLE';
    this.startPoint = null;
    this.throughPoint = null;
    this.vertices = [];
    this.deps.previewLine?.([]);
  }

  private async dispatchLine(a: ToolPoint3D, b: ToolPoint3D): Promise<void> {
    await this.deps.commandBus.executeCommand('wall.create', {
      levelId: this.deps.levelId ?? '',
      baseLine: [
        { x: a.x, y: a.y, z: a.z },
        { x: b.x, y: b.y, z: b.z },
      ],
      systemTypeId: this.deps.systemType?.id,
    });
  }

  private async dispatchArc(
    a: ToolPoint3D,
    through: ToolPoint3D,
    b: ToolPoint3D,
  ): Promise<void> {
    // The wall schema's `curve` field is a quadratic-Bézier `{ control,
    // segments }` (`packages/schemas/src/elements/Wall.ts:47-50`).  The
    // through-point becomes the control point; the schema default
    // `segments=16` is preserved.
    await this.deps.commandBus.executeCommand('wall.create', {
      levelId: this.deps.levelId ?? '',
      baseLine: [
        { x: a.x, y: a.y, z: a.z },
        { x: b.x, y: b.y, z: b.z },
      ],
      curve: {
        control: { x: through.x, y: through.y, z: through.z },
        segments: 16,
      },
      systemTypeId: this.deps.systemType?.id,
    });
  }

  /** Commit the accumulated polyline as `vertices.length - 1` straight
   *  walls.  Each segment is a separate `wall.create` command sharing
   *  `levelId` / `systemTypeId` (the wall handler does not understand
   *  multi-segment payloads).  After commit, returns to IDLE. */
  private async commitPolyline(): Promise<void> {
    const verts = this.vertices.slice();
    this.reset();
    if (verts.length < 2) return;
    for (let i = 0; i < verts.length - 1; i++) {
      const a = verts[i]!;
      const b = verts[i + 1]!;
      await this.deps.commandBus.executeCommand('wall.create', {
        levelId: this.deps.levelId ?? '',
        baseLine: [
          { x: a.x, y: a.y, z: a.z },
          { x: b.x, y: b.y, z: b.z },
        ],
        systemTypeId: this.deps.systemType?.id,
      });
    }
  }
}
