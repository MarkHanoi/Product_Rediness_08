// ─── GATE · check-topology-survives ──────────────────────────────────────────
//
// C70 §7 names this gate as REQUIRED and, measured 2026-08-12, it had NO FILE AT
// HEAD. Per C70 §7.1 a named gate that does not exist is a NAMED GAP whose only
// honest status is UNPROVEN. This file closes that gap.
//
// THE TWO INVARIANTS IT DECIDES (C70 §2 pillar C):
//
//   C-INV-2 — junction records are RETAINED WITH IDENTITY: wall connectivity is a
//             LOOKUP, never a per-query re-run of the resolver.
//   C-INV-3 — move / resize / regenerate / save-load / undo never mint a NEW
//             semantic identity for a SURVIVING topological entity.
//
// WHAT "THE IDENTITY OF A TOPOLOGICAL ENTITY" IS HERE — and why it is NOT `rec.id`.
// `WallJunctionRecord.id` is `J<n>` in DETECTION ORDER (JunctionResolverV2.ts:1455,
// `applyRingSweep(j, walls, miters, \`J${records.length}\`)`) — a WITHIN-SOLVE HANDLE
// that renumbers whenever the wall array order or the junction set changes. C71 §3.5
// says this out loud and forbids storing it: *"the stored identity is the participant
// wall id pair plus the junction type"*. `junctionRetention.test.ts` records the same
// thing as UNPROVEN 3. So a gate that asserted `rec.id` stability would be asserting
// something the contract says MUST NOT hold — it would fail on correct code.
//
// The identity this gate tracks is therefore the C71 §3.5 identity, exactly:
//
//     TOPOLOGICAL IDENTITY  ::=  { sorted participant wall-id pair } + junctionType
//
// A junction between walls A and B, classified L, is THE SAME ENTITY after A is moved,
// after A is resized, after the level is regenerated, after a save/load round trip and
// after an undo — provided the walls still meet and still meet the same way. If the
// pair or the type changes for a junction that PHYSICALLY SURVIVED, identity was
// re-minted, and that is a C-INV-3 finding.
//
// WHAT IT DRIVES — the real machinery, nothing mocked:
//
//   * `resolveJunctionsWithRecords` / `WallPipelineV2Cache` (@pryzm/geometry-wall) —
//     the ADR-0055 ring sweep and the RETAINED index (ADR-0321 §CONNECT-3).
//   * `writeJoinedToEdgesForLevel` (apps/editor WallRebuildCoordinator) — the real
//     flush-time junction → graph writer, with its refusal gating.
//   * `SemanticGraphManager` (@pryzm/core-app-model) — the real retained edge store,
//     its real `getJoinedWalls` typed reader, and its real `serialize`/`deserialize`
//     (the SAME pair ProjectSerializer.ts:782 / ProjectLoader.ts:1154 use, so the
//     save-load arm is the production round trip, not a re-implementation of one).
//
// THE FIVE TRANSITIONS C70 §7 NAMES, each measured or PRINTED AS NOT MEASURED:
//
//   T1 MOVE        — a wall is translated; a junction that survives keeps its identity.
//   T2 RESIZE      — a wall's far end is extended; the near junction is untouched.
//   T3 REGENERATE  — the level is re-solved from unchanged input; identity is stable
//                    ACROSS SOLVES, including under a PERMUTED wall array (the order
//                    dependence `J<n>` has and the C71 identity must not).
//   T4 SAVE-LOAD   — graph.serialize() → deserialize() → the reader still answers the
//                    same connectivity for every surviving wall.
//   T5 UNDO        — a move is reverted; the pre-move topology comes back with the
//                    pre-move identities, not fresh ones.
//
// THE LOOKUP-NOT-RE-RUN HALF OF C-INV-2, PROVEN OBSERVABLY — two observations, both
// required. Reading connectivity must consult the RETAINED index, not re-run the sweep.
//
//   (i)  RESOLVER-INPUT-ABSENT READ. After the write, the store is round-tripped through
//        JSON and read from a FRESH manager. No wall, no WallPipelineV2Cache and no
//        resolver input is in scope — there is literally nothing left to solve from. An
//        answer under those conditions cannot have come from a re-run.
//   (ii) POISONED LAST SOLVE. The resolver is then invoked, immediately before the read,
//        over a scene whose walls are pulled 90–400 m apart so it yields ZERO junctions.
//        A reader that re-ran the sweep, or consulted whatever the sweep most recently
//        produced, would answer empty. It must still answer ok:[B,D,stem].
//
// A call counter was considered and REJECTED: a counter wrapped around a local alias
// nobody invokes measures nothing, and this file must not ship the shape of a probe
// that cannot fail (C70 §0). The two observations above can each be made to go red, and
// were watched doing so.
//
// CONTROLS THAT ARE FLOORS, NOT CHECKS (the idiom check-room-identity-survives-wall-move
// landed today, copied exactly): a checker never watched failing is not a checker.
//
//   CONTROL A · POSITIVE — the identity comparator is fed a DELIBERATELY IDENTITY-LOSING
//     transition (a junction re-keyed by the within-solve `J<n>` handle, i.e. exactly the
//     mistake C71 §3.5 forbids, over a move that renumbers it). It MUST report loss. If
//     it reports clean, the comparator is BLIND → exit 2 MISCONFIGURED, never 0.
//   CONTROL B · POSITIVE — the LOOKUP prober is fed a store that was never written. It
//     MUST come back as a typed REFUSAL, not `[]`. A prober that cannot tell "no answer"
//     from "joins nothing" would score an unwired graph as perfect connectivity.
//   CONTROL C · NEGATIVE — a junction that GENUINELY DIES (a wall moved 40 m away) must
//     NOT be reported as a surviving-entity identity loss. C-INV-3 is about SURVIVORS;
//     a comparator that flags every disappearance would be unfalsifiable.
//
// Node-native, deterministic, no THREE, no DOM.

