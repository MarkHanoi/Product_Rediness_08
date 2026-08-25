/**
 * §LEVEL-HEIGHT-IS-THE-PLAN-RANGE — L-11040 (lane LEVELHEIGHT61).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FOUNDER'S BUG (2026-08-24)
 * ─────────────────────────────────────────────────────────────────────────────
 *   *"why the level 4 height changes is not recognise and goes to 3 meters?"*
 *
 * He set Ground's floor-to-floor height to **4.00 m** in Levels & Grids. The
 * panel showed 4.00 m. The model went on behaving as 3 m.
 *
 * MEASURED ANSWER — **the command was never the problem.**
 * `packages/command-registry/__tests__/setLevelHeightCascade.test.ts` is 21/21
 * GREEN and was green before this lane touched anything: `SetLevelHeightCommand`
 * writes the height and translates the stack above exactly as ADR-0345 says.
 *
 * The defect is that `level.height` HAD NO CONSUMER on the path that draws the
 * plan. `EdgeProjectorService.resolveClipRange()` computed the plan window as
 *
 *     near = level.elevation + (spatial.viewRange?.nearOffset ?? 1.2)
 *     far  = level.elevation + (spatial.viewRange?.farOffset  ?? 3.0)   ← CONSTANT
 *
 * and **no plan-view producer in this repo writes `spatial.viewRange`** — not
 * `CreatePlanViewCommand`, not `DefaultViewsManager`. `roomInteriorElevations`
 * writes it, and that is an ELEVATION. So on every floor plan, at every storey
 * height, for ever, the far plane was the literal 3.0.
 *
 * His console is the arithmetic, verbatim:
 *     [EdgeProjectorService] resolveClipRange() levelId=L1787650161440 elevation=3.000
 *     [EdgeProjectorService] project() … near=4.200 far=6.000
 * 3.000 + 1.2 and 3.000 + **3.0**. Two constants. Nothing he could type into the
 * height field was ever going to move either number.
 *
 * ⭐ AND THE PROJECTOR WAS THE ODD ONE OUT, not the rule. Two other readers of
 * the same band already derive it from `level.height`:
 *   · `ViewRangeDefaults.computeViewRangeDefaults` — "Top = level above at
 *     offset 0, else host level + floor-to-floor height";
 *   · `NativeElementMeshExporter` — the level-overlap filter
 *     `l.elevation + (l.height ?? 0) >= minY`.
 * One question, three answers, and the one that draws the drawing dissented.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THREE ARMS, BECAUSE THE BREAK WAS BETWEEN THEM
 * ─────────────────────────────────────────────────────────────────────────────
 *   ARM A — the RULE, as a pure function. Fails a wrong rule.
 *   ARM B — ⭐ THE JOIN. `EdgeProjectorService.resolveClipRange()` — the real
 *           method, the real prototype, a real BimManager — returns a far plane
 *           that MOVED when the level height moved. This is the arm that would
 *           have caught the bug: arm A can be perfectly right while the
 *           projector never calls it, which is precisely the state the repo was
 *           in ([[committed-is-not-reachable]]).
 *   ARM C — the NON-REGRESSIONS: an explicit per-view range still wins, the
 *           1.2 m cut plane does NOT scale with the storey, and a level with no
 *           declared height still lands on the old 3.0 constant.
 *
 * The view-INVALIDATION half of the same founder report (nothing tells the view
 * tracker a level datum moved — L-11041) is proven separately, in
 * `packages/command-registry/__tests__/levelDatumDirtiesItsViews.test.ts`.
 *
 * Governance: C04 §3.3 (rendering & scheduling) · DOC-1.5d (view-range reference
 * frame) · ADR-0345 (level-height cascade) · C84 §EI-PROP.
 */

import { describe, expect, it } from 'vitest';
import { resolvePlanViewRangeOffsets } from '@pryzm/core-app-model';
import { EdgeProjectorService } from '../src/engine/views/EdgeProjectorService';

// ─────────────────────────────────────────────────────────────────────────────
// Harness
// ─────────────────────────────────────────────────────────────────────────────

interface StubLevel {
    id: string;
    name: string;
    elevation: number;
    height?: number;
    childrenIds: string[];
}

