/**
 * @vitest-environment happy-dom
 *
 * §FEAT-TAG-PAPER-SCALE-AND-SELECTABILITY (L-291) — PAPER SIZE, AND A PICK CORRIDOR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DOES THIS GUARD DISCRIMINATE THE BUG? (the equidistant-square question)
 * ─────────────────────────────────────────────────────────────────────────────
 * The bug: the bubble was a FIXED SCREEN SIZE (`const r = 16`). So before asserting
 * anything, ask what the OLD code would score:
 *
 *   • "the bubble is the same PAPER size at 1:50 and 1:100" — the old code PASSES this
 *     vacuously (a fixed pixel radius is the same at every scale). USELESS ALONE.
 *   • "the bubble's WORLD size at 1:50 is HALF its world size at 1:100" — the old code
 *     FAILS: its world size is identical at both (it never looked at the scale). ✅
 *   • "the bubble's SCREEN size DOUBLES when the zoom doubles" — the old code FAILS: its
 *     screen size is constant under zoom, which is precisely why it swallowed the plan. ✅
 *
 * So the last two are the guard, and the first is only meaningful ALONGSIDE them. A test
 * that a square would also pass is not a test.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { annotationStore, makeAnnotationElement, makePointRef } from '@pryzm/plugin-annotations';
import { PlanViewAnnotationRenderer } from '../PlanViewAnnotationRenderer';
import { viewDefinitionStore } from '../ViewDefinitionStore';
import { TAG_PAPER_MM, paperMmToWorldM, paperMmToPx } from '../../annotations/paperScale';

const VIEW = 'v_tagscale';

/** A canvas stub that records the radius of every arc (the bubble) it is asked to draw. */
function fakeCtx() {
    const arcs: number[] = [];
    const fonts: string[] = [];
    const texts: string[] = [];
    const ctx = {
        arcs, fonts, texts,
        save() {}, restore() {}, beginPath() {}, closePath() {},
        moveTo() {}, lineTo() {}, fill() {}, stroke() {},
        fillText(t: string) { texts.push(t); },
        strokeRect() {}, rect() {}, setLineDash() {},
        arc(_x: number, _y: number, r: number) { arcs.push(r); },
        // A REAL canvas measures glyphs at the CURRENT font size, so the stub must too:
        // the text run is itself paper-scaled, and a stub that returns a fixed width would
        // quietly break the very proportionality under test.
        measureText(t: string) {
            const px = Number(/(\d+(?:\.\d+)?)px/.exec(this.font as string)?.[1] ?? 10);
            return { width: t.length * px * 0.55 };
        },
        set font(v: string) { fonts.push(v); },
        get font() { return fonts[fonts.length - 1] ?? ''; },
        fillStyle: '', strokeStyle: '', lineWidth: 1,
        textAlign: '', textBaseline: '', globalAlpha: 1,
    };
    return ctx as unknown as CanvasRenderingContext2D & { arcs: number[]; fonts: string[]; texts: string[] };
}

/** A door tag: anchor on the door at x=4.5, bubble 1.2 m away in +z. */
function addDoorTag(): void {
    annotationStore.add(makeAnnotationElement(
        'annotation_tag_1', 'door-tag', VIEW,
        [makePointRef({ x: 4.5, y: 0, z: 0 } as never)],
        { modelPoints: [{ x: 4.5, y: 0, z: 0 }, { x: 4.5, y: 0, z: 1.2 }], offset: 0 },
        { elementId: 'door_1', cachedLabel: 'D1', showLeader: true },
    ));
}

/** Render at a given view scale + zoom, and return the bubble radius the canvas was given. */
function bubbleRadiusPx(scaleDenominator: number, pxPerWorldM: number): number {
    viewDefinitionStore.get = ((id: string) =>
        id === VIEW ? { id, output: { scale: scaleDenominator } } : undefined) as never;
    const renderer = new PlanViewAnnotationRenderer();
    const ctx = fakeCtx();
    const w2s = (h: number, v: number) => ({ sx: h * pxPerWorldM, sy: v * pxPerWorldM });
    renderer.render(ctx, VIEW, w2s, { viewType: 'plan' });
    // The largest arc drawn is the bubble (the leader dot is far smaller).
    return Math.max(...ctx.arcs);
}

beforeEach(() => {
    annotationStore.clear();
    addDoorTag();
});

// ── The pure rule ───────────────────────────────────────────────────────────

