# JURISDICTION PLAYBOOK — the one standard for every country, region and municipality

> **This is the canonical standard.** Every jurisdiction folder — country, region, municipality —
> has the SAME shape, the SAME file names, and is onboarded through the SAME pipeline stages. The
> goal is that adding the Nth municipality is faster and more robust than the (N‑1)th, because the
> structure is already known and only the content changes.
>
> **Status:** ACTIVE as of 2026-07-22. Supersedes the layout sketch in `jurisdictions/README.md`
> (which was designed but never populated — its good ideas are absorbed below; see §6).
> **Reference implementations:** `jurisdictions/es/es-ct/08019-barcelona/` and `saudi-arabia/`.
> **Rollout across all existing folders:** owned by the standardization agent (L-607).

---

## 1 — THE FOLDER TREE (identical everywhere)

```
docs/04-reference/jurisdictions/<cc>/            ← ISO 3166-1 alpha-2, lowercase (es, sa, dk, pt, fr, de, nl, ch) — see §2
  README.md            ← country index + national-layer status (what is solved / achievable / absent nationally)
  NEXT.md              ← country-level: where we stopped, blockers, resume steps, TRIP-WIRES
  sources/             ← primary documents & the verified source catalogue for the NATION
  topics/              ← cross-cutting context data (buildings-lod-height, roads, parks, water) — the CONTEXT layer, not the legal layer
  <cc>-<subdiv>/       ← ISO 3166-2, lowercase (es-ct, es-md, es-an, sa-01) — a region layer, added only where the law is regional (§2)
    README.md · NEXT.md
    <code>-<slug>/     ← national statistical / LAU code + slug, e.g. 08019-barcelona (INE) — see §2
      README.md          ← what governs HERE · pack status · granularity · open questions
      NEXT.md            ← municipality-level: where we stopped, blockers, resume steps, TRIP-WIRES
      findings/          ← the substantive L-NNN investigation records (the reasoning, the measurements)
      sources/           ← SOURCES.md (per-field citations) + VERIFICATION.md (the human sign-off) + any local primary docs
      archive/           ← superseded handoffs + one-shot sourcing prompts (kept, not deleted)
```

**Every level has `README.md` + `NEXT.md`.** That pair is the contract: README says *what is true
now*, NEXT says *where we stopped and how to resume*. Nothing else is mandatory; the rest scales with
how much work a jurisdiction has had.

⚠ **Regions.** Where a country's law is regional (Spain's CCAA, Germany's Länder), a region may sit
between country and municipality as its own folder with the same `README.md`+`NEXT.md` pair. Do NOT
force a region layer where the law is national (Saudi Arabia today is flat: `saudi-arabia/<city>/`).
**Depth follows the law, not a fixed template.**

---

## 2 — NAMING — ISO-CODED, EVERY LEVEL (the join key is not optional)

Every path segment is an **international standard code**, lowercase, so the tree is unambiguous,
sortable, and joinable to any external dataset without a lookup table. This is the single most
important rule in the playbook — get it right once and every jurisdiction slots in the same way.

| Level | Standard | Form | Examples |
|---|---|---|---|
| **Root** | — | `jurisdictions/` | the one parent folder for all countries |
| **Country** | **ISO 3166-1 alpha-2** | `<cc>` lowercase | `es` Spain · `sa` Saudi Arabia · `dk` Denmark · `pt` Portugal · `fr` France · `de` Germany · `nl` Netherlands · `ch` Switzerland |
| **Region / subdivision** | **ISO 3166-2** | `<cc>-<subdiv>` lowercase (the FULL code, country prefix included) | `es-ct` Catalonia · `es-md` Comunidad de Madrid · `es-an` Andalucía · `sa-01` Riyadh Region · `sa-02` Makkah Region · `dk-84` Hovedstaden |
| **Municipality** | **national statistical / LAU code** + slug | `<code>-<slug>` lowercase | `08019-barcelona` (INE) · `28079-madrid` (INE) · `14021-cordoba` (INE) · INSEE in France, DICOFRE in Portugal |

**Why ISO 3166-2 for the region, not an ad-hoc slug.** The original sketch used `cat` for Catalonia —
readable, but not a standard, and it collides the moment two countries have a `cat`-like region. The
**full ISO 3166-2 code (`es-ct`)** is globally unique, is what the ICGC/RPUC and every EU dataset key
on, and sorts cleanly under its country. **Use it verbatim, lowercased.**

