# jurisdictions/ — normalization plan (bring every country + city folder to the EQUAL C63 standard)

> **Status**: PLAN (2026-07-30, audit **L-650**). Authored under
> [C63 §5.1/§5.2/§5.3](../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md) (the equal folder
> standard) + [ADR-0282](../../02-decisions/adrs/ADR-0282-equal-jurisdiction-folder-standard-and-city-completion-rollout-program.md)
> + [SPEC-CITY-COMPLETION-ROLLOUT](../../03-execution/specs/SPEC-CITY-COMPLETION-ROLLOUT.md) (Phase 0).
> **This doc MOVES NOTHING.** It is the target-shape plan; the **orchestrator** executes the `git mv`s +
> rewrites inbound links in one pass (multi-agent discipline — a scoped country agent writes only its own
> `jurisdictions/<cc>/**`, never moves files, never touches the global matrix).
>
> ⚠ **Parallel-safety.** `jurisdictions/es/**` is being written concurrently by the **Spain agent**. The
> Spain rows below are framed by the STANDARD, not a frozen snapshot — survey only; the Spain agent /
> orchestrator reconcile them. This plan does not write into `es/`.

The analogue of [`../_ORGANIZATION.md`](../_ORGANIZATION.md) (which triages the loose `04-reference/` root),
one level down: it triages the `jurisdictions/` tree so every country and city folder is **identical in
shape** and therefore comparable (C63 §5.1). A file is either in the standard set or it is misplaced —
there is no third category.

---

## §1 — The standard sets (the target every folder converges to)

### Country folder `jurisdictions/<cc>/` (C63 §5.2)
`COUNTRY-RATE.md` (composite master roll-up) · `README.md` · `LEGISLATION-RATE.md` · `LOD-RATE.md` ·
`COUNTRY-DATA-STRATEGY.md` · `RATE-IMPLEMENTATION-PLAN.md` · `NEXT.md` · `sources/{SOURCES,VERIFICATION}.md` ·
`findings/` · `regions/README.md` · `topics/{buildings-lod-height,parks-trees,roads-pedestrian,water}.md` ·
the `<cc>-<subdiv>/<code>-<slug>/` **city dossiers**. (`ENVELOPE-RULES.md` optional where a country ships one.)

### City dossier `<cc>/<cc>-<subdiv>/<code>-<slug>/` (C63 §5)
`RATE.md` (composite master) · `LEGISLATION-RATE.md` · `LOD-RATE.md` · `README.md` · `ENVELOPE.md` ·
`HEIGHT.md` · `NEXT.md` · `RISK-REGISTER.md` · `RATE-IMPLEMENTATION-PLAN.md` ·
`sources/{SOURCES,VERIFICATION}.md` · `findings/` · (`archive/` optional).

Templates: `_TEMPLATE/` (country + shared files) · `_TEMPLATE/_CITY/` (city-specific files) ·
`_TEMPLATE/NAMING-CONVENTION.md` (the naming master).

---

## §2 — Two SYSTEMIC renames/scaffolds (apply to EVERY folder, do once)

These are the L-649 naming migration executed across the whole tree (the four Catalan cities are already done;
everything else is pending — C63 §8.1 migration note):

1. **Country level — split the legacy `RATE.md`.** Every `<cc>/RATE.md` today is the pre-L-649
   *legislation/data-fill* number (verified: it opens with "Data Readiness Rate … Structured dimensional fill
   rate"). Therefore, for **every** country: **rename `<cc>/RATE.md` → `<cc>/LEGISLATION-RATE.md`** (semantics
   unchanged) **and scaffold a new `<cc>/COUNTRY-RATE.md`** (the composite master roll-up; template
   `_TEMPLATE/COUNTRY-RATE.md`; all cells `not-assessed`). — applies to: `be ch de dk es fi fr it nl no pt sa se us` (14).
2. **City level — split the legacy `RATE.md`.** Every non-Catalan city's `RATE.md` is likewise the legacy
   legislation number: **rename `<city>/RATE.md` → `<city>/LEGISLATION-RATE.md`** **and scaffold a new
   `<city>/RATE.md`** (composite master, template `_TEMPLATE/_CITY/RATE.md`). The four Catalan cities already
   carry `LEGISLATION-RATE.md` but are **missing the composite `RATE.md`** — scaffold it there too.

After §2, no folder carries a bare legacy `RATE.md` meaning "legislation"; `RATE.md`/`COUNTRY-RATE.md` always
means the composite master (C63 naming rule).

---

## §3 — Per-country plan (loose files → home · missing standard files)

Legend: **→** = move to · **rename** = §2 split · **scaffold** = create from template (all `not-assessed`).
"City default gaps" = missing `LOD-RATE.md · ENVELOPE.md · HEIGHT.md · RISK-REGISTER.md · findings/` unless noted.

