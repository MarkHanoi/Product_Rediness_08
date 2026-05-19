import { CreateWallOpeningCommand } from '@pryzm/command-registry';
import { executeHumanDirect, makeUuid } from './IfcConversionContext';
import { IfcConversionCandidate, IfcConversionIssue, RectangleAnalysis } from './IfcConversionTypes';
import { IfcOpeningHostResolver } from './IfcOpeningHostResolver';

export class IfcOpeningToNativeConverter {
  private resolver: IfcOpeningHostResolver;

  constructor(private commandManager: any, private issues: IfcConversionIssue[]) {
    this.resolver = new IfcOpeningHostResolver(commandManager);
  }

  convert(
    candidate: IfcConversionCandidate,
    analysis: RectangleAnalysis,
    dryRun: boolean,
    convertedWallIds: string[],
  ): string | undefined {
    if (!candidate.levelId) {
      this.issues.push({ severity: 'error', sourceId: candidate.sourceId, message: `${candidate.category} conversion skipped: no native level resolved.` });
      return undefined;
    }

    if (!convertedWallIds.length) {
      this.issues.push({ severity: 'warn', sourceId: candidate.sourceId, message: `${candidate.category} skipped: no converted native walls available as hosts.` });
      return undefined;
    }

    const id = makeUuid(`${candidate.category}-ifc`);
    if (dryRun) return id;

    const host = this.resolver.resolve(analysis, convertedWallIds);
    if (!host) {
      this.issues.push({ severity: 'warn', sourceId: candidate.sourceId, message: `${candidate.category} skipped: no compatible host wall found near element.` });
      return undefined;
    }

    const psets = candidate.trace.psets ?? {};
    const { width, height, sillHeight } = this.resolveDimensions(candidate.category, psets, analysis);

    const elementId = makeUuid(`${candidate.category}-el-ifc`);
    const openingData: Record<string, any> = {
      id,
      elementId,
      type: candidate.category === 'door' ? 'door' : 'window',
      offset: host.offset,
      width,
      height,
      sillHeight,
    };

    if (candidate.category === 'door') {
      openingData.fireRating = this.resolvePset(psets, 'Pset_DoorCommon', 'FireRating');
    } else {
      openingData.fireRating = this.resolvePset(psets, 'Pset_WindowCommon', 'FireRating');
    }

    const result = executeHumanDirect(this.commandManager, new CreateWallOpeningCommand({ wallId: host.wallId, openingData }));
    if (!result?.success) {
      this.issues.push({ severity: 'error', sourceId: candidate.sourceId, message: `${candidate.category} opening command failed: ${result?.error ?? result?.info?.join(', ') ?? 'unknown error'}` });
      return undefined;
    }

    if (host.confidence !== 'high') {
      this.issues.push({ severity: 'info', sourceId: candidate.sourceId, message: `${candidate.category} placed in wall ${host.wallId} with ${host.confidence} confidence.` });
    }

    return elementId;
  }

  private resolveDimensions(
    category: string,
    psets: Record<string, any>,
    analysis: RectangleAnalysis,
  ): { width: number; height: number; sillHeight: number; type: string } {
    const isDoor = category === 'door';
    const psetKey = isDoor ? 'Pset_DoorCommon' : 'Pset_WindowCommon';
    const qtoKey  = isDoor ? 'Qto_DoorBaseQuantities' : 'Qto_WindowBaseQuantities';

    const common = psets[psetKey] ?? {};
    const qto    = psets[qtoKey] ?? psets[qtoKey.replace('Quantities', '')] ?? {};

    // BUG-FIX: Revit frequently exports door/window dimensions under several
    // key spellings.  Exhaustively check them all before falling back to the
    // AABB, which is inflated by door swing geometry and frame components.
    // Priority: Qto quantities (exact values) > Pset common > geometry.
    const psetWidth = Number(
      qto['Width']         ??
      qto['OverallWidth']  ??
      common['Width']      ??
      common['OverallWidth'] ??
      common['NominalWidth'] ??
      0,
    );
    const psetHeight = Number(
      qto['Height']         ??
      qto['OverallHeight']  ??
      common['Height']      ??
      common['OverallHeight'] ??
      common['NominalHeight'] ??
      0,
    );

    // For geometry fallback, the shorter horizontal axis of the AABB better
    // approximates the opening width (the longer axis may include swing arc).
    const geomWidth  = Math.max(0.5, Math.min(analysis.width, analysis.depth));
    const geomHeight = Math.max(0.5, analysis.height);

    const width      = (psetWidth  > 0.2 && psetWidth  < 10) ? psetWidth  : geomWidth;
    const height     = (psetHeight > 0.2 && psetHeight < 10) ? psetHeight : geomHeight;
    const sillHeight = Number(
      qto['SillHeight']   ??
      qto['Threshold']    ??
      common['SillHeight'] ??
      0,
    ) || (isDoor ? 0 : 0.9);

    const type = String(common['Reference'] ?? common['ObjectType'] ?? (isDoor ? 'Single-Flush' : 'Fixed'));
    return { width, height, sillHeight, type };
  }

  private resolvePset(psets: Record<string, any>, key: string, field: string): string | undefined {
    const val = psets[key]?.[field];
    return val ? String(val) : undefined;
  }
}
