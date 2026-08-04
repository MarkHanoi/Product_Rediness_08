# SOURCE — Founder: Madrid NZ-1 CPPHAN Negative-Proof Dossier (raw capture)

> **Provenance.** Founder-provided research, delivered 2026-08-03, responding to this session's
> finding that Madrid NZ-1 height/FAR is blocked on "CPPHAN-discretionary, genuinely unavailable"
> (`ENVELOPE-CAPABILITY-MATRIX.md:52`). Captured **verbatim** in §A–§B. §C is mine: cross-reference
> against `ADR-0296` (accepted the same day) and `resolveMadridNZ1Ring.ts`.
>
> ⭐ **This dossier's thesis is not hypothetical caution — it is the exact failure mode ADR-0296
> documents happening nine separate times this same session, on other jurisdictions.** See §C.
>
> Related: [`../../ENVELOPE-PIPELINE-FORENSIC-BLOCKER-ANALYSIS.md`](../../../es-an/ENVELOPE-PIPELINE-FORENSIC-BLOCKER-ANALYSIS.md) ·
> [`docs/02-decisions/adrs/ADR-0296-absence-is-a-claim-about-our-search-not-the-world.md`](../../../../../02-decisions/adrs/ADR-0296-absence-is-a-claim-about-our-search-not-the-world.md) ·
> `packages/site-parcel-data/src/providers/resolveMadridNZ1Ring.ts`

**Framing, quoted:** *"Madrid's blocker is not 'no data'; it's 'prove there is no further
authoritative data to obtain.'... I would not yet declare it permanently blocked until a structured
negative-proof dossier has been completed. The goal is to prove that no lawful automation path
exists, rather than merely concluding that one hasn't been found."*

---

## §A — First pass: 17-stage negative-proof plan

Condensed (each stage's own question, not full prose):

1. **Prove Art. 8.1.15.1 is genuinely discretionary** — does it delegate to CPPHAN for every case or
   only exceptional ones? Full cross-reference/annex/definition/transitional-clause resolution
   needed, not just the quoted paragraph.
2. **Inventory every CPPHAN publication** — Open Data, ArcGIS, WFS, GeoJSON, PDFs, agendas,
   resolutions, annexes, urban files, heritage portal, gazette, transparency portal — exhaustively,
   with "measured absent" not "couldn't find."
3. **Historical determination census** — does CPPHAN publish decisions? 100+ sample, measured for
   structured/searchable/georeferenced/reusable.
4. **Repeatability** — do similar parcels get similar determinations? If yes, a hidden algorithm may
   exist; if not, automation is genuinely impossible — need evidence either way.
5. **Inputs to CPPHAN** — what does the committee actually evaluate (street profile, cornice,
   historic photos, neighbour buildings, visual corridors, listed buildings, architectural report)?
6. **Decision ontology** — classify every possible output (approved / approved-with-conditions /
   reduced / increased / refused).
7. **Statistical analysis** — 500 determinations, distribution of height/FAR/footprint/cornice/
   street-width/building-age, testing whether the committee behaves deterministically.
8. **Negative evidence table** — per-dataset (WFS/ArcGIS/GeoJSON/Open Data/API/Registry) checked
   result, so absence becomes measured, not assumed.
9. **Alternative authorities** — rule out regional heritage, cadastre, urban portal, special plans,
   historic inventories, national registries.
10. **Case law** — has a court ruled CPPHAN must exercise discretion, or that objective criteria
    exist? Large difference.
11. **Appeals** — appealed determinations often reveal hidden rules through courts' reasoning.
12. **Expert manuals** — architect guidance / municipal manuals / submission guides / application
    forms sometimes document practical (if non-binding) criteria.
13. **Hidden geometry** — rule out an internal GIS/street-model/3D-model/visibility-model the
    committee relies on but doesn't publish.
14. **Machine-readability audit** — even if decisions exist, measure PDF vs. image vs. structured vs.
    searchable vs. geocoded, as exact percentages.
15. **Reproducibility test** — give 100 real determinations (answer hidden) to independent planners;
    low agreement confirms genuine discretion, ~95% agreement suggests hidden rules.
16. **Envelope sufficiency** — three possible conclusions: (A) footprint objective / height
    committee → ship footprint, refuse height; (B) everything committee → no envelope; (C) committee
    only ~10% of cases → route dynamically.
17. **Certification position** — formal statement distinguishing `UNDETERMINABLE (reason: delegated
    statutory discretion)` from bare `UNKNOWN` — very different claims.

**§A's own three-state framework:**
1. **Deterministic** — authority publishes objective rules/datasets sufficient to compute every
   parameter.
2. **Partially deterministic** — some parameters computable, others explicitly delegated; engine
   computes the objective part, returns a typed statutory refusal for the rest.
3. **Inherently discretionary** — law intentionally requires case-by-case judgment with no published
   objective rule; absence of an envelope IS the correct legal result.

*"From your description, Madrid NZ-1 appears closest to State 2, but I would only declare it
permanently unblocked once the negative-proof dossier establishes, with evidence rather than
inference"* — five conditions: Art. 8.1.15.1 genuinely delegates; no machine-readable publication of
determinations exists; no alternative dataset supplies equivalent parameters; historical
determinations reveal no reproducible objective rule; the footprint-only result is explicitly
documented as the maximum certifiable output with typed refusals, not unknowns.

---

## §B — Second pass: 19 numbered unknowns + negative-knowledge registry

Deepens §A with concrete deliverable names:

- **Unknown 1** — `article8151.analysis.md`: does Art. 8.1.15.1 always require CPPHAN, only for
  certain interventions, define measurable limits, reference another article, delegate elsewhere,
  distinguish replacement/rehabilitation/new-construction/extension?
- **Unknown 2** — CPPHAN's actual decision criteria (published criteria / technical instructions /
  internal manuals / plenary agreements / heritage commission guidance / FAQs / urban reports) —
  free discretion vs. rule-based judgement.
