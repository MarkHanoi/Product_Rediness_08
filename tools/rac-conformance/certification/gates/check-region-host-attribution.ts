// ─── GATE · check-region-host-attribution  (C79 §8, row 1) ───────────────────
//
// THE INVARIANT (C79 §6.1):
//   "Every region-capable creation path — plan tool, 3D tool, roof detector, and
//    any future ceiling or floor-finish mode — MUST produce host references, or
//    state, at its own boundary and in a form a caller can read, why it cannot.
//    There is no third option, and 'the other surface does it' is not compliance:
//    the user does not know which surface they used."
//
// The defect this exists over (C79 §0): SlabRegionTracer RECEIVED the wall array,
// walked their centrelines to close the ring, and returned bare {x, y} points —
// throwing the wall ids away. The information was never missing. It was discarded
// on the way out. Two buttons that look identical behaved differently, with no
// error, no warning and no degraded-mode indication.
//
// ─── WHAT IT DECIDES — four arms ─────────────────────────────────────────────
//   ARM 1 · BY CONSTRUCTION (§2.1–§2.3). The one attributing tracer must attribute
//           from the producing wall's own geometry, and MUST NOT re-derive by
//           proximity. Static analysis cannot tell a by-construction hostId from a
//           plausible proximity one (§8.3(a) says so in the contract's own words),
//           so this arm asserts what static analysis CAN see: the tracer's
//           attribution site reads an id carried FORWARD from the ring walk, and no
//           nearest/closest/distance-minimising search appears on the attribution
//           path. A proximity search introduced there turns this arm red.
//   ARM 2 · THE THREE NAMED REASONS (§2.4). `curved | noWallId | ambiguous` all
//           exist in the tracer, as distinct values. §2.4's MUST NOT is explicit:
//           a family may ADD reasons, but "curved" and "I gave up" may not collapse
//           into one boolean.
//   ARM 3 · THE FIVE COUNTS (§2.5, §2.6). hostEdges / freeEdges / curvedFallbacks /
//           missingIdFallbacks / ambiguousFallbacks are all PRODUCED by the tracer
//           and RETURNED — so zero-host and all-host are not the same value at the
//           caller (C74's rule applied to attribution).
//   ARM 4 · PER-PATH CONFORMANCE (§6.3). Every declared region path is re-measured
//           against its own file. Rows declared CONFORMING must still call an
//           attributing tracer (or emit HostReferenceEdges directly) AND report the
//           counts; rows declared NON_CONFORMING or CAPABILITY_ABSENT are FINDINGS
//           — the ledger declares them, so they land at exit 1 rather than 3, and
//           they leave the ledger in the commit that fixes them.
//           BOTH DIRECTIONS: a NON_CONFORMING row that has quietly become
//           conforming, or a CAPABILITY_ABSENT row that has grown a region mode, is
//           STALE (exit 3) — debt that has been paid must leave the books.
//
// ─── WHY THE PATHS COME FROM A LEDGER AND NOT A GREP ─────────────────────────
// A heuristic sweep for "the word region in a tool file" counts comments,
// tombstones, and this gate's own ledger. C79 §6.3 is an ENUMERATION made by
// reading every creation path in the tree; region-paths.json is that enumeration.
// The gate's job is not to rediscover it but to CHECK it, in both directions, so
// neither a regression nor a silent fix can pass unnoticed.
//
// ─── FLOORS — C79 §8.2, stated in the contract for this gate by name ─────────
//   "A region gate that finds ZERO region paths has not passed — it has failed to
//    measure, and exit 2 is the only honest answer." A vanished ledger, a ledger
//    naming files that no longer exist, or a tracer source that cannot be read all
//    exit 2. That is the empty-seed lesson (e5addac8) applied here.
//
// Exit 0 clean · 1 declared · 2 MISCONFIGURED · 3 exceeded (contract.ts —
// imported, never copied).

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type GateResult, type Floor } from '../contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../../..');
const LEDGER = resolve(__dirname, 'region-paths.json');

type Status = 'CONFORMING' | 'NON_CONFORMING' | 'CAPABILITY_ABSENT';

