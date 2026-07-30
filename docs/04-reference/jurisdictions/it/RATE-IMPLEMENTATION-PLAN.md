<!-- RATE-IMPLEMENTATION-PLAN.md — Italy (it) national. The phased, per-axis, probe→wire→verify climb
     that raises Italy's C63 COMPOSITE RATE (the 7-axis master scorecard in COUNTRY-RATE.md) toward 100%.
     §CONTEXT-DATA-HONESTY: this is a PLAN. It changes NO RATE % cell — every measured cell it cites
     (DATA-SOURCES 50% · TERRAIN 50% · CONTEXT 56% · composite 51% partial) is READ from the shipped
     Rome/Milan dossiers, never re-authored here; every "to" is an explicitly-labelled PROJECTION / TBD. -->
# Rate Implementation Plan — Italy (`it`) national — climb toward C63 100%

**Current composite (C63 master RATE):** Rome & Milan each **51 % on the *assessed subset*** (DATA-SOURCES ·
TERRAIN · CONTEXT = 30 % of the weight), `partial: true` — PARCEL · LEGISLATION · ENVELOPE · HEIGHTS/LOD
(the other **70 % of the weight**) are honestly `not-assessed`, not 0 % (C63 §1.2). See
[`COUNTRY-RATE.md`](./COUNTRY-RATE.md) · [Rome](./it-laz/058091-rome/RATE.md) · [Milan](./it-lom/015146-milan/RATE.md). ·
**Realistic mainland pilot-city ceiling (PROJECTED): ~55–65 %** · **AP Bolzano ceiling (unverified): possibly >70 %** ·
**Gap to Denmark (~96 %): ~31–41 pp at the projected pilot ceiling** · **Last updated:** 2026-07-30 ·
**Owner:** UNASSIGNED

> **Why this plan differs from the legislation climb.** The old content of this file was a *LEGISLATION-axis*
> climb (structured dimensional fill, ~9–11 % → ~25–30 %); that reasoning now lives in
> [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) and is folded in below as **Phase D**. This plan is the
> **C63 composite** climb — it sequences ALL SEVEN axes by return-on-investment, because the composite RATE is
> dominated (30 % of weight) by three axes that are cheap-to-move on the Italian data estate, and the single
> cheapest move (wiring one already-live national WFS) lifts two of them at once.

> **§CONTEXT-DATA-HONESTY.** No cell moves in this document. Every current figure is a citation of a shipped
> dossier cell; every target is a **PROJECTION** and is labelled as such (`→ TBD` / `projected`). The composite
> only rises when the backing state actually changes (a provider wired, a bake verified, a pack signed off), and
> only then does the scorecard function — not this plan — emit the new number (C63 §1.1).

---

## 1 — The ceiling: what "maximum" means for the Italian *composite*

Italy's composite ceiling is **not** its legislation ceiling. The C63 master RATE is a weighted blend of seven
axes (C63 §4: LEGISLATION 25 · ENVELOPE 20 · PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 ·
CONTEXT 5). Italy's data estate is **inverted** relative to Portugal: the *cadastre is solved nationally*
(Agenzia delle Entrate INSPIRE Catasto WFS, **VERIFIED-LIVE 2026-07-24**) and terrain is national and live
(TINITALY, INGV), while the bottleneck is the same PDF-locked municipal-planning wall that caps every European
jurisdiction. So Italy climbs the *cheap, load-bearing* axes first (PARCEL + DATA-SOURCES + TERRAIN + HEIGHTS =
50 % of the weight) with low-effort wiring, and only then pays the human-gated LEGISLATION + ENVELOPE cost
(45 % of the weight) city-by-city.

**Ceiling model — Denmark (~96 %):** Denmark's national Plandata delivers zone code, numeric density, and
height as machine-readable structured fields — every axis is `live` at once. That is the proof that ~96 % is
reachable only when a country fully digitises its planning rules. Italy has **no national zoning WFS** (no
GPU/XPlanung/Plandata equivalent), so the two heaviest axes are structurally capped. Mirror Denmark's *shape*
(all axes live), never expect its *number* on the Italian mainland.

**Pilot model — Barcelona (~48 %):** Barcelona demonstrates the phased climb — wire the cadastre, source
per-clau packs, derive block envelopes, build a refusal vocabulary. Italy's pilots (Milano/Bologna/Torino)
should mirror this phase shape. Mirror the **shape**, not the numbers.

