// converter.ts — pure function: PRYZM 1 snapshot → PRYZM 2 archive payload.
//
// Spec: SPEC-26 §1 archive shape; SPEC-02 §2 event-log shape; ADR-0031.
//
// Deterministic (given `ConvertOptions.fixedNow` + `ConvertOptions.clientId`)
// so the round-trip vitest fixtures can assert byte-stable output.  All
// element kinds the v0.1 CLI does not yet handle are recorded in
// `report.tier2Deferred` and `report.skipped`; the CLI prints both lists
// so users know exactly what they need to manually re-create in PRYZM 2.

import type {
  ConvertOptions,
  Pryzm1Snapshot,
  Pryzm2Archive,
  Pryzm2Event,
  Pryzm2MigrationReport,
} from './types.js';

const DEFAULT_CLIENT_ID = 'pryzm1-sunset-cli';

const TIER2_DEFERRED_KINDS: readonly string[] = [
  'columns',
  'beams',
  'stairs',
  'handrails',
  'ceilings',
  'roofs',
  'grids',
  'slabs',
  'windows',
  'curtainWalls',
  'furniture',
  'annotations',
];

export function convertPryzm1Snapshot(
  input: Pryzm1Snapshot,
  options: ConvertOptions = {},
): Pryzm2Archive {
  const clientId = options.clientId ?? DEFAULT_CLIENT_ID;
  const now = options.fixedNow ?? Date.now();

  const events: Pryzm2Event[] = [];
  const skipped: { kind: string; id: string; reason: string }[] = [];
  const warnings: string[] = [];
  const inputCounts: Record<string, number> = {};
  const outputCounts: Record<string, number> = {};

  let causalSeq = 0;

  // -- Levels first (walls reference levelId) ------------------------------
  if (input.levels !== undefined) {
    inputCounts.levels = input.levels.length;
    for (const level of input.levels) {
      if (level.id === '' || level.name === '') {
        skipped.push({ kind: 'level', id: level.id, reason: 'missing required field (id or name)' });
        continue;
      }
      events.push({
        type: 'level.create',
        clientId,
        timestamp: now,
        causalSeq: ++causalSeq,
        payload: {
          id: level.id,
          name: level.name,
          elevation: level.elevation,
        },
      });
    }
    outputCounts['level.create'] = (outputCounts['level.create'] ?? 0) + (input.levels.length - skipped.filter((s) => s.kind === 'level').length);
  }

  // -- Walls ---------------------------------------------------------------
  if (input.walls !== undefined) {
    inputCounts.walls = input.walls.length;
    for (const wall of input.walls) {
      if (wall.height <= 0 || wall.thickness <= 0) {
        skipped.push({
          kind: 'wall',
          id: wall.id,
          reason: `non-positive height (${wall.height}) or thickness (${wall.thickness})`,
        });
        continue;
      }
      const start = wall.start;
      const end = wall.end;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const dz = end.z - start.z;
      const lenSq = dx * dx + dy * dy + dz * dz;
      if (lenSq < 1e-12) {
        skipped.push({ kind: 'wall', id: wall.id, reason: 'zero-length baseline' });
        continue;
      }
      events.push({
        type: 'wall.create',
        clientId,
        timestamp: now,
        causalSeq: ++causalSeq,
        payload: {
          id: wall.id,
          start: { x: start.x, y: start.y, z: start.z },
          end: { x: end.x, y: end.y, z: end.z },
          height: wall.height,
          thickness: wall.thickness,
          ...(wall.levelId !== undefined ? { levelId: wall.levelId } : {}),
        },
      });
    }
    outputCounts['wall.create'] = (outputCounts['wall.create'] ?? 0) +
      (input.walls.length - skipped.filter((s) => s.kind === 'wall').length);
  }

  // -- Doors ---------------------------------------------------------------
  if (input.doors !== undefined) {
    inputCounts.doors = input.doors.length;
    const knownWallIds = new Set((input.walls ?? []).map((w) => w.id));
    for (const door of input.doors) {
      if (!knownWallIds.has(door.hostWallId)) {
        skipped.push({
          kind: 'door',
          id: door.id,
          reason: `host wall '${door.hostWallId}' not present in snapshot`,
        });
        continue;
      }
      if (door.position < 0 || door.position > 1) {
        skipped.push({
          kind: 'door',
          id: door.id,
          reason: `position ${door.position} outside [0..1]`,
        });
        continue;
      }
      if (door.width <= 0 || door.height <= 0) {
        skipped.push({
          kind: 'door',
          id: door.id,
          reason: `non-positive width (${door.width}) or height (${door.height})`,
        });
        continue;
      }
      events.push({
        type: 'door.create',
        clientId,
        timestamp: now,
        causalSeq: ++causalSeq,
        payload: {
          id: door.id,
          hostWallId: door.hostWallId,
          position: door.position,
          width: door.width,
          height: door.height,
        },
      });
    }
    outputCounts['door.create'] = (outputCounts['door.create'] ?? 0) +
      (input.doors.length - skipped.filter((s) => s.kind === 'door').length);
  }

  // -- Tier 2 deferral notice ---------------------------------------------
  const tier2Deferred: string[] = [];
  for (const kind of TIER2_DEFERRED_KINDS) {
    const value = (input as unknown as Record<string, unknown>)[kind];
    if (Array.isArray(value) && value.length > 0) {
      tier2Deferred.push(`${kind} (${value.length} elements)`);
      warnings.push(
        `Tier 2 element kind '${kind}' is deferred to v0.2 of @pryzm/pryzm1-sunset; ${value.length} elements were not converted.`,
      );
    }
  }

  if (input.schemaVersion < 1) {
    warnings.push(
      `Input schemaVersion ${input.schemaVersion} is below the v1 floor; the converter assumes v1-compatible field names.`,
    );
  }

  const report: Pryzm2MigrationReport = {
    inputElementCounts: Object.freeze({ ...inputCounts }),
    outputEventCounts: Object.freeze({ ...outputCounts }),
    skipped: Object.freeze([...skipped]),
    warnings: Object.freeze([...warnings]),
    tier2Deferred: Object.freeze([...tier2Deferred]),
  };

  return {
    formatVersion: 1,
    project: {
      id: input.project.id,
      name: input.project.name,
      createdAt: input.project.createdAt,
      updatedAt: input.project.updatedAt,
      migratedFrom: 'pryzm-1',
      migratedAt: new Date(now).toISOString(),
    },
    events: Object.freeze([...events]),
    migrationReport: report,
  };
}
