/**
 * ADR-0385 §2 point 1 — the massing-group -> `hierarchyStore` projection.
 *
 * ⭐ WHAT EACH ARM IS FOR, AND WHY IT CANNOT PASS BY LUCK.
 *
 * A sibling lane's scramble control caught its own headline arm tonight: the test
 * passed with the feature DELETED, because it asserted a value that was reachable by
 * accident. So every arm below is written against a value the projection is the ONLY
 * producer of:
 *
 *   · `buildBuildingRoster` returns exactly ONE building named "Default Building" for
 *     an unprojected store. So an arm asserting TWO buildings with the group LABELS
 *     cannot pass unless the projection ran — the fallback shape is a different
 *     cardinality AND a different name.
 *   · The idempotency arms assert `added/updated/removed` are all EMPTY on the second
 *     run, and separately that `metadata.version` did not move. A writer that
 *     re-wrote identical rows would pass the first check on a naive implementation
 *     and fail the second; both are here because `HierarchyStore.update()` bumps
 *     `version` unconditionally, which is how "idempotent" quietly becomes
 *     "accumulates".
 *   · The reap arms assert a HAND-AUTHORED building SURVIVES. That is the arm that
 *     would catch the catastrophic version of this feature, and it asserts a
 *     positive presence rather than an absence.
 */

import { describe, it, expect } from 'vitest';
import {
    applyMassingGroupProjection,
    deriveMassingHierarchy,
    isProjectedHierarchyId,
    planMassingGroupProjection,
    projectedBuildingId,
    projectedLevelId,
    readMassingGroupSubstrate,
    PROJECTED_SITE_ID,
    UNREADABLE_MASSING_SUBSTRATE,
    type MassingGroupMemberView,
} from './MassingGroupProjection.js';
import { HierarchyStore } from './HierarchyStore.js';
import {
    buildBuildingRoster,
    readBuildingSubstrate,
    DEFAULT_BUILDING_ID,
    DEFAULT_BUILDING_NAME,
} from './BuildingResolver.js';
import type { BuildingData } from './HierarchyTypes.js';

// ── fixtures ────────────────────────────────────────────────────────────────

/** One level envelope, exactly as the plugin store holds it. */
function env(
    id: string,
    levelId: string,
    group: { id: string; label: string } | null,
    role = 'level',
): MassingGroupMemberView {
    return { id, levelId, role, group };
}

/** Block A on L1/L2, Block B on L1/L2/L3 — the founder's master-plan shape. */
function twoBlocks(): MassingGroupMemberView[] {
    return [
        env('e1', 'L1', { id: 'g-a', label: 'Block A' }),
        env('e2', 'L2', { id: 'g-a', label: 'Block A' }),
        env('e3', 'L1', { id: 'g-b', label: 'Block B' }),
        env('e4', 'L2', { id: 'g-b', label: 'Block B' }),
        env('e5', 'L3', { id: 'g-b', label: 'Block B' }),
    ];
}

function project(store: HierarchyStore, envelopes: MassingGroupMemberView[] | null) {
    return applyMassingGroupProjection(store, readMassingGroupSubstrate(envelopes));
}

// ═════════════════════════════════════════════════════════════════════════════
// 1 · THE READ — a failure and an emptiness are different values
// ═════════════════════════════════════════════════════════════════════════════

