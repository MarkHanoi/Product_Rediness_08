// §PLUGIN-DESCRIPTOR-AT-L5 (L-9921/L-9922, ADR-0367) — the section family is
// DISPATCHABLE, proven at the composed runtime, and its descriptor is authored
// INSIDE THE PLUGIN.
//
// ═══════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS AND `plugins/section-view/__tests__/` CANNOT REPLACE IT
// ═══════════════════════════════════════════════════════════════════════════════
//
// This is the pool's argument (`poolReachableThroughComposedRuntime.test.ts`), the
// lift's, and the boundary line's, re-run a fourth time — and the fourth repetition
// is itself the finding. A plugin's own suite builds its own stores object and hands
// it to the bus as the provider. **The provider is the thing that breaks.** A test
// that SUPPLIES it cannot observe its absence, which is why `pool.create` passed its
// own suite for months while being undispatchable by the application.
//
// Section-view was in exactly that state when this file was written, and had been
// since §P3.4-SE. MEASURED, not inferred:
//
//   • `apps/editor/src/engine/engineLauncher.ts:711` calls
//     `registerSectionHandlers(_bus)` on the REAL runtime bus, so all six
//     `section.*` verbs WERE registered.
//   • `apps/editor/src/PluginRegistry.ts` had no section descriptor, so
//     `ALL_PLUGINS` contributed no `section` key to the `stores` bag that
//     `storesAsRecordView(stores)` (bootstrap.ts:148) is built from.
//   • All six handlers declare `affectedStores = ['section']` and read
//     `ctx.stores.section`.
//   • `CommandBus.buildContext` therefore threw
//         section.create: required store 'section' is missing from HandlerContext.stores
//     BEFORE any mutation. Registered and undispatchable — the tenth instance of the
//     shape, and the FIRST caught by a gate (`check-plugin-census-equivalence.ts`
//     arm A) rather than by a person trying to use the feature.
//
// ⭐ THE RULE THIS FILE ENFORCES: the section family is reachable THROUGH THE REAL
// COMPOSITION ROOT. It deliberately never constructs a store, a stores object or a
// bus of its own. Delete `sectionViewPluginRegistration` from `ALL_PLUGINS` and every
// case below fails.
//
// ⚠ WHAT THIS FILE DOES **NOT** PROVE, STATED SO NOBODY READS MORE INTO A GREEN RUN.
// It proves the six verbs are dispatchable and that their patches reach the store the
// composition root binds. It does NOT prove a person can draw a section, and C104
// R-10 makes a reachability claim INADMISSIBLE without a pointer-layer proof.
//
// ⚠ CORRECTED BEFORE ANYONE COULD RELY ON IT. This paragraph first read "section-view
// has no tool activator at all". **That is false, and the truth is worse** (L-9923):
// an activator IS registered at `PluginRegistry.ts:1140`, so
// `check-tool-activator-coverage.ts` counts section-view as COVERED — but the
// activator reads `window.sectionTool`, and that global is assigned NOWHERE in the
// tree (one occurrence repo-wide: the read itself). So it always falls through to
// `section.panel.open`, a verb with exactly ONE occurrence repo-wide — that dispatch
// — and no handler. `plugins/section-view/src/tool.ts` does dispatch `section.create`,
// and nothing ever constructs it. A coverage gate keyed on the NAME of a registration
// is satisfied by its existence, never by its reachability.
//
// It also does NOT prove the section RENDERS: `section.moveLine` refuses precisely
// because nothing renders, exports or persists this store yet (see R-6). Wiring the
// store to the section renderer is Gate G7 and ADR-0367 §6, and is NOT claimed here.

import { describe, expect, it } from 'vitest';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
import { ALL_PLUGINS, ELEMENT_PLUGIN_IDS } from '../src/PluginRegistry.js';
import { SectionStore, sectionViewPluginRegistration } from '@pryzm/plugin-section-view';

const AUDIT = { actorId: 'u', projectId: 'p', clientId: 'c', timestamp: '' } as const;

// `SectionData.id` is a plain string minted by CreateSectionHandler
// (`section-<ts36>-<seq36>`), NOT a branded ULID — see the schema note in
// `packages/schemas/src/elements/Section.ts`. Supplying our own id is legal and is
// what makes these assertions deterministic.
const S1 = 'section-test-aa';
const S2 = 'section-test-bb';

const LINE = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, lookDepth: 5 } as const;
const CREATE = { id: S1, mark: 'A-A', line: LINE, scale: 50 } as const;

type SectionRecord = {
    id: string;
    mark?: string;
    line: { a: { x: number; y: number }; b: { x: number; y: number }; lookDepth: number };
    scale: number;
    seq: number;
};

const readSection = (rt: { stores: Record<string, { getState(): Map<string, unknown> }> }, id: string) =>
    rt.stores.section!.getState().get(id) as SectionRecord | undefined;

async function bootWithSection() {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    await rt.bus.executeCommand('section.create', CREATE);
    return rt;
}

