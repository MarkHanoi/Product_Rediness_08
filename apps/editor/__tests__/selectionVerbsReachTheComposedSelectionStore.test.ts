/**
 * @vitest-environment happy-dom
 */
// selectionVerbsReachTheComposedSelectionStore —
//   §SEL-STORE-IDENTITY (W4d) · ADR-0015 · C16 CA-18 · P1 · P6.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ THE ARM THE PLUGIN'S OWN SUITE CANNOT CONTAIN, AND WHY (D6).
// ═══════════════════════════════════════════════════════════════════════════════
//
// `plugins/selection/__tests__/handlers/*.test.ts` is 100% green and has been for
// as long as the family has existed. It is also, for the DISPATCH question,
// structurally incapable of failing — because every one of its files opens with:
//
//     const selection = new SelectionStore();
//     const bus = new CommandBus({ …, storesProvider: () => ({ selection }) });
//
// with the comment *"Selection handlers receive the STORE INSTANCE directly (not a
// POJO state map)"*. THE PROVIDER IS THE THING THAT IS BROKEN. In production the
// bus is built by `apps/editor/src/bootstrap.ts:94` with
// `storesProvider: () => storesAsRecordView(stores)`, and `storesAsRecordView`
// (same file, :148-158) is `Object.fromEntries(store.getState())` — a
// `Record<id, dto>`, NEVER the `SelectionStore` instance. So every
// `ctx.stores.selection.select(...)` / `.deselect(...)` / `.clear()` /
// `.getState()` in `plugins/selection/src/handlers/` was a method call on a plain
// object, and FOUR OF THE FIVE VERBS THREW `… is not a function` at the real
// composition root while the plugin suite reported them green.
//
// A test that supplies the object whose shape is the defect cannot observe the
// defect. That is D6, and it is not a technicality here: the ONE production
// activator for this family — `apps/editor/src/PluginRegistry.ts:1223`, the
// DEFAULT POINTER TOOL — does
// `busAdapter.executeCommand('selection.clear', {}).catch(console.error)`, so the
// throw happened on every activation of the default tool and was swallowed by the
// `.catch`. The toolbar's Copy button (`MainToolbar.ts:51`) dispatched
// `copy-selection`, which threw `getState is not a function`.
//
// ─── SO WHAT DOES THIS FILE DO DIFFERENTLY ───────────────────────────────────
// IT CONSTRUCTS NOTHING. No `new SelectionStore()`, no `new CommandBus()`, no
// stores object, no `storesProvider`. It boots the REAL composition root
// (`composeRuntime({ bootstrapFn: bootstrapWithEverything })` — P1's only legal
// way to obtain a runtime) and dispatches the REAL verbs on the REAL bus.
//
// ─── HOW THE WRITE IS READ BACK WITHOUT CONSTRUCTING A READER ────────────────
// `composeRuntime`'s `StoresSlot` is a FRESH object that copies none of the 29
// plugin DTO stores except `boundaryLine` (see `composeRuntime.ts` §BLSTORE-
// COMPOSED-PLUGIN-STORES / L-11064), so `runtime.stores.selection` is `undefined`
// and CANNOT be the read channel here. That is a SEPARATE, already-logged defect
// and this file does not paper over it.
//
// The read channel used instead is `copy-selection` — a DIFFERENT verb, on the
// SAME bus, reading the SAME `ctx.stores.selection` through the SAME provider.
// If `selection.select` wrote the store the provider fronts, `copy-selection`
// sees it; if it wrote a rival instance, `copy-selection` sees an empty store and
// refuses. So the round trip proves STORE IDENTITY as a side effect, which is the
// property that matters most here: there are already three live selection
// authorities in this build (`packages/input-host/SelectionManager`,
// `runtime.selection` = `composeRuntime.ts:328 buildSelectionStub`, and
// `packages/core-app-model/SelectionBus`) and a fourth would be a rival, not a fix.
//
// ─── STUB LEDGER (read before trusting any green below) ──────────────────────
//  1. `selectionClipboard` is the plugin's MODULE-LEVEL singleton (`clipboard.ts`
//     :95). It is imported and inspected, never constructed. `.clear()` is called
//     between arms to isolate them — that is a reset of live state, not a fake.
//  2. NOT PROVEN HERE: that anything RENDERS a selection highlight from this
//     store. The one committer that did (`plugins/wall/src/committer/
//     selection-highlight.ts`) was bound in `bootstrap.render.data.ts`, which was
//     DELETED (`bootstrap-shape.test.ts:50` asserts it must not exist). This file
//     measures DISPATCHABLE, not RENDERS.
//  3. NOT PROVEN HERE: that the 3-D viewport populates this store. It does not —
//     `SelectionManager` is a separate authority. That gap is REPORTED, not
//     silently closed, because closing it by writing a bridge would mint the
//     fourth selection authority described above.
//  4. `paste-clipboard` is deliberately NOT asserted green: its port is wired at
//     `engineLauncher.ts:767` behind the §OI-053 skip-if-present proxy, so it
//     never lands. ARM G pins that as a MEASUREMENT rather than leaving it
//     indistinguishable from "paste works".