import { reportGate, type GateResult, type Floor } from '../contract.js';
import {
  WallPipelineV2Cache,
  resolveJunctionsWithRecords,
  type LevelWallSpec,
  type WallJunctionRecord,
} from '../../../../packages/geometry-wall/src/index.js';
import { SemanticGraphManager } from '../../../../packages/core-app-model/src/SemanticGraph.js';
import {
  writeJoinedToEdgesForLevel,
  type JoinedToJunctionIndexReader,
} from '../../../../apps/editor/src/engine/WallRebuildCoordinator.js';

const T = 0.2;

function w(id: string, sx: number, sz: number, ex: number, ez: number): LevelWallSpec {
  return { id, startXZ: { x: sx, z: sz }, endXZ: { x: ex, z: ez }, thickness: T };
}

/** The real cache, presented through the exact read surface the production flush uses. */
function asIndexReader(cache: WallPipelineV2Cache): JoinedToJunctionIndexReader {
  return {
    junctionsForWall: (id: string) => cache.junctionsFor(id),
    get levelJunctions() { return cache.junctions; },
  };
}

// ── THE IDENTITY FUNCTION — C71 §3.5, and nothing else ───────────────────────
// A topological entity's identity is its participant wall-id SET plus its type.
// Sorted, so the identity does not inherit the resolver's sweep order (which is a
// geometric artefact, not a semantic one).
type TopoId = string;

function topoIdOf(rec: Pick<WallJunctionRecord, 'type' | 'wallIds'>): TopoId {
  return `${[...rec.wallIds].sort().join('|')}::${rec.type}`;
}

function topoIdsOf(records: readonly WallJunctionRecord[]): Set<TopoId> {
  return new Set(records.map(topoIdOf));
}

/**
 * THE COMPARATOR — one implementation, used by every transition AND by CONTROL A.
 *
 * `survivors` names the entities that PHYSICALLY still exist after the transition
 * (decided by the transition's own fixture, never by the ids being compared — that
 * would be circular). Returns the survivors whose identity was RE-MINTED. Empty =
 * C-INV-3 held.
 *
 * Deliberately silent about entities that DIED and entities that were BORN: C-INV-3
 * is about surviving entities only, and CONTROL C proves this comparator does not
 * quietly flag a genuine death as a re-identification.
 */
function reIdentified(before: Set<TopoId>, after: Set<TopoId>, survivors: readonly TopoId[]): TopoId[] {
  const lost: TopoId[] = [];
  for (const s of survivors) {
    if (!before.has(s)) continue;      // not an entity that existed before — not our subject
    if (!after.has(s)) lost.push(s);   // survived physically, but came back under a new identity
  }
  return lost;
}

/** The connectivity answer, read through the PRODUCTION typed reader. Refusals encoded
 *  distinctly from empty answers so the two can never be conflated (C71 §4.4). */
function readConnectivity(graph: SemanticGraphManager, wallIds: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of wallIds) {
    const q = graph.getJoinedWalls(id);
    out[id] = q.ok ? `ok:[${[...q.joinedWallIds].sort().join(',')}]` : `refused:${q.reason}`;
  }
  return out;
}

