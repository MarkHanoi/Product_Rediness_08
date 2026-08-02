# PRYZM ENVELOPE COMPILER — EXECUTION DASHBOARD

**Status**: LIVE (founder directive, 2026-08-02). Updated every reporting cycle.
**The one objective**: *a user selects any parcel in Spain and immediately receives the maximum legally defensible, fully explainable 3D buildable envelope.*
**Related**: [ADR-0290](../../02-decisions/adrs/ADR-0290-exhaust-authoritative-sources-before-engineering-a-derived-solution.md) · [ADR-0283–0288](../../02-decisions/adrs/) · [DECISION-REGISTER](../../04-reference/standards/DECISION-REGISTER.md) · [MACHINE-READABLE-EVIDENCE-REGISTER](../../04-reference/standards/MACHINE-READABLE-EVIDENCE-REGISTER.md) · [BLOCKER-CLASSIFICATION-STANDARD](../../04-reference/standards/BLOCKER-CLASSIFICATION-STANDARD.md)

> **Reporting rule.** Never report documents written, ADRs created, investigations completed or datasets
> found **unless they change a measurable capability**. Every entry answers: *did PRYZM become capable of
> generating more envelopes?* If not, it is **support work**, and is labelled as such.

> ⚠ **UNMEASURED IS PRINTED AS `—`, NEVER AS A NUMBER.** Several rows the founder's template asks for do not
> yet have a measurement. They are shown empty with the reason. A dashboard that carries illustrative
> figures as if they were measurements is the failure this whole programme exists to prevent.

---

## 1 · NATIONAL KPIs — 2026-08-02

### ENVELOPE COMPLETION COVERAGE *(primary product KPI)*

| City | Envelope drawn | Denominator |
|---|---:|---|
| Barcelona | **58.93 %** | private buildable land · 31.795 M m² |
| Murcia | **28.03 %** | private buildable land · 75.145 M m² |
| Madrid | **11.70 %** | Norma-Zonal-governed land · 149.577 M m² |
| València | **0.00 %** | private buildable land · 18.696 M m² |
| Córdoba | **0.00 %** | suelo urbano · 33.342 M m² |
| **NATIONAL (area-weighted)** | **18.57 %** | **57.30 of 308.555 M m²** — ⛔ **SUPERSEDED: the denominator is now the CADASTRAL PARCEL (Addendum 1). Every area-based figure on this page is being restated and must not be quoted.** |

### DETERMINATION COVERAGE — **ALWAYS SPLIT. A BARE NUMBER IS FORBIDDEN.**

> ⛔ **`Determination % = Envelope % + Refusal %`, refusals broken out by category.** A bare "98.3 %" must
> **never** appear in any report, dashboard or external-facing document (founder, 2026-08-02, Addendum 1).
> **Determination is gameable by refusing** — a refusal is a determination, refusals are cheap, envelopes are
> expensive. Nobody has to do this dishonestly; it drifts.

| City | **Envelope** | **Refusal — legally terminal** | **Refusal — delegated instrument** | **Refusal — external authority** | **= Determination** | Unknown |
|---|---:|---:|---:|---:|---:|---:|
| Barcelona | **58.93 %** | — | 39.37 % | — | **98.30 %** | 1.70 % |
| Murcia | **28.09 %** | — | 67.00 % | — | **95.09 %** | 4.91 % |
| Madrid | **11.70 %** | 48.38 % | 12.08 % | — | **72.15 %** | 27.85 % |
| València | **0.00 %** | — | 36.40 % | — | **36.40 %** | 63.60 % |
| Córdoba | **0.00 %** | — | 2.96 % | — | **2.96 %** | 97.04 % |

⚠ **STANDING DRIFT SIGNAL — watch every sprint:** *refusal rate rising while envelope count is flat.* That
means the metric is being satisfied instead of the product.

### REFUSAL CORRECTNESS — **NOT MEASURED**
**Refusal correctness has never been measured.** It is asserted. A refusal audit (30 random refusals per
city; verify the cited article actually terminates that parcel; report sample · correct · incorrect ·
unverifiable) is commissioned this sprint. ⚠ **An incorrect refusal is a defect of the same class as an
over-granted envelope** and is reported as one.

⚠⚠ **THE NATIONAL FIGURES CARRY A METHODOLOGICAL DEFECT AND MUST NOT BE QUOTED WITHOUT IT.** The five cities
use **three different denominators** — *private buildable land* (BCN/MUR/VLC), *suelo urbano* (COR), and
*Norma-Zonal-governed land* (MAD). **Madrid alone is 48.5 % of the weight and is the one with the
least-comparable denominator.** The national numbers are therefore **indicative, not measured**. Fixing this
— one ratified national denominator — is a tracked engineering item, not a rounding note.

