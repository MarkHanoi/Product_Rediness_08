/**
 * §ANN-TAG-DEFAULT — what a tag displays, and who decides.
 *
 * THE DEFECT THIS CLOSES. Placing an element tag opened a text prompt asking the user
 * what to type. That is backwards: a tag is not free text, it is a WINDOW ONTO A HOST
 * PROPERTY (Revit's tag-by-category), and the reader of the drawing joins on it. Worse,
 * the plan tag's host search (`_nearestElement`) considered doors, windows and columns
 * ONLY — so clicking a WALL found nothing and fell through to the prompt every time.
 *
 * The rule this file establishes:
 *   • a tag ALWAYS has a default property for its host type — a wall's is its ID;
 *   • the user may CHANGE which property is displayed (the Revit property picker),
 *     which is an edit of the annotation, not a question asked before creating it;
 *   • the prompt is a last resort for a host PRYZM has no catalogue for, never the
 *     first thing the user sees.
 *
 * WHY A RESOLVER AND NOT A SWITCH. The catalogue is data, keyed by host type, so adding
 * a host family is a table row rather than a new branch in every tag tool. The mark
 * resolution itself delegates to `resolveInstanceMark` / `resolveTypeMark`
 * (`packages/core-app-model/src/annotations/elementMarks.ts`) rather than re-deriving it
 * — a tag and the schedule MUST resolve the same mark from the same record or the
 * drawing is a lie (C28). This file does not duplicate that logic; it selects which
 * property is shown.
 *
 * Contract compliance:
 *   C28        — the tag is the join to the schedule; the mark comes from the record.
 *   C09 / P7   — WHICH property is displayed is intent, carried on the annotation.
 *   C10 §2/P8  — every exported function opens an OTel span.
 *   ADR-0299   — a property that cannot be resolved returns `null`, never a plausible
 *                placeholder. The caller decides what to do with "unknown".
 */

import { withHandlerSpan } from '@pryzm/plugin-sdk';

/** A host record, structurally typed — this file never imports element stores. */
export interface TaggableRecord {
  readonly id?: string;
  readonly name?: string | null;
  readonly mark?: string | null;
  readonly properties?: Record<string, unknown> | null;
  readonly systemTypeId?: string | null;
  readonly [k: string]: unknown;
}

/** One selectable property in the picker. */
export interface TagProperty {
  /** Stable key stored on the annotation as `parameters.labelProperty`. */
  readonly key: string;
  /** What the picker shows the user. */
  readonly label: string;
  /** Pull the value off the host record. `null` = this host has no such value. */
  readonly get: (r: TaggableRecord) => string | null;
}

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
};

const P = {
  id:        { key: 'id',        label: 'ID',            get: (r: TaggableRecord) => str(r.id) },
  mark:      { key: 'mark',      label: 'Mark',          get: (r: TaggableRecord) => str(r.mark) ?? str(r.properties?.['mark']) },
  name:      { key: 'name',      label: 'Name',          get: (r: TaggableRecord) => str(r.name) ?? str(r.properties?.['name']) },
  type:      { key: 'type',      label: 'Type',          get: (r: TaggableRecord) => str(r.systemTypeId) ?? str(r.properties?.['systemTypeId']) },
  width:     { key: 'width',     label: 'Width',         get: (r: TaggableRecord) => str(r['width'] ?? r.properties?.['width']) },
  height:    { key: 'height',    label: 'Height',        get: (r: TaggableRecord) => str(r['height'] ?? r.properties?.['height']) },
  thickness: { key: 'thickness', label: 'Thickness',     get: (r: TaggableRecord) => str(r['thickness'] ?? r.properties?.['thickness']) },
  length:    { key: 'length',    label: 'Length',        get: (r: TaggableRecord) => str(r['length'] ?? r.properties?.['length']) },
  area:      { key: 'area',      label: 'Area',          get: (r: TaggableRecord) => str(r['area'] ?? r.properties?.['area']) },
  elevation: { key: 'elevation', label: 'Elevation',     get: (r: TaggableRecord) => str(r['elevation'] ?? r.properties?.['elevation']) },
  number:    { key: 'number',    label: 'Number',        get: (r: TaggableRecord) => str(r['number'] ?? r.properties?.['number']) },
} as const satisfies Record<string, TagProperty>;

