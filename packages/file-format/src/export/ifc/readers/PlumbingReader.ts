import { PlumbingStore } from '@pryzm/geometry-plumbing';
import { ExportElement, PropertySet } from '../IntermediateModel';
import { ReaderContext, buildPropertySet, collectIfcPsets } from './ReaderContext';
import { debug } from '@pryzm/core-app-model';

export class PlumbingReader {
    constructor(private store: PlumbingStore, private ctx: ReaderContext) {}

    read(): ExportElement[] {
        const elements: ExportElement[] = [];
        const items = this.store.getAll();
        debug(`PlumbingReader: ${items.length} plumbing fixtures`);

        for (const item of items) {
            const mesh = this.ctx.findMesh(item.id);
            const color = mesh ? this.ctx.extractColor(mesh) : null;
            if (!mesh) continue;
            const geometry = this.ctx.extractGeometry(mesh);
            if (!geometry) continue;

            const propertySets: PropertySet[] = [];
            const props: Record<string, any> = {
                FixtureType: item.fixtureType
            };
            if (item.width !== undefined) props['Width'] = item.width;
            if (item.height !== undefined) props['Height'] = item.height;
            if (item.length !== undefined) props['Length'] = item.length;
            const ps = buildPropertySet('Pset_FlowTerminalCommon', props);
            if (ps) propertySets.push(ps);

            if (item.properties && Object.keys(item.properties).length > 0) {
                const ps2 = buildPropertySet('Pset_ElementParameters', item.properties);
                if (ps2) propertySets.push(ps2);
            }
            const extra = collectIfcPsets((item as any).ifcData, new Set(propertySets.map(p => p.name)));
            propertySets.push(...extra);

            elements.push({
                id: item.id,
                guid: crypto.randomUUID(),
                ifcClass: 'IfcFlowTerminal',
                name: `plumbing-${item.id}`,
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
