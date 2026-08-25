/**
 * LiftPlanToolHandler — §FIX-LIFT-UNREACHABLE (L-7020..L-7024) · C104 · ADR-0325 · C11.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THE FOUNDER: *"Lift — it should be under Architecture, but could not see it!"*
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ⛔ C01 §6 RULE 6 — ABSENT AND UNREACHABLE HAVE OPPOSITE FIXES, SO THE VERDICT COMES
 * FIRST AND IT IS THREE DIFFERENT ANSWERS ON THREE DIFFERENT SURFACES. Measured
 * 2026-08-22, before a line of this file existed:
 *
 *   1. `CreateRailPanel.ts`  — `rg -n "lift" apps/editor/src/ui/tools-panel/panels/
 *      CreateRailPanel.ts` -> **0 hits**. On the create RAIL the lift was **ABSENT**.
 *      Not disabled, not mislabelled, not in the wrong section: not there at all.
 *   2. `CreatePanelLayout.ts:300` — a row existed, under **Structure**, not
 *      Architecture. So on THAT surface the lift was **UNREACHABLE-BY-SEARCH**: a
 *      person looking under Architecture, as the founder was, could not find it.
 *   3. And the row that did exist called `props.toolManager.activateLift?.()`, which
 *      drives the LEGACY MASSING command `CreateVerticalCirculationCommand` — **NOT**
 *      `lift.create`. `PluginRegistry.ts:465` already records this in as many words:
 *      *"BOTH DRIVE THE LEGACY MASSING COMMAND … So the tool key is armed and the
 *      COMPOUND is still not dispatchable from the UI."* (L-5709.)
 *
 * This is the L-1380 defect — two live create surfaces, a row added to one — plus the
 * pool's axis 3, which `elementCreationMatrix` had already named as the highest-value
 * open hole in the whole matrix: *"A lift is a placed footprint like a column — plan is
 * the NATURAL surface for it. This is the clearest violation of the founder's principle
 * in the matrix and the highest-value next fix."* This file is that fix.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THIS FILE CONTAINS NO LIFT GEOMETRY AND NOT ONE DIMENSIONAL LITERAL.
 * ═══════════════════════════════════════════════════════════════════════════════
 * It resolves an ORIGIN, a HOST and a SET OF SERVED LEVELS, draws the shaft footprint
 * as a PREVIEW, and dispatches ONE command. The shaft, its four enclosure sides, one
 * landing door per served level, the five cabin parts and the slab voids are all built
 * by `@pryzm/geometry-lift`, which is pure and already tested. The preview rectangle is
 * derived from `resolveLiftDimensions()` — the same resolver `buildLiftAssembly` uses —
 * so what the architect aims at cannot diverge from what lands (§FIX-DOOR-PREVIEW-EXACT,
 * L-127, applied at authoring time rather than retrofitted).
 *
 * ─── THE STOREY QUESTION, ANSWERED ONCE, IN THE PAYLOAD ────────────────────────
 * `CreateLiftHandler.canExecute` refuses an empty `servedLevels` — *"the storey question
 * has no valid empty answer"* — and creates ONE landing door per entry. A plan tool
 * cannot ask a modal per click, so the rule is stated here and stated in the hint the
 * user reads BEFORE clicking: **the lift serves the active level and every level above
 * it**. That is the residential default (a lift that stops short of the top storey is
 * the unusual case, not the common one) and it is visible on the overlay, so nobody
 * discovers it after the fact.
 *
 * ⚠ A LEVEL WHOSE SLAB CANNOT BE RESOLVED GETS `slabId: undefined`, NOT A GUESS.
 * `ServedLevel.slabId` is documented as *"`undefined` means 'no slab here' — a
 * legitimate state (the lowest served level often sits on grade), NOT an error, and NOT
 * silently a hole"*, and `canExecute` REFUSES a `slabId` that names a slab the store
 * does not have. Naming a slab we are unsure of would turn a missing void into a
 * refused command several steps later; omitting it is the honest answer and the
 * assembly simply punches no void at that level.
 *
 * ─── WHICH ENCLOSURE? THE CURSOR DECIDES, AND IT SAYS SO ───────────────────────
 * `LiftEnclosureType` is `'wall-hosted' | 'standalone-glass'`, and the wall-hosted type
 * REQUIRES a `hostWallId` the schema will not do without. So: a wall within reach ⇒
 * wall-hosted against it; open floor ⇒ standalone glass. Both are real types with real
 * geometry behind them, neither is a fallback for the other, and the hint names which
 * one the next click will place. ⛔ There is deliberately no mode strip: offering a
 * "wall-hosted" pill with no wall under the cursor would be a control that reports a
 * capability the payload cannot carry — C84 EI-3, the defect the pool's shape strip was
 * built to avoid.
 */

