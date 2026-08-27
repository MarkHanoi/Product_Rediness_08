// @pryzm/geometry-curtain-wall — CurtainWallParameterConstraints (§CWPROPS152)
// =============================================================================
//
// THE ASK, verbatim (founder, via RAC): *"important request ... i thought that
// was in place - and it should be for all curtain walls properties; e.g: Make
// mullion size of all curtain walls in ground level to 0.06 meters / I want to
// potentially do the same for all attributes / U-Lines (columns) ... V-Lines
// (rows) ... Post Spacing (m) 1.5 / Transom Spacing (m) 5 / Mullion Size (m)
// 0.03 / Panel Thickness (m) 0.019 / and material colour / type / by level /
// by facade / all of them - by selecting one etc.."*
//
// THIS MODULE is the SETTABLE parameter vocabulary + bounds for a bulk (or
// single) curtain-wall NUMERIC parameter edit. It is consulted by
// `BulkUpdateCurtainWallParameterCommand` (`@pryzm/command-registry`) so the
// bulk path and any future single-element path validate against ONE table
// (C84 EI-9 — one answer per question).
//
// ── WHY ONLY FOUR KEYS, NOT SIX ─────────────────────────────────────────────
//
// The founder's table names SIX rows, but two of them — "U-Lines (columns)"
// and "V-Lines (rows)" — are NOT independent settable parameters. They are a
// DERIVED READOUT of the grid, computed by `migrateToGridSystem` from the
// wall's length, height and the two SPACING values. `PropertyDescriptorGenerator.ts`
// (apps/editor/src/ui/property-panel) says so directly on the fields that
// display them: *"uLineCount / vLineCount are computed readonly fields —
// derived from the CurtainGridSystem ... The actual grid lines are managed
// interactively via CurtainGridEditor."* Writing a "U-line count" would mean
// solving backwards for a spacing that yields that count on THIS wall's
// length — a different, harder ask the founder did not make; what he actually
// asked to bulk-set is the SPACING that produces them, which is exactly
// `gridXSpacing` (his "Post Spacing") and `gridYSpacing` (his "Transom
// Spacing"). So the real settable vocabulary is four fields, and the founder's
// own second list (Post Spacing / Transom Spacing / Mullion Size / Panel
// Thickness — the four with real numbers, not "legacy (…m spacing)" prose)
// confirms the same four.
//
// ── BOUNDS ARE NOT INVENTED HERE ────────────────────────────────────────────
//
// They are the SAME numbers the property panel already declares for the
// identical fields — `PropertyDescriptorGenerator.ts` (measured 2026-08-26),
// the `curtainwall` descriptor block:
//
//   gridXSpacing    ("Post Spacing")     unit m, min 0.2,   max 12
//   gridYSpacing    ("Transom Spacing")  unit m, min 0.2,   max 12
//   mullionSize     ("Mullion Size")     unit m, min 0.01,  max 0.5
//   panelThickness  ("Panel Thickness")  unit m, min 0.005, max 0.1
//
// Reusing them (rather than minting a second set) is C84 EI-1 — one number,
// one authority. `command-registry` (L1/L2) cannot import FROM `apps/editor`
// (L7) — that would be an upward import, the layer violation C84 §layers
// forbids — so the numbers are RESTATED here, in a package the command layer
// CAN import, with this comment as the pointer back to the UI source.
//
// ⚠ OPEN FOLLOW-UP (declared, not silently left). `UpdateCurtainWallCommand`
// (`packages/command-registry/src/curtainwall/UpdateCurtainWallCommand.ts`) —
// the single-element write path this bulk command composes — does NOT itself
// consult these bounds; it merges `updates` onto the record unchecked (verified
// by reading its `execute()`: no numeric-range check exists there today, only
// the grid-rederivation guard for a degenerate baseline). So a hand-edit
// through the property panel is bounded only by the NUMBER widget's own
// min/max (client-side, bypassable), and a future direct-command caller (not
// through chat) is bounded by nothing at all. This module is the bulk path's
// gate; making `UpdateCurtainWallCommand` consult it too — so EVERY caller,
// not only the bulk one, is bounded — is the natural next step and is NOT
// done in this lane (that command is mid-edit by another lane at the time of
// writing; see the bulk command's own header).
//
// ── UNIT CONVENTION ──────────────────────────────────────────────────────────
//
// All four fields are stored, and their bounds are stated, in METRES — the
// same unit the property panel declares (`unit: 'm'`). A caller with an
// explicit unit (mm/cm/m) converts to metres before calling
// `checkCurtainWallParameter`; a BARE number is read as METRES, matching the
// schema's own native unit and the founder's own literal examples ("set post
// spacing to 1.2", "change panel thickness ... to 0.024" — both bare, both
// meant in metres, both legal values under the bounds below).
//
// The TIGHT bounds here are the deliberate safety net against a unit mistake:
// a millimetre-scale value typed without its unit ("set mullion size to 30")
// reads as 30 m and is REFUSED BY NAME against the 0.01–0.5 m bound — never
// silently applied as the 100× geometry error the founder named as the
// specific risk of a unit misread on a mullion.

