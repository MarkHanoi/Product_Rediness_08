// LiftCompoundMeshBuilder — the LOD-300 lift's CABIN, FRAME and GUIDE RAILS, in 3-D.
//
// §FEAT-LIFT-OBSERVATION-FRAME (L-9400..L-9406) · C104 §13 · C100 §6.1 · C84 EI-9.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ WHY THIS CLASS EXISTS AT ALL, AND WHY IT IS NOT `LiftMeshBuilder`.
// ═══════════════════════════════════════════════════════════════════════════════
// The founder's console named three members that reached no renderer. Two of them
// turned out to have live channels nobody had connected — the glass sides
// (`curtain-wall.created`, hyphenated, declared and mirrored since §P3.1-CW) and
// the landing doors (`wall.opening.created`, the §P2.3 mirror that punches the hole
// AND writes the `DoorStore` record). Those two were WIRING.
//
// The cabin was the third, and its diagnosis was right: *"no legacy family and no
// fragment builder"*. There is nothing to connect. This file is the thing that was
// missing, and it now also carries the frame and the rails the reference render is
// mostly made of.
//
// ⛔ IT IS DELIBERATELY NOT `LiftMeshBuilder`, AND THE TEMPTATION TO MERGE THEM IS
// THE EXACT TRAP C104 §13.1 RECORDS. `LiftMeshBuilder` is real, is constructed
// (`initBuilders.ts`), and draws two placeholder boxes for the **LOD-200 MASSING**
// lift out of `LiftStore`. `lift.create` writes `LiftCompoundStore`. Feeding the
// compound into the massing store to reuse that builder is the corruption UNDO37
// refused for undo (L-7311) with a renderer attached, and it is forbidden by
// C104 R-8. Two elements, two stores, two builders.
//
// ── WHAT IT DRAWS, AND WHERE THE NUMBERS COME FROM ───────────────────────────
// Nothing in this file decides a dimension. Every extent arrives on a `LiftPart`
// record that `buildLiftAssembly` produced through `resolveLiftDimensions()`
// (C104 §3 / R-6: the resolver is the ONLY place a lift dimension is resolved, and
// no mesh may carry a lift dimensional constant of its own). There is not one
// dimensional literal below — the only numbers are unit conversions and epsilons.
//
// TWO GEOMETRIES, ONE FAMILY, discriminated by `isLinearLiftPart` (the presence of
// `axis`), never by `kind`:
//
//   LINEAR   (`axis` present)  — corner columns, storey ring beams, top-bay braces,
//                                guide rails. A box of section `width` x `depth`
//                                swept from `axis.start` to `axis.end` in SHAFT-
//                                LOCAL space. Diagonals work because the placement
//                                is a segment, not an offset.
//   CAR-LOCAL (`axis` absent)  — the five cabin parts. A box of `width` x `height`
//                                x `depth` sitting `offsetY` above the car floor's
//                                top face, which parks at `carParkOffsetY`.
//
// Both are children of ONE group placed at `lift.origin` and rotated by
// `lift.rotation`, so "move the lift" moves one transform and every part follows —
// the invariant `LiftPartTypes.ts` header point 3 is built on, kept.
//
// ── MATERIALS ────────────────────────────────────────────────────────────────
// ⭐ C100 §6.1 / §9.6.a. Colours are resolved through `resolveMaterialColour` — THE
// authority, the same ladder `BeamFragmentBuilder`, `HandrailFragmentBuilder`,
// `resolveDoorFinishColour` and `resolveWindowFrameColour` call. A part naming
// `steel-painted-red-oxide` gets the master's #8f3328; edit the master row and
// every lift frame in every project follows. A part naming a material that resolves
// to NOTHING is painted magenta and says so — C100 §5, never a believable grey,
// because "your material was deleted" must not render as "this is steel".
//
// ── P2 (single THREE owner) ──────────────────────────────────────────────────
// THREE arrives via `@pryzm/renderer-three/three`, exactly as `LiftMeshBuilder` and
// `StairMeshBuilder` take it. No raw `import * as THREE from 'three'` anywhere.
//
// ── ⚠ THE GLASS IS NOT DRAWN HERE, AND THAT IS ON PURPOSE ────────────────────
// The glazed enclosure is a real `CurtainWall` record rendered by the curtain-wall
// builder through the §P3.1-CW mirror. Drawing a second, transparent shell here
// would put TWO producers of the same surface in the scene — z-fighting, doubled
// transmission cost on a WebGL backend, and one id meaning two objects (C84 EI-9).
// If the glass is missing, the bug is in the mirror, not here.