### `es/` — Spain ⚠ (Spain agent's subtree — survey only, do not write here)
**Loose at country root → `es/findings/`:** `CONTEXT-DATA-SPIKE.md` · `ES-CITY-ENVELOPE-CERTIFIABILITY-SURVEY.md`
· `SOURCE-founder-deep-dives-raw.md` · `SPAIN-BREADTH-RESUME-NOTES.md` · `SPAIN-CADASTRAL-DISSOLVE-PROBE.md` ·
`SPAIN-DISSOLVE-FAILURE-TAXONOMY.md` · `SPAIN-GEODATA-SOURCE-COVERAGE.md` · `SPAIN-HEIGHT-MEASUREMENT.md` ·
`SPAIN-STREET-WIDTH-DISTRIBUTION-PROBE.md` · `SPAIN-ZONING-LIVE-VERIFICATION-2026-07-20.md` (10 files).
**Loose data → `es/sources/`:** `priority_318.csv` · `priority_407.csv` · `seed_counts_by_ccaa.csv` (3).
**Country missing:** `COUNTRY-RATE.md` (scaffold) · `LEGISLATION-RATE.md` (rename from `RATE.md`) ·
`COUNTRY-DATA-STRATEGY.md` · `NEXT.md` · `sources/` dir · `findings/` dir.
**Cities:**
| City | Loose → home | Rename/scaffold | Missing |
|---|---|---|---|
| `es-ct/08019-barcelona` | **14 files → `findings/`**: `BARCELONA-COMPLETE-COVERAGE-PLAN.md` · `BARCELONA-DATA-PIPELINE.md` · `BARCELONA-REASONING-RECORD.md` · `EXPERT-BRIEF.md` · `RULEPACK-SOURCING-SPEC.md` · `L-525-…` · `L-526-…` · `L-552-…` · `L-583-…` · `L-587-…` · `L-590-…` · `L-590c-…` · `L-590d-…`; **`PGM-NNUU-metropolitana.pdf` → object storage (L-450), remove from repo** | scaffold composite `RATE.md` | `LOD-RATE.md` · `README.md` · `sources/` dir |
| `es-ct/08101-hospitalet` · `es-ct/08015-badalona` · `es-ct/08200-sant-boi` | — | scaffold composite `RATE.md` | `LOD-RATE.md` · `README.md` · `sources/` dir · `findings/` |
| `es-md/28079-madrid` | `SOURCE.md` → `findings/` (stray singular; `sources/SOURCES.md` already exists) | rename `RATE.md`→`LEGISLATION-RATE.md` + scaffold composite `RATE.md` | City default gaps (`findings/` present) |
| `es-an/14021-cordoba` | — | rename + scaffold composite `RATE.md` | City default gaps (`findings/` present) |

*(Barcelona is the single largest offender: 14 root files + a repo-committed PDF. It also has no `sources/`
dir — the citations live in `findings/L-590*` + `archive/…-prompts/`; a `sources/SOURCES.md` + `VERIFICATION.md`
should be assembled from them, but that is Phase 1/legislation-axis work, not a mechanical move.)*

### `dk/` — Denmark
**Loose → `dk/findings/`:** `DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md` (also referenced from `04-reference/`
root — the `_ORGANIZATION.md` plan moves a copy here; keep ONE canonical copy in `dk/findings/`, rewrite links).
**Country missing:** `COUNTRY-RATE.md` (scaffold) · `LEGISLATION-RATE.md` (rename) · `COUNTRY-DATA-STRATEGY.md`.
`ENVELOPE-RULES.md` present — keep (optional standard). No city dossiers yet (Copenhagen rides national bake —
scaffold `dk-84/0101-copenhagen` when tackled; log in `dk/NEXT.md`).

### `pt/` — Portugal
**Loose → `pt/findings/`:** `PORTUGAL-CONTEXT-DEEP-DIVE.md`.
**Country missing:** `COUNTRY-RATE.md` · `LEGISLATION-RATE.md` (rename) · `COUNTRY-DATA-STRATEGY.md`.
**Cities** (`pt-11/1106-lisboa` · `pt-13/1315-porto` · `pt-03/0303-braga`): rename + scaffold composite `RATE.md`; City default gaps.

