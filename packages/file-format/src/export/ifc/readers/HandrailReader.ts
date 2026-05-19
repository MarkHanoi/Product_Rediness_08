import { HandrailStore } from '@pryzm/core-app-model/stores';
import { ExportElement, PropertySet } from '../IntermediateModel';
import { ReaderContext, buildPropertySet, collectIfcPsets } from './ReaderContext';
import { debug } from '@pryzm/core-app-model';

export class HandrailReader {
    constructor(private store: HandrailStore, private ctx: ReaderContext) {}

    read(): ExportElement[] {
        const elements: ExportElement[] = [];
        const items = this.store.getAll();
        debug(`HandrailReader: ${items.length} handrails`);

        for (const item of items) {
            const mesh = this.ctx.findMesh(item.id);
            const color = mesh ? this.ctx.extractColor(mesh) : null;
            if (!mesh) continue;
            const geometry = this.ctx.extractGeometry(mesh);
            if (!geometry) continue;

            const propertySets: PropertySet[] = [];
            const props: Record<string, any> = {
                Height: item.height,
                Thickness: item.thickness
            };
            const ps = buildPropertySet('Pset_RailingCommon', props);
            if (ps) propertySets.push(ps);

            if (item.properties && Object.keys(item.properties).length > 0) {
                const ps2 = buildPropertySet('Pset_ElementParameters', item.properties as Record<string, any>);
                if (ps2) propertySets.push(ps2);
            }
            const extra = collectIfcPsets(item.ifcData, new Set(propertySets.map(p => p.name)));
            propertySets.push(...extra);

            elements.push({
                id: item.id,
                guid: item.ifcData?.guid ?? crypto.randomUUID(),
                ifcClass: item.ifcData?.ifcClass ?? 'IfcRailing',
                name: `handrail-${item.id}`,
                predefinedType: item.ifcData?.predefinedType,
                geometry,
                position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
                rotation: { x: 0, y: 0, z: 0 },
                propertySets,
                levelId: item.levelId,
                parentId: item.parentId,
                ...(color ? { color } : {}),
            });
        }

        return elements;
    }
}