import * as THREE from '@pryzm/renderer-three/three';
import { scheduleGpuRelease } from '@pryzm/renderer-three';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { resolveMaterialColour } from '@pryzm/core-app-model';
import { isLinearLiftPart, type LiftPart } from './LiftPartTypes.js';

/**
 * Everything the builder needs about ONE lift. Structurally a subset of
 * `LiftCompound` + its `liftPart` members, declared locally so this module does not
 * need the Zod schema at runtime and so a caller can hand it a plain event payload.
 */
export interface LiftCompoundRenderInput {
    readonly id: string;
    readonly levelId: string;
    readonly origin: { readonly x: number; readonly y: number; readonly z: number };
    readonly rotation: number;
    readonly enclosureType?: string;
    /** Car floor top face when parked, relative to the level datum. */
    readonly carParkOffsetY: number;
    readonly parts: readonly LiftPart[];
    readonly mark?: string;
}

/**
 * ⛔ THE ONLY COLOUR CONSTANT IN THIS FILE, AND IT IS AN ERROR STATE.
 *
 * C100 §5: a part naming a material that resolves to nothing is painted visibly
 * wrong ON PURPOSE. The same magenta every S16/S17 family uses. A "sensible"
 * structural grey here would render a deleted material as a design decision.
 */
const LIFT_UNRESOLVED_MATERIAL_COLOR = '#ff00ff';

/**
 * ⭐ SHARED MATERIALS, KEYED BY COLOUR — not per part, and the "per colour" is
 * load-bearing rather than tidy.
 *
 * `InstancedElementRenderer`'s group key ends in `materialUuid`
 * (`[[webgpu-heavy-scene-crash-and-instancing]]`: instancing in this repo has
 * already been defeated once by per-element unique materials). A four-storey
 * observation lift is ~32 frame members plus 5 cabin parts; a fresh
 * `MeshStandardMaterial` per part would be 37 size-1 instance groups per lift, and
 * a lobby with six lifts would be 222. Keying on (colour, metalness, roughness)
 * makes the count track COLOURS — four, for the whole family.
 *
 * ⚠ CONSEQUENCE, AND IT IS WHY `removeLift` DOES NOT DISPOSE MATERIALS: these are
 * shared across every lift in the scene. Disposing one on removal would black out
 * every other lift's frame until a full scene rebuild — the §BEAM-AUDIT-2026-C3
 * defect, which is recorded in `BeamFragmentBuilder` for exactly this reason.
 * Geometries ARE per-part and ARE disposed.
 */
const _sharedMaterials = new Map<string, THREE.MeshStandardMaterial>();

function sharedMaterial(
    color: string,
    metalness: number,
    roughness: number,
): THREE.MeshStandardMaterial {
    const key = `${color}|${metalness}|${roughness}`;
    let mat = _sharedMaterials.get(key);
    if (!mat) {
        mat = new THREE.MeshStandardMaterial({ color, metalness, roughness });
        _sharedMaterials.set(key, mat);
    }
    return mat;
}

/**
 * Surface finish per part kind. ⛔ NOT a colour — the colour comes from the master
 * row through `resolveMaterialColour`. These two numbers are how SHINY the part is,
 * which the master catalogue also carries but which `resolveMaterialColour`
 * deliberately does not return (its contract is a colour and an origin).
 *
 * Painted steel is matte; machined rail steel and a stainless car lining are not.
 */
