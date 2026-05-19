import { FurnitureStore } from '@pryzm/geometry-furniture';
import { ExportElement, PropertySet } from '../IntermediateModel';
import { ReaderContext, buildPropertySet, collectIfcPsets } from './ReaderContext';
import { debug } from '@pryzm/core-app-model';

export class FurnitureReader {
    constructor(private store: FurnitureStore, private ctx: ReaderContext) {}

    read(): ExportElement[] {
        const elements: ExportElement[] = [];
        const items = this.store.getAll();
        debug(`FurnitureReader: ${items.length} furniture`);

        for (const item of items) {
            const mesh = this.ctx.findMesh(item.id);
            const color = mesh ? this.ctx.extractColor(mesh) : null;
            if (!mesh) continue;
            const geometry = this.ctx.extractGeometry(mesh);
            if (!geometry) continue;

            const propertySets: PropertySet[] = [];
            const props: Record<string, any> = {
                FurnitureType: item.furnitureType,
                Width: item.width,
                Height: item.height,
                Length: item.length
            };
            const ps = buildPropertySet('Pset_FurnitureTypeCommon', props);
            if (ps) propertySets.push(ps);
            const extra = collectIfcPsets((item as any).ifcData, new Set(propertySets.map(p => p.name)));
            propertySets.push(...extra);

            elements.push({
                id: item.id,
                guid: crypto.randomUUID(),
                ifcClass: 'IfcFurnishingElement',
                name: `furniture-${item.id}`,
                predefinedType: undefined,
                geometry,
                position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
                rotation: { x: 0, y: 0, z: 0 },
                propertySets,
                levelId: item.levelId,
                parentId: undefined,
                ...(color ? { color } : {}),
            });
        }

        return elements;
    }
}
