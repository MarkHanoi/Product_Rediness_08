# Archistar-Europe Competitive Gap Audit & Phased Plan — DK · CH · ES

> **Stamp**: 2026-07-17 · **Status**: STRATEGIC + TECHNICAL GAP AUDIT (no code changed, no contract flipped,
> no master tracker/plan edited). This is the sole artefact.
> **Author**: Competitive-strategy / GIS-product architect (audit pass)
> **Scope**: the founder's target loop — **parcel → local compliance knowledge → compliant buildable envelope +
> program constraints → author the design in-browser → export/interop** — for **Denmark, Switzerland, Spain**.
> **Governance posture**: launch-readiness/strategy deliverable, NOT a `*-AUDIT.md` contract-derivative. References the
> canonical C-contracts; authors none; flags conflicts; resolves none. Proposes new L-items (§7) — LISTED here for the
> orchestrator to transcribe; NOT written into `V1-LAUNCH-READINESS-AUDIT.md` or `V1-LAUNCH-IMPLEMENTATION-PLAN.md`.
> **Grounded in**: shipped code (`file:line`), `PARCEL-ZONING-FEATURE-SCOPING.md` (L-380, live-verified endpoints),
> `DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md` (L-383), `reports/PRYZM-STRATEGY-BRIEFING-2026-07-17.md` (honest gap
> list), and the L-NNN issue log. **No capability or traction is invented; every gap is stated plainly.**

---

## §1 — Executive summary & honest positioning verdict

**The competitive thesis is sound; the competitive product is not yet built.** Archistar's moat is *government-side
compliance/zoning distribution* — it tells you what you may build on a parcel before you draw. PRYZM's claimed moat is
the *browser authoring substrate* — once you know the rules, PRYZM can actually generate and author the compliant
building better than Archistar (which has weak authoring). The strategy — **beat Archistar on authoring, match it on
compliance** — is correct and defensible. The problem is that **the compliance half is ~5% built and the authoring half,
while genuinely strong, is not yet connected to compliance at all.**

### What is actually shipped toward the loop (verified in code)

- **Parcel *geometry* selection — Spain only, input side only.** `ParcelProvider` interface +
  `CatastroParcelProvider` (`apps/editor/src/ui/site/parcel/`) + a same-origin proxy `server/parcelZoningProxy.js`
  (mounted `server.js:363`, route `/api/catastro/parcel`) are BUILT and wired into the 2D GIS map
  (`SiteBoundaryMap2D.ts:1170`, `GISAreaLayout.ts:141` injects `defaultParcelProvider = Catastro/Barcelona`). A click →
  keyless Catastro reverse-geocode → INSPIRE WFS `GetParcel` → GML normalised to a WGS84 ring → committed down the
  **identical** path a drawn boundary uses (`useSelectedParcel` → `buildBoundaryFromLatLonRing` → `site.parcel-boundary-set`).
- **The site-model destination exists.** C19 `Parcel` already carries `setbacks/maxFAR/maxHeight/zoning.*`, and the
  `site.updateZoning` command is implemented (`packages/stores/src/site-commands/siteUpdateZoning.ts`).
- **The authoring substrate is real and strong.** Deterministic generative layout engines (apartment / house /
  residential-building), the typology pipeline (`@pryzm/typology-pipeline`, C50), the editable building graph (C52), and
  the BIM element pipeline are shipped and tested — this is the genuine advantage over Archistar.

### What is NOT built — the entire compliance intelligence (the Archistar moat)

- **NO zoning fetch.** Parcel select returns *geometry only*. There is no `ZoningProvider`, no Catalonia-MUC / Plandata /
  ÖREB adapter. Grep confirms zero implementations outside the interface stub.
- **NO buildable-envelope engine.** No `ZoningRulesEngine`, no `computeBuildableEnvelope`, no `BuildableEnvelope`, no
  `JurisdictionZoningContract` anywhere in the tree. `site.updateZoning` exists but **nothing computes an envelope to
  call it** — the field destination is wired to a source that does not exist.
- **NO setback/height/FAR solver, NO "explain-why" compliance report** — the thing Archistar actually sells.
- **NO envelope→authoring bridge.** Generators read `getParcelBoundary()` only; they do not consume a setback inset or
  height cap. Compliance, even once computed, would not constrain generation.