### `sa/` — Saudi Arabia
**Loose → `sa/findings/`:** `SAUDI-ARABIA-ENTRY-ASSESSMENT.md` · `SAUDI-PRIMARY-DECISION-EXTRACT.md` ·
`SAUDI-UMAPS-API-ENUMERATION.md`.
**Country missing:** `COUNTRY-RATE.md` · `LEGISLATION-RATE.md` (rename) · `COUNTRY-DATA-STRATEGY.md`.
**Subdivision note:** `sa-01/`, `sa-02/`, `sa-04/` carry region-level `NEXT.md`+`README.md` — tolerable as a
region index, but the standard subdivision dir holds only city dossiers; fold into a single `regions/README.md`
entry or keep as the region README (low priority).
**Cities** (`sa-01/ruh-riyadh` · `sa-02/jed-jeddah` · `sa-04/dmm-dammam`): rename + scaffold composite `RATE.md`; City default gaps (Riyadh has `findings/`).

### `ch/` — Switzerland
**Country:** has `COUNTRY-DATA-STRATEGY.md` ✓. Missing `COUNTRY-RATE.md` · `LEGISLATION-RATE.md` (rename).
**⚠ Mis-nested city — Zürich.** There is no city dossier; Zürich lives as `ch/regions/zurich/ZURICH-BZO-PROBE.md`
+ `ch/sources/bzo_*.json`. **Scaffold a real dossier `ch/ch-zh/z0261-zurich/`** (Zürich BFS/GdeNr `0261`), move
`ZURICH-BZO-PROBE.md` → `ch/ch-zh/z0261-zurich/findings/`, and the `bzo_*.json` → its `sources/`. Keep
`ch/regions/README.md` as the region index. (Geneva/Bern are baked but unscaffolded — log in `ch/NEXT.md`.)
`ch/findings/ZURICH-PARCEL-SOURCE.md` stays in country `findings/` (national parcel study).

### `de/` — Germany
**Country:** has `COUNTRY-DATA-STRATEGY.md` ✓. Missing `COUNTRY-RATE.md` · `LEGISLATION-RATE.md` (rename).
**Cities:** `de-be/11000-berlin` + `de-by/09162-munich` also **missing `RATE-IMPLEMENTATION-PLAN.md`**;
`de-hh/02000-hamburg` has it. All three: rename + scaffold composite `RATE.md`; City default gaps.

### `fr/` — France
**Country missing:** `COUNTRY-RATE.md` · `LEGISLATION-RATE.md` (rename) · `COUNTRY-DATA-STRATEGY.md`
(⚠ `fr/` is the WORKED reference in `_TEMPLATE/COUNTRY-DATA-STRATEGY-TEMPLATE.md` — author `fr/COUNTRY-DATA-STRATEGY.md` first as the exemplar).
**Cities** (`fr-idf/75056-paris` · `fr-ara/69123-lyon` · `fr-pac/13055-marseille`): rename + scaffold composite `RATE.md`; City default gaps.

### `it/` — Italy
**Country missing:** `COUNTRY-RATE.md` · `LEGISLATION-RATE.md` (rename) · `COUNTRY-DATA-STRATEGY.md`;
`topics/` has only `buildings-lod-height.md` (add `parks-trees` · `roads-pedestrian` · `water`).
**Cities** (`it-laz/058091-rome` · `it-lom/015146-milan` · `it-pie/001272-turin`): rename + scaffold composite `RATE.md`; City default gaps.

### `no/` — Norway
**Country missing:** `COUNTRY-RATE.md` · `LEGISLATION-RATE.md` (rename) · `COUNTRY-DATA-STRATEGY.md` · `RATE-IMPLEMENTATION-PLAN.md`.
**Cities** (`no-03/0301-oslo` · `no-46/4601-bergen` · `no-50/5001-trondheim`): rename + scaffold composite `RATE.md`;
missing `RATE-IMPLEMENTATION-PLAN.md` + City default gaps.

### `se/` — Sweden
**Country missing:** `COUNTRY-RATE.md` · `LEGISLATION-RATE.md` (rename) · `COUNTRY-DATA-STRATEGY.md` · `RATE-IMPLEMENTATION-PLAN.md`.
**Cities:** none scaffolded — Stockholm is baked; **scaffold `se-ab/0180-stockholm`** (coverage gap, log in `se/NEXT.md`).

### `fi/` — Finland
**Country missing:** `COUNTRY-RATE.md` · `LEGISLATION-RATE.md` (rename) · `COUNTRY-DATA-STRATEGY.md` · `LOD-RATE.md`.
**Cities:** none scaffolded — Helsinki is baked; **scaffold `fi-18/091-helsinki`** (coverage gap, log in `fi/NEXT.md`).

### `nl/` — Netherlands
**Country missing:** `COUNTRY-RATE.md` · `LEGISLATION-RATE.md` (rename) · `COUNTRY-DATA-STRATEGY.md` ·
**`sources/` dir · `findings/` dir** (both absent).
**Cities:** none scaffolded — NL national bake ⊇ Amsterdam/Rotterdam/Utrecht; **scaffold `nl-nh/0363-amsterdam`** when demoed (log in `nl/NEXT.md`).