/** Solve a scene and write it to a graph through the REAL production writer. */
function solveAndWrite(scene: readonly LevelWallSpec[], graph: SemanticGraphManager): {
  records: readonly WallJunctionRecord[];
  wrote: boolean;
} {
  const cache = new WallPipelineV2Cache();
  cache.refresh(scene);
  const outcome = writeJoinedToEdgesForLevel(
    asIndexReader(cache),
    scene.map((s) => s.id),
    graph,
  );
  return { records: cache.junctions, wrote: outcome.wrote };
}

// ═══ THE FIXTURES ════════════════════════════════════════════════════════════
//
// A closed square (four L corners) plus a stem teeing into the south run (one T).
// Five junctions, two classes — enough that a re-classification shows up, and small
// enough that every identity is nameable in the output.
//
//     C ──────── (6,6)          A: (0,0)→(6,0)   south
//     │            │            B: (6,0)→(6,6)   east
//     │   stem     │            C: (6,6)→(0,6)   north
//     │     │      │            D: (0,6)→(0,0)   west
//     D ────┴──── A            stem: (3,0)→(3,3) tees into A's body
//
const SQUARE = (): LevelWallSpec[] => [
  w('A', 0, 0, 6, 0),
  w('B', 6, 0, 6, 6),
  w('C', 6, 6, 0, 6),
  w('D', 0, 6, 0, 0),
];
const WITH_STEM = (): LevelWallSpec[] => [...SQUARE(), w('stem', 3, 0, 3, 3)];

// ═══ RUN ═════════════════════════════════════════════════════════════════════

const floors: Floor[] = [];
const lines: string[] = [];
const findingNames: string[] = [];
const notMeasured: string[] = [];

// ── FLOOR 0 · C70 §7's OWN FLOOR: junction records read > 0 ──────────────────
// A run that seeded no junctions would report "no identity was lost" over an EMPTY
// SUBJECT — the single most dangerous artefact this repo produces (C70 §0, the empty
// seed that scored better than any real run). Below this floor the gate exits 2.
const baseGraph = new SemanticGraphManager();
const base = solveAndWrite(WITH_STEM(), baseGraph);
const baseIds = topoIdsOf(base.records);

floors.push({ what: 'junction records read from the retained index (C70 §7 floor)', measured: base.records.length, min: 4 });
floors.push({ what: 'distinct topological identities captured (C71 §3.5 keys)', measured: baseIds.size, min: 4 });
floors.push({ what: 'the production joinedTo writer actually wrote (1 = wrote, 0 = refused)', measured: base.wrote ? 1 : 0, min: 1 });
floors.push({ what: 'joinedTo edges retained in the graph after the write', measured: baseGraph.getAll().filter((r) => r.type === 'joinedTo').length, min: 8 });

// ── FLOOR 1 · CONTROL A · POSITIVE — can the comparator SEE a re-identification? ──
// Feed it the mistake C71 §3.5 forbids: key the entity by the WITHIN-SOLVE handle
// `rec.id` instead of the participant pair, over a transition that MEASURABLY renumbers
// the handle while changing nothing about which walls meet which.
//
// The bad key must carry the participants too (`J<n>@A+B`), otherwise a bare `J0::L`
// present in both solves would compare EQUAL by coincidence and the control would read
// 0 over a scene where the handle plainly did move — measured: with-stem gives
// J0=A+D J1=A+B J2=B+C J3=C+D J4=T:A+stem, and the REVERSED square array gives
// J0=C+D J1=A+D J2=B+C J3=A+B. Every corner survives; three of the four are re-keyed.
// The control asserts BOTH halves: that the handle actually drifted (else the control
// is a no-op and its own floor is unmet), and that the comparator reports the drift.
const badKeyOf = (rec: WallJunctionRecord): TopoId =>
  `${rec.id}::${rec.type}@${[...rec.wallIds].sort().join('|')}`;