- **Denmark / Switzerland: 0 code.** L-383 (Denmark) is a *validation document only* — no adapters, no LOD2/terrain
  ingestion. Switzerland has no code at all.
- **Governance not authored.** C57 (Parcel Data Layer) and C58 (Zoning Rules Engine) are *proposed* — the C00 index
  ends at C56, so both are **gaps, not contracts**. The strategy ADR and SPEC-PARCEL-SELECTION are likewise unauthored.

### Positioning verdict — can we credibly say "Archistar competitor" in September?

**No — not in September, and saying so would fail the honesty mandate.** What can be *shown* in September is a
**Spain parcel-select demo**: click a Barcelona plot → see the real cadastral geometry → author a building on it. That is
a compelling *authoring* demo and a legitimate proof of the site-first spine — but it demonstrates **none of the
compliance intelligence** that defines the Archistar category. Presenting it as an Archistar competitor would be a
product-claim overreach (the strategy briefing already labels §3.4 "SCOPED, NOT BUILT").

**The honest September claim**: *"PRYZM authors compliant-ready buildings on real European parcels; local-compliance
automation is on the roadmap, Denmark-first."* Not *"PRYZM is a European Archistar."*

**Shortest credible path to a defensible "compliance-aware authoring" claim** (not full Archistar parity, but a real
competitive wedge): **one jurisdiction, end-to-end, with the envelope actually constraining generation** — i.e.
parcel → zoning → buildable envelope → *generated building that provably fits inside the envelope* → export. Estimated
**~8–11 focused dev-weeks** on top of the shipped parcel P0 (§6 phasing). Denmark is the fastest route to a *fidelity-
credible* version of this because it is the only one of the three with structured zoning **and** free LOD2/terrain; Spain
is the fastest route to a *keyless* version but with poor 3D context fidelity. **Neither is a September deliverable
alongside the open P0/P1 launch blockers (§5.5).**

---

## §2 — Per-jurisdiction data / regulation reality (the compliance substrate)

Compliance automation is only as good as the machine-readable data underneath it. The decisive, repeatedly-confirmed
finding across all three jurisdictions: **the *numeric* building rules (height / FAR / setback) are PDF-trapped
everywhere except Denmark.** Everything else is a question of parcel-access friction and 3D-context fidelity.

