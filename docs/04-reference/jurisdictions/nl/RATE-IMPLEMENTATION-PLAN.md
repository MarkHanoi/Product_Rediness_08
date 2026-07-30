# Rate Implementation Plan — Netherlands (`nl`) national — PHASE-3 roadmap

**Current composite (C63 RATE):** **71 %** on the assessed subset (`partial:true`) — DATA-SOURCES 90 ·
TERRAIN 50 · CONTEXT 56; PARCEL · LEGISLATION · ENVELOPE · HEIGHTS/LOD all honestly `not-assessed`
(see [`COUNTRY-RATE.md`](./COUNTRY-RATE.md) + the Amsterdam [dossier](./nl-nh/0363-amsterdam/RATE.md)) ·
**Realistic composite ceiling:** ~85–92 % (Scenario A — DSO delivers structured fields) ·
**Gap to ceiling:** ~15–20 pts · **Gap to Denmark (~96 %):** ~4–11 pts — **the smallest gap to Denmark
of any audited country** · **Last updated:** 2026-07-30 · **Owner:** UNASSIGNED

> **§CONTEXT-DATA-HONESTY — this is a PLAN, not a measurement.** Every "axis: from→to" below is an
> *estimated* jump in the composite when the phase lands, not a claim it has landed. This document
> changes **no** RATE % cell in `COUNTRY-RATE.md`, `RATE.md`/`LEGISLATION-RATE.md`, or the Amsterdam
> dossier. Status here tracks WORK; the scorecard cells track the MEASUREMENT and move only when a
> real probe/bake/sample is run.

> **Why the ceiling is ~85–92 %, not 96 %+ (yet).** The Netherlands posts the **highest DATA-SOURCES
> axis (90 %) of any audited country** and is the *only* jurisdiction with all three physical feeds
> national + open + **already wired**: Kadaster **BRK** parcel (`pdok-nl`), **3DBAG** measured height
> (BAG × AHN LiDAR, LoD2.2), and **AHN** terrain (keyless CC0). Five of the seven axes (PARCEL,
> DATA-SOURCES, HEIGHTS/LOD, TERRAIN, CONTEXT — 55 % of the weight) are therefore **cheap engineering
> on feeds that already exist**, not sourcing. The only expensive axes are LEGISLATION (25 %) and
> ENVELOPE (20 %), and both are gated on a single unrun question: does the **DSO / omgevingsplan**
> "Regels op de kaart" API deliver `functie` / `bouwhoogte` / `bebouwingspercentage` as **typed
> structured fields** (Scenario A → ceiling ~85–92 %) or as **plan text** (Scenario B → ceiling
> ~55–65 % until an OCR / rule-extraction pipeline + the L-449 gate are built). The 96 % Denmark
> ceiling is only unreachable because the DSO delivery mode is unverified — not because any physical
> layer is missing.

---

## 1 — The ceiling: what "maximum" means here

The Netherlands is the **closest of any audited jurisdiction to Denmark's machine-readable-planning
ceiling.** Under the **Omgevingswet** (in force 1 Jan 2024) the ~26 sectoral laws + per-area
bestemmingsplan were consolidated into one gemeente-wide **omgevingsplan**, served nationally through
the **DSO** (Digitaal Stelsel Omgevingswet) / `ruimtelijkeplannen.nl` under the machine-oriented
**STOP/TPOD** standard. STOP/TPOD was *designed* to deliver planning rules as typed objects rather
than PDF prose — this is a **DK-like structural opportunity**, increasingly machine-readable and
consolidating fast.

**Ceiling model — Denmark (~96 %).** Denmark hits ~96 % because its national Plandata already delivers
zone code, numeric density, and height as machine-readable structured fields. Drop a pin, get the
numbers; almost no query opens a PDF. That is the proof that ~96 % is reachable when a country
digitises its rules completely.

**Where the Netherlands stands vs. that ceiling.** Unlike every other audited country, the NL *physical*
stack is already at the Denmark bar — national, open, wired. The composite is held below 96 % by exactly
one uncertainty: the DSO **delivery mode** (§3(a)). This is why NL, not Denmark's own neighbours, is the
next country able to approach a near-full composite:

- **Scenario A (DSO delivers structured fields):** composite ceiling **~85–92 %**. LEGISLATION and
  ENVELOPE become a **Lyon-style structured-attribute** integration (config on a national feed), *not*
  a new engine KIND (Paris/Brussels) and *not* an OCR problem (France/Portugal). Ceiling is bounded
  only by transitional-law precedence and per-gemeente coverage roll-out.
