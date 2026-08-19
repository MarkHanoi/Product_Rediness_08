/**
 * §L-1032 DUPLICATE-TO-LEVEL — *"Duplicate slab from Level 1 to Level 2"*.
 *
 * ─── WHAT THIS SUITE IS FOR ─────────────────────────────────────────────────
 * The feature is the plan COPY with `dx = dz = 0` and one field replaced, so
 * almost everything about it is a PURE VALUE — which means the interesting
 * assertions are cheap, and there is no excuse for not making them. Four claims
 * are measured here, and the fourth is the one that matters most:
 *
 *   1. the duplicate's id DIFFERS from the source's (and its IFC guid too);
 *   2. `levelId` is the TARGET storey, not the source's;
 *   3. the geometry is UNTRANSLATED — a duplicate lands at the same plan
 *      position on the other storey, which is what the word means;
 *   4. **every key each builder emits is a key some real receiver DECLARES.**
 *
 * ─── HOW (4) IS DERIVED, AND WHY NOT BY HAND ────────────────────────────────
 * The accepted key set is **parsed out of the real source files at test time**,
 * not transcribed: `readonly <key>?:` lines from the `Create<Family>Payload`
 * interface in `plugins/<family>/src/handlers/`, UNIONed with the
 * `record.payload as { … }` block of the matching `case '<verb>':` in
 * `packages/runtime-composer/src/CommandEventBridge.ts`.
 *
 * The union is required, not a convenience: `slabCopyPayload` legitimately emits
 * `ifcGuid`, `position`, `width` and `depth`, which `CreateSlabPayload` does NOT
 * declare — they are the legacy mirror's fields, read by the bridge case
 * directly off `record.payload`, and dropping them would blank the 3-D slab.
 * Asserting against the interface alone would fail four correct keys;
 * asserting against a hand-list would assert only that the author typed the
 * same thing twice. Parsing both real files means the test breaks when a
 * receiver drops a field — which is the event nobody noticed for months.
 *
 * That event is L-978: `start`, `end`, `gridXSpacing`, `gridYSpacing` on the
 * curtain-wall copy dispatch, none of them accepted by any receiver, so every
 * copied curtain wall was minted at the L0 schema's default baseLine
 * `(0,0,0)→(4,0,0)` with default bays — silently, because a key the receiver
 * does not accept is not "extra", it is a value replaced by a schema default.
 * `NEGATIVE CONTROL` below proves this suite would actually catch that shape,
 * rather than passing because the parser found nothing to check.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    wallCopyPayload,
    slabCopyPayload,
    columnCopyPayload,
    beamCopyPayload,
    curtainWallCopyPayload,
    furnitureCopyPayload,
    type LegacyWallLike,
    type LegacySlabLike,
    type LegacyColumnLike,
    type LegacyBeamLike,
    type LegacyCurtainWallLike,
    type LegacyFurnitureLike,
} from '../src/engine/views/plantools/copyPayloads';
import {
    DUPLICATE_TO_LEVEL,
    DUPLICATE_TO_LEVEL_REFUSALS,
    DUPLICATE_TO_LEVEL_UNDO,
    duplicateToLevel,
    duplicateToLevelSpecFor,
    duplicateToLevelRefusalFor,
    buildDuplicateToLevelPayload,
    type DuplicateToLevelDeps,
    type LevelLike,
} from '../src/engine/views/plantools/duplicateToLevel';

const REPO = resolve(__dirname, '../../..');

const L1 = 'level-1';
const L2 = 'level-2';
const LEVELS: readonly LevelLike[] = [
    { id: L1, name: 'Level 1', elevation: 0 },
    { id: L2, name: 'Level 2', elevation: 3.2 },
];

// ═══ The accepted-key parser ════════════════════════════════════════════════

/** `readonly <key>?:` names inside `export interface <name> { … }`. */
function interfaceKeys(relPath: string, ifaceName: string): Set<string> {
    const src = readFileSync(resolve(REPO, relPath), 'utf8');
    const start = src.indexOf(`export interface ${ifaceName} {`);
    if (start < 0) throw new Error(`${ifaceName} not found in ${relPath}`);
    const end = src.indexOf('\n}', start);
    if (end < 0) throw new Error(`unterminated ${ifaceName} in ${relPath}`);
    const body = src.slice(start, end);
    const keys = new Set<string>();
    for (const m of body.matchAll(/^\s*readonly\s+([A-Za-z0-9_]+)\??\s*:/gm)) keys.add(m[1]!);
    if (keys.size === 0) throw new Error(`parsed ZERO keys out of ${ifaceName} — the parser is broken`);
    return keys;
}

