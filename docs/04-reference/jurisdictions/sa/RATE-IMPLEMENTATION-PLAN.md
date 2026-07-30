# Rate Implementation Plan — Saudi Arabia (`sa`) national

**Current national legislation/data-fill:** ~55% (see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) —
the structured-fill metric, renamed from `RATE.md` per the L-649 migration) · **Current bake-covered composite:** ~19% `partial` (Riyadh + Jeddah, DATA-SOURCES +
CONTEXT only — see [`COUNTRY-RATE.md`](./COUNTRY-RATE.md)) ·
**Realistic ceiling (PROJECTED, CONTINGENT on Phase-A landing; the blocked axes are gated on national
data-access decisions OUTSIDE PRYZM):** **~30–40% best case** national · **Ceiling model — Denmark
(~96%)** · **Last updated:** 2026-07-30 · **Owner:** UNASSIGNED

> **⚠ HONESTY GATE (§CONTEXT-DATA-HONESTY).** This is a PLAN. It changes **no RATE % cell** — the
> current national legislation number stays ~55% and the Riyadh/Jeddah composite stays ~19% `partial`
> until the Phase-A work below actually registers, signs, and re-derives. Nothing here reaches a new
> live source; the geospatial axes remain nationally blocked. **Saudi Arabia is the LOWEST-ceiling
> audited country in the suite**, and this roadmap reflects that honestly: it names ONE movable axis
> (ENVELOPE, via a pack that is already authored) and marks the rest as founder-gated national-access
> negotiations that are NOT engineering and stay `not-assessed` until national data access changes. The
> low ceiling is the honest national reality, **not** manufactured pessimism — and it is **not** to be
> dressed up with optimism either. **Ship the probe before the fix.**

> **Why the ceiling is LOW (and stays low): Saudi has no DGT/Plandata-equivalent open platform.**
> Portugal's ceiling rose when the DGT OGC API surfaced open cadastre + LiDAR + terrain; Denmark is
> ~96% because Plandata publishes zone + density + height as machine-readable structured fields. **Saudi
> has neither.** It is a **GEO-FENCE-bound** jurisdiction: the authoritative cadastre (Balady
> `MapServer/28`), the national building-height source (`ml_sa` / Balady `NOOFFLOORS`), and the national
> terrain product (GEOSA) are each **geo-fenced or licensed, not open**. Five of the seven C63 axes
> (PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 = **55% of the weight**) are
> therefore capped nationally by *access*, not by engineering. The one axis PRYZM can move **without**
> national data access is the **ENVELOPE / LEGISLATION** pair: the 2024 MOMRAH residential decision is a
> *published national closed-form* for the buildable footprint, and a footprint rule pack
> (`saRiyadhDemo.ts`, L-606) is **already authored** — it just needs registering + an L-449 sign-off.
> That is the whole movable surface. See §1.4 and the Phase-3 roadmap.

---

## 1 — The ceiling: what "maximum" means here

Saudi Arabia is **neither Denmark-like nor purely PDF-bound — it is a GEO-FENCE-bound jurisdiction**, and
that single structural fact sets the ceiling low. Unlike Barcelona (numbers locked in PDFs, needing OCR)
or Portugal (numbers in PDFs but a rich open geospatial platform underneath), Saudi's *rule* for the
footprint is **already exact and national** — the problem is that the *data* which would raise every
other axis is behind a geo-fence or a licence.

**The one movable axis without national data — ENVELOPE (via the authored footprint pack).** The
footprint (3 setbacks + ground coverage — **4 of the 6 governing envelope fields, 66.7%**) is a
published national closed-form in the 2024 MOMRAH decision (`plot ⊖ max(streetWidth/5, {3,2,2})`, capped
by `coverage × plotArea`), read live on two government hosts. A rule pack encoding it
(`packages/site-parcel-data/src/rulepacks/saRiyadhDemo.ts`, L-606) is **authored but unregistered and
unsigned**. Registering it + passing the L-449 human-verification gate converts LEGISLATION + ENVELOPE
from `not-assessed` / `pending-implementation` to a **certified structured** answer — country-wide, one
formula, no per-parcel data required. **This is the only axis that moves without reaching a geo-fenced
source**, and it is what lifts the composite from ~19% toward the ~30–40% ceiling.

