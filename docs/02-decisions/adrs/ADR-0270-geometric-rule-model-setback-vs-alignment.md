# ADR-0270 — The geometric rule model: setback-governed vs alignment-governed zones

- **Status:** **ACCEPTED 2026-07-20 (founder) — option (A).** P1/P2 IMPLEMENTED + tested (A1a/A1b, 87/87).
  P3 contract half DONE (C58 §1.7 amended, §1.7a added); P3 persistence half IN PROGRESS. P4/P5 open.
- **Date:** 2026-07-20
- **Tracker:** **L-443** (the conflict), **L-451** (this ADR). Inputs to **L-449** (extraction),
  **L-450** (corpus). Evidence: **L-438** (live Spain verification).
- **Contracts:** **C58 §2.2** (the rule model — extended here), **C58 §1.7** (⚠ BROKEN by this —
  see "The second conflict"), **C58 §1.3** (derivation), **C58 §1.6** (per-field provenance),
  **C58 §2.4** (`insetPolygon`), **C19 §1.4/§1.6** (parcel + mutable zoning fields), **C57**.

---

## Context

C58 §2.2 models a zone's geometry with exactly one shape:

```ts
setbacks: { front_m: number; side_m: number; rear_m: number }
```

`§2.4` then solves `insetPolygon = parcel ⊖ setbacks` (a negative buffer).

**This is correct for detached/suburban fabric and is what actually governs the founder's
Portuguese reference case** (Seixal UH2: 6 m front / 3 m side / 5 m rear). It is *not* how dense
Spanish urban fabric is regulated, and L-438 verified this against live services rather than
inferring it from planning literature:

- Madrid's PGOU publishes **`Fondo de la Edificación`** as a **POLYLINE**, plus **`Alineaciones`**.
- Spanish *ensanche* zones are governed by **alineación a vial** (the façade must sit ON the
  street alignment — not set back from it) together with **profundidad edificable** (a maximum
  buildable DEPTH measured from that alignment), with **party walls** on the side boundaries.

**These are not different numbers for the same rule. They are a different geometric operation.**

- A setback rule says *"stay at least N m away from each edge"* → erode inward from all edges.
- An alignment rule says *"your façade sits ON this line, and you may build D m back from it"* →
  project a band of depth D from a specific edge; sides are party walls (zero setback) rather
  than setbacks at all.

A model that only expresses setbacks cannot represent the second without lying. Coercing
alineación into `front_m: 0` loses *profundidad edificable* entirely and silently produces an
envelope covering the whole plot depth — **a confidently wrong buildable area on precisely the
dense urban parcels where land value is highest.**

C58 §1.4 stops us presenting a guess as a fact. C58 §1.11 stops us presenting a fact about the
wrong *thing*. **Neither stops us presenting a fact of the wrong SHAPE — this ADR closes that.**

---

## Decision (ACCEPTED — option A, founder 2026-07-20)

**Model the geometric rule as a discriminated union on rule KIND, not as optional fields added
to the existing flat setback shape.**

```ts
// L0 — packages/schemas/src/site/GeometricRule.ts  (pure Zod, per P5)
export const GeometricRule = z.discriminatedUnion('kind', [

  // Detached / suburban. TODAY'S BEHAVIOUR, unchanged — see Migration.
  z.object({
    kind:    z.literal('setback'),
    front_m: z.number().nonnegative(),
    side_m:  z.number().nonnegative(),
    rear_m:  z.number().nonnegative(),
  }),

  // Spanish ensanche / alignment-governed fabric.
  z.object({
    kind:             z.literal('alignment'),
    alignTo:          z.enum(['street', 'official-line']),
    buildableDepth_m: z.number().positive(),        // profundidad edificable
    sideTreatment:    z.enum(['party-wall', 'setback']),
    side_m:           z.number().nonnegative().optional(),  // required iff sideTreatment==='setback'
    rear_m:           z.number().nonnegative().optional(),  // patio de manzana, where imposed
  }),

  // The PGOU publishes the buildable area directly as geometry (Madrid's Fondo polyline).
  // Not a fallback — when the document IS the polygon, transcribing it into parameters is a
  // lossy re-derivation of something already authoritative.
  z.object({
    kind:    z.literal('explicit-area'),
    ringRef: z.string(),   // resolved from the curated pack, never inlined geometry
  }),
]);
```

### Why a discriminated union rather than optional fields

1. **The solver must branch on kind.** Erode-from-all-edges and project-a-band-from-one-edge are
   different operations. Optional fields would force `if (front_m != null)` guesswork at the one
   place that must be unambiguous.
2. **It makes illegal states unrepresentable.** A zone cannot simultaneously have a front setback
   and a street alignment. The union enforces that; optional fields permit the contradiction and
   defer the failure to runtime — on a compliance number.
3. **It extends per jurisdiction without touching shipped packs.** A future `build-to-line` or
   `envelope-curve` kind is an added variant, not a migration of every existing pack.
4. **Zod discriminated unions give exhaustive TS switches.** Adding a kind without handling it in
   the solver becomes a COMPILE error, not a silently-skipped rule. On compliance geometry that
   distinction is the whole point.

### Follows existing patterns, introduces none

- Schema is **L0, pure Zod** (P5) — mirrors `SiteLocation.ts`.
- Solver stays **pure L2** in `packages/site-parcel-data/` (C58 §1.9) — no THREE, no DOM, no I/O.
- Result still reaches the model **only** via `site.updateZoning` (C58 §1.7 / P6) — no new
  command, no direct store write.
- Per-field provenance (C58 §1.6) and `DerivationTrace` (C58 §1.3) apply **unchanged**: each
  variant's numeric fields carry their own `published-structured | ordinance-pdf | estimated`.
