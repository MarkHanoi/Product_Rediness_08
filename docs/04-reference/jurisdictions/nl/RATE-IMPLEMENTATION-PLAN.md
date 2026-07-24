# Rate Implementation Plan — Netherlands (`nl`) national

**Current rate:** NOT YET ASSESSED (see [`RATE.md`](./RATE.md)) · **Realistic ceiling:** not yet
established · **Gap to ceiling:** unknown · **Gap to Denmark (~96%):** unknown ·
**Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

> The ceiling and gap will be set after Phase 0. The Netherlands' digital-first planning
> infrastructure (DSO / STOP-TPOD) is a strong signal of a potentially high ceiling — but the
> ceiling is not always 96%, and a signal is not a measurement. Phase 0 decides.

---

## 1 — The ceiling: what "maximum" means here

The ceiling is **not yet established** — Phase 0 is the assessment itself.

The Netherlands enacted the Omgevingswet in 2024, consolidating municipal zoning into
**omgevingsplannen** published via the **DSO** (Digitaal Stelsel Omgevingswet) under the
**STOP-TPOD** standard. STOP-TPOD is machine-oriented: it was designed to deliver planning rules
as typed, structured objects — not PDF prose. If that design is realised in practice (i.e. if the
"Regels op de kaart" API returns zone code, FSI/bebouwingspercentage, and bouwhoogte as structured
fields per parcel), the Netherlands could approach the **Denmark ceiling model (~96%)**: near-full
automated answering because the numbers exist as data, not documents.

However, the critical qualifier from the Denmark model applies: **Denmark hits ~96% because its
numbers are already digitised into structured fields** (national Plandata). The Netherlands is
mid-transition. Some municipalities may still deliver plan text rather than typed field values, and
the human-verification gate (L-449) caps how fast extracted numbers can be trusted without manual
sign-off. Until a live DSO probe classifies actual delivery mode, the realistic ceiling — and
therefore the gap to Denmark — cannot be stated honestly. Promising a number now would be the same
dishonesty RATE.md exists to prevent.

**Ceiling scenario A** (DSO delivers structured fields): realistic ceiling ~70–85%, closing to
near-Denmark levels once ingestion is built across all municipalities.
**Ceiling scenario B** (DSO delivers plan text): realistic ceiling ~30–40% until an
OCR/rule-extraction pipeline is built and the L-449 human-verification gate is operational.

---

## 2 — Phase tracker

<!-- Status vocabulary: NOT STARTED · IN PROGRESS · BLOCKED · SHIPPED · VERIFIED · N/A
     Rate delta = honest estimated jump in RATE.md when this phase lands, not a claim it has landed.
     Status here tracks WORK; RATE.md tracks the MEASUREMENT. -->

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Assess DSO/omgevingsplan API — query "Regels op de kaart" at ≥3 sample addresses (one Amsterdam, one Rotterdam, one rural); classify each rule field as structured data or plan text; write RATE.md baseline | The honest baseline rate + realistic ceiling (Scenario A or B) | — → TBD | ~1 dev-day | NOT STARTED | UNASSIGNED |
| **1** | Ingest zone/use code per parcel from omgevingsplan (DSO) | Zone layer: PRYZM can answer "what zone is this plot in?" without a PDF | TBD → TBD | Medium | NOT STARTED | UNASSIGNED |
| **2** | Ingest density metric (FSI / bebouwingspercentage) per parcel; OR (Scenario B) build STOP-TPOD rule-extraction + L-449 human-verification gate for density fields | Density layer: PRYZM can answer "how much can I build?" automatically | TBD → TBD | Medium (Scenario A) · High (Scenario B) | NOT STARTED | UNASSIGNED |
| **3** | Ingest allowed height (bouwhoogte) per parcel; re-derive RATE.md from live checks | Height layer completes the fill-rate triplet; first VERIFIED rate measurement | TBD → ceiling | Medium (Scenario A) · High (Scenario B) | NOT STARTED | UNASSIGNED |
| **4** | Probe and ingest heritage-overlay layer (rijksmonumenten / beschermd stadsgezicht) per parcel; re-verify BGT endpoint from non-geo-fenced environment | Overlay flag for historic-area plots; completes context gate | ceiling (maintained) | Low–Medium | NOT STARTED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