- **Scenario B (DSO delivers plan text):** composite ceiling **~55–65 %** — the five physical axes
  still carry the composite (55 % of weight at near-max), but LEGISLATION/ENVELOPE stay capped until an
  OCR / rule-extraction pipeline and the L-449 human-verification gate are built.

**Pilot model — Barcelona (~48 %).** Barcelona demonstrates the phased climb — registry → per-clau
rule packs → block-derived envelopes → refusal vocabulary. NL should mirror the phase **shape** (each
phase names an axis delta, an effort, a dependency, a blocker), while targeting a far higher ceiling
because the physical feeds are already national and wired.

**The ROI order is the inverse of Portugal's.** Portugal must build infrastructure (OCR + cadastral
confirmation) *before* any axis moves. The Netherlands already owns the infrastructure — so the first
wins are the **cheap, already-wired physical axes** (PARCEL, HEIGHTS, TERRAIN), banked *before* the one
expensive unknown (LEGISLATION/ENVELOPE) is probed. Sequence the certain wins first.

---

## 2 — Phase tracker (per-axis, sequenced by ROI)

<!-- Status vocabulary: NOT STARTED · IN PROGRESS · BLOCKED · SHIPPED · VERIFIED · N/A
     "Axis: from→to" = honest ESTIMATED jump in the composite when this phase lands (§CONTEXT-DATA-
     HONESTY), NOT a claim it has landed and NOT an edit to any RATE cell. -->

| Phase | Goal | Unlocks (axis: from→to) | Axis | Effort | Dependency | Blocker | Status |
|---|---|---|---|---|---|---|---|
| **A** — *first win* | **Wire `KadasterBRKParcelProvider` into the site parcel sample + run `computeParcelConfidence` over an Amsterdam bbox.** The provider is already registered (`parcelProviders/registry.ts` `pdok-nl`, national-cadastre rank, keyless `service.pdok.nl` kadastralekaart WFS v5_0 `kadastralekaart:Perceel`) — the sample run has simply never been executed. | PARCEL: `not-assessed` → **measured** (national Kadaster BRK, `national-cadastre` authorityRank → expected high) | **PARCEL (15 %)** | Low | Provider already wired (`pdok-nl`); needs only a sample + `computeParcelConfidence` run (C57 §2.4) | None — highest-authority national cadastre, keyless, verified-live | NOT STARTED |
| **B** | **Wire 3DBAG measured heights into the deployed context tiles** — land the Amsterdam per-city 3DBAG bake (bbox `4.83,52.34,4.97,52.42`, < 0.6° guard, resolves exactly) OR the OSM-footprint-join; probe the per-building `heightProvenance` histogram. **Skip the nDSM DSM−DTM module — 3DBAG is already measured LoD2.2** (BAG × AHN LiDAR, roof-50pctile − ground → real metres, `tagged`). | HEIGHTS/LOD: `not-assessed` → **measured `tagged` fraction** (expected ~97–99 %, the strongest EU building-height source) | **HEIGHTS/LOD (10 %)** | Medium | 3DBAG wired + live (`heightSources.mjs 3dbag` impl:`live`, `REGION_SOURCE.amsterdam:'3dbag'`); reuses the Spain-MDS / Denmark-DHM footprint-join pattern | Whole-country `netherlands` bake **refuses 3DBAG per-tile** (paginated `items` API truncates a 4°×3° scan) → per-city bake or footprint-join must land first; RD-New→WGS84 + NAP datum reprojection (EPSG:7415) | NOT STARTED |
| **C** | **Verify AHN terrain** — bake + `terrain.verify.mjs` independent-decoder round-trip on the AHN `dtm_05m` tileset for the Amsterdam bbox; confirm deployed `layer.json` HTTP 200 + extent + lit-and-correct. | TERRAIN: **50 → 100** (baked-unverified → baked + cross-validated) | **TERRAIN (10 %)** | Low | AHN row present + live (`terrain.mjs nl`, PDOK WCS `dtm_05m`, keyless CC0, GetCoverage HTTP 200 verified 2026-07-25) | None — pure verify step; NL is famously flat so relief fidelity is low-stakes, but the datum lift NAP→WGS84 (`geoidSepM 43.0`) is already wired | NOT STARTED |
| **D** | **Wire the omgevingsplan / DSO feed + L-449 gate** — (D0) probe "Regels op de kaart" at ≥3 addresses, classify Scenario A vs B, set `LEGISLATION-RATE.md`; (D1) ingest `functie` + `goothoogte`/`bouwhoogte` + `bebouwingspercentage` per gebied as a **Lyon-style structured-attribute rule pack**, resolving Omgevingswet transitional-law precedence (legacy bestemmingsplan); (D2) sign `sources/VERIFICATION.md` (L-449). **Start Amsterdam, then Rotterdam / Utrecht / The Hague / Eindhoven** — the feed is national, so per-city cost is marginal once wired once. | LEGISLATION: `not-assessed` → **structured-fill (L-449-gated)**; ENVELOPE: `not-assessed` → **certified/constructed** (Scenario A) | **LEGISLATION (25 %) + ENVELOPE (20 %)** | Medium (Scenario A — config) · High (Scenario B — OCR + L-449) | DSO probe (D0) gates D1/D2; L-449 gate before any value serves at `confidence: structured`; ADR-0269 curate-then-serve; C58 solver | DSO delivery mode **unverified** — the single most important open question; BGT context endpoint returned HTTP 000 in the 2026-07-21 spike (suspected egress, re-verify from unrestricted egress) | NOT STARTED |

