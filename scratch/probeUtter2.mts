import { resolveUtterance, type ResolverContext } from '../packages/ai-host/src/intents/ZeroTokenResolver.js';
const IDS = ['A-w1','B-w1','C-w1'];
const ctx = {
  selection: [], activeLevelId: 'L0',
  levels: [{ id: 'L0', name: 'Level 0', elevation: 0 }],
  mintId: () => 'id-1',
  rooms: [{ id: 'r1', name: 'Kitchen', roomNumber: '00-001', levelId: 'L0' }],
  resolveScope: (s: any) => ({ ids: IDS, kindCounts: { [s.elementKind ?? 'wall']: 3 }, skipped: [], diagnostics: [s.kind === 'room' ? 'Kitchen' : 'Level 0'] }),
} as unknown as ResolverContext;
const SENTENCES = [
  'create windows on all walls in the kitchen',
  'create windows on all walls on level 0',
  'create windows on all walls in block b',
  'make all walls in block b white',
  'make all walls in block b 3m high',
  'delete all windows in block b',
  'build the walls for block b from the envelope',
  'create walls and slabs from every envelope on the parcel',
  'create windows on all walls in house 2',
];
for (const s of SENTENCES) {
  const r: any = resolveUtterance(s, ctx);
  const app = r?.application ?? r;
  const kind = app?.kind ?? '(miss)';
  const d = kind === 'commands'
    ? (app.commands ?? []).map((c: any) => `${c.type} ${JSON.stringify(c.payload).slice(0,120)}`).join(' | ') + `\n      SUMMARY: ${String(app.summary).slice(0,170)}`
    : kind === 'refusal' ? String(app.reason).slice(0,200) : '';
  console.log(`\n"${s}"\n  -> ${kind} [${app?.intent ?? '-'}]\n      ${d}`);
}
