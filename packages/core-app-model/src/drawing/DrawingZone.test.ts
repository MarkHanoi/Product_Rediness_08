/**
 * §FEAT-REVIT-LINE-TYPE-SEMANTICS (L-277) — THE MERGE-BLOCKING GUARD for C09 §4.6.
 *
 * The founder's normative model, as executable assertions:
 *
 *   (1) CUT        — SOLID, heaviest, filled.            NEVER dashed.
 *   (2) PROJECTION — SOLID, thinner.                     NEVER dashed. *Distance is irrelevant.*
 *   (3) BEYOND     — SOLID, lighter than CUT.            NEVER dashed. It is DELIBERATELY shown.
 *   (4) HIDDEN     — DASHED, thin, no fill.              THE ONLY ZONE THAT DASHES.
 *
 * And the two sentences that make it architecture rather than styling:
 *
 *   • **A segment that is merely FAR is SOLID.**
 *   • **A segment that is OCCLUDED is DASHED.**
 *
 * These are VERIFIED AT THE OUTCOME — the pen a line is actually painted with — not at the
 * seam. It is not enough to prove the occluder fired: L-246 computed a perfect plan cut
 * section and the plan branch never read the map it was written into, so correct geometry
 * reached NOTHING and was declared fixed. Every assertion below therefore ends at
 * `resolvePen(...).dashPx`.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
    DRAWING_ZONES,
    DATUM_CATEGORIES,
    drawingZoneFromLayerName,
    layerForZone,
    siblingZoneLayer,
    penZoneOf,
    drawingZoneOf,
    zoneDashesByDefault,
    type DrawingZone,
} from './DrawingZone';
import { resolvePen, penZoneFromLayerName } from './PenWeightTable';
import { applyOcclusion } from './HiddenLineRemoval';
import { graphicsRulesEngine } from './GraphicsRulesEngine';
import { defaultStateAppearance } from '../presentation/VisibilityIntentDefaults';
import { resolveViewScope } from '../views/ViewScope';

// ─── Fixture plumbing (mirrors what EdgeProjectorService actually emits) ──────

function makeFakeDrawing() {
    const three = new THREE.Group();
    const drawing = {
        three,
        layers: { create: (_n: string) => { /* idempotent in the real DrawingLayers */ } },
        addProjectionLines: (lines: THREE.LineSegments, _layer: string) => { three.add(lines); },
    };
    return { drawing: drawing as unknown as import('@thatopen/components').TechnicalDrawing, three };
}

/** A projected LineSegments, stamped exactly as EdgeProjectorService stamps it. */
function seg(
    uuid: string,
    layerName: string,
    viewDepth: number | undefined,
    points: Array<[number, number]>,
): THREE.LineSegments {
    const pos: number[] = [];
    for (const [x, z] of points) pos.push(x, 0, z);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const ls = new THREE.LineSegments(geo, new THREE.LineBasicMaterial());
    ls.name = layerName;
    ls.userData.layerName = layerName;
    ls.userData.elementUUID = uuid;
    if (viewDepth !== undefined) ls.userData.viewDepth = viewDepth;
    return ls;
}

function node(three: THREE.Object3D, uuid: string, layerName: string): THREE.LineSegments | undefined {
    let found: THREE.LineSegments | undefined;
    three.traverse((o) => {
        if (o instanceof THREE.LineSegments &&
            o.userData?.elementUUID === uuid &&
            o.userData?.layerName === layerName) found = o;
    });
    return found;
}

function segCount(ls: THREE.LineSegments | undefined): number {
    if (!ls) return 0;
    const p = ls.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    return p ? p.count / 2 : 0;
}

/** THE OUTCOME: the dash pattern the canvas will actually hand to `ctx.setLineDash()`. */
function dashOfLayer(layerTag: string, category: string): number[] | null {
    const zone = penZoneFromLayerName(layerTag);
    expect(zone).not.toBeNull();
    return resolvePen(zone!, category).dashPx;
}

function widthOfLayer(layerTag: string, category: string): number {
    const zone = penZoneFromLayerName(layerTag);
    return resolvePen(zone!, category).widthMm;
}

// ─── (A) The type itself ──────────────────────────────────────────────────────