/** Keys of the `record.payload as { … }` cast inside `case '<verb>': {`. */
function bridgeCaseKeys(verb: string): Set<string> {
    const src = readFileSync(resolve(REPO, 'packages/runtime-composer/src/CommandEventBridge.ts'), 'utf8');
    const at = src.indexOf(`case '${verb}': {`);
    if (at < 0) throw new Error(`no CommandEventBridge case for '${verb}'`);
    const castAt = src.indexOf('record.payload as', at);
    if (castAt < 0) return new Set();
    const open = src.indexOf('{', castAt);
    const close = src.indexOf('\n          };', open);
    const body = src.slice(open, close < 0 ? open : close);
    const keys = new Set<string>();
    for (const m of body.matchAll(/^\s*([A-Za-z0-9_]+)\??\s*:/gm)) keys.add(m[1]!);
    return keys;
}

function acceptedKeys(relPath: string, ifaceName: string, verb: string): Set<string> {
    const s = interfaceKeys(relPath, ifaceName);
    for (const k of bridgeCaseKeys(verb)) s.add(k);
    return s;
}

/** Keys the builder emitted that NO receiver declares. */
function unacceptedKeys(payload: Readonly<Record<string, unknown>>, accepted: Set<string>): string[] {
    return Object.keys(payload).filter(k => !accepted.has(k));
}

// ═══ Sources ════════════════════════════════════════════════════════════════

const sourceWall = (): LegacyWallLike => ({
    levelId: L1,
    baseLine: [{ x: 5, y: 0, z: 7 }, { x: 11, y: 0, z: 7 }],
    height: 2.7, thickness: 0.2,
    materialId: 'mat-block', materialColor: '#9aa0a6', systemTypeId: 'walltype-200',
});

const sourceSlab = (): LegacySlabLike => ({
    levelId: L1,
    width: 6, depth: 4, thickness: 0.25,
    position: { x: 2, y: 0, z: 3 },
    polygon: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }],
    baseOffset: -0.1,
    materialId: 'mat-concrete-c30', materialColor: '#9aa0a6',
    systemTypeId: 'slabtype-generic-250',
});

const sourceColumn = (): LegacyColumnLike => ({
    levelId: L1, position: { x: 12, y: 0, z: 9 },
    height: 3, rotation: 0.25, profile: 'rectangular',
    width: 0.4, depth: 0.4, baseOffset: 0, materialId: 'mat-concrete-c30',
});

const sourceBeam = (): LegacyBeamLike => ({
    levelId: L1,
    startPoint: { x: 1, y: 2.7, z: 1 }, endPoint: { x: 7, y: 2.7, z: 1 },
    width: 0.3, depth: 0.5, material: 'mat-steel', loadBearing: true,
    fireRating: 'R60', sectionType: 'UB', steelProfileName: '254x146x37',
});

const sourceCurtainWall = (): LegacyCurtainWallLike => ({
    levelId: L1,
    baseLine: [{ x: 25, y: 0, z: 40 }, { x: 33, y: 0, z: 40 }],
    height: 4.5, baseOffset: 0.3,
    gridXSpacing: 0.9, gridYSpacing: 2.25,
    mullionSize: 0.08, panelThickness: 0.024, systemTypeId: 'cwtype-a',
});

