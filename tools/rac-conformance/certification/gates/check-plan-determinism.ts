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
import { OpeningMoveConsequencePlanner } from '../../../../apps/editor/src/engine/consequence/OpeningMoveConsequencePlanner.js';
import { WallOpeningCreateConsequencePlanner } from '../../../../apps/editor/src/engine/consequence/WallOpeningCreateConsequencePlanner.js';
import { OpeningDeleteConsequencePlanner } from '../../../../apps/editor/src/engine/consequence/OpeningDeleteConsequencePlanner.js';
import { ConsequencePreviewService } from '../../../../apps/editor/src/engine/consequence/ConsequencePreviewService.js';
import { predictRoomGeometry } from '../../../../packages/room-topology/src/predictRoomGeometry.js';
import { resolveJunctionsWithRecords } from '../../../../packages/geometry-wall/src/JunctionResolverV2.js';
// The REAL occupancy store — the host-fit clamp and the sibling-collision reader the
// opening.move harness drives. Imported from its module rather than the package barrel: the
// barrel pulls WallStore and the render-side builders, several of which touch `window.*` at
// module scope and would throw at collection in this node-env gate.
import { wallOccupancyStore } from '../../../../packages/geometry-wall/src/WallOccupancyStore.js';

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

// ─── opening.move · the THIRD family ──────────────────────────────────────────
//
// Neither wall harness is transcribable here, and for a sharper reason than the one
// separating move from create. Both wall rows reason about a HOST. This row reasons about a
// HOSTED element, which C15 §2 gives NO independent world coordinate at all: its position is
// a scalar `offset` measured along its host's baseline. So the seams invert completely —
// there is no junction resolver to diff, no room predictor to script, and no baseline in the
// payload. What there IS instead:
//
//   clamp      WallOccupancyStore.clampToWall — the REAL one, not a script. It is the host-fit
//              rule (C15 §5) and the refit/refuse decision of C70 F-INV-3 rides on it.
//   collision  WallOccupancyStore.canPlace — sibling occupancy, 1-D span overlap with the
//              element's own slot excluded (§MOVE-EXCLUDE-SELF).
//   validator  the violation core, diffed before/after the offset write.
//
// ── THE stateHash CONSTRAINT, AND WHAT IT FORCED (the create harness's lesson, re-derived) ─
// This planner's stateHash is `fnv1a({openingMove: payload, walls: allWalls})`. So for ARM 2 —
// where the difference MUST ride in the BODY with stateHash held EQUAL — neither the payload
// nor the wall store may move. That rules out every obvious pair: a different requested
// offset moves the payload; a sibling at a different position moves the wall store; a
// shorter host moves the wall store. All three would prove nothing about body coverage.
//
// ⚠ AND IT RULES OUT MORE HERE THAN IT DID FOR CREATE. The create planner had three
// INJECTED seams whose outputs are not derived from the hashed state, so three body sections
// could be moved independently. This planner's clamp and collision seams are PURE FUNCTIONS
// OF THE HASHED STATE: given the same wall and the same payload, the real store returns the
// same verdict every time. A pair that varies them must therefore vary them THROUGH THE SEAM
// ITSELF — by injecting a differently-behaving reader over byte-identical state. That is
// exactly what the pairs below do, and it is why each one asserts stateHash equality as a
// FLOOR rather than assuming it: a pair that accidentally moved the state would silently
// stop testing the body, which is the inert-arm failure this gate's own header warns about.
//
//   2a fit-verdict-only    (the clamp lands the element at a different offset → `metrics`,
//                           `changed`, and the refit declaration)
//   2b refusal-only        (the collision reader refuses vs clears → `refused` + `excluded`)
//   2c validation-only     (the validator finds a violation vs nothing → `violationsCreated`)
//
// ── ARM 2's INERT-ARM CHECK, RUN AND REPORTED ────────────────────────────────
// The wall.create lane found one of its own arms testing nothing because a branch reported
// regardless of the seam. So each pair below additionally asserts, as a FLOOR, that the BODY
// SECTION it claims to move is actually POPULATED on at least one side. A pair whose section
// is empty on both sides would still pass a naive "hashes differ" check — the hashes would
// differ for some OTHER reason — and would be an arm testing nothing. Those floors are what
// make the arm load-bearing rather than merely green.

interface OpeningWorld {
  walls: any[];
}

/** A 6 m wall hosting a 0.9 m door at 0.5 and a 1.2 m window at 3.0. The 1.6 m gap between
 *  them is what lets ONE fixture express a clean move, a colliding move and a clamped move. */
const freshOpeningWorld = (): OpeningWorld => ({
  walls: [
    {
      id: 'wall-1', type: 'wall', levelId: 'L1', height: 2.7, thickness: 0.2,
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
      openings: [
        { id: 'op-d1', elementId: 'door-1', type: 'door', offset: 0.5, width: 0.9, height: 2.1, sillHeight: 0 },
        { id: 'op-w1', elementId: 'win-1', type: 'window', offset: 3.0, width: 1.2, height: 1.2, sillHeight: 0.9 },
      ],
    },
  ],
});

/** Read-only PlanningContext double. Duplicated rather than shared for the same reason the
 *  create harness duplicates its own: this planner reads five stores, and a shared superset
 *  factory hands every future family stores its planner never asked for. */
const openingContextFor = (world: OpeningWorld) => () => ({
  getStore(storeId: string) {
    const items: any[] | undefined =
      storeId === 'wall' ? world.walls
        : storeId === 'room' || storeId === 'door' || storeId === 'window' || storeId === 'stair' ? []
          : undefined;
    if (!items) return undefined;
    return {
      getAll: () => items as readonly unknown[],
      getById: (id: string) => items.find((i) => i.id === id) ?? null,
    };
  },
}) as any;

// The command as the LIVE bus verb carries it — `door.setOffset`, no wallId, so the harness
// drives the planner's REVERSE-SCAN host resolution, which is the production path. Sliding
// door-1 from 0.5 to 1.8 lands it at [1.800, 2.700]: clear of win-1 at [3.000, 4.200].
const OPENING_COMMAND = {
  type: 'door.setOffset' as const,
  payload: { doorId: 'door-1', newOffset: 1.8, prevOffset: 0.5 },
};

/** Fires on any wall whose opening count exceeds 1 — so the fixture's two-opening host trips
 *  it on BOTH sides of the diff, keeping `violationsCreated` empty by default. 2c swaps in a
 *  validator that fires only AFTER, so that section carries bytes on exactly one side. */
const quietValidator = { validateAll: () => [] as any[] };

/** Fires when a door sits past the 1.5 m mark — silent before (0.5), firing after (1.8), so
 *  `validation.violationsCreated` is POPULATED and the hash arms cover that section too. */
const offsetValidator = {
  validateAll: (ctx: any) =>
    (ctx.wallStore.getAll() as any[]).flatMap((w) =>
      (w.openings ?? [])
        .filter((o: any) => o.type === 'door' && typeof o.offset === 'number' && o.offset > 1.5)
        .map((o: any) => ({ ruleId: 'DOOR_MAX_OFFSET', elementId: o.elementId, message: `door offset ${o.offset} m exceeds the 1.5 m maximum` })),
    ),
};

/** Build the REAL service over the REAL opening planner. Defaults are the REAL occupancy
 *  store on both seams — so the fit and collision verdicts under test are the PRODUCTION
 *  rules — plus the offset validator, giving a default plan that carries `metrics`,
 *  `changed`, `excluded` and `violationsCreated` all at once. */
function buildOpeningService(world: OpeningWorld, opts?: {
  clamp?: any;
  collision?: any;
  validator?: { validateAll: (c: any) => any[] };
  plannerWrap?: (p: OpeningMoveConsequencePlanner) => { plan: (c: any, ctx: any) => Promise<any> };
}): ConsequencePreviewService {
  const planner = new OpeningMoveConsequencePlanner({
    clamp: (opts?.clamp ?? wallOccupancyStore) as any,
    collision: (opts?.collision ?? wallOccupancyStore) as any,
    validator: (opts?.validator ?? offsetValidator) as any,
  });
  const subject = opts?.plannerWrap ? opts.plannerWrap(planner) : planner;
  const planners = new Map<string, any>();
  planners.set('opening.move', subject);
  return new ConsequencePreviewService(planners as any, openingContextFor(world));
}

