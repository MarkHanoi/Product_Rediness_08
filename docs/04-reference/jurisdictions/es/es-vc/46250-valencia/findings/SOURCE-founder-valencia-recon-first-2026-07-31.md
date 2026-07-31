# SOURCE — Founder: València should get Madrid-style recon BEFORE legislation (raw capture)

> **Provenance.** Founder-provided research, delivered 2026-07-31, in direct response to
> [`../RATE-IMPLEMENTATION-PLAN.md`](../RATE-IMPLEMENTATION-PLAN.md). Captured **verbatim** in §A.
> §B is mine and is marked as such.
>
> **This capture carries a concrete, actionable change to an existing repo file:** insert a new
> **P4.5 — Planning GIS Intelligence** phase into the València RATE plan, *before* P5 LEGISLATION.
>
> Context: the Madrid captures under
> [`../../es-md/28079-madrid/findings/`](../../es-md/28079-madrid/findings/) (11 batches, same day).

**Founder's headline, quoted:**

> I actually think this is a very good example of why **Madrid should become your Spanish archetype
> before Valencia.**
>
> Looking at Valencia today, I **would not** attempt to produce a 90–95% implementation immediately.
> I'd first perform a Madrid-style reconnaissance to determine whether the necessary data even exists
> in machine-readable form.

---

## §A — Batch 12: València assessment (verbatim)

> **Your current RATE is probably accurate.**

| Axis | Madrid | València (current confidence) |
| ---- | -----: | ----------------------------: |
| Official GIS | ★★★★★ | ★★★★☆ |
| Planning ordinance | ★★★★★ | ★★★★☆ |
| GIS zoning | ★★★★★ | **Unknown** |
| GIS buildable envelope | ★★★★★ (NZ1) | **Unknown** |
| Machine-readable planning rules | Partial | **Unknown** |
| Rule hierarchy | Partial | **Unknown** |
| Article extraction | Possible | Possible |

> The key difference is that **Madrid has already been proven** through endpoint-level reconnaissance.
> For Valencia, we haven't yet answered the fundamental questions.

### Before legislation, answer these questions

**1. ArcGIS reconnaissance.** Does València expose ArcGIS REST? MapServer? FeatureServer? OGC API?
WFS? Vector Tiles? → Deliverable `VALENCIA-DATA-RECON.md`, equivalent to Madrid.

**2. Planning layer discovery.** Locate zone polygons, planning areas, special plans, protection,
building conditions, alignment, uses. **Not assumptions. Actual services.**

**3. Zone vocabulary.** Madrid's is `AMB_TX_ETIQ → 1.1, 1.2, …`. València's might be
`ENS`, `EDA`, `EIX` — **maybe not. Don't know. Need machine discovery.**

**4. GIS schema inventory.** For every planning layer: `field`, `type`, `domain`, `nullable`, `alias`.

**5. Relationship discovery — "the most important question."**
Madrid taught us `Parcel → Spatial join → Planning`. València might instead use a direct
`Parcel ID` join, or a planning block, or a cadastral reference. **Don't assume. Probe it.**

### Then, in order

**Legislation** — only once the GIS is understood: official ordinance → structure → titles →
chapters → articles → tables → produce a **legal index**.

**Ontology mapping** — exactly as Madrid: *Edificabilidad* → `MaximumFAR`, etc.

**Parameter extraction** — search only for *Altura*, *Plantas*, *Edificabilidad*, *Ocupación*,
*Retranqueo*, *Profundidad edificable*, *Usos*. **Nothing else.**

**GIS linkage** — can the ordinance be connected to GIS? Need `Zone code → Article → Parameter`.
If not, manual mapping.

### The five València artifacts (same as Madrid)

| # | Artifact | Contents |
| - | -------- | -------- |
| 1 | `VALENCIA-DATA-RECON.md` | every endpoint, every layer, every field |
| 2 | `VALENCIA-ZONE-INVENTORY.md` | every zone, official designation, GIS code, hierarchy |
| 3 | `VALENCIA-LEGAL-INDEX.md` | every chapter, every article, every table |
| 4 | `VALENCIA-PARAMETER-MAP.md` | every parameter, article, paragraph, unit, scope |
| 5 | `VALENCIA-RULES.json` | machine-readable |

### Realistic expectation

> Madrid was unusually rich because: public ArcGIS · planning polygons · Norma Zonal layer ·
> NZ1 footprint layer · protection layer · use layer · planning areas · alignment.
> **That combination is exceptional. Valencia may expose less.**
>
> If so, the compiler still works, but **more comes from ordinance extraction than GIS.**

