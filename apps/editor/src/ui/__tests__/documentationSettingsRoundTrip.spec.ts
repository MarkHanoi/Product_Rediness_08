/**
 * §DOC-SETTINGS-ROUND-TRIP (L-1891) — does the documentation-settings surface
 * actually survive save → close → reopen?
 *
 * THE QUESTION THIS ANSWERS
 * ────────────────────────────────────────────────────────────────────────────
 * The founder: *"I would like the data to get saved after project closure —
 * make sure this is the case — the settings needs to get saved."*
 *
 * "The settings persist" is a blanket claim, and this repo has been wrong about
 * blanket claims before. So this suite measures the round trip PER STORE, and
 * it measures it through the shape the real save path uses.
 *
 * WHY `JSON.parse(JSON.stringify(...))` IS THE LOAD-BEARING STEP
 * ────────────────────────────────────────────────────────────────────────────
 * `ProjectSerializer` builds a snapshot object and it is persisted as JSON.
 * `ViewDefinitionStore.serialize()` uses `structuredClone`, which PRESERVES
 * `Map`, `Set`, `Date` and `undefined`-vs-absent — none of which survive JSON.
 * A round-trip test that skips the stringify step therefore passes on data that
 * would be destroyed on the wire, which is precisely the failure mode worth
 * catching. Every case below crosses a real JSON boundary.
 *
 * SCOPE, STATED HONESTLY
 * ────────────────────────────────────────────────────────────────────────────
 * This measures the STORE layer: serialize → JSON → deserialize. It does NOT
 * prove the server round-trip, and it does NOT prove `ProjectSerializer` puts
 * these keys in the snapshot or that `ProjectLoader` calls deserialize — those
 * are separate assertions, made against the source below.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
    visibilityIntentStore,
    viewIntentInstanceStore,
} from '@pryzm/core-app-model/presentation';
import { viewDefinitionStore } from '@pryzm/core-app-model';

/** The wire. Everything persisted crosses this, so every test must too. */
function throughJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

const INTENT_ID = 'vi-roundtrip-promo-02';
const VIEW_ID = 'view-roundtrip-south-elevation';

function makeUserIntent() {
    return {
        id: INTENT_ID,
        name: 'promo 02',
        description: 'Round-trip fixture',
        isSystem: false,
        version: 1,
        elementRules: {
            __default__: {
                cut: {
                    visible: true,
                    line: { colour: '#111111', opacity: 1, style: 'solid' },
                    // The founder's actual edit: the slab fill colour in elevation.
                    fill: { colour: '#ff8800', opacity: 0.5, style: 'solid' },
                },
            },
            slab: {
                cut: {
                    visible: true,
                    line: { colour: '#222222', opacity: 1, style: 'solid' },
                    fill: { colour: '#00c2ff', opacity: 0.75, style: 'solid' },
                },
            },
        },
    } as never;
}

describe('§DOC-SETTINGS-ROUND-TRIP — visibilityIntentStore', () => {
    beforeEach(() => visibilityIntentStore.reset());
    afterEach(() => visibilityIntentStore.reset());

    it('a USER intent survives serialize → JSON → deserialize, fill colour intact', () => {
        visibilityIntentStore.create(makeUserIntent());
        expect(visibilityIntentStore.get(INTENT_ID)).toBeDefined();

        const wire = throughJson(visibilityIntentStore.serialize());
        visibilityIntentStore.reset();
        expect(visibilityIntentStore.get(INTENT_ID)).toBeUndefined(); // genuinely closed

        visibilityIntentStore.deserialize(wire);

        const back = visibilityIntentStore.get(INTENT_ID);
        expect(back).toBeDefined();
        expect(back?.name).toBe('promo 02');
        // The specific edit the founder reported making.
        expect((back as never as { elementRules: Record<string, { cut: { fill: { colour: string } } }> })
            .elementRules.slab.cut.fill.colour).toBe('#00c2ff');
    });

    it('SYSTEM intents are deliberately NOT persisted — they are rebuilt from code on load', () => {
        // This is by design, not a defect: `serialize()` writes only `_userIntents`,
        // and `deserialize()` skips any row with `isSystem`. Pinned so that a future
        // change to make system intents editable cannot silently ship a store that
        // drops those edits on reload.
        const snapshot = visibilityIntentStore.serialize();
        expect(snapshot.intents.every(i => !i.isSystem)).toBe(true);

        const systemIntents = visibilityIntentStore.getAll().filter(i => i.isSystem);
        expect(systemIntents.length).toBeGreaterThan(0);          // they exist…
        expect(snapshot.intents.map(i => i.id))
            .not.toEqual(expect.arrayContaining(systemIntents.map(i => i.id))); // …and none are saved
    });
});

