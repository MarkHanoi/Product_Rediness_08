// @vitest-environment happy-dom
//
// §DRAWING-LAYER-DERIVED (L-1227) — OBC stamps every projection line onto THREE layer 1,
// which IS PRYZM's EDITOR_LAYER, which the 3D view deliberately ENABLES (§L-426).
//
// This suite pins the two facts the founder's production dump measured, and the two
// repairs, WITHOUT stubbing either decision:
//   • the bitmask the dump printed (`layers:2`) decodes to EDITOR_LAYER, not
//     ANNOTATION_LAYER — the ambiguity that cost a whole round trip;
//   • an unattributed black line on that mask is attributed to the OBC producer;
//   • the probe's diff arm reports NO DIFF for a scene that did not change, which is
//     what falsified "the elevation visit put them there".
//
// The layer constants are read from `@pryzm/scene-committer`, NOT retyped — if anyone
// renumbers EDITOR_LAYER to dodge OBC, this suite breaks loudly rather than passing
// against a stale literal.
import { describe, it, expect } from 'vitest';
import { BIM_LAYER, EDITOR_LAYER, DOCUMENTATION_LAYER } from '@pryzm/scene-committer';
import {
    decodeLayerMask, attributeProducer, censusLinework, diffCensus, lineworkSignature,
    type LineworkRow,
} from '../src/engine/lineworkProbe';

/** THREE semantics: `layers.set(n)` produces mask `1 << n`. */
const maskFor = (layer: number): number => 1 << layer;

const row = (o: Partial<LineworkRow>): LineworkRow => ({
    type: 'LineSegments', name: '', elementType: null, role: null, elementId: null,
    projectId: null, viewId: null, colour: null, depthTest: null, renderOrder: 0,
    layerMask: 1, visible: true, effectivelyVisible: true, parentChain: '', ...o,
});

describe('§DRAWING-LAYER-DERIVED — the collision is real and named', () => {
    it('PRYZM EDITOR_LAYER is THREE layer 1 — the layer OBC hard-sets', () => {
        // @thatopen/components TechnicalDrawing.addProjectionLines(): `ls.layers.set(1)`.
        expect(EDITOR_LAYER).toBe(1);
        expect(maskFor(EDITOR_LAYER)).toBe(2);
    });

    it('the production dump\u2019s "layers:2" decodes to EDITOR, never ANNOTATION', () => {
        expect(decodeLayerMask(2)).toBe('EDITOR');
        expect(decodeLayerMask(maskFor(BIM_LAYER))).toBe('BIM');
        expect(decodeLayerMask(maskFor(DOCUMENTATION_LAYER))).toBe('DOCUMENTATION');
        // The trap: ANNOTATION is layer 2, whose MASK is 4 — not 2.
        expect(decodeLayerMask(4)).toBe('ANNOTATION');
    });

    it('attributes the founder\u2019s \u00d7366 class to the OBC producer, and leaves the aids alone', () => {
        const obc = row({ colour: '000000', layerMask: maskFor(EDITOR_LAYER) });
        expect(attributeProducer(obc)).toMatch(/OBC TechnicalDrawing/);

        const parcel = row({ type: 'Line', colour: '6600ff', layerMask: maskFor(EDITOR_LAYER) });
        expect(attributeProducer(parcel)).toMatch(/ParcelBoundarySceneRenderer/);
        expect(attributeProducer(parcel)).toMatch(/LEGITIMATE/);

        const wallEdges = row({ role: 'edges', elementType: 'WallEdges', colour: '444444' });
        expect(attributeProducer(wallEdges)).toMatch(/WallEdgeOverlayBuilder/);
    });

    it('§EDGE131 — names the two finish families the dump could only print as "-"', () => {
        // The founder's L-1227 dump read `x5 LineSegments | - | edges | 444444 |
        // VISIBLE`. The empty elementType column was the finding, not noise: these
        // were floor finishes, governed by no view gate. Both now self-identify.
        const floor = row({ role: 'edges', elementType: 'FloorEdges', colour: '555555' });
        expect(attributeProducer(floor)).toMatch(/FloorPanelBuilder/);

        const ceiling = row({ role: 'edges', elementType: 'CeilingEdges', colour: '555555' });
        expect(attributeProducer(ceiling)).toMatch(/CeilingPanelBuilder/);
    });

    it('§EDGE131 — an UNSTAMPED overlay is reported as ungoverned, not merely unnamed', () => {
        // The old wording ("elementType unstamped") read as a cosmetic gap. It is
        // not: an unstamped overlay is one no view gate can reach.
        const orphan = row({ role: 'edges', elementType: null, colour: '444444' });
        const verdict = attributeProducer(orphan);
        expect(verdict).toMatch(/UNSTAMPED/);
        expect(verdict).toMatch(/no view gate can reach it/);
    });
});

