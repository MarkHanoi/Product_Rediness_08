/**
 * §C13-DERIVED-ELEMENT-LEVEL-ARM (L-8800) + §C13-ORPHAN-DESCENDANT-CENSUS (L-8802).
 *
 * ── THE REPORT THIS SUITE IS WRITTEN AGAINST ────────────────────────────────
 *
 * Founder's console, 2026-08-23, opening `proj-1787483901080-e63b318a95bb`:
 *
 *   [C13 VIOLATION] Project-isolation leak detected — 2 finding(s):
 *     [scene.foreignElement×8 (d6654ac1-… ⇐ room "room-overlay-d6654ac1-…";
 *                             ac0bcfb6-… ⇐ room "room-overlay-ac0bcfb6-…"; …),
 *      scope.foreignProject×1 (site.model still owned by proj-1786627649631-548a4dba67b5)]
 *     — ⚠ 28/153 scene root(s) UNATTRIBUTED … neither proven clean nor proven leaked
 *     · 849 descendant(s) attributed BY INHERITANCE from an id-bearing ancestor
 *
 * ⚠ THE TWO FINDINGS HAVE DIFFERENT ROOTS AND THIS SUITE COVERS ONLY THE FIRST.
 * `site.model` is a DATA defect (the project's own snapshot carries another project's
 * `site.projectId`; `ProjectLoader` restores it verbatim AFTER the teardown has
 * correctly nulled the store) and is logged separately as L-8810. Nothing here
 * asserts about it, deliberately — forcing one story onto two roots is how the
 * previous lane's verdict would have been wrong in both directions.
 *
 * ── WHY THE ROOM HALF FAILS PRE-FIX ─────────────────────────────────────────
 *
 * The eight rooms are NOT residue of a previous project. They are the loaded
 * project's OWN redetected rooms, and the audit could not have said otherwise:
 * `ProjectLoader` builds `__pryzmLoadedProjectExpectation` from the snapshot ARRAYS
 * and then runs its `redetect_sweep` phase, so a redetected room's id is outside the
 * expected set BY CONSTRUCTION, on every load, in every project, forever.
 * `LOAD_DERIVED_ELEMENT_TYPES` already declared exactly this class — and listed
 * `'room'` — but was wired only into the §L-325 RENDER-side audit, never into the
 * SCENE arm in `ProjectIsolationAudit.ts`.
 *
 * ⛔ THE REPAIR IS AN ATTRIBUTION, NOT AN EXEMPTION, and `it('still reports a
 * derived element whose LEVEL is foreign')` below is the assertion that enforces
 * that distinction. `LOAD_DERIVED_ELEMENT_TYPES` also contains `'stair-railing'` —
 * project A's railings surviving into project B is the REAL leak
 * §C13-INSTANCED-RENDERER-OWNER (L-8100) shipped hours earlier. An exemption would
 * have retro-blinded the audit to the leak it had just caught. If a future edit
 * turns this arm into a skip, that test goes red.
 *
 * ── WHAT IS REAL HERE ([[fake-more-capable-than-real]]) ─────────────────────
 *
 * A fake built from the header cannot falsify the header. So:
 *   • a real `THREE.Scene` with real `THREE.Mesh` objects in a real parent/child
 *     graph, walked by the real `collectSceneObjects` traversal — NOT object
 *     literals, which would pin the detector against the detector's own model of
 *     the world (the §C13-SCENE-ID-KEY mistake);
 *   • the real `detectLeaks` and the real `summariseSceneCoverage`;
 *   • the userData stamps are copied verbatim from the PRODUCERS and PINNED by
 *     source-text assertions below, so a rename in `RoomBoundaryBuilder` breaks
 *     these tests instead of silently re-blinding the audit.
 *
 * CONTRACTS: C13 §3.8 / §3.10 / §3.16 · C48 · ADR-0298 · ADR-0361.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as THREE from '@pryzm/renderer-three/three';
import {
    collectSceneObjects,
    detectLeaks,
    summariseSceneCoverage,
    formatSceneCoverage,
    describeScopeWitness,
    AMBIGUOUS_DEFAULT_LEVEL_ID,
} from './ProjectIsolationAudit';
import { LOAD_DERIVED_ELEMENT_TYPES } from './declaredProjectScopes';

const REPO = path.resolve(__dirname, '../../../..');
const ROOM_BUILDER = path.join(REPO, 'packages/room-topology/src/RoomBoundaryBuilder.ts');
const PROJECT_LOADER = path.join(REPO, 'apps/editor/src/engine/persistence/ProjectLoader.ts');

const PROJECT_B = 'proj-1787483901080-e63b318a95bb';
/** The project the founder's `site.model` probe named — the earlier one. */
const PROJECT_A = 'proj-1786627649631-548a4dba67b5';
const LEVEL_B = 'L1787483901081';
const LEVEL_A = 'L1786627649632';

