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
 *   0  clean            — reachable ONLY against a REAL DEPLOYED TRANSPORT
 *                         (`PRYZM_COLLAB_GATE_URL`).  Transport live, both
 *                         concurrent edits survived, the hosting edge intact
 *                         and RESOLVING on both documents, and the checker
 *                         demonstrated it can fail.
 *   1  UNPROVEN         — every arm the run COULD reach was clean, but the run
 *                         did not reach the arms C8 is actually about.  See
 *                         §UNPROVEN-IS-NOT-GREEN below.
 *   2  MISCONFIGURED    — never absorbable.  See above.
 *   3  RATCHET EXCEEDED — never absorbable.  Relationship or edit lost.
 *
 * ─── §UNPROVEN-IS-NOT-GREEN (2026-08-13, A.13) ──────────────────────────────
 *
 * THE DEFECT THIS SECTION RECORDS.  Until today this gate returned **exit 0**
 * on a local-harness run and printed `✓ … 0 violations` as its headline, with
 * the narrowness of the claim carried only in prose beneath it.  Everything the
 * harness MEASURED was honest — it compares 10 element records and 4 hosting
 * edges over two real `y-websocket` peers with a partition and a built-in
 * negative control, and it prints all of those counts (C70 §5.2 satisfied).
 * This was never the empty-seed shape C70 §0 forbids.  What was wrong was the
 * LABEL: an exit 0 whose headline reads `✓` is the channel every consumer
 * actually reads, and C70 §7's exit-condition row for this gate is explicit —
 * *"green **against a real transport**; until then it reports UNPROVEN, never
 * green (§3.4)"*.  C70 §3.4: an unexecuted link is UNPROVEN and a chain holding
 * one is INCOMPLETE — *"this is the rule that stops 'we have no transport' from
 * silently reading as 'collaboration is fine'"*.
 *
 * The exit 0 had already been consumed as exactly that claim.  MEASURED
 * 2026-08-13: `tools/ga-gate/gate-newly-measured.json` (the
 * `check-two-client-convergence` entry) cites this gate by path and asserts it
 * *"owns the transport question and **is GREEN**"* — one gate's caveat resting
 * on another gate's mislabelled zero.  That is C70 §8.k (reporting UNPROVEN as
 * a pass) reached through a citation rather than through a blank cell.
 *
 * THE FIX IS NOT TO MAKE IT RED.  The local run proves something real and worth
 * keeping — it is the only executed evidence in the repo that the hosting edge
 * survives a genuine partition-and-merge over real sockets.  So exit 0 is
 * reserved for the deployed target, the local run lands at **exit 1 UNPROVEN**,
 * and the headline names the narrower claim it actually earned.  Exit 1 with a
 * `gate-newly-measured.json` entry prints as `🔵 NEWLY-MEASURED` in `run-all`
 * with its exit condition on screen — UNPROVEN is neither a pass nor a fail
 * (C70 §2.2), and that is the only run-all state that says so.
 *
 * ─── THE THREE UNREACHABLE AXES (C70 §7.1, C78 §15.4) ───────────────────────
 *
 * Named on every run rather than left to inference.  A gate that cannot reach
 * an axis must say the axis's name, or its silence reads as coverage.
 *
 *   • REAL TRANSPORT     — the local harness is an in-process sync server in
 *                          THIS Node realm.  Production runs socket.io
 *                          last-writer-wins; nothing here touches it.
 *   • TWO PROCESSES      — both peers share one event loop, one heap and one
 *                          scheduler.  C78 §15.4: the concurrency arm "needs
 *                          two processes" and is not measurable in one Node
 *                          realm.  The partition here is a `provider.disconnect`,
 *                          not a partitioned process.
 *   • NETWORK PARTITION  — no latency, reordering, loss, or server-side
 *                          linearisation is induced.  A clean loopback socket
 *                          is not a network.
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

