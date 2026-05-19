import { CreateRoomCommand } from '@pryzm/command-registry';
import { generateMark } from '@pryzm/core-app-model';
import { RoomData } from '@pryzm/room-topology';
import { executeHumanDirect, getCommandContext, makeUuid } from './IfcConversionContext';
import { IfcConversionCandidate, IfcConversionIssue, RectangleAnalysis } from './IfcConversionTypes';
import { IfcGeometryAnalyzer } from './IfcGeometryAnalyzer';

export class IfcSpaceToNativeRoomConverter {
  constructor(private commandManager: any, private issues: IfcConversionIssue[]) {}

  convert(candidate: IfcConversionCandidate, analysis: RectangleAnalysis, dryRun: boolean): string | undefined {
    if (!candidate.levelId) {
      this.issues.push({ severity: 'error', sourceId: candidate.sourceId, message: 'Room conversion skipped because no native level could be resolved.' });
      return undefined;
    }

    const id = makeUuid('room-ifc');
    if (dryRun) return id;

    const geometry = new IfcGeometryAnalyzer();
    const area = geometry.areaXZ(analysis.polygonXZ);
    const perimeter = geometry.perimeterXZ(analysis.polygonXZ);
    const centroid = { x: analysis.center.x, z: analysis.center.z };
    const ctx = getCommandContext(this.commandManager);
    const mark = generateMark('room', candidate.levelId, {
      getLevels: () => ctx?.bimManager?.getLevels?.() ?? [],
      countElementsOnLevel: (_type, levelId) => ctx?.stores?.roomStore?.getAll?.().filter((r: any) => r.levelId === levelId).length ?? 0,
    });

    const now = Date.now();
    const room: RoomData = {
      id,
      type: 'room',
      levelId: candidate.levelId,
      parentId: candidate.levelId,
      name: candidate.trace.sourceMeshName || `IFC Space ${candidate.trace.expressID}`,
      roomNumber: String(candidate.trace.expressID),
      boundary: {
        polygon: analysis.polygonXZ,
        height: Math.max(2.1, analysis.height),
        baseOffset: Math.max(0, analysis.minY - (ctx?.bimManager?.getLevelById?.(candidate.levelId)?.elevation ?? analysis.minY)),
        detectionMethod: 'ifc-import',
      },
      boundingWallIds: [],
      boundingSlabIds: [],
      boundingColumnIds: [],
      occupancyType: 'unclassified',
      programmeArea: area,
      finishes: {},
      computed: {
        area,
        grossArea: area,
        perimeter,
        volume: area * Math.max(2.1, analysis.height),
        centroid,
        boundingBox: {
          minX: analysis.minX,
          minZ: analysis.minZ,
          maxX: analysis.maxX,
          maxZ: analysis.maxZ,
        },
      },
      colour: '#B8D4F0',
      opacity: 0.35,
      properties: { mark, comments: `Converted from IFC expressID ${candidate.trace.expressID}` },
      ifcData: {
        guid: candidate.trace.globalId ?? id,
        ifcClass: 'IfcSpace',
        predefinedType: 'SPACE',
        psets: candidate.trace.psets as any,
      },
      metadata: {
        createdAt: now,
        modifiedAt: now,
        createdBy: 'ifc-import',
        version: 1,
        tags: ['ifc-converted'],
      },
    };

    const result = executeHumanDirect(this.commandManager, new CreateRoomCommand(room));
    if (!result?.success) {
      this.issues.push({ severity: 'error', sourceId: candidate.sourceId, message: `Room command failed: ${result?.error ?? result?.info?.join(', ') ?? 'unknown error'}` });
      return undefined;
    }
    return id;
  }
}