| Section | Without recon | After Madrid-style recon |
| ------- | ------------: | -----------------------: |
| PART A | 20–30% | 80–90% |
| PART B | 60–70% | 95–100% |
| PART C | 80–90% | 95–100% |

### The proposed RATE-plan change

> Instead of going straight to `P5 Legislation`, **I would insert a new phase: `P4.5 — Planning GIS
> Intelligence`.**

Deliverables:

* identify every planning service
* identify every layer
* identify every field
* identify every coded value
* identify every spatial relationship
* identify every planning hierarchy
* determine whether parcel joins are **spatial or key-based**
* determine whether there is any **machine-readable rule geometry**

> **This is precisely the phase that unlocked Madrid.**

### Strategic recommendation

> I would **not** start Valencia by reading the ordinance. I would first spend **1–2 days doing a
> Madrid-style technical reconnaissance.**
>
> Madrid showed that this can fundamentally change the implementation strategy. Initially, Madrid
> looked like a PDF-centric city; the reconnaissance revealed public ArcGIS services with zoning,
> planning areas, and even machine-readable NZ1 envelope geometry, which changed the project from
> "manual legal extraction" to "GIS-first plus legal compilation."
>
> Either outcome gives you a much stronger foundation than starting directly with the legal text.

---

## §B — Capture notes (MINE, not the founder's)

### V-1 — The P4.5 insertion is sound and I have applied it

This is the one directly actionable item in twelve batches, and it survives scrutiny:

- It is **cheap** (1–2 days) and **decision-shaped** — its output changes which of two very different
  implementation strategies València gets, so doing it late wastes the expensive phases.
- It sits correctly in the plan's own logic. The existing plan already orders cheap-automatable axes
  before human-gated ones and states *"the expensive axes are LAST because they cannot be
  automated."* P4.5 is cheap and automatable; P5/P6 are the expensive human-gated pair. Inserting
  recon **before** the expensive sourcing is consistent with the plan's stated principle, not a
  departure from it.
- The Madrid precedent is real and documented in this repo, not asserted: Madrid's recon *did*
  invert the strategy from PDF-first to GIS-first.

**Applied to [`../RATE-IMPLEMENTATION-PLAN.md`](../RATE-IMPLEMENTATION-PLAN.md)** as a new P4.5 row.
I did **not** renumber P5/P6 — their C63 axis weights and gate references are cited elsewhere, and
renumbering would silently break those cross-references for no benefit.

### V-2 — One correction to the founder's framing

The founder writes that València's *"Official GIS ★★★★☆"* and *"Planning ordinance ★★★★☆"* while
*"GIS zoning / buildable envelope / machine-readable rules / rule hierarchy"* are all **Unknown**.

Those two star ratings are not independent evidence — they are inherited from Spain-level assumptions,
not from any València-specific probe. The honest state is that **all six rows are Unknown**, and the
four-star entries should be read as *"Spain-wide priors, unverified for 46250"*. This matters because
a ★★★★☆ reads as "nearly confirmed" to anyone scanning the table, which is exactly the
failure-vs-empty conflation this repo has been bitten by repeatedly (L-422/457/467/469). The whole
point of P4.5 is that we do not yet know.

### V-3 — What P4.5 should reuse rather than reinvent

Batch 11 supplied Spanish GIS field heuristics that are directly applicable here and should be the
starting probe set rather than a blank-slate exploration:

- Layer/field signals: `CALIFICACION`, `ZONIFICACION`, `ORDENANZA`, `NORMA`, `AMBITO`
- Madrid's proven pair: `AMB_TX_ETIQ` (zone code) / `AMB_TX_DENOM` (official designation)
- València's derived-plan instruments are named in batch 11 as **`PRI`, `PEPRI`** — a concrete
  routing target for the refusal path, worth probing for directly

València is in fact the **cheapest available test of batch 11's entire compounding thesis**
(claimed effort 100 → 30). If the heuristics above locate València's zoning layer without bespoke
research, the thesis holds. If they don't, the "second city costs 30%" estimate needs revising
downward in ambition before it is used to plan anything. **P4.5 is therefore worth instrumenting:
record which heuristics hit and which missed, not just the final answer.**

### V-4 — Note on scope

València's `LEGISLATION` axis is weighted 25 and `ENVELOPE` 20 under C63 — together 45% of the score,
and both human-gated. P4.5 does not move either directly; it de-risks them. The RATE number will not
change when P4.5 completes, and that is correct — it should be visible as a **gate**, not as points.
