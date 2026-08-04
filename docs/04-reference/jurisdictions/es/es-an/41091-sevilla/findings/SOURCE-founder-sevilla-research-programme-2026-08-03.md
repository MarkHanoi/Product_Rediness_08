# SOURCE — Founder: Sevilla Envelope Research Programme, 3 iterations (raw capture)

> **Provenance.** Founder-provided research, delivered 2026-08-03 (three successive messages, each
> deepening the prior one — labelled §A, §B, §C below in delivery order). Captured **verbatim**.
> §D is mine: independent verification of the cited external endpoints, plus cross-reference against
> an independently-commissioned Andalucía-generalization RFC that reached Sevilla via a different
> path the same day.
>
> ⚠ **External, unverified-until-§D.** Unlike this repo's other SOURCE captures, this one cites
> **external URLs** (`cdu.urbanismosevilla.org`, `web.urbanismosevilla.org`) that are not PRYZM
> artefacts and had not been independently probed by this repo's own tooling at time of capture. Treat
> §A–§C as a **research proposal + externally-sourced hypothesis**, not as verified repo fact. §D
> narrows that gap for the specific endpoints checked; everything else in §A–§C (field schemas beyond
> the layer list, grammar claims, height semantics, modification precedence) remains unverified.
>
> Related: [`SOURCE-founder-sevilla-scalability-test-2026-07-31.md`](./SOURCE-founder-sevilla-scalability-test-2026-07-31.md)
> (prior-day capture, same municipality, different angle) ·
> [`../ENVELOPE.md`](../ENVELOPE.md) · [`../NEXT.md`](../NEXT.md) · [`../RATE.md`](../RATE.md) —
> **status in all three remains `not-assessed` / `pending-implementation` as of this capture; nothing
> below has been wired into `registry.ts` or any rulepack.**