describe('§PLUGIN-DESCRIPTOR-AT-L5 — section-view is dispatchable through the composed runtime', () => {
    it('R-1: the composition root contributes the `section` store', async () => {
        const rt = await bootstrapWithEverything({ audit: AUDIT });
        // The single key all six `section.*` verbs declare in `affectedStores`.
        // Without the descriptor this key is absent and every verb throws at
        // buildContext, before any mutation.
        expect(rt.stores.section).toBeInstanceOf(SectionStore);
        rt.tearDown();
    });

    it('R-2: ⭐ THE DESCRIPTOR IS THE PLUGIN\'S OWN OBJECT, not a copy the L7 registry wrote', async () => {
        // This is the mechanism assertion, and it is an IDENTITY check on purpose.
        // A `toEqual` would also pass against an inline literal in PluginRegistry.ts
        // that happened to have the same fields — i.e. against the very arrangement
        // §PLUGIN-DESCRIPTOR-AT-L5 exists to end. `toContain` uses Object.is, so this
        // can only pass while `ALL_PLUGINS` references the object declared in
        // `plugins/section-view/src/registration.ts`.
        expect(ALL_PLUGINS as readonly unknown[]).toContain(sectionViewPluginRegistration);

        // The id must equal the DIRECTORY name (the census gate compares this set to
        // `ls plugins/`), and the storeKey must equal what the HANDLERS read. They
        // differ here, which is the case §FIX-DIMENSION-STOREKEY-SINGULAR (L-138) got
        // wrong in the other direction.
        expect(sectionViewPluginRegistration.id).toBe('section-view');
        expect(sectionViewPluginRegistration.storeKey).toBe('section');

        // …and it is named in the list the bootstrap suite's per-plugin storeKey
        // assertion iterates. Omitting it fails nothing loudly — it just stops being
        // checked (census arm F), so it is asserted here too.
        expect(ELEMENT_PLUGIN_IDS as readonly string[]).toContain('section-view');
    });

    it('R-3: section.create DISPATCHES — it no longer throws at CommandBus.buildContext', async () => {
        const rt = await bootstrapWithEverything({ audit: AUDIT });
        // The assertion that matters is the ABSENCE OF A THROW. A `.toBeDefined()` on
        // the result would also pass on a handler that silently did nothing.
        await expect(rt.bus.executeCommand('section.create', CREATE)).resolves.toBeDefined();
        rt.tearDown();
    });

    it('R-4: the record LANDS in the store the composition root binds', async () => {
        const rt = await bootWithSection();
        // Read the store the application reads, never the handler's return value —
        // [[committed-is-not-reachable]]: a handler result proves the function ran and
        // never that the patch reached the store a consumer consults. The round trip
        // here is real: produceCommand → PatchEmitter → attachStores → Store<T>.
        const rec = readSection(rt, S1);
        expect(rec).toBeDefined();
        expect(rec!.mark).toBe('A-A');
        expect(rec!.line.lookDepth).toBe(5);
        expect(rec!.scale).toBe(50);
        rt.tearDown();
    });

    it('R-5: setMark / setDepth / setScale all land — the whole verb family, not just create', async () => {
        const rt = await bootWithSection();
        await rt.bus.executeCommand('section.setMark', { id: S1, mark: 'B-B' });
        await rt.bus.executeCommand('section.setDepth', { id: S1, lookDepth: 12 });
        await rt.bus.executeCommand('section.setScale', { id: S1, scale: 100 });
        const rec = readSection(rt, S1)!;
        expect(rec.mark).toBe('B-B');
        expect(rec.line.lookDepth).toBe(12);
        expect(rec.scale).toBe(100);
        // ⭐ Asserted as a SET rather than one verb, because the defect was never
        // per-verb: one missing store key took all six down at once, so one verb
        // passing says nothing about the other five.
        rt.tearDown();
    });

    it('R-6: ⛔ section.moveLine still REFUSES, and says why — a fixed store did not make it live', async () => {
        const rt = await bootWithSection();
        // §FIX-DEAD-MOVE-VERB-REFUSE (W3-4). Contributing the store closed ONE of the
        // two reasons this verb was dead; the other stands — no production surface
        // dispatches it (`MOVE_COMMAND_BY_TYPE` does not name it) and nothing renders,
        // exports or persists this store. ⚠ THIS CASE EXISTS TO STOP A LATER LANE
        // READING "the store is wired now" AS "the refusal can go". Reporting success
        // here would restore a second, lying mutation path against P6 and re-arm the
        // undo hazard the refusal closes.
        await expect(
            rt.bus.executeCommand('section.moveLine', { id: S1, a: { x: 1, y: 1 }, b: { x: 9, y: 1 } }),
        ).rejects.toThrow(/no surface dispatches it|cannot be committed/i);
        // …and nothing moved.
        const rec = readSection(rt, S1)!;
        expect(rec.line.a.x).toBe(0);
        expect(rec.line.b.x).toBe(10);
        rt.tearDown();
    });

    it('R-7: ⛔ a MALFORMED section is refused BEFORE anything lands', async () => {
        const rt = await bootstrapWithEverything({ audit: AUDIT });
        await expect(
            rt.bus.executeCommand('section.create', {
                id: S2,
                line: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, lookDepth: -1 },
            }),
        ).rejects.toThrow();
        // The refusal must leave the store untouched, not merely report failure.
        expect(readSection(rt, S2)).toBeUndefined();
        rt.tearDown();
    });

    it('R-8: section.delete removes exactly the one section', async () => {
        const rt = await bootWithSection();
        await rt.bus.executeCommand('section.create', { ...CREATE, id: S2, mark: 'C-C' });
        await rt.bus.executeCommand('section.delete', { id: S1 });
        expect(readSection(rt, S1)).toBeUndefined();
        // ⛔ AND THE OTHER SURVIVES. A delete that took the whole store with it would
        // pass a single-record test and destroy a drawing set.
        expect(readSection(rt, S2)!.mark).toBe('C-C');
        rt.tearDown();
    });
});
