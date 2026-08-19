/**
 * @vitest-environment happy-dom
 */
// clashRegistrationOnComposedBus — L-1199 / L-1280 (§GE-06-ROOF-WALL-WIRE).
//
// ─── WHY THIS FILE EXISTS: THE EXISTING SUITE COULD NEVER HAVE FAILED ────────
//
// `RoofWallClashVerbReach.test.ts` calls `registerClashRun` fourteen times and
// passes. Production logs, on the SAME commit:
//
//     GE-06: registerClashRun failed (non-fatal) — clash-run falls back to
//            REFUSING: i.has is not a function
//     GE-06: registerClashRefusalHandlers failed (non-fatal): i.has is not a
//            function
//
// Both statements are true, and that is the whole defect. The existing suite
// passes a `new CommandBus(...)`. `engineLauncher.ts:712` passes
// `runtime.bus` — the NARROW composed slot built as an object literal at
// `composeRuntime.ts:1611`, which forwards `executeCommand` / `dispatch` /
// `register` / `registry` / … and **has no `has`**. `ClashHandlerRegistrar`
// requires `has(type)`, so both calls throw on their first line and the
// twelve clash verbs end the boot with NO handler at all — not refusing, as
// the catch block's message claims, but absent, which is the thrown
// "no handler registered for: clash-run" the capability module was written to
// retire.
//
// The suite was not weak. It was measuring a DIFFERENT OBJECT than the one
// production passes — the amendment register's **shape D**: a check that runs,
// passes, and could never have failed. `engineLauncher` erases the type with
// `runtime.bus as any` (line 528), so the compiler could not catch it either.
//
// ─── STUB LEDGER (read before trusting any green below) ─────────────────────
//
// The bus under test is NOT a stand-in. It is the bus a real `composeRuntime()`
// returns, obtained exactly as `engineLauncher` obtains it. The clash RUNNER is
// a trivial stand-in for `createRoofWallClashRunner` — deliberately, because
// this file measures the REGISTRAR HANDSHAKE, not the roof geometry (that is
// `RoofWallClashVerbReach.test.ts`'s job and it does it against a real
// `CommandBus`). Nothing on the measured path — the `has` probe, the
// `register` call, the dispatch, the returned record — is substituted.

import { describe, expect, it, beforeAll } from 'vitest';
import {
    registerClashRun,
    registerClashRefusalHandlers,
    CLASH_COMMAND_IDS,
    ROOF_WALL_PAIR,
    type ClashRunner,
} from '@pryzm/command-bus';
import { composeRuntime } from '@pryzm/runtime-composer';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';

const AUDIT = { actorId: 'l1280', projectId: 'l1280', clientId: 'node' } as const;

/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;

beforeAll(async () => {
    rt = await composeRuntime({
        audit: AUDIT,
        canvas: null,
        bootstrapFn: bootstrapWithEverything as never,
    });
}, 600_000);

/** A runner that stands for the geometry and nothing else — see the ledger. */
const ALWAYS_CLEAN: ClashRunner = {
    pairs: [ROOF_WALL_PAIR],
    run: () => ({ kind: 'ran', findings: [] }),
};

// ─── 1 · The slot engineLauncher actually passes satisfies the registrar ─────

describe('L-1280 §1 — the COMPOSED bus slot is a ClashHandlerRegistrar', () => {
    it('exposes has(), which is the member both clash registrars call FIRST', () => {
        // This single assertion is the whole of L-1199. `registerClashRun` and
        // `registerClashRefusalHandlers` both open with `bus.has(...)`; a slot
        // without it makes every clash verb unregisterable, and no suite that
        // passes a `CommandBus` can observe that.
        expect(typeof rt.bus.has).toBe('function');
    });

    it('has() agrees with the live registry it is a view of', () => {
        // Not a tautology: `registry` is captured ONCE at composition time
        // (composeRuntime.ts:1641) and is only correct because `CommandBus.registry`
        // aliases the live `handlers` Map. If that ever became a snapshot, `has`
        // and `registry` would drift and THIS is where it surfaces.
        for (const id of CLASH_COMMAND_IDS) {
            expect(rt.bus.has(id)).toBe(rt.bus.registry.has(id));
        }
    });
});

// ─── 2 · The two boot calls that threw in production now complete ────────────

describe('L-1280 §2 — the engineLauncher boot sequence, on the real slot', () => {
    it('registerClashRun does not throw and reports the pair it checks', () => {
        const checked = registerClashRun(rt.bus, ALWAYS_CLEAN);
        expect(checked).toEqual([ROOF_WALL_PAIR]);
    });

    it('registerClashRefusalHandlers claims every REMAINING clash verb', () => {
        const refusing = registerClashRefusalHandlers(rt.bus, [ROOF_WALL_PAIR]);
        // `clash-run` was taken by §2's first arm, so it must NOT be in here —
        // that skip is the defer-to-a-real-implementation rule, and it is only
        // observable because `has()` now answers.
        expect(refusing).not.toContain('clash-run');
        expect(refusing.length).toBe(CLASH_COMMAND_IDS.length - 1);
    });

    it('leaves ALL TWELVE clash verbs with a handler on the bus', () => {
        // The production consequence, stated as the user experiences it: before
        // this fix the boot logged two "non-fatal" errors and then every clash
        // verb threw "no handler registered for: <id>" when invoked.
        const missing = CLASH_COMMAND_IDS.filter((id) => !rt.bus.has(id));
        expect(missing).toEqual([]);
    });
});
