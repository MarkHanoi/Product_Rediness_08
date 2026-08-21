// @pryzm/auto-dimension — ELEVATION strategy: the planner (PURE).
//
// §FEAT-AUTO-DIMENSION-ELEVATION-VIEWS (L-263).
//
// ═════════════════════════════════════════════════════════════════════════════
// THE ELEVATION RULE SET — written down BEFORE it was coded, as L-263 demands.
// ═════════════════════════════════════════════════════════════════════════════
// A plan auto-dimension answers "where is everything, horizontally?". An
// elevation answers a DIFFERENT question — "how HIGH is everything?" — so it has
// its own, smaller, normative rule set. There are exactly three rules. Nothing
// else is emitted, and no rule invents a number: every value is `v2 − v1` over
// two datums resolved from the model (L-127 dimensional truth).
//
//   EV-1  OVERALL BUILDING HEIGHT                          rank 1, LEFT, row 2
//         base datum → top datum. ONE segment. The top datum is whatever the
//         model actually has (`topDatumKind`: parapet / eaves / ridge / wall-top)
//         and the segment is LABELLED with it, so a height measured to the top of
//         wall can never be mistaken for a height measured to the ridge.
//
//   EV-2  FLOOR-TO-FLOOR CHAIN (and the level datums it implies)
//                                                          rank 2, LEFT, row 1
//         The storey datums sorted ascending, chained: L0→L1, L1→L2, … and a
//         FINAL segment from the topmost datum to the top datum (the parapet /
//         eaves / ridge rise). N levels ⇒ N segments. This single chain carries
//         BOTH deliverables L-263 names — "floor-to-floor heights" AND "level
//         datums" — because a chain of datums IS the datum schedule.
//
//   EV-3  TYPICAL OPENING SILL + HEAD                      rank 3, RIGHT, row k
//         For each DISTINCT (levelId, sill, head) group of openings on the
//         façade, ONE two-segment chain measured at the group's representative
//         opening:
//            EV-3a  host level datum → sill   (the SILL HEIGHT)
//            EV-3b  sill → head               (the OPENING HEIGHT; head = sill + it)
//         Grouping is not a shortcut — it is what an elevation drawing actually
//         shows. Real buildings run a typical sill and head per storey, and
//         dimensioning eight identical windows eight times is noise, not
//         documentation. Every member id of the group rides on `referenceIds`,
//         so the provenance of the "typical" is auditable.
//
// WHAT IS DELIBERATELY *NOT* HERE
//   • Horizontal setting-out of openings on the elevation. That measures the same
//     quantity the PLAN chain already measures (opening offsets along the wall),
//     and duplicating it on the elevation is redundant documentation, which the
//     plan engine's own dedupe rule exists to prevent. If it is wanted it is a
//     new rule with a founder decision behind it, not a silent addition.
//   • Anything requiring a roof RIDGE datum the model does not expose. The engine
//     accepts `topDatumKind: 'ridge'` and will label it; supplying it is the
//     executor's job, and when the executor can only see the top of wall it says
//     so (`top-datum-approximate`) rather than pretending.
//
// ═════════════════════════════════════════════════════════════════════════════
// VIEW INTENT (P7 / C09) — WHICH RULES FIRE IS A PROPERTY OF THE VIEW
// ═════════════════════════════════════════════════════════════════════════════
// L-263 §4 and L-262 both require that the dimension content of a view is INTENT,
// not a hardcoded batch step. The gate is the view's `DetailLevel` — the SHARED
// enum from `@pryzm/schemas/view/detail-level` (L-241 created it precisely so
// this could not fork). This fills the `auto-dimension × elevation × LOD` cell
// of the L-262 conformance matrix:
//
//   coarse (LOD 100)  EV-1                    "how tall is it?"       — key plan
//   medium (LOD 200)  EV-1 + EV-2             + the storey structure  — 1:100/1:200
//   fine   (LOD 300)  EV-1 + EV-2 + EV-3      + opening set-out       — 1:50 detail
//
// A view at 1:200 and a view at 1:50 therefore differ BY INTENT, not by a code
// branch at the call site.
//
// ═════════════════════════════════════════════════════════════════════════════
// PLACEMENT
// ═════════════════════════════════════════════════════════════════════════════
// Vertical dims stack sideways, away from the façade. Ranks 1–2 go LEFT of
// `hMin` (overall furthest out — the architect's convention: the biggest number
// is the outermost line); opening chains go RIGHT of `hMax`, one stack row per
// distinct group, so no two dim lines can ever share a station.
//
//   LEFT  (side −1):  lineH = hMin − base − rowIndex · spacing
//   RIGHT (side +1):  lineH = hMax + base + rowIndex · spacing
//
// The MEASURED points stay on the real geometry (the façade edge for EV-1/EV-2,
// the opening's right jamb for EV-3) and `offsetH = h − lineH` carries the dim
// line out to the stack — the same signed-offset contract the plan path already
// feeds `AnnotationGeometry2D.offset`, so the existing renderer draws the witness
// lines with no new code.
//
// PURE: no THREE, no DOM, no I/O, no RNG. Same input ⇒ byte-identical output.

