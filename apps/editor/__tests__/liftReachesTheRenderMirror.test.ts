/**
 * §FIX-LIFT-LOST-BETWEEN-DISPATCH-AND-STORE (L-7820..L-7825) · C104 §10 · C11 §5.2.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THE ARM `liftReachableThroughComposedRuntime.test.ts` LACKS — AND SAYS IT LACKS.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * That suite is green today while the feature does not work, and it is honest about
 * why, in its own header: *"It does NOT prove that a person can click a Lift button and
 * get one."* It proves DISPATCH and it proves the six PLUGIN stores hold the records.
 * Both are real properties. Neither is the one the founder is reporting on:
 *
 *     [YjsDocAdapter] W5-3: command type 'lift.create' has NO sync disposition …
 *     [ProjectSerializer] Snapshot created: 14 elements, 2 levels, 12 walls, …
 *
 * The count was 14 before the click and 14 after. The command RAN — reaching the sync
 * adapter is what emits that W5-3 line — and no element landed anywhere a renderer or a
 * serializer looks.
 *
 * ─── WHERE IT WENT, MEASURED ───────────────────────────────────────────────────
 * `CommandEventBridge` is the ONLY relay from a command's committed patches to the
 * legacy mirrors that feed the 3-D scene and the element census. It had a case for
 * `balcony.create` — which is why the balcony works and lands five elements — and NO
 * case for `lift.create`, so the lift fell to `default: break;`. Measured 2026-08-23,
 * stated as a pattern because a bare substring matches the comments now added there:
 *     grep -nE "^\s+case 'lift\.(create|delete)'" CommandEventBridge.ts  -> 0 matches
 *     grep -in lift CommandEventBridge.ts                                -> 0 matches
 *
 * ⚠ AND THE SECOND HALF OF THE TRAP, WHICH IS WHY "there is a LiftMeshBuilder" IS NOT
 * A REBUTTAL: there are TWO lift stores. `LiftMeshBuilder` is real, is constructed
 * (initBuilders.ts:985) and listens to `LiftStore` — the LOD-200 MASSING lift. The
 * compound writes `LiftCompoundStore`. A builder exists, runs, and watches the other
 * store. UNDO37 hit the identical trap for undo (L-7311) and refused to alias them;
 * this file does not alias them either.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⛔ WHAT THIS FILE PINS, INCLUDING THE PART THAT IS STILL BROKEN.
 * ═══════════════════════════════════════════════════════════════════════════════
 * The fix is PARTIAL and this suite asserts the partiality rather than hiding it —
 * a partial fix asserted as a whole one is the exact defect this lane exists to avoid.
 *
 *   ARM A — a WALL-HOSTED lift's enclosure now reaches the legacy mirror. All four
 *           sides are `kind: 'wall'`, `wall.created` has live subscribers, so this
 *           type mirrors COMPLETELY and renders.
 *   ARM B — a STANDALONE-GLASS lift mirrors ONE side (the landing side is a wall; the
 *           other three are curtain walls with no event declared anywhere). The other
 *           three are NOT smuggled through as walls — that would be C84 EI-9 — and the
 *           bridge SAYS SO. ARM B pins the saying-so, because "it says so" is the
 *           founder's first deliverable: a create that produces no visible element must
 *           announce it.
 *   ARM C — the GENERIC detector. Any compound with no case announces itself the first
 *           time it is used. `pool.create` is the live case today.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
// ⭐ THE BRIDGE IS THE SUBJECT, SO IT IS WIRED EXACTLY AS `composeRuntime.ts:956`
// wires it — `wireCommandEventBridge(inner.bus.patches, events)`. `bootstrapWithEverything`
// returns the L0→L5 BASE runtime (bus + stores + patches) and does NOT compose the
// event surface, so a test that read `rt.events` would be measuring its own absence.
// ⚠ DEEP PATHS, NOT THE BARREL, AND DELIBERATELY. `@pryzm/runtime-composer`'s
// index re-exports the whole composition root, which reaches `@pryzm/file-format`'s
// `PDFToImageConverter` -> `pdfjs-dist`, which touches `DOMMatrix` AT MODULE SCOPE.
// This suite runs under the editor's NODE environment (its vitest config says do NOT
// switch to happy-dom), so the barrel kills COLLECTION before a single assertion runs.
// Same shape as [[server-safe-entry-can-import-browser-ui]]. The two symbols are taken
// from the modules that define them; the established precedent for that in this
// directory is ApartmentBriefDefaultStated / HostedPickPriority / ResidentialUnitHierarchy.
import { wireCommandEventBridge } from '../../../packages/runtime-composer/src/CommandEventBridge.js';
import { EventBus } from '../../../packages/runtime-composer/src/EventBus.js';

const AUDIT = 'lift-render-mirror';

const LIFT_ID = 'lift_01ARZ3NDEKTSV4RRFFQ69G5H10';
const HOST_WALL = 'wall_01ARZ3NDEKTSV4RRFFQ69G5H00';
const SLAB_L0 = 'slab_01ARZ3NDEKTSV4RRFFQ69G5H01';
const ENCLOSURE_IDS = [
    'wall_01ARZ3NDEKTSV4RRFFQ69G5H21',
    'wall_01ARZ3NDEKTSV4RRFFQ69G5H22',
    'wall_01ARZ3NDEKTSV4RRFFQ69G5H23',
    'wall_01ARZ3NDEKTSV4RRFFQ69G5H24',
];
const LANDING_DOOR_IDS = ['door_01ARZ3NDEKTSV4RRFFQ69G5H31'];
const CABIN_PART_IDS = [
    'liftPart_01ARZ3NDEKTSV4RRFFQ69G5H41',
    'liftPart_01ARZ3NDEKTSV4RRFFQ69G5H42',
    'liftPart_01ARZ3NDEKTSV4RRFFQ69G5H43',
    'liftPart_01ARZ3NDEKTSV4RRFFQ69G5H44',
    'liftPart_01ARZ3NDEKTSV4RRFFQ69G5H45',
];
const PLATE = [
    { x: 0, y: 0, z: 0 },
    { x: 12, y: 0, z: 0 },
    { x: 12, y: 0, z: 10 },
    { x: 0, y: 0, z: 10 },
];
const SERVED_LEVELS = [{ levelId: 'level-1', elevation: 0, slabId: SLAB_L0 }];

const basePayload = {
    liftId: LIFT_ID,
    levelId: 'level-1',
    origin: { x: 6, y: 0, z: 5 },
    rotation: 0,
    servedLevels: SERVED_LEVELS,
    enclosureIds: ENCLOSURE_IDS,
    landingDoorIds: LANDING_DOOR_IDS,
    cabinPartIds: CABIN_PART_IDS,
};

async function bootWithHost() {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    const events = new EventBus();
    const disposeBridge = wireCommandEventBridge(rt.bus.patches, events);
    await rt.bus.executeCommand('wall.create', {
        id: HOST_WALL,
        levelId: 'level-1',
        baseLine: [{ x: 0, y: 0, z: 5 }, { x: 12, y: 0, z: 5 }],
        height: 3,
        thickness: 0.2,
    });
    await rt.bus.executeCommand('slab.create', {
        id: SLAB_L0, levelId: 'level-1', boundary: PLATE,
    });
    return { rt, events, disposeBridge };
}

/**
 * Record every `wall.created` the runtime emits from here on.
 *
 * ⭐ THIS IS THE LAYER THAT WAS NEVER ASSERTED. The plugin store is what the old suite
 * reads; `runtime.events` is what the legacy mirrors — and therefore the mesh builders
 * and the element census — actually consume. [[committed-is-not-reachable]]: a record in
 * a store nothing subscribes to is exactly the state the founder photographed.
 */
