/**
 * §PLUGIN-DTO-STORES-ARE-PROJECT-SCOPED (L-13247) — the eight new-style element
 * families must be CLEARED when the project changes.
 *
 * ⛔ THE DEFECT THIS PINS, MEASURED ON THE FOUNDER'S DUBAI SESSION.
 * `ClearProjectCommand` clears ~16 hand-written element stores and then calls
 * `projectScopeRegistry.clearAll()`. The eight plugin DTO families — bathroomPod,
 * lift, liftPart, pool, water, balcony, component, spaceEnvelope — were in NEITHER
 * list: they are not `window.<x>Store` globals, so the hand-written list never named
 * them, and nothing registered them as project-scoped. Opening a second project left
 * the first project's records in the stores. His console:
 *
 *   [ImportProjectCommand] Loading 0 walls        ← the new project is EMPTY
 *   [ProjectLoader] Load complete: 0 loaded, 0 failed
 *   [space-envelope] §SPACE-ENVELOPE-IN-CESIUM drew 15/15 authored envelope(s)
 *   [C13 VIOLATION] Project-isolation leak — scene.foreignElement×16
 *   [ProjectSerializer] Snapshot created: 15 elements   ← and then it SAVED them
 *
 * ⭐ THE LAST LINE IS WHY THIS IS NOT A RENDER BUG. The serializer reads these stores
 * through `readPluginStore`, so the foreign records were written into the NEW
 * project's snapshot and auto-saved. A leak that only drew would be a defect; one that
 * SAVES is the other project's data arriving in this project's file.
 *
 * ⚠ WHAT THIS SUITE CAN AND CANNOT SEE. It asserts the REGISTRATION CONTRACT at the
 * source — that every family in `composeRuntime`'s plugin-DTO array is registered with
 * `projectScopeRegistry` and that its `clear()` actually empties it. It does NOT boot a
 * runtime or switch a project: `composeRuntime` needs the whole editor boot path, so a
 * fixture of it would be a fake proving the header (C67 §4 rule 13,
 * [[fake-more-capable-than-real]]). The end-to-end claim — "switching projects leaves
 * no envelope on screen" — is browser-verified only.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { projectScopeRegistry } from '@pryzm/core-app-model/persistence';
import { Store } from '@pryzm/stores';

const COMPOSE_SRC = readFileSync(
    resolve(__dirname, '../composeRuntime.ts'),
    'utf8',
);

/** The eight keys, read out of the ONE array in `composeRuntime.ts` rather than retyped. */
function pluginDtoKeysFromSource(): string[] {
    const at = COMPOSE_SRC.indexOf("['bathroomPod', bathroomPodStore]");
    expect(at, 'the plugin-DTO store array moved — re-point this reader before trusting it')
        .toBeGreaterThan(-1);
    const block = COMPOSE_SRC.slice(at, COMPOSE_SRC.indexOf('] as const)', at));
    return [...block.matchAll(/\['([A-Za-z]+)',/g)].map((m) => m[1]!);
}

describe('§PLUGIN-DTO-STORES-ARE-PROJECT-SCOPED — every plugin DTO family is cleared on a project switch', () => {
    it('the eight families are the ones this lane found unregistered', () => {
        // Pinned so that ADDING a family is a deliberate act that shows up here, and
        // so the arms below are known to be measuring the real set.
        //
        // ⛔ THE NINTH ROW (`siteworks`) WAS ADDED TO `composeRuntime` AND NEVER SHOWED UP
        // HERE, because this whole FILE was dark: `runtime-composer`'s vitest `include` read
        // `__tests__/**/*.test.ts`, and this file is `src/__tests__/…*.spec.ts` — it missed on
        // BOTH the directory and the suffix, so `vitest run <path>` printed "No test files
        // found" rather than failing (§L-851: "never ran" and "passed" print the same value).
        // The include was widened and the list re-pinned in the SAME commit (lane CI-RED,
        // 2026-09-09), which is what "a deliberate act that shows up here" was supposed to mean.
        expect(pluginDtoKeysFromSource()).toEqual([
            'bathroomPod', 'lift', 'liftPart', 'pool', 'water',
            'balcony', 'component', 'spaceEnvelope', 'siteworks',
        ]);
    });

    it('⭐ EVERY key in the array is registered with projectScopeRegistry — the fix, at the source', () => {
        // The registration sits INSIDE the same loop that emits the UNREADABLE warning,
        // so a ninth family becomes project-scoped on the line that makes it reachable.
        // Asserting on the source is what makes that structural rather than incidental.
        for (const key of pluginDtoKeysFromSource()) {
            expect(
                COMPOSE_SRC,
                `no projectScopeRegistry registration reachable for "${key}"`,
            ).toContain('scopeName: `pluginDtoStore:${key}`');
        }
        expect(COMPOSE_SRC).toContain('projectScopeRegistry.register(');
        // ⛔ The capability is PROBED, never assumed: `PluginDtoStoreHandle` declares
        // only `getState()`, so a store without `clear()` must be NAMED, not skipped.
        expect(COMPOSE_SRC).toContain("typeof clearable.clear === 'function'");
        expect(COMPOSE_SRC).toMatch(/console\.error\([\s\S]{0,200}PLUGIN-DTO-STORES-ARE-PROJECT-SCOPED/);
    });

    it('⛔ the registration is NOT a second hand-written list in ClearProjectCommand', () => {
        // C45's whole point is one registry, not a growing rival list. If someone
        // "fixes" a future family by naming it in the clear command instead, this
        // goes red and says why.
        const clearCmd = readFileSync(
            resolve(__dirname, '../../../command-registry/src/project/ClearProjectCommand.ts'),
            'utf8',
        );
        for (const key of pluginDtoKeysFromSource()) {
            expect(
                clearCmd.includes(`${key}Store.clear()`),
                `${key} was added to ClearProjectCommand's hand-written list — register it in `
                + 'composeRuntime\'s plugin-DTO array instead (C45: one registry, not a ninth list)',
            ).toBe(false);
        }
    });
});

describe('§PLUGIN-DTO-STORES-ARE-PROJECT-SCOPED — clear() really empties a Store, and clearAll() reaches it', () => {
    beforeEach(() => {
        for (const s of projectScopeRegistry.list()) {
            if (s.scopeName.startsWith('pluginDtoStore:spec-')) {
                // The registry has no unregister; re-registering the same name replaces it.
                projectScopeRegistry.register({ scopeName: s.scopeName, clear: () => { /* neutered */ } });
            }
        }
    });

    it('⭐ a registered Store is EMPTY after clearAll() — the behaviour the founder needed', () => {
        // The real `SpaceEnvelopeStore extends Store`, so `clear()` is the base's.
        // Using the base directly keeps this a test of the CONTRACT the fix relies on
        // rather than of one family's subclass.
        // ⚠ THE KEY IS REQUIRED. `Store`'s constructor refuses an empty `storeKey`
        // (`packages/stores/src/Store.ts:55`) and this spec was written before it did — which
        // nothing noticed, because the file was dark. Two spec-scoped keys, distinct so the two
        // arms cannot share a persistence namespace.
        const store = new Store<{ id: string }>('spec-pluginDto-spaceEnvelope');
        // ⚠ `applyPatch`, NOT `set`. `Store` has no setter — the write path is a patch list
        // (`Store.ts:93`), which is the CommandBus's own currency. This spec was written against
        // a `set()` that does not exist on this class, and nothing noticed because the file was
        // dark. Using the real write path also makes the arm a truer test of the contract: the
        // records go in the way production puts them in.
        store.applyPatch([
            { op: 'add', path: ['e1'], value: { id: 'e1' } },
            { op: 'add', path: ['e2'], value: { id: 'e2' } },
        ]);
        expect(store.getState().size).toBe(2);

        projectScopeRegistry.register({
            scopeName: 'pluginDtoStore:spec-spaceEnvelope',
            clear: () => { store.clear(); },
        });

        const report = projectScopeRegistry.clearAll();
        expect(report.cleared).toContain('pluginDtoStore:spec-spaceEnvelope');
        // ⭐ THE ASSERTION THAT WOULD HAVE CAUGHT THE BUG: 15 envelopes → 0, so the
        // serializer's `readPluginStore` finds nothing to write into the next project.
        expect(store.getState().size).toBe(0);
    });

    it('a clear() that throws is isolated and REPORTED, never silently swallowed', () => {
        // One bad family must not stop the other seven clearing — a partial clear that
        // looked clean is how this defect would come back wearing a different name.
        projectScopeRegistry.register({
            scopeName: 'pluginDtoStore:spec-throws',
            clear: () => { throw new Error('store is wedged'); },
        });
        const survivor = new Store<{ id: string }>('spec-pluginDto-survivor');
        survivor.applyPatch([{ op: 'add', path: ['x'], value: { id: 'x' } }]);
        projectScopeRegistry.register({
            scopeName: 'pluginDtoStore:spec-survivor',
            clear: () => { survivor.clear(); },
        });

        const report = projectScopeRegistry.clearAll();
        expect(report.failures.map((f) => f.scope)).toContain('pluginDtoStore:spec-throws');
        expect(report.cleared).toContain('pluginDtoStore:spec-survivor');
        expect(survivor.getState().size).toBe(0);
    });
});
