import { IfcConversionCandidate, IfcConversionIssue, RectangleAnalysis } from './IfcConversionTypes';

export interface NativeProxyRecord {
  id: string;
  type: 'native-proxy';
  displayName: string;
  category: string;
  levelId: string;
  position: { x: number; y: number; z: number };
  bounds: { width: number; depth: number; height: number };
  sourceModelId: string;
  sourceExpressID: number;
  rawIfcType: string;
  psets: Record<string, any>;
  createdAt: number;
}

const _proxyStore = new Map<string, NativeProxyRecord>();

export const nativeProxyStore = {
  add(record: NativeProxyRecord): void {
    _proxyStore.set(record.id, record);
  },
  getAll(): NativeProxyRecord[] {
    return Array.from(_proxyStore.values());
  },
  getById(id: string): NativeProxyRecord | undefined {
    return _proxyStore.get(id);
  },
  remove(id: string): void {
    _proxyStore.delete(id);
  },
  clear(): void {
    _proxyStore.clear();
  },
  get size(): number {
    return _proxyStore.size;
  },
};

export class IfcFallbackProxyConverter {
  constructor(private issues: IfcConversionIssue[]) {}

  convert(candidate: IfcConversionCandidate, analysis: RectangleAnalysis, dryRun: boolean): string {
    const id = `native-proxy-${candidate.sourceId}`;
    const displayName = candidate.trace.sourceMeshName
      ?? candidate.trace.ifcTypeName
      ?? candidate.trace.rawIfcType
      ?? `Unknown (${candidate.trace.expressID})`;

    if (!dryRun) {
      const record: NativeProxyRecord = {
        id,
        type: 'native-proxy',
        displayName,
        category: candidate.trace.rawIfcType ?? 'UNKNOWN',
        levelId: candidate.levelId ?? 'default-level',
        position: { x: analysis.center.x, y: analysis.minY, z: analysis.center.z },
        bounds: { width: analysis.width, depth: analysis.depth, height: analysis.height },
        sourceModelId: candidate.trace.modelId,
        sourceExpressID: candidate.trace.expressID,
        rawIfcType: candidate.trace.rawIfcType ?? 'UNKNOWN',
        psets: candidate.trace.psets ?? {},
        createdAt: Date.now(),
      };
      nativeProxyStore.add(record);
    }

    this.issues.push({
      severity: 'info',
      sourceId: candidate.sourceId,
      message: `"${displayName}" (${candidate.trace.rawIfcType ?? 'unknown'}) could not be fully converted and was registered as a native proxy. It remains selectable and traceable.`,
    });

    return id;
  }
}