| Dimension | 🇩🇰 Denmark | 🇨🇭 Switzerland | 🇪🇸 Spain |
|---|---|---|---|
| **1. Parcel / cadastre** | Matriklen2 via **Datafordeler** WFS/GML, EPSG:25832. **API-KEY GATED** (free self-service: web-user → IT-system → service-user key). Server-side key only. | **geodienste.ch** national AV (`ms:RESF`, GeoJSON, EPSG:2056) + **swisstopo identify** → EGRID. Mostly OGD, **a few cantons meter/charge**. Structurally the *cleanest* (one EGRID-keyed national cadastre). | **Catastro INSPIRE WFS** (`cp:CadastralParcel`) + OVC reverse-geocode — **KEYLESS, live-verified, BUILT**. WFS has **NO BBOX** (point→REFCAT→`GetParcel` only); WMS "no massive downloads" clause. |
| **2. Zoning / land-use plan** | **Plandata.dk** — single **national** register, structured fields (`bebyggelsesprocent`, `maksbygningshoejde`, `maksantaletager`, `anvendelse`), anonymous WFS. **Best-in-class in Europe.** | **ÖREB cadastre** — federally-standardised *model*, per-EGRID XML giving zone-type + a legal-doc reference; **federated per-canton** (26 cantons) → real fragmentation. "Bauzonen CH harmonisiert" gives 9 coarse national classes only. | **Municipal PGOU/POUM — fragmented.** Best is **Catalonia MUC** (`PLANEJAMENT:MUC_QUALIFICACIONS`, WFS w/ **spatial query + GeoJSON**, Catalonia-wide, zone class structured). Madrid PGOUM via ArcGIS REST. Elsewhere = per-municipality patchwork. |
| **3. Building-code / envelope numbers (setback/height/FAR)** | ✅ **Structured** on a large share of local plans (`bebyggelsesprocent`, height, floors). The only jurisdiction where the numbers are largely codified. Gaps filled by a small curated ruleset. | ❌ **PDF-trapped** in the referenced *Baureglement* per municipality (Ausnützungsziffer / height / setback). ÖREB gives you the *reference*, not the numbers. **3,000+ municipal codes** → largest curation long-tail. Vendor **Terrara** has normalised these (buy-vs-build). | ❌ **PDF-trapped** in POUM/PGOU *normativa* (edificabilidad, altura reguladora, ocupació). MUC gives zone *class*; Madrid VEDA gives *some* coefficients. Needs a curated per-municipality ruleset. |
| **4. 3D context (LOD2 buildings + terrain)** | ✅✅ **"Danmark i 3D"** national semantic **LOD2 CityGML** (per-building ID) + **DHM** LiDAR/0.4 m DTM. **Best demo fidelity in Europe** (free-with-key). | ✅✅ **swissBUILDINGS3D + swissALTI3D** (excellent national LOD2 + terrain). Strong fidelity. | ❌ **Little free LOD2.** Falls back to OSM footprint-extrusion (LOD1) + open global terrain (Copernicus GLO-30). **Weakest 3D-context fidelity of the three** — the demo will look flat. |
| **5. Data residency / GDPR** | EU/EEA — GDPR. Clean. | Non-EU; **adequacy decision** in force (EU↔CH) — acceptable, note in DPA. | EU/EEA — GDPR. Clean. |
| **Net verdict** | **Reference / demo jurisdiction** — only one open end-to-end (parcel⚠key + zoning✅ + LOD2✅ + terrain✅). | **Hardest** — cleanest parcels but per-canton PDF federation for the numbers; strong 3D. Buy-vs-build (Terrara) decision. | **Business market, keyless quick-win** — parcels BUILT & free; zoning class available (Catalonia); **numbers curated; low 3D fidelity**. |

Sources are live-verified 2026-07-17 in `PARCEL-ZONING-FEATURE-SCOPING.md` §3–§5/§15 and
`DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md` §2/§9. This audit does not re-derive them.

---

## §3 — The gap audit (exhaustive, grouped, honest)

Severity: **P0** = blocks any launch · **P1** = blocks the competitive claim · **P2** = blocks parity/scale.
"Governs" names the contract/ADR/spec — or flags a **NEW** one needed.

### G-DATA — parcel/zoning/code data ingestion

| # | Gap | Sev | Blocks | Effort | Governs |
|---|---|---|---|---|---|
| G-DATA-1 | **Zoning fetch does not exist.** Parcel select returns geometry only; no `ZoningProvider`, no MUC/Plandata/ÖREB adapter. | **P1** | Any compliance output whatsoever | M | **C58 (NEW)** |
| G-DATA-2 | **Denmark parcel adapter unbuilt + key-gated.** Matriklen needs a Datafordeler service-user key (server-side). No `DkParcelProvider`. | P2 | DK demo (best-fidelity) | S–M | C57 (NEW), L-383 |
| G-DATA-3 | **Switzerland: zero code**, and the numeric rules are per-canton PDF (26 federations) — worst curation long-tail. | P2 | CH market | L | C57/C58 (NEW), Terrara buy-vs-build |
| G-DATA-4 | **Spain numeric envelope PDF-trapped** — MUC gives zone class, not height/FAR/setback; needs curated ruleset per municipality. | P1 | ES envelope accuracy | M (ongoing curation) | C58 (NEW) |
| G-DATA-5 | **No serve-in-house / cache-normalisation tier beyond the single Catastro proxy** — every new source re-hammers a shared gov endpoint. | P2 | Scale, rate-limit citizenship | M | L-383d (PostGIS/Martin), ADR-0088 pattern |

### G-COMPLIANCE-ENGINE — turning zoning into a buildable envelope (the core, 0% built)

