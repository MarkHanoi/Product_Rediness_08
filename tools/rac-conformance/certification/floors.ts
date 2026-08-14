// ─── §C10 FLOORS — the run must be UNABLE to print a pass when it is broken ──
//
// This is the load-bearing half of criterion C10 in
// docs/03-execution/plans/BIM20-ACCEPTANCE-10-OF-10.md:
//
//     "**Emptiness is never a pass.** Any harness that cannot establish its
//      subject exits MISCONFIGURED (2) and scores FAIL. A comparator reporting
//      '0 divergences' must also report how many objects it compared."
//
// The certification harness ALREADY honours that rule *inside* one row —
// `persist:opening` reports `MISCONFIGURED for this kind` instead of "clean",
// because its seed succeeded while its store stayed empty. The hole this module
// closes is the level ABOVE the row: the SUITE, and the ARTEFACT the suite
// writes.
//
// THREE WAYS A BROKEN RUN COULD PREVIOUSLY PRINT A PASS. All three are closed here:
//
//   1. THE SEED IS EMPTY. Every kind fails to seed, every capture holds 0
//      records, every comparator honestly reports "nothing to compare", and the
//      report prints a table of UNPROVEN rows with 0 FAILED. A reader — or a CI
//      badge — sees zero failures. `minRecords` / `minSeededKinds` make that
//      exit 2. This is the deliberate breakage proven in §Proof below.
//
//   2. THE SUITE CRASHES AND THE ARTEFACT IS STALE. `results/*.json` is written
//      in `afterAll`. A suite that dies in `beforeAll` writes nothing — and the
//      PREVIOUS run's file is still sitting on disk, green as ever, ready for
//      `generate-report.ts` to publish. `minGeneratedAt` (a freshness stamp taken
//      before the runner spawns vitest) makes a stale artefact exit 2.
//
//   3. THE MEASUREMENT NEVER RAN. `serializeError` / `loadError` are non-empty,
//      so every persistence verdict is the honest string "UNPROVEN — serializer
//      unreachable headlessly" — and again the FAILED tally is 0. `requireRan`
//      makes a suite whose subject never executed exit 2.
//
// FLOORS ARE NOT TARGETS. Each floor sits BELOW the measured reading it guards,
// far enough that ordinary drift does not trip it and close enough that a
// collapse does. They are stated with the measurement they were derived from, so
// that raising one to make something pass is visibly a lie rather than a tuning
// choice.

export interface SuiteFloors {
  file: string;
  /** minimum rows the suite must emit */
  minRows: number;
  /** minimum element records the EXPECTED capture must hold (persistence only) */
  minRecords: number;
  /** minimum kinds/capabilities whose subject was actually established */
  minEstablished: number;
  /** fields that must be free of an error string for the run to count as executed */
  requireRan: string[];
}

/**
 * Measured 2026-08-11 on a clean `npx vitest run __tests__/*.cert.ts`:
 *   persistence — 18 rows · 18/18 kinds SEEDED · 19 records captured · 6/6 mutations DISPATCHED OK
 *   undoredo    — 16 rows · 16/16 dispatched · 15 undo entries armed · 9 seed lines OK
 * The floors below are those readings minus a deliberate margin.
 */
export const SUITE_FLOORS: Record<string, SuiteFloors> = {
  persistence: {
    file: 'persistence.json',
    // 19 rows measured (18 kinds + the CE-03 IndexedDB round-trip arm,
    // 2026-08-14). The row set is a literal list in the suite, so a drop
    // means rows were deleted, never that the model got smaller.
    minRows: 19,
    // 19 records measured across 18 kinds. 12 leaves the seed room to lose a
    // few kinds to an unrelated regression without disarming the whole gate,
    // while an EMPTY seed (0) can never satisfy it.
    minRecords: 12,
    // 18/18 kinds SEEDED measured.
    minEstablished: 14,
    requireRan: ['serializeError', 'loadError'],
  },
  undoredo: {
    file: 'undoredo.json',
    // 18 rows measured (16 CASES + the two CE-04 unified-path arms,
    // 2026-08-14). Literal list — a drop means rows were deleted.
    minRows: 18,
    // undo/redo rows are capability rows, not record rows: the record floor is
    // carried by the seed-log check below instead.
    minRecords: 0,
    // 16/16 dispatched measured; a capability that never dispatched has no
    // undo verdict worth reading.
    minEstablished: 12,
    requireRan: [],
  },
};

