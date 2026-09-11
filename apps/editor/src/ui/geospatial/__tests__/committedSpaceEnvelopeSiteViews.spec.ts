/**
 * §COMMITTED-ENVELOPE-ON-EVERY-VIEW (L-13310) — a COMMITTED space envelope reaches the 2-D site map
 * and the 3-D Site, with its name, and leaves them when it is deleted.
 *
 * Founder, 2026-09-11: *"the envelopes (no matter if created on plan view or 3d view) dont render
 * on plan view - they should!"* · *"i would like it to render also on 3d site view."*
 *
 * ROOT CAUSES this suite pins shut:
 *   1. 2-D site map — `mountSiteBoundaryMap2D` read `runtime?.stores?.spaceEnvelope` off its
 *      MOUNT-TIME runtime, which `GISAreaLayout` passes as `null` on the live boot path by design.
 *      The layer was therefore always empty and its dirty listener never installed.
 *   2. Both site views — the outline was drawn in the FILL colour, and the level fill is the pale
 *      to-be-built white-grey, so on a light ground the prism had no edge at all; and the name was
 *      drawn nowhere.
 *
 * ✅ ESTABLISHES (behavioural, real `CommandBus` + real `SpaceEnvelopeStore` + real handlers): the
 *    feed the 2-D map now uses survives a NULL mount-time runtime and starts hearing the store the
 *    moment one is reachable; the ONE site model both rasterisers consume contains the committed
 *    envelope — name, ink, geometry — after a create and drops it after a delete.
 * ✅ AND THE JOIN (source, comments stripped): each rasteriser actually consumes that model and
 *    feed, paints the ink and draws the label. A source arm is weaker than a pixel — the MapLibre
 *    and Cesium surfaces need a GL context — and it is used only for the join, never for behaviour.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CommandBus, PatchEmitter, UndoStack } from '@pryzm/command-bus';
import { attachStores, type Store } from '@pryzm/stores';
import {
    SpaceEnvelopeStore,
    buildSpaceEnvelopeHandlerSet,
    type SpaceEnvelopesState,
} from '@pryzm/plugin-space-envelope';
import {
    buildSpaceEnvelopeSitePrisms,
    createSpaceEnvelopeStoreFeed,
    spaceEnvelopeStoreOf,
} from '../spaceEnvelopeSiteModel';
import { TO_BE_BUILT_FILL_CSS, TO_BE_BUILT_INK_CSS } from '../../site/toBeBuiltEnvelopeStyle';

const ID_A = 'spaceEnvelope_01J0000000000000000000000A';
const ID_B = 'spaceEnvelope_01J0000000000000000000000B';

function buildEnv() {
    const spaceEnvelope = new SpaceEnvelopeStore();
    const emitter = new PatchEmitter();
    const undoStack = new UndoStack({ maxSize: 50 });
    const bus = new CommandBus({
        audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
        emitter,
        undoStack,
        storesProvider: () => ({
            spaceEnvelope: Object.fromEntries(spaceEnvelope.getState()) as SpaceEnvelopesState,
        }),
    });
    for (const h of buildSpaceEnvelopeHandlerSet()) bus.register(h as Parameters<typeof bus.register>[0]);
    attachStores(emitter, { spaceEnvelope: spaceEnvelope as unknown as Store<object> });
    return { spaceEnvelope, bus };
}

function levelSpec(id: string, name?: string) {
    return {
        spaceEnvelopeId: id,
        levelId: 'level-1',
        role: 'level' as const,
        ...(name !== undefined ? { name } : {}),
        baseOffset: 3,
        height: 3,
        footprint: [
            { x: 0, y: 0, z: 0 }, { x: 12, y: 0, z: 0 },
            { x: 12, y: 0, z: 8 }, { x: 0, y: 0, z: 8 },
        ],
    };
}

describe('⭐ the 2-D map feed survives the NULL mount-time runtime (root cause 1)', () => {
    it('reads null while no runtime exists, then hears the store from the first read that finds it', async () => {
        const env = buildEnv();
        // The production condition: at mount the runtime is null; it arrives later.
        let runtime: unknown = null;
        let changes = 0;
        const feed = createSpaceEnvelopeStoreFeed(() => spaceEnvelopeStoreOf(runtime), () => { changes += 1; });

        expect(feed.ensure()).toBe(false);
        // ⛔ UNREACHABLE is null — never an empty map dressed as "nothing authored".
        expect(feed.read()).toBeNull();

        runtime = { stores: { spaceEnvelope: env.spaceEnvelope } };
        expect(feed.read()?.size).toBe(0); // reachable and empty — and now subscribed

        await env.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [levelSpec(ID_A, 'ENV_L1_001')] });
        expect(changes).toBeGreaterThanOrEqual(1);
        const records = feed.read()!;
        const model = buildSpaceEnvelopeSitePrisms(records);
        const prism = model.prisms.find((p) => p.id === ID_A);
        expect(prism, 'the committed envelope is absent from the site model').toBeDefined();
        expect(prism!.label).toBe('ENV_L1_001');
        expect(prism!.ring).toHaveLength(4);
        expect(prism!.baseOffset).toBe(3);
        expect(prism!.height).toBe(3);
        expect(prism!.labelAnchor).toEqual({ x: 6, z: 4 });

        const afterCreate = changes;
        await env.bus.executeCommand('spaceEnvelope.delete', { spaceEnvelopeId: ID_A });
        expect(changes).toBeGreaterThan(afterCreate);
        expect(buildSpaceEnvelopeSitePrisms(feed.read()!).prisms.find((p) => p.id === ID_A)).toBeUndefined();

        // Disposed ⇒ deaf, so a torn-down map cannot repaint into a removed source.
        feed.dispose();
        const afterDispose = changes;
        await env.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [levelSpec(ID_B, 'ENV_L1_002')] });
        expect(changes).toBe(afterDispose);
    });

    it('follows the resolver to a DIFFERENT store instance and drops the old one', async () => {
        const a = buildEnv();
        const b = buildEnv();
        let runtime: unknown = { stores: { spaceEnvelope: a.spaceEnvelope } };
        let changes = 0;
        const feed = createSpaceEnvelopeStoreFeed(() => spaceEnvelopeStoreOf(runtime), () => { changes += 1; });
        expect(feed.ensure()).toBe(true);
        runtime = { stores: { spaceEnvelope: b.spaceEnvelope } };
        expect(feed.ensure()).toBe(true);
        await a.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [levelSpec(ID_A, 'OLD')] });
        expect(changes).toBe(0);
        await b.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [levelSpec(ID_A, 'NEW')] });
        expect(changes).toBeGreaterThanOrEqual(1);
        feed.dispose();
    });

    it('⭐ heal() is TRUE exactly once — on the call that starts hearing a newly reachable store', async () => {
        // The map that LOADED before the runtime existed reads again only on a basemap swap; its
        // pane lifecycle calls heal() and repaints only when heal() says the store is new to it.
        const env = buildEnv();
        let runtime: unknown = null;
        let changes = 0;
        const feed = createSpaceEnvelopeStoreFeed(() => spaceEnvelopeStoreOf(runtime), () => { changes += 1; });
        expect(feed.heal()).toBe(false);            // nothing reachable yet
        runtime = { stores: { spaceEnvelope: env.spaceEnvelope } };
        expect(feed.heal()).toBe(true);             // the runtime arrived — the caller repaints now
        expect(feed.heal()).toBe(false);            // already hearing it — no redundant repaint
        await env.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [levelSpec(ID_A, 'ENV_L1_001')] });
        expect(changes).toBeGreaterThanOrEqual(1);  // heard WITHOUT any read()
        feed.dispose();
        expect(feed.heal()).toBe(false);
    });

    it('a runtime whose store lacks subscribeDirty is UNREACHABLE, not empty', () => {
        expect(spaceEnvelopeStoreOf({ stores: { spaceEnvelope: { getState: () => new Map() } } })).toBeNull();
        expect(spaceEnvelopeStoreOf(null)).toBeNull();
        expect(spaceEnvelopeStoreOf({})).toBeNull();
    });
});

describe('⭐ the ONE site model (root cause 2: ink and name)', () => {
    it('a level envelope is filled with the to-be-built fill and edged in the INK, never in its own fill', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [levelSpec(ID_A, 'ENV_L1_001')] });
        const [prism] = buildSpaceEnvelopeSitePrisms(env.spaceEnvelope.getState() as ReadonlyMap<string, unknown>).prisms;
        expect(prism!.appearance.colour).toBe(TO_BE_BUILT_FILL_CSS);
        expect(prism!.appearance.ink).toBe(TO_BE_BUILT_INK_CSS);
        expect(prism!.appearance.ink).not.toBe(prism!.appearance.colour);
    });

    it('⭐ the label IS the record\'s name — including the one the create verb mints (Lane C)', async () => {
        // A create with no name gets a unique queryable one from the handler (2fb7f8f7). The
        // label must read THAT field, not re-derive one, so the name the panels show is the name
        // on the prism.
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [levelSpec(ID_A)] });
        const rec = env.spaceEnvelope.get(ID_A) as { name?: unknown } | undefined;
        expect(typeof rec?.name).toBe('string');
        const [prism] = buildSpaceEnvelopeSitePrisms(env.spaceEnvelope.getState() as ReadonlyMap<string, unknown>).prisms;
        expect(prism!.label).toBe(rec!.name);
    });

    it('⛔ an unnamed RECORD (a pre-naming save) gets NO invented label', () => {
        const records = new Map<string, unknown>([
            ['old', { role: 'level', baseOffset: 0, height: 3,
                footprint: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }] }],
        ]);
        const [prism] = buildSpaceEnvelopeSitePrisms(records).prisms;
        expect(prism!.label).toBeNull();
    });

    it('a face-drag preview overrides GEOMETRY ONLY; a malformed row is counted, not drawn', () => {
        const records = new Map<string, unknown>([
            ['ok', { role: 'level', name: 'ENV_L0_001', baseOffset: 0, height: 3,
                footprint: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }] }],
            ['noHeight', { role: 'level', baseOffset: 0, footprint: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }] }],
            ['twoPoints', { role: 'level', baseOffset: 0, height: 3, footprint: [{ x: 0, z: 0 }, { x: 4, z: 0 }] }],
            ['junk', 42],
        ]);
        const previews = new Map([['ok', { footprint: [{ x: 0, z: 0 }, { x: 9, z: 0 }, { x: 9, z: 9 }], baseOffset: 0, height: 5 }]]);
        const model = buildSpaceEnvelopeSitePrisms(records, previews);
        expect(model.prisms.map((p) => p.id)).toEqual(['ok']);
        expect(model.skipped).toBe(3);
        expect(model.prisms[0]!.height).toBe(5);
        expect(model.prisms[0]!.ring[1]).toEqual({ x: 9, z: 0 });
        expect(model.prisms[0]!.label).toBe('ENV_L0_001'); // identity still the record's
    });
});

// ─── THE JOIN — each rasteriser consumes the model / feed (source, comments stripped) ────────
const codeOnly = (t: string): string =>
    t.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const MAP2D = codeOnly(readFileSync(resolve(__dirname, '../SiteBoundaryMap2D.ts'), 'utf8'));
const VIEWPORT = codeOnly(readFileSync(resolve(__dirname, '../CesiumViewport.ts'), 'utf8'));

describe('the 2-D site map consumes the feed and the model', () => {
    it('⛔ it no longer reads the MOUNT-TIME runtime for the store', () => {
        expect(MAP2D).not.toContain('runtime?.stores?.spaceEnvelope');
        expect(MAP2D).toMatch(/createSpaceEnvelopeStoreFeed\(\s*\(\) => spaceEnvelopeStoreOf\(liveRuntime\(\)\)/);
        const live = MAP2D.slice(MAP2D.indexOf('const liveRuntime'), MAP2D.indexOf('const liveRuntime') + 300);
        expect(live).toContain('window.runtime');
    });

    it('the feature collection is built from the feed, through the ONE model, carrying ink and label', () => {
        const fn = MAP2D.slice(MAP2D.indexOf('function spaceEnvelopeFeatureCollection'),
            MAP2D.indexOf('function pickMassingGroupAt'));
        expect(fn).toContain('spaceEnvelopeFeed.read()');
        expect(fn).toContain('buildSpaceEnvelopeSitePrisms(records)');
        expect(fn).toContain('ink: prism.appearance.ink');
        expect(fn).toContain('label: prism.label');
    });

    it('the outline paints the INK and a label layer paints the NAME', () => {
        // Scoped to the SPACE-envelope line layer: the solved buildable envelope is a different
        // object and legitimately keeps its confidence hue on its own line.
        const at = MAP2D.indexOf('id: SPACE_ENVELOPE_LINE_LAYER,');
        const layer = MAP2D.slice(at, MAP2D.indexOf('}, map.getLayer(FILL_LAYER)', at));
        expect(layer).toContain("'line-color': ['get', 'ink']");
        expect(layer).not.toContain("['get', 'hue']");
        expect(MAP2D).toContain("'text-field': ['coalesce', ['get', 'label'], '']");
        expect(MAP2D).toContain('styleHasGlyphs()');
    });

    it('the pane lifecycle (re-target, resize) heals a feed that missed the runtime at load', () => {
        expect(MAP2D).toMatch(/if \(spaceEnvelopeFeed\.heal\(\)\) refreshSpaceEnvelopes\(\)/);
        const handle = MAP2D.slice(MAP2D.indexOf('reparentTo: (host: HTMLElement): void => {'),
            MAP2D.indexOf('setBuildableEnvelope: (solids'));
        expect(handle.match(/healSpaceEnvelopeFeed\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    });
});

describe('the 3-D Site consumes the model, edges in the ink and names each prism', () => {
    const body = (() => {
        const at = VIEWPORT.indexOf('private renderSpaceEnvelopes(): void {');
        return VIEWPORT.slice(at, VIEWPORT.indexOf('\n  }\n', at));
    })();

    it('renderSpaceEnvelopes iterates the ONE model, previews included', () => {
        expect(body).toContain('buildSpaceEnvelopeSitePrisms(records, this.spaceEnvelopePreviews)');
    });

    it('the outline is the ink, and the name is a label entity cleared with the prisms', () => {
        expect(body).toContain('outlineColor: ink.withAlpha(groupEmphasis.alphaFactor)');
        expect(body).toMatch(/label: \{\s*text: prism\.label/);
        expect(body).toContain('this.spaceEnvelopeEntities.push(tag)');
    });

    it('ADR-0383 S8 — a click on the name tag selects the SAME block as its prism', () => {
        // The tag sits over the prism's top with depth test off, covering its natural click target.
        expect(body).toMatch(
            /this\.spaceEnvelopeEntities\.push\(tag\);\s*if \(groupRef !== null\) this\.massingGroupByEntity\.set\(tag, groupRef\);/,
        );
    });
});