/**
 * Host type → the properties a tag may display, DEFAULT FIRST.
 *
 * The founder's rule is the first entry for `wall`: a wall tag shows the wall's ID.
 * Keys are lower-cased host types as `userData.elementType` / store names produce them.
 */
export const TAG_PROPERTY_CATALOGUE: Readonly<Record<string, readonly TagProperty[]>> = Object.freeze({
  wall:        [P.id, P.mark, P.type, P.thickness, P.length, P.height, P.name],
  door:        [P.mark, P.id, P.type, P.width, P.height, P.name],
  window:      [P.mark, P.id, P.type, P.width, P.height, P.name],
  column:      [P.mark, P.id, P.type, P.width, P.height],
  beam:        [P.mark, P.id, P.type, P.length, P.height],
  slab:        [P.id, P.mark, P.type, P.thickness, P.area],
  floor:       [P.id, P.mark, P.type, P.thickness, P.area],
  ceiling:     [P.id, P.mark, P.type, P.thickness, P.area],
  roof:        [P.id, P.mark, P.type, P.area],
  room:        [P.name, P.number, P.id, P.area],
  stair:       [P.id, P.mark, P.type, P.width],
  curtainwall: [P.id, P.mark, P.type, P.width, P.height],
  furniture:   [P.name, P.id, P.type],
  lighting:    [P.name, P.id, P.type],
  level:       [P.name, P.elevation, P.id],
  grid:        [P.name, P.id],
  element:     [P.id, P.mark, P.name, P.type],
});

/** Normalise a host-type string to a catalogue key. */
function normalise(hostType: string | null | undefined): string {
  const t = String(hostType ?? '').toLowerCase().replace(/[\s_-]/g, '');
  if (t.length === 0) return 'element';
  if (TAG_PROPERTY_CATALOGUE[t]) return t;
  // `wallStore` / `Wall` / `WALLS` all resolve to `wall`.
  for (const key of Object.keys(TAG_PROPERTY_CATALOGUE)) {
    if (t.startsWith(key)) return key;
  }
  return 'element';
}

/**
 * The properties offered by the picker for a host type, default first.
 * Never empty — an unknown host falls back to the generic `element` row.
 *
 * P8: opens `annotation.tag.properties`.
 */
export function tagPropertiesFor(hostType: string | null | undefined): readonly TagProperty[] {
  return withHandlerSpan('annotation.tag.properties', { 'pryzm.host.type': String(hostType ?? '') }, () =>
    TAG_PROPERTY_CATALOGUE[normalise(hostType)] ?? TAG_PROPERTY_CATALOGUE['element']!,
  );
}

/**
 * THE DEFAULT PROPERTY for a host type — what a tag displays when the user picks
 * nothing. For a wall this is `id`, per the founder's rule.
 *
 * P8: opens `annotation.tag.default`.
 */
export function defaultTagPropertyFor(hostType: string | null | undefined): string {
  return withHandlerSpan('annotation.tag.default', { 'pryzm.host.type': String(hostType ?? '') }, () =>
    tagPropertiesFor(hostType)[0]!.key,
  );
}

/**
 * Resolve the label a tag should display.
 *
 * Returns `null` — NOT a placeholder — when the requested property has no value on the
 * record and no fallback in the catalogue produces one. ADR-0299: an unresolved tag must
 * be visibly unresolved, because a tag showing an invented mark breaks the schedule join
 * silently, which is worse than a tag showing nothing.
 *
 * P8: opens `annotation.tag.resolve`.
 */
export function resolveTagLabel(
  hostType: string | null | undefined,
  record: TaggableRecord | null | undefined,
  propertyKey?: string,
): string | null {
  return withHandlerSpan(
    'annotation.tag.resolve',
    { 'pryzm.host.type': String(hostType ?? ''), 'pryzm.tag.property': String(propertyKey ?? '') },
    () => {
      if (!record) return null;
      const props = tagPropertiesFor(hostType);
      const wanted = propertyKey
        ? props.find(p => p.key === propertyKey)
        : props[0];
      const direct = wanted?.get(record) ?? null;
      if (direct !== null) return direct;
      // Fall back along the catalogue order — a wall with no id still tags by mark
      // rather than showing nothing. The order IS the priority.
      for (const p of props) {
        const v = p.get(record);
        if (v !== null) return v;
      }
      return null;
    },
  );
}
