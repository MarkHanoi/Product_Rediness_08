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

import { describe, it, expect, beforeEach, vi } from 'vitest';
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

        expect(
            swallowing,
            `families that STRUCTURALLY cannot honour an activation mode: ${swallowing.join(', ')}`,
        ).toEqual([]);

        // The declared-but-unregistered set is NAMED, not silently skipped — otherwise a
        // tool could drop off `runtime.tools` entirely and this census would read green
        // because "it wasn't registered". `stair-path`'s modes are served by the `stair`
        // family; `grid` has never been wired (src/main.ts:513 — "one wireup away").
        expect(unregistered.sort()).toEqual(['grid', 'stair-path']);
    });
});
