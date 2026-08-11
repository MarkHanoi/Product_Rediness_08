/**
 * §C13-AUDIT-BLIND-CLASSES — the INJECTION EXPERIMENT.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * `ProjectIsolationAudit.coverage.test.ts` already pins the coverage clause, but it
 * builds its scene out of hand-written object literals. That is the §C13-SCENE-ID-KEY
 * mistake one level up: a positive control is only evidence when the thing it plants
 * is the thing the system really produces. A literal `{ type: 'Mesh', name: '…' }`
 * cannot tell you whether a REAL `THREE.Sprite` parented under a REAL `THREE.Group`
 * survives the REAL traversal.
 *
 * So this suite:
 *   1. builds a REAL `THREE.Scene`,
 *   2. injects one object per suspect CLASS, stamped VERBATIM as the production
 *      builder stamps it (each fixture cites its builder by file:line, so a rename
 *      breaks this test rather than silently re-blinding the audit),
 *   3. runs the REAL `collectSceneObjects` traversal + the REAL `summariseSceneCoverage`
 *      + the REAL `detectLeaks`,
 *   4. and asserts, per class, whether the audit produces ANY signal at all.
 *
 * "ANY signal" is deliberately generous: a class counts as SEEN if it lands in
 * `findings[]` (a violation), in `coverage.unattributed` (the honest floor), or in
 * `coverage.inheritedCount` (counted as "attributed only by an ancestor, never
 * checked"). Only a class that produces NONE of the three is blind — it has
 * VANISHED, and a vanished object is the Class-E under-counting defect: the audit
 * reports a FALSE CLEAN.
 *
 * OUTSIDE THE AUDIT ENTIRELY, BY CONSTRUCTION — Cesium primitives and the editor's
 * auxiliary `THREE.Scene`s are separate object graphs that `window.scene.traverse()`
 * cannot reach. The last test here proves that, and the audit now DECLARES it in its
 * own output (`SCENE_GRAPHS_NOT_TRAVERSED`) rather than leaving a reader of "N/M
 * scene roots" to assume M was everything on screen.
 */

// P2: THREE only ever via the renderer-three owner.
import * as THREE from '@pryzm/renderer-three/three';
import { describe, it, expect } from 'vitest';
import {
    collectSceneObjects,
    summariseSceneCoverage,
    formatSceneCoverage,
    detectLeaks,
    type SceneObjectLike,
} from './ProjectIsolationAudit';
// Imported, NOT retyped. The fixture below claimed to be "verbatim from
// LevelMassingRenderer.ts:284-298" while hand-writing the name as
// 'pryzm-level-massing'; the real constant is '__pryzmLevelMassing'. A fixture
// that paraphrases the builder is the §C13-SCENE-ID-KEY mistake the header of
// this file warns about — it validates the audit against fiction. Binding to the
// exported constant means a rename BREAKS this test instead of silently
// re-blinding the audit, which is what the docstring promised all along.
import { LEVEL_MASSING_MESH_NAME } from '../rendering/LevelMassingRenderer';

// ── The five suspect classes, built the way production builds them ────────────

/**
 * CLASS 1 — LABEL SPRITE.
 * Verbatim from `packages/room-topology/src/RoomLabelRenderer.ts:51-61`:
 *   sprite.name = `room-label-${room.id}`;
 *   sprite.userData.roomId = room.id;
 *   sprite.userData.type   = 'room-label';
 *   this._scene.add(sprite);
 * Note what is ABSENT: no `id`, no `elementId`, no `elementType`. It carries a
 * `type` but nothing the id-based checks can key on.
 */
function injectLabelSprite(scene: THREE.Scene): void {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
    sprite.name = 'room-label-room-A1';
    sprite.userData.roomId = 'room-A1';
    sprite.userData.type = 'room-label';
    scene.add(sprite);
}

