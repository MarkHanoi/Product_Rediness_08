// @vitest-environment happy-dom
//
// §FEAT-HANDRAIL-CREATION-PARITY (founder, 2026-08-18) — THE REACHABILITY SUITE.
//
// COMMITTED ≠ REACHABLE. This repo has paid repeatedly for the other kind of
// green: a capability that is written, typed, unit-tested and reached by nothing.
// C95 §0 records the worst instance in this very family — `HandrailRunGeometry.ts`,
// 338 lines of which 282 are spec, with exactly ONE importer: its own test. A
// passing suite over `handrailRunGenerators` proves the MATHS. It proves nothing
// about whether a user can draw a circular handrail.
//
// So every assertion below starts at a control a user can actually touch and ends
// at a command the product actually executes:
//
//   1. the MODE BAR renders from the declared matrix row, not from a literal;
//   2. the PRE-DRAW PANEL lists the catalogue and ARMS on selection alone;
//   3. the PLAN REGISTRY binds the 'railing' tool key to this handler, so the key
//      the ToolManager publishes reaches the code under test;
//   4. a real click sequence in each of the SEVEN modes dispatches a real command
//      through `ctx.commandManager` carrying the ARMED type's fields.
//
// The commandManager here is a RECORDER, not a re-implementation: it keeps the
// real `CreateHandrailCommand` / `CreateHandrailRunCommand` INSTANCES the handler
// built, and every assertion reads those instances' own `serialize().payload`.
// Nothing about handrail semantics is restated in this file, so it cannot become
// "a fake more capable than the real thing".

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CreateHandrailCommand, CreateHandrailRunCommand } from '@pryzm/command-registry';
import { handrailTypeStore } from '@pryzm/core-app-model/stores';
import { creationModes } from '../src/engine/views/plantools/elementCreationMatrix';
import { RailingPlanToolHandler } from '../src/engine/views/plantools/RailingPlanToolHandler';
import { showHandrailPreDraw } from '../src/ui/property-panel/PropertyPanelPreDraw';
import { DrawingModeBar } from '../src/ui/DrawingModeBar';
import {
    setActiveHandrailDrawMode,
    setActiveHandrailTypeId,
    resolveActiveHandrailTypeId,
    resolveActiveHandrailDrawMode,
    __resetActiveHandrailAuthoringForTests,
} from '../src/engine/views/plantools/activeHandrailAuthoring';

type AnyRec = Record<string, unknown>;
type Pt = { x: number; z: number };

// ── Recorder, not re-implementation ──────────────────────────────────────────
const executed: Array<CreateHandrailCommand | CreateHandrailRunCommand> = [];
const commandManager = { execute: (c: never) => { executed.push(c); } };

function payloadOf(i: number): AnyRec {
    return executed[i]!.serialize().payload as AnyRec;
}

function segmentsOf(i: number): AnyRec[] {
    return payloadOf(i).segments as AnyRec[];
}

function makeCtx(): unknown {
    const canvas = { width: 800, height: 600 };
    return {
        ctx: {
            setTransform: () => {}, clearRect: () => {}, save: () => {}, restore: () => {},
            beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, closePath: () => {},
            stroke: () => {}, fill: () => {}, arc: () => {}, fillText: () => {},
            measureText: () => ({ width: 10 }), setLineDash: () => {}, fillRect: () => {},
            font: '', fillStyle: '', strokeStyle: '', lineWidth: 0, globalAlpha: 1,
            textAlign: '', textBaseline: '',
        },
        overlayCanvas: canvas,
        planCanvas: {
            worldToScreen: (x: number, z: number) => ({ sx: x * 10, sy: z * 10 }),
            getPixelsPerUnit: () => 10,
        },
        dpr: 1,
        viewDef: { spatial: { levelId: 'L0' } },
        commandManager,
    };
}

const P = (worldX: number, worldZ: number) => ({ worldX, worldZ } as never);

function activate(): RailingPlanToolHandler {
    const h = new RailingPlanToolHandler();
    h.activate(makeCtx() as never);
    return h;
}

