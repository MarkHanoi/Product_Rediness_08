/**
 * §FIX-AUTO-MODE-DROPPED-AT-ACTIVATION (L-918) — the founder: *"Auto mode is
 * unreachable in plan view."*
 *
 * WHAT THIS PINS, AND AT WHICH LAYER
 * ──────────────────────────────────
 * NOT a pure function's return value. The assertions below read the STORED tool
 * state that `FloorPlanToolHandler` / `CeilingPlanToolHandler` consult on every
 * click — `window.floorModePicker.getActiveMode()` / `window.ceilingModePicker
 * .getActiveMode()` — and then drive the handler's OWN click path and assert
 * which BRANCH it takes. A mode that survives in a variable but never reaches
 * the branch the click executes is still broken, so both layers are asserted.
 *
 * THE DEFECT
 * ──────────
 * `mountToolsArea` registers 21 activators with `runtime.tools`, each as its own
 * independent lambda. An activator declared `() => service.activateX()` SWALLOWS the
 * second argument of `runtime.tools.activate(family, mode)`: the user picks Auto, the
 * tool activates, the mode is gone, and the plan handler stays in polygon mode —
 * indistinguishable from "auto does not exist in plan view".
 *
 * IS THE SEAM SHARED? NO — and that is the load-bearing answer. Because each activator
 * declares its own arity there is no chokepoint, so this is N fixes rather than one, and
 * the census below is what keeps N honest. Censused from `ELEMENT_CREATION_MATRIX`,
 * N was THREE, not the two the founder's report pointed at:
 *
 *   floor    — declares 5 modes, activator was arity 0.  SHIPPED BROKEN.
 *   ceiling  — declares 5 modes, activator was arity 0.  SHIPPED BROKEN.
 *   room     — declares 3 modes, activator was arity 0.  LATENT (all three modes stay
 *              reachable via `room:level`, `room-bounding` and the 'P' shortcut), so it
 *              is NOT part of the founder's defect and must not be reported as one.
 *
 * `floor:auto` / `ceiling:auto` are the pre-existing pseudo-family workaround and ARE
 * asserted here too — they are the control that proves the activation ARGUMENT reaches
 * the picker, isolating the fault to the dropped parameter. They are also why the Create
 * palette could still reach Auto (`CreateRailPanel.ts:712,737` call the pseudo-families,
 * never `activate('floor','auto')`) while the generic seam was broken.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * ⭐ The architect pressing CONFIRM on the finish dialogue — and NOTHING else.
 *
 * `_resolveThenCommit` is the ONE commit chokepoint for every plan drawing mode, and it
 * routes through the shared finish modal (L-255). Standing in for that one human press is
 * the only way a test can reach `_dispatchCreate`; everything load-bearing to THIS lane —
 * which mode the click reads, which branch it takes, which polygon is derived, and what is
 * finally handed to the bus — stays real on the far side of it.
 *
 * The modal is handed back its OWN seeded params, so the record committed is the one the
 * resolver produced, not one this test invented.
 */
const modal = vi.hoisted(() => ({ shown: 0 }));
vi.mock('@app/ui/ElementCreationModal', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        getFloorFinishCreationModal: () => ({
            show: (o: { params: unknown; onConfirm: (p: unknown) => void }) => {
                modal.shown++;
                o.onConfirm(o.params);
            },
            dismiss: () => undefined,
        }),
    };
});

import { mountToolsArea } from '@app/ui/layout/ToolsAreaLayout';
import { FloorPlanToolHandler } from '../FloorPlanToolHandler';
import { CeilingPlanToolHandler } from '../CeilingPlanToolHandler';
import { ELEMENT_CREATION_MATRIX } from '../elementCreationMatrix';
import type { WorldPoint } from '../PlanToolHandler';

/**
 * A faithful stand-in for `buildToolsStub()` in `composeRuntime.ts` — same
 * `register` / `activate(id, mode?)` contract, verbatim forwarding. The CALLER
 * side is deliberately not the subject: what is under test is whether the
 * activator that `mountToolsArea` registers USES the mode it is handed.
 */
