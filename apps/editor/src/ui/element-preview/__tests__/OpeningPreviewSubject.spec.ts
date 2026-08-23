/**
 * §OPENING-SHOWROOM-PREVIEW (L-7720 … L-7728) — the subject builders.
 *
 * These are the half of the showroom that can be asserted without a GPU, and
 * they are the half that can be WRONG in a way nobody notices: a preview that
 * invents its own dimensions looks fine and lies. L-127 is the standing rule —
 * *"preview and placement MUST both call the resolver"* — so what is pinned here
 * is that the subject's numbers ARE the resolver's numbers, and that its parts
 * carry MATERIAL REFERENCES rather than colours.
 *
 * ⚠ The renderer itself is not exercised: happy-dom has no WebGL, and a test that
 * mocked one would be a fake more capable than the real thing. What the renderer
 * must satisfy is instead enforced by `check-three-imports.ts` (P2) and
 * `check-raf-count.ts` (P3), which are real gates over the real file.
 */

import { describe, it, expect } from 'vitest';
import { resolveWindowDimensions } from '@pryzm/geometry-window';
import { resolveDoorDimensions } from '@pryzm/geometry-door';
import { findMaterialById } from '@pryzm/core-app-model/material-library';
import {
    buildWindowPreviewSubject,
    buildDoorPreviewSubject,
    buildOpeningPreviewSubject,
} from '../OpeningPreviewSubject';

const WINDOW_DRAFT = {
    id: 'wt-steel-crittal',
    name: 'Steel Crittal Style',
    frameFinish: { name: 'Steel Frame', materialId: 'steel-powder-coated-dark', materialColor: '#444444' },
    sillFinish: { name: 'Steel Sill', materialId: 'steel-powder-coated-dark', materialColor: '#444444' },
    glazingOpacity: 0.2,
    defaultColumnRatios: [0.5, 0.5],
    defaultRowRatios: [0.5, 0.5],
};

const DOOR_DRAFT = {
    id: 'dt-solid-timber',
    name: 'Solid Timber (Default)',
    frameFinish: { name: 'Timber Frame', materialId: 'wood-oak', materialColor: '#c8a96e' },
    leafFinish: { name: 'Timber Leaf', materialId: 'wood-oak', materialColor: '#c8a96e' },
    glazingOpacity: 1,
};

describe('§OPENING-SHOWROOM-PREVIEW — the subject does not invent dimensions (L-127)', () => {
    it("the window subject's extent IS resolveWindowDimensions' answer", () => {
        const d = resolveWindowDimensions({ systemTypeId: WINDOW_DRAFT.id, windowType: 'single' });
        const s = buildWindowPreviewSubject(WINDOW_DRAFT);
        // Width includes the sill overhang, height is the structural opening.
        expect(s.extent[0]).toBeCloseTo(d.width + 2 * d.sillOverhang, 6);
        expect(s.extent[1]).toBeCloseTo(d.height, 6);
    });

    it("the door subject's extent IS resolveDoorDimensions' answer", () => {
        const d = resolveDoorDimensions(DOOR_DRAFT.id, 'single');
        const s = buildDoorPreviewSubject(DOOR_DRAFT);
        expect(s.extent[0]).toBeCloseTo(d.width, 6);
        expect(s.extent[1]).toBeCloseTo(d.height, 6);
        expect(s.extent[2]).toBeCloseTo(d.frameDepth, 6);
    });

    it('the frame members are the RESOLVED frameThickness, not a literal', () => {
        const d = resolveWindowDimensions({ systemTypeId: WINDOW_DRAFT.id, windowType: 'single' });
        const head = buildWindowPreviewSubject(WINDOW_DRAFT).parts.find((p) => p.name === 'frame-head');
        expect(head).toBeDefined();
        expect(head!.size[1]).toBeCloseTo(d.frameThickness, 6);
        expect(head!.size[2]).toBeCloseTo(d.frameDepth, 6);
    });
});

describe('§OPENING-SHOWROOM-PREVIEW — every part NAMES a material (C100 §2.1)', () => {
    it('window: every opaque part carries a materialId that resolves against the master', () => {
        const parts = buildWindowPreviewSubject(WINDOW_DRAFT).parts;
        expect(parts.length).toBeGreaterThan(4);
        const unnamed = parts.filter((p) => !p.materialId).map((p) => p.name);
        expect(unnamed).toEqual([]);
        const dead = parts.filter((p) => !findMaterialById(p.materialId!)).map((p) => p.name);
        expect(dead).toEqual([]);
    });

    it('door: same, including the glazing', () => {
        const parts = buildDoorPreviewSubject({
            ...DOOR_DRAFT,
            defaultSegments: [
                { type: 'glass' as const, heightRatio: 0.5 },
                { type: 'panel' as const, heightRatio: 0.5 },
            ],
        }).parts;
        const dead = parts.filter((p) => !p.materialId || !findMaterialById(p.materialId)).map((p) => p.name);
        expect(dead).toEqual([]);
        expect(parts.some((p) => p.name.startsWith('leaf-glass'))).toBe(true);
    });

    it('a LEGACY finish (no id) carries its hex forward and is not silently dropped', () => {
        const s = buildWindowPreviewSubject({
            ...WINDOW_DRAFT,
            frameFinish: { name: 'Steel Frame', materialColor: '#444444' },
        });
        const head = s.parts.find((p) => p.name === 'frame-head')!;
        expect(head.materialId).toBeUndefined();
        // ⭐ The hex survives. The renderer uses it as the LEGACY cached colour
        // (C100 §2.1 step 2) rather than painting the part unresolved-magenta — a
        // finish that never had an id is not a finish whose id broke.
        expect(head.fallbackHex).toBe('#444444');
    });
});

