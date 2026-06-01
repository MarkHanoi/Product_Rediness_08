# PRYZM 2 — Beta launch announcement

> Spec: `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §S48 D7 (lines 720–722).
> Status: COPY RATIFIED — publication deferred to S48 D9 launch (human action; bound in ADR-0038 §3).
> Channels: pryzm.com/blog (primary), LinkedIn (cohort C2/C3 reach), one targeted email to the wait-list captured by `public/beta.html`.

---

## Title

**PRYZM 2 is in private beta.**

## Subtitle

*A new BIM editor that opens in a browser, supports multiple architects on one model in real time, and shows you the cost of every AI suggestion before it touches your drawings.*

---

## §1 — Who this is for

If you've ever:

* Closed a model so a colleague could open it,
* Watched an "AI assistant" rack up a bill you couldn't predict,
* Or copied geometry between tools just to keep a section view current,

PRYZM 2 was built to remove those friction points.

The private beta opens with **25 practitioners**, balanced across:

* **8** independent practitioners (C1)
* **10** small studios of 2–5 users (C2)
* **5** large practice IT contacts (C3)
* **2** architecture educators

The composition is from the spec's beta cohort plan, deliberately weighted toward C2 — the segment we've heard most clearly says "we want this".

## §2 — What's in the box

* **Multi-user real-time editing.** Yjs-based sync with awareness presence, soft per-element locks, and 50-user-tested round-trip latency under 250 ms p95.
* **Plan + section + sheet + schedule.** Five view kinds, all live against the same model. Visibility-Intent waves 1–5 are parity-tested against legacy export targets.
* **AI floorplan workflow.** Suggested commands land in an approval queue with a preview and a cost estimate. You approve or reject — nothing auto-applies.
* **Trace links on every bug report.** When you hit something odd, the in-app "Copy trace link" affordance gives our team a 1-click jump into the exact request. No back-and-forth log gathering.
* **A path off any moment.** Replit-PG dev → Supabase prod cutover is a single config flip — your data is portable from day one.

## §3 — Where to watch the demo

A 3-minute walkthrough of the multi-user loop + the approval queue + the schedule export lives at:

> **pryzm.com/beta/demo** *(URL bound to S48 D9 launch — see docs/marketing/beta-demo-script.md)*

If the recording slips, the page falls back to a screenshot strip with the same flow.

## §4 — How to join

The wait-list lives at **pryzm.com/beta** (`public/beta.html`).

Tell us:

* Your role + cohort fit (C1 / C2 / C3 / academic).
* In one line, what you'd most want to do with PRYZM in your first week.

We'll reach out individually as cohort slots open. The first 25 practitioners are seeded; subsequent invitations go in waves based on cohort balance.

## §5 — What this is NOT

We're being deliberate about scope:

* **Not a Revit replacement** for production drawing sets in the beta window. Schedules + sheets + section views work, but tolerance for production-paper edge cases is what the beta itself surfaces.
* **Not auto-applying AI.** Every AI workflow flows through the approval queue. If a workflow's estimated cost crosses a threshold (per [strategic ADR-028](../../architecture/adr/0028-ai-cost-budget.md)) it requires explicit approval.
* **Not pretending to be free.** The beta is free; pricing tiers + per-project AI budget enforcement land at the next milestone (S65). We'll tell beta participants the pricing thinking openly as it firms up.

## §6 — Friday digest

Beta participants get a weekly Friday email summarising:

* Bugs fixed during the week (linked to your reports where applicable).
* Performance / latency changes against the M24 gate baseline.
* What we're shipping next week.

Unsubscribe lives at the bottom of every digest.

## §7 — Acknowledgements

The Phase 2 platform is built on the work of:

* The Yjs maintainers (real-time collab base).
* The OpenTelemetry community (the trace-link affordance that makes beta triage tractable).
* Everyone who answered our pre-beta questionnaire — your "what would actually make me switch" answers shaped the cohort cuts.

— The PRYZM team

---

## Publishing checklist (S48 D9 binding)

- [ ] Hero image rendered (a real screenshot of the editor; no mockups).
- [ ] Demo recording final cut linked at §3 (or fallback screenshot strip).
- [ ] Wait-list page (`public/beta.html`) reachable at pryzm.com/beta.
- [ ] OG / Twitter card metadata set.
- [ ] LinkedIn version (≤ 1300 chars) cross-posted.
- [ ] Email blast to wait-list captured during the soft-launch window scheduled.