function makeToolsSlot() {
    const activators = new Map<string, (mode?: string) => void>();
    return {
        activeToolId: null as string | null,
        register(family: string, activator: (mode?: string) => void): void {
            activators.set(family, activator);
        },
        activate(id: string, mode?: string): void {
            activators.get(id)?.(mode);
        },
        deactivate(): void { /* not exercised */ },
        subscribe(): { dispose: () => void } { return { dispose: () => undefined }; },
        /** Test-only introspection — how many families were registered, and which. */
        __families(): string[] { return [...activators.keys()]; },
        __has(family: string): boolean { return activators.has(family); },
        /**
         * The declared parameter count of the registered activator. An activator
         * written `() => …` reports 0 and therefore CANNOT honour a mode whatever is
         * passed to it — that is a structural fact, not a behavioural guess, which is
         * why the census keys on it.
         *
         * `Function.length` is exact here: TypeScript's optional marker is erased at
         * transform, so `(m?) => …` is plain `(m) => …` in the function this map holds
         * and reports 1. (It would under-report only for a default or rest parameter,
         * and `mountToolsArea` registers neither — asserted below by the fact that the
         * twelve forwarding families all read 1.)
         */
        __arity(family: string): number {
            const fn = activators.get(family);
            return fn ? fn.length : -1;
        },
    };
}

function mountForTest() {
    const service: Record<string, (...a: unknown[]) => unknown> = {
        activateWallTool:      vi.fn(),
        switchWallDrawingMode: vi.fn(),
        activateFloorTool:     vi.fn(),
        activateCeilingTool:   vi.fn(),
        activateSlabTool:      vi.fn(),
        activateRoofTool:      vi.fn(),
        activateStairPathTool: vi.fn(),
        activateHandrailTool:  vi.fn(),
        activatePlumbingTool:  vi.fn(),
    };
    const props: Record<string, unknown> = {
        toolManager:      {},
        inspector:        {},
        selectionManager: { selectedObject: null },
        wallTool:         {},
        slabTool:         {},
        bimManager:       {},
    };
    const tools = makeToolsSlot();
    const runtime = { tools } as unknown as Parameters<typeof mountToolsArea>[2];

    const pickers = mountToolsArea(
        props as unknown as Parameters<typeof mountToolsArea>[0],
        service as unknown as Parameters<typeof mountToolsArea>[1],
        runtime,
    );
    return { pickers, tools, service };
}

const PT = { worldX: 3, worldZ: 4 } as WorldPoint;

