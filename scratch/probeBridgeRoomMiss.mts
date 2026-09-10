// Mirrors apps/editor/src/ui/ai/ZeroTokenChatBridge.ts:452-470 EXACTLY — the
// production room-scope miss branch, which is where "delete all windows in
// block b" and "make all windows in block b 1.5m wide" actually get refused.
import { unmatchedQualifierTail } from '../packages/ai-host/src/intents/QualifierAxes.js';
import { describeRoomRow } from '../packages/ai-host/src/intents/roomNumberMatch.js';
import type { ResolverContext } from '../packages/ai-host/src/intents/ZeroTokenResolver.js';

const levels = [{ id: 'L0', name: 'Level 0', elevation: 0 }];
const allRooms = [{ id: 'r1', name: 'Kitchen', roomNumber: '00-001' }];

function bridgeRoomRefusal(roomRef: string, elementKind: string): string {
  const labels = allRooms.map((r) => describeRoomRow(r)).filter((n) => n.length > 0).slice(0, 8);
  const axisTail = unmatchedQualifierTail(roomRef, elementKind, {
    selection: [],
    levels: levels.map((l) => ({ id: l.id, name: l.name, elevation: l.elevation ?? 0 })),
    rooms: allRooms.map((r) => ({ id: r.id, name: r.name, roomNumber: r.roomNumber })),
    mintId: () => '',
  } as unknown as ResolverContext, { searchedAxis: 'room', searchedNoun: 'room' });
  return (labels.length === 0
    ? `There are no rooms in this project yet — detect rooms first.`
    : `I can't find a room "${roomRef}". The rooms here are: ${labels.join(', ')}.`) + axisTail.tail;
}

for (const [ref, kind] of [['block b','window'],['block','window'],['tower 2','wall'],['pantry','wall']] as const) {
  console.log(`\n--- roomRef "${ref}" (${kind}) ---\n${bridgeRoomRefusal(ref, kind)}`);
}