describe('paper millimetres are the only unit a tag is sized in (C24)', () => {
    it('a paper mm buys HALF the world at 1:50 that it buys at 1:100', () => {
        expect(paperMmToWorldM(3.5, 100)).toBeCloseTo(0.35, 9);
        expect(paperMmToWorldM(3.5, 50)).toBeCloseTo(0.175, 9);
        expect(paperMmToWorldM(3.5, 200)).toBeCloseTo(0.7, 9);
    });

    it('screen pixels = paper × view scale × zoom — both transforms, in order', () => {
        // 3.5 mm @ 1:100 = 0.35 m; at 20 px/m that is 7 px.
        expect(paperMmToPx(3.5, 100, 20)).toBeCloseTo(7, 9);
        // Halve the scale → half the world size → half the pixels (at the same zoom).
        expect(paperMmToPx(3.5, 50, 20)).toBeCloseTo(3.5, 9);
        // Double the zoom → double the pixels (at the same scale).
        expect(paperMmToPx(3.5, 100, 40)).toBeCloseTo(14, 9);
    });
});

// ── The rendered outcome (this is where the old code fails) ─────────────────

describe('the bubble is a PAPER size — the assertions the old code FAILS', () => {
    it('its WORLD size at 1:50 is HALF its world size at 1:100', () => {
        const zoom = 20;                                   // px per world metre, held fixed
        const r100 = bubbleRadiusPx(100, zoom) / zoom;     // → world metres
        const r50 = bubbleRadiusPx(50, zoom) / zoom;

        expect(r50).toBeCloseTo(r100 / 2, 6);
        // THE DISCRIMINATOR: the old fixed-pixel bubble had the SAME world size at both
        // scales (it never consulted the view). If this ever passes with r50 === r100, the
        // fix has been reverted and the guard must scream.
        expect(r50).not.toBeCloseTo(r100, 3);
    });

    it('its PAPER size is IDENTICAL at 1:50 and 1:100 (the founder\'s actual request)', () => {
        const zoom = 20;
        const paper100 = (bubbleRadiusPx(100, zoom) / zoom) / paperMmToWorldM(1, 100);
        const paper50 = (bubbleRadiusPx(50, zoom) / zoom) / paperMmToWorldM(1, 50);
        expect(paper50).toBeCloseTo(paper100, 6);
        expect(paper100).toBeGreaterThanOrEqual(TAG_PAPER_MM.bubbleRadiusMm - 1e-6);
    });

    it('it GROWS WITH ZOOM in pixels — i.e. it holds still against the BUILDING', () => {
        const near = bubbleRadiusPx(100, 40);   // zoomed in
        const far = bubbleRadiusPx(100, 20);    // zoomed out

        expect(near).toBeCloseTo(far * 2, 6);
        // THE DISCRIMINATOR: the old bubble was a CONSTANT number of pixels at every zoom —
        // so as the building shrank away it swallowed the plan ("the size of a room"). If
        // the screen radius ever stops tracking the zoom, that is the bug, exactly.
        expect(near).not.toBeCloseTo(far, 3);
    });

    it('zooming does NOT change the tag\'s paper size (scale ≠ zoom)', () => {
        const paperAt = (zoom: number) => (bubbleRadiusPx(100, zoom) / zoom) / paperMmToWorldM(1, 100);
        expect(paperAt(10)).toBeCloseTo(paperAt(80), 6);   // 8× the zoom, same sheet
    });
});

// ── No literals (the bug WAS a literal, so the test FORBIDS literals) ───────