/**
 * CLASS 1b — LABEL SPRITE, NESTED.
 * Verbatim from `packages/core-app-model/src/BimGridRenderer.ts:230-232`:
 *   sprite.userData = { elementType: 'BimGrid', id: grid.id };
 *   this.bimGridsGroup.add(sprite);
 * and `packages/core-app-model/src/LevelVisualizer.ts:290`:
 *   sprite.userData = { elementType: 'LevelLine', id: level.id };
 * These are NOT scene roots — they hang under a renderer-owned container group.
 */
function injectNestedLabelSprite(scene: THREE.Scene): void {
    const container = new THREE.Group();
    container.name = 'bimGridsGroup';
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
    sprite.userData = { elementType: 'BimGrid', id: 'grid-FOREIGN' };
    container.add(sprite);
    scene.add(container);
}

/**
 * CLASS 2 — UNSTAMPED FALLBACK BOX.
 * The grey box a 404'd GLB leaves behind. `FurnitureFragmentBuilder.ts:96-119`
 * stamps the ROOT `{ id, elementType: 'Furniture', … }` — that root IS seen. The
 * unstamped variant is the box that reaches the scene WITHOUT ever acquiring that
 * stamp (a fallback mesh added to the scene directly, or a root whose stamp never
 * ran because the GLB path threw before line 96).
 */
function injectUnstampedFallbackBox(scene: THREE.Scene): void {
    const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.6, 0.6),
        new THREE.MeshStandardMaterial({ color: 0xb9c0cc }),
    );
    box.name = 'furniture-fallback-box';
    scene.add(box);
}

/**
 * CLASS 3 — GENERATED / MASSING GROUP.
 * Verbatim from `packages/core-app-model/src/rendering/LevelMassingRenderer.ts:284-298`:
 *   mesh.name = LEVEL_MASSING_MESH_NAME;
 *   mesh.userData.isHelper    = true;
 *   mesh.userData.isMassingLod = true;
 *   this._scene.add(mesh);
 * No id, no elementType — one InstancedMesh standing in for a whole storey stack.
 */
function injectMassingGroup(scene: THREE.Scene): void {
    const mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial(),
        4,
    );
    mesh.name = LEVEL_MASSING_MESH_NAME;
    mesh.userData.isHelper = true;
    mesh.userData.isMassingLod = true;
    scene.add(mesh);
}

/**
 * CLASS 4 — COALESCED INSTANCED ROOT.
 * Verbatim from `packages/scene-committer/src/InstancedMeshCoalescer.ts:325-356`:
 *   const merged = new THREE.InstancedMesh(geo, mat, totalCount);
 *   merged.userData.isCoalesced   = true;
 *   merged.userData.coalescedKey  = key;
 *   scene.add(merged);
 * NOTE what the coalescer KNOWS but does not stamp: it holds `group.sources`, an
 * array of `{ elementId, count }`. The element ids exist; they are simply not
 * written onto the merged root. See the report's builder-seam section.
 */
function injectCoalescedInstancedRoot(scene: THREE.Scene): void {
    const merged = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial(),
        2,
    );
    // Deliberately KEYLESS — the degenerate case in which the level cannot be read.
    // It must fall through to the UNATTRIBUTED floor, never to silence.
    merged.userData.isCoalesced = true;
    scene.add(merged);
}

/**
 * CLASS 4b — COALESCED INSTANCED ROOT, keyed.
 * `InstancedMeshCoalescer.ts:303` builds the key as
 *   const key = `${levelId}:${geoUUID}:${matUUID}`;
 * so the LEVEL the merged root belongs to is written into the root, in plain text.
 * Levels ARE in the loader expectation (§L-711 put `snapshot.levels` there), so this
 * root is ATTRIBUTABLE — the audit simply never parsed the key.
 */
function injectCoalescedRootWithForeignLevel(scene: THREE.Scene): void {
    const merged = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial(), 2,
    );
    merged.userData.isCoalesced = true;
    merged.userData.coalescedKey = 'level-FROM-PROJECT-A:geo-uuid-1:mat-uuid-1';
    scene.add(merged);
}

