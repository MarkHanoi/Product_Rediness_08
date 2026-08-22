/**
 * BalconyPlanToolHandler — §FEAT-BALCONY-COMPOUND (L-5605..L-5607) · C103 · ADR-0333
 *
 * THE PLAN-VIEW ROUTE THAT MAKES A BALCONY REACHABLE. It is axis 3 of the four the
 * pool taught this repo to check:
 *
 *   1. no `BalconyStore` was ever constructed        → closed by PluginRegistry
 *   2. no `balcony` storeKey, so the bus threw       → closed by PluginRegistry
 *   3. NOTHING DISPATCHED `balcony.create`           → CLOSED HERE
 *   4. the AI chat classifies unknown verbs class B  → still open (L-5609)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THIS FILE CONTAINS NO BALCONY GEOMETRY AND NOT ONE DIMENSIONAL LITERAL.
 * ═══════════════════════════════════════════════════════════════════════════════
 * It resolves a HOST, draws a PREVIEW and dispatches ONE command. The rectangle, the
 * free-edge rule, every dimension and all three members are computed by
 * `@pryzm/geometry-balcony`, which is pure and already tested. The preview is drawn
 * from `balconyRectangle()` — **the same function the commit passes to the bus** — so
 * what the user aims at cannot diverge from what lands. That is
 * §FIX-DOOR-PREVIEW-EXACT (L-127) applied at authoring time rather than retrofitted.
 *
 * ─── THE FOUNDER'S GESTURE, VERBATIM ────────────────────────────────────────────
 *   *"The user can hosted as you host a door on a wall with a preview of the space,
 *    initially default of 1 Meter by 0.5 depth. And 1 Meter Hight railing."*
 *
 * So HOSTED is the default mode: hover near a facade, the 1.00 × 0.50 rectangle snaps
 * to it and follows the cursor along it, one click places the compound. The
 * host-resolution logic is `DoorPlanToolHandler`'s, reused rather than re-derived —
 * nearest wall within reach, refuse when none is (C15: a hosted element anchors to a
 * WALL, and §FIX-DOOR-SLAB-HOST L-56 is the bug from hosting on whatever the hit-test
 * returned).
 *
 * ⭐ AND THE SIDE OF THE WALL IS THE CURSOR'S. A wall has two faces and this tool
 * cannot know which is outdoors, so it projects towards the pointer. The residential
 * generator names the alternative as its own spike risk — *"a backwards normal puts
 * the balcony INSIDE the building"* — and answers it with the cell centre. Neither
 * guesses.
 *
 * ─── ⚠ WHY THE HOST CENTRELINE IS PUT IN THE PAYLOAD ───────────────────────────
 * `CreateBalconyHandler` does not read the wall store: `execute()` re-runs on REDO,
 * and a centreline read at redo time is a DIFFERENT value if the wall moved in
 * between, so the balcony would silently change shape on redo. This handler resolves
 * it ONCE, at the gesture, and passes it — CA-2's reasoning applied to geometry
 * rather than to ids. A wall this tool cannot resolve produces a REFUSAL here, never
 * a payload with a missing host that the bus would rail shut.
 */

import { createId } from '@pryzm/schemas';
import type { WallData } from '@pryzm/geometry-wall';
import {
  balconyRectangle,
  resolveFreeEdges,
  type BalconyVertex,
  type HostWallSegment,
} from '@pryzm/geometry-balcony';
import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';
import {
  BALCONY_NUDGE_M,
  getBalconyPlacementConfig,
  resolveActiveBalconyDrawMode,
  setBalconyPlacementConfig,
} from './activeBalconyPlacement';

/** PRYZM purple — the shared preview colour every plan tool draws in. */
const STROKE = '#6600ff';
const FILL_A = 'rgba(102,0,255,0.10)';

/** The minimum vertices any closed outline needs. Not a dimension — a topology fact. */
const MIN_LOOP_VERTS = 3;

/**
 * How far from a wall the cursor may be and still host on it, in metres.
 *
 * ⚠ NOT a balcony dimension — a POINTER REACH, which is why it is here and not in
 * `BALCONY_DIMENSION_DEFAULTS`. It is `DoorPlanToolHandler`'s 1.5 m verbatim, so a
 * balcony and a door snap to the same wall from the same distance and the two tools
 * do not disagree about what "near a wall" means.
 */
