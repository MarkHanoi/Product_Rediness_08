// ─── GATE · check-plan-determinism  (G-REASON-02) ────────────────────────────
//
// THE INVARIANT (BIM30-REASONING-LOOP-PLAN R2 exit condition; C78 §7.6):
//   SAME COMMAND + SAME STATE ⇒ IDENTICAL PLAN AND planHash — byte-equal, twice,
//   through the REAL planner and the REAL preview service.
//
// This gate existed as a NAME since R2 and had NO FILE (C78 §7.6's measured gap,
// 0C OPEN QUESTION 6): six source files cite G-REASON-02 as the reason for
// `stableStringify`, sorted element sets and a deterministic `planId`, and nothing
// measured any of it. It is the invariant a second planner is most likely to break
// silently — which is why, with the registry about to widen, this file iterates
// over EVERY planner the composition registers rather than hardcoding wall.move.
//
// ─── WHAT IT DECIDES — five arms ─────────────────────────────────────────────
//   ARM 1 · REPEAT.       The same command over the same composed state, planned
//           twice through ConsequencePreviewService → WallMoveConsequencePlanner,
//           yields BYTE-IDENTICAL plans. Full JSON, not just planHash: the
//           comparator distinguishes honest divergence (bytes differ, hashes
//           differ) from a HASH BUG (bytes differ, hashes EQUAL — the measured
//           d63e7954 collision class, where the predicted polygon was dropped
//           from the hashed body and two different plans both hashed 0c7f0283).
//   ARM 2 · SENSITIVITY.  Plans differing in exactly ONE consequential fact must
//           hash DIFFERENTLY — and the fact is planted in the BODY while the
//           stateHash is held EQUAL (asserted as a floor), because a difference
//           that rides in via stateHash proves nothing about body coverage:
//             2a  polygon-only  (a collinear vertex inserted into the predicted
//                 ring; area/perimeter/centroid/bbox all identical — d63e7954)
//             2b  metric-only   (MetricTransition.before moves; ring identical)
//             2c  changed-set-only (one junction member appears in `changed`)
//   ARM 3 · INSENSITIVITY. What C78 §9 keeps OFF the plan must not move the hash:
//           payload key-order permutation ⇒ same planHash (stableStringify's
//           whole job), and a differing CommandExecutionContext-shaped envelope
//           (actor/origin/timestamp/approval/gestureId) beside the call — which
//           the planner surface structurally does not accept — under a differing
//           spoofed clock ⇒ byte-identical plan.
//   ARM 4 · REGISTRY-GENERALITY. The registered planner keys are parsed from the
//           three composition sources (`planners.set('<key>', …)` — those files
//           reach window.* at module scope, so the registry is read from source,
//           not imported). EVERY registered key must have a determinism harness
//           in this gate; a key without one is a FINDING, so a newly registered
//           planner turns this gate red instead of silently escaping G-REASON-02.
//           The planners-tested count prints on every run, so 1 is visible as 1.
//   ARM 5 · NONDETERMINISM SOURCES. Arm 1 re-run at a different wall-clock time
//           (a real sleep) with Date.now AND Math.random spoofed to DIFFERENT
//           values on each side — still byte-identical, so no clock or RNG read
//           observably reaches the plan.
//
// ─── CONTROLS (floors — a blind checker exits 2, never 0) ────────────────────
//   POSITIVE: a deliberately NONDETERMINISTIC planner (the real planner wrapped
//   to append a Date.now()+Math.random() residue) is fed through the SAME repeat
//   checker, which must FLAG it — and must classify it as the hash-bug shape
//   (bodies differ, hash equal), proving the gate can tell a hash bug from an
//   honest divergence. NEGATIVE: two GENUINELY different states (a wall actually
//   elsewhere) must produce different planHashes, proving the sensitivity arms
//   are capable of seeing a difference at all.
//
// The gate's own output is deterministic: no timestamp, no random, no absolute
// path prints below — two runs of this file are byte-identical.
//
// Exit 0 clean · 1 declared · 2 MISCONFIGURED · 3 exceeded (contract.ts —
// imported, never copied). HARD-0, no baseline: there is no acceptable level of
// "the same command over the same state planned two different futures".

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type GateResult, type Floor } from '../contract.js';
import { WallMoveConsequencePlanner } from '../../../../apps/editor/src/engine/consequence/WallMoveConsequencePlanner.js';
import { ConsequencePreviewService } from '../../../../apps/editor/src/engine/consequence/ConsequencePreviewService.js';
import { predictRoomGeometry } from '../../../../packages/room-topology/src/predictRoomGeometry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../../..');

