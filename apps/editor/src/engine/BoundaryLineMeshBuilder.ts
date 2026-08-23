/**
 * BoundaryLineMeshBuilder — the construction / setting-out BOUNDARY LINE, in 3-D.
 *
 * §FIX-POOL-AND-BOUNDARY-LINE-INVISIBLE (L-9944..L-9946) · C106 · C100 §5 · L-9305.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ WHY THIS FILE EXISTS: `boundaryLineSolid()` HAD ZERO PRODUCTION CALLERS.
 * ═══════════════════════════════════════════════════════════════════════════════
 * AUDIT-B §2.5, re-measured by lane MIRROR3 on 2026-08-23:
 *
 *     grep -rn "boundaryLineSolid" --include=*.ts packages plugins apps | grep -v test
 *       -> its own `export`, one barrel re-export, and TWO COMMENTS ABOUT ITS DEADNESS.
 *          Zero calls.
 *
 * The extruder was written, tested, exported — and never invoked. So the founder's
 * boundary line was broken on three axes at once: no bridge case (nothing relayed
 * the command), no builder call (nothing could have drawn it if something had), and
 * no serializer field (the record dies on save). This file closes the middle one.
 * `CommandEventBridge`'s `case 'boundaryLine.create'` closes the first. The third is
 * NOT closed here and is named as open at the bottom of this comment.
 *
 * ─── WHY IT LIVES IN apps/editor AND NOT IN @pryzm/geometry-boundary-line ──────
 * `LiftCompoundMeshBuilder` sits inside `@pryzm/geometry-lift`, and that would be the
 * tidier home. It is not used here for one measured reason: `geometry-boundary-line`
 * declares three dependencies (`@opentelemetry/api`, `@pryzm/schemas`, `zod`) and
 * would need `@pryzm/renderer-three` and `@pryzm/core-app-model` added to draw
 * anything. A `workspace:*` addition rewrites `pnpm-lock.yaml`, and this tree is
 * shared with other lanes mid-flight — `[[agent-packagejson-breaks-frozen-lockfile]]`
 * is the standing receipt for what that costs. `apps/editor` already depends on both
 * (82 files under `apps/editor/src` import `@pryzm/renderer-three/three`), so the
 * builder lands here and the PURE geometry stays where it was. If a later lane moves
 * it down, the move is a file relocation plus two manifest lines — nothing in this
 * file knows where it lives.
 *
 * ─── P2 (single THREE owner) ──────────────────────────────────────────────────
 * THREE arrives via `@pryzm/renderer-three/three`, exactly as `LiftCompoundMeshBuilder`
 * and every other builder take it. No raw `import * as THREE from 'three'`.
 *
 * ─── WHAT IT DRAWS ────────────────────────────────────────────────────────────
 * TWO representations, and WHICH ONE is not this file's decision:
 *
 *   SOLID     — `boundaryLineSolid()` returns one footprint ring + baseY/topY per
 *               SEGMENT. Each becomes one extruded prism. Nothing here computes a
 *               dimension: every extent comes off `resolveBoundaryLineDimensions()`,
 *               the ONE resolver (record → systemType → documented default), so a
 *               line whose height came from its system type and one whose height was
 *               authored are drawn by the same code from the same numbers.
 *   LINEWORK  — a polyline through the vertices at the resolved base elevation. This
 *               is what a setting-out line IS most of the time, and drawing nothing
 *               for it would reproduce the exact defect this file closes: a record
 *               that commits and cannot be seen.
 *
 * `resolveBoundaryLineSolidity(line)` picks between them. ⚠ It takes an optional
 * VIEW INTENT argument (C09 / P7) which this call site does NOT pass, and that is
 * stated rather than hidden: per-view "solid here, linework there" is a real feature
 * of the resolver that nothing in the 3-D scene wires yet. Passing `undefined` means
 * *"this view has no opinion, ask the record"*, which is the resolver's documented
 * `source: 'record'` branch — not a default, an answer.
 *
 * ─── ⛔ C100 §5 — A SOLID THAT CANNOT NAME ITS MATERIAL IS NOT PAINTED A GUESS ──
 * `resolveBoundaryLineMaterial` has three answers and all three are handled:
 *   · `linework`   — no material, by intent. Styled with the construction-line pen.
 *   · `resolved`   — the MASTER's colour, through `resolveMaterialColour` (the same
 *                    ladder `BeamFragmentBuilder` and `LiftCompoundMeshBuilder` use).
 *   · `unresolved` — ⛔ the solid is NOT drawn in a believable grey. The line is drawn
 *                    as LINEWORK and the refusal is returned to the caller BY NAME.
 *                    `HandrailFragmentBuilder` ships every balcony with *"3 handrails
 *                    have NO RESOLVABLE MATERIAL"* and paints them anyway; that is the
 *                    behaviour this refuses to copy.
 *
 * ─── ⚠ WHAT THIS DOES **NOT** DO — named, not implied ─────────────────────────
 *  · PERSISTENCE. `grep -c boundaryLine ProjectSerializer.ts` → **0**, both copies.
 *    The line renders and still does not survive a reload. `ProjectSerializer.ts` is
 *    owned by another lane this session (journal format change), so the field is
 *    REQUESTED there rather than written here. L-9947.
 *  · PLAN VIEW. The subscriber registers the element with `viewDependencyTracker` and
 *    `bimManager` so the plan pipeline knows the id and its storey, but there is no
 *    plan SYMBOL builder for this family. A boundary line is 3-D-visible and
 *    plan-invisible until one exists. L-9948.
 *  · SELECTION / SNAPPING. Nothing registers these meshes with the picker.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { resolveMaterialColour } from '@pryzm/core-app-model';
import {
    boundaryLineSolid,
    resolveBoundaryLineDimensions,
    resolveBoundaryLineMaterial,
    resolveBoundaryLineSolidity,
    type BoundaryLineData,
} from '@pryzm/geometry-boundary-line';

/**
 * Everything the builder needs about ONE boundary line.
 *
 * Structurally a subset of `BoundaryLineData`, declared locally so a caller can hand
 * it a plain event payload without the Zod schema at runtime — the same move
 * `LiftCompoundRenderInput` makes, for the same reason.
 */
