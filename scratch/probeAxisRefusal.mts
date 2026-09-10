import { unmatchedQualifierTail } from '../packages/ai-host/src/intents/QualifierAxes.js';
import type { ResolverContext } from '../packages/ai-host/src/intents/ZeroTokenResolver.js';
const ctx = {
  selection: [], activeLevelId: 'L0',
  levels: [{ id: 'L0', name: 'Level 0', elevation: 0 }],
  rooms: [{ id: 'r1', name: 'Kitchen', roomNumber: '00-001' }],
  mintId: () => 'x',
} as unknown as ResolverContext;
for (const [tok, kind] of [['block b','window'],['tower 2','wall'],['the kitchen','wall'],['south','window'],['segmental','window'],['blocked','wall']] as const) {
  const r = unmatchedQualifierTail(tok, kind, ctx, { searchedAxis: 'room', searchedNoun: 'room' });
  console.log(`\n"${tok}" (${kind}):\n  ${r.tail.trim()}`);
}