**Every lever ABOVE the footprint is behind a geo-fence or a licence, not a PDF.** The exact per-zone
vertical value (height + floors beneath the national villa ≤14 m / apartment ≤23 m ceiling) defers to
the municipal approved plan (المخطط المعتمد, §4 cl. 1) and is overridden by development authorities (§1
cl. 3); the live per-parcel path (geometry, `MAINLANDUSE`, street width, resolved setbacks,
`NOOFFLOORS`) lives inside Balady `MapServer/28`. Both are **measured geo-fences** — `umapsudp.momrah.gov.sa`
NXDOMAIN, the Balady proxy a WAF-200 apology page — asserted on *shape*, not HTTP status
(§CONTEXT-DATA-HONESTY: measured-negative-on-shape, **not** proof of absence).

**Ceiling model — Denmark (~96%):** Denmark's national Plandata delivers zone code, numeric density, and
height as machine-readable structured fields. Saudi cannot approach this: its cadastre, heights, and
terrain are geo-fenced/licensed, and the exact vertical genuinely varies per municipal plan (never a
single national number). The Denmark ceiling is not achievable for Saudi without a national data-access
change that is **outside PRYZM's control**.

**Pilot model — Barcelona (~48%):** Barcelona demonstrates the phased climb — registry, per-clau packs,
block-derived envelopes, refusal vocabulary. Saudi mirrors the phase **shape**, not the position: like
Barcelona its reachable ceiling ≈ its current legislation rate, so the plan's job is to *realise* the
footprint as a certified product and to name the BLOCKED phases honestly. Mirror the shape, not the
numbers.

### 1.4 — The seven axes under the geo-fence (why the ceiling caps at ~30–40%)

Mapping the national reality onto the seven C63 axes and their ratified weights (LEGISLATION 25 ·
ENVELOPE 20 · PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5):

| C63 axis | Weight | Current state | Post-Phase-A / ceiling premise |
|---|---:|---|---|
| **ENVELOPE** | 20% | `not-assessed` (`pending-implementation`) — `saRiyadhDemo.ts` authored, unwired | **MOVABLE** — footprint compiled as amber; vertical stays a bounded cited-null. The one axis that rises without national data |
| **LEGISLATION** | 25% | `not-assessed` (`pending-implementation`) — footprint clauses read, unsigned | **MOVABLE** — rises to the footprint clauses once L-449 signs; vertical held as bounded refusal (honest, not filled) |
| **CONTEXT** | 5% | **56%** — Overture buildings + roads/water/parks/landuse baked (5/9) | **Held** — already baked (Phase B keeps it); rail/trees pending the L-642 re-bake |
| **DATA-SOURCES** | 15% | **20%** — only the context-OSM slot is live; 4/5 slots blocked | **Capped** — cadastre/height/terrain slots are geo-fenced/licensed nationally |
| **PARCEL** | 15% | `not-assessed` (`license-restriction`) — footprint-fallback only | **BLOCKED** — Balady cadastre geo-fenced; a footprint is never a legal parcel (C57 §L-640) |
| **HEIGHTS/LOD** | 10% | `not-assessed` (`license-restriction`) — `ml_sa` `blocked` | **BLOCKED** — Balady `NOOFFLOORS` geo-fenced; Overture height ≈ 0% in Saudi |
| **TERRAIN** | 10% | **cited 0%** — `terrain.mjs` SA rows `blocked` | **BLOCKED** — no open GEOSA national DTM; founder-gated |

**The arithmetic of the ceiling.** The current composite (~19%) renormalises over the assessed subset
{DATA-SOURCES, TERRAIN, CONTEXT} = 30 weight. Phase A assesses {LEGISLATION, ENVELOPE} — subset grows to
75 weight; with LEGISLATION ≈ 0.5 and ENVELOPE ≈ 0.4 (footprint amber, vertical refused) the composite
lands **~35%**. If the three geo-fenced axes were *also* assessed while still blocked (scoring ~0), the
full-7-axis composite would sit **~26%** — assessing the blocked axes *lowers* the number, which is the
honest tension. **So the honest ceiling is LOW: ~30–40% best case, entirely from the movable
ENVELOPE/LEGISLATION pair, with the remaining 40% of the weight gated on national data-access decisions
outside PRYZM.** No RATE cell moves until Phase A actually lands.

---

## 2 — Phase tracker