export type BoundaryLineRenderInput = Pick<
    BoundaryLineData,
    'id' | 'levelId' | 'vertices' | 'closed' | 'hasVolume'
> & Partial<Pick<
    BoundaryLineData,
    'height' | 'thickness' | 'baseOffset' | 'systemTypeId' | 'materialId' | 'materialColor' | 'name'
>>;

/**
 * ⛔ THE ONLY COLOUR CONSTANT IN THIS FILE THAT IS NOT AN ERROR STATE, AND IT IS A
 * PEN, NOT A MATERIAL.
 *
 * C100 governs what a SURFACE is made of. Linework has no surface — `resolveBoundaryLineMaterial`
 * returns `{kind:'linework'}` and its header says in as many words that linework is
 * styled by the visibility intent's pen (C09), *"a different authority from a material
 * and must not be collapsed into one"*. The C09 pen is not wired to this scene, so the
 * value below stands in for it, is named as standing in for it, and is NOT read from
 * or written to any material field. When C09's pen reaches the 3-D view this constant
 * is what it replaces.
 *
 * The hue is the PRYZM construction purple (`#6600FF`, `PreviewStyle.ts` / Contract
 * §41) because a setting-out line is drafting apparatus, not building fabric, and it
 * must not be mistakable for a wall at a glance.
 */
const BOUNDARY_LINE_PEN_HEX = '#6600ff';

/**
 * C100 §5 — a solid naming a material that resolves to NOTHING is visibly wrong ON
 * PURPOSE. Unreachable through the create path (`CreateBoundaryLineHandler.canExecute`
 * refuses an unresolved solid at the door), and kept because `boundaryLine.update` can
 * switch `hasVolume` on afterwards, and because a builder that trusts its caller's
 * validation is a builder that paints whatever arrives.
 */
const BOUNDARY_LINE_UNRESOLVED_MATERIAL_HEX = '#ff00ff';

