import { CreateWallCommand } from '@pryzm/command-registry';
import { executeHumanDirect, makeUuid } from './IfcConversionContext';
import { IfcConversionCandidate, IfcConversionIssue, RectangleAnalysis } from './IfcConversionTypes';
import { IfcGeometryAnalyzer } from './IfcGeometryAnalyzer';

export class IfcWallToNativeConverter {
  constructor(private commandManager: any, private issues: IfcConversionIssue[]) {}

  convert(candidate: IfcConversionCandidate, analysis: RectangleAnalysis, dryRun: boolean): string | undefined {
    if (!candidate.levelId) {
      this.issues.push({ severity: 'error', sourceId: candidate.sourceId, message: 'Wall conversion skipped because no native level could be resolved.' });
      return undefined;
    }

    const id = makeUuid('wall-ifc');
    if (dryRun) return id;

    const analyzer = new IfcGeometryAnalyzer();
    // BUG-FIX: pass psets so wallBaseline() reads the authoritative IFC
    // thickness from Qto_WallBaseQuantities.Width instead of AABB extents.
    // AABB-derived thickness is badly wrong for diagonal walls.
    const psets = candidate.trace.psets ?? {};
    const baseline = analyzer.wallBaseline(analysis, psets);

    const result = executeHumanDirect(this.commandManager, new CreateWallCommand(id, {
      start: baseline.start,
      end: baseline.end,
      height: Math.max(0.2, analysis.height),
      thickness: baseline.thickness,
      levelId: candidate.levelId,
      baseOffset: 0,
      materialColor: '#a8a8a8',
    }));

    if (!result?.success) {
      this.issues.push({ severity: 'error', sourceId: candidate.sourceId, message: `Wall command failed: ${result?.error ?? result?.info?.join(', ') ?? 'unknown error'}` });
      return undefined;
    }
    return id;
  }
}