**Framing, quoted (from §C, the founder's own summary of the shift across the three messages):**

> The question should no longer be: *"Can Sevilla produce envelopes?"* It should be decomposed into:
> *"What exact pieces of evidence are still missing before a legal envelope can be certified?"* That
> becomes an evidence-completeness problem rather than a software problem.

---

## §A — First pass: capability status + 11-stage discovery plan

### Current capability status (as claimed, unverified beyond §D)

| Capability | Status | Confidence |
|---|---|---|
| Parcel geometry | Solved (Catastro + municipal parcel layers) | High |
| Zoning geometry | Appears solved | High |
| Zone identifier | Appears solved (`Calificación`) | High |
| Height | Structured (`Altura máxima`) | High |
| Grammar | Unknown | Medium |
| Coverage/FAR | Unknown | Medium |
| Setbacks | Unknown | Medium |
| Depth | Unknown | Medium |
| Alignment | Appears published | Medium |
| Heritage | Appears published | Medium |
| Verification | None | High |

Claim: the public ArcGIS services expose dedicated layers for **Calificación (25)**, **Alineaciones
(4)**, **Planeamiento de Desarrollo (20)**, **Clasificación (24)**, and **Etiquetas y Altura máxima** —
**confirmed live in §D.**

### 11-stage plan (condensed — full stage detail in the raw capture below §B)

1. **Geometry audit** (1 afternoon) — can every parcel intersect Layer 25? Is `zona_orden` unique?
   Deliverable: `sevilla.discovery.md`, layer inventory, coverage %.
2. **Field audit** — complete schema of Layer 25 (`zona_orden`, `ordenanza`, `pdf`, `altura_max`,
   `uso`, `ocupacion`, `edificabilidad`, `modificacion` — all unconfirmed field names).
3. **Grammar audit** — per-parameter GIS-vs-PDF classification matrix (FAR/coverage/height/setbacks/
   depth/special-cases).
4. **PDF linkage** — verify whether `polygon → URL → PDF` is direct or requires a lookup; check
   permanence, versioning, supersession, caching.
5. **Alignment** — claim: Sevilla publishes an **Alineaciones** layer, unlike Córdoba. If parcel →
   alignment feature → distance is directly computable, *"Córdoba's largest blocker disappears for
   Sevilla."*
6. **Height** — resolve whether `altura_max` is metres, storeys, or mixed notation.
7. **Modifications** — precedence question: does a `Modificaciones PGOU` polygon override the base
   PGOU when a parcel falls inside it? (Published as an independent layer — confirmed live in §D.)
8. **Heritage** — claim: BIC/protected-catalogue/historic-sector layers already published; task is
   classification (exclude/cap/advisory), not discovery.
9. **Resolver** — `resolveSevillaZone()` once research lands.
10. **Rulepacks** — `esSevillaPGOU2006.ts` + `resolveSevillaZone.ts`.
11. **Verification** — standard PRYZM sign-off (legal source, citation, founder sign-off).

### Eight "true research blockers" named in §A

1. Complete Layer 25 attribute schema.
2. Whether `zona_orden` alone determines the ordinance, or secondary selectors are required.
3. Whether FAR/occupancy/setbacks/depth are GIS attributes or PDF-only.
4. Full legal grammar extraction per ordinance family.
5. Whether the published Alineaciones layer is directly usable for envelope computation.
6. Legal semantics of `altura_max`.
7. Stability/authority of the parcel→PDF linkage.
8. Supersession/verification status of the published ordinance corpus.

**§A's own bottom line, quoted:** *"Compared with the rest of Andalucía, Sevilla appears to have the
highest probability of becoming the next fully operational envelope engine because the authoritative
publication already exposes zoning, alignment, height, development planning, and classification as
structured GIS layers; the remaining work is primarily understanding and wiring those capabilities
rather than discovering whether they exist."*

---

## §B — Second pass: six workstreams (A–K), reframing discovery as semantic reconstruction

**Framing shift, quoted:** *"The difference from Córdoba is fundamental: Córdoba required proving
geometry even existed. Sevilla already publishes almost every geometric layer needed. The research
programme therefore changes from discovery to semantic reconstruction."*

- **A. Zoning ontology** — extract the complete `zona_orden` universe (`SELECT DISTINCT zona_orden`),
  build a code hierarchy (`MC → MC-1 → MC-2...`, exact codes unknown), per-code count/area/frequency/
  associated PDF. Deliverable: `sevilla-zone-universe.json`.
- **B. Attribute census** — classify every Layer 25 field into Type A (immediately computable, e.g.
  `altura_max`, `plantas`), Type B (needs decoding, e.g. `MC2`/`UA3`), Type C (reference, e.g. `pdf`),
  Type D (administrative, ignored). Deliverable: `sevilla-layer25-schema.md`.
- **C. Legal grammar extraction** (flagged *"probably 70% of the project"*) — per-ordinance parameter
  inventory (coverage/FAR/height/setbacks/depth/courtyard/special conditions) as structured data, not
  prose.
- **D. Alignment model** — reframe from *"can we derive alignment"* to *"can parcel ∩ Alineación
  exterior ∩ Alineación interior ∩ Fondo máximo edificable directly produce the legal envelope
  polygon"* — since Sevilla publishes all three as distinct GIS layers (per §A/confirmed in §D),
  unlike Córdoba. Claim: *"If yes, this becomes one of the strongest municipal implementations in
  Spain."*
- **E. Height semantics** — resolve `altura_max` values like `13.4` against ordinance text (metres vs.
  storeys vs. coded value vs. historic exception).
- **F. Modification engine** — `Modificaciones PGOU` (confirmed live, single layer, in §D) needs a
  precedence algorithm: does a modification polygon override the base ordinance for an enclosed
  parcel? Deliverable: modification/affected-ordinances/supersedes/effective-date matrix.
- **G. Development plans** — `Planeamiento de Desarrollo` (confirmed live in §D): does it override or
  supplement the PGOU? Needs a precedence graph.
- **H. Heritage** — inventory BIC/historic-centre/protected-catalogue/archaeology layers; classify as
  exclude/cap/advisory.
- **I. PDF corpus** — full inventory with hash/date/pages/version per ordinance/chapter/modification/
  annex.
- **J. Envelope sufficiency matrix** — per-ordinance GIS-vs-PDF-vs-missing table for
  FAR/height/coverage/setbacks/depth/courtyard — the direct answer to "possible or refusal."
- **K. Ten unknowns restated** as the pre-engineering research gate (zona_orden universe, Layer 25
  schema, parameter provenance, grammar extraction, alignment semantics, height semantics,
  modification precedence, development-plan precedence, heritage taxonomy, verification dossier).

**§B's own bottom line, quoted:** *"If those ten research outputs exist, Sevilla stops being a
'research' jurisdiction and becomes an 'engineering' jurisdiction."*

---

## §C — Third pass: the envelope-as-legal-proof-chain reframing (16 stages)

**Framing shift, quoted in full because it changes the deliverable, not just the depth:**

> An envelope certificate is a proof. The proof chain is: Parcel → Applicable planning instrument →
> Applicable zoning polygon → Applicable ordinance → Applicable ordinance parameters → Applicable
> overrides → Applicable constraints → Applicable buildable volume → Certificate. Every node must be
> proved.

Sixteen stages, condensed (full stage-by-stage prose in the founder's original — reproduced in
delivery order, each stage below is what §C adds beyond §A/§B, not a restatement):

- **Stage 0 — Instrument resolution** (new, not in §A/§B): before zoning, determine which instrument
  governs a parcel at all — PGOU vs. PEP vs. PERI vs. Special Plan vs. Innovation vs. Modification.
  Flagged as *"probably the biggest missing legal abstraction"* — a municipality rarely has "one
  PGOU."
- **Stage 1 — Polygon provenance** (new): geometry lineage — who published each Layer 25 polygon, what
  official act, what gazette, what approval date, what revision. *"Without provenance the polygon is
  just geometry."*
- **Stage 2 — Zone ontology** (deepens §B-A): needs an inheritance model, not just a flat code list —
  do subclasses (`MC1`/`MC2`/`MC3`) inherit, override, or replace the parent's rules?
- **Stage 3 — Ordinance graph** (new): ordinances cross-reference each other (Article → references →
  Article → Exception → Annex → Table) — needs a dependency graph, not independent per-article
  extraction.
- **Stage 4 — Parameter provenance** (deepens §B-C): every value needs full citation chain
  (parameter → article → paragraph → table → row → value). *"The engine should never say 80% without
  knowing where 80% came from."*
- **Stage 5 — Conditional grammar** (flagged *"probably the largest hidden problem"*): ordinance
  values are frequently conditional (`80% IF corner parcel AND street >12m AND block depth >25m`), not
  constants — needs decision trees, not a flat parameter table.
- **Stage 6 — Exceptions** (new): inventory of historic buildings / corner lots / protected façades /
  existing buildings / irregular plots / pre-existing parcel exceptions, classified
  mandatory/optional/discretionary.
- **Stage 7 — Alignment semantics** (deepens §B-D): is "alignment" a line, a setback, or a frontage?
  Needs to distinguish exterior alignment / interior alignment / maximum depth / road widening / future
  reservation as legal concepts, not just geometry.
- **Stage 8 — Buildable depth** (new, flagged *"one of the least understood parameters"*): depth
  measured from alignment, parcel boundary, or street line — needs an explicit measurement algorithm.
- **Stage 9 — Height semantics** (deepens §B-E): full ontology needed for notations like `PB+3`, `IV`,
  `13.4`, cornice, ridge, maximum façade — each needs a mapping to PRYZM's 3D height model.
- **Stage 10 — Parcel topology** (new, flagged as *"a huge omission"*): is the envelope computed per
  parcel or per block? Party walls, shared courtyards, grouped developments, semi-detached vs.
  detached vs. continuous frontage all change what "the envelope" means. *"Without topology some
  envelopes are impossible."*
- **Stage 11 — Development plans** (deepens §B-G): precedence engine, not lookup, across
  PGOU → PERI → PEP → Innovation → Modification.
- **Stage 12 — Temporal legality** (new): planning changes over time — every instrument needs
  `effective_from`/`effective_to`, so "the envelope" is only well-defined for a stated date.
- **Stage 13 — Constraints** (deepens §B-H): beyond heritage — airport, flood, archaeology, road
  easements, rail, hydraulic, protected trees, telecom, military — each classified hard-stop / cap /
  advisory / delegated.
- **Stage 14 — Verification** (deepens §B-I/§A-11): legal verification of every article, table,
  figure, map, amendment.
- **Stage 15 — Evidence graph** (new, flagged as *"what I think the repo is currently missing"*):
  every parameter value should trace through article → table → page → document version → approval →
  publisher, not just cite a single article number.
- **Stage 16 — Envelope completeness score** (deepens §B-J): per-parameter, per-ordinance table of
  source/verified/missing — the direct measure of whether an envelope is, e.g., 95% or 52% complete,
  as opposed to a binary possible/refused.

**§C's proposed final deliverable — a "Sevilla Envelope Evidence Dossier"** with ten components:
instrument registry, geometry provenance, complete zoning ontology, structured ordinance grammar,
conditional rules (decision trees), alignment semantics, override-engine specification, constraint
inventory, parameter completeness matrix, evidence graph.

**§C's own bottom line, quoted:** *"If that dossier exists, engineering becomes a bounded
implementation task. If it does not, the remaining uncertainty is no longer about software — it is
about whether every legal element needed to certify a buildable envelope has been identified,
interpreted, and evidenced."*

---

## §D — Verification (mine) + cross-reference against the independent Andalucía RFC

### D.1 — External endpoint reachability (WebFetch, 2026-08-03, same day as capture)

The two most load-bearing endpoints cited across §A–§C were checked directly:

- **`https://cdu.urbanismosevilla.org/arcgis/rest/services/Info_Urban_Groups/PGOU/FeatureServer`** —
  **live, confirmed.** Six layers, matching §A's claim exactly:
  - Layer 1 — *Etiquetas y Altura máxima de la edificación*
  - Layer 4 — *Alineaciones*
  - Layer 15 — *Modificaciones PGOU*
  - Layer 20 — *Planeamiento de Desarrollo*
  - Layer 24 — *Clasificación y Categorías del Suelo Urbano y Urbanizable*
  - Layer 25 — *Calificación*
  - Query cap: 2,000 records/request (relevant for any future harvest script).
- **`https://cdu.urbanismosevilla.org/arcgis/rest/services/Modificaciones_PGOU/MapServer`** — **live,
  confirmed.** Single layer (`Modificaciones PGOU`, id 15), `EPSG:25830`, map name *"Local
  E_Información Urbanística 2020"*.

**This confirms §A/§B/§C's geometry-layer claims are not fabricated** — the six named layers genuinely
exist at the cited endpoint, including the alignment and height layers that make Sevilla's case
strong. **Not yet verified**: field-level schema inside each layer (§B-B's "attribute census"), the
`zona_orden` code universe, the `altura_max` semantic (metres vs. storeys), whether the parcel→PDF
link (`enlace_np`/`enlace_ng`) is a direct field or requires a lookup, and the modification-precedence
question (§B-F/§C-Stage-11). Those remain open exactly as §A–§C themselves say — this capture verifies
the layers *exist*, not that the envelope is computable from them.

### D.2 — Independent cross-reference: the Andalucía generalization RFC reached the same conclusion via a different path

The same day this research was delivered, a separately-commissioned deep investigation (scope: "can
Córdoba's pipeline generalize to all 8 Andalucía provincial capitals") independently identified Sevilla
as the strongest candidate in the region — **via its own git/repo archaeology, not by reading this
capture**:

> *"**Sevilla** | ✅ **POSSIBLE — the single best candidate**, and it is possible for reasons that have
> nothing to do with Córdoba. Named live-hit endpoint
> `https://cdu.urbanismosevilla.org/arcgis/rest/services/Info_Urban_Groups/PGOU/MapServer` layer 25,
> zone code `zona_orden`, and **`altura_max` already structured** — the one Andalucían capital serving
> height as data. Ranked #2 nationally for build order."*

Source cited by that investigation:
`docs/04-reference/jurisdictions/es/es-an/41091-sevilla/findings/ES-CITY-ENVELOPE-CERTIFIABILITY-SURVEY.md:63-65`
(a prior, 2026-07-26 survey — **not this capture** — meaning three independent passes, on three
different days, by two different research efforts, all converged on the same endpoint and the same
"Sevilla is the best next Andalucía candidate" conclusion). That RFC also flagged the prior survey as
**stale on two other rows** (its Málaga assessment was refuted 2026-08-02; its Córdoba assessment cites
the wrong instrument) — so convergence on Sevilla specifically is worth more than convergence on the
survey as a whole.

**The RFC's caveat on the same endpoint, which this capture should inherit:** the native CRS is
**NOT FOUND** — an `EPSG:25830` appearing in the 2026-07-26 survey sits beside field names the survey
itself calls guesses, and the survey's own text still asks *"EPSG?"* as an open question. §A/§B/§C
above do not address CRS at all. **This is the first concrete task for any Sevilla discovery pass**,
not a re-derivable assumption.

### D.3 — The one finding that changes the shape of any Sevilla work: don't build an Andalucía-specific pipeline

The RFC (commissioned to answer exactly "can Córdoba become an Andalucía reference implementation")
reached a documented **NO**, on architectural grounds that predate this capture and are already
repo-ratified:

> *"Córdoba is a correct, well-evidenced instance of an abstraction that already exists... What it
> cannot be is a reference implementation for a region, because the parts of it that are reusable were
> already generic before Córdoba existed... and the parts that are Córdoba-specific are specific to
> one publisher's filename convention and one vector-PDF corpus, and provably do not port to the next
> Andalucían city."*

Two already-accepted ADRs govern this directly:

- **ADR-0294**: *"Spain is organised `parcel → municipality → instrument → detailed zoning → rule`,
  NOT by autonomous community. The CCAA is the unit of legal corpus and signature; it is not the unit
  of geometry publication."* The milestone it sets is *"ONE SUCCESSFUL ENVELOPE FROM EACH PUBLICATION
  CONTAINER"* — not "support Andalucía."
- **ADR-0295**: *"A region is not a thing that succeeds or fails. It is five capabilities that succeed
  or fail independently... NO REGION-SPECIFIC BRANCHING INSIDE THE ENGINE. A region supplies
  providers; it is not a code path."*

**Practical consequence for this document's own 11/6/16-stage plans**: stages/workstreams that are
genuinely Sevilla-specific (zone ontology, grammar extraction, height/alignment semantics, PDF
corpus, verification) remain necessary — nothing above is wasted. But the *engineering* target these
stages should feed is a **container-agnostic `ZoneResolverPort`/`ProxyDescriptor` abstraction** (an
ArcGIS-REST container implementation, reusable by any future ArcGIS-published Spanish municipality —
Sevilla would be the *proving instance*, not a one-off), not a Sevilla-only or Andalucía-only
resolver. The RFC's proposed file layout
(`packages/site-parcel-data/src/providers/zoneResolver/containers/arcgisRest.ts`) is the concrete
target; see the RFC's full text for the tiered engineering task list if this programme is picked up.

### D.4 — Status, honestly, after this capture

Nothing in §A–§C has been wired into code. `ENVELOPE.md`/`NEXT.md`/`RATE.md` in this same folder still
correctly read `not-assessed` / `pending-implementation` / S3–S5 all ❌. This capture is a stronger
starting point than the 2026-07-26 survey it supplements (live-endpoint-confirmed, cross-validated by
an independent investigation), but the ten/eight unknowns §A/§B/§C each name themselves as blocking are
still genuinely open — none were resolved by this capture or by §D's verification pass, which checked
endpoint *existence*, not endpoint *content*.