function finishFor(kind: LiftPart['kind']): { metalness: number; roughness: number } {
    switch (kind) {
        case 'frame-column':
        case 'frame-ring-beam':
        case 'frame-brace':
            // Red oxide primer is PAINT on steel: low metalness, high roughness.
            return { metalness: 0.1, roughness: 0.74 };
        case 'guide-rail':
            return { metalness: 0.8, roughness: 0.4 };
        case 'cabin-floor':
            return { metalness: 0.35, roughness: 0.55 };
        default:
            return { metalness: 0.85, roughness: 0.3 };
    }
}

/** Resolve a part's material through THE ladder (C100 §9.6.a). Never a private chain. */
function materialFor(part: LiftPart): THREE.MeshStandardMaterial {
    const { metalness, roughness } = finishFor(part.kind);
    const r = resolveMaterialColour(part.materialId, undefined);
    if (r.state === 'unresolved') {
        return sharedMaterial(LIFT_UNRESOLVED_MATERIAL_COLOR, metalness, roughness);
    }
    return sharedMaterial(r.hex, metalness, roughness);
}

/** Reused scratch vectors — a builder that allocates per member is a builder that GCs per frame. */
const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();

export class LiftCompoundMeshBuilder {
    private readonly roots = new Map<string, THREE.Group>();
    private scene?: THREE.Scene;

    constructor(scene?: THREE.Scene) {
        this.scene = scene;
    }

    setScene(scene: THREE.Scene): void {
        this.scene = scene;
    }

    /**
     * Build (or rebuild) every mesh a lift compound owns.
     *
     * ⚠ REBUILD IS REMOVE-THEN-BUILD, and the `version` counter survives it — the
     * NME proxy-cache keys on it (`LiftMeshBuilder` carries the same counter for the
     * same reason, §57 Day 4). A rebuild that reset it would leave the cache serving
     * the previous geometry.
     */
    updateLift(lift: LiftCompoundRenderInput, isPreview = false): THREE.Group {
        const priorVersion: number =
            (this.roots.get(lift.id)?.userData?.version as number | undefined) ?? 0;
        this.removeLift(lift.id);

        const rootUserData = {
            id: lift.id,
            elementId: lift.id,
            elementType: 'Lift',
            type: 'lift',
            modelId: 'model-default',
            selectable: !isPreview,
            levelId: lift.levelId,
            enclosureType: lift.enclosureType,
            mark: lift.mark,
            version: priorVersion + 1,
            ifcData: { guid: lift.id, ifcClass: 'IfcTransportElement' },
        };

        const group = new THREE.Group();
        group.name = `liftCompound-${lift.id}`;
        group.userData = { ...rootUserData };

        for (const part of lift.parts) {
            const mesh = this._buildPart(part, lift, rootUserData, isPreview);
            if (mesh) group.add(mesh);
        }

        // ONE transform for the whole compound. `axis` and `offsetY` are shaft- and
        // car-local precisely so this line is the only place world placement happens.
        group.position.set(lift.origin.x, lift.origin.y, lift.origin.z);
        group.rotation.y = lift.rotation;

        this.roots.set(lift.id, group);
        if (!isPreview) elementRegistry.registerRoot(lift.id, group);
        if (this.scene) this.scene.add(group);
        return group;
    }