async function openingMoveHarness(): Promise<{ floors: Floor[]; lines: string[]; findings: string[] }> {
  const floors: Floor[] = [];
  const lines: string[] = [];
  const findings: string[] = [];

  // ── ARM 1 · REPEAT — the REAL occupancy store, the REAL planner, the REAL service ──
  const world = freshOpeningWorld();
  const service = buildOpeningService(world);
  const runA = await service.preview(OPENING_COMMAND);
  const runB = await service.preview(OPENING_COMMAND);
  floors.push({ what: 'opening.move: real preview produced a plan (run A)', measured: runA ? 1 : 0, min: 1 });
  floors.push({ what: 'opening.move: real preview produced a plan (run B)', measured: runB ? 1 : 0, min: 1 });
  if (runA && runB) {
    // The body must actually CARRY the sections the arms claim to cover, or the byte
    // comparison is over an empty plan and proves nothing. This is the create harness's
    // discipline, applied to the sections an opening plan actually has.
    floors.push({ what: 'opening.move: plan carries changed entries (the opening AND its host)', measured: runA.changed.length, min: 2 });
    floors.push({ what: 'opening.move: plan carries topology.modified (the host whose openings array moves)', measured: (runA as any).topology?.modified?.length ?? 0, min: 1 });
    floors.push({ what: 'opening.move: plan carries excluded entries (siblings CHECKED and found clear — the positive verdict)', measured: (runA as any).excluded?.length ?? 0, min: 1 });
    floors.push({ what: 'opening.move: plan carries a metric transition (offset before→after)', measured: (runA as any).metrics?.length ?? 0, min: 1 });
    floors.push({ what: 'opening.move: plan carries violationsCreated (validation section populated by the offset write)', measured: runA.validation.violationsCreated.length, min: 1 });
    floors.push({ what: 'opening.move: plan carries undetermined entries (declared blind spots, not silent emptiness)', measured: (runA as any).undetermined?.length ?? 0, min: 1 });
    // F-INV-3 clause 3, asserted in the GATE and not only in the unit suite: no plan this
    // family produces may ever remove a hosted element.
    floors.push({ what: 'opening.move: C70 F-INV-3 — topology.removed is EMPTY (a hosted element is never deleted to make room)', measured: ((runA as any).topology?.removed?.length ?? 0) === 0 ? 1 : 0, min: 1 });
    const c = compareRuns(runA, runB);
    if (c.verdict !== 'identical') findings.push(`ARM 1 · REPEAT [opening.move][${c.verdict}]: ${c.detail}`);
    lines.push(`${c.verdict === 'identical' ? '✓ ' : '❌'} ARM 1 · opening.move REPEAT: ${c.detail}`);
  }

  // ── ARM 5 · NONDETERMINISM SOURCES — 30 ms apart, clock AND RNG spoofed ─────
  const realNow = Date.now;
  const realRandom = Math.random;
  let clockReads = 0;
  let rngReads = 0;
  const planUnder = async (now: number, rand: number, cmd: any = OPENING_COMMAND): Promise<Plan | null> => {
    Date.now = () => { clockReads++; return now; };
    Math.random = () => { rngReads++; return rand; };
    try { return await buildOpeningService(freshOpeningWorld()).preview(cmd); }
    finally { Date.now = realNow; Math.random = realRandom; }
  };
  const t1 = await planUnder(1_000_000_000, 0.1111);
  await sleep(30);
  const t2 = await planUnder(9_999_999_999, 0.9999);
  floors.push({ what: 'opening.move: time-arm produced both plans', measured: t1 && t2 ? 1 : 0, min: 1 });
  if (t1 && t2) {
    const c = compareRuns(t1, t2);
    if (c.verdict !== 'identical') findings.push(`ARM 5 · TIME/RNG [opening.move][${c.verdict}]: plans planned 30 ms apart under DIFFERENT spoofed Date.now/Math.random diverged — a clock or RNG read reaches the plan. ${c.detail}`);
    lines.push(`${c.verdict === 'identical' ? '✓ ' : '❌'} ARM 5 · opening.move TIME/RNG: 30 ms apart, Date.now spoofed 1000000000 vs 9999999999, Math.random 0.1111 vs 0.9999 → ${c.verdict} (planner path observed ${clockReads} Date.now / ${rngReads} Math.random reads)`);
  }

  // The REVERSE-SCAN arm — opening.move-specific, and the analogue of the create harness's
  // id-absent case. With no `wallId` in the payload (which is what the live verbs carry), the
  // planner resolves the host by scanning the wall store. A scan whose ORDER depended on the
  // store's iteration order would be a nondeterminism source no clock spoof could catch, so
  // the scan sorts by id first. Here the SAME world is presented with its wall list in two
  // different orders: the plans must still be byte-identical.
  const twoHosts = (order: 'ab' | 'ba'): OpeningWorld => {
    const a = freshOpeningWorld().walls[0];
    const b = { ...freshOpeningWorld().walls[0], id: 'wall-2', openings: [] as any[] };
    return { walls: order === 'ab' ? [a, b] : [b, a] };
  };
  const s1 = await buildOpeningService(twoHosts('ab')).preview(OPENING_COMMAND);
  const s2 = await buildOpeningService(twoHosts('ba')).preview(OPENING_COMMAND);
  floors.push({ what: 'opening.move: reverse-scan arm produced both plans', measured: s1 && s2 ? 1 : 0, min: 1 });
  if (s1 && s2) {
    // stateHash DOES move here (the wall array order is part of the hashed state), so this is
    // a plan-BODY claim, not a byte-identity claim: the resolved host, the changed set and the
    // metric must be the same regardless of store order.
    const same =
      JSON.stringify({ c: s1.changed, m: (s1 as any).metrics, e: s1.excluded }) ===
      JSON.stringify({ c: s2.changed, m: (s2 as any).metrics, e: s2.excluded });
    floors.push({ what: 'opening.move: the host resolved by REVERSE SCAN is independent of wall-store iteration order', measured: same ? 1 : 0, min: 1 });
    lines.push(`${same ? '✓ ' : '❌'} ARM 5 · opening.move reverse-scan: wall list [wall-1,wall-2] vs [wall-2,wall-1] → same resolved host and same changed/metrics/excluded`);
    if (!same) findings.push('ARM 5 · TIME/RNG [opening.move · reverse-scan]: the host resolved by the no-index reverse scan depends on wall-store iteration order — the plan is not a pure function of state.');
  }

  // ── ARM 2 · SENSITIVITY — one consequential fact each, stateHash held EQUAL ──
  //
  // `section` is the INERT-ARM CHECK: the name of the body section this pair claims to move,
  // plus a reader for it. The pair asserts (a) both plans exist, (b) stateHash is EQUAL,
  // (c) the section is POPULATED on at least one side, (d) the ELEMENT SETS are IDENTICAL on
  // both sides unless the pair declares otherwise, and only then (e) the planHash moved.
  //
  // (c) alone is NOT sufficient, and this gate learned that the hard way on the `refusal-only`
  // pair below: a populated section proves the arm has bytes to SEE, not that the bytes it
  // sees are the ones it NAMES. (d) is the clause that closes it — `changed`, `excluded` and
  // `topology.modified` are hashed independently of every named section, so a pair whose two
  // sides differ in those sets can pass on the SET difference while the section it advertises
  // is entirely absent from the hash. A pair that legitimately moves the sets (there is one:
  // `fit-verdict-only` does not, but a future row may) opts out via `setsMayDiffer`, and must
  // then say WHY in its `fact` string.
  const pairHash = async (
    label: string,
    a: ConsequencePreviewService,
    b: ConsequencePreviewService,
    fact: string,
    section: { name: string; read: (p: Plan) => number; setsMayDiffer?: boolean },
  ): Promise<void> => {
    const setsOf = (p: Plan): string =>
      JSON.stringify({ c: p.changed, e: p.excluded, t: p.topology.modified });
    const pa = await a.preview(OPENING_COMMAND);
    const pb = await b.preview(OPENING_COMMAND);
    floors.push({ what: `opening.move: sensitivity pair "${label}" produced both plans`, measured: pa && pb ? 1 : 0, min: 1 });
    if (!pa || !pb) return;
    floors.push({ what: `opening.move: sensitivity pair "${label}" holds stateHash EQUAL (the difference rides in the BODY)`, measured: pa.stateHash === pb.stateHash ? 1 : 0, min: 1 });
    // THE INERT-ARM FLOORS — both halves.
    const populated = Math.max(section.read(pa), section.read(pb));
    floors.push({ what: `opening.move: sensitivity pair "${label}" is NOT INERT — the body section it names (${section.name}) is populated on at least one side`, measured: populated, min: 1 });
    if (section.setsMayDiffer !== true) {
      floors.push({
        what: `opening.move: sensitivity pair "${label}" holds the ELEMENT SETS identical (changed/excluded/topology.modified) — so the planHash can only move via ${section.name}, not via a co-varying set`,
        measured: setsOf(pa) === setsOf(pb) ? 1 : 0,
        min: 1,
      });
    }
    if (pa.planHash === pb.planHash) {
      findings.push(`ARM 2 · SENSITIVITY [opening.move · ${label}]: two plans differing in ${fact} share planHash ${pa.planHash} — the d63e7954 collision class is OPEN on the opening row.`);
      lines.push(`❌ ARM 2 · opening.move ${label}: planHash DID NOT MOVE (${pa.planHash}) for a difference in ${fact}`);
    } else {
      lines.push(`✓  ARM 2 · opening.move ${label}: planHash moved (${pa.planHash} → ${pb.planHash}) on ${fact}, stateHash equal (${pa.stateHash}), section ${section.name} populated (${populated})`);
    }
  };

  // 2a · metric-value-only. BOTH sides use a clamp that shifts the landing offset, by amounts
  // that differ by 0.4 µm: +0.2500000 m vs +0.2500004 m.
  //
  // ⚠ TWO inert-arm cases were caught building this one, and the sub-micron shift is what
  // finally isolated the section. Recorded in full, because each is a way a future row could
  // build an arm that reports green while testing nothing:
  //
  //   ATTEMPT 1 — the REAL clamp (which does not move the offset) against a shifting one.
  //   Measured, that pair differed in TWO sections: `metrics[].after` AND `undetermined`,
  //   because a clamp that moves the offset makes the planner emit its GEOMETRY_UNPREDICTABLE
  //   refit declaration which the unshifted side does not have. Under the mutation that
  //   deletes `metrics` from the hashed body, the pair STILL passed — on the `undetermined`
  //   difference alone. It NAMED `metrics` and TESTED `undetermined`.
  //
  //   ATTEMPT 2 — shifting on both sides by 0.25 m vs 0.50 m. Better: the refit declaration is
  //   now present on both. But the declaration QUOTES the landing offset (`… REFIT … to
  //   2.050 m`), so the two sides still differed inside `undetermined` as well, and the pair
  //   still passed under the same mutation.
  //
  //   THIS VERSION — the two shifts round to the SAME three-decimal text, so the refit
  //   declaration is byte-identical on both sides, while `metrics[].after` (an unrounded
  //   number) differs. Measured directly: changed, excluded, undetermined, validation and
  //   topology are all IDENTICAL, and `metrics` is the sole differing section. Re-verified by
  //   mutation: with `metrics` stripped from the hashed body this pair goes RED.
  //
  // It also tests something worth testing on its own terms — that the plan hash has SUB-
  // MILLIMETRE resolution on a committed quantity. C73's tolerance policy is millimetre-grade,
  // so a hash that quantised to the displayed 3 dp would let an approval bind a plan whose
  // committed offset differs from the approved one below the printing threshold.
  const shiftedClamp = (by: number) => ({
    clampToWall: (wall: any, dims: any) => {
      const r = wallOccupancyStore.clampToWall(wall, dims);
      return { ...r, offset: r.offset + by };
    },
  });
  await pairHash('metric-value-only',
    buildOpeningService(freshOpeningWorld(), { clamp: shiftedClamp(0.25), validator: quietValidator }),
    buildOpeningService(freshOpeningWorld(), { clamp: shiftedClamp(0.2500004), validator: quietValidator }),
    'ONLY metrics[].after — the landing offset differs by 0.4 µm, which rounds to the SAME 3-dp text, so every other section (changed, excluded, undetermined, validation, topology) is byte-identical and the hash can move through metrics alone',
    { name: 'metrics', read: (p) => (p as any).metrics?.length ?? 0 });

  // 2b · refusal-TEXT-only.
  //
  // ⚠ THE INERT ARM THIS REPLACES, AND HOW IT WAS CAUGHT. The first draft of this pair put a
  // CLEARING reader on one side and a REFUSING one on the other, and it printed green. It was
  // INERT with respect to the section it named. Measured (probe, both planners run directly):
  //
  //     clear   → changed ["door-1","wall-1"] · excluded ["win-1"] · topology.modified ["wall-1"]
  //     refuse  → changed []                  · excluded []        · topology.modified []
  //
  // A refusal COLLAPSES all three element sets, because a refused move changes nothing. Those
  // sets are hashed independently of `refused`, so the planHash moved for a reason that had
  // nothing to do with whether `refused` is covered at all. The mutation proof made it
  // explicit: with `refused` DELETED from the hashed body, the old pair still passed.
  //
  // The fix is to hold the SETS EQUAL and vary only the refusal CONTENT — two readers that
  // both refuse, naming different conflicting siblings. Both sides then produce
  // `changed: []`, `excluded: []`, `topology.modified: []`, and the ONLY differing bytes are
  // inside `refused[].reason`. Now the arm can only pass if `refused` is genuinely hashed —
  // re-verified by the same mutation, under which this pair goes RED.
  //
  // This is the general lesson for a future row, and it is why the `section` floor alone is
  // not sufficient: a populated section proves the arm has BYTES to see, not that the bytes
  // it sees are the ones it names. A pair must also hold every CO-VARYING section fixed.
  // Both clamps REFUSE on width — so the move does not proceed on either side and `changed`,
  // `excluded` and `topology.modified` are byte-identically EMPTY — and they differ ONLY in
  // the AVAILABLE number the refusal names (0.400 m vs 0.500 m of host length). The refusal
  // sentence is the only differing byte in either plan.
  //
  // This also makes the arm test the thing C70 F-INV-3 and G-INV-4 actually care about: a
  // refusal names BOTH NUMBERS, so the NUMBERS must be part of what the approval binds. Two
  // refusals that differ only in how much wall is available are two materially different
  // answers to the user, and a hash that could not tell them apart would let an approval of
  // "0.500 m available" bind a plan that says 0.400 m.
  //
  // (A first attempt varied the sibling-collision reader instead, naming a DIFFERENT sibling
  // on each side. The set-equality floor caught it on its first outing: an unmappable conflict
  // id leaves `win-1` in `excluded` on one side and not the other, so that pair would have
  // passed on the SET difference. A second attempt kept one sibling and varied only the
  // reader's `reason` string — also wrong, because for a MAPPED conflict the planner authors
  // its own sentence and the reader's text never reaches the plan. Both are recorded because
  // each is a way a future row could build an arm that reports green while testing nothing.)
  const refusingClamp = (availableM: number) => ({
    clampToWall: (_w: any, d: any) => ({
      offset: 0, width: availableM, height: d.height, sillHeight: d.sillHeight, clamped: true,
    }),
  });
  const clearCollision = { canPlace: () => ({ valid: true, conflictIds: [] as string[] }) };
  await pairHash('refusal-numbers-only',
    buildOpeningService(freshOpeningWorld(), { clamp: refusingClamp(0.4), collision: clearCollision, validator: quietValidator }),
    buildOpeningService(freshOpeningWorld(), { clamp: refusingClamp(0.5), collision: clearCollision, validator: quietValidator }),
    'ONLY the numbers inside the refused section (0.400 m vs 0.500 m of available host length), with changed/excluded/topology BYTE-IDENTICALLY EMPTY on both sides — so the hash cannot move via a co-varying element set',
    { name: 'refused', read: (p) => (p as any).refused?.length ?? 0 });

  // 2c · validation-only. The validator finds the post-move offset violation on one side and
  // nothing on the other: `validation.violationsCreated` alone.
  await pairHash('validation-only',
    buildOpeningService(freshOpeningWorld(), { validator: quietValidator }),
    buildOpeningService(freshOpeningWorld()),
    'ONLY validation.violationsCreated (the move trips DOOR_MAX_OFFSET vs a validator that finds nothing)',
    { name: 'validation.violationsCreated', read: (p) => p.validation.violationsCreated.length });

  // ── ARM 3 · INSENSITIVITY ────────────────────────────────────────────────────
  const svcKeys = buildOpeningService(freshOpeningWorld());
  const orderedA = await svcKeys.preview(OPENING_COMMAND);
  const orderedB = await svcKeys.preview({
    type: 'door.setOffset',
    payload: { prevOffset: 0.5, newOffset: 1.8, doorId: 'door-1' },
  } as any);
  floors.push({ what: 'opening.move: key-order pair produced both plans', measured: orderedA && orderedB ? 1 : 0, min: 1 });
  if (orderedA && orderedB) {
    if (orderedA.planHash !== orderedB.planHash) {
      findings.push(`ARM 3 · INSENSITIVITY [opening.move · key-order]: permuting payload key insertion order moved the planHash (${orderedA.planHash} → ${orderedB.planHash}) — stableStringify is not doing its one job on the opening row.`);
      lines.push('❌ ARM 3 · opening.move key-order: payload key permutation MOVED the planHash');
    } else {
      lines.push(`✓  ARM 3 · opening.move key-order: payload {doorId,newOffset,prevOffset} vs {prevOffset,newOffset,doorId} → same planHash (${orderedA.planHash})`);
    }
  }

  // VERB-SPELLING insensitivity — opening.move-specific, and a real risk on this row rather
  // than a ceremonial one. THREE dispatch spellings normalise onto ONE semantic command
  // (`door.setOffset`, `window.setOffset`, `opening.move`). If the normaliser let the bus
  // verb leak into the semantic payload, the same operation would hash two ways depending on
  // which surface dispatched it, and an approval minted by the tool could not bind a plan
  // re-minted by the AI path. The semantic dispatch and the door dispatch must agree.
  const semanticCmd = { type: 'opening.move' as const, payload: { id: 'door-1', offset: 1.8, prevOffset: 0.5 } };
  const viaDoor = await buildOpeningService(freshOpeningWorld()).preview(OPENING_COMMAND);
  const viaSemantic = await buildOpeningService(freshOpeningWorld()).preview(semanticCmd);
  floors.push({ what: 'opening.move: verb-spelling pair produced both plans', measured: viaDoor && viaSemantic ? 1 : 0, min: 1 });
  if (viaDoor && viaSemantic) {
    const c = compareRuns(viaDoor, viaSemantic);
    if (c.verdict !== 'identical') findings.push(`ARM 3 · INSENSITIVITY [opening.move · verb-spelling]: the SAME operation dispatched as 'door.setOffset' and as 'opening.move' produced different plans — the bus verb is leaking into the semantic command, so one operation hashes two ways. ${c.detail}`);
    lines.push(`${c.verdict === 'identical' ? '✓ ' : '❌'} ARM 3 · opening.move verb-spelling: 'door.setOffset' vs 'opening.move' for one operation → ${c.verdict}`);
  }

  // Envelope provenance — same shape of proof as both wall harnesses.
  const envelopes = [
    { actor: 'human', origin: 'direct-manipulation', timestamp: 1_111_111, gestureId: 'g-human-1' },
    { actor: 'ai', origin: 'ai-proposal', timestamp: 9_999_999, gestureId: 'g-ai-2', approval: { approvedBy: 'user-7', planHash: 'stale-cafe' } },
  ] as const;
  const envPlans: (Plan | null)[] = [];
  for (const env of envelopes) {
    Date.now = () => env.timestamp;
    try { envPlans.push(await buildOpeningService(freshOpeningWorld()).preview(OPENING_COMMAND)); }
    finally { Date.now = realNow; }
  }
  floors.push({ what: 'opening.move: envelope pair produced both plans', measured: envPlans[0] && envPlans[1] ? 1 : 0, min: 1 });
  if (envPlans[0] && envPlans[1]) {
    const c = compareRuns(envPlans[0], envPlans[1]);
    if (c.verdict !== 'identical') findings.push(`ARM 3 · INSENSITIVITY [opening.move · envelope]: actor/origin/timestamp/approval differences leaked into the plan — provenance must stay OFF the plan (C78 §9). ${c.detail}`);
    lines.push(`${c.verdict === 'identical' ? '✓ ' : '❌'} ARM 3 · opening.move envelope: human/direct vs ai/proposal+approval, clocks 1111111 vs 9999999 → ${c.verdict}`);
  }

  // ── POSITIVE CONTROL (floor) — a nondeterministic opening planner MUST be flagged
  const noisy = buildOpeningService(freshOpeningWorld(), {
    plannerWrap: (real) => ({
      plan: async (c: any, ctx: any) => {
        const p = await real.plan(c, ctx);
        return { ...p, undetermined: [...p.undetermined, { scope: 'noise', reason: 'ENGINE_NOT_AVAILABLE', detail: `t=${realNow()}·r=${realRandom()}` }] };
      },
    }),
  });
  const n1 = await noisy.preview(OPENING_COMMAND);
  const n2 = await noisy.preview(OPENING_COMMAND);
  const noisyVerdict = n1 && n2 ? compareRuns(n1, n2) : null;
  floors.push({ what: 'POSITIVE control (opening.move): a deliberately NONDETERMINISTIC planner is FLAGGED by the repeat checker', measured: noisyVerdict && noisyVerdict.verdict !== 'identical' ? 1 : 0, min: 1 });
  floors.push({ what: 'POSITIVE control (opening.move): the checker CLASSIFIES it as the hash-bug shape (bodies differ, hash equal)', measured: noisyVerdict?.verdict === 'hash-bug' ? 1 : 0, min: 1 });
  lines.push(`${noisyVerdict && noisyVerdict.verdict !== 'identical' ? '✓ ' : '❌'} POSITIVE control (opening.move): nondeterministic planner → ${noisyVerdict?.verdict ?? 'NO PLANS'}`);

  // ── NEGATIVE CONTROL (floor) — genuinely different states must hash apart ────
  // The sibling window sits at 3.0 on one side and 2.0 on the other, which genuinely changes
  // the occupancy answer for the proposed span. This is where different STATE belongs: it
  // moves the stateHash, which is exactly why it cannot serve as an ARM 2 pair.
  const moved = freshOpeningWorld();
  moved.walls[0].openings[1].offset = 2.0;
  const g1 = await buildOpeningService(freshOpeningWorld()).preview(OPENING_COMMAND);
  const g2 = await buildOpeningService(moved).preview(OPENING_COMMAND);
  const negSeen = g1 && g2 && g1.planHash !== g2.planHash ? 1 : 0;
  floors.push({ what: 'NEGATIVE control (opening.move): two GENUINELY different states produce different planHashes (the sensitivity arms can see)', measured: negSeen, min: 1 });
  floors.push({ what: 'NEGATIVE control (opening.move): and their stateHashes differ too, confirming the difference is in the AUTHORITATIVE state, not only the body', measured: g1 && g2 && g1.stateHash !== g2.stateHash ? 1 : 0, min: 1 });
  lines.push(`${negSeen ? '✓ ' : '❌'} NEGATIVE control (opening.move): sibling window at 3.0 vs 2.0 → planHash ${g1?.planHash} vs ${g2?.planHash}`);

  return { floors, lines, findings };
}

