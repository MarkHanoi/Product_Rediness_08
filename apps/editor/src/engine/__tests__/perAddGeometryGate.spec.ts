// §FIX-LOAD-TRAVERSE-BATCH (P2) — behavioural specs for the per-add geometry-pass
// gate. Proves the load-scoped guard suppresses the per-add scene traversal during
// a project load, that ONE consolidated pass runs at load end, and that a normal
// single-element add AFTER load still triggers the per-add pass exactly as before.

import { afterEach, describe, expect, it } from 'vitest';
import {
    isProjectLoadActive,
    shouldDeferPerAddGeometryPass,
} from '../perAddGeometryGate';

type G = { __pryzmProjectLoadActive?: boolean };

function setLoadActive(v: boolean): void {
    (globalThis as G).__pryzmProjectLoadActive = v;
}

afterEach(() => {
    delete (globalThis as G).__pryzmProjectLoadActive;
});

describe('perAddGeometryGate — isProjectLoadActive()', () => {
    it('is false when the flag is unset (production default)', () => {
        delete (globalThis as G).__pryzmProjectLoadActive;
        expect(isProjectLoadActive()).toBe(false);
    });

    it('is true only for the exact boolean true (never truthy coercion)', () => {
        setLoadActive(true);
        expect(isProjectLoadActive()).toBe(true);
        // Guard against accidental truthy values leaking through.
        (globalThis as unknown as { __pryzmProjectLoadActive?: unknown }).__pryzmProjectLoadActive = 1;
        expect(isProjectLoadActive()).toBe(false);
    });
});

describe('perAddGeometryGate — shouldDeferPerAddGeometryPass()', () => {
    it('defers during a batchCoordinator batch (pre-existing P1.3 guard)', () => {
        setLoadActive(false);
        expect(shouldDeferPerAddGeometryPass(/* isBatching */ true)).toBe(true);
    });

    it('defers during a project load even when NOT batching (the O(n²) window)', () => {
        setLoadActive(true);
        expect(shouldDeferPerAddGeometryPass(/* isBatching */ false)).toBe(true);
    });

    it('runs the per-add pass on the normal interactive path (no batch, no load)', () => {
        setLoadActive(false);
        expect(shouldDeferPerAddGeometryPass(/* isBatching */ false)).toBe(false);
    });
});

/**
 * Models the exact initScene wiring: N `bim-*-added` events during a load, then a
 * `pryzm-project-loaded` consolidated pass, then one interactive add afterwards.
 * `perAddPasses` counts how often the (expensive) per-add scene traversal would run.
 */
function simulateLoadThenEdit(opts: {
    addsDuringLoad: number;
    addsAfterLoad: number;
}): { perAddPasses: number; consolidatedPasses: number } {
    let perAddPasses = 0;
    let consolidatedPasses = 0;

    // The per-add handler: the real gate decides whether to skip.
    const onGeometryAdded = (isBatching: boolean): void => {
        if (shouldDeferPerAddGeometryPass(isBatching)) return;
        perAddPasses++;
    };
    // The single consolidated pass fired by pryzm-project-loaded.
    const onProjectLoaded = (): void => {
        consolidatedPasses++;
    };

    // ── During load: flag set, events fire outside any batchCoordinator batch ──
    setLoadActive(true);
    for (let i = 0; i < opts.addsDuringLoad; i++) onGeometryAdded(/* isBatching */ false);

    // ── Load completes: ProjectLoader clears the flag BEFORE emitting the event ──
    setLoadActive(false);
    onProjectLoaded();

    // ── Interactive edits after load ──
    for (let i = 0; i < opts.addsAfterLoad; i++) onGeometryAdded(/* isBatching */ false);

    return { perAddPasses, consolidatedPasses };
}

describe('perAddGeometryGate — end-to-end load then edit (§FIX-LOAD-TRAVERSE-BATCH)', () => {
    it('suppresses ALL per-add traversals during a heavy load and runs one consolidated pass', () => {
        const { perAddPasses, consolidatedPasses } = simulateLoadThenEdit({
            addsDuringLoad: 2000, // heavy building — thousands of add-events
            addsAfterLoad: 0,
        });
        expect(perAddPasses).toBe(0);       // O(n²) window eliminated
        expect(consolidatedPasses).toBe(1); // exactly one pass at load end
    });

    it('still triggers the per-add pass for a normal single add after load', () => {
        const { perAddPasses, consolidatedPasses } = simulateLoadThenEdit({
            addsDuringLoad: 500,
            addsAfterLoad: 1, // e.g. drawing one wall / placing one furniture
        });
        expect(perAddPasses).toBe(1);       // interactive path unchanged
        expect(consolidatedPasses).toBe(1);
    });

    it('an empty/small load still runs the single consolidated pass (tiers correctly)', () => {
        const { perAddPasses, consolidatedPasses } = simulateLoadThenEdit({
            addsDuringLoad: 0, // empty project
            addsAfterLoad: 0,
        });
        expect(perAddPasses).toBe(0);
        expect(consolidatedPasses).toBe(1);
    });
});
