# PRYZM — Planning System & Cadence

> **Stamp**: 2026-06-03 · **Status**: CANONICAL (META)
> **Reconciled 2026-06-03**: legacy-path repoints (master-implementation-plan / master-architecture-and-capabilities / geospatial-foundation live only under `legacy/superseded-2026-06-01/`); future-doc markers added; contract count refreshed (51, C51 exists).
> **Authority**: this doc defines **how PRYZM plans work** — the five horizons, the document types per horizon, the update cadence per horizon, the authority order between horizons, and the relationship to contracts + ADRs + specs.
> **Read this first** before consuming any other plan in `03-execution/plans/`.

---

## §1 — The thesis

PRYZM uses **five simultaneous planning horizons** — not one. Each horizon has a distinct document type, purpose, update frequency, and detail level. The mistake most teams make is writing everything at the same level of detail: long-horizon docs become brittle (they have too much detail to update); short-horizon docs become vague (they have too little detail to act on). Autodesk and peer enterprise software teams (Atlassian, Bentley, Trimble, JetBrains, …) use the multi-horizon model precisely because mixing horizons destroys planning quality.

The PRYZM planning system mirrors that practice while staying lean for a startup.

---

## §2 — The five horizons

| # | Horizon | Document type | Update cadence | Detail level | Lives in |
|---|---|---|---|---|---|
| **H1** | **5-year vision** | `vision-2030.md` (single doc) | Yearly refresh + on major pivots | Strategic; capability themes; no dates | `03-execution/plans/` |
| **H2** | **3-year phase roadmap** | `roadmap-phase-N-<name>.md` (3 docs: Phase 1 Alpha · Phase 2 Beta · Phase 3 GA+) | Quarterly | Phase goals + customer milestones + capability buckets + capacity bands | `03-execution/plans/` |
| **H3** | **Annual** | `annual-YYYY.md` (one per year) | Per-quarter | This year's commitments broken into 4 quarters × 3 months; high-level epics | `03-execution/plans/` |
| **H4** | **Quarterly** | `quarterly-YYYY-Qn.md` (4 per year — Q3, Q4, Q1, Q2) | Per-sprint | Sprint-level scope; 6 sprints × 2 weeks; named deliverables | `03-execution/plans/` |
| **H5** | **Sprint** | `sprints/YYYY-MM-sprint-NN.md` | Weekly during sprint | Ticket-level; PRs; daily standups | `03-execution/status/sprints/` |

A horizon below is a **derivative** of the horizon above. H2 derives from H1; H3 from H2; etc. When work in H4 reveals that H3's assumption was wrong, the right response is to **update H3 explicitly + raise an ADR** — not to silently diverge.

---

## §3 — What changes at each horizon

The defining question per horizon:

| Horizon | Question | Document answers |
|---|---|---|
| H1 (5-year) | Where do we want PRYZM to be in 2030? | Capability themes (5-7) · market positioning · platform vs product · biggest bets |
| H2 (3-year phase) | What capability set defines this phase? Who is the target customer? | Phase exit criteria · capability buckets · target archetype (C1–C4) · sequencing rationale |
| H3 (annual) | What are we shipping THIS year, organised by quarter? | Quarterly epics · capacity by track · personnel + budget · contract progression |
| H4 (quarterly) | What is each sprint actually building? | Sprint deliverables · acceptance criteria · cross-team dependencies · NFT impact |
| H5 (sprint) | What are this week's tickets? | Ticket queue · PRs in flight · blockers · daily standup |

A common failure mode is "H1 wishful thinking" — writing 5-year capability lists that look like product-marketing slides instead of strategic bets. The H1 doc must articulate **trade-offs + commitments + bets** — not aspirations.

The mirror failure is "H4 vagueness" — quarterly plans that read like a slogan deck. H4 docs must list **named deliverables with measurable acceptance criteria** — not "improve UX" but "Inspect tree mounts cold in < 800 ms with 10k elements, measured by `inspect-cold-mount.bench.ts`".

---

## §4 — The document tree