/**
 * Build a room overlay EXACTLY as `RoomBoundaryBuilder._doUpdateRoom` does.
 * Stamps cited: `RoomBoundaryBuilder.ts:339` (id), `:341` (type), `:343` (levelId),
 * `:348` (name). Pinned by `describe('the stamps this arm reads')` below.
 */
function roomOverlay(roomId: string, levelId: string): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.userData.roomId = roomId;
    mesh.userData.id = roomId;
    mesh.userData.type = 'room';
    mesh.userData.elementType = 'room';
    mesh.userData.levelId = levelId;
    mesh.userData.isRoomOverlay = true;
    mesh.name = `room-overlay-${roomId}`;
    return mesh;
}

/** A stair-railing baluster as `StairRailingBuilder` stamps it (`:290`/`:303`). */
function railing(id: string, levelId: string): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.userData.id = id;
    mesh.userData.elementType = 'stair-railing';
    mesh.userData.levelId = levelId;
    return mesh;
}

/** An authored, snapshot-restored wall — NOT load-derived. The control. */
function wall(id: string): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.userData.id = id;
    mesh.userData.elementType = 'wall';
    return mesh;
}

function auditScene(
    scene: THREE.Scene,
    expected: string[],
): ReturnType<typeof detectLeaks> {
    const objects = collectSceneObjects(scene);
    expect(objects).not.toBeNull();
    return detectLeaks({
        projectId: PROJECT_B,
        expectedIds: new Set(expected),
        sceneObjects: objects!,
        sceneReadable: true,
        storeElements: [],
        globals: [],
        scopeProbes: [],
        declaredScopes: [],
    });
}

