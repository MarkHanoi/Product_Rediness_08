import { CreateBeamCommand } from '@pryzm/command-registry';
import { executeHumanDirect, makeUuid } from './IfcConversionContext';
import { IfcConversionCandidate, IfcConversionIssue, RectangleAnalysis } from './IfcConversionTypes';
import { IfcGeometryAnalyzer } from './IfcGeometryAnalyzer';

/**
 * Hard cap on beam cross-section dimensions (metres).
 * Structural steel deep sections top out around 1.0 m; concrete beams rarely
 * exceed 1.5 m.  Without this cap, AABB inflation on diagonal beams produces
 * absurd values.
 */
const MAX_SECTION_DIM = 1.0;

export class IfcBeamToNativeConverter {
  constructor(private commandManager: any, private issues: IfcConversionIssue[]) {}

  convert(candidate: IfcConversionCandidate, analysis: RectangleAnalysis, dryRun: boolean): string | undefined {
    if (!candidate.levelId) {
      this.issues.push({ severity: 'error', sourceId: candidate.sourceId, message: 'Beam conversion skipped: no native level could be resolved.' });
      return undefined;
    }

    const id = makeUuid('beam-ifc');
    if (dryRun) return id;

    const psets = candidate.trace.psets ?? {};
    const { startPoint, endPoint } = this.resolveBaseline(analysis);
    const { width, depth }         = this.resolveSection(psets, analysis);

    const material    = this.resolveMaterial(psets);
    const loadBearing = this.resolveLoadBearing(psets);
    const fireRating  = this.resolveFireRating(psets);

    const result = executeHumanDirect(this.commandManager, new CreateBeamCommand({
      startPoint,
      endPoint,
      width,
      depth,
      levelId: candidate.levelId,
      material,
      loadBearing,
      fireRating,
    }));

    if (!result?.success) {
      this.issues.push({ severity: 'error', sourceId: candidate.sourceId, message: `Beam command failed: ${result?.error ?? result?.info?.join(', ') ?? 'unknown error'}` });
      return undefined;
    }

    const beamId = result.affectedElementIds?.[0] ?? id;
    return beamId;
  }

  private resolveBaseline(analysis: RectangleAnalysis): {
    startPoint: { x: number; y: number; z: number };
    endPoint:   { x: number; y: number; z: number };
  } {
    const analyzer = new IfcGeometryAnalyzer();
    const baseline = analyzer.wallBaseline(analysis);
    const y = analysis.center.y;
    return {
      startPoint: { x: baseline.start.x, y, z: baseline.start.z },
      endPoint:   { x: baseline.end.x,   y, z: baseline.end.z },
    };
  }

  private resolveSection(
    psets: Record<string, any>,
    analysis: RectangleAnalysis,
  ): { width: number; depth: number } {
    // --- Pset / Qto values (preferred — exact IFC-authored dimensions) ---
    const qto        = psets['Qto_BeamBaseQuantities'] ?? psets['Qto_Beam'] ?? {};
    const profilePset = psets['Pset_ProfileProperties'] ?? psets['Pset_BeamCommon'] ?? {};

    const psetW = Number(qto['Width']  ?? qto['width']  ?? profilePset['FlangeWidth'] ?? profilePset['Width']  ?? 0);
    const psetD = Number(qto['Depth']  ?? qto['depth']  ?? profilePset['Depth']       ?? profilePset['Height'] ?? 0);

    // --- Geometry fallback ---
    // PCA secondary extent = true lateral width of the beam (perpendicular to its
    // run direction in XZ).  This is correct even for diagonal beams because PCA
    // extracts the true perpendicular, not the inflated AABB axis.
    // Beam vertical depth comes from the Y (height) AABB extent.
    const pcaWidth  = analysis.pcaSecondaryExtent !== undefined
      ? Math.min(MAX_SECTION_DIM, Math.max(0.05, analysis.pcaSecondaryExtent))
      : Math.min(MAX_SECTION_DIM, Math.max(0.05, Math.min(analysis.width, analysis.depth)));

    const geomDepth = Math.min(MAX_SECTION_DIM, Math.max(0.05, analysis.height));

    return {
      width: (psetW > 0.01 && psetW <= MAX_SECTION_DIM) ? psetW : pcaWidth,
      depth: (psetD > 0.01 && psetD <= MAX_SECTION_DIM) ? psetD : geomDepth,
    };
  }

  private resolveMaterial(psets: Record<string, any>): string | undefined {
    const common = psets['Pset_BeamCommon'] ?? {};
    return common['Material'] ?? common['MaterialLabel'] ?? undefined;
  }

  private resolveLoadBearing(psets: Record<string, any>): boolean {
    const common = psets['Pset_BeamCommon'] ?? {};
    const val = common['LoadBearing'] ?? common['IsLoadBearing'];
    if (val === undefined || val === null) return true;
    return val === true || val === 'true' || val === 1;
  }

  private resolveFireRating(psets: Record<string, any>): string | undefined {
    const common = psets['Pset_BeamCommon'] ?? {};
    const fr = common['FireRating'];
    return fr ? String(fr) : undefined;
  }
}