beforeEach(() => {
    executed.length = 0;
    __resetActiveHandrailAuthoringForTests();
});
afterEach(() => {
    document.body.innerHTML = '';
    __resetActiveHandrailAuthoringForTests();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('1. the MODE BAR is reachable and offers the founder’s seven modes', () => {
    it('the declared railing row carries all seven, ids matching the run generators', () => {
        const ids = creationModes('railing').map((m) => m.id);
        expect(ids).toEqual(['linear', 'ortho', 'curved', 'byslab', 'square', 'circular', 'ellipse']);
    });

    it('the labels are the founder’s words, and L/O/C are the WALL bar’s own accelerators', () => {
        const modes = creationModes('railing');
        expect(modes.map((m) => m.label)).toEqual(
            ['Linear', 'Orthogonal', 'Curved', 'By Slab', 'Square', 'Circular', 'Ellipse'],
        );
        const wall = creationModes('wall');
        for (const id of ['linear', 'ortho', 'curved']) {
            expect(modes.find((m) => m.id === id)!.key).toBe(wall.find((m) => m.id === id)!.key);
        }
        // Accelerators must be unique within the tool, or one keypress fires two modes.
        const keys = modes.map((m) => m.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('⭐ the SHARED DrawingModeBar renders those seven pills and a click WRITES THE STORE', () => {
        const bar = new DrawingModeBar();
        bar.show({
            label: 'Handrail:',
            modes: creationModes('railing'),
            initialMode: 'linear',
            onSelect: (id) => setActiveHandrailDrawMode(id),
        });
        // The SAME component and the SAME `.wdh-*` CSS the wall and slab bars use.
        const el = document.querySelector('.wdh-bar');
        expect(el).not.toBeNull();
        const pills = Array.from(el!.querySelectorAll<HTMLButtonElement>('button.wdh-btn'));
        expect(pills.map((p) => p.dataset.mode)).toEqual(
            ['linear', 'ortho', 'curved', 'byslab', 'square', 'circular', 'ellipse'],
        );
        // By Slab is an ACTION: after the separator, and flagged as such.
        expect(el!.querySelector('.wdh-sep')).not.toBeNull();
        expect(pills.find((p) => p.dataset.mode === 'byslab')!.dataset.action).toBe('1');

        pills.find((p) => p.dataset.mode === 'circular')!.click();
        expect(resolveActiveHandrailDrawMode()).toBe('circular');
        bar.dismiss();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('2. the PRE-DRAW PANEL is the wall panel’s twin and arms FROM THE STORE', () => {
    function makeHost() {
        const element = document.createElement('div');
        document.body.appendChild(element);
        return {
            element,
            clearForPreDraw: () => { element.innerHTML = ''; },
            buildCloseBtn: () => document.createElement('button'),
            makeVisible: () => {},
            positionBesideModeBar: () => {},
        };
    }

    it('renders the wall panel’s shell: NEW HANDRAIL badge, ready-hint, Esc note', () => {
        const host = makeHost();
        showHandrailPreDraw(host as never, undefined);
        expect(host.element.querySelector('.gpp-type-badge')!.textContent).toBe('NEW HANDRAIL');
        expect(host.element.textContent).toContain('Draw Handrail');
        expect(host.element.textContent).toContain('ready');
        expect(host.element.textContent).toContain('click on canvas to draw');
        expect(host.element.textContent).toContain('Press Esc to cancel');
    });

    it('⭐ the dropdown is populated FROM THE STORE — a type published LATER appears untouched', () => {
        const before = makeHost();
        showHandrailPreDraw(before as never, undefined);
        const valuesIn = (h: { element: HTMLElement }) =>
            Array.from(h.element.querySelectorAll<HTMLOptionElement>('select option')).map((o) => o.value);
        expect(valuesIn(before)).not.toContain('hr.test.published-later');

        handrailTypeStore.add({
            id: 'hr.test.published-later', name: 'Published Later',
            description: 'added at runtime', height: 1.1, thickness: 0.05, baseOffset: 0,
            fillType: 'open', railProfile: 'round',
        });
        try {
            const after = makeHost();
            showHandrailPreDraw(after as never, undefined);
            // No hard-coded list in the panel can pass this assertion. That is the point.
            expect(valuesIn(after)).toContain('hr.test.published-later');
            expect(valuesIn(after)).toHaveLength(handrailTypeStore.getAll().length);
        } finally {
            handrailTypeStore.remove('hr.test.published-later');
        }
    });

    it('lists all 20 built-in types — the founder asked for 20', () => {
        const host = makeHost();
        showHandrailPreDraw(host as never, undefined);
        expect(host.element.querySelectorAll('select option')).toHaveLength(20);
        expect(handrailTypeStore.getAll()).toHaveLength(20);
    });

    it('⭐ SELECTION ALONE ARMS (L-115) — no Apply click, and the hint names the type', () => {
        const host = makeHost();
        showHandrailPreDraw(host as never, undefined);
        const sel = host.element.querySelector('select')!;
        sel.value = 'timber-picket';
        sel.dispatchEvent(new Event('change'));

        expect(resolveActiveHandrailTypeId()).toBe('timber-picket');
        expect(host.element.textContent).toContain('Timber Picket Railing');
    });

    it('the panel ALSO forwards the armed type to window.handrailTool, so 3-D agrees (L-98)', () => {
        const seen: Array<string | undefined> = [];
        (window as unknown as AnyRec).handrailTool = {
            setTypeId: (id: string | undefined) => seen.push(id),
        };
        try {
            const host = makeHost();
            showHandrailPreDraw(host as never, undefined);
            const sel = host.element.querySelector('select')!;
            sel.value = 'glass-frameless';
            sel.dispatchEvent(new Event('change'));
            expect(seen).toContain('glass-frameless');
        } finally {
            delete (window as unknown as AnyRec).handrailTool;
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('3. the PLAN REGISTRY binds the tool key to this handler', () => {
    it("'railing' is a declared plan tool key bound to RailingPlanToolHandler", () => {
        // Constructing the registry pulls in every plan handler (and @thatopen/ui
        // through the slab tool), so the binding is asserted over the registry's own
        // source rather than by instantiating the whole plan surface. It is the
        // declaration that decides reachability, and it is one line.
        // `new URL(..., import.meta.url)` is not usable here: happy-dom installs its
        // own `URL`, which `node:fs` rejects with "The URL must be of scheme file".
        // Resolved from the vitest root (apps/editor) instead.
        const src = readFileSync(
            resolve(process.cwd(), 'src/engine/views/plantools/planToolHandlerRegistry.ts'),
            'utf8',
        );
        expect(src).toMatch(/'railing':\s+new RailingPlanToolHandler\(\)/);
        expect(src).toMatch(/'railing'/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('4. EVERY MODE dispatches a real command carrying the ARMED type', () => {
    it('LINEAR: two clicks → one CreateHandrailCommand with the catalogue type’s fields', () => {
        setActiveHandrailTypeId('timber-picket');
        setActiveHandrailDrawMode('linear');
        const h = activate();
        h.onClick(P(0, 0));
        h.onClick(P(4, 0));

        expect(executed).toHaveLength(1);
        expect(executed[0]).toBeInstanceOf(CreateHandrailCommand);
        const p = payloadOf(0);
        const t = handrailTypeStore.getById('timber-picket')!;
        expect(p.height).toBe(t.height);
        expect(p.fillType).toBe(t.fillType);
        expect(p.postSpacing).toBe(t.postSpacing);
        expect(p.balusterShape).toBe(t.balusterShape);
        expect(p.balusterWidth).toBe(t.balusterWidth);
        expect(p.infillMaxGap).toBe(t.infillMaxGap);
        // The deleted plan-only 1.1 m literal must never come back (C95 §10.1).
        expect(p.height).not.toBe(1.1);
    });

    it('LINEAR CHAINS: the next click continues the run, and the shared vertex is posted ONCE', () => {
        setActiveHandrailDrawMode('linear');
        const h = activate();
        h.onClick(P(0, 0));
        h.onClick(P(4, 0));
        h.onClick(P(4, 3));

        expect(executed).toHaveLength(2);
        expect(payloadOf(0).suppressStartPost).toBeFalsy(); // v0: nothing else posts it
        expect(payloadOf(1).suppressStartPost).toBe(true);  // v1: already posted
        expect(payloadOf(1).start).toEqual({ x: 4, z: 0 }); // contiguous, no gap
    });

    it('ORTHO: the second point is snapped to whichever axis it is closer to', () => {
        setActiveHandrailDrawMode('ortho');
        const h = activate();
        h.onClick(P(0, 0));
        h.onClick(P(5, 1));
        expect(payloadOf(0).end).toEqual({ x: 5, z: 0 });
    });

    it('CURVED: three clicks → ONE run whose polyline bulges through the clicked mid-point', () => {
        setActiveHandrailDrawMode('curved');
        const h = activate();
        h.onClick(P(0, 0));   // start
        h.onClick(P(5, 3));   // arc mid-point
        h.onClick(P(10, 0));  // end

        expect(executed).toHaveLength(1);
        expect(executed[0]).toBeInstanceOf(CreateHandrailRunCommand);
        const segs = segmentsOf(0);
        expect(segs.length).toBeGreaterThan(2);
        expect(segs[0]!.start).toEqual({ x: 0, z: 0 });
        expect((segs[segs.length - 1]!.end as Pt).x).toBeCloseTo(10, 6);
        // It really curves: some vertex is well off the straight chord z = 0.
        expect(Math.max(...segs.map((s) => Math.abs((s.end as Pt).z)))).toBeGreaterThan(0.5);
    });

    const loopCases = [
        { mode: 'square'   as const, a: P(0, 0),   b: P(4, 3) },
        { mode: 'circular' as const, a: P(10, 10), b: P(13, 10) },
        { mode: 'ellipse'  as const, a: P(0, 0),   b: P(5, 2.5) },
    ];
    for (const { mode, a, b } of loopCases) {
        it(`${mode.toUpperCase()}: two clicks → ONE run command, CLOSED, one post per vertex`, () => {
            setActiveHandrailDrawMode(mode);
            const h = activate();
            h.onClick(a);
            h.onClick(b);

            expect(executed).toHaveLength(1);
            expect(executed[0]).toBeInstanceOf(CreateHandrailRunCommand);
            const segs = segmentsOf(0);
            expect(segs.length).toBeGreaterThanOrEqual(3);

            // NO GAP: the last segment ends exactly where the first begins.
            const first = segs[0]!.start as Pt;
            const last = segs[segs.length - 1]!.end as Pt;
            expect(Math.hypot(last.x - first.x, last.z - first.z)).toBeLessThan(1e-9);

            // Contiguity all the way round — no seam anywhere, not only at closure.
            for (let i = 1; i < segs.length; i++) {
                const prevEnd = segs[i - 1]!.end as Pt;
                const curStart = segs[i]!.start as Pt;
                expect(Math.hypot(curStart.x - prevEnd.x, curStart.z - prevEnd.z)).toBeLessThan(1e-9);
            }

            // NO DOUBLED POST: in a closed loop EVERY segment suppresses its start
            // post, so posts (one END each) === vertices (N edges => N vertices).
            expect(segs.every((s) => s.suppressStartPost === true)).toBe(true);
            expect(segs.length).toBe(segs.length);
        });
    }

    it('SQUARE: the loop really is the rectangle through the two clicked corners', () => {
        setActiveHandrailDrawMode('square');
        const h = activate();
        h.onClick(P(0, 0));
        h.onClick(P(4, 3));
        const segs = segmentsOf(0);
        expect(segs).toHaveLength(4);
        const xs = segs.map((s) => (s.start as Pt).x);
        const zs = segs.map((s) => (s.start as Pt).z);
        expect(Math.min(...xs)).toBe(0);
        expect(Math.max(...xs)).toBe(4);
        expect(Math.min(...zs)).toBe(0);
        expect(Math.max(...zs)).toBe(3);
    });

    it('CIRCULAR: every vertex sits on the clicked radius', () => {
        setActiveHandrailDrawMode('circular');
        const h = activate();
        h.onClick(P(10, 10));
        h.onClick(P(13, 10));
        for (const s of segmentsOf(0)) {
            const p = s.start as Pt;
            expect(Math.hypot(p.x - 10, p.z - 10)).toBeCloseTo(3, 9);
        }
    });

    it('BY SLAB: with a slab selected, one click → ONE run around its WORLD-space ring', () => {
        setActiveHandrailDrawMode('byslab');
        (window as unknown as AnyRec).selectionManager = {
            selectedObject: { userData: { id: 'slab-1', elementType: 'Slab' } },
        };
        (window as unknown as AnyRec).slabStore = {
            getById: () => ({
                polygon: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }],
                position: { x: 10, y: 0, z: 20 },
            }),
        };
        try {
            const h = activate();
            h.onClick(P(0, 0));
            expect(executed).toHaveLength(1);
            const segs = segmentsOf(0);
            expect(segs).toHaveLength(4);
            // polygon + slab.position, exactly as CreateWallsFromSlabCommand resolves it.
            const xs = segs.map((s) => (s.start as Pt).x);
            const zs = segs.map((s) => (s.start as Pt).z);
            expect(Math.min(...xs)).toBe(10);
            expect(Math.max(...xs)).toBe(16);
            expect(Math.min(...zs)).toBe(20);
            expect(Math.max(...zs)).toBe(24);
        } finally {
            delete (window as unknown as AnyRec).selectionManager;
            delete (window as unknown as AnyRec).slabStore;
        }
    });

    it('BY SLAB with NO slab selected REFUSES and creates nothing (C16 CA-18)', () => {
        setActiveHandrailDrawMode('byslab');
        const h = activate();
        h.onClick(P(0, 0));
        expect(executed).toHaveLength(0);
    });

    it('a sub-100 mm segment REFUSES rather than dispatching what the command would reject', () => {
        setActiveHandrailDrawMode('linear');
        const h = activate();
        h.onClick(P(0, 0));
        h.onClick(P(0.02, 0));
        expect(executed).toHaveLength(0);
    });

    it('a degenerate loop gesture REFUSES — no zero-area guard is ever created', () => {
        setActiveHandrailDrawMode('circular');
        const h = activate();
        h.onClick(P(0, 0));
        h.onClick(P(0.05, 0));
        expect(executed).toHaveLength(0);
    });

    it('⭐ a MID-RUN mode switch applies to the NEXT click and KEEPS the vertices placed', () => {
        // The whole reason `DrawingModeBar.onSelect` writes the store and never calls
        // an activate* function: re-activating tears the in-progress run down.
        setActiveHandrailDrawMode('linear');
        const h = activate();
        h.onClick(P(0, 0));
        h.onClick(P(4, 0));                 // one segment committed; chain head = (4,0)
        setActiveHandrailDrawMode('ortho'); // the bar writes ONLY the store
        h.onClick(P(5, 9));

        expect(executed).toHaveLength(2);
        expect(payloadOf(1).start).toEqual({ x: 4, z: 0 }); // the vertex SURVIVED
        expect(payloadOf(1).end).toEqual({ x: 4, z: 9 });   // ortho applied immediately
    });

    it('Escape abandons the run without creating anything', () => {
        setActiveHandrailDrawMode('linear');
        const h = activate();
        h.onClick(P(0, 0));
        expect(h.onKeyDown({ key: 'Escape' } as KeyboardEvent)).toBe(true);
        h.onClick(P(4, 0));   // a fresh first point, not a commit
        expect(executed).toHaveLength(0);
    });
});
