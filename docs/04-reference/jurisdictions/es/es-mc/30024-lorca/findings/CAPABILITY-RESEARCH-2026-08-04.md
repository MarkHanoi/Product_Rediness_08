# Lorca (INE 30024) — Envelope-Engine Capability Research

Date: 2026-08-04
Status: independent verification pass, second-priority Región de Murcia municipality (after Cartagena)
Prior pass: founder manual research (unverified) — largely CONFIRMED and EXTENDED below with a live
parcel→ordinance lookup mechanism the prior pass had marked as the one open gap.

## A. Verdict: **PARTIALLY**

Lorca can support an envelope engine for the majority of consolidated urban/rural land computable
directly from the PGMO, using the same rule-pack-authoring pattern as Murcia capital. It is NOT a
"read one plan, done" case like a clean single-instrument city: coverage is gated by (a) confirming
which parcels fall under direct PGMO ordinances vs. a derived Plan Parcial/Especial/Sector
Urbanizable, and (b) the fact that the one genuine parcel→ordinance query mechanism found is a
third-party-hosted municipal web service of currently uncertain uptime (see D/E below), not a
guaranteed-available API.

## B. Coverage estimate

No parcel-level statistic is publicly computable without the cadastral parcel count broken out by
PGMO management category (Direct actions / Isolated actions / Unidades de Actuación / Planes
Parciales / Planes Especiales / Sectores Urbanizables) — that breakdown exists in `Tomo IV. MEMORIA
DE GESTION.pdf` but requires manual extraction (Confidence: Medium that the tomo enumerates this
cleanly, based on its stated table-of-categories structure; not independently opened as a PDF in
this pass).

Working estimate, by analogy to Murcia capital and Cartagena's typical Spanish-mid-city split:
- **~60–75% of parcels** (consolidated urban fabric: Suelo Urbano Consolidado, Núcleos Rurales,
  Direct/Isolated actions) — directly computable from PGMO Normativa + Fichas once digitized into a
  rule pack. **Confidence: Medium.**
- **~20–35%** (Unidades de Actuación, Sectores Urbanizables, Planes Parciales/Especiales not yet
  executed) — require the DERIVED plan's own ordinance, not just the PGMO; each is a separate
  document to ingest (there are already dozens of individual "Plan Parcial Sector X" PDFs published,
  e.g. `RP2-UZPI-1`). Confidence: Medium that this split direction is right; Low on the exact
  percentage split without the Tomo IV table.
- A meaningful share of Lorca's municipal area is diseminated núcleos rurales / pedanías (Lorca has
  the largest municipal area in Spain, highly dispersed) governed by `TOMO IX NUCLEOS RURALES.pdf` —
  a genuinely distinct sub-regime, adding authoring surface but not blocking coverage. **Confidence:
  Medium.**

## C. Blockers

**Data / sourcing**
- The Tomo IV management-category breakdown (needed to size B precisely) was not opened in this pass
  — only its existence and table-of-contents-level structure were confirmed. Next step: open
  `Tomo IV. MEMORIA DE GESTION.pdf` and extract the category list with parcel/area counts.
- `TOMO III NORMATIVA URBANISTICA FICHAS v3.zip` (40MB) — the Fichas volume — was not opened; whether
  individual fichas carry a machine-usable polygon ID cross-referencing the map service below is
  unconfirmed. **Confidence: Low** on ficha-to-map ID format until opened.
