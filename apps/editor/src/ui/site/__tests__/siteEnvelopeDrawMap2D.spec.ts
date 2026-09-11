// @vitest-environment happy-dom
//
// §ENVELOPE-DRAW C6 (lane ENVELOPE-DRAW-2, 2026-09-07) — THE 2D SITE MAP ADAPTER'S DOM HALF.
//
// PLAN-ENVELOPE-DRAW-ON-SITE-VIEWS §3b · L-13050 · L-69 · L-13045.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ WHAT THE STAND-IN MAP PROVES, AND WHAT IT CANNOT — STATED FIRST, BECAUSE THE TEMPTATION HERE
// IS EXACTLY [[fake-more-capable-than-real]]
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The stand-in below supplies `unproject` as a fixed linear map. That proves NOTHING about
// MapLibre's camera maths and is not offered as if it did — the real `unproject` is the map's own
// and is browser-only. What the stand-in DOES let this suite exercise is the half that is entirely
// this adapter's own and would otherwise have no test at all:
//
//   1. **The click is CONSUMED IN CAPTURE.** This is the whole L-69 argument. MapLibre synthesises
//      its `click` from the DOM event on this same container in the BUBBLE phase, so an event
//      stopped in capture never becomes a MapLibre click and `SiteBoundaryMap2D`'s single `onClick`
//      ladder is never reached. If a refactor drops `stopPropagation` or the `true` capture flag,
//      the parcel-select ladder starts eating draw clicks — the exact L-69 failure, and it is
//      INVISIBLE without an assertion because both handlers "work".
//   2. **A MOVE IS NOT CONSUMED.** Pan and the map's own hover cues die if it is.
//   3. **arm/disarm are symmetric.** L-7801: a listener that outlives its chrome keeps authoring.
//   4. **A REFUSAL CARRIES ITS REASON** (C16 CA-18) rather than a bare `false`.
//
// And the source-text arm pins the invariant no runtime assertion can reach: this file adds NO
// `map.on(` binding of any kind.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ENVELOPE_DRAW_LINE_LAYER,
    ENVELOPE_DRAW_LINE_SOURCE,
    ENVELOPE_DRAW_POINT_LAYER,
    ENVELOPE_DRAW_POINT_SOURCE,
    SiteEnvelopeDrawMap2D,
    type EnvelopeDrawMapLike,
} from '../siteEnvelopeDrawMap2D';
import type { EnvelopeDrawSink } from '../envelopeDrawSurface';

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

/** Source with comment lines removed — §RAF-GATE-COMMENT-BLIND: the header NAMES what it forbids. */
function codeOnly(src: string): string {
    return src
        .split(String.fromCharCode(10))
        .filter((l) => {
            const t = l.trimStart();
            return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
        })
        .join(String.fromCharCode(10));
}

const SOURCE = codeOnly(
    readFileSync(join(repoRoot, 'apps/editor/src/ui/site/siteEnvelopeDrawMap2D.ts'), 'utf8'),
);

const BCN = { lat: 41.3874, lon: 2.1686 };

interface Stand {
    map: EnvelopeDrawMapLike;
    container: HTMLElement;
    sources: Map<string, unknown>;
    layers: Set<string>;
    /** Simulate a basemap swap: `setStyle` destroys every source and layer. */
    swapStyle(): void;
}

function standIn(): Stand {
    const container = document.createElement('div');
    container.getBoundingClientRect = () => ({
        left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0,
        toJSON: () => ({}),
    }) as DOMRect;
    document.body.appendChild(container);
    const sources = new Map<string, unknown>();
    const layers = new Set<string>();
    const map: EnvelopeDrawMapLike = {
        getCanvasContainer: () => container,
        // ⚠ A FIXED LINEAR STAND-IN. It is NOT MapLibre's projection and proves nothing about it.
        unproject: ([x, y]) => ({ lng: BCN.lon + x * 1e-5, lat: BCN.lat - y * 1e-5 }),
        getSource: (id) => (sources.has(id)
            ? { setData: (d: unknown) => sources.set(id, d) }
            : undefined),
        addSource: (id, spec) => { sources.set(id, spec); },
        getLayer: (id) => (layers.has(id) ? {} : undefined),
        addLayer: (spec) => { layers.add((spec as { id: string }).id); },
    };
    return { map, container, sources, layers, swapStyle: () => { sources.clear(); layers.clear(); } };
}