| # | Gap | Sev | Blocks | Effort | Governs |
|---|---|---|---|---|---|
| G-ENG-1 | **No rules engine.** No `ZoningRulesEngine` / `computeBuildableEnvelope` / `BuildableEnvelope` / `JurisdictionZoningContract` in the tree. This is the single largest gap to the Archistar loop. | **P1** | The entire compliance value prop | **M–L** | **C58 (NEW)** |
| G-ENG-2 | **No envelope solver.** Nothing computes parcel ⊖ setbacks (Turf negative buffer) → inset polygon → `area × maxHeight` volume. Turf is **not even a dependency yet** (`grep '@turf'` = ∅). | **P1** | Buildable-envelope geometry | M | C58 (NEW); new dep (lockfile-sync discipline) |
| G-ENG-3 | **No two-fidelity rule model.** No `structured` vs `estimated-ruleset` vs `none` resolution; no per-field provenance; no curated per-jurisdiction rule packs (the DK-gap / all-of-ES/CH filler). | **P1** | Honest coverage where PDF-trapped | M | C58 (NEW); mirror `rules/programRules.ts` |
| G-ENG-4 | **No "explain-why" compliance report.** Archistar *sells* the report ("this envelope because setback X, height Y, FAR Z, ordinance ref"). PRYZM has no report artefact, no provenance chip, no L-373 credibility surface for zoning. | **P1** | Compliance product parity | M | **SPEC-COMPLIANCE-REPORT (NEW)**, C23 provenance, L-373 |
| G-ENG-5 | **No compliance *check-back*** (is this authored design still compliant after edits?). Archistar-grade tools re-validate. PRYZM has no rule-vs-model checker. | P2 | Ongoing-compliance parity | M–L | C58 (NEW), C52 edit substrate |

### G-AUTHORING-BRIDGE — connecting compliance to PRYZM's strength (disconnected today)

| # | Gap | Sev | Blocks | Effort | Governs |
|---|---|---|---|---|---|
| G-BRG-1 | **Envelope does not constrain generation.** `generateResidentialFromBoundary` / apartment / house / typology-pipeline read the boundary only; no setback-inset or height-cap input. Compliance and authoring are two disconnected halves. | **P1** | The entire competitive thesis ("beat Archistar on authoring *of the compliant* building") | M | C19 §1.6, **C50** (typology pipeline), **C53** (layout engine — slider-as-intent, no parallel knob) |
| G-BRG-2 | **No program-constraint hand-off** (permitted use → typology brief). Zoning `anvendelse`/`qualificació` should seed the typology brief; today the brief is hand-authored. | P2 | Program-compliant generation | M | C50, `briefSchema` (typology-brief), C52 |
| G-BRG-3 | **3D envelope volume render unbuilt** (translucent max-height extrusion). Needed for the demo; no new THREE site required (P2-safe via existing renderer). | P2 | Demo legibility | S | C04, C18/C19 §5.5 brand `#6600FF` |

### G-INTEROP — table-stakes for European (esp. CH/NL/DE BIM-culture) architects

| # | Gap | Sev | Blocks | Effort | Governs |
|---|---|---|---|---|---|
| G-INT-1 | **IFC/DXF/Rhino round-trip fidelity UNVERIFIED** — no import→export→re-import compare test exists; only BCF + family/chunk have round-trip coverage. European architects will reject a tool that mangles IFC. | **P1** | Credibility with BIM-culture markets | M | **L-393** (existing), C25/C26/C32/C33 (mostly DRAFT) |
| G-INT-2 | **Adversarial malformed-file behaviour untested** (crash vs silent-drop vs graceful reject on bad IFC/DXF/Rhino upload). | P2 | Robustness / trust | S–M | L-393 |

### G-LAUNCH-BLOCKERS — gate ANY credible launch regardless of country