```
docs/03-execution/plans/
├─ cadence-and-planning-system.md          ← THIS doc (META — read first)
│
├─ vision-2030.md                           ← H1 — 5-year implementation vision
│
├─ roadmap-phase-1-alpha.md                 ← H2 — Alpha (0-6 mo)
├─ roadmap-phase-2-beta.md                  ← H2 — Beta (6-18 mo)
├─ roadmap-phase-3-ga.md                    ← H2 — GA + post-GA (18-36 mo)
├─ roadmap-enterprise-delivery.md           ← H2 sibling — customer onboarding
├─ typology-expansion-roadmap.md            ← H2 sibling — the multi-typology vision
│
├─ annual-2026.md                           ← H3 — this year
├─ annual-2027.md                           ← H3 — next year (future, not yet authored)
│
├─ quarterly-2026-Q3.md                     ← H4 — current quarter
├─ quarterly-2026-Q4.md                     ← H4 — next quarter
├─ quarterly-2027-Q1.md                     ← H4 — quarter after (future, not yet authored)
│
├─ legacy/superseded-2026-06-01/master-implementation-plan-2026-05-31.md       ← legacy synthesis; kept for archeology
├─ legacy/superseded-2026-06-01/master-architecture-and-capabilities-2026-06-01.md ← capability map (legacy companion)
│
└─ <legacy + topic-specific plans>          ← apartment/, legacy/superseded-2026-06-01/geospatial-foundation.md, etc.

docs/03-execution/status/sprints/
└─ YYYY-MM-sprint-NN.md                     ← H5 — per-sprint plans + retros
```

---

## §5 — Authority order

When two plans disagree:

1. **Contracts** ([02-decisions/contracts/](../../02-decisions/contracts/)) — binding rules. Plans must conform.
2. **ADRs** ([02-decisions/adrs/](../../02-decisions/adrs/)) — per-decision rationale. Plans cite ADRs.
3. **Specs** ([../specs/](../specs/)) — normative implementation. Plans defer to specs on algorithm + format detail.
4. **H1 vision-2030.md** — when H2 and H1 disagree, H1 wins. Phase roadmaps trace to vision themes.
5. **H2 phase roadmaps** — when H3 and H2 disagree, H2 wins. Annual plans trace to phase capability buckets.
6. **H3 annual** — when H4 and H3 disagree, H3 wins. Quarterly plans trace to annual epics.
7. **H4 quarterly** — when H5 and H4 disagree, H4 wins. Sprint plans trace to quarterly deliverables.

**Reverse direction**: when reality forces a change, the change flows **up** the horizons:
- A sprint discovery that invalidates a quarterly assumption → update H4 + raise an ADR if material
- A quarterly miss that invalidates an annual commitment → update H3 + raise an ADR + adjust customer comms
- An annual shift that invalidates the phase exit criteria → update H2 + raise an ADR + revisit H1

**Bidirectional discipline**: plans flow down, reality flows up. Both are PR'd + reviewed.

---

## §6 — What goes WHERE

The most common authoring confusion. Resolved:

| Material | Lives in |
|---|---|
| "We are building X over the next 5 years" — capability theme | H1 `vision-2030.md` |
| "Phase 1 closes when X, Y, Z ship" — exit criteria | H2 `roadmap-phase-1-alpha.md` |
| "Phase 1 closure decision was made on date D" — gate decision | **ADR** (`02-decisions/adrs/ADR-NNN-phase-1-exit.md`) |
| "We are shipping the Inspect tree in Q3" — annual commitment | H3 `annual-2026.md` |
| "Q3 Sprint 5 delivers Inspect tree v1.0 + Cost panel beta" — sprint scope | H4 `quarterly-2026-Q3.md` |
| "Sprint 5 ticket #142: implement IsolationAnimator.fadeOut" — ticket | H5 sprint doc + linked GitHub issue |
| "Wire-format for Sheet revisions" — algorithm + format | **SPEC** (`03-execution/specs/SPEC-NN-DRAWING-SET.md`) |
| "Drawing set revision tracking is binding" — rule that downstream MUST follow | **CONTRACT** (`02-decisions/contracts/C30-DRAWING-SET-MANAGEMENT.md`) |
| "We chose tagged-PDF over PDF/UA-2 for accessibility reasons" — decision | **ADR** |
| "Customer X is onboarding in Q3 with 50 seats" — customer milestone | H3 `annual-2026.md` + `roadmap-enterprise-delivery.md` |

The rule that keeps this clean: **never put binding decisions inside plans files**. A plan is a map; an ADR is a record. Decisions that bind code live in ADRs; capability bets that direct work live in plans. When a phase officially closes, **raise an ADR** (`ADR-NNN-phase-N-exit.md`) — never write "Phase 1 is closed" inside the phase roadmap doc.

---

## §7 — Update cadence (the metronome)