describe('§FEAT-REVIT-LINE-TYPE-SEMANTICS — the four zones are a TYPE', () => {
    it('names exactly four zones, and every one round-trips through its ISO sub-layer', () => {
        expect([...DRAWING_ZONES]).toEqual(['cut', 'projection', 'beyond', 'hidden']);
        for (const zone of DRAWING_ZONES) {
            expect(drawingZoneFromLayerName(layerForZone('A-WALL', zone))).toBe(zone);
            expect(drawingZoneOf(penZoneOf(zone))).toBe(zone);
        }
    });

    it('resolves BOTH live sub-layer conventions — the projector\'s colon form and the symbol builders\' hyphen form', () => {
        expect(drawingZoneFromLayerName('A-WALL:cut')).toBe('cut');
        expect(drawingZoneFromLayerName('A-DOOR-CUT')).toBe('cut');   // hyphen form (L-260 B)
        expect(drawingZoneFromLayerName('A-GLAZ:beyond')).toBe('beyond');
        expect(drawingZoneFromLayerName('A-WALL:hidden')).toBe('hidden');
        // Zone-less layers must NOT be coerced into a zone.
        expect(drawingZoneFromLayerName('A-GRID')).toBeNull();
        expect(drawingZoneFromLayerName('A-WALL')).toBeNull();
        expect(drawingZoneFromLayerName('')).toBeNull();
    });

    it('demotes onto the SAME naming convention it was given (a door frame lands on A-DOOR-HIDDEN)', () => {
        expect(siblingZoneLayer('A-WALL:proj', 'hidden')).toBe('A-WALL:hidden');
        expect(siblingZoneLayer('A-DOOR-PROJ', 'hidden')).toBe('A-DOOR-HIDDEN');
        expect(siblingZoneLayer('A-GRID', 'hidden')).toBeNull();
    });
});

// ─── (B) THE PEN LADDER — C09 §4.6.4, merge-blocking ─────────────────────────

describe('§FEAT-REVIT-LINE-TYPE-SEMANTICS — the pen table obeys C09 §4.6.4', () => {
    // Every element category the pen table knows about (datums excluded — they are not solids).
    const SOLID_CATEGORIES = [
        'wall', 'slab', 'column', 'structural', 'beam',
        'door', 'window', 'stair', 'roof', 'ceiling',
    ];

    it('ONLY the HIDDEN zone dashes — for EVERY solid category, in EVERY zone', () => {
        for (const category of SOLID_CATEGORIES) {
            for (const zone of DRAWING_ZONES) {
                const dash = resolvePen(penZoneOf(zone), category).dashPx;
                const dashes = dash !== null && dash.length > 0;
                expect(
                    dashes,
                    `pen(${zone}, ${category}) dashes=${dashes} — C09 §4.6.4: only 'hidden' dashes by default`,
                ).toBe(zoneDashesByDefault(zone));
            }
        }
    });

    it('the ONE exemption is explicit: DATUM categories (grid, level) carry an ISO 128-24 chain line, not a zone dash', () => {
        // Recorded so the carve-out can never be widened silently: these are the ONLY
        // categories permitted to dash outside the hidden zone, and they are not solids.
        // §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7950) — `boundary-line` JOINED the
        // datums. It is a CONSTRUCTION line: an architect draws it to set a scheme out,
        // exactly as a grid or level line is drawn, and its dash is an ISO 128-24
        // category convention rather than a hidden-line reading. The exemption covers
        // the CENTRELINE only; a boundary line carrying VOLUME has a real solid whose
        // own edges obey the ladder like any other fabric (C105 §5).
        expect([...DATUM_CATEGORIES].sort()).toEqual(['annotation', 'boundary-line', 'grid', 'level']);
        expect(resolvePen('PROJECTION', 'grid').dashPx).not.toBeNull();
        expect(resolvePen('PROJECTION', 'level').dashPx).not.toBeNull();
    });

    it('weight(CUT) > weight(PROJECTION) > weight(BEYOND) >= weight(HIDDEN), strictly, per category', () => {
        for (const category of SOLID_CATEGORIES) {
            const cut    = resolvePen('CUT', category).widthMm;
            const proj   = resolvePen('PROJECTION', category).widthMm;
            const beyond = resolvePen('BEYOND', category).widthMm;
            const hidden = resolvePen('HIDDEN', category).widthMm;
            expect(cut,    `${category}: CUT must outweigh PROJECTION`).toBeGreaterThan(proj);
            expect(proj,   `${category}: PROJECTION must outweigh BEYOND`).toBeGreaterThan(beyond);
            expect(beyond, `${category}: BEYOND must not be lighter than HIDDEN`).toBeGreaterThanOrEqual(hidden);
        }
    });

    it('HIDDEN carries a real pen — it used to be an EMPTY table entry falling through to a 0.18 mm SOLID BLACK fallback', () => {
        for (const category of SOLID_CATEGORIES) {
            const hidden = resolvePen('HIDDEN', category);
            expect(hidden.dashPx, `${category}: HIDDEN must be dashed`).not.toBeNull();
            expect(hidden.widthMm).toBeGreaterThan(0);   // not the invisible zero-width worker pen
            expect(hidden.opacity).toBeGreaterThan(0);   // not the invisible zero-opacity worker pen
            expect(hidden.color).not.toBe('#000000');    // not FALLBACK_PEN
        }
    });
});