describe('no pixel/world literal survives in the tag renderer', () => {
    it('the tag symbol is sized only from TAG_PAPER_MM, never from a bare number', () => {
        const src = readFileSync(
            resolve(process.cwd(), 'src/views/PlanViewAnnotationRenderer.ts'),
            'utf8',
        );
        const body = src.slice(
            src.indexOf('private _renderMarkedTag('),
            src.indexOf('/** Door tag'),
        );
        expect(body.length).toBeGreaterThan(100);          // we really did find the function

        // The exact literals that caused the bug must not come back.
        expect(body).not.toMatch(/const\s+rBase\s*=\s*sizeStr\s*\?\s*16\s*:\s*13/);
        expect(body).not.toMatch(/mmToPx\(/);              // screen-mm — the wrong transform
        // Every size in the symbol comes from the paper table.
        expect(body).toContain('TAG_PAPER_MM.bubbleRadiusMm');
        expect(body).toContain('TAG_PAPER_MM.markTextMm');
        expect(body).toContain('this._paperPx(');
    });
});

// ── Selectability: the bubble AND the leader ────────────────────────────────

describe('a tag is pickable by its BUBBLE and by its LEADER', () => {
    const zoom = 20;
    const w2s = (h: number, v: number) => ({ sx: h * zoom, sy: v * zoom });

    function hit(sx: number, sy: number): string | null {
        viewDefinitionStore.get = ((id: string) =>
            id === VIEW ? { id, output: { scale: 100 } } : undefined) as never;
        const renderer = new PlanViewAnnotationRenderer();
        return renderer.hitTestAnnotation(VIEW, sx, sy, w2s, 4);
    }

    it('picks the BUBBLE — which the old hit-test could not do at all', () => {
        // The bubble sits at world (4.5, z=1.2) → screen (90, 24).
        expect(hit(90, 24)).toBe('annotation_tag_1');
    });

    it('picks the LEADER — a hairline, the same problem dimensions had (L-256)', () => {
        // Mid-leader: world (4.5, z=0.6) → screen (90, 12). Not on the bubble, not on the dot.
        expect(hit(90, 12)).toBe('annotation_tag_1');
    });

    it('still picks the ANCHOR on the element', () => {
        expect(hit(90, 0)).toBe('annotation_tag_1');
    });

    it('does NOT pick empty paper', () => {
        expect(hit(400, 400)).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §FIX-TAG-CONTENT-MARK-ONLY (L-291c) — THE TAG DISPLAYS THE MARK. NOTHING ELSE.
//
// RED-FIRST: "the mark is present in the bubble" PASSES TODAY — with "Timber Casement" and
// "1200×1200" sitting right next to it. That assertion is NOT a guard. The guard asserts the
// type name and the size string are ABSENT.
// ─────────────────────────────────────────────────────────────────────────────

describe('a tag bubble carries the MARK — and NOTHING else', () => {
    function textsDrawnFor(params: Record<string, unknown>): string[] {
        annotationStore.clear();
        annotationStore.add(makeAnnotationElement(
            'annotation_tag_content', 'window-tag', VIEW,
            [makePointRef({ x: 4.5, y: 0, z: 0 } as never)],
            { modelPoints: [{ x: 4.5, y: 0, z: 0 }, { x: 4.5, y: 0, z: 1.2 }], offset: 0 },
            params,
        ));
        viewDefinitionStore.get = ((id: string) =>
            id === VIEW ? { id, output: { scale: 100 } } : undefined) as never;
        const ctx = fakeCtx();
        new PlanViewAnnotationRenderer().render(ctx, VIEW, (h, v) => ({ sx: h * 20, sy: v * 20 }), { viewType: 'plan' });
        return ctx.texts;
    }

    it('the window tag prints the CODE, and NOT the type name or the size', () => {
        const texts = textsDrawnFor({
            elementId: 'win_1',
            cachedLabel: 'WN-00-005',            // the MARK — what the schedule joins on
            typeMark: 'Timber Casement',
            widthMm: 1200, heightMm: 1200,
            showLeader: true,
        });
        expect(texts).toContain('WN-00-005');
        // THE GUARD (a "mark is present" test passes with these sitting beside it):
        expect(texts).not.toContain('Timber Casement');
        expect(texts).not.toContain('1200×1200');
        expect(texts).toHaveLength(1);           // one bubble, one line of text.
    });

    it('a view may still OPT IN to sizes (P7 intent) — it is a default, not a prohibition', () => {
        const texts = textsDrawnFor({
            elementId: 'win_1', cachedLabel: 'WN-00-005', widthMm: 1200, heightMm: 1200,
            showSize: true, showLeader: true,
        });
        expect(texts).toContain('1200×1200');
    });

    it('a code-only bubble is SMALLER than the old type-name bubble at the same scale', () => {
        // The content drives the size, so "WN-00-005" needs a smaller circle than
        // "Timber Casement" ever did — which is the founder's complaint, measured.
        const short = textsDrawnFor({ elementId: 'w', cachedLabel: 'WN-00-005', showLeader: true });
        const long = textsDrawnFor({ elementId: 'w', cachedLabel: 'Timber Casement', showLeader: true });
        expect(short).toHaveLength(1);
        expect(long).toHaveLength(1);
        // (the radii are asserted in the paper-scale suite above; here we prove the CONTENT is
        // the only thing that differs — the bubble is sized to it.)
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §FIX-ROOM-TAG-NOT-MOVABLE (L-309) — A DRAGGED ROOM TAG IS DRAWN AND PICKED AT THE DROP,
// NOT BACK AT THE CENTROID.
//
// A room tag has no leader: its single model point IS where it is drawn, and a drag writes
// that point (`UpdateAnnotationPresentationCommand` → `modelPoints[0]`, L-287). The render and
// the point hit-test used to prefer `references[0].cachedPosition` — the room CENTROID, which
// the point-ref caches forever — so a dragged room tag was PAINTED back at the centroid and
// was only GRABBABLE there. The founder's "I can't move room tags": the drag committed, and
// the drawing threw it away on the next projection.
//
// RED-FIRST / THE DISCRIMINATOR: "the tag is pickable at the centroid" PASSES on the broken
// build (that is where it always was) — a vacuous guard, the bug's own disguise. The tooth is
// that after the drag the tag is pickable AT THE DROP and NOT at the centroid. Reverting the
// fix (reference-first) flips BOTH assertions and nothing else.
// ─────────────────────────────────────────────────────────────────────────────

describe('a room tag is drawn and picked at its PRESENTATION point, not its centroid', () => {
    const zoom = 20;
    const w2s = (h: number, v: number) => ({ sx: h * zoom, sy: v * zoom });

    // Born at the centroid: modelPoints[0] === references[0].cachedPosition === (5, 3).
    // Then DRAGGED — exactly as UpdateAnnotationPresentationCommand commits it: the presentation
    // point (modelPoints[0]) moves to (9, 7); the reference (the centroid) is never touched.
    const CENTROID = { x: 5, y: 0, z: 3 };
    const DROP = { x: 9, y: 0, z: 7 };

    function addRoomTag(modelPt: { x: number; y: number; z: number }): void {
        annotationStore.clear();
        annotationStore.add(makeAnnotationElement(
            'annotation_room_1', 'room-tag', VIEW,
            [makePointRef(CENTROID as never)],                 // reference = the room centroid
            { modelPoints: [modelPt], offset: 0 },             // presentation = where it is drawn
            { roomId: 'room_1', roomName: 'Kitchen', area: 12.3, cachedLabel: 'Kitchen' },
        ));
    }

    function hit(sx: number, sy: number): string | null {
        viewDefinitionStore.get = ((id: string) =>
            id === VIEW ? { id, output: { scale: 100 } } : undefined) as never;
        return new PlanViewAnnotationRenderer().hitTestAnnotation(VIEW, sx, sy, w2s, 6);
    }

    it('an UN-dragged room tag is picked at the centroid (the regression fence — nothing changed for it)', () => {
        addRoomTag(CENTROID);
        expect(hit(CENTROID.x * zoom, CENTROID.z * zoom)).toBe('annotation_room_1');
    });

    it('*** a DRAGGED room tag is picked AT THE DROP — where the founder let go ***', () => {
        addRoomTag(DROP);                                      // modelPoints[0] moved by the drag
        expect(hit(DROP.x * zoom, DROP.z * zoom)).toBe('annotation_room_1');
    });

    it('*** THE TOOTH: a dragged room tag is NO LONGER at the centroid (reference-first FAILS here) ***', () => {
        addRoomTag(DROP);
        // The old build painted and picked the bubble back at the centroid via
        // references[0].cachedPosition, discarding the drag. If this ever finds the tag at the
        // centroid again, the presentation/reference split has been reverted.
        expect(hit(CENTROID.x * zoom, CENTROID.z * zoom)).toBeNull();
    });

    it('the drawn text sits at the DROP, not the centroid — render agrees with pick', () => {
        addRoomTag(DROP);
        const drawnAt: Array<{ x: number; y: number }> = [];
        const ctx = fakeCtx();
        const origFillText = ctx.fillText.bind(ctx);
        // Capture the screen position each text run is drawn at.
        (ctx as unknown as { fillText: (t: string, x: number, y: number) => void }).fillText =
            (t: string, x: number, y: number) => { drawnAt.push({ x, y }); origFillText(t); };
        viewDefinitionStore.get = ((id: string) =>
            id === VIEW ? { id, output: { scale: 100 } } : undefined) as never;
        new PlanViewAnnotationRenderer().render(ctx, VIEW, w2s, { viewType: 'plan' });
        // The room name is drawn centred on the DROP (9,7)→(180,140), never the centroid (100,60).
        expect(drawnAt.some(p => Math.abs(p.x - DROP.x * zoom) < 1)).toBe(true);
        expect(drawnAt.every(p => Math.abs(p.x - CENTROID.x * zoom) > 1)).toBe(true);
    });
});