**Ceiling model — Denmark (~96%).** Denmark's national Plandata service delivers zone code, numeric
density, and height as machine-readable structured fields for the whole country. Drop a pin, get the
numbers — almost no query needs to open a PDF. This is the proof that ~96% is reachable when a
country digitises its rules completely.

Three structural factors currently separate the Netherlands from that ceiling:

**(a) DSO delivery mode is unverified.** The STOP-TPOD standard is designed for structured delivery,
but whether municipalities are actually publishing typed numeric values (FSI, bouwhoogte) vs. plan
text in the annotation fields is not yet known. This is the single most important question. If
delivery is plan text, the gap to Denmark requires an OCR/rule-extraction pipeline before it can
close — analogous to France's position, not Denmark's.

**(b) Municipal fragmentation.** The Netherlands has 342 municipalities, each authoring its own
omgevingsplan. Even if STOP-TPOD delivers structured fields, an ingestion reader must handle 342
endpoints or their aggregated national feed. This is a Denmark-like engineering problem (volume),
not a Spain-like federation problem (incompatible schemas) — but it still requires systematic work.

**(c) BGT endpoint geo-fence / access issue.** The BGT (Basisregistratie Grootschalige Topografie)
endpoint returned HTTP 000 in the 2026-07-21 spike, blocking the context-layer gate. This does not
affect the zoning-rate headline but must be resolved to complete the physical-context layer
(roads/water/green at object level).

**Pilot model — Barcelona (~48%).** Barcelona's phased climb — registry → per-clau rule packs →
block-derived construction envelopes → refusal vocabulary — demonstrates how to structure the work.
The Netherlands should mirror this phase shape (each phase names a rate delta, an effort, and a
status) while targeting a higher ceiling if Scenario A holds.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Dependencies:**
- Phase 0 must complete before any rate number is stated or any ingestion work is scoped. Do not
  start Phase 1–3 without the DSO probe result.
- L-449 (human-verification gate) governs any rule values extracted via OCR or rule-extraction
  pipeline (Scenario B). No extracted number can be served at `confidence: 'structured'` without
  passing the L-449 gate.
- ADR-0269 (curate-then-serve) applies: do not serve any omgevingsplan value that has not been
  verified against a citable rule object or document.

**Blockers:**
- DSO probe not yet run — this is the Phase 0 blocker. NEXT.md names it as "THE SMALLEST NEXT STEP."
- BGT endpoint (`api.pdok.nl/lv/bgt/ogc/v1/collections`) returned HTTP 000 in spike env —
  suspected egress/DNS issue, not confirmed dead. Must be re-verified from an environment with
  unrestricted outbound access before BGT-dependent context layers (roads, water, green) are scoped.

**Integration facts already confirmed (do not lose):**
- 3DBAG storage CRS is **EPSG:7415 (RD New + NAP height)**; pipeline must reproject RD-New → WGS84
  and handle NAP datum offset (not identical to our ground zero — see L-477/479 lessons).
- 3DBAG API is v0.1 **beta**; pin the collection vintage (`v2023.10.08`) and expect breaking changes.
- 3DBAG license is **CC BY 4.0** → attribution obligation in the data-source disclosure panel.

**Cross-jurisdiction reuse:**
- If DSO / STOP-TPOD delivers structured rule objects, the reader built here is a **template for
  any jurisdiction moving to digital-rule publishing** (other EU member states adopting similar
  digital-planning frameworks). Document the reader interface generically — do not bake in NL-only
  assumptions.
- The STOP-TPOD rule-extraction pipeline (Scenario B), if built, is reusable wherever plan text
  must be parsed into typed fields — potential reuse for France (PLU prose) and Germany (BauNVO
  §17 text) with jurisdiction-specific tuning.
- The RD-New → WGS84 + NAP datum reprojection adapter is NL-specific but documents the pattern for
  other non-WGS84 national CRS (German GK zones, Swedish SWEREF99).

---

*Model references: **Denmark** `../dk/` (ceiling, ~96%) · **Barcelona**
`../es/es-ct/08019-barcelona/` (pilot climb). Governing: **C58** (fidelity/provenance),
**ADR-0269** (curate-then-serve), **L-449** (human-verification gate).*
