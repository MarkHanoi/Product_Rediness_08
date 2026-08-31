/**
 * CeilingReader.ts — `ceiling` → `IfcCovering` / `CEILING`.
 *
 * §W4B-CEILING-EXPORTS (Wave 4b, 2026-08-31)
 *
 * The 2026-08-29 audit graded `ceiling` UNVERIFIED overall, with `exports = NO`
 * recorded as *"the only outright NO"* on the row — every other cell was
 * unmeasurable headlessly, but this one was measured and it was real. There was
 * no CeilingReader on disk and `ExportIFC.ts` passed no `ceilingStore`.
 *
 * Like `FloorReader`, the IFC mapping is NOT a decision taken here:
 * `CeilingIfcData` (`packages/core-app-model/src/stores/CeilingTypes.ts:144-147`)
 * declares `ifcClass: 'IfcCovering'` and `predefinedType: 'CEILING'` as literal
 * types. Floor and ceiling are the same IFC entity separated by their
 * PredefinedType, which is exactly what `IfcCovering` is for.
 *
 * ⚠ HONEST LIMIT — this reader can only export a ceiling that has a MESH.
 * `ReaderContext.findMesh` resolves `scene.userData.id`, which
 * `CeilingPanelBuilder.ts:243` sets on the root group. The audit could not
 * verify `renders_3d` for ceiling headlessly (probe P-1 printed
 * `ceiling=undefined`), so if ceilings turn out not to build meshes in some
 * path, this reader contributes zero elements and does so SILENTLY, the same
 * way every other reader here does. That is a property of the shared
 * mesh-driven design, not of this family — and it is named rather than hidden.
 */

import { CeilingStore, CeilingData } from '@pryzm/core-app-model/stores';
import { ExportElement, PropertySet } from '../IntermediateModel';
import { ReaderContext, buildPropertySet, collectIfcPsets } from './ReaderContext';
import { resolveCommonPset } from './commonPsets';
import { debug } from '@pryzm/core-app-model';

/** See the twin note in `FloorReader` — `CeilingIfcData.psets` is a Record, not an array. */
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

export class CeilingReader {
    constructor(private store: CeilingStore, private ctx: ReaderContext) {}

    read(): ExportElement[] {
        const elements: ExportElement[] = [];
        const ceilings: CeilingData[] = this.store.getAll();
        debug(`CeilingReader: ${ceilings.length} ceilings`);

        for (const ceiling of ceilings) {
            const mesh = this.ctx.findMesh(ceiling.id);
            if (!mesh) continue;
            const geometry = this.ctx.extractGeometry(mesh);
            if (!geometry) continue;
            const color = this.ctx.extractColor(mesh);

            const propertySets: PropertySet[] = [];
            const common = resolveCommonPset('Pset_CoveringCommon', ceiling as never);
            if (common) propertySets.push(common);

            if (ceiling.properties && Object.keys(ceiling.properties).length > 0) {
                const ps = buildPropertySet(
                    'Pset_ElementParameters',
                    ceiling.properties as unknown as Record<string, unknown>,
                );
                if (ps) propertySets.push(ps);
            }

            const taken = new Set(propertySets.map(p => p.name));
            propertySets.push(...collectIfcPsets(ceiling.ifcData, taken));
            propertySets.push(...collectRecordPsets(ceiling.ifcData?.psets, taken));

            elements.push({
                id: ceiling.id,
                guid: ceiling.ifcData?.guid,
                ifcClass: ceiling.ifcData?.ifcClass ?? 'IfcCovering',
                name: ceiling.label ?? `ceiling-${ceiling.id}`,
                predefinedType: ceiling.ifcData?.predefinedType ?? 'CEILING',
                geometry,
                position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
                rotation: { x: 0, y: 0, z: 0 },
                propertySets,
                levelId: ceiling.levelId,
                parentId: ceiling.parentId,
                ...(color ? { color } : {}),
            });
        }

        return elements;
    }
}