// ─── wall.opening.create · the FOURTH family ──────────────────────────────────
//
// The opening.MOVE harness above is the nearest neighbour and is STILL not transcribable,
// for a reason the planner's own header states as doctrine: this family has NO CLAMP SEAM
// AT ALL. The move row's two occupancy seams are `clampToWall` (the host-fit rule, which
// REFITS) and `canPlace` (sibling collision). The create row has exactly one —
// `canPlace` — because `CreateWallOpening.canExecute`/`execute` REFUSE on every invalid
// arm, bounds and overlap alike, and never clamp. A create harness that inherited the move
// harness's `shiftedClamp`/`refusingClamp` doubles would therefore be certifying a seam the
// subject planner does not have, and — worse — the two arms that ride on it
// (`metric-value-only`, `refusal-numbers-only`) would be exercising an injection point the
// production composition never fills. So the seams here are the planner's OWN:
//
//   occupancy   `WallOccupancyStore.canPlace` — the REAL one, the SAME function the commit
//               path runs. Its verdict is refuse-or-proceed; there is no third answer.
//   validator   the violation core, diffed before/after the ADD (clone → append to the
//               CLONE → validateAll → diff).
//
// ── THE stateHash CONSTRAINT, RE-DERIVED FOR THIS ROW ────────────────────────
// `fnv1a({wallOpeningCreate: payload, walls: allWalls})`. So ARM 2 may move neither the
// payload nor the wall store, and — as on the move row — the ONE remaining seam is a pure
// function of that hashed state. Every pair below therefore varies the seam THROUGH AN
// INJECTED READER over byte-identical state, asserts stateHash equality as a FLOOR, and
// carries the move row's two inert-arm floors (section populated; element sets held equal).
//
// ⚠ WHAT THIS ROW MAKES HARDER THAN THE MOVE ROW, AND WHAT REPLACED IT. On the move row the
// three body sections could each be moved while the plan still PROCEEDED. Here `proceeds`
// is `refused.length === 0`, so a refusal COLLAPSES changed / topology / metrics all at
// once — every "refuse vs proceed" pair co-varies four sections and can pass for a reason
// unrelated to the one it names (the exact defect the move row's `refusal-only` draft had).
// The three pairs below are the three that survive that constraint:
//   2a refusal-numbers-only    both sides REFUSE on bounds, differing only in the length
//                              the refusal quotes → `refused` alone.
//   2b validation-only         both sides PROCEED, validator fires vs quiet →
//                              `validation.violationsCreated` alone.
//   2c undetermined-detail-only  both sides reach the SAME undetermined verdict by two
//                              different routes (no reader composed vs the reader threw) →
//                              `undetermined[].detail` alone. This is C78 §1.4 as a hash
//                              claim: two DIFFERENT reasons for "not checked" are two
//                              materially different answers, and an approval that could not
//                              tell them apart would bind a plan that never checked
//                              occupancy to one whose reader crashed.
//
// ── ALL THREE VERIFIED BY MUTATION, ONE SECTION AT A TIME (measured 2026-08-14) ──────
// `assemble`'s hashed body was stripped of ONE section per run and the gate re-run:
//   `refused` removed        → 2a RED, 2b and 2c still green
//   `undetermined` removed   → 2c RED, 2a and 2b still green
//   `validation` removed     → 2b RED, 2a and 2c still green
// So each pair fails for its OWN section and for no other — the arms are load-bearing and
// mutually independent, not three readings of one difference. The mutation was reverted;
// this note is the record, because "the arm printed green" is not evidence that the arm
// can go red (this gate's own opening.move row shipped two inert arms before it learned).

interface OpeningCreateWorld {
  walls: any[];
}

/** A 6 m host already carrying a 1.2 m window. The create command below drops a 0.9 m door
 *  at 0.5 — clear of the sibling and inside the host — so the DEFAULT plan is the PROCEED
 *  plan and carries changed / excluded / topology / metrics / violationsCreated at once.
 *  `siblingOffset` is the NEGATIVE CONTROL's one knob. */
const freshOpeningCreateWorld = (siblingOffset = 3.0): OpeningCreateWorld => ({
  walls: [
    {
      id: 'wall-1', type: 'wall', levelId: 'L1', height: 2.7, thickness: 0.2,
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
      openings: [
        { id: 'op-w1', elementId: 'win-1', type: 'window', offset: siblingOffset, width: 1.2, height: 1.2, sillHeight: 0.9 },
      ],
    },
  ],
});

/** Read-only PlanningContext double. The room store is deliberately EMPTY: this planner
 *  consults no room-geometry predictor at all (C78 §6.4 disposition (iii) — an opening is a
 *  void in the wall SOLID and moves no room ring), so handing it a move-shaped room with a
 *  `computed.area` would imply a prediction it does not make. It still clones 'room' as
 *  validator fodder, which an empty array serves honestly. */
