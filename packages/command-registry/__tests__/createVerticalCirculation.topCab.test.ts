// §RESI-LIFT-TOP-CAB regression — the residential multi-family lift loop must
// serve EVERY residential level INCLUDING the top floor.
//
// The residential generator (ResidentialBuildingExecutor `_createCore`) emits one
// lift cab per ADJACENT level pair: base = floor i, top = floor i+1. The TOP floor
// has no level above it, so its cab is a DEGENERATE single-floor span where
// base === top. CommandManager.execute() runs command.canExecute() BEFORE
// command.execute(), and previously canExecute() rejected base === top as a hard
// blocking issue — silently dropping the top-floor cab (founder: "the lift is not
// present on the top floor"). canExecute() must now ACCEPT the degenerate cab so
// the full N-level loop is served. A genuinely MISSING top level still blocks.
//
// This is a DATA/VALIDATION test (no THREE) — it drives canExecute() directly,
// which is the exact gate the CommandManager consults before executing.

import { describe, it, expect } from 'vitest';
import {
    CreateVerticalCirculationCommand,
    type CreateVerticalCirculationInput,
} from '../src/verticalCirculation/CreateVerticalCirculationCommand';
import type { CommandContext } from '../src/types';

/** Minimal CommandContext — canExecute only reads projectContext + stores. */
function makeCtx(activeLevelId = 'L0'): CommandContext {
    return {
        projectContext: { activeLevelId },
        stores: {
            // A bare liftStore is enough: canExecute only needs it to be present
            // and to answer getLiftConnectingLevels (duplicate warning, non-blocking).
            liftStore: { getLiftConnectingLevels: () => undefined },
        },
    } as unknown as CommandContext;
}

/** Mirror of the executor's per-pair cab input for an N-level core. */
function cabInput(baseLevelId: string, topLevelId: string): CreateVerticalCirculationInput {
    return {
        baseLevelId,
        topLevelId,
        kind: 'passenger',
        origin: { x: 0, y: 0, z: 0 },
        shaftWidth: 1.8,
        shaftDepth: 1.8,
    };
}

describe('CreateVerticalCirculationCommand.canExecute — §RESI-LIFT-TOP-CAB', () => {
    it('accepts an inter-floor cab (base ≠ top)', () => {
        const cmd = new CreateVerticalCirculationCommand(cabInput('L0', 'L1'));
        expect(cmd.canExecute(makeCtx()).ok).toBe(true);
    });

    it('accepts the DEGENERATE top-floor cab (base === top) with a warning, not a block', () => {
        const cmd = new CreateVerticalCirculationCommand(cabInput('L5', 'L5'));
        const res = cmd.canExecute(makeCtx());
        expect(res.ok).toBe(true);
        expect(res.warnings?.some((w) => /single-floor/i.test(w))).toBe(true);
    });

    it('still BLOCKS a cab with a missing top level', () => {
        const cmd = new CreateVerticalCirculationCommand(cabInput('L0', ''));
        const res = cmd.canExecute(makeCtx());
        expect(res.ok).toBe(false);
        expect(res.reason).toMatch(/top level/i);
    });

    it('an N-level building has the lift served on ALL N levels (incl. the top)', () => {
        // Build the exact loop the executor runs: idx 0..topIndex inclusive, where
        // the top index passes base === top (no level above). N = 6 levels (L0..L5),
        // matching the founder log L0→L1 … L4→L5 + the missing top cab.
        const N = 6;
        const levels = Array.from({ length: N }, (_, i) => `L${i}`);
        const topIndex = N - 1;

        const servedLevels = new Set<string>();
        for (let idx = 0; idx <= topIndex; idx++) {
            const fromLevelId = levels[idx]!;
            const toLevelId = levels[idx + 1] ?? fromLevelId; // top floor → degenerate cab
            const cmd = new CreateVerticalCirculationCommand(cabInput(fromLevelId, toLevelId));
            const res = cmd.canExecute(makeCtx());
            expect(res.ok).toBe(true); // EVERY cab, including the top, must validate
            // A cab serves its base floor's volume (resolveSpan anchors at origin.y =
            // base elevation), so the base level of each accepted cab is "served".
            servedLevels.add(fromLevelId);
        }

        // All N residential levels — crucially the TOP (L5) — are served.
        expect(servedLevels.size).toBe(N);
        for (const lvl of levels) expect(servedLevels.has(lvl)).toBe(true);
        expect(servedLevels.has('L5')).toBe(true); // the previously-dropped top cab
    });
});
