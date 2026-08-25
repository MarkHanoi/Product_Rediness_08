/**
 * §OUTLINE82 — THE DECLARED ABSENCE OF AN OPENING'S PROFILE IN IFC (SPEC-WINDOW-CUSTOM-OUTLINE D9).
 *
 * An `IfcWindow` / `IfcDoor` leaves this exporter as a BOX — `buildBoxRepresentation`, an
 * `IfcRectangleProfileDef` swept through the leaf thickness. That was always true, and for an
 * arched or circular opening it has always been a rectangle silhouette standing in for a curve.
 * ⛔ Until now it was a SILENT one: nothing in the file said the shape had been dropped.
 *
 * C25 §1.9 rules that a wrong number is worse than a missing one, and a rectangle labelled as
 * nothing in particular is a wrong SHAPE read as a measurement by every downstream viewer. So
 * this module turns the silence into a NAMED absence, the way the exporter already writes
 * descriptive text — the entity's own `Description` attribute — rather than by inventing a
 * property: `Pset_WindowCommon` / `Pset_DoorCommon` carry no shape property, and §1.9 rule 2
 * forbids emitting a Pset property no real field backs.
 *
 * What is NOT done here, by name: no `IfcArbitraryClosedProfileDef` from the ring. A faithful
 * profile representation is real work on the geometry writer and is recorded as the gap
 * (C25 §2 row, ISSUE-LOG §OUTLINE82); a half-faithful one would be the fake this declaration exists
 * to replace.
 *
 * §OUTLINE80 — the `custom` kind and its `customOutline` carrier are read by STRING, never by an
 * imported symbol, so this file compiles before and after that lane lands and never re-derives a
 * ring (C86 §10.1 PR-1).
 */

/** What the record says its void shape is. `rectangular` ⇒ nothing to declare. */
export interface OpeningProfileDeclaration {
  /** The profile kind as recorded (`round-arch`, `segmental-arch`, `circular`, `custom`, …). */
  readonly kind: string;
  /** For `custom`: the ring's vertex count. `null` for every other kind. */
  readonly vertexCount: number | null;
  /** The text written into the entity's `Description`. ASCII only — STEP strings stay legible. */
  readonly text: string;
}

const RECTANGULAR = 'rectangular';

function readProfile(record: unknown): string | null {
  if (!record || typeof record !== 'object') return null;
  const v = (record as { openingProfile?: unknown }).openingProfile;
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function readVertexCount(record: unknown): number | null {
  if (!record || typeof record !== 'object') return null;
  const ring = (record as { customOutline?: unknown }).customOutline;
  if (!ring || typeof ring !== 'object') return null;
  const verts = (ring as { vertices?: unknown }).vertices;
  return Array.isArray(verts) ? verts.length : null;
}

/**
 * The host wall's `openings[]` row for a hosted element — the record the void's shape belongs to
 * (C15 §3.1). `undefined` when the wall list is absent or carries no row for the element; a
 * missing row is never read as "rectangular" here, the element record is consulted next.
 */
export function hostOpeningOf(
  walls: ReadonlyArray<{ id: string; openings?: ReadonlyArray<{ elementId?: string }> }> | undefined,
  wallId: string | undefined,
  elementId: string,
): unknown {
  if (!walls || !wallId) return undefined;
  const wall = walls.find((w) => w.id === wallId);
  return wall?.openings?.find((o) => o.elementId === elementId);
}

/**
 * Declare the profile the exported box does NOT represent.
 *
 * The shape is read from the HOST opening first (the void's record), then from the element
 * record (the C15 §8.1 dual write). Returns `null` for a rectangular or unrecorded profile —
 * there the box IS the shape and there is nothing to declare.
 */
export function declareOpeningProfile(
  element: unknown,
  hostOpening: unknown,
  bbox: { width: number; height: number },
): OpeningProfileDeclaration | null {
  const kind = readProfile(hostOpening) ?? readProfile(element);
  if (kind === null || kind === RECTANGULAR) return null;
  const vertexCount = kind === 'custom'
    ? (readVertexCount(hostOpening) ?? readVertexCount(element))
    : null;
  const shape = vertexCount !== null ? `${kind} (${vertexCount} vertices)` : kind;
  const text =
    `PRYZM opening profile: ${shape}. Shape NOT represented in this file: ` +
    `the bounding-box rectangle ${bbox.width} x ${bbox.height} m is exported in its place ` +
    `(C25 s1.9 declared absence; C86 s10.1).`;
  return { kind, vertexCount, text };
}

/**
 * The entity `Description`: the meta-store's own text, then the declaration, joined so neither
 * is lost. `undefined` when there is nothing to write — the attribute stays `$`, as before.
 */
export function composeDescription(
  metaDescription: string | undefined,
  declaration: OpeningProfileDeclaration | null,
): string | undefined {
  if (!declaration) return metaDescription || undefined;
  return metaDescription ? `${metaDescription} | ${declaration.text}` : declaration.text;
}
