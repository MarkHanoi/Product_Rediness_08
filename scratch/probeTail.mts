import { parseTrailingSpatialScope, matchTrailingSpatialScope } from '../packages/ai-host/src/intents/SpatialScopeTail.js';
const ctx = { selection: [], activeLevelId: 'L0', levels: [{ id: 'L0', name: 'Level 0', elevation: 0 }], mintId: () => 'x',
  rooms: [{ id: 'r1', name: 'Kitchen', roomNumber: '00-001', levelId: 'L0' }] } as any;
for (const s of [
  'create windows on all walls in the kitchen',
  'create windows on all walls in block b',
  'create windows on all walls of every building',
  'create windows on all walls in house 2',
  'create windows on all walls on level 0',
  'create windows on all walls',
]) {
  const r = parseTrailingSpatialScope(s, ctx);
  const m = matchTrailingSpatialScope(s, ctx);
  console.log(`"${s}"\n   reading=${JSON.stringify(r)}  matchStart=${m?.start ?? '-'}`);
}