Status vocabulary is FIXED: **NOT STARTED · IN PROGRESS · BLOCKED · SHIPPED · VERIFIED · N/A**.
"Rate: from→to" is cumulative. ⚠ Status tracks WORK; the composite only moves when the city `RATE.md`s
+ `COUNTRY-RATE.md` are re-derived. The three ordered phases are expanded below in §Phase-3.

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | **Assess** — read the primary 2024 MOMRAH decision live; enumerate + measure the Balady `MapServer/28` geo-fence; characterise GEOSA (licensed) + global fallbacks; author `saRiyadhDemo.ts`; write the city `RATE.md`s + `COUNTRY-RATE.md` | the honest baseline: exact national footprint (66.7%) + a cited vertical ceiling, all live confirmation geo-fenced; composite ~19% `partial` | — → ~19% (composite) | Done (L-606, C63 audit) | **VERIFIED** | UNASSIGNED |
| **A** | **Register + certify the national FOOTPRINT pack (the one movable axis)** — wire `saRiyadhDemo.ts` (index export + `registry.ts` registration + per-city bbox + L5 dispatcher); apply `resolveSaudiSetbacks` + per-class `maxCoverage`; vertical held null (DISPUTED caps refuse, C58 §1.13); human `VERIFICATION.md` sign-off (L-449); hold CONTEXT | ENVELOPE + LEGISLATION as a **certified structured** answer, country-wide, one formula; pack `estimated-ruleset` → `structured` | ~19% → ~30–40% | Low–Medium (pack authored; wiring + one human sign-off) | **IN PROGRESS** (pack authored; wiring TODO; `VERIFICATION.md` FOOTPRINT-confirmed, height DISPUTED) | UNASSIGNED |
| **B** | **Keep CONTEXT** — maintain the Overture-sourced context bake for Riyadh + Jeddah (already baked; Saudi is an OSM building-desert, 5.3×/7.2× density); land the L-642 rail/trees re-bake when it ships | holds CONTEXT (56%); adds rail/trees when the re-bake lands | (holds; feeds composite) | Low (already baked) | **SHIPPED** (buildings/roads/water/parks/landuse baked; rail/trees pending L-642) | UNASSIGNED |
| **C** | **The BLOCKED geospatial axes** — PARCEL (Balady cadastre geo-fenced), HEIGHTS (`ml_sa` blocked), TERRAIN (GEOSA licensed). Documented as **founder-gated national-access negotiations, NOT engineering** | PARCEL + HEIGHTS + TERRAIN (35% of the weight) — ONLY if national data access is granted | (not-assessed; gated externally) | N/A engineering — founder/legal | **BLOCKED** — nationally geo-fenced/licensed; stays `not-assessed` until access changes | UNASSIGNED |

> ⚠ Phase 0 is **VERIFIED**. Phase A is the **only** rate-raising phase reachable without national data
> access — it realises the AMBER footprint as a certified answer (~19% → ~30–40%). Phase B **holds**
> CONTEXT (already baked; does not raise the number). Phase C is **not an engineering backlog item** —
> it is a set of founder-gated national-access decisions (a Balady/MOMRAH data agreement or in-SA
> egress; a GEOSA licence) that stay `not-assessed` until national data access changes. That is the
> honest ceiling.

---

## Phase-3 — the ordered roadmap (goal · unlocks · axis · effort · dependency · blocker)

Three ordered phases. **A** is the one movable axis (register the authored ENVELOPE pack — the only
climb reachable from here); **B** holds the already-baked CONTEXT; **C** is the nationally-blocked
geospatial surface, documented as founder-gated national-access negotiation rather than engineering
work. Every rate-raising claim below is contingent on Phase A actually registering + signing — no RATE
cell moves before that.

### Phase A — Register + sign the authored footprint pack (ENVELOPE — the one movable axis)

- **Goal.** Wire `packages/site-parcel-data/src/rulepacks/saRiyadhDemo.ts` (L-606): `index.ts` export,
  `registry.ts` `JurisdictionRegistration`, a per-city bbox provider (Riyadh authored; Jeddah + Dammam
  reuse the same pack unchanged), and the L5 class-dropdown dispatcher →
  `saRiyadhResolvedPack(width, class)` → `computeBuildableEnvelope`. Apply `resolveSaudiSetbacks`
  (`max(streetWidth/5, {3,2,2})`) + per-class `maxCoverage` (villa 0.75 / apartment 0.65). Hold the
  vertical (height + floors) as a **field-level BOUNDED cited-null refusal** — the DISPUTED national caps
  (villa ≤14 m §5-1-5 cl.3 / apt ≤23 m §3-2) refuse, they do NOT fill (C58 §1.13). Pass every field
  through the **L-449 human-verification gate** (`sources/VERIFICATION.md` sign-off) before the pack
  serves at `confidence: structured`.