### VARIABLE RESOLUTION COVERAGE
**— NOT MEASURED.** No per-variable national coverage exists. Four cities have produced *qualitative*
inventories (§3) but none yields a percentage, because no parcel-level variable resolver exists to count
against (compiler **layer 3 is absent** — `git grep` for any variable resolver returns nothing).
**This KPI becomes computable only when layer 3 ships.** It is the single most valuable missing measurement.

### CONSTRAINT RESOLUTION COVERAGE · EVIDENCE COMPLETENESS · UNKNOWN REDUCTION
**— NOT MEASURED.** Same root cause. Evidence Completeness is the closest to free: `DerivationEntrySchema`
already mandates source + provenance + `ordinanceRef` per numeric constraint (C58 §1.3), so it needs an
aggregator, not new capability.

---

## 2 · ENVELOPE COMPLETION PIPELINE

| Stage | Barcelona | Madrid | Murcia | València | Córdoba |
|---|---|---|---|---|---|
| Parcel context | ✅ 99 % | ✅ 100 % | ✅ 99 % | ✅ 99 % | ✅ 95 % |
| Legal stack | — | — | — | — | — |
| Variables resolved | — | — | — | — | — |
| Constraints applied | — | — | — | — | — |
| **Envelope generated** | **58.93 %** | **11.70 %** | **28.03 %** | **0 %** | **0 %** |
| Explainable | =envelope | =envelope | =envelope | n/a | n/a |

*Parcel context = the measured PARCEL axis (live samples, N=120 each). Rows 2–4 are unmeasured for the
reason in §1. "Explainable" equals the envelope row because C58 §1.3 makes a derivation entry mandatory for
every numeric constraint — an envelope cannot ship without one.*

---

## 3 · VARIABLE RESOLUTION MATRIX

⚠ **Qualitative, per city, from committed findings. The `National` column is deliberately blank** — a
percentage would require the parcel-level resolver that does not exist.

| Variable | BCN | MAD | MUR | VLC | COR | National |
|---|---|---|---|---|---|---|
| Height / storeys | ✓ | ✓ *(unsigned)* | ✓ | ✗ `altura` | ✓ *(gate shut)* | — |
| Street width | ✓ | ✗ no source | ✓ **shipped** | — | ✗ **measured negative** | — |
| Buildable depth | ✓ constructed | ✗ | ✓ stated 15 m | ✓ **drawn** (D-005) | ✓ MC *libre* / UAD stated | — |
| Alignment / building line | ✓ | ✓ NZ-1 ring | ✓ published | ✓ layer 212 | ✓ **zero-setback** ⇒ none needed | — |
| Block ring | ✓ | ◐ dissolve 2/4 | ✓ published | — | ✓ **`manzana`, 20 730** | — |
| Occupation | ✓ | ✓ 8.3.8.2 | ✓ | ✓ = alignments | ✓ | — |
| FAR / edificabilidad | ✓ constructed | ✓ 8.3.8.1 | n/a | **none in chapter** | ⛔ permanently null | — |
| Setbacks | ✓ | ◐ centreline gap | ✓ | ✓ *forbidden* ⇒ wrong shape | ✓ zero | — |
| Heritage override | ✓ | ◐ | ◐ | ✗ 499 gated | — | — |
| Existing-building envelope | n/a | ✗ **applicant-supplied** | n/a | n/a | n/a | — |

---

## 4 · CAPABILITY PROGRESS

| Capability | Status | Unlocks | Evidence |
|---|---|---|---|
| Envelope synthesiser | ✅ **shipped** | national | `computeBuildableEnvelope` → `envelopeToMassing`, never-overstates invariant binds every jurisdiction |
| Provenance / evidence chain | ✅ **shipped** | national | `DerivationEntrySchema`, mandated per constraint (C58 §1.3) |
| Confidence propagation | ✅ **shipped** | national | `ENVELOPE_AXIS_TIER_WEIGHT` + demote-only ceiling |
| Refusal engine | ✅ **shipped** | national | typed, land-identifying, article-citing |
| Explainability *(per face)* | ◐ data only | national | trace exists; **faces do not yet cite their own article** |
| Street width resolver | ◐ **1 of 5 cities** | MUR ✅ · BCN ✓ · MAD ✗ · COR ✗ | region-agnostic core; **blocked on inputs, not logic** |
| Legal instrument resolver | ◐ routes, no precedence | national | delegation cited everywhere; **no precedence engine** |
| Dataset discovery (Stage 0) | 🔨 **in build** | **all cities** | ADR-0290; three human misses as acceptance tests |
| Variable resolver *(layer 3)* | ❌ **absent** | national | `git grep` returns nothing |
| Variable dependency graph *(layer 2)* | ❌ **absent** | national | — |
| Constraint composition *(layer 6)* | ◐ per-city | national | València `min(base, heritage)` only |
| Existing-building resolver | ⛔ **proven un-automatable** | MAD | evidence chain is applicant-supplied (D-001) |