import {
  DimensionStringSchema,
  type DimensionString,
} from '@pryzm/schemas/annotation/dimension';
import { DEFAULT_DETAIL_LEVEL, type DetailLevel } from '@pryzm/schemas/view/detail-level';
import type { AutoDimReport, ValidationWarning } from '../types.js';
import { withAutoDimSpan } from '../tracing.js';
import type {
  ElevAutoDimOptions,
  ElevAutoDimSnapshot,
  ElevDimRule,
  ElevDimSegment,
  ElevHDimRule,
  ElevHDimSegment,
} from './types.js';
// §FIX-ELEVATION-HORIZONTAL-CHAIN (L-283) — the TIER model is L-281's, imported rather
// than re-derived. The horizontal stack below a façade obeys the same rule as the stack
// outside a plan: rank → tier, line = footprint edge + gap·(tier+1), overall outermost.
import { tierOfRank, tierMagnitudeM } from '../tiers.js';

// ── Defaults (documented above; never magic at a call site) ─────────────────

const DEFAULT_STACK_BASE_M = 1.0;
const DEFAULT_STACK_SPACING_M = 0.8;
const DEFAULT_MIN_SEGMENT_M = 0.05;   // mirrors the plan engine's sliver threshold
const DEFAULT_SNAP_EPSILON_M = 0.001; // datum coincidence

/** Stack rows, per rule. Lower rank ⇒ further from the façade (bigger number outermost). */
const ROW_BY_RULE: Readonly<Record<'overall-height' | 'floor-to-floor', number>> = {
  'floor-to-floor': 1,
  'overall-height': 2,
};

/**
 * The normative LOD gate (P7 / C09). Exported so the L-262 conformance matrix can
 * assert against it rather than against a comment, and so a view-template test can
 * prove that a `coarse` elevation really does drop to the overall height alone.
 */
export const ELEVATION_RULES_BY_DETAIL_LEVEL: Readonly<
  Record<DetailLevel, readonly ElevDimRule[]>
> = {
  coarse: ['overall-height'],
  medium: ['overall-height', 'floor-to-floor'],
  fine:   ['overall-height', 'floor-to-floor', 'opening-sill', 'opening-head'],
};

/**
 * §FIX-ELEVATION-HORIZONTAL-CHAIN (L-283) — the HORIZONTAL rule set's LOD gate.
 *
 * The same P7/C09 gate as its vertical twin, on the axis L-263 never built. A `coarse`
 * elevation carries the façade LENGTH and nothing else; `medium`/`fine` add the station
 * chain (end distance · opening width · gap · opening width · end distance), which is the
 * single chain that answers ALL of "widths, spacing, distance to the ends" — because they
 * are not three rules, they are three consecutive intervals of one chain.
 */