- IDERM/SitMurcia's own Lorca coverage is explicitly **non-authoritative**: dataset metadata
  (`sit_usu_pla_urb_carm_v_clases_plu_ze_37mun_md`) states digitization at **1:5000** scale from the
  MTR5 regional topographic base, sourced from AutoCAD exports of the municipal plan, with an
  explicit disclaimer: *"la información ofrecida tiene carácter orientativo y no será vinculante
  para la resolución de los procedimientos administrativos"* and *"no está sujeta a control de
  calidad."* Lorca is named explicitly in the covered-municipality list. This is the **same ceiling**
  already documented for the regional Murcia audit — confirmed, not improved, for Lorca specifically.
  **Confidence: High** (verified directly from the dataset's own metadata record).

**Technical**
- `sit.lorca.es/Visor/` returned **HTTP 503** on retry (not merely ECONNRESET as in the prior pass) —
  consistent with "temporarily unavailable" rather than permanently dead, but still not currently
  reachable. **Confidence: High** this specific host is down right now; **Low** on why / whether it's
  the canonical endpoint or a superseded mirror.
- The successor viewer `callejero.lorca.es/VisorWebGIS/` IS live (HTTP 200, actively-hashed Angular/
  webpack production build — `main.38bee0c2991783876208.js` etc., served from Apache Tomcat 9). It is
  **not** a dead legacy viewer; it is a currently-deployed commercial GIS product (the same
  `validationType` enum in its bundled JS lists tenants including `DiputacionMalaga`, i.e. this is a
  multi-municipality product, not Lorca-bespoke abandonware). **Confidence: High.**
- Direct inspection of the production JS bundle found the concrete parcel/point→ordinance query the
  research mandate was looking for:
  - A service base configured per-scenario as `widgets.urbr.url`, calling
    `{urbr.url}/urbanismoenredWS/FichaUrbanistica?X={x}&Y={y}&SRS=EPSG:4326&idAmbito={ambito}`
  - This is the "Urbanismo en Red" ficha-urbanística web service referenced by the 2011
    administracionbeta.blogspot.com writeup (still architecturally present in the 2026 codebase): a
    user clicks a point, the app resolves `idAmbito`, then requests a downloadable/renderable
    **Ficha Urbanística** for that point — classification, planning category, and soil qualification,
    per the original vendor description.
  - This is functionally the Lorca analogue of Cartagena's `Ficha/MAN` per-parcel query service.
  - **What was NOT verified**: the live value of `widgets.urbr.url` (it is populated at runtime from
    a tenant config — `config/webgis.json?token=...` / `config/layers.json?token=...` — which
    requires a session token obtained through normal app bootstrap that this research pass's tooling
    (WebFetch/curl, no headless browser) could not complete), so the endpoint was located in code but
    not fired end-to-end against a real coordinate. **Confidence: Medium-High that the mechanism is
    live and reachable through the running app; Low on exact current base URL/host without a browser
    session.**

**Legal**
- Modificación No. 84 is confirmed via press coverage (`el-lorquino.com`, `murcia.com`, June–July
  2026) as a **non-structural** reform updating PGMO article text (residential-use protection,
  economic-activity permissions, terrace/hostelería uses, agricultural modernization) — it does
  **not** alter zoning geometry. It was approved only as a preliminary "avance" by the Pleno in June
  2026 and was still in stakeholder-consultation stage as of July 2026 — **not yet definitively
  approved/published in BORM**. The founder's "actively maintained, same PGMO, not superseded"
  characterization is CONFIRMED, but "recent Modificación No. 84 updates" should be described as
  in-progress, not yet in force. **Confidence: High** (multiple independent press sources, consistent
  dates).
- Separately, `modificacionUA-84.asp` on the portal is an unrelated document — "UA-84" (Unidad de
  Actuación 84 cartography/refundido), not "Modificación nº 84." Do not conflate the two when citing
  sources. **Confidence: High.**

**Engineering**
- No downloadable SHP/DXF/GML/KMZ zoning layer was found published in the planning portal itself;
  the only bulk geometry sourcing path identified is the regional IDERM WMS/WFS (non-authoritative,
  see above) or manual digitization from the PDF plan sheets (`planos.asp` lists 8 "Cadastral Plans"
  and 7 "P.G.O.U. Revision/Adaptation ordering plans" sheets, likely PDF/raster, not vector).
  **Confidence: Medium** that no vector download exists — the portal's `enlaces.asp` and `planos.asp`
  pages were fully enumerated and neither lists one, but a hidden path off `sede.lorca.es`
  (e-government transparency portal / open-data catalogue) was not separately searched.

## D. Fastest implementation path

1. **Reuse the Murcia-capital rule-pack pattern directly** (`esMurciaEnvelope.ts` structure) —
   author `esLorcaEnvelope.ts` against `TOMO II/III NORMATIVA URBANISTICA` (already downloaded PDFs)
   for the direct-PGMO-computable share of parcels (Suelo Urbano Consolidado + Núcleos Rurales).
   This requires no new GIS integration — it is the same text-to-rule-pack authoring labor already
   proven for Murcia and (per the Cartagena research) Cartagena.
2. **Do NOT block V1 on the `urbanismoenredWS/FichaUrbanistica` service.** Treat it as a
   verification/QA aid (spot-check computed envelopes against the live ficha, the way Cartagena's
   `Ficha/MAN` was used), not as a live dependency — its current base URL/token flow needs a headless
   browser session to resolve, and `sit.lorca.es` (a possible alternate/legacy host for the same
   service) is presently 503.
3. **Open `Tomo IV. MEMORIA DE GESTION.pdf`** next (single highest-leverage unread document) to get
   the actual category/parcel-count breakdown and firm up the B coverage estimate before committing
   rule-pack authoring hours.
4. **Treat Unidades de Actuación / Sectores Urbanizables / Planes Parciales as out-of-scope for V1**
   coverage (return "requires derived plan" rather than a number), exactly the discipline already
   established by the C63 "refusal = correct answer ≠ envelope" principle — this is legally correct
   given the PGMO's own management volume already classifies them as delegated.
5. **Skip IDERM/SitMurcia integration** for authoritative geometry — confirmed same non-binding,
   1:5000, non-QA'd ceiling as already documented for the regional Murcia audit; useful only as a
   coarse pre-check/visual overlay, never as the geometry-of-record.

## E. Confidence summary

| Conclusion | Confidence |
|---|---|
| Lorca PGMO is active, not superseded (unlike Cartagena's nulled 2012 revision) | High |
| Modificación No. 84 is article-text-only, not geometry-changing | High |
| Modificación No. 84 is still pre-final-approval (avance stage, June–July 2026) | High |
| Management volume (Tomo IV) distinguishes direct vs. derived-plan land | Medium (structure confirmed, category/parcel counts not extracted) |
| A parcel/point→ordinance lookup mechanism EXISTS in the current live application | **Medium-High** (found in production JS as `urbanismoenredWS/FichaUrbanistica?X=&Y=&SRS=&idAmbito=`; not fired end-to-end) |
| That mechanism is reliably available for automation today | Low (base host uncertain; `sit.lorca.es` 503; token-gated config on the working host) |
| IDERM/SitMurcia regional layer is non-authoritative for Lorca, same as elsewhere in the region | High (verified via the dataset's own metadata disclaimer, Lorca explicitly named) |
| No downloadable vector (SHP/DXF/GML) zoning layer is published on the planning portal | Medium (portal pages fully enumerated; `sede.lorca.es` open-data catalogue not separately checked) |
| Coverage estimate (60–75% direct / 20–35% derived-plan) | Medium-Low (analogy-based, not from Lorca's own Tomo IV table) |

## Sources consulted

- https://urbanismo.lorca.es/mapa.asp, /enlaces.asp, /planGeneral.asp, /planos.asp,
  /modificacionUA-84.asp
- https://callejero.lorca.es/VisorWebGIS/ (live app; JS bundle
  `main.38bee0c2991783876208.js` inspected directly via curl for service endpoints)
- http://sit.lorca.es/Visor/ (HTTP 503 on retry)
- https://sitmurcia.carm.es / https://mapas-gis-inter.carm.es/geonetwork (IDERM metadata record
  `sit_usu_pla_urb_carm_v_clases_plu_ze_37mun_md`)
- http://administracionbeta.blogspot.com/2011/03/... and
  https://bibliotecalorca.wordpress.com/2011/04/05/visor-urbanistico-de-lorca/ (original
  "Urbanismo en Red" / SITLorca vendor description)
- Press: el-lorquino.com, murcia.com/lorca, cadena-azul.es (Modificación No. 84 coverage, June–July
  2026)
