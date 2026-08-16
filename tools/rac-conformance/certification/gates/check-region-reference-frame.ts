// ─── GATE · check-region-reference-frame  (C79 §8, row 3) ────────────────────
//
// THE INVARIANT (C79 §3.1 / §3.2) — HARD-0, AND PERMANENT:
//   "A region-traced edge's reference frame MUST be the frame the ring was
//    actually traced on, at offset 0. For every wall-region tracer in this
//    repository that frame is the wall CENTRELINE ... A region path MUST NOT name
//    `interiorFace`, `exteriorFace`, `coreInterior` or `coreExterior` for a
//    centreline-traced edge."
//
// C79 §8's exit-condition column for this gate reads, in full: "hard-0,
// permanently". There is no baseline field in its ledger and no way to add one.
//
// WHY IT IS CONTRACTED AT ALL. `HostReferenceEdge.reference` is a five-member
// union and a region path must pick one. Commit e6c8cb58 picked `'centerLine'` at
// `offset: 0`, and §3 exists so a future implementer cannot silently pick a face.
// Two independent reasons, either sufficient, both measured:
//
//   1. IT MOVES THE GEOMETRY. Naming a face shifts every edge by half the wall
//      thickness away from where the user saw the region highlighted. The element
//      would be created somewhere other than where it was previewed.
//   2. THE SIDE CANNOT BE DETERMINED. Interior/exterior sense depends on the
//      wall's authored start→end direction, which the ring walk does not preserve.
//      Choosing a face is therefore A COIN FLIP — a §2.3 wrong-answer, not a §2.4
//      honest refusal. And §2.3 is the whole spine of this contract: a wrong host
//      is strictly worse than no host, because the element follows the WRONG
//      element while looking like working behaviour.
//
// ─── WHAT IT DECIDES — three arms ────────────────────────────────────────────
//   ARM 1 · FRAME. No construction site names one of the four forbidden face
//           members. This is the clause, directly.
//
//           ⚠ §FORWARDING-IS-NOT-CHOOSING (lane G2, A.12, 2026-08-16). ARM 1
//           treated EVERY `type: 'hostReference'` literal as a site that CHOOSES
//           a frame. C79 §3.1/§3.2 do not: they bind *"a region-traced edge"*
//           and *"a region path"* — the act of choosing. A site that writes
//           `reference: edge.reference` FORWARDS a frame someone else chose, and
//           a translation cannot violate a clause about choosing.
//
//           The measured consequence was a FALSE POSITIVE that held this gate at
//           exit 3 and out of every runner: `FinishSegmentAdapter.ts:150`, the
//           `{x,z}`↔`{x,y}` coordinate adapter. And it fired on the family that
//           honours §3 BEST in the tree — the finish frame is decided one layer
//           up at `reprojectFinishBoundary.ts:236-242`, which refuses anything
//           that is not `centerLine@0` with the typed C78 §8.1 reason
//           `GEOMETRY_UNPREDICTABLE` instead of coin-flipping the side, polices
//           BOTH arms this gate checks, and carries its own negative test.
//
//           A forwarding site is therefore judged by REDIRECTION, never by
//           exemption: the ledger names the file that polices the frame and the
//           guard that does it, and this gate FAILS if that guard disappears. It
//           now notices a deletion it could not previously have seen at all —
//           strictly more coverage than the false positive bought.
//
//           A `reference:` bound to an expression with NO ledger entry is still
//           a finding, and a literal with no `reference:` key at all is still
//           the original unreadable-shape finding. Three cases, three verdicts.
//   ARM 2 · OFFSET. §3.1 says "at offset 0" — the frame and the offset are ONE
//           decision, not two. At offset 0 the resolved segment IS the traced
//           chord; a nonzero offset moves the edge off the line the user saw just
//           as surely as naming a face does, so a gate that checked only the name
//           would police half a clause.
//   ARM 3 · THE UNION IS STILL FIVE. The forbidden members are read from the
//           ledger and CHECKED against `WallFaceRef` in SketchTypes.ts. If someone
//           adds a sixth member, this gate must not keep quietly policing four —
//           an unpoliced member is the gap a future implementer walks through.
//           §3.3's rule (change the contract in the same PR) needs the gate to
//           notice the union moved.
//
// ─── FLOORS ──────────────────────────────────────────────────────────────────
// C79 §8's minimum evidence for this gate: "region edge constructions found > 0".
// The ledger's `minConstructionSites` is stronger — the count the tree is KNOWN to
// contain — because a detector that silently stopped matching would otherwise
// report a beautiful zero and read as permanently, effortlessly clean. That is the
// empty-seed lesson (e5addac8) and it is the failure mode a HARD-0 gate is most
// exposed to: 0 findings is what success looks like, so 0 findings over 0 subjects
// is indistinguishable from it at a glance. The floor is what makes it distinct.
//
// Exit 0 clean · 1 declared · 2 MISCONFIGURED · 3 exceeded (contract.ts —
// imported, never copied). HARD-0: declared is 0 and there is no ledger baseline.
//
// ─── MEASURED AT HEAD 3785eae6, 2026-08-16 (lane G2, A.12) — THE PIN ─────────
// Run DIRECTLY, exit code read from `$?` and never through a pipe (tracker §7.2):
//
//   → EXIT 3 · RATCHET EXCEEDED · 1 finding against a declared HARD-0.
//     ❌ packages/finish-host-tracker/src/FinishSegmentAdapter.ts:150 — a
//        hostReference edge is constructed with no `reference` member the sweep
//        can read.
//     5 construction sites swept (ledger floor 3) · 4 on centerLine @ 0.
//
// The sweep finds FIVE sites where the ledger's prose records three: the tree
// grew two sites after the ledger was written — roomBoundarySketch.ts (passes)
// and FinishSegmentAdapter.ts (the finding). Recorded BEFORE any fix, alone.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type GateResult, type Floor } from '../contract.js';
import { loadSiteLedger, findEdgeSites, type EdgeSite } from './regionEdgeSites.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../../..');
const LEDGER = resolve(__dirname, 'region-edge-sites.json');

