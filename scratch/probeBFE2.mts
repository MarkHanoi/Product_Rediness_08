import { resolveUtterance, type ResolverContext } from '../packages/ai-host/src/intents/ZeroTokenResolver.js';
const ctx = {
  selection: [], activeLevelId: 'L0',
  levels: [{ id: 'L0', name: 'Level 0', elevation: 0 }, { id: 'L1', name: 'Level 1', elevation: 3 }],
  rooms: [{ id: 'r1', name: 'Kitchen', roomNumber: '00-001', levelId: 'L0' }],
  mintId: () => 'x',
  resolveScope: (_s: any) => ({ ids: [], kindCounts: {}, skipped: [], diagnostics: [] }),
} as unknown as ResolverContext;
for (const s of [
  'create walls and slabs from my envelope',
  'create walls in my design',
  'make it real',
  'create walls and slabs from my envelope in block b',
  'create walls and slabs from my envelope in the kitchen',
  'create walls and slabs from my envelope on the south facade',
]) {
  const r: any = resolveUtterance(s, ctx);
  console.log(`\n"${s}"\n  -> ${r.kind}` + (r.kind === 'refusal' ? `\n     ${r.reason}` : r.kind === 'commands' ? `\n     ${r.commands.map((c:any)=>c.type).join(',')}` : ''));
}