export const ELEVATION_H_RULES_BY_DETAIL_LEVEL: Readonly<
  Record<DetailLevel, readonly ElevHDimRule[]>
> = {
  coarse: ['facade-overall'],
  medium: ['facade-overall', 'facade-chain'],
  fine:   ['facade-overall', 'facade-chain'],
};

/** Result of {@link planElevationAutoDimensions}. */
export interface ElevAutoDimResult {
  /**
   * The GOVERNED records (C03): schema-parsed `DimensionString`s, `orientation:
   * 'vertical'`, `autoMode: 'elevation'`. These are what persists / exports.
   */
  readonly strings: readonly DimensionString[];
  /**
   * The RESOLVED view-space geometry, index-aligned with `strings`. The elevation
   * planner resolves its own world points (unlike the plan path, which defers to
   * the geometry-kernel evaluator) because the kernel evaluator is plan-only — it
   * returns `[worldX_mm, worldZ_mm]` and has no world-Y. Every datum an elevation
   * measures is already a scalar in the snapshot, so there is nothing to resolve
   * against element geometry and nothing is lost.
   */
  readonly segments: readonly ElevDimSegment[];
  /**
   * §FIX-ELEVATION-HORIZONTAL-CHAIN (L-283) — the HORIZONTAL segments, in the same view
   * (H, V) space. A SEPARATE array rather than a mixed one with an `axis` discriminant,
   * because the executor turns them into world points by a DIFFERENT inversion (their
   * measured points share a V and vary in H; the vertical ones share an H and vary in V)
   * — and a union that both branches must narrow is a union that one branch will forget.
   */
  readonly hSegments: readonly ElevHDimSegment[];
  readonly report: AutoDimReport;
}

function monotonicIdFactory(): () => string {
  let n = 0;
  return () => `elevdim_${(++n).toString().padStart(4, '0')}`;
}

/**
 * Plan the complete, non-redundant VERTICAL dimension set for one elevation.
 *
 * Deterministic and total: never throws, never returns a value it did not measure.
 * Anything it could not dimension comes back as a `ValidationWarning`, never as a
 * silently-dropped or invented dimension.
 *
 * P8 — opens the `pryzm.autodim.elevation` span (bounded stage name; per-run
 * detail rides as attributes).
 */