describe('§OPENING-SHOWROOM-PREVIEW — subdivision comes from the TYPE', () => {
    it('2×2 Crittal produces four panes, one mullion and two transoms', () => {
        const parts = buildWindowPreviewSubject(WINDOW_DRAFT).parts;
        expect(parts.filter((p) => p.name.startsWith('glass-')).length).toBe(4);
        expect(parts.filter((p) => p.name.startsWith('mullion-')).length).toBe(1);
        expect(parts.filter((p) => p.name.startsWith('transom-')).length).toBe(2);
    });

    it('a single-pane type produces one pane and no dividers', () => {
        const parts = buildWindowPreviewSubject({
            ...WINDOW_DRAFT,
            defaultColumnRatios: [1],
            defaultRowRatios: [1],
        }).parts;
        expect(parts.filter((p) => p.name.startsWith('glass-')).length).toBe(1);
        expect(parts.filter((p) => p.name.startsWith('mullion-')).length).toBe(0);
    });

    it('a malformed ratio list degrades to one pane, never to NaN geometry', () => {
        const parts = buildWindowPreviewSubject({
            ...WINDOW_DRAFT,
            defaultColumnRatios: [0, -1, Number.NaN],
            defaultRowRatios: [],
        }).parts;
        expect(parts.filter((p) => p.name.startsWith('glass-')).length).toBe(1);
        for (const p of parts) {
            expect(Number.isFinite(p.size[0])).toBe(true);
            expect(Number.isFinite(p.size[1])).toBe(true);
            expect(Number.isFinite(p.center[1])).toBe(true);
        }
    });

    it("a door's sidelight widens the assembly, because it is a property of the TYPE", () => {
        const plain = buildDoorPreviewSubject(DOOR_DRAFT);
        const withSide = buildDoorPreviewSubject({
            ...DOOR_DRAFT,
            sidelight: { widthRatio: 0.35, glazingOpacity: 0 },
        });
        expect(withSide.extent[0]).toBeGreaterThan(plain.extent[0]);
        expect(withSide.parts.some((p) => p.name === 'sidelight-glass')).toBe(true);
    });
});

describe('§OPENING-SHOWROOM-PREVIEW — the render key gates the redraw (C04)', () => {
    it('is stable when nothing the IMAGE depends on changed', () => {
        const a = buildWindowPreviewSubject(WINDOW_DRAFT);
        const b = buildWindowPreviewSubject({ ...WINDOW_DRAFT, name: 'A completely different name' });
        // ⭐ Typing in the Name box must not re-render the scene. This is what makes
        // "it does not run when nothing is moving" a property of the code rather
        // than a claim in a comment.
        expect(b.key).toBe(a.key);
    });

    it('changes when the material changes', () => {
        const a = buildWindowPreviewSubject(WINDOW_DRAFT);
        const b = buildWindowPreviewSubject({
            ...WINDOW_DRAFT,
            frameFinish: { ...WINDOW_DRAFT.frameFinish, materialId: 'wood-oak' },
        });
        expect(b.key).not.toBe(a.key);
    });

    it('changes when an EDITABLE dimension changes — the key must not be a subset of its inputs', () => {
        // ⭐ L-7746 made the frame face, mullion, transom and sill projection editable in
        // the New Type dialog. The key listed only [width, height, frameDepth], so
        // dragging any of those sliders changed the GEOMETRY and not the KEY — the
        // showroom would have sat still while the numbers moved. A preview that lags
        // its own controls is worse than no preview.
        const base = buildWindowPreviewSubject(WINDOW_DRAFT);
        for (const [field, value] of [
            ['frameThickness', 0.09],
            ['columnDividerThickness', 0.11],
            ['rowDividerThickness', 0.11],
            ['sillDepth', 0.31],
        ] as const) {
            const moved = buildWindowPreviewSubject({
                ...WINDOW_DRAFT,
                dimensions: { [field]: value },
            });
            expect(moved.key, `key ignored ${field}`).not.toBe(base.key);
        }
    });

    it('changes when the subdivision changes', () => {
        const a = buildWindowPreviewSubject(WINDOW_DRAFT);
        const b = buildWindowPreviewSubject({ ...WINDOW_DRAFT, defaultColumnRatios: [1] });
        expect(b.key).not.toBe(a.key);
    });
});

describe('§OPENING-SHOWROOM-PREVIEW — the family dispatch REFUSES rather than guesses', () => {
    it('serves door and window', () => {
        expect(buildOpeningPreviewSubject('window', WINDOW_DRAFT)).not.toBeNull();
        expect(buildOpeningPreviewSubject('door', DOOR_DRAFT)).not.toBeNull();
    });

    it('returns null for a family with no showroom — never an empty stage', () => {
        // C65 §3.4: a blank 3-D box and "this type has no geometry" must not be the
        // same value. The caller renders NOTHING on null.
        expect(buildOpeningPreviewSubject('wall', {})).toBeNull();
        expect(buildOpeningPreviewSubject('lighting', {})).toBeNull();
    });
});