**Why a national code (not ISO) for the municipality.** ISO 3166 does not descend below the
subdivision. The layer below is the **national statistical code** — INE in Spain, INSEE in France,
DICOFRE in Portugal, LAU across the EU. It is the join key the pipeline already uses
(`spain/priority_318.csv` is INE-keyed; RPUC discovery is INE-keyed). A name-only slug forces a
lookup table on every join and breaks on the two municipalities that share a name.

**The rule-pack identity MUST equal the folder path.** `jurisdictionId` in
`packages/site-parcel-data/src/rulepacks/<id>.ts` = `<cc>-<code>-<slug>` (`es-08019-barcelona`), so a
reviewer gets from a number on screen to the clause that justifies it without searching. **Pack id
and folder path are the same identity, written two ways.**

⚠ **Flat where the law is flat.** A country whose zoning is national (Denmark's Plandata.dk; Saudi
Arabia's national decision today) may hold its findings at the **country level** (`dk/`, `sa/`) and
add the region/municipality layers only when a local instrument actually governs. **Depth follows the
law, not the template.** ISO 3166-2 codes are used the moment a region layer is needed, never
invented before.

✅ **The reference folder migration is DONE (2026-07-23).** `spain/barcelona-catalonia/` is now
`jurisdictions/es/es-ct/08019-barcelona/`, the whole Spanish tree lives under `jurisdictions/es/`,
and all back-references were remapped repo-wide (`git mv` + grep-and-fix). Denmark (`dk/`) and Saudi
Arabia (`sa/`) migrate as their live agents land; the dormant countries (pt/fr/de/nl/ch) are already
under `jurisdictions/`.

---

## 3 — THE FILE CONTRACTS

### 3.1 — `README.md` (every level) — WHAT IS TRUE NOW
- What governs here (and critically: **setback**-governed vs **alignment**-governed — ADR-0270; the
  wrong shape is worse than a wrong number).
- Pack status: which claus/zones packed, which refused, which unencoded.
- **Granularity, stated** (C58 §1.11): parcel / block / sector / ámbito / municipality.
- The current resolution number, with its denominator named.
- An index of the folder's own files.

### 3.2 — `NEXT.md` (every level) — WHERE WE STOPPED & HOW TO RESUME
The template lives in §5. Its non-negotiable sections: **where we stopped · the number · blockers
(each with an exact resume step) · TRIP-WIRES · what's already built · verified sources · dead ends ·
the smallest next step.** The **TRIP-WIRES** section is the point of the whole standard: *"if you see
X while working on another jurisdiction, come back HERE and do Y."* That is how a find in Madrid
reaches Barcelona automatically.

### 3.3 — `sources/SOURCES.md` — PER-FIELD CITATIONS (the trust gate)
One row per value the pack sets: `value · unit · governing article · document title + date · URL`.
**A field with no citable source stays `null` in the pack and is listed here as unverified. Never
interpolate, average, or infer a legal number.** A pack may not ship `confidence: 'structured'`
unless every field it sets has a row here. (This is the L-449 human-verification gate.)

### 3.3b — `SOURCE.md` (jurisdiction root) — THE DATA-SOURCE CATALOGUE (feeds the parcel panel)

**One `SOURCE.md` at every jurisdiction level** (country and municipality), listing **every data
source PRYZM uses for that jurisdiction** — the services, registries and documents behind the
answers. Distinct from `sources/SOURCES.md` (which cites the *legal value* of a *field*); `SOURCE.md`
catalogues *where the data comes from*. It is the human-readable face of the attribution PRYZM is
already obliged to carry per **C23** (provenance), **C55 §1.5** and **C57 §1.9** (attribution
mandatory), and it is what the **parcel-selection panel surfaces on click** (see below).

One row per source, and every column filled or explicitly `—`:

| column | meaning |
|---|---|
| **Source** | the service/registry/document name (e.g. "AMB Geoserveis — `qualificacio_refos/16`") |
| **Provides** | what it answers (clau · buildable depth · height table · parcel geometry · context buildings …) |
| **Endpoint / locator** | the exact URL/path (or the document + page), copy-pasteable |
| **Access** | live API / WFS / WMS / document / user-drawn · free-keyless / keyed / geo-fenced |
| **Confidence tier** | `VERIFIED-LIVE` / `VERIFIED-PRIMARY` / `CONVERGENT-SECONDARY` / `INFERRED` / `COULD-NOT-VERIFY` |
| **Licence / attribution** | the required credit string (C23/C55/C57) |
| **Currency** | as-of date / version / staleness note (e.g. "living refós" vs "1988 Text Refós") |
| **Notes** | the ⚠ gotchas — the wrong path that 301'd, the `CODIS_INE`-not-`CODI_INE` trap, "informatiu no normatiu" |

> ⭐ **THE PANEL LINK (product requirement).** On parcel selection the envelope panel MUST be able to
> show *"where these numbers come from"* — the specific sources that produced THIS parcel's answer,
> each with its tier and attribution. `SOURCE.md` is the human catalogue; the panel reads the same
> facts from the **structured attribution the parcel/zoning layer already carries** (never from the
> markdown at runtime). Keep the two in lock-step: a source in the panel that is not in `SOURCE.md`
> — or vice-versa — is a drift bug. Tracked as **L-612**.

### 3.4 — `sources/VERIFICATION.md` — THE HUMAN SIGN-OFF
Who checked it, when, against which document version, and **what they could NOT confirm.** Draft →
published is a human act.

### 3.5 — What does NOT belong in the repo
- **Source PDFs at scale** — a PGOU set is 100–500 MB; the corpus is ~1.6 TB. Object storage per
  L-450; link, don't commit. (A single recovered primary source like `PGM-NNUU-metropolitana.pdf`
  committed once is the deliberate exception.)