export function planElevationAutoDimensions(
  snapshot: ElevAutoDimSnapshot,
  options: ElevAutoDimOptions,
): ElevAutoDimResult {
  return withAutoDimSpan('elevation', (span): ElevAutoDimResult => {
    const idFactory = options.idFactory ?? monotonicIdFactory();
    const detailLevel = options.detailLevel ?? DEFAULT_DETAIL_LEVEL;
    const stackBase = options.stackWorldBaseM ?? DEFAULT_STACK_BASE_M;
    const stackSpacing = options.stackWorldSpacingM ?? DEFAULT_STACK_SPACING_M;
    const minSegment = options.minSegmentM ?? DEFAULT_MIN_SEGMENT_M;
    const epsilon = options.snapEpsilonM ?? DEFAULT_SNAP_EPSILON_M;

    const enabled = new Set<ElevDimRule>(ELEVATION_RULES_BY_DETAIL_LEVEL[detailLevel]);
    const warnings: ValidationWarning[] = [];
    const skipped: { id: string; reason: string }[] = [];
    const segments: ElevDimSegment[] = [];

    span.setAttribute('pryzm.autodim.detail_level', detailLevel);
    span.setAttribute('pryzm.autodim.level_count', snapshot.levels.length);
    span.setAttribute('pryzm.autodim.opening_count', snapshot.openings.length);

    // Guard the façade extent — without it there is nowhere to stand the dim lines.
    const facadeWidth = snapshot.hMax - snapshot.hMin;
    if (!Number.isFinite(facadeWidth) || facadeWidth <= epsilon) {
      warnings.push({
        code: 'degenerate-run',
        detail: `elevation façade has no horizontal extent (hMin=${snapshot.hMin}, hMax=${snapshot.hMax}) — nothing to dimension against`,
      });
      return {
        strings: [],
        segments: [],
        hSegments: [],
        report: emptyReport(snapshot, warnings, skipped),
      };
    }

    const leftLineH = (row: number): number => snapshot.hMin - stackBase - row * stackSpacing;
    const rightLineH = (row: number): number => snapshot.hMax + stackBase + row * stackSpacing;

    /** Emit one segment, or record why it was skipped. Never emits a sliver. */
    const emit = (
      rule: ElevDimRule,
      v1: number,
      v2: number,
      h: number,
      lineH: number,
      side: 1 | -1,
      rowIndex: number,
      rank: number,
      referenceIds: readonly string[],
      label?: string,
    ): void => {
      const span_ = v2 - v1;
      if (!Number.isFinite(span_) || span_ < minSegment) {
        skipped.push({
          id: referenceIds[0] ?? rule,
          reason: `${rule}: vertical span ${span_.toFixed(4)} m below minSegmentM (${minSegment} m)`,
        });
        return;
      }
      segments.push({
        id: idFactory(),
        rule,
        h,
        lineH,
        offsetH: h - lineH,
        v1,
        v2,
        valueM: span_,          // L-127: derived, always. Never a literal.
        rank,
        rowIndex,
        side,
        referenceIds,
        ...(label !== undefined ? { label } : {}),
      });
    };

    // ── EV-1 — OVERALL BUILDING HEIGHT (base datum → top datum) ──────────────
    if (enabled.has('overall-height')) {
      const row = ROW_BY_RULE['overall-height'];
      emit(
        'overall-height',
        snapshot.baseElevation,
        snapshot.topElevation,
        snapshot.hMin,
        leftLineH(row),
        -1,
        row,
        1,
        [],
        snapshot.topDatumKind,
      );
    }

    // ── EV-2 — FLOOR-TO-FLOOR CHAIN + the top rise ───────────────────────────
    const levels = [...snapshot.levels].sort((a, b) => a.elevation - b.elevation);
    if (enabled.has('floor-to-floor')) {
      if (levels.length === 0) {
        warnings.push({
          code: 'no-walls',
          detail: 'elevation has no level datums — floor-to-floor chain (EV-2) not emitted',
        });
      } else {
        const row = ROW_BY_RULE['floor-to-floor'];
        const lineH = leftLineH(row);
        for (let i = 0; i + 1 < levels.length; i++) {
          const lo = levels[i]!;
          const hi = levels[i + 1]!;
          emit(
            'floor-to-floor',
            lo.elevation,
            hi.elevation,
            snapshot.hMin,
            lineH,
            -1,
            row,
            2,
            [lo.id, hi.id],
            hi.name,
          );
        }
        // Final rise: topmost storey datum → the top datum (parapet / eaves / ridge).
        const top = levels[levels.length - 1]!;
        emit(
          'floor-to-floor',
          top.elevation,
          snapshot.topElevation,
          snapshot.hMin,
          lineH,
          -1,
          row,
          2,
          [top.id],
          snapshot.topDatumKind,
        );
      }
    }

    // ── EV-3 — TYPICAL OPENING SILL + HEAD, per distinct (level, sill, head) ──
    if (enabled.has('opening-sill') || enabled.has('opening-head')) {
      const groups = groupOpenings(snapshot, epsilon);
      let dimensionedOpenings = 0;
      let row = 0;

      for (const g of groups) {
        const level = levels.find((l) => l.id === g.levelId);
        if (!level) {
          warnings.push({
            code: 'opening-undimensioned',
            detail:
              `openings [${g.memberIds.join(', ')}] reference level '${g.levelId}' which is not in the ` +
              `elevation's level set — their sill/head cannot be measured against a datum`,
          });
          continue;
        }
        // Measure at the representative opening's RIGHT jamb, so the witness lines
        // run outward to the right-hand stack and never cross the façade.
        const h = g.hMax;
        const lineH = rightLineH(row);

        if (enabled.has('opening-sill')) {
          emit('opening-sill', level.elevation, g.sill, h, lineH, 1, row, 3, g.memberIds, 'sill');
        }
        if (enabled.has('opening-head')) {
          emit('opening-head', g.sill, g.head, h, lineH, 1, row, 3, g.memberIds, 'head');
        }
        dimensionedOpenings += g.memberIds.length;
        row++;
      }

      const undimensioned = snapshot.openings.length - dimensionedOpenings;
      if (undimensioned > 0) {
        warnings.push({
          code: 'opening-undimensioned',
          detail: `${undimensioned} opening(s) on this façade received no sill/head dimension`,
        });
      }
    }

    // ── §FIX-ELEVATION-HORIZONTAL-CHAIN (L-283) — THE OTHER CHAIN ─────────────
    //
    // Everything above measures world-Y. NOTHING measured along the façade — which is why
    // the founder's elevation had perfect sills and heads and not one width. The horizontal
    // set is planned here, in the SAME (H, V) space, and its lines stack BELOW the façade
    // so they can never cross the silhouette.
    //
    // The TIER model is L-281's, imported rather than re-derived: rank → tier (the overall
    // outermost), line = façade base − gap·(tier+1). The measured points sit ON the base
    // datum (clearance 0 — the base IS the bbox edge on that side), so `tierMagnitudeM`
    // reduces to exactly that. One placement rule for both engines.
    const hEnabled = new Set<ElevHDimRule>(ELEVATION_H_RULES_BY_DETAIL_LEVEL[detailLevel]);
    const hSegments: ElevHDimSegment[] = [];
    const tierGap = options.tierGapM ?? stackSpacing;
    const baseV = snapshot.baseElevation;
    /** The dim line for a horizontal tier: below the façade base, one gap per tier. */
    const belowLineV = (rank: number): number =>
      baseV - tierMagnitudeM(0, tierOfRank(rank), tierGap);

    const emitH = (
      rule: ElevHDimRule,
      h1: number,
      h2: number,
      rank: number,
      referenceIds: readonly string[],
      label?: string,
    ): void => {
      const value = h2 - h1;
      if (!Number.isFinite(value) || value < minSegment) {
        skipped.push({
          id: referenceIds[0] ?? rule,
          reason: `${rule}: horizontal span ${value.toFixed(4)} m below minSegmentM (${minSegment} m)`,
        });
        return;
      }
      const lineV = belowLineV(rank);
      hSegments.push({
        id: idFactory(),
        rule,
        v: baseV,
        lineV,
        offsetV: lineV - baseV,   // what you ADD to the measured point to reach the line
        h1,
        h2,
        valueM: value,            // L-127: derived, always.
        rank,
        rowIndex: tierOfRank(rank),
        side: -1,                 // below the façade
        referenceIds,
        ...(label !== undefined ? { label } : {}),
      });
    };

    // EH-1 — the whole façade length. The outermost horizontal tier.
    if (hEnabled.has('facade-overall')) {
      emitH('facade-overall', snapshot.hMin, snapshot.hMax, 1, [], 'façade');
    }

    // EH-2 — the STATION CHAIN. End distance · width · gap · width · end distance, as the
    // consecutive intervals of one ordered walk across the façade. This is why "widths",
    // "spacing" and "distance to the ends" are ONE rule and not three: they are the same
    // chain read at different pairs of stations, and planning them separately is how a
    // chain acquires gaps and overlaps.
    if (hEnabled.has('facade-chain')) {
      const ordered = [...snapshot.openings].sort((a, b) => a.hMin - b.hMin || a.hMax - b.hMax || (a.id < b.id ? -1 : 1));
      interface Station { h: number; ids: readonly string[] }
      const stations: Station[] = [{ h: snapshot.hMin, ids: [] }];
      for (const o of ordered) {
        stations.push({ h: o.hMin, ids: [o.id] });
        stations.push({ h: o.hMax, ids: [o.id] });
      }
      stations.push({ h: snapshot.hMax, ids: [] });

      for (let i = 0; i + 1 < stations.length; i++) {
        const a = stations[i]!;
        const b = stations[i + 1]!;
        const ids = [...new Set([...a.ids, ...b.ids])];
        // An interval whose two stations belong to the SAME opening is that opening's
        // WIDTH; otherwise it is a gap or an end distance. The label says which, so the
        // drawing is readable and the report is honest.
        const sameOpening = a.ids.length === 1 && b.ids.length === 1 && a.ids[0] === b.ids[0];
        const label = sameOpening ? 'width' : (a.ids.length === 0 || b.ids.length === 0 ? 'end' : 'gap');
        emitH('facade-chain', a.h, b.h, 2, ids, label);
      }
    }

    span.setAttribute('pryzm.autodim.h_string_count', hSegments.length);

    // The overall height must equal the sum of the floor-to-floor chain — the
    // classic closure check. If it does not, the model's datums disagree with its
    // envelope and the drawing would lie; say so rather than paper over it.
    const overall = segments.find((s) => s.rule === 'overall-height');
    const chain = segments.filter((s) => s.rule === 'floor-to-floor');
    if (overall && chain.length > 0) {
      const chainSum = chain.reduce((acc, s) => acc + s.valueM, 0);
      const chainBase = Math.min(...chain.map((s) => s.v1));
      // The chain starts at the LOWEST level datum, which may sit above the base
      // datum (e.g. a base datum at ground level below a raised ground floor).
      const expected = overall.valueM - (chainBase - overall.v1);
      if (Math.abs(chainSum - expected) > 0.01) {
        warnings.push({
          code: 'overall-mismatch',
          detail:
            `floor-to-floor chain sums to ${chainSum.toFixed(3)} m but the overall height above the ` +
            `lowest datum is ${expected.toFixed(3)} m — the level datums and the envelope disagree`,
        });
      }
    }

    const strings = segments.map((seg) => toDimensionString(seg, options.viewId, idFactory));

    span.setAttribute('pryzm.autodim.string_count', strings.length);
    span.setAttribute('pryzm.autodim.error_count', warnings.length);

    return {
      strings,
      segments,
      hSegments,
      report: {
        coverage: {
          wallCount: 0, // an elevation measures datums, not wall runs
          openingCount: snapshot.openings.length,
          openingsDimensioned: segments.filter((s) => s.rule === 'opening-sill').reduce(
            (acc, s) => acc + s.referenceIds.length,
            0,
          ),
          stringCount: strings.length,
          runCount: levels.length,
          // An `ElevAutoDimSnapshot` IS one façade of one building — the caller resolves
          // which walls are on it. Multi-building elevations are therefore a question for
          // the EXECUTOR's façade selection, not for this planner (see L-268 and the
          // `buildElevationSnapshot` header).
          buildingCount: 1,
          // §GA-EDITORIAL-LAYER (L-1620) — SPEC §12.3 is a PLAN concept: an elevation has
          // no enclosures and emits no interior dimensions. Zero here is a statement, not
          // a placeholder.
          roomCount: 0,
          interiorDimCount: 0,
        },
        warnings,
        skipped,
      },
    };
  });
}