| # | Gap | Sev | Blocks | Governs |
|---|---|---|---|---|
| G-LB-1 | **Silent element-loss reported as success; no whole-snapshot validation, no checksum.** Checksum added then reverted after bricking a real 1009-element project. Server validates only 50 MB + the furniture array. | **P0** | Data integrity — the biggest single risk | **L-334** (+L-360), C48 |
| G-LB-2 | **Real-time collab has NO network backend.** `apps/sync-server` undeployed; no `WebsocketProvider`; production collab = socket.io last-write-wins for concurrent move/edit/delete. | **P0** | Multi-user correctness | **L-391** (+L-375a), L-391-CRDT-COLLAB-PLAN |
| G-LB-3 | **Free-plan durability trap + no restore drill.** `VERSION_LIMITS.free=0` (`server.js:3258`) → free projects live only in one browser's IndexedDB; DR restore never drilled; PITR not wired. | P1 | Durability / trust | **L-396**, C48, DR-DRILL-RUNBOOK |
| G-LB-4 | **93 dependency advisories (7 critical/28 high)**, runtime-reachable (jsPDF, Multer/ws/form-data). | P1 | Security | **L-387**, C07/C29 |
| G-LB-5 | **Pricing/versioning inconsistency** — `VERSION_LIMITS` shows `free:1` (`:2549`) vs enforces `free:0` (`:3258`) vs `PlanConfig.ts:75` `free:1`. Three inconsistent numbers. | P1 | Billing/durability coherence | **L-397** (orchestrator-owned) |

### G-PRODUCT-CLAIM — the honest delta

| # | Gap | Sev | Note |
|---|---|---|---|
| G-PC-1 | **"Targeting Archistar" outruns the demo.** A first demo backs *authoring on a real parcel*, not compliance distribution. Archistar's moat (gov-side zoning distribution across a whole country) is a data-operations moat PRYZM has not begun; our moat (authoring) is real but orthogonal. | P1 | Message must be "compliance-aware authoring, Denmark-first roadmap" — not "European Archistar". |
| G-PC-2 | **Curation is the real long-tail, not code.** Where numbers are PDF-trapped (all of CH, most of ES), the cost is *maintaining rule packs*, ongoing — or a Terrara-style buy. This is a business-model decision, not an engineering one. | P1 | ADR + buy-vs-build decision needed. |

---

## §4 — Governance mapping & missing contracts

| Area | Governing contract/ADR/spec | Status |
|---|---|---|
| Coordinate substrate / CRS | **C12-GEOSPATIAL** | CANONICAL — the strong part; extend for terrain/LOD2 ingestion |
| Site model / parcel / zoning fields | **C19-SITE-MODEL-AND-PARCEL** | CANONICAL — output fields + `site.updateZoning` already exist; §9/§10.2 **defer** the jurisdiction code registry (exactly the C58 slot) |
| Analytical geodata layers (Hektar-style) | **C55-GEODATA-ANALYTICAL-LAYERS** | DRAFT — the "drape over terrain" precedent; compliance layers are a sibling |
| Typology / generation pipeline | **C50**, **C53**, **C52** | the authoring substrate the envelope must feed |
| Parcel data ingestion | **C57-PARCEL-DATA-LAYER** | **NOT AUTHORED — GAP** (index ends at C56) |
| Zoning rules → envelope | **C58-ZONING-RULES-ENGINE** (incl. `JurisdictionZoningContract`) | **NOT AUTHORED — GAP**; fills C19 §9/§10.2 deferred registry |
| Compliance report artefact | **SPEC-COMPLIANCE-REPORT** | **NOT AUTHORED — GAP** (Archistar-parity deliverable) |
| Parcel-select interaction | **SPEC-PARCEL-SELECTION** | **NOT AUTHORED — GAP** |
| Strategy + buy-vs-build | **ADR-02XX** (parcel-data + per-jurisdiction zoning + Terrara) | **NOT AUTHORED — GAP** |
| Interop round-trip | **L-393**; C25/C26/C32/C33 | mostly DRAFT; no round-trip test |
| Credibility labelling | **L-373** discipline + CI fidelity-label gate | pattern exists (`check-windcfd-beta-label.ts`) |

**Conflicts to flag (human decision — report, do not resolve):**
- **CF-1** — Is zoning/site-feasibility a **headline V1 wedge** or a **Phase-B feature**? The strategy briefing treats it as
  roadmap; this audit's positioning verdict (§1) assumes Phase-B. Founder decides the messaging tier.
- **CF-2** — **Terrara buy-vs-build** for Switzerland (and the ES curation long-tail): license a normalizer vs hand-maintain
  rule packs. Commercial decision; no public API/pricing (UNVERIFIED).