import { describe, expect, it, beforeAll, beforeEach } from 'vitest';

import { composeRuntime } from '@pryzm/runtime-composer';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
import { selectionClipboard } from '@pryzm/plugin-selection';

const AUDIT = { actorId: 'sel-w4d', projectId: 'sel-w4d', clientId: 'node' } as const;
const BUDGET = 600_000;

/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;

beforeAll(async () => {
    rt = await composeRuntime({
        audit: AUDIT,
        canvas: null,
        bootstrapFn: bootstrapWithEverything as never,
    });
}, BUDGET);

beforeEach(() => {
    // Live module state, reset between arms — never re-constructed (ledger 1).
    selectionClipboard.clear();
});

/** Dispatch on the REAL composed bus. No adapter, no fake, no wrapper. */
const exec = (type: string, payload: unknown): Promise<unknown> =>
    Promise.resolve(rt.bus.executeCommand(type, payload));

const TARGETS = [
    { id: 'w4d-wall-1', kind: 'wall' },
    { id: 'w4d-furn-1', kind: 'furniture' },
] as const;

describe('§SEL-STORE-IDENTITY — the selection verbs must reach the SelectionStore the composed bus fronts', () => {

    it('ARM A — all five selection verbs are REGISTERED on the composed bus', () => {
        // A vacuous green below would be indistinguishable from "no such verb", so
        // pin registration first ([[committed-is-not-reachable]]).
        for (const type of [
            'selection.select',
            'selection.deselect',
            'selection.clear',
            'copy-selection',
            'paste-clipboard',
        ]) {
            expect(rt.bus.has(type), `${type} must be registered at the composition root`).toBe(true);
        }
    });

    it('ARM B — selection.select DISPATCHES without throwing (this is the defect)', async () => {
        // BEFORE the fix this rejected with:
        //   "ctx.stores.selection.select is not a function"
        await expect(exec('selection.select', { targets: [...TARGETS] })).resolves.toBeDefined();
    });

    it('ARM C — the write LANDED in the store the provider fronts (read back through copy-selection)', async () => {
        await exec('selection.select', { targets: [...TARGETS] });
        // copy-selection reads `ctx.stores.selection` through the SAME provider.
        // BEFORE the fix this rejected with "getState is not a function".
        await exec('copy-selection', {});
        const copied = selectionClipboard.get().map((e) => e.sourceId).sort();
        expect(copied).toEqual(['w4d-furn-1', 'w4d-wall-1']);
    });

    it('ARM D — selection.deselect removes exactly one', async () => {
        await exec('selection.select', { targets: [...TARGETS] });
        await exec('selection.deselect', { ids: ['w4d-wall-1'] });
        await exec('copy-selection', {});
        expect(selectionClipboard.get().map((e) => e.sourceId)).toEqual(['w4d-furn-1']);
    });

    it('ARM E — selection.clear (the DEFAULT POINTER TOOL activator verb) empties the store', async () => {
        // PluginRegistry.ts:1223 dispatches exactly this on every activation of the
        // default tool, into a `.catch(console.error)`. It threw every time.
        await exec('selection.select', { targets: [...TARGETS] });
        await expect(exec('selection.clear', {})).resolves.toBeDefined();
        // Empty store ⇒ copy-selection REFUSES. That refusal is the read-back.
        await expect(exec('copy-selection', {})).rejects.toThrow(/Nothing selected/i);
    });

    it('ARM F — NEGATIVE CONTROL: a green ARM B is not "everything resolves"', async () => {
        // F-1 — an invalid payload is still refused by canExecute.
        await expect(exec('selection.select', { targets: [{ id: '', kind: 'wall' }] }))
            .rejects.toThrow();
        // F-2 — an unregistered verb still rejects, so ARM A/B really route
        // through the bus registry and not through some catch-all.
        await expect(exec('selection.bogus', {})).rejects.toThrow();
        // F-3 — the refusal above did not corrupt the store: a valid select still lands.
        await exec('selection.select', { targets: [TARGETS[0]] });
        await exec('copy-selection', {});
        expect(selectionClipboard.get().map((e) => e.sourceId)).toEqual(['w4d-wall-1']);
    });

    it('ARM G — MEASUREMENT, NOT A PASS: paste-clipboard still has no port at the composition root', async () => {
        // `engineLauncher.ts:767` builds a REAL `SelectionPastePort` and calls
        // `registerSelectionHandlers(_bus, { pastePort })` — but `_bus` is the
        // §OI-053 skip-if-present Proxy (`engineLauncher.ts:630-641`) and
        // PluginRegistry already claimed all five types at composeRuntime, so that
        // call is a GUARANTEED no-op and the port never lands.
        //
        // ⛔ This arm asserts the CURRENT TRUTH so it is not mistaken for working
        // paste. When the port is wired, this arm must be REWRITTEN, not deleted.
        await exec('selection.select', { targets: [...TARGETS] });
        await exec('copy-selection', {});
        expect(selectionClipboard.size).toBe(2);
        await expect(exec('paste-clipboard', {})).rejects.toThrow(/no paste port wired/i);
    });
});