describe('§FIX-AUTO-MODE-DROPPED-AT-ACTIVATION (L-918) — AUTO must survive tool activation into plan view', () => {
    beforeEach(() => {
        // Each mount installs fresh pickers on `window`; clear so a stale one from
        // a previous case cannot answer for this one.
        delete (window as unknown as Record<string, unknown>).floorModePicker;
        delete (window as unknown as Record<string, unknown>).ceilingModePicker;
    });

    // ── CONTROL — the pseudo-family workaround already works ─────────────────
    it('CONTROL: `floor:auto` reaches the picker the plan handler reads', () => {
        const { tools } = mountForTest();
        tools.activate('floor:auto');
        expect(window.floorModePicker?.getActiveMode()).toBe('auto');
    });

    it('CONTROL: `ceiling:auto` reaches the picker the plan handler reads', () => {
        const { tools } = mountForTest();
        tools.activate('ceiling:auto');
        expect(window.ceilingModePicker?.getActiveMode()).toBe('auto');
    });

    // ── THE DEFECT — the mode ARGUMENT is dropped at activation ──────────────
    it('STORED STATE: runtime.tools.activate("floor", "auto") must leave the picker in AUTO', () => {
        const { tools } = mountForTest();
        tools.activate('floor', 'auto');
        expect(window.floorModePicker?.getActiveMode()).toBe('auto');
    });

    it('STORED STATE: runtime.tools.activate("ceiling", "auto") must leave the picker in AUTO', () => {
        const { tools } = mountForTest();
        tools.activate('ceiling', 'auto');
        expect(window.ceilingModePicker?.getActiveMode()).toBe('auto');
    });

    it('STORED STATE: a non-auto mode argument survives too (rectangle is not a special case)', () => {
        const { tools } = mountForTest();
        tools.activate('floor', 'rectangle');
        expect(window.floorModePicker?.getActiveMode()).toBe('rectangle');
    });

    // ── THE LAYER THE USER EXPERIENCES — which branch the plan CLICK takes ───
    it('COMMIT PATH: after activate("floor","auto") a plan click takes the AUTO-from-room branch, not vertex-add', () => {
        const { tools } = mountForTest();
        tools.activate('floor', 'auto');

        const h = new FloorPlanToolHandler();
        const commitFromRoom = vi.fn();
        (h as unknown as Record<string, unknown>)._commitFromRoomAt = commitFromRoom;
        h.onClick(PT);

        // AUTO commits from the room under the cursor on ONE click and adds no vertex.
        expect(commitFromRoom).toHaveBeenCalledTimes(1);
        expect((h as unknown as { _points: unknown[] })._points).toHaveLength(0);
    });

    it('COMMIT PATH: after activate("ceiling","auto") a plan click takes the AUTO-from-room branch, not vertex-add', () => {
        const { tools } = mountForTest();
        tools.activate('ceiling', 'auto');

        const h = new CeilingPlanToolHandler();
        const commitFromRoom = vi.fn();
        (h as unknown as Record<string, unknown>)._commitFromRoomAt = commitFromRoom;
        h.onClick(PT);

        expect(commitFromRoom).toHaveBeenCalledTimes(1);
        expect((h as unknown as { _points: unknown[] })._points).toHaveLength(0);
    });

    // ── THE GUARD THAT COMES WITH THE WIDENING ───────────────────────────────
    //
    // Forwarding the caller's string means an unrecognised one could be stored and
    // then silently miss every handler comparison — the same silent-wrong shape
    // this fix removes. It must refuse, and the refusal must carry identity and
    // BOTH values: what was asked for, and what the tool is actually left in.
    it('REFUSAL: an undeclared mode is refused loudly and leaves the stored mode untouched', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { tools } = mountForTest();
        tools.activate('floor', 'auto');            // known-good state first
        tools.activate('floor', 'not-a-real-mode'); // then the undeclared one

        expect(window.floorModePicker?.getActiveMode()).toBe('auto');

        const said = warn.mock.calls.map(c => String(c[0])).join('\n');
        expect(said).toContain('ToolsAreaLayout');    // identity
        expect(said).toContain('not-a-real-mode');    // what was asked for
        expect(said).toContain('stays in "auto"');    // what it is actually left in
        warn.mockRestore();
    });

    // ── THE BEHAVIOURAL PROBE — the two families whose mode is READABLE ───────
    //
    // Only floor and ceiling publish their stored mode (`window.<x>ModePicker`), so
    // only they can be checked by reading back what the activation actually stored.
    // This is a PROBE over two families, NOT a census — see the census below, which
    // is what the seam question is actually answered by.
    it('READ-BACK: floor + ceiling store every mode handed to them', () => {
        const dropped: string[] = [];
        const probes: ReadonlyArray<[string, string, () => unknown]> = [
            ['floor',   'auto',      () => window.floorModePicker?.getActiveMode()],
            ['ceiling', 'auto',      () => window.ceilingModePicker?.getActiveMode()],
            ['floor',   'rectangle', () => window.floorModePicker?.getActiveMode()],
            ['ceiling', 'rectangle', () => window.ceilingModePicker?.getActiveMode()],
        ];
        for (const [family, mode, read] of probes) {
            const { tools } = mountForTest();
            tools.activate(family, mode);
            if (read() !== mode) dropped.push(`${family}(${mode}) → ${String(read())}`);
        }
        expect(dropped, `families that dropped the activation mode: ${dropped.join(', ')}`).toEqual([]);
    });

    // ── THE CENSUS, DRIVEN FROM THE DECLARED AUTHORITY ───────────────────────
    //
    // ⚠ THE PREVIOUS "CENSUS" HERE WAS THE FOUR-ROW PROBE ABOVE, RELABELLED. It drove
    // floor and ceiling and nothing else, so it could only ever confirm the conclusion
    // it had been written from — and it MISSED a third family (`room`) that swallows its
    // mode in exactly the same way. A census that enumerates the hand-picked answer is
    // not a census.
    //
    // THE SEAM QUESTION THIS ANSWERS: is the drop a SHARED chokepoint or per-family?
    // `mountToolsArea` registers each activator as its own independent lambda, so each
    // one declares its own arity and there is NO chokepoint to fix once — the honest
    // answer is N fixes, not one. This test is therefore the only thing standing between
    // that N and silent growth, so it enumerates from `ELEMENT_CREATION_MATRIX` (the
    // declared capability table `DrawingModeBar` is already driven from) rather than
    // from a list maintained here.
    //
    // ARITY is the instrument, deliberately: an activator declared `() => …` CANNOT
    // honour a mode no matter what is passed. That is a structural fact about the
    // registered function, not a behavioural guess, and it is readable for families
    // whose mode is stored somewhere this test cannot see.
    it('CENSUS: every tool the matrix declares with 2+ modes registers an activator that ACCEPTS a mode', () => {
        const { tools } = mountForTest();
        const registered = new Set(tools.__families());

        const swallowing: string[] = [];
        const unregistered: string[] = [];
        for (const cap of ELEMENT_CREATION_MATRIX) {
            if (cap.modes.length < 2) continue;              // single-mode tools have nothing to carry
            if (!registered.has(cap.tool)) { unregistered.push(cap.tool); continue; }
            if (tools.__arity(cap.tool) < 1) {
                swallowing.push(`${cap.tool} (declares ${cap.modes.length} modes, activator arity 0)`);
            }
        }

        // ⭐ SWALLOWING IS A NAMED SET, NOT ZERO — and the change is a REAL FINDING
        // arriving with a measurable consequence, exactly as `railing` did below.
        //
        // This read `.toEqual([])` and was true only because `grid` was UNREGISTERED,
        // so the census skipped it at the `registered.has()` guard one line up and the
        // arity check never ran. §FIX-DECLARED-TOOL-WITH-NO-ACTIVATOR then registered
        // it — genuine progress: `runtime.tools.activate('grid')` used to arm NOTHING
        // and report success — but registered it as `() => { void tm.activateGrid?.(); }`,
        // arity 0. Grid did not get worse; it moved from one honest gap to a smaller one,
        // and the census correctly refuses to call that zero.
        //
        // ⛔ AND IT IS DELIBERATELY NOT "FIXED" BY WIDENING THE ACTIVATOR. MEASURED:
        // the matrix declares grid's modes as `single` / `rectangular` / `radial`
        // (elementCreationMatrix.ts:856-861), while the live picker the plan handler
        // actually reads — `gridModePicker` (GridModePicker.ts, read at
        // GridPlanToolHandler.ts:210 and :437) — knows only `orthogonal` and `linear`.
        // The two vocabularies are DISJOINT. Giving the activator an arity-1 signature
        // that forwards `'rectangular'` into a picker with no such mode would make
        // `activate('grid','rectangular')` report success and set nothing: a control
        // that claims a capability the pipeline cannot serve (C84 EI-3), which is the
        // precise defect this whole suite exists to prevent, committed in the act of
        // silencing the test that found it.
        //
        // So the honest state is recorded: grid declares three modes NO surface can
        // honour, and closing it means deciding which vocabulary is authoritative —
        // a design call on the grid family, not a census repair. Exact equality keeps
        // the teeth: a SECOND family that starts swallowing fails here, and so does
        // fixing grid, which forces this list to move with the code.
        expect(
            swallowing.sort(),
            `families that STRUCTURALLY cannot honour an activation mode: ${swallowing.join(', ')}`,
        ).toEqual(['grid (declares 3 modes, activator arity 0)']);

        // The declared-but-unregistered set is NAMED, not silently skipped — otherwise a
        // tool could drop off `runtime.tools` entirely and this census would read green
        // because "it wasn't registered".
        //
        // ⚠ THIS LIST READ `['grid', 'railing', 'stair-path']` AND HAS MOVED IN BOTH
        // DIRECTIONS AT ONCE — which is the strongest argument for spelling it out
        // rather than counting it. MEASURED:
        //
        //   · ALL THREE OLD ENTRIES ARE NOW REGISTERED. §FIX-DECLARED-TOOL-WITH-NO-
        //     ACTIVATOR wired them (`ToolsAreaLayout.ts:355` stair-path, `:356` grid,
        //     `:243` railing — the last under BOTH spellings, `handrail` and
        //     `railing`, which closes the two-keys finding this comment used to
        //     record). `stair-path` and `railing` take a mode (arity 1); `grid` does
        //     not, which is why it moved into the SWALLOWING set above rather than
        //     out of this census altogether.
        //
        //   · THREE NEW ENTRIES APPEARED, and they are the same shape `railing` was:
        //     `balcony`, `boundary-line` and `pool` are real, reachable tools — all
        //     three are in `planToolHandlerRegistry` (`:147`, `:152`, `:166`), so BOTH
        //     plan surfaces have them (the L-73 parity guarantee) — and all three
        //     declare 2+ modes in the matrix. What they do NOT have is a
        //     `runtime.tools.register` line anywhere (checked in `ToolsAreaLayout.ts`
        //     AND `PluginRegistry.ts`, the other production registrar), so
        //     `runtime.tools.activate('pool', 'circular')` arms nothing and reports
        //     success. All three are PLAN-ONLY rows, which is consistent with their
        //     having been wired on the plan side and only there.
        //
        // ⛔ THE FIX IS NOT TO REGISTER THEM FROM THIS TEST'S POINT OF VIEW — it is a
        // wiring change on the tools surface, owned by the lane that owns that surface.
        // Naming them keeps this census honest in the meantime: exact equality means a
        // FOURTH family going unregistered fails here, and so does wiring any of these
        // three, which forces the list to move with the code.
        expect(unregistered.sort()).toEqual(['balcony', 'boundary-line', 'pool']);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// ⭐ THE REACHABILITY PROOF
// ═════════════════════════════════════════════════════════════════════════════
//
// Everything above stops at the STORED mode or at WHICH BRANCH the click takes, and the
// branch cases reach that verdict by stubbing `_commitFromRoomAt`. That is one layer short
// of the claim this row exists to make. A mode can be stored correctly, be read correctly,
// select the right branch — and still commit nothing, or commit the wrong geometry, because
// the branch it selected is itself inert. "Committed ≠ reachable" applies to the fix as
// much as to the feature.
//
// So this block removes the stub and runs the REAL path:
//
//   runtime.tools.activate('floor','auto')        ← the user's selection
//     → floorModePicker.setActiveMode('auto')     ← the STORED tool state
//     → FloorPlanToolHandler._currentMode()       ← what the commit path READS
//     → onClick → _commitFromRoomAt → _resolveThenCommit → _dispatchCreate
//     → window.runtime.bus.executeCommand('floor.create', …)   ← THE COMMITTED RECORD
//
// The assertion is on that dispatched payload — a value that leaves the handler entirely —
// and specifically on its POLYGON, because the room boundary is obtainable ONLY from the
// AUTO branch. A commit carrying the room's ring cannot have come from vertex-add.
describe('§FIX-AUTO-MODE-DROPPED-AT-ACTIVATION (L-918) — ⭐ the mode reaches the COMMITTED record', () => {
    // A 4×3 room. The click lands inside it; no vertex the user could have drawn in ONE
    // click could produce this ring, which is what makes the polygon a mode fingerprint.
    const ROOM_POLY = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }];
    const INSIDE = { worldX: 2, worldZ: 1.5 } as WorldPoint;

    type Dispatched = { cmd: string; payload: Record<string, unknown> };

    function installStoresAndBus(): Dispatched[] {
        const dispatched: Dispatched[] = [];
        const w = window as unknown as Record<string, unknown>;
        w.runtime = {
            bus: {
                // Returns undefined deliberately: `_dispatchCreate` does
                // `executeCommand(…)?.then(…)`, so the optional call short-circuits and the
                // post-commit sketch bridge stays out of this proof's blast radius.
                executeCommand: (cmd: string, payload: Record<string, unknown>) => {
                    dispatched.push({ cmd, payload });
                    return undefined;
                },
            },
        };
        w.roomStore = {
            getAll: () => [{
                id: 'room_1',
                levelId: 'lvl0',
                boundary: { polygon: ROOM_POLY },
                // Present and non-null, so `determineBoundingWalls` reports DETERMINED and
                // `attributeFinishRegion` attributes rather than taking the honest-refusal
                // arm — which would abort the commit for a reason unrelated to the mode.
                boundingWallIds: ['w1', 'w2', 'w3', 'w4'],
            }],
        };
        // `window.wallStore` is deliberately LEFT ABSENT: `_innerFacePolygon` then returns
        // the centreline unchanged, so the committed ring is EXACTLY the room boundary and
        // the assertion needs no inner-face arithmetic of its own to compare against.
        delete w.wallStore;
        return dispatched;
    }

    /** A Canvas2D surface with no drawing behaviour — the handler only clears through it. */
    function makeCtx(): unknown {
        const noop = () => undefined;
        const c2d = {
            setTransform: noop, clearRect: noop, beginPath: noop, moveTo: noop, lineTo: noop,
            closePath: noop, stroke: noop, fill: noop, arc: noop, save: noop, restore: noop,
            fillText: noop, setLineDash: noop, rect: noop,
        };
        return {
            overlayCanvas: { width: 800, height: 600 },
            baseCanvas:    { width: 800, height: 600 },
            ctx:           c2d,
            planCanvas:    { worldToScreen: () => ({ x: 0, y: 0 }), getPixelsPerUnit: () => 10 },
            interaction:   {},
            viewDef:       { id: 'view_plan_GF', spatial: { levelId: 'lvl0' } },
            dpr:           1,
            viewPlane:     {},
        };
    }

    beforeEach(() => {
        modal.shown = 0;
        const w = window as unknown as Record<string, unknown>;
        delete w.floorModePicker;
        delete w.ceilingModePicker;
        if (!globalThis.crypto?.randomUUID) {
            (globalThis as unknown as { crypto: { randomUUID: () => string } }).crypto = {
                randomUUID: () => '00000000-0000-4000-8000-000000000000',
            };
        }
    });

    afterEach(() => {
        const w = window as unknown as Record<string, unknown>;
        delete w.runtime;
        delete w.roomStore;
    });

    it('COMMITTED RECORD: one plan click after activate("floor","auto") dispatches floor.create carrying the ROOM boundary', () => {
        const { tools } = mountForTest();
        const dispatched = installStoresAndBus();

        tools.activate('floor', 'auto');                       // the user's selection
        expect(window.floorModePicker?.getActiveMode()).toBe('auto');   // the STORED state

        const h = new FloorPlanToolHandler();
        h.activate(makeCtx() as Parameters<FloorPlanToolHandler['activate']>[0]);
        h.onClick(INSIDE);                                     // ONE click

        expect(modal.shown, 'the shared finish modal must be the commit chokepoint').toBe(1);

        const creates = dispatched.filter(d => d.cmd === 'floor.create');
        expect(creates, 'exactly one floor.create per gesture (C16: one gesture = one undo entry)')
            .toHaveLength(1);

        const payload = creates[0].payload;
        // THE FINGERPRINT — the ring the AUTO branch derived from the clicked room.
        expect(payload.polygon).toEqual(ROOM_POLY);
        expect(payload.levelId).toBe('lvl0');
        expect(payload.hostRoomId).toBe('room_1');
        // And the record is COMPLETE: the four fields the plan path used to drop (L-255)
        // resolved to finite numbers, so this is a committed floor, not a husk.
        expect(Number.isFinite(payload.baseOffset as number)).toBe(true);
        expect(Number.isFinite(payload.thickness as number)).toBe(true);
    });

    // ── THE DIFFERENTIATOR ───────────────────────────────────────────────────
    //
    // Without this the test above would pass even if the handler committed from the room on
    // EVERY mode — which would make it blind to the very substitution the defect performed
    // (auto silently becoming linear). This drives the identical gesture in the mode the
    // dropped-argument bug used to leave the tool in, and requires the opposite outcome.
    it('DIFFERENTIATOR: the identical single click in LINEAR commits NOTHING — it only adds a vertex', () => {
        const { tools } = mountForTest();
        const dispatched = installStoresAndBus();

        tools.activate('floor', 'linear');
        expect(window.floorModePicker?.getActiveMode()).toBe('linear');

        const h = new FloorPlanToolHandler();
        h.activate(makeCtx() as Parameters<FloorPlanToolHandler['activate']>[0]);
        h.onClick(INSIDE);

        expect(dispatched.filter(d => d.cmd === 'floor.create')).toHaveLength(0);
        expect(modal.shown).toBe(0);
        expect((h as unknown as { _points: unknown[] })._points).toHaveLength(1);
    });
});