/** The founder's stack, AFTER his edit: Ground is 4.00 m, so Level 1 sits at 4.000. */
function founderStackAfterEdit(): StubLevel[] {
    return [
        { id: 'L0', name: 'Ground',  elevation: 0,   height: 4.0, childrenIds: [] },
        { id: 'L1', name: 'Level 1', elevation: 4.0, height: 3.0, childrenIds: [] },
    ];
}

function stubBimManager(levels: StubLevel[]) {
    const byId = new Map(levels.map((l) => [l.id, l]));
    return {
        getLevels:     () => Array.from(byId.values()),
        getLevelById:  (id: string) => byId.get(id),
    };
}

/**
 * A REAL `EdgeProjectorService` method on a REAL prototype, with only the one
 * collaborator `resolveClipRange` actually reads injected.
 *
 * ⭐ WHY NOT `new EdgeProjectorService(...)`: the constructor demands an
 * `OBC.World`, an `OBC.EdgeProjector` and an `OBC.TechnicalDrawings` — a live
 * WebGL world that does not exist under this node environment. Constructing the
 * prototype directly keeps the SUBJECT genuine (a rename, a signature change or
 * a deleted call site fails here) while supplying only what the method touches.
 * `resolveClipRange` reads exactly one field of `this`: `_bimManager`.
 *
 * ⚠ Deliberately NOT a hand-written fake of the method — [[fake-more-capable-than-real]]:
 * a fake built from the header cannot falsify the header.
 */
function projectorOver(levels: StubLevel[]): EdgeProjectorService {
    const svc = Object.create(EdgeProjectorService.prototype) as EdgeProjectorService;
    (svc as unknown as { _bimManager: unknown })._bimManager = stubBimManager(levels);
    return svc;
}

