# Spain National Envelope Capability Summary — 2026-08-04

Synthesis of 19 forensic capability audits (18 cities/regions, one combined Murcia
region+capital) plus one architecture design document, all produced 2026-08-04 by
independent research agents following a fixed evidence-only template (live
verification required, no invented endpoints, no assumed datasets). Every finding
below is drawn from the individual audit files, not re-derived — this document does
not add new research, only ranks and cross-references what was found.

Source documents (all under `docs/04-reference/jurisdictions/es/`):
- `es-an/ANDALUCIA-REGIONAL-CAPABILITY-AUDIT-2026-08-04.md`
- `es-an/ANDALUCIA-ENGINE-ARCHITECTURE.md`
- `es-an/14021-cordoba/findings/CAPABILITY-AUDIT-2026-08-04.md`
- `es-an/29067-malaga/findings/CAPABILITY-AUDIT-2026-08-04.md`
- `es-an/18087-granada/findings/CAPABILITY-AUDIT-2026-08-04.md`
- `es-an/41091-sevilla/findings/CAPABILITY-AUDIT-2026-08-04.md`
- `es-mc/MURCIA-REGION-AND-CAPITAL-CAPABILITY-AUDIT-2026-08-04.md`
- `es-vc/COMUNITAT-VALENCIANA-REGIONAL-CAPABILITY-AUDIT-2026-08-04.md`
- `es-vc/46250-valencia/findings/CAPABILITY-AUDIT-2026-08-04.md`
- `es-ct/CATALUNYA-REGIONAL-CAPABILITY-AUDIT-2026-08-04.md`
- `es-ct/08019-barcelona/findings/CAPABILITY-AUDIT-2026-08-04.md`
- `es-ib/BALEARS-CAPABILITY-AUDIT-2026-08-04.md`
- `es-md/28079-madrid/findings/CAPABILITY-AUDIT-2026-08-04.md`
- `es-cl/VALLADOLID-AND-REGIONAL-CAPABILITY-AUDIT-2026-08-04.md`
- `es-ga/GALICIA-SANTIAGO-VIGO-CAPABILITY-AUDIT-2026-08-04.md`
- `es-cn/CANARIAS-REGIONAL-CAPABILITY-AUDIT-2026-08-04.md`
- `es-ar/ARAGON-REGIONAL-CAPABILITY-AUDIT-2026-08-04.md`
- `es-ar/22125-huesca/findings/CAPABILITY-AUDIT-2026-08-04.md`
- `es-ar/50297-zaragoza/findings/CAPABILITY-AUDIT-2026-08-04.md`

---

## 1. Readiness ranking

| Rank | Jurisdiction | Score | Capability |
|---|---|---|---|
| 1 | Illes Balears | 58/100 | Indicative Ready (confirmed) |
| 2 | Barcelona | 46/100 | Tiered — Indicative 43% / Legally Blocked 40% / overlays Engineering Blocked |
| 3 | Sevilla (city) | 38/100 | Research Blocked city-wide; SB zone Legally Blocked (verification-gated, works E2E) |
| 4= | Murcia (capital) | 34/100 | Indicative Ready (capital only) |
| 4= | Catalunya (region) | 34/100 | Indicative Ready zoning-identity / Research Blocked envelope-params |
| 4= | Madrid (capital) | 34/100 | Legally Blocked (height) / Engineering Blocked (full PGOUM) |
| 7= | Andalucía (region) | 22/100 | Research Blocked / overlays Indicative Ready |
| 7= | Málaga | 22/100 | Research Blocked (confirmed no workaround) |
| 7= | Canarias (region) | 22/100 | Bimodal — Engineering Blocked / Legally-Structurally Blocked |
| 7= | Huesca | 22/100 | Research Blocked (falsifiable, bounded) |
| 11 | Córdoba (city) | 17/100 | Research Blocked city-wide / Engineering Blocked in-pilot |
| 12= | Granada | 18/100 | Research Blocked (zoning is *legally* raster) |
| 12= | Valencia (city) | 18/100 | Research Blocked (`altura` semantics unresolved) |
| 14= | Zaragoza | 16/100 | Engineering Blocked + Legally Blocked signature |
| 14= | Galicia | 16/100 | Research Blocked (genuinely unresolved) |
| 16 | Castilla y León | 14/100 | Research Blocked (regional data self-disclaimed) |
| 17= | Aragón (region) | 12/100 | Research Blocked |
| 17= | Comunitat Valenciana (region) | 12/100 | Research Blocked |
| 17= | Madrid (region) | 12/100 | Engineering Blocked (registration itself blocked) |

