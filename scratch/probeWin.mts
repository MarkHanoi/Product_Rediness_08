import { resolveUtterance, type ResolverContext } from '../packages/ai-host/src/intents/ZeroTokenResolver.js';
const IDS = ['A-w1','B-w1','C-w1'];
const mk = (activeLevelId: string | undefined) => ({
  selection: [], activeLevelId,
  levels: [{ id: 'L0', name: 'Level 0', elevation: 0 }, { id: 'L1', name: 'Level 1', elevation: 3 }],
  mintId: () => 'id-1',
  rooms: [{ id: 'r1', name: 'Kitchen', roomNumber: '00-001', levelId: 'L0' }],
  resolveScope: (_s: any) => ({ ids: IDS, kindCounts: { wall: 3 }, skipped: [], diagnostics: ['Level 0'] }),
} as unknown as ResolverContext);
const ctx = mk('L0');
const cases: [string, ResolverContext][] = [
  ['create windows on all walls', ctx],
  ['create windows on all walls in the kitchen', ctx],
  ['create windows on all walls in block b', ctx],
  ['create windows on all walls on the south facade', ctx],
  ['create windows on all walls on this floor', mk(undefined)],
];
for (const [s, c] of cases) {
  const r: any = resolveUtterance(s, c);
  console.log(`\n=== "${s}"`);
  console.log(JSON.stringify(r, null, 1).slice(0, 700));
}