type Plan = NonNullable<Awaited<ReturnType<ConsequencePreviewService['preview']>>>;

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── The world — the same 6×4 room the reshape-fidelity gate certifies ────────
// wall-n moves from z=4 to z=3; the neighbour walls in the store already end at
// z=3 so the REAL predictor's 1 mm weld closes the proposed ring (area 24 → 18).

interface P3 { x: number; y: number; z: number }
interface Wall { id: string; baseLine: [P3, P3]; levelId: string; openings: any[] }

const w = (id: string, a: [number, number], b: [number, number]): Wall => ({
  id, baseLine: [{ x: a[0], y: 0, z: a[1] }, { x: b[0], y: 0, z: b[1] }], levelId: 'L1', openings: [],
});

const makeWalls = (): Wall[] => [
  w('wall-s', [0, 0], [6, 0]),
  w('wall-e', [6, 0], [6, 3]),
  w('wall-n', [6, 4], [0, 4]), // pre-move — the command proposes z=3
  w('wall-w', [0, 3], [0, 0]),
];

const makeRoom = (): any => ({
  id: 'room-1', levelId: 'L1', name: 'Kitchen',
  boundingWallIds: ['wall-s', 'wall-e', 'wall-n', 'wall-w'],
  boundary: { polygon: [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }], height: 2.7 },
  computed: { area: 24, grossArea: 24, perimeter: 20, volume: 64.8, centroid: { x: 3, z: 2 }, boundingBox: { minX: 0, minZ: 0, maxX: 6, maxZ: 4 } },
});

interface World { walls: Wall[]; rooms: any[] }
const freshWorld = (): World => ({ walls: makeWalls(), rooms: [makeRoom()] });

/** Read-only PlanningContext double — getAll/getById only, no write surface. */
const contextFor = (world: World) => () => ({
  getStore(storeId: string) {
    const items: any[] | undefined =
      storeId === 'wall' ? world.walls : storeId === 'room' ? world.rooms : undefined;
    if (!items) return undefined;
    return {
      getAll: () => items as readonly unknown[],
      getById: (id: string) => items.find((i) => i.id === id) ?? null,
    };
  },
}) as any;

const TARGET_BASELINE = [{ x: 6, y: 0, z: 3 }, { x: 0, y: 0, z: 3 }];
const COMMAND = { type: 'wall.move' as const, payload: { id: 'wall-n', baseLine: TARGET_BASELINE } };

// A validator with a 20 m² floor: silent before the move (24 m²), firing after
// (predicted 18 m²) — so `validation.violationsCreated` is POPULATED and the
// hash arms cover that section of the body too.
const areaValidator = {
  validateAll: (ctx: any) =>
    (ctx.roomStore.getAll() as any[])
      .filter((r) => typeof r.computed?.area === 'number' && r.computed.area < 20)
      .map((r) => ({ ruleId: 'ROOM_MIN_AREA', elementId: r.id, message: `room area ${r.computed.area} m² is below the 20 m² minimum` })),
};

/** Build the REAL service over the REAL planner, with injectable seams. */
function buildService(world: World, opts?: {
  predictor?: (...args: any[]) => any;
  joined?: string[];
  plannerWrap?: (p: WallMoveConsequencePlanner) => { plan: (c: any, ctx: any) => Promise<any> };
}): ConsequencePreviewService {
  const planner = new WallMoveConsequencePlanner({
    occupancy: { planOpeningRefit: () => ({ ok: true, refusals: [], relocations: [] }) },
    joinedWalls: { getJoinedWalls: (wallId: string) => ({ ok: true, wallId, joinedWallIds: opts?.joined ?? ['wall-e', 'wall-w'] }) },
    validator: areaValidator,
    predictRoomGeometry: (opts?.predictor ?? predictRoomGeometry) as any,
  } as any);
  const subject = opts?.plannerWrap ? opts.plannerWrap(planner) : planner;
  const planners = new Map<string, any>();
  planners.set('wall.move', subject);
  return new ConsequencePreviewService(planners as any, contextFor(world));
}

