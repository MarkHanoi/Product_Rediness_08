# MASTER PROMPT — Nationwide Netherlands Legal Building Envelope Engine v1.0 · 2 September 2026

> **PROVENANCE — read before citing.** Founder-forwarded EXTERNAL research (the "Look Within"
> email, dated 2 September 2026), captured to the repo 2026-09-03 per the standing
> `capture-founder-research-to-repo` rule (founder research → repo docs same-turn). This is a
> faithful reconstruction from the forwarded material: every section number, requirement, table
> and JSON structure the forward carried is preserved; where the forward compressed a section to
> its shape (noted inline, §14 only), the reconstruction records exactly what was forwarded and
> does not invent the elided detail. This document is a REFERENCE input, not a PRYZM contract —
> the audit against PRYZM's shipped NL stack is the sibling `NL-DATA-GAP-AUDIT.md`.

---

## §0 Objective

Every NL cadastral parcel → the legally applicable 3D envelope, **or precisely why not**.
Auditable, date-correct, legally sourced.

---

## §1 Non-negotiables

- **Determinism.** Same parcel + `as_of_date` → **byte-identical** output. Extraction runs
  **once**, is human-signed, and is stored; the runtime solver **never invokes an LLM**; **no
  vector search** anywhere in rule resolution.
- **No value without an article.** Every number carries its legal source article. CI-asserted.
- **Never invent a constraint.**
- **Human signature gate.** There is a state between *extracted* and *publishable*; Status A
  (§9) is **unreachable without a human signature**; confidence (§13) is **not** a substitute
  for the signature.
- **Partial over blank.** A partial, honestly-bounded answer beats an empty one.

---

## §2 PHASE 0 — measure first (M1–M6)

Measure before building. **STOP and report** the six numbers before any construction work.

| # | Measurement |
|---|---|
| **M1** | `bouwvlak` coverage — % of parcels with a published bouwvlak, broken down **by bestemming type** and **urban/rural**. |
| **M2** | `maatvoering` fill % — per parameter: `bouwhoogte`, `goothoogte`, `bebouwingspercentage`, `inhoud`, `aantal bouwlagen`. |
| **M3** | Status distribution of **500 random parcels** pushed through the §9 taxonomy (A–F). |
| **M4** | `peil` resolvability in **50 sampled plans** — the distinct `begripsbepaling` (definitions-article) peil definitions, with frequencies. |
| **M5** | Roof determinacy — `goothoogte` + `bouwhoogte` co-occurrence; sufficiency of `dakhelling` / `nokrichting` / `kap` rules to determine a **unique** roof. |
| **M6** | Legacy split — share of territory/parcels governed by the **Omgevingsplan** (IMOW) vs **legacy Wro/IMRO** plans. |

---

## §3 Sources

- **Kadaster BRK / Kadastrale Kaart** via **PDOK OGC API**. The cadastral map is
  **INDICATIVE, never survey-grade**.
- **DSO** APIs: **Presenteren v8**, **Download v1**, **Geometrie Opvragen v1**,
  **Omgevingsinformatie v2**.
- **Legacy Wro/IMRO** via **Ruimtelijkeplannen**. The geometry endpoints on the **old Download
  API were retired in 2026 — do not build on them.** Never scrape map UIs.
- **AHN** DTM/DSM in NAP — **evidence** for elevation, **never** the legal `peil` definition.
- **BGT** — for `peil` interpretation + frontage typing.
- **BAG** — `pand` context, **never entitlement**.
- **CRS:** RD New / **EPSG:28992**; heights in **NAP**.

---

## §4 FOUR legal tiers, modeled separately

1. **Bkl** — national instruction rules (Besluit kwaliteit leefomgeving).
2. **Provinciale omgevingsverordening** — some provisions bind citizens directly.
3. **Omgevingsplan** / legacy **bestemmingsplan** (the municipal layer).
4. **National vergunningvrij rights** (§8).

**Bbl** technical requirements are logically separate — **never merged into the spatial
envelope.**

---

## §5 Rule discovery

- **A — Spatial lookup.** Every intersecting legal location object, with document id / type /
  status / version / dates / replacement chain.
- **B — Temporal selection** via `as_of_date` — **never simply newest**.
- **C — The overlay stack.** `dubbelbestemming` (archeologie / waterstaat / leidingen),
  `gebiedsaanduiding` (geluidzone / vrijwaringszone / milieuzone / veiligheidszone),
  `functieaanduiding`, `bouwaanduiding`, `figuur` — these **SUBTRACT/condition** the envelope;
  they are **not optional**.
- **D — Precedence.** Implement the **voorrangsregeling** as a **DISTINCT operation**:
  intersection ≠ conflict resolution.

---

## §6 Legal semantic model

**Never naked numbers.** Every extracted value is a full record:

```json
{
  "parameter": "max_bouwhoogte",
  "value": 12.0,
  "unit": "m",
  "reference_datum": "peil (as defined in plan begripsbepalingen)",
  "applies_to": "hoofdgebouw",
  "location_scope": "bouwvlak",
  "legal_source": {
    "document": "NL.IMRO.….",
    "article": "…",
    "paragraph": "…",
    "version": "…",
    "effective_from": "…"
  },
  "extraction": {
    "method": "…",
    "extractor_version": "…",
    "prompt_hash": "…",
    "confidence": "…",
    "signed_by": "…",
    "signed_at": "…"
  }
}
```

---

## §7 Constraints

