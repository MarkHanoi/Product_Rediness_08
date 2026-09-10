import { parseBuildFromEnvelopeIntent } from '../packages/ai-host/src/intents/BuildFromEnvelope.js';
import type { ResolverContext } from '../packages/ai-host/src/intents/ZeroTokenResolver.js';
const ctx = {
  selection: [], activeLevelId: 'L0',
  levels: [{ id: 'L0', name: 'Level 0', elevation: 0 }, { id: 'L1', name: 'Level 1', elevation: 3 }],
  rooms: [{ id: 'r1', name: 'Kitchen', roomNumber: '00-001', levelId: 'L0' }],
  mintId: () => 'x',
} as unknown as ResolverContext;
for (const s of [
  'create walls and slabs from my envelope',
  'create walls and slabs from my envelope on level 1',
  'create walls and slabs from my envelope in block b',
  'create walls and slabs from my envelope in the kitchen',
  'create walls and slabs from my envelope on the south facade',
]) {
  console.log(`"${s}"\n   -> ${JSON.stringify(parseBuildFromEnvelopeIntent(s, ctx))}`);
}
