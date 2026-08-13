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
// ─── WHAT IS SHARED BETWEEN FAMILIES, AND WHAT IS DELIBERATELY NOT ───────────
// `compareRuns` / `Verdict` / `sleep` are the only machinery both harnesses use,
// and they are family-AGNOSTIC by construction: they take two `Plan`s and compare
// bytes and hashes. Nothing else is shared, on purpose.
//
// Everything else in the move harness is wall-MOVE-shaped and would smuggle
// move assumptions into any family that inherited it: `freshWorld`/`makeRoom`
// exist to give `predictRoomGeometry` a room whose `boundingWallIds` ALREADY
// contains the subject wall (the create planner cannot use that predictor at
// all — WallCreateConsequencePlanner.ts's header explains why); `scripted()`/
// `R1`/`R1_SHEARED` script a ROOM-GEOMETRY PREDICTOR, a seam `wall.create` does
// not have; `areaValidator` fires on a room area the create planner structurally
// cannot move (its after-clone carries rooms UNCHANGED, by design). So the create
// harness builds its OWN world, its OWN command and its OWN injected doubles.
// That is duplication of ~40 lines of fixture, and it is the correct trade: a
// shared `buildService` generalised over both families would have to be
// parameterised by predictor-vs-resolver, room-vs-junction and move-vs-add
// validator shapes, at which point the "shared" helper is a union of two
// families that a THIRD (opening.move, room.regenerate — the next matrix rows)
// would inherit wall-shaped defaults from silently. C70 §5.3's reasoning applied
// to test machinery: a harness that is easy to add a row to by copying a wall
// fixture is how a non-wall planner gets certified against wall assumptions.
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
import { WallCreateConsequencePlanner } from '../../../../apps/editor/src/engine/consequence/WallCreateConsequencePlanner.js';
import { ConsequencePreviewService } from '../../../../apps/editor/src/engine/consequence/ConsequencePreviewService.js';
import { predictRoomGeometry } from '../../../../packages/room-topology/src/predictRoomGeometry.js';
import { resolveJunctionsWithRecords } from '../../../../packages/geometry-wall/src/JunctionResolverV2.js';

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

// §FOLLOW-THE-SHARED-FACTORY (2026-08-13, commit 46d06234). Registration was
// centralised into ONE `createConsequencePlanners()` factory, because three
// hand-built maps is exactly HOW the wall.create planner came to be registered
// nowhere while looking registered. A parser that only greps `planners.set(` in
// each consumer therefore reads centralisation as DIVERGENCE — every consumer
// reports [—] and the gate warns the roots disagree, when in truth they share
// one source. That would punish the fix for U-INV-5 and pressure a future author
// back toward duplicated maps, so the parser follows the factory instead:
// a consumer that CALLS the factory inherits the factory's key set.
const PLANNER_FACTORY = 'createConsequencePlanners';

