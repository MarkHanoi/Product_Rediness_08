// ─── GATE · check-identity-roundtrip ─────────────────────────────────────────
//
// C1 / Wave 3 of docs/03-execution/plans/BIM20-ACCEPTANCE-10-OF-10.md:
//
//   "every element kind restores with its original id AND ifcData.guid.
//    Hard-0, no baseline."
//
// TWO INVARIANTS, ASSERTED SEPARATELY — because they fail for different reasons
// and a gate that merged them would report one number for two defects:
//
//   ARM A · ID SURVIVAL. Every id present in the authoritative store BEFORE save
//   is present AFTER reload, and no id appears that nobody created. F-2 is
//   exactly this: `ImportProjectCommand.ts:680` builds `CreateStairCommand`
//   with no `id:` and `:875` builds `CreateBeamCommand` with no `beamId:`, so
//   the element survives under a FRESH uuid. Nothing is "lost" in a way a
//   record count would notice — the count is identical. Only the id set moves.
//
//   ARM B · GUID STABILITY. `ifcData.guid` is the IFC/Revit round-trip JOIN KEY
//   (ProjectSerializer header, A.R.3 · S55). A model that re-mints it on reload
//   no longer matches its own export, and no record-level diff of geometry would
//   ever say so.
//
// WHY THIS GATE READS AN ARTEFACT RATHER THAN BUILDING ITS OWN WORLD: the
// measurement already exists and is executed — `persistence.cert.ts` seeds
// through REAL commands, serialises with the REAL `ProjectSerializer` and reloads
// with the REAL `ProjectLoader`. A second, independent re-implementation of that
// round-trip would be a SECOND ORACLE, and two oracles that disagree is the
// worst outcome available. What the gate owes instead is proof that the artefact
// it read is REAL: hence the floors below, which refuse to grade an artefact that
// compared nothing.

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type GateResult, type Floor } from '../contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const P = resolve(__dirname, '../results/persistence.json');

interface Divergence { path: string; expected: unknown; actual: unknown }
interface Artefact {
  rows?: unknown[];
  comparedKinds?: string[];
  divergencesByKind?: Record<string, Divergence[]>;
  idsByKind?: Record<string, { expected: string[]; actual: string[]; reachedExpected: boolean; reachedActual: boolean }>;
}

const floors: Floor[] = [];
const lines: string[] = [];
const findingNames: string[] = [];

const artefact: Artefact | null = existsSync(P) ? (JSON.parse(readFileSync(P, 'utf8')) as Artefact) : null;

// ── FLOORS · emptiness is never a pass ───────────────────────────────────────
floors.push({ what: 'results/persistence.json exists', measured: artefact ? 1 : 0, min: 1 });
floors.push({ what: 'rows in the artefact', measured: artefact?.rows?.length ?? 0, min: 18 });
// A gate that graded 0 kinds would report "0 identity failures" — the exact
// sentence C10 §0 rule 2 forbids. 18 kinds are declared in the suite; 10 is the
// floor below which the comparison is not worth a verdict.
const compared = artefact?.comparedKinds ?? [];
floors.push({ what: 'kinds whose round-trip comparison actually RAN', measured: compared.length, min: 10 });
const idKinds = Object.entries(artefact?.idsByKind ?? {}).filter(([, v]) => v.expected.length > 0);
floors.push({ what: 'kinds holding ≥1 record whose ids can be compared', measured: idKinds.length, min: 10 });
const totalIds = idKinds.reduce((n, [, v]) => n + v.expected.length, 0);
floors.push({ what: 'element ids compared', measured: totalIds, min: 12 });

if (artefact && floors.every((f) => f.measured >= f.min)) {
  // ── ARM A · id survival ────────────────────────────────────────────────────
  for (const [kind, v] of idKinds) {
    if (!v.reachedExpected || !v.reachedActual) {
      // A kind whose store was never reached is MISCONFIGURED for that kind and
      // must not be silently graded clean. It is surfaced as a finding with its
      // own name so it can never be mistaken for "id survived".
      findingNames.push(`${kind}: UNREACHED store (expected=${v.reachedExpected} actual=${v.reachedActual})`);
      lines.push(`❌ ARM A ${kind}: store not reached — no identity verdict is possible, and "clean" is not the answer.`);
      continue;
    }
    const lost = v.expected.filter((id) => !v.actual.includes(id));
    const minted = v.actual.filter((id) => !v.expected.includes(id));
    if (lost.length || minted.length) {
      findingNames.push(`${kind}: id not preserved (${lost.length} lost, ${minted.length} re-minted)`);
      lines.push(
        `❌ ARM A ${kind}: ${lost.length} id(s) LOST, ${minted.length} FRESH id(s) appeared. ` +
        `lost=[${lost.slice(0, 3).join(', ')}] minted=[${minted.slice(0, 3).join(', ')}]`,
      );
    } else {
      lines.push(`✓  ARM A ${kind}: all ${v.expected.length} id(s) survived the round-trip.`);
    }
  }

  // ── ARM B · ifcData.guid stability ─────────────────────────────────────────
  for (const kind of compared) {
    const divs = artefact.divergencesByKind?.[kind] ?? [];
    const guidDivs = divs.filter((d) => /\.ifcData\.guid$/.test(d.path) || /\.guid$/.test(d.path));
    if (guidDivs.length > 0) {
      findingNames.push(`${kind}: ifcData.guid re-minted on reload (${guidDivs.length})`);
      lines.push(
        `❌ ARM B ${kind}: ${guidDivs.length} guid divergence(s) — e.g. ${guidDivs[0].path} ` +
        `expected ${JSON.stringify(guidDivs[0].expected)} got ${JSON.stringify(guidDivs[0].actual)}. ` +
        'The IFC round-trip join key does not survive a save/reload.',
      );
    }
  }
  const guidClean = compared.filter((k) => !(artefact.divergencesByKind?.[k] ?? []).some((d) => /\.guid$/.test(d.path)));
  lines.push(`   ARM B: ${guidClean.length}/${compared.length} compared kinds kept their guid.`);
}

const result: GateResult = {
  gate: 'check-identity-roundtrip',
  floors,
  lines,
  findings: findingNames.length,
  // HARD-0, NO BASELINE — mandated by the plan. An element that comes back under
  // a different id is not a tolerance question: every reference to it (railings,
  // openings, room boundaries, selection, schedules, IFC joins) is already wrong.
  declared: 0,
  findingNames,
};

process.exit(reportGate(result));
