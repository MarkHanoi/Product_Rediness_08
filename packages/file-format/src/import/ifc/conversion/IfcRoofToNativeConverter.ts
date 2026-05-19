import { CreateRoofCommand } from '@pryzm/command-registry';
import { executeHumanDirect, makeUuid } from './IfcConversionContext';
import { IfcConversionCandidate, IfcConversionIssue, RectangleAnalysis } from './IfcConversionTypes';
import type { RoofType } from '@pryzm/geometry-roof';

export class IfcRoofToNativeConverter {
  constructor(private commandManager: any, private issues: IfcConversionIssue[]) {}

  convert(candidate: IfcConversionCandidate, analysis: RectangleAnalysis, dryRun: boolean): string | undefined {
    if (!candidate.levelId) {
      this.issues.push({ severity: 'error', sourceId: candidate.sourceId, message: 'Roof conversion skipped: no native level resolved.' });
      return undefined;
    }

    const id = makeUuid('roof-ifc');
    if (dryRun) return id;

    const psets = candidate.trace.psets ?? {};
    const roofType = this.resolveRoofType(psets, analysis);
    const slope = this.resolveSlope(psets, roofType);
    const thickness = this.resolveThickness(psets, analysis);
    const overhang = this.resolveOverhang(psets);
    const baseOffset = analysis.minY;

    const polygon: [number, number][] = [
      [analysis.minX, analysis.minZ],
      [analysis.maxX, analysis.minZ],
      [analysis.maxX, analysis.maxZ],
      [analysis.minX, analysis.maxZ],
    ];

    const centroid: [number, number] = [analysis.center.x, analysis.center.z];

    const result = executeHumanDirect(this.commandManager, new CreateRoofCommand(id, {
      levelId: candidate.levelId,
      footprint: { polygon, centroid },
      roofType,
      slope,
      overhang,
      baseOffset,
      thickness,
      autoBaseOffset: false,
    }));

    if (!result?.success) {
      this.issues.push({ severity: 'error', sourceId: candidate.sourceId, message: `Roof command failed: ${result?.error ?? result?.info?.join(', ') ?? 'unknown error'}` });
      return undefined;
    }
    return id;
  }

  private resolveRoofType(psets: Record<string, any>, analysis: RectangleAnalysis): RoofType {
    const predefined = this.findPredefinedType(psets);
    if (predefined) {
      if (predefined.includes('FLAT')) return 'flat';
      if (predefined.includes('SHED')) return 'shed';
      if (predefined.includes('GABLE')) return 'gable';
      if (predefined.includes('HIP')) return 'hip';
      if (predefined.includes('GAMBREL')) return 'gambrel';
      if (predefined.includes('MANSARD')) return 'mansard';
      if (predefined.includes('BARREL')) return 'barrel';
    }
    const h = analysis.height;
    const span = Math.max(analysis.width, analysis.depth);
    const slopeRatio = h / (span / 2);
    if (slopeRatio < 0.05) return 'flat';
    if (slopeRatio < 0.2) return 'shed';
    return 'gable';
  }

  private findPredefinedType(psets: Record<string, any>): string | undefined {
    for (const val of Object.values(psets)) {
      if (val && typeof val === 'object') {
        const pt = (val as any).PredefinedType ?? (val as any).predefinedType;
        if (pt) return String(pt).toUpperCase();
      }
    }
    return undefined;
  }

  private resolveSlope(psets: Record<string, any>, roofType: RoofType): number | undefined {
    if (roofType === 'flat') return undefined;
    for (const val of Object.values(psets)) {
      if (val && typeof val === 'object') {
        const s = Number((val as any).Slope ?? (val as any).slope ?? 0);
        if (s > 0 && s < 90) return s;
      }
    }
    return roofType === 'shed' ? 5 : 30;
  }

  private resolveThickness(psets: Record<string, any>, analysis: RectangleAnalysis): number {
    for (const val of Object.values(psets)) {
      if (val && typeof val === 'object') {
        const t = Number((val as any).Thickness ?? (val as any).thickness ?? 0);
        if (t > 0.01 && t < 2) return t;
      }
    }
    return Math.max(0.15, Math.min(0.5, analysis.height * 0.1));
  }

  private resolveOverhang(psets: Record<string, any>): number {
    for (const val of Object.values(psets)) {
      if (val && typeof val === 'object') {
        const o = Number((val as any).Overhang ?? (val as any).overhang ?? -1);
        if (o >= 0 && o < 3) return o;
      }
    }
    return 0.3;
  }
}