- **CF-3** — **Engineering-context vs Forma-abstract default view** (inherited from L-374 §7.5): DK LOD2 fidelity vs the
  deliberately-abstract massing study. Founder sets the default.

---

## §5 — Phased plan (jurisdiction-sequenced, architecturally sound)

### §5.1 — Recommended jurisdiction sequence & rationale

1. **Denmark FIRST (technical reference + demo fidelity).** Only jurisdiction open end-to-end: structured zoning
   (Plandata.dk — least curation), *and* free LOD2 + terrain (best-looking demo in Europe). It is already the reference
   architecture (L-383). The compliance engine (C58) is built and *proven* here with the least PDF-curation friction, then
   generalises. The one cost is a free Datafordeler key (server-side). **Build the engine where the data is cleanest.**
2. **Spain SECOND (keyless quick-win — with a fidelity caveat).** Parcel P0 is already BUILT and keyless; honours the
   Spain-first *business* market. But **flag loudly**: numeric rules are PDF-trapped (curated `es-barcelona` rule pack) and
   **there is little free LOD2** → the Spanish demo will look flat next to Denmark's. Spain proves *breadth* (a second
   jurisdiction on the same abstraction) and *market fit*, not fidelity.
3. **Switzerland THIRD (hardest — say so).** Cleanest parcels but **26-canton PDF federation** for the numbers is the
   worst curation long-tail; gated by the **Terrara buy-vs-build** decision (CF-2). Strong 3D context (swissBUILDINGS3D)
   partly offsets. Do not couple CH to the DK/ES timeline; it is a deliberate later bet.

This sequence deliberately **decouples "build the engine" (Denmark, clean data) from "already-shipped parcel input"
(Spain)** — the engine is jurisdiction-agnostic (GeoJSON-canonical, provider adapters), so building it on DK and running
it on ES is a pure adapter swap, exactly as L-380 §4.4 / L-383 §4 designed.

### §5.2 — Phases (each: scope · deps · verify-gate · L-item)

| Phase | Scope | Deps | Verify-gate | L-item(s) |
|---|---|---|---|---|
| **B0 — Governance + engine skeleton** | Author C57, C58, SPEC-PARCEL-SELECTION, SPEC-COMPLIANCE-REPORT, strategy ADR; add Turf dep; L0 schemas (`BuildableEnvelope`, `JurisdictionZoningContract`, `ZoningRecord`); lift parcel provider to `@pryzm/site-parcel-data` (L2). | none | C00 index numbers reserved; Zod round-trip + P5 purity gate green; Turf lockfile-synced | **L-398, L-400, L-403** |
| **B1 — Zoning Rules Engine (Denmark)** | `DkZoningProvider` (Plandata anonymous WFS, structured fields) + `ZoningRulesEngine` (parcel ⊖ setbacks inset, `area×maxHeight`, two-fidelity resolution) → `site.updateZoning`. | B0; DK key (parcel later) | Copenhagen zone → deterministic envelope; inset correct on L-shaped parcel; confidence label present | **L-398, L-399** |
| **B2 — Envelope → authoring bridge** | Thread inset polygon + maxHeight (+ permitted-use → typology brief) into the generators / typology-pipeline as generation bounds. | B1 | Generated footprint ⊂ inset; height ≤ maxHeight; C53 slider-as-intent preserved (no parallel knob); §1.6 lint green | **L-401** |
| **B3 — Compliance report + provenance** | "Explain-why" report artefact (envelope + rule refs + ordinance links + confidence chips); 3D envelope volume render; L-373 CI fidelity-label gate. | B1 | Report renders with per-field provenance; `estimated-ruleset` never shown authoritative; CI gate enforces label | **L-402** |
| **B4 — Spain bring-up (breadth)** | `MucZoningProvider` + curated `es-barcelona` `JurisdictionZoningContract`; reuse the P0 Catastro parcel path. Flag low LOD2 fidelity. | B1–B3 | Barcelona parcel → zone → curated envelope → generated compliant building; adapter-only, no core change | **L-399** (ES pack) |
| **B5 — Denmark demo fidelity** | Execute L-383: offline-bake LOD2 3D-Tiles + DHM quantized-mesh terrain; DK Matriklen keyed parcel adapter. Flagship demo. | B1 | Copenhagen: click parcel → envelope → LOD2 context + real terrain in one Cesium view | **L-404** (executes L-383a–e) |
| **B6 — Interop verification** | IFC/DXF/Rhino round-trip harness (import→export→re-import geometry compare) + adversarial malformed-file behaviour. | independent | Round-trip geometry delta within tolerance; malformed files reject gracefully | **L-393** (existing) |
| **B7 — Switzerland (later bet)** | `OerebParcelProvider` (EGRID) + `OerebZoningProvider` + Terrara premium adapter (pending CF-2). | B1–B4; CF-2 | EGRID parcel + zone reference; numbers via curated pack or Terrara | **L-399/L-400** (CH adapters) |

