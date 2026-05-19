import { CreateStairCommand } from '@pryzm/command-registry';
import { executeHumanDirect, makeUuid } from './IfcConversionContext';
import { IfcConversionCandidate, IfcConversionIssue, RectangleAnalysis } from './IfcConversionTypes';

export class IfcStairToNativeConverter {
  constructor(private commandManager: any, private issues: IfcConversionIssue[]) {}

  convert(
    candidate: IfcConversionCandidate,
    analysis: RectangleAnalysis,
    dryRun: boolean,
    topLevelId: string | undefined,
    levelElevations?: { baseLevelElevation: number; topLevelElevation: number },
  ): string | undefined {
    if (!candidate.levelId) {
      this.issues.push({ severity: 'error', sourceId: candidate.sourceId, message: 'Stair conversion skipped: no native base level resolved.' });
      return undefined;
    }

    // BUG-FIX: when resolveTopLevel() cannot find the adjacent level it returns
    // undefined, which previously caused topLevelId to silently default to the
    // same value as baseLevelId.  CreateStairCommand.canExecute() then blocks
    // with "Base level and top level cannot be the same" and no stair is ever
    // created.  Log a clear error and bail rather than passing a broken command.
    if (!topLevelId || topLevelId === candidate.levelId) {
      this.issues.push({ severity: 'error', sourceId: candidate.sourceId, message: 'Stair conversion skipped: could not resolve an adjacent top level distinct from the base level. Check that levels are correctly mapped from IFC storeys.' });
      return undefined;
    }

    const id = makeUuid('stair-ifc');
    if (dryRun) return id;

    const psets = candidate.trace.psets ?? {};
    const { riserHeight, treadDepth, riserCount } = this.resolveStairParams(
      psets,
      analysis,
      levelElevations,
    );
    const width = this.resolveWidth(psets, analysis);

    const dx = analysis.maxX - analysis.minX;
    const dz = analysis.maxZ - analysis.minZ;
    const runLength = Math.sqrt(dx * dx + dz * dz);
    const dirX = runLength > 0.01 ? dx / runLength : 1;
    const dirZ = runLength > 0.01 ? dz / runLength : 0;

    const startPosition = { x: analysis.minX, y: analysis.minY, z: analysis.minZ };

    const result = executeHumanDirect(this.commandManager, new CreateStairCommand({
      baseLevelId: candidate.levelId,
      topLevelId,
      shape: 'I',
      riserHeight,
      treadDepth,
      width,
      startPosition,
      flights: [{ direction: { x: dirX, y: riserHeight / treadDepth, z: dirZ }, riserCount }],
    }));

    if (!result?.success) {
      const reason = result?.error ?? result?.info?.join(', ') ?? 'unknown error';
      this.issues.push({ severity: 'error', sourceId: candidate.sourceId, message: `Stair command failed: ${reason}` });
      console.warn(`[IfcStairToNativeConverter] Stair blocked — ${reason}`, {
        baseLevelId: candidate.levelId,
        topLevelId,
        riserHeight,
        treadDepth,
        riserCount,
        width,
      });
      return undefined;
    }

    this.issues.push({ severity: 'info', sourceId: candidate.sourceId, message: 'Stair converted as straight (I-shape). Complex/multi-flight stairs may need manual review.' });
    return id;
  }

  private resolveStairParams(
    psets: Record<string, any>,
    analysis: RectangleAnalysis,
    levelElevations?: { baseLevelElevation: number; topLevelElevation: number },
  ): { riserHeight: number; treadDepth: number; riserCount: number } {
    const common = psets['Pset_StairCommon'] ?? psets['Pset_StairFlightCommon'] ?? {};
    const qto = psets['Qto_StairBaseQuantities'] ?? psets['Qto_StairFlightBaseQuantities'] ?? {};

    const riserHeight = Number(common['RiserHeight'] ?? common['NominalRiserHeight'] ?? qto['RiserHeight'] ?? 0) || 0.175;
    const treadDepth = Number(common['TreadDepth'] ?? common['NominalTreadDepth'] ?? qto['TreadDepth'] ?? 0) || 0.28;
    const numberOfRisers = Number(common['NumberOfRisers'] ?? common['NumberOfTreads'] ?? qto['NumberOfRisers'] ?? 0);

    let riserCount: number;

    if (numberOfRisers > 1) {
      // Authoritative value from psets
      riserCount = Math.round(numberOfRisers);
    } else if (levelElevations) {
      // BUG-FIX: compute riserCount from the actual level height rather than
      // from analysis.height (AABB extent).  The geometry height rarely matches
      // the storey height precisely, which causes the HEIGHT_TOLERANCE check in
      // CreateStairCommand.canExecute() to block the command.  By basing
      // riserCount on the true level-to-level distance, calculatedHeight is
      // guaranteed to be within one riser of the storey height — within the
      // 50 mm tolerance for any reasonable riser height (≥ 150 mm).
      const levelHeight = Math.abs(levelElevations.topLevelElevation - levelElevations.baseLevelElevation);
      riserCount = Math.max(2, Math.round(levelHeight / riserHeight));
    } else {
      riserCount = Math.max(3, Math.round(analysis.height / riserHeight));
    }

    return { riserHeight, treadDepth, riserCount };
  }

  private resolveWidth(psets: Record<string, any>, analysis: RectangleAnalysis): number {
    const common = psets['Pset_StairCommon'] ?? psets['Pset_StairFlightCommon'] ?? {};
    const qto = psets['Qto_StairBaseQuantities'] ?? {};
    const w = Number(common['Width'] ?? qto['Width'] ?? qto['MinimumWidth'] ?? 0);
    return w > 0.3 ? w : Math.max(0.6, Math.min(analysis.width, analysis.depth));
  }
}