| Cadence | Trigger | What gets updated |
|---|---|---|
| Daily | Standup | Sprint ticket queue · blockers list |
| Weekly | Sprint cycle | H5 sprint doc · status dashboard |
| Bi-weekly | Sprint close | H5 sprint retro · `cut-list-log.md` |
| Monthly | Sales + customer review | `annual-YYYY.md` quarter-progress · customer-milestone tracking |
| Quarterly | Quarter close + planning new quarter | H4 close (move to status/) + H4 new quarter draft · refresh H2 + H3 if phase progression material |
| Yearly | Year close | H3 close (move to status/) + H3 new year draft · refresh H1 if strategy shift |
| On phase exit | Phase gate decision | **ADR** + H2 refresh + customer announcement |

Every update is a PR. Every PR is reviewed. Plans don't update silently.

---

## §8 — The customer-vs-internal split

A critical separation often missed:

- **Internal build sequence** — how the engineering team sequences capability development. Lives in H1–H5.
- **Customer delivery sequence** — how phased rollout works for paying customers (typically lagging the build sequence by 2-4 quarters). Lives in `roadmap-enterprise-delivery.md`.

Why the split: customers can't consume capability as fast as engineering ships it. Enterprise customers need pilots, security review, training, change management. A capability that ships in Q3 may only land in production for Customer A in Q1 next year. The two sequences must NEVER be conflated — doing so leads to public roadmap commitments engineering can't keep, or internal velocity that customers can't absorb.

Per [go-to-market §2](../../01-strategy/go-to-market.md): the customer-side cycles vary by tier (PLG: instant; Mid-firm: 60-120 days; Enterprise: 6-9 months). The build cycle is uniform.

---

## §9 — How a new horizon doc is born

The lifecycle of any plan in this system:

1. **Draft** — author writes the doc with `Status: DRAFT`; team reviews in PR
2. **Adopted** — merged to main; `Status: CANONICAL`; tracking begins
3. **Refresh** — per the §7 cadence; PR with diff; review; merge
4. **Close** — when the horizon ends (phase exits, year closes), close the doc:
   - Status changes to `CLOSED`
   - Move to `status/closed-plans/<year>/`
   - Raise a closure ADR if the doc carries phase-gate semantics
5. **Supersede** — never edit a CLOSED doc; write a new one with the next horizon

---

## §10 — The four cardinal rules

1. **One doc per horizon, per scope** — don't write two competing annual plans. There is one `annual-2026.md`.
2. **Decisions go to ADRs, not plans** — if a plan would carry a decision (e.g. "Phase 1 has closed"), raise an ADR.
3. **Reality flows up; plans flow down** — when a sprint discovery invalidates an annual assumption, update annual.
4. **Detail level matches horizon** — H1 is capability themes; H4 is named deliverables. Don't mix.

---

## §11 — Cross-references

| Doc | Relationship |
|---|---|
| [vision-2030.md](./vision-2030.md) | H1 — 5-year implementation vision |
| [roadmap-phase-1-alpha.md](./roadmap-phase-1-alpha.md) | H2 — Alpha phase (0-6 mo) |
| [roadmap-phase-2-beta.md](./roadmap-phase-2-beta.md) | H2 — Beta phase (6-18 mo) |
| [roadmap-phase-3-ga.md](./roadmap-phase-3-ga.md) | H2 — GA + post-GA (18-36 mo) |
| [typology-expansion-roadmap.md](./typology-expansion-roadmap.md) | H2 sibling — the multi-typology AI generative pipeline expansion |
| [roadmap-enterprise-delivery.md](./roadmap-enterprise-delivery.md) | H2 sibling — customer onboarding for 1000s |
| [annual-2026.md](./annual-2026.md) | H3 — current-year commitments |
| [quarterly-2026-Q3.md](./quarterly-2026-Q3.md) | H4 — current quarter |
| [legacy/superseded-2026-06-01/master-implementation-plan-2026-05-31.md](./legacy/superseded-2026-06-01/master-implementation-plan-2026-05-31.md) | Legacy synthesis (pre-2026-06-01) — kept for archeology; not current |
| [../../01-strategy/product-vision.md](../../01-strategy/product-vision.md) | Strategy upstream (what + why) |
| [../../01-strategy/architecture.md](../../01-strategy/architecture.md) | System shape |
| [../../02-decisions/contracts/](../../02-decisions/contracts/) | 51 binding contracts (C01–C51; C51 = apex/app split per ADR-055) |

---

*End — PRYZM Planning System & Cadence, 2026-06-03 (reconciled to ADR-055/C51) — CANONICAL.*