**Launch-blocker track runs in PARALLEL and gates any GA** (not part of this compliance track, but sequencing-critical):
G-LB-1..5 = **L-334, L-391, L-396, L-387, L-397**. **The compliance track (B0–B7) must not ship as a "launch" until the
P0 blockers L-334 + L-391 are closed** — a compliance demo on top of silent-element-loss + last-write-wins collab is not
launchable. Compliance work is *additive* and can proceed dark (behind a flag) in parallel, per L-380 §12.

### §5.3 — Reuse mandate honoured

Every phase reuses shipped seams, per the platform-spine and reuse-proven-pipeline memory mandates: the Catastro proxy
template (`overpassProxy.js`), `buildBoundaryFromLatLonRing` (`boundaryProjection.ts:143`), `site.updateZoning`
(`siteUpdateZoning.ts`), the typology pipeline (C50) and layout engines (C53) as the authoring target, and the L-383
GeoJSON-canonical / offline-bake toolchain for 3D context. No net-new map infra, no parallel generator.

### §5.4 — Effort to a credible competitive wedge

- **One jurisdiction, engine→bridge→report, Denmark** (B0–B3): **~8–11 dev-weeks** (1 eng).
- **+ Spain breadth** (B4): **+2–3 wk** (adapter + curated pack).
- **+ DK demo fidelity** (B5): **+M–L** offline-bake work (L-383), decouplable.
- **Switzerland** (B7): gated by Terrara decision; **L** if built raw.
- **The recurring cost is rule-pack curation**, not code (G-PC-2).

### §5.5 — Why not September

The three P0/P1 launch blockers (L-334 data-integrity, L-391 collab, L-396 durability) are unresolved and are the real
September critical path. The compliance track adds ~8–11 wk on top of a parcel P0 that only does geometry. **September =
Spain parcel-select *authoring* demo + honest roadmap messaging; the compliance-competitive claim is a Q4/Q1 deliverable
sequenced behind the launch blockers.**

---

## §6 — Top 5 gaps ranked

1. **G-ENG-1 — No buildable-envelope rules engine (C58).** The single largest gap; the compliance value prop is 0% built.
2. **G-BRG-1 — Envelope does not constrain generation.** Even once computed, compliance would not reach PRYZM's authoring
   strength — this connection *is* the competitive thesis.
3. **G-LB-1 / G-LB-2 — Data-integrity (L-334) + collab (L-391) P0 blockers.** Gate any launch regardless of country; a
   compliance demo on top of silent data-loss is not shippable.
4. **G-ENG-4 — No "explain-why" compliance report.** The specific artefact Archistar sells; without it we match Archistar
   on neither compliance nor its packaging.
5. **G-INT-1 — IFC/DXF/Rhino round-trip fidelity unverified (L-393).** Table-stakes trust for European BIM-culture
   architects; assumed, never tested.

---

## §7 — Proposed L-items — "Pipeline B+ / compliance-authoring" track

New track: **Pipeline B+ (compliance-authoring)** — connects the geospatial input (Pipeline/site) to the generative
authoring substrate through a compliance engine. Numbering from **L-398** (L-397 reserved for the pricing conflict,
orchestrator-owned). **Listed here only — NOT written into the master docs.** Existing items referenced, not duplicated:
**L-380** (parcel P0, shipped-partial), **L-383** (DK reference), **L-393** (interop round-trip), **L-334/L-391/L-396/
L-387/L-397** (launch blockers).