- **Unlocks.** **ENVELOPE + LEGISLATION** — the 66.7% national footprint, AMBER and compiled, **country-wide,
  one formula**, as a certified structured answer. This is the phase that materially raises Saudi's
  composite (~19% → ~30–40%) and the **only** axis that moves without reaching a geo-fenced source.
- **Axis.** ENVELOPE (Axis 4) · LEGISLATION (Axis 2) · CONTEXT held (Axis 7).
- **Effort.** Low–Medium. The pack is already authored + verified end-to-end against
  `computeBuildableEnvelope` (L-606 §1); the remaining work is wiring (registry + bbox + dispatcher) plus
  ONE human sign-off. This is the fastest win in the whole tree.
- **Dependency.** **L-449** (human-verification gate) is mandatory before any field serves `structured`.
  **ADR-0269** (curate-then-serve): no value serves without a citable governing article in SOURCES.md.
  **ADR-0270** (rule kind = `setback`): the pack maps onto the existing `setback` kind + `maxCoverage` —
  **no new `GeometricRule` schema kind** (the `esBarcelona20aAillada` precedent), so no C58 amendment is
  required for the footprint.
- **Blocker.** The **L-449 human sign-off** is the one non-geo-fenced blocker — FOOTPRINT fields
  independently confirmed (2026-07-24); the height caps remain **DISPUTED** and are held null
  (`sources/VERIFICATION.md`). Do NOT let the DISPUTED caps leak into a fill: they refuse, per C58 §1.13.

### Phase B — Keep CONTEXT (the already-baked Overture layers)

- **Goal.** Maintain the context bake for the two bake-covered cities — Riyadh (`bake.mjs` REGIONS
  `riyadh`, bbox `46.60,24.58,46.83,24.80`) and Jeddah (`jeddah`, bbox `39.10,21.45,39.28,21.62`), both
  `buildingsSource: 'overture'` because **Saudi is an OSM building-desert** (Overture is 5.3×/7.2× OSM
  density). Land the L-642 rail/trees layers when that re-bake ships. Global fallbacks (Copernicus GLO-30
  DEM as a coarse sanity DEM; MS/Google ML footprints) remain available but do NOT substitute for the
  blocked national sources.
- **Unlocks.** **CONTEXT** — already credited at 56% (buildings · roads · water · parks · landuse = 5/9);
  rail + trees add when the L-642 re-bake lands. This phase **holds** the axis; it does not raise the
  composite.
- **Axis.** CONTEXT (Axis 7) · the context-OSM slot of DATA-SOURCES (Axis 3).
- **Effort.** Low — already baked. Marginal cost is the rail/trees re-bake (L-642), shared with every
  other jurisdiction.
- **Dependency.** The `bake.mjs` REGIONS rows (present for Riyadh + Jeddah) and the shared context-bake
  pipeline. No Saudi-specific dependency.
- **Blocker.** None for the shipped layers. TERRAIN stays blocked (no open GEOSA DTM), so the context
  bake sits on flat terrain; HEIGHTS stay `assumed` (Overture height ≈ 0% in Saudi). Both are Phase-C
  blockers, not Phase-B ones — do not conflate the context *coverage* (baked) with terrain/height
  *provenance* (blocked).

### Phase C — The BLOCKED geospatial axes (founder-gated national-access negotiation, NOT engineering)

- **Goal.** Document — **not build** — the three nationally-blocked axes as founder-gated national
  data-access negotiations: **PARCEL** (Balady cadastre `MapServer/28`, geo-fenced), **HEIGHTS/LOD**
  (`heightSources.mjs` `ml_sa` impl `blocked`; Balady `NOOFFLOORS` geo-fenced), **TERRAIN** (GEOSA
  national DTM, licensed/no-open). These are the reason Saudi is the lowest-ceiling audited country. They
  stay `not-assessed` (typed C62 reasons: `license-restriction` for PARCEL/HEIGHTS; cited-0 for TERRAIN)
  **until national data access changes** — which is a business/legal decision, not an engineering task.
