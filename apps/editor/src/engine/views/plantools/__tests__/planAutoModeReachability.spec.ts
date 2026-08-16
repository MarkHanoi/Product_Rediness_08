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
 * `mountToolsArea` registers 21 activators with `runtime.tools`. Every creation
 * family forwards the activation mode — `(m?) => service.activateX(m)` — EXCEPT
 * `floor` and `ceiling`, whose activators were declared `() => service.activateX()`
 * and therefore SWALLOW the second argument of `runtime.tools.activate(family,
 * mode)`. The user picks Auto, the tool activates, the mode is gone, and the plan
 * handler stays in polygon mode: indistinguishable from "auto does not exist in
 * plan view".
 *
 * `floor:auto` / `ceiling:auto` are the pre-existing pseudo-family workaround and
 * ARE asserted here too — they are the control that proves the activation
 * ARGUMENT reaches the picker, isolating the fault to the dropped parameter.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountToolsArea } from '@app/ui/layout/ToolsAreaLayout';
import { FloorPlanToolHandler } from '../FloorPlanToolHandler';
import { CeilingPlanToolHandler } from '../CeilingPlanToolHandler';
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

    // ── THE CENSUS, AS AN ASSERTION ──────────────────────────────────────────
    //
    // Not a hand-counted comment: every registered creation family is driven with
    // a mode and the ones that swallow it are named in the failure message. This
    // is the instrument that says whether the seam is shared or family-specific.
    it('CENSUS: no registered creation family may swallow its activation mode', () => {
        const swallowed: string[] = [];
        // family → (mode we hand it, how to read back what the family stored)
        const probes: ReadonlyArray<[string, string, () => unknown]> = [
            ['floor',   'auto',      () => window.floorModePicker?.getActiveMode()],
            ['ceiling', 'auto',      () => window.ceilingModePicker?.getActiveMode()],
            ['floor',   'rectangle', () => window.floorModePicker?.getActiveMode()],
            ['ceiling', 'rectangle', () => window.ceilingModePicker?.getActiveMode()],
        ];
        for (const [family, mode, read] of probes) {
            const { tools } = mountForTest();
            tools.activate(family, mode);
            if (read() !== mode) swallowed.push(`${family}(${mode}) → ${String(read())}`);
        }
        expect(swallowed, `families that dropped the activation mode: ${swallowed.join(', ')}`).toEqual([]);
    });
});