// ─── The comparator — full-JSON bytes AND hash, classified ───────────────────
type Verdict = 'identical' | 'divergent' | 'hash-bug';

function compareRuns(a: Plan, b: Plan): { verdict: Verdict; detail: string } {
  const ba = JSON.stringify(a);
  const bb = JSON.stringify(b);
  if (ba === bb) return { verdict: 'identical', detail: `byte-identical (${ba.length} bytes, planHash ${a.planHash})` };
  let i = 0;
  while (i < ba.length && i < bb.length && ba[i] === bb[i]) i++;
  const at = `first divergence at byte ${i}: …${ba.slice(Math.max(0, i - 30), i + 30)}… vs …${bb.slice(Math.max(0, i - 30), i + 30)}…`;
  if (a.planHash === b.planHash) {
    return { verdict: 'hash-bug', detail: `bodies DIFFER but planHash is EQUAL (${a.planHash}) — the d63e7954 collision class; a hash equality over differing bodies is a HASH BUG, not determinism. ${at}` };
  }
  return { verdict: 'divergent', detail: `bodies differ AND hashes differ (${a.planHash} vs ${b.planHash}). ${at}` };
}

// ─── Scripted predictors for the sensitivity arms (the injection seam the ─────
// planner DESIGNS for; the state, command, planner and service stay real) ──────
const R1 = [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 3 }, { x: 0, z: 3 }];
const R1_SHEARED = [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 3 }, { x: 0, z: 3 }]; // collinear vertex: area, perimeter, centroid, bbox ALL identical

const scripted = (over?: Partial<{ polygon: { x: number; z: number }[]; areaBefore: number }>) =>
  (): any => ({
    anyStructuralLink: true,
    rooms: [{
      roomId: 'room-1', kind: 'determined',
      polygon: over?.polygon ?? R1,
      area: 18, perimeter: 18,
      centroid: { x: 3, z: 1.5 },
      boundingBox: { minX: 0, minZ: 0, maxX: 6, maxZ: 3 },
      areaBefore: over?.areaBefore ?? 24,
      areaDelta: 18 - (over?.areaBefore ?? 24),
    }],
  });

// ─── Registry-generality: parse EVERY `planners.set(...)` the composition does ─
const REGISTRY_SOURCES = [
  'apps/editor/src/engine/consequence/consequencePreviewServiceComposition.ts',
  'apps/editor/src/engine/consequence/consequenceExecutionServiceComposition.ts',
  'apps/editor/src/ui/consequence/confirmationFlowComposition.ts',
];