const openingCreateContextFor = (world: OpeningCreateWorld) => () => ({
  getStore(storeId: string) {
    const items: any[] | undefined =
      storeId === 'wall' ? world.walls
        : storeId === 'room' || storeId === 'door' || storeId === 'window' || storeId === 'stair' ? []
          : undefined;
    if (!items) return undefined;
    return {
      getAll: () => items as readonly unknown[],
      getById: (id: string) => items.find((i) => i.id === id) ?? null,
    };
  },
}) as any;

// The command in its FLAT semantic form. [0.500, 1.400] on a 6 m host, clear of the sibling
// window at [3.000, 4.200].
const OC_COMMAND = {
  type: 'wall.opening.create' as const,
  payload: {
    id: 'door-2', wallId: 'wall-1', openingId: 'op-d2', openingType: 'door',
    offset: 0.5, width: 0.9, height: 2.1, sillHeight: 0,
  },
};
// Bounds refusal, from the REAL store: [5.500, 6.400] runs past the 6.000 m host end.
const OC_COMMAND_BOUNDS = {
  type: 'wall.opening.create' as const,
  payload: { ...OC_COMMAND.payload, offset: 5.5 },
};
// Overlap refusal, from the REAL store: [3.500, 4.400] cuts the sibling's [3.000, 4.200].
const OC_COMMAND_OVERLAP = {
  type: 'wall.opening.create' as const,
  payload: { ...OC_COMMAND.payload, offset: 3.5 },
};

/** Fires on any DOOR opening narrower than 1.0 m. The sibling is a window, so the BEFORE
 *  clone is clean and the ADD of the 0.9 m door creates exactly one violation — the same
 *  discipline the other three harnesses apply: a hash arm must cover a section that
 *  actually carries bytes. */
const doorWidthValidator = {
  validateAll: (ctx: any) =>
    (ctx.wallStore.getAll() as any[]).flatMap((wl) =>
      (wl.openings ?? [])
        .filter((o: any) => o.type === 'door' && typeof o.width === 'number' && o.width < 1.0)
        .map((o: any) => ({ ruleId: 'DOOR_MIN_WIDTH', elementId: o.elementId ?? o.id, message: `door width ${o.width} m is below the 1.0 m minimum` })),
    ),
};
const ocQuietValidator = { validateAll: () => [] as any[] };

/** Build the REAL service over the REAL create planner. The default occupancy is the REAL
 *  `wallOccupancyStore` — so the fit/collision verdicts under test are the PRODUCTION rules
 *  the commit path enforces. `omitOccupancy` is an explicit ABSENCE (distinct from "not
 *  overridden"), which 2c needs and which `?? default` cannot express. */
function buildOpeningCreateService(world: OpeningCreateWorld, opts?: {
  occupancy?: any;
  omitOccupancy?: boolean;
  validator?: { validateAll: (c: any) => any[] };
  plannerWrap?: (p: WallOpeningCreateConsequencePlanner) => { plan: (c: any, ctx: any) => Promise<any> };
}): ConsequencePreviewService {
  const planner = new WallOpeningCreateConsequencePlanner({
    ...(opts?.omitOccupancy ? {} : { occupancy: (opts?.occupancy ?? wallOccupancyStore) as any }),
    validator: (opts?.validator ?? doorWidthValidator) as any,
  });
  const subject = opts?.plannerWrap ? opts.plannerWrap(planner) : planner;
  const planners = new Map<string, any>();
  planners.set('wall.opening.create', subject);
  return new ConsequencePreviewService(planners as any, openingCreateContextFor(world));
}