const sourceFurniture = (): LegacyFurnitureLike => ({
    levelId: L1, furnitureType: 'sofa',
    position: { x: 3, y: 0, z: 4 }, rotation: { x: 0, y: 1.57, z: 0 },
    width: 2.1, length: 0.9, height: 0.8,
    material: 'fabric', color: '#6600FF', furnitureCategory: 'seating',
});

function makeDeps(over: Partial<DuplicateToLevelDeps> = {}): DuplicateToLevelDeps & {
    calls: Array<{ verb: string; payload: Readonly<Record<string, unknown>> }>;
} {
    const calls: Array<{ verb: string; payload: Readonly<Record<string, unknown>> }> = [];
    return {
        calls,
        levels: LEVELS,
        stores: {
            wallStore:        { getById: (id) => (id === 'wall-src'   ? sourceWall()        : undefined) },
            slabStore:        { getById: (id) => (id === 'slab-src'   ? sourceSlab()        : undefined) },
            columnStore:      { get:     (id) => (id === 'col-src'    ? sourceColumn()      : undefined) },
            beamStore:        { get:     (id) => (id === 'beam-src'   ? sourceBeam()        : undefined) },
            curtainWallStore: { getById: (id) => (id === 'cw-src'     ? sourceCurtainWall() : undefined) },
            furnitureStore:   { get:     (id) => (id === 'furn-src'   ? sourceFurniture()   : undefined) },
        },
        dispatch: (verb, payload) => { calls.push({ verb, payload }); return undefined; },
        ...over,
    };
}

// ═══ 1 · The founder's case, end to end through the route ═══════════════════

describe('§L-1032 — duplicate slab from Level 1 to Level 2', () => {
    it('dispatches ONE slab.create, on the target storey, with a new id and a new IFC guid', () => {
        const deps = makeDeps();
        const out = duplicateToLevel({ elementType: 'slab', sourceId: 'slab-src', targetLevelId: L2 }, deps);

        expect(out.ok, out.ok ? '' : out.reason).toBe(true);
        if (!out.ok) return;

        expect(deps.calls).toHaveLength(1);
        expect(deps.calls[0]!.verb).toBe('slab.create');

        // (1) a NEW element, not a rename of the old one.
        expect(out.newId).not.toBe('slab-src');
        expect(out.payload['id']).toBe(out.newId);
        expect(String(out.payload['id'])).toMatch(/^slab_/);
        // A fresh IFC guid: `initTools.ts:1783-1786` writes ifcData.guid straight
        // from the event, so a shared guid is an IFC identity collision.
        expect(out.payload['ifcGuid']).toBeTruthy();

        // (2) the TARGET storey.
        expect(out.payload['levelId']).toBe(L2);
        expect(out.payload['levelId'], 'a duplicate that keeps the source level is not a duplicate to a level').not.toBe(L1);

        // (3) UNTRANSLATED — same plan position, other storey.
        expect(out.payload['position']).toEqual({ x: 2, y: 0, z: 3 });
        expect(out.payload['polygon']).toEqual([
            { x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }, { x: 6, y: 4, z: 4 }, { x: 0, y: 4, z: 4 },
        ]);

        // ONE command ⇒ ONE undo entry, and the route says so rather than
        // leaving the reader to assume it.
        expect(out.undoEntries).toBe(1);
    });

    it('carries the source material, colour and slab TYPE — a lossy duplicate is the defect, not the feature', () => {
        const deps = makeDeps();
        const out = duplicateToLevel({ elementType: 'slab', sourceId: 'slab-src', targetLevelId: L2 }, deps);
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        expect(out.payload['materialId']).toBe('mat-concrete-c30');
        expect(out.payload['materialColor']).toBe('#9aa0a6');
        expect(out.payload['systemTypeId']).toBe('slabtype-generic-250');
        expect(out.payload['thickness']).toBe(0.25);
        expect(out.payload['baseOffset']).toBe(-0.1);
        expect(out.payload['width']).toBe(6);
        expect(out.payload['depth']).toBe(4);
    });

    it('two duplicates of the same slab get DIFFERENT ids and DIFFERENT guids', () => {
        const deps = makeDeps();
        const a = duplicateToLevel({ elementType: 'slab', sourceId: 'slab-src', targetLevelId: L2 }, deps);
        const b = duplicateToLevel({ elementType: 'slab', sourceId: 'slab-src', targetLevelId: L2 }, deps);
        expect(a.ok && b.ok).toBe(true);
        if (!a.ok || !b.ok) return;
        expect(a.newId).not.toBe(b.newId);
        expect(a.payload['ifcGuid']).not.toBe(b.payload['ifcGuid']);
    });
});

