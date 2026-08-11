#!/usr/bin/env tsx
/**
 * GA Gate: check-collab-graph-integrity — the gate that SCORES CRITERION C8.
 *
 * Contract: C08 (collaboration) · C66 §1 (a CLAIMED tier and a HELD tier must
 * not be written the same way) · P8 (explicit sync conflicts) ·
 * docs/03-execution/plans/BIM20-ACCEPTANCE-10-OF-10.md §1 C8 ·
 * docs/04-reference/BIM30-CONTINUITY-DELIVERABLE.md §A A-3.
 *
 * ─── WHAT C8 ASKS ───────────────────────────────────────────────────────────
 *
 *   "Collaboration preserves relationships — two clients edit a wall and its
 *    hosted door; both converge with the hosting edge intact."
 *
 * Note what it does NOT ask.  It does not ask whether the two documents
 * converge; Yjs converges, and a gate asserting that is asserting a library's
 * own test suite.  It asks whether the MODEL survives — whether, after the
 * merge, the door is still hosted by a wall that exists.  Two peers can
 * converge byte-for-byte onto a self-consistent, confidently WRONG building.
 *
 * ─── THE THREE RESULTS THIS GATE REFUSES TO CONFLATE ────────────────────────
 *
 *   • NO TRANSPORT      → exit 2 MISCONFIGURED, reason `transport-absent`.
 *     This is the whole reason the gate exists in this shape.  Before it, "the
 *     sync server is not deployed" and "collaboration works fine" produced the
 *     same observation — nothing went wrong — and C8 could have been scored
 *     green by a harness that never opened a socket.
 *   • BLIND COMPARATOR  → exit 2 MISCONFIGURED, reason `blind-comparator`.
 *     The harness re-runs its own checker over a deliberately broken pair.  A
 *     checker that calls a dangling host "clean" invalidates every verdict it
 *     produced, so the run is misconfigured rather than green.
 *   • BROKEN RELATIONSHIP → exit 3 RATCHET EXCEEDED.  The tolerated count is
 *     ZERO and this gate is NOT on `gate-debt.json`: a lost hosting edge has
 *     never been tolerated here, so there is no baseline to ratchet down from.
 *     Exit 3 is never absorbable by the ledger.
 *
 * ─── EXIT CODES (the four-code contract) ────────────────────────────────────
 *
 *   0  clean            — transport live, both concurrent edits survived, the
 *                         hosting edge intact and RESOLVING on both documents,
 *                         and the checker demonstrated it can fail.
 *   1  declared-level   — the run was clean, but it was asked to score C8 FOR
 *                         PRODUCTION (`PRYZM_COLLAB_GATE_SCOPE=production`)
 *                         and no deployed target was configured.  The local
 *                         harness proves the CODE; it does not prove a
 *                         deployed transport.  This is C8's standing state in
 *                         the acceptance plan — "FAIL — BLOCKED, founder
 *                         decision, not engineering" — and it is reported as a
 *                         declared level rather than dressed up as green.
 *   2  MISCONFIGURED    — never absorbable.  See above.
 *   3  RATCHET EXCEEDED — never absorbable.  Relationship or edit lost.
 *
 * ─── TARGETS ────────────────────────────────────────────────────────────────
 *
 *   default                        two real y-websocket clients against a
 *                                  LOCAL in-process sync server.
 *   PRYZM_COLLAB_GATE_URL=wss://…  a DEPLOYED sync server.  Requires
 *   PRYZM_COLLAB_GATE_TOKEN=…      a session token, because upgrades are
 *                                  authenticated (L-391 R-B); a remote target
 *                                  without one would be refused
 *                                  `missing-token` and the run would
 *                                  misreport that as an absent transport.
 *
 * The harness lives at `apps/sync-server/src/collab-gate/collabGraphIntegrity.ts`
 * — it needs `ws` / `y-websocket` / `@pryzm/sync-client`, which are that
 * workspace's dependencies and are not linked into the repo root.  Node
 * resolves from the importing file, so the relative import below works while
 * an `@pryzm/sync-server` specifier would not.
 *
 * Every number this gate prints is MEASURED on the run that prints it.  There
 * are no frozen counts in this header.
 */