interface PathDecl {
  id: string;
  family: string;
  file: string;
  status: Status;
  expectAttributingTracer?: boolean;
  expectCountsReported?: boolean;
  expectHostReferenceEdges?: boolean;
  emptyDependencyField?: string;
  why: string;
}

interface Ledger {
  paths: PathDecl[];
  attributingTracers: string[];
  bareRingTracers: string[];
  attributionCountFields: string[];
  attributionReasons: string[];
  tracerSource: string;
  declaredFindings: string[];
}

const floors: Floor[] = [];
const lines: string[] = [];
const findingNames: string[] = [];
const stale: string[] = [];

const ledger: Ledger | null = existsSync(LEDGER)
  ? (JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger)
  : null;

floors.push({ what: 'region-paths.json ledger present', measured: ledger ? 1 : 0, min: 1 });
// §8.2 verbatim: a discovery of zero region paths is MISCONFIGURED, never clean.
floors.push({ what: 'region paths declared (§8.2: zero is exit 2, never a pass)', measured: ledger?.paths.length ?? 0, min: 1 });

/** Read a declared file, or null. A missing declared file is a floor, not a finding. */
function readDeclared(rel: string): string | null {
  const p = resolve(REPO, rel);
  if (!existsSync(p)) return null;
  try { return readFileSync(p, 'utf8'); } catch { return null; }
}

