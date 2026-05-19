import { StairStore } from '@pryzm/geometry-stair';
import { ExportElement, PropertySet } from '../IntermediateModel';
import { ReaderContext, buildPropertySet, collectIfcPsets } from './ReaderContext';
import { debug } from '@pryzm/core-app-model';

export class StairReader {
    constructor(private store: StairStore, private ctx: ReaderContext) {}

    read(): ExportElement[] {
        const elements: ExportElement[] = [];
        const stairs = this.store.getAll();
        debug(`StairReader: ${stairs.length} stairs`);

        for (const stair of stairs) {
            const mesh = this.ctx.findMesh(stair.id);
            const color = mesh ? this.ctx.extractColor(mesh) : null;
            if (!mesh) continue;
            const geometry = this.ctx.extractGeometry(mesh);
            if (!geometry) continue;

            const propertySets: PropertySet[] = [];
            const stairProps: Record<string, any> = {
                RiserHeight: stair.riserHeight,
                TreadDepth: stair.treadDepth,
                Width: stair.width
            };
            if (stair.fireRating) stairProps['FireRating'] = stair.fireRating;
            if (stair.accessibilityType) stairProps['AccessibilityType'] = stair.accessibilityType;
            if (stair.properties?.mark) stairProps['Mark'] = stair.properties.mark;
            if (stair.properties?.material) stairProps['Material'] = stair.properties.material;
            const ps = buildPropertySet('Pset_StairCommon', stairProps);
            if (ps) propertySets.push(ps);
            const extra = collectIfcPsets(stair.ifcData, new Set(propertySets.map(p => p.name)));
            propertySets.push(...extra);

            const ifcClass = stair.ifcData?.ifcClass ?? 'IfcStair';

            elements.push({
                id: stair.id,
                guid: stair.ifcData?.guid ?? crypto.randomUUID(),
                ifcClass,
                name: `stair-${stair.id}`,
                predefinedType: undefined,
                geometry,
                position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
                rotation: { x: 0, y: 0, z: 0 },
                propertySets,
                levelId: stair.baseLevelId,
                parentId: undefined,
                ...(color ? { color } : {}),
            });
        }

        return elements;
    }
}