// ═══ 2 · The wall, the one family whose Y must be rebased ═══════════════════

describe('§L-1032 — the wall is the ONLY family whose geometry is rebased', () => {
    it('a duplicated wall stands at the DESTINATION elevation, not the source one', () => {
        const deps = makeDeps();
        const out = duplicateToLevel({ elementType: 'wall', sourceId: 'wall-src', targetLevelId: L2 }, deps);
        expect(out.ok, out.ok ? '' : out.reason).toBe(true);
        if (!out.ok) return;
        const bl = out.payload['baseLine'] as Array<Record<string, number>>;
        // ChangeWallLevel.ts:70-74 rebases `baseLine.y` to the level's elevation.
        // Carrying the source's 0 would put the L2 wall at L1's height.
        expect(bl[0]!['y']).toBe(3.2);
        expect(bl[1]!['y']).toBe(3.2);
        expect(bl[0]!['y'], 'the source wall sat at y=0').not.toBe(0);
        // …and both endpoints share it — the Wall schema's refine (2).
        expect(bl[0]!['y']).toBe(bl[1]!['y']);
        // UNTRANSLATED in plan.
        expect(bl[0]!['x']).toBe(5);
        expect(bl[0]!['z']).toBe(7);
        expect(bl[1]!['x']).toBe(11);
    });

    it('REFUSES BY NAME when the destination storey has no elevation, rather than silently keeping the old height', () => {
        const deps = makeDeps({ levels: [{ id: L1, elevation: 0 }, { id: L2, name: 'Level 2' }] });
        const out = duplicateToLevel({ elementType: 'wall', sourceId: 'wall-src', targetLevelId: L2 }, deps);
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toMatch(/elevation/i);
        expect(deps.calls, 'nothing may be dispatched on a refusal').toHaveLength(0);
    });

    it('CONTROL — a slab on the SAME elevation-less storey is duplicated fine; only the wall needs it', () => {
        const deps = makeDeps({ levels: [{ id: L1, elevation: 0 }, { id: L2, name: 'Level 2' }] });
        const out = duplicateToLevel({ elementType: 'slab', sourceId: 'slab-src', targetLevelId: L2 }, deps);
        expect(out.ok, out.ok ? '' : out.reason).toBe(true);
    });
});

// ═══ 3 · THE L-978 INVARIANT — every emitted key has a real receiver ════════