- **`*-AUDIT.md` derivatives** — edit the canonical doc in place (governance rule).
- **Anything uncitable** in `SOURCES.md` — put research notes under an explicit *unverified* heading
  in the README instead.

### 3.6 — MAXIMAL DETAIL — the richness standard (binding on every jurisdiction)

**Write it down as if the next reader has zero context and cannot re-run your session.** The docs
are the asset; the session is disposable. Every jurisdiction's `findings/` must be rich enough that
a stranger — or a future agent on a stale base — can reconstruct exactly what was done, believe it,
and continue. Concretely, a findings record MUST carry:

- **Every endpoint in full** — the exact URL, host, path, params, and the HTTP method. Not "the AMB
  service" — `https://geoportal.amb.cat/geoserveis/rest/services/…` with the query string. Record the
  **wrong** paths too (the `/arcgis/` that 301'd) so nobody re-walks the dead end.
- **Reproduction commands** — the literal `curl`/query that produced each number, copy-pasteable, so
  the finding is re-runnable, not just asserted.
- **Named individual records** — documentIds, cadastral refs, zone codes, feature counts. *"0/33 had
  a text layer"* names the 33; *"8/8 covered by a Pla Parcial"* names the 8 centroids. **An aggregate
  is not evidence** (L-581).
- **The confidence tier on every claim** — `VERIFIED-LIVE` / `VERIFIED-PRIMARY` / `CONVERGENT-SECONDARY`
  / `INFERRED` / `COULD-NOT-VERIFY`. A number without its tier is not documented.
- **The measurement, not just the conclusion** — the denominator named, the sample size, the method,
  and the counter-evidence you looked for. "48%" is meaningless without "of what, measured how."
- **DEAD ENDS, kept** — what was tried and failed, and *why*, so the next pass doesn't repeat it. A
  measured negative is a first-class finding.
- **TRIP-WIRES** — "if you see X in another jurisdiction, come back here" (the whole point of the
  cross-jurisdiction network — a source found in Córdoba must reach Barcelona automatically).
- **The reasoning trail** — not just *what* the rule is, but *why* it was read that way, which
  article, what the alternative reading was, and how it was ruled out. When a claim was later
  corrected or retracted, **keep the retraction visible** — the history is the audit trail.

⇒ **Bias toward MORE detail, always.** Over-documenting costs bytes; under-documenting costs a
re-derived day. If in doubt, write the extra paragraph, name the extra id, paste the extra command.

---

## 4 — THE ONBOARDING PIPELINE (the same stages for every new jurisdiction)

This is the versatile execution the founder asked for: a fixed sequence, so every new place is the
same process with different content. Each stage has a **go/no-go gate** — you do not proceed on a
guess.

| # | Stage | Question it answers | Gate to pass |
|---|---|---|---|
| **P0** | **Scaffold** | — | Create the §1 folder tree from the template. README + NEXT stubs exist. |
| **P1** | **Legal structure** | Is the law national, regional, or per-site-instrument? Flat or layered? | The governing-instrument chain is written down (`parcel → instrument → classification → article`). **This is where Barcelona's 62.8% derived-planning trap hides — look for it explicitly.** |
| **P2** | **Source discovery** | Where do the numbers live? Data or documents? | Every source classified: `VERIFIED-LIVE` endpoint / `document` / `absent`. An unfiltered count run before believing any zero. |
| **P3** | **Parcel + geometry** | Can we get a plot boundary? Free, or user-drawn? | A parcel comes from *somewhere* (cadastre API, or the draw flow) — stated, not assumed. |
| **P4** | **Rule extraction** | What are the actual numbers, per zone/class? | Every extracted value has a `SOURCES.md` row. Construction vs constant declared. |
| **P5** | **Rule-kind mapping** | setback / alignment / block-derived / tiered / coverage-and-far? | The C58 §2.2 geometricRule kind chosen and justified. **Wrong kind = wrong shape, unrecoverable by a confidence chip.** |
| **P6** | **Pack authoring** | — | A `packages/site-parcel-data/src/rulepacks/<id>.ts` pack; `jurisdictionId` = folder identity; registered via the registry (a data addition, not an engine edit). |
| **P7** | **Verification** | Who signed it off? | `VERIFICATION.md` complete. No `structured` confidence without it. |
| **P8** | **Measure resolution** | What % of clicks get a full envelope, honestly? | The number, with named denominator, in README + NEXT. Failure ≠ empty. |
| **P9** | **Close & NEXT** | Where did we stop and why? | `NEXT.md` complete, including TRIP-WIRES, so the next person (or another jurisdiction's find) can resume. |

**Reusable assets that port across jurisdictions** (grow this list as they prove out):
- `streetWidth.ts` — any width-keyed jurisdiction (Saudi عرض الشارع = frontage-to-frontage, verified).
- The **registry + three-outcome disposition** (`pack`/`refusal`/`unregistered`) — a new place is a
  data addition.
- The **refusal vocabulary** (legal · coverage-gap · construction-incomplete · regime-undetermined).
- The **rule-kind catalogue** (C58 §2.2): setback, alignment, block-derived-alignment,
  tiered-occupation, coverage-and-far.
- Does NOT port unexamined: `blockDerivedDepth.ts` (Barcelona Art. 242 is specific; Saudi uses flat
  coverage %). Check before claiming a port.

---

## 5 — THE `NEXT.md` TEMPLATE (copy verbatim for a new jurisdiction)

```markdown
# NEXT — <Place> (<code>, <region>, <country>)
> What this file is + the convention line. Last updated / Maintainer / Status.
## 1 — WHERE WE STOPPED (the one-paragraph truth)
## 2 — THE NUMBER (what % of clicks, which denominator, and why exactly that)
## 3 — BLOCKERS (each: what · why it blocks · what would unblock · the EXACT resume step)
## 4 — TRIP-WIRES (if you see X elsewhere, come back HERE and do Y)
## 5 — WHAT IS ALREADY BUILT (do not redo)
## 6 — VERIFIED SOURCES (endpoint · answers · confidence tier · the exact query)
## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)
## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost
```

The `README.md` template is lighter: *what governs · pack status · granularity · the number · file
index.* Worked examples: `jurisdictions/es/es-ct/08019-barcelona/NEXT.md` (dense) and `saudi-arabia/NEXT.md`.

---

## 6 — RECONCILING THE TWO LEGACY CONVENTIONS (for the rollout agent)

Two shapes exist in the tree today and must become one:

1. **`docs/04-reference/<country>/`** — full names, `topics/` + `regions/`. **Where all real work
   lives** (Barcelona's 20+ docs, Saudi, Denmark, Portugal). ← **THIS ROOT WINS.**
2. **`docs/04-reference/jurisdictions/<iso>/<region>/<code>-<slug>/`** with `SOURCES.md` /
   `VERIFICATION.md` — **well-designed, never populated.** Its *ideas* (the `«code»-«slug»`
   municipality key, the SOURCES/VERIFICATION trust gate, `jurisdictionId` = folder identity) are
   **absorbed into this playbook** (§2, §3.3, §3.4).

**Rollout task (L-607):** migrate the good bits of `jurisdictions/` into the `<country>/` tree, apply
the §1 shape to all eight country folders, rename municipality folders to `«code»-«slug»`, and turn
`jurisdictions/README.md` into a one-line redirect to this playbook. **Preserve git history
(`git mv`), change no findings content, and record any folder that legitimately deviates and why.**

---

## 7 — WHY THIS EXISTS (the one paragraph to remember)

We spent a day proving a city and, more importantly, proving the *method*. The method only compounds
if it is written down the same way every time. **A standardised folder is not bureaucracy — it is the
mechanism by which a source found in Córdoba automatically reaches the Barcelona team, by which the
Nth city is cheaper than the (N‑1)th, and by which no one re-runs a dead end someone already
measured.** Governed by **C57**, **C58**, **ADR-0269/0270**, and the honesty rule that outranks all
of them: *failure and empty are the same VALUE and must never be the same ANSWER.*
```

**See also:** `GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md` (the jurisdiction axis + phases) ·
`SITE-FEASIBILITY-ARCHITECTURE-AND-SCALING.md` (the engineering half) · `jurisdictions/README.md`
(the superseded sketch this replaces).
