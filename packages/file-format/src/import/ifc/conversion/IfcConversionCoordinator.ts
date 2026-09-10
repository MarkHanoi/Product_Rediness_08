import * as THREE from '@pryzm/renderer-three/three';
import { IfcClassifier } from './IfcClassifier';
import { IfcGeometryAnalyzer } from './IfcGeometryAnalyzer';
import { IfcStoreyLevelMapper } from './IfcStoreyLevelMapper';
import { IfcSpaceToNativeRoomConverter } from './IfcSpaceToNativeRoomConverter';
import { IfcWallToNativeConverter } from './IfcWallToNativeConverter';
import { IfcSlabToNativeConverter } from './IfcSlabToNativeConverter';
import { IfcColumnToNativeConverter } from './IfcColumnToNativeConverter';
import { IfcBeamToNativeConverter } from './IfcBeamToNativeConverter';
import { IfcOpeningToNativeConverter } from './IfcOpeningToNativeConverter';
import { IfcRoofToNativeConverter } from './IfcRoofToNativeConverter';
import { IfcCurtainWallToNativeConverter } from './IfcCurtainWallToNativeConverter';
import { IfcRailingToNativeConverter } from './IfcRailingToNativeConverter';
import { IfcFurnitureToNativeConverter } from './IfcFurnitureToNativeConverter';
import { IfcStairToNativeConverter } from './IfcStairToNativeConverter';
import { IfcFallbackProxyConverter } from './IfcFallbackProxyConverter';
import { ifcConversionReportStore } from './IfcConversionReportStore';
import { IFC_NATIVE_CATEGORIES, IfcConversionCandidate, IfcConversionOptions, IfcConversionReport, IfcConversionStats, IfcNativeCategory } from './IfcConversionTypes';
import { IfcConversionContext, getCommandContext } from './IfcConversionContext';

/**
 * L-13298 — the categories a converter is actually ROUTED for. Everything else the classifier
 * can yield is COUNTED as unsupported and REPORTED BY IFC TYPE NAME; it is never silently
 * skipped. Before this gate existed the loop iterated only these four (plus 'unsupported'),
 * and the other eleven categories left both the numerator and the denominator of every
 * summary — "100% converted, 0 failed" beside `Slabs 0 · Columns 0`.
 *
 * The gate is deliberately narrower than the `switch` below: the eleven converters the
 * switch names have never executed in production, and are routed in a separate commit so
 * the honesty of the count does not depend on the reachability of the converters.
 */
const ROUTED_CATEGORIES: ReadonlySet<IfcNativeCategory> = new Set<IfcNativeCategory>([
  'room', 'wall', 'door', 'window',
]);

/** The name the user recognises: the IFC entity type, upper-cased, never blank. */
function ifcTypeNameOf(candidate: IfcConversionCandidate): string {
  const raw = candidate.trace.ifcTypeName ?? candidate.trace.rawIfcType;
  const name = String(raw ?? '').trim().toUpperCase();
  return name || 'UNKNOWN-IFC-TYPE';
}

export class IfcConversionCoordinator {
  private classifier = new IfcClassifier();
  private analyzer = new IfcGeometryAnalyzer();

  constructor(private context: IfcConversionContext) {}

