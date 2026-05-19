/**
 * Default parameter values for new RoomRequirements.
 * All defaults reflect a generic office/commercial room.
 * Commands and AI Auto-Briefer override these with actual brief values.
 */

import { RoomRequirement } from '@pryzm/core-app-model';

export function buildDefaultRequirement(
  id: string,
  roomId: string,
  levelId: string,
  name: string,
): RoomRequirement {
  const now = Date.now();
  return {
    id,
    type: 'RoomRequirement',
    roomId,
    levelId,
    name,
    department: undefined,
    templateId: undefined,
    status: 'active',
    overriddenFields: [],
    parameters: {
      spatial: {
        targetArea_m2:     20,
        areaTolerance_pct: 5,
        clearHeight_mm:    2700,
        aspectRatioMax:    3,
      },
      physics: {
        stc_db:   45,
        lux_task: 300,
        ach:      6,
        targetTemp_c:    21,
        tempTolerance_c: 2,
      },
      finishes: {
        floorFinish:  'Carpet-Commercial',
        wallFinish:   'Latex-Eggshell-White',
        ceilingType:  'ACT-Grid-600x600',
        skirtingHeight_mm: 100,
      },
      assets: {
        requiredAssets:   [],
        powerSockets:     4,
        dataPorts:        2,
        plumbingFixtures: 0,
      },
      safety: {
        maxEgressDist_m:  45,
        turningCircle_mm: 1500,
        sprinklerCount:   1,
        fireRating_min:   60,
      },
    },
    metadata: {
      createdAt:  now,
      modifiedAt: now,
      createdBy:  'system',
      version:    1,
    },
  };
}
