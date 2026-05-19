import { RoofStore } from '@pryzm/geometry-roof';
import { ExportElement, PropertySet } from '../IntermediateModel';
import { ReaderContext, buildPropertySet, collectIfcPsets } from './ReaderContext';
import { debug } from '@pryzm/core-app-model';
import { ROOF_TYPE_TO_IFC } from '@pryzm/geometry-roof';

export class RoofReader {
    constructor(private store: RoofStore, private ctx: ReaderContext) {}

    read(): ExportElement[] {
        const elements: ExportElement[] = [];
        const roofs = this.store.getAll();
        debug(`RoofReader: ${roofs.length} roofs`);

        for (const roof of roofs) {
            const mesh = this.ctx.findMesh(roof.id);
            const geometry = mesh ? this.ctx.extractGeometry(mesh) : undefined;
            const color = mesh ? this.ctx.extractColor(mesh) : null;

            const cx = roof.footprint?.centroid?.[0] ?? 0;
            const cz = roof.footprint?.centroid?.[1] ?? 0;

            const level = this.ctx.getLevelById?.(roof.levelId);
            const worldY = level
                ? (level.elevation + roof.baseOffset)
                : (roof.baseOffset ?? 0);

            const propertySets: PropertySet[] = [];
            const roofProps: Record<string, any> = {
                Thickness:  roof.thickness,
                BaseOffset: roof.baseOffset,
                Overhang:   roof.overhang,
                RoofType:   roof.roofType,
            };
            if (roof.slope !== undefined) roofProps['Slope'] = roof.slope;
            if (roof.fascia !== undefined) roofProps['Fascia'] = roof.fascia;

            const ps = buildPropertySet('Pset_RoofCommon', roofProps);
            if (ps) propertySets.push(ps);

            if (roof.properties && Object.keys(roof.properties).length > 0) {
                const ps2 = buildPropertySet('Pset_ElementParameters', roof.properties as Record<string, any>);
                if (ps2) propertySets.push(ps2);
            }

            const extra = collectIfcPsets(roof.ifcData, new Set(propertySets.map(p => p.name)));
            propertySets.push(...extra);

            const predefinedType = roof.ifcData?.predefinedType
                ?? ROOF_TYPE_TO_IFC[roof.roofType]
                ?? 'NOTDEFINED';

            elements.push({
                id:             roof.id,
                guid:           roof.ifcData?.guid ?? crypto.randomUUID(),
                ifcClass:       roof.ifcData?.ifcClass ?? 'IfcRoof',
                name:           `roof-${roof.id}`,
                predefinedType,
                geometry:       geometry ?? { vertices: new Float32Array(), indices: new Uint32Array() },
                position:       { x: cx, y: worldY, z: cz },
                rotation:       { x: 0, y: 0, z: 0 },
                propertySets,
                levelId:        roof.levelId,
                parentId:       roof.parentId,
                ...(color ? { color } : {}),
            });
        }

        return elements;
    }
}
