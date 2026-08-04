# SOURCE — Founder: Barcelona Heritage/Flood Overlay Unblocking Dossier (raw capture)

> **Provenance.** Founder-provided research, delivered 2026-08-03, responding directly to this
> session's finding that `resolveBarcelonaHeritageOverlay.ts` / `resolveCatalunyaFloodOverlay.ts` are
> built, tested, and unwired ("dead code, zero call sites"). Captured **verbatim** in §A–§B. §C is
> mine: verification against the actual resolver source, which answers several of the dossier's
> "research items" already — and genuinely leaves others open.
>
> Related: [`../../ENVELOPE-PIPELINE-FORENSIC-BLOCKER-ANALYSIS.md`](../../../es-an/ENVELOPE-PIPELINE-FORENSIC-BLOCKER-ANALYSIS.md)
> (names the wiring gap this dossier responds to) ·
> `packages/site-parcel-data/src/providers/resolveBarcelonaHeritageOverlay.ts` ·
> `packages/site-parcel-data/src/providers/resolveCatalunyaFloodOverlay.ts`

**Framing, quoted:** *"The blocker is no longer 'research whether Barcelona has heritage/flood
constraints.' That research is complete. The blocker is to prove the engineering contract so the
existing resolvers can legally participate in envelope creation... The remaining work should be
treated as an unblocking dossier, not as exploratory research."*

---

## §A — Heritage: 8 research items + missing engineering contract

Current-state table as given (unverified claims marked, verified/corrected in §C):

| Capability | Status (as claimed) | Evidence (as claimed) |
|---|---|---|
| Authoritative dataset identified | ✅ | Existing resolver |
| Resolver implemented | ✅ | `resolveBarcelonaHeritageOverlay()` |
| Tests | ✅ | 27 assertions |
| Envelope engine | ✅ | `computeBuildableEnvelope()` |
| Registry integration | ❌ | No references in dispatch |
| Rendering | ❌ | Never reached |
| Legal composition | ❌ | Undefined |

**Research Item 1 — attribute ontology.** Claim: the resolver should not expose raw fields
(`{A, B, C}`) but a structured shape (`protectionLevel`, `interventionClass`, `legalSource`,
`catalogueId`, `effects[]`). **See §C — already true, in a stronger form than proposed.**

**Research Item 2 — universal statutory-consequence taxonomy.** Proposes a finite vocabulary
(`NONE`/`CONSULT_REQUIRED`/`PRESERVE_FACADE`/`NO_DEMOLITION`/`MAX_HEIGHT`/`KEEP_VOLUME`/
`KEEP_ALIGNMENT`/`NO_EXTENSION`/`SPECIAL_AUTHORISATION`/`NO_NEW_BUILD`), with every Barcelona
heritage class mapped onto it as versioned legal data, not engine logic. **See §C — genuinely open;
the resolver deliberately does not do this yet.**

**Research Item 3 — precedence.** Need the legal order between planning ordinance, heritage
catalogue, and specific monument declaration (or heritage → PGM → Special Plan). Deliverable:
`precedence.md` with citations. **See §C — genuinely open.**

**Research Item 4 — catalogue completeness.** Measure resolver-vs-catalogue match rate on a 100-parcel
protected sample (target 100/100 or a measured fraction, not an anecdote). **See §C — partially
open: layer A is schema-verified live, B/C are assumed by family symmetry, not independently
sampled.**

**Research Item 5 — geometry semantics.** Question: does `GetFeatureInfo` return nearest feature,
intersecting feature, polygon owner, or attribute-only? **See §C — this is already CLOSED, and
closed negative: no geometry is retrievable from this service at all, verified live across two
`INFO_FORMAT`s.**

**Research Item 6 — envelope interaction matrix.** Per-parameter table (FAR/height/coverage/
setbacks/alignment/uses/volume/floors × yes/maybe/no heritage can modify). **See §C — genuinely
open.**

**Research Item 7 — composition algorithm.** Replace `if (heritage)` branching with
`Envelope → Constraint[] → compose() → Envelope`, where each heritage effect selects exactly one of
`CAP`/`REPLACE`/`REMOVE`/`ANNOTATE`. **See §C — genuinely open; explicitly out of scope in the
resolver's own header.**