### `be/` — Belgium
**Country missing:** `COUNTRY-RATE.md` · `LEGISLATION-RATE.md` (rename) · `COUNTRY-DATA-STRATEGY.md`.
Note `be/topics/` present; `be/findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md` correctly placed ✓.
**Cities** (`be-bru/bru-brussels` · `be-vlg/ant-antwerp` · `be-wal/lie-liege`): rename + scaffold composite `RATE.md`; City default gaps.

### `us/` — United States
**Country missing:** `COUNTRY-RATE.md` · `LEGISLATION-RATE.md` (rename) · `COUNTRY-DATA-STRATEGY.md`.
**Cities** (`us-ca/0644000-los-angeles` · `us-il/1714000-chicago` · `us-ny/3651000-new-york-city`): rename +
scaffold composite `RATE.md`; City default gaps. **⚠ San Francisco is baked but has NO dossier — scaffold
`us-ca/0667000-san-francisco`** (coverage gap, log in `us/NEXT.md`).

### `gb/` — United Kingdom ⚠ (does not exist)
**London is baked (`bake.mjs REGIONS`) but there is NO `jurisdictions/gb/` folder.** **Scaffold the whole
country folder** `gb/` (from `_TEMPLATE/`) + a city dossier `gb-eng/e09000001-city-of-london` (or a
Greater-London LAU code). Coverage gap — highest-visibility missing country.

---

## §4 — The template itself (make the standard fully copyable)
- `_TEMPLATE/_CITY/` today holds only `RATE.md` + `README.md`; the city-specific `ENVELOPE.md` · `HEIGHT.md` ·
  `RISK-REGISTER.md` stubs are **added by this pass** (L-650) so a city can be scaffolded to the full §5 shape
  in one copy. (`LEGISLATION-RATE.md` · `LOD-RATE.md` · `NEXT.md` · `RATE-IMPLEMENTATION-PLAN.md` · `sources/`
  are copied from `_TEMPLATE/` root, per the `_CITY/README.md` note.)
- `_TEMPLATE/COUNTRY-DATA-STRATEGY-TEMPLATE.md` still cross-references the legacy `RATE.md` as "the single
  measured NUMBER" — update those two lines to `LEGISLATION-RATE.md` when next edited (cosmetic; not a move).

---

## §5 — Summary counts
- **Countries surveyed:** 14 (`be ch de dk es fi fr it nl no pt sa se us`) + **1 missing (`gb`)**.
- **City dossiers surveyed:** ~22 across 12 countries; **4 coverage-gap scaffolds** (SF, Stockholm, Helsinki,
  Amsterdam) + **Zürich re-nest** + **London/`gb` new country**.
- **Loose/misplaced files → `findings/` (or storage):** **~33** — Barcelona 14 (incl. 1 PDF → object storage) ·
  Spain country 13 (10 md + 3 csv) · Saudi 3 · Denmark 1 · Portugal 1 · Madrid 1.
- **Systemic renames:** `RATE.md → LEGISLATION-RATE.md` in **14 countries + ~21 non-Catalan cities**.
- **Systemic scaffolds:** `COUNTRY-RATE.md` in **all 14 countries**; composite `RATE.md` in **all ~26 cities**
  (4 Catalan missing it despite the L-649 rename; ~22 others via the split).
- **Top offenders:** **Barcelona** (14 root files + committed PDF, no `sources/`) · **Spain country root** (13
  loose research/data files, no `sources/`/`findings/` dirs) · **Denmark** (loose reference-architecture doc) ·
  **`gb`/Zürich/SF** (structural coverage gaps).

## §6 — Execution notes (orchestrator)
1. Do §2 (the two systemic splits) first — it is mechanical and unblocks a uniform read.
2. `git mv` each loose file per §3 into its folder's `findings/` (create `findings/`/`sources/` where absent);
   remove the Barcelona PDF from the repo (link to object storage per L-450).
3. Scaffold the missing standard files from `_TEMPLATE/` (all cells `not-assessed` — never hand-typed, C63 §1.1);
   scaffold `gb/` + the 4 coverage-gap city dossiers; re-nest Zürich.
4. Grep the repo for every moved path and rewrite inbound links (docs + code comments); re-verify the C63
   dossier links after moving.
5. **Do NOT write into `es/`** while the Spain agent holds it — hand the Spain rows to that agent / reconcile
   at merge. Everything else is disjoint and parallel-safe (one agent per `<cc>/`).
6. This is Phase 0 of [SPEC-CITY-COMPLETION-ROLLOUT](../../03-execution/specs/SPEC-CITY-COMPLETION-ROLLOUT.md);
   Phase 1 (AUDIT) starts only once a country passes the §1 shape check.