// ─── (C) THE OUTCOME — far ≠ hidden ──────────────────────────────────────────

describe('§FEAT-REVIT-LINE-TYPE-SEMANTICS — a FAR line is SOLID; an OCCLUDED line is DASHED', () => {

    it('THE FOUNDER\'S BUG: a wall 40 m away, fully visible, is SOLID — distance never dashes', () => {
        // A section's depth classifier routes anything past `projectionDepth` (~12 m) to
        // `:beyond`. Before L-277 `:beyond` was DASHED, so this wall — visible, unoccluded,
        // merely far — drew exactly like a wall behind another wall.
        const far = 'A-WALL:beyond';
        expect(dashOfLayer(far, 'wall')).toBeNull();
        // …and it is LIGHTER than the cut, exactly as specified.
        expect(widthOfLayer(far, 'wall')).toBeLessThan(widthOfLayer('A-WALL:cut', 'wall'));
    });

    it('THE FOUNDER\'S STAIR: the lower run (BEYOND, below the cut plane) SHOWS — solid and lighter', () => {
        const lowerRun = 'A-STRS:beyond';
        expect(dashOfLayer(lowerRun, 'stair')).toBeNull();                       // shows, and SOLID
        expect(resolvePen('BEYOND', 'stair').opacity).toBeGreaterThan(0);        // it SHOWS
        expect(widthOfLayer(lowerRun, 'stair'))
            .toBeLessThan(widthOfLayer('A-STRS:cut', 'stair'));                   // lighter than CUT
    });

    it('an OCCLUDED elevation wall is demoted to :hidden and PAINTS DASHED (end-to-end, pen resolved)', () => {
        const { drawing, three } = makeFakeDrawing();

        // Façade silhouette at depth 0.
        three.add(seg('facade', 'A-WALL:proj', 0, [
            [0, 0], [4, 0], [4, 0], [4, 3], [4, 3], [0, 3], [0, 3], [0, 0],
        ]));
        // A wall set back 0.5 m, fully behind the façade → genuinely OCCLUDED.
        three.add(seg('behind', 'A-WALL:proj', 0.5, [[2, 0.5], [2, 2.5]]));

        const scope = resolveViewScope('elevation');
        expect(scope.occlusionDisposition).toBe('demote'); // intent, not a viewType branch

        const r = applyOcclusion(drawing, { disposition: scope.occlusionDisposition });
        expect(r.demoted).toBe(1);

        // It left :proj …
        expect(segCount(node(three, 'behind', 'A-WALL:proj'))).toBe(0);
        // … and landed on :hidden — NOT on :beyond (that merge IS the bug).
        expect(segCount(node(three, 'behind', 'A-WALL:hidden'))).toBe(1);
        expect(node(three, 'behind', 'A-WALL:beyond')).toBeUndefined();

        // THE OUTCOME: the pen the canvas will actually use is DASHED.
        expect(dashOfLayer('A-WALL:hidden', 'wall')).not.toBeNull();
        // …and the façade in front of it stays SOLID.
        expect(dashOfLayer('A-WALL:proj', 'wall')).toBeNull();
    });

    it('SECTION: a near PROJECTED wall now hides the far wall behind it (ADR-121 §5.2(2) — "the section shows the far wall through the near one")', () => {
        // The hole ADR-121 named: plan and section built occluders from `:cut` ONLY, so a
        // PROJECTED solid occluded nothing. `removeHiddenLines` was called — it just had
        // nothing to occlude with.
        const { drawing, three } = makeFakeDrawing();

        // Near wall, PROJECTED (not cut by the section plane), depth 2 m behind the plane.
        three.add(seg('near-wall', 'A-WALL:proj', 2.0, [
            [0, 0], [4, 0], [4, 0], [4, 3], [4, 3], [0, 3], [0, 3], [0, 0],
        ]));
        // Far wall, 8 m behind the plane, its edge running straight through the near wall.
        three.add(seg('far-wall', 'A-WALL:proj', 8.0, [[-1, 1.5], [5, 1.5]]));

        const scope = resolveViewScope('section');
        expect(scope.occlusionDisposition).toBe('remove');

        applyOcclusion(drawing, { disposition: scope.occlusionDisposition });

        // The far edge survives OUTSIDE the near wall (two stubs) and is CLIPPED inside it.
        const far = node(three, 'far-wall', 'A-WALL:proj')!;
        expect(segCount(far)).toBe(2);
        const p = far.geometry.getAttribute('position') as THREE.BufferAttribute;
        const xs = [p.getX(0), p.getX(1), p.getX(2), p.getX(3)].sort((a, b) => a - b);
        expect(xs[0]).toBeCloseTo(-1, 5);
        expect(xs[1]).toBeCloseTo(0, 5);   // clipped exactly at the near wall's face
        expect(xs[2]).toBeCloseTo(4, 5);   // …and resumes at its far face
        expect(xs[3]).toBeCloseTo(5, 5);
    });

    it('PLAN: a ROOF above the cut plane occludes NOTHING — a plan looks down FROM its cut plane', () => {
        // The degenerate case that makes the plan projection-occluder set legal at all. The
        // roof is the NEAREST solid in the drawing and its silhouette covers the whole plate;
        // without the `minProjectionOccluderDepth: 0` clip it would erase the ENTIRE PLAN.
        const { drawing, three } = makeFakeDrawing();

        // Roof: 2 m ABOVE the cut plane ⇒ negative view depth. Silhouette spans everything.
        three.add(seg('roof', 'A-ROOF:proj', -2.0, [
            [-5, -5], [10, -5], [10, -5], [10, 10], [10, 10], [-5, 10], [-5, 10], [-5, -5],
        ]));
        // Furniture on the floor, 0.5 m below the cut plane — must survive.
        three.add(seg('desk', 'A-FURN:proj', 0.5, [[1, 1], [3, 1]]));

        const scope = resolveViewScope('plan');
        expect(scope.occlusionDisposition).toBe('remove');

        const r = applyOcclusion(drawing, {
            disposition: scope.occlusionDisposition,
            minProjectionOccluderDepth: 0,
        });

        expect(r.occluders).toBe(0);                                  // the roof was refused
        expect(segCount(node(three, 'desk', 'A-FURN:proj'))).toBe(1); // the plan survives
    });

    it('PLAN: a projected solid never erases the BEYOND zone — the storey below is DELIBERATELY shown', () => {
        // The slab is a projected solid spanning the whole plate and lying NEARER than
        // everything under it. If projection occluders were allowed to clip `:beyond`, the
        // slab would silently delete the entire below-storey reference band the view range
        // was configured to include. Only a CUT solid may hide a `:beyond` span.
        const { drawing, three } = makeFakeDrawing();

        three.add(seg('slab', 'A-FLOR:proj', 1.2, [
            [0, 0], [8, 0], [8, 0], [8, 8], [8, 8], [0, 8], [0, 8], [0, 0],
        ]));
        // The lower run of the founder's stair, in the beyond band under the slab.
        three.add(seg('stair-lower', 'A-STRS:beyond', 4.0, [[2, 2], [6, 2]]));

        applyOcclusion(drawing, { disposition: 'remove', minProjectionOccluderDepth: 0 });

        expect(segCount(node(three, 'stair-lower', 'A-STRS:beyond'))).toBe(1);
        expect(dashOfLayer('A-STRS:beyond', 'stair')).toBeNull(); // shows, SOLID
    });

    it('is IDEMPOTENT — a second pass does not re-occlude already-resolved :hidden linework', () => {
        const { drawing, three } = makeFakeDrawing();
        three.add(seg('facade', 'A-WALL:proj', 0, [
            [0, 0], [4, 0], [4, 0], [4, 3], [4, 3], [0, 3], [0, 3], [0, 0],
        ]));
        three.add(seg('behind', 'A-WALL:proj', 0.5, [[2, 0.5], [2, 2.5]]));

        applyOcclusion(drawing, { disposition: 'demote' });
        const second = applyOcclusion(drawing, { disposition: 'demote' });

        expect(second.demoted).toBe(0);
        expect(segCount(node(three, 'behind', 'A-WALL:hidden'))).toBe(1); // still there, once
    });
});

