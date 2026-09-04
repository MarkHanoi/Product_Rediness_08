# FR Data Gap Audit — the founder's reachability research vs the shipped France stack

> **Lane:** FR-DATA-AUDIT, 2026-09-03. **Input:** `FR-DATA-REACHABILITY-RESEARCH.md` (the
> founder's forwarded "Look Within" research, captured verbatim beside this file).
> **Question answered:** *"tell me if there is any missing data to be able to build the
> buildable envelope/volume in France."*
> **Method:** every claim below is verified against code or a committed doc and cited; where
> the email demanded a code check ("verify, don't assume"), the grep/read was run this lane.
> **Vocabulary ruling honoured:** the email's five states (🟢 source-complete / 🔵 derivable /
> 🟡 extractable / 🟠 interpretive / 🔴 undeterminable) are MAPPED onto the repo's existing
> Ω/P/V slots + L0–L7 legends (`STR-ENVELOPE-SUFFICIENCY-LEGENDS.md`) and A1–F8 parameters
> (`STR-ENVELOPE-PARAMETER-REFERENCE.md`) in §1.4 — no third vocabulary is minted.

---

## 0. ONE-PAGE VERDICT

**There is no missing DATA. There is one missing PIPELINE, and a short list of derivations
we have not yet built from data we already reach.** For a documented-PLU parcel (the ~89% of
zones with a v2017+-shaped `idurba`, NOMFIC fill 100.00% there — `FR-PHASE0-REPORT.md` §0/§2),
France publishes or lets us compute every envelope input; what PRYZM has not built is the
règlement parameter-extraction leg (the email's stages 4–5, our brief's steps 6–7) and four
smaller derivations. Nothing on the hard-red list blocks the product — every hard-red item is
already a shipped, typed refusal.

Against the irreducible core of eight fields (`STR-ENVELOPE-PARAMETER-REFERENCE.md` summary):

| Field | Email state today, in PRYZM | Evidence |
|---|---|---|
| A1 parcel | 🟢 source-complete, SHIPPED | `ign-fr` parcel provider + `/api/parcel/fr`, live-proven (`countryAdapters/fr/index.ts` §J note; region doc "Parcel (A1)… wired") |
| A2 datum | 🟢 terrain value SHIPPED (`frAltimetry.ts`, RGE ALTI point, sea-sentinel-honest) / 🟠 datum *semantics* interpretive — seat exists and refuses (`HeightDatum.ts` ADR-0377, `unknown` never binds), resolution from règlement text unbuilt; façade-profile sampling unbuilt (L-584) |
| A3/A4 frontage typing + width | 🔵 derivable, NOT BUILT for FR (§2d) — cadastre + BD TOPO roads are reachable; no FR code computes road-facing edges |
| C1 ordering type | 🔵/🟡 — regime + derivability class shipped (`FrDerivability`, `frNoExtraction.ts`); per-zone ordering type awaits règlement extraction |
| C2 height | 🟢 where drawn (61,176 `typepsc=39/02` polygons — consumed, `frPrescriptionGeometry.ts`, number carried, datum-honest, non-binding) / 🟡 extractable elsewhere (règlement text; NOMFIC 99.16% proves the file is reachable) |
| C3 storeys | 🟡 extractable (règlement text only) — nothing built |
| C4 footprint limit (emprise) | 🟢 where drawn (plan-masse 14.00, 5,291 sectors — consumed) / 🟡 extractable (38.02 polygons NOT yet consumed §2g; emprise ratio in text) |
| C5 setbacks | 🟢 where drawn (15.xx — 69,739 lin + 51,407 surf, consumed) / 🟡 numeric retraits in text |

**So: of the envelope inputs, everything the email calls 🟢/🔵 is either shipped or a bounded
build on already-reachable data; the entire 🟡 middle is ONE règlement-extraction pipeline
(SRU-XML → structured text → PDF → graphic ladder, §2a/§2g) that no code implements today
(grep: zero SRU/XML consumption in `countryAdapters/fr/`); the 🔴 list is fully covered by
shipped refusals** (`frStep4RnuRefusal`, `frPosCaducRefusal`, `frPsmvRefusal`,
`frSecteurCcRefusal`, `frPlanMasseRefusal` — `frNoExtraction.ts`). Per the email's own
instruction, no recovery percentage is asserted here — the 100-parcel value-recovery audit
(§3) is the instrument that produces that number; Phase 0 measured *file reachability*, not
*value recovery*.