/** The four curtain-wall parameters this bulk path may write. A CLOSED set —
 *  an unknown key refuses NAMING every real one (see
 *  `unknownCurtainWallParameterRefusal`), never a guess. */
export type CurtainWallParameterKey =
  | 'mullionSize'
  | 'panelThickness'
  | 'gridXSpacing'
  | 'gridYSpacing';

export const CURTAIN_WALL_PARAMETER_KEYS: readonly CurtainWallParameterKey[] = [
  'gridXSpacing',
  'gridYSpacing',
  'mullionSize',
  'panelThickness',
];

export interface CurtainWallParameterMeta {
  readonly key: CurtainWallParameterKey;
  /** The property-panel label, verbatim — PropertyDescriptorGenerator.ts. */
  readonly label: string;
  /** Metres. */
  readonly min: number;
  /** Metres. */
  readonly max: number;
}

export const CURTAIN_WALL_PARAMETER_META: Readonly<Record<CurtainWallParameterKey, CurtainWallParameterMeta>> =
  Object.freeze({
    gridXSpacing: Object.freeze({ key: 'gridXSpacing', label: 'Post Spacing', min: 0.2, max: 12 }),
    gridYSpacing: Object.freeze({ key: 'gridYSpacing', label: 'Transom Spacing', min: 0.2, max: 12 }),
    mullionSize: Object.freeze({ key: 'mullionSize', label: 'Mullion Size', min: 0.01, max: 0.5 }),
    panelThickness: Object.freeze({ key: 'panelThickness', label: 'Panel Thickness', min: 0.005, max: 0.1 }),
  });

export function isCurtainWallParameterKey(key: string): key is CurtainWallParameterKey {
  return Object.prototype.hasOwnProperty.call(CURTAIN_WALL_PARAMETER_META, key);
}

function fmt(n: number): string {
  // Three decimals is enough to distinguish every bound above (0.005 is the
  // tightest) without printing float noise.
  return `${Math.round(n * 1000) / 1000} m`;
}

/**
 * Validate a value for a KNOWN key. Returns the refusal message when the
 * value is out of bounds, or `null` when it is acceptable. The message always
 * states BOTH numbers — what was asked, and the bound it failed (C74 / CA-18)
 * — never a silent clamp, never a bare "invalid".
 */
export function checkCurtainWallParameter(
  key: CurtainWallParameterKey,
  value: number,
): { readonly message: string } | null {
  const meta = CURTAIN_WALL_PARAMETER_META[key];
  if (!Number.isFinite(value)) {
    return { message: `${meta.label} must be a real number — nothing was changed.` };
  }
  if (value < meta.min || value > meta.max) {
    return {
      message:
        `A ${meta.label.toLowerCase()} of ${fmt(value)} is not valid — it must be between ` +
        `${fmt(meta.min)} and ${fmt(meta.max)}. Nothing was changed.`,
    };
  }
  return null;
}

/** The refusal for an unknown parameter key — NAMES every real one, never a
 *  guess (C74 / CA-18). */
export function unknownCurtainWallParameterRefusal(key: string): string {
  const names = CURTAIN_WALL_PARAMETER_KEYS
    .map((k) => `"${k}" (${CURTAIN_WALL_PARAMETER_META[k].label})`)
    .join(', ');
  return `'${key}' is not a curtain-wall parameter I can bulk-edit. Valid values: ${names}.`;
}