import { createId } from '@pryzm/schemas';
import type { WallData } from '@pryzm/geometry-wall';
import {
  LIFT_PART_CYCLE_ORDER,
  ENCLOSURE_SIDE_COUNT,
  resolveLiftDimensions,
  type LiftEnclosureType,
  type ServedLevel,
} from '@pryzm/geometry-lift';
import { pointInPolygonXZ } from '@pryzm/geometry-kernel';
import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';

/** PRYZM purple — the shared preview colour every plan tool draws in. */
const STROKE = '#6600ff';
const FILL_A = 'rgba(102,0,255,0.10)';

/** The minimum vertices any closed outline needs. Not a dimension — a topology fact. */
const MIN_LOOP_VERTS = 3;

/**
 * §LIFT94 (L-11344) — the four faces a rectangular shaft's landing can be on.
 * A topology fact about a rectangle, not a lift dimension, so it is not in
 * `LIFT_DIMENSION_DEFAULTS` either.
 */
const QUARTER_TURNS = 4;

/** The four compass-ish labels the hint names, indexed by quarter-turn. */
const LANDING_FACE_LABELS = ['front', 'right', 'back', 'left'] as const;

/**
 * How far from a wall the cursor may be and still host the shaft on it, in metres.
 *
 * ⚠ NOT a lift dimension — a POINTER REACH, which is why it is here and not in
 * `LIFT_DIMENSION_DEFAULTS`. It is `BalconyPlanToolHandler`'s and
 * `DoorPlanToolHandler`'s 1.5 m verbatim, so every hosted element in this repo agrees
 * about what "near a wall" means rather than each deciding for itself.
 */
const HOST_REACH_M = 1.5;

/** A plan segment, as the wall store yields it. */
interface PlanSegment {
  readonly a: { x: number; z: number };
  readonly b: { x: number; z: number };
}

/** A storey, as `bimManager.getLevels()` / `wallStore.getLevels()` return them. */
interface LevelRecord {
  readonly id: string;
  readonly elevation?: number;
}

/** A slab record as this handler needs to read it — deliberately the narrowest shape. */
interface SlabCandidate {
  readonly id: string;
  readonly levelId?: string;
  readonly boundary?: ReadonlyArray<{ x: number; z: number }>;
}

export class LiftPlanToolHandler implements PlanToolHandler {
  private _ctx: PlanToolDrawContext | null = null;
  private _cursor: WorldPoint | null = null;
  /** The last refusal, shown on the overlay so it reaches a PERSON, not a console. */
  private _refusal: string | null = null;
  /**
   * §LIFT94 (L-11344) — QUARTER-TURNS THE USER HAS ADDED WITH SPACE, 0..3.
   *
   * THE FOUNDER: *"i can not click 'space' on preview to change the location of the
   * door"*. Measured 2026-08-25: `onKeyDown` existed and handled `Escape` and nothing
   * else, so SPACE fell through to the page. The handler was not missing — the key was
   * UNBOUND. `DoorPlanToolHandler.ts:77` (§FEAT-DOOR-FLIP-ON-SPACE) is the precedent
   * and this mirrors it exactly, including returning `true` so the overlay
   * preventDefaults and the page never scrolls.
   *
   * ⭐ FOR A LIFT, "WHERE THE DOOR IS" **IS** THE ROTATION. `LiftCompound.rotation` is
   * documented as *"Plan angle (radians about world Y). Local -Z is the LANDING side"*
   * — so the landing side and the shaft's plan angle are one number, not two. A
   * quarter-turn moves the landing to the next face, which is precisely the founder's
   * "change the location of the door", and it is also the only user control over
   * `rotation` that exists at all (the value was otherwise derived from the host wall
   * and never adjustable — L-11345).
   *
   * ⚠ STICKY ACROSS PLACEMENTS, RESET ON ESCAPE. Placing a bank of lifts that all face
   * the same corridor should not mean re-pressing SPACE for each one; Escape means
   * "start over" and clears it.
   */
  private _landingQuarterTurns = 0;

