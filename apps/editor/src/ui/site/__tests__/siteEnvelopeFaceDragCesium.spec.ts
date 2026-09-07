// @vitest-environment happy-dom
//
// §ENVELOPE-FACE-DRAG-ON-SITE-VIEWS (lane FACE-DRAG-2, 2026-09-07) — THE 3D SITE ADAPTER'S
// FOUR DRAG PORTS, tested exactly as far as they can honestly be tested and no further.
//
// L-13045 · L-13065 · C114 §10 · ADR-0380 D4 · P2 · P6 · C84 EI-9.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ WHAT THIS FILE DELIBERATELY DOES NOT DO — STATED FIRST, BECAUSE THE TEMPTATION HERE IS
// EXACTLY [[fake-more-capable-than-real]]
// ══════════════════════════════════════════════════════════════════════════════════════════════
// NO FAKE VIEWER IS BUILT. `rayInSceneFrame` runs `camera.getPickRay`, an ENU matrix inversion and
// two vector transforms; a stand-in that supplied identity matrices and a straight-down ray would
// return a ray that looked right and would prove NOTHING about Cesium's camera maths — a fake built
// from the header cannot falsify the header. The same is true of the draw half's
// `scene.pickPosition` / `globe.pick`, which need a real depth buffer and a real globe.
//
// So THE RAY IS NOT ASSERTED HERE, AND IT IS NOT ASSERTED ANYWHERE. It is the one half of this
// feature that requires the browser, and saying so is the whole point of splitting it from the
// pick: everything DOWNSTREAM of the ray is pure and IS proven, in
// `packages/geometry-space-envelope/__tests__/spaceEnvelopeFacePick.test.ts` (25 arms — grazing
// rays, a ray parallel to a face, a hit behind the origin, the nearest of two prisms, a room nested
// inside its level).
//
// ✅ WHAT THIS FILE DOES ESTABLISH:
//   1. The adapter SAYS why it cannot take a drag, in three distinguishable states, rather than
//      accepting a gesture that would do nothing (D7 was that defect pointed the other way).
//   2. The frame gate runs BEFORE any Cesium call — with no seated frame the pick answers `null`
//      and the Cesium namespace is never touched. That is the §L-430 rule made checkable: a pick
//      that guessed a frame would grab the wrong face and read as a sensitivity bug.
//   3. The preview and camera ports delegate to the injected functions, are inert when a host did
//      not wire them, and survive a throwing host — a preview that threw would kill the
//      `pointermove` listener mid-drag.
//   4. SOURCE-TEXT arms for the invariants no runtime assertion can reach without a browser: the
//      origin goes through `multiplyByPoint` and the direction through `multiplyByPointAsVector`
//      (mixing them points the ray at the centre of the Earth), θ is applied to BOTH through the
//      one shared `enuToSceneXZ`, the terrain seat is subtracted from the ORIGIN only, this file
//      imports NO THREE (P2), and it mints no per-face pickable geometry.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { SiteEnvelopeDrawCesium, type SiteEnvelopeDrawCesiumDeps } from '../siteEnvelopeDrawCesium';
import type { DraggableSpaceEnvelope } from '../../../engine/spaceEnvelopeDragSurface';

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

/** Source with comment lines removed — §RAF-GATE-COMMENT-BLIND: a header that QUOTES a forbidden
 *  literal must not be able to satisfy, or to break, an assertion about the code. */
function codeOnly(src: string): string {
    return src
        .split(String.fromCharCode(10))
        .filter((l) => {
            const t = l.trimStart();
            return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
        })
        .join(String.fromCharCode(10));
}

const SRC_PATH = join(repoRoot, 'apps/editor/src/ui/site/siteEnvelopeDrawCesium.ts');
const RAW = readFileSync(SRC_PATH, 'utf8');
const SOURCE = codeOnly(RAW);

/**
 * The SMALLEST viewer that is not a lie: a canvas and nothing else.
 *
 * ⛔ IT SUPPLIES NO CAMERA AND NO SCENE MATHS ON PURPOSE. Every arm below either stops before the
 * maths (the frame gate) or never reaches it (the preview and camera ports, which touch the
 * injected functions only). An arm that needed a camera would need a real one.
 */