const floors: Floor[] = [];
const lines: string[] = [];
const findingNames: string[] = [];

const ledger = loadSiteLedger(LEDGER);
floors.push({ what: 'region-edge-sites.json ledger present', measured: ledger ? 1 : 0, min: 1 });

if (ledger) {
  const sites: EdgeSite[] = findEdgeSites(REPO, ledger);

  // C79 §8 minimum evidence: "region edge constructions found > 0" — strengthened
  // to the count the tree is known to contain, so a detector that stopped matching
  // exits 2 instead of printing a clean zero.
  floors.push({
    what: `HostReferenceEdge construction sites found by the sweep (§8: > 0; ledger floor is the known count)`,
    measured: sites.length,
    min: ledger.minConstructionSites,
  });

  // ── ARM 3 · THE UNION IS STILL FIVE ────────────────────────────────────────
  const typeText = existsSync(resolve(REPO, ledger.typeSource))
    ? readFileSync(resolve(REPO, ledger.typeSource), 'utf8')
    : null;
  floors.push({ what: `WallFaceRef is readable in ${ledger.typeSource}`, measured: typeText ? 1 : 0, min: 1 });
  if (typeText) {
    const union = /export\s+type\s+WallFaceRef\s*=([\s\S]*?);/.exec(typeText);
    const members = union ? [...union[1]!.matchAll(/['"`]([^'"`]+)['"`]/g)].map((m) => m[1]!) : [];
    floors.push({ what: 'WallFaceRef members parsed', measured: members.length, min: 2 });
    const policed = new Set([ledger.tracedFrame, ...ledger.forbiddenForTracedFrame]);
    const unpoliced = members.filter((m) => !policed.has(m));
    if (unpoliced.length > 0) {
      findingNames.push(`ARM 3 · UNION: unpoliced WallFaceRef member(s) ${unpoliced.join(', ')}`);
      lines.push(
        `❌ ARM 3 · UNION: WallFaceRef declares [${members.join(', ')}], but this gate polices only ` +
        `[${[...policed].join(', ')}]. Unpoliced: [${unpoliced.join(', ')}]. A member nobody checks is the gap a future ` +
        'implementer walks through — add it to forbiddenForTracedFrame (or to tracedFrame per §3.3) in the same PR that mints it.',
      );
    } else {
      lines.push(`✓  ARM 3 · UNION: all ${members.length} WallFaceRef members are policed — [${members.join(', ')}].`);
    }
  }

  // ── ARM 1 · FRAME · ARM 2 · OFFSET ─────────────────────────────────────────
  const forbidden = new Set(ledger.forbiddenForTracedFrame);
  const forwarding = new Map((ledger.forwardingSites ?? []).map((f) => [f.site, f]));

  // Every declared forwarding site must still EXIST and must still be found by
  // the sweep. A declaration for a site that has vanished is a stale exemption,
  // and a stale exemption is how a gate quietly polices less than it says.
  const staleForwarding = [...forwarding.keys()].filter((rel) => !sites.some((s) => s.rel === rel));
  floors.push({
    what: 'declared forwardingSites still found by the sweep',
    measured: forwarding.size - staleForwarding.length,
    min: forwarding.size,
  });

  let ok = 0;

  for (const s of sites) {
    const where = `${s.rel}:${s.line}`;

    if (s.reference === null) {
      // ── §FORWARDING-IS-NOT-CHOOSING ──────────────────────────────────────
      // A site whose `reference:` is bound to an EXPRESSION forwards a frame
      // someone else chose. C79 §3.1/§3.2 bind "a region-traced edge" and "a
      // region path" — the act of CHOOSING a frame. A pure type translation
      // chooses nothing and cannot violate §3; judging it as though it did is
      // the gate's subject being wider than the contract's clause.
      //
      // This is NOT an exemption. It REDIRECTS the check to the file where the
      // frame IS decided, and FAILS if that file stops guarding it — so the
      // gate notices a deletion it previously could not have seen at all.
      const fwd = forwarding.get(s.rel);
      if (fwd && s.referenceIsForwarded) {
        const guardPath = resolve(REPO, fwd.policedBy);
        const guardText = existsSync(guardPath) ? readFileSync(guardPath, 'utf8') : null;
        const guarded = guardText !== null && new RegExp(fwd.guard).test(guardText);
        if (guarded) {
          ok++;
          lines.push(
            `✓  ${where}: FORWARDS a frame (\`reference:\` bound to an expression), it does not choose one. ` +
            `The frame for this family is policed at ${fwd.policedBy} (guard \`${fwd.guard}\` present).`,
          );
        } else {
          findingNames.push(`${where}:forwarded frame no longer policed at ${fwd.policedBy}`);
          lines.push(
            `❌ ARM 1 · ${where}: this site FORWARDS a reference frame, and the guard that polices that frame — ` +
            `\`${fwd.guard}\` in ${fwd.policedBy} — is GONE${guardText === null ? ' (file missing)' : ''}. ` +
            'A forwarding site is only clean while something upstream decides the frame; when that guard is deleted the ' +
            'forward becomes the choice, and the choice is unpoliced. Restore the guard, or make this site name the frame.',
          );
        }
        continue;
      }

      // A construction with no `reference` at all cannot be judged against §3.1,
      // and an unjudgeable site in a HARD-0 gate is a finding, not a pass. The
      // field is required by the type, so this means the sweep found a shape it
      // does not understand — which is exactly what must not go unnoticed.
      findingNames.push(`${where}:no reference named`);
      lines.push(
        `❌ ARM 1 · ${where}: a hostReference edge is constructed with no \`reference\` member the sweep can read` +
        (s.referenceIsForwarded
          ? ', and its `reference:` is bound to an EXPRESSION that no `forwardingSites` ledger entry declares. Declare it with the site that polices its frame, or name the frame here'
          : ' (no `reference:` key at all)') +
        '. C79 §3 makes the frame a CONTRACTED decision; a site whose frame cannot be read cannot be shown to honour it.',
      );
      continue;
    }

    if (forbidden.has(s.reference)) {
      findingNames.push(`${where}:reference '${s.reference}'`);
      lines.push(
        `❌ ARM 1 · FRAME ${where}: names \`reference: '${s.reference}'\` — one of the four FORBIDDEN face members. ` +
        `C79 §3.2, two independent and separately sufficient reasons: (1) it MOVES THE GEOMETRY — every edge shifts by ` +
        `half the wall thickness away from where the user saw the region highlighted, so the element is created somewhere ` +
        `other than where it was previewed; (2) THE SIDE CANNOT BE DETERMINED — interior/exterior sense depends on the ` +
        `wall's authored start→end direction, which the ring walk does not preserve, so this is a COIN FLIP: a §2.3 ` +
        `wrong-answer, not a §2.4 honest refusal. The traced frame is '${ledger.tracedFrame}'.`,
      );
      continue;
    }

    if (s.reference !== ledger.tracedFrame) {
      findingNames.push(`${where}:reference '${s.reference}' is not the traced frame`);
      lines.push(
        `❌ ARM 1 · FRAME ${where}: names \`reference: '${s.reference}'\`, but the traced frame is ` +
        `'${ledger.tracedFrame}'. C79 §3.3: the invariant is "reference == traced frame". If this path genuinely traces ` +
        `'${s.reference}', C79 §3.1 must be changed IN THE CONTRACT, in the same PR, with the traced frame named — ` +
        'and this ledger updated alongside it.',
      );
      continue;
    }

    // ARM 2 — the frame and the offset are ONE decision.
    const offsetOk = s.offset !== null && Number(s.offset) === ledger.tracedOffset;
    if (!offsetOk) {
      findingNames.push(`${where}:offset ${s.offset ?? '(absent)'}`);
      lines.push(
        `❌ ARM 2 · OFFSET ${where}: \`offset: ${s.offset ?? '(absent)'}\` against the contracted ${ledger.tracedOffset}. ` +
        `C79 §3.1 says "at offset 0" in the same breath as the frame: at offset 0 the resolved segment IS the traced ` +
        'chord — the reference and the geometry the user saw are the same line. A nonzero offset moves the edge off that ' +
        'line just as surely as naming a face does.',
      );
      continue;
    }

    ok++;
    lines.push(`✓  ${where}: reference '${s.reference}' @ offset ${s.offset} — the traced frame, at 0.`);
  }

  lines.push(
    `${sites.length} HostReferenceEdge construction site(s) swept across [${ledger.sweepRoots.join(', ')}] · ` +
    `${ok} on the traced frame at offset ${ledger.tracedOffset} · ${findingNames.length} finding(s). HARD-0, permanently (§8).`,
  );
}

const result: GateResult = {
  gate: 'check-region-reference-frame',
  floors,
  lines,
  findings: findingNames.length,
  // HARD-0, PERMANENTLY (C79 §8's exit-condition column, verbatim). There is no
  // acceptable level of "the element was created somewhere other than where it was
  // previewed", and no baseline field exists in region-edge-sites.json to hold one.
  declared: 0,
  findingNames,
};

process.exit(reportGate(result));
