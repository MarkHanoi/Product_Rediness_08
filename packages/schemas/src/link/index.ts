/**
 * @pryzm/schemas/link — the L0 substrate for LINKED MODELS (ADR-0346, L-2900).
 *
 * A linked model is another PRYZM project's building, displayed READ-ONLY inside
 * this one and anchored on the shared parcel datum. What persists in the host is
 * the small plain {@link LinkedModelRef} record below — never the linked
 * project's elements. See C13 §3.13 for why that distinction is load-bearing and
 * not a matter of taste.
 *
 * Contents:
 *   · LinkedModelRef.ts    — the record, its id, pin, anchor and display mode
 *   · resolveLinkAnchor.ts — the pure C83 placement decision (FINE / INADVISABLE /
 *                            IMPOSSIBLE) and the ENU math behind it
 */
export * from './LinkedModelRef.js';
export * from './resolveLinkAnchor.js';