import {
  runCollabGraphIntegrity,
  MIN_COMPARED_ELEMENTS,
  MIN_COMPARED_RELATIONSHIPS,
  type CollabGateReport,
} from '../../apps/sync-server/src/collab-gate/collabGraphIntegrity.js';

/** Tolerated relationship/edit violations.  Zero, and not on gate-debt.json. */
const RATCHET = 0;

function line(s = ''): void { console.log(s); }

function printReport(report: CollabGateReport): void {
  line('─'.repeat(78));
  line('check-collab-graph-integrity — C8: collaboration preserves relationships');
  line('─'.repeat(78));
  line(`target                 ${report.target}  (${report.url})`);
  line(
    `transport              probed=${report.transport.probed} converged=${report.transport.converged} probe=${report.transport.probeMs} ms`,
  );
  line(
    `compared               ${report.comparedElements} element records · ${report.comparedRelationships} hosting edges` +
      `   (floors ${MIN_COMPARED_ELEMENTS} / ${MIN_COMPARED_RELATIONSHIPS})`,
  );
  line(
    `negative control       ran=${report.negativeControl.ran} detected=${report.negativeControl.detected}` +
      `   ← the checker proving it can fail`,
  );
  for (const note of report.notes) line(`note                   ${note}`);
  line();

  for (const s of report.scenarios) {
    line(`SCENARIO  ${s.name}`);
    for (const o of s.observations) {
      const verdict = o.hostResolves && typeof o.observedHost === 'string'
        && o.expectedHostIn.includes(o.observedHost) ? 'INTACT' : 'BROKEN';
      line(
        `   doc ${o.doc}  door ${o.doorId}  host=${JSON.stringify(o.observedHost)}  ` +
          `resolves=${o.hostResolves}  → ${verdict}`,
      );
    }
    if (s.violations.length === 0) line('   no violations');
    for (const v of s.violations) line(`   ✗ [${v.kind}] ${v.detail}`);
    line();
  }
}

async function main(): Promise<number> {
  const url = process.env['PRYZM_COLLAB_GATE_URL'];
  const token = process.env['PRYZM_COLLAB_GATE_TOKEN'];
  const scope = process.env['PRYZM_COLLAB_GATE_SCOPE'] ?? 'code';

  const report = await runCollabGraphIntegrity({
    ...(url ? { url } : {}),
    ...(token ? { token } : {}),
    log: (l) => console.log(l),
  });
  printReport(report);

  if (report.status === 'misconfigured') {
    line(`✗ MISCONFIGURED [${report.misconfiguredReason}] — ${report.misconfiguredDetail}`);
    if (report.misconfiguredReason === 'transport-absent') {
      line();
      line('  "no transport" is NOT "converged fine". C8 cannot be scored from this run.');
      line('  C66 tiers remain CLAIMED. The remaining step is a founder decision:');
      line('  see docs/03-execution/plans/L-391-COLLAB-DEPLOY-DECISION.md.');
    }
    return 2;
  }

  if (report.violations.length > RATCHET) {
    line(
      `✗ RATCHET EXCEEDED — ${report.violations.length} relationship/edit violation(s), tolerated ${RATCHET}.`,
    );
    line('  Collaboration converged the BYTES and lost the MODEL. C8 = FAIL.');
    return 3;
  }

  line(
    `✓ ${report.comparedRelationships} hosting edges survived concurrent editing on both documents; ` +
      `${report.comparedElements} element records compared; 0 violations.`,
  );

  if (report.target === 'local-harness') {
    line();
    line('  SCOPE — this run used a LOCAL in-process sync server. It proves the CODE');
    line('  preserves the hosting relationship under concurrent editing. It does NOT');
    line('  prove a deployed transport exists: production still runs socket.io');
    line('  last-writer-wins, and C66 tiers remain CLAIMED, not HELD.');
    if (scope === 'production') {
      line();
      line('  ✗ DECLARED LEVEL — PRYZM_COLLAB_GATE_SCOPE=production was requested and no');
      line('    PRYZM_COLLAB_GATE_URL was configured. C8 stays FAIL — BLOCKED.');
      return 1;
    }
  }

  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error('check-collab-graph-integrity: unexpected failure —', err);
    // An unexpected throw is a gate that could not establish its subject.
    process.exit(2);
  },
);
