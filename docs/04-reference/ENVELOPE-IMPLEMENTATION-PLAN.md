# Buildable Envelope — Implementation Plan (per-country / per-city)

> **The sequenced, actionable build plan** for rolling the buildable-envelope pipeline beyond Barcelona.
> The *what/why* is the ratified [`ENVELOPE-REPLICATION-STANDARD.md`](./ENVELOPE-REPLICATION-STANDARD.md)
> (ADR-0279); this is the *in-what-order-do-we-build-it*, per-jurisdiction, with an explicit starting point.
>
> **Status:** DRAFT PLAN (2026-07-29). Tracks the standard + ADR-0279. Coverage claims reconcile against
> `GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md` (jurisdiction axis) + `jurisdictions/ENVELOPE-REALISM-MATRIX.md`
> (per-city realism). **Nothing here is built** — implementation starts on founder sign-off, phase by
> phase, each with a passing test before any contract flips to ACTIVE.
>
> **Governance:** the generic spine (`computeBuildableEnvelope` + `GeometricRule` union + the two
> registries) is invariant (ADR-0279); onboarding a city is a data addition at five slots. No engine/UI
> edits per jurisdiction. Honesty spine §CONTEXT-DATA-HONESTY.

---

## 0 — Where we start, and why (the answer to "from where?")

**We start with the HONESTY BACKSTOP, not a new city.** The single highest-priority item is the
merge-blocking **CI fidelity-label gate** (BLOCKER-1, ADR-0279 §6): `tools/ga-gate/check-zoning-fidelity-label.ts`,
mandated by ADR-0269 + C58 §6 but **not implemented**. Until it exists, the guarantee that an
`estimated-ruleset` value can never render authoritative-styled rides on convention, not CI — so **the
moment we ship a second rule pack, a mislabel bug becomes possible and undetectable**. Building the gate
first means every subsequent pack is protected by construction.

**Then we improve the GENERIC engine (lifts every jurisdiction at once) before adding any city:** per-edge
front/side/rear classification (kills the uniform-setback fallback, C58 §10.3) and provider-stamped
granularity (the engine hard-codes `parcel` today). These are *one* change each that improve Barcelona
*and* every future city — higher leverage than a second pack.

**Only then the first NEW jurisdiction** — and it is deliberately the *cheapest possible proof* that the
5-slot "add-a-city = data" claim holds: **a second Catalan municipality** (e.g. L'Hospitalet / Badalona —
same PGM-1976 fabric). It reuses the MUC zone source (S3) + the Art. 242.2 `block-derived-alignment` pack
shape (S4) that already work, so it exercises the router predicate (S2) + registration (S5) + a dispatcher
branch with almost no new legal sourcing. If *that* works end-to-end, the architecture is proven; if it
doesn't, we learn cheaply before spending on a genuinely new legal regime (Madrid/Valencia).

---

## 1 — The phased build

### Phase 0 — The honesty backstop (do FIRST, no new jurisdiction)
- Build `tools/ga-gate/check-zoning-fidelity-label.ts` (+ register in `tools/ga-gate/run-all.ts`):
  **fail the build** if any UI path can style an `estimated-ruleset` / `pipeline-extracted-unverified`
  value as authoritative, or render a refusal without its code, or a number without provenance. Mirror
  the (also-absent) `check-windcfd-beta-label.ts` pattern C58 §6 names.
- **Exit test:** a deliberately-mislabelled fixture makes CI red; the real Barcelona render stays green.
- **Contract:** flip C58 §6 gate from "specified" to shipped. Marks nothing ACTIVE beyond the gate itself.

### Phase 1 — Generic-engine leverage (lifts every jurisdiction)
- **Per-edge classification:** thread real front/side/rear per parcel edge into `computeBuildableEnvelope`
  (today a uniform setback fallback, self-flagged in caveats). Every setback-governed jurisdiction benefits.
- **Provider-stamped granularity:** let a `ZoningRecord` carry its own granularity (Madrid VEDA *ámbito*,
  Valencia sector) instead of the engine hard-coding `parcel`.
- **Exit test:** Barcelona unchanged (byte-identical where edges were already correct); a granularity-coarse
  fixture renders "sector-level, not parcel" honestly.

### Phase 2 — Prove the 5 slots (second Catalan municipality)
- S2 router predicate (extend `isInBarcelona` → an `isInCatalonia`/per-municipality bbox), S5 registration,
  one dispatcher branch. **Reuse** S3 (MUC) + S4 (the 242.2 pack). Human sign-off gate (L-449) before any
  number renders above `pipeline-extracted-unverified`.
- **Exit test:** draw/select a parcel in the new municipality → a cited `block-constructed` envelope OR an
  honest refusal; the fidelity gate (Phase 0) stays green.