describe('§L-1032/L-978 — every key a duplicate emits is a key a REAL receiver declares', () => {
    const CASES: ReadonlyArray<{
        kind: string;
        payload: () => Readonly<Record<string, unknown>>;
        iface: [string, string];
        verb: string;
    }> = [
        {
            kind: 'wall',
            payload: () => wallCopyPayload(sourceWall(), 0, 0, 'wall_NEW', { levelId: L2, elevationY: 3.2 }),
            iface: ['plugins/wall/src/handlers/CreateWall.ts', 'CreateWallPayload'],
            verb: 'wall.create',
        },
        {
            kind: 'slab',
            payload: () => slabCopyPayload(sourceSlab(), 0, 0, 'slab_NEW', 'guid', { levelId: L2 }),
            iface: ['plugins/slab/src/handlers/CreateSlab.ts', 'CreateSlabPayload'],
            verb: 'slab.create',
        },
        {
            kind: 'column',
            payload: () => columnCopyPayload(sourceColumn(), 0, 0, 'column_NEW', { levelId: L2 }),
            iface: ['plugins/column/src/handlers/CreateColumn.ts', 'CreateColumnPayload'],
            verb: 'column.create',
        },
        {
            kind: 'beam',
            payload: () => beamCopyPayload(sourceBeam(), 0, 0, 'beam_NEW', { levelId: L2 }),
            iface: ['plugins/beam/src/handlers/CreateBeam.ts', 'CreateBeamPayload'],
            verb: 'beam.create',
        },
        {
            kind: 'curtainWall',
            payload: () => curtainWallCopyPayload(sourceCurtainWall(), 0, 0, 'cw_NEW', { levelId: L2 }),
            iface: ['plugins/curtain-wall/src/handlers/CreateCurtainWall.ts', 'CreateCurtainWallPayload'],
            verb: 'curtain-wall.create',
        },
        {
            kind: 'furniture',
            payload: () => furnitureCopyPayload(sourceFurniture(), 0, 0, 'furn_NEW', { levelId: L2 }),
            iface: ['plugins/furniture/src/handlers/CreateFurniture.ts', 'CreateFurniturePayload'],
            verb: 'furniture.create',
        },
    ];

    for (const c of CASES) {
        it(`${c.kind} — no key falls through to a schema default`, () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const accepted = acceptedKeys(c.iface[0], c.iface[1], c.verb);
                const orphans = unacceptedKeys(c.payload(), accepted);
                expect(
                    orphans,
                    `these ${c.kind} keys are declared by NEITHER ${c.iface[1]} NOR the ` +
                    `CommandEventBridge '${c.verb}' case, so each is a value silently replaced by a ` +
                    `schema default — the L-978 shape: ${orphans.join(', ')}`,
                ).toEqual([]);
            } finally {
                warn.mockRestore();
            }
        });
    }

    it('NEGATIVE CONTROL — the checker really catches the four L-978 field names', () => {
        // Had this suite existed in this form, L-978 would have been a red test
        // rather than months of curtain walls at the origin.
        const accepted = acceptedKeys(
            'plugins/curtain-wall/src/handlers/CreateCurtainWall.ts',
            'CreateCurtainWallPayload',
            'curtain-wall.create',
        );
        const theL978Payload = {
            id: 'cw_NEW', levelId: L2,
            start: { x: 25, z: 40 }, end: { x: 33, z: 40 },
            gridXSpacing: 0.9, gridYSpacing: 2.25,
        };
        expect(unacceptedKeys(theL978Payload, accepted).sort())
            .toEqual(['end', 'gridXSpacing', 'gridYSpacing', 'start']);
        // Paired positive on the SAME expression: `id` and `levelId` ARE accepted,
        // so the checker is not simply rejecting everything.
        expect(accepted.has('id')).toBe(true);
        expect(accepted.has('levelId')).toBe(true);
    });

    it('the parser actually read the real files (a parser that finds nothing asserts nothing)', () => {
        expect(interfaceKeys('plugins/slab/src/handlers/CreateSlab.ts', 'CreateSlabPayload').size)
            .toBeGreaterThan(5);
        // `ifcGuid`/`position`/`width`/`depth` are NOT on CreateSlabPayload — they
        // come from the bridge case, which is why the union is required.
        expect(interfaceKeys('plugins/slab/src/handlers/CreateSlab.ts', 'CreateSlabPayload').has('ifcGuid')).toBe(false);
        expect(bridgeCaseKeys('slab.create').has('ifcGuid')).toBe(true);
        expect(bridgeCaseKeys('slab.create').has('position')).toBe(true);
    });
});

// ═══ 4 · Existing callers are untouched ═════════════════════════════════════

