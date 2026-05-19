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
import { IfcConversionCandidate, IfcConversionOptions, IfcConversionReport, IfcConversionStats } from './IfcConversionTypes';
import { IfcConversionContext, getCommandContext } from './IfcConversionContext';

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

    // ── Dependency order: rooms → walls → doors/windows only ──
    const ORDER: IfcConversionCandidate['category'][] = [
      'room', 'wall', 'door', 'window',
    ];

    const grouped = new Map<string, IfcConversionCandidate[]>();
    for (const cat of ORDER) grouped.set(cat, []);
    grouped.set('unsupported', []);

    for (const candidate of candidates) {
      const cat = candidate.category;
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(candidate);
    }

    for (const cat of [...ORDER, 'unsupported']) {
      const group = grouped.get(cat) ?? [];
      for (const candidate of group) {
        const analysis = analysisCache.get(candidate.sourceId);
        if (!analysis) {
          stats.failed++;
          issues.push({ severity: 'warn', sourceId: candidate.sourceId, message: 'Element has no usable bounding geometry.' });
          continue;
        }

        if (cat === 'unsupported') {
          stats.unsupported++;
          issues.push({ severity: 'info', sourceId: candidate.sourceId, message: `Unsupported IFC category: ${candidate.trace.ifcTypeName ?? candidate.trace.rawIfcType ?? 'unknown'}.` });
          continue;
        }

        stats.candidates++;
        const beforeIssueCount = issues.length;
        let nativeId: string | undefined;

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
          case 'native-proxy':
            stats.proxies++;
            nativeId = proxyConverter.convert(candidate, analysis, dryRun);
            break;
          default:
            stats.unsupported++;
            issues.push({ severity: 'info', sourceId: candidate.sourceId, message: `No converter for category: ${cat}` });
            break;
        }

        if (nativeId) {
          createdElementIds.push(nativeId);
          stats.converted++;
          candidate.mesh.userData.ifcConvertedNativeId = nativeId;
          candidate.mesh.userData.ifcSourceTrace = candidate.trace;
          if (!dryRun && mergedOptions.hideSourceMeshes) candidate.mesh.visible = false;
        } else if (cat !== 'native-proxy') {
          stats.failed++;
          if (issues.length === beforeIssueCount) {
            issues.push({ severity: 'error', sourceId: candidate.sourceId, message: 'Conversion failed without a detailed command error.' });
          }
        }
      }
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
