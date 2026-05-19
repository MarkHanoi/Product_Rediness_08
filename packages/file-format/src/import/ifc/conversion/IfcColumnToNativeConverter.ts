import { CreateColumnCommand } from '@pryzm/command-registry';
import { executeHumanDirect, makeUuid } from './IfcConversionContext';
import { IfcConversionCandidate, IfcConversionIssue, RectangleAnalysis } from './IfcConversionTypes';
import { IfcGeometryAnalyzer } from './IfcGeometryAnalyzer';

export class IfcColumnToNativeConverter {
  constructor(private commandManager: any, private issues: IfcConversionIssue[]) {}

  convert(candidate: IfcConversionCandidate, analysis: RectangleAnalysis, dryRun: boolean): string | undefined {
    if (!candidate.levelId) {
      this.issues.push({ severity: 'error', sourceId: candidate.sourceId, message: 'Column conversion skipped: no native level could be resolved.' });
      return undefined;
    }

    const id = makeUuid('column-ifc');
    if (dryRun) return id;

    const psets = candidate.trace.psets ?? {};
    const height = this.resolveHeight(psets, analysis);
    const { width, depth, profile, rotation } = this.resolveProfile(psets, analysis);
    const position = {
      x: analysis.center.x,
      y: analysis.minY,
      z: analysis.center.z,
    };

    const result = executeHumanDirect(this.commandManager, new CreateColumnCommand({
      id,
      position,
      height,
      rotation,
      profile,
      width,
      depth,
      baseOffset: 0,
      levelId: candidate.levelId,
    }));

    if (!result?.success) {
      this.issues.push({ severity: 'error', sourceId: candidate.sourceId, message: `Column command failed: ${result?.error ?? result?.info?.join(', ') ?? 'unknown error'}` });
      return undefined;
    }
    return id;
  }

  private resolveHeight(psets: Record<string, any>, analysis: RectangleAnalysis): number {
    const qto = psets['Qto_ColumnBaseQuantities'] ?? psets['Qto_Column'] ?? {};
    const h = Number(qto['Height'] ?? qto['height'] ?? qto['Length'] ?? qto['length'] ?? 0);
    return h > 0.1 ? h : Math.max(0.2, analysis.height);
  }

  private resolveProfile(psets: Record<string, any>, analysis: RectangleAnalysis): { width: number; depth: number; profile: 'rectangular' | 'circular'; rotation: number } {
    const qto = psets['Qto_ColumnBaseQuantities'] ?? psets['Qto_Column'] ?? {};
    const psetCommon = psets['Pset_ColumnCommon'] ?? {};

    const qtoWidth = Number(qto['Width'] ?? qto['width'] ?? 0);
    const qtoDepth = Number(qto['Depth'] ?? qto['depth'] ?? 0);
    const width = qtoWidth > 0.01 ? qtoWidth : Math.max(0.1, analysis.width);
    const depth = qtoDepth > 0.01 ? qtoDepth : Math.max(0.1, analysis.depth);

    const analyzer = new IfcGeometryAnalyzer();
    const isCircular = String(psetCommon['CrossSectionArea'] ?? psetCommon['Shape'] ?? analysis.width < 0.01 ? '' : '').toUpperCase().includes('CIRCULAR');
    const profile: 'rectangular' | 'circular' = isCircular ? 'circular' : 'rectangular';

    const baseline = analyzer.wallBaseline(analysis);
    const dx = baseline.end.x - baseline.start.x;
    const dz = baseline.end.z - baseline.start.z;
    const rotation = Math.atan2(dz, dx);

    return { width, depth, profile, rotation };
  }
}
