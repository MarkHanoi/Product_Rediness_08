import { SlabStore } from '@pryzm/geometry-slab';
import { ExportElement, PropertySet } from '../IntermediateModel';
import { ReaderContext, buildPropertySet, collectIfcPsets } from './ReaderContext';
import { debug } from '@pryzm/core-app-model';

export class SlabReader {
    constructor(private store: SlabStore, private ctx: ReaderContext) {}

    read(): ExportElement[] {
        const elements: ExportElement[] = [];
        const slabs = this.store.getAll();
        debug(`SlabReader: ${slabs.length} slabs`);

        for (const slab of slabs) {
            const mesh = this.ctx.findMesh(slab.id);
            const color = mesh ? this.ctx.extractColor(mesh) : null;
            if (!mesh) continue;
            const geometry = this.ctx.extractGeometry(mesh);
            if (!geometry) continue;

            const propertySets: PropertySet[] = [];
            if (slab.ifcData?.psetCommon) {
                const ps = buildPropertySet('Pset_SlabCommon', slab.ifcData.psetCommon);
                if (ps) propertySets.push(ps);
            }
            if (slab.properties && Object.keys(slab.properties).length > 0) {
                const ps = buildPropertySet('Pset_ElementParameters', slab.properties as Record<string, any>);
                if (ps) propertySets.push(ps);
            }
            const extra = collectIfcPsets(slab.ifcData, new Set(propertySets.map(p => p.name)));
            propertySets.push(...extra);

            elements.push({
                id: slab.id,
                guid: slab.ifcData?.guid ?? crypto.randomUUID(),
                ifcClass: slab.ifcData?.ifcClass ?? 'IfcSlab',
                name: `slab-${slab.id}`,
                predefinedType: slab.ifcData?.predefinedType,
                geometry,
                position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
                rotation: { x: 0, y: 0, z: 0 },
                propertySets,
                levelId: slab.levelId,
                parentId: slab.parentId,
                ...(color ? { color } : {}),
            });
        }

        return elements;
    }
}