/** What `updateBoundaryLine` did, as a value the caller can log or assert on. */
export type BoundaryLineRenderOutcome =
    | { readonly drew: 'solid'; readonly id: string; readonly slices: number; readonly hex: string }
    | { readonly drew: 'linework'; readonly id: string; readonly points: number }
    | {
        /** ⛔ Volume was asked for and could not be painted honestly. The LINEWORK was
         *  drawn instead — the record stays visible — and `reason` is the resolver's
         *  own sentence, not a paraphrase. */
        readonly drew: 'linework-material-refused';
        readonly id: string;
        readonly points: number;
        readonly reason: string;
    }
    | { readonly drew: 'nothing'; readonly id: string; readonly reason: string };

/**
 * ⭐ SHARED MATERIALS, KEYED BY COLOUR — the `LiftCompoundMeshBuilder` rule, and it is
 * load-bearing rather than tidy: `InstancedElementRenderer`'s group key ends in
 * `materialUuid`, and `[[webgpu-heavy-scene-crash-and-instancing]]` records instancing
 * in this repo being defeated once already by per-element unique materials.
 *
 * ⚠ CONSEQUENCE: `removeBoundaryLine` does NOT dispose materials — they are shared
 * across every line in the scene, and disposing one would black out the others until a
 * full rebuild (the §BEAM-AUDIT-2026-C3 defect). Geometries ARE per-line and ARE
 * disposed.
 */
const _sharedSolidMaterials = new Map<string, THREE.MeshStandardMaterial>();
const _sharedPenMaterials = new Map<string, THREE.LineBasicMaterial>();

function solidMaterialFor(hex: string): THREE.MeshStandardMaterial {
    let m = _sharedSolidMaterials.get(hex);
    if (!m) {
        m = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.85, metalness: 0.0 });
        _sharedSolidMaterials.set(hex, m);
    }
    return m;
}

function penMaterialFor(hex: string): THREE.LineBasicMaterial {
    let m = _sharedPenMaterials.get(hex);
    if (!m) {
        m = new THREE.LineBasicMaterial({ color: new THREE.Color(hex) });
        _sharedPenMaterials.set(hex, m);
    }
    return m;
}

export class BoundaryLineMeshBuilder {
    private readonly _scene: THREE.Object3D;
    private readonly _groups = new Map<string, THREE.Group>();

    constructor(scene: THREE.Object3D) {
        this._scene = scene;
    }

    /**
     * Draw (or REDRAW) one boundary line. Idempotent by id: the previous group is
     * disposed first, so a create followed by ten updates leaves ONE group in the
     * scene and ten disposed geometries — not eleven groups, which is how a
     * `.updated` mirror silently becomes a memory leak with a z-fighting symptom.
     *
     * `levelElevation` is the storey datum in world metres, resolved by the CALLER
     * from `bimManager`. It is NOT looked up here: a builder that can reach for an
     * elevation can reach for the wrong one, and a silent `?? 0` files every line on
     * the ground floor (§DIAG-WALL-LEVEL, and `elementLevelChangedMirror`'s
     * `_elevationOf` exists for exactly this reason).
     */
    updateBoundaryLine(line: BoundaryLineRenderInput, levelElevation = 0): BoundaryLineRenderOutcome {
        this.removeBoundaryLine(line.id);

        const verts = line.vertices ?? [];
        if (verts.length < 2) {
            return {
                drew: 'nothing',
                id: line.id,
                reason: `boundary line '${line.id}' has ${verts.length} vertex/vertices — a line needs at least 2`,
            };
        }

        const dims = resolveBoundaryLineDimensions(line);
        const solidity = resolveBoundaryLineSolidity(line);
        const material = resolveBoundaryLineMaterial(line);

        const group = new THREE.Group();
        group.name = `boundary-line:${line.id}`;
        group.userData['elementId'] = line.id;
        group.userData['elementType'] = 'boundaryLine';
        group.userData['levelId'] = line.levelId;

        // ── SOLID ────────────────────────────────────────────────────────────
        if (solidity.solid && material.kind === 'resolved') {
            const colour = resolveMaterialColour(material.materialId, material.materialColor);
            const hex = colour.state === 'unresolved' ? BOUNDARY_LINE_UNRESOLVED_MATERIAL_HEX : colour.hex;
            const slices = boundaryLineSolid(line as BoundaryLineData, dims, levelElevation);
            for (const slice of slices) {
                const mesh = this._prism(slice.footprint, slice.baseY, slice.topY, hex);
                if (!mesh) continue;
                mesh.userData['elementId'] = line.id;
                mesh.userData['segmentIndex'] = slice.segmentIndex;
                mesh.userData['materialId'] = material.materialId;
                group.add(mesh);
            }
            if (group.children.length > 0) {
                this._scene.add(group);
                this._groups.set(line.id, group);
                return { drew: 'solid', id: line.id, slices: group.children.length, hex };
            }
            // Every segment was degenerate. Fall through to linework rather than
            // adding an empty group — an empty group in the scene is a record that
            // claims to render and does not.
        }

        // ── LINEWORK (and the C100 refusal path) ─────────────────────────────
        const baseY = levelElevation + dims.baseOffset;
        const points: THREE.Vector3[] = verts.map((v) => new THREE.Vector3(v.x, baseY, v.z));
        if (line.closed && points.length > 2) points.push(points[0]!.clone());
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const polyline = new THREE.Line(geometry, penMaterialFor(BOUNDARY_LINE_PEN_HEX));
        polyline.userData['elementId'] = line.id;
        polyline.userData['representation'] = 'linework';
        group.add(polyline);
        this._scene.add(group);
        this._groups.set(line.id, group);

        if (solidity.solid && material.kind === 'unresolved') {
            return {
                drew: 'linework-material-refused',
                id: line.id,
                points: points.length,
                reason: material.reason,
            };
        }
        return { drew: 'linework', id: line.id, points: points.length };
    }