async function wallOpeningCreateHarness(): Promise<{ floors: Floor[]; lines: string[]; findings: string[] }> {
  const floors: Floor[] = [];
  const lines: string[] = [];
  const findings: string[] = [];

  // ── ARM 1 · REPEAT — the REAL occupancy store, the REAL planner, the REAL service ──
  const service = buildOpeningCreateService(freshOpeningCreateWorld());
  const runA = await service.preview(OC_COMMAND);
  const runB = await service.preview(OC_COMMAND);
  floors.push({ what: 'wall.opening.create: real preview produced a plan (run A)', measured: runA ? 1 : 0, min: 1 });
  floors.push({ what: 'wall.opening.create: real preview produced a plan (run B)', measured: runB ? 1 : 0, min: 1 });
  if (runA && runB) {
    floors.push({ what: 'wall.opening.create: plan carries changed entries (the new opening AND its host)', measured: runA.changed.length, min: 2 });
    floors.push({ what: 'wall.opening.create: plan carries topology.added (the newcomer)', measured: (runA as any).topology?.added?.length ?? 0, min: 1 });
    floors.push({ what: 'wall.opening.create: plan carries topology.modified (the host whose openings array gains a member)', measured: (runA as any).topology?.modified?.length ?? 0, min: 1 });
    floors.push({ what: 'wall.opening.create: plan carries excluded entries (siblings CHECKED and found clear — the positive verdict)', measured: (runA as any).excluded?.length ?? 0, min: 1 });
    floors.push({ what: 'wall.opening.create: plan carries metric transitions (offset and width, before=undefined)', measured: (runA as any).metrics?.length ?? 0, min: 2 });
    floors.push({ what: 'wall.opening.create: plan carries violationsCreated (validation section populated by the ADD)', measured: runA.validation.violationsCreated.length, min: 1 });
    floors.push({ what: 'wall.opening.create: plan carries undetermined entries (declared blind spots, not silent emptiness)', measured: (runA as any).undetermined?.length ?? 0, min: 3 });
    // C70 F-INV-3 clause 3, asserted in the GATE: this family structurally cannot plan a
    // deletion — `removed` is a literal [] with no parameter that could populate it.
    floors.push({ what: 'wall.opening.create: C70 F-INV-3 — topology.removed is EMPTY on the PROCEED plan (nothing is deleted to make room)', measured: ((runA as any).topology?.removed?.length ?? 0) === 0 ? 1 : 0, min: 1 });
    const c = compareRuns(runA, runB);
    if (c.verdict !== 'identical') findings.push(`ARM 1 · REPEAT [wall.opening.create][${c.verdict}]: ${c.detail}`);
    lines.push(`${c.verdict === 'identical' ? '✓ ' : '❌'} ARM 1 · wall.opening.create REPEAT: ${c.detail}`);
  }

  // ── ARM 1b · THE REFUSAL REPEAT — create-specific, and the arm the move row cannot have ─
  // The move row's refusal is a REFIT decision; this row's is terminal. A refused create is
  // the family's most consequential answer (it is what the user is told), it takes a
  // DIFFERENT branch through `assemble` (no changed, no metrics, no topology), and it is
  // where BOTH NUMBERS live (C70 F-INV-3 / G-INV-4). A harness that only repeated the
  // proceed plan would leave the entire refusal body uncertified.
  const refService = buildOpeningCreateService(freshOpeningCreateWorld());
  const r1 = await refService.preview(OC_COMMAND_OVERLAP);
  const r2 = await refService.preview(OC_COMMAND_OVERLAP);
  floors.push({ what: 'wall.opening.create: refusal repeat produced both plans', measured: r1 && r2 ? 1 : 0, min: 1 });
  if (r1 && r2) {
    const reason = (r1 as any).refused?.[0]?.reason ?? '';
    floors.push({ what: 'wall.opening.create: the REAL canPlace refused the overlapping span (refused section populated)', measured: (r1 as any).refused?.length ?? 0, min: 1 });
    floors.push({ what: 'wall.opening.create: the refusal names BOTH spans (C70 F-INV-3 / G-INV-4 — the proposed one AND the sibling it would cut)', measured: reason.includes('[3.500 m, 4.400 m]') && reason.includes('[3.000 m, 4.200 m]') ? 1 : 0, min: 1 });
    floors.push({ what: 'wall.opening.create: a REFUSED create changes nothing — changed is EMPTY (a plan that claimed otherwise would make R4 score a divergence it caused itself)', measured: r1.changed.length === 0 ? 1 : 0, min: 1 });
    floors.push({ what: 'wall.opening.create: C70 F-INV-3 — topology.removed is EMPTY on the REFUSED plan too (the sibling is neither moved aside nor removed)', measured: ((r1 as any).topology?.removed?.length ?? 0) === 0 ? 1 : 0, min: 1 });
    const c = compareRuns(r1, r2);
    if (c.verdict !== 'identical') findings.push(`ARM 1 · REPEAT [wall.opening.create · refused][${c.verdict}]: the same REFUSED create planned twice over one state produced two different refusals — the sentence the user is shown is not a pure function of state. ${c.detail}`);
    lines.push(`${c.verdict === 'identical' ? '✓ ' : '❌'} ARM 1 · wall.opening.create REFUSAL repeat: ${c.detail}`);
  }

  // The OTHER refusal arm the REAL store produces — BOUNDS, which carries the closed
  // `CanPlaceRefusalCode` VERBATIM (§REFUSAL-IDENTITY, C58 §1.13). Repeated for the same
  // reason: it is a different branch of `occupancyBranch` (no conflict ids), so its
  // determinism is a separate claim from the overlap branch's.
  const bService = buildOpeningCreateService(freshOpeningCreateWorld());
  const b1 = await bService.preview(OC_COMMAND_BOUNDS);
  const b2 = await bService.preview(OC_COMMAND_BOUNDS);
  floors.push({ what: 'wall.opening.create: bounds-refusal repeat produced both plans', measured: b1 && b2 ? 1 : 0, min: 1 });
  if (b1 && b2) {
    const reason = (b1 as any).refused?.[0]?.reason ?? '';
    floors.push({ what: 'wall.opening.create: the REAL canPlace refused the out-of-bounds span (refused section populated)', measured: (b1 as any).refused?.length ?? 0, min: 1 });
    floors.push({ what: 'wall.opening.create: the bounds refusal carries the store\'s closed refusal CODE verbatim (OCC_SPAN_BEYOND_WALL_END), never reworded', measured: reason.includes('OCC_SPAN_BEYOND_WALL_END') ? 1 : 0, min: 1 });
    const c = compareRuns(b1, b2);
    if (c.verdict !== 'identical') findings.push(`ARM 1 · REPEAT [wall.opening.create · bounds-refused][${c.verdict}]: ${c.detail}`);
    lines.push(`${c.verdict === 'identical' ? '✓ ' : '❌'} ARM 1 · wall.opening.create BOUNDS-refusal repeat: ${c.detail}`);
  }

  // ── ARM 5 · NONDETERMINISM SOURCES — 30 ms apart, clock AND RNG spoofed ─────
  const realNow = Date.now;
  const realRandom = Math.random;
  let clockReads = 0;
  let rngReads = 0;
  const planUnder = async (now: number, rand: number, cmd: any = OC_COMMAND): Promise<Plan | null> => {
    Date.now = () => { clockReads++; return now; };
    Math.random = () => { rngReads++; return rand; };
    try { return await buildOpeningCreateService(freshOpeningCreateWorld()).preview(cmd); }
    finally { Date.now = realNow; Math.random = realRandom; }
  };
  const t1 = await planUnder(1_000_000_000, 0.1111);
  await sleep(30);
  const t2 = await planUnder(9_999_999_999, 0.9999);
  floors.push({ what: 'wall.opening.create: time-arm produced both plans', measured: t1 && t2 ? 1 : 0, min: 1 });
  if (t1 && t2) {
    const c = compareRuns(t1, t2);
    if (c.verdict !== 'identical') findings.push(`ARM 5 · TIME/RNG [wall.opening.create][${c.verdict}]: plans planned 30 ms apart under DIFFERENT spoofed Date.now/Math.random diverged — a clock or RNG read reaches the plan. ${c.detail}`);
    lines.push(`${c.verdict === 'identical' ? '✓ ' : '❌'} ARM 5 · wall.opening.create TIME/RNG: 30 ms apart, Date.now spoofed 1000000000 vs 9999999999, Math.random 0.1111 vs 0.9999 → ${c.verdict} (planner path observed ${clockReads} Date.now / ${rngReads} Math.random reads)`);
  }

  // The SIBLING-ORDER arm — this family's analogue of the create row's id-absent case and
  // the move row's reverse-scan case, and a real risk rather than a ceremonial one. The
  // refusals are emitted ONE PER COLLIDING SIBLING, and the collision ids arrive from the
  // store in ITS OWN array iteration order. A refusal LIST whose order followed the host's
  // openings array would make the plan a function of storage order, not of state — and the
  // user would be shown two conflicts in two different orders for one identical situation.
  // Here the SAME two siblings are presented in both orders against a span that cuts BOTH.
  const twoSiblings = (order: 'ab' | 'ba'): OpeningCreateWorld => {
    const a = { id: 'op-w1', elementId: 'win-1', type: 'window', offset: 3.0, width: 1.2, height: 1.2, sillHeight: 0.9 };
    const b = { id: 'op-w2', elementId: 'win-2', type: 'window', offset: 4.5, width: 0.8, height: 1.2, sillHeight: 0.9 };
    const wl = freshOpeningCreateWorld().walls[0];
    return { walls: [{ ...wl, openings: order === 'ab' ? [a, b] : [b, a] }] };
  };
  const wideCmd = { type: 'wall.opening.create' as const, payload: { ...OC_COMMAND.payload, offset: 3.5, width: 1.5 } };
  const o1 = await buildOpeningCreateService(twoSiblings('ab')).preview(wideCmd);
  const o2 = await buildOpeningCreateService(twoSiblings('ba')).preview(wideCmd);
  floors.push({ what: 'wall.opening.create: sibling-order arm produced both plans', measured: o1 && o2 ? 1 : 0, min: 1 });
  if (o1 && o2) {
    floors.push({ what: 'wall.opening.create: the sibling-order arm actually COLLIDES with both siblings (two refusals, not an inert pass)', measured: (o1 as any).refused?.length ?? 0, min: 2 });
    // stateHash DOES move here (the openings array order is part of the hashed state), so
    // this is a plan-BODY claim, not a byte-identity claim.
    const same =
      JSON.stringify({ r: (o1 as any).refused, e: o1.excluded, c: o1.changed, t: o1.topology }) ===
      JSON.stringify({ r: (o2 as any).refused, e: o2.excluded, c: o2.changed, t: o2.topology });
    floors.push({ what: 'wall.opening.create: the refusal LIST and the element sets are independent of the host openings-array order', measured: same ? 1 : 0, min: 1 });
    if (!same) findings.push('ARM 5 · TIME/RNG [wall.opening.create · sibling-order]: the refusals/excluded sets depend on the order the host stores its openings — the plan is not a pure function of state, and one situation would be explained two ways.');
    lines.push(`${same ? '✓ ' : '❌'} ARM 5 · wall.opening.create sibling-order: host openings [op-w1,op-w2] vs [op-w2,op-w1] → same refusal list and same element sets`);
  }

  // ── ARM 2 · SENSITIVITY — one consequential fact each, stateHash held EQUAL ──
  // Same contract as the move row's `pairHash`, including BOTH inert-arm floors: the named
  // section must be POPULATED on at least one side, and the element sets must be IDENTICAL
  // unless the pair opts out — because changed/excluded/topology are hashed independently of
  // every named section, so a pair whose sides differ there can pass on the SET difference
  // while the section it advertises is absent from the hash entirely.
  const ocPairHash = async (
    label: string,
    a: ConsequencePreviewService,
    b: ConsequencePreviewService,
    fact: string,
    section: { name: string; read: (p: Plan) => number },
    cmd: any = OC_COMMAND,
  ): Promise<void> => {
    const setsOf = (p: Plan): string =>
      JSON.stringify({ c: p.changed, e: p.excluded, t: p.topology });
    const pa = await a.preview(cmd);
    const pb = await b.preview(cmd);
    floors.push({ what: `wall.opening.create: sensitivity pair "${label}" produced both plans`, measured: pa && pb ? 1 : 0, min: 1 });
    if (!pa || !pb) return;
    floors.push({ what: `wall.opening.create: sensitivity pair "${label}" holds stateHash EQUAL (the difference rides in the BODY)`, measured: pa.stateHash === pb.stateHash ? 1 : 0, min: 1 });
    const populated = Math.max(section.read(pa), section.read(pb));
    floors.push({ what: `wall.opening.create: sensitivity pair "${label}" is NOT INERT — the body section it names (${section.name}) is populated on at least one side`, measured: populated, min: 1 });
    floors.push({
      what: `wall.opening.create: sensitivity pair "${label}" holds the ELEMENT SETS identical (changed/excluded/topology) — so the planHash can only move via ${section.name}`,
      measured: setsOf(pa) === setsOf(pb) ? 1 : 0,
      min: 1,
    });
    if (pa.planHash === pb.planHash) {
      findings.push(`ARM 2 · SENSITIVITY [wall.opening.create · ${label}]: two plans differing in ${fact} share planHash ${pa.planHash} — the d63e7954 collision class is OPEN on the opening-create row.`);
      lines.push(`❌ ARM 2 · wall.opening.create ${label}: planHash DID NOT MOVE (${pa.planHash}) for a difference in ${fact}`);
    } else {
      lines.push(`✓  ARM 2 · wall.opening.create ${label}: planHash moved (${pa.planHash} → ${pb.planHash}) on ${fact}, stateHash equal (${pa.stateHash}), section ${section.name} populated (${populated})`);
    }
  };

  // 2a · refusal-numbers-only. BOTH readers refuse on BOUNDS with the SAME closed code, so
  // `proceeds` is false on both and changed/topology/metrics are byte-identically empty and
  // `excluded` is the same single cleared sibling. They differ ONLY in the host length the
  // refusal quotes — 5.900 m vs 6.100 m. That is exactly what G-INV-4 requires an approval
  // to bind: two refusals that differ only in how much wall is available are two materially
  // different answers to the user.
  const boundsRefusal = (hostLenText: string) => ({
    canPlace: () => ({
      valid: false, conflictIds: [] as string[], code: 'OCC_SPAN_BEYOND_WALL_END',
      reason: `Opening [0.500 m, 1.400 m] extends beyond wall length ${hostLenText} m`,
    }),
  });
  await ocPairHash('refusal-numbers-only',
    buildOpeningCreateService(freshOpeningCreateWorld(), { occupancy: boundsRefusal('5.900'), validator: ocQuietValidator }),
    buildOpeningCreateService(freshOpeningCreateWorld(), { occupancy: boundsRefusal('6.100'), validator: ocQuietValidator }),
    'ONLY the numbers inside the refused section (5.900 m vs 6.100 m of host length), with changed/topology BYTE-IDENTICALLY EMPTY and excluded identical on both sides — so the hash cannot move via a co-varying element set',
    { name: 'refused', read: (p) => (p as any).refused?.length ?? 0 });

  // 2b · validation-only. Both sides PROCEED (the REAL canPlace clears the span), so every
  // element set is identical; only the validator's verdict differs.
  await ocPairHash('validation-only',
    buildOpeningCreateService(freshOpeningCreateWorld(), { validator: ocQuietValidator }),
    buildOpeningCreateService(freshOpeningCreateWorld()),
    'ONLY validation.violationsCreated (the ADD trips DOOR_MIN_WIDTH vs a validator that finds nothing)',
    { name: 'validation.violationsCreated', read: (p) => p.validation.violationsCreated.length });

  // 2c · undetermined-detail-only. C78 §1.4 as a HASH claim. Both sides reach the same
  // ENGINE_NOT_AVAILABLE verdict with the same scope — one because NO occupancy reader is
  // composed, one because the composed reader THREW — so both proceed with byte-identical
  // changed/excluded/topology/metrics/validation, and the only differing bytes in either
  // plan are inside `undetermined[].detail`. Without this pair the whole `undetermined`
  // section could be dropped from the hashed body and every other arm would stay green,
  // which would let an approval of "occupancy was never checked" bind a plan whose reader
  // crashed mid-check — two different states of knowledge, one hash.
  const throwingOccupancy = { canPlace: () => { throw new Error('occupancy reader unavailable'); } };
  await ocPairHash('undetermined-detail-only',
    buildOpeningCreateService(freshOpeningCreateWorld(), { omitOccupancy: true }),
    buildOpeningCreateService(freshOpeningCreateWorld(), { occupancy: throwingOccupancy }),
    'ONLY undetermined[].detail — the SAME ENGINE_NOT_AVAILABLE verdict over the SAME scope reached by two different routes (no reader composed vs the composed reader threw); every element set, metric and validation entry is byte-identical',
    { name: 'undetermined', read: (p) => (p as any).undetermined?.length ?? 0 });

  // ── ARM 3 · INSENSITIVITY ────────────────────────────────────────────────────
  const svcKeys = buildOpeningCreateService(freshOpeningCreateWorld());
  const orderedA = await svcKeys.preview(OC_COMMAND);
  const orderedB = await svcKeys.preview({
    type: 'wall.opening.create',
    payload: { sillHeight: 0, height: 2.1, width: 0.9, offset: 0.5, openingType: 'door', openingId: 'op-d2', wallId: 'wall-1', id: 'door-2' },
  } as any);
  floors.push({ what: 'wall.opening.create: key-order pair produced both plans', measured: orderedA && orderedB ? 1 : 0, min: 1 });
  if (orderedA && orderedB) {
    if (orderedA.planHash !== orderedB.planHash) {
      findings.push(`ARM 3 · INSENSITIVITY [wall.opening.create · key-order]: permuting payload key insertion order moved the planHash (${orderedA.planHash} → ${orderedB.planHash}) — stableStringify is not doing its one job on the opening-create row.`);
      lines.push('❌ ARM 3 · wall.opening.create key-order: payload key permutation MOVED the planHash');
    } else {
      lines.push(`✓  ARM 3 · wall.opening.create key-order: payload written forwards vs fully reversed → same planHash (${orderedA.planHash})`);
    }
  }

  // VERB-SPELLING insensitivity — the sharpest arm on this row, because this family has
  // FOUR dispatch spellings normalising onto ONE semantic command, in THREE different
  // payload SHAPES: the flat semantic form, the adapter's `{ wallId, openingData }`, the
  // authoritative handler's `{ wallId, opening }`, and door.create's flat-with-openingId.
  // If any rule let its own shape leak into the semantic payload, one physical operation
  // would hash four ways, and an approval minted by the plan tool could not bind a plan
  // re-minted by the AI path or by the authoritative commit verb. All four must be
  // BYTE-identical, not merely equal-hashed.
  const openingRecord = { id: 'op-d2', elementId: 'door-2', type: 'door', offset: 0.5, width: 0.9, height: 2.1, sillHeight: 0 };
  const spellings: { label: string; cmd: any }[] = [
    { label: 'wall.opening.create (flat semantic)', cmd: OC_COMMAND },
    { label: 'wall.opening.create (adapter {wallId,openingData})', cmd: { type: 'wall.opening.create', payload: { wallId: 'wall-1', openingData: openingRecord } } },
    { label: 'wall.createOpening (authoritative {wallId,opening})', cmd: { type: 'wall.createOpening', payload: { wallId: 'wall-1', opening: openingRecord } } },
    { label: 'door.create (refused-but-semantic)', cmd: { type: 'door.create', payload: { wallId: 'wall-1', openingId: 'op-d2', id: 'door-2', offset: 0.5, width: 0.9, height: 2.1, sillHeight: 0 } } },
  ];
  const spelt: (Plan | null)[] = [];
  for (const s of spellings) spelt.push(await buildOpeningCreateService(freshOpeningCreateWorld()).preview(s.cmd));
  floors.push({ what: 'wall.opening.create: every one of the FOUR dispatch spellings produced a plan (none silently unroutable)', measured: spelt.filter(Boolean).length, min: 4 });
  const base = spelt[0];
  if (base) {
    for (let i = 1; i < spelt.length; i++) {
      const other = spelt[i];
      if (!other) continue;
      const c = compareRuns(base, other);
      if (c.verdict !== 'identical') findings.push(`ARM 3 · INSENSITIVITY [wall.opening.create · verb-spelling]: the SAME operation dispatched as '${spellings[0]!.label}' and as '${spellings[i]!.label}' produced different plans — the dispatch shape is leaking into the semantic command, so one operation hashes two ways. ${c.detail}`);
      lines.push(`${c.verdict === 'identical' ? '✓ ' : '❌'} ARM 3 · wall.opening.create verb-spelling: ${spellings[0]!.label} vs ${spellings[i]!.label} → ${c.verdict}`);
    }
  }

  // Envelope provenance — same shape of proof as all three earlier harnesses.
  const envelopes = [
    { actor: 'human', origin: 'direct-manipulation', timestamp: 1_111_111, gestureId: 'g-human-1' },
    { actor: 'ai', origin: 'ai-proposal', timestamp: 9_999_999, gestureId: 'g-ai-2', approval: { approvedBy: 'user-7', planHash: 'stale-cafe' } },
  ] as const;
  const envPlans: (Plan | null)[] = [];
  for (const env of envelopes) {
    Date.now = () => env.timestamp;
    try { envPlans.push(await buildOpeningCreateService(freshOpeningCreateWorld()).preview(OC_COMMAND)); }
    finally { Date.now = realNow; }
  }
  floors.push({ what: 'wall.opening.create: envelope pair produced both plans', measured: envPlans[0] && envPlans[1] ? 1 : 0, min: 1 });
  if (envPlans[0] && envPlans[1]) {
    const c = compareRuns(envPlans[0], envPlans[1]);
    if (c.verdict !== 'identical') findings.push(`ARM 3 · INSENSITIVITY [wall.opening.create · envelope]: actor/origin/timestamp/approval differences leaked into the plan — provenance must stay OFF the plan (C78 §9). ${c.detail}`);
    lines.push(`${c.verdict === 'identical' ? '✓ ' : '❌'} ARM 3 · wall.opening.create envelope: human/direct vs ai/proposal+approval, clocks 1111111 vs 9999999 → ${c.verdict}`);
  }

  // ── POSITIVE CONTROL (floor) — a nondeterministic create planner MUST be flagged ──
  const noisy = buildOpeningCreateService(freshOpeningCreateWorld(), {
    plannerWrap: (real) => ({
      plan: async (c: any, ctx: any) => {
        const p = await real.plan(c, ctx);
        return { ...p, undetermined: [...p.undetermined, { scope: 'noise', reason: 'ENGINE_NOT_AVAILABLE', detail: `t=${realNow()}·r=${realRandom()}` }] };
      },
    }),
  });
  const n1 = await noisy.preview(OC_COMMAND);
  const n2 = await noisy.preview(OC_COMMAND);
  const noisyVerdict = n1 && n2 ? compareRuns(n1, n2) : null;
  floors.push({ what: 'POSITIVE control (wall.opening.create): a deliberately NONDETERMINISTIC planner is FLAGGED by the repeat checker', measured: noisyVerdict && noisyVerdict.verdict !== 'identical' ? 1 : 0, min: 1 });
  floors.push({ what: 'POSITIVE control (wall.opening.create): the checker CLASSIFIES it as the hash-bug shape (bodies differ, hash equal)', measured: noisyVerdict?.verdict === 'hash-bug' ? 1 : 0, min: 1 });
  lines.push(`${noisyVerdict && noisyVerdict.verdict !== 'identical' ? '✓ ' : '❌'} POSITIVE control (wall.opening.create): nondeterministic planner → ${noisyVerdict?.verdict ?? 'NO PLANS'}`);

  // ── NEGATIVE CONTROL (floor) — genuinely different states must hash apart ────
  // The sibling window sits at 3.000 on one side and 1.000 on the other, which genuinely
  // flips the occupancy answer for the proposed [0.500, 1.400] span from clear to colliding.
  // This is where different STATE belongs: it moves the stateHash, which is exactly why it
  // cannot serve as an ARM 2 pair.
  const g1 = await buildOpeningCreateService(freshOpeningCreateWorld(3.0)).preview(OC_COMMAND);
  const g2 = await buildOpeningCreateService(freshOpeningCreateWorld(1.0)).preview(OC_COMMAND);
  const negSeen = g1 && g2 && g1.planHash !== g2.planHash ? 1 : 0;
  floors.push({ what: 'NEGATIVE control (wall.opening.create): two GENUINELY different states produce different planHashes (the sensitivity arms can see)', measured: negSeen, min: 1 });
  floors.push({ what: 'NEGATIVE control (wall.opening.create): and their stateHashes differ too, confirming the difference is in the AUTHORITATIVE state, not only the body', measured: g1 && g2 && g1.stateHash !== g2.stateHash ? 1 : 0, min: 1 });
  lines.push(`${negSeen ? '✓ ' : '❌'} NEGATIVE control (wall.opening.create): sibling window at 3.0 (clear) vs 1.0 (colliding) → planHash ${g1?.planHash} vs ${g2?.planHash}`);

  return { floors, lines, findings };
}