  run(options: Partial<IfcConversionOptions> = {}): IfcConversionReport {
    const startedAt = Date.now();
    const mergedOptions: IfcConversionOptions = {
      mode: options.mode ?? this.context.options.mode,
      modelId: options.modelId ?? this.context.options.modelId,
      selectedOnly: options.selectedOnly ?? this.context.options.selectedOnly,
      hideSourceMeshes: options.hideSourceMeshes ?? this.context.options.hideSourceMeshes ?? true,
    };
    const dryRun = mergedOptions.mode === 'dry-run';
    const issues: IfcConversionReport['issues'] = [];
    const stats: IfcConversionStats = {
      scanned: 0,
      candidates: 0,
      rooms: 0,
      walls: 0,
      slabs: 0,
      floors: 0,
      ceilings: 0,
      columns: 0,
      beams: 0,
      doors: 0,
      windows: 0,
      roofs: 0,
      curtainwalls: 0,
      railings: 0,
      furniture: 0,
      stairs: 0,
      proxies: 0,
      unsupported: 0,
      converted: 0,
      failed: 0,
      unsupportedByIfcType: {},
      unsupportedByCategory: {},
    };
    const createdElementIds: string[] = [];
    const sourceTraces: IfcConversionReport['sourceTraces'] = {};
    const candidates = this.collectCandidates(mergedOptions);
    stats.scanned = candidates.length;

    const levelMapper = new IfcStoreyLevelMapper(this.context.commandManager, this.context.bimManager, issues);
    const roomConverter = new IfcSpaceToNativeRoomConverter(this.context.commandManager, issues);
    const wallConverter = new IfcWallToNativeConverter(this.context.commandManager, issues);
    const slabConverter = new IfcSlabToNativeConverter(this.context.commandManager, issues);
    const columnConverter = new IfcColumnToNativeConverter(this.context.commandManager, issues);
    const beamConverter = new IfcBeamToNativeConverter(this.context.commandManager, issues);
    const openingConverter = new IfcOpeningToNativeConverter(this.context.commandManager, issues);
    const roofConverter = new IfcRoofToNativeConverter(this.context.commandManager, issues);
    const curtainWallConverter = new IfcCurtainWallToNativeConverter(this.context.commandManager, issues);
    const railingConverter = new IfcRailingToNativeConverter(this.context.commandManager, issues);
    const furnitureConverter = new IfcFurnitureToNativeConverter(this.context.commandManager, issues);
    const stairConverter = new IfcStairToNativeConverter(this.context.commandManager, issues);
    const proxyConverter = new IfcFallbackProxyConverter(issues);

    const analysisCache = new Map<string, ReturnType<IfcGeometryAnalyzer['analyse']>>();
    for (const candidate of candidates) {
      const analysis = this.analyzer.analyse(candidate.mesh);
      analysisCache.set(candidate.sourceId, analysis);
      sourceTraces[candidate.sourceId] = candidate.trace;
      candidate.levelId = analysis ? levelMapper.resolve(candidate, analysis.minY, dryRun) : undefined;
    }

    const convertedWallIds: string[] = [];

    // L-13298 — every scanned element takes EXACTLY ONE of three exits; the invariant
    // `scanned === converted + unsupported + failed` is asserted after the loop.
    const markUnsupported = (candidate: IfcConversionCandidate, cat: IfcNativeCategory, reason: string): void => {
      stats.unsupported++;
      const typeName = ifcTypeNameOf(candidate);
      stats.unsupportedByIfcType[typeName] = (stats.unsupportedByIfcType[typeName] ?? 0) + 1;
      stats.unsupportedByCategory[cat] = (stats.unsupportedByCategory[cat] ?? 0) + 1;
      issues.push({ severity: 'info', sourceId: candidate.sourceId, message: `Unsupported: ${typeName} (${cat}) — ${reason}` });
    };

    const grouped = new Map<IfcNativeCategory, IfcConversionCandidate[]>();
    for (const candidate of candidates) {
      const cat = candidate.category;
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(candidate);
    }

    // The iteration order IS the full category list (see IFC_NATIVE_CATEGORIES). Any category
    // the classifier yields that the list does not know is appended, never dropped.
    const order: IfcNativeCategory[] = [...IFC_NATIVE_CATEGORIES];
    for (const cat of grouped.keys()) if (!order.includes(cat)) order.push(cat);

    for (const cat of order) {
      const group = grouped.get(cat) ?? [];
      for (const candidate of group) {
        const analysis = analysisCache.get(candidate.sourceId);
        if (!analysis) {
          stats.failed++;
          issues.push({ severity: 'warn', sourceId: candidate.sourceId, message: `${ifcTypeNameOf(candidate)} (${cat}) has no usable bounding geometry.` });
          continue;
        }

        if (!ROUTED_CATEGORIES.has(cat)) {
          markUnsupported(candidate, cat, 'no converter is routed for this category; the element stays as IFC reference geometry.');
          continue;
        }

        stats.candidates++;
        const beforeIssueCount = issues.length;
        let nativeId: string | undefined;
        let outcome: 'converted' | 'unsupported' | 'failed' = 'failed';

        try {
          switch (cat) {
            case 'room':
              stats.rooms++;
              nativeId = roomConverter.convert(candidate, analysis, dryRun);
              break;
            case 'wall':
              stats.walls++;
              nativeId = wallConverter.convert(candidate, analysis, dryRun);
              if (nativeId) convertedWallIds.push(nativeId);
              break;
            case 'curtainwall':
              stats.curtainwalls++;
              nativeId = curtainWallConverter.convert(candidate, analysis, dryRun);
              if (nativeId) convertedWallIds.push(nativeId);
              break;
            case 'slab':
              stats.slabs++;
              nativeId = slabConverter.convert(candidate, analysis, dryRun);
              break;
            case 'floor':
              stats.floors++;
              nativeId = slabConverter.convert(candidate, analysis, dryRun);
              break;
            case 'ceiling':
              stats.ceilings++;
              nativeId = slabConverter.convert(candidate, analysis, dryRun);
              break;
            case 'column':
              stats.columns++;
              nativeId = columnConverter.convert(candidate, analysis, dryRun);
              break;
            case 'beam':
              stats.beams++;
              nativeId = beamConverter.convert(candidate, analysis, dryRun);
              break;
            case 'roof':
              stats.roofs++;
              nativeId = roofConverter.convert(candidate, analysis, dryRun);
              break;
            case 'door':
              stats.doors++;
              nativeId = openingConverter.convert(candidate, analysis, dryRun, convertedWallIds);
              break;
            case 'window':
              stats.windows++;
              nativeId = openingConverter.convert(candidate, analysis, dryRun, convertedWallIds);
              break;
            case 'railing':
              stats.railings++;
              nativeId = railingConverter.convert(candidate, analysis, dryRun);
              break;
            case 'furniture':
              stats.furniture++;
              nativeId = furnitureConverter.convert(candidate, analysis, dryRun);
              break;
            case 'stair': {
              stats.stairs++;
              // BUG-FIX: pass the level elevations alongside the topLevelId so
              // the stair converter can compute riserCount from the exact storey
              // height, avoiding the HEIGHT_TOLERANCE check failing in canExecute.
              const { topLevelId, levelElevations } = this.resolveTopLevel(candidate.levelId);
              nativeId = stairConverter.convert(candidate, analysis, dryRun, topLevelId, levelElevations);
              break;
            }
            case 'native-proxy': {
              // A proxy record is NOT a PRYZM element (C83 §2.1 — do not invent a kind): it is
              // a trace record in `nativeProxyStore`. Register it for the trace, count the
              // element as UNSUPPORTED BY NAME, and leave the source mesh visible — hiding it
              // would remove the user's geometry with nothing in its place.
              stats.proxies++;
              proxyConverter.convert(candidate, analysis, dryRun);
              markUnsupported(candidate, cat, 'no PRYZM element kind exists for this IFC type; registered as a reference proxy only.');
              outcome = 'unsupported';
              break;
            }
            default:
              markUnsupported(candidate, cat, 'no PRYZM element kind exists for this category.');
              outcome = 'unsupported';
              break;
          }
        } catch (err) {
          nativeId = undefined;
          issues.push({ severity: 'error', sourceId: candidate.sourceId, message: `${ifcTypeNameOf(candidate)} (${cat}) converter threw: ${err instanceof Error ? err.message : String(err)}` });
        }

        if (nativeId) outcome = 'converted';

        if (outcome === 'converted' && nativeId) {
          createdElementIds.push(nativeId);
          stats.converted++;
          candidate.mesh.userData.ifcConvertedNativeId = nativeId;
          candidate.mesh.userData.ifcSourceTrace = candidate.trace;
          if (!dryRun && mergedOptions.hideSourceMeshes) candidate.mesh.visible = false;
        } else if (outcome === 'failed') {
          stats.failed++;
          if (issues.length === beforeIssueCount) {
            issues.push({ severity: 'error', sourceId: candidate.sourceId, message: `${ifcTypeNameOf(candidate)} (${cat}) conversion failed without a detailed command error.` });
          }
        }
      }
    }

    // One WARN per unsupported IFC type, so the fidelity card (which shows warn/error only)
    // names what was left behind without a thousand identical per-element lines drowning a
    // real error. The per-element 'info' entries above keep the sourceId trace.
    for (const [typeName, n] of Object.entries(stats.unsupportedByIfcType).sort((a, b) => b[1] - a[1])) {
      issues.push({ severity: 'warn', message: `${n} × ${typeName} unsupported — left as IFC reference geometry, not converted.` });
    }

    // §CONTEXT-DATA-HONESTY — a scanned element that took none of the three exits is a DROP,
    // and a drop must never read as an absence. This cannot fire from the loop above (every
    // path increments exactly one counter); it is here so a future edit that breaks that
    // cannot break it silently.
    const accounted = stats.converted + stats.unsupported + stats.failed;
    if (accounted !== stats.scanned) {
      issues.push({ severity: 'error', message: `Accounting mismatch: scanned ${stats.scanned} ≠ converted ${stats.converted} + unsupported ${stats.unsupported} + failed ${stats.failed} (= ${accounted}). ${Math.abs(stats.scanned - accounted)} element(s) were dropped without being counted.` });
    }

    const report: IfcConversionReport = {
      id: `ifc-conversion-${startedAt}`,
      modelId: mergedOptions.modelId,
      mode: mergedOptions.mode,
      startedAt,
      completedAt: Date.now(),
      stats,
      createdElementIds,
      issues,
      sourceTraces,
    };

    ifcConversionReportStore.add(report);
    return report;
  }