const HOST_REACH_M = 1.5;

export class BalconyPlanToolHandler implements PlanToolHandler {
  private _ctx: PlanToolDrawContext | null = null;
  private _cursor: WorldPoint | null = null;
  /** OUTLINE mode only — the vertices drawn so far. */
  private _points: WorldPoint[] = [];
  /** The last refusal, shown on the overlay so it reaches a PERSON, not a console. */
  private _refusal: string | null = null;

  /** §T-B1 — a half-drawn outline survives an excursion to the toolbar. */
  hasActiveStroke(): boolean {
    return this._points.length > 0;
  }

  activate(ctx: PlanToolDrawContext): void {
    this._ctx = ctx;
    this._reset();
  }

  deactivate(): void {
    this._clearOverlay();
    this._reset();
    this._ctx = null;
  }

  // ── Interaction ───────────────────────────────────────────────────────────

  onMouseMove(pt: WorldPoint): void {
    this._cursor = pt;
    this._draw();
  }

  onClick(pt: WorldPoint): void {
    // A new click is a new attempt: clear any refusal still on screen so the user is
    // never told why the LAST gesture failed while making a new one.
    this._refusal = null;
    this._cursor = pt;

    if (resolveActiveBalconyDrawMode() === 'hosted') {
      this._commitHosted(pt);
      return;
    }
    this._points.push(pt);
    this._draw();
  }