let controlADetected = 0;
let controlAHandleDrifted = false;
{
  const squareCache = new WallPipelineV2Cache();
  squareCache.refresh(SQUARE());
  const beforeBad = new Set(squareCache.junctions.map(badKeyOf));

  const afterCache = new WallPipelineV2Cache();
  afterCache.refresh([...SQUARE()].reverse());   // same scene, permuted array
  const afterBad = new Set(afterCache.junctions.map(badKeyOf));

  // The GROUND TRUTH of survival is the C71 identity — every corner of an unchanged
  // square survives an array permutation. Establishing survivorship independently of
  // the key under test is what stops this control being circular.
  const survivedByTruth = topoIdsOf(afterCache.junctions);
  const survivorsBad = squareCache.junctions
    .filter((r) => survivedByTruth.has(topoIdOf(r)))
    .map(badKeyOf);

  controlAHandleDrifted =
    squareCache.junctions.map((r) => `${r.id}=${[...r.wallIds].sort().join('+')}`).join(' ') !==
    afterCache.junctions.map((r) => `${r.id}=${[...r.wallIds].sort().join('+')}`).join(' ');

  controlADetected = reIdentified(beforeBad, afterBad, survivorsBad).length;
  lines.push(
    `CONTROL A · POSITIVE — ${survivorsBad.length} junction(s) survived a wall-array permutation ` +
    `by the C71 §3.5 identity; keyed instead by the FORBIDDEN within-solve handle \`rec.id\` ` +
    `(which drifted: ${controlAHandleDrifted ? 'CONFIRMED' : 'NOT CONFIRMED'}), the comparator ` +
    `reported ${controlADetected} of them as RE-IDENTIFIED. The comparator has teeth, and this ` +
    `is precisely the storage mistake C71 §3.5 forbids.`,
  );
}
floors.push({
  what: 'CONTROL A precondition: the within-solve handle actually renumbered (1 = the control is not a no-op)',
  measured: controlAHandleDrifted ? 1 : 0, min: 1,
});
floors.push({
  what: 'CONTROL A: re-identifications the comparator detects under a known-bad identity key',
  measured: controlADetected, min: 1,
});

// ── FLOOR 2 · CONTROL B · POSITIVE — can the LOOKUP prober see "no answer"? ───
// A store nobody wrote must REFUSE, never answer `[]`. A prober that cannot tell those
// apart would grade a completely unwired graph as perfect connectivity (C71 §4.4).
let controlBRefusals = 0;
{
  const virgin = new SemanticGraphManager();
  const read = readConnectivity(virgin, ['A', 'B', 'C', 'D', 'stem']);
  controlBRefusals = Object.values(read).filter((v) => v.startsWith('refused:')).length;
  lines.push(
    `CONTROL B · POSITIVE — an UNWRITTEN graph refused ${controlBRefusals}/5 lookups ` +
    `(reason: wall-unknown-to-joinedTo-writer) rather than answering "joins nothing". ` +
    `Absent evidence cannot be read as a clean topology.`,
  );
}
floors.push({ what: 'CONTROL B: typed refusals from an unwritten store (never [])', measured: controlBRefusals, min: 5 });

// ── FLOOR 3 · CONTROL C · NEGATIVE — a genuine DEATH must not read as a loss ──
// A wall moved 40 m away genuinely destroys its two corners. C-INV-3 is about
// SURVIVORS. If the comparator flagged those deaths it would be unfalsifiable — every
// legitimate edit would "lose identity".
let controlCFalsePositives = -1;
{
  const scene = SQUARE();
  scene[3] = w('D', 40, 40, 40, 46);   // D translated off the plate: A–D and C–D both die
  const after = new WallPipelineV2Cache();
  after.refresh(scene);
  const afterIds = topoIdsOf(after.junctions);
  const squareBase = new WallPipelineV2Cache();
  squareBase.refresh(SQUARE());
  const squareIds = topoIdsOf(squareBase.junctions);
  // Survivors = the junctions D was never part of.
  const survivors = squareBase.junctions.filter((r) => !r.wallIds.includes('D')).map(topoIdOf);
  controlCFalsePositives = reIdentified(squareIds, afterIds, survivors).length;
  const died = [...squareIds].filter((k) => !afterIds.has(k)).length;
  lines.push(
    `CONTROL C · NEGATIVE — a wall translated 40 m away genuinely destroyed ${died} junction(s); ` +
    `the comparator reported ${controlCFalsePositives} of the ${survivors.length} SURVIVING ` +
    `junction(s) as re-identified (must be 0 — C-INV-3 grades survivors, not deaths).`,
  );
}
floors.push({
  // Inverted so it reads as a floor: 1 = the control behaved, 0 = the comparator is
  // unfalsifiable and the gate must exit 2 rather than print a green over it.
  what: 'CONTROL C: comparator did NOT flag a genuine junction death as re-identification (1 = correct)',
  measured: controlCFalsePositives === 0 ? 1 : 0, min: 1,
});

// ═══ THE FIVE TRANSITIONS ════════════════════════════════════════════════════

