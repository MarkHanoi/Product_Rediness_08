# NEXT — Sweden (`se`, national, PBL / NGP)

> WHERE WE STOPPED + how to resume. README = what is true now; this = where we stopped.
> Last updated: 2026-07-24 · Maintainer: UNASSIGNED · Status: research complete; no probe executed; no rule pack; no code.

---

## 1 — WHERE WE STOPPED (the one-paragraph truth)

Sweden has been fully characterised at the legal/structural level — PBL, NGP, Planbestämmelsekatalog,
Lantmäteriet cadastre, LiDAR terrain, RAÄ heritage — and is structurally the most promising
jurisdiction studied after Denmark. No API endpoints have been live-probed, no sample parcels
queried, and no code has been written. The single biggest unknown — what fraction of currently-operative
zoned land area (not municipalities) is actually in NGP — is unresolved and is the entire basis for
whether Sweden is Denmark-class (high coverage, fast to implement) or Germany-class (good standard,
poor fill). That one measurement is the gating step before any implementation decision.

---

## 2 — THE NUMBER

**❔ UNVERIFIED — no live probe has been executed.**

Estimated range (from structural research): the post-2022 plan stock is likely at **81%
municipality-participation level** (236/290 kommuner delivering to NGP), but the land-area hit rate
for a random buildable click is **unknown** and likely substantially lower — the majority of
currently-operative zoned land area is likely still governed by pre-2022, undigitised plans.

A direct Monte-Carlo probe (same method as Denmark's L-609 byzone sampling) against the NGP WFS for
one mid-size participating municipality would convert this from a structural estimate to a measured
number. Until then, treat the 81% as a ceiling, not a floor.

---

## 3 — BLOCKERS (each: what · why it blocks · what would unblock it · exact resume step)

### 3.1 — NGP API endpoint not live-probed

- **What it is.** The NGP WFS endpoint URL for detaljplan features has not been fetched or
  GetCapabilities-verified. Lantmäteriet operates the platform but the specific service endpoint is
  not confirmed from the research pass.
- **Why it blocks.** Cannot measure land-area fill rate, cannot write a provider, cannot confirm
  field names or CRS.
- **What would unblock it.** A single `GetCapabilities` request to the NGP WFS (or equivalent
  INSPIRE atom feed / REST API).
- **THE EXACT RESUME STEP.** Fetch `https://www.lantmateriet.se/en/geodata/geodata-products/` or
  search `lantmateriet.se` for "NGP API" / "nationella geodataplattformen WFS" to find the live
  endpoint. Then run:
  ```
  GET <endpoint>?service=WFS&version=2.0.0&request=GetCapabilities
  ```
  and confirm the detaljplan feature type name and its attributes (especially provision codes,
  geometry, and plan identity).

### 3.2 — Land-area fill rate (the critical unknown)

- **What it is.** No measurement exists of what fraction of buildable land (byzone equivalent) in
  any Swedish municipality returns a usable plan result from NGP.
- **Why it blocks.** This is the number the entire readiness estimate hinges on. High municipal
  participation + mostly-pre-2022 plan stock = potentially low hit rate even in participating
  municipalities.
- **What would unblock it.** Query NGP for one mid-size municipality (Gothenburg recommended —
  first to deliver building records to NGP, likely most data-forward), run a grid or Monte-Carlo
  sample of points, record hit/miss. Same method as Denmark L-609.
- **THE EXACT RESUME STEP.** Once Blocker 3.1 is resolved:
  1. Obtain byzone / urban-area boundary for Gothenburg (SCB or Lantmäteriet polygon).
  2. Run 100–300 area-weighted random points against the NGP detaljplan WFS.
  3. Record: hit with structured provision codes / hit with plan reference but no codes / no result.
  4. Write result to `findings/` and update §2 of this file.

### 3.3 — Lantmäteriet "akt" (deed) access currently closed

- **What it is.** Lantmäteriet's digital services for accessing deed/instrument (akt) information
  are closed following a government security inquiry. This is a live, dated restriction.
- **Why it blocks.** Akt access is needed to retrieve the underlying governing document for a
  detaljplan — the equivalent of the signed Satzung in Germany. Without it, the "informational
  vs. certifying" status of NGP plan data cannot be confirmed against the original.
- **What would unblock it.** Lantmäteriet lifting the restriction. Check
  `https://www.lantmateriet.se` for current status — this may have changed since research date.
- **THE EXACT RESUME STEP.** GET `https://www.lantmateriet.se/sv/geodata/` and search for news
  about "akt" or "informationssäkerhet" to confirm current status.

### 3.4 — Planbestämmelsekatalog API endpoint not live-probed

- **What it is.** The Boverket Planbestämmelsekatalog API for provision-code lookup has not been
  fetched or verified.
- **Why it blocks.** Cannot confirm the join key between NGP provision codes and the katalog.
- **THE EXACT RESUME STEP.** Fetch the Boverket API documentation at `https://pb.boverket.se/` or
  `https://www.boverket.se/planbestammelsekatalog` and run a GetCapabilities or REST discovery call.

### 3.5 — LOD2 / building height: per-city status unknown outside Stockholm

- **What it is.** Stockholm's LOD2 building models are confirmed fee-based. Other cities (Gothenburg,
  Malmö) are unknown.