No jurisdiction scored above 60. Nothing in Spain is Production Ready by this
template's definition. The ceiling case (Balears, 58) is explicitly *Indicative*,
not a full determination.

---

## 2. Cross-cutting blocker taxonomy

Reusing the blocker-by-blocker framework from earlier this session — every
jurisdiction's primary blocker maps onto one of these, confirming the abstraction
holds at national scale, not just for the four Andalusian capitals it was
originally drawn from.

| # | Blocker type | Confirmed cases | Can engineering fix it alone? |
|---|---|---|---|
| 1 | No machine-readable zoning geometry | Granada (legally raster by Art. 7.9.6, confirmed byte-level), Castilla y León (data self-disclaims legal validity), Galicia (unresolved) | No — needs a legal/document project, or doesn't exist to find |
| 2 | Missing semantic interpretation | Valencia `altura` (three doc surfaces checked live, none states the convention), Balears (PTI category codes carry no numeric consequence) | Only with new authoritative documentation |
| 3 | Missing geometric parameter | Sevilla SB (**closed this session** — real `A_INTERIOR-MAXIMA` line geometry, now wired) | Yes — proven |
| 4 | Constraint layers exist but unwired | **Barcelona** (heritage + flood resolvers built, tested, zero dispatch call sites) | Yes — pure integration work |
| 5 | Missing live data service | **Telde (resolved this session)** — offline SIPU extract confirmed to contain both geometry and attributes; Huesca (no alternative found) | Sometimes — case by case |
| 6 | Data locked by authority | Málaga (`ORA-28000`, confirmed no alternate backend after exhaustive live check) | No |
| 7 | Poor source quality | Huesca (georeference rejected, 2.31m vs 3× bar) | Maybe — untried levers remain |
| 8 | Legal discretion | Madrid NZ-1 height (CPPHAN) — **flagged as unaudited to the required rigor, not a settled fact** | No, if the finding holds |
| 9 | Multi-instrument / derived-plan delegation | Canarias (46 municipalities, structural), Murcia (67% of capital's buildable land), Sevilla (delegation share unmeasured) | Partial — a currency register could narrow it |
| 10 | Registration blocked by geometry itself | **New this pass** — Madrid region: municipal boundaries interleave, no bbox can separate capital from Boadilla, blocking registration upstream of any legal or data question | Needs real polygon boundaries, not bboxes |
| 11 | Built but unsigned (L-449 gate) | Zaragoza, Córdoba (beyond pilot), Sevilla SB, Telde, El Sauzal | No — signature is human, by design |

---

## 3. The three highest-value actionable findings

These are new discoveries this session, independent of the prior code state, each
with a clear, bounded next step:

1. **Telde's SIPU package is obtainable and self-contained.** The Canarias audit
   downloaded the exact zip already cited in the codebase
   (`030319-pgo-ad-itpu-150323-210504-sipu.zip`, `opendata.sitcan.es`) and confirmed
   `02SIST/EDIF.shp` (geometry) ships in the **same package** as `EDIF.mdb`
   (attributes, already used). `resolveTeldeZone.ts` was authored against the wrong
   (disabled live-WFS) architecture; the offline-shapefile pattern El Sauzal already
   proved this session applies directly. Reclassified from "waiting on a dead
   government service" to "small, ready-to-build engineering task."

2. **Barcelona's heritage and flood resolvers exist, are tested, and are wired to
   nothing.** Every Barcelona envelope PRYZM ships today — including the flagship
   13a Eixample case — is an acknowledged upper bound that never applies a heritage
   or flood ceiling. This revises the "Barcelona SHIPPED and signed" framing in
   standing memory: the generation path is real, but partial. Fixing it is wiring
   two already-built resolvers into dispatch, not new research.

3. **Madrid's CPPHAN-discretion finding (the reason NZ-1 height is treated as
   permanently unsolvable) has never been audited to the rigor the repo's own
   governance (ADR-0296) now requires.** It is the standing explanation for why
   Madrid capital is capped where it is, but the audit found it currently sits at
   an unaudited "status C," not a confirmed fact.