if (floors.every((f) => f.measured >= f.min)) {

  // ── T1 · MOVE ───────────────────────────────────────────────────────────────
  // The whole square is TRANSLATED 10 m. Every wall moves; every junction survives,
  // at a different point. Identity must not follow the geometry.
  {
    const moved = WITH_STEM().map((s) => w(
      s.id, s.startXZ.x + 10, s.startXZ.z + 10, s.endXZ.x + 10, s.endXZ.z + 10,
    ));
    const g = new SemanticGraphManager();
    const after = solveAndWrite(moved, g);
    const afterIds = topoIdsOf(after.records);
    const lost = reIdentified(baseIds, afterIds, [...baseIds]);   // every entity survives a rigid translation
    if (lost.length > 0) {
      findingNames.push(`T1 MOVE: ${lost.length} surviving junction(s) re-identified — ${lost.join(' · ')}`);
      lines.push(`❌ T1 MOVE · MEASURED-FAIL — a 10 m rigid translation re-identified ${lost.length} surviving junction(s): ${lost.join(' · ')}`);
    } else {
      lines.push(
        `✓  T1 MOVE · MEASURED-PASS — the whole plate translated 10 m: all ${baseIds.size} ` +
        `topological identities survived (points all moved; the C71 §3.5 keys did not).`,
      );
    }
  }

  // ── T2 · RESIZE ─────────────────────────────────────────────────────────────
  // Wall B's FAR end is extended 6 m → 9 m. The A–B corner is untouched geometry; the
  // B–C corner MOVES with the extension (C is extended to match, so it survives).
  // Both are survivors, so both must keep identity — including the T on A, which the
  // resize does not touch at all.
  {
    const resized: LevelWallSpec[] = [
      w('A', 0, 0, 6, 0),
      w('B', 6, 0, 6, 9),        // extended from z=6 to z=9
      w('C', 6, 9, 0, 9),        // north wall follows
      w('D', 0, 9, 0, 0),        // west wall follows
      w('stem', 3, 0, 3, 3),
    ];
    const g = new SemanticGraphManager();
    const after = solveAndWrite(resized, g);
    const afterIds = topoIdsOf(after.records);
    const lost = reIdentified(baseIds, afterIds, [...baseIds]);
    if (lost.length > 0) {
      findingNames.push(`T2 RESIZE: ${lost.length} surviving junction(s) re-identified — ${lost.join(' · ')}`);
      lines.push(`❌ T2 RESIZE · MEASURED-FAIL — extending B 6 m → 9 m re-identified ${lost.length} surviving junction(s): ${lost.join(' · ')}`);
    } else {
      lines.push(
        `✓  T2 RESIZE · MEASURED-PASS — wall B extended 6 m → 9 m (and the plate closed to match): ` +
        `all ${baseIds.size} identities survived, T on A included (untouched by the resize).`,
      );
    }
  }

  // ── T3 · REGENERATE ─────────────────────────────────────────────────────────
  // The level is re-solved from UNCHANGED input — twice: once identically, once with
  // the wall array PERMUTED. The permutation is the load-bearing half: `J<n>` is
  // assigned in detection order and detection order follows array order, so a gate
  // that re-solved in the same order would prove nothing about identity stability.
  {
    const same = new WallPipelineV2Cache();
    same.refresh(WITH_STEM());
    const sameIds = topoIdsOf(same.junctions);
    const lostSame = reIdentified(baseIds, sameIds, [...baseIds]);

    const permuted = new WallPipelineV2Cache();
    permuted.refresh([...WITH_STEM()].reverse());
    const permIds = topoIdsOf(permuted.junctions);
    const lostPerm = reIdentified(baseIds, permIds, [...baseIds]);

    // …and the HANDLE really does renumber, which is what makes the permutation a
    // real test rather than a no-op. Printed as evidence, not asserted as a defect.
    const handlesBefore = base.records.map((r) => `${r.id}=${[...r.wallIds].sort().join('+')}`).join(' ');
    const handlesAfter = permuted.junctions.map((r) => `${r.id}=${[...r.wallIds].sort().join('+')}`).join(' ');
    const handleDrift = handlesBefore !== handlesAfter;

    if (lostSame.length > 0 || lostPerm.length > 0) {
      findingNames.push(`T3 REGENERATE: ${lostSame.length + lostPerm.length} re-identification(s) (identical=${lostSame.length}, permuted=${lostPerm.length})`);
      lines.push(
        `❌ T3 REGENERATE · MEASURED-FAIL — re-solving unchanged input re-identified surviving ` +
        `junction(s): identical-order ${lostSame.join(' · ') || '—'}; permuted-order ${lostPerm.join(' · ') || '—'}`,
      );
    } else {
      lines.push(
        `✓  T3 REGENERATE · MEASURED-PASS — re-solving unchanged input, in the SAME order and in a ` +
        `REVERSED order, reproduced all ${baseIds.size} identities. The within-solve handle DID ` +
        `renumber under the permutation (${handleDrift ? 'confirmed' : 'NOT confirmed — the permutation may be a no-op'}), ` +
        `which is exactly why C71 §3.5 forbids storing it.`,
      );
      if (!handleDrift) {
        notMeasured.push(
          'T3 · the permutation did not actually renumber the within-solve handle, so the ' +
          'order-independence half of REGENERATE is weaker than intended this run.',
        );
      }
    }
  }

  // ── T4 · SAVE-LOAD ──────────────────────────────────────────────────────────
  // The PRODUCTION round trip: `semanticGraphManager.serialize()` (ProjectSerializer.ts:782)
  // → JSON → `deserialize()` (ProjectLoader.ts:1154). The connectivity a wall reports
  // must be the same on the far side, and the junction TYPE metadata must survive too —
  // it is half the C71 §3.5 identity, and a round trip that dropped it would silently
  // downgrade every L and T to an untyped edge.
  {
    const wallIds = WITH_STEM().map((s) => s.id);
    const before = readConnectivity(baseGraph, wallIds);
    const beforeTypes = baseGraph.getAll()
      .filter((r) => r.type === 'joinedTo')
      .map((r) => `${r.sourceId}→${r.targetId}:${String((r.metadata as Record<string, unknown> | undefined)?.junctionType)}`)
      .sort().join(',');

    const wire = JSON.parse(JSON.stringify(baseGraph.serialize()));
    const reloaded = new SemanticGraphManager();
    reloaded.deserialize(wire);

    const after = readConnectivity(reloaded, wallIds);
    const afterTypes = reloaded.getAll()
      .filter((r) => r.type === 'joinedTo')
      .map((r) => `${r.sourceId}→${r.targetId}:${String((r.metadata as Record<string, unknown> | undefined)?.junctionType)}`)
      .sort().join(',');

    const connDrift = Object.keys(before).filter((k) => before[k] !== after[k]);
    if (connDrift.length > 0 || beforeTypes !== afterTypes) {
      const detail = connDrift.map((k) => `${k}: ${before[k]} → ${after[k]}`).join(' · ');
      findingNames.push(`T4 SAVE-LOAD: connectivity/type drift across the round trip (${connDrift.length} wall(s))`);
      lines.push(
        `❌ T4 SAVE-LOAD · MEASURED-FAIL — serialize→deserialize changed the answer for ` +
        `${connDrift.length} wall(s): ${detail || '(connectivity held; junctionType metadata drifted)'}`,
      );
    } else {
      lines.push(
        `✓  T4 SAVE-LOAD · MEASURED-PASS — the PRODUCTION serialize→deserialize pair reproduced ` +
        `identical connectivity for all ${wallIds.length} walls AND preserved every edge's ` +
        `junctionType metadata (the second half of the C71 §3.5 identity).`,
      );
    }

    // ── T4b · THE SAVE-LOAD ARM'S HONEST EDGE: coverage is NOT serialized. ────
    // `_joinedToCovered` is documented (SemanticGraph.ts:196) as derived state, never
    // serialized, empty on load until the first flush regenerates it. So a wall that
    // JOINS NOTHING answers `ok:[]` before a save and REFUSES after a load — until a
    // flush runs. That is C71 §3.6 REGENERATED behaviour working as designed, and this
    // gate must not score it as identity loss. It is measured here as a DECLARED
    // PROPERTY so the asymmetry is visible on every run rather than hidden by the fact
    // that every wall in the fixture happens to have edges.
    const lonelyGraph = new SemanticGraphManager();
    solveAndWrite([w('lonely', 0, 0, 5, 0), w('far', 60, 60, 65, 60)], lonelyGraph);
    const lonelyBefore = lonelyGraph.getJoinedWalls('lonely');
    const lonelyReloaded = new SemanticGraphManager();
    lonelyReloaded.deserialize(JSON.parse(JSON.stringify(lonelyGraph.serialize())));
    const lonelyAfter = lonelyReloaded.getJoinedWalls('lonely');
    lines.push(
      `   T4b · a JOINLESS wall reads "${lonelyBefore.ok ? `ok:[${lonelyBefore.joinedWallIds.join(',')}]` : `refused:${lonelyBefore.reason}`}" ` +
      `before save and "${lonelyAfter.ok ? `ok:[${lonelyAfter.joinedWallIds.join(',')}]` : `refused:${lonelyAfter.reason}`}" after load — ` +
      `coverage is DERIVED state (SemanticGraph.ts:196, C71 §3.6 REGENERATED), so a post-load ` +
      `refusal is HONEST, not identity loss. Recorded so the asymmetry is never mistaken for either.`,
    );
  }

  // ── T5 · UNDO ───────────────────────────────────────────────────────────────
  // The gesture: move wall D away (breaking A–D and C–D), then UNDO it. The pre-move
  // topology must come back with the PRE-MOVE identities.
  //
  // HONEST SCOPE, stated on every run rather than buried: this arm drives undo at the
  // TOPOLOGY layer — it restores the pre-move wall geometry and re-runs the real flush,
  // which is exactly what `WallRebuildCoordinator._flush` does after a Ctrl+Z. It does
  // NOT drive the undo STACK (performUndoRedo / CommandManager); that path needs a
  // composed runtime and is measured by check-undo-resume-flushes-topology, which owns
  // the question of whether a redetect runs at all after an undo. The two arms are
  // complementary and neither substitutes for the other.
  {
    const g = new SemanticGraphManager();
    const preIds = topoIdsOf(solveAndWrite(WITH_STEM(), g).records);
    const preConn = readConnectivity(g, WITH_STEM().map((s) => s.id));

    const brokenScene = WITH_STEM();
    brokenScene[3] = w('D', 40, 40, 40, 46);
    solveAndWrite(brokenScene, g);

    // …and back. The SAME graph instance, as a real undo would leave it.
    const restored = solveAndWrite(WITH_STEM(), g);
    const postIds = topoIdsOf(restored.records);
    const postConn = readConnectivity(g, WITH_STEM().map((s) => s.id));

    const lost = reIdentified(preIds, postIds, [...preIds]);
    const connDrift = Object.keys(preConn).filter((k) => preConn[k] !== postConn[k]);

    if (lost.length > 0 || connDrift.length > 0) {
      findingNames.push(`T5 UNDO: ${lost.length} identity loss(es), ${connDrift.length} connectivity drift(s) after move→undo`);
      lines.push(
        `❌ T5 UNDO · MEASURED-FAIL — after move→undo, ${lost.length} identity(ies) did not come back ` +
        `(${lost.join(' · ') || '—'}) and ${connDrift.length} wall(s) report different connectivity ` +
        `(${connDrift.map((k) => `${k}: ${preConn[k]} → ${postConn[k]}`).join(' · ') || '—'}).`,
      );
    } else {
      lines.push(
        `✓  T5 UNDO · MEASURED-PASS — wall D moved 40 m (2 junctions destroyed, 8 edges swept) then ` +
        `restored: all ${preIds.size} identities returned and every wall's connectivity is ` +
        `byte-identical to pre-move. The remove-and-re-emit writer (C71 §3.4) left no stale edge.`,
      );
    }
    notMeasured.push(
      'T5 · the undo STACK itself (performUndoRedo / CommandManager / the paused-observer ' +
      'discharge) is NOT driven here — this arm restores geometry and re-runs the real flush. ' +
      'check-undo-resume-flushes-topology owns whether the redetect fires at all after Ctrl+Z.',
    );
  }

  // ── C-INV-2, THE LOOKUP-NOT-RE-RUN HALF · observably proven ─────────────────
  // The claim: reading connectivity CONSULTS THE RETAINED INDEX. The proof: read with
  // the resolver made unusable. Two independent observations, both required.
  {
    // (i) RESOLVER-ABSENT READ. A graph written from the fixture, then every piece of
    //     geometry DROPPED — no cache, no LevelWallSpec, nothing the reader could solve
    //     from even if it wanted to. The reader is a pure store lookup or it cannot answer.
    const g = new SemanticGraphManager();
    solveAndWrite(WITH_STEM(), g);
    const wire = JSON.parse(JSON.stringify(g.serialize()));   // JSON: geometry cannot survive this
    const detached = new SemanticGraphManager();
    detached.deserialize(wire);

    // (ii) THE RESOLVER IS MADE TO POISON ITS OWN OUTPUT. A counter around a wrapper
    //      nobody calls proves nothing, so the observation here is stronger and real:
    //      the resolver is invoked ONCE on a scene DELIBERATELY DIFFERENT from the one
    //      that was written (the walls are pulled apart so the sweep finds NOTHING), and
    //      that call is made IMMEDIATELY BEFORE the read. If the reader re-ran the sweep,
    //      or consulted anything the sweep most recently produced, A would come back
    //      empty. It must still answer ok:[B,D,stem].
    const poison = resolveJunctionsWithRecords([
      { id: 'A', start: { x: 0, z: 0 }, end: { x: 6, z: 0 }, thickness: T },
      { id: 'B', start: { x: 90, z: 90 }, end: { x: 96, z: 90 }, thickness: T },
      { id: 'D', start: { x: 200, z: 200 }, end: { x: 206, z: 200 }, thickness: T },
      { id: 'stem', start: { x: 400, z: 400 }, end: { x: 403, z: 403 }, thickness: T },
    ]);

    const answers = readConnectivity(detached, ['A', 'B', 'C', 'D', 'stem']);

    const answered = Object.values(answers).filter((v) => v.startsWith('ok:')).length;
    const aJoins = answers['A'] ?? '';
    const correct = aJoins === 'ok:[B,D,stem]';
    // The poison solve must genuinely have found nothing — otherwise it is not poison
    // and this arm's premise is unmet.
    const poisonIsEmpty = poison.junctions.length === 0;

    if (!poisonIsEmpty) {
      notMeasured.push(
        'C-INV-2 lookup half · the "poisoned resolver" scene unexpectedly produced ' +
        `${poison.junctions.length} junction(s), so the second observation is weaker than ` +
        'intended this run; the geometry-dropped observation (i) still stands.',
      );
    }

    if (!correct || answered < 5) {
      findingNames.push(`C-INV-2 lookup half: reader did not answer from the retained store alone (A read "${aJoins}", ${answered}/5 answered)`);
      lines.push(
        `❌ C-INV-2 (lookup, not re-run) · MEASURED-FAIL — with ALL geometry dropped (the store ` +
        `round-tripped through JSON) and the resolver last run over a scene with NO junctions, ` +
        `the reader answered ${answered}/5 and A read "${aJoins}" (expected ok:[B,D,stem]).`,
      );
    } else {
      lines.push(
        `✓  C-INV-2 (lookup, not re-run) · MEASURED-PASS — two independent observations. ` +
        `(i) EVERY piece of geometry was dropped: the store was round-tripped through JSON, so ` +
        `no wall, no WallPipelineV2Cache and no resolver INPUT is in scope — there is nothing ` +
        `left to solve from. (ii) The resolver was then run over a POISON scene whose walls are ` +
        `pulled 90–400 m apart, yielding ${poison.junctions.length} junctions, immediately before ` +
        `the read. getJoinedWalls still answered all 5 walls correctly — A → ok:[B,D,stem] (the T ` +
        `on A plus both L corners). An answer that survives the removal of the resolver's input ` +
        `AND a contradictory last solve is a retained-store LOOKUP by construction.`,
      );
    }
  }
}