- **Unlocks.** **PARCEL (15%) + HEIGHTS/LOD (10%) + TERRAIN (10%) = 35% of the weight** — but ONLY if a
  national data-access route opens. With them, Saudi could flip from a constructed demo footprint toward
  a *read/verified* envelope (Balady already carries geometry + `MAINLANDUSE` + resolved setbacks +
  `NOOFFLOORS` per parcel — richer than we need). Without that route, they contribute nothing and are
  correctly excluded from the assessed subset (assessing them at 0 would *lower* the composite).
- **Axis.** PARCEL (Axis 1) · HEIGHTS/LOD (Axis 6) · TERRAIN (Axis 5).
- **Effort.** **N/A engineering.** The engineering is trivial once data is reachable (the parcel provider
  predicate + nDSM module + a `terrain.mjs` bake row all exist). The cost is **founder/legal
  negotiation** for national access — a Balady/MOMRAH data agreement or an in-SA egress, and a GEOSA
  licence — not developer time.
- **Dependency.** A national data-access decision **outside PRYZM's control**: (a) reach Balady
  `MapServer/28` from an in-SA egress or under a MOMRAH-Balady data agreement; (b) obtain a GEOSA licence
  for the national DTM / LoD2 products. Both gate ALL parcel-level, height, and terrain work.