**One correction to propagate now (§4):** four shipped texts say "France has no floor-area
quantum constraint / no D1 at all". The email's §13 overturns the blanket form: COS is dead
(discard), but *surface de plancher* is an active defined metric and SDP-based floor-area
rules are potentially ACTIVE in a given PLU. D1 stays nullable — it must not become
unreadable.

---

## 1. CONFIRMED-ALIGNED — where the email and the shipped stack already agree

### 1.1 Rule-STATE answers, not nullable numerics (email §4/§5/§15)
The email's central architecture claim — "the solver asks *what is the STATE of the height
rule*", with `resolved / qualitative / alternative / refused` JSON — is the shipped FR
architecture, almost field-for-field:
- `FrSlice<T> = resolved{value, provenance} | unresolved{refusal_reason, retryable}` — no
  default, no null-as-0 (`frNoExtraction.ts` header "ABSENCE DISCIPLINE"; brief §1.2).
- `EnvelopeRefusal` cards carry headline/detail/ordinanceRef/knownFacts — the email's
  `refused{reason RNU}` with the citation attached.
- The email's `source: SRU_XML, article: UC 4.2` provenance is our F1–F8 `RuleSourceRef` +
  `validityBasis` (8-field legal address on every slice — `FrSliceProvenance`).
- There is deliberately **no numeric envelope field anywhere** in the step-4 record type
  (the L-616 seam, `frNoExtraction.ts` header) — exactly the email's "RULE EXISTS/TYPE/
  LOCATION/SOURCE=YES, VALUE=NOT ALWAYS" split, encoded structurally.

### 1.2 Datum-as-rule (email §8) — ALREADY SEATED
The email's point that terrain data is 🟢 but *which elevation the PLU means* is rule
semantics 🟡 is ADR-0377, shipped:
- `packages/schemas/src/site/HeightDatum.ts` — discriminated union (facade-rasant /
  street-level / mean-ground-at-facade / absolute-national+frame / terrain-highest/lowest /
  `unknown`), `unknown` first-class, **every resolver consumer REFUSES on it**.
- `frPrescriptionGeometry.ts` applies it: a 39/02 height libelle gives the number and the
  TOP point (faîtage/égout/acrotère parsed by `parseFrHeightLibelle`) but NOT the ground
  plane → `heightDatum: UNKNOWN_HEIGHT_DATUM`, `appliesAsBindingCap: false`,
  `bindingBasis: 'study-upper-bound-datum-unresolved'`. The number is carried and cited,
  never multiplied into a volume on an unresolved plane.
- `frAltimetry.ts` carries the same honesty line on the terrain slice ("a measured point
  elevation is not the règlement's datum").
Nothing to adopt from §8 — the email confirms an architecture we already run.

### 1.3 The hard-red list = our shipped refusal vocabulary (email §9/§10, Part 2 🔴)
Verified in code, item by item:
- **RNU→PAU:** `frStep4RnuRefusal` names the RNU by the per-commune `is_rnu` flag, states
  "PAU membership: undeterminable from any dataset — never claimed", and NAMES the GPU-flag
  vs SuDocUH count discrepancy while quoting neither aggregate (`frNoExtraction.ts`).
- **POS caducity → RNU fall-through:** `frPosCaducRefusal` (art. L174-1) — and the zone row
  of a dead POS is never read for permitted uses (the Artigue guard, `frNoExtraction.ts`
  uses-slice comment).
- **PSMV building-by-building, carte-communale sectors, plan-masse override:**
  `frPsmvRefusal` / `frSecteurCcRefusal` / `frPlanMasseRefusal`, all typed `derived-plan`.
- **Party-wall (mitoyen):** brief §9 "Never claim these" already lists it; no FR code
  pretends to derive it.
- **ABF / future decision / discretion:** brief §9; no code path asserts consent.

### 1.4 The five-state model MAPPED onto the repo vocabulary (the no-third-vocabulary ruling)
| Email state | Repo equivalent — use THESE spellings | Where |
|---|---|---|
| 🟢 source-complete (①native numeric / drawn geometry) | F7 `resolved` + the P1 "explicit authoritative geometry — CONSUME" tier; legends **L0/L1** | `frPrescriptionGeometry.ts`; legends §A.2/A.3 |
| 🔵 derivable (computed from national physical data) | F4 `computed` with F5 inputs; slot fills via P2–P4/V2 | `STR-ENVELOPE-PARAMETER-REFERENCE.md` F-table |
| 🟡 extractable (②SRU XML / ③PDF text) | `FrDerivabilityClass = 'reglement-text-path'` + F4 `direct`/`table-lookup` once extracted; legends **L2/L3** | `frNoExtraction.ts`; region doc FRANCE block |
| 🟠 interpretive (④graphic / qualitative / datum semantics) | R151-12 → `discretionary` range (brief §3.6/§7 gate); graphic-primacy precedence kind (Marseille, ADR-0270/C58 §2.2); `HeightDatum` `unknown` | brief; `region-iberia-france.md` Marseille |
| 🔴 undeterminable (⑤human judgement) | `EnvelopeRefusal` (typed, cited); legend **L7** "no sufficient set exists" | `frNoExtraction.ts`; legends §A.3 |
The email's four-layer table (facts YES / spatial rules YES / parameters OFTEN / judgement
NO) is the same partition as our pipeline stages: its stages 1–3 (data access, spatial
intersection, rule classification) are the SHIPPED step-4 product; stages 4–5 (parameter
extraction, legal semantic parsing) are the unbuilt steps 6–7; stage 7 = refuse — which is
exactly the region doc's "the one thing that unblocks the most is the règlement-extraction
pipeline".

