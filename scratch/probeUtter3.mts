import { resolveUtterance, type ResolverContext } from '../packages/ai-host/src/intents/ZeroTokenResolver.js';
const IDS = ['A-w1','B-w1','C-w1'];
const ctx = {
  selection: [], activeLevelId: 'L0',
  levels: [{ id: 'L0', name: 'Level 0', elevation: 0 }],
  mintId: () => 'id-1',
  rooms: [{ id: 'r1', name: 'Kitchen', roomNumber: '00-001', levelId: 'L0' }],
  resolveWallSystemType: (_ref: string) => null,
  wallSystemTypeNames: ['Generic - 200mm', 'Interior - Partition'],
  resolveScope: (s: any) => {
    if (s.kind === 'room' && !/kitchen/i.test(s.roomRef)) {
      return { error: `I can't find a room "${s.roomRef}". The rooms here are: 00-001 (Kitchen).` };
    }
    return { ids: IDS, kindCounts: { [s.elementKind ?? 'wall']: 3 }, skipped: [], diagnostics: [s.kind === 'room' ? 'Kitchen' : 'Level 0'] };
  },
} as unknown as ResolverContext;
for (const s of [
  'make all walls in block b white',
  'make all walls white',
  'make all walls in the kitchen white',
  'paint all walls in block b white',
  'delete all windows in block b',
  'make all windows in block b 1.5m wide',
  'create windows on all walls in block b',
  'create windows on all walls in the kitchen',
]) {
  const r: any = resolveUtterance(s, ctx);
  const app = r?.application ?? r;
  const k = app?.kind ?? '(miss)';
  const d = k === 'commands'
    ? (app.commands ?? []).map((c: any) => `${c.type} ${JSON.stringify(c.payload).slice(0,110)}`).join(' | ') + `\n      SUMMARY: ${String(app.summary).slice(0,150)}`
    : k === 'refusal' ? 'REASON: ' + String(app.reason).slice(0,220) : '';
  console.log(`\n"${s}"\n  -> ${k} [${app?.intent ?? '-'}]\n      ${d}`);
}