  setConvertedSourceVisibility(visible: boolean, modelId?: string): number {
    let count = 0;
    this.context.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData?.source !== 'ifc-import') return;
      if (modelId && mesh.userData?.modelId !== modelId) return;
      if (!mesh.userData?.ifcConvertedNativeId) return;
      mesh.visible = visible;
      count++;
    });
    return count;
  }

  /**
   * Resolve the level directly above baseLevelId in the sorted level list.
   *
   * BUG-FIX (original): the old signature returned string | undefined and was
   * called with `this.resolveTopLevel(candidate.levelId)`. When it returned
   * undefined the stair converter silently fell back to the same base level ID,
   * which then blocked CreateStairCommand.canExecute().
   *
   * Now returns the top-level ID AND both elevations so the stair converter can
   * compute riserCount to exactly satisfy the HEIGHT_TOLERANCE check.
   */
  private resolveTopLevel(baseLevelId: string | undefined): {
    topLevelId: string | undefined;
    levelElevations: { baseLevelElevation: number; topLevelElevation: number } | undefined;
  } {
    if (!baseLevelId) return { topLevelId: undefined, levelElevations: undefined };

    try {
      // Try command context first, fall back to the injected bimManager
      const ctx = getCommandContext(this.context.commandManager);
      const bim = ctx?.bimManager ?? this.context.bimManager;

      let levels: any[] = [];
      if (bim?.getLevels) levels = bim.getLevels();

      // Also try wallStore as a secondary source in case bimManager returns an empty list
      if (!levels.length) {
        const stores = ctx?.stores;
        if (stores?.wallStore?.getLevels) levels = stores.wallStore.getLevels();
      }

      if (!levels.length) {
        console.warn('[IfcConversionCoordinator] resolveTopLevel: no levels available');
        return { topLevelId: undefined, levelElevations: undefined };
      }

      const sorted = [...levels].sort((a, b) => Number(a.elevation ?? 0) - Number(b.elevation ?? 0));
      const idx = sorted.findIndex((l) => l.id === baseLevelId);

      if (idx < 0) {
        console.warn(`[IfcConversionCoordinator] resolveTopLevel: baseLevelId "${baseLevelId}" not found in ${sorted.length} levels`);
        return { topLevelId: undefined, levelElevations: undefined };
      }

      if (idx + 1 >= sorted.length) {
        console.warn(`[IfcConversionCoordinator] resolveTopLevel: baseLevelId "${baseLevelId}" is the top-most level — no level above it`);
        return { topLevelId: undefined, levelElevations: undefined };
      }

      const baseLevel = sorted[idx];
      const topLevel = sorted[idx + 1];

      return {
        topLevelId: topLevel.id,
        levelElevations: {
          baseLevelElevation: Number(baseLevel.elevation ?? 0),
          topLevelElevation: Number(topLevel.elevation ?? 0),
        },
      };
    } catch (err) {
      console.warn('[IfcConversionCoordinator] resolveTopLevel error:', err);
    }

    return { topLevelId: undefined, levelElevations: undefined };
  }

  private collectCandidates(options: IfcConversionOptions): IfcConversionCandidate[] {
    if (options.selectedOnly) {
      const selected = this.context.selectionManager?.selectedObject;
      if (selected?.isMesh && selected.userData?.source === 'ifc-import') {
        return [this.classifier.toCandidate(selected)];
      }
      return [];
    }

    const candidates: IfcConversionCandidate[] = [];
    this.context.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData?.source !== 'ifc-import') return;
      if (options.modelId && mesh.userData?.modelId !== options.modelId) return;
      if (mesh.userData?.ifcConvertedNativeId && options.mode === 'convert') return;
      candidates.push(this.classifier.toCandidate(mesh));
    });
    return candidates;
  }
}