---

## 5 · ENVELOPE GAINS — 2026-08-02

| Task | Envelope gain | Variables unlocked | Why it matters if gain = 0 |
|---|---:|---|---|
| **Murcia bbox alineaciones fetch** | **+4.52 pp** (23.51 → **28.03 %**) | street width | — real product gain |
| **Madrid SIG-M2 signed + gate flipped** | **+4.68 pp** (0 → **4.68 %**) | NZ-1 explicit area | — real product gain |
| Córdoba `idecordoba:manzana` recovered | **0 %** | block ring | ⭐ **replaces a multi-week dissolve engine with a published source on a BETTER provenance tier.** Future-effort reduction: very high. Cities: Córdoba + every city where Stage 0 finds an equivalent |
| Córdoba front-alignment result | **0 %** | front alignment | Blockers 3+4 lose their data dependency entirely — zero setback needs adjacency, not a published line |
| Madrid Art. 8.3.1 verdict | **0 %** | — | **Closes 60.46 % of Madrid permanently.** Prevents indefinite investment in an ordinance-prohibited capability |
| València D-005 (depth = drawn) | **0 %** | buildable depth | Moved **63.60 %** of València out of *data unavailable* — that bucket is now **0.00 %** |
| Heights bake fixes (3 defects) | **0 %** | — | Support work. Heights are C63 Axis 6; **they gate no envelope** |
| ADR-0283–0290, registers, standards | **0 %** | — | Support work — but ADR-0290 is the gate that stopped a dissolve engine being built unnecessarily |

---

## 6 · SPRINT SCOREBOARD

| Task | Capability | Envelope gain | Variable gain | Status |
|---|---|---:|---|---|
| Murcia bbox resolver | Street width | **+4.52 pp** | +1 | ✅ Complete |
| Madrid SIG-M2 | Legal instrument | **+4.68 pp** | +1 | ✅ Complete |
| Córdoba block ring | Block context | 0 % | +1 | ✅ Complete |
| Córdoba front alignment | Alignment | 0 % | +1 | ✅ Complete |
| Dataset Discovery (Stage 0) | National | unknown | many | 🔨 Running |
| National capability register | Programme | 0 % | — | 🔨 Running |
| Madrid SIG-M1 | Tier upgrade | 0 pp *(0.1→0.4 on 27.85 %)* | 0 | ⏸ **Waiting on founder** |
| València `altura` | Height | **+54.37 pp of VLC** | +1 | ⏸ **Waiting on Ajuntament** |

---

## 7 · EXTERNAL DEPENDENCY BOARD — *not engineering; must not consume sprint capacity*

| Dependency | Owner | Area locked | % national | Kind |
|---|---|---:|---:|---|
| Madrid OMTLU annex | Ayto. Madrid | 72.37 M m² | **23.45 %** | intervention ceiling — **not an envelope** |
| Córdoba zoning sheets (41 of 49) | GMU Córdoba | 31.49 M m² | **10.21 %** | envelope |
| **Madrid SIG-M1 signature** | **the founder** | 41.65 M m² | **13.50 %** | tier upgrade 0.1→0.4, **not new land** |
| València `altura` semantics | Ajuntament de València | 10.17 M m² | **3.29 %** | envelope |
| València heritage token (499) | Ajuntament de València | 11.89 M m² | 3.85 % | deployment gate (overlaps altura) |

---

## 8 · WEEKLY DELTA — five questions

1. **What new envelopes became generatable?** **+4.52 pp Murcia · +4.68 pp Madrid.** National envelope
   completion moved to **18.57 %**.
2. **Which variables became solved?** Street width (Murcia, shipped) · block ring (Córdoba, published
   source) · front alignment (Córdoba, no data needed) · buildable depth (València, D-005).
3. **Which capability improved?** **Street width resolver** — from city-specific to a shipped
   region-agnostic core with a measured 44.6 % band-edge refusal rate.
4. **Which blockers disappeared (engineering only)?** Murcia's bbox fetch · Córdoba's block-ring dependency ·
   Córdoba's front-alignment dependency · València's *data unavailable* bucket (63.60 % → **0.00 %**).
5. **What is the next biggest unlock?** **Dataset Discovery (Stage 0).** It has already paid for itself
   three times before being built, and it gates the correct sizing of every derived capability (ADR-0290).