describe('§L-1032 — the level override is OPTIONAL and the plan copy tool is unchanged', () => {
    it('every builder without `opts` still emits the SOURCE levelId', () => {
        expect(wallCopyPayload(sourceWall(), 10, 4, 'w')['levelId']).toBe(L1);
        expect(slabCopyPayload(sourceSlab(), 10, 4, 's', 'g')['levelId']).toBe(L1);
        expect(columnCopyPayload(sourceColumn(), 10, 4, 'c')['levelId']).toBe(L1);
        expect(beamCopyPayload(sourceBeam(), 10, 4)['levelId']).toBe(L1);
        expect(curtainWallCopyPayload(sourceCurtainWall(), 10, 4, 'cw')['levelId']).toBe(L1);
        expect(furnitureCopyPayload(sourceFurniture(), 10, 4, 'f')['levelId']).toBe(L1);
    });

    it('a wall copied WITHOUT an elevation override keeps its own baseLine y', () => {
        const src: LegacyWallLike = { ...sourceWall(), baseLine: [{ x: 5, y: 6.4, z: 7 }, { x: 11, y: 6.4, z: 7 }] };
        const bl = wallCopyPayload(src, 10, 4, 'w')['baseLine'] as Array<Record<string, number>>;
        expect(bl[0]!['y']).toBe(6.4);
        expect(bl[1]!['y']).toBe(6.4);
    });

    it('`beamCopyPayload` with no id emits NO `id` key — byte-identical to the literal it replaced', () => {
        const p = beamCopyPayload(sourceBeam(), 10, 4);
        expect(Object.prototype.hasOwnProperty.call(p, 'id')).toBe(false);
        expect(p['startPoint']).toEqual({ x: 11, y: 2.7, z: 5 });
        expect(p['sectionType']).toBe('UB');
        expect(p['steelProfileName']).toBe('254x146x37');
        expect(p['loadBearing']).toBe(true);
        expect(p['fireRating']).toBe('R60');
    });
});

// ═══ 5 · Refusals are DATA, and every family has a row ══════════════════════

describe('§L-1032/C84 EI-1b — every family the brief names has a row in exactly one table', () => {
    /** The families the L-1032 brief enumerates, by panel type. */
    const BRIEF_FAMILIES = [
        'wall', 'slab', 'column', 'beam', 'roof', 'ceiling', 'floor', 'room',
        'stairs', 'handrail', 'lift', 'curtainwall', 'furniture', 'lighting',
        'plumbing', 'door', 'window',
    ] as const;

    for (const f of BRIEF_FAMILIES) {
        it(`${f} — decided, one way or the other`, () => {
            const spec = duplicateToLevelSpecFor(f);
            const refusal = duplicateToLevelRefusalFor(f);
            expect(
                (spec === null) !== (refusal === null),
                `"${f}" must be in EXACTLY one of DUPLICATE_TO_LEVEL / DUPLICATE_TO_LEVEL_REFUSALS. ` +
                `A blank reads as "fine" and is indistinguishable from "nobody looked".`,
            ).toBe(true);
            if (refusal) {
                expect(refusal.reason.length, 'the user is owed a sentence').toBeGreaterThan(20);
                expect(refusal.clause.length, 'a refusal without a clause is an opinion').toBeGreaterThan(4);
                expect(refusal.evidence, 'a refusal without file:line evidence is unfalsifiable')
                    .toMatch(/\.ts/);
            }
        });
    }

    it('an UNDECIDED family is reported as undecided, never as a refusal', () => {
        const out = duplicateToLevel(
            { elementType: 'flurb', sourceId: 'x', targetLevelId: L2 }, makeDeps(),
        );
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toMatch(/nobody has decided/);
        expect(out.refusal, 'an undecided family has no refusal row to quote').toBeUndefined();
    });

    it('a DECLARED refusal comes back with its row, so a surface can show the sentence', () => {
        const out = duplicateToLevel(
            { elementType: 'door', sourceId: 'd', targetLevelId: L2 }, makeDeps(),
        );
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.refusal?.kind).toBe('door');
        expect(out.refusal?.clause).toMatch(/C15 §2/);
    });

    it('the six duplicable families each name a store the copy tool already reads', () => {
        const copySrc = readFileSync(
            resolve(REPO, 'apps/editor/src/engine/views/plantools/CopyPlanToolHandler.ts'), 'utf8');
        for (const spec of Object.values(DUPLICATE_TO_LEVEL)) {
            expect(copySrc, `window.${spec.legacyStoreGlobal} must be what the copy tool reads too`)
                .toContain(`window.${spec.legacyStoreGlobal}`);
        }
    });

    it('no family appears in BOTH tables', () => {
        for (const spec of Object.values(DUPLICATE_TO_LEVEL)) {
            for (const t of spec.panelTypes) {
                expect(duplicateToLevelRefusalFor(t), `${t} is claimed twice`).toBeNull();
            }
        }
        expect(Object.keys(DUPLICATE_TO_LEVEL_REFUSALS).length).toBeGreaterThan(10);
    });
});