**Italy's realistic pilot-city ceiling (PROJECTED ~55–65 %)** for a *fully-worked* mainland pilot (Milan,
Bologna) is bounded by three structural facts, none of which engineering alone can lift:

1. **No national machine-readable zoning layer** — every zone/NTA parameter is per-region geoportal + per-city
   PDF. Caps LEGISLATION at the mainland ~25–30 % structured-fill ceiling ([`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md))
   and ENVELOPE proportionally.
2. **DM 1444's zone taxonomy is abandoned in the two largest cities** — Milan runs a PGT territorial-index +
   perequation ledger (no zone-letter key); Rome runs a tessuto-typology + direct/indirect-intervention regime.
   Each is a **new engine kind** (C58), not a config, so ENVELOPE coverage is bought at engine cost, not pack cost.
3. **No national building-height product** — only ARPA Piemonte (Turin) is a surveyed layer; every other region
   is regional LiDAR nDSM (probe-gated) or modeled fallback. Caps HEIGHTS/LOD below the surveyed tier off-Piedmont.

**AP Bolzano is the one outlier that may break this ceiling** (NewPlan CC0 ZoningElement WFS 2.0.0, daily update,
1:5000 per INSPIRE metadata) — potentially >70 % composite — but is **unverified from a non-Replit IP** and uses
its **own cadastre** (statutory delegation; do NOT route it to Agenzia Entrate). It is a fast-track, not the mainline.

---

## 2 — Phase tracker (sequenced by ROI: cheapest, most load-bearing first)

Each phase gives **goal · unlocks · axis moved · effort · dependency · blocker**. Effort in dev-days
(1 dev-day ≈ 8 h focused engineering incl. research + test). Phases A–C are cumulative-cheap and largely
parallelisable; Phase D is the human-gated cost and runs per city.

| Phase | Goal | Unlocks (axis moved) | Rate: from → to | Effort | Dependency | Blocker | Status |
|---|---|---|---|---|---|---|---|
| **A** | Wire `AgenziaEntrateParcelProvider.ts` — the national Catasto WFS — as a `kind:'cadastral'` jurisdiction in `parcelProviders/registry.ts` (+ `ItalyJurisdictionResolver` ISTAT routing) | **PARCEL** `not-assessed`→measurable (national) **+ DATA-SOURCES** cadastre slot `documented 0.5`→`live 1.0` | DATA-SRC 50 % → **~60 %** *(projected)*; PARCEL `—` → measurable *(TBD)* | **Low** (~1–2 dd — one data addition, mirrors ES `catastroParcelProvider`) | none — WFS **VERIFIED-LIVE 2026-07-24** | AP Trento/Bolzano excluded (own cadastre); `computeParcelConfidence` sample must be drawn (C57 §2.4) | NOT STARTED |
| **B** | `ItalyHeightAdapter` over regional LiDAR nDSM (DSM−DTM→P90) via the **shared ES/FR/PT nDSM module** — Lombardia (Milan) · Veneto · Emilia-Romagna (Bologna) first; fold in ARPA Piemonte (Turin, already real) | **HEIGHTS/LOD** `not-assessed`→measurable **+ DATA-SOURCES** height slot `none 0`→`live 1.0` (per region) | DATA-SRC ~60 % → **~80 %** *(projected, per city)*; HEIGHTS `—` → measurable *(TBD)* | **Medium** (~3–5 dd — adapter + feed mapping; reuse, do NOT fork) | Phase A routing helps; regional endpoint probes (P0-B ARPA field; Lombardia/Veneto/Emilia schema) | No national height raster; regional field names TBD; Campania login-gated; `heightSource` must be stamped (modeled ≠ surveyed) | NOT STARTED |
| **C** | Verify TINITALY terrain: `terrain.verify.mjs` independent-decoder round-trip + deployed `layer.json` 200 + lit-and-correct render for Rome/Milan bboxes | **TERRAIN** rung `50` (baked-unverified) → `100` (baked+verified) | TERRAIN 50 % → **100 %** *(projected)*; `validationState`→`cross-validated` | **Low** (~0.5–1 dd — verification pass, no new bake) | existing `terrain.mjs` rows (`rome`, `milan`) already baked+live | 10 m TINITALY grid coarser than sub-metre DTMs elsewhere (genuine but coarse); white-mask/octvertexnormals check must pass (L-636) | NOT STARTED |
| **D** | Municipal envelope rule packs + L-449 gate: **Milano PGT → Bologna PUG → Torino PRG → Roma PRG → Firenze Piano Operativo**; register in `rulepacks/registry.ts` | **LEGISLATION** (verified cited claus) **+ ENVELOPE** (solver coverage) `not-assessed`→measurable | LEGIS `—`/~5 % → **~25–30 %** *(mainland ceiling, projected)*; ENVELOPE `—` → **~20–35 %** *(projected)* | **High** (the 65 %-of-effort part — per-city NTA transcription; Milan/Rome = new engine kinds) | Phase A (parcel to attach rules to); L-449 gate; C58 solver; NTA PDFs sourced | No national zoning WFS; DM 1444 abandoned in Milan/Rome; perequation-ledger queryability unknown; NTA numbers PDF-locked | NOT STARTED |

**The single highest-ROI first move is Phase A.** Wiring one already-verified-live national WFS is a *data
addition*, not an engineering project, and it moves 30 % of the composite weight (PARCEL 15 + DATA-SOURCES 15)
in one step — flipping Italy from "cadastre exists but unwired" to Spain-like nationally.

---

## 3 — Phase detail (probe → wire → verify, per axis)

### Phase A — Wire the national Catasto (PARCEL + DATA-SOURCES) — ~1–2 dev-days

*The highest-value first move. No probe needed — the WFS is VERIFIED-LIVE.*

| Sub-task | What | Axis |
|---|---|---|
| **A.1 — `ItalyCatastoProvider`** | ONE national provider (do NOT build per-region parcel providers). `ItalyJurisdictionResolver` (ISTAT Region→Province→Comune) → Agenzia Entrate WFS `owfs01.php` `CP:CadastralParcel` GetFeature. BBOX axis order `lat_min,lon_min,lat_max,lon_max` (EPSG:6706). Model `{geometry, cadastralCode, municipality, province, area, source, confidence}`. | PARCEL |
| **A.2 — Registry predicate** | Add `isInItaly` `kind:'cadastral'` row to `parcelProviders/registry.ts` — the exact move that turned on ES/FR/NL/NO/CH/DK. | DATA-SOURCES (cadastre `documented`→`live`) |
| **A.3 — Confidence sample** | Draw an N-parcel `computeParcelConfidence` + `computeParcelMetrics` sample per pilot bbox (C57 §2.4): match distribution `high|medium|low` + `pointToParcelM` containment + block-dissolve (L-635/L-641). `authorityRank` = `national-cadastre`. INSPIRE geom is **not survey-grade** — caps PARCEL below 1.0. | PARCEL (makes it measurable) |
| **A.4 — Exclusion guard** | Route AP Trento + Bolzano to their OWN cadastre, never to `wfs.cartografia.agenziaentrate.gov.it`. | PARCEL (honesty) |

**Projected move:** DATA-SOURCES cadastre slot 0.5→1.0 lifts the Rome/Milan mean from 0.50 to **~0.60**; PARCEL
becomes assessable nationally (likely `high` for the sampled pilots). *These are projections — the cells move only
after A.3 runs and the scorecard emits them.*

### Phase B — Regional height adapters (HEIGHTS/LOD + DATA-SOURCES) — ~3–5 dev-days

*Reuse the shared ES/FR/PT nDSM module (L-511c / L-512b). Do NOT one-off a per-country height path.*

| Sub-task | What | Axis |
|---|---|---|
| **B.1 — Probe regional endpoints** | Confirm ARPA Piemonte `Edifici_3D` height field name (`QUOTA_MEDIA`/`ALTEZZA`, P0-B) from a browser; probe Lombardia (Geoportale/ARIA) + Veneto (IDT) + Emilia-Romagna (DBTR full OGC) nDSM/DBT schemas. | DATA-SOURCES |
| **B.2 — `ItalyHeightAdapter`** | DSM−DTM→P90 through the shared module; feed per region. Precedence `lod2 → lidar_ndsm → osm_levels → assumed`; stamp `heightSource` on every building. | HEIGHTS/LOD |
| **B.3 — Fold in Piemonte (Turin)** | ARPA Piemonte Edifici 3D is the ONE real Italian building-height layer (`heightSources.mjs` `piedmont_it`) — the proof the pipeline works. Turin's HEIGHTS axis becomes measurable the moment a `turin` bake + terrain row exist (see COUNTRY-RATE §B). | HEIGHTS/LOD |

**Projected move:** DATA-SOURCES height slot `none`→`live` lifts Milan/Bologna mean toward **~0.80**; HEIGHTS/LOD
flips from structural `no-source` to a measurable tagged-fraction in the strong regions. *(projected)*

### Phase C — Verify TINITALY terrain (TERRAIN 50→100) — ~0.5–1 dev-day

*The cheapest axis to top out — the bake already exists and is live; this is a verification pass, not a re-bake.*

- **C.1** — `terrain.verify.mjs --tileset` independent-decoder round-trip for `rome` + `milan`.
- **C.2** — deployed `layer.json` HTTP 200 + extent match (`terrainCoverage.ts` `TERRAIN_TILESET_VERSION`).
- **C.3** — confirm lit-and-correct render: `enableLighting` + octvertexnormals present (the L-636 white-mask guard).

**Projected move:** TERRAIN 0.5→1.0 (rung 50→100), `validationState`→`cross-validated` (C12 §10). Can run in
**parallel** with Phase B. *(projected)*

### Phase D — Municipal envelope rule packs (LEGISLATION + ENVELOPE) — high, per city

*The human-gated cost — the 65 %-of-effort planning-rule extraction. Folds in the legacy legislation climb
([`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md)). Every extracted numeric parameter passes the L-449 gate before
it serves at `confidence: structured`. Order below is the founder's Phase-3 sequence.*

