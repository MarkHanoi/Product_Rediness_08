import { resolveUtterance, type ResolverContext } from '../packages/ai-host/src/intents/ZeroTokenResolver.js';

// A parcel with THREE buildings. Walls of all three live in ONE WallStore, so a
// project-wide resolver returns all 9. Buildings A/B/C x 3 walls each.
const ALL_WALL_IDS = ['A-w1','A-w2','A-w3','B-w1','B-w2','B-w3','C-w1','C-w2','C-w3'];
const ctx = {
  selection: [],
  activeLevelId: 'L0',
  levels: [{ id: 'L0', name: 'Level 0', elevation: 0 }, { id: 'L1', name: 'Level 1', elevation: 3 }],
  mintId: () => 'id-1',
  resolveScope: (s: any) => {
    const ids = s.kind === 'all' ? ALL_WALL_IDS : s.kind === 'level' ? ALL_WALL_IDS : ALL_WALL_IDS;
    return { ids, kindCounts: { [s.elementKind ?? 'wall']: ids.length }, skipped: [], diagnostics: ['Level 0'] };
  },
} as unknown as ResolverContext;

const SENTENCES = [
  'create windows on all walls',
  'create a window in the middle of every wall segment',
  'create a 1x2m window every 3 meters in all walls',
  'make all walls white',
  'delete all windows',
  'change all windows to 1.5 meters wide',
  'create walls and slabs from my envelope',
  'create windows on all walls of every building',
  'create windows on all walls in block b',
  'furnish every floor',
];

for (const s of SENTENCES) {
  const r: any = resolveUtterance(s, ctx);
  const app = r?.application ?? r;
  const kind = app?.kind ?? '(miss)';
  let detail = '';
  if (kind === 'commands') {
    detail = (app.commands ?? []).map((c: any) => `${c.type} ${JSON.stringify(c.payload).slice(0, 160)}`).join(' | ');
    detail += `\n      SUMMARY: ${String(app.summary).slice(0, 200)}`;
  } else if (kind === 'refusal') {
    detail = String(app.reason).slice(0, 200);
  }
  console.log(`\n"${s}"\n  -> ${kind} [${app?.intent ?? '-'}]\n      ${detail}`);
}