/**
 * CLASS 6 — ROOT CARRYING AN id BUT NO TYPE.
 * The seam between the two halves of the audit. `detectLeaks` flags a scene object
 * only when `sceneElementId(ud) !== null && sceneElementType(ud) != null`;
 * `summariseSceneCoverage` treats ANY root with an id as ATTRIBUTED. An object with
 * an id and no type therefore satisfies neither — it is skipped by the violation
 * check as untyped and skipped by the coverage floor as attributed. It VANISHES.
 */
function injectIdWithoutType(scene: THREE.Scene): void {
    const g = new THREE.Group();
    g.name = 'legacy-root';
    g.userData = { id: 'elem-FROM-PROJECT-A', levelId: 'level-A' };
    scene.add(g);
}

/**
 * CLASS 7 — FOREIGN SUBTREE UNDER AN ATTRIBUTED ROOT.
 * `summariseSceneCoverage` inspects `isRoot === true` only. Everything below a root
 * is attributed BY INHERITANCE, never checked. A foreign group parented under a
 * legitimately-expected element is invisible to the floor.
 */
function injectForeignSubtreeUnderOwnedRoot(scene: THREE.Scene): void {
    const owned = new THREE.Group();
    owned.name = 'wall-EXPECTED';
    owned.userData = { id: 'wall-EXPECTED', elementType: 'wall' };
    const foreign = new THREE.Group();
    foreign.name = 'technical-drawing-plan-L0-FROM-PROJECT-A';
    owned.add(foreign);
    scene.add(owned);
}

/**
 * CLASS 8 — AN AUXILIARY THREE SCENE.
 * `FloatingObjectCarousel.ts:305` (`this.scene = new THREE.Scene()`) and
 * `FurnitureDragDropHandler`'s `indicatorScene` are SEPARATE THREE scene graphs.
 * `FloatingObjectCarousel.ts:427-438` puts an entirely UNSTAMPED grey fallback box
 * into one of them on a GLB 404. The audit traverses exactly one graph — `window.scene`.
 */
function makeAuxiliaryScene(): THREE.Scene {
    const aux = new THREE.Scene();
    const group = new THREE.Group();                    // no userData, no name
    const mesh = new THREE.Mesh(                        // no userData, no name
        new THREE.BoxGeometry(0.8, 0.8, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x888888 }),
    );
    group.add(mesh);
    aux.add(group);
    return aux;
}

/**
 * CLASS 5 — CESIUM PRIMITIVE.
 * `apps/editor/src/ui/geospatial/CesiumViewport.ts:2201, 8818, 9725, 11936, 12199,
 * 13715` all do `viewer.scene.primitives.add(prim)`. That is a Cesium
 * `PrimitiveCollection`, a SECOND, INDEPENDENT scene graph: not reachable from
 * `window.scene`, and — the load-bearing fact — carrying no `.traverse()` at all,
 * so `collectSceneObjects` returns null on it by construction.
 *
 * ⚠ THE REAL CLASS, NOT A STAND-IN. This used to build a hand-written
 * `{ add(){}, length }` literal, which is the very §C13-SCENE-ID-KEY mistake this
 * file's header warns about: a stub `traverse`-less object proves only that the
 * STUB has no `traverse`. `cesium` is a ROOT dependency (`package.json:251`) but is
 * NOT declared by `@pryzm/core-app-model`, so under pnpm's strict layout it may or
 * may not resolve from inside this package. Hence a GUARDED dynamic import.
 *
 * §CONTEXT-DATA-HONESTY — the two outcomes are DIFFERENT VALUES, never one.
 * Resolved ⇒ PROVEN against the real class. Unresolvable ⇒ **UNPROVEN**, said out
 * loud. It is never reported as "clean", and the test still asserts that the audit
 * DECLARES the graph as untraversed either way — because that declaration is the
 * mitigation, and it must hold whether or not this environment can load Cesium.
 */
