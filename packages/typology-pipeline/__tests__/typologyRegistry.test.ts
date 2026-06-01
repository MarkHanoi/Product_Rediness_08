// A.1 (Phase A · Sprint 1) — TypologyRegistry tests.
//
// Strategic context: docs/03-execution/plans/typology-expansion-roadmap.md §4.

import { describe, expect, it, vi } from 'vitest';
import { TypologyManifestSchema } from '@pryzm/schemas';
import { createTypologyRegistry } from '../src/TypologyRegistry.js';
import type {
    RegisteredTypologyPack,
    GenerativeStage,
} from '../src/types.js';

// ─────────────────────────────────────────────────────────────────────────────
// A minimal pack used by every registry test.
// ─────────────────────────────────────────────────────────────────────────────
const noopGenerative: GenerativeStage = () => ({
    ok: true,
    artifact: { engine: 'deterministic', payload: null },
});

function makePack(id: string): RegisteredTypologyPack {
    const manifest = TypologyManifestSchema.parse({
        id,
        displayName: id.charAt(0).toUpperCase() + id.slice(1),
        category: 'residential',
        version: '1.0.0',
        description: `${id} test pack`,
        thumbnail: 'thumb.webp',
        author: 'PRYZM',
        cognitionLayers: ['L1-environmental'],
        programRulesEntry: 'program-rules.json',
        deterministicEngineEntry: 'det/run.js',
        roomTypes: ['living'],
    });
    return { manifest, stages: { generative: noopGenerative } };
}

describe('createTypologyRegistry', () => {
    it('starts empty', () => {
        const r = createTypologyRegistry();
        expect(r.listIds()).toEqual([]);
        expect(r.list()).toEqual([]);
        expect(r.has('apartment')).toBe(false);
        expect(r.get('apartment')).toBeUndefined();
    });

    it('registers and looks up a pack', () => {
        const r = createTypologyRegistry();
        const pack = makePack('apartment');
        r.register(pack);
        expect(r.has('apartment')).toBe(true);
        expect(r.get('apartment')).toBe(pack);
        expect(r.listIds()).toEqual(['apartment']);
        expect(r.list()).toEqual([pack]);
    });

    it('lists ids in alphabetical order', () => {
        const r = createTypologyRegistry();
        r.register(makePack('small-office'));
        r.register(makePack('apartment'));
        r.register(makePack('house'));
        expect(r.listIds()).toEqual(['apartment', 'house', 'small-office']);
    });

    it('throws on duplicate register', () => {
        const r = createTypologyRegistry();
        r.register(makePack('apartment'));
        expect(() => r.register(makePack('apartment'))).toThrow(
            /already registered/i,
        );
    });

    it('unregister removes the pack', () => {
        const r = createTypologyRegistry();
        r.register(makePack('apartment'));
        r.unregister('apartment');
        expect(r.has('apartment')).toBe(false);
        expect(r.listIds()).toEqual([]);
    });

    it('unregister is a no-op when the id is absent', () => {
        const r = createTypologyRegistry();
        expect(() => r.unregister('apartment')).not.toThrow();
    });

    it('clear removes every pack', () => {
        const r = createTypologyRegistry();
        r.register(makePack('apartment'));
        r.register(makePack('house'));
        r.clear();
        expect(r.listIds()).toEqual([]);
    });

    it('clear is a no-op on an empty registry', () => {
        const r = createTypologyRegistry();
        const listener = vi.fn();
        r.subscribe(listener);
        r.clear();
        // empty-clear MUST NOT emit (the spec is: emit only when state
        // changes, otherwise UI flickers).
        expect(listener).not.toHaveBeenCalled();
    });

    describe('listener notifications', () => {
        it('emits registered + unregistered + cleared events', () => {
            const r = createTypologyRegistry();
            const events: { type: string; typologyId: string | null }[] = [];
            r.subscribe((e) => events.push({ type: e.type, typologyId: e.typologyId }));

            r.register(makePack('apartment'));
            r.unregister('apartment');
            r.register(makePack('house'));
            r.clear();

            expect(events).toEqual([
                { type: 'registered', typologyId: 'apartment' },
                { type: 'unregistered', typologyId: 'apartment' },
                { type: 'registered', typologyId: 'house' },
                { type: 'cleared', typologyId: null },
            ]);
        });

        it('unsubscribe stops further notifications', () => {
            const r = createTypologyRegistry();
            const listener = vi.fn();
            const unsubscribe = r.subscribe(listener);
            r.register(makePack('apartment'));
            expect(listener).toHaveBeenCalledTimes(1);
            unsubscribe();
            r.register(makePack('house'));
            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('a throwing listener does not affect others', () => {
            const r = createTypologyRegistry();
            const throwing = vi.fn(() => {
                throw new Error('boom');
            });
            const good = vi.fn();
            r.subscribe(throwing);
            r.subscribe(good);
            // silence the console.error our registry emits for throwing
            // listeners — it would noisify the test output otherwise.
            const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
            r.register(makePack('apartment'));
            expect(throwing).toHaveBeenCalled();
            expect(good).toHaveBeenCalled();
            spy.mockRestore();
        });
    });

    describe('invalid id rejection', () => {
        it('register throws on invalid id slug', () => {
            const r = createTypologyRegistry();
            // The schema accepts only valid slugs, so we forge a pack with
            // an invalid id by skipping schema validation.
            const forged: RegisteredTypologyPack = {
                manifest: {
                    id: 'Apartment',                       // uppercase = invalid
                    displayName: 'Apartment',
                    category: 'residential',
                    version: '1.0.0',
                    description: 'forged',
                    thumbnail: 'thumb.webp',
                    author: 'PRYZM',
                    cognitionLayers: ['L1-environmental'],
                    programRulesEntry: 'program-rules.json',
                    roomTypes: ['living'],
                    requiredPlanTier: 'solo',
                    phaseGate: 'alpha',
                },
                stages: { generative: noopGenerative },
            };
            expect(() => r.register(forged)).toThrow(/Invalid TypologyId/i);
        });
    });
});