- **Unknown 3** — `cpphan_resolutions/` dataset: do published resolutions contain max
  cornice/ridge/storeys/volume? Hundreds converging on round numbers (13.40m, PB+4, 17.80m) would
  suggest a hidden grammar.
- **Unknown 4** — building-licence publications: do NZ-1 approval docs contain
  height/storeys/FAR/volume, linkable statistically to parcels?
- **Unknown 5** — existing-building catalogue: does CPPHAN effectively say "match neighbours"? If so,
  need an authoritative source for neighbour cornice/roof/façade/storeys (municipal 3D, LiDAR,
  building inventory, cadastre).
- **Unknown 6** — heritage catalogue constraints on protected buildings (max alteration, preserved
  volume/roof/façade) that could remove degrees of freedom.
- **Unknown 7** — Special Plans (PE) hierarchy: does PE replace CPPHAN or merely inform it
  (`PGOUM → PE → CPPHAN`)?
- **Unknown 8** — hidden GIS fields: search every Madrid layer's attributes (not just names) for
  `ALTURA`/`NUM_PLANTAS`/`EDIFIC`/`APROVECH`/`VOLUMEN`/`CORNISA`.
- **Unknown 9** — Open Data census beyond planning (BIM, digital twin, inspections) — useful geometry
  sometimes lives outside the planning portal.
- **Unknown 10** — jurisprudence: courts describing CPPHAN as "technical discretion" (closes the
  question) vs. "bound discretion, must justify against measurable criteria" (implies criteria
  exist).
- **Unknown 11** — appeals against refused NZ-1 projects often state allowed/requested/permitted
  height explicitly.
- **Unknown 12** — sample real urban reports architects request — sometimes contain computed max
  buildability/height/occupancy already.
- **Unknown 13** — does Madrid's electronic permitting system perform automatic pre-review checks
  (height/volume/occupation)? If so, machine rules exist somewhere internally.
- **Unknown 14** — internal guidance (technical notes, circulars, staff manuals) municipalities
  sometimes publish quietly.
- **Unknown 15** — 100-project corpus: parcel/resulting-height/frontage/neighbours/block-depth — test
  whether heights consistently equal neighbouring cornice.
- **Unknown 16** — is neighbour-interpolation legally *mandated* or merely *commonly chosen*? Large
  distinction for whether it's automatable.
- **Unknown 17** — does the Ayuntamiento already compute NZ-1 envelopes internally (planning
  certificates, XML, CAD, IFC, permit APIs)?
- **Unknown 18** — direct authority interview: *"Is there any published objective procedure by which
  maximum height or FAR for NZ-1 can be determined without CPPHAN deliberation?"* — a "no" closes the
  search; a "see document..." is even better.
- **Unknown 19 — the negative-knowledge registry itself** (flagged as *"probably the most important
  deliverable"*): `NZ1-negative-knowledge.md`, one row per source (PGOUM / GIS / heritage catalogue /
  licences / CPPHAN criteria), each with checked / contains-height / contains-FAR / conclusion. *"When
  every row is exhausted, the absence becomes measured, not assumed."*

**Two defensible engineering outcomes after the research:**
- **Outcome A (computable)** — objective rules found → implement `parcel → NZ-1 → grammar → height →
  FAR → envelope`.
- **Outcome B (discretionary)** — engine returns a typed structured result:
  ```ts
  { footprint: …, height: REFUSAL_CPPHAN_DISCRETION, far: REFUSAL_CPPHAN_DISCRETION,
    evidence: ["PGOUM Art. 8.1.15.1", "CPPHAN guidance", "Negative knowledge registry"] }
  ```
  — *"not a failure, a faithful representation of the legal process."*

**§B's own closing test:** Madrid is unblocked only when either (1) a deterministic method is proved
and implemented, or (2) no deterministic method is proved to exist, with the engine returning a
typed, cited statutory refusal rather than an unknown. *"Until one of those two states is
demonstrated with evidence, the remaining blocker is not engineering — it's completion of the legal
research needed to close the question."*

---

## §C — Verification (mine): this dossier is not redundant caution — it is what ADR-0296 already requires, applied to a claim that hasn't been through it yet

