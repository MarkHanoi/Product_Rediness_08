# ADR-0326 — Mount the ribbon; the unbacked render disabled-with-reason

- **Status**: ACCEPTED — founder decision, 2026-08-14
- **Date**: 2026-08-14
- **Evidence**: the H6 gesture-reach probe (`b32d56ff`,
  `tools/rac-conformance/gesture-reach/results/gesturereach.json`) · the Phase-1 verb backing
  census (`ae659c96`, `results/verb-census.json`) · the Phase-3 refusal machinery (`4bfe86f0`) ·
  `BIM30-NEXT-SESSION-BRIEF.md` §11.3 item 2, where the decision sat OPEN as *"Toolbar
  mount-or-delete (267 dead verbs)"*
- **Constrains**: the 30 toolbar surfaces in `apps/editor/src/ui/toolbar/*.ts` and every mount PR
  over them; governed in the ongoing tense by
  [C82](../contracts/C82-RIBBON-CAPABILITY-SURFACE.md), which this ADR is the decision behind —
  where this ADR and C82 disagree, **C82 wins** (contract over ADR, per the suite's conflict
  order)
- **Feeds**: [SPEC-50](../../03-execution/specs/SPEC-50-RIBBON-HANDLER-BACKLOG.md) — the handler
  backlog this decision surfaces (a backlog, not a promise)

## Context

The professional BIM ribbon — 30 toolbar surfaces, the product's Revit-shaped command surface —
was authored in full and reachable by nobody. The decision this ADR records was open in the
session brief as a named founder call, and it was made against measured numbers, not against the
family's file count.

**The measured state at decision time** (every figure from an executed artefact, cited):

- **280 gesture→command pairs across 30 surfaces** (`ae659c96`, census totals). The probe
  (`b32d56ff`) constructed every real toolbar class against the **real** `CommandBus` and clicked
  every `[data-command]` button: **0 EXECUTED-REACHED · 4 RESOLVED-ONLY · 267 NOT-REACHED ·
  9 UNPROVEN**. The census resolved the 9 UNPROVEN as UNBACKED, giving the backing split
  **4 BACKED · 0 REGISTER-ONLY · 276 UNBACKED**.
- **The only four resolved verbs** — `zoom-fit`, `zoom-selected`, `copy-selection`,
  `paste-clipboard` — are exactly the four that were hand-registered earlier under §C-B1 /
  §FIX-COPY-PASTE, which is the probe's own cross-check that it measures the real thing.
- **All 30 surfaces had ZERO production importers.** The family was authored, type-mapped into
  `CommandRegistry`, and covered by **30 green spec files asserting dispatch against a MOCK
  bus** — never mounted. Per surface: **0 MOUNTABLE-WHOLE · 1 MOUNTABLE-PARTIAL** (MainToolbar,
  4 of 12) · **29 NO-BACKED-VERB**.
- **Since `4bfe86f0`** (landed before this decision, deliberately before any mount): all 276
  unbacked verbs refuse through both dispatch doors at 41 guarded sites; the probe reads
  **NOT-REACHED 276, of which `declaredRefusal` 276; UNPROVEN 0; EXECUTED-REACHED still 0**.
  Zero of the 280 pairs is a silent no-op. Nothing became reachable.

Three dispositions were available for a family in this state, and the brief had framed the choice
as binary ("mount-or-delete"). The founder chose the third framing: **mount it, and let the
unbacked verbs say honestly why they do nothing yet.**

## Decision

1. **The ribbon is MOUNTED.** The toolbar family ships as the product's professional command
   surface. Mounting is lane L-MOUNT's work; at this ADR's date the mount itself (the family's
   "Phase 2") has **not landed** — the refusal machinery landed first (`4bfe86f0`), by design:
   *mounting first would have shipped the lie for however long the refusal took to write*.
2. **Unbacked verbs render DISABLED-WITH-REASON until their capability ships**, per
   [C82 §1](../contracts/C82-RIBBON-CAPABILITY-SURFACE.md). A control that dispatches into
   nothing is prohibited (C82 §1.2); the reason must name the missing capability by contract/spec
   reference (C82 §1.3), which for the current 276 is their row in SPEC-50.
3. **"Wired" is the probe's verdict, not an artefact's existence.** A verb moves from
   DISABLED-WITH-REASON to WIRED only by an H6 re-run reading EXECUTED-REACHED (C82 §2), with its
   C67/C68 declarations discharged in the wiring PR (C82 §3).
4. **The backlog is written down and promises nothing.** SPEC-50 records, per toolbar and from
   the census, what each unbacked verb needs, what partially exists, and an honest size class.
   No dates; scheduling is the founder's, per capability, later.

## Alternatives rejected

**Delete the family** — remove the 30 surfaces, their specs, and the 280 declared pairs.
Rejected: the ribbon is the product's professional surface — the shape a BIM professional
recognises as the tool being a tool — and the 280 declared pairs are themselves the measured
inventory of what the product intends to offer (SPEC-50 is generated *from* them). Deletion
destroys the denominator and re-opens the question as 30 undocumented future feature requests.
The cost that made deletion tempting — 267 enabled buttons wired to nothing — was already
eliminated by `4bfe86f0` before this decision was taken, so deletion would have bought honesty
the family already had.

**Park it** — leave the family authored and unmounted, revisit later. Rejected twice over:
**(a) dead code** — an unmounted family is invisible to every user and to every production
denominator, which is precisely how 30 surfaces and 30 green mock-bus spec files accumulated with
zero reachable pairs (the L-847 shape at family scale; CE-05's class in the gap register: static
discovery counted authored-but-unreached code as present). Parking preserves the state that
produced the lie. **(b) a frozen ratchet** — the census's BACKED count (4) and the probe's
EXECUTED-REACHED count (0) only move under pressure from a mounted surface whose disabled
controls name what is missing; unmounted, there is no user-visible reason for any of the 276 to
ever gain a handler, and the brief's own line held: *"No baseline until the founder's
mount-or-delete."* This decision is what un-freezes the baseline.

**Mount it as-is** (the unstated default) — mount with all 280 buttons enabled and dispatching.
Rejected without ceremony: 276 of them dispatched into nothing, which is §C-B1 at 276×, and
`4bfe86f0`'s commit message states the ordering principle this ADR adopts: the refusal machinery
is the precondition for any mount, not its follow-up.

## Consequences

- **C82 exists and governs** (same date). The three-state rule, the probe-defined meaning of
  WIRED, the both-doors refusal, the C67/C68 binding on wiring PRs, and the landing rule for new
  buttons are contract text there, not prose here.
- **SPEC-50 exists**: the per-toolbar handler backlog, from the census's real numbers
  (276 unbacked verbs over 30 surfaces; 29 surfaces with no backed verb). Its header states it is
  a backlog, not a promise.
- **The mount PRs inherit obligations**: each mounted surface joins the probe's rendered-DOM
  blind spot (C82 §5.4 — mount evidence today is static import evidence), so the mount lane's
  acceptance is a probe re-run plus the surface's spec, never the mount diff alone.
- **The register is untouched by this ADR.** The verb register (C69) gains rows only as verbs
  gain handlers, PR by PR, per C69 §3.3. Nothing is pre-registered from the backlog.
- **The numbers in this ADR rot.** They are the decision-time reading, correct as of
  `ae659c96` / `4bfe86f0`. The census and probe are the artefacts that compute them; re-run them
  rather than citing this ADR for the current state (C70 §0.2).
