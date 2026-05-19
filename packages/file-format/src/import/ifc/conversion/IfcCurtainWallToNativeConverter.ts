import { CreateCurtainWallCommand } from '@pryzm/command-registry';
import { executeHumanDirect, makeUuid } from './IfcConversionContext';
import { IfcConversionCandidate, IfcConversionIssue, RectangleAnalysis } from './IfcConversionTypes';
import { IfcGeometryAnalyzer } from './IfcGeometryAnalyzer';

export class IfcCurtainWallToNativeConverter {
  constructor(private commandManager: any, private issues: IfcConversionIssue[]) {}

  convert(candidate: IfcConversionCandidate, analysis: RectangleAnalysis, dryRun: boolean): string | undefined {
    if (!candidate.levelId) {
      this.issues.push({ severity: 'error', sourceId: candidate.sourceId, message: 'Curtain wall conversion skipped: no native level resolved.' });
      return undefined;
    }

    const id = makeUuid('curtainwall-ifc');
    if (dryRun) return id;

    const analyzer = new IfcGeometryAnalyzer();
    const psets = candidate.trace.psets ?? {};
    const baseline = analyzer.wallBaseline(analysis, psets);
    const height = this.resolveHeight(psets, analysis);
    const gridXSpacing = this.resolveGridSpacing(psets, 'x') ?? 1.5;
    const gridYSpacing = this.resolveGridSpacing(psets, 'y') ?? 1.2;

    const result = executeHumanDirect(this.commandManager, new CreateCurtainWallCommand({
      id,
      start: baseline.start,
      end: baseline.end,
      height,
      levelId: candidate.levelId,
      gridXSpacing,
      gridYSpacing,
      baseOffset: 0,
    }));

    if (!result?.success) {
      this.issues.push({ severity: 'error', sourceId: candidate.sourceId, message: `Curtain wall command failed: ${result?.error ?? result?.info?.join(', ') ?? 'unknown error'}` });
      return undefined;
    }

    this.issues.push({ severity: 'info', sourceId: candidate.sourceId, message: 'Curtain wall converted with approximate grid parameters. Member/plate sub-elements preserved in source trace.' });
    return id;
  }

  private resolveHeight(psets: Record<string, any>, analysis: RectangleAnalysis): number {
    for (const val of Object.values(psets)) {
      if (val && typeof val === 'object') {
        const h = Number((val as any).Height ?? (val as any).height ?? (val as any).OverallHeight ?? 0);
        if (h > 0.1) return h;
      }
    }
    return Math.max(0.2, analysis.height);
  }

  private resolveGridSpacing(psets: Record<string, any>, axis: 'x' | 'y'): number | undefined {
    const fieldNames = axis === 'x'
      ? ['GridHSpacing', 'HorizontalSpacing', 'MullionSpacingX']
      : ['GridVSpacing', 'VerticalSpacing', 'MullionSpacingY'];
    for (const val of Object.values(psets)) {
      if (val && typeof val === 'object') {
        for (const field of fieldNames) {
          const v = Number((val as any)[field] ?? 0);
          if (v > 0.1 && v < 10) return v;
        }
      }
    }
    return undefined;
  }
}