/** Strip line and block comments so a prose mention is never counted as code. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const tracerText = ledger ? readDeclared(ledger.tracerSource) : null;
floors.push({ what: `the attributing tracer source is readable (${ledger?.tracerSource ?? '—'})`, measured: tracerText ? 1 : 0, min: 1 });

if (ledger && tracerText) {
  const tracerCode = stripComments(tracerText);

  // ── ARM 1 · BY CONSTRUCTION (§2.1–§2.3) ────────────────────────────────────
  // What static analysis CAN see. The attribution site must read an id that the
  // ring walk carried FORWARD (`a.hostId` off an AttributedRingVertex), and the
  // tracer must declare the rule. §8.3(a) records what it CANNOT see, so this
  // arm never claims to have verified the id is the RIGHT one.
  const carriesForward = /\bhostId\b/.test(tracerCode) && /AttributedRingVertex|attributedRing|findAttributedRegionAtPoint/.test(tracerCode);
  const declaresRule = /ATTRIBUTION_RULE/.test(tracerText);
  if (!carriesForward || !declaresRule) {
    findingNames.push('ARM 1 · BY-CONSTRUCTION: the tracer does not carry an id forward from the ring walk');
    lines.push(
      `❌ ARM 1 · BY CONSTRUCTION: carries-id-forward=${carriesForward} · declares ATTRIBUTION_RULE=${declaresRule} in ${ledger.tracerSource}. ` +
      'C79 §2.1 makes attribution a fact carried forward from construction; a tracer that does neither has nothing to carry.',
    );
  } else {
    lines.push('✓  ARM 1 · BY CONSTRUCTION: the ring walk carries hostId forward and ATTRIBUTION_RULE is declared at the attribution site.');
  }

  // §2.2 — proximity is precisely where a WRONG hostId comes from. A
  // nearest-neighbour / minimum-distance search appearing on the attribution path
  // is the shape §2.3 forbids, and it IS statically visible.
  const PROXIMITY = /\b(nearestWall|closestWall|findNearest|findClosest|minDistanceWall|wallNearest|nearestHost|closestHost)\b/;
  const proximityHit = PROXIMITY.exec(tracerCode);
  if (proximityHit) {
    findingNames.push('ARM 1 · PROXIMITY: attribution re-derived by a nearest/closest search');
    lines.push(
      `❌ ARM 1 · PROXIMITY: "${proximityHit[0]}" appears in ${ledger.tracerSource}. C79 §2.2 forbids re-deriving attribution by ` +
      'proximity, nearest-neighbour search or coordinate matching — §2.3: a wrong host is strictly worse than no host, because the ' +
      'element then follows the WRONG element while looking like working behaviour.',
    );
  } else {
    lines.push('✓  ARM 1 · PROXIMITY: no nearest/closest/min-distance host search on the attribution path.');
  }

  // ── ARM 2 · THE THREE NAMED REASONS (§2.4) ─────────────────────────────────
  const missingReasons = ledger.attributionReasons.filter(
    (r) => !new RegExp(`['"\`]${r}['"\`]`).test(tracerCode),
  );
  if (missingReasons.length > 0) {
    findingNames.push(`ARM 2 · REASONS: ${missingReasons.join(', ')} absent from the tracer`);
    lines.push(
      `❌ ARM 2 · NAMED REASONS: ${missingReasons.length} of ${ledger.attributionReasons.length} missing — [${missingReasons.join(', ')}]. ` +
      'C79 §2.4: attribution failure is NAMED, not anonymous, and the three MUST NOT collapse into a single boolean — ' +
      '"curved" and "I gave up" are not the same value.',
    );
  } else {
    lines.push(`✓  ARM 2 · NAMED REASONS: all three present as distinct values — [${ledger.attributionReasons.join(' | ')}].`);
  }

  // ── ARM 3 · THE FIVE COUNTS (§2.5, §2.6) ───────────────────────────────────
  const missingCounts = ledger.attributionCountFields.filter((c) => !new RegExp(`\\b${c}\\b`).test(tracerCode));
  floors.push({
    what: 'attribution count fields the tracer produces (§2.5 names exactly five)',
    measured: ledger.attributionCountFields.length - missingCounts.length,
    min: 1,
  });
  if (missingCounts.length > 0) {
    findingNames.push(`ARM 3 · COUNTS: ${missingCounts.join(', ')} not produced`);
    lines.push(
      `❌ ARM 3 · FIVE COUNTS: missing [${missingCounts.join(', ')}] from ${ledger.tracerSource}. ` +
      'C79 §2.6: a fallback MUST NOT be silently absorbed — zero-host and all-host must not be the same value at the caller.',
    );
  } else {
    lines.push(`✓  ARM 3 · FIVE COUNTS: all five produced and returned — [${ledger.attributionCountFields.join(', ')}].`);
  }

  // ── ARM 4 · PER-PATH CONFORMANCE (§6.3), re-measured in BOTH directions ─────
  let conforming = 0;
  let nonConforming = 0;
  let absent = 0;

  for (const p of ledger.paths) {
    const text = readDeclared(p.file);
    if (text === null) {
      // A ledger naming a file that does not exist has lost its subject — the
      // §8.2 shape, surfaced as a floor so it exits 2 rather than reading as a
      // finding about a file nobody can see.
      floors.push({ what: `declared region path "${p.id}" exists on disk (${p.file})`, measured: 0, min: 1 });
      continue;
    }
    const code = stripComments(text);

    const callsAttributing = ledger.attributingTracers.some((t) => new RegExp(`\\b${t}\\s*\\(`).test(code));
    const emitsHostEdges = /type:\s*['"`]hostReference['"`]/.test(code) || /buildPickedWallEdges\s*\(/.test(code);
    // The counts reaching a caller — either the five names directly, or the ONE
    // shared report helper the roof family routes both its surfaces through
    // (§7.4: one form for both buttons, so they cannot drift apart).
    const reportsCounts =
      ledger.attributionCountFields.some((c) => new RegExp(`\\b${c}\\b`).test(code)) ||
      /formatRoofRegionAttributionReport\s*\(/.test(code);
    const usesBareRingOnly =
      !callsAttributing && ledger.bareRingTracers.some((t) => new RegExp(`\\b${t}\\s*\\(`).test(code));
    const hasEmptyDepField =
      p.emptyDependencyField !== undefined &&
      new RegExp(`\\b${p.emptyDependencyField}\\s*:\\s*\\[\\s*\\]`).test(code);
    const mentionsRegion = /\bregion\b/i.test(code);

    if (p.status === 'CONFORMING') {
      conforming++;
      const wantTracer = p.expectAttributingTracer === true;
      const wantCounts = p.expectCountsReported === true;
      const wantEdges = p.expectHostReferenceEdges === true;
      const failures: string[] = [];
      if (wantTracer && !callsAttributing) {
        failures.push(`declared CONFORMING via an attributing tracer, but calls none of [${ledger.attributingTracers.join(', ')}]` +
          (usesBareRingOnly ? ` — it calls a BARE-RING tracer instead, which is the §0 defect exactly: the ids are in the input and are discarded on the way out` : ''));
      }
      if (wantCounts && !reportsCounts) {
        failures.push('declared CONFORMING but reports none of the five §2.5 attribution counts to its caller (§2.6: a fallback MUST NOT be silently absorbed)');
      }
      if (wantEdges && !emitsHostEdges) {
        failures.push('declared CONFORMING via direct HostReferenceEdge emission, but emits none');
      }
      if (failures.length > 0) {
        findingNames.push(`${p.id}:CONFORMING row REGRESSED`);
        lines.push(`❌ ARM 4 · ${p.id} (${p.family}): ${failures.join(' · ')} — ${p.file}`);
      } else {
        lines.push(`✓  ARM 4 · ${p.id} (${p.family}): CONFORMING confirmed — attributing-tracer=${callsAttributing} counts-reported=${reportsCounts} host-edges=${emitsHostEdges}`);
      }
      continue;
    }

    if (p.status === 'NON_CONFORMING') {
      nonConforming++;
      // The finding, declared. Named so the ledger is auditable by a human.
      const detail = hasEmptyDepField
        ? `${p.emptyDependencyField}: [] is hardcoded — C79 §7.1's anti-pattern: the field's NAME is a claim, written empty on every path`
        : 'produces coordinates only — the region relationship is expressed at creation and unrecoverable afterwards (§1.2)';
      findingNames.push(`${p.id}:NON_CONFORMING`);
      lines.push(`❌ ARM 4 · ${p.id} (${p.family}): NON-CONFORMING — ${detail}. ${p.file}`);
      // BOTH DIRECTIONS: has it quietly become conforming?
      if (callsAttributing || (emitsHostEdges && !hasEmptyDepField)) {
        stale.push(`${p.id}:NON_CONFORMING`);
        lines.push(
          `⚠  STALE LEDGER ENTRY: "${p.id}" is declared NON_CONFORMING but now calls an attributing tracer / emits host references. ` +
          'Move the row to CONFORMING and strike it from declaredFindings in the commit that fixed it.',
        );
      }
      continue;
    }

    // CAPABILITY_ABSENT
    absent++;
    findingNames.push(`${p.id}:CAPABILITY_ABSENT`);
    lines.push(
      `❌ ARM 4 · ${p.id} (${p.family}): CAPABILITY ABSENT — 0 code occurrences of \`region\` in ${p.file}. ` +
      'C79 §6.3 rows 9–10: this cannot inherit a fix, and §6.6 forbids adding a region mode that emits coordinates — ' +
      'that would create the §0 defect NEW, in 2026, in a family that has never had it.',
    );
    if (mentionsRegion) {
      stale.push(`${p.id}:CAPABILITY_ABSENT`);
      lines.push(
        `⚠  STALE LEDGER ENTRY: "${p.id}" is declared CAPABILITY_ABSENT but \`region\` now appears in its code. ` +
        'Re-measure the row: it is either CONFORMING or NON_CONFORMING now, and it must not stay declared absent.',
      );
    }
  }

  lines.push(
    `§6.3 conformance re-measured: ${conforming} CONFORMING · ${nonConforming} NON-CONFORMING · ${absent} CAPABILITY-ABSENT ` +
    `of ${ledger.paths.length} declared region paths.`,
  );

  // ── Staleness of the ledger itself: a paid debt must LEAVE the books ────────
  for (const declared of ledger.declaredFindings) {
    const name = declared.split(':')[0]!;
    if (!findingNames.some((f) => f.startsWith(`${name}:`))) {
      stale.push(declared);
      lines.push(
        `⚠  STALE LEDGER ENTRY: "${declared}" is declared in region-paths.json but no longer measured. ` +
        'Delete it from declaredFindings in the commit that fixed it.',
      );
    }
  }
}

const result: GateResult = {
  gate: 'check-region-host-attribution',
  floors,
  lines,
  findings: findingNames.length,
  declared: ledger?.declaredFindings.length ?? 0,
  findingNames,
  stale,
};

process.exit(reportGate(result));
