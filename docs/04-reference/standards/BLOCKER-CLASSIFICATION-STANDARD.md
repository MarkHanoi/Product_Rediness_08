# BLOCKER CLASSIFICATION STANDARD

**Status**: BINDING (founder standing rule, 2026-08-02)
**Applies to**: every `CLOSURE-REGISTER.md`, `NEXT.md`, `RISK-REGISTER.md` and measurements record in
`docs/04-reference/jurisdictions/**`, and to any blocker reported by an agent.
**Related**: [ADR-0283](../../02-decisions/adrs/ADR-0283-authoritative-publication-bounds-knowledge-unknown-is-valid.md) · [ADR-0284](../../02-decisions/adrs/ADR-0284-derived-geometry-permissible-derived-law-is-not.md) · [ADR-0285](../../02-decisions/adrs/ADR-0285-computing-an-observable-criterion-is-implementation.md) · [ADR-0286](../../02-decisions/adrs/ADR-0286-every-derived-value-exposes-legal-computational-source-and-tier.md) · [ADR-0287](../../02-decisions/adrs/ADR-0287-resolvers-refuse-when-uncertainty-changes-the-legal-outcome.md) · [PROBE-DISCIPLINE.md](./PROBE-DISCIPLINE.md) · [C63](../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md)

## Why this exists

The founder's directive, 2026-08-02:

> *"From this point onward, require every blocker to be classified as one of: **Legal · Engineering · Data
> acquisition · External authority**. Each blocker should have exactly **one owner** and exactly **one exit
> criterion**. No blocker should migrate between categories without explicit evidence. That discipline will
> prevent effort from drifting back into solved questions and keep the remaining work focused on the few
> true critical paths."*

Every one of these failure modes has already happened here, in a single week:

- **Effort spent on the wrong category.** Madrid's NZ 3 was being worked as a *data* problem while the
  governing question was *legal* — Art. 8.3.1 may refuse a zone envelope outright, in which case no amount
  of published geometry helps. Engineering froze only once the categories were separated.
- **A blocker that silently migrated.** València's *profundidad edificable* was recorded as **Data
  acquisition** ("Plano C is unpublished — an institution, a fee, an unknown timeline"). Measurement showed
  the depth is drawn in the published Layer 212 movement geometry, so the category was wrong, not just the
  estimate. It is now CLOSED and must not migrate back.
- **A ceiling asserted from a sample.** Córdoba's cadastral dissolve was recorded as a P1 **Engineering**
  ceiling on the strength of a **three-block sample** that had reached shipped code. Measured at scale:
  76.9 % / 88.5 %. The blocker did not exist.
- **A stale blocker inherited across cities.** "The C63 tier vocabulary does not exist in code" propagated
  into three city registers as a P0 and was false in all three; the ruler existed and one city had already
  scored through it.
- **Analysis paralysis.** Córdoba's machine-readable search is explicitly one-shot precisely because an
  open-ended search has no exit criterion.

## The four categories

Exactly one applies. If two seem to, the blocker is really two blockers — split it.

| Category | Means | Exit looks like | Who can close it |
|---|---|---|---|
| **Legal** | The governing instrument's meaning is unresolved, or it may prohibit the thing we want to build. | A verbatim reading of the primary source, with article and page, stating which provision governs. | A planning-literate human, or a signature |
| **Engineering** | We know what to build and are permitted to build it; it is not built. | The code ships, tested, with the measured effect reported. | Us. No external dependency |
| **Data acquisition** | The information exists somewhere but we do not hold it in machine-readable form. | The dataset is obtained and bound — or an exhausted search concludes it does not exist. | Us, plus possibly a publisher |
| **External authority** | Only a third party can resolve it: a definition, credentials, a signature, a licence. | Their written answer arrives, or is refused. | Not us |

## The rules

1. **One category.** Recorded explicitly on the blocker row.
2. **One owner.** A named party, not a team. *"The founder (SIG-M1)"*, *"the Murcia agent"*,
   *"Ajuntament de València, Urbanismo"*. `unassigned` is a defect.
3. **One exit criterion**, written so that a third party can tell whether it has been met. *"Investigate
   further"* is not an exit criterion. *"A written municipal definition of layer 212's `altura` that also
   reconciles the −2 gap"* is.