  activate(ctx: PlanToolDrawContext): void {
    this._ctx = ctx;
    this._reset();
    this._landingQuarterTurns = 0;
  }

  deactivate(): void {
    this._clearOverlay();
    this._reset();
    this._landingQuarterTurns = 0;
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
    this._commit(pt);
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.cancel();
      return true;
    }
    // §LIFT94 (L-11344) — SPACE turns the shaft a quarter-turn, moving the LANDING
    // SIDE (and therefore the landing doors) to the next face. Three spellings are
    // tested because `DoorPlanToolHandler` tests three: `e.code` is the reliable one,
    // `' '` is the modern `e.key`, and `'Spacebar'` is legacy Edge. Returning `true`
    // tells `PlanViewToolOverlay._onKeyDown` to preventDefault/stopPropagation, so the
    // page never scrolls and no other SPACE shortcut fires.
    if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
      this._landingQuarterTurns = (this._landingQuarterTurns + 1) % QUARTER_TURNS;
      this._draw();
      return true;
    }
    return false;
  }

  cancel(): void {
    this._reset();
    this._landingQuarterTurns = 0;
    this._clearOverlay();
  }

  redraw(): void {
    this._draw();
  }

  // ── Commit ────────────────────────────────────────────────────────────────

  private _commit(pt: WorldPoint): void {
    const c = this._ctx;
    if (!c) return;

    const levelId = c.viewDef.spatial?.levelId;
    if (!levelId) {
      this._refuse('This view has no level, so there is no storey to anchor a lift on.');
      return;
    }

    const served = this._resolveServedLevels(levelId, pt);
    if (served.length === 0) {
      // ⛔ C16 CA-18 — the refusal names the reason AND the route back to success.
      // `canExecute` would reject this too ("a lift must serve at least one level"),
      // but a refusal the user reads at the gesture beats one they read in a console.
      this._refuse(
        'A lift must serve at least one storey, and this project has no level this ' +
          'view can resolve. Add a level, then place the lift again.',
      );
      return;
    }

    const host = this._resolveHost(pt);
    const enclosureType: LiftEnclosureType = host ? 'wall-hosted' : 'standalone-glass';

    // ⭐ CA-2 — ids are minted ONCE, HERE, and passed in. `execute()` runs again on
    // REDO, so minting inside the handler would silently produce a DIFFERENT lift the
    // second time. The COUNTS are asked of the geometry package rather than typed as
    // literals: `canExecute` compares them against `ENCLOSURE_SIDE_COUNT`,
    // `servedLevels.length` and `LIFT_PART_CYCLE_ORDER.length`, so a hand-typed 4 or 5
    // here would be a second statement of a number the handler already owns.
    const payload = {
      liftId: createId('lift'),
      levelId,
      enclosureType,
      ...(host ? { hostWallId: host.wallId } : {}),
      origin: { x: pt.worldX, y: 0, z: pt.worldZ },
      rotation: this._angleFor(host),
      servedLevels: served,
      enclosureIds: Array.from({ length: ENCLOSURE_SIDE_COUNT }, () => createId('wall')),
      landingDoorIds: served.map(() => createId('door')),
      cabinPartIds: LIFT_PART_CYCLE_ORDER.map(() => createId('liftPart')),
    };

    // ONE dispatch = ONE undo entry across all SIX stores (C16 §8.6 B-6). The handler
    // uses `produceMultiStoreCommand`; nothing is batched here, and no child command is
    // dispatched. A lift serving ten storeys creates nineteen records and punches ten
    // slabs — at one undo entry per part that would be twenty-nine Ctrl+Zs to take back
    // one click, which is the argument `CreateLift.ts` opens with.
    const dispatch =
      c.runtime?.bus?.executeCommand('lift.create', payload) ??
      window.runtime?.bus?.executeCommand('lift.create', payload);

    if (!dispatch) {
      this._refuse('The command bus is not available, so no lift was created.');
      return;
    }

    void Promise.resolve(dispatch).catch((e: unknown) => {
      // ⭐ SURFACE THE BUS'S OWN REASON, VERBATIM. `canExecute` rejections arrive as
      // `CommandBusError: lift.create: canExecute rejected — <why>`, and that `<why>`
      // is the most accurate sentence available (duplicate storey, host wall not found,
      // a served level naming a slab that does not exist). Swallowing it here is exactly
      // the "reported activation, activated nothing" defect this lane exists to avoid.
      const why = e instanceof Error ? e.message : String(e);
      console.error('[LiftPlanToolHandler] lift.create failed:', why);
      this._refuse(why);
    });

    this._reset();
    this._clearOverlay();
  }

  // ── Resolution ────────────────────────────────────────────────────────────

  /**
   * The storeys this lift serves: the active level and every level ABOVE it, each with
   * the slab (if any) the shaft passes through at that elevation.
   *
   * ⚠ Levels with a non-finite elevation are DROPPED rather than defaulted to 0.
   * `canExecute` refuses a non-finite elevation by name, and a level silently treated
   * as ground would stack a second landing door on the base storey — invisible,
   * because it would be exactly coincident with the first.
   */
  private _resolveServedLevels(baseLevelId: string, at: WorldPoint): ServedLevel[] {
    const levels = this._levels();
    const base = levels.find((l) => l.id === baseLevelId);
    if (!base) {
      // The view names a level the level store does not have. Serve exactly that one
      // level at elevation 0 rather than inventing a stack — one storey is a valid
      // lift, and `canExecute` will tell us if the id itself is wrong.
      return [{ levelId: baseLevelId, elevation: 0, ...this._slabAt(baseLevelId, at) }];
    }
    const baseElev = Number.isFinite(base.elevation) ? (base.elevation as number) : 0;
    const seen = new Set<string>();
    return levels
      .filter((l) => {
        if (seen.has(l.id)) return false; // a duplicate storey is refused by canExecute
        if (l.id !== baseLevelId && !Number.isFinite(l.elevation)) return false;
        const e = l.id === baseLevelId ? baseElev : (l.elevation as number);
        if (e < baseElev) return false;
        seen.add(l.id);
        return true;
      })
      .sort((p, q) => (p.elevation ?? 0) - (q.elevation ?? 0))
      .map((l) => ({
        levelId: l.id,
        elevation: l.id === baseLevelId ? baseElev : (l.elevation as number),
        ...this._slabAt(l.id, at),
      }));
  }

  /**
   * The slab on `levelId` whose boundary contains the shaft origin, as a spreadable
   * fragment. Returns `{}` — NOT `{ slabId: undefined }` — when there is none, so the
   * key is absent from the payload rather than present-and-undefined.
   */
  private _slabAt(levelId: string, at: WorldPoint): { slabId?: string } {
    for (const slab of this._candidateSlabs()) {
      if (slab.levelId !== undefined && slab.levelId !== levelId) continue;
      const ring = slab.boundary;
      if (!ring || ring.length < MIN_LOOP_VERTS) continue;
      if (pointInPolygonXZ(at.worldX, at.worldZ, ring)) return { slabId: slab.id };
    }
    return {};
  }

  /**
   * Every slab this handler can see, preferring the PLUGIN DTO store because that is
   * the store `CreateLiftHandler.canExecute` reads. `PoolPlanToolHandler` carries the
   * identical reader for the identical reason (the detached-DTO-mirror condition,
   * L-5215): naming a slab that exists only in the legacy store would produce a payload
   * the bus then refuses.
   */
  private _candidateSlabs(): readonly SlabCandidate[] {
    const out: SlabCandidate[] = [];
    const pluginSlabs = (
      window as unknown as {
        runtime?: { stores?: Record<string, { getState?: () => Map<string, unknown> }> };
      }
    ).runtime?.stores?.['slab'];
    const state = pluginSlabs?.getState?.();
    if (state) {
      for (const [id, rec] of state) {
        const r = rec as { levelId?: string; boundary?: { x: number; z: number }[] };
        out.push({ id, levelId: r.levelId, boundary: r.boundary });
      }
    }
    if (out.length > 0) return out;

    const legacy = window.slabStore as unknown as { getAll?: () => unknown[] } | undefined; // TODO(TASK-08)
    for (const rec of legacy?.getAll?.() ?? []) {
      const r = rec as { id?: string; levelId?: string; boundary?: { x: number; z: number }[] };
      if (r?.id) out.push({ id: r.id, levelId: r.levelId, boundary: r.boundary });
    }
    return out;
  }

  /** Every storey in the project, from the same readers the stair path tool uses. */
  private _levels(): readonly LevelRecord[] {
    const fromWallStore = (
      this._ctx?.wallStore as unknown as { getLevels?: () => LevelRecord[] } | undefined
    )?.getLevels?.();
    if (fromWallStore && fromWallStore.length > 0) return fromWallStore;
    // ADR-0327: `window.levelStore` is a phantom that is never assigned — the
    // secondary is `bimManager`, which is what every other plan handler reads.
    return window.bimManager?.getLevels?.() ?? [];
  }

  /** The wall under/near the cursor, or `null` when none is within reach. */
  private _resolveHost(pt: WorldPoint): { wallId: string; segment: PlanSegment } | null {
    let best: { wallId: string; segment: PlanSegment } | null = null;
    let bestDist = HOST_REACH_M;
    for (const cand of this._candidateWalls()) {
      const { a, b } = cand.segment;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const lenSq = dx * dx + dz * dz;
      let dist: number;
      if (lenSq < 1e-10) {
        dist = Math.hypot(pt.worldX - a.x, pt.worldZ - a.z);
      } else {
        const t = Math.max(0, Math.min(1, ((pt.worldX - a.x) * dx + (pt.worldZ - a.z) * dz) / lenSq));
        dist = Math.hypot(pt.worldX - (a.x + t * dx), pt.worldZ - (a.z + t * dz));
      }
      if (dist < bestDist) {
        bestDist = dist;
        best = cand;
      }
    }
    return best;
  }

  /**
   * Every wall on the active level, with its centreline as a plan segment.
   *
   * It iterates WALLS only — never a raw hit-test id — which is how a slab edge once
   * became a door's host (§FIX-DOOR-SLAB-HOST, L-56). A lift hosted on a slab edge
   * would name a `hostWallId` `canExecute` cannot resolve and be refused several steps
   * later, with the user having no idea which of their clicks caused it.
   */
  private _candidateWalls(): ReadonlyArray<{ wallId: string; segment: PlanSegment }> {
    const c = this._ctx;
    const ws = c?.wallStore;
    if (!ws?.getAll) return [];
    const levelId = c?.viewDef.spatial?.levelId;
    const out: Array<{ wallId: string; segment: PlanSegment }> = [];
    for (const wall of ws.getAll() as WallData[]) {
      if (levelId && wall.levelId !== levelId) continue;
      const bl = wall.baseLine;
      if (!bl || bl.length < 2) continue;
      out.push({
        wallId: wall.id,
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

    const pt = this._cursor;
    if (!pt) {
      this._drawHint(ctx, cssH, 'Lift · move the pointer over the plan to place the shaft');
      ctx.restore();
      return;
    }

    const host = this._resolveHost(pt);
    // ⭐ THE FOOTPRINT COMES FROM THE SAME RESOLVER THE ASSEMBLY USES. Not "a rectangle
    // about the right size" — `resolveLiftDimensions({})` is exactly what
    // `buildLiftAssembly` calls when the payload carries no overrides, which is what
    // this tool dispatches.
    const dims = resolveLiftDimensions({});
    const angle = this._angleFor(host);
    const ring = LiftPlanToolHandler._footprint(
      pt.worldX,
      pt.worldZ,
      dims.shaftWidth,
      dims.shaftDepth,
      angle,
    );
    const pts = ring.map((v) => planCanvas.worldToScreen(v.x, v.z));
    this._fillPath(ctx, pts);
    this._strokePath(ctx, pts);

    // §LIFT94 (L-11344) — DRAW THE LANDING SIDE, HEAVILY.
    //
    // ⭐ WITHOUT THIS, THE FIX WOULD LOOK IDENTICAL TO THE BUG. The shaft footprint is
    // very nearly square, so turning it a quarter-turn moves the outline by a few
    // pixels and the founder would press SPACE and see, again, nothing happen. The
    // landing edge is what actually moves, so the landing edge is what must be drawn.
    //
    // `_footprint` emits its corners in local order [(-hw,-hd), (hw,-hd), (hw,hd),
    // (-hw,hd)], so edge 0→1 is the local -Z face — and `LiftCompound.rotation`'s own
    // doc says *"Local -Z is the LANDING side"*. Reading the edge off the same array
    // the outline is drawn from means the marker cannot drift from the shape.
    this._strokeLandingEdge(ctx, pts[0]!, pts[1]!);

    const levelId = c.viewDef.spatial?.levelId;
    const storeys = levelId ? this._resolveServedLevels(levelId, pt).length : 0;
    this._drawHint(
      ctx,
      cssH,
      `Lift · ${host ? 'wall-hosted' : 'standalone glass'} · ` +
        `${dims.shaftWidth.toFixed(2)} × ${dims.shaftDepth.toFixed(2)} m · ` +
        `serves ${storeys} storey${storeys === 1 ? '' : 's'} from this level up · ` +
        // §LIFT94 (L-11344) — the key is NAMED on the overlay. A placement modifier
        // nobody is told about is, from the user's side, indistinguishable from one
        // that does not exist — which is exactly how this one was reported.
        `SPACE: doors on the ${LANDING_FACE_LABELS[this._landingQuarterTurns]} face · click to place`,
    );
    ctx.restore();
  }

  /** The shaft footprint as a closed world-XZ ring, centred on the cursor. */
  private static _footprint(
    cx: number,
    cz: number,
    width: number,
    depth: number,
    angle: number,
  ): ReadonlyArray<{ x: number; z: number }> {
    const hw = width / 2;
    const hd = depth / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ].map(([u, v]) => ({ x: cx + u! * cos - v! * sin, z: cz + u! * sin + v! * cos }));
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

  /**
   * The LANDING edge of the shaft — the face the doors open onto — drawn as a thick
   * solid bar over the thin outline, so a quarter-turn is unmistakable on a footprint
   * that is nearly square.
   */
  private _strokeLandingEdge(
    ctx: CanvasRenderingContext2D,
    a: { sx: number; sy: number },
    b: { sx: number; sy: number },
  ): void {
    ctx.save();
    ctx.strokeStyle = STROKE;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
    ctx.restore();
  }

  private _strokePath(
    ctx: CanvasRenderingContext2D,
    pts: ReadonlyArray<{ sx: number; sy: number }>,
  ): void {
    if (pts.length === 0) return;
    ctx.setLineDash([6, 3]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = STROKE;
    ctx.beginPath();
    ctx.moveTo(pts[0]!.sx, pts[0]!.sy);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.sx, pts[i]!.sy);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    // The DIAGONAL — the drafting convention for a lift shaft in plan, and the thing
    // that distinguishes this rectangle from a column or a duct at a glance.
    if (pts.length >= 4) {
      ctx.beginPath();
      ctx.moveTo(pts[0]!.sx, pts[0]!.sy);
      ctx.lineTo(pts[2]!.sx, pts[2]!.sy);
      ctx.moveTo(pts[1]!.sx, pts[1]!.sy);
      ctx.lineTo(pts[3]!.sx, pts[3]!.sy);
      ctx.stroke();
    }
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
   * nothing. Every path that declines to create a lift comes through here, so the user
   * always learns why.
   */
  private _refuse(message: string): void {
    this._refusal = message;
    this._draw();
  }

  private _reset(): void {
    this._cursor = null;
    this._refusal = null;
    // ⛔ §LIFT94 (L-11344) — `_landingQuarterTurns` is DELIBERATELY NOT CLEARED HERE.
    // `_commit` calls `_reset()` after every successful placement, so clearing it here
    // would silently un-stick the landing side: a user placing a bank of four lifts
    // onto one corridor would have to press SPACE again for each, and the second lift
    // would face a different way than the preview they had just been looking at.
    // Escape and tool-switch clear it explicitly, in `cancel()` and `deactivate()` —
    // "start over" and "put the tool down" mean start over; "that one landed" does not.
  }

  /**
   * §LIFT94 (L-11344/L-11345) — THE ONE PLACE THE SHAFT'S PLAN ANGLE IS DECIDED.
   *
   * ⚠ THIS EXISTS BECAUSE THE ANGLE WAS COMPUTED TWICE. `_commit` and `_draw` each
   * carried their own copy of `Math.atan2(host.segment.b.z - host.segment.a.z, …)`.
   * Two copies of one number is how a preview comes to show something the commit does
   * not build (C84 EI-1), and adding the user's quarter-turn to only one of them would
   * have produced exactly that: SPACE would rotate the purple rectangle and place an
   * unrotated lift. One method, both callers.
   *
   * The host wall's bearing is the BASE angle — a wall-hosted lift faces the way its
   * wall runs — and the user's SPACE turns are added on top of it.
   */
  private _angleFor(host: { segment: PlanSegment } | null): number {
    const base = host
      ? Math.atan2(host.segment.b.z - host.segment.a.z, host.segment.b.x - host.segment.a.x)
      : 0;
    return base + this._landingQuarterTurns * (Math.PI / 2);
  }

  private _clearOverlay(): void {
    const c = this._ctx;
    if (!c) return;
    c.ctx.setTransform(1, 0, 0, 1, 0, 0);
    c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
  }
}