  onDoubleClick(_pt: WorldPoint): void {
    if (resolveActiveBalconyDrawMode() !== 'outline') return;
    if (this._points.length >= MIN_LOOP_VERTS) this._commitOutline();
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.cancel();
      return true;
    }
    // ⭐ The size is live and nudgeable DURING placement, and the preview redraws at
    // the new size immediately — so the number the user is choosing is the number
    // they can see, rather than one buried in a panel they must go and find.
    const cfg = getBalconyPlacementConfig();
    if (e.key === '[' || e.key === ']') {
      setBalconyPlacementConfig({
        width: cfg.width + (e.key === ']' ? BALCONY_NUDGE_M : -BALCONY_NUDGE_M),
      });
      this._draw();
      return true;
    }
    if (e.key === '-' || e.key === '=' || e.key === '+') {
      setBalconyPlacementConfig({
        projection: cfg.projection + (e.key === '-' ? -BALCONY_NUDGE_M : BALCONY_NUDGE_M),
      });
      this._draw();
      return true;
    }
    if (
      e.key === 'Enter' &&
      resolveActiveBalconyDrawMode() === 'outline' &&
      this._points.length >= MIN_LOOP_VERTS
    ) {
      e.preventDefault();
      this._commitOutline();
      return true;
    }
    if (e.key === 'Backspace' && this._points.length > 0) {
      this._points.pop();
      this._draw();
      return true;
    }
    return false;
  }

  cancel(): void {
    this._reset();
    this._clearOverlay();
  }

  redraw(): void {
    this._draw();
  }

  // ── Commit ────────────────────────────────────────────────────────────────

  /** HOSTED — one click on a facade places the founder's default balcony. */
  private _commitHosted(pt: WorldPoint): void {
    const c = this._ctx;
    if (!c) return;

    const levelId = c.viewDef.spatial?.levelId;
    if (!levelId) {
      this._refuse('This view has no level, so there is nothing to attach a balcony to.');
      return;
    }

    const host = this._resolveHost(pt);
    if (!host) {
      // ⛔ C16 CA-18 — the refusal names the reason AND the route back to success.
      // Never "silently create nothing", and never host on whatever was under the
      // cursor (§FIX-DOOR-SLAB-HOST, L-56: a slab edge became a door's host).
      this._refuse(
        'A hosted balcony attaches to a wall. Move the pointer within ' +
          `${HOST_REACH_M} m of one, or switch to Outline mode to draw a free-standing balcony.`,
      );
      return;
    }

    const cfg = getBalconyPlacementConfig();
    const datumY = 0;
    const ring = balconyRectangle(
      host.segment,
      host.offset,
      cfg.width,
      cfg.projection,
      { x: pt.worldX, z: pt.worldZ },
      datumY,
    );
    this._dispatch(ring, levelId, host.wallId, host.segment, host.offset, cfg.railingHeight);
  }

  /** OUTLINE — an arbitrary balcony ring; the host is MEASURED from it, not assumed. */
  private _commitOutline(): void {
    const c = this._ctx;
    if (!c || this._points.length < MIN_LOOP_VERTS) return;

    const levelId = c.viewDef.spatial?.levelId;
    if (!levelId) {
      this._refuse('This view has no level, so there is nothing to attach a balcony to.');
      return;
    }

    const ring: BalconyVertex[] = this._points.map((p) => ({ x: p.worldX, y: 0, z: p.worldZ }));
    // ⭐ The host is found the SAME way `resolveFreeEdges` will find it later: the
    // wall an edge of this ring lies along. Asking a different question here from the
    // one the model asks is how a preview and a placement diverge.
    const host = this._resolveHostForRing(ring);
    const cfg = getBalconyPlacementConfig();
    this._dispatch(ring, levelId, host?.wallId, host?.segment, undefined, cfg.railingHeight);
  }

  private _dispatch(
    ring: readonly BalconyVertex[],
    levelId: string,
    hostWallId: string | undefined,
    hostSegment: HostWallSegment | undefined,
    hostOffset: number | undefined,
    railingHeight: number,
  ): void {
    const c = this._ctx;
    if (!c) return;

    // ⭐ CA-2 — ids are minted ONCE, HERE, and passed in. `execute()` runs again on
    // REDO, so minting inside the handler would silently produce a DIFFERENT balcony
    // the second time. The RAILING count is asked of the geometry rather than
    // assumed, because it is a function of the outline and the host — the same
    // question `canExecute` will ask, so the two cannot disagree.
    const freeEdges = resolveFreeEdges(ring, hostSegment);
    const payload = {
      balconyId: createId('balcony'),
      levelId,
      boundary: ring.map((p) => ({ x: p.x, y: p.y, z: p.z })),
      ...(hostWallId !== undefined ? { hostWallId } : {}),
      ...(hostOffset !== undefined ? { hostOffset } : {}),
      ...(hostSegment !== undefined ? { hostSegment } : {}),
      slabId: createId('slab'),
      floorId: createId('floor'),
      railingIds: freeEdges.map(() => createId('handrail')),
      railingHeight,
    };

    // ONE dispatch = ONE undo entry across all four stores (C16 §8.6 B-6). Nothing is
    // batched here, and no child command is dispatched.
    const dispatch =
      c.runtime?.bus?.executeCommand('balcony.create', payload) ??
      window.runtime?.bus?.executeCommand('balcony.create', payload);

    if (!dispatch) {
      this._refuse('The command bus is not available, so no balcony was created.');
      return;
    }

    void Promise.resolve(dispatch).catch((e: unknown) => {
      // ⭐ SURFACE THE BUS'S OWN REASON, VERBATIM. `canExecute` rejections arrive as
      // `CommandBusError: balcony.create: canExecute rejected — <why>`, and that
      // `<why>` is the most accurate sentence available (degenerate outline,
      // unresolved host, stale rail count). Swallowing it here is exactly the
      // "reported activation, activated nothing" defect this lane exists to avoid.
      const why = e instanceof Error ? e.message : String(e);
      console.error('[BalconyPlanToolHandler] balcony.create failed:', why);
      this._refuse(why);
    });

    this._reset();
    this._clearOverlay();
  }

  // ── Host resolution ───────────────────────────────────────────────────────

  /** The wall under/near the cursor, its centreline, and the balcony's left-edge
   *  offset along it. `null` when no wall is within reach. */
  private _resolveHost(
    pt: WorldPoint,
  ): { wallId: string; segment: HostWallSegment; offset: number } | null {
    const near = this._nearestWall(pt.worldX, pt.worldZ, HOST_REACH_M);
    if (!near) return null;

    const { wall, segment } = near;
    const len = Math.hypot(segment.b.x - segment.a.x, segment.b.z - segment.a.z);
    if (len < 1e-6) return null;

    const cfg = getBalconyPlacementConfig();
    // The cursor projects to the balcony's CENTRE; the payload carries its LEFT EDGE
    // (§OPENING-OFFSET-LEFTEDGE-UNIFY — the convention doors and windows already use,
    // adopted so a balcony and a door on the same wall measure the same way). The
    // span is clamped inside the wall so a balcony never overhangs its own host.
    const t =
      ((pt.worldX - segment.a.x) * (segment.b.x - segment.a.x) +
        (pt.worldZ - segment.a.z) * (segment.b.z - segment.a.z)) /
      (len * len);
    const centre = Math.max(0, Math.min(1, t)) * len;
    const offset = Math.max(0, Math.min(Math.max(len - cfg.width, 0), centre - cfg.width / 2));
    return { wallId: wall.id, segment, offset };
  }

  /** The wall a drawn ring lies against, if any — measured edge by edge. */
  private _resolveHostForRing(
    ring: readonly BalconyVertex[],
  ): { wallId: string; segment: HostWallSegment } | null {
    let best: { wallId: string; segment: HostWallSegment; free: number } | null = null;
    for (const cand of this._candidateWalls()) {
      const free = resolveFreeEdges(ring, cand.segment).length;
      // A wall is this ring's host when it removes at least one edge from the free
      // set. The BEST host is the one that removes the most — an L-shaped balcony in
      // a corner may lie against two walls, and the one it shares most edge with is
      // the facade it belongs to.
      if (free < ring.length && (best === null || free < best.free)) {
        best = { wallId: cand.wall.id, segment: cand.segment, free };
      }
    }
    return best ? { wallId: best.wallId, segment: best.segment } : null;
  }

  /**
   * Nearest wall to a plan point within `maxDistM`.
   *
   * This is `DoorPlanToolHandler._findNearestWallId`'s point-to-segment search,
   * REUSED rather than re-derived, and it iterates WALLS only — never a raw hit-test
   * id, which is how a slab edge once became a door's host (§FIX-DOOR-SLAB-HOST,
   * L-56). A balcony that hosted on a slab edge would be worse: it would name a
   * `hostWallId` the bus could not resolve and be refused several steps later.
   */
  private _nearestWall(
    worldX: number,
    worldZ: number,
    maxDistM: number,
  ): { wall: WallData; segment: HostWallSegment } | null {
    let best: { wall: WallData; segment: HostWallSegment } | null = null;
    let bestDist = maxDistM;
    for (const cand of this._candidateWalls()) {
      const { a, b } = cand.segment;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const lenSq = dx * dx + dz * dz;
      let dist: number;
      if (lenSq < 1e-10) {
        dist = Math.hypot(worldX - a.x, worldZ - a.z);
      } else {
        const t = Math.max(
          0,
          Math.min(1, ((worldX - a.x) * dx + (worldZ - a.z) * dz) / lenSq),
        );
        dist = Math.hypot(worldX - (a.x + t * dx), worldZ - (a.z + t * dz));
      }
      if (dist < bestDist) {
        bestDist = dist;
        best = cand;
      }
    }
    return best;
  }

  /** Every wall on the active level, with its centreline as a plan segment. */
  private _candidateWalls(): ReadonlyArray<{ wall: WallData; segment: HostWallSegment }> {
    const c = this._ctx;
    const ws = c?.wallStore;
    if (!ws?.getAll) return [];
    const levelId = c?.viewDef.spatial?.levelId;
    const out: Array<{ wall: WallData; segment: HostWallSegment }> = [];
    for (const wall of ws.getAll() as WallData[]) {
      if (levelId && wall.levelId !== levelId) continue;
      const bl = wall.baseLine;
      if (!bl || bl.length < 2) continue;
      out.push({
        wall,
        segment: { a: { x: bl[0].x, z: bl[0].z }, b: { x: bl[1].x, z: bl[1].z } },
      });
    }
    return out;
  }

  // ── Preview ───────────────────────────────────────────────────────────────

  private _draw(): void {
    const c = this._ctx;
    if (!c) return;
    const { ctx, overlayCanvas, planCanvas, dpr } = c;
    const mode = resolveActiveBalconyDrawMode();
    const cfg = getBalconyPlacementConfig();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cssW = overlayCanvas.width / dpr;
    const cssH = overlayCanvas.height / dpr;
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.save();

    if (this._refusal) {
      this._drawHint(ctx, cssH, this._refusal);
      ctx.restore();
      return;
    }

    if (mode === 'hosted') {
      const pt = this._cursor;
      if (!pt) {
        this._drawHint(ctx, cssH, this._hostedHint(null));
        ctx.restore();
        return;
      }
      const host = this._resolveHost(pt);
      if (host) {
        // ⭐ THE PREVIEW IS BUILT BY THE FUNCTION THE COMMIT USES. Not "a rectangle
        // the same size" — the same ring, from the same arguments. That is what makes
        // "the preview of the space" honest rather than approximate.
        const ring = balconyRectangle(
          host.segment,
          host.offset,
          cfg.width,
          cfg.projection,
          { x: pt.worldX, z: pt.worldZ },
        );
        const pts = ring.map((v) => planCanvas.worldToScreen(v.x, v.z));
        this._fillPath(ctx, pts);
        this._strokePath(ctx, pts, true);
        // The RAILING preview: every free edge, solid, so the user can see BEFORE
        // clicking which side stays open as the access from the room.
        const free = resolveFreeEdges(ring, host.segment);
        ctx.lineWidth = 3;
        ctx.strokeStyle = STROKE;
        for (const e of free) {
          const a = planCanvas.worldToScreen(e.a.x, e.a.z);
          const b = planCanvas.worldToScreen(e.b.x, e.b.z);
          ctx.beginPath();
          ctx.moveTo(a.sx, a.sy);
          ctx.lineTo(b.sx, b.sy);
          ctx.stroke();
        }
      }
      this._drawHint(ctx, cssH, this._hostedHint(host));
      ctx.restore();
      return;
    }

    // OUTLINE — the accumulating ring plus the rubber-band edge.
    const screenPts = this._points.map((p) => planCanvas.worldToScreen(p.worldX, p.worldZ));
    const trailing = this._cursor
      ? [planCanvas.worldToScreen(this._cursor.worldX, this._cursor.worldZ)]
      : [];
    if (screenPts.length >= MIN_LOOP_VERTS) this._fillPath(ctx, [...screenPts, ...trailing]);
    this._strokePath(ctx, [...screenPts, ...trailing], false);
    ctx.fillStyle = STROKE;
    for (const p of screenPts) {
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    const missing = MIN_LOOP_VERTS - this._points.length;
    this._drawHint(
      ctx,
      cssH,
      this._points.length >= MIN_LOOP_VERTS
        ? 'Outline · Dbl-click or Enter to close the balcony · Backspace to undo a point'
        : `Outline · ${missing} more point${missing !== 1 ? 's' : ''} needed`,
    );
    ctx.restore();
  }

  private _hostedHint(host: { wallId: string } | null): string {
    const cfg = getBalconyPlacementConfig();
    const size = `${cfg.width.toFixed(2)} × ${cfg.projection.toFixed(2)} m · rail ${cfg.railingHeight.toFixed(2)} m`;
    return host
      ? `Hosted · ${size} · click to place · [ ] width · − = depth`
      : `Hosted · ${size} · move within ${HOST_REACH_M} m of a wall · [ ] width · − = depth`;
  }

  private _fillPath(
    ctx: CanvasRenderingContext2D,
    pts: ReadonlyArray<{ sx: number; sy: number }>,
  ): void {
    if (pts.length < MIN_LOOP_VERTS) return;
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = FILL_A;
    ctx.beginPath();
    ctx.moveTo(pts[0]!.sx, pts[0]!.sy);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.sx, pts[i]!.sy);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private _strokePath(
    ctx: CanvasRenderingContext2D,
    pts: ReadonlyArray<{ sx: number; sy: number }>,
    close: boolean,
  ): void {
    if (pts.length === 0) return;
    ctx.setLineDash([6, 3]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = STROKE;
    ctx.beginPath();
    ctx.moveTo(pts[0]!.sx, pts[0]!.sy);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.sx, pts[i]!.sy);
    if (close) ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private _drawHint(ctx: CanvasRenderingContext2D, cssH: number, text: string): void {
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = 'rgba(102,0,255,0.9)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(text, 12, cssH - 12);
  }

  /**
   * Record a refusal AND put it on the overlay.
   *
   * ⭐ A `console.warn` is not a refusal — it is a refusal nobody reads. The founder's
   * "Create Stair" report was exactly this shape: the tool reported success and did
   * nothing. Every path that declines to create a balcony comes through here, so the
   * user always learns why.
   */
  private _refuse(message: string): void {
    this._refusal = message;
    this._points = [];
    this._draw();
  }

  private _reset(): void {
    this._points = [];
    this._cursor = null;
    this._refusal = null;
  }

  private _clearOverlay(): void {
    const c = this._ctx;
    if (!c) return;
    c.ctx.setTransform(1, 0, 0, 1, 0, 0);
    c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
  }
}