function surfaces(report: ReturnType<typeof detectLeaks>): string[] {
    return (report?.findings ?? []).map(f => f.surface);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('§C13-DERIVED-ELEMENT-LEVEL-ARM — the stamps this arm reads', () => {
    const src = readFileSync(ROOM_BUILDER, 'utf8');

    it('RoomBoundaryBuilder stamps id, type and levelId on the fill overlay', () => {
        // If any of these is renamed the arm silently stops attributing rooms and
        // every room goes back to being reported as a foreign element. Break here
        // instead — the §C13-SCENE-ID-KEY lesson.
        expect(src).toContain("mesh.userData.id = room.id;");
        expect(src).toContain("mesh.userData.type = 'room';");
        expect(src).toContain('mesh.userData.levelId = room.levelId;');
        expect(src).toContain('mesh.name = `room-overlay-${room.id}`;');
    });

    it('RoomBoundaryBuilder stamps levelId on the room VOLUME mesh too', () => {
        // The volume mesh shares the room id, so without its own levelId it would
        // fall through to the id arm and re-report a room the fill just cleared.
        expect(src).toContain('volumeMesh.userData.levelId = room.levelId;');
    });

    it("'room' is declared load-derived, and so is 'stair-railing'", () => {
        // The second half is the one that matters: it is why this arm had to be an
        // ATTRIBUTION. An exemption keyed on this list would have blinded the audit
        // to L-8100, the leak that shipped hours before this one was reported.
        expect(LOAD_DERIVED_ELEMENT_TYPES).toContain('room');
        expect(LOAD_DERIVED_ELEMENT_TYPES).toContain('stair-railing');
    });

    it('ProjectLoader publishes the expectation BEFORE it redetects rooms', () => {
        // This ordering is the whole reason a redetected room id can never be in the
        // expected set. If a future edit moves the publish after the sweep, the arm
        // is no longer needed for rooms — and this test says so out loud.
        const loader = readFileSync(PROJECT_LOADER, 'utf8');
        const publish = loader.indexOf('__pryzmLoadedProjectExpectation = {');
        // ⚠ Match the CALL, not the phase name: `redetect_sweep` also appears in four
        // comments earlier in the file (one of them at :531 literally quotes
        // `__phase('redetect_sweep')`), and a bare indexOf finds the prose first. This
        // assertion was written the naive way and failed on a tree where the ordering
        // was in fact correct — a matcher that is wrong in the SAFE direction still
        // trains the reader to discount the suite.
        const redetect = loader.indexOf(
            "__phase('redetect_sweep'); // explicit per-level ReDetectRoomsCommand sweep",
        );
        expect(publish).toBeGreaterThan(-1);
        expect(redetect).toBeGreaterThan(-1);
        expect(publish).toBeLessThan(redetect);
        // And it is DELIBERATE, not an accident of ordering — the loader says so in
        // its own words. (The sentence wraps across two comment lines, so match the
        // halves rather than a reflowed literal; a sibling lane is live in this file
        // and line numbers move under it.)
        expect(loader).toContain('Derived state');
        expect(loader).toContain('(redetected rooms, room-bounding-lines, annotations)');
    });
});

describe('§C13-DERIVED-ELEMENT-LEVEL-ARM — the founder\'s eight rooms', () => {
    it("does NOT report the loaded project's own redetected rooms", () => {
        // ⭐ FAILS ON THE PRE-FIX TREE. Pre-fix these eight are `scene.foreignElement×8`
        // — the founder's verdict verbatim — because their ids cannot be in the
        // expectation and the scene arm had no other way to judge them.
        const scene = new THREE.Scene();
        const ids = ['d6654ac1', 'ac0bcfb6', '178b0021', 'b1', 'b2', 'b3', 'b4', 'b5'];
        for (const id of ids) scene.add(roomOverlay(id, LEVEL_B));

        const report = auditScene(scene, [LEVEL_B, 'wall-1']);
        expect(report).toBeNull();
    });

    it('still reports a derived element whose LEVEL is foreign', () => {
        // ⛔ THE ANTI-EXEMPTION ASSERTION. A room overlay left behind by project A
        // carries one of project A's levels, and must remain a finding. If someone
        // "simplifies" the arm into a skip on LOAD_DERIVED_ELEMENT_TYPES, this goes red.
        const scene = new THREE.Scene();
        scene.add(roomOverlay('leaked-room', LEVEL_A));
        scene.add(roomOverlay('own-room', LEVEL_B));

        const report = auditScene(scene, [LEVEL_B]);
        expect(report).not.toBeNull();
        expect(surfaces(report)).toContain('scene.foreignDerivedElement');

        const finding = report!.findings.find(f => f.surface === 'scene.foreignDerivedElement')!;
        expect(finding.count).toBe(1);
        // The report must NAME the level, because "which project" is the fact the
        // founder actually needs and it is the only fact this arm establishes.
        expect(String(finding.identities?.[0])).toContain(LEVEL_A);
        expect(String(finding.identities?.[0])).toContain('leaked-room');
    });

    it("does not re-blind the audit to L-8100's stair-railings", () => {
        // The 37-railing leak the previous lane fixed, expressed through THIS arm.
        const scene = new THREE.Scene();
        for (let i = 0; i < 37; i += 1) scene.add(railing(`railing-${i}`, LEVEL_A));

        const report = auditScene(scene, [LEVEL_B]);
        expect(report).not.toBeNull();
        const finding = report!.findings.find(f => f.surface === 'scene.foreignDerivedElement')!;
        expect(finding.count).toBe(37);
    });

    it('leaves a derived element with NO readable levelId on the strict id arm', () => {
        // §CONTEXT-DATA-HONESTY — undecidable must fall through to the STRICTER check,
        // never to silence. An unstamped derived element is not clean.
        const scene = new THREE.Scene();
        const orphanRoom = roomOverlay('no-level-room', 'x');
        delete orphanRoom.userData.levelId;
        scene.add(orphanRoom);

        const report = auditScene(scene, [LEVEL_B]);
        expect(report).not.toBeNull();
        expect(surfaces(report)).toContain('scene.foreignElement');
    });

    it('reports an AUTHORED element by id exactly as before', () => {
        // The arm must not widen beyond the declared derived types. A wall is
        // serialized one-for-one and stays on the id arm.
        const scene = new THREE.Scene();
        scene.add(wall('wall-from-project-a'));

        const report = auditScene(scene, [LEVEL_B, 'wall-of-b']);
        expect(report).not.toBeNull();
        expect(surfaces(report)).toContain('scene.foreignElement');
        expect(surfaces(report)).not.toContain('scene.foreignDerivedElement');
    });

    it('counts a room ONCE even though it owns two meshes', () => {
        // Fill + volume share the room id. Two meshes, one element, one finding.
        const scene = new THREE.Scene();
        scene.add(roomOverlay('r1', LEVEL_A));
        const volume = roomOverlay('r1', LEVEL_A);
        volume.name = '';
        scene.add(volume);

        const report = auditScene(scene, [LEVEL_B]);
        const finding = report!.findings.find(f => f.surface === 'scene.foreignDerivedElement')!;
        expect(finding.count).toBe(1);
    });
});

describe('§C13-ORPHAN-DESCENDANT-CENSUS — the objects counted NOWHERE', () => {
    it('counts a descendant that has no id AND no id-bearing ancestor', () => {
        // ⭐ FAILS ON THE PRE-FIX TREE (the count did not exist). This is the seam:
        // not a root, so the root census skipped it; no id-bearing ancestor, so the
        // inheritance census skipped it; no id of its own, so `detectLeaks` had
        // nothing to test. Invisible to BOTH halves, and — unlike an unattributed
        // root, which at least prints a ⚠ — invisible in a way no reader could notice.
        const scene = new THREE.Scene();
        const unstampedParent = new THREE.Group();
        const child = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
        unstampedParent.add(child);
        scene.add(unstampedParent);

        const coverage = summariseSceneCoverage(collectSceneObjects(scene)!);
        expect(coverage.orphanedDescendantCount).toBe(1);
        expect(formatSceneCoverage(coverage)).toContain('ORPHANED');
        expect(formatSceneCoverage(coverage)).toContain('blindness, not cleanliness');
    });

    it('does NOT count a descendant of an id-bearing ancestor as orphaned', () => {
        // A wall's layer meshes are legitimately unstamped and are attributed by
        // inheritance. Accusing them is the cry-wolf failure this file rejects.
        const scene = new THREE.Scene();
        const wallRoot = wall('wall-1');
        const layer = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
        wallRoot.add(layer);
        scene.add(wallRoot);

        const coverage = summariseSceneCoverage(collectSceneObjects(scene)!);
        expect(coverage.orphanedDescendantCount).toBe(0);
        expect(coverage.inheritedCount).toBe(1);
    });

    it('prints the orphan clause on a CLEAN verdict too', () => {
        // A blind spot that only surfaces when something ELSE already failed is
        // exactly the blind spot that gets read as cleanliness.
        const scene = new THREE.Scene();
        const grp = new THREE.Group();
        grp.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()));
        scene.add(grp);
        scene.add(wall('wall-of-b'));

        const objects = collectSceneObjects(scene)!;
        const report = detectLeaks({
            projectId: PROJECT_B,
            expectedIds: new Set(['wall-of-b']),
            sceneObjects: objects,
            sceneReadable: true,
            storeElements: [], globals: [], scopeProbes: [], declaredScopes: [],
        });
        expect(report).toBeNull();                       // clean
        const coverage = summariseSceneCoverage(objects);
        expect(coverage.orphanedDescendantCount).toBe(1); // …and STILL says it is blind
    });
});