// ─── opening.delete — the hosted-opening DELETE family (the FIFTH registered row) ────────
//
// ── THE SEAMS ARE THIS FAMILY'S OWN — RECORDED RELATIONSHIPS + VALIDATOR, NO CLAMP ──────
// The planner's own header states the doctrine: a delete cannot collide (it strictly
// REMOVES an interval from the host's occupancy), so this family has NO occupancy seam at
// all and `refused` is a literal [] with no parameter that could populate it. Inheriting
// the create row's `boundsRefusal` doubles would certify an injection point the production
// composition never fills. The seams here are the planner's OWN two:
//
//   relationships  `semanticGraphManager.getRelationships` — the RECORDED edge index the
//                  commit path purges and restores verbatim (3ee632f6, C78 §5.1). Its
//                  answer is edges, never a verdict; the planner decides what an edge set
//                  MEANS (counterparts affected; EMPTY = RELATIONSHIP_NOT_RECORDED;
//                  ABSENT = NO_DEPENDENCY_INDEX; THREW = declared, not swallowed).
//   validator      the violation core, diffed before/after the REMOVE (clone → filter the
//                  CLONE's openings → validateAll → diff). On this row
//                  `violationsResolved` is the half that normally carries bytes — the
//                  exact mirror of the create row's `violationsCreated`.
//
// ── THE stateHash CONSTRAINT, RE-DERIVED FOR THIS ROW ────────────────────────
// `fnv1a({openingDelete: payload, walls: allWalls})`. ARM 2 may move neither the payload
// nor the wall store; every pair varies ONE injected seam over byte-identical state,
// asserts stateHash equality as a FLOOR, and names the one body section it moves:
//   2a changed-set-only          a recorded edge to room-7 present vs absent → `changed`
//                                membership alone (excluded/topology held identical) — the
//                                move row's 2c shape, driven through the RELATIONSHIP seam
//                                because that is the only seam that feeds `changed` here.
//   2b validation-only           validator fires vs quiet, both sides PROCEED →
//                                `validation.violationsResolved` alone (the delete row's
//                                signature half; the create row certifies the other).
//   2c undetermined-detail-only  the SAME NO_DEPENDENCY_INDEX verdict over the SAME scope
//                                by two routes (no reader composed vs the reader THREW) →
//                                `undetermined[].detail` alone. C78 §1.4 as a hash claim.
//
// ── ALL THREE VERIFIED BY MUTATION, ONE SECTION AT A TIME (measured 2026-08-15) ────────
// `assemble`'s hashed body was stripped of ONE section per run and the gate re-run:
//   `undetermined` dropped from hash → 2c RED, 2a and 2b still green
//   `validation` dropped from hash   → 2b RED, 2a and 2c still green
//   `changed` dropped from hash      → 2a RED, 2b and 2c still green
// So each pair fails for its OWN section and no other — the arms are load-bearing and
// mutually independent, not three readings of one difference. The mutations were reverted;
// this note is the record (the create row's discipline: "the arm printed green" is not
// evidence that the arm can go red).
//
// ── THE TERMINAL BRANCHES REPEATED (this row's analogue of the create row's refusals) ───
// This family's most consequential alternative answers are its typed UNDETERMINED bails —
// host-not-found (RELATIONSHIP_NOT_READABLE over the reverse scan) and the corrupt
// two-hosts case — which take the `bail` path through `assemble` (no changed, no metrics,
// empty cascade). Each is repeated for byte-identity exactly as the create row repeats its
// two refusal branches, because the sentence the user is shown must be a pure function of
// state on the failure paths too.

interface OpeningDeleteWorld {
  walls: any[];
}

/** A 6 m host carrying the doomed 0.9 m door at [0.500, 1.400] AND a 1.2 m sibling window
 *  at [3.000, 4.200] — so the PROCEED plan carries changed / excluded / topology.removed /
 *  violationsResolved at once (no metrics, structurally — see the floor below).
 *  `doorOffset` is the NEGATIVE CONTROL's one knob. */
const freshOpeningDeleteWorld = (doorOffset = 0.5): OpeningDeleteWorld => ({
  walls: [
    {
      id: 'wall-1', type: 'wall', levelId: 'L1', height: 2.7, thickness: 0.2,
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
      openings: [
        { id: 'op-d1', elementId: 'door-1', type: 'door', offset: doorOffset, width: 0.9, height: 2.1, sillHeight: 0 },
        { id: 'op-w1', elementId: 'win-1', type: 'window', offset: 3.0, width: 1.2, height: 1.2, sillHeight: 0.9 },
      ],
    },
  ],
});

/** Read-only PlanningContext double — this family's OWN (the file's doctrine: no shared
 *  fixtures between families). The room/door/window/stair stores are EMPTY arrays: the
 *  planner consults no room predictor (disposition (iii)) but its violation diff clones
 *  them as validator fodder, which an empty array serves honestly. */
const openingDeleteContextFor = (world: OpeningDeleteWorld) => () => ({
  getStore(storeId: string) {
    const items: any[] | undefined =
      storeId === 'wall' ? world.walls
        : storeId === 'room' || storeId === 'door' || storeId === 'window' || storeId === 'stair' ? []
          : undefined;
    if (!items) return undefined;
    return {
      getAll: () => items as readonly unknown[],
      getById: (id: string) => items.find((i) => i.id === id) ?? null,
    };
  },
}) as any;

// The command in its FLAT semantic form. No wallId — the REVERSE-SCAN branch is the
// production path (neither live verb carries a host), so that is the branch certified.
const OD_COMMAND = {
  type: 'opening.delete' as const,
  payload: { id: 'door-1', openingType: 'door' as const },
};

/** Recorded edges as the graph holds them — the double answers EDGES, never a verdict. */
const OD_EDGES = [
  { id: 'e1', type: 'hostedBy', sourceId: 'door-1', targetId: 'wall-1' },
  { id: 'e2', type: 'hosts', sourceId: 'wall-1', targetId: 'door-1' },
];

/** Fires on any wall carrying MORE than one opening: present BEFORE the delete (two) and
 *  absent AFTER (one), so `violationsResolved` carries bytes on the default plan. */
const odMaxOpeningsValidator = {
  validateAll: (ctx: any) =>
    (ctx.wallStore.getAll() as any[])
      .filter((wl) => (wl.openings?.length ?? 0) > 1)
      .map((wl) => ({ ruleId: 'WALL_MAX_OPENINGS', elementId: wl.id, message: `wall ${wl.id} carries ${wl.openings.length} openings, above the 1 permitted` })),
};
const odQuietValidator = { validateAll: () => [] as any[] };

/** Build the REAL service over the REAL delete planner. `omitRelationships` is an explicit
 *  ABSENCE (distinct from "not overridden"), which 2c needs and `?? default` cannot say. */
function buildOpeningDeleteService(world: OpeningDeleteWorld, opts?: {
  relationships?: any;
  omitRelationships?: boolean;
  validator?: { validateAll: (c: any) => any[] };
  plannerWrap?: (p: OpeningDeleteConsequencePlanner) => { plan: (c: any, ctx: any) => Promise<any> };
}): ConsequencePreviewService {
  const planner = new OpeningDeleteConsequencePlanner({
    ...(opts?.omitRelationships ? {} : { relationships: (opts?.relationships ?? { getRelationships: () => OD_EDGES }) as any }),
    validator: (opts?.validator ?? odMaxOpeningsValidator) as any,
  });
  const subject = opts?.plannerWrap ? opts.plannerWrap(planner) : planner;
  const planners = new Map<string, any>();
  planners.set('opening.delete', subject);
  return new ConsequencePreviewService(planners as any, openingDeleteContextFor(world));
}