function sinkSpy(): EnvelopeDrawSink & { calls: string[] } {
    const calls: string[] = [];
    return {
        calls,
        onPoint: (p) => calls.push(`point:${p.x.toFixed(2)},${p.z.toFixed(2)}`),
        onMove: (p) => calls.push(p === null ? 'move:null' : 'move'),
        onFinish: () => calls.push('finish'),
        onUndo: () => calls.push('undo'),
        onCancel: () => calls.push('cancel'),
    };
}

let stand: Stand;

beforeEach(() => { stand = standIn(); });
afterEach(() => { document.body.replaceChildren(); });

const live = (): SiteEnvelopeDrawMap2D => new SiteEnvelopeDrawMap2D({
    map: stand.map,
    getOrigin: () => BCN,
    getSiteLocation: () => ({ trueNorth: Math.PI / 4 }),
});

it('actually read the module — an unrunnable guard must fail, never skip (§L-851)', () => {
    expect(SOURCE.length).toBeGreaterThan(1_000);
    expect(SOURCE).toContain('export class SiteEnvelopeDrawMap2D');
});

describe('§ENVELOPE-DRAW C6 — ⛔ NO SECOND MAP-CLICK BINDING (L-69)', () => {
    it('binds no map INPUT event — the count `siteMap2DStyleV2.spec.ts` pins stays untouched', () => {
        // ⛔ THE INVARIANT IS THE BINDING, NOT THE FILE. `SiteBoundaryMap2D` holds exactly one
        // `map.on('click', onClick)` and L-69 records what a second one did: it consumed two
        // clicks as parcel vertices and in rectangle mode COMMITTED a boundary. An adapter that
        // reached for `map.on(...)` would reproduce that from a different file, where the existing
        // grep-based guard cannot see it.
        //
        // ⚠ AMENDED WITH §ENVELOPE-DRAW-LIVE-DIMS (L-13308) / §ENVELOPE-ROSTER-ONE-SOURCE (L-13309).
        // This arm used to forbid ANY `map.on(`. The adapter now listens to exactly two RENDER events:
        // `move` (the live dimension chips follow the camera — what MapLibre's own `Marker` listens
        // to) and `styledata` (the profile roster survives a basemap swap). Neither consumes an event
        // nor reaches a click ladder, so L-69 is untouched. What is pinned now is the NAME of every
        // map event bound here — so an INPUT binding, the thing L-69 is about, still fails this arm.
        const bound = [...SOURCE.matchAll(/\bmap\.on\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]).sort();
        expect(bound).toEqual(['move', 'styledata']);
        expect(SOURCE).not.toMatch(
            /\.on\(\s*['"](click|dblclick|mousedown|mouseup|mousemove|contextmenu|touchstart|touchend|keydown|keyup|wheel)['"]/,
        );
        // …and each render hook has its release (arm/disarm symmetry — L-7801 for a listener).
        expect(SOURCE).toMatch(/\bmap\.off\(\s*'move'/);
        expect(SOURCE).toMatch(/\bmap\.off\(\s*'styledata'/);
        // …and it does not disable panning either (plan §3b: click-to-place needs pan).
        expect(SOURCE).not.toMatch(/dragPan/);
    });
});

describe('§ENVELOPE-DRAW C6 — arm takes the click ladder in CAPTURE, and gives it back', () => {
    it('⭐ a click is CONSUMED (stopPropagation) and reaches the sink', () => {
        const a = live();
        const sink = sinkSpy();
        expect(a.arm(sink)).toBe(true);

        const ev = new MouseEvent('click', { clientX: 100, clientY: 80, bubbles: true, cancelable: true });
        const stop = vi.spyOn(ev, 'stopPropagation');
        stand.container.dispatchEvent(ev);

        expect(stop).toHaveBeenCalled();
        expect(sink.calls.filter((c) => c.startsWith('point:'))).toHaveLength(1);
    });

    it('⛔ a MOVE is NOT consumed — panning and the map’s own hover cues must survive the draw', () => {
        const a = live();
        const sink = sinkSpy();
        a.arm(sink);
        const ev = new MouseEvent('mousemove', { clientX: 10, clientY: 10, bubbles: true, cancelable: true });
        const stop = vi.spyOn(ev, 'stopPropagation');
        stand.container.dispatchEvent(ev);
        expect(stop).not.toHaveBeenCalled();
        expect(sink.calls).toContain('move');
    });

    it('double-click FINISHES and is consumed; Enter finishes, Backspace undoes, Esc cancels', () => {
        const a = live();
        const sink = sinkSpy();
        a.arm(sink);
        const dbl = new MouseEvent('dblclick', { clientX: 5, clientY: 5, bubbles: true, cancelable: true });
        const stop = vi.spyOn(dbl, 'stopPropagation');
        stand.container.dispatchEvent(dbl);
        expect(stop).toHaveBeenCalled();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace' }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(sink.calls).toEqual(['finish', 'finish', 'undo', 'cancel']);
    });

    it('⛔ DISARM gives the ladder back — a later click is neither consumed nor delivered (L-7801)', () => {
        const a = live();
        const sink = sinkSpy();
        a.arm(sink);
        a.disarm();
        const ev = new MouseEvent('click', { clientX: 100, clientY: 80, bubbles: true, cancelable: true });
        const stop = vi.spyOn(ev, 'stopPropagation');
        stand.container.dispatchEvent(ev);
        expect(stop).not.toHaveBeenCalled();
        expect(sink.calls).toHaveLength(0);
        // …and Escape no longer reaches a dead gesture either.
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(sink.calls).toHaveLength(0);
    });

    it('disarm is IDEMPOTENT — a surface disposing twice must not throw into its teardown', () => {
        const a = live();
        a.arm(sinkSpy());
        a.disarm();
        expect(() => a.disarm()).not.toThrow();
    });
});

describe('§ENVELOPE-DRAW C6 — a refusal carries its reason (C16 CA-18)', () => {
    it('⛔ with NO frame origin it refuses to arm AND says what to do next', () => {
        const a = new SiteEnvelopeDrawMap2D({
            map: stand.map,
            getOrigin: () => null,
            getSiteLocation: () => ({ trueNorth: 0 }),
        });
        expect(a.arm(sinkSpy())).toBe(false);
        const why = a.cannotArmReason();
        expect(why).not.toBeNull();
        expect(why).toContain('2D Site Map');
        expect(why).toContain('ORIGIN');
        expect(why).toContain('Search for the address');
    });

    it('⛔ an unreachable site store refuses — θ-could-not-be-read is NOT θ = 0 (§L-446)', () => {
        const a = new SiteEnvelopeDrawMap2D({
            map: stand.map,
            getOrigin: () => BCN,
            getSiteLocation: () => null,
        });
        expect(a.arm(sinkSpy())).toBe(false);
        expect(a.cannotArmReason()).toContain('wrong BEARING');
    });

    it('a resolvable frame reports NO reason — the refusal channel must not cry wolf', () => {
        expect(live().cannotArmReason()).toBeNull();
    });
});

describe('§ENVELOPE-DRAW C6 — the preview survives a basemap swap', () => {
    it('installs both sources and both layers on arm', () => {
        live().arm(sinkSpy());
        expect(stand.sources.has(ENVELOPE_DRAW_LINE_SOURCE)).toBe(true);
        expect(stand.sources.has(ENVELOPE_DRAW_POINT_SOURCE)).toBe(true);
        expect(stand.layers.has(ENVELOPE_DRAW_LINE_LAYER)).toBe(true);
        expect(stand.layers.has(ENVELOPE_DRAW_POINT_LAYER)).toBe(true);
    });

    it('⭐ re-installs them after a style swap — cream ⇄ satellite destroys every source', () => {
        const a = live();
        a.arm(sinkSpy());
        // The founder toggles the basemap mid-draw. `setStyle` takes the sources with it.
        stand.swapStyle();
        expect(stand.sources.has(ENVELOPE_DRAW_LINE_SOURCE)).toBe(false);
        a.drawPreview([{ x: 0, z: 0 }, { x: 10, z: 0 }], [{ x: 10, z: 10 }], true);
        // A preview installed once at construction would be gone for the rest of the session,
        // with nothing in the log — the tool would simply look broken.
        expect(stand.sources.has(ENVELOPE_DRAW_LINE_SOURCE)).toBe(true);
        expect(stand.layers.has(ENVELOPE_DRAW_LINE_LAYER)).toBe(true);
    });

    it('drawPreview before arm is a NO-OP, not a throw — there is no frame to project about', () => {
        const a = live();
        expect(() => a.drawPreview([{ x: 0, z: 0 }], [], false)).not.toThrow();
        expect(stand.sources.has(ENVELOPE_DRAW_LINE_SOURCE)).toBe(false);
    });
});