interface CesiumPrimitives { add(p: unknown): unknown; length: number }

/**
 * Deliberately NOT a discriminated union. This package's tsconfig does not enable
 * `strictNullChecks`, and without it TypeScript does not narrow a union by its
 * literal discriminant — a `{real:true,…}|{real:false,reason}` shape therefore fails
 * to compile on the `.reason` access even though the control flow is obviously
 * correct. Two independent nullable fields need no narrowing at all.
 */
async function loadRealCesiumPrimitiveCollection(): Promise<{
    primitives: CesiumPrimitives | null;
    reason: string | null;
}> {
    try {
        const C = (await import('cesium')) as unknown as {
            PrimitiveCollection?: new () => CesiumPrimitives;
        };
        if (typeof C?.PrimitiveCollection !== 'function') {
            return { primitives: null, reason: 'cesium resolved but exposes no PrimitiveCollection' };
        }
        return { primitives: new C.PrimitiveCollection(), reason: null };
    } catch (e) {
        return { primitives: null, reason: (e as Error).message.split('\n')[0] || 'import failed' };
    }
}

// ── Harness ───────────────────────────────────────────────────────────────────

/**
 * The THREE channels a class may surface through, in descending order of value:
 *   findings      — the audit named it as a VIOLATION (best: attributed to a project)
 *   unattributed  — the audit named it in the honest FLOOR (acceptable)
 *   inherited     — the audit COUNTED it as "attributed only by an ancestor, never
 *                   checked" (acceptable: it is unattributable by any scene sweep —
 *                   the `views.mountedDrawing` precedent — but it is not silent)
 * A class in NONE of the three has VANISHED. That is the bug.
 */
interface ClassVerdict {
    klass: string;
    inFindings: boolean;
    inUnattributed: boolean;
    inInherited: boolean;
    seen: boolean;
}

/** Run the REAL audit path over a REAL THREE scene containing exactly one class. */
function auditOneClass(
    klass: string,
    inject: (s: THREE.Scene) => void,
    expected: readonly string[] = [],
): ClassVerdict {
    const scene = new THREE.Scene();
    inject(scene);
    const objects: SceneObjectLike[] | null = collectSceneObjects(scene);
    expect(objects, 'the real traversal must produce a real object list').not.toBeNull();

    const coverage = summariseSceneCoverage(objects!);
    const report = detectLeaks({
        // A brand-new project: the expectation is EMPTY unless the class needs a
        // legitimately-owned host, so anything else present is foreign.
        projectId: 'proj-B',
        expectedIds: new Set<string>(expected),
        sceneObjects: objects!,
        storeElements: [],
        globals: [],
    });

    const sceneFindings = (report?.findings ?? []).filter(f => f.surface.startsWith('scene.'));
    const inFindings = sceneFindings.length > 0;
    const inUnattributed = coverage.unattributed.length > 0;
    const inInherited = coverage.inheritedCount > 0;
    return {
        klass, inFindings, inUnattributed, inInherited,
        seen: inFindings || inUnattributed || inInherited,
    };
}

// NOTE the parenthesised optional element. `readonly string[]?` is a SYNTAX error
// (TS1354/TS17019) — vitest transpiles without typechecking, so this file ran green
// while `tsc` rejected it, and the parse failure cascaded into bogus errors further
// down. Type errors in a test are not cosmetic: this tuple is what decides which
// fixtures get a legitimately-owned host id.
const CLASSES: ReadonlyArray<[string, (s: THREE.Scene) => void, (readonly string[])?]> = [
    ['label sprite (root, RoomLabelRenderer)', injectLabelSprite],
    ['label sprite (nested, BimGridRenderer)', injectNestedLabelSprite],
    ['unstamped fallback box', injectUnstampedFallbackBox],
    ['generated / massing group', injectMassingGroup],
    ['coalesced instanced root (unkeyed)', injectCoalescedInstancedRoot],
    ['coalesced root, FOREIGN levelId in key', injectCoalescedRootWithForeignLevel],
    ['root with id but NO type', injectIdWithoutType],
    ['foreign subtree under an owned root', injectForeignSubtreeUnderOwnedRoot, ['wall-EXPECTED']],
];