// ═══ 6 · The route's other refusals ═════════════════════════════════════════

describe('§L-1032 — the route refuses BY NAME and never silently no-ops', () => {
    it('duplicating onto the storey it is already on is refused (a zero-delta copy is coincident)', () => {
        const deps = makeDeps();
        const out = duplicateToLevel({ elementType: 'slab', sourceId: 'slab-src', targetLevelId: L1 }, deps);
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toMatch(/already on that storey/);
        expect(deps.calls).toHaveLength(0);
    });

    it('an unknown source id is refused with the store it looked in', () => {
        const out = duplicateToLevel({ elementType: 'slab', sourceId: 'nope', targetLevelId: L2 }, makeDeps());
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toMatch(/window\.slabStore/);
    });

    it('an unknown destination storey is refused', () => {
        const out = duplicateToLevel({ elementType: 'slab', sourceId: 'slab-src', targetLevelId: 'L99' }, makeDeps());
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toMatch(/no storey/);
    });

    it('a degenerate source (two-point slab boundary) is refused BEFORE dispatch, not inside a .catch()', () => {
        const deps = makeDeps({
            stores: { slabStore: { getById: () => ({ ...sourceSlab(), polygon: [{ x: 0, y: 0 }, { x: 6, y: 0 }] }) } },
        });
        const out = duplicateToLevel({ elementType: 'slab', sourceId: 'anything', targetLevelId: L2 }, deps);
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.reason).toMatch(/three boundary points|zero-area/);
        expect(deps.calls).toHaveLength(0);
    });

    it('every failure reports ZERO undo entries and every success reports exactly one', () => {
        const deps = makeDeps();
        expect(duplicateToLevel({ elementType: 'door', sourceId: 'd', targetLevelId: L2 }, deps).undoEntries).toBe(0);
        expect(duplicateToLevel({ elementType: 'beam', sourceId: 'beam-src', targetLevelId: L2 }, deps).undoEntries).toBe(1);
        expect(DUPLICATE_TO_LEVEL_UNDO.perDuplicate).toBe(1);
        // The honest half: a multi-element duplicate in ONE entry is NOT claimed.
        expect(DUPLICATE_TO_LEVEL_UNDO.oneEntryForManySupported).toBe(false);
    });
});

// ═══ 7 · The remaining four families go through the same route ══════════════