    /**
     * ONE part -> ONE mesh, or `null` if it is degenerate.
     *
     * ⚠ C15 §12 (selectable root, non-selectable children): every child carries
     * `selectable: false` so a pick resolves to the LIFT, not to a brace. Drilling
     * into a member is Tab's job (C104 §2), and Tab publishes BY ID — it does not
     * need the mesh to be independently pickable.
     */
    private _buildPart(
        part: LiftPart,
        lift: LiftCompoundRenderInput,
        rootUserData: Record<string, unknown>,
        isPreview: boolean,
    ): THREE.Mesh | null {
        if (!(part.width > 0) || !(part.depth > 0) || !(part.height > 0)) return null;

        const material = materialFor(part);
        let geometry: THREE.BoxGeometry;
        const mesh = new THREE.Mesh();

        if (isLinearLiftPart(part)) {
            // ── LINEAR MEMBER — a section swept along `axis`. ──────────────────
            // Built along +Y at the origin and then ROTATED onto the axis, because
            // that is the one construction that handles a diagonal brace and a
            // vertical column with the same three lines. A per-orientation branch is
            // how a builder ends up drawing three of the four cases correctly.
            _v0.set(part.axis.start.x, part.axis.start.y, part.axis.start.z);
            _v1.set(part.axis.end.x, part.axis.end.y, part.axis.end.z);
            _dir.subVectors(_v1, _v0);
            const len = _dir.length();
            if (!(len > 1e-6)) return null;
            geometry = new THREE.BoxGeometry(part.width, len, part.depth);
            _dir.normalize();
            _quat.setFromUnitVectors(_up, _dir);
            mesh.quaternion.copy(_quat);
            mesh.position.set(
                (_v0.x + _v1.x) / 2,
                (_v0.y + _v1.y) / 2,
                (_v0.z + _v1.z) / 2,
            );
        } else {
            // ── CAR-LOCAL BOX — a cabin part standing on the parked car floor. ──
            // `offsetY` is the BOTTOM face above the car floor's top face
            // (`LiftPartTypes.ts`), so the box centre is half a height higher, and
            // the whole car sits at `carParkOffsetY` above the level datum.
            geometry = new THREE.BoxGeometry(part.width, part.height, part.depth);
            mesh.position.set(
                0,
                lift.carParkOffsetY + part.offsetY + part.height / 2,
                // The car door hangs on the LANDING face, which is local -Z (the
                // convention `LiftAssembly`'s header states and its corners encode).
                // Every other cabin part is centred.
                part.kind === 'cabin-door' ? -(part.depth / 2) : 0,
            );
        }

        mesh.geometry = geometry;
        mesh.material = material;
        mesh.name = `liftPart-${part.kind}-${part.id}`;
        mesh.castShadow = !isPreview;
        mesh.receiveShadow = !isPreview;
        mesh.userData = {
            ...rootUserData,
            id: part.id,
            elementId: part.id,
            elementType: 'LiftPart',
            type: 'liftPart',
            liftId: lift.id,
            parentId: lift.id,
            kind: part.kind,
            materialId: part.materialId,
            // C15 §12 — the pick resolves to the lift root, never to a part.
            selectable: false,
        };
        return mesh;
    }

    removeLift(liftId: string): void {
        const group = this.roots.get(liftId);
        if (!group) return;
        // §GPU-RESOURCE-LIFETIME L2 / C04 §3.1.2a rule 7 (L-10500) — DETACH now,
        // RELEASE at the frame boundary. This used to free the part geometry inside a
        // `traverse()` on the mutation tick, and only detach afterwards: both halves of
        // ADR-0297 L2 inverted, on a path `clearProjectGeometry()` drives for every
        // lift during the C13 project-switch sweep.
        //
        // ⛔ GEOMETRY ONLY, STILL. The materials are MODULE-SCOPED and SHARED across
        // every lift in the scene (see `_sharedMaterials`); disposing one here would
        // black out every other lift's frame until a full scene rebuild — the
        // §BEAM-AUDIT-2026-C3 defect, avoided by naming it. `disposeMaterials = false`
        // is how that same rule is expressed through the funnel (ADR-0297 L1).
        if (this.scene) this.scene.remove(group);
        group.removeFromParent();
        scheduleGpuRelease(group, false);
        this.roots.delete(liftId);
    }

    getRoot(liftId: string): THREE.Group | undefined {
        return this.roots.get(liftId);
    }

    /** Every lift this builder currently has in the scene. */
    ids(): readonly string[] {
        return Array.from(this.roots.keys());
    }

    /**
     * §C13-BUILDER-SCENE-CLEAR — detach EVERY root without tearing the builder down.
     * `dispose()` is TERMINAL; the C13 project-switch sweep calls this instead
     * (C13 §3.8/§3.10), exactly as `LiftMeshBuilder.clearProjectGeometry` does.
     */
    clearProjectGeometry(): void {
        for (const id of Array.from(this.roots.keys())) this.removeLift(id);
    }

    dispose(): void {
        this.clearProjectGeometry();
    }
}