4. **No migration without explicit evidence.** Changing a blocker's category is a claim, and it carries the
   same burden as any other: cited, dated, inspectable. Record the old category and why it was wrong.
5. **Failure ≠ empty.** A 403, a 499 `Token Required`, a timeout, an empty body behind an auth wall is
   **UNKNOWN**, never "no data" (L-422/457/467/469). A blocker resting on a probe must carry that probe's
   URL, status, content-type and byte count — see PROBE-DISCIPLINE.md. Murcia's "HTTP 403" turned out to
   have been measured on a directory index while the PDF itself returned 200; the false diagnosis had
   propagated into four artefacts.
6. **A ceiling asserted from a sample is not a ceiling.** State N. If N is small, the row says so.
7. **A blocker whose category is `Legal` freezes the engineering it gates.** Do not spend engineering effort
   solving a problem the ordinance may prohibit (ADR-0283: *"where evidence is incomplete or legally
   insufficient, PRYZM returns Unknown rather than inferring entitlement"*).

## Every blocker terminates in exactly one of four states

Founder hard rule, 2026-08-02. A blocker is not closed because it stopped being discussed; it is closed
because it reached one of these, with evidence:

| State | Means | Example |
|---|---|---|
| **Authorised** | A human with standing said yes, in writing, with scope. | Murcia SIG-MU2 — the ancho-de-calle methodology, four conditions attached |
| **Rejected** | The answer is no, and the no is itself the product's answer. | Madrid NZ 3 **if Art. 8.3.1 governs** — *"NZ-3 intentionally has no computable municipal envelope"*, a successful legal conclusion over 60.46 % of the city |
| **Unavailable** | The thing does not exist, or cannot be obtained, and the search is closed. | Córdoba's calificación vectors **if** the one-shot sweep concludes *"no discoverable machine-readable source exists"* |
| **Superseded** | The premise changed; the blocker was answering the wrong question. | València's *profundidad edificable* — never unpublished, it is **drawn** in the Layer 212 movement geometry (Art. 6.18.1) |

⚠ **`Superseded` is not a synonym for `Closed`.** It records that the blocker's *premise* was wrong, which
is the single most valuable thing to write down — it is what stops the next agent re-deriving the same dead
end. Córdoba's three-block dissolve "ceiling" and the inherited "C63 tier vocabulary does not exist" P0 were
both `Superseded`, and neither would have propagated had the first person to refute them said so in these
terms.

## Release order (founder, 2026-08-02)

`Murcia` → `Madrid RC-1 (SIG-M1)` → `Córdoba` → `Madrid NZ-3 (if legally authorised)` → `València`

Ordered by *dependency*, not by size: Murcia depends on nobody outside the repo; Madrid RC-1 on one
signature; Córdoba on one search; Madrid NZ-3 on one legal reading; València on a third party who has not
replied. A city's position here is a scheduling fact, not a judgement on its work.

## Worked example — the five Spanish cities, 2026-08-02

| City | Blocker | Category | Owner | Exit criterion |
|---|---|---|---|---|
| **Murcia** | bbox fetch of neighbouring alineaciones | **Engineering** | the Murcia agent | fetch ships; snap gate re-run; MEASURED refusal rate and coverage published |
| **Madrid** | SIG-M1 transcription certification | **External authority** | the founder | the targeted review passes its four residual-risk classes and is signed |
| **Madrid** | Art. 8.3.1 vs 8.3.5 | **Legal** | planning-literate reader | verbatim reading naming which governs — either outcome closes NZ 3 or reopens it |
| **Córdoba** | machine-readable calificación source | **Data acquisition** | the Córdoba agent | six avenues exhausted → source bound, or "no discoverable source exists" declared once |
| **València** | layer 212 `altura` semantics | **External authority** | the founder (R5 email) | written municipal definition that also reconciles the −2 gap |
| **València** | heritage folders, error 499 | **External authority** | the founder | credentials obtained, or the refuse-where-heritage-may-apply path ships |
| **Barcelona** | — | — | — | corpus boundary published; delegated plans out of verified scope (signed) |

⚠ Note what this table makes visible at a glance: **only one blocker on the board is `Legal`, and only one
city's critical path is `Engineering`.** Three of the six are `External authority` — work no amount of
engineering effort can accelerate. That is the whole point of classifying.