| City | Instrument | Mechanism / engine kind | Notes |
|---|---|---|---|
| **Milano** (`015146`, it-lom) | PGT — Piano delle Regole | **TUC territorial-index + perequation ledger** — no zone-letter key; parcel-and-ledger, not zone-and-table. New ledger-aware engine kind (C58). Base index (0.35 mq/mq) computable; ceiling (0.70 via perequation) needs the transacted-rights ledger — investigate queryability before promising it. | Milan's dominant mechanism cannot be a conventional zone-table pack (see Milan `ENVELOPE.md`). |
| **Bologna** (Emilia-Romagna) | PUG | **Best pilot infra** — full OGC stack (DBTR + regional LiDAR + WMS/WFS/WCS/WPS/CS-W). Most tractable envelope pilot. | Highest-leverage first *pack* even though listed 2nd — best data estate to prove the C58 loop. |
| **Torino** (`001272`, it-pie) | PRG | **DM 1444-style zone letters + per-zone numeric NTA table** — the simplest, most conventional mechanism; the ONLY city with a real height source (ARPA). Confirm the incoming DCC-123/2026 revision keeps zone letters (regime di salvaguardia scope). | Fastest route to a *certified* pack; a natural co-pilot with Bologna. |
| **Roma** (`058091`, it-laz) | PRG | **Tessuto-typology + direct/indirect-intervention regime** — Città Storica per-tessuto NTA at 1:5000; needs a direct/indirect classifier (analogous to DE §30/§34/§35) + a reasoned-refusal vocabulary for indirect zones. Unresolved: *Carta per la Qualità* precedence. New engine kind. | Huge + heritage-heavy; highest engine cost. |
| **Firenze** | Piano Operativo + vincoli | Piano Operativo zone rules + landscape constraints; Toscana PRG delivered as PDF scans (zoning-as-data negative). | Then extend to the top-20 metros. |