### Phase 3 — Spain breadth (the human-gated cost begins)
- Genuinely new legal regimes: **Madrid** (already `explicit-area` refusal-only — needs the published
  buildable-geometry ingest, not a computed FAR), **Valencia**, **Córdoba** (machine-OCR pack, human-verify).
  Each = S3 zone source (new GIS/taxonomy) + S4 pack (legal sourcing, human-gated) + S5 + dispatcher.
- Sourcing is the bottleneck (`GEOGRAPHIC-ROLLOUT-MASTER-TRACKER` §4.0) — it does **not** parallelise with
  engineering. Sequence by rule-pack ROI (the tracker's "+30.9 pts" lever).

### Phase 4 — New countries (per the 5-slot recipe)
- Each wired-cadastre country (FR/NL/NO/DE-NW/CH/DK) that already has S1 parcels needs S3 (zone source) +
  S4 (rule pack) + S5 + dispatcher. Denmark's structured `plandata-dk` is the *easiest* (numbers published,
  fidelity `structured`, not `block-constructed`). NL `explicit-area` (bouwvlak) is next. FR PLU-b after.

---

## 2 — Per-COUNTRY onboarding cost (the 5 slots + what's done)

| Country | S1 parcel | S2 router | S3 zone source | S4 rule pack (the cost) | S5 reg | Fidelity today |
|---|---|---|---|---|---|---|
| **ES-Barcelona** | ✅ Catastro | ✅ | ✅ MUC | ✅ 5 packs (242.2 construction) | ✅ | `block-constructed` (production) |
| **ES-2nd Catalan city** | ✅ | 🟡 add predicate | ✅ reuse MUC | ✅ reuse 242.2 shape | 🟡 add | **Phase 2 — cheapest proof** |
| **ES-Madrid** | ✅ | ✅ | 🟡 PGOU source | 🔴 `explicit-area` geometry ingest (human) | 🟡 refusal-only today | refusal → Phase 3 |
| **ES-Valencia/Córdoba** | ✅ | 🟡 | 🟡 | 🔴 legal sourcing (human, OCR-verify) | 🟡 | Phase 3 |
| **DK** | ✅ (credential) | 🟡 | 🟡 Plandata | 🟡 **structured** (numbers published — easiest new country) | 🟡 | Phase 4 (start here for countries) |
| **NL** | ✅ PDOK | 🟡 | 🟡 bestemmingsplan | 🟡 `explicit-area` (bouwvlak) | 🟡 | Phase 4 |
| **FR** | ✅ IGN | 🟡 | 🟡 PLU-b | 🔴 legal sourcing | 🟡 | Phase 4 |
| **NO / DE-NW / CH** | ✅ | 🟡 | 🟡 | 🔴 legal sourcing | 🟡 | Phase 4+ |

**The load-bearing truth:** every 🔴 is **legal sourcing of the rule pack (S4)** — human-gated, the entire
cost. Everything else (parcels, router, registration, dispatcher) is cheap engineering. **Do not fund a
plan that is only engineering — it tops out at ~23.8% coverage** (`GEOGRAPHIC-ROLLOUT-MASTER-TRACKER` §4.0).

---

## 3 — Per-CITY rollout order

Authority for per-city realism = `jurisdictions/ENVELOPE-REALISM-MATRIX.md`. Order:
1. **Barcelona** — production (reference).
2. **A 2nd Catalan municipality** — Phase 2 proof (same fabric, near-zero sourcing).
3. **Copenhagen** — first non-ES, because DK is `structured` (published numbers → cheapest new *country*).
4. **Madrid / Valencia** — highest-value Spanish regimes; gated on legal sourcing.
5. **Amsterdam** (NL bouwvlak `explicit-area`), then **Paris** (FR PLU).
Each city inherits its country's S3/S4; "onboard a city" ≈ "wire/verify its country's zone source + pack."

---

## 4 — Dependencies, ownership, gates
- **Strict order Phase 0 → 1 → 2 → 3 → 4.** Phase 0 (fidelity gate) blocks all pack shipping. Phase 1
  (generic engine) is independent and can run alongside Phase 0.
- **Every pack passes the L-449 human-verification gate** before a number renders above
  `pipeline-extracted-unverified`; until then the dispatcher ships a *cited refusal*, never a fabricated number.
- **Reuses (no new work):** the pure solver, the `GeometricRule` union, `DerivationTrace`, the two registries.
- **Does NOT touch:** pricing/valuation, the render pipeline (C58 §1.14 consumer unchanged), heights
  (envelope height is ordinance-derived — ADR-0279 §4).
- **Owner:** UNASSIGNED · **Target:** TBD (per phase, on sign-off).

## 5 — Cross-references
`ENVELOPE-REPLICATION-STANDARD.md` (the standard) · ADR-0279 · C58 (§6 gate, §10.3 per-edge, §1.11
granularity) · C57 · `GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md` · `jurisdictions/ENVELOPE-REALISM-MATRIX.md` ·
`JURISDICTION-PLAYBOOK.md` · `ORDINANCE-EXTRACTION-PIPELINE.md`.