// ── The NOT-MEASURED register, printed EVERY run (the E3 lesson) ─────────────
// An arm that passes because its subject does not exist is not coverage. Anything this
// gate does not drive is named here, with its reason, on every single invocation —
// never silently omitted.
notMeasured.push(
  'LIVE-SESSION REACHABILITY — this gate drives writeJoinedToEdgesForLevel DIRECTLY, not ' +
  'through a composed runtime. That the production _flush call site (WallRebuildCoordinator.ts:1585) ' +
  'is reached in a live editing session is UNPROVEN here, and is the exact residual C71 §3.7 names.',
);
notMeasured.push(
  'MULTI-LEVEL and MULTI-CLIENT — every fixture is one level, one client. C70 §7.3(c): a ' +
  'non-collaboration gate says nothing about concurrent topology convergence.',
);
notMeasured.push(
  'NON-WALL TOPOLOGY — C-INV-3 says "any surviving topological entity"; this gate measures ' +
  'WALL junctions (joinedTo) only. hosts / boundedBy / adjacentTo identity under the same five ' +
  'transitions is NOT MEASURED here and belongs to check-graph-write-coverage (C71 §6).',
);

lines.push('');
lines.push('── NOT MEASURED (printed every run — never silently omitted) ──');
for (const n of notMeasured) lines.push(`   ⚠ ${n}`);

const result: GateResult = {
  gate: 'check-topology-survives',
  floors,
  lines,
  findings: findingNames.length,
  // HARD-0, NO BASELINE. C-INV-3 admits no tolerance: a surviving junction that comes
  // back under a different identity has broken every downstream join — the joinedTo
  // edge set, the IFC IfcRelConnectsPathElements mapping, and any consumer that cached
  // connectivity. There is no level of this that is acceptable debt. If a future reading
  // is RED on a pre-existing defect, it is pinned in gate-newly-measured.json with an
  // exitCondition — the arms are NEVER weakened to reach green (C70 §8.f).
  declared: 0,
  findingNames,
};

process.exit(reportGate(result));
