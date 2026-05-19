import { CreateCeilingCommand } from '@pryzm/command-registry';
import { CreateFloorCommand } from '@pryzm/command-registry';
import { CreateSlabCommand } from '@pryzm/command-registry';
import { executeHumanDirect, makeUuid } from './IfcConversionContext';
import { IfcConversionCandidate, IfcConversionIssue, RectangleAnalysis } from './IfcConversionTypes';

export class IfcSlabToNativeConverter {
  constructor(private commandManager: any, private issues: IfcConversionIssue[]) {}

  convert(candidate: IfcConversionCandidate, analysis: RectangleAnalysis, dryRun: boolean): string | undefined {
    if (!candidate.levelId) {
      this.issues.push({ severity: 'error', sourceId: candidate.sourceId, message: `${candidate.category} conversion skipped because no native level could be resolved.` });
      return undefined;
    }

    if (candidate.category === 'floor') return this.convertFloor(candidate, analysis, dryRun);
    if (candidate.category === 'ceiling') return this.convertCeiling(candidate, analysis, dryRun);
    return this.convertSlab(candidate, analysis, dryRun);
  }

  private convertSlab(candidate: IfcConversionCandidate, analysis: RectangleAnalysis, dryRun: boolean): string | undefined {
    const id = makeUuid('slab-ifc');
    if (dryRun) return id;

    // BUG-FIX: position.y was hardcoded to 0, placing every slab at ground level.
    // Use analysis.minY (the bottom face world-Y) so each slab sits at its actual elevation.
    const result = executeHumanDirect(this.commandManager, new CreateSlabCommand({
      id,
      ifcGuid: candidate.trace.globalId ?? id,
      width: analysis.width,
      depth: analysis.depth,
      thickness: Math.max(0.05, analysis.height),
      position: { x: analysis.center.x, y: analysis.minY, z: analysis.center.z },
      levelId: candidate.levelId!,
      polygon: analysis.polygonXY,
    }));

    if (!result?.success) {
      this.issues.push({ severity: 'error', sourceId: candidate.sourceId, message: `Slab command failed: ${result?.error ?? result?.info?.join(', ') ?? 'unknown error'}` });
      return undefined;
    }
    return id;
  }

  private convertFloor(candidate: IfcConversionCandidate, analysis: RectangleAnalysis, dryRun: boolean): string | undefined {
    const id = makeUuid('floor-ifc');
    if (dryRun) return id;

    const result = executeHumanDirect(this.commandManager, new CreateFloorCommand({
      floorId: id,
      ifcGuid: candidate.trace.globalId ?? id,
      polygon: analysis.polygonXZ,
      baseOffset: 0,
      thickness: Math.max(0.01, analysis.height),
      levelId: candidate.levelId!,
      label: candidate.trace.sourceMeshName ?? `IFC Floor ${candidate.trace.expressID}`,
      createdBy: 'ifc-import',
    }));

    if (!result?.success) {
      this.issues.push({ severity: 'error', sourceId: candidate.sourceId, message: `Floor command failed: ${result?.error ?? result?.info?.join(', ') ?? 'unknown error'}` });
      return undefined;
    }
    return id;
  }

  private convertCeiling(candidate: IfcConversionCandidate, analysis: RectangleAnalysis, dryRun: boolean): string | undefined {
    const id = makeUuid('ceiling-ifc');
    if (dryRun) return id;

    const result = executeHumanDirect(this.commandManager, new CreateCeilingCommand({
      ceilingId: id,
      ifcGuid: candidate.trace.globalId ?? id,
      polygon: analysis.polygonXZ,
      height: Math.max(0.01, analysis.maxY - analysis.minY),
      thickness: Math.max(0.01, analysis.height),
      baseOffset: 0,
      levelId: candidate.levelId!,
      label: candidate.trace.sourceMeshName ?? `IFC Ceiling ${candidate.trace.expressID}`,
      createdBy: 'ifc-import',
    }));

    if (!result?.success) {
      this.issues.push({ severity: 'error', sourceId: candidate.sourceId, message: `Ceiling command failed: ${result?.error ?? result?.info?.join(', ') ?? 'unknown error'}` });
      return undefined;
    }
    return id;
  }
}