    /** Remove one line's group and dispose its geometries. Returns whether there was
     *  anything to remove — so a caller can tell "gone" from "was never here", which
     *  are different facts (§context-data-honesty). */
    removeBoundaryLine(id: string): boolean {
        const group = this._groups.get(id);
        if (!group) return false;
        this._disposeGroup(group);
        this._groups.delete(id);
        return true;
    }

    /** The group currently in the scene for `id`, for tests and for a picker that
     *  later wants to register these. `undefined` when nothing is drawn. */
    getGroup(id: string): THREE.Group | undefined {
        return this._groups.get(id);
    }

    /** Every id currently drawn. */
    ids(): readonly string[] {
        return [...this._groups.keys()];
    }

    /** Tear down every line this builder owns. Materials are SHARED and deliberately
     *  survive — see the note on `_sharedSolidMaterials`. */
    dispose(): void {
        for (const group of this._groups.values()) this._disposeGroup(group);
        this._groups.clear();
    }

    private _disposeGroup(group: THREE.Group): void {
        group.removeFromParent();
        group.traverse((o) => {
            const withGeo = o as unknown as { geometry?: { dispose?: () => void } };
            withGeo.geometry?.dispose?.();
        });
        group.clear();
    }

    /**
     * One extruded prism from one footprint ring.
     *
     * ⚠ THE SIGN ON `z` IS LOAD-BEARING AND IS THE ONE THING A READER SHOULD CHECK.
     * `ExtrudeGeometry` extrudes a 2-D shape along +Z; `rotateX(-π/2)` — the
     * convention every builder in this repo uses (`ArchitectureFragments.ts:88`,
     * `InfiniteGrid3D.ts:19`) — maps `(x, y, z) → (x, z, -y)`. So a shape point
     * written as `(px, pz)` would land at world `-pz`, mirroring the footprint about
     * the X axis. Writing it as `(px, -pz)` puts it back. Getting this wrong draws a
     * boundary line that is the right shape in the wrong place, which is the hardest
     * kind of wrong to notice.
     */
    private _prism(
        footprint: readonly { readonly x: number; readonly z: number }[],
        baseY: number,
        topY: number,
        hex: string,
    ): THREE.Mesh | null {
        const height = topY - baseY;
        if (!(height > 0) || footprint.length < 3) return null;

        const shape = new THREE.Shape();
        shape.moveTo(footprint[0]!.x, -footprint[0]!.z);
        for (let i = 1; i < footprint.length; i++) shape.lineTo(footprint[i]!.x, -footprint[i]!.z);
        shape.closePath();

        const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
        geometry.rotateX(-Math.PI / 2);
        geometry.translate(0, baseY, 0);
        geometry.computeVertexNormals();
        return new THREE.Mesh(geometry, solidMaterialFor(hex));
    }
}