### 1.5 Qualitative ≠ unknown — DOCTRINE aligned, CODE partial
The email's 🟠 rule ("report QUALITATIVE RULE, not UNKNOWN") is our brief §3.6/§7: R151-12
qualitative rules → quote verbatim, emit a `discretionary` range, "a qualitative rule
silently converted to a number is the worst failure". The height-cap parser already
distinguishes *value-in-text* from *datum-unresolved* (`bindingBasis`). **BUT — verified by
grep — no FR code distinguishes the qualitative prescription SUBTYPES (38.97 / 39.97 /
40.97) or the alternative subtypes (.98):** `frPrescriptionGeometry.ts` consumes `39/02`
only; `FR_PRESCRIPTION_MEANINGS` types 8 codes (14, 15, 01, 02, 05, 07, 29, 30) and none of
the 38/39/40 families' subtypes. A 39.97 feature today falls into the untyped
carried-verbatim bucket — reachable, not yet reported as QUALITATIVE-RULE. Gap logged at
§2(g).

### 1.6 Everything else confirmed
- **"Don't hunt more APIs"** (email §17) — matches the shipped source posture: GPU + API
  Carto + WFS fallback behind one port (`frExtractMirrorPort.ts`), altimetry, BD TOPO,
  cadastre; the weekly-extract mirror is the named FOUNDER-PENDING runtime decision
  (`FR_EXTRACT_MIRROR_DECISION`), not a new API hunt.
- **Physical data solved** (email §6) — parcel, terrain point, neighbours (BD TOPO per-point
  `frBdTopoNeighbours.ts` with truncation + vintage honesty) all shipped.
- **SITADEL as validation-not-override** (email §12) — consistent with our probe doctrine
  (independent evidence layer); nothing shipped contradicts it (nothing shipped uses it —
  §2e).
- **CNIG multi-version caveat** (Part 2) — already measured: obsolete v2013-shaped zones are
  10.87% and hold the entire residual NOMFIC gap (`FR-PHASE0-REPORT.md` §2 row 10).

---

## 2. THE ACTUAL MISSING PIECES — verified in code, with owner + effort