**National floor rules (all cities):** Codice Civile Art. 873 (3 m boundary setback) + DM 1444 Art. 9 (10 m
between facing buildings — check each region's DPR 380/2001 Art. 2-bis derogation before shipping).

**Heritage overlay (all cities):** SITAP/APAR WFS (if confirmed public from a non-Replit IP) + Vincoli in Rete
fallback — flag "informational only; NOT FOUND does not certify absence" (a null ≠ certified absence).

**Projected move:** LEGISLATION `—`/~5 % → **~25–30 %** (mainland structured-fill ceiling); ENVELOPE `—` →
**~20–35 %** per city depending on mechanism. *(projected — moves only per-clau, per L-449 sign-off.)*

---

## 4 — The gap to Denmark (~96 %)

| Gap component | Axis(es) | Points bounded | Bridgeable? |
|---|---|---|---|
| No national zoning WFS (Plandata/GPU/XPlanung equivalent) | LEGISLATION · ENVELOPE | the dominant cap | ❌ Not without a national standard — none found in Italy today |
| DM 1444 abandoned in Milan + Rome (bespoke engine kinds) | ENVELOPE | per-city engine cost | ⚠️ Bridgeable per city (new C58 kinds) |
| No national surveyed building-height product | HEIGHTS/LOD · DATA-SOURCES | off-Piedmont surveyed tier | ⚠️ Regional LiDAR nDSM bridges partially (Phase B) |
| NTA numbers PDF-locked (not GIS) | LEGISLATION | per-city transcription throughput | ⚠️ Per-city + L-449 gate caps throughput |
| Cadastre + terrain already national + live | PARCEL · DATA-SOURCES · TERRAIN | **already bridged** | ✅ Phases A + C realise it cheaply |
| AP Bolzano may not have the zoning gap at all | LEGISLATION · ENVELOPE | — | ✅ Non-Replit probe required |

**Summary.** Italy reaches the *cheap* axes (PARCEL + DATA-SOURCES + TERRAIN + HEIGHTS = 50 % of weight) cheaply
via Phases A–C, but the *heavy* axes (LEGISLATION 25 + ENVELOPE 20 = 45 %) are structurally capped below Denmark
by the absent national zoning layer. The projected pilot-city composite ceiling is **~55–65 %**; the national
average is lower because most comuni will never get a pack. AP Bolzano is the sole candidate to approach Denmark.

---

## 5 — Dependencies, blockers, and cross-jurisdiction reuse

**Hard dependencies (resolve in order):**
- **Phase A gates everything downstream.** No parcel = no land to attach a zone, rule, height, or envelope to.
  Wire the Catasto provider before any Phase-D pack work (a pack with no parcel is untestable).
- **L-449 human-verification gate** is mandatory for any NTA value extracted in Phase D before it serves at
  `confidence: structured`. No transcribed number bypasses this gate.
- **ADR-0269 (curate-then-serve):** do not serve any PGT/PRG value not verified against a citable governing
  article in `sources/SOURCES.md` + signed `sources/VERIFICATION.md`.
- **C58 engine kinds** for Milan (ledger-aware) + Rome (tessuto + direct/indirect classifier) are prerequisites
  for those cities' ENVELOPE axis — a zone-table pack cannot represent either.

**Current blockers (probe before they gate production — §CONTEXT-DATA-HONESTY):**
- Regional height endpoint schemas (Lombardia/Veneto/Emilia field names) not live-probed — Phase B design-blocked.
- ARPA Piemonte `Edifici_3D` height field name unconfirmed from a clean IP (P0-B).
- SITAP/APAR WFS public access unconfirmed from a non-Replit IP (P0-C) — heritage overlay throttled until then.
- AP Bolzano ZoningElement WFS 2.0.0 public access unverified from a non-Replit IP (P0-A) — fast-track gated.
- Milan perequation-ledger queryability unknown — Milan ENVELOPE *ceiling* answer blocked until resolved.
- Lombardy/Lazio PGT/PRG zone-GIS WFS endpoints not found/confirmed — DATA-SOURCES regional-zone-GIS slot stays 0.

**Cross-jurisdiction reuse (never fork):**
- The **nDSM height module** (DSM−DTM, P90 per footprint) is the SAME shared module as Spain (L-511c) and France
  (L-512b). Italy feeds different regional inputs into it — do NOT build a per-country height path (Phase B).
- The **`ItalyCatastoProvider`** is ONE national provider on the ES `catastroParcelProvider` pattern — do NOT
  build per-region parcel providers (the fragmentation is above the cadastre, not in it).
- The **Barcelona pack pattern** (registry → per-zone packs → block-derived envelope → refusal vocabulary) is the
  Phase-D template; Bologna/Torino mirror its shape. The Rome direct/indirect classifier mirrors the German
  §30/§34/§35 pattern.
- The **CONTEXT axis** ports essentially free: rail + trees are already config-added to `bake.mjs` LAYERS (L-642)
  and lift CONTEXT from 5/9 toward 7/9 for Rome/Milan the moment those layers re-bake — an honest 0 until then.

---

*Model references: **Denmark** `../dk/` (ceiling, ~96 %) · **Barcelona** `../es/es-ct/08019-barcelona/` (pilot
climb) · **Portugal** `../pt/RATE-IMPLEMENTATION-PLAN.md` (shape of this plan). Governing: **C63** (the 7-axis
scorecard + weights) · **C57** (parcel) · **C58** (envelope) · **ADR-0269** (curate-then-serve) · **L-449**
(human-verification gate) · **L-649/L-650** (the completion-rollout program). Composite master:
[`COUNTRY-RATE.md`](./COUNTRY-RATE.md). National legislation sub-rate: [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md).*
*Last updated: 2026-07-30. Maintainer: UNASSIGNED.*