- **7.1 — `peil` is a first-class legal variable.** Extract the plan's `begripsbepaling` →
  identify the physical points it references → use AHN/BGT/BAG **as evidence** → compute only
  where defensible → otherwise emit a vertical envelope
  **`legally-bounded-datum-unresolved`** — never fabricate a datum.
- **7.2 — `bebouwingspercentage` denominator is not assumable** (`bouwvlak` vs
  `(bouw)perceel`). Store numerator / denominator / `scope_geometry` / `legal_definition`. An
  omitted percentage = 100 **only where the TEXT says so**; `null` is never auto-interpreted.
- **7.3 — `bouwvlak` ≠ buildable footprint.** Model `main_building_envelope` vs ancillary
  (`bijbehorende bouwwerken` / `aanbouwen` / `overkappingen`) vs `total_buildable_rights`;
  some structures are legal **OUTSIDE** the bouwvlak.
- **7.4 — Roof geometry is never invented.** `goothoogte` + `bouwhoogte` = **two limits, not a
  roof plane**. Search for `dakhelling` / `kap` / `plat dak` / `nok` / `nokhoogte` /
  `nokrichting` / symmetry / dormer rules / exclusions; otherwise
  `roof_geometry_status = UNDERDETERMINED` **with permissible bounds**.
- **7.5 — `inhoud` is genuinely volumetric.** `V(x) ≤ V_max` tested against candidate
  geometry; `zoning_bound ≠ volume_bound`.
- **7.6 — Inclined-plane operators.** The **molenbiotoop** is the canonical radiating height
  surface — **build the primitive once** and reuse it.
- **7.7 — Simultaneous constraints are intersected** — never a premature "dominant parameter".
- **7.8 — Conditional / discretionary detection.** `afwijking` / `bevoegd gezag` / `mits` /
  `indien` / `overgangsrecht` / `maatwerk` — represented **separately**, never silently
  converted into a right.

---

## §8 Vergunningvrij (national permit-free layer)

Compute the `achtererfgebied` / `bebouwingsgebied`. It is **NOT uniformly additive**: apply
**monument + beschermd stadsgezicht carve-outs FIRST** (they may subtract), and it is never a
generic 5 m extension.

---

## §9 Status taxonomy A–F

| Status | Meaning |
|---|---|
| **A** | Fully determined — **requires human signature**. |
| **B** | Determined **with conditions**. |
| **C** | **Bounded underdetermined** (honest bounds, no unique geometry). |
| **D** | Requires **legal interpretation**. |
| **E** | **Source missing.** |
| **F1** | Plan exists but has **no envelope mechanism** — **a gap**. |
| **F2** | **Correct null** (water / infrastructure) — **not a gap**. |

**F1 ≠ F2, or every coverage statistic corrupts.** And more broadly:
**DATA MISSING ≠ NO UNIQUE GEOMETRY ≠ DISCRETIONARY ≠ NOT PERMITTED ≠ NOT APPLICABLE.**

---

## §10 Architecture

- A **Common Legal Spatial Model** with **two adapters** — Omgevingsdocument (IMOW) + legacy
  IMRO. The engine never operates on raw API formats.
- Indexes: parcel → planning-location → document → rule → geometry.
- **Cache nationally, never per-parcel API calls.**
- Envelope JSON:

```json
{
  "main_building": {
    "horizontal": "…", "vertical": "…", "roof": "…", "volume": "…", "constraints": "…"
  },
  "ancillary": "…",
  "national_permit_free_layer": "…",
  "overlays": "…",
  "exceptions": "…",
  "uncertainties": "…",
  "status": "A–F",
  "signature": "…"
}
```

- **Construction order:** horizontal ∩ → vertical (peil-based) → roof rules or UNDERDETERMINED
  → overlays in voorrang order → inclined planes → volume test.
- **DB tables:** `parcels` / `planning_documents` / `legal_locations` / `rules` /
  `constraints` / `overlays` / `envelopes` / `evidence` / `signatures` — evidence carries
  `extractor_version` + `prompt_hash`.

---

## §11 Explanation requirement

Every envelope carries the full why-chain — including the **verbatim peil definition** and the
NAP derivation — signed.

---

## §12 Rule parsing

Dutch vocabulary dictionaries + a **compositional grammar** (e.g. *"ter plaatse van de
aanduiding … mag de bouwhoogte maximaal 12 m bedragen"* → subject / location / type / value).
Normalized IF/THEN internal form. **Parsed ONCE offline, signed; the runtime only evaluates.**

---

## §13 Confidence

HIGH / MED / LOW / UNDETERMINED, derived from **8 named factors**. Confidence **informs the
signer, never replaces** the signature (§1).

---

## §14 Build order 1–10

> *Capture note: the forward names this section as a ten-step ordered build plan and fixes its
> ordering constraint — **Phase 0 (§2) first, then STOP and report** before building anything.
> The individual step list was not carried in the forward; recover it from the original email
> if step-level fidelity is needed.*

---

## §15 Acceptance criteria

- Byte-identical reruns (determinism, §1).
- CI: **no value without an article**.
- **No Status A without a signature.**
- `goothoogte` + `bouwhoogte` + no roof rule → **UNDERDETERMINED, never a triangle** —
  hand-built fixture.
- Discretionary is never rendered prescriptive — hand-built fixture.
- `inhoud` actually constrains geometry.
- The **voorrangsregeling** is honored.
- **Beschermd stadsgezicht gets no generic permit-free volume.**
- **F1 / F2 counted separately.**
- Changing `as_of_date` changes the envelope where the law changed.