- Rule packs stay curated + versioned, mirroring `rules/programRules.ts`.

---

## ⚠ The second conflict — C58 §1.7 CANNOT SURVIVE THIS UNAMENDED

**Flagged, not resolved. This needs the same human decision as L-443 itself.**

C58 §1.7 states the envelope's numeric results map **1:1** onto C19's mutable parcel fields
`setbacks.{front,side,rear}` and that C58 introduces **no new persisted output schema**.

**An `alignment` rule has no such mapping.** There is no triple of front/side/rear that encodes
"façade on the street line, 12 m of buildable depth, party walls at the sides". Writing one
would be exactly the lossy coercion this ADR exists to prevent — and it would be *invisible*,
because the stored numbers would look perfectly well-formed.

Two ways out; **(A) is recommended:**

**(A) The INSET POLYGON becomes the persisted truth; the three numbers become a derived,
explicitly-lossy summary.** C58 §2.4 already computes `insetPolygon`, and §1.8 already threads
*the polygon* — not the numbers — into generation. So the polygon is already the load-bearing
artefact; §1.7 simply has not caught up. Requires amending §1.7 and adding a nullable buildable-
ring field to C19's mutable zoning fields (C19 §1.6). Front/side/rear remain for display and for
`setback` zones, and MUST be `null` — never fabricated — for `alignment` zones.

**(B) Store equivalent effective setbacks.** Cheaper, no C19 change. **Not recommended:** it is
lossy by construction, and the loss is silent and unrecoverable — the exact failure mode C58
§1.4/§1.11 were both written to prevent, recurring a third time in a third disguise.

---

## Fast fix vs correct fix (they differ, and the fast one is disqualified)

**Fast:** add `buildableDepth_m?: number` to the existing setback object and special-case it in
the solver. One file, no migration.
**Why it is not recommended:** it reintroduces the contradiction the union removes, leaves the
solver branching on field presence, and — because §1.7 still maps to three numbers — silently
discards depth on persistence. It would make the September demo look correct while storing wrong
data for 318 municipalities, which then has to be re-curated **by hand**.

**This change spans three layers and that is stated up front, not scoped down to the symptom:**
L0 schema (new union) → L2 solver (branch per kind) → C19 mutable fields (persist the ring) →
plus the UI's "Why these numbers?" panel, which must render an alignment rule *as* an alignment
rule rather than as three setbacks.

---

## Consequences

**Positive.** Spanish *ensanche* becomes representable, so L-449 extraction has somewhere correct
to land. The union is the natural extraction target — an LLM reading a PGOU picks a KIND, which
is a far better-posed task than filling three numbers that may not apply. Adding a jurisdiction's
rule form becomes additive. Illegal combinations stop compiling.

**Negative.** A schema migration on a shipped contract; every existing pack must declare
`kind: 'setback'` (mechanical, see Migration). C19 gains a persisted ring under option (A). The
solver grows a second geometric path that needs its own byte-determinism tests (C58 §1.1).

**Migration.** Existing packs are all implicitly `setback`. A Zod `.transform()` on read stamps
`kind: 'setback'` when absent, so **no shipped pack breaks and no data is rewritten**. The
default is safe precisely because it is today's only behaviour.

---

## Implementation phases (each independently verifiable — do not merge phases)

| Phase | Scope | Done when |
|---|---|---|
| **P1** | L0 `GeometricRule` union + back-compat `.transform()` | Zod round-trip tests, incl. legacy packs with no `kind` |
| **P2** | L2 solver branches on kind; `alignment` → project depth band from the aligned edge | Byte-determinism tests per kind (C58 §1.1); an alignment zone yields a DEPTH-limited ring, not a whole-plot ring |
| **P3** | **DECISION-GATED (A vs B).** Persist the ring; §1.7 amended; front/side/rear NULL for alignment | Round-trips close+reopen (cf. L-188); no fabricated setbacks anywhere |
| **P4** | "Why these numbers?" renders alignment as alignment; `DerivationTrace` per variant | Panel shows *alineación + profundidad*, never three invented setbacks |
| **P5** | Barcelona *ensanche* pilot pack, hand-curated, per-field provenance | One real zone produces a correct depth-limited envelope end-to-end |

**P1 and P2 are safe to build now** — they are additive and change no persisted data. **P3 is
blocked on the §1.7 decision above.**

---

## Status

**ACCEPTED 2026-07-20 (founder) — option (A).** See the header for the authoritative phase state.

> **⚠ This section previously read "PROPOSED. Not accepted. No code written. No contract set
> ACTIVE."** That was correct when written and became false on acceptance the same day: the
> header was updated, this trailing section was not, and ~15 source files implement the decision.
> **A reader landing at the bottom of the file got the exact opposite answer from one landing at
> the top** — and on an ADR the bottom is where people look for status. Corrected in place per
> C01 Discipline Rule 1 (edit the canonical doc; never fork a derivative). The original wording is
> quoted here rather than deleted, because the point of an immutable record is that you can see
> what it used to say.
>
> The §1.7 conflict this section refers to WAS resolved — by the founder, as option (A), which is
> what the header records and what C58 §1.7a now encodes.

**Superseded in part by [ADR-0271](./ADR-0271-block-derived-buildable-depth.md):** this ADR's
`alignment` variant carries a SCALAR `buildableDepth_m`, which cannot express the Barcelona
Eixample, where PGM Art. 242.2 states a CONSTRUCTION rather than a number. ADR-0271 adds a fourth
variant for that case. Nothing here is retracted — the gap is in reach, not in correctness.