describe('§C13-DERIVED-ELEMENT-LEVEL-ARM — the census in the verdict', () => {
    it('reports how many elements moved off the element-id arm', () => {
        const scene = new THREE.Scene();
        scene.add(roomOverlay('r1', LEVEL_B));
        scene.add(roomOverlay('r2', LEVEL_B));

        const coverage = summariseSceneCoverage(collectSceneObjects(scene)!, new Set([LEVEL_B]));
        expect(coverage.derivedAttributedByLevel).toBe(2);
        expect(formatSceneCoverage(coverage)).toContain('attributed BY LEVEL');
    });

    it('counts a derived element on the universal default level as UNDECIDED', () => {
        // ⚠ The named residual blindness. `L0` is the default every project has
        // (`ClearProjectCommand` resets `activeLevelId` to it), so it discriminates
        // nothing. It must never be banked as a clean attribution.
        const scene = new THREE.Scene();
        scene.add(roomOverlay('r1', AMBIGUOUS_DEFAULT_LEVEL_ID));

        const coverage = summariseSceneCoverage(
            collectSceneObjects(scene)!,
            new Set([AMBIGUOUS_DEFAULT_LEVEL_ID]),
        );
        expect(coverage.derivedOnAmbiguousLevel).toBe(1);
        expect(coverage.derivedAttributedByLevel).toBe(0);
        const line = formatSceneCoverage(coverage);
        expect(line).toContain('UNDECIDED, not clean');
        expect(line).toContain(AMBIGUOUS_DEFAULT_LEVEL_ID);
    });

    it('distinguishes "not computed" from "zero" when no expectation was supplied', () => {
        // §CONTEXT-DATA-HONESTY — failure and empty are the same VALUE unless the
        // type keeps them apart. `undefined` means the census never ran.
        const scene = new THREE.Scene();
        scene.add(roomOverlay('r1', LEVEL_B));

        const coverage = summariseSceneCoverage(collectSceneObjects(scene)!);
        expect(coverage.derivedAttributedByLevel).toBeUndefined();
        expect(coverage.derivedOnAmbiguousLevel).toBeUndefined();
        expect(formatSceneCoverage(coverage)).not.toContain('attributed BY LEVEL');
    });
});