/** The minimum a plan `ViewDefinition` needs for `resolveClipRange`. */
function planViewOn(levelId: string, viewRange?: { nearOffset?: number; farOffset?: number }): any {
    return {
        id: `view-${levelId}`,
        viewType: 'plan',
        spatial: { levelId, ...(viewRange ? { viewRange } : {}) },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ARM A — the rule
// ─────────────────────────────────────────────────────────────────────────────

describe('L-11040 ARM A — the plan range rule', () => {
    it('takes the far offset from the level floor-to-floor height when the view declares none', () => {
        expect(resolvePlanViewRangeOffsets(undefined, 4.0).farOffset).toBe(4.0);
        expect(resolvePlanViewRangeOffsets(undefined, 2.5).farOffset).toBe(2.5);
    });

    it('keeps the cut plane at the 1.2 m architectural convention — it does NOT scale with the storey', () => {
        // Fails against "scale both offsets by the height", which would put the
        // cut at 1.6 m in a 4 m storey and move every door and window symbol.
        expect(resolvePlanViewRangeOffsets(undefined, 4.0).nearOffset).toBe(1.2);
        expect(resolvePlanViewRangeOffsets(undefined, 2.5).nearOffset).toBe(1.2);
    });

    it('an EXPLICIT per-view range still wins, in both arms', () => {
        const r = resolvePlanViewRangeOffsets({ nearOffset: 0.9, farOffset: 4.0 }, 2.5);
        expect(r.nearOffset).toBe(0.9);
        expect(r.farOffset).toBe(4.0);
    });

    it('UNKNOWN is not zero — an absent or unusable height falls back to the old 3.0 constant', () => {
        // C78 §1.4. A legacy project whose levels carry no `height` must be
        // bit-for-bit unchanged, which is what makes this fix safe to ship.
        expect(resolvePlanViewRangeOffsets(undefined, undefined).farOffset).toBe(3.0);
        expect(resolvePlanViewRangeOffsets(undefined, NaN).farOffset).toBe(3.0);
        expect(resolvePlanViewRangeOffsets(undefined, 0).farOffset).toBe(3.0);
        expect(resolvePlanViewRangeOffsets(undefined, -2).farOffset).toBe(3.0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ARM B — ⭐ THE JOIN: the projector itself
// ─────────────────────────────────────────────────────────────────────────────

describe('L-11040 ARM B — the JOIN: EdgeProjectorService.resolveClipRange follows the level height', () => {
    it("THE FOUNDER'S CASE — Ground at 4.00 m clips its plan at 4.000, not 3.000", () => {
        const clip = projectorOver(founderStackAfterEdit()).resolveClipRange(planViewOn('L0'));

        // ⭐ THE WHOLE ASK. Before this lane this was 3.000 — the constant — and
        // no value in the height field could change it.
        expect(clip.far).toBeCloseTo(4.0, 9);
        expect(clip.near).toBeCloseTo(1.2, 9);      // 0.000 + the 1.2 m cut
        expect(clip.floorY).toBeCloseTo(0, 9);
    });

    it('the far plane MOVES when the height moves — the same view, two datums', () => {
        // The differentiating assertion. A projector that still reads a constant
        // returns 3.000 for BOTH of these, and this test is the only arm that
        // can tell the two implementations apart.
        const at4 = projectorOver([{ id: 'L0', name: 'Ground', elevation: 0, height: 4.0, childrenIds: [] }])
            .resolveClipRange(planViewOn('L0'));
        const at25 = projectorOver([{ id: 'L0', name: 'Ground', elevation: 0, height: 2.5, childrenIds: [] }])
            .resolveClipRange(planViewOn('L0'));

        expect(at4.far).toBeCloseTo(4.0, 9);
        expect(at25.far).toBeCloseTo(2.5, 9);
        expect(at4.far).not.toBeCloseTo(at25.far, 3);
    });

    it('a level ABOVE the edited one carries its NEW elevation into the plan window', () => {
        // Level 1 rode Ground's +1.0 m up to 4.000 (ADR-0345 §3) and keeps its own
        // 3.0 m storey, so its plan cuts at 5.200 and clips at 7.000.
        const clip = projectorOver(founderStackAfterEdit()).resolveClipRange(planViewOn('L1'));
        expect(clip.near).toBeCloseTo(5.2, 9);
        expect(clip.far).toBeCloseTo(7.0, 9);
    });

    it("reproduces the founder's PRE-FIX console line, so the regression is legible", () => {
        // `elevation=3.000 … near=4.200 far=6.000` — Level 1 before the edit, on a
        // 3 m Ground. The numbers are unchanged for an unchanged model: this fix
        // moves nothing that was already correct.
        const clip = projectorOver([
            { id: 'L0', name: 'Ground',  elevation: 0,   height: 3.0, childrenIds: [] },
            { id: 'L1', name: 'Level 1', elevation: 3.0, height: 3.0, childrenIds: [] },
        ]).resolveClipRange(planViewOn('L1'));
        expect(clip.near).toBeCloseTo(4.2, 9);
        expect(clip.far).toBeCloseTo(6.0, 9);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ARM C — the non-regressions
// ─────────────────────────────────────────────────────────────────────────────

describe('L-11040 ARM C — what must NOT change', () => {
    it('an explicit per-view far offset overrules the level datum', () => {
        // VIEW_RANGE_PRESETS.structural on a 2.5 m storey still shows 4.0 m of
        // range. The datum supplies the DEFAULT, never an override of a stated
        // intent (C74 — a stated answer is not re-decided for the user).
        const clip = projectorOver([{ id: 'L0', name: 'Ground', elevation: 0, height: 2.5, childrenIds: [] }])
            .resolveClipRange(planViewOn('L0', { nearOffset: 1.2, farOffset: 4.0 }));
        expect(clip.far).toBeCloseTo(4.0, 9);
    });

    it('a level with NO declared height still clips at the historical 3.0', () => {
        const clip = projectorOver([{ id: 'L0', name: 'Ground', elevation: 0, childrenIds: [] }])
            .resolveClipRange(planViewOn('L0'));
        expect(clip.far).toBeCloseTo(3.0, 9);
        expect(clip.near).toBeCloseTo(1.2, 9);
    });

    it('a view whose level is missing entirely still resolves, on the fallback datum', () => {
        // Never throw out of the clip resolver — an unknown level is a stale view,
        // not a crash.
        const clip = projectorOver(founderStackAfterEdit()).resolveClipRange(planViewOn('L-does-not-exist'));
        expect(Number.isFinite(clip.near)).toBe(true);
        expect(Number.isFinite(clip.far)).toBe(true);
        expect(clip.far).toBeCloseTo(3.0, 9);
    });

    it('the RCP branch is untouched — it already read level.height and still does', () => {
        const rcp = { id: 'rcp', viewType: 'ceiling-plan', spatial: { levelId: 'L0' } } as any;
        const clip = projectorOver(founderStackAfterEdit()).resolveClipRange(rcp);
        // near = elevation + height = 0 + 4.0; far = near + 0.5.
        expect(clip.near).toBeCloseTo(4.0, 9);
        expect(clip.far).toBeCloseTo(4.5, 9);
    });
});
