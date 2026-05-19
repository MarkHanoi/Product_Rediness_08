/**
 * SectionData — DTO for a section-cut annotation element.
 *
 * Sections are plan-view-visible cutting planes defined by a 2D line (a, b)
 * and a look-depth.  The `mark` string is the human-readable label (e.g.
 * "A-A", "1", "B").  The `scale` is a drawing denominator (50 → 1:50).
 *
 * Intentionally a plain interface rather than a full BaseNode-extended zod
 * schema because section cuts are annotation-class elements: they do not
 * carry parentId, childrenIds, or ifcData, and their ids are minted by the
 * CreateSectionHandler using its own monotone scheme (`section-<ts>-<seq>`).
 * A full zod schema can be layered on top in a future schema-hardening sprint.
 *
 * Governing contract: §P3.4-SE (ELEMENT-OPERATIONS-IMPL-PLAN-2026-05-17).
 * Layer rule: packages/schemas is L1 — no app or plugin imports permitted here.
 */

/**
 * 2-D endpoints + look direction for a section cut line.
 * Points are in world-XZ plan coordinates (metres); y is ignored.
 */
export interface SectionLine {
  /** Start point of the section line (world-XZ). */
  readonly a: { readonly x: number; readonly y: number };
  /** End point of the section line (world-XZ). */
  readonly b: { readonly x: number; readonly y: number };
  /**
   * How far (in metres) the section "looks" in the cut direction.
   * Must be a non-negative finite number.
   */
  readonly lookDepth: number;
}

/**
 * Full section-cut DTO stored in the `section` Immer store.
 *
 * All fields except `mark` are required because they carry the full
 * geometric + scheduling state needed to render the section symbol and
 * produce a matching drawing sheet.
 */
export interface SectionData {
  /** Stable string id — format `section-<ts36>-<seq36>` (see CreateSectionHandler). */
  readonly id: string;
  /** Human-readable mark label (e.g. "A", "1", "North Elevation"). Optional. */
  readonly mark?: string;
  /** The 2-D cut-line definition. */
  readonly line: SectionLine;
  /**
   * Drawing scale denominator.  50 means the drawing is produced at 1:50.
   * Must be a positive finite number.  Default: 50.
   */
  readonly scale: number;
  /**
   * Monotone sequence counter used for stable ordering in schedules and
   * section mark bubble numbering.  Must be a non-negative integer.
   * Default: auto-incremented by CreateSectionHandler.
   */
  readonly seq: number;
}

/**
 * The flat map store type used by all section-cut handlers.
 *
 * Keyed by `SectionData.id`.  Handlers receive `ctx.stores.section` typed
 * to this; the SectionStore class in `plugins/section-view/src/store.ts`
 * wraps it for renderer access.
 *
 * Exported from `@pryzm/schemas` so it flows through to `@pryzm/plugin-sdk`
 * without duplicating the definition in each handler file.
 */
export type SectionsState = Record<string, SectionData>;
