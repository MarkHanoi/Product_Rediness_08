import { resolveUtterance, type ResolverContext } from '../packages/ai-host/src/intents/ZeroTokenResolver.js';
import type { ScopeDescriptor, ScopeResult } from '../packages/ai-host/src/intents/ScopeDescriptor.js';

// ── A THREE-BUILDING PARCEL, modelled the way the stores really hold it ──────
// Block A / Block B / Block C, two storeys each. Walls live in ONE WallStore;
// levels are project-global. This is exactly the topology ADR-0383 creates.
const LEVELS = [
  { id: 'lvl-0', name: 'Ground', elevation: 0 },
  { id: 'lvl-1', name: 'Level 1', elevation: 3 },
];
type W = { id: string; levelId: string; building: string };
const WALLS: W[] = [];
for (const b of ['A', 'B', 'C']) {
  for (const l of ['lvl-0', 'lvl-1']) {
    for (let i = 0; i < 4; i++) WALLS.push({ id: `w-${b}-${l}-${i}`, levelId: l, building: b });
  }
}
const WINDOWS = WALLS.slice(0, 12).map((w, i) => ({ id: `win-${i}`, wallId: w.id }));

const resolveScope = (s: ScopeDescriptor): ScopeResult => {
  const kind = 'elementKind' in s ? (s.elementKind ?? 'wall') : 'wall';
  const pick = (rows: { id: string }[]) => ({
    ids: rows.map((r) => r.id), kindCounts: { [kind]: rows.length }, skipped: [], diagnostics: [] as string[],
  });
  if (s.kind === 'ids') return pick(s.ids.map((id) => ({ id })));
  if (s.kind === 'all') return kind === 'window' ? pick(WINDOWS) : pick(WALLS);
  if (s.kind === 'level') {
    const lvl = LEVELS.find((l) => l.name.toLowerCase().includes(s.levelQuery.toLowerCase()) || l.name === s.levelQuery);
    if (!lvl) return { error: `No level called "${s.levelQuery}".` };
    const r = pick(WALLS.filter((w) => w.levelId === lvl.id));
    return { ...r, diagnostics: [lvl.name] };
  }
  if (s.kind === 'room') return { error: `I can't find a room "${s.roomRef}".` };
  if (s.kind === 'orientation') return pick(WALLS.filter((_, i) => i % 4 === 0));
  return { error: 'filter not modelled in this probe' };
};

const ctx = {
  selection: [],
  activeLevelId: 'lvl-0',
  levels: LEVELS,
  mintId: () => 'id-1',
  resolveScope,
} as unknown as ResolverContext;

const SENTENCES = [
  'create windows on all walls',
  'create a 1x2m window in the middle of every wall',
  'create windows in all walls on all the envelopes of all houses on the parcel',
  'paint all walls white',
  'make all walls 3 meters high',
  'change all windows to double glazed',
  'delete all walls',
  'create windows on all walls of block B',
  'create windows on all walls in all buildings',
  'paint all walls in block A white',
  'make all walls on all houses 3m high',
  'create walls and slabs from my envelope',
  'add windows to every house',
];

for (const s of SENTENCES) {
  const r = resolveUtterance(s, ctx);
  const line = r.kind === 'commands'
    ? `commands[${r.commands.length}] ${r.commands.map((c) => `${c.type} ${JSON.stringify(c.payload).slice(0, 150)}`).join(' | ')}`
    : r.kind === 'refusal' ? `REFUSAL: ${r.reason.slice(0, 220)}`
    : `${r.kind}: ${JSON.stringify(r).slice(0, 200)}`;
  console.log(`\n>>> ${s}\n    ${line}`);
  if (r.kind === 'commands') console.log(`    SUMMARY: ${r.summary.slice(0, 240)}`);
}