export interface FloorReading {
  what: string;
  measured: number;
  min: number;
}

export interface SuiteArtefact {
  harness?: string;
  generatedAt?: string;
  rows?: Array<{ status?: string; evidence?: string[] }>;
  seedOutcomes?: Record<string, string>;
  seedLog?: string[];
  [k: string]: unknown;
}

/** Sum the `key=<n>` evidence tag across every row. */
function sumEvidence(rows: Array<{ evidence?: string[] }>, key: string): number {
  let n = 0;
  for (const r of rows) {
    for (const e of r.evidence ?? []) {
      const m = new RegExp('^' + key + '=(\\d+)$').exec(e);
      if (m) n += Number(m[1]);
    }
  }
  return n;
}

/** Count rows carrying an exact evidence tag. */
function countEvidence(rows: Array<{ evidence?: string[] }>, tag: string): number {
  return rows.filter((r) => (r.evidence ?? []).includes(tag)).length;
}

/**
 * Evaluate one suite artefact against its floors.
 *
 * `notBefore` is the runner's start stamp. An artefact older than it is STALE —
 * i.e. the suite did not write it on THIS run — and a stale artefact is treated
 * exactly like a missing one, because reading last week's green file is the most
 * plausible way a broken run prints a pass.
 */
export function readFloors(
  suite: 'persistence' | 'undoredo',
  artefact: SuiteArtefact | null,
  notBefore: number,
): { floors: FloorReading[]; notes: string[] } {
  const spec = SUITE_FLOORS[suite];
  const notes: string[] = [];
  const floors: FloorReading[] = [];

  if (!artefact) {
    floors.push({ what: `${spec.file} exists`, measured: 0, min: 1 });
    notes.push(`${spec.file} is ABSENT — the suite wrote no artefact on this run.`);
    return { floors, notes };
  }

  const gen = Date.parse(artefact.generatedAt ?? '');
  const fresh = Number.isFinite(gen) && gen >= notBefore;
  floors.push({ what: `${spec.file} written by THIS run (freshness)`, measured: fresh ? 1 : 0, min: 1 });
  if (!fresh) {
    notes.push(
      `${spec.file} generatedAt=${artefact.generatedAt ?? '(none)'} predates this run's start ` +
      `(${new Date(notBefore).toISOString()}) — STALE artefact. The suite crashed before afterAll, ` +
      'and the file on disk is a previous run. Grading it would be grading the past.',
    );
  }

  const rows = artefact.rows ?? [];
  floors.push({ what: 'rows emitted', measured: rows.length, min: spec.minRows });

  if (suite === 'persistence') {
    const records = sumEvidence(rows, 'expectedRecords');
    floors.push({ what: 'element records in the EXPECTED capture', measured: records, min: spec.minRecords });
    const seeded = Object.values(artefact.seedOutcomes ?? {}).filter((v) => v.startsWith('SEEDED')).length;
    floors.push({ what: 'kinds whose subject was established (SEEDED)', measured: seeded, min: spec.minEstablished });
    for (const f of spec.requireRan) {
      const err = String((artefact as Record<string, unknown>)[f] ?? '');
      floors.push({ what: `${f} is empty (the measured path actually executed)`, measured: err ? 0 : 1, min: 1 });
      if (err) notes.push(`${f}=${err.slice(0, 200)} — the round-trip never ran, so every "0 divergences" is vacuous.`);
    }
  } else {
    const dispatched = countEvidence(rows, 'dispatch=OK');
    floors.push({ what: 'capabilities that actually dispatched', measured: dispatched, min: spec.minEstablished });
    const armed = sumEvidence(rows, 'entriesAdded');
    // 15 measured. A run in which NOTHING armed an undo entry has not exercised
    // the undo stack at all, whatever its rows say.
    floors.push({ what: 'undo entries armed across the run', measured: armed, min: 5 });
    const seedLines = (artefact.seedLog ?? []).filter((l) => /OK$/.test(l)).length;
    floors.push({ what: 'seed lines that reported OK', measured: seedLines, min: 6 });
  }

  return { floors, notes };
}
