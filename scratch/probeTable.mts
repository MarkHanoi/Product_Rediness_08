import { resolveUtterance, type ResolverContext } from '../packages/ai-host/src/intents/ZeroTokenResolver.js';
// THREE BUILDINGS: 9 walls, 3 blocks, 2 storeys. Project-wide stores.
const ALL_WALLS = ['A-L0-w1','A-L0-w2','A-L1-w1','B-L0-w1','B-L0-w2','B-L1-w1','C-L0-w1','C-L0-w2','C-L1-w1'];
const ALL_WINDOWS = ['A-win1','B-win1','C-win1'];
const ctx = {
  selection: [], activeLevelId: 'L0',
  levels: [{ id: 'L0', name: 'Level 0', elevation: 0 }, { id: 'L1', name: 'Level 1', elevation: 3 }],
  rooms: [{ id: 'r1', name: 'Kitchen', roomNumber: '00-001', levelId: 'L0' }],
  mintId: () => 'x',
  resolveWallSystemType: (_r: string) => null,
  wallSystemTypeNames: ['Generic - 200mm'],
  resolveScope: (s: any) => {
    const base = s.kind === 'filter' ? s.base : s;
    const kind = base.elementKind ?? 'wall';
    const rows = kind === 'window' ? ALL_WINDOWS : kind === 'door' ? ['A-d1'] : kind === 'slab' ? ['A-s1','B-s1','C-s1'] : ALL_WALLS;
    if (base.kind === 'all') return { ids: rows, kindCounts: { [kind]: rows.length }, skipped: [], diagnostics: [] };
    if (base.kind === 'ids') return { ids: base.ids, kindCounts: { [kind]: base.ids.length }, skipped: [], diagnostics: [] };
    if (base.kind === 'level') return { ids: rows.filter(r => r.includes('L0')), kindCounts: {}, skipped: [], diagnostics: ['Level 0'] };
    if (base.kind === 'room') return { ids: rows.slice(0,2), kindCounts: { [kind]: 2 }, skipped: [], diagnostics: ['Kitchen'] };
    return { error: 'unsupported' };
  },
} as unknown as ResolverContext;
const rows: string[] = [];
for (const s of [
  'create windows on all walls','make all walls white','make all walls 3 meters high',
  'delete all windows','change all windows to 1.5 meters wide','delete all doors',
  'make all slabs 300mm thick','furnish every floor','hide all walls','show all windows',
  'make all doors 2.1m high','delete all walls','make all windows opaque',
]) {
  const r: any = resolveUtterance(s, ctx);
  const app = r?.application ?? r;
  let reach = '-';
  if (app?.kind === 'commands') {
    const p: any = app.commands[0]?.payload ?? {};
    const idsField = Object.entries(p).find(([k, v]) => /Ids$/.test(k) || k === 'elementIds');
    reach = idsField ? (idsField[1] === 'all' ? "'all' sentinel (project-wide)" : `${Array.isArray(idsField[1]) ? (idsField[1] as any[]).length : '?'} ids`) : JSON.stringify(p).slice(0, 50);
  }
  rows.push(`${(app?.kind ?? 'miss').padEnd(9)} | ${String(app?.intent ?? '-').padEnd(28)} | ${reach.padEnd(30)} | ${s}`);
}
console.log('kind      | intent                       | reach                          | utterance');
console.log(rows.join('\n'));
