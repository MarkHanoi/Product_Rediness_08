/**
 * tools/perf/outer/seedSnapshot.mjs — shared seed-snapshot builder (LANE BASE-OUTER).
 *
 * Builds a schemaVersion-5 ProjectSnapshot with nRooms closed 4-wall rooms on a
 * grid (nRooms*4 walls, one level). Shape verified against
 * apps/editor/src/engine/persistence/ProjectSerializer.ts (serializeWall) and
 * ProjectLoader.ts (level/wall restore + the 15 arrays the loader dereferences
 * without optional chaining — all 15 must be present or load() throws).
 */
export function buildSeedSnapshot(nRooms = 75) {
  const walls = [];
  const W = 6, H = 4, GAP = 4, perRow = 10;
  for (let i = 0; i < nRooms; i++) {
    const gx = (i % perRow) * (W + GAP), gz = Math.floor(i / perRow) * (H + GAP);
    const corners = [[gx, gz], [gx + W, gz], [gx + W, gz + H], [gx, gz + H]];
    for (let e = 0; e < 4; e++) {
      const a = corners[e], b = corners[(e + 1) % 4];
      walls.push({
        id: `wall-seed-${i}-${e}`, type: 'basic', levelId: 'level-0',
        baseLine: [{ x: a[0], y: 0, z: a[1] }, { x: b[0], y: 0, z: b[1] }],
        height: 3, thickness: 0.2, baseOffset: 0,
        materialColor: '#cccccc', openings: [], childrenIds: [],
      });
    }
  }
  return {
    schemaVersion: 5,
    levels: [{ id: 'level-0', name: 'Level 0', elevation: 0, height: 3 }],
    grids: [], walls, windows: [], doors: [], slabs: [], columns: [], beams: [],
    stairs: [], roofs: [], curtainWalls: [], curtainPanels: [], handrails: [],
    plumbing: [], furniture: [],
  };
}
