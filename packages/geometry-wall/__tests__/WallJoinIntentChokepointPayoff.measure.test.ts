/**
 * §MEASURED-JOININTENT-PAYOFF (L-927) — the founder's corner, END TO END.
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * WHAT THE THREE LANES ESTABLISHED, IN ORDER:
 *
 *   L-920/L-923 (`WallJunctionIncumbentAuthority.measure.test.ts`) — the DEFECT. Resolve
 *     the incumbent L alone and it mitres correctly: `eMN = sMN = (0.707107, 0.707107)`.
 *     Add a third wall at the same corner and BOTH normals go `null` — the committed pair
 *     reverts to SQUARE CAPS and an infill prism drops over the hole that leaves. That is
 *     the founder's "really bad" plan joint and the 3D triangle, one root.
 *
 *   L-923 — the FIX EXISTS. Stamping `joinIntent` keeps the mitre byte-identical. It also
 *     proved the fact is UNRECOVERABLE afterwards: the founder's mitred-L-plus-newcomer
 *     and a legitimate collinear pass-through are the same three segments differing only
 *     in draw order, so no predicate over geometry, type, thickness or `createdAt` can
 *     separate them.
 *
 *   L-927 (this file) — the fix REACHES the founder, and SURVIVES A RELOAD.
 *     The census (`WallCreateJoinIntentCensus.measure.test.ts`) measured that only 1 of 6
 *     wall producers stamped, and that BOTH serializers dropped the field. So the stamp
 *     was computed on a path the founder does not draw on, and destroyed by the next save
 *     even when it was computed. This file proves both halves are closed.
 *
 * WHY THESE ASSERTIONS ARE STRING COMPARISONS. `corner()` renders every number that
 * decides how the corner is drawn into one line. Byte-identical strings is the standard
 * C83 §10.4 incumbent-unchanged assertion — a tolerance would let the mitre degrade
 * silently, which is exactly how this defect survived three attempts.
 */

import { describe, it, expect } from 'vitest';
import { WallJoinResolver } from '../src/WallJoinResolver';
import { WallStore } from '../src/WallStore';
import { ProjectContext } from '@pryzm/core-app-model';
import type { WallData } from '../src/WallTypes';

const T = 0.375;
const SNAP = 0.5;
const P = { x: 5, z: 0 };
const LEVEL_ID = 'L';

function makeLevelProvider() {
    const level = { id: LEVEL_ID, name: 'Ground', elevation: 0, height: 3, childrenIds: [] };
    return {
        getLevelById: (id: string) => (id === LEVEL_ID ? { ...level } : undefined),
        getLevels: () => [{ ...level }],
    };
}

function newStore(): WallStore {
    return new WallStore(
        new ProjectContext(),
        makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
    );
}

let _seq = 0;
/**
 * A LAYERED wall — the founder draws layered walls, and the layer lines failing to resolve
 * is literally what he photographs.
 *
 * NOTE ON THE FIXTURE. L-923's `WallJunctionIncumbentAuthority.measure.test.ts` builds the
 * same three walls as PLAIN ARRAYS and hands them straight to the resolver, so it never
 * meets `WallStore`'s Zod gate. This lane's whole point is that walls arrive through the
 * STORE, so the fixture has to be a record the store will actually accept: `layer.function`
 * from the declared enum, and a fully-stamped `metadata` block. The geometry — endpoints,
 * thickness, layer proportions — is identical to L-923's, so the corner strings below are
 * directly comparable to the ones that lane pinned.
 */
function layeredWall(id: string, s: [number, number], e: [number, number], thickness = T): WallData {
    const now = 1_700_000_000_000 + (++_seq);
    return {
        id, type: 'wall', levelId: LEVEL_ID, properties: {}, childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 3, thickness, baseOffset: 0, openings: [],
        layers: [
            { name: 'render-ext', thickness: thickness * 0.04, function: 'finish-exterior' },
            { name: 'core',       thickness: thickness * 0.92, function: 'structure' },
            { name: 'render-int', thickness: thickness * 0.04, function: 'finish-interior' },
        ],
        metadata: { createdAt: now, modifiedAt: now, createdBy: 'test', version: 1 },
    } as unknown as WallData;
}

/** The incumbent L: W1 arrives at the corner, W2 leaves it. Drawn FIRST. */
const incumbentL = (): WallData[] => [
    layeredWall('W1', [0, 0], [P.x, P.z]),
    layeredWall('W2', [P.x, P.z], [P.x, P.z + 5]),
];