| ID | Title | Sev | Contract mapping | One-line scope | Pipeline |
|---|---|---|---|---|---|
| **L-398** | Zoning Rules Engine + BuildableEnvelope solver | **P1** | **C58 (NEW)**; ties C19 §1.4/§1.6 | Pure L2 `ZoningRulesEngine`: parcel ⊖ setbacks (Turf) → inset polygon + `area×maxHeight` volume, two-fidelity (structured / estimated-ruleset / none) resolution → `site.updateZoning`. The core compliance engine — 0% today. | B+ |
| **L-399** | ZoningProvider adapters + curated rule packs (DK Plandata + ES-Catalonia MUC) | **P1** | C58 (NEW); L-373 credibility | `DkZoningProvider` (Plandata structured fields) + `MucZoningProvider` (zone class) + curated `JurisdictionZoningContract` packs (`da-*`, `es-barcelona`) filling PDF-trapped numbers; mirror `rules/programRules.ts`. | B+ |
| **L-400** | Parcel Data Layer completion — lift to L2 + DK/CH adapters | P2 | **C57 (NEW)**; ties C12/C19 | Lift the shipped Catastro P0 to `@pryzm/site-parcel-data` (L2); add `DkParcelProvider` (Matriklen, server-side Datafordeler key) + `OerebParcelProvider` (CH EGRID); provenance per L-373. | B+ |
| **L-401** | Envelope → authoring constraint bridge | **P1** | C19 §1.6, **C50**, **C53** (slider-as-intent, no parallel knob) | Thread inset polygon + maxHeight (+ permitted-use → typology brief) into `generateResidentialFromBoundary` / apartment / house / typology-pipeline as generation bounds. Connects compliance to PRYZM's authoring moat. | B+ |
| **L-402** | Compliance report + 3D envelope render ("explain-why") | **P1** | **SPEC-COMPLIANCE-REPORT (NEW)**, C23 provenance, L-373; C04/C18 render | The Archistar-parity deliverable: envelope + rule refs + ordinance links + confidence chips; translucent max-height 3D volume (P2-safe, existing renderer); CI fidelity-label gate. | B+ |
| **L-403** | Governance authoring — C57 + C58 + SPECs + strategy ADR + VISION wedge | P2 | C57/C58/SPEC-PARCEL-SELECTION/SPEC-COMPLIANCE-REPORT (NEW); ADR-02XX; C00 index; STR-02/STR-12 | Author the missing contracts/specs/ADR; VISION amendment elevating site-feasibility to a named wedge; record the Terrara buy-vs-build + "V1 pillar vs Phase-B" decisions (CF-1/CF-2). | B+ |
| **L-404** | Denmark demo-fidelity bring-up (executes L-383a–e) | P2 | extends **L-383**; C12-CONTEXT-ENGINE (NEW gap), C55 | Offline-bake LOD2 3D-Tiles ("Danmark i 3D") + DHM quantized-mesh terrain; DK Matriklen keyed parcel; flagship parcel→envelope→LOD2+terrain demo. Native binaries offline only (Fly app image stays pure Node). | B+ |

---

## §8 — Verdict summary (for the founder)

- **Can we say "Archistar competitor" in September?** **No.** We can demo *authoring on a real Spanish parcel* and message
  *"compliance-aware authoring, Denmark-first roadmap."* The compliance intelligence that defines the category is ~5%
  built (geometry-fetch only) and disconnected from our authoring strength.
- **Shortest credible path:** Denmark end-to-end (engine on the cleanest data) → envelope actually constrains generation →
  compliance report. ~8–11 wk on top of the shipped parcel P0, sequenced **behind** the P0 launch blockers (L-334, L-391).
- **Our real, defensible edge** is exactly what the founder said: the authoring substrate. The whole plan is to make that
  edge *compliance-aware* — build the missing engine (C58), then connect it (L-401) to the generators we already beat
  Archistar with. Data curation, not code, is the long-tail cost; that is a buy-vs-build business decision, not an
  engineering blocker.

*End of audit. No code was modified, no contract was flipped, no master tracker/plan was edited in producing this document.*