function parseRegisteredPlanners(): { keys: string[]; perSource: Map<string, string[]>; sourcesRead: number } {
  const perSource = new Map<string, string[]>();
  const all = new Set<string>();
  let sourcesRead = 0;
  for (const rel of REGISTRY_SOURCES) {
    const p = resolve(REPO, rel);
    if (!existsSync(p)) { perSource.set(rel, []); continue; }
    sourcesRead++;
    const src = readFileSync(p, 'utf8');
    const keys: string[] = [];
    for (const m of src.matchAll(/planners\.set\(\s*['"`]([^'"`]+)['"`]/g)) {
      keys.push(m[1]!);
      all.add(m[1]!);
    }
    perSource.set(rel, keys.sort());
  }
  return { keys: [...all].sort(), perSource, sourcesRead };
}

// ─── The per-planner determinism harness table. A key registered by the ────────
// composition but ABSENT here is a FINDING — that is the auto-subjection rule.
type Harness = () => Promise<{ floors: Floor[]; lines: string[]; findings: string[] }>;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function wallMoveHarness(): Promise<{ floors: Floor[]; lines: string[]; findings: string[] }> {
  const floors: Floor[] = [];
  const lines: string[] = [];
  const findings: string[] = [];

  // ── ARM 1 · REPEAT — the REAL predictor, the REAL planner, the REAL service ─
  const world = freshWorld();
  const service = buildService(world);
  const runA = await service.preview(COMMAND);
  const runB = await service.preview(COMMAND);
  floors.push({ what: 'wall.move: real preview produced a plan (run A)', measured: runA ? 1 : 0, min: 1 });
  floors.push({ what: 'wall.move: real preview produced a plan (run B)', measured: runB ? 1 : 0, min: 1 });
  if (runA && runB) {
    // The collision-class fields must be IN the plan, or the byte comparison is
    // over a body that never carried them and proves nothing about d63e7954.
    floors.push({ what: 'wall.move: plan carries predictedGeometry entries (the hashed d63e7954 field)', measured: (runA as any).predictedGeometry?.length ?? 0, min: 1 });
    floors.push({ what: 'wall.move: plan carries metric transitions', measured: (runA as any).metrics?.length ?? 0, min: 1 });
    floors.push({ what: 'wall.move: plan carries violationsCreated (validation section populated)', measured: runA.validation.violationsCreated.length, min: 1 });
    const c = compareRuns(runA, runB);
    if (c.verdict !== 'identical') findings.push(`ARM 1 · REPEAT [${c.verdict}]: ${c.detail}`);
    lines.push(`${c.verdict === 'identical' ? '✓ ' : '❌'} ARM 1 · REPEAT: ${c.detail}`);
  }

  // ── ARM 5 · NONDETERMINISM SOURCES — arm 1 at another time, clock+RNG spoofed ─
  const realNow = Date.now;
  const realRandom = Math.random;
  let clockReads = 0;
  let rngReads = 0;
  const planUnder = async (now: number, rand: number): Promise<Plan | null> => {
    Date.now = () => { clockReads++; return now; };
    Math.random = () => { rngReads++; return rand; };
    try { return await buildService(freshWorld()).preview(COMMAND); }
    finally { Date.now = realNow; Math.random = realRandom; }
  };
  const t1 = await planUnder(1_000_000_000, 0.1111);
  await sleep(30); // a REAL wall-clock gap between the two plannings
  const t2 = await planUnder(9_999_999_999, 0.9999);
  floors.push({ what: 'wall.move: time-arm produced both plans', measured: t1 && t2 ? 1 : 0, min: 1 });
  if (t1 && t2) {
    const c = compareRuns(t1, t2);
    if (c.verdict !== 'identical') findings.push(`ARM 5 · TIME/RNG [${c.verdict}]: plans planned 30 ms apart under DIFFERENT spoofed Date.now/Math.random diverged — a clock or RNG read reaches the plan. ${c.detail}`);
    lines.push(`${c.verdict === 'identical' ? '✓ ' : '❌'} ARM 5 · TIME/RNG: 30 ms apart, Date.now spoofed 1000000000 vs 9999999999, Math.random 0.1111 vs 0.9999 → ${c.verdict} (planner path observed ${clockReads} Date.now / ${rngReads} Math.random reads)`);
  }

  // ── ARM 2 · SENSITIVITY — one consequential fact each, stateHash held EQUAL ──
  const pairHash = async (label: string, a: ConsequencePreviewService, b: ConsequencePreviewService, fact: string): Promise<void> => {
    const pa = await a.preview(COMMAND);
    const pb = await b.preview(COMMAND);
    floors.push({ what: `wall.move: sensitivity pair "${label}" produced both plans`, measured: pa && pb ? 1 : 0, min: 1 });
    if (!pa || !pb) return;
    const stateEqual = pa.stateHash === pb.stateHash ? 1 : 0;
    floors.push({ what: `wall.move: sensitivity pair "${label}" holds stateHash EQUAL (the difference rides in the BODY)`, measured: stateEqual, min: 1 });
    if (pa.planHash === pb.planHash) {
      findings.push(`ARM 2 · SENSITIVITY [${label}]: two plans differing in ${fact} share planHash ${pa.planHash} — the d63e7954 collision class is OPEN.`);
      lines.push(`❌ ARM 2 · ${label}: planHash DID NOT MOVE (${pa.planHash}) for a difference in ${fact}`);
    } else {
      lines.push(`✓  ARM 2 · ${label}: planHash moved (${pa.planHash} → ${pb.planHash}) on ${fact}, with stateHash equal (${pa.stateHash})`);
    }
  };

  const wPoly = freshWorld();
  await pairHash('polygon-only',
    buildService(wPoly, { predictor: scripted() }),
    buildService(wPoly, { predictor: scripted({ polygon: R1_SHEARED }) }),
    'ONLY the predicted ring (a collinear vertex inserted; area/perimeter/centroid/bbox byte-identical) — the measured d63e7954 collision, kept fixed');

  const wMetric = freshWorld();
  await pairHash('metric-only',
    buildService(wMetric, { predictor: scripted() }),
    buildService(wMetric, { predictor: scripted({ areaBefore: 23.5 }) }),
    'ONLY MetricTransition.before (24 → 23.5; ring and every other body byte identical)');

  const wSet = freshWorld();
  await pairHash('changed-set-only',
    buildService(wSet, { predictor: scripted(), joined: ['wall-e'] }),
    buildService(wSet, { predictor: scripted(), joined: ['wall-e', 'wall-w'] }),
    'ONLY the changed-set membership (junction member wall-w present vs absent)');

  // ── ARM 3 · INSENSITIVITY — what C78 §9 keeps OFF the plan must not move it ──
  const wKeys = freshWorld();
  const svcKeys = buildService(wKeys, { predictor: scripted() });
  const orderedA = await svcKeys.preview({ type: 'wall.move', payload: { id: 'wall-n', baseLine: TARGET_BASELINE } });
  const orderedB = await svcKeys.preview({ type: 'wall.move', payload: { baseLine: TARGET_BASELINE, id: 'wall-n' } } as any);
  floors.push({ what: 'wall.move: key-order pair produced both plans', measured: orderedA && orderedB ? 1 : 0, min: 1 });
  if (orderedA && orderedB) {
    if (orderedA.planHash !== orderedB.planHash) {
      findings.push(`ARM 3 · INSENSITIVITY [key-order]: permuting payload key insertion order moved the planHash (${orderedA.planHash} → ${orderedB.planHash}) — stableStringify is not doing its one job.`);
      lines.push('❌ ARM 3 · key-order: payload key permutation MOVED the planHash');
    } else {
      lines.push(`✓  ARM 3 · key-order: payload {id,baseLine} vs {baseLine,id} → same planHash (${orderedA.planHash})`);
    }
  }

  // Same command, different CommandExecutionContext-shaped envelope. The planner
  // surface accepts no envelope (structurally off the plan — C78 §9.4's shape),
  // so the proof is observational: two dispatch-side envelopes differing in
  // actor/origin/timestamp/approval/gestureId, each planned under ITS OWN spoofed
  // clock, and the plans must be BYTE-identical.
  const envelopes = [
    { actor: 'human', origin: 'direct-manipulation', timestamp: 1_111_111, gestureId: 'g-human-1' },
    { actor: 'ai', origin: 'ai-proposal', timestamp: 9_999_999, gestureId: 'g-ai-2', approval: { approvedBy: 'user-7', planHash: 'stale-cafe' } },
  ] as const;
  const envPlans: (Plan | null)[] = [];
  for (const env of envelopes) {
    Date.now = () => env.timestamp;
    try { envPlans.push(await buildService(freshWorld(), { predictor: scripted() }).preview(COMMAND)); }
    finally { Date.now = realNow; }
  }
  floors.push({ what: 'wall.move: envelope pair produced both plans', measured: envPlans[0] && envPlans[1] ? 1 : 0, min: 1 });
  if (envPlans[0] && envPlans[1]) {
    const c = compareRuns(envPlans[0], envPlans[1]);
    if (c.verdict !== 'identical') findings.push(`ARM 3 · INSENSITIVITY [envelope]: actor/origin/timestamp/approval differences leaked into the plan — provenance must stay OFF the plan (C78 §9). ${c.detail}`);
    lines.push(`${c.verdict === 'identical' ? '✓ ' : '❌'} ARM 3 · envelope: human/direct vs ai/proposal+approval, clocks 1111111 vs 9999999 → ${c.verdict}`);
  }

  // ── POSITIVE CONTROL (floor) — a nondeterministic planner MUST be flagged ────
  // The real planner wrapped to smuggle a clock+RNG residue into the body WITHOUT
  // recomputing the hash — both the nondeterminism and the hash-bug shape at once.
  const noisy = buildService(freshWorld(), {
    predictor: scripted(),
    plannerWrap: (real) => ({
      plan: async (c: any, ctx: any) => {
        const p = await real.plan(c, ctx);
        return { ...p, undetermined: [...p.undetermined, { scope: 'noise', reason: 'ENGINE_NOT_AVAILABLE', detail: `t=${realNow()}·r=${realRandom()}` }] };
      },
    }),
  });
  const n1 = await noisy.preview(COMMAND);
  const n2 = await noisy.preview(COMMAND);
  const noisyVerdict = n1 && n2 ? compareRuns(n1, n2) : null;
  floors.push({ what: 'POSITIVE control: a deliberately NONDETERMINISTIC planner is FLAGGED by the repeat checker', measured: noisyVerdict && noisyVerdict.verdict !== 'identical' ? 1 : 0, min: 1 });
  floors.push({ what: 'POSITIVE control: the checker CLASSIFIES it as the hash-bug shape (bodies differ, hash equal) rather than honest divergence', measured: noisyVerdict?.verdict === 'hash-bug' ? 1 : 0, min: 1 });
  lines.push(`${noisyVerdict && noisyVerdict.verdict !== 'identical' ? '✓ ' : '❌'} POSITIVE control: nondeterministic planner → ${noisyVerdict?.verdict ?? 'NO PLANS'} (a blind checker here would have exited 0; it exits 2 instead)`);

  // ── NEGATIVE CONTROL (floor) — genuinely different states must hash apart ────
  const other = freshWorld();
  other.walls[2] = w('wall-n', [8, 4], [0, 4]); // the wall is ACTUALLY elsewhere
  const g1 = await buildService(freshWorld(), { predictor: scripted() }).preview(COMMAND);
  const g2 = await buildService(other, { predictor: scripted() }).preview(COMMAND);
  const negSeen = g1 && g2 && g1.planHash !== g2.planHash ? 1 : 0;
  floors.push({ what: 'NEGATIVE control: two GENUINELY different states produce different planHashes (the sensitivity arms can see)', measured: negSeen, min: 1 });
  lines.push(`${negSeen ? '✓ ' : '❌'} NEGATIVE control: wall-n at length 6 vs 8 → planHash ${g1?.planHash} vs ${g2?.planHash}`);

  return { floors, lines, findings };
}

const HARNESSES: Record<string, Harness> = {
  'wall.move': wallMoveHarness,
};

// ─── Run ──────────────────────────────────────────────────────────────────────
async function run(): Promise<GateResult> {
  const floors: Floor[] = [];
  const lines: string[] = [];
  const findingNames: string[] = [];

  // ARM 4 · the registry, from the composition sources themselves.
  const reg = parseRegisteredPlanners();
  floors.push({ what: 'composition sources read for planner registrations', measured: reg.sourcesRead, min: REGISTRY_SOURCES.length });
  floors.push({ what: 'planner keys registered by the composition', measured: reg.keys.length, min: 1 });
  for (const [rel, keys] of reg.perSource) lines.push(`registry · ${rel}: [${keys.join(', ') || '—'}]`);
  const disagreement = [...reg.perSource.values()].some((k) => k.join('|') !== reg.keys.join('|'));
  if (disagreement) lines.push('⚠  the three composition registries do not register identical key sets — not a G-REASON-02 finding, but preview/execute/confirm disagree on which planners exist.');

  let tested = 0;
  for (const key of reg.keys) {
    const harness = HARNESSES[key];
    if (!harness) {
      findingNames.push(`ARM 4 · REGISTRY: planner '${key}' is registered by the composition but has NO determinism harness in this gate — G-REASON-02 is UNPROVEN for it. Add a harness entry before (or in the commit that) registers it.`);
      lines.push(`❌ ARM 4 · '${key}': registered, NO harness — automatically red, never silently exempt`);
      continue;
    }
    const r = await harness();
    tested++;
    floors.push(...r.floors);
    lines.push(...r.lines);
    findingNames.push(...r.findings);
  }
  floors.push({ what: 'registered planners actually driven through the determinism harness', measured: tested, min: 1 });
  lines.push(`planners registered: ${reg.keys.length} · planners tested: ${tested} — today that is ${tested} of ${reg.keys.length}, and the number prints so 1 reads as 1, not as "all".`);

  return {
    gate: 'check-plan-determinism',
    floors,
    lines,
    findings: findingNames.length,
    // HARD-0, no baseline: a plan that is not a pure function of (command, state)
    // cannot bind an approval (R6) or be compared against an actual (R4/G-REASON-03).
    declared: 0,
    findingNames,
  };
}

run()
  .then((r) => process.exit(reportGate(r)))
  .catch((e) => {
    // A gate that could not even run has measured nothing — MISCONFIGURED, never
    // clean (contract.ts §C10 / L-774).
    console.error('check-plan-determinism: harness threw — MISCONFIGURED\n', e);
    process.exit(2);
  });