describe('§C13-AUDIT-BLIND-CLASSES — injection experiment over a REAL THREE scene', () => {
    it('prints the per-class verdict table', () => {
        const rows = CLASSES.map(([k, inject, exp]) => auditOneClass(k, inject, exp));
        const table = rows
            .map(r =>
                `  ${r.klass.padEnd(42)} | findings: ${r.inFindings ? 'YES' : 'no '}` +
                ` | unattributed: ${r.inUnattributed ? 'YES' : 'no '}` +
                ` | inherited-count: ${r.inInherited ? 'YES' : 'no '}` +
                ` | SEEN AT ALL: ${r.seen ? 'YES' : '*** NO — VANISHED ***'}`,
            )
            .join('\n');
        console.log(`\n§C13 INJECTION EXPERIMENT — one class per real THREE.Scene\n${table}\n`);
        expect(rows.length).toBe(CLASSES.length);

        // §C13-AUDIT-BLIND-CLASSES — the whole point. NO class injected into the
        // audited THREE scene may vanish. Landing in `findings[]` is best; landing
        // in the UNATTRIBUTED floor is acceptable and honest; landing in neither is
        // the Class-E false clean this suite exists to prevent from returning.
        const vanished = rows.filter(r => !r.seen).map(r => r.klass);
        expect(vanished, 'these classes produce NO signal at all').toEqual([]);
    });

    it('a coalesced instanced root with a FOREIGN levelId is a real ATTRIBUTION, not just a floor entry', () => {
        // InstancedMeshCoalescer stamps `${levelId}:${geoUUID}:${matUUID}` on the merged
        // root, and levels are in the loader expectation (§L-711). This is the one blind
        // class of the five that closes with an attribution rather than a bigger floor.
        const scene = new THREE.Scene();
        injectCoalescedRootWithForeignLevel(scene);
        const report = detectLeaks({
            projectId: 'proj-B',
            expectedIds: new Set<string>(['level-OF-PROJECT-B']),
            sceneObjects: collectSceneObjects(scene)!,
            storeElements: [],
            globals: [],
        });
        const f = report!.findings.find(x => x.surface === 'scene.foreignCoalescedRoot')!;
        expect(f.count).toBe(1);
        expect(f.identities![0]).toContain('level-FROM-PROJECT-A');
    });

    it('a coalesced root whose level IS expected is clean — zero false positives', () => {
        const scene = new THREE.Scene();
        injectCoalescedRootWithForeignLevel(scene);
        const report = detectLeaks({
            projectId: 'proj-B',
            expectedIds: new Set<string>(['level-FROM-PROJECT-A']),
            sceneObjects: collectSceneObjects(scene)!,
            storeElements: [],
            globals: [],
        });
        expect((report?.findings ?? []).some(f => f.surface === 'scene.foreignCoalescedRoot')).toBe(false);
    });

    it('the UNATTRIBUTED floor + the excluded-graph declaration print on BOTH paths', () => {
        // CLEAN path: nothing foreign, but the limitation still has to be stated.
        const cleanScene = new THREE.Scene();
        const owned = new THREE.Group();
        owned.userData = { id: 'wall-EXPECTED', elementType: 'wall' };
        cleanScene.add(owned);
        const cleanCov = summariseSceneCoverage(collectSceneObjects(cleanScene)!);
        const cleanLine = formatSceneCoverage(cleanCov);
        expect(detectLeaks({
            projectId: 'proj-B', expectedIds: new Set(['wall-EXPECTED']),
            sceneObjects: collectSceneObjects(cleanScene)!, storeElements: [], globals: [],
        })).toBeNull();
        expect(cleanLine).toContain('ONE scene graph (window.scene)');
        expect(cleanLine).toContain('cesium viewer.scene.primitives');

        // VIOLATION path: same clause, verbatim.
        const dirtyScene = new THREE.Scene();
        injectMassingGroup(dirtyScene);
        injectNestedLabelSprite(dirtyScene);
        const dirtyCov = summariseSceneCoverage(collectSceneObjects(dirtyScene)!);
        const dirtyLine = formatSceneCoverage(dirtyCov);
        expect(detectLeaks({
            projectId: 'proj-B', expectedIds: new Set<string>(),
            sceneObjects: collectSceneObjects(dirtyScene)!, storeElements: [], globals: [],
        })).not.toBeNull();
        expect(dirtyLine).toContain('UNATTRIBUTED');
        expect(dirtyLine).toContain('ONE scene graph (window.scene)');
        expect(dirtyLine).toContain('cesium viewer.scene.primitives');

        console.log(
            `\n§C13 BOTH-PATHS PROOF\n  CLEAN     : ${cleanLine}\n  VIOLATION : ${dirtyLine}\n`,
        );
    });

    it('SECOND SCENE GRAPHS (cesium primitives, auxiliary THREE scenes) are outside every surface', async () => {
        const scene = new THREE.Scene();
        const aux = makeAuxiliaryScene();

        // The audited graph is empty; both leaks are real and live elsewhere entirely.
        const objects = collectSceneObjects(scene);
        const coverage = summariseSceneCoverage(objects!);
        expect(collectSceneObjects(aux)!.length).toBe(2);
        expect(coverage.rootCount).toBe(0);
        expect(coverage.unattributed).toEqual([]);

        // ── CESIUM: the real class if this environment can load it ────────────
        const cesium = await loadRealCesiumPrimitiveCollection();
        const prims = cesium.primitives;
        let cesiumVerdict: string;
        if (prims) {
            prims.add({ owningProject: 'proj-A', kind: 'Cesium3DTileset' });
            expect(prims.length).toBe(1);
            // THE structural fact the whole exclusion rests on: a real Cesium
            // PrimitiveCollection exposes no `traverse`, so the audit's collector
            // cannot walk it — and, per §CONTEXT-DATA-HONESTY, returns null (there
            // was no graph) rather than [] (the graph was empty).
            expect(
                (prims as unknown as { traverse?: unknown }).traverse,
                'if Cesium ever grows traverse(), this exclusion must be re-argued',
            ).toBeUndefined();
            expect(collectSceneObjects(prims)).toBeNull();
            cesiumVerdict =
                'PROVEN against REAL cesium.PrimitiveCollection — no traverse(), collector returns null';
        } else {
            cesiumVerdict = `*** UNPROVEN — real cesium not loadable here: ${cesium.reason} ***`;
        }

        // Holds on BOTH branches: whether or not Cesium loaded, the audit must still
        // DECLARE the graph as one it cannot reach. That declaration is the mitigation.
        expect(formatSceneCoverage(coverage)).toContain('cesium viewer.scene.primitives');

        console.log(
            `\n§C13 INJECTION EXPERIMENT — graphs the audit never traverses\n` +
            `  cesium primitives (REAL class)             | findings: no  | unattributed: no ` +
            ` | SEEN AT ALL: *** NO — SECOND SCENE GRAPH ***\n` +
            `      └─ ${cesiumVerdict}\n` +
            `  aux THREE.Scene (carousel GLB-404 box)     | findings: no  | unattributed: no ` +
            ` | SEEN AT ALL: *** NO — SECOND SCENE GRAPH ***\n` +
            `  coverage line said: "${formatSceneCoverage(coverage)}"\n`,
        );
    // Cesium is a very large module: importing the REAL `PrimitiveCollection` measured
    // ~67 s on this machine, against vitest's 10 s default. The timeout is raised for
    // the IMPORT, not for any assertion — the alternative was keeping the hand-written
    // `{ add(), length }` stub, which proves only that the stub lacks `traverse()`.
    }, 180_000);
});