**Phase-A is the first move** (see §4). It is the cheapest, most certain jump — the parcel provider is
already registered and verified-live; the only missing step is running the confidence sample.

**Note — CONTEXT (5 %, currently 56 %)** is not a numbered phase here: it rises to ~78 % (7/9) purely as
a side effect when the L-642 rail + trees national re-bake lands (`bake.mjs`), independent of NL. Sea is
genuinely not-applicable for Amsterdam (North Sea coast ~20 km west; the IJ is freshwater) — an honest
N/A, not a fabricated 0.

---

## 3 — The gap to Denmark (~96 %)

**Ceiling model — Denmark (~96 %).** National Plandata delivers zone code, numeric density, and height
as machine-readable structured fields for the whole country. The Netherlands is the **closest audited
country to this ceiling** because its physical stack already matches Denmark's — the gap is a single
axis-pair, not a whole-infrastructure deficit.

Only **one** structural factor separates the Netherlands from the Denmark ceiling, plus two contained
engineering items:

**(a) DSO delivery mode is unverified — the whole gap.** STOP/TPOD is *designed* for structured
delivery, but whether gemeenten actually publish typed numeric values (`bouwhoogte`,
`bebouwingspercentage`) vs. plan text in the annotation fields is **not yet probed**. This is the single
determinant of whether NL lands Scenario A (~85–92 %, near-Denmark) or Scenario B (~55–65 %, OCR
required). Running the D0 probe is the highest-leverage single action in the entire NL plan — it
converts the ceiling from a *signal* into a *measurement*.

**(b) Municipal roll-out volume (not fragmentation).** 342 gemeenten each author an omgevingsplan, but
under **one national framework + one national register** (DSO). This is a Denmark-like *volume* problem
(ingest one national feed at scale), **not** a Spain-like *federation* problem (incompatible per-region
schemas). Once the reader is built against the national DSO once, per-city cost is marginal — which is
why Phase D targets Amsterdam then Rotterdam / Utrecht / The Hague / Eindhoven off the same wiring.

**(c) Physical-axis engineering already scoped (Phases A–C).** The remaining physical distance to
Denmark — a measured parcel sample (A), 3DBAG-in-tiles (B), terrain verify (C) — is pure engineering on
feeds that already exist and are already wired. None of it is sourcing or licence-gated. This is the
part of the gap NL closes *first and cheapest*, before the DSO probe.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

### First move — **Phase A: wire `KadasterBRKParcelProvider`**
The single highest-ROI first action. The provider is **already registered and verified-live** (`pdok-nl`,
national-cadastre authority rank, keyless, a real `perceel ASD04 F 6685 @ Amsterdam` cited in the
Amsterdam dossier). PARCEL sits at `not-assessed` only because `computeParcelConfidence` has never been
run over a sample — not because of any data gap. Running that sample moves the heaviest cheap axis
(15 %) from unknown to measured with **near-zero risk**, and it needs no new sourcing, no licence, no
probe of an external endpoint. Do this before anything else. NL has the **strongest data stack of any
audited country**; Phase A cashes the first instalment of it.