function bareViewer(): { viewer: unknown; canvas: HTMLElement } {
    const canvas = document.createElement('canvas') as unknown as HTMLElement;
    return { viewer: { scene: { canvas } }, canvas };
}

/** A Cesium namespace that RECORDS being touched and answers nothing. Its whole job is to prove
 *  the frame gate short-circuits before it. */
function trapCesium(): { C: unknown; touched: string[] } {
    const touched: string[] = [];
    const trap = (name: string) => () => { touched.push(name); throw new Error(`Cesium.${name} was reached`); };
    return {
        touched,
        C: {
            Cartesian2: function Cartesian2() { touched.push('Cartesian2'); } as unknown,
            Cartesian3: { fromDegrees: trap('Cartesian3.fromDegrees') },
            Matrix4: {
                inverseTransformation: trap('Matrix4.inverseTransformation'),
                multiplyByPoint: trap('Matrix4.multiplyByPoint'),
                multiplyByPointAsVector: trap('Matrix4.multiplyByPointAsVector'),
            },
            Transforms: { eastNorthUpToFixedFrame: trap('Transforms.eastNorthUpToFixedFrame') },
        },
    };
}

const ROOM: DraggableSpaceEnvelope = {
    id: 'Kitchen',
    levelId: 'L0',
    role: 'room',
    footprint: [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }],
    baseOffset: 0,
    height: 3,
};

const SEATED_FRAME = { originLat: 41.3874, originLon: 2.1686, thetaRad: 0, baseHeightM: 12 };

function build(over: Partial<SiteEnvelopeDrawCesiumDeps> = {}): {
    surface: SiteEnvelopeDrawCesium;
    canvas: HTMLElement;
    touched: string[];
} {
    const { viewer, canvas } = bareViewer();
    const { C, touched } = trapCesium();
    const deps = {
        viewer,
        Cesium: C,
        getOrigin: () => ({ lat: SEATED_FRAME.originLat, lon: SEATED_FRAME.originLon }),
        getSiteLocation: () => ({ trueNorth: 0 }),
        ...over,
    } as unknown as SiteEnvelopeDrawCesiumDeps;
    return { surface: new SiteEnvelopeDrawCesium(deps), canvas, touched };
}

describe('⭐ the 3D Site SAYS why it cannot take a face drag, rather than swallowing the gesture', () => {
    it('names the UNWIRED state — a host that wired the draw but not the drag', () => {
        const { surface } = build();
        const reason = surface.cannotDragReason();
        expect(reason).toBeTruthy();
        // ⛔ It must not read as a failure of the drawing, which still works.
        expect(reason).toMatch(/still draw/i);
    });

    it('names the NOT-SEATED-YET state separately, and says it becomes editable', () => {
        const { surface } = build({
            getSceneFrame: () => null,
            getEnvelopes: () => [],
        });
        const reason = surface.cannotDragReason();
        expect(reason).toBeTruthy();
        expect(reason).toMatch(/site frame|renders/i);
        // ⛔ THE TWO STATES MUST NOT COLLAPSE INTO ONE SENTENCE. "we did not wire it" is permanent
        // for the session; "the site has not rendered yet" clears on its own. A user told the
        // wrong one either waits forever or gives up on something that was about to work.
        const unwired = build().surface.cannotDragReason();
        expect(reason).not.toBe(unwired);
    });

    it('answers NULL — a plain "yes, drag" — once both ports are wired and the frame is seated', () => {
        const { surface } = build({
            getSceneFrame: () => SEATED_FRAME,
            getEnvelopes: () => [ROOM],
        });
        expect(surface.cannotDragReason()).toBeNull();
    });

    it('names the TORN-DOWN state, and never claims a dead scene is draggable', () => {
        const { surface } = build({
            viewer: { isDestroyed: () => true, scene: { canvas: document.createElement('canvas') } },
            getSceneFrame: () => SEATED_FRAME,
            getEnvelopes: () => [ROOM],
        } as unknown as Partial<SiteEnvelopeDrawCesiumDeps>);
        expect(surface.cannotDragReason()).toMatch(/torn down/i);
    });

    it('`dragDomElement()` is the scene canvas — the element the gesture binds its listeners to', () => {
        const { surface, canvas } = build();
        expect(surface.dragDomElement()).toBe(canvas);
    });
});