function parseRegisteredPlanners(): { keys: string[]; perSource: Map<string, string[]>; sourcesRead: number } {
  const perSource = new Map<string, string[]>();
  const all = new Set<string>();
  let sourcesRead = 0;

  const keysIn = (src: string): string[] => {
    const keys: string[] = [];
    for (const m of src.matchAll(/planners\.set\(\s*['"`]([^'"`]+)['"`]/g)) keys.push(m[1]!);
    return keys;
  };

  // Pass 1 — the factory's own key set, wherever it is defined among the sources.
  const factoryKeys: string[] = [];
  for (const rel of REGISTRY_SOURCES) {
    const p = resolve(REPO, rel);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, 'utf8');
    if (new RegExp(`(export\\s+)?function\\s+${PLANNER_FACTORY}\\b`).test(src)) {
      factoryKeys.push(...keysIn(src));
    }
  }

  // Pass 2 — per consumer: its own literal registrations, PLUS the factory's
  // keys when it delegates to the factory.
  for (const rel of REGISTRY_SOURCES) {
    const p = resolve(REPO, rel);
    if (!existsSync(p)) { perSource.set(rel, []); continue; }
    sourcesRead++;
    const src = readFileSync(p, 'utf8');
    const keys = new Set<string>(keysIn(src));
    if (new RegExp(`${PLANNER_FACTORY}\\s*\\(`).test(src)) for (const k of factoryKeys) keys.add(k);
    for (const k of keys) all.add(k);
    perSource.set(rel, [...keys].sort());
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

// ─── wall.create · the SECOND family ──────────────────────────────────────────
//
// The move harness above is not transcribable to create, and the gate must not
// pretend otherwise. `wall.move` reasons about a wall that EXISTS: it reads a
// RETAINED joinedTo index by id, and it runs `predictRoomGeometry`, which
// `continue`s past any room whose `boundingWallIds` does not already list the
// subject wall. A wall that does not exist yet is in no index and no room's
// membership, so BOTH of the move harness's principal seams answer nothing for a
// create. Reusing its fixtures would have produced a harness that runs, prints
// green, and exercises the empty branch of every arm.
//
// So the create world and the create arms are built from the create planner's
// OWN seams (WallCreateConsequencePlanner.ts, "Injected collaborators"):
//
//   resolveJunctions  the PURE `resolveJunctionsWithRecords` — the REAL one from
//                     @pryzm/geometry-wall, not a script. The planner runs it
//                     TWICE (level walls, then level walls + candidate) and DIFFS
//                     miter signatures, which is the create-side substitute for
//                     the move planner's joinedTo read.
//   occupancy         the opening-refit seed → the `refused` section.
//   validator         the violation core, diffed before/after the ADD.
//
// ── THE stateHash CONSTRAINT, AND WHAT IT FORCED ─────────────────────────────
// The create planner's stateHash is `fnv1a({create: payload, walls: allWalls})`.
// So for ARM 2 — where the difference MUST ride in the body with stateHash held
// EQUAL — neither the payload nor the wall store may move. That rules out the
// obvious "different baseline geometry" pair: it moves the payload, so it moves
// the stateHash, and it would prove nothing about body coverage (measured:
// stateHash 392a3afc → 377b954a). Different-geometry is therefore used where it
// is honest — as the NEGATIVE CONTROL, proving the arms can see a difference at
// all — and ARM 2's three pairs are planted in the three body sections a create
// plan actually carries, each reached through a seam the stateHash does not
// cover:
//   2a junction-set-only  (the resolver's junction membership → changed/topology)
//   2b refusal-only       (the occupancy seed → `refused`)
//   2c validation-only    (the validator → `validation.violationsCreated`)
// Each asserts stateHash equality as a FLOOR, exactly as the move arms do.

interface CreateWorld {
  walls: any[];
  rooms: any[];
}

/** A wall as the create planner's `WallData` view expects it (thickness matters:
 *  the junction resolver mitres by thickness, so 0 would flatten every corner). */
const cw = (id: string, a: [number, number], b: [number, number], thickness = 0.2): any => ({
  id, type: 'wall', levelId: 'L1', thickness, height: 2.7, openings: [],
  baseLine: [{ x: a[0], y: 0, z: a[1] }, { x: b[0], y: 0, z: b[1] }],
});

// A closed 6×4 room. The create command below drives a NEW wall from (3,0) to
// (3,4) — endpoints landing exactly ON wall-s and wall-n, which is a T-junction
// at each end: the resolver DETECTS it (measured), so the junction branch returns
// a populated determined set rather than the empty answer a wall floating in
// space would give.
const freshCreateWorld = (northX = 6): CreateWorld => ({
  walls: [
    cw('wall-s', [0, 0], [6, 0]),
    cw('wall-e', [6, 0], [6, 4]),
    cw('wall-n', [northX, 4], [0, 4]),
    cw('wall-w', [0, 4], [0, 0]),
  ],
  // No `computed` block and no polygon: the create planner reads rooms ONLY for
  // `boundingWallIds` (the partition test) and as validator clone fodder. Giving
  // it a move-shaped room with a `computed.area` would imply an area prediction
  // this planner deliberately does not make.
  rooms: [{ id: 'room-1', levelId: 'L1', boundingWallIds: ['wall-s', 'wall-e', 'wall-n', 'wall-w'] }],
});

/** Read-only PlanningContext double. Duplicated from `contextFor` rather than
 *  shared because the create planner reads FIVE stores (wall, room, door, window,
 *  stair — the violation branch clones all five) where the move planner reads
 *  two; a shared factory would have to be a superset, and a superset silently
 *  hands every future family stores its planner never asked for. */
const createContextFor = (world: CreateWorld) => () => ({
  getStore(storeId: string) {
    const items: any[] | undefined =
      storeId === 'wall' ? world.walls
        : storeId === 'room' ? world.rooms
          : storeId === 'door' || storeId === 'window' || storeId === 'stair' ? []
            : undefined;
    if (!items) return undefined;
    return {
      getAll: () => items as readonly unknown[],
      getById: (id: string) => items.find((i) => i.id === id) ?? null,
    };
  },
}) as any;

// The command: a 0.1 m-thick partition dropped between wall-s and wall-n. Thin on
// purpose — the validator below has a 0.15 m floor, so the ADD creates a violation
// and `validation.violationsCreated` is POPULATED (the move harness's discipline:
// hash arms must cover a section that actually carries bytes).
const CREATE_BASELINE = [{ x: 3, y: 0, z: 0 }, { x: 3, y: 0, z: 4 }];
const CREATE_COMMAND = {
  type: 'wall.create' as const,
  payload: { id: 'wall-p', levelId: 'L1', baseLine: CREATE_BASELINE, thickness: 0.1, height: 2.7 },
};

/** Fires on the NEW wall only (0.1 < 0.15) and on nothing in the before-clone, so
 *  the before/after diff yields exactly one `violationsCreated` entry. */
const thicknessValidator = {
  validateAll: (ctx: any) =>
    (ctx.wallStore.getAll() as any[])
      .filter((x) => typeof x.thickness === 'number' && x.thickness < 0.15)
      .map((x) => ({ ruleId: 'WALL_MIN_THICKNESS', elementId: x.id, message: `wall thickness ${x.thickness} m is below the 0.15 m minimum` })),
};

const refusingOccupancy = {
  planOpeningRefit: () => ({ ok: false, refusals: [{ openingId: 'op-1', elementId: 'door-1', reason: 'no-space' }], relocations: [] }),
};
const silentOccupancy = { planOpeningRefit: () => ({ ok: true, refusals: [], relocations: [] }) };

/** Build the REAL service over the REAL create planner. Defaults are the REAL
 *  junction resolver + a refusing occupancy seed + the thickness validator, so
 *  the default plan carries a populated junction set, `refused` and
 *  `violationsCreated` all at once. */
function buildCreateService(world: CreateWorld, opts?: {
  resolve?: typeof resolveJunctionsWithRecords;
  occupancy?: { planOpeningRefit: (c: any) => any };
  validator?: { validateAll: (c: any) => any[] };
  plannerWrap?: (p: WallCreateConsequencePlanner) => { plan: (c: any, ctx: any) => Promise<any> };
}): ConsequencePreviewService {
  const planner = new WallCreateConsequencePlanner({
    resolveJunctions: (opts?.resolve ?? resolveJunctionsWithRecords) as any,
    occupancy: (opts?.occupancy ?? refusingOccupancy) as any,
    validator: (opts?.validator ?? thicknessValidator) as any,
  });
  const subject = opts?.plannerWrap ? opts.plannerWrap(planner) : planner;
  const planners = new Map<string, any>();
  planners.set('wall.create', subject);
  return new ConsequencePreviewService(planners as any, createContextFor(world));
}

async function wallCreateHarness(): Promise<{ floors: Floor[]; lines: string[]; findings: string[] }> {
  const floors: Floor[] = [];
  const lines: string[] = [];
  const findings: string[] = [];

  // ── ARM 1 · REPEAT — the REAL resolver, the REAL planner, the REAL service ──
  const world = freshCreateWorld();
  const service = buildCreateService(world);
  const runA = await service.preview(CREATE_COMMAND);
  const runB = await service.preview(CREATE_COMMAND);
  floors.push({ what: 'wall.create: real preview produced a plan (run A)', measured: runA ? 1 : 0, min: 1 });
  floors.push({ what: 'wall.create: real preview produced a plan (run B)', measured: runB ? 1 : 0, min: 1 });
  if (runA && runB) {
    // The body must actually CARRY the sections the arms claim to cover, or the
    // byte comparison is over an empty plan and proves nothing.
    floors.push({ what: 'wall.create: plan carries topology.added (the newcomer)', measured: (runA as any).topology?.added?.length ?? 0, min: 1 });
    floors.push({ what: 'wall.create: plan carries topology.modified (existing corners the newcomer re-cuts — the REAL junction diff)', measured: (runA as any).topology?.modified?.length ?? 0, min: 1 });
    floors.push({ what: 'wall.create: plan carries violationsCreated (validation section populated by the ADD)', measured: runA.validation.violationsCreated.length, min: 1 });
    floors.push({ what: 'wall.create: plan carries refused entries (the occupancy seed section populated)', measured: (runA as any).refused?.length ?? 0, min: 1 });
    floors.push({ what: 'wall.create: plan carries undetermined entries (declared blind spots, not silent emptiness)', measured: (runA as any).undetermined?.length ?? 0, min: 1 });
    const c = compareRuns(runA, runB);
    if (c.verdict !== 'identical') findings.push(`ARM 1 · REPEAT [wall.create][${c.verdict}]: ${c.detail}`);
    lines.push(`${c.verdict === 'identical' ? '✓ ' : '❌'} ARM 1 · wall.create REPEAT: ${c.detail}`);
  }

  // ── ARM 5 · NONDETERMINISM SOURCES — 30 ms apart, clock AND RNG spoofed ─────
  // The create planner has TWO places a random source would be structurally
  // tempting: `createId('wall')` when the payload omits an id (it answers with a
  // payload-derived placeholder instead), and the resolver's clustering. Both are
  // covered here, and the id-absent case gets its own repeat below.
  const realNow = Date.now;
  const realRandom = Math.random;
  let clockReads = 0;
  let rngReads = 0;
  const planUnder = async (now: number, rand: number, cmd: any = CREATE_COMMAND): Promise<Plan | null> => {
    Date.now = () => { clockReads++; return now; };
    Math.random = () => { rngReads++; return rand; };
    try { return await buildCreateService(freshCreateWorld()).preview(cmd); }
    finally { Date.now = realNow; Math.random = realRandom; }
  };
  const t1 = await planUnder(1_000_000_000, 0.1111);
  await sleep(30);
  const t2 = await planUnder(9_999_999_999, 0.9999);
  floors.push({ what: 'wall.create: time-arm produced both plans', measured: t1 && t2 ? 1 : 0, min: 1 });
  if (t1 && t2) {
    const c = compareRuns(t1, t2);
    if (c.verdict !== 'identical') findings.push(`ARM 5 · TIME/RNG [wall.create][${c.verdict}]: plans planned 30 ms apart under DIFFERENT spoofed Date.now/Math.random diverged — a clock or RNG read reaches the plan. ${c.detail}`);
    lines.push(`${c.verdict === 'identical' ? '✓ ' : '❌'} ARM 5 · wall.create TIME/RNG: 30 ms apart, Date.now spoofed 1000000000 vs 9999999999, Math.random 0.1111 vs 0.9999 → ${c.verdict} (planner path observed ${clockReads} Date.now / ${rngReads} Math.random reads)`);
  }

  // The id-ABSENT create — the case where the live handler mints a ULID. The
  // planner must name the newcomer by a payload-DERIVED placeholder, so two runs
  // under different spoofed clocks and RNG must still be byte-identical. This is
  // create-specific: `wall.move` has no unminted-id case to get wrong.
  const anonCmd = { type: 'wall.create' as const, payload: { levelId: 'L1', baseLine: CREATE_BASELINE, thickness: 0.1, height: 2.7 } };
  const a1 = await planUnder(1_234_567, 0.4242, anonCmd);
  await sleep(30);
  const a2 = await planUnder(7_654_321, 0.8484, anonCmd);
  floors.push({ what: 'wall.create: id-absent (ULID-minting) arm produced both plans', measured: a1 && a2 ? 1 : 0, min: 1 });
  if (a1 && a2) {
    const placeholderStable = (a1 as any).topology.added[0] === (a2 as any).topology.added[0] ? 1 : 0;
    floors.push({ what: 'wall.create: the id-absent newcomer is named by a payload-DERIVED placeholder, identical across runs (no id minting in the planner)', measured: placeholderStable, min: 1 });
    const c = compareRuns(a1, a2);
    if (c.verdict !== 'identical') findings.push(`ARM 5 · TIME/RNG [wall.create · id-absent][${c.verdict}]: a create with NO id planned two different futures — the placeholder is not payload-derived. ${c.detail}`);
    lines.push(`${c.verdict === 'identical' ? '✓ ' : '❌'} ARM 5 · wall.create id-absent: no payload id, clocks/RNG differing → ${c.verdict} (placeholder ${(a1 as any).topology.added[0]})`);
  }

  // ── ARM 2 · SENSITIVITY — one consequential fact each, stateHash held EQUAL ──
  const pairHash = async (label: string, a: ConsequencePreviewService, b: ConsequencePreviewService, fact: string): Promise<void> => {
    const pa = await a.preview(CREATE_COMMAND);
    const pb = await b.preview(CREATE_COMMAND);
    floors.push({ what: `wall.create: sensitivity pair "${label}" produced both plans`, measured: pa && pb ? 1 : 0, min: 1 });
    if (!pa || !pb) return;
    floors.push({ what: `wall.create: sensitivity pair "${label}" holds stateHash EQUAL (the difference rides in the BODY)`, measured: pa.stateHash === pb.stateHash ? 1 : 0, min: 1 });
    if (pa.planHash === pb.planHash) {
      findings.push(`ARM 2 · SENSITIVITY [wall.create · ${label}]: two plans differing in ${fact} share planHash ${pa.planHash} — the d63e7954 collision class is OPEN on the create row.`);
      lines.push(`❌ ARM 2 · wall.create ${label}: planHash DID NOT MOVE (${pa.planHash}) for a difference in ${fact}`);
    } else {
      lines.push(`✓  ARM 2 · wall.create ${label}: planHash moved (${pa.planHash} → ${pb.planHash}) on ${fact}, with stateHash equal (${pa.stateHash})`);
    }
  };

  // 2a · junction-set-only. The REAL resolver on one side; on the other, the REAL
  // resolver with the candidate↔wall-n junction record withheld. The wall store
  // and payload are byte-identical, so the ONLY difference is which existing
  // walls the junction diff reports — `changed` and `topology.modified` move,
  // nothing else does.
  const narrowedResolver = ((walls: any, opts: any) => {
    const r = resolveJunctionsWithRecords(walls, opts);
    return { miters: r.miters, junctions: r.junctions.filter((j: any) => !(j.wallIds.includes('wall-p') && j.wallIds.includes('wall-n'))) };
  }) as typeof resolveJunctionsWithRecords;
  await pairHash('junction-set-only',
    buildCreateService(freshCreateWorld()),
    buildCreateService(freshCreateWorld(), { resolve: narrowedResolver }),
    'ONLY the junction membership the resolver reports (the candidate↔wall-n record present vs withheld); wall store and payload byte-identical');

  // 2b · refusal-only. The occupancy seed refuses on one side and is silent on
  // the other: the `refused` section is the only body difference.
  await pairHash('refusal-only',
    buildCreateService(freshCreateWorld(), { occupancy: silentOccupancy }),
    buildCreateService(freshCreateWorld(), { occupancy: refusingOccupancy }),
    'ONLY the opening-refit `refused` section (seed silent vs refusing door-1)');

  // 2c · validation-only. The validator's floor moves so the ADD creates a
  // violation on one side and none on the other: `violationsCreated` alone.
  await pairHash('validation-only',
    buildCreateService(freshCreateWorld(), { validator: { validateAll: () => [] } }),
    buildCreateService(freshCreateWorld()),
    'ONLY validation.violationsCreated (the ADD trips WALL_MIN_THICKNESS vs a validator that finds nothing)');

  // ── ARM 3 · INSENSITIVITY ────────────────────────────────────────────────────
  const svcKeys = buildCreateService(freshCreateWorld());
  const orderedA = await svcKeys.preview(CREATE_COMMAND);
  const orderedB = await svcKeys.preview({
    type: 'wall.create',
    payload: { height: 2.7, thickness: 0.1, baseLine: CREATE_BASELINE, levelId: 'L1', id: 'wall-p' },
  } as any);
  floors.push({ what: 'wall.create: key-order pair produced both plans', measured: orderedA && orderedB ? 1 : 0, min: 1 });
  if (orderedA && orderedB) {
    if (orderedA.planHash !== orderedB.planHash) {
      findings.push(`ARM 3 · INSENSITIVITY [wall.create · key-order]: permuting payload key insertion order moved the planHash (${orderedA.planHash} → ${orderedB.planHash}) — stableStringify is not doing its one job on the create row.`);
      lines.push('❌ ARM 3 · wall.create key-order: payload key permutation MOVED the planHash');
    } else {
      lines.push(`✓  ARM 3 · wall.create key-order: payload {id,levelId,baseLine,thickness,height} vs {height,thickness,baseLine,levelId,id} → same planHash (${orderedA.planHash})`);
    }
  }

  // Envelope provenance — same shape of proof as the move harness: the planner
  // surface accepts no CommandExecutionContext, so two dispatch-side envelopes
  // differing in actor/origin/timestamp/approval, each planned under ITS OWN
  // spoofed clock, must yield BYTE-identical plans.
  const envelopes = [
    { actor: 'human', origin: 'direct-manipulation', timestamp: 1_111_111, gestureId: 'g-human-1' },
    { actor: 'ai', origin: 'ai-proposal', timestamp: 9_999_999, gestureId: 'g-ai-2', approval: { approvedBy: 'user-7', planHash: 'stale-cafe' } },
  ] as const;
  const envPlans: (Plan | null)[] = [];
  for (const env of envelopes) {
    Date.now = () => env.timestamp;
    try { envPlans.push(await buildCreateService(freshCreateWorld()).preview(CREATE_COMMAND)); }
    finally { Date.now = realNow; }
  }
  floors.push({ what: 'wall.create: envelope pair produced both plans', measured: envPlans[0] && envPlans[1] ? 1 : 0, min: 1 });
  if (envPlans[0] && envPlans[1]) {
    const c = compareRuns(envPlans[0], envPlans[1]);
    if (c.verdict !== 'identical') findings.push(`ARM 3 · INSENSITIVITY [wall.create · envelope]: actor/origin/timestamp/approval differences leaked into the plan — provenance must stay OFF the plan (C78 §9). ${c.detail}`);
    lines.push(`${c.verdict === 'identical' ? '✓ ' : '❌'} ARM 3 · wall.create envelope: human/direct vs ai/proposal+approval, clocks 1111111 vs 9999999 → ${c.verdict}`);
  }

  // ── POSITIVE CONTROL (floor) — a nondeterministic create planner MUST be flagged
  const noisy = buildCreateService(freshCreateWorld(), {
    plannerWrap: (real) => ({
      plan: async (c: any, ctx: any) => {
        const p = await real.plan(c, ctx);
        return { ...p, undetermined: [...p.undetermined, { scope: 'noise', reason: 'ENGINE_NOT_AVAILABLE', detail: `t=${realNow()}·r=${realRandom()}` }] };
      },
    }),
  });
  const n1 = await noisy.preview(CREATE_COMMAND);
  const n2 = await noisy.preview(CREATE_COMMAND);
  const noisyVerdict = n1 && n2 ? compareRuns(n1, n2) : null;
  floors.push({ what: 'POSITIVE control (wall.create): a deliberately NONDETERMINISTIC planner is FLAGGED by the repeat checker', measured: noisyVerdict && noisyVerdict.verdict !== 'identical' ? 1 : 0, min: 1 });
  floors.push({ what: 'POSITIVE control (wall.create): the checker CLASSIFIES it as the hash-bug shape (bodies differ, hash equal)', measured: noisyVerdict?.verdict === 'hash-bug' ? 1 : 0, min: 1 });
  lines.push(`${noisyVerdict && noisyVerdict.verdict !== 'identical' ? '✓ ' : '❌'} POSITIVE control (wall.create): nondeterministic planner → ${noisyVerdict?.verdict ?? 'NO PLANS'}`);

  // ── NEGATIVE CONTROL (floor) — genuinely different states must hash apart ────
  // wall-n runs to x=9 instead of x=6, so the level the newcomer joins is
  // ACTUALLY different. This is where different geometry belongs: it moves the
  // stateHash, which is exactly why it cannot serve as an ARM 2 pair.
  const g1 = await buildCreateService(freshCreateWorld(6)).preview(CREATE_COMMAND);
  const g2 = await buildCreateService(freshCreateWorld(9)).preview(CREATE_COMMAND);
  const negSeen = g1 && g2 && g1.planHash !== g2.planHash ? 1 : 0;
  floors.push({ what: 'NEGATIVE control (wall.create): two GENUINELY different states produce different planHashes (the sensitivity arms can see)', measured: negSeen, min: 1 });
  floors.push({ what: 'NEGATIVE control (wall.create): and their stateHashes differ too, confirming the difference is in the AUTHORITATIVE state, not only the body', measured: g1 && g2 && g1.stateHash !== g2.stateHash ? 1 : 0, min: 1 });
  lines.push(`${negSeen ? '✓ ' : '❌'} NEGATIVE control (wall.create): wall-n from x=6 vs x=9 → planHash ${g1?.planHash} vs ${g2?.planHash}`);

  return { floors, lines, findings };
}

const HARNESSES: Record<string, Harness> = {
  'wall.move': wallMoveHarness,
  'wall.create': wallCreateHarness,
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