/**
 * The axes a local-harness run CANNOT reach, named on every run (C70 §7.1).
 * Reaching all three is what turns exit 1 UNPROVEN into exit 0.
 */
const UNREACHABLE_AXES: readonly (readonly [string, string])[] = [
  [
    'real transport',
    'the harness ran an in-process sync server in THIS Node realm; production runs socket.io last-writer-wins and is untouched by this run',
  ],
  [
    'two processes',
    'both peers share one event loop, one heap and one scheduler — C78 §15.4: the concurrency arm needs two processes and is not measurable in one Node realm',
  ],
  [
    'network partition',
    'no latency, reordering, loss or server-side linearisation was induced; the partition was a provider.disconnect(), not a partitioned network',
  ],
];

function line(s = ''): void { console.log(s); }

function printReport(report: CollabGateReport): void {
  line('─'.repeat(78));
  line('check-collab-graph-integrity — C8: collaboration preserves relationships');
  line('─'.repeat(78));
  line(
    `target                 ${report.target}  (${report.url})` +
      (report.target === 'local-harness'
        ? '   ← NOT a deployed transport; exit 0 is unreachable from here'
        : ''),
  );
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

  // ── What the run ACTUALLY earned, stated as the narrower claim it is. ─────
  // Note the wording: "the hosting edge survived, in this harness". It is NOT
  // "collaboration preserves relationships" — that is C8's question, and C8's
  // question is not answerable from a run with no deployed transport.
  const earned =
    `${report.comparedRelationships} hosting edges survived concurrent editing on both documents; ` +
    `${report.comparedElements} element records compared; 0 violations.`;

  if (report.target === 'remote') {
    // The only path to exit 0. A real deployed transport was configured, it
    // accepted the upgrade, and the model survived the merge across it.
    line(`✓ PROVEN against a real transport (${report.url}) — ${earned}`);
    return 0;
  }

  // ── §UNPROVEN-IS-NOT-GREEN — the local harness never reaches exit 0. ──────
  line(`✓ NARROW CLAIM PROVEN — in the LOCAL in-process harness: ${earned}`);
  line('  That is a real result and it is the only executed evidence in this repo that the');
  line('  hosting edge survives a partition-and-merge over real sockets. It is NOT C8.');
  line();
  line('✗ UNPROVEN — C8 asks whether COLLABORATION preserves relationships. This run cannot');
  line('  answer that, because it never touched a deployed transport. C70 §7 exit condition:');
  line('  "green AGAINST A REAL TRANSPORT; until then it reports UNPROVEN, never green (§3.4)."');
  line();
  line('  AXES THIS RUN COULD NOT REACH (C70 §7.1) — each is UNPROVEN, not clean:');
  for (const [axis, why] of UNREACHABLE_AXES) {
    line(`    · ${axis.toUpperCase().padEnd(18)} UNPROVEN — ${why}`);
  }
  line();
  line('  C66 §1: no capacity tier moves CLAIMED → HELD on this evidence. No status document,');
  line('  roadmap or summary may cite this run as "collaboration is fine", and nothing may');
  line('  cite this gate as GREEN while it exits 1 (C70 §8.k).');
  line();
  line('  Remaining step is a founder decision, not engineering work:');
  line('  docs/03-execution/plans/L-391-COLLAB-DEPLOY-DECISION.md.');
  line('  To reach exit 0: PRYZM_COLLAB_GATE_URL=wss://… PRYZM_COLLAB_GATE_TOKEN=…');
  if (scope === 'production') {
    line();
    line('  (PRYZM_COLLAB_GATE_SCOPE=production was requested and no PRYZM_COLLAB_GATE_URL was');
    line('   configured — C8 stays FAIL — BLOCKED. Same exit code; UNPROVEN is now the default');
    line('   for every local run, not only for production scope.)');
  }
  return 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error('check-collab-graph-integrity: unexpected failure —', err);
    // An unexpected throw is a gate that could not establish its subject.
    process.exit(2);
  },
);