describe('ADR-0385 — readMassingGroupSubstrate keeps FAILURE and EMPTINESS apart', () => {
    it('null input is UNREADABLE (groups === null), never an empty group list', () => {
        expect(readMassingGroupSubstrate(null).groups).toBeNull();
        expect(readMassingGroupSubstrate(undefined).groups).toBeNull();
        expect(UNREADABLE_MASSING_SUBSTRATE.groups).toBeNull();
    });

    it('an empty but READABLE store is [] — an emptiness', () => {
        const s = readMassingGroupSubstrate([]);
        expect(s.groups).toEqual([]);
        expect(s.groups).not.toBeNull();
    });

    it('an iterable that THROWS mid-read is a failure, not an emptiness', () => {
        // NOTE (lane CI-RED, 2026-09-09): this was a GENERATOR (`*[Symbol.iterator]()`) with no
        // `yield`, which is an ESLint `require-yield` ERROR and was the only lint error left on
        // main. The hand-written iterator below throws at EXACTLY the same moment the generator
        // did — the first `next()`, i.e. MID-READ, which is what this test is named for. ⛔ The
        // tempting one-line fix, dropping the star, is NOT equivalent: a plain throwing method
        // throws when the iterator is ACQUIRED, one step earlier, and would silently retarget
        // the test at a different failure point.
        const hostile: Iterable<MassingGroupMemberView> = {
            [Symbol.iterator]: () => ({
                next(): IteratorResult<MassingGroupMemberView> { throw new Error('store exploded'); },
            }),
        };
        const s = readMassingGroupSubstrate(hostile);
        expect(s.groups).toBeNull();
        expect(s.note).toContain('threw');
    });

    it('ungrouped envelopes contribute NOTHING — ADR-0383 D3', () => {
        const s = readMassingGroupSubstrate([
            env('e1', 'L1', null),
            env('e2', 'L2', null),
        ]);
        expect(s.groups).toEqual([]);
    });

    it('a role:"room" member is a MEMBER but not a STOREY', () => {
        const s = readMassingGroupSubstrate([
            env('e1', 'L1', { id: 'g-a', label: 'Block A' }),
            env('r1', 'L1', { id: 'g-a', label: 'Block A' }, 'room'),
        ]);
        expect(s.groups).toHaveLength(1);
        expect(s.groups![0]!.levelIds).toEqual(['L1']);
    });

    it('two storeys on ONE levelId de-duplicate to one storey row', () => {
        const s = readMassingGroupSubstrate([
            env('e1', 'L1', { id: 'g-a', label: 'Block A' }),
            env('e2', 'L1', { id: 'g-a', label: 'Block A' }),
        ]);
        expect(s.groups![0]!.levelIds).toEqual(['L1']);
    });

    it('label DISAGREEMENT is reported, never arbitrated silently', () => {
        const s = readMassingGroupSubstrate([
            env('e1', 'L1', { id: 'g-a', label: 'Block A' }),
            env('e2', 'L2', { id: 'g-a', label: 'Block A renamed' }),
        ]);
        expect(s.groups![0]!.labelDisagreement).toBe(true);
        expect(s.groups![0]!.label).toBe('Block A'); // first-seen, stable
    });

    it('the group order is by groupId, so the derivation cannot depend on store order', () => {
        const forwards = readMassingGroupSubstrate(twoBlocks());
        const backwards = readMassingGroupSubstrate([...twoBlocks()].reverse());
        expect(forwards.groups!.map((g) => g.groupId)).toEqual(['g-a', 'g-b']);
        expect(backwards.groups!.map((g) => g.groupId)).toEqual(['g-a', 'g-b']);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 · IDS — derived, collision-proof, and recognisable as OWNED
// ═════════════════════════════════════════════════════════════════════════════

describe('ADR-0385 — the projected ids are DERIVED, not minted (C16 CA-2, and stronger)', () => {
    it('the same group yields the same building id every time', () => {
        expect(projectedBuildingId('g-a')).toBe(projectedBuildingId('g-a'));
    });

    it('every projected id is recognisable as owned; a hand-authored uuid is not', () => {
        expect(isProjectedHierarchyId(projectedBuildingId('g-a'))).toBe(true);
        expect(isProjectedHierarchyId(projectedLevelId('g-a', 'L1'))).toBe(true);
        expect(isProjectedHierarchyId(PROJECTED_SITE_ID)).toBe(true);
        expect(isProjectedHierarchyId('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe(false);
        expect(isProjectedHierarchyId(DEFAULT_BUILDING_ID)).toBe(false);
    });

    it('⛔ ids carrying the SEPARATOR cannot collide — two groups never become one building', () => {
        // The exact hazard: a naive `prefix + groupId + '/' + levelId` join makes
        // ('a/b', 'c') and ('a', 'b/c') the same string, which silently merges two
        // buildings. `encodeURIComponent` escapes `/` and so the join is unambiguous.
        expect(projectedLevelId('a/b', 'c')).not.toBe(projectedLevelId('a', 'b/c'));
        expect(projectedBuildingId('a/b')).not.toBe(projectedBuildingId('a%2Fb'));
        // And it can never produce the `::` that ifcIdentity.storeySlot uses.
        expect(projectedBuildingId('x::y')).not.toContain('::');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 · THE HEADLINE — two groups become two buildings the ONE resolver can see
// ═════════════════════════════════════════════════════════════════════════════

describe('ADR-0385 §2 — two massing groups become TWO IfcBuilding-bearing rows', () => {
    it('⭐ before the projection the roster is ONE default building; after it, TWO named ones', () => {
        const store = new HierarchyStore();

        // BEFORE — the state the founder was in. This is also the control that makes
        // the "after" arm impossible to pass by luck: the fallback has a different
        // CARDINALITY and different NAMES from what the projection produces.
        const before = buildBuildingRoster(['L1', 'L2', 'L3'], readBuildingSubstrate(store));
        expect(before.buildings).toHaveLength(1);
        expect(before.buildings[0]!.id).toBe(DEFAULT_BUILDING_ID);
        expect(before.buildings[0]!.name).toBe(DEFAULT_BUILDING_NAME);
        expect(before.buildings[0]!.kind).toBe('derived');

        const report = project(store, twoBlocks());
        expect(report.ok).toBe(true);
        expect(report.groups).toBe(2);

        const after = buildBuildingRoster(['L1', 'L2', 'L3'], readBuildingSubstrate(store));
        // ⛔ 'L1' and 'L2' are claimed by BOTH blocks, so they resolve `unknown` —
        // ADR-0385 §3's own example, and the honest answer for an element that carries
        // only a levelId. 'L3' is Block B's alone and resolves CARRIED.
        expect(after.unknown.map((u) => u.levelId)).toEqual(['L1', 'L2']);

        // The BUILDINGS are what this arm is about, and they are two real, named rows.
        const substrate = readBuildingSubstrate(store);
        expect(substrate.buildings!.map((b) => b.name).sort()).toEqual(['Block A', 'Block B']);
        expect(substrate.levels).toHaveLength(5);
    });

    it('⭐ blocks on DISJOINT storeys resolve carried, and the roster names both', () => {
        const store = new HierarchyStore();
        project(store, [
            env('e1', 'L1', { id: 'g-a', label: 'Block A' }),
            env('e2', 'L2', { id: 'g-a', label: 'Block A' }),
            env('e3', 'L3', { id: 'g-b', label: 'Block B' }),
        ]);
        const roster = buildBuildingRoster(['L1', 'L2', 'L3'], readBuildingSubstrate(store));
        expect(roster.buildings).toHaveLength(2);
        expect(roster.buildings.map((b) => b.name)).toEqual(['Block A', 'Block B']);
        expect(roster.buildings.map((b) => b.kind)).toEqual(['carried', 'carried']);
        expect(roster.buildings[0]!.levelIds).toEqual(['L1', 'L2']);
        expect(roster.buildings[1]!.levelIds).toEqual(['L3']);
        expect(roster.unknown).toEqual([]);
    });

    it('a site is minted when the project has none, and ADOPTED when it has one', () => {
        const minted = new HierarchyStore();
        project(minted, twoBlocks());
        expect(minted.getSites().map((s) => s.id)).toEqual([PROJECTED_SITE_ID]);
        for (const b of minted.getBuildings()) expect(b.siteId).toBe(PROJECTED_SITE_ID);

        const adopted = new HierarchyStore();
        adopted.add({
            id: 'site-real', type: 'site', name: 'Carrer de Mallorca',
            plannedData: { customProperties: {} }, syncState: 'no-template',
            metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'user', version: 1 },
        });
        project(adopted, twoBlocks());
        expect(adopted.getSites().map((s) => s.id)).toEqual(['site-real']);
        for (const b of adopted.getBuildings()) expect(b.siteId).toBe('site-real');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 · RECONCILE BY DIFF — the property that makes this a projection
// ═════════════════════════════════════════════════════════════════════════════

describe('ADR-0385 — reconciled by DIFF, never accumulated', () => {
    it('⭐ re-running on an UNCHANGED model is a NO-OP — zero adds, zero updates, zero removes', () => {
        const store = new HierarchyStore();
        const first = project(store, twoBlocks());
        expect(first.added.length).toBeGreaterThan(0);

        const second = project(store, twoBlocks());
        expect(second.added).toEqual([]);
        expect(second.updated).toEqual([]);
        expect(second.removed).toEqual([]);
        expect(second.unchanged).toBe(first.added.length);
    });

    it('⛔ and it does not merely re-write identical rows — `metadata.version` does not move', () => {
        // This is the arm that distinguishes a PROJECTION from an emit-only writer.
        // `HierarchyStore.update()` bumps `version` on EVERY call, so a writer that
        // "idempotently" re-wrote each row would leave the store looking correct while
        // counting upward forever — accumulation wearing idempotency's clothes.
        const store = new HierarchyStore();
        project(store, twoBlocks());
        const versionsAfterFirst = store.getAll().map((n) => `${n.id}@${n.metadata.version}`).sort();
        for (let i = 0; i < 5; i++) project(store, twoBlocks());
        expect(store.getAll().map((n) => `${n.id}@${n.metadata.version}`).sort())
            .toEqual(versionsAfterFirst);
    });

    it('⛔⛔ the projection does not ADOPT its own minted site and then reap it (the oscillation this arm found)', () => {
        // THE DEFECT, FOUND BY THE ARM ABOVE AND NOT BY REVIEW. Run 1 minted
        // `massing~site`; run 2 read it back as "an existing site", ADOPTED it, and so
        // stopped WANTING it — and the reap, which removes every owned node the
        // derivation no longer wants, deleted the site the buildings hung off. Run 3
        // re-minted it. An unchanged model must not produce a mutation, ever.
        const store = new HierarchyStore();
        for (let i = 0; i < 4; i++) {
            const r = project(store, twoBlocks());
            expect(r.ok).toBe(true);
            if (i > 0) expect([...r.added, ...r.updated, ...r.removed]).toEqual([]);
            // The site is present on EVERY pass — never momentarily absent.
            expect(store.getSites().map((s) => s.id)).toEqual([PROJECTED_SITE_ID]);
            for (const b of store.getBuildings()) expect(b.siteId).toBe(PROJECTED_SITE_ID);
        }
    });

    it('⭐ RENAMING a group UPDATES its building — it never mints a second one', () => {
        const store = new HierarchyStore();
        project(store, twoBlocks());
        expect(store.getBuildings()).toHaveLength(2);

        const renamed = twoBlocks().map((e) =>
            (e.group as { id: string })?.id === 'g-a'
                ? env(String(e.id), String(e.levelId), { id: 'g-a', label: 'Podium' })
                : e);
        const report = project(store, renamed);

        expect(store.getBuildings()).toHaveLength(2);           // NOT three
        expect(report.added).toEqual([]);
        expect(report.updated).toEqual([projectedBuildingId('g-a')]);
        expect(store.getBuildings().map((b) => b.name).sort()).toEqual(['Block B', 'Podium']);
    });

    it('⭐ deleting every envelope of a group REAPS its building and its storeys', () => {
        const store = new HierarchyStore();
        project(store, twoBlocks());
        expect(store.getBuildings()).toHaveLength(2);

        // Block A's envelopes are gone. An orphan building claiming storeys that no
        // longer exist is exactly what a projection must not leave behind.
        project(store, twoBlocks().filter((e) => (e.group as { id: string }).id !== 'g-a'));
        expect(store.getBuildings().map((b) => b.name)).toEqual(['Block B']);
        expect(store.getLevels().every((l) => l.buildingId === projectedBuildingId('g-b'))).toBe(true);
    });

    it('⭐ dissolving EVERY group returns the store to byte-identical emptiness', () => {
        const store = new HierarchyStore();
        project(store, twoBlocks());
        expect(store.getAll().length).toBeGreaterThan(0);

        // `spaceEnvelope.group.dissolve` clears `group` on every member — it deletes
        // nothing. The projection must then own nothing, INCLUDING the site it minted.
        project(store, twoBlocks().map((e) => env(String(e.id), String(e.levelId), null)));
        expect(store.getAll()).toEqual([]);

        // …and the ungrouped guarantee holds again, exactly as before anything happened.
        const roster = buildBuildingRoster(['L1', 'L2', 'L3'], readBuildingSubstrate(store));
        expect(roster.buildings).toHaveLength(1);
        expect(roster.buildings[0]!.id).toBe(DEFAULT_BUILDING_ID);
    });

    it('a storey ADDED to a group adds one LevelData; a storey removed reaps one', () => {
        const store = new HierarchyStore();
        const base = [env('e1', 'L1', { id: 'g-a', label: 'Block A' })];
        project(store, base);
        expect(store.getLevels()).toHaveLength(1);

        project(store, [...base, env('e2', 'L2', { id: 'g-a', label: 'Block A' })]);
        expect(store.getLevels().map((l) => l.bimLevelId)).toEqual(['L1', 'L2']);
        expect(store.getBuildings()[0]!.numberOfStoreys).toBe(2);

        project(store, base);
        expect(store.getLevels().map((l) => l.bimLevelId)).toEqual(['L1']);
        expect(store.getBuildings()[0]!.numberOfStoreys).toBe(1);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5 · THE TWO GUARANTEES THAT MAKE THIS SAFE TO SHIP
// ═════════════════════════════════════════════════════════════════════════════

describe('ADR-0385 — the projection is SCOPED to what it owns', () => {
    it('⭐⭐ a HAND-AUTHORED building survives a projection that reaps everything else', () => {
        // The catastrophic version of this feature deletes the user's own buildings.
        // The arm asserts a POSITIVE presence, so it cannot pass by the projection
        // simply not running.
        const store = new HierarchyStore();
        store.add({
            id: 'site-real', type: 'site', name: 'Site',
            plannedData: { customProperties: {} }, syncState: 'no-template',
            metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'user', version: 1 },
        });
        const handAuthored: BuildingData = {
            id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301', type: 'building',
            name: 'Existing Tower', parentId: 'site-real', siteId: 'site-real',
            plannedData: { customProperties: {} }, syncState: 'no-template',
            metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'user', version: 1 },
        };
        store.add(handAuthored);

        project(store, twoBlocks());
        project(store, []);   // every massing group gone

        const survivors = store.getBuildings();
        expect(survivors).toHaveLength(1);
        expect(survivors[0]!.name).toBe('Existing Tower');
        expect(survivors[0]!.metadata.version).toBe(1);  // untouched, not "restored"
        expect(store.getSites().map((s) => s.id)).toEqual(['site-real']);
    });

    it('⛔⛔ an UNREADABLE substrate reaps NOTHING — the L-581/L-616 arm', () => {
        const store = new HierarchyStore();
        project(store, twoBlocks());
        const before = store.getAll().map((n) => n.id).sort();

        const report = applyMassingGroupProjection(store, UNREADABLE_MASSING_SUBSTRATE);
        expect(report.ok).toBe(false);
        expect(report.refusal).toContain('UNREADABLE');
        expect(report.removed).toEqual([]);
        expect(store.getAll().map((n) => n.id).sort()).toEqual(before);
    });

    it('⭐ an UNGROUPED project leaves hierarchyStore BYTE-IDENTICAL (ADR-0383 D3)', () => {
        const store = new HierarchyStore();
        const report = project(store, [
            env('e1', 'L1', null),
            env('e2', 'L2', null),
            env('r1', 'L1', null, 'room'),
        ]);
        expect(report.ok).toBe(true);
        expect(report.added).toEqual([]);
        expect(report.updated).toEqual([]);
        expect(report.removed).toEqual([]);
        expect(store.getAll()).toEqual([]);

        // …so the ONE resolver still answers exactly as it did before ADR-0385.
        const roster = buildBuildingRoster(['L1', 'L2'], readBuildingSubstrate(store));
        expect(roster.buildings).toHaveLength(1);
        expect(roster.buildings[0]!.id).toBe(DEFAULT_BUILDING_ID);
        expect(roster.buildings[0]!.name).toBe(DEFAULT_BUILDING_NAME);
        expect(roster.buildings[0]!.levelIds).toEqual(['L1', 'L2']);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6 · THE PURE HALVES, driven directly
// ═════════════════════════════════════════════════════════════════════════════

describe('ADR-0385 — the pure derivation and the pure plan', () => {
    it('deriveMassingHierarchy mints no site when there are no groups', () => {
        const d = deriveMassingHierarchy({ groups: [], note: '' }, { existingSiteIds: [] });
        expect(d.site).toBeNull();
        expect(d.buildings).toEqual([]);
    });

    it('several sites: the first is adopted AND the ambiguity is stated in the note', () => {
        const d = deriveMassingHierarchy(
            readMassingGroupSubstrate(twoBlocks()),
            { existingSiteIds: ['s1', 's2'] },
        );
        expect(d.siteId).toBe('s1');
        expect(d.note).toContain('2 sites exist');
    });

    it('planMassingGroupProjection emits removes CHILDREN-FIRST so no storey ever dangles', () => {
        const derivation = deriveMassingHierarchy({ groups: [], note: '' }, { existingSiteIds: [] });
        const plan = planMassingGroupProjection(derivation, [
            { id: projectedBuildingId('g'), type: 'building', name: 'B' },
            { id: projectedLevelId('g', 'L1'), type: 'level', name: 'L1' },
            { id: PROJECTED_SITE_ID, type: 'site', name: 'S' },
        ], () => 0);
        expect(plan.removes).toEqual([
            projectedLevelId('g', 'L1'),
            projectedBuildingId('g'),
            PROJECTED_SITE_ID,
        ]);
    });

    it('planMassingGroupProjection emits adds PARENTS-FIRST', () => {
        const derivation = deriveMassingHierarchy(
            readMassingGroupSubstrate([env('e1', 'L1', { id: 'g', label: 'B' })]),
            { existingSiteIds: [] },
        );
        const plan = planMassingGroupProjection(derivation, [], () => 0);
        expect(plan.adds.map((n) => n.type)).toEqual(['site', 'building', 'level']);
    });

    it('an update names WHICH fields changed — a bare id is not a diagnosis', () => {
        const derivation = deriveMassingHierarchy(
            readMassingGroupSubstrate([env('e1', 'L1', { id: 'g', label: 'Renamed' })]),
            { existingSiteIds: ['s1'] },
        );
        const plan = planMassingGroupProjection(derivation, [
            { id: 's1', type: 'site', name: 'S' },
            { id: projectedBuildingId('g'), type: 'building', name: 'Old', parentId: 's1', siteId: 's1', numberOfStoreys: 1 },
        ], () => 0);
        const update = plan.updates.find((u) => u.id === projectedBuildingId('g'));
        expect(update?.changed).toEqual(['name']);
        expect(update?.patch).toEqual({ name: 'Renamed' });
    });

    it('the level name comes from the resolver when it has one, and from the id when it does not', () => {
        const sub = readMassingGroupSubstrate([env('e1', 'L1', { id: 'g', label: 'B' })]);
        expect(deriveMassingHierarchy(sub, { existingSiteIds: [] }).levels[0]!.name).toBe('L1');
        expect(deriveMassingHierarchy(sub, {
            existingSiteIds: [], levelNameOf: () => 'Ground Floor',
        }).levels[0]!.name).toBe('Ground Floor');
    });
});
