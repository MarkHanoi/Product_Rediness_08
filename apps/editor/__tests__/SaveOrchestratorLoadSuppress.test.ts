// @vitest-environment happy-dom
//
// §AUTOSAVE-SUPPRESS-DURING-LOAD (2026-07-02) — regression test.
//
// Guards the fix for the reported project-open freeze (ADR-0098 F2): opening a
// large project (40-storey office, 1300 el / 22.7 MB) fired an autosave that
// SERIALIZED the whole snapshot to IndexedDB *during* the load, because the
// mutations of the fire-and-forget post-load rebuild/re-anchor sweep landed after
// the caller-driven `isLoading` fence had already closed.
//
// ProjectLoader now brackets the ENTIRE load (incl. the post-load sweep) with a
// dedicated `pryzm-load-suppress-begin` / `pryzm-load-suppress-end` pair. This test
// verifies the SaveOrchestrator half: while the suppression window is open no
// autosave is serialized, and exactly ONE coalesced save fires once it closes.
//
// happy-dom gives a real `window` (EventTarget + timers); fake timers flush the
// debounce deterministically.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SaveOrchestrator } from '../src/ui/platform/SaveOrchestrator';

function fireMutation(): void {
    window.dispatchEvent(new CustomEvent('bim-wall-added'));
}

describe('SaveOrchestrator — §AUTOSAVE-SUPPRESS-DURING-LOAD', () => {
    let saves: string[];
    let orch: SaveOrchestrator;

    beforeEach(() => {
        vi.useFakeTimers();
        saves = [];
        orch = new SaveOrchestrator({
            // Unique hash each call so the content-hash short-circuit never suppresses.
            getHash: () => `h-${saves.length}-${Math.random()}`,
            onAutoSave: (label) => { saves.push(label); },
            debounceMs: 1000,
        });
    });

    afterEach(() => {
        orch.dispose();
        vi.useRealTimers();
    });

    it('does NOT autosave while a load-suppress window is open', () => {
        window.dispatchEvent(new CustomEvent('pryzm-load-suppress-begin'));

        // A post-load sweep mutation lands mid-load.
        fireMutation();
        // Even well past the debounce, no serialize must happen during the load.
        vi.advanceTimersByTime(10_000);

        expect(saves).toHaveLength(0);
        expect(orch.isDirty()).toBe(true); // marked dirty, just deferred
    });

    it('fires exactly ONE coalesced autosave once the load-suppress window closes', () => {
        window.dispatchEvent(new CustomEvent('pryzm-load-suppress-begin'));
        // Several mutations during the load — must collapse to a single save.
        fireMutation();
        fireMutation();
        fireMutation();
        vi.advanceTimersByTime(5_000);
        expect(saves).toHaveLength(0);

        window.dispatchEvent(new CustomEvent('pryzm-load-suppress-end'));
        // The single coalesced save is armed on the debounce.
        vi.advanceTimersByTime(1_000);

        expect(saves).toHaveLength(1);
    });

    it('setLoading(true) clears a stale suppression latch left by a cancelled load', () => {
        // A prior load opened suppression but its -end never arrived (project switch).
        window.dispatchEvent(new CustomEvent('pryzm-load-suppress-begin'));
        // The stale -end from that cancelled load must not re-open saving for the new load.

        // A new load starts via the caller fence.
        orch.setLoading(true);
        window.dispatchEvent(new CustomEvent('pryzm-load-suppress-begin')); // new load's own begin

        // New load completes (caller closes its fence) then the load-suppress closes.
        orch.setLoading(false);
        orch.resetDirtyAfterLoad(); // caller baseline — clears dirty like the real flow
        window.dispatchEvent(new CustomEvent('pryzm-load-suppress-end'));

        // A genuine user edit after the load must autosave normally. setLoading(false)
        // opens a 4 s post-load settle window (executeSave defers to it), so advance
        // past both the settle window and the debounce.
        fireMutation();
        vi.advanceTimersByTime(6_000);
        expect(saves).toHaveLength(1);
    });

    it('a normal edit (no load window) autosaves as before', () => {
        fireMutation();
        vi.advanceTimersByTime(1_000);
        expect(saves).toHaveLength(1);
    });
});