function captureWallCreated(events: EventBus): Array<Record<string, unknown>> {
    const seen: Array<Record<string, unknown>> = [];
    events.on('wall.created', (ev) => { seen.push(ev as unknown as Record<string, unknown>); });
    return seen;
}

let warnSpy: ReturnType<typeof vi.spyOn> | null = null;
const warnings = (): string[] =>
    (warnSpy?.mock.calls ?? []).map((c) => c.map(String).join(' '));

afterEach(() => {
    warnSpy?.mockRestore();
    warnSpy = null;
});

describe('§FIX-LIFT-LOST-BETWEEN-DISPATCH-AND-STORE — the lift reaches the render mirror', () => {
    // ── ARM A ────────────────────────────────────────────────────────────────
    it('A-1 WALL-HOSTED: all four enclosure sides reach `wall.created`, so the shaft renders', async () => {
        const { rt, events, disposeBridge } = await bootWithHost();
        const seen = captureWallCreated(events);

        await rt.bus.executeCommand('lift.create', {
            ...basePayload,
            enclosureType: 'wall-hosted',
            hostWallId: HOST_WALL,
        });

        // ⭐ FOUR. Before this fix: ZERO — `lift.create` hit `default: break;`.
        expect(seen.length).toBe(4);
        expect(new Set(seen.map((e) => e['wallId']))).toEqual(new Set(ENCLOSURE_IDS));

        // Stamped with the MEMBER's verb, never the compound's: every legacy mirror
        // filters on `commandType`, so `'lift.create'` here would emit four events
        // nothing listens to — activation reported, nothing activated.
        for (const ev of seen) expect(ev['commandType']).toBe('wall.create');

        // And carrying the COMMITTED geometry, which is not in the payload at all —
        // `buildLiftAssembly` computes it. An event without `baseLine` mirrors a wall
        // with no position, which renders as nothing just as silently.
        for (const ev of seen) {
            expect(Array.isArray(ev['baseLine'])).toBe(true);
            expect((ev['baseLine'] as unknown[]).length).toBeGreaterThanOrEqual(2);
            expect(typeof ev['height']).toBe('number');
            expect(ev['levelId']).toBe('level-1');
        }
        disposeBridge();
        rt.tearDown();
    });

    it('A-2 the PRE-EXISTING host wall is NOT re-emitted', async () => {
        // ⛔ THE DUPLICATE-RECORD TRAP. A wall-hosted lift NAMES an existing wall, and
        // the `wall` store slice of the commit must not be read as "every wall here is
        // new". The filter is `parentId === liftId`, which the assembly stamps on the
        // sides it builds and which the host — created by a separate command — lacks.
        const { rt, events, disposeBridge } = await bootWithHost();
        const seen = captureWallCreated(events);

        await rt.bus.executeCommand('lift.create', {
            ...basePayload,
            enclosureType: 'wall-hosted',
            hostWallId: HOST_WALL,
        });

        expect(seen.map((e) => e['wallId'])).not.toContain(HOST_WALL);
        disposeBridge();
        rt.tearDown();
    });

    // ── ARM B ────────────────────────────────────────────────────────────────
    it('B-1 STANDALONE-GLASS: the partial create ANNOUNCES what will not render', async () => {
        // ⭐ THE FOUNDER'S ACTUAL LIFT — his status bar read "standalone glass". Three
        // of its four sides are curtain walls, `curtainwall.created` is not a declared
        // event anywhere, and they are deliberately NOT mirrored as walls (C84 EI-9).
        // So the deliverable for THIS type is not "it renders" — it is "it stops being
        // silent", which is the first thing the report asks for.
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { rt, events, disposeBridge } = await bootWithHost();
        const seen = captureWallCreated(events);

        await rt.bus.executeCommand('lift.create', {
            ...basePayload,
            enclosureType: 'standalone-glass',
        });

        // The landing side IS a wall in both enclosure types, so exactly one mirrors.
        expect(seen.length).toBe(1);

        const said = warnings().find((w) => w.includes('§FIX-LIFT-LOST-BETWEEN-DISPATCH-AND-STORE'));
        expect(said).toBeDefined();
        // It names the STORE, the COUNT and the REASON — not "something went wrong".
        expect(said).toContain('3 curtain-wall enclosure side(s)');
        expect(said).toContain(String(LANDING_DOOR_IDS.length) + ' landing door(s)');
        expect(said).toContain(String(CABIN_PART_IDS.length) + ' cabin part(s)');
        // ⛔ And it refuses the comfortable word. This is a PARTIAL create: the record
        // is real, undoable and schedulable, and part of it is invisible. Calling that
        // "failed" or "created" would both be wrong.
        expect(said).toContain('PARTIAL create');
        disposeBridge();
        rt.tearDown();
    });

    it('B-2 the un-mirrored members really ARE in their plugin stores — absent ≠ unreachable', async () => {
        // C01 §6 rule 6. The warning must describe UNREACHABLE, not ABSENT, and those
        // have opposite fixes. If the doors and parts were simply never written, the
        // fix would be in the handler; they ARE written, so the fix is a mirror.
        const { rt, disposeBridge } = await bootWithHost();
        await rt.bus.executeCommand('lift.create', {
            ...basePayload,
            enclosureType: 'standalone-glass',
        });

        expect(rt.stores.lift.getState().get(LIFT_ID)).toBeDefined();
        for (const id of LANDING_DOOR_IDS) expect(rt.stores.door.getState().get(id)).toBeDefined();
        for (const id of CABIN_PART_IDS) expect(rt.stores.liftPart.getState().get(id)).toBeDefined();
        disposeBridge();
        rt.tearDown();
    });

    // ── ARM C ────────────────────────────────────────────────────────────────
    it('C-1 GENERIC: a compound with NO case in the bridge announces itself', async () => {
        // ⭐ THE REASON THIS ARM EXISTS RATHER THAN A COMMENT. The balcony case already
        // said in prose that the pool had this defect — "⚠ THAT IS NOT HYPOTHETICAL —
        // IT IS THE SWIMMING POOL'S LIVE STATE" — and the lift then shipped with the
        // identical defect and the identical silence. A comment is not a detector. This
        // pins that the NEXT compound to arrive without a case is loud the first time a
        // person uses it, instead of being found in a founder's screenshot of an element
        // count that did not move.
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { rt, disposeBridge } = await bootWithHost();

        await rt.bus.executeCommand('pool.create', {
            poolId: 'pool_01ARZ3NDEKTSV4RRFFQ69G5H50',
            levelId: 'level-1',
            boundary: [
                { x: 2, y: 0, z: 2 }, { x: 6, y: 0, z: 2 },
                { x: 6, y: 0, z: 6 }, { x: 2, y: 0, z: 6 },
            ],
            hostSlabId: SLAB_L0,
            wallIds: [
                'wall_01ARZ3NDEKTSV4RRFFQ69G5H61', 'wall_01ARZ3NDEKTSV4RRFFQ69G5H62',
                'wall_01ARZ3NDEKTSV4RRFFQ69G5H63', 'wall_01ARZ3NDEKTSV4RRFFQ69G5H64',
            ],
            floorSlabId: 'slab_01ARZ3NDEKTSV4RRFFQ69G5H70',
            waterId: 'floor_01ARZ3NDEKTSV4RRFFQ69G5H71',
        });

        const said = warnings().find((w) => w.includes('§FIX-COMPOUND-SILENT-DROP'));
        expect(said).toBeDefined();
        expect(said).toContain('pool.create');
        // It names the stores it wrote, so the reader can go and add the case without
        // re-deriving the census.
        expect(said).toMatch(/committed a COMPOUND across \d+ stores/);
        disposeBridge();
        rt.tearDown();
    });
});