**Hard dependencies (resolve in order):**
- **Phase D0 (DSO probe) gates D1/D2.** Do not scope omgevingsplan ingestion or a rule pack before the
  probe classifies Scenario A vs B. Promising a LEGISLATION number before the probe is the exact
  dishonesty `LEGISLATION-RATE.md` exists to prevent.
- **L-449 (human-verification gate)** governs any rule value — structured or extracted — before it can
  serve at `confidence: structured`. No omgevingsplan number bypasses the signed `VERIFICATION.md`.
- **ADR-0269 (curate-then-serve):** do not serve any omgevingsplan value not verified against a citable
  rule object or document.
- **C58** solver coverage governs the ENVELOPE axis; the Lyon-style structured-attribute pack (Scenario
  A) is config on C58, *not* a new GeometricRule KIND.

**Current blockers:**
- **DSO delivery mode not probed** — the Phase-D0 blocker; `NEXT.md` names it "THE SMALLEST NEXT STEP".
- **Whole-country `netherlands` bake refuses 3DBAG per-tile** (Phase B) — the paginated `items` API
  truncates a 4°×3° scan at ~5000 arbitrary buildings, so deployed tiles render OSM `assumed`. The
  Amsterdam per-city bbox (< 0.6° guard) resolves exactly; the per-city bake or OSM-footprint-join must
  land before HEIGHTS moves off `not-assessed`.
- **BGT endpoint HTTP 000** (`api.pdok.nl/lv/bgt/ogc/v1/collections`) in the 2026-07-21 spike —
  suspected egress/DNS, not confirmed dead. Re-verify from an environment with unrestricted outbound
  access before any BGT-dependent context layer is scoped. Does **not** block the zoning headline.

**Integration facts already confirmed (do not lose):**
- 3DBAG storage CRS is **EPSG:7415 (RD-New + NAP height)** — the pipeline must reproject RD-New → WGS84
  and handle the NAP datum offset (not identical to ground zero; L-477/479 lessons).
- 3DBAG API is **v0.1 beta** — pin the collection vintage (`v2023.10.08`), expect breaking changes.
- 3DBAG licence **CC BY 4.0** → attribution obligation in the data-source disclosure panel.
- AHN terrain wired with `geoidSepM 43.0` (NAP→WGS84 ellipsoidal lift).

**Cross-jurisdiction reuse:**
- **Phase B** reuses the **Spain-MDS / Denmark-DHM OSM-footprint-join** pattern (`heightSources.mjs`) —
  do NOT one-off a per-country height module; 3DBAG feeds the same shared join.
- **Phase D**'s structured-attribute pack reuses the **Lyon** `HBCPRINC`/`PLAFOND`-style resolver — NL
  is the same structured-attribute family, not the Paris/Brussels formula-KIND family.
- If DSO / STOP/TPOD delivers structured rule objects, the reader built here is a **template for any
  jurisdiction moving to digital-rule publishing** — document the reader interface generically, no
  NL-only assumptions baked in.
- The **RD-New → WGS84 + NAP** reprojection adapter is NL-specific but documents the pattern for other
  non-WGS84 national CRS (German GK zones, Swedish SWEREF99).
- The Kadaster BRK provider (Phase A) is already the **national** NL parcel source — no per-city
  integration; Rotterdam/Utrecht/The Hague/Eindhoven inherit it for free.

---

*Model references: **Denmark** `../dk/` (ceiling, ~96 %; NL is the closest audited country to it) ·
**Barcelona** `../es/es-ct/08019-barcelona/` (pilot phased climb) · **Lyon** (structured-attribute pack
family). Feeds: this national plan targets LEGISLATION via
[`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) (the national legislation/data-fill rate — currently
`nl/RATE.md`, pending the L-649 rename) and the composite [`COUNTRY-RATE.md`](./COUNTRY-RATE.md);
Amsterdam city plan: [`nl-nh/0363-amsterdam/RATE-IMPLEMENTATION-PLAN.md`](./nl-nh/0363-amsterdam/RATE-IMPLEMENTATION-PLAN.md).
Governing: **C63** (city completion axes §3/§4), **C58** (fidelity/provenance), **ADR-0269**
(curate-then-serve), **L-449** (human-verification gate), **Omgevingswet 2024** / **DSO / STOP-TPOD**.*