describe('§L-1032 — column, beam, curtain wall and furniture duplicate the same way', () => {
    const RUNS: ReadonlyArray<[string, string, string, string]> = [
        ['column',       'col-src',  'column.create',       'column_'],
        ['beam',         'beam-src', 'beam.create',         'beam_'],
        ['curtain-wall', 'cw-src',   'curtain-wall.create', 'curtainwall_'],
        ['furniture',    'furn-src', 'furniture.create',    'furniture_'],
    ];

    for (const [type, srcId, verb, idPrefix] of RUNS) {
        it(`${type} — new id, target storey, one command`, () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                const deps = makeDeps();
                const out = duplicateToLevel({ elementType: type, sourceId: srcId, targetLevelId: L2 }, deps);
                expect(out.ok, out.ok ? '' : out.reason).toBe(true);
                if (!out.ok) return;
                expect(deps.calls).toHaveLength(1);
                expect(deps.calls[0]!.verb).toBe(verb);
                expect(out.newId).not.toBe(srcId);
                expect(out.newId.startsWith(idPrefix)).toBe(true);
                expect(out.payload['levelId']).toBe(L2);
                expect(out.payload['id']).toBe(out.newId);
                expect(out.undoEntries).toBe(1);
            } finally {
                warn.mockRestore();
            }
        });
    }

    it('a duplicated column keeps its plan position exactly — dx = dz = 0 is the feature', () => {
        const out = duplicateToLevel({ elementType: 'column', sourceId: 'col-src', targetLevelId: L2 }, makeDeps());
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        expect(out.payload['origin']).toEqual({ x: 12, y: 0, z: 9 });
        expect(out.payload['rotation']).toBe(0.25);
        expect(out.payload['shape']).toBe('rectangular');
    });

    it('a duplicated curtain wall keeps its DIVISION, not the schema default bays', () => {
        const out = duplicateToLevel({ elementType: 'curtainwall', sourceId: 'cw-src', targetLevelId: L2 }, makeDeps());
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        expect(out.payload['bayWidth']).toBe(0.9);
        expect(out.payload['bayWidth'], 'the L0 default is 1.2').not.toBe(1.2);
        expect(out.payload['bayHeight']).toBe(2.25);
        expect(out.payload['mullionThickness']).toBe(0.08);
        expect(out.payload['baseLine']).toEqual([{ x: 25, y: 0, z: 40 }, { x: 33, y: 0, z: 40 }]);
    });

    it('a duplicated furniture item keeps its SCALAR yaw, not the legacy Euler object', () => {
        const out = duplicateToLevel({ elementType: 'furniture', sourceId: 'furn-src', targetLevelId: L2 }, makeDeps());
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        expect(out.payload['rotation']).toBe(1.57);
        expect(typeof out.payload['rotation'], 'both receivers want a number').toBe('number');
        expect(out.payload['position']).toEqual({ x: 3, y: 0, z: 4 });
    });

    it('a duplicated beam NAMES its dropped support bindings rather than dropping them in silence', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const deps = makeDeps({
                stores: { beamStore: { get: () => ({ ...sourceBeam(), startSupportId: 'col-1', endSupportId: 'col-2' }) } },
            });
            const out = duplicateToLevel({ elementType: 'beam', sourceId: 'b', targetLevelId: L2 }, deps);
            expect(out.ok).toBe(true);
            expect(warn).toHaveBeenCalled();
            expect(String(warn.mock.calls[0]?.[0])).toContain('startSupportId');
            expect(out.ok && out.payload['startSupportId']).toBeFalsy();
        } finally {
            warn.mockRestore();
        }
    });

    it('CONTROL — an ordinary beam with no supports duplicates silently', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            duplicateToLevel({ elementType: 'beam', sourceId: 'beam-src', targetLevelId: L2 }, makeDeps());
            expect(warn).not.toHaveBeenCalled();
        } finally {
            warn.mockRestore();
        }
    });
});

// ═══ 8 · buildDuplicateToLevelPayload is pure ═══════════════════════════════

describe('§L-1032 — the payload builder is a pure value, reachable without a canvas', () => {
    it('same inputs, same payload; no globals, no dispatch', () => {
        const a = buildDuplicateToLevelPayload(
            { kind: 'slab', record: sourceSlab() }, L2, { newId: 'slab_X', ifcGuid: 'g' });
        const b = buildDuplicateToLevelPayload(
            { kind: 'slab', record: sourceSlab() }, L2, { newId: 'slab_X', ifcGuid: 'g' });
        expect(a).toEqual(b);
        expect(a['levelId']).toBe(L2);
        expect(a['id']).toBe('slab_X');
    });
});