**Research Item 8 — legal citations.** Every effect needs `constraint → law → article → dataset →
feature id` (example: "Height capped to 16m because PEPPA Article 42, Catalogue entry 184, Feature
BCN-1234"). **See §C — partially true: legal basis (Llei 9/1993 Art. 7-8 / 35-36) is already cited
at the file level; per-feature/per-effect citation chains are not yet modelled.**

**Missing engineering contract, proposed:**

```ts
interface StatutoryConstraint {
    source: string;
    featureId: string;
    legalCitation: Citation;
    type: "cap" | "replace" | "exclude" | "annotate";
    affects: ("height" | "far" | "coverage" | "alignment" | "use" | "volume")[];
    value?: number;
    confidence: "authoritative";
}
```

then `Envelope → Constraint[] → compose() → Certified envelope`.

---

## §B — Flood: parallel 5-item audit; "definition of unblocked"; three-pass deepening to a 15-stage completion dossier

**Flood items 1–5** mirror the heritage structure: inventory flood classes (T10/T100/T500/
preferential-flow/floodplain); determine legal consequence per class (prohibited/conditional/
advisory — explicitly warns *"flood maps often describe hazard, not prohibition"*); precedence
(flood overrides zoning, or vice versa); geometry validation (100-sample parcel-intersects-official-
polygon); constraint taxonomy (`NO_BUILD`/`HEIGHT_CAP`/`FOUNDATION_REQUIREMENT`/`AUTHORISATION`/
`CONSULT`/`INFORMATION_ONLY`).

**Definition of "unblocked" (first pass):** authoritative ontology + precedence matrix + constraint
taxonomy + composition contract + geometry validation + end-to-end traceable evidence all present →
remaining work becomes pure wiring (register providers, add proxy routes, invoke composition).

**Second pass** adds: overlay completeness counts (# heritage polygons, # flood polygons, # protected
parcels, # successfully-resolved samples), a full effect matrix example (`BCIN → replace height →
Article X`), and an end-to-end legal trace requirement (`parcel → zone → envelope → heritage →
flood → final envelope`, each step citing source dataset/feature ID/article/parameter/value).

**Third pass — 15-stage "Barcelona Envelope Completion Dossier"** (condensed; each stage deepens the
prior passes, not a restatement):

1. **Dataset completeness (100%)** — full publisher/authority/URL/service-type/CRS/update-frequency/
   licence/coverage/version/stable-ID/attributes/geometry-type inventory for every heritage AND flood
   dataset, proving *nothing else exists* that should influence the envelope.
2. **Complete attribute ontology** — `raw value → meaning → legal citation → engine interpretation`
   for every field, never exposing raw GIS fields.
3. **Exhaustive value census** — `SELECT DISTINCT` every categorical field (protection_level,
   intervention, catalogue class, subtype, status, restrictions), not a sample — target a
   "Barcelona Heritage Value Registry" with zero unknown-at-runtime values.
4. **Legal semantics** — every value gets article/regulation/citation/engine-consequence, "no
   interpretation left for engineers."
5. **Complete envelope impact matrix** — per legal class × per parameter (FAR/height/floors/coverage/
   setback/alignment/uses/volume/basement/roof), repeated for flood.
6. **Precedence graph** — full hierarchy (regional law → municipal master plan → special plan →
   heritage catalogue → building-specific declaration, or whatever Barcelona actually uses), with
   every override marked replace-vs-supplement, "never guess."
7. **Constraint taxonomy** — normalize into ~15-20 universal `ConstraintType` values, explicitly so
   future jurisdictions reuse the same engine.
8. **Geometry validation** — measured accuracy/false-positive/false-negative rate on a 100-500
   protected-parcel sample.
9. **Topology validation** — deterministic resolution for nested/adjacent/duplicate/overlapping
   catalogue polygons on one parcel.
10. **Composition specification** — `Envelope + Constraint = Envelope'` with explicit operators
    (`CAP`/`REPLACE`/`REMOVE`/`INTERSECT`/`ANNOTATE`/`REFUSE`), jurisdiction-agnostic.
11. **Provenance contract** — 100% `parameter → dataset → feature → law → article` traceability.
12. **Edge cases** — protected building in flood zone; protected façade on unprotected extension;
    parcel crossing two catalogue/flood-class polygons; partial protection; building-protected-but-
    parcel-not; parcel split by road — each needs a deterministic rule.
13. **Currency** — proof the dataset is still current (publication/revision/last-update/superseded
    status).
14. **Completeness audit checklist** — 10-item sign-off before declaring research closed.
15. **Certification dataset** — a ~100-parcel gold-standard regression corpus: parcel → zone →
    envelope → heritage → flood → final envelope, with every citation and modified parameter stored.

**Final "research unblocked" test (5 questions, all must be answerable without opening another
browser tab/GIS viewer/legal document):**
1. Can every authoritative overlay affecting buildability be enumerated, proving none was omitted?
2. Can every attribute value from every resolver be translated deterministically into a documented
   legal effect with a citation?
3. Can every combination of zoning + overlay constraints be composed via a complete, documented
   precedence/composition model?
4. Can every envelope modification be traced end-to-end (parameter → feature → dataset → provision)
   without ambiguity?
5. Do representative test parcels covering all constraint classes reproduce the same envelope
   deterministically, with no unresolved edge cases?

**If yes to all five: "the implementation work is entirely mechanical — register the overlay
providers, invoke them in the dispatch path, compose the returned constraints, and expose the
resulting legally constrained envelope. There should be no need for further legal interpretation,
GIS discovery, or ontology work during implementation."**

---

## §C — Verification against the actual resolver code (mine)

This dossier was written in response to the finding that these overlays are unwired. Reading the
actual files (`git show HEAD:packages/site-parcel-data/src/providers/resolveBarcelonaHeritageOverlay.ts`
and `resolveCatalunyaFloodOverlay.ts`) shows the dossier's premise — that this needs *discovery-style*
research from scratch — is only partly right. Several items it treats as open are already answered,
in some cases more rigorously than the dossier proposes. Others are genuinely open exactly as
described.

### Already answered in code (heritage)

- **Research Item 1 (attribute ontology)** — **already true, and stronger than proposed.** The
  resolver does not expose raw `{A,B,C}`. It has typed `BcnHeritageAssetLayerDef` records
  (`layerName`, `letter`, `verified`), reads structured `BcnHeritageAssetFeature`/
  `BcnHeritageBufferFeature` shapes, and carries the catalogue's own `INTERVEN` field **verbatim by
  deliberate design** — the file's own header states this is a conscious choice: *"carries the
  catalogue's own words rather than interpreting them into a setback or a refusal; that
  interpretation is a downstream concern (a rule pack / dispatcher), not this provider's."* This is
  not an oversight the dossier can close — it is an architectural decision already made, and Research
  Item 2's taxonomy (below) is the actual missing downstream piece.
- **Research Item 5 (geometry semantics) — CLOSED, negative, not open.** The dossier frames this as
  an open question ("does the service return nearest/intersecting/attribute-only?"). It's already
  answered and it's the least convenient answer: `BCN_HERITAGE_NO_GEOMETRY_CAVEAT` states, verified
  live across both `text/xml` and `application/gml+xml; version=3.1`, that `GetFeatureInfo` **never**
  returns geometry — attribute-bag only. `geometryAvailable: false` is carried as a literal in every
  successful resolution, not just documented in a comment. **Any future wiring work must design
  around zero drawable geometry from this source, not investigate whether geometry is retrievable —
  that investigation is done.**
- **Research Item 8 (legal citations), partially** — file-level legal basis is already cited and
  distinguished by mechanism: `BCN_HERITAGE_LEGAL_BASIS_ASSET = 'Llei 9/1993 (Patrimoni Cultural
  Català) Art. 7-8'` (statutory categories) vs. `BCN_HERITAGE_LEGAL_BASIS_BUFFER = '... Art. 35/36'`
  (protection-buffer instruments) — these are different legal mechanisms, already distinguished in
  code. What's missing is the **per-feature** citation chain (Research Item 8's own example: "Feature
  BCN-1234, Catalogue entry 184") — that granularity is not modelled.
- **Honesty/failure semantics (not explicitly asked for, but relevant to Items 3/6/7)** — the resolver
  already implements four documented honesty properties: never throws; empty result is success, not
  refusal (since most of Barcelona isn't heritage-protected); per-layer failure tracking via
  `unreachableLayers` (a layer that failed to answer is never silently folded into "published
  nothing"); and the `geometryAvailable: false` literal above. Any composition contract built on top
  should preserve these, not re-derive them.

### Already answered in code (flood — `resolveCatalunyaFloodOverlay.ts`)

- Legal shape already modelled with citations: `DPH` (Domini Públic Hidràulic) → `severity:
  'prohibits'` (public-domain ownership, not merely a use restriction); `ZFP` (Zona de Flux
  Preferent) → `severity: 'restricts'` (Art. 9quater bans vulnerable uses outright, other actions
  need a *declaració responsable*) — both cited to RD 638/2016. This directly pre-answers Flood
  Research Item 2's "prohibited vs. conditional vs. advisory" table for two of the three named
  classes.
- **A third class, `ZI` (Zona Inundable), is explicitly NOT queried** — no ZI-named layer was found
  on the census, and `CATALUNYA_FLOOD_OVERLAY_MISSING_CONSTRAINTS` carries that gap forward on every
  resolution as a named, typed absence — not silently. This is the flood-side "negative knowledge"
  discipline the dossier's own third pass (Stage 3, "exhaustive value census") calls for; it already
  exists here as a coverage gap the resolver refuses to hide.
- **Overlap handling already decided**: DPH nested inside its covering ZFP polygon is documented as
  the *expected* shape, not an ambiguity to resolve — the resolver returns a list of effects, one
  per layer that hit, and deliberately never picks a "winner." This partially pre-empts Flood Item 3
  (precedence) for the DPH/ZFP relationship specifically, though not for flood-vs-zoning precedence,
  which remains open.
- ⚠ **Status is explicitly lower-confidence than the heritage resolver**: the file's own header rates
  itself "HIGH on schema and the two live features (byte-verified); MEDIUM on the legal-severity
  mapping (RD 638/2016 citations supplied as already-established context, not re-derived here); LOW
  on the proxy contract (no same-origin proxy exists yet, so its shape is a proposal, not a measured
  fact)." This is a materially weaker starting point than heritage's, worth carrying into any
  effort estimate for wiring flood specifically.

### Genuinely still open (both overlays)

- **Precedence** (Heritage Item 3 / Flood Item 3, beyond the DPH/ZFP-internal case above) — no
  document exists establishing zoning-vs-heritage-vs-flood override order.
- **Statutory-consequence taxonomy** (Heritage Item 2) and **envelope interaction matrix** (Heritage
  Item 6, Flood Item 5's taxonomy) — the resolvers deliberately stop at raw/typed catalogue data;
  translating `INTERVEN` values or `DPH`/`ZFP` severities into a shared `ConstraintType` vocabulary
  the compute engine can consume does not exist anywhere in the codebase.
- **Composition algorithm** (Heritage Item 7) — `computeBuildableEnvelope()` has no `Constraint[]`
  input today; there is no `compose()` function. This is the actual missing engineering contract, and
  the dossier's proposed `StatutoryConstraint` interface is a reasonable starting shape for it —
  worth prototyping against the *existing* resolver output shapes rather than a hypothetical one,
  since heritage and flood currently return two different discriminated-union shapes, not one common
  format.
- **Catalogue completeness sampling** (Heritage Item 4) — layers B/C (BCIL/BCIU) are schema-*assumed*
  by symmetry with layer A (BCIN), not independently verified against a live feature. A 100-parcel
  sample would close this specifically for B/C.
- **Topology / edge cases / currency / certification corpus** (Stages 9, 12, 13, 15) — no code or
  findings doc addresses multi-polygon overlap resolution, edge-case parcels, dataset currency
  checks, or a regression corpus for either overlay.

### What this means for the roadmap

The prior forensic analysis (`ENVELOPE-PIPELINE-FORENSIC-BLOCKER-ANALYSIS.md`) classified "wire
Barcelona's heritage + flood overlays" as **Engineering, days effort**. That estimate holds for
*heritage* (schema, honesty properties, and legal citation are already solid; the gap is
composition + a proxy route). It should be treated as **larger and lower-confidence for flood**,
given the file's own self-rated LOW confidence on the proxy contract and MEDIUM on the legal-severity
mapping — flood is closer to "prototype, not yet load-bearing" than heritage is. Recommend: build the
composition contract and taxonomy against heritage first (the stronger of the two), then port to
flood rather than doing both simultaneously.
