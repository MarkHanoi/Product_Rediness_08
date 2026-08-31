/**
 * TreeElevationSymbolBuilder — §TREE135 (L-12180)
 *
 * Injects a drafted 2D elevation/section symbol for every parametric tree
 * (the 25 Arbol T-NN species) into the active TechnicalDrawing, replacing the
 * founder-reported "jumble of overlapping boxy quads with an asterisk-like
 * scribble at the trunk" — the literal projection of the foliage-cluster
 * icosahedra and tapered trunk/branch cylinders `ParametricTreeEngine` builds.
 *
 * Mirrors `PlumbingElevationSymbolBuilder` (`packages/geometry-plumbing/src/
 * PlumbingElevationSymbolBuilder.ts`) — the proven shape for "this family
 * draws a drafted symbol in elevation instead of its true projection": same
 * builder seam (local linework → world transform → toDrawingSpace →
 * addProjectionLines → registerSegmentUUID), same suppress-then-replace
 * mechanism via a mesh `userData` flag (`ParametricTreeEngine._tagForPlanView`
 * now also stamps `skipInElevation` + `skipInSection`).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TWO DELIBERATE DEPARTURES FROM THE PLUMBING PRECEDENT — both DEFENDED here,
 * not silently copied, because copying them without re-deriving would have
 * been "mirror the file", not "mirror the reasoning" (C84 EI-9).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. SECTION, not just elevation. Plumbing's elevation builder explicitly does
 *    NOT run in section ("a section legitimately cuts the fixture" — a toilet
 *    IS a solid the cut plane can slice through and show a poché for).
 *    Vegetation is the opposite case by architectural convention: a tree is
 *    never poché-cut like construction, because it is not a construction
 *    element — a section through a garden draws the trees exactly as the
 *    matching elevation would, at whatever weight the drawing uses for
 *    background planting. So this builder is invoked for BOTH `'elevation'`
 *    AND `'section'` view types (see `EdgeProjectorService`'s injection
 *    site), and `ParametricTreeEngine` stamps a SEPARATE flag —
 *    `skipInSection`, not a reuse of `skipInElevation` — so this decision
 *    cannot silently change plumbing's (or any future family's) opposite one.
 *
 * 2. NO depth-based line-weight variation (no `:beyond` demotion for a tree
 *    standing behind the cut plane vs standing on it). Every other symbol
 *    injector that already runs in elevation/section — this one's own
 *    precedent (`PlumbingElevationSymbolBuilder`) and the authored opening
 *    symbol (`OpeningElevationSymbolBuilder`) — draws its authored linework at
 *    ONE ink weight and does NOT stamp `HiddenLineRemoval.VIEW_DEPTH_KEY` on
 *    it, so none of them participate in the cut/projection/beyond
 *    reclassification `applyOcclusion()` performs on the GENERIC mesh-edge
 *    projection. Depth-varying an authored tree symbol alone would invent a
 *    THIRD rule (mesh-edges: full occlusion pipeline; every existing symbol:
 *    one flat weight; trees: something in between) for no evidenced reader
 *    benefit, and — because the true mesh projection this symbol REPLACES
 *    also carried no such distinction before this lane — it would not even be
 *    fixing a regression. If the founder later asks for a specific "distant
 *    background planting" convention, it is one new decision to make
 *    deliberately, not an incidental side-effect of this fix.
 *
 * Contract compliance mirrors PlumbingElevationSymbolBuilder / TreePlanSymbolBuilder.
 * Called by: EdgeProjectorService.project() for elevation AND section views.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { projectToDrawingSpace, type DrawingSurface } from '@pryzm/core-app-model';
import { ViewDefinition, registerSegmentUUID } from '@pryzm/core-app-model';
import type { FurnitureData } from '../FurnitureTypes';
import { TREE_SPECIES_TABLE, isTreeSpeciesId } from '../TreeTypes';
import { buildTreeElevationLinework, resolveTreeGroundY } from './TreeElevationSymbolGeometry';

/** Same ISO layer TreePlanSymbolBuilder uses for the plan canopy ink — trees
 *  are a furniture-store family in both views (C84 EI-9: one layer identity
 *  per family, not a second one invented for the second view type). */
const FURN_LAYER = 'A-FURN';

export class TreeElevationSymbolBuilder {
    /**
     * Injects elevation/section symbols for every tree visible in this view.
     * Filters by the view's level when it carries one; a building-wide
     * elevation/section (no levelId) includes every tree and lets the view
     * crop rectangle + hidden-line pass do the rest — same convention
     * `PlumbingElevationSymbolBuilder.inject` uses for the same reason.
     */
    inject(drawing: DrawingSurface, viewDef: ViewDefinition): void {
        const furnitureStore = (window as unknown as {
            furnitureStore?: { getAll: () => FurnitureData[] };
        }).furnitureStore;
        if (!furnitureStore) return;

        const levelId = viewDef.spatial?.levelId;

        if (!drawing.layers.has(FURN_LAYER)) drawing.layers.create(FURN_LAYER);

        let injected = 0;
        for (const tree of furnitureStore.getAll()) {
            if (!isTreeSpeciesId(tree.furnitureType)) continue;
            if (levelId && tree.levelId !== levelId) continue;

            const def = TREE_SPECIES_TABLE[tree.furnitureType];
            if (!def) continue;

            const positions = buildTreeElevationLinework(def, tree.id);
            if (positions.length === 0) continue;

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

            const lineSegments = new THREE.LineSegments(
                geo,
                new THREE.LineBasicMaterial({ color: 0x000000 }),
            );
            this._applyTransform(lineSegments, tree);
            lineSegments.updateWorldMatrix(true, false);

            const projected = projectToDrawingSpace(lineSegments, drawing);
            drawing.addProjectionLines(projected, FURN_LAYER);
            registerSegmentUUID(drawing, projected, tree.id);
            geo.dispose();
            injected++;
        }

        if (injected > 0) {
            console.log(
                `[TreeElevationSymbolBuilder] Injected ${injected} tree elevation/section ` +
                `symbol(s) into view ${viewDef.id}`,
            );
        }
    }

    /**
     * §TREE-ELEV-NO-YAW — position-only, deliberately NOT the tree's rotation.
     *
     * `PlumbingElevationSymbolBuilder._applyTransform` applies the fixture's
     * full rotation because a toilet has one authored front face and the
     * front/side profile split (`PlumbingSymbolGeometry`) depends on it
     * facing the correct way. A tree has no front — `TreeElevationSymbolGeometry`
     * already emits BOTH the X-Y and Z-Y profile from the same (u, v) pairs so
     * a cardinal view from any of the four sides reads a correctly-sized
     * silhouette without needing the element's own yaw. Applying `tree.rotation`
     * here would ROTATE that dual-profile pair away from the world X/Z axes it
     * was built against, which for some placement angles collapses the
     * silhouette to a sliver instead of showing it face-on — strictly worse
     * than doing nothing. So only the tree's ground position (+ baseOffset,
     * matching `TreePlanSymbolBuilder`'s own placement) is applied.
     */
    private _applyTransform(obj: THREE.Object3D, tree: FurnitureData): void {
        if (tree.position) {
            obj.position.set(
                tree.position.x,
                resolveTreeGroundY(tree.position, tree.baseOffset),
                tree.position.z,
            );
        }
    }
}

/** Singleton — imported by EdgeProjectorService, called once per elevation/section view. */
export const treeElevationSymbolBuilder = new TreeElevationSymbolBuilder();
