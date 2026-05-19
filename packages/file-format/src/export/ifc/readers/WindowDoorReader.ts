import { WallStore } from '@pryzm/geometry-wall';
import { ExportElement, PropertySet, TriangulatedGeometry } from '../IntermediateModel';
import { ReaderContext, buildPropertySet, collectIfcPsets } from './ReaderContext';
import { debug } from '@pryzm/core-app-model';

export class WindowDoorReader {
    constructor(private store: WallStore, private ctx: ReaderContext) {}

    read(): ExportElement[] {
        const elements: ExportElement[] = [];

        const windows = this.store.getAllWindows();
        debug(`WindowDoorReader: ${windows.length} windows`);
        for (const win of windows) {
            const mesh = this.ctx.findMesh(win.id);
            const color = mesh ? this.ctx.extractColor(mesh) : null;
            if (!mesh) continue;
            const geometry = this.ctx.extractGeometry(mesh);
            if (!geometry) continue;

            const propertySets: PropertySet[] = [];
            if (win.ifcData?.psetCommon) {
                const ps = buildPropertySet('Pset_WindowCommon', win.ifcData.psetCommon);
                if (ps) propertySets.push(ps);
            }
            const winProps: Record<string, any> = {
                Width: win.width,
                Height: win.height,
                SillHeight: win.sillHeight
            };
            if (win.fireRating) winProps['FireRating'] = win.fireRating;
            if (win.windowType) winProps['WindowType'] = win.windowType;
            const ps = buildPropertySet('Pset_WindowParameters', winProps);
            if (ps) propertySets.push(ps);
            const winExtra = collectIfcPsets(win.ifcData, new Set(propertySets.map(p => p.name)));
            propertySets.push(...winExtra);

            elements.push({
                id: win.id,
                guid: win.ifcData?.guid ?? crypto.randomUUID(),
                ifcClass: 'IfcWindow',
                name: `window-${win.id}`,
                predefinedType: win.ifcData?.predefinedType,
                geometry,
                position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
                rotation: { x: 0, y: 0, z: 0 },
                propertySets,
                levelId: win.levelId,
                parentId: win.parentId,
                hostWallId: win.wallId,
                openingGeometry: this.buildOpeningGeometry(win.wallId, win.offset, win.width, win.height, win.sillHeight),
                ...(color ? { color } : {}),
            });
        }

        const doors = this.store.getAllDoors();
        debug(`WindowDoorReader: ${doors.length} doors`);
        for (const door of doors) {
            const mesh = this.ctx.findMesh(door.id);
            const color = mesh ? this.ctx.extractColor(mesh) : null;
            if (!mesh) continue;
            const geometry = this.ctx.extractGeometry(mesh);
            if (!geometry) continue;

            const propertySets: PropertySet[] = [];
            if (door.ifcData?.psetCommon) {
                const ps = buildPropertySet('Pset_DoorCommon', door.ifcData.psetCommon);
                if (ps) propertySets.push(ps);
            }
            const doorProps: Record<string, any> = {
                Width: door.width,
                Height: door.height
            };
            if (door.fireRating) doorProps['FireRating'] = door.fireRating;
            if (door.doorType) doorProps['DoorType'] = door.doorType;
            if (door.accessibilityType) doorProps['AccessibilityType'] = door.accessibilityType;
            const ps = buildPropertySet('Pset_DoorParameters', doorProps);
            if (ps) propertySets.push(ps);
            const doorExtra = collectIfcPsets(door.ifcData, new Set(propertySets.map(p => p.name)));
            propertySets.push(...doorExtra);

            elements.push({
                id: door.id,
                guid: door.ifcData?.guid ?? crypto.randomUUID(),
                ifcClass: 'IfcDoor',
                name: `door-${door.id}`,
                predefinedType: door.ifcData?.predefinedType,
                geometry,
                position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
                rotation: { x: 0, y: 0, z: 0 },
                propertySets,
                levelId: door.levelId,
                parentId: door.parentId,
                hostWallId: door.wallId,
                openingGeometry: this.buildOpeningGeometry(door.wallId, door.offset, door.width, door.height, door.sillHeight ?? 0),
                ...(color ? { color } : {}),
            });
        }

        return elements;
    }

    private buildOpeningGeometry(
        wallId: string,
        offset: number,
        width: number,
        height: number,
        sillHeight: number,
    ): TriangulatedGeometry | undefined {
        const wall = this.store.getById(wallId);
        if (!wall) return undefined;

        const p0 = wall.baseLine[0];
        const p1 = wall.baseLine[1];
        const dx = p1.x - p0.x;
        const dz = p1.z - p0.z;
        const length = Math.sqrt(dx * dx + dz * dz);
        if (length < 0.001) return undefined;

        const dirX = dx / length;
        const dirZ = dz / length;
        const normX = -dirZ;
        const normZ = dirX;
        const layerThickness = wall.layers?.reduce((sum, layer) => sum + layer.thickness, 0) ?? wall.thickness;
        const halfDepth = Math.max(layerThickness, wall.thickness) / 2 + 0.01;
        const halfWidth = width / 2;
        const levelElevation = this.store.getLevelById(wall.levelId)?.elevation ?? 0;
        const y0 = levelElevation + (wall.baseOffset ?? 0) + sillHeight;
        const y1 = y0 + height;
        const x0 = Math.max(0, offset - halfWidth);
        const x1 = Math.min(length, offset + halfWidth);
        if (x1 - x0 < 0.001 || y1 - y0 < 0.001) return undefined;

        const point = (along: number, lateral: number, y: number): [number, number, number] => [
            p0.x + dirX * along + normX * lateral,
            y,
            p0.z + dirZ * along + normZ * lateral,
        ];

        const vertices = new Float32Array([
            ...point(x0,  halfDepth, y0),
            ...point(x1,  halfDepth, y0),
            ...point(x1,  halfDepth, y1),
            ...point(x0,  halfDepth, y1),
            ...point(x0, -halfDepth, y0),
            ...point(x1, -halfDepth, y0),
            ...point(x1, -halfDepth, y1),
            ...point(x0, -halfDepth, y1),
        ]);

        const indices = new Uint32Array([
            0, 1, 2, 0, 2, 3,
            5, 4, 7, 5, 7, 6,
            4, 0, 3, 4, 3, 7,
            1, 5, 6, 1, 6, 2,
            3, 2, 6, 3, 6, 7,
            4, 5, 1, 4, 1, 0,
        ]);

        return { vertices, indices };
    }
}