// ── Internals (pure) ─────────────────────────────────────────────────────────

interface OpeningGroup {
  readonly levelId: string;
  readonly sill: number;
  readonly head: number;
  /** Representative right jamb — the outermost of the group, so witness lines clear the façade. */
  readonly hMax: number;
  readonly memberIds: readonly string[];
}

/**
 * Group openings by their DISTINCT (levelId, sill, head) triple — the "typical
 * window" an elevation actually dimensions. Deterministic: groups come back
 * sorted by (level elevation is not known here, so) levelId, then sill, then head,
 * and member ids are sorted, so the same façade always yields the same drawing.
 */
function groupOpenings(snapshot: ElevAutoDimSnapshot, epsilon: number): OpeningGroup[] {
  const quantise = (v: number): number => Math.round(v / Math.max(epsilon, 1e-6));
  const byKey = new Map<string, { levelId: string; sill: number; head: number; hMax: number; ids: string[] }>();

  for (const o of snapshot.openings) {
    if (!Number.isFinite(o.sill) || !Number.isFinite(o.head) || o.head - o.sill <= epsilon) continue;
    const key = `${o.levelId}|${quantise(o.sill)}|${quantise(o.head)}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.ids.push(o.id);
      if (o.hMax > existing.hMax) existing.hMax = o.hMax;
    } else {
      byKey.set(key, { levelId: o.levelId, sill: o.sill, head: o.head, hMax: o.hMax, ids: [o.id] });
    }
  }

  return [...byKey.values()]
    .map((g) => ({
      levelId: g.levelId,
      sill: g.sill,
      head: g.head,
      hMax: g.hMax,
      memberIds: [...g.ids].sort(),
    }))
    .sort((a, b) =>
      a.levelId < b.levelId ? -1
      : a.levelId > b.levelId ? 1
      : a.sill - b.sill || a.head - b.head,
    );
}

/**
 * Serialise a resolved segment into the GOVERNED `DimensionString` record (C03).
 *
 * References are `(elementId, anchor)` pairs, and the schema requires ≥ 2. An
 * elevation measures DATUMS, so the referenced "elements" are the levels and/or
 * openings the segment lands on — `elementId` is a branded non-empty string, so a
 * level id is a legal reference and an honest one: it names the record the value
 * came from. Where a segment has fewer than two model references (EV-1, whose
 * datums are the envelope extremes rather than two named elements) the view id is
 * used as the datum reference so the record still round-trips through Zod and
 * still names its provenance.
 */
function toDimensionString(
  seg: ElevDimSegment,
  viewId: string,
  idFactory: () => string,
): DimensionString {
  const refIds =
    seg.referenceIds.length >= 2 ? seg.referenceIds
    : seg.referenceIds.length === 1 ? [seg.referenceIds[0]!, seg.referenceIds[0]!]
    : [viewId, viewId];

  return DimensionStringSchema.parse({
    id: idFactory(),
    kind: seg.rule === 'floor-to-floor' ? 'linear-chain' : 'linear-element',
    references: [
      { elementId: refIds[0], anchor: 'bottom' },
      { elementId: refIds[1], anchor: 'top' },
    ],
    orientation: 'vertical',
    // The renderer/executor consume the SIGNED WORLD-metre offset via `segments`;
    // `offsetMm` carries the same value in mm so the persisted record is complete
    // on its own (§FIX-AUTODIM-OFFSET-WORLD-SCALE, L-155 — same convention as plan).
    offsetMm: seg.offsetH * 1000,
    viewId,
    override: null,
    ...(seg.label !== undefined ? { label: seg.label } : {}),
    isAutoGenerated: true,
    autoMode: 'elevation',
  });
}

function emptyReport(
  snapshot: ElevAutoDimSnapshot,
  warnings: readonly ValidationWarning[],
  skipped: readonly { id: string; reason: string }[],
): AutoDimReport {
  return {
    coverage: {
      wallCount: 0,
      openingCount: snapshot.openings.length,
      openingsDimensioned: 0,
      stringCount: 0,
      runCount: snapshot.levels.length,
      buildingCount: 0,
      roomCount: 0,
      interiorDimCount: 0,
    },
    warnings,
    skipped,
  };
}