- **Why it blocks.** Cannot include building-height layer in any context-data implementation plan
  until the licence model is confirmed for the target city.
- **THE EXACT RESUME STEP.** Check Gothenburg's geodata portal (`https://goteborg.se/geodata` or
  similar) for LOD2 / 3D building model download or API. Check Malmö similarly. Record results in
  `topics/buildings-lod-height.md`.

---

## 4 — TRIP-WIRES (if you see X elsewhere, come back HERE and do Y)

- **4.1 — If you find the NGP WFS endpoint working anywhere in the codebase:** update §3.1 and run
  the Gothenburg fill-rate probe immediately (§3.2).
- **4.2 — If you are area-weighting ANY jurisdiction's fill rate:** expect the count→area move to
  go the "wrong" way when big polygons are the empty/older ones (as in Denmark). Do not assume
  81% municipal participation → 81% land-area fill. Come back and re-read Denmark L-609 §2.
- **4.3 — If you add footprint/coverage or LOD2 building-height as a field to the L0 zoning schema
  (for any country):** Sweden/Gothenburg is a candidate consumer — check whether Gothenburg now
  offers free LOD2 via NGP (it was the first city to deliver a building record there).
- **4.4 — If you find Lantmäteriet "akt" access restored:** update Blocker 3.3 and re-assess
  whether NGP plan data can be elevated from `stated`/`published` to `verified-live` confidence for
  the governing-document link.
- **4.5 — If another jurisdiction uses a "mandatory national digital plan standard since [year]":**
  apply the same "participation vs. land-area fill" distinction that is the core lesson here.
  The Swedish finding generalises: adoption of a standard ≠ coverage of existing plan stock.
- **4.6 — If you find Sweden's pre-2022 plan retro-digitisation rate:** this is the number that
  determines whether the NGP hit rate for a random parcel is 40% or 80%. Flag here and update §2.

---

## 5 — WHAT IS ALREADY BUILT (do not redo)

- The legal-structural study (this README + `findings/SWEDEN-MASTER-DATA-SOURCE-STUDY.md`) —
  do not re-research the PBL hierarchy, NGP mandate dates, or Planbestämmelsekatalog existence.
- The readiness estimate table in `README.md §3` — confirmed from primary sources, not just paraphrase.
- The first-city sequencing recommendation (Gothenburg → Malmö → Stockholm) with rationale.

---

## 6 — VERIFIED SOURCES (endpoint · answers · tier · exact query)

| Source | Answers | Tier | Note |
|---|---|---|---|
| `https://www.lantmateriet.se` | Lantmäteriet cadastre + terrain + NGP operator | DOCUMENT — not live-probed | Open-data product pages; CC0 licence confirmed |
| `https://pb.boverket.se/` (or Boverket API) | Planbestämmelsekatalog — ~3,700 provision codes, XML/JSON/Excel | DOCUMENT — not live-probed | Existence + format confirmed from published Boverket sources |
| `https://www.boverket.se/op-katalogen` | ÖP-katalogen — comprehensive plan API | DOCUMENT — not live-probed | Existence confirmed; coverage and field names not checked |
| `https://www.raa.se` / RAÄ Öppna-dataportal | Ancient monuments, culturally historic buildings, heritage areas | DOCUMENT — not live-probed | CC0 licence confirmed for some datasets; WMS confirmed |
| NGP WFS endpoint | Detaljplan polygons + provision codes | ❔ UNVERIFIED — URL not confirmed | **Must probe before any implementation** |

---

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)

None yet — no live probes have been executed. This section will be populated after the Gothenburg
fill-rate probe (§3.2).

---

## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost

**Find the NGP WFS endpoint and run `GetCapabilities`** (Blocker 3.1).

Cost: ~1 hour. The Lantmäteriet developer portal (`https://www.lantmateriet.se/en/geodata/`) or a
direct search for "NGP WFS detaljplan" is the starting point. Once the endpoint is confirmed, the
Gothenburg fill-rate probe (§3.2) follows immediately and converts the structural estimate into a
measured number — exactly the same move that turned Denmark's hypothesis into the 87% byzone
measurement. That is the highest-value measurement available.
