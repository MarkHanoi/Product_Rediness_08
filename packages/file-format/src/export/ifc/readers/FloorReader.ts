/**
 * FloorReader.ts — `floor` → `IfcCovering` / `FLOORING`.
 *
 * §W4B-FLOOR-EXPORTS (Wave 4b, 2026-08-31)
 *
 * ─── WHAT WAS ACTUALLY MISSING ─────────────────────────────────────────────
 * The 2026-08-29 element-creation audit graded `floor` PARTIAL with `exports`
 * as its FIRST failing link, and its evidence was exact: *"`ls
 * packages/file-format/src/export/ifc/readers/` → BeamReader … "* with no
 * FloorReader in the listing, and `ExportIFC.ts` building an 11-key stores
 * object carrying no `floorStore`. Both halves re-measured true at HEAD before
 * this file was written, so this is a WIRE of an authored-but-unreachable
 * capability, not a new capability.
 *
 * ⚠ A floor is NOT a slab and this reader is not a rival of `SlabReader`.
 * `SlabStore` (`@pryzm/geometry-slab`) holds the STRUCTURAL plate; `FloorStore`
 * (`@pryzm/core-app-model/stores`) holds the FINISH that sits on top of it —
 * they are different stores, different ids, different meshes, and a floor
 * carries `boundingWallIds` / `hostSlabId` / `finishSpec` that no slab has.
 * `FloorData.hostSlabId` is the link between them. Exporting one has never
 * exported the other.
 *
 * ─── WHY `IfcCovering` IS NOT A CHOICE THIS FILE MAKES ─────────────────────
 * `FloorIfcData` (`packages/core-app-model/src/stores/FloorTypes.ts:157-160`)
 * declares the mapping as a LITERAL TYPE — `ifcClass: 'IfcCovering'`,
 * `predefinedType: 'FLOORING'`. The schema had already decided; nothing but the
 * reader was absent. `IfcCovering` was likewise already in
 * `IfcModelBuilder.IFC_CLASS_MAP` and already in the switch arm that passes
 * `PredefinedType`, so no writer change was needed for this family.
 */

import { FloorStore, FloorData } from '@pryzm/core-app-model/stores';
import { ExportElement, PropertySet } from '../IntermediateModel';
import { ReaderContext, buildPropertySet, collectIfcPsets } from './ReaderContext';
import { resolveCommonPset } from './commonPsets';
import { debug } from '@pryzm/core-app-model';

/**
 * `FloorIfcData.psets` is `Record<string, Record<string, …>>`, but
 * `collectIfcPsets` consumes the ARRAY shape (`ifcData.psets.length`) that the
 * imported-IFC stores use. A Record has no `.length`, so that helper returns []
 * for every floor and the psets an architect authored are dropped in silence.
 *
 * ⭐ "no psets" and "psets in a shape the helper cannot read" must not be the
 * same value. This converts the Record shape rather than letting it vanish.
 */
function collectRecordPsets(
    psets: Record<string, Record<string, string | number | boolean>> | undefined,
    existingNames: Set<string>,
): PropertySet[] {
    if (!psets) return [];
    const out: PropertySet[] = [];
    for (const [name, properties] of Object.entries(psets)) {
        if (existingNames.has(name)) continue;
        if (!properties || typeof properties !== 'object') continue;
        const ps = buildPropertySet(name, properties);
        if (ps) out.push(ps);
    }
    return out;
}

export class FloorReader {
    constructor(private store: FloorStore, private ctx: ReaderContext) {}

    read(): ExportElement[] {
        const elements: ExportElement[] = [];
        const floors: FloorData[] = this.store.getAll();
        debug(`FloorReader: ${floors.length} floors`);

        for (const floor of floors) {
            const mesh = this.ctx.findMesh(floor.id);
            if (!mesh) continue;
            const geometry = this.ctx.extractGeometry(mesh);
            if (!geometry) continue;
            const color = this.ctx.extractColor(mesh);

            const propertySets: PropertySet[] = [];
            const common = resolveCommonPset('Pset_CoveringCommon', floor as never);
            if (common) propertySets.push(common);

            if (floor.properties && Object.keys(floor.properties).length > 0) {
                const ps = buildPropertySet(
                    'Pset_ElementParameters',
                    floor.properties as unknown as Record<string, unknown>,
                );
                if (ps) propertySets.push(ps);
            }

            const taken = new Set(propertySets.map(p => p.name));
            propertySets.push(...collectIfcPsets(floor.ifcData, taken));
            propertySets.push(...collectRecordPsets(floor.ifcData?.psets, taken));

            elements.push({
                id: floor.id,
                guid: floor.ifcData?.guid,
                ifcClass: floor.ifcData?.ifcClass ?? 'IfcCovering',
                name: floor.label ?? `floor-${floor.id}`,
                predefinedType: floor.ifcData?.predefinedType ?? 'FLOORING',
                geometry,
                position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
                rotation: { x: 0, y: 0, z: 0 },
                propertySets,
                levelId: floor.levelId,
                parentId: floor.parentId,
                ...(color ? { color } : {}),
            });
        }

        return elements;
    }
}