describe('§LINEWORK-3D-PROBE — the census and the diff that falsified hypothesis (a)', () => {
    /** A scene shaped like the founder's: OBC lines on EDITOR_LAYER + one parcel ring. */
    const scene = (nObc: number) => ({
        children: [
            ...Array.from({ length: nObc }, () => ({
                type: 'LineSegments', visible: true, userData: {},
                layers: { mask: maskFor(EDITOR_LAYER) },
                material: { color: { getHexString: () => '000000' }, depthTest: true },
            })),
            {
                type: 'Line', visible: true, userData: {},
                layers: { mask: maskFor(EDITOR_LAYER) },
                material: { color: { getHexString: () => '6600ff' }, depthTest: true },
            },
        ],
    });

    it('separates the OBC class from the parcel ring — one mask, two owners', () => {
        const c = censusLinework(scene(366));
        expect(c.total).toBe(367);
        expect(c.effectivelyVisible).toBe(367);
        const sigs = Object.entries(c.histogram).sort((a, b) => b[1] - a[1]);
        expect(sigs[0][1]).toBe(366);
        expect(sigs[0][0]).toContain('EDITOR');
        expect(sigs[0][0]).toContain('000000');
        expect(sigs[1][1]).toBe(1);
        expect(sigs[1][0]).toContain('6600ff');
    });

    it('reports NO DIFF for an unchanged scene — the finding that killed hypothesis (a)', () => {
        expect(diffCensus(censusLinework(scene(366)), censusLinework(scene(366)))).toEqual([]);
    });

    it('DOES report a diff when a class actually arrives, so no-diff is not vacuous', () => {
        const delta = diffCensus(censusLinework(scene(366)), censusLinework(scene(400)));
        expect(delta).toHaveLength(1);
        expect(delta[0].nowCount - delta[0].baselineCount).toBe(34);
    });

    it('a hidden object is censused but never counted as visible', () => {
        const withHidden = {
            children: [
                ...scene(2).children,
                {
                    type: 'LineSegments', visible: false, userData: { role: 'edges' },
                    layers: { mask: maskFor(BIM_LAYER) },
                    material: { color: { getHexString: () => '444444' }, depthTest: true },
                },
            ],
        };
        const c = censusLinework(withHidden);
        expect(c.total).toBe(4);
        expect(c.effectivelyVisible).toBe(3);
        expect(Object.keys(c.histogram).some(k => k.endsWith('hidden'))).toBe(true);
    });

    it('an invisible ANCESTOR hides its children — effective visibility, not the own flag', () => {
        const child = {
            type: 'LineSegments', visible: true, userData: {},
            layers: { mask: maskFor(EDITOR_LAYER) },
            material: { color: { getHexString: () => '000000' }, depthTest: true },
            parent: null as unknown,
        };
        const group = { type: 'Group', visible: false, children: [child], userData: {} };
        (child as { parent: unknown }).parent = group;
        const c = censusLinework({ children: [group] });
        expect(c.effectivelyVisible).toBe(0);
        expect(lineworkSignature(c.rows[0])).toContain('hidden');
    });
});