// ─── (C2) THE OUTCOME, THROUGH THE CALL THE CANVAS ACTUALLY MAKES ────────────

describe('§FEAT-REVIT-LINE-TYPE-SEMANTICS — the pen SURVIVES the intent chain (PlanViewCanvas\'s real call)', () => {
    /**
     * VERIFY AT THE OUTCOME, NOT AT THE SEAM. `PlanViewCanvas` does NOT call `resolvePen()`
     * — it calls `graphicsRulesEngine.resolveStyle()`, which layers the visibility INTENT on
     * top of the pen table at `RULE_PRIORITY_INTENT`. And the intent's default appearance for
     * the `hidden` state used to be `visible: false` ⇒ weight 0, opacity 0, style solid — so
     * the intent chain OVERRODE the table and the hidden line was painted INVISIBLE. A dashed
     * pen in the table that reaches nothing is L-246 all over again. These assertions go
     * through the real call.
     */
    it('HIDDEN survives resolveStyle(): dashed, non-zero width, non-zero opacity, NO fill', () => {
        for (const category of ['wall', 'slab', 'stair', 'door']) {
            const pen = graphicsRulesEngine.resolveStyle('HIDDEN', category, { viewType: 'elevation' });
            expect(pen.dashPx, `${category}: HIDDEN must reach the canvas DASHED`).not.toBeNull();
            expect(pen.widthMm, `${category}: HIDDEN must reach the canvas with a width`).toBeGreaterThan(0);
            expect(pen.opacity, `${category}: HIDDEN must reach the canvas visible`).toBeGreaterThan(0);
        }
        // …and hidden linework carries NO fill (C09 §4.6.4).
        expect(defaultStateAppearance('wall', 'hidden').fill.style).toBe('none');
        expect(defaultStateAppearance('wall', 'hidden').visible).toBe(true);
    });

    it('BEYOND survives resolveStyle() SOLID — the distance zone reaches the canvas with no dash', () => {
        for (const category of ['wall', 'slab', 'stair', 'furniture']) {
            const pen = graphicsRulesEngine.resolveStyle('BEYOND', category, { viewType: 'plan' });
            expect(pen.dashPx, `${category}: BEYOND must reach the canvas SOLID`).toBeNull();
            expect(pen.opacity).toBeGreaterThan(0);
        }
    });

    it('PROJECTION survives resolveStyle() SOLID for roof + ceiling — the overhead dash is gone', () => {
        expect(graphicsRulesEngine.resolveStyle('PROJECTION', 'roof',    { viewType: 'plan' }).dashPx).toBeNull();
        expect(graphicsRulesEngine.resolveStyle('PROJECTION', 'ceiling', { viewType: 'plan' }).dashPx).toBeNull();
    });
});

