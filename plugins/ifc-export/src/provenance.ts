/**
 * PV-04 / C75 §5 — the provenance EXPORT mapping for IFC.
 *
 * Before this file, the model's `provenance` field (PV-02, on all 27 L0 element
 * kinds via `RetrofittedProvenanceSchema`) stopped at the export boundary: an
 * IFC file written by this plugin said nothing about where any value came from,
 * which is C75 §5's stated largest open risk — "provenance that stops at the
 * export boundary protects nothing downstream; it is how a generated guess ends
 * up in an IFC export as a surveyed fact."
 *
 * The mapping: one property set per exported element, named
 * {@link PROVENANCE_PSET_NAME} (vendor-prefixed `PRYZM_`, NOT `Pset_` — that
 * prefix is reserved by buildingSMART for standard psets), carrying the C75
 * record verbatim:
 *
 *   - `OriginKnown`     — boolean, ALWAYS present. C75 §1.4: unknown is a value,
 *                         not a blank cell.
 *   - `Origin`          — one of the five (`authored`/`observed`/`computed`/
 *                         `inferred`/`regenerated`), present ONLY when known.
 *                         Never invented here (§2.1): an element whose record is
 *                         unknown gets NO `Origin` property at all.
 *   - `UnknownReason`   — present ONLY when unknown; the C75 §1.4 reason.
 *   - `Detail`          — the producer, when recorded.
 *   - `ReplacedOriginKnown` / `ReplacedOrigin` / `ReplacedDetail`
 *                       — §2.7, for `regenerated` records: what was overwritten.
 *   - `RecordedAt`      — when the provenance was recorded, when present.
 *
 * An element that reaches the exporter with NO provenance record at all is the
 * §2.5 migration case: it is exported as the SAME value the L0 parse default
 * would have applied — `provenancePredatingTheField()`, i.e. unknown with
 * reason `predates-provenance` — never as a member of the five. This function
 * cannot stamp `authored` (or any origin) onto an element that lacks one; it
 * only transcribes.
 *
 * NOT DECIDED HERE (stated so absence is not inferred): whether downstream
 * readers (Revit, Solibri) surface this pset is their concern; C75 §5 leaves
 * display out of scope. The gate `check-provenance-export-boundary` measures
 * that the vocabulary crosses the boundary, not that every reader consumes it.
 */

import {
  provenancePredatingTheField,
  type ValueProvenance,
} from '@pryzm/schemas/provenance';

import type { Pset } from './types.js';

/** Vendor-prefixed pset name — `Pset_` is reserved for buildingSMART psets. */
export const PROVENANCE_PSET_NAME = 'PRYZM_ValueProvenance';

/**
 * Transcribe one element's C75 provenance record into an IFC pset payload.
 *
 * @param provenance The element's record, or `undefined` when the element
 *   reached the exporter without one (an unparsed pre-PV-02 snapshot). The
 *   absent case exports as UNKNOWN-with-reason `predates-provenance` — the
 *   identical value the L0 schema default applies — never as one of the five.
 */
export function buildProvenancePset(
  provenance: ValueProvenance | undefined,
): Pset {
  // C75 §2.5 — the default for a record that predates the field is the L0
  // default itself, not a member of the five. §2.1 and §2.5 are the same rule.
  const rec = provenance ?? provenancePredatingTheField();

  const pset: Pset = {
    OriginKnown: rec.origin !== null,
  };
  if (rec.origin !== null) {
    pset.Origin = rec.origin;
  } else {
    // §1.4 — an unknown origin carries its reason. A record that somehow has
    // neither (unparseable under ValueProvenanceSchema) still must not export
    // a blank: state that the reason itself was not recorded.
    pset.UnknownReason = rec.unknownReason ?? 'not-recorded';
  }
  if (rec.detail !== undefined) pset.Detail = rec.detail;
  if (rec.replaced !== undefined) {
    pset.ReplacedOriginKnown = rec.replaced.origin !== null;
    if (rec.replaced.origin !== null) pset.ReplacedOrigin = rec.replaced.origin;
    if (rec.replaced.detail !== undefined) pset.ReplacedDetail = rec.replaced.detail;
  }
  if (rec.recordedAt !== undefined) pset.RecordedAt = rec.recordedAt;
  return pset;
}