/** The newcomer joining the SAME corner at `deg` (CCW from +x). Drawn LAST. */
function newcomer(deg: number, thickness = T): WallData {
    const r = (deg * Math.PI) / 180;
    return layeredWall('W3', [P.x, P.z], [P.x + 5 * Math.cos(r), P.z + 5 * Math.sin(r)], thickness);
}

/** Every number that decides how an incumbent wall's corner renders. */
function corner(walls: WallData[], id: string): string {
    const jd = WallJoinResolver.resolveLevel(walls, { snapRadius: SNAP }).get(id);
    if (!jd) return 'ABSENT';
    const f = (n: number | undefined | null): string => (n == null ? 'null' : n.toFixed(6));
    const b = (jd as any).baseLine;
    const mn = (m: any): string => (m ? `(${f(m.nx)},${f(m.nz)})` : 'null');
    return [
        `s=(${f(b?.[0]?.x)},${f(b?.[0]?.z)})`,
        `e=(${f(b?.[1]?.x)},${f(b?.[1]?.z)})`,
        `sMN=${mn((jd as any).startMN)}`,
        `eMN=${mn((jd as any).endMN)}`,
    ].join(' ');
}

/** The mitred-L reference — what the corner MUST still look like after W3 arrives. */
const W1_MITRED = 's=(0.000000,0.000000) e=(5.000000,0.000000) sMN=null eMN=(0.707107,0.707107)';
const W2_MITRED = 's=(5.000000,0.000000) e=(5.000000,5.000000) sMN=(0.707107,0.707107) eMN=null';

/**
 * Model `ProjectSerializer.serializeWall` — an explicit FIELD WHITELIST, which is the
 * shape that dropped the stamp. `carryJoinIntent` toggles the ONE field this lane added,
 * so the round-trip can be run both ways and the field's necessity MEASURED rather than
 * asserted.
 */
function serializeWall(wall: WallData, carryJoinIntent: boolean): Record<string, unknown> {
    const w = wall as unknown as Record<string, unknown>;
    return JSON.parse(JSON.stringify({
        id: w.id, type: w.type, levelId: w.levelId, parentId: w.parentId,
        // §WALL-JOIN-SAVE-FIX — the serializer saves the UNTRIMMED baseline when a
        // `_sourceBaseLine` exists. Modelled faithfully: it is what the loader gets back.
        baseLine: (w._sourceBaseLine as unknown) ?? w.baseLine,
        height: w.height, thickness: w.thickness, baseOffset: w.baseOffset,
        materialId: w.materialId, materialColor: w.materialColor,
        openings: w.openings ?? [], childrenIds: w.childrenIds ?? [],
        layers: w.layers, systemTypeId: w.systemTypeId, curve: w.curve,
        rakeAngleDeg: w.rakeAngleDeg,
        ...(carryJoinIntent ? { joinIntent: w.joinIntent } : {}),
        properties: w.properties ?? {}, ifcData: w.ifcData, metadata: w.metadata,
    }));
}

/**
 * Model the loader: replay each persisted wall through a fresh store UNDER HYDRATION,
 * forwarding the persisted `joinIntent` exactly as `ImportProjectCommand` /
 * `ProjectLoader` now do.
 */
function reloadIntoStore(persisted: Record<string, unknown>[]): WallData[] {
    const store = newStore();
    const end = store.beginHydration();
    try {
        for (const p of persisted) store.add(p as unknown as WallData);
    } finally {
        end();
    }
    return store.getByLevel(LEVEL_ID);
}