### C.1 — ADR-0296 exists, was accepted the same day, and is the exact governing rule this dossier proposes

`docs/02-decisions/adrs/ADR-0296-absence-is-a-claim-about-our-search-not-the-world.md` (Accepted,
2026-08-03) states, verbatim:

> *"Between 2026-08-02 and 2026-08-03, nine of fourteen standing 'the authority does not publish
> this' blockers across Balears, Canarias, Barcelona and Huesca were overturned. Not one was
> overturned because a publisher released new data. Every one fell because the discovery method that
> produced the negative was incomplete."*

Five concrete examples are recorded in the ADR — Zaragoza's "28-typename sweep, all HTTP 400" turned
out to have a working layer the sweep never tried; Huesca's "all sampled sheets are greyscale" turned
out to be a colour-blind extractor (color-aware recount: 1,595/3,020 non-grey stroke items); Córdoba's
"no alignment layer exists" (105 WFS + 119 WMS enumerated) was true of *services* and irrelevant — the
alignment was on a vector CAD plan sheet the service sweep never looked at.

**This is precisely the failure mode this Madrid dossier is worried about**, and the ADR ratifies its
method: an absence is now a **typed claim carrying a discovery-confidence token**
(`VALIDATED`/`STRONG`/`UNVERIFIED`), not a bare conclusion. The ADR bans four specific inferences as
evidence of absence — a failed guess, an advertised-but-incomplete inventory (`GetCapabilities` is a
publication *choice*; Zaragoza's own case advertised 178 typenames and omitted the one that mattered),
absence in one artefact class generalized to the whole jurisdiction, and a fabricated URL that 404s.
**Unknown 8 in §B (search field names, not layer names) and Unknown 2 (published criteria vs.
manuals vs. FAQs) are direct instances of exactly the discovery-completeness discipline ADR-0296
mandates.**

### C.2 — The current CPPHAN/Art. 8.1.15.1 claim has NOT been through this rigor

Repo-wide search for "CPPHAN" (`git grep -il cpphan HEAD`) returns only: the capability matrix's one
summary line, this dossier's own future home, and two unrelated Compendio-2025 extraction findings
that do not mention CPPHAN by name in their visible content (general Compendio height/NZ7 notes). **No
`NZ1-negative-knowledge.md`-shaped artefact exists.** No positive/negative control pair, no committed
re-runnable probe, no discovery-confidence token is attached to the "genuinely unavailable" claim in
`ENVELOPE-CAPABILITY-MATRIX.md:52`.

Per ADR-0296's own consequence rule: *"Every existing absence conclusion is re-classified A
(validated) / B (strong) / C (re-audit) / D (already false). **Anything never independently
re-tested defaults to C.**"* By that rule, **the Madrid NZ-1 height/CPPHAN claim is currently an
un-audited C**, not a settled fact — regardless of how confidently it reads in the matrix or in this
session's earlier forensic analysis. This dossier's 17/19-stage programme is the concrete re-audit
ADR-0296 already obligates, not an optional extra layer of caution.

### C.3 — What's already established, so the re-audit doesn't start from zero

`resolveMadridNZ1Ring.ts` (L-608, shipped, signed `MADRID_NZ1_CERTIFIED=true`) is worth reading before
starting §A/§B's programme, because it already resolved one adjacent unknown decisively: **`COEF_Z`
(the edificabilidad/FAR field on the same live ArcGIS layer that carries the footprint ring) is
proven to be a categorical grade token, not a numeric value** — "0 / 4", "4 / 5 / 7" compound tokens,
no coded-value domain, confirmed against live parcels (`MADRID-DATA-RECON-SPIKE §5-6`). The resolver
already ships this honestly: a clean single number populates `edificabilidad`, anything compound or
garbage yields `null` (never a silent zero, never a refusal). **This is direct, already-measured
evidence relevant to Unknown 1 and the "State 2 vs. State 3" question**: FAR is not cleanly published
as a number either, alongside height — the dossier's framing sometimes discusses height and FAR as if
FAR might be the "easier" of the two, and this resolver's own findings suggest otherwise; FAR is
*published* but not *numeric* at the source. Any re-audit should treat FAR and height as two separately
unresolved unknowns, not assume FAR is closer to solved.

### C.4 — Recommended entry point, given ADR-0296's own priority order

ADR-0296 doesn't rank which absence to re-audit first, but its five overturned examples share a
pattern: **the fastest wins came from checking one specific alternative artefact class the original
search skipped** (a plan sheet instead of a WFS census; a colour-aware pass instead of a greyscale
one), not from an exhaustive 17-stage programme run in full. Recommend starting this dossier at
**Unknown 8 (hidden GIS fields on the layer 6 `Condiciones de la Edificación` polygon this repo
already queries) and Unknown 3 (a CPPHAN resolution census)** — both are checkable against Madrid's
existing sigma.madrid.es ArcGIS surface with no new authority contact required, mirroring how
Zaragoza's and Córdoba's ADR-0296 reversals were found: by looking harder at a source already
identified, not by opening a new one.
