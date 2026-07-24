# Jurisdiction reference — one folder per country / region / municipality

**Purpose.** A zoning rule pack is only trustworthy if every number in it can be traced to a
clause in a real ordinance and shown to have been checked by a person. This tree is where that
evidence lives. The pack is CODE; this is its PROVENANCE.

Governed by **C58** (§1.2 fidelity, §1.3 explain-why, §1.4 never present a guess as a fact,
§1.6 per-field provenance, §2.2 the pack schema) and **ADR-0269** (curate-then-serve).
Sequenced by **L-449** (extraction pipeline, founder-approved *with* the human verification
gate) and **L-450** (the 318-municipality corpus on object storage).

---

## Layout

```
docs/04-reference/jurisdictions/
  README.md                 ← you are here: the index + the authoring contract
  _TEMPLATE/                ← copy this to start a new municipality
  es/                       ← ISO 3166-1 alpha-2 country code
    README.md               ← national data layer: what is solved / achievable / absent
    cat/                    ← region (CCAA / state / province) — short slug
      README.md             ← regional services, layer names, data currency
      08019-barcelona/      ← «INE code»-«slug»  ← THE MUNICIPALITY
        README.md           ← what governs here, pack status, open questions
        SOURCES.md          ← PER-FIELD citations: value → article → document → URL
        VERIFICATION.md     ← the human sign-off that earns `confidence` (L-449 A2)
```

### Why the folder name carries the INE code

`08019-barcelona`, not `barcelona`. The INE code is the **join key the pipeline already uses** —
`spain/priority_318.csv` is keyed by it, Catalonia's RPUC document discovery is INE-keyed, and
the SIU classification service returns it. A human-only slug would force a lookup table on every
join and would not survive the two municipalities that share a name.

Country and region segments are lowercase and stable; the municipality segment is
`«code»-«slug»` where `«code»` is the national statistical code (INE in Spain, INE/DICOFRE in
Portugal, INSEE in France).

### One pack, one folder — the names must match

| Artefact | Location |
|---|---|
| Rule pack (code) | `packages/site-parcel-data/src/rulepacks/«jurisdictionId».ts` |
| Its provenance (docs) | `docs/04-reference/jurisdictions/«country»/«region»/«code»-«slug»/` |

`jurisdictionId` in the pack MUST equal the folder path's identity (e.g. `es-08019-barcelona`),
so a reviewer can get from a number on screen to the clause that justifies it without searching.

---

## The authoring contract — what a municipality folder MUST contain

A pack may not ship `confidence: 'structured'` unless all four hold. This is the **human
verification gate** L-449 was approved on; it is the whole reason extracted numbers are
trustworthy, and it is not optional.

1. **`SOURCES.md` — a citation for every field the pack sets.** One row per value:
   value · unit · governing article · document title + date · URL. A field with no citable
   source stays `null` in the pack and is stated here as unverified. **Never interpolate,
   average, or infer a number** — an absent number is honest; a plausible one is not.
2. **`VERIFICATION.md` — who checked it, when, against what.** Name, date, the document
   version consulted, and anything they could NOT confirm. Draft → published is a human act.
3. **`README.md` — what actually governs.** Critically: whether the zone is *setback*-governed
   or *alignment*-governed (**ADR-0270**). Getting this wrong is not a wrong number, it is a
   wrong SHAPE — a fact of the wrong kind, which no confidence chip corrects.
4. **Granularity, stated (C58 §1.11).** Parcel / block / sector / ámbito / municipality. A
   sector-level FAR presented as a parcel FAR is a category error, not an imprecision.

## What does NOT belong here

- **The source PDFs.** A PGOU document set is 100–500 MB; ~8,131 of them is ~1.6 TB. They live
  on object storage per **L-450** — never the repo. Link to them; do not commit them.
- **Derived audit files.** Per the governance rule, edit the canonical contract in place;
  do not spawn `*-AUDIT.md` derivatives.
- **Anything not verifiable.** If it cannot be cited, it is a research note — put it in the
  region README under an explicit *unverified* heading, not in `SOURCES.md`.

---

## Index

| Jurisdiction | Tier | Pack | Status |
|---|---|---|---|
| [`es/`](es/) — Spain | A (geometry) live; B (classification) live; C (numbers) curation-only | — | national layer per **L-441** |
| `es/cat/08019-barcelona` | pilot | `esBarcelonaEnsanche` | **IN PROGRESS** — A1d |
| [`no/`](no/) — Norway | National baseline fully characterised; 3 cities scaffolded | — | RESEARCH COMPLETE — ~32% national rate; Trondheim planregister confirmed open; Oslo/Bergen WFS TBD |
| `no/no-50/5001-trondheim` | first city | — | SCAFFOLD — planregister access confirmed; WFS GetFeature probe not yet run |
| `no/no-03/0301-oslo` | second city | — | SCAFFOLD — Planinnsyn viewer confirmed; standalone WFS not yet confirmed |
| `no/no-46/4601-bergen` | third city | — | SCAFFOLD — national mechanism confirmed; planregister endpoint not yet located |

Portugal, France and the remaining CCAA are unstarted. Per **L-443**, Portugal is a *separate
jurisdiction*, not an extension of the Spain work: PDM ≠ PGOU, different infrastructure
(DGT/SNIG), and it needs its own live-verification pass before any estimate.

## Related

- `docs/04-reference/jurisdictions/es/` — the national live-verification research (**L-438**) and the
  priority-municipality corpus. That folder is *research*; this tree is *curated output*.
- `docs/02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md` — the governing contract.
- `docs/02-decisions/adrs/ADR-0270-*.md` — the geometric-rule union (setback / alignment / explicit-area).
