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
 *   ARM B — a STANDALONE-GLASS lift. ⭐ REWRITTEN 2026-08-23 (lane LIFT56,
 *           §FEAT-LIFT-OBSERVATION-FRAME, L-9400..L-9403). This arm used to pin the
 *           PARTIALITY — one side mirrored, three announced as un-renderable — and it
 *           was correct to do so while that was true. It is no longer true, and the
 *           reason is the finding worth keeping:
 *
 *             ⛔ THE CENSUS THIS ARM ENCODED WAS MEASURED WITH THE WRONG SPELLING.
 *             `curtain-wall.created` — HYPHENATED — has been declared, emitted and
 *             mirrored since §P3.1-CW. The census grepped `curtainwall.created`.
 *             And a landing door's channel was never `door.created` at all: it is
 *             `wall.opening.created`, the §P2.3 mirror that punches the hole AND
 *             writes the `DoorStore` record. Two of the three "missing" channels
 *             existed and were merely unconnected.
 *             [[grep-silence-has-three-causes]] — silence is not absence.
 *
 *           ARM B now pins that a standalone-glass lift mirrors COMPLETELY: one wall,
 *           three curtain walls, one opening per served storey, and one `lift.created`
 *           carrying the cabin + frame. B-3 pins the OTHER half of R-13, which is the
 *           half a passing test usually forgets — that the diagnostic GOES QUIET when
 *           there is nothing left to report.
 *   ARM C — the GENERIC detector. Any compound with no case announces itself the first
 *           time it is used. `pool.create` is the live case today.
 *   ARM D — ⭐ THE LAST HOP, WHICH IS THE ONE NOTHING ELSE CAN SEE. ARMs A–C prove the
 *           bridge EMITS; `geometry-lift/__tests__/LiftCompoundReachesTheMesh.test.ts`
 *           proves the builder turns parts into MESHES. Between them sits one
 *           subscriber in `initTools.ts` — and `initTools` cannot be imported by any
 *           suite (it needs a THREE world, a components registry, a command manager and
 *           twenty stores before its first line runs). ⛔ That is exactly how L-972's
 *           five constant-false reads survived in plain sight, and an unproven hop
 *           between two proven ones is where "committed ≠ reachable" lives. So the
 *           wiring is pinned as SOURCE TEXT, the established idiom here
 *           (`projectScopedBuilderTeardown.test.ts`, `gisProjectIsolationOwnerGate`,
 *           `mountedDrawingIsolation`). A source scan is weaker than an execution and
 *           is used because the alternative is nothing, not because it is equal.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
    return captureEvent(events, 'wall.created');
}

