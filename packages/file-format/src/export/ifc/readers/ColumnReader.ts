import { ColumnStore } from '@pryzm/geometry-column';
import { ExportElement, PropertySet } from '../IntermediateModel';
import { ReaderContext, buildPropertySet, collectIfcPsets } from './ReaderContext';
import { debug } from '@pryzm/core-app-model';

export class ColumnReader {
    constructor(private store: ColumnStore, private ctx: ReaderContext) {}

    read(): ExportElement[] {
        const elements: ExportElement[] = [];
        const columns = this.store.getAll();
        debug(`ColumnReader: ${columns.length} columns`);

        for (const col of columns) {
            const mesh = this.ctx.findMesh(col.id);
            const color = mesh ? this.ctx.extractColor(mesh) : null;
            if (!mesh) continue;
            const geometry = this.ctx.extractGeometry(mesh);
            if (!geometry) continue;

            const propertySets: PropertySet[] = [];
            if (col.ifcData?.psetCommon) {
                const ps = buildPropertySet('Pset_ColumnCommon', col.ifcData.psetCommon);
                if (ps) propertySets.push(ps);
            }
            if (col.properties && Object.keys(col.properties).length > 0) {
                const ps = buildPropertySet('Pset_ElementParameters', col.properties as Record<string, any>);
                if (ps) propertySets.push(ps);
            }
            const extra = collectIfcPsets(col.ifcData, new Set(propertySets.map(p => p.name)));
            propertySets.push(...extra);

            elements.push({
                id: col.id,
                guid: col.ifcData?.guid ?? crypto.randomUUID(),
                ifcClass: col.ifcData?.ifcClass ?? 'IfcColumn',
                name: `column-${col.id}`,
                predefinedType: col.ifcData?.predefinedType,
                geometry,
                position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
                rotation: { x: 0, y: 0, z: 0 },
                propertySets,
                levelId: col.levelId,
                parentId: col.parentId,
                ...(color ? { color } : {}),
            });
        }

        return elements;
    }
}