- **Blocker.** **Nationally geo-fenced / licensed, measured on shape** (§CONTEXT-DATA-HONESTY):
  `umapsudp.momrah.gov.sa` **NXDOMAIN** (re-confirmed); the Balady proxy returns a WAF-200 Arabic apology
  page; GEOSA (`geocatalog.geoportal.sa`) publishes only template records to anonymous (licensed).
  `heightSources.mjs` `ml_sa` is `blocked`; `terrain.mjs` SA rows are `blocked` ("no open national DTM
  (GEOSA); founder-gated"). None of these is proof of absence — each is reachable-in-principle,
  not-from-here — but none is pullable without the national-access decision above. **These stay
  `not-assessed` until that decision changes.**

---

## 3 — The gap to Denmark (~96%)

Denmark reaches ~96% because its dimensional values are **already digitised into structured national
fields** (Plandata WFS), so almost no query reads a document. Saudi's gap is **not** the Barcelona/Madrid
OCR case (numbers in PDFs needing extraction + parcel-binding), and it is **not** the Portugal case (a
rich open geospatial platform under a PDF legal layer). It is a **geo-fence / institutional-access gap**:

- **(a) The footprint half is already Denmark-like in SHAPE — but capped by the L-449 gate, not OCR.**
  The 66.7% national footprint is an exact, national, structured formula (no OCR wall, no envelope
  construction). It rises the moment Phase A registers + signs it. This is the movable half.
- **(b) The geospatial half is geo-fenced / licensed nationally.** PARCEL (Balady cadastre), HEIGHTS
  (`ml_sa` / `NOOFFLOORS`), and TERRAIN (GEOSA) are each behind a geo-fence or a licence — **55% of the
  weight** is access-capped. There is no Saudi DGT/Plandata to relieve this. Closing it needs a national
  data-access decision **outside PRYZM's control**, not engineering.
- **(c) The exact vertical is fragmented across N municipalities/authorities.** Unlike the footprint (one
  national formula, all Amanas), the exact height/floors is per-Amana + per-development-authority
  (RCRC/ROSHN/NEOM/Diriyah/Qiddiya, the §1 cl.3 override surface) — so even fully reachable it never
  collapses to a single national number.

The inversion that defines Saudi: **its best data (Balady, resolved per parcel) is the least reachable.**
Barcelona has the data and not the rule; Saudi has the rule (and, behind the fence, the data too) but
cannot reach the data from here — and reaching it is a national-access decision, not a build. That is why
Saudi is the lowest-ceiling audited country and why the honest ceiling is ~30–40%, not more.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Hard dependencies (must resolve in order):**
- **L-449 (human-verification gate)** is mandatory for the footprint pack (Phase A) before any field
  serves `confidence: structured`. FOOTPRINT fields confirmed; height caps DISPUTED, held null. This is
  the one non-geo-fenced blocker and the fastest win.
- **ADR-0269 (curate-then-serve):** do not serve any value without a citable governing article in
  `sources/SOURCES.md`.
- **ADR-0270 (rule kind = `setback`):** the pack maps onto the existing `setback` kind + `maxCoverage` —
  no new schema kind, no C58 amendment needed for the footprint (the `esBarcelona20aAillada` precedent).
- **A national data-access decision (Phase C)** — a Balady/MOMRAH data agreement or in-SA egress, and a
  GEOSA licence — gates ALL parcel, height, and terrain work. This is founder/legal, not engineering,
  and blocks 35% of the weight.

**Current blockers (each geo-fence measured on shape, not HTTP status — §CONTEXT-DATA-HONESTY):**
- **Phase A** — the L-449 human sign-off (the only non-geo-fenced blocker). DISPUTED height caps must
  refuse, not fill (C58 §1.13).
- **Phase C — PARCEL:** `umapsudp.momrah.gov.sa` **NXDOMAIN** (re-confirmed); Balady proxy WAF-200. A
  footprint-fallback is registered but is never a legal parcel (C57 §L-640) → capped low by construction.
- **Phase C — HEIGHTS:** `heightSources.mjs` `ml_sa` impl `blocked`; Balady `NOOFFLOORS` geo-fenced (403);
  Overture buildings carry ≈ 0% height in Saudi (GLO-30 is a coarse sanity DEM only).
- **Phase C — TERRAIN:** `terrain.mjs` SA rows `blocked` ("no open national DTM (GEOSA); founder-gated") →
  no quantized-mesh tileset baked → cited 0.
- **Reachable-but-no-rules (recorded so it is not re-chased as a rule source):** `opendata.rcrc.gov.sa`
  (Opendatasoft, GeoJSON export live) carries **only** statistical/transport/demographic data — zero
  height/FAR/setback/zoning. `apiservices.balady.gov.sa/.../open-data` is the MOMRAH **newsroom**, not
  datasets. `geocatalog.geoportal.sa/geonetwork` (GEOSA) publishes only **template** records to anonymous.

**Cross-jurisdiction reuse (why the movable half is cheap breadth):**
- **The residential rule is ONE national document, kingdom-wide** (Section 4 binds all Amanas) — a far
  stronger structural position than Norway's 357 kommuner or Germany's 16 Länder. One footprint pack
  covers the whole country; the per-city work is a bbox + the local vertical/heritage overlay.
- **The footprint pack + `resolveSaudiSetbacks` is the reusable core** — Riyadh (authored), Jeddah, and
  Dammam all reuse it unchanged (only the override/heritage overlays differ per city). Do NOT fork it.
- **`streetWidth.ts` conceptually ports** (Saudi عرض الشارع = frontage-to-frontage) but has **no inputs**
  on the gated path (it needs Balady parcel rings); the demo takes the width from the user (L-606 §3).
  `blockDerivedDepth.ts` does **NOT** port (Saudi uses flat coverage %, no Art-242 free-space build).
- **The nDSM height module (Phase C, if unblocked)** — DSM−DTM, 90th-percentile per footprint — is the
  SAME shared module as Spain (L-511c) and France (L-512b); Saudi would feed different inputs. Do NOT
  one-off it per country.
- **The measured-geo-fence discipline** (assert on content-type + body, not HTTP 200) is the reusable
  honesty pattern for any jurisdiction with a WAF-200 or split-horizon backend.

---

*Model references: **Denmark** `../dk/` (ceiling, ~96%) · **Barcelona**
`../es/es-ct/08019-barcelona/` (pilot climb). Governing: **C58** (fidelity/provenance §1.2/§1.4,
field-level bounded refusal §1.13), **ADR-0269** (curate-then-serve), **ADR-0270** (rule kind =
`setback`), **L-449** (human-verification gate), **L-606** (Riyadh pack + the geo-fence probes),
**C63 §3/§4** (the seven axes + ratified weighting). Data layer:
[`COUNTRY-RATE.md`](./COUNTRY-RATE.md) (per-city composite, Riyadh + Jeddah ~19% `partial`) ·
[`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) (national structured-fill ~55%; renamed from `RATE.md`, L-649) · [`NEXT.md`](./NEXT.md) (national resume steps) ·
[`findings/SAUDI-DATA-RECON-SPIKE.md`](./findings/SAUDI-DATA-RECON-SPIKE.md) +
[`findings/SAUDI-MASTER-DATA-SOURCE-STUDY.md`](./findings/SAUDI-MASTER-DATA-SOURCE-STUDY.md) (the
reachability matrix). Saudi is nationally data-blocked — the low ceiling is the honest national reality,
not a coverage gap. Ship the probe before the fix.*
