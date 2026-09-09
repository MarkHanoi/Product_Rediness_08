// SiteworksMeshBuilder — the 3-D geometry of a paved surface. C116 §3 / §10 · ADR-0384 D4.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⛔ THIS FILE DERIVES NOTHING. IT ASKS.
// ═══════════════════════════════════════════════════════════════════════════════
//
// The footprint ring comes from `siteworksFootprintRing()` and the datum from
// `siteworksDatum()`, both in `@pryzm/geometry-siteworks`. ⛔ It does NOT sweep the
// centreline itself, and it does NOT compute `level.elevation + baseOffset -
// thickness` itself. Those are the family's named authorities (C84 EI-1), and a
// renderer that re-derived either would be the second implementation that drifts —
// the renderer is exactly where such a copy hides, because it LOOKS right on screen
// long after the number it disagrees with has changed.
//
// ⭐ AND THE `form` SPLIT NEVER REACHES THIS FILE. `siteworksFootprintRing` answers
// for a linear surface and an areal one alike, so nothing here branches on whether a
// road was drawn as a line or a car park as a ring (ADR-0384 D2).

import * as THREE from '@pryzm/renderer-three/three';
import {
    siteworksFootprintRing,
    siteworksDatum,
    type GroundPoint,
} from '@pryzm/geometry-siteworks';
import type { Siteworks, SiteworksRole } from '@pryzm/schemas';

/** What happened when we tried to draw. ⛔ A refusal carries its REASON. */
export type DrawOutcome =
    | { readonly drew: 'surface' }
    | { readonly drew: 'nothing'; readonly reason: string };

/**
 * Fallback tints, used only when the record carries no `materialColor`.
 *
 * ⚠ THESE ARE DISPLAY DEFAULTS, NOT A MATERIAL VOCABULARY. C116 §9e binds the family
 * to `materialId` (the C100 master-material reference) for what a surface IS MADE OF;
 * this map answers only "what colour is it before anyone has said". Reading these as
 * a material would be the [[fake-more-capable-than-real]] shape — a hex is not a
 * material, it is one attribute of one (C100 §2.1).
 */
const ROLE_TINT: Record<SiteworksRole, number> = {
    road:       0x4a4a4f,   // asphalt grey
    parking:    0x5c5c62,   // a shade lighter, so a lot reads apart from the road it meets
    pedestrian: 0x8d8378,   // warm paving
};

export class SiteworksMeshBuilder {
    private readonly _groups = new Map<string, THREE.Group>();

    constructor(private readonly _scene: THREE.Object3D) {}

    /**
     * Draw (or REDRAW) one surface. IDEMPOTENT BY ID: the previous group is disposed
     * first, so ten edits leave ten disposed geometries and ONE group — not eleven
     * overlapping plates, which is what an append-only builder produces and what makes
     * a "why is my road darker after I resize it" bug report unreadable.
     */
    updateSiteworks(record: Siteworks, levelElevationM: number): DrawOutcome {
        this.removeSiteworks(record.id);

        const footprint = siteworksFootprintRing(record);
        if (!footprint.ok) {
            // ⛔ THE AUTHORITY'S OWN SENTENCE, CARRIED OUT VERBATIM. A surface that is in
            // the store and not on screen must be able to say WHY, at the layer that
            // knows. Returning a silent no-op here is how a family becomes "sometimes it
            // just doesn't appear".
            return { drew: 'nothing', reason: footprint.reason };
        }

        const { topY, bottomY } = siteworksDatum(record, levelElevationM);
        const thickness = topY - bottomY;
        if (!(thickness > 0)) {
            return { drew: 'nothing', reason: `thickness resolved to ${thickness} m` };
        }

        const shape = SiteworksMeshBuilder._shapeOf(footprint.ring, record.holes);
        // ExtrudeGeometry builds along +Z in shape space; the shape is authored in the
        // XZ plane, so it is rotated flat and then seated. `depth: thickness` with the
        // group placed at `topY` puts the plate BELOW the finished surface — ADR-0384
        // D4, and the rule is `Slab`'s, not this file's.
        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: thickness, bevelEnabled: false, curveSegments: 1,
        });
        geometry.rotateX(Math.PI / 2);

        const colour = record.materialColor && /^#?[0-9a-fA-F]{6}$/.test(record.materialColor)
            ? new THREE.Color(record.materialColor.startsWith('#')
                ? record.materialColor : `#${record.materialColor}`)
            : new THREE.Color(ROLE_TINT[record.role]);

        const material = new THREE.MeshStandardMaterial({
            color: colour, roughness: 0.95, metalness: 0.0,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = true;
        // ⚠ A paved surface RECEIVES shadow and does not CAST one: a 300 mm plate lying
        // on the ground casting a shadow onto the ground reads as a rendering artefact.
        mesh.castShadow = false;

        const group = new THREE.Group();
        group.position.y = topY;
        group.add(mesh);

        // ── userData — A PROJECTION, NEVER A SOURCE (C116 §2). Selection reads it; no
        //    code may treat it as the record. The store is the authority.
        group.userData['id'] = record.id;
        group.userData['elementId'] = record.id;
        group.userData['type'] = 'siteworks';
        group.userData['elementType'] = 'siteworks';
        group.userData['selectable'] = true;
        group.userData['levelId'] = record.levelId ?? '';
        group.userData['siteworksRole'] = record.role;
        group.userData['siteworksForm'] = record.form;

        mesh.userData['id'] = record.id;
        mesh.userData['parentId'] = record.id;
        mesh.userData['elementType'] = 'SiteworksSurface';
        mesh.userData['role'] = 'geometry';

        this._scene.add(group);
        this._groups.set(record.id, group);
        return { drew: 'surface' };
    }

    /** Remove one surface and free its GPU resources. Safe to call for an unknown id. */
    removeSiteworks(id: string): void {
        const group = this._groups.get(id);
        if (!group) return;
        this._groups.delete(id);
        group.removeFromParent();
        group.traverse((o) => {
            const m = o as THREE.Mesh;
            // ⛔ DISPOSE BOTH. A builder that drops the group and keeps the geometry is a
            // GPU leak that only shows up after an hour of editing, which is the hardest
            // kind of report to act on.
            if (m.geometry) m.geometry.dispose();
            const mat = m.material as THREE.Material | THREE.Material[] | undefined;
            if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
            else mat?.dispose();
        });
    }

    /** Remove everything this builder drew. Called on teardown. */
    dispose(): void {
        for (const id of [...this._groups.keys()]) this.removeSiteworks(id);
    }

    /** The ring (and its voids) as a THREE shape in the XZ plane. */
    private static _shapeOf(
        ring: readonly GroundPoint[],
        holes: readonly (readonly GroundPoint[])[],
    ): THREE.Shape {
        const shape = new THREE.Shape();
        ring.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, p.z) : shape.lineTo(p.x, p.z)));
        shape.closePath();
        for (const h of holes) {
            if (h.length < 3) continue;
            const path = new THREE.Path();
            h.forEach((p, i) => (i === 0 ? path.moveTo(p.x, p.z) : path.lineTo(p.x, p.z)));
            path.closePath();
            shape.holes.push(path);
        }
        return shape;
    }
}