describe('§DOC-SETTINGS-ROUND-TRIP — viewIntentInstanceStore (per-view binding + overrides)', () => {
    beforeEach(() => {
        visibilityIntentStore.reset();
        viewIntentInstanceStore.reset();
        viewDefinitionStore.reset();
        visibilityIntentStore.create(makeUserIntent());
        viewDefinitionStore.create({ id: VIEW_ID, name: 'South Elevation', viewType: 'elevation' });
    });
    afterEach(() => {
        visibilityIntentStore.reset();
        viewIntentInstanceStore.reset();
        viewDefinitionStore.reset();
    });

    it('the view→intent BINDING survives the round trip', () => {
        viewIntentInstanceStore.assign(VIEW_ID, INTENT_ID);
        expect(viewIntentInstanceStore.get(VIEW_ID)?.intentId).toBe(INTENT_ID);

        const wire = throughJson(viewIntentInstanceStore.serialize());
        viewIntentInstanceStore.reset();
        expect(viewIntentInstanceStore.has(VIEW_ID)).toBe(false);

        viewIntentInstanceStore.deserialize(wire);
        expect(viewIntentInstanceStore.get(VIEW_ID)?.intentId).toBe(INTENT_ID);
    });

    it('per-view local OVERRIDES survive the round trip', () => {
        viewIntentInstanceStore.assign(VIEW_ID, INTENT_ID);
        viewIntentInstanceStore.updateOverrides(VIEW_ID, {
            isolateActive: false,
            visibilityOverrides: [{ targetKind: 'elementType', targetId: 'furniture', visible: false } as never],
            graphicOverrides: [
                { targetKind: 'elementType', targetId: 'slab', state: 'cut',
                  appearance: { fill: { colour: '#abcdef' } } } as never,
            ],
        } as never);

        const wire = throughJson(viewIntentInstanceStore.serialize());
        viewIntentInstanceStore.reset();
        viewIntentInstanceStore.deserialize(wire);

        const layer = viewIntentInstanceStore.get(VIEW_ID)?.localOverrides;
        expect(layer?.visibilityOverrides).toHaveLength(1);
        expect(layer?.graphicOverrides).toHaveLength(1);
        expect((layer?.visibilityOverrides[0] as never as { targetId: string }).targetId).toBe('furniture');
        expect((layer?.graphicOverrides[0] as never as { appearance: { fill: { colour: string } } })
            .appearance.fill.colour).toBe('#abcdef');
    });
});

describe('§DOC-SETTINGS-ROUND-TRIP — viewDefinitionStore (crop / output / view range)', () => {
    beforeEach(() => viewDefinitionStore.reset());
    afterEach(() => viewDefinitionStore.reset());

    it('crop, output and viewRange all survive serialize → JSON → deserialize', () => {
        viewDefinitionStore.create({ id: VIEW_ID, name: 'South Elevation', viewType: 'elevation' });
        viewDefinitionStore.setCrop(VIEW_ID, {
            enabled: true,
            region: [[0, 0], [12.5, 0], [12.5, 9.25], [0, 9.25]],
        } as never);
        viewDefinitionStore.setViewRange(VIEW_ID, { topOffset: 2.3, cutPlane: 1.2, bottomOffset: 0, farOffset: 47 } as never);
        viewDefinitionStore.setOutput(VIEW_ID, { scale: 50, paperSize: 'A1' } as never);

        const wire = throughJson(viewDefinitionStore.serialize());
        viewDefinitionStore.reset();
        expect(viewDefinitionStore.get(VIEW_ID)).toBeUndefined();

        viewDefinitionStore.deserialize(wire);

        const back = viewDefinitionStore.get(VIEW_ID) as never as {
            crop?: { enabled: boolean; region?: number[][] };
            viewRange?: { farOffset: number; cutPlane: number };
            output?: { scale: number; paperSize: string };
        };
        expect(back).toBeDefined();
        expect(back.crop?.enabled).toBe(true);
        // A non-trivial nested array — the shape most likely to be flattened on the wire.
        expect(back.crop?.region).toEqual([[0, 0], [12.5, 0], [12.5, 9.25], [0, 9.25]]);
        expect(back.viewRange?.farOffset).toBe(47);
        expect(back.viewRange?.cutPlane).toBe(1.2);
        expect(back.output?.scale).toBe(50);
        expect(back.output?.paperSize).toBe('A1');
    });

    it('no persisted view field is a Map or Set (they do not survive JSON)', () => {
        viewDefinitionStore.create({ id: VIEW_ID, name: 'South Elevation', viewType: 'elevation' });
        viewDefinitionStore.setCrop(VIEW_ID, { enabled: true, region: [[0, 0], [1, 1]] } as never);

        const raw = viewDefinitionStore.serialize();
        const found: string[] = [];
        const walk = (node: unknown, path: string): void => {
            if (node instanceof Map || node instanceof Set) { found.push(path); return; }
            if (node && typeof node === 'object') {
                for (const [k, v] of Object.entries(node as Record<string, unknown>)) walk(v, `${path}.${k}`);
            }
        };
        walk(raw, 'snapshot');
        expect(found, `Map/Set fields are silently emptied by JSON: ${found.join(', ')}`).toEqual([]);
    });
});

describe('§DOC-SETTINGS-ROUND-TRIP — the snapshot actually carries these keys', () => {
    // Source-level, deliberately: instantiating ProjectSerializer needs the whole
    // engine (OBC, a World, fragments), which happy-dom cannot provide. The claim
    // "it is in the snapshot" is therefore asserted against the code that writes it.
    it('ProjectSerializer writes all three stores and ProjectLoader restores all three', async () => {
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');

        const ser = readFileSync(resolve(process.cwd(), 'apps/editor/src/engine/persistence/ProjectSerializer.ts'), 'utf8');
        for (const key of ['viewDefinitions:', 'visibilityIntents:', 'viewIntentInstances:']) {
            expect(ser, `ProjectSerializer no longer writes ${key}`).toContain(key);
        }
        for (const call of [
            'viewDefinitionStore.serialize()',
            'visibilityIntentStore.serialize()',
            'viewIntentInstanceStore.serialize()',
        ]) {
            expect(ser, `ProjectSerializer no longer calls ${call}`).toContain(call);
        }

        const load = readFileSync(resolve(process.cwd(), 'apps/editor/src/engine/persistence/ProjectLoader.ts'), 'utf8');
        for (const call of [
            'viewDefinitionStore.deserialize(',
            'visibilityIntentStore.deserialize(',
            'viewIntentInstanceStore.deserialize(',
        ]) {
            expect(load, `ProjectLoader no longer calls ${call} — the restore leg is dead`).toContain(call);
        }
    });
});
