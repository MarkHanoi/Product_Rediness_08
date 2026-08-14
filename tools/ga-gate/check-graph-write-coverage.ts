#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-graph-write-coverage.ts
 *
 * C71 §6 (`check-graph-write-coverage`) · C70 §7 row C-INV-1 / C-INV-4 ·
 * ADR-0320 (vocabulary scoped by consumers) · ADR-0321 (`joinedTo`).
 * BIM30-READINESS-GATES §2.1a (residency), §2.2 (executed controls), §2.3 (land red).
 *
 * ─── What this gate decides ──────────────────────────────────────────────────
 * **C-INV-1** — every REQUIRED relationship family (C71 §2.1, the nine) carries
 * FOUR obligations, reported PER TYPE and never aggregated:
 *
 *     WRITER   ≥1 production code path that CREATES the edge
 *     READER   ≥1 production code path that TYPED-READS it (C71 §1.3: an untyped
 *              sweep is not a reader, and this gate refuses to count one)
 *     REBUILD  the family is reconstructed on load, OR its non-reconstruction is
 *              NAMED at a declaration site (regenerated / unreconstructable)
 *     DELETE   the family survives element deletion honestly — either a
 *              type-aware purge/re-emit, or the type-agnostic cascade
 *
 * Aggregating those four is the failure this gate exists to prevent. A type with
 * a writer and no reader is write-only state nobody can query (the `sitsOn`
 * defect, EV-05 §1). A type with no rebuild coverage is lost on reload. A type
 * whose delete path does not update it leaves stale edges. One "coverage %" over
 * all four hides all three.
 *
 * **C-INV-4** — the count of declared-but-unwritten types never GROWS. The LEDGER
 * below is NAMED (C70 §5.5 — a bare count lets one fix and one break cancel out)
 * and SHRINK-ONLY, checked in BOTH directions: an unledgered finding exits 3, and
 * a ledger entry no longer measured is STALE and also exits 3 (C70 §5.4).
 *
 * ─── HOW TO RE-DERIVE EVERY NUMBER BELOW ─────────────────────────────────────
 *     npx tsx tools/ga-gate/check-graph-write-coverage.ts
 *
 * It prints the full per-type × per-obligation matrix with file:line evidence for
 * every cell it fills, the PARKED table separately, both controls, and the floors
 * as measured-vs-min. There is no `--write-baseline`: the ledger is the `LEDGER`
 * array in this file, edited by hand, because every entry needs a reason a human
 * wrote and a reviewer can refuse.
 *
 * ─── RESIDENCY — why tools/ga-gate/ and not the certification tree ───────────
 * ⚠ **Deviation from C71 §6, stated rather than hidden.** C71 §6's preamble says
 * "All three belong beside the BIM 3.0 certification gates at
 * `tools/rac-conformance/certification/gates/`". This gate lands in
 * `tools/ga-gate/` instead, and the deviation is deliberate:
 *
 *   • BIM30-READINESS-GATES §2.1a is the LATER and more specific rule, and it
 *     replaces "which suite is this gate spiritually part of" with ONE mechanical
 *     boundary test: *does this gate need something that does not exist until
 *     something runs?* For this gate the answer is **no**. Its entire subject —
 *     "does every REQUIRED type have a writer / reader / rebuild / delete path" —
 *     is answerable from the tree at HEAD by a single-pass comment-stripped scan.
 *     It composes no runtime, seeds no world, dispatches no verb, opens no
 *     transport, and grades no artefact written in the same invocation.
 *   • §2.1a's own worked precedent points the same way: `check-solver-is-real`,
 *     `check-provenance-not-invented` and `check-epsilon-policy` are recorded
 *     there as **"correctly placed" in `tools/ga-gate/` — static single-pass
 *     scans"**, which is exactly this gate's shape. The mirror-image finding
 *     (`check-collab-graph-integrity`, an EXECUTED gate parked in `ga-gate/`) is a
 *     standing finding precisely because residency follows the RUNNER.
 *   • §2.1b keeps the deviation safe, and is the part C70 §7.2 actually cared
 *     about: there is exactly ONE exit-code implementation and this gate IMPORTS
 *     it — `tools/rac-conformance/certification/contract.ts`. Two homes sharing
 *     one contract is a split; two contracts is a fork. This file hand-rolls no
 *     exit code.
 *   • Cost decides the rest. A ~10-second scan belongs in the sweep people run
 *     casually; burying it inside `certify.ts` next to multi-minute executed
 *     gates is how a cheap check becomes one nobody runs (L-774).
 *
 * If C71 §6 is later amended to make the certification tree binding regardless of
 * runner, MOVE THE FILE and re-register the path — nothing else in this gate
 * depends on its address.
 *
 * ─── THE RECIPE, stated so the reading is falsifiable ───────────────────────
 * SUBJECT. The `RelationshipType` union is parsed FROM SOURCE
 * (`packages/core-app-model/src/SemanticGraph.ts`) — never from a list typed into
 * this gate. A hard-coded vocabulary would make the gate blind to exactly the
 * event C71 §2.6 exists to catch (a new member landing without its four
 * elements). The REQUIRED/PARKED split IS declared here, because that split is a
 * CONTRACT decision (C71 §2.1/§2.2, ADR-0320) and not a fact of the source; the
 * gate cross-checks its declared split against the parsed union and exits 2 if
 * they disagree, so a member added to the union without a C71 classification
 * cannot slip through as neither-required-nor-parked.
 *
 * EVIDENCE. Every arm scans `packages/`, `apps/`, `plugins/` for .ts/.tsx, with
 * comments STRIPPED first (`lib/sourceScan.ts` idiom via `stripComments`) so a
 * type named in a docblock is never counted as a writer — which matters
 * enormously here, since the union's own `joinedTo` docblock names its writer,
 * its reader, its rebuild disposition and its delete path in prose.
 *
 * EXCLUSIONS, and why each one is not a convenience:
 *   • tests (`__tests__/`, `*.test.ts`, `*.spec.ts`) — C71 §6 Subject line.
 *   • `SemanticGraph.ts` itself — same line. It is the declaration site; counting
 *     it would let the union prove its own coverage. ⚠ This is what makes
 *     `joinedTo` look writerless to a naive scan (its sole `addRelationship`
 *     calls are inside `replaceJoinedToForLevelWalls`), and is handled by the
 *     HELPER-WRITER rule below rather than by weakening the exclusion.
 *   • `packages/building-graph/`, `apps/editor/src/engine/buildBuildingGraph.ts`,
 *     `packages/room-topology/src/TopologyLayer.ts` — the UBG and the topology
 *     layer are DIFFERENT GRAPHS with an overlapping vocabulary (C71 §4,
 *     anti-pattern §7.g: reading a UBG type name as SemanticGraph coverage "has
 *     already produced one false claim"). Their `graph.addEdge({type:'adjacentTo'})`
 *     is not a SemanticGraph write, so arms key on the CALL TARGET
 *     (`addRelationship` / `getTargets` / …), not on the bare literal.
 *   • `dist/`, `dist-gate/`, `dist-apex/` — checked-in minified bundles match
 *     `supports` and `contains` as DOM/JS vocabulary.
 *
 * WRITER is one of:
 *   (w1) an `addRelationship(` call whose object literal carries `type: 'X'`
 *        within a short forward window (the multi-line command-registry shape);
 *   (w2) `addRel(a, b, 'X')` — the rebuild helper's third positional argument;
 *   (w3) a HELPER WRITER declared in `HELPER_WRITERS` — a named `SemanticGraph`
 *        method that writes a specific family, credited at its production CALL
 *        SITE outside SemanticGraph.ts. Exactly one exists
 *        (`replaceJoinedToForLevelWalls` → `joinedTo`, ADR-0321 / C71 §3.4). This
 *        is not an escape hatch: the map is CLOSED, each entry names its family,
 *        and a helper with no production caller earns no credit.
 *
 * READER is a TYPED read only (C71 §1.3):
 *   (r1) `getTargets(…, 'X')` / `getSources(…, 'X')` / `getRelationships(…, 'X')`
 *        / `hasRelationship(…, 'X')` — the literal must appear in the ARGUMENT
 *        list, so `getRelationships(id)` (untyped, one arg) is correctly refused;
 *   (r2) `traverse(…, ['X'…])`;
 *   (r3) `.type === 'X'` / `.type !== 'X'` — a typed discriminator over edges;
 *   (r4) a DEDICATED typed reader from `DEDICATED_READERS`, credited at its
 *        production call site (`getJoinedWalls` → `joinedTo`, C71 §3 / §4.4).
 *
 * NOT a reader, deliberately, and each of these was measured present at HEAD:
 *   • `GraphQueryService.SUPPORTED_RELATIONSHIP_TYPES` — a 14-member `Set` of
 *     literals that the service `.has()`-checks before calling
 *     `getTargets(elementId, relationshipType as RelationshipType)` with a STRING
 *     FROM A COMMAND PAYLOAD. It is a permission allowlist for a dynamic reader,
 *     not fourteen typed readers. Counting it would hand reader credit to
 *     `hostedBy`, `sitsOn`, `partOf`, `unitOf`, `levelOf`, `connectedByStair` and
 *     `connectedByLift` on the strength of one generic call site — precisely the
 *     "a name found by grep is not a wired capability" error of C71 §0. It is
 *     reported as ALLOWLIST-ONLY in the matrix so the choice is visible, never
 *     silently dropped.
 *   • `getAll()` / one-arg `getRelationships()` sweeps (SemanticQueryEngine,
 *     WorldModelAdapter, DependencyResolver, RelationshipExplorerPanel) — C71
 *     §1.3 excludes them by name and §6.2(d) records the under-count as
 *     deliberate.
 *   • `DERIVATION_TYPES.includes(r.type)` — array membership over a computed set.
 *
 * REBUILD is satisfied by EITHER:
 *   (b1) the family appearing in a rebuild file (`REBUILD_FILES`), or
 *   (b2) the family being NAMED as non-reconstructed at a declaration site —
 *        `unreconstructable.push('X')` in the rebuild, or a `REGENERATED`
 *        disposition declared in the union's own docblock.
 *   ⚠ (b2) is the honest half and is the whole reason this arm is not a grep for
 *   presence. See the `joinedTo` note below.
 *
 * DELETE is satisfied by EITHER:
 *   (d1) a TYPE-AWARE mutation-update — a remove-then-re-emit keyed on the family
 *        (measured at HEAD: `replaceJoinedToForLevelWalls` for `joinedTo`,
 *        `AssignBeamSupportsCommand` for `supports`, `PhysicsEngine` for
 *        `measuredAt`); or
 *   (d2) the TYPE-AGNOSTIC cascade — `removeAllRelationshipsForElement`, which
 *        purges every edge for a deleted element regardless of family.
 *   (d2) is credited to every family, and that is a WEAK pass stated as such: it
 *   proves the edges are purged when an ENDPOINT dies, and proves nothing about
 *   move-time invalidation (C71 §1.4 — semantic 5 is UNPROVEN for every family,
 *   and C71 §6.2(c) says no arm here can see it). The matrix prints d1/d2 as
 *   DIFFERENT symbols so a weak pass never reads as a strong one.
 *
 * ─── `joinedTo`: regenerated, NOT rebuilt — and why that is not "absent" ─────
 * `joinedTo` is REQUIRED (C71 §2.1 #9). It has a writer (`WallRebuildCoordinator`
 * → `replaceJoinedToForLevelWalls`), a typed reader (`getJoinedWalls`, consumed by
 * `WallMoveConsequencePlanner`), and a type-aware delete/re-emit. It is
 * DELIBERATELY absent from `rebuildSemanticGraph.ts`: per C71 §3.6 its rebuild
 * disposition is **REGENERATED** from the retained junction index, so a
 * snapshot-side reconstruction would only be overwritten by the next wall flush.
 *
 * A rebuild arm implemented as "does this literal appear in the rebuild file"
 * would score it ABSENT and manufacture a finding against the one family the
 * contract holds up as correct. So the arm asks the real question — *is this
 * family's rebuild disposition DECLARED?* — and `REGENERATED` is a legitimate
 * answer, provided the declaration is in the source (it is:
 * `SemanticGraph.ts` union docblock; `rebuildSemanticGraph.ts` header lines
 * 22-26 state the same exclusion at the rebuild end). The matrix prints WHICH
 * disposition each family has, so "rebuilt", "regenerated" and "named
 * unreconstructable" are three distinguishable readings and never one green tick.
 *
 * By the same rule `connectedByLift` and `contains` are NAMED unreconstructable
 * by `rebuildSemanticGraph.ts` (`unreconstructable.push(...)`, C70 I-INV-3). That
 * naming IS the honest state and satisfies REBUILD. It does not launder their
 * OTHER gaps: `contains` still has no first-party writer, and that is a finding
 * on the WRITER arm where it belongs.
 *
 * ─── PARKED handling (C71 §2.3, §2.5; ADR-0320 ¶2/¶3) ───────────────────────
 * The twelve parked families are reported in their own table and are NOT
 * findings — "parked" and "gap" are different states, and conflating them is the
 * §7.b anti-pattern. They are ratcheted in ONE direction only: a PARKED family
 * that has acquired a WRITER is a finding (WRITER-FIRST), because ADR-0320 ¶3 and
 * C71 §2.5 forbid writer-first unparking outright — "shipping a writer against a
 * parked type is a defect, not progress". A parked family with a READER is
 * reported, not failed: a reader is the legitimate first step toward unparking.
 *
 * ─── Executed controls, BOTH DIRECTIONS, on every run (gates doc §2.2) ──────
 * `selfTest()` drives the same analyser over synthetic trees:
 *   • NEGATIVE — a planted REQUIRED family with a writer and NO reader MUST be
 *     flagged. If it is not, the gate is blind and exits 2.
 *   • POSITIVE — a planted family with all four obligations MUST read clean. If
 *     a fully-covered family still reports a finding, the gate is stuck red and
 *     is equally useless; exits 2.
 *   • PARKED — a planted PARKED family with a writer MUST be flagged
 *     WRITER-FIRST, and the same family with only a reader MUST NOT be.
 *   • COMMENT-BLINDNESS — a family whose ONLY mention is inside a `//` and a
 *     `/* *\/` block MUST read absent on every arm. This is the control that
 *     protects the whole gate from the union's own prose.
 * A control that fails to fire exits 2 as a BLIND COMPARATOR (C70 §5.6: a
 * comparator that has never failed has not been shown to be able to).
 *
 * ─── Honesty floors (exit 2, NEVER absorbable — C70 §5.2) ───────────────────
 *   • declared types parsed from source ≥ 20   ← C70 §7's own floor for this row
 *     is "declared types read from source > 0"; 20 is STRICTER, not laxer, and is
 *     chosen because the union has 26 members and a parse that recovered a
 *     handful has clearly failed on the union's multi-line docblock.
 *   • REQUIRED families located in the parsed union = 9  — every contract-named
 *     REQUIRED family must EXIST in the union, or the split is stale.
 *   • source files scanned ≥ 1500
 *   • rebuild files located ≥ 1  (C71 §6 `check-graph-persistence` floor shape)
 *   • executed controls passed = 5
 *
 * A run that parsed no union, or resolved no call sites, is MISCONFIGURED — not
 * "full coverage". C70 §7 names this exact trap for this exact gate.
 *
 * ─── What this gate CANNOT see (C71 §6.2, restated so nobody reads it as coverage)
 *   (a) RUNTIME REACHABILITY — discovery is static, so a writer that exists but is
 *       never reached counts as PRESENT.
 *   (b) CORRECTNESS — a writer emitting the WRONG edge passes every arm here.
 *   (c) MOVE-TIME INVALIDATION — C71 §1.2 semantic 5. No arm. UNPROVEN for every
 *       family, and C71 §1.4 says `boundedBy` after a room-boundary change is the
 *       row most likely to be wrong.
 *   (d) DYNAMIC DISPATCH — a reader reached only through `getAll()` or through
 *       `GraphQueryService`'s payload-driven call is invisible BY DESIGN (§1.3).
 *       A deliberate under-count, not an oversight.
 *   (e) COMPUTED-TYPE WRITES — `type: rel.type` (the undo restore in
 *       `DeleteElementCommand._restoreRelationships`, the IFC import writer in
 *       `initUI.ts`) writes whatever family it was handed. Invisible to literal
 *       scanning; printed as a named BLIND SPOT on every run rather than left for
 *       a reader to discover.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { walk, relPath } from './lib/sourceScan.js';
import { stripComments as stripCommentsRaw } from './lib/writeRouteScan.js';

/**
 * Comment-strip, LINE-PRESERVING.
 *
 * ⚠ The repo's `stripComments` does not guarantee line preservation, and a gate
 * that reports the WRONG file:line is worse than one that reports none — a
 * reviewer follows the citation, finds unrelated code, and learns to distrust
 * the gate. So the stripped text is re-aligned to the original line count: if
 * the strip changed the number of lines, fall back to a line-wise strip that
 * cannot. Every offset in this gate is converted to a line number against the
 * SAME buffer it was found in, and the human-readable text is then read from the
 * RAW source at that line.
 */
function stripComments(src: string): string {
  const out = stripCommentsRaw(src);
  const nl = (s: string): number => s.split('\n').length;
  if (nl(out) === nl(src)) return out;
  // Line-wise fallback: blank out `//` tails and whole lines inside `/* … */`.
  let inBlock = false;
  return src.split('\n').map((line) => {
    let res = '';
    for (let i = 0; i < line.length; i++) {
      if (inBlock) {
        if (line.startsWith('*/', i)) { inBlock = false; i++; }
        continue;
      }
      if (line.startsWith('/*', i)) { inBlock = true; i++; continue; }
      if (line.startsWith('//', i)) break;
      res += line[i];
    }
    return res;
  }).join('\n');
}
import {
  reportGate,
  type GateResult,
  type Floor,
} from '../rac-conformance/certification/contract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

// ── The contract's split. NOT the source's — see "SUBJECT" in the header. ────
// C71 §2.1 (the REQUIRED nine) and §2.2 (the PARKED twelve), which are the
// normative form of ADR-0320 ¶1/¶2. `hosts`/`hostedBy` are listed by C71 as one
// row ("the reference-shape pair") but are two union members with two distinct
// obligations, so the gate scores them SEPARATELY — an inverse edge that nobody
// reads is still an unread edge.
const REQUIRED: readonly string[] = [
  'hosts', 'hostedBy', 'boundedBy', 'adjacentTo', 'connectedTo',
  'sitsOn', 'supports', 'contains', 'partOf', 'joinedTo',
];
const PARKED: readonly string[] = [
  'unitOf', 'levelOf', 'servesZone', 'precededBy', 'supersedes', 'branchedFrom',
  'causedFailureOf', 'wasMitigatedBy', 'exceededBenchmark', 'replacedBy',
  'maintainedBy', 'decommissionedBefore',
];
// C71 §2.1 counts nine FAMILIES; this array has ten MEMBERS because the
// hosts/hostedBy pair is one family. The floor below checks the family count.
const REQUIRED_FAMILY_COUNT = 9;

// Union members that C71 classifies as NEITHER required nor parked. C71 §2.2's
// list is twelve; ADR-0320 ¶2 adds "+ circulation edges as-is". `measuredAt` and
// `decidedBy` are likewise outside both lists. They are reported in a third
// table — UNCLASSIFIED — and are NOT findings, because a gate inventing a
// classification the contract did not make is the same act as inventing the
// vocabulary. Their presence here is a documented gap in C71 §2, reported so it
// has a name.
const UNCLASSIFIED_EXPECTED: readonly string[] = [
  'connectedByStair', 'connectedByLift', 'measuredAt', 'decidedBy',
];

/** Named SemanticGraph methods that WRITE one specific family. CLOSED map. */
const HELPER_WRITERS: Readonly<Record<string, string>> = {
  replaceJoinedToForLevelWalls: 'joinedTo',
};
/**
 * Named SemanticGraph methods that TYPED-READ one specific family, credited at
 * their production CALL SITE outside SemanticGraph.ts. CLOSED map.
 *
 * ⚠ This is NOT an escape hatch, and the constraint that makes it safe is the
 * same one that makes HELPER_WRITERS safe: each entry names ONE family, the
 * method must itself perform a typed read of exactly that family inside
 * SemanticGraph.ts, and a method with no production caller earns no credit —
 * an entry here buys nothing on its own. Adding a name to this map does not
 * make a family covered; a production call site does.
 *
 * Every entry is a REFUSAL-BEARING reader (C71 §4.4) whose return type
 * distinguishes "no results" from "cannot answer" — which is precisely why the
 * method exists rather than the raw `getTargets(id, 'X')` the arms already see.
 * A bare `getTargets` at a call site returns `[]` for both, and C71 §7.h names
 * that as the anti-pattern.
 */
const DEDICATED_READERS: Readonly<Record<string, string>> = {
  getJoinedWalls: 'joinedTo',
  // §SITSON-REVERSE-READER (C71 §2.1 #5) — wraps `getSources(levelId,'sitsOn')`.
  // Consumer: DeleteLevelCommand.canExecute.
  getElementsSittingOn: 'sitsOn',
  // §HOSTEDBY-REVERSE-READER (C71 §2.1 #1) — wraps `getTargets(id,'hostedBy')`.
  // Consumer: SyncStateEngine._findHostWall.
  getHostWall: 'hostedBy',
};
/** The type-agnostic cascade purge (d2). */
const CASCADE_PURGE = 'removeAllRelationshipsForElement';

const UNION_FILE = 'packages/core-app-model/src/SemanticGraph.ts';
const REBUILD_GLOB_HINT = 'rebuildSemanticGraph.ts';

const SCAN_DIRS = ['packages', 'apps', 'plugins'] as const;

/** Different graphs with an overlapping vocabulary — C71 §4.3 / §7.g. */
const OTHER_GRAPH_PATHS: readonly string[] = [
  'packages/building-graph/',
  'apps/editor/src/engine/buildBuildingGraph.ts',
  'packages/room-topology/src/TopologyLayer.ts',
];

const FLOOR_MIN_DECLARED_TYPES = 20;
const FLOOR_MIN_FILES = 1500;
const FLOOR_MIN_REBUILD_FILES = 1;

// ─────────────────────────────────────────────────────────────────────────────
// §LEDGER — NAMED, SHRINK-ONLY, checked in BOTH directions (C70 §5.4/§5.5).
//
// Pinned at the FIRST HONEST READING, 2026-08-12. Every entry is
// `family/obligation`, never a bare count: a count would let one family gain a
// reader while another lost one and still read "no change" (C69 §7.c).
//
// An unledgered finding exits 3. A ledger entry no longer measured exits 3 as
// STALE — debt that has been paid leaves the ledger in the commit that pays it.
//
// EXIT CONDITION (C71 §6): when this array reaches 0 entries the gate becomes
// hard-0 and leaves gate-newly-measured.json.
// ─────────────────────────────────────────────────────────────────────────────
interface LedgerEntry { readonly key: string; readonly why: string }
const LEDGER: readonly LedgerEntry[] = [
  // ── PAID 2026-08-13 · `hostedBy/reader` ───────────────────────────────────
  // The inverse half of C71 §2.1's REFERENCE-SHAPE PAIR, and the half nobody
  // read. `hosts` has two typed readers (SemanticQueryEngine); `hostedBy` had
  // NONE — every consumer walked wall→opening and nothing walked opening→wall
  // typed — while it was written on every opening creation
  // (`CreateWallOpeningCommand`) and rebuilt on every load
  // (`rebuildSemanticGraph`). Write-only state, in the pair C71 holds up as the
  // reference shape.
  //
  // CLOSED BY A TYPED READER WHOSE CONSUMER WAS ALREADY DOING THE WORK BY HAND
  // (C71 §2.5): `SemanticGraphManager.getHostWall(openingId)` wraps
  // `getTargets(openingId,'hostedBy')`, and its consumer is
  // `SyncStateEngine._findHostWall` — the door/window branch of the
  // affected-node computation that drives every sync-state recompute.
  //
  // WHY THAT CONSUMER IS GENUINE: it asked this exact question and had two
  // answers, both worse. (1) the denormalized `door.wallId` / `window.wallId`
  // field, which has no invariant tying it to the host wall's own `openings[]`,
  // so the two can disagree with nothing to detect it; and failing that (2) a
  // LINEAR SCAN of every wall in the store, scanning each one's `openings[]`.
  // The graph answers in one indexed hop from the edge the opening-creation
  // command writes and the loader rebuilds. The graph is asked FIRST because it
  // is the only one of the three authoritative in both directions; the two older
  // paths are RETAINED as fallbacks, because a refusal is not a licence to
  // answer `null` and a project whose graph predates the edge still deserves the
  // scan.
  //
  // C71 §4.4 IS SHARPER HERE THAN FOR `sitsOn`: C15 §1 gives a hosted element
  // EXACTLY ONE host, so there is no legitimate empty success. Zero edges and
  // two edges are BOTH refusals and are named separately —
  // `opening-unknown-to-hostedBy-writer` falls through to the legacy paths,
  // while `multiple-hosts` does NOT: a corrupt edge set answered by "whichever
  // wall the scan reached first" would turn a detectable corruption into a
  // silent arbitrary choice, and an opening's offset is measured along a
  // specific host's baseLine.
  //
  // REACHABILITY PROVEN BY EXECUTED TEST THROUGH THE PUBLIC PATH, not by
  // calling the private method and not by registration
  // (`packages/core-app-model/src/sync/hostedByReverseReader.test.ts`): case (c)
  // starts the real engine, emits a real door event on the real StoreEventBus,
  // and installs NEITHER a door store NOR a wall store — so the room fan-out it
  // observes could only have come from the graph. Case (c2) then purges the edge
  // and watches the SAME event resolve nothing.
  //
  // ── PAID 2026-08-13 · `sitsOn/reader` ─────────────────────────────────────
  // THE `sitsOn` DEFECT ITSELF (C71 §0, EV-05 §1): EIGHTEEN writers across every
  // element kind at the last reading, ZERO typed readers — the widest write-only
  // family in the estate, and the row ADR-0320 was written about.
  // `initDependencyCascade.ts:59` filtered a DERIVED task on
  // `task.relationshipType !== 'sitsOn'`, which reads a scheduler task and not
  // the graph, so it never counted.
  //
  // CLOSED BY A TYPED REVERSE READER WITH A CONSUMER THAT WAS ALREADY WRONG
  // WITHOUT IT (C71 §2.5 — the reader exists because a CONSUMER needs it, never
  // to satisfy this gate): `SemanticGraphManager.getElementsSittingOn(levelId)`
  // wraps `getSources(levelId,'sitsOn')`, and its consumer is
  // `DeleteLevelCommand.canExecute`.
  //
  // WHY THAT CONSUMER IS GENUINE AND NOT A CALL SITE MINTED FOR THE RATCHET: the
  // guard already asks exactly this question — "does anything sit on this level?"
  // — and answered it from `level.childrenIds`, an index populated ONLY by
  // `bimManager.registerElement` at creation time. MEASURED: neither
  // `packages/persistence-client` nor `apps/editor/src/engine/persistence`
  // contains a single `registerElement` call, so NOTHING repopulates
  // `childrenIds` on load, while `rebuildSemanticGraphFromSnapshot` DOES
  // reconstruct `sitsOn` from each element's authoritative `levelId`. On every
  // reloaded project the guard was therefore blind and the graph was not.
  //
  // REACHABILITY PROVEN BY EXECUTED TEST, not by registration
  // (`packages/command-registry/__tests__/sitsOnReverseReader.test.ts`): case (c)
  // reproduces the reloaded state — edges present, `childrenIds` empty — and the
  // real `canExecute` now REFUSES where it previously returned `{ok:true}` and
  // stranded every element on the level; case (c2) removes the edges and watches
  // the SAME call pass, so the reader is load-bearing rather than decorative.
  // Case (f) proves the read is TYPED: `supports`, `connectedByStair` and
  // `partOf` edges pointing at the same level contribute nothing (C71 §1.3).
  //
  // C71 §4.4 IS HONOURED AT BOTH ENDS: the reader distinguishes "this level is
  // known and empty" (ok, `[]`) from "the sitsOn writers have never covered this
  // id" (refusal, named reason), and the guard does NOT convert a refusal into a
  // pass — it falls through to the `childrenIds` verdict, because an unanswerable
  // query must never be the reason a destructive command proceeds (case c3).
  //
  // ── PAID 2026-08-13 · `contains/writer` ───────────────────────────────────
  // C71 §2.1 #7 named this exactly: "needs its first-party writer, a named gap".
  // Two production readers (HierarchyTreePanel, WorldModelAdapter) asked and no
  // first-party writer answered; worse than the contract recorded, the IFC arm
  // was dead too (IfcImporter's `contains` push sits under an
  // `adjacentTo|boundedBy` ternary), so on ANY project — native or imported —
  // "this room contains nothing" and "nobody ever wrote this edge" were the
  // same value.
  //
  // CLOSED BY A WRITER WITH TWO NAMED, ALREADY-LIVE CONSUMERS (C71 §2.5 — the
  // consumers were waiting on DATA, not on wiring):
  // `CreateFurnitureCommand` now emits room → furniture from `hostedSpaceId`,
  // the room id the D-FLE furnish engine stamps on every placed item
  // (`buildFurnishCommands`) and BOTH ProjectSerializers persist. The edge
  // MIRRORS that authoritative field: an item with no `hostedSpaceId` writes no
  // edge, because inventing a containment the model does not assert is the
  // provenance-invented defect one layer over. The write is non-fatal — unlike
  // `sitsOn`, a missing containment edge degrades a tree group and an AI
  // summary rather than a delete guard.
  //
  // REBUILD DISPOSITION CHANGED WITH IT (C71 §1.2 semantic 4):
  // `rebuildSemanticGraphFromSnapshot` reconstructs `contains` from the
  // persisted `hostedSpaceId`, so the family LEAVES the `unreconstructable` loss
  // list — a name left there once it is reconstructable is the stale claim
  // C70 I-INV-3 forbids in the other direction.
  // ⚠ CORRECTED: that half landed in the ADJACENT commit `76a212aa` (the
  // concurrent persistence lane), not in the writer's own commit `e1e375d0`.
  // The writer's message originally claimed "in the same commit"; both halves
  // are on `main` and `76a212aa` is an ancestor, which is what §2.6 asks for,
  // but the provenance is recorded as it happened rather than as claimed.
  // Proven by executed tests: the writer and its non-invention case
  // (`packages/command-registry/__tests__/containsFirstPartyWriter.test.ts`) and
  // the rebuild (`packages/persistence-client/__tests__/rebuildSemanticGraph.test.ts`).
  //
  // ⚠ NOT closed by this row, and deliberately not laundered by it: the
  // furniture branch of `DeleteElementCommand` purges edges WITHOUT capturing
  // them first, so undo of a furniture delete does not restore this edge (or
  // its `sitsOn` sibling) verbatim. That is a `check-graph-delete-integrity`
  // finding on the delete path, not a write-coverage one, and it is left to
  // that gate's ledger rather than silently absorbed here.
  {
    key: 'partOf/reader',
    why: 'Room→unit containment. Written ONLY by the rebuild (rebuildSemanticGraph.ts) ' +
      'from `room.unitId` — so the edge exists only after a load, never after a live ' +
      'command — and no production path typed-reads it. Both halves are gaps; the writer ' +
      'half is ledgered separately below. ' +
      '⟨DECLINED 2026-08-13, deliberately, per C71 §2.5 — a reader must be added because a ' +
      'CONSUMER needs it, never to satisfy this gate.⟩ A census of `room.unitId` readers ' +
      '(36 property accesses, measured) finds NO currently-worse-off consumer. The forward ' +
      'readers (SyncStateEngine._findAffectedNodes, ScheduleExtractor, SpatialQueryPanel, ' +
      'RoomBoundaryBuilder, IfcSemanticWriter) already hold the room and take ONE property ' +
      'access; routing them through `getTargets(roomId,\'partOf\')` would be more ' +
      'indirection AND LESS CORRECT, since the edge is empty until a reload while the field ' +
      'is right immediately. The 8 reverse scans ' +
      '(`roomStore.getAll().filter(r => r.unitId === unitId)` in SyncStateEngine:408/503/525, ' +
      'ScheduleExtractor:540, DataSheetPanel:454/493/512/557, AnalyticsPanel:266/312, ' +
      'HierarchyTreeAddActions:275) are the strongest candidates and still fail the bar: ' +
      'they are always right today, they run inside passes that already scan the room store ' +
      'for area, and their sibling `getUnassignedRooms` ' +
      '(HierarchyTreeAddActions:279, `filter(r => ... && !r.unitId)`) needs the ABSENCE set ' +
      '— which an unwritten edge cannot answer. WorldModelAdapter, the component that would ' +
      'most naturally want "which rooms are in this unit", does not model units at all ' +
      '(zero occurrences of "unit" in the file). Converting a correct O(n) scan into a graph ' +
      'call that is empty until reload is a REGRESSION, and parking an uncalled reader is ' +
      'the authored-but-unwired hazard. Stays ledgered.',
  },
  {
    key: 'partOf/writer',
    why: 'No LIVE command writes `partOf`. The sole writer is the loader\'s reconstruction ' +
      'from the authoritative `room.unitId` field. A room assigned to a unit in-session ' +
      'carries no edge until the project is reloaded, which makes the graph and the ' +
      'authoritative field disagree for the whole session — and GraphQueryService lists ' +
      '`partOf` as supported, so `graph.query` answers that disagreement POSITIVELY with an ' +
      'empty set. Its `unknown-element` refusal does NOT cover this case: it fires only when ' +
      'the id is a node of NO edge at all, and a room carries `boundedBy`/`adjacentTo` edges, ' +
      'so the room IS a node and the `partOf` question gets a confident `[]` (C71 §4.4). ' +
      '⟨DECLINED 2026-08-13 — needs an ADR first, per C71 §2.5.⟩ The write site is obvious ' +
      '(AssignRoomToUnitCommand.execute/undo at ' +
      'packages/command-registry/src/hierarchy/, beside the `room.unitId` update), and adding ' +
      'it would end the mid-session disagreement. It is NOT written here because §2.5 ' +
      'requires the ADR to name the first CONSUMER, and the reader row above records that ' +
      'no consumer is currently worse off — a writer justified only by "the gate wants a ' +
      'pair" would manufacture the `sitsOn` defect on purpose (C71 §7.a). ' +
      'THE PRIOR QUESTION THE ADR MUST SETTLE: should hierarchy nodes ' +
      '(unit / level / building / site) be graph citizens AT ALL, or is ' +
      '`hierarchyStore` + `parentId` the sole hierarchy substrate? The repo answers both ' +
      'ways at once — `partOf`/`unitOf`/`levelOf` are in the vocabulary and advertised as ' +
      'supported by GraphQueryService, while every production hierarchy traversal goes ' +
      'through `hierarchyStore.getChildren`/`getUnits`/`parentId`. Answering that decides ' +
      'this row AND the two parked siblings; answering it by shipping a writer decides it ' +
      'by accident. Stays ledgered.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Analyser — pure over a file corpus, so selfTest() can drive it on synthetics.
// ─────────────────────────────────────────────────────────────────────────────

interface Site { readonly file: string; readonly line: number; readonly text: string }
type Obligation = 'writer' | 'reader' | 'rebuild' | 'delete';

interface TypeCoverage {
  readonly type: string;
  writer: Site[];
  reader: Site[];
  rebuild: Site[];
  /** How REBUILD is satisfied — printed so three readings stay distinguishable. */
  rebuildKind: 'rebuilt' | 'regenerated' | 'named-unreconstructable' | 'none';
  /** Type-AWARE delete / mutation-update (d1). */
  deleteTyped: Site[];
  /** Allowlist-only mentions — reported, never counted as readers (C71 §1.3). */
  allowlistOnly: Site[];
}

interface CorpusFile { readonly rel: string; readonly src: string }

interface Analysis {
  readonly declared: string[];
  readonly coverage: Map<string, TypeCoverage>;
  /** Type-agnostic cascade sites (d2) — credited to every family. */
  readonly cascadeSites: Site[];
  readonly rebuildFiles: string[];
  readonly filesScanned: number;
  readonly computedTypeWrites: Site[];
}

/** Parse the `RelationshipType` union from source. Comments stripped first. */
export function parseUnion(src: string): string[] {
  const clean = stripComments(src);
  const start = clean.indexOf('RelationshipType =');
  if (start < 0) return [];
  // The union runs to the first `;` after the declaration.
  const end = clean.indexOf(';', start);
  const body = end < 0 ? clean.slice(start) : clean.slice(start, end);
  const out: string[] = [];
  const re = /\|\s*'([A-Za-z][A-Za-z0-9_]*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) out.push(m[1]!);
  return [...new Set(out)];
}

const isTest = (rel: string): boolean =>
  rel.includes('/__tests__/') || /\.(test|spec)\.tsx?$/.test(rel);
const isOtherGraph = (rel: string): boolean =>
  OTHER_GRAPH_PATHS.some((p) => rel === p || rel.startsWith(p));
const isDist = (rel: string): boolean =>
  rel.includes('/dist/') || rel.includes('/dist-gate/') || rel.includes('/dist-apex/');

/**
 * Does a literal `'X'` appear inside the ARGUMENT LIST of `fn(` starting at
 * `idx`? Balanced-paren walk, capped, so `getRelationships(id)` (untyped) is
 * correctly refused while `getTargets(id, 'X')` is credited.
 */
function literalInArgs(clean: string, idx: number, type: string): boolean {
  const open = clean.indexOf('(', idx);
  if (open < 0) return false;
  let depth = 0;
  let i = open;
  const cap = Math.min(clean.length, open + 400);
  for (; i < cap; i++) {
    const c = clean[i]!;
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) break; }
  }
  const args = clean.slice(open, Math.min(i + 1, cap));
  return args.includes(`'${type}'`) || args.includes(`"${type}"`);
}

/** Line number of a character offset. */
function lineOf(clean: string, idx: number): number {
  let n = 1;
  for (let i = 0; i < idx && i < clean.length; i++) if (clean[i] === '\n') n++;
  return n;
}

const rawLine = (src: string, line: number): string =>
  (src.split('\n')[line - 1] ?? '').trim().slice(0, 160);

export function analyse(files: readonly CorpusFile[], declared: readonly string[]): Analysis {
  const coverage = new Map<string, TypeCoverage>();
  for (const t of declared) {
    coverage.set(t, {
      type: t, writer: [], reader: [], rebuild: [], rebuildKind: 'none',
      deleteTyped: [], allowlistOnly: [],
    });
  }
  const cascadeSites: Site[] = [];
  const rebuildFiles: string[] = [];
  const computedTypeWrites: Site[] = [];
  let filesScanned = 0;

  const READ_FNS = ['getTargets', 'getSources', 'getRelationships', 'hasRelationship', 'traverse'];

  for (const f of files) {
    if (isTest(f.rel) || isDist(f.rel)) continue;
    const isUnionFile = f.rel.endsWith(UNION_FILE) || f.rel === UNION_FILE;
    const isRebuild = f.rel.includes(REBUILD_GLOB_HINT);
    if (isRebuild && !rebuildFiles.includes(f.rel)) rebuildFiles.push(f.rel);

    filesScanned++;
    const clean = stripComments(f.src);
    const other = isOtherGraph(f.rel);

    const site = (idx: number): Site =>
      ({ file: f.rel, line: lineOf(clean, idx), text: rawLine(f.src, lineOf(clean, idx)) });

    // ── (e) BLIND SPOT: computed-type writes ────────────────────────────────
    if (!other) {
      // `type:` bound to a VARIABLE (or shorthand `{ type,`), never a literal.
      const cre = /addRelationship\s*\(\s*\{[^'"}]{0,200}?type\s*(?::\s*([A-Za-z_$][\w$.]*))?\s*[,}]/g;
      let cm: RegExpExecArray | null;
      while ((cm = cre.exec(clean)) !== null) computedTypeWrites.push(site(cm.index));
    }

    // ── (d2) type-agnostic cascade ──────────────────────────────────────────
    if (!isUnionFile && !other) {
      const pre = new RegExp(`\\.${CASCADE_PURGE}\\s*\\(`, 'g');
      let pm: RegExpExecArray | null;
      while ((pm = pre.exec(clean)) !== null) cascadeSites.push(site(pm.index));
    }

    // ── HELPER writers / DEDICATED readers, credited at PRODUCTION call sites
    if (!isUnionFile) {
      for (const [fn, fam] of Object.entries(HELPER_WRITERS)) {
        const cov = coverage.get(fam);
        if (!cov) continue;
        const hre = new RegExp(`\\.${fn}\\s*\\(`, 'g');
        let hm: RegExpExecArray | null;
        while ((hm = hre.exec(clean)) !== null) {
          cov.writer.push(site(hm.index));
          // A remove-then-re-emit helper IS the type-aware mutation-update (d1).
          cov.deleteTyped.push(site(hm.index));
        }
      }
      for (const [fn, fam] of Object.entries(DEDICATED_READERS)) {
        const cov = coverage.get(fam);
        if (!cov) continue;
        const dre = new RegExp(`\\.${fn}\\s*\\(`, 'g');
        let dm: RegExpExecArray | null;
        while ((dm = dre.exec(clean)) !== null) cov.reader.push(site(dm.index));
      }
    }

    if (isUnionFile || other) {
      // The union file still supplies its DECLARED rebuild disposition (b2),
      // handled by the caller from the RAW source. Nothing else is credited.
      continue;
    }

    for (const type of declared) {
      const cov = coverage.get(type)!;
      const lit = `'${type}'`;
      if (!clean.includes(lit) && !clean.includes(`"${type}"`)) continue;

      // (w1) addRelationship({ … type: 'X' … })
      const w1 = new RegExp(`addRelationship\\s*\\(`, 'g');
      let wm: RegExpExecArray | null;
      while ((wm = w1.exec(clean)) !== null) {
        const window = clean.slice(wm.index, wm.index + 400);
        if (new RegExp(`type\\s*:\\s*['"]${type}['"]`).test(window)) cov.writer.push(site(wm.index));
      }
      // (w2) addRel(a, b, 'X') — the rebuild helper's third positional argument
      // ⚠ A rebuild-file `addRel` is a REBUILD site and NOT a live writer. The
      // distinction is the whole point of scoring the two obligations
      // separately: `partOf` is emitted ONLY by the loader's reconstruction from
      // `room.unitId`, so the edge exists after a load and never after a live
      // command. Crediting the rebuild as a writer would score that family
      // fully-covered and hide the exact gap C-INV-1 asks about.
      const w2 = /\baddRel\s*\(/g;
      let w2m: RegExpExecArray | null;
      while ((w2m = w2.exec(clean)) !== null) {
        if (literalInArgs(clean, w2m.index, type)) {
          const s = site(w2m.index);
          if (isRebuild) cov.rebuild.push(s); else cov.writer.push(s);
        }
      }
      // (b2) named unreconstructable
      const ure = new RegExp(`unreconstructable\\s*\\.\\s*push\\s*\\(\\s*['"]${type}['"]`, 'g');
      let um: RegExpExecArray | null;
      while ((um = ure.exec(clean)) !== null) {
        const s = site(um.index);
        cov.rebuild.push(s);
        cov.rebuildKind = 'named-unreconstructable';
      }
      // (r1) typed reads
      for (const fn of READ_FNS) {
        const rre = new RegExp(`\\.${fn}\\s*\\(`, 'g');
        let rm: RegExpExecArray | null;
        while ((rm = rre.exec(clean)) !== null) {
          if (literalInArgs(clean, rm.index, type)) cov.reader.push(site(rm.index));
        }
      }
      // (r3) .type === 'X' discriminator
      const r3 = new RegExp(`\\.type\\s*[!=]==?\\s*['"]${type}['"]`, 'g');
      let r3m: RegExpExecArray | null;
      while ((r3m = r3.exec(clean)) !== null) cov.reader.push(site(r3m.index));

      // ALLOWLIST-ONLY — a bare literal inside a Set/array of supported types.
      // Reported, never counted (see header: GraphQueryService).
      if (/SUPPORTED_RELATIONSHIP_TYPES/.test(clean)) {
        const are = new RegExp(`^\\s*['"]${type}['"]\\s*,?\\s*$`, 'gm');
        let am: RegExpExecArray | null;
        while ((am = are.exec(clean)) !== null) cov.allowlistOnly.push(site(am.index));
      }
    }
  }

  return {
    declared: [...declared], coverage, cascadeSites, rebuildFiles,
    filesScanned, computedTypeWrites,
  };
}

/**
 * (b2) REGENERATED disposition, declared in the union's own docblock. Read from
 * the RAW union source on purpose — this is the one place a COMMENT is the
 * artefact under inspection (a declared disposition), and it is scoped to a
 * docblock that names both the family and the word REGENERATED, so no other
 * prose can grant it.
 */
export function declaredRegenerated(unionSrc: string, types: readonly string[]): string[] {
  // ⚠ Scoped to the docblock's SUBJECT LINE, and both narrowings were forced by
  // a measured false positive on this exact file:
  //
  //   1. A `[\s\S]{0,4000}` window between the family name and the word
  //      REGENERATED spans neighbouring union members.
  //   2. Scoping to the docblock is still NOT enough. `joinedTo`'s block opens
  //      "NOT `connectedTo`: that type is room ↔ room via door…" — it names a
  //      RIVAL family precisely to contrast with it (the ADR-0321 near-miss).
  //      A "block names the family AND declares a disposition" rule therefore
  //      handed `connectedTo` the REGENERATED disposition that belongs to
  //      `joinedTo`, which would have scored a family REBUILD-COVERED on the
  //      strength of a sentence saying it is a DIFFERENT relationship.
  //
  // So the block must be ABOUT the family: its SUBJECT LINE — the first
  // non-empty content line — must name it. A contrast mention deeper in the
  // prose grants nothing.
  const out: string[] = [];
  const blocks = unionSrc.match(/\/\*\*[\s\S]*?\*\//g) ?? [];
  const declares = /Rebuild disposition[^\n]*:\s*REGENERATED/;
  for (const t of types) {
    const subject = new RegExp(`^\\s*\\*?\\s*\`${t}\``);
    const isAbout = (b: string): boolean => {
      const first = b.split('\n').slice(1).find((l) => l.replace(/^\s*\*?\s*/, '').length > 0) ?? '';
      return subject.test(first);
    };
    if (blocks.some((b) => isAbout(b) && declares.test(b))) out.push(t);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Findings
// ─────────────────────────────────────────────────────────────────────────────

interface Finding { readonly key: string; readonly detail: string }

export function findingsOf(a: Analysis): Finding[] {
  const out: Finding[] = [];
  const hasCascade = a.cascadeSites.length > 0;

  for (const t of REQUIRED) {
    const cov = a.coverage.get(t);
    if (!cov) continue; // absence from the union is a FLOOR failure, not a finding
    if (cov.writer.length === 0) {
      out.push({ key: `${t}/writer`, detail: `REQUIRED family '${t}' has NO production writer.` });
    }
    if (cov.reader.length === 0) {
      const extra = cov.allowlistOnly.length > 0
        ? ` (${cov.allowlistOnly.length} allowlist-only mention(s) at ${cov.allowlistOnly[0]!.file}:${cov.allowlistOnly[0]!.line} — an allowlist for a dynamic reader is not a typed reader, C71 §1.3)`
        : '';
      out.push({
        key: `${t}/reader`,
        detail: `REQUIRED family '${t}' has NO typed production reader — write-only state nobody can query.${extra}`,
      });
    }
    if (cov.rebuildKind === 'none' && cov.rebuild.length === 0) {
      out.push({
        key: `${t}/rebuild`,
        detail: `REQUIRED family '${t}' has NO rebuild coverage and NO declared disposition — lost on reload, silently.`,
      });
    }
    if (cov.deleteTyped.length === 0 && !hasCascade) {
      out.push({
        key: `${t}/delete`,
        detail: `REQUIRED family '${t}' has neither a type-aware mutation-update nor the type-agnostic cascade — deletion strands its edges.`,
      });
    }
  }

  // PARKED: writer-first is a defect (C71 §2.5, ADR-0320 ¶3). One direction only.
  for (const t of PARKED) {
    const cov = a.coverage.get(t);
    if (!cov || cov.writer.length === 0) continue;
    const s = cov.writer[0]!;
    out.push({
      key: `${t}/writer-first`,
      detail: `PARKED family '${t}' has acquired a WRITER at ${s.file}:${s.line} — ADR-0320 ¶3 / C71 §2.5 forbid writer-first unparking. Unparking needs an ADR naming the first CONSUMER.`,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Executed controls — BOTH DIRECTIONS, every run (gates doc §2.2, C70 §5.6)
// ─────────────────────────────────────────────────────────────────────────────

function selfTest(): { ok: boolean; lines: string[] } {
  const lines: string[] = [];
  let ok = true;
  const fail = (m: string): void => { ok = false; lines.push(`    ✗ BLIND COMPARATOR — ${m}`); };
  const pass = (m: string): void => { lines.push(`    ✓ ${m}`); };

  // Synthetic corpus. `boundedBy` = FULLY COVERED (positive control).
  // `sitsOn` = writer, no reader (negative control). `servesZone` (PARKED) =
  // writer-first. `supersedes` (PARKED) = reader only, must NOT fire.
  // `adjacentTo` = mentioned ONLY in comments (comment-blindness control).
  const corpus: CorpusFile[] = [
    {
      rel: 'packages/synthetic/src/writers.ts',
      src: [
        `sgm.addRelationship({ type: 'boundedBy', sourceId: a, targetId: b });`,
        `sgm.addRelationship({ type: 'sitsOn', sourceId: a, targetId: b });`,
        `sgm.addRelationship({ type: 'servesZone', sourceId: a, targetId: b });`,
        `// sgm.addRelationship({ type: 'adjacentTo', sourceId: a, targetId: b });`,
        `/* const x = sgm.getTargets(id, 'adjacentTo'); */`,
      ].join('\n'),
    },
    {
      rel: 'packages/synthetic/src/readers.ts',
      src: [
        `const w = sgm.getTargets(roomId, 'boundedBy');`,
        `const s = sgm.getRelationships(beamId, 'supersedes');`,
        `const untyped = sgm.getRelationships(elementId);`,
      ].join('\n'),
    },
    {
      rel: 'packages/synthetic/src/loader/rebuildSemanticGraph.ts',
      src: `addRel(room.id, wallId, 'boundedBy');\naddRel(el.id, el.levelId, 'sitsOn');`,
    },
    {
      rel: 'packages/synthetic/src/delete.ts',
      src: `sgm.removeAllRelationshipsForElement(id);`,
    },
  ];
  const types = [...REQUIRED, ...PARKED];
  const a = analyse(corpus, types);
  const f = findingsOf(a);
  const keys = new Set(f.map((x) => x.key));

  // 1. NEGATIVE — writer, no reader, MUST be flagged.
  if (keys.has('sitsOn/reader')) pass("NEGATIVE: planted REQUIRED 'sitsOn' with a writer and NO reader was FLAGGED");
  else fail("planted REQUIRED 'sitsOn' has a writer and no reader and was NOT flagged — the reader arm is blind");

  // 2. POSITIVE — fully covered, MUST read clean on all four.
  const bb = [...keys].filter((k) => k.startsWith('boundedBy/'));
  if (bb.length === 0) pass("POSITIVE: planted fully-covered 'boundedBy' (writer+reader+rebuild+cascade) read CLEAN on all four arms");
  else fail(`fully-covered 'boundedBy' still reported ${bb.join(', ')} — the gate is stuck red and would fail a correct tree`);

  // 3. PARKED — writer-first flagged; reader-only NOT flagged.
  if (keys.has('servesZone/writer-first')) pass("PARKED: planted writer against parked 'servesZone' was FLAGGED writer-first");
  else fail("a writer against PARKED 'servesZone' was NOT flagged — ADR-0320 ¶3 is unenforced");
  if (![...keys].some((k) => k.startsWith('supersedes/'))) pass("PARKED: parked 'supersedes' with a READER only produced NO finding (a reader is the legitimate first unparking step)");
  else fail("parked 'supersedes' with only a reader produced a finding — parked is being counted as a gap (C71 §7.b)");

  // 4. COMMENT-BLINDNESS — comment-only mentions credit nothing.
  const adj = a.coverage.get('adjacentTo')!;
  if (adj.writer.length === 0 && adj.reader.length === 0) {
    pass("COMMENT-BLINDNESS: 'adjacentTo' mentioned ONLY in a // and a /* */ comment scored NO writer and NO reader");
  } else {
    fail(`'adjacentTo' was credited from comments alone (writer ${adj.writer.length}, reader ${adj.reader.length}) — the union's own docblock would prove its own coverage`);
  }

  // 5. DISPOSITION SCOPING — a docblock ABOUT one family that mentions a RIVAL
  //    family in contrast must grant the disposition to the SUBJECT ONLY. This
  //    is a real false positive caught during authoring, not a hypothetical:
  //    `joinedTo`'s union docblock opens "NOT `connectedTo`: …", and a
  //    block-scoped rule handed `connectedTo` a REGENERATED disposition it does
  //    not have.
  const synthUnion = [
    '/**',
    ' * `joinedTo` — wall ↔ wall via a RETAINED junction.',
    ' *',
    ' * NOT `connectedTo`: that type is room ↔ room via door.',
    ' *',
    ' * Rebuild disposition (C71 §1.2 semantic 4, §3.6): REGENERATED. Deliberately',
    ' * NOT rebuilt from the snapshot.',
    ' */',
  ].join('\n');
  const regen = declaredRegenerated(synthUnion, ['joinedTo', 'connectedTo']);
  if (regen.includes('joinedTo') && !regen.includes('connectedTo')) {
    pass("DISPOSITION SCOPING: a docblock ABOUT 'joinedTo' that names 'connectedTo' in CONTRAST granted REGENERATED to 'joinedTo' only");
  } else {
    fail(
      `disposition scoping is wrong (granted: ${regen.join(', ') || 'nothing'}) — ` +
      'a contrast mention must not confer a rebuild disposition, or a family reads ' +
      'REBUILD-COVERED on the strength of a sentence saying it is a DIFFERENT relationship',
    );
  }

  // 6. Untyped read must NOT count (C71 §1.3), proven via the negative control's
  //    sibling: `getRelationships(elementId)` one-arg appears in readers.ts and
  //    must not have granted `sitsOn` a reader. Folded into control 1's verdict.
  return { ok, lines };
}

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────

function readCorpus(): CorpusFile[] {
  const out: CorpusFile[] = [];
  for (const d of SCAN_DIRS) {
    for (const abs of walk(join(ROOT, d))) {
      const rel = relPath(ROOT, abs);
      let src: string;
      try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      out.push({ rel, src });
    }
  }
  return out;
}

function cell(sites: Site[], symbol = '●'): string {
  return sites.length > 0 ? `${symbol}${String(sites.length).padStart(2)}` : ' ✗ ';
}

function main(): number {
  const lines: string[] = [];

  // ── Controls FIRST: a blind comparator must never publish a matrix. ────────
  const control = selfTest();
  lines.push('EXECUTED CONTROLS (both directions, every run):');
  lines.push(...control.lines);
  lines.push('');

  // ── Subject: the union, parsed from source ────────────────────────────────
  let unionSrc = '';
  try { unionSrc = readFileSync(join(ROOT, UNION_FILE), 'utf8'); } catch { /* floor catches it */ }
  const declared = parseUnion(unionSrc);

  const corpus = readCorpus();
  const a = analyse(corpus, declared);

  // (b2) REGENERATED dispositions declared in the union docblock.
  const regenerated = declaredRegenerated(unionSrc, declared);
  for (const t of regenerated) {
    const cov = a.coverage.get(t);
    if (cov && cov.rebuildKind === 'none') cov.rebuildKind = 'regenerated';
  }
  for (const t of declared) {
    const cov = a.coverage.get(t)!;
    if (cov.rebuildKind === 'none' && cov.rebuild.length > 0) cov.rebuildKind = 'rebuilt';
  }

  const requiredFound = REQUIRED.filter((t) => declared.includes(t));
  // hosts/hostedBy count as ONE family (C71 §2.1 row 1).
  const requiredFamiliesFound =
    requiredFound.filter((t) => t !== 'hostedBy').length;

  const floors: Floor[] = [
    { what: 'declared RelationshipType members parsed from source', measured: declared.length, min: FLOOR_MIN_DECLARED_TYPES },
    { what: 'REQUIRED families (C71 §2.1) located in the parsed union', measured: requiredFamiliesFound, min: REQUIRED_FAMILY_COUNT },
    { what: 'production source files scanned', measured: a.filesScanned, min: FLOOR_MIN_FILES },
    { what: 'rebuild implementations located', measured: a.rebuildFiles.length, min: FLOOR_MIN_REBUILD_FILES },
    { what: 'executed controls passed', measured: control.ok ? 5 : 0, min: 5 },
  ];

  // ── Classification cross-check (SUBJECT, header) ──────────────────────────
  const classified = new Set([...REQUIRED, ...PARKED, ...UNCLASSIFIED_EXPECTED]);
  const unexpected = declared.filter((t) => !classified.has(t));
  if (unexpected.length > 0) {
    lines.push(
      `⚠ ${unexpected.length} union member(s) carry NO C71 §2 classification and were not ` +
      `expected: ${unexpected.join(', ')}. A member that is neither REQUIRED nor PARKED nor a ` +
      `known-unclassified circulation/temporal edge is a C71 §2.6 addition that skipped its ` +
      `classification. Reported, not silently absorbed.`,
    );
    lines.push('');
  }

  // ── THE MATRIX ────────────────────────────────────────────────────────────
  const hasCascade = a.cascadeSites.length > 0;
  const dispo = (c: TypeCoverage): string =>
    c.rebuildKind === 'rebuilt' ? 'rebuilt'
      : c.rebuildKind === 'regenerated' ? 'REGENERATED'
        : c.rebuildKind === 'named-unreconstructable' ? 'named-unrecon'
          : '—';

  lines.push('C-INV-1 — PER-TYPE × PER-OBLIGATION MATRIX (REQUIRED nine, C71 §2.1)');
  lines.push('  ● = present (count of sites) · ✗ = ABSENT · delete: ●=type-aware (d1), ○=cascade only (d2, weak)');
  lines.push(`  ${'family'.padEnd(16)} ${'writer'.padEnd(7)}${'reader'.padEnd(7)}${'rebuild'.padEnd(8)}${'delete'.padEnd(7)} disposition`);
  for (const t of REQUIRED) {
    const c = a.coverage.get(t);
    if (!c) { lines.push(`  ${t.padEnd(16)} — NOT IN THE PARSED UNION (floor failure)`); continue; }
    const del = c.deleteTyped.length > 0 ? cell(c.deleteTyped) : (hasCascade ? ` ○${String(a.cascadeSites.length).padStart(2)}` : ' ✗ ');
    const reb = c.rebuildKind !== 'none' ? (c.rebuild.length > 0 ? cell(c.rebuild) : ' ● ') : ' ✗ ';
    lines.push(
      `  ${t.padEnd(16)} ${cell(c.writer).padEnd(7)}${cell(c.reader).padEnd(7)}${reb.padEnd(8)}${del.padEnd(7)} ${dispo(c)}`,
    );
  }
  lines.push('');
  lines.push('  EVIDENCE (first site per filled cell; run with the file open for the rest):');
  for (const t of REQUIRED) {
    const c = a.coverage.get(t);
    if (!c) continue;
    const ev = (o: Obligation, s: Site[]): string =>
      s.length > 0 ? `${o}=${s[0]!.file}:${s[0]!.line}` : `${o}=—`;
    lines.push(
      `    ${t.padEnd(16)} ${ev('writer', c.writer)} · ${ev('reader', c.reader)} · ` +
      `${ev('rebuild', c.rebuild)} · ${ev('delete', c.deleteTyped)}`,
    );
    if (c.allowlistOnly.length > 0) {
      lines.push(`    ${''.padEnd(16)} ALLOWLIST-ONLY (NOT a reader, C71 §1.3): ${c.allowlistOnly[0]!.file}:${c.allowlistOnly[0]!.line} ×${c.allowlistOnly.length}`);
    }
  }
  lines.push('');

  // ── PARKED, reported separately and NOT a finding (C71 §2.3) ──────────────
  lines.push('PARKED twelve (C71 §2.2) — REPORTED, NOT FINDINGS. Parked ≠ gap (C71 §2.3/§7.b).');
  lines.push('  Ratcheted in ONE direction only: a writer against a parked family is WRITER-FIRST and IS a finding.');
  const parkedWriters: string[] = [];
  for (const t of PARKED) {
    const c = a.coverage.get(t);
    if (!c) { lines.push(`  ${t.padEnd(22)} not in the parsed union`); continue; }
    const flag = c.writer.length > 0 ? '  ⛔ WRITER-FIRST' : '';
    if (c.writer.length > 0) parkedWriters.push(t);
    lines.push(`  ${t.padEnd(22)} writer ${String(c.writer.length).padStart(2)} · reader ${String(c.reader.length).padStart(2)}${flag}`);
  }
  lines.push(`  → ${parkedWriters.length} parked famil(ies) have acquired a writer.`);
  lines.push('');

  // ── UNCLASSIFIED — neither list. Reported, not invented into one. ─────────
  const unclassified = declared.filter((t) => !REQUIRED.includes(t) && !PARKED.includes(t));
  lines.push(`UNCLASSIFIED (${unclassified.length}) — in the union, in NEITHER C71 §2.1 nor §2.2.`);
  lines.push('  Not findings: a gate that invents a classification the contract did not make is');
  lines.push('  inventing vocabulary. Named here so the C71 §2 gap has a home.');
  for (const t of unclassified) {
    const c = a.coverage.get(t)!;
    lines.push(`  ${t.padEnd(22)} writer ${String(c.writer.length).padStart(2)} · reader ${String(c.reader.length).padStart(2)} · rebuild ${dispo(c)}`);
  }
  lines.push('');

  // ── Named blind spots (C71 §6.2) ─────────────────────────────────────────
  lines.push('WHAT THIS RUN CANNOT SEE (C71 §6.2 — printed so silence is never read as coverage):');
  lines.push(`  • computed-type writes: ${a.computedTypeWrites.length} site(s) write \`type: <variable>\` and are INVISIBLE to literal scanning.`);
  for (const s of a.computedTypeWrites.slice(0, 6)) lines.push(`      ${s.file}:${s.line}  ${s.text}`);
  lines.push('  • runtime reachability — a writer that exists but is never reached counts as PRESENT.');
  lines.push('  • correctness — a writer emitting the WRONG edge passes every arm.');
  // §GR-12 — this line used to read "NO ARM. UNPROVEN for every family." That
  // was true when written and is now FALSE in the healthy direction, which is
  // the same class of defect the register keeps catching in its own rows. An arm
  // exists; it is EXECUTED and it is not in this file, because the question is a
  // runtime one and no static scan can answer it (C79 §8.3(b)). What this GATE
  // cannot see is unchanged — hence the line stays, restated to say which half
  // is now measured and by what, so nobody re-derives "unproven" from silence.
  lines.push('  • move-time invalidation (C71 §1.2 semantic 5) — NO ARM **HERE**, and no static arm is possible.');
  lines.push('      MEASURED ELSEWHERE, executed: tools/rac-conformance/certification/__tests__/graphmove.cert.ts');
  lines.push('      (H6). Its first reading: `boundedBy` is STALE after a real wall move — the move command');
  lines.push('      performs no invalidation and the edge still names a wall that no longer bounds the room;');
  lines.push('      `sitsOn` and `hosts` correctly SURVIVE (id-keyed edges are move-INVARIANT by construction).');
  lines.push('      STILL UNPROVEN: every family H6 does not drive, and SUBSCRIBER REACHABILITY — whether any');
  lines.push('      production path drives a re-detect on a move (GR-18/CE-05 territory).');
  lines.push('  • dynamic dispatch — GraphQueryService reads a payload string; deliberate under-count (§1.3).');
  lines.push('');
  lines.push(`  cascade purge (d2) sites: ${a.cascadeSites.length} · rebuild implementations: ${a.rebuildFiles.join(', ') || '(none)'}`);
  lines.push('');

  // ── Findings vs the NAMED ledger, both directions ────────────────────────
  const findings = findingsOf(a);
  const measuredKeys = new Set(findings.map((f) => f.key));
  const ledgerKeys = new Set(LEDGER.map((e) => e.key));
  const stale = [...ledgerKeys].filter((k) => !measuredKeys.has(k));
  const unledgered = findings.filter((f) => !ledgerKeys.has(f.key));

  lines.push(`C-INV-4 — RATCHET: ${findings.length} finding(s) against a NAMED ledger of ${LEDGER.length}.`);
  for (const f of findings) {
    const led = LEDGER.find((e) => e.key === f.key);
    lines.push(`  ${led ? '·' : '⛔ UNLEDGERED'} ${f.key} — ${f.detail}`);
    if (led) lines.push(`      ledgered: ${led.why}`);
  }
  if (unledgered.length > 0) {
    lines.push(`  ⛔ ${unledgered.length} finding(s) are NOT on the ledger. The ledger is SHRINK-ONLY: fix them, or prove they predate this gate and add them with a reason — never raise a bare count.`);
  }

  const result: GateResult = {
    gate: 'check-graph-write-coverage (C71 §6 · C70 C-INV-1/C-INV-4)',
    floors,
    lines,
    findings: findings.length,
    declared: LEDGER.length,
    findingNames: findings.map((f) => f.key),
    stale,
  };
  return reportGate(result);
}

process.exit(main());