describe('§C13-SCOPE-WITNESS — telling a data defect from a teardown leak', () => {
    it('names a self-consistent site record as a SNAPSHOT defect, not a leak', () => {
        // The founder's finding: `site.model still owned by proj-1786627649631-…`
        // while `proj-1787483901080-…` is open. `deterministicSiteId` makes the site
        // id derivable from the project id, so a matching pair proves the record was
        // minted for — and copied wholesale from — the owning project.
        const witness = describeScopeWitness({ siteId: `site_${PROJECT_A}`, projectId: PROJECT_A }, PROJECT_A);
        expect(witness).toContain('SNAPSHOT/duplication defect');
        expect(witness).toContain('NOT a teardown leak');
    });

    it('flags a MISMATCHED id/projectId pair differently', () => {
        // Two different mechanisms must never print the same string — that identity
        // is what let the previous lane read this finding as a teardown failure.
        const witness = describeScopeWitness({ siteId: `site_${PROJECT_B}`, projectId: PROJECT_A }, PROJECT_A);
        expect(witness).toContain('DISAGREE');
        expect(witness).not.toContain('SNAPSHOT/duplication defect');
    });

    it('says NOTHING when the probe supplied no witness', () => {
        // ⛔ An absent witness must not be rendered as either verdict. Silence is the
        // honest output when the evidence was not collected.
        expect(describeScopeWitness(null, PROJECT_A)).toBe('');
        expect(describeScopeWitness({}, PROJECT_A)).toBe('');
        expect(describeScopeWitness({ siteId: '' }, PROJECT_A)).toBe('');
    });
});
