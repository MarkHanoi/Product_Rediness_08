import { resolveUtterance, type ResolverContext } from '../packages/ai-host/src/intents/ZeroTokenResolver.js';
import { resolveNaturalLanguage } from '../packages/ai-host/src/intents/LocalNaturalLanguageResolver.js';
import { capabilityGapRefusal } from '../packages/ai-host/src/capabilities/CapabilityRefusal.js';
const ctx = {
  selection: [], activeLevelId: 'L0',
  levels: [{ id: 'L0', name: 'Level 0', elevation: 0 }],
  mintId: () => 'id-1',
  rooms: [{ id: 'r1', name: 'Kitchen', roomNumber: '00-001', levelId: 'L0' }],
  resolveScope: (_s: any) => ({ ids: ['A-w1','B-w1','C-w1'], kindCounts: { wall: 3 }, skipped: [], diagnostics: ['Level 0'] }),
} as unknown as ResolverContext;
for (const q of [
  'create windows on all walls',
  'create windows on all walls in the kitchen',
  'create windows on all walls in block b',
  'create windows on all walls on the south facade',
]) {
  console.log(`\n=== "${q}"`);
  const r: any = resolveUtterance(q, ctx);
  console.log(` tier0: ${r.kind}${r.kind === 'commands' ? ' ' + r.commands.map((c: any) => c.type).join(',') : ''}`);
  if (r.kind !== 'miss') continue;
  const nl: any = resolveNaturalLanguage(q, { ...ctx } as any);
  console.log(` NL   : ${nl.kind}` + (nl.kind === 'clarification' ? ` Q="${nl.question}"` : nl.kind === 'resolution' ? ` -> ${nl.resolution?.kind}` : ''));
  if (nl.kind !== 'miss') continue;
  const gap: any = capabilityGapRefusal(q, []);
  console.log(` gap  : ${gap === null ? 'null -> LLM' : gap.kind + ' :: ' + String(gap.reason).slice(0, 260)}`);
}
