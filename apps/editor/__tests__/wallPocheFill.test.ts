// @vitest-environment happy-dom
//
// §FEAT-WALL-POCHE-FILL-BY-INTENT (L-261) — a cut wall is a FILLED region, and a
// LAYERED cut wall is a filled region PER CONSTRUCTION LAYER.
//
// Founder: "Walls in plan view should render also with a filled light grey — the plain
// wall — by DEFAULT through the VISIBILITY INTENT settings. And all LAYERED walls should
// also render in plan view with grey-scale colour filling the inside part."
//
// THE GUARDS (the ticket's own acceptance criteria):
//   (1) a PLAIN cut wall yields exactly ONE closed region;
//   (2) a LAYERED cut wall yields N regions matching its REAL layer count (L-127: from
//       the stored `layers`, never a magic literal — here, from the meshes those layers
//       produced);
//   (3) the tones are a deterministic SPREAD of the intent-resolved base colour, so they
//       are all overridable from the intent and NONE of them is a hardcoded grey;
//   (4) the default base colour is LIGHT, not the near-black the table used to seed.
//
// The chain under test is the real one: mesh → buildPlanCutSectionGeometry (the true
// plane∩triangle section, L-246) → PocheFillBuilder (loop stitching) → the poché table.

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { buildPlanCutSectionGeometry } from '../src/engine/views/EdgeProjectorService.js';
import { PocheFillBuilder } from '@pryzm/core-app-model';
import {
    ISO_CUT_LAYER_TO_POCHE_FILL,
    defaultPocheFillForCategory,
    resolveWallLayerPocheFill,
} from '@pryzm/core-app-model/drawing';
import { defaultRulesForElementType } from '@pryzm/core-app-model/presentation';

const LEN = 4, HEIGHT = 3, CUT = 1.2;

/** One wall-layer solid: a box of `thickness`, centred at `offset` across the wall. */
function layerMesh(thickness: number, offset: number, fn: string, index: number): THREE.Mesh {
    const g = new THREE.BoxGeometry(LEN, HEIGHT, thickness);
    g.translate(LEN / 2, HEIGHT / 2, offset);
    const mesh = new THREE.Mesh(g);
    mesh.userData = { wallId: 'w1', layerIndex: index, layerFunction: fn, layerName: fn };
    mesh.updateMatrixWorld(true);
    return mesh;
}

/** Luminance of a hex colour (all our poché tones are greys → any channel would do). */
function lum(hex: string): number {
    const h = hex.replace('#', '');
    return (parseInt(h.slice(0, 2), 16) + parseInt(h.slice(2, 4), 16) + parseInt(h.slice(4, 6), 16)) / 3;
}

describe('§FEAT-WALL-POCHE-FILL-BY-INTENT (L-261) — poché regions', () => {
    it('(1) a PLAIN cut wall yields exactly ONE closed filled region', () => {
        const g = new THREE.BoxGeometry(LEN, HEIGHT, 0.2);
        g.translate(LEN / 2, HEIGHT / 2, 0);
        const mesh = new THREE.Mesh(g);
        mesh.updateMatrixWorld(true);

        const cut = buildPlanCutSectionGeometry(mesh, CUT);
        expect(cut).not.toBeNull();

        const polys = PocheFillBuilder.fromGeometry(cut!, '#c9c9c9', 1);
        expect(polys).toHaveLength(1);
        expect(polys[0]!.points.split(/\s+/).length).toBeGreaterThanOrEqual(4);
    });

    it('(2) a LAYERED cut wall yields ONE region PER STORED LAYER — count derived, never literal', () => {
        // A real 3-layer wall record: finish / structure / finish (0.02 + 0.15 + 0.02).
        const layers = [
            { thickness: 0.02, function: 'finish-exterior' },
            { thickness: 0.15, function: 'structure' },
            { thickness: 0.02, function: 'finish-interior' },
        ];
        const total = layers.reduce((s, l) => s + l.thickness, 0);
        let cursor = -total / 2;
        const meshes = layers.map((l, i) => {
            const offset = cursor + l.thickness / 2;
            cursor += l.thickness;
            return layerMesh(l.thickness, offset, l.function, i);
        });

        const regions = meshes.flatMap((m) => {
            const cut = buildPlanCutSectionGeometry(m, CUT);
            expect(cut).not.toBeNull();
            return PocheFillBuilder.fromGeometry(cut!, '#c9c9c9', 1);
        });

        // N regions === the wall's REAL layer count.
        expect(regions).toHaveLength(layers.length);
    });

    it('(3) layer tones are a SPREAD of the intent-resolved base colour (no hardcoded grey)', () => {
        const base = defaultPocheFillForCategory('wall')!;
        const toneOf = (fn: string, tie = 0) => resolveWallLayerPocheFill(base, fn, tie);

        // The build-up reads: core darkest → finishes mid → insulation/cavity palest.
        expect(lum(toneOf('structure'))).toBeLessThan(lum(toneOf('substrate')));
        expect(lum(toneOf('substrate'))).toBeLessThan(lum(toneOf('finish-exterior')));
        expect(lum(toneOf('finish-exterior'))).toBeLessThan(lum(toneOf('finish-interior')));
        expect(lum(toneOf('finish-interior'))).toBeLessThan(lum(toneOf('insulation')));
        expect(lum(toneOf('insulation'))).toBeLessThan(lum(toneOf('air-barrier')));

        // Two layers of the SAME function still separate (tie ordinal).
        expect(toneOf('finish-interior', 0)).not.toEqual(toneOf('finish-interior', 1));

        // THE GOVERNANCE GUARD: change the intent's cut colour and EVERY tone moves with
        // it — the tones are not an independent palette. A blue-poché intent stays blue.
        const overridden = resolveWallLayerPocheFill('#3050a0', 'structure');
        expect(overridden).not.toEqual(toneOf('structure'));
        const [r, g, b] = [1, 3, 5].map(i => parseInt(overridden.slice(i, i + 2), 16));
        expect(b).toBeGreaterThan(r);          // hue preserved, not reverted to grey
        expect(g).toBeGreaterThan(r);
    });

    it('(4) the DEFAULT wall poché is LIGHT grey, and the intent is seeded from the table', () => {
        expect(lum(ISO_CUT_LAYER_TO_POCHE_FILL['A-WALL']!)).toBeGreaterThan(150);

        // The intent default IS the table value — one source of truth, and it is the knob
        // the founder asked for ("by default through the visibility intent settings").
        const wallRules = defaultRulesForElementType('wall');
        expect(wallRules.cut.fill.style).toBe('poche');
        expect(wallRules.cut.fill.colour).toBe(ISO_CUT_LAYER_TO_POCHE_FILL['A-WALL']);
        // …and nothing but the CUT zone is filled: a projected wall is an outline.
        expect(wallRules.projection.fill.style).toBe('none');
        expect(wallRules.beyond.fill.style).toBe('none');
    });
});
