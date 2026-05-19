import { CreateHandrailCommand } from '@pryzm/command-registry';
import { executeHumanDirect, makeUuid } from './IfcConversionContext';
import { IfcConversionCandidate, IfcConversionIssue, RectangleAnalysis } from './IfcConversionTypes';
import { IfcGeometryAnalyzer } from './IfcGeometryAnalyzer';

export class IfcRailingToNativeConverter {
  constructor(private commandManager: any, private issues: IfcConversionIssue[]) {}

  convert(candidate: IfcConversionCandidate, analysis: RectangleAnalysis, dryRun: boolean): string | undefined {
    if (!candidate.levelId) {
      this.issues.push({ severity: 'error', sourceId: candidate.sourceId, message: 'Railing conversion skipped: no native level resolved.' });
      return undefined;
    }

    const id = makeUuid('handrail-ifc');
    if (dryRun) return id;

    const analyzer = new IfcGeometryAnalyzer();
    const baseline = analyzer.wallBaseline(analysis);
    const psets = candidate.trace.psets ?? {};

    const height = this.resolveHeight(psets, analysis);
    const thickness = this.resolveThickness(psets, analysis);
    const fillType = this.resolveFillType(psets);
    const materialColor = this.resolveMaterialColor(psets);

    const result = executeHumanDirect(this.commandManager, new CreateHandrailCommand({
      id,
      start: baseline.start,
      end: baseline.end,
      height,
      thickness,
      levelId: candidate.levelId,
      baseOffset: 0,
      fillType,
      materialColor,
    }));

    if (!result?.success) {
      this.issues.push({ severity: 'error', sourceId: candidate.sourceId, message: `Handrail command failed: ${result?.error ?? result?.info?.join(', ') ?? 'unknown error'}` });
      return undefined;
    }

    return id;
  }

  private resolveHeight(psets: Record<string, any>, analysis: RectangleAnalysis): number {
    for (const val of Object.values(psets)) {
      if (val && typeof val === 'object') {
        const h = Number((val as any).Height ?? (val as any).height ?? (val as any).HandrailHeight ?? 0);
        if (h >= 0.3 && h <= 2.5) return h;
      }
    }
    return Math.min(2.5, Math.max(0.3, analysis.height));
  }

  private resolveThickness(psets: Record<string, any>, analysis: RectangleAnalysis): number {
    for (const val of Object.values(psets)) {
      if (val && typeof val === 'object') {
        const t = Number((val as any).Thickness ?? (val as any).thickness ?? (val as any).Diameter ?? 0);
        if (t > 0.01 && t < 0.5) return t;
      }
    }
    return Math.max(0.04, Math.min(0.15, Math.min(analysis.width, analysis.depth)));
  }

  private resolveFillType(psets: Record<string, any>): string {
    for (const val of Object.values(psets)) {
      if (val && typeof val === 'object') {
        const t = String((val as any).FillType ?? (val as any).fillType ?? (val as any).BalusterType ?? '').toLowerCase();
        if (t.includes('glass')) return 'glass';
        if (t.includes('panel')) return 'panel';
        if (t.includes('baluster') || t.includes('bar') || t.includes('steel')) return 'baluster';
      }
    }
    return 'baluster';
  }

  private resolveMaterialColor(psets: Record<string, any>): string | undefined {
    for (const val of Object.values(psets)) {
      if (val && typeof val === 'object') {
        const c = (val as any).MaterialColor ?? (val as any).Colour ?? (val as any).Color;
        if (c && typeof c === 'string' && c.startsWith('#')) return c;
      }
    }
    return '#808080';
  }
}