// ─── (D) The disposition is INTENT (C09 §4.6.5) ──────────────────────────────

describe('§FEAT-REVIT-LINE-TYPE-SEMANTICS — the occlusion disposition is VIEW INTENT, not a code branch', () => {
    it('ViewScope carries it for every view type — the engine never asks what an elevation is', () => {
        expect(resolveViewScope('plan').occlusionDisposition).toBe('remove');
        expect(resolveViewScope('section').occlusionDisposition).toBe('remove');
        expect(resolveViewScope('elevation').occlusionDisposition).toBe('demote');
    });

    it('the SAME engine, the SAME fixture, produces both conventions purely from the disposition', () => {
        const build = () => {
            const f = makeFakeDrawing();
            f.three.add(seg('facade', 'A-WALL:proj', 0, [
                [0, 0], [4, 0], [4, 0], [4, 3], [4, 3], [0, 3], [0, 3], [0, 0],
            ]));
            f.three.add(seg('behind', 'A-WALL:proj', 0.5, [[2, 0.5], [2, 2.5]]));
            return f;
        };

        const a = build();
        const removed = applyOcclusion(a.drawing, { disposition: 'remove' });
        expect(removed.demoted).toBe(0);
        expect(removed.clipped).toBeGreaterThan(0);
        expect(node(a.three, 'behind', 'A-WALL:hidden')).toBeUndefined();

        const b = build();
        const demoted = applyOcclusion(b.drawing, { disposition: 'demote' });
        expect(demoted.demoted).toBe(1);
        expect(segCount(node(b.three, 'behind', 'A-WALL:hidden'))).toBe(1);
    });
});

// ─── (E) The type is exhaustive ──────────────────────────────────────────────

describe('§FEAT-REVIT-LINE-TYPE-SEMANTICS — no fifth zone can be born', () => {
    it('every DrawingZone has a suffix, a pen zone and a dash verdict — a new one cannot compile without them', () => {
        const verdicts = DRAWING_ZONES.map((z: DrawingZone) => ({
            zone:   z,
            layer:  layerForZone('A-WALL', z),
            pen:    penZoneOf(z),
            dashes: zoneDashesByDefault(z),
        }));
        expect(verdicts.filter(v => v.dashes).map(v => v.zone)).toEqual(['hidden']);
        expect(new Set(verdicts.map(v => v.layer)).size).toBe(4); // no two zones share a layer
    });
});
