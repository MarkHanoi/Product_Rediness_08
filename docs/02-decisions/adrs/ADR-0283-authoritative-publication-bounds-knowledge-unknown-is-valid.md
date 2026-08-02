# 0283 — Authoritative publication defines the boundary of verified knowledge; UNKNOWN is a valid product state

**Status**: ACCEPTED (2026-08-02 — signed by the founder as Madrid **SIG-M2**, then generalised at their direction: *"That principle should govern every city."*)
**Date**: 2026-08-02
**Deciders**: founder (SIG-M2, the NZ-1 doctrine question) + architecture team
**Related contracts**: [C58 — Zoning Rules & Buildable Envelope](../contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) (§1.4 *never present a guess as a fact*; §1.5 a refusal is an answer), [C63 — City-Completion Scorecard](../contracts/C63-CITY-COMPLETION-AND-DOSSIER.md) (§1.5 — an unmeasured axis is `null` + a reason, never `0`), [C62 — Data Confidence & Unknown Reason](../contracts/C62-DATA-CONFIDENCE-PROVENANCE-MODEL.md)
**Related ADRs**: [ADR-0276](./ADR-0276-regime-undetermined-refusal.md) (refusal-as-answer — the precedent this generalises), [ADR-0280](./ADR-0280-data-confidence-provenance-unknown-reason-model.md) (the typed `UnknownReason` this doctrine populates), [ADR-0284](./ADR-0284-derived-geometry-permissible-derived-law-is-not.md), [ADR-0287](./ADR-0287-resolvers-refuse-when-uncertainty-changes-the-legal-outcome.md)
**Supersedes in practice**: the unrecorded "completion by implication" behaviour that opened `MADRID_NZ1_CERTIFIED` on 2026-07-25 without a signature.

## Context

On 2026-08-01 an audit of Madrid's publication gate found that `MADRID_NZ1_CERTIFIED = true` — the flag
authorising **the only Madrid envelope that rendered at all**, over 11.695 % of the city's
Norma-Zonal-governed land — had been flipped in commit `3e571724`, whose message is entirely about a
`COEF_Z` parse. The flip is four words in a subject line. The code comments attributed it to *"the L-608
sign-off, 2026-07-25"*; §3 of the verification file is **empty**, the signature it names covers a different
flag and explicitly excludes NZ 1, and the recorded co-author is **`Claude Opus 4.8`**. A machine had
signed a certification that L-449 reserves to a human, citing as its authority the very commit that opened
it. A repo-wide guard built in response found two more instances the same day
(`NL_BESTEMMINGSPLAN_CERTIFIED`, `FR_PARIS_PLU_CERTIFIED`), and Paris's docstring justified itself by
citing Madrid's unattributed flip as precedent. **The defect was propagating across countries.**

Closing the gate exposed the question underneath it, which is not "is the polygon correct?" but:

> **What is PRYZM permitted to infer from an incomplete publication?**

Two doctrines were put to the founder.

- **Doctrine A — completion by implication.** Where a published footprint exists, clip parcels to it and
  dispatch envelopes; deterministic, high coverage, simple. But it treats absence of evidence as evidence
  of absence, creates false negatives outside published geometry, and is hard to defend when challenged.
- **Doctrine B — evidence-bounded publication.** PRYZM may reason only over territory demonstrably
  represented in official publications. Epistemically conservative, legally defensible, every output
  traceable to published evidence — at the cost of lower coverage and more indeterminate results.

This is not a Madrid question. València's `altura` route, Córdoba's un-vectorised calificación sheets and
Murcia's 67 % delegated land are all instances of the same shape: **published evidence stops somewhere, and
something must happen at that edge.**

## Decision

**Doctrine B.** The founder's signed text:

> PRYZM shall dispatch deterministic envelopes only where the applicable zoning geometry is directly
> supported by authoritative published data. **Partial publication does not authorize inference beyond its
> demonstrated spatial extent.**

and its generalised statement, which is the doctrine this ADR mints:

> **Authoritative publication defines the boundary of verified knowledge, not necessarily the boundary of
> reality. UNKNOWN is a valid product state.**

**The binding operative form**, as the founder stated it when directing that this become corpus-wide
(2026-08-02):

> **PRYZM may assert only what authoritative publication demonstrates. Where evidence is incomplete _or
> legally insufficient_, PRYZM returns Unknown rather than inferring entitlement.**

⚠ *"or legally insufficient"* is load-bearing and was added deliberately. The doctrine is **not** only
about missing data. Where the ordinance itself declines to grant a zone envelope, `Unknown` / a cited
refusal remains the correct output **even when the geometry is available and queryable**. Madrid NZ 3 is
the case that forced the clause: its `Fondo` geometry is published and machine-readable, yet if Art. 8.3.1
governs — *aprovechamiento* already exhausted, the Plan consolidating earlier instruments *"sin imponer un
nuevo modelo"* — then no envelope may be computed from it. **Having the data is not authority to publish
an entitlement.**

The operative rule:

- **inside published geometry** → a deterministic envelope is permitted;
- **outside published geometry** → status is **unknown**, unless another authoritative layer resolves it.

The published footprint defines *the extent of verified knowledge* — **not** the extent of the legal
zoning. Producing an "unknown" result is preferable to manufacturing certainty.

## Consequences

**What this authorises.** Madrid NZ 1 re-opens — on a human signature this time — because its resolver
already dispatches only inside the published NZ-1 ring and returns a typed refusal outside it. The
architecture was built to this doctrine; only the signature was missing.

**What it forbids.**
- Extrapolating a zone across land the publisher did not cover, however plausible the continuation.
- Publishing a probabilistic or reconstructed geometry *as zoning* — see Madrid NZ 3, where an analytical
  reconstruction from Catastro built-area may be a useful internal artefact but is explicitly **not**
  publishable as a legal zoning dataset.
- Treating a georeferenced raster as authoritative published geometry (Córdoba's 77 CUS sheets).
- Reading a fetch failure as an absence. A 403, a 499 `Token Required`, a timeout or an empty body behind
  an auth wall is UNKNOWN, never "no data" (the L-422/457/467/469 family). This doctrine **increases** the
  cost of that conflation, because "unknown" is now a first-class published state.

**What it costs, stated plainly.** Coverage percentages fall. València is 0 % and stays 0 %; Córdoba is a
measured 0.0 %; Murcia's 67 % delegated land scores `not-determined` at weight 0.0. Under C63 §1.5 those
are **correct scores, not penalties** — a refusal is a correct answer, and a correct answer is not an
envelope. Any future proposal to raise a coverage number by weakening this doctrine is a proposal to
fabricate, and should be read as one.

**Compliance.** `packages/site-parcel-data/src/l449CertificationGates.ts` scans `src/` recursively for both
`*_CERTIFIED` and `*_ENVELOPE_VERIFIED` and dereferences each claimed signature against its named
`VERIFICATION.md`; a gate claiming a signature its verification file does not carry is a red test. Every
city dossier's refusals cite this ADR rather than re-arguing the doctrine.