describe('⛔ the FRAME GATE runs before any Cesium maths — §L-430', () => {
    it('with no seated frame the ray is NULL and the Cesium namespace is never touched', () => {
        const { surface, touched } = build({ getSceneFrame: () => null, getEnvelopes: () => [ROOM] });
        expect(surface.rayInSceneFrame({ clientX: 10, clientY: 10 })).toBeNull();
        // ⭐ THIS IS THE ASSERTION THAT MATTERS. A pick that fell through to a default origin would
        // return a plausible ray about the WRONG place on the Earth and would grab the wrong face —
        // and it would look like a sensitivity problem, not a frame bug.
        expect(touched).toEqual([]);
    });

    it('and the PICK stops there too — no frame, no pick, no maths', () => {
        const { surface, touched } = build({ getSceneFrame: () => null, getEnvelopes: () => [ROOM] });
        expect(surface.pickFace({ clientX: 10, clientY: 10 })).toBeNull();
        expect(touched).toEqual([]);
    });

    it('a host that wired NO envelope reader picks nothing rather than throwing', () => {
        const { surface } = build({ getSceneFrame: () => SEATED_FRAME });
        expect(surface.pickFace({ clientX: 10, clientY: 10 })).toBeNull();
    });

    it('⛔ a throwing viewer answers NULL, never an exception — the core HOLDS the face on null', () => {
        const { surface } = build({
            viewer: { get scene(): never { throw new Error('viewer mid-recreate'); } },
            getSceneFrame: () => SEATED_FRAME,
            getEnvelopes: () => [ROOM],
        } as unknown as Partial<SiteEnvelopeDrawCesiumDeps>);
        expect(() => surface.rayInSceneFrame({ clientX: 1, clientY: 1 })).not.toThrow();
        expect(surface.rayInSceneFrame({ clientX: 1, clientY: 1 })).toBeNull();
    });
});

describe('the PREVIEW and CAMERA ports delegate, stay inert unwired, and survive a throwing host', () => {
    it('previewDraw / previewRestore reach the injected viewport functions with the id and geometry', () => {
        const drawn: { id: string; height: number }[] = [];
        const cleared: string[] = [];
        const { surface } = build({
            setEnvelopePreview: (id, g) => { drawn.push({ id, height: g.height }); },
            clearEnvelopePreview: (id) => { cleared.push(id); },
        });
        surface.previewDraw({ ...ROOM, height: 4.5 });
        surface.previewRestore('Kitchen');
        expect(drawn).toEqual([{ id: 'Kitchen', height: 4.5 }]);
        expect(cleared).toEqual(['Kitchen']);
    });

    it('setCameraEnabled reaches `setNavigationEnabled` with BOTH values', () => {
        const seen: boolean[] = [];
        const { surface } = build({ setNavigationEnabled: (on) => { seen.push(on); } });
        surface.setCameraEnabled(false);
        surface.setCameraEnabled(true);
        // ⛔ The `true` is the one that matters: the core re-enables on release, on cancel AND on
        // its own disposer, so an interrupted gesture cannot leave the globe permanently frozen.
        expect(seen).toEqual([false, true]);
    });

    it('⛔ unwired ports are INERT, not throwing — a host may ship the draw without the drag', () => {
        const { surface } = build();
        expect(() => surface.previewDraw(ROOM)).not.toThrow();
        expect(() => surface.previewRestore('Kitchen')).not.toThrow();
        expect(() => surface.setCameraEnabled(false)).not.toThrow();
    });

    it('⛔ a THROWING host cannot kill the gesture mid-drag', () => {
        const boom = (): never => { throw new Error('viewport blew up'); };
        const { surface } = build({
            setEnvelopePreview: boom,
            clearEnvelopePreview: boom,
            setNavigationEnabled: boom,
        });
        // These run on every `pointermove`; an exception here would remove the listener's frame
        // and leave the face stuck under a pointer that is still moving.
        expect(() => surface.previewDraw(ROOM)).not.toThrow();
        expect(() => surface.previewRestore('Kitchen')).not.toThrow();
        expect(() => surface.setCameraEnabled(true)).not.toThrow();
    });
});

