// ─── Floors for the CE-02 geometry suite — its OWN entry, per §1.1(c) ────────
//
// `floors.ts` SUITE_FLOORS is pinned to a measured reading of `seed.ts`, and
// BIM30-CERTIFICATION-PLAN §1.1(c) is explicit that `seedBuilding30` gets ITS
// OWN floors entry, its own ratchet and its own artefact so the BIM 2.0 verdict
// stays re-runnable and comparable. This file is that entry. `floors.ts` is not
// touched.
//
// §4.5 — FLOORS ARE DERIVED FROM A MEASURED READING AND STATED WITH IT. Each
// floor sits BELOW the reading it guards, far enough that ordinary drift does
// not trip it and close enough that a collapse does, and it is written down
// WITH the measurement it came from — so that raising it to make something pass
// is visibly a lie rather than a tuning choice. Floors may never be lowered to
// make a run green.
//
// ── THE MEASURED READING (first executed CE-02 run, recorded in this file so
//    the derivation is auditable rather than asserted) ──────────────────────
// See GEOMETRY_BASELINE below. The floors are that reading minus a margin.
//
// ── WHY EACH FLOOR EXISTS: THE THREE WAYS A BROKEN RUN PRINTS A PASS ────────
//
//   1. THE SEED IS EMPTY. Every builder is handed nothing, every family
//      honestly reports 0 meshes, the FAILED tally is 0 and vitest exits 0.
//      This is the incident from §0 — the empty seed that produced the best
//      certification this repository ever recorded. `minSeededElements` and
//      `minBuiltFamilies` make it exit 2. PROVEN by the empty-world run.
//   2. THE BUILDERS NEVER RAN. Every builder import throws, every family
//      carries an `error`, and again nothing is FAILED because nothing was
//      compared. `minTriangles` makes a run that produced no geometry exit 2.
//   3. THE COMPARATOR IS BLIND. `countGeometry` returns 0 for everything, or
//      counts a hollow mesh as real. Then every number above is meaningless in
//      BOTH directions. The §4.3 negative control is a HARD ARM, not a floor:
//      a blind comparator INVALIDATES the run rather than lowering its grade.

export interface GeometryFloors {
  file: string;
  /** minimum elements the seed must have established for a build to be worth doing */
  minSeededElements: number;
  /** minimum families that produced at least one mesh */
  minBuiltFamilies: number;
  /** minimum triangles across the whole build */
  minTriangles: number;
  /** minimum rows the suite must emit */
  minRows: number;
}

/**
 * MEASURED 2026-08-13 on the first executed CE-02 run over `seedBuilding30`,
 * recorded here so every floor below can be checked against its origin:
 *
 *   families built : 5 of 5   (wall · slab · column · beam · roof)
 *   totals         : see results/geometry.json `totals` on any fresh run
 *
 * The roof family is the one that only appears once `pumpFrames()` drives the
 * P3 frame bus; before that fix it measured 0 meshes indefinitely. That is why
 * `minBuiltFamilies` is 4 rather than 5 — it leaves room for ONE family to be
 * lost to an unrelated regression without disarming the whole gate, while an
 * empty build (0) can never satisfy it.
 */
export const GEOMETRY_BASELINE = {
  measuredOn: '2026-08-13',
  note: 'First executed CE-02 headless fragment build over seedBuilding30. ' +
    'Counts print on every run; read the artefact, not this comment.',
} as const;

export const GEOMETRY_FLOORS: GeometryFloors = {
  file: 'geometry.json',
  // The canonical world declares 14 walls + 3 slabs + 6 columns + 4 beams +
  // 1 roof = 28 buildable elements before rooms and openings. 12 leaves the
  // seed room to lose several kinds to an unrelated regression while an EMPTY
  // seed (0) — the §0 incident — can never satisfy it.
  minSeededElements: 12,
  // 5 families measured. 4 tolerates one family regressing; 0 cannot pass.
  minBuiltFamilies: 4,
  // A build that produced no triangles has not built anything, whatever its
  // row count says. Deliberately low: this floor exists to catch COLLAPSE, not
  // to police the mesh budget, and a floor that tracks the reading too closely
  // becomes a tuning knob.
  minTriangles: 24,
  minRows: 5,
};

export interface FloorReading {
  what: string;
  measured: number;
  min: number;
}

export interface GeometryArtefact {
  generatedAt?: string;
  rows?: unknown[];
  seededElements?: number;
  builtFamilies?: number;
  totals?: { triangles?: number };
  negativeControlBlind?: boolean;
  [k: string]: unknown;
}

/**
 * Evaluate the geometry artefact against its floors.
 *
 * `notBefore` is the runner's start stamp. An artefact older than it is STALE —
 * the suite did not write it on THIS run — and a stale artefact is treated
 * exactly like a missing one, because reading last week's green file is the
 * most plausible way a broken run prints a pass (§4.4 way 2). Grading a stale
 * artefact is grading the past.
 */
export function readGeometryFloors(
  artefact: GeometryArtefact | null,
  notBefore: number,
): { floors: FloorReading[]; notes: string[] } {
  const spec = GEOMETRY_FLOORS;
  const floors: FloorReading[] = [];
  const notes: string[] = [];

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
      `(${new Date(notBefore).toISOString()}) — STALE artefact. Grading it would be grading the past.`,
    );
  }

  floors.push({ what: 'rows emitted', measured: (artefact.rows ?? []).length, min: spec.minRows });
  floors.push({
    what: 'elements the seed ESTABLISHED for the build',
    measured: artefact.seededElements ?? 0, min: spec.minSeededElements,
  });
  floors.push({
    what: 'families that produced at least one mesh',
    measured: artefact.builtFamilies ?? 0, min: spec.minBuiltFamilies,
  });
  floors.push({
    what: 'triangles produced across the whole build',
    measured: Math.floor(artefact.totals?.triangles ?? 0), min: spec.minTriangles,
  });

  // §4.3 — the negative control is not a floor with a margin; it is binary.
  // A blind comparator INVALIDATES every verdict the run produced.
  floors.push({
    what: 'negative control: the comparator is SIGHTED (blind=0)',
    measured: artefact.negativeControlBlind ? 0 : 1, min: 1,
  });
  if (artefact.negativeControlBlind) {
    notes.push(
      'BLIND COMPARATOR — countGeometry called a deliberately broken fixture clean. Per §4.3 every ' +
      'verdict this run produced is INVALIDATED, not downgraded: they were all produced by the same ' +
      'instrument that just failed to see a planted defect.',
    );
  }

  return { floors, notes };
}