| # | Piece | Verified state today | Owner | Effort / note |
|---|---|---|---|---|
| (a) | **SRU XML (`3_Reglement` Reglement XML) consumption** | **NOT READ ANYWHERE** — grep `sru\|xml` over `countryAdapters/fr/` = 0 hits; the retrieval chain stops at NOMFIC/URLFIC identity. The email's ladder says: try SRU XML BEFORE PDF. Our brief §3.7 (SRU voluntary, pilot-stage) and the email agree it is optional-per-document — so it is the FIRST RUNG of the extraction ladder, never a dependency. Its real-world presence rate is UNKNOWN → make it a measured field of the §3 audit. | US build | ⛔ **MEASURED 2026-09-04 — and it INVERTS this row.** The §3 audit ran: **0 SRU XML in 81 documents that served a règlement reference** (66 plain `.pdf`, 15 `.pdf#page=N`, zero `.xml`). *"Highest value-per-effort rung of steps 6–7"* is **withdrawn**: a parser for a format that appears 0 times in 81 documents is not the highest value-per-effort rung, and the founder's ladder's *"PDF only where necessary"* means **everywhere** in this sample. **Build the PDF leg first; keep SRU as an opportunistic upgrade engaged only when a `.xml` actually appears.** (n=81 bounds the claim to *"do not sequence the roadmap behind it"*, not *"it never exists"*.) |
| (b) | **BD TOPO building heights in context + BD TOPO Express weekly** | **PARTIALLY WIRED — the email's premise is half-stale.** `tools/context-bake/heightSources.mjs` has `bdtopo` impl `'live'` (IGN BD TOPO® batiment) and routes `paris: 'bdtopo', lyon: 'bdtopo'`; national `france:` routes to `mnh_fr` (MNH stamp OWED, not OSM-forever). The envelope record's neighbour slice also reads BD TOPO per-point (`frBdTopoNeighbours.ts`). **Not wired:** BD TOPO *Express* weekly refresh — no reference anywhere. | US + DATA | Config/bake work: finish the owed national MNH stamp; treat Express-weekly as a freshness upgrade, not a gap in kind. |
| (c) | **RGE ALTI profile / façade-datum sampling** | **POINT ELEVATION ONLY.** `frAltimetry.ts` calls `alti/rest/elevation.json` for one point; grep `profil` in the FR adapter = 0 hits. L-584 stands: centroid sampling is a LEGAL defect where the ordinance measures at the façade; the Géoplateforme altimetry service the email cites also serves profiles (`elevationLine`). The datum-honesty note is shipped; the profile sampler is not. | US | Small: same endpoint family, line-of-points request along the frontage edge — but it is BLOCKED-BY (d): you need the road-facing edge before you can profile it. Shared seat with ES A#7/A#14 (Paris HMC conversion, region doc). |
| (d) | **Frontage-as-computation (email §7)** | **NOT BUILT FOR FR.** Nothing computes road-facing edges from cadastre + roads: the only FR "frontage" hits are prose in `frPrescriptionGeometry.ts` notes; `ptFrenteUrbana.ts` is PT, the street-width providers are ES city packs. Generic geometry primitives exist (`geometry/streetWidth.ts`, `blockRing.ts`) to mirror. The email correctly splits physical frontage 🟢 (computable: parcel edge ∩ road buffer) from legal frontage 🟡. | US | Medium — this is brief §11 step 5 ("frontage typing"), the prerequisite for A3/A4, the H/2 fixed point AND (c). The single most load-bearing unbuilt derivation. |
| (e) | **SITADEL historical-permits evidence layer** | **NOT WIRED ANYWHERE** — grep = 0 hits in code and FR docs (only the research capture mentions it). | US + DATA | Small (monthly open dataset). Classify honestly: NOT envelope-required — an *evidence/validation* layer (email §12: "validation, not override"). Queue behind the extraction pipeline; useful later as the independent probe source (probe-can-be-wrong-three-ways doctrine). |
| (f) | **DVF / OCS GE / INPN** | DVF: named in brief §4.3 as "Comparables", zero code. OCS GE: used only in CONTEXT docs (parks/land-cover, `FRANCE-CONTEXT-DATA-DEEP-DIVE-L515.md`), zero envelope code. INPN: zero hits. | DATA (later) | **None is envelope-required.** DVF = valuation/yield (post-envelope product). OCS GE = context rendering (already sourced there). INPN protected areas = a constraint-overlay nice-to-have largely duplicated by the GPU SUP layer we already consume (`parseFrSupAssiette`). Do not let these inflate the gap list. |
| (g) | **38.02 emprise + 40.02 volumetry polygons; the .97/.98 subtypes; TXT/PDF values** | **NOT CONSUMED.** The consumer reads 14, 15.xx and 39/02 ONLY (`frPrescriptionGeometry.ts`); grep `'38'\|'40'\|97` = 0 typed hits. Today, when the value lives in TXT/PDF, the slice is honestly `unresolved` naming the règlement doc + `#page` (e.g. the uses-slice refusal in `frNoExtraction.ts`) — correct refusal, zero recovery. | US | Three distinct sizes: (i) consuming 38.02/40.02 drawn polygons = DAYS (same shape as the shipped 39/02 parser); (ii) ⭐ **SHIPPED 2026-09-04** — `packages/site-parcel-data/src/rulepacks/frCnigPrescriptionTree.ts` types the `.97` qualitative / `.98` alternative subtypes and emits the shared `RuleState` vocabulary, so a legally non-numeric rule answers `QUALITATIVE RULE` instead of `UNKNOWN`. ⚠ **But the audit corrects the EXPECTATION attached to it:** across 100 parcels `.97` appeared **0 times**, `.98` **once**, the whole `40.x` volumetry family **0**, and `TYPEPSC=14` **0**. The capability is right and cheap; it is **not** a lever on the coverage number — the qualitative rules are in the PDF prose, not in the prescription subtypes; (iii) numeric extraction from règlement TXT/PDF = the steps 6–7 pipeline, MULTI-WEEK — the moat, and the region doc's declared #1 unblock. PLUi leverage bounds it: 30 documents cover 25% of national population, 283 cover 50% (`FR-PHASE0-REPORT.md` §2). |
| (+) | **Weekly-extract mirror as runtime source** | Port built, decision recorded `FOUNDER-PENDING` (`frExtractMirrorPort.ts` — ≈28.6 GB/31 layers, no PostGIS provisioned). | FOUNDER | Infra/cost decision. The email's "don't hunt more APIs" argues FOR settling it; it also unblocks the two Phase-0 DEFERRED spatial-join metrics. |