---

## 4. Architecture verdict (from `ANDALUCIA-ENGINE-ARCHITECTURE.md`)

**Do not build a regional engine — for Andalucía or any other autonomous
community.** This is an independent second confirmation of the founder-authored
`ADR-0294`/`ADR-0295` (2026-08-02): Spain's buildable-envelope truth is organized
`parcel → municipality → instrument → detailed zoning → rule`, never by autonomous
community. A region supplies *overlay providers* (heritage, flood, environmental —
Category A, cheap, reusable), never a *code path*. Zoning polygons, ordinance
transcription, and every numeric parameter are irreducibly municipal (Category B),
proven by how differently the four Andalusian capitals fail: Córdoba (WFS,
95%-unpublished), Málaga (locked Oracle), Granada (legally bound to a raster map by
its own ordinance text), Sevilla (the one ArcGIS-REST municipality).

The single biggest risk to *any* abstraction attempt is discretionary or
graphically-delegated determinations — Madrid's CPPHAN, Granada's Art. 7.9.6,
Sevilla SB's per-block height on an unread graphic layer — none of which any
evaluator, regional or otherwise, can pre-compute. This is compounded by L-449:
a signature is per-municipality always, so sharing code never shares legal
liability for a transcription.

The international generalization question (Part 7) holds up against the
already-built code: Denmark, Netherlands, Paris and Switzerland are all flat
registrations in `registry.ts` at the same rung as any Spanish municipality — none
needed a country- or region-level engine. The pattern that actually generalizes is
the container/confidence/five-capability abstraction already in place, which was
region-agnostic by construction from the start.

---

## 5. What this changes about prior framing

- **"Barcelona envelope SHIPPED"** (standing memory) should be read as *shipped for
  the alineació-de-vial fabric, unconstrained by heritage/flood* — not a complete,
  constraint-final determination.
- **"Telde blocked on a dead WFS"** is no longer accurate — it is blocked on
  needing its resolver rewritten to the offline-extract pattern, a bounded task.
- **"Six unmodelled constraint families" for Balears** overstates the gap — geometry
  exists for most; the real blocker is a category-code-to-number semantic mapping.
- **"Zaragoza's WFS as a template for the region"** does not hold — Aragón's audit
  confirmed it is a genuine one-off municipal system, not a rail other towns share.
- **Madrid NZ-1 height-as-permanently-blocked** is weaker than assumed — the
  underlying legal-discretion finding needs its own audit before being treated as
  closed.

---

## 6. Suggested next steps, in order of leverage

1. Wire Barcelona's existing heritage + flood resolvers into dispatch (pure
   integration, resolvers already tested).
2. Rewrite `resolveTeldeZone.ts` against the offline SIPU shapefile (El Sauzal's
   proven pattern, package confirmed available).
3. Extend the Sevilla `A_INTERIOR-MAXIMA` alignment-line pattern from SB to the
   Centro Histórico (`CH`) zone, now that its own alignment codes are confirmed to
   exist in the same layer.
4. Commission the CPPHAN-discretion audit for Madrid NZ-1 at the rigor ADR-0296
   requires, before continuing to treat it as closed.
5. Everything else in this summary is either a genuine external-authority wait
   (Málaga), a real legal-research project (Granada, Valencia `altura`, the
   Canarias 46 multi-instrument municipalities), or a cold start with no known
   shortcut (Castilla y León, Galicia, Aragón beyond Zaragoza/Huesca).
