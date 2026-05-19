import { BeamStore } from '@pryzm/core-app-model/stores';
import { ExportElement, PropertySet } from '../IntermediateModel';
import { ReaderContext, buildPropertySet, collectIfcPsets } from './ReaderContext';
import { debug } from '@pryzm/core-app-model';

export class BeamReader {
    constructor(private store: BeamStore, private ctx: ReaderContext) {}

    read(): ExportElement[] {
        const elements: ExportElement[] = [];
        const beams = this.store.getAll();
        debug(`BeamReader: ${beams.length} beams`);

        for (const beam of beams) {
            const mesh = this.ctx.findMesh(beam.id);
            const color = mesh ? this.ctx.extractColor(mesh) : null;
            if (!mesh) continue;
            const geometry = this.ctx.extractGeometry(mesh);
            if (!geometry) continue;

            const propertySets: PropertySet[] = [];
            const beamProps: Record<string, any> = {
                LoadBearing: beam.loadBearing,
                Width: beam.width,
                Depth: beam.depth
            };
            if (beam.fireRating) beamProps['FireRating'] = beam.fireRating;
            if (beam.material) beamProps['Material'] = beam.material;
            if (beam.properties?.mark) beamProps['Mark'] = beam.properties.mark;
            const ps = buildPropertySet('Pset_BeamCommon', beamProps);
            if (ps) propertySets.push(ps);
            const extra = collectIfcPsets(beam.ifcData, new Set(propertySets.map(p => p.name)));
            propertySets.push(...extra);

            elements.push({
                id: beam.id,
                guid: beam.ifcData?.guid ?? crypto.randomUUID(),
                ifcClass: 'IfcBeam',
                name: `beam-${beam.id}`,
                predefinedType: undefined,
                geometry,
                position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
                rotation: { x: 0, y: 0, z: 0 },
                propertySets,
                levelId: beam.levelId,
                parentId: beam.parentId,
                ...(color ? { color } : {}),
            });
        }

        return elements;
    }
}