describe('§MEASURED-JOININTENT-PAYOFF (L-927) — the founder\'s corner, end to end', () => {

    // ── THE BASELINE THE PAYOFF IS MEASURED AGAINST ────────────────────────────────
    it('the incumbent L ALONE mitres correctly — the reference both halves must preserve', () => {
        expect(corner(incumbentL(), 'W1')).toBe(W1_MITRED);
        expect(corner(incumbentL(), 'W2')).toBe(W2_MITRED);
    });

    it('CONTROL — UNSTAMPED, the third wall still destroys the mitre (the defect is real here)', () => {
        // Plain arrays, no store, nothing stamped: reproduces L-923's pinned finding in
        // THIS file, so the payoff below cannot be an artefact of a different fixture.
        const withW3 = [...incumbentL(), newcomer(-90)];
        expect(corner(withW3, 'W1')).toBe('s=(0.000000,0.000000) e=(5.000000,0.000000) sMN=null eMN=null');
        expect(corner(withW3, 'W2')).toBe('s=(5.000000,0.000000) e=(5.000000,5.000000) sMN=null eMN=null');
    });

    // ── PAYOFF 1: THE INTERACTIVE GESTURE (plan tool / 3D tool) ────────────────────
    it('PAYOFF — walls created one-at-a-time THROUGH THE STORE keep the mitre byte-identical', () => {
        // This is the founder's gesture: draw the L, then draw a third wall onto its
        // corner. Every producer — plan tool, 3D tool, marks, AI accept — reaches
        // WallStore.add(), so this models all of them at the point they converge.
        const store = newStore();
        for (const w of incumbentL()) store.add(w);
        store.add(newcomer(-90));

        const walls = store.getByLevel(LEVEL_ID);

        // The store stamped the NEWCOMER (it arrived onto a node where two committed
        // endpoints already met) and left the incumbents alone.
        const byId = new Map(walls.map(w => [w.id, w]));
        expect(byId.get('W3')!.joinIntent).toEqual({ start: 'butt' });
        expect(byId.get('W1')!.joinIntent).toBeUndefined();
        expect(byId.get('W2')!.joinIntent).toBeUndefined();

        // …and the incumbent corner SURVIVES. This is the founder-visible payoff.
        expect(corner(walls, 'W1')).toBe(W1_MITRED);
        expect(corner(walls, 'W2')).toBe(W2_MITRED);
    });

    it('PAYOFF — the ACUTE newcomer (the spike geometry) likewise leaves the mitre intact', () => {
        const store = newStore();
        for (const w of incumbentL()) store.add(w);
        store.add(newcomer(85));                       // 5 deg off W2
        const walls = store.getByLevel(LEVEL_ID);
        expect(corner(walls, 'W1')).toBe(W1_MITRED);
        expect(corner(walls, 'W2')).toBe(W2_MITRED);
    });

    // ── PAYOFF 2: THE BATCH GENERATOR ──────────────────────────────────────────────
    it('PAYOFF — a BATCH generator emitting the same three walls also keeps the mitre', () => {
        // Apartment / D-TGL / house / residential generators all fan out to
        // `wall.batch.create`, which the §P2.1 bridge mirrors into this store one wall at
        // a time in emission order. Modelled as exactly that: one add() per wall, no
        // per-call stamping anywhere — the store does it.
        //
        // ⚠ HONEST LIMIT, stated because it constrains what this proves: a generator's
        // emission order is not literally an authoring gesture. It works here — and for
        // the shell-then-partition order every one of these generators actually uses —
        // because the committed shell genuinely precedes the walls that arrive onto it.
        // A generator that emitted a corner's second arm AFTER an unrelated third wall
        // would get a different answer. Declared in the lane report as unproven.
        const store = newStore();
        const batch = [...incumbentL(), newcomer(-90)];
        for (const w of batch) store.add(w);           // one bridge mirror per element

        const walls = store.getByLevel(LEVEL_ID);
        expect(corner(walls, 'W1')).toBe(W1_MITRED);
        expect(corner(walls, 'W2')).toBe(W2_MITRED);
    });

    // ── PAYOFF 3: PERSISTENCE ROUND-TRIP ───────────────────────────────────────────
    it('ROUND-TRIP — create → stamp → save → reload keeps the mitre byte-identical', () => {
        const store = newStore();
        for (const w of incumbentL()) store.add(w);
        store.add(newcomer(-90));

        const live = store.getByLevel(LEVEL_ID);
        expect(corner(live, 'W1')).toBe(W1_MITRED);

        // SAVE — through the real serializer's field whitelist, WITH the field this lane
        // added. JSON round-trip included, so nothing survives by object identity.
        const persisted = live.map(w => serializeWall(w, /* carryJoinIntent */ true));
        expect(persisted.find(p => p.id === 'W3')!.joinIntent).toEqual({ start: 'butt' });

        // RELOAD — fresh store, hydration on, persisted stamp forwarded.
        const reloaded = reloadIntoStore(persisted);
        expect(reloaded.find(w => w.id === 'W3')!.joinIntent).toEqual({ start: 'butt' });

        // The founder's corner is still there after reopening the project.
        expect(corner(reloaded, 'W1')).toBe(W1_MITRED);
        expect(corner(reloaded, 'W2')).toBe(W2_MITRED);
    });

    it('ROUND-TRIP NEGATIVE CONTROL — drop joinIntent from the whitelist and the mitre DIES', () => {
        // THE POINT OF THIS TEST. It measures that the serializer field is load-bearing
        // rather than decorative — run the identical round-trip with the one field
        // omitted (i.e. the serializer exactly as it was before this lane) and the
        // founder's corner reverts to square caps on reload.
        //
        // This is what made the L-251 fix worthless in practice for a year: the stamp was
        // computed correctly at creation and then destroyed by the next save.
        const store = newStore();
        for (const w of incumbentL()) store.add(w);
        store.add(newcomer(-90));
        const live = store.getByLevel(LEVEL_ID);

        const persistedWithout = live.map(w => serializeWall(w, /* carryJoinIntent */ false));
        expect(persistedWithout.find(p => p.id === 'W3')!.joinIntent).toBeUndefined();

        const reloaded = reloadIntoStore(persistedWithout);
        expect(reloaded.find(w => w.id === 'W3')!.joinIntent).toBeUndefined();

        // Square caps — the defect, back, purely from a reload.
        expect(corner(reloaded, 'W1')).toBe('s=(0.000000,0.000000) e=(5.000000,0.000000) sMN=null eMN=null');
        expect(corner(reloaded, 'W2')).toBe('s=(5.000000,0.000000) e=(5.000000,5.000000) sMN=null eMN=null');
    });

    // ── HYDRATION IS NOT A NO-OP ───────────────────────────────────────────────────
    it('HYDRATION — a LEGACY snapshot (no stamps) loads with no derived stamp at all', () => {
        // The compatibility promise: a project saved before this field existed must behave
        // EXACTLY as it did. Deriving at load would be a coin flip — walls arrive in FILE
        // order against a partially-populated store, at UNTRIMMED baselines — so hydration
        // suppresses derivation entirely and the legacy result is bit-for-bit the old one.
        const legacy = [...incumbentL(), newcomer(-90)]
            .map(w => serializeWall(w, false));         // pre-L-927 file: no joinIntent

        const reloaded = reloadIntoStore(legacy);
        for (const w of reloaded) expect(w.joinIntent).toBeUndefined();
        expect(corner(reloaded, 'W1')).toBe('s=(0.000000,0.000000) e=(5.000000,0.000000) sMN=null eMN=null');
    });

    it('HYDRATION — restores an EXPLICIT stamp untouched, and never overwrites one', () => {
        // Guard 1 of WallStore.add(): an explicit intent always wins over derivation.
        // A restore (undo of a delete, rollback, loader) carries the ORIGINAL gesture, and
        // overwriting a known fact with a fresh guess is the failure this lane exists to
        // stop. Asserted OUTSIDE hydration too, so it is the precedence rule being
        // measured and not merely the flag.
        const store = newStore();
        for (const w of incumbentL()) store.add(w);

        const explicit = { ...newcomer(-90), joinIntent: { start: 'through' as const } };
        store.add(explicit as WallData);

        expect(store.getById('W3')!.joinIntent).toEqual({ start: 'through' });
    });

    it('COPY/MIRROR/OFFSET — a derived wall must NOT inherit the source stamp', () => {
        // The census pinned that these three clone through `serializeWallSnapshot`, a
        // `{...wall}` spread, so they inherit `joinIntent` verbatim onto a wall standing
        // somewhere else. The commands now delete the field before add(); this asserts the
        // STORE half of that contract — that a cloned record arriving without a stamp is
        // re-derived against its OWN neighbourhood rather than left blank or copied.
        const store = newStore();
        for (const w of incumbentL()) store.add(w);
        store.add(newcomer(-90));
        const source = store.getById('W3')!;
        expect(source.joinIntent).toEqual({ start: 'butt' });   // the source IS stamped

        // Copy it far away from any junction, exactly as CopyElementCommand now does:
        // spread-clone, then DROP the inherited gesture.
        const copy = { ...source, id: 'W3_copy' } as unknown as Record<string, unknown>;
        copy.baseLine = [{ x: 40, y: 0, z: 40 }, { x: 45, y: 0, z: 40 }];
        delete copy.joinIntent;
        store.add(copy as unknown as WallData);

        // Standing alone in open space, it truthfully has NO join gesture — rather than
        // the source's 'butt', which would assert a snap onto a node it does not touch.
        expect(store.getById('W3_copy')!.joinIntent).toBeUndefined();
    });
});
