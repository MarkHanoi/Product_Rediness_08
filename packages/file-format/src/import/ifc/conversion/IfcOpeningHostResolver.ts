import * as THREE from '@pryzm/renderer-three/three';
import { RectangleAnalysis } from './IfcConversionTypes';

export interface ResolvedHost {
  wallId: string;
  offset: number;
  wallLength: number;
  confidence: 'high' | 'medium' | 'low';
}

export class IfcOpeningHostResolver {
  constructor(private commandManager: any) {}

  resolve(
    openingAnalysis: RectangleAnalysis,
    convertedWallIds: string[],
  ): ResolvedHost | undefined {
    if (!convertedWallIds.length) return undefined;

    const wallStore = this.getWallStore();
    if (!wallStore) return undefined;

    const openingCenterXZ = new THREE.Vector2(openingAnalysis.center.x, openingAnalysis.center.z);
    let bestWallId: string | undefined;
    let bestDist = Infinity;
    let bestOffset = 0;
    let bestLength = 0;

    for (const wallId of convertedWallIds) {
      const wall = wallStore.getById?.(wallId) ?? wallStore.walls?.get(wallId);
      if (!wall) continue;

      const startXZ = new THREE.Vector2(wall.baseLine?.[0]?.x ?? wall.start?.x ?? 0, wall.baseLine?.[0]?.z ?? wall.start?.z ?? 0);
      const endXZ = new THREE.Vector2(wall.baseLine?.[1]?.x ?? wall.end?.x ?? 0, wall.baseLine?.[1]?.z ?? wall.end?.z ?? 0);

      const wallVec = endXZ.clone().sub(startXZ);
      const wallLen = wallVec.length();
      if (wallLen < 0.01) continue;

      const wallDir = wallVec.clone().normalize();
      const toOpening = openingCenterXZ.clone().sub(startXZ);
      const projDist = toOpening.dot(wallDir);
      const perpDist = Math.abs(toOpening.x * wallDir.y - toOpening.y * wallDir.x);

      if (projDist < 0 || projDist > wallLen) continue;

      const halfThick = Math.max(0.05, (wall.thickness ?? 0.2)) / 2 + 0.5;
      if (perpDist > halfThick) continue;

      const totalDist = perpDist + Math.abs(projDist - wallLen / 2) * 0.01;
      if (totalDist < bestDist) {
        bestDist = totalDist;
        bestWallId = wallId;
        bestOffset = Math.max(0, projDist - openingAnalysis.width / 2);
        bestLength = wallLen;
      }
    }

    if (!bestWallId) return undefined;

    return {
      wallId: bestWallId,
      offset: bestOffset,
      wallLength: bestLength,
      confidence: bestDist < 0.1 ? 'high' : bestDist < 0.3 ? 'medium' : 'low',
    };
  }

  private getWallStore(): any {
    try {
      if (this.commandManager?.getContext) {
        const ctx = this.commandManager.getContext();
        return ctx?.stores?.wallStore;
      }
    } catch { /* ignore */ }
    return undefined;
  }
}