async function openingDeleteHarness(): Promise<{ floors: Floor[]; lines: string[]; findings: string[] }> {
  const floors: Floor[] = [];
  const lines: string[] = [];
  const findings: string[] = [];

  // ── ARM 1 · REPEAT — the PROCEED plan, through the REAL planner and service ─────────
  const service = buildOpeningDeleteService(freshOpeningDeleteWorld());
  const runA = await service.preview(OD_COMMAND);
  const runB = await service.preview(OD_COMMAND);
  floors.push({ what: 'opening.delete: real preview produced a plan (run A)', measured: runA ? 1 : 0, min: 1 });
  floors.push({ what: 'opening.delete: real preview produced a plan (run B)', measured: runB ? 1 : 0, min: 1 });
  if (runA && runB) {
    floors.push({ what: 'opening.delete: plan carries changed entries (the subject AND its host)', measured: runA.changed.length, min: 2 });
    // C70 F-INV-2, asserted in the GATE: a delete never answers with an empty cascade —
    // the subject itself is the floor of `removed`.
    floors.push({ what: 'opening.delete: C70 F-INV-2 — topology.removed carries the subject (a delete never plans an empty cascade)', measured: (runA as any).topology?.removed?.length ?? 0, min: 1 });
    floors.push({ what: 'opening.delete: topology.added is EMPTY (a delete creates nothing — structural, not asserted-and-hoped)', measured: ((runA as any).topology?.added?.length ?? 0) === 0 ? 1 : 0, min: 1 });
    floors.push({ what: 'opening.delete: plan carries topology.modified (the host whose openings array loses a member)', measured: (runA as any).topology?.modified?.length ?? 0, min: 1 });
    floors.push({ what: 'opening.delete: plan carries excluded entries (the sibling CHECKED and found unaffected — the positive verdict)', measured: (runA as any).excluded?.length ?? 0, min: 1 });
    // MetricTransition.after is a NON-optional number (command-bus consequence.ts), so a
    // delete's determined absence is UNTYPEABLE as a metric line: the plan must carry NO
    // metrics key AND the typed declaration naming that contract seam — never after: 0.
    floors.push({ what: 'opening.delete: plan carries NO metrics key (a determined absence is untypeable under MetricTransition — declared, never fabricated as after:0)', measured: 'metrics' in (runA as any) ? 0 : 1, min: 1 });
    floors.push({ what: 'opening.delete: the untypeable metric lines are DECLARED (AGGREGATE_SCOPE_UNSUPPORTED entry naming MetricTransition)', measured: (runA as any).undetermined?.some((u: any) => u.scope.includes('metric lines') && u.reason === 'AGGREGATE_SCOPE_UNSUPPORTED') ? 1 : 0, min: 1 });
    floors.push({ what: 'opening.delete: plan carries violationsResolved (the delete row\'s signature validation half)', measured: runA.validation.violationsResolved.length, min: 1 });
    floors.push({ what: 'opening.delete: plan carries undetermined entries (declared blind spots, not silent emptiness)', measured: (runA as any).undetermined?.length ?? 0, min: 4 });
    floors.push({ what: 'opening.delete: refused is EMPTY on the PROCEED plan (structurally — no commit path declines a hosted-opening delete on geometric grounds)', measured: ((runA as any).refused?.length ?? 0) === 0 ? 1 : 0, min: 1 });
    const c = compareRuns(runA, runB);
    if (c.verdict !== 'identical') findings.push(`ARM 1 · REPEAT [opening.delete][${c.verdict}]: ${c.detail}`);
    lines.push(`${c.verdict === 'identical' ? '✓ ' : '❌'} ARM 1 · opening.delete REPEAT: ${c.detail}`);
  }

  // ── ARM 1b · THE TERMINAL-BRANCH REPEATS — this row's analogue of the create row's
  // refusal repeats. A delete's terminal answers are typed UNDETERMINED bails, they take a
  // DIFFERENT branch through `assemble` (no changed, no metrics, empty cascade), and they
  // are what the user is shown when the record cannot answer.
  const lostWorld: OpeningDeleteWorld = { walls: [{ ...freshOpeningDeleteWorld().walls[0], openings: [] }] };
  const lostService = buildOpeningDeleteService(lostWorld);
  const l1 = await lostService.preview(OD_COMMAND);
  const l2 = await lostService.preview(OD_COMMAND);
  floors.push({ what: 'opening.delete: host-not-found repeat produced both plans', measured: l1 && l2 ? 1 : 0, min: 1 });
  if (l1 && l2) {
    floors.push({ what: 'opening.delete: host-not-found is a typed UNDETERMINED (RELATIONSHIP_NOT_READABLE over the reverse scan), never a determined no-op', measured: (l1 as any).undetermined?.some((u: any) => u.reason === 'RELATIONSHIP_NOT_READABLE') ? 1 : 0, min: 1 });
    floors.push({ what: 'opening.delete: host-not-found plans an EMPTY cascade with indirect UNDETERMINED (nothing is claimed removed)', measured: ((l1 as any).topology?.removed?.length ?? 0) === 0 && (l1 as any).indirect?.kind === 'undetermined' ? 1 : 0, min: 1 });
    const c = compareRuns(l1, l2);
    if (c.verdict !== 'identical') findings.push(`ARM 1 · REPEAT [opening.delete · host-not-found][${c.verdict}]: the same unanswerable delete planned twice produced two different declarations — the sentence the user is shown is not a pure function of state. ${c.detail}`);
    lines.push(`${c.verdict === 'identical' ? '✓ ' : '❌'} ARM 1 · opening.delete HOST-NOT-FOUND repeat: ${c.detail}`);
  }

  // The corrupt two-hosts case — a DIFFERENT bail branch (the ambiguity is declared, not
  // resolved by taking the first hit), so its determinism is a separate claim.
  const twinWorld = (order: 'ab' | 'ba'): OpeningDeleteWorld => {
    const a = freshOpeningDeleteWorld().walls[0];
    const b = { ...freshOpeningDeleteWorld().walls[0], id: 'wall-2' };
    return { walls: order === 'ab' ? [a, b] : [b, a] };
  };
  const ambService = buildOpeningDeleteService(twinWorld('ab'));
  const a1 = await ambService.preview(OD_COMMAND);
  const a2 = await ambService.preview(OD_COMMAND);
  floors.push({ what: 'opening.delete: two-hosts repeat produced both plans', measured: a1 && a2 ? 1 : 0, min: 1 });
  if (a1 && a2) {
    const detail = (a1 as any).undetermined?.find((u: any) => u.reason === 'RELATIONSHIP_NOT_READABLE')?.detail ?? '';
    floors.push({ what: 'opening.delete: the corrupt-edge declaration names BOTH claimant walls, sorted', measured: detail.includes('wall-1, wall-2') ? 1 : 0, min: 1 });
    const c = compareRuns(a1, a2);
    if (c.verdict !== 'identical') findings.push(`ARM 1 · REPEAT [opening.delete · two-hosts][${c.verdict}]: ${c.detail}`);
    lines.push(`${c.verdict === 'identical' ? '✓ ' : '❌'} ARM 1 · opening.delete TWO-HOSTS repeat: ${c.detail}`);
  }

  // ── ARM 5 · NONDETERMINISM SOURCES — 30 ms apart, clock AND RNG spoofed ─────
  const realNow = Date.now;
  const realRandom = Math.random;
  let clockReads = 0;
  let rngReads = 0;
  const planUnder = async (now: number, rand: number): Promise<Plan | null> => {
    Date.now = () => { clockReads++; return now; };
    Math.random = () => { rngReads++; return rand; };
    try { return await buildOpeningDeleteService(freshOpeningDeleteWorld()).preview(OD_COMMAND); }
    finally { Date.now = realNow; Math.random = realRandom; }
  };
  const t1 = await planUnder(1_000_000_000, 0.1111);
  await sleep(30);
  const t2 = await planUnder(9_999_999_999, 0.9999);
  floors.push({ what: 'opening.delete: time-arm produced both plans', measured: t1 && t2 ? 1 : 0, min: 1 });
  if (t1 && t2) {
    const c = compareRuns(t1, t2);
    if (c.verdict !== 'identical') findings.push(`ARM 5 · TIME/RNG [opening.delete][${c.verdict}]: plans planned 30 ms apart under DIFFERENT spoofed Date.now/Math.random diverged — a clock or RNG read reaches the plan. ${c.detail}`);
    lines.push(`${c.verdict === 'identical' ? '✓ ' : '❌'} ARM 5 · opening.delete TIME/RNG: 30 ms apart, Date.now spoofed 1000000000 vs 9999999999, Math.random 0.1111 vs 0.9999 → ${c.verdict} (planner path observed ${clockReads} Date.now / ${rngReads} Math.random reads)`);
  }

  // The WALL-STORE-ORDER arm — this family's real ordering risk. The production path is a
  // REVERSE SCAN over the whole wall list (no wallId in either live payload), so a plan
  // that depended on store iteration order would explain one situation two ways. The host
  // and a decoy are presented in both orders. stateHash DOES move (the walls array is part
  // of the hashed state), so this is a plan-BODY claim, not a byte-identity claim.
  const decoyWorld = (order: 'ab' | 'ba'): OpeningDeleteWorld => {
    const host = freshOpeningDeleteWorld().walls[0];
    const decoy = { ...freshOpeningDeleteWorld().walls[0], id: 'wall-0', openings: [] };
    return { walls: order === 'ab' ? [host, decoy] : [decoy, host] };
  };
  const s1 = await buildOpeningDeleteService(decoyWorld('ab')).preview(OD_COMMAND);
  const s2 = await buildOpeningDeleteService(decoyWorld('ba')).preview(OD_COMMAND);
  floors.push({ what: 'opening.delete: store-order arm produced both plans', measured: s1 && s2 ? 1 : 0, min: 1 });
  if (s1 && s2) {
    const same =
      JSON.stringify({ c: s1.changed, e: s1.excluded, t: s1.topology, u: (s1 as any).undetermined }) ===
      JSON.stringify({ c: s2.changed, e: s2.excluded, t: s2.topology, u: (s2 as any).undetermined });
    floors.push({ what: 'opening.delete: the element sets and declarations are independent of the wall-store iteration order (the reverse scan sorts before it scans)', measured: same ? 1 : 0, min: 1 });
    if (!same) findings.push('ARM 5 · TIME/RNG [opening.delete · store-order]: the plan depends on the order the store yields walls — the reverse scan is not deterministic, and one situation would be explained two ways.');
    lines.push(`${same ? '✓ ' : '❌'} ARM 5 · opening.delete store-order: walls [host,decoy] vs [decoy,host] → same element sets and declarations`);
  }

  // ── ARM 2 · SENSITIVITY — one consequential fact each, stateHash held EQUAL ──
  const odPairHash = async (
    label: string,
    a: ConsequencePreviewService,
    b: ConsequencePreviewService,
    fact: string,
    section: { name: string; read: (p: Plan) => number },
    opts?: { setsMayDiffer?: boolean },
  ): Promise<void> => {
    const setsOf = (p: Plan): string =>
      JSON.stringify({ e: p.excluded, t: p.topology });
    const pa = await a.preview(OD_COMMAND);
    const pb = await b.preview(OD_COMMAND);
    floors.push({ what: `opening.delete: sensitivity pair "${label}" produced both plans`, measured: pa && pb ? 1 : 0, min: 1 });
    if (!pa || !pb) return;
    floors.push({ what: `opening.delete: sensitivity pair "${label}" holds stateHash EQUAL (the difference rides in the BODY)`, measured: pa.stateHash === pb.stateHash ? 1 : 0, min: 1 });
    const populated = Math.max(section.read(pa), section.read(pb));
    floors.push({ what: `opening.delete: sensitivity pair "${label}" is NOT INERT — the body section it names (${section.name}) is populated on at least one side`, measured: populated, min: 1 });
    if (!opts?.setsMayDiffer) {
      floors.push({
        what: `opening.delete: sensitivity pair "${label}" holds changed AND the element sets identical — so the planHash can only move via ${section.name}`,
        measured: JSON.stringify(pa.changed) === JSON.stringify(pb.changed) && setsOf(pa) === setsOf(pb) ? 1 : 0,
        min: 1,
      });
    } else {
      // 2a IS the changed-set pair: `changed` must differ (that is the fact), while
      // excluded/topology stay identical so no second set co-varies.
      floors.push({ what: `opening.delete: sensitivity pair "${label}" — changed DIFFERS (the planted fact) while excluded/topology are held identical`, measured: JSON.stringify(pa.changed) !== JSON.stringify(pb.changed) && setsOf(pa) === setsOf(pb) ? 1 : 0, min: 1 });
    }
    if (pa.planHash === pb.planHash) {
      findings.push(`ARM 2 · SENSITIVITY [opening.delete · ${label}]: two plans differing in ${fact} share planHash ${pa.planHash} — the d63e7954 collision class is OPEN on the opening-delete row.`);
      lines.push(`❌ ARM 2 · opening.delete ${label}: planHash DID NOT MOVE (${pa.planHash}) for a difference in ${fact}`);
    } else {
      lines.push(`✓  ARM 2 · opening.delete ${label}: planHash moved (${pa.planHash} → ${pb.planHash}) on ${fact}, stateHash equal (${pa.stateHash}), section ${section.name} populated (${populated})`);
    }
  };

  // 2a · changed-set-only. The RECORDED edge index answers with vs without an edge to
  // room-7 — the one seam that feeds `changed` on this row. Both sides proceed;
  // excluded/topology/metrics/validation are byte-identical; only the changed membership
  // (and the counterpart it names) differs.
  await odPairHash('changed-set-only',
    buildOpeningDeleteService(freshOpeningDeleteWorld(), { validator: odQuietValidator }),
    buildOpeningDeleteService(freshOpeningDeleteWorld(), {
      validator: odQuietValidator,
      relationships: { getRelationships: () => [...OD_EDGES, { id: 'e3', type: 'connectedBy', sourceId: 'room-7', targetId: 'door-1' }] },
    }),
    'ONLY the changed-set membership (a recorded edge to room-7 present vs absent), with excluded/topology identical',
    { name: 'changed', read: (p) => p.changed.length },
    { setsMayDiffer: true });

  // 2b · validation-only. Both sides PROCEED over identical state; only the validator's
  // verdict differs — quiet vs WALL_MAX_OPENINGS resolved by the removal.
  await odPairHash('validation-only',
    buildOpeningDeleteService(freshOpeningDeleteWorld(), { validator: odQuietValidator }),
    buildOpeningDeleteService(freshOpeningDeleteWorld()),
    'ONLY validation.violationsResolved (the removal cures WALL_MAX_OPENINGS vs a validator that finds nothing)',
    { name: 'validation.violationsResolved', read: (p) => p.validation.violationsResolved.length });

  // 2c · undetermined-detail-only. C78 §1.4 as a HASH claim: the SAME NO_DEPENDENCY_INDEX
  // verdict over the SAME scope, reached by two routes — no relationship reader composed
  // vs the composed reader THREW. Every element set, metric and validation entry is
  // byte-identical; the only differing bytes are inside `undetermined[].detail`. An
  // approval that could not tell them apart would bind "the graph was never asked" to
  // "the graph crashed mid-answer" — two different states of knowledge, one hash.
  await odPairHash('undetermined-detail-only',
    buildOpeningDeleteService(freshOpeningDeleteWorld(), { omitRelationships: true }),
    buildOpeningDeleteService(freshOpeningDeleteWorld(), {
      relationships: { getRelationships: () => { throw new Error('index unavailable'); } },
    }),
    'ONLY undetermined[].detail — the SAME NO_DEPENDENCY_INDEX verdict over the SAME scope reached by two different routes (no reader composed vs the composed reader threw)',
    { name: 'undetermined', read: (p) => (p as any).undetermined?.length ?? 0 });

  // ── ARM 3 · INSENSITIVITY ────────────────────────────────────────────────────
  const svcKeys = buildOpeningDeleteService(freshOpeningDeleteWorld());
  const orderedA = await svcKeys.preview(OD_COMMAND);
  const orderedB = await svcKeys.preview({
    type: 'opening.delete',
    payload: { openingType: 'door', id: 'door-1' },
  } as any);
  floors.push({ what: 'opening.delete: key-order pair produced both plans', measured: orderedA && orderedB ? 1 : 0, min: 1 });
  if (orderedA && orderedB) {
    if (orderedA.planHash !== orderedB.planHash) {
      findings.push(`ARM 3 · INSENSITIVITY [opening.delete · key-order]: permuting payload key insertion order moved the planHash (${orderedA.planHash} → ${orderedB.planHash}) — stableStringify is not doing its one job on the opening-delete row.`);
      lines.push('❌ ARM 3 · opening.delete key-order: payload key permutation MOVED the planHash');
    } else {
      lines.push(`✓  ARM 3 · opening.delete key-order: payload written forwards vs reversed → same planHash (${orderedA.planHash})`);
    }
  }

  // VERB-SPELLING insensitivity — THREE spellings, TWO payload shapes ({doorId}/{windowId}
  // vs the flat semantic {id}). One physical operation must plan BYTE-identically under
  // every spelling, or an approval minted under one could not bind a plan re-minted by the
  // AI path dispatching another.
  const doorSpellings: { label: string; cmd: any }[] = [
    { label: 'opening.delete (flat semantic)', cmd: OD_COMMAND },
    { label: 'door.delete ({doorId})', cmd: { type: 'door.delete', payload: { doorId: 'door-1' } } },
  ];
  const spelt: (Plan | null)[] = [];
  for (const s of doorSpellings) spelt.push(await buildOpeningDeleteService(freshOpeningDeleteWorld()).preview(s.cmd));
  floors.push({ what: 'opening.delete: both door spellings produced a plan (none silently unroutable)', measured: spelt.filter(Boolean).length, min: 2 });
  if (spelt[0] && spelt[1]) {
    const c = compareRuns(spelt[0], spelt[1]);
    if (c.verdict !== 'identical') findings.push(`ARM 3 · INSENSITIVITY [opening.delete · verb-spelling]: the SAME operation dispatched as '${doorSpellings[0]!.label}' and as '${doorSpellings[1]!.label}' produced different plans — the dispatch shape is leaking into the semantic command. ${c.detail}`);
    lines.push(`${c.verdict === 'identical' ? '✓ ' : '❌'} ARM 3 · opening.delete verb-spelling: ${doorSpellings[0]!.label} vs ${doorSpellings[1]!.label} → ${c.verdict}`);
  }
  // And the WINDOW spelling against its own semantic form — the other register verb of the
  // family, deleting the OTHER element (the win-1 sibling), through the same one planner.
  const wSem = await buildOpeningDeleteService(freshOpeningDeleteWorld()).preview({ type: 'opening.delete', payload: { id: 'win-1', openingType: 'window' } } as any);
  const wBus = await buildOpeningDeleteService(freshOpeningDeleteWorld()).preview({ type: 'window.delete', payload: { windowId: 'win-1' } } as any);
  floors.push({ what: 'opening.delete: both window spellings produced a plan', measured: wSem && wBus ? 1 : 0, min: 1 });
  if (wSem && wBus) {
    const c = compareRuns(wSem, wBus);
    if (c.verdict !== 'identical') findings.push(`ARM 3 · INSENSITIVITY [opening.delete · verb-spelling]: window.delete and its semantic form produced different plans for one operation. ${c.detail}`);
    lines.push(`${c.verdict === 'identical' ? '✓ ' : '❌'} ARM 3 · opening.delete verb-spelling: opening.delete (flat semantic, win-1) vs window.delete ({windowId}) → ${c.verdict}`);
  }

  // Envelope provenance — same shape of proof as all four earlier harnesses.
  const envelopes = [
    { actor: 'human', origin: 'direct-manipulation', timestamp: 1_111_111, gestureId: 'g-human-1' },
    { actor: 'ai', origin: 'ai-proposal', timestamp: 9_999_999, gestureId: 'g-ai-2', approval: { approvedBy: 'user-7', planHash: 'stale-cafe' } },
  ] as const;
  const envPlans: (Plan | null)[] = [];
  for (const env of envelopes) {
    Date.now = () => env.timestamp;
    try { envPlans.push(await buildOpeningDeleteService(freshOpeningDeleteWorld()).preview(OD_COMMAND)); }
    finally { Date.now = realNow; }
  }
  floors.push({ what: 'opening.delete: envelope pair produced both plans', measured: envPlans[0] && envPlans[1] ? 1 : 0, min: 1 });
  if (envPlans[0] && envPlans[1]) {
    const c = compareRuns(envPlans[0], envPlans[1]);
    if (c.verdict !== 'identical') findings.push(`ARM 3 · INSENSITIVITY [opening.delete · envelope]: actor/origin/timestamp/approval differences leaked into the plan — provenance must stay OFF the plan (C78 §9). ${c.detail}`);
    lines.push(`${c.verdict === 'identical' ? '✓ ' : '❌'} ARM 3 · opening.delete envelope: human/direct vs ai/proposal+approval, clocks 1111111 vs 9999999 → ${c.verdict}`);
  }

  // ── POSITIVE CONTROL (floor) — a nondeterministic delete planner MUST be flagged ──
  const noisy = buildOpeningDeleteService(freshOpeningDeleteWorld(), {
    plannerWrap: (real) => ({
      plan: async (c: any, ctx: any) => {
        const p = await real.plan(c, ctx);
        return { ...p, undetermined: [...p.undetermined, { scope: 'noise', reason: 'ENGINE_NOT_AVAILABLE', detail: `t=${realNow()}·r=${realRandom()}` }] };
      },
    }),
  });
  const n1 = await noisy.preview(OD_COMMAND);
  const n2 = await noisy.preview(OD_COMMAND);
  const noisyVerdict = n1 && n2 ? compareRuns(n1, n2) : null;
  floors.push({ what: 'POSITIVE control (opening.delete): a deliberately NONDETERMINISTIC planner is FLAGGED by the repeat checker', measured: noisyVerdict && noisyVerdict.verdict !== 'identical' ? 1 : 0, min: 1 });
  floors.push({ what: 'POSITIVE control (opening.delete): the checker CLASSIFIES it as the hash-bug shape (bodies differ, hash equal)', measured: noisyVerdict?.verdict === 'hash-bug' ? 1 : 0, min: 1 });
  lines.push(`${noisyVerdict && noisyVerdict.verdict !== 'identical' ? '✓ ' : '❌'} POSITIVE control (opening.delete): nondeterministic planner → ${noisyVerdict?.verdict ?? 'NO PLANS'}`);

  // ── NEGATIVE CONTROL (floor) — genuinely different states must hash apart ────
  const g1 = await buildOpeningDeleteService(freshOpeningDeleteWorld(0.5)).preview(OD_COMMAND);
  const g2 = await buildOpeningDeleteService(freshOpeningDeleteWorld(2.5)).preview(OD_COMMAND);
  const negSeen = g1 && g2 && g1.planHash !== g2.planHash ? 1 : 0;
  floors.push({ what: 'NEGATIVE control (opening.delete): two GENUINELY different states produce different planHashes (the sensitivity arms can see)', measured: negSeen, min: 1 });
  floors.push({ what: 'NEGATIVE control (opening.delete): and their stateHashes differ too, confirming the difference is in the AUTHORITATIVE state, not only the body', measured: g1 && g2 && g1.stateHash !== g2.stateHash ? 1 : 0, min: 1 });
  lines.push(`${negSeen ? '✓ ' : '❌'} NEGATIVE control (opening.delete): doomed door at offset 0.5 vs 2.5 → planHash ${g1?.planHash} vs ${g2?.planHash}`);

  return { floors, lines, findings };
}

const HARNESSES: Record<string, Harness> = {
  'wall.move': wallMoveHarness,
  'wall.create': wallCreateHarness,
  'opening.move': openingMoveHarness,
  'wall.opening.create': wallOpeningCreateHarness,
  'opening.delete': openingDeleteHarness,
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