/** The same, for any declared event name. One helper, so a new arm cannot drift. */
function captureEvent(events: EventBus, name: string): Array<Record<string, unknown>> {
    const seen: Array<Record<string, unknown>> = [];
    (events as unknown as { on: (n: string, f: (e: unknown) => void) => void }).on(
        name,
        (ev) => { seen.push(ev as Record<string, unknown>); },
    );
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
    it('⭐ B-1 STANDALONE-GLASS: the THREE GLASS SIDES reach `curtain-wall.created`', async () => {
        // ⭐ THE FOUNDER'S ACTUAL LIFT — his status bar read "standalone glass", and
        // what he saw was ONE WALL. Three of its four sides are curtain walls, and the
        // old reading of this file said no curtain-wall event was declared ANYWHERE.
        //
        // ⛔ IT IS DECLARED. `curtain-wall.created`, hyphenated, with a live §P3.1-CW
        // mirror that maps it onto the legacy `CurtainWallData` and fires
        // `bim-curtainwall-added`. Nothing needed inventing; the bridge needed to emit
        // into a channel that was already open. Nothing is smuggled through as a wall,
        // so R-12 holds — because nothing had to be.
        const { rt, events, disposeBridge } = await bootWithHost();
        const walls = captureWallCreated(events);
        const glass = captureEvent(events, 'curtain-wall.created');

        await rt.bus.executeCommand('lift.create', {
            ...basePayload,
            enclosureType: 'standalone-glass',
        });

        // ONE wall (the landing side, which stays solid so the doors have a host)…
        expect(walls.length).toBe(1);
        // …and THREE curtain walls. Before this fix: ZERO.
        expect(glass.length).toBe(3);
        expect(new Set([...walls, ...glass].map((e) => e['wallId'] ?? e['id'])))
            .toEqual(new Set(ENCLOSURE_IDS));

        for (const ev of glass) {
            // ⛔ The mirror's accept-set is the single literal 'curtain-wall.create'
            // (`ACCEPTED_CURTAIN_WALL_COMMAND_TYPES`). Any other value and the mirror
            // returns null — three events emitted, nothing accepted.
            expect(ev['commandType']).toBe('curtain-wall.create');
            expect(Array.isArray(ev['baseLine'])).toBe(true);
            expect(typeof ev['height']).toBe('number');
            // ⚠ WITHOUT THESE TWO THE MESH IS EMPTY, not merely ungridded:
            // `migrateToGridSystem()` reads them as gridXSpacing/gridYSpacing and
            // yields NaN -> 0 mullion counts without finite positives.
            expect(typeof ev['bayWidth']).toBe('number');
            expect((ev['bayWidth'] as number) > 0).toBe(true);
            expect(typeof ev['bayHeight']).toBe('number');
            expect((ev['bayHeight'] as number) > 0).toBe(true);
            // C100 §6.1 — a MASTER id, never a hex.
            expect(typeof ev['materialId']).toBe('string');
            expect(String(ev['materialId'])).not.toMatch(/^#/);
        }
        disposeBridge();
        rt.tearDown();
    });

    it('⭐ B-1b the LANDING DOORS reach `wall.opening.created` — the hole AND the leaf', async () => {
        // ⭐ AND THE CHANNEL IS NOT `door.created`. That event is a bare count
        // (`{commandId, commandType, levelId, elementCount}`) whose CEB case TASK-13
        // removed on purpose — doors use the Committer architecture. The channel that
        // does the work is §P2.3's `wall.opening.created`, which does BOTH halves:
        // `addOpening()` on the legacy wall (the hole in the shaft) and
        // `doorStore.add(buildDoorStoreRecord(...))` (the leaf + the plan swing arc).
        // Giving `door.created` a subscriber would have minted a SECOND channel for a
        // concept that already has one — C84 EI-9, the rule the old text invoked.
        const { rt, events, disposeBridge } = await bootWithHost();
        const openings = captureEvent(events, 'wall.opening.created');

        await rt.bus.executeCommand('lift.create', {
            ...basePayload,
            enclosureType: 'standalone-glass',
        });

        // One per SERVED LEVEL, which is what `servedLevelIds` buys over a count.
        expect(openings.length).toBe(SERVED_LEVELS.length);
        for (const ev of openings) {
            const o = ev['opening'] as Record<string, unknown>;
            expect(o['type']).toBe('door');
            // ⛔ The OPENING id, not the door id. They are two records — the hole and
            // the thing in it — and §P2.3 dedups the wall on one and the DoorStore on
            // the other. Collapsing them would make one of the two guards useless.
            expect(typeof o['id']).toBe('string');
            expect(String(o['id']).length).toBeGreaterThan(0);
            expect(o['id']).not.toBe(o['elementId']);
            expect(LANDING_DOOR_IDS).toContain(o['elementId']);
            expect(typeof o['width']).toBe('number');
            expect(typeof o['sillHeight']).toBe('number');
            // Hosted in the LANDING side, which is one of this lift's own sides.
            expect(ENCLOSURE_IDS).toContain(ev['wallId']);
        }
        disposeBridge();
        rt.tearDown();
    });

    it('⭐ B-1c the CABIN, FRAME and GUIDE RAILS reach `lift.created` — the built channel', async () => {
        // ⭐ THE ONE MEMBER KIND WHOSE ORIGINAL DIAGNOSIS WAS EXACTLY RIGHT: "no legacy
        // family and no fragment builder". There was nothing to connect, so this is the
        // one place something was BUILT — `LiftCompoundMeshBuilder`, driven by this
        // event through initTools' §FT-LIFT subscriber.
        const { rt, events, disposeBridge } = await bootWithHost();
        const lifts = captureEvent(events, 'lift.created');

        await rt.bus.executeCommand('lift.create', {
            ...basePayload,
            enclosureType: 'standalone-glass',
        });

        // ONE event for the whole compound, not one per part: the builder rebuilds the
        // group in a single pass, so N events would be N rebuilds for one gesture.
        expect(lifts.length).toBe(1);
        const ev = lifts[0]!;
        expect(ev['liftId']).toBe(LIFT_ID);
        const parts = ev['parts'] as Array<Record<string, unknown>>;

        // The five pre-minted cabin parts…
        const kinds = parts.map((p) => String(p['kind']));
        for (const id of CABIN_PART_IDS) {
            expect(parts.some((p) => p['id'] === id), `cabin part ${id} missing`).toBe(true);
        }
        // …AND the steel frame the founder's reference is mostly made of.
        expect(kinds.filter((k) => k === 'frame-column').length).toBe(4);
        expect(kinds.filter((k) => k === 'guide-rail').length).toBe(2);
        expect(kinds.filter((k) => k === 'frame-ring-beam').length).toBeGreaterThan(0);

        // ⚠ Without this the car is drawn on the level datum instead of at its lowest
        // served landing — a car hanging in the shaft at the wrong floor.
        expect(typeof ev['carParkOffsetY']).toBe('number');

        // The frame members carry an AXIS (they are linear) and a MASTER material id.
        const col = parts.find((p) => p['kind'] === 'frame-column')!;
        expect(col['axis']).toBeDefined();
        expect(typeof col['materialId']).toBe('string');
        expect(String(col['materialId'])).not.toMatch(/^#/);
        // The cabin parts do NOT carry an axis — they are car-local boxes.
        const cab = parts.find((p) => p['kind'] === 'cabin-floor')!;
        expect(cab['axis']).toBeUndefined();
        disposeBridge();
        rt.tearDown();
    });

    it('⭐ B-3 R-13 BOTH WAYS: the shaft VOID now rides the mutation channel, and the frame goes quiet', async () => {
        // ═══════════════════════════════════════════════════════════════════════
        // ⛔ THE HALF A PASSING TEST FORGETS. C104 R-13 says a create that produces
        // no visible element must SAY so. The complement is just as binding and is
        // the half that rots: a warning that fires on every successful lift is a
        // warning nobody reads, which fails in exactly the way silence does.
        // ═══════════════════════════════════════════════════════════════════════
        //
        // ⭐ REWRITTEN 2026-08-23 (lane MIRROR3, L-9943), AND THE REASON IS THE POINT
        // OF THE ROW. This arm used to assert that the warning FIRED and CONTAINED
        // `'slab void(s)'` — i.e. it pinned the DEFECT. L-9403's diagnosis was right
        // and its scope was wrong: *"there is no `slab.updated` mirror in
        // initTools.ts"* was true of the WHOLE REPOSITORY, not of the lift
        // (`grep -c "\.updated'" initTools.ts` -> 0). So the fix was not lift-shaped,
        // and the moment `element.updated` existed this assertion went red for the
        // right reason: **a test that asserts a warning is present is satisfied only
        // while the bug is.**
        //
        // ⛔ THE DIAGNOSTIC BLOCK IN THE BRIDGE IS NOT DELETED, and neither is this
        // arm. Its job was never to carry one row — it is what notices the NEXT member
        // kind to arrive without a mirror. What changes is the SUBJECT: (a) now proves
        // the void REACHES the channel, and both halves prove the frame is SILENT
        // because there is nothing left to say. The generic detector keeps its own
        // arm at C-1.
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { rt, events, disposeBridge } = await bootWithHost();

        const updated: Record<string, unknown>[] = [];
        events.on('element.updated', (ev: unknown) => updated.push(ev as Record<string, unknown>));

        // (a) WITH a penetrated slab. The void is a REPLACE on an existing slab's
        //     `holes`; §MIRROR-UPDATE (L-9942) is the channel that carries it.
        await rt.bus.executeCommand('lift.create', {
            ...basePayload,
            enclosureType: 'standalone-glass',
        });

        const voids = updated.filter((e) => e['elementKind'] === 'slab');
        expect(voids.length, 'the shaft penetrates a plate — that must reach a mirror')
            .toBeGreaterThan(0);
        expect(voids[0]!['elementId'], 'keyed by the SLAB it penetrates, not by the lift')
            .toBe(SLAB_L0);
        expect(voids[0]!['changedFields']).toEqual(['holes']);
        expect(voids[0]!['commandType'], 'stamped with the COMPOUND\'s verb, so a reader can tell a cascade from a direct edit')
            .toBe('lift.create');
        // ⛔ ONE EVENT PER PENETRATED SLAB, never one per patch — a lift serving ten
        // storeys must not make the mirror rebuild one plate ten times.
        expect(new Set(voids.map((e) => e['elementId'])).size).toBe(voids.length);

        // ⭐ AND THE OBSERVATION FRAME IS NOW SILENT, because every member has a
        // channel. That is R-13's second half: it must go quiet when there is nothing
        // to say. A warning still naming closed gaps is how a reader learns to ignore
        // one.
        expect(warnings().filter((w) => w.includes('§FEAT-LIFT-OBSERVATION-FRAME')))
            .toEqual([]);

        // (b) WITHOUT one — a lift on grade, nothing penetrated. Also SILENT, and for
        //     a DIFFERENT reason: there is no void at all. Both silences are correct
        //     and the arm keeps both so a regression in either is visible.
        warnSpy.mockClear();
        await rt.bus.executeCommand('lift.create', {
            ...basePayload,
            liftId: 'lift_01ARZ3NDEKTSV4RRFFQ69G5H19',
            enclosureType: 'standalone-glass',
            // The SAME served level, minus the slab. `slabId: undefined` is a real
            // state (the shaft passes through open air), not an error.
            servedLevels: [{ levelId: 'level-1', elevation: 0 }],
            enclosureIds: ENCLOSURE_IDS.map((id) => id + 'B'),
            landingDoorIds: LANDING_DOOR_IDS.map((id) => id + 'B'),
            cabinPartIds: CABIN_PART_IDS.map((id) => id + 'B'),
        });
        expect(warnings().filter((w) => w.includes('§FEAT-LIFT-OBSERVATION-FRAME')))
            .toEqual([]);
        disposeBridge();
        rt.tearDown();
    });

    it('B-2 every member really IS in its plugin store — absent ≠ unreachable', async () => {
        // C01 §6 rule 6. The warning must describe UNREACHABLE, not ABSENT, and those
        // have opposite fixes. If the doors and parts had simply never been written,
        // the fix would have been in the handler; they ARE written, so the fix was a
        // mirror — and for two of the three the mirror already existed. This arm is
        // what made that distinction checkable rather than argued.
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
        //
        // ⛔ REWRITTEN 2026-08-23 (lane MIRROR3, L-9941) — IT USED TO DRIVE
        // `pool.create`, AND THAT COUPLING WAS THE BUG IN THE TEST. The pool was the
        // live example of a caseless compound, so the arm went RED the moment the pool
        // got its case: **a detector test whose fixture is a real defect is satisfied
        // only while that defect exists**, and it punishes the fix. The subject is now
        // a SYNTHETIC record whose type nothing declares, fed to the bridge through the
        // same `subscribe` seam `composeRuntime` uses — so the arm measures the
        // DETECTOR, survives every future fix, and needs no verb to stay broken.
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        let deliver!: (bytes: unknown, record: unknown) => void;
        const patches = {
            subscribe: (cb: (b: unknown, r: unknown) => void) => { deliver = cb; return () => {}; },
        };
        const events = new EventBus();
        const dispose = wireCommandEventBridge(patches as never, events);

        // A two-store `add` compound — the exact shape the detector is defined on
        // (`op === 'add'` && `path.length === 2` && `stores.size > 1`, the
        // `produceMultiStoreCommand` routing convention).
        deliver(new Uint8Array(), {
            id: 'evt-c1',
            type: 'gazebo.create',
            payload: { gazeboId: 'g1' },
            affectedStores: ['wall', 'slab'],
            audit: { actorId: 'probe', projectId: 'p1' },
            forward: [
                { op: 'add', path: ['wall', 'w1'], value: { id: 'w1' } },
                { op: 'add', path: ['slab', 's1'], value: { id: 's1' } },
            ],
            inverse: [],
        });

        const said = warnings().find((w) => w.includes('§FIX-COMPOUND-SILENT-DROP'));
        expect(said, 'a caseless multi-store compound must announce itself').toBeDefined();
        expect(said).toContain('gazebo.create');
        // It names the stores it wrote, so the reader can go and add the case without
        // re-deriving the census.
        expect(said).toMatch(/committed a COMPOUND across \d+ stores/);
        expect(said).toContain('slab, wall');
        dispose();
    });

    it('⭐ C-1b the detector is QUIET for a compound that HAS a case — pool, measured', async () => {
        // ⭐ THE OTHER DIRECTION, AND IT IS WHAT C-1 USED TO ASSERT INVERTED. `pool.create`
        // was the standing example of the silent drop; §FIX-POOL-AND-BOUNDARY-LINE-INVISIBLE
        // (L-9941) gave it a case, so the detector must now say NOTHING about it. Without
        // this arm the fix would be provable only by the absence of a red line somewhere
        // else, which is not a proof.
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

        expect(
            warnings().filter((w) => w.includes('§FIX-COMPOUND-SILENT-DROP')),
            'the pool has a case now — the silent-drop detector must not still accuse it',
        ).toEqual([]);
        // ⚠ It DOES still warn about the water, and that is a different sentence with a
        // different meaning: the pool is relayed, and ONE of its members has no builder
        // anywhere (L-9941). "Not mirrored" and "mirrored, one member unrenderable" are
        // not the same fact and must not read as the same line.
        const water = warnings().find((w) => w.includes('WATER BODY'));
        expect(water, 'an invisible member must be NAMED at the layer that knows').toBeDefined();
        disposeBridge();
        rt.tearDown();
    });

    // ── ARM D — the un-executable hop ────────────────────────────────────────
    const APP = resolve(__dirname, '..');
    const readSrc = (rel: string): string => readFileSync(resolve(APP, rel), 'utf8');

    it('⭐ D-1 initTools SUBSCRIBES `lift.created` and drives the compound builder', () => {
        // "Authored-but-unwired is the bottleneck": a builder nothing calls is the same
        // value as a builder that does not exist — which is precisely the state the
        // cabin was in before this lane, and the state ARM B used to document.
        const src = readSrc('src/engine/initTools.ts');
        const start = src.indexOf("runtime.events.on('lift.created'");
        expect(start, 'no lift.created subscriber in initTools').toBeGreaterThan(-1);
        const body = src.slice(start, start + 2000);
        expect(body).toContain('liftCompoundMeshBuilder.updateLift(');
        // The two registrations without which a bus-created element is invisible in
        // PLAN view — the root cause the wall, column and beam bridges each carry a
        // note about. A lift that renders in 3-D and not in plan is half a fix.
        expect(body).toContain('viewDependencyTracker.registerElement(');
        expect(body).toContain('bimManager.registerElement(');
        // ⛔ AND IT MUST NOT REACH FOR THE OTHER LIFT BUILDER. `liftMeshBuilder` draws
        // the LOD-200 MASSING lift from `LiftStore`; driving it from the compound is
        // the C104 R-8 merge arriving through the renderer.
        expect(body).not.toMatch(/\bliftMeshBuilder\b/);
    });

    it('⭐ D-2 initBuilders CONSTRUCTS the builder and puts it on the project-clear sweep', () => {
        const src = readSrc('src/engine/initBuilders.ts');
        expect(src).toContain('new LiftCompoundMeshBuilder(');
        // ⛔ A builder that parents roots into the shared scene and is NOT on the
        // sweep leaves a steel tower standing in the next project — L-8101's shape.
        expect(src).toContain("{ name: 'liftCompoundMeshBuilder'");
        // …and it is returned, so `initTools` can actually receive it. A builder
        // constructed and not returned is authored-but-unwired one layer earlier.
        expect(src).toMatch(/^\s+liftCompoundMeshBuilder,\s*$/m);
    });

    it('⭐ D-3 the two lift builders stay SEPARATE — C104 §1 / R-8, checked at the source', () => {
        // The single most likely mistake in this subsystem, per C104 §1: "cleaning up
        // the duplication" between the LOD-200 massing lift and the LOD-300 compound.
        // They are two elements, two stores, two builders, and this pins the third.
        const src = readSrc('src/engine/initBuilders.ts');
        expect(src).toContain('new LiftMeshBuilder(');
        expect(src).toContain('new LiftCompoundMeshBuilder(');
        // The massing builder still takes the massing STORE; the compound builder
        // takes only the scene. If someone ever hands `liftStore` to the compound
        // builder, that is the merge, and this line goes red.
        expect(src).toContain('new LiftCompoundMeshBuilder(scene)');
    });
});