describe('SOURCE arms — the invariants no headless assertion can reach', () => {
    it('⛔ the ORIGIN goes through multiplyByPoint and the DIRECTION through multiplyByPointAsVector', () => {
        // The trap: `multiplyByPoint` applies the rotation AND the ENU origin's ~6,378 km
        // translation. A direction pushed through it points at the centre of the Earth — and the
        // resulting drag is smoothly, plausibly wrong.
        expect(SOURCE).toContain('multiplyByPointAsVector(inv, ray.direction');
        expect(SOURCE).toContain('multiplyByPoint(inv, ray.origin');
        expect(SOURCE).not.toContain('multiplyByPoint(inv, ray.direction');
    });

    it('⭐ θ is applied to BOTH origin and direction, through the ONE shared conversion', () => {
        // PLAN §R5's correction: both site rasterisers apply θ to a stored footprint, so the frame
        // a footprint lives in is the PROJECT frame. A conversion that skipped θ would round-trip
        // perfectly and still be wrong — the inverse of a missing rotation is a valid inverse.
        const enuCalls = SOURCE.match(/enuToSceneXZ\(/g) ?? [];
        expect(enuCalls.length).toBeGreaterThanOrEqual(2);
        expect(SOURCE).toContain('enuToSceneXZ(o.x, o.y, frame.thetaRad)');
        expect(SOURCE).toContain('enuToSceneXZ(d.x, d.y, frame.thetaRad)');
    });

    it('⛔ the terrain seat is subtracted from the ORIGIN only — an offset on a direction is a rotation', () => {
        expect(SOURCE).toContain('o.z - frame.baseHeightM');
        expect(SOURCE).not.toContain('d.z - frame.baseHeightM');
    });

    it('⛔ `inverseTransformation`, never a general matrix inverse', () => {
        // Exact for a RIGID transform, which is what `eastNorthUpToFixedFrame` returns.
        expect(SOURCE).toContain('Matrix4.inverseTransformation(');
        expect(SOURCE).not.toContain('Matrix4.inverse(');
    });

    it('⭐ ONE pick rule — the shared pure solver, and NO per-face pickable geometry is minted', () => {
        // L-13045 priced this port at n + 2 hit-testable primitives per envelope and made that the
        // dominant cost line of the feature. It is a ray/prism intersection instead, so
        // `renderSpaceEnvelopes` is unchanged and nothing exists that only the pick reads.
        expect(SOURCE).toContain('pickNearestSpaceEnvelopeFace(');
        expect(SOURCE).not.toMatch(/new\s+\w*\.?PolygonGeometry/);
        expect(SOURCE).not.toContain('faceEntities');
    });

    it('⛔ P2 — this adapter imports no THREE, in any spelling', () => {
        expect(RAW).not.toMatch(/from ['"]three['"]/);
        expect(RAW).not.toMatch(/import \* as THREE/);
        expect(RAW).not.toMatch(/@pryzm\/renderer-three/);
    });

    it('⛔ the pick is DEAF while a draw is armed — one canvas, two gestures, never both at once', () => {
        // Without it, a click placing a corner of a NEW perimeter on top of an EXISTING envelope
        // would also start a face drag on it.
        expect(SOURCE).toMatch(/pickFace\([\s\S]{0,400}?this\.sink !== null\) return null;/);
    });

    it('⛔ ONE Cesium adapter — the class implements BOTH ports (C84 EI-9)', () => {
        expect(SOURCE).toContain('implements EnvelopeDrawSurface, SpaceEnvelopeDragSurface');
    });
});