---

## 3. THE MEASUREMENT — what Phase 0 proved vs what the email demands

**FR-PHASE0 measured REACHABILITY:** NOMFIC fill 99.16% (twice-proven — original lane +
finish lane, identical numbers), URLFIC 18.27%×57.6%, DEST\* near-empty, prescription
censuses, provenance fill, PLUi leverage (`FR-PHASE0-REPORT.md`). It answered *"can we get
to the governing FILE for any zone?"* — YES.

**It did NOT measure VALUE RECOVERY** — the email's question: *"of the rules applying to a
random parcel, what % can PRYZM recover as an authoritative parameter without human
judgement?"* No shipped number answers that, and per the email's own instruction the ~80–90%
boundary estimate must NOT be quoted in any investor spec — it is the hypothesis the next
experiment tests.

### The 100-parcel value-recovery audit — spec

> ⭐ **RUN 2026-09-04 (lane ENVELOPE-FR). This heading read *"executable later; NOT run this lane"*.**
> The measurement exists:
> **[`findings/fr-100-parcel-audit/FR-100-PARCEL-VALUE-RECOVERY-AUDIT.md`](findings/fr-100-parcel-audit/FR-100-PARCEL-VALUE-RECOVERY-AUDIT.md)**
> — 100 parcels, 0 transport failures, re-runnable at seed `20260904`.
>
> **Parameter recovery 23.7 %** (185 / 781 applying rules) · honest-answer 32.3 % ·
> area-random 19.2 % / urban 28.0 %. And the split that matters:
> **INSTRUMENT layer (B1+B2) 89.9 % · PARAMETER layer (C2/C4/C5/C6/D1) 3.0 %.**
> Failures: `pdf` **389** · `semantic` 81 · `missing-source` 59 · `graphic` 0 · `discretionary` 0 ·
> `inaccessible` 0 — ⚠ the three zeros are trace-depth artefacts, NOT findings about France
> (see that file's §5 before quoting any number).
>
> ⛔ **Read the report, not this box.** In particular it measures the NATIONAL GPU/WFS chain only and
> therefore UNDERSTATES PRYZM wherever a municipal pack exists — Paris is recorded as
> `unrecovered/pdf` for height while `resolveParisPluZone.ts` reads the real published
> `plub_hauteur`.

- **Sampling frame.** The GPU national extract (vintage ≥ 2026-08-29, already on disk,
  13.4 GB MD5-verified). Stratified draw of 100 parcels: ~85 under PLU/PLUi (weighted so
  ≥30 fall inside the top-30 PLUi/PLU documents that cover 25% of national population, the
  rest spread across documents and régions), ~5 carte-communale sectors, ~3 POS-caduc,
  ~5 RNU, ~2 PSMV (the last three strata are REFUSAL CONTROLS — the correct answer is the
  refusal card, and recovering one counts as success). Within each selected commune, draw
  the parcel at random from the cadastre. Stratify secondarily by standard shape:
  ≥10 parcels in the v2013-shaped (empty-idurba) 10.87% subpopulation, where the residual
  NOMFIC gap lives.
- **Per-parcel per-field trace.** For each envelope field — C2 hauteur (égout AND faîtage
  where both regulated), C3 storeys, C4 emprise/CES, C5 retraits per edge class
  (15.01 voies / 15.02 latérales / 15.03 fond), A2 datum definition, A4 frontage width
  dependency, permitted uses, 30.xx majorations — record the TERMINAL STATE reached by a
  deterministic pipeline: `native-numeric` (GPU field or parsable libelle) → `sru-xml` →
  `pdf-text` → `graphic-only` → `qualitative (R151-12)` → `alternative (.98)` → refusal.
- **Failure taxonomy — the email's six labels, verbatim:** `missing-source` /
  `inaccessible` / `PDF` / `graphic` / `semantic` / `discretionary`. One label per failed
  field, plus the NOMFIC/page/article citation of where the trace stopped.
- **Recovery criterion.** A field counts as RECOVERED only when the value arrives with its
  full F1–F8 address (value+unit, instrument+version, ARTICLE, method, inputs,
  retrieved_at, confidence) by deterministic extraction — a human-read value is recorded
  (it calibrates the taxonomy) but never counted.
- **Outputs.** Recovery rate per rule class × per document era (pre/post-2016 structure) ×
  per state; the SRU-XML presence rate (feeds §2a); the OCR-need rate (brief §7 "measure
  before building an OCR path"); and the measured replacement for the email's 80–90%
  estimate.
- **Prerequisites.** None beyond what exists — règlement fetch via NOMFIC +
  `download-by-partition` (both probed live 2026-09-02). A spatial store (the §2(+) mirror
  decision) makes sampling cheaper but a per-point API walk suffices for n=100.

---

## 4. CORRECTIONS THE EMAIL MAKES — adopt (email §13)

**Never say "France has no D1."** COS = DISCARD (dead, post-2014/15). *Surface de plancher*
= ACTIVE (the defined national floor-area metric). SDP-based floor-area rules = potentially
ACTIVE in a given PLU. The schema position we already hold — D1 nullable, "your schema must
permit its absence" — is right; the blanket claim "France never has a floor-area constraint"
is the overstatement, and it appears in four shipped texts:

| Location | Text to correct | Note |
|---|---|---|
| `docs/04-reference/jurisdictions/fr/FR-MODULE-BUILD-BRIEF.md` §3.4 (line ~85) | "**There is no floor-area quantum constraint in France.**" | Verbatim founder capture — correct via a dated correction box (the CLAUDE.md correction idiom), not silent rewrite. |
| `docs/01-strategy/envelope-gap-master/region-iberia-france.md` FRANCE block (lines ~454–456) | "France has no floor-area quantum constraint" | Editable master doc — fix in place. |
| `docs/01-strategy/BUILDABLE-ENVELOPE-GAP-MASTER.md` (lines ~1089–1090) | Same sentence (the roll-up copy) | Fix in the same commit as the region doc — the two must not disagree. |
| `docs/01-strategy/STR-ENVELOPE-PARAMETER-REFERENCE.md` D1 row (line ~58) | "a system with no D1 at all" | Founder verbatim capture — correction box, not rewrite. |

(`fr-idf/75056-paris/README.md` "SDP not capped per parcel in UG" is parcel-scoped and
verified — fine as written. `FRANCE-MASTER-DATA-SOURCE-STUDY.md` already names SDP as the
national metric — consistent with the correction.)

**Consequential spec fix for steps 6–7:** the brief's §7 "detect and **discard any COS
found**" must not over-fire. The detector has to distinguish a genuine COS (pre-2016 Art. 14
/ the COS token) — discard, log — from an SDP-expressed floor-area rule in a current
règlement — KEEP, as a live D1. Deleting the latter as "dead COS" would be the
refusing-half-needs-its-escape-hatch defect (L-942 class) applied to yield.

**Second adoption (from §1.5):** surface the .97 qualitative and .98 alternative subtypes as
typed states (QUALITATIVE-RULE / ALTERNATIVE-RULE), never as untyped verbatim — the email's
"report QUALITATIVE RULE not UNKNOWN" is doctrine we hold in prose but not yet in the
prescription typing (§2g-ii).

---

*Deliverable of lane FR-DATA-AUDIT, 2026-09-03. No code was changed; no commit was made.*

*Amended 2026-09-04 by lane ENVELOPE-FR: §3 heading (the audit was RUN), §2(a) (SRU-XML priority
inverted by measurement) and §2(g)(ii) (shipped, expectation corrected). The §4 D1 correction was
applied in place to `FR-MODULE-BUILD-BRIEF.md` §3.4. ⚠ The three remaining §4 targets live in
`docs/01-strategy/` — `envelope-gap-master/region-iberia-france.md`,
`BUILDABLE-ENVELOPE-GAP-MASTER.md` and `STR-ENVELOPE-PARAMETER-REFERENCE.md` — and are OUTSIDE this
lane's exclusive ownership; they are left for the orchestrator so two lanes do not collide on a
shared strategy doc.*
